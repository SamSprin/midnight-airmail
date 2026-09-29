/* Midnight Airmail — UI core: state holder, helpers, tooltips, toasts, banners, pops, modals,
   persistence, scene sync, central click dispatcher, and the render loop.
   The UI never mutates run state directly: every change goes through MA.run.*. */
(function (root) {
  'use strict';
  var MA = root.MA = root.MA || {};
  var ui = MA.ui = MA.ui || {};
  var doc = root.document;

  ui.SAVE_KEY = 'midnight-airmail-save-v1';
  ui.SETTINGS_KEY = 'midnight-airmail-settings';
  ui.UI_KEY = 'midnight-airmail-ui-v1';

  ui.state = null;            // the RunState (only MA.run.* mutates it)
  ui.sel = [];                // selected hand uids
  ui.busy = false;            // input locked while a sequence plays
  ui.seq = null;              // current animation sequence {ff, wakers}
  ui.skipped = {};            // {ante: {blindIndex: true}} (UI-only memory of skipped blinds)
  ui.shownScore = 0;          // Light count shown in the lit window (animated)
  ui.holdStamps = null;       // while scoring: stamps shown before the sequence's Stamps events
  ui.settings = { speed: 1, sound: true, music: true, volume: 0.7, musicVolume: 0.35, ffUsed: false };
  ui.lockUntil = 0;           // clicks inside #stage / overlay / popover are ignored until then
  ui.actions = {};            // data-act registry: name -> function(el, event)
  ui.MAX_SELECT = 5;

  /* ------------------------------------------------------------------ small helpers */
  ui.$ = function (id) { return doc.getElementById(id); };
  ui.esc = function (s) { return MA.util.escape(s); };
  ui.fmt = function (n) { return MA.util.format(n); };
  ui.mk = function (t) { return MA.util.markup(t); };
  ui.h = function (tag, cls, html) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  ui.setHTML = function (el, html) { if (el && el._h !== html) { el.innerHTML = html; el._h = html; } };
  ui.setText = function (el, t) { t = String(t); if (el && el._t !== t) { el.textContent = t; el._t = t; return true; } return false; };
  ui.reduced = function () { try { return root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  ui.isTouch = function () { try { return root.matchMedia('(hover: none)').matches; } catch (e) { return false; } };
  ui.sfx = function (name, o) { try { if (MA.audio && MA.audio.play) MA.audio.play(name, o); } catch (e) { /* audio is optional */ } };
  ui.plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };
  ui.signed = function (n) { return (n < 0 ? '−' : '+') + ui.fmt(Math.abs(n)); };
  ui.restart = function (el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  ui.clearAfter = function (el, cls, ms) { setTimeout(function () { if (el) el.classList.remove(cls); }, ms); };
  ui.stampIcon = function (n) { return MA.art.stampIcon(n || 15); };

  /* Storage that never throws. */
  ui.store = {
    get: function (k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { root.localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del: function (k) { try { root.localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  /* ------------------------------------------------------------------ art cache */
  var svgCache = {};
  ui.cardSVG = function (c) {
    var k = 'c|' + c.uid + '|' + c.rank + '|' + c.suit + '|' + (c.sticker || '') + '|' + (c.faceDown ? 1 : 0);
    return svgCache[k] || (svgCache[k] = MA.art.cardSVG(c));
  };
  ui.keepsakeSVG = function (id) {
    var k = 'k|' + id, d = ui.kdef(id);
    return svgCache[k] || (svgCache[k] = MA.art.keepsakeSVG(id, d ? { name: d.name, rarity: d.rarity } : undefined));
  };
  ui.letterSVG = function (id) { var k = 'l|' + id; return svgCache[k] || (svgCache[k] = MA.art.letterSVG(id)); };
  ui.constSVG = function (id) { var k = 'n|' + id; return svgCache[k] || (svgCache[k] = MA.art.constellationSVG(id)); };
  ui.bossSVG = function (id, size) { var k = 'b|' + id + '|' + size; return svgCache[k] || (svgCache[k] = MA.art.bossSVG(id, size)); };
  ui.packSVG = function (kind) { var k = 'p|' + kind; return svgCache[k] || (svgCache[k] = MA.art.packSVG(kind)); };
  ui.backSVG = function () { return svgCache.back || (svgCache.back = MA.art.cardBackSVG()); };
  ui.planeSVG = function (n) { var k = 'pl|' + n; return svgCache[k] || (svgCache[k] = MA.art.planeSVG(n)); };
  ui.suitIcon = function (suit, n, onDark) {
    var k = 's|' + suit + '|' + n + '|' + (onDark ? 1 : 0);
    return svgCache[k] || (svgCache[k] = MA.art.suitIcon(suit, n, onDark ? { onDark: true } : undefined));
  };
  ui.stampSVG = function (n) { var k = 'st|' + n; return svgCache[k] || (svgCache[k] = MA.art.stampIcon(n)); };
  ui.itemSVG = function (kind, id) {
    return kind === 'keepsake' ? ui.keepsakeSVG(id) : kind === 'letter' ? ui.letterSVG(id) : ui.constSVG(id);
  };

  /* ------------------------------------------------------------------ content lookups */
  ui.kdef = function (id) { return (MA.content.keepsakes || {})[id] || null; };
  ui.ldef = function (id) { return (MA.content.letters || {})[id] || null; };
  ui.ndef = function (id) { return (MA.content.constellations || {})[id] || null; };
  ui.bdef = function (id) { return (MA.content.bosses || {})[id] || null; };
  ui.kname = function (id) { var d = ui.kdef(id); return d ? d.name : id; };
  ui.MOON_NAMES = ['New', 'Crescent', 'Half', 'Gibbous', 'Full'];

  /* {name, kind:'Letter'|'Constellation', text, flavor} for a consumable-like {kind,id}. */
  ui.consumableInfo = function (c) {
    if (c.kind === 'constellation') {
      var n = ui.ndef(c.id) || {};
      var hand = n.hand && MA.hands.INFO[n.hand];
      var lvNow = (ui.state && n.hand && ui.state.handLevels[n.hand]) ? ui.state.handLevels[n.hand].level : 0;
      var lvLine = (hand && lvNow) ? '{hand|' + hand.name + '}: Lv ' + lvNow + ' → ' + (lvNow + 1) : '';
      return { name: n.name || c.id, label: 'Constellation', text: n.text || '', lv: lvLine, flavor: hand ? 'A map of the sky that teaches ' + hand.name + ' to shine.' : '' };
    }
    var l = ui.ldef(c.id) || {};
    return { name: l.name || c.id, label: 'Letter', text: l.text || '', flavor: l.flavor || '' };
  };

  /* Keepsake detail for tooltips / popovers. inst may be an instance or {id}. */
  ui.keepsakeInfo = function (inst) {
    var d = ui.kdef(inst.id) || {};
    var status = '';
    try { if (d.status && inst.data) status = d.status(inst, ui.state) || ''; } catch (e) { status = ''; }
    var sell = (inst.uid && ui.state) ? MA.run.sellValue(ui.state, inst.uid) : Math.max(1, Math.floor((d.cost || 2) / 2));
    return { name: d.name || inst.id, rarity: d.rarity || 'common', text: d.text || '', flavor: d.flavor || '', status: status, cost: d.cost || 0, sell: sell };
  };

  /* Blind info for any (ante, index) without touching the state. */
  ui.blindInfoFor = function (ante, index) {
    var s = ui.state;
    if (ante === s.ante) return MA.run.blindInfo(s, index);
    var shadow = {}; for (var k in s) shadow[k] = s[k];
    shadow.ante = ante;
    return MA.run.blindInfo(shadow, index);
  };
  /* The blind that comes after the current one (used in the shop). */
  ui.nextBlind = function () {
    var s = ui.state, idx = s.blindIndex + 1, ante = s.ante;
    if (idx > 2) { idx = 0; ante += 1; }
    if (ante > 8) return null;
    return ui.blindInfoFor(ante, idx);
  };

  /* How many Sends until the moon reads Full (0 = it is Full now). Mirrors the engine's waxing. */
  ui.moonPhase = function () { return ui.moonOverride != null ? ui.moonOverride : ui.state.moonPhase; };
  ui.sendsToFull = function () {
    var s = ui.state;
    var speed = Math.max(1, Math.floor(MA.scoring.passiveMax(s, 'moonSpeed', 1)));
    var p = ui.moonPhase(), n = 0;
    while (p !== 4 && n < 8) {
      var next = p + speed;
      if (p < 4 && next > 4) next = 4; else next = next % 5;
      p = next; n++;
    }
    return n;
  };
  ui.moonHidden = function () {
    if (ui.moonHiddenOverride != null) return ui.moonHiddenOverride;
    var s = ui.state;
    var b = s && s.phase === 'playing' ? MA.scoring.currentBoss(s) : null;
    return !!(b && b.hidesMoon);
  };
  ui.moonLine = function () {
    var s = ui.state;
    if (ui.isDaybreak()) return { short: 'Set', long: 'The moon has set: no Full Moon before daybreak.' };
    if (ui.moonHidden()) return { short: 'Hidden', long: 'The moon is hidden tonight: no Full Moon.' };
    var n = ui.sendsToFull(), name = ui.MOON_NAMES[ui.moonPhase()];
    if (n === 0) return { short: 'Full now!', long: 'Full Moon now: your next Send gets ×2 Glow.', full: true };
    return { short: 'Full in ' + n, long: name + ' moon. Full Moon after ' + ui.plural(n, 'more Send') + '.', n: n };
  };

  /* ------------------------------------------------------------------ sequences (fast-forward aware waits) */
  /* Speed 1/2/3, or 0 = Instant (every sequence starts already fast-forwarded). */
  ui.spd = function () { return ui.settings.speed > 0 ? ui.settings.speed : 8; };
  ui.beginSeq = function () {
    ui.busy = true;
    /* fast-forward stays on across chained sequences (Send -> Night Report) */
    var carry = ui.ffCarry && Date.now() < ui.ffCarry;
    ui.seq = { ff: !!carry || ui.settings.speed === 0, wakers: [], t0: Date.now() };
    doc.body.classList.add('is-busy');
    ui.hideTip(); ui.closePopover();
  };
  ui.endSeq = function () {
    if (ui.seq && ui.seq.ff) ui.ffCarry = Date.now() + 1000;
    ui.busy = false; ui.seq = null;
    doc.body.classList.remove('is-busy');
    if (ui.hideChip) ui.hideChip();
  };
  ui.ff = function () { return !!(ui.seq && ui.seq.ff); };
  ui.fastForward = function () {
    if (!ui.seq || ui.seq.ff) return;
    ui.seq.ff = true;
    if (!ui.settings.ffUsed) { ui.settings.ffUsed = true; ui.saveSettings(); }
    if (ui.hideChip) ui.hideChip();
    var w = ui.seq.wakers.splice(0); w.forEach(function (f) { f(); });
  };
  /* Wait ms (already divided by speed by the caller if wanted). Resolves at once in fast-forward. */
  ui.sleep = function (ms) {
    return new Promise(function (res) {
      if (ui.ff() || ms <= 0) return res();
      var done = false, t;
      function fin() { if (done) return; done = true; clearTimeout(t); res(); }
      t = setTimeout(fin, ms);
      if (ui.seq) ui.seq.wakers.push(fin);
    });
  };
  ui.wait = function (ms) { return ui.sleep(ms / ui.spd()); };
  /* Plain timer that ignores fast-forward (used outside sequences too). */
  ui.delay = function (ms) { return new Promise(function (res) { setTimeout(res, ms); }); };

  /* Web-Animations helper that respects reduced motion and fast-forward; always resolves (with a timer
     fallback so a backgrounded tab can never leave the table locked). */
  ui.anim = function (el, frames, opts) {
    if (!el || !el.animate || ui.reduced()) return Promise.resolve();
    try {
      var a = el.animate(frames, opts);
      if (ui.ff()) { try { a.finish(); } catch (e) { /* ignore */ } return Promise.resolve(); }
      var total = ((opts && opts.duration) || 0) + ((opts && opts.delay) || 0) + 300;
      return new Promise(function (res) {
        var t, seq = ui.seq;
        function fin() { clearTimeout(t); res(); }
        t = setTimeout(fin, total);
        a.finished.then(fin, fin);
        if (seq) seq.wakers.push(function () { try { a.finish(); } catch (e) { /* ignore */ } fin(); });
      });
    } catch (e) { return Promise.resolve(); }
  };

  /* Ignore clicks inside the stage / overlay / popover for a moment: a button may have just landed
     under the cursor after a screen change. */
  ui.lock = function (ms) { ui.lockUntil = Math.max(ui.lockUntil, Date.now() + (ms || 400)); };

  /* ------------------------------------------------------------------ number formatting */
  function trimZeros(s) { return s.indexOf('.') === -1 ? s : s.replace(/\.?0+$/, ''); }
  ui.compact = function (n) {
    var units = [['T', 1e12], ['B', 1e9], ['M', 1e6]];
    for (var i = 0; i < units.length; i++) {
      if (Math.abs(n) >= units[i][1]) {
        var v = n / units[i][1], a = Math.abs(v);
        return trimZeros(v.toFixed(a >= 100 ? 0 : a >= 10 ? 1 : 2)) + units[i][0];
      }
    }
    return MA.util.format(n);
  };
  /* Light / Ink / round score: the full number, compact (1.23M) once it is longer than 7 characters. */
  ui.fmtBig = function (n) {
    var s = MA.util.format(n);
    return ((s.length > 7 || /e/.test(s)) && Math.abs(n) >= 1e6) ? ui.compact(n) : s;
  };
  /* Glow: 2 decimals under 100, 1 decimal from 100 to 999, whole numbers above (zeros trimmed). */
  ui.fmtGlow = function (n) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    var a = Math.abs(n), s;
    if (a >= 1000) s = MA.util.format(Math.round(n));
    else if (a >= 100) s = trimZeros(n.toFixed(1));
    else s = trimZeros(n.toFixed(2));
    return ((s.length > 7 || /e/.test(s)) && a >= 1e6) ? ui.compact(n) : s;
  };
  /* Write a number into an element and tell CSS how long it is (data-len drives the font-size steps). */
  ui.setNum = function (el, text) {
    if (!el) return false;
    text = String(text);
    el.dataset.len = String(text.length);
    return ui.setText(el, text);
  };

  /* ------------------------------------------------------------------ toasts, banners, pops */
  function layer(id, cls) {
    var l = ui.$(id);
    if (!l) { l = ui.h('div', cls); l.id = id; doc.body.appendChild(l); }
    return l;
  }
  ui.toast = function (msg, tone) {
    var l = layer('toasts', 'toasts');
    l.setAttribute('role', 'status'); l.setAttribute('aria-live', 'polite');
    var last = l.lastElementChild;
    if (last && !last.classList.contains('leaving') && last.dataset.msg === msg) {   // same text: restart its timer
      clearTimeout(last._t); last._t = setTimeout(last._leave, 2400);
      ui.restart(last, 'bump'); ui.clearAfter(last, 'bump', 420);
      return last;
    }
    var t = ui.h('div', 'toast paper' + (tone ? ' toast-' + tone : ''), ui.esc(msg));
    t.dataset.msg = msg;
    l.appendChild(t);
    while (l.children.length > 3) l.removeChild(l.firstChild);
    t._leave = function () { t.classList.add('leaving'); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300); };
    t._t = setTimeout(t._leave, 2400);
    return t;
  };
  /* Big banner over the table. opts: {tone:'teal'|'coral'|'paper', ms, sub} */
  ui.banner = function (text, o) {
    o = o || {};
    var l = layer('banners', 'banner-layer');
    var b = ui.h('div', 'banner' + (o.tone ? ' banner-' + o.tone : ''), ui.esc(text) + (o.sub ? '<span class="banner-sub">' + ui.esc(o.sub) + '</span>' : ''));
    l.appendChild(b);
    var ms = o.ms || 1500;
    setTimeout(function () {
      b.classList.add('leaving');
      setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 320);
    }, ms);
    return b;
  };
  /* Floating score pop at viewport px. kind: ink|glow|xglow|stamp|say|total */
  ui.pop = function (kind, text, x, y, extraCls) {
    var p = ui.h('div', 'pop pop-' + kind + (extraCls ? ' ' + extraCls : ''));
    p.textContent = text;
    p.style.left = Math.round(x) + 'px';
    p.style.top = Math.round(y) + 'px';
    doc.body.appendChild(p);
    var w = p.offsetWidth;                                   // keep wide pops inside the window
    if (w) p.style.left = Math.round(Math.max(w / 2 + 8, Math.min(root.innerWidth - w / 2 - 8, x))) + 'px';
    setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, kind === 'total' ? 2000 : 1150);
    return p;
  };
  /* Pop next to an element. where: 'top' = just above it (cards), 'low' = just below it (keepsakes),
     'mid' = over its middle. The pop then floats upward into free space. */
  ui.popAt = function (el, kind, text, where) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    var x = Math.min(root.innerWidth - 40, Math.max(40, r.left + r.width / 2));
    var y = where === 'low' ? r.bottom + 30 : where === 'mid' ? r.top + r.height * 0.5 : r.top - 6;
    return ui.pop(kind, text, x, Math.max(44, y));
  };
  ui.jiggle = function (el) {
    if (!el) return;
    ui.restart(el, 'jiggle');
    ui.clearAfter(el, 'jiggle', 650);
  };
  ui.bump = function (el) {
    if (!el) return;
    ui.restart(el, 'bump');
    ui.clearAfter(el, 'bump', 420);
  };
  ui.sparkle = function (el) {
    if (!el) return;
    ui.restart(el, 'sparkle');
    ui.clearAfter(el, 'sparkle', 900);
  };
  /* A little burst of gold + (or paper puffs with kind:'poof') from the middle of an element. */
  ui.burst = function (el, kind) {
    if (!el || ui.reduced() || !el.getBoundingClientRect) return;
    var r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, n = 8, poof = kind === 'poof';
    for (var i = 0; i < n; i++) {
      var p = ui.h('div', 'spark' + (poof ? ' poof' : ''));
      if (!poof) p.textContent = '+';
      p.style.left = Math.round(cx) + 'px'; p.style.top = Math.round(cy) + 'px';
      doc.body.appendChild(p);
      var ang = (i / n) * Math.PI * 2 + Math.random() * 0.6, d = 26 + Math.random() * 34;
      var dx = Math.round(Math.cos(ang) * d), dy = Math.round(Math.sin(ang) * d) - 6;
      if (p.animate) p.animate([
        { transform: 'translate(-50%, -50%) scale(.4)', opacity: 1 },
        { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(1.15) rotate(80deg)', opacity: 0 }
      ], { duration: 520 + Math.random() * 220, easing: 'ease-out' });
      (function (node) { setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 900); })(p);
    }
  };
  /* Stamp pop at the Stamps counter: -4 / +3 */
  ui.popStamps = function (delta) {
    if (!delta) return;
    var c = ui.sidebarEls && ui.sidebarEls.cStamps;
    ui.popAt(c && c.parentNode, 'stamp', (delta > 0 ? '+' : '−') + ui.fmt(Math.abs(delta)), 'top');
  };
  /* Hand level changes (Constellations, Wishing Star): "Pen Pals Lv 1 -> 2" tag + sparkle on the hand panel. */
  ui.levelSnap = function () {
    var m = {}, hl = ui.state.handLevels;
    Object.keys(hl).forEach(function (t) { m[t] = hl[t].level; });
    return m;
  };
  ui.levelPops = function (before) {
    var s = ui.state, n = 0;
    Object.keys(s.handLevels).forEach(function (t) {
      var now = s.handLevels[t].level;
      if (before[t] === undefined || now <= before[t]) return;
      var from = before[t];
      setTimeout(function () {
        var hp = ui.$('hand-panel');
        ui.popAt(hp, 'stamp', MA.hands.INFO[t].name + ' Lv ' + from + ' → ' + now, 'mid');
        ui.sparkle(hp); ui.burst(hp);
      }, n * 380);
      n++;
    });
  };
  /* The girl in the lit window reacts (art draws data-girl variants); back to idle after ms. */
  var girlTimer = null;
  ui.girl = function (mood, ms) {
    var el = ui.$('score-panel');
    if (!el) return;
    el.dataset.girl = mood;
    clearTimeout(girlTimer);
    if (ms) girlTimer = setTimeout(function () { el.dataset.girl = 'idle'; }, ms);
  };

  /* ------------------------------------------------------------------ tooltips */
  var tipEl = null, tipAnchor = null, pressTimer = null;
  function tipNode() { return tipEl || (tipEl = ui.$('tooltip')); }

  ui.itemTipHTML = function (name, sub, text, status, flavor, extra) {
    var h = '<span class="tape tape-l"></span>';
    h += '<h4 class="tip-title">' + ui.esc(name) + '</h4>';
    if (sub) h += '<div class="tip-sub">' + ui.esc(sub) + '</div>';
    if (text) h += '<div class="tip-line">' + ui.mk(text) + '</div>';
    if (status) h += '<div class="tip-status">' + ui.mk(status) + '</div>';
    if (flavor) h += '<div class="tip-line tip-flavor">' + ui.esc(flavor) + '</div>';
    if (extra) h += '<div class="tip-line">' + extra + '</div>';
    return h;
  };

  ui.tipHTML = function (spec) {
    var s = ui.state; if (!s) return '';
    var parts = spec.split(':'), kind = parts[0], id = parts.slice(1).join(':');
    var i;
    if (kind === 'c') {
      var c = MA.run.getCard(s, id);
      if (!c) return '';
      if (c.faceDown) return '<span class="tape tape-l"></span><h4 class="tip-title">Face down</h4><div class="tip-line">You can’t see this letter yet.</div>';
      var d = MA.cards.describe(c);
      var h = '<span class="tape tape-l"></span><h4 class="tip-title">' + ui.esc(d.title) + '</h4>';
      d.lines.forEach(function (ln) { h += '<div class="tip-line">' + ui.mk(ln) + '</div>'; });
      return h;
    }
    if (kind === 'k') {
      for (i = 0; i < s.keepsakes.length; i++) if (s.keepsakes[i].uid === id) {
        var ki = ui.keepsakeInfo(s.keepsakes[i]);
        return ui.itemTipHTML(ki.name, ki.rarity + ' keepsake', ki.text, ki.status, ki.flavor, '<span class="tip-sell">Sells for ' + ui.stampSVG(11) + ' ' + ki.sell + '</span>');
      }
      return '';
    }
    if (kind === 'x') {
      for (i = 0; i < s.consumables.length; i++) if (s.consumables[i].uid === id) {
        var ci = ui.consumableInfo(s.consumables[i]);
        return ui.itemTipHTML(ci.name, ci.label, ci.text, ci.lv || '', ci.flavor, '<span class="tip-sell">Sells for ' + ui.stampSVG(11) + ' 1</span>');
      }
      return '';
    }
    if (kind === 'si') {
      var it = s.shop && s.shop.items[+id];
      if (!it) return '';
      if (it.kind === 'keepsake') {
        var kk = ui.keepsakeInfo({ id: it.id, data: {} });
        return ui.itemTipHTML(kk.name, kk.rarity + ' keepsake', kk.text, '', kk.flavor);
      }
      var cc = ui.consumableInfo(it);
      return ui.itemTipHTML(cc.name, cc.label, cc.text, cc.lv || '', cc.flavor);
    }
    if (kind === 'boss') {
      var bid = id || (MA.scoring.currentBoss(s) || {}).id;
      var b = ui.bdef(bid);
      if (!b) return '';
      return ui.itemTipHTML(b.name, 'Visitor', b.text, '', b.flavor);
    }
    if (kind === 'hand') {
      var type = ui.previewType || ui.lastHandType;
      if (!type) return '<span class="tape tape-l"></span><h4 class="tip-title">Hands</h4><div class="tip-line">Pick up to 5 cards to see which hand they make. Open Run info to see every hand level.</div>';
      var info = MA.hands.INFO[type], v = MA.hands.values(s, type), lv = s.handLevels[type];
      return ui.itemTipHTML(info.name, info.poker + ' · level ' + v.level,
        '{ink|' + v.ink + ' Ink} × {glow|' + v.glow + ' Glow}',
        'Each level: {ink|+' + info.dInk + ' Ink}, {glow|+' + info.dGlow + ' Glow}',
        '', 'Sent ' + ui.plural(lv ? lv.sent : 0, 'time') + ' this run');
    }
    if (kind === 'moon') {
      var ml = ui.moonLine();
      return ui.itemTipHTML('The Moon', ui.MOON_NAMES[ui.moonPhase()] + ' phase', ml.long,
        'It waxes one phase with every Send. A Send under a Full Moon gets {xglow|×2 Glow}.', '');
    }
    if (kind === 'sticker') {
      var st = MA.cards.STICKERS[id];
      return st ? ui.itemTipHTML(st.name, 'Sticker', st.text, '', '') : '';
    }
    return '';
  };

  /* No tooltips while a popover is open (it owns the pointer), or over the page while a modal is up. */
  function tipBlocked(anchor) {
    if (ui.popover) return true;
    if (ui.modal && !(anchor.closest && anchor.closest('#overlay'))) return true;
    return false;
  }
  ui.showTip = function (anchor, html) {
    var t = tipNode();
    if (!t || !html || tipBlocked(anchor)) return;
    t.innerHTML = html;
    t.hidden = false;
    t.style.visibility = 'hidden';
    t.style.left = '0px'; t.style.top = '0px';
    var a = anchor.getBoundingClientRect(), tw = t.offsetWidth, th = t.offsetHeight;
    var vw = root.innerWidth, vh = root.innerHeight, gap = 12;
    var x = a.left + a.width / 2 - tw / 2;
    var y = a.top - th - gap;
    if (y < 8) y = a.bottom + gap;
    if (y + th > vh - 8) y = Math.max(8, Math.min(vh - th - 8, a.top + a.height / 2 - th / 2));
    x = Math.max(8, Math.min(vw - tw - 8, x));
    t.style.left = Math.round(x) + 'px';
    t.style.top = Math.round(y) + 'px';
    t.style.visibility = '';
    tipAnchor = anchor;
  };
  ui.hideTip = function () {
    var t = tipNode();
    if (t) t.hidden = true;
    tipAnchor = null;
  };
  ui.refreshTip = function () {
    if (tipAnchor && tipAnchor.isConnected && tipAnchor.dataset.tip) {
      var h = ui.tipHTML(tipAnchor.dataset.tip);
      if (h) ui.showTip(tipAnchor, h); else ui.hideTip();
    } else ui.hideTip();
  };

  function tipTarget(e) { return e.target && e.target.closest ? e.target.closest('[data-tip]') : null; }
  function bindTips() {
    doc.addEventListener('pointerover', function (e) {
      if (e.pointerType === 'touch' || ui.busy || ui.dragging) return;
      var t = tipTarget(e);
      if (!t || tipBlocked(t)) { if (tipAnchor) ui.hideTip(); return; }
      if (t === tipAnchor) return;
      var h = ui.tipHTML(t.dataset.tip);
      if (h) ui.showTip(t, h); else ui.hideTip();
    });
    doc.addEventListener('pointerout', function (e) {
      if (e.pointerType === 'touch') return;
      var t = tipTarget(e);
      if (t && t === tipAnchor && !(e.relatedTarget && t.contains(e.relatedTarget))) ui.hideTip();
    });
    doc.addEventListener('focusin', function (e) {
      var t = tipTarget(e);
      if (t && !ui.busy && !tipBlocked(t) && e.target.matches && e.target.matches(':focus-visible')) { var h = ui.tipHTML(t.dataset.tip); if (h) ui.showTip(t, h); }
    });
    doc.addEventListener('focusout', function () { ui.hideTip(); });
    /* Touch: press and hold shows the tooltip, and swallows the click that follows. */
    doc.addEventListener('pointerdown', function (e) {
      clearTimeout(pressTimer);
      if (tipAnchor && e.pointerType === 'touch') ui.hideTip();
      if (e.pointerType !== 'touch' || ui.busy) return;
      var t = tipTarget(e);
      if (!t) return;
      var sx = e.clientX, sy = e.clientY;
      pressTimer = setTimeout(function () {
        var h = ui.tipHTML(t.dataset.tip);
        if (h) { ui.showTip(t, h); ui.suppressClick = true; setTimeout(function () { ui.suppressClick = false; }, 600); setTimeout(ui.hideTip, 3200); }
      }, 480);
      var cancel = function (ev) {
        if (ev.type === 'pointermove' && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 10) return;
        clearTimeout(pressTimer);
        doc.removeEventListener('pointermove', cancel); doc.removeEventListener('pointerup', cancel); doc.removeEventListener('pointercancel', cancel);
      };
      doc.addEventListener('pointermove', cancel); doc.addEventListener('pointerup', cancel); doc.addEventListener('pointercancel', cancel);
    }, true);
    root.addEventListener('scroll', ui.hideTip, true);
    root.addEventListener('resize', function () { ui.hideTip(); ui.closePopover(); });
  }

  /* ------------------------------------------------------------------ popover (small paper note anchored to an item) */
  ui.popover = null;
  ui.openPopover = function (anchor, html, key) {
    ui.closePopover();
    ui.hideTip();
    var p = ui.h('div', 'popover paper', '<span class="tape tape-gold"></span>' + html);
    p.id = 'popover';
    p.setAttribute('role', 'dialog');
    doc.body.appendChild(p);
    var a = anchor.getBoundingClientRect(), pw = p.offsetWidth, ph = p.offsetHeight, vw = root.innerWidth, vh = root.innerHeight;
    var x = Math.max(8, Math.min(vw - pw - 8, a.left + a.width / 2 - pw / 2));
    var y = a.bottom + 12;
    if (y + ph > vh - 8) y = Math.max(8, a.top - ph - 12);
    if (y < 8) y = 8;
    p.style.left = Math.round(x) + 'px';
    p.style.top = Math.round(y) + 'px';
    ui.popover = { el: p, anchor: anchor, key: key };
    return p;
  };
  ui.closePopover = function () {
    if (ui.popover) { if (ui.popover.el.parentNode) ui.popover.el.parentNode.removeChild(ui.popover.el); ui.popover = null; }
  };

  /* ------------------------------------------------------------------ modals (#overlay) */
  ui.modal = null;
  ui.clearBanners = function () { var l = ui.$('banners'); if (l) l.innerHTML = ''; };
  ui.openModal = function (node, o) {
    o = o || {};
    var ov = ui.$('overlay');
    ui.closePopover(); ui.hideTip(); ui.clearBanners();
    ov.innerHTML = '';
    ov.appendChild(node);
    ov.dataset.kind = o.kind || '';
    ui.modal = { kind: o.kind || '', dismiss: o.dismiss !== false, onClose: o.onClose || null };
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');
    ui.lock(400);
    var f;
    if (o.focus === 'self') { node.tabIndex = -1; f = node; }        // packs / end screens: don't put a Pick or New Run under Enter
    else f = node.querySelector('[autofocus]') || node.querySelector('.btn:not([aria-disabled="true"])');
    if (f && f.focus) { try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    return node;
  };
  ui.closeModal = function () {
    var ov = ui.$('overlay'), m = ui.modal;
    ui.lock(350);
    ov.innerHTML = '';
    delete ov.dataset.kind;
    ui.modal = null;
    if (m && m.onClose) m.onClose();
  };
  ui.modalKind = function () { return ui.modal ? ui.modal.kind : ''; };

  /* ------------------------------------------------------------------ settings + audio */
  ui.loadSettings = function (fromHot) {
    var raw = fromHot || null;
    if (!raw) { try { raw = JSON.parse(ui.store.get(ui.SETTINGS_KEY) || 'null'); } catch (e) { raw = null; } }
    if (raw && typeof raw === 'object') {
      if ([0, 1, 2, 3].indexOf(raw.speed) !== -1) ui.settings.speed = raw.speed;
      if (typeof raw.ffUsed === 'boolean') ui.settings.ffUsed = raw.ffUsed;
      if (typeof raw.sound === 'boolean') ui.settings.sound = raw.sound;
      if (typeof raw.music === 'boolean') ui.settings.music = raw.music;
      if (typeof raw.volume === 'number') ui.settings.volume = Math.max(0, Math.min(1, raw.volume));
      if (typeof raw.musicVolume === 'number') ui.settings.musicVolume = Math.max(0, Math.min(1, raw.musicVolume));
    }
  };
  ui.saveSettings = function () { ui.store.set(ui.SETTINGS_KEY, JSON.stringify(ui.settings)); };
  ui.applyAudio = function () {
    var a = MA.audio; if (!a) return;
    try {
      if (a.setMuted) a.setMuted(!ui.settings.sound);
      if (a.setVolume) a.setVolume(ui.settings.volume);
      if (a.setMusicVolume) a.setMusicVolume(ui.settings.musicVolume);
      if (a.music) a.music(!!ui.settings.music && ui.unlocked);
    } catch (e) { /* ignore */ }
  };
  ui.unlocked = false;
  ui.unlockAudio = function () {
    if (ui.unlocked) return;
    ui.unlocked = true;
    try { if (MA.audio && MA.audio.unlock) MA.audio.unlock(); } catch (e) { /* ignore */ }
    ui.applyAudio();
  };

  /* ------------------------------------------------------------------ persistence */
  /* A save may hold a finished run (saved right after a losing Send): booting shows its end screen. */
  ui.hasSave = function () {
    var raw = ui.store.get(ui.SAVE_KEY);
    return !!(raw && MA.run.deserialize(raw));
  };
  ui.loadSave = function () {
    var raw = ui.store.get(ui.SAVE_KEY);
    var s = raw ? MA.run.deserialize(raw) : null;
    if (!s) return null;
    try { ui.skipped = JSON.parse(ui.store.get(ui.UI_KEY) || '{}') || {}; } catch (e) { ui.skipped = {}; }
    return s;
  };
  /* Autosave. force = also save a finished run (done right after a Send, before it animates). */
  ui.save = function (force) {
    var s = ui.state;
    if (!s) return;
    if ((s.phase === 'gameover' || s.phase === 'victory') && !force) return;
    ui.store.set(ui.SAVE_KEY, MA.run.serialize(s));
    ui.store.set(ui.UI_KEY, JSON.stringify(ui.skipped));
  };
  ui.clearSave = function () { ui.store.del(ui.SAVE_KEY); ui.store.del(ui.UI_KEY); };
  ui.serializedState = function () {
    if (!ui.state || ui.state.phase === 'gameover' || ui.state.phase === 'victory') return null;
    return MA.run.serialize(ui.state);
  };

  /* ------------------------------------------------------------------ scene sync */
  ui.syncScene = function (o) {
    o = o || {};
    var S = MA.scene, s = ui.state;
    if (!S || !s) return;
    try {
      var dbk = ui.isDaybreak();
      S.setMoonPhase(ui.moonPhase(), dbk ? 'set' : (ui.moonHidden() ? 'clouds' : false));     // 'set': sinks below the horizon; 'clouds': The Clouds
      S.setDawn(dbk ? 0.9 : Math.min(1, (s.ante - 1) / 7 * 0.55));
      if (dbk && !ui.busy) ui.sun('happy');
      if (o.progress) S.setProgress(ui.progressFor());
    } catch (e) { /* scene is decoration */ }
  };
  /* Night 8's Visitor, while it is being played (and through its cash-out). */
  ui.isDaybreak = function () {
    var s = ui.state;
    return !!(s && s.ante === 8 && s.blindIndex === 2 && (s.phase === 'playing' || s.phase === 'cashout' || s.phase === 'victory'));
  };
  /* Where the sun rests between reactions. */
  ui.restMood = function () { return ui.isDaybreak() ? 'happy' : 'idle'; };
  ui.progressFor = function () {
    var s = ui.state;
    if (s.phase === 'playing' || s.phase === 'cashout') return s.blindWon ? 1 : (s.target ? s.roundScore / s.target : 0);
    return 0;
  };
  ui.sun = function (mood) { try { MA.scene.sunMood(mood); } catch (e) { /* ignore */ } };

  /* ------------------------------------------------------------------ central click dispatcher */
  ui.disable = function (btn, why) {
    if (!btn) return;
    var off = !!why;
    btn.setAttribute('aria-disabled', off ? 'true' : 'false');
    if (off) { btn.title = why; btn.dataset.why = why; } else { btn.removeAttribute('title'); delete btn.dataset.why; }
  };

  function onClick(e) {
    if (ui.suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
    var t = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!t) {
      /* clicking anywhere else closes the popover */
      if (ui.popover && !(e.target.closest && e.target.closest('#popover'))) ui.closePopover();
      return;
    }
    /* a screen just changed under the cursor: ignore stray clicks for a moment */
    if (Date.now() < ui.lockUntil && t.closest('#stage, #overlay, #popover')) { e.preventDefault(); return; }
    if (ui.popover && !t.closest('#popover') && t !== ui.popover.anchor) ui.closePopover();
    ui.unlockAudio();
    if (t.getAttribute('aria-disabled') === 'true') {
      ui.sfx('error');
      if (t.dataset.why) ui.toast(t.dataset.why);
      ui.restart(t, 'shake'); ui.clearAfter(t, 'shake', 400);
      return;
    }
    var fn = ui.actions[t.dataset.act];
    if (fn) fn(t, e);
  }

  function onKey(e) {
    if (e.defaultPrevented) return;
    var tag = e.target && e.target.tagName;
    var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    /* fast-forward */
    if (ui.busy && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); ui.fastForward(); return; }
    if (e.key === 'Escape') {
      if (ui.popover) { ui.closePopover(); return; }
      if (ui.modal) { if (ui.modal.dismiss) ui.closeModal(); return; }
      if (ui.state && ui.state.phase === 'playing' && !ui.busy && ui.sel.length) { ui.clearSelection(); }
      return;
    }
    /* [role=button] divs act like buttons */
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.getAttribute && e.target.getAttribute('role') === 'button' && e.target.tagName !== 'BUTTON') {
      e.preventDefault(); e.target.click(); return;
    }
    if (typing || ui.modal || ui.busy) return;
    var s = ui.state;
    if (!s || s.phase !== 'playing') return;
    var ae = doc.activeElement;
    var onPlain = !ae || ae === doc.body || (ae.classList && ae.classList.contains('card'));
    var k = e.key, mod = e.ctrlKey || e.metaKey || e.altKey;
    if (k === 'Enter' && onPlain) { e.preventDefault(); ui.doSend(); }
    /* Crumple is C (or Shift+Backspace): plain Backspace/Delete must not burn a Crumple by accident */
    else if (onPlain && !mod && (k === 'c' || k === 'C' || (e.shiftKey && (k === 'Backspace' || k === 'Delete')))) { e.preventDefault(); ui.doCrumple(); }
  }

  ui.actions.noop = function () {};

  /* ------------------------------------------------------------------ boot pieces */
  ui.buildStatic = function () {
    ui.buildSidebar();
    ui.buildHandArea();
    ui.bindKeepsakeDrag();
  };

  ui.init = function () {
    MA.art.ensureDefs();
    bindTips();
    doc.addEventListener('click', onClick);
    doc.addEventListener('keydown', onKey);
    doc.addEventListener('pointerdown', function (e) {
      ui.unlockAudio();
      if (ui.busy) { if (e.target.closest && !e.target.closest('.popover')) ui.fastForward(); return; }
      if (ui.popover && e.target.closest && !e.target.closest('#popover') && !e.target.closest('[data-act]')) ui.closePopover();
    }, true);
    /* clicking the dim backdrop of a dismissible modal closes it */
    ui.$('overlay').addEventListener('pointerdown', function (e) {
      if (e.target === ui.$('overlay') && ui.modal && ui.modal.dismiss) ui.closeModal();
    });
    try { MA.scene.mount(ui.$('scene')); } catch (e) { /* ignore */ }
    ui.buildStatic();
    root.addEventListener('resize', function () { if (ui.fitHand) ui.fitHand(); });
  };

  /* ------------------------------------------------------------------ render loop */
  ui.setState = function (s) {
    ui.state = s;
    ui.sel = [];
    ui.shownScore = s ? s.roundScore : 0;
    ui.holdStamps = null;
    ui.previewType = null;
  };

  /* The scenery measures the UI geometry (top row, stage, windowsill): rebuild it once the real
     layout is on screen, and when the windowsill appears (it only exists while playing). */
  var rebuildTimer = null;
  ui.rebuildScene = function () {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(function () {
      root.requestAnimationFrame(function () { root.requestAnimationFrame(function () { try { MA.scene.rebuild(); } catch (e) { /* ignore */ } }); });
    }, 30);
  };

  /* Full sync of every panel with the run state (never called mid-animation). */
  ui.render = function (o) {
    o = o || {};
    var s = ui.state;
    if (!s) return;
    var g = ui.$('game');
    if (g.dataset.phase !== s.phase) {
      var wasPlaying = g.dataset.phase === 'playing';
      g.dataset.phase = s.phase;
      if (s.phase === 'playing' || wasPlaying) ui.rebuildScene();
    }
    if (o.fresh) ui.rebuildScene();
    if (!ui.busy) ui.shownScore = (s.phase === 'playing' || s.phase === 'cashout') ? s.roundScore : 0;
    ui.renderSidebar();
    ui.renderTop(o);
    ui.renderStage(o);
    ui.syncHand(o);
    ui.renderControls();
    ui.renderDeck();
    ui.syncScene(o);
    ui.refreshPopover();
    ui.refreshTip();
    ui.checkPack();
  };

  /* Render + autosave: every action ends here. */
  ui.settle = function (o) {
    ui.render(o);
    ui.save();
  };

  /* Re-open pack modal if a pack is open (skip reward, shop pack, reload mid-pack). */
  ui.checkPack = function () {
    var s = ui.state;
    if (s && s.pack && !ui.busy && ui.modalKind() !== 'pack') ui.showPack();
  };
})(typeof window !== 'undefined' ? window : globalThis);
