# Midnight Airmail — Design & Contracts

A Balatro-style poker roguelike told as a paper-collage bedtime story. A girl at her lit window
writes letters all night, folds each one into a paper airplane and sends it over the sleeping
town. Every hand you play is a letter. Light enough windows in town before morning.

Reference art: `reference.webp` (project root). Look at it before any visual work.

---------------------------------------------------------------------------------------------------

## 1. Art direction (everyone reads this)

The look is **torn construction paper + marker/crayon texture**, children's-book collage.

- **Torn paper**: every panel, card, label and sky band has irregular torn edges with a thin
  **white fibrous rim** (the paper core showing through) and a soft dark offset shadow.
- **Texture**: flat colours with visible marker/crayon grain (fine noise, faint streaks).
  Nothing glossy, no gradients except soft glows.
- **Hand-drawn detail**: scribbled handwriting lines as a wall texture, dashed flight paths,
  little `+` sparkles, short yellow "shine" dashes around glowing things.
- **Cute faces**: round black dot eyes with a white highlight, pink blush circles, tiny smile.
- **Palette** (from the reference):

| token | hex | used for |
|---|---|---|
| `--sky-1` | `#1B1E5B` | top sky band |
| `--sky-2` | `#222A70` | |
| `--sky-3` | `#2A3584` | |
| `--sky-4` | `#33409A` | lowest sky band |
| `--wall` | `#3E2F74` | purple house wall (sidebar) |
| `--wall-line` | `#57489E` | scribble texture on wall |
| `--roof` | `#1A1F4F` | roof ledge, town houses |
| `--paper` | `#F3EAD3` | cream card paper |
| `--paper-rim` | `#FFFDF6` | torn white rim |
| `--window` | `#F6C445` | lit window yellow |
| `--curtain` | `#EE9294` | pink curtains |
| `--sun` | `#E8795A` | the paper sun, **Glow** colour |
| `--ink` | `#2F5BD3` | blue pencil, **Ink** colour |
| `--sweater` | `#1F9C8C` | teal accents, Send button |
| `--vine` | `#3E8E4E` / leaf `#6CBF5E` | |
| `--sill` | `#D8A76B` | windowsill / hand area |
| `--star` | `#F5CD55` | stars, sparkles |
| `--text-dark` | `#2A2250` | text on paper |

- **Suits** (all from the picture): `star` ★ mustard `#E0A91F`, `moon` ☾ indigo `#3A47A8`,
  `bloom` ✿ coral `#E0604B`, `leaf` ❦ green `#2F8F5E`.
- **Fonts** (Google Fonts, already linked in index.html): display `"Gaegu"` (700) for titles,
  big numbers, card ranks; body `"Mali"` (400/600/700) for all UI text.
  Fallback stack: `"Gaegu", "Mali", "Comic Sans MS", cursive`.
- Single committed dark world (always night). `color-scheme: dark`.

## 2. Vocabulary (Balatro → Midnight Airmail)

| Balatro | Here | notes |
|---|---|---|
| Chips | **Ink** (blue) | |
| Mult | **Glow** (sun coral) | `×Glow` for multiplicative |
| Score | **Light** | Light = floor(Ink × Glow) |
| Money $ | **Stamps** | shown as a little postage stamp icon + number |
| Hand (play) | **Send** ✈ | 4 Sends per blind |
| Discard | **Crumple** | 3 Crumples per blind |
| Ante | **Night** 1–8 | |
| Small blind | **Dusk** | target ×1 |
| Big blind | **Midnight** | target ×1.5 |
| Boss blind | **Visitor** | target ×2, has a curse |
| Final boss | **Daybreak** | Night 8 visitor |
| Jokers | **Keepsakes** | 5 slots |
| Planets | **Constellations** | level up a hand type |
| Tarots | **Letters** | modify cards, 2 consumable slots (shared with constellations) |
| Enhancements | **Stickers** | one per card |
| Booster packs | **Envelope Bundle / Star Chart / Keepsake Box** | |

### Signature mechanics (what makes it not-just-Balatro)
1. **The Moon** — the graph-paper moon waxes one phase per Send, across the whole run:
   `0 New → 1 Crescent → 2 Half → 3 Gibbous → 4 Full → 0 New …`. A hand Sent while the moon
   is **Full** gets a final **×2 Glow** ("Full Moon"). Players plan their big hand for the full
   moon. Keepsakes and visitors interact with it.
