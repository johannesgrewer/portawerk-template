/**
 * PortaWerk Starter — site.ts
 * ALLE kundenspezifischen Daten an EINER Stelle.
 * Beim Fork nur diese Datei (+ tokens.css) anpassen.
 */

/** Gezaehlter Kurzlink auf der eigenen Domain, z. B. /bewerten fuer QR-Codes. */
export interface Kurzlink {
  /** Pfad ohne Schraegstriche, z. B. 'bewerten' */
  pfad: string;
  /** Ziel, absolut oder ab der Wurzel */
  ziel: string;
  /** Kurzer Titel, steht als Linktext, falls JavaScript fehlt */
  titel: string;
}

export interface SiteConfig {
  /** Firmenname, vollstaendig mit Rechtsform */
  name: string;
  /** Kurzform fuer die Kopfzeile, optional. Die Rechtsform braucht dort
   *  niemand, auf schmalen Schirmen frisst sie die ganze Breite. */
  nameKurz?: string;
  /** Kurzer Slogan / Claim */
  slogan: string;
  /** Sprache (ISO), Default de */
  lang: string;
  /** Produktions-Domain inkl. https:// (ohne Slash am Ende) */
  domain: string;

  /** Adresse der Vorschau, solange die Seite noch nicht auf der Kundendomain
   *  liegt (https://kunde.portawerk.de). Nur fuer Vorschaubild und og:url beim
   *  Teilen, sonst zeigt WhatsApp kein Bild. Beim Livegang loeschen. */
  vorschau?: string;

  /** Logo fuer die Kopfzeile, liegt in public/images/. Ohne Angabe steht der
   *  Name als Text da. breite/hoehe = echte Pixelmasse der Datei, damit der
   *  Browser den Platz vorab reserviert (kein Springen beim Laden). */
  logo?: { src: string; breite: number; hoehe: number };

  /** Farbe der Browserleiste am Handy und im Web-Manifest. Gleich --c-bg aus
   *  tokens.css, damit die Leiste in die Kopfzeile uebergeht. */
  themeFarbe: string;

  /** Alternativtext des Vorschaubilds public/og-image.jpg (1200 x 630) */
  ogBildAlt: string;

  address: {
    strasse: string;
    plz: string;
    ort: string;
    /** Bundesland (fuer LocalBusiness/Impressum), optional */
    region?: string;
  };

  email: string;
  /** Telefon in nationaler Schreibweise, wie auf der Seite angezeigt (0651 ...) */
  telefon: string;
  /** Telefon nur Ziffern inkl. Laendervorwahl, fuer tel:-Links (z.B. 4915112345678) */
  telefonRaw: string;

  /* Oeffnungszeiten stehen NICHT hier, sondern in src/inhalte/oeffnungszeiten.json
     (Anzeige und Schema aus einer Quelle, spaeter im Editor pflegbar). */

  /** Notdienst-Betrieb: blendet auf dem Handy die Telefonleiste unten ein
   *  (Telefonleiste.astro). Nur fuer Betriebe mit echtem Notdienst, sonst aus
   *  (Entscheidung JG, 18.10.2026). */
  notdienst?: boolean;

  /** Gezaehlte Kurzlinks fuer gedruckte QR-Codes (Bewertungspaket). Jeder
   *  Eintrag wird eine Weiterleitungsseite, noindex und nicht in der Sitemap. */
  kurzlinks?: Kurzlink[];

  /** PortaWerk-Leiste auf der Pitch-Vorschau (Varianten, Kommentare). Laedt nur
   *  ab 900 px, die CSP gibt cockpit.portawerk.de nur frei, solange der Eintrag
   *  steht. BEIM LIVEGANG LOESCHEN. Token-Abruf: /portawerk-pitch Phase 8. */
  pitchLeiste?: {
    kunde: string;
    /** Schreib-Token des Pitches, darf im HTML stehen */
    token: string;
    /** JSON fuer data-klassen, optional */
    klassen?: string;
  };

  /** Geo-Koordinaten fuer LocalBusiness, optional. Erst nach bestaetigter
   *  Anschrift eintragen. */
  geo?: { lat: number; lng: number };

