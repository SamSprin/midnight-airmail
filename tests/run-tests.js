/* Midnight Airmail — engine test runner.  Run from the project root:  node tests/run-tests.js
   Loads the game scripts into vm contexts (window = context global). No dependencies. */
'use strict';
const H = require('./engine-harness.js');
const fuzz = require('./engine-fuzz.js');
const { test, section, eq, near, assert, load, cardsFrom, setHand, uidsOf, installTestKeepsakes } = H;

const started = Date.now();
const base = load();
console.log('Midnight Airmail engine tests');
console.log('  loaded : ' + base.info.loaded.join(', '));
console.log('  content: keepsakes ' + (base.info.stubbed.indexOf('keepsakes') >= 0 ? 'STUBBED' : 'real') +
            ', letters ' + (base.info.stubbed.indexOf('letters') >= 0 ? 'STUBBED' : 'real') +
            (base.info.missing.length ? '  (missing: ' + base.info.missing.join(', ') + ')' : ''));

const SUIT_LETTER = { star: 's', moon: 'm', bloom: 'b', leaf: 'l' };
const RL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const code = function (c) { return (RL[c.rank] || c.rank) + SUIT_LETTER[c.suit]; };

/* A fresh context with test-only keepsake doubles added to whatever content is loaded. */
function ctx() { const L = load(); installTestKeepsakes(L.MA); return L.MA; }

/* A run in phase 'playing' with a huge target so nothing ends unless the test wants it to. */
function begin(MA, o) {
  o = o || {};
  const s = MA.run.newRun(o.seed || 1);
  if (o.ante) s.ante = o.ante;
  if (o.boss) { s.bosses[s.ante - 1] = o.boss; s.blindIndex = 2; }
  else if (o.blindIndex !== undefined) s.blindIndex = o.blindIndex;
  (o.give || []).forEach(function (id) { MA.run.debug.giveKeepsake(s, id); });
  const r = MA.run.startBlind(s);
  assert.ok(r.ok, 'startBlind');
  if (o.target !== false) s.target = 1e12;
  return s;
}
function conserved(MA, s) {
  const p = MA.run.checkInvariants(s);
  assert.deepStrictEqual(Array.from(p), [], 'invariants: ' + p.join('; '));
}
/* Win the current blind quickly and cash out. */
function winNow(MA, s) {
  s.target = 1;
  const r = MA.run.send(s, [s.hand[0]]);
  assert.strictEqual(r.outcome, 'won');
  return MA.run.cashOut(s);
}
function toShop(MA, s) {
  if (s.phase === 'blindSelect') MA.run.startBlind(s);
  winNow(MA, s);
  MA.run.collect(s);
  assert.strictEqual(s.phase, 'shop');
  return s;
}
function evalCodes(MA, codes, four) {
  const S = { nextUid: 0 };
  const cards = cardsFrom(MA, S, codes);
  const r = MA.hands.evaluate(cards, { fourFingers: !!four });
  return { type: r.type, scoring: r.scoring.map(code), contains: r.contains };
}

