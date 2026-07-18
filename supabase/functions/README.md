# Edge Functions

Status: katalog zarezerwowany w strukturze monorepo (Kamień 0).

Pierwsze funkcje (zaproszenia, administracja, atomowy push/pull synchronizacji,
operacje wymagające `SUPABASE_SERVICE_ROLE_KEY`) powstają w Kamieniu 2 —
patrz `docs/specyfikacja-produktu.md` §5.6 i §15 (Kamień 2).

Zasada bezpieczeństwa: `service-role key` używany jest wyłącznie wewnątrz
tych funkcji, nigdy w `apps/web` ani `apps/desktop`.
