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
> `.wrangler`, `package-lock.json`. Danach im Kundenprojekt `git init` und pruefen:
>
> ```bash
> git remote -v     # muss leer sein
> ```


## Kontext
- **Kunde:** [Name], [Branche], [Standort]
- **Agentur:** PortaWerk (portawerk.de)
- **Stack:** Astro 7 (static, ohne Adapter) · Cloudflare Worker mit Static Assets · CSS Custom Properties · [Fonts] (self-hosted) · Kontaktformular als `/api/kontakt` im selben Worker (`@portawerk/forms`, Brevo) · Rechtstexte über `@portawerk/rechtstexte` (easyRechtssicher) · Pirsch serverseitig (`@portawerk/messung`)
  - *Kein Tailwind / Supabase / Resend / Vercel / Umami / Plausible / Cloudflare Web Analytics.*

## Design
- **Stimmung:** [aus PRB]
- **Display Font:** [Name] (lokal, `public/fonts/`)
- **Body Font:** [Name] (lokal, `public/fonts/`)
- **Primary:** [Hex] · **Accent:** [Hex] · **Bg:** [Hex]

## Architektur — zwei Schichten
- **Fundament (fest, wird geforkt):** BaseLayout, Seo, LocalBusiness (`@graph`), Header, Footer, ContactForm, TurnstileNachladen, Rechtstext, TwoClickEmbed, SkipToContent, tokens.css, site.ts, worker/index.ts, scripts/. Nicht pro Kunde neu erfinden.
- **Nicht mehr im Starter (seit 18.10.2026), bei Bedarf aus dem Toolkit holen:** Galerie mit Lightbox (`00_Toolkit/blocks/galerie/`), CookieConsent (`00_Toolkit/blocks/cookie-consent/`, nur bei einwilligungspflichtigem Dienst). `Section.astro` ist ersatzlos weg, in keinem Projekt genutzt.
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
- **Icons immer aus dem Lucide-Set**, nie selbst als SVG zeichnen. Installiert ist das offizielle Paket `@lucide/astro`: `import { Phone } from '@lucide/astro'`, dann `<Phone size={22} aria-hidden="true" />`. Rendert als Inline-SVG, lädt nichts nach. Nicht `lucide-astro` (alter Name) dazuinstallieren.
- **Kein `FAQPage`-Schema.** Das Ergebnis gibt es seit 07.05.2026 nicht mehr. Fragen sichtbar als `<details>` bauen, ohne Auszeichnung.
- **Jede neue `noindex`-Seite** (`/bewerten`, `/stoerung` …) auch in den Sitemap-Filter in `astro.config.mjs`.

## Analytics
Pirsch (Emvi Software GmbH, gehostet in Deutschland), **serverseitig** über `@portawerk/messung` in `worker/index.ts`. Im Browser läuft kein Skript, es gibt kein `pa.js`, kein `api.pirsch.io` in der CSP und keine Klickzählung (Telefon, Mail). Gezählt werden Seitenaufrufe und, sobald das Formular eingebaut ist, zugestellte Anfragen (`ereignisMelden(..., 'Formular')`).

Im Pitch bleibt `ZAEHL_HOSTS` leer, die Vorschau zählt nie. Beim Livegang (`/portawerk-deliver` Phase 5a): Kundendomain in Pirsch anlegen, Access Key als Worker-Secret `PIRSCH_ZUGANG`, Domain in `ZAEHL_HOSTS` eintragen. In der Datenschutzerklärung bei easyRechtssicher die Pirsch-Variante „Serverseitig (ohne Skript im Browser)“ wählen. `@portawerk/*` kommt aus der privaten Registry der Organisation (`.npmrc`, Token einmalig per `npm config set //npm.pkg.github.com/:_authToken "$(gh auth token)"`).

## Hosting
Cloudflare Worker mit Static Assets (`wrangler.jsonc`), **nicht** Cloudflare Pages. Pages wird von Cloudflare nur noch gepflegt.

**Der Worker ist fertig, beim Build wird nur eingeschaltet** (Muster Ordnung Trier, ohne Astro-Adapter). `worker/index.ts` macht in dieser Reihenfolge: www per 301 auf die Hauptdomain (`HAUPT_HOST`), Prefetch-Sperre, `/api/kontakt` über `@portawerk/forms`, Impressum und Datenschutz über `@portawerk/rechtstexte`, statische Seiten mit Sicherheits-Headern, Pirsch nur auf `ZAEHL_HOSTS`, täglicher Abruf der Rechtstexte. Jede Stufe prüft ihre Bindung bzw. ihr Secret und läuft ohne sie weiter:

