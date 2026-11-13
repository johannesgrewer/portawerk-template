// node --test tweakbar/test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { dominanteFarben, primaerAus, alphaVon, mische, lesbarGrenze } from '../lib/farbe.mjs';
import { pruefeText, teileVarianten, normalisiereText } from '../lib/text.mjs';
import { normalisiereReferenz, naechstesVerhaeltnis, dateiSlug, bildArt } from '../lib/ki.mjs';
import { KURATIERT } from '../lib/fontliste.mjs';
import { protokolliere, kostenUsd } from '../server/ki.mjs';

/** RGBA pixel array from [[r,g,b,a], count] pairs. */
function pixel(...gruppen) {
  const daten = [];
  for (const [farbe, anzahl] of gruppen) for (let i = 0; i < anzahl; i += 1) daten.push(...farbe);
  return new Uint8ClampedArray(daten);
}

test('dominant colors: shares, transparency skipped, deterministic', () => {
  const daten = pixel([[255, 255, 255, 255], 600], [[30, 80, 200, 255], 300], [[230, 90, 20, 255], 100], [[0, 0, 0, 0], 500]);
  const farben = dominanteFarben(daten);
  assert.deepEqual(farben.map((f) => f.hex), ['#FFFFFF', '#1E50C8', '#E65A14']);
  assert.equal(farben[0].anteil, 0.6);
  assert.deepEqual(dominanteFarben(daten), farben);
  assert.deepEqual(dominanteFarben(pixel([[0, 0, 0, 0], 10])), []);
  assert.deepEqual(dominanteFarben(null), []);
});

test('dominant colors: noise around one color merges into one entry', () => {
  const daten = pixel([[200, 40, 40, 255], 200], [[204, 44, 38, 255], 200], [[198, 38, 44, 255], 200]);
  const farben = dominanteFarben(daten);
  assert.equal(farben.length, 1);
  assert.equal(farben[0].anteil, 1);
});

test('primary pick: most saturated, accent needs another hue, grey logo falls back to dark', () => {
  const wahl = primaerAus([{ hex: '#FFFFFF', anteil: 0.6 }, { hex: '#1E50C8', anteil: 0.3 }, { hex: '#E65A14', anteil: 0.1 }]);
  assert.equal(wahl.primary, '#1E50C8');
  assert.equal(wahl.akzent, '#E65A14');
  const aehnlich = primaerAus([{ hex: '#1E50C8', anteil: 0.5 }, { hex: '#2A5ED6', anteil: 0.5 }]);
  assert.equal(aehnlich.akzent, null);
  assert.deepEqual(primaerAus([{ hex: '#FFFFFF', anteil: 0.7 }, { hex: '#222222', anteil: 0.3 }]), { primary: '#222222', akzent: null });
  assert.deepEqual(primaerAus([]), { primary: null, akzent: null });
  // Tiny specks (under 2 %) never become the primary.
  assert.equal(primaerAus([{ hex: '#333333', anteil: 0.99 }, { hex: '#FF0000', anteil: 0.01 }]).primary, '#333333');
});

test('alpha, blending and WCAG thresholds for the readability check', () => {
  assert.equal(alphaVon('rgba(0, 0, 0, 0.5)'), 0.5);
  assert.equal(alphaVon('rgb(0 0 0 / 25%)'), 0.25);
  assert.equal(alphaVon('rgb(10, 20, 30)'), 1);
  assert.equal(alphaVon('transparent'), 0);
  assert.equal(alphaVon('color(display-p3 1 0 0)'), null);
  assert.deepEqual(mische({ r: 0, g: 0, b: 0 }, 0.5, { r: 255, g: 255, b: 255 }), { r: 127.5, g: 127.5, b: 127.5 });
  assert.equal(lesbarGrenze(16, 400), 4.5);
  assert.equal(lesbarGrenze(24, 400), 3);
  assert.equal(lesbarGrenze(19, 700), 3);
  assert.equal(lesbarGrenze(19, '400'), 4.5);
});

test('text checks: length of headings, dashes, AI phrases', () => {
  assert.deepEqual(pruefeText('Fenster und Türen aus Trier').hinweise, []);
  const lang = pruefeText('a'.repeat(61), { ueberschrift: true });
  assert.equal(lang.zeichen, 61);
  assert.match(lang.hinweise[0].text, /61 Zeichen/);
  assert.equal(pruefeText('a'.repeat(61)).hinweise.length, 0); // body text has no length limit
  assert.match(pruefeText('Schnell – und sauber').hinweise[0].text, /Gedankenstrich/);
  const ki = pruefeText('Maßgeschneiderte Lösungen, nahtlose Abläufe. Entdecken Sie mehr!');
  assert.match(ki.hinweise[0].text, /nahtlos, maßgeschneidert, entdecken Sie/i);
  assert.match(pruefeText('Innovative Technik').hinweise[0].text, /innovativ/);
  // Word boundaries: "Reisebüro" is not "Reise".
  assert.equal(pruefeText('Ihr Reisebüro in Trier').hinweise.length, 0);
  assert.equal(pruefeText('Ihre Reise beginnt hier').hinweise.length, 1);
  assert.equal(normalisiereText('  zwei\n  Zeilen '), 'zwei Zeilen');
});

