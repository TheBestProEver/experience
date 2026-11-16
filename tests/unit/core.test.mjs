// Unit tests for the pure core: physics, music mapping, picture analysis, lenses, services, files.
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const C = createRequire(import.meta.url)('../../src/core.js');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);

test('light becomes pitch by whole octaves: auroral lines', () => {
  near(C.lightToAudio(557.7), 488.9, 0.2, 'oxygen green'); near(C.lightToAudio(630.0), 432.8, 0.2, 'oxygen red'); near(C.lightToAudio(427.8), 637.4, 0.3, 'nitrogen violet');
  near(C.lightToAudio(557.7) / C.lightToAudio(630.0), 630.0 / 557.7, 1e-9, 'ratios between colours survive the shift');
  assert.equal(C.noteOf(C.lightToAudio(557.7), 433).name, 'B4'); assert.equal(C.noteOf(C.lightToAudio(630.0), 433).name, 'A4');
});
test('the Sun sings an A and Earth a B', () => {
  const sun = 3.33e-3 * 2 ** 17; near(sun, 436.5, 0.1); assert.equal(C.noteOf(sun).name, 'A4'); assert.ok(Math.abs(C.noteOf(sun).cents) < 20);
  const earth = 7.83 * 64; near(earth, 501.1, 0.1); assert.equal(C.noteOf(earth).name, 'B4');
});
test('Wien: hotter stars are higher, and the Sun peaks near 502 nm', () => {
  near(C.WIEN / 5772 * 1e9, 502, 1); assert.ok(C.tempToAudio(12100) > C.tempToAudio(5772) && C.tempToAudio(5772) > C.tempToAudio(3500));
  near(C.tempToAudio(5772), 543, 1); const hot = C.bbRGB(15000), cool = C.bbRGB(3500); assert.ok(hot[2] > hot[0] - 0.4 && cool[0] > cool[2], 'hot stars are bluer than cool ones');
});
test('note names and MIDI round trip', () => {
  assert.equal(C.noteOf(440).label, 'A4'); assert.equal(C.noteOf(261.63).name, 'C4'); near(C.m2f(69), 440, 1e-9); near(C.f2m(C.m2f(52.5)), 52.5, 1e-9);
});
test('Moon phase on known dates', () => {
  assert.equal(C.moonPhase(new Date('2024-04-08T18:21:00Z')).name, 'new moon');          // total solar eclipse
  assert.ok(C.moonPhase(new Date('2024-04-08T18:21:00Z')).illum < 0.01);
  assert.equal(C.moonPhase(new Date('2025-03-14T06:55:00Z')).name, 'full moon');         // total lunar eclipse
  assert.ok(C.moonPhase(new Date('2025-03-14T06:55:00Z')).illum > 0.99);
  const q = C.moonPhase(new Date('2026-11-17T12:00:00Z')); assert.ok(q.illum > 0.4 && q.illum < 0.7, 'near first quarter, about half lit');
});
test('Kepler: Halley at perihelion and aphelion matches the published orbit', () => {
  const p = C.halley(0); near(p.r, 0.586, 0.01, 'perihelion distance AU'); near(p.v, 54.5, 0.4, 'perihelion speed km/s'); near(p.nu, 0, 1e-6);
  const a = C.halley(C.HALLEY.P / 2); near(a.r, 35.1, 0.2, 'aphelion AU'); near(a.v, 0.9, 0.1, 'aphelion km/s');
  const before = C.halley(-0.5), after = C.halley(0.5); near(before.r, after.r, 1e-6, 'symmetric about perihelion'); assert.ok(before.nu < 0 && after.nu > 0);
  for (const M of [0.01, 0.5, 2, 3.1, 5.9]) { const E = C.keplerE(M, 0.967); near(E - 0.967 * Math.sin(E), M, 1e-9, 'solves Kepler\u2019s equation'); }
  assert.equal(C.cometActivity(5), 0); assert.ok(C.cometActivity(1) > C.cometActivity(2.5)); assert.ok(C.logRadius(35) < 6 && C.logRadius(0.6) > 0.5);
});
test('Eros light curve: double-peaked, about 1.2 magnitudes', () => {
  near(2.5 * Math.log10(C.erosArea(Math.PI / 2) / C.erosArea(0)), 1.22, 0.05); near(C.erosArea(0.3), C.erosArea(Math.PI - 0.3), 1e-12); near(C.erosArea(0.3), C.erosArea(Math.PI + 0.3), 1e-12);
});
test('data mappings are monotonic and anchored', () => {
  near(C.anomalyToFreq(0), 220, 1e-9); assert.ok(C.anomalyToFreq(1.2) > C.anomalyToFreq(0.2)); assert.equal(C.anomalyTension(0.1), 0); assert.ok(C.anomalyTension(1.2) > 0.8);
  near(C.ppmToFreq(315), 220, 1e-9); near(C.ppmToFreq(375), 440, 1e-6); assert.equal(C.ppmTension(340), 0); assert.ok(C.ppmTension(426) > 0.9);
  near(C.seaToFreq(260), 220, 1e-6); near(C.iceVoice(7.05, 7), 0.05, 1e-9); assert.equal(C.iceVoice(3.5, 4), 0); assert.equal(C.iceVoice(3.5, 2), 1);
  assert.deepEqual(C.warmestYears([0, 3, 1, 2], 2000, 2), [2001, 2003]); assert.equal(C.firstReaching([1, 2, 3], 2.5), 2); near(C.rateOver([0, 10, 20, 30], 3, 2), 10, 1e-9);
  assert.deepEqual(C.anomalyColor(-0.5), [74, 123, 214]); assert.deepEqual(C.anomalyColor(1.3), [226, 101, 74]);
});
test('seeded randomness repeats', () => { const a = C.rng(42), b = C.rng(42), c = C.rng(43); const xs = [a(), a(), a()], ys = [b(), b(), b()]; assert.deepEqual(xs, ys); assert.notEqual(xs[0], c()); assert.ok(xs.every(x => x >= 0 && x < 1)); });

