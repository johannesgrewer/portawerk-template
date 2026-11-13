// Pure helpers for the AI routes (reference analysis, AI image). Used by the
// dev server, tested in node. Nothing in here talks to the network.

import { parseFarbe, zuHex } from './farbe.mjs';
import { normalisiere } from './regeln.mjs';

/** JSON schema for the reference analysis (Gemini responseSchema, OpenAPI subset). */
export const REFERENZ_SCHEMA = {
  type: 'OBJECT',
  properties: {
    farben: {
      type: 'OBJECT',
      properties: {
        primary: { type: 'STRING', description: 'Hauptfarbe der Marke als #RRGGBB' },
        accent: { type: 'STRING', description: 'Akzentfarbe, meist die Farbe der Buttons, als #RRGGBB' },
        bg: { type: 'STRING', description: 'Seitenhintergrund als #RRGGBB' },
        text: { type: 'STRING', description: 'Fließtextfarbe als #RRGGBB' },
      },
      required: ['primary', 'accent', 'bg', 'text'],
    },
    button: {
      type: 'OBJECT',
      properties: {
        art: { type: 'STRING', enum: ['gefuellt', 'kontur', 'unterstrichen'] },
        form: { type: 'STRING', enum: ['standard', 'pille', 'eckig'] },
        radiusPx: { type: 'NUMBER' },
        pfeil: { type: 'BOOLEAN' },
        groesse: { type: 'NUMBER', description: '0.8 klein bis 1.4 groß, 1 normal' },
      },
      required: ['art', 'form', 'radiusPx', 'pfeil', 'groesse'],
    },
    schrift: {
      type: 'OBJECT',
      properties: {
        displayKategorie: { type: 'STRING', enum: ['serif', 'sans-serif', 'display', 'handwriting'] },
        gewicht: { type: 'NUMBER', description: 'Gewicht der Überschriften, 100 bis 900' },
        laufweite: { type: 'NUMBER', description: 'letter-spacing der Überschriften in em, -0.08 bis 0.15' },
        naechsteAusListe: { type: 'ARRAY', items: { type: 'STRING' }, description: 'bis zu 3 ids aus der Liste' },
      },
      required: ['displayKategorie', 'gewicht', 'laufweite', 'naechsteAusListe'],
    },
    form: {
      type: 'OBJECT',
      properties: {
        radiusPx: { type: 'NUMBER', description: 'Eckenradius von Karten und Feldern' },
        schatten: { type: 'NUMBER', description: '0 keine, 1 normal, 2 kräftig' },
        linien: { type: 'NUMBER', description: 'Linienstärke 0 bis 4 px' },
        dichte: { type: 'NUMBER', description: '0.6 eng bis 1.6 luftig, 1 normal' },
      },
      required: ['radiusPx', 'schatten', 'linien', 'dichte'],
    },
  },
  required: ['farben', 'button', 'schrift', 'form'],
};

function zahl(wert, min, max, standard, stellen = 3) {
  const n = Number(wert);
  if (!Number.isFinite(n)) return standard;
  const f = 10 ** stellen;
  return Math.min(max, Math.max(min, Math.round(n * f) / f));
}

function hex(wert) {
  const rgb = parseFarbe(typeof wert === 'string' ? wert : '');
  return rgb ? zuHex(rgb) : null;
}

/** Clamp and clean an untrusted reference analysis. Unknown fields are dropped. */
export function normalisiereReferenz(roh, erlaubteFontIds = []) {
  const e = roh && typeof roh === 'object' ? roh : {};
  const f = e.farben ?? {};
  const b = e.button ?? {};
  const s = e.schrift ?? {};
  const fo = e.form ?? {};
  const buttons = normalisiere({ buttons: { art: b.art, form: b.form, pfeil: b.pfeil, groesse: b.groesse } }).buttons;
  const erlaubt = new Set(erlaubteFontIds);
  const ids = Array.isArray(s.naechsteAusListe) ? s.naechsteAusListe : [];
  return {
    farben: { primary: hex(f.primary), accent: hex(f.accent), bg: hex(f.bg), text: hex(f.text) },
    button: { art: buttons.art, form: buttons.form, pfeil: buttons.pfeil, groesse: buttons.groesse, radiusPx: zahl(b.radiusPx, 0, 48, 4, 0) },
    schrift: {
      displayKategorie: ['serif', 'sans-serif', 'display', 'handwriting'].includes(s.displayKategorie) ? s.displayKategorie : 'sans-serif',
      gewicht: Math.round(zahl(s.gewicht, 100, 900, 600, 0) / 100) * 100,
      laufweite: zahl(s.laufweite, -0.08, 0.15, -0.02),
      naechsteAusListe: [...new Set(ids.map((id) => String(id).trim().toLowerCase()).filter((id) => erlaubt.has(id)))].slice(0, 3),
    },
    form: {
      radiusPx: zahl(fo.radiusPx, 0, 48, 4, 0),
      schatten: zahl(fo.schatten, 0, 2, 1, 1),
      linien: zahl(fo.linien, 0, 4, 1, 0),
      dichte: zahl(fo.dichte, 0.6, 1.6, 1, 2),
    },
  };
}

/** Aspect ratios gemini-2.5-flash-image accepts. */
export const SEITENVERHAELTNISSE = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

/** Nearest supported ratio for a width/height (compared on a log scale). */
export function naechstesVerhaeltnis(breite, hoehe) {
  const b = Number(breite), h = Number(hoehe);
  if (!(b > 0) || !(h > 0)) return '1:1';
  const ziel = Math.log(b / h);
  let bestes = '1:1', besterAbstand = Infinity;
  for (const v of SEITENVERHAELTNISSE) {
    const [x, y] = v.split(':').map(Number);
    const d = Math.abs(Math.log(x / y) - ziel);
    if (d < besterAbstand) { besterAbstand = d; bestes = v; }
  }
  return bestes;
}

/** Safe file name part from a description: lowercase a-z0-9 and dashes, max 40 chars. */
export function dateiSlug(text) {
  const slug = String(text ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || 'bild';
}

/** Image type from magic bytes: 'image/png', 'image/jpeg', 'image/webp' or null. */
export function bildArt(bytes) {
  if (!bytes || bytes.length < 12) return null;
  const b = (i) => bytes[i];
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) return 'image/png';
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return 'image/webp';
  return null;
}
