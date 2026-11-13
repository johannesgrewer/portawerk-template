// Structured options -> CSS rules. Shared by the panel (live preview) and the
// dev server (writes the same CSS into tokens.css). The server never accepts
// CSS text from the browser, only these options, validated below.
//
// Specificity: tokens.css is loaded BEFORE globals.css and component styles
// are scoped (data-astro-cid). Every selector therefore starts with ":root"
// (and "body" where component styles compete), so it wins without !important.

export const STANDARD = Object.freeze({
  buttons: { art: 'gefuellt', form: 'standard', pfeil: false, groesse: 1, hover: 'heben' },
  kopf: { transparent: false, logoHoehe: 40 },
  linien: { staerke: 1 },
  schrift: { laufweite: -0.02 },
});

const AUSWAHL = {
  art: ['gefuellt', 'kontur', 'unterstrichen'],
  form: ['standard', 'pille', 'eckig'],
  hover: ['heben', 'leuchten', 'heller', 'keiner'],
};

function zahl(wert, min, max, standard) {
  const n = Number(wert);
  if (!Number.isFinite(n)) return standard;
  return Math.min(max, Math.max(min, Math.round(n * 1000) / 1000));
}

function aus(liste, wert, standard) {
  return liste.includes(wert) ? wert : standard;
}

/** Normalize untrusted options. Unknown keys are dropped, numbers clamped. */
export function normalisiere(roh) {
  const eingabe = roh && typeof roh === 'object' ? roh : {};
  const b = eingabe.buttons ?? {};
  const k = eingabe.kopf ?? {};
  const l = eingabe.linien ?? {};
  const s = eingabe.schrift ?? {};
  const S = STANDARD;
  return {
    buttons: {
      art: aus(AUSWAHL.art, b.art, S.buttons.art),
      form: aus(AUSWAHL.form, b.form, S.buttons.form),
      pfeil: b.pfeil === true,
      groesse: zahl(b.groesse, 0.8, 1.4, S.buttons.groesse),
      hover: aus(AUSWAHL.hover, b.hover, S.buttons.hover),
    },
    kopf: {
      transparent: k.transparent === true,
      logoHoehe: zahl(k.logoHoehe, 20, 120, S.kopf.logoHoehe),
    },
    linien: { staerke: zahl(l.staerke, 0, 4, S.linien.staerke) },
    schrift: { laufweite: zahl(s.laufweite, -0.08, 0.15, S.schrift.laufweite) },
  };
}

/** Lucide icon node (["path", {d}]...) -> SVG markup with a given stroke color. */
export function lucideSvg(knoten, farbe = 'black') {
  if (!Array.isArray(knoten)) return '';
  const kinder = knoten
    .map(([tag, attribute]) => {
      const attr = Object.entries(attribute ?? {})
        .filter(([name]) => /^[a-z-]+$/i.test(name) && name !== 'key')
        .map(([name, wert]) => `${name}="${String(wert).replace(/["<>&]/g, '')}"`)
        .join(' ');
      return /^[a-z]+$/i.test(tag) ? `<${tag} ${attr}/>` : '';
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${farbe}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${kinder}</svg>`;
}

function datenUri(svg) {
  return `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}")`;
}

/** True when nothing differs from the starter defaults. */
export function istStandard(optionen) {
  return JSON.stringify(normalisiere(optionen)) === JSON.stringify(normalisiere(STANDARD));
}

/**
 * Generate CSS for the options. Only differences to the defaults produce rules.
 * @param {object} roh options
 * @param {{ pfeilKnoten?: Array }} hilfen Lucide node of "arrow-right" for the arrow style
 */
export function regelnCss(roh, { pfeilKnoten } = {}) {
  const o = normalisiere(roh);
  const S = STANDARD;
  const teile = [];
  const b = o.buttons;

  if (b.groesse !== S.buttons.groesse) {
    teile.push(`:root .btn { padding: calc(0.875rem * ${b.groesse}) calc(1.75rem * ${b.groesse}); font-size: calc(1rem * ${b.groesse}); }`);
  }
  if (b.form === 'pille') teile.push(':root .btn { border-radius: var(--radius-full); }');
  if (b.form === 'eckig') teile.push(':root .btn { border-radius: 0; }');

  if (b.art === 'kontur') {
    teile.push(':root .btn-primary { background-color: transparent; color: var(--c-accent-text); box-shadow: inset 0 0 0 2px var(--c-accent); }');
    teile.push(':root .btn-primary:hover { background-color: var(--c-accent); color: var(--c-white); }');
  }
  if (b.art === 'unterstrichen') {
    teile.push(':root .btn-primary, :root .btn-secondary { background-color: transparent; color: var(--c-text); border: 0; border-bottom: 2px solid var(--c-accent); border-radius: 0; box-shadow: none; padding-left: 0; padding-right: 0; }');
    teile.push(':root .btn-primary:hover, :root .btn-secondary:hover { background-color: transparent; color: var(--c-accent-text); border-bottom-color: currentColor; box-shadow: none; }');
  }
  if (b.pfeil && pfeilKnoten) {
    const maske = datenUri(lucideSvg(pfeilKnoten));
    teile.push(`:root .btn-primary::after { content: ""; width: 1.1em; height: 1.1em; flex: none; background-color: currentColor; -webkit-mask: ${maske} center / contain no-repeat; mask: ${maske} center / contain no-repeat; transition: transform var(--duration-normal) var(--ease-out); }`);
    teile.push(':root .btn-primary:hover::after { transform: translateX(4px); }');
  }
  if (b.hover === 'leuchten') {
    teile.push(':root .btn-primary:hover, :root .btn-secondary:hover { transform: none; box-shadow: 0 0 0 4px color-mix(in srgb, var(--c-accent) 25%, transparent), var(--shadow-accent); }');
  }
  if (b.hover === 'heller') {
    teile.push(':root .btn-primary:hover, :root .btn-secondary:hover { transform: none; filter: brightness(1.12); }');
  }
  if (b.hover === 'keiner') {
    teile.push(':root .btn-primary:hover, :root .btn-secondary:hover { transform: none; box-shadow: none; }');
  }

  if (o.kopf.transparent) {
    teile.push(':root body .pw-header { background: transparent; border-bottom-color: transparent; }');
  }
  if (o.kopf.logoHoehe !== S.kopf.logoHoehe) {
    teile.push(`:root body .pw-header .pw-logo img { height: ${o.kopf.logoHoehe}px; }`);
    teile.push(`:root body .pw-logo { font-size: ${Math.round((o.kopf.logoHoehe / 40) * 125) / 100}rem; }`);
  }

  if (o.linien.staerke !== S.linien.staerke) {
    const px = o.linien.staerke;
    teile.push(`:root body .pw-header { border-bottom-width: ${px}px; }`);
    teile.push(`:root .badge { border-width: ${px}px; }`);
    teile.push(`:root .btn-secondary { border-width: ${Math.max(px, 1) * 2}px; }`);
    teile.push(`:root input, :root textarea, :root select { border-width: ${px}px; }`);
  }

  if (o.schrift.laufweite !== S.schrift.laufweite) {
    teile.push(`:root h1, :root h2, :root h3, :root h4, :root h5, :root h6 { letter-spacing: ${o.schrift.laufweite}em; }`);
  }

  return teile.join('\n');
}
