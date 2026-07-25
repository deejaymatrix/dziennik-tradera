import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Sparkles, StopCircle } from "lucide-react";
import { invokeCommand, extractErrorMessage } from "../app/invokeCommand";
import type { PostepPobrania, StatusModeluAi, ZapisanaAnaliza } from "../app/types/aiAnalysis";
import { opisPostepuPobierania, parsujWynik } from "../app/types/aiAnalysis";
import { Button } from "../ui/components/Button/Button";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./TradeAiAnalysis.module.css";

export interface TradeAiAnalysisProps {
  tradeId: string;
}

function gb(bajty: number): string {
  return `${(bajty / 1_000_000_000).toFixed(1)} GB`;
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
 * Sekcja "Asystent AI" w panelu szczegółów transakcji (Blok F, Etap 3). Trzy stany:
 * (1) model niepobrany - proponuje pobranie z pokazanym rozmiarem i zgodą użytkownika;
 * (2) model gotowy - przycisk "Przeanalizuj z AI" (albo "Analizuj ponownie") + ewentualny ostatni
 *     wynik; podczas analizy pokazuje "Przerwij analizę";
 * (3) jest zapisana analiza - fakty/obserwacje/rekomendacje, z banerem, gdy stała się nieaktualna
 *     (transakcja zmieniła się po jej wykonaniu).
 *
 * Analiza trwa dziesiątki sekund - backend robi to na osobnym wątku, tu tylko czekamy na wynik.
 */
export function TradeAiAnalysis({ tradeId }: TradeAiAnalysisProps): ReactElement {
  const { showToast } = useToast();
  const [statusModelu, setStatusModelu] = useState<StatusModeluAi | null>(null);
  const [ostatnia, setOstatnia] = useState<ZapisanaAnaliza | null>(null);
  const [analizuje, setAnalizuje] = useState(false);
  const [pobiera, setPobiera] = useState(false);
  const [postep, setPostep] = useState<PostepPobrania | null>(null);
  const ankieta = useRef<number | null>(null);

  const wczytajStan = useCallback(async () => {
    try {
      const [status, analiza] = await Promise.all([
        invokeCommand<StatusModeluAi>("ai_model_status", {}),
        invokeCommand<ZapisanaAnaliza | null>("get_trade_analysis", { tradeId }),
      ]);
      setStatusModelu(status);
      setOstatnia(analiza);
    } catch (e) {
      showToast(extractErrorMessage(e), "error");
    }
  }, [tradeId, showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void wczytajStan();
  }, [wczytajStan]);

  // Sprzątanie pętli odpytywania postępu przy odmontowaniu/zmianie transakcji.
  useEffect(() => {
    return () => {
      if (ankieta.current !== null) {
        window.clearInterval(ankieta.current);
      }
    };
  }, []);

  async function analizuj(): Promise<void> {
    setAnalizuje(true);
    try {
      const wynik = await invokeCommand<ZapisanaAnaliza>("analyze_trade", { tradeId });
      setOstatnia(wynik);
      showToast("Analiza AI gotowa.", "success");
    } catch (e) {
      showToast(extractErrorMessage(e), "error");
    } finally {
      setAnalizuje(false);
    }
  }

  function przerwij(): void {
    void invokeCommand("cancel_ai_analysis", {}).catch(() => undefined);
  }

  async function pobierzModel(): Promise<void> {
    setPobiera(true);
    setPostep(null);
    ankieta.current = window.setInterval(() => {
      void invokeCommand<PostepPobrania>("ai_model_download_progress", {})
        .then(setPostep)
        .catch(() => undefined);
    }, 1000);
    try {
      await invokeCommand("download_ai_model", {});
      showToast("Model AI pobrany i zweryfikowany.", "success");
      await wczytajStan();
    } catch (e) {
      showToast(extractErrorMessage(e), "error");
    } finally {
      // `ankieta.current` jest tu na pewno ustawiony (setInterval poszedł przed try), więc bez
      // guardu na null - TS to wie z przepływu, a guard byłby martwym warunkiem.
      window.clearInterval(ankieta.current);
      ankieta.current = null;
      setPobiera(false);
      setPostep(null);
    }
  }

  function przerwijPobieranie(): void {
    void invokeCommand("cancel_ai_model_download", {}).catch(() => undefined);
  }

  return (
    <section className={styles.sekcja}>
      <h3 className={styles.sekcjaTytul}>
        <Sparkles size={15} /> Asystent AI
      </h3>

      {statusModelu === null ? (
        <p className={styles.info}>Sprawdzanie stanu modelu...</p>
      ) : !statusModelu.gotowy ? (
        <div className={styles.pobieranie}>
          {pobiera ? (
            <>
              <p className={styles.info}>{opisPostepuPobierania(postep)}</p>
              <Button variant="secondary" onClick={przerwijPobieranie}>
                <StopCircle size={16} /> Przerwij pobieranie
              </Button>
            </>
          ) : (
            <>
              <p className={styles.info}>
                Analiza AI działa w pełni lokalnie i wymaga jednorazowego pobrania modelu{" "}
                <strong>{statusModelu.etykieta}</strong> ({gb(statusModelu.rozmiar_bajtow)}).
              </p>
              <Button variant="primary" onClick={() => void pobierzModel()}>
                Pobierz model AI ({gb(statusModelu.rozmiar_bajtow)})
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className={styles.akcje}>
          <Button variant="primary" onClick={() => void analizuj()} loading={analizuje}>
            <Sparkles size={16} /> {ostatnia ? "Analizuj ponownie" : "Przeanalizuj z AI"}
          </Button>
          {analizuje && (
            <Button variant="secondary" onClick={przerwij}>
              <StopCircle size={16} /> Przerwij analizę
            </Button>
          )}
        </div>
      )}

      {ostatnia && (
        <div className={styles.wynik}>
          {ostatnia.nieaktualna && (
            <p className={styles.baner} role="status">
              Analiza nieaktualna — dane transakcji zostały zmienione po jej wykonaniu.
            </p>
          )}
          {(() => {
            const w = parsujWynik(ostatnia.wynik_json);
            return (
              <>
                <Lista tytul="Fakty" pozycje={w.fakty} />
                <Lista tytul="Obserwacje" pozycje={w.obserwacje} />
                <Lista tytul="Rekomendacje" pozycje={w.rekomendacje} />
              </>
            );
          })()}
          <p className={styles.stopka}>
            Wygenerowane lokalnie ({ostatnia.wersja_modelu}). To interpretacja, nie gwarantowana
            porada finansowa.
          </p>
        </div>
      )}
    </section>
  );
}
