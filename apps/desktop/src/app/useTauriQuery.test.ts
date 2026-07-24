import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTauriQuery } from "./useTauriQuery";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

function odroczona<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * `useTauriQuery` jest współdzielonym hookiem do wywoływania komend Tauri z zarządzaniem
 * stanem (loading/ready/error) i `refetch`. Jedyne dotychczasowe użycie (SettingsPage.test.tsx)
 * podmienia cały hook przez `vi.mock`, więc jego własna logika - w tym ochrona przed wyścigiem
 * (`cancelled`), która ma nie dopuścić, by SPÓŹNIONA odpowiedź starego zapytania nadpisała wynik
 * nowszego po `refetch()` - nigdy nie została wykonana przez żaden test.
 */
describe("useTauriQuery", () => {
  afterEach(() => {
    invoke.mockReset();
  });

  it("zaczyna w stanie 'loading'", () => {
    invoke.mockReturnValue(odroczona<unknown>().promise);
    const { result } = renderHook(() => useTauriQuery("get_accounts"));
    expect(result.current.state).toEqual({ kind: "loading" });
  });

  it("przechodzi do 'ready' z danymi po powodzeniu", async () => {
    invoke.mockResolvedValue([{ id: "konto-1" }]);
    const { result } = renderHook(() => useTauriQuery("get_accounts"));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    expect(result.current.state).toEqual({ kind: "ready", data: [{ id: "konto-1" }] });
  });

  it("przechodzi do 'error' z czytelnym komunikatem po niepowodzeniu", async () => {
    invoke.mockRejectedValue({ code: "DB", message: "Baza niedostępna." });
    const { result } = renderHook(() => useTauriQuery("get_accounts"));
    await waitFor(() => expect(result.current.state.kind).toBe("error"));
    expect(result.current.state).toEqual({ kind: "error", message: "Baza niedostępna." });
  });

  it("refetch() wywołuje komendę ponownie i podmienia wynik", async () => {
    invoke.mockResolvedValue("pierwsza");
    const { result } = renderHook(() => useTauriQuery("get_x"));
    await waitFor(() => expect(result.current.state).toEqual({ kind: "ready", data: "pierwsza" }));

    invoke.mockResolvedValue("druga");
    act(() => {
      result.current.refetch();
    });
    await waitFor(() => expect(result.current.state).toEqual({ kind: "ready", data: "druga" }));
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("spóźniona odpowiedź STAREGO zapytania nie nadpisuje wyniku nowszego (ochrona przed wyścigiem)", async () => {
    const pierwsze = odroczona<string>();
    const drugie = odroczona<string>();
    invoke.mockReturnValueOnce(pierwsze.promise).mockReturnValueOnce(drugie.promise);

    const { result } = renderHook(() => useTauriQuery("get_x"));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.refetch();
    });
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));

    await act(async () => {
      drugie.resolve("nowe");
    });
    await waitFor(() => expect(result.current.state).toEqual({ kind: "ready", data: "nowe" }));

    await act(async () => {
      pierwsze.resolve("stare");
    });
    expect(result.current.state).toEqual({ kind: "ready", data: "nowe" });
  });
});
