// AI routes of the Tweakbar (dev server only): text rewrite via texten.py,
// reference analysis and AI image via the Gemini API.
// The Gemini key is read on the server and never leaves it: not in a
// response, not in a log line, not in an error message.

import { readFile, writeFile, appendFile, mkdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { KURATIERT } from '../lib/fontliste.mjs';
import { REFERENZ_SCHEMA, normalisiereReferenz, naechstesVerhaeltnis, dateiSlug } from '../lib/ki.mjs';
import { teileVarianten, normalisiereText } from '../lib/text.mjs';

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/';
const BILD_MODELL = 'gemini-2.5-flash-image';
// Vision model with JSON output. The first one that exists wins (404 -> next).
const ANALYSE_MODELLE = [process.env.TWEAKBAR_GEMINI_MODELL, 'gemini-2.5-flash', 'gemini-flash-latest'].filter(Boolean);
const TEXTEN_ORDNER = process.env.TWEAKBAR_TEXTEN ?? 'D:\\Portawerk\\00_Toolkit\\texten';
const PYTHON = process.env.TWEAKBAR_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const KOSTEN_CSV = path.join(os.homedir(), '.claude', 'logs', 'gemini-kosten.csv');
const KOSTEN_SPALTEN = ['zeit', 'projekt', 'werkzeug', 'modell', 'eingabe_tokens', 'ausgabe_tokens', 'usd'];
// Same list prices as 00_Toolkit/scripts/gemini_kosten.py (USD per million tokens, in/out).
const PREISE = {
  'gemini-2.5-flash-image': [0.30, 30.00],
  'gemini-2.5-flash': [0.30, 2.50],
};

// ───────── key ─────────

function ausEnvDatei(text) {
  for (const zeile of text.split(/\r?\n/)) {
    const treffer = zeile.match(/^\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*(.*)$/);
    if (treffer) {
      const wert = treffer[1].trim().replace(/^['"]|['"]$/g, '');
      if (wert) return wert;
    }
  }
  return null;
}

/** Order: env GEMINI_API_KEY, project .env, PortaWerk site .env, ~/.claude/secrets/gemini.env. */
export async function leseGeminiSchluessel(wurzel) {
  if (process.env.GEMINI_API_KEY?.trim()) return process.env.GEMINI_API_KEY.trim();
  const orte = [
    path.join(wurzel, '.env'),
    'D:\\Portawerk\\02_Eigene_Projekte\\2026\\Portawerk_Site\\00_Portawerk_Website\\.env',
    path.join(os.homedir(), '.claude', 'secrets', 'gemini.env'),
  ];
  for (const ort of orte) {
    try {
      const schluessel = ausEnvDatei(await readFile(ort, 'utf8'));
      if (schluessel) return schluessel;
    } catch { /* file missing, try the next */ }
  }
  throw new Error('Kein Gemini-Schlüssel gefunden. Erwartet GEMINI_API_KEY in der Umgebung, in .env des Projekts oder in ~/.claude/secrets/gemini.env.');
}

// ───────── cost log (same CSV as gemini_kosten.py) ─────────

function csvFeld(wert) {
  const text = String(wert ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function lokaleZeit(datum = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${datum.getFullYear()}-${z(datum.getMonth() + 1)}-${z(datum.getDate())}T${z(datum.getHours())}:${z(datum.getMinutes())}:${z(datum.getSeconds())}`;
}

export function kostenUsd(modell, eingabe, ausgabe) {
  const satz = PREISE[modell];
  return satz ? (eingabe * satz[0] + ausgabe * satz[1]) / 1_000_000 : 0;
}

/** Append one line. Never throws: the log must not break a call. */
export async function protokolliere({ modell, nutzung, werkzeug, projekt, datei = KOSTEN_CSV }) {
  try {
    const eingabe = Number(nutzung?.promptTokenCount ?? 0) || 0;
    // Thinking tokens are billed as output; the Python logger predates them.
    const ausgabe = (Number(nutzung?.candidatesTokenCount ?? 0) || 0) + (Number(nutzung?.thoughtsTokenCount ?? 0) || 0);
    const zeile = [lokaleZeit(), projekt, werkzeug, modell, eingabe, ausgabe, kostenUsd(modell, eingabe, ausgabe).toFixed(5)];
    await mkdir(path.dirname(datei), { recursive: true });
    let neu = false;
    try { await stat(datei); } catch { neu = true; }
    // CRLF like Python's csv module, so both writers produce the same file.
    const text = `${neu ? `${KOSTEN_SPALTEN.join(',')}\r\n` : ''}${zeile.map(csvFeld).join(',')}\r\n`;
    await appendFile(datei, text, 'utf8');
  } catch (fehler) {
    console.warn('[Tweakbar] Kostenprotokoll nicht geschrieben:', fehler instanceof Error ? fehler.message : fehler);
  }
}

// ───────── Gemini ─────────

async function rufeGemini(modell, koerper, schluessel, zeitMs) {
  let antwort;
  try {
    antwort = await fetch(`${GEMINI}${encodeURIComponent(modell)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': schluessel },
      body: JSON.stringify(koerper),
      signal: AbortSignal.timeout(zeitMs),
    });
  } catch (fehler) {
    const grund = fehler?.name === 'TimeoutError' ? `keine Antwort nach ${Math.round(zeitMs / 1000)} s` : 'Netzwerkfehler';
    throw new Error(`Gemini nicht erreichbar (${grund})`);
  }
  let daten = null;
  try { daten = await antwort.json(); } catch { daten = null; }
  if (!antwort.ok) {
    const fehler = new Error(`Gemini meldet ${antwort.status}: ${String(daten?.error?.message ?? 'ohne Begründung').slice(0, 300)}`);
    fehler.status = antwort.status;
    throw fehler;
  }
  return daten ?? {};
}

// ───────── 1. rewrite via texten.py ─────────

const ANWEISUNGEN = {
  kuerzer: 'Mach ihn deutlich kürzer, ohne Inhalt zu verlieren.',
  waermer: 'Mach ihn wärmer und persönlicher, ohne kitschig zu werden.',
  konkreter: 'Mach ihn konkreter, mit greifbaren Aussagen statt allgemeiner Behauptungen. Erfinde keine Fakten, Zahlen oder Auszeichnungen.',
};

// Runs texte() from texten.py. Arguments go through argv (no shell), the
// result comes back as one JSON line on stdout.
const PY_CODE = [
  'import sys, json',
  'sys.stdout.reconfigure(encoding="utf-8")',
  'sys.path.insert(0, sys.argv[1])',
  'from texten import texte',
  'e = texte(sys.argv[2], sys.argv[3], None, sys.argv[4] or None, sys.argv[5] or None)',
  'print(json.dumps({"text": e["text"], "warnungen": e["warnungen"], "modell": e["modell"]}, ensure_ascii=False))',
].join('\n');

function fuehrePythonAus(argumente, zeitMs) {
  return new Promise((resolve, reject) => {
    execFile(PYTHON, ['-c', PY_CODE, ...argumente], {
      timeout: zeitMs, windowsHide: true, maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    }, (fehler, stdout, stderr) => {
      if (fehler) {
        if (fehler.killed) { reject(new Error(`texten.py hat nach ${Math.round(zeitMs / 1000)} s nicht geantwortet`)); return; }
        if (fehler.code === 'ENOENT') { reject(new Error(`Python nicht gefunden (${PYTHON}). Pfad über TWEAKBAR_PYTHON setzen.`)); return; }
        const letzte = String(stderr || '').trim().split(/\r?\n/).filter(Boolean).pop() ?? fehler.message;
        reject(new Error(`texten.py: ${letzte.slice(0, 300)}`));
        return;
      }
      resolve(String(stdout));
    });
  });
}

export async function umschreiben(body) {
  const text = normalisiereText(body?.text);
  if (!text) throw new Error('Kein Text zum Umschreiben');
  if (text.length > 2000) throw new Error('Text zu lang, höchstens 2000 Zeichen');
  const frei = normalisiereText(body?.anweisung).slice(0, 300);
  const anweisung = ANWEISUNGEN[body?.art] ?? frei;
  if (!anweisung) throw new Error('Bitte eine Anweisung wählen oder eingeben');
  try { await stat(path.join(TEXTEN_ORDNER, 'texten.py')); } catch {
    throw new Error(`texten.py nicht gefunden in ${TEXTEN_ORDNER}. Pfad über TWEAKBAR_TEXTEN setzen.`);
  }
  const k = body?.kontext ?? {};
  const kontext = [
    k.seite ? `Seite: ${normalisiereText(k.seite).slice(0, 120)}` : '',
    k.ueberschrift ? `Abschnitt: ${normalisiereText(k.ueberschrift).slice(0, 160)}` : '',
    k.element ? `Element: ${normalisiereText(k.element).slice(0, 20)}` : '',
  ].filter(Boolean).join('. ');
  const auftrag = `Formuliere diesen Text von der Website neu. ${anweisung} Originaltext: "${text}"`;
  const istKurz = /^(h[1-6]|a|button|li|figcaption|label)$/i.test(String(k.element ?? ''));
  const laenge = body?.art === 'kuerzer' ? 'deutlich kürzer als das Original' : istKurz ? 'etwa so lang wie das Original, nicht länger' : '';
  const extra = [
    kontext ? `Kontext: ${kontext}.` : '',
    'Schreibe genau drei unterschiedliche Fassungen. Trenne die Fassungen durch eine eigene Zeile, die nur aus ### besteht. Keine Nummerierung, keine Anführungszeichen um die Fassungen.',
    'Die Rolle des Textes bleibt: eine Überschrift bleibt eine Überschrift, ein Button-Text bleibt ein kurzer Aufruf.',
  ].filter(Boolean).join('\n');
  const sorte = body?.du === true ? 'kunde_du' : 'kunde';
  const roh = await fuehrePythonAus([TEXTEN_ORDNER, sorte, auftrag, laenge, extra], 60_000);
  let ergebnis;
  try {
    ergebnis = JSON.parse(roh.trim().split(/\r?\n/).pop());
  } catch {
    throw new Error('texten.py hat keine lesbare Antwort geliefert');
  }
  const varianten = teileVarianten(ergebnis.text, 3);
  if (!varianten.length) throw new Error('Keine Fassung erhalten, bitte nochmal versuchen');
  return { ok: true, varianten, warnungen: ergebnis.warnungen ?? [], modell: ergebnis.modell };
}

// ───────── 2. reference screenshot ─────────

function referenzPrompt() {
  const liste = KURATIERT.map((f) => `${f.id} (${f.family}, ${f.category})`).join('; ');
  return [
    'Du analysierst den Screenshot einer Website für einen Webdesigner. Lies die Gestaltung ab, nicht den Inhalt.',
    'farben: Hauptfarbe der Marke (primary), Akzentfarbe der Buttons oder Links (accent), Seitenhintergrund (bg), Fließtextfarbe (text), jeweils als #RRGGBB.',
    'button: Art des wichtigsten Buttons (gefuellt, kontur oder unterstrichen), Form (standard = leicht gerundet, pille = voll gerundet, eckig = 0 px), Eckenradius in px, ob ein Pfeil im Button steht, Größe relativ (1 = normal).',
    'schrift: Kategorie der Überschriften-Schrift, Gewicht (100 bis 900), Laufweite in em, und bis zu drei ähnlichste Schriften NUR aus dieser Liste, angegeben mit ihrer id:',
    liste,
    'form: Eckenradius von Karten und Bildern in px, Schatten (0 keine, 1 normal, 2 kräftig), Linienstärke in px (0 bis 4), Dichte der Abstände (0.6 eng bis 1.6 luftig, 1 normal).',
    'Wenn etwas nicht erkennbar ist, schätze einen neutralen Wert.',
  ].join('\n');
}

export async function referenzAnalysieren({ bytes, mime, wurzel, projekt }) {
  const schluessel = await leseGeminiSchluessel(wurzel);
  const koerper = {
    contents: [{ parts: [{ text: referenzPrompt() }, { inline_data: { mime_type: mime, data: Buffer.from(bytes).toString('base64') } }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: REFERENZ_SCHEMA, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
  };
  let daten = null, modell = null, letzterFehler = null;
  for (const kandidat of ANALYSE_MODELLE) {
    try {
      daten = await rufeGemini(kandidat, koerper, schluessel, 90_000);
      modell = kandidat;
      break;
    } catch (fehler) {
      letzterFehler = fehler;
      if (fehler.status !== 404) throw fehler; // only an unknown model moves on
    }
  }
  if (!daten) throw letzterFehler ?? new Error('Kein Analysemodell verfügbar');
  await protokolliere({ modell, nutzung: daten.usageMetadata, werkzeug: 'tweakbar-referenz', projekt });
  const text = (daten.candidates?.[0]?.content?.parts ?? []).map((t) => t.text ?? '').join('');
  let roh;
  try { roh = JSON.parse(text); } catch { throw new Error('Gemini hat kein gültiges JSON geliefert'); }
  return { ok: true, vorschlag: normalisiereReferenz(roh, KURATIERT.map((f) => f.id)), modell };
}

// ───────── 3. AI image ─────────

function zeitstempel(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

export async function kiBild({ body, wurzel, publicDir, projekt }) {
  const beschreibung = normalisiereText(body?.beschreibung);
  if (beschreibung.length < 5) throw new Error('Bitte das Motiv in ein paar Worten beschreiben');
  if (beschreibung.length > 1000) throw new Error('Beschreibung zu lang, höchstens 1000 Zeichen');
  const verhaeltnis = naechstesVerhaeltnis(body?.breite, body?.hoehe);
  const schluessel = await leseGeminiSchluessel(wurzel);
  const prompt = `${beschreibung}\n\nFotorealistisch, natürliches Licht, ruhige Bildsprache für eine Firmenwebsite. Keine Schrift, keine Logos, keine Wasserzeichen im Bild.`;
  const daten = await rufeGemini(BILD_MODELL, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { imageConfig: { aspectRatio: verhaeltnis } },
  }, schluessel, 120_000);
  await protokolliere({ modell: BILD_MODELL, nutzung: daten.usageMetadata, werkzeug: 'tweakbar-ki-bild', projekt });
  const teil = (daten.candidates?.[0]?.content?.parts ?? []).find((t) => (t.inlineData ?? t.inline_data)?.data);
  if (!teil) {
    const grund = daten.candidates?.[0]?.finishReason ?? daten.promptFeedback?.blockReason ?? 'unbekannt';
    throw new Error(`Kein Bild erhalten (Grund: ${grund}). Beschreibung anders formulieren.`);
  }
  let bytes = Buffer.from((teil.inlineData ?? teil.inline_data).data, 'base64');
  let endung = 'png';
  try {
    const sharp = (await import('sharp')).default;
    bytes = await sharp(bytes).webp({ quality: 82 }).toBuffer();
    endung = 'webp';
  } catch {
    // sharp missing: keep the PNG, the change list says so.
  }
  const ordner = path.join(publicDir, 'images', 'ki');
  await mkdir(ordner, { recursive: true });
  const name = `${dateiSlug(beschreibung)}-${zeitstempel()}.${endung}`;
  const ziel = path.resolve(ordner, name);
  if (!ziel.startsWith(ordner + path.sep)) throw new Error('Ungültiger Dateiname');
  await writeFile(ziel, bytes, { flag: 'wx' }); // never overwrite
  return { ok: true, pfad: `/images/ki/${name}`, verhaeltnis, format: endung, modell: BILD_MODELL };
}
