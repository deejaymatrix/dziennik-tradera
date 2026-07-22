-- Odwrócenie kierunku powiązania konto <-> szablon instrumentów.
--
-- Do tej pory link mieszkał na szablonie (`broker_instrument_templates.account_id`), co z
-- definicji dopuszczało najwyżej JEDNO konto na szablon. Wymaganie się zmieniło: wiele kont
-- (np. kilka rachunków u tego samego brokera) ma móc korzystać ze wspólnego zestawu
-- instrumentów i parametrów.
--
-- Link przenosi się więc na konto: `accounts.template_id`. Jedno konto nadal ma najwyżej jeden
-- szablon (bo to jedna kolumna), ale jeden szablon może obsługiwać dowolnie wiele kont.
--
-- Migracja jest nieniszcząca: kolumna dochodzi przez ALTER TABLE, dotychczasowe przypisania są
-- przepisywane 1:1, a `broker_instrument_templates.account_id` zostaje wyzerowana dopiero PO
-- przepisaniu, żeby nie było dwóch źródeł prawdy o tym samym.

ALTER TABLE accounts ADD COLUMN template_id TEXT REFERENCES broker_instrument_templates (id);

-- Przepisanie istniejących przypisań na konto. Bierzemy wyłącznie szablony aktywne - szablon
-- leżący w Koszu nie powinien wracać do konta tylnymi drzwiami.
UPDATE accounts
SET template_id = (
    SELECT t.id
    FROM broker_instrument_templates t
    WHERE t.account_id = accounts.id AND t.archived_at IS NULL
)
WHERE EXISTS (
    SELECT 1
    FROM broker_instrument_templates t
    WHERE t.account_id = accounts.id AND t.archived_at IS NULL
);

-- Indeks wymuszał "jedno konto = najwyżej jeden aktywny szablon" po stronie szablonu. Ta reguła
-- nadal obowiązuje, ale wynika teraz wprost z tego, że konto ma pojedynczą kolumnę template_id.
DROP INDEX IF EXISTS idx_broker_templates_account;

-- Stara kolumna przestaje cokolwiek znaczyć. Zostaje w tabeli (SQLite: nie przebudowujemy tabel,
-- do których prowadzą klucze obce), ale jest czyszczona, żeby nikt jej przypadkiem nie odczytał
-- jako aktualnego powiązania.
UPDATE broker_instrument_templates SET account_id = NULL;

-- Wyszukiwanie "jakie konta korzystają z tego szablonu" dzieje się przy każdym listowaniu.
CREATE INDEX IF NOT EXISTS idx_accounts_template ON accounts (template_id);
