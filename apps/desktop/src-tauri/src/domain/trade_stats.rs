use std::collections::BTreeMap;
use std::collections::HashMap;

use chrono::{DateTime, Datelike, NaiveDate, Timelike, Utc};
use rust_decimal::Decimal;
use serde::Serialize;

use super::trade::{Trade, TradeSide, TradeStatus};

/// Zamknięta, nieusunięta transakcja z policzonym wynikiem netto - jedyny kształt, na którym
/// liczą się statystyki/krzywa kapitału/kalendarz/rozbicia poniżej. Draft/open oraz transakcje
/// bez `net_pnl` (np. szkic bez ceny wyjścia) celowo nie wchodzą do żadnej z tych analiz - nie
/// ma tam jeszcze zrealizowanego wyniku do policzenia.
/// Chwila, w której wynik transakcji stał się faktem - używana przez WSZYSTKIE rozbicia czasowe.
///
/// Pozycja domknięta w całości częściowymi zamknięciami ma status "zamknięta", ale nie musi mieć
/// `closed_at`: datę zamknięcia wpisuje się przy zamykaniu ceną, a tu pozycja zeszła do zera przez
/// sumę zamknięć częściowych. Wcześniej każde rozbicie brało `closed_at` przez `expect`, więc
/// jedna taka transakcja wywalała Dashboard i wszystkie raporty tego konta.
///
/// `updated_at` to moment ostatniego zapisu transakcji, czyli najbliższa prawdzie chwila - ta sama
/// reguła, którą stosuje `balance::timeline` przy nanoszeniu wyniku na saldo. Obie muszą używać
/// tego samego znacznika, inaczej raport i saldo przypisałyby tę pozycję do różnych okresów.
fn zamkniecie(trade: &Trade) -> DateTime<Utc> {
    trade.closed_at.unwrap_or(trade.updated_at)
}

