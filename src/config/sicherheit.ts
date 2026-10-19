/**
 * sicherheit.ts — Sicherheits-Header fuer alles, was durch den Worker laeuft.
 *
 * worker/index.ts setzt sie auf jede Seite. public/_headers gilt nur fuer die
 * Dateiordner (/_astro, /fonts, /images), die am Worker vorbeigehen, und muss
 * von Hand gleich gehalten werden. Wer hier etwas aendert, aendert es dort mit.
 *
 * Kein api.pirsch.io: gezaehlt wird serverseitig (@portawerk/messung).
 * Turnstile braucht challenges.cloudflare.com in script-src, connect-src und
 * frame-src. Das Formular postet an /api/kontakt auf derselben Herkunft.
 *
 * Pitch-Leiste: cockpit.portawerk.de steht nur drin, solange site.pitchLeiste
 * gesetzt ist. Faellt der Eintrag beim Livegang weg, schliesst sich die
 * Freigabe von selbst.
 */
import { site } from './site';

const COCKPIT = site.pitchLeiste ? ' https://cockpit.portawerk.de' : '';

export const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${COCKPIT}`,
  `style-src 'self' 'unsafe-inline'${COCKPIT}`,
  "font-src 'self'",
  "img-src 'self' data:",
  `connect-src 'self' https://challenges.cloudflare.com${COCKPIT}`,
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export const SICHERHEITS_HEADER: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': CSP,
};

/**
 * Header fuer Antworten, die der Worker selbst erzeugt (/api/kontakt).
 * Reines JSON, braucht nichts nachzuladen, wird nie zwischengespeichert.
 */
export const API_HEADER: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

/** Setzt API_HEADER auf eine Worker-Antwort (ueberschreibt, was dort steht). */
export function mitApiHeadern(antwort: Response): Response {
  const kopf = new Headers(antwort.headers);
  for (const [name, wert] of Object.entries(API_HEADER)) kopf.set(name, wert);
  return new Response(antwort.body, {
    status: antwort.status,
    statusText: antwort.statusText,
    headers: kopf,
  });
}

/**
 * Header, die der Worker immer ueberschreibt. Die Asset-Auslieferung haengt
 * die Regel "/*" aus public/_headers auch an Seiten an. Deren CSP kennt
 * cockpit.portawerk.de nicht, die Pitch-Leiste wurde blockiert
 * (Mathecoach, 19.10.2026). Fuer Seiten gilt deshalb immer diese Datei.
 * X-Robots-Tag: damit der noindex der Pitch-Vorschau sicher ankommt.
 */
const IMMER_SETZEN = new Set(['Content-Security-Policy', 'X-Robots-Tag']);

/**
 * Ergaenzt fehlende Sicherheits-Header. Was eine Antwort selbst setzt, bleibt,
 * ausser bei IMMER_SETZEN.
 * Umpacken statt direkt schreiben: Antworten aus der Asset-Auslieferung tragen
 * festgeschriebene Kopfzeilen ("Can't modify immutable headers").
 */
export function mitSicherheitsHeadern(antwort: Response): Response {
  const kopf = new Headers(antwort.headers);
  for (const [name, wert] of Object.entries(SICHERHEITS_HEADER)) {
    if (IMMER_SETZEN.has(name) || !kopf.has(name)) kopf.set(name, wert);
  }
  return new Response(antwort.body, {
    status: antwort.status,
    statusText: antwort.statusText,
    headers: kopf,
  });
}
