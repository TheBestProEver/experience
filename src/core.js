/* Hearth core: every pure function the app uses. No DOM, no audio, no globals beyond the export.
   Loaded by index.html as a plain script and by the unit tests through require(). */
(function (root, factory) { var C = factory(); if (typeof module === 'object' && module.exports) module.exports = C; root.Hearth = root.Hearth || {}; root.Hearth.Core = C; })(typeof self !== 'undefined' ? self : globalThis, function () {
'use strict';

/* ---------- constants ---------- */
var C_LIGHT = 2.99792458e8, WIEN = 2.897771955e-3, GM_SUN = 1.32712440018e20, AU = 1.495978707e11, SYNODIC = 29.530588853;
var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
var lerp = function (a, b, t) { return a + (b - a) * t; };

/* ---------- light, heat and pitch ---------- */
function lightToAudio(nm, oct) { return C_LIGHT / (nm * 1e-9) / Math.pow(2, oct === undefined ? 40 : oct); }      // a colour, lowered by whole octaves
function tempToAudio(T, oct) { return C_LIGHT * T / WIEN / Math.pow(2, oct === undefined ? 40 : oct); }           // a blackbody's peak colour, lowered
function m2f(m, A) { return (A || 440) * Math.pow(2, (m - 69) / 12); }
function f2m(f, A) { return 69 + 12 * Math.log2(f / (A || 440)); }
var NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
function noteOf(f, A) {
  var exact = f2m(f, A), midi = Math.round(exact), cents = Math.round((exact - midi) * 100);
  var name = NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  return { midi: midi, name: name, cents: cents, label: name + (cents === 0 ? '' : (cents > 0 ? ' +' : ' −') + Math.abs(cents) + '¢') };
}
function bbRGB(T) {                                                                                               // blackbody colour, 0..1 (Tanner Helland's fit)
  var t = T / 100, r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  return [r, g, b].map(function (v) { return clamp(v, 0, 255) / 255; });
}

/* ---------- the data scenes: one mapping each, shared by the audio, the picture and the tests ---------- */
function anomalyToFreq(a) { return 220 * Math.pow(2, a * 1.05); }                        // one octave per degree, roughly
function anomalyTension(a) { return Math.pow(Math.max(0, (a - 0.2) / 1.1), 1.3); }       // dissonance above +0.2 °C
function anomalyColor(a) { var k = clamp((a + 0.5) / 1.8, 0, 1); return [Math.round(74 + 152 * k), Math.round(123 - 22 * k), Math.round(214 - 140 * k)]; }
function ppmToFreq(ppm) { return 220 * Math.pow(2, (ppm - 315) / 60); }                  // an octave every 60 ppm
function ppmTension(ppm) { return clamp((ppm - 350) / 80, 0, 1); }                       // enters at 350 ppm
function seaToFreq(mm) { return 110 * Math.pow(2, mm / 260); }                           // an octave over the record
function iceVoice(extent, k) { return clamp(extent - k, 0, 1); }                         // voice k sings while more than k million km² remain
function rateOver(values, i, window) { var j = Math.max(0, i - window); return i === j ? 0 : (values[i] - values[j]) / (i - j); }
function warmestYears(values, start, n) { return values.map(function (v, i) { return [v, start + i]; }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, n).map(function (x) { return x[1]; }).sort(function (a, b) { return a - b; }); }
function firstReaching(values, level) { for (var i = 0; i < values.length; i++) if (values[i] >= level) return i; return -1; }

/* ---------- sky mechanics ---------- */
function moonPhase(d) {
  d = d || new Date(); var ref = Date.UTC(2000, 0, 6, 18, 14);
  var age = ((d.getTime() - ref) / 86400000) % SYNODIC; if (age < 0) age += SYNODIC;
  var q = SYNODIC / 4, k = Math.round(age / q) % 4, near = Math.abs(age - Math.round(age / q) * q) < 1.0;
  var principal = ['new moon', 'first quarter', 'full moon', 'last quarter'], between = ['waxing crescent', 'waxing gibbous', 'waning gibbous', 'waning crescent'];
  return { age: age, illum: (1 - Math.cos(2 * Math.PI * age / SYNODIC)) / 2, phi: 2 * Math.PI * age / SYNODIC, name: near ? principal[k] : between[Math.floor(age / q) % 4] };
}
function keplerE(M, e) {
  M = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); var E = e < 0.8 ? M : Math.PI;
  for (var i = 0; i < 60; i++) { var dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= dE; if (Math.abs(dE) < 1e-11) break; }
  return E;
}
var HALLEY = { a: 17.834, e: 0.96714, P: 75.32 };
function halley(tYears) {                                                                 // years from perihelion → distance (AU), speed (km/s), true anomaly
  var e = HALLEY.e, E = keplerE(2 * Math.PI * tYears / HALLEY.P, e), r = HALLEY.a * (1 - e * Math.cos(E));
  var nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2)); if (nu > Math.PI) nu -= 2 * Math.PI;
  return { r: r, v: Math.sqrt(GM_SUN * (2 / (r * AU) - 1 / (HALLEY.a * AU))) / 1000, nu: nu };
}
function cometActivity(r) { return Math.pow(clamp((3.2 - r) / 2.6, 0, 1), 1.5); }        // water ice wakes up inside about 3 AU
function logRadius(r) { return 1.15 * Math.log(1 + r / 0.45); }                          // display only: keeps the Sun and a distant comet in one frame
var EROS = { a: 17.2, b: 5.6, period_h: 5.27 };
function erosArea(th) { return Math.sqrt(EROS.a * EROS.a * Math.sin(th) * Math.sin(th) + EROS.b * EROS.b * Math.cos(th) * Math.cos(th)) / EROS.a; }
function raDecToXYZ(raDeg, decDeg, R) { var a = raDeg * Math.PI / 180, d = decDeg * Math.PI / 180; R = R || 1; return [R * Math.cos(d) * Math.cos(a), R * Math.sin(d), -R * Math.cos(d) * Math.sin(a)]; }

