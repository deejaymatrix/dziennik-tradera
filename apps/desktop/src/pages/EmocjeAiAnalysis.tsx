import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { HeartPulse, StopCircle } from "lucide-react";
import { invokeCommand, extractErrorMessage } from "../app/invokeCommand";
import type { AnalizaWynik, StatusModeluAi } from "../app/types/aiAnalysis";
import { Button } from "../ui/components/Button/Button";
import { useToast } from "../ui/components/Toast/ToastProvider";
import { WynikAnalizy } from "./WynikAnalizy";
import styles from "./TradeAiAnalysis.module.css";

export interface EmocjeAiAnalysisProps {
  /** Konto, dla którego liczymy korelację emocja↔wynik. */
  accountId: string;
  /** Ludzki opis zakresu do promptu i stopki (np. "Konto Główne · cała historia"). */
  zakresOpis: string;
  /** Czy można analizować - model włączony/pobrany i konto wybrane. */
  gotoweDoAnalizy: boolean;
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

  // Zmiana KONTA unieważnia poprzedni wynik. Klucz to tożsamość konta (`accountId`), nie opis
  // zakresu: dwa konta o tej samej nazwie i walucie miałyby identyczny `zakresOpis` (stary wynik by
  // został), a sama zmiana nazwy konta nie powinna kasować wciąż ważnej analizy.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWynik(null);
  }, [accountId]);

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
          <WynikAnalizy
            wynik={wynik}
            naglowekKopiowania={`Analiza emocjonalna — „${zakresOpis}"`}
          />
          <p className={styles.stopka}>
            Korelacja emocja↔wynik dla zakresu „{zakresOpis}". To interpretacja policzonych danych,
            nie diagnoza ani gwarantowana porada.
          </p>
        </div>
      )}
    </section>
  );
}
