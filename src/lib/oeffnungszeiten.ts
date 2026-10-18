/**
 * oeffnungszeiten.ts — liest src/inhalte/oeffnungszeiten.json und macht daraus
 * die Anzeige (Oeffnungszeiten.astro) und das Schema (LocalBusiness.astro).
 *
 * EINE Quelle fuer beides (Vorlage Dockner + Ordnung): Vorher standen die
 * Zeiten als Klartext in site.ts und ein zweites Mal maschinenlesbar, und
 * beides lief auseinander. Die Datei ist so aufgebaut, dass sie spaeter der
 * Editor bei Uebergabe (Pages CMS) pflegen kann: je Tag eine Liste von
 * Zeitfenstern, leer = geschlossen.
 *
 * Rund um die Uhr: ein Fenster von "00:00" bis "24:00" (oder "23:59").
 * NUR EINTRAGEN, WAS DER KUNDE BESTAETIGT HAT.
 */
import daten from '../inhalte/oeffnungszeiten.json';

export const TAGE = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'] as const;
export type Tag = (typeof TAGE)[number];

export interface Zeitfenster {
  von: string;
  bis: string;
}

interface OeffnungszeitenDatei {
  tage: Partial<Record<Tag, Zeitfenster[]>>;
  hinweise?: string[];
}

const KURZ: Record<Tag, string> = { mo: 'Mo', di: 'Di', mi: 'Mi', do: 'Do', fr: 'Fr', sa: 'Sa', so: 'So' };
const SCHEMA_TAG: Record<Tag, string> = {
  mo: 'Monday', di: 'Tuesday', mi: 'Wednesday', do: 'Thursday', fr: 'Friday', sa: 'Saturday', so: 'Sunday',
};

const UHRZEIT = /^([01]\d|2[0-4]):[0-5]\d$/;

/** Fenster eines Tages, ungueltige Eintraege fallen mit Warnung beim Bauen raus. */
function fensterVon(tag: Tag): Zeitfenster[] {
  const roh = (daten as OeffnungszeitenDatei).tage?.[tag] ?? [];
  return roh.filter((fenster) => {
    const gueltig = UHRZEIT.test(fenster?.von ?? '') && UHRZEIT.test(fenster?.bis ?? '');
    if (!gueltig) console.warn(`[oeffnungszeiten] ungueltiges Zeitfenster am ${tag}: ${JSON.stringify(fenster)}`);
    return gueltig;
  });
}

const istRundUmDieUhr = (f: Zeitfenster) => f.von === '00:00' && (f.bis === '24:00' || f.bis === '23:59');

/** "08:00" -> "8", "08:30" -> "8:30" */
function uhrzeitKurz(zeit: string): string {
  const [stunde, minute] = zeit.split(':');
  return minute === '00' ? String(Number(stunde)) : `${Number(stunde)}:${minute}`;
}

function zeitenText(fenster: Zeitfenster[]): string {
  if (!fenster.length) return 'geschlossen';
  if (fenster.some(istRundUmDieUhr)) return 'rund um die Uhr';
  return `${fenster.map((f) => `${uhrzeitKurz(f.von)}–${uhrzeitKurz(f.bis)}`).join(' und ')} Uhr`;
}

/** Tage als Text: aufeinanderfolgende zusammengezogen (Mo–Fr), sonst mit Komma. */
function tageText(tage: Tag[]): string {
  if (tage.length === 7) return 'täglich';
  const indizes = tage.map((t) => TAGE.indexOf(t));
  const laeufe: number[][] = [];
  for (const i of indizes) {
    const letzter = laeufe[laeufe.length - 1];
    if (letzter && i === letzter[letzter.length - 1] + 1) letzter.push(i);
    else laeufe.push([i]);
  }
  return laeufe
    .map((lauf) => (lauf.length >= 3
      ? `${KURZ[TAGE[lauf[0]]]}–${KURZ[TAGE[lauf[lauf.length - 1]]]}`
      : lauf.map((i) => KURZ[TAGE[i]]).join(', ')))
    .join(', ');
}

export interface AnzeigeZeile {
  tage: string;
  zeiten: string;
  geschlossen: boolean;
}

/**
 * Zeilen fuer die Anzeige. Tage mit gleichen Zeiten stehen in einer Zeile,
 * in der Reihenfolge der Woche. mitGeschlossen = false laesst Ruhetage weg.
 */
export function anzeigeZeilen(mitGeschlossen = true): AnzeigeZeile[] {
  const gruppen = new Map<string, Tag[]>();
  for (const tag of TAGE) {
    const schluessel = zeitenText(fensterVon(tag));
    gruppen.set(schluessel, [...(gruppen.get(schluessel) ?? []), tag]);
  }
  return [...gruppen.entries()]
    .map(([zeiten, tage]) => ({ tage: tageText(tage), zeiten, geschlossen: zeiten === 'geschlossen' }))
    .filter((zeile) => mitGeschlossen || !zeile.geschlossen);
}

/** Hinweise unter den Zeiten, z. B. "Termine nach Vereinbarung". */
export function hinweise(): string[] {
  return ((daten as OeffnungszeitenDatei).hinweise ?? []).filter((h) => typeof h === 'string' && h.trim());
}

/** openingHoursSpecification fuer das Schema, je gleichem Zeitfenster ein Block. */
export function schemaBloecke(): Record<string, unknown>[] {
  const bloecke = new Map<string, { fenster: Zeitfenster; tage: string[] }>();
  for (const tag of TAGE) {
    for (const fenster of fensterVon(tag)) {
      const schluessel = `${fenster.von}-${fenster.bis}`;
      const block = bloecke.get(schluessel) ?? { fenster, tage: [] };
      block.tage.push(SCHEMA_TAG[tag]);
      bloecke.set(schluessel, block);
    }
  }
  return [...bloecke.values()].map(({ fenster, tage }) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: tage,
    opens: fenster.von,
    // Schema.org kennt kein 24:00, rund um die Uhr endet um 23:59.
    closes: fenster.bis === '24:00' ? '23:59' : fenster.bis,
  }));
}
