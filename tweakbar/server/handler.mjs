// Dev middleware for the Tweakbar. Registered only by integration.mjs in
// `astro dev`. All routes live under /__tweakbar/ and accept localhost only.

import { readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  leseRootVariablen, ersetzeVariablen, pruefeVariable, leseBlock, schreibeBlock,
  teileFontFaces, gruppenKurz,
} from './tokens.mjs';
import { sucheFonts, fontInfo, ladeFont, fontVariable, pruefeId } from './fonts.mjs';
import { normalisiere, regelnCss, istStandard } from '../lib/regeln.mjs';
import { bildArt } from '../lib/ki.mjs';
import { umschreiben, referenzAnalysieren, kiBild } from './ki.mjs';

const PRAEFIX = '/__tweakbar/';
const MAX_BODY = 1024 * 1024;
const MAX_BILD = 6 * 1024 * 1024;
const BILD_TYPEN = ['image/png', 'image/jpeg', 'image/webp'];
const BILD_ENDUNGEN = /\.(avif|webp|png|jpe?g|gif|svg)$/i;
const ICONS = [
  'palette', 'type', 'ruler', 'mouse-pointer-click', 'image', 'layers', 'panel-top', 'monitor',
  'smartphone', 'tablet', 'undo-2', 'redo-2', 'save', 'rotate-ccw', 'shuffle', 'chevron-down',
  'chevron-up', 'x', 'grip-vertical', 'eye', 'eye-off', 'grid-3x3', 'sparkles', 'arrow-right',
  'arrow-up', 'arrow-down', 'copy', 'check', 'crosshair', 'wand-sparkles', 'camera', 'search',
  'dices', 'play', 'pause', 'text-cursor-input', 'pencil', 'scissors', 'flame', 'target', 'chevron-left',
  'chevron-right', 'upload', 'pipette', 'image-plus', 'columns-2', 'contrast', 'scan-eye', 'loader-circle', 'check-check',
];

const LOKALE_ADRESSEN = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Only requests from this machine, with a local Host/Origin (blocks DNS rebinding and foreign pages). */
export function istLokal(req) {
  const adresse = req.socket?.remoteAddress ?? '';
  if (!LOKALE_ADRESSEN.has(adresse)) return false;
  const lokalerHost = (wert) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(wert ?? '');
  if (!lokalerHost(req.headers.host)) return false;
  const herkunft = req.headers.origin;
  if (herkunft) {
    try {
      if (!lokalerHost(new URL(herkunft).host)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function sende(res, status, inhalt) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(inhalt));
}

function leseBody(req) {
  return new Promise((resolve, reject) => {
    let groesse = 0;
    const teile = [];
    req.on('data', (stueck) => {
      groesse += stueck.length;
      if (groesse > MAX_BODY) { reject(new Error('Anfrage zu groß')); req.destroy(); return; }
      teile.push(stueck);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(teile).toString('utf8') || '{}')); }
      catch { reject(new Error('Kein gültiges JSON')); }
    });
    req.on('error', reject);
  });
}

/** Raw body (images) with a size limit. */
function leseRohBody(req, max) {
  return new Promise((resolve, reject) => {
    let groesse = 0;
    const teile = [];
    // Over the limit: keep draining without storing, then answer with a clear error
    // (destroying the socket would leave the browser without any message).
    req.on('data', (stueck) => {
      groesse += stueck.length;
      if (groesse <= max) teile.push(stueck);
      else teile.length = 0;
    });
    req.on('end', () => {
      if (groesse > max) reject(new Error(`Bild zu groß, höchstens ${Math.round(max / 1024 / 1024)} MB`));
      else resolve(Buffer.concat(teile));
    });
    req.on('error', reject);
  });
}

async function listeBilder(ordner, basis = ordner) {
  let eintraege = [];
  try { eintraege = await readdir(ordner, { withFileTypes: true }); } catch { return []; }
  const ergebnis = [];
  for (const eintrag of eintraege) {
    const voll = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) ergebnis.push(...(await listeBilder(voll, basis)));
    else if (BILD_ENDUNGEN.test(eintrag.name)) ergebnis.push(`/images/${path.relative(basis, voll).split(path.sep).join('/')}`);
  }
  return ergebnis.sort();
}

async function leseIcons(wurzel) {
  const ordner = path.join(wurzel, 'node_modules', '@lucide', 'astro', 'src', 'icons');
  const ergebnis = {};
  for (const name of ICONS) {
    try {
      const quelle = await readFile(path.join(ordner, `${name}.ts`), 'utf8');
      const treffer = quelle.match(/=\s*(\{"name".*\});/);
      if (treffer) ergebnis[name] = JSON.parse(treffer[1]).node;
    } catch {
      // Missing icon: the panel falls back to a text label.
    }
  }
  return ergebnis;
}