fn realized_trades(trades: &[Trade]) -> Vec<&Trade> {
    trades
        .iter()
        .filter(|t| {
            t.deleted_at.is_none() && t.status == TradeStatus::Closed && t.net_pnl.is_some()
        })
        .collect()
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct TradeStats {
    pub total_trades: i64,
    pub open_trades: i64,
    pub draft_trades: i64,
    pub closed_trades: i64,
    pub win_count: i64,
    pub loss_count: i64,
    pub breakeven_count: i64,
    pub win_rate: Option<Decimal>,
    pub gross_profit: Decimal,
    pub gross_loss: Decimal,
    pub net_pnl: Decimal,
    pub profit_factor: Option<Decimal>,
    pub expectancy: Option<Decimal>,
    pub average_win: Option<Decimal>,
    pub average_loss: Option<Decimal>,
    pub average_r: Option<Decimal>,
    pub best_trade: Option<Decimal>,
    pub worst_trade: Option<Decimal>,
    /// Średni czas trwania zrealizowanej transakcji (zamknięcie minus otwarcie) w minutach.
    pub average_trade_duration_minutes: Option<i64>,
    /// Maksymalne obsunięcie kapitału (peak-to-trough) na krzywej skumulowanego wyniku netto,
    /// w walucie konta - zawsze >= 0. `None` przy braku zrealizowanych transakcji.
    pub max_drawdown: Option<Decimal>,
    /// Suma prowizji wszystkich zrealizowanych transakcji - "Śr. wynik/trade" z raportów to
    /// już istniejące `expectancy` (ten sam wzór, `net_pnl / closed_trades`), więc nie ma
    /// osobnego pola na to samo.
    pub total_commission: Decimal,
    /// Liczba pozycji CZĘŚCIOWO zamkniętych, czyli takich, które mają już wpisy częściowych
    /// zamknięć, ale wciąż zostaje im lot do zamknięcia (sekcja 6.9).
    pub partially_closed_trades: i64,
    /// Wynik netto zrealizowany dotąd na tych pozycjach - trzymany ODDZIELNIE od `net_pnl`
    /// i celowo NIE wchodzący do żadnej statystyki liczonej z transakcji zamkniętych
    /// (win rate, profit factor, oczekiwana wartość, obsunięcie, krzywa kapitału).
    ///
    /// Powód jest podwójny. Po pierwsze, specyfikacja wymaga, żeby raport ODRÓŻNIAŁ wynik
    /// częściowo otwartej pozycji od wyniku transakcji domkniętej. Po drugie, gdyby wliczyć go
    /// do `net_pnl`, ta sama kwota zostałaby policzona DRUGI raz w chwili, gdy pozycja domknie
    /// się do końca i wejdzie do transakcji zamkniętych z tym samym wynikiem netto.
    pub partially_realized_pnl: Decimal,
}

/// Statystyki dashboardu - liczone raz, w Rust, z Decimal (nigdy we frontendzie). `trades`
/// powinno być pełną listą nieusuniętych transakcji konta (dowolny status) - funkcja sama
/// zawęża do zrealizowanych tam, gdzie to ma sens (wygrane/przegrane, profit factor itd.).
pub fn compute_stats(trades: &[Trade]) -> TradeStats {
    let mut stats = TradeStats::default();

    for trade in trades.iter().filter(|t| t.deleted_at.is_none()) {
        stats.total_trades += 1;
        match trade.status {
            TradeStatus::Draft => stats.draft_trades += 1,
            TradeStatus::Open => stats.open_trades += 1,
            TradeStatus::Closed => stats.closed_trades += 1,
        }
    }

    // Pozycje częściowo zamknięte liczone osobno - patrz doc-comment przy
    // `TradeStats::partially_realized_pnl`. Kiedy taka pozycja domknie się do końca, jej status
    // zmienia się na "zamknięta", wypada z tego kubełka i wchodzi do statystyk zrealizowanych -
    // nigdy nie jest w obu naraz.
    for trade in trades.iter().filter(|t| {
        t.deleted_at.is_none() && t.status == TradeStatus::Open && !t.partial_closes.is_empty()
    }) {
        stats.partially_closed_trades += 1;
        if let Some(net_pnl) = trade.net_pnl {
            stats.partially_realized_pnl += net_pnl;
        }
    }

    let realized = realized_trades(trades);
    let mut r_sum = Decimal::ZERO;
    let mut r_count: i64 = 0;

    for trade in &realized {
        let net_pnl = trade.net_pnl.expect("realized_trades gwarantuje Some");
        stats.net_pnl += net_pnl;
        stats.total_commission += trade.commission;
        if net_pnl.is_sign_positive() && !net_pnl.is_zero() {
            stats.win_count += 1;
            stats.gross_profit += net_pnl;
        } else if net_pnl.is_sign_negative() {
            stats.loss_count += 1;
            stats.gross_loss += net_pnl.abs();
        } else {
            stats.breakeven_count += 1;
        }
        if let Some(r) = trade.pnl_r {
            r_sum += r;
            r_count += 1;
        }
    }

    let decided = stats.win_count + stats.loss_count;
    if decided > 0 {
        stats.win_rate =
            Some(Decimal::from(stats.win_count) / Decimal::from(decided) * Decimal::ONE_HUNDRED);
    }
    if !stats.gross_loss.is_zero() {
        stats.profit_factor = Some(stats.gross_profit / stats.gross_loss);
    }
    if stats.win_count > 0 {
        stats.average_win = Some(stats.gross_profit / Decimal::from(stats.win_count));
    }
    if stats.loss_count > 0 {
        stats.average_loss = Some(stats.gross_loss / Decimal::from(stats.loss_count));
    }
    if !realized.is_empty() {
        stats.expectancy = Some(stats.net_pnl / Decimal::from(realized.len() as i64));
        stats.best_trade = realized.iter().filter_map(|t| t.net_pnl).max();
        stats.worst_trade = realized.iter().filter_map(|t| t.net_pnl).min();
    }
    if r_count > 0 {
        stats.average_r = Some(r_sum / Decimal::from(r_count));
    }

    let durations: Vec<i64> = realized
        .iter()
        .filter_map(|t| match (t.opened_at, t.closed_at) {
            (Some(opened), Some(closed)) => Some((closed - opened).num_minutes()),
            _ => None,
        })
        .collect();
    if !durations.is_empty() {
        stats.average_trade_duration_minutes =
            Some(durations.iter().sum::<i64>() / durations.len() as i64);
    }

    stats.max_drawdown = max_drawdown(trades);

    stats
}

/// Maksymalne obsunięcie (peak-to-trough) na krzywej skumulowanego wyniku netto, w kolejności
/// zamykania transakcji - ten sam porządek co `compute_equity_curve`.
fn max_drawdown(trades: &[Trade]) -> Option<Decimal> {
    let curve = compute_equity_curve(trades);
    if curve.is_empty() {
        return None;
    }
    let mut peak = Decimal::ZERO;
    let mut worst = Decimal::ZERO;
    for point in &curve {
        peak = peak.max(point.cumulative_net_pnl);
        worst = worst.max(peak - point.cumulative_net_pnl);
    }
    Some(worst)
}

#[derive(Debug, Clone, Serialize)]
pub struct EquityPoint {
    pub closed_at: DateTime<Utc>,
    pub net_pnl: Decimal,
    pub cumulative_net_pnl: Decimal,
}

/// Krzywa kapitału: skumulowany wynik netto w kolejności zamykania pozycji.
pub fn compute_equity_curve(trades: &[Trade]) -> Vec<EquityPoint> {
    let mut realized = realized_trades(trades);
    realized.sort_by_key(|t| zamkniecie(t));

    let mut cumulative = Decimal::ZERO;
    realized
        .into_iter()
        .filter_map(|t| {
            // `zamkniecie` zamiast `t.closed_at?`: pozycja domknięta częściowymi zamknięciami
            // nie ma daty zamknięcia i wypadała z krzywej kapitału, mimo że jej wynik wchodził
            // na saldo konta - krzywa rozjeżdżała się wtedy z saldem bez żadnego sygnału.
            let closed_at = zamkniecie(t);
            let net_pnl = t.net_pnl?;
            cumulative += net_pnl;
            Some(EquityPoint {
                closed_at,
                net_pnl,
                cumulative_net_pnl: cumulative,
            })
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
pub struct DailyPnl {
    pub date: NaiveDate,
    pub net_pnl: Decimal,
    pub trade_count: i64,
    pub win_count: i64,
    pub loss_count: i64,
}

#[derive(Default)]
struct DayAccumulator {
    net_pnl: Decimal,
    trade_count: i64,
    win_count: i64,
    loss_count: i64,
}

/// Agregacja dzienna do widoku kalendarza - jeden wpis na dzień, w którym zamknięto choć jedną
/// transakcję, posortowane rosnąco po dacie (`BTreeMap` daje to za darmo).
pub fn compute_calendar(trades: &[Trade]) -> Vec<DailyPnl> {
    let mut by_day: BTreeMap<NaiveDate, DayAccumulator> = BTreeMap::new();

    for trade in realized_trades(trades) {
        // Patrz `zamkniecie` - pominięcie pozycji bez `closed_at` robiło dziurę w kalendarzu.
        let closed_at = zamkniecie(trade);
        let Some(net_pnl) = trade.net_pnl else {
            continue;
        };
        let entry = by_day.entry(closed_at.date_naive()).or_default();
        entry.net_pnl += net_pnl;
        entry.trade_count += 1;
        if net_pnl.is_sign_positive() && !net_pnl.is_zero() {
            entry.win_count += 1;
        } else if net_pnl.is_sign_negative() {
            entry.loss_count += 1;
        }
    }

    by_day
        .into_iter()
        .map(|(date, acc)| DailyPnl {
            date,
            net_pnl: acc.net_pnl,
            trade_count: acc.trade_count,
            win_count: acc.win_count,
            loss_count: acc.loss_count,
        })
        .collect()
}

fn days_in_month(year: i32, month: u32) -> i64 {
    let this_month_first = NaiveDate::from_ymd_opt(year, month, 1).expect("poprawna data");
    let next_month_first = if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1)
    }
    .expect("poprawna data");
    (next_month_first - this_month_first).num_days()
}

/// Kalendarz jednego miesiąca - w odróżnieniu od `compute_calendar` zawiera KAŻDY dzień
/// miesiąca (zerowy wynik dla dni bez zamkniętych transakcji), żeby tabela "Kalendarz
/// miesiąca" w raporcie miesięcznym nigdy nie miała dziur. `trades` powinno być już zawężone
/// do tego miesiąca (przez wspólny filtr raportów) - ta funkcja tylko dopełnia brakujące dni.
pub fn compute_month_calendar(trades: &[Trade], year: i32, month: u32) -> Vec<DailyPnl> {
    let mut by_day: HashMap<NaiveDate, DailyPnl> = compute_calendar(trades)
        .into_iter()
        .map(|d| (d.date, d))
        .collect();

    (1..=days_in_month(year, month))
        .filter_map(|day| NaiveDate::from_ymd_opt(year, month, day as u32))
        .map(|date| {
            by_day.remove(&date).unwrap_or(DailyPnl {
                date,
                net_pnl: Decimal::ZERO,
                trade_count: 0,
                win_count: 0,
                loss_count: 0,
            })
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
pub struct GroupBreakdown {
    pub key: String,
    pub label: String,
    pub trade_count: i64,
    pub win_count: i64,
    pub loss_count: i64,
    pub win_rate: Option<Decimal>,
    pub net_pnl: Decimal,
}

struct GroupAccumulator {
    label: String,
    trade_count: i64,
    win_count: i64,
    loss_count: i64,
    net_pnl: Decimal,
}

fn compute_breakdown<'a, F>(trades: &'a [Trade], group_of: F) -> Vec<GroupBreakdown>
where
    F: Fn(&'a Trade) -> (String, String),
{
    let mut groups: HashMap<String, GroupAccumulator> = HashMap::new();

    for trade in realized_trades(trades) {
        let net_pnl = trade.net_pnl.expect("realized_trades gwarantuje Some");
        let (key, label) = group_of(trade);
        let entry = groups.entry(key).or_insert_with(|| GroupAccumulator {
            label,
            trade_count: 0,
            win_count: 0,
            loss_count: 0,
            net_pnl: Decimal::ZERO,
        });
        entry.trade_count += 1;
        entry.net_pnl += net_pnl;
        if net_pnl.is_sign_positive() && !net_pnl.is_zero() {
            entry.win_count += 1;
        } else if net_pnl.is_sign_negative() {
            entry.loss_count += 1;
        }
    }

    let mut result: Vec<GroupBreakdown> = groups
        .into_iter()
        .map(|(key, acc)| {
            let decided = acc.win_count + acc.loss_count;
            GroupBreakdown {
                key,
                label: acc.label,
                trade_count: acc.trade_count,
                win_count: acc.win_count,
                loss_count: acc.loss_count,
                win_rate: (decided > 0).then(|| {
                    Decimal::from(acc.win_count) / Decimal::from(decided) * Decimal::ONE_HUNDRED
                }),
                net_pnl: acc.net_pnl,
            }
        })
        .collect();
    result.sort_by_key(|g| std::cmp::Reverse(g.net_pnl));
    result
}

pub fn compute_strategy_breakdown(trades: &[Trade]) -> Vec<GroupBreakdown> {
    compute_breakdown(trades, |t| match &t.strategy_snapshot {
        Some(snapshot) => (snapshot.strategy_id.clone(), snapshot.name.clone()),
        None => ("none".to_string(), "Bez strategii".to_string()),
    })
}

pub fn compute_instrument_breakdown(trades: &[Trade]) -> Vec<GroupBreakdown> {
    compute_breakdown(trades, |t| {
        match (&t.instrument_id, &t.instrument_spec_snapshot) {
            (Some(id), Some(snapshot)) => (id.clone(), snapshot.display_symbol.clone()),
            _ => ("none".to_string(), "Bez instrumentu".to_string()),
        }
    })
}

/// Rozbicie po interwale - grupuje po `interval_id`, etykietuje zamrożoną migawką `interval`
/// (ten sam wzorzec co migawka instrumentu/strategii - patrz `Trade::interval`).
pub fn compute_interval_breakdown(trades: &[Trade]) -> Vec<GroupBreakdown> {
    compute_breakdown(trades, |t| match (&t.interval_id, &t.interval) {
        (Some(id), Some(label)) => (id.clone(), label.clone()),
        _ => ("none".to_string(), "Bez interwału".to_string()),
    })
}

const MONTH_NAMES: [&str; 12] = [
    "Styczeń",
    "Luty",
    "Marzec",
    "Kwiecień",
    "Maj",
    "Czerwiec",
    "Lipiec",
    "Sierpień",
    "Wrzesień",
    "Październik",
    "Listopad",
    "Grudzień",
];

const WEEKDAY_NAMES: [&str; 7] = [
    "Poniedziałek",
    "Wtorek",
    "Środa",
    "Czwartek",
    "Piątek",
    "Sobota",
    "Niedziela",
];

/// Rozbicie miesięczne (rok+miesiąc zamknięcia transakcji) - posortowane chronologicznie
/// rosnąco (w odróżnieniu od `compute_breakdown`, które sortuje po wyniku).
pub fn compute_monthly_breakdown(trades: &[Trade]) -> Vec<GroupBreakdown> {
    let mut result = compute_breakdown(trades, |t| {
        let closed_at = zamkniecie(t);
        let key = format!("{:04}-{:02}", closed_at.year(), closed_at.month());
        let label = format!(
            "{} {}",
            MONTH_NAMES[(closed_at.month() - 1) as usize],
            closed_at.year()
        );
        (key, label)
    });
    result.sort_by(|a, b| a.key.cmp(&b.key));
    result
}

/// Rozbicie po miesiącu kalendarzowym (Styczeń..Grudzień), bez roku - zawsze wszystkie 12
/// miesięcy w kolejności. Znaczenie zależy od tego, czy `trades` jest już zawężone do jednego
/// roku przez wspólny filtr: jeśli tak, to "miesiące TEGO roku" (raport roczny); jeśli nie, to
/// "wszystkie miesiące zsumowane po latach" (np. wykres na Dashboardzie).
pub fn compute_calendar_month_breakdown(trades: &[Trade]) -> Vec<GroupBreakdown> {
    let mut by_month = compute_breakdown(trades, |t| {
        let month = zamkniecie(t).month();
        (
            (month - 1).to_string(),
            MONTH_NAMES[(month - 1) as usize].to_string(),
        )
    });

    let mut result = Vec::with_capacity(12);
    for (index, label) in MONTH_NAMES.iter().enumerate() {
        let key = index.to_string();
        match by_month.iter().position(|g| g.key == key) {
            Some(pos) => result.push(by_month.remove(pos)),
            None => result.push(GroupBreakdown {
                key,
                label: label.to_string(),
                trade_count: 0,
                win_count: 0,
                loss_count: 0,
                win_rate: None,
                net_pnl: Decimal::ZERO,
            }),
        }
    }
    result
}

/// Rozbicie roczne (rok zamknięcia transakcji) - posortowane chronologicznie rosnąco.
pub fn compute_yearly_breakdown(trades: &[Trade]) -> Vec<GroupBreakdown> {
    let mut result = compute_breakdown(trades, |t| {
        let year = zamkniecie(t).year();
        (year.to_string(), year.to_string())
    });
    result.sort_by(|a, b| a.key.cmp(&b.key));
    result
}

/// Rozbicie po dniu tygodnia zamknięcia (Poniedziałek..Niedziela) - zawiera zawsze wszystkie 7
/// dni w ustalonej kolejności, nawet bez ani jednej transakcji danego dnia (zerowy wynik).
pub fn compute_day_of_week_breakdown(trades: &[Trade]) -> Vec<GroupBreakdown> {
    let mut by_day = compute_breakdown(trades, |t| {
        let weekday = zamkniecie(t).weekday().num_days_from_monday();
        (
            weekday.to_string(),
            WEEKDAY_NAMES[weekday as usize].to_string(),
        )
    });

    let mut result = Vec::with_capacity(7);
    for day in 0..7u32 {
        let key = day.to_string();
        match by_day.iter().position(|g| g.key == key) {
            Some(pos) => result.push(by_day.remove(pos)),
            None => result.push(GroupBreakdown {
                key,
                label: WEEKDAY_NAMES[day as usize].to_string(),
                trade_count: 0,
                win_count: 0,
                loss_count: 0,
                win_rate: None,
                net_pnl: Decimal::ZERO,
            }),
        }
    }
    result
}

const FOUR_HOUR_LABELS: [&str; 6] = ["00-03", "04-07", "08-11", "12-15", "16-19", "20-23"];

/// Rozbicie po 4-godzinnym przedziale zamknięcia. Liczone na UTC (ten sam wzorzec co
/// `.weekday()` powyżej), bez przeliczania na strefę lokalną, bo aplikacja nie ma ustawienia
/// strefy czasowej użytkownika. Zawsze wszystkie 6 przedziałów w ustalonej kolejności.
pub fn compute_four_hour_breakdown(trades: &[Trade]) -> Vec<GroupBreakdown> {
    let mut by_bucket = compute_breakdown(trades, |t| {
        let hour = zamkniecie(t).hour();
        let bucket = (hour / 4) as usize;
        (bucket.to_string(), FOUR_HOUR_LABELS[bucket].to_string())
    });

    let mut result = Vec::with_capacity(6);
    for (bucket, label) in FOUR_HOUR_LABELS.iter().enumerate() {
        let key = bucket.to_string();
        match by_bucket.iter().position(|g| g.key == key) {
            Some(pos) => result.push(by_bucket.remove(pos)),
            None => result.push(GroupBreakdown {
                key,
                label: label.to_string(),
                trade_count: 0,
                win_count: 0,
                loss_count: 0,
                win_rate: None,
                net_pnl: Decimal::ZERO,
            }),
        }
    }
    result
}

/// Rozbicie BUY/SELL - zawsze oba kierunki w tej kolejności, nawet bez transakcji jednego z nich.
pub fn compute_side_breakdown(trades: &[Trade]) -> Vec<GroupBreakdown> {
    let mut by_side = compute_breakdown(trades, |t| {
        (
            t.side.as_db_str().to_string(),
            match t.side {
                TradeSide::Buy => "BUY".to_string(),
                TradeSide::Sell => "SELL".to_string(),
            },
        )
    });

    ["buy", "sell"]
        .into_iter()
        .map(|key| {
            by_side
                .iter()
                .position(|g| g.key == key)
                .map(|pos| by_side.remove(pos))
                .unwrap_or_else(|| GroupBreakdown {
                    key: key.to_string(),
                    label: if key == "buy" { "BUY" } else { "SELL" }.to_string(),
                    trade_count: 0,
                    win_count: 0,
                    loss_count: 0,
                    win_rate: None,
                    net_pnl: Decimal::ZERO,
                })
        })
        .collect()
}

const QUARTER_LABELS: [&str; 4] = ["Q1", "Q2", "Q3", "Q4"];

/// Rozbicie kwartalne (kwartał zamknięcia) - zawsze wszystkie 4 kwartały w kolejności Q1-Q4.
pub fn compute_quarterly_breakdown(trades: &[Trade]) -> Vec<GroupBreakdown> {
    let mut by_quarter = compute_breakdown(trades, |t| {
        let month = zamkniecie(t).month();
        let quarter = ((month - 1) / 3) as usize;
        (quarter.to_string(), QUARTER_LABELS[quarter].to_string())
    });

    let mut result = Vec::with_capacity(4);
    for (quarter, label) in QUARTER_LABELS.iter().enumerate() {
        let key = quarter.to_string();
        match by_quarter.iter().position(|g| g.key == key) {
            Some(pos) => result.push(by_quarter.remove(pos)),
            None => result.push(GroupBreakdown {
                key,
                label: label.to_string(),
                trade_count: 0,
                win_count: 0,
                loss_count: 0,
                win_rate: None,
                net_pnl: Decimal::ZERO,
            }),
        }
    }
    result
}

/// Jeden wiersz listy TOP N transakcji (sekcja "TOP 5" w raporcie miesięcznym) - niesie już
/// gotowe etykiety instrumentu/strategii (z migawek), żeby frontend nic nie musiał doszukiwać.
#[derive(Debug, Clone, Serialize)]
pub struct TopTradeRow {
    pub trade_id: String,
    pub display_number: i64,
    pub opened_at: Option<DateTime<Utc>>,
    pub instrument_label: String,
    pub strategy_label: String,
    pub side: TradeSide,
    pub net_pnl: Decimal,
}

/// `n` najlepszych (`best = true`) albo najgorszych zrealizowanych transakcji po wyniku netto.
pub fn compute_top_trades(trades: &[Trade], n: usize, best: bool) -> Vec<TopTradeRow> {
    let mut realized = realized_trades(trades);
    realized.sort_by_key(|t| t.net_pnl.expect("realized_trades gwarantuje Some"));
    if best {
        realized.reverse();
    }
    realized
        .into_iter()
        .take(n)
        .map(|t| TopTradeRow {
            trade_id: t.id.clone(),
            display_number: t.display_number,
            opened_at: t.opened_at,
            instrument_label: t
                .instrument_spec_snapshot
                .as_ref()
                .map(|s| s.display_symbol.clone())
                .unwrap_or_else(|| "Bez instrumentu".to_string()),
            strategy_label: t
                .strategy_snapshot
                .as_ref()
                .map(|s| s.name.clone())
                .unwrap_or_else(|| "Bez strategii".to_string()),
            side: t.side,
            net_pnl: t.net_pnl.expect("realized_trades gwarantuje Some"),
        })
        .collect()
}

/// Jeden przedział histogramu wyniku netto (sekcja "Rozkład wyników" na Dashboardzie).
#[derive(Debug, Clone, Serialize)]
pub struct PnlDistributionBucket {
    pub range_label: String,
    pub count: i64,
}

const PNL_DISTRIBUTION_BUCKET_COUNT: i64 = 6;

fn format_pnl_range(from: Decimal, to: Decimal) -> String {
    format!("{} … {}", from.round_dp(2), to.round_dp(2))
}

/// Histogram wyniku netto zrealizowanych transakcji - dzieli zakres [min, max] na 6 równych
/// przedziałów i liczy transakcje w każdym. Pusta lista przy braku zrealizowanych transakcji;
/// jeden przedział, gdy wszystkie transakcje mają identyczny wynik (zakres o szerokości zero).
pub fn compute_pnl_distribution(trades: &[Trade]) -> Vec<PnlDistributionBucket> {
    let realized = realized_trades(trades);
    let values: Vec<Decimal> = realized
        .iter()
        .map(|t| t.net_pnl.expect("realized_trades gwarantuje Some"))
        .collect();
    let Some(min) = values.iter().min().copied() else {
        return Vec::new();
    };
    let max = values.iter().max().copied().expect("niepusta lista");
    if min == max {
        return vec![PnlDistributionBucket {
            range_label: format_pnl_range(min, max),
            count: values.len() as i64,
        }];
    }

    let bucket_count = PNL_DISTRIBUTION_BUCKET_COUNT;
    let width = (max - min) / Decimal::from(bucket_count);
    let boundaries: Vec<Decimal> = (0..=bucket_count)
        .map(|i| min + width * Decimal::from(i))
        .collect();

    let mut counts = vec![0i64; bucket_count as usize];
    for value in &values {
        let mut bucket = (bucket_count - 1) as usize;
        for i in 0..bucket_count as usize {
            if *value < boundaries[i + 1] {
                bucket = i;
                break;
            }
        }
        counts[bucket] += 1;
    }

    boundaries
        .windows(2)
        .zip(counts)
        .map(|(bounds, count)| PnlDistributionBucket {
            range_label: format_pnl_range(bounds[0], bounds[1]),
            count,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::instrument::InstrumentSnapshot;
    use crate::domain::strategy::StrategySnapshot;
    use crate::domain::trade::{PnlSource, TradeSide};
    use crate::domain::trade_partial_close::PartialClose;
    use chrono::{Duration, TimeZone};
    use rust_decimal_macros::dec;

    fn base_trade(id: &str) -> Trade {
        Trade {
            id: id.to_string(),
            account_id: "acc-1".to_string(),
            display_number: 1,
            instrument_id: None,
            instrument_spec_snapshot: None,
            strategy_id: None,
            strategy_snapshot: None,
            status: TradeStatus::Draft,
            side: TradeSide::Buy,
            opened_at: None,
            closed_at: None,
            interval_id: None,
            interval: None,
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

    fn closed_trade(id: &str, days_ago: i64, net_pnl: Decimal, pnl_r: Option<Decimal>) -> Trade {
        Trade {
            status: TradeStatus::Closed,
            closed_at: Some(Utc::now() - Duration::days(days_ago)),
            net_pnl: Some(net_pnl),
            pnl_r,
            ..base_trade(id)
        }
    }

    #[test]
    fn stats_count_trades_by_status() {
        let trades = vec![
            base_trade("1"),
            Trade {
                status: TradeStatus::Open,
                ..base_trade("2")
            },
            closed_trade("4", 1, dec!(100), Some(dec!(1))),
        ];
        let stats = compute_stats(&trades);
        assert_eq!(stats.total_trades, 3);
        assert_eq!(stats.draft_trades, 1);
        assert_eq!(stats.open_trades, 1);
        assert_eq!(stats.closed_trades, 1);
    }

    #[test]
    fn wynik_pozycji_czesciowo_zamknietej_jest_liczony_osobno_i_nie_podwojnie() {
        // Pozycja WCIĄŻ OTWARTA, ale z częściowym zamknięciem: ma już zrealizowane 80.
        let czesciowa = Trade {
            status: TradeStatus::Open,
            volume: Some(dec!(1.0)),
            net_pnl: Some(dec!(80)),
            partial_closes: vec![PartialClose {
                closed_volume: dec!(0.4),
                realized_pnl: dec!(80),
            }],
            ..base_trade("czesciowa")
        };
        let trades = vec![czesciowa, closed_trade("zamknieta", 1, dec!(100), None)];

        let stats = compute_stats(&trades);

        assert_eq!(stats.partially_closed_trades, 1);
        assert_eq!(stats.partially_realized_pnl, dec!(80));
        assert_eq!(
            stats.net_pnl,
            dec!(100),
            "wynik częściowo otwartej pozycji NIE może wpaść do wyniku transakcji zamkniętych"
        );
        assert_eq!(
            stats.win_count, 1,
            "częściowo otwarta pozycja nie jest jeszcze wygraną ani przegraną"
        );
        assert_eq!(stats.closed_trades, 1);
        assert_eq!(stats.open_trades, 1);
    }

    #[test]
    fn domkniecie_pozycji_przenosi_wynik_z_kubelka_czesciowego_do_zamknietych() {
        // Ta sama pozycja po domknięciu całego lota: status zamknięta, ten sam wynik netto.
        // Musi zniknąć z kubełka częściowego, inaczej te 80 policzyłoby się drugi raz.
        let domknieta = Trade {
            status: TradeStatus::Closed,
            volume: Some(dec!(1.0)),
            net_pnl: Some(dec!(80)),
            partial_closes: vec![
                PartialClose {
                    closed_volume: dec!(0.4),
                    realized_pnl: dec!(80),
                },
                PartialClose {
                    closed_volume: dec!(0.6),
                    realized_pnl: dec!(0),
                },
            ],
            ..base_trade("domknieta")
        };

        let stats = compute_stats(&[domknieta]);

        assert_eq!(stats.partially_closed_trades, 0);
        assert_eq!(stats.partially_realized_pnl, Decimal::ZERO);
        assert_eq!(stats.net_pnl, dec!(80), "policzone dokładnie raz");
    }

    #[test]
    fn win_rate_and_profit_factor_from_wins_and_losses() {
        let trades = vec![
            closed_trade("1", 3, dec!(100), Some(dec!(1))),
            closed_trade("2", 2, dec!(200), Some(dec!(2))),
            closed_trade("3", 1, dec!(-50), Some(dec!(-1))),
        ];
        let stats = compute_stats(&trades);
        assert_eq!(stats.win_count, 2);
        assert_eq!(stats.loss_count, 1);
        assert_eq!(
            stats.win_rate,
            Some(Decimal::from(2) / Decimal::from(3) * Decimal::ONE_HUNDRED)
        );
        assert_eq!(stats.gross_profit, dec!(300));
        assert_eq!(stats.gross_loss, dec!(50));
        assert_eq!(stats.net_pnl, dec!(250));
        assert_eq!(stats.profit_factor, Some(dec!(6)));
        assert_eq!(stats.average_win, Some(dec!(150)));
        assert_eq!(stats.average_loss, Some(dec!(50)));
        assert_eq!(stats.expectancy, Some(dec!(250) / dec!(3)));
        assert_eq!(stats.best_trade, Some(dec!(200)));
        assert_eq!(stats.worst_trade, Some(dec!(-50)));
        assert_eq!(
            stats.average_r,
            Some((dec!(1) + dec!(2) + dec!(-1)) / dec!(3))
        );
    }

    #[test]
    fn no_realized_trades_leaves_optional_stats_empty() {
        let trades = vec![base_trade("1")];
        let stats = compute_stats(&trades);
        assert_eq!(stats.win_rate, None);
        assert_eq!(stats.profit_factor, None);
        assert_eq!(stats.expectancy, None);
        assert_eq!(stats.net_pnl, dec!(0));
    }

    #[test]
    fn deleted_trades_are_excluded_from_stats() {
        let mut deleted = closed_trade("1", 1, dec!(1000), None);
        deleted.deleted_at = Some(Utc::now());
        let stats = compute_stats(&[deleted]);
        assert_eq!(stats.total_trades, 0);
        assert_eq!(stats.net_pnl, dec!(0));
    }

    #[test]
    fn equity_curve_is_cumulative_in_chronological_order() {
        let trades = vec![
            closed_trade("1", 1, dec!(100), None),
            closed_trade("2", 5, dec!(-30), None),
            closed_trade("3", 3, dec!(50), None),
        ];
        let curve = compute_equity_curve(&trades);
        assert_eq!(curve.len(), 3);
        assert_eq!(curve[0].net_pnl, dec!(-30));
        assert_eq!(curve[0].cumulative_net_pnl, dec!(-30));
        assert_eq!(curve[1].net_pnl, dec!(50));
        assert_eq!(curve[1].cumulative_net_pnl, dec!(20));
        assert_eq!(curve[2].net_pnl, dec!(100));
        assert_eq!(curve[2].cumulative_net_pnl, dec!(120));
    }

    #[test]
    fn calendar_groups_multiple_trades_on_the_same_day() {
        let today = Utc::now();
        let mut a = closed_trade("1", 0, dec!(100), None);
        a.closed_at = Some(today);
        let mut b = closed_trade("2", 0, dec!(-40), None);
        b.closed_at = Some(today);
        let calendar = compute_calendar(&[a, b]);
        assert_eq!(calendar.len(), 1);
        assert_eq!(calendar[0].trade_count, 2);
        assert_eq!(calendar[0].net_pnl, dec!(60));
    }

    #[test]
    fn strategy_breakdown_groups_by_snapshot_and_labels_missing_as_none() {
        let mut with_strategy = closed_trade("1", 1, dec!(100), None);
        with_strategy.strategy_snapshot = Some(StrategySnapshot {
            strategy_id: "strat-1".to_string(),
            name: "Breakout".to_string(),
            color: None,
        });
        let without_strategy = closed_trade("2", 1, dec!(-20), None);

        let breakdown = compute_strategy_breakdown(&[with_strategy, without_strategy]);
        assert_eq!(breakdown.len(), 2);
        assert_eq!(breakdown[0].label, "Breakout");
        assert_eq!(breakdown[0].net_pnl, dec!(100));
        assert_eq!(breakdown[1].label, "Bez strategii");
        assert_eq!(breakdown[1].net_pnl, dec!(-20));
    }

    #[test]
    fn instrument_breakdown_groups_by_symbol() {
        let mut trade = closed_trade("1", 1, dec!(50), None);
        trade.instrument_id = Some("instr-1".to_string());
        trade.instrument_spec_snapshot = Some(InstrumentSnapshot {
            display_symbol: "EURUSD".to_string(),
            source_symbol: "EURUSD.ecn".to_string(),
            description: "Euro / Dolar amerykański".to_string(),
            category: "Forex".to_string(),
            instrument_version_id: "version-1".to_string(),
            currency_base: "EUR".to_string(),
            currency_profit: "USD".to_string(),
            currency_margin: "EUR".to_string(),
            digits: 5,
            point: dec!(0.00001),
            trade_tick_size: dec!(0.00001),
            trade_tick_value: dec!(1),
            tick_value_profit: dec!(1),
            tick_value_loss: dec!(1),
            contract_size: dec!(100000),
            volume_min: dec!(0.01),
            volume_max: dec!(100),
            volume_step: dec!(0.01),
            volume_limit: dec!(0),
            calc_mode: "SYMBOL_CALC_MODE_FOREX".to_string(),
        });

        let breakdown = compute_instrument_breakdown(&[trade]);
        assert_eq!(breakdown.len(), 1);
        assert_eq!(breakdown[0].key, "instr-1");
        assert_eq!(breakdown[0].label, "EURUSD");
    }

    #[test]
    fn average_trade_duration_is_mean_of_close_minus_open() {
        let mut a = closed_trade("1", 1, dec!(10), None);
        a.opened_at = Some(a.closed_at.unwrap() - Duration::minutes(30));
        let mut b = closed_trade("2", 2, dec!(10), None);
        b.opened_at = Some(b.closed_at.unwrap() - Duration::minutes(90));
        let stats = compute_stats(&[a, b]);
        assert_eq!(stats.average_trade_duration_minutes, Some(60));
    }

    #[test]
    fn trades_without_opened_at_are_excluded_from_average_duration() {
        let trade = closed_trade("1", 1, dec!(10), None);
        let stats = compute_stats(&[trade]);
        assert_eq!(stats.average_trade_duration_minutes, None);
    }

    #[test]
    fn max_drawdown_is_the_largest_peak_to_trough_drop() {
        let trades = vec![
            closed_trade("1", 5, dec!(100), None),  // cumulative 100 (peak)
            closed_trade("2", 4, dec!(-150), None), // cumulative -50 (drawdown 150 from peak)
            closed_trade("3", 3, dec!(30), None),   // cumulative -20
            closed_trade("4", 2, dec!(200), None),  // cumulative 180 (new peak)
        ];
        let stats = compute_stats(&trades);
        assert_eq!(stats.max_drawdown, Some(dec!(150)));
    }

    #[test]
    fn no_realized_trades_leaves_drawdown_and_duration_empty() {
        let stats = compute_stats(&[base_trade("1")]);
        assert_eq!(stats.max_drawdown, None);
        assert_eq!(stats.average_trade_duration_minutes, None);
    }

    #[test]
    fn monthly_breakdown_groups_by_year_and_month_sorted_chronologically() {
        let mut jan = closed_trade("1", 0, dec!(100), None);
        jan.closed_at = Some(Utc.with_ymd_and_hms(2026, 1, 15, 10, 0, 0).unwrap());
        let mut mar = closed_trade("2", 0, dec!(-40), None);
        mar.closed_at = Some(Utc.with_ymd_and_hms(2026, 3, 5, 10, 0, 0).unwrap());
        let mut jan2 = closed_trade("3", 0, dec!(20), None);
        jan2.closed_at = Some(Utc.with_ymd_and_hms(2026, 1, 20, 10, 0, 0).unwrap());

        let breakdown = compute_monthly_breakdown(&[mar, jan, jan2]);
        assert_eq!(breakdown.len(), 2);
        assert_eq!(breakdown[0].label, "Styczeń 2026");
        assert_eq!(breakdown[0].trade_count, 2);
        assert_eq!(breakdown[0].net_pnl, dec!(120));
        assert_eq!(breakdown[1].label, "Marzec 2026");
        assert_eq!(breakdown[1].net_pnl, dec!(-40));
    }

    #[test]
    fn yearly_breakdown_groups_by_year_sorted_chronologically() {
        let mut y2025 = closed_trade("1", 0, dec!(50), None);
        y2025.closed_at = Some(Utc.with_ymd_and_hms(2025, 6, 1, 0, 0, 0).unwrap());
        let mut y2026 = closed_trade("2", 0, dec!(-10), None);
        y2026.closed_at = Some(Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap());

        let breakdown = compute_yearly_breakdown(&[y2026, y2025]);
        assert_eq!(breakdown.len(), 2);
        assert_eq!(breakdown[0].label, "2025");
        assert_eq!(breakdown[1].label, "2026");
    }

    #[test]
    fn day_of_week_breakdown_always_returns_all_seven_days_in_order() {
        let mut monday = closed_trade("1", 0, dec!(50), None);
        // 2026-01-05 to poniedziałek.
        monday.closed_at = Some(Utc.with_ymd_and_hms(2026, 1, 5, 10, 0, 0).unwrap());

        let breakdown = compute_day_of_week_breakdown(&[monday]);
        assert_eq!(breakdown.len(), 7);
        assert_eq!(breakdown[0].label, "Poniedziałek");
        assert_eq!(breakdown[0].trade_count, 1);
        assert_eq!(breakdown[1].label, "Wtorek");
        assert_eq!(breakdown[1].trade_count, 0);
        assert_eq!(breakdown[6].label, "Niedziela");
    }

    #[test]
    fn four_hour_breakdown_groups_by_bucket_and_returns_all_six() {
        let mut early = closed_trade("1", 0, dec!(50), None);
        early.closed_at = Some(Utc.with_ymd_and_hms(2026, 1, 5, 2, 0, 0).unwrap());
        let mut mid = closed_trade("2", 0, dec!(-20), None);
        mid.closed_at = Some(Utc.with_ymd_and_hms(2026, 1, 6, 9, 0, 0).unwrap());

        let breakdown = compute_four_hour_breakdown(&[early, mid]);
        assert_eq!(breakdown.len(), 6);
        assert_eq!(breakdown[0].label, "00-03");
        assert_eq!(breakdown[0].net_pnl, dec!(50));
        assert_eq!(breakdown[2].label, "08-11");
        assert_eq!(breakdown[2].net_pnl, dec!(-20));
        assert_eq!(breakdown[1].trade_count, 0);
    }

    #[test]
    fn side_breakdown_returns_both_sides_even_without_trades() {
        let mut buy = closed_trade("1", 0, dec!(100), None);
        buy.side = TradeSide::Buy;
        buy.closed_at = Some(Utc.with_ymd_and_hms(2026, 1, 5, 10, 0, 0).unwrap());

        let breakdown = compute_side_breakdown(&[buy]);
        assert_eq!(breakdown.len(), 2);
        assert_eq!(breakdown[0].label, "BUY");
        assert_eq!(breakdown[0].net_pnl, dec!(100));
        assert_eq!(breakdown[1].label, "SELL");
        assert_eq!(breakdown[1].trade_count, 0);
    }

    #[test]
    fn quarterly_breakdown_returns_all_four_quarters_in_order() {
        let mut q1 = closed_trade("1", 0, dec!(30), None);
        q1.closed_at = Some(Utc.with_ymd_and_hms(2026, 2, 1, 10, 0, 0).unwrap());
        let mut q3 = closed_trade("2", 0, dec!(-10), None);
        q3.closed_at = Some(Utc.with_ymd_and_hms(2026, 8, 1, 10, 0, 0).unwrap());

        let breakdown = compute_quarterly_breakdown(&[q3, q1]);
        assert_eq!(breakdown.len(), 4);
        assert_eq!(breakdown[0].label, "Q1");
        assert_eq!(breakdown[0].net_pnl, dec!(30));
        assert_eq!(breakdown[1].trade_count, 0);
        assert_eq!(breakdown[2].label, "Q3");
        assert_eq!(breakdown[2].net_pnl, dec!(-10));
    }

    #[test]
    fn top_trades_returns_best_n_sorted_descending() {
        let trades = vec![
            closed_trade("1", 0, dec!(50), None),
            closed_trade("2", 0, dec!(200), None),
            closed_trade("3", 0, dec!(-30), None),
        ];
        let best = compute_top_trades(&trades, 2, true);
        assert_eq!(best.len(), 2);
        assert_eq!(best[0].net_pnl, dec!(200));
        assert_eq!(best[1].net_pnl, dec!(50));
    }

    #[test]
    fn top_trades_returns_worst_n_sorted_ascending() {
        let trades = vec![
            closed_trade("1", 0, dec!(50), None),
            closed_trade("2", 0, dec!(200), None),
            closed_trade("3", 0, dec!(-30), None),
        ];
        let worst = compute_top_trades(&trades, 2, false);
        assert_eq!(worst.len(), 2);
        assert_eq!(worst[0].net_pnl, dec!(-30));
        assert_eq!(worst[1].net_pnl, dec!(50));
    }

    #[test]
    fn top_trades_labels_use_snapshot_or_fall_back_to_none_label() {
        let mut trade = closed_trade("1", 0, dec!(100), None);
        trade.instrument_spec_snapshot = None;
        trade.strategy_snapshot = None;
        let rows = compute_top_trades(&[trade], 1, true);
        assert_eq!(rows[0].instrument_label, "Bez instrumentu");
        assert_eq!(rows[0].strategy_label, "Bez strategii");
    }

    #[test]
    fn month_calendar_zero_fills_every_day_of_the_month() {
        let mut trade = closed_trade("1", 0, dec!(100), None);
        trade.closed_at = Some(Utc.with_ymd_and_hms(2026, 2, 10, 10, 0, 0).unwrap());

        let calendar = compute_month_calendar(&[trade], 2026, 2);
        assert_eq!(calendar.len(), 28); // luty 2026 nie jest przestępny
        assert_eq!(calendar[9].net_pnl, dec!(100)); // 10. dzień = indeks 9
        assert_eq!(calendar[9].trade_count, 1);
        assert_eq!(calendar[0].trade_count, 0);
        assert_eq!(calendar[0].net_pnl, dec!(0));
    }

    #[test]
    fn total_commission_sums_only_realized_trades() {
        let mut a = closed_trade("1", 0, dec!(100), None);
        a.commission = dec!(5);
        let mut b = base_trade("2");
        b.commission = dec!(999); // draft - nie powinien wliczyć się do sumy
        let stats = compute_stats(&[a, b]);
        assert_eq!(stats.total_commission, dec!(5));
    }

    #[test]
    fn interval_breakdown_groups_by_frozen_label_and_labels_missing_as_none() {
        let mut with_interval = closed_trade("1", 1, dec!(100), None);
        with_interval.interval_id = Some("iv-1".to_string());
        with_interval.interval = Some("M15".to_string());
        let without_interval = closed_trade("2", 1, dec!(-20), None);

        let breakdown = compute_interval_breakdown(&[with_interval, without_interval]);
        assert_eq!(breakdown.len(), 2);
        assert_eq!(breakdown[0].label, "M15");
        assert_eq!(breakdown[0].net_pnl, dec!(100));
        assert_eq!(breakdown[1].label, "Bez interwału");
        assert_eq!(breakdown[1].net_pnl, dec!(-20));
    }

    #[test]
    fn calendar_month_breakdown_always_returns_twelve_months_regardless_of_year() {
        let mut jan_2025 = closed_trade("1", 0, dec!(50), None);
        jan_2025.closed_at = Some(Utc.with_ymd_and_hms(2025, 1, 10, 10, 0, 0).unwrap());
        let mut jan_2026 = closed_trade("2", 0, dec!(30), None);
        jan_2026.closed_at = Some(Utc.with_ymd_and_hms(2026, 1, 20, 10, 0, 0).unwrap());

        let breakdown = compute_calendar_month_breakdown(&[jan_2025, jan_2026]);
        assert_eq!(breakdown.len(), 12);
        assert_eq!(breakdown[0].label, "Styczeń");
        assert_eq!(breakdown[0].trade_count, 2); // sumuje styczeń obu lat
        assert_eq!(breakdown[0].net_pnl, dec!(80));
        assert_eq!(breakdown[1].label, "Luty");
        assert_eq!(breakdown[1].trade_count, 0);
    }

    #[test]
    fn pnl_distribution_buckets_values_into_six_equal_ranges() {
        let trades = vec![
            closed_trade("1", 0, dec!(0), None),
            closed_trade("2", 0, dec!(60), None),
            closed_trade("3", 0, dec!(60), None),
        ];
        let buckets = compute_pnl_distribution(&trades);
        assert_eq!(buckets.len(), 6);
        let total: i64 = buckets.iter().map(|b| b.count).sum();
        assert_eq!(total, 3);
        assert_eq!(buckets[0].count, 1); // wartość 0 trafia do pierwszego przedziału
        assert_eq!(buckets[5].count, 2); // wartość max (60) trafia do ostatniego przedziału
    }

    #[test]
    fn pnl_distribution_with_identical_values_returns_one_bucket() {
        let trades = vec![
            closed_trade("1", 0, dec!(100), None),
            closed_trade("2", 0, dec!(100), None),
        ];
        let buckets = compute_pnl_distribution(&trades);
        assert_eq!(buckets.len(), 1);
        assert_eq!(buckets[0].count, 2);
    }

    #[test]
    fn pnl_distribution_is_empty_without_realized_trades() {
        let buckets = compute_pnl_distribution(&[base_trade("1")]);
        assert!(buckets.is_empty());
    }

    /// Pozycja domknięta W CAŁOŚCI częściowymi zamknięciami ma status "zamknięta", ale NIE musi
    /// mieć daty zamknięcia - datę wpisuje się przy zamykaniu ceną, a tu pozycja zeszła do zera
    /// przez sumę zamknięć częściowych. Wszystkie rozbicia czasowe brały `closed_at` przez
    /// `expect`, więc taka transakcja wywalała Dashboard i raporty tego konta.
    fn zamknieta_bez_daty_zamkniecia() -> Trade {
        Trade {
            status: TradeStatus::Closed,
            opened_at: Some(Utc::now() - Duration::days(3)),
            closed_at: None,
            net_pnl: Some(dec!(100)),
            gross_pnl: Some(dec!(100)),
            volume: Some(dec!(1)),
            partial_closes: vec![crate::domain::trade_partial_close::PartialClose {
                closed_volume: dec!(1),
                realized_pnl: dec!(100),
            }],
            ..base_trade("bez-daty")
        }
    }

    #[test]
    fn statystyki_nie_wywracaja_sie_na_pozycji_bez_daty_zamkniecia() {
        let trades = vec![zamknieta_bez_daty_zamkniecia()];
        let stats = compute_stats(&trades);
        assert_eq!(stats.closed_trades, 1);
    }

    #[test]
    fn rozbicia_czasowe_nie_wywracaja_sie_na_pozycji_bez_daty_zamkniecia() {
        let trades = vec![zamknieta_bez_daty_zamkniecia()];
        compute_monthly_breakdown(&trades);
        compute_calendar(&trades);
        compute_equity_curve(&trades);
        compute_day_of_week_breakdown(&trades);
        compute_pnl_distribution(&trades);
    }

    /// Samo "nie wywala się" nie wystarczy: taka pozycja MUSI być widoczna w rozbiciach.
    /// Ciche pominięcie byłoby gorsze od paniki - krzywa kapitału i kalendarz rozjechałyby się
    /// z saldem konta, a użytkownik nie dostałby żadnego sygnału, że czegoś brakuje.
    #[test]
    fn pozycja_bez_daty_zamkniecia_wchodzi_do_rozbic() {
        let trades = vec![zamknieta_bez_daty_zamkniecia()];

        let krzywa = compute_equity_curve(&trades);
        assert_eq!(krzywa.len(), 1, "pozycja wypadła z krzywej kapitału");
        assert_eq!(krzywa[0].cumulative_net_pnl, dec!(100));

        let kalendarz = compute_calendar(&trades);
        assert_eq!(kalendarz.len(), 1, "pozycja wypadła z kalendarza");
        assert_eq!(kalendarz[0].net_pnl, dec!(100));

        let miesiace = compute_monthly_breakdown(&trades);
        assert_eq!(miesiace.len(), 1, "pozycja wypadła z rozbicia miesięcznego");
        assert_eq!(miesiace[0].trade_count, 1);

        let dni = compute_day_of_week_breakdown(&trades);
        let suma: i64 = dni.iter().map(|d| d.trade_count).sum();
        assert_eq!(suma, 1, "pozycja wypadła z rozbicia po dniach tygodnia");
    }
}
