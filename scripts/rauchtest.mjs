/**
 * Rauchtest: prüft nach dem Bauen, ob echte Seiten herausgekommen sind.
 *
 * Warum das nötig ist: Am 27.07.2026 lieferte portawerk.de eine 156 Byte
 * grosse Fehlermeldung als Startseite aus — mit HTTP 200. Der Build hatte
 * dabei "Erfolg" gemeldet und deployt. Ein Statuscode sagt nichts darüber,
 * ob unter ihm eine Seite liegt.
 *
 * Bewusst grob: Vorhandensein, Grösse, Titel, Vollständigkeit, keine
 * Fehlertexte. Alles Feinere (erwartete Formulierungen) würde bei jeder
 * Textänderung Fehlalarm schlagen und wäre nach zwei Wochen abgeschaltet.
 *
 * Aufruf:  node scripts/rauchtest.mjs
 * Beendet mit Code 1, wenn etwas nicht stimmt.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

// Astro legt je nach Adapter nach dist/ oder dist/client/ ab, Vite nach dist/.
// Bewusst NICHT an index.html festmachen: Projekte mit dynamischer Startseite
// (z.B. passwortgeschützter Bereich) erzeugen gar keine statische index.html,
// haben aber sehr wohl vorgerenderte Unterseiten.
const KANDIDATEN = ['dist/client', 'dist', 'build'];
const WURZEL = KANDIDATEN.find((p) => existsSync(p));

const MIN_BYTES = 1000;
const MIN_SEITEN = 1;

/**
 * Bestätigungsdateien von Suchmaschinen und Diensten. Die sind absichtlich
 * winzig und haben weder Titel noch HTML-Gerüst — sie enthalten nur einen
 * Nachweis, dass die Domain jemandem gehört. Ohne diese Ausnahme schlägt der
 * Test bei jeder Seite Alarm, die bei der Google Search Console angemeldet ist.
 */
const BESTAETIGUNGSDATEIEN = [
  /^google[0-9a-f]+\.html$/i,
  /^BingSiteAuth\.html$/i,
  /^[0-9a-f]{32}\.html$/i,
  /^pinterest-[0-9a-z]+\.html$/i,
];
const BESTAETIGUNGSINHALT = /site-verification|verify-v1|^google-site-verification/i;

// Texte, die in einer ausgelieferten Seite nichts verloren haben. Sie sind
// das, was Astro bei einem Fehler beim Vorab-Rendern in die Datei schreibt.
const FEHLERTEXTE = [
  'TypeError:',
  'ReferenceError:',
  'EnvInvalidVariables',
  'Cannot read properties',
  'Invalid header value',
];

/**
 * Bilder, die im fertigen Bau gar nicht liegen.
 *
 * Warum das nötig ist: Bei Schabau war ab dem 24.06.2026 jedes Bild der
 * Startseite tot. Die Seite war on-demand gerendert, wodurch Astro auf den
 * Laufzeit-Endpunkt `/_image?…` verwies — den Cloudflare nicht bedienen kann,
 * weil sharp dort nicht läuft. Jedes Bild lieferte 500. Größe, Titel und
 * Fehlertexte waren dabei tadellos, der Rauchtest blieb grün, und aufgefallen
 * ist es erst fünf Wochen später.
 *
 * Zwei Prüfungen, beide bewusst grob:
 * 1. Verweise auf `/_image?` — auf Cloudflare immer kaputt.
 * 2. Lokale Bilddateien, die im Ausgabeordner fehlen.
 *
 * Nicht geprüft werden Verweise mit Query, auf fremde Server oder auf
 * Programmpfade (`/api/…`): die entstehen erst zur Laufzeit.
 */
const BILD_ENDUNGEN = /\.(webp|avif|png|jpe?g|gif|svg)$/i;

