/* Hearth app: everything the listener touches. Keyboard first, speech optional, nothing hidden behind sight. */
(function (root) {
'use strict';
var H = root.Hearth, C = H.Core, A = H.Audio, E = H.EIC, V3 = H.V3, Viz = H.Viz, doc = root.document, app = H.app;
var $ = function (id) { return doc.getElementById(id); }, on = function (id, ev, fn) { $(id).addEventListener(ev, fn); };
var Prefs = H.Prefs = { voice: true, autoNarrate: true, speakData: false, rate: 0.92, voiceName: '', announce: true, captions: true, visuals: '3d', motion: 'auto', theme: 'auto', haptics: false, binaural: false };
H.reducedMotion = function () { return Prefs.motion === 'reduced' || (Prefs.motion === 'auto' && root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); };
var scenes = H.SCENES.map(function (d) { return new A.Scene(d); }), defOf = function (id) { return H.SCENES.filter(function (d) { return d.id === id; })[0]; }, indexOf = function (id) { for (var i = 0; i < scenes.length; i++) if (scenes[i].id === id) return i; return -1; };
var playing = false, narrateTimer = null, legendToken = 0, saving = false;

/* ---------- speech, touch, live data ---------- */
var Speech = H.Speech = { ok: 'speechSynthesis' in root, voices: [],
  refresh: function () { if (!this.ok) return; this.voices = root.speechSynthesis.getVoices().filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf('en') === 0; }); fillVoices(); },
  pick: function () { var vs = this.voices, i; if (Prefs.voiceName) for (i = 0; i < vs.length; i++) if (vs[i].name === Prefs.voiceName) return vs[i];
    var pref = ['Google UK English Female', 'Google UK English Male', 'Samantha', 'Daniel', 'Karen', 'Moira', 'Serena', 'Microsoft Sonia', 'Microsoft Aria', 'Microsoft Libby', 'Google US English']; for (i = 0; i < pref.length; i++) for (var j = 0; j < vs.length; j++) if (vs[j].name.indexOf(pref[i]) >= 0) return vs[j];
    for (i = 0; i < vs.length; i++) if (vs[i].localService) return vs[i]; return vs[0] || null; },
  say: function (text, onend) { if (!this.ok || !app.engine || !Prefs.voice || app.capture.on) { return false; } root.speechSynthesis.cancel(); var u = new root.SpeechSynthesisUtterance(text), v = this.pick(), eng = app.engine, done = false; u.rate = Prefs.rate; u.pitch = 0.95; if (v) u.voice = v;
    u.onstart = function () { eng.duck(true); }; u.onend = u.onerror = function () { if (done) return; done = true; eng.duck(false); if (onend) onend(); }; root.speechSynthesis.speak(u); return true; },
  stop: function () { if (this.ok) { root.speechSynthesis.cancel(); if (app.engine) app.engine.duck(false); } } };
