import { useEffect, useRef, useState } from "react";
import type { ReactElement, SubmitEvent } from "react";
import { Plus } from "lucide-react";
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
import type { AccountWithBalance } from "../app/types/account";
import type { PendingAttachment } from "../app/types/attachment";
import type { EmotionalState } from "../app/types/emotional_state";
import type {
  BrokerTemplate,
  InstrumentListFilter,
  InstrumentWithDetails,
} from "../app/types/instrument";
import type { Interval } from "../app/types/interval";
import type { Strategy } from "../app/types/strategy";
import type {
  MomentEmotion,
  Trade,
  TradeAuditEntry,
  TradeBalanceContext,
  TradeCalculation,
  TradeSide,
} from "../app/types/trade";
import { blankStrategyChecklist } from "../app/types/trade";
import { Button } from "../ui/components/Button/Button";
import { FormPanel } from "../ui/components/FormPanel/FormPanel";
import type { PanelStatus } from "../ui/components/FormPanel/FormPanel";
import { SessionField } from "./SessionField";
import { useConfirm } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { Modal } from "../ui/components/Modal/Modal";
import { Select } from "../ui/components/Select/Select";
import { Textarea } from "../ui/components/Textarea/Textarea";
import { TextField } from "../ui/components/TextField/TextField";
import { useToast } from "../ui/components/Toast/ToastProvider";
import { EmotionMomentEditor } from "./EmotionMomentEditor";
import { StrategyChecklistEditor } from "./StrategyChecklistEditor";
import { TradeAttachments } from "./TradeAttachments";
import { TradeAuditLog } from "./TradeAuditLog";
import { TradeBalanceCard } from "./TradeBalanceCard";
import { TradePreviewCard } from "./TradePreviewCard";
import styles from "./TradeFormModal.module.css";

