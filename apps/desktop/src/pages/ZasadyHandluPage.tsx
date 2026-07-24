import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { useBlocker } from "react-router";
import { invokeCommand } from "../app/invokeCommand";
import { normalizeQuestion } from "../app/types/trading_rules";
import type { TradingRulesState, TradingRulesWrite } from "../app/types/trading_rules";
import { Button } from "../ui/components/Button/Button";
import { Checkbox } from "../ui/components/Checkbox/Checkbox";
import { useConfirm } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { useOptionalConfirm } from "../app/useOptionalConfirm";
import { EditModeActions } from "../ui/components/EditModeActions/EditModeActions";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ErrorState } from "../ui/components/ErrorState/ErrorState";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { Textarea } from "../ui/components/Textarea/Textarea";
import { TextField } from "../ui/components/TextField/TextField";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./ZasadyHandluPage.module.css";

/** Lokalny, edytowalny kształt zakładki - spłaszczany do `TradingRulesWrite` przy zapisie. */
interface EditRule {
  id: string | null;
  question: string;
  answer: string;
  hidden: boolean;
  isBuiltin: boolean;
  /** Oznaczone w trybie edycji jako "Do kosza" - znika z widoku, przy zapisie trafia do Kosza. */
  archived: boolean;
}

interface EditCategory {
  id: string | null;
  name: string;
  isBuiltin: boolean;
  rules: EditRule[];
}

function stateToEdit(state: TradingRulesState): EditCategory[] {
  return state.categories.map((category) => ({
    id: category.id,
    name: category.name,
    isBuiltin: category.is_builtin,
    rules: state.rules
      .filter((rule) => rule.category_id === category.id && rule.archived_at === null)
      .map((rule) => ({
        id: rule.id,
        question: rule.question,
        answer: rule.answer ?? "",
        hidden: rule.hidden,
        isBuiltin: rule.is_builtin,
        archived: false,
      })),
  }));
}

function editToWrite(categories: EditCategory[]): TradingRulesWrite {
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    rules: categories.flatMap((category, categoryIndex) =>
      category.rules.map((rule) => ({
        id: rule.id,
        category_index: categoryIndex,
        question: rule.question,
        answer: rule.answer.trim() ? rule.answer : null,
        hidden: rule.hidden,
        archived: rule.archived,
      })),
    ),
  };
}

function move<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(index, 1);
  if (item !== undefined) {
    next.splice(target, 0, item);
  }
  return next;
}

/**
 * Zakładka "Zasady handlu" (Faza 8) - osobisty regulamin użytkownika, niezależny od zasad
 * konkretnej strategii. Układ kart kategorii (zwijanych), tryb odczytu do naciśnięcia "Edytuj"
 * (ten sam wzorzec co karta transakcji), zapis zbiorczy jedną komendą.
 */
