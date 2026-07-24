use calamine::{Data, DataType, Reader, Xlsx};
use rust_decimal::prelude::FromPrimitive;
use rust_decimal::Decimal;
use std::io::{Cursor, Read, Write};
use std::str::FromStr;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

use super::trade::TradeSide;
use crate::error::AppError;

/// MT5 zapisuje WSZYSTKIE części XML swojego eksportu xlsx (`.rels`, `sharedStrings.xml`,
/// `worksheets/sheet1.xml`, ...) w UTF-16LE z BOM, mimo że kontener OOXML domyślnie zakłada
/// UTF-8 - potwierdzone na prawdziwym eksporcie użytkownika (bajty `FF FE 3C 00...`, nie `3C 3F
/// 78 6D 6C` jak przy zwykłym `<?xml`). `calamine` (via `quick-xml`) się na tym wywraca przy
/// czytaniu `.rels` ("Unexpected end of xml"). Ta funkcja otwiera plik jako zwykłe archiwum zip,
/// dekoduje każdą część zaczynającą się od BOM UTF-16LE z powrotem na UTF-8, i pakuje nowe,
/// poprawne archiwum w pamięci - bez dotykania samej logiki odczytu arkusza.
fn reencode_utf16_parts_to_utf8(bytes: &[u8]) -> Result<Vec<u8>, AppError> {
    let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(|e| {
        AppError::Validation(format!("Nie można otworzyć pliku jako archiwum zip: {e}"))
    })?;

    let mut output = Vec::new();
    {
        let mut writer = ZipWriter::new(Cursor::new(&mut output));
        let options = SimpleFileOptions::default();

        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| {
                AppError::Validation(format!("Nie można odczytać wpisu archiwum: {e}"))
            })?;
            let name = entry.name().to_string();

            if entry.is_dir() {
                writer.add_directory(&name, options).map_err(|e| {
                    AppError::Validation(format!("Nie można zapisać katalogu \"{name}\": {e}"))
                })?;
                continue;
            }

            let mut raw = Vec::new();
            entry
                .read_to_end(&mut raw)
                .map_err(|e| AppError::Validation(format!("Nie można odczytać \"{name}\": {e}")))?;

            let content = if raw.starts_with(&[0xFF, 0xFE]) {
                let units: Vec<u16> = raw[2..]
                    .chunks_exact(2)
                    .map(|c| u16::from_le_bytes([c[0], c[1]]))
                    .collect();
                let text = String::from_utf16(&units).map_err(|_| {
                    AppError::Validation(format!("Nie można zdekodować \"{name}\" jako UTF-16."))
                })?;
                text.into_bytes()
            } else {
                raw
            };

            writer
                .start_file(&name, options)
                .map_err(|e| AppError::Validation(format!("Nie można zapisać \"{name}\": {e}")))?;
            writer
                .write_all(&content)
                .map_err(|e| AppError::Validation(format!("Nie można zapisać \"{name}\": {e}")))?;
        }

        writer
            .finish()
            .map_err(|e| AppError::Validation(format!("Nie można zamknąć archiwum: {e}")))?;
    }

    Ok(output)
}

