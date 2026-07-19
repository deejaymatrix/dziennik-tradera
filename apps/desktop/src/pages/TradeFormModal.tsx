import { useEffect, useRef, useState } from "react";
import type { ReactElement, SubmitEvent } from "react";
import { invokeCommand } from "../app/invokeCommand";
import {
  blankTradeFormFields,
  buildTradeInput,
  clearTradeDraft,
  loadTradeDraft,
  saveTradeDraft,
  tradeToFormFields,
  validateTradeFormFormat,
} from "../app/tradeForm";
import type { TradeFormFields } from "../app/tradeForm";
import type { InstrumentListFilter, InstrumentWithDetails } from "../app/types/instrument";
import type { Strategy } from "../app/types/strategy";
import type { Trade, TradeCalculation, TradeSide } from "../app/types/trade";
import { Button } from "../ui/components/Button/Button";
import { Checkbox } from "../ui/components/Checkbox/Checkbox";
import { Modal } from "../ui/components/Modal/Modal";
import { Select } from "../ui/components/Select/Select";
import { Textarea } from "../ui/components/Textarea/Textarea";
import { TextField } from "../ui/components/TextField/TextField";
import { useToast } from "../ui/components/Toast/ToastProvider";
import { TradePreviewCard } from "./TradePreviewCard";
import styles from "./TradeFormModal.module.css";

export interface TradeFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  accountId: string;
  accountCurrency: string;
  trade?: Trade | undefined;
}

const SIDE_OPTIONS: { value: TradeSide; label: string }[] = [
  { value: "buy", label: "BUY (long)" },
  { value: "sell", label: "SELL (short)" },
];

const RATING_OPTIONS = [
  { value: "", label: "— bez oceny —" },
  { value: "1", label: "1 - bardzo słabo" },
  { value: "2", label: "2" },
  { value: "3", label: "3 - neutralnie" },
  { value: "4", label: "4" },
  { value: "5", label: "5 - wzorowo" },
];

/**
 * Rodzic renderuje ten komponent z `key` zależnym od edytowanej transakcji (patrz
 * TransactionsPage), więc pola startowe poniżej liczą się raz przy montowaniu. Stan startowy
 * bierze pod uwagę autosave lokalnego szkicu (localStorage) - jeśli istnieje niezapisany
 * szkic dla tej transakcji/nowego wpisu, wygrywa on z danymi z serwera.
 */
