# Klucze i proces wydania

Ten dokument opisuje **dwa różne klucze**, które łatwo ze sobą pomylić, oraz powtarzalny proces
wydania (Cel 1.8). Jeden z nich już masz i działa. Drugiego nie masz i to on blokuje wydanie.

---

## Dwa klucze — czym się różnią

|                | Klucz aktualizacji Tauri                                        | Certyfikat Authenticode                                      |
| -------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| Do czego służy | Aplikacja sprawdza, czy pobrana aktualizacja pochodzi od Ciebie | Windows sprawdza, czy instalator pochodzi od znanego wydawcy |
| Kto weryfikuje | Sama aplikacja, przy każdej aktualizacji                        | System Windows i SmartScreen, przy instalacji                |
| Stan           | ✅ **masz, działa**                                             | ❌ **brak — to blokuje wydanie**                             |
| Koszt          | zero                                                            | płatny, roczny                                               |
| Skutek braku   | aktualizacje w ogóle nie zadziałają                             | instalator działa, ale Windows straszy ostrzeżeniem          |

**Jeden nie zastępuje drugiego.** Paczka aktualizacyjna musi przejść obie weryfikacje.

---

## Klucz 1: aktualizacje Tauri — ✅ gotowy, zostały dwa kliknięcia

Sprawdzone 2026-07-23:

- klucz prywatny leży w `C:\Users\matri\.tauri\dziennik-tradera.key` (**poza repozytorium**);
- klucz publiczny w `apps/desktop/src-tauri/tauri.conf.json` **zgadza się** z plikiem
  `dziennik-tradera.key.pub` — porównane bajt w bajt;
- `.gitignore` ma reguły `*.key` i `*.key.pub` jako dodatkowe zabezpieczenie.

### Co musisz zrobić sam (ja tego nie zrobię — to Twój klucz prywatny)

1. Otwórz `C:\Users\matri\.tauri\dziennik-tradera.key` w Notatniku i skopiuj **całą** zawartość,
   razem z linią komentarza na górze.
2. Wejdź na `github.com/deejaymatrix/dziennik-tradera` → **Settings** → **Secrets and variables**
   → **Actions** → **New repository secret**.
3. Dodaj sekret o nazwie dokładnie `TAURI_SIGNING_PRIVATE_KEY` i wklej w wartość to, co
   skopiowałeś.
