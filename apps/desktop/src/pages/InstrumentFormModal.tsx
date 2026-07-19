import { useState } from "react";
import type { ReactElement, SubmitEvent } from "react";
import { isValidDecimalString } from "../app/decimal";
import { invokeCommand } from "../app/invokeCommand";
import {
  INSTRUMENT_CATEGORIES,
  type InstrumentVersionInput,
  type InstrumentWithDetails,
  type NewInstrumentInput,
} from "../app/types/instrument";
import { Button } from "../ui/components/Button/Button";
import { Checkbox } from "../ui/components/Checkbox/Checkbox";
import { Modal } from "../ui/components/Modal/Modal";
import { Select } from "../ui/components/Select/Select";
import { TextField } from "../ui/components/TextField/TextField";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./InstrumentFormModal.module.css";

export interface InstrumentFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  instrument?: InstrumentWithDetails | undefined;
}

interface IdentityFields {
  displaySymbol: string;
  sourceSymbol: string;
  description: string;
  category: string;
}

/** Stan formularza wersji jako zwykłe stringi/bool - konwersja na `InstrumentVersionInput`
 * (Decimal-jako-string) dzieje się dopiero przy zapisie. */
interface VersionFields {
  currencyBase: string;
  currencyProfit: string;
  currencyMargin: string;
  digits: string;
  point: string;
  tradeTickSize: string;
  tradeTickValue: string;
  tickValueProfit: string;
  tickValueLoss: string;
  contractSize: string;
  volumeMin: string;
  volumeMax: string;
  volumeStep: string;
  volumeLimit: string;
  calcMode: string;
  tradeMode: string;
  executionMode: string;
  orderModeFlags: string;
  fillingModeFlags: string;
  expirationModeFlags: string;
  spreadFloating: boolean;
  stopsLevelPoints: string;
  freezeLevelPoints: string;
  marginInitial: string;
  marginMaintenance: string;
  marginHedged: string;
  marginHedgedUseLeg: boolean;
  liquidityRate: string;
  marginRateBuyInitial: string;
  marginRateBuyMaintenance: string;
  marginRateSellInitial: string;
  marginRateSellMaintenance: string;
  swapMode: string;
  swapLong: string;
  swapShort: string;
  swapSunday: string;
  swapMonday: string;
  swapTuesday: string;
  swapWednesday: string;
  swapThursday: string;
  swapFriday: string;
  swapSaturday: string;
  tripleSwapDay: string;
  quoteSessions: string;
  tradeSessions: string;
  startTime: string;
  expirationTime: string;
}

const BLANK_IDENTITY: IdentityFields = {
  displaySymbol: "",
  sourceSymbol: "",
  description: "",
  category: INSTRUMENT_CATEGORIES[0],
};

const BLANK_VERSION: VersionFields = {
  currencyBase: "USD",
  currencyProfit: "USD",
  currencyMargin: "USD",
  digits: "5",
  point: "",
  tradeTickSize: "",
  tradeTickValue: "",
  tickValueProfit: "",
  tickValueLoss: "",
  contractSize: "",
  volumeMin: "0.01",
  volumeMax: "100",
  volumeStep: "0.01",
  volumeLimit: "0",
  calcMode: "SYMBOL_CALC_MODE_FOREX",
  tradeMode: "SYMBOL_TRADE_MODE_FULL",
  executionMode: "SYMBOL_TRADE_EXECUTION_MARKET",
  orderModeFlags: "63",
  fillingModeFlags: "1",
  expirationModeFlags: "15",
  spreadFloating: true,
  stopsLevelPoints: "0",
  freezeLevelPoints: "0",
  marginInitial: "0",
  marginMaintenance: "0",
  marginHedged: "0",
  marginHedgedUseLeg: false,
  liquidityRate: "0",
  marginRateBuyInitial: "1",
  marginRateBuyMaintenance: "1",
  marginRateSellInitial: "1",
  marginRateSellMaintenance: "1",
  swapMode: "SYMBOL_SWAP_MODE_POINTS",
  swapLong: "0",
  swapShort: "0",
  swapSunday: "1",
  swapMonday: "1",
  swapTuesday: "1",
  swapWednesday: "1",
  swapThursday: "1",
  swapFriday: "1",
  swapSaturday: "1",
  tripleSwapDay: "ENUM_DAY_OF_WEEK::7",
  quoteSessions: "",
  tradeSessions: "",
  startTime: "",
  expirationTime: "",
};

function toIdentityFields(instrument: InstrumentWithDetails): IdentityFields {
  return {
    displaySymbol: instrument.display_symbol,
    sourceSymbol: instrument.source_symbol,
    description: instrument.description,
    category: instrument.category,
  };
}