export function ZasadyHandluPage(): ReactElement {
  const { showToast } = useToast();
  const optionalConfirm = useOptionalConfirm();
  const confirm = useConfirm();
  const [state, setState] = useState<TradingRulesState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [restoringTemplates, setRestoringTemplates] = useState(false);

  async function load(): Promise<void> {
    setError(null);
    try {
      setState(await invokeCommand<TradingRulesState>("get_trading_rules", {}));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  // Ostrzeżenie przed opuszczeniem zakładki z niezapisanymi zmianami (wymóg specyfikacji).
  const blocker = useBlocker(editing);
  useEffect(() => {
    if (blocker.state === "blocked") {
      void (async () => {
        const proceed = await confirm(
          "Masz niezapisane zmiany w zasadach handlu. Opuścić zakładkę bez zapisywania?",
        );
        if (proceed) {
          blocker.proceed();
        } else {
          blocker.reset();
        }
      })();
    }
  }, [blocker, confirm]);

  function startEditing(): void {
    if (!state) {
      return;
    }
    setDraft(stateToEdit(state));
    setEditing(true);
  }

  function cancelEditing(): void {
    setDraft([]);
    setEditing(false);
  }

  /** Wykrywanie duplikatów przy dodawaniu pytania (sekcja "Usuwanie powtórzeń"): identyczna
   * znormalizowana treść blokuje z ostrzeżeniem; bardzo podobna (jedna zawiera drugą) proponuje
   * scalenie zamiast automatycznej blokady - odpowiedzi nigdy nie są łączone bez potwierdzenia. */
  async function checkDuplicate(
    categoryIndex: number,
    question: string,
    ruleIndex: number | null,
  ): Promise<boolean> {
    const normalized = normalizeQuestion(question);
    if (!normalized) {
      return true;
    }
    const category = draft[categoryIndex];
    if (!category) {
      return true;
    }
    for (let i = 0; i < category.rules.length; i++) {
      const rule = category.rules[i];
      if (rule === undefined || i === ruleIndex || rule.archived) {
        continue;
      }
      const other = normalizeQuestion(rule.question);
      if (other === normalized) {
        showToast(`Pytanie "${rule.question}" już istnieje w tej kategorii.`, "error");
        return false;
      }
      if (
        other.length > 4 &&
        normalized.length > 4 &&
        (other.includes(normalized) || normalized.includes(other))
      ) {
        const merge = await confirm(
          `Bardzo podobne pytanie już istnieje: "${rule.question}".\n\nPołączyć je (zachować istniejące) zamiast dodawać nowe?`,
        );
        if (merge) {
          return false;
        }
      }
    }
    return true;
  }

  async function addQuestion(categoryIndex: number): Promise<void> {
    const question = window.prompt("Treść nowego pytania:");
    if (!question?.trim()) {
      return;
    }
    if (!(await checkDuplicate(categoryIndex, question, null))) {
      return;
    }
    setDraft((current) =>
      current.map((category, i) =>
        i === categoryIndex
          ? {
              ...category,
              rules: [
                ...category.rules,
                {
                  id: null,
                  question: question.trim(),
                  answer: "",
                  hidden: false,
                  isBuiltin: false,
                  archived: false,
                },
              ],
            }
          : category,
      ),
    );
  }

  function addCategory(): void {
    const name = window.prompt("Nazwa nowej kategorii:");
    if (!name?.trim()) {
      return;
    }
    setDraft((current) => [
      ...current,
      { id: null, name: name.trim(), isBuiltin: false, rules: [] },
    ]);
  }

  function updateRule(categoryIndex: number, ruleIndex: number, patch: Partial<EditRule>): void {
    setDraft((current) =>
      current.map((category, ci) =>
        ci === categoryIndex
          ? {
              ...category,
              rules: category.rules.map((rule, ri) =>
                ri === ruleIndex ? { ...rule, ...patch } : rule,
              ),
            }
          : category,
      ),
    );
  }

  async function handleSave(): Promise<void> {
    // Autorytatywna kontrola duplikatów jest w backendzie; tu tylko szybka walidacja pustych pól.
    setSaving(true);
    try {
      const saved = await invokeCommand<TradingRulesState>("save_trading_rules", {
        write: editToWrite(draft),
      });
      setState(saved);
      setEditing(false);
      setDraft([]);
      showToast("Zasady handlu zapisane.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleRestoreTemplates(): Promise<void> {
    if (
      !(await confirm({
        message:
          "Przywrócić szablon pytań? Treść pytań wbudowanych wróci do oryginału, ukryte i zarchiwizowane pytania wbudowane wrócą na listę. Twoje odpowiedzi i własne pytania pozostaną nietknięte.",
        confirmLabel: "Przywróć szablon",
      }))
    ) {
      return;
    }
    setRestoringTemplates(true);
    try {
      setState(await invokeCommand<TradingRulesState>("restore_trading_rule_templates", {}));
      showToast("Szablon pytań przywrócony (odpowiedzi nietknięte).", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    } finally {
      setRestoringTemplates(false);
    }
  }

  if (error) {
    return (
      <div className={styles.page}>
        <ErrorState
          title="Nie udało się wczytać zasad handlu"
          description={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Spróbuj ponownie
            </Button>
          }
        />
      </div>
    );
  }
  if (!state) {
    return (
      <div className={styles.page}>
        <Skeleton height="12rem" />
      </div>
    );
  }

  const readCategories = stateToEdit(state);
  const categories = editing ? draft : readCategories;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Zasady handlu</h2>
          <p className={styles.subtitle}>
            Twój osobisty regulamin - niezależny od zasad konkretnej strategii.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Checkbox
            label="Pokaż ukryte"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
          />
          <EditModeActions
            editing={editing}
            saving={saving}
            onEdit={startEditing}
            onCancel={cancelEditing}
            onSave={() => {
              void handleSave();
            }}
            readOnlyExtra={
              <Button
                variant="secondary"
                loading={restoringTemplates}
                onClick={() => {
                  void handleRestoreTemplates();
                }}
              >
                Przywróć szablon
              </Button>
            }
          />
        </div>
      </div>

      {editing && (
        <div className={styles.editBar}>
          <Button size="sm" variant="secondary" onClick={addCategory}>
            <Plus size={14} /> Dodaj kategorię
          </Button>
        </div>
      )}

      {categories.length === 0 && !editing && (
        <EmptyState
          title="Brak zasad handlu"
          description="Zasady to Twoja checklista przed wejściem w pozycję. Włącz tryb edycji, żeby dodać pierwszą kategorię i jej zasady."
          action={
            <Button variant="primary" onClick={() => setEditing(true)}>
              Dodaj pierwsze zasady
            </Button>
          }
        />
      )}

      {categories.map((category, categoryIndex) => {
        const visibleRules = category.rules
          .map((rule, ruleIndex) => ({ rule, ruleIndex }))
          .filter(({ rule }) => !rule.archived && (showHidden || !rule.hidden || editing));
        return (
          <details key={category.id ?? `new-${categoryIndex}`} className={styles.category} open>
            <summary className={styles.categorySummary}>
              <span className={styles.categoryName}>{category.name}</span>
              <span className={styles.categoryCount}>{visibleRules.length} pytań</span>
              {editing && (
                <span className={styles.categoryActions}>
                  <IconButton
                    icon={<ArrowUp size={14} />}
                    aria-label={`Przesuń kategorię wyżej: ${category.name}`}
                    disabled={categoryIndex === 0}
                    onClick={() => setDraft((c) => move(c, categoryIndex, -1))}
                  />
                  <IconButton
                    icon={<ArrowDown size={14} />}
                    aria-label={`Przesuń kategorię niżej: ${category.name}`}
                    disabled={categoryIndex === categories.length - 1}
                    onClick={() => setDraft((c) => move(c, categoryIndex, 1))}
                  />
                  <IconButton
                    icon={<Plus size={14} />}
                    aria-label={`Dodaj pytanie: ${category.name}`}
                    onClick={() => {
                      void addQuestion(categoryIndex);
                    }}
                  />
                </span>
              )}
            </summary>
            <div className={styles.rules}>
              {visibleRules.length === 0 && (
                <p className={styles.emptyHint}>Brak widocznych pytań w tej kategorii.</p>
              )}
              {visibleRules.map(({ rule, ruleIndex }) => (
                <div key={rule.id ?? `new-${ruleIndex}`} className={styles.ruleCard}>
                  {editing ? (
                    <>
                      <div className={styles.ruleHeader}>
                        <TextField
                          label="Pytanie"
                          value={rule.question}
                          onChange={(e) =>
                            updateRule(categoryIndex, ruleIndex, { question: e.target.value })
                          }
                          onBlur={(e) => {
                            void checkDuplicate(categoryIndex, e.target.value, ruleIndex);
                          }}
                          className={styles.questionField}
                        />
                        <div className={styles.ruleActions}>
                          <IconButton
                            icon={<ArrowUp size={14} />}
                            aria-label={`Przesuń wyżej: ${rule.question}`}
                            disabled={ruleIndex === 0}
                            onClick={() =>
                              setDraft((current) =>
                                current.map((c, ci) =>
                                  ci === categoryIndex
                                    ? { ...c, rules: move(c.rules, ruleIndex, -1) }
                                    : c,
                                ),
                              )
                            }
                          />
                          <IconButton
                            icon={<ArrowDown size={14} />}
                            aria-label={`Przesuń niżej: ${rule.question}`}
                            disabled={ruleIndex === category.rules.length - 1}
                            onClick={() =>
                              setDraft((current) =>
                                current.map((c, ci) =>
                                  ci === categoryIndex
                                    ? { ...c, rules: move(c.rules, ruleIndex, 1) }
                                    : c,
                                ),
                              )
                            }
                          />
                          <IconButton
                            icon={<Trash2 size={14} />}
                            aria-label={`Do kosza: ${rule.question}`}
                            onClick={() => {
                              void (async () => {
                                if (
                                  await optionalConfirm(
                                    "trash",
                                    `Przenieść pytanie "${rule.question}" do kosza?`,
                                  )
                                ) {
                                  updateRule(categoryIndex, ruleIndex, { archived: true });
                                }
                              })();
                            }}
                          />
                        </div>
                      </div>
                      <Textarea
                        label="Odpowiedź"
                        value={rule.answer}
                        onChange={(e) =>
                          updateRule(categoryIndex, ruleIndex, { answer: e.target.value })
                        }
                        rows={2}
                      />
                      <Checkbox
                        label="Ukryte"
                        checked={rule.hidden}
                        onChange={(e) =>
                          updateRule(categoryIndex, ruleIndex, { hidden: e.target.checked })
                        }
                      />
                    </>
                  ) : (
                    <>
                      <p
                        className={[styles.question, rule.hidden ? styles.hiddenRule : ""]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {rule.question}
                        {rule.hidden && <span className={styles.hiddenBadge}> (ukryte)</span>}
                      </p>
                      <p className={rule.answer ? styles.answer : styles.answerEmpty}>
                        {rule.answer || "Brak odpowiedzi - kliknij Edytuj, aby ją uzupełnić."}
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
