/* Engine fuzz: seeded full runs driven by a simple bot, through MA.run only.
   Asserts: no exceptions, stamps >= 0, card conservation, hand size bounds, legal phase transitions,
   refused calls change nothing, serialize -> deserialize -> serialize is identical. */
'use strict';
const assert = require('assert');

function mulberry(seed) {
  let s = (seed * 2654435761 + 12345) >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALLOWED = {
  blindSelect: ['blindSelect', 'playing'],
  playing: ['playing', 'cashout', 'gameover'],
  cashout: ['cashout', 'shop', 'victory'],
  shop: ['shop', 'blindSelect']
};

const comboCache = {};
function combos(n) {
  if (comboCache[n]) return comboCache[n];
  const out = [];
  (function rec(start, cur) {
    if (cur.length) out.push(cur.slice());
    if (cur.length === 5) return;
    for (let i = start; i < n; i++) { cur.push(i); rec(i + 1, cur); cur.pop(); }
  })(0, []);
  comboCache[n] = out;
  return out;
}

function runOne(MA, seed, opts) {
  opts = opts || {};
  const R = MA.run;
  const rnd = mulberry(seed);
  const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  let state = R.newRun(seed);
  let lastPhase = state.phase;
  let steps = 0, roundTrips = 0, sends = 0, letters = 0, packs = 0, skips = 0, shopBuys = 0;
  let extraCards = 0;        // cards added to the hand by Tear/Carbon during the current blind

  function fail(msg) { throw new Error('seed ' + seed + ' step ' + steps + ' (' + state.phase + ' N' + state.ante + '): ' + msg); }
  function check(label) {
    steps++;
    if (steps > 6000) fail('bot ran too long at ' + label);
    const from = lastPhase;
    if (state.phase !== from) {
      if (!ALLOWED[from] || ALLOWED[from].indexOf(state.phase) === -1) fail('illegal phase move ' + from + ' -> ' + state.phase + ' after ' + label);
    }
    lastPhase = state.phase;
    const problems = R.checkInvariants(state);
    if (problems.length) fail(label + ': ' + problems.join('; '));
    if (!(state.stamps >= 0) || !isFinite(state.stamps)) fail(label + ': stamps ' + state.stamps);
    if (!isFinite(state.roundScore) || state.roundScore < 0) fail(label + ': roundScore ' + state.roundScore);
    if (state.keepsakes.length > state.keepsakeSlots || state.consumables.length > state.consumableSlots) fail(label + ': slot overflow');
    if (!(state.moonPhase >= 0 && state.moonPhase <= 4)) fail(label + ': moon ' + state.moonPhase);
    if (state.phase === 'playing' && state.hand.length > state.handSize + extraCards) fail(label + ': hand ' + state.hand.length + ' > ' + state.handSize + ' + ' + extraCards);
    if (rnd() < 0.03) {
      const a = R.serialize(state);
      const back = R.deserialize(a);
      if (!back) fail('deserialize returned null');
      const b = R.serialize(back);
      if (a !== b) fail('serialize round trip differs after ' + label);
      roundTrips++;
      if (rnd() < 0.5) state = back;
    }
  }
  /* Calls that must be refused and must leave the state byte-for-byte untouched. */
  function chaos() {
    const before = R.serialize(state);
    const ph = state.phase;
    const bogus = ['zz9', 'c-1', ''];
    const calls = [
      () => R.send(state, bogus), () => R.crumple(state, bogus), () => R.buy(state, 99), () => R.buyPack(state, -1),
      () => R.choosePack(state, 99), () => R.sell(state, 'zz9'), () => R.moveKeepsake(state, -1, 9),
      () => R.useConsumable(state, 'zz9', []), () => R.preview(state, bogus)
    ];
    if (ph !== 'playing') {
      const uids = state.hand.length ? state.hand.slice(0, 1) : ['c1'];
      calls.push(() => R.send(state, uids), () => R.crumple(state, uids), () => R.preview(state, uids), () => R.drawToFull(state));
    }
    if (ph === 'playing') {
      calls.push(() => R.startBlind(state), () => R.collect(state), () => R.leaveShop(state), () => R.skipBlind(state),
                 () => R.buy(state, 0), () => R.reroll(state), () => R.buyPack(state, 0));
      if (!state.blindWon) calls.push(() => R.cashOut(state));
    }
    if (ph === 'shop') calls.push(() => R.startBlind(state), () => R.cashOut(state), () => R.skipBlind(state), () => R.collect(state));
    if (ph === 'blindSelect') {
      calls.push(() => R.cashOut(state), () => R.collect(state), () => R.leaveShop(state), () => R.buy(state, 0),
                 () => R.reroll(state), () => R.buyPack(state, 0));
    }
    const f = pick(calls);
    const res = f();
    const refused = res === null || res === undefined || (res && res.ok === false) || (Array.isArray(res) && res.length === 0);
    if (!refused) fail('bogus call was accepted: ' + f.toString().slice(0, 70) + ' -> ' + JSON.stringify(res).slice(0, 80));
    if (R.serialize(state) !== before) fail('a refused call changed the state: ' + f.toString().slice(0, 70));
  }

  /* ---- choose a hand the bot likes the look of ---- */
  function chooseSend() {
    const cards = R.handCards(state);
    if (!cards.length) return null;
    const four = MA.scoring.hasFourFingers(state);
    let list = combos(Math.min(cards.length, 9)).map(c => c);
    if (cards.length > 9) {
      list = [];
      for (let i = 0; i < 200; i++) {
        const k = ri(1, 5), idx = new Set();
        while (idx.size < Math.min(k, cards.length)) idx.add(ri(0, cards.length - 1));
        list.push(Array.from(idx));
      }
    }
    const cand = list.map(idxs => {
      const sub = idxs.map(i => cards[i]);
      const ev = MA.hands.evaluate(sub, { fourFingers: four });
      const v = MA.hands.values(state, ev.type);
      let ink = v.ink;
      ev.scoring.forEach(c => { if (!c.debuffed) ink += MA.cards.inkValue(c); });
      return { est: ink * v.glow, uids: sub.map(c => c.uid) };
    });
    cand.sort((a, b) => b.est - a.est);
    const shuffled = rnd() < 0.08;
    if (shuffled) cand.sort(() => rnd() - 0.5);
    /* take the first few legal candidates and re-rank them with the real (preview) scorer */
    const legal = [];
    for (let i = 0; i < cand.length && legal.length < (shuffled ? 1 : 6); i++) {
      if (R.canSend(state, cand[i].uids) === true) legal.push(cand[i]);
    }
    if (!legal.length) return null;
    let best = legal[0], bestLight = -1;
    legal.forEach(c => {
      const played = c.uids.map(u => R.getCard(state, u));
      const held = state.hand.filter(u => c.uids.indexOf(u) === -1).map(u => R.getCard(state, u));
      const light = MA.scoring.score(state, played, held, { preview: true, isFinalSend: state.sendsLeft === 1 }).light;
      if (light > bestLight) { bestLight = light; best = c; }
    });
    return best.uids;
  }

  function tryConsumables(inBlind) {
    const list = state.consumables.slice();
    for (let i = 0; i < list.length; i++) {
      if (rnd() > (list[i].kind === 'constellation' ? 0.9 : 0.4)) continue;
      const c = list[i];
      let sel = [];
      if (c.kind === 'letter') {
        const def = MA.content.letters[c.id];
        const min = def.min || 0, max = def.max === undefined ? min : def.max;
        if (min > 0) {
          if (!inBlind) {
            // must be refused outside a blind
            const r = R.canUseConsumable(state, c.uid, state.hand.slice(0, min));
            if (r === true) fail('card-needing letter allowed outside a blind: ' + c.id);
            continue;
          }
          const n = ri(min, Math.max(min, max));
          const pool = state.hand.slice();
          for (let k = 0; k < n && pool.length; k++) sel.push(pool.splice(ri(0, pool.length - 1), 1)[0]);
        }
      }
      const can = R.canUseConsumable(state, c.uid, sel);
      const before = R.serialize(state);
      const res = R.useConsumable(state, c.uid, sel);
      if (can === true) {
        if (!res.ok) fail('canUse said yes but use failed for ' + c.id + ': ' + res.reason);
        if (state.consumables.some(x => x.uid === c.uid)) fail('used consumable not removed');
        if (c.id === 'tear' || c.id === 'carbon') extraCards++;
        checkUseResult(res, c, sel);
        letters++;
      } else {
        if (res.ok) fail('canUse said no (' + can + ') but use worked for ' + c.id);
        if (R.serialize(state) !== before) fail('refused consumable use changed state');
      }
      check('use ' + c.id);
    }
  }

  /* result-shape contract of useConsumable */
  function checkUseResult(res, c, sel) {
    if (!Array.isArray(res.destroyed) || !Array.isArray(res.created) || !Array.isArray(res.changed)) fail('useConsumable extras missing');
    if (res.kind !== c.kind || res.id !== c.id) fail('useConsumable kind/id');
    res.destroyed.forEach(u => { if (R.getCard(state, u)) fail('destroyed card still in the deck'); });
    res.created.forEach(u => { if (!R.getCard(state, u)) fail('created card missing from the deck'); });
    res.changed.forEach(u => { if (sel.indexOf(u) === -1 || !R.getCard(state, u)) fail('bad changed uid'); });
    if (res.hand !== undefined && state.handLevels[res.hand].level !== res.level) fail('levelled hand/level mismatch');
    if (c.kind === 'constellation' && res.hand === undefined) fail('constellation result lacks hand/level');
  }

  function resolvePack() {
    let guard = 0;
    while (state.pack && guard++ < 6) {
      const pk = state.pack;
      if (rnd() < 0.15) { R.skipPack(state); check('skipPack'); break; }
      const idx = ri(0, pk.choices.length - 1);
      const chosen = pk.choices[idx];
      const res = R.choosePack(state, idx);
      if (res.ok) {
        if (res.kind !== chosen.kind || res.id !== chosen.id) fail('choosePack kind/id');
        if (chosen.kind === 'constellation') { if (state.handLevels[res.hand].level !== res.level) fail('choosePack level'); }
        else {
          const pool = chosen.kind === 'letter' ? state.consumables : state.keepsakes;
          if (!pool.some(x => x.uid === res.uid)) fail('choosePack uid not an owned instance');
        }
      }
      if (!res.ok) {
        if (!state.pack) fail('failed choosePack closed the pack');
        // no room: sell something to make room, or give up
        if (rnd() < 0.5 && (state.consumables.length || state.keepsakes.length)) {
          const target = pick(state.consumables.concat(state.keepsakes));
          R.sell(state, target.uid);
        } else { R.skipPack(state); }
      }
      check('choosePack');
    }
    if (state.pack) { R.skipPack(state); check('skipPack (forced)'); }
    packs++;
  }

  function playBlind() {
    extraCards = 0;
    let guard = 0;
    while (state.phase === 'playing' && guard++ < 60) {
      if (rnd() < 0.1) { R.sortHand(state, rnd() < 0.5 ? 'rank' : 'suit'); check('sortHand'); }
      if (state.consumables.length && rnd() < 0.5) tryConsumables(true);
      if (rnd() < 0.15) chaos();
      // occasionally preview a random selection (must be pure)
      if (rnd() < 0.2 && state.hand.length) {
        const before = R.serialize(state);
        const sel = state.hand.slice(0, ri(1, Math.min(5, state.hand.length)));
        const pv = R.preview(state, sel);
        if (R.serialize(state) !== before) fail('preview changed state');
        if (sel.some(u => R.getCard(state, u).faceDown) && (!pv || pv.type !== null || pv.name !== '???')) fail('preview leaked a face-down card');
      }
      if (state.crumplesLeft > 0 && state.hand.length > 1 && rnd() < 0.4) {
        let sel = [];
        const keep = rnd() < 0.85 ? chooseSend() : null;
        if (keep) {
          sel = R.handCards(state).filter(c => keep.indexOf(c.uid) === -1).sort((a, b) => a.rank - b.rank).slice(0, 5).map(c => c.uid);
        }
        if (!sel.length) {
          const n = ri(1, Math.min(5, state.hand.length - 1));
          const pool = state.hand.slice();
          for (let k = 0; k < n; k++) sel.push(pool.splice(ri(0, pool.length - 1), 1)[0]);
        }
        const res = R.crumple(state, sel);
        if (!res.ok) fail('crumple refused: ' + res.reason);
        check('crumple');
        R.drawToFull(state); check('drawToFull');
        continue;
      }
      const uids = chooseSend();
      if (!uids) {
        // nothing legal to send: crumple if possible, otherwise this is a soft lock
        if (state.crumplesLeft > 0 && state.hand.length > 1) {
          const res = R.crumple(state, state.hand.slice(0, 1));
          if (!res.ok) fail('stuck and crumple refused: ' + res.reason);
          check('crumple (stuck)'); R.drawToFull(state); check('drawToFull');
          continue;
        }
        fail('SOFT LOCK: no legal send and no Crumples (hand ' + state.hand.length + ', draw ' + state.drawPile.length + ')');
      }
      const before = { score: state.roundScore, sends: state.sendsLeft, stamps: state.stamps };
      const out = R.send(state, uids);
      sends++;
      if (!out.ok) fail('chosen send refused: ' + out.reason);
      const r = out.result;
      if (r.events[0].t !== 'hand' || r.events[r.events.length - 1].t !== 'total') fail('event list shape');
      if (r.events[r.events.length - 1].amount !== r.light) fail('total event != light');
      r.events.forEach(e => { if (!isFinite(e.ink) || !isFinite(e.glow)) fail('non-finite running value'); });
      if (state.roundScore !== before.score + r.light) fail('roundScore mismatch');
      if (state.sendsLeft !== before.sends - 1) fail('sendsLeft mismatch');
      if (['continue', 'won', 'lost', 'saved'].indexOf(out.outcome) === -1) fail('bad outcome ' + out.outcome);
      if (out.won !== (out.outcome === 'won' || out.outcome === 'saved')) fail('send.won flag');
      if (out.outcome === 'saved' && (typeof out.savedById !== 'string' || !out.savedBy)) fail('saved without savedById');
      if (r.baseInk === undefined || r.rawBaseInk === undefined) fail('missing base values');
      check('send ' + out.outcome);
      if (out.outcome === 'continue') {
        if (state.roundScore >= state.target) fail('should have won');
        if (state.sendsLeft <= 0 && state.hand.length + state.drawPile.length > 0) fail('should have lost');
        R.drawToFull(state); check('drawToFull');
      } else if (out.outcome === 'won' || out.outcome === 'saved') {
        if (out.outcome === 'won' && state.roundScore < state.target) fail('won below target');
        if (state.phase !== 'playing') fail('phase must stay playing until cashOut');
        const co = R.cashOut(state);
        if (!co || state.phase !== 'cashout') fail('cashOut failed');
        const sum = co.lines.reduce((a, l) => a + l.amount, 0);
        if (sum !== co.total) fail('cashout lines do not sum');
        co.lines.forEach(l => { if (!l.amount) fail('zero-value cashout line ' + l.label); });
        check('cashOut');
        const s0 = state.stamps;
        R.collect(state);
        if (state.stamps !== s0 + co.total) fail('collect did not add the total');
        check('collect');
        return;
      } else {
        if (state.phase !== 'gameover') fail('lost but phase ' + state.phase);
        return;
      }
    }
    if (state.phase === 'playing') fail('blind never ended');
  }

  function shopPhase() {
    const n = ri(1, 6);
    for (let i = 0; i < n && state.phase === 'shop'; i++) {
      if (rnd() < 0.1) chaos();
      const r = rnd();
      if (r < 0.45) {
        let idx = ri(0, state.shop.items.length - 1);
        if (rnd() < 0.7) {
          const rank = { keepsake: 0, constellation: 1, letter: 2 };
          const order = state.shop.items.map((it, i) => i).filter(i => !state.shop.items[i].sold && state.shop.items[i].price <= state.stamps)
            .sort((a, b) => rank[state.shop.items[a].kind] - rank[state.shop.items[b].kind]);
          if (order.length) idx = order[0];
        }
        const item = state.shop.items[idx];
        let before = state.stamps;
        let res = R.buy(state, idx);
        if (!res.ok && /shelf is full/.test(res.reason || '') && state.keepsakes.length && rnd() < 0.6) {
          R.sell(state, pick(state.keepsakes).uid); before = state.stamps; res = R.buy(state, idx);
        }
        if (!res.ok && /consumable slots/.test(res.reason || '') && state.consumables.length && rnd() < 0.6) {
          R.sell(state, pick(state.consumables).uid); before = state.stamps; res = R.buy(state, idx);
        }
        if (res.ok) {
          shopBuys++;
          if (state.stamps !== before - item.price || !item.sold) fail('buy bookkeeping');
          if (!state.keepsakes.concat(state.consumables).some(x => x.uid === res.uid)) fail('buy returned no valid uid');
        }
        else if (state.stamps !== before) fail('failed buy cost stamps');
        check('buy');
      } else if (r < 0.55) {
        const idx = ri(0, state.shop.packs.length - 1);
        const before = state.stamps, price = state.shop.packs[idx].price;
        const res = R.buyPack(state, idx);
        if (res.ok) {
          if (state.stamps !== before - price) fail('pack price');
          if (!state.pack || state.pack.source !== 'shop' || !state.pack.choices.length) fail('pack shape');
          check('buyPack'); resolvePack();
        } else check('buyPack refused');
      } else if (r < 0.65) {
        const cost = state.shop.rerollCost, before = state.stamps;
        const res = R.reroll(state);
        if (res.ok) { if (state.stamps !== before - cost || state.shop.rerollCost !== cost + 1) fail('reroll cost'); }
        else if (state.stamps !== before) fail('failed reroll cost stamps');
        check('reroll');
      } else if (r < 0.78) {
        tryConsumables(false);
      } else if (r < 0.86) {
        const all = state.consumables.concat(state.keepsakes);
        if (all.length) {
          const target = pick(all), before = state.stamps, expect = R.sellValue(state, target.uid);
          const res = R.sell(state, target.uid);
          if (!res.ok || state.stamps !== before + expect) fail('sell bookkeeping');
        }
        check('sell');
      } else if (r < 0.95) {
        if (state.keepsakes.length > 1) R.moveKeepsake(state, ri(0, state.keepsakes.length - 1), ri(0, state.keepsakes.length - 1));
        check('moveKeepsake');
      }
    }
    if (state.pack) fail('pack left open');
    R.leaveShop(state); check('leaveShop');
  }

  let safety = 0;
  while (state.phase !== 'gameover' && state.phase !== 'victory' && safety++ < 400) {
    const ph = state.phase;
    if (ph === 'blindSelect') {
      if (rnd() < 0.1) chaos();
      if (state.pack) { resolvePack(); continue; }
      const info = R.blindInfo(state);
      if (info.canSkip && rnd() < 0.2) {
        const p = R.skipBlind(state);
        if (!p || p.source !== 'skip') fail('skipBlind failed');
        skips++;
        check('skipBlind'); resolvePack(); continue;
      }
      // Visitors can never be skipped
      if (!info.canSkip && R.skipBlind(state) !== null) fail('skipped a Visitor');
      const res = R.startBlind(state);
      if (!res.ok) fail('startBlind refused: ' + res.reason);
      if (res.drawn.length !== Math.min(state.handSize, 52)) { /* deck may have been sculpted */ }
      if (opts.easy) state.target = Math.max(1, Math.floor(state.target * (0.003 + 0.06 * rnd())));   // exercise the late game
      check('startBlind');
      playBlind();
    } else if (ph === 'shop') {
      shopPhase();
    } else if (ph === 'cashout') {
      R.collect(state); check('collect');
    } else if (ph === 'playing') {
      playBlind();
    } else fail('unexpected phase ' + ph);
  }
  if (state.phase !== 'gameover' && state.phase !== 'victory') fail('run did not finish');
  return {
    seed: seed, phase: state.phase, ante: state.ante, blindIndex: state.blindIndex, won: state.phase === 'victory',
    steps: steps, roundTrips: roundTrips, sends: sends, letters: letters, packs: packs, skips: skips, shopBuys: shopBuys,
    finalState: R.serialize(state), keepsakesHeld: state.keepsakes.length
  };
}

function run(o) {
  const L = o.load();
  const MA = L.MA;
  const errors = [];
  const groups = { normal: null, easy: null };
  function newGroup() {
    const g = { runs: 0, reached: {}, endedAt: {}, won: 0 };
    for (let n = 1; n <= 8; n++) g.reached[n] = 0;
    return g;
  }
  groups.normal = newGroup(); groups.easy = newGroup();
  let roundTrips = 0, sends = 0, letters = 0, packs = 0, skips = 0, buys = 0;
  for (let i = 0; i < o.runs; i++) {
    const seed = 1000 + i * 7;
    const easy = (o.easyEvery || 3) > 0 && i % (o.easyEvery || 3) === 2;   // every 3rd run has scaled-down targets
    const g = easy ? groups.easy : groups.normal;
    try {
      const r = runOne(MA, seed, { easy: easy });
      g.runs++;
      for (let n = 1; n <= r.ante; n++) g.reached[n]++;
      if (r.won) g.won++;
      g.endedAt[r.ante] = (g.endedAt[r.ante] || 0) + 1;
      roundTrips += r.roundTrips; sends += r.sends; letters += r.letters; packs += r.packs; skips += r.skips; buys += r.shopBuys;
    } catch (e) { errors.push(e); }
  }
  o.log('  fuzz: ' + o.runs + ' runs, ' + errors.length + ' errors, ' + sends + ' sends, ' + letters + ' letters used, ' +
        packs + ' packs opened, ' + skips + ' blinds skipped, ' + buys + ' shop buys, ' + roundTrips + ' save round-trips');
  ['normal', 'easy'].forEach(function (k) {
    const g = groups[k];
    o.log('  fuzz[' + k + (k === 'easy' ? ' (targets x0.003-0.06, exercises Nights 5-8)' : '') + ']: ' + g.runs + ' runs, victories ' + g.won);
    o.log('     reached Night n : ' + Object.keys(g.reached).map(n => n + ':' + g.reached[n]).join('  '));
    o.log('     ended on Night n: ' + Object.keys(g.endedAt).map(n => n + ':' + g.endedAt[n]).join('  '));
  });
  return { errors: errors, groups: groups, reached: groups.normal.reached, easy: groups.easy, won: groups.normal.won + groups.easy.won, roundTrips: roundTrips };
}

module.exports = { run: run, runOne: runOne };