/* ======================================================================== cards */
section('cards');
test('deck is 52 unique cards, 13 ranks x 4 suits', () => {
  const MA = base.MA, s = MA.run.newRun(5);
  assert.strictEqual(s.deck.length, 52);
  assert.strictEqual(new Set(s.deck.map(c => c.uid)).size, 52);
  MA.cards.SUITS.forEach(su => assert.strictEqual(s.deck.filter(c => c.suit === su).length, 13));
  assert.deepStrictEqual(Array.from(new Set(s.deck.map(c => c.rank))).sort((a, b) => a - b), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
});
test('ink / paper values and faces', () => {
  const MA = base.MA, C = MA.cards;
  const mk = r => ({ rank: r });
  eq([2, 9, 10, 11, 12, 13, 14].map(r => C.inkValue(mk(r))), [2, 9, 10, 10, 10, 10, 11]);
  eq([2, 10, 11, 12, 13, 14].map(r => C.paperValue(mk(r))), [2, 10, 11, 12, 13, 1]);
  eq([1, 2, 13].map(C.rankFromPaper), [14, 2, 13]);
  eq([10, 11, 12, 13, 14].map(r => C.isFace(mk(r))), [false, true, true, true, false]);
});
test('describe(): title, sticker text, debuffed line', () => {
  const MA = base.MA, s = MA.run.newRun(1);
  const c = MA.cards.makeCard(s, 7, 'star', 'graph');
  const d = MA.cards.describe(c);
  assert.strictEqual(d.title, '7 of Stars');
  assert.ok(d.lines.some(l => l.indexOf('+30 Ink') >= 0), 'sticker line');
  assert.ok(!d.lines.some(l => /Debuffed tonight/.test(l)));
  c.debuffed = true;
  assert.ok(MA.cards.describe(c).lines.some(l => l === 'Debuffed tonight'));
  assert.strictEqual(MA.cards.describe(MA.cards.makeCard(s, 12, 'leaf')).title, 'Queen of Leaves');
  ['graph', 'watercolor', 'foil', 'glitter', 'washi', 'wax'].forEach(k => assert.ok(MA.cards.STICKERS[k].name && MA.cards.STICKERS[k].text));
});

/* ======================================================================== hands */
section('hands.evaluate');
const HAND_CASES = [
  [['2s', '5m', '9b', 'Jl', 'Ks'], 'high', ['Ks']],
  [['9s', 'Kb', '9m', '2l', '3s'], 'pair', ['9s', '9m']],
  [['4s', '9m', '4b', '9l', 'Kb'], 'twopair', ['4s', '9m', '4b', '9l']],
  [['7s', '7m', '2b', '7l', 'Kb'], 'three', ['7s', '7m', '7l']],
  [['9s', '5m', '7b', '6l', '8s'], 'straight', ['9s', '5m', '7b', '6l', '8s']],
  [['As', '2m', '3b', '4l', '5s'], 'straight', ['As', '2m', '3b', '4l', '5s']],       // ace low
  [['10s', 'Jm', 'Qb', 'Kl', 'As'], 'straight', ['10s', 'Jm', 'Qb', 'Kl', 'As']],     // ace high
  [['Qs', 'Km', 'Ab', '2l', '3s'], 'high', ['Ab']],                                    // no wraparound
  [['Ks', 'As', '2m', '3b', '4l'], 'high', ['As']],                                    // no wraparound (other side)
  [['3s', '4m', '5b', '6l', 'Ks'], 'high', ['Ks']],                                    // 4-run is not a straight
  [['2s', '5s', '9s', 'Js', 'Ks'], 'flush', ['2s', '5s', '9s', 'Js', 'Ks']],
  [['3s', '3m', '8b', '8l', '3b'], 'fullhouse', ['3s', '3m', '8b', '8l', '3b']],
  [['6s', '6m', '6b', '6l', 'Kb'], 'four', ['6s', '6m', '6b', '6l']],
  [['Kb', '6s', '6m', '6b', '6l'], 'four', ['6s', '6m', '6b', '6l']],
  [['5b', '6b', '7b', '8b', '9b'], 'straightflush', ['5b', '6b', '7b', '8b', '9b']],
  [['10l', 'Jl', 'Ql', 'Kl', 'Al'], 'straightflush', ['10l', 'Jl', 'Ql', 'Kl', 'Al']],
  [['7s', '7m', '7b', '7l', '7s'], 'five', ['7s', '7m', '7b', '7l', '7s']],
  [['7s', '7s', '7s', 'Ks', 'Ks'], 'flushhouse', ['7s', '7s', '7s', 'Ks', 'Ks']],
  [['7s', '7s', '7s', '7s', '7s'], 'flushfive', ['7s', '7s', '7s', '7s', '7s']],
  [['5s', '6m', '7b', '8l', '8s'], 'pair', ['8l', '8s']],                              // duplicate rank breaks the straight
  [['Qm'], 'high', ['Qm']],
  [['5s', 'Km'], 'high', ['Km']],
  [['5s', '5m'], 'pair', ['5s', '5m']],
  [['5s', '5m', '5b'], 'three', ['5s', '5m', '5b']],
  [['5s', '5m', '5b', '5l'], 'four', ['5s', '5m', '5b', '5l']],
  [['5s', '5m', '9b', '9l'], 'twopair', ['5s', '5m', '9b', '9l']],
  [['2s', '2m', '3b'], 'pair', ['2s', '2m']],
  [['2s', '5s', '9s', 'Ks'], 'high', ['Ks']],                                          // 4 of a suit is not a flush
  [['3s', '4m', '5b', '6l'], 'high', ['6l']]                                           // 4 in a row is not a straight
];
HAND_CASES.forEach(function (c) {
  test('evaluate ' + c[0].join(' ') + ' -> ' + c[1], () => {
    const r = evalCodes(base.MA, c[0]);
    assert.strictEqual(r.type, c[1]);
    eq(r.scoring, c[2]);
  });
});
test('evaluate([]) -> null, evaluate(null) -> null', () => {
  assert.strictEqual(base.MA.hands.evaluate([], {}), null);
  assert.strictEqual(base.MA.hands.evaluate(null), null);
});
test('scoring subsets keep played order', () => {
  eq(evalCodes(base.MA, ['Kb', '9s', '2l', '9m', '3s']).scoring, ['9s', '9m']);
  eq(evalCodes(base.MA, ['9l', '2s', '4b', '9m', '4s']).scoring, ['9l', '4b', '9m', '4s']);
});

section('hands.evaluate with fourFingers');
[
  [['3s', '4m', '5b', '6l'], 'straight', ['3s', '4m', '5b', '6l']],
  [['3s', '4m', '5b', '6l', 'Ks'], 'straight', ['3s', '4m', '5b', '6l']],
  [['3s', '4m', '5b', '6l', '7s'], 'straight', ['3s', '4m', '5b', '6l', '7s']],
  [['As', '2m', '3b', '4l'], 'straight', ['As', '2m', '3b', '4l']],
  [['Ks', 'As', '2m', '3b', '4l'], 'straight', ['As', '2m', '3b', '4l']],
  [['Qs', 'Km', 'Ab', '2l'], 'high', ['Ab']],
  [['3s', '4m', '5b', '6l', '6s'], 'straight', ['3s', '4m', '5b', '6l']],
  [['2s', '5s', '9s', 'Ks'], 'flush', ['2s', '5s', '9s', 'Ks']],
  [['2s', '5s', '9s', 'Ks', '3l'], 'flush', ['2s', '5s', '9s', 'Ks']],
  [['3s', '4s', '5s', '6s'], 'straightflush', ['3s', '4s', '5s', '6s']],
  [['3s', '4s', '5s', '6s', 'Kl'], 'straightflush', ['3s', '4s', '5s', '6s']],
  [['2s', '7s', '9s'], 'high', ['9s']]
].forEach(function (c) {
  test('fourFingers ' + c[0].join(' ') + ' -> ' + c[1], () => {
    const r = evalCodes(base.MA, c[0], true);
    assert.strictEqual(r.type, c[1]);
    eq(r.scoring, c[2]);
  });
});

section('hands.contains');
test('contains flags follow the design (implied hands included)', () => {
  const C = (codes, four) => evalCodes(base.MA, codes, four).contains;
  const T = (contains, keys) => Object.keys(contains).filter(k => contains[k]).sort();
  eq(T(C(['2s', '5m', '9b', 'Jl', 'Ks'])), ['high']);
  eq(T(C(['9s', 'Kb', '9m', '2l', '3s'])), ['high', 'pair']);
  eq(T(C(['7s', '7m', '2b', '7l', 'Kb'])), ['high', 'pair', 'three']);
  eq(T(C(['4s', '9m', '4b', '9l', 'Kb'])), ['high', 'pair', 'twopair']);
  eq(T(C(['3s', '3m', '8b', '8l', '3b'])), ['fullhouse', 'high', 'pair', 'three', 'twopair']);
  eq(T(C(['6s', '6m', '6b', '6l', 'Kb'])), ['four', 'high', 'pair', 'three', 'twopair']);
  eq(T(C(['7s', '7m', '7b', '7l', '7s'])), ['five', 'four', 'high', 'pair', 'three', 'twopair']);
  eq(T(C(['9s', '5m', '7b', '6l', '8s'])), ['high', 'straight']);
  eq(T(C(['2s', '5s', '9s', 'Js', 'Ks'])), ['flush', 'high']);
  eq(T(C(['5b', '6b', '7b', '8b', '9b'])), ['flush', 'high', 'straight', 'straightflush']);
  eq(T(C(['7s', '7s', '7s', 'Ks', 'Ks'])), ['flush', 'flushhouse', 'fullhouse', 'high', 'pair', 'three', 'twopair']);
  eq(T(C(['7s', '7s', '7s', '7s', '7s'])), ['five', 'flush', 'flushfive', 'four', 'high', 'pair', 'three', 'twopair']);
  eq(T(C(['3s', '4m', '5b', '6l'], true)), ['high', 'straight']);
  eq(T(C(['5s', '5m'])), ['high', 'pair']);
});
test('hands.values scales with level; INFO table matches the design', () => {
  const MA = base.MA, s = MA.run.newRun(1);
  eq(MA.hands.values(s, 'pair'), { ink: 10, glow: 2, level: 1 });
  s.handLevels.pair.level = 4;
  eq(MA.hands.values(s, 'pair'), { ink: 55, glow: 5, level: 4 });
  s.handLevels.flushfive.level = 2;
  eq(MA.hands.values(s, 'flushfive'), { ink: 210, glow: 19, level: 2 });
  eq(MA.hands.ORDER.length, 12);
  eq(MA.hands.ORDER.filter(h => MA.hands.INFO[h].secret), ['five', 'flushhouse', 'flushfive']);
  eq(MA.hands.INFO.high, { id: 'high', name: 'Lone Star', poker: 'High Card', ink: 5, glow: 1, dInk: 10, dGlow: 1, secret: false });
});

/* ======================================================================== scoring */
section('scoring');
const PAIR = ['7s', '7m', '2b', '4l', '9s'];       // pair of 7s: base 10 Ink x 2 Glow
function scoreCodes(MA, s, codes, heldCodes, prep) {
  const played = cardsFrom(MA, s, codes), held = cardsFrom(MA, s, heldCodes || []);
  if (prep) prep(played, held);
  return { r: MA.scoring.score(s, played, held, {}), played: played, held: held };
}
const brief = r => r.events.map(e => [e.t, e.amount === undefined ? null : e.amount, e.ink, e.glow]);

test('known pair: exact Ink/Glow/Light and event order', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  const { r, played } = scoreCodes(MA, s, PAIR);
  assert.strictEqual(r.handType, 'pair');
  eq(brief(r), [['hand', null, 10, 2], ['ink', 7, 17, 2], ['ink', 7, 24, 2], ['total', 48, 24, 2]]);
  assert.strictEqual(r.light, 48); assert.strictEqual(r.ink, 24); assert.strictEqual(r.glow, 2);
  assert.strictEqual(r.level, 1); assert.strictEqual(r.fullMoon, false);
  eq(r.scoringUids, [played[0].uid, played[1].uid]);
  eq(r.debuffedUids, []);
  eq(r.events.map(e => e.src.kind), ['hand', 'card', 'card', 'hand']);
  assert.strictEqual(r.events[1].src.uid, played[0].uid);
  assert.strictEqual(r.events[1].cardUid, played[0].uid);
});
test('hand level raises base values', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  s.handLevels.pair.level = 3;                       // 40 Ink x 4 Glow
  const { r } = scoreCodes(MA, s, PAIR);
  assert.strictEqual(r.light, (40 + 14) * 4);
});
test('sticker: graph paper +30 Ink', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  const { r } = scoreCodes(MA, s, PAIR, [], p => { p[0].sticker = 'graph'; });
  eq(brief(r), [['hand', null, 10, 2], ['ink', 7, 17, 2], ['ink', 30, 47, 2], ['ink', 7, 54, 2], ['total', 108, 54, 2]]);
});
test('sticker: watercolor +4 Glow', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  const { r } = scoreCodes(MA, s, PAIR, [], p => { p[1].sticker = 'watercolor'; });
  eq(brief(r), [['hand', null, 10, 2], ['ink', 7, 17, 2], ['ink', 7, 24, 2], ['glow', 4, 24, 6], ['total', 144, 24, 6]]);
});
test('sticker: foil x1.5 Glow', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  const { r } = scoreCodes(MA, s, PAIR, [], p => { p[0].sticker = 'foil'; });
  assert.strictEqual(r.light, 72);
  assert.strictEqual(r.events[2].t, 'xglow'); assert.strictEqual(r.events[2].amount, 1.5);
});
test('sticker: glitter 1-in-4 +15 Glow (forced RNG both ways)', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  const orig = MA.util.chance;
  try {
    MA.util.chance = () => true;
    let out = scoreCodes(MA, s, PAIR, [], p => { p[0].sticker = 'glitter'; });
    eq(brief(out.r), [['hand', null, 10, 2], ['ink', 7, 17, 2], ['glow', 15, 17, 17], ['ink', 7, 24, 17], ['total', 408, 24, 17]]);
    MA.util.chance = () => false;
    out = scoreCodes(MA, s, PAIR, [], p => { p[0].sticker = 'glitter'; });
    assert.strictEqual(out.r.light, 48);
  } finally { MA.util.chance = orig; }
});
test('sticker: glitter really is seeded (same seed, same result; RNG advances once per glitter card)', () => {
  const MA = ctx();
  const a = MA.run.newRun(77), b = MA.run.newRun(77);
  const run1 = st => scoreCodes(MA, st, PAIR, [], p => { p[0].sticker = 'glitter'; p[1].sticker = 'glitter'; }).r;
  const ra = run1(a), rb = run1(b);
  eq(brief(ra), brief(rb));
  const c = MA.run.newRun(77);
  MA.util.rand(c); MA.util.rand(c);
  assert.strictEqual(a.rng.s, c.rng.s, 'two glitter cards -> exactly two draws');
  let hits = 0; const N = 4000, st = MA.run.newRun(3);
  for (let i = 0; i < N; i++) if (scoreCodes(MA, st, PAIR, [], p => { p[0].sticker = 'glitter'; }).r.glow > 2) hits++;
  assert.ok(hits > N * 0.21 && hits < N * 0.29, 'glitter rate ' + hits / N);
});
test('sticker: washi tape x1.5 only while held (not when played)', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  let out = scoreCodes(MA, s, PAIR, ['Kb'], (p, h) => { h[0].sticker = 'washi'; });
  eq(brief(out.r), [['hand', null, 10, 2], ['ink', 7, 17, 2], ['ink', 7, 24, 2], ['xglow', 1.5, 24, 3], ['total', 72, 24, 3]]);
  assert.strictEqual(out.r.events[3].src.kind, 'held'); assert.strictEqual(out.r.events[3].src.uid, out.held[0].uid);
  out = scoreCodes(MA, s, PAIR, [], p => { p[0].sticker = 'washi'; });
  assert.strictEqual(out.r.light, 48, 'played washi does nothing');
  out = scoreCodes(MA, s, PAIR, ['Kb'], (p, h) => { h[0].sticker = 'washi'; h[0].debuffed = true; });
  assert.strictEqual(out.r.light, 48, 'debuffed held washi does nothing');
});
test('sticker: wax and non-scoring cards never add score', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  const out = scoreCodes(MA, s, PAIR, [], p => { p[0].sticker = 'wax'; p[2].sticker = 'graph'; p[3].sticker = 'foil'; });
  assert.strictEqual(out.r.light, 48);
});
test('debuffed scoring cards are skipped but still count for the hand type', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  const out = scoreCodes(MA, s, PAIR, [], p => { p[1].debuffed = true; });
  assert.strictEqual(out.r.handType, 'pair');
  eq(brief(out.r), [['hand', null, 10, 2], ['ink', 7, 17, 2], ['debuffed', null, 17, 2], ['total', 34, 17, 2]]);
  eq(out.r.debuffedUids, [out.played[1].uid]); eq(out.r.scoringUids, [out.played[0].uid]);
  assert.strictEqual(out.r.events[2].src.uid, out.played[1].uid);
});
test('full moon: final x2 Glow with src moon; hidden by Clouds and Daybreak', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  s.moonPhase = 4;
  let out = scoreCodes(MA, s, PAIR);
  eq(brief(out.r), [['hand', null, 10, 2], ['ink', 7, 17, 2], ['ink', 7, 24, 2], ['xglow', 2, 24, 4], ['total', 96, 24, 4]]);
  assert.strictEqual(out.r.events[3].src.kind, 'moon'); assert.strictEqual(out.r.fullMoon, true);
  s.moonPhase = 3; out = scoreCodes(MA, s, PAIR); assert.strictEqual(out.r.fullMoon, false); assert.strictEqual(out.r.light, 48);
  s.moonPhase = 4; s.blindIndex = 2; s.phase = 'playing'; s.bosses[0] = 'the_clouds';
  out = scoreCodes(MA, s, PAIR); assert.strictEqual(out.r.fullMoon, false); assert.strictEqual(out.r.light, 48);
  s.ante = 8; s.bosses[7] = 'daybreak';
  out = scoreCodes(MA, s, PAIR); assert.strictEqual(out.r.fullMoon, false);
});
test('the Hush halves base Ink and Glow (floor, min 1)', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  s.blindIndex = 2; s.phase = 'playing'; s.bosses[0] = 'the_hush';
  let out = scoreCodes(MA, s, PAIR);
  eq(brief(out.r), [['hand', null, 10, 2], ['ink', -5, 5, 2], ['glow', -1, 5, 1], ['ink', 7, 12, 1], ['ink', 7, 19, 1], ['total', 19, 19, 1]]);
  assert.strictEqual(out.r.events[1].src.kind, 'boss');
  s.handLevels.pair.level = 3;                       // 40 x 4 -> 20 x 2
  out = scoreCodes(MA, s, PAIR); assert.strictEqual(out.r.light, (20 + 14) * 2);
  out = scoreCodes(MA, s, ['2s', '5m', '9b', 'Jl', 'Ks']);   // high card 5 x 1 -> 2 x 1
  eq(brief(out.r), [['hand', null, 5, 1], ['ink', -3, 2, 1], ['ink', 10, 12, 1], ['total', 12, 12, 1]]);
});
test('keepsake hooks: retrigger, per-card, onHand, running values', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  ['t_clip', 't_music', 't_glow4'].forEach(id => MA.run.debug.giveKeepsake(s, id));
  const out = scoreCodes(MA, s, ['Ks', 'Km', '2b', '4l', '9s']);
  const r = out.r, music = s.keepsakes[1].uid;
  eq(brief(r), [
    ['hand', null, 10, 2],
    ['ink', 10, 20, 2], ['glow', 3, 20, 5],
    ['retrigger', null, 20, 5], ['ink', 10, 30, 5], ['glow', 3, 30, 8],
    ['ink', 10, 40, 8],
    ['retrigger', null, 40, 8], ['ink', 10, 50, 8],
    ['glow', 4, 50, 12],
    ['total', 600, 50, 12]]);
  assert.strictEqual(r.events[3].src.kind, 'keepsake'); assert.strictEqual(r.events[3].src.uid, music);
  assert.strictEqual(r.events[2].src.uid, s.keepsakes[0].uid);
  assert.strictEqual(r.events[2].cardUid, out.played[0].uid);
  assert.strictEqual(r.events[9].src.uid, s.keepsakes[2].uid);
});
test('hook order: onHandSent, per-card (retrigger then scored), held, onHand - left to right', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  MA.run.debug.giveKeepsake(s, 't_log_a'); MA.run.debug.giveKeepsake(s, 't_log_b');
  scoreCodes(MA, s, PAIR, ['Kb', 'Qb']);
  eq(MA.__log, ['t_log_a:sent', 't_log_b:sent',
    't_log_a:retrig', 't_log_b:retrig', 't_log_a:card', 't_log_b:card',
    't_log_a:retrig', 't_log_b:retrig', 't_log_a:card', 't_log_b:card',
    't_log_a:held', 't_log_b:held', 't_log_a:held', 't_log_b:held',
    't_log_a:hand', 't_log_b:hand']);
});
test('held keepsake effects (onHeld) and debuffed held cards are skipped', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  MA.run.debug.giveKeepsake(s, 't_held');
  const out = scoreCodes(MA, s, PAIR, ['Kb', 'Qb'], (p, h) => { h[1].debuffed = true; });
  eq(brief(out.r), [['hand', null, 10, 2], ['ink', 7, 17, 2], ['ink', 7, 24, 2], ['ink', 2, 26, 2], ['total', 52, 26, 2]]);
  assert.strictEqual(out.r.events[3].cardUid, out.held[0].uid);
});
test('say/stamps events carry their keepsake as src; real Diary says Upgraded!', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  MA.run.debug.giveKeepsake(s, 't_grow');
  s.stamps = 10;
  const out = scoreCodes(MA, s, PAIR);
  const ev = out.r.events.find(e => e.t === 'stamps');
  assert.strictEqual(ev.amount, 2); assert.strictEqual(ev.src.kind, 'keepsake'); assert.strictEqual(ev.src.uid, s.keepsakes[0].uid);
  assert.strictEqual(s.stamps, 12); assert.strictEqual(out.r.stamps, 2);
  if (MA.content.keepsakes.diary) {
    const s2 = MA.run.newRun(1); MA.run.debug.giveKeepsake(s2, 'diary');
    const o2 = scoreCodes(MA, s2, PAIR);
    const say = o2.r.events.find(e => e.t === 'say');
    assert.ok(say && say.text === 'Upgraded!' && say.src.kind === 'keepsake' && say.src.uid === s2.keepsakes[0].uid);
    assert.strictEqual(s2.keepsakes[0].data.glow, 1);
  }
});
test('preview mode: no RNG advance, no data mutation, no stamps', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  MA.run.debug.giveKeepsake(s, 't_grow'); s.stamps = 10;
  const rng0 = s.rng.s, snap = JSON.stringify(s);
  const r = MA.scoring.score(s, cardsFrom(MA, s, PAIR), [], { preview: true });
  assert.ok(r.light > 0);
  assert.strictEqual(s.rng.s, rng0); assert.strictEqual(s.stamps, 10); assert.strictEqual(s.keepsakes[0].data.n, 0);
  assert.strictEqual(JSON.stringify(s).replace(/"nextUid":\d+/, ''), snap.replace(/"nextUid":\d+/, ''));
  MA.scoring.score(s, cardsFrom(MA, s, PAIR), [], {});
  assert.strictEqual(s.keepsakes[0].data.n, 1); assert.strictEqual(s.stamps, 12);
});
test('isFinalSend is true exactly on the last Send (sendsLeft decremented before scoring)', () => {
  const MA = ctx(), s = begin(MA, { give: ['t_final'] });
  setHand(MA, s, PAIR);
  MA.run.send(s, uidsOf(MA.run.handCards(s).slice(0, 5)));
  assert.strictEqual(MA.__final, false);
  s.sendsLeft = 1;
  MA.run.drawToFull(s);
  MA.run.send(s, uidsOf(MA.run.handCards(s).slice(0, 1)));
  assert.strictEqual(MA.__final, true);
});
test('real keepsakes: Black Cat (+4 Glow) and Night Owl (x2 on final Send) integrate', () => {
  const MA = ctx();
  if (!MA.content.keepsakes.black_cat || !MA.content.keepsakes.night_owl) return;
  const s = begin(MA, { give: ['black_cat', 'night_owl'] });
  setHand(MA, s, PAIR); s.sendsLeft = 1;
  const r = MA.run.send(s, uidsOf(MA.run.handCards(s).slice(0, 5))).result;
  assert.strictEqual(r.glow, (2 + 4) * 2); assert.strictEqual(r.light, 24 * 12);
});

