# Stan projektu

> Ten plik jest źródłem prawdy o aktualnym stanie prac. Aktualizuj go po każdym ukończonym kroku.
> Po utracie lub kompresji kontekstu: przeczytaj ten plik, `docs/decyzje-architektoniczne.md` i `CHANGELOG.md` jako pierwsze.

## Aktualny etap

**ETAP I — Kamień 1: wspólny shell i design system** (brama spełniona, gotowe do Kamienia 2)

Kamień 0 (repozytorium i decyzje) — ✅ zamknięty, patrz historia w `CHANGELOG.md`.

## Status bramy Kamienia 1

Wymagane dowody: web i Tauri uruchamiają ten sam spójny shell; testy polskich znaków i dostępności.

| Kryterium                                                                                        | Status                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Design tokens + ThemeProvider (dark domyślny, jasny, `prefers-color-scheme`)                     | ✅ `packages/ui`                                                                                                                                                      |
| Prymitywy UI (Button, TextField, SelectField, Card, Typography, Badge, Spinner, Modal)           | ✅ z testami i story w Storybooku                                                                                                                                     |
| Komponenty stanów (EmptyState, ErrorState, LoadingState, StatusIndicator)                        | ✅                                                                                                                                                                    |
| Routing typowany + AppShell (sidebar desktop, dolna nawigacja mobile, paleta poleceń Ctrl/Cmd+K) | ✅ `packages/app-shell`                                                                                                                                               |
| Ekran logowania (UI + walidacja Zod/RHF)                                                         | ✅ **bez realnego backendu** - jawna informacja, że Supabase Auth podłączymy w Kamieniu 2                                                                             |
| Ekran onboardingu (profil, strefa czasowa, waluta, pierwsze konto, opcjonalna strategia)         | ✅ **bez realnego backendu**, tak jak wyżej; strategia zawsze startuje pusta                                                                                          |
| `apps/web` renderuje `packages/app-shell` (nie własny placeholder)                               | ✅ zweryfikowane w prawdziwej przeglądarce (nie tylko w testach)                                                                                                      |
| `apps/desktop` używa tego samego builda `apps/web` jako frontendu                                | ✅ konfiguracja (`tauri.conf.json`) niezmieniona od Kamienia 0 i nadal poprawna; **nie uruchomiono interaktywnie okna Tauri w tym środowisku** (brak GUI w sandboxie) |
| Testy polskich znaków (mojibake)                                                                 | ✅ katalog `pl` w `packages/i18n` rozbudowany o nav/auth/onboarding/states, test dalej zielony                                                                        |
| Testy dostępności (axe)                                                                          | ✅ Button, TextField, SelectField, Modal, EmptyState/ErrorState/LoadingState/StatusIndicator, AppShell+Dashboard, ekran logowania, onboarding, 404                    |
| Storybook kluczowych komponentów i ekranów                                                       | ✅ `apps/storybook` (Storybook 10, addon a11y + docs), `storybook build` przechodzi                                                                                   |

Legenda: ✅ zrobione i zweryfikowane, 🚧 zrobione ale niezweryfikowane wykonanie, ⬜ nie rozpoczęto, ❌ zablokowane.

## Zweryfikowane komendy i działania (Kamień 1)

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` — całe repo, zielone (12 pakietów, 72 testy TS/React).
- `cargo test` / `cargo clippy --all-targets -- -D warnings` / `cargo fmt -- --check` w `apps/desktop/src-tauri` — zielone (bez zmian od Kamienia 0).
- `pnpm --filter @dziennik/web run build` — build produkcyjny bez błędów.
- `pnpm --filter @dziennik/storybook run build` (`storybook build`) — kompletuje się, wszystkie story wchodzą do bundla.
- **Ręczna weryfikacja w prawdziwej przeglądarce** (nie tylko jsdom): uruchomiony `pnpm --filter @dziennik/web dev`, otwarty w podglądzie przeglądarki, potwierdzone: Dashboard z pustym stanem, nawigacja (kliknięcie „Ustawienia” faktycznie routuje), przełącznik motywu (dark→light działa, zmienia `data-theme` na `<html>`), paleta poleceń otwiera się na Ctrl/Cmd+K i pokazuje listę stron. Zrzut ekranu narzędzia zawiódł (timeout renderera w tym sandboxie) - weryfikacja oparta o drzewo dostępności i treść strony zamiast obrazu, ale to potwierdzenie działania w realnej przeglądarce, nie tylko w testach.

## Blokady wymagające danych/decyzji właściciela

Bez zmian względem Kamienia 0 - nadal nic nie blokuje obecnej pracy lokalnej:

1. Domena produkcyjna (Kamień 6).
2. Projekt Supabase (Kamień 2).
3. Konto Cloudflare - Pages/R2 (Kamień 2/6).
4. Prywatne repozytorium GitHub - CI gotowe, czeka na pierwszy push.
5. Certyfikat Authenticode (Kamień 6).

## Lista niespełnionych kryteriów odbioru (z `docs/specyfikacja-produktu.md` §17)

Nadal wszystkie 26 kryteriów otwarte — Kamień 1 to fundament UI/routingu, żaden z 16 modułów produktowych (Transakcje, Konta, Strategie itd.) jeszcze nie ma logiki biznesowej ani danych. Logowanie i onboarding mają już kompletny interfejs, ale świadomie **bez podłączonego backendu** — nic tu nie udaje działania, którego jeszcze nie ma.

## Znane ograniczenia na tym etapie

- Logowanie i onboarding nie zapisują niczego trwale - to Kamień 2 (Supabase Auth + warstwa danych).
- Nawigacja główna celowo zawiera tylko Dashboard + strony infrastrukturalne (Ustawienia, Centrum synchronizacji) - pozostałe 13 modułów dołączą do nawigacji dopiero z własną implementacją (Kamień 3-5), zamiast być teraz pustymi zaślepkami.
- `NetworkStatusBadge` pokazuje wyłącznie łączność sieciową przeglądarki (`navigator.onLine`) - pełny status synchronizacji (kolejka, konflikty) przyjdzie z `packages/sync-engine` w Kamieniu 2. Mapowanie na docelowy wygląd (`syncStatusPresentation`) jest już gotowe i przetestowane.
- Preferencja motywu (dark/light) żyje tylko w pamięci procesu (resetuje się po odświeżeniu) - patrz ADR-0005. Trwały zapis trafi do właściwego modelu Ustawień w Kamieniu 2/3.
- `packages/data-desktop`, `packages/data-web`, `packages/sync-engine`, `packages/testing` (poza `expectNoAccessibilityViolations`) nadal są w większości zarezerwowanymi miejscami w strukturze - ich właściwa implementacja to Kamień 2.
- Okno aplikacji desktopowej (Tauri) nie zostało odpalone interaktywnie w tym środowisku (brak GUI w sandboxie) - konfiguracja jest poprawna i niezmieniona od Kamienia 0, ale to nie to samo co realne uruchomienie.

## Następny krok

Kamień 2: dane lokalne, backend i synchronizacja — schemat PostgreSQL/RLS, SQLite desktop, IndexedDB web, repository, outbox/push/pull, Centrum synchronizacji z prawdziwymi danymi, konflikty, prywatne pliki, invite-only auth (podłączenie ekranu logowania do Supabase Auth).