function pruefeBilder(inhalt, wurzel) {
  const maengel = [];

  const laufzeitBilder = inhalt.match(/\/_image\?/g);
  if (laufzeitBilder) {
    maengel.push(
      `${laufzeitBilder.length} Bild(er) über den Laufzeit-Endpunkt /_image — ` +
        'auf Cloudflare liefert der 500. Seite darf nicht on-demand gerendert sein ' +
        '(prerender = false), wenn sie <Image> nutzt.',
    );
  }

  const verweise = new Set();
  const re = /(?:src|href)=["'](\/[^"'?#]+)["']/gi;
  let m;
  while ((m = re.exec(inhalt))) {
    const pfad = m[1];
    if (!BILD_ENDUNGEN.test(pfad)) continue;
    if (pfad.startsWith('/api/')) continue;
    verweise.add(pfad);
  }

  const fehlend = [...verweise].filter((p) => !existsSync(join(wurzel, p.replace(/^\//, ''))));
  if (fehlend.length) {
    maengel.push(`Bild(er) fehlen im Bau: ${fehlend.slice(0, 5).join(', ')}`);
  }

  return maengel;
}

function alleHtmlDateien(verzeichnis) {
  const gefunden = [];
  for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
    const pfad = join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) gefunden.push(...alleHtmlDateien(pfad));
    else if (eintrag.name.endsWith('.html')) gefunden.push(pfad);
  }
  return gefunden;
}

function pruefe(pfad) {
  const maengel = [];
  const groesse = statSync(pfad).size;
  const inhalt = readFileSync(pfad, 'utf8');

  // Weiterleitungsseiten (z.B. /bewerten hinter einem QR-Code) sind absichtlich
  // klein. Sie gelten als gesund, wenn sie ein Ziel nennen; Titel und
  // Vollständigkeit werden weiter geprüft.
  const istWeiterleitung = /<meta[^>]+http-equiv=["']?refresh["']?[^>]+url=[^"'\s>]+/i.test(inhalt);
  if (groesse < MIN_BYTES && !istWeiterleitung) maengel.push(`nur ${groesse} Byte`);

  const titel = inhalt.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!titel) maengel.push('kein <title>');
  else if (!titel[1].trim()) maengel.push('<title> ist leer');

  if (!/<\/html>/i.test(inhalt)) maengel.push('kein schliessendes </html>, Seite unvollständig');

  for (const text of FEHLERTEXTE) {
    if (inhalt.includes(text)) maengel.push(`enthält Fehlertext "${text}"`);
  }

  maengel.push(...pruefeBilder(inhalt, WURZEL));

  return maengel;
}

if (!WURZEL) {
  console.error(`FEHLGESCHLAGEN: Kein Ausgabeordner gefunden (gesucht: ${KANDIDATEN.join(', ')}).`);
  process.exit(1);
}

const dateien = alleHtmlDateien(WURZEL);
console.log(`Rauchtest über ${dateien.length} Seite(n) in ${WURZEL}/\n`);

if (dateien.length < MIN_SEITEN) {
  console.error(`FEHLGESCHLAGEN: Keine einzige HTML-Seite in ${WURZEL}/ erzeugt.`);
  process.exit(1);
}

// Kein Fehler, aber wissenswert: Die Startseite wird dann erst zur Laufzeit
// erzeugt und kann hier nicht mitgeprüft werden.
if (!existsSync(join(WURZEL, 'index.html'))) {
  console.log('  Hinweis: keine statische index.html vorhanden — die Startseite');
  console.log('  entsteht offenbar erst zur Laufzeit und wird hier nicht geprüft.\n');
}

let kaputt = 0;
let uebersprungen = 0;
for (const pfad of dateien.sort()) {
  const name = relative(WURZEL, pfad).replace(/\\/g, '/');
  const dateiname = name.split('/').pop();
  const istBestaetigung =
    BESTAETIGUNGSDATEIEN.some((muster) => muster.test(dateiname)) ||
    (statSync(pfad).size < 500 && BESTAETIGUNGSINHALT.test(readFileSync(pfad, 'utf8')));
  if (istBestaetigung) {
    uebersprungen++;
    console.log(`  übersprungen  ${name} (Bestätigungsdatei einer Suchmaschine)`);
    continue;
  }
  const maengel = pruefe(pfad);
  if (maengel.length) {
    kaputt++;
    console.error(`  FEHLER  ${name}`);
    for (const m of maengel) console.error(`          ${m}`);
  } else {
    const kb = Math.round(statSync(pfad).size / 1024);
    console.log(`  ok      ${name} (${kb} kB)`);
  }
}

console.log();
if (uebersprungen) console.log(`${uebersprungen} Bestätigungsdatei(en) übersprungen.`);
if (kaputt) {
  console.error(`FEHLGESCHLAGEN: ${kaputt} von ${dateien.length} Seite(n) sind nicht in Ordnung.`);
  process.exit(1);
}
console.log(`Bestanden: alle ${dateien.length} Seite(n) sehen gesund aus.`);
