# Audyt kodu — A5

Data: 2026-07-23. Zakres: **206 plików źródłowych** (80 Rust, 126 TypeScript/TSX),
łącznie ok. 40 000 linii, plus 68 arkuszy CSS i 13 migracji SQL.

Audyt prowadzony **26 klasami defektów**: każda klasa sprawdzana przez **całe** drzewo, a nie
plik po pliku w kolejności alfabetycznej. Powód jest praktyczny — czytanie 40 000 linii
po kolei znajduje to, co rzuca się w oczy w pojedynczym pliku, a przegapia dokładnie te
błędy, które mają znaczenie: powtórzony ten sam wzorzec w piętnastu miejscach i jedno
miejsce, w którym go złamano. Lista sprawdzonych plików jest na końcu.

---

## Znalezione błędy

### 1. Panika w statystykach na pozycji domkniętej częściowymi zamknięciami — NAPRAWIONE

`domain/trade_stats.rs`

Sześć miejsc brało datę zamknięcia przez `.expect("realized_trades gwarantuje closed_at")`.
Ta gwarancja nie istniała: `realized_trades` filtruje po `deleted_at`, `status` i `net_pnl`,
ale **nie po `closed_at`**. Pozycja domknięta w całości częściowymi zamknięciami dostaje
status „zamknięta" bez daty zamknięcia — datę wpisuje się przy zamykaniu ceną, a tu pozycja
zeszła do zera przez sumę zamknięć.

Skutek: jedna taka transakcja wywalała Dashboard i **wszystkie** raporty tego konta.

Ta sama sytuacja została wcześniej naprawiona w `domain/balance.rs`, ale poprawka nie
została przeniesiona tutaj. Teraz obie ścieżki korzystają z tej samej reguły
(`closed_at` albo `updated_at`), co jest istotne samo w sobie: gdyby raport i saldo
używały różnych znaczników, ta sama pozycja trafiłaby do różnych okresów.

### 2. Ciche pomijanie tej samej pozycji w krzywej kapitału i kalendarzu — NAPRAWIONE

`domain/trade_stats.rs`, `compute_equity_curve` i `compute_calendar`

Te dwie funkcje nie panikowały — po prostu **pomijały** transakcję bez daty zamknięcia
(`t.closed_at?` oraz `let Some(...) else { continue }`). To gorszy wariant tego samego
błędu: krzywa kapitału i kalendarz rozjeżdżały się z saldem konta, a użytkownik nie
dostawał żadnego sygnału, że czegoś brakuje.

### 3. Pieniądze liczone binarnym `float` na froncie — NAPRAWIONE (4 miejsca)

Kwoty przychodzą z Rusta jako **napisy** właśnie po to, żeby nie przechodziły przez
zmiennoprzecinkowy typ. Cztery miejsca to obchodziły, sumując przez `Number(...)`:

| Plik                                   | Co liczyło                                                        |
| -------------------------------------- | ----------------------------------------------------------------- |
| `pages/CumulativeLineChart.tsx`        | suma narastająca całego wykresu (przy okazji koszt kwadratowy)    |
| `pages/MonthCalendarTable.tsx`         | suma narastająca kolejnych dni miesiąca                           |
| `pages/ReportAccountComparisonTab.tsx` | **wiersz podsumowania** — suma wyników i prowizji wszystkich kont |
| `pages/ReportYearlyTab.tsx`            | suma dwunastu miesięcy przed policzeniem średniej                 |

Wszystkie przeniesione na `sumDecimalStrings` (BigInt, dokładne). W raporcie rocznym
dzielenie przez 12 zostaje na liczbie — średnia jest z natury przybliżona — ale sama
suma jest już dokładna.

### 4. Swap w konwencji odwrotnej niż platformy handlowe — UDOKUMENTOWANE (A4)

Opisane w commicie audytu A4. Matematyka **nie** została zmieniona (odwrócenie znaku
przeliczyłoby po cichu każdą zapisaną transakcję ze swapem); pole dostało podpowiedź
mówiącą wprost, w którą stronę wpisywać.

### 5. Martwy kod, który okazał się brakującym podpięciem — NAPRAWIONE

`app/reportFilterMemory.ts`, `pages/settings/PreferenceSections.tsx`

`clearRememberedFilters()` była zdefiniowana i nigdy nie wywoływana. Jej własny komentarz
mówił, do czego służy: „używane po wyłączeniu ustawienia, żeby następne włączenie nie
przywróciło filtrów sprzed miesięcy". Dokładnie to się działo — wyłączenie przełącznika
„Zapamiętuj filtry osobno dla każdego raportu" zostawiało wpisy w `localStorage`, więc
ponowne włączenie przywracało zakres, którego użytkownik dawno nie pamiętał.

To najciekawszy typ znaleziska w całym audycie: martwy kod nie był tu śmieciem do
usunięcia, tylko sygnałem, że czegoś brakuje. Funkcja została podpięta do przełącznika.

