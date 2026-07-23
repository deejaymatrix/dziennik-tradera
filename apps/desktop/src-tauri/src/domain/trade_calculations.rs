use rust_decimal::Decimal;

use super::trade::TradeSide;
use super::trade_partial_close::{self, PartialClose};

/// Parametry instrumentu potrzebne wyłącznie do przeliczeń pieniężnych transakcji - podzbiór
/// pełnej, wersjonowanej specyfikacji instrumentu, zamrożony w transakcji jako
/// `instrument_spec_snapshot`. `point` służy wyłącznie do prezentacji `pnl_points` - liczbę
/// ticków do przeliczeń pieniężnych zawsze wyznacza `trade_tick_size` (może różnić się od
/// `point`, np. dla niektórych indeksów).
#[derive(Debug, Clone)]
pub struct InstrumentCalcSpec {
    pub point: Decimal,
    pub trade_tick_size: Decimal,
    pub tick_value_profit: Decimal,
    pub tick_value_loss: Decimal,
    /// Waluta, w której wyrażone są `tick_value_profit`/`tick_value_loss` (pole `CurrencyProfit`
    /// katalogu instrumentów) - potrzebna do wykrycia niezgodności z walutą rachunku.
    pub currency_profit: String,
}

/// Różnica ceny na korzyść pozycji: dla BUY to `other - entry`, dla SELL odwrotnie.
/// Dodatnia wartość zawsze oznacza zysk, ujemna - stratę, niezależnie od kierunku.
pub fn price_diff(side: TradeSide, entry_price: Decimal, other_price: Decimal) -> Decimal {
    match side {
        TradeSide::Buy => other_price - entry_price,
        TradeSide::Sell => entry_price - other_price,
    }
}

/// Kwota w walucie instrumentu (`currency_profit`), przed ewentualnym przeliczeniem na walutę
/// rachunku. Osobna wartość ticka dla zysku i straty (sekcja o obliczeniach TP/SL/wyniku).
fn native_money_from_price_diff(
    diff: Decimal,
    spec: &InstrumentCalcSpec,
    volume: Decimal,
) -> Decimal {
    if spec.trade_tick_size.is_zero() {
        return Decimal::ZERO;
    }
    let tick_value = if diff.is_sign_negative() {
        spec.tick_value_loss
    } else {
        spec.tick_value_profit
    };
    (diff / spec.trade_tick_size) * tick_value * volume
}

/// Przelicza kwotę z waluty instrumentu na walutę rachunku. Nigdy nie zgaduje kursu w cichy
/// sposób: jeżeli waluty się różnią i nie podano `conversion_rate`, zwraca `None` zamiast
/// przybliżonej wartości - wywołujący ma wtedy ustawić `requires_conversion_rate` w wyniku.
fn convert_to_account_currency(
    native_amount: Decimal,
    instrument_currency: &str,
    account_currency: Option<&str>,
    conversion_rate: Option<Decimal>,
) -> Option<Decimal> {
    match account_currency {
        None => Some(native_amount),
        Some(account_currency) if account_currency == instrument_currency => Some(native_amount),
        Some(_) => conversion_rate.map(|rate| native_amount * rate),
    }
}

#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
pub struct TradeCalculation {
    pub pnl_points: Option<Decimal>,
    pub gross_pnl: Option<Decimal>,
    pub net_pnl: Option<Decimal>,
    pub pnl_percent: Option<Decimal>,
    pub pnl_r: Option<Decimal>,
    pub risk_amount: Option<Decimal>,
    pub risk_percent: Option<Decimal>,
    /// Przewidywany zysk pieniężny, gdyby cena doszła do take_profit - symetryczne do
    /// `risk_amount`, razem dają podgląd "ile stracę / ile zyskam" przed otwarciem pozycji.
    pub reward_amount: Option<Decimal>,
    pub rr_planned: Option<Decimal>,
    /// Prawda, jeżeli waluta wyniku instrumentu różni się od waluty rachunku i nie podano
    /// jeszcze kursu przeliczeniowego - część pól pieniężnych powyżej zostaje wtedy pusta, a UI
    /// ma poprosić o świadome uzupełnienie kursu zamiast liczyć na cichym przybliżeniu.
    pub requires_conversion_rate: bool,
}