/* ---------- seeded randomness (offline renders and tests are repeatable) ---------- */
function rng(seed) { var a = (seed >>> 0) || 1; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------- reading a picture ---------- */
var SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], Dorian: [0, 2, 3, 5, 7, 9, 10] };
var HUE_NAMES = ['red', 'orange', 'yellow', 'lime', 'green', 'sea green', 'cyan', 'sky blue', 'blue', 'violet', 'magenta', 'pink'];   // centred on 0°, 30°, … 330°
function hueBin(h) { return Math.round((((h % 360) + 360) % 360) / 30) % 12; }
var GRID_W = 96, BANDS = 24;
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255; var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l];
  var d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn), h;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  return [h * 60, s, l];
}
function colorName(h, s, l) {
  if (l < 0.07) return 'black'; if (s < 0.13) return l > 0.86 ? 'white' : l > 0.5 ? 'pale grey' : 'dark grey';
  var name = HUE_NAMES[hueBin(h)]; return (l < 0.25 ? 'dark ' : l > 0.72 ? 'pale ' : '') + name;
}
function gridHeight(iw, ih) { return clamp(Math.round(GRID_W * ih / iw), 24, 96); }
/** Analyse one frame. px is RGBA bytes for a W×H grid; prevL is the lightness of the previous frame (for motion and flashes). */
function features(px, W, H, prevL) {
  var N = W * H, L = new Float32Array(N), S = new Float32Array(N), hueW = new Array(12).fill(0), hueRGB = [], i, x, y, b;
  for (i = 0; i < 12; i++) hueRGB.push([0, 0, 0, 0]);
  var sumL = 0, sumS = 0, warm = 0, cool = 0, grey = 0, bright = 0, brightWarm = 0, greenL = 0, greenN = 0, plume = 0;
  for (i = 0; i < N; i++) {
    var r = px[i * 4], g = px[i * 4 + 1], bl = px[i * 4 + 2], hsl = rgb2hsl(r, g, bl), h = hsl[0], s = hsl[1], l = hsl[2]; L[i] = l; S[i] = s; sumL += l; sumS += s;
    if (l > 0.62) { bright++; if (h < 70 || h > 330) brightWarm++; }
    if (s < 0.12 || l < 0.06 || l > 0.96) { grey++; continue; }
    var bin = hueBin(h), w = s * (1 - Math.abs(l - 0.5)); hueW[bin] += w; hueRGB[bin][0] += r * w; hueRGB[bin][1] += g * w; hueRGB[bin][2] += bl * w; hueRGB[bin][3] += w;
    if (h < 70 || h > 330) warm += w; else if (h > 170 && h < 280) cool += w;
    if (h > 70 && h < 170) { greenL += l; greenN++; } if (s > 0.35 && (h < 70 || h > 300) && l > 0.25) plume++;
  }
  var edges = 0, ne = 0; for (y = 0; y < H - 1; y++) for (x = 0; x < W - 1; x++) { i = y * W + x; edges += Math.abs(L[i + 1] - L[i]) + Math.abs(L[i + W] - L[i]); ne++; } edges = Math.min(1, (edges / ne) * 6);
  var band = function (bb) { var y0 = Math.floor(H * (1 - (bb + 1) / BANDS)), y1 = Math.max(y0 + 1, Math.floor(H * (1 - bb / BANDS))); return [y0, y1]; };
  var rows = new Array(BANDS).fill(0), cols = [];
  for (x = 0; x < W; x++) { var col = new Array(BANDS).fill(0); for (b = 0; b < BANDS; b++) { var yy = band(b), acc = 0; for (y = yy[0]; y < yy[1]; y++) { i = y * W + x; acc += Math.pow(L[i], 1.6) * (0.35 + 0.65 * S[i]); } col[b] = acc / (yy[1] - yy[0]); rows[b] += col[b] / W; } cols.push(col); }
  var motion = 0, flashes = [], dx = 0;
  if (prevL && prevL.length === N) {
    var cells = new Float32Array(24), cxs = new Float32Array(24), cys = new Float32Array(24), cx0 = 0, cx1 = 0, w0 = 0, w1 = 0;
    for (i = 0; i < N; i++) { var d = L[i] - prevL[i]; motion += Math.abs(d); x = i % W; y = Math.floor(i / W); cx0 += prevL[i] * x; w0 += prevL[i]; cx1 += L[i] * x; w1 += L[i];
      if (d > 0.22) { var ci = Math.min(3, Math.floor(y / H * 4)) * 6 + Math.min(5, Math.floor(x / W * 6)); cells[ci] += d; cxs[ci] += d * x; cys[ci] += d * y; } }
    motion /= N; dx = (w1 && w0) ? (cx1 / w1 - cx0 / w0) / W : 0;
    var seen = new Uint8Array(24);
    for (i = 0; i < 24; i++) { if (seen[i] || cells[i] <= 0.9) continue; var stack = [i], sw = 0, sx = 0, sy = 0; seen[i] = 1;      // flood-fill neighbouring cells into one strike
      while (stack.length) { var c = stack.pop(); sw += cells[c]; sx += cxs[c]; sy += cys[c]; var gx = c % 6, gy = Math.floor(c / 6);
        for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) { var nx = gx + ox, ny = gy + oy; if (nx < 0 || nx > 5 || ny < 0 || ny > 3) continue; var nc = ny * 6 + nx; if (!seen[nc] && cells[nc] > 0.9) { seen[nc] = 1; stack.push(nc); } } }
      flashes.push({ x: (sx / sw + 0.5) / W, y: (sy / sw + 0.5) / H, s: Math.min(1, sw / 14) }); }
    flashes.sort(function (a, c) { return c.s - a.s; }); flashes = flashes.slice(0, 5);
  }
  var order = hueW.map(function (wv, ix) { return [wv, ix]; }).sort(function (a, c) { return c[0] - a[0]; }), totalW = hueW.reduce(function (a, c) { return a + c; }, 0), top = hueRGB[order[0][1]];
  return { L: L, W: W, H: H, brightness: sumL / N, saturation: sumS / N, edges: edges, warmth: (warm + cool) > 0 ? warm / (warm + cool) : 0.5, order: order, totalW: totalW, greyShare: grey / N,
    topShare: totalW > 0 ? order[0][0] / totalW * (1 - grey / N) : 0, bright: bright / N, brightWarm: bright ? brightWarm / bright : 0.5, greenLight: greenN ? greenL / greenN : 0.5, greenShare: greenN / N, plume: plume / N,
    rows: rows, cols: cols, motion: motion, dx: dx, flashes: flashes,
    accent: top[3] > 0 ? 'rgb(' + Math.round(top[0] / top[3]) + ',' + Math.round(top[1] / top[3]) + ',' + Math.round(top[2] / top[3]) + ')' : (sumL / N > 0.5 ? '#dddddd' : '#8a8f9c') };
}
/** Key, chord and the 24 scan pitches for a frame: hue around the circle of fifths, warmth for the mode, brightness for the register. */
function musicFrom(f) {
  var scaleName = f.warmth > 0.6 ? 'major' : f.warmth < 0.4 ? 'minor' : 'Dorian', scale = SCALES[scaleName];
  var rootPc = f.totalW > 0 ? (f.order[0][1] * 7) % 12 : 2, register = f.brightness < 0.3 ? 'low' : f.brightness < 0.6 ? 'middle' : 'high';
  var rootMidi = 36 + (f.brightness < 0.3 ? 0 : f.brightness < 0.6 ? 7 : 12) + rootPc;
  var snap = function (pc) { var best = scale[0], bd = 99; scale.forEach(function (d) { var dist = Math.min((pc - d + 12) % 12, (d - pc + 12) % 12); if (dist < bd) { bd = dist; best = d; } }); return best; };
  var set = {}; set[0] = 1; set[snap(4)] = 1; f.order.slice(0, 4).forEach(function (o) { if (o[0] > 0) set[snap(((o[1] * 7) % 12 - rootPc + 12) % 12)] = 1; }); if (Object.keys(set).length < 3) set[7] = 1;
  var chord = Object.keys(set).map(Number).sort(function (a, c) { return a - c; }).slice(0, 5).map(function (d) { return rootMidi + d; }), bandMidis = [];
  for (var o = 0; bandMidis.length < BANDS; o++) for (var k = 0; k < scale.length && bandMidis.length < BANDS; k++) bandMidis.push(rootMidi + o * 12 + scale[k]);
  var grey = f.totalW === 0 || f.greyShare > 0.85;
  return { scaleName: scaleName, rootMidi: rootMidi, rootName: NOTE_NAMES[((rootMidi % 12) + 12) % 12], register: register, chord: chord, bandMidis: bandMidis,
    colorName: grey ? (f.brightness < 0.3 ? 'black' : f.brightness > 0.7 ? 'white' : 'grey') : HUE_NAMES[f.order[0][1]],
    secondName: f.greyShare > 0.35 ? (f.brightness > 0.5 ? 'white' : 'black') : (f.order[1] && f.order[1][0] > 0 ? HUE_NAMES[f.order[1][1]] : 'nothing else') };
}
var LENSES = {
  auto:      { name: 'General: any image or video', desc: 'Colour chooses the key, brightness the register, edges the pulse. Stills are read left to right as a score; video is heard as a live chord of 24 horizontal bands.' },
  lights:    { name: 'Night lights', desc: 'Each bright point is a settlement. Their density sets the tick rate; warm sodium light sits an octave below cool LED light. Darkness is silence.' },
  ocean:     { name: 'Ocean currents and temperature', desc: 'Motion between frames drives the arpeggio and sweeps it across the stereo field; red water opens the filter, blue water closes it.' },
  lightning: { name: 'Lightning and sudden change', desc: 'Sudden brightening between frames becomes a strike, panned to where it happened and pitched by how high in the frame it was.' },
  carbon:    { name: 'Carbon dioxide and aerosols', desc: 'How much of the frame the plume covers sets the weight of the drone and the tension in the chord.' },
  forest:    { name: 'Forest height and vegetation', desc: 'Greens are read by lightness: tall, dark canopy sounds low and dense; open or bare land sounds high and sparse.' }
};
/** What a lens does with one frame's measurements. Returns the musical controls; the audio engine only applies them. */
function lensParams(lens, f) {
  var p = { pulse: Math.max(0.3, 1.7 - 1.5 * f.edges), tickOct: 0, tension: 0, filt: 1, tickGain: 0.04 + 0.03 * f.brightness, tickDecay: 1.6, bandGate: 0, strikes: false, panDrift: 0 };
  if (lens === 'lights') { var dens = Math.min(1, f.bright * 14); p.pulse = Math.max(0.09, 1.3 - dens * 1.2); p.tickOct = f.brightWarm > 0.55 ? -12 : 0; p.tickGain = 0.03 + 0.07 * dens; p.tickDecay = 0.8; p.bandGate = 0.22; }
  else if (lens === 'ocean') { p.pulse = Math.max(0.14, 1.1 - Math.min(1, f.motion * 30) * 0.95); p.filt = 0.6 + f.warmth * 1.4; p.panDrift = clamp(f.dx * 40, -0.9, 0.9); }
  else if (lens === 'lightning') { p.strikes = true; p.pulse = 2.4; p.tickGain = 0.02; }
  else if (lens === 'carbon') { p.tension = Math.min(1, f.plume * 3); p.pulse = Math.max(0.5, 2.2 - f.plume * 3); }
  else if (lens === 'forest') { p.pulse = Math.max(0.25, 1.6 - f.greenShare * 1.2); p.tickOct = f.greenLight < 0.35 ? -12 : f.greenLight > 0.55 ? 12 : 0; }
  return p;
}
/** The colour and lightness of one small patch (for exploring a frame by hand). cx, cy are 0..1. */
function probe(px, W, H, cx, cy, rad) {
  var x0 = clamp(Math.round(cx * (W - 1)), 0, W - 1), y0 = clamp(Math.round(cy * (H - 1)), 0, H - 1), r = 0, g = 0, b = 0, n = 0; rad = rad === undefined ? 1 : rad;
  for (var y = Math.max(0, y0 - rad); y <= Math.min(H - 1, y0 + rad); y++) for (var x = Math.max(0, x0 - rad); x <= Math.min(W - 1, x0 + rad); x++) { var i = (y * W + x) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
  r /= n; g /= n; b /= n; var hsl = rgb2hsl(r, g, b);
  return { r: r, g: g, b: b, h: hsl[0], s: hsl[1], l: hsl[2], name: colorName(hsl[0], hsl[1], hsl[2]), band: clamp(Math.floor((1 - cy) * BANDS), 0, BANDS - 1), level: clamp(Math.round(hsl[2] * (BANDS - 1)), 0, BANDS - 1) };
}
/* a coarse gazetteer for global maps: enough to say where on Earth the listener is pointing */
var LANDS = [ ['Greenland', 60, 84, -73, -12], ['Alaska', 54, 72, -170, -141], ['Canada', 49, 84, -141, -52], ['the United States', 24, 49, -125, -66], ['Mexico', 14, 33, -118, -86], ['Central America and the Caribbean', 7, 27, -93, -59],
  ['South America', -56, 13, -82, -34], ['Scandinavia', 55, 72, 4, 32], ['Europe', 36, 72, -11, 40], ['the Middle East', 12, 42, 34, 63], ['Madagascar', -26, -12, 43, 51], ['Africa', -35, 37, -18, 52],
  ['the Indian subcontinent', 6, 36, 66, 92], ['Japan and Korea', 30, 46, 124, 146], ['Southeast Asia', -11, 28, 92, 141], ['Siberia', 50, 78, 60, 180], ['Asia', 22, 78, 40, 150], ['New Zealand', -48, -34, 165, 179], ['Australia', -45, -10, 112, 154] ];
function regionName(lat, lon) {
  lon = ((lon + 540) % 360) - 180; if (lat < -62) return 'Antarctica';
  for (var i = 0; i < LANDS.length; i++) { var b = LANDS[i]; if (lat >= b[1] && lat <= b[2] && lon >= b[3] && lon <= b[4]) return b[0]; }
  if (lat > 72) return 'the Arctic Ocean'; if (lat < -50) return 'the Southern Ocean';
  if (lon > 20 && lon < 120 && lat < 30) return 'the Indian Ocean';
  if (lon >= -70 && lon <= 20) return lat >= 0 ? 'the North Atlantic' : 'the South Atlantic';
  return lat >= 0 ? 'the North Pacific' : 'the South Pacific';
}
function latLonText(lat, lon) { var la = Math.round(Math.abs(lat)), lo = Math.round(Math.abs(((lon + 540) % 360) - 180)); return la + '° ' + (lat >= 0 ? 'north' : 'south') + ', ' + lo + '° ' + ((((lon + 540) % 360) - 180) >= 0 ? 'east' : 'west'); }

/* ---------- live NASA imagery (GIBS). Identifiers verified against NASA Worldview's layer configuration. ---------- */
var GIBS = { endpoint: 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi',
  credit: 'Imagery provided by services from NASA\u2019s Global Imagery Browse Services (GIBS), part of NASA\u2019s Earth Science Data and Information System (ESDIS).',
  layers: [
    { id: 'MODIS_Terra_CorrectedReflectance_TrueColor', name: 'Earth today, in true colour', lens: 'auto', kind: 'image', time: 'daily', about: 'What the Terra satellite saw as it crossed each part of the planet on this day: cloud, ocean, desert, forest and ice in natural colour. The dark stripes are gaps between its orbits.' },
    { id: 'VIIRS_CityLights_2012', name: 'Earth at night, 2012', lens: 'lights', kind: 'image', time: 'static', about: 'A cloud-free composite of the planet at night in 2012: every city, road and gas flare bright enough to be seen from orbit.' },
    { id: 'VIIRS_Black_Marble', name: 'Earth at night, 2016', lens: 'lights', kind: 'image', time: 'static', about: 'NASA\u2019s Black Marble composite for 2016. Heard after 2012, it is the same planet four years brighter.' },
    { id: 'VIIRS_NOAA20_DayNightBand', name: 'Last night from orbit', lens: 'lights', kind: 'image', time: 'daily', about: 'The night side as the NOAA-20 satellite saw it on this date: city lights, moonlit cloud, fires and aurora together.' },
    { id: 'GHRSST_L4_MUR_Sea_Surface_Temperature', name: 'Sea surface temperature', lens: 'ocean', kind: 'data', time: 'daily', about: 'The temperature of the ocean surface, blended from several satellites: deep blue for cold polar water through to red in the tropics, with the great currents drawn in between.' },
    { id: 'GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies', name: 'Sea surface temperature, difference from normal', lens: 'ocean', kind: 'data', time: 'daily', about: 'Where the ocean is warmer than usual for the date, in red, and cooler, in blue. El Niño shows as a red tongue along the Pacific equator.' },
    { id: 'MODIS_Combined_Value_Added_AOD', name: 'Aerosols: smoke, dust and haze', lens: 'carbon', kind: 'data', time: 'daily', about: 'How much sunlight is blocked by particles in the air: desert dust off the Sahara, smoke from fires, haze over cities. Darker reds are thicker.' },
    { id: 'OCO-2_Carbon_Dioxide_Total_Column_Average', name: 'Carbon dioxide from OCO-2', lens: 'carbon', kind: 'data', time: 'daily', about: 'The average carbon dioxide in the column of air beneath the Orbiting Carbon Observatory, measured along its narrow orbital tracks.' },
    { id: 'LIS_ISS_Flash_Count', name: 'Lightning seen from the Space Station', lens: 'lightning', kind: 'data', time: 'daily', about: 'Lightning flashes counted by the Lightning Imaging Sensor on the International Space Station as it passed overhead, 2017 to 2023.' },
    { id: 'AMSRU2_Total_Precipitable_Water_Day', name: 'Water vapour: rivers in the sky', lens: 'ocean', kind: 'data', time: 'daily', about: 'All the water vapour in the air above the ocean. Atmospheric rivers show as long bright filaments reaching from the tropics toward the coasts.' },
    { id: 'IMERG_Precipitation_Rate', name: 'Rain and snow, right now', lens: 'lightning', kind: 'data', time: 'daily', about: 'Where it is raining or snowing, and how hard, from the Global Precipitation Measurement constellation.' },
    { id: 'GEDI_ISS_L3_Canopy_Height_Mean_RH100_201904-202303', name: 'Forest height from GEDI', lens: 'forest', kind: 'data', time: 'static', about: 'The height of the world\u2019s forests, measured by a laser on the Space Station between 2019 and 2023. The tallest canopy is in the Amazon, the Congo and Borneo.' },
    { id: 'MODIS_Terra_L3_NDVI_Monthly', name: 'Vegetation greenness, by month', lens: 'forest', kind: 'data', time: 'monthly', about: 'How green the land is in this month. Played across a year, the green wave rolls north in spring and back in autumn.' },
    { id: 'AMSRU2_Sea_Ice_Concentration_12km', name: 'Sea ice, both poles', lens: 'auto', kind: 'data', time: 'daily', about: 'How much of the ocean surface is covered by ice, from microwave measurements that see through cloud and polar night.' }
  ] };
function isoDate(d) { return d.toISOString().slice(0, 10); }
/** A WMS 1.1.1 GetMap request for a whole-Earth equirectangular frame. Omitting the date asks GIBS for the layer's default (its most recent). */
function gibsURL(layerId, opts) {
  opts = opts || {}; var w = opts.width || 1024, h = opts.height || 512, layer = GIBS.layers.filter(function (l) { return l.id === layerId; })[0];
  var fmt = opts.format || (layer && layer.kind === 'image' ? 'image/jpeg' : 'image/png');
  var q = ['SERVICE=WMS', 'VERSION=1.1.1', 'REQUEST=GetMap', 'LAYERS=' + encodeURIComponent(layerId), 'STYLES=', 'SRS=EPSG:4326', 'BBOX=-180,-90,180,90', 'WIDTH=' + w, 'HEIGHT=' + h, 'FORMAT=' + encodeURIComponent(fmt)];
  if (fmt === 'image/png') q.push('TRANSPARENT=TRUE'); if (opts.date) q.push('TIME=' + opts.date);
  return GIBS.endpoint + '?' + q.join('&');
}
/** n dates ending at `end`, one step apart, oldest first. */
function stepDates(end, step, n) {
  var out = [], d = new Date(end + 'T00:00:00Z');
  for (var i = n - 1; i >= 0; i--) { var c = new Date(d); if (step === 'year') c.setUTCFullYear(c.getUTCFullYear() - i); else if (step === 'month') { c.setUTCDate(1); c.setUTCMonth(c.getUTCMonth() - i); } else c.setUTCDate(c.getUTCDate() - i * (step === 'week' ? 7 : 1)); out.push(isoDate(c)); }
  return out;
}

/* ---------- live space weather (NOAA SWPC). Both the old array-of-arrays and the newer array-of-objects shapes are accepted. ---------- */
var SWPC = { kp: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', wind: 'https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json' };
function parseKp(json) {
  if (!Array.isArray(json) || !json.length) return null; var last = json[json.length - 1], kp, time;
  if (Array.isArray(json[0])) { var head = json[0].map(String), ik = head.findIndex(function (h) { return /^kp$/i.test(h) || /kp_index|estimated_kp/i.test(h); }), it = head.findIndex(function (h) { return /time/i.test(h); }); if (json.length < 2) return null; kp = parseFloat(last[ik < 0 ? 1 : ik]); time = String(last[it < 0 ? 0 : it]); }
  else if (last && typeof last === 'object') { var v = last.Kp !== undefined ? last.Kp : last.kp !== undefined ? last.kp : last.estimated_kp !== undefined ? last.estimated_kp : last.kp_index; kp = parseFloat(v); time = String(last.time_tag || last.time || ''); }
  return Number.isFinite(kp) && kp >= 0 && kp <= 9 ? { kp: kp, time: time } : null;
}
function parseWind(json) {
  var o = Array.isArray(json) ? json[json.length - 1] : json; if (!o || typeof o !== 'object') return null;
  var v = o.WindSpeed !== undefined ? o.WindSpeed : o.proton_speed !== undefined ? o.proton_speed : o.wind_speed !== undefined ? o.wind_speed : o.speed, s = parseFloat(v);
  return Number.isFinite(s) && s > 100 && s < 3000 ? { speed: s, time: String(o.TimeStamp || o.time_tag || '') } : null;
}
function kpToWind(kp) { return Math.round(380 + kp * 55); }                               // a plausible speed when only Kp is known

/* ---------- audio files ---------- */
/** 16-bit PCM WAV from Float32 channels. */
function encodeWAV(channels, sampleRate) {
  var nc = channels.length, n = channels[0].length, bytes = n * nc * 2, buf = new ArrayBuffer(44 + bytes), v = new DataView(buf), p = 0;
  var str = function (s) { for (var i = 0; i < s.length; i++) v.setUint8(p++, s.charCodeAt(i)); }, u32 = function (x) { v.setUint32(p, x, true); p += 4; }, u16 = function (x) { v.setUint16(p, x, true); p += 2; };
  str('RIFF'); u32(36 + bytes); str('WAVE'); str('fmt '); u32(16); u16(1); u16(nc); u32(sampleRate); u32(sampleRate * nc * 2); u16(nc * 2); u16(16); str('data'); u32(bytes);
  for (var i = 0; i < n; i++) for (var c = 0; c < nc; c++) { var s = clamp(channels[c][i], -1, 1); v.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7FFF, true); p += 2; }
  return buf;
}
function levels(channels) {                                                               // peak, RMS and sanity of a render
  var peak = 0, sum = 0, n = 0, bad = 0;
  channels.forEach(function (ch) { for (var i = 0; i < ch.length; i++) { var x = ch[i]; if (!Number.isFinite(x)) { bad++; continue; } var a = Math.abs(x); if (a > peak) peak = a; sum += x * x; n++; } });
  return { peak: peak, rms: n ? Math.sqrt(sum / n) : 0, bad: bad };
}

/* ---------- the address bar remembers where you were ---------- */
var STATE_KEYS = ['scene', 'lens', 'src', 'date', 'voice', 'auto', 'viz', 'motion', 'theme', 'bin', 'haptics'];
function encodeState(o) { return STATE_KEYS.filter(function (k) { return o[k] !== undefined && o[k] !== null && o[k] !== ''; }).map(function (k) { return k + '=' + encodeURIComponent(String(o[k])); }).join('&'); }
function decodeState(s) {
  var out = {}; String(s || '').replace(/^#/, '').split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i < 1) return; var k = kv.slice(0, i); if (STATE_KEYS.indexOf(k) < 0) return; try { out[k] = decodeURIComponent(kv.slice(i + 1)); } catch (e) {} });
  return out;
}

return { C_LIGHT: C_LIGHT, WIEN: WIEN, GM_SUN: GM_SUN, AU: AU, SYNODIC: SYNODIC, clamp: clamp, lerp: lerp,
  lightToAudio: lightToAudio, tempToAudio: tempToAudio, m2f: m2f, f2m: f2m, NOTE_NAMES: NOTE_NAMES, noteOf: noteOf, bbRGB: bbRGB,
  anomalyToFreq: anomalyToFreq, anomalyTension: anomalyTension, anomalyColor: anomalyColor, ppmToFreq: ppmToFreq, ppmTension: ppmTension, seaToFreq: seaToFreq, iceVoice: iceVoice, rateOver: rateOver, warmestYears: warmestYears, firstReaching: firstReaching,
  moonPhase: moonPhase, keplerE: keplerE, HALLEY: HALLEY, halley: halley, cometActivity: cometActivity, logRadius: logRadius, EROS: EROS, erosArea: erosArea, raDecToXYZ: raDecToXYZ, rng: rng,
  SCALES: SCALES, HUE_NAMES: HUE_NAMES, GRID_W: GRID_W, BANDS: BANDS, rgb2hsl: rgb2hsl, colorName: colorName, gridHeight: gridHeight, features: features, musicFrom: musicFrom, LENSES: LENSES, lensParams: lensParams, probe: probe,
  hueBin: hueBin, regionName: regionName, latLonText: latLonText, GIBS: GIBS, gibsURL: gibsURL, stepDates: stepDates, isoDate: isoDate, SWPC: SWPC, parseKp: parseKp, parseWind: parseWind, kpToWind: kpToWind,
  encodeWAV: encodeWAV, levels: levels, STATE_KEYS: STATE_KEYS, encodeState: encodeState, decodeState: decodeState };
});