### 6. Licznik bez sprzątania po odmontowaniu — NAPRAWIONE

`pages/TradeFormModal.tsx`

Licznik zdejmujący blokadę zapisu (`window.setTimeout(..., 500)`) był uruchamiany bez
zapamiętania uchwytu, więc dożywał swoich 500 ms po zamknięciu formularza. Skutki były
niegroźne, ale to jedyny licznik w aplikacji bez sprzątania — pozostałe cztery (debounce
podglądu, autozapis szkicu) czyszczą się poprawnie. Teraz uchwyt jest trzymany w ref
i czyszczony przy odmontowaniu.

---

## Klasy sprawdzone bez zastrzeżeń

| Klasa                                            | Wynik                                                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `panic!`, `todo!`, `unimplemented!` poza testami | brak                                                                                                        |
| `.unwrap()`/`.expect()` w kodzie produkcyjnym    | 20 miejsc, wszystkie z realną gwarancją (poza znalezionymi wyżej)                                           |
| `Mutex::lock()` bez odzysku z zatrucia           | wszystkie trafienia w modułach testowych; produkcja czysta                                                  |
| Sklejanie SQL ze zmiennych                       | brak — wyłącznie stałe kolumn, wartości przez `?N`                                                          |
| Rzutowania `as` mogące uciąć wartość             | 37, wszystkie na wielkościach ograniczonych z definicji (miesiąc 1–12, dzień tygodnia 0–6, kubełek 0–5)     |
| `DROP TABLE` w migracjach                        | brak — jedyne trafienie to komentarz wyjaśniający, dlaczego się go nie używa                                |
| Migracje zarejestrowane w kodzie                 | 13 plików, 13 wpisów — zgodne                                                                               |
| `any` w TypeScript                               | brak                                                                                                        |
| Asercje `!` (non-null)                           | brak                                                                                                        |
| Puste `catch {}` połykające błędy                | brak                                                                                                        |
| `dangerouslySetInnerHTML`                        | brak                                                                                                        |
| `target="_blank"` bez `rel="noopener"`           | brak                                                                                                        |
| `TODO`/`FIXME`/`HACK`                            | brak                                                                                                        |
| Klucze listy po indeksie                         | 3 miejsca, wszystkie na listach w pełni kontrolowanych albo tylko do odczytu — bezpieczne                   |
| Obietnice bez obsługi błędu                      | brak                                                                                                        |
| Liczniki (`setTimeout`/`setInterval`)            | 6 miejsc; 5 sprząta poprawnie, 1 poprawiony (patrz wyżej)                                                   |
| Listenery bez `removeEventListener`              | 4 rejestracje: 2 z cleanupem, 2 globalne na czas życia aplikacji (poprawnie)                                |
| Uprawnienia Tauri                                | 6 pozwoleń, każde realnie używane — `dialog`, `updater`, `process:restart`, `shell:open`                    |
| Dane prywatne w logach                           | brak — logi nie zawierają nazw, kwot ani identyfikatorów                                                    |
| Hardkodowane ścieżki                             | brak                                                                                                        |
| Mocki produkcyjne                                | brak                                                                                                        |
| Transakcyjność SQLite                            | 29 transakcji; repozytoria bez nich wykonują pojedyncze instrukcje (SQLite obejmuje je niejawną transakcją) |
| Martwe eksporty                                  | 12, z czego 11 to typy opisujące kształt API; jedyny martwy kod wykonywalny opisany wyżej                   |
| Wielokrotne źródła prawdy                        | `ThemeProvider` jest cienką nakładką nad preferencjami, nie drugim źródłem                                  |
| Kontrast tokenów WCAG AA                         | osobno w A1 — 5 naruszeń naprawionych                                                                       |

---

## Lista sprawdzonych plików

### Rust — `apps/desktop/src-tauri/src/` (80)

