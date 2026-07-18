# Backup i odzyskiwanie

> **Status: szkic wstępny (Kamień 0).** Pełna implementacja (szyfrowanie, weryfikacja, atomowe przywracanie) powstaje w Kamieniu 4. Wiążące wymagania: `docs/specyfikacja-produktu.md` §4 (decyzje 60, 77-80), §8.7, §12.13-14.

## 1. Skrót wymagań wiążących

- Backup automatyczny: dzienny oraz przed migracją, importem, aktualizacją i przywróceniem.
- Zakres backupu: baza, ustawienia, pliki, manifest wersji, sumy kontrolne.
- Backup można zweryfikować przed przywróceniem bez modyfikowania aktualnych danych.
- Przywracanie atomowe: backup stanu bieżącego przed przywróceniem, bezpieczny powrót przy błędzie.
- Szyfrowanie backupu: nowoczesny algorytm uwierzytelniony (np. AEAD), klucz nigdy zapisany obok archiwum.
- Szyfrowanie lokalnej bazy SQLite: rozwiązanie stabilne i wspierane na Windows x64, przetestowane na świeżej instalacji, aktualizacji i odzyskaniu — nie „własna kryptografia”.

## 2. Do zaprojektowania w Kamieniu 4

- Wybór konkretnej biblioteki/mechanizmu szyfrowania (do udokumentowania w ADR po weryfikacji aktualnego stanu utrzymania).
- Format archiwum backupu (struktura, wersjonowanie formatu, kompatybilność wsteczna).
- Polityka retencji (domyślna liczba/wiek przechowywanych backupów, konfigurowalna w Ustawieniach).
- Procedura przywracania: kroki, punkty kontrolne, zachowanie przy uszkodzonym backupie / złym kluczu / braku miejsca na dysku.

## 3. Wymagane testy (Kamień 4)

- Backup → weryfikacja → restore odtwarza dane i pliki 1:1.
- Uszkodzony plik backupu → czytelny błąd, brak częściowego, niespójnego przywrócenia.
- Zły klucz szyfrujący → czytelny błąd.
- Brak wolnego miejsca na dysku podczas przywracania → bezpieczne przerwanie bez utraty danych bieżących.

## 4. Status

Dokument zostanie rozbudowany o konkretny format i procedury po implementacji w Kamieniu 4.
