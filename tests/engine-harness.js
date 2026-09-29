/* Engine test harness: loads the game scripts into a vm context (window = context global),
   plus tiny helpers, test-only keepsake doubles, and fallback stubs if CONTENT files are missing. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const CORE = [
  'js/core/namespace.js', 'js/core/cards.js', 'js/core/hands.js', 'js/core/scoring.js', 'js/core/run.js',
  'js/content/bosses.js', 'js/content/constellations.js'
];
const OPTIONAL = ['js/content/keepsakes.js', 'js/content/letters.js'];

/* opts.forceStubs: use the built-in stubs even if the real content exists. */
function load(opts) {
  opts = opts || {};
  const ctx = vm.createContext({ console: console });
  ctx.window = ctx;
  const info = { loaded: [], missing: [], stubbed: [] };
  function runFile(rel) {
    const file = path.join(ROOT, rel);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
    info.loaded.push(rel);
  }
  CORE.forEach(runFile);
  OPTIONAL.forEach(function (rel) {
    const exists = fs.existsSync(path.join(ROOT, rel));
    if (exists && !opts.forceStubs) { runFile(rel); } else { info.missing.push(rel); }
  });
  const MA = ctx.MA;
  const stubs = require('./engine-stubs.js');
  if (!MA.content.keepsakes) { stubs.installKeepsakes(MA); info.stubbed.push('keepsakes'); }
  if (!MA.content.letters) { stubs.installLetters(MA); info.stubbed.push('letters'); }
  return { MA: MA, ctx: ctx, info: info };
}

/* ---- tiny test framework ---- */
const results = { pass: 0, fail: 0, failures: [] };
function test(name, fn) {
  try { fn(); results.pass++; }
  catch (e) {
    results.fail++;
    results.failures.push({ name: name, error: e });
    console.log('  FAIL  ' + name + '\n        ' + String(e && e.stack ? e.stack : e).split('\n').slice(0, 6).join('\n        '));
  }
}
function section(title) { console.log('\n' + title); }

/* Cross-realm safe deep equality. */
function eq(actual, expected, msg) {
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected), msg);
}
function near(actual, expected, msg, eps) {
  assert.ok(Math.abs(actual - expected) < (eps || 1e-9), (msg || 'near') + ': ' + actual + ' vs ' + expected);
}

/* ---- card notation: '7s' '10m' 'Kb' 'Al'  (s=star m=moon b=bloom l=leaf) ---- */
const SUIT_CODE = { s: 'star', m: 'moon', b: 'bloom', l: 'leaf' };
const RANK_CODE = { J: 11, Q: 12, K: 13, A: 14 };
function parseCard(code) {
  const suit = SUIT_CODE[code.slice(-1)];
  const r = code.slice(0, -1);
  const rank = RANK_CODE[r] || parseInt(r, 10);
  if (!suit || !rank) throw new Error('bad card code ' + code);
  return { rank: rank, suit: suit };
}
/* Free-standing cards (not in any deck) for hands/scoring unit tests. */
function cardsFrom(MA, state, codes) {
  return codes.map(function (c) {
    const p = parseCard(c);
    return MA.cards.makeCard(state, p.rank, p.suit, null);
  });
}
/* Turn the first N cards of the live hand into the given codes (keeps the deck conserved). */
function setHand(MA, state, codes) {
  const live = MA.run.handCards(state);
  if (codes.length > live.length) throw new Error('hand too small');
  codes.forEach(function (code, i) {
    const p = parseCard(code);
    live[i].rank = p.rank; live[i].suit = p.suit; live[i].sticker = null;
  });
  return live.slice(0, codes.length);
}
function uidsOf(cards) { return cards.map(function (c) { return c.uid; }); }

/* ---- test-only keepsake doubles (ids t_*), independent of the real content ---- */
function installTestKeepsakes(MA) {
  const K = MA.content.keepsakes = MA.content.keepsakes || {};
  MA.__log = [];
  function add(d) { d.name = d.name || d.id; d.rarity = d.rarity || 'common'; d.cost = d.cost || 4; d.text = d.text || ''; d.init = d.init || function () { return {}; }; K[d.id] = d; }
  function logger(id) {
    add({
      id: id,
      onHandSent: function (ctx, inst) { MA.__log.push(id + ':sent'); },
      retrigger: function (ctx, inst, card) { MA.__log.push(id + ':retrig'); return 0; },
      onCardScored: function (ctx, inst, card) { MA.__log.push(id + ':card'); },
      onHeld: function (ctx, inst, card) { MA.__log.push(id + ':held'); },
      onHand: function (ctx, inst) { MA.__log.push(id + ':hand'); }
    });
  }
  logger('t_log_a'); logger('t_log_b');
  add({ id: 't_glow4', onHand: function (ctx) { ctx.addGlow(4); } });
  add({ id: 't_clip', onCardScored: function (ctx, inst, card) { if (card.suit === 'star') ctx.addGlow(3); } });
  add({ id: 't_music', retrigger: function (ctx, inst, card) { return card.rank >= 11 && card.rank <= 13 ? 1 : 0; } });
  add({ id: 't_held', onHeld: function (ctx, inst, card) { ctx.addInk(2); } });
  add({ id: 't_final', onHand: function (ctx) { MA.__final = ctx.isFinalSend; } });
  add({ id: 't_saver', onLose: function () { return true; } });
  add({ id: 't_grow', init: function () { return { n: 0 }; },
        onHandSent: function (ctx, inst) { inst.data.n++; ctx.addStamps(2); ctx.chance(1, 2); } });
  add({ id: 't_sends', passive: { sends: 1 } });
  add({ id: 't_hand', passive: { handSize: 2 } });
  add({ id: 't_crumples', passive: { crumples: 1 } });
  add({ id: 't_kite', passive: { fourFingers: true } });
  add({ id: 't_tele', passive: { moonSpeed: 2 } });
  add({ id: 't_end', onBlindEnd: function () { return 2; } });
  add({ id: 't_zero', onBlindEnd: function () { return 0; } });
  add({ id: 't_cheap', cost: 1 });
  add({ id: 't_dear', cost: 9 });
  add({ id: 't_letter_seen', init: function () { return { seen: [] }; },
        onLetterUsed: function (state, inst, id) { inst.data.seen.push(id); },
        onConstellationUsed: function (state, inst, id) { inst.data.seen.push('c:' + id); },
        onDiscard: function (state, inst, cards) { inst.data.seen.push('d:' + cards.length); },
        onBlindStart: function (state, inst) { inst.data.seen.push('start'); } });
  return K;
}

module.exports = {
  ROOT: ROOT, load: load, test: test, section: section, results: results,
  eq: eq, near: near, assert: assert, cardsFrom: cardsFrom, setHand: setHand, uidsOf: uidsOf,
  parseCard: parseCard, installTestKeepsakes: installTestKeepsakes
};
