/* Midnight Airmail — Visitors (boss blinds). Contract: DESIGN.md §4 / §5.8.
   Text uses the {kind|text} markup. No DOM, no load-time dependency on other modules. */
(function (root) {
  'use strict';
  var MA = root.MA = root.MA || {};
  MA.content = MA.content || {};

  var bosses = {};
  function def(d) {
    d.finale = !!d.finale;
    d.targetMult = d.targetMult || 2;
    d.hidesMoon = !!d.hidesMoon;
    bosses[d.id] = d;
    return d;
  }

  function suitCurse(id, name, minAnte, suit, kind, plural, verb, flavor) {
    return def({
      id: id, name: name, minAnte: minAnte,
      text: 'All {' + kind + '|' + plural + '} are ' + verb + ' (debuffed)',
      flavor: flavor,
      isDebuffed: function (card) { return card.suit === suit; }
    });
  }

  suitCurse('the_rain', 'The Rain', 1, 'bloom', 'bloom', '✿ Blooms', 'soaked',
    'Pitter-patter on the roof, and the petals are far too soggy to shine.');
  suitCurse('the_frost', 'The Frost', 1, 'leaf', 'leaf', '❦ Leaves', 'frozen',
    'A sparkly chill creeps over the glass and tucks the leaves in tight.');

  def({
    id: 'the_clouds', name: 'The Clouds', minAnte: 1,
    text: 'No Full Moon tonight; {star|★ Stars} are hidden (debuffed)',
    flavor: 'A fluffy grey blanket covers the moon and tiptoes over the stars.',
    hidesMoon: true,
    isDebuffed: function (card) { return card.suit === 'star'; }
  });

  def({
    id: 'the_owl', name: 'The Owl', minAnte: 1,
    text: 'No Crumples tonight',
    flavor: 'Hoo-hoo! The owl says every letter deserves to be sent, not scrunched.',
    setup: function (state) {
      state.crumplesLeft = 0;
      state.maxCrumples = 0;
    }
  });

  def({
    id: 'the_fog', name: 'The Fog', minAnte: 2,
    text: 'Face cards are drawn face down',
    flavor: 'A soft fog rolls in, and the tall cards tiptoe away to hide.',
    isFaceDown: function (card) { return card.rank >= 11 && card.rank <= 13; }
  });

  def({
    id: 'the_wind', name: 'The Wind', minAnte: 2,
    text: 'After each Send, 2 random cards in hand blow away',
    flavor: 'Whoosh! A playful wind tickles the windowsill and tosses the letters about.',
    afterSend: function (state) {
      var pool = state.hand.slice();
      var out = [];
      for (var n = 0; n < 2 && pool.length; n++) {
        var i = Math.floor(MA.util.rand(state) * pool.length);
        out.push(pool.splice(i, 1)[0]);
      }
      return out;
    }
  });

  def({
    id: 'the_draft', name: 'The Draft', minAnte: 2,
    text: '−1 hand size',
    flavor: 'Somebody left the window open, and one little letter slipped away.',
    setup: function (state) {
      state.handSize = Math.max(1, state.handSize - 1);
    }
  });

  def({
    id: 'the_dog', name: "The Neighbour's Dog", minAnte: 3,
    text: "Can't Send the same hand type twice tonight",
    flavor: 'The neighbour’s dog barks at anything it has heard before.',
    canPlay: function (state, cards, ev) {
      if (!ev || !state.sentThisBlind || state.sentThisBlind.indexOf(ev.type) === -1) return true;
      /* Never soft-lock the player: with no Crumples (or nothing left to draw) and no other
         hand type available anywhere in the hand, the Dog lets a repeat through. */
      if ((state.crumplesLeft <= 0 || state.drawPile.length === 0) && !hasFreshHandType(state)) return true;
      var name = MA.hands && MA.hands.INFO[ev.type] ? MA.hands.INFO[ev.type].name : ev.type;
      return "The Neighbour's Dog barks: you already sent " + name + ' tonight.';
    }
  });

  /* Is there any 1-5 card selection in the hand whose hand type hasn't been sent tonight? */
  function hasFreshHandType(state) {
    var cards = [];
    for (var i = 0; i < state.hand.length; i++) {
      var c = MA.run.getCard(state, state.hand[i]);
      if (c) cards.push(c);
    }
    var n = Math.min(cards.length, 12);
    var four = MA.scoring.hasFourFingers(state);
    for (var mask = 1; mask < (1 << n); mask++) {
      var pick = [];
      for (var b = 0; b < n; b++) if (mask & (1 << b)) pick.push(cards[b]);
      if (pick.length > 5) continue;
      var ev = MA.hands.evaluate(pick, { fourFingers: four });
      if (state.sentThisBlind.indexOf(ev.type) === -1) return true;
    }
    return false;
  }

  def({
    id: 'the_clock', name: 'The Clock', minAnte: 3,
    text: 'Must Send exactly 5 cards',
    flavor: 'Tick, tock. The old clock will only listen to a full handful of five.',
    canPlay: function (state, cards) {
      /* If fewer than 5 cards are left in hand, sending all of them is the best it can ask for. */
      if (cards.length !== Math.min(5, state.hand.length)) return 'The Clock ticks: you must send exactly 5 cards tonight.';
      return true;
    }
  });

  def({
    id: 'the_hush', name: 'The Hush', minAnte: 4,
    text: 'Base {ink|Ink} and {glow|Glow} of every hand are halved',
    flavor: 'Shhh. The whole town is asleep, so even the letters must whisper.',
    modifyBase: function (ctx) {
      var newInk = Math.max(1, Math.floor(ctx.ink / 2));
      var newGlow = Math.max(1, Math.floor(ctx.glow / 2));
      ctx.addInk(newInk - ctx.ink);
      ctx.addGlow(newGlow - ctx.glow);
    }
  });

  def({
    id: 'daybreak', name: 'Daybreak', minAnte: 8, finale: true, targetMult: 2.5,
    text: 'Target ×2.5 and the moon has set: no Full Moon',
    flavor: 'The sky turns pink, the moon yawns and sets. One last letter before morning.',
    hidesMoon: true
  });

  MA.content.bosses = bosses;
})(typeof window !== 'undefined' ? window : globalThis);
