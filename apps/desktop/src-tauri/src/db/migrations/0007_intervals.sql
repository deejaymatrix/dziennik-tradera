-- Faza 4 modyfikacji przed instalatorem: zarządzana lista interwałów zamiast wolnego pola
-- tekstowego. Ten sam wzorzec co `emotional_states` (wbudowane wpisy nie do przemianowania/
-- usunięcia, tylko ukrycia), rozszerzony o niezależną flagę `archived_at` - w przyszłym
-- uniwersalnym Koszu (Faza 5) własne interwały użytkownika trafią tam przez archiwizację,
-- podczas gdy `hidden` zostaje szybkim przełącznikiem widoczności dostępnym też dla wbudowanych.
CREATE TABLE intervals (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT
);

CREATE UNIQUE INDEX idx_intervals_label ON intervals(label);

-- Kolumna `interval` na `trades` (istniejąca od 0001_init) zostaje - to teraz zamrożona migawka
-- etykiety z momentu zapisu (tak jak `instrument_spec_snapshot`/`strategy_snapshot`), budowana
-- przez warstwę aplikacyjną na podstawie poniższego odniesienia.
ALTER TABLE trades ADD COLUMN interval_id TEXT;

INSERT INTO intervals (id, label, is_builtin, hidden, sort_order, created_at, updated_at, archived_at) VALUES
    ('019f7b10-0001-7000-8000-000000000001', 'M1', 1, 0, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f7b10-0001-7000-8000-000000000002', 'M5', 1, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f7b10-0001-7000-8000-000000000003', 'M15', 1, 0, 2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f7b10-0001-7000-8000-000000000004', 'M30', 1, 0, 3, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f7b10-0001-7000-8000-000000000005', 'H1', 1, 0, 4, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f7b10-0001-7000-8000-000000000006', 'H4', 1, 0, 5, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL);
