/**
 * worker/index.ts — Einstieg des Workers (Muster Ordnung Trier, ohne Astro-Adapter).
 *
 * Reihenfolge je Anfrage:
 *   1. www-Adresse          -> 301 auf die Hauptdomain (HAUPT_HOST, im Pitch leer)
 *   2. Prefetch-Sperre      (trafficAdvice, sonst bleiben vorgeladene Seiten ungezaehlt)
 *   3. /api/kontakt         -> @portawerk/forms. Ohne BREVO_API_KEY eine freundliche
 *                              Meldung "Vorschau", die das Formular anzeigt.
 *   4. Impressum/Datenschutz -> @portawerk/rechtstexte, nur wenn die KV-Bindung
 *                              RECHTSTEXTE da ist. Sonst die gebaute Fassung.
 *   5. alles andere         -> statische Seiten aus dist/ + Sicherheits-Header
 *   6. Pirsch               nur auf ZAEHL_HOSTS (im Pitch leer, die Vorschau zaehlt nie)
 * Zeitplan: Rechtstexte taeglich holen, nur mit Bindung und ERS_API_KEY.
 *
 * Im Pitch tut der Worker nur 2, 5 und die Vorschau-Meldung in 3. Beim Build
 * und Livegang wird nichts mehr gebaut, sondern eingeschaltet: Bindungen in
 * wrangler.jsonc aktivieren, Secrets setzen, Konstanten unten fuellen.
 *
 * WARUM DERSELBE WORKER UND NICHT EIN ZWEITER DANEBEN: gleiche Herkunft. Die
 * CSP braucht keine fremde Origin in connect-src und form-action. Genau das
 * wurde frueher regelmaessig vergessen, dann scheitert der Versand still.
 *
 * ACHTUNG: public/_headers gilt NICHT fuer Antworten, die durch diesen Worker
 * gehen. Die Sicherheits-Header kommen aus src/config/sicherheit.ts.
 *
 * SECRETS nie in eine Datei im Repo, sondern (Liste in .env.example):
 *   printf '%s' "$KEY" | npx wrangler secret put BREVO_API_KEY
 */
import { handleFormRequest, protokollUeberDurableObject } from '@portawerk/forms';
import type { DoNamensraum } from '@portawerk/forms';
import type { RateLimiter } from '@portawerk/forms/types';
/* Durable Object fuer das Formular-Ergebnisprotokoll (Bindung FORM_PROTOKOLL,
   in wrangler.jsonc vorbereitet). Muss aus dem Einstieg exportiert werden,
   schadet ohne Bindung nicht. */
export { FormularProtokoll } from '@portawerk/forms';
import { handleRechtstexte, rechtstexteAktualisieren } from '@portawerk/rechtstexte';
import { ereignisMelden, seitenaufrufMelden, trafficAdvice } from '@portawerk/messung';
import rechtstexteConfig from '../rechtstexte.config.mjs';
import { mitApiHeadern, mitSicherheitsHeadern } from '../src/config/sicherheit';
import { site } from '../src/config/site';

interface KvSpeicher {
  get(schluessel: string): Promise<string | null>;
  put(schluessel: string, wert: string): Promise<void>;
}

interface Env {
  /** Statische Dateien aus dist/. */
  ASSETS: { fetch(anfrage: Request): Promise<Response> };

  /** Brevo Transactional API. Secret. Fehlt er, meldet das Formular "Vorschau". */
  BREVO_API_KEY?: string;
  /** Wohin echte Anfragen gehen (vars in wrangler.jsonc). */
  CONTACT_TO_EMAIL?: string;
  /** Absender, muss in Brevo fuer die Domain verifiziert sein (vars). */
  CONTACT_FROM_EMAIL?: string;
  /** Nur von dieser Herkunft werden Anfragen angenommen (vars). */
  ALLOWED_ORIGIN?: string;
  /** Rate-Limiting-Bindungen (ratelimits in wrangler.jsonc). */
  FORM_RATE_LIMIT?: RateLimiter;
  CANARY_RATE_LIMIT?: RateLimiter;
  /** Gesetzt = Turnstile wird erzwungen. Erst NACH dem Site-Key in site.ts setzen. */
  TURNSTILE_SECRET_KEY?: string;
  /** Gesetzt = der PortaWerk-Monitor kann einen Testdurchlauf schicken (ab Build). */
  CANARY_TOKEN?: string;
  CANARY_TO_EMAIL?: string;
  /** Formular-Ergebnisprotokoll, nur Zaehler, keine Personendaten. */
  FORM_PROTOKOLL?: DoNamensraum;

  /** Rechtstexte: aktuelle Fassung von easyRechtssicher (KV, Livegang). */
  RECHTSTEXTE?: KvSpeicher;
  /** Schluessel der easyRechtssicher-Lizenz. Secret. */
  ERS_API_KEY?: string;

  /** Pirsch Access Key der Kundendomain. Secret. Fehlt er, wird nichts gezaehlt. */
  PIRSCH_ZUGANG?: string;
}

interface Kontext {
  waitUntil(arbeit: Promise<unknown>): void;
}

/** TODO(Livegang): Hauptdomain ohne www, z. B. 'kunde.de'. Dann leitet
 *  www.kunde.de per 301 dorthin. Leer = keine Weiterleitung. */
const HAUPT_HOST = '';

/** Nur Weg B der Bauordnung (Kundendomain auf Pages): Adresse der Kundenseite,
 *  z. B. 'https://www.kunde.de'. Dann bedient dieser Worker nur noch /api/ und
 *  leitet alles andere per 301 dorthin, sonst stuende die Seite doppelt im Netz.
 *  Leer = normaler Betrieb. */
const SEITEN_ZIEL = '';

