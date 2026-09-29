/* Midnight Airmail — the 17 Letters (Tarots). Contract: DESIGN.md §5.7.
   Letters may mutate live Card fields (rank / suit / sticker) on the selected cards.
   Creating or destroying cards, levelling hands and Stamps go through `api` only. */
(function (root) {
  'use strict';
  var MA = root.MA = root.MA || {};
  MA.content = MA.content || {};

  var letters = {};
  function def(d) { letters[d.id] = d; return d; }

  /* ---- tiny local helpers (no dependency on MA.cards) ---- */
  var RANK_LABEL = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  var SUIT_NAME = { star: 'Stars', moon: 'Moons', bloom: 'Blooms', leaf: 'Leaves' };
  var STICKER_NAME = {
    graph: 'Graph Paper', watercolor: 'Watercolor', foil: 'Gold Foil',
    glitter: 'Glitter', washi: 'Washi Tape', wax: 'Wax Seal'
  };
  var HAND_NAME = {
    high: 'Lone Star', pair: 'Pen Pals', twopair: 'Double Letters', three: 'Three Wishes',
    straight: 'Paper Chain', flush: 'Same Stationery', fullhouse: 'Full House', four: 'Four Winds',
    straightflush: 'Shooting Star', five: 'Carbon Copies', flushhouse: 'Lamplit House', flushfive: 'Starfall'
  };

  function paperValue(rank) { return rank === 14 ? 1 : rank; }
  function rankFromPaper(v) { return v === 1 ? 14 : v; }
  function rankLabel(rank) { return RANK_LABEL[rank] || String(rank); }
  function article(rank) { var l = rankLabel(rank); return (l === '8' || l === 'A') ? 'an' : 'a'; }
  function cardName(card) { return rankLabel(card.rank) + ' of ' + (SUIT_NAME[card.suit] || card.suit); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  /* Shared canUse for "pick between min and max cards" letters. */
  function rangeCheck(cards, min, max, reason) {
    var n = cards ? cards.length : 0;
    return (n >= min && n <= max) ? true : reason;
  }

  /* Deck floor: a run never drops below 5 owned cards. Tolerates missing state fields. */
  var DECK_FLOOR = 5;
  function deckTooThin(state, removing) {
    return !!(state && Array.isArray(state.deck) && state.deck.length - removing < DECK_FLOOR);
  }
  /* While playing, at least one card must remain to send (hand + draw pile). */
  function noCardsLeft(state, removing) {
    return !!(state && state.phase === 'playing' && Array.isArray(state.hand) && Array.isArray(state.drawPile) &&
      state.hand.length + state.drawPile.length - removing < 1);
  }

  /* ================================ Fold & Tear ================================ */

  def({
    id: 'fold', name: 'Fold',
    text: 'Merge 2 cards into one: rank is the sum (max {hand|K}). Keeps the left card’s suit and sticker.',
    flavor: 'Two small letters, folded into one big one.',
    min: 2, max: 2,
    canUse: function (state, cards) {
      var r = rangeCheck(cards, 2, 2, 'Pick exactly 2 cards to fold.');
      if (r !== true) return r;
      if (deckTooThin(state, 1)) return 'Your deck is too thin for that.';   // fold destroys one card
      return true;
    },
    use: function (state, cards, api) {
      var left = cards[0], right = cards[1];
      var sum = Math.min(13, paperValue(left.rank) + paperValue(right.rank));
      left.rank = rankFromPaper(sum);
      api.destroyCard(right.uid);
      return { message: 'Folded into ' + article(left.rank) + ' ' + cardName(left) };
    }
  });

  def({
    id: 'tear', name: 'Tear',
    text: 'Rip 1 card into two halves of its value, same suit (odd values split unevenly). Not an Ace.',
    flavor: 'One big letter, torn into two little ones.',
    min: 1, max: 1,
    canUse: function (state, cards) {
      var r = rangeCheck(cards, 1, 1, 'Pick exactly 1 card to tear.');
      if (r !== true) return r;
      if (paperValue(cards[0].rank) < 2) return 'An Ace is too small to tear.';
      return true;
    },
    use: function (state, cards, api) {
      var card = cards[0];
      var v = paperValue(card.rank);
      var lo = Math.floor(v / 2), hi = Math.ceil(v / 2);
      var original = cardName(card);
      card.rank = rankFromPaper(lo);                       // first half keeps its sticker
      var half = api.makeCard(rankFromPaper(hi), card.suit, null);
      api.addCardToHand(half);
      var a = rankLabel(card.rank), b = rankLabel(half.rank);
      var tail = card.rank === half.rank
        ? 'two ' + (a === 'A' ? 'Aces' : a + 's')
        : article(card.rank) + ' ' + a + ' and ' + article(half.rank) + ' ' + b;
      return { message: 'Tore the ' + original + ' into ' + tail };
    }
  });

  /* ================================== Inks ==================================== */

  function inkLetter(id, name, suit, kind, glyphName, flavor) {
    return def({
      id: id, name: name,
      text: 'Turn 1 to 3 cards into {' + kind + '|' + glyphName + '}',
      flavor: flavor,
      min: 1, max: 3,
      canUse: function (state, cards) {
        return rangeCheck(cards, 1, 3, 'Pick 1 to 3 cards to recolor.');
      },
      use: function (state, cards) {
        for (var i = 0; i < cards.length; i++) cards[i].suit = suit;
        return { message: plural(cards.length, 'card') + ' turned into ' + SUIT_NAME[suit] };
      }
    });
  }
  inkLetter('ink_star', 'Starlight Ink', 'star', 'star', '★ Stars', 'Still wet, and sparkling a little.');
  inkLetter('ink_moon', 'Moonlight Ink', 'moon', 'moon', '☾ Moons', 'Smells faintly of sleepy blue.');
  inkLetter('ink_bloom', 'Pressed Petal', 'bloom', 'bloom', '✿ Blooms', 'Found between two pages of a diary.');
  inkLetter('ink_leaf', 'Pressed Leaf', 'leaf', 'leaf', '❦ Leaves', 'Kept flat since last autumn.');

  /* ================================= Stickers ================================== */

  function stickerLetter(id, name, sticker, max, effectText, flavor) {
    return def({
      id: id, name: name,
      text: 'Apply ' + effectText + ' to ' + (max === 1 ? '1 card' : '1 to ' + max + ' cards'),
      flavor: flavor,
      min: 1, max: max,
      canUse: function (state, cards) {
        return rangeCheck(cards, 1, max,
          max === 1 ? 'Pick exactly 1 card.' : 'Pick 1 to ' + max + ' cards.');
      },
      use: function (state, cards) {
        for (var i = 0; i < cards.length; i++) cards[i].sticker = sticker;   // overwrites any old sticker
        return { message: STICKER_NAME[sticker] + ' added to ' + plural(cards.length, 'card') };
      }
    });
  }
  stickerLetter('sticker_graph', 'Graph Paper Sheet', 'graph', 2, '{ink|Graph Paper}', 'Every square is a tiny window.');
  stickerLetter('sticker_watercolor', 'Watercolor Tin', 'watercolor', 2, '{glow|Watercolor}', 'Paints the whole page with a wet dawn.');
  stickerLetter('sticker_foil', 'Gold Foil', 'foil', 1, '{xglow|Gold Foil}', 'Saved from a very fancy chocolate.');
  stickerLetter('sticker_glitter', 'Glitter Glue', 'glitter', 2, '{glow|Glitter}', 'It gets everywhere, and nobody minds.');
  stickerLetter('sticker_washi', 'Washi Tape', 'washi', 2, '{xglow|Washi Tape}', 'Holds the letter down until morning.');
  stickerLetter('sticker_wax', 'Wax Seal', 'wax', 1, '{stamp|Wax Seal}', 'Pressed with the warm end of a candle.');

  /* ================================ Deck tools ================================= */

  def({
    id: 'eraser', name: 'Eraser',
    text: 'Destroy 1 or 2 selected cards (removed from the deck for good)',
    flavor: 'Rubs out mistakes, and sometimes cards.',
    min: 1, max: 2,
    canUse: function (state, cards) {
      var r = rangeCheck(cards, 1, 2, 'Pick 1 or 2 cards to erase.');
      if (r !== true) return r;
      if (deckTooThin(state, cards.length)) return 'Your deck is too thin for that.';
      if (noCardsLeft(state, cards.length)) return 'You need a card left to send.';
      return true;
    },
    use: function (state, cards, api) {
      for (var i = 0; i < cards.length; i++) api.destroyCard(cards[i].uid);
      return { message: 'Erased ' + plural(cards.length, 'card') + ' for good' };
    }
  });

  def({
    id: 'carbon', name: 'Carbon Paper',
    text: 'Add an exact copy of 1 card to your hand and deck',
    flavor: 'Press hard, and the words come out twice.',
    min: 1, max: 1,
    canUse: function (state, cards) {
      return rangeCheck(cards, 1, 1, 'Pick exactly 1 card to copy.');
    },
    use: function (state, cards, api) {
      var c = cards[0];
      var copy = api.makeCard(c.rank, c.suit, c.sticker || null);
      api.addCardToHand(copy);
      return { message: 'Copied the ' + cardName(c) };
    }
  });

  def({
    id: 'sharpener', name: 'Pencil Sharpener',
    text: 'Raise the rank of 1 or 2 cards by 1 ({hand|K} to {hand|A}, {hand|A} to 2)',
    flavor: 'A fresh point, and one step taller.',
    min: 1, max: 2,
    canUse: function (state, cards) {
      return rangeCheck(cards, 1, 2, 'Pick 1 or 2 cards to sharpen.');
    },
    use: function (state, cards) {
      for (var i = 0; i < cards.length; i++) {
        cards[i].rank = cards[i].rank >= 14 ? 2 : cards[i].rank + 1;
      }
      return { message: plural(cards.length, 'card') + ' sharpened up one rank' };
    }
  });

  /* ============================== No-selection letters ========================= */

  def({
    id: 'allowance', name: 'Allowance',
    text: 'Double your {stamp|Stamps} (max +20)',
    flavor: 'Grandma slips a little extra into the envelope.',
    min: 0, max: 0,
    canUse: function () { return true; },
    use: function (state, cards, api) {
      var gain = Math.min(Math.max(state.stamps || 0, 0), 20);
      if (gain > 0) api.addStamps(gain);
      return { message: gain > 0 ? 'Your Stamps grew by ' + gain : 'No Stamps to double yet' };
    }
  });

  def({
    id: 'wishing_star', name: 'Wishing Star',
    text: 'Level up your most-sent hand type (none sent: {hand|Pen Pals})',
    flavor: 'Make a wish on the one you love to send.',
    min: 0, max: 0,
    canUse: function () { return true; },
    use: function (state, cards, api) {
      var type = api.mostSentHand();
      api.levelUp(type, 1);
      return { message: (HAND_NAME[type] || 'Your favourite hand') + ' leveled up' };
    }
  });

  MA.content.letters = letters;
})(typeof window !== 'undefined' ? window : globalThis);
