/* Midnight Airmail — modals: title, How to Play, pack opening, Run info, Options, game over, victory.
   Everything renders into #overlay through ui.openModal and is wired with data-act. */
(function (root) {
  'use strict';
  var MA = root.MA, ui = MA.ui, doc = root.document;

  function esc(s) { return ui.esc(s); }
  function modal(cls) { return ui.h('div', 'modal ' + (cls || '')); }

  /* ------------------------------------------------------------------ run lifecycle */
  function resetCaches() {
    ui.handEls = {}; ui.kEls = {}; ui.cEls = {};
    ui.$('hand').innerHTML = ''; ui.$('keepsakes').innerHTML = ''; ui.$('consumables').innerHTML = '';
    var st = ui.$('stage'); st.innerHTML = ''; st._h = null; ui.stageMode = null;
    ui.rendered = false;
    ui.lastHandType = null;
    ui.hideTip(); ui.closePopover();
  }

  ui.enterGame = function (state, o) {
    o = o || {};
    resetCaches();
    ui.setState(state);
    ui.closeModal();
    ui.$('app').classList.remove('title-open');
    ui.sun('idle');
    ui.girl('idle');
    /* a save can hold a finished run (banked right after a losing Send) */
    if (state.phase === 'gameover') { ui.render({ fresh: true }); ui.clearSave(); ui.showGameOver(); return; }
    if (state.phase === 'victory') { ui.render({ fresh: true }); ui.clearSave(); ui.showVictory(); return; }
    if (state.phase === 'playing') {
      if (state.blindWon) MA.run.cashOut(state);          // the winning Send was banked: go on to the Night Report
      else MA.run.drawToFull(state);                      // a Send / Crumple / Letter was banked before its draw: finish it
    }
    ui.render({ fresh: true, progress: true, instant: !!o.instant });
    try { MA.scene.setProgress(ui.progressFor()); } catch (e) { /* ignore */ }
    ui.save();
  };

  ui.startNewRun = function (seed) {
    ui.clearSave();
    ui.skipped = {};
    var s = MA.run.newRun(seed ? String(seed) : undefined);
    ui.enterGame(s);
    ui.sfx('window');
  };

  ui.toTitle = function () {
    ui.state = null;
    ui.closeModal();
    ui.showTitle();
  };

  ui.actions['new-run'] = function (btn) {
    var inp = doc.querySelector('.seed-input');
    /* a saved run exists: ask once before erasing it (no window.confirm) */
    if (btn && btn.dataset && ui.hasSave() && btn.dataset.armed !== '1') {
      btn.dataset.armed = '1';
      btn.textContent = 'Erase saved run?';
      ui.toast('Starting a new run erases your saved one. Press again to confirm.');
      setTimeout(function () { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = 'New Run'; } }, 4000);
      return;
    }
    ui.startNewRun(inp ? inp.value.trim() : '');
  };
  ui.actions['new-run-plain'] = function () { ui.startNewRun(''); };
  ui.actions.continue = function () {
    var s = ui.loadSave();
    if (!s) { ui.toast('No saved run found.'); return; }
    ui.enterGame(s, { instant: true });
  };
  ui.actions.title = function () { ui.toTitle(); };

  /* ------------------------------------------------------------------ title */
  ui.showTitle = function () {
    var app = ui.$('app');
    app.classList.add('title-open');
    var has = ui.hasSave();
    var m = modal('title-modal');
    m.innerHTML =
      '<div class="title-plane" aria-hidden="true">' + ui.planeSVG(74) + '</div>' +
      '<h1 class="title-h"><span class="w1">Midnight</span> <span class="w2">Airmail</span></h1>' +
      '<p class="title-sub">A girl at her lit window folds every letter into a paper airplane. Send them over the sleeping town and light every window before morning.</p>' +
      '<div class="title-actions"><button type="button" class="btn btn-send" data-act="new-run" autofocus>New Run</button>' +
      (has ? '<button type="button" class="btn btn-gold" data-act="continue">Continue</button>' : '') +
      '<button type="button" class="btn btn-plain" data-act="how-to">How to Play</button></div>' +
      '<label class="seed-row"><span>Seed (optional)</span><input class="seed-input" type="text" maxlength="24" placeholder="random" autocomplete="off" spellcheck="false"></label>';
    ui.openModal(m, { kind: 'title', dismiss: false });
    try {
      MA.scene.setMoonPhase(2, false);
      MA.scene.setProgress(0.45);
      MA.scene.setDawn(0.05);
      MA.scene.sunMood('idle');
    } catch (e) { /* ignore */ }
    var inp = m.querySelector('.seed-input');
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ui.actions['new-run'](m.querySelector('[data-act="new-run"]')); } });
  };

  /* ------------------------------------------------------------------ how to play */
  ui.showHowTo = function (from) {
    ui.howFrom = from || (ui.state ? 'game' : 'title');
    var m = modal('how-modal');
    m.innerHTML = '<span class="tape tape-l tape-pink"></span><span class="tape tape-r tape-teal"></span><h2>How to Play</h2>' +
      '<ul class="how-list">' +
      '<li><b>Send letters.</b> Pick up to 5 cards and press <b>Send</b>. Each Send is a letter, and the hand it makes decides how far the plane flies.</li>' +
      '<li><b>Light = Ink × Glow.</b> Cards add <span class="t-ink">Ink</span>, stickers and keepsakes add <span class="t-glow">Glow</span>. Multiply them for your Light.</li>' +
      '<li><b>Beat the night.</b> Reach the target Light before your Sends run out, or morning comes too soon.</li>' +
      '<li><b>Crumple</b> cards you don’t want to swap them for fresh ones. You only get a few each night.</li>' +
      '<li><b>The moon waxes with every Send.</b> Send under a <span class="t-xglow">Full Moon</span> and your Glow doubles. Plan your big hand for it.</li>' +
      '<li><b>Letters</b> like Fold and Tear reshape your cards. <b>Constellations</b> make a hand type stronger for good.</li>' +
      '<li><b>Keepsakes</b> are your helpers (5 slots). Drag them to reorder: order matters for ×Glow.</li>' +
      '<li><b>Every night has three parts:</b> Dusk, Midnight, and a Visitor with a curse. Beat Night 8 before daybreak.</li></ul>' +
      '<p class="how-keys">Keys: <b>Enter</b> Send · <b>C</b> Crumple · <b>Esc</b> clear selection · <b>Space</b> or click to speed up a Send.</p>' +
      '<div class="modal-actions"><button type="button" class="btn btn-send" data-act="how-close" autofocus>Got it</button></div>';
    var from = ui.howFrom;
    ui.openModal(m, { kind: 'how', onClose: function () {
      if (from === 'title' && !ui.state) ui.showTitle();
      else if (from === 'options') ui.showOptions();
    } });
  };
  ui.actions['how-to'] = function () { ui.showHowTo('title'); };
  ui.actions['how-close'] = function () { ui.closeModal(); };

  /* ------------------------------------------------------------------ packs */
  function packChoice(ch, i, why) {
    var info, art, label;
    if (ch.kind === 'keepsake') {
      var k = ui.keepsakeInfo({ id: ch.id, data: {} });
      info = { name: k.name, text: k.text, flavor: k.flavor }; label = k.rarity + ' keepsake';
    } else {
      var c = ui.consumableInfo(ch);
      info = c; label = c.label;
    }
    art = ui.itemSVG(ch.kind, ch.id);
    return '<div class="pack-choice"><div class="pack-art" role="img" aria-label="' + esc(info.name) + '">' + art + '</div>' +
      '<h3 class="pc-name">' + esc(info.name) + '</h3><div class="tip-sub">' + esc(label) + '</div>' +
      '<p class="pc-text">' + ui.mk(info.text) + '</p>' +
      (info.lv ? '<p class="pc-lv">' + ui.mk(info.lv) + '</p>' : '') +
      '<button type="button" class="btn btn-gold" data-act="pick" data-i="' + i + '"' +
      (why ? ' aria-disabled="true" data-why="' + esc(why) + '" title="' + esc(why) + '"' : '') + '>Pick</button>' +
      (why ? '<p class="pc-why">' + esc(why) + '</p>' : '') + '</div>';
  }
  function pickWhy(ch) {
    var s = ui.state;
    if (ch.kind === 'keepsake' && s.keepsakes.length >= s.keepsakeSlots) return 'Your keepsake shelf is full.';
    if (ch.kind === 'letter' && s.consumables.length >= s.consumableSlots) return 'Your consumable slots are full.';
    return '';
  }
  ui.showPack = function () {
    var s = ui.state, pack = s && s.pack;
    if (!pack) return;
    var spec = MA.run.PACKS[pack.kind] || { name: 'Pack' };
    var m = modal('modal-dark modal-wide dark pack-modal');
    var full = false;
    var choices = pack.choices.map(function (ch, i) { var why = pickWhy(ch); if (why) full = true; return packChoice(ch, i, why); }).join('');
    var sellRow = '';
    if (full) {
      var kinds = pack.choices.map(function (c) { return c.kind; });
      var list = (kinds.indexOf('keepsake') !== -1 ? s.keepsakes.map(function (k) { return { uid: k.uid, name: ui.kname(k.id), v: MA.run.sellValue(s, k.uid) }; }) : s.consumables.map(function (c) { return { uid: c.uid, name: ui.consumableInfo(c).name, v: 1 }; }));
      sellRow = '<div class="pack-sell"><p>No room. Sell one to make space:</p><div class="pack-sell-list">' +
        list.map(function (o) { return '<button type="button" class="btn btn-small btn-plain" data-act="pack-sell" data-uid="' + o.uid + '">Sell ' + esc(o.name) + ' ' + ui.stampSVG(13) + '+' + o.v + '</button>'; }).join('') + '</div></div>';
    }
    m.innerHTML = '<span class="tape tape-l tape-gold"></span><span class="tape tape-r tape-pink"></span>' +
      '<h2>' + esc(spec.name) + '</h2><p class="pack-sub">' + (pack.source === 'skip' ? 'A little gift for sleeping through it. Pick one.' : 'Pick 1, or skip.') + '</p>' +
      '<div class="pack-choices">' + choices + '</div>' + sellRow +
      '<div class="modal-actions"><button type="button" class="btn btn-plain" data-act="skip-pack">Skip</button></div>';
    ui.openModal(m, { kind: 'pack', dismiss: false, focus: 'self' });
    ui.sfx('pack');
    if (!ui.reduced()) m.querySelectorAll('.pack-choice').forEach(function (el, i) {
      ui.anim(el, [{ opacity: 0, translate: '0 26px', rotate: '-3deg' }, { opacity: 1, translate: '0 0', rotate: '0deg' }], { duration: 380, delay: 120 + i * 110, easing: 'cubic-bezier(.3,1.3,.5,1)', fill: 'backwards' });
    });
  };
  ui.actions.pick = function (btn) {
    var s = ui.state, lv0 = ui.levelSnap();
    var r = MA.run.choosePack(s, +btn.dataset.i);
    if (!r.ok) { ui.sfx('error'); ui.toast(r.reason || 'Can’t take that.'); return; }
    ui.closeModal();
    ui.sfx(r.kind === 'constellation' ? 'use' : 'buy');
    ui.toast(r.message || 'Picked!');
    if (r.kind === 'constellation') { try { MA.scene.sunPulse(1.4); } catch (e) { /* ignore */ } }
    ui.settle();
    ui.levelPops(lv0);
  };
  ui.actions['skip-pack'] = function () {
    MA.run.skipPack(ui.state);
    ui.closeModal();
    ui.sfx('click');
    ui.settle();
  };
  ui.actions['pack-sell'] = function (btn) {
    var r = MA.run.sell(ui.state, btn.dataset.uid);
    if (!r.ok) { ui.toast(r.reason || 'Can’t sell that.'); return; }
    ui.sfx('sell');
    ui.renderTop(); ui.renderSidebar();
    ui.showPack();
    ui.save();
  };

  /* ------------------------------------------------------------------ Run info */
  function handsTab() {
    var s = ui.state, rows = MA.hands.ORDER.slice().reverse().map(function (t) {
      var info = MA.hands.INFO[t], v = MA.hands.values(s, t), lv = s.handLevels[t];
      if (info.secret && lv.sent === 0) return '<tr class="secret"><td colspan="4"><span class="ht-name">???</span> <span class="ht-poker">a secret hand</span></td></tr>';
      return '<tr><td><span class="ht-name">' + esc(info.name) + '</span> <span class="ht-poker">' + esc(info.poker) + '</span></td>' +
        '<td class="ht-lvl">' + v.level + '</td><td class="ht-mult"><span class="t-ink">' + ui.fmt(v.ink) + '</span> × <span class="t-glow">' + ui.fmt(v.glow) + '</span></td><td class="ht-sent">' + lv.sent + '</td></tr>';
    }).join('');
    return '<table class="hand-table"><thead><tr><th>Hand</th><th>Lvl</th><th>Ink × Glow</th><th>Sent</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
  function nightTab() {
    var s = ui.state, skipped = ui.skipped[s.ante] || {}, h = '<p class="ri-note">Night ' + s.ante + ' of 8 · the moon is ' + esc(ui.MOON_NAMES[ui.moonPhase()]) + '</p><div class="ri-blinds">';
    for (var i = 0; i < 3; i++) {
      var info = MA.run.blindInfo(s, i);
      var st = s.phase === 'blindSelect' || s.phase === 'playing' || s.phase === 'cashout' || s.phase === 'shop'
        ? (i < s.blindIndex || (s.phase === 'shop' && i === s.blindIndex) || (s.phase === 'cashout' && i === s.blindIndex) ? (skipped[i] ? 'Slept through' : 'Cleared') : i === s.blindIndex ? 'Now' : 'Later') : '';
      h += '<div class="ri-blind kind-' + info.kind + '"><div class="rb-head"><h3>' + esc(info.name) + '</h3><span class="rb-state">' + st + '</span></div>' +
        '<div class="rb-nums"><span>Send at least <b>' + ui.fmt(info.target) + '</b></span><span>Reward ' + ui.stampSVG(13) + ' <b>+' + info.reward + '</b></span></div>' +
        (info.boss ? '<p class="rb-curse">' + ui.mk(info.boss.text) + '</p>' : '') + '</div>';
    }
    return h + '</div>';
  }
  function deckTab() {
    var s = ui.state, inPile = {}, playing = s.phase === 'playing';
    s.drawPile.forEach(function (u) { inPile[u] = true; });
    var h = '<p class="ri-note">' + (playing ? s.drawPile.length + ' in the draw pile · ' : '') + s.deck.length + ' cards in your deck. Faded cards are not in the draw pile.</p>';
    MA.cards.SUITS.forEach(function (suit) {
      var cards = s.deck.filter(function (c) { return c.suit === suit; }).sort(function (a, b) { return b.rank - a.rank || (a.uid < b.uid ? -1 : 1); });
      h += '<div class="deck-suit"><div class="ds-head">' + ui.suitIcon(suit, 18, true) + ' ' + esc(MA.cards.SUIT_INFO[suit].name) + ' <span>' + cards.length + '</span></div><div class="deck-grid">';
      cards.forEach(function (c) {
        h += '<div class="card mini' + (playing && !inPile[c.uid] ? ' out' : '') + (c.debuffed ? ' debuffed' : '') + '" data-tip="c:' + c.uid + '">' + ui.cardSVG(c) + '</div>';
      });
      h += '</div></div>';
    });
    return h;
  }
  var TABS = [['hands', 'Hands'], ['night', 'This Night'], ['deck', 'Deck']];
  ui.showRunInfo = function (tab) {
    var s = ui.state;
    if (!s) return;
    tab = tab || ui.riTab || 'hands';
    ui.riTab = tab;
    var body = tab === 'hands' ? handsTab() : tab === 'night' ? nightTab() : deckTab();
    var m = modal('modal-dark modal-wide dark runinfo-modal');
    m.innerHTML = '<h2>Run info</h2><div class="ri-tabs" role="tablist">' +
      TABS.map(function (t) { return '<button type="button" role="tab" class="btn btn-small ' + (t[0] === tab ? 'btn-gold' : 'btn-plain') + '" aria-selected="' + (t[0] === tab) + '" data-act="ri-tab" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') +
      '</div><div class="ri-body">' + body + '</div><div class="modal-actions"><button type="button" class="btn btn-send" data-act="close-modal" autofocus>Close</button></div>';
    var prev = ui.modalKind() === 'runinfo' ? ui.$('overlay').querySelector('.ri-body') : null;
    var scroll = prev ? prev.scrollTop : 0;
    ui.openModal(m, { kind: 'runinfo' });
    if (scroll) m.querySelector('.ri-body').scrollTop = scroll;
  };
  ui.actions['ri-tab'] = function (b) { ui.sfx('click'); ui.showRunInfo(b.dataset.tab); };
  ui.actions['close-modal'] = function () { ui.closeModal(); };

  /* ------------------------------------------------------------------ Options */
  function seg(act, val, cur, label) {
    return '<button type="button" class="btn btn-small ' + (cur === val ? 'btn-gold' : 'btn-plain') + '" data-act="' + act + '" data-v="' + val + '" aria-pressed="' + (cur === val) + '">' + label + '</button>';
  }
  ui.showOptions = function () {
    var st = ui.settings;
    var m = modal('options-modal');
    m.innerHTML = '<h2>Options</h2>' +
      '<div class="opt-row"><span class="opt-k">Sequence speed</span><span class="opt-v">' + seg('speed', 1, st.speed, '1×') + seg('speed', 2, st.speed, '2×') + seg('speed', 3, st.speed, '3×') + seg('speed', 0, st.speed, 'Instant') + '</span></div>' +
      '<div class="opt-row"><span class="opt-k">Sound</span><span class="opt-v">' + seg('sound', 1, st.sound ? 1 : 0, 'On') + seg('sound', 0, st.sound ? 1 : 0, 'Off') +
      '<input type="range" min="0" max="100" value="' + Math.round(st.volume * 100) + '" data-range="volume" aria-label="Sound volume"></span></div>' +
      '<div class="opt-row"><span class="opt-k">Music</span><span class="opt-v">' + seg('music', 1, st.music ? 1 : 0, 'On') + seg('music', 0, st.music ? 1 : 0, 'Off') +
      '<input type="range" min="0" max="100" value="' + Math.round(st.musicVolume * 100) + '" data-range="musicVolume" aria-label="Music volume"></span></div>' +
      '<div class="opt-row"><span class="opt-k">Help</span><span class="opt-v"><button type="button" class="btn btn-small btn-plain" data-act="how-from-options">How to Play</button>' +
      '<button type="button" class="btn btn-small btn-plain" data-act="to-title">Title screen</button></span></div>' +
      '<div class="opt-row abandon"><span class="opt-k">This run</span><span class="opt-v">' +
      '<button type="button" class="btn btn-small btn-crumple abandon-ask" data-act="abandon-ask">Abandon run</button>' +
      '<span class="abandon-confirm">Really give up this run? <button type="button" class="btn btn-small btn-crumple" data-act="abandon-yes">Yes, abandon</button> <button type="button" class="btn btn-small btn-plain" data-act="abandon-no">Keep going</button></span></span></div>' +
      '<div class="modal-actions"><button type="button" class="btn btn-send" data-act="close-modal" autofocus>Close</button></div>';
    ui.openModal(m, { kind: 'options' });
  };
  ui.actions.speed = function (b) { ui.settings.speed = +b.dataset.v; ui.saveSettings(); ui.sfx('click'); ui.showOptions(); };
  ui.actions.sound = function (b) { ui.settings.sound = b.dataset.v === '1'; ui.saveSettings(); ui.applyAudio(); ui.sfx('click'); ui.showOptions(); };
  ui.actions.music = function (b) { ui.settings.music = b.dataset.v === '1'; ui.saveSettings(); ui.applyAudio(); ui.showOptions(); };
  ui.actions['how-from-options'] = function () { ui.showHowTo('options'); };
  ui.actions['to-title'] = function () { ui.save(); ui.toTitle(); };       // the run stays saved: Continue picks it up
  ui.actions['abandon-ask'] = function (b) { b.closest('.abandon').classList.add('asking'); };
  ui.actions['abandon-no'] = function (b) { b.closest('.abandon').classList.remove('asking'); };
  ui.actions['abandon-yes'] = function () { ui.clearSave(); ui.toTitle(); };
  doc.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.dataset || !t.dataset.range) return;
    ui.settings[t.dataset.range] = (+t.value) / 100;
    ui.saveSettings();
    ui.applyAudio();
    if (t.dataset.range === 'volume') { clearTimeout(ui._volT); ui._volT = setTimeout(function () { ui.sfx('select'); }, 120); }
  });

  /* ------------------------------------------------------------------ game over / victory */
  function statsHTML() {
    var s = ui.state, st = s.stats;
    function row(k, v) { return '<div class="stat"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>'; }
    return '<div class="stats">' + row('Night reached', s.ante + ' / 8') +
      row('Light needed', ui.fmtBig(s.target)) + row('Light sent', ui.fmtBig(s.roundScore)) +
      row('Best Light in one Send', ui.fmtBig(st.bestLight)) + row('Letters sent', ui.fmt(st.handsSent)) +
      row('Letters used', ui.fmt(st.lettersUsed)) + row('Visitors sent away', ui.fmt(st.bossesBeaten)) +
      '<div class="stat seed"><span class="k">Seed</span><span class="v">' + esc(String(s.seed)) + '</span></div></div>';
  }
  ui.showGameOver = function () {
    ui.sun('sleepy');
    ui.girl('sleepy');
    var m = modal('modal-dark dark over-modal');
    m.innerHTML = '<span class="tape tape-l tape-pink"></span><span class="tape tape-r tape-gold"></span><h2>Morning came too soon</h2>' +
      '<p class="over-sub">The sun peeks over the rooftops and the last window stays dark. There is always tomorrow night.</p>' + statsHTML() +
      '<div class="modal-actions"><button type="button" class="btn btn-send" data-act="new-run-plain" autofocus>New Run</button><button type="button" class="btn btn-plain" data-act="title">Title</button></div>';
    ui.openModal(m, { kind: 'over', dismiss: false, focus: 'self' });
  };
  /* The celebration before the victory card: no dim, windows light one by one, planes everywhere. */
  ui.victorySequence = async function () {
    ui.beginSeq();
    ui.clearSave();                                   // the run is won: nothing left to resume
    try {
      MA.scene.setDawn(1);
      ui.sun('wow'); ui.girl('happy');
      ui.banner('Daybreak!', { tone: 'teal', ms: 1500 });
      ui.sfx('win');
      MA.scene.setProgress(0.03);
      var steps = 12;
      for (var k = 1; k <= steps; k++) {
        await ui.sleep(80);
        MA.scene.setProgress(k / steps);
        if (k % 3 === 0) ui.sfx('window', { pitch: k * 0.5 });
      }
      MA.scene.celebrate();
      var W = root.innerWidth, H = root.innerHeight;
      for (var p = 0; p < 5; p++) {
        MA.scene.flyPlane(W * (0.12 + Math.random() * 0.7), H * (0.35 + Math.random() * 0.45), { duration: 1000 });
        ui.sfx('plane', { pitch: p });
        await ui.sleep(230);
      }
      await ui.sleep(700);
    } catch (e) { if (root.console) root.console.error(e); }
    ui.endSeq();
    ui.showVictory();
  };
  ui.showVictory = function () {
    ui.clearSave();
    try { MA.scene.setDawn(1); MA.scene.setProgress(1); } catch (e) { /* ignore */ }
    ui.girl('happy');
    var m = modal('victory-modal');
    m.innerHTML = '<span class="tape tape-l tape-gold"></span><span class="tape tape-r tape-teal"></span><h2>Every letter arrived before daybreak</h2>' +
      '<p class="over-sub">The whole town glows in the pink light of morning, and one girl finally falls asleep at her window.</p>' + statsHTML() +
      '<div class="modal-actions"><button type="button" class="btn btn-send" data-act="new-run-plain" autofocus>New Run</button><button type="button" class="btn btn-plain" data-act="title">Title</button></div>';
    ui.openModal(m, { kind: 'victory', dismiss: false, focus: 'self' });
  };
})(typeof window !== 'undefined' ? window : globalThis);
