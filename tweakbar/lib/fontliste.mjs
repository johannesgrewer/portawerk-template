// Curated Google fonts (via Fontsource), shared by the panel and the dev
// server (the reference analysis passes this list to the model).
// The PortaWerk standards ban Inter, Roboto, Arial, Open Sans, Lato,
// Montserrat, Poppins, Nunito, Source Sans Pro, Raleway and Fraunces, so they
// are not in this list.

export const VERBOTEN = ['inter', 'roboto', 'arial', 'open-sans', 'lato', 'montserrat', 'poppins', 'nunito', 'source-sans-pro', 'raleway', 'fraunces'];

export const KURATIERT = [
  ['dm-sans', 'DM Sans', 'sans-serif'], ['manrope', 'Manrope', 'sans-serif'], ['plus-jakarta-sans', 'Plus Jakarta Sans', 'sans-serif'],
  ['outfit', 'Outfit', 'sans-serif'], ['figtree', 'Figtree', 'sans-serif'], ['work-sans', 'Work Sans', 'sans-serif'],
  ['ibm-plex-sans', 'IBM Plex Sans', 'sans-serif'], ['public-sans', 'Public Sans', 'sans-serif'], ['karla', 'Karla', 'sans-serif'],
  ['rubik', 'Rubik', 'sans-serif'], ['space-grotesk', 'Space Grotesk', 'sans-serif'], ['sora', 'Sora', 'sans-serif'],
  ['albert-sans', 'Albert Sans', 'sans-serif'], ['onest', 'Onest', 'sans-serif'], ['instrument-sans', 'Instrument Sans', 'sans-serif'],
  ['bricolage-grotesque', 'Bricolage Grotesque', 'sans-serif'], ['archivo', 'Archivo', 'sans-serif'], ['barlow', 'Barlow', 'sans-serif'],
  ['hanken-grotesk', 'Hanken Grotesk', 'sans-serif'], ['schibsted-grotesk', 'Schibsted Grotesk', 'sans-serif'], ['familjen-grotesk', 'Familjen Grotesk', 'sans-serif'],
  ['playfair-display', 'Playfair Display', 'serif'], ['cormorant-garamond', 'Cormorant Garamond', 'serif'], ['libre-baskerville', 'Libre Baskerville', 'serif'],
  ['lora', 'Lora', 'serif'], ['source-serif-4', 'Source Serif 4', 'serif'], ['newsreader', 'Newsreader', 'serif'],
  ['instrument-serif', 'Instrument Serif', 'serif'], ['dm-serif-display', 'DM Serif Display', 'serif'], ['eb-garamond', 'EB Garamond', 'serif'],
  ['crimson-pro', 'Crimson Pro', 'serif'], ['spectral', 'Spectral', 'serif'], ['young-serif', 'Young Serif', 'serif'],
  ['bodoni-moda', 'Bodoni Moda', 'serif'], ['literata', 'Literata', 'serif'],
  ['syne', 'Syne', 'sans-serif'], ['unbounded', 'Unbounded', 'display'], ['big-shoulders-display', 'Big Shoulders Display', 'display'],
  ['oswald', 'Oswald', 'sans-serif'], ['bebas-neue', 'Bebas Neue', 'display'], ['anton', 'Anton', 'sans-serif'],
  ['archivo-black', 'Archivo Black', 'sans-serif'], ['caveat', 'Caveat', 'handwriting'],
].map(([id, family, category]) => ({ id, family, category }));
