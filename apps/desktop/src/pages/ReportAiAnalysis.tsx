import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Sparkles, StopCircle } from "lucide-react";
import { invokeCommand, extractErrorMessage } from "../app/invokeCommand";
import type { ReportFilter } from "../app/types/report";
import type { AnalizaWynik, StatusModeluAi } from "../app/types/aiAnalysis";
import { Button } from "../ui/components/Button/Button";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./TradeAiAnalysis.module.css";

export interface ReportAiAnalysisProps {
  /** Filtr w postaci snake_case (z `toReportFilter`) - dokładnie ten sam, co karmi raport. */
  filter: ReportFilter;
  /** Ludzki opis zakresu do promptu i nagłówka (np. "Konto Główne · EURUSD · 2026-03"). */
  zakresOpis: string;
  /** Czy jest co analizować - konto wybrane i raport wczytany. */
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
 * Analiza CAŁOŚCIOWA na stronie Raporty (Blok F, Etap 5): bierze bieżący filtr raportu (dowolny
 * zakres - okres, konto, instrument, strategia, interwał, kierunek) i każe modelowi znaleźć wzorce
 * w zagregowanych danych. Wynik nie jest zapisywany - pokazujemy go tu, bo raporty są przeglądowe.
 */
export function ReportAiAnalysis({
  filter,
  zakresOpis,
  gotoweDoAnalizy,
}: ReportAiAnalysisProps): ReactElement {
  const { showToast } = useToast();
  const [modelGotowy, setModelGotowy] = useState<boolean | null>(null);
  const [analizuje, setAnalizuje] = useState(false);
  const [wynik, setWynik] = useState<AnalizaWynik | null>(null);

  const wczytajModel = useCallback(async () => {
    try {
      const s = await invokeCommand<StatusModeluAi>("ai_model_status", {});
      // Wyłączony Asystent AI traktujemy jak brak gotowości - i tak backend odrzuciłby analizę.
      setModelGotowy(s.gotowy && s.wlaczony);
    } catch {
      setModelGotowy(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void wczytajModel();
  }, [wczytajModel]);

  // Zmiana zakresu unieważnia poprzedni wynik - inaczej pokazywałby analizę innego okresu.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWynik(null);
  }, [zakresOpis]);

  async function analizuj(): Promise<void> {
    setAnalizuje(true);
    try {
      const w = await invokeCommand<AnalizaWynik>("analyze_report", {
        filter,
        zakresOpis,
      });
      setWynik(w);
      showToast("Analiza raportu gotowa.", "success");
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
        <Sparkles size={15} /> Analiza AI całego zakresu
      </h3>

      {modelGotowy === false ? (
        <p className={styles.info}>
          Aby analizować, włącz Asystenta AI i pobierz model w Ustawieniach → Asystent AI.
        </p>
      ) : (
        <div className={styles.akcje}>
          <Button
            variant="primary"
            onClick={() => void analizuj()}
            loading={analizuje}
            disabled={!gotoweDoAnalizy || modelGotowy === null}
          >
            <Sparkles size={16} /> Przeanalizuj ten zakres z AI
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
          <p className={styles.stopka}>
            Analiza zagregowanych danych zakresu „{zakresOpis}". To interpretacja, nie gwarantowana
            porada finansowa.
          </p>
        </div>
      )}
    </section>
  );
}
