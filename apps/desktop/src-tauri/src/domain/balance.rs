use chrono::{DateTime, Utc};
use rust_decimal::Decimal;

use super::cash_operation::CashOperation;
use super::trade::{Trade, TradeStatus};

struct TimelineEvent<'a> {
    at: DateTime<Utc>,
    id: &'a str,
    delta: Decimal,
}

fn timeline<'a>(
    operations: &'a [CashOperation],
    closed_trades: &'a [Trade],
) -> Vec<TimelineEvent<'a>> {
    let mut events: Vec<TimelineEvent> = operations
        .iter()
        .map(|op| TimelineEvent {
            at: op.occurred_at,
            id: op.id.as_str(),
            delta: op.signed_amount(),
        })
        .collect();
    events.extend(closed_trades.iter().filter_map(|t| {
        if t.status != TradeStatus::Closed {
            return None;
        }
        let closed_at = t.closed_at?;
        let net_pnl = t.net_pnl?;
        Some(TimelineEvent {
            at: closed_at,
            id: t.id.as_str(),
            delta: net_pnl,
        })
    }));
    events.sort_by(|a, b| a.at.cmp(&b.at).then_with(|| a.id.cmp(b.id)));
    events
}

/// Saldo konta = początkowe + wpłaty/wypłaty/korekty + suma netto zamkniętych transakcji
/// (transakcje w koszu i niezamknięte nie wpływają na saldo). Jedyne autorytatywne miejsce
/// tego wyliczenia (sekcja 7 specyfikacji) - frontend nigdy nie liczy salda samodzielnie.
pub fn compute_current_balance(
    initial_balance: Decimal,
    operations: &[CashOperation],
    closed_trades: &[Trade],
) -> Decimal {
    timeline(operations, closed_trades)
        .iter()
        .fold(initial_balance, |balance, event| balance + event.delta)
}

