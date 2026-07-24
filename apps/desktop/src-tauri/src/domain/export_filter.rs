//! Zawężenie eksportu do tego samego wycinka danych, który użytkownik widzi w Raportach.
//!
//! Eksport bez filtru zawsze zrzucał WSZYSTKIE transakcje konta. W zakładce Raporty to mylące:
//! ekran pokazuje marzec 2026 dla jednej strategii, a plik wychodzi z całą historią. Filtr jest
//! opcjonalny - `None` zachowuje dotychczasowe zachowanie ekranu "Dane" (pełny zrzut konta).
//!
//! Filtrowanie robimy w pamięci na już pobranej liście, a nie w SQL: eksport dotyczy jednego
//! konta, więc lista jest z definicji ograniczona, a dzięki temu reguły zawężania są w JEDNYM
//! miejscu i pokryte testami jednostkowymi, zamiast rozsypane po zapytaniach.

use chrono::{DateTime, Datelike, Local, Utc};
use serde::{Deserialize, Serialize};

use crate::domain::trade::{Trade, TradeSide};

/// Rok/miesiąc zamknięcia W LOKALNEJ STREFIE CZASOWEJ - transakcja zamknięta tuż po lokalnej
/// północy jest w UTC wciąż poprzednim dniem, więc porównanie wprost na `DateTime<Utc>` mogło
/// przypisać ją do złego miesiąca/roku (ta sama poprawka co w `domain::trade_stats` i
/// `application::reports::matches_dimensions`).
fn lokalnie(at: DateTime<Utc>) -> DateTime<Local> {
    at.with_timezone(&Local)
}

/// Wymiary zawężenia - dokładnie te, które ma pasek filtrów Raportów.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ExportFilter {
    #[serde(default)]
    pub instrument_id: Option<String>,
    #[serde(default)]
    pub strategy_id: Option<String>,
    #[serde(default)]
    pub interval_id: Option<String>,
    #[serde(default)]
    pub side: Option<TradeSide>,
    /// Rok zamknięcia transakcji (`closed_at`) - ten sam wymiar co `ReportFilter::year` w
    /// Raportach, żeby eksport nigdy się nie rozjechał z tym, co użytkownik widzi na ekranie.
    #[serde(default)]
    pub year: Option<i32>,
    /// Miesiąc zamknięcia transakcji, 1-12. Brany pod uwagę tylko razem z rokiem - sam miesiąc
    /// bez roku oznaczałby "każdy marzec w historii", czego pasek filtrów nie pozwala wybrać.
    #[serde(default)]
    pub month: Option<u32>,
}

impl ExportFilter {
    /// `true`, gdy filtr niczego nie zawęża - wtedy eksport jest pełnym zrzutem konta.
    pub fn is_empty(&self) -> bool {
        self.instrument_id.is_none()
            && self.strategy_id.is_none()
            && self.interval_id.is_none()
            && self.side.is_none()
            && self.year.is_none()
    }

    /// Czy pojedyncza transakcja mieści się w zawężeniu.
    pub fn matches(&self, trade: &Trade) -> bool {
        if let Some(instrument_id) = &self.instrument_id {
            if trade.instrument_id.as_deref() != Some(instrument_id.as_str()) {
                return false;
            }
        }
        if let Some(strategy_id) = &self.strategy_id {
            if trade.strategy_id.as_deref() != Some(strategy_id.as_str()) {
                return false;
            }
        }
        if let Some(interval_id) = &self.interval_id {
            if trade.interval_id.as_deref() != Some(interval_id.as_str()) {
                return false;
            }
        }
        if let Some(side) = self.side {
            if trade.side != side {
                return false;
            }
        }
        if let Some(year) = self.year {
            // Transakcja bez daty zamknięcia (szkic/otwarta) nie należy do żadnego zamkniętego
            // okresu, więc zawężenie po roku musi ją odrzucić - inaczej wpadałaby do KAŻDEGO
            // okresu. To samo kryterium co `application::reports::matches_dimensions`.
            let Some(closed_at) = trade.closed_at else {
                return false;
            };
            let closed_at = lokalnie(closed_at);
            if closed_at.year() != year {
                return false;
            }
            if let Some(month) = self.month {
                if closed_at.month() != month {
                    return false;
                }
            }
        }
        true
    }
}