function toVersionFields(instrument: InstrumentWithDetails): VersionFields {
  const v = instrument.version;
  return {
    currencyBase: v.currency_base,
    currencyProfit: v.currency_profit,
    currencyMargin: v.currency_margin,
    digits: String(v.digits),
    point: v.point,
    tradeTickSize: v.trade_tick_size,
    tradeTickValue: v.trade_tick_value,
    tickValueProfit: v.tick_value_profit,
    tickValueLoss: v.tick_value_loss,
    contractSize: v.contract_size,
    volumeMin: v.volume_min,
    volumeMax: v.volume_max,
    volumeStep: v.volume_step,
    volumeLimit: v.volume_limit,
    calcMode: v.calc_mode,
    tradeMode: v.trade_mode,
    executionMode: v.execution_mode,
    orderModeFlags: String(v.order_mode_flags),
    fillingModeFlags: String(v.filling_mode_flags),
    expirationModeFlags: String(v.expiration_mode_flags),
    spreadFloating: v.spread_floating,
    stopsLevelPoints: String(v.stops_level_points),
    freezeLevelPoints: String(v.freeze_level_points),
    marginInitial: v.margin_initial,
    marginMaintenance: v.margin_maintenance,
    marginHedged: v.margin_hedged,
    marginHedgedUseLeg: v.margin_hedged_use_leg,
    liquidityRate: v.liquidity_rate,
    marginRateBuyInitial: v.margin_rate_buy_initial,
    marginRateBuyMaintenance: v.margin_rate_buy_maintenance,
    marginRateSellInitial: v.margin_rate_sell_initial,
    marginRateSellMaintenance: v.margin_rate_sell_maintenance,
    swapMode: v.swap_mode,
    swapLong: v.swap_long,
    swapShort: v.swap_short,
    swapSunday: v.swap_sunday,
    swapMonday: v.swap_monday,
    swapTuesday: v.swap_tuesday,
    swapWednesday: v.swap_wednesday,
    swapThursday: v.swap_thursday,
    swapFriday: v.swap_friday,
    swapSaturday: v.swap_saturday,
    tripleSwapDay: v.triple_swap_day,
    quoteSessions: v.quote_sessions,
    tradeSessions: v.trade_sessions,
    startTime: v.start_time ?? "",
    expirationTime: v.expiration_time ?? "",
  };
}

const BASIC_DECIMAL_FIELDS: { key: keyof VersionFields; label: string }[] = [
  { key: "point", label: "Point" },
  { key: "tradeTickSize", label: "Wielkość ticka (TradeTickSize)" },
  { key: "tradeTickValue", label: "Wartość ticka (TradeTickValue)" },
  { key: "tickValueProfit", label: "Wartość ticka dla zysku" },
  { key: "tickValueLoss", label: "Wartość ticka dla straty" },
  { key: "contractSize", label: "Wielkość kontraktu" },
  { key: "volumeMin", label: "Wolumen minimalny" },
  { key: "volumeMax", label: "Wolumen maksymalny" },
  { key: "volumeStep", label: "Krok wolumenu" },
  { key: "volumeLimit", label: "Limit wolumenu" },
];

const ADVANCED_DECIMAL_FIELDS: { key: keyof VersionFields; label: string }[] = [
  { key: "marginInitial", label: "Depozyt początkowy" },
  { key: "marginMaintenance", label: "Depozyt utrzymania" },
  { key: "marginHedged", label: "Depozyt dla pozycji zabezpieczonej" },
  { key: "liquidityRate", label: "Współczynnik płynności" },
  { key: "marginRateBuyInitial", label: "Współczynnik depozytu BUY (początkowy)" },
  { key: "marginRateBuyMaintenance", label: "Współczynnik depozytu BUY (utrzymanie)" },
  { key: "marginRateSellInitial", label: "Współczynnik depozytu SELL (początkowy)" },
  { key: "marginRateSellMaintenance", label: "Współczynnik depozytu SELL (utrzymanie)" },
  { key: "swapLong", label: "Swap long" },
  { key: "swapShort", label: "Swap short" },
  { key: "swapSunday", label: "Mnożnik swapu - niedziela" },
  { key: "swapMonday", label: "Mnożnik swapu - poniedziałek" },
  { key: "swapTuesday", label: "Mnożnik swapu - wtorek" },
  { key: "swapWednesday", label: "Mnożnik swapu - środa" },
  { key: "swapThursday", label: "Mnożnik swapu - czwartek" },
  { key: "swapFriday", label: "Mnożnik swapu - piątek" },
  { key: "swapSaturday", label: "Mnożnik swapu - sobota" },
];

