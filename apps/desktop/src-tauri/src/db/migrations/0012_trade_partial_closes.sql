-- Częściowe zamykanie pozycji (sekcja 6.9). Specyfikacja wprost wymaga OSOBNEJ TABELI
-- RELACYJNEJ zamiast tablicy JSON w kolumnie transakcji - dzięki temu wpisy da się liczyć
-- i agregować SQL-em w raportach, bez parsowania JSON-a po stronie aplikacji.
--
-- Świadomie NIE używamy istniejącej `trade_executions` (z migracji 0001): tamta wymaga ceny
-- i rodzaju wykonania, a wpis częściowego zamknięcia wg specyfikacji niesie wyłącznie
-- zamknięty lot i kwotę zrealizowanego wyniku. Tamta tabela pozostaje nietknięta.
--
-- Kwoty i loty trzymamy jako TEKST, tak jak wszystkie inne wartości pieniężne w tej bazie -
-- backend czyta je do `rust_decimal`. REAL/FLOAT nigdy nie dotyka pieniędzy.
CREATE TABLE trade_partial_closes (
    id TEXT PRIMARY KEY,
    trade_id TEXT NOT NULL REFERENCES trades (id),
    -- Kolejność wpisów widoczna dla użytkownika; numeracja od 0 w obrębie jednej transakcji.
    position INTEGER NOT NULL,
    closed_volume TEXT NOT NULL,
    -- Może być ujemny: częściowe zamknięcie ze stratą to normalny przypadek.
    realized_pnl TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_trade_partial_closes_trade_id ON trade_partial_closes (trade_id);
