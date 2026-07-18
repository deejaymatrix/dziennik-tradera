import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

// jsdom nie implementuje HTMLDialogElement.showModal/close (używanego przez Modal) -
// minimalny polyfill wyłącznie na potrzeby testów; prawdziwe zachowanie (przechwytywanie
// focusu, tło modalne) pochodzi z realnej przeglądarki/WebView2 w uruchomionej aplikacji.
// Rzutowanie na Partial<> jest celowe: typy DOM zakładają, że showModal zawsze istnieje,
// więc bez niego TypeScript uznałby to sprawdzenie środowiska za zawsze fałszywe.
const dialogProto =
  typeof HTMLDialogElement === "undefined"
    ? null
    : (HTMLDialogElement.prototype as Partial<HTMLDialogElement>);

if (dialogProto && typeof dialogProto.showModal !== "function") {
  dialogProto.showModal = function showModal(this: HTMLDialogElement): void {
    this.setAttribute("open", "");
  };
  dialogProto.close = function close(this: HTMLDialogElement): void {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