/* ======================================================================== blinds / economy */
section('blinds and economy');
test('blindInfo: targets, rewards, kinds for every night', () => {
  const MA = ctx(), s = MA.run.newRun(9);
  const BASE = [300, 800, 2000, 5000, 11000, 20000, 35000, 50000];
  for (let n = 1; n <= 8; n++) {
    s.ante = n;
    const d = MA.run.blindInfo(s, 0), m = MA.run.blindInfo(s, 1), b = MA.run.blindInfo(s, 2);
    assert.strictEqual(d.target, BASE[n - 1]); assert.strictEqual(m.target, BASE[n - 1] * 1.5);
    assert.strictEqual(b.target, BASE[n - 1] * (n === 8 ? 2.5 : 2));
    eq([d.kind, m.kind, b.kind], ['dusk', 'midnight', 'boss']);
    eq([d.reward, m.reward, b.reward], [3, 4, 5]);
    eq([d.canSkip, m.canSkip, b.canSkip], [true, true, false]);
    eq([d.name, m.name], ['Dusk', 'Midnight']);
    assert.strictEqual(b.boss.id, s.bosses[n - 1]); assert.strictEqual(b.name, b.boss.name);
  }
  assert.strictEqual(s.bosses[7], 'daybreak');
});
test('visitors: 7 distinct, minAnte respected, Night 8 is Daybreak, seeded', () => {
  const MA = ctx();
  const seen = {};
  for (let seed = 1; seed <= 200; seed++) {
    const s = MA.run.newRun(seed);
    assert.strictEqual(s.bosses.length, 8);
    assert.strictEqual(new Set(s.bosses.slice(0, 7)).size, 7);
    assert.strictEqual(s.bosses[7], 'daybreak');
    s.bosses.slice(0, 7).forEach((id, i) => {
      assert.ok(MA.content.bosses[id].minAnte <= i + 1, id + ' on night ' + (i + 1));
      assert.ok(!MA.content.bosses[id].finale);
      seen[id] = true;
    });
    eq(MA.run.newRun(seed).bosses, s.bosses);
  }
  assert.strictEqual(Object.keys(seen).length, 10, 'every non-finale visitor shows up');
  assert.notDeepStrictEqual(JSON.stringify(MA.run.newRun(1).bosses), JSON.stringify(MA.run.newRun(2).bosses));
});
test('visitor table matches the design', () => {
  const B = base.MA.content.bosses;
  eq(Object.keys(B).sort(), ['daybreak', 'the_clock', 'the_clouds', 'the_dog', 'the_draft', 'the_fog', 'the_frost', 'the_hush', 'the_owl', 'the_rain', 'the_wind']);
  const minAnte = { the_rain: 1, the_frost: 1, the_clouds: 1, the_owl: 1, the_fog: 2, the_wind: 2, the_draft: 2, the_dog: 3, the_clock: 3, the_hush: 4 };
  Object.keys(minAnte).forEach(id => { assert.strictEqual(B[id].minAnte, minAnte[id], id); assert.strictEqual(B[id].targetMult, 2); assert.strictEqual(B[id].finale, false); });
  assert.strictEqual(B.daybreak.finale, true); assert.strictEqual(B.daybreak.targetMult, 2.5); assert.strictEqual(B.daybreak.hidesMoon, true);
  assert.strictEqual(B.the_clouds.hidesMoon, true);
  Object.keys(B).forEach(id => {
    assert.ok(B[id].name && B[id].text && B[id].flavor, id + ' has name/text/flavor');
    assert.ok(!/—/.test(B[id].flavor), 'no em-dash in ' + id);
  });
});
test('constellations: 12, texts agree with hand INFO, secret flag mirrors the hand', () => {
  const MA = base.MA, Cn = MA.content.constellations;
  eq(Object.keys(Cn).sort(), ['comet', 'firefly', 'gemini', 'lantern', 'little_house', 'milky_way', 'orions_belt', 'pleiades', 'polaris', 'southern_cross', 'teapot', 'twin_kites']);
  Object.keys(Cn).forEach(id => {
    const c = Cn[id], inf = MA.hands.INFO[c.hand];
    assert.strictEqual(c.secret, inf.secret, id);
    assert.strictEqual(c.text, 'Level up {hand|' + inf.name + '}: {ink|+' + inf.dInk + ' Ink} and {glow|+' + inf.dGlow + ' Glow}', id);
  });
  assert.strictEqual(Cn.gemini.text, 'Level up {hand|Pen Pals}: {ink|+15 Ink} and {glow|+1 Glow}');
});