4. Dodaj drugi sekret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` i zostaw wartość **pustą** — ten klucz
   nie ma hasła, ale workflow oczekuje zmiennej i bez niej zgłosi brak.

To wszystko. Sprawdzić można poleceniem:

```bash
gh secret list
```

Powinny pojawić się dwie pozycje. Dziś polecenie nie zwraca nic — dlatego każde sprawdzenie
aktualizacji w aplikacji kończy się dziś komunikatem „serwer nie ma jeszcze wydania".

### Kopia zapasowa klucza — zrób ją, zanim cokolwiek innego

Utrata tego pliku **nie zepsuje** już zainstalowanych kopii aplikacji, ale sprawi, że nigdy
więcej nie przygotujesz dla nich aktualizacji: przyjmą tylko paczki podpisane tym konkretnym
kluczem. Nowa para kluczy oznacza, że każdy użytkownik musi zainstalować aplikację ręcznie
od nowa.

Zalecane: wklej zawartość pliku do menedżera haseł jako bezpieczną notatkę. To wystarczy —
plik ma 348 bajtów.

**Nigdy** nie wysyłaj tego pliku mailem, nie wrzucaj do repozytorium, na dysk w chmurze bez
szyfrowania ani nie wklejaj w czat (również mnie — nie potrzebuję go i nie powinienem go widzieć).

---

## Klucz 2: certyfikat Authenticode — ❌ brak, to jest blokada

Bez niego instalator się zbuduje i będzie działał, ale przy każdej instalacji Windows pokaże
ostrzeżenie SmartScreen („Windows chronił Twój komputer"), a użytkownik musi kliknąć
„Więcej informacji" → „Uruchom mimo to". Dla aplikacji finansowej to zły pierwszy kontakt.

### Co trzeba wybrać — Ty jesteś osobą prywatną, nie firmą

To realnie zawęża wybór. Sprawdzone 2026-07-24 (wyszukiwanie na żywo, nie z pamięci):

| Rodzaj                                                 | Dostępny dla osoby prywatnej? | Ostrzeżenie SmartScreen                                                        | Uwagi                                                                                                                                                                     |
| ------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OV/IV** (Organization / Individual Validation)       | **TAK**                       | znika dopiero po zbudowaniu reputacji — pierwsze setki pobrań nadal ostrzegają | weryfikacja dokumentem tożsamości (dowód/paszport), nie wpisem do rejestru firmy                                                                                          |
| **EV** (Extended Validation)                           | **NIE**                       | znika od razu                                                                  | wymaga zarejestrowanej firmy/działalności — jako osoba prywatna go nie kupisz                                                                                             |
| **Microsoft Trusted Signing** (Azure Artifact Signing) | **NIE dla Ciebie**            | znika szybciej niż przy OV, bo reputację buduje Microsoft                      | tani (od $9,99/mies.), ale zapisy dla osób prywatnych są **wstrzymane w wersji preview**, a nawet gdy działały, obejmowały wyłącznie USA i Kanadę — Polska poza zasięgiem |

**Uwaga — nazwa „OV" myli.** OV (Organization Validation) z definicji wymaga zarejestrowanej
firmy. To, czego potrzebujesz jako osoba prywatna, to osobny produkt: **IV (Individual
Validation)** — nie każdy wydawca w ogóle go ma, więc samo szukanie „code signing OV" trafi
Cię na formularze proszące o numer rejestru firmy, których nie wypełnisz.

Sprawdzeni wydawcy, którzy FAKTYCZNIE sprzedają certyfikat dla osoby prywatnej (2026-07-24):

- **Certum** — polski wydawca, wprost dla osób prywatnych bez firmy. Prawdopodobnie
  najwygodniejszy dla Ciebie: polski support, polski dowód osobisty, płatność w PLN.
- **Sectigo** — ma osobną opcję „Individual" obok organizacyjnej.
- **DigiCert** — akceptuje osobę prywatną, weryfikacja głównie paszportem ze zdjęciem.
- **SSL.com** — własny produkt nazwany wprost „IV" (Individual Validated).

Szukaj na stronie wydawcy produktu nazwanego **„Code Signing Certificate"** z opcją
„Individual"/„osoba fizyczna" — NIE produktu SSL/TLS (tamte mają DV, które w ogóle nie
istnieje dla podpisu kodu, patrz wyżej) i NIE formularza wymagającego numeru KRS/NIP firmy.

Weryfikacja tożsamości jako osoby prywatnej: skan dowodu osobistego lub paszportu, czasem
dodatkowo potwierdzenie adresu. Trwa zwykle od kilku dni do dwóch tygodni — to najdłuższy
element całego wydania, więc jeśli chcesz wydać w konkretnym terminie, zacznij od tego.

**Ważna zmiana od 2026:** CA/Browser Forum ogranicza maksymalną ważność publicznie zaufanych
certyfikatów podpisu kodu do 458 dni (reguła obowiązuje od 27 lutego/1 marca 2026, zależnie
od wydawcy). Część wydawców (np. DigiCert) sprzedaje w praktyce plany roczne w ramach tego
limitu. W obu przypadkach: krócej niż dawne certyfikaty wieloletnie — licz się z odnowieniem
co rok, nie raz na kilka lat.

**Decyzja, u którego wydawcy kupić i kiedy, jest Twoja i wiąże się z wydatkiem — nie podejmę
jej za Ciebie.** Kiedy będziesz miał certyfikat, dopiszemy do procesu wydania podpisywanie
`signtool` ze znacznikiem czasu i dopiero wtedy blok E (instalator) przestanie być
zablokowany.

---

## Proces wydania — kolejność jest istotna

Kroki 1–7 muszą zakończyć się powodzeniem, **zanim** wykona się krok 8. Publikacja manifestu
jest ostatnia i to ona ogłasza wersję użytkownikom — odwrócenie kolejności oznacza, że aplikacje
zobaczą aktualizację, której pliku jeszcze nie ma.

1. **Ustaw nową wersję** w trzech plikach naraz: `apps/desktop/src-tauri/Cargo.toml`,
   `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/package.json`. Zgodności pilnuje test
   `wersja::tests::wersja_jest_taka_sama_w_cargo_tauri_i_package_json` — rozjazd psuje
   aktualizacje niewidocznie, więc nie pomijaj go „bo to tylko numerek".
2. **Pełna kontrola jakości**: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
   `cargo fmt --check`, `cargo clippy --all-targets`, `cargo test`.
3. **Budowa artefaktów Windows x64** na runnerze Windows (workflow `release.yml`).
4. **Podpis Authenticode** plików `.exe` wraz ze znacznikiem czasu. ⛔ **Dziś niemożliwe** —
   brak certyfikatu.
5. **Podpis paczek aktualizacyjnych** kluczem Tauri (robi to `tauri-action` z sekretu).
6. **Wysłanie artefaktów** pod wersjonowane, niezmienne adresy.
7. **Weryfikacja**: dostępność plików, poprawność podpisu Authenticode i podpisu aktualizacji.
8. **Publikacja `latest.json`** jako ostatni, niepodzielny krok.
9. **Test aktualizacji** z poprzedniej publicznej wersji na czystej maszynie Windows 10/11 x64.

Obecny workflow tworzy wydanie jako **szkic (draft)** — trzeba je ręcznie opublikować na
GitHubie. To celowe: pomyłkowe wypchnięcie tagu nie wypuści niedopracowanej wersji.

---

## Czego nigdy nie umieszczać w repozytorium, aplikacji, instalatorze ani logach

- klucza prywatnego aktualizacji Tauri;
- pliku certyfikatu `.pfx` i jego hasła;
- tokenów dostępowych i haseł do magazynu artefaktów.

Stan sprawdzony 2026-07-23: repozytorium nie zawiera żadnego z powyższych, a logi aplikacji nie
zapisują nazw, kwot ani identyfikatorów użytkownika.
