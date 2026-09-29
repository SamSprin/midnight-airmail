/* Midnight Airmail — the 32 Keepsakes (Jokers). Contract: DESIGN.md §5.6.
   Pure content: no dependency on MA.cards / MA.run. Hooks change the score only through
   the ctx methods (addInk / addGlow / mulGlow / addStamps / say / chance). */
(function (root) {
  'use strict';
  var MA = root.MA = root.MA || {};
  MA.content = MA.content || {};

  var defs = {};
  function def(d) { defs[d.id] = d; return d; }

  /* ---- tiny local helpers (no engine dependency) ---- */
  function isFace(card) { return card.rank >= 11 && card.rank <= 13; }
  function round2(x) { return Math.round(x * 100) / 100; }
  function fmt(n) { return String(round2(n)); }   // 1.75 -> '1.75', 1.5 -> '1.5', 2 -> '2'

  /* Common shape: "Scored <suit> give +3 Glow". */
  function suitGlow(id, name, cost, suit, kind, plural, flavor) {
    return def({
      id: id, name: name, rarity: 'common', cost: cost,
      text: 'Scored {' + kind + '|' + plural + '} give {glow|+3 Glow}',
      flavor: flavor,
      init: function () { return {}; },
      onCardScored: function (ctx, inst, card) {
        if (card.suit === suit) ctx.addGlow(3);
      }
    });
  }

  /* Common shape: "+N Glow / Ink if the hand contains <type>". */
  function containsBonus(id, name, cost, handKey, amount, isInk, text, flavor) {
    return def({
      id: id, name: name, rarity: 'common', cost: cost, text: text, flavor: flavor,
      init: function () { return {}; },
      onHand: function (ctx) {
        if (ctx.contains && ctx.contains[handKey]) {
          if (isInk) ctx.addInk(amount); else ctx.addGlow(amount);
        }
      }
    });
  }

  /* ================================= COMMON ================================= */

  def({
    id: 'black_cat', name: 'Black Cat', rarity: 'common', cost: 4,
    text: '{glow|+4 Glow}',
    flavor: 'Sits on the roof, counting planes.',
    init: function () { return {}; },
    onHand: function (ctx) { ctx.addGlow(4); }
  });

  suitGlow('hair_clip', 'Yellow Hair Clip', 5, 'star', 'star', '★ Stars',
    'Holds back her hair and one small sunbeam.');
  suitGlow('graph_moon', 'Graph-Paper Moon', 5, 'moon', 'moon', '☾ Moons',
    'Drawn on graph paper, so it stays perfectly round.');
  suitGlow('flower_pot', 'Flower Pot', 5, 'bloom', 'bloom', '✿ Blooms',
    'Waters itself with a little moonlight.');
  suitGlow('ivy_vine', 'Ivy Vine', 5, 'leaf', 'leaf', '❦ Leaves',
    'Climbs one more brick every night.');

  containsBonus('pink_curtains', 'Pink Curtains', 4, 'pair', 8, false,
    '{glow|+8 Glow} if hand contains {hand|Pen Pals}',
    'Peeks out for every pair of pen pals.');
  containsBonus('lit_window', 'Lit Window', 5, 'three', 12, false,
    '{glow|+12 Glow} if hand contains {hand|Three Wishes}',
    'Glows brighter when three wishes are made.');
  containsBonus('paper_chain', 'Paper Garland', 5, 'straight', 12, false,
    '{glow|+12 Glow} if hand contains a {hand|Paper Chain}',
    'Links every sleepy house together.');
  containsBonus('envelope_stack', 'Stack of Envelopes', 5, 'flush', 10, false,
    '{glow|+10 Glow} if hand contains {hand|Same Stationery}',
    'All the same cream, all waiting to be sent.');
  containsBonus('blue_pencil', 'Blue Pencil', 4, 'pair', 50, true,
    '{ink|+50 Ink} if hand contains {hand|Pen Pals}',
    'Worn to a stub from writing to friends.');

  def({
    id: 'paper_plane', name: 'Paper Airplane', rarity: 'common', cost: 5,
    text: '{ink|+25 Ink} for each Crumple remaining',
    flavor: 'Every spare sheet is a plane waiting to happen.',
    init: function () { return {}; },
    onHand: function (ctx) {
      var n = ctx.state.crumplesLeft || 0;
      if (n > 0) ctx.addInk(25 * n);
    },
    status: function (inst, state) {
      // Outside a blind crumplesLeft is stale, so show the full-Crumples value instead.
      var n = state && state.phase === 'playing'
        ? (state.crumplesLeft || 0)
        : (state && state.maxCrumples != null ? state.maxCrumples : 3);
      return '(Currently {ink|+' + (25 * n) + ' Ink})';
    }
  });

  def({
    id: 'ceiling_stars', name: 'Glow-in-the-Dark Stars', rarity: 'common', cost: 5,
    text: 'Scored 2, 3, 4, 5 give {glow|+4 Glow}',
    flavor: 'Stuck up there with a very small ladder.',
    init: function () { return {}; },
    onCardScored: function (ctx, inst, card) {
      if (card.rank >= 2 && card.rank <= 5) ctx.addGlow(4);
    }
  });

  def({
    id: 'storybook', name: 'Storybook', rarity: 'common', cost: 5,
    text: 'Scored face cards give {ink|+30 Ink}',
    flavor: 'The cat, the girl and the sun all say hello.',
    init: function () { return {}; },
    onCardScored: function (ctx, inst, card) {
      if (isFace(card)) ctx.addInk(30);
    }
  });

  def({
    id: 'tin_bank', name: 'Tin Piggy Bank', rarity: 'common', cost: 5,
    text: 'Earn {stamp|3 Stamps} at the end of each won blind',
    flavor: 'Rattles softly when the night goes well.',
    init: function () { return {}; },
    onBlindEnd: function () { return 3; }
  });

  def({
    id: 'nightlight', name: 'Nightlight', rarity: 'common', cost: 4,
    text: '{glow|+3 Glow} for each empty keepsake slot',
    flavor: 'Keeps the empty corners from feeling lonely.',
    init: function () { return {}; },
    onHand: function (ctx) {
      var s = ctx.state;
      var empty = (s.keepsakeSlots || 0) - (s.keepsakes ? s.keepsakes.length : 0);
      if (empty > 0) ctx.addGlow(3 * empty);
    },
    status: function (inst, state) {
      var empty = state ? Math.max(0, (state.keepsakeSlots || 0) - (state.keepsakes ? state.keepsakes.length : 0)) : 0;
      return '(Currently {glow|+' + (3 * empty) + ' Glow})';
    }
  });

  /* ================================ UNCOMMON ================================ */

  def({
    id: 'night_owl', name: 'Night Owl', rarity: 'uncommon', cost: 6,
    text: '{xglow|×2 Glow} on the final Send of a blind',
    flavor: 'Saves its loudest hoot for the last letter.',
    init: function () { return {}; },
    onHand: function (ctx) {
      if (ctx.isFinalSend) ctx.mulGlow(2);
    }
  });

  def({
    id: 'moon_rabbit', name: 'Moon Rabbit', rarity: 'uncommon', cost: 7,
    text: '{glow|+10 Glow}; during a Full Moon {xglow|×3 Glow} instead',
    flavor: 'Bounces highest when the moon is round.',
    init: function () { return {}; },
    onHand: function (ctx) {
      if (ctx.isFullMoon) ctx.mulGlow(3); else ctx.addGlow(10);
    }
  });

  def({
    id: 'telescope', name: 'Telescope', rarity: 'uncommon', cost: 6,
    text: 'The moon waxes 2 phases per Send (never skips Full)',
    flavor: 'Nudges the moon along to bedtime.',
    init: function () { return {}; },
    passive: { moonSpeed: 2 }
  });

  def({
    id: 'crumpled_note', name: 'Crumpled Note', rarity: 'uncommon', cost: 6,
    text: 'Gains {ink|+3 Ink} per card crumpled (starts 0)',
    flavor: 'Every paper ball taught it something.',
    init: function () { return { ink: 0 }; },
    onDiscard: function (state, inst, cards) {
      var n = cards ? cards.length : 0;
      if (n > 0) inst.data.ink = (inst.data.ink || 0) + 3 * n;
    },
    onHand: function (ctx, inst) {
      if (inst.data.ink > 0) ctx.addInk(inst.data.ink);
    },
    status: function (inst) { return '(Currently {ink|+' + (inst.data.ink || 0) + ' Ink})'; }
  });

  def({
    id: 'diary', name: 'Diary', rarity: 'uncommon', cost: 6,
    text: 'Gains {glow|+1 Glow} each Send that contains {hand|Pen Pals} (starts 0)',
    flavor: 'Remembers every pen pal, pressed flat.',
    init: function () { return { glow: 0 }; },
    onHandSent: function (ctx, inst) {
      if (ctx.contains && ctx.contains.pair) {
        inst.data.glow = (inst.data.glow || 0) + 1;
        ctx.say('Upgraded!');
      }
    },
    onHand: function (ctx, inst) {
      if (inst.data.glow > 0) ctx.addGlow(inst.data.glow);
    },
    status: function (inst) { return '(Currently {glow|+' + (inst.data.glow || 0) + ' Glow})'; }
  });

  def({
    id: 'alarm_clock', name: 'Alarm Clock', rarity: 'uncommon', cost: 6,
    text: '+1 Send each blind',
    flavor: 'Rings once more before the sun comes up.',
    init: function () { return {}; },
    passive: { sends: 1 }
  });

  def({
    id: 'kite', name: 'Kite String', rarity: 'uncommon', cost: 7,
    text: '{hand|Paper Chains} and {hand|Same Stationery} need only 4 cards',
    flavor: 'Four fingers hold on just as tightly.',
    init: function () { return {}; },
    passive: { fourFingers: true }
  });

  def({
    id: 'music_box', name: 'Music Box', rarity: 'uncommon', cost: 6,
    text: 'Retrigger each scored face card',
    flavor: 'Sings the tall cards a second verse.',
    init: function () { return {}; },
    retrigger: function (ctx, inst, card) { return isFace(card) ? 1 : 0; }
  });

  def({
    id: 'warm_sweater', name: 'Teal Sweater', rarity: 'uncommon', cost: 6,
    text: '{ink|+2 Ink} per card left in the draw pile',
    flavor: 'Grows warmer with every card still waiting.',
    init: function () { return {}; },
    onHand: function (ctx) {
      var n = ctx.state.drawPile ? ctx.state.drawPile.length : 0;
      if (n > 0) ctx.addInk(2 * n);
    },
    status: function (inst, state) {
      // Outside a blind the draw pile is leftover from the last one, so show nothing.
      if (!state || state.phase !== 'playing') return '';
      var n = state.drawPile ? state.drawPile.length : 0;
      return '(Currently {ink|+' + (2 * n) + ' Ink})';
    }
  });

  def({
    id: 'bouquet', name: 'Bouquet', rarity: 'uncommon', cost: 7,
    text: '{xglow|×3 Glow} if scoring cards include {star|★} {moon|☾} {bloom|✿} and {leaf|❦}',
    flavor: 'A little of every corner of the sky.',
    init: function () { return {}; },
    onHand: function (ctx) {
      var seen = {};
      var sc = ctx.scoring || [];
      for (var i = 0; i < sc.length; i++) {
        if (!sc[i].debuffed) seen[sc[i].suit] = true;
      }
      if (seen.star && seen.moon && seen.bloom && seen.leaf) ctx.mulGlow(3);
    }
  });

  def({
    id: 'wishing_coin', name: 'Wishing Coin', rarity: 'uncommon', cost: 7,
    text: '1 in 2 chance: {xglow|×2 Glow}',
    flavor: 'Heads, a wish. Tails, a wish tomorrow.',
    init: function () { return {}; },
    onHand: function (ctx) {
      if (ctx.chance(1, 2)) ctx.mulGlow(2); else ctx.say('Nope!');
    }
  });

  def({
    id: 'bookmark', name: 'Bookmark', rarity: 'uncommon', cost: 6,
    text: 'Gains {glow|+3 Glow} each time you use a Letter (starts 0)',
    flavor: 'Keeps her place in every letter.',
    init: function () { return { glow: 0 }; },
    onLetterUsed: function (state, inst) { inst.data.glow = (inst.data.glow || 0) + 3; },
    onHand: function (ctx, inst) {
      if (inst.data.glow > 0) ctx.addGlow(inst.data.glow);
    },
    status: function (inst) { return '(Currently {glow|+' + (inst.data.glow || 0) + ' Glow})'; }
  });

  def({
    id: 'star_map', name: 'Star Map', rarity: 'uncommon', cost: 6,
    text: 'Gains {xglow|×0.2 Glow} each time you use a Constellation (starts ×1)',
    flavor: 'Gets bigger with every constellation found.',
    init: function () { return { x: 1 }; },
    onConstellationUsed: function (state, inst) { inst.data.x = round2((inst.data.x || 1) + 0.2); },
    onHand: function (ctx, inst) {
      if (inst.data.x > 1) ctx.mulGlow(inst.data.x);
    },
    status: function (inst) { return '(Currently {xglow|×' + fmt(inst.data.x || 1) + ' Glow})'; }
  });

  def({
    id: 'rooftop_cat', name: 'Rooftop Cat', rarity: 'uncommon', cost: 6,
    text: "Nine lives: if you'd lose with at least 25% of the target, survive. The cat leaves.",
    flavor: 'Nine lives, and happy to lend one.',
    init: function () { return {}; },
    onLose: function (state) { return state.roundScore >= 0.25 * state.target; }
  });

  /* ================================== RARE ================================== */

  def({
    id: 'paper_sun', name: 'The Paper Sun', rarity: 'rare', cost: 9,
    text: '{xglow|×1.5 Glow}; gains {xglow|×0.25} each time you beat a Visitor',
    flavor: 'Grins wider after every visitor goes home.',
    init: function () { return { x: 1.5 }; },
    onBlindEnd: function (state, inst, info) {
      if (info && info.wasBoss) inst.data.x = round2((inst.data.x || 1.5) + 0.25);
      return 0;
    },
    onHand: function (ctx, inst) {
      if (inst.data.x > 1) ctx.mulGlow(inst.data.x);
    },
    status: function (inst) { return '(Currently {xglow|×' + fmt(inst.data.x || 1.5) + ' Glow})'; }
  });

  def({
    id: 'origami_crane', name: 'Origami Crane', rarity: 'rare', cost: 8,
    text: 'Gains {xglow|×0.25 Glow} each time you use Fold or Tear (starts ×1)',
    flavor: 'Folded a thousand times, still hopeful.',
    init: function () { return { x: 1 }; },
    onLetterUsed: function (state, inst, letterId) {
      if (letterId === 'fold' || letterId === 'tear') inst.data.x = round2((inst.data.x || 1) + 0.25);
    },
    onHand: function (ctx, inst) {
      if (inst.data.x > 1) ctx.mulGlow(inst.data.x);
    },
    status: function (inst) { return '(Currently {xglow|×' + fmt(inst.data.x || 1) + ' Glow})'; }
  });

  def({
    id: 'rainbow_crayons', name: 'Rainbow Crayons', rarity: 'rare', cost: 8,
    text: 'Each scored card gives {xglow|×1.1 Glow}',
    flavor: 'Colors outside the lines, and everyone claps.',
    init: function () { return {}; },
    onCardScored: function (ctx) { ctx.mulGlow(1.1); }
  });

  MA.content.keepsakes = defs;
})(typeof window !== 'undefined' ? window : globalThis);
