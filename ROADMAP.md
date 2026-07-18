# Roadmapa

## Etap 1 — solidne podstawy i pierwszy instalator

| Cel | Zakres                                                                               | Status       |
| --- | ------------------------------------------------------------------------------------ | ------------ |
| 1.1 | Repozytorium, standardy, uruchomiony podgląd (Vite + Tauri dev), error boundary, ADR | ✅ ukończony |
| 1.2 | Baza danych SQLite, migracje wersjonowane, repozytoria, WAL, kopia przed migracją    | ✅ ukończony |
| 1.3 | Nowy system wizualny (tokeny, komponenty) i nawigacja                                | ✅ ukończony |
| 1.4 | Konta, operacje finansowe (wpłaty/wypłaty/korekty), biblioteka instrumentów          | ⬜           |
| 1.5 | Strategie użytkownika (start pusty) i pełny formularz transakcji                     | ⬜           |
| 1.6 | Historia transakcji, dashboard, kalendarz, podstawowe raporty                        | ⬜           |
| 1.7 | Eksport CSV/XLSX/PDF, pełny backup `.dtjbackup` z weryfikacją i restore              | ⬜           |
| 1.8 | Produkcyjna autoaktualizacja (Tauri updater, podpis Ed25519, GitHub Releases)        | ⬜           |
| 1.9 | Instalator NSIS `.exe`, smoke test na czystym Windows 10/11                          | ⬜           |

Etap 1 jest ukończony dopiero, gdy spełnione są **wszystkie** kryteria z sekcji 17
oryginalnej specyfikacji (instalator, brak logowania, CRUD transakcji, poprawne obliczenia,
CSV/XLSX/PDF, backup/restore, podpisana autoaktualizacja N−1→N, praca offline, testy).

## Etap 2 — funkcje zaawansowane (dostarczane aktualizacjami)

Każdy cel to osobna, mała aktualizacja z testem migracji z poprzedniej wersji.

- 2.1 — Zaawansowane wykonania pozycji (wiele wejść, częściowe zamknięcia, skalowanie)
- 2.2 — Checklisty, zasady i jakość wykonania
- 2.3 — Psychologia i proces (emocje, tagi, korelacje)
- 2.4 — Screenshoty i materiały (drag&drop, schowek, linki)
- 2.5 — Zaawansowana analityka (heatmapy, MFE/MAE, rolling win rate)
- 2.6 — Cele i rutyny (limity, checklisty sesji)
- 2.7 — Wyszukiwanie i produktywność (paleta poleceń, skróty, zapisane widoki)
- 2.8 — Stabilne interfejsy pod przyszłe integracje (bez MT5, bez chmury obowiązkowej)

Poza zakresem, chyba że osobno zlecone: logowanie/konta/licencje, obowiązkowa chmura,
telemetria, import z MT5, gotowe strategie handlowe, funkcje generatywnego AI.
