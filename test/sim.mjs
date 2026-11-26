// Plays many computer-vs-computer games to check the rules engine never gets stuck.
import { Game } from '../js/engine.js';
import { aiAnswer } from '../js/ai.js';
import { FACTIONS } from '../js/data.js';

const N = +(process.argv[2] || 200);
const wins = {}; let total = [0, 0], steps = 0;
for (let g = 0; g < N; g++) {
  const fs = [FACTIONS[g % 4].id, FACTIONS[(g + 1 + (g >> 2)) % 4 === g % 4 ? (g + 2) % 4 : (g + 1 + (g >> 2)) % 4].id];
  const nPlayers = g % 5 === 4 ? 3 + (g % 2) : 2;
  const factions = FACTIONS.slice(0, nPlayers).map((f) => f.id);
  const game = new Game({ seed: g + 1, factions: nPlayers === 2 ? fs : factions, humans: factions.map(() => false) }, {
    ask: (pi, prompt, s, gm) => {
      if (++steps > 5e6) throw new Error('runaway');
      const a = aiAnswer(pi, prompt, s, gm);
      if (prompt.options && !prompt.options.some((o) => o.id === a)) throw new Error(`bad answer ${a} to ${prompt.key}`);
      if (prompt.cards && !(prompt.optional && a == null) && !prompt.cards.includes(a)) throw new Error(`bad card ${a} to ${prompt.key}`);
      return a;
    },
  });
  const r = await game.run();
  const s = game.s;
  // sanity: every card accounted for (14 starter + 5 site per player)
  for (const p of s.players) {
    const count = p.hand.length + p.deck.length + p.discard.length + p.site.length + p.hq.length
      + s.lost.filter((c) => c.owner === p.i).length
      + Object.values(s.councils).flat().filter((e) => e.owner === p.i).length
      + p.kingdom.filter(Boolean).length;
    if (count !== 19) throw new Error(`game ${g}: ${p.name} has ${count} cards`);
    const sup = p.supporters + p.lostSup;
    if (sup !== 5) throw new Error(`game ${g}: ${p.name} has ${sup} supporters`);
  }
  const w = s.players[r.winner].name; wins[w] = (wins[w] || 0) + 1;
  if (s.players.length === 2) { total[0] += r.scores[0]; total[1] += r.scores[1]; }
}
console.log(`${N} games OK. Wins:`, wins, 'avg 2p scores', total.map((t) => (t / N).toFixed(1)));
