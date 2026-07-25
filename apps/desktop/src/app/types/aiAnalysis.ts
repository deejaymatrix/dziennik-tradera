// Typy Asystenta AI (Blok F) - odpowiadają strukturom z Rust (application/ai_analysis.rs,
// domain/ai_analysis.rs, infrastructure/ai_model_download.rs). Nazwy pól MUSZĄ się zgadzać z
// serializacją serde po stronie backendu.

/** Ustrukturyzowany wynik analizy (zserializowany w `wynik_json`). `hipotezy` i `jakosc_danych`
 * doszły później - starsze zapisy ich nie mają, więc `parsujWynik` domyśla je jako puste. */
export interface AnalizaWynik {
  fakty: string[];
  obserwacje: string[];
  hipotezy: string[];
  rekomendacje: string[];
  jakosc_danych: string[];
}

/** Zapisana analiza odczytana z bazy (`ZapisanaAnaliza` w Rust). `nieaktualna` liczone przy
 * odczycie: transakcja zmieniła się po wykonaniu analizy. */
export interface ZapisanaAnaliza {
  id: string;
  trade_id: string;
  typ_analizy: string;
  utworzono_o: string;
  wersja_modelu: string;
  wersja_szablonu: string;
  wynik_json: string;
  wynik_tekstowy: string;
  status: "ok" | "blad" | "anulowana";
  nieaktualna: boolean;
}

/** Status modelu AI (`StatusModeluAi`) - do decyzji, czy pokazać przycisk analizy, czy pobranie. */
export interface StatusModeluAi {
  gotowy: boolean;
  etykieta: string;
  rozmiar_bajtow: number;
  /** Czy Asystent AI jest włączony (Ustawienia → Asystent AI). Wyłączony chowa wejścia do AI. */
  wlaczony: boolean;
}

/** Postęp pobierania modelu (`PostepPobrania`). `weryfikacja` = przeliczanie już pobranych
 * fragmentów do sumy kontrolnej przy wznowieniu (pasek wtedy nie rusza - to normalne). */
export interface PostepPobrania {
  pobrano_bajtow: number;
  calkowity_rozmiar: number;
  status: "trwa" | "weryfikacja" | "zweryfikowano" | "anulowano" | "blad";
}

/** Formatuje bajty jako „X.Y GB" (dziesiętne GB, spójnie z resztą UI pobierania). */
export function gigabajty(bajty: number): string {
  return `${(bajty / 1_000_000_000).toFixed(1)} GB`;
}

/** Pełna etykieta fazy pobierania do UI. Kluczowe: przy `weryfikacja` (przeliczanie już pobranych
 * fragmentów przy wznowieniu) pasek postępu STOI - piszemy wprost, że sprawdzamy, żeby nie
 * wyglądało na zawieszone. */
export function opisPostepuPobierania(postep: PostepPobrania | null): string {
  if (postep?.status === "weryfikacja") {
    return "Sprawdzam już pobrane fragmenty…";
  }
  if (postep && postep.calkowity_rozmiar > 0) {
    return `Pobieranie — ${gigabajty(postep.pobrano_bajtow)} / ${gigabajty(postep.calkowity_rozmiar)}`;
  }
  return "Pobieranie…";
}

/** Ustawienia stylu odpowiedzi AI (`UstawieniaOdpowiedziAi`) - język i szczegółowość. */
export interface UstawieniaOdpowiedziAi {
  jezyk: "polski" | "angielski";
  szczegolowosc: "zwiezle" | "standardowe" | "szczegolowe";
}

/** Jeden z kandydatów na model z jego stanem (`OpisModeluStatus`) - do wyboru w Ustawieniach. */
export interface OpisModeluStatus {
  id: string;
  etykieta: string;
  rozmiar_bajtow: number;
  pobrany: boolean;
  aktywny: boolean;
}

/** Jedna pozycja historii wykonanych analiz (`PozycjaHistorii` w Rust). `wynik_json` pozwala
 * rozwinąć fakty/obserwacje/rekomendacje bez osobnego zapytania. */
export interface PozycjaHistorii {
  id: string;
  typ_analizy: string;
  utworzono_o: string;
  wersja_modelu: string;
  status: "ok" | "blad" | "anulowana";
  etykieta_zakresu: string;
  wynik_json: string;
}

/** Składa czytelny tekst całej analizy (do skopiowania/wklejenia). Pomija puste sekcje - dokładnie
 * jak panele na ekranie, które ich nie pokazują. Kolejność jak w UI: fakty → obserwacje → hipotezy
 * → rekomendacje → jakość danych. Opcjonalny `naglowek` (np. „Analiza zakresu …") jest dopisywany
 * na początku, żeby wklejona gdzieś analiza mówiła, czego dotyczyła - na ekranie tę rolę pełni
 * stopka panelu, ale sam schowek by ją gubił. */
export function analizaDoTekstu(w: AnalizaWynik, naglowek?: string): string {
  const sekcje: [string, string[]][] = [
    ["Fakty", w.fakty],
    ["Obserwacje", w.obserwacje],
    ["Hipotezy", w.hipotezy],
    ["Rekomendacje", w.rekomendacje],
    ["Jakość danych", w.jakosc_danych],
  ];
  const tresc = sekcje
    .filter(([, pozycje]) => pozycje.length > 0)
    .map(([tytul, pozycje]) => `${tytul}:\n${pozycje.map((p) => `- ${p}`).join("\n")}`)
    .join("\n\n");
  const czolo = naglowek?.trim();
  if (!czolo) {
    return tresc;
  }
  return tresc ? `${czolo}\n\n${tresc}` : czolo;
}

/** Jedna wiadomość czatu po danych (`WiadomoscCzatu` w Rust; `rola` = `RolaCzatu` snake_case). */
export interface WiadomoscCzatu {
  rola: "uzytkownik" | "asystent";
  tresc: string;
}

/** Bezpiecznie parsuje `wynik_json` zapisanej analizy do struktury z trzema listami. Zwraca puste
 * listy, gdy JSON jest z jakiegoś powodu nieczytelny (nie powinien być - backend zapisuje tylko
 * zwalidowane wyniki - ale UI nigdy nie zakłada tego na ślepo). */
export function parsujWynik(wynik_json: string): AnalizaWynik {
  const pusty: AnalizaWynik = {
    fakty: [],
    obserwacje: [],
    hipotezy: [],
    rekomendacje: [],
    jakosc_danych: [],
  };
  try {
    const parsed = JSON.parse(wynik_json) as Partial<AnalizaWynik>;
    return {
      fakty: Array.isArray(parsed.fakty) ? parsed.fakty : [],
      obserwacje: Array.isArray(parsed.obserwacje) ? parsed.obserwacje : [],
      hipotezy: Array.isArray(parsed.hipotezy) ? parsed.hipotezy : [],
      rekomendacje: Array.isArray(parsed.rekomendacje) ? parsed.rekomendacje : [],
      jakosc_danych: Array.isArray(parsed.jakosc_danych) ? parsed.jakosc_danych : [],
    };
  } catch {
    return pusty;
  }
}
