/* Midnight Airmail — unit tests for the content modules (keepsakes + letters).
   Run: node tests/content-tests.js
   Loads namespace.js + keepsakes.js + letters.js into a bare vm context (no engine). */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');

var ROOT = path.join(__dirname, '..');
var sandbox = {};
sandbox.window = sandbox;                       // scripts use `typeof window !== 'undefined' ? window : globalThis`
vm.createContext(sandbox);
['js/core/namespace.js', 'js/content/keepsakes.js', 'js/content/letters.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
});
var MA = sandbox.MA;
var K = MA.content.keepsakes;
var L = MA.content.letters;

/* ------------------------------ tiny harness ------------------------------ */
var passed = 0, failed = 0, failures = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; failures.push(name + '\n      ' + (e && e.message || e)); }
}
/* cross-realm-safe deep equality */
function eq(actual, expected, msg) {
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected), msg);
}
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
  }
  return o;
}

/* --------------------------------- stubs ---------------------------------- */
var uidN = 0;
function card(rank, suit, sticker) {
  return { uid: 'c' + (++uidN), rank: rank, suit: suit || 'star', sticker: sticker || null, debuffed: false, faceDown: false };
}
function baseState(over) {
  var s = {
    stamps: 10, crumplesLeft: 3, sendsLeft: 2, roundScore: 0, target: 300,
    keepsakeSlots: 5, keepsakes: [], drawPile: [], hand: [], ante: 1
  };
  Object.keys(over || {}).forEach(function (k) { s[k] = over[k]; });
  return s;
}
/* ctx that records every score-changing call; touching ctx.ink / ctx.glow directly throws. */
function mkCtx(over) {
  over = over || {};
  var calls = [];
  var ctx = {
    state: deepFreeze(baseState(over.state)),
    handType: over.handType || 'high',
    contains: over.contains || { high: true },
    played: over.played || [], scoring: over.scoring || [], held: over.held || [],
    isFullMoon: !!over.isFullMoon, isFinalSend: !!over.isFinalSend,
    keepsakes: [],
    addInk: function (n) { calls.push(['ink', n]); },
    addGlow: function (n) { calls.push(['glow', n]); },
    mulGlow: function (x) { calls.push(['xglow', x]); },
    addStamps: function (n) { calls.push(['stamps', n]); },
    say: function (t) { calls.push(['say', t]); },
    chance: function (n, d) { calls.push(['chance', n, d]); return !!over.chanceResult; },
    calls: calls
  };
  ['ink', 'glow'].forEach(function (k) {
    Object.defineProperty(ctx, k, {
      get: function () { return 0; },
      set: function () { throw new Error('hook must not write ctx.' + k + ' directly'); }
    });
  });
  return ctx;
}
function scoreCalls(ctx) { return ctx.calls.filter(function (c) { return c[0] !== 'chance'; }); }
function inst(id, data) { return { uid: 'k1', id: id, data: data || K[id].init() }; }
function frozenState(over) { return deepFreeze(baseState(over)); }

/* Run a ctx hook and return the recorded (non-chance) calls. */
function run(id, hook, ctxOver, card_, data) {
  var ctx = mkCtx(ctxOver);
  var i = inst(id, data);
  K[id][hook](ctx, i, card_);
  return scoreCalls(ctx);
}

/* ============================ DESIGN §4 tables ============================ */
var KEEPSAKE_TABLE = {
  black_cat: ['Black Cat', 'common', 4],
  hair_clip: ['Yellow Hair Clip', 'common', 5],
  graph_moon: ['Graph-Paper Moon', 'common', 5],
  flower_pot: ['Flower Pot', 'common', 5],
  ivy_vine: ['Ivy Vine', 'common', 5],
  pink_curtains: ['Pink Curtains', 'common', 4],
  lit_window: ['Lit Window', 'common', 5],
  paper_chain: ['Paper Garland', 'common', 5],
  envelope_stack: ['Stack of Envelopes', 'common', 5],
  blue_pencil: ['Blue Pencil', 'common', 4],
  paper_plane: ['Paper Airplane', 'common', 5],
  ceiling_stars: ['Glow-in-the-Dark Stars', 'common', 5],
  storybook: ['Storybook', 'common', 5],
  tin_bank: ['Tin Piggy Bank', 'common', 5],
  nightlight: ['Nightlight', 'common', 4],
  night_owl: ['Night Owl', 'uncommon', 6],
  moon_rabbit: ['Moon Rabbit', 'uncommon', 7],
  telescope: ['Telescope', 'uncommon', 6],
  crumpled_note: ['Crumpled Note', 'uncommon', 6],
  diary: ['Diary', 'uncommon', 6],
  alarm_clock: ['Alarm Clock', 'uncommon', 6],
  kite: ['Kite String', 'uncommon', 7],
  music_box: ['Music Box', 'uncommon', 6],
  warm_sweater: ['Teal Sweater', 'uncommon', 6],
  bouquet: ['Bouquet', 'uncommon', 7],
  wishing_coin: ['Wishing Coin', 'uncommon', 7],
  bookmark: ['Bookmark', 'uncommon', 6],
  star_map: ['Star Map', 'uncommon', 6],
  rooftop_cat: ['Rooftop Cat', 'uncommon', 6],
  paper_sun: ['The Paper Sun', 'rare', 9],
  origami_crane: ['Origami Crane', 'rare', 8],
  rainbow_crayons: ['Rainbow Crayons', 'rare', 8]
};
var LETTER_TABLE = {   // id: [name, min, max]
  fold: ['Fold', 2, 2], tear: ['Tear', 1, 1],
  ink_star: ['Starlight Ink', 1, 3], ink_moon: ['Moonlight Ink', 1, 3],
  ink_bloom: ['Pressed Petal', 1, 3], ink_leaf: ['Pressed Leaf', 1, 3],
  sticker_graph: ['Graph Paper Sheet', 1, 2], sticker_watercolor: ['Watercolor Tin', 1, 2],
  sticker_foil: ['Gold Foil', 1, 1], sticker_glitter: ['Glitter Glue', 1, 2],
  sticker_washi: ['Washi Tape', 1, 2], sticker_wax: ['Wax Seal', 1, 1],
  eraser: ['Eraser', 1, 2], carbon: ['Carbon Paper', 1, 1], sharpener: ['Pencil Sharpener', 1, 2],
  allowance: ['Allowance', 0, 0], wishing_star: ['Wishing Star', 0, 0]
};
var VALID_KINDS = ['ink', 'glow', 'xglow', 'stamp', 'star', 'moon', 'bloom', 'leaf', 'hand'];
var HOOKS = ['onHandSent', 'retrigger', 'onCardScored', 'onHeld', 'onHand', 'onDiscard', 'onBlindStart',
  'onBlindEnd', 'onLetterUsed', 'onConstellationUsed', 'onLose', 'status'];
