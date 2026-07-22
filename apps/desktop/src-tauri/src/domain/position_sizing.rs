use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::trade::TradeSide;
use crate::error::AppError;

/// Parametry instrumentu potrzebne do wyliczenia wielkości pozycji. Pochodzą WYŁĄCZNIE z aktualnej
/// rewizji instrumentu (sekcja 2.2: wielkość kontraktu ma jedno źródło prawdy - kalkulator nie
/// trzyma własnej kopii i nie zakłada `ContractSize = 100000`, bo dla złota, indeksów, krypto czy
/// akcji jest zupełnie inna).
#[derive(Debug, Clone)]
pub struct PositionSizingSpec {
    pub point: Decimal,
    pub trade_tick_size: Decimal,
    pub tick_value_profit: Decimal,
    pub tick_value_loss: Decimal,
    pub contract_size: Decimal,
    pub volume_min: Decimal,
    pub volume_max: Decimal,
    pub volume_step: Decimal,
    /// Waluta, w której wyrażone są wartości ticka - jeśli różni się od waluty rachunku, wynik
    /// wymaga świadomie podanego kursu, nigdy cichego przybliżenia.
    pub currency_profit: String,
}

/// Dane wprowadzone przez użytkownika. SL można podać jako cenę ALBO odległość w punktach, a
/// ryzyko jako procent salda ALBO kwotę - dokładnie jedno z każdej pary.
#[derive(Debug, Clone, Deserialize)]
pub struct PositionSizingRequest {
    pub side: TradeSide,
    pub entry_price: Decimal,
    #[serde(default)]
    pub stop_loss_price: Option<Decimal>,
    #[serde(default)]
    pub stop_loss_points: Option<Decimal>,
    #[serde(default)]
    pub take_profit: Option<Decimal>,
    #[serde(default)]
    pub risk_percent: Option<Decimal>,
    #[serde(default)]
    pub risk_amount: Option<Decimal>,
    /// Kurs z waluty wyniku instrumentu na walutę rachunku - wymagany tylko, gdy się różnią.
    #[serde(default)]
    pub conversion_rate: Option<Decimal>,
}

/// Wynik wraz z pełnym rozpisaniem, JAK powstał (sekcja 2.1 pkt 6 - użytkownik ma widzieć sposób
/// obliczenia, a nie samą liczbę).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PositionSizingResult {
    /// Kwota, którą użytkownik chce zaryzykować (po przeliczeniu procentu na pieniądze).
    pub risk_target_amount: Decimal,
    /// SL sprowadzony do ceny - także wtedy, gdy podano go w punktach.
    pub stop_loss_price: Decimal,
    pub stop_distance_price: Decimal,
    pub stop_distance_points: Decimal,
    /// Strata na JEDNYM locie przy tym SL, w walucie rachunku - podstawa całego wyliczenia.
    pub loss_per_lot: Decimal,
    /// Lot przed dociągnięciem do kroku lota brokera.
    pub raw_lot: Decimal,
    pub suggested_lot: Decimal,
    /// Rzeczywiste ryzyko po zastosowaniu precyzji lota - prawie nigdy nie równe `risk_target`.
    pub actual_risk_amount: Decimal,
    pub actual_risk_percent: Decimal,
    /// Liczba jednostek (`lot × ContractSize`) - wielkość wewnętrzna, NIE pokazywana użytkownikowi
    /// jako pole formularza (sekcja 2.3), używana tylko w wyjaśnieniu obliczenia.
    pub units: Decimal,
    pub reward_amount: Option<Decimal>,
    pub rr: Option<Decimal>,
    /// Sytuacje, o których użytkownik ma wiedzieć, ale które NIE blokują wyniku (np. lot poniżej
    /// minimum brokera). Zapis transakcji i tak nie jest ograniczany krokiem/minimum lota.
    pub warnings: Vec<String>,
}