function aenderungenMarkdown(aenderungen) {
  const zeilen = [
    '# Tweakbar: Änderungen für den Quelltext',
    '',
    `Stand: ${new Date().toLocaleString('de-DE')}`,
    '',
    'Diese Änderungen betreffen .astro-Dateien (Texte auch site.ts) und wurden NICHT automatisch übernommen.',
    'Claude: bitte je Eintrag im genannten Quelltext umsetzen und danach diese Datei leeren.',
    '',
  ];
  aenderungen.forEach((a, i) => {
    zeilen.push(`## ${i + 1}. ${a.art}: ${a.element}`);
    if (a.art === 'Text') zeilen.push(`- Kurz: Text in ${a.datei}: "${a.alt}" → "${a.neu}"`);
    zeilen.push(`- Datei: \`${a.datei}\``);
    if (a.alt) zeilen.push(`- Vorher: \`${a.alt}\``);
    zeilen.push(`- Nachher: \`${a.neu}\``);
    if (a.hinweis) zeilen.push(`- Hinweis: ${a.hinweis}`);
    zeilen.push('');
  });
  return zeilen.join('\n');
}

function pruefeAenderungen(roh) {
  if (!Array.isArray(roh)) return [];
  const text = (wert, max = 2000) => String(wert ?? '').replace(/[\r\n]+/g, ' ').slice(0, max);
  return roh.slice(0, 200).map((a) => ({
    art: text(a?.art, 60), datei: text(a?.datei, 300), element: text(a?.element, 300),
    alt: text(a?.alt), neu: text(a?.neu), hinweis: text(a?.hinweis, 500),
  }));
}

