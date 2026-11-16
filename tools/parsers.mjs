// Parsers for the datasets Hearth sonifies. Pure functions: text in, plain objects out.
// Each has a unit test in tests/unit/parsers.test.mjs that runs it on a fixture in the real file format.

const num = s => { const v = parseFloat(String(s).trim()); return Number.isFinite(v) ? v : null; };
const lines = text => text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);

/** NASA GISS GISTEMP v4 "GLB.Ts+dSST.csv" (primary). Annual mean is the J-D column. Missing is "***". */
export function parseGistempPrimary(text){
  const rows = lines(text); const hi = rows.findIndex(l => /^Year,Jan,/.test(l)); if (hi < 0) throw new Error('GISTEMP: header row not found');
  const head = rows[hi].split(','); const jd = head.indexOf('J-D'); if (jd < 0) throw new Error('GISTEMP: J-D column not found');
  const out = []; for (const l of rows.slice(hi + 1)){ const p = l.split(','); const y = parseInt(p[0], 10), v = num(p[jd]); if (Number.isInteger(y) && v !== null) out.push([y, v]); }
  return series(out, 'GISTEMP');
}
/** datahub "datasets/global-temp" annual.csv (mirror of NASA GISS and NOAA): Source,Year,Mean */
export function parseGistempMirror(text){
  const out = []; for (const l of lines(text)){ const p = l.split(','); if (p[0] === 'GISTEMP'){ const y = parseInt(p[1], 10), v = num(p[2]); if (Number.isInteger(y) && v !== null) out.push([y, v]); } }
  return series(out, 'GISTEMP mirror');
}
/** NOAA GML Mauna Loa monthly mean CO2 (primary "co2_mm_mlo.csv": # comments, then year,month,decimal date,average,deseasonalized,...)
 *  and the datahub mirror ("YYYY-MM,decimal,average,deseasonalized,..."). Returns months in order with the seasonal part separated. */
export function parseCO2(text){
  const out = [];
  for (const l of lines(text)){
    if (l.startsWith('#') || /^[A-Za-z]/.test(l)) continue; const p = l.split(',');
    let y, m, avg, trend;
    if (/^\d{4}-\d{2}$/.test(p[0])){ [y, m] = p[0].split('-').map(Number); avg = num(p[2]); trend = num(p[3]); }
    else { y = parseInt(p[0], 10); m = parseInt(p[1], 10); avg = num(p[3]); trend = num(p[4]); }
    if (!Number.isInteger(y) || !(m >= 1 && m <= 12)) continue;
    if (avg === null || avg < 0) avg = trend; if (avg === null || avg < 0) continue; if (trend === null || trend < 0) trend = avg;
    out.push({ y, m, ppm: avg, trend });
  }
  out.sort((a, b) => a.y - b.y || a.m - b.m);
  for (let i = 1; i < out.length; i++){ const a = out[i - 1], b = out[i]; const step = (b.y - a.y) * 12 + (b.m - a.m); if (step !== 1) throw new Error(`CO2: gap or duplicate between ${a.y}-${a.m} and ${b.y}-${b.m}`); }
  if (out.length < 600) throw new Error('CO2: too few months');
  return out;
}
/** NSIDC Sea Ice Index daily extent, Northern Hemisphere ("N_seaice_extent_daily_v4.0.csv"): Year, Month, Day, Extent, Missing, ...
 *  Returns, for each complete year, the mean of the September daily extents and the annual minimum of the
 *  5-day trailing mean (NSIDC's convention for announcing the minimum) with its date. */
export function parseNsidcDaily(text){
  const days = [];
  for (const l of lines(text)){ const p = l.split(','); const y = parseInt(p[0], 10), m = parseInt(p[1], 10), d = parseInt(p[2], 10), e = num(p[3]); if (Number.isInteger(y) && m >= 1 && m <= 12 && d >= 1 && e !== null && e > 0 && e < 25) days.push({ y, m, d, e, t: Date.UTC(y, m - 1, d) / 86400000 }); }
  if (days.length < 5000) throw new Error('NSIDC: too few daily rows');
  const byYear = new Map(); days.forEach(r => { if (!byYear.has(r.y)) byYear.set(r.y, []); byYear.get(r.y).push(r); });
  const out = [];
  for (const [y, rows] of [...byYear].sort((a, b) => a[0] - b[0])){
    const sep = rows.filter(r => r.m === 9); const oct = rows.filter(r => r.m === 10); if (sep.length < 12 || !oct.length) continue;   // need a whole September
    const september = sep.reduce((s, r) => s + r.e, 0) / sep.length;
    let min = Infinity, minRow = null;
    for (const r of rows){ if (r.m < 8 || r.m > 10) continue; const win = rows.filter(q => q.t <= r.t && q.t > r.t - 5); if (win.length < 2) continue; const avg = win.reduce((s, q) => s + q.e, 0) / win.length; if (avg < min){ min = avg; minRow = r; } }
    out.push({ y, september: +september.toFixed(3), minimum: +min.toFixed(3), minDate: `${y}-${String(minRow.m).padStart(2, '0')}-${String(minRow.d).padStart(2, '0')}`, n: sep.length });
  }
  for (let i = 1; i < out.length; i++) if (out[i].y !== out[i - 1].y + 1) throw new Error(`NSIDC: missing year after ${out[i - 1].y}`);
  return out;
}
/** US EPA Climate Change Indicators, global mean sea level (inches relative to 1880):
 *  Year,CSIRO Adjusted Sea Level,Lower Error Bound,Upper Error Bound,NOAA Adjusted Sea Level
 *  CSIRO tide-gauge reconstruction to 2013, NOAA satellite altimetry from 1993. We take CSIRO until 1992 and NOAA after, as millimetres. */
export function parseEpaSeaLevel(text){
  const out = [];
  for (const l of lines(text)){ const p = l.split(','); const y = parseInt(p[0], 10); if (!Number.isInteger(y)) continue; const csiro = num(p[1]), noaa = num(p[4]); const inches = (y >= 1993 && noaa !== null) ? noaa : csiro; if (inches === null) continue; out.push([y, +(inches * 25.4).toFixed(1), (y >= 1993 && noaa !== null) ? 'NOAA' : 'CSIRO']); }
  const s = series(out.map(r => [r[0], r[1]]), 'EPA sea level'); s.source = out.map(r => r[2]); return s;
}
/** Hipparcos bright stars as shipped with NASA WorldWind: { metadata, data: [[vmag, ra_deg, dec_deg], ...] } */
export function parseStars(json, magLimit = 4.8){
  const d = typeof json === 'string' ? JSON.parse(json) : json; const names = d.metadata.map(m => m.name); const iv = names.indexOf('vmag'), ir = names.indexOf('ra'), id = names.indexOf('dec');
  if (iv < 0 || ir < 0 || id < 0) throw new Error('stars: unexpected columns');
  return d.data.filter(r => r[iv] !== null && r[ir] !== null && r[id] !== null && r[iv] <= magLimit).map(r => ({ mag: r[iv], ra: r[ir], dec: r[id] })).sort((a, b) => a.mag - b.mag);
}
function series(pairs, label){
  pairs.sort((a, b) => a[0] - b[0]); if (pairs.length < 20) throw new Error(`${label}: too few rows`);
  for (let i = 1; i < pairs.length; i++) if (pairs[i][0] !== pairs[i - 1][0] + 1) throw new Error(`${label}: missing year after ${pairs[i - 1][0]}`);
  return { start: pairs[0][0], values: pairs.map(p => p[1]) };
}