// ---- pictures ----
const W = 96, H = 48;
function frame(fn) { const px = new Uint8ClampedArray(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b] = fn(x, y); const i = (y * W + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; } return px; }
test('a cold blue frame is minor and low; a bright warm one is major and high', () => {
  const blue = C.features(frame(() => [10, 30, 110]), W, H, null), mb = C.musicFrom(blue);
  assert.equal(mb.scaleName, 'minor'); assert.equal(mb.register, 'low'); assert.equal(mb.colorName, 'blue'); assert.ok(blue.warmth < 0.1);
  const warm = C.features(frame(() => [250, 190, 120]), W, H, null), mw = C.musicFrom(warm);
  assert.equal(mw.scaleName, 'major'); assert.equal(mw.register, 'high'); assert.ok(mw.rootMidi > mb.rootMidi);
  for (const m of [mb, mw]) { assert.equal(m.bandMidis.length, 24); assert.ok(m.chord.length >= 3 && m.chord.every(n => C.SCALES[m.scaleName].includes(((n - m.rootMidi) % 12 + 12) % 12)), 'chord tones stay in the scale'); for (let i = 1; i < 24; i++) assert.ok(m.bandMidis[i] > m.bandMidis[i - 1]); }
});
test('grey frames do not pretend to have a colour', () => { const f = C.features(frame(() => [128, 128, 128]), W, H, null); assert.equal(C.musicFrom(f).colorName, 'grey'); assert.equal(f.totalW, 0); });
test('columns and bands: a bright stripe is loud where it is, silent elsewhere', () => {
  const f = C.features(frame((x, y) => (x >= 40 && x < 44 && y < 8) ? [255, 255, 255] : [0, 0, 0]), W, H, null);
  assert.ok(f.cols[41][23] > 0.3, 'top band of the lit column'); assert.equal(f.cols[41][0], 0); assert.equal(f.cols[10][23], 0); assert.ok(f.rows[23] > f.rows[5]);
});
test('edges, bright points and night lights', () => {
  const flat = C.features(frame(() => [40, 40, 40]), W, H, null), busy = C.features(frame((x, y) => ((x + y) % 2 ? [230, 230, 230] : [10, 10, 10])), W, H, null);
  assert.ok(busy.edges > flat.edges && flat.edges === 0);
  const city = C.features(frame((x, y) => (x % 9 === 0 && y % 7 === 0) ? [255, 200, 120] : [2, 3, 8]), W, H, null); assert.ok(city.bright > 0.01 && city.bright < 0.05); assert.ok(city.brightWarm > 0.9);
  const dark = C.lensParams('lights', C.features(frame(() => [2, 3, 8]), W, H, null)), lit = C.lensParams('lights', city);
  assert.ok(lit.pulse < dark.pulse, 'more lights tick faster'); assert.equal(lit.tickOct, -12, 'warm sodium light sits an octave down');
});
test('motion and flashes between frames', () => {
  const a = frame(() => [5, 5, 10]), fa = C.features(a, W, H, null);
  const b = frame((x, y) => (x > 70 && x < 82 && y > 30 && y < 42) ? [255, 255, 230] : [5, 5, 10]), fb = C.features(b, W, H, fa.L);
  assert.ok(fb.motion > 0); assert.equal(fb.flashes.length, 1, 'one bright region is one strike, even across grid cells'); assert.ok(Math.abs(fb.flashes[0].x - 76.5 / 96) < 0.02 && Math.abs(fb.flashes[0].y - 36.5 / 48) < 0.03, 'located at its centre');
  const two = frame((x, y) => ((x > 4 && x < 12 && y > 4 && y < 12) || (x > 80 && x < 90 && y > 34 && y < 44)) ? [255, 255, 230] : [5, 5, 10]); assert.equal(C.features(two, W, H, fa.L).flashes.length, 2, 'two separate regions are two strikes');
  assert.equal(C.features(a, W, H, fa.L).flashes.length, 0, 'no change, no strike'); assert.ok(C.lensParams('lightning', fb).strikes);
  const moved = frame((x, y) => (x > 40 && x < 60) ? [200, 200, 200] : [5, 5, 10]), base = C.features(frame((x, y) => (x > 20 && x < 40) ? [200, 200, 200] : [5, 5, 10]), W, H, null);
  assert.ok(C.features(moved, W, H, base.L).dx > 0.1, 'drift to the right is positive');
});
test('lenses: plume → tension, warm water → open filter, dark forest → low', () => {
  const plume = C.features(frame((x) => x < 48 ? [220, 90, 30] : [10, 20, 60]), W, H, null); assert.ok(C.lensParams('carbon', plume).tension > 0.9); assert.equal(C.lensParams('carbon', C.features(frame(() => [10, 20, 60]), W, H, null)).tension, 0);
  const warmSea = C.features(frame(() => [220, 60, 40]), W, H, null), coldSea = C.features(frame(() => [30, 60, 200]), W, H, null); assert.ok(C.lensParams('ocean', warmSea).filt > C.lensParams('ocean', coldSea).filt);
  assert.equal(C.lensParams('forest', C.features(frame(() => [10, 70, 20]), W, H, null)).tickOct, -12); assert.equal(C.lensParams('forest', C.features(frame(() => [170, 240, 170]), W, H, null)).tickOct, 12);
  for (const k of Object.keys(C.LENSES)) { const p = C.lensParams(k, plume); assert.ok(p.pulse > 0.05 && p.pulse < 3 && Number.isFinite(p.filt)); assert.ok(C.LENSES[k].name && C.LENSES[k].desc); }
});
test('exploring by hand: probe names what is under the cursor', () => {
  const px = frame((x, y) => x < 48 ? [20, 40, 200] : [250, 250, 250]); const l = C.probe(px, W, H, 0.1, 0.5), r = C.probe(px, W, H, 0.9, 0.5);
  assert.equal(l.name, 'blue'); assert.equal(r.name, 'white'); assert.ok(r.level > l.level); assert.equal(C.probe(px, W, H, 0.5, 0).band, 23); assert.equal(C.probe(px, W, H, 0.5, 1).band, 0);
  assert.equal(C.colorName(0, 0, 0.02), 'black'); assert.equal(C.colorName(120, 0.8, 0.2), 'dark green'); assert.equal(C.colorName(40, 0.9, 0.8), 'pale orange');
});
test('gazetteer: knows roughly where on Earth a point is', () => {
  const at = (lat, lon) => C.regionName(lat, lon);
  assert.equal(at(41.8, -87.6), 'the United States'); assert.equal(at(56, -106), 'Canada'); assert.equal(at(19.4, -99.1), 'Mexico'); assert.equal(at(15, 65), 'the Indian Ocean'); assert.equal(at(55.7, 37.6), 'Europe'); assert.equal(at(39.9, 116.4), 'Asia'); assert.equal(at(6.5, 3.4), 'Africa'); assert.equal(at(-23.5, -46.6), 'South America'); assert.equal(at(48.9, 2.3), 'Europe'); assert.equal(at(28.6, 77.2), 'the Indian subcontinent');
  assert.equal(at(35.7, 139.7), 'Japan and Korea'); assert.equal(at(-33.9, 151.2), 'Australia'); assert.equal(at(-80, 0), 'Antarctica'); assert.equal(at(-10, -140), 'the South Pacific'); assert.equal(at(20, -150), 'the North Pacific'); assert.equal(at(30, -40), 'the North Atlantic');
  assert.equal(at(-20, 80), 'the Indian Ocean'); assert.equal(at(85, 10), 'the Arctic Ocean'); assert.equal(at(72, -40), 'Greenland'); assert.equal(at(0, 190), at(0, -170), 'longitude wraps');
  assert.equal(C.latLonText(41.8, -87.6), '42° north, 88° west'); assert.equal(C.latLonText(-33.9, 151.2), '34° south, 151° east');
});