/// Zostawia tylko transakcje mieszczące się w zawężeniu. `None` przepuszcza wszystko.
pub fn apply(trades: Vec<Trade>, filter: Option<&ExportFilter>) -> Vec<Trade> {
    match filter {
        None => trades,
        Some(filter) if filter.is_empty() => trades,
        Some(filter) => trades.into_iter().filter(|t| filter.matches(t)).collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::trade::{PnlSource, TradeStatus};
    use chrono::{TimeZone, Utc};
    use rust_decimal::Decimal;

    fn trade(id: &str) -> Trade {
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
            opened_at: Some(Utc.with_ymd_and_hms(2026, 3, 15, 10, 0, 0).unwrap()),
            closed_at: Some(Utc.with_ymd_and_hms(2026, 3, 15, 10, 0, 0).unwrap()),
            interval_id: None,
            interval: None,
            session: None,
            volume: None,
            entry_price: None,
            stop_loss: None,
            take_profit: None,
            exit_price: None,
            commission: Decimal::ZERO,
            swap: Decimal::ZERO,
            other_fees: Decimal::ZERO,
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
            partial_closes: vec![],
            created_at: Utc::now(),
            updated_at: Utc::now(),
            deleted_at: None,
        }
    }

    fn ids(trades: &[Trade]) -> Vec<&str> {
        trades.iter().map(|t| t.id.as_str()).collect()
    }

    #[test]
    fn brak_filtru_przepuszcza_wszystko() {
        let trades = vec![trade("a"), trade("b")];
        assert_eq!(ids(&apply(trades, None)), vec!["a", "b"]);
    }

    #[test]
    fn pusty_filtr_przepuszcza_wszystko() {
        let trades = vec![trade("a"), trade("b")];
        let filter = ExportFilter::default();
        assert!(filter.is_empty());
        assert_eq!(ids(&apply(trades, Some(&filter))), vec!["a", "b"]);
    }

    #[test]
    fn zawezenie_po_instrumencie() {
        let mut a = trade("a");
        a.instrument_id = Some("eurusd".into());
        let mut b = trade("b");
        b.instrument_id = Some("gbpusd".into());
        let filter = ExportFilter {
            instrument_id: Some("eurusd".into()),
            ..Default::default()
        };
        assert_eq!(ids(&apply(vec![a, b], Some(&filter))), vec!["a"]);
    }

    #[test]
    fn zawezenie_po_strategii_odrzuca_transakcje_bez_strategii() {
        let mut a = trade("a");
        a.strategy_id = Some("s1".into());
        let b = trade("b"); // bez strategii
        let filter = ExportFilter {
            strategy_id: Some("s1".into()),
            ..Default::default()
        };
        assert_eq!(ids(&apply(vec![a, b], Some(&filter))), vec!["a"]);
    }

    #[test]
    fn zawezenie_po_kierunku() {
        let mut a = trade("a");
        a.side = TradeSide::Buy;
        let mut b = trade("b");
        b.side = TradeSide::Sell;
        let filter = ExportFilter {
            side: Some(TradeSide::Sell),
            ..Default::default()
        };
        assert_eq!(ids(&apply(vec![a, b], Some(&filter))), vec!["b"]);
    }

    #[test]
    fn zawezenie_po_roku_i_miesiacu() {
        let a = trade("a"); // marzec 2026
        let mut b = trade("b");
        b.closed_at = Some(Utc.with_ymd_and_hms(2026, 4, 1, 10, 0, 0).unwrap());
        let mut c = trade("c");
        c.closed_at = Some(Utc.with_ymd_and_hms(2025, 3, 1, 10, 0, 0).unwrap());

        let rok = ExportFilter {
            year: Some(2026),
            ..Default::default()
        };
        assert_eq!(
            ids(&apply(vec![a.clone(), b.clone(), c.clone()], Some(&rok))),
            vec!["a", "b"]
        );

        let miesiac = ExportFilter {
            year: Some(2026),
            month: Some(3),
            ..Default::default()
        };
        assert_eq!(ids(&apply(vec![a, b, c], Some(&miesiac))), vec!["a"]);
    }

    #[test]
    fn sam_miesiac_bez_roku_nic_nie_zawezaja() {
        let a = trade("a"); // marzec
        let mut b = trade("b");
        b.closed_at = Some(Utc.with_ymd_and_hms(2026, 4, 1, 10, 0, 0).unwrap());
        let filter = ExportFilter {
            month: Some(3),
            ..Default::default()
        };
        // Miesiąc bez roku jest ignorowany, więc filtr jest "pusty" i przepuszcza obie.
        assert!(filter.is_empty());
        assert_eq!(ids(&apply(vec![a, b], Some(&filter))), vec!["a", "b"]);
    }

    #[test]
    fn zawezenie_po_roku_odrzuca_transakcje_bez_daty_zamkniecia() {
        let mut szkic = trade("szkic");
        szkic.closed_at = None;
        let filter = ExportFilter {
            year: Some(2026),
            ..Default::default()
        };
        assert!(apply(vec![szkic], Some(&filter)).is_empty());
    }

    /// Regresja: `ExportFilter` kiedyś zawężał po `opened_at`, a `matches_dimensions` (Raporty)
    /// po `closed_at` - dla transakcji otwartej w jednym miesiącu, a zamkniętej w kolejnym, dawało
    /// to RÓŻNE wyniki, mimo że nagłówek modułu obiecuje "ten sam wycinek danych, co w Raportach".
    /// Woła bezpośrednio `matches_dimensions`, żeby udowodnić zgodność, a nie tylko zaufać, że oba
    /// filtry używają tego samego pola.
    #[test]
    fn zgodnosc_z_filtrem_raportow_dla_transakcji_otwartej_i_zamknietej_w_roznych_miesiacach() {
        use crate::application::reports::matches_dimensions;

        let mut t = trade("otwarta-luty-zamknieta-marzec");
        t.opened_at = Some(Utc.with_ymd_and_hms(2026, 2, 27, 23, 0, 0).unwrap());
        t.closed_at = Some(Utc.with_ymd_and_hms(2026, 3, 2, 8, 0, 0).unwrap());

        let marzec = ExportFilter {
            year: Some(2026),
            month: Some(3),
            ..Default::default()
        };
        let luty = ExportFilter {
            year: Some(2026),
            month: Some(2),
            ..Default::default()
        };

        // Raport miesiąca zamknięcia (marzec) pokazuje tę transakcję - eksport z tym samym
        // filtrem musi ją zawierać.
        assert!(matches_dimensions(
            &t,
            None,
            None,
            None,
            None,
            Some(2026),
            Some(3)
        ));
        assert!(marzec.matches(&t));

        // Raport miesiąca otwarcia (luty) NIE pokazuje tej transakcji (zamknęła się w marcu) -
        // eksport z tym samym filtrem też musi ją odrzucić.
        assert!(!matches_dimensions(
            &t,
            None,
            None,
            None,
            None,
            Some(2026),
            Some(2)
        ));
        assert!(!luty.matches(&t));
    }

    #[test]
    fn wiele_wymiarow_dziala_jak_koniunkcja() {
        let mut a = trade("a");
        a.instrument_id = Some("eurusd".into());
        a.side = TradeSide::Buy;
        let mut b = trade("b");
        b.instrument_id = Some("eurusd".into());
        b.side = TradeSide::Sell;

        let filter = ExportFilter {
            instrument_id: Some("eurusd".into()),
            side: Some(TradeSide::Buy),
            ..Default::default()
        };
        assert_eq!(ids(&apply(vec![a, b], Some(&filter))), vec!["a"]);
    }
}