test('variant split: separator lines, numbering and quotes removed', () => {
  assert.deepEqual(teileVarianten('Eins\n###\n2. Zwei\n\n###\n"Drei"\n###\nVier'), ['Eins', 'Zwei', 'Drei']);
  assert.deepEqual(teileVarianten('Fassung 1: Alpha\n---\nFassung 2: Beta'), ['Alpha', 'Beta']);
  assert.deepEqual(teileVarianten('Nur eine Fassung'), ['Nur eine Fassung']);
  assert.deepEqual(teileVarianten('A\n###\nA'), ['A']);
  assert.deepEqual(teileVarianten(''), []);
});

test('reference normalization: clamps, enums, hex, font ids from the list only', () => {
  const ids = KURATIERT.map((f) => f.id);
  const roh = {
    farben: { primary: '#1e3a5f', accent: 'rot', bg: '#fff', text: 'rgb(20, 20, 20)' },
    button: { art: 'gefuellt', form: 'rund', radiusPx: 400, pfeil: 'ja', groesse: 3 },
    schrift: { displayKategorie: 'gothic', gewicht: 1234, laufweite: -1, naechsteAusListe: ['Lora', 'inter', 'lora', 'manrope', 'sora', 'syne'] },
    form: { radiusPx: -3, schatten: 9, linien: 2.6, dichte: 'viel' },
    boese: '<script>',
  };
  const n = normalisiereReferenz(roh, ids);
  assert.deepEqual(n.farben, { primary: '#1E3A5F', accent: null, bg: '#FFFFFF', text: '#141414' });
  assert.deepEqual(n.button, { art: 'gefuellt', form: 'standard', pfeil: false, groesse: 1.4, radiusPx: 48 });
  assert.deepEqual(n.schrift, { displayKategorie: 'sans-serif', gewicht: 900, laufweite: -0.08, naechsteAusListe: ['lora', 'manrope', 'sora'] });
  assert.deepEqual(n.form, { radiusPx: 0, schatten: 2, linien: 3, dichte: 1 });
  assert.equal('boese' in n, false);
  const leer = normalisiereReferenz(null, ids);
  assert.equal(leer.farben.primary, null);
  assert.equal(leer.form.dichte, 1);
});

test('aspect ratio, file slug and magic bytes', () => {
  assert.equal(naechstesVerhaeltnis(1600, 900), '16:9');
  assert.equal(naechstesVerhaeltnis(800, 800), '1:1');
  assert.equal(naechstesVerhaeltnis(375, 812), '9:16');
  assert.equal(naechstesVerhaeltnis(1200, 400), '21:9');
  assert.equal(naechstesVerhaeltnis(0, 10), '1:1');
  assert.equal(dateiSlug('Bäckerei Müller: Brötchen & Größe!'), 'baeckerei-mueller-broetchen-groesse');
  assert.equal(dateiSlug('../../etc/passwd'), 'etc-passwd');
  assert.equal(dateiSlug('***'), 'bild');
  assert.ok(dateiSlug('x'.repeat(100)).length <= 40);
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const webp = Uint8Array.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]);
  assert.equal(bildArt(png), 'image/png');
  assert.equal(bildArt(jpg), 'image/jpeg');
  assert.equal(bildArt(webp), 'image/webp');
  assert.equal(bildArt(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">')), null);
  assert.equal(bildArt(Uint8Array.from([0x89, 0x50])), null);
});

test('cost log: same columns as gemini_kosten.py, CRLF, never throws', async () => {
  const ordner = await mkdtemp(path.join(os.tmpdir(), 'tweakbar-kosten-'));
  const datei = path.join(ordner, 'gemini-kosten.csv');
  try {
    await protokolliere({ modell: 'gemini-2.5-flash-image', nutzung: { promptTokenCount: 20, candidatesTokenCount: 1290 }, werkzeug: 'tweakbar-ki-bild', projekt: 'portawerk-starter', datei });
    await protokolliere({ modell: 'gemini-2.5-flash', nutzung: null, werkzeug: 'tweakbar-referenz', projekt: 'a,b', datei });
    const zeilen = (await readFile(datei, 'utf8')).split('\r\n');
    assert.equal(zeilen[0], 'zeit,projekt,werkzeug,modell,eingabe_tokens,ausgabe_tokens,usd');
    assert.match(zeilen[1], /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d,portawerk-starter,tweakbar-ki-bild,gemini-2\.5-flash-image,20,1290,0\.03871$/);
    assert.match(zeilen[2], /,"a,b",tweakbar-referenz,gemini-2\.5-flash,0,0,0\.00000$/);
    assert.equal(zeilen[3], '');
    await protokolliere({ modell: 'x', nutzung: {}, werkzeug: 'w', projekt: 'p', datei: path.join(datei, 'geht-nicht', 'x.csv') });
  } finally {
    await rm(ordner, { recursive: true, force: true });
  }
  assert.equal(kostenUsd('unbekannt', 100, 100), 0);
});
