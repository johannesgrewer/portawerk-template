# [FIRMENNAME] — Website

## Kontext
- **Kunde:** [Name], [Branche], [Standort]
- **Agentur:** PortaWerk (portawerk.de)
- **Stack:** Astro 7 (static) · Cloudflare Workers mit Static Assets · CSS Custom Properties · [Fonts] (self-hosted) · Kontaktformular als `/api/kontakt` im selben Worker (Brevo) · Cloudflare Web Analytics
  - *Kein Tailwind / Supabase / Resend / Vercel / Umami.*

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
Cloudflare Web Analytics, cookielos und ohne Einwilligungspflicht. Liegt die Zone bei Cloudflare, reicht die **automatische Injektion** im Dashboard, dann bleibt `cfAnalyticsToken` in `site.ts` leer und es kommt kein Skript in den Code. Nur für Seiten außerhalb der Cloudflare-Zone dort den Site-Token eintragen.

Grenze, die man kennen muss: Cloudflare hält nur 7 Tage ungefiltert vor, danach wird auf rund 10 Prozent aggregiert. Für Halbjahresberichte reicht das nur eingeschränkt.

## Hosting
Cloudflare Worker mit Static Assets (`wrangler.jsonc`), **nicht** Cloudflare Pages. Pages wird von Cloudflare nur noch gepflegt.

**Voraussetzung:** Die Domain muss als Zone bei Cloudflare liegen. Bleibt eine Kundendomain zwingend beim Fremdanbieter, geht Workers nicht und es bleibt bei Pages. Deshalb steht der Nameserver-Check am Anfang jedes Projekts.

`public/_headers` funktioniert bei Workers genauso wie bei Pages, **aber nicht** für Antworten, die der Worker-Code selbst erzeugt. Security-Header für `/api/*` gehören in den Worker.

## Key Files
- `src/config/tokens.css` — Theme (Farben, Fonts, Skalen) = Single Source
- `src/config/site.ts` — alle Kundendaten (Name, Adresse, Kontakt, Domain, cfAnalyticsToken, contactEndpoint, nav, turnstileSiteKey)
- `src/layouts/BaseLayout.astro` — Gerüst; SEO via `src/seo/Seo.astro`, JSON-LD via `src/seo/LocalBusiness.astro`
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
