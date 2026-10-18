/**
 * site.webmanifest — beim Bauen aus site.ts erzeugt, damit Name und Farbe
 * nicht an zwei Stellen gepflegt werden. Liegt danach als statische Datei in
 * dist/site.webmanifest.
 */
import type { APIRoute } from 'astro';
import { site } from '../config/site';

export const GET: APIRoute = () => {
  const manifest = {
    name: site.name,
    short_name: site.nameKurz ?? site.name,
    description: site.slogan,
    lang: site.lang,
    start_url: '/',
    scope: '/',
    display: 'browser',
    theme_color: site.themeFarbe,
    background_color: site.themeFarbe,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
  });
};
