/* Odyssey — Battle of the Aegean
   All sound is synthesised with the Web Audio API; there are no audio files.
   Exposes window.OdysseyAudio. */
(function () {
  "use strict";

  var SFX_KEY = "odyssey.sfx.v1";
  var MUSIC_KEY = "odyssey.music.v1";

  var ctx = null;
  var master = null;
  var musicGain = null;
  var sfxGain = null;

  var sfxOn = readFlag(SFX_KEY, true);
  var musicOn = readFlag(MUSIC_KEY, false);

  var musicTimer = null;
  var musicStep = 0;
  var nextNoteAt = 0;
  var noiseBuffer = null;

  /* Mixolydian-ish figure over a drone — plucked lyre feel. */
  var ROOT = 146.83; // D3
  var SCALE = [0, 2, 4, 5, 7, 9, 10, 12, 14, 16];
  var PHRASE = [0, 4, 2, 7, 4, 5, 2, 0, 4, 7, 9, 7, 5, 4, 2, 0];
  var STEP = 0.42;
  var LOOKAHEAD = 0.35;

  function readFlag(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw === null ? fallback : raw === "1";
    } catch (err) {
      return fallback;
    }
  }

  function writeFlag(key, value) {
    try {
      window.localStorage.setItem(key, value ? "1" : "0");
    } catch (err) { /* storage unavailable — keep the in-memory value */ }
  }

  function ensureContext() {
    if (ctx) return ctx;
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;

    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.85;
    sfxGain.connect(master);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(master);

    var len = Math.floor(ctx.sampleRate * 2);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    return ctx;
  }

  function resume() {
    if (ctx && ctx.state === "suspended") ctx.resume();
  }

  function noise(dest, start, duration, type, freq, q, peak) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    var filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start(start);
    src.stop(start + duration + 0.05);
    return filter;
  }

  function tone(dest, start, duration, type, fromFreq, toFreq, peak) {
    var osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), start + duration);

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  var VOICES = {
    /* arrow strikes a hull: a wet thud with a bowstring snap */
    blood: function (t) {
      noise(sfxGain, t, 0.22, "lowpass", 900, 1, 0.45);
      tone(sfxGain, t, 0.2, "triangle", 220, 70, 0.35);
      tone(sfxGain, t + 0.01, 0.1, "square", 900, 500, 0.06);
    },
    /* arrow into open water: a small plink and splash */
    splash: function (t) {
      noise(sfxGain, t, 0.28, "highpass", 1400, 0.8, 0.22);
      tone(sfxGain, t, 0.16, "sine", 700, 260, 0.16);
    },
    /* catapult stone lands on a hull: timber-cracking blast */
    boom: function (t) {
      noise(sfxGain, t, 0.85, "lowpass", 520, 0.9, 0.75);
      tone(sfxGain, t, 0.7, "sine", 130, 34, 0.6);
      tone(sfxGain, t + 0.03, 0.25, "sawtooth", 300, 90, 0.16);
    },
    /* catapult stone into the sea: heavy plunge and rolling wash */
    smoke: function (t) {
      noise(sfxGain, t, 0.55, "lowpass", 1100, 0.7, 0.4);
      noise(sfxGain, t + 0.12, 1.1, "bandpass", 700, 0.6, 0.2);
      tone(sfxGain, t, 0.4, "sine", 240, 60, 0.28);
    },
    /* a vessel goes under */
    sink: function (t) {
      tone(sfxGain, t, 1.1, "sine", 180, 45, 0.45);
      noise(sfxGain, t + 0.05, 1.0, "lowpass", 800, 0.7, 0.3);
    },
    victory: function (t) {
      [0, 4, 7, 12].forEach(function (semi, i) {
        tone(sfxGain, t + i * 0.13, 0.8, "triangle", ROOT * 2 * Math.pow(2, semi / 12),
          ROOT * 2 * Math.pow(2, semi / 12), 0.3);
      });
    },
    defeat: function (t) {
      [0, -3, -5, -12].forEach(function (semi, i) {
        tone(sfxGain, t + i * 0.18, 0.9, "triangle", ROOT * Math.pow(2, semi / 12),
          ROOT * Math.pow(2, semi / 12), 0.28);
      });
    }
  };

  function play(name) {
    if (!sfxOn) return;
    if (!VOICES[name]) return;
    if (!ensureContext()) return;
    resume();
    VOICES[name](ctx.currentTime + 0.01);
  }

  function pluck(freq, at, gainPeak) {
    var osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;

    var filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2600, at);
    filter.frequency.exponentialRampToValueAtTime(700, at + 0.9);

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(gainPeak, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(musicGain);
    osc.start(at);
    osc.stop(at + 1.2);
  }

  function drone(at, duration) {
    var osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = ROOT / 2;

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.12, at + 1.2);
    gain.gain.linearRampToValueAtTime(0.0001, at + duration);

    osc.connect(gain);
    gain.connect(musicGain);
    osc.start(at);
    osc.stop(at + duration + 0.1);
  }

  function scheduleMusic() {
    while (nextNoteAt < ctx.currentTime + LOOKAHEAD) {
      var i = musicStep % PHRASE.length;
      var semi = SCALE[PHRASE[i]];
      pluck(ROOT * Math.pow(2, semi / 12), nextNoteAt, 0.16);
      if (i % 4 === 0) pluck(ROOT * 2 * Math.pow(2, semi / 12), nextNoteAt + STEP / 2, 0.06);
      if (i === 0) drone(nextNoteAt, STEP * PHRASE.length);
      nextNoteAt += STEP;
      musicStep++;
    }
  }

  function startMusic() {
    if (!ensureContext()) return;
    resume();
    if (musicTimer) return;
    nextNoteAt = ctx.currentTime + 0.1;
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.5);
    scheduleMusic();
    musicTimer = window.setInterval(scheduleMusic, 120);
  }

  function stopMusic() {
    if (musicTimer) {
      window.clearInterval(musicTimer);
      musicTimer = null;
    }
    if (musicGain && ctx) {
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
      musicGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    }
  }

  window.OdysseyAudio = {
    play: play,

    sfxEnabled: function () { return sfxOn; },
    musicEnabled: function () { return musicOn; },

    setSfx: function (on) {
      sfxOn = !!on;
      writeFlag(SFX_KEY, sfxOn);
      if (sfxOn) play("splash");
    },

    setMusic: function (on) {
      musicOn = !!on;
      writeFlag(MUSIC_KEY, musicOn);
      if (musicOn) startMusic(); else stopMusic();
    },

    /* Called after any user gesture so the music can start once autoplay is allowed. */
    wake: function () {
      if (!musicOn) return;
      if (!ensureContext()) return;
      resume();
      if (!musicTimer) startMusic();
    }
  };
})();
