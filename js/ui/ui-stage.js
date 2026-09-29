/* Midnight Airmail — UI stage (#stage): blind select, the played row, the Night Report (cash-out)
   and the Corner Stationery Shop. Everything is data-act driven (see the dispatcher in ui-core.js). */
(function (root) {
  'use strict';
  var MA = root.MA, ui = MA.ui, doc = root.document;

  ui.stageMode = null;

  /* ------------------------------------------------------------------ stage router */
  ui.renderStage = function (o) {
    o = o || {};
    var s = ui.state, st = ui.$('stage');
    if (!s) return;
    var mode = (s.phase === 'gameover' || s.phase === 'victory') ? 'none' : s.phase;
    /* game over / victory: nothing of the previous screen stays behind the modal */
    if (mode === 'none') { st.innerHTML = ''; st._h = null; ui.stageMode = 'none'; st.dataset.mode = 'none'; return; }
    var fresh = ui.stageMode !== mode;
    if (fresh) {
      st.innerHTML = ''; st._h = null;
      ui.stageMode = mode;
      st.dataset.mode = mode;
      /* a new screen: whatever button lands under the cursor must not take the previous click */
      ui.lock(400);
      st.classList.add('entering');
      setTimeout(function () { st.classList.remove('entering'); }, 400);
    }
    if (mode === 'blindSelect') renderBlindSelect(st, fresh);
    else if (mode === 'playing') renderPlaying(st);
    else if (mode === 'cashout') renderCashout(st, fresh, o);
    else if (mode === 'shop') renderShop(st, fresh, o);
    if (fresh && mode !== 'playing' && mode !== 'none' && !ui.reduced()) {
      var kid = st.firstElementChild;
      if (kid) ui.anim(kid, [{ opacity: 0, translate: '0 16px' }, { opacity: 1, translate: '0 0' }], { duration: 300, easing: 'ease-out' });
    }
  };

  /* ------------------------------------------------------------------ playing: played row + moon hint */
  ui.playedRow = function () {
    var st = ui.$('stage'), row = st.querySelector('.played');
    if (!row) {
      st.innerHTML = '<div class="played" aria-live="polite"></div><div class="stage-hint"></div>';
      st._h = null;
      row = st.querySelector('.played');
    }
    return row;
  };
  function renderPlaying(st) {
    ui.playedRow();
    var hint = st.querySelector('.stage-hint');
    if (hint) {
      var ml = ui.moonLine();
      ui.setHTML(hint, '<span class="moon-glyph" aria-hidden="true">☾</span> ' + ui.esc(ml.long));
      hint.classList.toggle('is-full', !!ml.full);
    }
  }

  /* ------------------------------------------------------------------ blind select */
  function stateLabel(st) { return st === 'done' ? 'Cleared' : st === 'skipped' ? 'Slept through' : st === 'current' ? 'Up now' : 'Later tonight'; }

  function renderBlindSelect(st) {
    var s = ui.state, ante = s.ante, skipped = ui.skipped[ante] || {};
    var h = '<div class="blind-select"><div class="bs-head paper"><span class="tape tape-teal"></span><h2 class="bs-title">Night ' + ante + ' of 8</h2>' +
      '<p class="bs-sub">' + (s.blindIndex === 0 ? 'The town is settling down. How will you spend the evening?' : 'The night goes on. What’s next?') + '</p></div><div class="blind-cards">';
    for (var i = 0; i < 3; i++) {
      var info = MA.run.blindInfo(s, i);
      var state = i < s.blindIndex ? (skipped[i] ? 'skipped' : 'done') : i === s.blindIndex ? 'current' : 'upcoming';
      var tape = info.kind === 'dusk' ? 'tape-teal' : info.kind === 'midnight' ? 'tape-pink' : 'tape-gold';
      h += '<article class="blind-card paper is-' + state + ' kind-' + info.kind + '" aria-label="' + ui.esc(info.name) + ', ' + stateLabel(state) + '">';
      h += '<span class="tape ' + tape + '"></span>';
      h += '<div class="bc-state">' + stateLabel(state) + '</div>';
      if (info.boss) h += '<div class="bc-emblem" data-tip="boss:' + info.boss.id + '">' + ui.bossSVG(info.boss.id, 76) + '</div>';
      h += '<h3 class="bc-name">' + ui.esc(info.name) + '</h3>';
      h += '<div class="bc-nums"><div class="bc-target"><span class="k">Send at least</span><span class="v">' + ui.fmt(info.target) + '</span></div>';
      h += '<div class="bc-reward"><span class="k">Reward</span>' + ui.stampSVG(15) + '<span class="v">+' + info.reward + '</span></div></div>';
      if (info.boss) {
        h += '<p class="bc-curse">' + ui.mk(info.boss.text) + '</p>';
        if (info.boss.flavor) h += '<p class="bc-flavor">' + ui.esc(info.boss.flavor) + '</p>';
      }
      if (state === 'current') {
        h += '<div class="bc-actions"><button type="button" class="btn btn-send" data-act="begin" autofocus>Begin</button>';
        if (info.canSkip) h += '<button type="button" class="btn btn-plain btn-small" data-act="skip">Sleep through it</button>';
        h += '</div>';
        if (info.canSkip) h += '<p class="bc-skip-note">Skipping earns a free pack, but no Stamps.</p>';
      }
      h += '</article>';
    }
    h += '</div>';
    var ml = ui.moonLine();
    h += '<p class="moon-hint' + (ml.full ? ' is-full' : '') + '" data-tip="moon"><span class="moon-glyph" aria-hidden="true">☾</span> Moon: ' +
      ui.esc(ui.MOON_NAMES[ui.moonPhase()]) + ' · ' + ui.esc(ml.full ? 'Full Moon next Send' : ml.n != null ? 'Full Moon after ' + ui.plural(ml.n, 'Send') : ml.long) + '</p>';
    h += '</div>';
    if (st._h !== h) { st.innerHTML = h; st._h = h; }
  }

  ui.actions.begin = function () {
    var s = ui.state;
    if (ui.busy || !s || s.phase !== 'blindSelect') return;
    var r = MA.run.startBlind(s);
    if (!r.ok) { ui.sfx('error'); ui.toast(r.reason || 'Can’t begin yet.'); return; }
    ui.sel = [];
    ui.shownScore = 0;
    ui.holdStamps = null;
    ui.sun(ui.restMood());
    ui.girl('idle');
    ui.sfx('window');
    ui.render({ deal: r.drawn, progress: true, fresh: false });
    ui.save();
    var b = MA.scoring.currentBoss(s);
    if (b) {
      ui.sfx('say');
      ui.banner(b.name, { tone: 'coral', sub: MA.util.plain(b.text), ms: 2200 });
    }
  };

  ui.actions.skip = function () {
    var s = ui.state;
    if (ui.busy || !s || s.phase !== 'blindSelect') return;
    var idx = s.blindIndex, ante = s.ante;
    var pack = MA.run.skipBlind(s);
    if (!pack) { ui.sfx('error'); ui.toast('This one can’t be skipped.'); return; }
    (ui.skipped[ante] = ui.skipped[ante] || {})[idx] = true;
    ui.sfx('pack');
    ui.settle();
  };

  /* ------------------------------------------------------------------ cash-out: the Night Report */
  function renderCashout(st, fresh, o) {
    var s = ui.state, c = s.cashout;
    if (!c) return;
    var info = MA.run.blindInfo(s);
    var h = '<div class="night-report paper"><span class="tape tape-l tape-pink"></span><span class="tape tape-r tape-teal"></span>' +
      '<h2 class="nr-title">Night Report</h2><p class="nr-sub">' + ui.esc(info.name) + ' · Night ' + s.ante + ' · ' + ui.fmt(s.roundScore) + ' Light sent</p><ul class="nr-lines">';
    var rescued = s.roundScore < s.target;      // a keepsake saved the night (Rooftop Cat)
    c.lines.forEach(function (ln, i) {
      var label = (i === 0 && rescued) ? (ui.savedName || 'Rooftop Cat') + ' saved the night' : ln.label;
      h += '<li class="cash-line"><span class="nr-label">' + ui.esc(label) + '</span><span class="nr-dots"></span><span class="nr-amt">+' + ln.amount + ' ' + ui.stampSVG(14) + '</span></li>';
    });
    h += '</ul><div class="nr-total cash-line"><span class="nr-label">Total</span><span class="nr-dots"></span><span class="nr-amt">+' + c.total + ' ' + ui.stampSVG(18) + '</span></div>' +
      '<div class="nr-actions"><button type="button" class="btn btn-gold btn-collect" data-act="collect">Collect ' + c.total + '</button></div></div>';
    if (st._h === h) return;
    st.innerHTML = h; st._h = h;
    var rep = st.querySelector('.night-report');
    if (o.instant || ui.reduced()) { rep.classList.add('ready'); rep.querySelectorAll('.cash-line').forEach(function (l) { l.classList.add('shown'); }); return; }
    revealCashout(rep);
  }
  async function revealCashout(rep) {
    var wasBusy = ui.busy;
    if (!wasBusy) ui.beginSeq();
    var lines = rep.querySelectorAll('.cash-line');
    await ui.wait(120);
    var step = Math.max(60, Math.min(130, 400 / lines.length));      // every line lands within ~half a second
    for (var i = 0; i < lines.length; i++) {
      lines[i].classList.add('shown');
      if (!ui.ff()) ui.sfx('stamp', { pitch: Math.min(9, i * 1.2) });
      if (i === lines.length - 1 && !ui.ff()) ui.sfx('total');
      await ui.wait(step);
    }
    rep.classList.add('ready');
    if (!wasBusy) ui.endSeq();
    var b = rep.querySelector('.btn-collect'); if (b && b.isConnected) { try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }

  ui.actions.collect = function () {
    var s = ui.state;
    if (ui.busy || !s || s.phase !== 'cashout') return;
    var stamps0 = s.stamps;
    var r = MA.run.collect(s);
    if (!r.ok) { ui.toast(r.reason || 'Nothing to collect.'); return; }
    ui.sfx('buy');
    ui.popStamps(s.stamps - stamps0);
    ui.sun(ui.restMood());
    if (r.phase === 'victory') { ui.render(); ui.victorySequence(); return; }
    ui.settle({ progress: true });
  };

  /* ------------------------------------------------------------------ shop */
  function itemInfo(it) {
    if (it.kind === 'keepsake') { var k = ui.keepsakeInfo({ id: it.id, data: {} }); return { name: k.name, text: k.text, label: k.rarity + ' keepsake' }; }
    var c = ui.consumableInfo(it);
    return { name: c.name, text: c.text, label: c.label };
  }
  ui.buyWhy = function (item) {
    var s = ui.state;
    if (item.sold) return 'Already sold.';
    if (s.pack) return 'Finish with the open pack first.';
    if (s.stamps < item.price) return 'Not enough Stamps.';
    if (item.kind === 'keepsake' && s.keepsakes.length >= s.keepsakeSlots) return 'Your keepsake shelf is full. Sell one first.';
    if (item.kind !== 'keepsake' && s.consumables.length >= s.consumableSlots) return 'Your consumable slots are full. Use or sell one first.';
    return '';
  };
  function priceTag(price, cant) { return '<span class="price-tag' + (cant ? ' cant' : '') + '">' + ui.stampSVG(11) + price + '</span>'; }
  function whyAttrs(why) { return why ? ' aria-disabled="true" data-why="' + ui.esc(why) + '" title="' + ui.esc(why) + '"' : ''; }

  function shopHTML() {
    var s = ui.state, shop = s.shop, h = '';
    h += '<div class="shop"><div class="shop-sign paper"><span class="tape tape-pink"></span><h2>The Corner Stationery Shop</h2>' +
      '<p>Fresh paper, sharp pencils, and a few odd trinkets.</p></div><div class="shop-shelves">';
    h += '<section class="shop-items" aria-label="On the shelf">';
    shop.items.forEach(function (it, i) {
      if (it.sold) { h += '<div class="shop-slot sold"><div class="slot-empty">Sold</div></div>'; return; }
      var info = itemInfo(it), why = ui.buyWhy(it), cls = it.kind === 'keepsake' ? 'keepsake' : 'consumable';
      h += '<div class="shop-slot" data-i="' + i + '">' +
        '<div class="' + cls + ' shop-art" role="button" tabindex="0" data-act="shop-item-info" data-i="' + i + '" data-tip="si:' + i + '" aria-label="' + ui.esc(info.name) + ', ' + ui.esc(info.label) + ', ' + it.price + ' Stamps">' +
        ui.itemSVG(it.kind, it.id) + priceTag(it.price, s.stamps < it.price) + '</div>' +
        '<p class="shop-text">' + ui.mk(info.text) + '</p>' +
        '<button type="button" class="btn btn-small btn-gold" data-act="buy" data-i="' + i + '"' + whyAttrs(why) + '>Buy</button></div>';
    });
    h += '</section><section class="shop-packs" aria-label="Packs">';
    shop.packs.forEach(function (p, i) {
      var spec = MA.run.PACKS[p.kind] || { name: p.kind, count: 3 };
      if (p.sold) { h += '<div class="shop-slot sold"><div class="slot-empty">Opened</div></div>'; return; }
      var why = s.pack ? 'Finish with the open pack first.' : s.stamps < p.price ? 'Not enough Stamps.' : '';
      var what = spec.item === 'letter' ? 'letters' : spec.item === 'constellation' ? 'constellations' : 'keepsakes';
      h += '<div class="shop-slot shop-pack" data-i="' + i + '"><div class="pack-art" role="img" aria-label="' + ui.esc(spec.name) + ', ' + p.price + ' Stamps">' + ui.packSVG(p.kind) + priceTag(p.price, s.stamps < p.price) + '</div>' +
        '<p class="shop-text">Pick 1 of ' + spec.count + ' ' + what + '</p>' +
        '<button type="button" class="btn btn-small btn-gold" data-act="buy-pack" data-i="' + i + '"' + whyAttrs(why) + '>Open</button></div>';
    });
    var rc = shop.rerollCost, rwhy = s.pack ? 'Finish with the open pack first.' : s.stamps < rc ? 'Not enough Stamps.' : '';
    var next = ui.nextBlind();
    h += '</section><div class="shop-side">' +
      '<button type="button" class="btn btn-plain" data-act="reroll"' + whyAttrs(rwhy) + '>Reroll <span class="btn-count">' + ui.stampSVG(13) + rc + '</span></button>' +
      '<button type="button" class="btn btn-send" data-act="leave-shop" autofocus>Next: ' + ui.esc(next ? next.name : 'Morning') + '</button>' +
      '</div></div></div>';
    return h;
  }
  function renderShop(st, fresh) {
    var s = ui.state;
    if (!s.shop) return;
    var h = shopHTML();
    if (st._h !== h) { st.innerHTML = h; st._h = h; }
  }

  function slotAway(slot) {
    if (!slot) return Promise.resolve();
    return ui.anim(slot, [{ opacity: 1, translate: '0 0', scale: 1 }, { opacity: 0, translate: '0 -26px', scale: .82 }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
  }

  ui.actions.buy = async function (btn) {
    var s = ui.state;
    if (ui.busy || !s || s.phase !== 'shop') return;
    var idx = +btn.dataset.i;
    ui.closePopover();
    var stamps0 = s.stamps;
    var r = MA.run.buy(s, idx);
    if (!r.ok) { ui.sfx('error'); ui.toast(r.reason || 'Can’t buy that.'); return; }
    ui.sfx('buy');
    ui.popStamps(s.stamps - stamps0);
    ui.save();
    ui.busy = true;
    await slotAway(doc.querySelector('.shop-items .shop-slot[data-i="' + idx + '"]'));
    ui.busy = false;
    ui.settle();
  };
  ui.actions['buy-pack'] = function (btn) {
    var s = ui.state;
    if (ui.busy || !s || s.phase !== 'shop') return;
    var stamps0 = s.stamps;
    var r = MA.run.buyPack(s, +btn.dataset.i);
    if (!r.ok) { ui.sfx('error'); ui.toast(r.reason || 'Can’t open that.'); return; }
    ui.sfx('pack');
    ui.popStamps(s.stamps - stamps0);
    ui.settle();
  };
  ui.actions.reroll = function () {
    var s = ui.state;
    if (ui.busy || !s || s.phase !== 'shop') return;
    var stamps0 = s.stamps;
    var r = MA.run.reroll(s);
    if (!r.ok) { ui.sfx('error'); ui.toast(r.reason || 'Can’t reroll.'); return; }
    ui.sfx('reroll');
    ui.popStamps(s.stamps - stamps0);
    ui.settle();
    doc.querySelectorAll('.shop-items .shop-slot').forEach(function (el, i) {
      ui.anim(el, [{ opacity: 0, translate: '0 -18px', rotate: '-3deg' }, { opacity: 1, translate: '0 0', rotate: '0deg' }], { duration: 320, delay: i * 70, easing: 'cubic-bezier(.3,1.3,.5,1)', fill: 'backwards' });
    });
  };
  ui.actions['leave-shop'] = function () {
    var s = ui.state;
    if (ui.busy || !s || s.phase !== 'shop') return;
    MA.run.leaveShop(s);
    ui.sfx('click');
    ui.sun('idle');
    ui.girl('idle');
    ui.settle({ progress: true });
  };
  ui.actions['shop-item-info'] = function (el) {
    if (ui.busy) return;
    var s = ui.state, i = +el.dataset.i, it = s.shop && s.shop.items[i];
    if (!it || it.sold) return;
    var key = 'si:' + i;
    if (ui.popover && ui.popover.key === key) { ui.closePopover(); return; }
    var info = itemInfo(it), why = ui.buyWhy(it), h;
    h = '<h4 class="tip-title">' + ui.esc(info.name) + '</h4><div class="tip-sub">' + ui.esc(info.label) + '</div><div class="tip-line">' + ui.mk(info.text) + '</div>';
    var flavor = it.kind === 'keepsake' ? (ui.kdef(it.id) || {}).flavor : ui.consumableInfo(it).flavor;
    if (flavor) h += '<div class="tip-line tip-flavor">' + ui.esc(flavor) + '</div>';
    h += '<div class="pop-actions"><button type="button" class="btn btn-small btn-gold" data-act="buy" data-i="' + i + '"' + whyAttrs(why) + '>Buy ' + ui.stampSVG(13) + it.price + '</button></div>';
    if (why) h += '<div class="pop-why">' + ui.esc(why) + '</div>';
    ui.openPopover(el, h, null);
  };
})(typeof window !== 'undefined' ? window : globalThis);
