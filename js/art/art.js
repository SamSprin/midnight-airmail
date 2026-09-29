/* Midnight Airmail — MA.art
   Procedural paper-collage art. Every function returns an SVG *string* and is deterministic per input.
   No element ids are defined inside returned strings (only shared defs from MA.art.defs() are referenced),
   so any number of instances can live in one document. */
(function (root) {
  'use strict';
  var MA = root.MA = root.MA || {};
  var art = MA.art = MA.art || {};

  /* ------------------------------------------------------------------ palette */
  var C = {
    sky1: '#1B1E5B', sky2: '#222A70', sky3: '#2A3584', sky4: '#33409A',
    wall: '#3E2F74', wallLine: '#57489E', roof: '#1A1F4F',
    paper: '#F3EAD3', rim: '#FFFDF6', window: '#F6C445', curtain: '#EE9294',
    sun: '#E8795A', ink: '#2F5BD3', sweater: '#1F9C8C', vine: '#3E8E4E', leaf: '#6CBF5E',
    sill: '#D8A76B', star: '#F5CD55', text: '#2A2250', black: '#15122C', blush: '#F29AAE',
    skin: '#E2A583', pot: '#B9773F'
  };
  var SUIT = {
    star:  { color: '#E0A91F', dark: '#8F5F00', pale: '#F6DE94', name: 'Stars' },
    moon:  { color: '#3A47A8', dark: '#2F3B96', pale: '#A9B0E6', name: 'Moons' },
    bloom: { color: '#E0604B', dark: '#C4432D', pale: '#F5B7A9', name: 'Blooms' },
    leaf:  { color: '#2F8F5E', dark: '#23744B', pale: '#A9DDBE', name: 'Leaves' }
  };
  var FONT = "Gaegu,Mali,'Comic Sans MS',cursive";
  var RANKS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

  /* ------------------------------------------------------------------ small helpers */
  function rngFor(key) {
    if (MA.util && MA.util.hashRng) return MA.util.hashRng(key);
    var s = 2166136261 >>> 0; key = String(key);
    for (var i = 0; i < key.length; i++) { s ^= key.charCodeAt(i); s = Math.imul(s, 16777619) >>> 0; }
    return function () {
      s = (s + 0x6D2B79F5) >>> 0; var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function f(n) { return Math.round(n * 10) / 10; }
  function f2(n) { return Math.round(n * 100) / 100; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pts(arr) { return arr.map(function (p) { return f(p[0]) + ' ' + f(p[1]); }).join('L'); }
  function polyD(arr) { return 'M' + pts(arr) + 'Z'; }
  function attrs(o) {
    var s = '';
    if (!o) return s;
    if (o.opacity != null) s += ' opacity="' + o.opacity + '"';
    if (o.cls) s += ' class="' + o.cls + '"';
    if (o.style) s += ' style="' + o.style + '"';
    if (o.tr) s += ' transform="' + o.tr + '"';
    if (o.extra) s += ' ' + o.extra;
    return s;
  }
  function rimAttr(o) {
    if (o && o.rim === false) return '';
    return ' stroke="' + ((o && o.rimColor) || C.rim) + '" stroke-width="' + ((o && o.rw) || 1.2) + '" stroke-linejoin="round" paint-order="stroke"';
  }
  /* cut-paper piece: path with a thin white rim */
  function P(d, fill, o) { return '<path d="' + d + '" fill="' + fill + '"' + rimAttr(o) + attrs(o) + '/>'; }
  function rect(x, y, w, h, fill, o) {
    var r = o && o.r ? ' rx="' + o.r + '"' : '';
    return '<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '"' + r + ' fill="' + fill + '"' + rimAttr(o) + attrs(o) + '/>';
  }
  function circ(cx, cy, r, fill, o) { return '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r) + '" fill="' + fill + '"' + rimAttr(o) + attrs(o) + '/>'; }
  function ell(cx, cy, rx, ry, fill, o) { return '<ellipse cx="' + f(cx) + '" cy="' + f(cy) + '" rx="' + f(rx) + '" ry="' + f(ry) + '" fill="' + fill + '"' + rimAttr(o) + attrs(o) + '/>'; }
  function line(x1, y1, x2, y2, stroke, w, o) {
    return '<path d="M' + f(x1) + ' ' + f(y1) + 'L' + f(x2) + ' ' + f(y2) + '" fill="none" stroke="' + stroke + '" stroke-width="' + (w || 1) + '" stroke-linecap="round"' + attrs(o) + '/>';
  }
  function stroke(d, stroke, w, o) {
    return '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + (w || 1) + '" stroke-linecap="round" stroke-linejoin="round"' + attrs(o) + '/>';
  }
  function G(inner, tx, ty, rot, sc, o) {
    var t = 'translate(' + f(tx || 0) + ' ' + f(ty || 0) + ')';
    if (rot) t += ' rotate(' + f(rot) + ')';
    if (sc && sc !== 1) t += ' scale(' + f2(sc) + ')';
    return '<g transform="' + t + '"' + attrs(o) + '>' + inner + '</g>';
  }
  function text(x, y, str, size, fill, o) {
    o = o || {};
    return '<text x="' + f(x) + '" y="' + f(y) + '" font-family="' + FONT + '" font-weight="700" font-size="' + size + '" fill="' + fill + '" text-anchor="' + (o.anchor || 'middle') + '"' + (o.extra ? ' ' + o.extra : '') + '>' + esc(str) + '</text>';
  }

  /* ------------------------------------------------------------------ torn paper */
  var tornCache = {};
  /* Torn rectangle 0..w × 0..h: jittered polygon; edges bite inward by 0..~2*roughness. */
  function tornPath(w, h, seed, roughness) {
    roughness = roughness == null ? 3 : roughness;
    var key = f(w) + 'x' + f(h) + '|' + seed + '|' + roughness;
    if (tornCache[key]) return tornCache[key];
    var r = rngFor('torn|' + key), step = Math.max(3, Math.min(7, roughness * 1.8 + 2)), p = [];
    function edge(ax, ay, bx, by, nx, ny) {
      var len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)), n = Math.max(2, Math.round(len / step));
      var ph = r() * 6.28, fr = 1.5 + r() * 3;
      for (var i = 0; i < n; i++) {
        var t = i / n;
        var o = roughness * (0.6 + 0.35 * Math.sin(t * fr * 6.28 + ph)) + (r() - 0.5) * roughness * 1.4;
        if (r() < 0.07) o += roughness * (0.6 + r());
        if (o < 0) o = 0;
        p.push([ax + (bx - ax) * t + nx * o, ay + (by - ay) * t + ny * o]);
      }
    }
    edge(0, 0, w, 0, 0, 1); edge(w, 0, w, h, -1, 0); edge(w, h, 0, h, 0, -1); edge(0, h, 0, 0, 1, 0);
    var d = polyD(p);
    tornCache[key] = d;
    return d;
  }
  /* Torn round blob (radius r) for emblems, seals, patches */
  function blobD(cx, cy, rad, seed, rough, n) {
    var r = rngFor('blob|' + seed), p = [], k = n || 28, ph = r() * 6.28;
    for (var i = 0; i < k; i++) {
      var a = i / k * 6.28318, rr = rad * (1 + (rough || 0.05) * (Math.sin(a * 3 + ph) * 0.6 + (r() - 0.5) * 1.4));
      p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    return polyD(p);
  }
  /* capsule/ray with a little jitter (sun rays) */
  function rayD(len, wid, seed) {
    var r = rngFor('ray|' + seed), p = [], n = 10, hw = wid / 2;
    for (var i = 0; i <= n; i++) { var y = i / n * (len - wid) ; p.push([hw + (r() - 0.5) * 0.9, y + hw + (r() - .5) * 0.8]); }
    return p;
  }

  /* ------------------------------------------------------------------ unit paths for suit cut-outs */
  function starUnit(irr) {
    var p = [], r = rngFor('unitstar'), i;
    for (i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = (i % 2 ? 0.46 : 1) * (1 + (irr ? (r() - 0.5) * 0.06 : 0));
      p.push([Math.cos(a) * rr, Math.sin(a) * rr + 0.06]);
    }
    return 'M' + p.map(function (q) { return f2(q[0]) + ' ' + f2(q[1]); }).join('L') + 'Z';
  }
  var STAR_D = starUnit(true);
  var MOON_D = (function () {
    var R = 1, r2 = 0.8, dx = 0.46, dy = -0.1;
    // intersection of circle(0,0,R) and circle(dx,dy,r2)
    var d = Math.sqrt(dx * dx + dy * dy), a = (R * R - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(R * R - a * a);
    var mx = a * dx / d, my = a * dy / d;
    var p1 = [mx + h * dy / d, my - h * dx / d], p2 = [mx - h * dy / d, my + h * dx / d];
    if (p1[1] > p2[1]) { var t = p1; p1 = p2; p2 = t; } // p1 = top
    var large = ((p1[0] + p2[0]) / 2 > dx) ? 1 : 0;
    return 'M' + f2(p1[0]) + ' ' + f2(p1[1]) + 'A1 1 0 1 0 ' + f2(p2[0]) + ' ' + f2(p2[1]) + 'A' + r2 + ' ' + r2 + ' 0 ' + large + ' 1 ' + f2(p1[0]) + ' ' + f2(p1[1]) + 'Z';
  })();
  var BLOOM_D = (function () {
    var p = [], n = 60;
    for (var i = 0; i < n; i++) {
      var a = i / n * 6.28318 - 1.5708, rr = 0.66 + 0.34 * Math.cos(5 * (a + 1.5708));
      p.push([Math.cos(a) * rr * 1.02, Math.sin(a) * rr * 1.02]);
    }
    return 'M' + p.map(function (q) { return f2(q[0]) + ' ' + f2(q[1]); }).join('L') + 'Z';
  })();
  var LEAF_D = 'M0 -1C0.95 -0.55 0.85 0.55 0 1C-0.85 0.55 -0.95 -0.55 0 -1Z';

  /* A suit cut-out centred at cx,cy with radius R (rot degrees). */
  function suitCut(suit, cx, cy, R, o) {
    o = o || {};
    var S = SUIT[suit] || SUIT.star, col = o.fill || S.color, rw = (o.rw || 1.2) / R, rot = o.rot || 0;
    var rim = o.rim === false ? '' : ' stroke="' + (o.rimColor || C.rim) + '" stroke-width="' + f2(rw) + '" stroke-linejoin="round" paint-order="stroke"';
    var inner = '';
    if (suit === 'star') inner = '<path d="' + STAR_D + '" fill="' + col + '"' + rim + '/><circle cx="0" cy="0.08" r="0.22" fill="' + (o.fill ? '#fff' : '#F5CD55') + '" opacity=".55"/>';
    else if (suit === 'moon') inner = '<path d="' + MOON_D + '" fill="' + col + '"' + rim + ' transform="rotate(-18) translate(-0.12 0)"/>';
    else if (suit === 'bloom') inner = '<path d="' + BLOOM_D + '" fill="' + col + '"' + rim + '/><circle r="0.24" fill="#F5CD55" stroke="#E9A93B" stroke-width="' + f2(rw * 0.5) + '"/>';
    else inner = '<path d="' + LEAF_D + '" fill="' + col + '"' + rim + ' transform="rotate(28) scale(0.78 1)"/><path d="M-0.16 0.8Q0 0.2 0.32 -0.68" fill="none" stroke="' + (o.fill ? '#fff' : '#9AD98B') + '" stroke-width="' + f2(rw * 1.1) + '" stroke-linecap="round" opacity=".85"/>';
    return '<g transform="translate(' + f(cx) + ' ' + f(cy) + ') rotate(' + f(rot) + ') scale(' + f2(R) + ')"' + (o.opacity != null ? ' opacity="' + o.opacity + '"' : '') + '>' + inner + '</g>';
  }
  function star5(cx, cy, R, fill, rot, o) {
    o = o || {}; var rw = (o.rw || 1) / R;
    return '<g transform="translate(' + f(cx) + ' ' + f(cy) + ') rotate(' + f(rot || 0) + ') scale(' + f2(R) + ')"' + (o.opacity != null ? ' opacity="' + o.opacity + '"' : '') + (o.cls ? ' class="' + o.cls + '"' : '') + (o.style ? ' style="' + o.style + '"' : '') + '><path d="' + STAR_D + '" fill="' + fill + '"' + (o.rim === false ? '' : ' stroke="' + C.rim + '" stroke-width="' + f2(rw) + '" stroke-linejoin="round" paint-order="stroke"') + '/></g>';
  }
  function sparkle(cx, cy, r, col, o) {
    o = o || {};
    return '<path d="M' + f(cx - r) + ' ' + f(cy) + 'H' + f(cx + r) + 'M' + f(cx) + ' ' + f(cy - r) + 'V' + f(cy + r) + '" stroke="' + col + '" stroke-width="' + (o.w || 1) + '" stroke-linecap="round" fill="none"' + attrs(o) + '/>';
  }
  function glint(cx, cy, r, col, o) { // 4-point star sparkle (filled)
    var k = r * 0.22;
    return '<path d="M' + f(cx) + ' ' + f(cy - r) + 'Q' + f(cx + k) + ' ' + f(cy - k) + ' ' + f(cx + r) + ' ' + f(cy) + 'Q' + f(cx + k) + ' ' + f(cy + k) + ' ' + f(cx) + ' ' + f(cy + r) + 'Q' + f(cx - k) + ' ' + f(cy + k) + ' ' + f(cx - r) + ' ' + f(cy) + 'Q' + f(cx - k) + ' ' + f(cy - k) + ' ' + f(cx) + ' ' + f(cy - r) + 'Z" fill="' + col + '"' + attrs(o) + '/>';
  }
  /* short yellow "shine" dashes radiating from a centre */
  function dashes(cx, cy, r1, r2, n, col, w, start, o) {
    var d = '';
    for (var i = 0; i < n; i++) {
      var a = (start || 0) + i / n * 6.28318, c = Math.cos(a), s = Math.sin(a);
      d += 'M' + f(cx + c * r1) + ' ' + f(cy + s * r1) + 'L' + f(cx + c * r2) + ' ' + f(cy + s * r2);
    }
    return '<path d="' + d + '" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round" fill="none"' + attrs(o) + '/>';
  }
  /* cute face: dot eyes with highlight, blush, smile. mood: idle|happy|wow|sleepy|grumpy|sad */
  function face(cx, cy, s, mood, o) {
    o = o || {}; mood = mood || 'idle';
    var ink = C.black, g = '', ex = s * 0.32, ey = cy - s * 0.04, er = s * 0.095;
    if (mood === 'happy') {
      g += stroke('M' + f(cx - ex - er * 1.3) + ' ' + f(ey + er * 0.7) + 'Q' + f(cx - ex) + ' ' + f(ey - er * 1.5) + ' ' + f(cx - ex + er * 1.3) + ' ' + f(ey + er * 0.7), ink, s * 0.07);
      g += stroke('M' + f(cx + ex - er * 1.3) + ' ' + f(ey + er * 0.7) + 'Q' + f(cx + ex) + ' ' + f(ey - er * 1.5) + ' ' + f(cx + ex + er * 1.3) + ' ' + f(ey + er * 0.7), ink, s * 0.07);
    } else if (mood === 'sleepy') {
      g += stroke('M' + f(cx - ex - er * 1.3) + ' ' + f(ey) + 'Q' + f(cx - ex) + ' ' + f(ey + er * 1.7) + ' ' + f(cx - ex + er * 1.3) + ' ' + f(ey), ink, s * 0.06);
      g += stroke('M' + f(cx + ex - er * 1.3) + ' ' + f(ey) + 'Q' + f(cx + ex) + ' ' + f(ey + er * 1.7) + ' ' + f(cx + ex + er * 1.3) + ' ' + f(ey), ink, s * 0.06);
    } else {
      var rr = mood === 'wow' ? er * 1.25 : er;
      g += circ(cx - ex, ey, rr, ink, { rim: false }) + circ(cx + ex, ey, rr, ink, { rim: false });
      g += circ(cx - ex + rr * 0.35, ey - rr * 0.35, rr * 0.38, '#fff', { rim: false }) + circ(cx + ex + rr * 0.35, ey - rr * 0.35, rr * 0.38, '#fff', { rim: false });
      if (mood === 'grumpy') {
        g += stroke('M' + f(cx - ex - er * 1.4) + ' ' + f(ey - er * 2.4) + 'L' + f(cx - ex + er * 1.4) + ' ' + f(ey - er * 1.5), ink, s * 0.06);
        g += stroke('M' + f(cx + ex + er * 1.4) + ' ' + f(ey - er * 2.4) + 'L' + f(cx + ex - er * 1.4) + ' ' + f(ey - er * 1.5), ink, s * 0.06);
      }
    }
    if (!o.noBlush) {
      g += circ(cx - s * 0.56, cy + s * 0.2, s * 0.17, C.blush, { rim: false, opacity: 0.8 }) + circ(cx + s * 0.56, cy + s * 0.2, s * 0.17, C.blush, { rim: false, opacity: 0.8 });
    }
    var my = cy + s * 0.22;
    if (mood === 'wow') g += ell(cx, my + s * 0.08, s * 0.08, s * 0.1, ink, { rim: false });
    else if (mood === 'happy') g += '<path d="M' + f(cx - s * 0.2) + ' ' + f(my - s * 0.02) + 'Q' + f(cx) + ' ' + f(my + s * 0.36) + ' ' + f(cx + s * 0.2) + ' ' + f(my - s * 0.02) + 'Z" fill="' + ink + '"/>';
    else if (mood === 'grumpy' || mood === 'sad') g += stroke('M' + f(cx - s * 0.16) + ' ' + f(my + s * 0.12) + 'Q' + f(cx) + ' ' + f(my - s * 0.06) + ' ' + f(cx + s * 0.16) + ' ' + f(my + s * 0.12), ink, s * 0.06);
    else g += stroke('M' + f(cx - s * 0.17) + ' ' + f(my) + 'Q' + f(cx) + ' ' + f(my + s * 0.2) + ' ' + f(cx + s * 0.17) + ' ' + f(my), ink, s * 0.06);
    return g;
  }
  /* black cat silhouette sitting, base at (cx, by), height h. */
  function cat(cx, by, h, o) {
    o = o || {};
    var s = h, rw = (o.rw == null ? 1.1 : o.rw) / s, col = o.fill || C.black;
    var rim = o.rim === false ? '' : ' stroke="' + C.rim + '" stroke-width="' + f2(rw) + '" stroke-linejoin="round" paint-order="stroke"';
    var g = '';
    g += '<path class="' + (o.tailCls || '') + '" d="M0.24 -0.05C0.62 -0.02 0.62 -0.42 0.44 -0.5" fill="none" stroke="' + col + '" stroke-width="0.075" stroke-linecap="round"' + (o.tailStyle ? ' style="' + o.tailStyle + '"' : '') + '/>';
    g += '<path d="M-0.27 0C-0.32 -0.34 -0.2 -0.56 0 -0.56C0.2 -0.56 0.32 -0.34 0.27 0Z" fill="' + col + '"' + rim + '/>';
    g += '<path d="M-0.2 -0.72L-0.2 -0.99L-0.05 -0.88Q0 -0.9 0.05 -0.88L0.2 -0.99L0.2 -0.72Q0.2 -0.5 0 -0.5Q-0.2 -0.5 -0.2 -0.72Z" fill="' + col + '"' + rim + '/>';
    if (o.eyes !== false) g += '<circle cx="-0.078" cy="-0.72" r="0.034" fill="' + C.window + '"/><circle cx="0.078" cy="-0.72" r="0.034" fill="' + C.window + '"/>';
    if (o.bow) g += '<path d="M-0.09 -0.5L0 -0.46L0.09 -0.5L0.09 -0.42L0 -0.46L-0.09 -0.42Z" fill="' + o.bow + '"/><circle cx="0" cy="-0.46" r="0.03" fill="' + o.bow + '"/>';
    return '<g transform="translate(' + f(cx) + ' ' + f(by) + ') scale(' + f2(s) + ')">' + g + '</g>';
  }
  /* scalloped (postage-stamp) rectangle path */
  function scallopD(x, y, w, h, step, rad) {
    var nx = Math.max(2, Math.round(w / step)), ny = Math.max(2, Math.round(h / step)), sx = w / nx, sy = h / ny, d = 'M' + f(x) + ' ' + f(y), i;
    for (i = 0; i < nx; i++) d += 'h' + f(sx / 2 - rad) + 'a' + rad + ' ' + rad + ' 0 0 0 ' + f(rad * 2) + ' 0h' + f(sx / 2 - rad);
    for (i = 0; i < ny; i++) d += 'v' + f(sy / 2 - rad) + 'a' + rad + ' ' + rad + ' 0 0 0 0 ' + f(rad * 2) + 'v' + f(sy / 2 - rad);
    for (i = 0; i < nx; i++) d += 'h' + f(-sx / 2 + rad) + 'a' + rad + ' ' + rad + ' 0 0 0 ' + f(-rad * 2) + ' 0h' + f(-sx / 2 + rad);
    for (i = 0; i < ny; i++) d += 'v' + f(-sy / 2 + rad) + 'a' + rad + ' ' + rad + ' 0 0 0 0 ' + f(-rad * 2) + 'v' + f(-sy / 2 + rad);
    return d + 'Z';
  }
  /* washi/label tape with serrated ends */
  function tapeD(x0, y0, x1, y1) {
    var d = 'M' + f(x0) + ' ' + f(y0) + 'H' + f(x1), n = Math.max(2, Math.round((y1 - y0) / 3)), i, sy = (y1 - y0) / n;
    for (i = 0; i < n; i++) d += 'l' + (i % 2 ? '-1.6 ' : '1.4 ') + f(sy);
    d += 'H' + f(x0);
    for (i = 0; i < n; i++) d += 'l' + (i % 2 ? '1.6 ' : '-1.4 ') + f(-sy);
    return d + 'Z';
  }
  var TAPE = { common: '#48C2AF', uncommon: '#F29AA8', rare: '#F2C64B', paper: '#F3EAD3', gold: '#F2C64B', teal: '#48C2AF', pink: '#F29AA8' };
  function label(name, col, y0, seed, o) {
    o = o || {};
    var len = name.length, two = len > 15, y1 = y0 + (two ? 22 : 16), x0 = 9, x1 = 91, g = '', cy;
    g += '<path d="' + tapeD(x0 + 1, y0 + 1.6, x1 + 1, y1 + 1.6) + '" fill="#120C30" opacity=".28"/>';
    g += '<path d="' + tapeD(x0, y0, x1, y1) + '" fill="' + col + '" stroke="#FFFDF6" stroke-opacity=".55" stroke-width=".8" filter="url(#ma-grain)"/>';
    if (two) {
      var mid = Math.floor(len / 2), best = -1, i;
      for (i = 0; i < len; i++) if (name[i] === ' ' || name[i] === '-') { if (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)) best = i; }
      var a = name.slice(0, best + (name[best] === '-' ? 1 : 0)), b = name.slice(best + 1);
      var sz = Math.min(9.6, 76 / (Math.max(a.length, b.length) * 0.46));
      g += text(50, y0 + 9, a, f(sz), C.text) + text(50, y0 + 18.4, b, f(sz), C.text);
    } else {
      var sz1 = Math.min(12.5, (o.star ? 60 : 78) / (len * 0.46));
      g += text(o.star ? 57 : 50, y0 + 12.2, name, f(sz1), C.text);
    }
    if (o.star) g += star5(x0 + 6.5, (y0 + y1) / 2, 4.6, '#E8A317', 0, { rw: 0.7 });
    return '<g transform="rotate(' + (o.rot == null ? -1 : o.rot) + ' 50 ' + f((y0 + y1) / 2) + ')">' + g + '</g>';
  }

  /* ------------------------------------------------------------------ baked crayon grain
     Live feTurbulence filters are expensive to re-raster (every animated card / the scene would re-run them),
     so the grain is baked ONCE into small PNG tiles via canvas and used as pattern fills. If canvas is not
     available (node tests) the old filters are kept as the fallback. */
  var NOISE;
  function noiseTiles() {
    if (NOISE !== undefined) return NOISE;
    NOISE = null;
    try {
      if (typeof document === 'undefined') return NOISE;
      var mk = function (seed, dark) {
        var c = document.createElement('canvas'); c.width = c.height = 64;
        var g = c.getContext('2d'), img = g.createImageData(64, 64), r = rngFor(seed), y, x, rb = r(), prev = r();
        for (y = 0; y < 64; y++) {
          rb = rb * 0.72 + r() * 0.28;
          for (x = 0; x < 64; x++) {
            prev = prev * 0.66 + r() * 0.34;                // correlated along x = horizontal crayon streaks
            var v = prev * 0.62 + r() * 0.2 + rb * 0.18, a = dark ? Math.max(0, (0.5 - v) * 0.62) : Math.max(0, (v - 0.52) * 0.55), i = (y * 64 + x) * 4;
            if (a > 0.17) a = 0.17;
            img.data[i] = dark ? 38 : 255; img.data[i + 1] = dark ? 28 : 249; img.data[i + 2] = dark ? 70 : 232; img.data[i + 3] = Math.round(a * 255);
          }
        }
        g.putImageData(img, 0, 0);
        return c.toDataURL('image/png');
      };
      NOISE = { d: mk('grain-dark', true), l: mk('grain-light', false) };
    } catch (e) { NOISE = null; }
    return NOISE;
  }
  /* Replace every `filter="url(#ma-grain[-l])"` path with the un-filtered path + a pattern-filled overlay copy. */
  function bake(str) {
    if (!noiseTiles()) return str;
    return str.replace(/<path ([^>]*?) filter="url\(#(ma-grain(?:-l)?)\)"\/>/g, function (m, at, id) {
      var over = at.replace(/ ?fill="[^"]*"/, ' fill="url(#' + (id === 'ma-grain' ? 'ma-gp-d' : 'ma-gp-l') + ')"').replace(/ ?stroke[a-z-]*="[^"]*"/g, '').replace(/ ?paint-order="[^"]*"/, '');
      return '<path ' + at + '/><path ' + over + '/>';
    });
  }

  /* ------------------------------------------------------------------ svg wrapper */
  function wrap(inner, o, cls, vb) {
    o = o || {};
    var w = o.w != null ? o.w : '100%', h = o.h != null ? o.h : '100%';
    return '<svg class="ma-svg ' + (cls || '') + '" xmlns="http://www.w3.org/2000/svg" viewBox="' + (vb || '0 0 100 140') + '" width="' + w + '" height="' + h + '" style="overflow:visible" aria-hidden="true" focusable="false">' + bake(inner) + '</svg>';
  }
  /* base torn card: shadow, white rim, grainy paper. returns string; paperD exposed for overlays */
  function cardBase(seed, fill, o) {
    o = o || {};
    var rimD = tornPath(96, 136, seed + 'r', 2.2), papD = tornPath(93, 133, seed + 'p', 1.8);
    return '<path d="' + rimD + '" transform="translate(3.6 3.9)" fill="#120C30" fill-opacity=".4"/>' +
      '<path d="' + rimD + '" transform="translate(1 1)" fill="' + C.rim + '"/>' +
      '<path d="' + papD + '" transform="translate(2.6 2.6)" fill="' + fill + '" filter="url(#' + (o.dark ? 'ma-grain-l' : 'ma-grain') + ')"/>';
  }
  function paperD(seed) { return tornPath(93, 133, seed + 'p', 1.8); }

  /* ------------------------------------------------------------------ shared defs */
  art.defs = function () {
    var s = '<defs>';
    // paper grain: fine speckle + faint horizontal marker streaks, darkening the source alpha
    s += '<filter id="ma-grain" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n"/>' +
      '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.16  0 0 0 0 0.12  0 0 0 0 0.28  0 0 0 -0.55 0.34" result="d"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.015 0.7" numOctaves="2" seed="9" result="s"/>' +
      '<feColorMatrix in="s" type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.15  0 0 0 0 0.3  0 0 0 -0.4 0.22" result="s2"/>' +
      '<feComposite in="d" in2="SourceAlpha" operator="in" result="d2"/>' +
      '<feComposite in="s2" in2="SourceAlpha" operator="in" result="s3"/>' +
      '<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="d2"/><feMergeNode in="s3"/></feMerge></filter>';
    s += '<filter id="ma-grain-l" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="n"/>' +
      '<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.95  0 0 0 -0.7 0.4" result="d"/>' +
      '<feComposite in="d" in2="SourceAlpha" operator="in" result="d2"/>' +
      '<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="d2"/></feMerge></filter>';
    var nz = noiseTiles();
    if (nz) {
      s += '<pattern id="ma-gp-d" width="64" height="64" patternUnits="userSpaceOnUse"><image href="' + nz.d + '" width="64" height="64"/></pattern>';
      s += '<pattern id="ma-gp-l" width="64" height="64" patternUnits="userSpaceOnUse"><image href="' + nz.l + '" width="64" height="64"/></pattern>';
    }
    // graph paper (faint blue grid)
    s += '<pattern id="ma-graph" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M6 0H0V6" fill="none" stroke="#4F86D6" stroke-width=".55" opacity=".9"/></pattern>';
    s += '<pattern id="ma-graph-l" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="#7FA1D8" stroke-width=".4" opacity=".7"/></pattern>';
    // airmail diagonal stripes
    s += '<pattern id="ma-airmail" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="10" height="10" fill="#F3EAD3"/><rect width="4" height="10" fill="#D9473F"/><rect x="5" width="4" height="10" fill="#2F5BD3"/></pattern>';
    // facade textures for the town (handwriting / sheet music / map)
    s += '<pattern id="ma-tex-hand" width="26" height="12" patternUnits="userSpaceOnUse"><path d="M2 8q2-5 4 0t4 0t4 0M15 5q2-3 4 0t4 0" fill="none" stroke="#6E78C8" stroke-width=".7" stroke-linecap="round" opacity=".55"/></pattern>';
    s += '<pattern id="ma-tex-music" width="30" height="20" patternUnits="userSpaceOnUse"><path d="M0 4h30M0 7h30M0 10h30M0 13h30M0 16h30" stroke="#7783C9" stroke-width=".4" opacity=".5"/><circle cx="7" cy="12" r="1.5" fill="#8A95D6" opacity=".7"/><circle cx="17" cy="9" r="1.5" fill="#8A95D6" opacity=".7"/><path d="M8.4 12V4M18.4 9V2" stroke="#8A95D6" stroke-width=".6" opacity=".7"/></pattern>';
    s += '<pattern id="ma-tex-map" width="44" height="40" patternUnits="userSpaceOnUse"><path d="M0 30q10-12 22-4t22-8M0 36q12-8 22-2t22-6" fill="none" stroke="#4B7CC4" stroke-width=".8" opacity=".55"/><path d="M4 12q8 6 14 0t12 4" fill="none" stroke="#E0705A" stroke-width=".7" stroke-dasharray="2 2" opacity=".6"/></pattern>';
    s += '<pattern id="ma-tex-lines" width="20" height="5" patternUnits="userSpaceOnUse"><path d="M0 2.5h14M0 4.5h10" stroke="#7783C9" stroke-width=".6" opacity=".5"/></pattern>';
    // soft glows
    s += '<radialGradient id="ma-halo"><stop offset="0" stop-color="#FFF3C8" stop-opacity=".55"/><stop offset=".5" stop-color="#FFF3C8" stop-opacity=".18"/><stop offset="1" stop-color="#FFF3C8" stop-opacity="0"/></radialGradient>';
    s += '<radialGradient id="ma-wglow"><stop offset="0" stop-color="#FFD766" stop-opacity=".75"/><stop offset="1" stop-color="#FFD766" stop-opacity="0"/></radialGradient>';
    s += '<radialGradient id="ma-dawn"><stop offset="0" stop-color="#FFC8A0" stop-opacity=".8"/><stop offset="1" stop-color="#FFC8A0" stop-opacity="0"/></radialGradient>';
    s += '</defs>';
    return s;
  };
  /* Inject defs once into #svg-defs (or a given svg element). Safe to call repeatedly. */
  art.ensureDefs = function (el) {
    if (typeof document === 'undefined') return false;
    el = el || document.getElementById('svg-defs');
    if (!el) {
      el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      el.id = 'svg-defs'; el.setAttribute('width', '0'); el.setAttribute('height', '0'); el.setAttribute('aria-hidden', 'true'); el.style.position = 'absolute';
      (document.body || document.documentElement).appendChild(el);
    }
    if (!el.querySelector('#ma-grain')) el.innerHTML = art.defs();
    art.grainBaked = !!noiseTiles();
    return true;
  };

  /* ------------------------------------------------------------------ suit icon / stamp / plane */
  /* suitIcon(suit, size, {onDark:true}) uses the pale variant with a white rim (for dark backgrounds); the default is the dark-rimmed suit colour for paper. */
  art.suitIcon = function (suit, size, opts) {
    size = size || 20; opts = opts || {};
    var S = SUIT[suit] || SUIT.star;
    return '<svg class="ma-svg ma-suit" xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 24 24" width="' + size + '" height="' + size + '" aria-hidden="true" focusable="false">' + suitCut(suit, 0, 0, 10, opts.onDark ? { fill: S.pale, rw: 1.1 } : { rw: 1.1, rimColor: S.dark }) + '</svg>';
  };
  art.stampIcon = function (size) {
    size = size || 18;
    var s = '<path d="' + scallopD(1.5, 1.5, 21, 25, 4.2, 1) + '" transform="translate(.7 .9)" fill="#120C30" opacity=".35"/>' +
      '<path d="' + scallopD(1.5, 1.5, 21, 25, 4.2, 1) + '" fill="#FFFDF6"/>' +
      '<rect x="4.6" y="4.6" width="14.8" height="18.8" fill="#E8795A"/>' +
      '<circle cx="12" cy="14" r="4" fill="#F5CD55"/><path d="M12 8.2v-1.6M12 20.8v1.6M6.2 14h-1.6M19.4 14h1.6" stroke="#F5CD55" stroke-width="1.1" stroke-linecap="round"/>';
    return '<svg class="ma-svg ma-stamp-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28" width="' + size + '" height="' + f(size * 28 / 24) + '" aria-hidden="true" focusable="false">' + s + '</svg>';
  };
  art.planeSVG = function (size) {
    size = size || 40;
    var s = '<path d="M26 22L62 20L11 37Z" fill="#B9C2E4" stroke="#8B95C6" stroke-width=".7" stroke-linejoin="round"/>' +
      '<path d="M4 5L62 20L26 22Z" fill="#FFFDF6" stroke="#9AA3D0" stroke-width=".7" stroke-linejoin="round"/>' +
      '<path d="M26 22L62 20" stroke="#8B95C6" stroke-width=".9" stroke-linecap="round"/>' +
      '<path d="M4 5L20 21.4" stroke="#C9CFEA" stroke-width=".7"/>' +
      '<path d="M8 8.5l14 3.6M14 10.5l12 3.2" stroke="#A9B6E6" stroke-width=".5" stroke-linecap="round" opacity=".7"/>';
    return '<svg class="ma-svg ma-plane" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 66 40" width="' + size + '" height="' + f(size * 40 / 66) + '" aria-hidden="true" focusable="false">' + s + '</svg>';
  };
  art.tornPath = tornPath;

  /* export helpers for scene.js and previews */
  art.h = {
    C: C, SUIT: SUIT, rngFor: rngFor, f: f, P: P, rect: rect, circ: circ, ell: ell, line: line, stroke: stroke, G: G, text: text,
    suitCut: suitCut, star5: star5, sparkle: sparkle, glint: glint, dashes: dashes, face: face, cat: cat, scallopD: scallopD,
    tapeD: tapeD, label: label, wrap: wrap, cardBase: cardBase, paperD: paperD, blobD: blobD, polyD: polyD, pts: pts, esc: esc,
    STAR_D: STAR_D, MOON_D: MOON_D, TAPE: TAPE, FONT: FONT, rayD: rayD, bake: bake, noiseTiles: noiseTiles
  };
  var H = art.h;


  /* ================================================================== PLAYING CARDS */
  var PIPS = (function () {
    var six = [[39, 32], [61, 32], [39, 70], [61, 70], [39, 108], [61, 108]];
    return {
      2: [[50, 32], [50, 108]],
      3: [[50, 32], [50, 70], [50, 108]],
      4: [[39, 32], [61, 32], [39, 108], [61, 108]],
      5: [[39, 32], [61, 32], [50, 70], [39, 108], [61, 108]],
      6: six,
      7: six.concat([[50, 51]]),
      8: six.concat([[50, 51], [50, 89]]),
      9: [[39, 30], [61, 30], [39, 56], [61, 56], [39, 84], [61, 84], [39, 110], [61, 110], [50, 70]],
      10: [[39, 30], [61, 30], [39, 56], [61, 56], [39, 84], [61, 84], [39, 110], [61, 110], [50, 43], [50, 97]]
    };
  })();

  function cardIndex(rank, suit) {
    var S = SUIT[suit], lab = RANKS[rank] || String(rank);
    var one = text(15, 30, lab, rank === 10 ? 25 : 32, S.dark, { extra: rank === 10 ? 'letter-spacing="-1.6"' : '' }) + suitCut(suit, 15, 46, 8, { rw: 1, rimColor: S.dark });
    return one + '<g transform="rotate(180 50 70)">' + one + '</g>';
  }

  function faceCard(rank, suit, seed) {
    var S = SUIT[suit], s = '';
    // suit-coloured 3px rim around the art panel so the suit reads even when the corner index is tiny
    var panelRim = tornPath(59, 107, 'fp' + suit + rank, 1.6), panel = tornPath(53, 101, 'fq' + suit + rank, 1.4);
    s += '<path d="' + panelRim + '" transform="translate(20.5 17.5)" fill="' + S.color + '" stroke="' + C.rim + '" stroke-width=".7" paint-order="stroke"/>';
    if (rank === 12) { // ---- Queen: the girl at her lit window
      var curt = { star: '#F2A65A', moon: '#8A92E6', bloom: '#EE9294', leaf: '#7CC98A' }[suit];
      s += '<path d="' + panel + '" transform="translate(23.5 20.5)" fill="#EFE3C4" filter="url(#ma-grain)"/>';
      s += '<rect x="28.5" y="25" width="43" height="76" fill="' + C.window + '"/>';
      s += stroke('M31 30q2-2 4 0t4 0M45 28q2-2 4 0t4 0M30 108q2-2 4 0t4 0M50 108q2-2 4 0t4 0M26.5 44v6M26.5 70v6M73.5 56v6M73.5 84v6', '#B9A47A', 0.7, { opacity: 0.8 });
      s += P('M28.5 25H43Q38 52 41 101H28.5Z', curt, { rw: 0.9 }) + P('M71.5 25H57Q62 52 59 101H71.5Z', curt, { rw: 0.9 });
      s += stroke('M33 30V96M37 28Q35 60 37 98', '#fff', 0.6, { opacity: 0.35 });
      s += P('M23 101H77V111H23Z', C.sill, { rw: 1 });
      s += P('M63 101L64 93H70L71 101Z', C.pot, { rw: 0.8 }) + P('M67 93Q64 86 61 88Q63 92 67 93M67 93Q71 85 74 87Q72 92 67 93', C.leaf, { rw: 0.6 }) + circ(67, 86, 2.6, '#D9473F', { rw: 0.6 }) + circ(67, 86, 0.9, C.star, { rim: false });
      s += P('M33 101Q34 89 43 86L57 86Q66 89 67 101Z', C.sweater, { rw: 1 });
      s += P('M43.5 86L50 93L56.5 86L52 84.5Q50 86 48 84.5Z', '#FFFDF6', { rw: 0.6 });
      s += rect(46.5, 78, 7, 8, C.skin, { rw: 0.6 });
      s += P('M35 74Q33 54 50 53Q67 54 65 74Q65 82 62 85L38 85Q35 82 35 74Z', C.black, { rw: 1 });
      s += circ(50, 70, 12.6, C.skin, { rw: 0.9 });
      s += P('M36.5 68Q37 55 50 55Q63 55 63.5 68Q58 60 50 61Q42 60 36.5 68Z', C.black, { rw: 0.6 });
      s += P('M55 56.5L62 59L60.6 62.6L53.6 60.2Z', C.window, { rw: 0.6, rimColor: '#FFF3B0' });
      s += face(50, 72, 11, 'idle');
      s += line(48.5, 96, 56, 101, '#3A6FE0', 2.2) + line(56, 101, 57.6, 102.6, '#15122C', 1.4);
    } else {
      // ---- night panel (J and K)
      s += '<path d="' + panel + '" transform="translate(23.5 20.5)" fill="#242C78" filter="url(#ma-grain-l)"/>';
      s += stroke('M28 25H72V116H28Z', S.pale, 0.8, { extra: 'stroke-dasharray="2.2 2.2"', opacity: 0.7 });
      var st = [[64, 32], [31, 62], [69, 60], [66, 90], [34, 92]];
      st.forEach(function (p, i) { s += (i % 2 ? sparkle(p[0], p[1], 2, C.star, { w: 0.9 }) : star5(p[0], p[1], 2.6, C.star, i * 12, { rw: 0.5 })); });
      if (rank === 11) { // ---- Jack: the black cat on the roof
        s += suitCut(suit, 54, 58, 15, { fill: S.pale, rw: 1, opacity: 0.4 });
        s += P('M23.5 93L76.5 88V116H23.5Z', C.roof, { rw: 1 });
        s += rect(45, 101, 10, 10, C.window, { rw: 0.6 }) + line(50, 101, 50, 111, C.roof, 0.9) + line(45, 106, 55, 106, C.roof, 0.9);
        s += cat(52, 91, 46, { bow: S.pale, rw: 1 });
      } else { // ---- King: the paper sun
        var rays = '', i;
        for (i = 0; i < 12; i++) {
          var a = i / 12 * 6.28318 + 0.12, c = Math.cos(a), sn = Math.sin(a);
          rays += 'M' + f(50 + c * 12) + ' ' + f(70 + sn * 12) + 'L' + f(50 + c * (i % 2 ? 20 : 22.5)) + ' ' + f(70 + sn * (i % 2 ? 20 : 22.5));
        }
        s += '<path d="' + rays + '" stroke="' + C.rim + '" stroke-width="7.6" stroke-linecap="round" fill="none"/>';
        s += '<path d="' + rays + '" stroke="' + C.sun + '" stroke-width="6" stroke-linecap="round" fill="none"/>';
        s += circ(50, 70, 13.5, C.sun, { rim: false }) + face(50, 71, 12, 'idle');
        s += dashes(50, 70, 26.5, 29.5, 12, C.star, 1.5, 0.3);
        s += suitCut(suit, 50, 108, 6, { fill: S.pale, rw: 0.9, rot: 180 });
      }
    }
    var g = '<g transform="translate(51 70) scale(.95) translate(-50 -70)">' + s + '</g>';
    // suit emblem badge in the panel's top-left corner (pale on navy, suit-coloured on the cream window frame)
    g += suitCut(suit, 37.5, 34, 11.5, rank === 12 ? { rw: 1.1, rimColor: S.dark } : { fill: S.pale, rw: 1.1 });
    return g;
  }

  function pipsCard(rank, suit, seed) {
    var r = rngFor('pips|' + seed), list = PIPS[rank], R = rank <= 6 ? 10 : rank <= 8 ? 9.2 : 8.2, s = '';
    list.forEach(function (p) {
      var rot = (p[1] > 72 ? 180 : 0) + (r() - 0.5) * 16;
      s += suitCut(suit, p[0] + (r() - 0.5) * 1.2, p[1] + (r() - 0.5) * 1.2, R, { rot: rot, rw: 1.1, rimColor: SUIT[suit].dark });
    });
    return s;
  }
  function aceCard(suit, seed) {
    var S = SUIT[suit], s = '';
    s += dashes(52, 70, 33, 38, 12, C.star, 1.7, 0.26);
    s += suitCut(suit, 52, 70, suit === 'moon' ? 30 : 27, { rot: suit === 'star' ? 0 : suit === 'moon' ? 0 : 8, rw: 1.4, rimColor: S.dark });
    s += glint(74, 40, 4, C.star, { opacity: 0.9 }) + sparkle(28, 106, 2.6, S.dark, { w: 1, opacity: 0.6 });
    return s;
  }

  /* ---- stickers ---- */
  function blob(cx, cy, rr, seed, fill, op) { return '<path d="' + blobD(cx, cy, rr, seed, 0.16, 22) + '" fill="' + fill + '" opacity="' + op + '"/>'; }
  function stickerUnder(st, seed) {
    if (st === 'watercolor') {
      var r = rngFor('wc|' + seed);
      return blob(44 + r() * 8, 60 + r() * 6, 30, seed + 'a', '#F29AAE', 0.42) + blob(58 + r() * 8, 84 + r() * 8, 27, seed + 'b', '#4FC3B0', 0.36) +
        blob(40 + r() * 6, 96, 16, seed + 'c', '#F6C445', 0.28) + blob(66, 46, 8, seed + 'd', '#F29AAE', 0.5) + blob(28, 78, 5, seed + 'e', '#4FC3B0', 0.5);
    }
    if (st === 'graph') return '<path d="' + paperD(seed) + '" transform="translate(2.6 2.6)" fill="url(#ma-graph)"/>';
    return '';
  }
  function stickerOver(st, seed) {
    var r = rngFor('st|' + seed), s = '', i;
    if (st === 'foil') {
      var pd = paperD(seed);
      s += '<path d="' + pd + '" transform="translate(2.6 2.6)" fill="none" stroke="#D9A21F" stroke-width="3.8" stroke-linejoin="round"/>';
      s += '<path d="' + pd + '" transform="translate(3.4 3.4) scale(.982)" fill="none" stroke="#FBE28A" stroke-width=".8" stroke-linejoin="round" opacity=".9"/>';
      s += '<svg x="3" y="3" width="94" height="134" viewBox="0 0 94 134"><g class="ma-shimmer"><path d="M-50 140L-8 -6H12L-30 140Z" fill="#FFFBE0" opacity=".78"/><path d="M-20 140L22 -6H28L-14 140Z" fill="#FFFBE0" opacity=".6"/></g></svg>';
    } else if (st === 'glitter') {
      var cols = ['#F5CD55', '#F29AAE', '#5FD0BE', '#FFFFFF', '#F5CD55'];
      for (i = 0; i < 17; i++) {
        var x = 8 + r() * 84, y = 8 + r() * 124, rr = 2.2 + r() * 3.2;
        s += glint(x, y, rr, cols[i % 5], { cls: 'ma-gl', style: 'animation-delay:' + f2(r() * 2.4) + 's' });
      }
    } else if (st === 'washi') {
      var t = '<path d="' + tapeD(-19, -6.5, 19, 6.5) + '" fill="#F5A6B5" opacity=".86"/>';
      t += '<path d="M-17 -3.5H17M-17 3.5H17" stroke="#fff" stroke-width=".9" stroke-dasharray="3 2.4" opacity=".75"/>';
      for (i = 0; i < 5; i++) t += circ(-12 + i * 6, 0, 1.2, '#FFFDF6', { rim: false, opacity: 0.85 });
      t += '<path d="' + tapeD(-19, -6.5, 19, 6.5) + '" fill="none" stroke="#D7708A" stroke-width=".5" opacity=".6"/>';
      s += '<g transform="translate(84 14) rotate(42)">' + t + '</g>';
    } else if (st === 'wax') {
      var seal = '<path d="' + blobD(0, 0, 10, seed + 'w', 0.09, 18) + '" fill="#9C2A34" transform="translate(.8 1.1)" opacity=".5"/>';
      seal += '<path d="' + blobD(0, 0, 10, seed + 'w', 0.09, 18) + '" fill="#C23B45"/>';
      seal += '<circle r="7.3" fill="none" stroke="#A82F3A" stroke-width="1"/>';
      seal += '<path d="' + STAR_D + '" transform="scale(4.6)" fill="#A82F3A" stroke="#DA6570" stroke-width=".14" paint-order="stroke"/>';
      s += '<g transform="translate(18 121) rotate(-10)">' + seal + '</g>';
    }
    return s;
  }

  art.cardSVG = function (card, opts) {
    if (!card) return wrap('', opts, 'ma-card-svg');
    if (card.faceDown) return art.cardBackSVG(opts);
    var suit = card.suit, rank = card.rank, seed = 'card' + (card.uid || (rank + suit)), sticker = card.sticker || null;
    var s = cardBase(seed, C.paper);
    s += stickerUnder(sticker, seed);
    s += rank === 14 ? aceCard(suit, seed) : rank >= 11 ? faceCard(rank, suit, seed) : pipsCard(rank, suit, seed);
    s += cardIndex(rank, suit);
    s += stickerOver(sticker, seed);
    return wrap(s, opts, 'ma-card-svg ma-suit-' + suit + (sticker ? ' ma-st-' + sticker : ''));
  };

  /* ---- airmail envelope back ---- */
  art.cardBackSVG = function (opts) {
    var s = cardBase('back', '#F2E7C9');
    s += '<path d="M8 8H92V132H8ZM15.5 15.5V124.5H84.5V15.5Z" fill="url(#ma-airmail)" fill-rule="evenodd" transform="translate(.4 .6)"/>';
    s += '<path d="M8 8H92V132H8ZM15.5 15.5V124.5H84.5V15.5Z" fill="none" stroke="#2A2250" stroke-width=".5" stroke-opacity=".35" fill-rule="evenodd"/>';
    // flap
    s += '<path d="M15.5 15.5H84.5L50 66Z" fill="#E6D9B4" stroke="#B29F72" stroke-width=".9" stroke-linejoin="round"/>';
    s += stroke('M15.5 124.5L44 84M84.5 124.5L56 84', '#B29F72', 0.8, { opacity: 0.8 });
    s += stroke('M20 20L47 58M80 20L53 58', '#fff', 0.5, { opacity: 0.5 });
    // wax seal
    s += '<path d="' + blobD(50, 66, 8.6, 'bk', 0.08, 18) + '" fill="#9C2A34" opacity=".45" transform="translate(.8 1)"/><path d="' + blobD(50, 66, 8.6, 'bk', 0.08, 18) + '" fill="#C23B45"/>';
    s += star5(50, 66.5, 4.6, '#FBD5D5', 0, { rim: false, opacity: 0.9 });
    // stamp + postmark
    s += '<g transform="translate(62 19) rotate(6)"><path d="' + scallopD(0, 0, 17, 21, 3.6, 0.9) + '" fill="#120C30" opacity=".3" transform="translate(.6 .8)"/><path d="' + scallopD(0, 0, 17, 21, 3.6, 0.9) + '" fill="#FFFDF6"/><rect x="2.4" y="2.4" width="12.2" height="16.2" fill="#E8795A"/><circle cx="8.5" cy="10.5" r="3.4" fill="#F5CD55"/></g>';
    s += '<g opacity=".5" transform="translate(66 34)">' + stroke('M-9 6q3-3 6 0t6 0t6 0t6 0M-9 10q3-3 6 0t6 0t6 0t6 0', '#2A2250', 0.7) + '<circle cx="0" cy="3" r="8" fill="none" stroke="#2A2250" stroke-width=".7" stroke-dasharray="1.5 1.2"/></g>';
    // lettering + plane
    s += text(50, 100, 'AIR MAIL', 15, '#2F5BD3', { extra: 'letter-spacing=".8"' });
    s += text(50, 109, 'PAR AVION', 7, '#D9473F', { extra: 'letter-spacing="1.2"' });
    s += '<g transform="translate(37 112) scale(.4)">' + '<path d="M26 22L62 20L11 37Z" fill="#B9C2E4" stroke="#8B95C6" stroke-width="1.2"/><path d="M4 5L62 20L26 22Z" fill="#FFFDF6" stroke="#9AA3D0" stroke-width="1.2"/></g>';
    return wrap(s, opts, 'ma-card-svg ma-card-back');
  };

  /* ================================================================== KEEPSAKES */
  function crescentD(cx, cy, R, rot) {
    var r2 = R * 0.8, dx = R * 0.46, dy = -R * 0.1, d = Math.sqrt(dx * dx + dy * dy), a = (R * R - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(R * R - a * a);
    var mx = a * dx / d, my = a * dy / d, p1 = [mx + h * dy / d, my - h * dx / d], p2 = [mx - h * dy / d, my + h * dx / d], t;
    if (p1[1] > p2[1]) { t = p1; p1 = p2; p2 = t; }
    var large = ((p1[0] + p2[0]) / 2 > dx) ? 1 : 0, c = Math.cos((rot || 0) * Math.PI / 180), s = Math.sin((rot || 0) * Math.PI / 180);
    function T(p) { return f(cx + p[0] * c - p[1] * s) + ' ' + f(cy + p[0] * s + p[1] * c); }
    return 'M' + T(p1) + 'A' + f(R) + ' ' + f(R) + ' 0 1 0 ' + T(p2) + 'A' + f(r2) + ' ' + f(r2) + ' 0 ' + large + ' 1 ' + T(p1) + 'Z';
  }
  function ringD(cx, cy, rx, ry, th) {
    function e(rx, ry) { return 'M' + f(cx - rx) + ' ' + f(cy) + 'a' + f(rx) + ' ' + f(ry) + ' 0 1 0 ' + f(rx * 2) + ' 0a' + f(rx) + ' ' + f(ry) + ' 0 1 0 ' + f(-rx * 2) + ' 0Z'; }
    return e(rx, ry) + e(rx - th, ry - th);
  }
  function halo(cx, cy, r, op) { return '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r) + '" fill="url(#ma-halo)"' + (op ? ' opacity="' + op + '"' : '') + '/>'; }
  function noteD(x, y, sz) { // small music note glyph
    return '<g transform="translate(' + f(x) + ' ' + f(y) + ') scale(' + sz + ')"><ellipse cx="0" cy="0" rx="3.4" ry="2.5" transform="rotate(-20)" fill="#2A2250"/><path d="M3 -0.6V-13Q6 -11 7.5 -7" fill="none" stroke="#2A2250" stroke-width="1.5" stroke-linecap="round"/></g>';
  }
  function envelope(x, y, w, h, fill, rot, air) {
    var s = '';
    s += P('M' + x + ' ' + y + 'H' + (x + w) + 'V' + (y + h) + 'H' + x + 'Z', fill, { rw: 1 });
    if (air) s += '<rect x="' + (x + 1) + '" y="' + (y + h - 6) + '" width="' + (w - 2) + '" height="5" fill="url(#ma-airmail)"/>';
    s += stroke('M' + x + ' ' + y + 'L' + (x + w / 2) + ' ' + (y + h * 0.55) + 'L' + (x + w) + ' ' + y + 'M' + x + ' ' + (y + h) + 'L' + (x + w * 0.4) + ' ' + (y + h * 0.5) + 'M' + (x + w) + ' ' + (y + h) + 'L' + (x + w * 0.6) + ' ' + (y + h * 0.5), '#A8946A', 0.8, { opacity: 0.8 });
    return G(s, 0, 0, rot, 1, { extra: 'transform-origin="' + (x + w / 2) + ' ' + (y + h / 2) + '"' });
  }
  function envelopeRot(x, y, w, h, fill, rot, air) {
    var cx = x + w / 2, cy = y + h / 2;
    return '<g transform="rotate(' + rot + ' ' + f(cx) + ' ' + f(cy) + ')">' + envelope(x, y, w, h, fill, 0, air) + '</g>';
  }
  function windowFrame(x, y, w, h, curt) {
    var s = P('M' + x + ' ' + y + 'H' + (x + w) + 'V' + (y + h) + 'H' + x + 'Z', '#EFE3C4', { rw: 1 });
    var ix = x + 5, iy = y + 5, iw = w - 10, ih = h - 10;
    s += rect(ix, iy, iw, ih, C.window, { rim: false });
    s += stroke('M' + (x + 8) + ' ' + (y + 2.5) + 'q2-2 4 0t4 0t4 0M' + (x + 8) + ' ' + (y + h - 2.5) + 'q2-2 4 0t4 0t4 0', '#B9A47A', 0.7, { opacity: 0.8 });
    if (curt) {
      var cw = iw * 0.3;
      s += P('M' + ix + ' ' + iy + 'H' + (ix + cw) + 'Q' + (ix + cw - 5) + ' ' + (iy + ih * 0.45) + ' ' + (ix + cw - 2) + ' ' + (iy + ih) + 'H' + ix + 'Z', curt, { rw: 0.9 });
      s += P('M' + (ix + iw) + ' ' + iy + 'H' + (ix + iw - cw) + 'Q' + (ix + iw - cw + 5) + ' ' + (iy + ih * 0.45) + ' ' + (ix + iw - cw + 2) + ' ' + (iy + ih) + 'H' + (ix + iw) + 'Z', curt, { rw: 0.9 });
    }
    return s;
  }

  var IL = {}; // illustrations keyed by keepsake id, drawn in card space (x 8..92, y 8..106)

  IL.black_cat = function () {
    return halo(56, 42, 34) + circ(58, 40, 22, C.paper, { rw: 1.2 }) + '<circle cx="58" cy="40" r="22" fill="url(#ma-graph-l)"/>' +
      cat(44, 98, 70, { tailCls: 'ma-tail', tailStyle: 'transform-origin:0.24px -0.05px' }) + star5(20, 30, 4.5, C.star, 10) + star5(80, 82, 3.6, C.star, -8) + sparkle(24, 60, 3, C.paper, { w: 1.2 });
  };
  IL.hair_clip = function () {
    return P('M18 100Q10 46 34 26Q62 8 82 36Q92 66 80 100Z', C.black, { rw: 1.3 }) + stroke('M30 92Q26 56 40 36M42 96Q40 62 52 44M66 90Q68 62 60 44', '#4A4470', 1.6, { opacity: 0.8 }) +
      G(P('M-19 -6.5Q-19 -8 -17 -8H17Q19 -8 19 -6.5V6.5Q19 8 17 8H-17Q-19 8 -19 6.5Z', C.window, { rw: 1.2 }) + stroke('M-13 -3H10M-13 2H6', '#E0A11A', 1.2), 56, 36, -28) +
      dashes(56, 36, 28, 33, 5, C.star, 1.6, -2.2) + sparkle(24, 24, 3, '#fff', { w: 1.1, opacity: 0.85 });
  };
  IL.graph_moon = function () {
    var d = crescentD(50, 58, 38, -22);
    return halo(48, 56, 46, 0.7) + '<path d="' + d + '" fill="' + C.paper + '" stroke="' + C.rim + '" stroke-width="1.4" stroke-linejoin="round" paint-order="stroke"/><path d="' + d + '" fill="url(#ma-graph-l)"/>' +
      star5(80, 30, 4.6, C.star, 8) + star5(74, 86, 3.4, C.star, -12) + sparkle(26, 96, 3, '#fff', { w: 1.2 }) + sparkle(84, 58, 2.6, '#fff', { w: 1 });
  };
  IL.flower_pot = function () {
    return line(50, 64, 50, 38, C.vine, 3) + P('M50 62Q36 60 30 48Q44 48 50 62Z', C.leaf, { rw: 1 }) + P('M50 58Q64 56 72 44Q56 44 50 58Z', C.leaf, { rw: 1 }) +
      suitCut('bloom', 50, 30, 16, { fill: '#D9473F', rw: 1.2 }) +
      P('M27 66H73V76H27Z', '#C98547', { rw: 1.1 }) + P('M31 76H69L63 102H37Z', C.pot, { rw: 1.1 }) + stroke('M40 82V96M50 82V98M60 82V96', '#9C5F2C', 1.1, { opacity: 0.6 }) +
      sparkle(20, 40, 3, C.star, { w: 1.2 }) + sparkle(82, 24, 3, C.star, { w: 1.2 });
  };
  IL.ivy_vine = function () {
    var s = stroke('M46 104Q30 84 50 68Q70 50 46 34Q34 22 50 10', C.vine, 3);
    var pts = [[38, 92, -60], [56, 82, 60], [58, 66, 55], [40, 58, -60], [56, 46, 60], [44, 36, -55], [56, 24, 60], [44, 16, -50]];
    pts.forEach(function (p, i) { s += suitCut('leaf', p[0], p[1], 10, { rot: p[2], fill: i % 2 ? '#6CBF5E' : '#3E8E4E', rw: 1.1 }); });
    return s + sparkle(20, 30, 2.6, '#fff', { w: 1, opacity: 0.8 }) + sparkle(80, 88, 3, '#fff', { w: 1, opacity: 0.8 });
  };
  IL.pink_curtains = function () {
    return windowFrame(20, 16, 60, 84, C.curtain) + line(21, 22, 79, 22, '#8C6A4A', 2) + circ(21, 22, 2.4, '#B9773F', { rw: 0.6 }) + circ(79, 22, 2.4, '#B9773F', { rw: 0.6 }) +
      P('M20 100H80V104H20Z', C.sill, { rw: 0.9 }) + stroke('M32 40Q30 62 32 82', '#fff', 0.8, { opacity: 0.4 }) + P('M25 62Q32 65 39 62V66Q32 69 25 66Z', '#D9707A', { rw: 0.6 }) + P('M75 62Q68 65 61 62V66Q68 69 75 66Z', '#D9707A', { rw: 0.6 });
  };
  IL.lit_window = function () {
    return P('M8 10H92V106H8Z', '#1A1F58', { rw: 1.1 }) + '<path d="M8 10H92V106H8Z" fill="url(#ma-tex-hand)" opacity=".9"/>' + '<path d="M8 10H92V106H8Z" fill="url(#ma-tex-lines)" opacity=".6"/>' +
      halo(50, 54, 46, 1) + dashes(50, 54, 40, 47, 14, C.star, 1.6, 0.1) + windowFrame(26, 20, 48, 68, null) +
      rect(48, 25, 4, 58, '#EFE3C4', { rim: false }) + rect(31, 50, 38, 4, '#EFE3C4', { rim: false }) + circ(50, 52, 11, '#FFF3B0', { rim: false, opacity: 0.6 }) + P('M22 88H78V96H22Z', C.sill, { rw: 1 }) +
      P('M32 88L33 82H39L40 88Z', C.pot, { rw: 0.7 }) + circ(36, 79, 3, '#D9473F', { rw: 0.6 });
  };
  IL.paper_chain = function () {
    var cols = ['#E8795A', '#48C2AF', '#F2C64B', '#F29AA8', '#7C8AE0'], s = '', i, pos = [[26, 30], [40, 48], [56, 62], [72, 74], [84, 90]];
    // draw ring i at pos, alternating orientation so they read as interlocked
    for (i = 0; i < 5; i++) {
      s += '<g transform="rotate(' + (i % 2 ? 58 : -12) + ' ' + pos[i][0] + ' ' + pos[i][1] + ')"><path d="' + ringD(pos[i][0], pos[i][1], 14, 9.5, 4.6) + '" fill="' + cols[i] + '" fill-rule="evenodd"' + rimAttr({ rw: 1 }) + '/></g>';
    }
    return s + sparkle(78, 26, 3, '#fff', { w: 1.1 }) + sparkle(20, 84, 2.6, '#fff', { w: 1 });
  };
  IL.envelope_stack = function () {
    return envelopeRot(18, 60, 62, 40, '#E9B8B0', -7, false) + envelopeRot(20, 44, 62, 40, '#BFE0D8', 6, false) + envelopeRot(16, 26, 64, 42, '#FFFDF6', -3, true) +
      '<g transform="translate(66 30) rotate(6)"><path d="' + scallopD(0, 0, 12, 15, 3, 0.7) + '" fill="#FFFDF6"/><rect x="1.8" y="1.8" width="8.4" height="11.4" fill="#E8795A"/><circle cx="6" cy="7.5" r="2.4" fill="#F5CD55"/></g>';
  };
  IL.blue_pencil = function () {
    var body = '<rect x="-34" y="-7" width="54" height="14" fill="#2F5BD3"' + rimAttr({ rw: 1.1 }) + '/>' +
      '<path d="M-30 -7V7M-6 -7V7" stroke="#2247A8" stroke-width=".9" opacity=".8"/><path d="M-28 -2.5H16M-28 2.5H12" stroke="#5F86EC" stroke-width=".9" stroke-linecap="round"/>' +
      P('M20 -7L38 0L20 7Z', '#F1D4A2', { rw: 1 }) + '<path d="M32 -2.6L38 0L32 2.6Z" fill="#2A2250"/>' +
      P('M-40 -7H-34V7H-40Z', '#C9CDD8', { rw: 0.8 }) + P('M-49 -6.4Q-49 -7 -47 -7H-40V7H-47Q-49 7 -49 6.4Z', '#F29AA8', { rw: 1 });
    return stroke('M12 96q6-7 12 0t12 0t12 0t12 0', C.ink, 1.6, { opacity: 0.9 }) + G(body, 48, 56, -36, 1.05) + sparkle(20, 28, 3, '#fff', { w: 1.1 }) + sparkle(84, 34, 2.4, '#fff', { w: 1 });
  };
  IL.paper_plane = function () {
    var pl = '<path d="M26 22L62 20L11 37Z" fill="#B9C2E4" stroke="#8B95C6" stroke-width=".8" stroke-linejoin="round"/><path d="M4 5L62 20L26 22Z" fill="#FFFDF6" stroke="#9AA3D0" stroke-width=".8" stroke-linejoin="round"/><path d="M26 22L62 20" stroke="#8B95C6" stroke-width="1" stroke-linecap="round"/><path d="M4 5L20 21.4" stroke="#C9CFEA" stroke-width=".8"/>';
    return '<path d="M12 98Q20 62 46 56" fill="none" stroke="#fff" stroke-width="1.8" stroke-dasharray="4 4.4" stroke-linecap="round" opacity=".9"/>' + G(pl, 40, 30, -14, 1.05) + star5(24, 30, 3.6, C.star, 6) + sparkle(84, 84, 3, '#fff', { w: 1.2 }) + star5(78, 60, 3, C.star, 10);
  };
  IL.ceiling_stars = function () {
    var s = '', st = [[50, 42, 17, 8], [24, 70, 10, -10], [76, 74, 12, 14], [72, 22, 8, 0], [30, 24, 7, 20], [50, 92, 7, -6]];
    st.forEach(function (p) { s += halo(p[0], p[1], p[2] * 1.9, 0.9) + star5(p[0], p[1], p[2], '#E3F58A', p[3], { rw: 0.9 }); });
    return s + sparkle(88, 50, 3, '#fff', { w: 1.1 }) + sparkle(12, 46, 2.6, '#fff', { w: 1 });
  };
  IL.storybook = function () {
    return P('M12 34Q30 24 50 32Q70 24 88 34V94Q70 86 50 94Q30 86 12 94Z', '#E8795A', { rw: 1.2 }) +
      P('M17 32Q32 24 50 32V90Q32 84 17 90Z', '#FFFDF6', { rw: 0.9 }) + P('M83 32Q68 24 50 32V90Q68 84 83 90Z', '#F7EED6', { rw: 0.9 }) +
      P('M26 66L37 54L48 66V80H26Z', '#7C8AE0', { rw: 0.8 }) + rect(33, 70, 7, 10, C.window, { rim: false }) + star5(30, 44, 4, C.star, 0, { rw: 0.6 }) +
      stroke('M56 44H76M56 52H78M56 60H74M56 68H78M56 76H70', '#A79A7D', 1.3) + stroke('M50 32V92', '#C9B98F', 1);
  };
  IL.tin_bank = function () {
    return '<ellipse cx="50" cy="98" rx="30" ry="3.5" fill="#120C30" opacity=".18"/>' + P('M32 78H40V96H32ZM60 78H68V96H60Z', '#E58E9C', { rw: 1 }) +
      P('M76 46L84 34L90 50Z', '#E58E9C', { rw: 1 }) + ell(50, 64, 30, 23, '#F29AA8', { rw: 1.3 }) + ell(83, 66, 9, 8, '#F7B4BF', { rw: 1 }) + circ(80.5, 66, 1.4, '#B34E62', { rim: false }) + circ(85.5, 66, 1.4, '#B34E62', { rim: false }) +
      circ(72, 56, 2.2, C.black, { rim: false }) + circ(72.7, 55.3, 0.7, '#fff', { rim: false }) + stroke('M20 62Q10 56 14 48Q18 44 22 50', '#E58E9C', 2.4) +
      rect(38, 41.4, 18, 3.6, '#7C3A4B', { rim: false, r: 1.6 }) + stroke('M30 52Q36 46 46 47', '#fff', 1.2, { opacity: 0.55 }) + stroke('M28 70q2 3 5 0M56 74q2 3 5 0', '#D97A8B', 1.2, { opacity: 0.7 }) +
      G(circ(0, 0, 6.5, C.star, { rw: 1 }) + star5(0, 0, 3.2, '#D69A12', 0, { rim: false }), 47, 22, 0) + dashes(47, 22, 9, 12, 6, C.star, 1.3, 0.2) + '<path d="M47 32V36" stroke="#fff" stroke-width="1.2" stroke-dasharray="1.4 2" opacity=".8"/>';
  };
  IL.nightlight = function () {
    return halo(50, 56, 46) + dashes(50, 60, 32, 38, 12, C.star, 1.6, 0.1) + P('M26 62Q26 32 50 32Q74 32 74 62Z', C.window, { rw: 1.2 }) + circ(50, 52, 10, '#FFF3B0', { rim: false, opacity: 0.7 }) +
      P('M22 62H78V70H22Z', '#E8E0C8', { rw: 1.1 }) + P('M28 70H72V96H28Z', '#F3EAD3', { rw: 1.1 }) + rect(41, 96, 4, 8, '#9A9AA8', { rw: 0.6 }) + rect(55, 96, 4, 8, '#9A9AA8', { rw: 0.6 }) +
      circ(42, 82, 2, '#2A2250', { rim: false }) + circ(58, 82, 2, '#2A2250', { rim: false }) + stroke('M45 88Q50 91 55 88', '#2A2250', 1.3);
  };
  IL.night_owl = function () {
    return circ(50, 44, 34, '#2F3A96', { rw: 0.01, rim: false }) + line(12, 92, 88, 92, '#7A5231', 4) + suitCut('leaf', 84, 84, 6, { rot: 60, fill: '#6CBF5E', rw: 0.8 }) +
      P('M26 32L28 14L42 24Q50 21 58 24L72 14L74 32Q76 40 74 46Q76 76 62 90H38Q24 76 26 46Q24 40 26 32Z', '#8B5E3C', { rw: 1.2 }) +
      P('M38 62Q50 56 62 62Q62 82 50 90Q38 82 38 62Z', '#E8C89A', { rw: 0.8 }) + stroke('M42 68q3 3 6 0M52 68q3 3 6 0M44 76q3 3 6 0M50 76q3 3 6 0', '#B98A5A', 1) +
      circ(40, 40, 11, '#FFFDF6', { rw: 0.9 }) + circ(60, 40, 11, '#FFFDF6', { rw: 0.9 }) + circ(40, 41, 6, C.black, { rim: false }) + circ(60, 41, 6, C.black, { rim: false }) + circ(42, 38.6, 2, '#fff', { rim: false }) + circ(62, 38.6, 2, '#fff', { rim: false }) +
      P('M46 48L50 56L54 48Z', C.window, { rw: 0.7 }) + star5(20, 22, 3.6, C.star, 10) + star5(82, 34, 3, C.star, 0);
  };
  IL.moon_rabbit = function () {
    return halo(50, 52, 50, 0.9) + circ(50, 52, 34, '#FAEFB6', { rw: 1.3 }) + '<circle cx="50" cy="52" r="34" fill="url(#ma-graph-l)" opacity=".55"/>' +
      P('M36 52Q30 22 38 18Q46 20 46 52Z', '#FFFDF6', { rw: 1 }) + P('M54 52Q54 20 62 18Q70 22 64 52Z', '#FFFDF6', { rw: 1 }) + P('M39 46Q36 26 39 24Q43 28 43 46Z', '#F29AA8', { rw: 0 , rim: false}) + P('M57 46Q57 28 61 24Q64 28 61 46Z', '#F29AA8', { rim: false }) +
      ell(50, 84, 24, 16, '#FFFDF6', { rw: 1.2 }) + circ(50, 62, 15, '#FFFDF6', { rw: 1.2 }) + circ(76, 88, 6, '#FFFDF6', { rw: 1 }) + face(50, 63, 15, 'idle') + circ(50, 68, 1.6, '#F29AA8', { rim: false });
  };
  IL.telescope = function () {
    var tube = P('M-38 -9H8V9H-38Z', '#E8795A', { rw: 1.1 }) + P('M8 -12H38V12H8Z', '#F2C64B', { rw: 1.1 }) + rect(-14, -10, 4, 20, '#C4432D', { rim: false }) + rect(2, -10, 4, 20, '#C4432D', { rim: false }) + rect(38, -14, 5, 28, '#B9773F', { rw: 0.9 }) + circ(43, 0, 1, '#FFF3B0', { rim: false }) + '<rect x="38" y="-11" width="2" height="22" fill="#9BD4EA" opacity=".8"/>';
    return stroke('M52 60L32 100M52 60L74 100M52 60L54 102', '#7A5231', 3.2) + G(tube, 46, 48, -28, 0.9) + star5(80, 22, 5, C.star, 10) + sparkle(64, 16, 3, '#fff', { w: 1.1 }) + star5(26, 34, 3, C.star, 0) + sparkle(88, 52, 2.6, '#fff', { w: 1 });
  };
  IL.crumpled_note = function () {
    var s = P('M20 52L28 30L48 24L64 28L80 38L84 56L78 76L62 88L42 88L26 78Z', '#FFFDF6', { rw: 1.3 });
    s += '<path d="M28 30L48 24L44 46L26 52Z" fill="#F1EBDA"/><path d="M64 28L80 38L70 56L48 50L44 46L48 24Z" fill="#FBF6E8"/><path d="M70 56L84 56L78 76L62 88L58 66Z" fill="#E9E1CA"/><path d="M26 52L44 46L48 50L58 66L42 88L26 78Z" fill="#F6F0DE"/>';
    s += stroke('M44 46L48 50L70 56M48 50L58 66L62 88M58 66L78 76M26 52L44 46', '#B7AA85', 1) + stroke('M34 36q3-2 6 0M52 34q3-2 6 0M52 62q3-2 6 0M34 66q3-2 6 0', C.ink, 1.2, { opacity: 0.7 }) +
      stroke('M30 60q3-3 6 0t6 0', C.ink, 1, { opacity: 0.6 });
    return s + circ(82, 84, 2.2, '#FFFDF6', { rw: 0.6 }) + circ(16, 88, 1.8, '#FFFDF6', { rw: 0.6 }) + sparkle(78, 20, 3, '#fff', { w: 1.1 });
  };
  IL.diary = function () {
    return P('M24 90L26 18Q50 12 76 18L74 90Z', '#F7EED6', { rw: 1 }) + P('M20 88L24 14Q46 8 72 14L70 88Q46 94 20 88Z', '#7A4FA8', { rw: 1.3 }) +
      star5(45, 40, 12, C.star, 0, { rw: 1 }) + stroke('M28 66q4-3 8 0t8 0t8 0t8 0', '#D9C5F0', 1.4) + rect(64, 44, 12, 14, '#E0A91F', { rw: 0.9, r: 2 }) + circ(70, 50, 2.2, '#5A3D0A', { rim: false }) + P('M58 74L64 74L64 100L61 96L58 100Z', '#E8795A', { rw: 0.8 }) +
      stroke('M22 30H27M22 50H27M22 70H27', '#5C3986', 2);
  };
  IL.alarm_clock = function () {
    var bell = function (x, y, rot) { return G(P('M-11 4Q-11 -8 0 -8Q11 -8 11 4Z', '#F2C64B', { rw: 1 }) + rect(-1.4, -12, 2.8, 5, '#B9773F', { rim: false }), x, y, rot); };
    return bell(27, 26, -32) + bell(73, 26, 32) + stroke('M42 20L50 24L58 20', '#B9773F', 2) + stroke('M32 86L26 100M68 86L74 100', '#B9773F', 4) +
      circ(50, 58, 30, '#E8795A', { rw: 1.3 }) + circ(50, 58, 23, '#FFFDF6', { rw: 0.9 }) + dashes(50, 58, 18, 21, 12, '#2A2250', 1.3, 0) + stroke('M50 58V44M50 58L60 64', '#2A2250', 2.4) + circ(50, 58, 2.4, '#E8795A', { rim: false }) +
      stroke('M10 40q-4 6 0 12M90 40q4 6 0 12M6 36q-6 10 0 20M94 36q6 10 0 20', '#fff', 1.5, { opacity: 0.8 });
  };
  IL.kite = function () {
    var s = '';
    s += stroke('M50 84Q34 92 46 100Q60 104 44 108', '#fff', 1.2, { opacity: 0.9 });
    s += P('M50 10L76 46L50 46Z', '#E8795A', { rw: 1 }) + P('M50 10L24 46L50 46Z', '#48C2AF', { rw: 1 }) + P('M24 46L50 46L50 84Z', '#F2C64B', { rw: 1 }) + P('M76 46L50 46L50 84Z', '#F29AA8', { rw: 1 });
    s += stroke('M50 10V84M24 46H76', '#fff', 1.2, { opacity: 0.85 });
    [[46, 88, -20, '#E8795A'], [40, 96, 30, '#48C2AF'], [50, 102, -10, '#F2C64B']].forEach(function (b) {
      s += G(P('M-6 -4L0 0L-6 4Z', b[3], { rw: 0.8 }) + P('M6 -4L0 0L6 4Z', b[3], { rw: 0.8 }), b[0], b[1], b[2]);
    });
    return s + sparkle(84, 22, 3, '#fff', { w: 1.1 }) + sparkle(16, 80, 2.6, '#fff', { w: 1 });
  };
  IL.music_box = function () {
    return P('M18 60L26 30L84 30L78 60Z', '#8C5A2E', { rw: 1.1 }) + P('M20 60H80V92H20Z', '#B9773F', { rw: 1.2 }) + rect(24, 64, 52, 4, '#8C5A2E', { rim: false }) + stroke('M28 78q3-3 6 0t6 0t6 0t6 0t6 0t6 0', '#F2C64B', 1.4) +
      circ(50, 50, 7, '#F29AA8', { rw: 0.8 }) + P('M44 58L50 50L56 58Z', '#F29AA8', { rw: 0.8 }) + circ(50, 42, 3.4, C.skin, { rw: 0.6 }) + line(84, 76, 94, 70, '#7A5231', 2.4) + circ(95, 69.6, 2.6, '#F2C64B', { rw: 0.7 }) +
      noteD(28, 24, 1.1) + noteD(70, 16, 1.2) + noteD(86, 36, 0.9) + glint(38, 10, 3, C.star, {});
  };
  IL.warm_sweater = function () {
    return P('M34 22L44 18Q50 30 56 18L66 22L88 56L76 66L68 52V92H32V52L24 66L12 56Z', C.sweater, { rw: 1.3 }) +
      P('M42 18L50 32L58 18L52 16Q50 18 48 16Z', '#FFFDF6', { rw: 0.9 }) + stroke('M38 62V84M46 60V88M54 60V88M62 62V84', '#23B5A2', 1.4, { opacity: 0.8 }) + stroke('M32 88H68M14 56L24 62M76 62L86 56', '#F29AA8', 1.6, { extra: 'stroke-dasharray="2.4 2.2"' }) + circ(50, 42, 1.8, '#F29AA8', { rim: false }) + circ(50, 50, 1.8, '#F29AA8', { rim: false }) + circ(50, 58, 1.8, '#F29AA8', { rim: false }) +
      sparkle(84, 28, 3, '#fff', { w: 1.1 });
  };
  IL.bouquet = function () {
    var s = stroke('M40 40L50 74M50 30L50 74M62 40L50 74M30 52L50 74', C.vine, 2.4);
    s += suitCut('leaf', 28, 50, 10, { rot: -30, rw: 1 }) + suitCut('bloom', 40, 28, 13, { rw: 1.1 }) + suitCut('star', 62, 30, 12, { rw: 1.1 }) + suitCut('moon', 70, 54, 11, { rot: 20, rw: 1 });
    s += P('M26 66L74 66L52 102Z', '#FFFDF6', { rw: 1.2 }) + P('M34 66L66 66L54 88Z', '#F0E6C8', { rim: false }) + stroke('M36 70L50 98M64 70L50 98', '#E4B9AC', 1.2, { opacity: 0.8 });
    s += P('M42 70L50 66L58 70L58 76L50 72L42 76Z', '#F29AA8', { rw: 0.8 }) + circ(50, 71, 2.6, '#E8707F', { rw: 0.6 });
    return s;
  };
  IL.wishing_coin = function () {
    return halo(50, 54, 48) + dashes(50, 54, 33, 39, 14, C.star, 1.7, 0.1) + circ(50, 54, 28, '#E9A81F', { rw: 1.3 }) + circ(50, 54, 22.5, 'none', { rim: false, extra: 'stroke="#C98A0E" stroke-width="1.4" stroke-dasharray="2.4 2.2"' }) +
      star5(50, 55, 14, '#C98A0E', 0, { rim: false }) + '<path d="M28 40Q32 30 42 27" stroke="#FFE59A" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>' + glint(82, 22, 6, '#fff', {}) + glint(20, 88, 4.6, '#fff', {}) + sparkle(80, 92, 3, C.star, { w: 1.2 });
  };
  IL.bookmark = function () {
    return P('M16 56Q34 50 50 58V96Q34 90 16 96Z', '#FFFDF6', { rw: 1 }) + P('M84 56Q66 50 50 58V96Q66 90 84 96Z', '#F7EED6', { rw: 1 }) + stroke('M22 66H44M22 73H44M22 80H40M56 66H78M56 73H78M56 80H74', '#A79A7D', 1.2) +
      P('M38 12H62V84L50 74L38 84Z', '#E8795A', { rw: 1.3 }) + stroke('M42 20V74M58 20V74', '#F5A48C', 1, { opacity: 0.8 }) + star5(50, 34, 8, C.star, 0, { rw: 0.9 }) + stroke('M50 4V12M46 6L50 12L54 6', '#F2C64B', 2.4);
  };
  IL.star_map = function () {
    var s = P('M14 24L38 18V86L14 92Z', '#F3E2B0', { rw: 1.1 }) + P('M38 18L62 24V92L38 86Z', '#E9D49A', { rw: 1.1 }) + P('M62 24L86 18V86L62 92Z', '#F3E2B0', { rw: 1.1 });
    s += stroke('M20 78Q28 50 40 64T62 44T80 30', '#D9473F', 1.6, { extra: 'stroke-dasharray="3 2.6"' });
    s += star5(24, 34, 4.4, '#E0A91F', 0, { rw: 0.7 }) + star5(52, 74, 3.6, '#E0A91F', 10, { rw: 0.7 }) + star5(72, 60, 4, '#E0A91F', -8, { rw: 0.7 });
    s += stroke('M76 26l6 6M82 26l-6 6', '#D9473F', 2.2) + G('<circle r="7" fill="#F7ECC6" stroke="#8C7A4A" stroke-width=".8"/><path d="M0 -9V9M-9 0H9" stroke="#8C7A4A" stroke-width=".8"/><path d="M0 -6L2 0L0 6L-2 0Z" fill="#D9473F"/>', 26, 78, 0);
    return s + stroke('M40 30q3-2 6 0M44 46q3-2 6 0', '#8C7A4A', 1.2, { opacity: 0.8 });
  };
  IL.rooftop_cat = function () {
    var s = '', i;
    s += halo(74, 24, 26, 0.9) + circ(74, 24, 10, C.paper, { rw: 1 }) + '<circle cx="74" cy="24" r="10" fill="url(#ma-graph-l)"/>';
    s += P('M6 70L50 40L94 70V106H6Z', '#141845', { rw: 1.2 }) + rect(68, 44, 10, 18, '#141845', { rw: 1 });
    s += P('M8 68H92V106H8Z', '#1B2060', { rw: 0 }) + '<path d="M8 70H92V106H8Z" fill="url(#ma-tex-hand)" opacity=".8"/>';
    [[20, 78], [44, 78], [68, 78]].forEach(function (w) { s += rect(w[0], w[1], 12, 14, C.window, { rw: 0.7 }) + line(w[0] + 6, w[1], w[0] + 6, w[1] + 14, '#141845', 1) + line(w[0], w[1] + 7, w[0] + 12, w[1] + 7, '#141845', 1); });
    s += cat(46, 51, 30, { tailCls: 'ma-tail', tailStyle: 'transform-origin:0.24px -0.05px' });
    for (i = 0; i < 9; i++) s += circ(16 + i * 4.6, 10 + Math.abs(i - 4) * 1.2, 1.4, C.star, { rim: false });
    return s;
  };
  IL.paper_sun = function () {
    var rays = '', i;
    for (i = 0; i < 12; i++) {
      var a = i / 12 * 6.28318 + 0.1, c = Math.cos(a), sn = Math.sin(a), r2 = i % 2 ? 36 : 40;
      rays += 'M' + f(50 + c * 18) + ' ' + f(56 + sn * 18) + 'L' + f(50 + c * r2) + ' ' + f(56 + sn * r2);
    }
    return '<g><path d="' + rays + '" stroke="' + C.rim + '" stroke-width="12.4" stroke-linecap="round" fill="none"/><path d="' + rays + '" stroke="' + C.sun + '" stroke-width="10" stroke-linecap="round" fill="none"/></g>' +
      circ(50, 56, 21, C.sun, { rw: 1.3 }) + face(50, 57, 19, 'happy') + dashes(50, 56, 46, 49, 12, C.star, 1.6, 0.3);
  };
  IL.origami_crane = function () {
    var s = P('M52 50L60 18L78 56Z', '#48C2AF', { rw: 1.1 }) + P('M34 58L52 50L74 62L48 78Z', '#FFFDF6', { rw: 1.1 }) +
      P('M34 58L14 40L18 36L38 52Z', '#FFFDF6', { rw: 1.1 }) + P('M14 40L8 44L18 36Z', '#F2C64B', { rw: 0.8 }) + P('M74 62L92 56L82 72Z', '#48C2AF', { rw: 1 }) +
      P('M46 60L36 24L66 56Z', '#F7F0DC', { rw: 1.1 }) + stroke('M34 58L48 78M52 50L48 78M46 60L60 66M36 24L52 50', '#C9A98C', 0.8, { opacity: 0.9 }) + circ(15, 39, 1, C.black, { rim: false });
    return s + sparkle(84, 24, 3, '#fff', { w: 1.1 }) + sparkle(20, 84, 3, '#fff', { w: 1.1 });
  };
  IL.rainbow_crayons = function () {
    var cols = ['#E0604B', '#F2C64B', '#48B36A', '#2F5BD3', '#8B5CC0'], s = '';
    cols.forEach(function (c, i) {
      var rot = -44 + i * 22, body = P('M-6 0H6V-46H-6Z', c, { rw: 1 }) + rect(-6, -34, 12, 12, '#FFFDF6', { rim: false, opacity: 0.35 }) + stroke('M-6 -28H6M-6 -22H6', '#fff', 0.9, { opacity: 0.6 }) + P('M-6 -46L0 -60L6 -46Z', c, { rw: 1 }) + '<path d="M-3 -53L0 -60L3 -53Z" fill="#fff" opacity=".35"/>';
      s += G(body, 50, 104, rot);
    });
    return s + star5(84, 24, 4, C.star, 8) + sparkle(16, 28, 3, '#fff', { w: 1.1 });
  };
  IL._generic = function () { return star5(50, 54, 30, C.star, 0, { rw: 1.4 }) + text(50, 66, '?', 34, C.text); };

  var KEEP = {
    black_cat: ['Black Cat', 'common', '#E9D7A6'], hair_clip: ['Yellow Hair Clip', 'common', '#F1C7C4'], graph_moon: ['Graph-Paper Moon', 'common', '#AEB9E8'],
    flower_pot: ['Flower Pot', 'common', '#F2D3B3'], ivy_vine: ['Ivy Vine', 'common', '#CBE2BF'], pink_curtains: ['Pink Curtains', 'common', '#E9C9E0'],
    lit_window: ['Lit Window', 'common', '#2B2F73'], paper_chain: ['Paper Garland', 'common', '#BFE0D8'], envelope_stack: ['Stack of Envelopes', 'common', '#F0D9BF'],
    blue_pencil: ['Blue Pencil', 'common', '#F3EAD3'], paper_plane: ['Paper Airplane', 'common', '#B7D0EE'], ceiling_stars: ['Glow-in-the-Dark Stars', 'common', '#2D3A8E'],
    storybook: ['Storybook', 'common', '#F1C8A4'], tin_bank: ['Tin Piggy Bank', 'common', '#CFE5C6'], nightlight: ['Nightlight', 'common', '#4A3A86'],
    night_owl: ['Night Owl', 'uncommon', '#27327F'], moon_rabbit: ['Moon Rabbit', 'uncommon', '#2C3A8E'], telescope: ['Telescope', 'uncommon', '#2A3584'],
    crumpled_note: ['Crumpled Note', 'uncommon', '#DDE7C9'], diary: ['Diary', 'uncommon', '#F4CFDA'], alarm_clock: ['Alarm Clock', 'uncommon', '#FAE29A'],
    kite: ['Kite String', 'uncommon', '#BFE3EE'], music_box: ['Music Box', 'uncommon', '#E5C9E8'], warm_sweater: ['Teal Sweater', 'uncommon', '#F6DDC0'],
    bouquet: ['Bouquet', 'uncommon', '#F0E6B8'], wishing_coin: ['Wishing Coin', 'uncommon', '#3C4AA6'], bookmark: ['Bookmark', 'uncommon', '#D8E9D2'],
    star_map: ['Star Map', 'uncommon', '#2A3584'], rooftop_cat: ['Rooftop Cat', 'uncommon', '#222A76'],
    paper_sun: ['The Paper Sun', 'rare', '#F5D590'], origami_crane: ['Origami Crane', 'rare', '#F2A08A'], rainbow_crayons: ['Rainbow Crayons', 'rare', '#F7E7A8']
  };
  function isDark(hex) { var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) < 120; }

  art.keepsakeSVG = function (id, opts) {
    var k = KEEP[id] || [String(id).replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }), 'common', '#E9D7A6'];
    if (opts && opts.name) k = [opts.name, (opts.rarity || k[1]), k[2]];
    else if (opts && opts.rarity) k = [k[0], opts.rarity, k[2]];
    var seed = 'keep' + id, s = cardBase(seed, k[2], { dark: isDark(k[2]) });
    s += (IL[id] || IL._generic)();
    if (k[1] === 'rare') s += glint(88, 14, 5, '#fff', { opacity: 0.9 }) + glint(12, 100, 3.6, '#fff', { opacity: 0.8 });
    s += label(k[0], TAPE[k[1]] || TAPE.common, k[0].length > 15 ? 106 : 112, seed, { star: k[1] === 'rare' });
    return wrap(s, opts, 'ma-keepsake-svg ma-r-' + k[1]);
  };
  art.keepsakeInfo = function (id) { var k = KEEP[id]; return k ? { id: id, name: k[0], rarity: k[1] } : null; };
  art.keepsakeIds = function () { return Object.keys(KEEP); };

  /* ================================================================== LETTERS */
  function stampGlyph(col, w, h) {
    w = w || 14; h = h || 18;
    return '<path d="' + scallopD(-w / 2, -h / 2, w, h, 3.4, 0.8) + '" fill="#FFFDF6" stroke="#D9CFA8" stroke-width=".5"/><rect x="' + f(-w / 2 + 2.2) + '" y="' + f(-h / 2 + 2.2) + '" width="' + f(w - 4.4) + '" height="' + f(h - 4.4) + '" fill="' + col + '"/><circle cx="0" cy="0" r="' + f(w * 0.2) + '" fill="#F5CD55"/>';
  }
  function bottle(col, dark, suit) {
    return P('M-11 -2H11V16Q11 21 6 21H-6Q-11 21 -11 16Z', col, { rw: 1.1 }) + P('M-5 -9H5V-2H-5Z', dark, { rw: 0.9 }) + P('M-6.5 -16H6.5V-9H-6.5Z', '#8C5A2E', { rw: 0.9 }) +
      circ(0, 10, 6, '#FFFDF6', { rim: false }) + (suit ? suitCut(suit, 0, 10, 4.2, { rw: 0.5, rim: false }) : '') + '<path d="M15 -4Q19 -12 19 -12Q21 -6 19 -3Q17 -1 15 -4Z" fill="' + col + '"/>';
  }
  function stickerSq(kind) {
    var base = '<g transform="rotate(-6)">' + '<rect x="-15" y="-15" width="30" height="30" rx="2" fill="#FFFDF6" stroke="#FFFDF6" stroke-width="2"/>';
    var inner = '';
    if (kind === 'graph') inner = '<rect x="-13" y="-13" width="26" height="26" fill="#FBFAF1"/><rect x="-13" y="-13" width="26" height="26" fill="url(#ma-graph)"/>';
    else if (kind === 'watercolor') inner = '<rect x="-13" y="-13" width="26" height="26" fill="#FBFAF1"/><circle cx="-3" cy="-2" r="10" fill="#F29AA8" opacity=".6"/><circle cx="5" cy="5" r="9" fill="#4FC3B0" opacity=".55"/><circle cx="6" cy="-7" r="4" fill="#F6C445" opacity=".6"/>';
    else if (kind === 'foil') inner = '<rect x="-13" y="-13" width="26" height="26" fill="#E9B32C"/><path d="M-13 8L4 -13H9L-8 13Z" fill="#FFF3B0" opacity=".65"/><rect x="-13" y="-13" width="26" height="26" fill="none" stroke="#B9800C" stroke-width="1.4"/>';
    else if (kind === 'glitter') inner = '<rect x="-13" y="-13" width="26" height="26" fill="#F7E7F2"/>' + glint(-6, -5, 4.4, '#F5CD55') + glint(6, 3, 5, '#F29AA8') + glint(-3, 8, 3, '#4FC3B0') + glint(8, -8, 3, '#fff') + glint(-9, 5, 2.4, '#fff');
    return base + inner + '<path d="M15 6L6 15L15 15Z" fill="#E4DCC0" stroke="#C9BF9C" stroke-width=".5"/></g>';
  }
  var LET = {
    fold: ['Fold', '#D9D3EE', '#1F9C8C', function () {
      return P('M-20 -14H0V16H-20Z', '#FFFDF6', { rw: 1 }) + P('M0 -14L15 -9V12L0 16Z', '#BFD3F2', { rw: 1 }) + stroke('M-16 -6H-4M-16 0H-4M-16 6H-6', '#9AA3C8', 1) +
        stroke('M0 -16V18', '#6E78C8', 1.2, { extra: 'stroke-dasharray="2 2"' }) + stroke('M-13 -21Q0 -30 15 -21', '#E8795A', 2) + '<path d="M11 -24L16 -20.5L10 -18Z" fill="#E8795A"/>';
    }],
    tear: ['Tear', '#D9D3EE', '#E0604B', function () {
      var a = P('M-21 -16H-1L-4 -8L0 -2L-4 5L0 12L-3 18H-21Z', '#FFFDF6', { rw: 1 }) + stroke('M-16 -8H-8M-16 -2H-8M-16 4H-8', '#9AA3C8', 1);
      var b = P('M2 -16H21V18H3L0 12L4 5L0 -2L4 -8Z', '#FFFDF6', { rw: 1 }) + stroke('M9 -8H16M9 -2H16M9 4H16', '#9AA3C8', 1);
      return G(a, -3, 0, -6) + G(b, 4, 1, 7);
    }],
    ink_star: ['Starlight Ink', '#F6E7B0', SUIT.star.color, function () { return bottle(SUIT.star.color, SUIT.star.dark, 'star'); }],
    ink_moon: ['Moonlight Ink', '#CDD2F2', SUIT.moon.color, function () { return bottle(SUIT.moon.color, SUIT.moon.dark, 'moon'); }],
    ink_bloom: ['Pressed Petal', '#F7D2C9', SUIT.bloom.color, function () { return bottle(SUIT.bloom.color, SUIT.bloom.dark, 'bloom'); }],
    ink_leaf: ['Pressed Leaf', '#CBE6D4', SUIT.leaf.color, function () { return bottle(SUIT.leaf.color, SUIT.leaf.dark, 'leaf'); }],
    sticker_graph: ['Graph Paper Sheet', '#F6D8DF', '#5B8FD6', function () { return stickerSq('graph'); }],
    sticker_watercolor: ['Watercolor Tin', '#F6D8DF', '#4FC3B0', function () { return stickerSq('watercolor'); }],
    sticker_foil: ['Gold Foil', '#F6D8DF', '#E9B32C', function () { return stickerSq('foil'); }],
    sticker_glitter: ['Glitter Glue', '#F6D8DF', '#F29AA8', function () { return stickerSq('glitter'); }],
    sticker_washi: ['Washi Tape', '#F6D8DF', '#F29AA8', function () {
      return G('<path d="' + tapeD(-22, -7, 22, 7) + '" fill="#F5A6B5" stroke="#FFFDF6" stroke-width="1" paint-order="stroke"/><path d="M-20 -3.5H20M-20 3.5H20" stroke="#fff" stroke-width=".9" stroke-dasharray="3 2.4" opacity=".8"/>' + circ(-12, 0, 1.3, '#FFFDF6', { rim: false }) + circ(-4, 0, 1.3, '#FFFDF6', { rim: false }) + circ(4, 0, 1.3, '#FFFDF6', { rim: false }) + circ(12, 0, 1.3, '#FFFDF6', { rim: false }), 0, 0, -32);
    }],
    sticker_wax: ['Wax Seal', '#F6D8DF', '#C23B45', function () {
      return '<path d="' + blobD(0, 0, 16, 'lwx', 0.09, 18) + '" fill="#C23B45" stroke="#FFFDF6" stroke-width="1" paint-order="stroke"/><circle r="11.5" fill="none" stroke="#A82F3A" stroke-width="1.4"/><path d="' + STAR_D + '" transform="scale(7.4)" fill="#A82F3A" stroke="#DA6570" stroke-width=".12" paint-order="stroke"/>';
    }],
    eraser: ['Eraser', '#D8E6D8', '#F29AA8', function () {
      return G(P('M-17 -8H2V8H-17Z', '#F4A6B4', { rw: 1.1 }) + P('M2 -8.6H17V8.6H2Z', '#4A6DD8', { rw: 1.1 }) + stroke('M6 -3H13M6 3H13', '#fff', 1.2, { opacity: 0.8 }), 0, -2, -26) + circ(-14, 16, 1.6, '#C9C4B4', { rim: false }) + circ(-8, 19, 1.2, '#C9C4B4', { rim: false }) + circ(-18, 20, 1.2, '#C9C4B4', { rim: false }) + circ(-2, 17, 1, '#C9C4B4', { rim: false });
    }],
    carbon: ['Carbon Paper', '#D8E6D8', '#2F3A96', function () {
      return G(P('M-14 -16H12V16H-14Z', '#232B74', { rw: 1 }) + stroke('M-9 -8H6M-9 -2H6M-9 4H2', '#6E78C8', 1.1), 2, 2, 6) + G(P('M-12 -16H14V16H-12Z', '#FFFDF6', { rw: 1 }) + stroke('M-7 -8H8M-7 -2H8M-7 4H4', C.ink, 1.1), -2, -2, -5);
    }],
    sharpener: ['Pencil Sharpener', '#D8E6D8', '#F2C64B', function () {
      var s = P('M-19 -9H6L15 -3V10H-19Z', '#B7BDCC', { rw: 1.1 }) + rect(-14, -4, 12, 3, '#6E7692', { rim: false }) + circ(-8, 4.6, 2.2, '#6E7692', { rim: false }) + P('M15 -1L26 3L15 7Z', '#F1D4A2', { rw: 0.9 }) + '<path d="M22.6 2L26 3L22.6 4Z" fill="#2A2250"/>';
      return G(s, -3, -2, -8) + stroke('M-16 16q4-6 8-1q-3 4-6 1M-6 20q4-6 8-1q-3 4-6 1', '#E8C89A', 1.6);
    }],
    allowance: ['Allowance', '#F6E4A6', '#E0A91F', function () {
      return G(stampGlyph('#E8795A', 16, 20), -8, -3, -12) + G(stampGlyph('#48C2AF', 16, 20), 9, 1, 9) + text(0, 24, '×2', 12, '#2A2250');
    }],
    wishing_star: ['Wishing Star', '#2A3584', '#F5CD55', function () {
      return stroke('M-22 20Q-8 12 6 -4', '#fff', 2, { extra: 'stroke-dasharray="3 3"', opacity: 0.9 }) + stroke('M-18 24Q-4 18 10 2', C.star, 1.2, { opacity: 0.8 }) + star5(10, -6, 13, C.star, 12, { rw: 1.1 }) + glint(-14, -12, 4, '#fff') + glint(20, 16, 3.4, '#fff');
    }]
  };
  art.letterSVG = function (id, opts) {
    var L = LET[id] || [String(id).replace(/_/g, ' '), '#E7E0C8', '#C23B45', function () { return text(0, 8, '?', 30, C.text); }];
    var seed = 'let' + id, dark = isDark(L[1]);
    var fam = id.indexOf('ink_') === 0 ? 'ink' : id.indexOf('sticker_') === 0 ? 'sticker' : 'util';
    var suitOf = { ink_star: 'star', ink_moon: 'moon', ink_bloom: 'bloom', ink_leaf: 'leaf' }[id];
    var tint = fam === 'ink' ? SUIT[suitOf].pale : fam === 'sticker' ? '#F6C9D6' : '#CDE4C6';
    var seal = fam === 'ink' ? SUIT[suitOf].color : fam === 'sticker' ? '#D95F7E' : '#3F9F63';
    var s = cardBase(seed, L[1], { dark: dark });
    // the letter sheet, big, carrying the drawing of the effect
    s += '<g transform="rotate(-2 50 40)"><path d="' + tornPath(66, 70, seed + 's', 1.2) + '" transform="translate(17 5)" fill="' + C.rim + '"/><path d="' + tornPath(64, 68, seed + 't', 1) + '" transform="translate(18 6)" fill="#FBF5E2" filter="url(#ma-grain)"/>' +
      stroke('M26 66H74', '#B9C8E4', 0.8) + '</g>';
    s += '<g transform="translate(50 38) scale(1.4)">' + LET_ICON(L) + '</g>';
    // envelope front (bottom ~30%): family-tinted flap, tinted seal
    s += '<path d="M8 66H92V104H8Z" transform="translate(1.4 1.8)" fill="#120C30" opacity=".3"/>';
    s += '<path d="M8 66H92V104H8Z" fill="#EFE3C2" stroke="' + C.rim + '" stroke-width="1.2" stroke-linejoin="round" paint-order="stroke" filter="url(#ma-grain)"/>';
    s += '<path d="M8 66L50 92L92 66V104H8Z" fill="' + tint + '" opacity=".75"/><path d="M8 104L38 80M92 104L62 80" stroke="#8C7A54" stroke-width=".9" stroke-linecap="round" fill="none" opacity=".8"/>';
    s += '<path d="M8 66L50 92L92 66" stroke="#8C7A54" stroke-width="1" stroke-linejoin="round" fill="none"/>';
    s += '<path d="' + blobD(50, 87, 8.6, seed + 'x', 0.09, 18) + '" fill="#120C30" opacity=".3" transform="translate(.8 1)"/><path d="' + blobD(50, 87, 8.6, seed + 'x', 0.09, 18) + '" fill="' + seal + '" stroke="' + C.rim + '" stroke-width=".8" paint-order="stroke"/>';
    s += star5(50, 87.4, 4.4, C.rim, 0, { rim: false, opacity: 0.9 });
    s += label(L[0], '#F2D26B', L[0].length > 15 ? 106 : 111, seed, { rot: 1 });
    return wrap(s, opts, 'ma-letter-svg ma-letter-' + fam);
  };
  function LET_ICON(L) { return L[3](); }
  art.letterInfo = function (id) { var l = LET[id]; return l ? { id: id, name: l[0] } : null; };
  art.letterIds = function () { return Object.keys(LET); };

  /* ================================================================== CONSTELLATIONS */
  var CON = {
    polaris: ['Polaris', [[50, 50, 10], [22, 28, 3], [80, 24, 2.6], [26, 80, 3], [76, 78, 2.4], [88, 54, 2.2], [14, 56, 2]], [], function () {
      return '<circle cx="50" cy="50" r="24" fill="none" stroke="#fff" stroke-width=".9" stroke-dasharray="2.6 2.6" opacity=".7"/>' + dashes(50, 50, 16, 21, 8, C.star, 1.6, 0.2);
    }],
    gemini: ['Gemini', [[36, 26, 5], [64, 26, 5], [34, 48, 3], [66, 48, 3], [36, 72, 3.4], [64, 72, 3.4], [30, 96, 3], [70, 96, 3]], [[0, 1], [0, 2], [2, 4], [4, 6], [1, 3], [3, 5], [5, 7], [2, 3]]],
    twin_kites: ['The Twin Kites', [[28, 20, 3.6], [42, 38, 3.2], [28, 62, 3.6], [15, 38, 3.2], [72, 44, 3.6], [86, 62, 3.2], [72, 88, 3.6], [58, 62, 3.2]], [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [2, 7]]],
    orions_belt: ['Orion\'s Belt', [[34, 58, 4.4], [50, 54, 4.8], [66, 50, 4.4], [30, 26, 5], [74, 22, 3.6], [36, 92, 4], [68, 90, 4.6]], [[0, 1], [1, 2], [3, 0], [4, 2], [0, 5], [2, 6], [3, 4], [5, 6]]],
    milky_way: ['The Milky Way', [[16, 92, 3], [30, 78, 3.6], [46, 72, 3], [58, 60, 4], [50, 44, 3.4], [60, 32, 3], [74, 26, 3.8], [84, 16, 2.6]], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]], function (r) {
      var d = ''; for (var i = 0; i < 26; i++) { var t = r(), x = 14 + t * 72, y = 92 - t * 74 + Math.sin(t * 9) * 10 + (r() - 0.5) * 16; d += circ(x, y, 0.6 + r() * 0.8, '#fff', { rim: false, opacity: 0.55 + r() * 0.4 }); } return d;
    }],
    teapot: ['The Teapot', [[30, 56, 4], [52, 48, 3.4], [66, 60, 4], [62, 84, 3.6], [38, 88, 3.6], [82, 46, 3], [20, 62, 2.6], [22, 80, 2.6], [48, 38, 3], [56, 38, 2.4]], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [2, 5], [0, 6], [6, 7], [7, 4], [1, 8], [8, 9], [9, 1]]],
    little_house: ['The Little House', [[24, 74, 3.6], [24, 50, 3.6], [50, 24, 4.6], [76, 50, 3.6], [76, 74, 3.6], [64, 30, 2.6], [50, 60, 6]], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [2, 5], [5, 3]], function () { return glint(50, 60, 11, '#FFE58A', { opacity: 0.35 }); }],
    southern_cross: ['The Southern Cross', [[50, 18, 5], [50, 82, 4.2], [28, 50, 3.6], [72, 44, 3.8], [16, 88, 2.6], [30, 94, 2.4], [58, 60, 2.2]], [[0, 1], [2, 3], [4, 5]]],
    comet: ['The Comet', [[72, 36, 10], [58, 48, 4], [48, 58, 3.2], [38, 68, 2.6], [28, 78, 2.2], [20, 86, 1.8]], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]], function () {
      return stroke('M66 30Q42 34 20 58', '#fff', 1, { extra: 'stroke-dasharray="1.6 3"', opacity: 0.8 }) + stroke('M76 44Q64 70 34 88', '#fff', 1, { extra: 'stroke-dasharray="1.6 3"', opacity: 0.8 }) + dashes(72, 36, 14, 18, 8, C.star, 1.5, 0.3);
    }],
    pleiades: ['The Pleiades', [[40, 38, 5], [58, 32, 4.4], [66, 50, 4], [50, 58, 5.4], [34, 62, 3.6], [62, 72, 3.4], [46, 82, 3]], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [3, 5], [5, 6]], function () {
      return halo(40, 38, 12, 0.8) + halo(58, 32, 10, 0.8) + halo(66, 50, 9, 0.8) + halo(50, 58, 12, 0.8);
    }],
    lantern: ['The Lantern', [[50, 16, 3], [34, 34, 3.6], [66, 34, 3.6], [30, 60, 3.6], [70, 60, 3.6], [38, 84, 3.6], [62, 84, 3.6], [50, 58, 7]], [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 6], [3, 4]], function () { return halo(50, 58, 22, 1); }],
    firefly: ['The Firefly', [[50, 54, 8], [20, 88, 2.4], [78, 26, 3], [16, 34, 2.6], [84, 78, 2.6], [30, 22, 2]], [], function () {
      return halo(50, 54, 26, 1) + '<path d="M20 90Q26 60 44 68T56 38Q60 24 76 28" fill="none" stroke="#fff" stroke-width="1" stroke-dasharray="3 3" stroke-linecap="round" opacity=".8"/>' +
        '<ellipse cx="42" cy="46" rx="8" ry="4" transform="rotate(-28 42 46)" fill="#fff" opacity=".35"/><ellipse cx="58" cy="46" rx="8" ry="4" transform="rotate(28 58 46)" fill="#fff" opacity=".35"/>';
    }]
  };
  var CONBG = { polaris: '#1E2468', gemini: '#3B2A7A', twin_kites: '#17456F', orions_belt: '#20305F', milky_way: '#3A2360', teapot: '#1D4A55', little_house: '#4A2B5E', southern_cross: '#182F73', comet: '#123B5B', pleiades: '#2E2A7A', lantern: '#5A2B4A', firefly: '#1C4A3C' };
  art.constellationSVG = function (id, opts) {
    var K = CON[id] || [String(id), [[50, 50, 8]], []];
    var seed = 'con' + id, r = rngFor(seed), s = cardBase(seed, CONBG[id] || '#1E2468', { dark: true });
    // faint background dust
    for (var i = 0; i < 12; i++) s += circ(10 + r() * 80, 10 + r() * 92, 0.5 + r() * 0.7, '#fff', { rim: false, opacity: 0.25 + r() * 0.3 });
    if (K[3]) s += K[3](rngFor(seed + 'x'));
    var stars = K[1], lines = K[2] || [];
    if (lines.length) {
      var d = '';
      lines.forEach(function (l) { d += 'M' + stars[l[0]][0] + ' ' + stars[l[0]][1] + 'L' + stars[l[1]][0] + ' ' + stars[l[1]][1]; });
      s += '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="1" stroke-dasharray="2.6 2.6" stroke-linecap="round" opacity=".85"/>';
    }
    stars.forEach(function (p, i) { s += star5(p[0], p[1], p[2], C.star, (i * 17) % 36 - 10, { rw: 0.6 }); });
    s += sparkle(88, 14, 3, '#fff', { w: 1, opacity: 0.7 }) + sparkle(12, 100, 2.4, '#fff', { w: 1, opacity: 0.6 });
    s += label(K[0], '#F3EAD3', K[0].length > 15 ? 106 : 111, seed, { rot: -1 });
    return wrap(s, opts, 'ma-constellation-svg');
  };
  art.constellationIds = function () { return Object.keys(CON); };

  /* ================================================================== VISITORS */
  function cloudD(cx, cy, s) {
    var u = [[-0.75, 0.28], null];
    function T(x, y) { return f(cx + x * s) + ' ' + f(cy + y * s); }
    return 'M' + T(-0.75, 0.28) + 'C' + T(-1.08, 0.28) + ' ' + T(-1.12, -0.12) + ' ' + T(-0.8, -0.18) + 'C' + T(-0.86, -0.56) + ' ' + T(-0.34, -0.72) + ' ' + T(-0.14, -0.46) + 'C' + T(0.06, -0.78) + ' ' + T(0.62, -0.66) + ' ' + T(0.64, -0.26) + 'C' + T(1.08, -0.3) + ' ' + T(1.16, 0.28) + ' ' + T(0.8, 0.28) + 'Z';
  }
  function cloud(cx, cy, s, fill) { return P(cloudD(cx, cy, s), fill, { rw: 1.3 }); }
  function drop(x, y, s, col) { return '<path d="M' + f(x) + ' ' + f(y - s) + 'Q' + f(x + s * 0.9) + ' ' + f(y + s * 0.2) + ' ' + f(x) + ' ' + f(y + s * 0.8) + 'Q' + f(x - s * 0.9) + ' ' + f(y + s * 0.2) + ' ' + f(x) + ' ' + f(y - s) + 'Z" fill="' + col + '" stroke="' + C.rim + '" stroke-width=".8" paint-order="stroke"/>'; }
  function leafShape(x, y, s, rot, col) { return G(P('M0 -1C.95 -.5 .85 .55 0 1C-.85 .55 -.95 -.5 0 -1Z', col, { rw: 1.1 / s }) + '<path d="M0 .8V-.6" stroke="#fff" stroke-width="' + f2(0.9 / s) + '" opacity=".6"/>', x, y, rot, s); }

  var BOSS = {
    the_rain: ['#3B4A8C', function () {
      var s = drop(40, 88, 7, '#7FB2F0') + drop(60, 96, 7, '#7FB2F0') + drop(80, 86, 6, '#7FB2F0') + drop(50, 78, 5, '#A8CCF6') + drop(70, 74, 5, '#A8CCF6');
      s += cloud(60, 54, 44, '#B7C2E0') + face(60, 52, 22, 'sad');
      return s;
    }],
    the_frost: ['#5E9FD8', function () {
      var s = '', i, arm = '';
      for (i = 0; i < 6; i++) { var a = i / 6 * 6.28318, c = Math.cos(a), sn = Math.sin(a);
        arm += 'M60 62L' + f(60 + c * 40) + ' ' + f(62 + sn * 40);
        [0.55, 0.78].forEach(function (t) { var bx = 60 + c * 40 * t, by = 62 + sn * 40 * t; arm += 'M' + f(bx) + ' ' + f(by) + 'L' + f(bx + Math.cos(a + 0.8) * 9) + ' ' + f(by + Math.sin(a + 0.8) * 9) + 'M' + f(bx) + ' ' + f(by) + 'L' + f(bx + Math.cos(a - 0.8) * 9) + ' ' + f(by + Math.sin(a - 0.8) * 9); });
      }
      s += '<path d="' + arm + '" stroke="#FFFDF6" stroke-width="4.4" stroke-linecap="round" fill="none"/><path d="' + arm + '" stroke="#DDEFFC" stroke-width="2.2" stroke-linecap="round" fill="none"/>';
      return s + circ(60, 62, 16, '#F3F9FF', { rw: 1.2 }) + face(60, 63, 15, 'idle') + sparkle(22, 24, 4, '#fff', { w: 1.4 }) + sparkle(98, 100, 3.4, '#fff', { w: 1.4 });
    }],
    the_clouds: ['#2A3070', function () {
      return star5(60, 34, 12, C.star, 0, { rw: 1.1 }) + cloud(42, 68, 34, '#8E96BE') + face(40, 66, 17, 'grumpy', { noBlush: false }) + cloud(80, 52, 30, '#A5ACD0') + face(80, 51, 14, 'grumpy') + stroke('M20 96q6 6 0 12M100 96q4 6 0 10', '#fff', 1, { opacity: 0.4 });
    }],
    the_owl: ['#2F3A96', function () {
      return circ(94, 26, 10, C.paper, { rw: 1.1 }) + line(14, 100, 106, 100, '#7A5231', 5) +
        P('M26 40L28 16L46 28Q60 24 74 28L92 16L94 40Q98 52 94 62Q96 90 78 100H42Q24 90 26 62Q22 52 26 40Z', '#8B5E3C', { rw: 1.3 }) +
        P('M44 76Q60 68 76 76Q76 94 60 100Q44 94 44 76Z', '#E8C89A', { rw: 0.9 }) +
        circ(44, 48, 15, '#FFFDF6', { rw: 1 }) + circ(76, 48, 15, '#FFFDF6', { rw: 1 }) + circ(44, 50, 8, C.black, { rim: false }) + circ(76, 50, 8, C.black, { rim: false }) + circ(47, 46, 2.8, '#fff', { rim: false }) + circ(79, 46, 2.8, '#fff', { rim: false }) +
        P('M54 58L60 70L66 58Z', C.window, { rw: 0.9 }) + circ(34, 62, 4, C.blush, { rim: false, opacity: 0.7 }) + circ(86, 62, 4, C.blush, { rim: false, opacity: 0.7 });
    }],
    the_fog: ['#6B78AA', function () {
      var w = function (y, x0, x1, fill) { return P('M' + x0 + ' ' + y + 'Q' + (x0 + 14) + ' ' + (y - 12) + ' ' + (x0 + 30) + ' ' + (y - 4) + 'T' + (x0 + 60) + ' ' + (y - 4) + 'T' + x1 + ' ' + y + 'Q' + (x1 + 6) + ' ' + (y + 10) + ' ' + (x1 - 10) + ' ' + (y + 12) + 'H' + (x0 + 10) + 'Q' + (x0 - 8) + ' ' + (y + 12) + ' ' + x0 + ' ' + y + 'Z', fill, { rw: 1.2 }); };
      return w(40, 14, 100, '#D7DCF0') + w(66, 22, 108, '#C0C8E6') + face(60, 62, 18, 'sleepy') + w(92, 12, 98, '#D7DCF0') + stroke('M20 26q6-5 12 0t12 0', '#fff', 1.6, { opacity: 0.7 }) + stroke('M74 100q6-5 12 0', '#fff', 1.4, { opacity: 0.6 });
    }],
    the_wind: ['#3EA2B4', function () {
      return stroke('M22 44Q60 30 84 44Q98 54 84 64Q72 70 66 60', '#FFFDF6', 6, {}) + stroke('M22 44Q60 30 84 44Q98 54 84 64Q72 70 66 60', '#DFF4F6', 3.4) +
        stroke('M18 70Q52 60 74 74Q86 84 74 92', '#FFFDF6', 5.4) + stroke('M18 70Q52 60 74 74Q86 84 74 92', '#DFF4F6', 3) +
        leafShape(94, 36, 8, 50, '#6CBF5E') + leafShape(30, 92, 8, -40, '#F2A65A') + leafShape(84, 96, 7, 110, '#3E8E4E') + leafShape(20, 26, 6, 20, '#F2C64B');
    }],
    the_draft: ['#2A3584', function () {
      return P('M28 22H78V102H28Z', '#EFE3C4', { rw: 1.2 }) + rect(33, 27, 40, 70, C.window, { rim: false }) + '<path d="M33 27L52 32V92L33 97Z" fill="#FFF3B0" opacity=".8"/><path d="M33 27L52 32V92L33 97Z" fill="none" stroke="#EFE3C4" stroke-width="2.6"/>' +
        P('M73 27Q98 34 100 52Q94 62 104 72Q92 84 76 78Q68 60 73 27Z', C.curtain, { rw: 1.1 }) + stroke('M90 40Q94 52 90 66', '#fff', 1, { opacity: 0.5 }) +
        stroke('M6 44H24M10 58H26M4 72H22', '#fff', 2.2, { opacity: 0.85 }) + stroke('M84 96q6-4 12 0t10 0', '#fff', 1.6, { opacity: 0.6 });
    }],
    the_dog: ['#7FCBB4', function () {
      return P('M28 42Q10 44 14 76Q26 82 36 64Z', '#8B5E3C', { rw: 1.1 }) + P('M92 42Q110 44 106 76Q94 82 84 64Z', '#8B5E3C', { rw: 1.1 }) + circ(60, 60, 34, '#C98A5A', { rw: 1.3 }) +
        ell(60, 74, 17, 13, '#F3E3C4', { rw: 0.9 }) + P('M52 66Q60 62 68 66Q66 74 60 76Q54 74 52 66Z', C.black, { rw: 0.6 }) + P('M54 82Q60 96 66 82Q60 86 54 82Z', '#F07A92', { rw: 0.8 }) +
        circ(46, 52, 5, C.black, { rim: false }) + circ(74, 52, 5, C.black, { rim: false }) + circ(47.6, 50.4, 1.8, '#fff', { rim: false }) + circ(75.6, 50.4, 1.8, '#fff', { rim: false }) + circ(36, 66, 4, C.blush, { rim: false, opacity: 0.8 }) + circ(84, 66, 4, C.blush, { rim: false, opacity: 0.8 }) +
        stroke('M42 42q4-3 8 0M70 42q4-3 8 0', C.black, 1.6) + stroke('M106 28q6 4 4 10M12 30q-6 4-4 10', '#fff', 1.6, { opacity: 0.8 });
    }],
    the_clock: ['#3B4A8C', function () {
      var bell = function (x, y, rot) { return G(P('M-13 5Q-13 -9 0 -9Q13 -9 13 5Z', '#F2C64B', { rw: 1.1 }), x, y, rot); };
      return bell(34, 24, -30) + bell(86, 24, 30) + stroke('M30 96L24 106M90 96L96 106', '#B9773F', 4) + circ(60, 64, 36, '#E8795A', { rw: 1.3 }) + circ(60, 64, 28, '#FFFDF6', { rw: 1 }) + dashes(60, 64, 22, 26, 12, '#2A2250', 1.6, 0) +
        stroke('M60 64V46M60 64L73 72', '#2A2250', 3) + circ(60, 64, 3, '#E8795A', { rim: false }) + stroke('M12 42q-5 8 0 16M108 42q5 8 0 16M6 36q-8 14 0 28M114 36q8 14 0 28', '#fff', 1.8, { opacity: 0.85 });
    }],
    the_hush: ['#3A3F8E', function () {
      var moon = crescentD(60, 60, 40, -8);
      return '<path d="' + moon + '" fill="' + C.paper + '" stroke="' + C.rim + '" stroke-width="1.3" stroke-linejoin="round" paint-order="stroke"/><path d="' + moon + '" fill="url(#ma-graph-l)"/>' +
        face(36, 62, 9.5, 'sleepy', { noBlush: false }) + rect(37.8, 66, 4.6, 14, C.skin, { rw: 0.8, r: 2.3 }) + text(90, 36, 'shh', 17, '#F5CD55') + text(84, 96, 'z', 15, '#fff', { extra: 'opacity=".8"' }) + text(96, 84, 'z', 11, '#fff', { extra: 'opacity=".7"' }) + star5(24, 26, 4, C.star, 0) + sparkle(100, 60, 3, '#fff', { w: 1.2 });
    }],
    daybreak: ['#F5B79A', function () {
      var s = '', i, rays = '';
      for (i = 0; i < 11; i++) { var a = Math.PI + (i + 0.5) / 11 * Math.PI, c = Math.cos(a), sn = Math.sin(a); rays += 'M' + f(60 + c * 30) + ' ' + f(80 + sn * 30) + 'L' + f(60 + c * (i % 2 ? 38 : 42)) + ' ' + f(80 + sn * (i % 2 ? 38 : 42)); }
      s += '<path d="' + rays + '" stroke="' + C.rim + '" stroke-width="7.4" stroke-linecap="round" fill="none"/><path d="' + rays + '" stroke="' + C.sun + '" stroke-width="5.6" stroke-linecap="round" fill="none"/>';
      s += '<path d="M36 80A24 24 0 0 1 84 80Z" fill="' + C.sun + '" stroke="' + C.rim + '" stroke-width="1.2" paint-order="stroke"/>' + face(60, 70, 15, 'happy');
      s += '<path d="M6 82Q20 76 34 82T62 80T90 82T114 78V120H6Z" fill="#EE8FA4" stroke="' + C.rim + '" stroke-width="1.2" paint-order="stroke"/>' + stroke('M20 92q8-4 16 0t16 0M64 100q8-4 16 0', '#F8B9C6', 1.6, { opacity: 0.9 });
      return s + sparkle(24, 40, 3, '#fff', { w: 1.3 }) + sparkle(98, 34, 3, '#fff', { w: 1.3 }) + star5(96, 56, 3, '#fff', 0, { rim: false, opacity: 0.8 });
    }]
  };
  art.bossSVG = function (id, size) {
    size = size || 120;
    var B = BOSS[id] || ['#3B4A8C', function () { return face(60, 60, 26, 'idle'); }];
    var seed = 'boss' + id, dark = isDark(B[0]);
    var s = '<path d="' + blobD(60, 60, 55, seed + 'r', 0.035, 44) + '" transform="translate(3 3.6)" fill="#120C30" fill-opacity=".4"/>' +
      '<path d="' + blobD(60, 60, 55, seed + 'r', 0.035, 44) + '" fill="' + C.rim + '"/>' +
      '<path d="' + blobD(60, 60, 52.6, seed + 'p', 0.028, 44) + '" fill="' + B[0] + '" filter="url(#' + (dark ? 'ma-grain-l' : 'ma-grain') + ')"/>';
    s += B[1]();
    s = bake(s);
    return '<svg class="ma-svg ma-boss-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="' + size + '" height="' + size + '" style="overflow:visible" aria-hidden="true" focusable="false">' + s + '</svg>';
  };
  art.bossIds = function () { return Object.keys(BOSS); };

  /* ================================================================== PACKS */
  art.packSVG = function (kind, opts) {
    opts = opts || {};
    var o = { w: opts.w != null ? opts.w : 120, h: opts.h != null ? opts.h : 150 };
    var col = { envelope: '#F0DDC2', starchart: '#2A3584', keepsakebox: '#CDE6DA' }[kind] || '#F0DDC2';
    var name = { envelope: 'Envelope Bundle', starchart: 'Star Chart', keepsakebox: 'Keepsake Box' }[kind] || 'Pack';
    var seed = 'pack' + kind, rimD = tornPath(96, 121, seed + 'r', 2.2), papD = tornPath(93, 118, seed + 'p', 1.8);
    var s = '<path d="' + rimD + '" transform="translate(3.6 3.9)" fill="#120C30" fill-opacity=".4"/><path d="' + rimD + '" transform="translate(1 1)" fill="' + C.rim + '"/><path d="' + papD + '" transform="translate(2.6 2.6)" fill="' + col + '" filter="url(#' + (kind === 'starchart' ? 'ma-grain-l' : 'ma-grain') + ')"/>';
    if (kind === 'envelope') {
      s += envelopeRot(14, 44, 60, 38, '#E9B8B0', -14, false) + envelopeRot(26, 32, 60, 38, '#BFE0D8', 12, false) + envelopeRot(20, 24, 62, 40, '#FFFDF6', -2, true);
      s += '<path d="M46 14V84" stroke="#D9473F" stroke-width="2.4" stroke-dasharray="4 2.2" fill="none"/>' + P('M46 50L34 42L36 56Z', '#D9473F', { rw: 0.8 }) + P('M46 50L58 42L56 56Z', '#D9473F', { rw: 0.8 }) + circ(46, 50, 3, '#B8323A', { rw: 0.7 });
      s += glint(84, 20, 5, '#fff', { opacity: 0.9 });
    } else if (kind === 'starchart') {
      s += P('M14 16H86V88H14Z', '#1B2266', { rw: 1.2 }) + '<path d="M14 16H86V88H14Z" fill="none" stroke="#5B66C4" stroke-width=".7" stroke-dasharray="2 2"/>';
      [[26, 30, 4], [44, 26, 3], [58, 40, 4.4], [72, 30, 3], [34, 56, 3.4], [50, 66, 4], [70, 62, 3.4], [22, 76, 2.6]].forEach(function (p, i) { s += star5(p[0], p[1], p[2], C.star, i * 15, { rw: 0.6 }); });
      s += '<path d="M26 30L44 26L58 40L72 30M34 56L50 66L70 62M58 40L50 66" stroke="#fff" stroke-width=".8" stroke-dasharray="2.4 2.4" fill="none" opacity=".8"/>';
      s += '<circle cx="76" cy="76" r="9" fill="none" stroke="#fff" stroke-width=".8" opacity=".7"/><path d="M76 66V86M66 76H86" stroke="#fff" stroke-width=".7" opacity=".7"/><path d="M76 68L78 76L76 84L74 76Z" fill="#E8795A"/>';
      s += stroke('M46 88L38 100M54 88L62 100', '#F2C64B', 2.4) + P('M50 88L40 82L42 96Z', '#F2C64B', { rw: 0.8 }) + P('M50 88L60 82L58 96Z', '#F2C64B', { rw: 0.8 }) + circ(50, 88, 3, '#E0A91F', { rw: 0.7 });
    } else {
      s += P('M16 46H84V92H16Z', '#D8A76B', { rw: 1.2 }) + P('M12 32H88V48H12Z', '#C98B4E', { rw: 1.2 }) + stroke('M20 58V84M30 58V84', '#B9773F', 1, { opacity: 0.6 }) +
        '<path d="M44 32H56V92H44Z" fill="#F29AA8"/>' + P('M50 32L38 22L40 36Z', '#F29AA8', { rw: 0.8 }) + P('M50 32L62 22L60 36Z', '#F29AA8', { rw: 0.8 }) + circ(50, 32, 3, '#E8707F', { rw: 0.7 }) +
        star5(28, 70, 8, C.star, -8, { rw: 0.9 }) + suitCut('leaf', 72, 70, 7, { rot: 30, rw: 0.9 }) + glint(84, 16, 5, '#fff', { opacity: 0.9 }) + glint(14, 22, 3.6, '#fff', { opacity: 0.8 });
    }
    s += label(name, kind === 'starchart' ? '#F2C64B' : '#F29AA8', 100, seed, { rot: -1 });
    return wrap(s, o, 'ma-pack-svg ma-pack-' + kind, '0 0 100 125');
  };
  art.packIds = function () { return ['envelope', 'starchart', 'keepsakebox']; };

  art.version = 1;
})(typeof window !== 'undefined' ? window : globalThis);
