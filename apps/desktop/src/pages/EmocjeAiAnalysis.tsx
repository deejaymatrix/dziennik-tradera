import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Copy, HeartPulse, StopCircle } from "lucide-react";
import { invokeCommand, extractErrorMessage } from "../app/invokeCommand";
import type { AnalizaWynik, StatusModeluAi } from "../app/types/aiAnalysis";
import { analizaDoTekstu } from "../app/types/aiAnalysis";
import { Button } from "../ui/components/Button/Button";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./TradeAiAnalysis.module.css";

export interface EmocjeAiAnalysisProps {
  /** Konto, dla którego liczymy korelację emocja↔wynik. */
  accountId: string;
  /** Ludzki opis zakresu do promptu i stopki (np. "Konto Główne · cała historia"). */
  zakresOpis: string;
  /** Czy można analizować - model włączony/pobrany i konto wybrane. */
  gotoweDoAnalizy: boolean;
}

function Lista({ tytul, pozycje }: { tytul: string; pozycje: string[] }): ReactElement | null {
  if (pozycje.length === 0) {
    return null;
  }
  return (
    <div className={styles.grupa}>
      <h4 className={styles.grupaTytul}>{tytul}</h4>
      <ul className={styles.lista}>
        {pozycje.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Dedykowana analiza EMOCJONALNA (Blok F, Etap 5): model szuka zależności między emocjami a
 * wynikami na podstawie deterministycznego zestawienia (dla każdej emocji liczba transakcji,
 * wygrane/przegrane, win rate, wynik netto - liczone w Ruście tą samą matematyką co raporty).
 * Model nie liczy sam i nie diagnozuje chorób. Wynik nie jest zapisywany.
 */
export function EmocjeAiAnalysis({
  accountId,
  zakresOpis,
  gotoweDoAnalizy,
}: EmocjeAiAnalysisProps): ReactElement {
  const { showToast } = useToast();
  const [modelGotowy, setModelGotowy] = useState<boolean | null>(null);
  const [analizuje, setAnalizuje] = useState(false);
  const [wynik, setWynik] = useState<AnalizaWynik | null>(null);

  const wczytajModel = useCallback(async () => {
    try {
      const s = await invokeCommand<StatusModeluAi>("ai_model_status", {});
      setModelGotowy(s.gotowy && s.wlaczony);
    } catch {
      setModelGotowy(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void wczytajModel();
  }, [wczytajModel]);

  // Zmiana konta/zakresu unieważnia poprzedni wynik.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWynik(null);
  }, [zakresOpis]);

  async function analizuj(): Promise<void> {
    setAnalizuje(true);
    try {
      const w = await invokeCommand<AnalizaWynik>("analyze_emotions", {
        accountId,
        zakresOpis,
      });
      setWynik(w);
      showToast("Analiza emocjonalna gotowa.", "success");
    } catch (e) {
      showToast(extractErrorMessage(e), "error");
    } finally {
      setAnalizuje(false);
    }
  }

  function przerwij(): void {
    void invokeCommand("cancel_ai_analysis", {}).catch(() => undefined);
  }

  async function kopiuj(w: AnalizaWynik): Promise<void> {
    try {
      await navigator.clipboard.writeText(analizaDoTekstu(w));
      showToast("Analiza skopiowana do schowka.", "success");
    } catch {
      showToast("Nie udało się skopiować do schowka.", "error");
    }
  }

  return (
    <section className={styles.sekcja}>
      <h3 className={styles.sekcjaTytul}>
        <HeartPulse size={15} /> Analiza emocjonalna
      </h3>

      {modelGotowy === false ? (
        <p className={styles.info}>
          Aby analizować emocje, włącz Asystenta AI i pobierz model w Ustawieniach → Asystent AI.
        </p>
      ) : (
        <div className={styles.akcje}>
          <Button
            variant="primary"
            onClick={() => void analizuj()}
            loading={analizuje}
            disabled={!gotoweDoAnalizy || modelGotowy === null}
          >
            <HeartPulse size={16} /> Przeanalizuj emocje z AI
          </Button>
          {analizuje && (
            <Button variant="secondary" onClick={przerwij}>
              <StopCircle size={16} /> Przerwij analizę
            </Button>
          )}
        </div>
      )}

      {wynik && (
        <div className={styles.wynik}>
          <Lista tytul="Fakty" pozycje={wynik.fakty} />
          <Lista tytul="Obserwacje" pozycje={wynik.obserwacje} />
          <Lista tytul="Hipotezy" pozycje={wynik.hipotezy} />
          <Lista tytul="Rekomendacje" pozycje={wynik.rekomendacje} />
          <Lista tytul="Jakość danych" pozycje={wynik.jakosc_danych} />
          <div className={styles.akcje}>
            <Button variant="secondary" onClick={() => void kopiuj(wynik)}>
              <Copy size={16} /> Kopiuj analizę
            </Button>
          </div>
          <p className={styles.stopka}>
            Korelacja emocja↔wynik dla zakresu „{zakresOpis}". To interpretacja policzonych danych,
            nie diagnoza ani gwarantowana porada.
          </p>
        </div>
      )}
    </section>
  );
}