/// `liczba jednostek = lot × ContractSize` (sekcja 2.3). Wydzielone, bo to jedyne miejsce, gdzie
/// ta zależność jest zapisana - reszta aplikacji liczy w lotach.
pub fn units_for_lot(lot: Decimal, contract_size: Decimal) -> Decimal {
    lot * contract_size
}

/// Dociąga lot W DÓŁ do wielokrotności kroku brokera. W dół, nie do najbliższej - zaokrąglenie w
/// górę podniosłoby ryzyko ponad to, co użytkownik zadeklarował.
fn floor_to_step(value: Decimal, step: Decimal) -> Decimal {
    if step <= Decimal::ZERO {
        return value;
    }
    (value / step).floor() * step
}

fn require_positive(value: Decimal, label: &str) -> Result<(), AppError> {
    if value <= Decimal::ZERO {
        return Err(AppError::Validation(format!(
            "{label} musi być liczbą większą od zera."
        )));
    }
    Ok(())
}

/// Sprowadza SL do ceny. Odległość w punktach zawsze odkłada się PRZECIW pozycji: dla BUY w dół,
/// dla SELL w górę - inaczej "50 punktów SL" znaczyłoby co innego zależnie od kierunku.
fn resolve_stop_loss(
    request: &PositionSizingRequest,
    spec: &PositionSizingSpec,
) -> Result<Decimal, AppError> {
    match (request.stop_loss_price, request.stop_loss_points) {
        (Some(_), Some(_)) => Err(AppError::Validation(
            "Podaj stop loss albo jako cenę, albo jako odległość w punktach - nie oba naraz."
                .to_string(),
        )),
        (None, None) => Err(AppError::Validation(
            "Podaj stop loss - bez niego nie da się wyliczyć wielkości pozycji.".to_string(),
        )),
        (Some(price), None) => Ok(price),
        (None, Some(points)) => {
            require_positive(points, "Odległość stop lossa")?;
            require_positive(spec.point, "Point instrumentu")?;
            let distance = points * spec.point;
            Ok(match request.side {
                TradeSide::Buy => request.entry_price - distance,
                TradeSide::Sell => request.entry_price + distance,
            })
        }
    }
}

fn resolve_risk_target(
    request: &PositionSizingRequest,
    account_balance: Decimal,
) -> Result<Decimal, AppError> {
    match (request.risk_percent, request.risk_amount) {
        (Some(_), Some(_)) => Err(AppError::Validation(
            "Podaj ryzyko albo jako procent salda, albo jako kwotę - nie oba naraz.".to_string(),
        )),
        (None, None) => Err(AppError::Validation(
            "Podaj ryzyko - procentowo albo kwotowo.".to_string(),
        )),
        (Some(percent), None) => {
            require_positive(percent, "Ryzyko procentowe")?;
            require_positive(account_balance, "Saldo konta")?;
            Ok(account_balance * percent / Decimal::ONE_HUNDRED)
        }
        (None, Some(amount)) => {
            require_positive(amount, "Kwota ryzyka")?;
            Ok(amount)
        }
    }
}

/// Przelicza kwotę z waluty instrumentu na walutę rachunku. Nigdy nie zgaduje kursu - brak kursu
/// przy różnych walutach to błąd walidacji, a nie przybliżony wynik.
fn to_account_currency(
    native: Decimal,
    spec: &PositionSizingSpec,
    account_currency: &str,
    conversion_rate: Option<Decimal>,
) -> Result<Decimal, AppError> {
    if spec.currency_profit == account_currency {
        return Ok(native);
    }
    match conversion_rate {
        Some(rate) if rate > Decimal::ZERO => Ok(native * rate),
        _ => Err(AppError::Validation(format!(
            "Instrument rozlicza się w {}, a konto w {} - podaj kurs przeliczeniowy, żeby wynik był prawdziwy.",
            spec.currency_profit, account_currency
        ))),
    }
}

