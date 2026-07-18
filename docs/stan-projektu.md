# Stan projektu

> Ten plik jest źródłem prawdy o aktualnym stanie prac. Aktualizuj go po każdym ukończonym kroku.
> Po utracie lub kompresji kontekstu: przeczytaj ten plik, `docs/decyzje-architektoniczne.md` i `CHANGELOG.md` jako pierwsze.

## Aktualny etap

**ETAP I — Kamień 0: repozytorium i decyzje** (brama spełniona, gotowe do Kamienia 1)

## Status bramy Kamienia 0

Wymagane dowody: czysty build, test przykładowy na każdej warstwie, skan sekretów, dokumentacja uruchomienia.

| Kryterium                                                  | Status                                                                                                                                                                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo (pnpm workspaces, 2 aplikacje + 9 pakietów)       | ✅                                                                                                                                                                                                                |
| Specyfikacja skopiowana do `docs/specyfikacja-produktu.md` | ✅                                                                                                                                                                                                                |
| ADR założone (4 wpisy)                                     | ✅ (`docs/decyzje-architektoniczne.md`)                                                                                                                                                                           |
| `.env.example` bez sekretów                                | ✅                                                                                                                                                                                                                |
| CI (lint/typecheck/test, bez publikacji)                   | ✅ (`.github/workflows/ci.yml`; nieuruchomione na zdalnym GitHub - brak jeszcze repo zdalnego)                                                                                                                    |
| Threat model wstępny                                       | ✅ (`docs/model-zagrozen.md`)                                                                                                                                                                                     |
| Kontrakty danych (metadane synchronizacji, Zod)            | ✅ (`packages/data-contracts`)                                                                                                                                                                                    |
| Pusty seed produkcyjny bez strategii                       | ✅ (brak jakiegokolwiek seeda strategii/danych demo w `supabase/migrations`)                                                                                                                                      |
| Test przykładowy: TS (domain)                              | ✅ 9 testów, `pnpm test` zielone                                                                                                                                                                                  |
| Test przykładowy: web (Vite/React)                         | ✅ 2 testy, `pnpm test` zielone                                                                                                                                                                                   |
| Test przykładowy: desktop (Rust/Tauri)                     | ✅ `cargo test` zielone (1 test), `cargo clippy` i `cargo fmt --check` czyste                                                                                                                                     |
| Test przykładowy: SQL (pgTAP)                              | 🚧 napisany (`supabase/tests/00_extensions.test.sql`), **nieuruchomiony lokalnie** - wymaga Dockera, którego nie ma w tym środowisku deweloperskim; uruchomi się w CI (`supabase/setup-cli` + `supabase test db`) |
| Skan sekretów                                              | ✅ `pnpm secrets:scan` czyste                                                                                                                                                                                     |
| Dokumentacja uruchomienia (README)                         | ✅                                                                                                                                                                                                                |

Legenda: ✅ zrobione i zweryfikowane, 🚧 zrobione ale niezweryfikowane wykonanie, ⬜ nie rozpoczęto, ❌ zablokowane.

**Uczciwa uwaga:** test pgTAP nie został uruchomiony na tej maszynie (brak Dockera). Skrypt i migracja są napisane i logicznie poprawne, ale "zielony" status tego jednego elementu potwierdzi dopiero pierwsze uruchomienie CI na GitHubie lub lokalne uruchomienie z Dockerem. Nie deklaruję tego jako w pełni zweryfikowane.

## Zweryfikowane komendy (uruchomione lokalnie, wynik pozytywny)

- `pnpm install` — 12 projektów workspace, bez błędów.
- `pnpm lint` — 0 błędów.
- `pnpm format:check` — zgodne z Prettier.
- `pnpm typecheck` — 0 błędów we wszystkich pakietach.
- `pnpm test` — wszystkie pakiety TS/React zielone (domain, data-contracts, i18n, apps/web).
- `pnpm --filter @dziennik/web run build` — build produkcyjny Vite bez błędów.
- `cargo check` / `cargo test` / `cargo clippy --all-targets` / `cargo fmt -- --check` w `apps/desktop/src-tauri` — zielone.
- `node scripts/scan-secrets.mjs` — brak wykrytych sekretów w repozytorium.

## Blokady wymagające danych/decyzji właściciela

Żadna z poniższych pozycji nie blokuje obecnej pracy lokalnej — są potrzebne dopiero na dalszych kamieniach.

1. **Domena produkcyjna** — potrzebna dla web (Cloudflare Pages) i manifestu aktualizatora (Kamień 6).
2. **Projekt Supabase** (URL + klucze) — potrzebny od Kamienia 2 (backend/synchronizacja).
3. **Konto Cloudflare** (Pages + R2) — potrzebne od Kamienia 2 (storage) i Kamienia 6 (dystrybucja updatera).
4. **Prywatne repozytorium GitHub** — potrzebne do uruchomienia realnego CI/CD na zdalnym runnerze. Kamień 0 działa lokalnie bez tego; workflow jest gotowy i czeka na pierwszy push.
5. **Certyfikat Authenticode** — potrzebny dopiero w Kamieniu 6 do podpisania produkcyjnego instalatora Windows. Bez niego dostarczymy build testowy i instrukcję uzyskania certyfikatu, nie nazywając go „produkcyjnie podpisanym”.

## Lista niespełnionych kryteriów odbioru (z `docs/specyfikacja-produktu.md` §17)

Wszystkie 26 kryteriów pozostaje otwarte — Kamień 0 to wyłącznie fundament repozytorium, żaden z 16 modułów produktowych jeszcze nie istnieje. Lista będzie aktualizowana po każdym kamieniu milowym.

## Znane ograniczenia na tym etapie

- Brak jeszcze jakiegokolwiek działającego UI produktowego, bazy danych, synchronizacji ani modułów z §8 specyfikacji — to wyłącznie fundament repozytorium (routing, design system i pierwszy ekran logowania to Kamień 1).
- `apps/web` zawiera tylko tymczasowy ekran potwierdzający działanie pakietów współdzielonych — zostanie zastąpiony przez `packages/app-shell` w Kamieniu 1.
- `apps/desktop` to szkielet Tauri 2 (jedna komenda `app_version`) bez logiki biznesowej; frontend współdzielony z `apps/web`, ale integracja SQLite/IPC dopiero w Kamieniu 2.
- Test pgTAP nie zweryfikowany lokalnie (patrz wyżej — brak Dockera w tym środowisku).
- Brak zdalnego repo GitHub — CI zdefiniowane, ale nieuruchomione na runnerze.
- `packages/ui`, `packages/app-shell`, `packages/data-desktop`, `packages/data-web`, `packages/sync-engine`, `packages/testing` to na razie puste pakiety zarezerwowane w strukturze workspace (każdy ma plik wyjaśniający, w którym kamieniu otrzyma implementację).

## Następny krok

Kamień 1: wspólny shell (`packages/app-shell`) i design system (`packages/ui`) — routing, layout responsywny, motyw ciemny/jasny, polski system tekstów rozbudowany o realne ekrany, onboarding i logowanie, stany loading/empty/error/offline, Storybook kluczowych komponentów.
