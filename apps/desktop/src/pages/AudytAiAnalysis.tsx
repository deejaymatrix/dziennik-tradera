import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { ShieldCheck, StopCircle } from "lucide-react";
import { invokeCommand, extractErrorMessage } from "../app/invokeCommand";
import type { AnalizaWynik, StatusModeluAi } from "../app/types/aiAnalysis";
import { Button } from "../ui/components/Button/Button";
import { useToast } from "../ui/components/Toast/ToastProvider";
import { WynikAnalizy } from "./WynikAnalizy";
import styles from "./TradeAiAnalysis.module.css";

export interface AudytAiAnalysisProps {
  /** Konto, dla którego robimy audyt zachowania. */
  accountId: string;
  /** Ludzki opis zakresu do promptu i stopki (np. "Konto Główne · cała historia"). */
  zakresOpis: string;
  /** Czy można analizować - model włączony/pobrany i konto wybrane. */
  gotoweDoAnalizy: boolean;
}

/**
 * Audyt ZACHOWANIA tradera (Blok F, Etap 5): model ocenia skłonność do overtradingu, revenge
 * tradingu, łamania zasad i zwiększania ryzyka po stracie - na podstawie deterministycznych
 * sygnałów policzonych w Ruście (transakcji na dzień, wynik łamiących vs przestrzegających zasady,
 * handel po stracie: wynik i wolumen). Model nie liczy sam i nie diagnozuje. Wynik nie jest zapisywany.
 */
export function AudytAiAnalysis({
  accountId,
  zakresOpis,
  gotoweDoAnalizy,
}: AudytAiAnalysisProps): ReactElement {
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

  // Reset wyniku przy zmianie KONTA (tożsamość `accountId`, nie opis zakresu): dwa konta o tej samej
  // nazwie i walucie miałyby identyczny `zakresOpis`, a zmiana nazwy konta nie powinna kasować wciąż
  // ważnej analizy.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWynik(null);
  }, [accountId]);

  async function analizuj(): Promise<void> {
    setAnalizuje(true);
    try {
      const w = await invokeCommand<AnalizaWynik>("analyze_behavior", {
        accountId,
        zakresOpis,
      });
      setWynik(w);
      showToast("Audyt zachowania gotowy.", "success");
    } catch (e) {
      showToast(extractErrorMessage(e), "error");
    } finally {
      setAnalizuje(false);
    }
  }

  function przerwij(): void {
    void invokeCommand("cancel_ai_analysis", {}).catch(() => undefined);
  }

  return (
    <section className={styles.sekcja}>
      <h3 className={styles.sekcjaTytul}>
        <ShieldCheck size={15} /> Audyt zachowania
      </h3>

      {modelGotowy === false ? (
        <p className={styles.info}>
          Aby zrobić audyt, włącz Asystenta AI i pobierz model w Ustawieniach → Asystent AI.
        </p>
      ) : (
        <div className={styles.akcje}>
          <Button
            variant="primary"
            onClick={() => void analizuj()}
            loading={analizuje}
            disabled={!gotoweDoAnalizy || modelGotowy === null}
          >
            <ShieldCheck size={16} /> Zrób audyt zachowania z AI
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
          <WynikAnalizy wynik={wynik} naglowekKopiowania={`Audyt zachowania — „${zakresOpis}"`} />
          <p className={styles.stopka}>
            Audyt zachowania dla zakresu „{zakresOpis}". To interpretacja policzonych sygnałów, nie
            diagnoza ani gwarantowana porada.
          </p>
        </div>
      )}
    </section>
  );
}
