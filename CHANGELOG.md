# Changelog

Format zgodny z [Keep a Changelog](https://keepachangelog.com/), wersjonowanie [SemVer](https://semver.org/).

## [Unreleased]

### Added

- Fundament repozytorium: monorepo pnpm, TypeScript ścisły, ESLint + Prettier, Tauri 2 +
  React 19 + Vite 8.
- Globalny error boundary i ekran bezpiecznego startu.
- Pierwsza komenda diagnostyczna backendu (`get_app_status`).
- Skrypty deweloperskie Windows (`start-dev.ps1`, `start-dev.bat`).
- Dokumentacja decyzji architektonicznych (`docs/adr`).
- Schemat SQLite (konta, operacje finansowe, instrumenty, strategie, transakcje, wykonania,
  notatki, załączniki, dziennik zmian) i transakcyjny silnik migracji z automatyczną kopią
  bazy przed aktualizacją oraz kontrolą integralności.
- Repozytorium kont (CRUD + archiwizacja/przywracanie) jako pierwszy przetestowany pionowy
  przekrój warstw domain/application/infrastructure.
- System wizualny: tokeny (paleta, typografia Inter lokalnie, odstępy, ruch), biblioteka
  komponentów (Button, IconButton, TextField, Select, Checkbox, Switch, Tag, Badge, Tooltip,
  Modal, Toast, EmptyState, Skeleton, ErrorState), zwijana pogrupowana nawigacja, routing.
- Startowa biblioteka 11 instrumentów CFD/Forex, operacje finansowe (wpłaty/wypłaty/korekty)
  z saldem konta liczonym autorytatywnie w Rust.
- Ekrany Kont i Instrumentów: pełny CRUD z archiwizacją/aktywacją, modal operacji
  finansowych z historią, komponent Table.

### Fixed

- Zakleszczenie mutexa w `SqliteAccountRepository::create` (brakujące zwolnienie blokady przed
  wywołaniem `self.get()`).
- Kolizja kluczy React między modalami na stronie Kont (oba domyślnie `key="closed"`).
