// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Statisches Astro -> deployt direkt auf Cloudflare Pages (kein Adapter noetig).
// Das Kontaktformular laeuft ueber einen separaten Cloudflare Worker (siehe blocks/form-worker),
// nicht ueber Astro-SSR.
export default defineConfig({
  site: 'https://example.com', // TODO: Kundendomain eintragen (muss mit config/site.ts site.domain uebereinstimmen)
  output: 'static',
  integrations: [sitemap()],
});
