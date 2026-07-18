-- Schemat startowy Dziennika Tradera.
-- Kwoty finansowe: TEXT (dziesiętne, parsowane jako rust_decimal::Decimal) - nigdy REAL/FLOAT.
-- Daty/czas: TEXT w formacie ISO-8601 UTC.
-- Identyfikatory: TEXT (UUID v7).

CREATE TABLE app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    settings_version INTEGER NOT NULL,
    data TEXT NOT NULL, -- JSON
    updated_at TEXT NOT NULL
);

INSERT INTO app_settings (id, settings_version, data, updated_at)
VALUES (
    1,
    1,
    '{"theme":"dark","accent":"gold","density":"comfortable","dateFormat":"YYYY-MM-DD","numberFormat":"pl-PL","defaultCurrency":"USD","recentFilters":null,"backup":{"rotationCount":5,"customFolder":null},"updates":{"channel":"stable","autoCheck":true}}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    account_type TEXT,
    currency TEXT NOT NULL,
    initial_balance TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT
);

CREATE INDEX idx_accounts_archived_at ON accounts (archived_at);

CREATE TABLE cash_operations (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts (id),
    kind TEXT NOT NULL CHECK (kind IN ('deposit', 'withdrawal', 'adjustment')),
    amount TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_cash_operations_account_id ON cash_operations (account_id);

CREATE TABLE instruments (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    decimal_places INTEGER NOT NULL,
    tick_size TEXT NOT NULL,
    tick_value_per_lot TEXT NOT NULL,
    contract_size TEXT NOT NULL,
    pip_size TEXT NOT NULL,
    quote_currency TEXT NOT NULL,
    settlement_currency TEXT NOT NULL,
    min_lot TEXT NOT NULL,
    lot_step TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_instruments_symbol ON instruments (symbol);

CREATE TABLE strategies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    entry_rules TEXT,
    management_rules TEXT,
    exit_rules TEXT,
    tags TEXT, -- JSON array
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT
);

CREATE TABLE trades (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts (id),
    display_number INTEGER NOT NULL,
    instrument_id TEXT REFERENCES instruments (id),
    instrument_spec_snapshot TEXT, -- JSON, snapshot zrobiony w momencie zapisu
    strategy_id TEXT REFERENCES strategies (id),
    strategy_snapshot TEXT, -- JSON
    status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'closed', 'cancelled')),
    side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    opened_at TEXT,
    closed_at TEXT,
    interval TEXT,
    session TEXT,
    volume TEXT,
    entry_price TEXT,
    stop_loss TEXT,
    take_profit TEXT,
    exit_price TEXT,
    commission TEXT NOT NULL DEFAULT '0',
    swap TEXT NOT NULL DEFAULT '0',
    other_fees TEXT NOT NULL DEFAULT '0',
    gross_pnl TEXT,
    net_pnl TEXT,
    pnl_points TEXT,
    pnl_percent TEXT,
    pnl_r TEXT,
    risk_amount TEXT,
    risk_percent TEXT,
    plan_before TEXT,
    management_notes TEXT,
    post_trade_summary TEXT,
    conclusion TEXT,
    tags TEXT, -- JSON array
    plan_adherence_rating INTEGER,
    pnl_source TEXT NOT NULL DEFAULT 'auto' CHECK (pnl_source IN ('auto', 'manual_override')),
    pnl_override_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    UNIQUE (account_id, display_number)
);

CREATE INDEX idx_trades_account_id ON trades (account_id);
CREATE INDEX idx_trades_deleted_at ON trades (deleted_at);
CREATE INDEX idx_trades_status ON trades (status);

CREATE TABLE trade_executions (
    id TEXT PRIMARY KEY,
    trade_id TEXT NOT NULL REFERENCES trades (id),
    kind TEXT NOT NULL CHECK (kind IN ('entry', 'exit', 'scale_in', 'scale_out')),
    price TEXT NOT NULL,
    volume TEXT NOT NULL,
    executed_at TEXT NOT NULL,
    commission TEXT NOT NULL DEFAULT '0',
    swap TEXT NOT NULL DEFAULT '0',
    created_at TEXT NOT NULL
);

CREATE INDEX idx_trade_executions_trade_id ON trade_executions (trade_id);

CREATE TABLE daily_notes (
    id TEXT PRIMARY KEY,
    account_id TEXT REFERENCES accounts (id),
    note_date TEXT NOT NULL,
    plan TEXT,
    observations TEXT,
    execution_notes TEXT,
    conclusions TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_daily_notes_date ON daily_notes (note_date);

CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    trade_id TEXT REFERENCES trades (id),
    kind TEXT NOT NULL CHECK (kind IN ('screenshot', 'link')),
    file_path TEXT,
    url TEXT,
    sha256 TEXT,
    size_bytes INTEGER,
    tag TEXT CHECK (tag IN ('before', 'entry', 'management', 'exit', 'review')),
    created_at TEXT NOT NULL
);

CREATE INDEX idx_attachments_trade_id ON attachments (trade_id);

CREATE TABLE audit_log (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    detail TEXT -- JSON
);

CREATE INDEX idx_audit_log_entity ON audit_log (entity_type, entity_id);
