#!/usr/bin/env node
// Builds src/data.js and src/sky.js from the snapshots in data/raw.
//   node tools/build-data.mjs            use the committed snapshots (works offline)
//   node tools/build-data.mjs --online   first refresh the snapshots from the primary sources, falling back to mirrors
// Every number the app plays comes out of this script. Nothing is typed in by hand.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
import { parseGistempPrimary, parseGistempMirror, parseCO2, parseNsidcDaily, parseEpaSeaLevel, parseStars } from './parsers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const RAW = path.join(ROOT, 'data/raw');
const online = process.argv.includes('--online'); const today = new Date().toISOString().slice(0, 10);
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
const metaPath = path.join(RAW, 'SOURCES.json'); const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};

const SOURCES = {
  gistemp: { measured: 'NASA Goddard Institute for Space Studies, GISTEMP v4 (annual global mean, °C against 1951–1980)',
    tries: [ { file: 'gistemp_GLB.Ts+dSST.csv', url: 'https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv', parse: parseGistempPrimary, kind: 'primary' },
             { file: 'gistemp_annual_mirror.csv', url: 'https://raw.githubusercontent.com/datasets/global-temp/main/data/annual.csv', parse: parseGistempMirror, kind: 'mirror (datahub.io datasets/global-temp)' } ] },
  co2: { measured: 'NOAA Global Monitoring Laboratory, Mauna Loa monthly mean CO₂ (ppm)',
    tries: [ { file: 'co2_mm_mlo.csv', url: 'https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_mlo.csv', parse: parseCO2, kind: 'primary' },
             { file: 'co2_mm_mlo_mirror.csv', url: 'https://raw.githubusercontent.com/datasets/co2-ppm/main/data/co2-mm-mlo.csv', parse: parseCO2, kind: 'mirror (datahub.io datasets/co2-ppm)' } ] },
  seaice: { measured: 'NSIDC Sea Ice Index v4, daily Arctic sea-ice extent (million km²)',
    tries: [ { file: 'N_seaice_extent_daily_v4.0.csv', url: 'https://noaadata.apps.nsidc.org/NOAA/G02135/north/daily/data/N_seaice_extent_daily_v4.0.csv', parse: parseNsidcDaily, kind: 'primary' },
             { file: 'nsidc_north_daily_extent.csv', url: 'https://raw.githubusercontent.com/eigenbeam/seaice-demo/HEAD/data/N_seaice_extent_daily.csv', parse: parseNsidcDaily, kind: 'mirror (github.com/eigenbeam/seaice-demo), numeric columns only' } ] },
  sealevel: { measured: 'US EPA Climate Change Indicators: global mean sea level (CSIRO tide gauges to 1992, NOAA satellite altimetry from 1993), mm above 1880',
    tries: [ { file: 'epa_sea_level.csv', url: 'https://raw.githubusercontent.com/datasets/sea-level-rise/main/data/epa-sea-level.csv', parse: parseEpaSeaLevel, kind: 'mirror (datahub.io datasets/sea-level-rise)' } ] },
};

async function refresh(t){
  try { const r = await fetch(t.url, { headers: { 'User-Agent': 'hearth-earth-jukebox data builder' }, signal: AbortSignal.timeout(60000) }); if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer()); t.parse(buf.toString('utf8'));                       // only keep a download that parses
    fs.writeFileSync(path.join(RAW, t.file), buf); meta[t.file] = { url: t.url, retrieved: today, sha256: sha(buf) }; console.log(`  refreshed ${t.file} (${buf.length} bytes)`); return true;
  } catch (e) { console.log(`  could not refresh ${t.file}: ${e.message}`); return false; }
}
async function load(key){
  const S = SOURCES[key];
  if (online) for (const t of S.tries) if (await refresh(t)) break;
  for (const t of S.tries){ const f = path.join(RAW, t.file); if (!fs.existsSync(f)) continue; const buf = fs.readFileSync(f);
    try { const parsed = t.parse(buf.toString('utf8')); const m = meta[t.file] || {};
      return { parsed, provenance: { measured: S.measured, via: t.kind, url: m.url || t.url, retrieved: m.retrieved || 'snapshot', sha256: sha(buf), file: 'data/raw/' + t.file } };
    } catch (e) { console.log(`  ${t.file} did not parse: ${e.message}`); } }
  throw new Error(`no usable snapshot for ${key}`);
}

const out = { built: today };
{ const { parsed, provenance } = await load('gistemp'); out.gistemp = { start: parsed.start, values: parsed.values.map(v => +v.toFixed(2)), provenance }; }
{ const { parsed, provenance } = await load('seaice'); out.seaice = { start: parsed[0].y, september: parsed.map(r => +r.september.toFixed(2)), minimum: parsed.map(r => +r.minimum.toFixed(2)), minDate: parsed.map(r => r.minDate), provenance }; }
{ const { parsed, provenance } = await load('co2'); out.co2 = { startYear: parsed[0].y, startMonth: parsed[0].m, ppm: parsed.map(r => +r.ppm.toFixed(2)), trend: parsed.map(r => +r.trend.toFixed(2)), provenance }; }
{ const { parsed, provenance } = await load('sealevel'); out.sealevel = { start: parsed.start, mm: parsed.values, source: parsed.source, provenance }; }

