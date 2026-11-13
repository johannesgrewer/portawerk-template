// Color helpers shared by the panel (browser) and the tests (node).
// No dependencies: hex/rgb parsing, HSL conversion, WCAG contrast, palettes.

/** Parse "#rgb", "#rrggbb", "rgb(r, g, b)" or "rgba(...)" into {r,g,b} (0-255). */
export function parseFarbe(eingabe) {
  if (typeof eingabe !== 'string') return null;
  const text = eingabe.trim().toLowerCase();
  let treffer = text.match(/^#([0-9a-f]{3})$/);
  if (treffer) {
    const [r, g, b] = treffer[1].split('').map((ziffer) => parseInt(ziffer + ziffer, 16));
    return { r, g, b };
  }
  treffer = text.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/);
  if (treffer) {
    const zahl = parseInt(treffer[1], 16);
    return { r: (zahl >> 16) & 255, g: (zahl >> 8) & 255, b: zahl & 255 };
  }
  treffer = text.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (treffer) {
    return { r: Math.round(+treffer[1]), g: Math.round(+treffer[2]), b: Math.round(+treffer[3]) };
  }
  return null;
}

export function zuHex({ r, g, b }) {
  const teil = (wert) => Math.max(0, Math.min(255, Math.round(wert))).toString(16).padStart(2, '0');
  return `#${teil(r)}${teil(g)}${teil(b)}`.toUpperCase();
}

