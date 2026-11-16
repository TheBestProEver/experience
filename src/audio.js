/* Hearth audio: the synthesiser. Scenes never touch timers or the wall clock directly; they use H.Clock and ctx.currentTime,
   so the same scene code runs live, renders offline to a file, or is stepped frame by frame for the demo recorder. */
(function (root) {
'use strict';
var H = root.Hearth = root.Hearth || {}, C = H.Core, A = H.Audio = { offline: false, binaural: false, haptic: function () {} };

/* ---------- clocks ---------- */
var RealClock = { setInterval: function (f, ms) { return root.setInterval(f, ms); }, clearInterval: function (id) { root.clearInterval(id); }, setTimeout: function (f, ms) { return root.setTimeout(f, ms); }, clearTimeout: function (id) { root.clearTimeout(id); } };
function VirtualClock() { this.now = 0; this.q = []; this.seq = 0; }
VirtualClock.prototype.setInterval = function (fn, ms) { var id = ++this.seq; this.q.push({ id: id, at: this.now + Math.max(1, ms), fn: fn, iv: Math.max(1, ms) }); return id; };
VirtualClock.prototype.setTimeout = function (fn, ms) { var id = ++this.seq; this.q.push({ id: id, at: this.now + Math.max(0, ms || 0), fn: fn, iv: 0 }); return id; };
VirtualClock.prototype.clearInterval = VirtualClock.prototype.clearTimeout = function (id) { this.q = this.q.filter(function (e) { return e.id !== id; }); };
VirtualClock.prototype.advance = function (ms) {
  var target = this.now + ms;
  for (;;) { var best = null; for (var i = 0; i < this.q.length; i++) if (!best || this.q[i].at < best.at) best = this.q[i]; if (!best || best.at > target) break;
    this.now = best.at; if (best.iv) best.at += best.iv; else this.q.splice(this.q.indexOf(best), 1); best.fn(); }
  this.now = target;
};
H.Clock = RealClock; A.VirtualClock = VirtualClock;

/* ---------- shared buffers ---------- */
var CLIP = (function () { var n = 2048, c = new Float32Array(n); for (var i = 0; i < n; i++) c[i] = Math.tanh(1.7 * (i * 2 / n - 1)); return c; })();
var noiseCache = {}, irCache = {};
function noiseFor(ctx) { var sr = ctx.sampleRate; if (!noiseCache[sr]) { var b = ctx.createBuffer(1, sr * 2, sr), d = b.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; noiseCache[sr] = b; } return noiseCache[sr]; }
function irFor(ctx) {                                                            // a long dark hall: filtered noise with an exponential tail
  var sr = ctx.sampleRate; if (irCache[sr]) return irCache[sr];
  var n = Math.floor(sr * 7.5), buf = ctx.createBuffer(2, n, sr);
  for (var ch = 0; ch < 2; ch++) { var d = buf.getChannelData(ch), lp = 0; for (var i = 0; i < n; i++) { var t = i / sr; lp += ((Math.random() * 2 - 1) - lp) * 0.32; d[i] = lp * Math.exp(-t / 2.7) * (1 - Math.exp(-t * 60)); } }
  return (irCache[sr] = buf);
}

/* ---------- engine: scene bus → dry + convolution reverb → shelves → compressor → limiter → master ---------- */
function Engine(ctx, opts) {
  opts = opts || {}; var c = this.ctx = ctx; this.offline = !!opts.offline;
  this.input = c.createGain(); this.dry = c.createGain(); this.wet = c.createGain(); this.conv = c.createConvolver(); this.conv.buffer = irFor(c);
  this.lowShelf = c.createBiquadFilter(); this.lowShelf.type = 'lowshelf'; this.lowShelf.frequency.value = 95; this.lowShelf.gain.value = 2.5;
  this.highShelf = c.createBiquadFilter(); this.highShelf.type = 'highshelf'; this.highShelf.frequency.value = 7800; this.highShelf.gain.value = -3;
  this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -20; this.comp.knee.value = 24; this.comp.ratio.value = 3; this.comp.attack.value = 0.02; this.comp.release.value = 0.35;
  this.lim = c.createDynamicsCompressor(); this.lim.threshold.value = -5; this.lim.knee.value = 0; this.lim.ratio.value = 20; this.lim.attack.value = 0.001; this.lim.release.value = 0.12;
  this.master = c.createGain(); this.userVol = 0.8; this.ducked = false; this.master.gain.value = 0.8;
  this.input.connect(this.dry); this.dry.connect(this.lowShelf); this.input.connect(this.conv); this.conv.connect(this.wet); this.wet.connect(this.lowShelf);
  this.lowShelf.connect(this.highShelf); this.highShelf.connect(this.comp); this.comp.connect(this.lim); this.lim.connect(this.master);
  if (!this.offline) { this.analyser = c.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0.86; this.master.connect(this.analyser); this.analyser.connect(c.destination);
    this.recDest = c.createMediaStreamDestination ? c.createMediaStreamDestination() : null; if (this.recDest) this.master.connect(this.recDest); }
  else this.master.connect(c.destination);
  this.space = 0.55; this.wet.gain.value = 0.55 * 1.1; this.dry.gain.value = 1 - 0.55 * 0.4;
}
Engine.prototype.setSpace = function (x) { this.space = x; var t = this.ctx.currentTime; this.wet.gain.setTargetAtTime(x * 1.1, t, 0.3); this.dry.gain.setTargetAtTime(1 - x * 0.4, t, 0.3); };
Engine.prototype.setVolume = function (v) { this.userVol = v; this.applyMaster(); };
Engine.prototype.duck = function (on) { this.ducked = on; this.applyMaster(); };
Engine.prototype.applyMaster = function () { this.master.gain.setTargetAtTime(this.userVol * (this.ducked ? 0.3 : 1), this.ctx.currentTime, 0.35); };
A.Engine = Engine;

/* ---------- placing a sound in space ---------- */
function setPan(node, pan, t, tc) {
  pan = C.clamp(pan, -1, 1);
  if (node.pan) { if (t === undefined) node.pan.value = pan; else node.pan.setTargetAtTime(pan, t, tc || 0.1); return; }
  var a = pan * Math.PI / 2, x = Math.sin(a) * 1.6, z = -Math.cos(a) * 1.6;
  if (node.positionX) { if (t === undefined) { node.positionX.value = x; node.positionZ.value = z; } else { node.positionX.setTargetAtTime(x, t, tc || 0.1); node.positionZ.setTargetAtTime(z, t, tc || 0.1); } }
  else if (node.setPosition) node.setPosition(x, 0, z);
}
function panner(ctx, out, pan) {                                                 // HRTF when the listener asked for binaural, plain stereo otherwise
  var p;
  if (A.binaural && ctx.createPanner) { p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'linear'; p.refDistance = 1; p.rolloffFactor = 0; }
  else if (ctx.createStereoPanner) p = ctx.createStereoPanner(); else return null;
  setPan(p, pan || 0); p.connect(out); return p;
}
function outNode(ctx, out, o) { if (o && o.pan !== undefined) { var p = panner(ctx, out, o.pan); if (p) return p; } return out; }
A.panner = panner; A.setPan = setPan;

/* ---------- envelopes and housekeeping ---------- */
function env(p, t, a, peak, d, s, r, dur) { var t1 = t + a, t2 = t1 + d, t3 = t + dur - r; if (t3 < t2) t3 = t2;
  p.setValueAtTime(0.0001, t); p.linearRampToValueAtTime(peak, t1); p.linearRampToValueAtTime(peak * s, t2); p.setValueAtTime(peak * s, t3); p.linearRampToValueAtTime(0.0001, t3 + r); return t3 + r; }
function cleanup(ctx, nodes, at) { if (A.offline) return; H.Clock.setTimeout(function () { nodes.forEach(function (n) { try { n.disconnect(); } catch (e) {} }); }, Math.max(0, (at - ctx.currentTime) + 0.4) * 1000); }
function extra(dest, out) { return dest !== out ? [dest] : []; }

/* ---------- instruments ---------- */
function drone(ctx, out, f, type, gain, o) {                                     // a held oscillator the scene steers by hand
  o = o || {}; var dest = outNode(ctx, out, o), osc = ctx.createOscillator(); osc.type = type; osc.frequency.value = f; if (o.detune) osc.detune.value = o.detune;
  var g = ctx.createGain(); g.gain.value = gain; var flt = null;
  if (o.lowpass) { flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = o.lowpass; flt.Q.value = o.q || 0.7; osc.connect(flt); flt.connect(g); } else osc.connect(g);
  g.connect(dest); osc.start(); var more = [];
  if (o.detune) { var o2 = ctx.createOscillator(); o2.type = type; o2.frequency.value = f; o2.detune.value = -o.detune; o2.connect(flt || g); o2.start(); more.push(o2); }
  return { osc: osc, g: g, flt: flt, extra: more, dest: dest, setFreq: function (v, t, tc) { osc.frequency.setTargetAtTime(v, t, tc); more.forEach(function (x) { x.frequency.setTargetAtTime(v, t, tc); }); },
    stop: function (t) { osc.stop(t); more.forEach(function (x) { x.stop(t); }); cleanup(ctx, [g].concat(extra(dest, out)), t); } };
}
function lfoGain(ctx, param, base, period, depth, sc) { var lfo = ctx.createOscillator(); lfo.frequency.value = 1 / period; var lg = ctx.createGain(); lg.gain.value = base * depth / 2; param.value = base * (1 - depth / 2);
  lfo.connect(lg); lg.connect(param); lfo.start(ctx.currentTime + Math.random() * period); sc.nodes.push({ stop: function (t) { lfo.stop(t); } }); }
function noiseLoop(ctx, out, o) { var dest = outNode(ctx, out, o), src = ctx.createBufferSource(); src.buffer = noiseFor(ctx); src.loop = true;
  var flt = ctx.createBiquadFilter(); flt.type = o.type || 'lowpass'; flt.frequency.value = o.freq || 1000; flt.Q.value = o.q || 0.7; var g = ctx.createGain(); g.gain.value = o.gain === undefined ? 0.02 : o.gain;
  src.connect(flt); flt.connect(g); g.connect(dest); src.start(); return { src: src, flt: flt, g: g, stop: function (t) { src.stop(t); cleanup(ctx, [g].concat(extra(dest, out)), t); } }; }
function noiseBurst(ctx, out, t, o) { var dest = outNode(ctx, out, o), src = ctx.createBufferSource(); src.buffer = noiseFor(ctx); src.loop = true; src.playbackRate.value = 0.8 + Math.random() * 0.4;
  var flt = ctx.createBiquadFilter(); flt.type = o.type || 'bandpass'; flt.Q.value = o.q || 1; var dur = o.dur === undefined ? 1 : o.dur, a = o.attack === undefined ? 0.01 : o.attack, r = o.release === undefined ? 0.3 : o.release;
  flt.frequency.setValueAtTime(o.freq || 1000, t); if (o.sweepTo) flt.frequency.exponentialRampToValueAtTime(o.sweepTo, t + dur);
  var g = ctx.createGain(); src.connect(flt); flt.connect(g); g.connect(dest); var end = env(g.gain, t, a, o.gain === undefined ? 0.05 : o.gain, 0.05, 0.9, r, dur);
  src.start(t, Math.random() * 1.5); src.stop(end + 0.1); cleanup(ctx, [g].concat(extra(dest, out)), end); }
function pad(ctx, out, f, t, dur, o) {                                           // long bowed pad: two detuned saws and a sub-octave triangle through a slowly opening filter
  o = o || {}; var a = o.attack === undefined ? 2.5 : o.attack, r = o.release === undefined ? 3 : o.release, gain = o.gain === undefined ? 0.05 : o.gain, det = o.detune === undefined ? 8 : o.detune, cutoff = Math.min(o.cutoff || f * 3, 16000), type = o.type || 'sawtooth';
  var dest = outNode(ctx, out, o), g = ctx.createGain(), flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = o.q === undefined ? 0.8 : o.q;
  flt.frequency.setValueAtTime(Math.max(60, cutoff * 0.35), t); flt.frequency.linearRampToValueAtTime(cutoff, t + a * 1.4); flt.frequency.setTargetAtTime(Math.max(60, cutoff * 0.45), t + Math.max(a * 1.4, dur - r), r / 3);
  var stopAt = t + Math.max(dur, a + 0.5 + r) + 0.2;
  [[type, -det, 0], [type, det, 0], ['triangle', 0, -1200]].forEach(function (v) { var os = ctx.createOscillator(); os.type = v[0]; os.frequency.value = f; os.detune.value = v[1] + v[2]; os.connect(flt); os.start(t); os.stop(stopAt); });
  flt.connect(g); g.connect(dest); env(g.gain, t, a, gain, 0.5, 0.85, r, dur); cleanup(ctx, [g, flt].concat(extra(dest, out)), stopAt);
}
function tone(ctx, out, f, t, dur, o) {                                          // a plain held note, optionally with vibrato and scintillation
  o = o || {}; var a = o.attack === undefined ? 1 : o.attack, r = o.release === undefined ? 2 : o.release, gain = o.gain === undefined ? 0.08 : o.gain, dest = outNode(ctx, out, o);
  var os = ctx.createOscillator(); os.type = o.type || 'sine'; os.frequency.value = f; var g = ctx.createGain(); os.connect(g); g.connect(dest); var stopAt = t + Math.max(dur, a + 0.3 + r) + 0.2, ex = [];
  if (o.vibrato) { var l = ctx.createOscillator(); l.frequency.value = o.vibrato.rate; var lg = ctx.createGain(); lg.gain.value = o.vibrato.depth; l.connect(lg); lg.connect(os.frequency); l.start(t); l.stop(stopAt); ex.push(lg); }
  if (o.twinkle) { var l2 = ctx.createOscillator(); l2.frequency.value = 7 + Math.random() * 7; var lg2 = ctx.createGain(); lg2.gain.value = gain * 0.3; l2.connect(lg2); lg2.connect(g.gain); l2.start(t); l2.stop(stopAt); ex.push(lg2); }
  env(g.gain, t, a, gain, 0.3, o.sustain === undefined ? 0.8 : o.sustain, r, dur); os.start(t); os.stop(stopAt); cleanup(ctx, [g].concat(ex, extra(dest, out)), stopAt);
}
var BELL = [[1, 1], [2.0, 0.6], [2.76, 0.4], [3.0, 0.3], [4.07, 0.25], [5.42, 0.15]];
A.MOON_PARTIALS = [[1, 1], [2.0, 0.55], [2.4, 0.35], [3.0, 0.3], [4.5, 0.18], [5.33, 0.12], [6.8, 0.07]]; A.GLASS = [[1, 1], [2.76, 0.3], [5.4, 0.12]]; A.ROCK = [[1, 1], [1.41, 0.7], [1.73, 0.5], [2.24, 0.35], [3.16, 0.2]];
function bell(ctx, out, f, t, o) {                                               // additive bell: inharmonic partials, each with its own decay
  o = o || {}; var partials = o.partials || BELL, decay = o.decay === undefined ? 8 : o.decay, dest = outNode(ctx, out, o), g = ctx.createGain(); g.gain.value = o.gain === undefined ? 0.12 : o.gain; g.connect(dest); var last = t;
  partials.forEach(function (p, i) { var fr = f * p[0]; if (fr > 18000) return; var os = ctx.createOscillator(); os.frequency.value = fr; var pg = ctx.createGain(), d = decay / (1 + i * 0.55);
    pg.gain.setValueAtTime(0.0001, t); pg.gain.linearRampToValueAtTime(p[1], t + (o.soft ? 0.09 : 0.012)); pg.gain.exponentialRampToValueAtTime(0.0001, t + d); os.connect(pg); pg.connect(g); os.start(t); os.stop(t + d + 0.05); last = Math.max(last, t + d + 0.05); });
  cleanup(ctx, [g].concat(extra(dest, out)), last);
}
function pluck(ctx, out, f, t, o) {                                              // a felted, piano-like pluck
  o = o || {}; var gain = o.gain === undefined ? 0.1 : o.gain, decay = o.decay === undefined ? 2.5 : o.decay, dest = outNode(ctx, out, o), g = ctx.createGain(), flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 0.6;
  flt.frequency.setValueAtTime(Math.min(f * 7, 16000), t); flt.frequency.exponentialRampToValueAtTime(Math.max(f * 1.4, 120), t + decay * 0.6);
  [['triangle', 0], ['sine', 0], ['triangle', 6]].forEach(function (v) { var os = ctx.createOscillator(); os.type = v[0]; os.frequency.value = f; os.detune.value = v[1]; os.connect(flt); os.start(t); os.stop(t + decay + 0.1); });
  flt.connect(g); g.connect(dest); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + decay); cleanup(ctx, [g, flt].concat(extra(dest, out)), t + decay);
}
function braaam(ctx, out, f, t, dur, o) {                                        // low brass swell
  o = o || {}; dur = dur || 6; var dest = outNode(ctx, out, o), g = ctx.createGain(), flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 1.8;
  flt.frequency.setValueAtTime(f * 1.5, t); flt.frequency.linearRampToValueAtTime(f * 9, t + dur * 0.45); flt.frequency.linearRampToValueAtTime(f * 1.2, t + dur);
  var dist = ctx.createWaveShaper(); dist.curve = CLIP; dist.oversample = '2x';
  [-12, -5, 0, 6, 13].forEach(function (d) { var os = ctx.createOscillator(); os.type = 'sawtooth'; os.frequency.value = f; os.detune.value = d; os.connect(flt); os.start(t); os.stop(t + dur + 0.2); });
  var sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = f / 2; var sg = ctx.createGain(); sg.gain.value = 0.9; sub.connect(sg); sg.connect(g); sub.start(t); sub.stop(t + dur + 0.2);
  flt.connect(dist); dist.connect(g); g.connect(dest); env(g.gain, t, dur * 0.42, o.gain === undefined ? 0.16 : o.gain, 0.1, 0.9, dur * 0.4, dur); cleanup(ctx, [g, flt, dist, sg].concat(extra(dest, out)), t + dur + 0.2);
}
function shepard(ctx, out, o) {                                                  // endless rise or fall: stacked octaves under a raised-cosine window
  var g = ctx.createGain(); g.gain.value = o.gain; g.connect(out); var oscs = [], t0 = ctx.currentTime;
  for (var i = 0; i < o.layers; i++) { var os = ctx.createOscillator(); os.type = 'sine'; var og = ctx.createGain(); og.gain.value = 0; os.connect(og); og.connect(g); os.start(); oscs.push({ os: os, og: og }); }
  var id = H.Clock.setInterval(function () { var now = ctx.currentTime, ph = ((now - t0) / o.period) * o.dir;
    oscs.forEach(function (L, k) { var p = ((k + ph) / o.layers) % 1; if (p < 0) p += 1; L.os.frequency.setTargetAtTime(o.base * Math.pow(2, p * o.layers - o.layers / 2), now, 0.05); L.og.gain.setTargetAtTime((0.5 - 0.5 * Math.cos(2 * Math.PI * p)) / o.layers * 2.2, now, 0.05); }); }, 50);
  return { g: g, stop: function (t) { H.Clock.clearInterval(id); oscs.forEach(function (L) { L.os.stop(t); }); cleanup(ctx, [g], t); } };
}
function organ(ctx, out, f, gain, sc, period) { var g = ctx.createGain(); g.connect(out);
  [[1, 1], [2, 0.42], [3, 0.18], [4, 0.08]].forEach(function (p) { var os = ctx.createOscillator(); os.frequency.value = f * p[0]; var pg = ctx.createGain(); pg.gain.value = p[1]; os.connect(pg); pg.connect(g); os.start(); sc.nodes.push({ stop: function (t) { os.stop(t); } }); });
  lfoGain(ctx, g.gain, gain, period, 0.55, sc); return g; }
function chirp(ctx, out, t, f0, f1, dur, gain, pan) {                            // a sliding sine
  var dest = outNode(ctx, out, { pan: pan }), o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);
  var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.1); cleanup(ctx, [g].concat(extra(dest, out)), t + dur + 0.1);
}
function crack(ctx, out, t, k) {                                                 // sea ice fracturing: dispersive, so the high frequencies arrive first
  noiseBurst(ctx, out, t, { dur: 0.45 + k * 0.5, type: 'bandpass', freq: 2600 + Math.random() * 2600, q: 7, gain: 0.07 + 0.09 * k, attack: 0.004, release: 0.35, sweepTo: 420 + Math.random() * 600, pan: Math.random() * 1.6 - 0.8 });
  chirp(ctx, out, t, 2800 + Math.random() * 2200, 180 + Math.random() * 300, 0.55 + k * 0.5, 0.045 + 0.05 * k, Math.random() * 1.4 - 0.7); A.haptic(t, 15 + k * 25);
}
function strike(ctx, out, t, x, y, s) {                                          // lightning: a crack, a glassy ping placed by height, a falling thump
  var pan = x * 1.8 - 0.9; noiseBurst(ctx, out, t, { dur: 0.25 + 0.5 * s, type: 'highpass', freq: 900, q: 0.6, gain: 0.09 + 0.12 * s, attack: 0.003, release: 0.3 + s * 0.5, pan: pan });
  bell(ctx, out, C.m2f(84 - Math.round(y * 24)), t, { decay: 2.5 + s * 3, gain: 0.05 + 0.06 * s, partials: A.GLASS, pan: pan }); chirp(ctx, out, t, 120, 38, 1.6, 0.05 + 0.18 * s, pan * 0.5); A.haptic(t, 30 + s * 60);
}
function thump(ctx, out, t, gain) { chirp(ctx, out, t, 60, 30, 4, gain === undefined ? 0.3 : gain, 0); }
A.drone = drone; A.lfoGain = lfoGain; A.noiseLoop = noiseLoop; A.noiseBurst = noiseBurst; A.pad = pad; A.tone = tone; A.bell = bell; A.pluck = pluck; A.braaam = braaam; A.shepard = shepard; A.organ = organ; A.chirp = chirp; A.crack = crack; A.strike = strike; A.thump = thump; A.env = env;