var PASSIVE_KEYS = ['handSize', 'sends', 'crumples', 'fourFingers', 'moonSpeed'];

function markupOk(text) {
  // every {..} group must be {validkind|...}; no stray braces afterwards
  var stripped = String(text).replace(new RegExp('\\{(' + VALID_KINDS.join('|') + ')\\|[^{}]*\\}', 'g'), '');
  return stripped.indexOf('{') < 0 && stripped.indexOf('}') < 0;
}

/* ================================ structure ================================ */
test('keepsakes: exactly 32, ids/names/rarity/cost match DESIGN §4', function () {
  eq(Object.keys(K).sort(), Object.keys(KEEPSAKE_TABLE).sort());
  assert.strictEqual(Object.keys(K).length, 32);
  Object.keys(KEEPSAKE_TABLE).forEach(function (id) {
    var d = K[id], t = KEEPSAKE_TABLE[id];
    assert.strictEqual(d.id, id, id + ' id');
    assert.strictEqual(d.name, t[0], id + ' name');
    assert.strictEqual(d.rarity, t[1], id + ' rarity');
    assert.strictEqual(d.cost, t[2], id + ' cost');
  });
});

test('keepsakes: shape (text markup, flavor, init JSON-only, known hooks/passives)', function () {
  Object.keys(K).forEach(function (id) {
    var d = K[id];
    assert.ok(typeof d.text === 'string' && d.text.length > 0, id + ' text');
    assert.ok(markupOk(d.text), id + ' text uses invalid markup: ' + d.text);
    assert.ok(typeof d.flavor === 'string' && d.flavor.length > 0 && d.flavor.length <= 60, id + ' flavor length ' + (d.flavor || '').length);
    assert.ok(d.flavor.indexOf('—') < 0 && d.flavor.indexOf('–') < 0, id + ' flavor has a dash char');
    assert.strictEqual(typeof d.init, 'function', id + ' init');
    var data = d.init();
    assert.ok(data && typeof data === 'object', id + ' init returns object');
    eq(JSON.parse(JSON.stringify(data)), data, id + ' init JSON-safe');
    // own keys must be known contract keys
    Object.keys(d).forEach(function (k) {
      assert.ok(['id', 'name', 'rarity', 'cost', 'text', 'flavor', 'init', 'passive'].concat(HOOKS).indexOf(k) >= 0, id + ' unknown key ' + k);
    });
    if (d.passive) Object.keys(d.passive).forEach(function (k) { assert.ok(PASSIVE_KEYS.indexOf(k) >= 0, id + ' passive ' + k); });
    // init returns a fresh object each call
    assert.notStrictEqual(d.init(), d.init(), id + ' init fresh object');
  });
});

test('keepsakes: no em/en dashes in text either', function () {
  Object.keys(K).forEach(function (id) {
    assert.ok(K[id].text.indexOf('—') < 0, id + ' text em dash');
  });
});

test('letters: exactly 17, ids/names/min/max match DESIGN §4', function () {
  eq(Object.keys(L).sort(), Object.keys(LETTER_TABLE).sort());
  assert.strictEqual(Object.keys(L).length, 17);
  Object.keys(LETTER_TABLE).forEach(function (id) {
    var d = L[id], t = LETTER_TABLE[id];
    assert.strictEqual(d.id, id);
    assert.strictEqual(d.name, t[0], id + ' name');
    assert.strictEqual(d.min, t[1], id + ' min');
    assert.strictEqual(d.max, t[2], id + ' max');
    assert.ok(typeof d.text === 'string' && markupOk(d.text), id + ' text markup: ' + d.text);
    assert.ok(typeof d.flavor === 'string' && d.flavor.length > 0 && d.flavor.length <= 60, id + ' flavor');
    assert.ok(d.flavor.indexOf('—') < 0 && d.text.indexOf('—') < 0, id + ' em dash');
    assert.strictEqual(typeof d.canUse, 'function');
    assert.strictEqual(typeof d.use, 'function');
  });
});

