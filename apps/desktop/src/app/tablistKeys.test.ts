import { describe, expect, it } from "vitest";
import { nextTabIndex } from "./tablistKeys";

describe("nextTabIndex", () => {
  it("strzałki w prawo i w dół przechodzą do następnej zakładki", () => {
    expect(nextTabIndex("ArrowRight", 0, 5)).toBe(1);
    expect(nextTabIndex("ArrowDown", 0, 5)).toBe(1);
  });

  it("strzałki w lewo i w górę przechodzą do poprzedniej", () => {
    expect(nextTabIndex("ArrowLeft", 2, 5)).toBe(1);
    expect(nextTabIndex("ArrowUp", 2, 5)).toBe(1);
  });

  it("lista zawija się na obu końcach", () => {
    // Bez zawijania użytkownik musiałby wiedzieć, że stoi na skrajnej zakładce - a nie widzi
    // tego bez policzenia ich wzrokiem.
    expect(nextTabIndex("ArrowRight", 4, 5)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 5)).toBe(4);
  });

  it("Home i End skaczą na skraje", () => {
    expect(nextTabIndex("Home", 3, 5)).toBe(0);
    expect(nextTabIndex("End", 1, 5)).toBe(4);
  });

  it("inne klawisze zwracają null, żeby zdarzenie zostało nietknięte", () => {
    // Zwrócenie liczby dla Tab albo Enter połknęłoby te klawisze - Tab przestałby wychodzić
    // z grupy, a Enter aktywować zakładkę.
    for (const key of ["Tab", "Enter", " ", "Escape", "a"]) {
      expect(nextTabIndex(key, 1, 5)).toBeNull();
    }
  });

  it("pusta lista nie daje żadnej pozycji", () => {
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull();
  });
});