| Phase | Was aktiv ist | Was dafür zu tun ist |
|---|---|---|
| Pitch | Auslieferung, Header. `/api/kontakt` antwortet „Vorschau, Formular noch nicht freigeschaltet“ (503), das Formular zeigt den Text an | nichts |
| Build | Formular, Canary | `wrangler.jsonc` Block 1 aktivieren (vars, ratelimits, Durable Object), Secrets `BREVO_API_KEY`, `CANARY_TOKEN` (für den Vorschau-Host abgeleitet, siehe `/portawerk-build` Phase 4) und `CANARY_TO_EMAIL`, ggf. `TURNSTILE_SECRET_KEY` (erst nach dem Site-Key in `site.ts`) |
| Livegang | Rechtstexte, Kundendomain, www-Weiterleitung, Zählung, Monatstest; `CANARY_TOKEN` für die Kundendomain neu ableiten | Block 2 und 3 aktivieren, `HAUPT_HOST`, `ZAEHL_HOSTS`, `monatstest` im Worker füllen, `npm run rechtstexte`, Secrets laut `.env.example`, `vorlagen/wartung.yml` nach `.github/workflows/` |

**Erweiterung Astro-Adapter (nur wenn Astro selbst zur Laufzeit rendern muss)**, etwa für live abgerufene Google-Bewertungen über `@portawerk/bewertungen`. Muster HGS Becker: `@astrojs/cloudflare` mit `imageService: 'compile'`, `output` bleibt `'static'`, nur einzelne `/api`-Routen mit `prerender = false`. Fallen: Bilder brechen auf Seiten mit `prerender = false`, Ausgabe wandert nach `dist/client`. Nicht ungefragt einbauen.

**Formular lokal testen:** `wrangler dev` schreibt die Herkunft auf `http://<route aus wrangler.jsonc>` um. In `.dev.vars` deshalb `ALLOWED_ORIGIN=http://<projekt>.portawerk.de` (http, nicht https), sonst antwortet jede Anfrage 403. Am 18.10.2026 beim Probe-Pitch gefunden.

**Voraussetzung:** Die Domain muss als Zone bei Cloudflare liegen. Bleibt eine Kundendomain zwingend beim Fremdanbieter, hängt `www` per Custom Hostname über Cloudflare for SaaS an `portawerk.com` (seit 12.10.2026, globale CLAUDE.md Punkt 0), sonst Weg B der Bauordnung (Pages). Deshalb steht der Nameserver-Check am Anfang jedes Projekts.

`public/_headers` gilt **nicht** für Antworten, die durch den Worker gehen. Seiten laufen wegen der Zählung durch den Worker (`run_worker_first`), ihre Security-Header kommen aus `src/config/sicherheit.ts`. `_headers` gilt nur noch für die Dateiordner (`/_astro`, `/fonts`, `/images`). Beide Stellen gleich halten.

## Key Files
- `src/config/tokens.css` — Theme (Farben, Fonts, Skalen) = Single Source
- `src/config/site.ts` — alle Kundendaten (Name, Adresse, Kontakt, Domain, `vorschau`, Logo mit Maßen, Öffnungszeiten für Anzeige und Schema, Einsatzgebiet, Google-Profil, nav, turnstileSiteKey)
- `src/layouts/BaseLayout.astro` — Gerüst; SEO via `src/seo/Seo.astro`, JSON-LD via `src/seo/LocalBusiness.astro`
- `worker/index.ts` — Worker-Einstieg (siehe Hosting)
- `src/config/sicherheit.ts` — Security-Header + CSP für alles, was durch den Worker geht, plus strenge Header für `/api`
- `src/components/` — Fundament-Komponenten (Header, Footer, ContactForm, TurnstileNachladen, Rechtstext, …)
- `src/pages/site.webmanifest.ts` — Web-Manifest, beim Bauen aus `site.ts`
- `rechtstexte.config.mjs` — Pflichtangaben für die Rechtstexte, Schlüsseldatei für `npm run rechtstexte`
- `wrangler.jsonc` — Deploy-Konfiguration, vorbereitete Blöcke für Formular, Rechtstexte, Kundendomain
- `public/_headers` — Security-Header + CSP für die Dateiordner am Worker vorbei, Cache-Header
- `public/` — neutrale Platzhalter für Favicon, Icons und `og-image.jpg` (1200 × 630). `npm run rauchtest` meldet sie, solange sie drin sind
- `scripts/` — `rauchtest.mjs`, `kernpakete.mjs`, `luecken.mjs` (für die Wartung, Stand HGS = Ordnung), `platzhalter.mjs`, `indexnow.mjs` (nach dem Livegang, meldet die Seite an Bing)
- `vorlagen/wartung.yml` — Wartungs-Workflow, erst beim Livegang nach `.github/workflows/`
- `public/fonts/` — self-hosted woff2

