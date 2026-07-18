/**
 * Jedyny w tej chwili system zasobów tekstowych UI (język polski, wersja pierwsza).
 * Zgodnie z docs/specyfikacja-produktu.md §10: wszystkie widoczne teksty po polsku,
 * pełne UTF-8, trzymane w jednym miejscu zamiast rozsiane po komponentach.
 *
 * Ten katalog rośnie wraz z kolejnymi kamieniami (Kamień 1: shell/onboarding,
 * Kamień 3+: moduły produktowe). Na razie zawiera wyłącznie fundament wspólny.
 */
export const pl = {
  common: {
    appName: 'Dziennik Tradera',
    save: 'Zapisz',
    cancel: 'Anuluj',
    delete: 'Usuń',
    restore: 'Przywróć',
    edit: 'Edytuj',
    add: 'Dodaj',
    addTransaction: 'Dodaj transakcję',
    close: 'Zamknij',
    confirm: 'Potwierdź',
    loading: 'Wczytywanie…',
    search: 'Szukaj',
  },
  emptyStates: {
    noStrategiesTitle: 'Nie masz jeszcze żadnej strategii',
    noStrategiesDescription:
      'Utwórz własną strategię, aby móc przypisywać ją do transakcji. Nie znajdziesz tu gotowych szablonów.',
    noTransactionsTitle: 'Brak transakcji',
    noTransactionsDescription: 'Dodaj pierwszą transakcję, aby zobaczyć tutaj dane.',
  },
  syncStatus: {
    synced: 'Zsynchronizowano',
    syncing: 'Synchronizacja trwa…',
    offline: 'Offline',
    pendingChanges: 'Oczekujące zmiany',
    authRequired: 'Wymagane logowanie',
    retryableError: 'Błąd — spróbuj ponownie',
    conflict: 'Konflikt wymaga decyzji',
  },
  tradeDirection: {
    buy: 'Kupno',
    sell: 'Sprzedaż',
  },
} as const;

export type MessageCatalog = typeof pl;
