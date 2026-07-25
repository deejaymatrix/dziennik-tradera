import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { StopCircle } from "lucide-react";
import { invokeCommand, extractErrorMessage } from "../../app/invokeCommand";
import type {
  OpisModeluStatus,
  PostepPobrania,
  StatusModeluAi,
  UstawieniaOdpowiedziAi,
} from "../../app/types/aiAnalysis";
import { opisPostepuPobierania } from "../../app/types/aiAnalysis";
import { Button } from "../../ui/components/Button/Button";
import { Select } from "../../ui/components/Select/Select";
import { useConfirm } from "../../ui/components/ConfirmDialog/ConfirmDialog";
import { useToast } from "../../ui/components/Toast/ToastProvider";
import styles from "./AiSection.module.css";

function gb(bajty: number): string {
  return `${(bajty / 1_000_000_000).toFixed(1)} GB`;
}

/**
 * Sekcja "Asystent AI" w Ustawieniach: wybór jednego z trzech lokalnych modeli, ich stan
 * (pobrany/aktywny) i pobranie/usunięcie AKTYWNEGO modelu. Analizę odpala się przy transakcji -
 * tu tylko zarządzanie modelem.
 */
export function AiSection(): ReactElement {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [modele, setModele] = useState<OpisModeluStatus[] | null>(null);
  const [wlaczony, setWlaczony] = useState<boolean | null>(null);
  const [odpowiedzi, setOdpowiedzi] = useState<UstawieniaOdpowiedziAi | null>(null);
  const [pobiera, setPobiera] = useState(false);
  const [postep, setPostep] = useState<PostepPobrania | null>(null);
  const ankieta = useRef<number | null>(null);

  const wczytaj = useCallback(async () => {
    try {
      const [lista, status, style] = await Promise.all([
        invokeCommand<OpisModeluStatus[]>("ai_list_models", {}),
        invokeCommand<StatusModeluAi>("ai_model_status", {}),
        invokeCommand<UstawieniaOdpowiedziAi>("ai_response_settings", {}),
      ]);
      setModele(lista);
      setWlaczony(status.wlaczony);
      setOdpowiedzi(style);
    } catch (e) {
      showToast(extractErrorMessage(e), "error");
    }
  }, [showToast]);

  async function przelaczWlaczenie(nowy: boolean): Promise<void> {
    try {
      await invokeCommand("ai_set_enabled", { enabled: nowy });
      setWlaczony(nowy);
    } catch (e) {
      showToast(extractErrorMessage(e), "error");
    }
  }

  async function zmienOdpowiedzi(zmiana: Partial<UstawieniaOdpowiedziAi>): Promise<void> {
    if (odpowiedzi === null) {
      return;
    }
    const nowe = { ...odpowiedzi, ...zmiana };
    setOdpowiedzi(nowe);
    try {
      await invokeCommand("ai_set_response_settings", { ustawienia: nowe });
    } catch (e) {
      showToast(extractErrorMessage(e), "error");
      void wczytaj(); // cofnij optymistyczną zmianę do stanu z backendu
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void wczytaj();
    return () => {
      if (ankieta.current !== null) {
        window.clearInterval(ankieta.current);
      }
    };
  }, [wczytaj]);

  async function wybierz(id: string): Promise<void> {
    try {
      await invokeCommand("ai_set_model", { id });
      await wczytaj();
    } catch (e) {
      showToast(extractErrorMessage(e), "error");
    }
  }

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
      window.clearInterval(ankieta.current);
      ankieta.current = null;
      setPobiera(false);
      setPostep(null);
    }
  }

  async function usun(): Promise<void> {
    if (
      !(await confirm({
        message: "Usunąć pobrany model z dysku? Trzeba go będzie pobrać ponownie, żeby analizować.",
        danger: true,
        confirmLabel: "Usuń model",
      }))
    ) {
      return;
    }
    try {
      await invokeCommand("delete_ai_model", {});
      showToast("Model AI usunięty.", "success");
      await wczytaj();
    } catch (e) {
      showToast(extractErrorMessage(e), "error");
    }
  }

  if (modele === null) {
    return <p className={styles.info}>Wczytywanie listy modeli...</p>;
  }

  const aktywny = modele.find((m) => m.aktywny) ?? null;
  const zajeteMiejsce = modele.reduce((s, m) => s + (m.pobrany ? m.rozmiar_bajtow : 0), 0);

  return (
    <div className={styles.sekcja}>
      <label className={styles.przelacznik}>
        <input
          type="checkbox"
          checked={wlaczony === true}
          onChange={(e) => void przelaczWlaczenie(e.target.checked)}
          disabled={wlaczony === null}
        />
        <span className={styles.nazwa}>Asystent AI włączony</span>
      </label>
      {wlaczony === false && (
        <p className={styles.info}>
          Asystent AI jest wyłączony — analizy i czat są niedostępne, dopóki go nie włączysz. Model
          i historia analiz zostają nietknięte.
        </p>
      )}

      <p className={styles.info}>
        Wybierz model, którym Asystent AI analizuje transakcje. Wszystkie działają w pełni lokalnie.
        Większy model daje dokładniejszą analizę, ale liczy wolniej; mniejszy jest szybszy, lecz
        płytszy.
      </p>

      <fieldset className={styles.lista} disabled={pobiera}>
        <legend className={styles.legenda}>Model</legend>
        {modele.map((m) => (
          <label key={m.id} className={styles.pozycja}>
            <input
              type="radio"
              name="model-ai"
              checked={m.aktywny}
              onChange={() => void wybierz(m.id)}
            />
            <span className={styles.opis}>
              <span className={styles.nazwa}>{m.etykieta}</span>
              <span className={styles.meta}>
                {gb(m.rozmiar_bajtow)} · {m.pobrany ? "pobrany" : "niepobrany"}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <p className={styles.info}>
        Zajęte miejsce na dysku (pobrane modele): <strong>{gb(zajeteMiejsce)}</strong>.
      </p>

      {aktywny && (
        <div className={styles.akcje}>
          {pobiera ? (
            <>
              <span className={styles.info}>{opisPostepuPobierania(postep)}</span>
              <Button
                variant="secondary"
                onClick={() =>
                  void invokeCommand("cancel_ai_model_download", {}).catch(() => undefined)
                }
              >
                <StopCircle size={16} /> Przerwij pobieranie
              </Button>
            </>
          ) : aktywny.pobrany ? (
            <Button variant="danger" onClick={() => void usun()}>
              Usuń pobrany model ({aktywny.etykieta})
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void pobierz()}>
              Pobierz wybrany model ({gb(aktywny.rozmiar_bajtow)})
            </Button>
          )}
        </div>
      )}

      {odpowiedzi && (
        <fieldset className={styles.lista}>
          <legend className={styles.legenda}>Styl odpowiedzi</legend>
          <Select
            label="Język odpowiedzi"
            value={odpowiedzi.jezyk}
            onChange={(e) =>
              void zmienOdpowiedzi({
                jezyk: e.target.value as UstawieniaOdpowiedziAi["jezyk"],
              })
            }
            options={[
              { value: "polski", label: "Polski" },
              { value: "angielski", label: "Angielski" },
            ]}
            compact
          />
          <Select
            label="Szczegółowość odpowiedzi"
            value={odpowiedzi.szczegolowosc}
            onChange={(e) =>
              void zmienOdpowiedzi({
                szczegolowosc: e.target.value as UstawieniaOdpowiedziAi["szczegolowosc"],
              })
            }
            options={[
              { value: "zwiezle", label: "Zwięźle" },
              { value: "standardowe", label: "Standardowo" },
              { value: "szczegolowe", label: "Szczegółowo" },
            ]}
            compact
          />
        </fieldset>
      )}
    </div>
  );
}
