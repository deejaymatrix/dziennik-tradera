use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::instrument::InstrumentSnapshot;
use super::strategy::StrategySnapshot;
use super::strategy_checklist::StrategyChecklist;
use super::trade_calculations::TradeCalculation;
use super::trade_emotions::TradeEmotions;
use super::trade_partial_close::{self, PartialClose};
use crate::error::AppError;

/// Status NIGDY nie jest wybierany przez użytkownika - wynika wyłącznie z obecności danych
/// (sekcja "Automatyczny status transakcji"). `Cancelled` z wcześniejszej wersji aplikacji nie
/// istnieje już jako osiągalny stan; ewentualne historyczne wiersze z tą wartością w bazie są
/// przy każdym odczycie/zapisie przeliczane na Szkic/Otwarta/Zamknięta na podstawie ich
/// rzeczywistych danych - `status` nigdy nie jest dwoma sprzecznymi źródłami prawdy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TradeStatus {
    Draft,
    Open,
    Closed,
}

impl TradeStatus {
    pub fn as_db_str(self) -> &'static str {
        match self {
            TradeStatus::Draft => "draft",
            TradeStatus::Open => "open",
            TradeStatus::Closed => "closed",
        }
    }
}

/// Jedyne miejsce, które wylicza status transakcji - z obecności danych, nigdy z wyboru
/// użytkownika ani z zapisanej wcześniej wartości w bazie. Używane zarówno przy zapisie
/// (`TradesService`) jak i przy odczycie (`SqliteTradeRepository::map_row`), żeby status
/// wyświetlany zawsze wynikał z aktualnych danych transakcji.
pub fn compute_status(
    has_instrument: bool,
    has_entry_price: bool,
    has_volume: bool,
    has_opened_at: bool,
    has_exit_price: bool,
    has_closed_at: bool,
) -> TradeStatus {
    let has_open_data = has_instrument && has_entry_price && has_volume && has_opened_at;
    let has_close_data = has_exit_price && has_closed_at;
    if !has_open_data {
        TradeStatus::Draft
    } else if has_close_data {
        TradeStatus::Closed
    } else {
        TradeStatus::Open
    }
}

