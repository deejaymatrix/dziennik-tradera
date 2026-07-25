import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Sparkles, StopCircle } from "lucide-react";
import { invokeCommand, extractErrorMessage } from "../app/invokeCommand";
import type { PostepPobrania, StatusModeluAi } from "../app/types/aiAnalysis";
import { opisPostepuPobierania } from "../app/types/aiAnalysis";
import type { AccountWithBalance } from "../app/types/account";
import type { ReportFilter } from "../app/types/report";
import { Button } from "../ui/components/Button/Button";
import { Select } from "../ui/components/Select/Select";
import { SectionCard } from "../ui/components/SectionCard/SectionCard";
import { useToast } from "../ui/components/Toast/ToastProvider";
import { ReportAiAnalysis } from "./ReportAiAnalysis";
import { ChatAi } from "./ChatAi";
import { HistoriaAnaliz } from "./HistoriaAnaliz";
import styles from "./AsystentAiPage.module.css";

function gb(bajty: number): string {
  return `${(bajty / 1_000_000_000).toFixed(1)} GB`;
}

/**
 * Przegląd Asystenta AI (Blok F, Etap 3). GŁÓWNE wejście do analizy to przycisk "Przeanalizuj z
 * AI" przy transakcji - ta strona daje kontekst (co to jest, że działa lokalnie) i zarządzanie
 * modelem: pobranie, usunięcie, usunięcie wszystkich zapisanych analiz.
 */
export function AsystentAiPage(): ReactElement {
  const { showToast } = useToast();
  const [status, setStatus] = useState<StatusModeluAi | null>(null);
  const [pobiera, setPobiera] = useState(false);
  const [postep, setPostep] = useState<PostepPobrania | null>(null);
  const [konta, setKonta] = useState<AccountWithBalance[]>([]);
  const [wybraneKonto, setWybraneKonto] = useState("");
  const ankieta = useRef<number | null>(null);

  const wczytaj = useCallback(async () => {
    try {
      setStatus(await invokeCommand<StatusModeluAi>("ai_model_status", {}));
    } catch (e) {
      showToast(extractErrorMessage(e), "error");
    }
  }, [showToast]);

  const wczytajKonta = useCallback(async () => {
    try {
      const lista = await invokeCommand<AccountWithBalance[]>("list_accounts", {
        includeArchived: false,
      });
      setKonta(lista);
      // Domyślnie pierwsze konto - żeby analiza całościowa była o jeden klik, a nie o wybór.
      setWybraneKonto((biezace) => biezace || (lista[0]?.id ?? ""));
    } catch {
      // Brak listy kont nie blokuje reszty strony (model, zapisane analizy).
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void wczytaj();
    void wczytajKonta();
    return () => {
      if (ankieta.current !== null) {
        window.clearInterval(ankieta.current);
      }
    };
  }, [wczytaj, wczytajKonta]);

  async function pobierz(): Promise<void> {
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
      await wczytaj();
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

  const konto = konta.find((k) => k.id === wybraneKonto) ?? null;
  // Filtr „cała historia konta" - te same pola co na ekranie Raporty, tylko bez żadnego zawężenia.
  const filtrCalegoKonta: ReportFilter = {
    account_id: wybraneKonto,
    instrument_id: null,
    strategy_id: null,
    interval_id: null,
    side: null,
    year: null,
    month: null,
  };
  const zakresOpis = konto ? `${konto.name} (${konto.currency}) · cała historia` : "";

  return (
    <div className={styles.strona}>
      <SectionCard>
        <div className={styles.naglowek}>
          <h2 className={styles.tytul}>
            <Sparkles size={20} /> Asystent AI
          </h2>
          <p className={styles.opis}>
            Lokalny asystent analizuje Twoje transakcje w pełni na tym komputerze - bez konta, bez
            klucza API, bez wysyłania danych do sieci. Analizę pojedynczej transakcji uruchomisz
            przyciskiem <strong>„Przeanalizuj z AI"</strong> w jej szczegółach. Wyniki to
            interpretacja, nie gwarantowana porada finansowa.
          </p>
        </div>
      </SectionCard>

      <SectionCard>
        <h3 className={styles.podtytul}>Model</h3>
        {status === null ? (
          <p className={styles.info}>Sprawdzanie stanu modelu...</p>
        ) : status.gotowy ? (
          <p className={styles.info}>
            Model <strong>{status.etykieta}</strong> ({gb(status.rozmiar_bajtow)}) jest pobrany i
            gotowy. Model usuniesz w <strong>Ustawieniach → Asystent AI</strong>.
          </p>
        ) : pobiera ? (
          <div className={styles.akcje}>
            <p className={styles.info}>{opisPostepuPobierania(postep)}</p>
            <Button
              variant="secondary"
              onClick={() =>
                void invokeCommand("cancel_ai_model_download", {}).catch(() => undefined)
              }
            >
              <StopCircle size={16} /> Przerwij pobieranie
            </Button>
          </div>
        ) : (
          <>
            <p className={styles.info}>
              Model <strong>{status.etykieta}</strong> nie jest jeszcze pobrany. Jednorazowe
              pobranie zajmuje {gb(status.rozmiar_bajtow)} miejsca na dysku.
            </p>
            <div className={styles.akcje}>
              <Button variant="primary" onClick={() => void pobierz()}>
                Pobierz model AI ({gb(status.rozmiar_bajtow)})
              </Button>
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard>
        <h3 className={styles.podtytul}>Analiza całościowa</h3>
        <p className={styles.info}>
          Przeanalizuj <strong>całą historię wybranego konta</strong> naraz - model szuka wzorców w
          zagregowanych, policzonych przez aplikację danych (wyniki, serie, rozbicia wg strategii,
          instrumentu, dnia tygodnia). Analizę węższego okresu albo pojedynczej
          strategii/instrumentu zrobisz na ekranie <strong>Raporty</strong>, wybierając zakres i
          klikając „Przeanalizuj ten zakres z AI".
        </p>
        {konta.length === 0 ? (
          <p className={styles.info}>Dodaj najpierw konto, żeby było co analizować.</p>
        ) : (
          <>
            <Select
              label="Konto"
              value={wybraneKonto}
              onChange={(e) => setWybraneKonto(e.target.value)}
              options={konta.map((k) => ({ value: k.id, label: `${k.name} (${k.currency})` }))}
              compact
            />
            <ReportAiAnalysis
              filter={filtrCalegoKonta}
              zakresOpis={zakresOpis}
              gotoweDoAnalizy={wybraneKonto !== ""}
            />
          </>
        )}
      </SectionCard>

      <SectionCard>
        <h3 className={styles.podtytul}>Czat z danymi</h3>
        <p className={styles.info}>
          Zadawaj pytania o wyniki wybranego wyżej konta - model odpowiada wyłącznie na podstawie
          policzonych danych (nie zmyśla liczb). Rozmowa jest lokalna i nigdzie nie zapisywana.
        </p>
        <ChatAi
          filter={filtrCalegoKonta}
          zakresOpis={zakresOpis}
          gotowe={status !== null && status.gotowy && status.wlaczony && wybraneKonto !== ""}
        />
      </SectionCard>

      <SectionCard>
        <h3 className={styles.podtytul}>Historia analiz</h3>
        <HistoriaAnaliz />
      </SectionCard>
    </div>
  );
}
