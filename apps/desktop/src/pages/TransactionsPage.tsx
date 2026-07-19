import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { ArchiveRestore, Flag, Pencil, Plus, Search, Trash2, TrendingUp } from "lucide-react";
import { formatMoney } from "../app/decimal";
import { invokeCommand } from "../app/invokeCommand";
import type { AccountWithBalance } from "../app/types/account";
import type { Trade, TradeSide, TradeStatus } from "../app/types/trade";
import { TRADE_SIDE_LABELS, TRADE_STATUS_LABELS } from "../app/types/trade";
import { Badge } from "../ui/components/Badge/Badge";
import type { BadgeVariant } from "../ui/components/Badge/Badge";
import { Button } from "../ui/components/Button/Button";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ErrorState } from "../ui/components/ErrorState/ErrorState";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { Select } from "../ui/components/Select/Select";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { Switch } from "../ui/components/Switch/Switch";
import { Table, tableStyles } from "../ui/components/Table/Table";
import { TextField } from "../ui/components/TextField/TextField";
import { useToast } from "../ui/components/Toast/ToastProvider";
import { CloseTradeModal } from "./CloseTradeModal";
import { TradeFormModal } from "./TradeFormModal";
import styles from "./TransactionsPage.module.css";

const STATUS_BADGE_VARIANT: Record<Trade["status"], BadgeVariant> = {
  draft: "neutral",
  open: "info",
  closed: "accent",
};

const STATUS_FILTER_OPTIONS: { value: TradeStatus | ""; label: string }[] = [
  { value: "", label: "Wszystkie statusy" },
  { value: "draft", label: TRADE_STATUS_LABELS.draft },
  { value: "open", label: TRADE_STATUS_LABELS.open },
  { value: "closed", label: TRADE_STATUS_LABELS.closed },
];

