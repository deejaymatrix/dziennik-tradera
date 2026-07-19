use std::collections::BTreeMap;
use std::collections::HashMap;

use chrono::{DateTime, NaiveDate, Utc};
use rust_decimal::Decimal;
use serde::Serialize;

use super::trade::{Trade, TradeStatus};

/// Zamknięta, nieusunięta transakcja z policzonym wynikiem netto - jedyny kształt, na którym
/// liczą się statystyki/krzywa kapitału/kalendarz/rozbicia poniżej. Draft/open oraz transakcje
/// bez `net_pnl` (np. szkic bez ceny wyjścia) celowo nie wchodzą do żadnej z tych analiz - nie
/// ma tam jeszcze zrealizowanego wyniku do policzenia.
fn realized_trades(trades: &[Trade]) -> Vec<&Trade> {
    trades
        .iter()
        .filter(|t| {
            t.deleted_at.is_none() && t.status == TradeStatus::Closed && t.net_pnl.is_some()
        })
        .collect()
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct TradeStats {
    pub total_trades: i64,
    pub open_trades: i64,
    pub draft_trades: i64,
    pub closed_trades: i64,
    pub win_count: i64,
    pub loss_count: i64,
    pub breakeven_count: i64,
    pub win_rate: Option<Decimal>,
    pub gross_profit: Decimal,
    pub gross_loss: Decimal,
    pub net_pnl: Decimal,
    pub profit_factor: Option<Decimal>,
    pub expectancy: Option<Decimal>,
    pub average_win: Option<Decimal>,
    pub average_loss: Option<Decimal>,
    pub average_r: Option<Decimal>,
    pub best_trade: Option<Decimal>,
    pub worst_trade: Option<Decimal>,
}

/// Statystyki dashboardu - liczone raz, w Rust, z Decimal (nigdy we frontendzie). `trades`
/// powinno być pełną listą nieusuniętych transakcji konta (dowolny status) - funkcja sama
/// zawęża do zrealizowanych tam, gdzie to ma sens (wygrane/przegrane, profit factor itd.).
pub fn compute_stats(trades: &[Trade]) -> TradeStats {
    let mut stats = TradeStats::default();

    for trade in trades.iter().filter(|t| t.deleted_at.is_none()) {
        stats.total_trades += 1;
        match trade.status {
            TradeStatus::Draft => stats.draft_trades += 1,
            TradeStatus::Open => stats.open_trades += 1,
            TradeStatus::Closed => stats.closed_trades += 1,
        }
    }

    let realized = realized_trades(trades);
    let mut r_sum = Decimal::ZERO;
    let mut r_count: i64 = 0;

    for trade in &realized {
        let net_pnl = trade.net_pnl.expect("realized_trades gwarantuje Some");
        stats.net_pnl += net_pnl;
        if net_pnl.is_sign_positive() && !net_pnl.is_zero() {
            stats.win_count += 1;
            stats.gross_profit += net_pnl;
        } else if net_pnl.is_sign_negative() {
            stats.loss_count += 1;
            stats.gross_loss += net_pnl.abs();
        } else {
            stats.breakeven_count += 1;
        }
        if let Some(r) = trade.pnl_r {
            r_sum += r;
            r_count += 1;
        }
    }

    let decided = stats.win_count + stats.loss_count;
    if decided > 0 {
        stats.win_rate =
            Some(Decimal::from(stats.win_count) / Decimal::from(decided) * Decimal::ONE_HUNDRED);
    }
    if !stats.gross_loss.is_zero() {
        stats.profit_factor = Some(stats.gross_profit / stats.gross_loss);
    }
    if stats.win_count > 0 {
        stats.average_win = Some(stats.gross_profit / Decimal::from(stats.win_count));
    }
    if stats.loss_count > 0 {
        stats.average_loss = Some(stats.gross_loss / Decimal::from(stats.loss_count));
    }
    if !realized.is_empty() {
        stats.expectancy = Some(stats.net_pnl / Decimal::from(realized.len() as i64));
        stats.best_trade = realized.iter().filter_map(|t| t.net_pnl).max();
        stats.worst_trade = realized.iter().filter_map(|t| t.net_pnl).min();
    }
    if r_count > 0 {
        stats.average_r = Some(r_sum / Decimal::from(r_count));
    }

    stats
}

#[derive(Debug, Clone, Serialize)]
pub struct EquityPoint {
    pub closed_at: DateTime<Utc>,
    pub net_pnl: Decimal,
    pub cumulative_net_pnl: Decimal,
}

/// Krzywa kapitału: skumulowany wynik netto w kolejności zamykania pozycji.
pub fn compute_equity_curve(trades: &[Trade]) -> Vec<EquityPoint> {
    let mut realized = realized_trades(trades);
    realized.sort_by_key(|t| t.closed_at);

    let mut cumulative = Decimal::ZERO;
    realized
        .into_iter()
        .filter_map(|t| {
            let closed_at = t.closed_at?;
            let net_pnl = t.net_pnl?;
            cumulative += net_pnl;
            Some(EquityPoint {
                closed_at,
                net_pnl,
                cumulative_net_pnl: cumulative,
            })
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
pub struct DailyPnl {
    pub date: NaiveDate,
    pub net_pnl: Decimal,
    pub trade_count: i64,
}

/// Agregacja dzienna do widoku kalendarza - jeden wpis na dzień, w którym zamknięto choć jedną
/// transakcję, posortowane rosnąco po dacie (`BTreeMap` daje to za darmo).
pub fn compute_calendar(trades: &[Trade]) -> Vec<DailyPnl> {
    let mut by_day: BTreeMap<NaiveDate, (Decimal, i64)> = BTreeMap::new();

    for trade in realized_trades(trades) {
        let Some(closed_at) = trade.closed_at else {
            continue;
        };
        let Some(net_pnl) = trade.net_pnl else {
            continue;
        };
        let entry = by_day.entry(closed_at.date_naive()).or_default();
        entry.0 += net_pnl;
        entry.1 += 1;
    }

    by_day
        .into_iter()
        .map(|(date, (net_pnl, trade_count))| DailyPnl {
            date,
            net_pnl,
            trade_count,
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
pub struct GroupBreakdown {
    pub key: String,
    pub label: String,
    pub trade_count: i64,
    pub win_count: i64,
    pub loss_count: i64,
    pub win_rate: Option<Decimal>,
    pub net_pnl: Decimal,
}

struct GroupAccumulator {
    label: String,
    trade_count: i64,
    win_count: i64,
    loss_count: i64,
    net_pnl: Decimal,
}

fn compute_breakdown<'a, F>(trades: &'a [Trade], group_of: F) -> Vec<GroupBreakdown>
where
    F: Fn(&'a Trade) -> (String, String),
{
    let mut groups: HashMap<String, GroupAccumulator> = HashMap::new();

    for trade in realized_trades(trades) {
        let net_pnl = trade.net_pnl.expect("realized_trades gwarantuje Some");
        let (key, label) = group_of(trade);
        let entry = groups.entry(key).or_insert_with(|| GroupAccumulator {
            label,
            trade_count: 0,
            win_count: 0,
            loss_count: 0,
            net_pnl: Decimal::ZERO,
        });
        entry.trade_count += 1;
        entry.net_pnl += net_pnl;
        if net_pnl.is_sign_positive() && !net_pnl.is_zero() {
            entry.win_count += 1;
        } else if net_pnl.is_sign_negative() {
            entry.loss_count += 1;
        }
    }

    let mut result: Vec<GroupBreakdown> = groups
        .into_iter()
        .map(|(key, acc)| {
            let decided = acc.win_count + acc.loss_count;
            GroupBreakdown {
                key,
                label: acc.label,
                trade_count: acc.trade_count,
                win_count: acc.win_count,
                loss_count: acc.loss_count,
                win_rate: (decided > 0).then(|| {
                    Decimal::from(acc.win_count) / Decimal::from(decided) * Decimal::ONE_HUNDRED
                }),
                net_pnl: acc.net_pnl,
            }
        })
        .collect();
    result.sort_by_key(|g| std::cmp::Reverse(g.net_pnl));
    result
}

pub fn compute_strategy_breakdown(trades: &[Trade]) -> Vec<GroupBreakdown> {
    compute_breakdown(trades, |t| match &t.strategy_snapshot {
        Some(snapshot) => (snapshot.strategy_id.clone(), snapshot.name.clone()),
        None => ("none".to_string(), "Bez strategii".to_string()),
    })
}

pub fn compute_instrument_breakdown(trades: &[Trade]) -> Vec<GroupBreakdown> {
    compute_breakdown(trades, |t| {
        match (&t.instrument_id, &t.instrument_spec_snapshot) {
            (Some(id), Some(snapshot)) => (id.clone(), snapshot.display_symbol.clone()),
            _ => ("none".to_string(), "Bez instrumentu".to_string()),
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::instrument::InstrumentSnapshot;
    use crate::domain::strategy::StrategySnapshot;
    use crate::domain::trade::{PnlSource, TradeSide};
    use chrono::Duration;
    use rust_decimal_macros::dec;

    fn base_trade(id: &str) -> Trade {
        Trade {
            id: id.to_string(),
            account_id: "acc-1".to_string(),
            display_number: 1,
            instrument_id: None,
            instrument_spec_snapshot: None,
            strategy_id: None,
            strategy_snapshot: None,
            status: TradeStatus::Draft,
            side: TradeSide::Buy,
            opened_at: None,
            closed_at: None,
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
            gross_pnl: None,
            net_pnl: None,
            pnl_points: None,
            pnl_percent: None,
            pnl_r: None,
            risk_amount: None,
            risk_percent: None,
            plan_before: None,
            management_notes: None,
            post_trade_summary: None,
            conclusion: None,
            tags: Vec::new(),
            plan_adherence_rating: None,
            pnl_source: PnlSource::Auto,
            pnl_override_reason: None,
            emotions: None,
            checklist: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            deleted_at: None,
        }
    }

    fn closed_trade(id: &str, days_ago: i64, net_pnl: Decimal, pnl_r: Option<Decimal>) -> Trade {
        Trade {
            status: TradeStatus::Closed,
            closed_at: Some(Utc::now() - Duration::days(days_ago)),
            net_pnl: Some(net_pnl),
            pnl_r,
            ..base_trade(id)
        }
    }

    #[test]
    fn stats_count_trades_by_status() {
        let trades = vec![
            base_trade("1"),
            Trade {
                status: TradeStatus::Open,
                ..base_trade("2")
            },
            closed_trade("4", 1, dec!(100), Some(dec!(1))),
        ];
        let stats = compute_stats(&trades);
        assert_eq!(stats.total_trades, 3);
        assert_eq!(stats.draft_trades, 1);
        assert_eq!(stats.open_trades, 1);
        assert_eq!(stats.closed_trades, 1);
    }

    #[test]
    fn win_rate_and_profit_factor_from_wins_and_losses() {
        let trades = vec![
            closed_trade("1", 3, dec!(100), Some(dec!(1))),
            closed_trade("2", 2, dec!(200), Some(dec!(2))),
            closed_trade("3", 1, dec!(-50), Some(dec!(-1))),
        ];
        let stats = compute_stats(&trades);
        assert_eq!(stats.win_count, 2);
        assert_eq!(stats.loss_count, 1);
        assert_eq!(
            stats.win_rate,
            Some(Decimal::from(2) / Decimal::from(3) * Decimal::ONE_HUNDRED)
        );
        assert_eq!(stats.gross_profit, dec!(300));
        assert_eq!(stats.gross_loss, dec!(50));
        assert_eq!(stats.net_pnl, dec!(250));
        assert_eq!(stats.profit_factor, Some(dec!(6)));
        assert_eq!(stats.average_win, Some(dec!(150)));
        assert_eq!(stats.average_loss, Some(dec!(50)));
        assert_eq!(stats.expectancy, Some(dec!(250) / dec!(3)));
        assert_eq!(stats.best_trade, Some(dec!(200)));
        assert_eq!(stats.worst_trade, Some(dec!(-50)));
        assert_eq!(
            stats.average_r,
            Some((dec!(1) + dec!(2) + dec!(-1)) / dec!(3))
        );
    }

    #[test]
    fn no_realized_trades_leaves_optional_stats_empty() {
        let trades = vec![base_trade("1")];
        let stats = compute_stats(&trades);
        assert_eq!(stats.win_rate, None);
        assert_eq!(stats.profit_factor, None);
        assert_eq!(stats.expectancy, None);
        assert_eq!(stats.net_pnl, dec!(0));
    }

    #[test]
    fn deleted_trades_are_excluded_from_stats() {
        let mut deleted = closed_trade("1", 1, dec!(1000), None);
        deleted.deleted_at = Some(Utc::now());
        let stats = compute_stats(&[deleted]);
        assert_eq!(stats.total_trades, 0);
        assert_eq!(stats.net_pnl, dec!(0));
    }

    #[test]
    fn equity_curve_is_cumulative_in_chronological_order() {
        let trades = vec![
            closed_trade("1", 1, dec!(100), None),
            closed_trade("2", 5, dec!(-30), None),
            closed_trade("3", 3, dec!(50), None),
        ];
        let curve = compute_equity_curve(&trades);
        assert_eq!(curve.len(), 3);
        assert_eq!(curve[0].net_pnl, dec!(-30));
        assert_eq!(curve[0].cumulative_net_pnl, dec!(-30));
        assert_eq!(curve[1].net_pnl, dec!(50));
        assert_eq!(curve[1].cumulative_net_pnl, dec!(20));
        assert_eq!(curve[2].net_pnl, dec!(100));
        assert_eq!(curve[2].cumulative_net_pnl, dec!(120));
    }

    #[test]
    fn calendar_groups_multiple_trades_on_the_same_day() {
        let today = Utc::now();
        let mut a = closed_trade("1", 0, dec!(100), None);
        a.closed_at = Some(today);
        let mut b = closed_trade("2", 0, dec!(-40), None);
        b.closed_at = Some(today);
        let calendar = compute_calendar(&[a, b]);
        assert_eq!(calendar.len(), 1);
        assert_eq!(calendar[0].trade_count, 2);
        assert_eq!(calendar[0].net_pnl, dec!(60));
    }

    #[test]
    fn strategy_breakdown_groups_by_snapshot_and_labels_missing_as_none() {
        let mut with_strategy = closed_trade("1", 1, dec!(100), None);
        with_strategy.strategy_snapshot = Some(StrategySnapshot {
            strategy_id: "strat-1".to_string(),
            name: "Breakout".to_string(),
            color: None,
        });
        let without_strategy = closed_trade("2", 1, dec!(-20), None);

        let breakdown = compute_strategy_breakdown(&[with_strategy, without_strategy]);
        assert_eq!(breakdown.len(), 2);
        assert_eq!(breakdown[0].label, "Breakout");
        assert_eq!(breakdown[0].net_pnl, dec!(100));
        assert_eq!(breakdown[1].label, "Bez strategii");
        assert_eq!(breakdown[1].net_pnl, dec!(-20));
    }

    #[test]
    fn instrument_breakdown_groups_by_symbol() {
        let mut trade = closed_trade("1", 1, dec!(50), None);
        trade.instrument_id = Some("instr-1".to_string());
        trade.instrument_spec_snapshot = Some(InstrumentSnapshot {
            display_symbol: "EURUSD".to_string(),
            source_symbol: "EURUSD.ecn".to_string(),
            description: "Euro / Dolar amerykański".to_string(),
            category: "Forex".to_string(),
            instrument_version_id: "version-1".to_string(),
            currency_base: "EUR".to_string(),
            currency_profit: "USD".to_string(),
            currency_margin: "EUR".to_string(),
            digits: 5,
            point: dec!(0.00001),
            trade_tick_size: dec!(0.00001),
            trade_tick_value: dec!(1),
            tick_value_profit: dec!(1),
            tick_value_loss: dec!(1),
            contract_size: dec!(100000),
            volume_min: dec!(0.01),
            volume_max: dec!(100),
            volume_step: dec!(0.01),
            volume_limit: dec!(0),
            calc_mode: "SYMBOL_CALC_MODE_FOREX".to_string(),
        });

        let breakdown = compute_instrument_breakdown(&[trade]);
        assert_eq!(breakdown.len(), 1);
        assert_eq!(breakdown[0].key, "instr-1");
        assert_eq!(breakdown[0].label, "EURUSD");
    }
}