`application/accounts.rs`, `application/attachments.rs`, `application/backup.rs`,
`application/broker_templates.rs`, `application/emotional_states.rs`, `application/export.rs`,
`application/instrument_import.rs`, `application/instruments.rs`, `application/intervals.rs`,
`application/mod.rs`, `application/preferences.rs`, `application/reports.rs`,
`application/strategies.rs`, `application/trades.rs`, `application/trading_rules.rs`,
`application/trash.rs`, `audyt.rs`, `commands/accounts.rs`, `commands/attachments.rs`,
`commands/backup.rs`, `commands/broker_templates.rs`, `commands/cash_operations.rs`,
`commands/emotional_states.rs`, `commands/export.rs`, `commands/instrument_import.rs`,
`commands/instruments.rs`, `commands/intervals.rs`, `commands/mod.rs`,
`commands/preferences.rs`, `commands/reports.rs`, `commands/strategies.rs`,
`commands/trades.rs`, `commands/trading_rules.rs`, `commands/trash.rs`, `db/connection.rs`,
`db/migrations.rs`, `db/mod.rs`, `diagnostics.rs`, `domain/account.rs`, `domain/attachment.rs`,
`domain/balance.rs`, `domain/broker_template.rs`, `domain/cash_operation.rs`,
`domain/emotional_state.rs`, `domain/export_filter.rs`, `domain/instrument.rs`,
`domain/interval.rs`, `domain/mod.rs`, `domain/preferences.rs`, `domain/strategy.rs`,
`domain/trade.rs`, `domain/trade_audit.rs`, `domain/trade_calculations.rs`,
`domain/trade_partial_close.rs`, `domain/trade_stats.rs`, `domain/trading_rules.rs`,
`domain/trash.rs`, `error.rs`, `infrastructure/backup_archive.rs`,
`infrastructure/instrument_csv.rs`, `infrastructure/mod.rs`, `infrastructure/pdf_report.rs`,
`infrastructure/sqlite_account_repository.rs`, `infrastructure/sqlite_attachment_repository.rs`,
`infrastructure/sqlite_broker_template_repository.rs`,
`infrastructure/sqlite_cash_operation_repository.rs`,
`infrastructure/sqlite_emotional_state_repository.rs`,
`infrastructure/sqlite_instrument_repository.rs`, `infrastructure/sqlite_interval_repository.rs`,
`infrastructure/sqlite_preferences_repository.rs`, `infrastructure/sqlite_strategy_repository.rs`,
`infrastructure/sqlite_trade_repository.rs`, `infrastructure/sqlite_trading_rules_repository.rs`,
`lib.rs`, `logging.rs`, `main.rs`, `state.rs` — oraz pozostałe moduły `mod.rs` w drzewie.

### Migracje SQL — `apps/desktop/src-tauri/src/db/migrations/` (13)

`0001_init`, `0002_seed_instruments`, `0003_instrument_catalog`, `0004_automatic_trade_status`,
`0005_trade_emotions`, `0006_strategy_rules`, `0007_intervals`, `0008_attachments`,
`0009_trading_rules`, `0010_broker_templates`, `0011_account_template_link`,
`0012_trade_partial_closes`, `0013_intervals_unique_active_label`.

### Frontend — `apps/desktop/src/` (126)

**`app/`** — `PreferencesProvider.tsx`, `ErrorBoundary.tsx`, `decimal.ts`, `exportTrades.ts`,
`invokeCommand.ts`, `quietHours.ts`, `reportFilterMemory.ts`, `reportFormat.ts`,
`tablistKeys.ts`, `tradeForm.ts`, `useReportFilter.ts`, `types/*.ts` (account, attachment,
broker_template, cash_operation, emotional_state, instrument, interval, preferences, report,
strategy, trade, trading_rules, trash).

**`shell/`** — `AppShell.tsx`, `CommandPalette.tsx`, `Header.tsx`, `Sidebar.tsx`, `nav.ts`.

**`pages/`** — `AccountDetailsModal`, `AccountFormModal`, `AccountsPage`, `BreakdownTable`,
`CalendarPage`, `ChartCard`, `CumulativeLineChart`, `DashboardPage`, `DataPage`,
`EmotionalStatesSection`, `EmotionsEditor`, `EquityCurveChart`, `GroupBarChart`,
`ImportBrokerModal`, `InstrumentsPage`, `IntervalsSection`, `InterwalyPage`,
`KalkulatorPozycjiPage`, `KoszPage`, `MonthCalendarTable`, `NotFoundPage`,
`PartialClosesEditor`, `PlaceholderPage`, `ReportAccountComparisonTab`, `ReportFilterBar`,
`ReportMonthlyTab`, `ReportStrategyTab`, `ReportSymbolTab`, `ReportYearlyTab`, `ReportsPage`,
`RuleListEditor`, `SessionField`, `SettingsPage`, `SimplePieChart`, `StanEmocjonalnyPage`,
`StatCard`, `StrategiesPage`, `StrategyChecklistEditor`, `SzablonyInstrumentowPage`,
`TopTradesTable`, `TradeAttachments`, `TradeAuditLog`, `TradeBalanceCard`, `TradeFormModal`,
`TradeInspector`, `TradePreviewCard`, `TransactionsPage`, `ZasadyHandluPage`, `chartAxis.ts`,
`chartTheme.ts`, `settings/*`.

**`ui/components/`** — `Badge`, `Button`, `Checkbox`, `ConfirmDialog`, `DateTimeField`,
`EmptyState`, `ErrorState`, `FormPanel`, `IconButton`, `Modal`, `SectionCard`, `Select`,
`Skeleton`, `Table`, `Tabs`, `TextField`, `Textarea`, `Toast`, `Tooltip` i pozostałe.

**`design/`** — `tokens.css`, `global.css`.
