# PortaWerk Baustein-Check (Ampel)

Vor jedem Deploy durchgehen. **Rot** = Blocker (muss), **Gelb** = sollte, **Weiss** = optional.

## 🔴 Rot — Blocker (nie ohne)

- [ ] `config/site.ts` vollstaendig gefuellt (keine `[PLATZHALTER]` mehr)
- [ ] `config/tokens.css` Farben + Fonts pro Kunde gesetzt (kein Default-Theme mehr)
- [ ] Impressum + Datenschutz befuellt, auf **jeder** Seite im Footer verlinkt
- [ ] Genau **eine** `<h1>` pro Seite
- [ ] Kontaktformular: Honeypot, Zeitstempel, Datenschutz-Haken vorhanden; Worker-Endpoint gesetzt
- [ ] Keine Secrets im Frontend/Repo (`BREVO_API_KEY` nur als Worker-Secret)
- [ ] Keine externen Dienste ohne Einwilligung (Fonts self-hosted, Maps/YouTube nur `TwoClickEmbed`)
- [ ] Skip-Link zeigt auf existierendes `#main-content`

## 🟡 Gelb — sollte

- [ ] Alt-Texte auf allen inhaltlichen Bildern (dekorativ = `alt=""`)
- [ ] Farbkontrast WCAG AA (Text ≥ 4,5:1)
- [ ] Touch-Targets ≥ 24px, Buttons min-height 48px
- [ ] `LocalBusiness`-Schema mit echten Adressdaten
- [ ] Meta-Description je Seite individuell, ≤ 155 Zeichen
- [ ] OG-Bild (`/og-image.jpg`, 1200×630) vorhanden
- [ ] Bilder optimiert (WebP, skaliert) — keine Roh-PNG > 500 KB
- [ ] `prefers-reduced-motion` respektiert
- [ ] Responsive geprueft (375 / 768 / 1440)

## ⚪ Weiss — optional

- [ ] `CookieConsent` nur falls wirklich einwilligungspflichtige Dienste dazukommen
- [ ] Social-Links im Footer (`showSocials`)
- [ ] Zusaetzliche SEO-Landingpage (eigenes Zusatzprodukt, Anti-Doorway-Regeln in `references/portawerk-google-regelwerk` Abschnitt 1)

---

> Diese Ampel ist eine Kurzliste fuer den Bau. Die eigentliche Pruefung vor und nach dem Livegang macht `/portawerk-abnahme` (ersetzt seit 18.10.2026 `portawerk-check` und `portawerk-security`).
