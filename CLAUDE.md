# [FIRMENNAME] — Website

## Kontext
- **Kunde:** [Name], [Branche], [Standort]
- **Agentur:** PortaWerk (portawerk.de)
- **Stack:** Astro 7 (static) · Cloudflare Workers mit Static Assets · CSS Custom Properties · [Fonts] (self-hosted) · Kontaktformular als `/api/kontakt` im selben Worker (Brevo) · Pirsch Analytics
  - *Kein Tailwind / Supabase / Resend / Vercel / Umami / Plausible / Cloudflare Web Analytics.*

## Design
- **Stimmung:** [aus PRB]
- **Display Font:** [Name] (lokal, `public/fonts/`)
- **Body Font:** [Name] (lokal, `public/fonts/`)
- **Primary:** [Hex] · **Accent:** [Hex] · **Bg:** [Hex]

## Architektur — zwei Schichten
- **Fundament (fest, wird geforkt):** BaseLayout, Seo, LocalBusiness, Header, Footer, Section, ContactForm, TwoClickEmbed, CookieConsent, tokens.css, site.ts. Nicht pro Kunde neu erfinden.
- **Haut (frei pro Kunde):** Hero + Content-Sektionen. Frei gestalten; Extraktion in die Toolkit-Bibliothek erst nach der Drittel-Regel (erst beim dritten ähnlichen Fall).

## Regeln
- Theme = `src/config/tokens.css`, Kundendaten = `src/config/site.ts` — keine Hardcodes in Komponenten
- Mobile First, `clamp()` für Typo + Spacing, nur `min-width`-Breakpoints
- Hover = Mehr (additiv: heller/lift/glow — nie abschwächend)
- DSGVO: keine externen Dienste ohne 2-Klick (`TwoClickEmbed`); Fonts nur lokal
- Bilder: `<Image />` aus `astro:assets`, immer `alt`
- JS nur für: IntersectionObserver, Kontaktformular, Menü-Toggle
- Genau eine `<h1>` pro Seite
- **Inhalte nie allein per JS einblenden.** `.animate-on-scroll` greift nur unter `html.js`, damit ohne JavaScript nichts unsichtbar stehen bleibt.
- **Icons immer aus dem Lucide-Set**, nie selbst als SVG zeichnen: `npm i lucide-astro`, dann `import Wifi from 'lucide-astro/Wifi'` (ohne `.astro`-Endung, sonst bricht der Build). Rendert als Inline-SVG, lädt nichts nach.

## Analytics
Pirsch (Emvi Software GmbH, gehostet in Deutschland), cookielos und ohne Einwilligungspflicht. Einbau über `src/components/Analytics.astro`, der Identifikationscode kommt aus `PUBLIC_PIRSCH_CODE` in `.env`. Fehlt die Variable, wird nichts gerendert und der Build warnt laut. So bleiben Pitch-Vorschauen auf portawerk.de-Subdomains ohne Zählung; beim Deliver wird die Kundendomain in Pirsch angelegt und der Code eingetragen (lokal und in den Cloudflare-Build-Variablen).

**Event-Standard** (`src/lib/tracking.ts`, zwischen Projekten unverändert kopiert): `Anruf`, `WhatsApp`, `Mail`, `Formular`, `Route`, `Termin`. Bestehende Links bekommen `class={evt(EVENTS.ANRUF)}`, neue Links nutzen `TrackedLink`. Formular-Weiterleitung über `trackThenGo()`. CSP in `public/_headers` erlaubt `https://api.pirsch.io` in script-src und connect-src; wird die CSP auch im Worker gesetzt, dort ebenfalls.

## Hosting
Cloudflare Worker mit Static Assets (`wrangler.jsonc`), **nicht** Cloudflare Pages. Pages wird von Cloudflare nur noch gepflegt.

**Voraussetzung:** Die Domain muss als Zone bei Cloudflare liegen. Bleibt eine Kundendomain zwingend beim Fremdanbieter, geht Workers nicht und es bleibt bei Pages. Deshalb steht der Nameserver-Check am Anfang jedes Projekts.

`public/_headers` funktioniert bei Workers genauso wie bei Pages, **aber nicht** für Antworten, die der Worker-Code selbst erzeugt. Security-Header für `/api/*` gehören in den Worker.

## Key Files
- `src/config/tokens.css` — Theme (Farben, Fonts, Skalen) = Single Source
- `src/config/site.ts` — alle Kundendaten (Name, Adresse, Kontakt, Domain, contactEndpoint, nav, turnstileSiteKey)
- `src/layouts/BaseLayout.astro` — Gerüst; SEO via `src/seo/Seo.astro`, JSON-LD via `src/seo/LocalBusiness.astro`, Analytics via `src/components/Analytics.astro`
- `src/lib/tracking.ts` + `src/components/TrackedLink.astro` — Pirsch-Event-Standard (Anruf, WhatsApp, Mail, Formular, Route, Termin)
- `src/components/` — Fundament-Komponenten (Header, Footer, Section, ContactForm, …)
- `wrangler.jsonc` — Deploy-Konfiguration, enthält die Anleitung für `/api/kontakt`
- `public/_headers` — Security-Header + CSP
- `public/fonts/` — self-hosted woff2

## Optional: CMS
Braucht der Kunde Pflegezugang, kommt `@portawerk/cms` dazu (D1 + R2 + Cloudflare Access), siehe `D:/Portawerk/03_Pakete`. Nicht ungefragt einbauen, das ist ein eigenes Produkt und kein Standard.

## Offene Punkte (pro Fork)
- [ ] Versions-Check: `npm view astro version` gegen `package.json` halten
- [ ] `config/tokens.css`: `@font-face` aktivieren + Kundenfarben statt Default-Theme
- [ ] `config/site.ts`: alle Kundendaten befüllen
- [ ] `astro.config.mjs` `site` + `robots.txt` auf Kundendomain
- [ ] `wrangler.jsonc`: `name` und Route auf das Projekt setzen
- [ ] `BaseLayout.astro`: Font-Preload aktivieren
- [ ] Haut bauen (Hero + Content-Sektionen)
- [ ] Impressum + Datenschutz befüllen (via `/portawerk-legal`)
- [ ] Formular als `/api/kontakt` im Worker + Brevo-Secrets; ggf. Turnstile
- [ ] `npm run deploy`

## Notion
[Link zur Projektseite]
