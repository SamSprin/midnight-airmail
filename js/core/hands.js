/* Midnight Airmail — hand evaluation. Contract: DESIGN.md §5.4 and §3 (Hand types). */
(function (root) {
  'use strict';
  var MA = root.MA = root.MA || {};
  var hands = MA.hands = {};

  /* Weakest -> strongest. Priority when several match is simply this list reversed. */
  hands.ORDER = ['high', 'pair', 'twopair', 'three', 'straight', 'flush', 'fullhouse',
                 'four', 'straightflush', 'five', 'flushhouse', 'flushfive'];

  function info(id, name, poker, ink, glow, dInk, dGlow, secret) {
    return { id: id, name: name, poker: poker, ink: ink, glow: glow, dInk: dInk, dGlow: dGlow, secret: !!secret };
  }

  hands.INFO = {
    high:          info('high',          'Lone Star',        'High Card',       5,   1,  10, 1),
    pair:          info('pair',          'Pen Pals',         'Pair',            10,  2,  15, 1),
    twopair:       info('twopair',       'Double Letters',   'Two Pair',        20,  2,  20, 1),
    three:         info('three',         'Three Wishes',     'Three of a Kind', 30,  3,  20, 2),
    straight:      info('straight',      'Paper Chain',      'Straight',        30,  4,  30, 3),
    flush:         info('flush',         'Same Stationery',  'Flush',           35,  4,  15, 2),
    fullhouse:     info('fullhouse',     'Full House',       'Full House',      40,  4,  25, 2),
    four:          info('four',          'Four Winds',       'Four of a Kind',  60,  7,  30, 3),
    straightflush: info('straightflush', 'Shooting Star',    'Straight Flush',  100, 8,  40, 4),
    five:          info('five',          'Carbon Copies',    'Five of a Kind',  120, 12, 35, 3, true),
    flushhouse:    info('flushhouse',    'Lamplit House',    'Flush House',     140, 14, 40, 4, true),
    flushfive:     info('flushfive',     'Starfall',         'Flush Five',      160, 16, 50, 3, true)
  };

  /* Keep only the cards of `all` that appear in `subset`, in the order of `all`. */
  function inOrder(all, subset) {
    return all.filter(function (c) { return subset.indexOf(c) !== -1; });
  }

  /* Longest run of consecutive ranks (Ace counts low or high, no wraparound).
     Returns one card per rank of the run, in played order, or null if the run is shorter than `need`. */
  function findStraight(cards, need) {
    var byRank = {};
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (!byRank[c.rank]) byRank[c.rank] = c;
      if (c.rank === 14 && !byRank[1]) byRank[1] = c;
    }
    var best = null, run = [];
    for (var r = 1; r <= 14; r++) {
      if (byRank[r]) {
        run.push(byRank[r]);
        if (!best || run.length > best.length) best = run.slice();
      } else {
        run = [];
      }
    }
    if (!best || best.length < need) return null;
    return inOrder(cards, best);
  }

  /* cards: Card[] (1..5), opts: { fourFingers } -> { type, scoring, contains } or null. */
  hands.evaluate = function (cards, opts) {
    if (!cards || !cards.length) return null;
    var need = (opts && opts.fourFingers) ? 4 : 5;
    var i, c;

    var byRank = {}, bySuit = {};
    for (i = 0; i < cards.length; i++) {
      c = cards[i];
      (byRank[c.rank] = byRank[c.rank] || []).push(c);
      (bySuit[c.suit] = bySuit[c.suit] || []).push(c);
    }
    var groups = Object.keys(byRank).map(function (r) { return { rank: +r, cards: byRank[r] }; });
    groups.sort(function (a, b) { return b.cards.length - a.cards.length || b.rank - a.rank; });
    var top = groups[0].cards.length;
    var second = groups.length > 1 ? groups[1].cards.length : 0;

    var suitKeys = Object.keys(bySuit);
    var flushCards = null, fullSuit = false;
    for (i = 0; i < suitKeys.length; i++) {
      var sc = bySuit[suitKeys[i]];
      if (sc.length >= need && (!flushCards || sc.length > flushCards.length)) flushCards = sc;
      if (sc.length >= 5) fullSuit = true;   // five cards of one suit
    }

    var straightCards = findStraight(cards, need);
    var sfCards = null;
    for (i = 0; i < suitKeys.length; i++) {
      if (bySuit[suitKeys[i]].length < need) continue;
      var s = findStraight(bySuit[suitKeys[i]], need);
      if (s && (!sfCards || s.length > sfCards.length)) sfCards = s;
    }

    var isFive = top >= 5;
    var isFour = top >= 4;
    var isThree = top >= 3;
    var isPair = top >= 2;
    var isTwoPair = second >= 2 || top >= 4;
    var isFull = top >= 3 && second >= 2;

    var contains = {
      high: true,
      pair: isPair,
      twopair: isTwoPair,
      three: isThree,
      straight: !!straightCards,
      flush: !!flushCards,
      fullhouse: isFull,
      four: isFour,
      straightflush: !!sfCards,
      five: isFive,
      flushhouse: isFull && fullSuit,
      flushfive: isFive && fullSuit
    };

    var type, scoring;
    if (contains.flushfive) { type = 'flushfive'; scoring = cards.slice(); }
    else if (contains.flushhouse) { type = 'flushhouse'; scoring = cards.slice(); }
    else if (isFive) { type = 'five'; scoring = cards.slice(); }
    else if (sfCards) { type = 'straightflush'; scoring = sfCards; }
    else if (isFour) { type = 'four'; scoring = groups[0].cards.slice(0, 4); }
    else if (isFull) { type = 'fullhouse'; scoring = cards.slice(); }
    else if (flushCards) { type = 'flush'; scoring = flushCards; }
    else if (straightCards) { type = 'straight'; scoring = straightCards; }
    else if (isThree) { type = 'three'; scoring = groups[0].cards.slice(0, 3); }
    else if (second >= 2) {
      type = 'twopair';
      scoring = inOrder(cards, groups[0].cards.concat(groups[1].cards));
    }
    else if (isPair) { type = 'pair'; scoring = groups[0].cards.slice(0, 2); }
    else {
      type = 'high';
      var hi = cards[0];
      for (i = 1; i < cards.length; i++) if (cards[i].rank > hi.rank) hi = cards[i];
      scoring = [hi];
    }
    return { type: type, scoring: inOrder(cards, scoring), contains: contains };
  };

  /* Level-adjusted base values of a hand type for this run. */
  hands.values = function (state, type) {
    var inf = hands.INFO[type];
    var lv = (state.handLevels && state.handLevels[type] && state.handLevels[type].level) || 1;
    return { ink: inf.ink + (lv - 1) * inf.dInk, glow: inf.glow + (lv - 1) * inf.dGlow, level: lv };
  };
})(typeof window !== 'undefined' ? window : globalThis);
