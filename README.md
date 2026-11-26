# King's Crown

**Play:** https://kbiben29-hue.github.io/king-crown/

A learn-to-play app for **The Old King's Crown** (Pablo Clark / Eerie Idol Games). It's an unofficial fan project.
You play a real game against the computer, and a coach explains each step the first time it comes up.

- Every season and step from the rulebook: Start of the Year (draw and Attrition, turn order), Spring (Bids
  and the Great Road, Heralds, face-down cards by Region, Supporters), Summer (Clash order, Reveal → Day → Night →
  Tally → claim a Location, Herald Rewards, ties), Autumn (Govern, Journey, Site of Power, Councils) and Winter.
- Councils of Relics, Secrets and Oaths, and the Castle's council wipe.
- Commands: Ambush, Retreat and Deadly. Traits: Resilient, Invulnerable and Pathfinder.
- Tap any card, Location, Council or Kingdom Card to see what it does. **Rules** has a one-page overview and **Log**
  explains everything that happened.
- Game lengths: practice year (1 Round), quick (3), short (4) or standard (5).

## Stand-in cards

The real card text isn't in the repo yet. The **card values are made up** so the game flow can be practised: faction
card Strengths, Votes and Lore, Location rewards, Site of Power cards and Kingdom Cards. All of them live in
`js/data.js` and are marked `standIn: true`. The faction-specific Decree, Collaborator, Tactics and Kingdom's Favour
Actions aren't in yet, and neither are Flank, Rally or Deploy.

## Running it

There's no build step: plain HTML and ES modules.

```bash
npm start        # python3 -m http.server 8000, then open http://localhost:8000
npm test         # 300 computer-vs-computer games; checks no cards or Supporters go missing
```

Every push to `main` runs the test and publishes to GitHub Pages (`.github/workflows/pages.yml`).
To set it up once, go to Settings → Pages → Source: **GitHub Actions**.
