/**
 * IndexNow: meldet alle Adressen aus der Live-Sitemap an Bing, Yandex, Seznam
 * und Naver (ein Aufruf bei api.indexnow.org reicht fuer alle).
 *
 * Warum: Google hatte hgsbecker.de einen Tag nach dem Livegang indexiert,
 * Bing nicht (Launch-Check HGS Becker, 17.10.2026). ChatGPT-Suche, Copilot
 * und DuckDuckGo greifen auf Bing zurueck.
 *
 * EINRICHTEN BEIM LIVEGANG: Schluessel erzeugen
 *   node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
 * Datei public/<schluessel>.txt mit dem Schluessel als Inhalt anlegen, HOST
 * und KEY unten setzen, deployen, dann dieses Skript laufen lassen.
 *
 * Laeuft NACH dem Deploy, weil es die Sitemap der Live-Seite liest:
 *   node scripts/indexnow.mjs
 *
 * Der Schluessel ist kein Geheimnis. IndexNow prueft ihn, indem es die Datei
 * public/<schluessel>.txt auf der Domain abruft, deren Inhalt der Schluessel
 * selbst ist. Neuer Schluessel = neue Datei und KEY unten anpassen.
 *
 * Beendet mit Code 1, wenn die Meldung scheitert.
 */
const HOST = ''; // TODO(Livegang): Kundendomain ohne www, z. B. 'kunde.de'
const KEY = ''; // TODO(Livegang): 32 Hex-Zeichen, siehe oben
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const SITEMAP_INDEX = `https://${HOST}/sitemap-index.xml`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

/** Alle <loc>-Eintraege einer Sitemap-Datei. */
async function adressenAus(sitemapUrl) {
  const antwort = await fetch(sitemapUrl);
  if (!antwort.ok) throw new Error(`${sitemapUrl} antwortet ${antwort.status}`);
  const xml = await antwort.text();
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((treffer) => treffer[1]);
}

async function main() {
  if (!HOST || !KEY) {
    console.error('IndexNow: HOST und KEY in scripts/indexnow.mjs zuerst setzen (Anleitung im Kopf der Datei).');
    process.exitCode = 1;
    return;
  }
  try {
    // Der Index verweist auf die eigentlichen Sitemaps (sitemap-0.xml usw.).
    const sitemaps = await adressenAus(SITEMAP_INDEX);
    const urlList = [];
    for (const sitemap of sitemaps) urlList.push(...(await adressenAus(sitemap)));

    // Nur Adressen der eigenen Domain, sonst lehnt IndexNow die ganze Meldung ab.
    const eigene = [...new Set(urlList)].filter((adresse) => new URL(adresse).hostname === HOST);
    if (!eigene.length) throw new Error('Sitemap enthaelt keine Adressen');

    const antwort = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: eigene }),
    });

    // 200 = angenommen, 202 = angenommen, Schluessel wird noch geprueft.
    if (antwort.status !== 200 && antwort.status !== 202) {
      const text = await antwort.text().catch(() => '');
      throw new Error(`IndexNow antwortet ${antwort.status} ${text}`.trim());
    }
    console.log(`IndexNow: ${eigene.length} Adressen gemeldet (Status ${antwort.status})`);
    for (const adresse of eigene) console.log(`  ${adresse}`);
  } catch (fehler) {
    console.error(`IndexNow fehlgeschlagen: ${fehler instanceof Error ? fehler.message : fehler}`);
    process.exitCode = 1;
  }
}

await main();
