import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { useNavigate } from "react-router";
import { Search } from "lucide-react";
import { NAV_GROUPS } from "./nav";
import { NEW_TRADE_PARAM } from "./Header";
import styles from "./CommandPalette.module.css";

interface Command {
  id: string;
  label: string;
  /** Grupa pokazywana obok nazwy - pomaga odróżnić „Konta" (widok) od „Nowa transakcja" (akcja). */
  hint: string;
  run: () => void;
}

/**
 * Paleta poleceń otwierana skrótem `Ctrl+K` (sekcja 5.3 promptu).
 *
 * Świadomie NIE zawiera żadnej operacji niszczącej - prompt wprost tego zabrania. Trwałe
 * usuwanie, opróżnianie kosza i przywracanie kopii zostają wyłącznie tam, gdzie mają pełny
 * kontekst i ostrzeżenia.
 *
 * Zbudowana bez dodatkowej zależności: to zwykłe pole tekstowe i lista, obsłużone klawiaturą.
 */
export function CommandPalette(): ReactElement | null {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  const commands = useMemo<Command[]>(() => {
    const przejscia = NAV_GROUPS.flatMap((group) =>
      group.items.map((item) => ({
        id: `nav:${item.to}`,
        label: item.label,
        hint: group.label,
        run: () => void navigate(item.to),
      })),
    );
    return [
      {
        id: "action:new-trade",
        label: "Nowa transakcja",
        hint: "Akcja",
        run: () => void navigate(`/transakcje?${NEW_TRADE_PARAM}=1`),
      },
      {
        id: "action:check-updates",
        label: "Sprawdź aktualizacje",
        hint: "Akcja",
        run: () => void navigate("/ustawienia"),
      },
      ...przejscia,
    ];
  }, [navigate]);

  const wyniki = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return commands;
    }
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Skrót działa globalnie, więc nasłuch siedzi na dokumencie, a nie na komponencie.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  function uruchom(index: number): void {
    const wybrane = wyniki[index];
    if (!wybrane) {
      return;
    }
    // Zamykamy PRZED wykonaniem - polecenie zwykle przenosi na inny widok, a paleta nie ma
    // prawa zostać nad nim otwarta.
    close();
    wybrane.run();
  }

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Paleta poleceń">
        <div className={styles.searchRow}>
          <Search size={16} aria-hidden="true" className={styles.searchIcon} />
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Wpisz, czego szukasz..."
            value={query}
            aria-label="Szukaj polecenia"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                close();
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((i) => (wyniki.length === 0 ? 0 : (i + 1) % wyniki.length));
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((i) =>
                  wyniki.length === 0 ? 0 : (i - 1 + wyniki.length) % wyniki.length,
                );
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                uruchom(active);
              }
            }}
          />
        </div>

        {wyniki.length === 0 ? (
          <p className={styles.empty}>Nic nie pasuje do „{query}”.</p>
        ) : (
          <ul className={styles.list}>
            {wyniki.map((command, index) => (
              <li key={command.id}>
                <button
                  type="button"
                  className={[styles.item, index === active ? styles.itemActive : null]
                    .filter(Boolean)
                    .join(" ")}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => uruchom(index)}
                >
                  <span className={styles.itemLabel}>{command.label}</span>
                  <span className={styles.itemHint}>{command.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
