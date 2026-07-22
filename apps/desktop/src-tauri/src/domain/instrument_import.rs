use rust_decimal::Decimal;
use serde::Serialize;
use std::collections::HashMap;
use std::str::FromStr;

use super::instrument::InstrumentVersionInput;
use crate::error::AppError;

/// Jeden instrument gotowy do zapisania z importu brokera - tożsamość (z rozpoznanym symbolem
/// kanonicznym i wariantem, sekcja 1.7 specyfikacji) plus komplet parametrów wersji.
#[derive(Debug, Clone)]
pub struct ImportedInstrument {
    pub display_symbol: String,
    pub source_symbol: String,
    pub canonical_symbol: String,
    pub variant: String,
    pub description: String,
    pub category: String,
    pub parameters: InstrumentVersionInput,
}

/// Jeden wiersz podglądu przed zatwierdzeniem importu (kreator pokazuje to użytkownikowi).
#[derive(Debug, Clone, Serialize)]
pub struct ImportPreviewRow {
    pub source_symbol: String,
    pub display_symbol: String,
    pub canonical_symbol: String,
    pub variant: String,
    pub description: String,
    pub category: String,
    pub currency_profit: String,
    pub contract_size: String,
}

/// Wynik parsowania pliku brokera BEZ zapisu do bazy - lista instrumentów do podglądu +
/// ostrzeżenia (np. rozpoznane warianty, domyślne wartości brakujących kolumn).
#[derive(Debug, Clone, Serialize)]
pub struct ImportPreview {
    pub row_count: usize,
    pub rows: Vec<ImportPreviewRow>,
    pub warnings: Vec<String>,
}

/// Rozpoznaje symbol kanoniczny i wariant z symbolu wyświetlanego brokera. Zgodnie ze
/// specyfikacją (sekcja 1.7) NIGDY nie niszczymy oryginalnego symbolu - `display` zostaje taki
/// jak podany, a jedynie wyliczamy `canonical`/`variant` do sortowania i grupowania. Sufiks
/// "-MINI" oznacza wariant mini; wszystko inne to STANDARD.
pub fn derive_variant(display_symbol: &str) -> (String, String) {
    if let Some(base) = display_symbol.strip_suffix("-MINI") {
        (base.to_string(), "MINI".to_string())
    } else {
        (display_symbol.to_string(), "STANDARD".to_string())
    }
}

fn parse_decimal(
    map: &HashMap<String, String>,
    key: &str,
    row: usize,
) -> Result<Decimal, AppError> {
    let raw = map.get(key).map(|s| s.trim()).unwrap_or("");
    Decimal::from_str(raw).map_err(|_| {
        AppError::Validation(format!(
            "Wiersz {row}: kolumna \"{key}\" musi być liczbą (jest: \"{raw}\")."
        ))
    })
}

fn parse_decimal_or(map: &HashMap<String, String>, key: &str, default: Decimal) -> Decimal {
    map.get(key)
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .and_then(|s| Decimal::from_str(s).ok())
        .unwrap_or(default)
}

fn parse_int_or(map: &HashMap<String, String>, key: &str, default: i64) -> i64 {
    map.get(key)
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(default)
}

fn parse_bool_or(map: &HashMap<String, String>, key: &str, default: bool) -> bool {
    match map.get(key).map(|s| s.trim().to_lowercase()) {
        Some(s) if s == "true" || s == "1" => true,
        Some(s) if s == "false" || s == "0" => false,
        _ => default,
    }
}

fn string_or(map: &HashMap<String, String>, key: &str, default: &str) -> String {
    map.get(key)
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(default)
        .to_string()
}

