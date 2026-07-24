use std::collections::HashSet;

use chrono::{DateTime, Local, NaiveDateTime, Utc};
use rust_decimal::Decimal;
use serde::Serialize;

use crate::application::accounts::AccountsService;
use crate::application::instruments::InstrumentsService;
use crate::application::trades::TradesService;
use crate::domain::instrument::{InstrumentListFilter, InstrumentVisibilityFilter};
use crate::domain::mt5_import::{parse_positions, RawMt5Position};
use crate::domain::trade::TradeInput;
use crate::error::AppError;

/// Znacznik zapisywany w `management_notes` każdej zaimportowanej transakcji - jedyny sposób
/// wykrycia powtórnego importu TEGO SAMEGO pliku (albo pliku z zachodzącym zakresem dat) bez
/// migracji schematu bazy o nowe pole na numer biletu MT5.
fn import_marker(ticket: &str) -> String {
    format!("Import MT5 #{ticket}")
}

fn already_imported_tickets(
    trades: &TradesService,
    account_id: &str,
) -> Result<HashSet<String>, AppError> {
    let existing = trades.list(account_id, true)?;
    Ok(existing
        .into_iter()
        .filter_map(|t| t.management_notes)
        .filter_map(|note| note.strip_prefix("Import MT5 #").map(|s| s.to_string()))
        .collect())
}

/// Zamienia czas z eksportu MT5 ("2025.10.09 16:42:42", czas serwera brokera) na `DateTime<Utc>`
/// tym samym założeniem co ręczne pole `datetime-local` w formularzu transakcji (patrz
/// `app/datetime.ts::fromDatetimeLocalValue`): traktuje wartość jako czas lokalny TEGO komputera,
/// nie serwera brokera - realny czas serwera zwykle różni się o kilka godzin, ale to ta sama,
/// spójna aproksymacja co przy ręcznym wpisywaniu, nie nowe, inne założenie tylko dla importu.
fn parse_mt5_time(raw: &str, ticket: &str, label: &str) -> Result<DateTime<Utc>, AppError> {
    let naive = NaiveDateTime::parse_from_str(raw, "%Y.%m.%d %H:%M:%S").map_err(|_| {
        AppError::Validation(format!(
            "Pozycja {ticket}: nie można odczytać {label} \"{raw}\"."
        ))
    })?;
    match naive.and_local_timezone(Local) {
        chrono::LocalResult::Single(dt) => Ok(dt.with_timezone(&Utc)),
        chrono::LocalResult::Ambiguous(dt, _) => Ok(dt.with_timezone(&Utc)),
        chrono::LocalResult::None => Err(AppError::Validation(format!(
            "Pozycja {ticket}: {label} \"{raw}\" nie istnieje w lokalnej strefie czasowej (zmiana czasu)."
        ))),
    }
}

/// Jeden wiersz podglądu importu - pokazuje użytkownikowi, co się stanie z KAŻDĄ pozycją zanim
/// cokolwiek zostanie zapisane (ten sam wzorzec co `ImportPreview` importu instrumentów brokera).
#[derive(Debug, Clone, Serialize)]
pub struct Mt5PreviewRow {
    pub ticket: String,
    pub symbol: String,
    pub side: String,
    pub volume: Decimal,
    pub open_time: String,
    pub close_time: String,
    pub instrument_id: Option<String>,
    pub already_imported: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct Mt5ImportPreview {
    pub row_count: usize,
    pub matched_count: usize,
    pub already_imported_count: usize,
    pub unmatched_symbols: Vec<String>,
    pub rows: Vec<Mt5PreviewRow>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Mt5ImportResult {
    pub imported_count: usize,
    pub skipped_unmatched: usize,
    pub skipped_duplicate: usize,
    pub errors: Vec<String>,
}

/// Skonstruowany na nowo przy KAŻDYM wywołaniu komendy (jak `require_db` w innych modułach
/// komend) - pożycza istniejące serwisy zamiast trzymać własne `Arc`, więc `TradesService`
/// (jedyny NIE trzymany w `Arc` w `DbState`) może być pożyczony bezpośrednio bez zmiany stanu
/// aplikacji.
pub struct Mt5ImportService<'a> {
    accounts: &'a AccountsService,
    instruments: &'a InstrumentsService,
    trades: &'a TradesService,
}

impl<'a> Mt5ImportService<'a> {
    pub fn new(
        accounts: &'a AccountsService,
        instruments: &'a InstrumentsService,
        trades: &'a TradesService,
    ) -> Self {
        Self {
            accounts,
            instruments,
            trades,
        }
    }

