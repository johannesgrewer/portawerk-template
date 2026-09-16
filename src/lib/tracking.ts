// Zentrale Event-Namen nach dem PortaWerk-Tracking-Standard. Diese Datei wird
// zwischen Projekten unveraendert kopiert — Namen hier nie projektspezifisch
// abwandeln, sonst laesst sich spaeter nichts mehr vergleichen.
export const EVENTS = {
  ANRUF: "Anruf",
  WHATSAPP: "WhatsApp",
  MAIL: "Mail",
  FORMULAR: "Formular",
  ROUTE: "Route",
  TERMIN: "Termin",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/**
 * Pirsch-Klasse fuer ein bestehendes <a>. Fuer Bestandsseiten, deren Links
 * bereits eigenes CSS haben und die deshalb nicht auf TrackedLink umgebaut
 * werden koennen, ohne Astros scoped styles zu brechen. Neue Projekte nutzen
 * TrackedLink. pa.js liest die Klasse beim Klick aus (Schreibweise
 * `pirsch-event=Name`, Leerzeichen im Namen als `+`, hier nicht noetig).
 */
export function evt(event: EventName) {
  return `pirsch-event=${event}`;
}

/**
 * Manuelles Event, z.B. nach erfolgreichem Formular-Submit.
 * Gibt das Promise von Pirsch zurueck (oder null, wenn das Skript geblockt ist),
 * damit Aufrufer auf das Absetzen warten koennen.
 */
export function track(event: EventName, meta?: Record<string, string>): Promise<unknown> | null {
  if (typeof window !== "undefined" && typeof window.pirsch === "function") {
    try {
      return window.pirsch(event, meta ? { meta } : undefined);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Event absetzen und danach weiterleiten. Das Promise loest auf, wenn das
 * Event durch ist. Blockt ein Adblocker das Skript, gibt es kein Promise,
 * deshalb loest der Timeout die Weiterleitung ersatzweise aus. Ohne diese
 * zweite Sicherung bliebe der Nutzer nach erfolgreichem Absenden auf der
 * Seite haengen.
 */
export function trackThenGo(event: EventName, url: string, timeoutMs = 500) {
  let navigated = false;
  const go = () => {
    if (navigated) return;
    navigated = true;
    window.location.assign(url);
  };
  const pending = track(event);
  if (pending) pending.then(go, go);
  setTimeout(go, timeoutMs);
}

declare global {
  interface Window {
    pirsch?: (event: string, options?: Record<string, unknown>) => Promise<unknown>;
  }
}
