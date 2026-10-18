# Galerie-Varianten

Sechs Wege, eine Bildstrecke zu zeigen. Alle haben **dieselbe Schnittstelle**
und sind gegeneinander austauschbar — pro Projekt wird eine gewählt, die
übrigen fliegen raus.

Entstanden am 30.07.2026 im Projekt Ferienwohnung Bockswiese, dort im
Direktvergleich auf einer Seite gebaut.

## Schnittstelle

```astro
---
import { getImage } from 'astro:assets';
import GalerieRaster from '../components/galerie/GalerieRaster.astro';
import Lightbox from '../components/galerie/Lightbox.astro';
import wohnraum from '../images/wohnraum.jpg';

const bilder = [{ bild: wohnraum, alt: 'Wohnraum mit Ecksofa …' }];

// Grosse Fassung fuer die Lightbox. Math.min gegen die Hochskalier-Falle:
// ohne die Deckelung rechnet Astro ein kleineres Original hoch.
const mitGross = await Promise.all(
  bilder.map(async (e) => ({
    ...e,
    gross: (await getImage({
      src: e.bild,
      width: Math.min(1600, e.bild.width),
      format: 'webp',
      quality: 76,
    })).src,
  }))
);
---
<GalerieRaster bilder={mitGross} />
<Lightbox />
```

| Prop | Typ | Pflicht | Bedeutung |
|---|---|---|---|
| `bilder` | `{ bild: ImageMetadata; alt: string; gross: string }[]` | ja | Reihenfolge = Anzeigereihenfolge |
| `gruppe` | `string` | nein | Lightbox-Strecke, Default je Variante |

`Lightbox.astro` muss **einmal pro Seite** eingebunden werden, sonst öffnen
die Kacheln nur die Bilddatei. Sie gruppiert nach dem Wert von
`data-lightbox` — stehen zwei Galerien auf einer Seite, braucht jede ihre
eigene `gruppe`, sonst blättert man aus der einen in die andere und der
Zähler zeigt die Summe beider.

## Welche wann

| Variante | Stärke | Nimm sie nicht, wenn |
|---|---|---|
| **Raster** | Alles auf einen Blick, kein Skript, am schnellsten | ein Motiv klar das stärkste ist |
| **Karussell** | Ein Bild groß, wenig Platzbedarf | der Überblick zählt (man sieht nur eines) |
| **Bühne** | Groß **und** Überblick, jedes Bild anspringbar | unter ~5 Bildern, dann ist die Reihe leer |
| **Mosaik** | Setzt eine Hierarchie | alle Bilder gleich gut sind, dann wirkt es willkürlich |
| **Sticky** | Führt den Blick, wirkt hochwertig | kein Text pro Bild da ist, oder die Seite kurz sein soll |
| **Mauerwerk** | Kein Beschnitt, gemischte Formate | die Reihenfolge wichtig ist (läuft spaltenweise!) |

Bei Ferienwohnungen und Immobilien ist **Bühne** der erwartete Standard.

## Fallstricke, die schon gelöst sind

Diese Punkte haben im Erstprojekt Zeit gekostet und stecken bereits im Code.
Bitte beim Anpassen nicht wieder aufreißen:

**Karussell — `scroll-snap-type: mandatory` ist unvereinbar mit Pfeiltasten.**
Chromium zieht damit jeden programmatischen Sprung sofort auf den alten
Snap-Punkt zurück, auch ein hart gesetztes `scrollLeft`. Symptom: die Bahn
bleibt stehen, scheinbar wirkt nur jeder zweite Klick. `scrollIntoView` und
`proximity` helfen nicht. Deshalb steht im CSS **kein** `scroll-snap-type`;
freies Wischen darf zwischen zwei Bildern stehen bleiben.

**Karussell — die Position darf nicht in einer Variable mitgeführt werden.**
Ein Klick muss von der tatsächlichen Scroll-Position weiterzählen, sonst
setzt ein zweiter Klick während der Animation auf einem veralteten Wert auf.

**Karussell — Randabstand als Flex-Spacer, nicht als `padding-inline`.**
Prozentuales `padding` bezieht sich auf den umgebenden Block, prozentuales
`flex-basis` auf die Content-Box des Flex-Containers. Mit `padding` standen
Folienbreite und Randabstand auf zwei verschiedenen Grundlagen, die erste
Folie konnte ihren Snap-Punkt nie erreichen.

**Karussell — Bildunterschrift braucht `min-height` für zwei Zeilen.**
Sonst springt der Fuß beim Blättern zwischen ein- und zweizeilig (gemessen:
26 auf 51 Pixel) und das ganze Karussell zuckt.

**Bühne — Beschreibung als `data-alt` am Miniatur-Link.** Das Vorschaubild
selbst hat `alt=""`, damit der Link nicht doppelt angesagt wird. Wer das
`data-alt` vergisst, bekommt eine leere Bildunterschrift.

**Sticky — der Stapel entsteht nur unter `html.js`.** Ohne Skript stehen alle
Bilder sichtbar untereinander. Inhalte dürfen nie allein per Skript sichtbar
werden.

**Sticky — `position: sticky` muss auf `.st__spalte` sitzen, nicht auf
`.st__buehne` darin.** Ein sticky Element klebt nur innerhalb seines
Elternteils. Stand es am Kind, während `align-items: start` das Grid-Item nur
so hoch wie sein Inhalt machte, war der Klebeweg genau **0**: die Bühne
scrollte weg und man sah dauerhaft nur das erste Bild — obwohl die Bilder im
Hintergrund korrekt durchwechselten. Deshalb gilt:

- Bis Tablet `display: block` auf `.st`, damit der Blockfluss den Klebeweg
  liefert.
- Ab 1000px `display: grid` **ohne** `align-items: start`; die Bildspalte
  regelt ihre Ausrichtung selbst über `align-self: start`. Ohne dieses
  `align-self` füllt sie die ganze Zeilenhöhe der Textspalte und hat wieder
  keinen Weg.

Gegenprobe nach Änderungen: `.st__spalte` muss beim Scrollen konstant bei
`top: 84px` stehen bleiben, und die Höhe von `.st__spalte` muss deutlich
kleiner sein als die von `.st__texte`.

**Lightbox — `<img>` ohne `src`-Attribut.** Ein leeres `src=""` lässt den
Browser die Seite selbst als Bild anfordern.

**Lightbox — Fokus auf den Dialog, nicht auf den Schließen-Knopf.**
`showModal()` fokussiert sonst den ersten Knopf und zieht dort einen
sichtbaren Ring, obwohl mit der Maus geöffnet wurde.

## Abhängigkeiten

- `astro:assets` (`Image`, `getImage`)
- `@lucide/astro` — `Expand`, `X`, `ChevronLeft`, `ChevronRight`
  (benannter Import, `import { Expand } from '@lucide/astro'`)
- Tokens aus `src/config/tokens.css`, insbesondere `--c-accent-text` für
  Fokusringe: auf hellem Grund wäre ein heller Akzent kaum sichtbar
