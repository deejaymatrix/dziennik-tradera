-- Przykładowy test pgTAP potwierdzający, że warstwa SQL ma działający fundament
-- testowy (brama Kamienia 0: "test przykładowy na każdej warstwie").
-- Uruchamiane przez `pg_prove` / `supabase test db` na bazie z zastosowanymi
-- migracjami z supabase/migrations. Właściwe testy RLS i funkcji bazodanowych
-- powstają w Kamieniu 2 - patrz docs/specyfikacja-produktu.md §12.2, §13.

begin;

select plan(1);

select has_extension('pgcrypto', 'Rozszerzenie pgcrypto powinno być włączone po migracjach.');

select * from finish();

rollback;
