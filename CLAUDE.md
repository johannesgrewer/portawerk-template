# [FIRMENNAME] — Website

> **BEIM KOPIEREN ZUERST LESEN — `.git` NICHT MITNEHMEN.**
>
> Dieser Starter ist selbst ein Git-Repo mit Remote auf
> `johannesgrewer/portawerk-template`. Wird der Ordner einfach kopiert, erbt
> das Kundenprojekt diese Historie **und das Remote**. Ein `git push` im
> Kundenprojekt schreibt dann ins Template-Repo.
>
> Am 21.09.2026 bei Marmann Fotografie genau so passiert und vor dem ersten
> Push aufgefallen.
>
> Beim Kopieren ausschliessen: `.git`, `node_modules`, `dist`, `.astro`,
> `package-lock.json`. Danach im Kundenprojekt `git init` und pruefen:
>
> ```bash
> git remote -v     # muss leer sein
> ```


## Kontext
- **Kunde:** [Name], [Branche], [Standort]
- **Agentur:** PortaWerk (portawerk.de)
- **Stack:** Astro 7 (static) · Cloudflare Workers mit Static Assets · CSS Custom Properties · [Fonts] (self-hosted) · Kontaktformular als `/api/kontakt` im selben Worker (Brevo) · Pirsch serverseitig (`@portawerk/messung`)
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
Pirsch (Emvi Software GmbH, gehostet in Deutschland), **serverseitig** über `@portawerk/messung` in `worker/index.ts`. Im Browser läuft kein Skript, es gibt kein `pa.js`, kein `api.pirsch.io` in der CSP und keine Klickzählung (Telefon, Mail). Gezählt werden Seitenaufrufe und, sobald das Formular eingebaut ist, zugestellte Anfragen (`ereignisMelden(..., 'Formular')`).

Im Pitch bleibt `ZAEHL_HOSTS` leer, die Vorschau zählt nie. Beim Livegang (`/portawerk-deliver` Phase 5a): Kundendomain in Pirsch anlegen, Access Key als Worker-Secret `PIRSCH_ZUGANG`, Domain in `ZAEHL_HOSTS` eintragen. In der Datenschutzerklärung bei easyRechtssicher die Pirsch-Variante „Serverseitig (ohne Skript im Browser)“ wählen. `@portawerk/*` kommt aus der privaten Registry der Organisation (`.npmrc`, Token einmalig per `npm config set //npm.pkg.github.com/:_authToken "$(gh auth token)"`).

## Hosting
Cloudflare Worker mit Static Assets (`wrangler.jsonc`), **nicht** Cloudflare Pages. Pages wird von Cloudflare nur noch gepflegt.

**Voraussetzung:** Die Domain muss als Zone bei Cloudflare liegen. Bleibt eine Kundendomain zwingend beim Fremdanbieter, hängt `www` per Custom Hostname über Cloudflare for SaaS an `portawerk.com` (seit 12.10.2026, globale CLAUDE.md Punkt 0), sonst Weg B der Bauordnung (Pages). Deshalb steht der Nameserver-Check am Anfang jedes Projekts.

`public/_headers` gilt **nicht** für Antworten, die durch den Worker gehen. Seiten laufen wegen der Zählung durch den Worker (`run_worker_first`), ihre Security-Header kommen aus `src/config/sicherheit.ts`. `_headers` gilt nur noch für die Dateiordner (`/_astro`, `/fonts`, `/images`). Beide Stellen gleich halten.

## Key Files
- `src/config/tokens.css` — Theme (Farben, Fonts, Skalen) = Single Source
- `src/config/site.ts` — alle Kundendaten (Name, Adresse, Kontakt, Domain, contactEndpoint, nav, turnstileSiteKey)
- `src/layouts/BaseLayout.astro` — Gerüst; SEO via `src/seo/Seo.astro`, JSON-LD via `src/seo/LocalBusiness.astro`
- `worker/index.ts` — Worker-Einstieg: Auslieferung, Sicherheits-Header, Pirsch-Zählung (später `/api/kontakt`)
- `src/config/sicherheit.ts` — Security-Header + CSP für alles, was durch den Worker geht
- `src/components/` — Fundament-Komponenten (Header, Footer, Section, ContactForm, …)
- `wrangler.jsonc` — Deploy-Konfiguration, enthält die Anleitung für `/api/kontakt`
- `public/_headers` — Security-Header + CSP für die Dateiordner am Worker vorbei
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
- [ ] Impressum + Datenschutz: im Pitch Entwurfsstand, vor dem Livegang über `@portawerk/rechtstexte` (easyRechtssicher, `/portawerk-deliver` Phase 2)
- [ ] Formular als `/api/kontakt` im Worker + Brevo-Secrets; ggf. Turnstile
- [ ] `npm run deploy`

## Notion
[Link zur Projektseite]
