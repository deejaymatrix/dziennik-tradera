import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Archive, Database, FileSpreadsheet, FileText, Table2, Upload } from "lucide-react";
import { invokeCommand } from "../app/invokeCommand";
import type { AccountWithBalance } from "../app/types/account";
import type { BackupManifest } from "../app/types/backup";
import { Button } from "../ui/components/Button/Button";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ErrorState } from "../ui/components/ErrorState/ErrorState";
import { Select } from "../ui/components/Select/Select";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { useConfirm } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { useToast } from "../ui/components/Toast/ToastProvider";
import { exportTrades } from "../app/exportTrades";
import styles from "./DataPage.module.css";

function formatManifestDate(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" });
}

export function DataPage(): ReactElement {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [accounts, setAccounts] = useState<AccountWithBalance[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");

  const [exporting, setExporting] = useState<"csv" | "xlsx" | "pdf" | null>(null);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restorePrepared, setRestorePrepared] = useState<BackupManifest | null>(null);

  async function loadAccounts(): Promise<void> {
    setAccountsError(null);
    try {
      const data = await invokeCommand<AccountWithBalance[]>("list_accounts", {
        includeArchived: false,
      });
      setAccounts(data);
      setSelectedAccountId((current) => current || (data[0]?.id ?? ""));
    } catch (e) {
      setAccountsError(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.");
    }
  }

  useEffect(() => {
    // Jednorazowe wczytanie listy kont przy starcie strony - zamierzona synchronizacja z backendem.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAccounts();
  }, []);

  const selectedAccount = accounts?.find((a) => a.id === selectedAccountId) ?? null;

  async function handleExport(format: "csv" | "xlsx" | "pdf"): Promise<void> {
    if (!selectedAccount) {
      return;
    }
    setExporting(format);
    try {
      // Ekran "Dane" eksportuje CAŁE konto - bez zawężenia, w odróżnieniu od Raportów.
      const zapisano = await exportTrades({
        accountId: selectedAccount.id,
        accountName: selectedAccount.name,
        format,
      });
      if (zapisano) {
        showToast(`Eksport ${format.toUpperCase()} zapisany.`, "success");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Wystąpił nieoczekiwany błąd.", "error");
    } finally {
      setExporting(null);
    }
  }

  async function handleCreateBackup(): Promise<void> {
    setCreatingBackup(true);
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const today = new Date().toISOString().slice(0, 10);
      const destination = await save({
        defaultPath: `dziennik-tradera-kopia-${today}.dtjbackup`,
        filters: [{ name: "Kopia zapasowa Dziennika Tradera", extensions: ["dtjbackup"] }],
      });
      if (!destination) {
        return;
      }
      const manifest = await invokeCommand<BackupManifest>("create_backup", {
        destinationPath: destination,
      });
      showToast(
        `Kopia zapasowa utworzona (${formatManifestDate(manifest.created_at)}).`,
        "success",
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Wystąpił nieoczekiwany błąd.", "error");
    } finally {
      setCreatingBackup(false);
    }
  }

  async function handleRestoreBackup(): Promise<void> {
    setRestoring(true);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const archivePath = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Kopia zapasowa Dziennika Tradera", extensions: ["dtjbackup"] }],
      });
      if (!archivePath || Array.isArray(archivePath)) {
        return;
      }
      const confirmed = await confirm({
        message:
          "Przywrócenie kopii zapasowej ZASTĄPI wszystkie obecne dane w aplikacji (konta, " +
          "transakcje, strategie, instrumenty). Aktualna baza zostanie najpierw automatycznie " +
          "zapisana jako kopia bezpieczeństwa, ale zmiana zacznie obowiązywać dopiero po " +
          "ponownym uruchomieniu aplikacji.\n\nCzy na pewno chcesz kontynuować?",
        danger: true,
        confirmLabel: "Przywróć",
      });
      if (!confirmed) {
        return;
      }
      const manifest = await invokeCommand<BackupManifest>("prepare_backup_restore", {
        archivePath,
      });
      setRestorePrepared(manifest);
      showToast("Przywrócenie przygotowane - zamknij i uruchom aplikację ponownie.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Wystąpił nieoczekiwany błąd.", "error");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className={styles.page}>
      {restorePrepared && (
        <div className={styles.restoreBanner} role="alert">
          <strong>Przywrócenie przygotowane.</strong> Kopia z{" "}
          {formatManifestDate(restorePrepared.created_at)} zostanie zastosowana po zamknięciu i
          ponownym uruchomieniu aplikacji.
        </div>
      )}

      {accountsError && (
        <ErrorState
          title="Nie udało się wczytać kont"
          description={accountsError}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void loadAccounts();
              }}
            >
              Spróbuj ponownie
            </Button>
          }
        />
      )}

      {!accountsError && accounts === null && <Skeleton height="2.5rem" />}

      {!accountsError && accounts !== null && accounts.length === 0 && (
        <EmptyState
          icon={<Database size={32} aria-hidden="true" />}
          title="Brak aktywnych kont"
          description="Eksport transakcji wymaga konta z zapisaną historią. Kopię zapasową całej bazy możesz utworzyć niezależnie od kont poniżej."
        />
      )}

      {!accountsError && accounts !== null && accounts.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Eksport transakcji</h2>
          <p className={styles.sectionDescription}>
            Pełne dane transakcji wybranego konta w formacie CSV/XLSX (do dalszej analizy) lub
            zwięzły raport PDF (podsumowanie + tabela).
          </p>
          <Select
            label="Konto"
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))}
          />
          <div className={styles.buttonRow}>
            <Button
              variant="secondary"
              onClick={() => {
                void handleExport("csv");
              }}
              disabled={exporting !== null}
              loading={exporting === "csv"}
            >
              <Table2 size={16} aria-hidden="true" />
              Eksportuj CSV
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void handleExport("xlsx");
              }}
              disabled={exporting !== null}
              loading={exporting === "xlsx"}
            >
              <FileSpreadsheet size={16} aria-hidden="true" />
              Eksportuj XLSX
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void handleExport("pdf");
              }}
              disabled={exporting !== null}
              loading={exporting === "pdf"}
            >
              <FileText size={16} aria-hidden="true" />
              Eksportuj PDF
            </Button>
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Kopia zapasowa</h2>
        <p className={styles.sectionDescription}>
          Pełna, zweryfikowana kopia całej bazy danych (wszystkie konta, transakcje, strategie i
          instrumenty) w jednym pliku <code>.dtjbackup</code>. Zapisz go w bezpiecznym miejscu (np.
          na dysku zewnętrznym) - aplikacja nie wysyła kopii nigdzie automatycznie.
        </p>
        <div className={styles.buttonRow}>
          <Button
            variant="primary"
            onClick={() => {
              void handleCreateBackup();
            }}
            disabled={creatingBackup}
            loading={creatingBackup}
          >
            <Archive size={16} aria-hidden="true" />
            Utwórz kopię zapasową
          </Button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Przywracanie</h2>
        <p className={styles.sectionDescription}>
          Przywrócenie z pliku <code>.dtjbackup</code> zastępuje WSZYSTKIE obecne dane. Plik jest w
          pełni weryfikowany (suma kontrolna i integralność bazy) przed zastosowaniem, a aktualna
          baza jest automatycznie zapisywana jako kopia bezpieczeństwa. Zmiana wymaga ponownego
          uruchomienia aplikacji.
        </p>
        <div className={styles.buttonRow}>
          <Button
            variant="secondary"
            onClick={() => {
              void handleRestoreBackup();
            }}
            disabled={restoring}
            loading={restoring}
          >
            <Upload size={16} aria-hidden="true" />
            Wybierz plik kopii i przywróć
          </Button>
        </div>
      </section>
    </div>
  );
}
