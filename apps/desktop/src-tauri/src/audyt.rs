//! Audyt A2 planu pracy: przejście przez aplikację tak, jak robi to końcowy użytkownik,
//! na CZTERECH wariantach bazy wymaganych przez sekcję 20.1 promptu.
//!
//! Ten moduł istnieje wyłącznie w testach (`#[cfg(test)]`). Uruchamia PEŁNY stos, ten sam co
//! aplikacja: `init_db_state` buduje prawdziwy rejestr usług na prawdziwym pliku SQLite po
//! prawdziwych migracjach. Testy jednostkowe poszczególnych modułów sprawdzają reguły w izolacji;
//! ten moduł sprawdza to, czego one z definicji nie widzą - czy całość, złożona do kupy i
//! wywołana w kolejności takiej jak z interfejsu, nie wywraca się i nie kłamie w liczbach.
//!
//! Cztery warianty:
//! 1. pusta baza - świeża instalacja, żaden ekran nie może paniкować ani dzielić przez zero;
//! 2. baza z przykładowymi danymi - typowa praca;
//! 3. baza po migracjach - tu tożsama z pkt 1/2, bo `init_db_state` ZAWSZE przechodzi pełny
//!    łańcuch migracji od zera; osobno sprawdzamy, że drugie otwarcie tego samego pliku
//!    niczego nie psuje (to jest realny "restart aplikacji" z listy przepływów);
//! 4. większy zbiór - kilkaset transakcji, żeby wyłapać koszty i przepełnienia w agregatach.

use std::path::Path;

use chrono::{Duration, Utc};
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use tempfile::TempDir;

use crate::application::reports::ReportFilter;
use crate::domain::account::NewAccount;
use crate::domain::trade::{TradeInput, TradeSide};
use crate::init_db_state;
use crate::state::DbState;

/// Otwiera stan aplikacji na świeżym katalogu danych - dokładnie tak, jak przy starcie programu.
fn otworz(dir: &Path) -> DbState {
    init_db_state(dir)
}

fn gotowy(state: &DbState) -> &DbState {
    match state {
        DbState::Ready { .. } => state,
        DbState::Failed { reason } => panic!("baza nie wystartowała: {reason}"),
    }
}

macro_rules! uslugi {
    ($state:expr) => {
        match $state {
            DbState::Ready {
                accounts,
                instruments,
                strategies,
                intervals,
                trades,
                reports,
                emotional_states,
                trading_rules,
                broker_templates,
                trash,
                preferences,
                ..
            } => (
                accounts,
                instruments,
                strategies,
                intervals,
                trades,
                reports,
                emotional_states,
                trading_rules,
                broker_templates,
                trash,
                preferences,
            ),
            DbState::Failed { reason } => panic!("baza nie wystartowała: {reason}"),
        }
    };
}

fn nowe_konto(state: &DbState, nazwa: &str, saldo: Decimal) -> String {
    let (accounts, ..) = uslugi!(state);
    accounts
        .create(NewAccount {
            name: nazwa.to_string(),
            description: None,
            account_type: None,
            currency: "USD".to_string(),
            initial_balance: saldo,
        })
        .expect("utworzenie konta")
        .account
        .id
}

/// Pierwszy instrument z fabrycznego katalogu - zamknięcie pozycji wymaga instrumentu
/// (bez jego specyfikacji nie da się policzyć wartości punktu), więc każda transakcja w audycie
/// musi go mieć. To reguła aplikacji, nie ograniczenie testu.
fn jakis_instrument(state: &DbState) -> String {
    let (_, instruments, ..) = uslugi!(state);
    instruments
        .list(Default::default())
        .expect("instrumenty")
        .first()
        .expect("fabryczny katalog instrumentów nie może być pusty")
        .instrument
        .id
        .clone()
}