A.haptic = function (t, ms) { if (!Prefs.haptics || !root.navigator.vibrate || A.offline || !app.engine) return; root.setTimeout(function () { try { root.navigator.vibrate(ms); } catch (e) {} }, Math.max(0, t - app.engine.ctx.currentTime) * 1000); };
var Live = { fetch: function () { if (!root.fetch) return; var get = function (u) { return root.fetch(u, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
  get(C.SWPC.kp).then(function (j) { var k = C.parseKp(j); if (k) { H.Live.kp = k.kp; H.Live.time = k.time; if (app.current && app.current.id === 'aurora') $('np-poem').textContent = app.current.poem; } });
  get(C.SWPC.wind).then(function (j) { var w = C.parseWind(j); if (w) H.Live.wind = w.speed; }); } };

/* ---------- small helpers ---------- */
function setStatus(t) { $('status').textContent = t || ''; }
function announce(text) { if (!Prefs.announce) return; var el = $('live'); el.textContent = ''; root.setTimeout(function () { el.textContent = text; }, 50); }
function setAccent(c) { doc.documentElement.style.setProperty('--accent', c); }
function openDialog(id) { var d = $(id); if (d && !d.open) { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } } }
function download(blob, name) { var a = doc.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; doc.body.appendChild(a); a.click(); root.setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
function syncURL() { if (!app.current) return; var M = E.media, s = { scene: app.current.id, voice: Prefs.voice ? '' : 0, auto: Prefs.autoNarrate ? '' : 0, viz: Prefs.visuals === '3d' ? '' : Prefs.visuals, motion: Prefs.motion === 'auto' ? '' : Prefs.motion, theme: Prefs.theme === 'auto' ? '' : Prefs.theme, bin: Prefs.binaural ? 1 : '', haptics: Prefs.haptics ? 1 : '' };
  if (app.current.id === 'eic' && M.id && M.id !== 'file' && M.id !== 'link') { s.src = M.id; s.lens = M.lens; if (M.date) s.date = M.date; } try { root.history.replaceState(null, '', '#' + C.encodeState(s)); } catch (e) {} }

/* ---------- the scene list and the now-playing panel ---------- */
function buildTracks() { var nav = $('tracknav'); nav.innerHTML = '';
  [['earth', 'Earth'], ['sky', 'Sky']].forEach(function (g) { var sec = doc.createElement('section'), h = doc.createElement('h2'), ol = doc.createElement('ol'); h.textContent = g[1]; sec.appendChild(h);
    scenes.forEach(function (s, i) { if (s.group !== g[0]) return; var li = doc.createElement('li'), b = doc.createElement('button'); b.className = 'track'; b.type = 'button'; b.dataset.i = i; b.dataset.id = s.id; b.setAttribute('aria-keyshortcuts', s.key === '-' ? 'Minus' : s.key === '=' ? 'Equal' : s.key);
      b.innerHTML = '<span class="key" aria-hidden="true"></span><span class="name"></span><span class="sr-only"></span>'; b.children[0].textContent = s.key; b.children[1].textContent = s.name; b.children[2].textContent = '. ' + s.where + '. Key ' + (s.key === '-' ? 'minus' : s.key === '=' ? 'equals' : s.key); b.title = s.where;
      b.addEventListener('click', function () { selectScene(i); }); li.appendChild(b); ol.appendChild(li); }); sec.appendChild(ol); nav.appendChild(sec); }); }
function renderNow(sc) { $('np-title').textContent = sc.name; $('np-where').textContent = sc.where; $('np-poem').textContent = sc.poem; $('np-poem').hidden = !Prefs.captions; $('np-mapping').textContent = sc.mapping; $('np-source').textContent = sc.source || ''; $('np-source').hidden = !sc.source;
  $('eictools').hidden = sc.id !== 'eic'; $('explorebtn').hidden = sc.id !== 'eic'; doc.querySelectorAll('.track').forEach(function (b) { if (b.dataset.id === sc.id) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); }); renderReadout(); }
function renderReadout() { var sc = app.current; if (!sc) return; var el = $('np-readout'), lines = sc.readout(sc), kids = el.children; while (kids.length > lines.length) el.removeChild(el.lastChild); while (kids.length < lines.length) el.appendChild(doc.createElement('p'));
  for (var i = 0; i < lines.length; i++) if (kids[i].textContent !== lines[i]) kids[i].textContent = lines[i];
  if (sc.id === 'warming' && sc.state.anom !== undefined) { var c = C.anomalyColor(sc.state.anom); setAccent('rgb(' + c.join(',') + ')'); } }

/* ---------- transport ---------- */
function playScene(sc, restart) { var eng = app.engine; if (!eng) return; if (app.current === sc && !restart) return; legendToken++;
  if (app.current && app.current !== sc) { app.current.stop(2.5); if (app.current.id === 'eic') { E.pause(); E.setExplore(false); syncExplore(); } } else if (app.current === sc) sc.stop(1.2);
  app.current = sc; playing = true; $('play').textContent = 'Pause'; eng.setSpace(+$('space').value / 100 * 0.5 + sc.space * 0.5); if (sc.id === 'eic') E.resume();
  sc.start(eng); setAccent(sc.id === 'eic' && E.media.base ? E.media.base.accent : sc.color); V3.use(sc.id); }
function selectScene(i, fromTour) { var sc = scenes[i]; if (!sc || !app.engine) return; Speech.stop(); root.clearTimeout(narrateTimer); if (!fromTour && Tour.on) Tour.schedule();
  if (sc.id === 'eic' && !E.media.el) { playScene(sc, false); renderNow(sc); announce('Earth Information Center. Loading the first frame.'); syncURL(); E.loadSource(pendingSrc || 'frame:night-2012', { date: pendingDate }).catch(function () { if (pendingSrc) E.loadSource('frame:night-2012').catch(function () {}); }); pendingSrc = null; return; }
  playScene(sc, false); renderNow(sc); announce('Now playing: ' + sc.name + '. ' + sc.where + '.'); syncURL(); speakScene(sc); }
function speakScene(sc) { var after = function () { if (Prefs.speakData && app.current === sc) narrateTimer = root.setTimeout(describe, 600); };
  if (Prefs.voice && Prefs.autoNarrate) narrateTimer = root.setTimeout(function () { if (app.current === sc && !Speech.say(sc.poem, after)) after(); }, 1800); else after(); }
function togglePlay() { var eng = app.engine; if (!eng || !app.current) return;
  if (playing) { eng.ctx.suspend(); playing = false; $('play').textContent = 'Play'; Speech.stop(); if (app.current.id === 'eic') E.pause(); announce('Paused'); } else { eng.ctx.resume(); playing = true; $('play').textContent = 'Pause'; if (app.current.id === 'eic') E.resume(); announce('Playing'); } }
function describe() { var sc = app.current; if (!sc) return; var text = sc.name + '. ' + sc.readout(sc).join('. ') + '. ' + sc.mapping + (sc.source ? ' Source: ' + sc.source : ''); if (!Speech.say(text)) announce(Prefs.voice ? text : 'Voice is off. Press V to turn it on. ' + sc.readout(sc).join('. ')); }
function narrate() { var sc = app.current; if (!sc) return; if (!Speech.say(sc.poem)) announce(Prefs.voice ? sc.poem : 'Voice is off. Press V to turn it on.'); }
function setVoice(v) { Prefs.voice = v; $('pVoice').checked = v; $('voicebtn').textContent = v ? 'Voice on' : 'Voice off'; $('voicebtn').setAttribute('aria-pressed', String(v)); if (!v) Speech.stop(); announce(v ? 'Voice on.' : 'Voice off.'); syncURL(); }
/* the legend: each sound on its own, with its meaning, the way a map has a key */
function legend() { var sc = app.current, eng = app.engine; if (!sc || !sc.legend) return; var items = sc.legend(), tok = ++legendToken, i = 0, ctx = eng.ctx; if (!items.length) return; Speech.stop(); root.clearTimeout(narrateTimer);
  var bus = sc.bus, restore = function () { if (bus) bus.gain.setTargetAtTime(1, ctx.currentTime, 0.6); if (tok === legendToken) setStatus(''); }; if (bus) { bus.gain.cancelScheduledValues(ctx.currentTime); bus.gain.setTargetAtTime(0.08, ctx.currentTime, 0.25); }
  var next = function () { if (tok !== legendToken || app.current !== sc) return restore(); if (i >= items.length) return restore(); var it = items[i++]; setStatus('Legend ' + i + ' of ' + items.length + ': ' + it[0]); announce(it[0]);
    var go = function () { if (tok !== legendToken) return restore(); it[1](ctx, eng.input, ctx.currentTime + 0.15); root.setTimeout(next, (it[2] || 3.4) * 1000); }; if (!Speech.say(it[0], go)) root.setTimeout(go, 500); }; next(); }
/* save a minute of the current scene as a WAV, rendered offline so it is fast and identical on every machine */
function saveAudio() { var sc = app.current; if (!sc || saving) return; if (sc.id === 'eic' && E.media.kind === 'video') return recordLive(); if (sc.id === 'eic' && !E.media.el) { setStatus('Load a frame first.'); return; }
  saving = true; setStatus('Rendering sixty seconds of ' + sc.name + '…'); announce('Rendering sixty seconds of ' + sc.name + '. This takes a few seconds.');
  root.setTimeout(function () { var M = E.media, keep = { audio: E.audio, idx: M.idx, base: M.base, live: M.live, prevL: M.prevL, ex: E.explore.on }, p; E.explore.on = false;
    try { p = A.renderOffline(defOf(sc.id), 60, { seed: (Date.now() % 99991) + 1, space: +$('space').value / 100 }); } catch (e) { p = Promise.reject(e); } E.audio = keep.audio; M.idx = keep.idx; M.base = keep.base; M.live = keep.live; M.prevL = keep.prevL; E.explore.on = keep.ex;
    p.then(function (r) { download(A.wavBlob(r), 'hearth-' + sc.id + '.wav'); setStatus('Saved hearth-' + sc.id + '.wav to your downloads.'); announce('Saved to your downloads.'); }, function () { setStatus('This browser could not render the audio.'); announce('This browser could not render the audio.'); }).then(function () { saving = false; }); }, 80); }
var Rec = { mr: null };
function recordLive() { var eng = app.engine; if (Rec.mr) { try { Rec.mr.stop(); } catch (e) {} return; } if (!eng.recDest || !root.MediaRecorder) { setStatus('Recording a video\u2019s sound is not supported in this browser.'); return; }
  var type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].filter(function (t) { return root.MediaRecorder.isTypeSupported(t); })[0]; if (!type) { setStatus('No audio format is available for recording here.'); return; }
  var chunks = [], mr = Rec.mr = new root.MediaRecorder(eng.recDest.stream, { mimeType: type }), left = 60, timer = root.setInterval(function () { $('savebtn').textContent = 'Stop (' + left + ' s)'; if (left-- <= 0) { try { mr.stop(); } catch (e) {} } }, 1000);
  mr.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); }; mr.onstop = function () { root.clearInterval(timer); Rec.mr = null; $('savebtn').textContent = 'Save 60 s'; download(new Blob(chunks, { type: type }), 'hearth-eic.' + (type.indexOf('mp4') >= 0 ? 'm4a' : type.indexOf('ogg') >= 0 ? 'ogg' : 'webm')); setStatus('Recording saved.'); announce('Recording saved to your downloads.'); };
  mr.start(); announce('Recording sixty seconds as the video plays.'); }
