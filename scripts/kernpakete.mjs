/**
 * Stellt fest, ob bei einem Update ein KERN-Paket die Version gewechselt hat.
 *
 * Warum nicht einfach im Diff nach dem Namen suchen: Ein Diff enthält auch
 * unveränderte Kontextzeilen und verschachtelte Pfade wie
 * "node_modules/vite/node_modules/es-module-lexer". Eine Textsuche schlägt
 * dadurch fast immer an — geprüft am 27.07.2026 an zwei Projekten, in denen
 * nachweislich nur Nebenpakete gehoben wurden und die Suche trotzdem "ja"
 * meldete. Ein Wächter, der immer "ja" sagt, ist so nutzlos wie einer, der
 * immer "nein" sagt.
 *
 * Verglichen werden deshalb die tatsächlichen Versionen aus package-lock.json,
 * vorher (aus git) gegen nachher (Arbeitsverzeichnis).
 *
 * Aufruf:  node scripts/kernpakete.mjs "astro|@astrojs"
 * Ausgabe: "ja" oder "nein" auf stdout, Details auf stderr.
 */
import { readFileSync } from 'node:fs';
// execFileSync statt execSync: kein Shell-Aufruf, Argumente werden als Liste
// übergeben und nicht in eine Befehlszeile eingesetzt.
import { execFileSync } from 'node:child_process';

const muster = process.argv[2];
if (!muster) {
  console.error('Aufruf: node scripts/kernpakete.mjs "astro|@astrojs"');
  process.exit(2);
}
// Trifft "node_modules/astro" und "node_modules/@astrojs/xyz",
// aber NICHT "node_modules/vite/node_modules/irgendwas".
const istKern = new RegExp(`^node_modules/(${muster})(/[^/]+)?$`);

function paketeAus(json) {
  try {
    const daten = JSON.parse(json);
    return daten.packages ?? {};
  } catch {
    return {};
  }
}

let vorher;
try {
  vorher = paketeAus(execFileSync('git', ['show', 'HEAD:package-lock.json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
} catch {
  console.error('package-lock.json in HEAD nicht lesbar — im Zweifel als Kern-Änderung behandeln.');
  console.log('ja');
  process.exit(0);
}
const nachher = paketeAus(readFileSync('package-lock.json', 'utf8'));

/**
 * Wie groß ist der Sprung? Nur die dritte Stelle bedeutet laut Semver eine
 * reine Fehlerbehebung, kein geändertes Verhalten — das ist mit grünem
 * Rauchtest vertretbar. Erste oder zweite Stelle heißt: Da kann sich etwas
 * anders verhalten, da schaut ein Mensch drauf.
 *
 * Sonderfall Hauptversion 0: Dort gilt auch die zweite Stelle als bruchfähig,
 * weil vor 1.0 keine Stabilität zugesagt wird. 0.82 -> 0.91 kann alles ändern.
 *
 * Alles, was nicht dem Muster X.Y.Z entspricht (Vorabversionen, Bereiche),
 * wird vorsichtshalber als groß eingestuft.
 */
function sprungart(alt, neu) {
  if (!alt || !neu) return 'gross';
  const zahlen = (v) => {
    const treffer = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
    return treffer ? treffer.slice(1, 4).map(Number) : null;
  };
  const a = zahlen(alt);
  const n = zahlen(neu);
  if (!a || !n) return 'gross';
  if (a[0] !== n[0]) return 'gross'; // erste Stelle: Hauptversion
  if (a[1] !== n[1]) return 'gross'; // zweite Stelle: neue Funktionen, bei 0.x sogar bruchfähig
  return 'klein';                    // dritte Stelle: Fehlerbehebung
}

const gross = [];
const klein = [];
for (const [pfad, eintrag] of Object.entries(nachher)) {
  if (!istKern.test(pfad)) continue;
  const alt = vorher[pfad]?.version;
  const neu = eintrag?.version;
  if (alt === neu) continue;
  const name = pfad.replace('node_modules/', '');
  const zeile = `${name}: ${alt ?? 'neu'} -> ${neu}`;
  (sprungart(alt, neu) === 'gross' ? gross : klein).push(zeile);
}
// Entfernte Kern-Pakete sind immer eine Sache für den Menschen.
for (const pfad of Object.keys(vorher)) {
  if (istKern.test(pfad) && !(pfad in nachher)) {
    gross.push(`${pfad.replace('node_modules/', '')}: entfernt`);
  }
}

if (klein.length) {
  console.error('Kern-Pakete, nur Fehlerbehebungen (gehen automatisch durch):');
  for (const zeile of klein) console.error(`  ${zeile}`);
}
if (gross.length) {
  console.error('Kern-Pakete mit möglicher Verhaltensänderung (Rückfrage nötig):');
  for (const zeile of gross) console.error(`  ${zeile}`);
  console.log('ja');
} else {
  if (!klein.length) console.error('Kein Kern-Paket hat die Version gewechselt.');
  console.log('nein');
}
