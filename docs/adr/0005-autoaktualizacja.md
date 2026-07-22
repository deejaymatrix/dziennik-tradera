# ADR 0005: Produkcyjna autoaktualizacja (Tauri updater, podpis Ed25519, GitHub Releases)

Status: przyjęte

## Kontekst

Cel 1.8 wymaga produkcyjnej autoaktualizacji: użytkownik ma dostawać nowe wersje bez ręcznego
pobierania instalatora za każdym razem, ale aplikacja pozostaje lokalna i offline-first (bez
obowiązkowej chmury, bez telemetrii) — sprawdzanie aktualizacji to jedyny moment, w którym
aplikacja sama z siebie łączy się z internetem, i robi to tylko po to, by sprawdzić dostępność
nowej wersji (bez wysyłania żadnych danych użytkownika).

## Decyzja

- **Wtyczka:** `tauri-plugin-updater` (Rust) + `@tauri-apps/plugin-updater` (frontend), plus
  `tauri-plugin-process`/`@tauri-apps/plugin-process` do restartu po instalacji.
- **Podpisywanie:** para kluczy Ed25519 wygenerowana przez `tauri signer generate`. Klucz
  prywatny leży **poza repozytorium**, w `C:\Users\matri\.tauri\dziennik-tradera.key` (nigdy
  nie commitować — `.gitignore` ma regułę `*.key`/`*.key.pub` jako dodatkowe zabezpieczenie).
  Klucz publiczny jest bezpieczny do commitowania i jest wpisany w
  `apps/desktop/src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.
- **Dystrybucja:** GitHub Releases. Endpoint sprawdzania aktualizacji w `tauri.conf.json` to
  `https://github.com/<owner>/<repo>/releases/latest/download/latest.json` — plik
  `latest.json` generuje automatycznie `tauri-apps/tauri-action` przy publikacji wydania.
- **Automatyzacja:** `.github/workflows/release.yml` buduje, podpisuje i publikuje wydanie
  (jako **draft** — wymaga ręcznego opublikowania na GitHub, żeby nie wypuścić niczego przez
  pomyłkę) po wypchnięciu tagu `v*`.
- **UX:** cichy check przy starcie aplikacji (`AppShell`) pokazuje tylko powiadomienie
  (toast), jeśli jest nowa wersja — nigdy nie pobiera ani nie instaluje automatycznie. Pełny
  przepływ (sprawdź / pobierz / zainstaluj / uruchom ponownie) jest w Ustawieniach →
  Aktualizacje, zawsze z wyraźną akcją użytkownika przed pobraniem i przed restartem.

## Gdzie mieszkają aktualizacje

Źródłem aktualizacji są **wydania (Releases) publicznego repozytorium**
`deejaymatrix/dziennik-tradera`. Nie trzeba do tego żadnego własnego serwera ani hostingu:
pliki wydania w publicznym repozytorium są pobieralne bez logowania, a `tauri-action` publikuje
obok instalatora manifest `latest.json`, którego szuka wtyczka aktualizacji.

```
"endpoints": ["https://github.com/deejaymatrix/dziennik-tradera/releases/latest/download/latest.json"]
```

Warunek konieczny: repozytorium musi pozostać **publiczne**. Gdyby kiedyś zostało przełączone na
prywatne, aktualizacje przestaną się pobierać (prywatne wydania wymagają tokenu), i trzeba będzie
przenieść pliki wydań gdzie indziej — np. do osobnego publicznego repozytorium tylko na wydania
albo na statyczny hosting (Cloudflare R2, GitHub Pages).

## WAŻNE — do zrobienia przed pierwszym prawdziwym wydaniem

1. ~~Utworzyć repozytorium na GitHubie i podpiąć je jako `origin`.~~ ✅ zrobione.
2. ~~Podmienić placeholder w `tauri.conf.json` na prawdziwą ścieżkę `właściciel/repozytorium`.~~
   ✅ zrobione.
3. W ustawieniach repozytorium na GitHubie (Settings → Secrets and variables → Actions)
   dodać dwa sekrety:
   - `TAURI_SIGNING_PRIVATE_KEY` — cała zawartość pliku
     `C:\Users\matri\.tauri\dziennik-tradera.key` (otwórz go w Notatniku i skopiuj całość).
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — puste (ten klucz nie ma hasła; sekret i tak
     trzeba dodać, może być z pustą wartością, żeby workflow nie zgłaszał brakującej zmiennej).
4. Wypchnąć tag wydania, np. `git tag v1.0.0 && git push origin v1.0.0` — GitHub Actions
   zbuduje i przygotuje wydanie robocze (draft), które trzeba jeszcze ręcznie opublikować na
   stronie repozytorium ("Releases" → edytuj draft → "Publish release").

**Plik klucza prywatnego (`C:\Users\matri\.tauri\dziennik-tradera.key`) to jedyny sposób na
podpisywanie przyszłych aktualizacji tą samą tożsamością — zrób jego kopię zapasową w
bezpiecznym miejscu (np. menedżer haseł) zanim coś się z nim stanie. Zgubienie klucza nie
zepsuje już opublikowanych wersji, ale wymusi wygenerowanie nowej pary kluczy i zmianę
`pubkey` w konfiguracji dla wszystkich przyszłych wydań.**

## Konsekwencje

- Aplikacja nigdy nie instaluje niczego bez wyraźnego kliknięcia użytkownika.
- Publikacja wydania zawsze przechodzi przez ręczne zatwierdzenie (draft), więc pomyłkowe
  wypchnięcie tagu nie wypuści automatycznie niedopracowanej wersji do użytkowników.
- Dopóki punkt "WAŻNE" powyżej nie zostanie wykonany, przycisk "Sprawdź aktualizacje" będzie
  zwracał błąd (nieistniejący adres URL) — to oczekiwane, nie błąd aplikacji.
