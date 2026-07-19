-- Faza 2 modyfikacji przed instalatorem: status transakcji nie jest już polem wybieranym przez
-- użytkownika - wynika wyłącznie z obecności danych (sekcja "Automatyczny status transakcji").
-- Aplikacja zawsze przelicza status na nowo przy każdym odczycie i zapisie
-- (patrz domain::trade::compute_status), więc ta migracja nie jest ściśle wymagana do
-- poprawności - ale zgodnie z wymaganiem "nie przechowuj dwóch sprzecznych źródeł prawdy"
-- porządkuje też samą wartość zapisaną w kolumnie `status` dla ewentualnych historycznych
-- wierszy (w tym starego stanu "cancelled", którego nowy model automatyczny już nie zna).
-- Nie usuwa ani nie zmienia żadnych innych danych transakcji.
UPDATE trades
SET status = CASE
    WHEN instrument_id IS NOT NULL
         AND entry_price IS NOT NULL
         AND volume IS NOT NULL
         AND opened_at IS NOT NULL
         AND exit_price IS NOT NULL
         AND closed_at IS NOT NULL
    THEN 'closed'
    WHEN instrument_id IS NOT NULL
         AND entry_price IS NOT NULL
         AND volume IS NOT NULL
         AND opened_at IS NOT NULL
    THEN 'open'
    ELSE 'draft'
END;
