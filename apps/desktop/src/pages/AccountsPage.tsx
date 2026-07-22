import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Archive, ArchiveRestore, ArrowLeftRight, Pencil, Plus, Wallet2 } from "lucide-react";
import { formatMoney } from "../app/decimal";
import { invokeCommand } from "../app/invokeCommand";
import type { AccountWithBalance } from "../app/types/account";
import { Badge } from "../ui/components/Badge/Badge";
import { Button } from "../ui/components/Button/Button";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ErrorState } from "../ui/components/ErrorState/ErrorState";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { Switch } from "../ui/components/Switch/Switch";
import { Table, tableStyles } from "../ui/components/Table/Table";
import { useToast } from "../ui/components/Toast/ToastProvider";
import { AccountDetailsModal } from "./AccountDetailsModal";
import { AccountFormModal } from "./AccountFormModal";
import { CashOperationsModal } from "./CashOperationsModal";
import styles from "./AccountsPage.module.css";

export function AccountsPage(): ReactElement {
  const { showToast } = useToast();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [accounts, setAccounts] = useState<AccountWithBalance[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountWithBalance | undefined>(undefined);
  const [operationsAccount, setOperationsAccount] = useState<AccountWithBalance | null>(null);
  const [detailsAccount, setDetailsAccount] = useState<AccountWithBalance | null>(null);

  async function load(): Promise<AccountWithBalance[] | null> {
    setError(null);
    try {
      const data = await invokeCommand<AccountWithBalance[]>("list_accounts", { includeArchived });
      setAccounts(data);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.");
      return null;
    }
  }

  useEffect(() => {
    // Wczytanie listy przy starcie i przy zmianie filtra jest zamierzonym efektem
    // ubocznym (synchronizacja z backendem Tauri), nie renderowaniem pochodnym stanu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load reads includeArchived directly, this is the intended trigger.
  }, [includeArchived]);

  function openCreateForm(): void {
    setEditingAccount(undefined);
    setFormOpen(true);
  }

  function openEditForm(account: AccountWithBalance): void {
    setEditingAccount(account);
    setFormOpen(true);
  }

  async function handleArchive(account: AccountWithBalance): Promise<void> {
    try {
      await invokeCommand("archive_account", { id: account.id });
      showToast("Konto zarchiwizowane.", "success");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    }
  }

  async function handleRestore(account: AccountWithBalance): Promise<void> {
    try {
      await invokeCommand("restore_account", { id: account.id });
      showToast("Konto przywrócone.", "success");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    }
  }

  async function handleOperationAdded(): Promise<void> {
    const data = await load();
    if (data && operationsAccount) {
      const updated = data.find((a) => a.id === operationsAccount.id);
      if (updated) {
        setOperationsAccount(updated);
      }
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.filters}>
          <Switch
            label="Pokaż zarchiwizowane"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
        </div>
        <Button variant="primary" onClick={openCreateForm}>
          <Plus size={16} aria-hidden="true" /> Dodaj konto
        </Button>
      </div>

      {error && (
        <ErrorState
          title="Nie udało się wczytać kont"
          description={error}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void load();
              }}
            >
              Spróbuj ponownie
            </Button>
          }
        />
      )}

      {!error && accounts === null && <Skeleton height="2.5rem" />}

      {!error && accounts !== null && accounts.length === 0 && (
        <EmptyState
          icon={<Wallet2 size={32} aria-hidden="true" />}
          title="Brak kont"
          description="Utwórz pierwsze konto, żeby zacząć zapisywać transakcje."
          action={
            <Button variant="primary" onClick={openCreateForm}>
              Utwórz konto
            </Button>
          }
        />
      )}

      {!error && accounts !== null && accounts.length > 0 && (
        <Table>
          <thead>
            <tr>
              <th>Nazwa</th>
              <th>Waluta</th>
              <th className={tableStyles.numeric}>Saldo</th>
              <th>Status</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td>
                  <button
                    type="button"
                    className={styles.nameButton}
                    onClick={() => setDetailsAccount(account)}
                  >
                    <span className={styles.nameCell}>
                      {account.name}
                      {account.account_type && <span>{account.account_type}</span>}
                    </span>
                  </button>
                </td>
                <td>{account.currency}</td>
                <td className={tableStyles.numeric}>
                  {formatMoney(account.balance, account.currency)}
                </td>
                <td>
                  {account.archived_at ? (
                    <Badge variant="neutral">Zarchiwizowane</Badge>
                  ) : (
                    <Badge variant="profit">Aktywne</Badge>
                  )}
                </td>
                <td>
                  <div className={tableStyles.actions}>
                    <IconButton
                      icon={<ArrowLeftRight size={16} />}
                      aria-label={`Operacje finansowe - ${account.name}`}
                      onClick={() => setOperationsAccount(account)}
                    />
                    <IconButton
                      icon={<Pencil size={16} />}
                      aria-label={`Edytuj ${account.name}`}
                      onClick={() => openEditForm(account)}
                    />
                    {account.archived_at ? (
                      <IconButton
                        icon={<ArchiveRestore size={16} />}
                        aria-label={`Przywróć ${account.name}`}
                        onClick={() => {
                          void handleRestore(account);
                        }}
                      />
                    ) : (
                      <IconButton
                        icon={<Archive size={16} />}
                        aria-label={`Archiwizuj ${account.name}`}
                        onClick={() => {
                          void handleArchive(account);
                        }}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <AccountFormModal
        key={`form-${formOpen ? (editingAccount?.id ?? "new") : "closed"}`}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          void load();
        }}
        account={editingAccount}
      />
      {detailsAccount && (
        <AccountDetailsModal
          key={`details-${detailsAccount.id}`}
          account={detailsAccount}
          onClose={() => setDetailsAccount(null)}
          onEdit={() => {
            const account = detailsAccount;
            setDetailsAccount(null);
            openEditForm(account);
          }}
          onChanged={() => {
            void load();
          }}
        />
      )}
      <CashOperationsModal
        key={`ops-${operationsAccount?.id ?? "closed"}`}
        open={operationsAccount !== null}
        onClose={() => setOperationsAccount(null)}
        account={operationsAccount}
        onOperationAdded={() => {
          void handleOperationAdded();
        }}
      />
    </div>
  );
}