const SIDE_FILTER_OPTIONS: { value: TradeSide | ""; label: string }[] = [
  { value: "", label: "Wszystkie kierunki" },
  { value: "buy", label: TRADE_SIDE_LABELS.buy },
  { value: "sell", label: TRADE_SIDE_LABELS.sell },
];

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleString("pl-PL", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function matchesSearch(trade: Trade, search: string): boolean {
  if (!search) {
    return true;
  }
  const needle = search.toLowerCase();
  const haystacks = [
    trade.instrument_spec_snapshot?.display_symbol ?? "",
    trade.strategy_snapshot?.name ?? "",
  ];
  return haystacks.some((text) => text.toLowerCase().includes(needle));
}

export function TransactionsPage(): ReactElement {
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<AccountWithBalance[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TradeStatus | "">("");
  const [sideFilter, setSideFilter] = useState<TradeSide | "">("");
  const [searchText, setSearchText] = useState("");
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [tradesError, setTradesError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | undefined>(undefined);
  const [closingTrade, setClosingTrade] = useState<Trade | null>(null);

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

  async function loadTrades(): Promise<void> {
    if (!selectedAccountId) {
      setTrades(null);
      return;
    }
    setTradesError(null);
    try {
      const data = await invokeCommand<Trade[]>("list_trades", {
        accountId: selectedAccountId,
        includeDeleted,
      });
      setTrades(data);
    } catch (e) {
      setTradesError(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.");
    }
  }

  useEffect(() => {
    // Jednorazowe wczytanie listy kont przy starcie strony - zamierzona synchronizacja z backendem.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAccounts();
  }, []);

  useEffect(() => {
    // Wczytanie transakcji przy zmianie wybranego konta lub filtra kosza - zamierzona synchronizacja.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTrades();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadTrades czyta selectedAccountId/includeDeleted bezpośrednio, to zamierzone wyzwalacze.
  }, [selectedAccountId, includeDeleted]);

  const selectedAccount = accounts?.find((a) => a.id === selectedAccountId) ?? null;

  const filteredTrades =
    trades?.filter(
      (trade) =>
        (statusFilter === "" || trade.status === statusFilter) &&
        (sideFilter === "" || trade.side === sideFilter) &&
        matchesSearch(trade, searchText),
    ) ?? null;

  function openCreateForm(): void {
    setEditingTrade(undefined);
    setFormOpen(true);
  }

  function openEditForm(trade: Trade): void {
    setEditingTrade(trade);
    setFormOpen(true);
  }

  async function handleSoftDelete(trade: Trade): Promise<void> {
    try {
      await invokeCommand("soft_delete_trade", { id: trade.id });
      showToast("Transakcja przeniesiona do kosza.", "success");
      await loadTrades();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    }
  }

  async function handleRestore(trade: Trade): Promise<void> {
    try {
      await invokeCommand("restore_trade", { id: trade.id });
      showToast("Transakcja przywrócona.", "success");
      await loadTrades();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    }
  }

  if (accountsError) {
    return (
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
    );
  }

  if (accounts === null) {
    return <Skeleton height="2.5rem" />;
  }

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp size={32} aria-hidden="true" />}
        title="Brak aktywnych kont"
        description="Żeby zapisywać transakcje, najpierw utwórz konto w zakładce Konta."
      />
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.filters}>
          <Select
            label="Konto"
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))}
          />
          <Select
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TradeStatus | "")}
            options={STATUS_FILTER_OPTIONS}
          />
          <Select
            label="Kierunek"
            value={sideFilter}
            onChange={(e) => setSideFilter(e.target.value as TradeSide | "")}
            options={SIDE_FILTER_OPTIONS}
          />
          <TextField
            label="Szukaj"
            icon={<Search size={16} />}
            placeholder="Instrument, strategia, tag..."
            className={styles.searchInput}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Switch
            label="Pokaż kosz"
            checked={includeDeleted}
            onChange={(e) => setIncludeDeleted(e.target.checked)}
          />
        </div>
        <Button variant="primary" onClick={openCreateForm} disabled={!selectedAccount}>
          <Plus size={16} aria-hidden="true" /> Dodaj transakcję
        </Button>
      </div>

      {tradesError && (
        <ErrorState
          title="Nie udało się wczytać transakcji"
          description={tradesError}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void loadTrades();
              }}
            >
              Spróbuj ponownie
            </Button>
          }
        />
      )}

      {!tradesError && filteredTrades === null && <Skeleton height="2.5rem" />}

      {!tradesError && filteredTrades !== null && trades !== null && trades.length === 0 && (
        <EmptyState
          icon={<TrendingUp size={32} aria-hidden="true" />}
          title="Brak transakcji"
          description="To konto nie ma jeszcze żadnych zapisanych transakcji."
          action={
            <Button variant="primary" onClick={openCreateForm}>
              Dodaj transakcję
            </Button>
          }
        />
      )}

      {!tradesError && trades !== null && trades.length > 0 && filteredTrades?.length === 0 && (
        <EmptyState
          icon={<TrendingUp size={32} aria-hidden="true" />}
          title="Brak transakcji spełniających filtry"
          description="Zmień lub wyczyść filtry, żeby zobaczyć więcej transakcji."
        />
      )}

      {!tradesError && filteredTrades !== null && filteredTrades.length > 0 && selectedAccount && (
        <Table>
          <thead>
            <tr>
              <th>#</th>
              <th>Instrument</th>
              <th>Strategia</th>
              <th>Kierunek</th>
              <th>Status</th>
              <th>Otwarcie</th>
              <th>Zamknięcie</th>
              <th className={tableStyles.numeric}>Wolumen</th>
              <th className={tableStyles.numeric}>Wynik netto</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {filteredTrades.map((trade) => {
              const netPnl = trade.net_pnl !== null ? Number(trade.net_pnl) : null;
              return (
                <tr key={trade.id}>
                  <td>{trade.display_number}</td>
                  <td>{trade.instrument_spec_snapshot?.display_symbol ?? "—"}</td>
                  <td>{trade.strategy_snapshot?.name ?? "—"}</td>
                  <td>
                    <Badge variant={trade.side === "buy" ? "profit" : "loss"}>
                      {TRADE_SIDE_LABELS[trade.side]}
                    </Badge>
                  </td>
                  <td>
                    <Badge variant={STATUS_BADGE_VARIANT[trade.status]}>
                      {TRADE_STATUS_LABELS[trade.status]}
                    </Badge>
                    {trade.deleted_at && <span className={styles.trashHint}> (w koszu)</span>}
                  </td>
                  <td>{formatDateTime(trade.opened_at)}</td>
                  <td>{formatDateTime(trade.closed_at)}</td>
                  <td className={tableStyles.numeric}>{trade.volume ?? "—"}</td>
                  <td
                    className={[
                      tableStyles.numeric,
                      netPnl !== null && (netPnl >= 0 ? styles.profit : styles.loss),
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {trade.net_pnl !== null
                      ? formatMoney(trade.net_pnl, selectedAccount.currency)
                      : "—"}
                  </td>
                  <td>
                    <div className={tableStyles.actions}>
                      <IconButton
                        icon={<Pencil size={16} />}
                        aria-label={`Edytuj transakcję #${trade.display_number}`}
                        onClick={() => openEditForm(trade)}
                        disabled={Boolean(trade.deleted_at)}
                      />
                      {trade.status === "open" && !trade.deleted_at && (
                        <IconButton
                          icon={<Flag size={16} />}
                          aria-label={`Zamknij pozycję #${trade.display_number}`}
                          onClick={() => setClosingTrade(trade)}
                        />
                      )}
                      {trade.deleted_at ? (
                        <IconButton
                          icon={<ArchiveRestore size={16} />}
                          aria-label={`Przywróć transakcję #${trade.display_number}`}
                          onClick={() => {
                            void handleRestore(trade);
                          }}
                        />
                      ) : (
                        <IconButton
                          icon={<Trash2 size={16} />}
                          aria-label={`Usuń transakcję #${trade.display_number}`}
                          onClick={() => {
                            void handleSoftDelete(trade);
                          }}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {selectedAccount && (
        <TradeFormModal
          key={formOpen ? (editingTrade?.id ?? "new") : "closed"}
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            void loadTrades();
          }}
          accountId={selectedAccount.id}
          accountCurrency={selectedAccount.currency}
          trade={editingTrade}
        />
      )}
      {selectedAccount && (
        <CloseTradeModal
          key={closingTrade?.id ?? "closed"}
          open={closingTrade !== null}
          onClose={() => setClosingTrade(null)}
          onClosed={() => {
            void loadTrades();
          }}
          trade={closingTrade}
          accountCurrency={selectedAccount.currency}
        />
      )}
    </div>
  );
}