fn optional_string(map: &HashMap<String, String>, key: &str) -> Option<String> {
    map.get(key)
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// Wymagane kolumny - bez nich nie da się policzyć wyniku transakcji, więc ich brak przerywa
/// cały import (żaden częściowy szablon nie powstaje - sekcja 1.5 specyfikacji).
const REQUIRED_COLUMNS: [&str; 13] = [
    "Symbol",
    "CurrencyBase",
    "CurrencyProfit",
    "CurrencyMargin",
    "Digits",
    "Point",
    "TradeTickSize",
    "TickValueProfit",
    "TickValueLoss",
    "ContractSize",
    "VolumeMin",
    "VolumeMax",
    "VolumeStep",
];

/// Parsuje jeden wiersz (mapa kolumna→wartość, klucze dokładnie jak w nagłówku) na komplet
/// parametrów + tożsamość. Brakujące kolumny opcjonalne dostają sensowne wartości domyślne,
/// żeby zadziałał też uboższy plik brokera niż pełny eksport 52-kolumnowy.
fn parse_row(map: &HashMap<String, String>, row: usize) -> Result<ImportedInstrument, AppError> {
    let source_symbol = string_or(map, "Symbol", "");
    if source_symbol.is_empty() {
        return Err(AppError::Validation(format!(
            "Wiersz {row}: kolumna \"Symbol\" (techniczny symbol brokera) nie może być pusta."
        )));
    }
    // Symbol wyświetlany: z pliku, jeśli podany; inaczej techniczny (nigdy nie gubimy danych).
    let display_symbol = string_or(map, "DisplaySymbol", &source_symbol);
    let (canonical_symbol, variant) = derive_variant(&display_symbol);

    let trade_tick_value = parse_decimal_or(
        map,
        "TradeTickValue",
        parse_decimal(map, "TickValueProfit", row)?,
    );

    let parameters = InstrumentVersionInput {
        currency_base: string_or(map, "CurrencyBase", ""),
        currency_profit: string_or(map, "CurrencyProfit", ""),
        currency_margin: string_or(map, "CurrencyMargin", ""),
        digits: parse_int_or(map, "Digits", 0),
        point: parse_decimal(map, "Point", row)?,
        trade_tick_size: parse_decimal(map, "TradeTickSize", row)?,
        trade_tick_value,
        tick_value_profit: parse_decimal(map, "TickValueProfit", row)?,
        tick_value_loss: parse_decimal(map, "TickValueLoss", row)?,
        contract_size: parse_decimal(map, "ContractSize", row)?,
        volume_min: parse_decimal(map, "VolumeMin", row)?,
        volume_max: parse_decimal(map, "VolumeMax", row)?,
        volume_step: parse_decimal(map, "VolumeStep", row)?,
        volume_limit: parse_decimal_or(map, "VolumeLimit", Decimal::ZERO),
        calc_mode: string_or(map, "CalcMode", "SYMBOL_CALC_MODE_FOREX"),
        trade_mode: string_or(map, "TradeMode", "SYMBOL_TRADE_MODE_FULL"),
        execution_mode: string_or(map, "ExecutionMode", "SYMBOL_TRADE_EXECUTION_MARKET"),
        order_mode_flags: parse_int_or(map, "OrderModeFlags", 63),
        filling_mode_flags: parse_int_or(map, "FillingModeFlags", 1),
        expiration_mode_flags: parse_int_or(map, "ExpirationModeFlags", 15),
        spread_floating: parse_bool_or(map, "SpreadFloating", true),
        stops_level_points: parse_int_or(map, "StopsLevelPoints", 0),
        freeze_level_points: parse_int_or(map, "FreezeLevelPoints", 0),
        margin_initial: parse_decimal_or(map, "MarginInitial", Decimal::ZERO),
        margin_maintenance: parse_decimal_or(map, "MarginMaintenance", Decimal::ZERO),
        margin_hedged: parse_decimal_or(map, "MarginHedged", Decimal::ZERO),
        margin_hedged_use_leg: parse_bool_or(map, "MarginHedgedUseLeg", false),
        liquidity_rate: parse_decimal_or(map, "LiquidityRate", Decimal::ZERO),
        margin_rate_buy_initial: parse_decimal_or(map, "MarginRateBuyInitial", Decimal::ONE),
        margin_rate_buy_maintenance: parse_decimal_or(
            map,
            "MarginRateBuyMaintenance",
            Decimal::ONE,
        ),
        margin_rate_sell_initial: parse_decimal_or(map, "MarginRateSellInitial", Decimal::ONE),
        margin_rate_sell_maintenance: parse_decimal_or(
            map,
            "MarginRateSellMaintenance",
            Decimal::ONE,
        ),
        swap_mode: string_or(map, "SwapMode", "SYMBOL_SWAP_MODE_POINTS"),
        swap_long: parse_decimal_or(map, "SwapLong", Decimal::ZERO),
        swap_short: parse_decimal_or(map, "SwapShort", Decimal::ZERO),
        swap_sunday: parse_decimal_or(map, "SwapSunday", Decimal::ZERO),
        swap_monday: parse_decimal_or(map, "SwapMonday", Decimal::ZERO),
        swap_tuesday: parse_decimal_or(map, "SwapTuesday", Decimal::ZERO),
        swap_wednesday: parse_decimal_or(map, "SwapWednesday", Decimal::ZERO),
        swap_thursday: parse_decimal_or(map, "SwapThursday", Decimal::ZERO),
        swap_friday: parse_decimal_or(map, "SwapFriday", Decimal::ZERO),
        swap_saturday: parse_decimal_or(map, "SwapSaturday", Decimal::ZERO),
        triple_swap_day: string_or(map, "TripleSwapDay", "ENUM_DAY_OF_WEEK::3"),
        quote_sessions: string_or(map, "QuoteSessions", ""),
        trade_sessions: string_or(map, "TradeSessions", ""),
        start_time: optional_string(map, "StartTime"),
        expiration_time: optional_string(map, "ExpirationTime"),
    };

    Ok(ImportedInstrument {
        display_symbol,
        source_symbol,
        canonical_symbol,
        variant,
        description: string_or(map, "Description", ""),
        category: string_or(map, "Category", "Zaimportowane"),
        parameters,
    })
}

/// Parsuje cały plik CSV brokera (UTF-8, przecinki, opcjonalne cudzysłowy) w listę gotowych
/// instrumentów. Nie dotyka bazy - to jest czysta funkcja pod podgląd i pod atomowy import.
/// `records` to wiersze już rozbite na pola (parsowanie CSV robi warstwa aplikacyjna crate'em
/// `csv`), a `header` to nazwy kolumn.
pub fn parse_records(
    header: &[String],
    records: &[Vec<String>],
) -> Result<Vec<ImportedInstrument>, AppError> {
    let missing: Vec<&str> = REQUIRED_COLUMNS
        .iter()
        .copied()
        .filter(|col| !header.iter().any(|h| h.trim() == *col))
        .collect();
    if !missing.is_empty() {
        return Err(AppError::Validation(format!(
            "Plik nie ma wymaganych kolumn: {}. Oczekiwany jest eksport parametrów instrumentów z MT5.",
            missing.join(", ")
        )));
    }
    if records.is_empty() {
        return Err(AppError::Validation(
            "Plik nie zawiera ani jednego wiersza z instrumentem.".to_string(),
        ));
    }

    let mut instruments = Vec::with_capacity(records.len());
    let mut seen: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();
    for (i, record) in records.iter().enumerate() {
        let row_number = i + 2; // +1 na nagłówek, +1 bo ludzie liczą od 1.
        let map: HashMap<String, String> = header
            .iter()
            .zip(record.iter())
            .map(|(h, v)| (h.trim().to_string(), v.clone()))
            .collect();
        let instrument = parse_row(&map, row_number)?;
        // Kolizja: dwa wiersze dające ten sam symbol wyświetlany + wariant (sekcja 1.7 - nie
        // wolno stworzyć dwóch nierozróżnialnych pozycji).
        let key = (
            instrument.display_symbol.clone(),
            instrument.variant.clone(),
        );
        if !seen.insert(key) {
            return Err(AppError::Validation(format!(
                "Wiersz {row_number}: symbol wyświetlany \"{}\" (wariant {}) powtarza się w pliku - rozstrzygnij kolizję przed importem.",
                instrument.display_symbol, instrument.variant
            )));
        }
        instruments.push(instrument);
    }
    Ok(instruments)
}

/// Buduje podgląd (lekki, do pokazania w kreatorze) z pełnej listy sparsowanych instrumentów.
pub fn build_preview(instruments: &[ImportedInstrument]) -> ImportPreview {
    let mini_count = instruments.iter().filter(|i| i.variant == "MINI").count();
    let mut warnings = Vec::new();
    if mini_count > 0 {
        warnings.push(format!(
            "Rozpoznano {mini_count} instrumentów w wariancie MINI (sufiks -MINI)."
        ));
    }
    ImportPreview {
        row_count: instruments.len(),
        rows: instruments
            .iter()
            .map(|i| ImportPreviewRow {
                source_symbol: i.source_symbol.clone(),
                display_symbol: i.display_symbol.clone(),
                canonical_symbol: i.canonical_symbol.clone(),
                variant: i.variant.clone(),
                description: i.description.clone(),
                category: i.category.clone(),
                currency_profit: i.parameters.currency_profit.clone(),
                contract_size: i.parameters.contract_size.to_string(),
            })
            .collect(),
        warnings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header() -> Vec<String> {
        [
            "DisplaySymbol",
            "Symbol",
            "Description",
            "CurrencyBase",
            "CurrencyProfit",
            "CurrencyMargin",
            "Digits",
            "Point",
            "TradeTickSize",
            "TickValueProfit",
            "TickValueLoss",
            "ContractSize",
            "VolumeMin",
            "VolumeMax",
            "VolumeStep",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect()
    }

    fn row(display: &str, symbol: &str) -> Vec<String> {
        [
            display, symbol, "Opis", "EUR", "USD", "USD", "5", "0.00001", "0.00001", "1", "1",
            "100000", "0.01", "100", "0.01",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect()
    }

    #[test]
    fn derive_variant_recognizes_mini_suffix() {
        assert_eq!(
            derive_variant("DJI30-MINI"),
            ("DJI30".to_string(), "MINI".to_string())
        );
        assert_eq!(
            derive_variant("EURUSD"),
            ("EURUSD".to_string(), "STANDARD".to_string())
        );
    }

    #[test]
    fn parses_a_minimal_valid_file() {
        let records = vec![row("EURUSD", "EURUSD.ecn"), row("DJI30-MINI", "DJI30m")];
        let parsed = parse_records(&header(), &records).expect("parse");
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].source_symbol, "EURUSD.ecn");
        assert_eq!(parsed[0].display_symbol, "EURUSD");
        assert_eq!(parsed[0].canonical_symbol, "EURUSD");
        assert_eq!(parsed[0].variant, "STANDARD");
        assert_eq!(parsed[1].canonical_symbol, "DJI30");
        assert_eq!(parsed[1].variant, "MINI");
        assert_eq!(parsed[0].parameters.contract_size.to_string(), "100000");
    }

    #[test]
    fn missing_required_column_aborts_the_whole_import() {
        let mut h = header();
        h.retain(|c| c != "ContractSize");
        let records = vec![row("EURUSD", "EURUSD.ecn")];
        let result = parse_records(&h, &records);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn a_non_numeric_value_aborts_without_partial_result() {
        let mut bad = row("EURUSD", "EURUSD.ecn");
        bad[7] = "nie-liczba".to_string(); // Point
        let result = parse_records(&header(), &[bad]);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn duplicate_display_and_variant_is_rejected() {
        let records = vec![row("EURUSD", "EURUSD.ecn"), row("EURUSD", "EURUSD.raw")];
        let result = parse_records(&header(), &records);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn empty_file_is_rejected() {
        let result = parse_records(&header(), &[]);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn build_preview_reports_mini_variants() {
        let records = vec![row("EURUSD", "EURUSD.ecn"), row("DJI30-MINI", "DJI30m")];
        let parsed = parse_records(&header(), &records).expect("parse");
        let preview = build_preview(&parsed);
        assert_eq!(preview.row_count, 2);
        assert!(preview.warnings.iter().any(|w| w.contains("MINI")));
    }
}