// ---- services ----
test('GIBS requests are well-formed WMS 1.1.1 whole-Earth maps', () => {
  const u = new URL(C.gibsURL('GHRSST_L4_MUR_Sea_Surface_Temperature', { date: '2026-11-01' })); const q = u.searchParams;
  assert.equal(u.origin + u.pathname, 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi'); assert.equal(q.get('SERVICE'), 'WMS'); assert.equal(q.get('VERSION'), '1.1.1'); assert.equal(q.get('REQUEST'), 'GetMap');
  assert.equal(q.get('SRS'), 'EPSG:4326'); assert.equal(q.get('BBOX'), '-180,-90,180,90'); assert.equal(q.get('WIDTH'), '1024'); assert.equal(q.get('HEIGHT'), '512'); assert.equal(q.get('TIME'), '2026-11-01'); assert.equal(q.get('FORMAT'), 'image/png'); assert.equal(q.get('TRANSPARENT'), 'TRUE');
  const img = new URL(C.gibsURL('MODIS_Terra_CorrectedReflectance_TrueColor')).searchParams; assert.equal(img.get('FORMAT'), 'image/jpeg'); assert.equal(img.get('TIME'), null, 'no date asks GIBS for its default'); assert.equal(img.get('TRANSPARENT'), null);
  assert.equal(new URL(C.gibsURL('OCO-2_Carbon_Dioxide_Total_Column_Average')).searchParams.get('LAYERS'), 'OCO-2_Carbon_Dioxide_Total_Column_Average');
});
test('every GIBS layer in the catalogue is complete and uses a known lens', () => {
  const ids = new Set(); for (const l of C.GIBS.layers) { assert.ok(/^[A-Za-z0-9_\-]+$/.test(l.id), l.id); assert.ok(!ids.has(l.id)); ids.add(l.id); assert.ok(C.LENSES[l.lens], l.lens); assert.ok(['image', 'data'].includes(l.kind)); assert.ok(['daily', 'monthly', 'static'].includes(l.time)); assert.ok(l.name.length > 5 && l.about.length > 40); }
  assert.ok(C.GIBS.layers.length >= 12); assert.match(C.GIBS.credit, /Global Imagery Browse Services/);
});
test('time-lapse dates step correctly', () => {
  assert.deepEqual(C.stepDates('2026-03-01', 'day', 3), ['2026-02-27', '2026-02-28', '2026-03-01']); assert.deepEqual(C.stepDates('2026-01-15', 'month', 3), ['2025-11-01', '2025-12-01', '2026-01-01']);
  assert.deepEqual(C.stepDates('2024-02-29', 'year', 2).length, 2); assert.equal(C.stepDates('2026-11-16', 'week', 4)[0], '2026-10-26');
});
test('space weather parsers accept both NOAA shapes and reject junk', () => {
  assert.deepEqual(C.parseKp([['time_tag', 'Kp', 'a_running', 'station_count'], ['2026-11-15 18:00:00.000', '2.33', '9', '8'], ['2026-11-15 21:00:00.000', '4.67', '39', '8']]), { kp: 4.67, time: '2026-11-15 21:00:00.000' });
  assert.deepEqual(C.parseKp([{ time_tag: '2026-11-15T21:00:00', Kp: 3.33 }]), { kp: 3.33, time: '2026-11-15T21:00:00' }); assert.equal(C.parseKp([{ time_tag: 'x', estimated_kp: 5 }]).kp, 5);
  for (const bad of [null, [], {}, [['time_tag', 'Kp']], [{ Kp: 'n/a' }], [{ Kp: 42 }], 'x']) assert.equal(C.parseKp(bad), null);
  assert.deepEqual(C.parseWind({ WindSpeed: '512', TimeStamp: '2026-11-15 21:04:00.000' }), { speed: 512, time: '2026-11-15 21:04:00.000' }); assert.equal(C.parseWind([{ proton_speed: 431.2, time_tag: 't' }]).speed, 431.2);
  for (const bad of [null, {}, { WindSpeed: 'x' }, { WindSpeed: 3 }]) assert.equal(C.parseWind(bad), null); assert.equal(C.kpToWind(4), 600);
});
test('WAV files have a correct header and samples', () => {
  const buf = C.encodeWAV([new Float32Array([0, 1, -1, 0.5]), new Float32Array([0, -1, 1, 2])], 44100), v = new DataView(buf), s = o => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  assert.equal(buf.byteLength, 44 + 16); assert.equal(s(0), 'RIFF'); assert.equal(s(8), 'WAVE'); assert.equal(s(36), 'data'); assert.equal(v.getUint16(22, true), 2); assert.equal(v.getUint32(24, true), 44100); assert.equal(v.getUint16(34, true), 16); assert.equal(v.getUint32(40, true), 16);
  assert.equal(v.getInt16(44, true), 0); assert.equal(v.getInt16(48, true), 32767); assert.equal(v.getInt16(50, true), -32768); assert.equal(v.getInt16(58, true), 32767, 'overs are clipped, not wrapped');
  const lv = C.levels([new Float32Array([0.5, -0.5, NaN])]); near(lv.peak, 0.5, 1e-9); near(lv.rms, 0.5, 1e-9); assert.equal(lv.bad, 1);
});
test('address-bar state round-trips and ignores unknown keys', () => {
  const s = C.encodeState({ scene: 'aurora', lens: 'lights', src: 'gibs:VIIRS_Black_Marble', voice: 0, junk: 'x', date: '' }); assert.equal(s, 'scene=aurora&lens=lights&src=gibs%3AVIIRS_Black_Marble&voice=0');
  assert.deepEqual(C.decodeState('#' + s + '&evil=1&bad'), { scene: 'aurora', lens: 'lights', src: 'gibs:VIIRS_Black_Marble', voice: '0' }); assert.deepEqual(C.decodeState(''), {}); assert.deepEqual(C.decodeState('scene=%E0%A4%A'), {});
});