/** TODO(Livegang): Kundendomain eintragen, z. B. ['kunde.de']. */
const ZAEHL_HOSTS = new Set<string>([]);

const VORSCHAU_MELDUNG =
  'Das ist eine Vorschau, das Formular ist hier noch nicht freigeschaltet. Bitte rufen Sie an oder schreiben Sie eine E-Mail.';

export default {
  async fetch(anfrage: Request, env: Env, ctx: Kontext): Promise<Response> {
    const adresse = new URL(anfrage.url);

    // 1. www auf die Hauptdomain, Pfad und Suchteil bleiben.
    if (HAUPT_HOST && adresse.hostname === `www.${HAUPT_HOST}`) {
      return Response.redirect(`https://${HAUPT_HOST}${adresse.pathname}${adresse.search}`, 301);
    }

    // 2. Sperrt Googles Prefetch-Proxy, sonst blieben vorgeladene Seiten ungezaehlt.
    const hinweis = trafficAdvice(anfrage);
    if (hinweis) return hinweis;

    // 3. Kontaktformular
    if (adresse.pathname === '/api/kontakt') {
      if (!env.BREVO_API_KEY || !env.CONTACT_TO_EMAIL || !env.CONTACT_FROM_EMAIL || !env.ALLOWED_ORIGIN) {
        return mitApiHeadern(Response.json({ ok: false, error: VORSCHAU_MELDUNG }, { status: 503 }));
      }

      const antwort = await handleFormRequest(
        anfrage,
        {
          brevoApiKey: env.BREVO_API_KEY,
          toEmail: env.CONTACT_TO_EMAIL,
          fromEmail: env.CONTACT_FROM_EMAIL,
          allowedOrigin: env.ALLOWED_ORIGIN,
          fromName: `Formular ${site.nameKurz ?? site.name}`,
          /* Eingangsbestaetigung an den Anfragenden. Geht nur raus, wenn
             Turnstile eingerichtet ist, und enthaelt nichts aus dem Formular.
             antwortHinweis nennt belegte Zeiten, keine Frist wie "in 24 h". */
          bestaetigung: {
            firma: site.name,
            // antwortHinweis: 'Sie erreichen uns werktags von 8 bis 17 Uhr unter 0651 ...',
          },
          /* Hausfarben fuer die Mails (tokens.css), optional:
          gestaltung: { akzent: '#C2410C', dunkel: '#1C1917', fussZeilen: ['Strasse 1 · 54290 Trier'] }, */
          rateLimiter: env.FORM_RATE_LIMIT,
          protokoll: env.FORM_PROTOKOLL ? protokollUeberDurableObject(env.FORM_PROTOKOLL) : undefined,
          /* Zeitpruefung ueber das Feld `_t` aus ContactForm.astro. Ein Signal:
             zu schnell oder fehlend = "[Spamverdacht]" im Betreff. */
          zeitpruefung: {},
          turnstileSecret: env.TURNSTILE_SECRET_KEY,
          /* Nur echte, zugestellte Anfragen: kein Canary, kein Honeypot. */
          onDelivered: () => ereignisMelden(anfrage, 'Formular', { zugang: env.PIRSCH_ZUGANG }),
          canary:
            env.CANARY_TOKEN && env.CANARY_TO_EMAIL
              ? { token: env.CANARY_TOKEN, toEmail: env.CANARY_TO_EMAIL, limiter: env.CANARY_RATE_LIMIT }
              : undefined,
          /* Monatstest an den Kunden (Livegang, /portawerk-deliver):
          monatstest: { anrede: 'Sie', name: '[Name]', domain: '[kunde.de]' }, */
        },
        { waitUntil: (arbeit) => ctx.waitUntil(arbeit) },
      );
      return mitApiHeadern(antwort);
    }

    // Weg B: Die Seiten liegen auf Pages, hier bleibt nur die API.
    if (SEITEN_ZIEL && !adresse.pathname.startsWith('/api/')) {
      return Response.redirect(`${SEITEN_ZIEL}${adresse.pathname}${adresse.search}`, 301);
    }

    // 4. Impressum, Datenschutz, /api/rechtstexte/stand. Liest nur aus dem
    // Speicher, ein Besucher wartet nie auf easyRechtssicher.
    const rechtstext = env.RECHTSTEXTE
      ? await handleRechtstexte(anfrage, { assets: env.ASSETS, speicher: env.RECHTSTEXTE })
      : null;

    // 5. Alles andere: statische Seiten.
    const antwort = mitSicherheitsHeadern(rechtstext ?? (await env.ASSETS.fetch(anfrage)));

    // 6. Laeuft nach der Antwort weiter, der Besucher wartet nie auf Pirsch.
    if (ZAEHL_HOSTS.has(adresse.hostname)) {
      ctx.waitUntil(
        seitenaufrufMelden(anfrage, antwort, { zugang: env.PIRSCH_ZUGANG }).catch((fehler) => {
          console.error('[messung] Meldung an Pirsch fehlgeschlagen', fehler);
        }),
      );
    }
    return antwort;
  },

  /** Zeitplan aus wrangler.jsonc (triggers.crons): Rechtstexte aktualisieren. */
  async scheduled(_ereignis: unknown, env: Env, ctx: Kontext): Promise<void> {
    if (!env.RECHTSTEXTE || !env.ERS_API_KEY) {
      console.warn('[rechtstexte] Zeitplan ohne RECHTSTEXTE-Bindung oder ERS_API_KEY, nichts geholt');
      return;
    }
    ctx.waitUntil(
      rechtstexteAktualisieren({
        speicher: env.RECHTSTEXTE,
        schluessel: env.ERS_API_KEY,
        config: rechtstexteConfig,
      }),
    );
  },
};