/* ================================ keepsakes ================================ */
test('black_cat: +4 Glow', function () {
  eq(run('black_cat', 'onHand'), [['glow', 4]]);
});

test('suit keepsakes: +3 Glow only for their suit', function () {
  var map = { hair_clip: 'star', graph_moon: 'moon', flower_pot: 'bloom', ivy_vine: 'leaf' };
  Object.keys(map).forEach(function (id) {
    ['star', 'moon', 'bloom', 'leaf'].forEach(function (suit) {
      var out = run(id, 'onCardScored', {}, card(7, suit));
      eq(out, suit === map[id] ? [['glow', 3]] : [], id + ' vs ' + suit);
    });
  });
});

test('contains-based glow/ink keepsakes', function () {
  var cases = [
    ['pink_curtains', 'pair', ['glow', 8]],
    ['lit_window', 'three', ['glow', 12]],
    ['paper_chain', 'straight', ['glow', 12]],
    ['envelope_stack', 'flush', ['glow', 10]],
    ['blue_pencil', 'pair', ['ink', 50]]
  ];
  cases.forEach(function (c) {
    var yes = {}; yes[c[1]] = true; yes.high = true;
    eq(run(c[0], 'onHand', { contains: yes }), [c[2]], c[0] + ' hit');
    eq(run(c[0], 'onHand', { contains: { high: true } }), [], c[0] + ' miss');
  });
  // a hand containing a Three also contains a Pair (engine sets both) — pink_curtains fires
  eq(run('pink_curtains', 'onHand', { contains: { high: true, pair: true, three: true } }), [['glow', 8]]);
  // but lit_window does not fire on a plain pair
  eq(run('lit_window', 'onHand', { contains: { high: true, pair: true } }), []);
});

test('paper_plane: +25 Ink per Crumple remaining (state.crumplesLeft)', function () {
  eq(run('paper_plane', 'onHand', { state: { crumplesLeft: 3 } }), [['ink', 75]]);
  eq(run('paper_plane', 'onHand', { state: { crumplesLeft: 1 } }), [['ink', 25]]);
  eq(run('paper_plane', 'onHand', { state: { crumplesLeft: 0 } }), []);
  assert.strictEqual(K.paper_plane.status(inst('paper_plane'), baseState({ phase: 'playing', crumplesLeft: 2 })), '(Currently {ink|+50 Ink})');
  // outside a blind crumplesLeft is stale: use maxCrumples (or 3)
  assert.strictEqual(K.paper_plane.status(inst('paper_plane'), baseState({ phase: 'shop', crumplesLeft: 0, maxCrumples: 3 })), '(Currently {ink|+75 Ink})');
  assert.strictEqual(K.paper_plane.status(inst('paper_plane'), baseState({ phase: 'blindSelect', crumplesLeft: 0, maxCrumples: 2 })), '(Currently {ink|+50 Ink})');
  assert.strictEqual(K.paper_plane.status(inst('paper_plane'), baseState({ phase: 'shop', crumplesLeft: 0 })), '(Currently {ink|+75 Ink})');
  assert.strictEqual(K.paper_plane.status(inst('paper_plane'), null), '(Currently {ink|+75 Ink})');
});

test('ceiling_stars: ranks 2-5 give +4 Glow', function () {
  for (var r = 2; r <= 14; r++) {
    eq(run('ceiling_stars', 'onCardScored', {}, card(r)), (r >= 2 && r <= 5) ? [['glow', 4]] : [], 'rank ' + r);
  }
});

test('storybook: face cards (J Q K) give +30 Ink', function () {
  for (var r = 2; r <= 14; r++) {
    eq(run('storybook', 'onCardScored', {}, card(r)), (r >= 11 && r <= 13) ? [['ink', 30]] : [], 'rank ' + r);
  }
});

test('tin_bank: returns 3 at blind end', function () {
  assert.strictEqual(K.tin_bank.onBlindEnd(baseState(), inst('tin_bank'), { wasBoss: false }), 3);
  assert.strictEqual(K.tin_bank.onBlindEnd(baseState(), inst('tin_bank'), { wasBoss: true }), 3);
});

test('nightlight: +3 Glow per empty keepsake slot', function () {
  var ks = function (n) { var a = []; for (var i = 0; i < n; i++) a.push({ uid: 'k' + i, id: 'x', data: {} }); return a; };
  eq(run('nightlight', 'onHand', { state: { keepsakeSlots: 5, keepsakes: ks(2) } }), [['glow', 9]]);
  eq(run('nightlight', 'onHand', { state: { keepsakeSlots: 5, keepsakes: ks(4) } }), [['glow', 3]]);
  eq(run('nightlight', 'onHand', { state: { keepsakeSlots: 5, keepsakes: ks(5) } }), []);
  assert.strictEqual(K.nightlight.status(inst('nightlight'), baseState({ keepsakeSlots: 5, keepsakes: ks(3) })), '(Currently {glow|+6 Glow})');
});

