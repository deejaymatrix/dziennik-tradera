import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Bell, Database, Info, Palette, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useTauriQuery, type TauriQueryState } from "../app/useTauriQuery";
import { useUpdateMonitor } from "../app/UpdateMonitorProvider";
import { usePreferences } from "../app/PreferencesProvider";
import type { AppStatus, DatabaseStatus } from "../app/tauriTypes";
import type { Preferences, PreferencesSectionKey } from "../app/types/preferences";
import type { AccountWithBalance } from "../app/types/account";
import type { Interval } from "../app/types/interval";
import { invokeCommand } from "../app/invokeCommand";
import { Button } from "../ui/components/Button/Button";
import { Modal } from "../ui/components/Modal/Modal";
import { ErrorState } from "../ui/components/ErrorState/ErrorState";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { SectionCard } from "../ui/components/SectionCard/SectionCard";
import { useToast } from "../ui/components/Toast/ToastProvider";
import {
  AppearanceSection,
  BehaviorSection,
  DefaultsSection,
  NotificationsSection,
} from "./settings/PreferenceSections";
import { DataSection } from "./settings/DataSection";
import styles from "./SettingsPage.module.css";

const ENV_LABELS: Record<string, string> = {
  development: "Deweloperskie",
  production: "Produkcyjne",
};

/** Klucz sekcji widocznej w menu. `updates` nie jest sekcją preferencji - nie ma tam nic do
 * zapisania, to widok wyłącznie informacyjny, więc nie dostaje paska zapisu. */
type SectionKey = PreferencesSectionKey | "updates";

const SECTIONS: {
  key: SectionKey;
  label: string;
  description: string;
  icon: typeof Palette;
}[] = [
  {
    key: "appearance",
    label: "Wygląd",
    description: "Motyw, kolor akcentu, rozmiar interfejsu i nawigacja.",
    icon: Palette,
  },
  {
    key: "behavior",
    label: "Zachowanie aplikacji",
    description: "Uruchamianie, formularze i potwierdzenia.",
    icon: SlidersHorizontal,
  },
  {
    key: "defaults",
    label: "Domyślne wartości",
    description: "Wartości startowe nowej transakcji, kalkulatora i raportów.",
    icon: RotateCcw,
  },
  {
    key: "notifications",
    label: "Powiadomienia",
    description: "Powiadomienia systemowe, przypomnienia i ciche godziny.",
    icon: Bell,
  },
  {
    key: "data",
    label: "Dane i kopie bezpieczeństwa",
    description: "Kopie automatyczne i strefa konserwacji.",
    icon: Database,
  },
  {
    key: "updates",
    label: "Aktualizacje i informacje",
    description: "Wersja aplikacji, aktualizacje i diagnostyka.",
    icon: Info,
  },
];

/** Wyszukiwanie sekcji po kluczu bez sięgania po indeks tablicy - `active` jest typu
 * `SectionKey`, a każdy taki klucz na pewno w `SECTIONS` istnieje. */
const SECTION_BY_KEY = Object.fromEntries(SECTIONS.map((s) => [s.key, s])) as Record<
  SectionKey,
  (typeof SECTIONS)[number]
>;

function renderAppStatus(state: TauriQueryState<AppStatus>): string {
  switch (state.kind) {
    case "loading":
      return "Sprawdzanie...";
    case "ready":
      return `połączony (wersja ${state.data.version}, ${ENV_LABELS[state.data.env] ?? state.data.env})`;
    case "error":
      return `niedostępny — ${state.message}`;
  }
}

function renderDatabaseStatus(state: TauriQueryState<DatabaseStatus>): string {
  if (state.kind === "loading") {
    return "Sprawdzanie...";
  }
  if (state.kind === "error") {
    return `nie można sprawdzić — ${state.message}`;
  }
  const db = state.data;
  if (db.status === "failed") {
    return `NIEDOSTĘPNA — ${db.reason}`;
  }
  return db.integrity_ok
    ? `otwarta, integralność OK (${db.path})`
    : `otwarta, ALE kontrola integralności nie powiodła się (${db.path})`;
}