/// Saldo przed/po konkretnej transakcji: łączy operacje gotówkowe i zamknięte transakcje w
/// jedną chronologiczną oś (wg occurred_at/closed_at, remis rozstrzygany po id dla
/// deterministycznej kolejności zdarzeń z identycznym znacznikiem czasu), licząc narastające
/// saldo. Transakcja otwarta/szkic albo nieznaleziona na osi (bo jeszcze nie zamknięta) nie ma
/// jeszcze wpływu na saldo - przed i po są wtedy równe aktualnemu saldu na koniec osi.
pub fn balance_before_after_trade(
    initial_balance: Decimal,
    operations: &[CashOperation],
    closed_trades: &[Trade],
    trade_id: &str,
) -> (Decimal, Decimal) {
    let events = timeline(operations, closed_trades);
    let mut running = initial_balance;
    for event in &events {
        let before = running;
        running += event.delta;
        if event.id == trade_id {
            return (before, running);
        }
    }
    (running, running)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::cash_operation::CashOperationKind;
    use crate::domain::trade::{PnlSource, TradeSide};
    use chrono::TimeZone;
    use rust_decimal_macros::dec;

    fn op(id: &str, kind: CashOperationKind, amount: Decimal, at: &str) -> CashOperation {
        CashOperation {
            id: id.to_string(),
            account_id: "acc-1".to_string(),
            kind,
            amount,
            occurred_at: at.parse().unwrap(),
            note: None,
            created_at: at.parse().unwrap(),
        }
    }

    fn closed_trade(id: &str, net_pnl: Decimal, closed_at: &str) -> Trade {
        Trade {
            id: id.to_string(),
            account_id: "acc-1".to_string(),
            display_number: 1,
            instrument_id: None,
            instrument_spec_snapshot: None,
            strategy_id: None,
            strategy_snapshot: None,
            status: TradeStatus::Closed,
            side: TradeSide::Buy,
            opened_at: Some(closed_at.parse().unwrap()),
            closed_at: Some(closed_at.parse().unwrap()),
            interval_id: None,
            interval: None,
            session: None,
            volume: None,
            entry_price: None,
            stop_loss: None,
            take_profit: None,
            exit_price: None,
            commission: dec!(0),
            swap: dec!(0),
            other_fees: dec!(0),
            conversion_rate: None,
            gross_pnl: Some(net_pnl),
            net_pnl: Some(net_pnl),
            pnl_points: None,
            pnl_percent: None,
            pnl_r: None,
            risk_amount: None,
            risk_percent: None,
            plan_before: None,
            management_notes: None,
            post_trade_summary: None,
            conclusion: None,
            tags: vec![],
            plan_adherence_rating: None,
            pnl_source: PnlSource::Auto,
            pnl_override_reason: None,
            emotions: None,
            checklist: None,
            created_at: Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
            updated_at: Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
            deleted_at: None,
        }
    }

    #[test]
    fn current_balance_combines_initial_operations_and_closed_trades() {
        let operations = vec![
            op(
                "op-1",
                CashOperationKind::Deposit,
                dec!(1000),
                "2026-01-01T00:00:00Z",
            ),
            op(
                "op-2",
                CashOperationKind::Withdrawal,
                dec!(200),
                "2026-01-05T00:00:00Z",
            ),
        ];
        let trades = vec![closed_trade("t-1", dec!(150), "2026-01-03T00:00:00Z")];

        let balance = compute_current_balance(dec!(500), &operations, &trades);
        assert_eq!(balance, dec!(1450)); // 500 + 1000 - 200 + 150
    }

    #[test]
    fn open_and_deleted_trades_never_affect_balance() {
        let mut open_trade = closed_trade("t-open", dec!(9999), "2026-01-03T00:00:00Z");
        open_trade.status = TradeStatus::Open;
        open_trade.net_pnl = None;

        let balance = compute_current_balance(dec!(100), &[], std::slice::from_ref(&open_trade));
        assert_eq!(balance, dec!(100));
    }

    #[test]
    fn balance_before_after_reflects_chronological_position_not_list_order() {
        let operations = vec![op(
            "op-1",
            CashOperationKind::Deposit,
            dec!(1000),
            "2026-01-01T00:00:00Z",
        )];
        // Listed out of chronological order on purpose - the function must sort by `at`.
        let trades = vec![
            closed_trade("t-2", dec!(-100), "2026-01-10T00:00:00Z"),
            closed_trade("t-1", dec!(200), "2026-01-05T00:00:00Z"),
        ];

        let (before, after) = balance_before_after_trade(dec!(0), &operations, &trades, "t-1");
        assert_eq!(before, dec!(1000));
        assert_eq!(after, dec!(1200));

        let (before2, after2) = balance_before_after_trade(dec!(0), &operations, &trades, "t-2");
        assert_eq!(before2, dec!(1200));
        assert_eq!(after2, dec!(1100));
    }

    #[test]
    fn balance_before_after_for_trade_not_yet_closed_equals_current_balance() {
        let operations = vec![op(
            "op-1",
            CashOperationKind::Deposit,
            dec!(500),
            "2026-01-01T00:00:00Z",
        )];
        let (before, after) =
            balance_before_after_trade(dec!(0), &operations, &[], "not-closed-yet");
        assert_eq!(before, dec!(500));
        assert_eq!(after, dec!(500));
    }

    #[test]
    fn identical_timestamps_are_tie_broken_deterministically_by_id() {
        let trades = vec![
            closed_trade("b", dec!(10), "2026-01-01T00:00:00Z"),
            closed_trade("a", dec!(20), "2026-01-01T00:00:00Z"),
        ];
        // "a" sorts before "b" lexicographically, so it must apply first regardless of list order.
        let (before_a, after_a) = balance_before_after_trade(dec!(0), &[], &trades, "a");
        assert_eq!(before_a, dec!(0));
        assert_eq!(after_a, dec!(20));

        let (before_b, after_b) = balance_before_after_trade(dec!(0), &[], &trades, "b");
        assert_eq!(before_b, dec!(20));
        assert_eq!(after_b, dec!(30));
    }
}
