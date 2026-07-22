import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, ReactElement } from "react";
import { Button } from "../Button/Button";
import { contrastTextFor, hexToHsv, hsvToHex, normalizeHex } from "./colorMath";
import type { Hsv } from "./colorMath";
import styles from "./ColorPicker.module.css";

export interface ColorPickerProps {
  /** Kolor obowiązujący w formularzu - panel startuje od niego przy każdym otwarciu. */
  value: string;
  /** Wywoływane WYŁĄCZNIE po "Zatwierdź" (sekcja 3: kolor zapisuje się dopiero wtedy). */
  onChange: (hex: string) => void;
  /** Tekst na przykładowej etykiecie w podglądzie. */
  sampleLabel: string;
  label?: string;
}

const FALLBACK: Hsv = { h: 45, s: 58, v: 84 };

/**
 * Pełny selektor koloru (sekcja 3 specyfikacji): pole nasycenia i jasności, płynny suwak barw,
 * wartość HEX, podgląd na żywo na przykładowej etykiecie strategii oraz `Zatwierdź`/`Anuluj`.
 *
 * Kolor NIE trafia do formularza w trakcie wybierania - dopiero po zatwierdzeniu. Dzięki temu
 * "pobawienie się" suwakiem i wycofanie z panelu nie zmienia zapisanej strategii.
 *
 * Panel jest zwykłym blokiem, a nie zagnieżdżonym `<dialog>`/`<form>` - formularz strategii jest
 * już modalem z własnym formularzem, a zagnieżdżanie ich łamie HTML (patrz wcześniejszy błąd
 * z edytorem linków w karcie transakcji).
 */
export function ColorPicker({
  value,
  onChange,
  sampleLabel,
  label = "Kolor",
}: ColorPickerProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value) ?? FALLBACK);
  // Osobny stan tekstu HEX, żeby dało się go wpisywać znak po znaku bez kasowania koloru
  // w połowie wpisywania.
  const [hexText, setHexText] = useState(() => normalizeHex(value) ?? hsvToHex(FALLBACK));
  const areaRef = useRef<HTMLDivElement | null>(null);

  const draftHex = hsvToHex(hsv);
  const previewTextColor = contrastTextFor(draftHex);

  // Każde otwarcie panelu startuje od koloru aktualnie obowiązującego w formularzu - także po
  // wcześniejszym "Anuluj", żeby porzucony wybór nie wracał.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizacja z wartością z formularza przy otwarciu.
      setHsv(hexToHsv(value) ?? FALLBACK);
      setHexText(normalizeHex(value) ?? hsvToHex(FALLBACK));
    }
  }, [open, value]);

  function updateFromPointer(event: PointerEvent<HTMLDivElement>): void {
    const area = areaRef.current;
    if (!area) {
      return;
    }
    const rect = area.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
    const next: Hsv = {
      h: hsv.h,
      s: rect.width === 0 ? 0 : (x / rect.width) * 100,
      v: rect.height === 0 ? 0 : 100 - (y / rect.height) * 100,
    };
    setHsv(next);
    setHexText(hsvToHex(next));
  }

  function handleAreaKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = event.shiftKey ? 10 : 1;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const delta = deltas[event.key];
    if (!delta) {
      return;
    }
    event.preventDefault();
    const next: Hsv = {
      h: hsv.h,
      s: Math.min(100, Math.max(0, hsv.s + delta[0])),
      v: Math.min(100, Math.max(0, hsv.v + delta[1])),
    };
    setHsv(next);
    setHexText(hsvToHex(next));
  }

  function handleHexInput(raw: string): void {
    setHexText(raw);
    const normalized = normalizeHex(raw);
    if (normalized) {
      setHsv(hexToHsv(normalized) ?? hsv);
    }
  }

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={`${label}: ${normalizeHex(value) ?? value}. Otwórz selektor koloru.`}
      >
        <span className={styles.swatch} style={{ backgroundColor: value }} />
        <span>{normalizeHex(value) ?? value}</span>
      </button>

      {open && (
        <div className={styles.panel} role="group" aria-label="Selektor koloru">
          <div
            ref={areaRef}
            className={styles.area}
            style={{
              background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
            }}
            tabIndex={0}
            role="application"
            aria-label="Nasycenie i jasność - strzałki zmieniają wartość, Shift przyspiesza"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              updateFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                updateFromPointer(event);
              }
            }}
            onKeyDown={handleAreaKeyDown}
          >
            <span
              className={styles.areaHandle}
              style={{
                left: `${hsv.s}%`,
                top: `${100 - hsv.v}%`,
                backgroundColor: draftHex,
              }}
            />
          </div>

          <input
            className={styles.hue}
            type="range"
            min={0}
            max={360}
            step={1}
            value={Math.round(hsv.h)}
            aria-label="Odcień"
            onChange={(event) => {
              const next = { ...hsv, h: Number(event.target.value) };
              setHsv(next);
              setHexText(hsvToHex(next));
            }}
          />

          <div className={styles.hexRow}>
            <span className={styles.swatch} style={{ backgroundColor: draftHex }} />
            <input
              className={styles.hexInput}
              value={hexText}
              aria-label="Wartość HEX"
              spellCheck={false}
              onChange={(event) => handleHexInput(event.target.value)}
            />
          </div>

          <div>
            <p className={styles.previewCaption}>Podgląd etykiety strategii:</p>
            <span
              className={styles.previewLabel}
              style={{ backgroundColor: draftHex, color: previewTextColor }}
            >
              {sampleLabel.trim() || "Nazwa strategii"}
            </span>
          </div>

          <div className={styles.actions}>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Anuluj
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                onChange(draftHex);
                setOpen(false);
              }}
            >
              Zatwierdź
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
