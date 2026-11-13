// node --test tweakbar/test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  leseRootVariablen, ersetzeVariablen, pruefeVariable, schreibeBlock, leseBlock, zeilenende, teileFontFaces, gruppenKurz,
} from '../server/tokens.mjs';

const BEISPIEL = [
  '/* Kopf mit :root { --falle: 1; } im Kommentar */',
  '',
  ':root {',
  '  /* ─ Farben ─ */',
  '  --c-primary:       #1E3A5F; /* dunkle Markenfarbe */',
  '  --c-accent-text:   var(--c-accent); /* Kommentar; mit Semikolon */',
  '  --fs-h1:    clamp(2.25rem, 5vw + 1rem, 3.5rem);',
  '}',
  '',
  '/* Ende */',
  '',
].join('\r\n');

test('reads :root variables and ignores the decoy in the comment', () => {
  const vars = leseRootVariablen(BEISPIEL);
  assert.deepEqual(Object.keys(vars), ['--c-primary', '--c-accent-text', '--fs-h1']);
  assert.equal(vars['--c-primary'].wert, '#1E3A5F');
  assert.equal(vars['--fs-h1'].wert, 'clamp(2.25rem, 5vw + 1rem, 3.5rem)');
  assert.equal(vars['--falle'], undefined);
});

test('replacing values keeps comments, alignment and CRLF', () => {
  const neu = ersetzeVariablen(BEISPIEL, { '--c-primary': '#112233', '--fs-h1': 'clamp(2rem, 4vw + 1rem, 3rem)' });
  assert.ok(neu.includes('  --c-primary:       #112233; /* dunkle Markenfarbe */'));
  assert.ok(neu.includes('--fs-h1:    clamp(2rem, 4vw + 1rem, 3rem);'));
  assert.ok(neu.includes('/* Kopf mit :root { --falle: 1; } im Kommentar */'));
  assert.ok(neu.includes('/* Kommentar; mit Semikolon */'));
  assert.equal(zeilenende(neu), '\r\n');
  assert.equal(neu.replace(/\r\n/g, '').length, neu.split('\r\n').join('').length);
  assert.ok(!/[^\r]\n/.test(neu), 'no bare LF introduced');
  // Only the two values changed.
  assert.equal(neu.length - BEISPIEL.length, '#112233'.length - '#1E3A5F'.length + 'clamp(2rem, 4vw + 1rem, 3rem)'.length - 'clamp(2.25rem, 5vw + 1rem, 3.5rem)'.length);
});

test('allowlist rejects unknown variables and dangerous values', () => {
  const erlaubt = new Set(['--c-primary']);
  assert.equal(pruefeVariable('--c-primary', '#FFFFFF', erlaubt), null);
  assert.match(pruefeVariable('--c-fremd', '#FFFFFF', erlaubt), /nicht erlaubt/);
  assert.match(pruefeVariable('color', 'red', erlaubt), /Ungültiger Variablenname/);
  for (const boese of ['red; } body { display:none', '#fff}', '</style><script>', 'a{b', 'red\n--x: 1', '/* x */ red', 'url(https://evil.example/x.png)', '']) {
    assert.notEqual(pruefeVariable('--c-primary', boese, erlaubt), null, `must reject: ${JSON.stringify(boese)}`);
  }
  assert.throws(() => ersetzeVariablen(BEISPIEL, { '--neu': '1px' }), /nicht erlaubt/);
  assert.throws(() => ersetzeVariablen(BEISPIEL, { '--c-primary': 'red; }' }), /Unzulässige Zeichen/);
});

test('managed blocks are inserted, replaced and removed with the file line ending', () => {
  let text = schreibeBlock(BEISPIEL, 'regeln', ':root .btn { border-radius: 0; }', { meta: { a: 1 } });
  assert.ok(text.includes('}\r\n\r\n/* tweakbar:regeln:start {"a":1} */\r\n:root .btn { border-radius: 0; }\r\n/* tweakbar:regeln:end */'));
  assert.deepEqual(leseBlock(text, 'regeln').meta, { a: 1 });
  text = schreibeBlock(text, 'regeln', ':root .btn { border-radius: 9px; }\n:root a { color: red; }', { meta: { a: 2 } });
  assert.equal((text.match(/tweakbar:regeln:start/g) ?? []).length, 1);
  assert.ok(text.includes(':root .btn { border-radius: 9px; }\r\n:root a { color: red; }'));
  text = schreibeBlock(text, 'fonts', "@font-face {\n  font-family: 'X';\n}", { position: 'vorRoot' });
  assert.ok(text.indexOf('tweakbar:fonts:start') < text.indexOf(':root {\r\n'));
  assert.ok(!/[^\r]\n/.test(text), 'no bare LF introduced');
  // Variables still readable after blocks were added.
  assert.equal(leseRootVariablen(text)['--c-primary'].wert, '#1E3A5F');
  const ohne = schreibeBlock(text, 'regeln', '');
  assert.ok(!ohne.includes('tweakbar:regeln'));
});

test('font-face rules are grouped by family', () => {
  const css = "@font-face { font-family: 'A'; src: url('/a.woff2'); }\n@font-face { font-family: 'B'; }\n@font-face { font-family: 'A'; font-style: italic; }";
  const gruppen = teileFontFaces(css);
  assert.equal(gruppen.A.length, 2);
  assert.equal(gruppen.B.length, 1);
});

test('group slug matches the pitch bar', () => {
  assert.equal(gruppenKurz('Farbwelt'), 'farbwelt');
  assert.equal(gruppenKurz('Schrift Art'), 'schrift-art');
});

test('real starter tokens.css: every variable is found and a round trip is lossless', async () => {
  const echt = await readFile(new URL('../../src/config/tokens.css', import.meta.url), 'utf8');
  const vars = leseRootVariablen(echt);
  for (const name of ['--c-primary', '--c-accent-text', '--font-display', '--fw-display', '--fs-h1', '--section-py', '--radius-md', '--shadow-accent', '--duration-slow']) {
    assert.ok(name in vars, `${name} missing`);
  }
  const gleich = ersetzeVariablen(echt, Object.fromEntries(Object.entries(vars).map(([n, v]) => [n, v.wert])));
  assert.equal(gleich, echt);
});
