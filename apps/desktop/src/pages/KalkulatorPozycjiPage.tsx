import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { Calculator, Copy } from "lucide-react";
import { normalizeDecimalInput } from "../app/decimal";
import { usePreferences } from "../app/PreferencesProvider";
import { invokeCommand } from "../app/invokeCommand";
import type { AccountWithBalance } from "../app/types/account";
import type { BrokerTemplate, InstrumentWithDetails } from "../app/types/instrument";
import type { TradeSide } from "../app/types/trade";
import { Button } from "../ui/components/Button/Button";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ErrorState } from "../ui/components/ErrorState/ErrorState";
import { ReadOnlyField } from "../ui/components/ReadOnlyField/ReadOnlyField";
import { SectionCard } from "../ui/components/SectionCard/SectionCard";
import { Select } from "../ui/components/Select/Select";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { TextField } from "../ui/components/TextField/TextField";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./KalkulatorPozycjiPage.module.css";

/** Wynik z backendu - wszystkie pola liczbowe to Decimal jako string, nigdy nie liczymy na nich tutaj. */
interface PositionSizingResult {
  risk_target_amount: string;
  stop_loss_price: string;
  stop_distance_price: string;
  stop_distance_points: string;
  loss_per_lot: string;
  raw_lot: string;
  suggested_lot: string;
  actual_risk_amount: string;
  actual_risk_percent: string;
  units: string;
  reward_amount: string | null;
  rr: string | null;
  warnings: string[];
}

type RiskMode = "percent" | "amount";
type StopMode = "price" | "points";

function formatNumber(value: string, maxFractionDigits = 2): string {
  const num = Number(value);
  if (Number.isNaN(num)) {
    return value;
  }
  return new Intl.NumberFormat("pl-PL", {
    // Minimum NIE może przekroczyć maksimum - `Intl` rzuca wtedy RangeError i wywala cały
    // ekran (złapane na żywo przy odległości SL w punktach, gdzie maksimum to 1 miejsce).
    minimumFractionDigits: Math.min(2, maxFractionDigits),
    maximumFractionDigits: maxFractionDigits,
  }).format(num);
}

/** Lot pokazujemy z polskim przecinkiem i bez sztucznego obcinania miejsc (0,01 ma zostać 0,01). */
function formatLot(value: string): string {
  const num = Number(value);
  if (Number.isNaN(num)) {
    return value;
  }
  return new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(num);
}

/**
 * Kalkulator wielkości pozycji (sekcja 2 specyfikacji) - osobny ekran, celowo NIE wbudowany w
 * formularz transakcji. Przepływ: konto → szablon tego konta ładuje się sam → instrument z tego
 * szablonu → ryzyko + kierunek + wejście + SL → sugerowany lot wraz z wyjaśnieniem.
 *
 * Cała matematyka dzieje się w Rust (`calculate_position_size`); tutaj tylko zbieramy wejście i
 * pokazujemy wynik. Wielkość kontraktu i wartości ticka pochodzą z rewizji instrumentu i nie są
 * wysyłane z frontendu - kalkulator nie może mieć własnej, rozjeżdżającej się kopii.
 */
