import type { ReactElement } from "react";
import { Copy } from "lucide-react";
import type { AnalizaWynik } from "../app/types/aiAnalysis";
import { analizaDoTekstu } from "../app/types/aiAnalysis";
import { Button } from "../ui/components/Button/Button";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./TradeAiAnalysis.module.css";

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
 * Wspólne renderowanie wyniku analizy AI: pięć sekcji (fakty/obserwacje/hipotezy/rekomendacje/
 * jakość danych) plus przycisk „Kopiuj analizę". Wyciągnięte z czterech paneli (analiza transakcji,
 * raportu, emocji, audytu) - były identyczne co do znaku i rozjeżdżały się przy każdej zmianie
 * (np. dodaniu sekcji „hipotezy"). Puste sekcje są pomijane. Stopkę (inną w każdym panelu) oraz
 * ewentualny baner nieaktualności zostawiamy panelom - tu jest tylko część wspólna.
 */
export function WynikAnalizy({
  wynik,
  naglowekKopiowania,
}: {
  wynik: AnalizaWynik;
  /** Opcjonalny wiersz kontekstu dopisywany na początku kopiowanego tekstu (np. „Analiza zakresu
   * …") - żeby wklejona analiza mówiła, czego dotyczyła. Na ekranie tę rolę pełni stopka panelu. */
  naglowekKopiowania?: string;
}): ReactElement {
  const { showToast } = useToast();

  async function kopiuj(): Promise<void> {
    try {
      await navigator.clipboard.writeText(analizaDoTekstu(wynik, naglowekKopiowania));
      showToast("Analiza skopiowana do schowka.", "success");
    } catch {
      showToast("Nie udało się skopiować do schowka.", "error");
    }
  }

  return (
    <>
      <Lista tytul="Fakty" pozycje={wynik.fakty} />
      <Lista tytul="Obserwacje" pozycje={wynik.obserwacje} />
      <Lista tytul="Hipotezy" pozycje={wynik.hipotezy} />
      <Lista tytul="Rekomendacje" pozycje={wynik.rekomendacje} />
      <Lista tytul="Jakość danych" pozycje={wynik.jakosc_danych} />
      <div className={styles.akcje}>
        <Button variant="secondary" onClick={() => void kopiuj()}>
          <Copy size={16} /> Kopiuj analizę
        </Button>
      </div>
    </>
  );
}
