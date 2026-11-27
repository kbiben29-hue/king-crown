// Rules engine for The Old King's Crown (base game), using the real cards.
// The whole game is one async script; every decision goes through io.ask(pi, prompt)
// so the same code drives the phone UI, the computer opponent and the simulation test.
import { CARDS, FACTIONS, REGIONS, LOCATIONS, COUNCILS, GAME, ARCH, regionOfLoc } from './data.js?v=15';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RNAME = Object.fromEntries(REGIONS.map((r) => [r.id, r.name]));
export const regionName = (id) => RNAME[id];
export const locName = (id) => LOCATIONS[id].name;
export const councilName = (id) => COUNCILS.find((c) => c.id === id).name;
const KF_STEP = { clans: 'day', uprising: 'spring', nobility: 'spring', gathering: 'autumn' };
const cap = (t) => t[0].toUpperCase() + t.slice(1);

export class Game {
  constructor({ seed = Date.now(), factions = ['nobility', 'clans'], humans = [true, false], rounds = GAME.rounds, kingdom = 'all', wk = {} } = {}, io) {
    this.io = io;
    this.rand = rng(seed);
    this.nextId = 0;
    this.allFaction = []; // every faction card instance (for checks)
    this.wk = { cards: 0, night: false, aeronauts: false, legendary: false, tower: false, ...wk };
    const players = factions.map((f, i) => {
      const fac = FACTIONS.find((x) => x.id === f);
      const all = CARDS.factions[f].map((t) => this.mk(t, i));
      const heir = all.find((c) => c.num === 14);
      const deck = this.shuffle(all.filter((c) => c.num <= 13));
      const p = {
        i, faction: f, name: fac.name, short: fac.name.replace('The ', ''), color: fac.color, human: humans[i],
        deck, hand: [heir], discard: [], handSize: GAME.startHand,
        inf: 0, lore: 0, supporters: GAME.supporters, lostSup: 0, markers: GAME.markers,
        herald: null, slots: [null, null], ksupply: [], site: all.filter((c) => c.num >= 15), hq: [],
        tactics: CARDS.tactics[f].map((t) => ({ ...t, exhausted: false, markers: 0 })), siteName: CARDS.sites[f].name,
        flags: {}, used: {}, legend: null, lsupply: [], boons: [], nf: 'none', burnedSup: 0,
      };
      if (this.wk.legendary) p.lsupply.push(this.mk(CARDS.wk.factionCards.find((c) => c.legendary && c.faction === f), i));
      for (const t of p.tactics) this.tacticSetup(p, t);
      while (p.hand.length < GAME.startHand && p.deck.length) p.hand.push(p.deck.pop());
      return p;
    });
    let kdeck = CARDS.kingdom.filter((k) => kingdom === 'all' || kingdom.includes(k.k)).map((t) => this.mk(t, null));
    if (this.wk.cards > 0) {
      // Wild Kingdom: N random Wild Kingdom Cards plus random base cards up to 30 in total
      const wkc = this.shuffle(CARDS.wk.kingdom.map((t) => this.mk(t, null))).slice(0, this.wk.cards);
      kdeck = [...wkc, ...this.shuffle(kdeck).slice(0, 30 - wkc.length)];
    }
    this.kingdomTotal = kdeck.length;
    this.s = {
      round: 1, rounds, season: 'setup', step: '', players,
      order: this.shuffle(players.map((p) => p.i)),
      kdeck: this.shuffle(kdeck), kdiscard: [], road: [], lost: [], burned: [],
      councils: { relics: [], secrets: [], oaths: [] },
      cmarks: { relics: {}, secrets: {}, oaths: {} }, // Faction Markers on Councils: cmarks[c][pi] = {syn, bringer}
      marks: {}, locKs: {}, favour: null,
      regions: Object.fromEntries(REGIONS.map((r) => [r.id, blankRegion()])),
      clashOrder: [], current: null, bids: null, log: [], over: false, result: null, peek: null,
      map: { high: ['castle', 'wilderness'], plat: ['harvest', 'battlefield'], low: ['shrine', 'necropolis'] }, night: false,
      pieces: {}, aeroDeck: [], tower: null, boonStack: [], boonDiscard: [], flags: {},
    };
    this.setupWildKingdom();
    for (let n = 0; n < 4; n++) this.s.road.push(this.drawKingdom());
  }

  mk(t, owner) { const c = { ...t, uid: ++this.nextId, owner, inf: 0, tmp: {}, ctmp: {}, boons: [] }; if (t.faction) this.allFaction.push(c); return c; }

  // ---- Wild Kingdom setup ------------------------------------------------
  setupWildKingdom() {
    const s = this.s, wk = this.wk;
    if (wk.night) {
      // Randomised Night Map: draw the six Location tokens and lay the tiles top-left to bottom-right.
      s.night = true;
      const bag = this.shuffle(['castle', 'wilderness', 'harvest', 'battlefield', 'shrine', 'necropolis']);
      s.map = { high: bag.slice(0, 2), plat: bag.slice(2, 4), low: bag.slice(4, 6) };
    }
    // Starting Locations for module pieces: draw from the bag of six Location tokens.
    const bag = this.shuffle(['castle', 'wilderness', 'harvest', 'battlefield', 'shrine', 'necropolis']);
    if (wk.aeronauts) {
      s.pieces.nearfar = bag.pop();
      const aero = this.shuffle(CARDS.wk.factionCards.filter((c) => c.faction === 'aeronauts').map((t) => this.mk(t, null)));
      s.aeroBox = aero.pop(); // one goes back in the box
      s.aeroDeck = aero;
    }
    if (wk.tower) {
      s.pieces.tower = bag.pop();
      s.boonStack = this.shuffle(CARDS.wk.boons.map((b) => ({ ...b, bid: ++this.nextId })));
      s.tower = { entrance: [s.boonStack.pop()], lab: [s.boonStack.pop(), s.boonStack.pop()], pin: [s.boonStack.pop(), s.boonStack.pop(), s.boonStack.pop()] };
    }
  }
  regOf(loc) { return Object.keys(this.s.map).find((r) => this.s.map[r].includes(loc)); }
  // Travel: diagonally down into the next Region, landing on the opposite side (Lowlands wrap to the Highlands).
  travel(loc) {
    const r = this.regOf(loc), i = this.s.map[r].indexOf(loc);
    const order = ['high', 'plat', 'low'];
    const next = order[(order.indexOf(r) + 1) % 3];
    return this.s.map[next][1 - i];
  }
  shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  P(i) { return this.s.players[i]; }
  log(msg, cls = '') { this.s.log.push({ msg, cls, round: this.s.round, season: this.s.season }); this.io.update?.(this.s); }
  async coach(key, pi) { if (this.io.coach && (pi == null || this.P(pi).human)) await this.io.coach(key, this.s); }
  async beat(text) { if (this.io.beat) await this.io.beat(text, this.s); }
  step(season, step) { this.s.season = season; this.s.step = step; this.io.update?.(this.s); }
  opps(pi) { return this.s.players.filter((q) => q.i !== pi); }
  turn() { return this.s.order.map((i) => this.P(i)); }

  // ---- asking ---------------------------------------------------------
  async ask(pi, prompt) { this.io.update?.(this.s); return this.io.ask(pi, prompt, this.s, this); }
  async choose(pi, text, options, extra = {}) {
    if (!options.length) return null;
    if (options.length === 1 && extra.auto !== false) return options[0].id;
    return this.ask(pi, { key: extra.key || 'choose', text, options, ...extra });
  }
  async pick(pi, text, cards, extra = {}) {
    if (!cards.length) return null;
    const uid = await this.ask(pi, { key: extra.key || 'pick', text, cards: cards.map((c) => c.uid), ...extra });
    return uid == null ? null : cards.find((c) => c.uid === uid) || null;
  }
  async yes(pi, text, yesLabel = 'Yes', noLabel = 'No', score = 1) {
    return (await this.choose(pi, text, [{ id: 'yes', label: yesLabel, score }, { id: 'no', label: noLabel, score: 0.5 }], { auto: false, key: 'yesno' })) === 'yes';
  }
  async chooseRegion(pi, text, rids = REGIONS.map((r) => r.id), extra = {}) {
    return this.choose(pi, text, rids.map((r) => ({ id: r, label: regionName(r), score: extra.scores ? extra.scores[r] : this.rand() })), { key: 'region', ...extra });
  }

  // ---- kingdom cards & effects ----------------------------------------
  kOwned(p) {
    const out = [...p.slots.filter(Boolean).map((s) => s.card), ...p.ksupply];
    for (const r of Object.values(this.s.regions)) for (const k of r.ks) if (k.owner === p.i) out.push(k.card);
    for (const l of Object.values(this.s.locKs)) for (const k of l) if (k.owner === p.i) out.push(k.card);
    return out;
  }
  has(p, k) { return this.kOwned(p).some((c) => c.k === k); }
  hasHQ(p, id) { return p.hq.some((c) => c.id === id); }
  isAlly(c) { return !!c.faction && c.owner != null && c.faction !== this.P(c.owner).faction; }
  maxSlots(p) { return 2 + (this.hasHQ(p, 'UPRISING-18') ? 1 : 0); }
  maxHand(p) { return Math.min(8, p.handSize); }