  /** Schema.org-Typ, praeziser als "LocalBusiness" wenn moeglich
   *  (z.B. "Plumber", "Restaurant", "BeautySalon", "HomeAndConstructionBusiness") */
  businessType: string;

  /** Adresse des Google-Unternehmensprofils (cid-Form, ueberlebt eine
   *  Umbenennung). Geht als sameAs und hasMap ins Schema. */
  googleProfil?: string;

  /** Orte, in denen der Betrieb taetig ist. Geht als areaServed ins Schema.
   *  NUR EINTRAGEN, WAS DER KUNDE BESTAETIGT HAT. */
  einsatzgebiet?: string[];

  /** Formular-Endpunkt im selben Worker (kein Secret) */
  contactEndpoint: string;

  /** Turnstile Site-Key (oeffentlich). Leer = kein Bot-Schutz-Widget.
   *  Erst den Key hier eintragen, DANN das Secret TURNSTILE_SECRET_KEY am
   *  Worker setzen. Secret ohne Widget laesst jede Anfrage scheitern. */
  turnstileSiteKey: string;

  /** Hauptnavigation (Header) */
  nav: { label: string; href: string }[];
  /** Primaerer CTA-Button (Header) */
  cta: { label: string; href: string };

  /** Social-Profile, optional (nur Links, kein Tracking). Gehen auch als
   *  sameAs ins Schema. */
  socials?: { label: string; href: string }[];

  /** Angaben fuer Impressum (Kurzfassung, solange kein easyRechtssicher-Text da ist) */
  legal: {
    inhaber: string;
    /** USt-IdNr., optional */
    ustId?: string;
  };
}

/**
 * PITCH-STAND. Alles in eckigen Klammern ist noch nicht vom Kunden
 * bestaetigt und muss vor dem Livegang gefuellt werden.
 */
export const site: SiteConfig = {
  name: '[FIRMENNAME]',
  nameKurz: '[FIRMENNAME OHNE RECHTSFORM]',
  slogan: '[SLOGAN]',
  lang: 'de',
  domain: 'https://example.com', // TODO: echte Kundendomain (muss mit astro.config site uebereinstimmen)
  vorschau: 'https://projekt-slug.portawerk.de', // TODO: Vorschau-Subdomain (muss eine gueltige Adresse sein), beim Livegang loeschen

  // logo: { src: '/images/logo.webp', breite: 160, hoehe: 40 },

  themeFarbe: '#FCFBF9', // = --c-bg aus tokens.css
  ogBildAlt: '[FIRMENNAME], [Leistung] in [Ort]',

  address: {
    strasse: '[STRASSE HAUSNR]',
    plz: '[PLZ]',
    ort: '[ORT]',
    region: '[BUNDESLAND]',
  },

  email: 'info@[domain].de',
  telefon: '0000 000000',
  telefonRaw: '49000000000',

  // notdienst: true,
  // kurzlinks: [{ pfad: 'bewerten', ziel: 'https://search.google.com/local/writereview?placeid=...', titel: 'Bewertung bei Google schreiben' }],
  // pitchLeiste: { kunde: 'projekt-slug', token: '...' },

  // geo: { lat: 0, lng: 0 },

  businessType: 'LocalBusiness',   // praeziser Schema.org-Typ wenn moeglich
  // googleProfil: 'https://maps.google.com/maps?cid=...',
  // einsatzgebiet: ['Trier', 'Konz', 'Schweich'],

  contactEndpoint: '/api/kontakt', // gleicher Worker, siehe worker/index.ts
  turnstileSiteKey: '',            // Site-Key aus dem Turnstile-Dashboard, sonst leer

  nav: [
    { label: 'Leistungen', href: '/#leistungen' },
    { label: 'Über uns', href: '/#ueber-uns' },
    { label: 'Kontakt', href: '/#kontakt' },
  ],
  cta: { label: 'Anfrage', href: '/#kontakt' },

  // socials: [{ label: 'Instagram', href: 'https://instagram.com/...' }],

  legal: {
    inhaber: '[VORNAME NACHNAME]',
    // ustId: 'DE...',
  },
};
