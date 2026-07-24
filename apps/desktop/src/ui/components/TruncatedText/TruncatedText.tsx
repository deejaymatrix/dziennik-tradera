import { useLayoutEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Tooltip } from "../Tooltip/Tooltip";
import styles from "./TruncatedText.module.css";

export interface TruncatedTextProps {
  text: string;
  className?: string;
}

/**
 * JEDNO miejsce obcinania długich wartości wielokropkiem z pełną treścią dostępną w tooltipie -
 * zamiast punktowych, niespójnych napraw w każdej tabeli/karcie z osobna. Używać wszędzie tam,
 * gdzie kolumna/etykieta ma sensownie ograniczoną szerokość (nazwa strategii/konta, opis
 * instrumentu, tag), a wartość może być dowolnie długa.
 *
 * Tooltip pojawia się TYLKO gdy tekst faktycznie jest obcięty (`scrollWidth > clientWidth`) -
 * krótkie wartości nie dostają zbędnego dymku przy najechaniu. `tabIndex` jest ustawiany
 * wyłącznie wtedy, gdy jest co pokazać - nie zaśmieca kolejności Tab elementami bez treści.
 */
export function TruncatedText({ text, className }: TruncatedTextProps): ReactElement {
  const ref = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    setIsTruncated(el.scrollWidth > el.clientWidth);
  }, [text]);

  const span = (
    <span
      ref={ref}
      className={[styles.truncate, className].filter(Boolean).join(" ")}
      tabIndex={isTruncated ? 0 : undefined}
    >
      {text}
    </span>
  );

  return isTruncated ? <Tooltip content={text}>{span}</Tooltip> : span;
}
