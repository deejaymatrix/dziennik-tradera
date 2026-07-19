import { useEffect, useState } from "react";
import type { ReactElement, SubmitEvent } from "react";
import { invokeCommand } from "../app/invokeCommand";
import { buildTradeInput, tradeToFormFields, validateTradeFormFormat } from "../app/tradeForm";
import type { TradeFormFields } from "../app/tradeForm";
import { toDatetimeLocalValue } from "../app/datetime";
import type { Trade, TradeCalculation } from "../app/types/trade";
import { Button } from "../ui/components/Button/Button";
import { Modal } from "../ui/components/Modal/Modal";
import { TextField } from "../ui/components/TextField/TextField";
import { useToast } from "../ui/components/Toast/ToastProvider";
import { TradePreviewCard } from "./TradePreviewCard";
import styles from "./CloseTradeModal.module.css";

export interface CloseTradeModalProps {
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
  trade: Trade | null;
  accountCurrency: string;
}

/**
 * Skupiona akcja "zamknij pozycję" - w odróżnieniu od pełnego TradeFormModal, dotyka tylko
 * pól potrzebnych do bezpiecznego zamknięcia (cena wyjścia, data, ewentualna korekta kosztów),
 * reszta transakcji (instrument, plan, notatki) zostaje bez zmian. Rodzic renderuje z `key`
 * zależnym od id transakcji (patrz TransactionsPage).
 */
export function CloseTradeModal({
  open,
  onClose,
  onClosed,
  trade,
  accountCurrency,
}: CloseTradeModalProps): ReactElement | null {
  const { showToast } = useToast();
  const [exitPrice, setExitPrice] = useState("");
  const [closedAt, setClosedAt] = useState(() => toDatetimeLocalValue(new Date().toISOString()));
  const [commission, setCommission] = useState(() => trade?.commission ?? "0");
  const [swap, setSwap] = useState(() => trade?.swap ?? "0");
  const [otherFees, setOtherFees] = useState(() => trade?.other_fees ?? "0");
  const [preview, setPreview] = useState<TradeCalculation | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function buildFields(): TradeFormFields | null {
    if (!trade) {
      return null;
    }
    return {
      ...tradeToFormFields(trade),
      exitPrice,
      closedAt,
      commission,
      swap,
      otherFees,
    };
  }

  useEffect(() => {
    if (!trade) {
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        const fields = buildFields();
        if (!fields) {
          return;
        }
        try {
          const input = buildTradeInput(fields, trade.account_id);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildFields czyta bieżące pola, to zamierzone wyzwalacze przeliczenia.
  }, [exitPrice, closedAt, commission, swap, otherFees, trade]);

  if (!trade) {
    return null;
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!trade) {
      return;
    }
    setFormError(null);

    const fields = buildFields();
    if (!fields) {
      return;
    }
    const formatError = validateTradeFormFormat(fields);
    if (formatError) {
      setFormError(formatError);
      return;
    }
    if (!exitPrice.trim()) {
      setFormError("Podaj cenę wyjścia, aby zamknąć pozycję.");
      return;
    }

    setSubmitting(true);
    try {
      const input = buildTradeInput(fields, trade.account_id);
      await invokeCommand("update_trade", { id: trade.id, input });
      showToast("Pozycja zamknięta.", "success");
      onClosed();
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Wystąpił nieoczekiwany błąd.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Zamknij pozycję #${trade.display_number}`}>
      <form
        className={styles.form}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div className={styles.grid}>
          <TextField
            label="Cena wyjścia"
            required
            inputMode="decimal"
            value={exitPrice}
            onChange={(e) => setExitPrice(e.target.value)}
          />
          <TextField
            label="Data zamknięcia"
            type="datetime-local"
            step={1}
            required
            value={closedAt}
            onChange={(e) => setClosedAt(e.target.value)}
          />
        </div>
        <div className={styles.gridThree}>
          <TextField
            label="Prowizja"
            inputMode="decimal"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
          />
          <TextField
            label="Swap"
            inputMode="decimal"
            value={swap}
            onChange={(e) => setSwap(e.target.value)}
          />
          <TextField
            label="Dodatkowe opłaty"
            inputMode="decimal"
            value={otherFees}
            onChange={(e) => setOtherFees(e.target.value)}
          />
        </div>

        <TradePreviewCard calculation={preview} currency={accountCurrency} />

        {formError && (
          <p role="alert" className={styles.error}>
            {formError}
          </p>
        )}
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Anuluj
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Zamykanie..." : "Zamknij pozycję"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