    /// Dopasowuje symbol brokera (np. "XAUUSDs") do instrumentu ZE SZABLONU przypisanego do
    /// konta - dokładne, bez uwzględniania wielkości liter porównanie z `source_symbol`. Bez
    /// przypisanego szablonu dopasowanie jest niemożliwe z definicji (symbole brokera nie mają
    /// sensu poza kontekstem jego własnego szablonu instrumentów).
    fn resolve_symbol_map(
        &self,
        account_id: &str,
    ) -> Result<std::collections::HashMap<String, String>, AppError> {
        let account = self.accounts.get(account_id)?;
        let Some(template_id) = account.account.template_id else {
            return Ok(std::collections::HashMap::new());
        };
        let filter = InstrumentListFilter {
            search: None,
            category: None,
            visibility: InstrumentVisibilityFilter::All,
            template_id: Some(template_id),
            user_created_only: false,
        };
        let instruments = self.instruments.list(filter)?;
        Ok(instruments
            .into_iter()
            .map(|i| (i.instrument.source_symbol.to_lowercase(), i.instrument.id))
            .collect())
    }

    fn build_trade_input(
        &self,
        account_id: &str,
        instrument_id: String,
        position: &RawMt5Position,
    ) -> Result<TradeInput, AppError> {
        Ok(TradeInput {
            account_id: account_id.to_string(),
            instrument_id: Some(instrument_id),
            strategy_id: None,
            side: position.side,
            opened_at: Some(parse_mt5_time(
                &position.open_time,
                &position.ticket,
                "czasu otwarcia",
            )?),
            closed_at: Some(parse_mt5_time(
                &position.close_time,
                &position.ticket,
                "czasu zamknięcia",
            )?),
            interval_id: None,
            session: None,
            volume: Some(position.volume),
            entry_price: Some(position.open_price),
            stop_loss: None,
            take_profit: None,
            exit_price: Some(position.close_price),
            commission: position.commission,
            swap: position.swap,
            other_fees: Decimal::ZERO,
            conversion_rate: None,
            plan_before: None,
            management_notes: Some(import_marker(&position.ticket)),
            post_trade_summary: None,
            conclusion: None,
            plan_adherence_rating: None,
            pnl_override: None,
            emotions: None,
            checklist: None,
            partial_closes: Vec::new(),
        })
    }

    pub fn preview(&self, account_id: &str, bytes: &[u8]) -> Result<Mt5ImportPreview, AppError> {
        let positions = parse_positions(bytes)?;
        let symbol_map = self.resolve_symbol_map(account_id)?;
        let imported_tickets = already_imported_tickets(self.trades, account_id)?;

        let mut unmatched_symbols: Vec<String> = Vec::new();
        let mut matched_count = 0usize;
        let mut already_imported_count = 0usize;
        let mut rows = Vec::with_capacity(positions.len());

        for position in &positions {
            let instrument_id = symbol_map.get(&position.symbol.to_lowercase()).cloned();
            let already_imported = imported_tickets.contains(&position.ticket);
            if instrument_id.is_some() {
                matched_count += 1;
            } else if !unmatched_symbols.contains(&position.symbol) {
                unmatched_symbols.push(position.symbol.clone());
            }
            if already_imported {
                already_imported_count += 1;
            }
            rows.push(Mt5PreviewRow {
                ticket: position.ticket.clone(),
                symbol: position.symbol.clone(),
                side: position.side.as_db_str().to_string(),
                volume: position.volume,
                open_time: position.open_time.clone(),
                close_time: position.close_time.clone(),
                instrument_id,
                already_imported,
            });
        }

        Ok(Mt5ImportPreview {
            row_count: positions.len(),
            matched_count,
            already_imported_count,
            unmatched_symbols,
            rows,
        })
    }

    /// Atomowy import: tworzy transakcję dla KAŻDEJ rozpoznanej, jeszcze niezaimportowanej
    /// pozycji przez dokładnie tę samą ścieżkę co ręczne wpisanie transakcji
    /// (`TradesService::create`) - silnik przeliczeń liczy `gross_pnl`/`net_pnl` sam, z
    /// parametrów rozpoznanego instrumentu, nigdy z wartości `Zysk` wprost z MT5.
    pub fn commit(&self, account_id: &str, bytes: &[u8]) -> Result<Mt5ImportResult, AppError> {
        let positions = parse_positions(bytes)?;
        let symbol_map = self.resolve_symbol_map(account_id)?;
        let imported_tickets = already_imported_tickets(self.trades, account_id)?;

        let mut imported_count = 0usize;
        let mut skipped_unmatched = 0usize;
        let mut skipped_duplicate = 0usize;
        let mut errors = Vec::new();

        for position in &positions {
            if imported_tickets.contains(&position.ticket) {
                skipped_duplicate += 1;
                continue;
            }
            let Some(instrument_id) = symbol_map.get(&position.symbol.to_lowercase()).cloned()
            else {
                skipped_unmatched += 1;
                continue;
            };
            match self.build_trade_input(account_id, instrument_id, position) {
                Ok(input) => match self.trades.create(input) {
                    Ok(_) => imported_count += 1,
                    Err(e) => errors.push(format!("Pozycja {}: {e}", position.ticket)),
                },
                Err(e) => errors.push(e.to_string()),
            }
        }

        Ok(Mt5ImportResult {
            imported_count,
            skipped_unmatched,
            skipped_duplicate,
            errors,
        })
    }
}
