/**
 * Rechtstexte von easyRechtssicher (Lizenz im Agenturkonto info@portawerk.de)
 * ueber @portawerk/rechtstexte. Vorlage HGS Becker.
 *
 * Gelesen von zwei Stellen:
 *   - `npm run rechtstexte` legt die Notfall-Fassung fuer den Bau ab
 *     (src/inhalte/rechtstexte/).
 *   - worker/index.ts holt einmal taeglich die aktuelle Fassung in den
 *     KV-Speicher RECHTSTEXTE und setzt sie in /impressum/ und /datenschutz/ ein.
 *
 * Im Pitch bleibt das ungenutzt: Ohne Notfall-Fassung bauen die Seiten eine
 * Kurzfassung aus site.ts, der Bau bricht nicht ab.
 *
 * Fehlt eine Pflichtangabe oder steht ein Platzhalter im Text, wird die neue
 * Fassung NICHT uebernommen. Die alte bleibt stehen, der Fehler steht unter
 * /api/rechtstexte/stand.
 *
 * TODO(Livegang): Pflichtangaben auf den Kunden setzen. Impressum: Inhaber,
 * Strasse, USt-IdNr. Datenschutz: jeder Dienst, den die Seite nutzt.
 * 'Turnstile' ist Pflicht, sobald das Widget laeuft.
 */
export default {
  pflichtangaben: {
    impressum: ['[VORNAME NACHNAME]', '[STRASSE HAUSNR]'],
    datenschutz: ['Cloudflare', 'Kontaktformular', 'Brevo', 'Pirsch', 'Turnstile'],
  },

  // Schluessel fuer `npm run rechtstexte`, liegt in ~/.claude/secrets/ als
  // ERS_API_KEY. Der Worker bekommt ihn als Secret ERS_API_KEY.
  schluesselDatei: '[projekt]-ers.env',
};