/// Nakłada regułę częściowych zamknięć na status wyliczony przez [`compute_status`] (sekcja 6.9):
/// gdy pozostały lot spadnie do zera, transakcja jest zamknięta; przy pozostałym locie większym
/// od zera pozostaje otwarta - nawet jeśli wpisano cenę i datę zamknięcia, bo część pozycji wciąż
/// pracuje na rynku.
///
/// Szkicu nie rusza: brak kompletu danych otwarcia to nadal szkic, niezależnie od wpisów.
pub fn apply_partial_closes_to_status(
    base: TradeStatus,
    partial_closes: &[PartialClose],
    volume: Option<Decimal>,
) -> TradeStatus {
    if base == TradeStatus::Draft || partial_closes.is_empty() {
        return base;
    }
    let Some(volume) = volume else {
        return base;
    };
    if trade_partial_close::closes_position_fully(volume, partial_closes) {
        TradeStatus::Closed
    } else {
        TradeStatus::Open
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TradeSide {
    Buy,
    Sell,
}

impl TradeSide {
    pub fn as_db_str(self) -> &'static str {
        match self {
            TradeSide::Buy => "buy",
            TradeSide::Sell => "sell",
        }
    }

    pub fn from_db_str(value: &str) -> Self {
        match value {
            "sell" => TradeSide::Sell,
            _ => TradeSide::Buy,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PnlSource {
    Auto,
    ManualOverride,
}

impl PnlSource {
    pub fn as_db_str(self) -> &'static str {
        match self {
            PnlSource::Auto => "auto",
            PnlSource::ManualOverride => "manual_override",
        }
    }

    pub fn from_db_str(value: &str) -> Self {
        match value {
            "manual_override" => PnlSource::ManualOverride,
            _ => PnlSource::Auto,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Trade {
    pub id: String,
    pub account_id: String,
    pub display_number: i64,
    pub instrument_id: Option<String>,
    pub instrument_spec_snapshot: Option<InstrumentSnapshot>,
    pub strategy_id: Option<String>,
    pub strategy_snapshot: Option<StrategySnapshot>,
    pub status: TradeStatus,
    pub side: TradeSide,
    pub opened_at: Option<DateTime<Utc>>,
    pub closed_at: Option<DateTime<Utc>>,
    pub interval_id: Option<String>,
    /// Zamrożona etykieta interwału z momentu zapisu (np. "M15") - budowana przez warstwę
    /// aplikacyjną na podstawie `interval_id`, tak jak `instrument_spec_snapshot`/
    /// `strategy_snapshot`. Późniejsza zmiana/archiwizacja interwału w zarządzanej liście nie
    /// zmienia już zapisanej historycznej etykiety.
    pub interval: Option<String>,
    pub session: Option<String>,
    pub volume: Option<Decimal>,
    pub entry_price: Option<Decimal>,
    pub stop_loss: Option<Decimal>,
    pub take_profit: Option<Decimal>,
    pub exit_price: Option<Decimal>,
    pub commission: Decimal,
    pub swap: Decimal,
    pub other_fees: Decimal,
    /// Kurs z waluty wyniku instrumentu na walutę rachunku - wymagany tylko, gdy te dwie
    /// waluty się różnią (sekcja "Obliczenia TP, SL i wyniku": brak cichego przeliczenia).
    pub conversion_rate: Option<Decimal>,
    pub gross_pnl: Option<Decimal>,
    pub net_pnl: Option<Decimal>,
    pub pnl_points: Option<Decimal>,
    pub pnl_percent: Option<Decimal>,
    pub pnl_r: Option<Decimal>,
    pub risk_amount: Option<Decimal>,
    pub risk_percent: Option<Decimal>,
    pub plan_before: Option<String>,
    pub management_notes: Option<String>,
    pub post_trade_summary: Option<String>,
    pub conclusion: Option<String>,
    pub tags: Vec<String>,
    pub plan_adherence_rating: Option<i64>,
    pub pnl_source: PnlSource,
    pub pnl_override_reason: Option<String>,
    /// Emocje w 3 momentach (przed/w trakcie/po) - `None` na starszych transakcjach zapisanych
    /// przed tą funkcją, co frontend pokazuje identycznie jak jawnie "nie uzupełniono".
    pub emotions: Option<TradeEmotions>,
    /// Migawka checklisty zasad strategii z momentu jej wyboru (sekcja "Checklist w
    /// transakcji") - `None` gdy transakcja nie ma przypisanej strategii albo pochodzi sprzed
    /// tej funkcji.
    pub checklist: Option<StrategyChecklist>,
    /// Częściowe zamknięcia pozycji (sekcja 6.9), w kolejności dodania. Trzymane w osobnej
    /// tabeli relacyjnej, nie w kolumnie JSON - patrz migracja 0012. Pusta lista = zwykła
    /// transakcja licząca wynik z ceny wejścia i wyjścia.
    pub partial_closes: Vec<PartialClose>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Ręczna korekta wyniku. Opcja została USUNIĘTA z interfejsu użytkownika (sekcja 6.4: wynik
/// wynika z danych transakcji, częściowych zamknięć i kosztów) - formularz jej nie wysyła, więc
/// `TradeInput::pnl_override` jest w praktyce zawsze `None`. Typ zostaje, bo historyczne
/// transakcje zapisane wcześniej z ręczną korektą nadal muszą dać się odczytać i pokazać
/// w dzienniku zmian, a pełne wycięcie ze ścieżki zapisu wymagałoby destrukcyjnej migracji bazy.
#[derive(Debug, Clone, Deserialize)]
pub struct ManualPnlOverride {
    pub net_pnl: Decimal,
    pub reason: String,
}

/// Dane transakcji przychodzące z formularza - bez pól wyliczanych (gross_pnl, pnl_r, ...)
/// i bez migawek (instrument_spec_snapshot, strategy_snapshot), które budowane są w warstwie
/// aplikacyjnej na podstawie `instrument_id`/`strategy_id` w momencie zapisu.
#[derive(Debug, Clone, Deserialize)]
pub struct TradeInput {
    pub account_id: String,
    pub instrument_id: Option<String>,
    pub strategy_id: Option<String>,
    pub side: TradeSide,
    pub opened_at: Option<DateTime<Utc>>,
    pub closed_at: Option<DateTime<Utc>>,
    pub interval_id: Option<String>,
    pub session: Option<String>,
    pub volume: Option<Decimal>,
    pub entry_price: Option<Decimal>,
    pub stop_loss: Option<Decimal>,
    pub take_profit: Option<Decimal>,
    pub exit_price: Option<Decimal>,
    pub commission: Decimal,
    pub swap: Decimal,
    pub other_fees: Decimal,
    pub conversion_rate: Option<Decimal>,
    pub plan_before: Option<String>,
    pub management_notes: Option<String>,
    pub post_trade_summary: Option<String>,
    pub conclusion: Option<String>,
    pub plan_adherence_rating: Option<i64>,
    /// Ręczna korekta wyniku usunięta z UI (sekcja 6.4) - `#[serde(default)]`, bo formularz tego
    /// pola już nie wysyła, a bez domyślnej wartości deserializacja by się wywalała.
    #[serde(default)]
    pub pnl_override: Option<ManualPnlOverride>,
    pub emotions: Option<TradeEmotions>,
    pub checklist: Option<StrategyChecklist>,
    /// Częściowe zamknięcia z formularza (sekcja 6.9). `#[serde(default)]`, bo starsze wywołania
    /// i testy tego pola nie wysyłają, a brak wpisów to poprawny, najczęstszy przypadek.
    #[serde(default)]
    pub partial_closes: Vec<PartialClose>,
}

fn validate_positive(label: &str, value: Decimal) -> Result<(), AppError> {
    if value.is_sign_negative() || value.is_zero() {
        return Err(AppError::Validation(format!(
            "{label} musi być liczbą dodatnią."
        )));
    }
    Ok(())
}

impl TradeInput {
    /// Wylicza status z aktualnych pól tego wejścia - patrz [`compute_status`].
    pub fn compute_status(&self) -> TradeStatus {
        let base = compute_status(
            self.instrument_id.is_some(),
            self.entry_price.is_some(),
            self.volume.is_some(),
            self.opened_at.is_some(),
            self.exit_price.is_some(),
            self.closed_at.is_some(),
        );
        apply_partial_closes_to_status(base, &self.partial_closes, self.volume)
    }

    pub fn validate(&self) -> Result<(), AppError> {
        if self.account_id.trim().is_empty() {
            return Err(AppError::Validation(
                "Transakcja musi być przypisana do konta.".to_string(),
            ));
        }

        if let Some(volume) = self.volume {
            validate_positive("Lot", volume)?;
        }
        if let Some(entry_price) = self.entry_price {
            validate_positive("Cena wejścia", entry_price)?;
        }
        if let Some(stop_loss) = self.stop_loss {
            validate_positive("Stop loss", stop_loss)?;
        }
        if let Some(take_profit) = self.take_profit {
            validate_positive("Take profit", take_profit)?;
        }
        if let Some(exit_price) = self.exit_price {
            validate_positive("Cena wyjścia", exit_price)?;
        }

        if self.commission.is_sign_negative() {
            return Err(AppError::Validation(
                "Prowizja nie może być ujemna.".to_string(),
            ));
        }
        if self.other_fees.is_sign_negative() {
            return Err(AppError::Validation(
                "Dodatkowe opłaty nie mogą być ujemne.".to_string(),
            ));
        }
        if let Some(rate) = self.conversion_rate {
            validate_positive("Kurs przeliczeniowy", rate)?;
        }

        if let (Some(entry), Some(stop_loss)) = (self.entry_price, self.stop_loss) {
            let on_risk_side = match self.side {
                TradeSide::Buy => stop_loss < entry,
                TradeSide::Sell => stop_loss > entry,
            };
            if !on_risk_side {
                return Err(AppError::Validation(
                    "Stop loss musi być po stronie ryzyka względem ceny wejścia (poniżej dla \
                     pozycji BUY, powyżej dla pozycji SELL)."
                        .to_string(),
                ));
            }
        }

        if let (Some(entry), Some(take_profit)) = (self.entry_price, self.take_profit) {
            let on_profit_side = match self.side {
                TradeSide::Buy => take_profit > entry,
                TradeSide::Sell => take_profit < entry,
            };
            if !on_profit_side {
                return Err(AppError::Validation(
                    "Take profit musi być po stronie zysku względem ceny wejścia (powyżej dla \
                     pozycji BUY, poniżej dla pozycji SELL)."
                        .to_string(),
                ));
            }
        }

        // Status nie jest wybierany - wynika z obecności danych. Dane zamknięcia (cena wyjścia +
        // data zamknięcia) mają sens tylko razem z kompletem danych otwarcia pozycji, i tylko
        // razem ze sobą (nie można podać samej ceny wyjścia bez daty zamknięcia i odwrotnie).
        let has_close_data = self.exit_price.is_some() || self.closed_at.is_some();
        if has_close_data {
            if self.instrument_id.is_none() {
                return Err(AppError::Validation(
                    "Wybierz instrument, aby zamknąć pozycję.".to_string(),
                ));
            }
            if self.entry_price.is_none() {
                return Err(AppError::Validation(
                    "Podaj cenę wejścia, aby zamknąć pozycję.".to_string(),
                ));
            }
            if self.volume.is_none() {
                return Err(AppError::Validation(
                    "Podaj lot, aby zamknąć pozycję.".to_string(),
                ));
            }
            if self.opened_at.is_none() {
                return Err(AppError::Validation(
                    "Podaj datę otwarcia pozycji, aby zamknąć pozycję.".to_string(),
                ));
            }
            if self.exit_price.is_none() {
                return Err(AppError::Validation(
                    "Podaj cenę wyjścia, aby zamknąć pozycję.".to_string(),
                ));
            }
            let closed_at = self.closed_at.ok_or_else(|| {
                AppError::Validation("Podaj datę zamknięcia pozycji.".to_string())
            })?;
            if let Some(opened_at) = self.opened_at {
                if closed_at < opened_at {
                    return Err(AppError::Validation(
                        "Data zamknięcia nie może być wcześniejsza niż data otwarcia.".to_string(),
                    ));
                }
            }
        }

        if let Some(rating) = self.plan_adherence_rating {
            if !(1..=5).contains(&rating) {
                return Err(AppError::Validation(
                    "Ocena zgodności z planem musi być z zakresu 1-5.".to_string(),
                ));
            }
        }

        if let Some(override_) = &self.pnl_override {
            if override_.reason.trim().is_empty() {
                return Err(AppError::Validation(
                    "Ręczna korekta wyniku wymaga podania uzasadnienia.".to_string(),
                ));
            }
        }

        if let Some(emotions) = &self.emotions {
            emotions.validate()?;
        }

        trade_partial_close::validate(&self.partial_closes, self.volume)?;

        Ok(())
    }
}

/// To, co faktycznie trafia do repozytorium: surowe dane z formularza plus wynik silnika
/// przeliczeń i migawki, złożone w warstwie aplikacyjnej (`TradesService`).
#[derive(Debug, Clone)]
pub struct TradeWrite {
    pub input: TradeInput,
    pub calculation: TradeCalculation,
    pub instrument_snapshot: Option<InstrumentSnapshot>,
    pub strategy_snapshot: Option<StrategySnapshot>,
    /// Zamrożona etykieta interwału (np. "M15"), budowana przez `TradesService::build_write` na
    /// podstawie `input.interval_id` - trafia do kolumny `interval` (patrz doc-comment na
    /// `Trade::interval`).
    pub interval_snapshot: Option<String>,
}

pub trait TradeRepository {
    fn create(&self, write: &TradeWrite) -> Result<Trade, AppError>;
    fn get(&self, id: &str) -> Result<Trade, AppError>;
    fn list(&self, account_id: &str, include_deleted: bool) -> Result<Vec<Trade>, AppError>;
    /// `expected_updated_at` - gdy `Some`, aktualizacja jest odrzucana jako konflikt wersji
    /// (`AppError::Conflict`), jeśli transakcja zmieniła się od czasu jej wczytania (sekcja
    /// "Tryb odczytu i przycisk Edytuj" - wykrywanie konfliktu). `None` pomija tę kontrolę
    /// (używane tam, gdzie nie ma jeszcze wcześniej wczytanego stanu do porównania).
    fn update(
        &self,
        id: &str,
        write: &TradeWrite,
        expected_updated_at: Option<DateTime<Utc>>,
    ) -> Result<Trade, AppError>;
    fn soft_delete(&self, id: &str) -> Result<Trade, AppError>;
    fn restore(&self, id: &str) -> Result<Trade, AppError>;
    /// Trwałe usunięcie transakcji (uniwersalny Kosz, Faza 5) - dozwolone tylko dla już
    /// usuniętej (miękko) transakcji. Kaskadowo usuwa jej wykonania i załączniki.
    fn delete_permanently(&self, id: &str) -> Result<(), AppError>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    fn draft_input() -> TradeInput {
        TradeInput {
            account_id: "acc-1".to_string(),
            instrument_id: None,
            strategy_id: None,
            side: TradeSide::Buy,
            opened_at: None,
            closed_at: None,
            interval_id: None,
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
            plan_before: None,
            management_notes: None,
            post_trade_summary: None,
            conclusion: None,
            plan_adherence_rating: None,
            pnl_override: None,
            emotions: None,
            checklist: None,
            partial_closes: vec![],
        }
    }

    #[test]
    fn minimal_draft_is_valid() {
        assert!(draft_input().validate().is_ok());
    }

    #[test]
    fn rejects_blank_account_id() {
        let mut input = draft_input();
        input.account_id = "  ".to_string();
        assert!(input.validate().is_err());
    }

    #[test]
    fn status_is_computed_from_data_presence_not_chosen() {
        let mut input = draft_input();
        assert_eq!(input.compute_status(), TradeStatus::Draft);

        input.instrument_id = Some("instr-1".to_string());
        input.entry_price = Some(dec!(1.1));
        input.volume = Some(dec!(1));
        input.opened_at = Some(Utc::now());
        assert_eq!(
            input.compute_status(),
            TradeStatus::Open,
            "komplet danych otwarcia bez danych zamknięcia to Otwarta"
        );
        assert!(input.validate().is_ok());

        input.exit_price = Some(dec!(1.2));
        input.closed_at = Some(Utc::now() + chrono::Duration::hours(1));
        assert_eq!(input.compute_status(), TradeStatus::Closed);
    }

    #[test]
    fn a_partially_filled_draft_without_close_data_is_still_valid() {
        // Brak przymusu uzupełnienia kompletu danych otwarcia - to nadal Szkic, zawsze poprawny.
        let mut input = draft_input();
        input.instrument_id = Some("instr-1".to_string());
        input.entry_price = Some(dec!(1.1));
        assert_eq!(input.compute_status(), TradeStatus::Draft);
        assert!(input.validate().is_ok());
    }

    #[test]
    fn rejects_stop_loss_on_wrong_side_for_buy() {
        let mut input = draft_input();
        input.side = TradeSide::Buy;
        input.entry_price = Some(dec!(1.1));
        input.stop_loss = Some(dec!(1.2));
        assert!(input.validate().is_err());
    }

    #[test]
    fn accepts_stop_loss_on_correct_side_for_sell() {
        let mut input = draft_input();
        input.side = TradeSide::Sell;
        input.entry_price = Some(dec!(1.1));
        input.stop_loss = Some(dec!(1.2));
        input.take_profit = Some(dec!(1.0));
        assert!(input.validate().is_ok());
    }

    #[test]
    fn rejects_take_profit_on_wrong_side_for_sell() {
        let mut input = draft_input();
        input.side = TradeSide::Sell;
        input.entry_price = Some(dec!(1.1));
        input.take_profit = Some(dec!(1.2));
        assert!(input.validate().is_err());
    }

    #[test]
    fn closing_requires_exit_price_and_closed_at_not_before_opened_at() {
        let mut input = draft_input();
        input.instrument_id = Some("instr-1".to_string());
        input.entry_price = Some(dec!(1.1));
        input.volume = Some(dec!(1));
        let opened_at = Utc::now();
        input.opened_at = Some(opened_at);
        assert!(
            input.validate().is_ok(),
            "komplet danych otwarcia bez danych zamknięcia jest ważny"
        );

        input.closed_at = Some(opened_at + chrono::Duration::hours(1));
        assert!(
            input.validate().is_err(),
            "sama data zamknięcia bez ceny wyjścia powinna być odrzucona"
        );

        input.exit_price = Some(dec!(1.2));
        input.closed_at = Some(opened_at - chrono::Duration::hours(1));
        assert!(
            input.validate().is_err(),
            "closed_at przed opened_at powinno być odrzucone"
        );

        input.closed_at = Some(opened_at + chrono::Duration::hours(1));
        assert!(input.validate().is_ok());
    }

    #[test]
    fn rejects_out_of_range_plan_adherence_rating() {
        let mut input = draft_input();
        input.plan_adherence_rating = Some(6);
        assert!(input.validate().is_err());
    }
}
