// node --test tweakbar/test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kontrast, ampel, parseFarbe, paletteAus, zufallsPalette, zuHex } from '../lib/farbe.mjs';
import { normalisiere, regelnCss, istStandard, STANDARD } from '../lib/regeln.mjs';
import { istLokal } from '../server/handler.mjs';

test('WCAG contrast: known reference values', () => {
  assert.equal(kontrast('#000000', '#FFFFFF'), 21);
  assert.equal(kontrast('#FFFFFF', '#FFFFFF'), 1);
  assert.equal(kontrast('#777777', '#FFFFFF'), 4.48); // the classic "just below AA" grey
  assert.equal(kontrast('#FFFFFF', '#C2410C'), kontrast('#C2410C', '#FFFFFF')); // order does not matter
  assert.ok(kontrast('#FFF', 'rgb(194, 65, 12)') > 5);
  assert.equal(kontrast('quatsch', '#FFF'), null);
});

test('traffic light thresholds', () => {
  assert.equal(ampel(7.2), 'gut');
  assert.equal(ampel(4.5), 'ok');
  assert.equal(ampel(4.49), 'schlecht');
  assert.equal(ampel(null), 'unbekannt');
});

test('color parsing', () => {
  assert.deepEqual(parseFarbe('#abc'), { r: 170, g: 187, b: 204 });
  assert.deepEqual(parseFarbe('rgba(1, 2, 3, 0.5)'), { r: 1, g: 2, b: 3 });
  assert.equal(zuHex({ r: 255, g: 0, b: 16 }), '#FF0010');
});

test('derived palette passes the main contrast checks', () => {
  for (const basis of ['#1E3A5F', '#2F5136', '#7C2D12', '#4C1D95']) {
    const p = paletteAus(basis);
    assert.ok(kontrast(p['--c-text'], p['--c-bg']) >= 7, `text on bg for ${basis}`);
    assert.ok(kontrast(p['--c-text-muted'], p['--c-bg']) >= 4.5, `muted on bg for ${basis}`);
    assert.ok(kontrast('#FFFFFF', p['--c-accent']) >= 4.5, `white on accent for ${basis}`);
  }
  const behalten = paletteAus('#1E3A5F', { akzent: '#C2410C' });
  assert.equal(behalten['--c-accent'], '#C2410C');
  let saat = 0.42;
  const zufall = () => { saat = (saat * 9301 + 49297) % 233280 / 233280; return saat; };
  for (let i = 0; i < 20; i += 1) {
    const p = zufallsPalette(zufall);
    assert.ok(kontrast('#FFFFFF', p['--c-accent']) >= 4.5);
  }
});

test('rule options are normalized and only differences produce CSS', () => {
  assert.equal(regelnCss(STANDARD), '');
  assert.ok(istStandard({}));
  const o = normalisiere({ buttons: { art: 'evil', form: 'pille', groesse: 99 }, kopf: { logoHoehe: '56' }, extra: { x: 1 } });
  assert.equal(o.buttons.art, 'gefuellt');
  assert.equal(o.buttons.groesse, 1.4);
  assert.equal(o.kopf.logoHoehe, 56);
  assert.equal(o.extra, undefined);
  const css = regelnCss(o);
  assert.match(css, /border-radius: var\(--radius-full\)/);
  assert.match(css, /\.pw-logo img \{ height: 56px; \}/);
  assert.ok(!/[<>]/.test(css));
  const pfeil = regelnCss({ buttons: { pfeil: true } }, { pfeilKnoten: [['path', { d: 'M5 12h14' }]] });
  assert.match(pfeil, /mask: url\("data:image\/svg\+xml,/);
});

test('only local requests are accepted', () => {
  const anfrage = (adresse, host, origin) => ({ socket: { remoteAddress: adresse }, headers: { host, ...(origin ? { origin } : {}) } });
  assert.equal(istLokal(anfrage('127.0.0.1', 'localhost:4321')), true);
  assert.equal(istLokal(anfrage('::1', 'localhost:4321', 'http://localhost:4321')), true);
  assert.equal(istLokal(anfrage('192.168.1.20', 'localhost:4321')), false);
  assert.equal(istLokal(anfrage('127.0.0.1', 'evil.example')), false); // DNS rebinding
  assert.equal(istLokal(anfrage('127.0.0.1', 'localhost:4321', 'https://evil.example')), false);
});
