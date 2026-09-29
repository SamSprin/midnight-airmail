/* Midnight Airmail — scoring. Contract: DESIGN.md §5.5 / §3 (Scoring order).
   Produces the event list the UI animates. No DOM. Randomness only via MA.util (seeded). */
(function (root) {
  'use strict';
  var MA = root.MA = root.MA || {};
  var scoring = MA.scoring = {};

  /* ---- small helpers shared with MA.run (looked up at call time) ---- */

  scoring.keepsakeDef = function (id) {
    var k = MA.content && MA.content.keepsakes;
    return (k && k[id]) || null;
  };

  /* The Visitor whose curse is active right now, or null (Dusk, Midnight, shop...). */
  scoring.currentBoss = function (state) {
    if (state.blindIndex !== 2) return null;
    if (state.phase !== 'playing' && state.phase !== 'cashout') return null;
    var b = MA.content && MA.content.bosses;
    return (b && b[state.bosses[state.ante - 1]]) || null;
  };

  scoring.passiveSum = function (state, key) {
    var sum = 0;
    for (var i = 0; i < state.keepsakes.length; i++) {
      var d = scoring.keepsakeDef(state.keepsakes[i].id);
      if (d && d.passive && typeof d.passive[key] === 'number') sum += d.passive[key];
    }
    return sum;
  };

  scoring.passiveMax = function (state, key, dflt) {
    var m = null;
    for (var i = 0; i < state.keepsakes.length; i++) {
      var d = scoring.keepsakeDef(state.keepsakes[i].id);
      if (d && d.passive && typeof d.passive[key] === 'number') m = (m === null) ? d.passive[key] : Math.max(m, d.passive[key]);
    }
    return m === null ? dflt : Math.max(m, dflt);
  };

  scoring.hasFourFingers = function (state) {
    for (var i = 0; i < state.keepsakes.length; i++) {
      var d = scoring.keepsakeDef(state.keepsakes[i].id);
      if (d && d.passive && d.passive.fourFingers) return true;
    }
    return false;
  };

  /* Zero-value result for an empty / unscoreable play. */
  function emptyResult() {
    return {
      handType: null, name: '', poker: '', level: 1, events: [], ink: 0, glow: 0, light: 0,
      fullMoon: false, scoringUids: [], debuffedUids: [], baseInk: 0, baseGlow: 0, rawBaseInk: 0, rawBaseGlow: 0,
      stamps: 0, playedUids: []
    };
  }

  function r2(x) { return Math.round(x * 100) / 100; }

  /* The scoring context factory (DESIGN 5.5). Used by score() and by run.preview, so both see exactly the
     same ctx shape. Returns a session { ctx, events, evalRes, info, vals, boss, fullMoon, ... } or null for an
     empty play. With opts.preview there are no side effects: no RNG, no stamps, keepsake data is cloned. */
  scoring.makeContext = function (state, played, held, opts) {
    opts = opts || {};
    held = held || [];
    var preview = !!opts.preview;
    var util = MA.util;

    var evalRes = MA.hands.evaluate(played, { fourFingers: scoring.hasFourFingers(state) });
    if (!evalRes) return null;

    var boss = scoring.currentBoss(state);
    var info = MA.hands.INFO[evalRes.type];
    var vals = MA.hands.values(state, evalRes.type);
    var fullMoon = state.moonPhase === 4 && !(boss && boss.hidesMoon);
    var isFinalSend = (opts.isFinalSend !== undefined) ? !!opts.isFinalSend : (state.sendsLeft === 0);
    /* Preview runs on clones so hooks that grow their own data can't touch the real run. */
    var insts = preview ? util.clone(state.keepsakes) : state.keepsakes.slice();

    var S = {
      events: [], evalRes: evalRes, info: info, vals: vals, boss: boss, fullMoon: fullMoon, preview: preview,
      insts: insts, stamps: 0, cur: { kind: 'hand' }, curCard: null
    };

    var ctx = S.ctx = {
      state: state,
      handType: evalRes.type,
      handName: info.name,
      level: vals.level,
      contains: evalRes.contains,
      played: played,
      scoring: evalRes.scoring,
      held: held,
      isFullMoon: fullMoon,
      isFinalSend: isFinalSend,
      ink: vals.ink,
      glow: vals.glow,
      keepsakes: insts
    };

    S.push = function (ev) {
      var src = { kind: S.cur.kind };
      if (S.cur.uid !== undefined) src.uid = S.cur.uid;
      ev.src = src;
      if (S.curCard) ev.cardUid = S.curCard;
      ev.ink = r2(ctx.ink);
      ev.glow = r2(ctx.glow);
      S.events.push(ev);
      return ev;
    };
    S.setSrc = function (kind, uid) { S.cur = uid === undefined ? { kind: kind } : { kind: kind, uid: uid }; };
    S.resetSrc = function () { S.cur = { kind: 'hand' }; };
    S.eachKeepsake = function (fn) {
      var list = insts.slice();
      for (var i = 0; i < list.length; i++) {
        var d = scoring.keepsakeDef(list[i].id);
        if (!d) continue;
        S.cur = { kind: 'keepsake', uid: list[i].uid };
        fn(d, list[i]);
      }
      S.resetSrc();
    };

    ctx.addInk = function (n) {
      n = Number(n) || 0;
      if (!n) return;
      ctx.ink += n;
      S.push({ t: 'ink', amount: n });
    };
    ctx.addGlow = function (n) {
      n = Number(n) || 0;
      if (!n) return;
      ctx.glow += n;
      S.push({ t: 'glow', amount: n });
    };
    ctx.mulGlow = function (x) {
      x = Number(x);
      if (!isFinite(x) || x === 1) return;
      ctx.glow *= x;
      S.push({ t: 'xglow', amount: x });
    };
    ctx.addStamps = function (n) {
      n = Number(n) || 0;
      if (!n) return;
      if (!preview) state.stamps = Math.max(0, state.stamps + n);
      S.stamps += n;
      S.push({ t: 'stamps', amount: n });
    };
    ctx.say = function (text) { S.push({ t: 'say', text: String(text) }); };
    ctx.chance = function (num, den) {
      if (preview) return false;
      return util.chance(state, num, den);
    };
    return S;
  };

  /* Base Ink/Glow of a play AFTER the Visitor's modifyBase (The Hush), plus the raw pre-Visitor values.
     No side effects. Used by run.preview. Returns null for an empty play. */
  scoring.baseValues = function (state, played, held) {
    var S = scoring.makeContext(state, played, held, { preview: true });
    if (!S) return null;
    var rawInk = S.vals.ink, rawGlow = S.vals.glow;
    if (S.boss && S.boss.modifyBase) {
      S.setSrc('boss', S.boss.id);
      S.boss.modifyBase(S.ctx);
      S.resetSrc();
    }
    return {
      type: S.evalRes.type, name: S.info.name, poker: S.info.poker, level: S.vals.level,
      ink: S.ctx.ink, glow: S.ctx.glow, rawInk: rawInk, rawGlow: rawGlow,
      contains: S.evalRes.contains, scoring: S.evalRes.scoring
    };
  };

  /* score(state, playedCards, heldCards, opts) -> ScoreResult */
  scoring.score = function (state, played, held, opts) {
    opts = opts || {};
    held = held || [];
    var S = scoring.makeContext(state, played, held, opts);
    if (!S) return emptyResult();
    var ctx = S.ctx, evalRes = S.evalRes, info = S.info, vals = S.vals, boss = S.boss, fullMoon = S.fullMoon;

    /* 1. Evaluate: base values */
    S.push({ t: 'hand', text: info.name, level: vals.level });

    /* 2. Visitor modifies the base (The Hush) */
    if (boss && boss.modifyBase) {
      S.setSrc('boss', boss.id);
      boss.modifyBase(ctx);
      S.resetSrc();
    }
    var baseInk = ctx.ink, baseGlow = ctx.glow;          // values after the Visitor's tweak

    /* 3. Keepsakes onHandSent (scaling) */
    S.eachKeepsake(function (d, inst) { if (d.onHandSent) d.onHandSent(ctx, inst); });

    /* 4. Scoring cards, played order */
    var scoringUids = [], debuffedUids = [];
    function scoreCardOnce(card) {
      S.curCard = card.uid;
      S.setSrc('card', card.uid);
      ctx.addInk(MA.cards.inkValue(card));
      if (card.sticker === 'graph') ctx.addInk(30);
      else if (card.sticker === 'watercolor') ctx.addGlow(4);
      else if (card.sticker === 'foil') ctx.mulGlow(1.5);
      else if (card.sticker === 'glitter') { if (ctx.chance(1, 4)) ctx.addGlow(15); }
      S.eachKeepsake(function (d, inst) { if (d.onCardScored) d.onCardScored(ctx, inst, card); });
      S.curCard = null;
      S.resetSrc();
    }
    for (var i = 0; i < evalRes.scoring.length; i++) {
      var card = evalRes.scoring[i];
      if (card.debuffed) {
        debuffedUids.push(card.uid);
        S.curCard = card.uid;
        S.setSrc('card', card.uid);
        S.push({ t: 'debuffed' });
        S.curCard = null;
        S.resetSrc();
        continue;
      }
      scoringUids.push(card.uid);
      var again = [];
      S.curCard = card.uid;
      S.eachKeepsake(function (d, inst) {
        if (!d.retrigger) return;
        var n = Math.floor(Number(d.retrigger(ctx, inst, card)) || 0);
        for (var k = 0; k < n && again.length < 8; k++) again.push(inst.uid);
      });
      S.curCard = null;
      scoreCardOnce(card);
      for (var a = 0; a < again.length; a++) {
        S.curCard = card.uid;
        S.setSrc('keepsake', again[a]);
        S.push({ t: 'retrigger', text: 'Again!' });
        S.resetSrc();
        S.curCard = null;
        scoreCardOnce(card);
      }
    }

    /* 5. Held cards (Washi Tape + keepsake onHeld) */
    for (var h = 0; h < held.length; h++) {
      var hc = held[h];
      if (hc.debuffed) continue;
      S.curCard = hc.uid;
      if (hc.sticker === 'washi') {
        S.setSrc('held', hc.uid);
        ctx.mulGlow(1.5);
      }
      S.eachKeepsake(function (d, inst) { if (d.onHeld) d.onHeld(ctx, inst, hc); });
      S.curCard = null;
      S.resetSrc();
    }

    /* 6. Keepsakes onHand (independent effects) */
    S.eachKeepsake(function (d, inst) { if (d.onHand) d.onHand(ctx, inst); });

    /* 7. Full Moon */
    if (fullMoon) {
      S.setSrc('moon');
      ctx.mulGlow(2);
      S.resetSrc();
    }

    /* 8. Light (computed from the unrounded running values; events and the result report 2 decimals) */
    var ink = Math.max(0, ctx.ink), glow = Math.max(0, ctx.glow);
    var light = Math.floor(ink * glow + 1e-9);
    if (!isFinite(light) || light < 0) light = 0;
    S.resetSrc();
    S.push({ t: 'total', amount: light });

    return {
      handType: evalRes.type,
      name: info.name,
      poker: info.poker,
      level: vals.level,
      events: S.events,
      ink: r2(ctx.ink),
      glow: r2(ctx.glow),
      light: light,
      fullMoon: fullMoon,
      scoringUids: scoringUids,
      debuffedUids: debuffedUids,
      baseInk: baseInk,                 // after the Visitor's tweak (The Hush)
      baseGlow: baseGlow,
      rawBaseInk: vals.ink,             // before the Visitor's tweak
      rawBaseGlow: vals.glow,
      stamps: S.stamps,
      playedUids: played.map(function (c) { return c.uid; })
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
