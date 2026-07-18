# Dziennik Tradera

Prywatna aplikacja do prowadzenia dziennika transakcji tradingowych — dostępna jako aplikacja Windows (`Setup.exe`), aplikacja internetowa oraz instalowalna aplikacja PWA. Jeden produkt, wspólna domena i design system, synchronizacja offline-first.

Pełna specyfikacja produktu: [`docs/specyfikacja-produktu.md`](docs/specyfikacja-produktu.md).
Aktualny stan prac: [`docs/stan-projektu.md`](docs/stan-projektu.md).
Decyzje architektoniczne: [`docs/decyzje-architektoniczne.md`](docs/decyzje-architektoniczne.md).

> **Status:** projekt jest na etapie Kamienia 0 (fundament repozytorium). Żaden moduł produktowy nie jest jeszcze gotowy do użycia.

## Wymagania

- Node.js ≥ 22
- pnpm ≥ 11 (`corepack enable` albo `npm i -g pnpm`)
- Rust stable + Cargo (dla `apps/desktop`, Tauri 2)
- Na Windows: [wymagania Tauri dla Windows](https://v2.tauri.app/start/prerequisites/) (Microsoft C++ Build Tools, WebView2)

## Struktura repozytorium

```text
apps/
  web/          # aplikacja webowa i PWA (Vite + React)
  desktop/      # aplikacja Windows (Tauri 2)
packages/
  app-shell/    # wspólny routing i layout React
  domain/       # encje, obliczenia, reguły biznesowe (bez zależności od UI)
  ui/           # design system i komponenty
  data-contracts/ # schematy Zod, typy współdzielone, metadane synchronizacji
  data-desktop/ # adapter SQLite (komendy Rust)
  data-web/     # adapter IndexedDB/Dexie
  sync-engine/  # outbox, push/pull, rozwiązywanie konfliktów
  i18n/         # polskie komunikaty UI
  testing/      # fabryki danych wyłącznie do testów
supabase/
  migrations/   # migracje SQL
  functions/    # Edge Functions
  tests/        # testy pgTAP
docs/           # specyfikacja, ADR, dokumentacja techniczna i użytkownika
```

## Uruchomienie środowiska deweloperskiego

```bash
pnpm install
cp .env.example .env   # uzupełnij lokalnie wartościami z własnego środowiska
```

Komendy root (uruchamiane rekurencyjnie po wszystkich pakietach workspace):

```bash
pnpm test        # testy jednostkowe wszystkich pakietów
pnpm typecheck    # sprawdzenie typów TypeScript
pnpm lint         # ESLint
pnpm format       # Prettier (zapis)
pnpm secrets:scan # lokalny skan sekretów przed commitem
```

Uruchomienie poszczególnych aplikacji opisane jest w `README` odpowiednich pakietów (`apps/web`, `apps/desktop`) w miarę ich powstawania.

## Zasady projektu (skrót)

- Cała komunikacja i UI po polsku, w poprawnym UTF-8.
- Brak jakiejkolwiek domyślnej/przykładowej strategii (w tym „Japan Attack”) i brak danych demonstracyjnych w bazie produkcyjnej.
- Pieniądze i ceny wyłącznie na typach dziesiętnych (`decimal.js`), nigdy na surowym `number`.
- Offline-first: desktop i web/PWA działają bez internetu po wcześniejszym zalogowaniu; synchronizacja nigdy nie gubi danych po cichu.
- Sekrety (klucze API, service-role, klucz podpisu aktualizacji) nigdy nie trafiają do repozytorium ani do bundle klienckiego.

Pełne, wiążące zasady: [`docs/specyfikacja-produktu.md`](docs/specyfikacja-produktu.md).

## Licencja

Projekt prywatny, nieprzeznaczony do dystrybucji publicznej.
