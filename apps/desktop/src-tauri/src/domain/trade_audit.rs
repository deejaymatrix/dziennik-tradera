use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::trade::{ManualPnlOverride, PnlSource, Trade, TradeInput};
use super::trade_emotions::TradeEmotions;
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FieldChange {
    pub field: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TradeAuditEntry {
    pub id: String,
    pub trade_id: String,
    pub changed_at: DateTime<Utc>,
    pub changes: Vec<FieldChange>,
}

pub trait TradeAuditRepository {
    fn record_change(
        &self,
        trade_id: &str,
        changes: &[FieldChange],
    ) -> Result<TradeAuditEntry, AppError>;
    fn list_for_trade(&self, trade_id: &str) -> Result<Vec<TradeAuditEntry>, AppError>;
}

fn push_if_changed<T: PartialEq + ToString>(
    changes: &mut Vec<FieldChange>,
    field: &str,
    old: Option<T>,
    new: Option<T>,
) {
    if old == new {
        return;
    }
    changes.push(FieldChange {
        field: field.to_string(),
        old_value: old.map(|v| v.to_string()),
        new_value: new.map(|v| v.to_string()),
    });
}

fn override_summary(pnl_override: Option<&ManualPnlOverride>) -> Option<String> {
    pnl_override.map(|o| format!("{} ({})", o.net_pnl, o.reason))
}

/// Porównuje zapisaną transakcję z nowym wejściem z formularza i zwraca listę zmienionych pól
/// (etykieta + stara/nowa wartość) - podstawa lokalnego dziennika zmian (sekcja "Tryb odczytu
/// i przycisk Edytuj"). Puste pole `changes` oznacza brak realnych zmian - wywołujący pomija
/// wtedy zapis wpisu do dziennika.
pub fn diff_trade_input(old: &Trade, new: &TradeInput) -> Vec<FieldChange> {
    let mut changes = Vec::new();

    push_if_changed(
        &mut changes,
        "Instrument",
        old.instrument_id.clone(),
        new.instrument_id.clone(),
    );
    push_if_changed(
        &mut changes,
        "Strategia",
        old.strategy_id.clone(),
        new.strategy_id.clone(),
    );
    push_if_changed(
        &mut changes,
        "Kierunek",
        Some(old.side.as_db_str().to_string()),
        Some(new.side.as_db_str().to_string()),
    );
    push_if_changed(&mut changes, "Data otwarcia", old.opened_at, new.opened_at);
    push_if_changed(
        &mut changes,
        "Data zamknięcia",
        old.closed_at,
        new.closed_at,
    );
    push_if_changed(
        &mut changes,
        "Interwał",
        old.interval_id.clone(),
        new.interval_id.clone(),
    );
    push_if_changed(
        &mut changes,
        "Sesja",
        old.session.clone(),
        new.session.clone(),
    );
    push_if_changed(&mut changes, "Wolumen", old.volume, new.volume);
    push_if_changed(
        &mut changes,
        "Cena wejścia",
        old.entry_price,
        new.entry_price,
    );
    push_if_changed(&mut changes, "Stop loss", old.stop_loss, new.stop_loss);
    push_if_changed(
        &mut changes,
        "Take profit",
        old.take_profit,
        new.take_profit,
    );
    push_if_changed(&mut changes, "Cena wyjścia", old.exit_price, new.exit_price);
    push_if_changed(
        &mut changes,
        "Prowizja",
        Some(old.commission),
        Some(new.commission),
    );
    push_if_changed(&mut changes, "Swap", Some(old.swap), Some(new.swap));
    push_if_changed(
        &mut changes,
        "Dodatkowe opłaty",
        Some(old.other_fees),
        Some(new.other_fees),
    );
    push_if_changed(
        &mut changes,
        "Kurs przeliczeniowy",
        old.conversion_rate,
        new.conversion_rate,
    );
    push_if_changed(
        &mut changes,
        "Plan przed transakcją",
        old.plan_before.clone(),
        new.plan_before.clone(),
    );
    push_if_changed(
        &mut changes,
        "Notatki z zarządzania",
        old.management_notes.clone(),
        new.management_notes.clone(),
    );
    push_if_changed(
        &mut changes,
        "Podsumowanie po transakcji",
        old.post_trade_summary.clone(),
        new.post_trade_summary.clone(),
    );
    push_if_changed(
        &mut changes,
        "Wnioski",
        old.conclusion.clone(),
        new.conclusion.clone(),
    );
    push_if_changed(
        &mut changes,
        "Ocena zgodności z planem",
        old.plan_adherence_rating,
        new.plan_adherence_rating,
    );

    let old_override = if old.pnl_source == PnlSource::ManualOverride {
        old.net_pnl
            .zip(old.pnl_override_reason.clone())
            .map(|(net_pnl, reason)| ManualPnlOverride { net_pnl, reason })
    } else {
        None
    };
    push_if_changed(
        &mut changes,
        "Ręczna korekta wyniku",
        override_summary(old_override.as_ref()),
        override_summary(new.pnl_override.as_ref()),
    );
    push_if_changed(
        &mut changes,
        "Emocje",
        old.emotions.as_ref().and_then(TradeEmotions::summary),
        new.emotions.as_ref().and_then(TradeEmotions::summary),
    );

    changes
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::trade::{PnlSource, TradeSide, TradeStatus};
    use chrono::TimeZone;
    use rust_decimal_macros::dec;

    fn base_trade() -> Trade {
        Trade {
            id: "t-1".to_string(),
            account_id: "acc-1".to_string(),
            display_number: 1,
            instrument_id: Some("instr-1".to_string()),
            instrument_spec_snapshot: None,
            strategy_id: None,
            strategy_snapshot: None,
            status: TradeStatus::Open,
            side: TradeSide::Buy,
            opened_at: Some(Utc.with_ymd_and_hms(2026, 1, 1, 10, 0, 0).unwrap()),
            closed_at: None,
            interval_id: None,
            interval: None,
            session: None,
            volume: Some(dec!(1)),
            entry_price: Some(dec!(1.1)),
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
            tags: vec![],
            plan_adherence_rating: None,
            pnl_source: PnlSource::Auto,
            pnl_override_reason: None,
            emotions: None,
            checklist: None,
            created_at: Utc.with_ymd_and_hms(2026, 1, 1, 10, 0, 0).unwrap(),
            updated_at: Utc.with_ymd_and_hms(2026, 1, 1, 10, 0, 0).unwrap(),
            deleted_at: None,
        }
    }

    fn base_input(old: &Trade) -> TradeInput {
        TradeInput {
            account_id: old.account_id.clone(),
            instrument_id: old.instrument_id.clone(),
            strategy_id: old.strategy_id.clone(),
            side: old.side,
            opened_at: old.opened_at,
            closed_at: old.closed_at,
            interval_id: old.interval_id.clone(),
            session: old.session.clone(),
            volume: old.volume,
            entry_price: old.entry_price,
            stop_loss: old.stop_loss,
            take_profit: old.take_profit,
            exit_price: old.exit_price,
            commission: old.commission,
            swap: old.swap,
            other_fees: old.other_fees,
            conversion_rate: old.conversion_rate,
            plan_before: old.plan_before.clone(),
            management_notes: old.management_notes.clone(),
            post_trade_summary: old.post_trade_summary.clone(),
            conclusion: old.conclusion.clone(),
            plan_adherence_rating: old.plan_adherence_rating,
            pnl_override: None,
            emotions: None,
            checklist: None,
        }
    }

    #[test]
    fn identical_input_produces_no_changes() {
        let old = base_trade();
        let new = base_input(&old);
        assert!(diff_trade_input(&old, &new).is_empty());
    }

    #[test]
    fn changing_entry_price_and_volume_reports_both_fields() {
        let old = base_trade();
        let mut new = base_input(&old);
        new.entry_price = Some(dec!(1.2));
        new.volume = Some(dec!(2));

        let changes = diff_trade_input(&old, &new);
        assert_eq!(changes.len(), 2);
        assert!(changes.iter().any(|c| c.field == "Cena wejścia"
            && c.old_value == Some("1.1".to_string())
            && c.new_value == Some("1.2".to_string())));
        assert!(changes
            .iter()
            .any(|c| c.field == "Wolumen" && c.new_value == Some("2".to_string())));
    }

    #[test]
    fn clearing_an_optional_field_is_recorded_as_a_change_to_none() {
        let old = base_trade();
        let mut new = base_input(&old);
        new.entry_price = None;

        let changes = diff_trade_input(&old, &new);
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].field, "Cena wejścia");
        assert_eq!(changes[0].old_value, Some("1.1".to_string()));
        assert_eq!(changes[0].new_value, None);
    }

    #[test]
    fn enabling_manual_override_is_recorded() {
        let old = base_trade();
        let mut new = base_input(&old);
        new.pnl_override = Some(ManualPnlOverride {
            net_pnl: dec!(42),
            reason: "korekta".to_string(),
        });

        let changes = diff_trade_input(&old, &new);
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].field, "Ręczna korekta wyniku");
        assert_eq!(changes[0].old_value, None);
        assert_eq!(changes[0].new_value, Some("42 (korekta)".to_string()));
    }
}
