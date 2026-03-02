# [FIRMENNAME] — Website

## Kontext
- **Kunde:** [Name], [Branche], [Standort]
- **Agentur:** PortaWerk (portawerk.de)
- **Stack:** Astro (static), Tailwind CSS 4, CSS Custom Properties, [Fonts] (self-hosted), Supabase (Frankfurt), Resend, Umami

## Design
- **Stimmung:** [aus PRB]
- **Display Font:** [Name] (lokal, `/public/fonts/`)
- **Body Font:** [Name] (lokal, `/public/fonts/`)
- **Primary:** [Hex] · **Accent:** [Hex] · **Bg:** [Hex]

## Regeln
- ALLE Farben + Fonts aus `globals.css` — keine Hardcodes im Component-CSS
- Mobile First, `clamp()` für Typo + Spacing, nur `min-width` Breakpoints
- Hover = Mehr (additiv: lift, glow, sättiger — niemals abschwächend)
- DSGVO: keine externen Dienste ohne 2-Klick-Fassade
- Fonts: NUR lokal gehostet, kein Google CDN
- Bilder: `<Image />` aus `astro:assets`, immer `alt`-Text
- JS nur für: IntersectionObserver, Kontaktformular, Menü-Toggle

## Sektionen
1. [ ] Header
2. [ ] Hero
3. [ ] SocialProof
4. [ ] About
5. [ ] Services
6. [ ] Stats
7. [ ] CtaDivider
8. [ ] Testimonials
9. [ ] FAQ
10. [ ] ContactForm
11. [ ] Footer
12. [ ] Impressum
13. [ ] Datenschutz
14. [ ] 404

## Key Files
- `PRB.md` — Project Requirements Brief
- `src/styles/globals.css` — Design Tokens (Single Source of Truth)
- `src/layouts/Layout.astro` — Meta, OG, JSON-LD, Umami, Fonts
- `src/pages/index.astro` — Sektionen-Komposition
- `public/fonts/` — Self-hosted woff2 Fonts

## Notion
[Link zur Projektseite eintragen]

## Offene Punkte
- [ ] Fonts herunterladen + in `public/fonts/` ablegen
- [ ] `globals.css` Design-Tokens befüllen
- [ ] `Layout.astro` TODOs abarbeiten (Domain, JSON-LD, Umami-ID)
- [ ] `astro.config.mjs` Site-URL eintragen
- [ ] `robots.txt` Domain eintragen
- [ ] Sektionen bauen
- [ ] Impressum + Datenschutz Platzhalter ersetzen
- [ ] `.env` anlegen (aus `.env.example`)
- [ ] Vercel deployen + Env-Variablen eintragen
