/**
 * worker/index.ts — Einstieg des Workers.
 *
 * Liefert die statischen Seiten aus dist/ (Bindung ASSETS), setzt die
 * Sicherheits-Header und meldet Seitenaufrufe serverseitig an Pirsch
 * (@portawerk/messung). Im Browser laeuft kein Mess-Skript, Klicks auf
 * Telefon und Mail werden nicht gezaehlt. Muster wie HGS Becker und Ordnung.
 *
 * Gezaehlt wird nur auf den Hosts in ZAEHL_HOSTS. Im Pitch bleibt die Liste
 * leer, die Vorschau auf *.portawerk.de zaehlt nie. Beim Livegang
 * (/portawerk-deliver Phase 5a) Kundendomain eintragen und PIRSCH_ZUGANG setzen.
 *
 * Kontaktformular (erst im Build): /api/kontakt hier vor der Asset-Auslieferung
 * beantworten (@portawerk/forms), Vorbild HGS Becker worker/index.ts. Dort mit
 * onDelivered: () => ereignisMelden(anfrage, 'Formular', { zugang: env.PIRSCH_ZUGANG }).
 *
 * ACHTUNG: public/_headers gilt NICHT fuer Antworten, die durch diesen Worker
 * gehen. Die Sicherheits-Header kommen aus src/config/sicherheit.ts.
 *
 * SECRETS nie in eine Datei im Repo, sondern:
 *   printf '%s' "$KEY" | npx wrangler secret put PIRSCH_ZUGANG
 */
import { seitenaufrufMelden, trafficAdvice } from '@portawerk/messung';
import { mitSicherheitsHeadern } from '../src/config/sicherheit';

interface Env {
  /** Statische Dateien aus dist/. */
  ASSETS: { fetch(anfrage: Request): Promise<Response> };
  /** Pirsch Access Key der Kundendomain. Secret. Fehlt er, wird nichts gezaehlt. */
  PIRSCH_ZUGANG?: string;
}

interface Kontext {
  waitUntil(arbeit: Promise<unknown>): void;
}

/** TODO(Livegang): Kundendomain eintragen, z. B. ['kunde.de', 'www.kunde.de']. */
const ZAEHL_HOSTS = new Set<string>([]);

export default {
  async fetch(anfrage: Request, env: Env, ctx: Kontext): Promise<Response> {
    // Sperrt Googles Prefetch-Proxy, sonst blieben vorgeladene Seiten ungezaehlt.
    const hinweis = trafficAdvice(anfrage);
    if (hinweis) return hinweis;

    const antwort = mitSicherheitsHeadern(await env.ASSETS.fetch(anfrage));

    // Laeuft nach der Antwort weiter, der Besucher wartet nie auf Pirsch.
    const zaehlen = ZAEHL_HOSTS.has(new URL(anfrage.url).hostname);
    if (zaehlen) {
      ctx.waitUntil(
        seitenaufrufMelden(anfrage, antwort, { zugang: env.PIRSCH_ZUGANG }).catch((fehler) => {
          console.error('[messung] Meldung an Pirsch fehlgeschlagen', fehler);
        }),
      );
    }
    return antwort;
  },
};
