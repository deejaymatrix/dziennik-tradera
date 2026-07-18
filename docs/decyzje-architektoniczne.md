# Decyzje architektoniczne (ADR)

Format: krótki wpis na decyzję. Numeracja rosnąca, wpisy nie są usuwane (ewentualna zmiana decyzji to nowy wpis odwołujący się do poprzedniego).

---

## ADR-0001: Wybór stosu technologicznego dla Kamienia 0

**Data:** 2026-07-18
**Status:** przyjęte

**Kontekst:** Specyfikacja produktu (`docs/specyfikacja-produktu.md`, §5) definiuje rekomendowaną architekturę: pnpm workspaces, React + TypeScript (strict), Vite, Tauri 2, Supabase, SQLite (desktop), IndexedDB/Dexie (web). Wymaga używania wyłącznie stabilnych wydań, weryfikowanych względem oficjalnej dokumentacji w momencie instalacji, bez sztywnego przypinania się do numerów wersji zapisanych w dokumencie.

**Decyzja:**

- Menedżer pakietów: **pnpm** (workspaces), bez Turborepo na tym etapie — repo jest jeszcze zbyt małe, żeby uzasadnić dodatkowe narzędzie do orkiestracji buildów. Decyzja do rewizji w Kamieniu 3+, gdy liczba pakietów i czas builda wzrosną.
- Wersje pakietów npm instalowane przez `pnpm add` (rozwiązywane względem rejestru w momencie instalacji), a nie ręcznie wpisywane numery — żeby uniknąć nieistniejących lub nieaktualnych wersji.
- TypeScript w trybie `strict` + dodatkowe flagi (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals/Parameters`) zdefiniowane w `tsconfig.base.json`.
- ESLint we flat-config (`eslint.config.js`) z `typescript-eslint` i `eslint-config-prettier`.
- Testy jednostkowe TS: **Vitest** (zgodnie ze specyfikacją §13).

**Konsekwencje:** Każdy nowy pakiet workspace dziedziczy `tsconfig.base.json`. Root `package.json` nie zawiera ręcznie wpisanych wersji bibliotek domenowych — te są dodawane per-pakiet w miarę powstawania kolejnych kamieni.

---

## ADR-0002: Własny protokół synchronizacji zamiast SDK alpha

**Data:** 2026-07-18
**Status:** przyjęte

**Kontekst:** Specyfikacja (§5.1, §18) wprost zakazuje opierania rdzenia synchronizacji na eksperymentalnym/alpha SDK (w szczególności na SDK synchronizacji oferowanym przez Tauri, jeśli w danym momencie jest oznaczone jako alpha).

**Decyzja:** `packages/sync-engine` będzie własną, małą implementacją wzorca outbox/pull/push opisanego w §6 specyfikacji, z jawnym modelem konfliktów, a nie owijką na eksperymentalne SDK. Backend transportowy to Supabase (PostgreSQL + Edge Functions/RPC) — technologia produkcyjnie stabilna, ale protokół synchronizacji ponad nią jest w całości nasz i objęty testami kontraktowymi.

**Konsekwencje:** Więcej pracy własnej w Kamieniu 2, ale pełna kontrola nad semantyką konfliktów, idempotencją mutacji i brakiem cichej utraty danych — zgodnie z twardym wymaganiem specyfikacji.

---

## ADR-0003: Brak strategii i danych demonstracyjnych w seedach produkcyjnych

**Data:** 2026-07-18
**Status:** przyjęte

**Kontekst:** Specyfikacja (§3, §4 decyzje 16-17, §17 kryterium 2-3) zabrania jakiejkolwiek domyślnej/przykładowej strategii (w tym „Japan Attack”) oraz danych demonstracyjnych w bazie produkcyjnej.

**Decyzja:** Seedy w `supabase/migrations` i ewentualne dane startowe SQLite desktopu nigdy nie zawierają wierszy w tabeli strategii ani przykładowych transakcji. Dane demonstracyjne (np. dla Storybooka) żyją wyłącznie w `packages/testing` i nie są częścią żadnej migracji ani seeda uruchamianego na środowisku produkcyjnym/deweloperskim użytkownika.

**Konsekwencje:** Automatyczny test w Kamieniu 3 potwierdzi, że nowo utworzony użytkownik ma dokładnie zero strategii (kryterium odbioru §17.2).

---

## ADR-0004: Waluty i pieniądze na typach dziesiętnych

**Data:** 2026-07-18
**Status:** przyjęte

**Kontekst:** Specyfikacja (§4 decyzja 38, §18) zakazuje liczenia pieniędzy na surowym `float`/`number` JavaScriptu.

**Decyzja:** `packages/domain` używa `decimal.js` dla wszystkich obliczeń pieniężnych i cenowych. Wartości pieniężne przechowywane w bazie jako typy dziesiętne (PostgreSQL `numeric`, SQLite jako tekst/integer w najmniejszej jednostce — decyzja szczegółowa zostanie opisana w ADR przy Kamieniu 2/3 wraz ze schematem). Konwersja na `number` dozwolona wyłącznie w warstwie prezentacji (np. wejście do biblioteki wykresów), nigdy w obliczeniach.

**Konsekwencje:** Wszystkie funkcje domenowe operujące na pieniądzu przyjmują i zwracają `Decimal` lub string reprezentujący wartość dziesiętną, nigdy `number`.

---

<!-- Kolejne wpisy dopisywać poniżej, zachowując numerację rosnącą. -->
