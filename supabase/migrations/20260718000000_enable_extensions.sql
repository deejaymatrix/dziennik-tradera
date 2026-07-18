-- Włącza rozszerzenia PostgreSQL wymagane przez przyszłe migracje.
-- Właściwy schemat encji domenowych (konta, transakcje, strategie, RLS itd.)
-- powstaje w Kamieniu 2 - patrz docs/specyfikacja-produktu.md §15 i §6.1.
-- Migracje są forward-only i transakcyjne (§4 decyzja 91).

create extension if not exists pgcrypto;