/// Silnik kalkulatora wielkości pozycji - czysta funkcja, bez bazy i efektów ubocznych.
pub fn calculate(
    request: &PositionSizingRequest,
    spec: &PositionSizingSpec,
    account_balance: Decimal,
    account_currency: &str,
) -> Result<PositionSizingResult, AppError> {
    require_positive(request.entry_price, "Cena wejścia")?;
    require_positive(spec.trade_tick_size, "Wielkość ticka instrumentu")?;
    require_positive(spec.tick_value_loss, "Wartość ticka instrumentu")?;

    let risk_target_amount = resolve_risk_target(request, account_balance)?;
    let stop_loss_price = resolve_stop_loss(request, spec)?;
    require_positive(stop_loss_price, "Cena stop lossa")?;

    // SL po niewłaściwej stronie ceny wejścia to nie "ujemne ryzyko", tylko pomyłka kierunku.
    let stop_is_on_correct_side = match request.side {
        TradeSide::Buy => stop_loss_price < request.entry_price,
        TradeSide::Sell => stop_loss_price > request.entry_price,
    };
    if !stop_is_on_correct_side {
        return Err(AppError::Validation(match request.side {
            TradeSide::Buy => {
                "Przy pozycji BUY stop loss musi być poniżej ceny wejścia.".to_string()
            }
            TradeSide::Sell => {
                "Przy pozycji SELL stop loss musi być powyżej ceny wejścia.".to_string()
            }
        }));
    }

    let stop_distance_price = (request.entry_price - stop_loss_price).abs();
    let stop_distance_points = if spec.point > Decimal::ZERO {
        stop_distance_price / spec.point
    } else {
        Decimal::ZERO
    };

    // Strata na jednym locie: ile ticków mieści się w odległości do SL, razy wartość ticka.
    let ticks_to_stop = stop_distance_price / spec.trade_tick_size;
    let loss_per_lot_native = ticks_to_stop * spec.tick_value_loss;
    let loss_per_lot = to_account_currency(
        loss_per_lot_native,
        spec,
        account_currency,
        request.conversion_rate,
    )?;
    require_positive(loss_per_lot, "Strata na jednym locie")?;

    let raw_lot = risk_target_amount / loss_per_lot;
    let suggested_lot = floor_to_step(raw_lot, spec.volume_step);

    let mut warnings = Vec::new();
    if suggested_lot <= Decimal::ZERO {
        warnings.push(format!(
            "Przy tym ryzyku i tym stop lossie wychodzi mniej niż jeden krok lota ({}). Zwiększ ryzyko albo zbliż stop loss.",
            spec.volume_step
        ));
    } else {
        if spec.volume_min > Decimal::ZERO && suggested_lot < spec.volume_min {
            warnings.push(format!(
                "Wyliczony lot jest poniżej minimum brokera ({}) - broker może odrzucić takie zlecenie.",
                spec.volume_min
            ));
        }
        if spec.volume_max > Decimal::ZERO && suggested_lot > spec.volume_max {
            warnings.push(format!(
                "Wyliczony lot przekracza maksimum brokera ({}) - podziel pozycję albo zmniejsz ryzyko.",
                spec.volume_max
            ));
        }
    }

    let actual_risk_amount = suggested_lot * loss_per_lot;
    let actual_risk_percent = if account_balance > Decimal::ZERO {
        actual_risk_amount / account_balance * Decimal::ONE_HUNDRED
    } else {
        Decimal::ZERO
    };

    // Podgląd zysku liczony DOKŁADNIE tym samym mechanizmem, tylko wartością ticka dla zysku.
    let (reward_amount, rr) = match request.take_profit {
        Some(take_profit) if take_profit > Decimal::ZERO => {
            let target_distance = match request.side {
                TradeSide::Buy => take_profit - request.entry_price,
                TradeSide::Sell => request.entry_price - take_profit,
            };
            if target_distance <= Decimal::ZERO {
                (None, None)
            } else {
                let ticks = target_distance / spec.trade_tick_size;
                let reward_native = ticks * spec.tick_value_profit * suggested_lot;
                let reward = to_account_currency(
                    reward_native,
                    spec,
                    account_currency,
                    request.conversion_rate,
                )?;
                let ratio = if actual_risk_amount > Decimal::ZERO {
                    Some(reward / actual_risk_amount)
                } else {
                    None
                };
                (Some(reward), ratio)
            }
        }
        _ => (None, None),
    };

    Ok(PositionSizingResult {
        risk_target_amount,
        stop_loss_price,
        stop_distance_price,
        stop_distance_points,
        loss_per_lot,
        raw_lot,
        suggested_lot,
        actual_risk_amount,
        actual_risk_percent,
        units: units_for_lot(suggested_lot, spec.contract_size),
        reward_amount,
        rr,
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    /// Forex 5 miejsc: tick 0.00001 wart 1 USD na lot, kontrakt 100 000.
    fn eurusd() -> PositionSizingSpec {
        PositionSizingSpec {
            point: dec!(0.00001),
            trade_tick_size: dec!(0.00001),
            tick_value_profit: dec!(1),
            tick_value_loss: dec!(1),
            contract_size: dec!(100000),
            volume_min: dec!(0.01),
            volume_max: dec!(100),
            volume_step: dec!(0.01),
            currency_profit: "USD".to_string(),
        }
    }

    /// Złoto: kontrakt 100 uncji, tick 0.01 wart 1 USD - celowo INNY niż forexowy.
    fn xauusd() -> PositionSizingSpec {
        PositionSizingSpec {
            point: dec!(0.01),
            trade_tick_size: dec!(0.01),
            tick_value_profit: dec!(1),
            tick_value_loss: dec!(1),
            contract_size: dec!(100),
            volume_min: dec!(0.01),
            volume_max: dec!(50),
            volume_step: dec!(0.01),
            currency_profit: "USD".to_string(),
        }
    }

    fn buy_request() -> PositionSizingRequest {
        PositionSizingRequest {
            side: TradeSide::Buy,
            entry_price: dec!(1.10000),
            stop_loss_price: Some(dec!(1.09000)),
            stop_loss_points: None,
            take_profit: None,
            risk_percent: Some(dec!(1)),
            risk_amount: None,
            conversion_rate: None,
        }
    }

    #[test]
    fn liczba_jednostek_to_lot_razy_wielkosc_kontraktu() {
        // Wprost z sekcji 2.3 specyfikacji, dla ContractSize = 100000.
        assert_eq!(units_for_lot(dec!(1.00), dec!(100000)), dec!(100000.00));
        assert_eq!(units_for_lot(dec!(0.10), dec!(100000)), dec!(10000.00));
        assert_eq!(units_for_lot(dec!(0.01), dec!(100000)), dec!(1000.00));
        assert_eq!(units_for_lot(dec!(1.23), dec!(100000)), dec!(123000.00));
    }

    #[test]
    fn instrument_o_innym_kontrakcie_nie_uzywa_wartosci_forexowych() {
        // Złoto: 1 lot to 100 uncji, nie 100 000 jednostek.
        assert_eq!(units_for_lot(dec!(1.00), dec!(100)), dec!(100.00));
        assert_eq!(units_for_lot(dec!(0.05), dec!(100)), dec!(5.00));
    }

    #[test]
    fn liczy_lot_z_ryzyka_procentowego() {
        // Saldo 10 000, ryzyko 1% = 100 USD. SL 100 pipsów = 1000 ticków * 1 USD = 1000 USD na lot.
        // 100 / 1000 = 0.10 lota.
        let result = calculate(&buy_request(), &eurusd(), dec!(10000), "USD").expect("wynik");
        assert_eq!(result.risk_target_amount, dec!(100));
        assert_eq!(result.loss_per_lot, dec!(1000));
        assert_eq!(result.suggested_lot, dec!(0.10));
        assert_eq!(result.actual_risk_amount, dec!(100));
        assert_eq!(result.units, dec!(10000));
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn liczy_lot_z_ryzyka_kwotowego() {
        let mut request = buy_request();
        request.risk_percent = None;
        request.risk_amount = Some(dec!(250));

        let result = calculate(&request, &eurusd(), dec!(10000), "USD").expect("wynik");
        assert_eq!(result.suggested_lot, dec!(0.25));
        assert_eq!(result.actual_risk_amount, dec!(250));
    }

    #[test]
    fn stop_loss_w_punktach_odklada_sie_przeciw_pozycji() {
        let mut buy = buy_request();
        buy.stop_loss_price = None;
        buy.stop_loss_points = Some(dec!(1000)); // 1000 punktów * 0.00001 = 0.01
        let result = calculate(&buy, &eurusd(), dec!(10000), "USD").expect("BUY");
        assert_eq!(result.stop_loss_price, dec!(1.09000));

        let mut sell = buy.clone();
        sell.side = TradeSide::Sell;
        let result = calculate(&sell, &eurusd(), dec!(10000), "USD").expect("SELL");
        assert_eq!(result.stop_loss_price, dec!(1.11000));
    }

    #[test]
    fn lot_jest_dociagany_w_dol_do_kroku_wiec_ryzyko_nigdy_nie_rosnie() {
        let mut request = buy_request();
        // 137 / 1000 = 0.137 lota - krok 0.01 tnie do 0.13, nie do 0.14.
        request.risk_percent = None;
        request.risk_amount = Some(dec!(137));

        let result = calculate(&request, &eurusd(), dec!(10000), "USD").expect("wynik");
        assert_eq!(result.raw_lot, dec!(0.137));
        assert_eq!(result.suggested_lot, dec!(0.13));
        assert_eq!(result.actual_risk_amount, dec!(130));
        assert!(result.actual_risk_amount < request.risk_amount.unwrap());
    }

    #[test]
    fn zloto_liczy_sie_wlasnymi_parametrami_a_nie_forexowymi() {
        let mut request = buy_request();
        request.entry_price = dec!(2000.00);
        request.stop_loss_price = Some(dec!(1990.00));
        request.risk_percent = None;
        request.risk_amount = Some(dec!(500));

        // 10.00 różnicy / 0.01 ticka = 1000 ticków * 1 USD = 1000 USD na lot → 0.50 lota.
        let result = calculate(&request, &xauusd(), dec!(10000), "USD").expect("wynik");
        assert_eq!(result.loss_per_lot, dec!(1000));
        assert_eq!(result.suggested_lot, dec!(0.50));
        // 0.50 lota złota to 50 uncji, a NIE 50 000 jednostek.
        assert_eq!(result.units, dec!(50.00));
    }

    #[test]
    fn podglad_zysku_i_rr_gdy_podano_take_profit() {
        let mut request = buy_request();
        request.take_profit = Some(dec!(1.12000)); // 2x odległość SL

        let result = calculate(&request, &eurusd(), dec!(10000), "USD").expect("wynik");
        assert_eq!(result.reward_amount, Some(dec!(200)));
        assert_eq!(result.rr, Some(dec!(2)));
    }

    #[test]
    fn take_profit_po_zlej_stronie_nie_daje_ujemnego_zysku() {
        let mut request = buy_request();
        request.take_profit = Some(dec!(1.09500)); // poniżej wejścia przy BUY

        let result = calculate(&request, &eurusd(), dec!(10000), "USD").expect("wynik");
        assert_eq!(result.reward_amount, None);
        assert_eq!(result.rr, None);
    }

    #[test]
    fn ostrzega_gdy_wychodzi_mniej_niz_jeden_krok_lota() {
        let mut request = buy_request();
        request.risk_percent = None;
        request.risk_amount = Some(dec!(5)); // 5 / 1000 = 0.005 lota < krok 0.01

        let result = calculate(&request, &eurusd(), dec!(10000), "USD").expect("wynik");
        assert_eq!(result.suggested_lot, Decimal::ZERO);
        assert_eq!(result.actual_risk_amount, Decimal::ZERO);
        assert_eq!(result.warnings.len(), 1);
    }

    #[test]
    fn ostrzega_gdy_lot_przekracza_maksimum_brokera() {
        let mut request = buy_request();
        request.risk_percent = None;
        request.risk_amount = Some(dec!(200000)); // 200 lotów przy maksimum 100

        let result = calculate(&request, &eurusd(), dec!(10000), "USD").expect("wynik");
        assert_eq!(result.suggested_lot, dec!(200));
        assert_eq!(result.warnings.len(), 1);
    }

    #[test]
    fn stop_loss_po_zlej_stronie_jest_bledem_a_nie_ujemnym_ryzykiem() {
        let mut request = buy_request();
        request.stop_loss_price = Some(dec!(1.11000)); // powyżej wejścia przy BUY
        assert!(matches!(
            calculate(&request, &eurusd(), dec!(10000), "USD"),
            Err(AppError::Validation(_))
        ));

        let mut sell = buy_request();
        sell.side = TradeSide::Sell;
        sell.stop_loss_price = Some(dec!(1.09000)); // poniżej wejścia przy SELL
        assert!(matches!(
            calculate(&sell, &eurusd(), dec!(10000), "USD"),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn wymaga_dokladnie_jednego_sposobu_podania_sl_i_ryzyka() {
        let mut both_sl = buy_request();
        both_sl.stop_loss_points = Some(dec!(100));
        assert!(calculate(&both_sl, &eurusd(), dec!(10000), "USD").is_err());

        let mut no_sl = buy_request();
        no_sl.stop_loss_price = None;
        assert!(calculate(&no_sl, &eurusd(), dec!(10000), "USD").is_err());

        let mut both_risk = buy_request();
        both_risk.risk_amount = Some(dec!(100));
        assert!(calculate(&both_risk, &eurusd(), dec!(10000), "USD").is_err());

        let mut no_risk = buy_request();
        no_risk.risk_percent = None;
        assert!(calculate(&no_risk, &eurusd(), dec!(10000), "USD").is_err());
    }

    #[test]
    fn rozna_waluta_bez_kursu_to_blad_a_nie_ciche_przyblizenie() {
        let result = calculate(&buy_request(), &eurusd(), dec!(10000), "PLN");
        assert!(matches!(result, Err(AppError::Validation(_))));

        let mut with_rate = buy_request();
        with_rate.conversion_rate = Some(dec!(4));
        let result = calculate(&with_rate, &eurusd(), dec!(10000), "PLN").expect("z kursem");
        // Ryzyko 1% z 10 000 PLN = 100 PLN; strata na locie 1000 USD * 4 = 4000 PLN.
        assert_eq!(result.loss_per_lot, dec!(4000));
        assert_eq!(result.suggested_lot, dec!(0.02));
    }

    #[test]
    fn wynik_jest_deterministyczny_dla_wartosci_lamiacych_binarne_float() {
        // 0.1 + 0.2 w f64 to 0.30000000000000004 - na Decimal takie błędy nie mają prawa wystąpić.
        let mut request = buy_request();
        request.entry_price = dec!(1.30000);
        request.stop_loss_price = Some(dec!(1.29997));
        request.risk_percent = None;
        request.risk_amount = Some(dec!(0.3));

        let first = calculate(&request, &eurusd(), dec!(10000), "USD").expect("wynik");
        let second = calculate(&request, &eurusd(), dec!(10000), "USD").expect("wynik");
        assert_eq!(first, second);
        // 3 ticki po 1 USD = 3 USD na lot; 0.3 / 3 = 0.1 lota dokładnie.
        assert_eq!(first.loss_per_lot, dec!(3));
        assert_eq!(first.suggested_lot, dec!(0.10));
    }
}