const wrap = (name, obj, note) => `/* GENERATED by tools/build-data.mjs on ${today}. Do not edit by hand. ${note} */\n(function (root) { var H = root.Hearth = root.Hearth || {}; H.${name} = ${JSON.stringify(obj)}; if (typeof module === 'object' && module.exports) module.exports = H.${name}; })(typeof self !== 'undefined' ? self : globalThis);\n`;
fs.writeFileSync(path.join(ROOT, 'src/data.js'), wrap('Data', out, 'Sources and checksums are inside the object under "provenance".'));

// ---- sky: Hipparcos bright stars with their true positions ----
const NAMED = [ ['Sirius', 101.29, -16.72, 9940, 8.6], ['Canopus', 95.99, -52.70, 7350, 310], ['Arcturus', 213.92, 19.18, 4286, 37], ['Vega', 279.23, 38.78, 9602, 25], ['Capella', 79.17, 46.00, 4970, 43],
  ['Rigel', 78.63, -8.20, 12100, 860], ['Procyon', 114.83, 5.22, 6530, 11.5], ['Achernar', 24.43, -57.24, 15000, 139], ['Betelgeuse', 88.79, 7.41, 3500, 550], ['Altair', 297.70, 8.87, 7550, 17],
  ['Aldebaran', 68.98, 16.51, 3910, 65], ['Spica', 201.30, -11.16, 22400, 250], ['Antares', 247.35, -26.43, 3570, 550], ['Pollux', 116.33, 28.03, 4666, 34], ['Deneb', 310.36, 45.28, 8525, 2600], ['Polaris', 37.95, 89.26, 6015, 430] ];
const starBuf = fs.readFileSync(path.join(RAW, 'hipparcos_bright_worldwind.json')); const all = parseStars(starBuf.toString('utf8'), 6.5); const bright = all.filter(s => s.mag <= 4.8);
const sep = (a, b) => { const r = Math.PI / 180, d = Math.sin(a.dec * r) * Math.sin(b.dec * r) + Math.cos(a.dec * r) * Math.cos(b.dec * r) * Math.cos((a.ra - b.ra) * r); return Math.acos(Math.min(1, Math.max(-1, d))) / r; };
const named = NAMED.map(([name, ra, dec, T, ly]) => { let best = null, bd = 9; for (const s of all.slice(0, 400)){ const d = sep(s, { ra, dec }); if (d < bd){ bd = d; best = s; } }
  if (!best || bd > 0.6) throw new Error(`star ${name}: no catalogue match within 0.6° (nearest ${bd.toFixed(2)}°)`); return { name, T, ly, ra: +best.ra.toFixed(3), dec: +best.dec.toFixed(3), mag: best.mag }; });
named.push({ name: 'Proxima Centauri', T: 3042, ly: 4.24, ra: 217.429, dec: -62.680, mag: 11.13 });   // too faint for the bright-star catalogue; position from SIMBAD
const flat = []; bright.forEach(s => flat.push(Math.round(s.ra * 100), Math.round(s.dec * 100), Math.round(s.mag * 10)));
const sky = { stars: flat, count: bright.length, named, provenance: { measured: 'ESA Hipparcos catalogue (V magnitude, ICRS position), stars to magnitude 4.8', via: 'bright-star file shipped with NASA WorldWind (github.com/NASAWorldWind/WebWorldWind, images/stars.json)', sha256: sha(starBuf), file: 'data/raw/hipparcos_bright_worldwind.json' } };
fs.writeFileSync(path.join(ROOT, 'src/sky.js'), wrap('Sky', sky, 'Star positions are real; temperatures and distances of the named stars are from standard references.'));

fs.writeFileSync(metaPath, JSON.stringify(meta, null, 1) + '\n');
fs.writeFileSync(path.join(ROOT, 'data/provenance.json'), JSON.stringify({ built: today, gistemp: out.gistemp.provenance, seaice: out.seaice.provenance, co2: out.co2.provenance, sealevel: out.sealevel.provenance, sky: sky.provenance }, null, 1) + '\n');
const g = out.gistemp, s = out.seaice, c = out.co2, l = out.sealevel;
console.log(`gistemp  ${g.start}–${g.start + g.values.length - 1}  last ${g.values.at(-1)} °C   [${g.provenance.via}]`);
console.log(`seaice   ${s.start}–${s.start + s.september.length - 1}  Sept first ${s.september[0]} last ${s.september.at(-1)}; record minimum ${Math.min(...s.minimum)} on ${s.minDate[s.minimum.indexOf(Math.min(...s.minimum))]}   [${s.provenance.via}]`);
console.log(`co2      ${c.startYear}-${c.startMonth} + ${c.ppm.length} months  first ${c.ppm[0]} last ${c.ppm.at(-1)} ppm   [${c.provenance.via}]`);
console.log(`sealevel ${l.start}–${l.start + l.mm.length - 1}  last ${l.mm.at(-1)} mm   [${l.provenance.via}]`);
console.log(`sky      ${sky.count} stars to mag 4.8; ${named.length} named`);