export function erstelleHandler({ wurzel, tokensDatei }) {
  const tokensPfad = path.resolve(wurzel, tokensDatei);
  const publicDir = path.join(wurzel, 'public');
  let iconCache = null;
  let projektName = null;

  // Project name for the cost log: package.json name, else the folder name.
  async function projekt() {
    if (projektName) return projektName;
    try { projektName = JSON.parse(await readFile(path.join(wurzel, 'package.json'), 'utf8')).name; } catch { /* no package.json */ }
    projektName ||= path.basename(wurzel);
    return projektName;
  }

  async function leseTokens() {
    return readFile(tokensPfad, 'utf8');
  }

  // Backup once per dev-server session, before the first write. The .bak
  // file therefore holds the state before this session's first save, not
  // only the step before the last one.
  let gesichertInSitzung = false;
  async function schreibeTokens(text) {
    if (!gesichertInSitzung) {
      await copyFile(tokensPfad, `${tokensPfad}.bak-tweakbar`);
      gesichertInSitzung = true;
    }
    await writeFile(tokensPfad, text, 'utf8');
  }

  /** Download fonts and update the fonts block plus --font-* variables. */
  async function fontsAnwenden(text, fonts, vars) {
    let neu = text;
    const varAenderungen = {};
    const block = leseBlock(neu, 'fonts');
    const gruppen = teileFontFaces(block?.inhalt ?? '');
    const geladen = [];
    for (const rolle of ['display', 'body']) {
      const wahl = fonts?.[rolle];
      if (!wahl) continue;
      if (!pruefeId(wahl.id)) throw new Error(`Ungültige Font-ID für ${rolle}`);
      const gewichte = rolle === 'display'
        ? [Number(vars['--fw-display']) || 600, Number(vars['--fw-display-strong']) || 700]
        : [400, 500, 600, 700];
      const font = await ladeFont({ id: wahl.id, gewichte, kursiv: rolle === 'body' }, publicDir);
      gruppen[font.familie] = font.regeln;
      varAenderungen[rolle === 'display' ? '--font-display' : '--font-body'] = fontVariable(font.familie, font.kategorie);
      geladen.push({ rolle, familie: font.familie, variabel: font.variabel, dateien: font.dateien });
    }
    if (geladen.length) {
      const css = Object.values(gruppen).flat().join('\n');
      neu = schreibeBlock(neu, 'fonts', css, { position: 'vorRoot' });
    }
    return { text: neu, varAenderungen, geladen };
  }

  function pruefeVars(vars, erlaubt) {
    const sauber = {};
    for (const [name, wert] of Object.entries(vars ?? {})) {
      const fehler = pruefeVariable(name, wert, erlaubt);
      if (fehler) throw new Error(fehler);
      sauber[name] = String(wert).trim();
    }
    return sauber;
  }

  async function speichern(body) {
    const vorher = await leseTokens();
    const vorhanden = leseRootVariablen(vorher);
    const erlaubt = new Set(Object.keys(vorhanden));
    const vars = pruefeVars(body.vars, erlaubt);
    const aktuelleWerte = Object.fromEntries(Object.entries(vorhanden).map(([n, v]) => [n, v.wert]));

    let text = vorher;
    const fontErgebnis = await fontsAnwenden(text, body.fonts, { ...aktuelleWerte, ...vars });
    text = fontErgebnis.text;
    Object.assign(vars, fontErgebnis.varAenderungen);
    text = ersetzeVariablen(text, vars);

    if (body.regeln) {
      const optionen = normalisiere(body.regeln);
      const icons = iconCache ?? (iconCache = await leseIcons(wurzel));
      const css = istStandard(optionen) ? '' : regelnCss(optionen, { pfeilKnoten: icons['arrow-right'] });
      text = schreibeBlock(text, 'regeln', css, { meta: optionen, position: 'nachRoot' });
    }

    let aenderungenDatei = null;
    const aenderungen = pruefeAenderungen(body.aenderungen);
    if (aenderungen.length) {
      aenderungenDatei = path.join(wurzel, 'tweakbar-aenderungen.md');
      await writeFile(aenderungenDatei, aenderungenMarkdown(aenderungen), 'utf8');
    }

    let gesichert = false;
    if (text !== vorher) {
      await schreibeTokens(text);
      gesichert = true;
    }
    return {
      ok: true,
      geaendert: text !== vorher,
      gesichert,
      variablen: Object.keys(vars),
      fonts: fontErgebnis.geladen,
      aenderungenDatei: aenderungenDatei ? path.relative(wurzel, aenderungenDatei) : null,
      aenderungenText: aenderungen.length ? aenderungenMarkdown(aenderungen) : '',
    };
  }

  async function varianteSpeichern(body) {
    const gruppe = String(body.gruppe ?? '').trim();
    const name = String(body.name ?? '').trim();
    const nr = Number(body.nr);
    if (!/^[A-Za-zÄÖÜäöüß0-9 ]{1,30}$/.test(gruppe)) throw new Error('Gruppenname: 1 bis 30 Buchstaben oder Ziffern');
    if (!/^[^"'<>{}\\;]{1,30}$/.test(name)) throw new Error('Variantenname: 1 bis 30 Zeichen, keine Sonderzeichen');
    if (!Number.isInteger(nr) || nr < 1 || nr > 9) throw new Error('Nummer muss zwischen 1 und 9 liegen');
    const kurz = gruppenKurz(gruppe);
    if (!/^[a-z0-9-]+$/.test(kurz) || /^-+$/.test(kurz)) throw new Error('Gruppenname ergibt keine gültige Klasse');

    const vorher = await leseTokens();
    const vorhanden = leseRootVariablen(vorher);
    const erlaubt = new Set(Object.keys(vorhanden));
    const vars = pruefeVars(body.vars, erlaubt);
    const aktuelleWerte = Object.fromEntries(Object.entries(vorhanden).map(([n, v]) => [n, v.wert]));

    let text = vorher;
    const fontErgebnis = await fontsAnwenden(text, body.fonts, { ...aktuelleWerte, ...vars });
    text = fontErgebnis.text;
    Object.assign(vars, fontErgebnis.varAenderungen);

    const farbe = typeof body.farbe === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.farbe) ? body.farbe.toUpperCase() : null;
    const block = leseBlock(text, 'varianten');
    const meta = block?.meta && typeof block.meta === 'object' ? block.meta : { gruppen: {} };
    const regeln = {};
    for (const regel of (block?.inhalt ?? '').match(/html\.pw-v-[a-z0-9-]+\s*\{[^}]*\}/g) ?? []) {
      regeln[regel.match(/html\.(pw-v-[a-z0-9-]+)/)[1]] = regel;
    }
    const klasse = `pw-v-${kurz}-${nr}`;
    const deklarationen = Object.entries(vars).map(([n, w]) => `  ${n}: ${w};`).join('\n');
    regeln[klasse] = `html.${klasse} {\n${deklarationen || '  /* Grundfassung, keine Abweichung */'}\n}`;
    const eintraege = (meta.gruppen[gruppe] ??= []);
    const vorhandenerEintrag = eintraege.find((e) => e.nr === nr);
    if (vorhandenerEintrag) Object.assign(vorhandenerEintrag, { name, farbe });
    else eintraege.push({ nr, name, farbe });
    eintraege.sort((a, b) => a.nr - b.nr);

    const css = Object.keys(regeln).sort().map((k) => regeln[k]).join('\n');
    text = schreibeBlock(text, 'varianten', css, { meta, position: 'nachRoot' });

    if (text !== vorher) {
      await schreibeTokens(text);
    }

    // Suggestion for site.ts. The pitch bar numbers entries from 1 in list order.
    const klassen = {};
    for (const [g, liste] of Object.entries(meta.gruppen)) {
      const max = Math.max(...liste.map((e) => e.nr));
      klassen[g] = Array.from({ length: max }, (_, i) => {
        const e = liste.find((x) => x.nr === i + 1);
        const eintragName = e?.name ?? `Variante ${i + 1}`;
        return e?.farbe ? { name: eintragName, farbe: e.farbe } : eintragName;
      });
    }
    const json = JSON.stringify(klassen).replace(/'/g, "\\'");
    const vorschlag = [
      '// src/config/site.ts',
      'pitchLeiste: {',
      "  kunde: '<slug>',",
      "  token: '<schreib-token>',",
      `  klassen: '${json}',`,
      '},',
    ].join('\n');
    const luecken = Object.entries(klassen)
      .filter(([g]) => !(meta.gruppen[g] ?? []).some((e) => e.nr === 1))
      .map(([g]) => g);
    return { ok: true, klasse, vorschlag, fonts: fontErgebnis.geladen, luecken };
  }

  return async function tweakbarMiddleware(req, res, weiter) {
    const url = req.url ?? '';
    if (!url.startsWith(PRAEFIX)) { weiter(); return; }
    if (!istLokal(req)) { sende(res, 403, { ok: false, fehler: 'Nur lokal erlaubt' }); return; }
    const { pathname, searchParams } = new URL(url, 'http://localhost');
    const route = pathname.slice(PRAEFIX.length);
    try {
      if (req.method === 'GET' && route === 'zustand') {
        const text = await leseTokens();
        const vars = Object.fromEntries(Object.entries(leseRootVariablen(text)).map(([n, v]) => [n, v.wert]));
        const regeln = leseBlock(text, 'regeln')?.meta ?? null;
        const varianten = leseBlock(text, 'varianten')?.meta ?? null;
        sende(res, 200, { ok: true, datei: path.relative(wurzel, tokensPfad), vars, regeln, varianten });
        return;
      }
      if (req.method === 'GET' && route === 'bilder') {
        sende(res, 200, { ok: true, bilder: await listeBilder(path.join(publicDir, 'images')) });
        return;
      }
      if (req.method === 'GET' && route === 'icons') {
        iconCache ??= await leseIcons(wurzel);
        sende(res, 200, { ok: true, icons: iconCache });
        return;
      }
      if (req.method === 'GET' && route === 'fonts') {
        sende(res, 200, { ok: true, fonts: await sucheFonts(searchParams.get('q') ?? '') });
        return;
      }
      if (req.method === 'GET' && route === 'font') {
        sende(res, 200, { ok: true, font: await fontInfo(searchParams.get('id') ?? '') });
        return;
      }
      if (req.method === 'POST' && ['save', 'variante', 'umschreiben', 'ki-bild'].includes(route)) {
        if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
          sende(res, 415, { ok: false, fehler: 'Nur JSON' });
          return;
        }
        const body = await leseBody(req);
        if (route === 'save') sende(res, 200, await speichern(body));
        else if (route === 'variante') sende(res, 200, await varianteSpeichern(body));
        else if (route === 'umschreiben') sende(res, 200, await umschreiben(body));
        else sende(res, 200, await kiBild({ body, wurzel, publicDir, projekt: await projekt() }));
        return;
      }
      if (req.method === 'POST' && route === 'referenz') {
        const typ = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
        if (!BILD_TYPEN.includes(typ)) {
          sende(res, 415, { ok: false, fehler: 'Nur PNG, JPG oder WebP' });
          return;
        }
        const bytes = await leseRohBody(req, MAX_BILD);
        const echt = bildArt(bytes);
        if (!echt) {
          sende(res, 400, { ok: false, fehler: 'Datei ist kein PNG, JPG oder WebP' });
          return;
        }
        sende(res, 200, await referenzAnalysieren({ bytes, mime: echt, wurzel, projekt: await projekt() }));
        return;
      }
      sende(res, 404, { ok: false, fehler: 'Unbekannter Tweakbar-Endpunkt' });
    } catch (fehler) {
      sende(res, 400, { ok: false, fehler: fehler instanceof Error ? fehler.message : String(fehler) });
    }
  };
}
