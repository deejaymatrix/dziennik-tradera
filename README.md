# Dziennik Tradera

Lokalna aplikacja desktopowa dla Windows do prowadzenia dziennika transakcji tradingowych.
Brak logowania, kont, chmury, telemetrii i importu z MT5 — wszystkie dane trzymane są
lokalnie. Zobacz [ROADMAP.md](ROADMAP.md) i [PROGRESS.md](PROGRESS.md) po aktualny stan prac.

## Wymagania

- Node.js `^20.19.0 || >=22.12.0`
- pnpm `>=9` (`corepack enable` jeśli nie masz pnpm)
- Rust (stable) + Cargo — https://rustup.rs
- Windows 10/11 z zainstalowanym WebView2 (zwykle już obecny w systemie)

## Uruchomienie środowiska deweloperskiego

```powershell
pnpm install
pnpm dev
```

albo po prostu uruchom `start-dev.ps1` (lub `start-dev.bat`) — zainstaluje zależności, jeśli
brakuje `node_modules`, i uruchomi podgląd.

`pnpm dev` uruchamia jednocześnie serwer Vite (HMR, http://localhost:1420) oraz `tauri dev`,
które otwiera natywne okno aplikacji podłączone do tego podglądu.

Sam podgląd frontendu (bez okna Tauri) można uruchomić przez `pnpm dev:vite`.

## Pozostałe polecenia

| Polecenie                      | Opis                                                   |
| ------------------------------ | ------------------------------------------------------ |
| `pnpm lint`                    | ESLint (TypeScript, ze świadomością typów)             |
| `pnpm format` / `format:check` | Prettier                                               |
| `pnpm typecheck`               | `tsc` bez emisji plików                                |
| `pnpm test`                    | Testy jednostkowe/komponentów (Vitest)                 |
| `pnpm test:rust`               | Testy Rust (`cargo test`) dla `apps/desktop/src-tauri` |
| `pnpm build`                   | Build instalatora (`tauri build`)                      |

## Struktura repozytorium

- `apps/desktop` — aplikacja Tauri (Rust w `src-tauri/`, interfejs React/TS w `src/`).
- `packages/*` — wspólne pakiety (domain, ui, ...), dodawane wraz z realną zawartością
  w kolejnych etapach — patrz `docs/adr/0002-struktura-workspace.md`.
- `docs/adr/` — decyzje architektoniczne.

## Dokumentacja

- [ROADMAP.md](ROADMAP.md) — plan Etapu 1 i 2.
- [PROGRESS.md](PROGRESS.md) — bieżący status prac.
- [CHANGELOG.md](CHANGELOG.md) — historia zmian.
- [docs/adr/](docs/adr/) — decyzje architektoniczne.
