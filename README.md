# King's Crown

**Play:** https://kbiben29-hue.github.io/king-crown/

A learn-to-play app for **The Old King's Crown** (Pablo Clark / Eerie Idol Games). It's an unofficial fan project.
You play a real game against the computer with the real cards, and a coach explains each step the first time it comes up.

- **All four factions:** the Nobility, the Clans, the Uprising and the Gathering. That's each faction's 14-card deck, its five
  Site of Power cards, its four Tactics and its Kingdom's Favour action.
- **All 51 base-game Kingdom Cards**, the real Location rewards and the three Councils.
- **Every season and step from the rulebook:**
  - Start of the Year: draw, Attrition and turn order.
  - Spring: Bids and the Great Road, Heralds, face-down cards by Region, Supporters and Spring Actions.
  - Summer: Clash order, then Reveal → Day → Night → Tally → claim a Location, plus Herald Rewards and ties.
  - Autumn: Govern, Journey, Rally, Deploy, Councils and Actions.
  - Winter: Winter effects and cleanup.
- **All Commands:** Ambush, Retreat, Flank, Rally, Deploy and Deadly. **All Traits:** Resilient, Invulnerable and Pathfinder.
- Tap any card to see the real card and what it does. **Rules** has a one-page overview, **Log** explains everything that
  happened, and **Browse the cards** shows every card.
- **Game lengths:** practice year (1 Round), quick (3), short (4) or standard (5).

Not in yet: the Wild Kingdom expansion and the Simulacrum solo mode. Both are in `data/tokc-cards.json`.

## Card data

Card text and art © Eerie Idol Games. The art is loaded at run time from the
[Eerie Card Library](https://library.eerieidolgames.com/) and isn't stored in this repo.

```bash
curl -o /tmp/raw.json https://cards.eerieidolgames.com/cards.min.json
python3 tools/decode-library.py /tmp/raw.json data/tokc-cards.json   # every TOKC card, readable JSON
python3 tools/build-cards.py                                         # → js/cards.js (what the game uses)
```

Some abilities are only printed on the card art, such as the Agents' Night text and a few Site of Power cards.
Those are filled in by hand in `IMAGE_TEXT` in `tools/build-cards.py`.

## Running it

There's no build step: plain HTML and ES modules.

```bash
npm start        # python3 -m http.server 8000, then open http://localhost:8000
npm test         # 300 computer-vs-computer games (2–4 players); checks no card or Supporter goes missing
```

Every push to `main` runs the test and publishes to GitHub Pages (`.github/workflows/pages.yml`).
To set it up once, go to Settings → Pages → Source: **GitHub Actions**.
