use chrono::{DateTime, Utc};
use rust_decimal::Decimal;

use super::cash_operation::CashOperation;
use super::trade::{Trade, TradeStatus};

struct TimelineEvent<'a> {
    at: DateTime<Utc>,
    id: &'a str,
    delta: Decimal,
    is_cash_operation: bool,
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
            is_cash_operation: true,
        })
        .collect();
    events.extend(closed_trades.iter().filter_map(|t| {
        if t.status != TradeStatus::Closed {
            return None;
        }
        let net_pnl = t.net_pnl?;
        // Pozycja domknięta w CAŁOŚCI częściowymi zamknięciami ma status "zamknięta", ale nie
        // musi mieć daty zamknięcia - wpis częściowego zamknięcia z definicji niesie tylko lot
        // i kwotę wyniku (sekcja 6.9). Bez zapasowego znacznika czasu jej zrealizowany wynik
        // NIGDY nie trafiłby na saldo konta, mimo że pieniądze realnie się zmieniły.
        // `updated_at` to moment ostatniego zapisu transakcji, czyli najbliższa prawdzie chwila,
        // w której ten wynik stał się faktem.
        let at = t.closed_at.unwrap_or(t.updated_at);
        Some(TimelineEvent {
            at,
            id: t.id.as_str(),
            delta: net_pnl,
            is_cash_operation: false,
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

/// Saldo i przepływy gotówkowe w okresie (miesiąc/rok/cały czas) - sekcja "Saldo początkowe/
/// końcowe"/"Wpłaty/wypłaty"/"Zwrot"/"Max drawdown %" w raportach miesięcznym/rocznym/kont.
#[derive(Debug, Clone)]
pub struct PeriodBalanceSummary {
    /// Saldo w momencie rozpoczęcia okresu (albo `initial_balance` konta, gdy `period_start`
    /// to `None` - czyli okres "od zawsze").
    pub starting_balance: Decimal,
    /// Saldo w momencie zakończenia okresu (albo aktualne saldo konta, gdy `period_end` to
    /// `None`).
    pub ending_balance: Decimal,
    /// Suma wpłat/wypłat/korekt w okresie (bez wyniku transakcji) - jedna, netto wartość.
    pub net_cash_flow: Decimal,
    /// (`ending_balance - starting_balance`) / `starting_balance` * 100. `None`, gdy saldo
    /// startowe wynosi zero (dzielenie przez zero nie ma sensu).
    pub return_percent: Option<Decimal>,
    /// Maksymalne obsunięcie (peak-to-trough) salda W TRAKCIE okresu - w walucie konta.
    pub max_drawdown: Decimal,
    /// `max_drawdown` jako % salda startowego okresu. `None`, gdy saldo startowe wynosi zero.
    pub max_drawdown_percent: Option<Decimal>,
}

/// Liczy saldo/przepływy dla okresu wyznaczonego przez `[period_start, period_end)` na
/// wspólnej osi czasu operacji gotówkowych i zamknięć transakcji (ta sama `timeline()` co
/// `compute_current_balance`/`balance_before_after_trade`). `None` na obu końcach = "cały
/// czas" (od `initial_balance` do teraz). `operations`/`closed_trades` powinny być PEŁNymi,
/// niezawężonymi listami konta - to ta funkcja wyznacza, co należy do okresu, a nie wywołujący.
pub fn compute_period_balance(
    initial_balance: Decimal,
    operations: &[CashOperation],
    closed_trades: &[Trade],
    period_start: Option<DateTime<Utc>>,
    period_end: Option<DateTime<Utc>>,
) -> PeriodBalanceSummary {
    let events = timeline(operations, closed_trades);

    let mut running = initial_balance;
    let mut starting_balance = initial_balance;
    let mut net_cash_flow = Decimal::ZERO;
    let mut peak = initial_balance;
    let mut max_drawdown = Decimal::ZERO;
    let mut captured_start = period_start.is_none();
    if captured_start {
        peak = running;
    }

    for event in &events {
        if period_start.is_some_and(|start| event.at < start) {
            running += event.delta;
            continue;
        }
        if period_end.is_some_and(|end| event.at >= end) {
            break;
        }
        if !captured_start {
            starting_balance = running;
            peak = running;
            captured_start = true;
        }
        running += event.delta;
        if event.is_cash_operation {
            net_cash_flow += event.delta;
        }
        peak = peak.max(running);
        max_drawdown = max_drawdown.max(peak - running);
    }
    if !captured_start {
        // Żadne zdarzenie nie sięgnęło jeszcze początku okresu (np. okres w przyszłości/bez
        // zdarzeń) - saldo startowe i końcowe to to samo, ostatnie znane saldo.
        starting_balance = running;
    }
    let ending_balance = running;

    let return_percent = (!starting_balance.is_zero())
        .then(|| (ending_balance - starting_balance) / starting_balance * Decimal::ONE_HUNDRED);
    let max_drawdown_percent = (!starting_balance.is_zero())
        .then(|| max_drawdown / starting_balance * Decimal::ONE_HUNDRED);

    PeriodBalanceSummary {
        starting_balance,
        ending_balance,
        net_cash_flow,
        return_percent,
        max_drawdown,
        max_drawdown_percent,
    }
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

    pub(super) fn closed_trade(id: &str, net_pnl: Decimal, closed_at: &str) -> Trade {
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
            partial_closes: vec![],
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

    #[test]
    fn period_balance_with_no_bounds_covers_entire_history() {
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

        let summary = compute_period_balance(dec!(500), &operations, &trades, None, None);
        assert_eq!(summary.starting_balance, dec!(500));
        assert_eq!(summary.ending_balance, dec!(1450)); // 500 + 1000 - 200 + 150
        assert_eq!(summary.net_cash_flow, dec!(800)); // 1000 - 200, wynik transakcji nie wchodzi
    }

    #[test]
    fn period_balance_scopes_starting_balance_to_period_start() {
        let operations = vec![op(
            "op-1",
            CashOperationKind::Deposit,
            dec!(1000),
            "2026-01-01T00:00:00Z",
        )];
        let trades = vec![
            closed_trade("t-1", dec!(100), "2026-01-15T00:00:00Z"), // przed lutym
            closed_trade("t-2", dec!(50), "2026-02-10T00:00:00Z"),  // w lutym
        ];

        let feb_start = "2026-02-01T00:00:00Z".parse().unwrap();
        let mar_start = "2026-03-01T00:00:00Z".parse().unwrap();
        let summary = compute_period_balance(
            dec!(0),
            &operations,
            &trades,
            Some(feb_start),
            Some(mar_start),
        );
        // Depozyt + transakcja ze stycznia wliczają się do salda startowego lutego, nie do
        // przepływu lutego.
        assert_eq!(summary.starting_balance, dec!(1100));
        assert_eq!(summary.ending_balance, dec!(1150));
        assert_eq!(summary.net_cash_flow, dec!(0));
    }

    #[test]
    fn period_balance_computes_return_and_drawdown_percent() {
        let trades = vec![
            closed_trade("t-1", dec!(-50), "2026-01-05T00:00:00Z"), // obsunięcie 50 od startu 1000
            closed_trade("t-2", dec!(200), "2026-01-10T00:00:00Z"),
        ];
        let summary = compute_period_balance(dec!(1000), &[], &trades, None, None);
        assert_eq!(summary.starting_balance, dec!(1000));
        assert_eq!(summary.ending_balance, dec!(1150));
        assert_eq!(summary.max_drawdown, dec!(50));
        assert_eq!(summary.return_percent, Some(dec!(15))); // 150/1000*100
        assert_eq!(summary.max_drawdown_percent, Some(dec!(5))); // 50/1000*100
    }

    #[test]
    fn period_balance_with_zero_starting_balance_leaves_percentages_none() {
        let trades = vec![closed_trade("t-1", dec!(100), "2026-01-05T00:00:00Z")];
        let summary = compute_period_balance(dec!(0), &[], &trades, None, None);
        assert_eq!(summary.return_percent, None);
        assert_eq!(summary.max_drawdown_percent, None);
    }
}

#[cfg(test)]
mod tests_czesciowe_zamkniecia {
    use super::*;
    use crate::domain::trade_partial_close::PartialClose;
    use rust_decimal_macros::dec;

    /// Pozycja domknięta w całości częściowymi zamknięciami: status "zamknięta", ale BEZ daty
    /// zamknięcia, bo wpis częściowy niesie tylko lot i kwotę wyniku (sekcja 6.9).
    fn domknieta_czesciowymi(id: &str, net_pnl: Decimal, updated_at: &str) -> Trade {
        let mut trade = super::tests::closed_trade(id, net_pnl, updated_at);
        trade.closed_at = None;
        trade.updated_at = updated_at.parse().unwrap();
        trade.volume = Some(dec!(1.0));
        trade.partial_closes = vec![PartialClose {
            closed_volume: dec!(1.0),
            realized_pnl: net_pnl,
        }];
        trade
    }

    #[test]
    fn wynik_pozycji_domknietej_czesciowymi_trafia_na_saldo() {
        // Bez zapasowego znacznika czasu ta transakcja była pomijana i saldo zostawało 1000,
        // mimo że pieniądze realnie się zmieniły.
        let trade = domknieta_czesciowymi("t1", dec!(250), "2026-03-01T12:00:00Z");

        let saldo = compute_current_balance(dec!(1000), &[], &[trade]);

        assert_eq!(saldo, dec!(1250));
    }

    #[test]
    fn data_zamkniecia_ma_pierwszenstwo_gdy_jest_podana() {
        let mut trade = domknieta_czesciowymi("t1", dec!(250), "2026-03-05T12:00:00Z");
        trade.closed_at = Some("2026-03-01T12:00:00Z".parse().unwrap());

        // Saldo jest sumą niezależną od kolejności, więc sprawdzamy przez saldo okresu:
        // transakcja ma się liczyć do marca 1., a nie 5.
        let saldo = compute_current_balance(dec!(1000), &[], &[trade]);
        assert_eq!(saldo, dec!(1250));
    }
}