test('cash-out lines: reward + unused Sends + interest', () => {
  const MA = ctx(), s = begin(MA);
  const co = winNow(MA, s);                          // Dusk, 4 stamps -> no interest, 3 Sends unused
  eq(co.lines, [{ label: 'Dusk cleared', amount: 3 }, { label: 'Unused Sends (3)', amount: 3 }]);
  assert.strictEqual(co.total, 6); assert.strictEqual(s.phase, 'cashout');
  assert.strictEqual(s.stamps, 4, 'nothing paid before collect');
  MA.run.collect(s);
  assert.strictEqual(s.stamps, 10); assert.strictEqual(s.phase, 'shop');
});
test('cash-out reward by blind kind and Visitor stats', () => {
  const MA = ctx();
  [[0, 3], [1, 4], [2, 5]].forEach(([idx, reward]) => {
    const s = begin(MA, { blindIndex: idx });
    const co = winNow(MA, s);
    assert.strictEqual(co.lines[0].amount, reward);
    assert.strictEqual(s.stats.bossesBeaten, idx === 2 ? 1 : 0);
    if (idx === 2) assert.ok(/sent away/.test(co.lines[0].label));
  });
});
test('interest: +1 per 5 stamps held before rewards, capped at +5', () => {
  const MA = ctx();
  [[0, 0], [4, 0], [5, 1], [9, 1], [10, 2], [24, 4], [25, 5], [26, 5], [100, 5]].forEach(([stamps, interest]) => {
    const s = begin(MA); MA.run.debug.setStamps(s, stamps);
    const co = winNow(MA, s);
    const line = co.lines.find(l => l.label === 'Interest');
    assert.strictEqual(line ? line.amount : 0, interest, 'stamps ' + stamps);
  });
});
test('cash-out: keepsake onBlindEnd lines (zero hidden), Wax Seals held (debuffed ones do not pay)', () => {
  const MA = ctx(), s = begin(MA, { give: ['t_end', 't_zero'] });
  const live = MA.run.handCards(s);
  live[0].sticker = 'wax'; live[1].sticker = 'wax'; live[2].sticker = 'wax'; live[2].debuffed = true;
  s.target = 1;
  MA.run.send(s, [s.hand[s.hand.length - 1]]);
  const co = MA.run.cashOut(s);
  assert.ok(co.lines.some(l => l.label === 't_end' && l.amount === 2));
  assert.ok(!co.lines.some(l => l.label === 't_zero'));
  eq(co.lines.filter(l => /Wax/.test(l.label)), [{ label: 'Wax Seal x2', amount: 6 }]);
  eq(co.lines.reduce((a, l) => a + l.amount, 0), co.total);
});
test('real Tin Piggy Bank / Paper Sun cash-out lines', () => {
  const MA = ctx();
  if (!MA.content.keepsakes.tin_bank || !MA.content.keepsakes.paper_sun) return;
  const s = begin(MA, { give: ['tin_bank', 'paper_sun'] });
  const co = winNow(MA, s);
  assert.ok(co.lines.some(l => l.label === 'Tin Piggy Bank' && l.amount === 3));
  assert.ok(!co.lines.some(l => l.label === 'The Paper Sun'), 'paper sun pays no stamps');
  const s2 = begin(MA, { give: ['paper_sun'], blindIndex: 2 });
  winNow(MA, s2);
  assert.strictEqual(s2.keepsakes[0].data.x, 1.75, 'Paper Sun grows after a Visitor');
});
test('cashOut/collect are guarded against wrong phases and double calls', () => {
  const MA = ctx(), s = begin(MA);
  assert.strictEqual(MA.run.cashOut(s), null, 'blind not won');
  assert.strictEqual(MA.run.collect(s).ok, false);
  const co = winNow(MA, s);
  assert.strictEqual(MA.run.cashOut(s), co, 'second cashOut returns the same object');
  assert.strictEqual(MA.run.collect(s).ok, true);
  assert.strictEqual(MA.run.collect(s).ok, false);
  assert.strictEqual(s.stamps, 4 + 6);
});
test('shop: 2 items + 2 packs on collect, reroll cost 5 -> 6 -> 7, resets each visit, sells reset', () => {
  const MA = ctx(), s = begin(MA);
  MA.run.debug.setStamps(s, 100);
  winNow(MA, s); MA.run.collect(s);
  const before = s.stamps;
  assert.strictEqual(s.shop.items.length, 2); assert.strictEqual(s.shop.packs.length, 2); assert.strictEqual(s.shop.rerollCost, 5);
  eq([MA.run.reroll(s).cost, MA.run.reroll(s).cost, MA.run.reroll(s).cost], [5, 6, 7]);
  assert.strictEqual(s.shop.rerollCost, 8); assert.strictEqual(s.stamps, before - 18);
  assert.strictEqual(s.shop.items.length, 2); s.shop.items.forEach(i => assert.strictEqual(i.sold, false));
  MA.run.debug.setStamps(s, 7);
  assert.strictEqual(MA.run.reroll(s).ok, false, 'cannot afford 8'); assert.strictEqual(s.stamps, 7);
  MA.run.leaveShop(s);
  toShop(MA, s);
  assert.strictEqual(s.shop.rerollCost, 5);
});
test('sell values: keepsakes floor(cost/2) min 1, consumables 1', () => {
  const MA = ctx();
  MA.content.keepsakes.t_c5 = { id: 't_c5', name: 'c5', rarity: 'common', cost: 5, text: '', init: () => ({}) };
  MA.content.keepsakes.t_c7 = { id: 't_c7', name: 'c7', rarity: 'common', cost: 7, text: '', init: () => ({}) };
  const s = MA.run.newRun(1); MA.run.debug.setStamps(s, 0);
  const got = {};
  ['t_cheap', 't_c5', 't_c7', 't_dear'].forEach(id => { const k = MA.run.debug.giveKeepsake(s, id); got[id] = MA.run.sellValue(s, k.uid); });
  eq(got, { t_cheap: 1, t_c5: 2, t_c7: 3, t_dear: 4 });
  const k = s.keepsakes.find(x => x.id === 't_dear');
  const r = MA.run.sell(s, k.uid);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.amount, 4); assert.strictEqual(s.stamps, 4);
  assert.ok(!s.keepsakes.some(x => x.id === 't_dear'));
  const c = MA.run.debug.giveConsumable(s, 'letter', 'fold');
  assert.strictEqual(MA.run.sell(s, c.uid).amount, 1); assert.strictEqual(s.stamps, 5);
  assert.strictEqual(MA.run.sell(s, 'nope').ok, false);
});
test('buy: price, slots, sold flag, affordability', () => {
  const MA = ctx(), s = toShop(MA, begin(MA));
  s.shop.items = [{ kind: 'keepsake', id: 't_glow4', price: 4, sold: false }, { kind: 'letter', id: 'fold', price: 3, sold: false }];
  MA.run.debug.setStamps(s, 5);
  let r = MA.run.buy(s, 0);
  assert.strictEqual(r.ok, true); assert.strictEqual(s.stamps, 1);
  assert.strictEqual(s.keepsakes.length, 1); assert.strictEqual(s.keepsakes[0].id, 't_glow4'); assert.ok(s.keepsakes[0].uid);
  assert.strictEqual(MA.run.buy(s, 0).ok, false, 'already sold');
  assert.strictEqual(MA.run.buy(s, 1).ok, false, 'cannot afford');
  MA.run.debug.setStamps(s, 10);
  r = MA.run.buy(s, 1);
  assert.strictEqual(r.ok, true); eq(s.consumables.map(c => [c.kind, c.id]), [['letter', 'fold']]);
  assert.strictEqual(MA.run.buy(s, 5).ok, false);
  // full slots
  s.shop.items = [{ kind: 'letter', id: 'fold', price: 3, sold: false }, { kind: 'constellation', id: 'gemini', price: 3, sold: false }];
  MA.run.buy(s, 0);
  assert.strictEqual(MA.run.buy(s, 1).ok, false, '2 consumable slots');
  assert.strictEqual(s.stamps, 10 - 3 - 3);
  s.shop.items = [{ kind: 'keepsake', id: 't_kite', price: 1, sold: false }];
  for (let i = 0; i < 4; i++) MA.run.debug.giveKeepsake(s, 't_cheap');
  assert.strictEqual(s.keepsakes.length, 5);
  assert.strictEqual(MA.run.buy(s, 0).ok, false, '5 keepsake slots');
});
test('packs: buy, choose (constellation applies at once), letter/keepsake slot checks, skip', () => {
  const MA = ctx(), s = toShop(MA, begin(MA));
  MA.run.debug.setStamps(s, 100);
  s.shop.packs = [{ kind: 'starchart', price: 4, sold: false }, { kind: 'envelope', price: 4, sold: false }, { kind: 'keepsakebox', price: 6, sold: false }];
  MA.run.debug.giveKeepsake(s, 't_letter_seen');
  let r = MA.run.buyPack(s, 0);
  assert.strictEqual(r.ok, true); assert.strictEqual(s.stamps, 96); assert.strictEqual(s.shop.packs[0].sold, true);
  assert.strictEqual(s.pack.kind, 'starchart'); assert.strictEqual(s.pack.source, 'shop'); assert.strictEqual(s.pack.choices.length, 3);
  assert.strictEqual(new Set(s.pack.choices.map(c => c.id)).size, 3);
  s.pack.choices.forEach(c => assert.strictEqual(c.kind, 'constellation'));
  assert.strictEqual(MA.run.buyPack(s, 1).ok, false, 'a pack is open');
  assert.strictEqual(MA.run.buy(s, 0).ok, false, 'a pack is open');
  const pick = s.pack.choices[1], hand = MA.content.constellations[pick.id].hand;
  r = MA.run.choosePack(s, 1);
  assert.strictEqual(r.ok, true); assert.strictEqual(s.pack, null);
  assert.strictEqual(s.handLevels[hand].level, 2); assert.strictEqual(s.stats.constellationsUsed, 1);
  assert.ok(s.keepsakes[0].data.seen.indexOf('c:' + pick.id) >= 0, 'onConstellationUsed fired for a pack pick');
  assert.strictEqual(MA.run.choosePack(s, 0).ok, false, 'no pack open');
  // envelope: 3 letters, need a free slot
  MA.run.buyPack(s, 1);
  assert.strictEqual(s.pack.kind, 'envelope'); assert.strictEqual(s.pack.choices.length, 3);
  s.pack.choices.forEach(c => assert.strictEqual(c.kind, 'letter'));
  assert.strictEqual(new Set(s.pack.choices.map(c => c.id)).size, 3);
  MA.run.debug.giveConsumable(s, 'letter', 'fold'); MA.run.debug.giveConsumable(s, 'letter', 'fold');
  assert.strictEqual(MA.run.choosePack(s, 0).ok, false); assert.ok(s.pack, 'pack stays open when there is no room');
  const sold = MA.run.sell(s, s.consumables[0].uid);
  assert.strictEqual(sold.ok, true);
  assert.strictEqual(MA.run.choosePack(s, 0).ok, true); assert.strictEqual(s.consumables.length, 2);
  // keepsake box: 2 keepsakes, need room, skippable
  MA.run.buyPack(s, 2);
  assert.strictEqual(s.pack.kind, 'keepsakebox'); assert.strictEqual(s.pack.choices.length, 2);
  s.pack.choices.forEach(c => assert.strictEqual(c.kind, 'keepsake'));
  assert.notStrictEqual(s.pack.choices[0].id, s.pack.choices[1].id);
  const n = s.keepsakes.length;
  assert.strictEqual(MA.run.skipPack(s).ok, true); assert.strictEqual(s.pack, null); assert.strictEqual(s.keepsakes.length, n);
  assert.strictEqual(MA.run.skipPack(s).ok, false);
  MA.run.debug.setStamps(s, 3);
  s.shop.packs[2].sold = false;
  assert.strictEqual(MA.run.buyPack(s, 2).ok, false, 'cannot afford 6');
});
test('leaving the shop with a pack open discards it and advances the blind', () => {
  const MA = ctx(), s = toShop(MA, begin(MA));
  MA.run.debug.setStamps(s, 20);
  MA.run.buyPack(s, 0);
  assert.ok(s.pack);
  MA.run.leaveShop(s);
  assert.strictEqual(s.pack, null); assert.strictEqual(s.phase, 'blindSelect'); assert.strictEqual(s.blindIndex, 1); assert.strictEqual(s.shop, null);
});
test('skipBlind: only Dusk/Midnight, free envelope or star chart (source skip), advances the blind', () => {
  const MA = ctx(), s = MA.run.newRun(4);
  const p = MA.run.skipBlind(s);
  assert.ok(p && (p.kind === 'envelope' || p.kind === 'starchart')); assert.strictEqual(p.source, 'skip');
  assert.strictEqual(p.choices.length, 3); assert.strictEqual(s.blindIndex, 1); assert.strictEqual(s.phase, 'blindSelect');
  assert.strictEqual(s.stamps, 4, 'free');
  assert.strictEqual(MA.run.startBlind(s).ok, false, 'must resolve the pack first');
  assert.strictEqual(MA.run.skipBlind(s), null, 'pack already open');
  MA.run.skipPack(s);
  assert.ok(MA.run.skipBlind(s)); assert.strictEqual(s.blindIndex, 2);
  MA.run.skipPack(s);
  assert.strictEqual(MA.run.skipBlind(s), null, 'Visitors cannot be skipped');
  assert.strictEqual(s.blindIndex, 2); assert.strictEqual(s.stats.blindsSkipped, 2);
  assert.strictEqual(MA.run.startBlind(s).ok, true);
});
test('shop rolls: 70/15/15 item split, 70/25/5 rarity, never owned or duplicated, secrets hidden', () => {
  const MA = load().MA;                               // real content only (no test doubles)
  const s = MA.run.newRun(42);
  const kinds = { keepsake: 0, constellation: 0, letter: 0 }, rar = { common: 0, uncommon: 0, rare: 0 };
  const K = MA.content.keepsakes, N = 2500;
  for (let i = 0; i < N; i++) {
    s.phase = 'cashout'; s.cashout = { lines: [], total: 0 }; s.blindIndex = 0;
    MA.run.collect(s);
    s.shop.items.forEach(it => {
      kinds[it.kind]++;
      if (it.kind === 'keepsake') rar[K[it.id].rarity]++;
      if (it.kind === 'constellation') assert.ok(!MA.content.constellations[it.id].secret, 'secret constellation offered before its hand was sent');
      assert.strictEqual(it.price, it.kind === 'keepsake' ? K[it.id].cost : 3);
    });
    const ks = s.shop.items.filter(x => x.kind === 'keepsake').map(x => x.id);
    assert.strictEqual(new Set(ks).size, ks.length, 'no duplicate keepsake on the shelf');
  }
  const total = kinds.keepsake + kinds.constellation + kinds.letter, kt = rar.common + rar.uncommon + rar.rare;
  assert.ok(Math.abs(kinds.keepsake / total - 0.70) < 0.03, 'keepsake share ' + kinds.keepsake / total);
  assert.ok(Math.abs(kinds.constellation / total - 0.15) < 0.03, 'constellation share');
  assert.ok(Math.abs(kinds.letter / total - 0.15) < 0.03, 'letter share');
  assert.ok(Math.abs(rar.common / kt - 0.70) < 0.04, 'common ' + rar.common / kt);
  assert.ok(Math.abs(rar.uncommon / kt - 0.25) < 0.04, 'uncommon ' + rar.uncommon / kt);
  assert.ok(Math.abs(rar.rare / kt - 0.05) < 0.025, 'rare ' + rar.rare / kt);
  // owned keepsakes are never offered
  const ids = Object.keys(K);
  for (let i = 0; i < 300; i++) {
    const st = MA.run.newRun(1000 + i);
    for (let j = 0; j < 4; j++) MA.run.debug.giveKeepsake(st, ids[(i * 7 + j * 5) % ids.length]);
    const owned = st.keepsakes.map(k => k.id);
    st.phase = 'cashout'; st.cashout = { lines: [], total: 0 };
    MA.run.collect(st);
    st.shop.items.forEach(it => { if (it.kind === 'keepsake') assert.ok(owned.indexOf(it.id) === -1, 'offered an owned keepsake'); });
  }
});
test('shop: exhausted rarity falls back to any unowned keepsake; none left falls back to other items', () => {
  const MA = load().MA, K = MA.content.keepsakes, ids = Object.keys(K);
  const commons = ids.filter(id => K[id].rarity === 'common');
  const s = MA.run.newRun(5);
  commons.forEach(id => MA.run.debug.giveKeepsake(s, id));           // no commons left, but 70% of rolls ask for one
  let seenKeepsakes = 0;
  for (let i = 0; i < 200; i++) {
    s.phase = 'cashout'; s.cashout = { lines: [], total: 0 }; MA.run.collect(s);
    s.shop.items.forEach(it => { if (it.kind === 'keepsake') { seenKeepsakes++; assert.notStrictEqual(K[it.id].rarity, 'common'); } });
    assert.strictEqual(s.shop.items.length, 2);
  }
  assert.ok(seenKeepsakes > 200, 'still offers uncommon/rare keepsakes: ' + seenKeepsakes);
  ids.forEach(id => { if (!s.keepsakes.some(k => k.id === id)) MA.run.debug.giveKeepsake(s, id); });   // own everything
  for (let i = 0; i < 100; i++) {
    s.phase = 'cashout'; s.cashout = { lines: [], total: 0 }; MA.run.collect(s);
    assert.strictEqual(s.shop.items.length, 2);
    s.shop.items.forEach(it => assert.notStrictEqual(it.kind, 'keepsake'));
  }
});
test('secret constellations appear once that hand type has been sent', () => {
  const MA = load().MA;
  const s = MA.run.newRun(6); let sawBefore = false, sawAfter = false;
  const scan = () => {
    let saw = false;
    for (let i = 0; i < 400; i++) {
      s.phase = 'cashout'; s.cashout = { lines: [], total: 0 }; MA.run.collect(s);
      s.shop.items.forEach(it => { if (it.id === 'pleiades') saw = true; });
      MA.run.debug.setStamps(s, 100); MA.run.buyPack(s, 0); if (s.pack) { s.pack.choices.forEach(c => { if (c.id === 'pleiades') saw = true; }); s.pack = null; }
    }
    return saw;
  };
  sawBefore = scan(); assert.strictEqual(sawBefore, false);
  s.handLevels.five.sent = 1;
  sawAfter = scan(); assert.strictEqual(sawAfter, true);
});

