# Aktualizacje i wydania

> **Status: szkic wstępny (Kamień 0).** Pełny pipeline (podpis Tauri, Authenticode, kanały stable/beta, manifesty) powstaje w Kamieniu 6. Wiążące wymagania: `docs/specyfikacja-produktu.md` §4 (decyzje 66-76), §11.

## 1. Skrót wymagań wiążących

- Autoaktualizacja desktopowa przez oficjalny Tauri updater, wyłącznie HTTPS, artefakty podpisane.
- Sprawdzanie aktualizacji: po starcie (z opóźnieniem), cyklicznie w tle, ręcznie w Ustawieniach — nigdy blokująco.
- Przed instalacją: zakończenie zapisów, checkpoint bazy, zweryfikowany backup.
- Kanały: `stable` (użytkownicy) i `beta/internal` (właściciel), osobne manifesty.
- Ochrona przed downgrade'em bez jawnego trybu awaryjnego.
- Web/PWA: wykrycie nowej wersji service workera, brak przeładowania w trakcie niezapisanego formularza.
- Wersjonowanie: Semantic Versioning, identyczny numer wersji w UI/manifeście/instalatorze/diagnostyce.
- Instalator produkcyjny podpisany Authenticode; brak certyfikatu to jawna, nazwana blokada wydania — nie ukryte ostrzeżenie.

## 2. Do zaprojektowania i wdrożenia w Kamieniu 6

- Konfiguracja `tauri-plugin-updater` (manifest JSON, para kluczy podpisu).
- Pipeline CI: build Windows → podpis artefaktu Tauri → (opcjonalnie) Authenticode → publikacja do Cloudflare R2 → aktualizacja manifestu.
- Procedura generowania i bezpiecznego przechowania pary kluczy updatera (publiczny w repo/aplikacji, prywatny wyłącznie w sekretach CI + kopia awaryjna poza repo).
- Test `n -> n+1` z migracją bazy i zachowaniem danych.
- Instrukcja PL uzyskania certyfikatu Authenticode (jeśli właściciel go jeszcze nie posiada).

## 3. Zewnętrzne blokady znane już teraz

- **Certyfikat Authenticode** — właściciel nie dostarczył go jeszcze. Do czasu jego dostarczenia będziemy publikować wyłącznie build testowy/niepodpisany, jawnie oznaczony jako taki.
- **Domena + Cloudflare R2** — potrzebne do hostowania manifestu i artefaktów aktualizacji.

## 4. Status

Ten dokument zostanie uzupełniony o rzeczywisty, przetestowany pipeline w Kamieniu 6.