test('night_owl: ×2 Glow only on final Send', function () {
  eq(run('night_owl', 'onHand', { isFinalSend: true }), [['xglow', 2]]);
  eq(run('night_owl', 'onHand', { isFinalSend: false }), []);
});

test('moon_rabbit: +10 Glow normally, ×3 during Full Moon instead', function () {
  eq(run('moon_rabbit', 'onHand', { isFullMoon: false }), [['glow', 10]]);
  eq(run('moon_rabbit', 'onHand', { isFullMoon: true }), [['xglow', 3]]);
});

test('telescope / alarm_clock / kite passives', function () {
  eq(K.telescope.passive, { moonSpeed: 2 });
  eq(K.alarm_clock.passive, { sends: 1 });
  eq(K.kite.passive, { fourFingers: true });
  assert.strictEqual(K.telescope.onHand, undefined);
});

test('crumpled_note: +3 Ink per crumpled card, applied on Send, status', function () {
  var i = inst('crumpled_note');
  eq(i.data, { ink: 0 });
  var ctx0 = mkCtx(); K.crumpled_note.onHand(ctx0, i);
  eq(scoreCalls(ctx0), [], 'no +0 add');
  assert.strictEqual(K.crumpled_note.status(i, baseState()), '(Currently {ink|+0 Ink})');
  K.crumpled_note.onDiscard(frozenState(), i, [card(2), card(3)]);
  eq(i.data, { ink: 6 });
  K.crumpled_note.onDiscard(frozenState(), i, [card(9)]);
  eq(i.data, { ink: 9 });
  var ctx = mkCtx(); K.crumpled_note.onHand(ctx, i);
  eq(scoreCalls(ctx), [['ink', 9]]);
  assert.strictEqual(K.crumpled_note.status(i, baseState()), '(Currently {ink|+9 Ink})');
});

test('diary: grows +1 Glow per Send containing Pen Pals (with say), applies on hand', function () {
  var i = inst('diary');
  eq(i.data, { glow: 0 });
  var noPair = mkCtx({ contains: { high: true } });
  K.diary.onHandSent(noPair, i);
  eq(scoreCalls(noPair), []); eq(i.data, { glow: 0 });
  var c1 = mkCtx({ contains: { high: true, pair: true } });
  K.diary.onHandSent(c1, i);
  eq(scoreCalls(c1), [['say', 'Upgraded!']]); eq(i.data, { glow: 1 });
  var c2 = mkCtx({ contains: { high: true, pair: true, three: true } });
  K.diary.onHandSent(c2, i);
  eq(i.data, { glow: 2 });
  var h = mkCtx(); K.diary.onHand(h, i);
  eq(scoreCalls(h), [['glow', 2]]);
  assert.strictEqual(K.diary.status(i, baseState()), '(Currently {glow|+2 Glow})');
  var zero = mkCtx(); K.diary.onHand(zero, inst('diary'));
  eq(scoreCalls(zero), [], 'no +0 add');
});

test('music_box: retriggers scored face cards once', function () {
  for (var r = 2; r <= 14; r++) {
    assert.strictEqual(K.music_box.retrigger(mkCtx(), inst('music_box'), card(r)), (r >= 11 && r <= 13) ? 1 : 0, 'rank ' + r);
  }
});

test('warm_sweater: +2 Ink per card in the draw pile', function () {
  var pile = function (n) { var a = []; for (var i = 0; i < n; i++) a.push('c' + i); return a; };
  eq(run('warm_sweater', 'onHand', { state: { drawPile: pile(30) } }), [['ink', 60]]);
  eq(run('warm_sweater', 'onHand', { state: { drawPile: pile(1) } }), [['ink', 2]]);
  eq(run('warm_sweater', 'onHand', { state: { drawPile: [] } }), []);
  assert.strictEqual(K.warm_sweater.status(inst('warm_sweater'), baseState({ phase: 'playing', drawPile: pile(10) })), '(Currently {ink|+20 Ink})');
  // outside a blind the draw pile is leftover: no status line
  ['blindSelect', 'cashout', 'shop'].forEach(function (ph) {
    assert.strictEqual(K.warm_sweater.status(inst('warm_sweater'), baseState({ phase: ph, drawPile: pile(10) })), '', ph);
  });
  assert.strictEqual(K.warm_sweater.status(inst('warm_sweater'), null), '');
});

test('bouquet: ×3 Glow only when non-debuffed scoring cards cover all four suits', function () {
  var four = [card(2, 'star'), card(3, 'moon'), card(4, 'bloom'), card(5, 'leaf')];
  eq(run('bouquet', 'onHand', { scoring: four }), [['xglow', 3]]);
  var five = four.concat([card(9, 'star')]);
  eq(run('bouquet', 'onHand', { scoring: five }), [['xglow', 3]]);
  eq(run('bouquet', 'onHand', { scoring: four.slice(0, 3) }), [], 'missing a suit');
  var deb = [card(2, 'star'), card(3, 'moon'), card(4, 'bloom'), card(5, 'leaf')];
  deb[3].debuffed = true;
  eq(run('bouquet', 'onHand', { scoring: deb }), [], 'debuffed leaf does not count');
  // held/played-but-not-scoring cards don't count
  var ctx = { scoring: four.slice(0, 3), played: four, held: [card(6, 'leaf')] };
  eq(run('bouquet', 'onHand', ctx), []);
});

