import { useState } from "react";
import type { ReactElement, SubmitEvent } from "react";
import { isValidDecimalString } from "../app/decimal";
import { invokeCommand } from "../app/invokeCommand";
import type { Instrument, InstrumentSpecInput } from "../app/types/instrument";
import { Button } from "../ui/components/Button/Button";
import { Modal } from "../ui/components/Modal/Modal";
import { TextField } from "../ui/components/TextField/TextField";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./InstrumentFormModal.module.css";

export interface InstrumentFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  instrument?: Instrument | undefined;
}

interface FormFields {
  symbol: string;
  name: string;
  category: string;
  decimalPlaces: string;
  tickSize: string;
  tickValuePerLot: string;
  contractSize: string;
  pipSize: string;
  quoteCurrency: string;
  settlementCurrency: string;
  minLot: string;
  lotStep: string;
}

const BLANK_FORM: FormFields = {
  symbol: "",
  name: "",
  category: "",
  decimalPlaces: "5",
  tickSize: "",
  tickValuePerLot: "",
  contractSize: "",
  pipSize: "",
  quoteCurrency: "USD",
  settlementCurrency: "USD",
  minLot: "0.01",
  lotStep: "0.01",
};

function toFormFields(instrument: Instrument): FormFields {
  return {
    symbol: instrument.symbol,
    name: instrument.name,
    category: instrument.category ?? "",
    decimalPlaces: String(instrument.decimal_places),
    tickSize: instrument.tick_size,
    tickValuePerLot: instrument.tick_value_per_lot,
    contractSize: instrument.contract_size,
    pipSize: instrument.pip_size,
    quoteCurrency: instrument.quote_currency,
    settlementCurrency: instrument.settlement_currency,
    minLot: instrument.min_lot,
    lotStep: instrument.lot_step,
  };
}

const DECIMAL_FIELDS: { key: keyof FormFields; label: string }[] = [
  { key: "tickSize", label: "Tick size" },
  { key: "tickValuePerLot", label: "Tick value na lot" },
  { key: "contractSize", label: "Wielkość kontraktu" },
  { key: "pipSize", label: "Pip size" },
  { key: "minLot", label: "Minimalny lot" },
  { key: "lotStep", label: "Krok lota" },
];

/**
 * Rodzic renderuje ten komponent z `key` zależnym od edytowanego instrumentu
 * (patrz InstrumentsPage), więc pola startowe poniżej liczą się raz przy
 * montowaniu - nie potrzeba efektu resetującego formularz.
 */
export function InstrumentFormModal({
  open,
  onClose,
  onSaved,
  instrument,
}: InstrumentFormModalProps): ReactElement {
  const isEdit = Boolean(instrument);
  const { showToast } = useToast();
  const [fields, setFields] = useState<FormFields>(() =>
    instrument ? toFormFields(instrument) : BLANK_FORM,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setField(key: keyof FormFields, value: string): void {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    for (const { key, label } of DECIMAL_FIELDS) {
      if (!isValidDecimalString(fields[key])) {
        setFormError(`${label} musi być liczbą (np. 0.0001).`);
        return;
      }
    }
    const decimalPlaces = Number.parseInt(fields.decimalPlaces, 10);
    if (Number.isNaN(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 10) {
      setFormError("Liczba miejsc dziesiętnych musi być z zakresu 0-10.");
      return;
    }

    const input: InstrumentSpecInput = {
      symbol: fields.symbol.toUpperCase(),
      name: fields.name,
      category: fields.category.trim() ? fields.category : null,
      decimal_places: decimalPlaces,
      tick_size: fields.tickSize,
      tick_value_per_lot: fields.tickValuePerLot,
      contract_size: fields.contractSize,
      pip_size: fields.pipSize,
      quote_currency: fields.quoteCurrency.toUpperCase(),
      settlement_currency: fields.settlementCurrency.toUpperCase(),
      min_lot: fields.minLot,
      lot_step: fields.lotStep,
    };

    setSubmitting(true);
    try {
      if (isEdit && instrument) {
        await invokeCommand("update_instrument", { id: instrument.id, input });
        showToast("Instrument zaktualizowany.", "success");
      } else {
        await invokeCommand("create_instrument", { input });
        showToast("Instrument utworzony.", "success");
      }
      onSaved();
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Wystąpił nieoczekiwany błąd.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edytuj instrument" : "Nowy instrument"}>
      <form
        className={styles.form}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div className={styles.grid}>
          <TextField
            label="Symbol"
            required
            value={fields.symbol}
            onChange={(e) => setField("symbol", e.target.value.toUpperCase())}
          />
          <TextField
            label="Nazwa"
            required
            value={fields.name}
            onChange={(e) => setField("name", e.target.value)}
          />
          <TextField
            label="Kategoria (opcjonalnie)"
            hint="Np. forex, metale, indeksy"
            value={fields.category}
            onChange={(e) => setField("category", e.target.value)}
          />
          <TextField
            label="Miejsca dziesiętne"
            type="number"
            min={0}
            max={10}
            required
            value={fields.decimalPlaces}
            onChange={(e) => setField("decimalPlaces", e.target.value)}
          />
          <TextField
            label="Waluta kwotowana"
            required
            maxLength={3}
            value={fields.quoteCurrency}
            onChange={(e) => setField("quoteCurrency", e.target.value.toUpperCase())}
          />
          <TextField
            label="Waluta wyniku"
            required
            maxLength={3}
            value={fields.settlementCurrency}
            onChange={(e) => setField("settlementCurrency", e.target.value.toUpperCase())}
          />
          {DECIMAL_FIELDS.map(({ key, label }) => (
            <TextField
              key={key}
              label={label}
              required
              inputMode="decimal"
              value={fields[key]}
              onChange={(e) => setField(key, e.target.value)}
            />
          ))}
        </div>
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
            {submitting ? "Zapisywanie..." : "Zapisz"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
