/* Midnight Airmail — the run state machine. Contract: DESIGN.md §5.9 (+ §3 rules, §5.1 state).
   The UI drives the whole game through MA.run and never pokes state fields directly.
   Every function returns plain data and never throws on bad player input. No DOM.
   State is JSON-only; content (keepsakes, letters, visitors) is looked up by id at call time. */
(function (root) {
  'use strict';
  var MA = root.MA = root.MA || {};
  var run = MA.run = {};
  var util = MA.util;

  /* ------------------------------------------------------------------ constants */

  var BASE_TARGETS = [300, 800, 2000, 5000, 11000, 20000, 35000, 50000];
  var BLIND_KINDS = ['dusk', 'midnight', 'boss'];
  var BLIND_NAMES = ['Dusk', 'Midnight', 'Visitor'];
  var BLIND_MULT = [1, 1.5, 2];
  var BLIND_REWARD = [3, 4, 5];
  var MAX_SELECT = 5;
  var REROLL_BASE = 5;
  var START_STAMPS = 4;
  var SAVE_VERSION = 1;

  var PACKS = {
    envelope:    { kind: 'envelope',    name: 'Envelope Bundle', price: 4, count: 3, pick: 1, item: 'letter' },
    starchart:   { kind: 'starchart',   name: 'Star Chart',      price: 4, count: 3, pick: 1, item: 'constellation' },
    keepsakebox: { kind: 'keepsakebox', name: 'Keepsake Box',    price: 6, count: 2, pick: 1, item: 'keepsake' }
  };
  var PACK_KINDS = ['envelope', 'starchart', 'keepsakebox'];

  run.BASE_TARGETS = BASE_TARGETS;
  run.PACKS = PACKS;

  /* ------------------------------------------------------------------ content lookups (call time) */

  function keepsakeDefs() { return (MA.content && MA.content.keepsakes) || {}; }
  function letterDefs() { return (MA.content && MA.content.letters) || {}; }
  function constellationDefs() { return (MA.content && MA.content.constellations) || {}; }
  function bossDefs() { return (MA.content && MA.content.bosses) || {}; }
  function kdef(id) { return keepsakeDefs()[id] || null; }

  function fail(reason) { return { ok: false, reason: reason }; }

  function currentBoss(state) { return MA.scoring.currentBoss(state); }
  run.currentBoss = currentBoss;

  /* ------------------------------------------------------------------ small state helpers */

  function findCard(state, uid) {
    var d = state.deck;
    for (var i = 0; i < d.length; i++) if (d[i].uid === uid) return d[i];
    return null;
  }
  run.getCard = function (state, uid) { return findCard(state, uid); };

  run.handCards = function (state) {
    var out = [];
    for (var i = 0; i < state.hand.length; i++) {
      var c = findCard(state, state.hand[i]);
      if (c) out.push(c);
    }
    return out;
  };

  function removeFrom(arr, uid) {
    var i = arr.indexOf(uid);
    if (i === -1) return false;
    arr.splice(i, 1);
    return true;
  }

  function removeFromPiles(state, uid) {
    removeFrom(state.drawPile, uid);
    removeFrom(state.hand, uid);
    removeFrom(state.played, uid);
    removeFrom(state.discardPile, uid);
  }

  function inAnyPile(state, uid) {
    return state.drawPile.indexOf(uid) !== -1 || state.hand.indexOf(uid) !== -1 ||
           state.played.indexOf(uid) !== -1 || state.discardPile.indexOf(uid) !== -1;
  }

  function eachKeepsake(state, fn) {
    var list = state.keepsakes.slice();
    for (var i = 0; i < list.length; i++) {
      var d = kdef(list[i].id);
      if (d) fn(d, list[i]);
    }
  }

  function findKeepsake(state, uid) {
    for (var i = 0; i < state.keepsakes.length; i++) if (state.keepsakes[i].uid === uid) return state.keepsakes[i];
    return null;
  }
  function findConsumable(state, uid) {
    for (var i = 0; i < state.consumables.length; i++) if (state.consumables[i].uid === uid) return state.consumables[i];
    return null;
  }

  function isOver(state) { return state.phase === 'gameover' || state.phase === 'victory'; }

  /* Debuff flags follow the Visitor while a blind is being played; face-down is set on draw. */
  function refreshFlags(state) {
    if (state.phase !== 'playing') return;
    var boss = currentBoss(state);
    for (var i = 0; i < state.deck.length; i++) {
      var c = state.deck[i];
      c.debuffed = !!(boss && boss.isDebuffed && boss.isDebuffed(c, state));
    }
  }

  function clearFlags(state) {
    for (var i = 0; i < state.deck.length; i++) {
      state.deck[i].debuffed = false;
      state.deck[i].faceDown = false;
    }
  }

  function newHandLevels() {
    var lv = {};
    for (var i = 0; i < MA.hands.ORDER.length; i++) lv[MA.hands.ORDER[i]] = { level: 1, sent: 0 };
    return lv;
  }

  function levelUp(state, type, n) {
    var h = state.handLevels[type];
    if (!h) return 0;
    h.level += (n === undefined ? 1 : n);
    return h.level;
  }

  function mostSentHand(state) {
    var order = MA.hands.ORDER, best = 'pair', bestSent = 0;
    for (var i = 0; i < order.length; i++) {
      var s = state.handLevels[order[i]].sent;
      /* ties go to the higher base hand: ORDER runs weakest -> strongest, so >= keeps the later one */
      if (s > 0 && s >= bestSent) { best = order[i]; bestSent = s; }
    }
    return best;
  }

  /* ------------------------------------------------------------------ new run */

  function pickVisitors(state) {
    var defs = bossDefs();
    var ids = Object.keys(defs);
    var pool = ids.filter(function (id) { return !defs[id].finale; });
    var finale = ids.filter(function (id) { return defs[id].finale; })[0] || 'daybreak';
    var used = {}, out = [];
    for (var night = 1; night <= 7; night++) {
      var elig = pool.filter(function (id) { return !used[id] && (defs[id].minAnte || 1) <= night; });
      if (!elig.length) elig = pool.filter(function (id) { return !used[id]; });
      if (!elig.length) elig = pool;
      var id = elig.length ? util.pick(state, elig) : finale;
      used[id] = true;
      out.push(id);
    }
    out.push(finale);
    return out;
  }

  run.newRun = function (seed) {
    var s = util.seedFrom(seed);
    var state = {
      version: SAVE_VERSION,
      seed: s,
      rng: { s: s },
      nextUid: 0,
      phase: 'blindSelect',
      ante: 1,
      blindIndex: 0,
      bosses: [],
      stamps: START_STAMPS,
      deck: [],
      drawPile: [], hand: [], played: [], discardPile: [],
      handSize: 8, maxSends: 4, maxCrumples: 3,
      sendsLeft: 0, crumplesLeft: 0,
      roundScore: 0, target: 0,
      blindWon: false,
      moonPhase: 0,
      handLevels: newHandLevels(),
      sentThisBlind: [],
      keepsakes: [], keepsakeSlots: 5,
      consumables: [], consumableSlots: 2,
      shop: null, pack: null, cashout: null,
      stats: { handsSent: 0, bestLight: 0, lettersUsed: 0, constellationsUsed: 0, bossesBeaten: 0, cardsCrumpled: 0, blindsSkipped: 0 },
      lastResult: null,
      log: []
    };
    state.deck = MA.cards.makeDeck(state);
    state.bosses = pickVisitors(state);
    state.target = run.blindInfo(state, 0).target;
    return state;
  };

  /* ------------------------------------------------------------------ blinds */

  run.blindInfo = function (state, index) {
    if (index === undefined || index === null) index = state.blindIndex;
    var isBoss = index === 2;
    var boss = isBoss ? (bossDefs()[state.bosses[state.ante - 1]] || null) : null;
    var mult = isBoss ? (boss ? boss.targetMult : 2) : BLIND_MULT[index];
    var base = BASE_TARGETS[util.clamp(state.ante, 1, 8) - 1];
    return {
      kind: BLIND_KINDS[index],
      name: isBoss ? (boss ? boss.name : BLIND_NAMES[2]) : BLIND_NAMES[index],
      target: Math.floor(base * mult),
      reward: BLIND_REWARD[index],
      boss: boss,
      bossId: boss ? boss.id : null,
      canSkip: index < 2,
      index: index,
      ante: state.ante
    };
  };

  function drawInto(state) {
    var boss = currentBoss(state);
    var drawn = [];
    while (state.hand.length < state.handSize && state.drawPile.length) {
      var uid = state.drawPile.pop();
      var card = findCard(state, uid);
      if (!card) continue;
      card.faceDown = !!(boss && boss.isFaceDown && boss.isFaceDown(card, state));
      state.hand.push(uid);
      drawn.push(uid);
    }
    return drawn;
  }

  run.startBlind = function (state) {
    if (state.phase !== 'blindSelect') return { ok: false, reason: 'No blind to start right now.', drawn: [] };
    if (state.pack) return { ok: false, reason: 'Finish with the open pack first.', drawn: [] };
    var info = run.blindInfo(state);
    state.phase = 'playing';
    state.target = info.target;
    state.roundScore = 0;
    state.blindWon = false;
    state.lastResult = null;
    state.cashout = null;
    state.sentThisBlind = [];

    state.handSize = Math.max(1, 8 + MA.scoring.passiveSum(state, 'handSize'));
    state.maxSends = Math.max(1, 4 + MA.scoring.passiveSum(state, 'sends'));
    state.maxCrumples = Math.max(0, 3 + MA.scoring.passiveSum(state, 'crumples'));
    state.sendsLeft = state.maxSends;
    state.crumplesLeft = state.maxCrumples;

    state.hand = [];
    state.played = [];
    state.discardPile = [];
    state.drawPile = util.shuffle(state, state.deck.map(function (c) { return c.uid; }));

    if (info.boss && info.boss.setup) info.boss.setup(state);
    state.handSize = Math.max(1, state.handSize);
    state.sendsLeft = Math.max(0, state.sendsLeft);
    state.crumplesLeft = Math.max(0, state.crumplesLeft);

    refreshFlags(state);
    eachKeepsake(state, function (d, inst) { if (d.onBlindStart) d.onBlindStart(state, inst); });
    var drawn = drawInto(state);
    return { ok: true, drawn: drawn };
  };

  run.drawToFull = function (state) {
    if (state.phase !== 'playing' || state.blindWon) return [];
    return drawInto(state);
  };

  run.skipBlind = function (state) {
    if (state.phase !== 'blindSelect' || state.pack) return null;
    if (state.blindIndex > 1) return null;
    var kind = util.pick(state, ['envelope', 'starchart']);
    state.pack = makePack(state, kind, 'skip');
    state.stats.blindsSkipped = (state.stats.blindsSkipped || 0) + 1;
    state.blindIndex += 1;
    state.target = run.blindInfo(state).target;             // keep sidebar reads fresh
    state.roundScore = 0;
    return state.pack;
  };

  /* ------------------------------------------------------------------ playing: select / preview / send / crumple */

  function pickFromHand(state, uids, min, max) {
    if (!Array.isArray(uids)) return fail('Pick some cards first.');
    var seen = {};
    for (var i = 0; i < uids.length; i++) {
      var u = uids[i];
      if (typeof u !== 'string' || seen[u] || state.hand.indexOf(u) === -1) return fail('Those cards are not in your hand.');
      seen[u] = true;
    }
    if (uids.length < min) return fail(min === 1 ? 'Pick at least one card.' : 'Pick at least ' + min + ' cards.');
    if (uids.length > max) return fail('You can pick at most ' + max + ' cards.');
    var cards = [];
    for (var j = 0; j < state.hand.length; j++) {
      if (seen[state.hand[j]]) {
        var c = findCard(state, state.hand[j]);
        if (!c) return fail('Those cards are not in your hand.');
        cards.push(c);
      }
    }
    return { ok: true, cards: cards };
  }

  function evaluateCards(state, cards) {
    return MA.hands.evaluate(cards, { fourFingers: MA.scoring.hasFourFingers(state) });
  }

  /* -> { ok:true, cards, eval } | { ok:false, reason } */
  function sendCheck(state, uids) {
    if (state.phase !== 'playing') return fail('Not the time to send letters.');
    if (state.blindWon) return fail('This blind is already won.');
    if (state.sendsLeft <= 0) return fail('No Sends left tonight.');
    var p = pickFromHand(state, uids, 1, MAX_SELECT);
    if (!p.ok) return p;
    var ev = evaluateCards(state, p.cards);
    var boss = currentBoss(state);
    if (boss && boss.canPlay) {
      var r = boss.canPlay(state, p.cards, ev);
      if (r !== true) return fail(typeof r === 'string' ? r : 'The Visitor won’t allow that.');
    }
    return { ok: true, cards: p.cards, eval: ev };
  }

  run.canSend = function (state, uids) {
    var r = sendCheck(state, uids);
    return r.ok ? true : r.reason;
  };

  run.preview = function (state, uids) {
    if (state.phase !== 'playing') return null;
    var p = pickFromHand(state, uids, 1, MAX_SELECT);
    if (!p.ok) return null;
    var check = sendCheck(state, uids);
    var canPlay = check.ok ? true : check.reason;
    /* Face-down cards (The Fog) must not leak their identity through the preview. */
    for (var i = 0; i < p.cards.length; i++) {
      if (p.cards[i].faceDown) {
        return { type: null, name: '???', poker: '', level: 0, ink: 0, glow: 0, contains: {}, scoringUids: [], canPlay: canPlay };
      }
    }
    var held = [];
    for (var h = 0; h < state.hand.length; h++) {
      if (uids.indexOf(state.hand[h]) === -1) { var hc = findCard(state, state.hand[h]); if (hc) held.push(hc); }
    }
    var bv = MA.scoring.baseValues(state, p.cards, held);       // same ctx factory as scoring, side-effect free
    return {
      type: bv.type,
      name: bv.name,
      poker: bv.poker,
      level: bv.level,
      ink: bv.ink,
      glow: bv.glow,
      canPlay: canPlay,
      contains: bv.contains,
      scoringUids: bv.scoring.map(function (c) { return c.uid; })
    };
  };

  function advanceMoon(state) {
    var speed = Math.max(1, Math.floor(MA.scoring.passiveMax(state, 'moonSpeed', 1)));
    var phase = state.moonPhase;
    var next = phase + speed;
    if (phase < 4 && next > 4) next = 4;
    else next = next % 5;
    state.moonPhase = next;
  }

  run.send = function (state, uids) {
    var v = sendCheck(state, uids);
    if (!v.ok) return { ok: false, reason: v.reason, result: null, outcome: null, blownAway: [] };

    state.sendsLeft -= 1;                                   // before scoring: isFinalSend = (sendsLeft === 0)
    var playedUids = v.cards.map(function (c) { return c.uid; });
    for (var i = 0; i < playedUids.length; i++) removeFrom(state.hand, playedUids[i]);
    state.played = playedUids.slice();
    for (var f = 0; f < v.cards.length; f++) v.cards[f].faceDown = false;   // revealed when sent

    var held = run.handCards(state);
    var result = MA.scoring.score(state, v.cards, held, {});

    state.roundScore += result.light;
    if (result.handType) {
      state.handLevels[result.handType].sent += 1;
      if (state.sentThisBlind.indexOf(result.handType) === -1) state.sentThisBlind.push(result.handType);
    }
    state.stats.handsSent += 1;
    if (result.light > state.stats.bestLight) state.stats.bestLight = result.light;
    state.lastResult = result;

    advanceMoon(state);
    result.moonPhase = state.moonPhase;                     // where the moon is after this Send

    state.discardPile = state.discardPile.concat(state.played);
    state.played = [];

    var out = { ok: true, result: result, outcome: 'continue', won: false, blownAway: [], played: playedUids };

    if (state.roundScore >= state.target) {
      out.outcome = 'won';
      out.won = true;
      state.blindWon = true;
      return out;
    }

    if (state.sendsLeft > 0) {
      var boss = currentBoss(state);
      if (boss && boss.afterSend) {
        var gone = boss.afterSend(state) || [];
        for (var g = 0; g < gone.length; g++) {
          if (removeFrom(state.hand, gone[g])) { state.discardPile.push(gone[g]); out.blownAway.push(gone[g]); }
        }
      }
    }

    var outOfCards = state.hand.length + state.drawPile.length === 0;
    if (state.sendsLeft <= 0 || outOfCards) {
      var savedBy = null, savedById = null;
      var list = state.keepsakes.slice();
      for (var k = 0; k < list.length; k++) {
        var d = kdef(list[k].id);
        if (d && d.onLose && d.onLose(state, list[k])) { savedBy = list[k].uid; savedById = list[k].id; break; }
      }
      if (savedBy) {
        state.keepsakes = state.keepsakes.filter(function (x) { return x.uid !== savedBy; });
        out.outcome = 'saved';
        out.won = true;                                     // a saved blind is treated as a won blind
        out.savedBy = savedBy;                              // the keepsake instance uid (already removed)
        out.savedById = savedById;                          // its definition id, e.g. 'rooftop_cat'
        state.blindWon = true;
      } else {
        out.outcome = 'lost';
        state.phase = 'gameover';
      }
    }
    return out;
  };

  run.crumple = function (state, uids) {
    if (state.phase !== 'playing') return fail('Not the time to crumple letters.');
    if (state.blindWon) return fail('This blind is already won.');
    if (state.crumplesLeft <= 0) return fail('No Crumples left tonight.');
    var p = pickFromHand(state, uids, 1, MAX_SELECT);
    if (!p.ok) return p;
    if (state.hand.length - p.cards.length + state.drawPile.length <= 0) {
      return fail('You need at least one card left to send.');
    }
    var moved = p.cards.map(function (c) { return c.uid; });
    for (var i = 0; i < moved.length; i++) {
      removeFrom(state.hand, moved[i]);
      state.discardPile.push(moved[i]);
    }
    for (var f = 0; f < p.cards.length; f++) p.cards[f].faceDown = false;
    state.crumplesLeft -= 1;
    state.stats.cardsCrumpled += moved.length;
    eachKeepsake(state, function (d, inst) { if (d.onDiscard) d.onDiscard(state, inst, p.cards); });
    return { ok: true, uids: moved };
  };

  run.sortHand = function (state, mode) {
    var suitIdx = {};
    MA.cards.SUITS.forEach(function (s, i) { suitIdx[s] = i; });
    var all = run.handCards(state);
    /* Face-down cards (The Fog) go last in their existing order: sorting them would leak their rank/suit. */
    var up = all.filter(function (c) { return !c.faceDown; });
    var down = all.filter(function (c) { return c.faceDown; });
    up.sort(function (a, b) {
      if (mode === 'suit') {
        return (suitIdx[a.suit] - suitIdx[b.suit]) || (b.rank - a.rank) || (a.uid < b.uid ? -1 : 1);
      }
      return (b.rank - a.rank) || (suitIdx[a.suit] - suitIdx[b.suit]) || (a.uid < b.uid ? -1 : 1);
    });
    state.hand = up.concat(down).map(function (c) { return c.uid; });
    return state.hand;
  };

  run.remainingDeck = function (state) {
    var suitIdx = {};
    MA.cards.SUITS.forEach(function (s, i) { suitIdx[s] = i; });
    var cards = [];
    for (var i = 0; i < state.drawPile.length; i++) {
      var c = findCard(state, state.drawPile[i]);
      if (c) cards.push(c);
    }
    cards.sort(function (a, b) {
      return (suitIdx[a.suit] - suitIdx[b.suit]) || (b.rank - a.rank) || (a.uid < b.uid ? -1 : 1);
    });
    return cards;
  };

  /* ------------------------------------------------------------------ cash-out / collect */

  run.cashOut = function (state) {
    if (state.phase === 'cashout') return state.cashout;
    if (state.phase !== 'playing' || !state.blindWon) return null;
    var info = run.blindInfo(state);
    var wasBoss = state.blindIndex === 2;
    var lines = [];

    var label = wasBoss ? info.name + ' sent away' : info.name + ' cleared';
    lines.push({ label: label, amount: info.reward });
    if (state.sendsLeft > 0) lines.push({ label: 'Unused Sends (' + state.sendsLeft + ')', amount: state.sendsLeft });
    var interest = Math.min(5, Math.floor(Math.max(0, state.stamps) / 5));   // stamps held BEFORE rewards
    if (interest > 0) lines.push({ label: 'Interest', amount: interest });

    eachKeepsake(state, function (d, inst) {
      if (!d.onBlindEnd) return;
      var amt = Number(d.onBlindEnd(state, inst, { wasBoss: wasBoss })) || 0;
      if (amt) lines.push({ label: d.name || inst.id, amount: amt });
    });

    var wax = 0;
    for (var i = 0; i < state.hand.length; i++) {
      var c = findCard(state, state.hand[i]);
      if (c && c.sticker === 'wax' && !c.debuffed) wax += 1;
    }
    if (wax > 0) lines.push({ label: 'Wax Seal' + (wax > 1 ? ' x' + wax : ''), amount: 3 * wax });

    var total = 0;
    for (var l = 0; l < lines.length; l++) total += lines[l].amount;
    if (wasBoss) state.stats.bossesBeaten += 1;
    state.cashout = { lines: lines, total: total, wasBoss: wasBoss };
    state.phase = 'cashout';
    return state.cashout;
  };

  run.collect = function (state) {
    if (state.phase !== 'cashout' || !state.cashout) return fail('Nothing to collect.');
    state.stamps += state.cashout.total;
    var collected = state.cashout.total;
    clearFlags(state);
    state.cashout = null;
    if (state.ante >= 8 && state.blindIndex === 2) {
      state.phase = 'victory';
    } else {
      state.shop = generateShop(state);
      state.phase = 'shop';
    }
    return { ok: true, collected: collected, phase: state.phase };
  };

  /* ------------------------------------------------------------------ shop */

  function ownedKeepsakeIds(state) {
    var o = {};
    for (var i = 0; i < state.keepsakes.length; i++) o[state.keepsakes[i].id] = true;
    return o;
  }

  /* Random keepsake id by rarity 70/25/5, never owned or in `exclude`; falls back to any unowned one. */
  function pickKeepsake(state, exclude) {
    var defs = keepsakeDefs();
    var owned = ownedKeepsakeIds(state);
    var ids = Object.keys(defs).filter(function (id) { return !owned[id] && exclude.indexOf(id) === -1; });
    if (!ids.length) return null;
    var r = util.randInt(state, 1, 100);
    var rarity = r <= 70 ? 'common' : r <= 95 ? 'uncommon' : 'rare';
    var pool = ids.filter(function (id) { return defs[id].rarity === rarity; });
    if (!pool.length) pool = ids;
    return util.pick(state, pool);
  }

  /* Secret hands' constellations stay hidden until that hand type has been sent once. */
  function availableConstellations(state) {
    var defs = constellationDefs();
    return Object.keys(defs).filter(function (id) {
      var h = defs[id].hand;
      return !defs[id].secret || (state.handLevels[h] && state.handLevels[h].sent > 0);
    });
  }

  function pickConstellation(state) {
    var ids = availableConstellations(state);
    return ids.length ? util.pick(state, ids) : null;
  }

  function pickConstellations(state, count) {
    return util.shuffle(state, availableConstellations(state)).slice(0, count);
  }

  function itemPrice(kind, id) {
    if (kind === 'keepsake') { var d = kdef(id); return d ? d.cost : 5; }
    return 3;
  }

  function rollShopItem(state, taken) {
    var r = util.randInt(state, 1, 100);
    var kind = r <= 70 ? 'keepsake' : r <= 85 ? 'constellation' : 'letter';
    var id = null;
    if (kind === 'keepsake') {
      id = pickKeepsake(state, taken);
      if (id === null) kind = 'letter';
    }
    if (kind === 'constellation') {
      id = pickConstellation(state);
      if (id === null) kind = 'letter';
    }
    if (kind === 'letter') {
      id = util.pick(state, Object.keys(letterDefs()));
      if (id === undefined) return null;
    }
    return { kind: kind, id: id, price: itemPrice(kind, id), sold: false };
  }

  function rollShopItems(state) {
    var items = [], taken = [];
    for (var i = 0; i < 2; i++) {
      var it = rollShopItem(state, taken);
      if (it) { items.push(it); if (it.kind === 'keepsake') taken.push(it.id); }
    }
    return items;
  }

  function generateShop(state) {
    var items = rollShopItems(state);
    var packs = [];
    for (var i = 0; i < 2; i++) {
      var kind = util.pick(state, PACK_KINDS);
      packs.push({ kind: kind, price: PACKS[kind].price, sold: false });
    }
    return { items: items, packs: packs, rerollCost: REROLL_BASE };
  }

  function makePack(state, kind, source) {
    var spec = PACKS[kind];
    var choices = [], ids, i;
    if (spec.item === 'letter') {
      ids = util.shuffle(state, Object.keys(letterDefs())).slice(0, spec.count);
      for (i = 0; i < ids.length; i++) choices.push({ kind: 'letter', id: ids[i] });
    } else if (spec.item === 'constellation') {
      ids = pickConstellations(state, spec.count);
      for (i = 0; i < ids.length; i++) choices.push({ kind: 'constellation', id: ids[i] });
    } else {
      var taken = [];
      for (i = 0; i < spec.count; i++) {
        var id = pickKeepsake(state, taken);
        if (id === null) break;
        taken.push(id);
        choices.push({ kind: 'keepsake', id: id });
      }
    }
    return { kind: kind, choices: choices, source: source };
  }

  function addKeepsake(state, id) {
    var d = kdef(id);
    var inst = { uid: util.uid(state, 'k'), id: id, data: d && d.init ? d.init() : {} };
    state.keepsakes.push(inst);
    return inst;
  }

  function addConsumable(state, kind, id) {
    var c = { uid: util.uid(state, 'x'), kind: kind, id: id };
    state.consumables.push(c);
    return c;
  }

  function hasKeepsakeRoom(state) { return state.keepsakes.length < state.keepsakeSlots; }
  function hasConsumableRoom(state) { return state.consumables.length < state.consumableSlots; }

  run.buy = function (state, slotIndex) {
    if (state.phase !== 'shop' || !state.shop) return fail('The shop is closed.');
    if (state.pack) return fail('Finish with the open pack first.');
    var item = state.shop.items[slotIndex];
    if (!item) return fail('Nothing on that shelf.');
    if (item.sold) return fail('Already sold.');
    if (state.stamps < item.price) return fail('Not enough Stamps.');
    var inst;
    if (item.kind === 'keepsake') {
      if (!hasKeepsakeRoom(state)) return fail('Your keepsake shelf is full.');
      inst = addKeepsake(state, item.id);
    } else {
      if (!hasConsumableRoom(state)) return fail('Your consumable slots are full.');
      inst = addConsumable(state, item.kind, item.id);
    }
    state.stamps -= item.price;
    item.sold = true;
    return { ok: true, kind: item.kind, id: item.id, price: item.price, uid: inst.uid };
  };

  run.buyPack = function (state, packIndex) {
    if (state.phase !== 'shop' || !state.shop) return fail('The shop is closed.');
    if (state.pack) return fail('Finish with the open pack first.');
    var p = state.shop.packs[packIndex];
    if (!p) return fail('No such pack.');
    if (p.sold) return fail('Already sold.');
    if (state.stamps < p.price) return fail('Not enough Stamps.');
    state.stamps -= p.price;
    p.sold = true;
    state.pack = makePack(state, p.kind, 'shop');
    return { ok: true, pack: state.pack };
  };

  function applyConstellation(state, id) {
    var def = constellationDefs()[id];
    if (!def) return null;
    var lv = levelUp(state, def.hand, 1);
    state.stats.constellationsUsed += 1;
    eachKeepsake(state, function (d, inst) { if (d.onConstellationUsed) d.onConstellationUsed(state, inst, id); });
    var info = MA.hands.INFO[def.hand];
    return { hand: def.hand, level: lv, message: info.name + ' is now level ' + lv };
  }

  run.choosePack = function (state, choiceIndex) {
    var pack = state.pack;
    if (!pack) return fail('No pack is open.');
    var ch = pack.choices[choiceIndex];
    if (!ch) return fail('No such choice.');
    var res = { ok: true, kind: ch.kind, id: ch.id, message: '', destroyed: [], created: [], changed: [] };
    if (ch.kind === 'constellation') {
      var r = applyConstellation(state, ch.id);
      if (r) { res.message = r.message; res.hand = r.hand; res.level = r.level; }
    } else if (ch.kind === 'letter') {
      if (!hasConsumableRoom(state)) return fail('Your consumable slots are full.');
      res.uid = addConsumable(state, 'letter', ch.id).uid;
      var ld = letterDefs()[ch.id];
      res.message = (ld ? ld.name : 'Letter') + ' tucked into your bag';
    } else {
      if (!hasKeepsakeRoom(state)) return fail('Your keepsake shelf is full.');
      res.uid = addKeepsake(state, ch.id).uid;
      var kd = kdef(ch.id);
      res.message = (kd ? kd.name : 'Keepsake') + ' joins your shelf';
    }
    state.pack = null;
    return res;
  };

  run.skipPack = function (state) {
    if (!state.pack) return fail('No pack is open.');
    state.pack = null;
    return { ok: true };
  };

  run.reroll = function (state) {
    if (state.phase !== 'shop' || !state.shop) return fail('The shop is closed.');
    if (state.pack) return fail('Finish with the open pack first.');
    var cost = state.shop.rerollCost;
    if (state.stamps < cost) return fail('Not enough Stamps.');
    state.stamps -= cost;
    state.shop.rerollCost = cost + 1;
    state.shop.items = rollShopItems(state);
    return { ok: true, cost: cost };
  };

  run.sellValue = function (state, uid) {
    var k = findKeepsake(state, uid);
    if (k) {
      var d = kdef(k.id);
      return Math.max(1, Math.floor((d ? d.cost : 2) / 2));
    }
    return findConsumable(state, uid) ? 1 : 0;
  };

  run.sell = function (state, uid) {
    if (isOver(state)) return { ok: false, amount: 0, reason: 'The night is over.' };
    var k = findKeepsake(state, uid);
    var kind;
    if (k) { kind = 'keepsake'; }
    else if (findConsumable(state, uid)) { kind = 'consumable'; }
    else return { ok: false, amount: 0, reason: 'Nothing to sell.' };
    var amount = run.sellValue(state, uid);
    if (kind === 'keepsake') state.keepsakes = state.keepsakes.filter(function (x) { return x.uid !== uid; });
    else state.consumables = state.consumables.filter(function (x) { return x.uid !== uid; });
    state.stamps += amount;
    return { ok: true, amount: amount, kind: kind };
  };

  run.moveKeepsake = function (state, fromIndex, toIndex) {
    var n = state.keepsakes.length;
    if (!(fromIndex >= 0 && fromIndex < n) || !(toIndex >= 0 && toIndex < n)) return fail('Out of range.');
    var item = state.keepsakes.splice(fromIndex, 1)[0];
    state.keepsakes.splice(toIndex, 0, item);
    return { ok: true };
  };

  run.leaveShop = function (state) {
    if (state.phase !== 'shop') return fail('You are not in the shop.');
    state.pack = null;
    state.shop = null;
    state.blindIndex += 1;
    if (state.blindIndex > 2) {
      state.blindIndex = 0;
      state.ante += 1;
    }
    state.phase = 'blindSelect';
    state.target = run.blindInfo(state).target;             // keep sidebar reads fresh (UI also has blindInfo)
    state.roundScore = 0;
    return { ok: true };
  };

  /* ------------------------------------------------------------------ consumables */

  /* The api handed to letters. rec records what happened so useConsumable can tell the UI:
     rec.destroyed (uids), rec.created (uids of brand-new cards), rec.levelled ({hand, level}). */
  function makeApi(state, rec) {
    return {
      destroyCard: function (uid) {
        var had = !!findCard(state, uid);
        state.deck = state.deck.filter(function (c) { return c.uid !== uid; });
        removeFromPiles(state, uid);
        if (had) rec.destroyed.push(uid);
        return had;
      },
      addCardToHand: function (card) {
        if (!findCard(state, card.uid)) { state.deck.push(card); rec.created.push(card.uid); }
        removeFromPiles(state, card.uid);
        state.hand.push(card.uid);
        return card;
      },
      addCardToDeck: function (card) {
        if (!findCard(state, card.uid)) { state.deck.push(card); rec.created.push(card.uid); }
        if (!inAnyPile(state, card.uid)) {
          var pos = util.randInt(state, 0, state.drawPile.length);
          state.drawPile.splice(pos, 0, card.uid);
        }
        return card;
      },
      makeCard: function (rank, suit, sticker) { return MA.cards.makeCard(state, rank, suit, sticker || null); },
      levelUp: function (type, n) {
        var lv = levelUp(state, type, n);
        if (lv) rec.levelled = { hand: type, level: lv };
        return lv;
      },
      addStamps: function (n) { state.stamps = Math.max(0, state.stamps + (Number(n) || 0)); return state.stamps; },
      mostSentHand: function () { return mostSentHand(state); }
    };
  }

  /* How many cards a letter destroys (for the deck-floor guard). */
  var MIN_DECK = 5;
  var LETTER_DESTROYS = {
    fold: function () { return 1; },
    eraser: function (cards) { return cards.length; }
  };

  /* -> { ok:true, consumable, cards, def } | { ok:false, reason }  (also validates the selection against the hand) */
  function checkConsumable(state, uid, selectedUids) {
    var c = findConsumable(state, uid);
    if (!c) return { ok: false, reason: 'You do not have that.' };
    if (isOver(state)) return { ok: false, reason: 'The night is over.' };
    var sel = Array.isArray(selectedUids) ? selectedUids : [];
    if (c.kind === 'constellation') {
      if (!constellationDefs()[c.id]) return { ok: false, reason: 'Unknown constellation.' };
      return { ok: true, consumable: c, cards: [] };
    }
    var def = letterDefs()[c.id];
    if (!def) return { ok: false, reason: 'Unknown letter.' };
    var min = def.min || 0;
    var max = def.max === undefined ? min : def.max;
    if (max === 0) sel = [];                                   // zero-card letters ignore whatever is selected
    if (min > 0 && (state.phase !== 'playing' || state.blindWon)) {
      return { ok: false, reason: 'This letter needs cards from your hand. Use it during a blind.' };
    }
    if (sel.length < min || sel.length > max) {
      var need = min === max ? 'exactly ' + min : min + ' to ' + max;
      var reason = min === 0 && max === 0 ? 'This letter needs no cards.' : 'Pick ' + need + ' card' + (max === 1 ? '' : 's') + '.';
      var loose = sel.length ? pickFromHand(state, sel, 0, 99) : { ok: true, cards: [] };
      if (loose.ok && def.canUse) {
        var why = def.canUse(state, loose.cards);   // the letter's own, friendlier wording
        if (typeof why === 'string') reason = why;
      }
      return { ok: false, reason: reason };
    }
    var cards = [];
    if (sel.length) {
      var p = pickFromHand(state, sel, sel.length, sel.length);
      if (!p.ok) return p;
      cards = p.cards;
    }
    if (def.canUse) {
      var r = def.canUse(state, cards);
      if (r !== true) return { ok: false, reason: typeof r === 'string' ? r : 'You cannot use that right now.' };
    }
    /* Engine-level deck floor: never let a letter thin the deck below 5 cards or leave nothing to send. */
    var wipes = LETTER_DESTROYS[c.id] ? LETTER_DESTROYS[c.id](cards) : 0;
    if (wipes > 0) {
      if (state.deck.length - wipes < MIN_DECK) return { ok: false, reason: 'Your deck is too thin for that.' };
      if (state.phase === 'playing' && state.hand.length + state.drawPile.length - wipes <= 0) {
        return { ok: false, reason: 'Your deck is too thin for that.' };
      }
    }
    return { ok: true, consumable: c, cards: cards, def: def };
  }

  run.canUseConsumable = function (state, uid, selectedUids) {
    var r = checkConsumable(state, uid, selectedUids);
    return r.ok ? true : r.reason;
  };

  /* -> { ok, message, kind, id, destroyed:[uid], created:[uid], changed:[selected uids that still exist],
           hand?, level? (when a hand type was levelled) }  or { ok:false, reason, message } */
  run.useConsumable = function (state, uid, selectedUids) {
    var r = checkConsumable(state, uid, selectedUids);
    if (!r.ok) return { ok: false, reason: r.reason, message: r.reason };
    var c = r.consumable;
    var rec = { destroyed: [], created: [], levelled: null };
    var message = '';
    if (c.kind === 'constellation') {
      var res = applyConstellation(state, c.id);
      message = res.message;
      rec.levelled = { hand: res.hand, level: res.level };
      state.consumables = state.consumables.filter(function (x) { return x.uid !== c.uid; });
    } else {
      var out = r.def.use(state, r.cards, makeApi(state, rec));
      message = (out && out.message) || '';
      state.consumables = state.consumables.filter(function (x) { return x.uid !== c.uid; });
      state.stats.lettersUsed += 1;
      var letterId = c.id;
      eachKeepsake(state, function (d, inst) { if (d.onLetterUsed) d.onLetterUsed(state, inst, letterId); });
    }
    refreshFlags(state);
    var changed = [];
    for (var i = 0; i < r.cards.length; i++) if (findCard(state, r.cards[i].uid)) changed.push(r.cards[i].uid);
    var result = { ok: true, message: message, kind: c.kind, id: c.id, destroyed: rec.destroyed, created: rec.created, changed: changed };
    if (rec.levelled) { result.hand = rec.levelled.hand; result.level = rec.levelled.level; }
    return result;
  };

  /* ------------------------------------------------------------------ save / load */

  run.serialize = function (state) { return JSON.stringify(state); };

  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function isNum(n) { return typeof n === 'number' && isFinite(n); }
  function allStrings(a) { return a.every(function (x) { return typeof x === 'string'; }); }

  /* Shape check for a loaded save. Anything malformed is rejected so it can never throw later. */
  function validState(s) {
    if (!isObj(s) || s.version !== SAVE_VERSION) return false;
    var arrays = ['deck', 'drawPile', 'hand', 'played', 'discardPile', 'keepsakes', 'consumables', 'bosses', 'sentThisBlind'];
    for (var i = 0; i < arrays.length; i++) if (!Array.isArray(s[arrays[i]])) return false;
    if (!isObj(s.handLevels) || !isObj(s.stats) || !isObj(s.rng) || !isNum(s.rng.s)) return false;
    var nums = ['stamps', 'ante', 'blindIndex', 'handSize', 'maxSends', 'maxCrumples', 'sendsLeft', 'crumplesLeft',
                'roundScore', 'target', 'moonPhase', 'keepsakeSlots', 'consumableSlots'];
    for (i = 0; i < nums.length; i++) if (!isNum(s[nums[i]])) return false;
    if (s.stamps < 0 || s.ante < 1 || s.ante > 8 || s.blindIndex < 0 || s.blindIndex > 2 || s.moonPhase < 0 || s.moonPhase > 4) return false;
    if (['blindSelect', 'playing', 'cashout', 'shop', 'gameover', 'victory'].indexOf(s.phase) === -1) return false;
    if (s.bosses.length !== 8 || !allStrings(s.bosses)) return false;
    var stats = ['handsSent', 'bestLight', 'lettersUsed', 'constellationsUsed', 'bossesBeaten', 'cardsCrumpled'];
    for (i = 0; i < stats.length; i++) if (!isNum(s.stats[stats[i]])) return false;
    for (i = 0; i < MA.hands.ORDER.length; i++) {
      var hl = s.handLevels[MA.hands.ORDER[i]];
      if (!isObj(hl) || !isNum(hl.level) || hl.level < 1 || !isNum(hl.sent) || hl.sent < 0) return false;
    }
    var inDeck = {};
    for (i = 0; i < s.deck.length; i++) {
      var c = s.deck[i];
      if (!isObj(c) || typeof c.uid !== 'string' || inDeck[c.uid]) return false;
      if (!(c.rank >= 2 && c.rank <= 14 && c.rank % 1 === 0) || MA.cards.SUITS.indexOf(c.suit) === -1) return false;
      if (c.sticker !== null && !MA.cards.STICKERS[c.sticker]) return false;
      inDeck[c.uid] = true;
    }
    var seen = {}, piles = ['drawPile', 'hand', 'played', 'discardPile'];
    for (i = 0; i < piles.length; i++) {
      var pile = s[piles[i]];
      if (!allStrings(pile)) return false;
      for (var j = 0; j < pile.length; j++) {
        if (!inDeck[pile[j]] || seen[pile[j]]) return false;
        seen[pile[j]] = true;
      }
    }
    for (i = 0; i < s.keepsakes.length; i++) {
      var k = s.keepsakes[i];
      if (!isObj(k) || typeof k.uid !== 'string' || typeof k.id !== 'string' || !isObj(k.data)) return false;
    }
    for (i = 0; i < s.consumables.length; i++) {
      var x = s.consumables[i];
      if (!isObj(x) || typeof x.uid !== 'string' || typeof x.id !== 'string' || (x.kind !== 'letter' && x.kind !== 'constellation')) return false;
    }
    if (s.shop !== null) {
      if (!isObj(s.shop) || !Array.isArray(s.shop.items) || !Array.isArray(s.shop.packs) || !isNum(s.shop.rerollCost)) return false;
      for (i = 0; i < s.shop.items.length; i++) {
        var it = s.shop.items[i];
        if (!isObj(it) || typeof it.id !== 'string' || !isNum(it.price) || ['keepsake', 'letter', 'constellation'].indexOf(it.kind) === -1) return false;
      }
      for (i = 0; i < s.shop.packs.length; i++) {
        var pk = s.shop.packs[i];
        if (!isObj(pk) || !PACKS[pk.kind] || !isNum(pk.price)) return false;
      }
    } else if (s.phase === 'shop') return false;
    if (s.pack !== null) {
      if (!isObj(s.pack) || !PACKS[s.pack.kind] || !Array.isArray(s.pack.choices) || (s.pack.source !== 'shop' && s.pack.source !== 'skip')) return false;
      for (i = 0; i < s.pack.choices.length; i++) {
        var ch = s.pack.choices[i];
        if (!isObj(ch) || typeof ch.id !== 'string' || ['keepsake', 'letter', 'constellation'].indexOf(ch.kind) === -1) return false;
      }
    }
    if (s.cashout !== null) {
      if (!isObj(s.cashout) || !Array.isArray(s.cashout.lines) || !isNum(s.cashout.total)) return false;
      for (i = 0; i < s.cashout.lines.length; i++) {
        if (!isObj(s.cashout.lines[i]) || !isNum(s.cashout.lines[i].amount)) return false;
      }
    } else if (s.phase === 'cashout') return false;
    return s.lastResult === null || isObj(s.lastResult);
  }

  run.deserialize = function (str) {
    var s;
    try { s = JSON.parse(str); } catch (e) { return null; }
    if (isObj(s)) {                                   // optional fields older saves may lack
      if (typeof s.blindWon !== 'boolean') s.blindWon = false;
      if (!Array.isArray(s.log)) s.log = [];
      ['shop', 'pack', 'cashout', 'lastResult'].forEach(function (k) { if (s[k] === undefined) s[k] = null; });
      if (!Array.isArray(s.sentThisBlind)) s.sentThisBlind = [];
    }
    return validState(s) ? s : null;
  };

  /* ------------------------------------------------------------------ diagnostics + test helpers */

  /* Returns a list of problems (empty = healthy). Used by the tests. */
  run.checkInvariants = function (state) {
    var problems = [];
    var piles = ['drawPile', 'hand', 'played', 'discardPile'];
    var total = 0, seen = {};
    var inDeck = {};
    state.deck.forEach(function (c) {
      if (inDeck[c.uid]) problems.push('duplicate card in deck ' + c.uid);
      inDeck[c.uid] = true;
    });
    piles.forEach(function (p) {
      state[p].forEach(function (u) {
        total += 1;
        if (seen[u]) problems.push('card ' + u + ' is in two places');
        seen[u] = true;
        if (!inDeck[u]) problems.push('card ' + u + ' in ' + p + ' is not in the deck');
      });
    });
    if (total > 0 && total !== state.deck.length) {
      problems.push('deck has ' + state.deck.length + ' cards but piles hold ' + total);
    }
    if (state.stamps < 0) problems.push('negative stamps');
    if (state.keepsakes.length > state.keepsakeSlots) problems.push('too many keepsakes');
    if (state.consumables.length > state.consumableSlots) problems.push('too many consumables');
    return problems;
  };

  run.debug = {
    giveKeepsake: function (state, id) {
      var inst = addKeepsake(state, id);
      return inst;
    },
    giveConsumable: function (state, kind, id) {
      return addConsumable(state, kind, id);
    },
    setStamps: function (state, n) { state.stamps = Math.max(0, Math.floor(n)); return state.stamps; },
    setAnte: function (state, n) {
      state.ante = util.clamp(Math.floor(n), 1, 8);
      if (state.phase === 'blindSelect') state.target = run.blindInfo(state).target;
      return state.ante;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
