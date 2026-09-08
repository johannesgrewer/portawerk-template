/**
 * PortaWerk Starter — site.ts
 * ALLE kundenspezifischen Daten an EINER Stelle.
 * Beim Fork nur diese Datei (+ tokens.css) anpassen.
 */

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

  address: {
    strasse: string;
    plz: string;
    ort: string;
    /** Bundesland (fuer LocalBusiness/Impressum), optional */
    region?: string;
  };

  email: string;
  telefon: string;
  /** Telefon nur Ziffern inkl. Laendervorwahl, fuer tel:-Links (z.B. 4915112345678) */
  telefonRaw: string;

  /** Oeffnungszeiten als Klartext-Zeilen, optional */
  oeffnungszeiten?: string[];

  /** Geo-Koordinaten fuer LocalBusiness, optional */
  geo?: { lat: number; lng: number };

  /** Schema.org-Typ, praeziser als "LocalBusiness" wenn moeglich
   *  (z.B. "Plumber", "Restaurant", "BeautySalon", "HomeAndConstructionBusiness") */
  businessType: string;

  /** Cloudflare Web Analytics Site-Token (oeffentlich, cookielos).
   *  Leer lassen, wenn die Zone bei Cloudflare liegt — dann uebernimmt die
   *  automatische Injektion im Dashboard das Einbinden. Nur fuer Seiten
   *  ausserhalb von Cloudflare hier den Token aus "Manage site" eintragen. */
  cfAnalyticsToken: string;

  /** Oeffentliche URL des Form-Workers (kein Secret) */
  contactEndpoint: string;

  /** Turnstile Site-Key (oeffentlich). Leer = kein Bot-Schutz-Widget. */
  turnstileSiteKey: string;

  /** Hauptnavigation (Header) */
  nav: { label: string; href: string }[];
  /** Primaerer CTA-Button (Header) */
  cta: { label: string; href: string };

  /** Social-Profile, optional (nur Links, kein Tracking) */
  socials?: { label: string; href: string }[];

  /** Angaben fuer Impressum */
  legal: {
    inhaber: string;
    /** USt-IdNr., optional */
    ustId?: string;
  };
}

/**
 * PITCH-STAND. Alles in eckigen Klammern ist noch nicht von der Kundin
 * bestaetigt und muss vor dem Livegang gefuellt werden. Der Ortsbezug
 * (Pluwig, 54316, Ruwertal) ist recherchiert und stimmt.
 */
export const site: SiteConfig = {
  name: '[FIRMENNAME]',
  nameKurz: '[FIRMENNAME OHNE RECHTSFORM]',
  slogan: '[SLOGAN]',
  lang: 'de',
  domain: 'https://example.com', // TODO: echte Kundendomain (muss mit astro.config site uebereinstimmen)

  address: {
    strasse: '[STRASSE HAUSNR]',
    plz: '[PLZ]',
    ort: '[ORT]',
    region: '[BUNDESLAND]',
  },

  email: 'info@[domain].de',
  telefon: '[+49 ...]',
  telefonRaw: '49000000000',

  oeffnungszeiten: [
    'Mo–Fr: 08:00–17:00 Uhr',
  ],

  // geo: { lat: 0, lng: 0 },

  businessType: 'LocalBusiness',   // praeziser Schema.org-Typ wenn moeglich
  cfAnalyticsToken: '',            // leer = automatische Injektion via Cloudflare-Dashboard
  contactEndpoint: '/api/kontakt', // gleicher Worker, siehe wrangler.jsonc
  turnstileSiteKey: '',            // Site-Key aus dem Turnstile-Dashboard, sonst leer

  nav: [
    { label: 'Leistungen', href: '/#leistungen' },
    { label: 'Ueber uns', href: '/#ueber-uns' },
    { label: 'Kontakt', href: '/#kontakt' },
  ],
  cta: { label: 'Anfrage', href: '/#kontakt' },

  // socials: [{ label: 'Instagram', href: 'https://instagram.com/...' }],

  legal: {
    inhaber: '[VORNAME NACHNAME]',
    // ustId: 'DE...',
  },
};
