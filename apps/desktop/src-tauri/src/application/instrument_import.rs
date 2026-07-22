use std::sync::Arc;

use crate::domain::broker_template::{BrokerTemplate, BrokerTemplateRepository, NewTemplate};
use crate::domain::instrument_import::{build_preview, parse_records, ImportPreview};
use crate::error::AppError;

/// Warstwa aplikacyjna importu instrumentów z pliku brokera (B3, sekcja 1.5 specyfikacji).
/// Odpowiada za: sparsowanie tekstu CSV crate'em `csv` (obsługa cudzysłowów/przecinków),
/// zbudowanie podglądu BEZ zapisu, oraz atomowy import jako nowy szablon. Sama walidacja i
/// normalizacja symboli żyje w `domain::instrument_import` (czysta, testowalna).
pub struct InstrumentImportService {
    templates: Arc<dyn BrokerTemplateRepository + Send + Sync>,
}

impl InstrumentImportService {
    pub fn new(templates: Arc<dyn BrokerTemplateRepository + Send + Sync>) -> Self {
        Self { templates }
    }

    /// Rozbija tekst CSV na nagłówek + wiersze. Akceptuje separator przecinkowy i pola w
    /// cudzysłowach (format eksportu MT5). Elastyczna liczba pól, żeby brak paru kolumn
    /// opcjonalnych nie wywracał parsera - domenowy parser i tak sprawdzi kolumny wymagane.
    fn split_csv(csv_text: &str) -> Result<(Vec<String>, Vec<Vec<String>>), AppError> {
        let mut reader = csv::ReaderBuilder::new()
            .has_headers(true)
            .flexible(true)
            .trim(csv::Trim::All)
            .from_reader(csv_text.as_bytes());

        let header: Vec<String> = reader
            .headers()
            .map_err(|e| {
                AppError::Validation(format!("Nie można odczytać nagłówka pliku CSV: {e}"))
            })?
            .iter()
            .map(str::to_string)
            .collect();

        let mut records = Vec::new();
        for result in reader.records() {
            let record = result
                .map_err(|e| AppError::Validation(format!("Błąd odczytu wiersza CSV: {e}")))?;
            // Pomiń całkowicie puste wiersze (końcowe znaki nowej linii).
            if record.iter().all(|f| f.trim().is_empty()) {
                continue;
            }
            records.push(record.iter().map(str::to_string).collect());
        }
        Ok((header, records))
    }

    /// Podgląd bez zapisu - kreator pokazuje użytkownikowi, co powstanie, zanim zatwierdzi.
    pub fn preview(&self, csv_text: &str) -> Result<ImportPreview, AppError> {
        let (header, records) = Self::split_csv(csv_text)?;
        let instruments = parse_records(&header, &records)?;
        Ok(build_preview(&instruments))
    }

    /// Atomowy import jako nowy szablon (żaden częściowy szablon nie powstaje przy błędzie).
    pub fn import_as_new_template(
        &self,
        name: String,
        broker_name: String,
        account_type: Option<String>,
        csv_text: &str,
    ) -> Result<BrokerTemplate, AppError> {
        let (header, records) = Self::split_csv(csv_text)?;
        let instruments = parse_records(&header, &records)?;
        let meta = NewTemplate {
            name,
            broker_name,
            account_type,
        };
        self.templates.create_from_import(&meta, &instruments)
    }

    /// Atomowy import do istniejącego szablonu - dokładnie raz na szablon (B3+, zmiana zakresu:
    /// import odbywa się teraz w zakładce "Instrumenty", w kontekście wybranego szablonu).
    pub fn import_into_template(
        &self,
        template_id: &str,
        csv_text: &str,
    ) -> Result<BrokerTemplate, AppError> {
        let (header, records) = Self::split_csv(csv_text)?;
        let instruments = parse_records(&header, &records)?;
        self.templates
            .import_into_template(template_id, &instruments)
    }
}
