/* Midnight Airmail — UI hand: hand cards (keyed, incremental), selection, Send/Crumple/sort
   controls, deck pile, Crumple animation, and using Letters / Constellations. */
(function (root) {
  'use strict';
  var MA = root.MA, ui = MA.ui, doc = root.document;

  ui.handEls = {};   // card uid -> element (hand, or the played row while a Send plays)

  /* ------------------------------------------------------------------ static markup */
  ui.buildHandArea = function () {
    ui.$('hand-controls').innerHTML =
      '<button type="button" class="btn btn-send" data-act="send"><span class="btn-icon">' + ui.planeSVG(34) + '</span>Send</button>' +
      '<button type="button" class="btn btn-plain btn-small" data-act="sort-rank">Rank</button>' +
      '<button type="button" class="btn btn-plain btn-small" data-act="sort-suit">Suit</button>' +
      '<button type="button" class="btn btn-crumple" data-act="crumple">Crumple</button>';
    var dp = ui.$('deck-pile');
    dp.setAttribute('role', 'button');
    dp.tabIndex = 0;
    dp.dataset.act = 'deck';
    dp.innerHTML = '<div class="deck-cards"><div class="card">' + ui.backSVG() + '</div><div class="card">' + ui.backSVG() + '</div><div class="card">' + ui.backSVG() + '</div></div>' +
      '<span class="deck-count label tape-gold">0 / 0</span>';
    ui.deckCount = dp.querySelector('.deck-count');
    ui.sendBtn = doc.querySelector('#hand-controls [data-act="send"]');
    ui.crumpleBtn = doc.querySelector('#hand-controls [data-act="crumple"]');
  };

  /* ------------------------------------------------------------------ card elements */
  function makeCardEl(c) {
    var el = ui.h('button', 'card');
    el.type = 'button';
    el.dataset.act = 'card';
    el.dataset.uid = c.uid;
    el.setAttribute('aria-pressed', 'false');
    return el;
  }
  ui.updateCardEl = function (el, c) {
    var key = c.rank + '|' + c.suit + '|' + (c.sticker || '') + '|' + (c.faceDown ? 1 : 0);
    var changed = el.dataset.key !== undefined && el.dataset.key !== key;
    if (el.dataset.key !== key) { el.innerHTML = ui.cardSVG(c); el.dataset.key = key; }
    el.classList.toggle('debuffed', !!c.debuffed);
    el.classList.toggle('facedown', !!c.faceDown);
    el.dataset.tip = 'c:' + c.uid;
    var label;
    if (c.faceDown) label = 'Face-down card';
    else {
      var d = MA.cards.describe(c);
      label = d.title + (c.sticker && MA.cards.STICKERS[c.sticker] ? ', ' + MA.cards.STICKERS[c.sticker].name : '') + (c.debuffed ? ', debuffed' : '');
    }
    el.setAttribute('aria-label', label);
    return changed;
  };

  /* Shrink the hand's overlap so every card fits the row (no horizontal scroll). */
  ui.fitHand = function () {
    var hand = ui.$('hand'), n = hand.children.length;
    hand.style.removeProperty('--hand-overlap');
    if (n < 2) return;
    var cs = root.getComputedStyle(hand);
    var def = parseFloat(cs.getPropertyValue('--hand-overlap')) || -0.05;
    var pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    var avail = hand.clientWidth - pad - 6;
    var w = hand.children[0].offsetWidth;
    if (!w || avail <= 0) return;
    var need = (avail - n * w) / ((n - 1) * w);
    if (need < def) hand.style.setProperty('--hand-overlap', Math.max(-0.7, need).toFixed(3));
  };

  /* FLIP: run mutate(), then slide every listed element from its old spot to its new one. */
  ui.flip = function (list, mutate, o) {
    o = o || {};
    var first = list.map(function (e) { return e.getBoundingClientRect(); });
    mutate();
    if (ui.reduced()) return;
    var dur = (o.duration || 280) / (ui.spd() > 1 ? 1.6 : 1);
    list.forEach(function (e, i) {
      var f = first[i], l = e.getBoundingClientRect();
      /* cards scale from their bottom-centre, so anchor the move there: it also handles a size change
         (hand card -> the larger played card) */
      var dx = (f.left + f.width / 2) - (l.left + l.width / 2), dy = f.bottom - l.bottom;
      var sx = l.width ? f.width / l.width : 1, resize = Math.abs(sx - 1) > 0.02;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && !resize) return;
      var from = { translate: dx + 'px ' + dy + 'px' }, to = { translate: '0 0' };
      if (resize) { from.scale = String(sx); to.scale = '1'; }
      ui.anim(e, [from, to], { duration: dur, easing: 'cubic-bezier(.3,1.15,.5,1)', delay: o.stagger ? i * o.stagger : 0 });
    });
  };

  /* ------------------------------------------------------------------ syncing #hand with state.hand */
  ui.syncHand = function (o) {
    o = o || {};
    var s = ui.state, hand = ui.$('hand');
    if (!s) return;
    if (s.phase !== 'playing') {
      if (!ui.busy && (hand.children.length || Object.keys(ui.handEls).length)) { hand.innerHTML = ''; ui.handEls = {}; }
      return;
    }
    var cards = MA.run.handCards(s), want = [], alive = {}, fresh = [], stay = [], sparkles = [];
    var dealMap = {};
    (o.deal || []).forEach(function (u, i) { dealMap[u] = i; });
    cards.forEach(function (c) {
      alive[c.uid] = true;
      var el = ui.handEls[c.uid], isNew = !el;
      if (!el) { el = ui.handEls[c.uid] = makeCardEl(c); }
      var changed = ui.updateCardEl(el, c);
      if (isNew || el.parentNode !== hand) fresh.push(el); else { stay.push(el); if (changed) sparkles.push(el); }
      el.classList.toggle('selected', ui.sel.indexOf(c.uid) !== -1);
      el.setAttribute('aria-pressed', ui.sel.indexOf(c.uid) !== -1 ? 'true' : 'false');
      want.push(el);
    });
    Object.keys(ui.handEls).forEach(function (uid) {
      if (!alive[uid]) {
        var e = ui.handEls[uid];
        if (e.parentNode === hand) hand.removeChild(e);
        delete ui.handEls[uid];
      }
    });
    ui.flip(stay, function () {
      for (var i = 0; i < want.length; i++) if (hand.children[i] !== want[i]) hand.insertBefore(want[i], hand.children[i] || null);
      ui.fitHand();
    }, { duration: 260 });
    if (!stay.length && !fresh.length) ui.fitHand();
    sparkles.forEach(function (el) { ui.sparkle(el); ui.burst(el); });      // changed by a Letter
    /* new cards: dealt from the deck pile, or popped in (letters that create cards) */
    if (fresh.length) {
      var dp = ui.$('deck-pile').getBoundingClientRect();
      var dcx = dp.left + dp.width / 2, dcy = dp.top + dp.height / 2, n = 0;
      fresh.forEach(function (el) {
        var uid = el.dataset.uid;
        if (o.instant) return;
        if (dealMap[uid] !== undefined) {
          var r = el.getBoundingClientRect();
          el.style.setProperty('--deal-dx', Math.round(dcx - (r.left + r.width / 2)) + 'px');
          el.style.setProperty('--deal-dy', Math.round(dcy - (r.top + r.height / 2)) + 'px');
          el.style.setProperty('--i', String(dealMap[uid]));
          el.classList.add('dealing');
          var done = function () { el.classList.remove('dealing'); el.removeEventListener('animationend', done); };
          el.addEventListener('animationend', done);
          (function (k) { setTimeout(function () { ui.sfx('deal', { pitch: Math.min(6, k * 0.35) }); }, k * 55 / (ui.spd() > 1 ? 1.5 : 1)); })(n++);
        } else {
          ui.anim(el, [{ scale: .4, opacity: 0 }, { scale: 1.08, opacity: 1, offset: .7 }, { scale: 1, opacity: 1 }], { duration: 340, easing: 'ease-out' });
          ui.sparkle(el); ui.burst(el);
        }
      });
    }
  };

  /* ------------------------------------------------------------------ selection */
  ui.onSelectionChange = function () {
    var set = {};
    ui.sel.forEach(function (u) { set[u] = true; });
    Object.keys(ui.handEls).forEach(function (uid) {
      var el = ui.handEls[uid];
      if (el.parentNode !== ui.$('hand')) return;
      el.classList.toggle('selected', !!set[uid]);
      el.setAttribute('aria-pressed', set[uid] ? 'true' : 'false');
    });
    ui.renderHandPanel();
    ui.renderControls();
    ui.refreshPopover();
  };
  ui.clearSelection = function () {
    if (!ui.sel.length) return;
    ui.sel = [];
    ui.sfx('deselect');
    ui.onSelectionChange();
  };
  ui.toggleSelect = function (uid) {
    if (ui.busy || !ui.state || ui.state.phase !== 'playing' || ui.state.blindWon) return;
    var i = ui.sel.indexOf(uid);
    if (i >= 0) { ui.sel.splice(i, 1); ui.sfx('deselect'); }
    else {
      if (ui.sel.length >= ui.MAX_SELECT) {
        ui.sfx('error');
        var el = ui.handEls[uid]; if (el) { ui.restart(el, 'jiggle'); ui.clearAfter(el, 'jiggle', 600); }
        ui.toast('You can send up to 5 cards.');
        return;
      }
      ui.sel.push(uid);
      ui.sfx('select', { pitch: Math.min(5, ui.sel.length - 1) * 0.6 });
    }
    ui.onSelectionChange();
  };
  ui.actions.card = function (el, e) {
    if (e && e.detail) { try { el.blur(); } catch (er) { /* ignore */ } }   // pointer clicks shouldn't steal Enter from Send
    ui.toggleSelect(el.dataset.uid);
  };

  /* ------------------------------------------------------------------ controls */
  ui.crumpleWhy = function () {
    var s = ui.state;
    if (!s || s.phase !== 'playing' || s.blindWon) return 'Not now.';
    if (s.crumplesLeft <= 0) {
      var b = MA.scoring.currentBoss(s);
      return b && b.id === 'the_owl' ? 'The Owl says no Crumples tonight.' : 'No Crumples left tonight.';
    }
    if (!ui.sel.length) return 'Pick the cards you want to crumple.';
    return true;
  };
  ui.renderControls = function () {
    var s = ui.state;
    if (!s || !ui.sendBtn) return;
    var playing = s.phase === 'playing' && !s.blindWon;
    var can = playing ? MA.run.canSend(s, ui.sel) : 'Not now.';
    ui.disable(ui.sendBtn, ui.busy ? 'Hold on, the letter is on its way.' : can === true ? '' : can);
    var cw = playing ? ui.crumpleWhy() : 'Not now.';
    ui.disable(ui.crumpleBtn, ui.busy ? 'Hold on, the letter is on its way.' : cw === true ? '' : cw);
    var sorts = doc.querySelectorAll('#hand-controls [data-act^="sort"]');
    for (var i = 0; i < sorts.length; i++) ui.disable(sorts[i], (ui.busy || !s.hand.length) ? 'Not now.' : '');
  };

  ui.renderDeck = function () {
    var s = ui.state;
    if (!s || !ui.deckCount) return;
    var left = s.phase === 'playing' ? s.drawPile.length : s.deck.length;
    ui.setText(ui.deckCount, left + ' / ' + s.deck.length);
    ui.$('deck-pile').setAttribute('aria-label', 'Deck: ' + left + ' of ' + s.deck.length + ' cards left. Open the deck viewer.');
  };
  ui.actions.deck = function () { if (!ui.busy) ui.showRunInfo('deck'); };

  ui.actions.send = function () { ui.doSend(); };
  ui.actions.crumple = function () { ui.doCrumple(); };
  ui.actions['sort-rank'] = function () { ui.doSort('rank'); };
  ui.actions['sort-suit'] = function () { ui.doSort('suit'); };

  ui.doSort = function (mode) {
    var s = ui.state;
    if (ui.busy || !s || s.phase !== 'playing') return;
    MA.run.sortHand(s, mode);
    ui.sfx('click');
    ui.syncHand({});
    ui.save();
  };

  /* ------------------------------------------------------------------ Crumple */
  function crumpleOut(el, i, fx, fy) {
    el.classList.remove('selected');
    el.style.zIndex = '20';
    var sp = ui.spd();
    return ui.anim(el, [
      { scale: '1 1', rotate: '0deg', opacity: 1, translate: '0 -24px' },
      { scale: '.9 .7', rotate: '-10deg', opacity: 1, translate: '0 -30px', offset: .28 },
      { scale: '.5 .42', rotate: '90deg', opacity: 1, translate: '0 -20px', offset: .55 },
      { scale: '.26 .26', rotate: '250deg', opacity: .9, translate: (fx * .35) + 'px ' + (fy * .2) + 'px', offset: .78 },
      { scale: '.12 .12', rotate: '360deg', opacity: 0, translate: fx + 'px ' + fy + 'px' }
    ], { duration: 560 / sp, delay: i * 45 / sp, easing: 'cubic-bezier(.5,0,.8,.6)', fill: 'forwards' });
  }

  ui.doCrumple = async function () {
    var s = ui.state;
    if (ui.busy || !s || s.phase !== 'playing') return;
    var why = ui.crumpleWhy();
    if (why !== true) { ui.sfx('error'); ui.toast(why); return; }
    var uids = ui.sel.slice(), before = ui.statusMap();
    var r = MA.run.crumple(s, uids);
    if (!r.ok) { ui.sfx('error'); ui.toast(r.reason || 'Can’t crumple that.'); return; }
    ui.save();
    ui.beginSeq();
    ui.sel = [];
    ui.sfx('crumple');
    ui.renderHandPanel(true);
    var dp = ui.$('deck-pile').getBoundingClientRect();
    var els = uids.map(function (u) { return ui.handEls[u]; }).filter(Boolean);
    await Promise.all(els.map(function (el, i) {
      var r0 = el.getBoundingClientRect();
      return crumpleOut(el, i, dp.left + dp.width / 2 - (r0.left + r0.width / 2), dp.top + dp.height / 2 - (r0.top + r0.height / 2));
    }));
    els.forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
    uids.forEach(function (u) { delete ui.handEls[u]; });
    ui.jiggleChanged(before);
    var drawn = MA.run.drawToFull(s);
    ui.renderSidebar();
    ui.syncHand({ deal: drawn });
    await ui.wait(drawn.length * 35 + 240);
    ui.endSeq();
    ui.settle();
  };

  /* ------------------------------------------------------------------ Letters and Constellations */
  ui.actions.use = function (btn) { ui.useConsumable(btn.dataset.uid); };

  ui.useConsumable = async function (uid) {
    var s = ui.state;
    if (ui.busy || !s) return;
    var can = MA.run.canUseConsumable(s, uid, ui.sel);
    if (can !== true) { ui.sfx('error'); ui.toast(can); return; }
    var before = ui.statusMap(), handBefore = s.hand.slice(), stampsBefore = s.stamps, lv0 = ui.levelSnap();
    ui.closePopover();
    var r = MA.run.useConsumable(s, uid, ui.sel);
    if (!r.ok) { ui.sfx('error'); ui.toast(r.reason || r.message || 'Can’t use that now.'); return; }
    ui.save();
    ui.beginSeq();
    ui.sfx('use');
    if (r.message) ui.toast(r.message);
    ui.popStamps(s.stamps - stampsBefore);
    ui.levelPops(lv0);
    try { MA.scene.sunPulse(1); } catch (e) { /* ignore */ }
    ui.sel = [];
    var drawn = [];
    if (s.phase === 'playing') {
      var gone = (r.destroyed && r.destroyed.length ? r.destroyed : handBefore.filter(function (u) { return s.hand.indexOf(u) === -1; }));
      await Promise.all(gone.map(function (u) {
        var el = ui.handEls[u];
        if (!el) return Promise.resolve();
        el.classList.remove('selected');
        ui.burst(el, 'poof');
        return ui.anim(el, [{ scale: 1, opacity: 1, rotate: '0deg' }, { scale: .3, opacity: 0, rotate: '14deg' }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
      }));
      gone.forEach(function (u) { var el = ui.handEls[u]; if (el && el.parentNode) el.parentNode.removeChild(el); delete ui.handEls[u]; });
      drawn = MA.run.drawToFull(s);
      ui.syncHand({ deal: drawn });
    }
    ui.jiggleChanged(before);
    await ui.wait(320 + drawn.length * 35);
    ui.endSeq();
    ui.settle();
  };
})(typeof window !== 'undefined' ? window : globalThis);
