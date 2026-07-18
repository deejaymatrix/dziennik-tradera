# Instrukcja administratora

> **Status: szkic wstępny (Kamień 0).** Zostanie napisana wraz z powstawaniem panelu administracyjnego (zaproszenia, role, unieważnianie dostępu — Kamień 2 i etap II) oraz procesu wydawania aktualizacji (Kamień 6).

## Planowana zawartość

1. Konfiguracja środowiska (Supabase, Cloudflare, domena) — checklist wdrożeniowy.
2. Zarządzanie zaproszeniami i rolami (`owner/admin`, `user`).
3. Unieważnianie dostępu i sesji urządzeń.
4. Zarządzanie kanałami aktualizacji (`stable` vs `beta/internal`).
5. Proces wydania nowej wersji: build → testy → podpis → publikacja manifestu → zatwierdzenie kanału stable.
6. Monitorowanie stanu synchronizacji i błędów (health checki).
7. Procedura odzyskiwania po awarii backendu.
8. Procedura reagowania na incydent bezpieczeństwa (odniesienie do `docs/model-zagrozen.md`).
