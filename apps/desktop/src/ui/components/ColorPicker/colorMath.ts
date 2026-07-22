/**
 * Czysta matematyka kolorów dla selektora koloru strategii. Bez Reacta i bez DOM, żeby dało się
 * to sprawdzić testami - konwersje HSV↔HEX i dobór kontrastu tekstu to dokładnie ten rodzaj
 * kodu, w którym błąd o jeden stopień odcienia jest niewidoczny gołym okiem.
 */

export interface Hsv {
  /** Odcień w stopniach, 0-360. */
  h: number;
  /** Nasycenie, 0-100. */
  s: number;
  /** Jasność (value), 0-100. */
  v: number;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Sprowadza to, co użytkownik wpisał, do kanonicznego `#rrggbb` małymi literami. Przyjmuje zapis
 * bez kratki i skrócony trzyznakowy (`#abc`), bo oba są w powszechnym użyciu. `null`, gdy to nie
 * jest kolor - wtedy wywołujący zostawia poprzednią wartość zamiast czyścić pole w trakcie
 * pisania.
 */
export function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(raw)) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
  }
  if (/^[0-9a-f]{6}$/.test(raw)) {
    return `#${raw}`;
  }
  return null;
}

export function hexToRgb(hex: string): Rgb | null {
  const normalized = normalizeHex(hex);
  if (!normalized) {
    return null;
  }
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (channel: number) =>
    Math.round(clamp(channel, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === red) {
      h = 60 * (((green - blue) / delta) % 6);
    } else if (max === green) {
      h = 60 * ((blue - red) / delta + 2);
    } else {
      h = 60 * ((red - green) / delta + 4);
    }
  }
  if (h < 0) {
    h += 360;
  }

  return {
    h,
    s: max === 0 ? 0 : (delta / max) * 100,
    v: max * 100,
  };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 100) / 100;
  const value = clamp(v, 0, 100) / 100;

  const c = value * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = value - c;

  let rgb: [number, number, number];
  if (hue < 60) {
    rgb = [c, x, 0];
  } else if (hue < 120) {
    rgb = [x, c, 0];
  } else if (hue < 180) {
    rgb = [0, c, x];
  } else if (hue < 240) {
    rgb = [0, x, c];
  } else if (hue < 300) {
    rgb = [x, 0, c];
  } else {
    rgb = [c, 0, x];
  }

  return {
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255),
  };
}

export function hexToHsv(hex: string): Hsv | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHsv(rgb) : null;
}

export function hsvToHex(hsv: Hsv): string {
  return rgbToHex(hsvToRgb(hsv));
}

/**
 * Kolor tekstu czytelny na danym tle - czarny albo biały, wybierany po luminancji względnej wg
 * WCAG. Etykieta strategii ma pozostać czytelna niezależnie od tego, jak jasny kolor wybierze
 * użytkownik (sekcja 3 specyfikacji: "odpowiedni kontrast tekstu dobierany automatycznie").
 */
export function contrastTextFor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return "#ffffff";
  }
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  // Próg 0.179 wynika z porównania kontrastu do bieli i do czerni wg wzoru WCAG.
  return luminance > 0.179 ? "#0b0b0c" : "#ffffff";
}
