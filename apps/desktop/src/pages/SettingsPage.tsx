import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Bell, Database, Info, Palette, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useTauriQuery, type TauriQueryState } from "../app/useTauriQuery";
import { useUpdater } from "../app/useUpdater";
import { usePreferences } from "../app/PreferencesProvider";
import type { AppStatus, DatabaseStatus } from "../app/tauriTypes";
import type { Preferences, PreferencesSectionKey } from "../app/types/preferences";
import type { AccountWithBalance } from "../app/types/account";
import type { Interval } from "../app/types/interval";
import { invokeCommand } from "../app/invokeCommand";
import { Button } from "../ui/components/Button/Button";
import { Modal } from "../ui/components/Modal/Modal";
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
  const { state, checkForUpdates, downloadAndInstall, restartNow } = useUpdater();
  const { state: appStatus } = useTauriQuery<AppStatus>("get_app_status");
  const { state: dbStatus } = useTauriQuery<DatabaseStatus>("get_database_status");

  return (
    <div className={styles.cards}>
      <SectionCard>
        <h3 className={styles.cardTitle}>Aktualizacje</h3>
        <p className={styles.cardNote}>
          Sprawdzanie aktualizacji przy starcie i w trakcie działania aplikacji jest zawsze
          aktywne. Adres serwera aktualizacji, klucz podpisu i kanał wydań nie są konfigurowalne -
          to gwarancje bezpieczeństwa, a nie ustawienia.
        </p>

        {(state.kind === "idle" || state.kind === "error") && (
          <div className={styles.row}>
            <span className={styles.note}>
              {state.kind === "error"
                ? `Błąd: ${state.message}`
                : "Sprawdź, czy dostępna jest nowa wersja."}
            </span>
            <Button
              variant="secondary"
              onClick={() => {
                void checkForUpdates();
              }}
            >
              Sprawdź aktualizacje teraz
            </Button>
          </div>
        )}

        {state.kind === "checking" && <p className={styles.note}>Sprawdzanie...</p>}

        {state.kind === "up-to-date" && (
          <div className={styles.row}>
            <span className={styles.note}>Masz najnowszą wersję.</span>
            <Button
              variant="secondary"
              onClick={() => {
                void checkForUpdates();
              }}
            >
              Sprawdź ponownie
            </Button>
          </div>
        )}

        {state.kind === "available" && (
          <div className={styles.updateCard}>
            <p className={styles.updateVersion}>
              Dostępna wersja <strong>{state.update.version}</strong> (obecna:{" "}
              {state.update.currentVersion})
            </p>
            {state.update.body && <p className={styles.updateNotes}>{state.update.body}</p>}
            <Button
              variant="primary"
              onClick={() => {
                void downloadAndInstall();
              }}
            >
              Aktualizuj teraz
            </Button>
          </div>
        )}

        {state.kind === "downloading" && (
          <p className={styles.note}>
            Pobieranie...{state.progress !== null ? ` ${state.progress}%` : ""}
          </p>
        )}

        {state.kind === "ready-to-restart" && (
          <div className={styles.row}>
            <span className={styles.note}>
              Aktualizacja pobrana. Uruchom aplikację ponownie, aby ją zastosować.
            </span>
            <Button
              variant="primary"
              onClick={() => {
                void restartNow();
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
    </div>
  );
}

/** Porównanie „czy sekcja się zmieniła". Oba obiekty pochodzą z tego samego kształtu, więc
 * kolejność kluczy jest identyczna i porównanie tekstowe wystarcza. */
function sectionChanged(
  a: Preferences,
  b: Preferences,
  section: PreferencesSectionKey,
): boolean {
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

  if (loading) {
    return <p className={styles.note}>Wczytywanie ustawień...</p>;
  }

  if (error || !draft) {
    return (
      <SectionCard>
        <p className={styles.note}>Nie udało się wczytać ustawień: {error ?? "brak danych"}.</p>
      </SectionCard>
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
