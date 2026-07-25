import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { Send, StopCircle } from "lucide-react";
import { invokeCommand, extractErrorMessage } from "../app/invokeCommand";
import type { FilteredReport, ReportFilter } from "../app/types/report";
import type { WiadomoscCzatu } from "../app/types/aiAnalysis";
import { Button } from "../ui/components/Button/Button";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./ChatAi.module.css";

/** Poniżej tylu transakcji ostrzegamy o małej próbie - wnioski z garstki transakcji bywają
 * przypadkowe, a użytkownik ma o tym wiedzieć, zanim potraktuje odpowiedź poważnie. */
const PROG_MALEJ_PROBY = 20;

/** Poprawna polska odmiana rzeczownika „transakcja" przez liczbę (1 / 2-4 / 5+, z wyjątkiem
 * nastek 12-14, które idą jak „5+"). */
function odmianaTransakcji(n: number): string {
  const ostatnia = n % 10;
  const nastki = n % 100;
  if (n === 1) {
    return "transakcja";
  }
  if (ostatnia >= 2 && ostatnia <= 4 && !(nastki >= 12 && nastki <= 14)) {
    return "transakcje";
  }
  return "transakcji";
}

export interface ChatAiProps {
  /** Zakres danych, po których czatujemy (snake_case, z `toReportFilter`). */
  filter: ReportFilter;
  /** Ludzki opis zakresu - wpleciony w pakiet danych i pokazany nad rozmową. */
  zakresOpis: string;
  /** Czy można rozmawiać: model pobrany i konto wybrane. */
  gotowe: boolean;
}

/**
 * Czat po WŁASNYCH danych (Blok F, Etap 5). Model odpowiada na pytania o wybrany zakres na
 * podstawie zagregowanych, policzonych przez aplikację danych - nigdy nie liczy sam i nie zmyśla
 * (obrona po stronie promptu systemowego w Rust). Historia rozmowy żyje TYLKO tu, w stanie
 * komponentu - nic nie jest zapisywane. Jedna odpowiedź naraz (ten sam silnik co analiza), z
 * możliwością przerwania.
 */
export function ChatAi({ filter, zakresOpis, gotowe }: ChatAiProps): ReactElement {
  const { showToast } = useToast();
  const [historia, setHistoria] = useState<WiadomoscCzatu[]>([]);
  const [pytanie, setPytanie] = useState("");
  const [mysli, setMysli] = useState(false);
  const [liczbaTransakcji, setLiczbaTransakcji] = useState<number | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  // Zmiana zakresu (inne konto) to inna rozmowa - czyścimy historię, żeby nie mieszać danych.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistoria([]);
  }, [zakresOpis]);

  // Podstawa danych: pobieramy liczbę transakcji w zakresie z tego samego deterministycznego
  // silnika raportów, którego fakty widzi model - żeby pokazać, na ilu transakcjach opiera się
  // rozmowa (i ostrzec, gdy to za mała próba na sensowne wnioski).
  useEffect(() => {
    if (!filter.account_id) {
      return;
    }
    let aktualne = true;
    void invokeCommand<FilteredReport>("get_filtered_report", { filter })
      .then((raport) => {
        if (aktualne) {
          setLiczbaTransakcji(raport.stats.total_trades);
        }
      })
      .catch(() => {
        if (aktualne) {
          setLiczbaTransakcji(null);
        }
      });
    return () => {
      aktualne = false;
    };
    // Zależność po `account_id` (prymityw), nie po `filter` (nowy obiekt co render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.account_id]);

  // Po każdej nowej wiadomości przewijamy na dół, żeby najnowsza była widoczna.
  useEffect(() => {
    const el = listaRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [historia, mysli]);

  async function wyslij(): Promise<void> {
    const tresc = pytanie.trim();
    if (tresc === "" || mysli || !gotowe) {
      return;
    }
    // Historia SPRZED tego pytania idzie do backendu; pytanie osobno (tak buduje wiadomości Rust).
    const historiaPrzed = historia;
    setHistoria([...historiaPrzed, { rola: "uzytkownik", tresc }]);
    setPytanie("");
    setMysli(true);
    try {
      const odpowiedz = await invokeCommand<string>("ai_chat", {
        filter,
        zakresOpis,
        historia: historiaPrzed,
        pytanie: tresc,
      });
      setHistoria((h) => [...h, { rola: "asystent", tresc: odpowiedz.trim() }]);
    } catch (e) {
      showToast(extractErrorMessage(e), "error");
      // Cofnij optymistyczne pytanie i zwróć je do pola - można poprawić i wysłać ponownie.
      setHistoria(historiaPrzed);
      setPytanie(tresc);
    } finally {
      setMysli(false);
    }
  }

  function przerwij(): void {
    void invokeCommand("cancel_ai_analysis", {}).catch(() => undefined);
  }

  function naKlawisz(e: KeyboardEvent<HTMLTextAreaElement>): void {
    // Enter wysyła, Shift+Enter to nowa linia - jak w typowym czacie.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void wyslij();
    }
  }

  if (!gotowe) {
    return (
      <p className={styles.info}>
        Aby porozmawiać o swoich danych, pobierz najpierw model (wyżej) i wybierz konto.
      </p>
    );
  }

  return (
    <div className={styles.czat}>
      {liczbaTransakcji !== null && (
        <p className={styles.podstawa}>
          Podstawa: <strong>{liczbaTransakcji}</strong> {odmianaTransakcji(liczbaTransakcji)} ·{" "}
          {zakresOpis}
          {liczbaTransakcji < PROG_MALEJ_PROBY && (
            <span className={styles.ostrzezenie}> — mała próba, wnioski mogą być niepewne.</span>
          )}
        </p>
      )}
      <div className={styles.rozmowa} ref={listaRef} aria-live="polite">
        {historia.length === 0 && !mysli ? (
          <p className={styles.pusto}>
            Zapytaj o wyniki wybranego zakresu, np. „Które strategie wychodzą mi najlepiej?" albo „W
            które dni tygodnia tracę najczęściej?". Odpowiedzi opieram wyłącznie na policzonych
            danych: <strong>{zakresOpis}</strong>.
          </p>
        ) : (
          historia.map((w, i) => (
            <div
              key={i}
              className={w.rola === "uzytkownik" ? styles.odUzytkownika : styles.odAsystenta}
            >
              {w.tresc}
            </div>
          ))
        )}
        {mysli && <div className={styles.odAsystenta}>Myślę…</div>}
      </div>

      <div className={styles.wejscie}>
        <textarea
          className={styles.pole}
          value={pytanie}
          onChange={(e) => setPytanie(e.target.value)}
          onKeyDown={naKlawisz}
          placeholder="Zadaj pytanie o swoje dane…"
          rows={2}
          disabled={mysli}
        />
        {mysli ? (
          <Button variant="secondary" onClick={przerwij}>
            <StopCircle size={16} /> Przerwij
          </Button>
        ) : (
          <Button variant="primary" onClick={() => void wyslij()} disabled={pytanie.trim() === ""}>
            <Send size={16} /> Wyślij
          </Button>
        )}
      </div>
      <p className={styles.stopka}>
        Rozmowa jest lokalna i nigdzie nie zapisywana. To interpretacja policzonych danych, nie
        gwarantowana porada finansowa.
      </p>
    </div>
  );
}