/* ---------- time: a look-ahead sequencer ---------- */
function Seq(ctx, cb) { this.ctx = ctx; this.cb = cb; this.timer = null; this.next = 0; this.step = 0; }
Seq.prototype.start = function (delay) { var self = this; this.next = this.ctx.currentTime + (delay === undefined ? 0.1 : delay); this.timer = H.Clock.setInterval(function () { self.tick(); }, 60); this.tick(); };
Seq.prototype.tick = function () { var guard = 0; while (this.next < this.ctx.currentTime + 0.6 && guard++ < 64) { var iv = this.cb(this.next, this.step++); this.next += (typeof iv === 'number' && iv > 0.03) ? iv : 1; } };
Seq.prototype.stop = function () { H.Clock.clearInterval(this.timer); this.timer = null; };

/* ---------- a scene: its own bus, timers and state ---------- */
function Scene(def) { for (var k in def) if (Object.prototype.hasOwnProperty.call(def, k)) { var d = Object.getOwnPropertyDescriptor(def, k); Object.defineProperty(this, k, d); } this.nodes = []; this.timers = []; this.seqs = []; this.state = {}; this.bus = null; }
Scene.prototype.start = function (engine) { this.engine = engine; var ctx = engine.ctx; this.nodes = []; this.timers = []; this.seqs = []; this.state = {};
  this.bus = ctx.createGain(); this.bus.gain.setValueAtTime(0.0001, ctx.currentTime); this.bus.gain.linearRampToValueAtTime(1, ctx.currentTime + (engine.offline ? 0.6 : 2.5)); this.bus.connect(engine.input); this.t0 = ctx.currentTime; this.run(ctx, this.bus, this); };
