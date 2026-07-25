-- Zapisane analizy Asystenta AI (Blok F, Etap 3). Każda analiza jest niezmienna po zapisie -
-- nie edytujemy jej, tylko oznaczamy jako nieaktualną, gdy zmienią się dane źródłowe (kolumna
-- `zrodlo_updated_at` vs bieżące `trades.updated_at`). Nowa analiza tej samej transakcji to
-- osobny wiersz, więc historia analiz zostaje (wymóg specyfikacji: "historia wykonanych analiz").
--
-- Deterministyczne KPI (P&L, R, ryzyko, prowizja) NIGDY nie pochodzą stąd - liczy je silnik Rust
-- z `trades`. Tu leży wyłącznie INTERPRETACJA modelu (fakty/obserwacje/rekomendacje) plus metadane
-- pozwalające ocenić, na czym i czym analiza była zrobiona.
CREATE TABLE trade_ai_analyses (
    id TEXT PRIMARY KEY,
    trade_id TEXT NOT NULL REFERENCES trades (id),
    -- Rodzaj analizy. Na razie zawsze 'transakcja' (analiza pojedynczej transakcji); pole istnieje
    -- od początku, żeby kolejne rodzaje (dzień/miesiąc/strategia...) z Etapu 5+ nie wymagały
    -- migracji zmieniającej schemat.
    typ_analizy TEXT NOT NULL,
    utworzono_o TEXT NOT NULL,
    -- Na czym i czym: która wersja modelu i która wersja szablonu polecenia wyprodukowały wynik.
    -- Pozwala odróżnić analizy zrobione różnymi modelami/promptami przy późniejszym audycie.
    wersja_modelu TEXT NOT NULL,
    wersja_szablonu TEXT NOT NULL,
    -- Ustrukturyzowany wynik (JSON: fakty/obserwacje/rekomendacje) - autorytatywna forma.
    wynik_json TEXT NOT NULL,
    -- Ludzko-czytelna forma tekstowa tego samego wyniku (do pokazania i do kopii/eksportu).
    wynik_tekstowy TEXT NOT NULL,
    -- `trades.updated_at` z momentu analizy. Gdy bieżące `updated_at` transakcji jest inne,
    -- analiza jest NIEAKTUALNA (dane transakcji zmieniły się po jej wykonaniu) - liczone w locie
    -- przy odczycie, nie zapisywane, żeby nie trzeba było aktualizować wierszy analiz.
    zrodlo_updated_at TEXT NOT NULL,
    -- Stan wykonania: 'ok' (udana), 'blad' (model zawiódł), 'anulowana' (użytkownik przerwał).
    -- 'nieaktualna' NIE jest tu przechowywana - wynika z porównania `zrodlo_updated_at` wyżej.
    status TEXT NOT NULL
);

CREATE INDEX idx_trade_ai_analyses_trade_id ON trade_ai_analyses (trade_id);