var Tour = { on: false, timer: null,
  toggle: function () { this.on = !this.on; $('tourbtn').setAttribute('aria-pressed', String(this.on)); if (this.on) { announce('Tour started. Each scene plays for a minute and a half.'); setStatus('Tour: moving through every scene. Press T to stop.'); this.schedule(); } else { root.clearTimeout(this.timer); setStatus(''); announce('Tour stopped.'); } },
  schedule: function () { var self = this; root.clearTimeout(this.timer); this.timer = root.setTimeout(function () { if (!self.on) return; selectScene((scenes.indexOf(app.current) + 1) % scenes.length, true); self.schedule(); }, 90000); } };

/* ---------- preferences ---------- */
function fillVoices() { var sel = $('pVoiceSel'); if (!sel) return; sel.innerHTML = ''; var o = doc.createElement('option'); o.value = ''; o.textContent = 'Browser default'; sel.appendChild(o); Speech.voices.forEach(function (v) { var x = doc.createElement('option'); x.value = v.name; x.textContent = v.name + ' (' + v.lang + ')'; sel.appendChild(x); }); sel.value = Prefs.voiceName; }
function applyPrefs() { var de = doc.documentElement; if (Prefs.theme === 'auto') de.removeAttribute('data-theme'); else de.setAttribute('data-theme', Prefs.theme); $('np-poem').hidden = !Prefs.captions; A.binaural = Prefs.binaural; V3.applyMode(); }
function setRadio(name, v) { doc.querySelectorAll('input[name="' + name + '"]').forEach(function (r) { r.checked = r.value === v; }); }
function applyState(s) { if (s.voice === '0') Prefs.voice = false; if (s.auto === '0') Prefs.autoNarrate = false; if (['ring', 'off', '3d'].indexOf(s.viz) >= 0) Prefs.visuals = s.viz; if (['reduced', 'full'].indexOf(s.motion) >= 0) Prefs.motion = s.motion; if (['night', 'dawn'].indexOf(s.theme) >= 0) Prefs.theme = s.theme; if (s.bin === '1') Prefs.binaural = true; if (s.haptics === '1') Prefs.haptics = true;
  $('pVoice').checked = Prefs.voice; $('pAuto').checked = Prefs.autoNarrate; $('pBinaural').checked = Prefs.binaural; $('pHaptics').checked = Prefs.haptics; setRadio('visuals', Prefs.visuals); setRadio('motion', Prefs.motion); setRadio('theme', Prefs.theme); $('voicebtn').textContent = Prefs.voice ? 'Voice on' : 'Voice off'; $('voicebtn').setAttribute('aria-pressed', String(Prefs.voice));
  if (s.src && /^(frame|eic|gibs):[\w\-]+$/.test(s.src)) { pendingSrc = s.src; pendingDate = /^\d{4}-\d{2}-\d{2}$/.test(s.date || '') ? s.date : undefined; pendingLens = C.LENSES[s.lens] ? s.lens : null; } applyPrefs(); return indexOf(s.scene) >= 0 ? indexOf(s.scene) : indexOf('earth'); }
