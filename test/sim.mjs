// Plays many computer-vs-computer games with the real cards (and random Wild Kingdom modules)
// to check the rules engine never gets stuck and never loses a card, Supporter or Boon.
import { Game } from '../js/engine.js?v=15';
import { aiAnswer } from '../js/ai.js?v=15';
import { FACTIONS } from '../js/data.js?v=15';

const N = +(process.argv[2] || 200);
const wins = {}; let steps = 0;
const fids = FACTIONS.map((f) => f.id);
for (let g = 0; g < N; g++) {
  const n = g % 7 === 6 ? 4 : g % 5 === 4 ? 3 : 2;
  const factions = Array.from({ length: n }, (_, k) => fids[(g + k) % 4]);
  const wk = g % 2 ? { cards: (g * 7) % 16, night: g % 3 === 0, aeronauts: g % 4 !== 1, legendary: g % 5 !== 2, tower: g % 3 !== 2 } : {};
  const game = new Game({ seed: g + 1, factions, humans: factions.map(() => false), wk }, {
    ask: (pi, prompt, s, gm) => {
      if (++steps > 3e7) throw new Error('runaway');
      const a = aiAnswer(pi, prompt, s, gm);
      if (prompt.options && !prompt.options.some((o) => o.id === a)) throw new Error(`bad answer ${a} to ${prompt.key}`);
      if (prompt.cards && !(prompt.optional && a == null) && !prompt.cards.includes(a)) throw new Error(`bad card ${a} to ${prompt.key}: ${prompt.text}`);
      return a;
    },
  });
  let r;
  try { r = await game.run(); } catch (e) { console.error(`game ${g} (seed ${g + 1}, ${factions}, ${JSON.stringify(wk)}) round ${game.s.round} ${game.s.step}`); throw e; }
  const s = game.s;
  // every faction card must be in exactly one place
  const seen = new Map();
  const put = (c, where) => { if (seen.has(c.uid)) throw new Error(`game ${g}: ${c.name} is in ${seen.get(c.uid)} and ${where}`); seen.set(c.uid, where); };
  for (const p of s.players) {
    for (const [z, list] of Object.entries({ hand: p.hand, deck: p.deck, discard: p.discard, site: p.site, hq: p.hq, lsupply: p.lsupply })) list.forEach((c) => put(c, z));
    p.slots.forEach((sl) => sl && sl.occ && put(sl.occ, 'slot'));
  }
  s.lost.forEach((c) => put(c, 'lost')); s.burned.filter((c) => c.faction).forEach((c) => put(c, 'burned'));
  Object.values(s.councils).flat().forEach((e) => put(e.card, 'council'));
  Object.values(s.regions).forEach((R) => R.cards.forEach((x) => put(x.card, 'region')));
  s.aeroDeck.forEach((c) => put(c, 'aeroDeck')); if (s.aeroBox) put(s.aeroBox, 'box');
  if (seen.size !== game.allFaction.length) throw new Error(`game ${g}: ${seen.size} of ${game.allFaction.length} faction cards found`);
  for (const p of s.players) {
    const sup = p.supporters + p.lostSup + p.burnedSup + Object.values(s.regions).reduce((a, R) => a + (R.sup[p.i] || 0), 0);
    if (sup !== 5) throw new Error(`game ${g}: ${p.name} has ${sup} Supporters`);
    if (p.inf < 0) throw new Error('negative influence');
  }
  const kc = s.kdeck.length + s.kdiscard.length + s.road.filter(Boolean).length + s.burned.filter((c) => !c.faction && c.k).length
    + s.players.reduce((a, p) => a + p.slots.filter(Boolean).length + p.ksupply.length, 0)
    + Object.values(s.regions).reduce((a, R) => a + R.ks.length, 0) + Object.values(s.locKs).reduce((a, l) => a + l.length, 0);
  if (kc !== game.kingdomTotal) throw new Error(`game ${g}: ${kc} of ${game.kingdomTotal} Kingdom Cards`);
  if (s.tower) {
    const boons = s.boonStack.length + s.boonDiscard.length + s.tower.entrance.length + s.tower.lab.length + s.tower.pin.length
      + s.players.reduce((a, p) => a + p.boons.length, 0) + game.allFaction.reduce((a, c) => a + (c.boons ? c.boons.length : 0), 0);
    if (boons !== 20) throw new Error(`game ${g}: ${boons} Boons`);
  }
  const w = s.players[r.winner].short; wins[w] = (wins[w] || 0) + 1;
}
console.log(`${N} games OK (${steps} decisions). Wins:`, wins);