/* ======================================================================== playing */
section('playing a blind');
test('startBlind: piles, limits from passives, draw to hand size, phase', () => {
  const MA = ctx(), s = MA.run.newRun(3);
  const r = MA.run.startBlind(s);
  assert.strictEqual(s.phase, 'playing'); assert.strictEqual(r.drawn.length, 8);
  eq(r.drawn, s.hand);
  assert.strictEqual(s.drawPile.length, 44); assert.strictEqual(s.played.length, 0); assert.strictEqual(s.discardPile.length, 0);
  eq([s.handSize, s.maxSends, s.maxCrumples, s.sendsLeft, s.crumplesLeft, s.roundScore, s.target], [8, 4, 3, 4, 3, 0, 300]);
  conserved(MA, s);
  assert.strictEqual(MA.run.startBlind(s).ok, false, 'already playing');
});
test('startBlind: keepsake passives (sends, hand size, crumples) and boss setup (Owl, Draft)', () => {
  const MA = ctx();
  let s = begin(MA, { give: ['t_sends', 't_hand', 't_crumples'] });
  eq([s.handSize, s.maxSends, s.maxCrumples, s.hand.length], [10, 5, 4, 10]);
  s = begin(MA, { boss: 'the_draft' }); eq([s.handSize, s.hand.length], [7, 7]);
  s = begin(MA, { boss: 'the_draft', give: ['t_hand'] }); eq([s.handSize, s.hand.length], [9, 9]);
  s = begin(MA, { boss: 'the_owl' });
  eq([s.crumplesLeft, s.maxCrumples], [0, 0]);
  const r = MA.run.crumple(s, [s.hand[0]]);
  assert.strictEqual(r.ok, false); assert.ok(r.reason);
  s = begin(MA, { boss: 'the_owl', give: ['t_crumples'] }); assert.strictEqual(s.crumplesLeft, 0, 'Owl overrides passives');
});
test('startBlind fires onBlindStart; deck is reshuffled from every deck card each blind', () => {
  const MA = ctx(), s = begin(MA, { give: ['t_letter_seen'] });
  assert.strictEqual(s.keepsakes[0].data.seen[0], 'start');
  const first = s.hand.slice();
  winNow(MA, s); MA.run.collect(s); MA.run.leaveShop(s); MA.run.startBlind(s);
  assert.strictEqual(s.drawPile.length + s.hand.length, 52); assert.strictEqual(s.discardPile.length, 0);
  assert.notDeepStrictEqual(JSON.stringify(first), JSON.stringify(s.hand));
});
test('send: cards go hand -> played -> discard, nothing drawn, stats recorded, validation', () => {
  const MA = ctx(), s = begin(MA);
  const cards = setHand(MA, s, PAIR), uids = uidsOf(cards);
  const handBefore = s.hand.length;
  const r = MA.run.send(s, uids);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.outcome, 'continue'); eq(r.blownAway, []);
  assert.strictEqual(r.result.handType, 'pair'); assert.strictEqual(r.result.light, 48);
  eq(r.played, uids);
  assert.strictEqual(s.hand.length, handBefore - 5); assert.strictEqual(s.played.length, 0); assert.strictEqual(s.discardPile.length, 5);
  uids.forEach(u => assert.ok(s.discardPile.indexOf(u) >= 0 && s.hand.indexOf(u) === -1));
  assert.strictEqual(s.sendsLeft, 3); assert.strictEqual(s.roundScore, 48);
  eq([s.stats.handsSent, s.stats.bestLight, s.handLevels.pair.sent], [1, 48, 1]);
  eq(s.sentThisBlind, ['pair']); assert.strictEqual(s.lastResult, r.result);
  conserved(MA, s);
  const drawn = MA.run.drawToFull(s);
  assert.strictEqual(drawn.length, 5); assert.strictEqual(s.hand.length, 8);
  conserved(MA, s);
  // invalid inputs never throw
  const bad = [[], null, undefined, 'x', ['nope'], [s.hand[0], s.hand[0]], s.hand.slice(0, 6), uids];
  bad.forEach(b => { const x = MA.run.send(s, b); assert.strictEqual(x.ok, false, JSON.stringify(b)); assert.ok(x.reason); });
  assert.strictEqual(s.sendsLeft, 3, 'failed sends cost nothing');
});
test('send scores in hand order regardless of selection order', () => {
  const MA = ctx(), s = begin(MA);
  const c = setHand(MA, s, ['9s', '9m', '2b', '4l', '6s']);
  const r = MA.run.send(s, [c[1].uid, c[0].uid]);
  eq(r.played, [c[0].uid, c[1].uid]);
});
test('won: stays in playing until cashOut, further sends are refused', () => {
  const MA = ctx(), s = begin(MA); s.target = 40;
  setHand(MA, s, PAIR);
  const r = MA.run.send(s, uidsOf(MA.run.handCards(s).slice(0, 5)));
  assert.strictEqual(r.outcome, 'won'); assert.strictEqual(s.phase, 'playing'); assert.strictEqual(s.blindWon, true);
  assert.strictEqual(MA.run.send(s, [s.hand[0]]).ok, false);
  assert.strictEqual(MA.run.crumple(s, [s.hand[0]]).ok, false);
  eq(MA.run.drawToFull(s), []);
  MA.run.cashOut(s); assert.strictEqual(s.phase, 'cashout');
});
test('lost: 0 Sends below target -> gameover; Rooftop Cat double saves per its rule', () => {
  const MA = ctx();
  let s = begin(MA), last;
  for (let i = 0; i < 4; i++) { last = MA.run.send(s, [s.hand[0]]); if (i < 3) { assert.strictEqual(last.outcome, 'continue'); MA.run.drawToFull(s); } }
  assert.strictEqual(last.outcome, 'lost'); assert.strictEqual(s.phase, 'gameover');
  assert.strictEqual(MA.run.send(s, [s.hand[0]]).ok, false);
  // test double that always saves
  s = begin(MA, { give: ['t_saver'] }); s.sendsLeft = 1;
  const k = s.keepsakes[0].uid;
  last = MA.run.send(s, [s.hand[0]]);
  assert.strictEqual(last.outcome, 'saved'); assert.strictEqual(last.savedBy, k);
  assert.strictEqual(s.keepsakes.length, 0, 'the saver leaves'); assert.strictEqual(s.phase, 'playing');
  assert.ok(MA.run.cashOut(s)); assert.strictEqual(s.phase, 'cashout');
  if (MA.content.keepsakes.rooftop_cat) {
    s = begin(MA, { give: ['rooftop_cat'] }); s.sendsLeft = 1; s.target = 1e6;     // 25% not reached
    assert.strictEqual(MA.run.send(s, [s.hand[0]]).outcome, 'lost');
    s = begin(MA, { give: ['rooftop_cat'] }); s.sendsLeft = 1; s.target = 20;      // any send reaches 25% of 20, but not 20 (single low card)
    setHand(MA, s, ['2s']);
    const o = MA.run.send(s, [s.hand[0]]);
    assert.strictEqual(o.outcome, 'saved');
  }
});
test('crumple: cards to discard pile, counters, onDiscard hook, never draws; guards', () => {
  const MA = ctx(), s = begin(MA, { give: ['t_letter_seen'] });
  const pick = s.hand.slice(0, 3);
  const r = MA.run.crumple(s, pick);
  assert.strictEqual(r.ok, true); eq(r.uids, pick);
  assert.strictEqual(s.crumplesLeft, 2); assert.strictEqual(s.hand.length, 5); assert.strictEqual(s.discardPile.length, 3);
  assert.strictEqual(s.stats.cardsCrumpled, 3); assert.ok(s.keepsakes[0].data.seen.indexOf('d:3') >= 0);
  conserved(MA, s);
  eq(MA.run.drawToFull(s).length, 3);
  [[], ['zzz'], s.hand.slice(0, 6)].forEach(b => assert.strictEqual(MA.run.crumple(s, b).ok, false));
  MA.run.crumple(s, [s.hand[0]]); MA.run.crumple(s, [s.hand[0]]);
  assert.strictEqual(s.crumplesLeft, 0);
  assert.strictEqual(MA.run.crumple(s, [s.hand[0]]).ok, false, 'no Crumples left');
});
test('crumple refuses to leave you with no cards at all', () => {
  const MA = ctx(), s = begin(MA);
  s.drawPile = []; s.discardPile = s.discardPile.concat();
  const all = s.hand.slice();
  s.hand = all.slice(0, 2); s.discardPile = all.slice(2).concat(s.discardPile);
  const r = MA.run.crumple(s, s.hand.slice());
  assert.strictEqual(r.ok, false);
  assert.strictEqual(MA.run.crumple(s, [s.hand[0]]).ok, true);
});
test('running out of cards ends the blind (lost)', () => {
  const MA = ctx(), s = begin(MA);
  const all = s.hand.concat(s.drawPile);
  s.hand = all.slice(0, 1); s.drawPile = []; s.discardPile = all.slice(1);
  const r = MA.run.send(s, s.hand.slice());
  assert.strictEqual(r.outcome, 'lost'); assert.strictEqual(s.phase, 'gameover');
});
test('moon: advances one phase per Send; Full Moon Send gets x2; Telescope waxes 2 but never skips Full', () => {
  const MA = ctx();
  let s = begin(MA); const seq = [], full = [];
  for (let i = 0; i < 6; i++) {
    s.sendsLeft = 4; setHand(MA, s, ['7s']);
    const r = MA.run.send(s, [s.hand[0]]); seq.push(s.moonPhase); full.push(r.result.fullMoon);
    assert.strictEqual(r.result.moonPhase, s.moonPhase);
    MA.run.drawToFull(s);
  }
  eq(seq, [1, 2, 3, 4, 0, 1]); eq(full, [false, false, false, false, true, false]);
  s = begin(MA, { give: ['t_tele'] }); const seq2 = [];
  for (let i = 0; i < 6; i++) { s.sendsLeft = 4; MA.run.send(s, [s.hand[0]]); seq2.push(s.moonPhase); MA.run.drawToFull(s); }
  eq(seq2, [2, 4, 1, 3, 4, 1]);
  // a hidden moon still advances
  s = begin(MA, { boss: 'the_clouds' }); MA.run.send(s, [s.hand[0]]); assert.strictEqual(s.moonPhase, 1);
});
test('moon: the ×2 fires on the Send made at Full and the event list ends xglow(moon) -> total', () => {
  const MA = ctx(), s = begin(MA);
  s.moonPhase = 4; setHand(MA, s, PAIR);
  const r = MA.run.send(s, uidsOf(MA.run.handCards(s).slice(0, 5))).result;
  const ev = r.events;
  assert.strictEqual(ev[ev.length - 2].t, 'xglow'); assert.strictEqual(ev[ev.length - 2].src.kind, 'moon');
  assert.strictEqual(ev[ev.length - 1].t, 'total'); assert.strictEqual(r.light, 96); assert.strictEqual(s.moonPhase, 0);
});
test('Visitor: The Rain / The Frost / The Clouds debuff their suit, flags cleared at collect', () => {
  const MA = ctx();
  [['the_rain', 'bloom'], ['the_frost', 'leaf'], ['the_clouds', 'star']].forEach(([boss, suit]) => {
    const s = begin(MA, { boss: boss });
    s.deck.forEach(c => assert.strictEqual(c.debuffed, c.suit === suit, boss + ' ' + c.suit));
    // a debuffed card in the played scoring set doesn't score
    const cs = setHand(MA, s, suit === 'star' ? ['7s', '7m'] : suit === 'bloom' ? ['7b', '7m'] : ['7l', '7m']);
    s.deck.forEach(c => { c.debuffed = !!MA.content.bosses[boss].isDebuffed(c, s); });   // setHand rewrote suits behind the engine's back
    const p = MA.run.preview(s, uidsOf(cs));
    assert.strictEqual(p.type, 'pair', 'debuffed cards still make the hand type');
    const r = MA.run.send(s, uidsOf(cs)).result;
    assert.strictEqual(r.debuffedUids.length, 1); assert.strictEqual(r.light, (10 + 7) * 2);
    winNow(MA, s); MA.run.collect(s);
    s.deck.forEach(c => { assert.strictEqual(c.debuffed, false); assert.strictEqual(c.faceDown, false); });
  });
});
test('Visitor: The Fog draws face cards face down; they turn face-up when sent', () => {
  const MA = ctx(), s = begin(MA, { boss: 'the_fog', seed: 11 });
  s.hand.forEach(u => { const c = MA.run.getCard(s, u); assert.strictEqual(c.faceDown, MA.cards.isFace(c)); });
  const faces = s.hand.filter(u => MA.cards.isFace(MA.run.getCard(s, u)));
  if (faces.length) { MA.run.send(s, [faces[0]]); assert.strictEqual(MA.run.getCard(s, faces[0]).faceDown, false); }
  MA.run.drawToFull(s);
  s.hand.forEach(u => { const c = MA.run.getCard(s, u); if (MA.cards.isFace(c)) assert.strictEqual(c.faceDown, true); });
  // a face-down card still scores
  const c = setHand(MA, s, ['Ks', 'Km']);
  c.forEach(x => { x.faceDown = true; });
  assert.strictEqual(MA.run.send(s, uidsOf(c)).result.light, (10 + 10 + 10) * 2);
});
test('Visitor: The Wind blows 2 cards from hand to discard after each Send', () => {
  const MA = ctx(), s = begin(MA, { boss: 'the_wind' });
  const r = MA.run.send(s, s.hand.slice(0, 2));
  assert.strictEqual(r.outcome, 'continue'); assert.strictEqual(r.blownAway.length, 2);
  r.blownAway.forEach(u => { assert.ok(s.discardPile.indexOf(u) >= 0); assert.strictEqual(s.hand.indexOf(u), -1); });
  assert.strictEqual(s.hand.length, 8 - 2 - 2); assert.strictEqual(s.discardPile.length, 4);
  conserved(MA, s);
  const w = begin(MA, { boss: 'the_wind' }); w.target = 1;
  eq(MA.run.send(w, [w.hand[0]]).blownAway, [], 'no wind once the blind is won');
});
test("Visitor: The Neighbour's Dog refuses a repeated hand type (friendly reason)", () => {
  const MA = ctx(), s = begin(MA, { boss: 'the_dog' });
  let c = setHand(MA, s, ['9s', '9m']);
  assert.strictEqual(MA.run.send(s, uidsOf(c)).ok, true);
  MA.run.drawToFull(s);
  c = setHand(MA, s, ['5s', '5m']);
  const p = MA.run.preview(s, uidsOf(c));
  assert.strictEqual(p.canPlay, "The Neighbour's Dog barks: you already sent Pen Pals tonight.");
  const r = MA.run.send(s, uidsOf(c));
  assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, "The Neighbour's Dog barks: you already sent Pen Pals tonight.");
  assert.strictEqual(s.sendsLeft, 3, 'refused send is free');
  c = setHand(MA, s, ['5s', '6m']);
  assert.strictEqual(MA.run.send(s, uidsOf(c)).ok, true, 'a different type is fine');
});
test('Visitor: The Dog never soft-locks (repeat allowed when nothing else is playable and no Crumples)', () => {
  const MA = ctx(), s = begin(MA, { boss: 'the_dog' });
  s.sentThisBlind = ['high']; s.crumplesLeft = 0;
  // no pair, no flush, no straight anywhere in the hand: every selection is a Lone Star
  setHand(MA, s, ['2s', '4m', '6b', '8l', 'Ks', 'Jm', '9m', '3b']);
  assert.strictEqual(MA.run.canSend(s, [s.hand[0]]), true, 'lenient when it would trap you');
  s.crumplesLeft = 3;
  assert.ok(typeof MA.run.canSend(s, [s.hand[0]]) === 'string', 'with Crumples left it refuses again');
  s.crumplesLeft = 0;
  setHand(MA, s, ['2s', '2m', '6b', '8l', 'Ks', 'Jm', '9m', '3b']);      // a pair is available, so repeating High is refused
  assert.ok(typeof MA.run.canSend(s, [s.hand[0], s.hand[2]]) === 'string');
});
test('Visitor: The Clock demands exactly 5 cards', () => {
  const MA = ctx(), s = begin(MA, { boss: 'the_clock' });
  assert.ok(/exactly 5/.test(MA.run.send(s, s.hand.slice(0, 4)).reason));
  assert.ok(/exactly 5/.test(MA.run.preview(s, s.hand.slice(0, 1)).canPlay));
  assert.strictEqual(MA.run.preview(s, s.hand.slice(0, 5)).canPlay, true);
  assert.strictEqual(MA.run.send(s, s.hand.slice(0, 5)).ok, true);
});
test('Visitor: The Hush halves base in preview and score', () => {
  const MA = ctx(), s = begin(MA, { boss: 'the_hush' });
  const c = setHand(MA, s, PAIR);
  const p = MA.run.preview(s, uidsOf(c.slice(0, 2)));
  eq([p.type, p.ink, p.glow], ['pair', 5, 1]);
  const r = MA.run.send(s, uidsOf(c.slice(0, 5))).result;
  assert.strictEqual(r.light, (5 + 14) * 1);
});
test('preview: values, contains, legality, no side effects', () => {
  const MA = ctx(), s = begin(MA);
  const c = setHand(MA, s, ['5s', '5m', '5b', '9l', 'Ks']);
  const snap = MA.run.serialize(s);
  const p = MA.run.preview(s, uidsOf(c.slice(0, 3)));
  eq([p.type, p.name, p.poker, p.level, p.ink, p.glow, p.canPlay], ['three', 'Three Wishes', 'Three of a Kind', 1, 30, 3, true]);
  eq(p.scoringUids, uidsOf(c.slice(0, 3)));
  assert.strictEqual(MA.run.serialize(s), snap, 'preview is pure');
  s.handLevels.three.level = 3;
  const p2 = MA.run.preview(s, uidsOf(c.slice(0, 3))); eq([p2.ink, p2.glow], [70, 7]);
  assert.strictEqual(MA.run.preview(s, []), null); assert.strictEqual(MA.run.preview(s, ['nope']), null);
  assert.strictEqual(MA.run.preview(s, s.hand.slice(0, 6)), null);
  s.sendsLeft = 0; assert.ok(typeof MA.run.preview(s, [s.hand[0]]).canPlay === 'string');
  // Kite String: 4-card straight previews as a Paper Chain
  const k = begin(MA, { give: ['t_kite'] });
  const kc = setHand(MA, k, ['3s', '4m', '5b', '6l']);
  eq(MA.run.preview(k, uidsOf(kc)).type, 'straight');
  const n = begin(MA); const nc = setHand(MA, n, ['3s', '4m', '5b', '6l']);
  eq(MA.run.preview(n, uidsOf(nc)).type, 'high');
});
test('sortHand by rank and suit', () => {
  const MA = ctx(), s = begin(MA);
  MA.run.sortHand(s, 'rank');
  const ranks = MA.run.handCards(s).map(c => c.rank);
  eq(ranks, ranks.slice().sort((a, b) => b - a));
  MA.run.sortHand(s, 'suit');
  const order = MA.cards.SUITS, cs = MA.run.handCards(s);
  for (let i = 1; i < cs.length; i++) assert.ok(order.indexOf(cs[i - 1].suit) <= order.indexOf(cs[i].suit));
  assert.strictEqual(s.hand.length, 8); conserved(MA, s);
});
test('remainingDeck lists the draw pile without revealing its order', () => {
  const MA = ctx(), s = begin(MA);
  const rd = MA.run.remainingDeck(s);
  assert.strictEqual(rd.length, 44); eq(new Set(rd.map(c => c.uid)).size, 44);
  const sorted = rd.map(c => c.suit + c.rank);
  assert.ok(rd.every((c, i) => i === 0 || MA.cards.SUITS.indexOf(rd[i - 1].suit) <= MA.cards.SUITS.indexOf(c.suit)));
});
test('moveKeepsake reorders; bad indices are refused', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  ['t_glow4', 't_clip', 't_music'].forEach(id => MA.run.debug.giveKeepsake(s, id));
  assert.strictEqual(MA.run.moveKeepsake(s, 0, 2).ok, true);
  eq(s.keepsakes.map(k => k.id), ['t_clip', 't_music', 't_glow4']);
  assert.strictEqual(MA.run.moveKeepsake(s, 5, 0).ok, false); assert.strictEqual(MA.run.moveKeepsake(s, 0, -1).ok, false);
  eq(s.keepsakes.map(k => k.id), ['t_clip', 't_music', 't_glow4']);
});
test('leaveShop advances Dusk -> Midnight -> Visitor -> next Night; Daybreak win -> victory', () => {
  const MA = ctx(), s = MA.run.newRun(2);
  const seen = [];
  for (let i = 0; i < 3; i++) { toShop(MA, s); MA.run.leaveShop(s); seen.push([s.ante, s.blindIndex, s.phase]); }
  eq(seen, [[1, 1, 'blindSelect'], [1, 2, 'blindSelect'], [2, 0, 'blindSelect']]);
  const v = MA.run.newRun(3); MA.run.debug.setAnte(v, 8); v.blindIndex = 2;
  MA.run.startBlind(v);
  assert.strictEqual(v.target, 125000); assert.strictEqual(v.bosses[7], 'daybreak');
  winNow(MA, v);
  const c = MA.run.collect(v);
  assert.strictEqual(v.phase, 'victory'); assert.strictEqual(c.phase, 'victory'); assert.strictEqual(v.shop, null);
  assert.strictEqual(v.stats.bossesBeaten, 1);
  assert.strictEqual(MA.run.leaveShop(v).ok, false);
});
test('serialize/deserialize round trip in every phase; bad input -> null', () => {
  const MA = ctx(), s = MA.run.newRun(31);
  const rt = st => { const a = MA.run.serialize(st), b = MA.run.serialize(MA.run.deserialize(a)); assert.strictEqual(a, b); return MA.run.deserialize(a); };
  rt(s);
  MA.run.debug.giveKeepsake(s, 't_grow'); MA.run.debug.giveConsumable(s, 'letter', 'fold');
  MA.run.startBlind(s); rt(s);
  MA.run.send(s, [s.hand[0]]); rt(s);
  const back = rt(s); MA.run.drawToFull(back); conserved(MA, back);
  s.target = 1; MA.run.send(s, [s.hand[0]]); MA.run.cashOut(s); rt(s);
  MA.run.collect(s); rt(s);
  MA.run.buyPack(s, 0); rt(s);
  ['', 'nope', '{}', '{"version":9}', 'null'].forEach(b => assert.strictEqual(MA.run.deserialize(b), null));
  // a restored run continues identically to the original
  const a = MA.run.newRun(55), b = MA.run.deserialize(MA.run.serialize(a));
  MA.run.startBlind(a); MA.run.startBlind(b);
  eq(a.hand, b.hand); eq(MA.run.send(a, [a.hand[0]]).result.events, MA.run.send(b, [b.hand[0]]).result.events);
});
test('determinism: same seed and inputs give identical runs', () => {
  const MA = ctx();
  const play = seed => {
    const s = MA.run.newRun(seed);
    for (let i = 0; i < 3; i++) { toShop(MA, s); MA.run.leaveShop(s); }
    return MA.run.serialize(s);
  };
  assert.strictEqual(play(8), play(8)); assert.notStrictEqual(play(8), play(9));
});