var pendingSrc = null, pendingDate, pendingLens = null;

/* ---------- the Earth Information Center panel ---------- */
function fillSources() { var sel = $('source'), groups = {}; sel.innerHTML = ''; E.sources().forEach(function (s) { if (!groups[s.group]) { groups[s.group] = doc.createElement('optgroup'); groups[s.group].label = s.group; sel.appendChild(groups[s.group]); } var o = doc.createElement('option'); o.value = s.id; o.textContent = s.label; groups[s.group].appendChild(o); }); if (E.media.id) sel.value = E.media.id; syncSourceUI(); }
function fillLens() { var sel = $('lens'); sel.innerHTML = ''; Object.keys(C.LENSES).forEach(function (k) { var o = doc.createElement('option'); o.value = k; o.textContent = C.LENSES[k].name; sel.appendChild(o); }); sel.value = E.media.lens; $('lensdesc').textContent = C.LENSES[E.media.lens].desc; }
function gibsLayer() { var v = $('source').value; return v.indexOf('gibs:') === 0 ? C.GIBS.layers.filter(function (l) { return l.id === v.slice(5); })[0] : null; }
function syncSourceUI() { var L = gibsLayer(); $('daterow').hidden = !L || L.time === 'static'; $('lapse').hidden = !L || (L.time === 'static' && L.lens !== 'lights'); $('lapse').textContent = L && L.time === 'static' ? 'Hear 2012 become 2016' : 'Hear twelve months'; }
function loadSelected() { var id = $('source').value, L = gibsLayer(); return E.loadSource(id, { date: L && L.time !== 'static' ? ($('date').value || undefined) : undefined }).catch(function () {}); }
function syncExplore() { var x = E.explore.on; $('explorebtn').setAttribute('aria-pressed', String(x)); $('explorebtn').textContent = x ? 'Stop exploring' : 'Explore'; $('ring').classList.toggle('exploring', x); }
function toggleExplore() { if (!app.current || app.current.id !== 'eic' || !E.media.el) return; var x = E.setExplore(!E.explore.on); syncExplore(); Speech.stop();
  announce(x ? 'Exploring. Arrow keys move across the frame, Shift moves further, Enter says where you are. The automatic reading is paused. ' + E.explore.text : 'Stopped exploring. The automatic reading resumes.'); setStatus(x ? E.explore.text : ''); }
