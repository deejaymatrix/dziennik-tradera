use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// Jeden wpis częściowego zamknięcia pozycji (sekcja 6.9). Zgodnie ze specyfikacją niesie
/// WYŁĄCZNIE dwie rzeczy: zamknięty lot i kwotę zrealizowanego wyniku tej części. Świadomie
/// nie ma tu ceny wyjścia ani daty - przy częściowych zamknięciach źródłem wyniku jest kwota
/// wpisana przez użytkownika (tak, jak raportuje ją broker), a nie przeliczenie z ceny. Dzięki
/// temu wynik nie jest liczony dwa razy.
///
/// `realized_pnl` może być UJEMNY - częściowe zamknięcie ze stratą to normalny przypadek.
/// Kwota jest w walucie rachunku, więc nie przechodzi przez przeliczanie kursem.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PartialClose {
    pub closed_volume: Decimal,
    pub realized_pnl: Decimal,
}

/// Suma zamkniętych lotów ze wszystkich wpisów.
pub fn closed_volume(closes: &[PartialClose]) -> Decimal {
    closes.iter().map(|c| c.closed_volume).sum()
}

/// Suma zrealizowanych wyników - to ONA jest źródłem wyniku brutto transakcji z częściowymi
/// zamknięciami (sekcja 6.9).
pub fn realized_pnl(closes: &[PartialClose]) -> Decimal {
    closes.iter().map(|c| c.realized_pnl).sum()
}

/// Lot pozostały do zamknięcia. Nigdy nie schodzi poniżej zera - walidacja i tak nie dopuszcza
/// sumy większej niż lot początkowy, ale gdyby dane w bazie były uszkodzone, lepiej pokazać `0`
/// niż ujemny lot sugerujący, że jest jeszcze coś do zamknięcia.
pub fn remaining_volume(initial_volume: Decimal, closes: &[PartialClose]) -> Decimal {
    let remaining = initial_volume - closed_volume(closes);
    if remaining.is_sign_negative() {
        Decimal::ZERO
    } else {
        remaining
    }
}

/// Czy częściowe zamknięcia domykają pozycję w całości. Steruje automatycznym statusem:
/// pozostały lot `0` -> transakcja zamknięta, więcej niż `0` -> nadal otwarta (sekcja 6.9).
pub fn closes_position_fully(initial_volume: Decimal, closes: &[PartialClose]) -> bool {
    !closes.is_empty() && remaining_volume(initial_volume, closes).is_zero()
}

/// Walidacja listy wpisów względem lota początkowego transakcji.
pub fn validate(closes: &[PartialClose], initial_volume: Option<Decimal>) -> Result<(), AppError> {
    if closes.is_empty() {
        return Ok(());
    }

    let Some(initial_volume) = initial_volume else {
        return Err(AppError::Validation(
            "Podaj lot transakcji, zanim dodasz częściowe zamknięcia.".to_string(),
        ));
    };

    for (index, close) in closes.iter().enumerate() {
        if close.closed_volume.is_sign_negative() || close.closed_volume.is_zero() {
            return Err(AppError::Validation(format!(
                "Zamknięty lot w częściowym zamknięciu nr {} musi być większy od zera.",
                index + 1
            )));
        }
    }

    let total_closed = closed_volume(closes);
    if total_closed > initial_volume {
        return Err(AppError::Validation(format!(
            "Suma zamkniętych lotów ({total_closed}) przekracza lot początkowy transakcji \
             ({initial_volume})."
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    fn close(volume: Decimal, pnl: Decimal) -> PartialClose {
        PartialClose {
            closed_volume: volume,
            realized_pnl: pnl,
        }
    }

    #[test]
    fn sumuje_loty_i_wyniki() {
        let closes = [
            close(dec!(0.3), dec!(45.10)),
            close(dec!(0.2), dec!(-12.40)),
        ];

        assert_eq!(closed_volume(&closes), dec!(0.5));
        assert_eq!(realized_pnl(&closes), dec!(32.70));
    }

    #[test]
    fn pozostaly_lot_to_roznica_wzgledem_lota_poczatkowego() {
        let closes = [close(dec!(0.3), dec!(10))];

        assert_eq!(remaining_volume(dec!(1.0), &closes), dec!(0.7));
        assert!(!closes_position_fully(dec!(1.0), &closes));
    }

    #[test]
    fn zamkniecie_calego_lota_domyka_pozycje() {
        let closes = [close(dec!(0.4), dec!(10)), close(dec!(0.6), dec!(-3))];

        assert_eq!(remaining_volume(dec!(1.0), &closes), Decimal::ZERO);
        assert!(closes_position_fully(dec!(1.0), &closes));
    }

    #[test]
    fn brak_wpisow_nie_domyka_pozycji() {
        // Pusta lista to "nie ma częściowych zamknięć", a nie "wszystko zamknięte" - inaczej
        // każda zwykła transakcja z lotem 0 byłaby uznana za domkniętą częściowymi.
        assert!(!closes_position_fully(dec!(1.0), &[]));
        assert!(validate(&[], None).is_ok());
    }

    #[test]
    fn odrzuca_zerowy_i_ujemny_zamkniety_lot() {
        let zero = [close(Decimal::ZERO, dec!(10))];
        let negative = [close(dec!(-0.1), dec!(10))];

        assert!(validate(&zero, Some(dec!(1.0))).is_err());
        assert!(validate(&negative, Some(dec!(1.0))).is_err());
    }

    #[test]
    fn komunikat_wskazuje_numer_bledego_wpisu() {
        let closes = [close(dec!(0.2), dec!(10)), close(Decimal::ZERO, dec!(5))];

        let error = validate(&closes, Some(dec!(1.0))).expect_err("zerowy lot");
        assert!(
            error.to_string().contains("nr 2"),
            "komunikat ma wskazywać KTÓRY wpis jest zły, było: {error}"
        );
    }

    #[test]
    fn odrzuca_sume_wieksza_niz_lot_poczatkowy() {
        let closes = [close(dec!(0.7), dec!(10)), close(dec!(0.5), dec!(10))];

        assert!(validate(&closes, Some(dec!(1.0))).is_err());
    }

    #[test]
    fn dopuszcza_sume_rowna_lotowi_poczatkowemu() {
        let closes = [close(dec!(0.7), dec!(10)), close(dec!(0.3), dec!(10))];

        assert!(validate(&closes, Some(dec!(1.0))).is_ok());
    }

    #[test]
    fn wymaga_lota_poczatkowego_gdy_sa_wpisy() {
        let closes = [close(dec!(0.1), dec!(10))];

        assert!(validate(&closes, None).is_err());
    }

    #[test]
    fn ujemny_zrealizowany_wynik_jest_dozwolony() {
        // Częściowe zamknięcie ze stratą to normalny przypadek - walidacja nie może go blokować.
        let closes = [close(dec!(0.5), dec!(-120.55))];

        assert!(validate(&closes, Some(dec!(1.0))).is_ok());
        assert_eq!(realized_pnl(&closes), dec!(-120.55));
    }
}