/// Jedna zamknięta pozycja z sekcji "Pozycje" raportu historii MT5 - dokładnie to, czego
/// potrzebuje ręczny formularz transakcji (para otwarcie/zamknięcie), bez surowych wypełnień
/// zleceń. Ceny/czasy PRZED dopasowaniem do instrumentu i konta - to robi warstwa aplikacyjna.
///
/// `commission`/`swap` są już ZNEGOWANE względem surowego MT5 (który zapisuje koszt jako liczbę
/// ujemną) - odwrotna konwencja tej aplikacji, gdzie `TradeInput::commission`/`swap` to DODATNI
/// koszt odejmowany przy liczeniu `net_pnl` (patrz `domain::trade_calculations::calculate` -
/// `net_pnl = gross_pnl - commission - swap - other_fees`). Świadomie NIE przenosimy `Zysk` z
/// MT5 wprost - `gross_pnl`/`net_pnl` liczy WYŁĄCZNIE silnik tej aplikacji z ceny/wolumenu/
/// parametrów instrumentu, tak samo jak przy ręcznym wpisaniu transakcji ("Rust liczy pieniądze").
/// Świadomie POMIJA S/L i T/P - to ostatnia wartość z chwili zamknięcia (mogła być przesunięta
/// na profit trailing stopem), a walidacja formularza wymaga SL/TP po stronie ryzyka/zysku
/// względem ceny wejścia - import nie zgaduje, czy historyczna wartość wciąż to spełnia.
#[derive(Debug, Clone, PartialEq)]
pub struct RawMt5Position {
    /// Numer biletu pozycji z MT5 (kolumna "Pozycja") - stabilny identyfikator do wykrywania
    /// powtórnego importu tego samego pliku.
    pub ticket: String,
    pub symbol: String,
    pub side: TradeSide,
    pub volume: Decimal,
    /// Czas otwarcia w formacie MT5 verbatim (np. "2025.10.09 16:42:42") - konwersja do UTC
    /// zostawiona warstwie wyżej, tym samym mechanizmem co ręczne pole `datetime-local`.
    pub open_time: String,
    pub open_price: Decimal,
    pub close_time: String,
    pub close_price: Decimal,
    pub commission: Decimal,
    pub swap: Decimal,
}

fn cell_text(row: &[Data], idx: usize) -> String {
    row.get(idx)
        .and_then(|c| c.as_string())
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn cell_decimal(row: &[Data], idx: usize, label: &str, ticket: &str) -> Result<Decimal, AppError> {
    let cell = row.get(idx);
    if let Some(text) = cell.and_then(|c| c.as_string()) {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Decimal::from_str(trimmed).map_err(|_| {
                AppError::Validation(format!(
                    "Pozycja {ticket}: nieprawidłowa wartość w kolumnie \"{label}\": \"{trimmed}\"."
                ))
            });
        }
    }
    if let Some(f) = cell.and_then(|c| c.get_float()) {
        return Decimal::from_f64(f).ok_or_else(|| {
            AppError::Validation(format!(
                "Pozycja {ticket}: nie można zamienić liczby w kolumnie \"{label}\" na wartość dziesiętną."
            ))
        });
    }
    Err(AppError::Validation(format!(
        "Pozycja {ticket}: brak wartości w kolumnie \"{label}\"."
    )))
}

fn parse_position_row(row: &[Data]) -> Result<RawMt5Position, AppError> {
    let ticket = cell_text(row, 1);
    let open_time = cell_text(row, 0);
    let symbol = cell_text(row, 2);
    let side_raw = cell_text(row, 3);
    let side = match side_raw.as_str() {
        "buy" => TradeSide::Buy,
        "sell" => TradeSide::Sell,
        other => {
            return Err(AppError::Validation(format!(
                "Pozycja {ticket}: nieznany kierunek \"{other}\" (oczekiwano buy/sell)."
            )))
        }
    };
    let volume = cell_decimal(row, 4, "Wolumen", &ticket)?;
    let open_price = cell_decimal(row, 5, "Cena otwarcia", &ticket)?;
    let close_time = cell_text(row, 8);
    let close_price = cell_decimal(row, 9, "Cena zamknięcia", &ticket)?;
    let raw_commission = cell_decimal(row, 10, "Prowizja", &ticket)?;
    let raw_swap = cell_decimal(row, 11, "Swap", &ticket)?;

    Ok(RawMt5Position {
        ticket,
        symbol,
        side,
        volume,
        open_time,
        open_price,
        close_time,
        close_price,
        commission: -raw_commission,
        swap: -raw_swap,
    })
}