export function TradeFormModal({
  open,
  onClose,
  onSaved,
  accountId,
  accountCurrency,
  trade,
}: TradeFormModalProps): ReactElement {
  const isEdit = Boolean(trade);
  const { showToast } = useToast();

  const [fields, setFields] = useState<TradeFormFields>(() => {
    const draft = loadTradeDraft(accountId, trade?.id);
    if (draft) {
      return draft;
    }
    return trade ? tradeToFormFields(trade) : blankTradeFormFields();
  });
  const initialSnapshot = useRef(JSON.stringify(fields));

  const [instruments, setInstruments] = useState<
    (InstrumentWithDetails & { isHidden?: boolean })[]
  >([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [preview, setPreview] = useState<TradeCalculation | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Jednorazowe pobranie list wyboru (instrumenty/strategie aktywne) przy otwarciu -
    // ta instancja komponentu jest zawsze dla jednej, stałej transakcji (key wymusza remount).
    void (async () => {
      try {
        const visibleFilter: InstrumentListFilter = {
          search: null,
          category: null,
          visibility: "visible",
        };
        const [instrumentsData, strategiesData] = await Promise.all([
          invokeCommand<InstrumentWithDetails[]>("list_instruments", { filter: visibleFilter }),
          invokeCommand<Strategy[]>("list_strategies", { includeArchived: false }),
        ]);
        // Jeżeli edytowana transakcja używa ukrytego instrumentu, pokaż go mimo to jako
        // aktualnie wybraną wartość z oznaczeniem "ukryty" (sekcja "Widoczność i wybór
        // instrumentów") - nigdy nie chowaj wyboru już zapisanej historycznej transakcji.
        const selectedId = trade?.instrument_id;
        if (selectedId && !instrumentsData.some((i) => i.id === selectedId)) {
          try {
            const hidden = await invokeCommand<InstrumentWithDetails>("get_instrument", {
              id: selectedId,
            });
            setInstruments([...instrumentsData, { ...hidden, isHidden: true }]);
          } catch {
            setInstruments(instrumentsData);
          }
        } else {
          setInstruments(instrumentsData);
        }
        setStrategies(strategiesData);
      } catch {
        // Brak list nie blokuje formularza - pola instrumentu/strategii po prostu będą puste.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jednorazowe pobranie przy montowaniu, `trade` jest stały dla tej instancji (key wymusza remount).
  }, []);

  useEffect(() => {
    saveTradeDraft(accountId, trade?.id, fields);
  }, [fields, accountId, trade?.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const input = buildTradeInput(fields, accountId);
          const result = await invokeCommand<TradeCalculation>("preview_trade", { input });
          setPreview(result);
        } catch {
          setPreview(null);
        }
      })();
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [fields, accountId]);

  function setField<K extends keyof TradeFormFields>(key: K, value: TradeFormFields[K]): void {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function requestClose(): void {
    const isDirty = JSON.stringify(fields) !== initialSnapshot.current;
    if (
      isDirty &&
      !window.confirm(
        "Masz niezapisane zmiany w tej transakcji. Zamknąć formularz bez zapisywania? (szkic zostanie zachowany do następnego razu)",
      )
    ) {
      return;
    }
    onClose();
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const formatError = validateTradeFormFormat(fields);
    if (formatError) {
      setFormError(formatError);
      return;
    }

    const input = buildTradeInput(fields, accountId);

    setSubmitting(true);
    try {
      if (isEdit && trade) {
        await invokeCommand("update_trade", { id: trade.id, input });
        showToast("Transakcja zaktualizowana.", "success");
      } else {
        await invokeCommand("create_trade", { input });
        showToast("Transakcja zapisana.", "success");
      }
      clearTradeDraft(accountId, trade?.id);
      onSaved();
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Wystąpił nieoczekiwany błąd.");
    } finally {
      setSubmitting(false);
    }
  }

  const instrumentOptions = [
    { value: "", label: "— wybierz instrument —" },
    ...instruments.map((i) => ({
      value: i.id,
      label: i.isHidden
        ? `${i.display_symbol} — ${i.description} (ukryty)`
        : `${i.display_symbol} — ${i.description}`,
    })),
  ];
  const strategyOptions = [
    { value: "", label: "Brak" },
    ...strategies.map((s) => ({ value: s.id, label: s.name })),
  ];

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title={isEdit ? `Edytuj transakcję #${trade?.display_number}` : "Nowa transakcja"}
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div className={styles.grid}>
          <Select
            label="Instrument"
            value={fields.instrumentId}
            onChange={(e) => setField("instrumentId", e.target.value)}
            options={instrumentOptions}
          />
          <Select
            label="Strategia"
            value={fields.strategyId}
            onChange={(e) => setField("strategyId", e.target.value)}
            options={strategyOptions}
          />
          <Select
            label="Kierunek"
            value={fields.side}
            onChange={(e) => setField("side", e.target.value as TradeSide)}
            options={SIDE_OPTIONS}
          />
        </div>

        <div className={styles.grid}>
          <TextField
            label="Data otwarcia"
            type="datetime-local"
            step={1}
            value={fields.openedAt}
            onChange={(e) => setField("openedAt", e.target.value)}
          />
          <TextField
            label="Data zamknięcia"
            type="datetime-local"
            step={1}
            value={fields.closedAt}
            onChange={(e) => setField("closedAt", e.target.value)}
          />
        </div>

        <div className={styles.gridThree}>
          <TextField
            label="Wolumen"
            inputMode="decimal"
            value={fields.volume}
            onChange={(e) => setField("volume", e.target.value)}
          />
          <TextField
            label="Cena wejścia"
            inputMode="decimal"
            value={fields.entryPrice}
            onChange={(e) => setField("entryPrice", e.target.value)}
          />
          <TextField
            label="Cena wyjścia"
            inputMode="decimal"
            value={fields.exitPrice}
            onChange={(e) => setField("exitPrice", e.target.value)}
          />
          <TextField
            label="Stop loss"
            inputMode="decimal"
            value={fields.stopLoss}
            onChange={(e) => setField("stopLoss", e.target.value)}
          />
          <TextField
            label="Take profit"
            inputMode="decimal"
            value={fields.takeProfit}
            onChange={(e) => setField("takeProfit", e.target.value)}
          />
        </div>

        <div className={styles.gridThree}>
          <TextField
            label="Prowizja"
            inputMode="decimal"
            value={fields.commission}
            onChange={(e) => setField("commission", e.target.value)}
          />
          <TextField
            label="Swap"
            inputMode="decimal"
            value={fields.swap}
            onChange={(e) => setField("swap", e.target.value)}
          />
          <TextField
            label="Dodatkowe opłaty"
            inputMode="decimal"
            value={fields.otherFees}
            onChange={(e) => setField("otherFees", e.target.value)}
          />
        </div>

        {(preview?.requires_conversion_rate ?? false) || fields.conversionRate.trim() ? (
          <TextField
            label="Kurs przeliczeniowy"
            inputMode="decimal"
            required={preview?.requires_conversion_rate ?? false}
            value={fields.conversionRate}
            onChange={(e) => setField("conversionRate", e.target.value)}
            hint="Waluta wyniku instrumentu różni się od waluty konta - podaj kurs, żeby dokładnie przeliczyć wynik (bez tego wynik pieniężny nie zostanie policzony)."
          />
        ) : null}

        <TradePreviewCard calculation={preview} currency={accountCurrency} />

        <div className={styles.grid}>
          <TextField
            label="Interwał (opcjonalnie)"
            hint="Np. M15, H1, D1"
            value={fields.interval}
            onChange={(e) => setField("interval", e.target.value)}
          />
          <TextField
            label="Sesja (opcjonalnie)"
            hint="Np. Londyn, Nowy Jork, Azja"
            value={fields.session}
            onChange={(e) => setField("session", e.target.value)}
          />
        </div>

        <Textarea
          label="Plan przed transakcją (opcjonalnie)"
          value={fields.planBefore}
          onChange={(e) => setField("planBefore", e.target.value)}
        />
        <Textarea
          label="Notatki z zarządzania pozycją (opcjonalnie)"
          value={fields.managementNotes}
          onChange={(e) => setField("managementNotes", e.target.value)}
        />
        <Textarea
          label="Podsumowanie po transakcji (opcjonalnie)"
          value={fields.postTradeSummary}
          onChange={(e) => setField("postTradeSummary", e.target.value)}
        />
        <Textarea
          label="Wnioski (opcjonalnie)"
          value={fields.conclusion}
          onChange={(e) => setField("conclusion", e.target.value)}
        />
        <Select
          label="Ocena zgodności z planem (opcjonalnie)"
          value={fields.planAdherenceRating}
          onChange={(e) => setField("planAdherenceRating", e.target.value)}
          options={RATING_OPTIONS}
        />

        <div className={styles.overrideBlock}>
          <Checkbox
            label="Ręcznie koryguj wynik netto"
            checked={fields.overrideEnabled}
            onChange={(e) => setField("overrideEnabled", e.target.checked)}
          />
          {fields.overrideEnabled && (
            <div className={styles.overrideFields}>
              <TextField
                label="Ręczny wynik netto"
                inputMode="decimal"
                value={fields.overrideNetPnl}
                onChange={(e) => setField("overrideNetPnl", e.target.value)}
              />
              <Textarea
                label="Uzasadnienie (wymagane)"
                required
                value={fields.overrideReason}
                onChange={(e) => setField("overrideReason", e.target.value)}
                hint="Np. korekta po weryfikacji wyciągu brokera - wynik ręczny zastąpi wyliczenia powyżej."
              />
            </div>
          )}
        </div>

        {formError && (
          <p role="alert" className={styles.error}>
            {formError}
          </p>
        )}
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={requestClose} disabled={submitting}>
            Anuluj
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Zapisywanie..." : "Zapisz"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
