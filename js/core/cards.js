/* Midnight Airmail — cards. Contract: DESIGN.md §5.3. No DOM, JSON-only card objects. */
(function (root) {
  'use strict';
  var MA = root.MA = root.MA || {};
  var cards = MA.cards = {};

  cards.SUITS = ['star', 'moon', 'bloom', 'leaf'];

  cards.SUIT_INFO = {
    star:  { name: 'Stars',  glyph: '★', color: '#E0A91F', kind: 'star' },
    moon:  { name: 'Moons',  glyph: '☾', color: '#3A47A8', kind: 'moon' },
    bloom: { name: 'Blooms', glyph: '✿', color: '#E0604B', kind: 'bloom' },
    leaf:  { name: 'Leaves', glyph: '❦', color: '#2F8F5E', kind: 'leaf' }
  };

  cards.RANK_LABEL = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'J', 12: 'Q', 13: 'K', 14: 'A'
  };

  cards.RANK_NAME = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace'
  };

  cards.STICKERS = {
    graph:      { name: 'Graph Paper', text: '{ink|+30 Ink} when scored' },
    watercolor: { name: 'Watercolor',  text: '{glow|+4 Glow} when scored' },
    foil:       { name: 'Gold Foil',   text: '{xglow|×1.5 Glow} when scored' },
    glitter:    { name: 'Glitter',     text: '1 in 4 chance: {glow|+15 Glow} when scored' },
    washi:      { name: 'Washi Tape',  text: '{xglow|×1.5 Glow} while held in hand' },
    wax:        { name: 'Wax Seal',    text: '{stamp|+3 Stamps} if held in hand when the blind is won' }
  };

  cards.makeCard = function (state, rank, suit, sticker) {
    return {
      uid: MA.util.uid(state, 'c'),
      rank: rank,
      suit: suit,
      sticker: sticker || null,
      debuffed: false,
      faceDown: false
    };
  };

  cards.makeDeck = function (state) {
    var deck = [];
    for (var s = 0; s < cards.SUITS.length; s++) {
      for (var r = 2; r <= 14; r++) deck.push(cards.makeCard(state, r, cards.SUITS[s], null));
    }
    return deck;
  };

  /* Ink value: 2-10 = rank, J/Q/K = 10, A = 11. */
  cards.inkValue = function (card) {
    var r = card.rank;
    if (r === 14) return 11;
    if (r >= 11) return 10;
    return r;
  };

  /* Paper value (Fold/Tear): A = 1, 2-10 = rank, J = 11, Q = 12, K = 13. */
  cards.paperValue = function (card) {
    return card.rank === 14 ? 1 : card.rank;
  };

  /* Paper value back to a rank: 1 -> A (14), 2-13 -> same. */
  cards.rankFromPaper = function (v) {
    return v === 1 ? 14 : v;
  };

  cards.isFace = function (card) {
    return card.rank >= 11 && card.rank <= 13;
  };

  cards.describe = function (card) {
    var suit = cards.SUIT_INFO[card.suit];
    var title = (cards.RANK_NAME[card.rank] || String(card.rank)) + ' of ' + (suit ? suit.name : card.suit);
    var lines = ['{ink|+' + cards.inkValue(card) + ' Ink} when scored'];
    if (card.sticker && cards.STICKERS[card.sticker]) {
      var st = cards.STICKERS[card.sticker];
      lines.push(st.name + ': ' + st.text);
    }
    if (card.debuffed) lines.push('Debuffed tonight');
    return { title: title, lines: lines };
  };
})(typeof window !== 'undefined' ? window : globalThis);