var probeTimer = null; function afterProbe() { setStatus(E.explore.text); root.clearTimeout(probeTimer); probeTimer = root.setTimeout(function () { announce(E.explore.text); }, 350); }
E.status = function (t) { $('eicstatus').textContent = t; };
E.onsources = fillSources;
E.onchange = function (M, lensOnly) { var eic = scenes[indexOf('eic')]; if (pendingLens && !lensOnly) { M.lens = pendingLens; pendingLens = null; } $('lens').value = M.lens; $('lensdesc').textContent = C.LENSES[M.lens].desc; if (M.id && $('source').querySelector('option[value="' + M.id + '"]')) $('source').value = M.id; syncSourceUI(); E.setExplore(false); syncExplore();
  if (!app.engine) return; Speech.stop(); root.clearTimeout(narrateTimer); playScene(eic, true); renderNow(eic); syncURL(); announce(lensOnly ? 'Lens: ' + C.LENSES[M.lens].name + '.' : 'Now playing: ' + M.title + '.'); if (!lensOnly) speakScene(eic); };

/* ---------- wiring ---------- */
function begin() { if (app.engine) return; var AC = root.AudioContext || root.webkitAudioContext; app.engine = new A.Engine(new AC({ latencyHint: 'playback' })); app.engine.ctx.resume(); app.engine.setVolume(+$('vol').value / 100);
  $('gate').hidden = true; $('app').hidden = false; buildTracks(); $('date').value = C.isoDate(new Date(Date.now() - 4 * 864e5)); $('date').max = C.isoDate(new Date()); V3.init(); E.init(); fillSources(); fillLens(); var first = applyState(C.decodeState(root.location.hash));
  selectScene(first); Viz.start(); Live.fetch(); root.setTimeout(function () { var b = doc.querySelector('.track[aria-current="true"]'); if (b) b.focus(); }, 50);
  if (!H.SINGLE && root.navigator.serviceWorker && root.location.protocol === 'https:') root.navigator.serviceWorker.register('sw.js').catch(function () {}); }