test('wishing_coin: chance(1,2) → ×2 Glow, else a "Nope!" bubble', function () {
  var win = mkCtx({ chanceResult: true });
  K.wishing_coin.onHand(win, inst('wishing_coin'));
  eq(win.calls, [['chance', 1, 2], ['xglow', 2]]);
  var lose = mkCtx({ chanceResult: false });
  K.wishing_coin.onHand(lose, inst('wishing_coin'));
  eq(lose.calls, [['chance', 1, 2], ['say', 'Nope!']]);
});

test('bookmark: +3 Glow per Letter used, applies on hand, status', function () {
  var i = inst('bookmark');
  eq(i.data, { glow: 0 });
  var z = mkCtx(); K.bookmark.onHand(z, i); eq(scoreCalls(z), []);
  K.bookmark.onLetterUsed(frozenState(), i, 'fold');
  K.bookmark.onLetterUsed(frozenState(), i, 'eraser');
  eq(i.data, { glow: 6 });
  var c = mkCtx(); K.bookmark.onHand(c, i); eq(scoreCalls(c), [['glow', 6]]);
  assert.strictEqual(K.bookmark.status(i, baseState()), '(Currently {glow|+6 Glow})');
});

test('star_map: starts ×1, +0.2 per Constellation (rounded), status', function () {
  var i = inst('star_map');
  eq(i.data, { x: 1 });
  var z = mkCtx(); K.star_map.onHand(z, i); eq(scoreCalls(z), [], 'no ×1 apply');
  assert.strictEqual(K.star_map.status(i, baseState()), '(Currently {xglow|×1 Glow})');
  K.star_map.onConstellationUsed(frozenState(), i, 'polaris');
  assert.strictEqual(i.data.x, 1.2);
  K.star_map.onConstellationUsed(frozenState(), i, 'gemini');
  assert.strictEqual(i.data.x, 1.4);
  assert.strictEqual(K.star_map.status(i, baseState()), '(Currently {xglow|×1.4 Glow})');
  for (var n = 0; n < 3; n++) K.star_map.onConstellationUsed(frozenState(), i, 'teapot');
  assert.strictEqual(i.data.x, 2);                       // no float drift (1 + 5*0.2)
  var c = mkCtx(); K.star_map.onHand(c, i); eq(scoreCalls(c), [['xglow', 2]]);
});

test('rooftop_cat: saves at ≥25% of target, not below', function () {
  var cat = K.rooftop_cat;
  assert.strictEqual(cat.onLose(frozenState({ roundScore: 75, target: 300 }), inst('rooftop_cat')), true);
  assert.strictEqual(cat.onLose(frozenState({ roundScore: 74, target: 300 }), inst('rooftop_cat')), false);
  assert.strictEqual(cat.onLose(frozenState({ roundScore: 500, target: 300 }), inst('rooftop_cat')), true);
  assert.strictEqual(cat.onLose(frozenState({ roundScore: 0, target: 300 }), inst('rooftop_cat')), false);
});

test('paper_sun: ×1.5, +0.25 per Visitor beaten, onBlindEnd returns 0', function () {
  var i = inst('paper_sun');
  eq(i.data, { x: 1.5 });
  var c = mkCtx(); K.paper_sun.onHand(c, i); eq(scoreCalls(c), [['xglow', 1.5]]);
  assert.strictEqual(K.paper_sun.onBlindEnd(frozenState(), i, { wasBoss: false }), 0);
  assert.strictEqual(i.data.x, 1.5);
  assert.strictEqual(K.paper_sun.onBlindEnd(frozenState(), i, { wasBoss: true }), 0);
  assert.strictEqual(i.data.x, 1.75);
  assert.strictEqual(K.paper_sun.status(i, baseState()), '(Currently {xglow|×1.75 Glow})');
  K.paper_sun.onBlindEnd(frozenState(), i, { wasBoss: true });
  assert.strictEqual(i.data.x, 2);
  var c2 = mkCtx(); K.paper_sun.onHand(c2, i); eq(scoreCalls(c2), [['xglow', 2]]);
});

test('origami_crane: grows only for Fold / Tear', function () {
  var i = inst('origami_crane');
  eq(i.data, { x: 1 });
  var z = mkCtx(); K.origami_crane.onHand(z, i); eq(scoreCalls(z), [], 'no ×1 apply');
  K.origami_crane.onLetterUsed(frozenState(), i, 'eraser');
  K.origami_crane.onLetterUsed(frozenState(), i, 'ink_star');
  assert.strictEqual(i.data.x, 1);
  K.origami_crane.onLetterUsed(frozenState(), i, 'fold');
  assert.strictEqual(i.data.x, 1.25);
  K.origami_crane.onLetterUsed(frozenState(), i, 'tear');
  assert.strictEqual(i.data.x, 1.5);
  assert.strictEqual(K.origami_crane.status(i, baseState()), '(Currently {xglow|×1.5 Glow})');
  K.origami_crane.onLetterUsed(frozenState(), i, 'fold');
  K.origami_crane.onLetterUsed(frozenState(), i, 'fold');
  assert.strictEqual(i.data.x, 2);
  var c = mkCtx(); K.origami_crane.onHand(c, i); eq(scoreCalls(c), [['xglow', 2]]);
});