2. **Fold & Tear** — paper letters that change card *ranks arithmetically*: Fold merges two
   cards into one whose rank is the sum; Tear rips one card into two halves. Deck sculpting by
   numbers instead of just suits.
3. **The Town is the score bar** — each Send becomes a paper airplane that flies to town and
   lights windows in proportion to Light/target. Clearing the blind lights the whole town.
4. **Dawn creeps in** — the lowest sky band warms toward pink as Nights pass; Daybreak is the
   final visitor.

## 3. Rules

### Cards
- 52-card deck: ranks 2–14 (11 J, 12 Q, 13 K, 14 A) × suits `star, moon, bloom, leaf`.
- **Ink value** of a card: 2–10 = rank, J/Q/K = 10, A = 11.
- **Paper value** (for Fold/Tear only): A = 1, 2–10 = rank, J = 11, Q = 12, K = 13.
  Converting back: 1 → A(14), 2–13 → same rank.
- Face cards: J, Q, K. Card art: J = the black cat, Q = the girl at her window, K = the paper
  sun, A = one big suit cut-out.

### Stickers (enhancements)
| id | name | effect |
|---|---|---|
| `graph` | Graph Paper | +30 Ink when scored |
| `watercolor` | Watercolor | +4 Glow when scored |
| `foil` | Gold Foil | ×1.5 Glow when scored |
| `glitter` | Glitter | 1 in 4 chance: +15 Glow when scored |
| `washi` | Washi Tape | ×1.5 Glow while **held** in hand (not sent) |
| `wax` | Wax Seal | +3 Stamps if held in hand when the blind is won |

### Hand types
Themed name is primary; the poker name is shown small underneath.

| id | name | poker | base Ink | base Glow | +Ink/lvl | +Glow/lvl | scoring cards |
|---|---|---|---|---|---|---|---|
| `high` | Lone Star | High Card | 5 | 1 | 10 | 1 | highest card only |
| `pair` | Pen Pals | Pair | 10 | 2 | 15 | 1 | the 2 |
| `twopair` | Double Letters | Two Pair | 20 | 2 | 20 | 1 | the 4 |
| `three` | Three Wishes | Three of a Kind | 30 | 3 | 20 | 2 | the 3 |
| `straight` | Paper Chain | Straight | 30 | 4 | 30 | 3 | all in the straight |
| `flush` | Same Stationery | Flush | 35 | 4 | 15 | 2 | all in the flush |
| `fullhouse` | Full House | Full House | 40 | 4 | 25 | 2 | all 5 |
| `four` | Four Winds | Four of a Kind | 60 | 7 | 30 | 3 | the 4 |
| `straightflush` | Shooting Star | Straight Flush | 100 | 8 | 40 | 4 | all 5 |
| `five` | Carbon Copies | Five of a Kind | 120 | 12 | 35 | 3 | all 5 |
| `flushhouse` | Lamplit House | Flush House | 140 | 14 | 40 | 4 | all 5 |
| `flushfive` | Starfall | Flush Five | 160 | 16 | 50 | 3 | all 5 |

- Level n values = base + (n−1) × per-level. All start at level 1.
- `five`, `flushhouse`, `flushfive` are **secret**: hidden in run info and their
  constellations don't appear until that hand type has been sent once.
- Straights: 5 consecutive ranks; Ace plays high (10-J-Q-K-A) or low (A-2-3-4-5), no wrap.
- With the **Kite String** keepsake (`fourFingers`), Straights and Flushes need only 4 cards.
- Priority when several match: flushfive > flushhouse > five > straightflush > four >
  fullhouse > flush > straight > three > twopair > pair > high.
- **contains** (for keepsakes like "if hand contains a Pair"): `high` always; `pair` if any
  rank appears ≥2; `twopair` if two different ranks appear ≥2 each (or any four/five);
  `three` if any rank ≥3; `four` if any rank ≥4; `five` if any rank =5; `straight`/`flush`
  if present; `fullhouse` if 3+2; `straightflush`, `flushhouse`, `flushfive` if present.

### Scoring order (engine implements, UI animates the event list)
1. Evaluate hand → type, scoring cards, contains. Base Ink/Glow from hand level.
2. Visitor `modifyBase(ctx)` (e.g. The Hush halves base).
3. Each keepsake `onHandSent(ctx, inst)` left→right (scaling keepsakes grow here).
4. For each **scoring** card in played order: if debuffed → `debuffed` event, skip.
   Otherwise repeat (1 + retriggers) times, where retriggers = sum of keepsake
   `retrigger(ctx, inst, card)`:
   a. +Ink value of card; b. sticker effect (graph/watercolor/foil/glitter);
   c. each keepsake `onCardScored(ctx, inst, card)` left→right.