export function KalkulatorPozycjiPage(): ReactElement {
  const { showToast } = useToast();
  const { preferences } = usePreferences();

  const [accounts, setAccounts] = useState<AccountWithBalance[] | null>(null);
  const [templates, setTemplates] = useState<BrokerTemplate[] | null>(null);
  const [instruments, setInstruments] = useState<InstrumentWithDetails[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [accountId, setAccountId] = useState("");
  const [instrumentId, setInstrumentId] = useState("");
  const [side, setSide] = useState<TradeSide>("buy");
  const [riskMode, setRiskMode] = useState<RiskMode>("percent");
  // Wartości startowe z Ustawień → Domyślne wartości → Kalkulator. To wyłącznie podpowiedź
  // w formularzu, nigdy narzucona reguła inwestycyjna - użytkownik zmienia je swobodnie.
  const [riskValue, setRiskValue] = useState(
    () => preferences?.defaults.calculator_risk_percent ?? "1",
  );
  const [entryPrice, setEntryPrice] = useState("");
  const [stopMode, setStopMode] = useState<StopMode>(
    () => preferences?.defaults.calculator_sl_mode ?? "price",
  );
  const [stopValue, setStopValue] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [conversionRate, setConversionRate] = useState("");

  const [result, setResult] = useState<PositionSizingResult | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  const account = useMemo(
    () => accounts?.find((a) => a.id === accountId) ?? null,
    [accounts, accountId],
  );
  const instrument = useMemo(
    () => instruments?.find((i) => i.id === instrumentId) ?? null,
    [instruments, instrumentId],
  );
  /** Szablon przypisany do wybranego konta - kalkulator ładuje WYŁĄCZNIE jego instrumenty. */
  const accountTemplate = useMemo(
    () => templates?.find((t) => t.id === account?.template_id) ?? null,
    [templates, account],
  );

  async function loadBase(): Promise<void> {
    setLoadError(null);
    try {
      const [accs, tpls] = await Promise.all([
        invokeCommand<AccountWithBalance[]>("list_accounts", { includeArchived: false }),
        invokeCommand<BrokerTemplate[]>("list_broker_templates", { includeArchived: false }),
      ]);
      setAccounts(accs);
      setTemplates(tpls);
      setAccountId((current) => current || (accs[0]?.id ?? ""));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBase();
  }, []);

  // Instrumenty przeładowują się przy każdej zmianie konta - zawsze z szablonu TEGO konta.
  useEffect(() => {
    if (!accountId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- czyszczenie listy, gdy nie ma konta.
      setInstruments(null);
      return;
    }
    async function loadInstruments(templateId: string | null): Promise<void> {
      try {
        const list = await invokeCommand<InstrumentWithDetails[]>("list_instruments", {
          filter: { visibility: "visible", template_id: templateId },
        });
        setInstruments(list);
        setInstrumentId((current) =>
          list.some((i) => i.id === current) ? current : (list[0]?.id ?? ""),
        );
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Nie udało się wczytać instrumentów.");
      }
    }
    void loadInstruments(accountTemplate?.id ?? null);
  }, [accountId, accountTemplate]);

  // Przeliczenie po każdej zmianie wejścia, z krótkim opóźnieniem - ten sam wzorzec co podgląd
  // wyniku w formularzu transakcji.
  useEffect(() => {
    const entry = normalizeDecimalInput(entryPrice);
    const stop = normalizeDecimalInput(stopValue);
    const risk = normalizeDecimalInput(riskValue);

    if (!accountId || !instrumentId || !entry || !stop || !risk) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- kasowanie wyniku przy niekompletnym wejściu.
      setResult(null);
      setCalcError(null);
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const request = {
            side,
            entry_price: entry,
            stop_loss_price: stopMode === "price" ? stop : null,
            stop_loss_points: stopMode === "points" ? stop : null,
            take_profit: normalizeDecimalInput(takeProfit),
            risk_percent: riskMode === "percent" ? risk : null,
            risk_amount: riskMode === "amount" ? risk : null,
            conversion_rate: normalizeDecimalInput(conversionRate),
          };
          const calculated = await invokeCommand<PositionSizingResult>("calculate_position_size", {
            accountId,
            instrumentId,
            request,
          });
          setResult(calculated);
          setCalcError(null);
        } catch (e) {
          setResult(null);
          setCalcError(e instanceof Error ? e.message : "Nie udało się przeliczyć pozycji.");
        }
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [
    accountId,
    instrumentId,
    side,
    riskMode,
    riskValue,
    entryPrice,
    stopMode,
    stopValue,
    takeProfit,
    conversionRate,
  ]);

  async function handleCopy(): Promise<void> {
    if (!result || !instrument) {
      return;
    }
    const currency = account?.currency ?? "";
    const text = [
      `${instrument.display_symbol} ${side === "buy" ? "BUY" : "SELL"}`,
      `Lot: ${formatLot(result.suggested_lot)}`,
      `Wejście: ${entryPrice} | SL: ${result.stop_loss_price}`,
      `Ryzyko: ${formatNumber(result.actual_risk_amount)} ${currency} (${formatNumber(result.actual_risk_percent)}%)`,
      result.reward_amount
        ? `Potencjalny zysk: ${formatNumber(result.reward_amount)} ${currency}${result.rr ? ` | R:R ${formatNumber(result.rr)}` : ""}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast("Wynik skopiowany.", "success");
    } catch {
      showToast("Nie udało się skopiować - zaznacz i skopiuj ręcznie.", "error");
    }
  }

  if (loadError) {
    return (
      <div className={styles.page}>
        <ErrorState
          title="Nie udało się wczytać danych"
          description={loadError}
          action={
            <Button variant="secondary" onClick={() => void loadBase()}>
              Spróbuj ponownie
            </Button>
          }
        />
      </div>
    );
  }
  if (!accounts || !templates) {
    return (
      <div className={styles.page}>
        <Skeleton height="16rem" />
      </div>
    );
  }
  if (accounts.length === 0) {
    return (
      <div className={styles.page}>
        <EmptyState
          icon={<Calculator size={32} />}
          title="Najpierw dodaj konto"
          description="Kalkulator liczy wielkość pozycji na podstawie salda i waluty konta oraz parametrów instrumentów z przypisanego mu szablonu."
        />
      </div>
    );
  }

  const version = instrument?.version;
  const currency = account?.currency ?? "";

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <SectionCard>
          <div className={styles.section}>
            <div>
              <h2 className={styles.sectionTitle}>Pozycja</h2>
              <p className={styles.subtitle}>
                Instrumenty pochodzą z szablonu przypisanego do wybranego konta
                {accountTemplate ? ` („${accountTemplate.name}")` : ""}.
              </p>
            </div>

            <div className={styles.grid}>
              <Select
                label="Konto"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              />
              <Select
                label="Instrument"
                value={instrumentId}
                onChange={(e) => setInstrumentId(e.target.value)}
                options={(instruments ?? []).map((i) => ({
                  value: i.id,
                  label: `${i.display_symbol} — ${i.description}`,
                }))}
              />

              <Select
                label="Kierunek"
                value={side}
                onChange={(e) => setSide(e.target.value as TradeSide)}
                options={[
                  { value: "buy", label: "BUY (długa)" },
                  { value: "sell", label: "SELL (krótka)" },
                ]}
              />
              <TextField
                label="Cena wejścia"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="np. 1,10500"
                inputMode="decimal"
              />

              <Select
                label="Ryzyko"
                value={riskMode}
                onChange={(e) => setRiskMode(e.target.value as RiskMode)}
                options={[
                  { value: "percent", label: "% salda" },
                  { value: "amount", label: `kwota (${currency})` },
                ]}
              />
              <TextField
                label={riskMode === "percent" ? "Ryzyko (%)" : `Ryzyko (${currency})`}
                value={riskValue}
                onChange={(e) => setRiskValue(e.target.value)}
                placeholder={riskMode === "percent" ? "np. 1" : "np. 100"}
                inputMode="decimal"
              />

              <Select
                label="Stop loss"
                value={stopMode}
                onChange={(e) => setStopMode(e.target.value as StopMode)}
                options={[
                  { value: "price", label: "jako cena" },
                  { value: "points", label: "jako punkty" },
                ]}
              />
              <TextField
                label={stopMode === "price" ? "Cena stop lossa" : "Stop loss (punkty)"}
                value={stopValue}
                onChange={(e) => setStopValue(e.target.value)}
                placeholder={stopMode === "price" ? "np. 1,09500" : "np. 200"}
                inputMode="decimal"
              />

              <TextField
                label="Take profit (opcjonalnie)"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="np. 1,12000"
                inputMode="decimal"
                hint="Do podglądu potencjalnego zysku i R:R."
              />
              {version && version.currency_profit !== currency && (
                <TextField
                  label={`Kurs ${version.currency_profit} → ${currency}`}
                  value={conversionRate}
                  onChange={(e) => setConversionRate(e.target.value)}
                  placeholder="np. 4,05"
                  inputMode="decimal"
                  hint="Instrument rozlicza się w innej walucie niż konto."
                />
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard>
          <div className={styles.result}>
            <div>
              <h2 className={styles.sectionTitle}>Sugerowany lot</h2>
              <p className={styles.lotValue}>{result ? formatLot(result.suggested_lot) : "—"}</p>
              <p className={styles.lotLabel}>
                {result
                  ? `Rzeczywiste ryzyko ${formatNumber(result.actual_risk_amount)} ${currency} (${formatNumber(result.actual_risk_percent)}% salda)`
                  : "Uzupełnij cenę wejścia, stop loss i ryzyko."}
              </p>
            </div>

            {calcError && (
              <p role="alert" className={styles.error}>
                {calcError}
              </p>
            )}

            {result?.warnings.map((w) => (
              <p key={w} role="status" className={styles.warning}>
                {w}
              </p>
            ))}

            {result && (
              <>
                <ReadOnlyField
                  rows={[
                    {
                      label: "Ryzyko docelowe",
                      value: `${formatNumber(result.risk_target_amount)} ${currency}`,
                    },
                    { label: "Stop loss (cena)", value: result.stop_loss_price },
                    {
                      label: "Odległość SL",
                      value: `${formatNumber(result.stop_distance_points, 1)} pkt`,
                    },
                    {
                      label: "Strata na 1 locie",
                      value: `${formatNumber(result.loss_per_lot)} ${currency}`,
                    },
                    ...(result.reward_amount
                      ? [
                          {
                            label: "Potencjalny zysk",
                            value: `${formatNumber(result.reward_amount)} ${currency}`,
                            tone: "profit" as const,
                          },
                        ]
                      : []),
                    ...(result.rr ? [{ label: "R:R", value: formatNumber(result.rr) }] : []),
                  ]}
                />
                <p className={styles.explain}>
                  {formatNumber(result.risk_target_amount)} {currency} ryzyka ÷{" "}
                  {formatNumber(result.loss_per_lot)} {currency} straty na jednym locie ={" "}
                  {formatLot(result.raw_lot)} lota, dociągnięte w dół do kroku brokera ={" "}
                  <strong>{formatLot(result.suggested_lot)}</strong>.
                </p>
              </>
            )}

            {version && (
              <ReadOnlyField
                rows={[
                  {
                    label: "Saldo konta",
                    value: `${formatNumber(account?.balance ?? "0")} ${currency}`,
                  },
                  { label: "Wielkość kontraktu", value: version.contract_size },
                  { label: "Wielkość ticka", value: version.trade_tick_size },
                  { label: "Wartość ticka (strata)", value: version.tick_value_loss },
                  { label: "Waluta wyniku", value: version.currency_profit },
                ]}
              />
            )}

            {result && (
              <div className={styles.resultActions}>
                <Button variant="secondary" onClick={() => void handleCopy()}>
                  <Copy size={16} aria-hidden="true" /> Kopiuj wynik
                </Button>
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