  base(c) { return c.tmp.copy || c; }
  blank(c, rid) {
    if (!rid) return 0;
    const R = this.s.regions[rid];
    let b = 0;
    if (R.ks.some((k) => k.card.k === 'poisoners-ball' && k.owner !== c.owner)) b = 1;
    if (c.arch !== 'heir' && c.id && R.cards.some((x) => x.up && !x.used && x.card.id === 'UPRISING-17' && x.card.owner !== c.owner && !R.ks.some((k) => k.card.k === 'poisoners-ball' && k.owner !== x.card.owner))) b = 2;
    return b;
  }
  arch(c, rid) { return this.blank(c, rid) === 2 ? null : this.base(c).arch; }
  hasBoon(c, n) { return (c.boons || []).some((b) => b.n === n); }
  str(c) { return (c.str || 0) + (c.tmp.addStr || 0) + (this.hasBoon(c, 2) ? 5 : 0) + (this.hasBoon(c, 7) ? 10 : 0); }
  // Boon 4: while an opposing card with it is Active in this Clash, your cards can't use Commands.
  suppressed(c, rid) {
    if (!rid) return false;
    return this.s.regions[rid].cards.some((x) => x.up && !x.used && x.card.owner !== c.owner && this.hasBoon(x.card, 4));
  }
  traits(c, rid) {
    const b = this.base(c);
    const out = new Set(this.blank(c, rid) ? [] : b.traits);
    for (const x of c.tmp.extra || []) x.traits.forEach((t) => out.add(t));
    if (c.owner == null) return out;
    const p = this.P(c.owner);
    if (this.hasHQ(p, 'CLANS-19')) out.add('resilient');
    if (this.has(p, 'adventuring-party')) out.add('pathfinder');
    if (c.ctmp.invul) out.add('invulnerable');
    if (this.arch(c, rid) === 'heir' && p.flags.regalGuard) out.add('invulnerable');
    if (this.hasBoon(c, 13)) out.add('invulnerable');
    if (this.s.flags.arrows) out.delete('invulnerable'); // Arrows, Bright & True
    return out;
  }
  cmds(c, rid) {
    if (this.suppressed(c, rid)) return [];
    const b = this.base(c);
    const out = this.blank(c, rid) ? [] : b.cmds.map((x) => ({ ...x }));
    for (const x of c.tmp.extra || []) out.push(...x.cmds.map((y) => ({ ...y })));
    if (c.owner == null) return out;
    const p = this.P(c.owner), a = this.arch(c, rid);
    const add = (season, cmd, arg = '') => out.push({ season, cmd, arg });
    if (a === 'heir') {
      if (this.has(p, 'the-great-wing')) add('day', 'flank');
      if (this.has(p, 'assassins-guild')) { add('night', 'deadly'); add('day', 'retreat'); }
      if (p.flags.streets) add('night', 'deadly');
      if (this.has(p, 'siege-commander')) add('autumn', 'deploy', '1');
    }
    if (a === 'trader' && this.hasHQ(p, 'CLANS-18')) add('day', 'flank');
    if ((a === 'follower' || a === 'cavalry') && this.has(p, 'countryside-reservists')) add('autumn', 'deploy', '1');
    if (c.tmp.flank) add('day', 'flank');
    if (c.ctmp.retreat) add('day', 'retreat');
    if (c.ctmp.ambush || c.tmp.ambush) add('day', 'ambush');
    if (c.ctmp.deadly || c.tmp.deadlyRound) add('night', 'deadly');
    if (this.hasBoon(c, 8)) add('day', 'flank');
    if (this.hasBoon(c, 11)) add('night', 'deadly');
    if (this.hasBoon(c, 12)) add('day', 'ambush');
    if (this.hasBoon(c, 15)) add('autumn', 'rally', 'any two');
    if (c.tmp.noRetreat) { const i = out.findIndex((x) => x.cmd === 'retreat'); if (i >= 0) out.splice(i, 1); }
    if (this.has(p, 'engineers-workshop')) for (const x of out.filter((y) => y.cmd === 'deploy' && y.season === 'autumn')) add('spring', 'deploy', x.arg);
    const seen = new Set();
    return out.filter((x) => { const k = x.season + x.cmd; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  hasCmd(c, season, cmd, rid) { return this.cmds(c, rid).some((x) => x.season === season && x.cmd === cmd); }
  hasTrait(c, t, rid) { return this.traits(c, rid).has(t); }
  textIs(c, id, rid) { return (this.base(c).id === id && !this.blank(c, rid)) || (c.tmp.extra || []).some((x) => x.id === id); }
  isAgent7(c, rid) { const b = this.base(c); return (/-07$/.test(b.id || '') && !this.blank(c, rid)) || (c.tmp.extra || []).some((x) => /-07$/.test(x.id)); }
  votesOf(c) {
    if (!c.faction) return 0;
    let v = c.votes || 0;
    if (c.owner == null) return v;
    const p = this.P(c.owner);
    if (this.hasHQ(p, 'NOBILITY-19') && !c.votes) v += 1;
    if (c.arch === 'follower' && this.has(p, 'tin-crowns')) v += this.s.order[0] === p.i ? 1 : 2;
    return v;
  }
  loreOf(c) { return (c.lore || 0) + (c.lore === 1 && c.owner != null && this.has(this.P(c.owner), 'endless-library') ? 1 : 0); }
  votes(pi, council) {
    let v = this.s.councils[council].filter((e) => e.owner === pi).reduce((a, e) => a + this.votesOf(e.card), 0);
    const m = this.s.cmarks[council][pi];
    if (m) v += m.syn || 0;
    const bringer = Object.values(this.s.councils).flat().some((e) => e.card.id === 'GATHERING-16' && e.owner === pi);
    if (bringer && m) v += m.bringer || 0;
    return v;
  }

  drawKingdom() {
    if (!this.s.kdeck.length) { this.s.kdeck = this.shuffle(this.s.kdiscard); this.s.kdiscard = []; }
    return this.s.kdeck.pop() || null;
  }

  // ---- moving faction cards -------------------------------------------
  // A card leaving play: clear its round/clash state; its Boons go to the Boon discard.
  reset(c) { c.inf = 0; c.tmp = {}; c.ctmp = {}; if (c.boons && c.boons.length) { this.s.boonDiscard.push(...c.boons); c.boons = []; } }
  toDiscard(c) { this.reset(c); this.P(c.owner).discard.push(c); }
  toLost(c) { this.reset(c); this.s.lost.push(c); }
  toHand(c) { this.reset(c); this.P(c.owner).hand.push(c); }
  toDeckTop(c) { this.reset(c); this.P(c.owner).deck.push(c); }
  toDeckBottom(c) { this.reset(c); this.P(c.owner).deck.unshift(c); }
  takeFrom(arr, c) { const i = arr.indexOf(c); if (i >= 0) arr.splice(i, 1); return c; }
  // Remove a card from wherever it is (hand, discard, lost pile, a Region, a Council, under a Kingdom Card).
  detach(c) {
    const s = this.s, p = c.owner != null ? this.P(c.owner) : null;
    if (p) for (const z of [p.hand, p.discard, p.deck]) if (z.includes(c)) return this.takeFrom(z, c);
    if (s.lost.includes(c)) return this.takeFrom(s.lost, c);
    for (const R of Object.values(s.regions)) { const x = R.cards.find((y) => y.card === c); if (x) { R.cards.splice(R.cards.indexOf(x), 1); return c; } }
    for (const k of Object.keys(s.councils)) { const e = s.councils[k].find((y) => y.card === c); if (e) { s.councils[k].splice(s.councils[k].indexOf(e), 1); return c; } }
    if (p) for (const sl of p.slots) if (sl && sl.occ === c) { sl.occ = null; return c; }
    return c;
  }
  activeCards(pi) {
    const out = [];
    for (const [rid, R] of Object.entries(this.s.regions)) for (const x of R.cards) if (x.up && (pi == null || x.card.owner === pi)) out.push({ card: x.card, rid, x });
    return out;
  }
  regionOf(c) { for (const [rid, R] of Object.entries(this.s.regions)) if (R.cards.some((x) => x.card === c)) return rid; return null; }
  drawOne(p) {
    if (!p.deck.length) {
      if (!p.discard.length) return false;
      p.deck = this.shuffle(p.discard); p.discard = [];
      const ben = p.ksupply.find((k) => k.k === 'mysterious-benefactor');
      if (ben) { this.takeFrom(p.ksupply, ben); this.s.kdiscard.push(ben); this.log(`${p.name}'s Deck ran out: Attrition! Mysterious Benefactor is discarded instead of lowering their Hand Size.`, 'warn'); }
      else {
        const before = p.handSize; p.handSize = Math.max(3, p.handSize - 1);
        this.log(`${p.name}'s Deck ran out: Attrition! Their Discard Pile becomes their Deck` + (before !== p.handSize ? ` and their Hand Size drops to ${p.handSize}.` : ' (Hand Size is already at its minimum of 3).'), 'warn');
        while (p.hand.length > this.maxHand(p)) { const c = p.hand.slice().sort((a, b) => this.str(a) - this.str(b))[0]; this.takeFrom(p.hand, c); this.toDiscard(c); }
      }
    }
    if (p.hand.length >= this.maxHand(p)) return false;
    p.hand.push(p.deck.pop());
    return true;
  }
  drawUpTo(p) { let guard = 0; while (p.hand.length < this.maxHand(p) && guard++ < 20) if (!this.drawOne(p)) break; }
  gainInf(p, n, why) { if (n > 0) { if (this.s.flags.abundance && why !== 'Herald Reward') n *= 2; p.inf += n; this.log(`${p.name} gains ${n} Influence — ${why}${this.s.flags.abundance ? ' (doubled by Unnatural Abundance)' : ''}.`, 'inf'); } }

  // Eliminate an Active card. Returns where it went.
  async eliminate(c) {
    const p = this.P(c.owner), rid = this.regionOf(c);
    const resilient = this.hasTrait(c, 'resilient', rid);
    const heir = this.arch(c, rid) === 'heir';
    this.detach(c);
    if (heir && this.has(p, 'siege-commander')) {
      const sc = this.kOwned(p).find((k) => k.k === 'siege-commander');
      await this.discardKingdom(sc, false);
      this.toHand(c); return 'hand (Siege Commander, which is discarded)';
    }
    if (this.has(p, 'old-kings-helm') && await this.yes(p.i, `Old King's Helm: move ${c.name} to your hand instead?`, 'Move to hand', 'No', 2)) { this.toHand(c); return "hand (Old King's Helm)"; }
    if (resilient) { this.toDiscard(c); return 'Discard Pile (Resilient)'; }
    this.toLost(c); return 'Lost Pile';
  }

  // ---- councils ------------------------------------------------------
  async askCouncil(pi, card, text) {
    return this.choose(pi, text || `Which Council does ${card.name} (${this.votesOf(card)} Votes) join? It stays there in later Rounds.`, COUNCILS.map((c) => ({ id: c.id, label: c.name, sub: `${c.text} You have ${this.votes(pi, c.id)} Votes there.`, score: this.councilScore(pi, c.id) })), { auto: false, key: 'council', card: card.uid });
  }
  councilScore(pi, id) {
    const p = this.P(pi);
    if (id === 'oaths') return p.lostSup >= 2 ? 2 : 0.6;
    if (id === 'relics') return this.s.round >= this.s.rounds - 1 ? 2 : 1;
    return 0.8 + this.rand();
  }
  govern(pi, card, council) {
    this.detach(card);
    this.reset(card);
    this.s.councils[council].push({ owner: pi, card });
    this.log(`${this.P(pi).name} Governs: ${card.name} (${this.votesOf(card)} Votes) joins the ${councilName(council)}.`);
  }
  // A card is removed from a Council (Castle, Witch Trial, Courtier's Diary, Relics...).
  async removeFromCouncil(e, why) {
    const s = this.s, p = this.P(e.owner);
    for (const k of Object.keys(s.councils)) { const i = s.councils[k].indexOf(e); if (i >= 0) s.councils[k].splice(i, 1); }
    const c = e.card;
    if ((this.has(p, 'airship-docks') || this.hasHQ(p, 'CLANS-18')) && await this.yes(p.i, `${c.name} is removed from a Council (${why}). Move it to your hand?`, 'To my hand', 'Discard it', 2)) { this.toHand(c); this.log(`${c.name} goes back to ${p.name}'s hand.`); return; }
    if (c.id === 'GATHERING-16' && await this.yes(p.i, 'Bringer of the Word was removed from a Council. Move it to the Lost Pile?', 'Lost Pile', 'Discard Pile', 0.3)) { this.toLost(c); return; }
    this.toDiscard(c);
  }

  // ---- lore & the Site of Power ----------------------------------------
  async gainLore(p, n, why) {
    if (n <= 0) return;
    p.lore += n;
    this.log(`${p.name} gains ${n} Lore — ${why}.`);
    for (;;) {
      const bind = this.has(p, 'binding-stone') ? this.opps(p.i).flatMap((q) => q.site) : [];
      const can = [...p.site, ...bind].filter((c) => c.cost <= p.lore);
      if (!can.length) return;
      await this.coach('buy', p.i);
      const ch = await this.choose(p.i, `You have ${p.lore} Lore. Spend it now at your Site of Power (${p.siteName})? Lore can only be spent right when you gain it.`,
        [...can.map((c) => ({ id: String(c.uid), label: `${c.name} — ${c.cost} Lore${c.owner !== p.i ? ` (${this.P(c.owner).short}'s, via Binding Stone)` : ''}`, sub: c.hq ? `HQ: ${c.text}` : `Strength ${c.str}. ${c.text}`, card: c.uid, score: 1 + c.cost })), { id: 'done', label: 'Save the Lore', score: 0.5 }], { auto: false, key: 'buy' });
      if (ch === 'done') return;
      const c = can.find((x) => x.uid === +ch);
      p.lore -= c.cost;
      if (!p.site.includes(c)) { const q = this.P(c.owner); this.takeFrom(q.site, c); c.owner = p.i; p.site.push(c); this.log(`Binding Stone: ${p.name} takes ${c.name} from ${q.name}'s Site of Power as an Ally.`); }
      await this.acquireSite(p, c);
    }
  }
  async acquireSite(p, c) {
    this.takeFrom(p.site, c);
    if (c.hq) p.hq.push(c);
    else if (p.hand.length >= this.maxHand(p)) { p.deck.push(c); this.log(`${p.name}'s hand is full, so ${c.name} goes on top of their Deck.`); }
    else p.hand.push(c);
    this.log(`${p.name} acquires ${c.name} from their Site of Power.`, 'inf');
    if (c.id === 'GATHERING-19') { const n = Math.min(3, p.markers); p.markers -= n; c.markers = n; }
    if (c.id === 'NOBILITY-17') {
      const used = new Set();
      for (let n = 0; n < 3; n++) {
        const pool = [...p.discard, ...this.s.lost.filter((x) => x.owner === p.i)];
        if (!pool.length) break;
        const card = await this.pick(p.i, `The Queen, Long Ago: Govern with a card from your Lost Pile or Discard Pile (${3 - n} left, each into a different Council), or skip.`, pool, { optional: true, ai: 'votes', key: 'queen' });
        if (!card) break;
        const council = await this.choose(p.i, `Which Council for ${card.name}?`, COUNCILS.filter((x) => !used.has(x.id)).map((x) => ({ id: x.id, label: x.name, score: this.councilScore(p.i, x.id) })), { key: 'council' });
        used.add(council); this.govern(p.i, card, council);
      }
    }
  }

  async journey(p, card, why = 'Journey') {
    const rid = this.regionOf(card);
    const path = this.hasTrait(card, 'pathfinder', rid);
    const lore = this.loreOf(card);
    this.detach(card);
    if (this.has(p, 'airship-docks') && await this.yes(p.i, `Airship Docks: move ${card.name} to the bottom of your Deck instead?`, 'Bottom of Deck', 'No', 1.5)) this.toDeckBottom(card);
    else if (path) this.toDiscard(card); else this.toLost(card);
    this.log(`${p.name} Journeys with ${card.name}${path ? ' (Pathfinder: back to their Discard Pile)' : ' (to the Lost Pile)'}.`);
    let n = lore;
    if (path && this.has(p, 'glittering-caves')) { n += 1; this.gainInf(p, 1, 'Glittering Caves'); }
    await this.gainLore(p, n, why);
  }
  journeyPool(p, allowActive) {
    const pool = p.hand.filter((c) => this.loreOf(c) > 0);
    if (allowActive || this.has(p, 'adventuring-party')) for (const a of this.activeCards(p.i)) if (this.loreOf(a.card) > 0) pool.push(a.card);
    return pool;
  }

  // ---- Kingdom's Favour ------------------------------------------------
  async takeFavour(p) {
    this.s.favour = { pi: p.i, val: 3 };
    this.log(`${p.name} takes the Kingdom's Favour (set to III).`);
  }
  kfOptions(p, step) {
    const s = this.s, out = [];
    const holds = s.favour && s.favour.pi === p.i;
    const uses = p.used.kf || 0;
    if (KF_STEP[p.faction] === step) {
      if (holds && uses < (this.has(p, 'splendid-guard') ? 2 : 1)) out.push({ faction: p.faction, rotate: true });
      else if (!holds && this.has(p, 'splendid-guard') && uses < 1) out.push({ faction: p.faction, rotate: false });
    }
    if (this.has(p, 'prototype-simulacrum') && !p.used.sim) for (const q of this.opps(p.i)) if (KF_STEP[q.faction] === step && !out.some((o) => o.faction === q.faction)) out.push({ faction: q.faction, rotate: false, sim: true });
    return out;
  }
  async useFavour(p, o, rid) {
    const s = this.s;
    if (o.sim) p.used.sim = true; else p.used.kf = (p.used.kf || 0) + 1;
    const kf = CARDS.favour[o.faction];
    this.log(`${p.name} uses ${kf.name} (Kingdom's Favour).`);
    if (o.rotate && s.favour && s.favour.pi === p.i) {
      s.favour.val--;
      if (s.favour.val <= 0) { s.favour = null; this.log(`The Kingdom's Favour returns to the Harvest Field.`); }
    }
    switch (o.faction) {
      case 'nobility': {
        const ch = await this.choose(p.i, 'Regal Guard: choose one.', [{ id: 'inf', label: 'Gain 1 Influence', score: 1.2 }, { id: 'inv', label: 'Your Heir is Invulnerable for the rest of the Round', score: 1 }], { auto: false });
        if (ch === 'inf') this.gainInf(p, 1, 'Regal Guard'); else p.flags.regalGuard = true;
        break;
      }
      case 'uprising': {
        const look = await this.chooseRegion(p.i, 'Spy Network: look at all face-down cards in which Region?');
        const down = s.regions[look].cards.filter((x) => !x.up && x.card.owner !== p.i);
        if (p.human) this.peek(p, `${regionName(look)} face-down: ${down.map((x) => `${this.P(x.card.owner).short} ${x.card.name} (${x.card.str})`).join(', ') || 'none'}.`);
        const mine = this.downCards(p.i);
        const pool = [...p.hand, ...p.slots.filter((sl) => sl && sl.occ).map((sl) => sl.occ)];
        if (!mine.length || !pool.length) break;
        const out = await this.pick(p.i, 'Spy Network: you may swap one of your face-down cards. Pick the face-down card to swap out (or skip).', mine.map((x) => x.card), { optional: true, ai: 'weak' });
        if (!out) break;
        const inn = await this.pick(p.i, `Swap ${out.name} with which card from your hand or under a Kingdom Card?`, pool, { ai: 'strong' });
        this.swapIn(out, inn);
        break;
      }
      case 'clans': {
        if (!rid) break;
        const loc = await this.choose(p.i, 'Prophet of the Waves: move your Herald to a Location in this Region.', this.s.map[rid].map((l) => ({ id: l, label: locName(l), score: 1 })), { auto: false });
        p.herald = loc;
        let moved = 0;
        for (const [r2, R2] of Object.entries(s.regions)) {
          while (r2 !== rid && moved < 2 && (R2.fresh[p.i] || 0) > 0 && !R2.resolved) { R2.sup[p.i]--; R2.fresh[p.i]--; s.regions[rid].sup[p.i] = (s.regions[rid].sup[p.i] || 0) + 1; s.regions[rid].fresh[p.i] = (s.regions[rid].fresh[p.i] || 0) + 1; moved++; }
        }
        this.log(`${p.name}'s Herald moves to the ${locName(loc)}${moved ? ` and ${moved} Supporter(s) join this Region` : ''}.`);
        break;
      }
      case 'gathering': {
        if (!p.herald) break;
        const r = this.regOf(p.herald);
        const c = await this.pick(p.i, `Herald of the Moon: move one of your Active cards in the ${regionName(r)} to your hand.`, s.regions[r].cards.filter((x) => x.up && x.card.owner === p.i).map((x) => x.card), { optional: true, ai: 'strong' });
        if (c) { this.detach(c); this.toHand(c); this.log(`${c.name} returns to ${p.name}'s hand.`); }
        break;
      }
    }
  }
  peek(p, text) { this.s.peek = text; this.log(`(Only you can see this) ${text}`, 'peek'); }
  downCards(pi) { const out = []; for (const [rid, R] of Object.entries(this.s.regions)) for (const x of R.cards) if (x.card.owner === pi && !x.up) out.push({ card: x.card, rid, x }); return out; }
  // Put card `inn` where card `out` is (in a Region), and `out` where `inn` was.
  swapIn(out, inn) {
    const p = this.P(out.owner);
    const rid = this.regionOf(out), R = this.s.regions[rid];
    const x = R.cards.find((y) => y.card === out);
    const slot = p.slots.find((sl) => sl && sl.occ === inn);
    if (slot) slot.occ = out;
    else if (p.hand.includes(inn)) { this.takeFrom(p.hand, inn); p.hand.push(out); }
    this.reset(out); x.card = inn;
    this.log(`${p.name} swaps a card in the ${regionName(rid)}.`);
  }

  // ---- Tactics ---------------------------------------------------------
  tacticSetup(p, t) {
    const n = { 'sea-lanes': 3, safehouses: 3, 'martial-law': 2 }[t.k] || 0;
    const m = Math.min(n, p.markers); p.markers -= m; t.markers = m;
  }
  exhaust(p, t) {
    if (t.markers > 0) { t.markers--; p.markers++; if (t.markers === 0) t.exhausted = true; } else t.exhausted = true;
  }

  // =====================================================================
  async run() {
    await this.coach('intro');
    for (; this.s.round <= this.s.rounds; this.s.round++) {
      for (const p of this.s.players) { p.flags = {}; p.used = {}; }
      this.s.flags = {};
      if (this.s.round > 1) await this.startOfYear();
      else this.log(`— Round 1 —`, 'head');
      await this.spring();
      await this.summer();
      await this.autumn();
      await this.winter();
    }
    return this.finish();
  }

  async startOfYear() {
    this.step('year', 'Draw cards');
    this.log(`— Round ${this.s.round}: Start of the Year —`, 'head');
    await this.coach('year');
    for (const p of this.s.players) this.drawUpTo(p);
    const prev = this.s.order.slice();
    let order = prev.slice().sort((a, b) => this.P(b).inf - this.P(a).inf || prev.indexOf(b) - prev.indexOf(a));
    const pa = this.s.players.find((p) => this.has(p, 'propaganda-advisor'));
    if (pa) {
      const left = this.s.players.map((p) => p.i); order = [];
      while (left.length > 1) {
        const pick = +(await this.choose(pa.i, `Propaganda Advisor: who goes ${['first', 'second', 'third'][order.length]}?`, left.map((i) => ({ id: String(i), label: this.P(i).name, score: i === pa.i ? 1 : 0.5 })), { auto: false }));
        order.push(pick); left.splice(left.indexOf(pick), 1);
      }
      order.push(left[0]);
    }
    this.s.order = order;
    this.log(`Turn order: ${order.map((i) => this.P(i).name).join(', ')}.`);
  }

  // ================= SPRING =================
  async spring() {
    const s = this.s;
    this.step('spring', 'Place Bids');
    await this.coach('bid');
    const bids = {};
    // Bidding with Allies: players with Allies declare first, in turn order, then everyone else bids.
    for (const p of this.turn()) {
      const allies = p.hand.filter((c) => this.isAlly(c));
      if (!allies.length) continue;
      const c = await this.pick(p.i, 'You have an Ally in hand. Bid with an Ally now (everyone will know you did), or skip to bid normally.', allies, { key: 'bidAlly', optional: true, ai: 'none' });
      if (c) { this.takeFrom(p.hand, c); bids[p.i] = c; this.log(`${p.name} declares a Bid with an Ally.`); }
    }
    for (const p of this.turn()) {
      if (!p.hand.length || bids[p.i]) continue;
      const c = await this.pick(p.i, 'Bid: pick a card from your hand, face down. Only its Strength matters. The highest Bid picks a Kingdom Card first.', p.hand, { key: 'bid' });
      this.takeFrom(p.hand, c); bids[p.i] = c;
    }
    s.bids = bids;
    const bstr = {};
    for (const pi of Object.keys(bids).map(Number)) bstr[pi] = bids[pi].str + (this.has(this.P(pi), 'white-watchtowers') ? 5 : 0);
    this.log(`Bids revealed: ${Object.keys(bids).map((pi) => `${this.P(+pi).name} ${bids[pi].name} (${bstr[pi]})`).join(', ')}.`);
    for (const p of this.turn()) {
      const t = p.tactics.find((x) => x.k === 'royal-seal' && !x.exhausted);
      if (t && bids[p.i] && await this.yes(p.i, `Royal Seal (Tactic, once per game): set every opponent's Bidding Strength to 0 this Round?`, 'Use Royal Seal', 'Not now', this.opps(p.i).some((q) => bids[q.i] && bstr[q.i] >= bstr[p.i]) && s.round > 1 ? 1.5 : 0.2)) {
        this.exhaust(p, t);
        for (const q of this.opps(p.i)) if (bids[q.i]) bstr[q.i] = 0;
        this.log(`${p.name} plays Royal Seal: all opponents' Bids count as 0!`, 'warn');
      }
    }
    s.bstr = bstr;
    const seq = Object.keys(bids).map(Number).sort((a, b) => bstr[b] - bstr[a] || s.order.indexOf(a) - s.order.indexOf(b));
    this.step('spring', 'Resolve Bids');
    if (seq.length) await this.beat(`Bids revealed — ${seq.map((pi) => `${this.P(pi).short}: ${bids[pi].name}, Strength ${bstr[pi]}`).join(' · ')}. Highest goes first.`);
    let taken = false, first = true;
    for (const pi of seq) {
      const p = this.P(pi), card = bids[pi], str = bstr[pi];
      if (first && this.has(p, 'white-watchtowers')) this.gainInf(p, 1, 'White Watchtowers (first to resolve a Bid)');
      first = false;
      const opts = [];
      const seen = s.road.map((k, i) => k && { k, from: `road:${i}` }).filter(Boolean);
      if (this.has(p, 'old-kings-eye')) s.kdeck.slice(-2).reverse().forEach((k, i) => seen.push({ k, from: `deck:${i}` }));
      for (const r of seen) opts.push({ id: `take:${r.from}`, label: `Take ${r.k.name}${r.from.startsWith('deck') ? " (Old King's Eye: from the Kingdom Deck)" : ''}`, sub: kText(r.k), score: 1 + this.rand(), kcard: r.k.uid });
      if (!this.has(p, 'white-watchtowers')) {
        const stealStr = str + (this.has(p, 'emboldened-brigands') ? 3 : 0);
        for (const op of this.opps(pi)) op.slots.forEach((sl, si) => {
          if (!sl) return;
          const def = card.role === 'champion' ? 0 : (sl.occ ? sl.occ.str : 0) + (this.has(op, 'white-watchtowers') ? 5 : 0);
          if (stealStr > def) opts.push({ id: `steal:${op.i}:${si}`, label: `Steal ${sl.card.name} from ${op.name}`, sub: `Your ${stealStr} beats their guard's ${def}. ${kText(sl.card)}`, score: 1.6 + this.rand(), kcard: sl.card.uid });
        });
        for (const op of this.opps(pi)) op.ksupply.forEach((k) => {
          const def = card.role === 'champion' ? 0 : 10;
          if (k.isl && stealStr > def) opts.push({ id: `isteal:${op.i}:${k.uid}`, label: `Steal ${k.name} from ${op.name}'s Islands in the Sky`, sub: `Your ${stealStr} beats Strength ${def}. ${kText(k)}`, score: 1.6 + this.rand(), kcard: k.uid });
        });
      }
      opts.push({ id: 'return', label: `Take nothing — ${card.name} goes back to your hand`, score: 0.1 });
      await this.coach('bidUse', pi);
      const ch = await this.choose(pi, `Your Bid: ${card.name} (Strength ${str}). Choose what it gets you. The Bid card stays under the Kingdom Card to guard it.`, opts, { auto: false, key: 'bidUse', bid: card.uid });
      const [kind, a, b] = ch.split(':');
      if (kind === 'take') {
        let kc;
        if (a === 'road') { kc = s.road[+b]; s.road[+b] = null; taken = true; }
        else kc = s.kdeck.splice(s.kdeck.length - 1 - +b, 1)[0];
        await this.acquireKingdom(p, kc, card);
      } else if (kind === 'isteal') {
        const op = this.P(+a), k = op.ksupply.find((x) => x.uid === +b);
        this.takeFrom(op.ksupply, k); k.isl = false;
        this.log(`${p.name} steals ${k.name} from ${op.name}'s Islands in the Sky!`, 'warn');
        await this.acquireKingdom(p, k, card, true);
        for (const q of s.players) if (this.has(q, 'emboldened-brigands')) this.gainInf(q, 1, 'Emboldened Brigands (a Kingdom Card was stolen)');
      } else if (kind === 'steal') {
        const op = this.P(+a), sl = op.slots[+b];
        op.slots[+b] = null;
        if (sl.occ) this.toHand(sl.occ);
        if (sl.card.k === 'old-kings-signet') op.handSize = Math.max(3, op.handSize - 1);
        this.log(`${p.name} steals ${sl.card.name} from ${op.name}! ${sl.occ ? sl.occ.name : 'Its guard'} returns to their hand.`, 'warn');
        await this.acquireKingdom(p, sl.card, card, true);
        for (const q of s.players) if (this.has(q, 'emboldened-brigands')) this.gainInf(q, 1, 'Emboldened Brigands (a Kingdom Card was stolen)');
      } else { this.toHand(card); this.log(`${p.name} takes nothing; ${card.name} returns to hand.`); }
    }
    s.bids = null; s.bstr = null;
    this.repopulateRoad(taken);

    this.step('spring', 'Place Heralds');
    await this.coach('herald');
    for (const p of this.turn()) {
      const opts = REGIONS.flatMap((r) => this.s.map[r.id].map((l) => ({ id: l, label: `${LOCATIONS[l].name} (${r.name})`, sub: `${LOCATIONS[l].inf} Influence. ${LOCATIONS[l].text}`, score: LOCATIONS[l].inf + this.rand() * 1.5 })));
      p.herald = await this.choose(p.i, 'Place your Herald on a Location. If you win that Region and choose this Location, you get the Herald Reward: +1 Influence, and steal 1 from each rival Herald there.', opts, { auto: false, key: 'herald' });
      this.log(`${p.name} places their Herald on the ${locName(p.herald)}.`);
      if (this.wk.legendary) {
        const lopts = opts.filter((o) => o.id !== p.herald);
        p.legend = await this.choose(p.i, `Place your Legendary Creature piece (${p.lsupply[0] ? p.lsupply[0].name : 'it counts as a second Herald'}). It can't share a Location with your Herald. If you LOSE the Clash in its Region, its card comes to your hand.`, lopts, { auto: false, key: 'legend' });
        this.log(`${p.name} places their Legendary Creature on the ${locName(p.legend)}.`);
      }
    }

    this.step('spring', 'Place cards by Regions');
    await this.coach('place');
    // Allies first: in turn order, players may place up to one face-down Ally per Region.
    const allyRegions = {};
    for (const p of this.turn()) {
      allyRegions[p.i] = [];
      for (;;) {
        const allies = p.hand.filter((c) => this.isAlly(c));
        const free = REGIONS.map((r) => r.id).filter((r) => !allyRegions[p.i].includes(r));
        if (!allies.length || !free.length) break;
        const c = await this.pick(p.i, 'Place an Ally face down by a Region before the others place their cards? (One Ally per Region; skip to place normally.)', allies, { key: 'placeAlly', optional: true, ai: 'none' });
        if (!c) break;
        const rid = await this.chooseRegion(p.i, `Which Region for your Ally?`, free);
        this.takeFrom(p.hand, c); s.regions[rid].cards.push({ card: c, up: false, used: false });
        allyRegions[p.i].push(rid); this.log(`${p.name} places an Ally by the ${regionName(rid)}.`);
      }
    }
    for (const p of this.turn()) await this.placeCards(p, allyRegions[p.i]);
    this.log(`Everyone has placed their face-down cards.`);

    this.step('spring', 'Spring Actions');
    await this.coach('supporters');
    for (const p of this.turn()) await this.actionStep(p, 'spring');
  }

  async acquireKingdom(p, kc, occ, stolen = false) {
    const s = this.s;
    const bold = kc.bold || [];
    if (!stolen && bold.some((b) => b.startsWith('Burn your Bidding card'))) {
      if (occ) { this.reset(occ); s.burned.push(occ); }
      s.kdiscard.push(kc);
      if (kc.k === 'a-last-gift') { p.handSize = Math.min(8, p.handSize + 2); this.log(`${p.name} takes A Last Gift: their Bid card is Burned and their Hand Size rises to ${p.handSize}.`, 'inf'); }
      if (kc.k === 'the-sun-vault') { this.log(`${p.name} opens The Sun Vault (their Bid card is Burned).`); this.gainInf(p, Math.max(0, 7 - s.round), 'The Sun Vault'); }
      return;
    }
    if (!stolen && this.has(p, 'islands-in-the-sky') && !bold.length && await this.yes(p.i, `Islands in the Sky: keep ${kc.name} in your Supply instead of a Kingdom space? (Your Bid card is discarded; it counts as guarded by Strength 10.)`, 'Islands in the Sky', 'Use a Kingdom space', 1.2)) {
      if (occ) this.toDiscard(occ);
      kc.isl = true; p.ksupply.push(kc);
      this.log(`${p.name} keeps ${kc.name} on the Islands in the Sky.`);
      return;
    }
    if (!stolen && bold.some((b) => b.startsWith('Discard your Bidding card'))) {
      if (occ) this.toDiscard(occ);
      if (bold.some((b) => b.includes('in your Supply'))) { p.ksupply.push(kc); this.log(`${p.name} takes ${kc.name} into their Supply (their Bid card is discarded).`); }
      else if (bold.some((b) => b.includes('on a Region'))) {
        const rid = await this.chooseRegion(p.i, `${kc.name}: place it on which Region?`, undefined, { key: 'kRegion' });
        s.regions[rid].ks.push({ card: kc, owner: p.i });
        this.log(`${p.name} takes ${kc.name} and places it on the ${regionName(rid)}.`);
      } else if (bold.some((b) => b.includes('on a Location'))) {
        const loc = await this.choose(p.i, `${kc.name}: place it on which Location?`, Object.keys(LOCATIONS).map((l) => ({ id: l, label: locName(l), score: LOCATIONS[l].inf + this.rand() })), { key: 'kLoc' });
        (s.locKs[loc] = s.locKs[loc] || []).push({ card: kc, owner: p.i });
        this.log(`${p.name} takes ${kc.name} and places it on the ${locName(loc)}.`);
      } else if (kc.k === 'the-beacon') {
        s.kdiscard.push(kc);
        this.log(`${p.name} takes The Beacon (their Bid card is discarded).`);
        if (p.site.length) {
          const min = Math.min(...p.site.map((c) => c.cost));
          const c = await this.pick(p.i, 'The Beacon: acquire the cheapest card on your Site of Power.', p.site.filter((x) => x.cost === min), { ai: 'strong' });
          if (c) await this.acquireSite(p, c);
        }
      }
    } else {
      let si = p.slots.findIndex((x) => !x);
      if (si < 0 && p.slots.length < this.maxSlots(p)) { p.slots.push(null); si = p.slots.length - 1; }
      if (si < 0) {
        si = +(await this.choose(p.i, `Your Kingdom Card spaces are full. Which one does ${kc.name} replace? (The old one is discarded and its guard returns to your hand.)`, p.slots.map((x, i) => ({ id: String(i), label: `Replace ${x.card.name}`, sub: kText(x.card), score: -(x.occ ? x.occ.str : 0) })), { auto: false, key: 'slot' }));
        await this.discardKingdom(p.slots[si].card, false);
        if (si >= p.slots.length) { p.slots.push(null); si = p.slots.length - 1; }
      }
      p.slots[si] = { card: kc, occ };
      if (occ) this.reset(occ);
      this.log(`${p.name} ${stolen ? 'now holds' : 'takes'} ${kc.name}${occ ? `, guarded by ${occ.name} (${occ.str})` : ''}.`);
      if (kc.k === 'old-kings-signet') { p.handSize = Math.min(8, p.handSize + 1); this.log(`${p.name}'s Hand Size rises to ${p.handSize}.`); }
    }
    if (this.hasHQ(p, 'UPRISING-19')) {
      const c = kc.suit;
      const m = (s.cmarks[c][p.i] = s.cmarks[c][p.i] || {});
      if ((m.syn || 0) < 2 && p.markers > 0) { m.syn = (m.syn || 0) + 1; p.markers--; this.log(`The Syndicate: ${p.name} places a Faction Marker on the ${councilName(c)}.`); }
    }
  }
  // Discard a Kingdom Card from wherever it is. Its guard returns to hand, or is discarded with `withOcc`.
  async discardKingdom(kc, withOcc) {
    const s = this.s;
    if (!kc) return;
    for (const p of s.players) {
      const si = p.slots.findIndex((sl) => sl && sl.card === kc);
      if (si >= 0) {
        const sl = p.slots[si]; p.slots[si] = null;
        if (sl.occ) { if (withOcc) this.toDiscard(sl.occ); else this.toHand(sl.occ); }
        if (kc.k === 'old-kings-signet') p.handSize = Math.max(3, p.handSize - 1);
      }
      if (p.ksupply.includes(kc)) this.takeFrom(p.ksupply, kc);
    }
    for (const R of Object.values(s.regions)) R.ks = R.ks.filter((k) => k.card !== kc);
    for (const l of Object.keys(s.locKs)) s.locKs[l] = s.locKs[l].filter((k) => k.card !== kc);
    s.kdiscard.push(kc);
  }
  repopulateRoad(taken) {
    const s = this.s;
    const left = s.road.filter(Boolean);
    const drop = taken ? 1 : 2;
    for (let n = 0; n < drop && left.length; n++) s.kdiscard.push(left.pop());
    while (left.length < 4) { const c = this.drawKingdom(); if (!c) break; left.unshift(c); }
    s.road = left;
    this.log(`The Great Road slides along: the oldest card${drop > 1 ? 's are' : ' is'} discarded and new Kingdom Cards are revealed.`);
  }

  async placeCards(p, skip = []) {
    const s = this.s;
    let free = REGIONS.map((r) => r.id).filter((r) => !skip.includes(r));
    if (p.human) {
      // People drag cards onto whichever Region they like: the answer is {uid, rid} (or a uid for the first free Region).
      while (p.hand.length && free.length) {
        const ans = await this.ask(p.i, { key: 'place', text: p.hand.length >= free.length ? `Drag a card face down onto a Region (${free.map(regionName).join(', ')} still need one).` : `You have fewer cards than Regions left: drag your cards onto the Regions you want.`, cards: p.hand.map((c) => c.uid), regions: free });
        const uid = typeof ans === 'object' && ans ? ans.uid : ans;
        const rid = typeof ans === 'object' && ans && free.includes(ans.rid) ? ans.rid : free[0];
        const c = p.hand.find((x) => x.uid === uid) || p.hand[0];
        this.takeFrom(p.hand, c); s.regions[rid].cards.push({ card: c, up: false, used: false });
        free = free.filter((r) => r !== rid);
      }
      return;
    }
    if (p.hand.length >= free.length) {
      for (const rid of free) {
        const c = await this.pick(p.i, `Place a face-down card next to the ${regionName(rid)}. You must put one card by each Region.`, p.hand, { key: 'place', region: rid });
        this.takeFrom(p.hand, c); s.regions[rid].cards.push({ card: c, up: false, used: false });
      }
    } else {
      while (p.hand.length && free.length) {
        const rid = await this.chooseRegion(p.i, `You have fewer than 3 cards, so choose which Regions get one.`, free, { key: 'placeRegion', scores: Object.fromEntries(free.map((r) => [r, p.herald && this.regOf(p.herald) === r ? 2 : this.rand()])) });
        free = free.filter((r) => r !== rid);
        const c = await this.pick(p.i, `Card for the ${regionName(rid)}:`, p.hand, { key: 'place', region: rid });
        this.takeFrom(p.hand, c); s.regions[rid].cards.push({ card: c, up: false, used: false });
      }
    }
  }

  // ================= ACTION STEPS =================
  // One menu for every optional thing a player can do in a step (Spring, Day, Autumn).
  async actionStep(p, step, rid = null) {
    for (let guard = 0; guard < 60; guard++) {
      const acts = this.actions(p, step, rid);
      if (!acts.length) return;
      acts.push({ id: 'done', label: step === 'spring' ? 'Done with Spring Actions' : step === 'day' ? 'No more Day Actions' : 'End my Autumn', score: 0.35 });
      const text = step === 'spring' ? `Spring Actions: place Supporters (${p.supporters} on your board) and use any Spring Actions.`
        : step === 'day' ? `Day Actions in the ${regionName(rid)}: use Commands on your revealed cards, Kingdom Cards or Tactics.`
          : 'Autumn: you may Govern once and Journey once, and use any Actions or Commands.';
      const ch = await this.choose(p.i, text, acts.map(({ run, ...o }) => o), { auto: false, key: 'action', step, region: rid });
      if (ch === 'done') return;
      const a = acts.find((x) => x.id === ch);
      await a.run();
      if (a.end) return;
    }
  }

  actions(p, step, rid) {
    const A = [];
    const add = (id, label, sub, score, run, end) => A.push({ id, label, sub, score, run, end });
    const once = (key) => !p.used[key];
    const mark = (key) => { p.used[key] = true; };
    const kOwned = this.kOwned(p);
    const kact = (k, season) => kOwned.some((c) => c.k === k) && once('k:' + k + season);

    for (const o of this.kfOptions(p, step)) {
      if (step === 'day' && !rid) continue;
      const kf = CARDS.favour[o.faction];
      add(`kf:${o.faction}`, `${kf.name} (Kingdom's Favour${o.sim ? ' via Prototype Simulacrum' : ''})`, kf.rules[0].text, 1.1, () => this.useFavour(p, o, rid));
    }
    for (const t of p.tactics) {
      if (t.exhausted) continue;
      if ((t.rules[0] || {}).season === step) {
        const run = this.tacticRun(p, t, rid);
        if (run) add(`t:${t.k}`, `${t.name} (Tactic${t.markers ? `, ${t.markers} marker${t.markers > 1 ? 's' : ''} left` : ', once per game'})`, t.rules.map((x) => `${cap(x.season)}: ${x.text}`).join(' '), run.score, run.go);
      }
    }
    if (step === 'spring') {
      const s = this.s;
      if (p.supporters > 0) for (const r of REGIONS) add(`sup:${r.id}`, `+1 Supporter in the ${r.name}`, "Each Supporter is +1 Strength in that Region's Clash, then goes to the Lost Pile in Winter.", this.supporterScore(p, r.id), async () => {
        p.supporters--; s.regions[r.id].sup[p.i] = (s.regions[r.id].sup[p.i] || 0) + 1; s.regions[r.id].fresh[p.i] = (s.regions[r.id].fresh[p.i] || 0) + 1;
        this.log(`${p.name} places a Supporter in the ${r.name}.`);
      });
      // Near & Far (Aeronauts): counts as a Supporter worth 3 Strength
      if (p.nf === 'board') for (const r of REGIONS) add(`nf:${r.id}`, `Send the Near & Far to the ${r.name}`, 'It counts as a Supporter worth 3 Strength, and returns to your board in Winter.', this.supporterScore(p, r.id) + 0.3, async () => {
        p.nf = r.id; s.regions[r.id].nf = p.i; s.regions[r.id].nfFresh = true;
        this.log(`${p.name} sends the Near & Far to the ${r.name}.`);
      });
      // Boons (Whispering Tower): place face down on your face-down cards, up to two per card
      const downs = this.downCards(p.i).filter((x) => (x.card.boons || []).length < 2);
      if (p.boons.length && downs.length) add('boons', `Place Boons on your face-down cards (${p.boons.length} in your Supply)`, 'Up to two per card. They are revealed with the card and stay on it while it is Active.', 1.2, async () => {
        for (;;) {
          const left = this.downCards(p.i).filter((x) => (x.card.boons || []).length < 2);
          if (!p.boons.length || !left.length) break;
          const ch = await this.choose(p.i, 'Which Boon? (Or finish.)', [...p.boons.map((b) => ({ id: String(b.bid), label: boonLabel(b), score: 1 })), { id: 'stop', label: 'Finish placing Boons', score: 0.3 }], { auto: false, key: 'boon' });
          if (ch === 'stop') break;
          const b = p.boons.find((x) => String(x.bid) === ch);
          const c = await this.pick(p.i, `Put "${boonLabel(b)}" on which face-down card?`, left.map((x) => x.card), { ai: 'strong' });
          this.takeFrom(p.boons, b); c.boons.push(b);
          this.log(`${p.name} places a Boon face down on a card by the ${regionName(this.regionOf(c))}.`);
        }
      });
      for (const c of p.hand) if (this.hasCmd(c, 'spring', 'deploy') && once('dep:' + c.uid)) add(`dep:${c.uid}`, `Deploy ${c.name} (Engineers' Workshop)`, 'Place it face up by a Region with 1 Influence on it.', 0.6, async () => { mark('dep:' + c.uid); await this.deploy(p, c); });
      this.springKingdom(p, kact, mark, add);
    }
    if (step === 'day' && rid) this.dayActions(p, rid, kact, mark, add);
    if (step === 'autumn') this.autumnActions(p, kact, mark, add, once);
    return A;
  }

  supporterScore(p, rid) {
    const placed = Object.values(this.s.regions).reduce((a, r) => a + (r.sup[p.i] || 0), 0);
    const herald = p.herald && this.regOf(p.herald) === rid;
    const budget = this.s.round === this.s.rounds ? 5 : p.supporters >= 4 ? 2 : 1;
    if (placed >= budget) return 0;
    return (herald ? 0.9 : 0.3) + this.rand() * 0.3;
  }

  springKingdom(p, kact, mark, add) {
    const s = this.s;
    const K = (k, label, sub, score, fn) => { if (kact(k, 'spring')) add(`k:${k}`, label, sub, score, async () => { mark('k:' + k + 'spring'); await fn(); }); };
    const own = (k) => this.kOwned(p).find((c) => c.k === k);
    const inAny = Object.values(s.councils).some((c) => c.some((e) => e.owner === p.i));
    const inEach = Object.values(s.councils).every((c) => c.some((e) => e.owner === p.i));
    K('monument-builders', 'Monument Builders', 'Gain 1 Influence if you have a card in any Council; if you have one in each, you may discard this for 2 more.', inAny ? 2 : 0, async () => {
      if (inAny) this.gainInf(p, 1, 'Monument Builders');
      if (inEach && await this.yes(p.i, 'Monument Builders: discard it to gain 2 more Influence?', 'Discard for +2', 'Keep it', 1.2)) { await this.discardKingdom(own('monument-builders'), false); this.gainInf(p, 2, 'Monument Builders'); }
    });
    K('forgotten-palace', 'Forgotten Palace', 'Burn one of your Tactics to gain 1 Lore (3 if it was unexhausted).', p.tactics.some((t) => t.exhausted) ? 0.8 : 0, async () => {
      const t = await this.choose(p.i, 'Burn which Tactic?', p.tactics.map((x) => ({ id: x.k, label: `${x.name}${x.exhausted ? ' (exhausted)' : ''}`, score: x.exhausted ? 2 : 0.5 })), { auto: false });
      const tt = p.tactics.find((x) => x.k === t); p.tactics.splice(p.tactics.indexOf(tt), 1); p.markers += tt.markers;
      await this.gainLore(p, tt.exhausted ? 1 : 3, 'Forgotten Palace');
    });
    K('remote-bothies', 'Remote Bothies', 'No Lore in your Supply: gain 1 Influence. Otherwise gain 1 Lore.', 1.5, async () => { if (p.lore === 0) this.gainInf(p, 1, 'Remote Bothies'); else await this.gainLore(p, 1, 'Remote Bothies'); });
    K('forged-royal-pardons', 'Forged Royal Pardons', 'Move any card from your Discard Pile to your hand.', p.discard.length ? 1.4 : 0, async () => {
      const c = await this.pick(p.i, 'Which card from your Discard Pile?', p.discard, { ai: 'strong' }); if (c) { this.detach(c); this.toHand(c); this.log(`${p.name} takes ${c.name} back from their Discard Pile.`); }
    });
    K('rumours-in-the-dark', 'Rumours in the Dark', 'Chosen players put their hand on the bottom of their Deck and draw that many.', 0.3, async () => {
      for (const q of s.players) {
        if (!q.hand.length) continue;
        if (await this.yes(p.i, `Rumours in the Dark: make ${q.i === p.i ? 'yourself' : q.name} put their hand on the bottom of their Deck and draw new cards?`, 'Yes', 'No', q.i === p.i ? 0.2 : 1)) {
          const n = q.hand.length; for (const c of q.hand.splice(0)) this.toDeckBottom(c);
          for (let k = 0; k < n; k++) if (q.deck.length) q.hand.push(q.deck.pop());
          this.log(`${q.name} cycles their hand (Rumours in the Dark).`);
        }
      }
    });
    if (kact('clockwork-messengers', 'spring')) this.clockwork(p, add, mark, 'spring');
    K('the-innkeeper', 'The Innkeeper', 'Look at all face-down cards in a Region, then you may swap two of your face-down cards.', 0.5, async () => {
      const r = await this.chooseRegion(p.i, 'The Innkeeper: look at which Region?');
      if (p.human) this.peek(p, `${regionName(r)} face-down: ${s.regions[r].cards.filter((x) => !x.up && x.card.owner !== p.i).map((x) => `${this.P(x.card.owner).short} ${x.card.name} (${x.card.str})`).join(', ') || 'none'}.`);
      const mine = this.downCards(p.i);
      if (mine.length < 2) return;
      const a = await this.pick(p.i, 'Swap two of your face-down cards? Pick the first (or skip).', mine.map((x) => x.card), { optional: true, ai: 'none' });
      if (!a) return;
      const b = await this.pick(p.i, 'Swap it with which card?', mine.map((x) => x.card).filter((c) => c !== a));
      this.swapPositions(a, b);
    });
    K('the-boatman', 'The Boatman', 'Swap a card in your hand with one of your cards in the Lost Pile.', s.lost.some((c) => c.owner === p.i && c.str >= 6) && p.hand.length ? 1.2 : 0, async () => {
      const lost = s.lost.filter((c) => c.owner === p.i);
      if (!lost.length || !p.hand.length) return;
      const inn = await this.pick(p.i, 'The Boatman: take which card from the Lost Pile?', lost, { ai: 'strong' });
      const out = await this.pick(p.i, 'and put which card from your hand into the Lost Pile?', p.hand, { ai: 'weak' });
      this.detach(inn); this.toHand(inn); this.detach(out); this.toLost(out);
      this.log(`${p.name} swaps ${out.name} for ${inn.name} from the Lost Pile.`);
    });
    K('old-enchantress', 'Old Enchantress', 'Burn this card. Then acquire up to two cards from the Great Road, Occupying them with cards from your hand.', p.hand.length > 2 ? 1 : 0, async () => {
      const kc = own('old-enchantress');
      await this.discardKingdom(kc, false); this.takeFrom(s.kdiscard, kc); s.burned.push(kc);
      for (let n = 0; n < 2 && p.hand.length; n++) {
        const opts = s.road.map((k, i) => k && { id: String(i), label: `Take ${k.name}`, sub: kText(k), score: 1 + this.rand() }).filter(Boolean);
        opts.push({ id: 'stop', label: 'Stop', score: 0.2 });
        const ch = await this.choose(p.i, `Old Enchantress: acquire a card from the Great Road (${2 - n} left)?`, opts, { auto: false });
        if (ch === 'stop') break;
        const occ = await this.pick(p.i, 'Occupy it with which card from your hand?', p.hand, { ai: 'weak' });
        this.takeFrom(p.hand, occ);
        const k = s.road[+ch]; s.road[+ch] = null;
        await this.acquireKingdom(p, k, occ);
      }
      const left = s.road.filter(Boolean); while (left.length < 4) { const c = this.drawKingdom(); if (!c) break; left.unshift(c); } s.road = left;
    });
    K('the-sirens-pool', "The Siren's Pool", 'Choose a Location and move any number of Heralds there. Discard this card.', 0.3, async () => {
      const loc = await this.choose(p.i, "The Siren's Pool: which Location?", Object.keys(LOCATIONS).map((l) => ({ id: l, label: locName(l), score: l === p.herald ? 2 : this.rand() })), { auto: false });
      for (const q of s.players) if (q.herald !== loc && await this.yes(p.i, `Move ${q.i === p.i ? 'your' : q.name + "'s"} Herald to the ${locName(loc)}?`, 'Move it', 'Leave it', q.i === p.i ? 1 : 0.3)) q.herald = loc;
      await this.discardKingdom(own('the-sirens-pool'), false);
      this.log(`${p.name} uses The Siren's Pool.`);
    });
    K('cracked-sundial', 'Cracked Sundial', 'Place this on a Region and discard its guard. Skip the Day and Night Steps of every Clash there. Discarded in Winter.', 0.15, async () => {
      const kc = own('cracked-sundial');
      const si = p.slots.findIndex((x) => x && x.card === kc);
      const r = await this.chooseRegion(p.i, 'Cracked Sundial: place it on which Region?');
      if (si >= 0) { const sl = p.slots[si]; p.slots[si] = null; if (sl.occ) this.toDiscard(sl.occ); }
      this.takeFrom(p.ksupply, kc);
      s.regions[r].ks.push({ card: kc, owner: p.i });
      this.log(`${p.name} places the Cracked Sundial on the ${regionName(r)}: no Day or Night Steps there this Round.`);
    });
    K('unnatural-abundance', 'Unnatural Abundance', 'For the rest of the Round, no Herald Rewards may be claimed and all other Influence gains are doubled. Discard this card.', 0.6, async () => {
      s.flags.abundance = true; await this.discardKingdom(own('unnatural-abundance'), false);
      this.log(`${p.name} calls an Unnatural Abundance: no Herald Rewards, all other Influence doubled this Round!`, 'warn');
    });
    K('arrows-bright-true', 'Arrows, Bright & True', 'For the rest of the Round, all Invulnerable (printed and gained) is blank.', 0.4, async () => {
      s.flags.arrows = true; this.log(`${p.name} looses Arrows, Bright & True: nothing is Invulnerable this Round.`, 'warn');
    });
    K('odd-arrivals-at-court', 'Odd Arrivals at Court', 'Rearrange any number of cards at the Councils between Councils.', Object.values(s.councils).flat().length ? 0.5 : 0, async () => {
      for (let n = 0; n < 12; n++) {
        const all = Object.entries(s.councils).flatMap(([k, list]) => list.map((e) => ({ k, e })));
        if (!all.length) break;
        const c = await this.pick(p.i, 'Odd Arrivals at Court: move which Council card? (Or finish.)', all.map((x) => x.e.card), { optional: true, ai: 'none' });
        if (!c) break;
        const from = all.find((x) => x.e.card === c);
        const to = await this.choose(p.i, `Move ${c.name} to which Council?`, COUNCILS.filter((x) => x.id !== from.k).map((x) => ({ id: x.id, label: x.name, score: 1 })), { auto: false });
        s.councils[from.k].splice(s.councils[from.k].indexOf(from.e), 1); s.councils[to].push(from.e);
        this.log(`${c.name} moves to the ${councilName(to)}.`);
      }
    });
    K('grand-tourney', 'Grand Tourney', 'Everyone places a face-down card; same Strengths are discarded, the highest wins and claims any Location Reward. Discard this card.', p.hand.some((c) => c.str >= 8) ? 0.8 : 0.1, () => this.grandTourney(p));
  }

  clockwork(p, add, mark, season) {
    const pool = [...Object.values(this.s.councils).flat().filter((e) => e.owner === p.i).map((e) => e.card), ...p.slots.filter((x) => x && x.occ).map((x) => x.occ)];
    if (!pool.length || !p.hand.length) return;
    add('k:clockwork-messengers', 'Clockwork Messengers', 'Swap a card in your hand with one of your cards in a Council or guarding a Kingdom Card.', 0.3, async () => {
      mark('k:clockwork-messengers' + season);
      const out = await this.pick(p.i, 'Clockwork Messengers: which card in a Council or under a Kingdom Card?', pool, { ai: 'strong' });
      const inn = await this.pick(p.i, 'Swap it with which card from your hand?', p.hand, { ai: 'votes' });
      const sl = p.slots.find((x) => x && x.occ === out);
      this.takeFrom(p.hand, inn); this.reset(inn);
      if (sl) sl.occ = inn; else for (const k of Object.keys(this.s.councils)) { const e = this.s.councils[k].find((y) => y.card === out); if (e) e.card = inn; }
      this.reset(out); p.hand.push(out);
      this.log(`${p.name} swaps ${out.name} with ${inn.name} (Clockwork Messengers).`);
    });
  }

  swapPositions(a, b) {
    const ra = this.regionOf(a), rb = this.regionOf(b);
    const xa = this.s.regions[ra].cards.find((x) => x.card === a), xb = this.s.regions[rb].cards.find((x) => x.card === b);
    xa.card = b; xb.card = a;
    this.log(`${this.P(a.owner).name}'s cards in the ${regionName(ra)} and the ${regionName(rb)} swap places.`);
  }

  async grandTourney(p) {
    await this.discardKingdom(this.kOwned(p).find((k) => k.k === 'grand-tourney'), false);
    const put = {};
    for (const q of this.turn()) if (q.hand.length) { const c = await this.pick(q.i, 'Grand Tourney: place a card face down. Cards with the same Strength are discarded; the highest remaining wins a Location Reward. The others return to hand.', q.hand, { key: 'tourney', ai: 'strong' }); this.takeFrom(q.hand, c); put[q.i] = c; }
    const cs = Object.values(put);
    this.log(`Grand Tourney: ${cs.map((c) => `${this.P(c.owner).short} ${c.name} (${c.str})`).join(', ')}.`);
    const counts = {}; cs.forEach((c) => (counts[c.str] = (counts[c.str] || 0) + 1));
    const remain = cs.filter((c) => counts[c.str] === 1);
    cs.filter((c) => counts[c.str] > 1).forEach((c) => this.toDiscard(c));
    remain.forEach((c) => this.toHand(c));
    if (!remain.length) { this.log('Every card was discarded — nobody wins the Grand Tourney.'); return; }
    const w = remain.sort((a, b) => b.str - a.str)[0].owner;
    const loc = await this.choose(w, 'You won the Grand Tourney! Claim which Location Reward?', Object.keys(LOCATIONS).map((l) => ({ id: l, label: `${locName(l)}: ${LOCATIONS[l].inf} Influence`, sub: LOCATIONS[l].text, score: LOCATIONS[l].inf + this.rand() })), { auto: false, key: 'loc' });
    this.log(`${this.P(w).name} wins the Grand Tourney and claims the ${locName(loc)}.`);
    await this.claimLocation(this.P(w), loc, null, false);
  }

  async deploy(p, c) {
    const r = await this.chooseRegion(p.i, `Deploy ${c.name}: place it face up next to which Region? It stays there into next year while it has Influence on it.`, REGIONS.map((x) => x.id), { scores: Object.fromEntries(REGIONS.map((x) => [x.id, x.id === 'plat' ? 1 : this.rand()])) });
    const x = (this.cmds(c).find((y) => y.cmd === 'deploy') || {}).arg || '1';
    this.detach(c);
    this.reset(c);
    c.inf = +x || 1;
    this.s.regions[r].cards.push({ card: c, up: true, used: this.s.season === 'autumn' });
    this.log(`${p.name} Deploys ${c.name} by the ${regionName(r)} with ${c.inf} Influence on it.`);
  }

  // Martial Law: can `pi` add/move a card into Region `rid` right now?
  blocked(pi, rid) {
    const R = this.s.regions[rid];
    return R.martial != null && R.martial !== pi && !R.firstDone;
  }

  dayActions(p, rid, kact, mark, add) {
    const s = this.s, R = s.regions[rid];
    if (R.ks.some((k) => k.card.k === 'cracked-sundial')) return;
    const mine = R.cards.filter((x) => x.up && !x.used && x.card.owner === p.i);
    const unresolved = REGIONS.map((r) => r.id).filter((r) => r !== rid && !s.regions[r].resolved && !this.blocked(p.i, r));
    const theirs = this.opps(p.i).reduce((a, q) => a + R.cards.filter((x) => x.up && !x.used && x.card.owner === q.i).reduce((b, x) => b + this.str(x.card), 0) + (R.fresh[q.i] || 0), 0);
    const myStr = mine.reduce((a, x) => a + this.str(x.card), 0) + (R.fresh[p.i] || 0);
    for (const x of mine) {
      const c = x.card, used = (c.ctmp.usedCmd = c.ctmp.usedCmd || {});
      const one = this.base(c).oneOf && (used.ambush || used.retreat);
      if (this.hasCmd(c, 'day', 'ambush', rid) && !used.ambush && !one && !this.blocked(p.i, rid)) {
        const fromDiscard = c.tmp.doorDiscard && p.discard.length;
        if (p.hand.length || fromDiscard) add(`amb:${c.uid}`, `Ambush with ${c.name}: add a card from your ${fromDiscard ? 'hand or Discard Pile' : 'hand'}`, 'The new card is revealed at the end of the Day.', myStr <= theirs + 3 && p.hand.some((h) => h.str >= 4) ? 1.3 : 0.15, async () => {
          used.ambush = true;
          const pool = fromDiscard ? [...p.hand, ...p.discard] : p.hand;
          const card = await this.pick(p.i, 'Ambush: which card joins this Clash? (Revealed at the end of the Day.)', pool, { key: 'ambushCard', ai: 'strong', region: rid });
          this.detach(card); this.reset(card);
          R.cards.push({ card, up: false, used: false });
          this.log(`${p.name} Ambushes: a hidden card joins the ${regionName(rid)}.`);
        });
      }
      if (this.hasCmd(c, 'day', 'retreat', rid) && !used.retreat && !one) add(`ret:${c.uid}`, `Retreat with ${c.name}: pull your cards and Supporters out of this Region`, 'Your Active cards here go back to your hand and your Supporters here go back to your board.', theirs > myStr + 4 ? 0.9 : 0.05, async () => {
        used.retreat = true;
        const smuggle = c.ctmp.smuggler;
        const back = R.cards.filter((y) => !y.used && y.card.owner === p.i).map((y) => y.card);
        for (const y of back) { this.detach(y); this.toHand(y); }
        const sup = R.fresh[p.i] || 0; p.supporters += sup; R.sup[p.i] = (R.sup[p.i] || 0) - sup; R.fresh[p.i] = 0;
        if (R.nf === p.i) { R.nf = null; R.nfFresh = false; p.nf = 'board'; }
        this.log(`${p.name} Retreats from the ${regionName(rid)}: ${back.map((y) => y.name).join(', ') || 'no cards'} back to hand${sup ? `, ${sup} Supporter(s) back to their board` : ''}.`);
        if (smuggle && this.loreOf(c) > 0 && await this.yes(p.i, `Smuggler's Pass: Journey with ${c.name}?`, 'Journey', 'No', 1)) await this.journey(p, c, "Smuggler's Pass");
      }, true);
      if (this.hasCmd(c, 'day', 'flank', rid) && !used.flank && unresolved.length) add(`flank:${c.uid}`, `Flank with ${c.name}: move it to a Region that hasn't fought yet`, 'It leaves this Clash and becomes Active in the new Region.', myStr - this.str(c) > theirs ? 0.7 : 0.15, async () => {
        const to = await this.chooseRegion(p.i, `Flank ${c.name} to which Region?`, unresolved);
        R.cards.splice(R.cards.indexOf(x), 1);
        s.regions[to].cards.push({ card: c, up: true, used: false });
        c.ctmp = { usedCmd: { flank: true } };
        this.log(`${p.name}'s ${c.name} Flanks from the ${regionName(rid)} to the ${regionName(to)}.`);
        if (c.role === 'rook') {
          const n = R.fresh[p.i] || 0;
          if (n && await this.yes(p.i, `Rook the Engineer: move your ${n} Supporter(s) here with it?`, 'Move them', 'Leave them', 1)) { R.fresh[p.i] = 0; R.sup[p.i] -= n; s.regions[to].sup[p.i] = (s.regions[to].sup[p.i] || 0) + n; s.regions[to].fresh[p.i] = (s.regions[to].fresh[p.i] || 0) + n; }
          for (const y of R.cards.filter((z) => z.up && !z.used && z.card.owner === p.i).slice()) if (await this.yes(p.i, `Rook the Engineer: move ${y.card.name} with it?`, 'Move it', 'Leave it', 0.3)) { R.cards.splice(R.cards.indexOf(y), 1); s.regions[to].cards.push(y); }
        }
        if (this.textIs(c, 'CLANS-16', rid) && (R.fresh[p.i] || 0) > 0 && await this.yes(p.i, `Raid & Raze: move your ${R.fresh[p.i]} Supporter(s) here with it?`, 'Move them', 'Leave them', 1)) {
          const n = R.fresh[p.i]; R.fresh[p.i] = 0; R.sup[p.i] -= n; s.regions[to].sup[p.i] = (s.regions[to].sup[p.i] || 0) + n; s.regions[to].fresh[p.i] = (s.regions[to].fresh[p.i] || 0) + n;
        }
      });
      if (this.textIs(c, 'GATHERING-17', rid) && !c.tmp.tooth && s.lost.some((y) => y.owner === p.i)) add(`tooth:${c.uid}`, 'Ritual of the Tooth: Burn one of your Lost cards to add its Strength and abilities', '', 0.8, async () => {
        const b = await this.pick(p.i, 'Burn which of your cards in the Lost Pile?', s.lost.filter((y) => y.owner === p.i), { ai: 'strong' });
        this.takeFrom(s.lost, b); s.burned.push(b);
        c.tmp.tooth = true; c.tmp.addStr = (c.tmp.addStr || 0) + (b.str || 0); (c.tmp.extra = c.tmp.extra || []).push(b);
        this.log(`${p.name} Burns ${b.name}: Ritual of the Tooth gains Strength ${b.str} and its abilities this Round.`);
      });
    }
    // Boon and Aeronaut Day actions on your Active cards here
    for (const x of mine) {
      const c = x.card, key = (n) => `b${n}:${c.uid}`;
      if (this.hasBoon(c, 3) && !p.used[key(3)] && s.lost.some((y) => y.owner === p.i)) add(key(3), `Boon on ${c.name}: swap it with one of your Lost cards`, '', 0.5, async () => {
        p.used[key(3)] = true;
        const inn = await this.pick(p.i, 'Bring which of your Lost cards into this Clash?', s.lost.filter((y) => y.owner === p.i), { ai: 'strong' });
        this.takeFrom(s.lost, inn); this.reset(inn); x.card = inn; this.toLost(c);
        this.log(`${p.name} swaps ${c.name} for ${inn.name} from the Lost Pile (Boon).`);
      });
      if (this.hasBoon(c, 20) && !p.used[key(20)] && p.hand.length) add(key(20), `Boon on ${c.name}: swap it with a card from your hand`, '', 0.6, async () => {
        p.used[key(20)] = true;
        const inn = await this.pick(p.i, 'Swap in which card from your hand?', p.hand, { ai: 'strong' });
        this.takeFrom(p.hand, inn); x.card = inn; this.toHand(c);
        this.log(`${p.name} swaps ${c.name} for ${inn.name} from their hand (Boon).`);
      });
      if (this.hasBoon(c, 5) && !p.used[key(5)]) add(key(5), `Boon on ${c.name}: discard every card in this Clash with Strength 3 or less`, '', 0.5, async () => {
        p.used[key(5)] = true;
        for (const y of R.cards.filter((z) => z.up && !z.used && this.str(z.card) <= 3)) { this.detach(y.card); this.toDiscard(y.card); this.log(`${y.card.name} is discarded (Boon).`); }
      });
      if (c.role === 'waxwing' && !p.used[key('wax')]) {
        const others = this.activeCards(null).filter((a) => a.rid !== rid);
        add(key('wax'), `Waxwing the Sniper: gain Deadly this Round${others.length ? ', or shoot an Active card in another Region' : ''}`, 'Either way, Waxwing can no longer Retreat this Round.', 0.9, async () => {
          p.used[key('wax')] = true;
          const ch = await this.choose(p.i, 'Waxwing the Sniper: choose one.', [{ id: 'deadly', label: 'Waxwing gains Deadly until the end of the Round', score: 1 }, ...(others.length ? [{ id: 'shoot', label: 'Move an Active card in another Region to its owner\'s Discard Pile', score: 0.9 }] : [])], { auto: false });
          if (ch === 'deadly') c.tmp.deadlyRound = true;
          else {
            const v = await this.pick(p.i, 'Which Active card in another Region?', others.filter((a) => a.card.owner !== p.i).map((a) => a.card).concat(others.filter((a) => a.card.owner === p.i).map((a) => a.card)), { ai: 'strong' });
            if (v) { this.detach(v); this.toDiscard(v); this.log(`Waxwing shoots ${v.name}: it goes to the Discard Pile.`, 'warn'); }
          }
          c.tmp.noRetreat = true;
        });
      }
    }
    const door = p.hq.find((c) => c.id === 'GATHERING-19');
    if (door && door.markers > 0 && mine.length && !p.used.door) add('door', 'The Door in the Night: give an Active card Ambush this Round', 'Remove a marker; remove another to let it Ambush from your Discard Pile.', 0.4, async () => {
      p.used.door = true;
      const c = await this.pick(p.i, 'Which Active card gains Ambush?', mine.map((y) => y.card), { ai: 'none' });
      door.markers--; p.markers++; c.tmp.ambush = true;
      if (door.markers > 0 && p.discard.length && await this.yes(p.i, 'Remove another marker so it can Ambush from your Discard Pile?', 'Yes', 'No', 0.6)) { door.markers--; p.markers++; c.tmp.doorDiscard = true; }
    });
    const K = (k, label, sub, score, fn) => { if (kact(k, 'day')) add(`k:${k}`, label, sub, score, async () => { mark('k:' + k + 'day'); await fn(); }); };
    const own = (k) => this.kOwned(p).find((c) => c.k === k);
    const pickMine = (t) => this.pick(p.i, t, R.cards.filter((y) => y.up && !y.used && y.card.owner === p.i).map((y) => y.card), { ai: 'strong' });
    if (mine.length) {
      K('book-of-true-names', 'Book of True Names', "Reveal your hand; opponents' cards here sharing a printed Strength or Archetype with your hand return to their hands. Discard this card.", 0.5, async () => {
        const strs = new Set(p.hand.map((c) => c.str)), archs = new Set(p.hand.map((c) => c.arch));
        const hit = R.cards.filter((y) => y.up && !y.used && y.card.owner !== p.i && (strs.has(y.card.str) || archs.has(y.card.arch))).map((y) => y.card);
        this.log(`${p.name} reveals their hand (${p.hand.map((c) => c.name).join(', ') || 'empty'}) — Book of True Names.`);
        for (const y of hit) { this.detach(y); this.toHand(y); this.log(`${y.name} returns to ${this.P(y.owner).name}'s hand.`); }
        await this.discardKingdom(own('book-of-true-names'), false);
      });
      K('the-sword-that-slept', 'The Sword That Slept', '+5 Strength in this Clash. Discard this card and its guard.', theirs >= myStr && theirs - myStr < 6 ? 1.5 : 0.05, async () => {
        R.bonus[p.i] = (R.bonus[p.i] || 0) + 5;
        await this.discardKingdom(own('the-sword-that-slept'), true);
        this.log(`${p.name} draws The Sword That Slept: +5 Strength in the ${regionName(rid)}!`);
      });
      K('old-kings-spear', "Old King's Spear", 'One of your Active cards here gains Deadly this Clash. Discard this card and its guard.', theirs > 6 ? 0.9 : 0.05, async () => {
        const c = await pickMine('Which card gains Deadly?'); if (!c) return; c.ctmp.deadly = true;
        await this.discardKingdom(own('old-kings-spear'), true);
        this.log(`${p.name}'s ${c.name} takes up the Old King's Spear (Deadly).`);
      });
      K('old-kings-shield', "Old King's Shield", 'One of your Active cards here gains Invulnerable this Clash. Discard this card.', 0.2, async () => {
        const c = await pickMine('Which card becomes Invulnerable?'); if (!c) return; c.ctmp.invul = true;
        await this.discardKingdom(own('old-kings-shield'), false);
        this.log(`${p.name}'s ${c.name} raises the Old King's Shield (Invulnerable).`);
      });
      K('swansong-horn', 'Swansong Horn', 'One of your Active cards here gains Ambush this Clash.', p.hand.some((h) => h.str >= 5) ? 0.7 : 0.1, async () => { const c = await pickMine('Which card gains Ambush?'); if (c) c.ctmp.ambush = true; });
      K('smugglers-pass', "Smuggler's Pass", 'One of your Active cards here gains Retreat this Clash; when it Retreats you may Journey with it.', theirs > myStr + 4 ? 0.8 : 0.05, async () => { const c = await pickMine('Which card gains Retreat?'); if (c) { c.ctmp.retreat = true; c.ctmp.smuggler = true; } });
      const lanePool = [...Object.values(s.councils).flat().filter((e) => e.owner === p.i).map((e) => e.card), ...p.slots.filter((y) => y && y.occ).map((y) => y.occ)];
      if (lanePool.length) K('hidden-lanes', 'Hidden Lanes', 'Swap one of your Active cards here with one of your cards in a Council or guarding a Kingdom Card.', 0.3, async () => {
        const out = await this.pick(p.i, 'Hidden Lanes: swap out which Active card?', R.cards.filter((y) => y.up && !y.used && y.card.owner === p.i).map((y) => y.card), { ai: 'weak' });
        const inn = await this.pick(p.i, 'Bring in which card?', lanePool, { ai: 'strong' });
        if (!out || !inn) return;
        const sl = p.slots.find((y) => y && y.occ === inn);
        const xx = R.cards.find((y) => y.card === out);
        if (sl) sl.occ = out; else for (const k of Object.keys(s.councils)) { const e = s.councils[k].find((y) => y.card === inn); if (e) e.card = out; }
        this.reset(out); xx.card = inn; inn.ctmp = {};
        this.log(`${p.name} swaps ${out.name} for ${inn.name} (Hidden Lanes).`);
      });
      if (s.lost.length) K('shapeshifters-mirror', "Shapeshifter's Mirror", 'One of your Active cards here becomes a copy of a card in the Lost Pile (keeping its Strength) this Round.', 0.4, async () => {
        const c = await pickMine('Which of your cards changes?');
        const t = await this.pick(p.i, 'Copy which card in the Lost Pile?', s.lost, { ai: 'deadly' });
        if (c && t) { c.tmp.copy = t; this.log(`${p.name}'s ${c.name} becomes a copy of ${t.name} (Shapeshifter's Mirror).`); }
      });
    }
    if ((R.fresh[p.i] || 0) > 0) K('old-kings-lantern', "Old King's Lantern", 'Move any of your Supporters here to another unresolved Region or back to your board.', theirs > myStr + 3 ? 0.7 : 0, async () => {
      const n = R.fresh[p.i] || 0; if (!n) return;
      const to = await this.choose(p.i, `Move your ${n} Supporter(s) where?`, [...unresolved.map((r) => ({ id: r, label: regionName(r), score: 1 })), { id: 'board', label: 'Back to my board', score: 0.8 }], { auto: false });
      R.fresh[p.i] = 0; R.sup[p.i] -= n;
      if (to === 'board') p.supporters += n; else { s.regions[to].sup[p.i] = (s.regions[to].sup[p.i] || 0) + n; s.regions[to].fresh[p.i] = (s.regions[to].fresh[p.i] || 0) + n; }
      this.log(`${p.name} moves ${n} Supporter(s) away (Old King's Lantern).`);
    });
  }

  autumnActions(p, kact, mark, add, once) {
    const s = this.s;
    if (once('govern') && p.hand.some((c) => this.votesOf(c) > 0)) add('govern', 'Govern: put a card with Votes into a Council', 'It stays in the Council in later Rounds.', p.hand.length > 3 ? 1 : 0.3, async () => {
      mark('govern'); await this.coach('govern', p.i);
      const c = await this.pick(p.i, 'Govern with which card? Its Votes count in that Council from now on.', p.hand.filter((x) => this.votesOf(x) > 0), { key: 'governCard', ai: 'votes' });
      this.govern(p.i, c, await this.askCouncil(p.i, c));
    });
    const jp = this.journeyPool(p, false);
    if (once('journey') && jp.length) add('journey', 'Journey: send a card with Lore away for Lore', 'It goes to the Lost Pile (Pathfinders go to your Discard Pile) and you gain its Lore.', p.site.some((c) => c.cost <= p.lore + 2) ? 1.1 : 0.4, async () => {
      mark('journey'); await this.coach('journey', p.i);
      const c = await this.pick(p.i, 'Journey with which card?', jp, { key: 'journeyCard', ai: 'lore' });
      await this.journey(p, c);
    });
    const sv = this.votes(p.i, 'secrets');
    if (once('secrets') && sv > 0 && p.markers > 0) add('secrets', `Council of Secrets: place ${Math.min(sv, p.markers)} Faction Marker(s)`, COUNCILS[1].text, 1.2, async () => { mark('secrets'); await this.secrets(p, sv); });
    const ov = this.votes(p.i, 'oaths');
    const mapSup = Object.values(s.regions).reduce((a, r) => a + (r.sup[p.i] || 0), 0);
    if (once('oaths') && ov > 0 && (p.lostSup + mapSup) > 0) add('oaths', 'Council of Oaths: get Supporters back', COUNCILS[2].text, 1.3, async () => {
      mark('oaths');
      const most = this.opps(p.i).every((q) => this.votes(q.i, 'oaths') < ov);
      this.returnSupporters(p, ov + (most ? 1 : 0), 'Council of Oaths');
    });
    for (const a of this.activeCards(p.i)) {
      const c = a.card;
      for (const cm of this.cmds(c, a.rid).filter((y) => y.season === 'autumn' && y.cmd === 'rally')) {
        if (!once('rally:' + c.uid)) continue;
        if (cm.arg === 'self' && c.tmp.noRally) continue;
        if (cm.arg === 'self') add(`rally:${c.uid}`, `Rally ${c.name}: return it to your hand`, 'Rally (self).', 1.2, async () => { mark('rally:' + c.uid); this.detach(c); this.toHand(c); this.log(`${p.name} Rallies ${c.name} back to hand.`); });
        else add(`rally:${c.uid}`, `Rally with ${c.name}: return any two of your Active cards to hand`, 'Rally (any two).', 1.1, async () => {
          mark('rally:' + c.uid);
          for (let n = 0; n < 2; n++) {
            const r = await this.pick(p.i, `Rally: return which Active card to your hand (${2 - n} left)?`, this.activeCards(p.i).map((y) => y.card).filter((y) => !y.tmp.noRally), { optional: true, ai: 'strong' });
            if (!r) break; this.detach(r); this.toHand(r); this.log(`${p.name} Rallies ${r.name} back to hand.`);
          }
        });
      }
    }
    for (const c of p.hand) if (this.hasCmd(c, 'autumn', 'deploy') && once('dep:' + c.uid)) add(`dep:${c.uid}`, `Deploy ${c.name}`, 'Place it face up by a Region with 1 Influence on it: it stays through Winter (losing the Influence) and fights next Summer.', p.hand.length > 4 ? 0.9 : 0.25, async () => { mark('dep:' + c.uid); await this.deploy(p, c); });
    const K = (k, label, sub, score, fn) => { if (kact(k, 'autumn')) add(`k:${k}`, label, sub, score, async () => { mark('k:' + k + 'autumn'); await fn(); }); };
    const own = (k) => this.kOwned(p).find((c) => c.k === k);
    for (const [rid, R] of Object.entries(s.regions)) for (const k of R.ks) if (k.owner === p.i && k.card.k === 'midnight-court' && once('k:midnight-court:' + rid)) {
      const pool = R.cards.filter((x) => x.up && x.card.owner === p.i).map((x) => x.card);
      if (pool.length) add(`k:midnight-court:${rid}`, `Midnight Court (${regionName(rid)}): Govern with one of your Active cards there`, '', 1, async () => {
        mark('k:midnight-court:' + rid);
        const c = await this.pick(p.i, 'Govern with which Active card?', pool, { ai: 'votes' });
        this.govern(p.i, c, await this.askCouncil(p.i, c));
      });
    }
    for (const a of this.activeCards(p.i)) {
      const c = a.card, key = (n) => `b${n}:${c.uid}`;
      if (this.hasBoon(c, 6) && once(key(6))) add(key(6), `Boon on ${c.name}: Journey or Govern with it`, '', 0.8, async () => {
        mark(key(6));
        const ch = await this.choose(p.i, `Journey or Govern with ${c.name}?`, [...(this.loreOf(c) ? [{ id: 'j', label: 'Journey', score: 1 }] : []), ...(this.votesOf(c) ? [{ id: 'g', label: 'Govern', score: 1 }] : []), { id: 'none', label: 'Neither', score: 0 }], { auto: false });
        if (ch === 'j') await this.journey(p, c); else if (ch === 'g') this.govern(p.i, c, await this.askCouncil(p.i, c));
      });
      if (this.hasBoon(c, 18) && once(key(18))) add(key(18), `Boon on ${c.name}: place 1 Influence on it (it stays through Winter)`, '', 0.7, async () => { mark(key(18)); c.inf++; });
      if (c.role === 'lark' && once(key('lark')) && p.discard.length) add(key('lark'), 'Lark the Medic: move up to three cards from your Discard Pile to the bottom of your Deck', 'Then Lark cannot Rally back to your hand this Round.', 0.6, async () => {
        mark(key('lark'));
        for (let n = 0; n < 3; n++) { const d = await this.pick(p.i, `Move which card to the bottom of your Deck (${3 - n} left)?`, p.discard, { optional: true, ai: 'strong' }); if (!d) break; this.detach(d); this.toDeckBottom(d); }
        c.tmp.noRally = true;
      });
    }
    if (s.lost.length) K('the-laboratory', 'The Laboratory', 'Move any card in the Lost Pile to your hand. It is yours for the rest of the game.', 1.1, async () => {
      const c = await this.pick(p.i, 'Which card from the Lost Pile?', s.lost, { ai: 'strong' });
      if (!c) return; this.takeFrom(s.lost, c); c.owner = p.i; this.reset(c); p.hand.push(c);
      this.log(`${p.name} takes ${c.name} from the Lost Pile (The Laboratory).`, 'inf');
    });
    for (const [rid, R] of Object.entries(s.regions)) for (const k of R.ks) if (k.owner === p.i && k.card.k === 'sudden-eclipse' && once('k:eclipse:' + rid)) add(`k:eclipse:${rid}`, `Sudden Eclipse: claim a Location Reward in the ${regionName(rid)}`, '', 1.3, async () => {
      mark('k:eclipse:' + rid);
      const loc = await this.choose(p.i, 'Claim which Location Reward?', s.map[rid].map((l) => ({ id: l, label: locName(l), sub: LOCATIONS[l].text, score: LOCATIONS[l].inf + this.rand() })), { auto: false, key: 'loc' });
      R.blocked = false;
      await this.claimLocation(p, loc, null, false);
    });
    const exOpp = this.opps(p.i).filter((q) => q.tactics.some((x) => x.exhausted));
    if (exOpp.length && (p.inf || p.lore)) K('velvet-auction-room', 'Velvet Auction Room', "Give an opponent 1 Influence and 1 Lore, then take one of their Exhausted Tactics, unexhausted, as your own.", 0.7, async () => {
      const q = exOpp.length > 1 ? this.P(+(await this.choose(p.i, 'Which opponent?', exOpp.map((o) => ({ id: String(o.i), label: o.name, score: 1 }))))) : exOpp[0];
      if (p.inf) { p.inf--; q.inf++; } if (p.lore) { p.lore--; q.lore++; }
      const k = await this.choose(p.i, 'Take which Exhausted Tactic?', q.tactics.filter((x) => x.exhausted).map((x) => ({ id: x.k, label: x.name, sub: x.rules.map((r) => r.text).join(' '), score: 1 })), { auto: false });
      const tt = q.tactics.find((x) => x.k === k); q.tactics.splice(q.tactics.indexOf(tt), 1);
      tt.exhausted = false; p.tactics.push(tt); this.tacticSetup(p, tt);
      this.log(`${p.name} buys ${q.name}'s Tactic ${tt.name} at the Velvet Auction Room.`, 'inf');
    });
    const myCouncil = Object.values(s.councils).flat().filter((e) => e.owner === p.i);
    if (myCouncil.length) K('abandoned-estate', 'Abandoned Estate', 'Discard one of your cards from a Council to increase your Hand Size by one. Discard this card.', p.handSize < 7 ? 0.9 : 0, async () => {
      const c = await this.pick(p.i, 'Discard which of your cards from a Council?', myCouncil.map((e) => e.card), { ai: 'weak' });
      if (!c) return; this.detach(c); this.toDiscard(c); p.handSize = Math.min(8, p.handSize + 1);
      await this.discardKingdom(own('abandoned-estate'), false);
      this.log(`${p.name}'s Hand Size rises to ${p.handSize} (Abandoned Estate).`);
    });
    if (kact('clockwork-messengers', 'autumn')) this.clockwork(p, add, mark, 'autumn');
    const act = this.activeCards(p.i).map((a) => a.card);
    if (act.length) K('courtiers-diary', "Courtier's Diary", 'Move one of your Active cards into a Council, then discard any number of cards in that Council. Discard this card.', 0.8, async () => {
      const c = await this.pick(p.i, 'Which Active card goes into a Council?', act, { ai: 'votes' });
      const council = await this.askCouncil(p.i, c);
      for (const e of s.councils[council].slice()) if (e.owner !== p.i && await this.yes(p.i, `Discard ${this.P(e.owner).name}'s ${e.card.name} from that Council?`, 'Discard it', 'Leave it', 1)) await this.removeFromCouncil(e, "Courtier's Diary");
      this.govern(p.i, c, council);
      await this.discardKingdom(own('courtiers-diary'), false);
    });
    const myLost = s.lost.filter((c) => c.owner === p.i);
    if (myLost.length) K('blue-hour-bell', 'Blue Hour Bell', 'Move all your cards in the Lost Pile to the top or bottom of your Deck. Discard this card.', myLost.length >= 2 ? 1.2 : 0, async () => {
      const top = await this.yes(p.i, `Put your ${myLost.length} Lost card(s) on the top of your Deck (drawn next year) or the bottom?`, 'Top', 'Bottom', 1);
      for (const c of myLost) { this.detach(c); if (top) this.toDeckTop(c); else this.toDeckBottom(c); }
      await this.discardKingdom(own('blue-hour-bell'), false);
      this.log(`${p.name} rings the Blue Hour Bell: ${myLost.length} card(s) come back from the Lost Pile.`);
    });
    if (act.length) K('unearthed-iron-gear', 'Unearthed Iron Gear', 'Move one of your Active cards to your hand.', 1, async () => {
      const c = await this.pick(p.i, 'Which Active card returns to your hand?', act, { ai: 'strong' }); if (c) { this.detach(c); this.toHand(c); this.log(`${c.name} returns to ${p.name}'s hand.`); }
    });
    if (p.discard.some((c) => c.arch === 'follower')) K('countryside-reservists', 'Countryside Reservists', 'Move a Follower from your Discard Pile to your hand.', 1, async () => {
      const c = await this.pick(p.i, 'Which Follower?', p.discard.filter((x) => x.arch === 'follower'), { ai: 'strong' }); if (c) { this.detach(c); this.toHand(c); }
    });
    const depAct = act.filter((x) => this.hasCmd(x, 'autumn', 'deploy') || x.inf > 0);
    if (depAct.length) K('engineers-workshop', "Engineers' Workshop", 'Place 1 Influence on one of your Active cards with Deploy.', 1, async () => {
      const c = await this.pick(p.i, 'Which Active card with Deploy?', depAct, { ai: 'strong' }); if (c) { c.inf++; this.log(`${c.name} gains 1 Influence (Engineers' Workshop).`); }
    });
    if (p.lostSup + mapSup > 0) K('mustering-banner', 'Mustering Banner', 'Move up to two of your Supporters from the Map and/or Lost Pile to your board.', 1.2, async () => this.returnSupporters(p, 2, 'Mustering Banner'));
    if (p.tactics.some((t) => t.exhausted)) K('curious-ring', 'Curious Ring', 'Unexhaust one of your Tactics (follow its SETUP). Discard this card and its guard.', 1, async () => {
      const t = await this.choose(p.i, 'Unexhaust which Tactic?', p.tactics.filter((x) => x.exhausted).map((x) => ({ id: x.k, label: x.name, score: 1 })));
      const tt = p.tactics.find((x) => x.k === t); tt.exhausted = false; this.tacticSetup(p, tt);
      await this.discardKingdom(own('curious-ring'), true);
      this.log(`${p.name} unexhausts ${tt.name} (Curious Ring).`);
    });
  }

  returnSupporters(p, n, why) {
    let got = 0;
    while (got < n && p.lostSup > 0) { p.lostSup--; p.supporters++; got++; }
    for (const R of Object.values(this.s.regions)) while (got < n && (R.sup[p.i] || 0) > 0) { R.sup[p.i]--; if (R.fresh[p.i]) R.fresh[p.i]--; p.supporters++; got++; }
    this.log(`${p.name} gets ${got} Supporter(s) back (${why}).`);
  }

  async secrets(p, sv) {
    const s = this.s;
    let n = Math.min(sv, p.markers);
    while (n > 0) {
      const loc = await this.choose(p.i, `Council of Secrets: place a Faction Marker on which Location? (${n} left)`, Object.keys(LOCATIONS).map((l) => ({ id: l, label: `${locName(l)} (you have ${(s.marks[l] || {})[p.i] || 0})`, sub: LOCATIONS[l].text, score: ((s.marks[l] || {})[p.i] || 0) + (l === 'harvest' ? 0.5 : 0) + this.rand() * 0.2 })), { auto: false, key: 'secretsLoc' });
      s.marks[loc] = s.marks[loc] || {};
      s.marks[loc][p.i] = (s.marks[loc][p.i] || 0) + 1; p.markers--; n--;
    }
    this.log(`${p.name} places Faction Markers with the Council of Secrets.`);
    for (const l of Object.keys(LOCATIONS)) if ((s.marks[l] || {})[p.i] >= 4) {
      p.markers += s.marks[l][p.i]; s.marks[l][p.i] = 0;
      this.log(`${p.name} has 4+ markers on the ${locName(l)} and claims its reward!`);
      await this.claimLocation(p, l, null, true);
    }
  }

  tacticRun(p, t, rid) {
    const s = this.s;
    const done = (fn, score = 1) => ({ score, go: async () => { this.exhaust(p, t); this.log(`${p.name} uses the Tactic ${t.name}.`); await fn(); } });
    switch (t.k) {
      case 'school-of-the-stones': return done(async () => { p.flags.stones = true; }, Object.values(s.regions).reduce((a, r) => a + (r.sup[p.i] || 0), 0) >= 2 ? 1.5 : 0.1);
      case 'witch-trial': return done(async () => {
        const c = await this.choose(p.i, "Witch Trial: discard all opponents' cards in which Council?", COUNCILS.map((x) => ({ id: x.id, label: x.name, score: s.councils[x.id].filter((e) => e.owner !== p.i).length })), { auto: false });
        for (const e of s.councils[c].filter((e2) => e2.owner !== p.i)) await this.removeFromCouncil(e, 'Witch Trial');
        let n = 0;
        for (const e of Object.values(s.councils).flat().filter((e2) => e2.owner === p.i)) {
          if (await this.yes(p.i, `Move your ${e.card.name} from its Council to the top of your Deck for 1 Lore?`, 'Yes', 'No', 0.3)) { this.detach(e.card); this.toDeckTop(e.card); n++; }
        }
        if (n) await this.gainLore(p, n, 'Witch Trial');
      }, Object.values(s.councils).flat().filter((e) => e.owner !== p.i).length >= 2 ? 1.3 : 0.05);
      case 'martial-law': {
        const regs = REGIONS.map((r) => r.id).filter((r) => s.regions[r].cards.some((x) => x.up && x.card.owner === p.i && this.arch(x.card, r) === 'warmachine') && s.regions[r].martial == null);
        if (!regs.length) return null;
        return done(async () => { const r = await this.chooseRegion(p.i, 'Martial Law: which Region?', regs); s.regions[r].martial = p.i; this.log(`Martial Law in the ${regionName(r)}: opponents can't add, move or swap cards there during its first Clash.`); }, 0.8);
      }
      case 'school-of-the-storms': return done(async () => { p.flags.storms = true; }, 0.6);
      case 'sea-lanes': {
        if (!rid) return null;
        const pool = s.regions[rid].cards.filter((x) => x.up && !x.used && x.card.owner === p.i && ['heir', 'captain', 'warmachine'].includes(this.arch(x.card, rid))).map((x) => x.card);
        if (!pool.length) return null;
        return done(async () => { const c = await this.pick(p.i, 'Sea Lanes: which card gains Flank this Round?', pool, { ai: 'strong' }); c.tmp.flank = true; }, 0.3);
      }
      case 'salt-toughness': {
        if (p.hand.length >= this.maxHand(p) || !(this.activeCards(p.i).length + p.discard.length)) return null;
        return done(async () => {
          while (p.hand.length < this.maxHand(p)) {
            const c = await this.pick(p.i, 'Salt Toughness: move which card to your hand? (Up to your Hand Size.)', [...this.activeCards(p.i).map((a) => a.card), ...p.discard], { optional: true, ai: 'strong' });
            if (!c) break; this.detach(c); this.toHand(c);
          }
        }, s.round >= 2 && p.hand.length <= 2 ? 1.4 : 0.1);
      }
      case 'river-runners': {
        const targets = this.opps(p.i).flatMap((q) => q.slots.map((sl, si) => sl && { q, si, sl }).filter(Boolean));
        if (!targets.length || !p.hand.length) return null;
        return done(async () => {
          const ch = await this.choose(p.i, 'River Runners: take which Kingdom Card?', targets.map((x) => ({ id: `${x.q.i}:${x.si}`, label: `${x.sl.card.name} from ${x.q.name}`, sub: kText(x.sl.card), score: 1 + this.rand() })));
          const [qi, si] = ch.split(':').map(Number); const q = this.P(qi), sl = q.slots[si];
          q.slots[si] = null; if (sl.occ) this.toHand(sl.occ);
          if (sl.card.k === 'old-kings-signet') q.handSize = Math.max(3, q.handSize - 1);
          const occ = await this.pick(p.i, 'Occupy it with which card from your hand?', p.hand, { ai: 'weak' });
          this.takeFrom(p.hand, occ);
          await this.acquireKingdom(p, sl.card, occ, true);
        }, 0.9);
      }
      case 'school-of-the-streets': return done(async () => { p.flags.streets = true; }, 0.5);
      case 'false-orders': {
        const ops = this.opps(p.i).filter((q) => this.downCards(q.i).length >= 2);
        if (!ops.length) return null;
        return done(async () => {
          for (const q of ops) {
            const regs = this.downCards(q.i);
            const a = await this.chooseRegion(p.i, `False Orders: swap two of ${q.name}'s face-down cards. First Region?`, regs.map((x) => x.rid));
            const b = await this.chooseRegion(p.i, 'Second Region?', regs.map((x) => x.rid).filter((r) => r !== a));
            this.swapPositions(regs.find((x) => x.rid === a).card, regs.find((x) => x.rid === b).card);
          }
        }, 0.6);
      }
      case 'safehouses': {
        if (!rid) return null;
        const pool = s.regions[rid].cards.filter((x) => x.up && !x.used && x.card.owner === p.i).map((x) => x.card);
        if (!pool.length) return null;
        return done(async () => { const c = await this.pick(p.i, 'Safehouses: which card gains Retreat this Clash?', pool, { ai: 'strong' }); c.ctmp.retreat = true; }, 0.2);
      }
      case 'night-raids': {
        const n = p.slots.filter(Boolean).length;
        if (!n) return null;
        return done(async () => {
          for (const q of this.opps(p.i)) for (let k = 0; k < n && q.hand.length; k++) {
            const c = await this.pick(q.i, `Night Raids: discard a card from your hand (${n - k} left).`, q.hand, { ai: 'weak', key: 'forcedDiscard' });
            this.takeFrom(q.hand, c); this.toDiscard(c); this.log(`${q.name} discards ${c.name} (Night Raids).`);
          }
        }, n >= 2 ? 1.4 : 0.4);
      }
      case 'school-of-the-stars': {
        if (!rid || (s.regions[rid].fresh[p.i] || 0) < 2 || !s.lost.some((c) => c.owner === p.i) || this.blocked(p.i, rid)) return null;
        return done(async () => {
          const R = s.regions[rid]; R.fresh[p.i] -= 2; R.sup[p.i] -= 2; p.lostSup += 2;
          const c = await this.pick(p.i, 'School of the Stars: bring which of your Lost cards into this Clash?', s.lost.filter((x) => x.owner === p.i), { ai: 'strong' });
          this.detach(c); this.reset(c); R.cards.push({ card: c, up: true, used: false });
          this.log(`${p.name} calls ${c.name} back from the Lost Pile into the ${regionName(rid)}.`);
        }, 0.7);
      }
      case 'out-beyond-the-lights': {
        if (!rid) return null;
        const mine = this.activeCards(p.i);
        if (!mine.some((a) => a.rid === rid) || !mine.some((a) => a.rid !== rid)) return null;
        return done(async () => {
          const a = await this.pick(p.i, 'Out Beyond the Lights: swap the positions of two of your Active cards. First card?', mine.map((x) => x.card), { ai: 'weak' });
          const b = await this.pick(p.i, 'Second card (in another Region)?', this.activeCards(p.i).map((x) => x.card).filter((c) => this.regionOf(c) !== this.regionOf(a)), { ai: 'strong' });
          if (b) this.swapPositions(a, b);
        }, 0.3);
      }
      case 'moonlit-foragers': {
        if (!s.kdiscard.length || !p.hand.length) return null;
        return done(async () => {
          this.shuffle(s.kdiscard);
          const five = s.kdiscard.slice(-5);
          const ch = await this.choose(p.i, 'Moonlit Foragers: acquire one of these from the Kingdom Discard.', five.map((k) => ({ id: String(k.uid), label: k.name, sub: kText(k), score: 1 + this.rand() })), { auto: false });
          const kc = five.find((k) => k.uid === +ch); this.takeFrom(s.kdiscard, kc);
          const occ = await this.pick(p.i, 'Occupy it with which card from your hand?', p.hand, { ai: 'weak' });
          this.takeFrom(p.hand, occ);
          await this.acquireKingdom(p, kc, occ);
        }, 0.7);
      }
      case 'ritual-sacrifice': {
        if (!(this.activeCards(p.i).length + p.discard.length)) return null;
        return done(async () => {
          let n = 0;
          for (; n < 3; n++) {
            const c = await this.pick(p.i, `Ritual Sacrifice: move a card to the Lost Pile for 1 Lore (${3 - n} left)?`, [...this.activeCards(p.i).map((a) => a.card), ...p.discard], { optional: true, ai: 'weak' });
            if (!c) break; this.detach(c); this.toLost(c);
          }
          if (n) await this.gainLore(p, n, 'Ritual Sacrifice');
          const back = await this.pick(p.i, 'Then you may move a card from your Discard Pile to your hand.', p.discard, { optional: true, ai: 'strong' });
          if (back) { this.detach(back); this.toHand(back); }
        }, p.discard.length >= 3 ? 0.9 : 0.1);
      }
      default: return null;
    }
  }

  // ================= SUMMER =================
  async summer() {
    const s = this.s;
    this.step('summer', 'Place Clash Markers');
    await this.coach('clashOrder');
    const storm = s.players.find((p) => p.flags.storms);
    const chooser = storm ? storm.i : s.order[s.order.length - 1];
    let left = REGIONS.map((r) => r.id);
    s.clashOrder = [];
    for (const n of ['I', 'II']) {
      const rid = await this.chooseRegion(chooser, `${storm ? 'School of the Storms: you' : "You're last in turn order, so you"} decide the order of the Clashes. Which Region gets Clash Marker ${n}?`, left, { key: 'clashOrder' });
      s.clashOrder.push(rid); left = left.filter((r) => r !== rid);
    }
    s.clashOrder.push(left[0]);
    this.log(`${this.P(chooser).name} sets the Clash order: ${s.clashOrder.map(regionName).join(' → ')}.`);
    for (const rid of s.clashOrder) await this.resolveRegion(rid);
    s.current = null;
  }

  async resolveRegion(rid) {
    const s = this.s, R = s.regions[rid];
    s.current = rid;
    let contenders = s.order.slice();
    let first = true;
    const fresh = () => R.cards.filter((c) => c.up && !c.used);
    const sundial = () => R.ks.some((k) => k.card.k === 'cracked-sundial');
    for (;;) {
      this.step('summer', `${regionName(rid)}: Reveal`);
      const revealed = R.cards.filter((c) => !c.used && !c.up);
      revealed.forEach((c) => (c.up = true));
      if (revealed.some((x) => this.hasBoon(x.card, 19))) {
        for (const [pi, n] of Object.entries(R.sup)) if (n > 0) { this.P(+pi).lostSup += n; R.sup[pi] = 0; R.fresh[pi] = 0; }
        this.log(`A Boon is revealed: every Supporter in the ${regionName(rid)} goes to the Lost Pile!`, 'warn');
      }
      const boonsNow = R.cards.filter((x) => x.up && !x.used && x.card.boons.length);
      if (boonsNow.length) this.log(`Boons revealed in the ${regionName(rid)}: ${boonsNow.map((x) => `${this.P(x.card.owner).short} ${x.card.name}: ${x.card.boons.map(boonLabel).join(' / ')}`).join('; ')}.`);
      this.log(`${regionName(rid)} Clash — Active: ${fresh().map((c) => `${this.P(c.card.owner).short} ${c.card.name} (${this.str(c.card)})`).join(', ') || 'no cards'}.`, 'head');
      if (first) await this.coach('reveal');

      if (!sundial()) {
        this.step('summer', `${regionName(rid)}: Day Actions`);
        if (first) await this.coach('day');
        for (const p of this.turn()) if (contenders.includes(p.i)) await this.actionStep(p, 'day', rid);
        for (let pass = 0; pass < 3; pass++) {
          const amb = R.cards.filter((c) => !c.used && !c.up);
          if (!amb.length) break;
          amb.forEach((c) => (c.up = true));
          this.log(`Revealed at the end of the Day: ${amb.map((c) => `${this.P(c.card.owner).short} ${c.card.name} (${this.str(c.card)})`).join(', ')}.`);
          for (const p of this.turn()) if (amb.some((c) => c.card.owner === p.i && this.cmds(c.card, rid).some((x) => x.season === 'day'))) await this.actionStep(p, 'day', rid);
        }
        this.step('summer', `${regionName(rid)}: Night Effects`);
        await this.night(rid);
      } else this.log(`Cracked Sundial: no Day or Night Steps in the ${regionName(rid)}.`);
      R.firstDone = true;

      this.step('summer', `${regionName(rid)}: Tally Strength`);
      const totals = {}, parts = {};
      const citadel = R.ks.find((k) => k.card.k === 'ruined-citadel');
      for (const pi of contenders) {
        const p = this.P(pi);
        const cards = fresh().filter((c) => c.card.owner === pi);
        const cs = cards.reduce((a, c) => a + this.str(c.card), 0);
        const sup = (R.fresh[pi] || 0) * (p.flags.stones ? 2 : 1);
        const nf = R.nf === pi && R.nfFresh ? 3 : 0;
        const wyrm = this.has(p, 'the-wyrm') && p.herald && this.regOf(p.herald) === rid && !R.wyrmUsed ? 5 : 0;
        const bonus = (R.bonus[pi] || 0) + nf + wyrm;
        let t = cs + sup + bonus;
        const halved = citadel && citadel.owner !== pi && t > 0;
        if (halved) t = Math.ceil(t / 2);
        totals[pi] = t;
        parts[pi] = [cards.length ? `cards ${cs}` : null, sup ? `Supporters ${sup}` : null, bonus ? `bonus ${bonus}` : null, halved ? 'halved by Ruined Citadel' : null].filter(Boolean).join(' + ') || 'nothing';
      }
      const eye = fresh().some((c) => this.textIs(c.card, 'GATHERING-18', rid));
      const activeNow = fresh().map((c) => c.card);
      fresh().forEach((c) => (c.used = true));
      R.fresh = {}; R.bonus = {}; R.nfFresh = false; R.wyrmUsed = true;
      if (first) await this.coach('tally');
      const summary = contenders.map((pi) => `${this.P(pi).short} ${totals[pi]} (${parts[pi]})`).join(' vs ');
      this.log(`${regionName(rid)} Strength: ${summary}.`);
      let best;
      if (eye) {
        const pos = contenders.filter((pi) => totals[pi] > 0);
        best = pos.length ? Math.min(...pos.map((pi) => totals[pi])) : 0;
        this.log('Ritual of the Eye: the LOWEST total above 0 wins this Clash!', 'warn');
      } else best = Math.max(...contenders.map((pi) => totals[pi]));
      const winners = contenders.filter((pi) => totals[pi] === best);
      for (const p of s.players.filter((q) => q.flags.storms)) {
        const supMost = (R.sup[p.i] || 0) > 0 && s.players.every((q) => q.i === p.i || (R.sup[q.i] || 0) < (R.sup[p.i] || 0));
        const n = (pi) => R.cards.filter((x) => x.up && x.card.owner === pi).length;
        const cardMost = n(p.i) > 0 && s.players.every((q) => q.i === p.i || n(q.i) < n(p.i));
        if (supMost) this.gainInf(p, 1, 'School of the Storms (most Supporters)');
        if (cardMost) await this.gainLore(p, 1, 'School of the Storms (most Active cards)');
      }
      if (winners.length === 1 && best > 0) {
        const w = this.P(winners[0]);
        await this.beat(`${regionName(rid)}: ${summary}. ${w.name} wins!`);
        await this.beforeRewards(rid, w, activeNow);
        if (activeNow.some((c) => c.owner === w.i && this.textIs(c, 'CLANS-17', rid))) this.gainInf(w, 1, 'Riders of the North Sky');
        if (this.has(w, 'old-kings-signet') && activeNow.some((c) => c.owner === w.i && this.arch(c, rid) === 'heir')) this.gainInf(w, 1, "Old King's Signet");
        await this.claim(w, rid);
        await this.afterClash(rid, activeNow);
        R.resolved = true;
        return;
      }
      this.log(`${regionName(rid)} is tied at ${best}.`, 'warn');
      await this.beat(`${regionName(rid)}: ${summary}. It's a tie!`);
      await this.coach('tie');
      const played = [];
      for (const p of this.turn()) {
        if (!winners.includes(p.i) || !p.hand.length) continue;
        const ch = await this.choose(p.i, `Tie in the ${regionName(rid)}! Add one more face-down card from your hand to start a new Clash here, or pass. Only the new cards count.`, [{ id: 'play', label: 'Add a card', score: p.hand.some((c) => c.str >= 4) ? 1 : 0.2 }, { id: 'pass', label: 'Pass', score: 0.5 }], { auto: false, key: 'tie' });
        if (ch !== 'play') { this.log(`${p.name} passes.`); continue; }
        const c = await this.pick(p.i, `Which card joins the new Clash in the ${regionName(rid)}?`, p.hand, { key: 'tieCard', ai: 'strong', region: rid });
        this.takeFrom(p.hand, c); R.cards.push({ card: c, up: false, used: false });
        played.push(p.i); this.log(`${p.name} adds another card to the ${regionName(rid)}.`);
      }
      if (!played.length) { this.log(`Everyone passed: the ${regionName(rid)} is a tie. Nobody claims its rewards this Round.`, 'warn'); R.tie = true; R.resolved = true; await this.afterClash(rid, activeNow); return; }
      await this.afterClash(rid, activeNow);
      contenders = winners;
      first = false;
    }
  }

  // Legendary Creatures: losing a Clash where your Legendary piece is brings its card to your hand.
  async legendLosers(rid, winnerPi) {
    if (!this.wk.legendary) return;
    for (const p of this.s.players) {
      if (p.i === winnerPi || !p.legend || this.regOf(p.legend) !== rid || !p.lsupply.length) continue;
      const c = p.lsupply.pop(); this.reset(c); p.hand.push(c);
      this.log(`${p.name} lost the ${regionName(rid)}, where their Legendary Creature stands: ${c.name} comes to their hand!`, 'warn');
    }
  }
  // After the winner is known, before any rewards.
  async beforeRewards(rid, w, activeNow) {
    const s = this.s, R = s.regions[rid];
    await this.legendLosers(rid, w.i);
    for (const c of activeNow.filter((x) => x.owner === w.i)) {
      if (c.legendary && w.legend && this.regOf(w.legend) === rid) { this.gainInf(w, 1, `${c.name} with its Legendary piece`); await this.gainLore(w, 1, c.name); }
      for (const b of c.boons.slice()) {
        switch (b.n) {
          case 1: this.gainInf(w, 1, 'a Boon'); await this.gainLore(w, 1, 'a Boon'); break;
          case 14: this.gainInf(w, 2, 'a Boon'); await this.gainLore(w, 2, 'a Boon'); c.tmp.burnAfter = true; break;
          case 17: w.handSize = Math.min(8, w.handSize + 1); this.log(`${w.name}'s Hand Size rises to ${w.handSize} (a Boon).`); break;
          case 10: {
            const sv = this.votes(w.i, 'secrets'), ov = this.votes(w.i, 'oaths');
            if (sv && w.markers) await this.secrets(w, sv);
            if (ov) this.returnSupporters(w, ov + (this.opps(w.i).every((q) => this.votes(q.i, 'oaths') < ov) ? 1 : 0), 'a Boon: Council of Oaths');
            break;
          }
          case 9: if (s.tower && await this.yes(w.i, 'A Boon lets you visit the Whispering Tower now. Visit it?', 'Visit the Tower', 'No', 1.2)) await this.visitTower(w); break;
          case 16: R.extraClaim = (R.extraClaim || 0) + 1; break;
        }
      }
    }
    if (R.ks.some((k) => k.card.k === 'sudden-eclipse') && s.season === 'summer') { R.blocked = true; this.log(`Sudden Eclipse: the Location Rewards in the ${regionName(rid)} are blank this Summer.`, 'warn'); }
  }
  // Boons that burn their card after the Clash, then clean up.
  async afterClash(rid, activeNow) {
    const s = this.s, R = s.regions[rid];
    for (const c of activeNow) {
      if ((this.hasBoon(c, 7) || this.hasBoon(c, 11) || c.tmp.burnAfter) && this.regionOf(c) === rid) {
        this.detach(c); this.reset(c); s.burned.push(c);
        this.log(`${this.P(c.owner).name}'s ${c.name} is Burned after the Clash (Boon).`, 'warn');
      }
    }
    if (R.extraClaim && R.winner != null) {
      R.extraClaim = 0;
      const w = this.P(R.winner);
      const loc = await this.choose(w.i, `A Boon: claim another Location Reward in the ${regionName(rid)}.`, s.map[rid].map((l) => ({ id: l, label: locName(l), sub: LOCATIONS[l].text, score: LOCATIONS[l].inf + this.rand() })), { auto: false, key: 'loc', region: rid });
      await this.claimLocation(w, loc, null, false);
    }
  }

  async night(rid) {
    const s = this.s, R = s.regions[rid];
    const fresh = R.cards.filter((c) => c.up && !c.used);
    const doomed = new Map(); // card -> killer card
    let ploy = [];
    for (const x of fresh) {
      const c = x.card;
      if (this.hasCmd(c, 'night', 'deadly', rid)) for (const y of fresh) if (y.card.owner !== c.owner && !doomed.has(y.card)) doomed.set(y.card, c);
      const oppFollower = fresh.some((y) => y.card.owner !== c.owner && this.arch(y.card, rid) === 'follower');
      if (this.isAgent7(c, rid) && oppFollower && !doomed.has(c)) doomed.set(c, c);
      if (this.arch(c, rid) === 'heir' && this.has(this.P(c.owner), 'assassins-guild') && oppFollower && !doomed.has(c)) doomed.set(c, c);
      if (this.textIs(c, 'UPRISING-16', rid)) {
        const hit = fresh.filter((y) => y.card.owner !== c.owner && ['heir', 'captain'].includes(this.arch(y.card, rid)));
        hit.forEach((y) => { if (!doomed.has(y.card)) doomed.set(y.card, c); });
        if (hit.some((y) => !this.hasTrait(y.card, 'invulnerable', rid))) ploy.push(c);
      }
    }
    if (!doomed.size) return;
    await this.coach('night');
    const killers = new Set();
    const traitsBefore = new Map([...doomed.keys()].map((c) => [c, this.hasTrait(c, 'invulnerable', rid)]));
    // Peregrine the Captain (Aeronauts): discard it instead of your cards being Eliminated
    for (const p of s.players) {
      const mine = [...doomed.keys()].filter((c) => c.owner === p.i && !traitsBefore.get(c));
      if (!mine.length) continue;
      const per = [...this.activeCards(p.i).map((a) => a.card), ...Object.values(s.councils).flat().filter((e) => e.owner === p.i).map((e) => e.card)].find((c) => c.id === 'WK-FC5' && !mine.includes(c));
      if (per && await this.yes(p.i, `Peregrine the Captain: discard Peregrine instead of losing ${mine.map((c) => c.name).join(', ')}?`, 'Discard Peregrine', 'No', mine.some((c) => c.str >= 6) ? 1.5 : 0.3)) {
        this.detach(per); this.toDiscard(per); mine.forEach((c) => doomed.delete(c));
        this.log(`${p.name} discards Peregrine the Captain to save their cards.`);
      }
    }
    let anyGone = false;
    for (const [c, killer] of doomed) {
      if (traitsBefore.get(c)) { this.log(`${c.name} is Invulnerable and survives the Night.`); continue; }
      anyGone = true;
      const to = await this.eliminate(c);
      this.log(`Night: ${this.P(c.owner).name}'s ${c.name} is Eliminated${killer === c ? '' : ` by ${killer.name}`} → ${to}.`, 'warn');
      if (killer !== c) killers.add(killer);
    }
    for (const k of killers) {
      const p = this.P(k.owner);
      if (p.flags.streets) { this.gainInf(p, 1, 'School of the Streets'); await this.gainLore(p, 1, 'School of the Streets'); }
      if (k.arch === 'heir' && this.has(p, 'assassins-guild')) this.gainInf(p, 1, "Assassins' Guild");
    }
    if (anyGone) for (const q of s.players) if (this.has(q, 'blood-seeking-box')) { this.gainInf(q, 1, 'Blood Seeking Box'); await this.gainLore(q, 1, 'Blood Seeking Box'); }
    for (const c of ploy) {
      const p = this.P(c.owner);
      if (await this.yes(p.i, 'Black Powder Ploy: choose your reward.', 'Gain 1 Influence', 'Gain 1 Lore', 1)) this.gainInf(p, 1, 'Black Powder Ploy'); else await this.gainLore(p, 1, 'Black Powder Ploy');
    }
  }

  async claim(p, rid) {
    this.step('summer', `${regionName(rid)}: Claim Rewards`);
    await this.coach('claim');
    const R = this.s.regions[rid], reg = { locs: this.s.map[rid] };
    const loc = await this.choose(p.i, `You won the ${regionName(rid)}! Choose one Location to claim.`, reg.locs.map((l) => {
      const herald = this.s.players.filter((q) => q.herald === l);
      return { id: l, label: `${LOCATIONS[l].name}: ${LOCATIONS[l].inf} Influence`, sub: LOCATIONS[l].text + (herald.length ? ` Heralds here: ${herald.map((q) => q.short).join(', ')}.` : ''), score: LOCATIONS[l].inf + (p.herald === l ? 1.5 : 0) + (l === 'harvest' ? 0.4 : 0) + this.rand() * 0.5 };
    }), { auto: false, key: 'loc', region: rid });
    R.winner = p.i; R.claimed = loc;
    await this.claimLocation(p, loc, rid, false);
  }

  async claimLocation(p, loc, rid, ignoreInf) {
    const s = this.s;
    const blank = rid && s.regions[rid].blocked;
    // Wild Kingdom pieces on the Location: the Whispering Tower MUST be visited; the Aeronauts MAY be (instead of the reward).
    let visited = false;
    if (!blank && s.pieces.tower === loc) { visited = true; await this.visitTower(p); }
    else if (!blank && s.pieces.nearfar === loc && await this.yes(p.i, `The Near & Far (Aeronauts) is here. Visit the Aeronauts instead of taking the ${locName(loc)}'s reward?`, 'Visit the Aeronauts', `Take the ${locName(loc)}`, s.aeroDeck.length ? 1.2 : 0.6)) { visited = true; await this.visitAeronauts(p); }
    if (!visited && !blank) await this.locationReward(p, loc, ignoreInf);
    if (blank) this.log(`The ${locName(loc)}'s reward is blank (Sudden Eclipse).`);
    await this.heraldReward(p, loc, rid);
  }

  async visitAeronauts(p) {
    const s = this.s;
    if ((await this.choose(p.i, 'Visiting the Aeronauts: gain 1 Influence or 1 Lore?', [{ id: 'inf', label: 'Gain 1 Influence', score: 1 }, { id: 'lore', label: 'Gain 1 Lore', score: 0.9 }], { auto: false })) === 'inf') this.gainInf(p, 1, 'the Aeronauts');
    else await this.gainLore(p, 1, 'the Aeronauts');
    if (s.aeroDeck.length) {
      const c = await this.pick(p.i, 'Choose an Aeronaut to join you as an Ally (into your hand).', s.aeroDeck, { ai: 'strong', key: 'aeronaut' });
      this.takeFrom(s.aeroDeck, c); c.owner = p.i; this.reset(c); p.hand.push(c);
      this.log(`${c.name} joins ${p.name} as an Ally.`, 'inf');
    } else if (s.pieces.nearfar) {
      const ex = p.tactics.filter((x) => x.exhausted);
      if (ex.length) {
        const k = await this.choose(p.i, 'You may flip one Exhausted Tactic back to Unexhausted.', [...ex.map((x) => ({ id: x.k, label: x.name, score: 1 })), { id: 'none', label: 'No', score: 0.1 }], { auto: false });
        const tt = p.tactics.find((x) => x.k === k); if (tt) { tt.exhausted = false; this.tacticSetup(p, tt); }
      }
      delete s.pieces.nearfar; p.nf = 'board';
      this.log(`${p.name} claims the Near & Far! It is a Supporter worth 3 Strength that always returns to their board.`, 'inf');
    }
  }

  async visitTower(p) {
    const s = this.s, T = s.tower;
    this.log(`${p.name} visits the Whispering Tower.`);
    const explored = [];
    if (T.entrance.length) { const b = T.entrance.pop(); p.boons.push(b); explored.push('entrance'); this.log(`The Entrance: ${p.name} takes a Boon.`); }
    if (T.lab.length && await this.yes(p.i, 'Climb to the Labyrinth? Look at its two Boons: keep one, give the other to an opponent.', 'Climb', 'Leave the Tower', 1)) {
      explored.push('lab');
      const keep = await this.choose(p.i, 'The Labyrinth: which Boon do you keep? (The other goes to an opponent.)', T.lab.map((b) => ({ id: String(b.bid), label: boonLabel(b), score: [2, 7, 14, 16, 13, 11].includes(b.n) ? 2 : 1 })), { auto: false, key: 'boon' });
      const kb = T.lab.find((b) => String(b.bid) === keep), gb = T.lab.find((b) => b !== kb);
      p.boons.push(kb);
      if (gb) { const op = this.opps(p.i)[0]; op.boons.push(gb); this.log(`The Labyrinth: ${p.name} keeps a Boon and gives one to ${op.name}.`); }
      T.lab = [];
      if (T.pin.length && p.lore >= 1 && await this.yes(p.i, 'Climb to the Pinnacle? Pay 1 Lore, take all three Boons, then discard two Boons from your Supply.', 'Climb (1 Lore)', 'Leave the Tower', 0.9)) {
        explored.push('pin'); p.lore--; p.boons.push(...T.pin); T.pin = [];
        for (let n = 0; n < 2 && p.boons.length; n++) {
          const d = await this.choose(p.i, `The Pinnacle: discard a Boon from your Supply (${2 - n} left).`, p.boons.map((b) => ({ id: String(b.bid), label: boonLabel(b), score: [2, 7, 14, 16, 13, 11].includes(b.n) ? 0 : 1 })), { auto: false, key: 'boon' });
          const b = p.boons.find((x) => String(x.bid) === d); this.takeFrom(p.boons, b); s.boonDiscard.push(b);
        }
        this.log(`The Pinnacle: ${p.name} pays 1 Lore and takes the Boons there.`);
      }
    }
    const draw = () => { if (!s.boonStack.length) { s.boonStack = this.shuffle(s.boonDiscard); s.boonDiscard = []; } return s.boonStack.pop(); };
    for (const lv of explored) { const n = { entrance: 1, lab: 2, pin: 3 }[lv]; while (T[lv].length < n) { const b = draw(); if (!b) break; T[lv].push(b); } }
    const here = this.regOf(s.pieces.tower);
    const to = await this.choose(p.i, 'Move the Whispering Tower to a Location in a different Region.', Object.keys(LOCATIONS).filter((l) => this.regOf(l) !== here).map((l) => ({ id: l, label: `${locName(l)} (${regionName(this.regOf(l))})`, score: this.rand() })), { auto: false, key: 'towerLoc' });
    s.pieces.tower = to;
    this.log(`The Whispering Tower moves to the ${locName(to)}.`);
  }

  async locationReward(p, loc, ignoreInf) {
    const s = this.s;
    if (!ignoreInf) this.gainInf(p, LOCATIONS[loc].inf, `the ${locName(loc)}`);
    for (const k of (s.locKs[loc] || []).slice()) if (k.card.k === 'the-golden-caravan') {
      if (k.owner === p.i) {
        this.gainInf(p, 2, 'The Golden Caravan');
        const to = this.travel(loc);
        s.locKs[loc] = s.locKs[loc].filter((x) => x !== k); (s.locKs[to] = s.locKs[to] || []).push(k);
        this.log(`The Golden Caravan travels on to the ${locName(to)}.`);
      } else this.gainInf(p, 1, "an opponent's Golden Caravan");
    }
    for (const k of s.locKs[loc] || []) if (k.card.k === 'merchants-guild') this.gainInf(this.P(k.owner), 1, "Merchants' Guild");
    switch (LOCATIONS[loc].fx) {
      case 'favour': await this.takeFavour(p); break;
      case 'govern': {
        const pool = [...p.hand, ...this.activeCards(p.i).map((a) => a.card)].filter((c) => this.votesOf(c) > 0);
        const c = await this.pick(p.i, 'Castle: Govern with a card from your hand or an Active card (or skip). ALL other cards at the Council you choose are discarded!', pool, { optional: true, ai: 'votes', key: 'castleGovern' });
        if (!c) break;
        const council = await this.askCouncil(p.i, c, `Castle: which Council does ${c.name} join? Every other card there is discarded (yours too).`);
        for (const e of s.councils[council].slice()) await this.removeFromCouncil(e, 'Castle');
        for (const q of s.players) if (s.cmarks[council][q.i]) { q.markers += (s.cmarks[council][q.i].syn || 0) + (s.cmarks[council][q.i].bringer || 0); s.cmarks[council][q.i] = {}; }
        this.govern(p.i, c, council);
        break;
      }
      case 'journey': {
        const c = await this.pick(p.i, 'Wilderness: Journey with a card from your hand or an Active card (or skip).', this.journeyPool(p, true), { optional: true, ai: 'lore', key: 'journeyCard' });
        if (c) await this.journey(p, c, 'the Wilderness');
        break;
      }
      case 'shrine': {
        for (let n = 0; n < 3; n++) {
          const pool = [...p.hand, ...this.activeCards(p.i).map((a) => a.card)];
          const c = await this.pick(p.i, `Shrine: move a card from your hand or an Active card to the bottom of your Deck (${3 - n} left), or stop. It saves the card from being discarded and keeps your Deck from running out.`, pool, { optional: true, ai: 'shrine' });
          if (!c) break; this.detach(c); this.toDeckBottom(c); this.log(`${p.name} puts ${c.name} on the bottom of their Deck (Shrine).`);
        }
        break;
      }
      case 'necro': {
        this.shuffle(p.discard);
        let n = 0;
        while (n < 3 && p.discard.length && await this.yes(p.i, `Necropolis: draw a card from your shuffled Discard Pile? (${3 - n} left, ${p.discard.length} in the pile)`, 'Draw', 'Stop', p.hand.length < this.maxHand(p) ? 1 : 0.1)) { p.hand.push(p.discard.pop()); n++; }
        if (n) this.log(`${p.name} draws ${n} card(s) from their Discard Pile (Necropolis).`);
        for (let k = 0; k < 8 && p.hand.length; k++) {
          const c = await this.pick(p.i, 'Necropolis: you may discard any number of cards from your hand. Pick one to discard, or skip.', p.hand, { optional: true, ai: p.hand.length > this.maxHand(p) ? 'weak' : 'none' });
          if (!c) break; this.takeFrom(p.hand, c); this.toDiscard(c);
        }
        break;
      }
    }
  }

  async heraldReward(p, loc, rid) {
    const s = this.s;
    if (!rid || (p.herald !== loc && p.legend !== loc)) return;
    if (s.flags.abundance) { this.log('Unnatural Abundance: no Herald Rewards this Round.'); return; }
    this.gainInf(p, 1, p.herald === loc ? 'Herald Reward' : 'Herald Reward (Legendary Creature)');
    for (const op of this.opps(p.i)) if ((op.herald === loc || op.legend === loc) && op.inf > 0) { op.inf--; p.inf++; this.log(`${p.name} steals 1 Influence from ${op.name}'s ${op.herald === loc ? 'Herald' : 'Legendary Creature'}.`, 'inf'); }
    for (const e of s.councils.relics.filter((x) => x.owner === p.i)) {
      const v = this.votesOf(e.card);
      if (v && await this.yes(p.i, `Council of Relics: discard your ${e.card.name} from the Council for ${v} Influence?`, `Discard for ${v}`, 'Keep it', s.round >= s.rounds - 1 ? 2 : 0.4)) {
        await this.removeFromCouncil(e, 'Council of Relics');
        this.gainInf(p, v, 'Council of Relics');
      }
    }
  }

  // ================= AUTUMN =================
  async autumn() {
    this.step('autumn', 'Autumn Actions');
    await this.coach('autumn');
    for (const p of this.turn()) await this.actionStep(p, 'autumn');
  }

  // ================= WINTER =================
  async winter() {
    const s = this.s;
    this.step('winter', 'Winter Effects & Cleanup');
    await this.coach('winter');
    for (const e of Object.values(s.councils).flat().slice()) {
      if (e.card.id === 'NOBILITY-16') {
        const from = Object.keys(s.councils).find((k) => s.councils[k].includes(e));
        const to = await this.choose(e.owner, 'The High Court must move to another Council. Which one?', COUNCILS.filter((c) => c.id !== from).map((c) => ({ id: c.id, label: c.name, score: this.councilScore(e.owner, c.id) })), { auto: false });
        s.councils[from].splice(s.councils[from].indexOf(e), 1); s.councils[to].push(e);
        this.log(`The High Court moves to the ${councilName(to)}.`);
      }
      if (e.card.id === 'GATHERING-16') {
        const p = this.P(e.owner);
        if (p.markers > 0) {
          const c = await this.choose(p.i, 'Bringer of the Word: place a Faction Marker on which Council? (It counts as 1 Vote for you while the Bringer is in a Council.)', COUNCILS.map((x) => ({ id: x.id, label: x.name, score: this.councilScore(p.i, x.id) })), { auto: false });
          const m = (s.cmarks[c][p.i] = s.cmarks[c][p.i] || {}); m.bringer = (m.bringer || 0) + 1; p.markers--;
        }
      }
    }
    for (const [rid, R] of Object.entries(s.regions)) for (const x of R.cards) if (x.up && this.textIs(x.card, 'NOBILITY-18', rid) && (R.sup[x.card.owner] || 0) >= 2) { x.card.inf++; this.log('Gilded Wall gains 1 Influence.'); }
    // Wild Kingdom winter effects
    for (const p of s.players) {
      if (this.has(p, 'a-dread-deal')) {
        const mine = s.lost.filter((c) => c.owner === p.i);
        if (mine.length) { mine.forEach((c) => { this.takeFrom(s.lost, c); s.burned.push(c); }); await this.gainLore(p, 2, 'A Dread Deal'); this.log(`A Dread Deal: ${p.name} Burns ${mine.length} Lost card(s).`); }
        else { await this.discardKingdom(this.kOwned(p).find((k) => k.k === 'a-dread-deal'), false); this.log(`A Dread Deal is discarded (nothing to Burn).`); }
      }
      const leg = this.allFaction.find((c) => c.legendary && c.owner === p.i);
      if (leg && !p.hand.includes(leg) && !p.lsupply.includes(leg) && !s.burned.includes(leg)) { this.detach(leg); this.reset(leg); p.lsupply.push(leg); this.log(`${leg.name} returns to ${p.name}'s Supply.`); }
      if (p.nf !== 'none' && p.nf !== 'board') p.nf = 'board';
    }
    if (s.pieces.nearfar) { const to = this.travel(s.pieces.nearfar); this.log(`The Near & Far travels to the ${locName(to)}.`); s.pieces.nearfar = to; }
    for (const p of s.players) { p.herald = null; p.legend = null; }
    for (const [rid, R] of Object.entries(s.regions)) {
      const nr = blankRegion();
      for (const [pi, n] of Object.entries(R.sup)) if (n > 0) {
        const q = this.P(+pi);
        if (this.has(q, 'the-wyrm')) { q.burnedSup += n; this.log(`The Wyrm: ${q.name}'s ${n} Supporter(s) on the Map are Burned.`, 'warn'); }
        else if (q.flags.stones) { nr.sup[pi] = n; nr.fresh[pi] = n; } else q.lostSup += n;
      }
      for (const x of R.cards) {
        if (x.up && x.card.inf > 0) { x.card.inf--; x.used = false; x.card.ctmp = {}; x.card.tmp = {}; nr.cards.push(x); }
        else this.toDiscard(x.card);
      }
      for (const k of R.ks) { if (['ruined-citadel', 'poisoners-ball', 'cracked-sundial', 'sudden-eclipse'].includes(k.card.k)) s.kdiscard.push(k.card); else nr.ks.push(k); }
      s.regions[rid] = nr;
    }
    for (const p of s.players) for (const c of [...p.hand, ...p.discard, ...p.deck]) { c.tmp = {}; c.ctmp = {}; }
    this.log('Winter cleanup: Heralds go home, Supporters on the Map go to the Lost Pile, Active cards go to Discard Piles (cards with Influence on them stay and lose 1).');
    await this.beat(`End of Round ${s.round}. Influence: ${s.players.map((p) => `${p.short} ${p.inf}`).join(' · ')}.`);
  }

  finish() {
    const s = this.s;
    s.season = 'end'; s.step = 'Game over';
    for (const p of s.players) if (!p.site.length && p.lore >= 2) this.gainInf(p, Math.floor(p.lore / 2), `empty Site of Power (${p.siteName}: 1 per 2 Lore)`);
    for (const p of s.players) if (this.has(p, 'the-once-crown-found')) this.gainInf(p, 3, 'The Once Crown, Found');
    const fav = s.favour ? s.favour.pi : null;
    const crown = (q) => (this.has(q, 'the-once-crown-found') ? 1 : 0);
    const rank = s.players.slice().sort((a, b) => b.inf - a.inf || crown(b) - crown(a) || (fav === b.i) - (fav === a.i) || s.order.indexOf(a.i) - s.order.indexOf(b.i));
    s.over = true;
    s.result = { winner: rank[0].i, scores: s.players.map((p) => p.inf) };
    this.log(`Game over! ${rank[0].name} claims the Old King's Crown with ${rank[0].inf} Influence.`, 'head');
    this.io.update?.(s);
    return s.result;
  }
}

function blankRegion() { return { cards: [], sup: {}, fresh: {}, bonus: {}, ks: [], winner: null, claimed: null, tie: false, resolved: false, martial: null, firstDone: false }; }
export function boonLabel(b) { return b.text || (b.rules || []).map((r) => `${cap(r.season)}: ${r.text}`).join(' '); }
export function kText(k) { return [k.text, ...(k.rules || []).map((r) => `${cap(r.season)}: ${r.text}`)].filter(Boolean).join(' '); }
export { regionOfLoc, ARCH };