/// Parsuje sekcję "Pozycje" raportu historii MT5 (xlsx wyeksportowany z terminala: Historia →
/// prawy klik → Zapisz jako Raport). Świadomie ignoruje sekcje "Zlecenia"/"Transakcje" (surowe
/// zlecenia/wypełnienia) - "Pozycje" już daje jeden wiersz na zamkniętą pozycję, dokładnie to,
/// czego potrzebuje `TradeInput`.
pub fn parse_positions(bytes: &[u8]) -> Result<Vec<RawMt5Position>, AppError> {
    let normalized = reencode_utf16_parts_to_utf8(bytes)?;
    let cursor = Cursor::new(normalized);
    let mut workbook: Xlsx<_> = Xlsx::new(cursor)
        .map_err(|e| AppError::Validation(format!("Nie można odczytać pliku xlsx: {e}")))?;
    let sheet_name = workbook.sheet_names().into_iter().next().ok_or_else(|| {
        AppError::Validation("Plik xlsx nie zawiera żadnego arkusza.".to_string())
    })?;
    let range = workbook.worksheet_range(&sheet_name).map_err(|e| {
        AppError::Validation(format!("Nie można odczytać arkusza \"{sheet_name}\": {e}"))
    })?;

    let rows: Vec<Vec<Data>> = range.rows().map(|r| r.to_vec()).collect();

    let section_idx = rows
        .iter()
        .position(|row| cell_text(row, 0) == "Pozycje")
        .ok_or_else(|| {
            AppError::Validation(
                "Nie znaleziono sekcji \"Pozycje\" w pliku - to nie wygląda na eksport historii \
                 konta MT5 (Historia → prawy klik → Zapisz jako Raport)."
                    .to_string(),
            )
        })?;

    let mut positions = Vec::new();
    // Dane zaczynają się dwa wiersze po etykiecie sekcji: etykieta, potem wiersz nagłówków kolumn.
    for row in rows.iter().skip(section_idx + 2) {
        let col_a = cell_text(row, 0);
        if col_a.is_empty() || col_a == "Zlecenia" {
            break;
        }
        positions.push(parse_position_row(row)?);
    }
    Ok(positions)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;
    use rust_xlsxwriter::Workbook;

    /// Buduje w pamięci minimalny plik xlsx o dokładnie takim kształcie jak prawdziwy eksport
    /// MT5 (nagłówek konta + sekcja "Pozycje" + kolejna sekcja "Zlecenia") - bez zapisu na dysk,
    /// zgodnie z konwencją programowego generowania danych testowych tego projektu.
    fn build_fixture(position_rows: &[[&str; 13]]) -> Vec<u8> {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();

        sheet.write_string(0, 0, "Raport Historii Trade").unwrap();
        sheet.write_string(1, 0, "Nazwa:").unwrap();
        sheet.write_string(1, 3, "TEST TESTOWY").unwrap();
        sheet.write_string(2, 0, "Rachunek:").unwrap();
        sheet
            .write_string(2, 3, "111222 (USD, Test-Server, real, Hedge)")
            .unwrap();
        sheet.write_string(3, 0, "Firma:").unwrap();
        sheet.write_string(3, 3, "Test Broker LLC").unwrap();
        sheet.write_string(4, 0, "Data:").unwrap();
        sheet.write_string(4, 3, "2026.07.24 12:00").unwrap();

        sheet.write_string(5, 0, "Pozycje").unwrap();
        let headers = [
            "Czas",
            "Pozycja",
            "Instrument",
            "Typ",
            "Wolumen",
            "Cena",
            "S / L",
            "T / P",
            "Czas",
            "Cena",
            "Prowizja",
            "Swap",
            "Zysk",
        ];
        for (col, header) in headers.iter().enumerate() {
            sheet.write_string(6, col as u16, *header).unwrap();
        }

        let mut row_idx = 7u32;
        for fields in position_rows {
            sheet.write_string(row_idx, 0, fields[0]).unwrap(); // Czas otwarcia
            sheet.write_string(row_idx, 1, fields[1]).unwrap(); // Pozycja (ticket)
            sheet.write_string(row_idx, 2, fields[2]).unwrap(); // Instrument
            sheet.write_string(row_idx, 3, fields[3]).unwrap(); // Typ
            sheet.write_string(row_idx, 4, fields[4]).unwrap(); // Wolumen (tekst, jak MT5)
            sheet
                .write_number(row_idx, 5, fields[5].parse::<f64>().unwrap())
                .unwrap(); // Cena otwarcia (liczba, jak MT5)
                           // S/L, T/P (6, 7) świadomie puste - jak w prawdziwym eksporcie.
            sheet.write_string(row_idx, 8, fields[8]).unwrap(); // Czas zamknięcia
            sheet
                .write_number(row_idx, 9, fields[9].parse::<f64>().unwrap())
                .unwrap(); // Cena zamknięcia
            sheet
                .write_number(row_idx, 10, fields[10].parse::<f64>().unwrap())
                .unwrap(); // Prowizja
            sheet
                .write_number(row_idx, 11, fields[11].parse::<f64>().unwrap())
                .unwrap(); // Swap
            sheet
                .write_number(row_idx, 12, fields[12].parse::<f64>().unwrap())
                .unwrap(); // Zysk
            row_idx += 1;
        }

        // Wiersz 8 dalej: kolejna sekcja "Zlecenia" - potwierdza, że parser się tam zatrzymuje.
        sheet.write_string(row_idx, 0, "Zlecenia").unwrap();

        workbook.save_to_buffer().unwrap()
    }

    #[test]
    fn parsuje_dwie_pozycje_z_prawidlowymi_wartosciami() {
        let bytes = build_fixture(&[
            [
                "2025.10.09 16:42:42",
                "188897878",
                "XAUUSDs",
                "buy",
                "0.2",
                "4038.69",
                "",
                "",
                "2025.10.09 16:43:10",
                "4033.68",
                "-1.20",
                "0.00",
                "-100.20",
            ],
            [
                "2025.10.10 17:04:39",
                "189880141",
                "XAUUSDs",
                "sell",
                "0.1",
                "3974.85",
                "",
                "",
                "2025.10.10 17:06:39",
                "3976.37",
                "-0.60",
                "0.00",
                "-15.20",
            ],
        ]);

        let positions = parse_positions(&bytes).expect("parsowanie powinno się udać");

        assert_eq!(positions.len(), 2);

        assert_eq!(positions[0].ticket, "188897878");
        assert_eq!(positions[0].symbol, "XAUUSDs");
        assert_eq!(positions[0].side, TradeSide::Buy);
        assert_eq!(positions[0].volume, dec!(0.2));
        assert_eq!(positions[0].open_time, "2025.10.09 16:42:42");
        assert_eq!(positions[0].open_price, dec!(4038.69));
        assert_eq!(positions[0].close_time, "2025.10.09 16:43:10");
        assert_eq!(positions[0].close_price, dec!(4033.68));
        // Komisja/swap MUSZĄ być zanegowane względem surowego MT5 (-1.20 → +1.20).
        assert_eq!(positions[0].commission, dec!(1.20));
        assert_eq!(positions[0].swap, dec!(0.00));

        assert_eq!(positions[1].side, TradeSide::Sell);
        assert_eq!(positions[1].volume, dec!(0.1));
    }

    #[test]
    fn zatrzymuje_sie_na_sekcji_zlecenia_i_nie_czyta_dalej() {
        let bytes = build_fixture(&[[
            "2025.10.09 16:42:42",
            "188897878",
            "XAUUSDs",
            "buy",
            "0.2",
            "4038.69",
            "",
            "",
            "2025.10.09 16:43:10",
            "4033.68",
            "-1.20",
            "0.00",
            "-100.20",
        ]]);

        let positions = parse_positions(&bytes).expect("parsowanie powinno się udać");

        assert_eq!(
            positions.len(),
            1,
            "nie może wczytać wiersza z \"Zlecenia\""
        );
    }

    #[test]
    fn odrzuca_plik_bez_sekcji_pozycje() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.write_string(0, 0, "Coś zupełnie innego").unwrap();
        let bytes = workbook.save_to_buffer().unwrap();

        let result = parse_positions(&bytes);

        assert!(
            result.is_err(),
            "plik bez sekcji \"Pozycje\" musi zostać odrzucony"
        );
    }

    #[test]
    fn odrzuca_nieznany_kierunek() {
        let bytes = build_fixture(&[[
            "2025.10.09 16:42:42",
            "188897878",
            "XAUUSDs",
            "close_by", // kierunek spoza buy/sell - realny w MT5 przy zamknięciu krzyżowym
            "0.2",
            "4038.69",
            "",
            "",
            "2025.10.09 16:43:10",
            "4033.68",
            "-1.20",
            "0.00",
            "-100.20",
        ]]);

        let result = parse_positions(&bytes);

        assert!(
            result.is_err(),
            "nieznany kierunek musi być odrzucony, nie zgadywany"
        );
    }

    #[test]
    fn dekoduje_czesci_xml_zapisane_w_utf16_z_bom() {
        // Prawdziwy eksport MT5 zapisuje WSZYSTKIE części xlsx (.rels, sharedStrings, arkusz) w
        // UTF-16LE z BOM, mimo że OOXML domyślnie zakłada UTF-8 - `calamine` się na tym wywala
        // ("Unexpected end of xml"), potwierdzone na prawdziwym pliku użytkownika. Ten test
        // odtwarza sam mechanizm: bierze poprawny plik z `build_fixture` i re-koduje KAŻDĄ jego
        // część tekstową do UTF-16LE z BOM, tak jak robi to MT5, i sprawdza że parser wciąż
        // sobie radzi (dzięki `reencode_utf16_parts_to_utf8`).
        let utf8_bytes = build_fixture(&[[
            "2025.10.09 16:42:42",
            "188897878",
            "XAUUSDs",
            "buy",
            "0.2",
            "4038.69",
            "",
            "",
            "2025.10.09 16:43:10",
            "4033.68",
            "-1.20",
            "0.00",
            "-100.20",
        ]]);

        let mut archive = ZipArchive::new(Cursor::new(&utf8_bytes)).unwrap();
        let mut utf16_bytes = Vec::new();
        {
            let mut writer = ZipWriter::new(Cursor::new(&mut utf16_bytes));
            let options = SimpleFileOptions::default();
            for i in 0..archive.len() {
                let mut entry = archive.by_index(i).unwrap();
                let name = entry.name().to_string();
                if entry.is_dir() {
                    writer.add_directory(&name, options).unwrap();
                    continue;
                }
                let mut raw = Vec::new();
                entry.read_to_end(&mut raw).unwrap();
                writer.start_file(&name, options).unwrap();
                if name.ends_with(".xml") || name.ends_with(".rels") {
                    let text = String::from_utf8(raw).unwrap();
                    let mut encoded: Vec<u8> = vec![0xFF, 0xFE];
                    for unit in text.encode_utf16() {
                        encoded.extend_from_slice(&unit.to_le_bytes());
                    }
                    writer.write_all(&encoded).unwrap();
                } else {
                    writer.write_all(&raw).unwrap();
                }
            }
            writer.finish().unwrap();
        }

        let positions = parse_positions(&utf16_bytes).expect("parser musi obsłużyć UTF-16 z BOM");

        assert_eq!(positions.len(), 1);
        assert_eq!(positions[0].ticket, "188897878");
        assert_eq!(positions[0].symbol, "XAUUSDs");
    }
}