/** Relative luminance per WCAG 2.x. */
export function luminanz({ r, g, b }) {
  const kanal = (wert) => {
    const s = wert / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
}

/** WCAG contrast ratio between two colors (strings or {r,g,b}). Returns null if unparsable. */
export function kontrast(farbeA, farbeB) {
  const a = typeof farbeA === 'string' ? parseFarbe(farbeA) : farbeA;
  const b = typeof farbeB === 'string' ? parseFarbe(farbeB) : farbeB;
  if (!a || !b) return null;
  const la = luminanz(a);
  const lb = luminanz(b);
  const [hell, dunkel] = la > lb ? [la, lb] : [lb, la];
  return Math.round(((hell + 0.05) / (dunkel + 0.05)) * 100) / 100;
}

/** Traffic light for a ratio: 'gut' (AAA 7+ for text / 4.5+ for large), 'ok' (AA), 'schlecht'. */
export function ampel(verhaeltnis, grenzeOk = 4.5, grenzeGut = 7) {
  if (verhaeltnis == null) return 'unbekannt';
  if (verhaeltnis >= grenzeGut) return 'gut';
  if (verhaeltnis >= grenzeOk) return 'ok';
  return 'schlecht';
}

export function zuHsl({ r, g, b }) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function ausHsl({ h, s, l }) {
  const hn = (((h % 360) + 360) % 360) / 360;
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  if (sn === 0) {
    const grau = ln * 255;
    return { r: grau, g: grau, b: grau };
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const kanal = (t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return { r: kanal(hn + 1 / 3) * 255, g: kanal(hn) * 255, b: kanal(hn - 1 / 3) * 255 };
}

/** Shift lightness/saturation of a hex color. */
export function verschiebe(hex, { l = 0, s = 0, h = 0 } = {}) {
  const rgb = parseFarbe(hex);
  if (!rgb) return hex;
  const hsl = zuHsl(rgb);
  return zuHex(ausHsl({ h: hsl.h + h, s: hsl.s + s, l: hsl.l + l }));
}

/** Darken a color step by step until it reaches the wanted contrast against a partner. */
export function bisKontrast(hex, partner, ziel = 4.5) {
  let aktuell = hex;
  for (let schritt = 0; schritt < 40; schritt += 1) {
    if ((kontrast(aktuell, partner) ?? 0) >= ziel) return aktuell;
    aktuell = verschiebe(aktuell, { l: -2 });
  }
  return aktuell;
}

/**
 * Derive a full palette from one base color (used as primary).
 * The accent is kept when given, otherwise derived from the base hue.
 */
export function paletteAus(basisHex, { akzent } = {}) {
  const basis = parseFarbe(basisHex);
  if (!basis) return null;
  const { h, s } = zuHsl(basis);
  const neutralS = Math.min(s, 30) * 0.6;
  const ton = (sat, hell) => zuHex(ausHsl({ h, s: sat, l: hell }));
  const accent = akzent && parseFarbe(akzent) ? zuHex(parseFarbe(akzent)) : bisKontrast(ton(Math.max(s, 55), 45), '#FFFFFF');
  const primary = zuHex(basis);
  const text = ton(neutralS + 4, 10);
  const bg = ton(neutralS, 98.5);
  const { r, g, b } = basis;
  return {
    '--c-primary': primary,
    '--c-primary-light': verschiebe(primary, { l: 12 }),
    '--c-accent': accent,
    '--c-accent-hover': verschiebe(accent, { l: -8, s: 5 }),
    '--c-bg': bg,
    '--c-surface': ton(neutralS, 95),
    '--c-surface-alt': ton(neutralS, 90),
    '--c-text': text,
    '--c-text-muted': bisKontrast(ton(neutralS, 36), bg, 7),
    '--c-border': ton(neutralS, 84),
    '--shadow-accent': `0 8px 24px rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, 0.18)`,
  };
}

/** Random but usable palette: random hue, accent rotated, white on accent always passes AA. */
export function zufallsPalette(zufall = Math.random) {
  const h = Math.floor(zufall() * 360);
  const basis = zuHex(ausHsl({ h, s: 35 + zufall() * 40, l: 22 + zufall() * 14 }));
  const drehung = [150, 180, 30, -30, 200][Math.floor(zufall() * 5)];
  const akzent = bisKontrast(zuHex(ausHsl({ h: h + drehung, s: 60 + zufall() * 30, l: 42 })), '#FFFFFF');
  return paletteAus(basis, { akzent });
}

// ───────── dominant colors (logo or photo, pixels from a canvas) ─────────

/**
 * Dominant colors from RGBA pixel data (Uint8ClampedArray or plain array).
 * Transparent pixels are skipped. Deterministic k-means: the start centers
 * are picked farthest-first, so the same image always gives the same result.
 * Returns [{ hex, anteil }] sorted by share (0..1), similar colors merged.
 */
export function dominanteFarben(pixel, { anzahl = 6, maxProben = 4000 } = {}) {
  if (!pixel || pixel.length < 4) return [];
  const gesamt = Math.floor(pixel.length / 4);
  const schritt = Math.max(1, Math.floor(gesamt / maxProben));
  const proben = [];
  for (let i = 0; i < gesamt; i += schritt) {
    const o = i * 4;
    if (pixel[o + 3] < 128) continue;
    proben.push([pixel[o], pixel[o + 1], pixel[o + 2]]);
  }
  if (!proben.length) return [];
  const abstand = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

  // Farthest-first start: first sample, then always the sample farthest from all centers.
  const zentren = [proben[0].slice()];
  const naechster = proben.map((p) => abstand(p, zentren[0]));
  while (zentren.length < anzahl) {
    let besterIndex = -1, besterWert = 0;
    naechster.forEach((d, i) => { if (d > besterWert) { besterWert = d; besterIndex = i; } });
    if (besterIndex < 0 || besterWert < 100) break; // the rest is near-identical
    zentren.push(proben[besterIndex].slice());
    proben.forEach((p, i) => { naechster[i] = Math.min(naechster[i], abstand(p, zentren[zentren.length - 1])); });
  }

  const zuordnung = new Array(proben.length).fill(0);
  for (let runde = 0; runde < 12; runde += 1) {
    let bewegt = false;
    proben.forEach((p, i) => {
      let beste = 0, besterWert = Infinity;
      zentren.forEach((z, k) => { const d = abstand(p, z); if (d < besterWert) { besterWert = d; beste = k; } });
      if (zuordnung[i] !== beste) { zuordnung[i] = beste; bewegt = true; }
    });
    const summen = zentren.map(() => [0, 0, 0, 0]);
    proben.forEach((p, i) => { const s = summen[zuordnung[i]]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3] += 1; });
    summen.forEach((s, k) => { if (s[3]) zentren[k] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
    if (!bewegt && runde > 0) break;
  }

  const anteile = zentren.map(() => 0);
  zuordnung.forEach((k) => { anteile[k] += 1; });
  const ergebnis = [];
  zentren
    .map((z, k) => ({ rgb: z, anteil: anteile[k] / proben.length }))
    .filter((e) => e.anteil > 0)
    .sort((a, b) => b.anteil - a.anteil)
    .forEach((e) => {
      // Merge near-identical colors (anti-aliasing edges, JPEG noise).
      const nah = ergebnis.find((x) => abstand(x.rgb, e.rgb) < 18 ** 2);
      if (nah) nah.anteil += e.anteil;
      else ergebnis.push({ ...e });
    });
  return ergebnis
    .sort((a, b) => b.anteil - a.anteil)
    .map((e) => ({ hex: zuHex({ r: e.rgb[0], g: e.rgb[1], b: e.rgb[2] }), anteil: Math.round(e.anteil * 1000) / 1000 }));
}

/**
 * Pick primary and accent from dominant colors: the most saturated color that
 * is neither near-white nor near-black and has at least 2 % share. The accent
 * is the next saturated color with a clearly different hue (30 degrees+).
 * Grey logos: primary is the darkest color, accent null.
 */
export function primaerAus(farben) {
  const kandidaten = (farben ?? [])
    .map((f) => ({ ...f, hsl: zuHsl(parseFarbe(f.hex) ?? { r: 0, g: 0, b: 0 }) }))
    .filter((f) => f.anteil >= 0.02);
  const bunt = kandidaten
    .filter((f) => f.hsl.s >= 25 && f.hsl.l >= 15 && f.hsl.l <= 80)
    .sort((a, b) => b.hsl.s * (0.5 + b.anteil) - a.hsl.s * (0.5 + a.anteil));
  if (!bunt.length) {
    const dunkel = [...kandidaten].sort((a, b) => a.hsl.l - b.hsl.l)[0];
    return { primary: dunkel && dunkel.hsl.l < 60 ? dunkel.hex : null, akzent: null };
  }
  const primary = bunt[0];
  const hueAbstand = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const akzent = bunt.slice(1).find((f) => hueAbstand(f.hsl.h, primary.hsl.h) >= 30);
  return { primary: primary.hex, akzent: akzent?.hex ?? null };
}

// ───────── readability check ─────────

/** Alpha channel of a CSS color string (rgba/hsla/#rrggbbaa), 1 if none, null if unparsable. */
export function alphaVon(eingabe) {
  if (typeof eingabe !== 'string') return null;
  const text = eingabe.trim().toLowerCase();
  if (text === 'transparent') return 0;
  let treffer = text.match(/^#[0-9a-f]{6}([0-9a-f]{2})$/);
  if (treffer) return parseInt(treffer[1], 16) / 255;
  treffer = text.match(/^rgba?\([^)]*?[,/]\s*([\d.]+)(%?)\s*\)$/);
  if (treffer && /^rgba?\(\s*[\d.]+[\s,]+[\d.]+[\s,]+[\d.]+[\s,/]+[\d.]+%?\s*\)$/.test(text)) {
    return treffer[2] ? parseFloat(treffer[1]) / 100 : parseFloat(treffer[1]);
  }
  return parseFarbe(text) ? 1 : null;
}

/** Blend a foreground color with alpha over an opaque background ({r,g,b}). */
export function mische(vorne, alpha, hinten) {
  const a = Math.max(0, Math.min(1, alpha));
  return {
    r: vorne.r * a + hinten.r * (1 - a),
    g: vorne.g * a + hinten.g * (1 - a),
    b: vorne.b * a + hinten.b * (1 - a),
  };
}

/** WCAG threshold: 3:1 for large text (24 px+, or 18.66 px+ bold), else 4.5:1. */
export function lesbarGrenze(schriftPx, gewicht = 400) {
  const gross = schriftPx >= 24 || (schriftPx >= 18.66 && Number(gewicht) >= 700);
  return gross ? 3 : 4.5;
}
