// The generated data, and every factual claim the narration makes about it.
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const D = require('../../src/data.js'), S = require('../../src/sky.js'), C = require('../../src/core.js');
const year = (series, start, y) => series[y - start];

test('every dataset carries its provenance', () => { for (const k of ['gistemp', 'seaice', 'co2', 'sealevel']) { const p = D[k].provenance; assert.ok(p.measured.length > 20 && p.via && /^https:\/\//.test(p.url) && /^[0-9a-f]{16}$/.test(p.sha256) && p.file.startsWith('data/raw/'), k); } assert.match(D.built, /^\d{4}-\d{2}-\d{2}$/); assert.ok(S.provenance.measured.includes('Hipparcos')); });
test('temperature: complete, in range, and warming', () => {
  const g = D.gistemp; assert.equal(g.start, 1880); assert.ok(g.values.length >= 146); assert.ok(g.values.every(v => v > -0.7 && v < 2)); assert.ok(year(g.values, 1880, 2024) > 1.2 && year(g.values, 1880, 1909) < -0.4);
});
test('claim: "every one of the ten warmest years has come since 2015"', () => { const w = C.warmestYears(D.gistemp.values, D.gistemp.start, 10); assert.ok(w.every(y => y >= 2015), w.join(' ')); });
test('claim: "for sixty years it wanders low": no year before 1940 is warmer than +0.05', () => { assert.ok(D.gistemp.values.slice(0, 60).every(v => v <= 0.05)); });
test('sea ice: complete, and the September mean has fallen by about a third', () => {
  const s = D.seaice; assert.equal(s.start, 1979); assert.equal(s.september.length, s.minimum.length); assert.ok(s.september.length >= 47);
  const first5 = s.september.slice(0, 5).reduce((a, b) => a + b) / 5, last5 = s.september.slice(-5).reduce((a, b) => a + b) / 5; assert.ok(last5 / first5 < 0.72 && last5 / first5 > 0.55, (last5 / first5).toFixed(2));
});
test('claim: "in 1979, seven million square kilometres; in 2012, three and a half"', () => { assert.ok(Math.abs(year(D.seaice.september, 1979, 1979) - 7.0) < 0.15); assert.ok(Math.abs(year(D.seaice.september, 1979, 2012) - 3.5) < 0.15); assert.equal(Math.min(...D.seaice.minimum), year(D.seaice.minimum, 1979, 2012)); });
test('CO2: starts March 1958 near 316 ppm and has passed 420', () => {
  const c = D.co2; assert.deepEqual([c.startYear, c.startMonth], [1958, 3]); assert.equal(c.ppm.length, c.trend.length); assert.ok(Math.abs(c.ppm[0] - 315.7) < 0.2); assert.ok(c.ppm.at(-1) > 420 && c.ppm.at(-1) < 440);
  assert.ok(c.ppm.every((v, i) => v > 310 && v < 440 && Math.abs(v - c.trend[i]) < 5), 'the seasonal breath is never more than 5 ppm from the trend');
});
test('claim: "the breath is about six parts per million deep, highest in May"', () => {
  const c = D.co2; let hiMay = 0, n = 0; for (let y = 1960; y <= 2024; y++) { const i0 = (y - c.startYear) * 12 - (c.startMonth - 1); const yr = c.ppm.slice(i0, i0 + 12).map((v, k) => v - c.trend[i0 + k]); const swing = Math.max(...yr) - Math.min(...yr); assert.ok(swing > 4.5 && swing < 9, `${y}: ${swing.toFixed(1)}`); if (yr.indexOf(Math.max(...yr)) === 4) hiMay++; n++; }
  assert.ok(hiMay / n > 0.85, `May is the peak in ${hiMay} of ${n} years`);
});
test('claim: "it passed 350 in the late 1980s and 400 in the 2010s" (trend line)', () => { const c = D.co2, yr = i => c.startYear + Math.floor((c.startMonth - 1 + i) / 12); const y350 = yr(C.firstReaching(c.trend, 350)), y400 = yr(C.firstReaching(c.trend, 400)); assert.ok(y350 >= 1986 && y350 <= 1989, y350); assert.ok(y400 >= 2014 && y400 <= 2016, y400); });
test('sea level: rises about a quarter of a metre, and faster now than a century ago', () => {
  const l = D.sealevel; assert.equal(l.start, 1880); assert.equal(l.mm[0], 0); const last = l.mm.at(-1); assert.ok(last > 230 && last < 290, last);
  const early = C.rateOver(l.mm, 1930 - 1880, 30), late = C.rateOver(l.mm, l.mm.length - 1, 30); assert.ok(late > early * 1.7, `1900–1930 ${early.toFixed(2)} mm/yr, last 30 years ${late.toFixed(2)} mm/yr`); assert.ok(late > 2.8 && late < 4.5);
});
test('sky: the named stars sit at their catalogue positions and Orion is where it belongs', () => {
  assert.equal(S.stars.length, S.count * 3); assert.equal(S.named.length, 17); const by = Object.fromEntries(S.named.map(s => [s.name, s]));
  assert.ok(Math.abs(by.Betelgeuse.ra - 88.79) < 0.1 && Math.abs(by.Rigel.dec + 8.2) < 0.1); assert.ok(by.Polaris.dec > 89); assert.ok(by.Sirius.mag < by.Canopus.mag && by.Canopus.mag < by.Arcturus.mag);
  const [x, y, z] = C.raDecToXYZ(by.Polaris.ra, by.Polaris.dec, 1); assert.ok(y > 0.999 && Math.hypot(x, z) < 0.02, 'Polaris is at the pole');
  for (let i = 0; i < S.stars.length; i += 3) { assert.ok(S.stars[i] >= 0 && S.stars[i] < 36000 && Math.abs(S.stars[i + 1]) <= 9000 && S.stars[i + 2] <= 48); }
});
