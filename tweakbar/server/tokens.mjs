// Pure helpers to read and rewrite src/config/tokens.css.
// Only values of variables that already exist in the first :root block are
// replaced. Comments, order and line endings stay as they are. Generated CSS
// lives in marked blocks ("tweakbar:<name>") that are replaced as a whole.

const VAR_NAME = /^--[a-z][a-z0-9-]*$/;
const VERBOTEN = /[;{}<>\\]|\/\*|\*\/|\r|\n/;

/** Detect the line ending used by a file ("\r\n" or "\n"). */
export function zeilenende(text) {
  return /\r\n/.test(text) ? '\r\n' : '\n';
}

/** Locate the first top-level ":root { ... }" block. Returns indices of the braces. */
export function findeRoot(text) {
  const muster = /(^|\n)\s*:root\s*\{/g;
  let treffer;
  while ((treffer = muster.exec(text))) {
    const start = treffer.index + treffer[0].length - 1; // index of "{"
    // Skip matches inside comments.
    const davor = text.slice(0, start);
    const offen = davor.lastIndexOf('/*');
    const zu = davor.lastIndexOf('*/');
    if (offen > zu) continue;
    let tiefe = 0;
    for (let i = start; i < text.length; i += 1) {
      if (text.startsWith('/*', i)) {
        const ende = text.indexOf('*/', i + 2);
        if (ende === -1) return null;
        i = ende + 1;
        continue;
      }
      if (text[i] === '{') tiefe += 1;
      if (text[i] === '}') {
        tiefe -= 1;
        if (tiefe === 0) return { auf: start, zu: i };
      }
    }
    return null;
  }
  return null;
}

/** Strip comments but keep string length, so indices stay valid. */
function ohneKommentare(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (kommentar) => kommentar.replace(/[^\n\r]/g, ' '));
}

/** Read all declarations of the :root block: { name: { wert, start, ende } }. */
export function leseRootVariablen(text) {
  const root = findeRoot(text);
  if (!root) return {};
  const innen = text.slice(root.auf + 1, root.zu);
  const sauber = ohneKommentare(innen);
  const ergebnis = {};
  const muster = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]*);/g;
  let treffer;
  while ((treffer = muster.exec(sauber))) {
    const wertRoh = treffer[2];
    // Raw value ends right before the ";" that closes the match.
    const wertStartRel = treffer.index + treffer[0].length - 1 - wertRoh.length;
    const fuehrend = wertRoh.length - wertRoh.trimStart().length;
    const start = root.auf + 1 + wertStartRel + fuehrend;
    const wert = wertRoh.trim();
    ergebnis[treffer[1]] = { wert, start, ende: start + wert.length };
  }
  return ergebnis;
}

/** Validate one variable change against the allowlist. Returns an error text or null. */
export function pruefeVariable(name, wert, erlaubt) {
  if (typeof name !== 'string' || !VAR_NAME.test(name)) return `Ungültiger Variablenname: ${String(name).slice(0, 60)}`;
  if (!erlaubt.has(name)) return `Variable nicht erlaubt: ${name}`;
  if (typeof wert !== 'string') return `Wert für ${name} ist kein Text`;
  const sauber = wert.trim();
  if (!sauber) return `Leerer Wert für ${name}`;
  if (sauber.length > 300) return `Wert für ${name} ist zu lang`;
  if (VERBOTEN.test(sauber)) return `Unzulässige Zeichen im Wert für ${name}`;
  if (/url\s*\(|expression\s*\(|@import/i.test(sauber)) return `Unzulässiger Ausdruck im Wert für ${name}`;
  return null;
}

/**
 * Replace values of existing :root variables. Unknown names throw.
 * @returns {string} new file text
 */
export function ersetzeVariablen(text, aenderungen) {
  const vorhanden = leseRootVariablen(text);
  const erlaubt = new Set(Object.keys(vorhanden));
  const eintraege = Object.entries(aenderungen ?? {});
  for (const [name, wert] of eintraege) {
    const fehler = pruefeVariable(name, wert, erlaubt);
    if (fehler) throw new Error(fehler);
  }
  // Replace from the back so earlier indices stay valid.
  const sortiert = eintraege
    .map(([name, wert]) => ({ ...vorhanden[name], neu: wert.trim() }))
    .sort((a, b) => b.start - a.start);
  let neu = text;
  for (const eintrag of sortiert) {
    neu = neu.slice(0, eintrag.start) + eintrag.neu + neu.slice(eintrag.ende);
  }
  return neu;
}

function blockMuster(name) {
  return new RegExp(`/\\* tweakbar:${name}:start([^*]*)\\*/[\\s\\S]*?/\\* tweakbar:${name}:end \\*/`);
}

/** Read the content and the JSON meta (in the start marker) of a managed block. */
export function leseBlock(text, name) {
  const treffer = text.match(blockMuster(name));
  if (!treffer) return null;
  let meta = null;
  const metaText = treffer[1].trim();
  if (metaText) {
    try { meta = JSON.parse(metaText); } catch { meta = null; }
  }
  const startMarkerEnde = treffer[0].indexOf('*/') + 2;
  const inhalt = treffer[0].slice(startMarkerEnde, treffer[0].lastIndexOf('/* tweakbar:')).trim();
  return { meta, inhalt };
}

/**
 * Write a managed block. position: 'vorRoot' (fonts) or 'nachRoot' (rules).
 * An empty css removes the block.
 */
export function schreibeBlock(text, name, css, { meta = null, position = 'nachRoot' } = {}) {
  const eol = zeilenende(text);
  const metaText = meta ? ` ${JSON.stringify(meta).replace(/\*/g, '')}` : '';
  const koerper = String(css ?? '').trim().replace(/\r?\n/g, eol);
  const block = koerper
    ? `/* tweakbar:${name}:start${metaText} */${eol}${koerper}${eol}/* tweakbar:${name}:end */`
    : '';
  const muster = blockMuster(name);
  if (muster.test(text)) {
    if (!block) return text.replace(new RegExp(`${eol}?${muster.source}${eol}?`), eol);
    return text.replace(muster, () => block);
  }
  if (!block) return text;
  const root = findeRoot(text);
  if (!root) return `${text}${eol}${block}${eol}`;
  if (position === 'vorRoot') {
    const zeilenStart = text.lastIndexOf('\n', root.auf) + 1;
    return `${text.slice(0, zeilenStart)}${block}${eol}${eol}${text.slice(zeilenStart)}`;
  }
  const nach = root.zu + 1;
  return `${text.slice(0, nach)}${eol}${eol}${block}${text.slice(nach)}`;
}

/** Split a block of @font-face rules into { family: [rules] }. */
export function teileFontFaces(css) {
  const gruppen = {};
  const muster = /@font-face\s*\{[^}]*\}/g;
  for (const regel of String(css ?? '').match(muster) ?? []) {
    const familie = (regel.match(/font-family:\s*['"]?([^'";]+)['"]?/) ?? [])[1]?.trim();
    if (!familie) continue;
    (gruppen[familie] ??= []).push(regel);
  }
  return gruppen;
}

/** Slug the pitch bar uses for a group: lowercase, everything else to "-". Mirrors cockpit/src/leiste.js. */
export function gruppenKurz(gruppe) {
  return String(gruppe).toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
