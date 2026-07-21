-- Faza 8 modyfikacji przed instalatorem: zakładka "Zasady handlu" - osobisty regulamin
-- użytkownika, niezależny od zasad konkretnej strategii. Startowe kategorie i pytania pochodzą
-- wprost ze specyfikacji (wygenerowane programowo skryptem generate_trading_rules_seed.js -
-- nigdy nie przepisywane ręcznie). Zgodnie ze specyfikacją NIE MA fabrycznych odpowiedzi -
-- pytania to edytowalne szablony (is_builtin=1), pola odpowiedzi startują puste (NULL).
CREATE TABLE trading_rule_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE trading_rules (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL REFERENCES trading_rule_categories (id),
    question TEXT NOT NULL,
    answer TEXT,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    -- Oryginalna treść pytania-szablonu - "Przywróć szablon" odtwarza z niej treść pytania
    -- (nigdy odpowiedzi); NULL dla pytań własnych użytkownika.
    template_question TEXT,
    hidden INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT
);

CREATE INDEX idx_trading_rules_category ON trading_rules (category_id, sort_order);

INSERT INTO trading_rule_categories (id, name, is_builtin, sort_order, created_at, updated_at) VALUES
    ('019f8c10-0001-7000-8000-000000000001', 'Podstawy', 1, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
INSERT INTO trading_rules (id, category_id, question, answer, is_builtin, template_question, hidden, sort_order, created_at, updated_at, archived_at) VALUES
    ('019f8c10-0002-7000-8000-000100000001', '019f8c10-0001-7000-8000-000000000001', 'W jakich godzinach handluję?', NULL, 1, 'W jakich godzinach handluję?', 0, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000100000002', '019f8c10-0001-7000-8000-000000000001', 'Które sesje giełdowe są dla mnie najważniejsze?', NULL, 1, 'Które sesje giełdowe są dla mnie najważniejsze?', 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000100000003', '019f8c10-0001-7000-8000-000000000001', 'Czy handluję krótko-, średnio- czy długoterminowo?', NULL, 1, 'Czy handluję krótko-, średnio- czy długoterminowo?', 0, 2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000100000004', '019f8c10-0001-7000-8000-000000000001', 'Czy istnieją godziny, w których nie handluję?', NULL, 1, 'Czy istnieją godziny, w których nie handluję?', 0, 3, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000100000005', '019f8c10-0001-7000-8000-000000000001', 'Jak zaczynam swój dzień handlowy?', NULL, 1, 'Jak zaczynam swój dzień handlowy?', 0, 4, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000100000006', '019f8c10-0001-7000-8000-000000000001', 'Jaki mam cel dzienny, tygodniowy i miesięczny?', NULL, 1, 'Jaki mam cel dzienny, tygodniowy i miesięczny?', 0, 5, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000100000007', '019f8c10-0001-7000-8000-000000000001', 'Jakie wydarzenia lub publikacje mogą wpłynąć na mój handel?', NULL, 1, 'Jakie wydarzenia lub publikacje mogą wpłynąć na mój handel?', 0, 6, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000100000008', '019f8c10-0001-7000-8000-000000000001', 'Jakie warunki psychiczne i fizyczne muszę spełnić przed rozpoczęciem handlu?', NULL, 1, 'Jakie warunki psychiczne i fizyczne muszę spełnić przed rozpoczęciem handlu?', 0, 7, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL);

INSERT INTO trading_rule_categories (id, name, is_builtin, sort_order, created_at, updated_at) VALUES
    ('019f8c10-0001-7000-8000-000000000002', 'Kapitał, wpłaty i wypłaty', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
INSERT INTO trading_rules (id, category_id, question, answer, is_builtin, template_question, hidden, sort_order, created_at, updated_at, archived_at) VALUES
    ('019f8c10-0002-7000-8000-000200000001', '019f8c10-0001-7000-8000-000000000002', 'Ile pieniędzy przeznaczam na handel?', NULL, 1, 'Ile pieniędzy przeznaczam na handel?', 0, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000200000002', '019f8c10-0001-7000-8000-000000000002', 'Jak często wypłacam zyski?', NULL, 1, 'Jak często wypłacam zyski?', 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000200000003', '019f8c10-0001-7000-8000-000000000002', 'Co robię z wypłaconym zyskiem?', NULL, 1, 'Co robię z wypłaconym zyskiem?', 0, 2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000200000004', '019f8c10-0001-7000-8000-000000000002', 'Jak oddzielam kapitał handlowy od pieniędzy przeznaczonych na życie?', NULL, 1, 'Jak oddzielam kapitał handlowy od pieniędzy przeznaczonych na życie?', 0, 3, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL);

INSERT INTO trading_rule_categories (id, name, is_builtin, sort_order, created_at, updated_at) VALUES
    ('019f8c10-0001-7000-8000-000000000003', 'Ryzyko', 1, 2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
INSERT INTO trading_rules (id, category_id, question, answer, is_builtin, template_question, hidden, sort_order, created_at, updated_at, archived_at) VALUES
    ('019f8c10-0002-7000-8000-000300000001', '019f8c10-0001-7000-8000-000000000003', 'Jak ustalam wielkość pozycji?', NULL, 1, 'Jak ustalam wielkość pozycji?', 0, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000300000002', '019f8c10-0001-7000-8000-000000000003', 'Jaka jest maksymalna strata dzienna, tygodniowa i miesięczna?', NULL, 1, 'Jaka jest maksymalna strata dzienna, tygodniowa i miesięczna?', 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000300000003', '019f8c10-0001-7000-8000-000000000003', 'Jak chronię się przed overtradingiem?', NULL, 1, 'Jak chronię się przed overtradingiem?', 0, 2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000300000004', '019f8c10-0001-7000-8000-000000000003', 'Jaki jest mój plan ryzyka?', NULL, 1, 'Jaki jest mój plan ryzyka?', 0, 3, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000300000005', '019f8c10-0001-7000-8000-000000000003', 'Na jakiej podstawie wyznaczam SL?', NULL, 1, 'Na jakiej podstawie wyznaczam SL?', 0, 4, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000300000006', '019f8c10-0001-7000-8000-000000000003', 'Ile transakcji mogę mieć otwartych jednocześnie?', NULL, 1, 'Ile transakcji mogę mieć otwartych jednocześnie?', 0, 5, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL);

INSERT INTO trading_rule_categories (id, name, is_builtin, sort_order, created_at, updated_at) VALUES
    ('019f8c10-0001-7000-8000-000000000004', 'Wejście w transakcję', 1, 3, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
INSERT INTO trading_rules (id, category_id, question, answer, is_builtin, template_question, hidden, sort_order, created_at, updated_at, archived_at) VALUES
    ('019f8c10-0002-7000-8000-000400000001', '019f8c10-0001-7000-8000-000000000004', 'Czy przed wejściem sprawdzam checklistę wybranej strategii?', NULL, 1, 'Czy przed wejściem sprawdzam checklistę wybranej strategii?', 0, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000400000002', '019f8c10-0001-7000-8000-000000000004', 'Jakie metody analizy są dla mnie ważne?', NULL, 1, 'Jakie metody analizy są dla mnie ważne?', 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000400000003', '019f8c10-0001-7000-8000-000000000004', 'Czy wymagane potwierdzenia są spełnione?', NULL, 1, 'Czy wymagane potwierdzenia są spełnione?', 0, 2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000400000004', '019f8c10-0001-7000-8000-000000000004', 'Czy otwieram tylko jedną zaplanowaną transakcję naraz?', NULL, 1, 'Czy otwieram tylko jedną zaplanowaną transakcję naraz?', 0, 3, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000400000005', '019f8c10-0001-7000-8000-000000000004', 'Gdzie planuję SL i TP przed wejściem?', NULL, 1, 'Gdzie planuję SL i TP przed wejściem?', 0, 4, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL);

INSERT INTO trading_rule_categories (id, name, is_builtin, sort_order, created_at, updated_at) VALUES
    ('019f8c10-0001-7000-8000-000000000005', 'Zarządzanie pozycją', 1, 4, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
INSERT INTO trading_rules (id, category_id, question, answer, is_builtin, template_question, hidden, sort_order, created_at, updated_at, archived_at) VALUES
    ('019f8c10-0002-7000-8000-000500000001', '019f8c10-0001-7000-8000-000000000005', 'Kiedy przesuwam SL na BE?', NULL, 1, 'Kiedy przesuwam SL na BE?', 0, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000500000002', '019f8c10-0001-7000-8000-000000000005', 'Kiedy realizuję częściowe zyski?', NULL, 1, 'Kiedy realizuję częściowe zyski?', 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000500000003', '019f8c10-0001-7000-8000-000000000005', 'Co robię z pozostałą częścią pozycji?', NULL, 1, 'Co robię z pozostałą częścią pozycji?', 0, 2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000500000004', '019f8c10-0001-7000-8000-000000000005', 'Kiedy przesuwam SL na zysk?', NULL, 1, 'Kiedy przesuwam SL na zysk?', 0, 3, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000500000005', '019f8c10-0001-7000-8000-000000000005', 'Czy dopuszczam re-entry i na jakich warunkach?', NULL, 1, 'Czy dopuszczam re-entry i na jakich warunkach?', 0, 4, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000500000006', '019f8c10-0001-7000-8000-000000000005', 'Czy dopuszczam hedging i na jakich warunkach?', NULL, 1, 'Czy dopuszczam hedging i na jakich warunkach?', 0, 5, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000500000007', '019f8c10-0001-7000-8000-000000000005', 'W jakiej sytuacji zamykam transakcję przed TP?', NULL, 1, 'W jakiej sytuacji zamykam transakcję przed TP?', 0, 6, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000500000008', '019f8c10-0001-7000-8000-000000000005', 'Jak długo utrzymuję otwartą pozycję?', NULL, 1, 'Jak długo utrzymuję otwartą pozycję?', 0, 7, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000500000009', '019f8c10-0001-7000-8000-000000000005', 'Jak zarządzam transakcją stratną?', NULL, 1, 'Jak zarządzam transakcją stratną?', 0, 8, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000500000010', '019f8c10-0001-7000-8000-000000000005', 'Kiedy przerywam handel albo ograniczam kolejne wejścia?', NULL, 1, 'Kiedy przerywam handel albo ograniczam kolejne wejścia?', 0, 9, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL);

INSERT INTO trading_rule_categories (id, name, is_builtin, sort_order, created_at, updated_at) VALUES
    ('019f8c10-0001-7000-8000-000000000006', 'Po transakcji', 1, 5, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
INSERT INTO trading_rules (id, category_id, question, answer, is_builtin, template_question, hidden, sort_order, created_at, updated_at, archived_at) VALUES
    ('019f8c10-0002-7000-8000-000600000001', '019f8c10-0001-7000-8000-000000000006', 'Czy transakcja była zgodna ze strategią?', NULL, 1, 'Czy transakcja była zgodna ze strategią?', 0, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000600000002', '019f8c10-0001-7000-8000-000000000006', 'Dlaczego transakcja zakończyła się TP, SL, BE albo ręcznym zamknięciem?', NULL, 1, 'Dlaczego transakcja zakończyła się TP, SL, BE albo ręcznym zamknięciem?', 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000600000003', '019f8c10-0001-7000-8000-000000000006', 'Czy nie przeciążyłem się handlem?', NULL, 1, 'Czy nie przeciążyłem się handlem?', 0, 2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000600000004', '019f8c10-0001-7000-8000-000000000006', 'Czy byłem niecierpliwy, impulsywny albo chciwy?', NULL, 1, 'Czy byłem niecierpliwy, impulsywny albo chciwy?', 0, 3, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000600000005', '019f8c10-0001-7000-8000-000000000006', 'Czy udokumentowałem transakcję?', NULL, 1, 'Czy udokumentowałem transakcję?', 0, 4, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000600000006', '019f8c10-0001-7000-8000-000000000006', 'Czy dodałem wykres lub screenshot?', NULL, 1, 'Czy dodałem wykres lub screenshot?', 0, 5, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL),
    ('019f8c10-0002-7000-8000-000600000007', '019f8c10-0001-7000-8000-000000000006', 'Czy przeanalizowałem transakcję i zapisałem wnioski?', NULL, 1, 'Czy przeanalizowałem transakcję i zapisałem wnioski?', 0, 6, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL);

