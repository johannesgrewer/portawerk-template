/**
 * Platzhalter-Pruefung: meldet, was aus dem Starter noch nicht ersetzt ist.
 *
 * Prueft im gebauten dist/:
 *   - Icons und Vorschaubild sind noch die neutralen Starter-Platzhalter
 *     (Vergleich per Pruefsumme)
 *   - Texte wie [FIRMENNAME], [projekt], example.com, TODO: in den Seiten
 *
 * Aufruf:  node scripts/platzhalter.mjs           (nur Hinweise, Code 0)
 *          node scripts/platzhalter.mjs --streng  (Code 1 bei Fund, vor dem Livegang)
 * Laeuft mit `npm run rauchtest` gleich mit.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const WURZEL = 'dist';
const STRENG = process.argv.includes('--streng');

/** Pruefsummen der Starter-Platzhalter (erzeugt am 18.10.2026). */
const PLATZHALTER_DATEIEN = {
  'favicon.ico': 'a60a10f7f98be1d632dc771bb32d3f765b21dde8a49399e92d5eaf445883f362',
  'icon-192.png': '0a357c2b5ffebe7e8e2f3c7d90eb11a33f7ced33c171672e0f41038e67618e2f',
  'icon-512.png': '4f612074688223072b9342ff4e32ab532751e32938fb743f6ef6c65566c40c13',
  'apple-touch-icon.png': 'ec582906906891c87d7e556783a1a9a40567b45e6d7e6bd5c8628ee0ed672fbc',
  'og-image.jpg': '4b29244f13fe636772c49b97b0be9a489bbf2c1ce6289813a1e9897f71aa234a',
};

/** Textmarken, die in einer fertigen Seite nicht mehr stehen duerfen. */
const TEXT_MARKEN = [/\[FIRMENNAME/, /projekt-slug/,/\[projekt/i, /\[STRASSE/, /\[VORNAME/, /example\.com/, /TODO:/, /info@\[domain\]/];

function alleHtmlDateien(ordner) {
  const treffer = [];
  for (const eintrag of readdirSync(ordner)) {
    const pfad = join(ordner, eintrag);
    if (statSync(pfad).isDirectory()) treffer.push(...alleHtmlDateien(pfad));
    else if (eintrag.endsWith('.html') || eintrag.endsWith('.xml') || eintrag.endsWith('.txt')) treffer.push(pfad);
  }
  return treffer;
}

function main() {
  if (!existsSync(WURZEL)) {
    console.error('Platzhalter: dist/ fehlt, zuerst npm run build.');
    process.exitCode = 1;
    return;
  }
  const funde = [];

  for (const [datei, summe] of Object.entries(PLATZHALTER_DATEIEN)) {
    const pfad = join(WURZEL, datei);
    if (!existsSync(pfad)) {
      funde.push(`${datei} fehlt`);
      continue;
    }
    const ist = createHash('sha256').update(readFileSync(pfad)).digest('hex');
    if (ist === summe) funde.push(`${datei} ist noch der Starter-Platzhalter`);
  }

  for (const pfad of alleHtmlDateien(WURZEL)) {
    const inhalt = readFileSync(pfad, 'utf-8');
    for (const marke of TEXT_MARKEN) {
      if (marke.test(inhalt)) funde.push(`${relative(WURZEL, pfad)}: enthaelt ${marke.source.replace(/\\/g, '')}`);
    }
  }

  if (!funde.length) {
    console.log('Platzhalter: nichts mehr aus dem Starter gefunden.');
    return;
  }
  console.warn(`Platzhalter: ${funde.length} Fund(e)${STRENG ? '' : ' (Hinweis, vor dem Livegang beheben)'}`);
  for (const fund of funde) console.warn(`  - ${fund}`);
  if (STRENG) process.exitCode = 1;
}

main();
