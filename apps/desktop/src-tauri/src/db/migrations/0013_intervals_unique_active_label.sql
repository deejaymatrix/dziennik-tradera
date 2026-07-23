-- Unikalność nazwy interwału ma dotyczyć wyłącznie interwałów AKTYWNYCH (sekcja 7).
--
-- Dotychczasowy indeks obejmował wszystkie wiersze, także te w koszu. Skutek był odwrotny do
-- zamierzonego: interwał przeniesiony do kosza dalej blokował swoją nazwę, więc użytkownik nie
-- mógł utworzyć nowego "M15", dopóki stary "M15" leżał w koszu. Kosz ma zwalniać nazwę, a nie
-- trzymać ją w zakładnikach.
--
-- Konflikt przeniósł się tym samym tam, gdzie jego miejsce - do PRZYWRACANIA: jeżeli w czasie,
-- gdy interwał leżał w koszu, powstał nowy o tej samej nazwie, przywrócenie musi zostać
-- odrzucone czytelnym komunikatem, a użytkownik dostaje wybór (inna nazwa albo rezygnacja).
-- Obsługuje to `SqliteIntervalRepository::restore`.
--
-- DROP INDEX nie rusza danych - usuwa wyłącznie indeks.
DROP INDEX IF EXISTS idx_intervals_label;

CREATE UNIQUE INDEX idx_intervals_active_label
    ON intervals (label)
    WHERE archived_at IS NULL;