/* ======================================================================== letters and consumables */
section('letters, constellations and card conservation');
function give(MA, s, id) { return MA.run.debug.giveConsumable(s, 'letter', id); }
test('Fold: sums paper values (cap K, ace = 1), keeps left suit + sticker, destroys the right card', () => {
  const MA = ctx(), s = begin(MA);
  const [a, b] = setHand(MA, s, ['5s', '6m']); a.sticker = 'graph'; b.sticker = 'foil';
  const f = give(MA, s, 'fold');
  assert.strictEqual(MA.run.canUseConsumable(s, f.uid, [a.uid]) === true, false, 'needs 2 cards');
  const r = MA.run.useConsumable(s, f.uid, [b.uid, a.uid]);            // selection order should not matter (hand order is used)
  assert.strictEqual(r.ok, true); assert.ok(r.message);
  eq([a.rank, a.suit, a.sticker], [11, 'star', 'graph']);
  assert.strictEqual(MA.run.getCard(s, b.uid), null);
  assert.strictEqual(s.deck.length, 51); assert.strictEqual(s.hand.length, 7);
  assert.strictEqual(s.consumables.length, 0); assert.strictEqual(s.stats.lettersUsed, 1);
  conserved(MA, s);
  const [k, five] = setHand(MA, s, ['Kb', '5b']);
  MA.run.useConsumable(s, give(MA, s, 'fold').uid, uidsOf([k, five])); assert.strictEqual(k.rank, 13);
  const [ace, two] = setHand(MA, s, ['Al', '2l']);
  MA.run.useConsumable(s, give(MA, s, 'fold').uid, uidsOf([ace, two])); assert.strictEqual(ace.rank, 3);
  conserved(MA, s); assert.strictEqual(s.deck.length, 49);
});
test('Tear: halves the paper value, new card in hand AND deck, sticker stays on the first', () => {
  const MA = ctx(), s = begin(MA);
  const [c] = setHand(MA, s, ['Js']); c.sticker = 'graph';
  const hand0 = s.hand.length;
  const r = MA.run.useConsumable(s, give(MA, s, 'tear').uid, [c.uid]);
  assert.strictEqual(r.ok, true);
  eq([c.rank, c.sticker], [5, 'graph']);
  assert.strictEqual(s.deck.length, 53); assert.strictEqual(s.hand.length, hand0 + 1);
  const half = MA.run.getCard(s, s.hand[s.hand.length - 1]);
  eq([half.rank, half.suit, half.sticker], [6, 'star', null]);
  assert.ok(s.deck.indexOf(half) >= 0); assert.strictEqual(s.drawPile.indexOf(half.uid), -1);
  conserved(MA, s);
  const [ace] = setHand(MA, s, ['Ab']);
  assert.ok(typeof MA.run.canUseConsumable(s, give(MA, s, 'tear').uid, [ace.uid]) === 'string', 'Aces cannot be torn');
  assert.strictEqual(s.consumables.length, 1, 'refused use keeps the letter');
});
test('Eraser destroys for good; Carbon copies into hand and deck', () => {
  const MA = ctx(), s = begin(MA);
  const cs = setHand(MA, s, ['7s', '8m', '9b']); cs[0].sticker = 'foil';
  const er = give(MA, s, 'eraser');
  assert.strictEqual(MA.run.useConsumable(s, er.uid, uidsOf(cs.slice(1, 3))).ok, true);
  cs.slice(1, 3).forEach(c => { assert.strictEqual(MA.run.getCard(s, c.uid), null); assert.strictEqual(s.hand.indexOf(c.uid), -1); });
  assert.strictEqual(s.deck.length, 50); conserved(MA, s);
  const cb = give(MA, s, 'carbon');
  assert.strictEqual(MA.run.useConsumable(s, cb.uid, [cs[0].uid]).ok, true);
  const copy = MA.run.getCard(s, s.hand[s.hand.length - 1]);
  assert.notStrictEqual(copy.uid, cs[0].uid);
  eq([copy.rank, copy.suit, copy.sticker], [7, 'star', 'foil']);
  assert.strictEqual(s.deck.length, 51); conserved(MA, s);
  // destroyed cards never come back: play the whole blind out
  const gone = cs.slice(1, 3).map(c => c.uid);
  MA.run.debug.setStamps(s, 0); s.target = 1e9;
  for (let i = 0; i < 3; i++) { MA.run.send(s, [s.hand[0]]); MA.run.drawToFull(s); conserved(MA, s); }
  gone.forEach(u => assert.ok(![].concat(s.drawPile, s.hand, s.discardPile).includes(u)));
});
test('Carbon/Tear cards can push the hand over hand size until the next draw', () => {
  const MA = ctx(), s = begin(MA);
  MA.run.useConsumable(s, give(MA, s, 'carbon').uid, [s.hand[0]]);
  assert.strictEqual(s.hand.length, 9); eq(MA.run.drawToFull(s), []); assert.strictEqual(s.hand.length, 9);
});
test('Starlight Ink recolors 1-3 cards and re-evaluates debuffs immediately', () => {
  const MA = ctx(), s = begin(MA, { boss: 'the_rain' });
  const [c] = setHand(MA, s, ['5s']); c.debuffed = false;
  assert.strictEqual(MA.run.useConsumable(s, give(MA, s, 'ink_bloom').uid, [c.uid]).ok, true);
  assert.strictEqual(c.suit, 'bloom'); assert.strictEqual(c.debuffed, true, 'now a soaked Bloom');
  MA.run.useConsumable(s, give(MA, s, 'ink_star').uid, [c.uid]);
  assert.strictEqual(c.suit, 'star'); assert.strictEqual(c.debuffed, false);
  const ink = give(MA, s, 'ink_star');
  assert.ok(typeof MA.run.canUseConsumable(s, ink.uid, s.hand.slice(0, 4)) === 'string', 'max 3');
  assert.ok(typeof MA.run.canUseConsumable(s, ink.uid, []) === 'string', 'min 1');
  assert.ok(typeof MA.run.canUseConsumable(s, ink.uid, ['nope']) === 'string', 'must be in hand');
});
test('stickers and Sharpener via letters', () => {
  const MA = ctx(), s = begin(MA);
  const cs = setHand(MA, s, ['Ks', 'Al']);
  MA.run.useConsumable(s, give(MA, s, 'sticker_wax').uid, [cs[0].uid]); assert.strictEqual(cs[0].sticker, 'wax');
  MA.run.useConsumable(s, give(MA, s, 'sticker_graph').uid, [cs[0].uid, cs[1].uid]); eq([cs[0].sticker, cs[1].sticker], ['graph', 'graph']);
  MA.run.useConsumable(s, give(MA, s, 'sharpener').uid, uidsOf(cs)); eq([cs[0].rank, cs[1].rank], [14, 2]);
});
test('letters that need cards are refused outside a blind; 0-card letters work in the shop', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  const f = give(MA, s, 'fold');
  assert.ok(/hand/i.test(MA.run.canUseConsumable(s, f.uid, ['x', 'y'])));
  assert.strictEqual(MA.run.useConsumable(s, f.uid, []).ok, false);
  assert.strictEqual(s.consumables.length, 1);
  toShop(MA, s);
  const al = give(MA, s, 'allowance'); MA.run.debug.setStamps(s, 12);
  assert.strictEqual(MA.run.canUseConsumable(s, al.uid, []), true);
  assert.strictEqual(MA.run.useConsumable(s, al.uid, []).ok, true); assert.strictEqual(s.stamps, 24);
  MA.run.debug.setStamps(s, 30); MA.run.useConsumable(s, give(MA, s, 'allowance').uid, []); assert.strictEqual(s.stamps, 50, 'capped at +20');
  assert.ok(typeof MA.run.canUseConsumable(s, al.uid, []) === 'string', 'used up');
  assert.strictEqual(MA.run.useConsumable(s, 'nope', []).ok, false);
});
test('Wishing Star levels the most-sent hand (ties -> higher base; none sent -> Pen Pals)', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  MA.run.useConsumable(s, give(MA, s, 'wishing_star').uid, []); assert.strictEqual(s.handLevels.pair.level, 2);
  s.handLevels.high.sent = 3; s.handLevels.flush.sent = 3; s.handLevels.pair.sent = 1;
  MA.run.useConsumable(s, give(MA, s, 'wishing_star').uid, []);
  eq([s.handLevels.flush.level, s.handLevels.high.level], [2, 1], 'tie goes to the higher-base hand');
  s.handLevels.high.sent = 9;
  MA.run.useConsumable(s, give(MA, s, 'wishing_star').uid, []); assert.strictEqual(s.handLevels.high.level, 2);
});
test('constellations: level up the hand at once, fire hooks, secrets only via their hand', () => {
  const MA = ctx(), s = begin(MA, { give: ['t_letter_seen'] });
  const c = MA.run.debug.giveConsumable(s, 'constellation', 'milky_way');
  assert.strictEqual(MA.run.canUseConsumable(s, c.uid, []), true);
  const r = MA.run.useConsumable(s, c.uid, []);
  assert.strictEqual(r.ok, true); assert.strictEqual(s.handLevels.straight.level, 2); assert.strictEqual(s.consumables.length, 0);
  assert.strictEqual(s.stats.constellationsUsed, 1);
  assert.ok(s.keepsakes[0].data.seen.indexOf('c:milky_way') >= 0);
  setHand(MA, s, ['5s', '6m', '7b', '8l', '9s']);
  const r2 = MA.run.send(s, uidsOf(MA.run.handCards(s).slice(0, 5))).result;
  assert.strictEqual(r2.level, 2); assert.strictEqual(r2.baseInk, 60); assert.strictEqual(r2.baseGlow, 7);
});
test('onLetterUsed receives the letter id', () => {
  const MA = ctx(), s = begin(MA, { give: ['t_letter_seen'] });
  MA.run.useConsumable(s, give(MA, s, 'ink_moon').uid, [s.hand[0]]);
  eq(s.keepsakes[0].data.seen.filter(x => x !== 'start'), ['ink_moon']);
});
test('real keepsakes: Bookmark, Star Map, Origami Crane grow from letters/constellations', () => {
  const MA = ctx(), K = MA.content.keepsakes;
  if (!K.bookmark || !K.star_map || !K.origami_crane) return;
  const s = begin(MA, { give: ['bookmark', 'star_map', 'origami_crane'] });
  const [a, b] = setHand(MA, s, ['5s', '6m']);
  MA.run.useConsumable(s, give(MA, s, 'fold').uid, [a.uid, b.uid]);
  MA.run.useConsumable(s, give(MA, s, 'ink_star').uid, [s.hand[0]]);
  MA.run.useConsumable(s, MA.run.debug.giveConsumable(s, 'constellation', 'gemini').uid, []);
  assert.strictEqual(s.keepsakes[0].data.glow, 6, 'bookmark +3 per letter');
  assert.strictEqual(s.keepsakes[1].data.x, 1.2, 'star map +0.2 per constellation');
  assert.strictEqual(s.keepsakes[2].data.x, 1.25, 'crane +0.25 for Fold only');
});

