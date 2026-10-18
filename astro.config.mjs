// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { site as kunde } from './src/config/site.ts';

// Seiten mit noindex: feste Seiten plus alle Kurzlinks aus site.ts.
const NOINDEX = ['impressum', 'datenschutz', 'danke', ...(kunde.kurzlinks ?? []).map((k) => k.pfad.replace(/^\/+|\/+$/g, ''))];

// Statisches Astro, deployt als Cloudflare Worker mit Static Assets (siehe
// wrangler.jsonc). KEIN Adapter: Formular, Rechtstexte und Messung laufen in
// worker/index.ts, nicht als Astro-Routen. Den Adapter braucht es erst, wenn
// Astro selbst Seiten zur Laufzeit rendern muss (Erweiterung nach HGS-Muster,
// siehe CLAUDE.md).
export default defineConfig({
  site: 'https://example.com', // TODO: Kundendomain eintragen (muss mit config/site.ts site.domain uebereinstimmen)
  output: 'static',

  integrations: [
    sitemap({
      // Datum des Baus, also des Deploys. Genauer geht es ohne CMS nicht.
      lastmod: new Date(),
      // Seiten mit noindex gehoeren nicht in die Sitemap, sonst meldet die
      // Search Console einen Widerspruch. Kurzlinks kommen automatisch dazu,
      // jede weitere noindex-Seite in NOINDEX oben ergaenzen.
      filter: (seite) => !NOINDEX.some((pfad) => new URL(seite).pathname === `/${pfad}/`),
    }),
  ],

  // CSS direkt ins HTML statt render-blockierender Dateien. Spart laut
  // Lighthouse-Messung bei HGS Becker 150 bis 480 ms bis zum ersten Bild.
  build: { inlineStylesheets: 'always' },

  // Astro 7 stellt compressHTML auf 'jsx' um. Dabei fallen Leerzeichen
  // zwischen Inline-Elementen weg, dann klebt Text am Link ("unter0651 ...").
  // Bei Augusta Immobilien am 08.09.2026 genau so passiert. Deshalb hier
  // standardmaessig die alte Kompression. Wer 'jsx' braucht, setzt die Zeile
  // weg und schreibt an den betroffenen Stellen {" "}.
  compressHTML: true,
});
