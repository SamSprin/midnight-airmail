/* Midnight Airmail — global namespace + shared utilities.
   Loaded first. Every other script attaches to window.MA at load time and only
   calls into other modules at run time. */
(function (root) {
  'use strict';
  var MA = root.MA = root.MA || {};
  MA.content = MA.content || {};
  MA.ui = MA.ui || {};

  var util = MA.util = {};

  /* ---- seeded RNG (mulberry32). State lives in state.rng.s so runs serialize. ---- */
  util.seedFrom = function (seed) {
    if (typeof seed === 'string') {
      var h = 2166136261 >>> 0;
      for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      return h >>> 0;
    }
    if (typeof seed !== 'number' || !isFinite(seed)) seed = Math.floor(Math.random() * 4294967296);
    return (seed >>> 0);
  };

  util.rand = function (state) {
    var s = (state.rng.s + 0x6D2B79F5) >>> 0;
    state.rng.s = s;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  util.randInt = function (state, lo, hi) { return lo + Math.floor(util.rand(state) * (hi - lo + 1)); };
  util.pick = function (state, arr) { return arr.length ? arr[Math.floor(util.rand(state) * arr.length)] : undefined; };
  util.shuffle = function (state, arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(util.rand(state) * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  };
  util.chance = function (state, num, den) { return util.rand(state) < num / den; };
  util.uid = function (state, prefix) {
    state.nextUid = (state.nextUid || 0) + 1;
    return (prefix || 'u') + state.nextUid;
  };

  /* Stateless deterministic hash → [0,1) stream, for art seeded by ids. */
  util.hashRng = function (key) {
    var s = util.seedFrom(String(key));
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ---- misc ---- */
  util.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  util.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };

  util.format = function (n) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    if (Math.abs(n) >= 1e11) return n.toExponential(2).replace('+', '');
    if (!Number.isInteger(n)) {
      var r = Math.round(n * 100) / 100;
      return r.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
    return n.toLocaleString('en-US');
  };

  util.escape = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* '{glow|+4 Glow} when {star|Stars} score' → HTML with .t-* spans. */
  util.markup = function (text) {
    return util.escape(text || '').replace(/\{(ink|glow|xglow|stamp|star|moon|bloom|leaf|hand)\|([^}]*)\}/g,
      function (_, kind, inner) { return '<span class="t-' + kind + '">' + inner + '</span>'; });
  };
  /* Same markup stripped to plain text (tests, aria labels). */
  util.plain = function (text) {
    return String(text || '').replace(/\{(?:ink|glow|xglow|stamp|star|moon|bloom|leaf|hand)\|([^}]*)\}/g, '$1');
  };
})(typeof window !== 'undefined' ? window : globalThis);