#[derive(Debug, Clone, Default)]
pub struct TradeCalculationInput {
    pub side: Option<TradeSide>,
    pub entry_price: Option<Decimal>,
    pub exit_price: Option<Decimal>,
    pub stop_loss: Option<Decimal>,
    pub take_profit: Option<Decimal>,
    pub volume: Option<Decimal>,
    pub commission: Decimal,
    pub swap: Decimal,
    pub other_fees: Decimal,
    pub instrument: Option<InstrumentCalcSpec>,
    pub account_balance: Option<Decimal>,
    pub account_currency: Option<String>,
    /// Kurs z waluty instrumentu (`InstrumentCalcSpec::currency_profit`) na walutę rachunku,
    /// zapisany na transakcji przez użytkownika - wymagany tylko, gdy te waluty się różnią.
    pub conversion_rate: Option<Decimal>,
    /// Częściowe zamknięcia (sekcja 6.9). Gdy lista NIE jest pusta, wynik brutto to suma
    /// wpisanych kwot zrealizowanych, a nie przeliczenie z ceny wyjścia.
    pub partial_closes: Vec<PartialClose>,
}

/// Silnik przeliczeń transakcji - czysta funkcja, żadnych efektów ubocznych ani zależności od
/// bazy danych. Każde pole wyniku jest `Option`, bo podgląd na żywo w formularzu może mieć
/// niekompletne dane (np. brak SL - wtedy `risk_amount`/`rr_planned` zostają puste, ale
/// pozostałe pola nadal się liczą, jeśli to możliwe).
pub fn calculate(input: &TradeCalculationInput) -> TradeCalculation {
    let mut result = TradeCalculation::default();

    let Some(side) = input.side else {
        return result;
    };

    let to_account_currency = |native_amount: Decimal, spec: &InstrumentCalcSpec| {
        convert_to_account_currency(
            native_amount,
            &spec.currency_profit,
            input.account_currency.as_deref(),
            input.conversion_rate,
        )
    };

    if let (Some(entry), Some(stop_loss), Some(volume), Some(instrument)) = (
        input.entry_price,
        input.stop_loss,
        input.volume,
        &input.instrument,
    ) {
        let diff_to_stop = price_diff(side, entry, stop_loss);
        let native_risk = native_money_from_price_diff(diff_to_stop, instrument, volume).abs();
        match to_account_currency(native_risk, instrument) {
            Some(risk) => {
                result.risk_amount = Some(risk);
                if let Some(balance) = input.account_balance {
                    if !balance.is_zero() {
                        result.risk_percent = Some(risk / balance * Decimal::ONE_HUNDRED);
                    }
                }
            }
            None => result.requires_conversion_rate = true,
        }
    }

    if let (Some(entry), Some(stop_loss), Some(take_profit)) =
        (input.entry_price, input.stop_loss, input.take_profit)
    {
        let sl_distance = (entry - stop_loss).abs();
        if !sl_distance.is_zero() {
            result.rr_planned = Some((take_profit - entry).abs() / sl_distance);
        }
    }

    if let (Some(entry), Some(take_profit), Some(volume), Some(instrument)) = (
        input.entry_price,
        input.take_profit,
        input.volume,
        &input.instrument,
    ) {
        let diff_to_target = price_diff(side, entry, take_profit);
        let native_reward = native_money_from_price_diff(diff_to_target, instrument, volume).abs();
        match to_account_currency(native_reward, instrument) {
            Some(reward) => result.reward_amount = Some(reward),
            None => result.requires_conversion_rate = true,
        }
    }

    // Punkty liczymy z ceny wyjścia niezależnie od częściowych zamknięć - to metryka cenowa,
    // nie pieniężna, więc nie ma tu ryzyka podwójnego liczenia wyniku.
    if let (Some(entry), Some(exit_price), Some(instrument)) =
        (input.entry_price, input.exit_price, &input.instrument)
    {
        let diff = price_diff(side, entry, exit_price);
        result.pnl_points = Some(if instrument.point.is_zero() {
            Decimal::ZERO
        } else {
            diff / instrument.point
        });
    }

    // Wynik pieniężny ma DOKŁADNIE JEDNO źródło (sekcja 6.9):
    // - są częściowe zamknięcia -> suma wpisanych kwot zrealizowanych (w walucie rachunku,
    //   więc bez przeliczania kursem; broker podaje je już w walucie konta),
    // - nie ma ich -> dotychczasowe deterministyczne przeliczenie z ceny wejścia i wyjścia.
    // Te gałęzie NIGDY się nie sumują - to byłoby policzenie wyniku dwa razy.
    let gross_pnl = if input.partial_closes.is_empty() {
        match (
            input.entry_price,
            input.exit_price,
            input.volume,
            &input.instrument,
        ) {
            (Some(entry), Some(exit_price), Some(volume), Some(instrument)) => {
                let diff = price_diff(side, entry, exit_price);
                let native_gross = native_money_from_price_diff(diff, instrument, volume);
                match to_account_currency(native_gross, instrument) {
                    Some(gross) => Some(gross),
                    None => {
                        result.requires_conversion_rate = true;
                        None
                    }
                }
            }
            _ => None,
        }
    } else {
        Some(trade_partial_close::realized_pnl(&input.partial_closes))
    };

    if let Some(gross_pnl) = gross_pnl {
        let net_pnl = gross_pnl - input.commission - input.swap - input.other_fees;
        result.gross_pnl = Some(gross_pnl);
        result.net_pnl = Some(net_pnl);

        if let Some(balance) = input.account_balance {
            if !balance.is_zero() {
                result.pnl_percent = Some(net_pnl / balance * Decimal::ONE_HUNDRED);
            }
        }
        if let Some(risk) = result.risk_amount {
            if !risk.is_zero() {
                result.pnl_r = Some(net_pnl / risk);
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    fn spec(
        point: Decimal,
        trade_tick_size: Decimal,
        tick_value: Decimal,
        currency: &str,
    ) -> InstrumentCalcSpec {
        InstrumentCalcSpec {
            point,
            trade_tick_size,
            tick_value_profit: tick_value,
            tick_value_loss: tick_value,
            currency_profit: currency.to_string(),
        }
    }

    fn eurusd_spec() -> InstrumentCalcSpec {
        // Forex 5 miejsc: Digits=5, Point=TradeTickSize=0.00001, tick warty 1 USD na lot.
        spec(dec!(0.00001), dec!(0.00001), dec!(1), "USD")
    }

    fn base_input(instrument: InstrumentCalcSpec) -> TradeCalculationInput {
        TradeCalculationInput {
            side: Some(TradeSide::Buy),
            entry_price: None,
            exit_price: None,
            stop_loss: None,
            take_profit: None,
            volume: Some(dec!(1)),
            commission: dec!(0),
            swap: dec!(0),
            other_fees: dec!(0),
            instrument: Some(instrument),
            account_balance: None,
            account_currency: None,
            conversion_rate: None,
            partial_closes: vec![],
        }
    }

    #[test]
    fn buy_profit_when_exit_above_entry() {
        let mut input = base_input(eurusd_spec());
        input.entry_price = Some(dec!(1.10000));
        input.exit_price = Some(dec!(1.10500));
        input.stop_loss = Some(dec!(1.09500));
        input.take_profit = Some(dec!(1.11000));
        input.commission = dec!(5);
        input.account_balance = Some(dec!(10000));

        let result = calculate(&input);

        assert_eq!(result.gross_pnl, Some(dec!(500)));
        assert_eq!(result.net_pnl, Some(dec!(495)));
        assert_eq!(result.risk_amount, Some(dec!(500)));
        assert_eq!(result.reward_amount, Some(dec!(1000)));
        assert_eq!(result.rr_planned, Some(dec!(2)));
        assert_eq!(result.pnl_r, Some(dec!(0.99)));
        assert_eq!(result.risk_percent, Some(dec!(5)));
        assert_eq!(result.pnl_percent, Some(dec!(4.95)));
        assert!(!result.requires_conversion_rate);
    }

    #[test]
    fn czesciowe_zamkniecia_sa_jedynym_zrodlem_wyniku_pienieznego() {
        // Ta sama transakcja co w `buy_profit_when_exit_above_entry` (z ceny wyjścia wyszłoby
        // brutto 500), ale z częściowymi zamknięciami. Wynik MUSI pochodzić wyłącznie z sumy
        // wpisanych kwot - dodanie do tego 500 z ceny wyjścia byłoby policzeniem wyniku dwa razy
        // (sekcja 6.9).
        let mut input = base_input(eurusd_spec());
        input.entry_price = Some(dec!(1.10000));
        input.exit_price = Some(dec!(1.10500));
        input.stop_loss = Some(dec!(1.09500));
        input.commission = dec!(5);
        input.swap = dec!(2);
        input.other_fees = dec!(1);
        input.partial_closes = vec![
            PartialClose {
                closed_volume: dec!(0.6),
                realized_pnl: dec!(180),
            },
            PartialClose {
                closed_volume: dec!(0.4),
                realized_pnl: dec!(-30),
            },
        ];

        let result = calculate(&input);

        assert_eq!(result.gross_pnl, Some(dec!(150)), "180 + (-30), nie 500");
        assert_eq!(
            result.net_pnl,
            Some(dec!(142)),
            "brutto 150 minus prowizja 5, swap 2 i opłaty 1"
        );
        // Punkty to metryka cenowa, nie pieniężna - liczą się dalej z ceny wyjścia.
        assert_eq!(result.pnl_points, Some(dec!(500)));
    }

    #[test]
    fn bez_czesciowych_zamkniec_wynik_liczy_sie_po_staremu() {
        // Zabezpieczenie regresyjne: pusta lista wpisów nie może zmieniać niczego w dotychczasowym
        // deterministycznym przeliczeniu z ceny wejścia i wyjścia.
        let mut input = base_input(eurusd_spec());
        input.entry_price = Some(dec!(1.10000));
        input.exit_price = Some(dec!(1.10500));
        input.commission = dec!(5);
        input.partial_closes = vec![];

        let result = calculate(&input);

        assert_eq!(result.gross_pnl, Some(dec!(500)));
        assert_eq!(result.net_pnl, Some(dec!(495)));
    }

    #[test]
    fn sell_profit_when_exit_below_entry() {
        let mut input = base_input(eurusd_spec());
        input.side = Some(TradeSide::Sell);
        input.entry_price = Some(dec!(1.10000));
        input.exit_price = Some(dec!(1.09500));
        input.stop_loss = Some(dec!(1.10500));
        input.take_profit = Some(dec!(1.09000));

        let result = calculate(&input);

        assert_eq!(result.gross_pnl, Some(dec!(500)));
        assert_eq!(result.net_pnl, Some(dec!(500)));
        assert_eq!(result.risk_amount, Some(dec!(500)));
        assert_eq!(result.rr_planned, Some(dec!(2)));
        assert_eq!(result.pnl_r, Some(dec!(1)));
        assert_eq!(result.risk_percent, None);
        assert_eq!(result.pnl_percent, None);
    }

    #[test]
    fn losing_trade_yields_negative_pnl_and_negative_r() {
        let mut input = base_input(eurusd_spec());
        input.entry_price = Some(dec!(1.10000));
        input.exit_price = Some(dec!(1.09500));
        input.stop_loss = Some(dec!(1.09500));
        input.take_profit = Some(dec!(1.11000));

        let result = calculate(&input);

        assert_eq!(result.net_pnl, Some(dec!(-500)));
        assert_eq!(result.pnl_r, Some(dec!(-1)));
    }

    #[test]
    fn missing_stop_loss_leaves_risk_and_rr_empty_but_still_computes_pnl() {
        let mut input = base_input(eurusd_spec());
        input.entry_price = Some(dec!(1.10000));
        input.exit_price = Some(dec!(1.10500));

        let result = calculate(&input);

        assert_eq!(result.risk_amount, None);
        assert_eq!(result.rr_planned, None);
        assert_eq!(result.pnl_r, None);
        assert_eq!(result.gross_pnl, Some(dec!(500)));
    }

    #[test]
    fn missing_exit_price_leaves_realized_pnl_empty_but_still_computes_risk() {
        let mut input = base_input(eurusd_spec());
        input.entry_price = Some(dec!(1.10000));
        input.stop_loss = Some(dec!(1.09500));
        input.take_profit = Some(dec!(1.11000));

        let result = calculate(&input);

        assert_eq!(result.gross_pnl, None);
        assert_eq!(result.net_pnl, None);
        assert_eq!(result.risk_amount, Some(dec!(500)));
        assert_eq!(result.rr_planned, Some(dec!(2)));
    }

    #[test]
    fn no_side_returns_all_empty() {
        let result = calculate(&TradeCalculationInput::default());
        assert_eq!(result, TradeCalculation::default());
    }

    // --- Testy referencyjne per klasa instrumentu (sekcja "Obliczenia TP, SL i wyniku") ---

    #[test]
    fn jpy_pair_three_digits_breakeven_is_zero() {
        // USDJPY: Digits=3, Point=TradeTickSize=0.001, tick warty ~6.71 USD na lot standardowy.
        let mut input = base_input(spec(dec!(0.001), dec!(0.001), dec!(6.71), "USD"));
        input.entry_price = Some(dec!(150.000));
        input.exit_price = Some(dec!(150.000));
        input.stop_loss = Some(dec!(149.500));
        input.take_profit = Some(dec!(150.500));

        let result = calculate(&input);

        assert_eq!(result.gross_pnl, Some(dec!(0)));
        assert_eq!(result.pnl_points, Some(dec!(0)));
    }

    #[test]
    fn xauusd_metal_two_digits_profit() {
        // XAUUSD: Digits=2, Point=TradeTickSize=0.01, tick warty 1 USD na lot.
        let mut input = base_input(spec(dec!(0.01), dec!(0.01), dec!(1), "USD"));
        input.entry_price = Some(dec!(2400.00));
        input.exit_price = Some(dec!(2410.00));
        input.stop_loss = Some(dec!(2395.00));
        input.take_profit = Some(dec!(2420.00));

        let result = calculate(&input);

        // 10.00 różnicy / 0.01 ticka = 1000 ticków * 1 USD = 1000 USD.
        assert_eq!(result.gross_pnl, Some(dec!(1000)));
        assert_eq!(result.pnl_points, Some(dec!(1000)));
    }

    #[test]
    fn standard_index_whole_points_profit() {
        // Indeks standardowy (np. DJI30): Digits=0..2, tick wart pełną kwotę na punkt.
        let mut input = base_input(spec(dec!(1), dec!(1), dec!(1), "USD"));
        input.entry_price = Some(dec!(38000));
        input.exit_price = Some(dec!(38050));
        input.stop_loss = Some(dec!(37950));
        input.take_profit = Some(dec!(38150));
        input.volume = Some(dec!(1));

        let result = calculate(&input);

        assert_eq!(result.gross_pnl, Some(dec!(50)));
    }

    #[test]
    fn mini_index_fractional_tick_value_profit() {
        // Indeks -MINI: sam kontrakt dziesięciokrotnie mniejszy (tick_value dziesięć razy
        // mniejszy niż standardowy indeks), ale identyczna logika liczenia.
        let mut input = base_input(spec(dec!(1), dec!(1), dec!(0.1), "USD"));
        input.entry_price = Some(dec!(38000));
        input.exit_price = Some(dec!(38050));
        input.stop_loss = Some(dec!(37950));
        input.take_profit = Some(dec!(38150));
        input.volume = Some(dec!(1));

        let result = calculate(&input);

        assert_eq!(result.gross_pnl, Some(dec!(5)));
    }

    #[test]
    fn crypto_profit_with_fractional_volume() {
        // BTCUSD: wolumen może być ułamkowy (np. 0.5 "lota" krypto).
        let mut input = base_input(spec(dec!(0.01), dec!(0.01), dec!(0.01), "USD"));
        input.entry_price = Some(dec!(60000.00));
        input.exit_price = Some(dec!(61000.00));
        input.stop_loss = Some(dec!(59000.00));
        input.take_profit = Some(dec!(63000.00));
        input.volume = Some(dec!(0.5));

        let result = calculate(&input);

        // 1000.00 różnicy / 0.01 ticka = 100000 ticków * 0.01 USD * 0.5 wolumenu = 500 USD.
        assert_eq!(result.gross_pnl, Some(dec!(500)));
    }

    #[test]
    fn stock_profit_with_commission() {
        // Akcja: tick 0.01 warty 0.01 na "lot" (1 akcja), wolumen = liczba akcji - prowizja
        // realnie obniża wynik netto. 10 akcji * 5.00 wzrostu = 50.00 zysku brutto.
        let mut input = base_input(spec(dec!(0.01), dec!(0.01), dec!(0.01), "USD"));
        input.entry_price = Some(dec!(150.00));
        input.exit_price = Some(dec!(155.00));
        input.stop_loss = Some(dec!(145.00));
        input.take_profit = Some(dec!(165.00));
        input.volume = Some(dec!(10));
        input.commission = dec!(2.50);

        let result = calculate(&input);

        assert_eq!(result.gross_pnl, Some(dec!(50.00)));
        assert_eq!(result.net_pnl, Some(dec!(47.50)));
    }

    #[test]
    fn unusual_volume_step_still_scales_linearly() {
        // Instrument z niestandardowym krokiem wolumenu (np. 0.1 zamiast 0.01) - silnik nie
        // zna kroku, tylko mnoży przez podany wolumen, więc krok jest wyłącznie kwestią
        // walidacji formularza, nie kalkulacji.
        let mut input = base_input(spec(dec!(0.01), dec!(0.01), dec!(1), "USD"));
        input.entry_price = Some(dec!(100.00));
        input.exit_price = Some(dec!(101.00));
        input.stop_loss = Some(dec!(99.00));
        input.take_profit = Some(dec!(103.00));
        input.volume = Some(dec!(0.3));

        let result = calculate(&input);

        // 1.00 różnicy / 0.01 ticka = 100 ticków * 1 USD * 0.3 wolumenu = 30 USD.
        assert_eq!(result.gross_pnl, Some(dec!(30)));
    }

    #[test]
    fn point_differs_from_trade_tick_size_uses_tick_size_for_money_and_point_for_display() {
        // Instrument, w którym Point != TradeTickSize (np. niektóre mini-indeksy): liczba
        // ticków do przeliczeń pieniężnych pochodzi z TradeTickSize, a `pnl_points`
        // prezentacyjne z Point - te dwie wartości mogą się różnić dla tej samej transakcji.
        let mut input = base_input(spec(dec!(0.001), dec!(0.01), dec!(1), "USD"));
        input.entry_price = Some(dec!(10.000));
        input.exit_price = Some(dec!(10.100));
        input.stop_loss = Some(dec!(9.900));
        input.take_profit = Some(dec!(10.300));

        let result = calculate(&input);

        // Różnica 0.100: / TradeTickSize 0.01 = 10 ticków * 1 USD = 10 USD.
        assert_eq!(result.gross_pnl, Some(dec!(10)));
        // Ta sama różnica / Point 0.001 = 100 - liczba punktów do samej prezentacji.
        assert_eq!(result.pnl_points, Some(dec!(100)));
    }

    #[test]
    fn currency_mismatch_without_conversion_rate_blocks_money_fields() {
        let mut input = base_input(spec(dec!(0.01), dec!(0.01), dec!(1), "CAD"));
        input.entry_price = Some(dec!(100.00));
        input.exit_price = Some(dec!(101.00));
        input.stop_loss = Some(dec!(99.00));
        input.take_profit = Some(dec!(103.00));
        input.account_currency = Some("USD".to_string());

        let result = calculate(&input);

        assert_eq!(result.gross_pnl, None);
        assert_eq!(result.net_pnl, None);
        assert_eq!(result.risk_amount, None);
        assert_eq!(result.reward_amount, None);
        assert!(result.requires_conversion_rate);
        // Wynik w punktach jest niezależny od waluty, więc nadal się liczy.
        assert_eq!(result.pnl_points, Some(dec!(100)));
    }

    #[test]
    fn currency_mismatch_with_conversion_rate_converts_every_money_field() {
        let mut input = base_input(spec(dec!(0.01), dec!(0.01), dec!(1), "CAD"));
        input.entry_price = Some(dec!(100.00));
        input.exit_price = Some(dec!(101.00));
        input.stop_loss = Some(dec!(99.00));
        input.take_profit = Some(dec!(103.00));
        input.account_currency = Some("USD".to_string());
        input.conversion_rate = Some(dec!(0.73));

        let result = calculate(&input);

        // 100 CAD (tak jak w teście bez konwersji) * 0.73 = 73 USD.
        assert_eq!(result.gross_pnl, Some(dec!(73)));
        assert!(!result.requires_conversion_rate);
    }

    #[test]
    fn changing_instrument_parameters_does_not_alter_a_frozen_calculation() {
        // Silnik jest czystą funkcją bez pamięci - to samo wejście zawsze daje ten sam wynik,
        // niezależnie od tego, co się później zmieni w "aktualnej" wersji instrumentu. Ten test
        // potwierdza, że podanie STAREGO (zamrożonego w migawce) spec-a odtwarza dokładnie
        // pierwotny wynik, nawet jeśli w tym samym procesie policzono już nowy spec.
        let old_spec = eurusd_spec();
        let mut input = base_input(old_spec.clone());
        input.entry_price = Some(dec!(1.10000));
        input.exit_price = Some(dec!(1.10500));
        let original = calculate(&input);

        let new_spec = spec(dec!(0.00001), dec!(0.00001), dec!(2), "USD");
        let mut changed_input = base_input(new_spec);
        changed_input.entry_price = input.entry_price;
        changed_input.exit_price = input.exit_price;
        let _ = calculate(&changed_input);

        let replayed = calculate(&input);
        assert_eq!(replayed, original, "ta sama migawka musi dać ten sam wynik");
        assert_eq!(original.gross_pnl, Some(dec!(500)));
    }
}
