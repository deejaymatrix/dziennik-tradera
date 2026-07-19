-- Faza 2 modyfikacji przed instalatorem: emocje w 3 momentach transakcji (przed/w trakcie/po).
-- Same dane emocjonalne per transakcja to JSON na wierszu `trades` (ten sam wzorzec co istniejące
-- migawki instrumentu/strategii) - trzy niezależne momenty, każdy z wielokrotnym wyborem stanu,
-- natężeniem 1-5, notatką i jawną flagą "nie uzupełniono". Lista dostępnych stanów jest osobną,
-- zarządzaną tabelą (wbudowane stany nie do przemianowania/usunięcia, można je tylko ukryć;
-- własne stany użytkownika można usunąć w całości).
CREATE TABLE emotional_states (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_emotional_states_name ON emotional_states(name);

ALTER TABLE trades ADD COLUMN emotions_json TEXT;

INSERT INTO emotional_states (id, name, is_builtin, hidden, sort_order, created_at) VALUES
    ('019f7af4-853a-7f74-8166-91e91d9cf797', 'Spokój', 1, 0, 0, '2026-01-01T00:00:00Z'),
    ('019f7af4-853b-7cc8-8535-1dc6768b4376', 'Pewność siebie', 1, 0, 1, '2026-01-01T00:00:00Z'),
    ('019f7af4-853b-7309-92a0-5bb828dd5568', 'Ekscytacja', 1, 0, 2, '2026-01-01T00:00:00Z'),
    ('019f7af4-853b-7032-86e5-359a7831952a', 'Niecierpliwość', 1, 0, 3, '2026-01-01T00:00:00Z'),
    ('019f7af4-853b-7a29-8cf8-ceab8084864b', 'Chciwość', 1, 0, 4, '2026-01-01T00:00:00Z'),
    ('019f7af4-853b-76dd-aadc-5ca0fef55e6f', 'Strach', 1, 0, 5, '2026-01-01T00:00:00Z'),
    ('019f7af4-853b-7da6-9b2a-aad7161a3ad5', 'Zwątpienie', 1, 0, 6, '2026-01-01T00:00:00Z'),
    ('019f7af4-853b-7f2c-af23-fbd3acf0da51', 'FOMO (strach przed przegapieniem)', 1, 0, 7, '2026-01-01T00:00:00Z'),
    ('019f7af4-853b-7ef0-b300-40d1c4f7f33a', 'Frustracja', 1, 0, 8, '2026-01-01T00:00:00Z'),
    ('019f7af4-853b-798d-b0c2-a2d128e19411', 'Zadowolenie', 1, 0, 9, '2026-01-01T00:00:00Z'),
    ('019f7af4-853c-71d0-8f85-d8f4ac40b1c8', 'Znudzenie', 1, 0, 10, '2026-01-01T00:00:00Z'),
    ('019f7af4-853c-7ec5-81f4-30bb5ffa59e7', 'Niepokój', 1, 0, 11, '2026-01-01T00:00:00Z');
