/* Midnight Airmail — Constellations (Planets). Contract: DESIGN.md §4 / §5.7.
   Using one levels up its hand type by 1 (the engine does that, keyed on `hand`).
   The numbers in `text` mirror MA.hands.INFO (+Ink/lvl, +Glow/lvl); tests check they agree. */
(function (root) {
  'use strict';
  var MA = root.MA = root.MA || {};
  MA.content = MA.content || {};

  var list = {};
  function def(id, name, hand, handName, dInk, dGlow, secret) {
    list[id] = {
      id: id, name: name, hand: hand, secret: !!secret,
      text: 'Level up {hand|' + handName + '}: {ink|+' + dInk + ' Ink} and {glow|+' + dGlow + ' Glow}'
    };
  }

  def('polaris',        'Polaris',          'high',          'Lone Star',       10, 1);
  def('gemini',         'Gemini',           'pair',          'Pen Pals',        15, 1);
  def('twin_kites',     'The Twin Kites',   'twopair',       'Double Letters',  20, 1);
  def('orions_belt',    "Orion's Belt",     'three',         'Three Wishes',    20, 2);
  def('milky_way',      'The Milky Way',    'straight',      'Paper Chain',     30, 3);
  def('teapot',         'The Teapot',       'flush',         'Same Stationery', 15, 2);
  def('little_house',   'The Little House', 'fullhouse',     'Full House',      25, 2);
  def('southern_cross', 'The Southern Cross', 'four',        'Four Winds',      30, 3);
  def('comet',          'The Comet',        'straightflush', 'Shooting Star',   40, 4);
  def('pleiades',       'The Pleiades',     'five',          'Carbon Copies',   35, 3, true);
  def('lantern',        'The Lantern',      'flushhouse',    'Lamplit House',   40, 4, true);
  def('firefly',        'The Firefly',      'flushfive',     'Starfall',        50, 3, true);

  MA.content.constellations = list;
})(typeof window !== 'undefined' ? window : globalThis);
