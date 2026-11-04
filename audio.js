/* 周目小镇 · original procedural score and effects, no external audio assets. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DSHAudio = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var STORAGE_KEY = 'dsh_city_audio_v1';
  var DEFAULTS = { music: 0.3, effects: 0.6, muted: false };
  function volume(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
  }
  function settings(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    return { music: volume(raw.music, DEFAULTS.music), effects: volume(raw.effects, DEFAULTS.effects), muted: raw.muted === true };
  }
  function frequency(note) { return 440 * Math.pow(2, (note - 69) / 12); }
  function tone(data, rate, start, duration, note, level, soft) {
    var begin = Math.round(start * rate), count = Math.round(duration * rate), f = frequency(note);
    for (var i = 0; i < count && begin + i < data.length; i++) {
      var t = i / rate, phase = 2 * Math.PI * f * t;
      var envelope = Math.min(1, t / 0.009) * Math.min(1, (duration - t) / 0.055) * Math.exp(-t / (soft ? duration * 0.8 : 0.18));
      data[begin + i] += level * envelope * (Math.sin(phase) + (soft ? 0.12 : 0.24) * Math.sin(phase * 2) + 0.06 * Math.sin(phase * 3));
    }
  }
  function finish(data, peakLimit) {
    var peak = 0, edge = Math.min(128, Math.floor(data.length / 4));
    for (var i = 0; i < edge; i++) { data[i] *= i / edge; data[data.length - i - 1] *= i / edge; }
    for (i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    if (peak > 0) for (i = 0; i < data.length; i++) data[i] *= peakLimit / peak;
    return data;
  }
  // Original 16-bar piece, “晨光街角”: 92 BPM, C / Am / F / G, soft keys and bass.
  function renderMusic(rate) {
    rate = rate || 22050;
    var beat = 60 / 92, data = new Float32Array(Math.round(16 * 4 * beat * rate));
    var chords = [[48,55,60,64],[45,52,57,60],[41,48,53,57],[43,50,55,59]];
    var melody = [
      [72,76,79,76], [71,69,67,64], [69,72,76,74], [71,67,69,71],
      [72,76,79,83], [81,76,72,69], [77,76,72,69], [74,71,67,71],
      [76,79,84,79], [81,79,76,72], [77,81,79,76], [74,79,77,71],
      [76,79,76,72], [72,69,67,64], [69,72,74,76], [74,71,67,72]
    ];
    var noiseSeed = 713;
    for (var bar = 0; bar < 16; bar++) {
      var start = bar * 4 * beat, chord = chords[bar % 4];
      chord.forEach(function (n) { tone(data, rate, start, beat * 3.8, n + 12, 0.045, true); });
      tone(data, rate, start, beat * 1.65, chord[0] - 12, 0.23, true);
      tone(data, rate, start + beat * 2, beat * 1.4, chord[1] - 12, 0.17, true);
      for (var step = 0; step < 8; step++) {
        tone(data, rate, start + step * beat / 2, beat * 0.65, chord[(step + bar) % 4] + 12, 0.075, false);
      }
      melody[bar].forEach(function (n, index) {
        tone(data, rate, start + (index + (index % 2 ? 0.15 : 0)) * beat, beat * 0.86, n, bar >= 8 ? 0.19 : 0.16, true);
      });
      // Quiet, deterministic brush ticks; never use the game's random generator.
      for (step = 0; step < 4; step++) {
        var offset = Math.round((start + (step + 0.5) * beat) * rate);
        for (var k = 0; k < rate * 0.035 && offset + k < data.length; k++) {
          noiseSeed = (noiseSeed * 16807) % 2147483647;
          data[offset + k] += (noiseSeed / 2147483647 - 0.5) * 0.025 * Math.exp(-k / (rate * 0.008));
        }
      }
    }
    return finish(data, 0.55);
  }
  var EFFECTS = {
    click: [[76,0,0.06]], confirm: [[67,0,0.12],[72,0.06,0.16]],
    build: [[48,0,0.14],[55,0.06,0.14],[60,0.12,0.18],[67,0.19,0.22]],
    task: [[64,0,0.12],[69,0.08,0.17]], turn: [[60,0,0.11],[64,0.07,0.13]],
    reward: [[72,0,0.18],[76,0.08,0.19],[79,0.16,0.22],[84,0.25,0.3]],
    blueprint: [[67,0,0.14],[72,0.07,0.17],[76,0.14,0.21]],
    upgrade: [[60,0,0.2],[64,0.09,0.2],[67,0.18,0.22],[72,0.27,0.25],[76,0.38,0.32]],
    error: [[48,0,0.1],[43,0.09,0.14]],
    settle: [[60,0,0.22],[67,0.11,0.25],[72,0.22,0.28],[76,0.33,0.3],[79,0.46,0.42]]
  };
  function renderEffect(name, rate) {
    rate = rate || 22050;
    var notes = EFFECTS[name] || EFFECTS.click;
    var duration = Math.max.apply(null, notes.map(function (n) { return n[1] + n[2]; })) + 0.03;
    var data = new Float32Array(Math.ceil(duration * rate));
    notes.forEach(function (n) { tone(data, rate, n[1], n[2], n[0], 0.25, false); });
    return finish(data, 0.55);
  }
  function create(env) {
    env = env || window;
    var raw;
    try { raw = JSON.parse(env.localStorage.getItem(STORAGE_KEY)); } catch (e) {}
    var prefs = settings(raw), Context = env.AudioContext || env.webkitAudioContext;
    var context = null, musicGain, effectsGain, musicBuffer, musicSource = null;
    var musicOffset = 0, musicStarted = 0, effects = [], buffers = {};
    var unlocked = false, hidden = !!(env.document && env.document.hidden), failed = false, destroyed = false;
    var callback = function () {}, pendingResume = null, lastEffect = -1, removeListeners = [];
    function notify() { callback(getState()); }
    function getState() {
      return { settings: settings(prefs), supported: !!Context && !failed, unlocked: unlocked,
        contextState: context ? context.state : 'idle', musicPlaying: !!musicSource, hidden: hidden };
    }
    function buffer(data) {
      var b = context.createBuffer(1, data.length, 22050);
      b.getChannelData(0).set(data);
      return b;
    }
    function stopMusic() {
      if (!musicSource) return;
      musicOffset = (musicOffset + context.currentTime - musicStarted) % musicBuffer.duration;
      try { musicSource.stop(); musicSource.disconnect(); } catch (e) {}
      musicSource = null;
    }
    function stopEffects() {
      effects.slice().forEach(function (source) { try { source.stop(); source.disconnect(); } catch (e) {} });
      effects = [];
    }
    function setGain(node, value) {
      var now = context.currentTime;
      node.gain.cancelScheduledValues(now);
      node.gain.setTargetAtTime(value, now, 0.012);
      node.gain.setValueAtTime(value, now + 0.065);
    }
    function syncGraph() {
      if (!context || failed || destroyed) return;
      var quiet = prefs.muted || hidden;
      setGain(musicGain, quiet ? 0 : prefs.music);
      setGain(effectsGain, quiet ? 0 : prefs.effects);
      if (quiet || !prefs.effects) stopEffects();
      if (quiet || !prefs.music || context.state !== 'running') stopMusic();
      else if (!musicSource) {
        if (!musicBuffer) musicBuffer = buffer(renderMusic());
        musicSource = context.createBufferSource();
        musicSource.buffer = musicBuffer; musicSource.loop = true;
        musicSource.connect(musicGain); musicStarted = context.currentTime;
        musicSource.start(0, musicOffset);
      }
    }
    function sync() {
      try { syncGraph(); }
      catch (e) { failed = true; stopMusic(); stopEffects(); }
    }
    function ensureContext() {
      if (context || !Context || failed || destroyed) return;
      try {
        context = new Context();
        var master = context.createGain(); master.gain.value = 0.65; master.connect(context.destination);
        musicGain = context.createGain(); musicGain.gain.value = 0; musicGain.connect(master);
        effectsGain = context.createGain(); effectsGain.gain.value = 0; effectsGain.connect(master);
        context.onstatechange = function () { sync(); notify(); };
      } catch (e) { failed = true; context = null; }
    }
    function unlock() {
      if (destroyed || failed || hidden || prefs.muted || (!prefs.music && !prefs.effects)) return Promise.resolve(false);
      unlocked = true; ensureContext();
      if (!context) { notify(); return Promise.resolve(false); }
      if (context.state === 'running') { sync(); notify(); return Promise.resolve(!failed); }
      if (pendingResume) return pendingResume;
      try {
        pendingResume = Promise.resolve(context.resume()).then(function () {
          pendingResume = null;
          if (hidden || destroyed) { if (!destroyed) pause(); return false; }
          sync(); notify(); return !failed && context.state === 'running';
        }, function () { pendingResume = null; notify(); return false; });
      } catch (e) { pendingResume = null; notify(); return Promise.resolve(false); }
      return pendingResume;
    }
    function play(name) {
      if (!context || failed || context.state !== 'running' || hidden || destroyed || prefs.muted || !prefs.effects) return false;
      if (name === 'click' && context.currentTime - lastEffect < 0.05) return false;
      lastEffect = context.currentTime;
      if (!EFFECTS[name]) name = 'click';
      try {
        if (!buffers[name]) buffers[name] = buffer(renderEffect(name));
        while (effects.length >= 4) { var old = effects.shift(); try { old.stop(); old.disconnect(); } catch (e) {} }
        var source = context.createBufferSource(); source.buffer = buffers[name]; source.connect(effectsGain);
        effects.push(source);
        source.onended = function () { effects = effects.filter(function (s) { return s !== source; }); source.disconnect(); };
        source.start(); return true;
      } catch (e) { failed = true; stopMusic(); stopEffects(); notify(); return false; }
    }
    function setSettings(partial) {
      prefs = settings(Object.assign({}, prefs, partial));
      try { env.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch (e) {}
      sync(); notify();
      if (!prefs.muted && unlocked && !hidden) unlock();
      return settings(prefs);
    }
    function pause() {
      stopMusic(); stopEffects();
      if (context && context.state === 'running') {
        try {
          Promise.resolve(context.suspend()).then(function () {
            if (!hidden && !destroyed && unlocked) unlock();
          }, function () {});
        } catch (e) {}
      }
      notify();
    }
    function setHidden(value) {
      hidden = !!value;
      if (hidden) pause();
      else if (unlocked) unlock();
      notify();
    }
    function listen(target, type, fn, capture) {
      target.addEventListener(type, fn, capture);
      removeListeners.push(function () { target.removeEventListener(type, fn, capture); });
    }
    function init(onChange) {
      callback = onChange || callback;
      if (env.document && !removeListeners.length) {
        var gesture = function (e) {
          if (e.isTrusted === false || (e.type === 'keydown' && (e.repeat || e.ctrlKey || e.metaKey || e.altKey || ['Tab','Shift','Control','Alt','Escape'].indexOf(e.key) >= 0))) return;
          unlock();
        };
        listen(env.document, 'pointerdown', gesture, true);
        listen(env.document, 'keydown', gesture, true);
        listen(env.document, 'click', function (e) {
          var b = e.target.closest && e.target.closest('button');
          if (e.isTrusted === false || !b || b.disabled || b.hasAttribute('data-audio-preview')) return;
          unlock(); play('click');
        }, false);
        listen(env.document, 'visibilitychange', function () { setHidden(env.document.hidden); });
        listen(env, 'pagehide', function () { setHidden(true); });
        listen(env, 'pageshow', function () { setHidden(env.document.hidden); });
      }
      notify();
    }
    function destroy() {
      destroyed = true; stopMusic(); stopEffects(); removeListeners.forEach(function (f) { f(); }); removeListeners = [];
      if (context) { context.onstatechange = null; try { Promise.resolve(context.close()).catch(function () {}); } catch (e) {} }
    }
    return { init: init, unlock: unlock, play: play, setSettings: setSettings, getState: getState, setHidden: setHidden, destroy: destroy };
  }
  return { create: create, normalizeSettings: settings, renderMusic: renderMusic, renderEffect: renderEffect,
    effectNames: Object.keys(EFFECTS), storageKey: STORAGE_KEY };
});
