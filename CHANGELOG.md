# Changelog

Format zgodny z [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/), wersjonowanie zgodne z [Semantic Versioning](https://semver.org/lang/pl/).

## [Unreleased]

### Dodano — Kamień 1: wspólny shell i design system

- `packages/ui`: design tokens (`tokens.css`, motyw ciemny domyślny + jasny, kolory finansowe zysk/strata/neutralny), `ThemeProvider`/`useTheme`/`useThemeToggle`, prymitywy `Button`, `TextField`, `SelectField`, `Card`, `Heading`/`Text`, `Badge`, `Spinner`, `Modal` (Radix Dialog), komponenty stanów `EmptyState`/`ErrorState`/`LoadingState`/`StatusIndicator` - wszystkie z testami jednostkowymi i testami dostępności (axe).
- `packages/testing`: wspólny helper `expectNoAccessibilityViolations` (jest-axe + Vitest, bez `expect.extend` który nie działa pod Vitest).
- `packages/app-shell`: typowany routing (`react-router`), `AppShell` (sidebar zwijany na desktopie, dolna nawigacja mobilna, TopBar, paleta poleceń Ctrl/Cmd+K), `LoginPage` i `OnboardingPage` (pełna walidacja Zod/React Hook Form, celowo **bez podłączonego backendu** - jawna informacja że uwierzytelnianie/zapis danych przyjdzie w Kamieniu 2), strony `DashboardPage`/`SettingsPage`/`SyncCenterPage`/`NotFoundPage`, `NetworkStatusBadge` (online/offline) i gotowy na przyszłość `syncStatusPresentation` (mapowanie pełnego `SyncStatus` z §6.6).
- `packages/i18n`: katalog `pl` rozszerzony o `nav`, `theme`, `auth`, `onboarding`, `network`, `states` - test mojibake nadal zielony na całym katalogu.
- `apps/web`: renderuje teraz prawdziwy `packages/app-shell` zamiast tymczasowego ekranu z Kamienia 0.
- `apps/storybook`: nowa aplikacja (Storybook 10, `@storybook/react-vite`, addon a11y + docs) ze story dla wszystkich kluczowych prymitywów i ekranów logowania/onboardingu/AppShella; przełącznik motywu w toolbarze.
- ADR-0005: preferencja motywu tymczasowo tylko w pamięci (nie `localStorage`) do czasu właściwego modelu Ustawień w Kamieniu 2/3.
- Zweryfikowano ręcznie w prawdziwej przeglądarce (nie tylko jsdom): routing, przełącznik motywu, paleta poleceń.

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
