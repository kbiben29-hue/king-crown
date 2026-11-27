// A simple computer opponent. The engine gives every option a rough `score`;
// the computer takes the best one with a little randomness. Card prompts carry an
// `ai` hint (strong / weak / votes / lore ...). It only looks at public information
// plus its own hand.
import { REGIONS, regionOfLoc } from './data.js?v=24';

const R = Math.random;

export function aiAnswer(pi, prompt, s, game) {
  const p = s.players[pi];
  if (prompt.options) return bestOption(prompt.options);
  const cards = prompt.cards.map((uid) => findCard(s, uid)).filter(Boolean);
  if (!cards.length) return null;
  const str = (c) => game.str(c);
  const by = (f) => cards.slice().sort((a, b) => f(b) - f(a))[0].uid;
  switch (prompt.key) {
    case 'bid': {
      // A middling card: good enough to pick early, but keep the best for the Clashes.
      const sorted = cards.slice().sort((a, b) => str(b) - str(a));
      return (sorted.length >= 5 ? sorted[2] : sorted[sorted.length - 1]).uid;
    }
    case 'place': return planRegions(p, s, game)[prompt.region] || by((c) => -str(c));
    case 'forcedDiscard': return by((c) => -str(c) - game.votesOf(c));
  }
  if (prompt.optional && (prompt.ai === 'none' || R() < 0.15)) return null;
  switch (prompt.ai) {
    case 'weak': return by((c) => -str(c) - (c.arch === 'heir' ? 10 : 0));
    case 'votes': return by((c) => game.votesOf(c) * 3 - str(c) / 3);
    case 'lore': return by((c) => game.loreOf(c) * 3 + (game.hasTrait(c, 'pathfinder') ? 2 : 0) - str(c) / 3);
    case 'deadly': return by((c) => ((c.cmds || []).some((x) => x.cmd === 'deadly') ? 10 : str(c)));
    case 'shrine': return prompt.optional && R() < 0.5 ? null : by((c) => str(c));
    case 'strong': default: return by((c) => str(c) + R());
  }
}

function bestOption(options) {
  let best = options[0], bs = -Infinity;
  for (const o of options) {
    const sc = (o.score == null ? 0.5 : o.score) + R() * 0.35;
    if (sc > bs) { bs = sc; best = o; }
  }
  return best.id;
}

function findCard(s, uid) {
  for (const p of s.players) {
    for (const z of [p.hand, p.discard, p.deck, p.site, p.hq, p.lsupply || []]) { const c = z.find((x) => x.uid === uid); if (c) return c; }
    for (const sl of p.slots) if (sl && sl.occ && sl.occ.uid === uid) return sl.occ;
  }
  for (const r of Object.values(s.regions)) for (const x of r.cards) if (x.card.uid === uid) return x.card;
  for (const e of Object.values(s.councils).flat()) if (e.card.uid === uid) return e.card;
  return s.lost.find((c) => c.uid === uid) || (s.aeroDeck || []).find((c) => c.uid === uid);
}

// Which card goes to each Region: the strongest where our Herald is, the Agent (Deadly)
// sometimes in another Region, and weak cards / the Ruse elsewhere.
const allPlans = new WeakMap();
export function planRegions(p, s, game) {
  if (!allPlans.has(s)) allPlans.set(s, new Map());
  const plans = allPlans.get(s);
  const key = `${s.round}:${p.i}`;
  const ok = (pl) => Object.values(pl).every((uid) => uid == null || p.hand.some((c) => c.uid === uid) || Object.values(s.regions).some((r) => r.cards.some((x) => x.card.uid === uid)));
  if (plans.has(key) && ok(plans.get(key))) return plans.get(key);
  const herald = p.herald ? regionOfLoc(p.herald) : 'plat';
  const fight = p.hand.slice().sort((a, b) => game.str(b) - game.str(a));
  const plan = {};
  const used = new Set();
  const take = (c) => { if (!c) return null; used.add(c.uid); return c.uid; };
  plan[herald] = take(fight[0]);
  const rest = REGIONS.map((r) => r.id).filter((r) => r !== herald);
  const second = rest[Math.floor(R() * 2)];
  const remaining = fight.filter((c) => !used.has(c.uid));
  const agent = remaining.find((c) => c.arch === 'agent');
  plan[second] = take(agent && R() < 0.5 ? agent : remaining[Math.min(1, remaining.length - 1)]);
  const third = rest.find((r) => r !== second);
  const low = fight.filter((c) => !used.has(c.uid)).sort((a, b) => (game.str(a) + game.votesOf(a)) - (game.str(b) + game.votesOf(b)));
  const ruse = low.find((c) => c.arch === 'ruse');
  plan[third] = take(ruse || low[0]);
  plans.set(key, plan);
  return plan;
}
