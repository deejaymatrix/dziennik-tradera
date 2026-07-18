# Model zagrożeń — Dziennik Tradera

> Wersja wstępna (Kamień 0). Będzie uzupełniana o konkretne komponenty w miarę powstawania kolejnych kamieni (szczególnie Kamień 2 — synchronizacja/auth/RLS, Kamień 6 — updater/podpis kodu).

## 1. Zakres i aktywa

**Aktywa chronione:**

- Dane tradingowe użytkownika (transakcje, konta, salda, strategie, notatki, emocje) — wrażliwe finansowo i osobiście.
- Screenshoty transakcji — mogą zawierać dane identyfikujące konto brokerskie.
- Poświadczenia: hasła, tokeny sesji/odświeżania, klucze API dostawcy AI.
- Klucz prywatny podpisujący aktualizacje (Tauri updater) i certyfikat Authenticode.
- Klucz service-role Supabase.

**Aktorzy:**

- Właściciel (`owner/admin`) — zaprasza użytkowników, zarządza dostępem.
- Zaproszony użytkownik (`user`) — właściciel własnych danych tradingowych.
- Atakujący zewnętrzny — bez konta, próbuje dostępu przez sieć/publiczne endpointy.
- Atakujący z kontem — zalogowany użytkownik próbujący uzyskać dostęp do danych innego użytkownika.
- Skompromitowane urządzenie — desktop lub przeglądarka z złośliwym oprogramowaniem/rozszerzeniem.

## 2. Granice zaufania

1. Przeglądarka użytkownika (web/PWA) ↔ Supabase (Auth/PostgREST/Storage/Edge Functions) — HTTPS.
2. Proces Tauri (frontend WebView) ↔ backend Rust (IPC, ograniczone przez `capabilities`) ↔ SQLite lokalne.
3. Aplikacja desktop ↔ Supabase — HTTPS, ta sama granica co web.
4. Klient (web/desktop) ↔ serwer manifestu aktualizacji — HTTPS, weryfikacja podpisu artefaktu.
5. Klient ↔ dostawca AI (lokalny model lub zdalny przez bezpieczny backend) — jawna zgoda użytkownika na każdy zakres danych.

## 3. Analiza STRIDE (poziom architektury, do pogłębienia per moduł)

| Kategoria                  | Zagrożenie                                                                         | Mitigacja                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S**poofing               | Podszycie się pod innego użytkownika po przejęciu tokenu sesji                     | Supabase Auth, krótkożyjące tokeny dostępu, odświeżanie przez bezpieczne storage (Credential Manager na desktopie), unieważnianie sesji per urządzenie (§7.1) |
| **T**ampering              | Modyfikacja payloadu mutacji w locie (np. zmiana `owner_id` na innego użytkownika) | RLS na każdej tabeli weryfikujące `owner_id = auth.uid()` niezależnie od tego, co wysłał klient; walidacja Zod po stronie serwera (Edge Functions)            |
| **T**ampering              | Dowolny SQL wysyłany z frontendu desktopowego do SQLite                            | Brak wystawienia surowego SQL — wyłącznie wąskie, typowane komendy Rust (§5.4)                                                                                |
| **R**epudiation            | Brak śladu kto/kiedy zmienił saldo konta lub strategię                             | Audyt zmian (`created_at`/`updated_at`/`last_modified_by_device_id`), historia wersji strategii/instrumentów (§7.4, §8.4)                                     |
| **I**nformation Disclosure | Odczyt danych innego użytkownika przez brak/błędne RLS                             | RLS na każdej tabeli + testy pgTAP prób dostępu A→B (§12.2, Kamień 2)                                                                                         |
| **I**nformation Disclosure | Publiczny bucket ze screenshotami                                                  | Prywatny Supabase Storage, krótkotrwałe podpisane URL (§6.5, §12.7)                                                                                           |
| **I**nformation Disclosure | Sekrety w logach/diagnostyce                                                       | Maskowanie sekretów w logach, jawny podgląd zakresu przed eksportem diagnostycznym (§12.10-11)                                                                |
| **I**nformation Disclosure | Wyciek `SUPABASE_SERVICE_ROLE_KEY` do bundle klienta                               | Klucz service-role wyłącznie w Edge Functions/CI, nigdy w `apps/web`/`apps/desktop`; skan sekretów w CI (`scripts/scan-secrets.mjs` + narzędzie CI)           |
| **D**enial of Service      | Zalanie logowania/zaproszeń/sync/uploadu żądaniami                                 | Rate limiting (§12.9), backoff z jitter w outboxie (§6.2)                                                                                                     |
| **E**levation of Privilege | Użytkownik `user` wykonuje akcje administracyjne                                   | Role `owner/admin` vs `user` wymuszone w RLS i Edge Functions, nie tylko w UI                                                                                 |
| **E**levation of Privilege | Nadmiarowe uprawnienia Tauri (dostęp do całego systemu plików)                     | Minimalne `capabilities`, ścisłe CSP (§5.4, §12.4)                                                                                                            |

## 4. Ryzyka specyficzne dla synchronizacji offline-first

- **Powtórzona mutacja tworzy duplikat** — mitigacja: `mutation_id` idempotentny po stronie serwera (§6.2), test w Kamieniu 2/3.
- **Cicha utrata danych przy konflikcie** — mitigacja: `base_server_version`, tabela konfliktów, Centrum synchronizacji (§6.4), zakaz automatycznego „last write wins” bez zachowania wersji.
- **Fałszywe urządzenie wstrzykuje zmiany** — mitigacja: mutacje uwierzytelnione tokenem sesji, `device_id` powiązany z zarejestrowanym urządzeniem użytkownika.

## 5. Ryzyka aktualizacji (Kamień 6, do rozwinięcia)

- **Podmiana artefaktu aktualizacji (MITM/serwer)** — mitigacja: wyłącznie HTTPS, weryfikacja podpisu Tauri przed instalacją, publiczny klucz w aplikacji.
- **Downgrade attack** — mitigacja: ochrona przed instalacją starszej wersji bez jawnego trybu awaryjnego (§11.1).
- **Wyciek prywatnego klucza podpisującego** — mitigacja: klucz wyłącznie w sekretach CI, kopia awaryjna poza repozytorium, nigdy w repo (§11.1, §18).

## 6. Otwarte pytania do pogłębienia w kolejnych kamieniach

- Dokładny mechanizm szyfrowania lokalnej bazy SQLite na desktopie (Kamień 2/3) — musi być stabilny i przetestowany (§12.14), decyzja i uzasadnienie trafią do osobnego ADR.
- Szczegółowy próg i implementacja rate limitingu w Edge Functions (Kamień 2).
- Polityka retencji tombstones i plików usuniętych miękko (Kamień 2/6).

## 7. Status

Ten dokument jest żywy — każdy kamień milowy dodający nową powierzchnię ataku (auth, storage, sync, updater, AI) musi go zaktualizować przed uznaniem kamienia za zamknięty.
