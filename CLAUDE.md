# CLAUDE.md

King's Crown is a learn-to-play app for The Old King's Crown (base game) using the real cards. It's plain HTML with ES
modules and has no build step or dependencies. It's a sibling of Argaia, Holodeck and Afterlife, but deliberately has no build step.

- `data/tokc-cards.json` is the full decoded Eerie Card Library export. `tools/build-cards.py` turns it into `js/cards.js`
  (`CARDS.factions/kingdom/tactics/favour/map/councils`). Ability text that's only on the card art goes in `IMAGE_TEXT`.
- `js/data.js` holds factions, Regions/Locations (with their reward `fx`), Councils, archetype names and GAME constants.
- `js/engine.js` is the `Game` class. The whole game is one async script (`run()` → `startOfYear/spring/summer/autumn/winter`).
  - Decisions go through `this.choose(pi, text, options)` (options `{id,label,sub,score}`), `this.pick(pi, text, cards, {ai, optional})`
    and `this.yes(...)`. These all go through `io.ask`. `score` and `ai` are hints for the computer player.
  - Optional things in Spring, Day and Autumn are all listed in one action menu, `actions(p, step, rid)`, which is fed by
    `springKingdom`, `dayActions`, `autumnActions`, `tacticRun` and `kfOptions`. Kingdom Card actions are once per Round (`p.used`).
  - Card abilities are looked up through `traits(c, rid)`, `cmds(c, rid)`, `arch`, `votesOf`, `loreOf` and `textIs(c, id, rid)`.
    Those helpers handle gained abilities (Kingdom Cards, HQs, Tactics) and blanking (Poisoner's Ball, Guerrilla Fighters).
    `c.tmp` lasts the Round and `c.ctmp` lasts the Clash.
  - Regions: `cards` [{card, up, used}], `sup`/`fresh` Supporters, `ks` (Kingdom Cards placed there), `bonus`, `martial`.
- `js/ai.js` holds `aiAnswer`, a generic chooser (highest option score + noise, card `ai` hints, plus Region planning for card placement).
- `img/icons/*.svg` are the official symbols (from the library's icon font, `tools/extract-icons.py`). In ui.js use `ic(name)`:
  mono icons render as CSS masks so they take the text colour, and spring/day/night/autumn/winter are full-colour images.
- `js/morph.js` patches the DOM in place (keyed by data-uid / data-l / data-k), so pictures aren't re-created on every update. Always render through `morph`; using innerHTML for the game makes the screen flicker.
- `js/ui.js` is the board UI. It renders from state: the opponent, Great Road, Councils, the Map (Location art tiles, with card columns beside
  each Region), your board, and a fixed dock with a fanned hand and stats bar. `targets()` maps the current prompt onto the board
  (tiles, rows, road, Councils, opponent slots). Hand cards drag onto `[data-drop]` targets (`row:rid`, `bid`, `council:id`, `any`)
  using pointer events; tapping a card opens a detail sheet with the action buttons. For people, `place` answers `{uid, rid}`. `js/coach.js` and `js/rules.js`
  are the teaching text, in our own words.
- Every file is loaded with a `?v=N` cache-buster (index.html and all js imports). Run `python3 tools/bump-version.py` before each push,
  or phones keep the old files (GitHub Pages caches for ~10 minutes and Safari can mix old and new modules).
- `npm test` (`test/sim.mjs`) runs bot-vs-bot games for 2–4 players and checks that all 19 cards per player, 5 Supporters
  per player and 51 Kingdom Cards are accounted for.
