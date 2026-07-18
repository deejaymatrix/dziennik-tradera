# Synchronizacja offline-first

> **Status: szkic wstępny (Kamień 0).** Pełny opis protokołu, schemat tabel i diagramy sekwencji powstaną w Kamieniu 2 razem z implementacją `packages/sync-engine`. Wiążące wymagania są już zdefiniowane w `docs/specyfikacja-produktu.md` §6 — ten dokument będzie ich operacyjnym rozwinięciem (jak działa kod, nie co ma robić).

## 1. Skrót wymagań wiążących (pełna treść: specyfikacja §6)

- Każda synchronizowana encja ma: `id` (UUIDv7), `owner_id`, `created_at`, `updated_at`, `deleted_at` (tombstone), `server_version`, `last_modified_by_device_id`.
- Outbox: każda lokalna zmiana i jej rekord outbox zapisują się atomowo z `mutation_id`, `device_id`, `base_server_version`.
- Push: idempotentny, małe partie, exponential backoff + jitter.
- Pull: monotoniczny `change_id`, kursor per urządzenie, zastosowanie partii + aktualizacja kursora w jednej transakcji lokalnej.
- Konflikt: nieaktualny `base_server_version` nie nadpisuje cicho — trafia do tabeli konfliktów i Centrum synchronizacji.
- Załączniki: metadane przez bazę, binaria przez prywatny Storage, kolejka upload/download, SHA-256, limity, walidacja MIME.

## 2. Do zaprojektowania i opisania w Kamieniu 2

- Dokładny schemat tabeli outbox i tabeli konfliktów (SQLite i PostgreSQL).
- Diagram sekwencji: zapis lokalny → outbox → push → potwierdzenie serwera → aktualizacja `server_version`.
- Diagram sekwencji: pull → zastosowanie partii → aktualizacja kursora.
- Algorytm rozwiązywania konfliktów: które przypadki są bezpieczne do automatycznego scalenia (i dlaczego), które zawsze wymagają decyzji użytkownika.
- Format i endpoint Edge Function obsługującej push/pull (RPC vs REST, autoryzacja, rate limiting).
- Zachowanie przy wygaśnięciu tokenu w trakcie pracy offline (§5.5 specyfikacji: dane lokalne nadal czytelne/zapisywalne, synchronizacja czeka na ponowne uwierzytelnienie).

## 3. Status

Ten dokument zostanie uzupełniony o rzeczywisty, zaimplementowany i przetestowany protokół w Kamieniu 2. Do tego czasu wiążącym źródłem wymagań jest `docs/specyfikacja-produktu.md` §6.