export interface TradeFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  accountId: string;
  accountCurrency: string;
  accountBalance: string;
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
  accountBalance,
  trade,
}: TradeFormModalProps): ReactElement {
  const isEdit = Boolean(trade);
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [balanceContext, setBalanceContext] = useState<TradeBalanceContext | null>(null);
  const [auditLog, setAuditLog] = useState<TradeAuditEntry[] | null>(null);

  // Karta transakcji otwiera się domyślnie w trybie tylko-do-odczytu, pokazującym PRAWDZIWE
  // zapisane dane (nigdy zapomniany szkic z poprzedniej sesji) - szkic jest proponowany do
  // wczytania dopiero po kliknięciu "Edytuj" (patrz handleStartEdit). Nowa transakcja nie ma
  // czego pokazywać na sucho, więc od razu startuje w trybie edycji.
  const [mode, setMode] = useState<"view" | "edit">(() => (trade ? "view" : "edit"));
  const readOnly = isEdit && mode === "view";

  /** Szkic dopuszcza braki, finalny zapis przechodzi pełną walidację (sekcja 6.10). */
  type SaveMode = "draft" | "final";

  const [fields, setFields] = useState<TradeFormFields>(() => {
    if (trade) {
      return tradeToFormFields(trade);
    }
    // Nowa transakcja startuje ZAWSZE pusta. Wcześniej wczytywaliśmy tu lokalny autoszkic, przez
    // co formularz podpowiadał wartości z poprzedniej niezapisanej transakcji - mylące. Odkąd jest
    // jawny przycisk "Zapisz szkic", ten automatyczny szkic jest zbędny.
    return blankTradeFormFields();
  });
  const initialSnapshot = useRef(JSON.stringify(fields));

  // Załączniki NOWEJ transakcji - zbierane lokalnie (transakcja nie ma jeszcze id), wysyłane
  // na serwer po udanym create_trade. Świadomie poza autosave'em szkicu (localStorage nie
  // pomieści zdjęć); przed utratą chroni pytanie przy zamykaniu (patrz requestClose).
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);

  const [instruments, setInstruments] = useState<
    (InstrumentWithDetails & { isHidden?: boolean })[]
  >([]);
  /** Wyjaśnienie pustej listy instrumentów - patrz efekt pobierania list wyboru. */
  const [instrumentsHint, setInstrumentsHint] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [intervals, setIntervals] = useState<(Interval & { isHiddenOrArchived?: boolean })[]>([]);
  const [emotionalStates, setEmotionalStates] = useState<EmotionalState[]>([]);
  const [preview, setPreview] = useState<TradeCalculation | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // "Edytuj" i "Zapisz zmiany" zajmują to samo miejsce w stopce (prawy, główny przycisk) -
  // szybkie podwójne kliknięcie w "Edytuj" trafiałoby drugim kliknięciem już w nowo
  // podstawiony przycisk "Zapisz zmiany", zapisując transakcję bez żadnej zmiany i bez szansy
  // na edycję. Krótka blokada zapisu tuż po wejściu w tryb edycji temu zapobiega.
  const [submitLocked, setSubmitLocked] = useState(false);

  // Po otwarciu rozwinięte są dokładnie dwa pierwsze panele (sekcja 6.1). Zwinięcie panelu nie
  // odmontowuje jego zawartości - patrz `FormPanel` - więc nic się nie gubi.
  const [panels, setPanels] = useState({
    basics: true,
    params: true,
    costs: false,
    strategy: false,
    notes: false,
    attachments: false,
  });

  function togglePanel(panel: keyof typeof panels): void {
    setPanels((current) => ({ ...current, [panel]: !current[panel] }));
  }

  // Szybkie dodanie interwału wprost w formularzu (pełne zarządzanie jest w oknie "Interwały").
  const [addingInterval, setAddingInterval] = useState(false);
  const [newIntervalLabel, setNewIntervalLabel] = useState("");

  async function handleAddInterval(): Promise<void> {
    const label = newIntervalLabel.trim();
    if (!label) {
      return;
    }
    try {
      const created = await invokeCommand<Interval>("create_interval", { input: { label } });
      setIntervals((current) => [...current, created]);
      setField("intervalId", created.id);
      setNewIntervalLabel("");
      setAddingInterval(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Nie udało się dodać interwału.");
    }
  }

  // Id strategii, dla której `fields.checklist` została ostatnio zbudowana - pozwala odróżnić
  // "strategia się nie zmieniła, zachowaj checklistę" od "wybrano inną strategię, zbuduj świeżą
  // checklistę z jej aktualnych aktywnych zasad" (sekcja "Checklist w transakcji").
  const [checklistStrategyId, setChecklistStrategyId] = useState<string>(
    () => trade?.strategy_id ?? "",
  );

  useEffect(() => {
    // Jednorazowe pobranie list wyboru (instrumenty/strategie aktywne) przy otwarciu -
    // ta instancja komponentu jest zawsze dla jednej, stałej transakcji (key wymusza remount).
    void (async () => {
      try {
        // Instrumenty NIGDY nie są listowane bez kontekstu szablonu w przepływach związanych
        // z kontem (sekcja 1.1) - bez tego lista mieszała symbole ze WSZYSTKICH szablonów i
        // to samo EURUSD pojawiało się kilka razy, nie do odróżnienia. Szablon bierzemy
        // z przypisania do konta tej transakcji.
        const [accountTemplates, ownerAccount] = await Promise.all([
          invokeCommand<BrokerTemplate[]>("list_broker_templates", { includeArchived: false }),
          invokeCommand<AccountWithBalance>("get_account", { id: accountId }),
        ]);
        const templateForAccount = accountTemplates.find((t) => t.id === ownerAccount.template_id);
        const visibleFilter: InstrumentListFilter = {
          search: null,
          category: null,
          visibility: "visible",
          // Konto bez przypisanego szablonu (np. dodane po migracji, która podpięła szablon
          // startowy tylko do najstarszego konta) nie może zostać bez żadnych instrumentów -
          // wtedy świadomie pokazujemy wszystkie, zamiast pustej listy blokującej zapis.
          template_id: templateForAccount?.id ?? null,
        };
        const [instrumentsData, strategiesData, intervalsData, emotionalStatesData] =
          await Promise.all([
            invokeCommand<InstrumentWithDetails[]>("list_instruments", { filter: visibleFilter }),
            invokeCommand<Strategy[]>("list_strategies", { includeArchived: false }),
            invokeCommand<Interval[]>("list_intervals", {
              includeHidden: false,
              includeArchived: false,
            }),
            invokeCommand<EmotionalState[]>("list_emotional_states", { includeHidden: false }),
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
        // Pusta lista instrumentów ma powiedzieć DLACZEGO jest pusta. Instrumenty z importu
        // brokera są domyślnie ukryte, więc świeżo zaimportowany szablon (nawet z tysiącem
        // pozycji) daje tu zero wyboru i bez tej podpowiedzi wygląda to jak awaria aplikacji.
        if (instrumentsData.length === 0) {
          if (!templateForAccount) {
            setInstrumentsHint(
              "To konto nie ma przypisanego szablonu instrumentów. Przypisz go w Konta → kliknij konto → Szablon instrumentów.",
            );
          } else if (templateForAccount.instrument_count > 0) {
            setInstrumentsHint(
              `Szablon „${templateForAccount.name}" ma ${templateForAccount.instrument_count} instrumentów, ale żaden nie jest widoczny. Włącz te, którymi handlujesz, w zakładce Instrumenty.`,
            );
          } else {
            setInstrumentsHint(
              `Szablon „${templateForAccount.name}" nie ma jeszcze żadnych instrumentów. Zaimportuj dane brokera w zakładce Instrumenty.`,
            );
          }
        }
        setStrategies(strategiesData);
        // Ten sam wzorzec co ukryty instrument powyżej - jeśli edytowana transakcja używa
        // interwału ukrytego/zarchiwizowanego od tego czasu, pokaż go mimo to jako aktualnie
        // wybraną wartość z oznaczeniem.
        const selectedIntervalId = trade?.interval_id;
        if (selectedIntervalId && !intervalsData.some((i) => i.id === selectedIntervalId)) {
          try {
            const hidden = await invokeCommand<Interval>("get_interval", {
              id: selectedIntervalId,
            });
            setIntervals([...intervalsData, { ...hidden, isHiddenOrArchived: true }]);
          } catch {
            setIntervals(intervalsData);
          }
        } else {
          setIntervals(intervalsData);
        }
        setEmotionalStates(emotionalStatesData);
      } catch {
        // Brak list nie blokuje formularza - pola instrumentu/strategii po prostu będą puste.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jednorazowe pobranie przy montowaniu, `trade` jest stały dla tej instancji (key wymusza remount).
  }, []);

  useEffect(() => {
    // Autoszkic w localStorage dotyczy WYŁĄCZNIE edycji istniejącej transakcji - chroni
    // niezapisane zmiany, które można odzyskać w `handleStartEdit`. Dla NOWEJ transakcji celowo
    // nic nie zapisujemy, żeby następne otwarcie nie podpowiadało starych wartości (życzenie
    // użytkownika). W trybie tylko-do-odczytu też nie ma czego autosave'ować.
    if (readOnly || !trade) {
      return;
    }
    saveTradeDraft(accountId, trade.id, fields);
  }, [fields, accountId, trade, readOnly]);

  useEffect(() => {
    // Migawka salda sprzed rozpoczęcia edycji - pobrana raz przy otwarciu (sekcja "Saldo
    // przed/po/aktualne"), nie przelicza się na żywo przy zmianie pól w formularzu.
    if (!trade) {
      return;
    }
    void (async () => {
      try {
        const context = await invokeCommand<TradeBalanceContext>("get_trade_balance_context", {
          id: trade.id,
        });
        setBalanceContext(context);
      } catch {
        setBalanceContext(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jednorazowe pobranie przy montowaniu, `trade` jest stały dla tej instancji (key wymusza remount).
  }, []);

  useEffect(() => {
    if (!trade) {
      return;
    }
    void (async () => {
      try {
        const log = await invokeCommand<TradeAuditEntry[]>("list_trade_audit_log", {
          id: trade.id,
        });
        setAuditLog(log);
      } catch {
        setAuditLog(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jednorazowe pobranie przy montowaniu, `trade` jest stały dla tej instancji (key wymusza remount).
  }, []);

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

  function setEmotionMoment(moment: "before" | "during" | "after", value: MomentEmotion): void {
    setFields((current) => ({
      ...current,
      emotions: { ...current.emotions, [moment]: value },
    }));
  }

  function handleStrategyChange(newStrategyId: string): void {
    // Strategia się nie zmienia (ten sam wybór ponownie) - zachowaj istniejącą checklistę bez
    // zmian, nawet jeśli w międzyczasie zmieniono definicję strategii (sekcja "Checklist w
    // transakcji"). Zmiana na inną strategię (albo wyczyszczenie wyboru) buduje świeżą
    // checklistę z jej aktualnych, aktywnych zasad.
    if (newStrategyId === checklistStrategyId) {
      setField("strategyId", newStrategyId);
      return;
    }
    const selected = newStrategyId ? strategies.find((s) => s.id === newStrategyId) : undefined;
    const checklist = selected
      ? {
          entry: selected.entry_rules
            .filter((rule) => !rule.archived)
            .map((rule) => ({
              rule_id: rule.id,
              name: rule.name,
              required: rule.required,
              status: "not_applicable" as const,
            })),
          management: selected.management_rules
            .filter((rule) => !rule.archived)
            .map((rule) => ({
              rule_id: rule.id,
              name: rule.name,
              required: false,
              status: "not_applicable" as const,
            })),
        }
      : blankStrategyChecklist();
    setFields((current) => ({ ...current, strategyId: newStrategyId, checklist }));
    setChecklistStrategyId(newStrategyId);
  }

  async function requestClose(): Promise<void> {
    // Oczekujące załączniki nowej transakcji też liczą się jako niezapisane zmiany - w
    // odróżnieniu od pól NIE przetrwają zamknięcia (szkic w localStorage nie mieści zdjęć).
    const isDirty =
      JSON.stringify(fields) !== initialSnapshot.current || pendingAttachments.length > 0;
    if (
      isDirty &&
      !(await confirm(
        "Masz niezapisane zmiany w tej transakcji. Zamknąć formularz bez zapisywania? (szkic pól zostanie zachowany do następnego razu, ale niezapisane załączniki przepadną)",
      ))
    ) {
      return;
    }
    onClose();
  }

  async function handleStartEdit(): Promise<void> {
    if (trade) {
      const draft = loadTradeDraft(accountId, trade.id);
      const trueFields = tradeToFormFields(trade);
      if (draft && JSON.stringify(draft) !== JSON.stringify(trueFields)) {
        const useDraft = await confirm(
          "Znaleziono niezapisany szkic tej transakcji z poprzedniej sesji. Wczytać go zamiast aktualnie zapisanych danych?",
        );
        if (useDraft) {
          setFields(draft);
        }
      }
    }
    setMode("edit");
    // Patrz komentarz przy stanie `submitLocked` - "Zapisz zmiany" podstawia się w miejscu
    // "Edytuj", więc krótko po wejściu w tryb edycji ignorujemy zapis (chroni przed szybkim
    // podwójnym kliknięciem, które trafiłoby drugim kliknięciem w nowy przycisk).
    setSubmitLocked(true);
    window.setTimeout(() => setSubmitLocked(false), 500);
  }

  function handleCancelEdit(): void {
    if (trade) {
      const trueFields = tradeToFormFields(trade);
      setFields(trueFields);
      clearTradeDraft(accountId, trade.id);
      initialSnapshot.current = JSON.stringify(trueFields);
      setFormError(null);
      setMode("view");
      return;
    }
    void requestClose();
  }

  /** Wysyła lokalnie zebrane załączniki nowej transakcji już PO jej utworzeniu (dopiero wtedy
   * istnieje `tradeId`). Pojedyncze niepowodzenie nie przerywa reszty - transakcja jest już
   * zapisana, więc zgłaszamy tylko, których załączników zabrakło. */
  async function savePendingAttachments(tradeId: string): Promise<string[]> {
    const failures: string[] = [];
    for (const attachment of pendingAttachments) {
      try {
        if (attachment.kind === "screenshot") {
          await invokeCommand("add_screenshot_attachment_from_bytes", {
            tradeId,
            bytesBase64: attachment.bytesBase64,
            label: attachment.label,
          });
        } else {
          await invokeCommand("add_link_attachment", {
            tradeId,
            url: attachment.url,
            label: attachment.label,
          });
        }
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "nieoczekiwany błąd");
      }
    }
    return failures;
  }

  async function handleSubmit(
    event: SubmitEvent<HTMLFormElement> | null,
    mode: SaveMode,
  ): Promise<void> {
    event?.preventDefault();
    // Zabezpieczenie dodatkowe do `disabled` na przycisku - patrz komentarz przy stanie
    // `submitLocked` (szybkie podwójne kliknięcie "Edytuj" trafiające w podstawiony w tym samym
    // miejscu przycisk zapisu).
    if (submitLocked) {
      return;
    }
    setFormError(null);

    const formatError = validateTradeFormFormat(fields);
    if (formatError) {
      setFormError(formatError);
      return;
    }

    // Szkic może być niekompletny, finalny zapis nie (sekcja 6.3/6.10). Panel z brakującym
    // polem rozwijamy, żeby użytkownik zobaczył, o co chodzi, zamiast szukać po omacku.
    if (mode === "final" && !fields.strategyId) {
      setPanels((current) => ({ ...current, basics: true }));
      setFormError(
        "Wybierz strategię - transakcję można zapisać dopiero ze strategią. Bez niej użyj przycisku „Zapisz szkic”.",
      );
      return;
    }

    const input = buildTradeInput(fields, accountId);

    setSubmitting(true);
    try {
      if (isEdit && trade) {
        await invokeCommand("update_trade", {
          id: trade.id,
          expectedUpdatedAt: trade.updated_at,
          input,
        });
        showToast("Transakcja zaktualizowana.", "success");
      } else {
        const created = await invokeCommand<Trade>("create_trade", { input });
        const attachmentFailures = await savePendingAttachments(created.id);
        setPendingAttachments([]);
        if (attachmentFailures.length > 0) {
          showToast(
            `Transakcja zapisana, ale ${attachmentFailures.length} załączników się nie udało: ${attachmentFailures[0] ?? ""}`,
            "error",
          );
        } else {
          showToast("Transakcja zapisana.", "success");
        }
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

  /** Status sekcji liczony z tego, ile jej istotnych pól jest wypełnionych. */
  function statusFor(filled: number, total: number): PanelStatus {
    if (filled === 0) {
      return "empty";
    }
    return filled === total ? "complete" : "partial";
  }

  const basicsStatus = statusFor(
    [fields.instrumentId, fields.strategyId, fields.openedAt].filter(Boolean).length,
    3,
  );
  const paramsStatus = statusFor(
    [fields.volume, fields.entryPrice, fields.stopLoss].filter((v) => v.trim()).length,
    3,
  );
  const costsStatus: PanelStatus = [fields.commission, fields.swap, fields.otherFees].some(
    (v) => v.trim() && v.trim() !== "0",
  )
    ? "complete"
    : "empty";
  const strategyStatus: PanelStatus = fields.strategyId ? "complete" : "empty";
  const notesStatus = statusFor(
    [fields.planBefore.trim(), fields.conclusion.trim()].filter(Boolean).length,
    2,
  );

  /** Treści z pól usuniętych z formularza w sekcji 6.7 - pokazywane tylko do odczytu. */
  const legacyNotes = [
    { label: "Notatki z zarządzania pozycją", text: fields.managementNotes.trim() },
    { label: "Podsumowanie po transakcji", text: fields.postTradeSummary.trim() },
  ].filter((note) => note.text.length > 0);

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
  const intervalOptions = [
    { value: "", label: "Brak" },
    ...intervals.map((i) => ({
      value: i.id,
      label: i.isHiddenOrArchived ? `${i.label} (ukryty/zarchiwizowany)` : i.label,
    })),
  ];

  const title = !isEdit
    ? "Nowa transakcja"
    : mode === "edit"
      ? `Edytuj transakcję #${trade?.display_number}`
      : `Transakcja #${trade?.display_number}`;

  return (
    <Modal
      open={open}
      onClose={() => {
        void requestClose();
      }}
      title={title}
      size="wide"
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          void handleSubmit(event, "final");
        }}
      >
        <div className={styles.layout}>
          <div className={styles.panels}>
            <FormPanel
              title="Dane podstawowe"
              open={panels.basics}
              onToggle={() => togglePanel("basics")}
              status={basicsStatus}
            >
              <div className={styles.grid}>
                <Select
                  label="Instrument"
                  value={fields.instrumentId}
                  onChange={(e) => setField("instrumentId", e.target.value)}
                  options={instrumentOptions}
                  disabled={readOnly}
                  {...(instruments.length === 0 && instrumentsHint
                    ? { hint: instrumentsHint }
                    : {})}
                />
                <Select
                  label="Strategia"
                  value={fields.strategyId}
                  onChange={(e) => handleStrategyChange(e.target.value)}
                  options={strategyOptions}
                  disabled={readOnly}
                  hint="Wymagana przy zapisie transakcji - szkic można zapisać bez niej."
                />
                <Select
                  label="Kierunek"
                  value={fields.side}
                  onChange={(e) => setField("side", e.target.value as TradeSide)}
                  options={SIDE_OPTIONS}
                  disabled={readOnly}
                />
                <Select
                  label="Interwał (opcjonalnie)"
                  value={fields.intervalId}
                  onChange={(e) => setField("intervalId", e.target.value)}
                  options={intervalOptions}
                  disabled={readOnly}
                />
                {!readOnly &&
                  (addingInterval ? (
                    <div className={styles.intervalAddRow}>
                      <TextField
                        label="Nazwa nowego interwału"
                        value={newIntervalLabel}
                        onChange={(e) => setNewIntervalLabel(e.target.value)}
                        onKeyDown={(e) => {
                          // Enter tworzy interwał, ale NIE wysyła całego formularza transakcji.
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleAddInterval();
                          }
                        }}
                        placeholder="np. M10, sesja poranna"
                      />
                      <div className={styles.intervalAddActions}>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setAddingInterval(false);
                            setNewIntervalLabel("");
                          }}
                        >
                          Anuluj
                        </Button>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={!newIntervalLabel.trim()}
                          onClick={() => void handleAddInterval()}
                        >
                          Dodaj
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAddingInterval(true)}
                    >
                      <Plus size={14} aria-hidden="true" /> Nowy interwał
                    </Button>
                  ))}
              </div>

              <div className={styles.grid}>
                <TextField
                  label="Data otwarcia"
                  type="datetime-local"
                  step={1}
                  value={fields.openedAt}
                  onChange={(e) => setField("openedAt", e.target.value)}
                  disabled={readOnly}
                />
                <TextField
                  label="Data zamknięcia"
                  type="datetime-local"
                  step={1}
                  value={fields.closedAt}
                  onChange={(e) => setField("closedAt", e.target.value)}
                  disabled={readOnly}
                />
              </div>

              <SessionField
                value={fields.session}
                onChange={(value) => setField("session", value)}
                disabled={readOnly}
              />
            </FormPanel>

            <FormPanel
              title="Parametry transakcji"
              open={panels.params}
              onToggle={() => togglePanel("params")}
              status={paramsStatus}
            >
              <div className={styles.gridThree}>
                <TextField
                  label="Lot"
                  inputMode="decimal"
                  value={fields.volume}
                  onChange={(e) => setField("volume", e.target.value)}
                  disabled={readOnly}
                />
                <TextField
                  label="Cena wejścia"
                  inputMode="decimal"
                  value={fields.entryPrice}
                  onChange={(e) => setField("entryPrice", e.target.value)}
                  disabled={readOnly}
                />
                <TextField
                  label="Cena wyjścia"
                  inputMode="decimal"
                  value={fields.exitPrice}
                  onChange={(e) => setField("exitPrice", e.target.value)}
                  disabled={readOnly}
                />
                <TextField
                  label="Stop loss"
                  inputMode="decimal"
                  value={fields.stopLoss}
                  onChange={(e) => setField("stopLoss", e.target.value)}
                  disabled={readOnly}
                />
                <TextField
                  label="Take profit"
                  inputMode="decimal"
                  value={fields.takeProfit}
                  onChange={(e) => setField("takeProfit", e.target.value)}
                  disabled={readOnly}
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
                  disabled={readOnly}
                />
              ) : null}

              <FormPanel
                title="Koszty"
                open={panels.costs}
                onToggle={() => togglePanel("costs")}
                status={costsStatus}
                statusLabel={costsStatus === "empty" ? "Bez kosztów" : "Uzupełnione"}
              >
                <div className={styles.gridThree}>
                  <TextField
                    label="Prowizja"
                    inputMode="decimal"
                    value={fields.commission}
                    onChange={(e) => setField("commission", e.target.value)}
                    disabled={readOnly}
                  />
                  <TextField
                    label="Swap"
                    inputMode="decimal"
                    value={fields.swap}
                    onChange={(e) => setField("swap", e.target.value)}
                    disabled={readOnly}
                  />
                  <TextField
                    label="Dodatkowe opłaty"
                    inputMode="decimal"
                    value={fields.otherFees}
                    onChange={(e) => setField("otherFees", e.target.value)}
                    disabled={readOnly}
                  />
                </div>
              </FormPanel>
            </FormPanel>

            <FormPanel
              title="Strategia i spełnienie warunków"
              open={panels.strategy}
              onToggle={() => togglePanel("strategy")}
              status={strategyStatus}
            >
              <StrategyChecklistEditor
                checklist={fields.checklist}
                onChange={(checklist) => setField("checklist", checklist)}
                disabled={readOnly}
              />
            </FormPanel>

            <FormPanel
              title="Notatki i emocje"
              open={panels.notes}
              onToggle={() => togglePanel("notes")}
              status={notesStatus}
            >
              <Textarea
                label="Notatka do transakcji (opcjonalnie)"
                value={fields.planBefore}
                onChange={(e) => setField("planBefore", e.target.value)}
                disabled={readOnly}
              />
              <Textarea
                label="Wnioski po transakcji (opcjonalnie)"
                value={fields.conclusion}
                onChange={(e) => setField("conclusion", e.target.value)}
                disabled={readOnly}
              />
              <Select
                label="Ocena zgodności z planem (opcjonalnie)"
                value={fields.planAdherenceRating}
                onChange={(e) => setField("planAdherenceRating", e.target.value)}
                options={RATING_OPTIONS}
                disabled={readOnly}
              />

              {/* Pola "Notatki z zarządzania pozycją" i "Podsumowanie po transakcji" zniknęły
                  z formularza (sekcja 6.7), ale zapisane wcześniej treści NIE są kasowane -
                  pokazujemy je tylko do odczytu, żeby nic nie przepadło po cichu. */}
              {legacyNotes.length > 0 && (
                <div className={styles.legacyNotes}>
                  <p className={styles.legacyNotesTitle}>
                    Zapisane w starym układzie formularza (tylko do odczytu):
                  </p>
                  {legacyNotes.map((note) => (
                    <div key={note.label}>
                      <span className={styles.legacyNoteLabel}>{note.label}</span>
                      <p className={styles.legacyNoteText}>{note.text}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.emotionsSection}>
                <h3 className={styles.emotionsTitle}>Emocje</h3>
                <EmotionMomentEditor
                  label="Przed transakcją"
                  value={fields.emotions.before}
                  onChange={(value) => setEmotionMoment("before", value)}
                  states={emotionalStates}
                  disabled={readOnly}
                />
                <EmotionMomentEditor
                  label="W trakcie transakcji"
                  value={fields.emotions.during}
                  onChange={(value) => setEmotionMoment("during", value)}
                  states={emotionalStates}
                  disabled={readOnly}
                />
                <EmotionMomentEditor
                  label="Po transakcji"
                  value={fields.emotions.after}
                  onChange={(value) => setEmotionMoment("after", value)}
                  states={emotionalStates}
                  disabled={readOnly}
                />
              </div>
            </FormPanel>

            <FormPanel
              title="Wykres i załączniki"
              open={panels.attachments}
              onToggle={() => togglePanel("attachments")}
              status="empty"
              statusLabel="Opcjonalne"
            >
              {isEdit && trade ? (
                <TradeAttachments tradeId={trade.id} />
              ) : (
                <TradeAttachments
                  pending={pendingAttachments}
                  onPendingChange={setPendingAttachments}
                />
              )}
            </FormPanel>

            {isEdit && <TradeAuditLog entries={auditLog} />}
          </div>

          <aside className={styles.summary}>
            <TradeBalanceCard
              isEdit={isEdit}
              context={balanceContext}
              currentBalance={accountBalance}
              currency={accountCurrency}
            />
            <TradePreviewCard calculation={preview} currency={accountCurrency} />
          </aside>
        </div>

        {formError && (
          <p role="alert" className={styles.error}>
            {formError}
          </p>
        )}
        <div className={styles.actions}>
          {readOnly ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void requestClose();
                }}
              >
                Zamknij
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  void handleStartEdit();
                }}
              >
                Edytuj
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={handleCancelEdit}>
                Anuluj
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={submitting || submitLocked}
                onClick={() => {
                  void handleSubmit(null, "draft");
                }}
              >
                Zapisz szkic
              </Button>
              <Button type="submit" variant="primary" disabled={submitting || submitLocked}>
                {submitting ? "Zapisywanie..." : "Zapisz transakcję"}
              </Button>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}
