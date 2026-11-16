# Hearth — hear Earth

An Earth Information Jukebox for the 2026 NASA Space Apps Challenge: NASA Earth data as sound, built to be used without sight.

- **Run it:** open `dist/hearth.html` (one file), or serve this folder (`node tools/serve.mjs`) and open `index.html`.
- **Publish it:** put this folder in a public repository and turn on GitHub Pages for the root.

## What is in it

**Earth (keys 1–5, E)**: Earth (Schumann resonance, NASA day/night globe); A warming world (GISTEMP 1880–2025); Vanishing ice (NSIDC, 1979–2025);
The breathing planet (Mauna Loa CO₂, 1958–2026, monthly); Rising seas (EPA/CSIRO/NOAA, 1880–2023); and the **Earth Information Center**:
two NASA frames built in (Blue Marble, Earth at night 2012), 14 whole-Earth layers fetched live from NASA GIBS, twelve-month time-lapses,
or any image or video you drop in, each read through a lens for its dataset (night lights, ocean, lightning, carbon, forest).

**Sky (keys 6–0, -, =)**: Aurora (live NOAA Kp when reachable), Moon, Sun, Stars (real Hipparcos sky), Comet (Halley), Asteroid (Eros), Deep space.

**For every scene:** narration (N), spoken live data and provenance (D), a legend that plays each sound with its meaning (L), 60 s WAV export
rendered offline (S), a 3D picture driven by the same state as the sound. In the EIC scene, X lets you explore a frame by arrow keys or touch.
Preferences (P): voice, auto-narration, binaural placement, screen-reader announcements, captions, 3D / ring / no picture, motion, theme, haptics.

## Data: nothing is typed in by hand

`node tools/build-data.mjs` builds `src/data.js` and `src/sky.js` from the snapshots in `data/raw/`, recording source, URL and checksum
(`data/provenance.json`). `--online` refreshes from NASA GISS, NOAA GML and NSIDC directly, falling back to the mirrors used here.

## Tests

`npm run test:unit` — 40 tests: physics and mappings, picture analysis and lenses, parsers on real file layouts, and every factual
claim the narration makes, checked against the data. In a real headless Chromium (WebGL + Web Audio) all 13 scenes were started,
their 3D scenes built without error, and five were rendered offline to audio with sane levels. Not yet automated as a committed
end-to-end suite; live GIBS and NOAA requests could not be exercised from the build sandbox and fail gracefully if unreachable.

## Credits

NASA Earth Observatory (Blue Marble, Black Marble) via NASA WorldWind; NASA GIBS/ESDIS; NASA GISS; NOAA GML; NSIDC; US EPA/CSIRO/NOAA;
ESA Hipparcos. Three.js (MIT). Code MIT. Built with Anthropic's Claude as a coding and writing assistant; all sound is synthesised from data.
