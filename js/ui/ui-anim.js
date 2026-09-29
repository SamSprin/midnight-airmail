/* Midnight Airmail — the scoring sequence. Send a hand: cards fly to the stage, the engine's event
   list is stepped through one beat at a time (pops, pulses, rising pitch, a rolling running Light),
   the total becomes a paper airplane that lights the town, then the outcome (draw / cash-out /
   rescue / game over) plays out. Input is locked meanwhile; a click, tap or Space fast-forwards.
   The run is saved the moment MA.run.send returns, so a reload can never undo a Send. */
(function (root) {
  'use strict';
  var MA = root.MA, ui = MA.ui, doc = root.document;

  function E() { return ui.sidebarEls; }

  /* Where a scoring event "comes from" on screen. */
  function srcElement(ev) {
    var s = ev.src || {};
    if (s.kind === 'card' || s.kind === 'held') return ui.handEls[s.uid] || null;
    if (s.kind === 'keepsake') return ui.kEls[s.uid] || null;
    if (s.kind === 'boss') return doc.querySelector('#blind-panel .blind-emblem') || ui.$('blind-panel');
    return E().multRow;
  }
  function popWhere(ev) {
    var k = (ev.src || {}).kind;
    return k === 'keepsake' ? 'low' : k === 'boss' || k === 'hand' ? 'mid' : 'top';
  }

  /* Highlight the card that is currently scoring (glow + hop). */
  function markCard(seq, uid, again) {
    var el = uid ? ui.handEls[uid] : null;
    if (!el) return;
    if (seq.card !== uid || again) {
      if (seq.card && ui.handEls[seq.card]) ui.handEls[seq.card].classList.remove('scoring');
      ui.restart(el, 'scoring');
      seq.card = uid;
    }
  }
  function clearMarks(seq) {
    if (seq.card && ui.handEls[seq.card]) ui.handEls[seq.card].classList.remove('scoring');
    seq.card = null;
  }

  /* Face-down card turning over as it lands on the stage. */
  function revealCard(el, card) {
    var svg = el.firstElementChild;
    ui.anim(svg, [{ scale: '1 1' }, { scale: '0 1' }], { duration: 150 }).then(function () {
      ui.updateCardEl(el, card);
      var n = el.firstElementChild;
      ui.anim(n, [{ scale: '0 1' }, { scale: '1 1' }], { duration: 170 });
    });
  }

  ui.countScore = function (to, ms) {
    var from = ui.shownScore, t0 = root.performance.now();
    return new Promise(function (res) {
      function frame() {
        var p = Math.min(1, (root.performance.now() - t0) / ms), e = 1 - Math.pow(1 - p, 3);
        if (p >= 1 || ui.ff()) { ui.shownScore = to; ui.setScore(to); return res(); }
        ui.shownScore = Math.round(from + (to - from) * e);
        ui.setScore(ui.shownScore);
        setTimeout(frame, 30);
      }
      frame();
    });
  };

  /* ------------------------------------------------------------------ rolling total + "speed up" chip */
  var runEl = null;
  function runTotalSet(ink, glow, bump) {
    if (!runEl) return;
    var v = Math.floor(Math.max(0, ink) * Math.max(0, glow) + 1e-9);
    var t = '= ' + ui.fmtBig(v);
    if (runEl.textContent !== t) { runEl.textContent = t; if (bump) ui.bump(runEl); }
  }
  function runTotalShow(row) {
    runTotalHide();
    var r = row.getBoundingClientRect();
    runEl = ui.h('div', 'pop run-total');
    runEl.style.left = Math.round(r.left + r.width / 2) + 'px';
    runEl.style.top = Math.max(50, Math.round(r.top - 10)) + 'px';
    doc.body.appendChild(runEl);
  }
  function runTotalHide() { if (runEl && runEl.parentNode) runEl.parentNode.removeChild(runEl); runEl = null; }

  var chipEl = null;
  ui.showChip = function () {
    ui.hideChip();
    if (ui.settings.ffUsed || ui.settings.speed === 0) return;
    var st = ui.$('stage').getBoundingClientRect();
    chipEl = ui.h('div', 'ff-chip', ui.isTouch() ? 'Tap to speed up' : 'Click to speed up');
    chipEl.style.left = Math.round(st.left + st.width / 2) + 'px';
    chipEl.style.top = Math.round(st.top + 8) + 'px';
    doc.body.appendChild(chipEl);
  };
  ui.hideChip = function () { if (chipEl && chipEl.parentNode) chipEl.parentNode.removeChild(chipEl); chipEl = null; };

  /* ------------------------------------------------------------------ one beat of the event list */
  async function step(seq, ev, i) {
    var ff = ui.ff(), el = srcElement(ev), src = ev.src || {}, sp = ui.spd();
    var pitch = Math.min(12, seq.beat * 0.55);
    var fx = !ff;
    if (ev.cardUid || src.kind === 'card') markCard(seq, ev.cardUid || src.uid, ev.t === 'retrigger');
    if (fx && src.kind === 'keepsake') ui.jiggle(el);
    if (fx && src.kind === 'boss') ui.jiggle(el);
    var E_ = E(), delay = 380;
    switch (ev.t) {
      case 'hand':
        ui.setHandName(ev.text || seq.result.name, ev.level || seq.result.level, seq.result.poker);
        ui.setBox('ink', ev.ink); ui.setBox('glow', ev.glow);
        runTotalSet(ev.ink, ev.glow, false);
        if (fx) { ui.bump(E_.inkBox); ui.bump(E_.glowBox); ui.sfx('select', { pitch: 0 }); }
        delay = 240;
        break;
      case 'ink':
        ui.setBox('ink', ev.ink, fx);
        runTotalSet(ev.ink, ev.glow, fx);
        if (fx) { ui.popAt(el, 'ink', ui.signed(ev.amount), popWhere(ev)); ui.sfx('ink', { pitch: pitch }); }
        seq.beat++;
        break;
      case 'glow':
        ui.setBox('glow', ev.glow, fx);
        runTotalSet(ev.ink, ev.glow, fx);
        if (fx) { ui.popAt(el, 'glow', ui.signed(ev.amount), popWhere(ev)); ui.sfx('glow', { pitch: pitch }); try { MA.scene.sunPulse(0.6); } catch (e) { /* ignore */ } }
        seq.beat++;
        break;
      case 'xglow':
        ui.setBox('glow', ev.glow, fx);
        runTotalSet(ev.ink, ev.glow, fx);
        if (src.kind === 'moon') {
          seq.fullMoon = true;
          if (fx) {
            /* the Full Moon moment: a held beat, the banner tears in, the moon swells, everyone gasps */
            ui.banner('Full Moon ×' + ui.fmt(ev.amount), { tone: 'coral', ms: 1400 });
            ui.sfx('moon'); ui.sfx('xglow', { pitch: pitch });
            try { MA.scene.sunPulse(1.6); if (MA.scene.moonBurst) MA.scene.moonBurst(); } catch (e) { /* ignore */ }
            ui.sun('wow'); ui.girl('wow', 1600);
          }
          delay = 800;
        } else if (fx) {
          ui.popAt(el, 'xglow', '×' + ui.fmt(ev.amount), popWhere(ev));
          ui.sfx('xglow', { pitch: pitch });
          try { MA.scene.sunPulse(1.2); } catch (e) { /* ignore */ }
          delay = 400;
        }
        seq.beat++;
        break;
      case 'moon':
        if (fx) { ui.banner('Full Moon', { tone: 'coral', ms: 1300 }); ui.sfx('moon'); try { if (MA.scene.moonBurst) MA.scene.moonBurst(); } catch (e) { /* ignore */ } ui.sun('wow'); ui.girl('wow', 1600); }
        seq.fullMoon = true;
        delay = 700;
        break;
      case 'stamps':
        ui.holdStamps = (ui.holdStamps || 0) + (ev.amount || 0);
        ui.renderSidebar();
        if (fx) { ui.popAt(el, 'stamp', '+' + ev.amount + ' Stamp' + (ev.amount === 1 ? '' : 's'), popWhere(ev)); ui.sfx('stamp', { pitch: pitch }); }
        break;
      case 'retrigger':
        if (fx) { ui.popAt(el, 'say', ev.text || 'Again!', popWhere(ev)); ui.sfx('retrigger', { pitch: pitch }); }
        delay = 320;
        break;
      case 'say':
        if (fx) { ui.popAt(el, 'say', ev.text || '', popWhere(ev)); ui.sfx('say', { pitch: pitch }); }
        break;
      case 'debuffed':
        if (fx && el) { ui.popAt(el, 'say', 'Debuffed', 'top'); ui.sfx('deselect'); ui.jiggle(el); }
        delay = 260;
        break;
      default:
        delay = 0;
    }
    /* the tempo picks up as a long chain rolls on */
    if (delay) await ui.sleep(delay * Math.max(0.35, 1 - i * 0.03) / sp);
  }

  /* ------------------------------------------------------------------ Send */
  ui.doSend = async function () {
    var s = ui.state;
    if (ui.busy || !s || s.phase !== 'playing') return;
    var can = MA.run.canSend(s, ui.sel);
    if (can !== true) { ui.sfx('error'); ui.toast(can); return; }

    var uids = ui.sel.slice();
    var kBefore = s.keepsakes.map(function (k) { return { uid: k.uid, id: k.id }; });
    var status = ui.statusMap();
    var wasDown = {};
    uids.forEach(function (u) { var c = MA.run.getCard(s, u); wasDown[u] = !!(c && c.faceDown); });
    var stampsBefore = s.stamps, moonBefore = s.moonPhase, moonHid = ui.moonHidden();

    var res = MA.run.send(s, uids);
    if (!res.ok) { ui.sfx('error'); ui.toast(res.reason || 'Can’t send that.'); return; }
    var r = res.result;
    ui.save(true);                    // the Send is banked: a reload from here resumes after it, never before it

    ui.beginSeq();
    ui.sel = [];
    ui.holdStamps = stampsBefore;
    ui.moonOverride = moonBefore;
    ui.moonHiddenOverride = moonHid;
    var seq = ui.seq; seq.result = r; seq.beat = 0; seq.card = null; seq.fullMoon = false;
    try {
      await playSend(s, res, r, kBefore, status, wasDown);
    } catch (err) {
      if (root.console) root.console.error(err);
    }
    /* whatever happened above, never leave the table locked */
    runTotalHide();
    ui.holdStamps = null; ui.moonOverride = null; ui.moonHiddenOverride = null;
    ui.endSeq();
    ui.postSend(s, res);
  };

  async function playSend(s, res, r, kBefore, status, wasDown) {
    var seq = ui.seq, sp = ui.spd();
    ui.renderSidebar();
    ui.renderControls();
    ui.sfx('send');
    ui.showChip();

    /* a. cards fly from the hand to the stage row (FLIP) */
    var row = ui.playedRow();
    row.innerHTML = '';
    var kids = Array.prototype.slice.call(ui.$('hand').children);
    var playedEls = res.played.map(function (u) { return ui.handEls[u]; }).filter(Boolean);
    playedEls.forEach(function (el) { el.style.transition = 'none'; el.classList.remove('selected'); el.setAttribute('aria-pressed', 'false'); });
    ui.flip(kids, function () {
      playedEls.forEach(function (el) { row.appendChild(el); });
      ui.fitHand();
    }, { duration: 300 });
    root.requestAnimationFrame(function () { playedEls.forEach(function (el) { el.style.transition = ''; }); });
    res.played.forEach(function (u) { if (wasDown[u] && ui.handEls[u]) revealCard(ui.handEls[u], MA.run.getCard(s, u)); });
    await ui.sleep(240 / sp);
    /* make sure the cards have landed (pops are placed from their real rects) */
    playedEls.forEach(function (el) { try { el.getAnimations().forEach(function (a) { if (a.effect && a.effect.getTiming().iterations !== Infinity) a.finish(); }); } catch (e) { /* ignore */ } });
    if (!ui.ff()) runTotalShow(row);

    /* b + c. hand event, then step through every event */
    var events = r.events, last = events.length && events[events.length - 1].t === 'total' ? events.length - 1 : events.length;
    ui.setHandName(r.name, r.level, r.poker);
    for (var i = 0; i < last; i++) await step(seq, events[i], i);
    clearMarks(seq);
    ui.setBox('ink', r.ink); ui.setBox('glow', r.glow);
    ui.previewType = r.handType;
    ui.lastHandType = r.handType;

    /* d. total, then the plane */
    var E_ = E();
    ui.setText(E_.poker, '= ' + ui.fmtBig(r.light) + ' Light');
    E_.poker.classList.add('is-total');
    var rowRect = row.getBoundingClientRect();
    var cx = rowRect.left + rowRect.width / 2, cy = rowRect.top + rowRect.height / 2;
    if (runEl) {
      runTotalSet(r.ink, r.glow, false);
      runEl.textContent = '= ' + ui.fmtBig(r.light);
      runEl.classList.add('final');
      ui.bump(runEl);
    }
    if (!ui.ff()) { ui.sfx('total'); ui.bump(E_.inkBox); ui.bump(E_.glowBox); }
    await ui.sleep(320 / sp);
    E_.poker.classList.remove('is-total');

    var bigHand = s.target > 0 && r.light >= s.target * 0.5;
    var wow = bigHand || seq.fullMoon;
    ui.sun(wow ? 'wow' : 'happy');
    ui.girl('look');
    ui.sfx('plane');
    playedEls.forEach(function (el, i) {
      ui.anim(el, [{ scale: 1, opacity: 1, translate: '0 0' }, { scale: .3, opacity: 0, translate: '0 -24px' }], { duration: 260 / sp, delay: i * 25 / sp, easing: 'ease-in', fill: 'forwards' });
    });
    /* the plane flies while the round Light counts up; the town lights when it lands */
    var prog = s.target ? s.roundScore / s.target : 0;
    var fly = MA.scene.flyPlane(cx, cy, { duration: 700 / sp });
    var landed = Promise.resolve(fly).then(function () {
      MA.scene.setProgress(prog);
      ui.sfx('window');
      ui.bump(E_.score.parentNode);
    }, function () { MA.scene.setProgress(prog); });
    if (ui.ff()) MA.scene.setProgress(prog);
    var counted = ui.countScore(s.roundScore, 700 / sp);
    await Promise.all([landed, counted]);
    runTotalHide();
    playedEls.forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
    res.played.forEach(function (u) { delete ui.handEls[u]; });
    row.innerHTML = '';
    ui.girl(wow ? 'wow' : 'happy', 1500);
    ui.holdStamps = null;
    ui.moonOverride = null; ui.moonHiddenOverride = null;
    ui.renderSidebar();
    ui.syncScene();
    ui.jiggleChanged(status);
    await ui.sleep(140 / sp);
    setTimeout(function () { if (ui.state && ui.state.phase !== 'gameover' && !ui.busy) ui.sun(ui.restMood()); }, 900);

    /* e. outcome */
    if (res.blownAway && res.blownAway.length) {
      ui.banner('The Wind blows ' + ui.plural(res.blownAway.length, 'letter') + ' away!', { tone: 'paper', ms: 1400 });
      ui.sfx('say');
      var gone = res.blownAway.map(function (u) { return ui.handEls[u]; }).filter(Boolean);
      await Promise.all(gone.map(function (el, i) {
        return ui.anim(el, [
          { translate: '0 0', rotate: '0deg', opacity: 1 },
          { translate: '38vw -18vh', rotate: '260deg', opacity: 1, offset: .55 },
          { translate: '90vw -34vh', rotate: '560deg', opacity: 0 }
        ], { duration: 800 / sp, delay: i * 90 / sp, easing: 'ease-in', fill: 'forwards' });
      }));
      gone.forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
      res.blownAway.forEach(function (u) { delete ui.handEls[u]; });
    }
    if (res.outcome === 'continue') {
      var drawn = MA.run.drawToFull(s);
      ui.save();
      ui.syncHand({ deal: drawn });
      await ui.sleep((drawn.length * 30 + 200) / sp);
    } else if (res.outcome === 'won' || res.outcome === 'saved') {
      var saved = res.outcome === 'saved';
      var kid = saved ? (res.savedById || (kBefore.filter(function (k) { return k.uid === res.savedBy; })[0] || {}).id) : null;
      var info = MA.run.blindInfo(s);
      MA.scene.celebrate();
      ui.sfx('win');
      ui.girl('happy', 1800);
      if (saved) {
        ui.savedName = ui.kname(kid);
        var kel = ui.kEls[res.savedBy];
        ui.jiggle(kel);
        ui.banner(ui.savedName + ' saved the night!', { tone: 'teal', sub: 'Then it curls up and leaves.', ms: 1900 });
        await ui.sleep(1100 / sp);
        if (kel) await ui.anim(kel, [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 -30px' }], { duration: 360 / sp, fill: 'forwards' });
      } else {
        ui.banner(info.kind === 'boss' ? info.name + ' sent away!' : 'The town is lit!', { tone: 'teal', ms: 1500 });
      }
      await ui.sleep(700 / sp);
    } else if (res.outcome === 'lost') {
      ui.sun('sleepy');
      ui.girl('sleepy');
      ui.sfx('lose');
      ui.banner('Out of Sends', { tone: 'paper', ms: 1200 });
      await ui.sleep(1000 / sp);
    }
  }

  /* After the sequence unlocks: settle the UI, autosave, and open whatever comes next. */
  ui.postSend = function (s, res) {
    if (res.outcome === 'won' || res.outcome === 'saved') {
      MA.run.cashOut(s);
      ui.render({ progress: false });
      ui.save();
    } else if (res.outcome === 'lost') {
      ui.render();
      ui.clearSave();
      ui.showGameOver();
    } else {
      ui.settle();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
