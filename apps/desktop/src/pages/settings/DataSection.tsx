import { useState } from "react";
import type { ReactElement } from "react";
import { Link } from "react-router";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { DataPreferences } from "../../app/types/preferences";
import { Button } from "../../ui/components/Button/Button";
import { SectionCard } from "../../ui/components/SectionCard/SectionCard";
import { Select } from "../../ui/components/Select/Select";
import { useConfirm } from "../../ui/components/ConfirmDialog/ConfirmDialog";
import { useToast } from "../../ui/components/Toast/ToastProvider";
import { SettingRow } from "./SettingRow";
import styles from "./PreferenceSections.module.css";
import maintenance from "./DataSection.module.css";

/** Prefiks kluczy szkiców transakcji w localStorage - patrz `draftStorageKey` w app/tradeForm.ts. */
const DRAFT_KEY_PREFIX = "dziennik-tradera:trade-draft:";

function countStoredDrafts(): number {
  let count = 0;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(DRAFT_KEY_PREFIX)) {
      count += 1;
    }
  }
  return count;
}

function clearStoredDrafts(): number {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(DRAFT_KEY_PREFIX)) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    localStorage.removeItem(key);
  }
  return keys.length;
}

export interface DataSectionProps {
  value: DataPreferences;
  onChange: (next: DataPreferences) => void;
  /** Przywraca domyślne we WSZYSTKICH sekcjach ustawień. Nie dotyka danych dziennika. */
  onResetAllSettings: () => Promise<void>;
}

export function DataSection({
  value,
  onChange,
  onResetAllSettings,
}: DataSectionProps): ReactElement {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof DataPreferences>(key: K, next: DataPreferences[K]): void {
    onChange({ ...value, [key]: next });
  }

  async function handleResetAll(): Promise<void> {
    const ok = await confirm({
      title: "Przywrócić wszystkie ustawienia domyślne?",
      message:
        "Zresetowane zostaną: Wygląd, Zachowanie aplikacji, Domyślne wartości, Powiadomienia oraz Kopie automatyczne.\n\nNIE zostaną ruszone: transakcje, konta, strategie, instrumenty, raporty, załączniki ani kopie bezpieczeństwa.",
      confirmLabel: "Przywróć domyślne",
    });
    if (!ok) {
      return;
    }
    setBusy(true);
    try {
      await onResetAllSettings();
      showToast("Przywrócono domyślne ustawienia aplikacji.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleClearDrafts(): Promise<void> {
    const count = countStoredDrafts();
    if (count === 0) {
      showToast("Nie ma zapisanych szkiców do wyczyszczenia.", "info");
      return;
    }
    const ok = await confirm({
      title: "Wyczyścić zapisane szkice?",
      message: `Usuniętych zostanie ${count} niezapisanych szkiców formularza transakcji.\n\nZapisane transakcje pozostaną nietknięte - szkic to wyłącznie kopia niedokończonego formularza.`,
      confirmLabel: "Wyczyść szkice",
      danger: true,
    });
    if (!ok) {
      return;
    }
    const removed = clearStoredDrafts();
    showToast(`Wyczyszczono ${removed} szkiców.`, "success");
  }

  return (
    <div className={styles.cards}>
      <SectionCard>
        <h3 className={styles.cardTitle}>Kopie automatyczne</h3>
        <p className={styles.cardNote}>
          Niezależnie od tych ustawień kopia powstaje ZAWSZE przed aktualizacją z migracją, przed
          przywróceniem innej kopii i przed dużym importem danych. Każda utworzona kopia jest
          sprawdzana pod kątem integralności. Tego nie da się wyłączyć.
        </p>
        <SettingRow label="Częstotliwość">
          <Select
            label="Częstotliwość"
            compact
            value={value.backup_frequency}
            onChange={(e) =>
              set("backup_frequency", e.target.value as DataPreferences["backup_frequency"])
            }
            options={[
              { value: "daily", label: "Codziennie" },
              { value: "every_three_days", label: "Co 3 dni" },
              { value: "weekly", label: "Co tydzień" },
            ]}
          />
        </SettingRow>
        <SettingRow
          label="Liczba zachowywanych kopii"
          description="Najstarsze kopie ponad ten limit są usuwane automatycznie."
        >
          <Select
            label="Liczba zachowywanych kopii"
            compact
            value={value.backup_retention}
            onChange={(e) =>
              set("backup_retention", e.target.value as DataPreferences["backup_retention"])
            }
            options={[
              { value: "10", label: "10" },
              { value: "30", label: "30" },
              { value: "60", label: "60" },
            ]}
          />
        </SettingRow>
      </SectionCard>

      <SectionCard>
        <h3 className={styles.cardTitle}>Operacje ręczne i stan danych</h3>
        <p className={styles.cardNote}>
          Tworzenie kopii, eksport, import, przywracanie i sprawdzanie integralności mają własną
          zakładkę. Nie dublujemy ich tutaj, żeby istniało jedno miejsce, w którym się to robi.
        </p>
        <Link to="/dane" className={styles.cardNote}>
          <Button variant="secondary">
            Przejdź do zakładki „Dane" <ChevronRight size={16} aria-hidden="true" />
          </Button>
        </Link>
      </SectionCard>

      <SectionCard>
        <button
          type="button"
          className={maintenance.header}
          onClick={() => setMaintenanceOpen((open) => !open)}
          aria-expanded={maintenanceOpen}
        >
          <AlertTriangle size={16} aria-hidden="true" className={maintenance.icon} />
          <span className={maintenance.title}>Strefa konserwacji</span>
          <ChevronRight
            size={16}
            aria-hidden="true"
            className={[maintenance.chevron, maintenanceOpen ? maintenance.chevronOpen : null]
              .filter(Boolean)
              .join(" ")}
          />
        </button>

        {maintenanceOpen && (
          <div className={maintenance.body}>
            <p className={styles.cardNote}>
              Te operacje dotyczą wyłącznie ustawień i szkiców. Usuwanie danych dziennika nie jest
              tu dostępne - opróżnianie kosza ma własną zakładkę.
            </p>
            <SettingRow
              label="Przywróć wszystkie ustawienia domyślne"
              description="Resetuje wszystkie sekcje ustawień. Nie dotyka transakcji, kont, strategii, instrumentów, raportów, załączników ani kopii."
            >
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  void handleResetAll();
                }}
              >
                Przywróć domyślne
              </Button>
            </SettingRow>
            <SettingRow
              label="Wyczyść zapisane szkice"
              description="Usuwa niedokończone szkice formularza transakcji. Zapisane transakcje pozostają nietknięte."
            >
              <Button
                variant="secondary"
                onClick={() => {
                  void handleClearDrafts();
                }}
              >
                Wyczyść szkice
              </Button>
            </SettingRow>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
