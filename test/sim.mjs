// Plays many computer-vs-computer games with the real cards to check the rules
// engine never gets stuck and never loses a card.
import { Game } from '../js/engine.js';
import { aiAnswer } from '../js/ai.js';
import { FACTIONS } from '../js/data.js';

const N = +(process.argv[2] || 200);
const wins = {}; let steps = 0, rounds = 0;
const fids = FACTIONS.map((f) => f.id);
for (let g = 0; g < N; g++) {
  const n = g % 7 === 6 ? 4 : g % 5 === 4 ? 3 : 2;
  const start = g % 4;
  const factions = Array.from({ length: n }, (_, k) => fids[(start + k * (1 + (g >> 2) % 3 === 0 ? 1 : 1)) % 4]);
  const uniq = [...new Set(factions)]; while (uniq.length < n) uniq.push(fids.find((f) => !uniq.includes(f)));
  const game = new Game({ seed: g + 1, factions: uniq, humans: uniq.map(() => false) }, {
    ask: (pi, prompt, s, gm) => {
      if (++steps > 2e7) throw new Error('runaway');
      const a = aiAnswer(pi, prompt, s, gm);
      if (prompt.options && !prompt.options.some((o) => o.id === a)) throw new Error(`bad answer ${a} to ${prompt.key}`);
      if (prompt.cards && !(prompt.optional && a == null) && !prompt.cards.includes(a)) throw new Error(`bad card ${a} to ${prompt.key}: ${prompt.text}`);
      return a;
    },
  });
  let r;
  try { r = await game.run(); } catch (e) { console.error(`game ${g} (seed ${g + 1}, ${uniq}) round ${game.s.round} ${game.s.step}`); throw e; }
  const s = game.s;
  for (const p of s.players) {
    const count = p.hand.length + p.deck.length + p.discard.length + p.site.length + p.hq.length
      + s.lost.filter((c) => c.owner === p.i).length + s.burned.filter((c) => c.owner === p.i).length
      + Object.values(s.councils).flat().filter((e) => e.owner === p.i).length
      + p.slots.filter((x) => x && x.occ).length
      + Object.values(s.regions).reduce((a, R) => a + R.cards.filter((x) => x.card.owner === p.i).length, 0);
    if (count !== 19) throw new Error(`game ${g}: ${p.name} has ${count} cards`);
    const sup = p.supporters + p.lostSup + Object.values(s.regions).reduce((a, R) => a + (R.sup[p.i] || 0), 0);
    if (sup !== 5) throw new Error(`game ${g}: ${p.name} has ${sup} Supporters`);
    if (p.inf < 0) throw new Error(`negative influence`);
  }
  const kc = s.kdeck.length + s.kdiscard.length + s.road.filter(Boolean).length + s.burned.filter((c) => c.owner == null).length
    + s.players.reduce((a, p) => a + p.slots.filter(Boolean).length + p.ksupply.length, 0)
    + Object.values(s.regions).reduce((a, R) => a + R.ks.length, 0) + Object.values(s.locKs).reduce((a, l) => a + l.length, 0);
  if (kc !== 51) throw new Error(`game ${g}: ${kc} Kingdom Cards`);
  const w = s.players[r.winner].short; wins[w] = (wins[w] || 0) + 1;
  rounds += s.rounds;
}
console.log(`${N} games OK (${steps} decisions). Wins:`, wins);