function UpdatesInfoSection(): ReactElement {
  // Ustawienia NIE mają własnego hooka aktualizacji - czytają stan z jednego centralnego
  // serwisu. Dwa niezależne źródła pokazywałyby użytkownikowi sprzeczne odpowiedzi
  // („masz najnowszą wersję" obok znacznika dostępnej aktualizacji).
  const {
    stan,
    znacznikDostepnej,
    dostepnaWersja,
    sprawdzTeraz,
    pobierzIZainstaluj,
    uruchomPonownie,
  } = useUpdateMonitor();
  const { state: appStatus } = useTauriQuery<AppStatus>("get_app_status");
  const { state: dbStatus } = useTauriQuery<DatabaseStatus>("get_database_status");
  const { showToast } = useToast();
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);

  async function copyDiagnostics(): Promise<void> {
    setDiagnosticsBusy(true);
    try {
      const report = await invokeCommand<string>("get_diagnostic_report");
      await navigator.clipboard.writeText(report);
      showToast("Skopiowano informacje diagnostyczne do schowka.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setDiagnosticsBusy(false);
    }
  }

  async function exportDiagnostics(): Promise<void> {
    setDiagnosticsBusy(true);
    try {
      const report = await invokeCommand<string>("get_diagnostic_report");
      // Zapis przez pobranie pliku z przeglądarki - nie potrzeba do tego osobnej komendy
      // ani dostępu do systemu plików z backendu.
      const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `dziennik-tradera-diagnostyka-${new Date().toISOString().slice(0, 10)}.txt`;
      link.click();
      URL.revokeObjectURL(url);
      showToast("Raport diagnostyczny zapisany.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setDiagnosticsBusy(false);
    }
  }

  return (
    <div className={styles.cards}>
      <SectionCard>
        <h3 className={styles.cardTitle}>Aktualizacje</h3>
        <p className={styles.cardNote}>
          Sprawdzanie aktualizacji przy starcie i w trakcie działania aplikacji jest zawsze aktywne.
          Adres serwera aktualizacji, klucz podpisu i kanał wydań nie są konfigurowalne - to
          gwarancje bezpieczeństwa, a nie ustawienia.
        </p>

        {(stan.rodzaj === "bezczynny" || stan.rodzaj === "blad") && (
          <div className={styles.row}>
            <span className={styles.note}>
              {stan.rodzaj === "blad"
                ? stan.komunikat
                : znacznikDostepnej && dostepnaWersja !== null
                  ? `Dostępna jest wersja ${dostepnaWersja}.`
                  : "Sprawdź, czy dostępna jest nowa wersja."}
            </span>
            <Button
              variant="secondary"
              onClick={() => {
                void sprawdzTeraz();
              }}
            >
              Sprawdź aktualizacje teraz
            </Button>
          </div>
        )}

        {stan.rodzaj === "sprawdzanie" && <p className={styles.note}>Sprawdzanie...</p>}

        {stan.rodzaj === "aktualna" && (
          <div className={styles.row}>
            <span className={styles.note}>Masz najnowszą wersję.</span>
            <Button
              variant="secondary"
              onClick={() => {
                void sprawdzTeraz();
              }}
            >
              Sprawdź ponownie
            </Button>
          </div>
        )}

        {stan.rodzaj === "dostepna" && (
          <div className={styles.updateCard}>
            <p className={styles.updateVersion}>
              Dostępna wersja <strong>{stan.update.version}</strong> (obecna:{" "}
              {stan.update.currentVersion})
            </p>
            {stan.update.body && <p className={styles.updateNotes}>{stan.update.body}</p>}
            <Button
              variant="primary"
              onClick={() => {
                void pobierzIZainstaluj();
              }}
            >
              Aktualizuj teraz
            </Button>
          </div>
        )}

        {stan.rodzaj === "pobieranie" && (
          <p className={styles.note}>
            Pobieranie...{stan.postep !== null ? ` ${stan.postep}%` : ""}
          </p>
        )}

        {stan.rodzaj === "gotowa-do-restartu" && (
          <div className={styles.row}>
            <span className={styles.note}>
              Aktualizacja pobrana. Uruchom aplikację ponownie, aby ją zastosować.
            </span>
            <Button
              variant="primary"
              onClick={() => {
                void uruchomPonownie();
              }}
            >
              Uruchom ponownie
            </Button>
          </div>
        )}
      </SectionCard>

      <SectionCard>
        <h3 className={styles.cardTitle}>Informacje o aplikacji</h3>
        <dl className={styles.statusList}>
          <dt>Backend Rust</dt>
          <dd>{renderAppStatus(appStatus)}</dd>
          <dt>Baza danych</dt>
          <dd>{renderDatabaseStatus(dbStatus)}</dd>
          <dt>Dane dziennika</dt>
          <dd>Przechowywane wyłącznie lokalnie, na tym komputerze.</dd>
          <dt>Połączenie z internetem</dt>
          <dd>Używane wyłącznie do sprawdzania i pobierania aktualizacji.</dd>
        </dl>
      </SectionCard>

      <SectionCard>
        <h3 className={styles.cardTitle}>Diagnostyka użytkownika</h3>
        <p className={styles.cardNote}>
          Raport zawiera wyłącznie: wersję aplikacji, system i architekturę, wersję schematu bazy,
          status migracji oraz techniczne wpisy diagnostyczne z podmienioną nazwą użytkownika. Nie
          ma w nim transakcji, notatek, emocji, danych kont, załączników ani żadnych kluczy.
        </p>
        <div className={styles.row}>
          <Button
            variant="secondary"
            disabled={diagnosticsBusy}
            onClick={() => {
              void copyDiagnostics();
            }}
          >
            Skopiuj informacje diagnostyczne
          </Button>
          <Button
            variant="secondary"
            disabled={diagnosticsBusy}
            onClick={() => {
              void exportDiagnostics();
            }}
          >
            Eksportuj raport diagnostyczny
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

/** Porównanie „czy sekcja się zmieniła". Oba obiekty pochodzą z tego samego kształtu, więc
 * kolejność kluczy jest identyczna i porównanie tekstowe wystarcza. */
function sectionChanged(a: Preferences, b: Preferences, section: PreferencesSectionKey): boolean {
  return JSON.stringify(a[section]) !== JSON.stringify(b[section]);
}

export function SettingsPage(): ReactElement {
  const { preferences, loading, error, saveSection, resetSection, previewAppearance } =
    usePreferences();
  const { showToast } = useToast();

  const [active, setActive] = useState<SectionKey>("appearance");
  const [draft, setDraft] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Sekcja, do której użytkownik chce przejść, mając niezapisane zmiany. */
  const [pendingSection, setPendingSection] = useState<SectionKey | null>(null);

  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [intervals, setIntervals] = useState<Interval[]>([]);

  // Synchronizacja szkicu z tym, co przyszło z backendu, robiona PODCZAS RENDEROWANIA, a nie
  // w efekcie - to zalecany przez Reacta sposób dostosowania stanu do zmiany danych wejściowych.
  // W efekcie wywołałoby to kaskadę renderów (i słusznie zgłasza to lint).
  const [baseline, setBaseline] = useState<Preferences | null>(null);
  if (preferences !== baseline) {
    setBaseline(preferences);
    setDraft(preferences);
  }

  // Listy potrzebne wyłącznie sekcji "Domyślne wartości" (wybór konta i interwału).
  useEffect(() => {
    void (async () => {
      try {
        setAccounts(await invokeCommand<AccountWithBalance[]>("list_accounts"));
        setIntervals(await invokeCommand<Interval[]>("list_intervals", { includeArchived: false }));
      } catch {
        // Brak list nie może wywrócić całych ustawień - selecty pokażą wtedy same opcje stałe.
      }
    })();
  }, []);

  const activeSection = SECTION_BY_KEY[active];
  const isPreferenceSection = active !== "updates";
  const dirty =
    isPreferenceSection && draft !== null && preferences !== null
      ? sectionChanged(draft, preferences, active)
      : false;

  function requestSection(next: SectionKey): void {
    if (next === active) {
      return;
    }
    if (dirty) {
      setPendingSection(next);
      return;
    }
    // Wyjście z sekcji bez zmian nie ma czego podglądać - podgląd i tak zdejmujemy, żeby nie
    // został po nim wygląd niezgodny z zapisanym stanem.
    previewAppearance(null);
    setSaveError(null);
    setActive(next);
  }

  async function handleSave(section: PreferencesSectionKey): Promise<boolean> {
    if (!draft) {
      return false;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await saveSection(section, draft);
      showToast("Zapisano ustawienia.", "success");
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setSaveError(message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  function handleCancel(): void {
    if (preferences) {
      setDraft(preferences);
    }
    // Zdjęcie podglądu przywraca wygląd zapisany w bazie.
    previewAppearance(null);
    setSaveError(null);
  }

  async function handleResetSection(section: PreferencesSectionKey): Promise<void> {
    setSaving(true);
    setSaveError(null);
    try {
      await resetSection(section);
      showToast("Przywrócono domyślne ustawienia sekcji.", "success");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleResetAllSections(): Promise<void> {
    for (const section of [
      "appearance",
      "behavior",
      "defaults",
      "notifications",
      "data",
    ] as PreferencesSectionKey[]) {
      await resetSection(section);
    }
  }

  // Ładowanie i błąd korzystają z tych samych komponentów co reszta aplikacji - wcześniej
  // Ustawienia miały własne akapity, więc ten sam rodzaj sytuacji wyglądał tu inaczej niż
  // na każdym innym ekranie.
  if (loading) {
    return <Skeleton height="12rem" />;
  }

  if (error || !draft) {
    return (
      <ErrorState
        title="Nie udało się wczytać ustawień"
        description={error ?? "Brak danych ustawień."}
        action={
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Odśwież
          </Button>
        }
      />
    );
  }

  return (
    <div className={styles.page}>
      <nav className={styles.menu} aria-label="Sekcje ustawień">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = section.key === active;
          return (
            <button
              key={section.key}
              type="button"
              className={[styles.menuItem, isActive ? styles.menuItemActive : null]
                .filter(Boolean)
                .join(" ")}
              aria-current={isActive ? "page" : undefined}
              onClick={() => requestSection(section.key)}
            >
              <Icon size={16} aria-hidden="true" className={styles.menuIcon} />
              <span className={styles.menuLabel}>{section.label}</span>
            </button>
          );
        })}
      </nav>

      <div className={styles.content}>
        <header className={styles.header}>
          <h2 className={styles.title}>{activeSection.label}</h2>
          <p className={styles.subtitle}>{activeSection.description}</p>
        </header>

        {active === "appearance" && (
          <AppearanceSection
            value={draft.appearance}
            onChange={(appearance) => {
              setDraft({ ...draft, appearance });
              // Podgląd na żywo - zmiana widoczna od razu w całej aplikacji, ale trwała dopiero
              // po zapisaniu. „Anuluj" i wyjście z sekcji ją zdejmują.
              previewAppearance(appearance);
            }}
          />
        )}
        {active === "behavior" && (
          <BehaviorSection
            value={draft.behavior}
            onChange={(behavior) => setDraft({ ...draft, behavior })}
          />
        )}
        {active === "defaults" && (
          <DefaultsSection
            value={draft.defaults}
            onChange={(defaults) => setDraft({ ...draft, defaults })}
            accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
            intervals={intervals.map((i) => ({ id: i.id, label: i.label }))}
          />
        )}
        {active === "notifications" && (
          <NotificationsSection
            value={draft.notifications}
            onChange={(notifications) => setDraft({ ...draft, notifications })}
          />
        )}
        {active === "data" && (
          <DataSection
            value={draft.data}
            onChange={(data) => setDraft({ ...draft, data })}
            onResetAllSettings={handleResetAllSections}
          />
        )}
        {active === "updates" && <UpdatesInfoSection />}

        {saveError && (
          <p className={styles.error} role="alert">
            {saveError}
          </p>
        )}

        {isPreferenceSection && (
          <div className={styles.saveBar}>
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => {
                void handleResetSection(active);
              }}
            >
              Przywróć domyślne
            </Button>
            <div className={styles.saveBarActions}>
              <Button variant="secondary" disabled={!dirty || saving} onClick={handleCancel}>
                Anuluj
              </Button>
              <Button
                variant="primary"
                disabled={!dirty || saving}
                onClick={() => {
                  void handleSave(active);
                }}
              >
                {saving ? "Zapisywanie..." : "Zapisz zmiany"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={pendingSection !== null}
        title="Niezapisane zmiany"
        onClose={() => setPendingSection(null)}
      >
        <p className={styles.note}>
          W sekcji „{activeSection.label}" są zmiany, których jeszcze nie zapisano.
        </p>
        <div className={styles.dialogActions}>
          <Button variant="secondary" onClick={() => setPendingSection(null)}>
            Zostań
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              handleCancel();
              if (pendingSection) {
                setActive(pendingSection);
              }
              setPendingSection(null);
            }}
          >
            Odrzuć
          </Button>
          <Button
            variant="primary"
            disabled={saving}
            onClick={() => {
              void (async () => {
                if (!isPreferenceSection) {
                  return;
                }
                const saved = await handleSave(active);
                if (saved && pendingSection) {
                  setActive(pendingSection);
                  setPendingSection(null);
                }
              })();
            }}
          >
            Zapisz
          </Button>
        </div>
      </Modal>
    </div>
  );
}
