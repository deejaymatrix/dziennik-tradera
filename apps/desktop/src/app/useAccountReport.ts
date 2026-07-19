import { useEffect, useState } from "react";
import { invokeCommand } from "./invokeCommand";
import type { AccountWithBalance } from "./types/account";
import type { AccountReport } from "./types/report";

export interface UseAccountReportResult {
  accounts: AccountWithBalance[] | null;
  accountsError: string | null;
  reloadAccounts: () => Promise<void>;
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  selectedAccount: AccountWithBalance | null;
  report: AccountReport | null;
  reportError: string | null;
  reloadReport: () => Promise<void>;
}

/**
 * Wspólny przepływ "wybierz konto, pobierz raport (`get_account_report`)" używany przez
 * Dashboard, Kalendarz i Raporty - trzy strony, ten sam kształt danych wejściowych.
 */
export function useAccountReport(): UseAccountReportResult {
  const [accounts, setAccounts] = useState<AccountWithBalance[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [report, setReport] = useState<AccountReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

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

  async function loadReport(accountId: string): Promise<void> {
    setReportError(null);
    try {
      const data = await invokeCommand<AccountReport>("get_account_report", { accountId });
      setReport(data);
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.");
    }
  }

  useEffect(() => {
    // Jednorazowe wczytanie listy kont przy starcie - zamierzona synchronizacja z backendem.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadReport(selectedAccountId);
    } else {
      setReport(null);
    }
  }, [selectedAccountId]);

  return {
    accounts,
    accountsError,
    reloadAccounts: loadAccounts,
    selectedAccountId,
    setSelectedAccountId,
    selectedAccount: accounts?.find((a) => a.id === selectedAccountId) ?? null,
    report,
    reportError,
    reloadReport: () => loadReport(selectedAccountId),
  };
}
