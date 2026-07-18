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
  nav: {
    dashboard: 'Dashboard',
    settings: 'Ustawienia',
    syncCenter: 'Centrum synchronizacji',
    more: 'Więcej',
    openCommandPalette: 'Otwórz paletę poleceń',
    collapseSidebar: 'Zwiń panel boczny',
    expandSidebar: 'Rozwiń panel boczny',
    skipToContent: 'Przejdź do treści',
    mainNav: 'Nawigacja główna',
    secondaryNav: 'Ustawienia i synchronizacja',
    mobileNav: 'Nawigacja mobilna',
  },
  network: {
    online: 'Online',
    offline: 'Offline',
  },
  theme: {
    dark: 'Ciemny',
    light: 'Jasny',
    toggle: 'Przełącz motyw',
  },
  auth: {
    loginTitle: 'Zaloguj się',
    loginSubtitle: 'Dziennik Tradera jest dostępny wyłącznie dla zaproszonych użytkowników.',
    emailLabel: 'Adres e-mail',
    passwordLabel: 'Hasło',
    loginButton: 'Zaloguj się',
    forgotPassword: 'Nie pamiętasz hasła?',
    emailRequired: 'Podaj adres e-mail.',
    emailInvalid: 'Podaj prawidłowy adres e-mail.',
    passwordRequired: 'Podaj hasło.',
    passwordTooShort: 'Hasło musi mieć co najmniej 12 znaków.',
    backendNotConnectedTitle: 'Logowanie zostanie podłączone w Kamieniu 2',
    backendNotConnectedDescription:
      'Formularz i walidacja działają już teraz. Prawdziwe uwierzytelnianie przez Supabase Auth podłączymy razem z warstwą danych i synchronizacji.',
    noPublicRegistration: 'Brak publicznej rejestracji — dostęp tylko przez zaproszenie.',
  },
  onboarding: {
    title: 'Konfiguracja konta',
    stepLabel: 'Krok {current} z {total}',
    profileStepTitle: 'Twój profil',
    profileStepDescription: 'Podstawowe ustawienia, które można później zmienić w Ustawieniach.',
    displayNameLabel: 'Jak się do Ciebie zwracać?',
    displayNameRequired: 'Podaj, jak się do Ciebie zwracać.',
    accountNameRequired: 'Podaj nazwę konta.',
    timezoneLabel: 'Strefa czasowa',
    reportingCurrencyLabel: 'Waluta raportowa',
    accountStepTitle: 'Pierwsze konto tradingowe',
    accountStepDescription:
      'Utwórz konto, na którym prowadzisz dziennik. Możesz dodać kolejne później.',
    accountNameLabel: 'Nazwa konta',
    accountNameHint: 'Np. „Live FTMO 100k” albo „Konto demo IC Markets”.',
    accountTypeLabel: 'Typ konta',
    accountCurrencyLabel: 'Waluta konta',
    strategyStepTitle: 'Pierwsza strategia (opcjonalnie)',
    strategyStepDescription:
      'Dziennik Tradera nie zawiera żadnych gotowych strategii ani szablonów. Jeśli chcesz, utwórz teraz własną — możesz to też zrobić później.',
    strategyNameLabel: 'Nazwa strategii',
    skipStrategy: 'Pomiń na razie',
    skipStrategyWarning:
      'Bez strategii nadal możesz zapisywać transakcje jako szkic, ale nie będziesz mógł/mogła przypisać do nich checklisty ani zasad.',
    next: 'Dalej',
    back: 'Wstecz',
    finish: 'Zakończ konfigurację',
    backendNotConnectedDescription:
      'Ten formularz zostanie zapisany do konta po podłączeniu warstwy danych w Kamieniu 2/3.',
  },
  states: {
    dashboardEmptyTitle: 'Zaczynasz od zera',
    dashboardEmptyDescription:
      'Gdy dodasz pierwsze konto i transakcję, zobaczysz tu saldo, krzywą kapitału i podstawowe statystyki.',
    moduleNotBuiltTitle: 'Ten moduł jeszcze nie istnieje',
    moduleNotBuiltDescription:
      'Pojawi się w jednym z kolejnych Kamieni — patrz docs/stan-projektu.md.',
    notFoundTitle: 'Nie znaleziono strony',
    notFoundDescription: 'Sprawdź adres albo wróć do Dashboardu.',
    backToDashboard: 'Wróć do Dashboardu',
  },
} as const;

export type MessageCatalog = typeof pl;
