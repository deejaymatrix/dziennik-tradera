import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { ChevronDown, ChevronRight, Copy, Trash2 } from "lucide-react";
import { invokeCommand, extractErrorMessage } from "../app/invokeCommand";
import type { AnalizaWynik, PozycjaHistorii } from "../app/types/aiAnalysis";
import { analizaDoTekstu, parsujWynik } from "../app/types/aiAnalysis";
import { Button } from "../ui/components/Button/Button";
import { useConfirm } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./HistoriaAnaliz.module.css";

const FORMAT_DATY = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "medium",
  timeStyle: "short",
});

function data(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : FORMAT_DATY.format(d);
}

function Lista({ tytul, pozycje }: { tytul: string; pozycje: string[] }): ReactElement | null {
  if (pozycje.length === 0) {
    return null;
  }
  return (
    <div className={styles.grupa}>
      <h5 className={styles.grupaTytul}>{tytul}</h5>
      <ul className={styles.punkty}>
        {pozycje.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Historia wykonanych analiz AI (Blok F, Etap 5). Lista zapisanych analiz - najnowsze pierwsze -
 * z datą, zakresem (której transakcji dotyczy), modelem i statusem. Każdą można rozwinąć, żeby
 * zobaczyć fakty/obserwacje/rekomendacje, usunąć pojedynczo albo wyczyścić wszystkie. Dane biorą
 * się z tego samego zapisu, który jest objęty kopią zapasową.
 */
export function HistoriaAnaliz(): ReactElement {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [pozycje, setPozycje] = useState<PozycjaHistorii[] | null>(null);
  const [rozwiniete, setRozwiniete] = useState<string | null>(null);

  const wczytaj = useCallback(async () => {
    try {
      setPozycje(await invokeCommand<PozycjaHistorii[]>("ai_analysis_history", {}));
    } catch (e) {
      showToast(extractErrorMessage(e), "error");
      setPozycje([]);
    }
  }, [showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void wczytaj();
  }, [wczytaj]);

  async function usun(id: string): Promise<void> {
    if (
      !(await confirm({
        message: "Usunąć tę analizę? Tej operacji nie można cofnąć.",
        danger: true,
        confirmLabel: "Usuń analizę",
      }))
    ) {
      return;
    }
    try {
      await invokeCommand("delete_trade_analysis", { id });
      showToast("Analiza usunięta.", "success");
      await wczytaj();
    } catch (e) {
      showToast(extractErrorMessage(e), "error");
    }
  }

  async function kopiuj(w: AnalizaWynik): Promise<void> {
    try {
      await navigator.clipboard.writeText(analizaDoTekstu(w));
      showToast("Analiza skopiowana do schowka.", "success");
    } catch {
      showToast("Nie udało się skopiować do schowka.", "error");
    }
  }

  async function usunWszystkie(): Promise<void> {
    if (
      !(await confirm({
        message: "Usunąć WSZYSTKIE zapisane analizy AI? Tej operacji nie można cofnąć.",
        danger: true,
        confirmLabel: "Usuń wszystkie",
      }))
    ) {
      return;
    }
    try {
      await invokeCommand("delete_all_ai_analyses", {});
      showToast("Wszystkie analizy AI usunięte.", "success");
      await wczytaj();
    } catch (e) {
      showToast(extractErrorMessage(e), "error");
    }
  }

  if (pozycje === null) {
    return <p className={styles.info}>Wczytywanie historii analiz…</p>;
  }

  if (pozycje.length === 0) {
    return (
      <p className={styles.info}>
        Nie ma jeszcze żadnych zapisanych analiz. Uruchom „Przeanalizuj z AI" przy transakcji, a
        wynik pojawi się tutaj (i w kopii zapasowej).
      </p>
    );
  }

  return (
    <div className={styles.historia}>
      <ul className={styles.lista}>
        {pozycje.map((p) => {
          const otwarte = rozwiniete === p.id;
          const wynik = parsujWynik(p.wynik_json);
          return (
            <li key={p.id} className={styles.pozycja}>
              <div className={styles.wiersz}>
                <button
                  type="button"
                  className={styles.naglowek}
                  onClick={() => setRozwiniete(otwarte ? null : p.id)}
                  aria-expanded={otwarte}
                >
                  {otwarte ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className={styles.zakres}>{p.etykieta_zakresu}</span>
                  <span className={styles.data}>{data(p.utworzono_o)}</span>
                  {p.status !== "ok" && (
                    <span className={styles.status}>
                      {p.status === "anulowana" ? "przerwana" : "błąd"}
                    </span>
                  )}
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void usun(p.id)}
                  title="Usuń analizę"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
              {otwarte && (
                <div className={styles.szczegoly}>
                  <Lista tytul="Fakty" pozycje={wynik.fakty} />
                  <Lista tytul="Obserwacje" pozycje={wynik.obserwacje} />
                  <Lista tytul="Hipotezy" pozycje={wynik.hipotezy} />
                  <Lista tytul="Rekomendacje" pozycje={wynik.rekomendacje} />
                  <Lista tytul="Jakość danych" pozycje={wynik.jakosc_danych} />
                  <div className={styles.akcje}>
                    <Button variant="secondary" size="sm" onClick={() => void kopiuj(wynik)}>
                      <Copy size={16} /> Kopiuj
                    </Button>
                  </div>
                  <p className={styles.stopka}>
                    Analiza typu „{p.typ_analizy}", model {p.wersja_modelu}. Objęta kopią zapasową.
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className={styles.akcje}>
        <Button variant="danger" onClick={() => void usunWszystkie()}>
          Usuń wszystkie analizy AI
        </Button>
      </div>
    </div>
  );
}
