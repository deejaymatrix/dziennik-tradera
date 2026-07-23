import { describe, expect, it } from "vitest";
import { describeUpdateError } from "./updateErrors";

describe("describeUpdateError", () => {
  it("brak sieci opisuje jako brak sieci i uspokaja, że aplikacja działa", () => {
    // Aplikacja jest offline-first - brak internetu NIE jest awarią i komunikat musi to mówić,
    // inaczej użytkownik uzna, że coś się zepsuło.
    for (const surowy of [
      "error sending request: network error",
      "failed to lookup address information",
      "operation timed out",
      "connection refused",
    ]) {
      const opis = describeUpdateError(new Error(surowy));
      expect(opis).toContain("Brak połączenia z internetem");
      expect(opis).toContain("działa normalnie bez sieci");
    }
  });

  it("brak opublikowanego wydania opisuje jako stan normalny, nie błąd", () => {
    for (const surowy of [
      "Could not fetch a valid release JSON from the remote",
      "Request failed with status 404",
      "not found",
    ]) {
      const opis = describeUpdateError(new Error(surowy));
      expect(opis).toContain("nie ma jeszcze żadnego opublikowanego wydania");
    }
  });

  it("niezgodny podpis zatrzymuje użytkownika i zniechęca do ręcznej instalacji", () => {
    // To jedyny przypadek, w którym komunikat MUSI brzmieć ostrzegawczo - niezgodny podpis
    // oznacza, że pobrany plik nie pochodzi od autora aplikacji.
    const opis = describeUpdateError(new Error("signature verification failed"));
    expect(opis).toContain("Podpis");
    expect(opis).toContain("NIE instaluj");
  });

  it("nieznany błąd zachowuje surową treść, żeby dało się go zgłosić", () => {
    const opis = describeUpdateError(new Error("coś zupełnie nowego"));
    expect(opis).toContain("coś zupełnie nowego");
  });

  it("radzi sobie z błędem, który nie jest obiektem Error", () => {
    // Tauri odrzuca obietnice zwykłym NAPISEM, nie obiektem Error - to już raz kosztowało
    // sesję debugowania (patrz historia „Brak środowiska Tauri").
    expect(describeUpdateError("network error")).toContain("Brak połączenia");
    expect(describeUpdateError(404)).toContain("nie ma jeszcze żadnego opublikowanego wydania");
  });
});
