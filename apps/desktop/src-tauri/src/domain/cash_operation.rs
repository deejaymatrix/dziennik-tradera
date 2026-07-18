use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CashOperationKind {
    Deposit,
    Withdrawal,
    Adjustment,
}

impl CashOperationKind {
    pub fn as_db_str(self) -> &'static str {
        match self {
            CashOperationKind::Deposit => "deposit",
            CashOperationKind::Withdrawal => "withdrawal",
            CashOperationKind::Adjustment => "adjustment",
        }
    }

    pub fn from_db_str(value: &str) -> Option<Self> {
        match value {
            "deposit" => Some(Self::Deposit),
            "withdrawal" => Some(Self::Withdrawal),
            "adjustment" => Some(Self::Adjustment),
            _ => None,
        }
    }
}

/// Wpływ operacji na saldo: wpłata dodaje kwotę, wypłata odejmuje (kwota zawsze
/// wprowadzana jako wartość dodatnia), korekta stosuje kwotę wprost ze znakiem
/// (może zmniejszać lub zwiększać saldo).
fn signed_contribution(kind: CashOperationKind, amount: Decimal) -> Decimal {
    match kind {
        CashOperationKind::Deposit => amount,
        CashOperationKind::Withdrawal => -amount,
        CashOperationKind::Adjustment => amount,
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct CashOperation {
    pub id: String,
    pub account_id: String,
    pub kind: CashOperationKind,
    pub amount: Decimal,
    pub occurred_at: DateTime<Utc>,
    pub note: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl CashOperation {
    pub fn signed_amount(&self) -> Decimal {
        signed_contribution(self.kind, self.amount)
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewCashOperation {
    pub account_id: String,
    pub kind: CashOperationKind,
    pub amount: Decimal,
    pub occurred_at: DateTime<Utc>,
    pub note: Option<String>,
}

impl NewCashOperation {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.account_id.trim().is_empty() {
            return Err(AppError::Validation("Konto jest wymagane.".to_string()));
        }
        match self.kind {
            CashOperationKind::Adjustment => {
                if self.amount.is_zero() {
                    return Err(AppError::Validation(
                        "Kwota korekty nie może być zerowa.".to_string(),
                    ));
                }
            }
            CashOperationKind::Deposit | CashOperationKind::Withdrawal => {
                if self.amount.is_sign_negative() || self.amount.is_zero() {
                    return Err(AppError::Validation(
                        "Kwota wpłaty/wypłaty musi być liczbą dodatnią.".to_string(),
                    ));
                }
            }
        }
        Ok(())
    }
}

/// Saldo konta = saldo początkowe + suma wpłat - suma wypłat +/- korekty. Jedyne
/// autorytatywne miejsce tego wyliczenia (sekcja 7 specyfikacji) - frontend nigdy
/// nie liczy salda samodzielnie.
pub fn compute_balance(initial_balance: Decimal, operations: &[CashOperation]) -> Decimal {
    operations
        .iter()
        .fold(initial_balance, |balance, op| balance + op.signed_amount())
}

pub trait CashOperationRepository {
    fn create(&self, input: &NewCashOperation) -> Result<CashOperation, AppError>;
    fn list_for_account(&self, account_id: &str) -> Result<Vec<CashOperation>, AppError>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    fn operation(kind: CashOperationKind, amount: Decimal) -> CashOperation {
        CashOperation {
            id: "op".to_string(),
            account_id: "acc".to_string(),
            kind,
            amount,
            occurred_at: Utc::now(),
            note: None,
            created_at: Utc::now(),
        }
    }

    #[test]
    fn rejects_zero_amount_deposit() {
        let input = NewCashOperation {
            account_id: "acc".to_string(),
            kind: CashOperationKind::Deposit,
            amount: dec!(0),
            occurred_at: Utc::now(),
            note: None,
        };
        assert!(input.validate().is_err());
    }

    #[test]
    fn rejects_negative_withdrawal_amount() {
        let input = NewCashOperation {
            account_id: "acc".to_string(),
            kind: CashOperationKind::Withdrawal,
            amount: dec!(-50),
            occurred_at: Utc::now(),
            note: None,
        };
        assert!(input.validate().is_err());
    }

    #[test]
    fn allows_negative_adjustment() {
        let input = NewCashOperation {
            account_id: "acc".to_string(),
            kind: CashOperationKind::Adjustment,
            amount: dec!(-25),
            occurred_at: Utc::now(),
            note: Some("korekta błędu".to_string()),
        };
        assert!(input.validate().is_ok());
    }

    #[test]
    fn rejects_zero_adjustment() {
        let input = NewCashOperation {
            account_id: "acc".to_string(),
            kind: CashOperationKind::Adjustment,
            amount: dec!(0),
            occurred_at: Utc::now(),
            note: None,
        };
        assert!(input.validate().is_err());
    }

    #[test]
    fn computes_balance_from_initial_plus_operations() {
        let ops = vec![
            operation(CashOperationKind::Deposit, dec!(1000)),
            operation(CashOperationKind::Withdrawal, dec!(200)),
            operation(CashOperationKind::Adjustment, dec!(-50)),
            operation(CashOperationKind::Adjustment, dec!(10)),
        ];
        let balance = compute_balance(dec!(5000), &ops);
        // 5000 + 1000 - 200 - 50 + 10 = 5760
        assert_eq!(balance, dec!(5760));
    }

    #[test]
    fn balance_with_no_operations_equals_initial_balance() {
        assert_eq!(compute_balance(dec!(1234.56), &[]), dec!(1234.56));
    }
}