on('begin', 'click', begin); on('play', 'click', togglePlay); on('narrate', 'click', narrate); on('describe', 'click', describe); on('legendbtn', 'click', legend); on('savebtn', 'click', saveAudio); on('explorebtn', 'click', toggleExplore);
on('voicebtn', 'click', function () { setVoice(!Prefs.voice); }); on('tourbtn', 'click', function () { Tour.toggle(); }); on('prefsbtn', 'click', function () { openDialog('prefs'); }); on('helpbtn', 'click', function () { openDialog('help'); }); on('prefsdone', 'click', function () { $('prefs').close(); }); on('helpdone', 'click', function () { $('help').close(); });
on('vol', 'input', function (e) { if (app.engine) app.engine.setVolume(+e.target.value / 100); }); on('space', 'input', function (e) { if (app.engine && app.current) app.engine.setSpace(+e.target.value / 100 * 0.5 + app.current.space * 0.5); });
on('pVoice', 'change', function (e) { setVoice(e.target.checked); }); on('pAuto', 'change', function (e) { Prefs.autoNarrate = e.target.checked; syncURL(); }); on('pData', 'change', function (e) { Prefs.speakData = e.target.checked; }); on('pVoiceSel', 'change', function (e) { Prefs.voiceName = e.target.value; });
on('pRate', 'input', function (e) { Prefs.rate = +e.target.value / 100; e.target.setAttribute('aria-valuetext', Prefs.rate.toFixed(2) + ' times normal speed'); }); on('pAnnounce', 'change', function (e) { Prefs.announce = e.target.checked; }); on('pCaptions', 'change', function (e) { Prefs.captions = e.target.checked; applyPrefs(); });
on('pHaptics', 'change', function (e) { Prefs.haptics = e.target.checked; syncURL(); }); on('pBinaural', 'change', function (e) { Prefs.binaural = e.target.checked; applyPrefs(); syncURL(); if (app.current) playScene(app.current, true); announce(Prefs.binaural ? 'Binaural sound on. Use headphones.' : 'Binaural sound off.'); });
['visuals', 'motion', 'theme'].forEach(function (name) { doc.querySelectorAll('input[name="' + name + '"]').forEach(function (r) { r.addEventListener('change', function (e) { Prefs[name] = e.target.value; applyPrefs(); syncURL(); }); }); });
on('source', 'change', function () { syncSourceUI(); loadSelected(); }); on('loadsrc', 'click', loadSelected); on('lapse', 'click', function () { var L = gibsLayer(); if (L) E.timelapse(L.id, $('date').value || undefined).catch(function () {}); });
on('lens', 'change', function (e) { E.setLens(e.target.value); }); on('file', 'change', function (e) { E.loadFile(e.target.files[0]).catch(function () {}); }); on('loadurl', 'click', function () { var u = $('url').value.trim(); if (u) E.loadURL(u).catch(function () {}); }); on('url', 'keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('loadurl').click(); } });
var drop = $('drop'), inEIC = function () { return app.current && app.current.id === 'eic'; };
['dragenter', 'dragover'].forEach(function (ev) { doc.addEventListener(ev, function (e) { if (inEIC()) { e.preventDefault(); drop.classList.add('over'); } }); });
['dragleave', 'drop'].forEach(function (ev) { doc.addEventListener(ev, function (e) { drop.classList.remove('over'); if (ev === 'drop' && inEIC()) { e.preventDefault(); E.loadFile(e.dataTransfer.files[0]).catch(function () {}); } }); });
doc.addEventListener('paste', function (e) { if (!inEIC()) return; var items = (e.clipboardData && e.clipboardData.items) || []; for (var i = 0; i < items.length; i++) if (/^(image|video)\//.test(items[i].type)) { E.loadFile(items[i].getAsFile()).catch(function () {}); break; } });
var ring = $('ring'), dragging = false, point = function (e) { var r = ring.getBoundingClientRect(); E.pointTo((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); afterProbe(); };
ring.addEventListener('pointerdown', function (e) { if (E.explore.on) { dragging = true; point(e); e.preventDefault(); } }); ring.addEventListener('pointermove', function (e) { if (dragging && E.explore.on) point(e); }); ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { ring.addEventListener(ev, function () { dragging = false; }); });
root.setInterval(function () { if (!app.capture.on) renderReadout(); }, 250);
if (Speech.ok) { Speech.refresh(); root.speechSynthesis.onvoiceschanged = function () { Speech.refresh(); }; }

doc.addEventListener('keydown', function (e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return; var tag = (e.target.tagName || '').toUpperCase(), inField = (tag === 'INPUT' && ['checkbox', 'radio', 'range'].indexOf(e.target.type) < 0) || tag === 'TEXTAREA' || tag === 'SELECT', inDialog = e.target.closest && e.target.closest('dialog'), k = e.key;
  if (!app.engine) { if (k === 'Enter' && !inField) { e.preventDefault(); begin(); } return; } if (inField || inDialog) return; if (Tour.on && k !== 't' && k !== 'T') Tour.schedule();
  if (E.explore.on && inEIC()) { var step = e.shiftKey ? 1 / 12 : 1 / 48, mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k]; if (mv) { e.preventDefault(); E.move(mv[0], mv[1]); afterProbe(); return; } if (k === 'Enter' && tag !== 'BUTTON') { e.preventDefault(); E.probeNow(); if (!Speech.say(E.explore.text)) announce(E.explore.text); return; } if (k === 'Escape') { toggleExplore(); return; } }
  for (var i = 0; i < scenes.length; i++) if (scenes[i].key.toLowerCase() === k.toLowerCase()) { e.preventDefault(); selectScene(i); return; }
  var kl = k.toLowerCase(); if (k === ' ' && tag !== 'BUTTON') { e.preventDefault(); togglePlay(); } else if (kl === 'n') { e.preventDefault(); narrate(); } else if (kl === 'd') { e.preventDefault(); describe(); } else if (kl === 'v') { e.preventDefault(); setVoice(!Prefs.voice); } else if (kl === 'l') { e.preventDefault(); legend(); }
  else if (kl === 's') { e.preventDefault(); saveAudio(); } else if (kl === 'x') { e.preventDefault(); toggleExplore(); } else if (kl === 't') { e.preventDefault(); Tour.toggle(); } else if (kl === 'p') { e.preventDefault(); openDialog('prefs'); } else if (k === '?') { e.preventDefault(); openDialog('help'); } else if (k === 'Escape') { Speech.stop(); legendToken++; }
  else if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); selectScene((scenes.indexOf(app.current) + (k === 'ArrowRight' ? 1 : scenes.length - 1)) % scenes.length); } });

/* ---------- capture: the same app, stepped frame by frame on a virtual clock (demo recorder, visual tests) ---------- */
app.capture = { on: false, vs: null,
  start: function (id, opts) { opts = opts || {}; Viz.paused = true; Speech.stop(); root.clearTimeout(narrateTimer); if (!this.on && app.current) { app.current.stop(0.1); this.liveEngine = app.engine; } this.on = true; if (id === 'eic') { E.media.idx = 0; E.media.prevL = null; }
    this.vs = A.virtualSession(defOf(id), { seed: opts.seed || 7 }); if (opts.skip) this.vs.step(opts.skip); app.current = this.vs.scene; app.engine = this.vs.engine; renderNow(app.current); setAccent(id === 'eic' && E.media.base ? E.media.base.accent : app.current.color); V3.use(id); V3.time = opts.skip || 0; },
  frame: function (dt, f) { this.vs.step(dt); renderReadout(); V3.render(f || { rms: 0.15, bass: 0.3, mid: 0.25, high: 0.15 }, dt); },
  caption: function (text) { var c = $('caption'); c.textContent = text || ''; c.hidden = !text; } };
app.scenes = scenes; app.select = function (id) { selectScene(indexOf(id)); }; app.begin = begin; app.defOf = defOf;
root.__hearth = { H: H, begin: begin, select: app.select, ids: scenes.map(function (s) { return s.id; }), state: function () { return app.current ? { id: app.current.id, state: app.current.state, playing: playing } : null; },
  offline: function (id, seconds, opts) { return A.renderOffline(defOf(id), seconds, opts || {}).then(function (r) { return { peak: r.levels.peak, rms: r.levels.rms, bad: r.levels.bad, seconds: r.channels[0].length / r.sampleRate }; }); },
  wav: function (id, seconds, opts) { return A.renderOffline(defOf(id), seconds, opts || {}).then(function (r) { var b = new Uint8Array(C.encodeWAV(r.channels, r.sampleRate)), s = ''; for (var i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return root.btoa(s); }); } };
})(typeof self !== 'undefined' ? self : globalThis);
