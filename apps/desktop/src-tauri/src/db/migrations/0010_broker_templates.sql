-- B1 (nowa specyfikacja "szablony brokerów"): każde konto handlowe ma dokładnie jeden aktywny
-- szablon instrumentów, a izolacja parametrów między brokerami/kontami jest wymuszona w bazie
-- (relacje + indeksy unikalne), nie tylko filtrowaniem w UI. Obecny katalog 350 instrumentów
-- staje się szablonem "QuoMarkets RAW" bez utraty parametrów, rewizji ani kolejności.
CREATE TABLE broker_instrument_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    broker_name TEXT NOT NULL,
    account_type TEXT,
    source TEXT NOT NULL CHECK (source IN ('broker_import', 'duplicated', 'user_created')),
    import_format_version INTEGER,
    -- Przypisane konto: unikalność wymuszona indeksem częściowym niżej (1 szablon = max 1 konto,
    -- 1 konto = max 1 aktywny szablon). NULL = szablon nieprzypisany (dozwolony stan).
    account_id TEXT REFERENCES accounts (id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT
);

-- Jedno konto nie może mieć dwóch aktywnych szablonów…
CREATE UNIQUE INDEX idx_broker_templates_account
    ON broker_instrument_templates (account_id)
    WHERE account_id IS NOT NULL AND archived_at IS NULL;
-- …a nazwa musi być unikalna wśród szablonów aktywnych (zarchiwizowane w Koszu nie blokują nazwy).
CREATE UNIQUE INDEX idx_broker_templates_name
    ON broker_instrument_templates (name)
    WHERE archived_at IS NULL;

-- Rozszerzenie tożsamości instrumentu W MIEJSCU (ALTER TABLE, nigdy DROP + odtworzenie -
-- trades/instrument_versions/instrument_preferences trzymają klucze obce do tej tabeli).
ALTER TABLE instruments ADD COLUMN template_id TEXT REFERENCES broker_instrument_templates (id);
-- Normalizacja symboli (sekcja 1.7 specyfikacji): oryginalny symbol brokera już istnieje jako
-- source_symbol; dochodzą symbol kanoniczny i wariant (STANDARD/MINI/...).
ALTER TABLE instruments ADD COLUMN canonical_symbol TEXT;
ALTER TABLE instruments ADD COLUMN variant TEXT NOT NULL DEFAULT 'STANDARD';
-- Pochodzenie: instrumenty z importu brokera są chronione (nie do pojedynczego usunięcia),
-- instrumenty użytkownika oznaczane "Dodany przez użytkownika".
ALTER TABLE instruments ADD COLUMN origin TEXT NOT NULL DEFAULT 'broker_import';

-- Szablon startowy: obecny katalog w całości. Stały UUID (jak builtin-interwały), konto =
-- najstarsze aktywne konto, jeżeli istnieje; kopie dla ewentualnych dodatkowych kont tworzy
-- warstwa aplikacyjna przy starcie (duplikacja instrumentów w czystym SQL byłaby nieczytelna).
INSERT INTO broker_instrument_templates
    (id, name, broker_name, account_type, source, import_format_version, account_id, created_at, updated_at, archived_at)
VALUES (
    '019f9d10-0001-7000-8000-000000000001',
    'QuoMarkets RAW',
    'QuoMarkets',
    'RAW',
    'broker_import',
    NULL,
    (SELECT id FROM accounts WHERE archived_at IS NULL ORDER BY created_at LIMIT 1),
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z',
    NULL
);

-- Wszystkie istniejące instrumenty (fabryczne i własne) trafiają do szablonu startowego.
-- Kanoniczny symbol/wariant wyprowadzone z konwencji obecnego katalogu ("X-MINI" = wariant MINI).
UPDATE instruments
SET template_id = '019f9d10-0001-7000-8000-000000000001',
    canonical_symbol = CASE
        WHEN display_symbol LIKE '%-MINI' THEN substr(display_symbol, 1, length(display_symbol) - 5)
        ELSE display_symbol
    END,
    variant = CASE WHEN display_symbol LIKE '%-MINI' THEN 'MINI' ELSE 'STANDARD' END,
    origin = CASE WHEN factory_index IS NOT NULL THEN 'broker_import' ELSE 'user_created' END;

-- Unikalność symboli przestaje być globalna, a staje się per szablon - dwa szablony różnych
-- brokerów mogą mieć własny XAUUSD z różnymi parametrami, które nigdy się nie mieszają.
DROP INDEX idx_instruments_display_symbol;
DROP INDEX idx_instruments_source_symbol;
CREATE UNIQUE INDEX idx_instruments_template_source
    ON instruments (template_id, source_symbol);
CREATE UNIQUE INDEX idx_instruments_template_display
    ON instruments (template_id, display_symbol);
CREATE INDEX idx_instruments_template_canonical
    ON instruments (template_id, canonical_symbol, variant);
