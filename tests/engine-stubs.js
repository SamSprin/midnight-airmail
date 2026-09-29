/* Fallback content used ONLY when js/content/keepsakes.js or letters.js is missing
   (or when the harness is asked to force stubs). Tiny but exercises every engine hook. */
'use strict';

function installKeepsakes(MA) {
  const K = {};
  function add(d) { d.init = d.init || function () { return {}; }; K[d.id] = d; }
  add({ id: 'black_cat', name: 'Black Cat', rarity: 'common', cost: 4, text: '{glow|+4 Glow}', onHand: function (ctx) { ctx.addGlow(4); } });
  add({ id: 'hair_clip', name: 'Yellow Hair Clip', rarity: 'common', cost: 5, text: 'x',
        onCardScored: function (ctx, inst, card) { if (card.suit === 'star') ctx.addGlow(3); } });
  add({ id: 'storybook', name: 'Storybook', rarity: 'common', cost: 5, text: 'x',
        onCardScored: function (ctx, inst, card) { if (card.rank >= 11 && card.rank <= 13) ctx.addInk(30); } });
  add({ id: 'tin_bank', name: 'Tin Piggy Bank', rarity: 'common', cost: 5, text: 'x', onBlindEnd: function () { return 3; } });
  add({ id: 'night_owl', name: 'Night Owl', rarity: 'uncommon', cost: 6, text: 'x', onHand: function (ctx) { if (ctx.isFinalSend) ctx.mulGlow(2); } });
  add({ id: 'telescope', name: 'Telescope', rarity: 'uncommon', cost: 6, text: 'x', passive: { moonSpeed: 2 } });
  add({ id: 'alarm_clock', name: 'Alarm Clock', rarity: 'uncommon', cost: 6, text: 'x', passive: { sends: 1 } });
  add({ id: 'kite', name: 'Kite String', rarity: 'uncommon', cost: 7, text: 'x', passive: { fourFingers: true } });
  add({ id: 'music_box', name: 'Music Box', rarity: 'uncommon', cost: 6, text: 'x',
        retrigger: function (ctx, inst, card) { return card.rank >= 11 && card.rank <= 13 ? 1 : 0; } });
  add({ id: 'diary', name: 'Diary', rarity: 'uncommon', cost: 6, text: 'x', init: function () { return { glow: 0 }; },
        onHandSent: function (ctx, inst) { if (ctx.contains.pair) { inst.data.glow++; ctx.say('Upgraded!'); } },
        onHand: function (ctx, inst) { if (inst.data.glow > 0) ctx.addGlow(inst.data.glow); } });
  add({ id: 'crumpled_note', name: 'Crumpled Note', rarity: 'uncommon', cost: 6, text: 'x', init: function () { return { ink: 0 }; },
        onDiscard: function (s, inst, cards) { inst.data.ink += 3 * cards.length; },
        onHand: function (ctx, inst) { if (inst.data.ink > 0) ctx.addInk(inst.data.ink); } });
  add({ id: 'bookmark', name: 'Bookmark', rarity: 'uncommon', cost: 6, text: 'x', init: function () { return { glow: 0 }; },
        onLetterUsed: function (s, inst) { inst.data.glow += 3; },
        onHand: function (ctx, inst) { if (inst.data.glow > 0) ctx.addGlow(inst.data.glow); } });
  add({ id: 'rooftop_cat', name: 'Rooftop Cat', rarity: 'uncommon', cost: 6, text: 'x',
        onLose: function (state) { return state.roundScore >= 0.25 * state.target; } });
  add({ id: 'paper_sun', name: 'The Paper Sun', rarity: 'rare', cost: 9, text: 'x', init: function () { return { x: 1.5 }; },
        onBlindEnd: function (s, inst, info) { if (info.wasBoss) inst.data.x += 0.25; return 0; },
        onHand: function (ctx, inst) { ctx.mulGlow(inst.data.x); } });
  add({ id: 'rainbow_crayons', name: 'Rainbow Crayons', rarity: 'rare', cost: 8, text: 'x', onCardScored: function (ctx) { ctx.mulGlow(1.1); } });
  MA.content.keepsakes = K;
}

function installLetters(MA) {
  const L = {};
  const pv = function (r) { return r === 14 ? 1 : r; };
  const rp = function (v) { return v === 1 ? 14 : v; };
  function add(d) { L[d.id] = d; d.text = d.text || 'x'; d.canUse = d.canUse || function (s, cards) { return cards.length >= d.min && cards.length <= d.max ? true : 'Pick ' + d.min + '-' + d.max; }; }
  add({ id: 'fold', name: 'Fold', min: 2, max: 2, use: function (s, cards, api) {
    cards[0].rank = rp(Math.min(13, pv(cards[0].rank) + pv(cards[1].rank))); api.destroyCard(cards[1].uid); return { message: 'Folded' }; } });
  add({ id: 'tear', name: 'Tear', min: 1, max: 1,
        canUse: function (s, cards) { return cards.length === 1 && pv(cards[0].rank) >= 2 ? true : 'No'; },
        use: function (s, cards, api) {
          const c = cards[0], v = pv(c.rank);
          c.rank = rp(Math.floor(v / 2));
          api.addCardToHand(api.makeCard(rp(Math.ceil(v / 2)), c.suit, null)); return { message: 'Torn' }; } });
  add({ id: 'ink_star', name: 'Starlight Ink', min: 1, max: 3, use: function (s, cards) { cards.forEach(function (c) { c.suit = 'star'; }); return { message: 'Inked' }; } });
  add({ id: 'sticker_graph', name: 'Graph Paper Sheet', min: 1, max: 2, use: function (s, cards) { cards.forEach(function (c) { c.sticker = 'graph'; }); return { message: 'Stuck' }; } });
  add({ id: 'eraser', name: 'Eraser', min: 1, max: 2, use: function (s, cards, api) { cards.forEach(function (c) { api.destroyCard(c.uid); }); return { message: 'Erased' }; } });
  add({ id: 'carbon', name: 'Carbon Paper', min: 1, max: 1, use: function (s, cards, api) {
    api.addCardToHand(api.makeCard(cards[0].rank, cards[0].suit, cards[0].sticker)); return { message: 'Copied' }; } });
  add({ id: 'sharpener', name: 'Pencil Sharpener', min: 1, max: 2, use: function (s, cards) { cards.forEach(function (c) { c.rank = c.rank === 14 ? 2 : c.rank + 1; }); return { message: 'Sharp' }; } });
  add({ id: 'allowance', name: 'Allowance', min: 0, max: 0, use: function (s, cards, api) { api.addStamps(Math.min(s.stamps, 20)); return { message: 'Doubled' }; } });
  add({ id: 'wishing_star', name: 'Wishing Star', min: 0, max: 0, use: function (s, cards, api) { api.levelUp(api.mostSentHand(), 1); return { message: 'Wished' }; } });
  MA.content.letters = L;
}

module.exports = { installKeepsakes: installKeepsakes, installLetters: installLetters };
