-- Faza 3 modyfikacji przed instalatorem: zasady wejścia i zarządzania pozycją stają się
-- zarządzanymi listami (nazwa, opis, wymagana/opcjonalna - tylko wejście, aktywna/archiwalna,
-- kolejność, stabilne id) zamiast wolnego tekstu. Stare kolumny `entry_rules`/`management_rules`/
-- `exit_rules` NIE są kasowane ani migrowane - zostają jako dane historyczne wyłącznie do wglądu
-- (sekcja "zachowaj dane legacy"), nowy model czyta i zapisuje własne kolumny JSON. Zasady
-- wyjścia nie dostają nowego strukturalnego odpowiednika - ta sekcja znika z aktywnego modelu.
ALTER TABLE strategies ADD COLUMN entry_rules_json TEXT;
ALTER TABLE strategies ADD COLUMN management_rules_json TEXT;

-- Migawka checklisty zasad strategii zamrożona w momencie jej wyboru na transakcji (sekcja
-- "Checklist w transakcji") - budowana i utrzymywana po stronie frontendu, backend tylko
-- przechowuje gotowy JSON.
ALTER TABLE trades ADD COLUMN checklist_json TEXT;
