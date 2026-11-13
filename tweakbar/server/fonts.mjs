// Font lookup and download through the Fontsource API (Google Fonts files,
// served from jsDelivr). Dev only: the live site only ever sees the woff2
// files copied to public/fonts/<id>/.

import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const API = 'https://api.fontsource.org/v1/fonts';
const CDN = 'https://cdn.jsdelivr.net/fontsource/fonts';
const ID_MUSTER = /^[a-z0-9][a-z0-9-]{0,60}$/;
const FAMILIE_MUSTER = /^[A-Za-z0-9][A-Za-z0-9 ]{0,60}$/;

let listenCache = null;

async function holeJson(url) {
  const antwort = await fetch(url, { headers: { 'User-Agent': 'portawerk-tweakbar' } });
  if (!antwort.ok) throw new Error(`Fontsource antwortet ${antwort.status} für ${url}`);
  return antwort.json();
}

export function pruefeId(id) {
  return typeof id === 'string' && ID_MUSTER.test(id);
}

/** Search Google fonts by family name (case-insensitive substring). */
export async function sucheFonts(suche, limit = 30) {
  if (!listenCache) {
    const liste = await holeJson(`${API}?type=google`);
    listenCache = (Array.isArray(liste) ? liste : []).map((f) => ({
      id: f.id, family: f.family, category: f.category, variable: !!f.variable,
      weights: f.weights ?? [], styles: f.styles ?? [], subsets: f.subsets ?? [],
    })).filter((f) => f.subsets.includes('latin'));
  }
  const q = String(suche ?? '').trim().toLowerCase();
  const treffer = q ? listenCache.filter((f) => f.family.toLowerCase().includes(q)) : listenCache;
  // Exact and prefix matches first.
  return treffer
    .sort((a, b) => {
      const rang = (f) => (f.family.toLowerCase() === q ? 0 : f.family.toLowerCase().startsWith(q) ? 1 : 2);
      return rang(a) - rang(b) || a.family.localeCompare(b.family);
    })
    .slice(0, limit);
}

const infoCache = new Map();

export async function fontInfo(id) {
  if (!pruefeId(id)) throw new Error('Ungültige Font-ID');
  if (infoCache.has(id)) return infoCache.get(id);
  const info = await holeJson(`${API}/${id}`);
  const ergebnis = {
    id: info.id, family: info.family, category: info.category, variable: !!info.variable,
    weights: info.weights ?? [], styles: info.styles ?? [],
  };
  infoCache.set(id, ergebnis);
  return ergebnis;
}

/** CSS fallback stack per Fontsource category. */
export function fallbackStapel(kategorie) {
  switch (kategorie) {
    case 'serif': return 'Georgia, serif';
    case 'monospace': return 'ui-monospace, monospace';
    case 'handwriting': return 'cursive';
    default: return 'system-ui, -apple-system, sans-serif';
  }
}

export function fontVariable(familie, kategorie) {
  if (!FAMILIE_MUSTER.test(familie)) throw new Error('Ungültiger Schriftname');
  return `'${familie}', ${fallbackStapel(kategorie)}`;
}

/** Nearest available weight for a wanted one. */
export function naechstesGewicht(gewichte, wunsch) {
  if (!gewichte.length) return 400;
  return gewichte.reduce((best, w) => (Math.abs(w - wunsch) < Math.abs(best - wunsch) ? w : best), gewichte[0]);
}

async function existiert(datei) {
  try { await access(datei); return true; } catch { return false; }
}

async function lade(url, ziel) {
  const antwort = await fetch(url, { headers: { 'User-Agent': 'portawerk-tweakbar' } });
  if (!antwort.ok) return false;
  const typ = antwort.headers.get('content-type') ?? '';
  const daten = Buffer.from(await antwort.arrayBuffer());
  // woff2 files start with "wOF2". Anything else (an HTML error page) is rejected.
  if (daten.length < 100 || daten.subarray(0, 4).toString('latin1') !== 'wOF2') {
    throw new Error(`Keine woff2-Datei von ${url} (${typ})`);
  }
  await writeFile(ziel, daten);
  return true;
}

/**
 * Download the latin woff2 files of a family and return its @font-face rules.
 * Variable file (wght axis) when available, otherwise the needed static weights.
 * @param {{ id: string, gewichte: number[], kursiv?: boolean }} auftrag
 * @param {string} publicDir absolute path of public/
 */
export async function ladeFont({ id, gewichte, kursiv = false }, publicDir) {
  const info = await fontInfo(id);
  const ordner = path.join(publicDir, 'fonts', info.id);
  await mkdir(ordner, { recursive: true });
  const stile = ['normal', ...(kursiv && info.styles.includes('italic') ? ['italic'] : [])];
  const regeln = [];
  const dateien = [];
  const familie = info.family;
  if (!FAMILIE_MUSTER.test(familie)) throw new Error(`Schriftname nicht verwendbar: ${familie}`);

  let variabel = false;
  if (info.variable) {
    variabel = true;
    for (const stil of stile) {
      const name = `${info.id}-latin-wght-${stil}.woff2`;
      const ziel = path.join(ordner, name);
      const ok = (await existiert(ziel)) || (await lade(`${CDN}/${info.id}:vf@latest/latin-wght-${stil}.woff2`, ziel));
      if (!ok) { variabel = false; break; }
      dateien.push(`/fonts/${info.id}/${name}`);
      const min = Math.min(...info.weights), max = Math.max(...info.weights);
      regeln.push(`@font-face {\n  font-family: '${familie}';\n  src: url('/fonts/${info.id}/${name}') format('woff2');\n  font-weight: ${min} ${max};\n  font-style: ${stil};\n  font-display: swap;\n}`);
    }
    if (!variabel) { regeln.length = 0; dateien.length = 0; }
  }

  if (!variabel) {
    const benoetigt = [...new Set(gewichte.map((w) => naechstesGewicht(info.weights, w)))].sort((a, b) => a - b);
    for (const stil of stile) {
      const liste = stil === 'italic' ? [naechstesGewicht(info.weights, 400)] : benoetigt;
      for (const w of liste) {
        const name = `${info.id}-latin-${w}-${stil}.woff2`;
        const ziel = path.join(ordner, name);
        const ok = (await existiert(ziel)) || (await lade(`${CDN}/${info.id}@latest/latin-${w}-${stil}.woff2`, ziel));
        if (!ok) throw new Error(`Schnitt ${w} ${stil} von ${familie} nicht ladbar`);
        dateien.push(`/fonts/${info.id}/${name}`);
        regeln.push(`@font-face {\n  font-family: '${familie}';\n  src: url('/fonts/${info.id}/${name}') format('woff2');\n  font-weight: ${w};\n  font-style: ${stil};\n  font-display: swap;\n}`);
      }
    }
  }
  return { familie, kategorie: info.category, variabel, dateien, regeln };
}