const ADVANCED_INT_FIELDS: { key: keyof VersionFields; label: string }[] = [
  { key: "orderModeFlags", label: "Obsługiwane tryby zleceń (flagi)" },
  { key: "fillingModeFlags", label: "Obsługiwane tryby realizacji (flagi)" },
  { key: "expirationModeFlags", label: "Obsługiwane tryby wygaśnięcia (flagi)" },
  { key: "stopsLevelPoints", label: "Minimalny poziom zleceń ochronnych" },
  { key: "freezeLevelPoints", label: "Poziom zamrożenia" },
];

const ADVANCED_TEXT_FIELDS: { key: keyof VersionFields; label: string }[] = [
  { key: "calcMode", label: "Tryb kalkulacji" },
  { key: "tradeMode", label: "Tryb handlu" },
  { key: "executionMode", label: "Tryb egzekucji" },
  { key: "swapMode", label: "Tryb swapu" },
  { key: "tripleSwapDay", label: "Dzień potrójnego swapu" },
];

function parseNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function versionFieldsToInput(fields: VersionFields): InstrumentVersionInput {
  return {
    currency_base: fields.currencyBase.toUpperCase(),
    currency_profit: fields.currencyProfit.toUpperCase(),
    currency_margin: fields.currencyMargin.toUpperCase(),
    digits: parseNumber(fields.digits),
    point: fields.point,
    trade_tick_size: fields.tradeTickSize,
    trade_tick_value: fields.tradeTickValue,
    tick_value_profit: fields.tickValueProfit,
    tick_value_loss: fields.tickValueLoss,
    contract_size: fields.contractSize,
    volume_min: fields.volumeMin,
    volume_max: fields.volumeMax,
    volume_step: fields.volumeStep,
    volume_limit: fields.volumeLimit,
    calc_mode: fields.calcMode,
    trade_mode: fields.tradeMode,
    execution_mode: fields.executionMode,
    order_mode_flags: parseNumber(fields.orderModeFlags),
    filling_mode_flags: parseNumber(fields.fillingModeFlags),
    expiration_mode_flags: parseNumber(fields.expirationModeFlags),
    spread_floating: fields.spreadFloating,
    stops_level_points: parseNumber(fields.stopsLevelPoints),
    freeze_level_points: parseNumber(fields.freezeLevelPoints),
    margin_initial: fields.marginInitial,
    margin_maintenance: fields.marginMaintenance,
    margin_hedged: fields.marginHedged,
    margin_hedged_use_leg: fields.marginHedgedUseLeg,
    liquidity_rate: fields.liquidityRate,
    margin_rate_buy_initial: fields.marginRateBuyInitial,
    margin_rate_buy_maintenance: fields.marginRateBuyMaintenance,
    margin_rate_sell_initial: fields.marginRateSellInitial,
    margin_rate_sell_maintenance: fields.marginRateSellMaintenance,
    swap_mode: fields.swapMode,
    swap_long: fields.swapLong,
    swap_short: fields.swapShort,
    swap_sunday: fields.swapSunday,
    swap_monday: fields.swapMonday,
    swap_tuesday: fields.swapTuesday,
    swap_wednesday: fields.swapWednesday,
    swap_thursday: fields.swapThursday,
    swap_friday: fields.swapFriday,
    swap_saturday: fields.swapSaturday,
    triple_swap_day: fields.tripleSwapDay,
    quote_sessions: fields.quoteSessions,
    trade_sessions: fields.tradeSessions,
    start_time: fields.startTime.trim() ? fields.startTime : null,
    expiration_time: fields.expirationTime.trim() ? fields.expirationTime : null,
  };
}

const CATEGORY_OPTIONS = INSTRUMENT_CATEGORIES.map((c) => ({ value: c, label: c }));

/**
 * Rodzic renderuje ten komponent z `key` zależnym od edytowanego instrumentu
 * (patrz InstrumentsPage), więc pola startowe poniżej liczą się raz przy
 * montowaniu - nie potrzeba efektu resetującego formularz.
 *
 * Instrument zapisany jest domyślnie tylko do odczytu - "Edytuj" odsłania pola. Zapis zawsze
 * tworzy nową wersję parametrów (nigdy nie nadpisuje historycznej), zgodnie z sekcją "Edycja
 * parametrów instrumentu".
 */