/* ======================================================================== review fixes */
section('review fixes: face-down, result shapes, validation, deck floor');
test('The Fog: preview never reveals face-down cards; sortHand puts them last in their old order', () => {
  const MA = ctx(), s = begin(MA, { boss: 'the_fog', seed: 11 });
  const cs = setHand(MA, s, ['Ks', '5m', '9b', 'Ql', '2s', '7m', 'Jb', '3l']);
  cs.forEach(c => { c.faceDown = MA.cards.isFace(c); });
  const down = cs.filter(c => c.faceDown).map(c => c.uid);
  assert.strictEqual(down.length, 3);
  const p = MA.run.preview(s, [cs[0].uid, cs[1].uid]);
  eq([p.type, p.name, p.poker, p.level, p.ink, p.glow, p.contains, p.scoringUids, p.canPlay], [null, '???', '', 0, 0, 0, {}, [], true]);
  const q = MA.run.preview(s, [cs[1].uid, cs[2].uid]);              // two face-up cards still preview normally
  assert.strictEqual(q.type, 'high');
  MA.run.sortHand(s, 'rank');
  eq(s.hand.slice(-3), [cs[0].uid, cs[3].uid, cs[6].uid], 'face-down cards keep their relative (previous) order, last');
  const up = MA.run.handCards(s).slice(0, 5).map(c => c.rank);
  eq(up, up.slice().sort((a, b) => b - a));
  MA.run.sortHand(s, 'suit');
  eq(s.hand.slice(-3), [cs[0].uid, cs[3].uid, cs[6].uid]);
  assert.strictEqual(s.hand.length, 8); conserved(MA, s);
});
test('send/won/saved flags: won and savedById', () => {
  const MA = ctx();
  let s = begin(MA), r = MA.run.send(s, [s.hand[0]]);
  assert.strictEqual(r.outcome, 'continue'); assert.strictEqual(r.won, false); assert.ok(!('savedBy' in r));
  s = begin(MA); s.target = 1; r = MA.run.send(s, [s.hand[0]]);
  assert.strictEqual(r.outcome, 'won'); assert.strictEqual(r.won, true);
  s = begin(MA, { give: ['t_saver'] }); s.sendsLeft = 1;
  const inst = s.keepsakes[0];
  r = MA.run.send(s, [s.hand[0]]);
  assert.strictEqual(r.outcome, 'saved'); assert.strictEqual(r.won, true);
  assert.strictEqual(r.savedBy, inst.uid); assert.strictEqual(r.savedById, 't_saver');
  if (MA.content.keepsakes.rooftop_cat) {
    s = begin(MA, { give: ['rooftop_cat'] }); s.sendsLeft = 1; s.target = 20; setHand(MA, s, ['2s']);
    r = MA.run.send(s, [s.hand[0]]);
    assert.strictEqual(r.savedById, 'rooftop_cat');
  }
  s = begin(MA); s.sendsLeft = 1; r = MA.run.send(s, [s.hand[0]]);
  assert.strictEqual(r.outcome, 'lost'); assert.strictEqual(r.won, false);
});
test('scoring: baseInk/baseGlow are post-Hush, rawBase* are pre-Hush; debuffed event has cardUid', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  let out = scoreCodes(MA, s, PAIR);
  eq([out.r.baseInk, out.r.baseGlow, out.r.rawBaseInk, out.r.rawBaseGlow], [10, 2, 10, 2]);
  s.blindIndex = 2; s.phase = 'playing'; s.bosses[0] = 'the_hush';
  out = scoreCodes(MA, s, PAIR, [], p => { p[1].debuffed = true; });
  eq([out.r.baseInk, out.r.baseGlow, out.r.rawBaseInk, out.r.rawBaseGlow], [5, 1, 10, 2]);
  const ev = out.r.events.find(e => e.t === 'debuffed');
  assert.strictEqual(ev.cardUid, out.played[1].uid); assert.strictEqual(ev.src.uid, out.played[1].uid);
});
test('scoring: running ink/glow in events and result are rounded to 2 decimals', () => {
  const MA = ctx(), s = MA.run.newRun(1);
  MA.content.keepsakes.t_tenth = { id: 't_tenth', name: 't', rarity: 'common', cost: 4, text: '', init: () => ({}),
    onCardScored: function (ctx) { ctx.mulGlow(1.1); }, onHand: function (ctx) { ctx.addGlow(0.1); ctx.addGlow(0.2); } };
  MA.run.debug.giveKeepsake(s, 't_tenth');
  const out = scoreCodes(MA, s, ['7s', '7m', '7b', '7l', 'Ks']);            // four of a kind: 4 x 1.1 on Glow 7
  const round2 = x => Math.round(x * 100) / 100;
  out.r.events.forEach(e => { assert.strictEqual(e.ink, round2(e.ink)); assert.strictEqual(e.glow, round2(e.glow)); });
  assert.strictEqual(out.r.glow, round2(out.r.glow)); assert.strictEqual(out.r.ink, round2(out.r.ink));
  assert.ok(out.r.events.some(e => e.t === 'glow' && e.amount === 0.2 && e.glow === round2(e.glow)));
  assert.ok(out.r.light > 0);
});
test('preview builds its context from the same factory: a Visitor hook using the full ctx cannot crash it or leak effects', () => {
  const MA = ctx(), s = begin(MA, { boss: 'the_dog' });                    // any boss slot; swap in a hook-heavy definition
  MA.content.bosses.t_boss = { id: 't_boss', name: 'T', text: '', flavor: '', minAnte: 1, finale: false, targetMult: 2, hidesMoon: false,
    modifyBase: function (ctx) {
      ctx.addInk(ctx.played.length + ctx.scoring.length + ctx.held.length + ctx.keepsakes.length + (ctx.isFullMoon ? 100 : 0) + (ctx.isFinalSend ? 1000 : 0));
      ctx.chance(1, 2); ctx.say('boo'); ctx.addStamps(5); ctx.mulGlow(2); ctx.addGlow(ctx.contains.pair ? 1 : 0);
    } };
  s.bosses[s.ante - 1] = 't_boss';
  const c = setHand(MA, s, PAIR);
  const rng0 = s.rng.s, stamps0 = s.stamps;
  const p = MA.run.preview(s, uidsOf(c));
  assert.strictEqual(s.rng.s, rng0); assert.strictEqual(s.stamps, stamps0, 'preview must not pay stamps');
  const r = MA.run.send(s, uidsOf(c)).result;
  assert.strictEqual(p.ink, r.baseInk); assert.strictEqual(p.glow, r.baseGlow);
  eq([r.rawBaseInk, r.rawBaseGlow], [10, 2]);
  assert.strictEqual(p.ink, 10 + 5 + 2 + 3 + 0 + 0, 'ctx.played 5, scoring 2, held 3, keepsakes 0');
});
test('useConsumable results: destroyed / created / changed / hand+level; buy and choosePack return the new uid', () => {
  const MA = ctx(), s = begin(MA);
  const [a, b] = setHand(MA, s, ['5s', '6m']);
  let r = MA.run.useConsumable(s, give(MA, s, 'fold').uid, [a.uid, b.uid]);
  eq([r.ok, r.kind, r.id, r.destroyed, r.created, r.changed], [true, 'letter', 'fold', [b.uid], [], [a.uid]]);
  assert.strictEqual(r.hand, undefined); assert.ok(r.message);
  const [c] = setHand(MA, s, ['Js']);
  r = MA.run.useConsumable(s, give(MA, s, 'tear').uid, [c.uid]);
  assert.strictEqual(r.destroyed.length, 0); assert.strictEqual(r.created.length, 1); eq(r.changed, [c.uid]);
  assert.strictEqual(r.created[0], s.hand[s.hand.length - 1]);
  const [d, e] = setHand(MA, s, ['7s', '8m']);
  r = MA.run.useConsumable(s, give(MA, s, 'eraser').uid, [d.uid, e.uid]);
  eq([r.destroyed, r.created, r.changed], [[d.uid, e.uid], [], []]);
  const [f] = setHand(MA, s, ['9s']);
  r = MA.run.useConsumable(s, give(MA, s, 'carbon').uid, [f.uid]);
  eq([r.destroyed, r.changed], [[], [f.uid]]); assert.strictEqual(r.created.length, 1);
  assert.ok(MA.run.getCard(s, r.created[0]));
  // level-ups: wishing star and constellations
  r = MA.run.useConsumable(s, give(MA, s, 'wishing_star').uid, []);
  eq([r.hand, r.level, r.destroyed, r.created, r.changed], ['pair', 2, [], [], []]);
  r = MA.run.useConsumable(s, MA.run.debug.giveConsumable(s, 'constellation', 'milky_way').uid, []);
  eq([r.kind, r.id, r.hand, r.level, r.destroyed, r.created, r.changed], ['constellation', 'milky_way', 'straight', 2, [], [], []]);
  // shop: buy -> uid; choosePack -> uid (letters/keepsakes) or hand+level (constellations)
  const sh = toShop(MA, begin(MA, { seed: 3 }));
  sh.shop.items = [{ kind: 'keepsake', id: 't_glow4', price: 4, sold: false }, { kind: 'letter', id: 'fold', price: 3, sold: false }];
  MA.run.debug.setStamps(sh, 50);
  r = MA.run.buy(sh, 0); assert.strictEqual(r.uid, sh.keepsakes[0].uid);
  r = MA.run.buy(sh, 1); assert.strictEqual(r.uid, sh.consumables[0].uid);
  sh.shop.packs = [{ kind: 'starchart', price: 4, sold: false }, { kind: 'envelope', price: 4, sold: false }, { kind: 'keepsakebox', price: 6, sold: false }];
  MA.run.buyPack(sh, 0);
  const cid = sh.pack.choices[0].id, chand = MA.content.constellations[cid].hand;
  r = MA.run.choosePack(sh, 0);
  eq([r.ok, r.kind, r.id, r.hand, r.level, r.destroyed, r.created, r.changed], [true, 'constellation', cid, chand, 2, [], [], []]);
  MA.run.buyPack(sh, 1);
  r = MA.run.choosePack(sh, 0); assert.strictEqual(r.kind, 'letter'); assert.strictEqual(r.uid, sh.consumables[sh.consumables.length - 1].uid);
  MA.run.buyPack(sh, 2);
  r = MA.run.choosePack(sh, 1); assert.strictEqual(r.kind, 'keepsake'); assert.strictEqual(r.uid, sh.keepsakes[sh.keepsakes.length - 1].uid);
});
test('zero-card letters and constellations ignore the current selection', () => {
  const MA = ctx(), s = begin(MA);
  const al = give(MA, s, 'allowance'), ws = give(MA, s, 'wishing_star');
  const sel = s.hand.slice(0, 3);
  MA.run.debug.setStamps(s, 10);
  assert.strictEqual(MA.run.canUseConsumable(s, al.uid, sel), true);
  assert.strictEqual(MA.run.canUseConsumable(s, ws.uid, ['nope']), true);
  const r = MA.run.useConsumable(s, al.uid, sel);
  assert.strictEqual(r.ok, true); assert.strictEqual(s.stamps, 20); eq(r.changed, []);
  const cn = MA.run.debug.giveConsumable(s, 'constellation', 'gemini');
  assert.strictEqual(MA.run.canUseConsumable(s, cn.uid, sel), true);
  assert.strictEqual(MA.run.useConsumable(s, cn.uid, sel).ok, true);
  assert.strictEqual(MA.run.useConsumable(s, ws.uid, undefined).ok, true);
  assert.strictEqual(s.consumables.length, 0);
  // card letters still validate their selection
  const f = give(MA, s, 'fold');
  assert.ok(typeof MA.run.canUseConsumable(s, f.uid, sel) === 'string');
});
test('deserialize rejects malformed saves', () => {
  const MA = ctx(), s = MA.run.newRun(7);
  MA.run.startBlind(s); MA.run.send(s, [s.hand[0]]); s.target = 1; MA.run.send(s, [s.hand[0]]); MA.run.cashOut(s);
  const good = MA.run.serialize(s);
  assert.ok(MA.run.deserialize(good), 'sanity: a genuine cash-out save loads');
  const mutate = fn => { const o = JSON.parse(good); fn(o); return JSON.stringify(o); };
  const bad = {
    'deck not an array': o => { o.deck = {}; },
    'missing drawPile': o => { delete o.drawPile; },
    'hand not an array': o => { o.hand = 'x'; },
    'keepsakes null': o => { o.keepsakes = null; },
    'consumables object': o => { o.consumables = {}; },
    'bosses too short': o => { o.bosses = o.bosses.slice(0, 3); },
    'handLevels missing': o => { delete o.handLevels; },
    'handLevels lacks a hand': o => { delete o.handLevels.flush; },
    'handLevels bad level': o => { o.handLevels.pair.level = 'two'; },
    'stats array': o => { o.stats = []; },
    'rng missing': o => { delete o.rng; },
    'rng.s string': o => { o.rng.s = 'abc'; },
    'unknown phase': o => { o.phase = 'sleeping'; },
    'ante 9': o => { o.ante = 9; },
    'blindIndex 3': o => { o.blindIndex = 3; },
    'negative stamps': o => { o.stamps = -1; },
    'NaN-ish stamps': o => { o.stamps = null; },
    'pile card not in deck': o => { o.discardPile.push('c9999'); },
    'card in two piles': o => { o.hand.push(o.discardPile[0]); },
    'bad card rank': o => { o.deck[0].rank = 99; },
    'bad card suit': o => { o.deck[0].suit = 'cloud'; },
    'bad sticker': o => { o.deck[0].sticker = 'glue'; },
    'keepsake without data': o => { o.keepsakes = [{ uid: 'k1', id: 'black_cat' }]; },
    'consumable bad kind': o => { o.consumables = [{ uid: 'x1', kind: 'potion', id: 'fold' }]; },
    'cashout phase without cashout': o => { o.cashout = null; },
    'version 2': o => { o.version = 2; },
    'shop bad item': o => { o.shop = { items: [{ kind: 'gadget', id: 'x', price: 1 }], packs: [], rerollCost: 5 }; },
    'pack bad source': o => { o.pack = { kind: 'envelope', choices: [], source: 'gift' }; }
  };
  Object.keys(bad).forEach(name => {
    assert.strictEqual(MA.run.deserialize(mutate(bad[name])), null, name);
  });
  ['', '[]', '42', 'null', '"x"', '{', 'undefined'].forEach(t => assert.strictEqual(MA.run.deserialize(t), null, JSON.stringify(t)));
  // optional fields may be missing
  const o = JSON.parse(good); delete o.log; delete o.blindWon;
  const back = MA.run.deserialize(JSON.stringify(o));
  assert.ok(back && back.blindWon === false && Array.isArray(back.log));
});
test('leaveShop and skipBlind refresh target and reset roundScore', () => {
  const MA = ctx(), s = MA.run.newRun(2);
  toShop(MA, s);
  assert.ok(s.roundScore > 0, 'the cleared blind left a score behind');
  MA.run.leaveShop(s);
  assert.strictEqual(s.roundScore, 0); assert.strictEqual(s.target, MA.run.blindInfo(s).target); assert.strictEqual(s.target, 450);
  toShop(MA, s); MA.run.leaveShop(s);
  assert.strictEqual(s.blindIndex, 2); assert.strictEqual(s.target, MA.run.blindInfo(s).target);
  toShop(MA, s); MA.run.leaveShop(s);
  assert.strictEqual(s.ante, 2); assert.strictEqual(s.target, 800); assert.strictEqual(s.roundScore, 0);
  const k = MA.run.newRun(3); MA.run.skipBlind(k);
  assert.strictEqual(k.target, 450); assert.strictEqual(k.roundScore, 0);
});
test('deck floor: engine refuses Fold/Eraser that would leave < 5 cards or nothing to send', () => {
  const MA = ctx();
  /* strip the letters' own guards so this exercises the engine-level safety net */
  const plain = (min, max) => (st, cards) => (cards.length >= min && cards.length <= max ? true : 'Pick ' + min + '-' + max);
  MA.content.letters.eraser.canUse = plain(1, 2); MA.content.letters.fold.canUse = plain(2, 2);
  const shrink = (s, n) => {                       // keep the first n cards (hand first), drop the rest for good
    const keep = s.hand.concat(s.drawPile, s.discardPile).slice(0, n);
    s.deck = s.deck.filter(c => keep.indexOf(c.uid) >= 0);
    s.hand = s.hand.filter(u => keep.indexOf(u) >= 0); s.drawPile = s.drawPile.filter(u => keep.indexOf(u) >= 0);
    s.discardPile = s.discardPile.filter(u => keep.indexOf(u) >= 0);
  };
  // Eraser / Fold with exactly 5 or 6 cards
  let s = begin(MA); shrink(s, 5);
  conserved(MA, s);
  const er = give(MA, s, 'eraser'), fo = give(MA, s, 'fold');
  assert.strictEqual(MA.run.canUseConsumable(s, er.uid, [s.hand[0]]), 'Your deck is too thin for that.');
  assert.strictEqual(MA.run.useConsumable(s, er.uid, [s.hand[0]]).reason, 'Your deck is too thin for that.');
  assert.strictEqual(MA.run.canUseConsumable(s, fo.uid, s.hand.slice(0, 2)), 'Your deck is too thin for that.');
  assert.strictEqual(s.deck.length, 5); assert.strictEqual(s.consumables.length, 2, 'refused use keeps the letter');
  s = begin(MA); shrink(s, 6);
  const e2 = give(MA, s, 'eraser'), f2 = give(MA, s, 'fold');
  assert.strictEqual(MA.run.canUseConsumable(s, e2.uid, s.hand.slice(0, 2)), 'Your deck is too thin for that.');
  assert.strictEqual(MA.run.canUseConsumable(s, e2.uid, [s.hand[0]]), true);
  assert.strictEqual(MA.run.canUseConsumable(s, f2.uid, s.hand.slice(0, 2)), true);
  assert.strictEqual(MA.run.useConsumable(s, f2.uid, s.hand.slice(0, 2)).ok, true);
  assert.strictEqual(s.deck.length, 5);
  assert.strictEqual(MA.run.canUseConsumable(s, e2.uid, [s.hand[0]]), 'Your deck is too thin for that.');
  // nothing left to send: hand of 2, empty draw pile, deck large (other cards already in the discard pile)
  s = begin(MA);
  const all = s.hand.concat(s.drawPile);
  s.hand = all.slice(0, 2); s.drawPile = []; s.discardPile = all.slice(2);
  const e3 = give(MA, s, 'eraser');
  assert.strictEqual(MA.run.canUseConsumable(s, e3.uid, s.hand.slice()), 'Your deck is too thin for that.');
  assert.strictEqual(MA.run.canUseConsumable(s, e3.uid, [s.hand[0]]), true);
  // outside a blind only 0-card letters work anyway, and they never trip the floor
  s = MA.run.newRun(1); assert.strictEqual(MA.run.canUseConsumable(s, give(MA, s, 'allowance').uid, []), true);
});

