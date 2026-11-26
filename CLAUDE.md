# CLAUDE.md

King's Crown is a learn-to-play app for The Old King's Crown. It's plain HTML with ES modules and has no build
step or dependencies. It's a sibling of Argaia, Holodeck and Afterlife, but deliberately has no build step.

- `js/data.js` holds the factions, Regions/Locations, starter deck, Site of Power, Kingdom Cards and Councils. Card
  values marked `standIn: true` are placeholders until the real card list arrives.
- `js/engine.js` is the `Game` class. The whole game is one async script (`run()` → `startOfYear/spring/summer/autumn/winter`).
  Every decision goes through `io.ask(pi, prompt)`: a prompt has a `key`, a `text` and either `options` [{id,label,sub}]
  or `cards` [uid] (optional → may answer null). `io.coach(key)` shows a tip (only for human players when `pi` is passed),
  and `io.beat(text)` pauses on a reveal.
- `js/ai.js` holds `aiAnswer(pi, prompt, s, game)`, which handles every prompt key. It must only use public info plus its own hand.
- `js/ui.js` is the phone-first UI (render from state, event delegation via `data-act`). `js/coach.js` and
  `js/rules.js` are the teaching text, in our own words.
- `npm test` (`test/sim.mjs`) runs bot-vs-bot games for 2–4 players and checks that all 19 cards and 5 Supporters
  per player are accounted for. Every new prompt key needs an `aiAnswer` case.
