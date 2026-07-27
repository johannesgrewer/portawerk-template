// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Statisches Astro, deployt als Cloudflare Worker mit Static Assets (siehe
// wrangler.jsonc). Kein Adapter noetig, solange die Seite rein statisch ist.
// Das Kontaktformular kommt spaeter als /api/kontakt in DENSELBEN Worker,
// nicht in einen zweiten daneben.
export default defineConfig({
  site: 'https://example.com', // TODO: Kundendomain eintragen (muss mit config/site.ts site.domain uebereinstimmen)
  output: 'static',
  integrations: [sitemap()],

  // Astro 7 stellt compressHTML auf 'jsx' um. Dabei koennen Leerzeichen
  // zwischen Inline-Elementen wegfallen, dann klebt Text am Link. Tritt das
  // auf, entweder {" "} setzen oder hier auf true zurueckstellen:
  // compressHTML: true,
});