/* ======================================================================== fuzz */
section('fuzz');
const FUZZ_RUNS = parseInt(process.env.FUZZ_RUNS || '300', 10);
const fz = fuzz.run({ load: () => load(), runs: FUZZ_RUNS, log: console.log });
test('fuzz: no exceptions or invariant violations in ' + FUZZ_RUNS + ' seeded runs', () => {
  if (fz.errors.length) throw new Error(fz.errors.length + ' failing runs; first: ' + fz.errors[0].message + '\n' + (fz.errors[0].stack || ''));
});
test('fuzz: serialization round trips were exercised', () => { assert.ok(fz.roundTrips > 100, 'round trips: ' + fz.roundTrips); });
test('fuzz: some runs reach later Nights (balance signal); easy runs reach Night 8 and win', () => {
  assert.ok(fz.reached[3] > 0, 'no run reached Night 3');
  assert.ok(fz.easy.reached[8] > 0, 'no easy run reached Night 8 (late-game visitors unexercised)');
  assert.ok(fz.easy.won > 0, 'no easy run won (victory path unexercised)');
});
test('fuzz: replay determinism (same seed, same bot -> same final state)', () => {
  const a = fuzz.runOne(load().MA, 12345, {}), b = fuzz.runOne(load().MA, 12345, {});
  assert.strictEqual(a.finalState, b.finalState);
});
test('fuzz: also passes on the built-in stub content (engine hooks without the real files)', () => {
  const r = fuzz.run({ load: () => load({ forceStubs: true }), runs: 40, log: () => {} });
  if (r.errors.length) throw new Error(r.errors[0].message + '\n' + (r.errors[0].stack || ''));
});

/* ======================================================================== summary */
const R = H.results;
console.log('\n' + R.pass + ' passed, ' + R.fail + ' failed  (' + ((Date.now() - started) / 1000).toFixed(1) + 's)');
if (R.fail) {
  console.log('\nFailures:');
  R.failures.forEach(f => console.log(' - ' + f.name));
  process.exit(1);
}
