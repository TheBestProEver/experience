/* Hearth EIC: listening to Earth Information Center imagery. Sources are NASA frames that ship with the app, whole-Earth layers
   fetched live from NASA GIBS, sequences of those through time, and any image or video the listener supplies. */
(function (root) {
'use strict';
var H = root.Hearth = root.Hearth || {}, C = H.Core, A = H.Audio, doc = root.document;
var E = H.EIC = { media: { kind: null, el: null, frames: null, dates: null, idx: 0, lens: 'auto', projection: 'flat', overlay: false, title: '', about: '', credit: '', base: null, live: null, prevL: null, version: 0 },
  explore: { on: false, x: 0.5, y: 0.5, text: '' }, extra: [], onchange: function () {}, status: function () {}, audio: null };
var M = E.media, grid = doc.createElement('canvas'), fine = doc.createElement('canvas'), display = doc.createElement('canvas'), baseImg = null;
E.display = display;
var mk = function (w, h) { var c = doc.createElement('canvas'); c.width = w; c.height = h; return c; };
var dims = function (el) { return [el.naturalWidth || el.videoWidth || el.width || 0, el.naturalHeight || el.videoHeight || el.height || 0]; };
E.frameEl = function () { return M.kind === 'sequence' ? M.frames[M.idx] : M.el; };

/* ---------- sources ---------- */
E.sources = function () {
  var out = []; (H.Frames ? H.Frames.builtin : []).forEach(function (f) { out.push({ id: 'frame:' + f.id, group: 'NASA frames, built in', label: f.title }); });
  E.extra.forEach(function (f) { out.push({ id: 'eic:' + f.id, group: 'EIC visualisations (NASA SVS)', label: f.title }); });
  C.GIBS.layers.forEach(function (l) { out.push({ id: 'gibs:' + l.id, group: 'Live from NASA GIBS (needs a connection)', label: l.name }); });
  return out;
};
function loadImage(url, cors, timeout) { return new Promise(function (res, rej) { var img = new Image(), done = false, t = root.setTimeout(function () { if (!done) { done = true; img.src = ''; rej(new Error('timeout')); } }, timeout || 30000);
  if (cors) img.crossOrigin = 'anonymous'; img.onload = function () { if (!done) { done = true; root.clearTimeout(t); res(img); } }; img.onerror = function () { if (!done) { done = true; root.clearTimeout(t); rej(new Error('load')); } }; img.src = url; }); }
function coverage(img) {                                                         // how much of a fetched map actually holds data
  var c = mk(64, 32), x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 64, 32); var d; try { d = x.getImageData(0, 0, 64, 32).data; } catch (e) { return -1; }
  var n = 0; for (var i = 0; i < d.length; i += 4) if (d[i + 3] > 8 && (d[i] + d[i + 1] + d[i + 2]) > 24) n++; return n / (d.length / 4);
}
E.init = function () {
  var bm = H.Frames && H.Frames.builtin.filter(function (f) { return f.id === 'blue-marble'; })[0]; if (bm) loadImage(bm.src).then(function (img) { baseImg = img; if (M.overlay) drawDisplay(); }).catch(function () {});
  if (!H.SINGLE && root.fetch) root.fetch('assets/frames/manifest.json').then(function (r) { return r.ok ? r.json() : []; }).then(function (list) { if (Array.isArray(list) && list.length) { E.extra = list; E.onsources && E.onsources(); } }).catch(function () {});
};
E.loadSource = function (id, opts) {
  opts = opts || {}; var kind = id.slice(0, id.indexOf(':')), key = id.slice(id.indexOf(':') + 1);
  if (kind === 'frame') { var f = H.Frames.builtin.filter(function (x) { return x.id === key; })[0]; if (!f) return Promise.reject(new Error('unknown frame')); E.status('Loading ' + f.title + '…');
    return loadImage(f.src).then(function (img) { setMedia('image', img, { id: id, title: f.title, about: f.about, credit: f.credit, lens: f.lens, projection: f.projection, hi: f.hi }); E.status(f.title + '. ' + f.credit + '.'); }); }
  if (kind === 'eic') { var x = E.extra.filter(function (q) { return q.id === key; })[0]; if (!x) return Promise.reject(new Error('unknown visualisation')); E.status('Loading ' + x.title + '…'); var meta = { id: id, title: x.title, about: x.about, credit: x.credit, lens: x.lens || 'auto', projection: x.projection || 'flat' };
    if (x.kind === 'video') return loadVideo('assets/frames/' + x.file, false).then(function (v) { setMedia('video', v, meta); E.status(x.title + '. ' + x.credit + '.'); });
    return loadImage('assets/frames/' + x.file).then(function (img) { setMedia('image', img, meta); E.status(x.title + '. ' + x.credit + '.'); }); }
  if (kind === 'gibs') return E.loadGIBS(key, opts.date);
  return Promise.reject(new Error('unknown source'));
};
function gibsFrame(layer, date) { return loadImage(C.gibsURL(layer.id, { date: date || undefined }), true, 35000).then(function (img) { var cov = coverage(img); if (cov >= 0 && cov < 0.004) throw new Error('empty'); return img; }); }
E.loadGIBS = function (layerId, date) {
  var layer = C.GIBS.layers.filter(function (l) { return l.id === layerId; })[0]; if (!layer) return Promise.reject(new Error('unknown layer')); E.status('Asking NASA for ' + layer.name + (date ? ' on ' + date : '') + '…');
  return gibsFrame(layer, layer.time === 'static' ? null : date).then(function (img) { setMedia('image', img, { id: 'gibs:' + layerId, title: layer.name + (date && layer.time !== 'static' ? ', ' + date : ''), about: layer.about, credit: C.GIBS.credit, lens: layer.lens, projection: 'equirect', overlay: layer.kind === 'data', layer: layerId, date: date || null });
    E.status(layer.name + (date && layer.time !== 'static' ? ' on ' + date : ', most recent') + '. ' + C.GIBS.credit); })
    .catch(function (e) { E.status(e.message === 'empty' ? 'NASA returned an empty map for ' + (date || 'that layer') + '. Try an earlier date.' : 'NASA GIBS could not be reached from here. The built-in frames and your own files still work.'); throw e; });
};
/** A sequence through time: twelve months of a time-varying layer, or the two night-lights epochs. */
E.timelapse = function (layerId, endDate) {
  var layer = C.GIBS.layers.filter(function (l) { return l.id === layerId; })[0]; if (!layer) return Promise.reject(new Error('unknown layer'));
  var jobs = layer.lens === 'lights' && layer.time === 'static' ? [['VIIRS_CityLights_2012', null, '2012'], ['VIIRS_Black_Marble', null, '2016']] : C.stepDates(endDate || C.isoDate(new Date(Date.now() - 4 * 864e5)), 'month', 12).map(function (d) { return [layerId, d, d.slice(0, 7)]; });
  var frames = [], labels = [], i = 0;
  var next = function () { if (i >= jobs.length) return Promise.resolve(); var j = jobs[i++], L = C.GIBS.layers.filter(function (l) { return l.id === j[0]; })[0]; E.status('Loading frame ' + i + ' of ' + jobs.length + ' from NASA…');
    return gibsFrame(L, j[1]).then(function (img) { frames.push(img); labels.push(j[2]); }, function () {}).then(next); };
  return next().then(function () { if (frames.length < 2) { E.status('NASA GIBS did not return enough frames for a time-lapse.'); throw new Error('too few frames'); }
    setMedia('sequence', frames[0], { id: 'gibs:' + layerId, frames: frames, dates: labels, title: layer.name + ', ' + labels[0] + ' to ' + labels[labels.length - 1], about: layer.about, credit: C.GIBS.credit, lens: layer.lens === 'lights' ? 'lightning' : layer.lens, projection: 'equirect', overlay: layer.kind === 'data', layer: layerId });
    E.status(frames.length + ' frames, ' + labels[0] + ' to ' + labels[labels.length - 1] + '. ' + C.GIBS.credit); });
};
function loadVideo(url, cors) { return new Promise(function (res, rej) { var v = doc.createElement('video'); if (cors) v.crossOrigin = 'anonymous'; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
  v.addEventListener('loadeddata', function () { res(v); }, { once: true }); v.addEventListener('error', function () { rej(new Error('video')); }, { once: true }); v.src = url; v.load(); }); }
E.loadFile = function (file) {
  if (!file) return Promise.reject(new Error('no file')); var url = URL.createObjectURL(file), meta = { id: 'file', title: file.name, about: 'A file you supplied.', credit: 'Supplied by the listener', lens: M.lens, projection: 'auto' };
  if (/^video\//.test(file.type)) return loadVideo(url).then(function (v) { setMedia('video', v, meta); E.status(file.name + ' loaded. Listening to it as it plays.'); }, function () { E.status('That video could not be decoded by this browser.'); throw new Error('video'); });
  if (/^image\//.test(file.type)) return loadImage(url).then(function (img) { setMedia('image', img, meta); E.status(file.name + ' loaded and analysed.'); }, function () { E.status('That image could not be read.'); throw new Error('image'); });
  E.status('Choose an image or a video file.'); return Promise.reject(new Error('type'));
};
E.loadURL = function (u) {
  var meta = { id: 'link', title: 'Linked ' + (/\.(mp4|webm|mov|m4v|ogv)(\?|$)/i.test(u) ? 'video' : 'image'), about: 'A link you supplied.', credit: u.replace(/^https?:\/\//, '').split('/')[0], lens: M.lens, projection: 'auto' }, fail = function () { E.status('That link could not be read here: the site may not allow other pages to read its files. Download it and drop the file in instead.'); throw new Error('link'); };
  E.status('Loading…'); return (/\.(mp4|webm|mov|m4v|ogv)(\?|$)/i.test(u) ? loadVideo(u, true).then(function (v) { setMedia('video', v, meta); }) : loadImage(u, true).then(function (img) { if (coverage(img) < 0) throw new Error('tainted'); setMedia('image', img, meta); })).then(function () { E.status('Loaded from ' + meta.credit + '.'); }, fail);
};
function setMedia(kind, el, meta) {
  if (M.kind === 'video' && M.el && M.el !== el) { try { M.el.pause(); M.el.remove(); } catch (e) {} }
  var d = dims(el), proj = meta.projection === 'auto' ? (kind === 'image' && Math.abs(d[0] / d[1] - 2) < 0.03 ? 'equirect' : 'flat') : (meta.projection || 'flat');
  M.kind = kind; M.el = el; M.frames = meta.frames || null; M.dates = meta.dates || null; M.idx = 0; M.id = meta.id; M.title = meta.title || ''; M.about = meta.about || ''; M.credit = meta.credit || ''; M.projection = proj; M.overlay = !!meta.overlay; M.layer = meta.layer || null; M.date = meta.date || null; M.hi = meta.hi || null;
  M.lens = meta.lens || 'auto'; M.base = null; M.live = null; M.prevL = null; M.version++; E.explore.x = 0.5; E.explore.y = 0.5;
  if (kind === 'video') { var hold = doc.getElementById('mediahold'); if (hold) hold.appendChild(el); el.play().catch(function () {}); }
  drawDisplay(); E.onchange(M);
}
E.setLens = function (lens) { if (C.LENSES[lens]) { M.lens = lens; M.version++; E.onchange(M, true); } };
/* the picture shown on the globe or the plane: data overlays sit on a dimmed Blue Marble so the listener's companions can see where they are */
function drawDisplay() {
  var el = E.frameEl(); if (!el || M.kind === 'video') return; var d = dims(el), w = Math.min(1024, d[0] || 1024), h = Math.round(w * (d[1] || 512) / (d[0] || 1024)); if (display.width !== w || display.height !== h) { display.width = w; display.height = h; }
  var x = display.getContext('2d'); x.globalAlpha = 1; x.fillStyle = '#05070f'; x.fillRect(0, 0, w, h);
  if (M.overlay && baseImg && M.projection === 'equirect') { x.globalAlpha = 0.32; x.drawImage(baseImg, 0, 0, w, h); x.globalAlpha = 1; }
  try { x.drawImage(el, 0, 0, w, h); } catch (e) {} M.displayVersion = (M.displayVersion || 0) + 1;
  fine.width = 256; fine.height = Math.max(32, Math.round(256 * h / w)); var fx = fine.getContext('2d', { willReadFrequently: true }); fx.clearRect(0, 0, fine.width, fine.height); try { fx.drawImage(el, 0, 0, fine.width, fine.height); E.finePx = fx.getImageData(0, 0, fine.width, fine.height).data; } catch (e) { E.finePx = null; }
}
E.grab = function () {
  var el = E.frameEl(); if (!el) return null; var d = dims(el); if (!d[0] || !d[1]) return null; var W = C.GRID_W, Hh = C.gridHeight(d[0], d[1]); if (grid.width !== W || grid.height !== Hh) { grid.width = W; grid.height = Hh; }
  var x = grid.getContext('2d', { willReadFrequently: true }); x.clearRect(0, 0, W, Hh); try { x.drawImage(el, 0, 0, W, Hh); return { px: x.getImageData(0, 0, W, Hh).data, W: W, H: Hh }; } catch (e) { return null; }
};
E.pause = function () { if (M.kind === 'video' && M.el) M.el.pause(); }; E.resume = function () { if (M.kind === 'video' && M.el) M.el.play().catch(function () {}); };

/* ---------- words ---------- */
E.poem = function () {
  var how = ' Blue leans minor; warm leans major. Darkness sits low, brightness rises. A still is read from west to east like a score, where height is pitch and light is loudness; a sequence or a video is heard as it changes.';
  if (!M.el) return 'Choose a frame from NASA\u2019s Earth Information Center and this jukebox will listen to it for you.' + how + ' Two NASA frames are built in, fourteen whole-Earth layers can be fetched live from orbit, and you can drop in any image or video of your own.';
  return M.title + '. ' + M.about + ' ' + C.LENSES[M.lens].desc + (M.projection === 'equirect' ? ' The map is wrapped on a globe that turns to wherever is being read. Press X to explore it yourself with the arrow keys.' : ' Press X to explore it yourself with the arrow keys.');
};
E.legend = function () {
  var b = M.base, mid = b ? b.bandMidis : [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84, 86, 88], f = function (i) { return C.m2f(mid[i]); };
  var items = [['The bottom of the frame is low.', function (ctx, out, t) { A.tone(ctx, out, f(1), t, 1.6, { type: 'triangle', gain: 0.1, attack: 0.1, release: 0.6 }); }, 2.6], ['The top of the frame is high.', function (ctx, out, t) { A.tone(ctx, out, f(22), t, 1.6, { type: 'triangle', gain: 0.07, attack: 0.1, release: 0.6 }); }, 2.6],
    ['Dim is quiet; bright is loud.', function (ctx, out, t) { A.tone(ctx, out, f(12), t, 1.2, { type: 'triangle', gain: 0.02, attack: 0.1, release: 0.4 }); A.tone(ctx, out, f(12), t + 1.5, 1.2, { type: 'triangle', gain: 0.12, attack: 0.1, release: 0.4 }); }, 3.6]];
  if (M.lens === 'lights') items.push(['Few lights: slow ticks. Many lights: fast ticks.', function (ctx, out, t) { [0, 1.1].forEach(function (d) { A.pluck(ctx, out, f(8), t + d, { gain: 0.1, decay: 0.8 }); }); for (var i = 0; i < 10; i++) A.pluck(ctx, out, f(8), t + 2.6 + i * 0.13, { gain: 0.1, decay: 0.8 }); }, 4.8]);
  if (M.lens === 'lightning') items.push(['Something that was dark became bright: a strike, placed where it happened.', function (ctx, out, t) { A.strike(ctx, out, t, 0.15, 0.3, 0.6); A.strike(ctx, out, t + 1.2, 0.85, 0.7, 0.9); }, 3.6]);
  if (M.lens === 'carbon') items.push(['A clear frame, then a frame full of plume.', function (ctx, out, t) { A.tone(ctx, out, f(7), t, 1.5, { type: 'sawtooth', gain: 0.04, attack: 0.2, release: 0.5 }); [7, 8, 13].forEach(function (i) { A.tone(ctx, out, f(i) * (i === 8 ? 1.03 : 1), t + 1.8, 1.8, { type: 'sawtooth', gain: 0.04, attack: 0.2, release: 0.5 }); }); }, 4.2]);
  if (M.lens === 'ocean') items.push(['Still water, then moving water.', function (ctx, out, t) { [0, 1.0].forEach(function (d) { A.pluck(ctx, out, f(9), t + d, { gain: 0.09, decay: 1.5 }); }); for (var i = 0; i < 9; i++) A.pluck(ctx, out, f(9 + (i % 3) * 2), t + 2.4 + i * 0.17, { gain: 0.09, decay: 1.2, pan: i / 4 - 1 }); }, 4.6]);
  if (M.lens === 'forest') items.push(['Tall dark canopy, then open land.', function (ctx, out, t) { A.pluck(ctx, out, f(9) / 2, t, { gain: 0.12, decay: 1.6 }); A.pluck(ctx, out, f(9) * 2, t + 1.3, { gain: 0.08, decay: 1.6 }); }, 3.2]);
  return items;
};

/* ---------- sound ---------- */
E.run = function (ctx, out, sc) {
  E.audio = { ctx: ctx, out: out }; if (!M.el) { sc.state.waiting = true; return; } var g0 = E.grab(); if (!g0) { sc.state.waiting = true; return; }
  var f0 = C.features(g0.px, g0.W, g0.H, null), mu = C.musicFrom(f0), base = M.base = Object.assign({}, f0, mu), lens = M.lens, P = C.lensParams(lens, f0); M.live = f0; M.prevL = f0.L; sc.state.col = 0; sc.state.pulse = P.pulse; sc.state.frame = 0; sc.state.strikes = 0;
  var cutoff = 1.6 + 4.5 * base.saturation, ch = base.chord, voicings = [ch, ch.map(function (m, k) { return k === 0 ? m - 5 : m; }), ch.map(function (m, k) { return k === 0 ? m - 3 : m; }), ch.map(function (m, k) { return k === ch.length - 1 ? m + 2 : m; })], ci = 0;
  sc.seq(function (t) { voicings[ci % 4].forEach(function (m, k) { A.pad(ctx, out, C.m2f(m), t, 10, { gain: (lens === 'carbon' ? 0.05 : lens === 'lights' ? 0.026 : 0.04) - k * 0.005, attack: 3, release: 4, cutoff: C.m2f(m) * cutoff * P.filt, pan: (k - 1.5) * 0.3 }); }); ci++; return 8; });
  var sub = A.drone(ctx, out, C.m2f(base.rootMidi - 12), 'sine', 0.0001); sc.nodes.push(sub); A.lfoGain(ctx, sub.g.gain, lens === 'carbon' ? 0.07 : 0.05, 13, 0.4, sc);
  var t1 = A.drone(ctx, out, C.m2f(base.rootMidi + 13), 'sawtooth', 0.0001, { lowpass: 1400, q: 1.2, detune: 9 }), t2 = A.drone(ctx, out, C.m2f(base.rootMidi + 18), 'sawtooth', 0.0001, { lowpass: 1400, q: 1.2, detune: 9 }); sc.nodes.push(t1, t2);
  var scanBus = ctx.createGain(), pn = A.panner(ctx, out, 0); scanBus.connect(pn || out);
  var bands = base.bandMidis.map(function (m, k) { var d = A.drone(ctx, scanBus, C.m2f(m), k % 2 ? 'triangle' : 'sine', 0.0001); sc.nodes.push(d); return d; }), n = 0;
  var setBands = function (vals, t, tc) { vals.forEach(function (v, b) { var gate = P.bandGate ? (v > P.bandGate ? 1.7 : 0.15) : 1; bands[b].g.gain.setTargetAtTime(E.explore.on ? 0.0001 : 0.03 * v * gate * (1 - b / bands.length * 0.5), t, tc); }); };
  sc.seq(function (t) { var live = M.live || base; if (!E.explore.on && Math.random() < 0.85) { var m = ch[n % ch.length] + 12 * (n % 3 === 2 ? 1 : 0) + P.tickOct; n++; A.pluck(ctx, out, C.m2f(m), t, { gain: P.tickGain, decay: P.tickDecay, pan: lens === 'ocean' ? P.panDrift : Math.sin(n) * 0.4 }); if (lens === 'lights') A.haptic(t, 6); } return P.pulse * (0.85 + Math.random() * 0.3); }, 2);
  if (M.kind === 'image') { var colDur = 24 / base.cols.length, x = 0;
    sc.seq(function (t) { if (E.explore.on) { setBands(new Array(C.BANDS).fill(0), t, 0.1); return colDur; } var col = base.cols[x % base.cols.length], u = (x % base.cols.length) / base.cols.length; x++; setBands(col, t, 0.09); if (pn) A.setPan(pn, u * 1.6 - 0.8, t, 0.1); sc.state.col = u; return colDur; }, 1); }
  var lastFlash = 0, frameT = 0;
  sc.every(140, function () { var now = ctx.currentTime, live = M.live, fresh = false;
    if (M.kind === 'video' && !M.el.paused) fresh = true;
    else if (M.kind === 'sequence' && now - frameT > 0.95) { frameT = now; M.idx = (M.idx + 1) % M.frames.length; if (M.idx === 0) M.prevL = null; drawDisplay(); fresh = true; sc.state.frame = M.idx; }
    if (fresh) { var g = E.grab(); if (g) { live = C.features(g.px, g.W, g.H, M.prevL); M.prevL = live.L; M.live = live; } }
    if (!live) return; var q = C.lensParams(lens, live); P.pulse = q.pulse; P.tickOct = q.tickOct; P.tickGain = q.tickGain; P.filt = q.filt; P.panDrift = q.panDrift;
    t1.g.gain.setTargetAtTime(0.05 * q.tension, now, 0.5); t2.g.gain.setTargetAtTime(0.04 * q.tension, now, 0.5);
    if (M.kind !== 'image') { setBands(live.rows, now, 0.12); if (pn) A.setPan(pn, C.clamp(live.dx * 30, -0.9, 0.9), now, 0.3); }
    if ((q.strikes || M.kind === 'sequence') && fresh && live.flashes.length && now - lastFlash > 0.08) { live.flashes.forEach(function (fl, k) { A.strike(ctx, out, now + 0.02 + k * 0.06, fl.x, fl.y, fl.s); }); lastFlash = now; sc.state.strikes += live.flashes.length; sc.state.lastStrikes = live.flashes.map(function (fl) { return { x: fl.x, y: fl.y, s: fl.s, t: now }; }); }
    sc.state.pulse = q.pulse; sc.state.tension = q.tension; });
};
E.readout = function (sc) {
  var b = M.base, live = M.live || b; if (!M.el || !b) return ['No frame yet. Choose a source, drop in an image or video, or paste a link.'];
  var lines = [(M.kind === 'video' ? 'Video' : M.kind === 'sequence' ? 'Sequence, frame ' + (M.idx + 1) + ' of ' + M.frames.length + ' (' + M.dates[M.idx] + ')' : 'Still') + ': mostly ' + b.colorName + ', then ' + b.secondName + '; set in ' + b.rootName + ' ' + b.scaleName + ', ' + b.register + ' register',
    'Brightness ' + Math.round(live.brightness * 100) + ' percent, saturation ' + Math.round(live.saturation * 100) + ' percent, edges ' + Math.round(live.edges * 100) + ' percent, pulse every ' + (sc.state.pulse || 1).toFixed(2) + ' s'];
  if (M.lens === 'lights') lines.push('Bright points cover ' + (live.bright * 100).toFixed(1) + ' percent of the frame; ' + Math.round(live.brightWarm * 100) + ' percent of them are warm');
  if (M.lens === 'ocean') lines.push('Motion ' + (live.motion * 100).toFixed(2) + ' percent per frame, drifting ' + (live.dx > 0.002 ? 'east' : live.dx < -0.002 ? 'west' : 'little'));
  if (M.lens === 'lightning' || M.kind === 'sequence') lines.push((sc.state.strikes || 0) + ' strikes heard so far');
  if (M.lens === 'carbon') lines.push('Plume covers ' + Math.round(live.plume * 100) + ' percent of the frame; tension ' + Math.round((sc.state.tension || 0) * 100) + ' percent');
  if (M.lens === 'forest') lines.push('Green covers ' + Math.round(live.greenShare * 100) + ' percent, average lightness ' + Math.round(live.greenLight * 100) + ' percent');
  if (E.explore.on) lines.push('Exploring: ' + E.explore.text);
  else if (M.kind === 'image') lines.push(M.projection === 'equirect' ? 'Reading the meridian at ' + C.latLonText(0, (sc.state.col || 0) * 360 - 180).split(', ')[1] : 'Reading column ' + (Math.round((sc.state.col || 0) * 96) + 1) + ' of 96');
  return lines;
};

/* ---------- exploring by hand ---------- */
E.setExplore = function (on) { E.explore.on = !!on && !!M.el; if (E.explore.on) E.probeNow(true); return E.explore.on; };
E.move = function (dx, dy) { if (!E.explore.on) return; var ex = E.explore; ex.x = M.projection === 'equirect' ? (((ex.x + dx) % 1) + 1) % 1 : C.clamp(ex.x + dx, 0, 1); ex.y = C.clamp(ex.y + dy, 0, 1); E.probeNow(); };
E.pointTo = function (x, y) { if (!E.explore.on) return; E.explore.x = C.clamp(x, 0, 1); E.explore.y = C.clamp(y, 0, 1); E.probeNow(); };
E.probeNow = function (quiet) {
  var ex = E.explore, px = E.finePx; if (!px) { if (M.kind === 'video') { var g = E.grab(); if (g) { var pv = C.probe(g.px, g.W, g.H, ex.x, ex.y, 1); return say(pv); } } ex.text = 'this picture cannot be read point by point'; return ex.text; }
  return say(C.probe(px, fine.width, fine.height, ex.x, ex.y, 2));
  function say(p) { var where = M.projection === 'equirect' ? C.latLonText(90 - ex.y * 180, ex.x * 360 - 180) + ', near ' + C.regionName(90 - ex.y * 180, ex.x * 360 - 180) : 'column ' + (Math.floor(ex.x * 11.999) + 1) + ' of 12, row ' + (Math.floor(ex.y * 7.999) + 1) + ' of 8';
    ex.text = p.name + ', ' + Math.round(p.l * 100) + ' percent bright. ' + where.charAt(0).toUpperCase() + where.slice(1) + '.'; ex.l = p.l;
    if (!quiet && E.audio && M.base) { var ctx = E.audio.ctx, mid = M.base.bandMidis[p.level]; A.pluck(ctx, E.audio.out, C.m2f(mid), ctx.currentTime + 0.01, { gain: 0.05 + 0.12 * p.l, decay: 0.5 + 1.2 * p.s, pan: ex.x * 1.6 - 0.8 }); if (p.l > 0.62) A.haptic(ctx.currentTime, 12); }
    return ex.text; }
};
})(typeof self !== 'undefined' ? self : globalThis);