test('rainbow_crayons: each scored card gives ×1.1', function () {
  eq(run('rainbow_crayons', 'onCardScored', {}, card(9)), [['xglow', 1.1]]);
});

test('keepsakes never write ctx.ink/glow, never mutate state (frozen ctx state), never emit no-ops', function () {
  // Drive every ctx hook of every keepsake against a maximal context; the ctx setters/frozen state throw on misuse.
  var full = [card(2, 'star'), card(12, 'moon'), card(4, 'bloom'), card(13, 'leaf')];
  Object.keys(K).forEach(function (id) {
    var d = K[id];
    ['onHandSent', 'onCardScored', 'onHeld', 'onHand', 'retrigger'].forEach(function (h) {
      if (!d[h]) return;
      var ctx = mkCtx({ contains: { high: true, pair: true, flush: true, straight: true, three: true },
        scoring: full, isFinalSend: true, isFullMoon: true, chanceResult: true });
      d[h](ctx, inst(id), full[0]);
      scoreCalls(ctx).forEach(function (c) {
        if (c[0] === 'ink' || c[0] === 'glow') assert.ok(c[1] > 0, id + '.' + h + ' emitted +0/negative ' + c[0]);
        if (c[0] === 'xglow') assert.ok(c[1] > 1, id + '.' + h + ' emitted ×1 or less');
      });
    });
  });
});

/* ================================= letters ================================= */
var apiN = 0;
function mkApi(over) {
  over = over || {};
  var log = [];
  var api = {
    log: log, hand: [], deck: [],
    destroyCard: function (uid) { log.push(['destroy', uid]); },
    addCardToHand: function (c) { log.push(['toHand', c.rank, c.suit, c.sticker]); api.hand.push(c); },
    addCardToDeck: function (c) { log.push(['toDeck', c.rank, c.suit, c.sticker]); api.deck.push(c); },
    makeCard: function (rank, suit, sticker) {
      log.push(['make', rank, suit, sticker === undefined ? null : sticker]);
      return { uid: 'n' + (++apiN), rank: rank, suit: suit, sticker: sticker || null, debuffed: false, faceDown: false };
    },
    levelUp: function (t, n) { log.push(['level', t, n]); },
    addStamps: function (n) { log.push(['stamps', n]); },
    mostSentHand: function () { return over.mostSent || 'pair'; }
  };
  return api;
}
function use(id, cards, state, api) {
  api = api || mkApi();
  var st = state || baseState();
  var can = L[id].canUse(st, cards);
  assert.strictEqual(can, true, id + ' canUse: ' + can);
  var res = L[id].use(st, cards, api);
  assert.ok(res && typeof res.message === 'string' && res.message.length > 0, id + ' returns {message}');
  return { res: res, api: api };
}
function reason(id, cards, state) {
  var r = L[id].canUse(state || baseState(), cards);
  assert.ok(typeof r === 'string' && r.length > 0 && r.length < 60, id + ' should refuse with a short reason, got ' + r);
  return r;
}

test('fold: sums paper values on the left card, destroys the right, keeps left suit & sticker', function () {
  var a = card(7, 'bloom', 'foil'), b = card(4, 'moon', 'graph');
  var o = use('fold', [a, b]);
  assert.strictEqual(a.rank, 11); assert.strictEqual(a.suit, 'bloom'); assert.strictEqual(a.sticker, 'foil');
  eq(o.api.log, [['destroy', b.uid]]);
  assert.strictEqual(o.res.message, 'Folded into a J of Blooms');
});

test('fold: caps at K (13)', function () {
  var a = card(9, 'bloom'), b = card(10, 'star');
  var o = use('fold', [a, b]);
  assert.strictEqual(a.rank, 13);
  assert.strictEqual(o.res.message, 'Folded into a K of Blooms');
  var c = card(13, 'leaf'), d = card(13, 'leaf');
  use('fold', [c, d]); assert.strictEqual(c.rank, 13);
});

test('fold: Aces count as 1; A + A = 2; A + 5 = 6; 7 + A = 8', function () {
  var a = card(14, 'star'), b = card(14, 'moon');
  use('fold', [a, b]); assert.strictEqual(a.rank, 2);
  var c = card(14, 'star'), d = card(5, 'moon');
  use('fold', [c, d]); assert.strictEqual(c.rank, 6);
  var e = card(7, 'star'), f = card(14, 'moon');
  var o = use('fold', [e, f]); assert.strictEqual(e.rank, 8);
  assert.strictEqual(o.res.message, 'Folded into an 8 of Stars');
});

test('fold: needs exactly 2 cards', function () {
  assert.strictEqual(reason('fold', []), 'Pick exactly 2 cards to fold.');
  reason('fold', [card(2)]);
  reason('fold', [card(2), card(3), card(4)]);
});

