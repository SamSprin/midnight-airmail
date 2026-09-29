/* Midnight Airmail — MA.audio
   Everything is synthesized with the Web Audio API (no audio files): soft paper foley,
   music-box notes, and a procedural lullaby loop. Every entry point is a silent no-op
   when Web Audio is missing, the context is not unlocked yet, or the game is muted.

   Public API:
     MA.audio.unlock()              call from a user gesture (click/key/touch); safe to repeat
     MA.audio.play(name, opts)      opts: { pitch: semitones (default 0), volume: 0..1 }
     MA.audio.setMuted(b) / isMuted()
     MA.audio.setVolume(v)          master SFX volume 0..1, default 0.7
     MA.audio.music(on) / isMusicOn()   lullaby loop
     MA.audio.setMusicVolume(v)     default 0.35
   Extras: getVolume(), getMusicVolume(), list() (sound names), isUnlocked(). */
(function (root) {
  'use strict';
  var MA = root.MA = root.MA || {};

  var LOOKAHEAD = 1.6;      // seconds of music scheduled ahead of the audio clock
  var TICK_MS = 250;        // how often the scheduler wakes up
  var MAX_PER_SEC = 25;     // per-sound throttle
  var MAX_ACTIVE = 450;     // hard cap on live source nodes
  var OUT_LEVEL = 0.8;      // master headroom
  var MUSIC_TRIM = 1.5;     // music bus makeup so the lullaby sits just under the sfx
  // Per-sound loudness trim (measured with an offline render so every effect peaks roughly
  // between -18 and -10 dBFS at the default volume; filtered-noise foley needs the most).
  var LEVEL = {
    select: 5.2, deselect: 5, deal: 4.8, send: 3.5, crumple: 1.5, ink: 4, glow: 2.7, xglow: 1.4,
    stamp: 2.2, say: 3, retrigger: 3.9, total: 1.6, plane: 2.9, window: 2.9, win: 1.3, lose: 1.7,
    buy: 2.2, sell: 2.5, reroll: 3.3, pack: 2.3, use: 2.5, click: 2.5, error: 2.2, moon: 1.5
  };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function jit() { return 1 + (Math.random() - 0.5) * 0.06; }
  function nowMs() {
    return (root.performance && typeof root.performance.now === 'function') ? root.performance.now() : Date.now();
  }
  function noop() {}
  function swallow(p) { if (p && typeof p.catch === 'function') p.catch(noop); }

  /* ---------------------------------------------------------------- lullaby data */
  // F major, 3/4. 16 bars: A A' B A''.  Notes are [beatOffset, midi, beats].
  var MELODY = [
    /* 1  F  */ [[0, 69, 1], [1, 72, 1], [2, 77, 1]],
    /* 2  Dm */ [[0, 74, 2], [2, 72, 1]],
    /* 3  Bb */ [[0, 70, 1], [1, 74, 1], [2, 77, 1]],
    /* 4  C  */ [[0, 76, 2], [2, 74, 1]],
    /* 5  F  */ [[0, 72, 1], [1, 77, 1], [2, 81, 1]],
    /* 6  Dm */ [[0, 77, 1], [1, 74, 1], [2, 77, 1]],
    /* 7  Bb */ [[0, 74, 1], [1, 72, 1], [2, 70, 1]],
    /* 8  F  */ [[0, 72, 2], [2, 69, 1]],
    /* 9  Bb */ [[0, 74, 1.5], [1.5, 77, 0.5], [2, 74, 1]],
    /* 10 F  */ [[0, 77, 2], [2, 72, 1]],
    /* 11 Gm */ [[0, 70, 1], [1, 74, 1], [2, 79, 1]],
    /* 12 C  */ [[0, 76, 1.5], [1.5, 74, 0.5], [2, 72, 1]],
    /* 13 F  */ [[0, 77, 1], [1, 72, 1], [2, 69, 1]],
    /* 14 Am */ [[0, 69, 1], [1, 72, 1], [2, 76, 1]],
    /* 15 Bb C */ [[0, 77, 1], [1, 76, 1], [2, 74, 1]],
    /* 16 F  */ [[0, 72, 1], [1, 69, 1], [2, 65, 1]]
  ];
  // Occasional alternate bars (chosen per loop).
  var ALT = {
    0: [[0, 72, 1], [1, 69, 1], [2, 77, 1]],
    4: [[0, 72, 1], [1, 77, 1], [2, 72, 1]],
    12: [[0, 77, 1], [1, 74, 1], [2, 72, 1]]
  };
  // Chord segments per bar: [startBeat, lengthBeats, rootMidi, 'M'|'m'].
  var CHORDS = [
    [[0, 3, 53, 'M']], [[0, 3, 50, 'm']], [[0, 3, 46, 'M']], [[0, 3, 48, 'M']],
    [[0, 3, 53, 'M']], [[0, 3, 50, 'm']], [[0, 3, 46, 'M']], [[0, 3, 53, 'M']],
    [[0, 3, 46, 'M']], [[0, 3, 53, 'M']], [[0, 3, 55, 'm']], [[0, 3, 48, 'M']],
    [[0, 3, 53, 'M']], [[0, 3, 57, 'm']], [[0, 1, 46, 'M'], [1, 2, 48, 'M']], [[0, 3, 53, 'M']]
  ];
  var SCALE_PC = { 0: 1, 2: 1, 4: 1, 5: 1, 7: 1, 9: 1, 10: 1 };   // F major
  function scaleUp(m) { do { m++; } while (!SCALE_PC[m % 12]); return m; }
  function fold(m, lo, hi) { while (m > hi) m -= 12; while (m < lo) m += 12; return m; }

  /* ---------------------------------------------------------------- engine */
  /* One engine per AudioContext. The public MA.audio owns a single live one; tests can
     create engines over an OfflineAudioContext via MA.audio._engine(ctx). */
  function createEngine(ctx, offline) {
    var E = {};
    var stats = { active: 0 };
    var sfxVol = 0.7, musicVol = 0.35, muted = false;
    var unlockTs = -1e9;
    var V = 1;                 // volume multiplier of the sfx currently being built
    var inMusic = false;       // true while the music scheduler is building nodes
    var sess = null;           // music session being built
    var mus = null;            // running music session
    var hist = {};
    var sr = ctx.sampleRate || 44100;

    /* ---- graph: sfxBus/musicBus -> outBus -> compressor -> destination, + shared reverb ---- */
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 22; comp.ratio.value = 5;
    comp.attack.value = 0.006; comp.release.value = 0.25;
    comp.connect(ctx.destination);
    var outBus = ctx.createGain(); outBus.gain.value = OUT_LEVEL; outBus.connect(comp);
    var sfxBus = ctx.createGain(); sfxBus.gain.value = sfxVol; sfxBus.connect(outBus);
    var musicBus = ctx.createGain(); musicBus.gain.value = musicVol * MUSIC_TRIM; musicBus.connect(outBus);
    var conv = ctx.createConvolver();
    conv.buffer = makeImpulse(1.7, 3);
    var revRet = ctx.createGain(); revRet.gain.value = 0.9; conv.connect(revRet); revRet.connect(outBus);
    var sfxSend = ctx.createGain(); sfxSend.gain.value = 0.28; sfxBus.connect(sfxSend); sfxSend.connect(conv);
    var musSend = ctx.createGain(); musSend.gain.value = 0.5; musicBus.connect(musSend); musSend.connect(conv);

    var noiseBuf = ctx.createBuffer(1, Math.floor(sr * 3), sr);
    (function () { var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; })();

    function makeImpulse(sec, decay) {
      var rate = ctx.sampleRate || 44100, len = Math.floor(rate * sec);
      var buf = ctx.createBuffer(2, len, rate);
      for (var c = 0; c < 2; c++) {
        var d = buf.getChannelData(c), lp = 0;
        for (var i = 0; i < len; i++) {
          var k = i / len, damp = 0.55 + 0.4 * k;            // darker as the tail dies
          lp = lp * damp + (Math.random() * 2 - 1) * (1 - damp);
          var fade = i < rate * 0.004 ? i / (rate * 0.004) : 1;
          d[i] = lp * Math.pow(1 - k, decay) * fade;
        }
      }
      return buf;
    }

    /* ---- node helpers ---- */
    function dest() { return inMusic ? sess.bus : sfxBus; }
    function clampF(f) { return clamp(f, 20, sr * 0.45); }

    function reg(src, nodes) {
      stats.active++;
      var s = inMusic ? sess : null;
      if (s) s.srcs.push(src);
      src.onended = function () {
        stats.active--;
        if (s) { var i = s.srcs.indexOf(src); if (i >= 0) s.srcs.splice(i, 1); }
        try { src.disconnect(); } catch (e) {}
        for (var k = 0; k < nodes.length; k++) { try { nodes[k].disconnect(); } catch (e2) {} }
      };
    }

    function env(p, t, peak, attack, dur) {
      peak = Math.max(peak, 0.0002);
      attack = Math.min(attack, dur * 0.5);
      p.setValueAtTime(0.0001, t);
      p.linearRampToValueAtTime(peak, t + attack);
      p.exponentialRampToValueAtTime(0.0001, t + dur);
    }

    function sweep(p, t, dur, f, o) {
      p.setValueAtTime(clampF(f), t);
      if (o && o.path) {
        for (var i = 0; i < o.path.length; i++) p.exponentialRampToValueAtTime(clampF(o.path[i][1]), t + o.path[i][0]);
      } else if (o && o.f2) {
        p.exponentialRampToValueAtTime(clampF(o.f2), t + dur * (o.fdur || 1));
      }
    }

    function panner(t, dur, o, nodes) {
      if (!o || !o.pan || !ctx.createStereoPanner) return null;
      var pn = ctx.createStereoPanner();
      pn.pan.setValueAtTime(o.pan[0], t);
      pn.pan.linearRampToValueAtTime(o.pan[1], t + dur);
      nodes.push(pn);
      return pn;
    }

    /* Oscillator voice with a soft-attack, exponential-decay envelope. */
    function tone(type, f, t, dur, peak, attack, to, o) {
      var osc = ctx.createOscillator(), g = ctx.createGain(), nodes = [g];
      osc.type = type;
      sweep(osc.frequency, t, dur, f, o);
      if (o && o.det) osc.detune.value = o.det;
      env(g.gain, t, peak * V, attack, dur);
      osc.connect(g);
      var pn = panner(t, dur, o, nodes);
      if (pn) { g.connect(pn); pn.connect(to || dest()); } else { g.connect(to || dest()); }
      if (o && o.own) nodes = nodes.concat(o.own);
      osc.start(t); osc.stop(t + dur + 0.05);
      osc._t0 = t;
      reg(osc, nodes);
    }

    /* Filtered noise burst. o: { type, f, f2, path, fdur, q, pan, to } */
    function noise(t, dur, peak, attack, o) {
      var src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
      var nodes = [flt, g];
      src.buffer = noiseBuf;
      flt.type = o.type || 'bandpass';
      sweep(flt.frequency, t, dur, o.f, o);
      flt.Q.value = o.q || 1;
      env(g.gain, t, peak * V, attack, dur);
      src.connect(flt); flt.connect(g);
      var pn = panner(t, dur, o, nodes);
      if (pn) { g.connect(pn); pn.connect(o.to || dest()); } else { g.connect(o.to || dest()); }
      src.start(t, Math.random() * Math.max(0.01, noiseBuf.duration - dur - 0.1));
      src.stop(t + dur + 0.02);
      src._t0 = t;
      reg(src, nodes);
    }

    /* Lowpass "room" that a sound's voices can share; the last (longest) voice frees it. */
    function lpBus(freq) {
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = freq; lp.Q.value = 0.4;
      lp.connect(dest());
      return lp;
    }

    /* Music-box / glockenspiel note: fundamental + soft overtone + tiny tine. */
    function boxF(f, t, dur, peak, to, own) {
      tone('sine', f, t, dur, peak, 0.004, to, own ? { own: own } : null);
      tone('sine', f * 2.0, t, dur * 0.35, peak * 0.22, 0.003, to);
      tone('sine', f * 5.4, t, dur * 0.1, peak * 0.05, 0.002, to);
    }

    /* ---- throttle / readiness ---- */
    function throttle(name) {
      var now = nowMs(), a = hist[name] || (hist[name] = []);
      while (a.length && now - a[0] > 1000) a.shift();
      if (a.length >= MAX_PER_SEC) return false;
      a.push(now);
      return true;
    }

    function ready() {
      if (offline) return true;
      var st = ctx.state;
      if (st === 'running') return true;
      // Right after a gesture the context is still "suspended" for a few ms: scheduled
      // nodes simply start once it resumes, so allow a short grace window.
      if ((st === 'suspended' || st === 'interrupted') && nowMs() - unlockTs < 500) return true;
      return false;
    }

    /* ================================================================ sound effects */
    var S = {};

    S.select = function (t, pf) {
      var j = jit();
      noise(t, 0.05, 0.20, 0.004, { f: 2600 * pf * j, q: 1.4 });
      tone('sine', 900 * pf * j, t, 0.05, 0.05, 0.003, null, { f2: 700 * pf * j });
    };
    S.deselect = function (t, pf) {
      var j = jit();
      noise(t, 0.055, 0.17, 0.004, { f: 2000 * pf * j, q: 1.3 });
      tone('sine', 640 * pf * j, t, 0.055, 0.05, 0.003, null, { f2: 480 * pf * j });
    };
    S.deal = function (t, pf) {
      var j = jit();
      noise(t, 0.085, 0.22, 0.012, { f: 1100 * pf * j, f2: 3400 * pf * j, q: 0.8 });
    };
    S.send = function (t, pf) {
      tone('sine', 220 * pf, t + 0.03, 0.06, 0.10, 0.004, null, { f2: 150 * pf });
      noise(t, 0.06, 0.16, 0.005, { f: 1800 * pf, q: 1.5 });
      noise(t + 0.08, 0.07, 0.14, 0.005, { f: 2500 * pf, q: 1.5 });
      noise(t + 0.10, 0.55, 0.13, 0.16, { f: 600 * pf, f2: 1900 * pf, fdur: 0.7, q: 1.1 });
      tone('sine', 380 * pf, t + 0.12, 0.5, 0.025, 0.15, null, { f2: 640 * pf });
    };
    S.crumple = function (t, pf) {
      var n = 9 + Math.floor(Math.random() * 4);
      for (var i = 0; i < n; i++) {
        var at = t + Math.pow(Math.random(), 1.4) * 0.24;      // crackles bunch up early
        noise(at, rnd(0.008, 0.024), rnd(0.10, 0.24), 0.002,
          { type: Math.random() < 0.5 ? 'highpass' : 'bandpass', f: rnd(1500, 5200) * pf, q: rnd(0.8, 3) });
      }
      noise(t, 0.22, 0.07, 0.02, { f: 1200 * pf, q: 0.7 });
    };
    S.ink = function (t, pf) {
      var f = 660 * pf;
      noise(t, 0.05, 0.10, 0.004, { f: 3600 * pf, q: 2.2 });
      noise(t + 0.045, 0.05, 0.08, 0.004, { f: 4200 * pf, q: 2.2 });
      tone('sine', f, t + 0.01, 0.2, 0.09, 0.006);
      tone('triangle', f * 2, t + 0.01, 0.1, 0.02, 0.006);
    };
    S.glow = function (t, pf) {
      var f = 523.25 * pf;
      tone('sine', f, t, 0.9, 0.22, 0.004);
      tone('triangle', f * 2, t, 0.35, 0.07, 0.004);
      tone('sine', f * 4.01, t, 0.12, 0.02, 0.002);
    };
    S.xglow = function (t, pf) {
      var f = 659.25 * pf;
      function chime(ff, tt) {
        tone('sine', ff, tt, 0.8, 0.17, 0.004);
        tone('triangle', ff * 2, tt, 0.4, 0.06, 0.004);
        tone('sine', ff * 3, tt, 0.25, 0.035, 0.003);
      }
      chime(f, t);
      chime(f * 1.5, t + 0.075);
      tone('sine', f * 4, t + 0.15, 0.3, 0.025, 0.002);
      tone('sine', f * 6, t + 0.2, 0.18, 0.015, 0.002);
    };
    S.stamp = function (t, pf) {
      tone('sine', 150 * pf, t, 0.16, 0.42, 0.003, null, { f2: 55 * pf });
      noise(t, 0.06, 0.18, 0.003, { type: 'lowpass', f: 900, q: 0.7 });
      noise(t, 0.03, 0.08, 0.001, { type: 'highpass', f: 2500 });
      tone('sine', 1976 * pf, t + 0.07, 0.3, 0.06, 0.002);
      tone('sine', 2637 * pf, t + 0.075, 0.22, 0.04, 0.002);
    };
    S.say = function (t, pf) {
      var f = 330 * pf * (1 + (Math.random() - 0.5) * 0.12);
      tone('sine', f * 0.8, t, 0.12, 0.2, 0.01, null, { f2: f * 1.05, fdur: 0.5 });
      tone('triangle', f * 1.6, t, 0.08, 0.03, 0.01);
    };
    S.retrigger = function (t, pf) {
      tone('triangle', 520 * pf, t, 0.13, 0.13, 0.012, null, { f2: 1300 * pf });
      tone('sine', 1040 * pf, t + 0.02, 0.1, 0.04, 0.01, null, { f2: 2600 * pf });
    };
    S.total = function (t, pf) {
      var lp = lpBus(2200);
      var notes = [
        ['sine', 174.61, 0.10], ['sine', 261.63, 0.09], ['triangle', 349.23, 0.08],
        ['sine', 440.0, 0.08], ['sine', 523.25, 0.07]
      ];
      for (var i = 0; i < notes.length; i++) {
        tone(notes[i][0], notes[i][1] * pf, t, 0.75, notes[i][2], 0.14, lp, i === notes.length - 1 ? { own: [lp] } : null);
      }
    };
    S.plane = function (t, pf) {
      var D = 0.9;
      noise(t, D, 0.20, 0.35, { f: 380 * pf, path: [[0.4, 1500 * pf], [D, 420 * pf]], q: 1.6, pan: [-0.7, 0.7] });
      tone('sine', 560 * pf, t, D, 0.02, 0.35, null, { path: [[0.4, 760 * pf], [D, 470 * pf]], pan: [-0.7, 0.7] });
    };
    S.window = function (t, pf) {
      var P = [1046.5, 1174.7, 1396.9, 1568, 1760];
      var a = P[Math.floor(Math.random() * P.length)] * pf, b = P[Math.floor(Math.random() * P.length)] * pf;
      tone('sine', a, t, 0.35, 0.09, 0.003);
      tone('sine', a * 2, t, 0.12, 0.02, 0.003);
      tone('sine', b, t + 0.07, 0.3, 0.06, 0.003);
    };
    S.win = function (t, pf) {
      var seq = [65, 69, 72, 77, 81, 84], i;
      for (i = 0; i < seq.length; i++) boxF(mtof(seq[i]) * pf, t + i * 0.12, 1.2 + (i === 5 ? 0.6 : 0), 0.17);
      var lp = lpBus(1800);
      var ch = [174.61, 220.0, 261.63, 349.23];
      for (i = 0; i < ch.length; i++) {
        tone('sine', ch[i] * pf, t + 0.6, 1.6, 0.05, 0.25, lp, i === ch.length - 1 ? { own: [lp] } : null);
      }
      tone('sine', 2093 * pf, t + 0.72, 0.5, 0.03, 0.003);
    };
    S.lose = function (t, pf) {
      var lp = lpBus(1500), n = [440, 349.23, 293.66];
      for (var i = 0; i < 3; i++) boxF(n[i] * pf, t + i * 0.36, i === 2 ? 2.0 : 1.4, 0.15, lp, i === 2 ? [lp] : null);
      tone('sine', 174.61 * pf, t + 0.72, 1.6, 0.05, 0.25);
    };
    S.buy = function (t, pf) {
      noise(t, 0.03, 0.08, 0.002, { type: 'highpass', f: 3000 });
      tone('sine', 1318.5 * pf, t, 0.3, 0.13, 0.003);
      tone('sine', 1760 * pf, t + 0.075, 0.42, 0.12, 0.003);
      tone('sine', 3520 * pf, t + 0.075, 0.12, 0.02, 0.002);
    };
    S.sell = function (t, pf) {
      noise(t, 0.09, 0.09, 0.01, { f: 1800 * pf, q: 0.9 });
      tone('sine', 1760 * pf, t, 0.25, 0.09, 0.003);
      tone('sine', 1318.5 * pf, t + 0.065, 0.28, 0.09, 0.003);
      tone('sine', 987.8 * pf, t + 0.13, 0.4, 0.09, 0.003);
    };
    S.reroll = function (t, pf) {
      for (var i = 0; i < 5; i++) {
        noise(t + i * 0.045, 0.05, 0.13, 0.006, { f: (1400 + i * 250) * pf, f2: (2200 + i * 250) * pf, q: 0.9 });
      }
      tone('sine', 800 * pf, t + 0.23, 0.05, 0.05, 0.003, null, { f2: 600 * pf });
    };
    S.pack = function (t, pf) {
      var i;
      for (i = 0; i < 5; i++) {
        noise(t + i * 0.025, rnd(0.01, 0.03), rnd(0.10, 0.20), 0.002,
          { type: i % 2 ? 'highpass' : 'bandpass', f: rnd(1600, 4800) * pf, q: rnd(0.8, 2.5) });
      }
      noise(t + 0.05, 0.4, 0.09, 0.12, { f: 700 * pf, f2: 2200 * pf, q: 1 });
      var tw = [880, 1108.7, 1318.5];
      for (i = 0; i < tw.length; i++) tone('sine', tw[i] * pf, t + 0.14 + i * 0.08, 0.5, 0.09, 0.004);
    };
    S.use = function (t, pf) {
      noise(t, 0.14, 0.09, 0.02, { type: 'lowpass', f: 1400 * pf, f2: 3000 * pf, q: 0.7 });
      tone('triangle', 784 * pf, t, 0.35, 0.12, 0.006);
      tone('sine', 1174.7 * pf, t + 0.07, 0.45, 0.10, 0.006);
      tone('sine', 2349 * pf, t + 0.07, 0.15, 0.02, 0.003);
    };
    S.click = function (t, pf) {
      tone('sine', 620 * pf, t, 0.06, 0.14, 0.002, null, { f2: 380 * pf });
      noise(t, 0.02, 0.09, 0.001, { type: 'highpass', f: 3000 });
    };
    S.error = function (t, pf) {
      var lp = lpBus(520);
      tone('sine', 190 * pf, t, 0.15, 0.32, 0.005, lp, { f2: 110 * pf });
      noise(t, 0.05, 0.10, 0.004, { type: 'lowpass', f: 600, q: 0.6, to: lp });
      tone('triangle', 95 * pf, t, 0.15, 0.10, 0.005, lp, { own: [lp] });
    };
    S.moon = function (t, pf) {
      var P = [1396.9, 1760, 2093, 2793.8, 3520];
      for (var i = 0; i < P.length; i++) {
        var at = t + i * 0.09, f = P[i] * pf;
        tone('sine', f, at, 1.4, 0.05, 0.01);
        tone('sine', f * 1.004, at, 1.2, 0.04, 0.01);
      }
      tone('sine', 698.5 * pf, t, 1.7, 0.04, 0.4);
    };
    var NAMES = Object.keys(S);

    E.names = NAMES;
    E.stats = function () { return { active: stats.active, music: mus ? mus.srcs.length : 0, state: ctx.state }; };

    E.touch = function () { unlockTs = nowMs(); };

    E.play = function (name, opts) {
      var fn = S[name];
      if (!fn || muted || !ready()) return false;
      if (stats.active > MAX_ACTIVE || !throttle(name)) return false;
      var pitch = clamp(num(opts && opts.pitch, 0), -36, 36);
      var vol = clamp(num(opts && opts.volume, 1), 0, 1);
      if (vol <= 0) return false;
      V = vol * (LEVEL[name] || 1); inMusic = false;
      fn(ctx.currentTime + 0.01, Math.pow(2, pitch / 12));
      V = 1;
      return true;
    };

    E.setVolume = function (v) {
      sfxVol = clamp(num(v, 0.7), 0, 1);
      sfxBus.gain.setTargetAtTime(sfxVol, ctx.currentTime, 0.02);
    };
    E.setMusicVolume = function (v) {
      musicVol = clamp(num(v, 0.35), 0, 1);
      musicBus.gain.setTargetAtTime(musicVol * MUSIC_TRIM, ctx.currentTime, 0.05);
    };
    E.setMuted = function (b) {
      muted = !!b;
      outBus.gain.setTargetAtTime(muted ? 0 : OUT_LEVEL, ctx.currentTime, 0.02);
    };

    /* ================================================================ music */
    function padSeg(root, q, t, dur) {
      var third = q === 'm' ? 3 : 4;
      var tones = [root + 12, root + 12 + third, root + 12 + 7];
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0.3;
      lp.connect(dest());
      var hold = dur, rel = 1.0, att = Math.min(0.7, hold * 0.6), last = tones.length * 2 - 1, n = 0;
      for (var i = 0; i < tones.length; i++) {
        var f = mtof(fold(tones[i], 55, 69));
        for (var k = 0; k < 2; k++, n++) {
          var osc = ctx.createOscillator(), g = ctx.createGain(), peak = k ? 0.02 : 0.035;
          osc.type = k ? 'triangle' : 'sine';
          osc.frequency.value = f * (k ? 1.004 : 1);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(peak, t + att);
          g.gain.setValueAtTime(peak, t + hold);
          g.gain.exponentialRampToValueAtTime(0.0001, t + hold + rel);
          osc.connect(g); g.connect(lp);
          osc.start(t); osc.stop(t + hold + rel + 0.05);
          osc._t0 = t;
          reg(osc, n === last ? [g, lp] : [g]);
        }
      }
    }

    function newLoop(m, first) {
      m.beat = 60 / (66 * rnd(0.97, 1.03));
      m.rest = first ? 1 : (Math.random() < 0.4 ? 1 : 0);      // pad-only bar between loops
      m.alt = { 0: Math.random() < 0.35, 4: Math.random() < 0.35, 12: Math.random() < 0.35 };
      m.echo = Math.random() < 0.4;
      m.grace = rnd(0.1, 0.3);
    }

    function scheduleBar(m) {
      var beat = m.beat, barT = m.nextT, barDur = beat * 3, i;
      if (m.rest > 0) {
        m.rest--;
        padSeg(53, 'M', barT, barDur);
        m.nextT += barDur;
        return;
      }
      var bi = m.bar, segs = CHORDS[bi], hum = function () { return rnd(-0.01, 0.01); };
      for (i = 0; i < segs.length; i++) {
        var sg = segs[i], st = barT + sg[0] * beat, len = sg[1] * beat;
        var third = sg[3] === 'm' ? 3 : 4;
        padSeg(sg[2], sg[3], st, len);
        // soft bass note
        var bf = mtof(fold(sg[2], 43, 54));
        tone('sine', bf, st, 1.5, 0.2, 0.01);
        tone('triangle', bf * 2, st, 0.5, 0.04, 0.01);
        // music-box arpeggio on the remaining beats of the segment
        var arp = [fold(sg[2] + 12, 57, 68), fold(sg[2] + 12 + third, 57, 68), fold(sg[2] + 12 + 7, 57, 68)];
        for (var b = 1; b < sg[1]; b++) {
          if (Math.random() < 0.12) continue;
          var pick = b === 1 ? arp[2] : (Math.random() < 0.8 ? arp[1] : arp[0]);
          boxF(mtof(pick), st + b * beat + hum(), 0.9, 0.10 * rnd(0.85, 1.1));
        }
      }
      var mel = (ALT[bi] && m.alt[bi]) ? ALT[bi] : MELODY[bi];
      for (i = 0; i < mel.length; i++) {
        var n = mel[i], nt = barT + n[0] * beat + hum();
        var vel = (n[0] === 0 ? 1 : 0.88) * rnd(0.9, 1.08);
        if (n[2] >= 1 && Math.random() < m.grace) {                 // little grace note from the scale
          boxF(mtof(scaleUp(n[1])), nt - 0.07, 0.5, 0.34 * vel * 0.35);
        }
        boxF(mtof(n[1]), nt, 0.9 + n[2] * 0.35, 0.34 * vel);
        if (bi === 15 && i === mel.length - 1 && m.echo) {          // twinkling echo of the last note
          boxF(mtof(n[1] + 12), nt + beat * 1.5, 1.6, 0.09);
        }
      }
      m.nextT += barDur;
      m.bar++;
      if (m.bar >= 16) { m.bar = 0; m.loop++; newLoop(m, false); }
    }

    function scheduleUntil(m, horizon) {
      inMusic = true; sess = m; V = 1;
      try {
        while (m.nextT < horizon) scheduleBar(m);
      } finally {
        inMusic = false; sess = null;
      }
    }

    E.startMusic = function () {
      if (mus) return;
      var now = ctx.currentTime;
      var bus = ctx.createGain();
      bus.gain.setValueAtTime(0.0001, now);
      bus.gain.setTargetAtTime(1, now, 0.4);
      bus.connect(musicBus);
      var m = mus = { bus: bus, srcs: [], bar: 0, loop: 0, nextT: now + 0.25, timer: 0, beat: 0.909, rest: 0, alt: {}, echo: false, grace: 0.2 };
      newLoop(m, true);
      var tick = function () {
        if (mus !== m) return;
        try { scheduleUntil(m, ctx.currentTime + LOOKAHEAD); } catch (e) {}
      };
      tick();
      if (!offline && typeof root.setInterval === 'function') m.timer = root.setInterval(tick, TICK_MS);
    };

    E.stopMusic = function () {
      if (!mus) return;
      var m = mus; mus = null;
      if (m.timer) root.clearInterval(m.timer);
      var now = ctx.currentTime;
      try {
        m.bus.gain.cancelScheduledValues(now);
        m.bus.gain.setTargetAtTime(0.0001, now, 0.08);
      } catch (e) {}
      var srcs = m.srcs.slice();
      for (var i = 0; i < srcs.length; i++) {
        // notes still waiting in the queue are cancelled outright; sounding ones ride the fade-out
        try { srcs[i].stop((srcs[i]._t0 || 0) > now ? now : now + 0.6); } catch (e2) {}
      }
      var free = function () { try { m.bus.disconnect(); } catch (e3) {} };
      if (offline) free(); else root.setTimeout(free, 900);
    };

    E.isMusicRunning = function () { return !!mus; };

    /* test hook: schedule `seconds` of music onto an offline context */
    E._music = function (seconds) {
      if (!mus) E.startMusic();
      scheduleUntil(mus, seconds);
    };

    return E;
  }

  /* ---------------------------------------------------------------- public facade */
  var A = MA.audio = {};
  var AC = root.AudioContext || root.webkitAudioContext;
  var ctx = null, engine = null, failed = false;
  var st = { volume: 0.7, musicVol: 0.35, muted: false, music: false };

  function eng(fn) { try { if (engine) fn(engine); } catch (e) {} }

  A.unlock = function () {
    try {
      if (!AC || failed) return false;
      if (!ctx) {
        ctx = new AC();
        engine = createEngine(ctx, false);
        engine.setVolume(st.volume);
        engine.setMusicVolume(st.musicVol);
        engine.setMuted(st.muted);
      }
      engine.touch();
      if (ctx.state !== 'running') swallow(ctx.resume());
      if (st.music) engine.startMusic();
      return true;
    } catch (e) {
      failed = true; ctx = null; engine = null;
      return false;
    }
  };

  A.isUnlocked = function () { return !!(ctx && ctx.state === 'running'); };

  A.play = function (name, opts) {
    try { return engine ? engine.play(name, opts) : false; } catch (e) { return false; }
  };

  A.setMuted = function (b) { st.muted = !!b; eng(function (e) { e.setMuted(st.muted); }); };
  A.isMuted = function () { return st.muted; };
  A.setVolume = function (v) { st.volume = clamp(num(v, 0.7), 0, 1); eng(function (e) { e.setVolume(st.volume); }); };
  A.getVolume = function () { return st.volume; };
  A.setMusicVolume = function (v) { st.musicVol = clamp(num(v, 0.35), 0, 1); eng(function (e) { e.setMusicVolume(st.musicVol); }); };
  A.getMusicVolume = function () { return st.musicVol; };

  A.music = function (on) {
    st.music = !!on;
    eng(function (e) { if (st.music) e.startMusic(); else e.stopMusic(); });
  };
  A.isMusicOn = function () { return st.music; };

  A.list = function () {
    return ['select', 'deselect', 'deal', 'send', 'crumple', 'ink', 'glow', 'xglow', 'stamp', 'say', 'retrigger',
      'total', 'plane', 'window', 'win', 'lose', 'buy', 'sell', 'reroll', 'pack', 'use', 'click', 'error', 'moon'];
  };

  /* diagnostics / tests */
  A._stats = function () { return engine ? engine.stats() : { active: 0, music: 0, state: 'none' }; };
  A._engine = function (offlineCtx) { return createEngine(offlineCtx, true); };

  /* Fallback auto-unlock: any user gesture unlocks (or re-resumes) the context, so a UI that
     forgets to call unlock() still works. Cheap: returns immediately once running. */
  try {
    var doc = root.document;
    if (doc && typeof doc.addEventListener === 'function' && AC) {
      var gesture = function () { if (!ctx || ctx.state !== 'running') A.unlock(); };
      ['pointerdown', 'pointerup', 'keydown', 'touchend', 'click'].forEach(function (ev) {
        doc.addEventListener(ev, gesture, { capture: true, passive: true });
      });
      // Don't play lullabies to a hidden tab; pick up again when it returns.
      doc.addEventListener('visibilitychange', function () {
        try {
          if (!ctx) return;
          if (doc.hidden) swallow(ctx.suspend());
          else swallow(ctx.resume());
        } catch (e) {}
      });
    }
  } catch (e) {}
})(typeof window !== 'undefined' ? window : globalThis);
