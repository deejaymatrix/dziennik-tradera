# Architektura

> **Status: szkic wstępny (Kamień 0).** Diagramy i szczegóły komponentów zostaną uzupełnione w Kamieniach 1-2, gdy powstaną wspólny shell, warstwa danych i synchronizacja. Ten dokument nie jest jeszcze kompletny — traktuj go jako mapę drogową, nie jako opis gotowego systemu.

## 1. Przegląd produktu

Jeden produkt, trzy powierzchnie dostępu, wspólna domena:

```mermaid
flowchart TB
    subgraph Klienci
        Desktop["apps/desktop (Tauri 2 + WebView)"]
        Web["apps/web (przeglądarka)"]
        PWA["apps/web (zainstalowana jako PWA)"]
    end

    subgraph "Kod współdzielony"
        Shell["packages/app-shell"]
        Domain["packages/domain"]
        UI["packages/ui"]
        Contracts["packages/data-contracts"]
        Sync["packages/sync-engine"]
        I18n["packages/i18n"]
    end

    subgraph "Dane lokalne"
        SQLite["SQLite (przez data-desktop)"]
        IndexedDB["IndexedDB / Dexie (przez data-web)"]
    end

    subgraph Backend
        Auth["Supabase Auth"]
        PG["PostgreSQL + RLS"]
        Storage["Supabase Storage (prywatny)"]
        Edge["Edge Functions / RPC"]
    end

    Desktop --> Shell
    Web --> Shell
    PWA --> Shell
    Shell --> Domain
    Shell --> UI
    Shell --> I18n
    Domain --> Contracts
    Desktop --> SQLite
    Web --> IndexedDB
    SQLite --> Sync
    IndexedDB --> Sync
    Sync -->|push/pull HTTPS| Edge
    Edge --> PG
    Edge --> Auth
    Desktop -->|załączniki| Storage
    Web -->|załączniki| Storage
```

## 2. Warstwy kodu (planowane, patrz `docs/specyfikacja-produktu.md` §5.2)

| Pakiet                    | Odpowiedzialność                                                    | Zależy od                    |
| ------------------------- | ------------------------------------------------------------------- | ---------------------------- |
| `packages/domain`         | Encje, use-case'y, obliczenia (P&L, RR, drawdown), reguły walidacji | `data-contracts`             |
| `packages/data-contracts` | Schematy Zod, typy współdzielone, metadane synchronizacji           | —                            |
| `packages/ui`             | Design system, komponenty prezentacyjne                             | — (bez zależności od domain) |
| `packages/i18n`           | Polskie komunikaty, test kompletności/mojibake                      | —                            |
| `packages/data-desktop`   | Adapter SQLite przez komendy Rust                                   | `data-contracts`             |
| `packages/data-web`       | Adapter IndexedDB/Dexie                                             | `data-contracts`             |
| `packages/sync-engine`    | Outbox, pull/push, konflikty, retry                                 | `data-contracts`             |
| `packages/app-shell`      | Wspólny routing i layout React                                      | `domain`, `ui`, `i18n`       |
| `packages/testing`        | Fabryki danych wyłącznie do testów                                  | —                            |

Zasada graniczna: `domain` nie zależy od żadnego frameworka UI ani od konkretnego adaptera danych (SQLite/IndexedDB/PostgreSQL) — te wstrzykiwane są przez porty/adaptery.

## 3. Do uzupełnienia w kolejnych kamieniach

- Kamień 1: diagram routingu i stanów aplikacji (loading/empty/error/offline).
- Kamień 2: pełny diagram sekwencji synchronizacji (outbox → push → pull → rozwiązanie konfliktu), schemat bazy PostgreSQL i SQLite.
- Kamień 3: diagram modelu domenowego transakcji (nogi wejścia/wyjścia, checklisty, snapshoty strategii).
- Kamień 6: diagram procesu aktualizacji (manifest → pobranie → weryfikacja podpisu → backup → instalacja).