test('tear: splits into floor/ceil halves, same suit, sticker stays on first, new card via makeCard + addCardToHand', function () {
  var a = card(9, 'leaf', 'watercolor');
  var o = use('tear', [a]);
  assert.strictEqual(a.rank, 4); assert.strictEqual(a.suit, 'leaf'); assert.strictEqual(a.sticker, 'watercolor');
  eq(o.api.log, [['make', 5, 'leaf', null], ['toHand', 5, 'leaf', null]]);
  assert.strictEqual(o.api.hand[0].sticker, null);
  assert.ok(/9 of Leaves/.test(o.res.message), o.res.message);
});

test('tear: even value halves; K (13) → 6 and 7; Q (12) → 6 and 6; 10 → 5 and 5', function () {
  var k = card(13, 'star'); var o = use('tear', [k]);
  assert.strictEqual(k.rank, 6); assert.strictEqual(o.api.hand[0].rank, 7);
  var q = card(12, 'moon'); o = use('tear', [q]);
  assert.strictEqual(q.rank, 6); assert.strictEqual(o.api.hand[0].rank, 6);
  var t = card(10, 'moon'); o = use('tear', [t]);
  assert.strictEqual(t.rank, 5); assert.strictEqual(o.api.hand[0].rank, 5);
});

test('tear: a 2 becomes two Aces; a 3 becomes an Ace and a 2', function () {
  var two = card(2, 'bloom', 'glitter'); var o = use('tear', [two]);
  assert.strictEqual(two.rank, 14); assert.strictEqual(o.api.hand[0].rank, 14);
  assert.strictEqual(two.sticker, 'glitter'); assert.strictEqual(o.api.hand[0].suit, 'bloom');
  assert.ok(/two Aces/.test(o.res.message), o.res.message);
  var three = card(3, 'star'); o = use('tear', [three]);
  assert.strictEqual(three.rank, 14); assert.strictEqual(o.api.hand[0].rank, 2);
});

test('tear: an Ace is refused; needs exactly 1 card', function () {
  assert.strictEqual(reason('tear', [card(14, 'star')]), 'An Ace is too small to tear.');
  reason('tear', []);
  reason('tear', [card(5), card(6)]);
});

test('ink letters: 1-3 cards change suit, sticker/rank untouched', function () {
  var map = { ink_star: 'star', ink_moon: 'moon', ink_bloom: 'bloom', ink_leaf: 'leaf' };
  Object.keys(map).forEach(function (id) {
    var cs = [card(3, 'star', 'foil'), card(4, 'moon'), card(5, 'leaf')];
    var o = use(id, cs);
    cs.forEach(function (c) { assert.strictEqual(c.suit, map[id], id); });
    assert.strictEqual(cs[0].sticker, 'foil'); assert.strictEqual(cs[0].rank, 3);
    eq(o.api.log, [], 'no api use');
    reason(id, []);
    reason(id, [card(2), card(3), card(4), card(5)]);
  });
});

test('sticker letters: apply/overwrite sticker; respect max', function () {
  var map = { sticker_graph: ['graph', 2], sticker_watercolor: ['watercolor', 2], sticker_foil: ['foil', 1],
    sticker_glitter: ['glitter', 2], sticker_washi: ['washi', 2], sticker_wax: ['wax', 1] };
  Object.keys(map).forEach(function (id) {
    var sticker = map[id][0], max = map[id][1];
    var cs = [card(3, 'star', 'graph'), card(4, 'moon', null)].slice(0, max);
    use(id, cs);
    cs.forEach(function (c) { assert.strictEqual(c.sticker, sticker, id); });
    reason(id, []);
    var tooMany = [card(2), card(3), card(4)].slice(0, max + 1);
    reason(id, tooMany);
  });
  var one = card(6, 'leaf', 'wax'); use('sticker_foil', [one]); assert.strictEqual(one.sticker, 'foil');
});

test('eraser: destroys 1-2 selected cards', function () {
  var a = card(2), b = card(3);
  var o = use('eraser', [a, b]);
  eq(o.api.log, [['destroy', a.uid], ['destroy', b.uid]]);
  o = use('eraser', [a]); eq(o.api.log, [['destroy', a.uid]]);
  reason('eraser', []); reason('eraser', [a, b, card(4)]);
});

function deckOf(n) { var a = []; for (var i = 0; i < n; i++) a.push(card(2 + (i % 12), 'star')); return a; }