5. For each card **held** in hand (not played), not debuffed: washi ×1.5 Glow; each keepsake
   `onHeld(ctx, inst, card)`.
6. Each keepsake `onHand(ctx, inst)` left→right (the "independent" effects).
7. If the moon is Full (and the visitor doesn't hide it): ×2 Glow, source `moon`.
8. Light = floor(Ink × Glow). Add to round score.
9. After scoring: moon advances (see §2), visitor `afterSend`.

### Blinds, nights, economy
- Base target per Night: `[300, 800, 2000, 5000, 11000, 20000, 35000, 50000]`.
  Dusk ×1, Midnight ×1.5, Visitor ×2 (Daybreak ×2.5).
- 4 Sends, 3 Crumples, hand size 8, max 5 cards selected, per blind (keepsake passives and
  visitors modify).
- Win the blind the moment round score ≥ target (remaining Sends are not played).
  Lose the run if Sends reach 0 below target (unless the Rooftop Cat saves you).
- Start with 4 Stamps. Reward on win: Dusk 3, Midnight 4, Visitor 5; +1 per unused Send;
  interest +1 per 5 Stamps held (computed before rewards are added), max +5;
  plus keepsake `onBlindEnd` returns and Wax Seal cards held.
- **Skipping**: Dusk and Midnight can be skipped ("Sleep through it"): the player gets a free
  Envelope Bundle or Star Chart (random) opened immediately. Visitors can't be skipped.
- Visitors for Nights 1–7 are drawn at run start from the pool (respecting `minAnte`,
  no repeats). Night 8 is always `daybreak`. Beat Daybreak → victory.

### Shop ("The Corner Stationery Shop") — after every won blind
- 2 single-item slots. Each rolls: 70% keepsake, 15% constellation, 15% letter.
  Keepsake rarity: common 70%, uncommon 25%, rare 5%. Never offer a keepsake you own or one
  already on the shelf.
- 2 pack slots, random from: Envelope Bundle ($4: pick 1 of 3 letters), Star Chart ($4: pick
  1 of 3 constellations), Keepsake Box ($6: pick 1 of 2 keepsakes). Picks may be skipped.
  Constellation picks are applied immediately. Letter picks need a free consumable slot.
  Keepsake picks need a free keepsake slot.
- Reroll: $5, +$1 per reroll this shop visit (resets next shop). Rerolls refresh the 2 single
  slots only.
- Prices: keepsakes per definition; constellations $3; letters $3.
  Sell value: keepsakes floor(cost/2) (min 1); consumables $1.
- Consumables can be used in the shop only if they need 0 selected cards.

## 4. Content lists (ids are contracts — art, content and UI all key off them)

### Keepsakes (32)
`text` uses markup `{kind|text}` where kind ∈ `ink glow xglow stamp star moon bloom leaf hand`.
UI renders it as `<span class="t-kind">text</span>`.

| id | name | rarity | cost | effect |
|---|---|---|---|---|
| `black_cat` | Black Cat | common | 4 | +4 Glow |
| `hair_clip` | Yellow Hair Clip | common | 5 | Scored ★ Stars give +3 Glow |
| `graph_moon` | Graph-Paper Moon | common | 5 | Scored ☾ Moons give +3 Glow |
| `flower_pot` | Flower Pot | common | 5 | Scored ✿ Blooms give +3 Glow |
| `ivy_vine` | Ivy Vine | common | 5 | Scored ❦ Leaves give +3 Glow |
| `pink_curtains` | Pink Curtains | common | 4 | +8 Glow if hand contains Pen Pals |
| `lit_window` | Lit Window | common | 5 | +12 Glow if hand contains Three Wishes |
| `paper_chain` | Paper Garland | common | 5 | +12 Glow if hand contains a Paper Chain |
| `envelope_stack` | Stack of Envelopes | common | 5 | +10 Glow if hand contains Same Stationery |
| `blue_pencil` | Blue Pencil | common | 4 | +50 Ink if hand contains Pen Pals |
| `paper_plane` | Paper Airplane | common | 5 | +25 Ink for each Crumple remaining |
| `ceiling_stars` | Glow-in-the-Dark Stars | common | 5 | Scored 2, 3, 4, 5 give +4 Glow |
| `storybook` | Storybook | common | 5 | Scored face cards give +30 Ink |
| `tin_bank` | Tin Piggy Bank | common | 5 | Earn 3 Stamps at the end of each won blind |
| `nightlight` | Nightlight | common | 4 | +3 Glow for each empty keepsake slot |
| `night_owl` | Night Owl | uncommon | 6 | ×2 Glow on the final Send of a blind |
| `moon_rabbit` | Moon Rabbit | uncommon | 7 | +10 Glow; during a Full Moon ×3 Glow instead |
| `telescope` | Telescope | uncommon | 6 | The moon waxes 2 phases per Send (never skips Full) |
| `crumpled_note` | Crumpled Note | uncommon | 6 | Gains +3 Ink per card crumpled (starts 0) |
| `diary` | Diary | uncommon | 6 | Gains +1 Glow each Send that contains Pen Pals (starts 0) |
| `alarm_clock` | Alarm Clock | uncommon | 6 | +1 Send each blind |
| `kite` | Kite String | uncommon | 7 | Paper Chains and Same Stationery need only 4 cards |
| `music_box` | Music Box | uncommon | 6 | Retrigger each scored face card |
| `warm_sweater` | Teal Sweater | uncommon | 6 | +2 Ink per card left in the draw pile |
| `bouquet` | Bouquet | uncommon | 7 | ×3 Glow if scoring cards include ★ ☾ ✿ and ❦ |
| `wishing_coin` | Wishing Coin | uncommon | 7 | 1 in 2 chance: ×2 Glow |
| `bookmark` | Bookmark | uncommon | 6 | Gains +3 Glow each time you use a Letter (starts 0) |
| `star_map` | Star Map | uncommon | 6 | Gains ×0.2 Glow each time you use a Constellation (starts ×1) |
| `rooftop_cat` | Rooftop Cat | uncommon | 6 | Nine lives: if you'd lose with ≥25% of the target, survive. The cat leaves. |
| `paper_sun` | The Paper Sun | rare | 9 | ×1.5 Glow; gains ×0.25 each time you beat a Visitor |
| `origami_crane` | Origami Crane | rare | 8 | Gains ×0.25 Glow each time you use Fold or Tear (starts ×1) |
| `rainbow_crayons` | Rainbow Crayons | rare | 8 | Each scored card gives ×1.1 Glow |

### Constellations (12) — cost 3, use: level up a hand type by 1
| id | hand | name |
|---|---|---|
| `polaris` | high | Polaris |
| `gemini` | pair | Gemini |
| `twin_kites` | twopair | The Twin Kites |
| `orions_belt` | three | Orion's Belt |
| `milky_way` | straight | The Milky Way |
| `teapot` | flush | The Teapot |
| `little_house` | fullhouse | The Little House |
| `southern_cross` | four | The Southern Cross |
| `comet` | straightflush | The Comet |
| `pleiades` | five | The Pleiades (secret) |
| `lantern` | flushhouse | The Lantern (secret) |
| `firefly` | flushfive | The Firefly (secret) |

### Letters (17) — cost 3
| id | name | select | effect |
|---|---|---|---|
| `fold` | Fold | exactly 2 | Merge into one card: paper value = sum, capped at 13 (K). Keeps the **left** card's suit & sticker; the right card is destroyed. |
| `tear` | Tear | exactly 1 | Paper value v ≥ 2 (not an Ace): becomes two cards floor(v/2) and ceil(v/2), same suit; sticker stays on the first. New card goes to hand and deck. |
| `ink_star` | Starlight Ink | 1–3 | Selected cards become ★ Stars |
| `ink_moon` | Moonlight Ink | 1–3 | → ☾ Moons |
| `ink_bloom` | Pressed Petal | 1–3 | → ✿ Blooms |
| `ink_leaf` | Pressed Leaf | 1–3 | → ❦ Leaves |
| `sticker_graph` | Graph Paper Sheet | 1–2 | apply Graph Paper |
| `sticker_watercolor` | Watercolor Tin | 1–2 | apply Watercolor |
| `sticker_foil` | Gold Foil | 1 | apply Gold Foil |
| `sticker_glitter` | Glitter Glue | 1–2 | apply Glitter |
| `sticker_washi` | Washi Tape | 1–2 | apply Washi Tape |
| `sticker_wax` | Wax Seal | 1 | apply Wax Seal |
| `eraser` | Eraser | 1–2 | Destroy the selected cards (removed from the deck for good) |
| `carbon` | Carbon Paper | exactly 1 | Add an exact copy of the card to your hand and deck |
| `sharpener` | Pencil Sharpener | 1–2 | Raise rank by 1 (K→A, A→2) |
| `allowance` | Allowance | 0 | Double your Stamps (max +20) |
| `wishing_star` | Wishing Star | 0 | Level up your most-sent hand type (ties → higher base; none sent → Pen Pals) |

### Visitors (boss blinds)
| id | name | minAnte | curse |
|---|---|---|---|
| `the_rain` | The Rain | 1 | All ✿ Blooms are soaked (debuffed) |
| `the_frost` | The Frost | 1 | All ❦ Leaves are frozen (debuffed) |
| `the_clouds` | The Clouds | 1 | No Full Moon tonight; ★ Stars are hidden (debuffed) |
| `the_owl` | The Owl | 1 | No Crumples tonight |
| `the_fog` | The Fog | 2 | Face cards are drawn face down |
| `the_wind` | The Wind | 2 | After each Send, 2 random cards in hand blow away |
| `the_draft` | The Draft | 2 | −1 hand size |
| `the_dog` | The Neighbour's Dog | 3 | Can't Send the same hand type twice tonight |
| `the_clock` | The Clock | 3 | Must Send exactly 5 cards |
| `the_hush` | The Hush | 4 | Base Ink and Glow of every hand are halved |
| `daybreak` | Daybreak | finale | Target ×2.5 and the moon has set: no Full Moon |

---------------------------------------------------------------------------------------------------

## 5. Architecture

Plain classic `<script>` files (no modules, no build step, no dependencies) so the game runs
from `file://` and from a static server. Everything hangs off `window.MA`.
`js/core/namespace.js` (already written) defines `MA`, `MA.util`, and seeded RNG helpers.
Code must only touch *other* modules at call time, never at load time, so script order only
matters for namespace.js (first) and main.js (last).

```
index.html                  skeleton DOM + script tags         (lead — already written)
css/style.css               tokens, textures, layout, components   (ART)
css/ui.css                  extra UI-only styles, uses style.css tokens (UI)
js/core/namespace.js        MA, MA.util (lead — already written)
js/core/cards.js            MA.cards      (ENGINE)
js/core/hands.js            MA.hands      (ENGINE)
js/core/scoring.js          MA.scoring    (ENGINE)
js/core/run.js              MA.run        (ENGINE)
js/content/bosses.js        MA.content.bosses          (ENGINE)
js/content/constellations.js MA.content.constellations (ENGINE)
js/content/keepsakes.js     MA.content.keepsakes       (CONTENT)
js/content/letters.js       MA.content.letters         (CONTENT)
js/art/art.js               MA.art        (ART)
js/art/scene.js             MA.scene      (ART)
art-preview.html            gallery of every art asset  (ART)
js/ui/*.js                  MA.ui         (UI)
js/audio.js                 MA.audio      (UI)
js/main.js                  boot          (UI)
tests/run-tests.js          node test runner for engine+content (ENGINE)
```

### 5.1 Data shapes (must stay JSON-serializable — no functions, no DOM in state)

```js
Card = { uid: 'c17', rank: 2..14, suit: 'star'|'moon'|'bloom'|'leaf',
         sticker: null|'graph'|'watercolor'|'foil'|'glitter'|'washi'|'wax',
         debuffed: false, faceDown: false }   // debuffed/faceDown are transient, set by engine

KeepsakeInst = { uid: 'k3', id: 'diary', data: {} }       // data from def.init()
Consumable  = { uid: 'x9', kind: 'letter'|'constellation', id: 'fold' }

RunState = {
  version: 1, seed: 12345, rng: { s: <uint32> },
  phase: 'blindSelect'|'playing'|'cashout'|'shop'|'gameover'|'victory',
  ante: 1, blindIndex: 0,               // 0 Dusk, 1 Midnight, 2 Visitor
  bosses: ['the_rain', ...8 ids],       // index = ante-1; [7] === 'daybreak'
  stamps: 4,
  deck: Card[],                          // every card the player owns
  drawPile: uid[], hand: uid[], played: uid[], discardPile: uid[],
  handSize: 8, maxSends: 4, maxCrumples: 3,     // effective values for current blind
  sendsLeft, crumplesLeft, roundScore, target,
  moonPhase: 0,
  handLevels: { high: {level:1, sent:0}, pair: {...}, ... all 12 },
  sentThisBlind: [handTypeIds],          // for the Dog
  keepsakes: KeepsakeInst[], keepsakeSlots: 5,
  consumables: Consumable[], consumableSlots: 2,
  shop: null | { items: ShopItem[], packs: ShopPack[], rerollCost: 5 },
  pack: null | { kind, choices: [{kind, id}], source: 'shop'|'skip' },  // open pack
  cashout: null | { lines: [{label, amount}], total },
  stats: { handsSent, bestLight, lettersUsed, constellationsUsed, bossesBeaten, cardsCrumpled },
  lastResult: null | ScoreResult,
  log: []                                // optional debug
}
ShopItem = { kind: 'keepsake'|'letter'|'constellation', id, price, sold: false }
ShopPack = { kind: 'envelope'|'starchart'|'keepsakebox', price, sold: false }
```

### 5.2 MA.util (written, in namespace.js)
`MA.util.rand(state)` → float [0,1) advancing `state.rng.s` (mulberry32).
`randInt(state, lo, hi)` inclusive, `pick(state, arr)`, `shuffle(state, arr)` (in place,
returns arr), `chance(state, num, den)` → bool, `uid(state, prefix)`,
`clone(obj)` (JSON deep copy), `clamp(v, lo, hi)`, `format(n)` (1,234 / 1.2e6 formatting),
`markup(text)` → HTML string for `{kind|text}` markup.

### 5.3 MA.cards (ENGINE)
```js
MA.cards.SUITS = ['star','moon','bloom','leaf']
MA.cards.SUIT_INFO = { star: {name:'Stars', glyph:'★', color:'#E0A91F'}, ... }
MA.cards.RANK_LABEL = {2:'2',...,10:'10',11:'J',12:'Q',13:'K',14:'A'}
MA.cards.STICKERS = { graph: {name, text}, ... }   // text uses markup
MA.cards.makeCard(state, rank, suit, sticker=null) → Card (uid from util.uid)
MA.cards.makeDeck(state) → Card[52]
MA.cards.inkValue(card), paperValue(card), rankFromPaper(v), isFace(card)
MA.cards.describe(card) → { title: '7 of Stars', lines: [markup strings] }   // tooltip
```

### 5.4 MA.hands (ENGINE)
```js
MA.hands.ORDER = ['high','pair',...,'flushfive']          // weakest → strongest
MA.hands.INFO = { pair: { name:'Pen Pals', poker:'Pair', ink:10, glow:2, dInk:15, dGlow:1, secret:false }, ... }
MA.hands.evaluate(cards, opts={fourFingers:false}) →
   { type:'pair', scoring: Card[] (subset, in played order), contains: {pair:true, high:true, ...} }
   // empty array → null
MA.hands.values(state, type) → { ink, glow, level }
```

### 5.5 MA.scoring (ENGINE)
```js
MA.scoring.score(state, playedCards, heldCards, opts) → ScoreResult
ScoreResult = {
  handType, level, events: Event[], ink, glow, light, fullMoon: bool,
  scoringUids: [uid], debuffedUids: [uid]
}
Event = { t: 'hand'|'ink'|'glow'|'xglow'|'stamps'|'retrigger'|'debuffed'|'say'|'total',   // Full Moon = 'xglow' with src.kind 'moon'
          amount?: number, text?: string,
          src: { kind:'card'|'held'|'keepsake'|'moon'|'boss'|'hand', uid? },
          ink: <running Ink after this event>, glow: <running Glow after> }
```
`opts.preview = true` → no side effects (no RNG advance, no keepsake data mutation, no
stamps); used for... nothing required, but must not crash.

**Scoring context** passed to keepsake/boss hooks (the contract CONTENT codes against):
```js
ctx = {
  state,                    // RunState (read; hooks may mutate inst.data and state.stamps via ctx)
  handType, contains,       // contains = { pair: true, ... }
  played: Card[], scoring: Card[], held: Card[],
  isFullMoon: bool,         // moon is Full AND not hidden by visitor
  isFinalSend: bool,        // this Send used the last Send (sendsLeft === 0 after decrement)
  ink, glow,                // running values (read only; change them through the methods)
  addInk(n), addGlow(n), mulGlow(x), addStamps(n),
  say(text),                // speech-bubble event from the current source, no numbers
  chance(num, den) → bool,  // seeded; a keepsake's odds
  keepsakes: KeepsakeInst[],
}
```
The engine sets the event `src` automatically for whatever hook/card it is currently running.

### 5.6 Keepsake definition contract (CONTENT writes, ENGINE calls)
```js
MA.content.keepsakes = {            // object keyed by id
  black_cat: {
    id: 'black_cat', name: 'Black Cat', rarity: 'common', cost: 4,
    text: '{glow|+4 Glow}',
    init() { return {}; },                          // → inst.data (JSON only)
    passive: { handSize: 0, sends: 0, crumples: 0, fourFingers: false, moonSpeed: 1 }, // optional, any subset
    onHandSent(ctx, inst) {},                       // before cards score (scaling)
    retrigger(ctx, inst, card) { return 0; },
    onCardScored(ctx, inst, card) {},
    onHeld(ctx, inst, card) {},
    onHand(ctx, inst) { ctx.addGlow(4); },
    onDiscard(state, inst, cards) {},               // after a Crumple
    onBlindStart(state, inst) {},
    onBlindEnd(state, inst, info) { return 0; },    // info = {wasBoss}; return Stamps earned
    onLetterUsed(state, inst, letterId) {},
    onConstellationUsed(state, inst, constId) {},
    onLose(state, inst) { return false; },          // return true to prevent the loss (Rooftop Cat) — engine then removes this keepsake
    status(inst, state) { return ''; }              // current value line, e.g. '(Currently {glow|+6 Glow})'
  }, ...
}
```
All hooks optional. `onBlindEnd` return values show as cash-out lines (label = keepsake name).

### 5.7 Letter & constellation contracts
```js
MA.content.letters = {
  fold: { id, name, text, min: 2, max: 2,
          canUse(state, cards) → true | 'reason',   // cards = selected Card[] in hand order
          use(state, cards, api) → { message } }
}
// api (ENGINE provides): destroyCard(uid), addCardToHand(card), addCardToDeck(card) (to draw pile, shuffled in),
//   makeCard(rank, suit, sticker), levelUp(handType, n=1), addStamps(n), mostSentHand()
MA.content.constellations = { gemini: { id, name, hand: 'pair', text } }  // use = levelUp(hand)
```

### 5.8 Visitor contract (ENGINE)
```js
MA.content.bosses = {
  the_rain: { id, name, text, minAnte: 1, finale: false, targetMult: 2,
    setup(state) {},                    // after limits computed, before first draw
    isDebuffed(card, state) → bool,
    isFaceDown(card, state) → bool,     // checked when a card is drawn
    canPlay(state, cards, evalResult) → true | 'reason',
    modifyBase(ctx) {},
    afterSend(state) → [uids blown away] | void,
    hidesMoon: false }
}
```

### 5.9 MA.run (ENGINE) — the only API the UI mutates state through
```js
newRun(seed?) → state                    // phase 'blindSelect'
blindInfo(state, index=state.blindIndex) → { kind:'dusk'|'midnight'|'boss', name, target,
                                             reward, boss: def|null, canSkip }
startBlind(state) → { drawn: [uid] }     // phase → 'playing', applies passives + boss setup, draws
skipBlind(state) → pack                  // opens a free pack (state.pack), advances blindIndex
getCard(state, uid) → Card
handCards(state) → Card[]
preview(state, uids) → null | { type, name, poker, level, ink, glow, canPlay: true|'reason' }
send(state, uids) → { result: ScoreResult, outcome: 'continue'|'won'|'lost'|'saved',
                      blownAway: [uid], savedBy?: uid }
     // moves cards hand→played→discardPile, does NOT draw. Records stats. On 'won' state.phase
     // stays 'playing' until cashOut is called.
crumple(state, uids) → { ok, reason? }   // does NOT draw
drawToFull(state) → [uid]                // UI calls after send/crumple animations
cashOut(state) → state.cashout           // computes rewards, phase → 'cashout'
collect(state)                           // adds stamps, generates shop, phase → 'shop'
buy(state, slotIndex) → { ok, reason? }  // shop items
buyPack(state, packIndex) → { ok, reason?, pack }
choosePack(state, choiceIndex) → { ok, reason? }; skipPack(state)
reroll(state) → { ok, reason? }
sell(state, uid) → { ok, amount }        // keepsake or consumable
moveKeepsake(state, fromIndex, toIndex)
canUseConsumable(state, uid, selectedUids) → true | 'reason'
useConsumable(state, uid, selectedUids) → { ok, reason?, message }
leaveShop(state)                         // advance blind/ante, phase → 'blindSelect' (or 'victory')
sortHand(state, 'rank'|'suit')
remainingDeck(state) → Card[]            // draw pile contents for the deck viewer
serialize(state) → string; deserialize(str) → state
```
Every mutation returns plain data; the UI never pokes state fields directly.

### 5.10 MA.art (ART) — returns SVG **strings**; deterministic per input (seed from ids/uids)
```js
MA.art.cardSVG(card, {w=100, h=140}) → string     // face; renders sticker overlay; faceDown → back
MA.art.cardBackSVG({w, h})                        // airmail envelope back (red/blue striped border)
MA.art.suitIcon(suit, size=20)
MA.art.keepsakeSVG(id, {w=100, h=140})             // full keepsake card incl. illustration; unknown id → generic
MA.art.letterSVG(id, {w=100, h=140})               // envelope-style consumable card
MA.art.constellationSVG(id, {w=100, h=140})        // dark paper, connected stars, dashed lines
MA.art.bossSVG(id, size=120)                       // round torn-paper emblem with the visitor
MA.art.packSVG(kind, {w=120, h=150})
MA.art.stampIcon(size=18)                          // postage stamp currency icon
MA.art.tornPath(w, h, seed, roughness=3) → 'M…Z'  // torn-rectangle path for any panel
MA.art.planeSVG(size=40)                           // folded paper airplane
MA.art.defs() → string                             // shared <filter>/<pattern> defs; injected once into #svg-defs
```
### 5.11 MA.scene (ART)
```js
MA.scene.mount(el)                  // builds background into #scene
MA.scene.setMoonPhase(0..4, hidden=false)
MA.scene.setProgress(f)             // 0..1+ → lights that share of town windows
MA.scene.flyPlane(fromX, fromY) → Promise   // page coords; flies to town along dashed arc
MA.scene.sunMood('idle'|'happy'|'wow'|'sleepy')
MA.scene.sunPulse(strength=1)       // bounce when Glow changes
MA.scene.setDawn(t 0..1)            // warms the lowest sky band toward sunrise pink
MA.scene.celebrate()                // blind won: all windows lit, stars twinkle burst
```

### 5.12 index.html skeleton (fixed — ART styles it, UI fills it)
```
#app
  #scene                       fixed full-screen background (MA.scene)
  #game.layout                 grid: sidebar | table
    aside#sidebar              the purple house wall with the vine
      #blind-panel             current blind: name, target, reward (visitor emblem on boss)
      #score-panel             the LIT WINDOW (yellow, pink curtains): round score
      #hand-panel              hand name + level, then [Ink box] × [Glow box]
      #counters-panel          Sends, Crumples, Stamps, Night x/8, blind x/3
      #sidebar-buttons         Run info, Options
    main#table
      #top-row
        #keepsakes.slots       keepsake cards (up to 5) — pinned to a string
        #consumables.slots     consumables (up to 2)
      #stage                   centre: played cards / blind select / cash-out / shop
      #hand-area               the WINDOWSILL (tan)
        #hand                  hand of cards (fan)
        #hand-controls         Send, sort Rank/Suit, Crumple
      #deck-pile               envelope stack + count
  #overlay                     modals (run info, pack opening, game over, victory, title)
  #tooltip
  svg#svg-defs
```
**Component classes** ART provides in style.css, UI uses: `.paper` (cream torn panel),
`.paper-dark` (navy torn panel), `.label` (small taped label), `.tape` (washi tape strip,
modifiers `.tape-teal .tape-pink .tape-gold`), `.btn` + `.btn-send .btn-crumple .btn-plain
.btn-gold` (+ `:disabled`), `.card` (wrapper for a card SVG; states `.selected .scoring
.debuffed .facedown .dealing .jiggle`), `.keepsake` (`.jiggle`, `.dragging`), `.consumable`,
`.slot-empty`, `.price-tag`, `.t-ink .t-glow .t-xglow .t-stamp .t-star .t-moon .t-bloom
.t-leaf .t-hand` (markup spans), `.pop` (floating score pop, modifiers `.pop-ink .pop-glow
.pop-xglow .pop-stamp .pop-say`), `.ink-box`, `.glow-box`, `.counter`, `.tooltip`,
`.modal`, `.banner`.
CSS custom property `--card-w` (default 96px; card height = 1.4×) scales all cards.

### 5.13 Responsive
Desktop landscape is primary (≥1100px). At ≤900px the sidebar becomes a compact top strip
and `--card-w` shrinks; at ~400px everything must still fit without horizontal scroll
(hand cards overlap more). Respect `prefers-reduced-motion`.