## Optional: Editor bei Übergabe
Wählt der Kunde nach dem Livegang die Übergabe, bekommt er den Editor zum Selbstpflegen (Pages CMS auf seinem Repo, 250 € netto einmalig, seit 14.10.2026 Standard). Feste Felder wie Öffnungszeiten, Aktuelles, Texte, Bilder. Impressum und Datenschutz bleiben gesperrt. `@portawerk/cms` ist seit 18.10.2026 eingefroren und kommt nicht mehr in neue Projekte.

## Offene Punkte (pro Fork)
- [ ] Versions-Check: `npm view astro version` gegen `package.json` halten
- [ ] `config/tokens.css`: `@font-face` aktivieren + Kundenfarben statt Default-Theme
- [ ] `config/site.ts`: alle Kundendaten befüllen, `vorschau` auf die Vorschau-Subdomain, `themeFarbe` = `--c-bg`
- [ ] `astro.config.mjs` `site` + `robots.txt` auf Kundendomain
- [ ] `wrangler.jsonc`: `projekt-slug` in `name` und Route ersetzen
- [ ] `BaseLayout.astro`: Font-Preload aktivieren
- [ ] Favicon, Icons und `og-image.jpg` aus dem Kunden-Signet bauen (Platzhalter ersetzen)
- [ ] Haut bauen (Hero + Content-Sektionen)
- [ ] `npm run build && npm run rauchtest`, Platzhalter-Funde abarbeiten
- [ ] `npm run deploy`
- [ ] Build: Formular einschalten (Hosting, Tabelle)
- [ ] Livegang: Rechtstexte, Kundendomain, Messung, Wartung einschalten (Hosting, Tabelle), `node scripts/platzhalter.mjs --streng` ohne Fund, danach `node scripts/indexnow.mjs`

## Nächste Ausbaustufen des Starters (Auswertung 18.10.2026, noch nicht gebaut)
Quelle: `00_Toolkit/starters/STARTER_AUSWERTUNG_2026-10-18.md`.

**Sollte (Rohbauten für das, was jedes Projekt neu baut):**
- Kontakt-Sektion als Rohbau (Telefon, Mail, Adresse als Kartenlink, Öffnungszeiten, Karte per Zwei-Klick, Formular), Vorlage Augusta + HGS-Formular
- FAQ-Baustein mit `<details>`, ohne `FAQPage`, erste Frage offen (Vorlage HGS `Fragen.astro`)
- Telefonleiste unten per Schalter in `site.ts` (Vorlage HGS `NotrufLeiste.astro`). Offene Designfrage: Standard oder nur bei Notdienst-Betrieben
- Kurzlink-Baustein und `/bewerten` (Vorlage HGS `Kurzlink.astro`)
- Öffnungszeiten als Datei (`src/inhalte/oeffnungszeiten.json`), speist Anzeige, Schema und den Editor (Dockner + Ordnung)
- Mobilmenü als Vollbild-`<dialog>` (Vorlage HGS `Header.astro`)
- Pitch-Leiste per Schalter, nur ab 900 px (Vorlage HGS `BaseLayout.astro`)
- Rauchtest und Co. zentral aus `Portawerk/wartung` holen statt kopieren

**Kann (bei Bedarf, außerhalb des Starters):**
- Live-Bewertungen über `@portawerk/bewertungen` als Erweiterungsweg (braucht den Adapter)
- Weitere Bausteine im Toolkit: Team, `/stoerung`, Instagram, `llms.txt`
- Hero-Katalog im Toolkit (je Archetyp Screenshot + Pfad zur Projektdatei), technisches Hero-Grundgerüst (eine `<h1>`, `fetchpriority`, `100svh`, Video-Logik aus HGS)

## Notion
[Link zur Projektseite]
