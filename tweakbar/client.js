// Tweakbar client. Injected by integration.mjs into every page, in `astro dev` only.
// Two modes:
// - top window: renders the panel (shadow DOM) and applies changes live
// - device frame (iframe with ?tweakbar-rahmen): no panel, the parent pushes
//   its state in through window.__pwTweakbarRahmen.anwenden(state)

import panelCss from './panel.css?raw';
import {
  kontrast, ampel, paletteAus, zufallsPalette, parseFarbe, zuHex, dominanteFarben, primaerAus, alphaVon, mische, lesbarGrenze,
} from './lib/farbe.mjs';
import { pruefeText, normalisiereText } from './lib/text.mjs';
import { regelnCss, normalisiere, STANDARD } from './lib/regeln.mjs';
import { KURATIERT, VERBOTEN } from './lib/fontliste.mjs';

(() => {
  if (window.__pwTweakbarGeladen) return; // HMR re-runs must not create a second panel
  window.__pwTweakbarGeladen = true;

  const API = '/__tweakbar/';
  const CDN = 'https://cdn.jsdelivr.net/fontsource/fonts';
  const IST_RAHMEN = new URLSearchParams(location.search).has('tweakbar-rahmen');
  const SPEICHER = `pw-tweakbar:${location.host}`;
  const GRUEN = '#34D399';

  // Curated font list and ban list: lib/fontliste.mjs (shared with the server).

  // ───────────────────────── helpers ─────────────────────────

  async function holeJson(pfad, optionen) {
    let antwort;
    try {
      antwort = await fetch(API + pfad, optionen);
    } catch (fehler) {
      throw new Error(`Dev-Server nicht erreichbar (${fehler instanceof Error ? fehler.message : fehler})`);
    }
    let inhalt = null;
    try { inhalt = await antwort.json(); } catch { inhalt = null; }
    if (!antwort.ok || !inhalt?.ok) throw new Error(inhalt?.fehler ?? `Fehler ${antwort.status}`);
    return inhalt;
  }

  function lies(schluessel, ersatz) {
    try {
      const roh = localStorage.getItem(`${SPEICHER}:${schluessel}`);
      return roh ? JSON.parse(roh) : ersatz;
    } catch { return ersatz; }
  }
  function schreib(schluessel, wert) {
    try { localStorage.setItem(`${SPEICHER}:${schluessel}`, JSON.stringify(wert)); } catch { /* storage blocked */ }
  }

  const klon = (wert) => JSON.parse(JSON.stringify(wert));
  const runde = (n, stellen = 3) => Math.round(n * 10 ** stellen) / 10 ** stellen;

  /** Multiply every length (rem/px/vw/em) in a CSS value. */
  function skaliere(wert, faktor) {
    return String(wert).replace(/(-?\d*\.?\d+)(rem|px|vw|em|svh|vh)/g, (_, zahl, einheit) => `${runde(parseFloat(zahl) * faktor)}${einheit}`);
  }
  /** Multiply the alpha channel of every rgba() in a CSS value. */
  function skaliereAlpha(wert, faktor) {
    return String(wert).replace(/rgba\(([^)]*?),\s*([\d.]+)\)/g, (_, rgb, a) => `rgba(${rgb}, ${runde(Math.min(1, parseFloat(a) * faktor))})`);
  }
  /** Fluid clamp() between 375 px and 1280 px viewport. */
  function fluid(minPx, maxPx) {
    const steigung = (maxPx - minPx) / (1280 - 375);
    const basisRem = (minPx - steigung * 375) / 16;
    return `clamp(${runde(minPx / 16)}rem, ${runde(steigung * 100)}vw + ${runde(basisRem)}rem, ${runde(maxPx / 16)}rem)`;
  }

  function leererZustand(regeln) {
    return {
      vars: {},
      regeln: normalisiere(regeln ?? STANDARD),
      fonts: { display: null, body: null },
      bilder: {},
      texte: {},
      sektionen: { reihenfolge: null, versteckt: [], hintergrund: {}, ausrichtung: {} },
      hero: { abdunkeln: 0 },
      regler: {},
      ansicht: { geraet: 'desktop', raster: false, abstaende: false, ohneAnimation: false, pruefen: '', lesbarkeit: false },
    };
  }

  // ───────────────────────── apply (both modes) ─────────────────────────

  let icons = {};
  let gesetzteVars = new Set();
  const geladeneFonts = new Set();

  // Text elements the text mode can edit. Spans only with their own text.
  const TEXT_AUSWAHL = 'h1, h2, h3, h4, h5, h6, p, li, a, button, figcaption, blockquote, span, label, dt, dd, summary';
  let textZaehler = 0;
  const hatEigenenText = (knoten) => Array.from(knoten.childNodes).some((k) => k.nodeType === 3 && k.nodeValue.trim());

  function markiereSeite() {
    const main = document.querySelector('main') ?? document.body;
    Array.from(main.children).forEach((kind, i) => {
      if (!kind.dataset.pwTbSektion) {
        kind.dataset.pwTbSektion = kind.id || `sektion-${i + 1}`;
        kind.dataset.pwTbOrdnung = String(i); // original order, used to undo a reorder
      }
    });
    document.querySelectorAll('img').forEach((bild, i) => {
      if (!bild.dataset.pwTbBild) {
        bild.dataset.pwTbBild = `bild-${i + 1}`;
        bild.dataset.pwTbSrc = bild.getAttribute('src') ?? '';
      }
    });
    // Keys in document order on the first run, so they match after a reload.
    document.body.querySelectorAll(TEXT_AUSWAHL).forEach((knoten) => {
      if (knoten.dataset.pwTbText) return;
      if (knoten.tagName === 'SPAN' ? !hatEigenenText(knoten) : !knoten.textContent.trim()) return;
      textZaehler += 1;
      knoten.dataset.pwTbText = `text-${textZaehler}`;
    });
  }

  // Text changes: preview only, the source change goes to the change list.
  const textOriginale = new Map(); // key -> innerHTML before the first change
  let aktivesTextfeld = null; // element being typed in, never overwritten by anwenden()
  function setzeTextInhalt(knoten, text) {
    // Keep icons and inline markup when the element has exactly one text node.
    const laeufer = document.createTreeWalker(knoten, NodeFilter.SHOW_TEXT);
    const knotenListe = [];
    while (laeufer.nextNode()) if (laeufer.currentNode.nodeValue.trim()) knotenListe.push(laeufer.currentNode);
    if (knotenListe.length === 1) knotenListe[0].nodeValue = text;
    else knoten.textContent = text;
  }
  function texteAnwenden(texte) {
    if (!Object.keys(texte).length && !textOriginale.size) return;
    document.querySelectorAll('[data-pw-tb-text]').forEach((knoten) => {
      if (knoten === aktivesTextfeld) return;
      const schluessel = knoten.dataset.pwTbText;
      const eintrag = texte[schluessel];
      if (eintrag) {
        if (!textOriginale.has(schluessel)) textOriginale.set(schluessel, knoten.innerHTML);
        if (normalisiereText(knoten.textContent) !== eintrag.neu) setzeTextInhalt(knoten, eintrag.neu);
      } else if (textOriginale.has(schluessel) && knoten.innerHTML !== textOriginale.get(schluessel)) {
        knoten.innerHTML = textOriginale.get(schluessel);
      }
    });
  }

  // View checks: filters on every top-level page element except the panel
  // host and the SVG with the color matrices (the panel itself never changes).
  const PRUEF_FILTER = {
    grau: 'grayscale(1)', protan: 'url(#pw-tb-protan)', deutan: 'url(#pw-tb-deutan)', tritan: 'url(#pw-tb-tritan)', unschaerfe: 'blur(4px)',
  };
  const FARB_MATRIZEN = {
    protan: '0.567 0.433 0 0 0 0.558 0.442 0 0 0 0 0.242 0.758 0 0 0 0 0 1 0',
    deutan: '0.625 0.375 0 0 0 0.7 0.3 0 0 0 0 0.3 0.7 0 0 0 0 0 1 0',
    tritan: '0.95 0.05 0 0 0 0 0.433 0.567 0 0 0 0.475 0.525 0 0 0 0 0 1 0',
  };
  function sichereFilterSvg() {
    if (document.getElementById('pw-tb-filter')) return;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.id = 'pw-tb-filter';
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    for (const [name, werte] of Object.entries(FARB_MATRIZEN)) {
      const filter = document.createElementNS(ns, 'filter');
      filter.id = `pw-tb-${name}`;
      filter.setAttribute('color-interpolation-filters', 'linearRGB');
      const matrix = document.createElementNS(ns, 'feColorMatrix');
      matrix.setAttribute('type', 'matrix');
      matrix.setAttribute('values', werte);
      filter.appendChild(matrix);
      svg.appendChild(filter);
    }
    document.body.appendChild(svg);
  }

  async function ladeVorschauFont(font) {
    if (!font?.id || geladeneFonts.has(font.id)) return;
    geladeneFonts.add(font.id);
    try {
      const { font: info } = await holeJson(`font?id=${encodeURIComponent(font.id)}`);
      const faces = [];
      if (info.variable) {
        const min = Math.min(...info.weights), max = Math.max(...info.weights);
        faces.push(new FontFace(info.family, `url(${CDN}/${info.id}:vf@latest/latin-wght-normal.woff2)`, { weight: `${min} ${max}` }));
      } else {
        for (const w of info.weights) faces.push(new FontFace(info.family, `url(${CDN}/${info.id}@latest/latin-${w}-normal.woff2)`, { weight: String(w) }));
      }
      await Promise.all(faces.map(async (face) => {
        try { document.fonts.add(await face.load()); } catch { /* single weight missing */ }
      }));
    } catch (fehler) {
      geladeneFonts.delete(font.id);
      console.warn('[Tweakbar] Schrift nicht ladbar:', fehler);
    }
  }

  // Light preview for list entries: only the regular weight, no metadata call.
  const listenFonts = new Set();
  function ladeListenFont(f) {
    if (listenFonts.has(f.id)) return;
    listenFonts.add(f.id);
    new FontFace(f.family, `url(${CDN}/${f.id}@latest/latin-400-normal.woff2)`, { weight: '400' })
      .load().then((face) => document.fonts.add(face)).catch(() => { /* no 400 cut, list shows fallback */ });
  }

  function stilElement(id) {
    let stil = document.getElementById(id);
    if (!stil) {
      stil = document.createElement('style');
      stil.id = id;
      document.head.appendChild(stil);
    }
    return stil;
  }

  function sektionElement(schluessel) {
    return document.querySelector(`[data-pw-tb-sektion="${CSS.escape(schluessel)}"]`);
  }
  function bildElement(schluessel) {
    return document.querySelector(`[data-pw-tb-bild="${CSS.escape(schluessel)}"]`);
  }
  function heroElement() {
    return document.querySelector('#hero') ?? (document.querySelector('main') ?? document.body).firstElementChild;
  }

  function duotonFilter(hex) {
    const rgb = parseFarbe(hex);
    if (!rgb) return 'grayscale(1)';
    const max = Math.max(rgb.r, rgb.g, rgb.b), min = Math.min(rgb.r, rgb.g, rgb.b);
    let h = 0;
    if (max !== min) {
      const d = max - min;
      if (max === rgb.r) h = ((rgb.g - rgb.b) / d) % 6;
      else if (max === rgb.g) h = (rgb.b - rgb.r) / d + 2;
      else h = (rgb.r - rgb.g) / d + 4;
      h = Math.round(h * 60 + 360) % 360;
    }
    // sepia() lands near 38 degrees; rotate from there to the brand hue.
    return `grayscale(1) sepia(1) hue-rotate(${h - 38}deg) saturate(2.2) contrast(1.05)`;
  }

  function anwenden(zustand) {
    markiereSeite();
    const wurzel = document.documentElement;
    // Variables
    const neu = new Set(Object.keys(zustand.vars));
    for (const name of gesetzteVars) if (!neu.has(name)) wurzel.style.removeProperty(name);
    for (const [name, wert] of Object.entries(zustand.vars)) wurzel.style.setProperty(name, wert);
    gesetzteVars = neu;

    // Fonts
    ladeVorschauFont(zustand.fonts.display);
    ladeVorschauFont(zustand.fonts.body);

    // Rules
    const css = [regelnCss(zustand.regeln, { pfeilKnoten: icons['arrow-right'] })];
    if (zustand.ansicht.ohneAnimation) {
      css.push('*, *::before, *::after { animation: none !important; transition: none !important; } .js .animate-on-scroll { opacity: 1 !important; transform: none !important; }');
    }
    if (zustand.ansicht.abstaende) {
      css.push(`.section { box-shadow: inset 0 var(--section-py) 0 0 rgba(52,211,153,.14), inset 0 calc(-1 * var(--section-py)) 0 0 rgba(52,211,153,.14); outline: 1px dashed ${GRUEN}; outline-offset: -1px; } .container { outline: 1px dashed rgba(4,120,87,.5); outline-offset: -1px; }`);
    }
    const pruefen = PRUEF_FILTER[zustand.ansicht.pruefen];
    if (pruefen) {
      if (pruefen.startsWith('url(')) sichereFilterSvg();
      css.push(`body > *:not(#pw-tweakbar):not(#pw-tb-filter):not(astro-dev-toolbar) { filter: ${pruefen} !important; }`);
    }
    if (zustand.ansicht.lesbarkeit) css.push('[data-pw-tb-lesbar] { outline: 2px dashed #DC2626 !important; outline-offset: 2px; }');
    if (document.documentElement.classList.contains('pw-tb-textmodus')) {
      css.push(`[data-pw-tb-text]:hover { outline: 1px dashed ${GRUEN}; outline-offset: 2px; cursor: text; } [data-pw-tb-text][contenteditable] { outline: 2px solid ${GRUEN} !important; outline-offset: 2px; cursor: text; } [data-pw-tb-text-auswahl]:not([contenteditable]) { outline: 2px solid ${GRUEN}; outline-offset: 2px; }`);
    }
    if (document.documentElement.classList.contains('pw-tb-bildmodus')) {
      css.push(`img { cursor: crosshair !important; outline: 1px dashed ${GRUEN}; outline-offset: -1px; } [data-pw-tb-auswahl] { outline: 3px solid ${GRUEN} !important; outline-offset: -3px; }`);
    }
    stilElement('pw-tweakbar-regeln').textContent = css.join('\n');

    // Sections (preview only, the source change goes to the change list)
    const main = document.querySelector('main') ?? document.body;
    const reihenfolge = zustand.sektionen.reihenfolge
      ?? Array.from(main.querySelectorAll(':scope > [data-pw-tb-sektion]'))
        .sort((a, b) => Number(a.dataset.pwTbOrdnung) - Number(b.dataset.pwTbOrdnung))
        .map((e) => e.dataset.pwTbSektion);
    const istStand = Array.from(main.querySelectorAll(':scope > [data-pw-tb-sektion]')).map((e) => e.dataset.pwTbSektion);
    if (reihenfolge.join() !== istStand.join()) {
      for (const schluessel of reihenfolge) {
        const el = sektionElement(schluessel);
        if (el && el.parentElement === main) main.appendChild(el);
      }
    }
    main.querySelectorAll(':scope > [data-pw-tb-sektion]').forEach((el) => {
      const s = el.dataset.pwTbSektion;
      el.style.display = zustand.sektionen.versteckt.includes(s) ? 'none' : '';
      const hg = zustand.sektionen.hintergrund[s];
      el.style.backgroundColor = hg ? `var(--c-${hg})` : '';
      el.style.color = hg === 'primary' ? 'var(--c-white)' : '';
      const ausrichtung = zustand.sektionen.ausrichtung[s];
      el.style.textAlign = ausrichtung === 'mitte' ? 'center' : '';
    });

    texteAnwenden(zustand.texte ?? {});

    // Images
    document.querySelectorAll('[data-pw-tb-bild]').forEach((bild) => {
      const eintrag = zustand.bilder[bild.dataset.pwTbBild];
      if (eintrag?.src && bild.getAttribute('src') !== eintrag.src) {
        bild.removeAttribute('srcset');
        bild.setAttribute('src', eintrag.src);
      } else if (!eintrag?.src && bild.dataset.pwTbSrc && bild.getAttribute('src') !== bild.dataset.pwTbSrc) {
        bild.setAttribute('src', bild.dataset.pwTbSrc);
      }
      bild.style.objectPosition = eintrag?.position ?? '';
      const filter = eintrag?.filter === 'grau' ? 'grayscale(1)' : eintrag?.filter === 'duoton' ? duotonFilter(effektiv('--c-primary', zustand)) : '';
      bild.style.filter = filter;
    });
    const hero = heroElement();
    if (hero) {
      hero.querySelectorAll('img, video, picture').forEach((medium) => {
        if (medium.tagName === 'PICTURE') return;
        const vorhanden = zustand.bilder[medium.dataset.pwTbBild]?.filter;
        const hell = zustand.hero.abdunkeln ? `brightness(${runde(1 - zustand.hero.abdunkeln, 2)})` : '';
        if (!vorhanden) medium.style.filter = hell;
        else if (hell) medium.style.filter = `${medium.style.filter} ${hell}`;
      });
    }
  }

  let basis = {};
  function effektiv(name, zustand) {
    return zustand?.vars?.[name] ?? basis[name] ?? '';
  }

  async function ladeIcons() {
    try { icons = (await holeJson('icons')).icons ?? {}; } catch { icons = {}; }
  }

  // ───────────────────────── frame mode ─────────────────────────

  if (IST_RAHMEN) {
    window.__pwTweakbarRahmen = {
      anwenden: (zustand) => {
        try { anwenden(zustand); } catch (fehler) { console.warn('[Tweakbar] Rahmen:', fehler); }
      },
    };
    ladeIcons();
    return;
  }

  // ───────────────────────── panel ─────────────────────────

  let zustand = leererZustand();
  let verlauf = [];
  let zukunft = [];
  let schnappschuesse = lies('schnappschuesse', { A: null, B: null, aktiv: null });
  let bilderListe = null;
  let ausgewaehltesBild = null;
  let fokusModus = false;
  let meldung = null;
  let ui = lies('ui', { offen: true, eingeklappt: false, reiter: 'farben', x: null, y: null });

  const host = document.createElement('div');
  host.id = 'pw-tweakbar';
  host.setAttribute('data-pw-tweakbar', '');
  const schatten = host.attachShadow({ mode: 'open' });
  const stil = document.createElement('style');
  stil.textContent = panelCss;
  schatten.appendChild(stil);
  const wurzelEl = document.createElement('div');
  wurzelEl.className = 'wurzel';
  schatten.appendChild(wurzelEl);

  function icon(name) {
    const knoten = icons[name];
    if (!knoten) return document.createTextNode('');
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    for (const [tag, attribute] of knoten) {
      const kind = document.createElementNS(ns, tag);
      for (const [a, w] of Object.entries(attribute)) if (a !== 'key') kind.setAttribute(a, w);
      svg.appendChild(kind);
    }
    return svg;
  }

  /** Tiny element builder: el('div', { class: 'x', onclick: fn }, child, ...) */
  function el(tag, attribute = {}, ...kinder) {
    const knoten = document.createElement(tag);
    for (const [name, wert] of Object.entries(attribute ?? {})) {
      if (wert == null || wert === false) continue;
      if (name.startsWith('on')) knoten.addEventListener(name.slice(2), wert);
      else if (name === 'class') knoten.className = wert;
      else if (name === 'value') knoten.value = wert;
      else if (name in knoten && typeof wert !== 'string') knoten[name] = wert;
      else knoten.setAttribute(name, wert === true ? '' : wert);
    }
    for (const kind of kinder.flat()) {
      if (kind == null || kind === false) continue;
      knoten.appendChild(typeof kind === 'string' ? document.createTextNode(kind) : kind);
    }
    return knoten;
  }

  // ── state changes, history, persistence ──

  function speichereLokal() {
    schreib('zustand', zustand);
    schreib('schnappschuesse', schnappschuesse);
  }

  let rahmenFenster = null;
  function anwendenUeberall() {
    try { anwenden(zustand); } catch (fehler) { console.warn('[Tweakbar]', fehler); }
    try { rahmenFenster?.__pwTweakbarRahmen?.anwenden(klon(zustand)); } catch { /* frame not ready */ }
    if (zustand.ansicht.lesbarkeit || lesbarAnzahl != null) planeLesbarkeit();
    aktualisiereKopf();
  }

  function merkeVerlauf() {
    const jetzt = JSON.stringify(zustand);
    if (verlauf[verlauf.length - 1] !== jetzt) {
      verlauf.push(jetzt);
      if (verlauf.length > 150) verlauf.shift();
      zukunft = [];
    }
    speichereLokal();
    aktualisiereKopf();
  }

  /** Change the state. verlauf=false while a slider is dragged (history on "change"). */
  function aendere(funktion, { verlaufEintrag = true, neuZeichnen = false } = {}) {
    funktion(zustand);
    anwendenUeberall();
    if (verlaufEintrag) merkeVerlauf();
    if (neuZeichnen) zeichneReiter();
  }

  function rueckgaengig() {
    if (verlauf.length < 2) return;
    zukunft.push(verlauf.pop());
    zustand = JSON.parse(verlauf[verlauf.length - 1]);
    anwendenUeberall(); speichereLokal(); zeichneReiter();
  }
  function wiederholen() {
    if (!zukunft.length) return;
    const naechster = zukunft.pop();
    verlauf.push(naechster);
    zustand = JSON.parse(naechster);
    anwendenUeberall(); speichereLokal(); zeichneReiter();
  }

  function setzeVar(name, wert, optionen) {
    aendere((z) => {
      if (wert == null || wert === basis[name]) delete z.vars[name];
      else z.vars[name] = wert;
    }, optionen);
  }

  // ── shared setters (used by the sliders and by the dice) ──

  function paletteIn(z, palette) {
    for (const [n, w] of Object.entries(palette ?? {})) {
      if (!(n in basis)) continue;
      if (w === basis[n]) delete z.vars[n]; else z.vars[n] = w;
    }
  }
  function fontIn(z, rolle, f) {
    const variable = rolle === 'display' ? '--font-display' : '--font-body';
    z.fonts[rolle] = { id: f.id, family: f.family, category: f.category };
    z.vars[variable] = `'${f.family}', ${f.category === 'serif' ? 'Georgia, serif' : 'system-ui, -apple-system, sans-serif'}`;
  }
  function skalaIn(z, r) {
    z.regler.skala = r;
    const rMobil = 1 + (r - 1) * 0.75;
    const stufen = { '--fs-h1': 5, '--fs-h2': 4, '--fs-h3': 3, '--fs-h4': 2 };
    for (const [n, k] of Object.entries(stufen)) if (n in basis) z.vars[n] = fluid(Math.round(16 * rMobil ** k), Math.round(18 * r ** k));
  }
  function dichteIn(z, w) {
    z.regler.dichte = w;
    for (const n of Object.keys(basis).filter((x) => x === '--section-py' || /^--space-/.test(x))) {
      if (w === 1) delete z.vars[n]; else z.vars[n] = skaliere(basis[n], w);
    }
  }
  function radiusIn(z, w) {
    z.regler.radius = w;
    const werte = { '--radius-sm': w / 2, '--radius-md': w, '--radius-lg': w * 2, '--radius-xl': w * 3 };
    for (const [n, v] of Object.entries(werte)) if (n in basis) z.vars[n] = `${runde(v, 1)}px`;
  }
  function schattenIn(z, w) {
    z.regler.schatten = w;
    for (const n of Object.keys(basis).filter((x) => /^--shadow-/.test(x))) {
      if (w === 1) delete z.vars[n]; else z.vars[n] = w === 0 ? 'none' : skaliereAlpha(basis[n], w);
    }
  }

  // Setters for a reference proposal (lib/ki.mjs normalisiereReferenz), built on the ones above.
  function farbenIn(z, f) {
    if (!f?.primary) return;
    const palette = paletteAus(f.primary, { akzent: f.accent });
    if (!palette) return;
    // Background and text only as a pair that passes AA, else the derived ones stay.
    if (f.bg && f.text && (kontrast(f.text, f.bg) ?? 0) >= 4.5) {
      palette['--c-bg'] = f.bg;
      palette['--c-text'] = f.text;
    }
    paletteIn(z, palette);
  }
  function buttonsIn(z, b) {
    z.regeln.buttons = normalisiere({ ...z.regeln, buttons: { ...z.regeln.buttons, art: b.art, form: b.form, pfeil: b.pfeil, groesse: b.groesse } }).buttons;
  }
  function schriftIn(z, s, fontId) {
    const font = KURATIERT.find((f) => f.id === fontId);
    if (font) fontIn(z, 'display', font);
    if ('--fw-display' in basis) z.vars['--fw-display'] = String(s.gewicht);
    if ('--fw-display-strong' in basis) z.vars['--fw-display-strong'] = String(Math.min(900, s.gewicht + 100));
    z.regeln.schrift.laufweite = s.laufweite;
  }
  function formIn(z, f) {
    radiusIn(z, f.radiusPx);
    schattenIn(z, f.schatten);
    z.regeln.linien.staerke = f.linien;
    dichteIn(z, f.dichte);
  }

  // ── dice: random but coherent versions ──
  // Every roll is one history entry (Ctrl+Z goes back) and lands in a small
  // gallery, so a good roll can be picked again after rolling on.

  const zufallAus = (liste) => liste[Math.floor(Math.random() * liste.length)];
  const zufallZwischen = (min, max, schritt) => runde(min + Math.round((Math.random() * (max - min)) / schritt) * schritt, 3);
  // Body text needs a calm text face: no display, no handwriting, no condensed poster fonts.
  const FLIESSTEXT_UNGEEIGNET = ['oswald', 'bebas-neue', 'anton', 'archivo-black', 'syne', 'unbounded', 'big-shoulders-display', 'caveat', 'bodoni-moda', 'dm-serif-display', 'instrument-serif', 'young-serif', 'playfair-display'];
  const WUERFEL_BEREICHE = [['farben', 'Farben'], ['schrift', 'Schrift'], ['groessen', 'Größen'], ['form', 'Form'], ['buttons', 'Buttons']];
  let wuerfelVerlauf = lies('wuerfel', []);
  let autoTimer = null;

  function wuerfelEinstellungen() {
    const standard = { farben: true, schrift: true, groessen: true, form: true, buttons: true, takt: 3 };
    ui.wuerfel = { ...standard, ...(ui.wuerfel ?? {}) };
    return ui.wuerfel;
  }

  function wuerfeln() {
    const w = wuerfelEinstellungen();
    if (!WUERFEL_BEREICHE.some(([id]) => w[id])) { zeigeMeldung('Beim Würfeln ist alles gesperrt. Im Reiter Varianten mindestens einen Bereich freigeben.', 'fehler'); stoppeAuto(); return; }
    aendere((z) => {
      if (w.farben) paletteIn(z, zufallsPalette());
      let anzeige = z.fonts.display?.category ?? 'sans-serif';
      if (w.schrift) {
        const display = zufallAus(KURATIERT);
        anzeige = display.category;
        const textTauglich = KURATIERT.filter((f) => !FLIESSTEXT_UNGEEIGNET.includes(f.id));
        // Serif or display headline -> sans body. Sans headline -> often the same family.
        let body;
        if (display.category === 'sans-serif' && !FLIESSTEXT_UNGEEIGNET.includes(display.id) && Math.random() < 0.5) body = display;
        else body = zufallAus(textTauglich.filter((f) => f.category === 'sans-serif' && f.id !== display.id));
        fontIn(z, 'display', display);
        fontIn(z, 'body', body);
        const fett = display.category === 'serif' ? zufallAus([400, 500, 600]) : zufallAus([500, 600, 700, 800]);
        z.vars['--fw-display'] = String(fett);
        z.vars['--fw-display-strong'] = String(Math.min(900, fett + 100));
        z.regeln.schrift.laufweite = anzeige === 'display' ? zufallZwischen(0, 0.03, 0.005) : zufallZwischen(-0.035, 0, 0.005);
      }
      if (w.groessen) {
        skalaIn(z, zufallZwischen(1.16, 1.4, 0.01));
        z.vars['--lh-tight'] = String(anzeige === 'serif' ? zufallZwischen(1.05, 1.2, 0.01) : zufallZwischen(1.0, 1.15, 0.01));
      }
      if (w.form) {
        dichteIn(z, zufallZwischen(0.85, 1.25, 0.05));
        radiusIn(z, zufallAus([0, 2, 4, 6, 8, 12, 16]));
        schattenIn(z, zufallAus([0, 0.5, 1, 1, 1.5]));
        z.regeln.linien.staerke = zufallAus([1, 1, 1, 2]);
      }
      if (w.buttons) {
        // No pill: it is a banned default in the PortaWerk standards.
        z.regeln.buttons = {
          art: zufallAus(['gefuellt', 'gefuellt', 'kontur', 'unterstrichen']),
          form: zufallAus(['standard', 'standard', 'eckig']),
          pfeil: Math.random() < 0.4,
          groesse: zufallZwischen(0.95, 1.15, 0.05),
          hover: zufallAus(['heben', 'leuchten', 'heller']),
        };
      }
    }, { neuZeichnen: true });
    wuerfelVerlauf = [nurDesign(zustand), ...wuerfelVerlauf].slice(0, 12);
    schreib('wuerfel', wuerfelVerlauf);
    if (ui.reiter === 'varianten') zeichneReiter();
  }

  function startAuto() {
    stoppeAuto();
    wuerfeln();
    autoTimer = setInterval(wuerfeln, Math.max(1, wuerfelEinstellungen().takt) * 1000);
    aktualisiereAutoKnopf();
  }
  function stoppeAuto() {
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = null;
    aktualisiereAutoKnopf();
  }
  function aktualisiereAutoKnopf() {
    const knopf = kopfKnoepfe?.auto;
    if (!knopf) return;
    knopf.setAttribute('aria-pressed', String(Boolean(autoTimer)));
    knopf.title = autoTimer ? 'Durchlauf anhalten (Esc)' : 'Automatisch durchwürfeln';
    knopf.replaceChildren(icon(autoTimer ? 'pause' : 'play'));
  }
  function zeigeWurf(eintrag) {
    stoppeAuto();
    const ansicht = zustand.ansicht;
    zustand = klon(eintrag);
    zustand.ansicht = ansicht;
    anwendenUeberall();
    merkeVerlauf();
    zeichneReiter();
  }

  // ── color resolution through a probe element ──
  let sonde = null;
  function aufgeloesteFarbe(name) {
    if (!sonde) {
      sonde = document.createElement('span');
      sonde.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
      document.body.appendChild(sonde);
    }
    sonde.style.color = '';
    sonde.style.color = `var(${name})`;
    const rgb = parseFarbe(getComputedStyle(sonde).color);
    return rgb ? zuHex(rgb) : '#000000';
  }

  // ── panel layout ──

  const REITER = [
    ['farben', 'Farben', 'palette'], ['schrift', 'Schrift', 'type'], ['form', 'Form', 'ruler'],
    ['buttons', 'Buttons', 'mouse-pointer-click'], ['text', 'Text', 'text-cursor-input'], ['bilder', 'Bilder', 'image'],
    ['sektionen', 'Sektionen', 'layers'], ['kopf', 'Kopfzeile', 'panel-top'], ['referenz', 'Referenz', 'pipette'],
    ['ansicht', 'Ansicht', 'monitor'], ['varianten', 'Varianten', 'sparkles'],
  ];

  let panelEl, kopfKnoepfe = {}, koerperEl, reiterEl, fussEl, rahmenEl = null, rasterEl = null;

  function baueGeruest() {
    wurzelEl.replaceChildren();
    const rueck = el('button', { title: 'Rückgängig (Strg+Z)', 'aria-label': 'Rückgängig', onclick: rueckgaengig }, icon('undo-2'));
    const vor = el('button', { title: 'Wiederholen (Strg+Umschalt+Z)', 'aria-label': 'Wiederholen', onclick: wiederholen }, icon('redo-2'));
    const klapp = el('button', {
      title: 'Einklappen', 'aria-label': 'Einklappen',
      onclick: () => { ui.eingeklappt = !ui.eingeklappt; schreib('ui', ui); panelEl.classList.toggle('eingeklappt', ui.eingeklappt); klapp.replaceChildren(icon(ui.eingeklappt ? 'chevron-down' : 'chevron-up')); },
    }, icon(ui.eingeklappt ? 'chevron-down' : 'chevron-up'));
    const zu = el('button', { title: 'Ausblenden (Alt+T)', 'aria-label': 'Ausblenden', onclick: () => zeigePanel(false) }, icon('x'));
    kopfKnoepfe = { rueck, vor };
    const titelZusatz = el('small', {}, '');
    kopfKnoepfe.zusatz = titelZusatz;
    const kopf = el('div', { class: 'kopf' }, el('div', { class: 'titel' }, el('i'), 'Tweakbar', titelZusatz), rueck, vor, klapp, zu);

    reiterEl = el('div', { class: 'reiter', role: 'tablist' });
    for (const [id, name, ic] of REITER) {
      reiterEl.appendChild(el('button', {
        role: 'tab', 'aria-selected': String(ui.reiter === id), title: name,
        onclick: () => { ui.reiter = id; schreib('ui', ui); zeichneReiter(); },
      }, icon(ic), name));
    }
    koerperEl = el('div', { class: 'koerper' });

    const abKnopf = (slot) => el('button', {
      class: schnappschuesse[slot] ? '' : 'leer', 'aria-pressed': String(schnappschuesse.aktiv === slot),
      title: schnappschuesse[slot] ? `Schnappschuss ${slot} zeigen (Umschalt+Klick: neu merken)` : `Stand als ${slot} merken`,
      onclick: (ereignis) => schnappschuss(slot, ereignis.shiftKey),
    }, slot);
    const auto = el('button', { class: 'knopf klein', 'aria-pressed': 'false', onclick: () => (autoTimer ? stoppeAuto() : startAuto()) }, icon('play'));
    kopfKnoepfe.auto = auto;
    fussEl = el('div', { class: 'fuss' },
      el('div', { class: 'ab', title: 'Schnappschüsse A/B' }, abKnopf('A'), abKnopf('B')),
      el('button', { class: 'knopf klein', title: 'Zufällige Version würfeln (Alt+W)', onclick: () => { stoppeAuto(); wuerfeln(); } }, icon('dices'), 'Würfeln'),
      auto,
      el('button', { class: 'knopf klein', title: 'Ungespeicherte Änderungen verwerfen', onclick: zuruecksetzen }, icon('rotate-ccw'), 'Zurück'),
      el('span', { class: 'platz' }),
      el('button', { class: 'knopf primaer', onclick: speichern }, icon('save'), 'Speichern'),
    );
    panelEl = el('div', { class: `panel${ui.eingeklappt ? ' eingeklappt' : ''}`, role: 'dialog', 'aria-label': 'Tweakbar' }, kopf, reiterEl, koerperEl, fussEl);
    wurzelEl.appendChild(panelEl);
    positioniere();
    machVerschiebbar(kopf);
    aktualisiereAutoKnopf();
    zeichneReiter();
    aktualisiereKopf();
  }

  function positioniere() {
    const breite = 340;
    const x = ui.x ?? window.innerWidth - breite - 16;
    const y = ui.y ?? 16;
    panelEl.style.left = `${Math.max(0, Math.min(window.innerWidth - 60, x))}px`;
    panelEl.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, y))}px`;
  }

  function machVerschiebbar(griff) {
    griff.addEventListener('pointerdown', (start) => {
      if (start.target.closest('button')) return;
      const rect = panelEl.getBoundingClientRect();
      const dx = start.clientX - rect.left, dy = start.clientY - rect.top;
      griff.setPointerCapture(start.pointerId);
      const bewegen = (e) => { ui.x = e.clientX - dx; ui.y = e.clientY - dy; positioniere(); };
      const ende = () => { griff.removeEventListener('pointermove', bewegen); schreib('ui', ui); };
      griff.addEventListener('pointermove', bewegen);
      griff.addEventListener('pointerup', ende, { once: true });
    });
  }

  function aktualisiereKopf() {
    if (!kopfKnoepfe.rueck) return;
    kopfKnoepfe.rueck.disabled = verlauf.length < 2;
    kopfKnoepfe.vor.disabled = !zukunft.length;
    const anzahl = Object.keys(zustand.vars).length + (zustand.fonts.display ? 1 : 0) + (zustand.fonts.body ? 1 : 0) + aenderungsListe().length
      + (JSON.stringify(zustand.regeln) === JSON.stringify(gespeicherteRegeln) ? 0 : 1);
    kopfKnoepfe.zusatz.textContent = anzahl ? `${anzahl} ungespeichert` : '';
  }

  function zeigePanel(sichtbar) {
    ui.offen = sichtbar;
    schreib('ui', ui);
    wurzelEl.hidden = !sichtbar;
    if (!sichtbar) stoppeAuto();
  }

  // ── reusable controls ──

  function regler({ name, min, max, schritt, wert, anzeige = (w) => w, beiEingabe }) {
    const wertEl = el('span', { class: 'wert' }, String(anzeige(wert)));
    const input = el('input', {
      type: 'range', min: String(min), max: String(max), step: String(schritt), value: String(wert), 'aria-label': name,
      oninput: () => { wertEl.textContent = String(anzeige(Number(input.value))); beiEingabe(Number(input.value), false); },
      onchange: () => { beiEingabe(Number(input.value), true); },
    });
    return el('div', { class: 'zeile' }, el('span', { class: 'name' }, name), input, wertEl);
  }

  function chips(optionen, aktiv, beiWahl) {
    return el('div', { class: 'chips' }, optionen.map(([wert, name]) => el('button', {
      'aria-pressed': String(aktiv === wert), onclick: () => beiWahl(wert),
    }, name)));
  }

  function abschnitt(titel, ...inhalt) {
    return el('div', { class: 'abschnitt' }, el('h3', {}, titel), ...inhalt);
  }

  // ── tabs ──

  function zeichneReiter() {
    if (!koerperEl) return;
    reiterEl.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', String(REITER[i][0] === ui.reiter)));
    const zeichner = { farben: reiterFarben, schrift: reiterSchrift, form: reiterForm, buttons: reiterButtons, bilder: reiterBilder, text: reiterText, referenz: reiterReferenz, sektionen: reiterSektionen, kopf: reiterKopf, ansicht: reiterAnsicht, varianten: reiterVarianten }[ui.reiter] ?? reiterFarben;
    const scroll = koerperEl.scrollTop;
    koerperEl.replaceChildren(...[zeichner()].flat());
    if (meldung) koerperEl.appendChild(meldung);
    koerperEl.scrollTop = scroll;
  }

  function farbZeile(name) {
    const roh = effektiv(name, zustand);
    const verknuepft = /^var\(/.test(roh);
    const hex = aufgeloesteFarbe(name);
    const text = el('input', { type: 'text', value: verknuepft ? roh : hex, 'aria-label': `${name} Wert` });
    const farbe = el('input', { type: 'color', value: hex.toLowerCase(), 'aria-label': name });
    farbe.addEventListener('input', () => { text.value = farbe.value.toUpperCase(); setzeVar(name, farbe.value.toUpperCase(), { verlaufEintrag: false }); aktualisiereAmpel(); });
    farbe.addEventListener('change', () => { merkeVerlauf(); aktualisiereAmpel(); });
    text.addEventListener('change', () => {
      const wert = text.value.trim();
      if (!parseFarbe(wert) && !/^var\(--[a-z0-9-]+\)$/.test(wert)) { text.value = roh; return; }
      setzeVar(name, /^#/.test(wert) ? wert.toUpperCase() : wert);
      aktualisiereAmpel();
    });
    return el('div', { class: `zeile${zustand.vars[name] != null ? ' geaendert' : ''}`, title: verknuepft ? `verknüpft: ${roh}` : name },
      farbe, el('span', { class: 'name' }, name.replace('--c-', '')), text);
  }

  let ampelEl = null;
  function aktualisiereAmpel() {
    if (!ampelEl) return;
    const paare = [
      ['Text auf Hintergrund', '--c-text', '--c-bg', 4.5],
      ['Text gedämpft auf Hintergrund', '--c-text-muted', '--c-bg', 4.5],
      ['Text auf Fläche', '--c-text', '--c-surface', 4.5],
      ['Weiß auf Akzent (Button)', '--c-white', '--c-accent', 4.5],
      ['Weiß auf Primär', '--c-white', '--c-primary', 4.5],
      ['Akzent-Text auf Hintergrund', '--c-accent-text', '--c-bg', 4.5],
    ];
    ampelEl.replaceChildren(...paare.flatMap(([titel, vorne, hinten, grenze]) => {
      const wert = kontrast(aufgeloesteFarbe(vorne), aufgeloesteFarbe(hinten));
      const stufe = ampel(wert, grenze, 7);
      return [el('span', {}, titel), el('span', { class: 'wert' }, wert ? `${wert.toFixed(2)} : 1` : '?'), el('span', { class: `punkt ${stufe}`, title: { gut: 'AAA', ok: 'AA', schlecht: 'unter AA' }[stufe] ?? '' })];
    }));
  }

  function reiterFarben() {
    const namen = Object.keys(basis).filter((n) => n.startsWith('--c-'));
    ampelEl = el('div', { class: 'ampel' });
    queueMicrotask(aktualisiereAmpel);
    const grund = el('input', { type: 'color', value: aufgeloesteFarbe('--c-primary').toLowerCase(), 'aria-label': 'Grundfarbe' });
    const akzentBehalten = el('input', { type: 'checkbox', checked: true, id: 'akzent-behalten' });
    const uebernehmePalette = (palette) => {
      if (!palette) return;
      aendere((z) => paletteIn(z, palette), { neuZeichnen: true });
    };
    return [
      abschnitt('Kontrast (WCAG)', ampelEl),
      abschnitt('Palette',
        el('div', { class: 'zeile' }, grund, el('span', { class: 'name' }, 'Grundfarbe (wird Primär)')),
        el('div', { class: 'zeile' }, akzentBehalten, el('label', { for: 'akzent-behalten' }, 'Akzentfarbe behalten')),
        el('div', { class: 'knopfreihe' },
          el('button', { class: 'knopf', onclick: () => uebernehmePalette(paletteAus(grund.value, { akzent: akzentBehalten.checked ? aufgeloesteFarbe('--c-accent') : null })) }, icon('wand-sparkles'), 'Ableiten'),
          el('button', { class: 'knopf', onclick: () => uebernehmePalette(zufallsPalette()) }, icon('shuffle'), 'Zufall')),
        el('p', { class: 'hinweis' }, 'Leitet Hover, Hell, Flächen, Linien und Text aus der Grundfarbe ab. Creme- oder Beige-Hintergrund nur mit Markengrund.')),
      abschnitt('Farben', namen.map(farbZeile)),
    ];
  }

  // Font picker
  function fontWahl(rolle) {
    const variable = rolle === 'display' ? '--font-display' : '--font-body';
    const aktuell = zustand.fonts[rolle];
    const anzeigeName = aktuell?.family ?? effektiv(variable, zustand).split(',')[0].replace(/['"]/g, '');
    const liste = el('div', { class: 'fontliste' });
    const suche = el('input', { class: 'feld', type: 'search', placeholder: 'Schrift suchen (alle Google Fonts)', 'aria-label': `${rolle} suchen`, style: 'width:100%' });
    const zeige = (fonts) => {
      liste.replaceChildren(...fonts.map((f) => {
        const verboten = VERBOTEN.includes(f.id);
        ladeListenFont(f);
        return el('button', {
          'aria-pressed': String(aktuell?.id === f.id), style: `font-family:'${f.family}', ${f.category === 'serif' ? 'serif' : 'sans-serif'}`,
          onclick: () => {
            aendere((z) => fontIn(z, rolle, f), { neuZeichnen: true });
          },
        }, f.family, el('small', {}, verboten ? 'verboten laut Standards' : f.category));
      }));
    };
    zeige(KURATIERT);
    let warte = null;
    suche.addEventListener('input', () => {
      clearTimeout(warte);
      const q = suche.value.trim().toLowerCase();
      const lokal = KURATIERT.filter((f) => f.family.toLowerCase().includes(q));
      zeige(lokal);
      if (q.length < 2) return;
      warte = setTimeout(async () => {
        try {
          const { fonts } = await holeJson(`fonts?q=${encodeURIComponent(q)}`);
          const ids = new Set(lokal.map((f) => f.id));
          zeige([...lokal, ...fonts.filter((f) => !ids.has(f.id))].slice(0, 40));
        } catch (fehler) {
          liste.appendChild(el('p', { class: 'warnung' }, `Suche fehlgeschlagen: ${fehler.message}`));
        }
      }, 300);
    });
    return abschnitt(rolle === 'display' ? 'Überschriften' : 'Fließtext',
      el('div', { class: 'fontaktuell', style: `font-family:${effektiv(variable, zustand)}` }, anzeigeName || '(Standard)'),
      aktuell && VERBOTEN.includes(aktuell.id) ? el('p', { class: 'warnung' }, 'Diese Schrift steht auf der Verbotsliste der PortaWerk-Standards.') : null,
      suche, liste,
      aktuell ? el('button', { class: 'knopf klein', style: 'margin-top:6px', onclick: () => aendere((z) => { z.fonts[rolle] = null; delete z.vars[variable]; }, { neuZeichnen: true }) }, 'Schrift zurücksetzen') : null);
  }

  function zahlAus(wert, ersatz) {
    const n = parseFloat(String(wert));
    return Number.isFinite(n) ? n : ersatz;
  }

  function reiterSchrift() {
    const skala = zustand.regler.skala ?? 1.25;
    const setzeSkala = (r, fertig) => aendere((z) => skalaIn(z, r), { verlaufEintrag: fertig });
    return [
      fontWahl('display'),
      fontWahl('body'),
      abschnitt('Überschriften',
        regler({ name: 'Gewicht', min: 100, max: 900, schritt: 100, wert: zahlAus(effektiv('--fw-display', zustand), 600), beiEingabe: (w, f) => setzeVar('--fw-display', String(w), { verlaufEintrag: f }) }),
        regler({ name: 'Gewicht H1', min: 100, max: 900, schritt: 100, wert: zahlAus(effektiv('--fw-display-strong', zustand), 700), beiEingabe: (w, f) => setzeVar('--fw-display-strong', String(w), { verlaufEintrag: f }) }),
        regler({ name: 'Laufweite', min: -0.08, max: 0.15, schritt: 0.005, wert: zustand.regeln.schrift.laufweite, anzeige: (w) => `${w}em`, beiEingabe: (w, f) => aendere((z) => { z.regeln.schrift.laufweite = w; }, { verlaufEintrag: f }) }),
        regler({ name: 'Typo-Skala', min: 1.1, max: 1.5, schritt: 0.01, wert: skala, anzeige: (w) => w.toFixed(2), beiEingabe: setzeSkala }),
        el('p', { class: 'hinweis' }, 'Die Skala erzeugt --fs-h1 bis --fs-h4 als clamp() zwischen 375 und 1280 px.')),
      abschnitt('Zeilenhöhe',
        regler({ name: 'Überschriften', min: 0.9, max: 1.6, schritt: 0.01, wert: zahlAus(effektiv('--lh-tight', zustand), 1.15), beiEingabe: (w, f) => setzeVar('--lh-tight', String(w), { verlaufEintrag: f }) }),
        regler({ name: 'Fließtext', min: 1.3, max: 2.1, schritt: 0.01, wert: zahlAus(effektiv('--lh-normal', zustand), 1.6), beiEingabe: (w, f) => setzeVar('--lh-normal', String(w), { verlaufEintrag: f }) })),
    ];
  }

  function reiterForm() {
    const r = zustand.regler;
    return [
      abschnitt('Abstände',
        regler({ name: 'Dichte', min: 0.6, max: 1.6, schritt: 0.05, wert: r.dichte ?? 1, anzeige: (w) => `${Math.round(w * 100)} %`, beiEingabe: (w, f) => aendere((z) => dichteIn(z, w), { verlaufEintrag: f }) }),
        regler({ name: 'Inhaltsbreite', min: 880, max: 1600, schritt: 20, wert: zahlAus(effektiv('--container-max', zustand), 1200), anzeige: (w) => `${w}px`, beiEingabe: (w, f) => setzeVar('--container-max', `${w}px`, { verlaufEintrag: f }) })),
      abschnitt('Form',
        regler({ name: 'Radius', min: 0, max: 24, schritt: 1, wert: r.radius ?? zahlAus(basis['--radius-md'], 4), anzeige: (w) => `${w}px`, beiEingabe: (w, f) => aendere((z) => radiusIn(z, w), { verlaufEintrag: f }) }),
        regler({ name: 'Schatten', min: 0, max: 2.5, schritt: 0.1, wert: r.schatten ?? 1, anzeige: (w) => `${Math.round(w * 100)} %`, beiEingabe: (w, f) => aendere((z) => schattenIn(z, w), { verlaufEintrag: f }) }),
        regler({ name: 'Linienstärke', min: 0, max: 4, schritt: 1, wert: zustand.regeln.linien.staerke, anzeige: (w) => `${w}px`, beiEingabe: (w, f) => aendere((z) => { z.regeln.linien.staerke = w; }, { verlaufEintrag: f }) }),
        el('p', { class: 'hinweis' }, 'Linienstärke wirkt auf Kopfzeile, Badge, Kontur-Button und Formularfelder.')),
    ];
  }

  function reiterButtons() {
    const b = zustand.regeln.buttons;
    const setze = (schluessel, wert, f = true) => aendere((z) => { z.regeln.buttons[schluessel] = wert; }, { verlaufEintrag: f, neuZeichnen: f });
    return [
      abschnitt('Art', chips([['gefuellt', 'Gefüllt'], ['kontur', 'Kontur'], ['unterstrichen', 'Unterstrichen']], b.art, (w) => setze('art', w))),
      abschnitt('Form', chips([['standard', 'Standard'], ['pille', 'Pille'], ['eckig', 'Eckig']], b.form, (w) => setze('form', w)),
        b.form === 'pille' ? el('p', { class: 'warnung' }, 'Pillenförmige Buttons sind ein verbotener Default, nur mit Markengrund.') : null),
      abschnitt('Pfeil', chips([[false, 'Ohne'], [true, 'Mit Pfeil']], b.pfeil, (w) => setze('pfeil', w))),
      abschnitt('Größe', regler({ name: 'Größe', min: 0.8, max: 1.4, schritt: 0.05, wert: b.groesse, anzeige: (w) => `${Math.round(w * 100)} %`, beiEingabe: (w, f) => setze('groesse', w, f) })),
      abschnitt('Hover', chips([['heben', 'Heben'], ['leuchten', 'Leuchten'], ['heller', 'Heller'], ['keiner', 'Keiner']], b.hover, (w) => setze('hover', w)),
        el('p', { class: 'hinweis' }, 'Wirkt auf .btn-primary und .btn-secondary der ganzen Seite. Gespeichert als Regelblock in tokens.css.')),
    ];
  }

  // Images
  // Astro's dev toolbar strips data-astro-source-file from the live DOM. The
  // server HTML still has it, so it is read from a fresh copy of the page and
  // matched by position in the tree.
  async function sammleQuellen() {
    try {
      const antwort = await fetch(location.href, { headers: { Accept: 'text/html' } });
      const kopie = new DOMParser().parseFromString(await antwort.text(), 'text/html');
      const pfad = (knoten) => {
        const teile = [];
        for (let k = knoten; k && k !== document.body && k.parentElement; k = k.parentElement) {
          teile.unshift(Array.prototype.indexOf.call(k.parentElement.children, k));
        }
        return teile;
      };
      const finde = (teile) => teile.reduce((k, i) => k?.children?.[i] ?? null, kopie.body);
      document.querySelectorAll('main, [data-pw-tb-sektion], [data-pw-tb-bild], [data-pw-tb-text]').forEach((element) => {
        const gegenstueck = finde(pfad(element));
        if (!gegenstueck || gegenstueck.tagName !== element.tagName) return;
        const quelle = gegenstueck.closest('[data-astro-source-file]');
        if (quelle) element.dataset.pwTbQuelle = `${quelle.getAttribute('data-astro-source-file')}|${quelle.getAttribute('data-astro-source-loc') ?? ''}`;
      });
    } catch (fehler) {
      console.warn('[Tweakbar] Quelldateien nicht ermittelbar:', fehler);
    }
  }

  function quelleVon(knoten) {
    const quelle = knoten?.closest?.('[data-pw-tb-quelle]');
    if (!quelle) return `Seite ${location.pathname}`;
    const [datei, ort] = quelle.dataset.pwTbQuelle.split('|');
    const pfad = datei.replace(/\\/g, '/');
    const ab = pfad.lastIndexOf('/src/');
    return `${ab >= 0 ? pfad.slice(ab + 1) : pfad}${ort ? `:${ort}` : ''}`;
  }
  function beschreibe(knoten) {
    if (!knoten) return '';
    if (knoten.tagName === 'IMG') return `<img alt="${knoten.getAttribute('alt') ?? ''}">`;
    const ueberschrift = knoten.querySelector?.('h1, h2, h3')?.textContent?.trim().slice(0, 40);
    return `<${knoten.tagName.toLowerCase()}${knoten.id ? ` id="${knoten.id}"` : ''}>${ueberschrift ? ` "${ueberschrift}"` : ''}`;
  }

  function bildKlick(ereignis) {
    if (!document.documentElement.classList.contains('pw-tb-bildmodus')) return;
    if (ereignis.composedPath().includes(host)) return;
    const bild = ereignis.target instanceof Element ? ereignis.target.closest('img') : null;
    if (!bild) return;
    ereignis.preventDefault();
    ereignis.stopPropagation();
    if (fokusModus && ausgewaehltesBild === bild.dataset.pwTbBild) {
      const rect = bild.getBoundingClientRect();
      const x = Math.round(((ereignis.clientX - rect.left) / rect.width) * 100);
      const y = Math.round(((ereignis.clientY - rect.top) / rect.height) * 100);
      fokusModus = false;
      aendere((z) => { (z.bilder[bild.dataset.pwTbBild] ??= {}).position = `${x}% ${y}%`; }, { neuZeichnen: true });
      return;
    }
    document.querySelectorAll('[data-pw-tb-auswahl]').forEach((b) => b.removeAttribute('data-pw-tb-auswahl'));
    bild.setAttribute('data-pw-tb-auswahl', '');
    ausgewaehltesBild = bild.dataset.pwTbBild;
    ui.reiter = 'bilder';
    zeichneReiter();
  }
  document.addEventListener('click', bildKlick, true);
  document.addEventListener('click', textKlick, true);

  function setzeBildmodus(an) {
    if (an && document.documentElement.classList.contains('pw-tb-textmodus')) setzeTextmodus(false, false);
    document.documentElement.classList.toggle('pw-tb-bildmodus', an);
    if (!an) {
      fokusModus = false;
      document.querySelectorAll('[data-pw-tb-auswahl]').forEach((b) => b.removeAttribute('data-pw-tb-auswahl'));
    }
    anwendenUeberall();
    zeichneReiter();
  }

  function reiterBilder() {
    const an = document.documentElement.classList.contains('pw-tb-bildmodus');
    const teile = [abschnitt('Bildmodus',
      el('div', { class: 'knopfreihe' }, el('button', { class: `knopf${an ? ' primaer' : ''}`, onclick: () => setzeBildmodus(!an) }, icon('crosshair'), an ? 'Bildmodus aus' : 'Bildmodus an')),
      el('p', { class: 'hinweis' }, an ? 'Bild auf der Seite anklicken.' : 'Im Bildmodus wählst du ein Bild per Klick aus. Nur in der Desktop-Ansicht.'))];

    const bild = ausgewaehltesBild ? bildElement(ausgewaehltesBild) : null;
    if (an && bild) {
      const eintrag = zustand.bilder[ausgewaehltesBild] ?? {};
      if (!bilderListe) {
        bilderListe = [];
        holeJson('bilder').then((a) => { bilderListe = a.bilder; zeichneReiter(); }).catch((f) => { bilderListe = []; zeigeMeldung(`Bilderliste: ${f.message}`, 'fehler'); });
      }
      const setzeEintrag = (funktion) => aendere((z) => {
        const e = (z.bilder[ausgewaehltesBild] ??= {});
        funktion(e);
        if (!e.src && !e.position && !e.filter) delete z.bilder[ausgewaehltesBild];
      }, { neuZeichnen: true });
      teile.push(abschnitt('Ausgewählt',
        el('img', { class: 'vorschaubild', src: bild.currentSrc || bild.src, alt: '' }),
        el('p', { class: 'hinweis' }, `${beschreibe(bild)} · ${quelleVon(bild)}`),
        el('div', { class: 'knopfreihe' },
          el('button', { class: `knopf klein${fokusModus ? ' primaer' : ''}`, onclick: () => { fokusModus = !fokusModus; zeichneReiter(); } }, icon('crosshair'), fokusModus ? 'Jetzt ins Bild klicken' : 'Bildmittelpunkt setzen'),
          eintrag.position ? el('button', { class: 'knopf klein', onclick: () => setzeEintrag((e) => { delete e.position; }) }, `Mitte ${eintrag.position} lösen`) : null),
        el('h3', {}, 'Filter'),
        chips([['', 'Original'], ['grau', 'Graustufen'], ['duoton', 'Duoton']], eintrag.filter ?? '', (w) => setzeEintrag((e) => { if (w) e.filter = w; else delete e.filter; })),
        el('h3', { style: 'margin-top:10px' }, 'Tauschen aus public/images'),
        bilderListe?.length
          ? el('div', { class: 'bildraster' }, bilderListe.map((pfad) => el('button', { title: pfad, onclick: () => setzeEintrag((e) => { e.src = pfad; delete e.ki; }) }, el('img', { src: pfad, alt: '', loading: 'lazy' }))))
          : el('p', { class: 'hinweis' }, bilderListe ? 'public/images ist leer.' : 'Lade Bilder ...'),
        eintrag.src ? el('button', { class: 'knopf klein', style: 'margin-top:6px', onclick: () => setzeEintrag((e) => { delete e.src; delete e.ki; }) }, 'Original-Bild zurück') : null,
        kiBildAbschnitt(bild, setzeEintrag)));
    }
    teile.push(abschnitt('Hero',
      regler({ name: 'Abdunkeln', min: 0, max: 0.7, schritt: 0.05, wert: zustand.hero.abdunkeln, anzeige: (w) => `${Math.round(w * 100)} %`, beiEingabe: (w, f) => aendere((z) => { z.hero.abdunkeln = w; }, { verlaufEintrag: f }) }),
      el('p', { class: 'hinweis' }, 'Dunkelt Bild oder Video der ersten Sektion ab. Bildänderungen landen beim Speichern in tweakbar-aenderungen.md, nicht im Quelltext.')));
    return teile;
  }

  // Sections
  function sektionsListe() {
    markiereSeite();
    const main = document.querySelector('main') ?? document.body;
    return Array.from(main.querySelectorAll(':scope > [data-pw-tb-sektion]'));
  }

  function reiterSektionen() {
    const elemente = sektionsListe();
    const liste = el('ul', { class: 'sektionen' });
    let gezogen = null;
    const neueReihenfolge = (schluessel) => aendere((z) => { z.sektionen.reihenfolge = schluessel; }, { neuZeichnen: true });
    elemente.forEach((sektion, index) => {
      const s = sektion.dataset.pwTbSektion;
      const versteckt = zustand.sektionen.versteckt.includes(s);
      const verschiebe = (richtung) => {
        const schluessel = elemente.map((e) => e.dataset.pwTbSektion);
        const ziel = index + richtung;
        if (ziel < 0 || ziel >= schluessel.length) return;
        [schluessel[index], schluessel[ziel]] = [schluessel[ziel], schluessel[index]];
        neueReihenfolge(schluessel);
      };
      const hintergrund = el('select', { class: 'feld', 'aria-label': 'Hintergrund', onchange: (e) => aendere((z) => { if (e.target.value) z.sektionen.hintergrund[s] = e.target.value; else delete z.sektionen.hintergrund[s]; }) },
        ['', 'bg', 'surface', 'surface-alt', 'primary'].map((w) => el('option', { value: w, selected: (zustand.sektionen.hintergrund[s] ?? '') === w }, w ? `Hintergrund: ${w}` : 'Hintergrund: wie gebaut')));
      const ausrichtung = el('select', { class: 'feld', 'aria-label': 'Ausrichtung', onchange: (e) => aendere((z) => { if (e.target.value) z.sektionen.ausrichtung[s] = e.target.value; else delete z.sektionen.ausrichtung[s]; }) },
        [['', 'Ausrichtung: wie gebaut'], ['links', 'Links'], ['mitte', 'Mitte']].map(([w, n]) => el('option', { value: w, selected: (zustand.sektionen.ausrichtung[s] ?? '') === w }, n)));
      const eintrag = el('li', { draggable: 'true' },
        el('div', { class: 'oben' },
          el('span', { class: 'griff', title: 'Ziehen zum Verschieben' }, icon('grip-vertical')),
          el('span', { class: 'name', title: quelleVon(sektion) }, beschreibe(sektion)),
          el('button', { class: 'symbol', title: 'Nach oben', 'aria-label': 'Nach oben', onclick: () => verschiebe(-1) }, icon('arrow-up')),
          el('button', { class: 'symbol', title: 'Nach unten', 'aria-label': 'Nach unten', onclick: () => verschiebe(1) }, icon('arrow-down')),
          el('button', { class: 'symbol', title: versteckt ? 'Einblenden' : 'Ausblenden', 'aria-label': versteckt ? 'Einblenden' : 'Ausblenden', onclick: () => aendere((z) => {
            z.sektionen.versteckt = versteckt ? z.sektionen.versteckt.filter((x) => x !== s) : [...z.sektionen.versteckt, s];
          }, { neuZeichnen: true }) }, icon(versteckt ? 'eye-off' : 'eye'))),
        el('div', { class: 'unten' }, hintergrund, ausrichtung));
      eintrag.addEventListener('dragstart', () => { gezogen = index; eintrag.classList.add('ziehen'); });
      eintrag.addEventListener('dragend', () => eintrag.classList.remove('ziehen'));
      eintrag.addEventListener('dragover', (e) => { e.preventDefault(); eintrag.classList.add('ueber'); });
      eintrag.addEventListener('dragleave', () => eintrag.classList.remove('ueber'));
      eintrag.addEventListener('drop', (e) => {
        e.preventDefault();
        if (gezogen == null || gezogen === index) return;
        const schluessel = elemente.map((x) => x.dataset.pwTbSektion);
        const [weg] = schluessel.splice(gezogen, 1);
        schluessel.splice(index, 0, weg);
        neueReihenfolge(schluessel);
      });
      liste.appendChild(eintrag);
    });
    return [
      abschnitt('Sektionen der Seite', liste,
        el('div', { class: 'knopfreihe' },
          el('button', { class: 'knopf klein', onclick: () => aendere((z) => {
            elemente.forEach((e, i) => { z.sektionen.hintergrund[e.dataset.pwTbSektion] = i % 2 ? 'surface' : 'bg'; });
          }, { neuZeichnen: true }) }, 'Hintergrund im Wechsel'),
          el('button', { class: 'knopf klein', onclick: () => aendere((z) => { z.sektionen = leererZustand().sektionen; }, { neuZeichnen: true }) }, 'Alles wie gebaut')),
        el('p', { class: 'hinweis' }, 'Nur Vorschau. Beim Speichern landet die Änderung als Liste in tweakbar-aenderungen.md, Claude übernimmt sie in die .astro-Dateien. Hell/dunkel im Wechsel darf nicht das einzige Trennmittel sein.')),
    ];
  }

  function reiterKopf() {
    const k = zustand.regeln.kopf;
    return [abschnitt('Kopfzeile',
      chips([[false, 'Voll'], [true, 'Transparent']], k.transparent, (w) => aendere((z) => { z.regeln.kopf.transparent = w; }, { neuZeichnen: true })),
      regler({ name: 'Logogröße', min: 20, max: 120, schritt: 2, wert: k.logoHoehe, anzeige: (w) => `${w}px`, beiEingabe: (w, f) => aendere((z) => { z.regeln.kopf.logoHoehe = w; }, { verlaufEintrag: f }) }),
      el('p', { class: 'hinweis' }, 'Wirkt auf .pw-header aus Header.astro. Transparent passt nur, wenn der Hero dahinter genug Kontrast hat.'))];
  }

  // View
  function setzeGeraet(geraet) {
    zustand.ansicht.geraet = geraet;
    speichereLokal();
    rahmenEl?.remove();
    rahmenEl = null;
    rahmenFenster = null;
    document.documentElement.style.overflow = '';
    if (geraet !== 'desktop') {
      if (document.documentElement.classList.contains('pw-tb-bildmodus')) setzeBildmodus(false);
      if (document.documentElement.classList.contains('pw-tb-textmodus')) setzeTextmodus(false, false);
      if (vergleich) setzeVergleich(false);
      const breite = geraet === 'handy' ? 375 : 768;
      const url = new URL(location.href);
      url.searchParams.set('tweakbar-rahmen', '1');
      const rahmen = el('iframe', { src: url.href, title: `Vorschau ${breite}px`, style: `width:${breite + 2}px` });
      rahmen.addEventListener('load', () => {
        rahmenFenster = rahmen.contentWindow;
        const versuch = (n) => {
          if (rahmenFenster?.__pwTweakbarRahmen) rahmenFenster.__pwTweakbarRahmen.anwenden(klon(zustand));
          else if (n > 0) setTimeout(() => versuch(n - 1), 150);
        };
        versuch(30);
      });
      rahmenEl = el('div', { class: 'rahmen' }, el('div', { class: 'leiste' }, `${geraet === 'handy' ? 'Handy' : 'Tablet'} · ${breite} px`), rahmen);
      wurzelEl.insertBefore(rahmenEl, wurzelEl.firstChild);
      document.documentElement.style.overflow = 'hidden';
    }
    zeichneReiter();
  }

  function setzeRaster(an) {
    rasterEl?.remove();
    rasterEl = null;
    if (an) {
      rasterEl = el('div', { class: 'raster' }, el('div', { class: 'innen' }, Array.from({ length: 12 }, () => el('span'))));
      wurzelEl.insertBefore(rasterEl, panelEl);
    }
  }

  function reiterAnsicht() {
    const a = zustand.ansicht;
    return [
      abschnitt('Gerät', el('div', { class: 'knopfreihe' },
        [['desktop', 'Desktop', 'monitor'], ['tablet', 'Tablet 768', 'tablet'], ['handy', 'Handy 375', 'smartphone']].map(([w, n, ic]) => el('button', { class: `knopf klein${a.geraet === w ? ' primaer' : ''}`, onclick: () => setzeGeraet(w) }, icon(ic), n)))),
      abschnitt('Hilfslinien',
        chips([[true, 'Raster an'], [false, 'Raster aus']], a.raster, (w) => { zustand.ansicht.raster = w; setzeRaster(w); speichereLokal(); zeichneReiter(); }),
        el('div', { style: 'height:6px' }),
        chips([[true, 'Abstände an'], [false, 'Abstände aus']], a.abstaende, (w) => { aendere((z) => { z.ansicht.abstaende = w; }, { verlaufEintrag: false, neuZeichnen: true }); speichereLokal(); })),
      abschnitt('Bewegung', chips([[false, 'Animationen an'], [true, 'Animationen aus']], a.ohneAnimation, (w) => { aendere((z) => { z.ansicht.ohneAnimation = w; }, { verlaufEintrag: false, neuZeichnen: true }); speichereLokal(); })),
      abschnitt('Vorher/Nachher',
        el('div', { class: 'knopfreihe' }, el('button', { class: `knopf klein${vergleich ? ' primaer' : ''}`, onclick: () => setzeVergleich(!vergleich) }, icon('columns-2'), vergleich ? 'Vergleich schließen' : 'Vergleich öffnen')),
        el('p', { class: 'hinweis' }, 'Links der gespeicherte Stand, rechts der aktuelle. Trennlinie ziehen, Esc schließt. Nur Desktop.')),
      abschnitt('Prüfen',
        chips([['', 'Aus'], ['grau', 'Graustufen'], ['protan', 'Rot-Schwäche'], ['deutan', 'Grün-Schwäche'], ['tritan', 'Blau-Schwäche'], ['unschaerfe', 'Unschärfe']], a.pruefen ?? '',
          (w) => { aendere((z) => { z.ansicht.pruefen = w; }, { verlaufEintrag: false, neuZeichnen: true }); speichereLokal(); }),
        el('p', { class: 'hinweis' }, 'Unschärfe: Fällt der wichtigste Button noch auf, stimmt die Gewichtung. Graustufen zeigt, ob die Seite ohne Farbe trägt.'),
        el('div', { style: 'height:6px' }),
        chips([[false, 'Lesbarkeit aus'], [true, 'Lesbarkeit prüfen']], Boolean(a.lesbarkeit),
          (w) => { aendere((z) => { z.ansicht.lesbarkeit = w; }, { verlaufEintrag: false, neuZeichnen: true }); speichereLokal(); }),
        a.lesbarkeit ? (lesbarEl = el('p', { class: 'hinweis' }, lesbarText())) : null),
      el('p', { class: 'hinweis' }, 'Alt+T blendet die Tweakbar ein und aus. Die Ansicht wird nicht gespeichert.'),
    ];
  }

  // Snapshots and variants
  function nurDesign(z) {
    const kopie = klon(z);
    kopie.ansicht = zustand.ansicht;
    return kopie;
  }
  function schnappschuss(slot, neuMerken) {
    if (!schnappschuesse[slot] || neuMerken) {
      schnappschuesse[slot] = nurDesign(zustand);
      schnappschuesse.aktiv = slot;
      speichereLokal();
      zeigeMeldung(`Stand als ${slot} gemerkt. Umschalt+Klick auf ${slot} überschreibt ihn.`, 'erfolg');
    } else {
      // Keep the current view settings when switching.
      const ansicht = zustand.ansicht;
      zustand = klon(schnappschuesse[slot]);
      zustand.ansicht = ansicht;
      schnappschuesse.aktiv = slot;
      anwendenUeberall();
      merkeVerlauf();
    }
    baueGeruest();
  }

  let letzterVorschlag = '';
  function reiterVarianten() {
    const quelle = el('select', { class: 'feld', 'aria-label': 'Quelle' },
      el('option', { value: 'jetzt' }, 'Aktueller Stand'),
      ['A', 'B'].map((s) => el('option', { value: s, disabled: !schnappschuesse[s] }, `Schnappschuss ${s}${schnappschuesse[s] ? '' : ' (leer)'}`)));
    const gruppe = el('input', { class: 'feld', type: 'text', value: 'Farbwelt', 'aria-label': 'Gruppe' });
    const nr = el('select', { class: 'feld', 'aria-label': 'Nummer' }, Array.from({ length: 9 }, (_, i) => el('option', { value: String(i + 1), selected: i === 1 }, String(i + 1))));
    const name = el('input', { class: 'feld', type: 'text', placeholder: 'z. B. Warm', 'aria-label': 'Name' });
    const ausgabe = el('textarea', { class: 'ausgabe', readOnly: true, value: letzterVorschlag, placeholder: 'Hier erscheint der Eintrag für site.ts.' });
    const schreiben = async () => {
      const z = quelle.value === 'jetzt' ? zustand : schnappschuesse[quelle.value];
      if (!z) return;
      if (!name.value.trim()) { zeigeMeldung('Bitte einen Namen für die Variante eingeben.', 'fehler'); return; }
      try {
        const vars = { ...z.vars };
        if (z.fonts.display) delete vars['--font-display'];
        if (z.fonts.body) delete vars['--font-body'];
        // Color dot for the pitch bar: the accent if it changed, else the primary.
        const kennfarbe = z.vars['--c-accent'] ?? z.vars['--c-primary'] ?? basis['--c-primary'];
        const farbe = parseFarbe(kennfarbe) ? zuHex(parseFarbe(kennfarbe)) : null;
        const antwort = await holeJson('variante', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gruppe: gruppe.value, nr: Number(nr.value), name: name.value, vars, farbe, fonts: z.fonts }),
        });
        letzterVorschlag = antwort.vorschlag;
        ausgabe.value = antwort.vorschlag;
        zeigeMeldung(`Klasse html.${antwort.klasse} steht in tokens.css.${antwort.luecken.length ? ` Gruppe ${antwort.luecken.join(', ')}: Variante 1 fehlt noch, die Leiste startet immer mit 1. Am besten den Grundstand als Nr. 1 speichern.` : ''}`, 'erfolg', false);
      } catch (fehler) {
        zeigeMeldung(`Variante nicht gespeichert: ${fehler.message}`, 'fehler', false);
      }
    };
    const w = wuerfelEinstellungen();
    const sperre = WUERFEL_BEREICHE.map(([id, titel]) => el('label', { class: 'zeile' },
      el('input', { type: 'checkbox', checked: w[id], onchange: (e) => { w[id] = e.target.checked; schreib('ui', ui); } }),
      el('span', { class: 'name' }, titel)));
    const fleck = (farbe) => el('span', { style: `display:inline-block;width:14px;height:14px;border-radius:3px;border:1px solid rgba(0,0,0,.15);background:${farbe}` });
    const galerie = wuerfelVerlauf.map((eintrag, i) => el('button', {
      class: 'knopf', style: 'width:100%;justify-content:flex-start;gap:6px;margin-top:4px',
      title: 'Diese Version wieder anzeigen', onclick: () => zeigeWurf(eintrag),
    }, el('b', {}, String(i + 1)),
    fleck(effektiv('--c-primary', eintrag)), fleck(effektiv('--c-accent', eintrag)), fleck(effektiv('--c-bg', eintrag)),
    el('span', {}, `${eintrag.fonts?.display?.family ?? 'Standard'} / ${eintrag.fonts?.body?.family ?? 'Standard'}`)));
    return [
      abschnitt('Würfeln',
        el('p', { class: 'hinweis' }, 'Unten „Würfeln“ (Alt+W) erzeugt eine zufällige, stimmige Version. Play würfelt automatisch weiter, Esc hält an. Strg+Z geht einen Wurf zurück.'),
        ...sperre,
        regler({ name: 'Takt', min: 1, max: 10, schritt: 1, wert: w.takt, anzeige: (x) => `${x} s`, beiEingabe: (x, fertig) => { w.takt = x; if (fertig) { schreib('ui', ui); if (autoTimer) startAuto(); } } }),
        el('p', { class: 'hinweis' }, 'Haken weg = Bereich bleibt beim Würfeln, wie er ist.')),
      abschnitt('Letzte Würfe',
        galerie.length ? galerie : el('p', { class: 'hinweis' }, 'Noch nichts gewürfelt.'),
        el('p', { class: 'hinweis' }, 'Gefällt dir einer: anklicken, dann unten als A oder B merken oder hier als Kunden-Variante schreiben.')),
      abschnitt('Schnappschüsse', el('p', { class: 'hinweis' }, 'Unten A oder B klicken: leer = aktuellen Stand merken, belegt = umschalten. Umschalt+Klick merkt neu.')),
      abschnitt('Als Kunden-Variante für die Pitch-Leiste',
        el('div', { class: 'zeile' }, el('span', { class: 'name' }, 'Quelle'), quelle),
        el('div', { class: 'zeile' }, el('span', { class: 'name' }, 'Gruppe'), gruppe),
        el('div', { class: 'zeile' }, el('span', { class: 'name' }, 'Nummer'), nr),
        el('div', { class: 'zeile' }, el('span', { class: 'name' }, 'Name'), name),
        el('div', { class: 'knopfreihe' }, el('button', { class: 'knopf primaer', onclick: schreiben }, icon('save'), 'In tokens.css schreiben')),
        ausgabe,
        el('div', { class: 'knopfreihe' }, el('button', { class: 'knopf klein', onclick: () => kopiere(ausgabe.value) }, icon('copy'), 'Kopieren')),
        el('p', { class: 'hinweis' }, 'Schreibt html.pw-v-<gruppe>-<nr> { --var: wert } in tokens.css. Nur Variablen, Buttons und Kopfzeile gehören zum Grundstand. Den site.ts-Eintrag übernimmst du (oder Claude) von Hand, das Token kommt aus Phase 8b.')),
    ];
  }

  async function kopiere(text) {
    try { await navigator.clipboard.writeText(text); zeigeMeldung('Kopiert.', 'erfolg'); }
    catch { zeigeMeldung('Kopieren ging nicht, bitte von Hand markieren.', 'fehler'); }
  }

  let meldungsTimer = null;
  function zeigeMeldung(text, art = '', ausblenden = true, extra = null) {
    clearTimeout(meldungsTimer);
    meldung = el('div', { class: `meldung ${art}` }, text, extra);
    zeichneReiter();
    if (ausblenden) meldungsTimer = setTimeout(() => { meldung = null; zeichneReiter(); }, 5000);
  }

  // ── text mode ──
  // Click a text, type, Enter or click elsewhere keeps it, Esc throws it away.
  // Preview only: the change goes to tweakbar-aenderungen.md, Claude applies it.
  let ausgewaehlterText = null;
  let textVarianten = null; // { schluessel, liste, index, laeuft, fehler }
  let textPruefEl = null;
  let textDuzt = false;

  const istTextmodus = () => document.documentElement.classList.contains('pw-tb-textmodus');
  const textElement = (schluessel) => (schluessel ? document.querySelector(`[data-pw-tb-text="${CSS.escape(schluessel)}"]`) : null);
  const istUeberschrift = (knoten) => /^H[1-6]$/.test(knoten?.tagName ?? '');

  function beschreibeText(knoten) {
    const text = normalisiereText(knoten.textContent);
    return `<${knoten.tagName.toLowerCase()}> "${text.length > 40 ? `${text.slice(0, 40)}...` : text}"`;
  }

  /** Original text of an element: from the stored state, or from its HTML before the first change. */
  function originalText(knoten) {
    const schluessel = knoten.dataset.pwTbText;
    if (zustand.texte?.[schluessel]) return zustand.texte[schluessel].alt;
    if (textOriginale.has(schluessel)) {
      const vorlage = document.createElement('template');
      vorlage.innerHTML = textOriginale.get(schluessel);
      return normalisiereText(vorlage.content.textContent);
    }
    return normalisiereText(knoten.textContent);
  }

  function setzeTextmodus(an, neuZeichnen = true) {
    if (an && document.documentElement.classList.contains('pw-tb-bildmodus')) setzeBildmodus(false);
    if (!an) beendeBearbeitung(true);
    document.documentElement.classList.toggle('pw-tb-textmodus', an);
    if (!an) document.querySelectorAll('[data-pw-tb-text-auswahl]').forEach((k) => k.removeAttribute('data-pw-tb-text-auswahl'));
    anwendenUeberall();
    if (neuZeichnen) zeichneReiter();
  }

  function textKlick(ereignis) {
    if (!istTextmodus()) return;
    if (ereignis.composedPath().includes(host)) return;
    // Links, buttons and forms must not act while text mode is on.
    ereignis.preventDefault();
    const knoten = ereignis.target instanceof Element ? ereignis.target.closest('[data-pw-tb-text]') : null;
    if (knoten === aktivesTextfeld && knoten) return; // caret placement inside the field
    ereignis.stopPropagation();
    if (knoten) starteBearbeitung(knoten);
  }

  function beiTextEingabe() {
    if (aktivesTextfeld) zeigeTextPruefung(normalisiereText(aktivesTextfeld.textContent), istUeberschrift(aktivesTextfeld));
  }
  function beiTextTaste(e) {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); beendeBearbeitung(true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); beendeBearbeitung(false); }
  }
  // Focus moving into the panel (a button there): no redraw, or the click would land on a replaced node.
  function beiTextVerlassen(e) { beendeBearbeitung(true, e.relatedTarget !== host); }

  function starteBearbeitung(knoten) {
    beendeBearbeitung(true);
    const schluessel = knoten.dataset.pwTbText;
    if (!textOriginale.has(schluessel)) textOriginale.set(schluessel, knoten.innerHTML);
    document.querySelectorAll('[data-pw-tb-text-auswahl]').forEach((k) => k.removeAttribute('data-pw-tb-text-auswahl'));
    knoten.setAttribute('data-pw-tb-text-auswahl', '');
    if (textVarianten?.schluessel !== schluessel) textVarianten = null;
    ausgewaehlterText = schluessel;
    aktivesTextfeld = knoten;
    knoten.setAttribute('contenteditable', 'plaintext-only');
    if (knoten.contentEditable !== 'plaintext-only') knoten.setAttribute('contenteditable', 'true');
    knoten.addEventListener('input', beiTextEingabe);
    knoten.addEventListener('keydown', beiTextTaste);
    knoten.addEventListener('blur', beiTextVerlassen);
    knoten.focus();
    ui.reiter = 'text';
    zeichneReiter();
  }

  /** End typing. behalten=false (Esc) restores the text from the state. */
  function beendeBearbeitung(behalten, neuZeichnen = true) {
    const knoten = aktivesTextfeld;
    if (!knoten) return;
    aktivesTextfeld = null;
    knoten.removeEventListener('input', beiTextEingabe);
    knoten.removeEventListener('keydown', beiTextTaste);
    knoten.removeEventListener('blur', beiTextVerlassen);
    knoten.removeAttribute('contenteditable');
    if (!behalten) { anwendenUeberall(); zeichneReiter(); return; }
    setzeText(knoten, normalisiereText(knoten.textContent), false, neuZeichnen);
    if (!neuZeichnen) zeigeTextPruefung(normalisiereText(knoten.textContent), istUeberschrift(knoten));
  }

  /** Store a text change (or drop it when it equals the original). */
  function setzeText(knoten, neu, ki, neuZeichnen = true) {
    const schluessel = knoten.dataset.pwTbText;
    const alt = originalText(knoten);
    if (!neu && !alt) return;
    aendere((z) => {
      z.texte ??= {};
      if (neu === alt) delete z.texte[schluessel];
      else z.texte[schluessel] = { alt, neu, datei: quelleVon(knoten), element: `<${knoten.tagName.toLowerCase()}>`, ...(ki || z.texte[schluessel]?.ki ? { ki: true } : {}) };
    }, { neuZeichnen });
  }

  function pruefListe(text, ueberschrift) {
    const ergebnis = pruefeText(text, { ueberschrift });
    return el('div', { class: 'pruefliste' },
      el('span', { class: 'hinweis' }, `${ergebnis.zeichen} Zeichen, ${ergebnis.woerter} Wörter`),
      ergebnis.hinweise.map((h) => el('p', { class: h.art === 'warnung' ? 'warnung' : 'hinweis' }, h.text)));
  }
  function zeigeTextPruefung(text, ueberschrift) {
    if (textPruefEl) textPruefEl.replaceChildren(pruefListe(text, ueberschrift));
  }

  async function umschreibenAnfragen(knoten, art, anweisung) {
    const schluessel = knoten.dataset.pwTbText;
    textVarianten = { schluessel, liste: [], index: 0, laeuft: true, fehler: null };
    zeichneReiter();
    const sektion = knoten.closest('[data-pw-tb-sektion]');
    const ueberschrift = sektion?.querySelector('h1, h2, h3')?.textContent ?? '';
    try {
      const antwort = await holeJson('umschreiben', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: normalisiereText(knoten.textContent), art, anweisung, du: textDuzt,
          kontext: { seite: document.title, ueberschrift: normalisiereText(ueberschrift), element: knoten.tagName.toLowerCase() },
        }),
      });
      if (textVarianten?.schluessel === schluessel) textVarianten = { schluessel, liste: antwort.varianten, index: 0, laeuft: false, fehler: null };
    } catch (fehler) {
      if (textVarianten?.schluessel === schluessel) textVarianten = { schluessel, liste: [], index: 0, laeuft: false, fehler: fehler.message };
    }
    if (ui.reiter === 'text') zeichneReiter();
  }

  function reiterText() {
    const an = istTextmodus();
    const teile = [abschnitt('Textmodus',
      el('div', { class: 'knopfreihe' }, el('button', { class: `knopf${an ? ' primaer' : ''}`, onclick: () => setzeTextmodus(!an) }, icon('text-cursor-input'), an ? 'Textmodus aus' : 'Textmodus an')),
      el('p', { class: 'hinweis' }, an
        ? 'Text auf der Seite anklicken und tippen. Enter oder Klick daneben übernimmt, Esc verwirft. Links und Buttons reagieren im Textmodus nicht.'
        : 'Im Textmodus änderst du Überschriften, Absätze, Links und Buttons direkt auf der Seite. Nur Vorschau, beim Speichern landet die Liste in tweakbar-aenderungen.md.'))];

    const knoten = textElement(ausgewaehlterText);
    textPruefEl = null;
    if (knoten) {
      const aktuell = normalisiereText(knoten.textContent);
      const eintrag = zustand.texte?.[ausgewaehlterText];
      textPruefEl = el('div', {}, pruefListe(aktuell, istUeberschrift(knoten)));
      const laeuft = textVarianten?.schluessel === ausgewaehlterText && textVarianten.laeuft;
      const frei = el('input', { class: 'feld', type: 'text', placeholder: 'Eigene Anweisung, z. B. mehr Fokus auf Notdienst', 'aria-label': 'Eigene Anweisung', style: 'flex:1' });
      const los = (art, anweisung) => umschreibenAnfragen(knoten, art, anweisung);
      frei.addEventListener('keydown', (e) => { if (e.key === 'Enter' && frei.value.trim()) los('frei', frei.value.trim()); });
      const v = textVarianten?.schluessel === ausgewaehlterText ? textVarianten : null;
      let variantenTeil = null;
      if (v?.laeuft) variantenTeil = el('p', { class: 'hinweis' }, 'Gemini schreibt drei Fassungen ...');
      else if (v?.fehler) variantenTeil = el('p', { class: 'warnung' }, `Umschreiben ging nicht: ${v.fehler}`);
      else if (v?.liste.length) {
        const fassung = v.liste[v.index];
        const blaettern = (schritt) => { v.index = (v.index + schritt + v.liste.length) % v.liste.length; zeichneReiter(); };
        variantenTeil = el('div', { class: 'variante' },
          el('div', { class: 'zeile' },
            el('button', { class: 'symbol', title: 'Vorige Fassung', 'aria-label': 'Vorige Fassung', onclick: () => blaettern(-1) }, icon('chevron-left')),
            el('span', { class: 'name' }, `Fassung ${v.index + 1} von ${v.liste.length}`),
            el('button', { class: 'symbol', title: 'Nächste Fassung', 'aria-label': 'Nächste Fassung', onclick: () => blaettern(1) }, icon('chevron-right'))),
          el('div', { class: 'textvorschau' }, fassung),
          pruefListe(fassung, istUeberschrift(knoten)),
          el('div', { class: 'knopfreihe' }, el('button', { class: 'knopf klein primaer', onclick: () => setzeText(knoten, normalisiereText(fassung), true) }, icon('check'), 'Übernehmen')));
      }
      teile.push(abschnitt('Ausgewählt',
        el('p', { class: 'hinweis' }, `${beschreibeText(knoten)} · ${quelleVon(knoten)}`),
        eintrag ? el('p', { class: 'hinweis' }, `Original: ${eintrag.alt}`) : null,
        textPruefEl,
        eintrag ? el('button', { class: 'knopf klein', onclick: () => aendere((z) => { delete z.texte[ausgewaehlterText]; }, { neuZeichnen: true }) }, icon('rotate-ccw'), 'Original wiederherstellen') : null),
      abschnitt('Umschreiben (Gemini)',
        el('div', { class: 'knopfreihe' },
          [['kuerzer', 'Kürzer', 'scissors'], ['waermer', 'Wärmer', 'flame'], ['konkreter', 'Konkreter', 'target']].map(([art, name, ic]) => el('button', { class: 'knopf klein', disabled: laeuft, onclick: () => los(art) }, icon(ic), name))),
        el('div', { class: 'zeile' }, frei, el('button', { class: 'knopf klein', disabled: laeuft, onclick: () => { if (frei.value.trim()) los('frei', frei.value.trim()); } }, icon('wand-sparkles'), 'Los')),
        el('label', { class: 'zeile' }, el('input', { type: 'checkbox', checked: textDuzt, onchange: (e) => { textDuzt = e.target.checked; } }), el('span', { class: 'name' }, 'Die Seite duzt ihre Kundschaft')),
        variantenTeil,
        el('p', { class: 'hinweis' }, 'Wörtliche Formulierungen des Kunden nicht durch Gemini schicken. Die Fassungen kommen von Gemini (texten.py), das gegenüber dem Kunden offenlegen.')));
    } else if (an) {
      teile.push(el('p', { class: 'hinweis' }, 'Noch kein Text ausgewählt.'));
    }

    const geaendert = Object.entries(zustand.texte ?? {});
    if (geaendert.length) {
      teile.push(abschnitt(`Geänderte Texte (${geaendert.length})`, geaendert.map(([schluessel, e]) => el('div', { class: 'textaenderung' },
        el('div', { class: 'zeile' },
          el('span', { class: 'name', title: e.datei }, `${e.element} · ${e.datei}`),
          el('button', { class: 'symbol', title: 'Änderung verwerfen', 'aria-label': 'Änderung verwerfen', onclick: () => aendere((z) => { delete z.texte[schluessel]; }, { neuZeichnen: true }) }, icon('x'))),
        el('p', { class: 'hinweis' }, `${e.alt} → ${e.neu}`)))));
    }
    return teile;
  }

  // ── reference: logo colors (browser) and screenshot analysis (Gemini) ──
  let referenz = { farben: [], primary: null, akzent: null, vorschlag: null, schrift: null, laeuft: false, fehler: null, logoUrl: null, bildUrl: null };

  async function ladeBild(datei) {
    const url = URL.createObjectURL(datei);
    const bild = new Image();
    bild.src = url;
    await bild.decode();
    return { bild, url };
  }

  function zeichneAufCanvas(bild, maxKante) {
    const breite = bild.naturalWidth || 160, hoehe = bild.naturalHeight || 160;
    const faktor = Math.min(1, maxKante / Math.max(breite, hoehe));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(breite * faktor));
    canvas.height = Math.max(1, Math.round(hoehe * faktor));
    canvas.getContext('2d').drawImage(bild, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async function logoAnalysieren(datei) {
    if (!datei || !/^image\//.test(datei.type)) { zeigeMeldung('Bitte eine Bilddatei wählen.', 'fehler'); return; }
    try {
      const { bild, url } = await ladeBild(datei);
      const canvas = zeichneAufCanvas(bild, 160);
      const pixel = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      if (referenz.logoUrl) URL.revokeObjectURL(referenz.logoUrl);
      const farben = dominanteFarben(pixel, { anzahl: 6 });
      const wahl = primaerAus(farben);
      referenz = { ...referenz, farben, primary: wahl.primary, akzent: wahl.akzent, logoUrl: url };
    } catch (fehler) {
      zeigeMeldung(`Bild nicht lesbar: ${fehler instanceof Error ? fehler.message : fehler}`, 'fehler');
    }
    zeichneReiter();
  }

  async function screenshotAnalysieren(datei) {
    if (!datei || !/^image\/(png|jpeg|webp)$/.test(datei.type)) { zeigeMeldung('Screenshot bitte als PNG, JPG oder WebP.', 'fehler'); return; }
    if (datei.size > 6 * 1024 * 1024) { zeigeMeldung('Screenshot ist größer als 6 MB.', 'fehler'); return; }
    if (referenz.bildUrl) URL.revokeObjectURL(referenz.bildUrl);
    referenz = { ...referenz, laeuft: true, fehler: null, vorschlag: null, bildUrl: URL.createObjectURL(datei) };
    zeichneReiter();
    try {
      // Shrink to 1600 px as JPEG: same result, fewer tokens.
      let inhalt = datei;
      try {
        const { bild, url } = await ladeBild(datei);
        URL.revokeObjectURL(url);
        const canvas = zeichneAufCanvas(bild, 1600);
        inhalt = await new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? datei), 'image/jpeg', 0.85));
      } catch { inhalt = datei; }
      const antwort = await holeJson('referenz', { method: 'POST', headers: { 'Content-Type': inhalt.type || datei.type }, body: inhalt });
      referenz = { ...referenz, laeuft: false, vorschlag: antwort.vorschlag, schrift: antwort.vorschlag.schrift.naechsteAusListe[0] ?? null };
    } catch (fehler) {
      referenz = { ...referenz, laeuft: false, fehler: fehler.message };
    }
    if (ui.reiter === 'referenz') zeichneReiter();
  }

  function ablage(titel, beiDatei) {
    const eingabe = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif', hidden: true, onchange: (e) => beiDatei(e.target.files?.[0]) });
    const flaeche = el('label', { class: 'ablage' }, icon('upload'), el('span', {}, titel), eingabe);
    flaeche.addEventListener('dragover', (e) => { e.preventDefault(); flaeche.classList.add('ueber'); });
    flaeche.addEventListener('dragleave', () => flaeche.classList.remove('ueber'));
    flaeche.addEventListener('drop', (e) => { e.preventDefault(); flaeche.classList.remove('ueber'); beiDatei(e.dataTransfer?.files?.[0]); });
    return flaeche;
  }

  const farbFeld = (farbe, titel, aktiv, onclick) => el('button', {
    class: `farbfeld${aktiv ? ' aktiv' : ''}`, title: titel, 'aria-label': titel, style: `background:${farbe}`, onclick,
  });

  function reiterReferenz() {
    const r = referenz;
    const teile = [];
    teile.push(abschnitt('Logo oder Foto (kostenlos)',
      ablage('Logo oder Foto ablegen oder wählen', logoAnalysieren),
      r.logoUrl ? el('img', { class: 'vorschaubild', src: r.logoUrl, alt: '' }) : null,
      r.farben.length ? el('div', { class: 'farbfelder' }, r.farben.map((f) => el('div', { class: 'farbspalte' },
        farbFeld(f.hex, `${f.hex}: Klick = Primär, Umschalt+Klick = Akzent`, f.hex === r.primary || f.hex === r.akzent, (e) => {
          if (e.shiftKey) referenz.akzent = referenz.akzent === f.hex ? null : f.hex; else referenz.primary = f.hex;
          zeichneReiter();
        }),
        el('small', {}, `${f.hex === r.primary ? 'Primär ' : f.hex === r.akzent ? 'Akzent ' : ''}${Math.round(f.anteil * 100)} %`)))) : null,
      r.farben.length ? el('div', { class: 'knopfreihe' },
        el('button', { class: 'knopf', disabled: !r.primary, onclick: () => aendere((z) => paletteIn(z, paletteAus(r.primary, { akzent: r.akzent })), { neuZeichnen: true }) }, icon('wand-sparkles'), 'Als Palette übernehmen')) : null,
      el('p', { class: 'hinweis' }, 'Farben werden im Browser ausgelesen, nichts verlässt den Rechner. Klick wählt die Primärfarbe, Umschalt+Klick die Akzentfarbe. Ohne Akzent wird einer abgeleitet.')));

    const v = r.vorschlag;
    const gruppe = (titel, inhalt, beiUebernahme) => el('div', { class: 'vorschlag' },
      el('div', { class: 'zeile' }, el('b', { class: 'name' }, titel), el('button', { class: 'knopf klein', onclick: () => aendere((z) => beiUebernahme(z), { neuZeichnen: true }) }, 'Übernehmen')),
      inhalt);
    const ja = (w) => (w ? 'ja' : 'nein');
    teile.push(abschnitt('Website-Screenshot (Gemini)',
      ablage('Screenshot ablegen oder wählen', screenshotAnalysieren),
      r.bildUrl ? el('img', { class: 'vorschaubild', src: r.bildUrl, alt: '' }) : null,
      r.laeuft ? el('p', { class: 'hinweis' }, 'Gemini liest den Screenshot ...') : null,
      r.fehler ? el('p', { class: 'warnung' }, `Analyse ging nicht: ${r.fehler}`) : null,
      v ? [
        gruppe('Farben', el('div', { class: 'farbfelder' }, [['primary', 'Primär'], ['accent', 'Akzent'], ['bg', 'Hintergrund'], ['text', 'Text']].map(([k, n]) => el('div', { class: 'farbspalte' },
          v.farben[k] ? farbFeld(v.farben[k], `${n}: ${v.farben[k]}`, false, null) : el('span', { class: 'hinweis' }, '?'), el('small', {}, n)))), (z) => farbenIn(z, v.farben)),
        gruppe('Buttons', [
          el('p', { class: 'hinweis' }, `${{ gefuellt: 'Gefüllt', kontur: 'Kontur', unterstrichen: 'Unterstrichen' }[v.button.art]}, ${{ standard: 'Standard', pille: 'Pille', eckig: 'Eckig' }[v.button.form]}, Radius ${v.button.radiusPx} px, Pfeil ${ja(v.button.pfeil)}, Größe ${Math.round(v.button.groesse * 100)} %`),
          v.button.form === 'pille' ? el('p', { class: 'warnung' }, 'Pillenförmige Buttons sind ein verbotener Default, nur mit Markengrund.') : null,
        ], (z) => buttonsIn(z, v.button)),
        gruppe('Schrift', [
          el('p', { class: 'hinweis' }, `Überschriften ${v.schrift.displayKategorie}, Gewicht ${v.schrift.gewicht}, Laufweite ${v.schrift.laufweite}em`),
          v.schrift.naechsteAusListe.length
            ? chips(v.schrift.naechsteAusListe.map((id) => [id, KURATIERT.find((f) => f.id === id)?.family ?? id]), r.schrift, (id) => { referenz.schrift = id; zeichneReiter(); })
            : el('p', { class: 'hinweis' }, 'Keine passende Schrift aus der Liste, nur Gewicht und Laufweite.'),
        ], (z) => schriftIn(z, v.schrift, r.schrift)),
        gruppe('Form', el('p', { class: 'hinweis' }, `Radius ${v.form.radiusPx} px, Schatten ${v.form.schatten}, Linien ${v.form.linien} px, Dichte ${Math.round(v.form.dichte * 100)} %`), (z) => formIn(z, v.form)),
        el('div', { class: 'knopfreihe' }, el('button', { class: 'knopf primaer', onclick: () => aendere((z) => {
          farbenIn(z, v.farben); buttonsIn(z, v.button); schriftIn(z, v.schrift, r.schrift); formIn(z, v.form);
        }, { neuZeichnen: true }) }, icon('check-check'), 'Alles übernehmen')),
      ] : null,
      el('p', { class: 'hinweis' }, 'Schickt den Screenshot an Gemini (gemini-2.5-flash), kostet unter 1 Cent. Liest Farben, Buttons, Schrift und Form ab. Jede Übernahme ist ein Schritt, Strg+Z geht zurück.')));
    return teile;
  }

  // ── AI image for the selected picture ──
  let kiLaeuft = false;
  let kiBeschreibung = '';

  function kiBildAbschnitt(bild, setzeEintrag) {
    const feld = el('textarea', { class: 'feld kibeschreibung', rows: 3, placeholder: 'z. B. Handwerker montiert ein Holzfenster in einem Altbau, Morgenlicht', 'aria-label': 'Motiv beschreiben', value: kiBeschreibung });
    feld.addEventListener('input', () => { kiBeschreibung = feld.value; });
    const erzeugen = async () => {
      const beschreibung = feld.value.trim();
      if (beschreibung.length < 5) { zeigeMeldung('Bitte das Motiv in ein paar Worten beschreiben.', 'fehler'); return; }
      const rect = bild.getBoundingClientRect();
      const breite = rect.width || bild.naturalWidth, hoehe = rect.height || bild.naturalHeight;
      const schluessel = bild.dataset.pwTbBild;
      kiLaeuft = true;
      zeichneReiter();
      try {
        const antwort = await holeJson('ki-bild', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ beschreibung, breite, hoehe }),
        });
        kiLaeuft = false;
        bilderListe = null; // the new file shows up in the list
        if (ausgewaehltesBild === schluessel) setzeEintrag((e) => { e.src = antwort.pfad; e.ki = beschreibung; });
        else aendere((z) => { z.bilder[schluessel] = { ...(z.bilder[schluessel] ?? {}), src: antwort.pfad, ki: beschreibung }; }, { neuZeichnen: true });
        zeigeMeldung(`KI-Bild gespeichert: public${antwort.pfad} (${antwort.verhaeltnis}).`, 'erfolg');
      } catch (fehler) {
        kiLaeuft = false;
        zeigeMeldung(`KI-Bild ging nicht: ${fehler.message}`, 'fehler', false);
      }
    };
    return el('div', {},
      el('h3', { style: 'margin-top:10px' }, 'KI-Bild (Gemini)'),
      feld,
      el('div', { class: 'knopfreihe' }, el('button', { class: 'knopf klein', disabled: kiLaeuft, onclick: erzeugen }, icon(kiLaeuft ? 'loader-circle' : 'image-plus'), kiLaeuft ? 'Wird erzeugt ...' : 'Motiv erzeugen')),
      el('p', { class: 'hinweis' }, 'Kostet etwa 3 bis 4 Cent je Bild (gemini-2.5-flash-image). Format passt sich dem Bildausschnitt an. Landet in public/images/ki/, nicht genutzte Bilder wieder löschen. KI-Bilder auf der Kundenseite kennzeichnen.'));
  }

  // ── before/after: saved state left, current state right ──
  let vergleich = null;

  function setzeVergleich(an) {
    if (vergleich) { vergleich.abbau(); vergleich = null; }
    if (an) {
      if (zustand.ansicht.geraet !== 'desktop') setzeGeraet('desktop');
      if (istTextmodus()) setzeTextmodus(false, false);
      if (document.documentElement.classList.contains('pw-tb-bildmodus')) setzeBildmodus(false);
      const url = new URL(location.href);
      url.searchParams.set('tweakbar-rahmen', '1');
      // The frame never receives a state, so it shows exactly what tokens.css holds.
      const rahmen = el('iframe', { src: url.href, title: 'Vorher: gespeicherter Stand', tabindex: '-1', class: 'vergleich-rahmen' });
      const teiler = el('div', { class: 'vergleich-teiler', title: 'Ziehen' }, el('span', { class: 'griff' }, icon('columns-2')));
      const links = el('div', { class: 'vergleich-marke links' }, 'Vorher (gespeichert)');
      const rechts = el('div', { class: 'vergleich-marke rechts' }, 'Nachher (jetzt)');
      const flaeche = el('div', { class: 'vergleich' }, rahmen, teiler, links, rechts);
      wurzelEl.insertBefore(flaeche, panelEl);
      let x = Math.round(window.innerWidth / 2);
      const setze = () => {
        const breite = document.documentElement.clientWidth;
        x = Math.max(0, Math.min(breite, x));
        rahmen.style.width = `${breite}px`;
        rahmen.style.clipPath = `inset(0 ${breite - x}px 0 0)`;
        teiler.style.left = `${x}px`;
      };
      const synchron = () => { try { rahmen.contentWindow?.scrollTo(window.scrollX, window.scrollY); } catch { /* frame not ready */ } };
      rahmen.addEventListener('load', () => {
        try {
          const stilEl = rahmen.contentDocument.createElement('style');
          stilEl.textContent = 'html { scrollbar-width: none; } html::-webkit-scrollbar { display: none; }';
          rahmen.contentDocument.head.appendChild(stilEl);
        } catch { /* same origin, should not fail */ }
        synchron();
        setTimeout(synchron, 300);
      });
      teiler.addEventListener('pointerdown', (start) => {
        start.preventDefault();
        teiler.setPointerCapture(start.pointerId);
        const bewegen = (e) => { x = e.clientX; setze(); };
        teiler.addEventListener('pointermove', bewegen);
        teiler.addEventListener('pointerup', () => teiler.removeEventListener('pointermove', bewegen), { once: true });
      });
      window.addEventListener('scroll', synchron, { passive: true });
      window.addEventListener('resize', setze);
      setze();
      vergleich = {
        abbau: () => {
          window.removeEventListener('scroll', synchron);
          window.removeEventListener('resize', setze);
          flaeche.remove();
        },
      };
    }
    zeichneReiter();
  }

  // ── readability: outline texts below the WCAG threshold ──
  let lesbarAnzahl = null;
  let lesbarEl = null;
  let lesbarTimer = null;

  const lesbarText = () => (lesbarAnzahl == null
    ? 'Prüfe ...'
    : `${lesbarAnzahl} Textstelle(n) unter der WCAG-Grenze (4,5:1, große Schrift 3:1), rot gestrichelt. Text auf Bildern oder Verläufen wird übersprungen.`);

  function planeLesbarkeit() {
    clearTimeout(lesbarTimer);
    lesbarTimer = setTimeout(pruefeLesbarkeit, 250);
  }

  function pruefeLesbarkeit() {
    document.querySelectorAll('[data-pw-tb-lesbar]').forEach((k) => k.removeAttribute('data-pw-tb-lesbar'));
    if (!zustand.ansicht.lesbarkeit) { lesbarAnzahl = null; return; }
    const medienCache = new Map();
    // Media positioned behind text (hero images): background unknown, skip.
    const hatMedienDahinter = (k) => {
      if (!medienCache.has(k)) {
        medienCache.set(k, Array.from(k.querySelectorAll(':scope > img, :scope > picture, :scope > video, :scope > * > img, :scope > * > video'))
          .some((m) => ['absolute', 'fixed'].includes(getComputedStyle(m).position) || ['absolute', 'fixed'].includes(getComputedStyle(m.parentElement).position)));
      }
      return medienCache.get(k);
    };
    const hintergrund = (knoten) => {
      const schichten = [];
      for (let k = knoten; k && k.nodeType === 1; k = k.parentElement) {
        const stil = getComputedStyle(k);
        if (stil.backgroundImage && stil.backgroundImage !== 'none') return null;
        if (k !== knoten && hatMedienDahinter(k)) return null;
        const rgb = parseFarbe(stil.backgroundColor);
        const alpha = alphaVon(stil.backgroundColor);
        if (rgb && alpha > 0) {
          schichten.push({ rgb, alpha });
          if (alpha >= 1) break;
        }
      }
      let farbe = { r: 255, g: 255, b: 255 };
      for (let i = schichten.length - 1; i >= 0; i -= 1) farbe = mische(schichten[i].rgb, schichten[i].alpha, farbe);
      return farbe;
    };
    let anzahl = 0;
    document.querySelectorAll('[data-pw-tb-text]').forEach((knoten) => {
      if (!hatEigenenText(knoten) || !knoten.getClientRects().length) return;
      const stil = getComputedStyle(knoten);
      if (stil.visibility === 'hidden') return;
      const vorne = parseFarbe(stil.color);
      const alpha = alphaVon(stil.color);
      if (!vorne || alpha == null) return; // e.g. color(display-p3 ...)
      const hinten = hintergrund(knoten);
      if (!hinten) return;
      const wert = kontrast(mische(vorne, alpha, hinten), hinten);
      if (wert != null && wert < lesbarGrenze(parseFloat(stil.fontSize), stil.fontWeight)) {
        knoten.setAttribute('data-pw-tb-lesbar', String(wert));
        anzahl += 1;
      }
    });
    lesbarAnzahl = anzahl;
    if (lesbarEl?.isConnected) lesbarEl.textContent = lesbarText();
  }

  // ── change list for .astro files ──
  function aenderungsListe(z = zustand) {
    const liste = [];
    for (const [schluessel, eintrag] of Object.entries(z.bilder)) {
      const bild = bildElement(schluessel);
      const datei = quelleVon(bild);
      const element = beschreibe(bild) || schluessel;
      if (eintrag.src) {
        liste.push(eintrag.ki
          ? { art: 'KI-Bild tauschen', datei, element, alt: bild?.dataset.pwTbSrc ?? '', neu: eintrag.src, hinweis: `KI-Bild (Gemini), Kennzeichnung prüfen. Motiv: ${eintrag.ki}. Bei <Image /> den Import umstellen, alt-Text neu schreiben. Nicht genutzte Dateien in public/images/ki/ löschen.` }
          : { art: 'Bild tauschen', datei, element, alt: bild?.dataset.pwTbSrc ?? '', neu: eintrag.src, hinweis: 'Bei <Image /> aus astro:assets den Import auf die neue Datei umstellen, alt-Text prüfen.' });
      }
      if (eintrag.position) liste.push({ art: 'Bildmittelpunkt', datei, element, alt: '', neu: `object-position: ${eintrag.position};` });
      if (eintrag.filter) liste.push({ art: 'Bildfilter', datei, element, alt: '', neu: `filter: ${eintrag.filter === 'grau' ? 'grayscale(1)' : duotonFilter(effektiv('--c-primary', z))};` });
    }
    for (const eintrag of Object.values(z.texte ?? {})) {
      liste.push({
        art: 'Text', datei: eintrag.datei, element: eintrag.element, alt: eintrag.alt, neu: eintrag.neu,
        hinweis: `${eintrag.ki ? 'Formuliert mit Gemini (texten.py), Autorschaft gegenüber dem Kunden offenlegen. ' : ''}Steht der Text nicht wörtlich in der Datei, kommt er aus src/config/site.ts oder einer Inhaltsdatei.`,
      });
    }
    if (z.hero.abdunkeln) {
      const hero = heroElement();
      liste.push({ art: 'Hero abdunkeln', datei: quelleVon(hero), element: beschreibe(hero), alt: '', neu: `Bild/Video im Hero: filter: brightness(${runde(1 - z.hero.abdunkeln, 2)});`, hinweis: 'Oder als Overlay mit rgba(0,0,0,' + z.hero.abdunkeln + '), Textkontrast danach prüfen.' });
    }
    const elemente = sektionsListe();
    const original = [...elemente].sort((a, b) => Number(a.dataset.pwTbOrdnung ?? 0) - Number(b.dataset.pwTbOrdnung ?? 0)).map((e) => e.dataset.pwTbSektion);
    if (z.sektionen.reihenfolge && z.sektionen.reihenfolge.join() !== original.join()) {
      liste.push({ art: 'Sektionen umstellen', datei: quelleVon(document.querySelector('main')), element: '<main>', alt: original.join(' > '), neu: z.sektionen.reihenfolge.join(' > ') });
    }
    for (const s of z.sektionen.versteckt) {
      const sek = sektionElement(s);
      liste.push({ art: 'Sektion entfernen', datei: quelleVon(sek), element: beschreibe(sek) || s, alt: 'sichtbar', neu: 'entfernen oder auskommentieren' });
    }
    for (const [s, hg] of Object.entries(z.sektionen.hintergrund)) {
      const sek = sektionElement(s);
      liste.push({ art: 'Sektion-Hintergrund', datei: quelleVon(sek), element: beschreibe(sek) || s, alt: '', neu: hg === 'surface' ? 'class="bg-surface"' : `background-color: var(--c-${hg});${hg === 'primary' ? ' color: var(--c-white);' : ''}` });
    }
    for (const [s, a] of Object.entries(z.sektionen.ausrichtung)) {
      const sek = sektionElement(s);
      liste.push({ art: 'Sektion-Ausrichtung', datei: quelleVon(sek), element: beschreibe(sek) || s, alt: '', neu: a === 'mitte' ? 'text-align: center;' : 'text-align: left;' });
    }
    return liste;
  }

  // ── save / reset ──
  let gespeicherteRegeln = normalisiere(STANDARD);

  async function ladeBasis() {
    const antwort = await holeJson('zustand');
    basis = antwort.vars ?? {};
    gespeicherteRegeln = normalisiere(antwort.regeln ?? STANDARD);
    return antwort;
  }

  async function speichern() {
    const vars = { ...zustand.vars };
    if (zustand.fonts.display) delete vars['--font-display'];
    if (zustand.fonts.body) delete vars['--font-body'];
    const aenderungen = aenderungsListe();
    zeigeMeldung('Speichere ...', '', false);
    try {
      const antwort = await holeJson('save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vars, regeln: zustand.regeln, fonts: { display: zustand.fonts.display, body: zustand.fonts.body }, aenderungen }),
      });
      const zeilen = [];
      zeilen.push(antwort.geaendert ? `tokens.css gespeichert (${antwort.variablen.length} Variablen), Sicherung: tokens.css.bak-tweakbar.` : 'tokens.css unverändert.');
      for (const f of antwort.fonts) zeilen.push(`${f.familie}: ${f.dateien.length} Datei(en) nach public/fonts/ (${f.variabel ? 'variabel' : 'statisch'}). Preload in BaseLayout.astro anpassen.`);
      if (antwort.aenderungenDatei) zeilen.push(`${aenderungen.length} Quelltext-Änderung(en) in ${antwort.aenderungenDatei}, bitte Claude übernehmen lassen.`);
      const extra = antwort.aenderungenText
        ? el('div', {}, el('textarea', { class: 'ausgabe', readOnly: true, value: antwort.aenderungenText }), el('button', { class: 'knopf klein', onclick: () => kopiere(antwort.aenderungenText) }, icon('copy'), 'Liste kopieren'))
        : null;
      // Give Vite a moment to hot-reload tokens.css before the inline overrides go.
      setTimeout(async () => {
        try { await ladeBasis(); } catch (fehler) { console.warn('[Tweakbar]', fehler); }
        zustand.vars = {};
        zustand.fonts = { display: null, body: null };
        zustand.regler = {};
        anwendenUeberall();
        merkeVerlauf();
        zeigeMeldung(zeilen.join('\n'), 'erfolg', false, extra);
      }, 700);
    } catch (fehler) {
      zeigeMeldung(`Nicht gespeichert: ${fehler.message}`, 'fehler', false);
    }
  }

  function zuruecksetzen() {
    if (!window.confirm('Alle ungespeicherten Änderungen verwerfen?')) return;
    const ansicht = zustand.ansicht;
    zustand = leererZustand(gespeicherteRegeln);
    zustand.ansicht = ansicht;
    ausgewaehltesBild = null;
    textVarianten = null;
    anwendenUeberall();
    merkeVerlauf();
    zeichneReiter();
  }

  // ── keyboard ──
  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 't' || e.key === 'T' || e.code === 'KeyT')) {
      e.preventDefault();
      zeigePanel(wurzelEl.hidden);
      if (wurzelEl.hidden) stoppeAuto();
      return;
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'w' || e.key === 'W' || e.code === 'KeyW') && !wurzelEl.hidden) {
      e.preventDefault();
      stoppeAuto();
      wuerfeln();
      return;
    }
    if (e.key === 'Escape' && autoTimer) { stoppeAuto(); return; }
    if (e.key === 'Escape' && vergleich) { setzeVergleich(false); return; }
    const imPanel = e.composedPath().includes(host);
    if (imPanel && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      const ziel = e.composedPath()[0];
      if (ziel instanceof HTMLInputElement && ziel.type === 'text') return;
      e.preventDefault();
      if (e.shiftKey) wiederholen(); else rueckgaengig();
    }
  });
  window.addEventListener('resize', () => panelEl && positioniere());

  // ── start ──
  async function start() {
    document.body.appendChild(host);
    await ladeIcons();
    try {
      await ladeBasis();
    } catch (fehler) {
      wurzelEl.replaceChildren(el('div', { class: 'panel', style: 'right:16px;top:16px' }, el('div', { class: 'meldung fehler' }, `Tweakbar: ${fehler.message}`)));
      return;
    }
    markiereSeite();
    await sammleQuellen();
    const gemerkt = lies('zustand', null);
    zustand = leererZustand(gespeicherteRegeln);
    if (gemerkt && typeof gemerkt === 'object') {
      // Drop variables the file no longer knows.
      zustand = { ...zustand, ...gemerkt, regeln: normalisiere(gemerkt.regeln ?? gespeicherteRegeln) };
      zustand.vars = Object.fromEntries(Object.entries(zustand.vars ?? {}).filter(([n]) => n in basis));
      zustand.ansicht = { ...leererZustand().ansicht, ...(gemerkt.ansicht ?? {}) };
    }
    verlauf = [JSON.stringify(zustand)];
    baueGeruest();
    zeigePanel(ui.offen !== false);
    anwendenUeberall();
    if (zustand.ansicht.raster) setzeRaster(true);
    if (zustand.ansicht.geraet !== 'desktop') setzeGeraet(zustand.ansicht.geraet);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
