/* Midnight Airmail — MA.scene
   The living paper-collage backdrop (#scene): torn sky bands, twinkling paper stars, a graph-paper moon
   that waxes with every Send, a smiling paper sun, and a sleeping town whose windows light up as the
   round score climbs. Depends on MA.art (call-time only). Coordinates given to flyPlane are viewport
   (client) pixels.

   Performance: #scene is split into layers so that nothing big repaints every frame —
     .ma-l-sky    static  (sky bands, dawn glow, decorative planes)
     .ma-l-stars  only ~12 stars twinkle (filter-free)
     .ma-l-front  static  (moon, town)      — repaints only when the moon phase / windows change
     .ma-sun      own div, 3 tiny svgs animated with CSS transforms (composited)
     .ma-cat      tiny svg (tail sway)
     .ma-l-fx     sparkle bursts
   Grain is a pre-baked pattern (MA.art.defs: #ma-gp-d / #ma-gp-l), never a live filter. */
(function (root) {
  'use strict';
  var MA = root.MA = root.MA || {};
  var scene = MA.scene = MA.scene || {};
  var doc = root.document;

  var S = {
    el: null, W: 0, H: 0, moon: 0, moonHidden: false, progress: 0, mood: 'idle', dawn: 0, sunR: 60, sunLayout: null,
    wins: [], order: [], lit: 0, flyLayer: null, resizeT: 0, bound: false
  };
  var COL = { s1: '#1B1E5B', s2: '#222A70', s3: '#2A3584', s4: '#33409A', peach: '#F3A58F', rose: '#B85E8E' };

  function A() { return MA.art; }
  function H() { return MA.art.h; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function f(n) { return Math.round(n * 10) / 10; }
  function reduced() { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function hex2rgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) {
    var x = hex2rgb(a), y = hex2rgb(b);
    return '#' + [0, 1, 2].map(function (i) { var v = Math.round(x[i] + (y[i] - x[i]) * t); return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  }
  function q(sel) { return S.el ? S.el.querySelector(sel) : null; }
  function baked() { return !!(A() && A().grainBaked); }
  function grainOver(d, extra) { // dark + light grain overlays for a path (pattern fills, or nothing if canvas is unavailable)
    return baked() ? '<path d="' + d + '" fill="url(#ma-gp-d)"' + (extra || '') + '/>' : '';
  }
  function svgOpen(cls, W, Hh, extra) {
    return '<svg class="ma-layer ' + cls + '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f(W) + ' ' + f(Hh) + '" width="' + f(W) + '" height="' + f(Hh) + '" preserveAspectRatio="none" aria-hidden="true"' + (extra || '') + '>';
  }

  /* ---------------------------------------------------------------- measuring the UI so the scenery fits the gaps */
  function rectOf(id) { var e = doc && doc.getElementById(id); if (!e) return null; var r = e.getBoundingClientRect(); return (r.width || r.height) ? r : null; }
  function measure(W, Hh) {
    var m = { topBottom: 0, gapL: null, gapR: null, stage: null, sillTop: null };
    var tr = doc && doc.getElementById('top-row');
    if (tr) {
      var r = tr.getBoundingClientRect();
      if (r.height) {
        var cs = root.getComputedStyle(tr), cw = parseFloat(cs.getPropertyValue('--card-w')) || 96, g = cw * 0.11;
        m.topBottom = r.bottom;
        m.gapL = r.left + (parseFloat(cs.paddingLeft) || 0) + 5 * cw + 4 * g + 10;
        m.gapR = r.right - (parseFloat(cs.paddingRight) || 0) - (2 * cw + g) - 10;
      }
    }
    var st = rectOf('stage'); if (st) m.stage = { l: st.left - 6, r: st.right + 6, t: st.top - 6, b: st.bottom + 6 };
    var sill = rectOf('hand-area'); if (sill) m.sillTop = sill.top;
    return m;
  }

  /* ---------------------------------------------------------------- torn horizontal band */
  function bandPath(W, top, amp, seed, jit, lift) {
    var r = H().rngFor('band|' + seed), ph = r() * 6, ph2 = r() * 6, k1 = 2 + r() * 2, k2 = 9 + r() * 5, pts = [], step = 7, x;
    for (x = -20; x <= W + 20; x += step) {
      var y = top + amp * Math.sin(x / W * k1 * 3.14 + ph) + amp * 0.35 * Math.sin(x / W * k2 * 3.14 + ph2) + (r() - 0.5) * jit - (lift || 0);
      if (r() < 0.05) y += (r() - 0.5) * jit * 3;
      pts.push([x, y]);
    }
    return pts;
  }
  function bandD(pts, bottom) {
    return 'M' + pts.map(function (p) { return f(p[0]) + ' ' + f(p[1]); }).join('L') + 'L' + f(pts[pts.length - 1][0]) + ' ' + bottom + 'L' + f(pts[0][0]) + ' ' + bottom + 'Z';
  }

  /* ---------------------------------------------------------------- small pieces */
  function starG(x, y, R, rot, cls, delay, dur) {
    var inner = H().star5(0, 0, R, '#F5CD55', rot, { rw: 0.9 });
    return '<g transform="translate(' + f(x) + ' ' + f(y) + ')">' + (cls ? '<g class="' + cls + '" style="animation-delay:' + delay + 's;animation-duration:' + dur + 's">' + inner + '</g>' : inner) + '</g>';
  }
  function plusG(x, y, r, cls, delay) {
    var inner = '<path d="M' + -r + ' 0H' + r + 'M0 ' + -r + 'V' + r + '" stroke="#F3EAD3" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".85"/>';
    return '<g transform="translate(' + f(x) + ' ' + f(y) + ')">' + (cls ? '<g class="' + cls + '" style="animation-delay:' + delay + 's;animation-duration:4.2s">' + inner + '</g>' : inner) + '</g>';
  }
  function planeShapes(tex) {
    var s = A().planeSVG(66).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    if (tex) s += '<path d="M4 5L62 20L26 22Z" fill="url(#' + tex + ')" opacity=".9"/>';
    return s;
  }

  /* ---------------------------------------------------------------- moon (lit on the LEFT, like the reference crescent) */
  var MOON_K = { 1: 0.66, 2: -0.1, 3: -0.55 };
  function moonPoly(R, kx, seed, jit) {
    var r = H().rngFor('moon|' + seed), pts = [], a;
    for (a = 270; a >= 90; a -= 8) { var rr = R + (r() - 0.5) * jit, t = a * Math.PI / 180; pts.push([Math.cos(t) * rr, Math.sin(t) * rr]); }
    for (a = 98; a <= 262; a += 8) { var t2 = a * Math.PI / 180, j = (r() - 0.5) * jit; pts.push([Math.cos(t2) * kx * R + j, Math.sin(t2) * R]); }
    return H().polyD(pts);
  }
  function moonDiscPoly(R, seed, jit) {
    var r = H().rngFor('moondisc|' + seed), pts = [], a;
    for (a = 0; a < 360; a += 8) { var rr = R + (r() - 0.5) * jit, t = a * Math.PI / 180; pts.push([Math.cos(t) * rr, Math.sin(t) * rr]); }
    return H().polyD(pts);
  }
  function moonLit(R, phase) {
    if (phase <= 0) return '';
    if (phase >= 4) return moonDiscPoly(R, 'full', 2.4);
    return moonPoly(R, MOON_K[phase], 'p' + phase, 2.4);
  }
  function buildMoon(mx, my, R, dy) {
    var s = '<g class="ma-moon-clip" clip-path="url(#ma-horizon)"><g class="ma-moon-sink" data-dy="' + f(dy) + '" style="transition:transform 1s ease-in-out"><g id="ma-moon" transform="translate(' + f(mx) + ' ' + f(my) + ')">';
    s += '<circle class="ma-moon-halo" r="' + f(R * 2.6) + '" fill="url(#ma-halo)" opacity="0"/>';
    s += '<g class="ma-moon-body" data-r="' + f(R) + '" transform="rotate(-22)" style="transform-box:fill-box;transform-origin:50% 50%">';
    s += '<path class="ma-moon-dark" d="' + moonDiscPoly(R, 'dark', 2.4) + '" fill="#2C3690" opacity=".6"/>';
    s += '<path class="ma-moon-shadow" d="" transform="translate(2 3)" fill="#0F1140" opacity=".35"/>';
    s += '<path class="ma-moon-lit" d="" fill="#F3EAD3" stroke="#FFFDF6" stroke-width="2" stroke-linejoin="round" paint-order="stroke"/>';
    s += '<path class="ma-moon-grid" d="" fill="url(#ma-graph-l)"/>';
    s += '</g>';
    s += '<g class="ma-moon-clouds" opacity="0" style="transition:opacity .8s">' +
      H().P('M' + f(-R * 1.5) + ' ' + f(R * 0.6) + 'C' + f(-R * 1.9) + ' ' + f(R * 0.6) + ' ' + f(-R * 1.9) + ' ' + f(-R * 0.1) + ' ' + f(-R * 1.4) + ' ' + f(-R * 0.1) + 'C' + f(-R * 1.4) + ' ' + f(-R * 0.9) + ' ' + f(-R * 0.4) + ' ' + f(-R * 0.9) + ' ' + f(-R * 0.3) + ' ' + f(-R * 0.3) + 'C' + f(R * 0.4) + ' ' + f(-R * 0.7) + ' ' + f(R * 1) + ' ' + f(-R * 0.2) + ' ' + f(R * 0.9) + ' ' + f(R * 0.4) + 'C' + f(R * 1.5) + ' ' + f(R * 0.5) + ' ' + f(R * 1.3) + ' ' + f(R * 1) + ' ' + f(R * 0.8) + ' ' + f(R * 0.9) + 'L' + f(-R * 1.1) + ' ' + f(R * 0.9) + 'Z', '#7B84B4', { rw: 1.6 }) +
      '</g></g></g></g>';
    return s;
  }

  /* ---------------------------------------------------------------- the sun: fat ragged torn-paper rays */
  function rayPoly(R, ang, len, rng, grow) {
    var r0 = R * 0.08, wb = R * 0.19 / 2 + grow, wt = R * 0.21 / 2 + grow, dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx, L = [], Rr = [], k, n = 9;
    var capC = len - wt, i;
    function jit() { return (rng() - 0.5) * R * 0.026; }
    for (k = 0; k <= n; k++) {
      var t = k / n, d = r0 + (capC - r0) * t, hw = wb + (wt - wb) * t;
      L.push([dx * d + px * (hw + jit()), dy * d + py * (hw + jit())]);
      Rr.push([dx * d - px * (hw + jit()), dy * d - py * (hw + jit())]);
    }
    // rounded tip, built directly in world coords
    var tip = [];
    for (i = 1; i < 8; i++) { var b = i / 8 * Math.PI; // 0 = left side, PI = right side, through the outward direction
      var along = Math.sin(b) * (wt + jit() * 0.5), perp = Math.cos(b) * (wt + jit() * 0.3);
      tip.push([dx * (capC + along) + px * perp, dy * (capC + along) + py * perp]); }
    return L.concat(tip, Rr.reverse());
  }
  function sunBuild(R) {
    var r = H().rngFor('sun'), rays = '', rims = '', i, rng2 = H().rngFor('sunrim');
    for (i = 0; i < 12; i++) {
      var ang = i / 12 * 6.28318 - 1.5708 + (r() - 0.5) * 0.105, len = R * (i % 2 ? 0.8 : 1) * (1 + (r() - 0.5) * 0.08);
      rays += H().polyD(rayPoly(R, ang, len, r, 0));
      rims += H().polyD(rayPoly(R, ang, len + R * 0.02, rng2, R * 0.03));
    }
    var pad = R * 1.3, disc = (function () { var rr = H().rngFor('sundisc'), p = [], a; for (a = 0; a < 360; a += 12) { var q2 = R * 0.34 * (1 + (rr() - 0.5) * 0.06), t = a * Math.PI / 180; p.push([Math.cos(t) * q2, Math.sin(t) * q2]); } return H().polyD(p); })();
    var vb = ' viewBox="' + f(-pad) + ' ' + f(-pad) + ' ' + f(pad * 2) + ' ' + f(pad * 2) + '"';
    var raysSvg = '<svg class="ma-sun-rays" xmlns="http://www.w3.org/2000/svg"' + vb + ' aria-hidden="true">' +
      '<path d="' + rims + '" fill="#FFFDF6" opacity=".96"/><path d="' + rays + '" fill="#E8795A"/>' + grainOver(rays) + 
      '<path d="' + disc + '" fill="#E8795A"/>' + grainOver(disc) + (baked() ? '<path d="' + rays + '" fill="url(#ma-gp-l)" opacity=".4"/>' : '') + '</svg>';
    var fs = R * 0.31, faces = '';
    ['idle', 'happy', 'wow', 'sleepy'].forEach(function (m) { faces += '<g class="ma-face ma-face-' + m + '" style="display:' + (m === S.mood ? 'inline' : 'none') + '">' + H().face(0, R * 0.02, fs, m) + '</g>'; });
    var faceSvg = '<svg class="ma-sun-face" xmlns="http://www.w3.org/2000/svg"' + vb + ' aria-hidden="true">' + faces + '</svg>';
    var shineSvg = '<svg class="ma-sun-shine" xmlns="http://www.w3.org/2000/svg"' + vb + ' aria-hidden="true">' + H().dashes(0, 0, R * 1.08, R * 1.22, 12, '#F5CD55', Math.max(2, R * 0.04), 0.26) + '</svg>';
    return raysSvg + shineSvg + faceSvg;
  }

  /* ---------------------------------------------------------------- the town */
  function buildTown(W, Hh, u, m, narrow) {
    var r = H().rngFor('town'), out = '', wins = [], tw = clamp(W * 0.30, 200, 460 * u), x0 = W - tw;
    var backCols = ['#171B4C', '#171B4C'], frontCols = ['#14173F', '#181C4A', '#111438'];
    var tex = ['ma-tex-hand', 'ma-tex-music', 'ma-tex-map', 'ma-tex-lines'];
    var yBot = Hh * 0.92, ww = 14 * u, wh = 18 * u, houses = [];
    var base = narrow ? 0.68 : 0.8;
    function house(x, w, k, backRow) {
      var apex = Hh * (base - 0.16 * k + (r() - 0.5) * 0.06) - (backRow ? Hh * 0.06 : 0);
      var eave = apex + w * (0.5 + r() * 0.15), bx = x, apexX = bx + w * (0.3 + r() * 0.4), fill = backRow ? backCols[Math.floor(r() * 2)] : frontCols[Math.floor(r() * frontCols.length)];
      var g = '<g class="ma-house">';
      // chimney first (it sits on the roof slope, the roof is drawn over its foot)
      if (r() < 0.55) {
        var cxp = bx + w * (r() < 0.5 ? 0.22 : 0.72), slope = cxp < apexX ? (eave - (eave - apex) * ((cxp - (bx - 4 * u)) / (apexX - (bx - 4 * u)))) : (apex + (eave - apex) * ((cxp - apexX) / (bx + w + 4 * u - apexX)));
        g += '<path d="M' + f(cxp) + ' ' + f(slope + 4 * u) + 'V' + f(slope - 14 * u) + 'H' + f(cxp + 9 * u) + 'V' + f(slope + 4 * u) + 'Z" fill="' + fill + '" stroke="#FFFDF6" stroke-opacity=".4" stroke-width="1" stroke-linejoin="round"/>';
      }
      var roofD = 'M' + f(bx - 4 * u) + ' ' + f(eave) + 'L' + f(apexX) + ' ' + f(apex) + 'L' + f(bx + w + 4 * u) + ' ' + f(eave) + 'Z';
      var bodyD = 'M' + f(bx) + ' ' + f(eave) + 'H' + f(bx + w) + 'V' + f(Hh + 12) + 'H' + f(bx) + 'Z';
      g += '<path d="' + bodyD + '" fill="' + fill + '" stroke="#FFFDF6" stroke-opacity=".5" stroke-width="1.3" stroke-linejoin="round"/>';
      g += '<path d="' + bodyD + '" fill="url(#' + tex[Math.floor(r() * tex.length)] + ')"/>';
      g += '<path d="' + roofD + '" fill="' + fill + '" stroke="#FFFDF6" stroke-opacity=".5" stroke-width="1.3" stroke-linejoin="round"/>';
      out += g + '</g>';
      // windows: rows under the eave down to yBot; back-row houses only get one row (front houses hide the rest)
      var gapX = 8 * u, cols = Math.max(1, Math.floor((w - 6 * u) / (ww + gapX))), rowGap = 14 * u, y = eave + 12 * u, rows = 0;
      var startX = bx + (w - (cols * ww + (cols - 1) * gapX)) / 2;
      for (; y + wh < yBot && rows < (backRow ? 1 : 6); y += wh + rowGap, rows++) {
        for (var c = 0; c < cols; c++) if (r() > 0.12) wins.push({ x: startX + c * (ww + gapX), y: y, w: ww, h: wh });
      }
      return { x: bx, w: w, apex: apex, apexX: apexX };
    }
    var x = W + 20 * u, i = 0, front = [];
    // back row first
    var bk = [];
    while (x > x0 - 40 * u) { var w = (64 + r() * 32) * u, k = clamp((x - w / 2 - x0) / tw, 0, 1); bk.push(house(x - w, w, k, true)); x -= w * (0.72 + r() * 0.16); }
    x = W + 6 * u;
    while (x > x0 - 20 * u) { var w2 = (64 + r() * 32) * u, k2 = clamp((x - w2 / 2 - x0) / tw, 0, 1); front.push(house(x - w2, w2, k2, false)); x -= w2 + (r() * 8 - 3) * u; }
    // cap the window count (~45) but keep at least 24
    while (wins.length > 45 && wins.length > 24) wins.splice(Math.floor(r() * wins.length), 1);
    var best = null; front.forEach(function (h) { if (h.apexX < W - 30 * u && (!best || h.apex < best.apex)) best = h; });
    var sillTop = m && m.sillTop ? m.sillTop : Hh * 0.84;
    var wr = H().rngFor('winorder'), keys = wins.map(function (w, idx) { return { i: idx, k: wr() + 0.9 * (w.y / Hh) + (w.y > sillTop - 6 ? 0.5 : 0) }; });
    keys.sort(function (a, b) { return a.k - b.k; });
    var rank = []; keys.forEach(function (kk, n) { rank[kk.i] = n; });
    var wg = '';
    wins.forEach(function (w, idx) {
      var cx = w.x + w.w / 2, cy = w.y + w.h / 2;
      wg += '<g class="ma-win" data-o="' + rank[idx] + '"><circle class="ma-wglow" cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(w.w * 1.9) + '" fill="url(#ma-wglow)"/>' +
        '<rect class="ma-pane" x="' + f(w.x) + '" y="' + f(w.y) + '" width="' + f(w.w) + '" height="' + f(w.h) + '" rx="1" fill="#3A4590" stroke="#0F1140" stroke-width="1"/>' +
        '<path class="ma-mull" d="M' + f(cx) + ' ' + f(w.y) + 'V' + f(w.y + w.h) + 'M' + f(w.x) + ' ' + f(cy) + 'H' + f(w.x + w.w) + '" stroke-width="' + f(1.6 * u) + '"/></g>';
    });
    S.wins = wins.map(function (w, idx) { return { x: w.x + w.w / 2, y: w.y + w.h / 2, o: rank[idx] }; });
    S.order = []; S.wins.forEach(function (w) { S.order[w.o] = w; });
    return { svg: '<g id="ma-town">' + out + wg + '</g>', cat: best ? { x: best.apexX, y: best.apex + 3 * u, h: 44 * u } : null };
  }

  /* ---------------------------------------------------------------- build */
  function build() {
    var el = S.el; if (!el) return;
    var W = el.clientWidth || root.innerWidth || 1200, Hh = el.clientHeight || root.innerHeight || 800;
    S.W = W; S.H = Hh;
    var u = clamp(Math.min(W / 1300, Hh / 900), 0.42, 1.25), narrow = W < 900;
    var m = measure(W, Hh), sbw = narrow ? 0 : clamp(W * 0.21, 240, 320);

    /* --- geometry of sun and moon from the measured UI --- */
    var capR = clamp(Math.min(W, Hh) * 0.115, 34, 100), sunR, sx, sy, gapW = (m.gapR != null) ? m.gapR - m.gapL : 0;
    if (!narrow && gapW >= 56) {                       // centred in the measured gap between keepsakes and consumables
      sunR = clamp(gapW / 2.4, 22, capR); sx = (m.gapL + m.gapR) / 2; sy = Math.max(sunR + 14, Hh * 0.15);
    } else {                                           // no room in the row: tuck it into the free right edge under the row
      sunR = clamp(Math.min(W, Hh) * 0.09, 26, 56); sx = narrow ? W * 0.58 : W - sunR * 1.4 - 10; sy = (m.topBottom || 200) + sunR * 1.3 + 8;
    }
    var moonR = clamp(Math.min(W, Hh) * 0.072, 26, 70), mx = narrow ? W * 0.17 : sbw + (W - sbw) * 0.085 + 44;
    var my = narrow ? Math.max(Hh * 0.42, (m.topBottom || 200) + moonR + 30) : Math.max(0.3 * Hh, (m.topBottom || 0) + moonR + 14);
    S.sunLayout = { x: sx, y: sy, r: sunR };

    /* --- layer 1: sky bands --- */
    var sky = svgOpen('ma-l-sky', W, Hh), bands = [[COL.s1, 0], [COL.s2, 0.38], [COL.s3, 0.58], [COL.s4, 0.76]], i;
    for (i = 0; i < bands.length; i++) {
      if (i === 0) { sky += '<rect class="ma-band ma-band0" width="' + f(W) + '" height="' + f(Hh) + '" fill="' + bands[i][0] + '"/>'; continue; }
      var top = Hh * bands[i][1], amp = Hh * (0.012 + 0.006 * (i % 2)), rim = bandPath(W, top, amp, 'r' + i, 3, 2), body = bandPath(W, top, amp, 'r' + i, 3.6, 0);
      sky += '<path d="' + bandD(body, Hh + 10) + '" transform="translate(1 -3.5)" fill="#0A0C38" opacity=".24"/>';
      sky += '<path d="' + bandD(rim, Hh + 10) + '" fill="#FFFDF6" opacity=".92"/>';
      sky += '<path class="ma-band ma-band' + i + '" d="' + bandD(body, Hh + 10) + '" fill="' + bands[i][0] + '"/>';
    }
    sky += '<ellipse class="ma-dawn" cx="' + f(W * 0.5) + '" cy="' + f(Hh * 0.98) + '" rx="' + f(W * 0.7) + '" ry="' + f(Hh * 0.4) + '" fill="url(#ma-dawn)" opacity="0"/>';
    var deco = [[W * 0.9, Hh * 0.27, -28, 86, 'ma-tex-hand', 'M-8 0Q-70 20 -96 120'], [W * 0.84, Hh * 0.44, 20, 66, 'ma-graph', 'M-6 4Q-60 40 -70 130'], [W * 0.58, Hh * 0.14, -14, 58, 'ma-graph', 'M-6 0Q-60 10 -100 70']], planes = '';
    deco.forEach(function (d, n) {
      planes += '<svg class="ma-plane-deco" xmlns="http://www.w3.org/2000/svg" viewBox="-160 -60 250 250" aria-hidden="true" style="left:' + f(d[0] - 160 * u) + 'px;top:' + f(d[1] - 60 * u) + 'px;width:' + f(250 * u) + 'px;height:' + f(250 * u) + 'px;animation-delay:' + (-n * 3.7) + 's;animation-duration:' + (10 + n * 2.5) + 's">' +
        '<g transform="rotate(' + d[2] + ')"><path d="' + d[5] + '" fill="none" stroke="#fff" stroke-width="1.8" stroke-dasharray="6 7" stroke-linecap="round" opacity=".8"/></g>' +
        '<g transform="rotate(' + (d[2] + 22) + ') scale(' + f(d[3] / 66) + ') translate(-33 -20)">' + planeShapes(d[4]) + '</g></svg>';
    });
    sky += '</svg>';

    /* --- layer 2: stars (filter-free; only ~12 twinkle) --- */
    var r = H().rngFor('stars'), placed = [], tries = 0, twn = 0, stars = svgOpen('ma-l-stars', W, Hh);
    while (placed.length < 34 && tries++ < 800) {
      var x = r() * W, y = r() * Hh * 0.62;
      if (Math.hypot(x - sx, y - sy) < sunR * 1.35 || Math.hypot(x - mx, y - my) < moonR * 1.6) continue;
      if (m.stage && x > m.stage.l && x < m.stage.r && y > m.stage.t && y < m.stage.b) continue;
      if (x > W * 0.6 && y > Hh * 0.5) continue;
      var ok = true; placed.forEach(function (p) { if (Math.hypot(p[0] - x, p[1] - y) < 46) ok = false; });
      if (ok) placed.push([x, y]);
    }
    placed.forEach(function (p, n) {
      var anim = (n % 3 === 0 && twn < 12) ? (twn++, 'ma-tw') : '';
      if (n % 4 === 3) stars += plusG(p[0], p[1], 3 + r() * 3, anim, f(r() * 4));
      else stars += starG(p[0], p[1], (n % 5 === 0 ? 8 : 4 + r() * 3.5) * u, f(r() * 60 - 30), anim, f(r() * 4), f(2.6 + r() * 3));
    });
    stars += '</svg>';

    /* --- layer 3: moon + town (static; repaints only on phase / window changes) --- */
    var town = buildTown(W, Hh, u, m, narrow);
    var hz = bandPath(W, Hh * bands[3][1], Hh * (0.012 + 0.006), 'r3', 3.6, 0);
    var clipD = 'M' + hz.map(function (p) { return f(p[0]) + ' ' + f(p[1]); }).join('L') + 'L' + f(hz[hz.length - 1][0]) + ' -60L' + f(hz[0][0]) + ' -60Z';
    S.moonPos = { x: mx, y: my, r: moonR };
    var front = svgOpen('ma-l-front', W, Hh) + '<defs><clipPath id="ma-horizon"><path d="' + clipD + '"/></clipPath></defs>' + buildMoon(mx, my, moonR, (Hh * bands[3][1] - my) + moonR * 3.2) + town.svg + '</svg>';

    /* --- sun: its own div with three small svgs --- */
    var sunBox = sunR * 2.6;
    var sun = '<div class="ma-sun" style="left:' + f(sx - sunBox / 2) + 'px;top:' + f(sy - sunBox / 2) + 'px;width:' + f(sunBox) + 'px;height:' + f(sunBox) + 'px">' + sunBuild(sunR) + '</div>';

    /* --- cat (tiny svg so its tail-sway repaints almost nothing) --- */
    var cat = '';
    if (town.cat) {
      var c = town.cat, cw = c.h * 1.15, ch = c.h * 1.15;
      cat = '<svg class="ma-cat" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f(cw) + ' ' + f(ch) + '" style="left:' + f(c.x - c.h * 0.4) + 'px;top:' + f(c.y - c.h * 1.05) + 'px;width:' + f(cw) + 'px;height:' + f(ch) + 'px" aria-hidden="true">' +
        H().cat(c.h * 0.4, c.h * 1.05, c.h, { tailCls: 'ma-tail', tailStyle: 'transform-origin:0.24px -0.05px', rw: 0.7 }) + '</svg>';
    }
    el.innerHTML = sky + planes + stars + front + sun + cat + svgOpen('ma-l-fx', W, Hh) + '<g class="ma-fx"></g></svg>';
    applyAll(true);
  }

  function applyAll(instant) {
    setMoon(S.moon, S.moonHidden, true, true);
    applyMood();
    applyLights(S.lit, true);
    applyDawn();
  }

  /* ---------------------------------------------------------------- state appliers */
  function setMoon(phase, hidden, instant, snap) {
    if (!S.el) return;
    var body = q('.ma-moon-body'); if (!body) return;
    var cloud = hidden === true || hidden === 'clouds', setting = hidden === 'set';
    var R = parseFloat(body.getAttribute('data-r')), d = moonLit(R, phase);
    q('.ma-moon-lit').setAttribute('d', d);
    q('.ma-moon-shadow').setAttribute('d', d);
    q('.ma-moon-grid').setAttribute('d', d);
    q('.ma-moon-dark').setAttribute('opacity', phase >= 4 ? '0' : phase === 0 ? '0.45' : '0.6');
    var halo = q('.ma-moon-halo');
    halo.style.transition = 'opacity .8s';
    halo.setAttribute('opacity', phase >= 4 && !cloud && !setting ? '1' : phase === 3 ? '0.35' : '0');
    q('.ma-moon-clouds').setAttribute('opacity', cloud ? '1' : '0');
    q('#ma-moon').style.opacity = cloud ? '0.95' : '1';
    var sink = q('.ma-moon-sink');
    if (sink) {
      var dy = parseFloat(sink.getAttribute('data-dy')) || 0;
      sink.style.transition = (snap || reduced()) ? 'none' : 'transform 1s ease-in-out';
      sink.style.transform = 'translate(0px,' + (setting ? f(dy) : 0) + 'px)';
    }
    if (!instant && !setting && body.animate && !reduced()) {
      body.animate([{ transform: 'rotate(-22deg) scale(.86)', opacity: 0.4 }, { transform: 'rotate(-22deg) scale(1.06)', opacity: 1, offset: 0.6 }, { transform: 'rotate(-22deg) scale(1)', opacity: 1 }], { duration: 650, easing: 'ease-out' });
    }
  }
  function applyMood() {
    if (!S.el) return;
    ['idle', 'happy', 'wow', 'sleepy'].forEach(function (m) {
      var g = q('.ma-face-' + m); if (g) g.style.display = m === S.mood ? 'inline' : 'none';
    });
  }
  function applyLights(n, instant) {
    if (!S.el) return;
    var nodes = S.el.querySelectorAll('.ma-win');
    for (var i = 0; i < nodes.length; i++) {
      var o = +nodes[i].getAttribute('data-o'), on = o < n, was = nodes[i].classList.contains('lit');
      if (on !== was) {
        nodes[i].style.transitionDelay = '0s';
        nodes[i].classList.toggle('lit', on);
        if (on && !instant && S.order[o]) burstAt(S.order[o].x, S.order[o].y, 5);
      }
    }
    S.lit = n;
  }
  function applyDawn() {
    if (!S.el) return;
    var t = clamp(S.dawn, 0, 1), b0 = q('.ma-band0'), b1 = q('.ma-band1'), b2 = q('.ma-band2'), b3 = q('.ma-band3'), g = q('.ma-dawn'), st = q('.ma-l-stars');
    if (b0) b0.setAttribute('fill', mix(COL.s1, '#4A3F94', t * 0.5));
    if (b1) b1.setAttribute('fill', mix(COL.s2, '#7A57A6', t * 0.55));
    if (b2) b2.setAttribute('fill', mix(COL.s3, '#CB6E9A', t * 0.72));
    if (b3) b3.setAttribute('fill', mix(COL.s4, '#F7B08E', t * 0.95));
    if (g) g.setAttribute('opacity', f(t * 0.95));
    if (st) { st.style.transition = 'opacity .8s'; st.style.opacity = f(1 - t * 0.6); }
  }
  function burstAt(x, y, n) {
    var fx = q('.ma-fx'); if (!fx || reduced()) return;
    var svgns = 'http://www.w3.org/2000/svg';
    for (var i = 0; i < n; i++) {
      var a = i / n * 6.28 + Math.random(), p = doc.createElementNS(svgns, 'path');
      p.setAttribute('d', 'M-2 0H2M0 -2V2'); p.setAttribute('stroke', i % 2 ? '#FFF3B0' : '#F5CD55'); p.setAttribute('stroke-width', '1.6'); p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('transform', 'translate(' + f(x) + ' ' + f(y) + ')');
      fx.appendChild(p);
      if (p.animate) {
        var an = p.animate([{ transform: 'translate(' + f(x) + 'px,' + f(y) + 'px) scale(1)', opacity: 1 }, { transform: 'translate(' + f(x + Math.cos(a) * 20) + 'px,' + f(y + Math.sin(a) * 20 - 6) + 'px) scale(.4)', opacity: 0 }], { duration: 700 + i * 60, easing: 'ease-out' });
        an.onfinish = (function (e) { return function () { if (e.parentNode) e.parentNode.removeChild(e); }; })(p);
      } else if (p.parentNode) p.parentNode.removeChild(p);
    }
  }

  /* ---------------------------------------------------------------- public API */
  scene.mount = function (el) {
    el = el || (doc && doc.getElementById('scene'));
    if (!el) return;
    if (MA.art && MA.art.ensureDefs) MA.art.ensureDefs();
    S.el = el;
    el.classList.add('ma-scene');
    build();
    if (!S.bound) {
      S.bound = true;
      root.addEventListener('resize', function () {
        clearTimeout(S.resizeT);
        S.resizeT = setTimeout(function () { if (S.el) build(); }, 180);
      });
      if (doc) doc.addEventListener('visibilitychange', function () { if (S.el) S.el.classList.toggle('ma-paused', !!doc.hidden); });
    }
    // fonts / UI layout may settle after first paint: re-measure once
    if (root.requestAnimationFrame) root.requestAnimationFrame(function () { root.requestAnimationFrame(function () { if (S.el) build(); }); });
  };
  scene.setMoonPhase = function (p, hidden) {
    /* hidden: false | true / 'clouds' (cloud cover, The Clouds) | 'set' (Daybreak: the moon sinks behind the horizon and stays down) */
    p = ((Math.round(p) % 5) + 5) % 5;
    hidden = hidden === 'set' ? 'set' : (hidden === true || hidden === 'clouds') ? 'clouds' : false;
    var changed = p !== S.moon;
    S.moon = p; S.moonHidden = hidden;
    setMoon(p, hidden, !changed, false);
  };
  /* ~0.8 s swell + halo pulse (the Full Moon moment) */
  scene.moonBurst = function () {
    var body = q('.ma-moon-body'), halo = q('.ma-moon-halo');
    if (!body || S.moonHidden === 'set') return;
    if (S.moonPos) burstAt(S.moonPos.x, S.moonPos.y, 8);
    if (reduced() || !body.animate) return;
    body.animate([{ transform: 'rotate(-22deg) scale(1)' }, { transform: 'rotate(-22deg) scale(1.3)', offset: 0.4 }, { transform: 'rotate(-22deg) scale(1)' }], { duration: 800, easing: 'ease-in-out' });
    if (halo && halo.animate) {
      halo.style.transformBox = 'fill-box'; halo.style.transformOrigin = '50% 50%';
      var cur = parseFloat(halo.getAttribute('opacity')) || 0;
      halo.animate([{ opacity: cur, transform: 'scale(1)' }, { opacity: 1, transform: 'scale(1.7)', offset: 0.4 }, { opacity: cur, transform: 'scale(1)' }], { duration: 800, easing: 'ease-in-out' });
    }
  };
  scene.setProgress = function (v) {
    v = +v || 0; S.progress = v;
    var N = S.wins.length, n = v >= 1 ? N : v <= 0 ? 0 : Math.max(1, Math.floor(v * N));
    applyLights(n, false);
  };
  scene.sunMood = function (m) {
    if (['idle', 'happy', 'wow', 'sleepy'].indexOf(m) < 0) m = 'idle';
    S.mood = m; applyMood();
  };
  scene.sunPulse = function (strength) {
    var g = q('.ma-sun'); if (!g || !g.animate || reduced()) return;
    var k = 1 + 0.11 * (strength == null ? 1 : strength);
    g.animate([{ transform: 'scale(1)' }, { transform: 'scale(' + f(k) + ') rotate(4deg)', offset: 0.35 }, { transform: 'scale(0.97)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: 480, easing: 'ease-out' });
  };
  scene.setDawn = function (t) { S.dawn = clamp(+t || 0, 0, 1); applyDawn(); };
  scene.celebrate = function () {
    if (!S.el) return;
    var N = S.wins.length, nodes = S.el.querySelectorAll('.ma-win');
    for (var i = 0; i < nodes.length; i++) {
      var o = +nodes[i].getAttribute('data-o');
      nodes[i].style.transitionDelay = reduced() ? '0s' : (Math.max(0, o - S.lit) * 0.035).toFixed(2) + 's';
      if (!nodes[i].classList.contains('lit')) nodes[i].classList.add('lit');
    }
    S.lit = N;
    var was = S.mood; scene.sunMood('happy'); scene.sunPulse(1.8);
    S.el.classList.add('ma-burst');
    if (!reduced()) {
      S.order.forEach(function (w, n) { setTimeout(function () { burstAt(w.x, w.y, 4); }, 40 * n); });
      for (var k = 0; k < 16; k++) burstAt(Math.random() * S.W, Math.random() * S.H * 0.55, 3);
    }
    setTimeout(function () { if (S.el) S.el.classList.remove('ma-burst'); scene.sunMood(was === 'happy' ? 'idle' : was); }, 2200);
  };
  scene.flyPlane = function (fromX, fromY, opts) {
    return new Promise(function (resolve) {
      if (!doc) return resolve();
      var target = null;
      if (S.order.length) { target = S.order[Math.min(S.lit, S.order.length - 1)] || S.order[0]; }
      var tx = target ? target.x : S.W * 0.8, ty = target ? target.y : S.H * 0.6;
      if (reduced()) { burstAt(tx, ty, 6); return setTimeout(resolve, 120); }
      var layer = S.flyLayer;
      if (!layer || !layer.parentNode) {
        layer = S.flyLayer = doc.createElement('div');
        layer.id = 'ma-fly'; layer.setAttribute('aria-hidden', 'true');
        layer.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:70;overflow:hidden';
        doc.body.appendChild(layer);
      }
      var ns = 'http://www.w3.org/2000/svg', svg = doc.createElementNS(ns, 'svg');
      svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); svg.style.position = 'absolute'; svg.style.left = 0; svg.style.top = 0;
      svg.innerHTML = '<path class="trail" fill="none" stroke="#FFFDF6" stroke-width="2.2" stroke-dasharray="7 8" stroke-linecap="round" opacity=".9"/><g class="pl">' + planeShapes() + '</g>';
      layer.appendChild(svg);
      var trail = svg.querySelector('.trail'), pl = svg.querySelector('.pl');
      var dist = Math.hypot(tx - fromX, ty - fromY), cx = (fromX + tx) / 2 + (fromX < tx ? -0.05 : 0.05) * dist, cy = Math.min(fromY, ty) - 0.32 * dist - 30;
      var dur = (opts && +opts.duration) ? clamp(+opts.duration, 250, 1600) : clamp(700 + dist * 0.5, 800, 1500), t0 = 0, done = false, size = 46 / 66;
      function B(t) { var a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t; return [a * fromX + b * cx + c * tx, a * fromY + b * cy + c * ty]; }
      function D(t) { return [2 * (1 - t) * (cx - fromX) + 2 * t * (tx - cx), 2 * (1 - t) * (cy - fromY) + 2 * t * (ty - cy)]; }
      function finish() {
        if (done) return; done = true;
        burstAt(tx, ty, 7);
        pl.style.opacity = 0;
        trail.style.transition = 'opacity .6s'; trail.style.opacity = 0;
        setTimeout(function () { if (svg.parentNode) svg.parentNode.removeChild(svg); }, 700);
        resolve();
      }
      function frame(ts) {
        if (done) return;
        if (!t0) t0 = ts;
        var p = clamp((ts - t0) / dur, 0, 1), t = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        t = 0.15 * p + 0.85 * t;
        var pos = B(t), dv = D(t), ang = Math.atan2(dv[1], dv[0]) * 180 / Math.PI, sc = size * (1 - 0.45 * t);
        pl.setAttribute('transform', 'translate(' + f(pos[0]) + ' ' + f(pos[1]) + ') rotate(' + f(ang) + ') scale(' + f(sc * 1000) / 1000 + ') translate(-33 -20)');
        var d = 'M' + f(fromX) + ' ' + f(fromY);
        for (var i = 1; i <= 24; i++) { var tt = t * i / 24, b = B(tt); d += 'L' + f(b[0]) + ' ' + f(b[1]); }
        trail.setAttribute('d', d);
        if (p >= 1) finish(); else root.requestAnimationFrame(frame);
      }
      root.requestAnimationFrame(frame);
      setTimeout(finish, dur + 900);
    });
  };
  scene.state = function () { return { moon: S.moon, progress: S.progress, lit: S.lit, windows: S.wins.length, mood: S.mood, dawn: S.dawn, sun: S.sunLayout }; };
  scene.rebuild = build;
})(typeof window !== 'undefined' ? window : globalThis);
