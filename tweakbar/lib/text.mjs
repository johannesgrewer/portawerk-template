// Text helpers shared by the panel (live checks while editing) and the dev
// server (splitting the rewrite variants). No dependencies.

/** Words and phrases that read as AI-generated filler. Matched case-insensitively. */
export const KI_WOERTER = [
  'nahtlos', 'maßgeschneidert', 'ganzheitlich', 'innovativ', 'Reise', 'eintauchen', 'tauchen Sie ein',
  'entdecken Sie', 'auf das nächste Level', 'auf ein neues Level', 'revolutionär', 'Synergie',
  'Leidenschaft', 'erstklassig', 'unvergesslich', 'Mehrwert', 'perfekt abgestimmt',
];

export const UEBERSCHRIFT_MAX = 60;

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WORTGRENZE = '(?<![\\p{L}\\p{N}])';
const WORTENDE = '(?![\\p{L}\\p{N}])';

/** Collapse whitespace the way the browser renders it. */
export function normalisiereText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Live checks for an edited text.
 * Returns { zeichen, woerter, hinweise: [{ art, text }] } with art 'warnung' or 'info'.
 */
export function pruefeText(roh, { ueberschrift = false } = {}) {
  const text = normalisiereText(roh);
  const hinweise = [];
  const zeichen = [...text].length;
  const woerter = text ? text.split(' ').length : 0;
  if (ueberschrift && zeichen > UEBERSCHRIFT_MAX) {
    hinweise.push({ art: 'warnung', text: `Überschrift mit ${zeichen} Zeichen, über ${UEBERSCHRIFT_MAX} bricht sie auf dem Handy oft in viele Zeilen.` });
  }
  const striche = text.match(/[–—]/g);
  if (striche) hinweise.push({ art: 'warnung', text: `${striche.length} Gedankenstrich(e). Besser Komma, Punkt oder Bindestrich.` });
  const gefunden = KI_WOERTER.filter((wort) => new RegExp(`${WORTGRENZE}${escape(wort)}(?:e|en|er|es|em|n|s)?${WORTENDE}`, 'iu').test(text));
  if (gefunden.length) hinweise.push({ art: 'warnung', text: `Klingt nach KI-Floskel: ${gefunden.join(', ')}` });
  if (/!{2,}|\?{2,}/.test(text)) hinweise.push({ art: 'warnung', text: 'Mehrfache Satzzeichen.' });
  return { zeichen, woerter, hinweise };
}

/**
 * Split a model answer with several versions into a clean list.
 * Separator: a line with only ### (asked for in the prompt). Leading
 * numbering such as "1." or "Fassung 2:" is removed.
 */
export function teileVarianten(antwort, max = 3) {
  const teile = String(antwort ?? '')
    .replace(/\r\n/g, '\n')
    .split(/^\s*(?:#{3,}|-{3,}|\*{3,})\s*$/m)
    .map((teil) => teil
      .trim()
      .replace(/^(?:(?:Fassung|Variante|Version)\s*\d+\s*[:.)]?|\d+\s*[.)])\s*/i, '')
      .replace(/^["„»](.*)["“«]$/s, '$1')
      .trim())
    .filter(Boolean);
  return [...new Set(teile)].slice(0, max);
}
