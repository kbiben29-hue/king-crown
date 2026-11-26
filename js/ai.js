// A simple computer opponent. It only looks at public information plus its own hand.
import { LOCATIONS, REGIONS, regionOfLoc } from './data.js';

const val = (c) => c.str + c.votes * 0.8 + c.lore * 0.6 + (c.cmd === 'deadly' ? 3 : 0);

export function aiAnswer(pi, prompt, s, game) {
  const p = s.players[pi];
  const R = Math.random;
  const card = (uid) => [...p.hand, ...p.site, ...p.deck].find((c) => c.uid === uid);
  const cards = (prompt.cards || []).map(card).filter(Boolean);
  const opt = (id) => prompt.options && prompt.options.find((o) => o.id === id);
  const byStr = (a, b) => b.str - a.str;

  switch (prompt.key) {
    case 'bid': {
      // Bid a middling card: strong enough to pick early, but keep the best for the Clashes.
      const sorted = cards.slice().sort(byStr);
      const pick = sorted.length >= 5 ? sorted[2] : sorted[sorted.length - 1];
      return pick.uid;
    }
    case 'bidUse': {
      const steals = prompt.options.filter((o) => o.id.startsWith('steal'));
      if (steals.length && R() < 0.7) return steals[0].id;
      const takes = prompt.options.filter((o) => o.id.startsWith('take'));
      const have = new Set(p.kingdom.filter(Boolean).map((k) => k.card.k));
      const good = takes.filter((o) => { const kc = s.road[+o.id.split(':')[1]]; return kc && !have.has(kc.k); });
      if (good.length) return good[Math.floor(R() * good.length)].id;
      if (takes.length && p.kingdom.some((k) => !k)) return takes[0].id;
      return 'return';
    }
    case 'slot': {
      // replace the Kingdom Card guarded by the weakest card
      return String(p.kingdom[0].occ.str <= p.kingdom[1].occ.str ? 0 : 1);
    }
    case 'herald': {
      const w = prompt.options.map((o) => LOCATIONS[o.id].inf + R() * 2.5);
      return prompt.options[w.indexOf(Math.max(...w))].id;
    }
    case 'place': {
      const plan = planRegions(p, s);
      const want = plan[prompt.region];
      if (want && cards.some((c) => c.uid === want)) return want;
      return cards.slice().sort(byStr)[cards.length - 1].uid;
    }
    case 'placeRegion': {
      const herald = p.herald ? regionOfLoc(p.herald) : null;
      return (opt(herald) || prompt.options[0]).id;
    }
    case 'supporter': {
      const herald = p.herald ? regionOfLoc(p.herald) : 'plat';
      const placed = Object.values(s.regions).reduce((a, r) => a + (r.sup[pi] || 0), 0);
      const budget = s.round === s.rounds ? 5 : p.supporters >= 4 ? 2 : 1;
      if (placed < budget) return R() < 0.75 ? herald : REGIONS[Math.floor(R() * 3)].id;
      return 'done';
    }
    case 'clashOrder': return prompt.options[Math.floor(R() * prompt.options.length)].id;
    case 'day': {
      if (opt('ambush') && p.hand.some((c) => c.str >= 3)) return 'ambush';
      return 'done';
    }
    case 'ambushCard': case 'tieCard': return cards.slice().sort(byStr)[0].uid;
    case 'tie': return p.hand.some((c) => c.str >= 2) ? 'play' : 'pass';
    case 'loc': {
      const score = (l) => LOCATIONS[l].inf + (p.herald === l ? 1.5 : 0) + (l === 'harvest' ? 0.5 : 0) + (l === 'castle' && p.hand.some((c) => c.votes > 0) ? 0.7 : 0);
      return prompt.options.slice().sort((a, b) => score(b.id) - score(a.id))[0].id;
    }
    case 'relics': return prompt.votes >= 3 || s.round >= s.rounds - 1 ? 'yes' : 'no';
    case 'castleGovern': return cards.length ? cards.sort((a, b) => b.votes - a.votes)[0].uid : null;
    case 'council': {
      const c = card(prompt.card) || {};
      const counts = { relics: game.votes(pi, 'relics'), secrets: game.votes(pi, 'secrets'), oaths: game.votes(pi, 'oaths') };
      if (p.lostSup >= 2 && counts.oaths < 2) return 'oaths';
      return s.round >= s.rounds - 1 || (c.votes || 0) >= 2 ? 'relics' : ['relics', 'secrets', 'oaths'][Math.floor(R() * 3)];
    }
    case 'autumn': {
      // Keep at least 4 cards for next year's Bid + three Regions when we can.
      const ids = prompt.options.map((o) => o.id);
      if (ids.includes('oaths')) return 'oaths';
      if (ids.includes('secrets')) return 'secrets';
      if (ids.includes('journey') && (p.site.some((c) => c.cost <= p.lore + 2) || p.hand.length > 3)) return 'journey';
      if (ids.includes('govern') && p.hand.length > 2) return 'govern';
      return 'done';
    }
    case 'governCard': return cards.sort((a, b) => b.votes - a.votes || a.str - b.str)[0].uid;
    case 'journeyCard': return cards.sort((a, b) => b.lore - a.lore || a.str - b.str)[0].uid;
    case 'buy': {
      const opts = prompt.options.filter((o) => o.id !== 'done');
      return opts.length ? opts[opts.length - 1].id : 'done';
    }
    case 'secretsLoc': {
      const best = prompt.options.slice().sort((a, b) => ((s.marks[b.id] || {})[pi] || 0) - ((s.marks[a.id] || {})[pi] || 0));
      return (best[0] && ((s.marks[best[0].id] || {})[pi] || 0) > 0 ? best[0] : opt('harvest') || prompt.options[0]).id;
    }
    default:
      if (prompt.options) return prompt.options[0].id;
      return cards[0] ? cards[0].uid : null;
  }
}

// Decide which card goes to each Region: strongest where our Herald is,
// the Assassin somewhere random, weakest cards spread over the rest.
const allPlans = new WeakMap();
function planRegions(p, s) {
  if (!allPlans.has(s)) allPlans.set(s, new Map());
  const plans = allPlans.get(s);
  const key = `${s.round}:${p.i}`;
  if (plans.has(key)) {
    const pl = plans.get(key);
    if (Object.values(pl).every((uid) => p.hand.some((c) => c.uid === uid) || placedAlready(s, uid))) return pl;
  }
  const herald = p.herald ? regionOfLoc(p.herald) : 'plat';
  const hand = p.hand.slice().sort((a, b) => val(b) - val(a));
  const fight = p.hand.slice().sort((a, b) => b.str - a.str);
  const plan = {};
  const used = new Set();
  const pick = (c) => { used.add(c.uid); return c.uid; };
  plan[herald] = pick(fight[0]);
  const rest = REGIONS.map((r) => r.id).filter((r) => r !== herald);
  const second = rest[Math.floor(Math.random() * 2)];
  const remaining = fight.filter((c) => !used.has(c.uid));
  const assassin = remaining.find((c) => c.cmd === 'deadly');
  plan[second] = pick(assassin && Math.random() < 0.5 ? assassin : remaining[0]);
  const third = rest.find((r) => r !== second);
  const low = hand.filter((c) => !used.has(c.uid)).sort((a, b) => val(a) - val(b));
  plan[third] = low[0] ? pick(low[0]) : null;
  plans.set(key, plan);
  return plan;
}
function placedAlready(s, uid) { return Object.values(s.regions).some((r) => r.cards.some((c) => c.card.uid === uid)); }