export function InstrumentFormModal({
  open,
  onClose,
  onSaved,
  instrument,
}: InstrumentFormModalProps): ReactElement {
  const isEdit = Boolean(instrument);
  const { showToast } = useToast();

  const [identity, setIdentity] = useState<IdentityFields>(() =>
    instrument ? toIdentityFields(instrument) : BLANK_IDENTITY,
  );
  const [fields, setFields] = useState<VersionFields>(() =>
    instrument ? toVersionFields(instrument) : BLANK_VERSION,
  );
  const [editing, setEditing] = useState(!isEdit);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setField<K extends keyof VersionFields>(key: K, value: VersionFields[K]): void {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function setIdentityField<K extends keyof IdentityFields>(
    key: K,
    value: IdentityFields[K],
  ): void {
    setIdentity((current) => ({ ...current, [key]: value }));
  }

  function cancelEdit(): void {
    if (instrument) {
      setFields(toVersionFields(instrument));
    }
    setEditing(false);
    setFormError(null);
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const decimalFields = [...BASIC_DECIMAL_FIELDS, ...ADVANCED_DECIMAL_FIELDS];
    for (const { key, label } of decimalFields) {
      if (!isValidDecimalString(fields[key] as string)) {
        setFormError(`${label} musi być liczbą (np. 0.0001).`);
        return;
      }
    }

    setSubmitting(true);
    try {
      if (isEdit && instrument) {
        await invokeCommand("update_instrument_version", {
          id: instrument.id,
          input: versionFieldsToInput(fields),
        });
        showToast("Zapisano nową wersję parametrów instrumentu.", "success");
      } else {
        const input: NewInstrumentInput = {
          display_symbol: identity.displaySymbol.trim(),
          source_symbol: identity.sourceSymbol.trim(),
          description: identity.description.trim(),
          category: identity.category,
          parameters: versionFieldsToInput(fields),
        };
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

  async function handleResetToFactory(): Promise<void> {
    if (!instrument) return;
    if (
      !window.confirm(
        `Przywrócić fabryczne wartości parametrów dla ${instrument.display_symbol}? Utworzy to nową wersję z oryginalnymi danymi katalogu - obecna wersja zostanie zachowana w historii.`,
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      await invokeCommand("reset_instrument_to_factory", { id: instrument.id });
      showToast("Przywrócono wartości fabryczne.", "success");
      onSaved();
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Wystąpił nieoczekiwany błąd.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!instrument) return;
    if (
      !window.confirm(
        `Trwale usunąć instrument ${instrument.display_symbol}? Tej operacji nie można cofnąć. Nie uda się, jeśli instrument jest już użyty w jakiejś transakcji.`,
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      await invokeCommand("delete_instrument", { id: instrument.id });
      showToast(`Instrument ${instrument.display_symbol} usunięty.`, "success");
      onSaved();
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Wystąpił nieoczekiwany błąd.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  const isFactory = instrument?.factory_index != null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? `${editing ? "Edytuj" : "Szczegóły"}: ${identity.displaySymbol}`
          : "Nowy instrument"
      }
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        {isEdit && instrument && (
          <p className={styles.technicalInfo}>
            Symbol techniczny: <strong>{instrument.source_symbol}</strong> · wersja parametrów nr{" "}
            {instrument.version.version_number}
            {isFactory ? " · instrument fabryczny" : " · instrument własny"}
          </p>
        )}

        {!editing && isEdit && instrument && (
          <dl className={styles.summary}>
            <dt>Opis</dt>
            <dd>{instrument.description}</dd>
            <dt>Kategoria</dt>
            <dd>{instrument.category}</dd>
            <dt>Digits / Point</dt>
            <dd>
              {instrument.version.digits} / {instrument.version.point}
            </dd>
            <dt>TradeTickSize / TradeTickValue</dt>
            <dd>
              {instrument.version.trade_tick_size} / {instrument.version.trade_tick_value}
            </dd>
            <dt>Wartość ticka zysk / strata</dt>
            <dd>
              {instrument.version.tick_value_profit} / {instrument.version.tick_value_loss}
            </dd>
            <dt>Wielkość kontraktu</dt>
            <dd>{instrument.version.contract_size}</dd>
            <dt>Wolumen min / max / krok</dt>
            <dd>
              {instrument.version.volume_min} / {instrument.version.volume_max} /{" "}
              {instrument.version.volume_step}
            </dd>
            <dt>Waluty (bazowa / wyniku / depozytu)</dt>
            <dd>
              {instrument.version.currency_base} / {instrument.version.currency_profit} /{" "}
              {instrument.version.currency_margin}
            </dd>
          </dl>
        )}

        {!editing && isEdit && (
          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={onClose}>
              Zamknij
            </Button>
            {isFactory && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleResetToFactory()}
                disabled={submitting}
              >
                Przywróć wartości fabryczne
              </Button>
            )}
            {!isFactory && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleDelete()}
                disabled={submitting}
              >
                Usuń
              </Button>
            )}
            <Button type="button" variant="primary" onClick={() => setEditing(true)}>
              Edytuj
            </Button>
          </div>
        )}

        {(editing || !isEdit) && (
          <>
            <div className={styles.grid}>
              {!isEdit && (
                <>
                  <TextField
                    label="Symbol wyświetlany"
                    required
                    value={identity.displaySymbol}
                    onChange={(e) =>
                      setIdentityField("displaySymbol", e.target.value.toUpperCase())
                    }
                  />
                  <TextField
                    label="Symbol techniczny"
                    required
                    value={identity.sourceSymbol}
                    onChange={(e) => setIdentityField("sourceSymbol", e.target.value)}
                  />
                  <TextField
                    label="Opis"
                    required
                    value={identity.description}
                    onChange={(e) => setIdentityField("description", e.target.value)}
                  />
                  <Select
                    label="Kategoria"
                    value={identity.category}
                    onChange={(e) => setIdentityField("category", e.target.value)}
                    options={CATEGORY_OPTIONS}
                  />
                </>
              )}
              <TextField
                label="Waluta bazowa"
                required
                maxLength={3}
                value={fields.currencyBase}
                onChange={(e) => setField("currencyBase", e.target.value.toUpperCase())}
              />
              <TextField
                label="Waluta wyniku"
                required
                maxLength={3}
                value={fields.currencyProfit}
                onChange={(e) => setField("currencyProfit", e.target.value.toUpperCase())}
              />
              <TextField
                label="Waluta depozytu"
                required
                maxLength={3}
                value={fields.currencyMargin}
                onChange={(e) => setField("currencyMargin", e.target.value.toUpperCase())}
              />
              <TextField
                label="Miejsca dziesiętne (Digits)"
                type="number"
                min={0}
                max={10}
                required
                value={fields.digits}
                onChange={(e) => setField("digits", e.target.value)}
              />
              {BASIC_DECIMAL_FIELDS.map(({ key, label }) => (
                <TextField
                  key={key}
                  label={label}
                  required
                  inputMode="decimal"
                  value={fields[key] as string}
                  onChange={(e) => setField(key, e.target.value)}
                />
              ))}
            </div>

            <Button type="button" variant="secondary" onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced ? "Ukryj parametry zaawansowane" : "Pokaż parametry zaawansowane"}
            </Button>

            {showAdvanced && (
              <div className={styles.grid}>
                {ADVANCED_TEXT_FIELDS.map(({ key, label }) => (
                  <TextField
                    key={key}
                    label={label}
                    required
                    value={fields[key] as string}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                ))}
                {ADVANCED_INT_FIELDS.map(({ key, label }) => (
                  <TextField
                    key={key}
                    label={label}
                    type="number"
                    required
                    value={fields[key] as string}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                ))}
                {ADVANCED_DECIMAL_FIELDS.map(({ key, label }) => (
                  <TextField
                    key={key}
                    label={label}
                    required
                    inputMode="decimal"
                    value={fields[key] as string}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                ))}
                <TextField
                  label="Sesje kwotowań"
                  value={fields.quoteSessions}
                  onChange={(e) => setField("quoteSessions", e.target.value)}
                />
                <TextField
                  label="Sesje handlowe"
                  value={fields.tradeSessions}
                  onChange={(e) => setField("tradeSessions", e.target.value)}
                />
                <TextField
                  label="Data rozpoczęcia (opcjonalnie)"
                  value={fields.startTime}
                  onChange={(e) => setField("startTime", e.target.value)}
                />
                <TextField
                  label="Data wygaśnięcia (opcjonalnie)"
                  value={fields.expirationTime}
                  onChange={(e) => setField("expirationTime", e.target.value)}
                />
                <Checkbox
                  label="Spread zmienny (informacyjnie)"
                  checked={fields.spreadFloating}
                  onChange={(e) => setField("spreadFloating", e.target.checked)}
                />
                <Checkbox
                  label="Depozyt zabezpieczony liczony per noga"
                  checked={fields.marginHedgedUseLeg}
                  onChange={(e) => setField("marginHedgedUseLeg", e.target.checked)}
                />
              </div>
            )}

            {formError && (
              <p role="alert" className={styles.error}>
                {formError}
              </p>
            )}
            <div className={styles.actions}>
              <Button
                type="button"
                variant="secondary"
                onClick={isEdit ? cancelEdit : onClose}
                disabled={submitting}
              >
                Anuluj
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? "Zapisywanie..." : "Zapisz"}
              </Button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
