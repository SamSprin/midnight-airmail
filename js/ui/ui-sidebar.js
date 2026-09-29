/* Midnight Airmail — UI sidebar (blind / lit window / hand / counters / buttons) and the top row
   (keepsakes on their string, consumables), incl. drag-to-reorder and the item popovers. */
(function (root) {
  'use strict';
  var MA = root.MA, ui = MA.ui, doc = root.document;

  var els = {};     // cached static nodes
  ui.kEls = {};     // keepsake uid -> element
  ui.cEls = {};     // consumable uid -> element

  /* ------------------------------------------------------------------ static markup */
  ui.buildSidebar = function () {
    var sp = ui.$('score-panel');
    sp.dataset.girl = 'idle';
    sp.innerHTML = '<div class="window-pane"><span class="curtain curtain-l"></span><span class="curtain curtain-r"></span>' +
      '<div class="score-label">Round Light</div><div class="score-value">0</div><div class="score-goal">of 0</div></div>';
    els.score = sp.querySelector('.score-value');
    els.goal = sp.querySelector('.score-goal');

    var hp = ui.$('hand-panel');
    hp.dataset.tip = 'hand';
    hp.innerHTML = '<div class="hand-name"><span class="hn-text">Pick your letters</span><span class="hand-lvl"></span></div>' +
      '<div class="hand-poker">up to 5 cards</div>' +
      '<div class="mult-row"><div class="ink-box"><span class="box-label">Ink</span><span class="box-num">0</span></div>' +
      '<span class="box-x">×</span><div class="glow-box"><span class="box-label">Glow</span><span class="box-num">0</span></div></div>';
    els.hn = hp.querySelector('.hn-text');
    els.lvl = hp.querySelector('.hand-lvl');
    els.poker = hp.querySelector('.hand-poker');
    els.inkBox = hp.querySelector('.ink-box');
    els.glowBox = hp.querySelector('.glow-box');
    els.ink = els.inkBox.querySelector('.box-num');
    els.glow = els.glowBox.querySelector('.box-num');
    els.multRow = hp.querySelector('.mult-row');

    var cp = ui.$('counters-panel');
    cp.innerHTML = '<div class="counters">' +
      '<div class="counter counter-sends"><span class="counter-label">Sends</span><span class="counter-value">0</span></div>' +
      '<div class="counter counter-crumples"><span class="counter-label">Crumples</span><span class="counter-value">0</span></div>' +
      '<div class="counter counter-stamps"><span class="counter-label">Stamps</span><span class="counter-value"></span></div>' +
      '<div class="counter counter-night"><span class="counter-label">Night</span><span class="counter-value">1/8</span></div>' +
      '<div class="counter counter-blind"><span class="counter-label">Blind</span><span class="counter-value">1/3</span></div>' +
      '<div class="counter counter-moon" data-tip="moon"><span class="counter-label">Moon</span><span class="counter-value">New</span></div>' +
      '</div>';
    els.cSends = cp.querySelector('.counter-sends .counter-value');
    els.cCrumples = cp.querySelector('.counter-crumples .counter-value');
    els.cStamps = cp.querySelector('.counter-stamps .counter-value');
    els.cNight = cp.querySelector('.counter-night .counter-value');
    els.cBlind = cp.querySelector('.counter-blind .counter-value');
    els.cMoon = cp.querySelector('.counter-moon .counter-value');
    els.moonChip = cp.querySelector('.counter-moon');

    ui.$('sidebar-buttons').innerHTML =
      '<button type="button" class="btn btn-plain" data-act="run-info">Run info</button>' +
      '<button type="button" class="btn btn-plain" data-act="options">Options</button>';
  };

  ui.sidebarEls = els;

  /* ------------------------------------------------------------------ blind panel */
  function blindPanelHTML() {
    var s = ui.state, next = s.phase === 'shop', info = next ? (ui.nextBlind() || MA.run.blindInfo(s)) : MA.run.blindInfo(s);
    var tape = info.kind === 'dusk' ? 'tape-teal' : info.kind === 'midnight' ? 'tape-pink' : 'tape-gold';
    var sub = info.kind === 'dusk' ? 'an early letter' : info.kind === 'midnight' ? 'a late letter' : 'a Visitor drops by';
    var h = '<span class="tape ' + tape + '"></span>';
    if (info.boss) h += '<div class="blind-emblem" data-tip="boss:' + info.boss.id + '">' + ui.bossSVG(info.boss.id, 60) + '</div>';
    h += '<h2 class="blind-name">' + ui.esc(info.name) + '</h2>';
    h += '<p class="blind-sub">' + (next ? 'Up next · ' : '') + 'Night ' + info.ante + ' · ' + sub + '</p>';
    h += '<div class="blind-target"><span class="k">Send at least</span><span class="v">' + ui.fmt(info.target) + '</span></div>';
    h += '<div class="blind-reward"><span class="k">Reward</span>' + ui.stampSVG(15) + '<span class="v">+' + info.reward + '</span></div>';
    if (info.boss) h += '<p class="blind-curse">' + ui.mk(info.boss.text) + '</p>';
    if (info.boss && info.boss.id === 'the_dog' && s.phase === 'playing' && s.sentThisBlind && s.sentThisBlind.length) {
      h += '<p class="blind-sent">Sent: ' + s.sentThisBlind.map(function (t) { return ui.esc(MA.hands.INFO[t].name); }).join(', ') + '</p>';
    }
    return h;
  }

  /* ------------------------------------------------------------------ hand panel (Ink x Glow) */
  ui.setBox = function (which, value, pulse) {
    var num = which === 'ink' ? els.ink : els.glow, box = which === 'ink' ? els.inkBox : els.glowBox;
    var changed = ui.setNum(num, which === 'ink' ? ui.fmtBig(value) : ui.fmtGlow(value));
    if (pulse && changed) ui.bump(box);
  };
  ui.setScore = function (n) { return ui.setNum(els.score, ui.fmtBig(n)); };
  ui.setHandName = function (name, lvl, poker) {
    ui.setText(els.hn, name);
    ui.setText(els.lvl, lvl ? 'lvl ' + lvl : '');
    ui.setText(els.poker, poker || '');
  };

  ui.renderHandPanel = function (force) {
    if ((ui.busy && !force) || !els.hn) return;
    var s = ui.state;
    var p = (s && s.phase === 'playing' && ui.sel.length) ? MA.run.preview(s, ui.sel) : null;
    var warn = '';
    if (p) {
      ui.previewType = p.type;
      /* say why Send is off right where the player is looking */
      if (typeof p.canPlay === 'string') warn = ui.shortWhy(p.canPlay);
      if (p.type) ui.setHandName(p.name, p.level, warn || p.poker);
      else ui.setHandName('???', 0, warn || 'a hidden hand');
      ui.setBox('ink', p.type ? p.ink : 0);
      ui.setBox('glow', p.type ? p.glow : 0);
      if (!p.type) { ui.setNum(els.ink, '?'); ui.setNum(els.glow, '?'); }
    } else {
      ui.previewType = null;
      var playing = s && s.phase === 'playing';
      ui.setHandName(playing ? 'Pick your letters' : 'Ready when you are', 0, playing ? 'choose up to 5 cards' : '');
      ui.setBox('ink', 0);
      ui.setBox('glow', 0);
    }
    els.poker.classList.toggle('hand-warn', !!warn);
  };
  /* Short, plain version of the engine's Send refusal for the hand panel. */
  ui.shortWhy = function (why) {
    if (/already sent/i.test(why)) return 'Already sent tonight';
    if (/exactly 5/i.test(why)) return 'Needs exactly 5 cards';
    if (/no sends/i.test(why)) return 'No Sends left';
    return why;
  };

  /* ------------------------------------------------------------------ whole sidebar */
  ui.renderSidebar = function () {
    var s = ui.state;
    if (!s || !els.hn) return;
    ui.setHTML(ui.$('blind-panel'), blindPanelHTML());
    var info = s.phase === 'shop' ? (ui.nextBlind() || MA.run.blindInfo(s)) : MA.run.blindInfo(s);
    if (!ui.busy) ui.setScore(ui.shownScore);
    ui.setText(els.goal, 'of ' + ui.fmtBig(info.target));
    var playing = s.phase === 'playing' || s.phase === 'cashout';
    ui.setText(els.cSends, playing ? s.sendsLeft : '-');
    ui.setText(els.cCrumples, playing ? s.crumplesLeft : '-');
    var stamps = ui.holdStamps != null ? ui.holdStamps : s.stamps;
    var sh = ui.stampSVG(15) + stamps;
    if (els.cStamps._h !== sh) { var changed = els.cStamps._h != null; ui.setHTML(els.cStamps, sh); if (changed) ui.bump(els.cStamps.parentNode); }
    ui.setText(els.cNight, s.ante + '/8');
    var bi = s.phase === 'shop' ? Math.min(s.blindIndex + 1, 2) : s.blindIndex;
    if (s.phase === 'shop' && s.blindIndex === 2) bi = 0;
    ui.setText(els.cBlind, (bi + 1) + '/3');
    var ml = ui.moonLine();
    ui.setText(els.cMoon, ml.short);
    els.moonChip.classList.toggle('is-full', !!ml.full);
    els.moonChip.classList.toggle('is-hidden', ui.moonHidden());
    ui.renderHandPanel();
  };

  /* ------------------------------------------------------------------ top row */
  function esc(s) { return ui.esc(s); }

  function updateItemEl(el, key, inner, cls) {
    if (el.dataset.key !== key) { el.innerHTML = inner; el.dataset.key = key; }
  }

  function makeKeepsakeEl(k) {
    var el = ui.h('div', 'keepsake');
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.dataset.act = 'keepsake';
    el.dataset.uid = k.uid;
    return el;
  }
  function makeConsumableEl(c) {
    var el = ui.h('div', 'consumable');
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.dataset.act = 'consumable';
    el.dataset.uid = c.uid;
    return el;
  }
  function sellTag(v) { return '<span class="price-tag sell"><span class="pt-word">Sell </span>' + ui.stampSVG(11) + v + '</span>'; }

  /* Put `want` (elements) in the row in order, reusing empty-slot nodes. */
  function reconcile(row, want) {
    for (var i = 0; i < want.length; i++) {
      if (row.children[i] !== want[i]) row.insertBefore(want[i], row.children[i] || null);
    }
    while (row.children.length > want.length) row.removeChild(row.lastChild);
  }
  function emptySlot(row, pool) {
    var e = pool.pop();
    if (!e) e = ui.h('div', 'slot-empty', 'Empty<br>slot');
    return e;
  }

  function syncKeepsakes(fresh) {
    var s = ui.state, row = ui.$('keepsakes'), want = [], shop = s.phase === 'shop';
    var pool = Array.prototype.filter.call(row.children, function (c) { return c.classList.contains('slot-empty'); });
    var alive = {};
    s.keepsakes.forEach(function (k) {
      alive[k.uid] = true;
      var el = ui.kEls[k.uid], isNew = !el;
      if (!el) el = ui.kEls[k.uid] = makeKeepsakeEl(k);
      var d = ui.kdef(k.id) || {}, sell = MA.run.sellValue(s, k.uid);
      updateItemEl(el, k.id + '|' + (shop ? sell : ''), ui.keepsakeSVG(k.id) + (shop ? sellTag(sell) : ''));
      el.dataset.tip = 'k:' + k.uid;
      el.setAttribute('aria-label', (d.name || k.id) + ', ' + (d.rarity || '') + ' keepsake');
      if (isNew && ui.rendered && !fresh) ui.sparkle(el);
      want.push(el);
    });
    Object.keys(ui.kEls).forEach(function (uid) { if (!alive[uid]) delete ui.kEls[uid]; });
    for (var i = s.keepsakes.length; i < s.keepsakeSlots; i++) want.push(emptySlot(row, pool));
    reconcile(row, want);
  }

  function syncConsumables(fresh) {
    var s = ui.state, row = ui.$('consumables'), want = [], shop = s.phase === 'shop';
    var pool = Array.prototype.filter.call(row.children, function (c) { return c.classList.contains('slot-empty'); });
    var alive = {};
    s.consumables.forEach(function (c) {
      alive[c.uid] = true;
      var el = ui.cEls[c.uid], isNew = !el;
      if (!el) el = ui.cEls[c.uid] = makeConsumableEl(c);
      var info = ui.consumableInfo(c);
      updateItemEl(el, c.kind + c.id + '|' + (shop ? 1 : ''), ui.itemSVG(c.kind, c.id) + (shop ? sellTag(1) : ''));
      el.dataset.tip = 'x:' + c.uid;
      el.setAttribute('aria-label', info.name + ', ' + info.label.toLowerCase());
      if (isNew && ui.rendered && !fresh) ui.sparkle(el);
      want.push(el);
    });
    Object.keys(ui.cEls).forEach(function (uid) { if (!alive[uid]) delete ui.cEls[uid]; });
    for (var i = s.consumables.length; i < s.consumableSlots; i++) want.push(emptySlot(row, pool));
    reconcile(row, want);
  }

  ui.renderTop = function (o) {
    if (!ui.state) return;
    syncKeepsakes(o && o.fresh);
    syncConsumables(o && o.fresh);
    ui.rendered = true;
  };

  /* Snapshot of keepsake status lines (to jiggle keepsakes that grew). */
  ui.statusMap = function () {
    var m = {};
    ui.state.keepsakes.forEach(function (k) { m[k.uid] = ui.keepsakeInfo(k).status; });
    return m;
  };
  ui.jiggleChanged = function (before) {
    ui.state.keepsakes.forEach(function (k) {
      var now = ui.keepsakeInfo(k).status;
      if (before[k.uid] !== undefined && before[k.uid] !== now && ui.kEls[k.uid]) { ui.jiggle(ui.kEls[k.uid]); ui.sfx('say'); }
    });
  };

  /* ------------------------------------------------------------------ popovers for owned items */
  function popoverHTML(key) {
    var s = ui.state, kind = key[0], uid = key.slice(2), i, h;
    if (kind === 'k') {
      var k = s.keepsakes.filter(function (x) { return x.uid === uid; })[0];
      if (!k) return null;
      var ki = ui.keepsakeInfo(k);
      h = '<h4 class="tip-title">' + esc(ki.name) + '</h4><div class="tip-sub">' + esc(ki.rarity) + ' keepsake</div>';
      h += '<div class="tip-line">' + ui.mk(ki.text) + '</div>';
      if (ki.status) h += '<div class="tip-status">' + ui.mk(ki.status) + '</div>';
      if (ki.flavor) h += '<div class="tip-line tip-flavor">' + esc(ki.flavor) + '</div>';
      h += '<div class="pop-actions"><button type="button" class="btn btn-small btn-gold" data-act="sell" data-uid="' + uid + '">Sell ' + ui.stampSVG(13) + '+' + ki.sell + '</button></div>';
      return h;
    }
    var c = s.consumables.filter(function (x) { return x.uid === uid; })[0];
    if (!c) return null;
    var ci = ui.consumableInfo(c);
    h = '<h4 class="tip-title">' + esc(ci.name) + '</h4><div class="tip-sub">' + esc(ci.label) + '</div>';
    h += '<div class="tip-line">' + ui.mk(ci.text) + '</div>';
    if (ci.lv) h += '<div class="tip-status">' + ui.mk(ci.lv) + '</div>';
    if (ci.flavor) h += '<div class="tip-line tip-flavor">' + esc(ci.flavor) + '</div>';
    var can = MA.run.canUseConsumable(s, uid, ui.sel), ok = can === true;
    if (ui.busy) { ok = false; can = 'Wait a moment.'; }
    h += '<div class="pop-actions"><button type="button" class="btn btn-small btn-send" data-act="use" data-uid="' + uid + '"' +
      (ok ? '' : ' aria-disabled="true" data-why="' + esc(can) + '" title="' + esc(can) + '"') + '>Use</button>' +
      '<button type="button" class="btn btn-small btn-gold" data-act="sell" data-uid="' + uid + '">Sell ' + ui.stampSVG(13) + '+1</button></div>';
    if (!ok) h += '<div class="pop-why">' + esc(can) + '</div>';
    return h;
  }

  ui.refreshPopover = function () {
    var p = ui.popover;
    if (!p || !p.key) return;
    var h = popoverHTML(p.key);
    if (h == null || !p.anchor.isConnected) { ui.closePopover(); return; }
    var full = '<span class="tape tape-gold"></span>' + h;
    if (p.el._h !== full) { p.el.innerHTML = full; p.el._h = full; }
  };

  function openOwned(el, prefix) {
    if (ui.busy || ui.dragging) return;
    var key = prefix + ':' + el.dataset.uid;
    if (ui.popover && ui.popover.key === key) { ui.closePopover(); return; }
    var h = popoverHTML(key);
    if (!h) return;
    var p = ui.openPopover(el, h, key);
    p._h = '<span class="tape tape-gold"></span>' + h;
    ui.sfx('click');
  }
  ui.actions.keepsake = function (el) { openOwned(el, 'k'); };
  ui.actions.consumable = function (el) { openOwned(el, 'x'); };

  ui.actions.sell = function (btn) {
    if (ui.busy) return;
    var s = ui.state, uid = btn.dataset.uid;
    var el = ui.kEls[uid] || ui.cEls[uid];
    var r = MA.run.sell(s, uid);
    if (!r.ok) { ui.toast(r.reason || 'Can’t sell that.'); return; }
    ui.closePopover();
    ui.sfx('sell');
    ui.toast('Sold for ' + ui.plural(r.amount, 'Stamp'));
    ui.popStamps(r.amount);
    var go = function () { ui.settle(); };
    if (el && el.animate && !ui.reduced()) {
      ui.busy = true;
      ui.anim(el, [{ translate: '0 0', opacity: 1, scale: 1 }, { translate: '0 -22px', opacity: 0, scale: .8 }], { duration: 260, easing: 'ease-in' }).then(function () { ui.busy = false; go(); });
    } else go();
  };

  ui.actions['run-info'] = function () { if (!ui.busy) ui.showRunInfo(); };
  ui.actions.options = function () { if (!ui.busy) ui.showOptions(); };

  /* ------------------------------------------------------------------ drag to reorder keepsakes */
  function bindDrag() {
    var row = ui.$('keepsakes');
    row.addEventListener('pointerdown', function (e) {
      if (ui.busy || (e.button != null && e.button > 0)) return;
      var el = e.target.closest('.keepsake');
      if (!el || ui.state.keepsakes.length < 2) return;
      var s = ui.state;
      var list = Array.prototype.filter.call(row.children, function (c) { return c.classList.contains('keepsake'); });
      var idx = list.indexOf(el);
      if (idx < 0) return;
      var rects = list.map(function (n) { return n.getBoundingClientRect(); });
      var step = list.length > 1 ? rects[1].left - rects[0].left : rects[0].width;
      var sx = e.clientX, sy = e.clientY, moved = false, target = idx, pid = e.pointerId;

      function mv(ev) {
        var dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moved) {
          if (Math.hypot(dx, dy) < 7) return;
          moved = true; ui.dragging = true;
          el.classList.add('dragging'); row.classList.add('reordering');
          ui.hideTip(); ui.closePopover();
          try { el.setPointerCapture(pid); } catch (er) { /* ignore */ }
        }
        el.style.translate = dx + 'px ' + Math.max(-10, Math.min(24, dy * 0.25)) + 'px';
        var cx = rects[idx].left + rects[idx].width / 2 + dx;
        target = 0;
        for (var j = 1; j < rects.length; j++) if (cx > rects[j].left) target = j;
        list.forEach(function (n, j) {
          if (n === el) return;
          var sh = 0;
          if (idx < target && j > idx && j <= target) sh = -step;
          else if (idx > target && j < idx && j >= target) sh = step;
          n.style.translate = sh ? sh + 'px 0' : '';
        });
      }
      function up() {
        doc.removeEventListener('pointermove', mv);
        doc.removeEventListener('pointerup', up);
        doc.removeEventListener('pointercancel', up);
        if (!moved) return;
        ui.suppressClick = true; setTimeout(function () { ui.suppressClick = false; }, 90);
        var firsts = list.map(function (n) { return n.getBoundingClientRect(); });
        list.forEach(function (n) { n.style.translate = ''; });
        el.classList.remove('dragging'); row.classList.remove('reordering');
        ui.dragging = false;
        if (target !== idx) {
          MA.run.moveKeepsake(s, idx, target);
          ui.sfx('select');
          ui.renderTop();
          ui.save();
        }
        list.forEach(function (n, j) {
          var f = firsts[j], l = n.getBoundingClientRect(), dx = f.left - l.left, dy = f.top - l.top;
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1) ui.anim(n, [{ translate: dx + 'px ' + dy + 'px' }, { translate: '0 0' }], { duration: 220, easing: 'cubic-bezier(.3,1.3,.5,1)' });
        });
      }
      doc.addEventListener('pointermove', mv);
      doc.addEventListener('pointerup', up);
      doc.addEventListener('pointercancel', up);
    });
  }
  ui.bindKeepsakeDrag = bindDrag;
})(typeof window !== 'undefined' ? window : globalThis);