test('deck floor: fold and eraser refuse to leave fewer than 5 cards in the deck', function () {
  var a = card(3), b = card(4);
  // fold destroys one card
  assert.strictEqual(L.fold.canUse(baseState({ deck: deckOf(6) }), [a, b]), true);
  assert.strictEqual(L.fold.canUse(baseState({ deck: deckOf(5) }), [a, b]), 'Your deck is too thin for that.');
  assert.strictEqual(L.fold.canUse(baseState({ deck: deckOf(52) }), [a, b]), true);
  // eraser destroys as many as selected
  assert.strictEqual(L.eraser.canUse(baseState({ deck: deckOf(6) }), [a]), true);
  assert.strictEqual(L.eraser.canUse(baseState({ deck: deckOf(5) }), [a]), 'Your deck is too thin for that.');
  assert.strictEqual(L.eraser.canUse(baseState({ deck: deckOf(6) }), [a, b]), 'Your deck is too thin for that.');
  assert.strictEqual(L.eraser.canUse(baseState({ deck: deckOf(7) }), [a, b]), true);
  // range errors still win
  assert.strictEqual(L.fold.canUse(baseState({ deck: deckOf(5) }), [a]), 'Pick exactly 2 cards to fold.');
  // missing state fields are tolerated
  assert.strictEqual(L.fold.canUse({}, [a, b]), true);
  assert.strictEqual(L.eraser.canUse({}, [a]), true);
  assert.strictEqual(L.eraser.canUse({ phase: 'playing' }, [a]), true);
  assert.strictEqual(L.eraser.canUse(null, [a]), true);
});

test('eraser: while playing, refuses to remove the last sendable card', function () {
  var a = card(3), b = card(4);
  var big = deckOf(52);
  var st = function (hand, pile, phase) { return baseState({ deck: big, phase: phase || 'playing', hand: hand, drawPile: pile }); };
  assert.strictEqual(L.eraser.canUse(st([a.uid], []), [a]), 'You need a card left to send.');
  assert.strictEqual(L.eraser.canUse(st([a.uid, b.uid], []), [a, b]), 'You need a card left to send.');
  assert.strictEqual(L.eraser.canUse(st([a.uid, b.uid], []), [a]), true);
  assert.strictEqual(L.eraser.canUse(st([a.uid], ['x1']), [a]), true, 'draw pile still has a card');
  // only applies during 'playing' (the shop has an empty hand)
  assert.strictEqual(L.eraser.canUse(st([], [], 'shop'), [a]), true);
  // fold never removes the last card (it keeps one)
  assert.strictEqual(L.fold.canUse(st([a.uid, b.uid], []), [a, b]), true);
});

test('carbon: copies rank/suit/sticker into the hand', function () {
  var a = card(11, 'moon', 'glitter');
  var o = use('carbon', [a]);
  eq(o.api.log, [['make', 11, 'moon', 'glitter'], ['toHand', 11, 'moon', 'glitter']]);
  var plain = card(5, 'leaf'); o = use('carbon', [plain]);
  eq(o.api.log, [['make', 5, 'leaf', null], ['toHand', 5, 'leaf', null]]);
  reason('carbon', []); reason('carbon', [a, plain]);
});

test('sharpener: +1 rank; K→A; A→2 wraps', function () {
  var a = card(5), k = card(13), ace = card(14);
  use('sharpener', [a, k]);
  assert.strictEqual(a.rank, 6); assert.strictEqual(k.rank, 14);
  use('sharpener', [ace]); assert.strictEqual(ace.rank, 2);
  var j = card(10); use('sharpener', [j]); assert.strictEqual(j.rank, 11);
  reason('sharpener', []); reason('sharpener', [card(2), card(3), card(4)]);
});

test('allowance: doubles Stamps, capped at +20; 0 cards', function () {
  assert.strictEqual(L.allowance.min, 0); assert.strictEqual(L.allowance.max, 0);
  var o = use('allowance', [], baseState({ stamps: 12 })); eq(o.api.log, [['stamps', 12]]);
  o = use('allowance', [], baseState({ stamps: 20 })); eq(o.api.log, [['stamps', 20]]);
  o = use('allowance', [], baseState({ stamps: 45 })); eq(o.api.log, [['stamps', 20]]);
  o = use('allowance', [], baseState({ stamps: 0 })); eq(o.api.log, [], 'no +0');
});

test('wishing_star: levels up api.mostSentHand()', function () {
  assert.strictEqual(L.wishing_star.min, 0); assert.strictEqual(L.wishing_star.max, 0);
  var o = use('wishing_star', [], baseState(), mkApi({ mostSent: 'flush' }));
  eq(o.api.log, [['level', 'flush', 1]]);
  assert.ok(/Same Stationery/.test(o.res.message), o.res.message);
  o = use('wishing_star', [], baseState(), mkApi());
  eq(o.api.log, [['level', 'pair', 1]]);
});

test('every letter: canUse honours min/max, returns true for in-range selections', function () {
  Object.keys(L).forEach(function (id) {
    var d = L[id];
    var mk = function (n) { var a = []; for (var i = 0; i < n; i++) a.push(card(i === 0 ? 5 : 6, 'star')); return a; };
    assert.strictEqual(d.canUse(baseState(), mk(d.min)), true, id + ' at min');
    assert.strictEqual(d.canUse(baseState(), mk(d.max)), true, id + ' at max');
    if (d.max + 1 <= 6 && d.max > 0) assert.notStrictEqual(d.canUse(baseState(), mk(d.max + 1)), true, id + ' over max');
    if (d.min > 0) assert.notStrictEqual(d.canUse(baseState(), mk(d.min - 1)), true, id + ' under min');
  });
});

/* -------------------------------- report ---------------------------------- */
console.log('\ncontent tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  failures.forEach(function (f) { console.log('  FAIL ' + f); });
  process.exit(1);
}
