/**
 * Meldet Sicherheitslücken, die ein Mensch ansehen muss.
 *
 * Läuft NACH `npm audit fix`. Was dann noch übrig ist, hat der Wartungslauf
 * nicht von selbst beheben können — entweder gibt es gar keine Lösung, oder sie
 * verlangt einen Hauptversionssprung, den die Automatik bewusst nicht macht.
 *
 * Warum es das braucht: Bis hierher stand das Ergebnis von `npm audit` nur in
 * der Zusammenfassung des Laufs. Ein grüner Lauf meldet sich aber nie von
 * selbst. Bei Schabau standen dadurch monatelang "7 hohe Lücken" in Notion,
 * ohne dass jemand sie eingeordnet hat — und die Einordnung war der eigentliche
 * Punkt, nicht die Zahl. (Es waren am Ende Werkzeug-Lücken ohne Live-Risiko.)
 *
 * Bewusst NICHT gemeldet wird, was `npm audit fix` ohnehin gleich behebt. Sonst
 * entsteht jede Woche eine Meldung über etwas, das sich im selben Lauf erledigt
 * — und Meldungen, die man wegklickt, sind schlimmer als keine.
 *
 * Ausgabe auf stdout: "ja" oder "nein" (für die Weiche im Workflow).
 * Der Bericht für den Menschen geht auf stderr.
 */

import { execFileSync } from 'node:child_process';

/** Nur diese Stufen sind es wert, jemanden zu stören. */
const STUFEN = new Set(['high', 'critical']);

// Aufruf über execFile mit Argumentliste statt über eine zusammengesetzte
// Befehlszeile: So kann nichts als Shell-Befehl umgedeutet werden. Hier ist
// ohnehin nichts variabel, aber die Gewohnheit ist es wert.
//
// Unter Windows heißt die Datei npm.cmd, und Node lässt .cmd seit der Behebung
// von CVE-2024-27980 nur noch mit Shell starten. Im Wartungslauf (Linux) greift
// dieser Zweig nicht, er ist nur für lokale Tests da. Die Argumente bleiben
// auch dann eine Liste.
const IST_WINDOWS = process.platform === 'win32';

function holeAudit() {
  try {
    // `npm audit` endet mit Exitcode != 0, sobald es etwas findet — das ist
    // hier der Normalfall und kein Fehler, deshalb wird er abgefangen.
    return execFileSync(IST_WINDOWS ? 'npm.cmd' : 'npm', ['audit', '--omit=dev', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: IST_WINDOWS,
    });
  } catch (fehler) {
    if (fehler.stdout) return fehler.stdout;
    throw fehler;
  }
}

const roh = holeAudit();
let bericht;
try {
  bericht = JSON.parse(roh);
} catch {
  console.error('npm audit lieferte kein verwertbares JSON — Lücken-Prüfung übersprungen.');
  console.log('nein');
  process.exit(0);
}

const offen = [];
for (const [name, eintrag] of Object.entries(bericht.vulnerabilities ?? {})) {
  if (!STUFEN.has(eintrag.severity)) continue;

  // fixAvailable ist entweder false (keine Lösung), true (glatt behebbar) oder
  // ein Objekt mit isSemVerMajor — dann verlangt die Lösung einen
  // Hauptversionssprung, den `npm audit fix` ohne --force nicht macht.
  const loesung = eintrag.fixAvailable;
  const glattBehebbar = loesung === true || (loesung && typeof loesung === 'object' && !loesung.isSemVerMajor);
  if (glattBehebbar) continue;

  offen.push({
    name,
    stufe: eintrag.severity,
    weg:
      loesung && typeof loesung === 'object'
        ? `nur über ${loesung.name}@${loesung.version} (Hauptversionssprung)`
        : 'keine Lösung verfügbar',
  });
}

if (!offen.length) {
  console.error('Keine hohen Lücken, die von Hand angesehen werden müssten.');
  console.log('nein');
  process.exit(0);
}

// Der fertige Meldungstext entsteht hier und nicht im Workflow. Dort müsste er
// in einer eingerückten YAML-Zeile stehen, und genau daran zerlegt sich die
// Datei erfahrungsgemäß — abgesehen davon lässt sich der Text so testen.
const zeilen = [
  'Der wöchentliche Wartungslauf hat Sicherheitslücken gefunden, die er nicht',
  'selbst beheben konnte. Entweder gibt es keine Lösung, oder sie verlangt einen',
  'Hauptversionssprung — den macht die Automatik bewusst nicht, weil er die Seite',
  'kaputtmachen kann.',
  '',
  '### Betrifft das die Besucher der Website?',
  '',
  'Das ist die erste Frage, und meistens lautet die Antwort nein. Pakete wie',
  'Astro, Vite, Wrangler oder sharp sind Bau-Werkzeuge: Sie laufen beim Erstellen',
  'der Seite und werden nie an Besucher ausgeliefert. Eine Lücke darin ist',
  'Pflege, kein Notfall.',
  '',
  'Ernst wird es in drei Fällen: wenn das Paket im ausgelieferten Code steckt,',
  'wenn der Bauvorgang Daten von fremden Servern verarbeitet, oder wenn im Bau',
  'Zugangsdaten liegen — wer den Bauvorgang übernimmt, kann Schadcode in die',
  'fertige Seite schmuggeln.',
  '',
  '### Gefunden',
  '',
  ...offen.map((l) => `- **${l.name}** (${l.stufe}) — ${l.weg}`),
  '',
  'Details stehen in der Zusammenfassung des Laufs unter *Sicherheitsprüfung*.',
];

console.error(zeilen.join('\n'));
console.log('ja');
