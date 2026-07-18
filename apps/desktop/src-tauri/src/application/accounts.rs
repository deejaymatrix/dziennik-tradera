use std::sync::Arc;

use rust_decimal::Decimal;
use serde::Serialize;

use crate::domain::account::{Account, AccountRepository, NewAccount, UpdateAccount};
use crate::domain::cash_operation::{
    compute_balance, CashOperation, CashOperationRepository, NewCashOperation,
};
use crate::error::AppError;

#[derive(Debug, Clone, Serialize)]
pub struct AccountWithBalance {
    #[serde(flatten)]
    pub account: Account,
    pub balance: Decimal,
}

/// Warstwa aplikacyjna: to, co widzą komendy Tauri. Nie zna SQLite ani Reacta - operuje
/// wyłącznie na abstrakcjach z warstwy domenowej. Łączy konta z operacjami finansowymi,
/// żeby saldo zawsze pochodziło z jednego, autorytatywnego wyliczenia (sekcja 7).
pub struct AccountsService {
    accounts: Arc<dyn AccountRepository + Send + Sync>,
    cash_operations: Arc<dyn CashOperationRepository + Send + Sync>,
}

impl AccountsService {
    pub fn new(
        accounts: Arc<dyn AccountRepository + Send + Sync>,
        cash_operations: Arc<dyn CashOperationRepository + Send + Sync>,
    ) -> Self {
        Self {
            accounts,
            cash_operations,
        }
    }

    fn with_balance(&self, account: Account) -> Result<AccountWithBalance, AppError> {
        let operations = self.cash_operations.list_for_account(&account.id)?;
        let balance = compute_balance(account.initial_balance, &operations);
        Ok(AccountWithBalance { account, balance })
    }

    pub fn create(&self, input: NewAccount) -> Result<AccountWithBalance, AppError> {
        let account = self.accounts.create(&input)?;
        self.with_balance(account)
    }

    pub fn get(&self, id: &str) -> Result<AccountWithBalance, AppError> {
        let account = self.accounts.get(id)?;
        self.with_balance(account)
    }

    pub fn list(&self, include_archived: bool) -> Result<Vec<AccountWithBalance>, AppError> {
        self.accounts
            .list(include_archived)?
            .into_iter()
            .map(|account| self.with_balance(account))
            .collect()
    }

    pub fn update(&self, id: &str, input: UpdateAccount) -> Result<AccountWithBalance, AppError> {
        let account = self.accounts.update(id, &input)?;
        self.with_balance(account)
    }

    pub fn archive(&self, id: &str) -> Result<AccountWithBalance, AppError> {
        let account = self.accounts.archive(id)?;
        self.with_balance(account)
    }

    pub fn restore(&self, id: &str) -> Result<AccountWithBalance, AppError> {
        let account = self.accounts.restore(id)?;
        self.with_balance(account)
    }

    pub fn add_cash_operation(&self, input: NewCashOperation) -> Result<CashOperation, AppError> {
        self.cash_operations.create(&input)
    }

    pub fn list_cash_operations(&self, account_id: &str) -> Result<Vec<CashOperation>, AppError> {
        self.cash_operations.list_for_account(account_id)
    }
}
