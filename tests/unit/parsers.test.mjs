// The data parsers, run on files in the real layouts.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { parseGistempPrimary, parseGistempMirror, parseCO2, parseNsidcDaily, parseEpaSeaLevel, parseStars } from '../../tools/parsers.mjs';
const raw = f => fs.readFileSync(new URL('../../data/raw/' + f, import.meta.url), 'utf8'), fx = f => fs.readFileSync(new URL('../fixtures/' + f, import.meta.url), 'utf8');

test('GISTEMP: NASA\u2019s own layout (title line, J-D column, *** for missing)', () => {
  const s = parseGistempPrimary(fx('gistemp_primary_layout.csv')); assert.equal(s.start, 1880); assert.equal(s.values.length, 30, 'the incomplete current year is skipped'); assert.equal(s.values[0], -0.17);
  assert.throws(() => parseGistempPrimary('Year,Jan,Feb\n1880,1,2'), /J-D/); assert.throws(() => parseGistempPrimary('nothing here'), /header/);
});
test('GISTEMP: datahub mirror, and it agrees with the primary layout fixture', () => {
  const m = parseGistempMirror(raw('gistemp_annual_mirror.csv')); assert.equal(m.start, 1880); assert.ok(m.values.length >= 146);
  const p = parseGistempPrimary(fx('gistemp_primary_layout.csv')); p.values.forEach((v, i) => assert.ok(Math.abs(v - m.values[i]) < 0.006));
});
test('CO2: NOAA layout and mirror layout give the same months', () => {
  const a = parseCO2(fx('co2_noaa_layout.csv')), b = parseCO2(raw('co2_mm_mlo_mirror.csv')); assert.equal(a.length, b.length); assert.deepEqual([a[0].y, a[0].m], [1958, 3]);
  a.forEach((r, i) => { assert.equal(r.y, b[i].y); assert.equal(r.m, b[i].m); assert.ok(Math.abs(r.ppm - b[i].ppm) < 0.006); });
  assert.throws(() => parseCO2('year,month,decimal date,average,deseasonalized\n' + Array.from({ length: 700 }, (_, i) => `${1958 + Math.floor(i / 12)},${i % 12 + 1},0,${300 + i / 10},${300 + i / 10}`).filter((_, i) => i !== 50).join('\n')), /gap/);
});
test('NSIDC daily extent: September means and the 5-day minimum', () => {
  const s = parseNsidcDaily(raw('nsidc_north_daily_extent.csv')); assert.equal(s[0].y, 1979); const y2012 = s.find(r => r.y === 2012), y1979 = s[0];
  assert.ok(Math.abs(y2012.minimum - 3.39) < 0.02, 'the record minimum NSIDC announced in 2012'); assert.match(y2012.minDate, /^2012-09-1[5-9]$/); assert.ok(Math.abs(y1979.september - 7.05) < 0.1);
  assert.ok(s.every(r => r.minimum <= r.september && r.september > 3 && r.september < 8.5)); assert.ok(s.every(r => /-0[89]-|-10-/.test(r.minDate)), 'minima fall in August to October');
  assert.throws(() => parseNsidcDaily('Year, Month, Day, Extent\n1979,9,1,7.0'), /too few/);
});
test('EPA sea level: CSIRO then NOAA, in millimetres', () => {
  const s = parseEpaSeaLevel(raw('epa_sea_level.csv')); assert.equal(s.start, 1880); assert.equal(s.values[0], 0); assert.equal(s.source[0], 'CSIRO'); assert.equal(s.source[1993 - 1880], 'NOAA'); assert.equal(s.source[1992 - 1880], 'CSIRO');
  assert.ok(s.values.at(-1) > 200 && s.values.at(-1) < 320); assert.ok(Math.abs(s.values[1993 - 1880] - s.values[1992 - 1880]) < 8, 'no jump where the two records meet');
});
test('Hipparcos bright stars: Sirius is brightest and where it should be', () => {
  const st = parseStars(raw('hipparcos_bright_worldwind.json'), 4.8); assert.ok(st.length > 900 && st.length < 1600); assert.ok(st[0].mag < -1.4); assert.ok(Math.abs(st[0].ra - 101.29) < 0.05 && Math.abs(st[0].dec + 16.71) < 0.05);
  assert.ok(st.every(s => s.ra >= 0 && s.ra < 360 && s.dec >= -90 && s.dec <= 90 && s.mag <= 4.8));
});