/// Minimalna zamknięta transakcja - tyle, ile wystarcza, żeby weszła do salda i raportów.
fn zamknieta_transakcja(
    state: &DbState,
    account_id: &str,
    instrument_id: Option<String>,
    dni_temu: i64,
    wejscie: Decimal,
    wyjscie: Decimal,
) -> String {
    let (.., trades, _, _, _, _, _, _) = uslugi!(state);
    let otwarcie = Utc::now() - Duration::days(dni_temu);
    trades
        .create(TradeInput {
            account_id: account_id.to_string(),
            instrument_id,
            strategy_id: None,
            side: TradeSide::Buy,
            opened_at: Some(otwarcie),
            closed_at: Some(otwarcie + Duration::hours(2)),
            interval_id: None,
            session: None,
            volume: Some(dec!(1)),
            entry_price: Some(wejscie),
            exit_price: Some(wyjscie),
            stop_loss: None,
            take_profit: None,
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
        })
        .expect("zapis transakcji")
        .id
}

/// Wywołuje wszystko, co interfejs wywołuje przy zwykłym przeglądaniu aplikacji. Sam fakt, że
/// przechodzi bez panic i bez błędu, jest tu testowaną własnością - użytkownik klikając po
/// zakładkach uruchamia dokładnie te ścieżki.
fn przejdz_po_wszystkich_ekranach(state: &DbState) {
    let (
        accounts,
        instruments,
        strategies,
        intervals,
        trades,
        reports,
        emotional_states,
        trading_rules,
        broker_templates,
        trash,
        preferences,
    ) = uslugi!(state);

    let konta = accounts.list(true).expect("lista kont");
    instruments.list(Default::default()).expect("instrumenty");
    strategies.list(true).expect("strategie");
    intervals.list(true, true).expect("interwały");
    emotional_states.list(true).expect("emocje");
    trading_rules.get().expect("zasady handlu");
    broker_templates.list(true).expect("szablony brokerów");
    trash.list().expect("kosz");
    preferences.get().expect("ustawienia");

    for konto in &konta {
        let id = &konto.account.id;
        accounts.get(id).expect("szczegóły konta");
        accounts.list_cash_operations(id).expect("wpłaty i wypłaty");
        let lista = trades.list(id, true).expect("historia transakcji");
        reports.get_account_report(id).expect("raport konta");
        reports
            .get_filtered_report(ReportFilter {
                account_id: id.clone(),
                instrument_id: None,
                strategy_id: None,
                interval_id: None,
                side: None,
                year: None,
                month: None,
            })
            .expect("raport z filtrem");

        // Karta transakcji: szczegóły, dziennik zmian i kontekst salda dla KAŻDEJ pozycji.
        for t in lista.iter().take(25) {
            trades.get(&t.id).expect("szczegóły transakcji");
            trades.list_audit_log(&t.id).expect("dziennik zmian");
            trades.balance_context(&t.id).expect("kontekst salda");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Wariant 1: pusta baza. Najgroźniejszy moment w życiu aplikacji - świeża instalacja,
    /// zero danych, a każdy ekran musi się otworzyć i pokazać sensowny stan pusty zamiast
    /// wywrócić się na dzieleniu przez zero albo `unwrap()` na pustej liście.
    #[test]
    fn pusta_baza_otwiera_kazdy_ekran() {
        let dir = TempDir::new().expect("katalog");
        let state = otworz(dir.path());
        gotowy(&state);

        let (accounts, instruments, ..) = uslugi!(&state);
        assert!(accounts.list(true).expect("konta").is_empty());
        // Instrumenty NIE są puste na starcie - fabryczny katalog jest częścią migracji.
        assert!(
            !instruments
                .list(Default::default())
                .expect("instrumenty")
                .is_empty(),
            "świeża baza musi mieć fabryczny katalog instrumentów"
        );

        przejdz_po_wszystkich_ekranach(&state);
    }

    /// Wariant 1b: konto bez ANI JEDNEJ transakcji. Raport liczy wtedy średnie i wskaźniki
    /// z pustego zbioru - klasyczne miejsce na dzielenie przez zero.
    #[test]
    fn konto_bez_transakcji_ma_policzalny_raport() {
        let dir = TempDir::new().expect("katalog");
        let state = otworz(dir.path());
        let konto = nowe_konto(&state, "Świeże konto", dec!(10000));

        let (.., reports, _, _, _, _, _) = uslugi!(&state);
        let raport = reports.get_account_report(&konto).expect("raport");
        assert_eq!(raport.stats.closed_trades, 0);

        przejdz_po_wszystkich_ekranach(&state);
    }

    /// Wariant 2: baza z przykładowymi danymi - typowa praca użytkownika.
    #[test]
    fn baza_z_danymi_zgadza_saldo_z_transakcjami() {
        let dir = TempDir::new().expect("katalog");
        let state = otworz(dir.path());
        let konto = nowe_konto(&state, "Konto robocze", dec!(10000));
        let instrument = jakis_instrument(&state);

        // Trzy zyskowne i dwie stratne, każda po 1 lot na kwotowaniu 1:1 wartości punktu.
        for (wejscie, wyjscie) in [
            (dec!(100), dec!(110)),
            (dec!(100), dec!(105)),
            (dec!(100), dec!(101)),
            (dec!(100), dec!(97)),
            (dec!(100), dec!(90)),
        ] {
            zamknieta_transakcja(
                &state,
                &konto,
                Some(instrument.clone()),
                5,
                wejscie,
                wyjscie,
            );
        }

        let (accounts, .., trades, _, _, _, _, _, _) = uslugi!(&state);
        let lista = trades.list(&konto, false).expect("transakcje");
        assert_eq!(lista.len(), 5);

        // Saldo konta MUSI być sumą salda początkowego i wyników - to jest właśnie ta liczba,
        // na którą użytkownik patrzy i której nie ma jak sprawdzić inaczej niż ufając aplikacji.
        let suma_wynikow: Decimal = lista.iter().filter_map(|t| t.net_pnl).sum();
        let konto_po = accounts.get(&konto).expect("konto");
        assert_eq!(
            konto_po.balance,
            dec!(10000) + suma_wynikow,
            "saldo rozjechało się z sumą wyników transakcji"
        );

        przejdz_po_wszystkich_ekranach(&state);
    }

    /// Wariant 3: istniejąca baza otwarta PONOWNIE - to jest "restart aplikacji" z listy
    /// przepływów. Drugie `init_db_state` na tym samym katalogu przechodzi przez migracje
    /// jeszcze raz i nie ma prawa niczego zgubić ani zdublować.
    #[test]
    fn ponowne_otwarcie_bazy_zachowuje_dane() {
        let dir = TempDir::new().expect("katalog");

        let (konto, saldo_przed, liczba_przed) = {
            let state = otworz(dir.path());
            let konto = nowe_konto(&state, "Konto trwałe", dec!(5000));
            let instrument = jakis_instrument(&state);
            zamknieta_transakcja(
                &state,
                &konto,
                Some(instrument.clone()),
                3,
                dec!(50),
                dec!(55),
            );
            zamknieta_transakcja(
                &state,
                &konto,
                Some(instrument.clone()),
                2,
                dec!(50),
                dec!(48),
            );
            let (accounts, .., trades, _, _, _, _, _, _) = uslugi!(&state);
            let saldo = accounts.get(&konto).expect("konto").balance;
            let n = trades.list(&konto, false).expect("transakcje").len();
            (konto, saldo, n)
        };

        // Drugie otwarcie - jak po zamknięciu i ponownym uruchomieniu programu.
        let state = otworz(dir.path());
        gotowy(&state);
        let (accounts, .., trades, _, _, _, _, _, _) = uslugi!(&state);
        assert_eq!(
            accounts.get(&konto).expect("konto").balance,
            saldo_przed,
            "saldo zmieniło się po restarcie aplikacji"
        );
        assert_eq!(
            trades.list(&konto, false).expect("transakcje").len(),
            liczba_przed,
            "liczba transakcji zmieniła się po restarcie aplikacji"
        );

        przejdz_po_wszystkich_ekranach(&state);
    }

    /// Wariant 4: większy zbiór danych. 300 transakcji to więcej, niż użytkownik zrobi
    /// w kilka miesięcy, a wystarczy, żeby wyszły błędy agregacji i koszty zapytań N+1.
    #[test]
    fn wiekszy_zbior_danych_liczy_sie_spojnie() {
        let dir = TempDir::new().expect("katalog");
        let state = otworz(dir.path());
        let konto = nowe_konto(&state, "Konto z historią", dec!(100000));
        let instrument = jakis_instrument(&state);

        for i in 0..300i64 {
            // Naprzemiennie zysk i strata, rozłożone na przestrzeni roku - dzięki temu
            // podziały na miesiące, kwartały i dni tygodnia dostają niepuste kubełki.
            let (wejscie, wyjscie) = if i % 2 == 0 {
                (dec!(100), dec!(102))
            } else {
                (dec!(100), dec!(99))
            };
            zamknieta_transakcja(
                &state,
                &konto,
                Some(instrument.clone()),
                i % 360,
                wejscie,
                wyjscie,
            );
        }

        let (accounts, .., trades, reports, _, _, _, _, _) = uslugi!(&state);
        let lista = trades.list(&konto, false).expect("transakcje");
        assert_eq!(lista.len(), 300);

        let suma_wynikow: Decimal = lista.iter().filter_map(|t| t.net_pnl).sum();

        // Kwoty NIE są sprawdzane wprost do wyliczonej ręcznie liczby: wynik zależy od
        // specyfikacji instrumentu (wielkości kontraktu i wartości punktu), a te są własnością
        // fabrycznego katalogu i mogą się zmieniać. Sprawdzamy własności, które muszą zachodzić
        // niezależnie od tego - że znak wyniku odpowiada kierunkowi ruchu ceny i że proporcje
        // się zgadzają. Ręczne przemnożenie przez zgadnięty mnożnik testowałoby moją arytmetykę,
        // a nie aplikację.
        let (zyskowne, stratne): (Vec<_>, Vec<_>) = lista
            .iter()
            .filter_map(|t| t.net_pnl)
            .partition(|w| *w > Decimal::ZERO);
        assert_eq!(
            zyskowne.len(),
            150,
            "połowa transakcji miała zamknąć się na plusie"
        );
        assert_eq!(
            stratne.len(),
            150,
            "połowa transakcji miała zamknąć się na minusie"
        );
        assert!(
            suma_wynikow > Decimal::ZERO,
            "zyski 2 punkty vs straty 1 punkt muszą dać sumarycznie plus"
        );
        assert_eq!(
            accounts.get(&konto).expect("konto").balance,
            dec!(100000) + suma_wynikow,
            "saldo rozjechało się przy większym zbiorze"
        );

        let raport = reports.get_account_report(&konto).expect("raport");
        assert_eq!(raport.stats.closed_trades, 300);
        assert_eq!(
            raport.stats.win_count + raport.stats.loss_count + raport.stats.breakeven_count,
            300,
            "podział na zyskowne/stratne/BE nie sumuje się do liczby transakcji"
        );

        przejdz_po_wszystkich_ekranach(&state);
    }

    /// Kosz jest osobnym przepływem z listy sekcji 20.1 i najłatwiej w nim o utratę danych,
    /// więc sprawdzamy go na pełnym stosie: usunięcie, przywrócenie i saldo po każdym kroku.
    #[test]
    fn kosz_nie_gubi_i_nie_dubluje_wyniku() {
        let dir = TempDir::new().expect("katalog");
        let state = otworz(dir.path());
        let konto = nowe_konto(&state, "Konto z koszem", dec!(1000));
        let instrument = jakis_instrument(&state);
        let id = zamknieta_transakcja(
            &state,
            &konto,
            Some(instrument.clone()),
            1,
            dec!(10),
            dec!(15),
        );

        let (accounts, .., trades, _, _, _, _, _, _) = uslugi!(&state);
        let saldo_z_transakcja = accounts.get(&konto).expect("konto").balance;
        assert!(saldo_z_transakcja > dec!(1000));

        trades.soft_delete(&id).expect("do kosza");
        assert_eq!(
            accounts.get(&konto).expect("konto").balance,
            dec!(1000),
            "transakcja w koszu nadal wpływa na saldo"
        );

        trades.restore(&id).expect("przywrócenie");
        assert_eq!(
            accounts.get(&konto).expect("konto").balance,
            saldo_z_transakcja,
            "przywrócenie z kosza nie odtworzyło salda"
        );

        przejdz_po_wszystkich_ekranach(&state);
    }
}
