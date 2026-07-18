# Changelog

Format zgodny z [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/), wersjonowanie zgodne z [Semantic Versioning](https://semver.org/lang/pl/).

## [Unreleased]

### Dodano — Kamień 0: repozytorium i decyzje

- Szkielet monorepo pnpm workspaces: `apps/web` (Vite + React + TS), `apps/desktop` (Tauri 2), 9 pakietów w `packages/` (`domain`, `data-contracts`, `i18n`, `ui`, `app-shell`, `data-desktop`, `data-web`, `sync-engine`, `testing`), `supabase/` (migracje, testy pgTAP, Edge Functions).
- Pełna specyfikacja produktu zapisana w `docs/specyfikacja-produktu.md` oraz komplet dokumentacji startowej (`docs/stan-projektu.md`, `docs/decyzje-architektoniczne.md` z 4 ADR, `docs/model-zagrozen.md`, `docs/architektura.md` i pozostałe szkice w `docs/`).
- Konfiguracja bazowa: `tsconfig.base.json` (strict), ESLint (flat config) + Prettier, `.env.example`, `.gitignore`/`.gitattributes`.
- `packages/domain`: `Money` (arytmetyka dziesiętna na `decimal.js`, zakaz mieszania walut) i `weightedAveragePrice` (średnia ważona ceny wejścia/wyjścia, nigdy nie zmyśla wyniku przy złych danych).
- `packages/data-contracts`: schematy Zod dla metadanych synchronizacji, mutacji outboksa i statusu synchronizacji (§6 specyfikacji).
- `packages/i18n`: pierwszy katalog komunikatów PL + test automatyczny wykrywający mojibake.
- `apps/web`: minimalny, buduje się i ma testy (Vitest + Testing Library).
- `apps/desktop`: szkielet Tauri 2 (komenda `app_version`, CSP, ikony, kanał NSIS), `cargo test`/`clippy`/`fmt` zielone.
- `supabase/`: pierwsza migracja, konfiguracja CLI (`supabase init`) i pierwszy test pgTAP.
- CI (`.github/workflows/ci.yml`): lint/typecheck/test/build web (Ubuntu), `cargo test`/`clippy`/`fmt` (Windows), pgTAP przez `supabase test db` (Ubuntu) — bez kroku publikacji.
- Skrypt skanu sekretów (`scripts/scan-secrets.mjs`), zintegrowany z CI.

<!-- Kolejne wersje dopisywać powyżej tej linii, najnowsze na górze. -->