Scene.prototype.every = function (ms, fn) { var id = H.Clock.setInterval(fn, ms); this.timers.push(id); return id; };
Scene.prototype.seq = function (cb, delay) { var s = new Seq(this.engine.ctx, cb); this.seqs.push(s); s.start(delay); return s; };
Scene.prototype.stop = function (fade) { fade = fade === undefined ? 2.5 : fade; var ctx = this.engine.ctx, now = ctx.currentTime, b = this.bus; this.seqs.forEach(function (s) { s.stop(); }); this.timers.forEach(function (id) { H.Clock.clearInterval(id); });
  b.gain.cancelScheduledValues(now); b.gain.setValueAtTime(Math.max(b.gain.value, 0.0001), now); b.gain.exponentialRampToValueAtTime(0.0001, now + fade); var stopAt = now + fade + 0.3;
  this.nodes.forEach(function (n) { try { n.stop(stopAt); } catch (e) {} }); H.Clock.setTimeout(function () { try { b.disconnect(); } catch (e) {} }, (fade + 1) * 1000); };
A.Seq = Seq; A.Scene = Scene;

/* ---------- running a scene on a virtual clock ---------- */
function virtualCtx(oc, vt) { return new Proxy(oc, { get: function (t, p) { if (p === 'currentTime') return vt.now / 1000; var v = t[p]; return typeof v === 'function' ? v.bind(t) : v; } }); }
function withVirtual(vt, rnd, fn) { var c = H.Clock, r = Math.random, o = A.offline; H.Clock = vt; Math.random = rnd; A.offline = true; try { return fn(); } finally { H.Clock = c; Math.random = r; A.offline = o; } }
/** A scene stepped by hand with no sound: used by the demo recorder and by tests to read a scene's state at a given time. */
A.virtualSession = function (def, opts) {
  opts = opts || {}; var OC = root.OfflineAudioContext || root.webkitOfflineAudioContext, oc = new OC(2, 44100, 44100), vt = new VirtualClock(), rnd = C.rng(opts.seed || 1), ctx = virtualCtx(oc, vt), eng, sc;
  withVirtual(vt, rnd, function () { eng = new Engine(ctx, { offline: true }); sc = new Scene(def); sc.start(eng); });
  return { scene: sc, engine: eng, get time() { return vt.now / 1000; }, step: function (seconds) { withVirtual(vt, rnd, function () { var ms = seconds * 1000; while (ms > 0) { var s = Math.min(20, ms); vt.advance(s); ms -= s; } }); } };
};
/** Render `seconds` of a scene to audio, faster than real time and repeatably. `skip` plays the scene forward silently first. */
A.renderOffline = function (def, seconds, opts) {
  opts = opts || {}; var sr = opts.sampleRate || 44100, skip = opts.skip || 0, total = seconds + skip, OC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
  var oc = new OC(2, Math.ceil(sr * total), sr), vt = new VirtualClock(), ctx = virtualCtx(oc, vt);
  withVirtual(vt, C.rng(opts.seed || 1), function () { var eng = new Engine(ctx, { offline: true }); eng.setSpace((opts.space === undefined ? 0.55 : opts.space) * 0.5 + (def.space || 0.5) * 0.5); var sc = new Scene(def); sc.start(eng); for (var t = 0; t < total * 1000 + 700; t += 20) vt.advance(20); });
  return oc.startRendering().then(function (buf) { var from = Math.floor(skip * sr), ch = [buf.getChannelData(0).slice(from), buf.getChannelData(1).slice(from)], fade = Math.min(ch[0].length, Math.floor(sr * 1.5));
    for (var c = 0; c < 2; c++) for (var i = 0; i < fade; i++) ch[c][ch[c].length - 1 - i] *= i / fade;                    // a short fade so files do not end on a click
    return { channels: ch, sampleRate: sr, levels: C.levels(ch) }; });
};
A.wavBlob = function (render) { return new Blob([C.encodeWAV(render.channels, render.sampleRate)], { type: 'audio/wav' }); };
})(typeof self !== 'undefined' ? self : globalThis);
