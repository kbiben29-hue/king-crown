// Rules engine. The game runs as one async script; every decision goes through
// io.ask(playerIndex, prompt) so the same code drives the phone UI, the computer
// opponent and the simulation test.
import { FACTIONS, REGIONS, LOCATIONS, STARTER, SITE, KINGDOM, COUNCILS, GAME, regionOfLoc } from './data.js';

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

export class Game {
  constructor({ seed = Date.now(), factions = ['nobility', 'clans'], humans = [true, false], rounds = GAME.rounds } = {}, io) {
    this.io = io;
    this.rand = rng(seed);
    let id = 0;
    const mk = (t, owner) => ({ ...t, uid: ++id, owner });
    const players = factions.map((f, i) => {
      const fac = FACTIONS.find((x) => x.id === f);
      const cards = [];
      for (const t of STARTER) for (let n = 0; n < t.n; n++) cards.push(mk(t, i));
      const heir = cards.find((c) => c.k === 'heir');
      const deck = this.shuffle(cards.filter((c) => c !== heir));
      const p = {
        i, faction: f, name: fac.name, color: fac.color, human: humans[i],
        deck, hand: [heir], discard: [], handSize: GAME.startHand,
        inf: 0, lore: 0, supporters: GAME.supporters, lostSup: 0, markers: GAME.markers,
        herald: null, kingdom: [null, null], site: SITE.map((t) => mk(t, i)), hq: [],
      };
      while (p.hand.length < GAME.startHand && p.deck.length) p.hand.push(p.deck.pop());
      return p;
    });
    const kdeck = [];
    for (const t of KINGDOM) for (let n = 0; n < 3; n++) kdeck.push(mk(t, null));
    this.s = {
      round: 1, rounds, season: 'setup', step: '', players,
      order: this.shuffle(players.map((p) => p.i)),
      kdeck: this.shuffle(kdeck), kdiscard: [], road: [], lost: [],
      councils: { relics: [], secrets: [], oaths: [] },
      marks: {}, // marks[loc][pi] = Faction Markers (Council of Secrets)
      favour: null,
      regions: Object.fromEntries(REGIONS.map((r) => [r.id, blankRegion()])),
      clashOrder: [], current: null, bids: null, log: [], over: false, result: null,
    };
    for (let n = 0; n < 4; n++) this.s.road.push(this.drawKingdom());
  }

  shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  P(i) { return this.s.players[i]; }
  log(msg, cls = '') { this.s.log.push({ msg, cls, round: this.s.round, season: this.s.season }); this.io.update?.(this.s); }
  async ask(pi, prompt) { this.io.update?.(this.s); return this.io.ask(pi, prompt, this.s, this); }
  // pi: only coach when that player is a human (e.g. don't explain the computer's Journey).
  async coach(key, pi) { if (this.io.coach && (pi == null || this.P(pi).human)) await this.io.coach(key, this.s); }
  async beat(text) { if (this.io.beat) await this.io.beat(text, this.s); }
  step(season, step) { this.s.season = season; this.s.step = step; this.io.update?.(this.s); }

  // ---- helpers -------------------------------------------------------
  fx(p, key) {
    let n = 0;
    for (const slot of p.kingdom) if (slot && slot.card.fx[key]) n += typeof slot.card.fx[key] === 'number' ? slot.card.fx[key] : 1;
    for (const c of p.hq) if (c.fx[key]) n += c.fx[key];
    return n;
  }
  regionBonus(p, rid) { return p.kingdom.filter((s) => s && s.card.fx.regionStr === rid).length; }
  maxHand(p) { return Math.min(8, p.handSize + this.fx(p, 'hand')); }
  votes(pi, council) { return this.s.councils[council].filter((e) => e.owner === pi).reduce((a, e) => a + e.card.votes, 0); }
  drawKingdom() {
    if (!this.s.kdeck.length) { this.s.kdeck = this.shuffle(this.s.kdiscard); this.s.kdiscard = []; }
    return this.s.kdeck.pop() || null;
  }
  // Draw one card; an empty Deck causes Attrition. Returns false if nothing could be drawn.
  drawOne(p) {
    if (!p.deck.length) {
      if (!p.discard.length) return false;
      p.deck = this.shuffle(p.discard); p.discard = [];
      const before = p.handSize; p.handSize = Math.max(3, p.handSize - 1);
      this.log(`${p.name}'s Deck ran out: Attrition! Discard Pile shuffled into a new Deck` + (before !== p.handSize ? `, Hand Size drops to ${p.handSize}.` : ' (Hand Size is already at its minimum of 3).'), 'warn');
    }
    p.hand.push(p.deck.pop());
    return true;
  }
  drawUpTo(p) { while (p.hand.length < this.maxHand(p)) if (!this.drawOne(p)) break; }
  toHand(p, card) {
    if (p.hand.length >= this.maxHand(p) && card.adv) { p.deck.push(card); this.log(`${p.name}'s hand is full, so ${card.name} goes on top of their Deck.`); }
    else p.hand.push(card);
  }
  // A card leaving play: Lost Pile, unless a Trait sends it to the Discard Pile.
  eliminate(c) {
    const p = this.P(c.owner);
    if (c.traits.includes('resilient')) { p.discard.push(c); return 'Discard Pile (Resilient)'; }
    this.s.lost.push(c); return 'Lost Pile';
  }
  gainInf(p, n, why) { if (n > 0) { p.inf += n; this.log(`${p.name} gains ${n} Influence — ${why}.`, 'inf'); } }

  // ---- the whole game -----------------------------------------------
  async run() {
    await this.coach('intro');
    for (; this.s.round <= this.s.rounds; this.s.round++) {
      if (this.s.round > 1) await this.startOfYear();
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
    // Turn order: most Influence first; tied players swap their previous order.
    const prev = this.s.order.slice();
    this.s.order = prev.slice().sort((a, b) => this.P(b).inf - this.P(a).inf || prev.indexOf(b) - prev.indexOf(a));
    this.log(`Turn order (most Influence first): ${this.s.order.map((i) => this.P(i).name).join(', ')}.`);
  }

  // ---------------- SPRING ----------------
  async spring() {
    const s = this.s;
    if (s.round === 1) this.log(`— Round 1 —`, 'head');
    this.step('spring', 'Place Bids');
    await this.coach('bid');
    const bids = {};
    for (const pi of s.order) {
      const p = this.P(pi);
      if (!p.hand.length) continue;
      const uid = await this.ask(pi, { key: 'bid', text: 'Bid: pick a card from your hand, face down. Only its Strength matters. Highest Bid picks a Kingdom Card first.', cards: p.hand.map((c) => c.uid) });
      const c = take(p.hand, uid);
      bids[pi] = c;
    }
    s.bids = bids;
    const bidStr = (pi) => bids[pi].str + this.fx(this.P(pi), 'bid');
    const seq = Object.keys(bids).map(Number).sort((a, b) => bidStr(b) - bidStr(a) || s.order.indexOf(a) - s.order.indexOf(b));
    this.log(`Bids revealed: ${seq.map((pi) => `${this.P(pi).name} ${bids[pi].name} (${bidStr(pi)})`).join(', ')}.`);
    this.step('spring', 'Resolve Bids');
    await this.beat(`Bids revealed — ${seq.map((pi) => `${this.P(pi).name}: ${bids[pi].name}, Strength ${bidStr(pi)}`).join(' · ')}. Highest goes first.`);
    let taken = false;
    for (const pi of seq) {
      const p = this.P(pi), card = bids[pi], str = bidStr(pi);
      const opts = [];
      s.road.forEach((kc, i) => kc && opts.push({ id: `take:${i}`, label: `Take ${kc.name}`, sub: kc.text }));
      for (const op of s.players) if (op.i !== pi) op.kingdom.forEach((slot, si) => {
        if (slot && slot.occ.str < str) opts.push({ id: `steal:${op.i}:${si}`, label: `Steal ${slot.card.name} from ${op.name}`, sub: `Your ${str} beats their ${slot.occ.name} (${slot.occ.str}). Their card goes back to their hand.` });
      });
      opts.push({ id: 'return', label: `Take nothing — ${card.name} back to hand` });
      await this.coach('bidUse', pi);
      const ch = await this.ask(pi, { key: 'bidUse', text: `Your Bid: ${card.name} (Strength ${str}). Choose what it gets you. The Bid card stays under the Kingdom Card to guard it.`, options: opts, bid: card.uid });
      const [kind, a, b] = ch.split(':');
      if (kind === 'take') {
        const kc = s.road[+a]; s.road[+a] = null; taken = true;
        await this.occupy(p, kc, card, 'takes');
      } else if (kind === 'steal') {
        const op = this.P(+a), slot = op.kingdom[+b];
        op.kingdom[+b] = null; op.hand.push(slot.occ);
        await this.occupy(p, slot.card, card, `steals from ${op.name}:`);
      } else {
        p.hand.push(card); this.log(`${p.name} takes nothing; ${card.name} returns to hand.`);
      }
    }
    s.bids = null;
    this.repopulateRoad(taken);

    this.step('spring', 'Place Heralds');
    await this.coach('herald');
    for (const pi of s.order) {
      const opts = REGIONS.flatMap((r) => r.locs.map((l) => ({ id: l, label: `${LOCATIONS[l].name} (${r.name})`, sub: `${LOCATIONS[l].inf} Influence. ${LOCATIONS[l].text}` })));
      const loc = await this.ask(pi, { key: 'herald', text: 'Place your Herald on a Location. If you win that Region and pick this Location, you get a bonus Influence (and steal 1 from any rival Herald there).', options: opts });
      this.P(pi).herald = loc;
      this.log(`${this.P(pi).name} places their Herald on the ${locName(loc)}.`);
    }

    this.step('spring', 'Place cards by Regions');
    await this.coach('place');
    for (const pi of s.order) await this.placeCards(pi);
    this.log(`Everyone has placed their face-down cards.`);

    this.step('spring', 'Spring Actions');
    await this.coach('supporters');
    for (const pi of s.order) {
      const p = this.P(pi);
      while (p.supporters > 0) {
        const opts = REGIONS.map((r) => ({ id: r.id, label: `+1 Supporter in ${r.name}` }));
        opts.push({ id: 'done', label: 'Done placing Supporters' });
        const ch = await this.ask(pi, { key: 'supporter', text: `Spring Actions: place Supporters (${p.supporters} left on your board). Each adds +1 Strength to its Region's Clash — but it's spent afterwards (goes to the Lost Pile in Winter).`, options: opts });
        if (ch === 'done') break;
        p.supporters--; s.regions[ch].sup[pi] = (s.regions[ch].sup[pi] || 0) + 1; s.regions[ch].fresh[pi] = (s.regions[ch].fresh[pi] || 0) + 1;
        this.log(`${p.name} places a Supporter in the ${regionName(ch)}.`);
      }
    }
  }

  async occupy(p, kc, bidCard, verb) {
    let si = p.kingdom.findIndex((x) => !x);
    if (si < 0) {
      si = +(await this.ask(p.i, { key: 'slot', text: `Both your Kingdom Card spaces are full. Which one does ${kc.name} replace? (The old Kingdom Card is discarded and its guard card returns to your hand.)`, options: p.kingdom.map((x, i) => ({ id: String(i), label: `Replace ${x.card.name}`, sub: x.card.text })) }));
      const old = p.kingdom[si];
      this.s.kdiscard.push(old.card); p.hand.push(old.occ);
      this.log(`${p.name} discards ${old.card.name}; ${old.occ.name} returns to hand.`);
    }
    p.kingdom[si] = { card: kc, occ: bidCard };
    this.log(`${p.name} ${verb} ${kc.name}, guarded by ${bidCard.name} (${bidCard.str}).`);
    if (kc.fx.onTakeInf) this.gainInf(p, kc.fx.onTakeInf, kc.name);
  }

  repopulateRoad(taken) {
    const s = this.s;
    let left = s.road.filter(Boolean);
    const drop = taken ? 1 : 2;
    for (let n = 0; n < drop && left.length; n++) s.kdiscard.push(left.pop());
    while (left.length < 4) { const c = this.drawKingdom(); if (!c) break; left.unshift(c); }
    s.road = left;
    this.log(`The Great Road slides along: the oldest card${drop > 1 ? 's are' : ' is'} discarded and new Kingdom Cards are revealed.`);
  }

  async placeCards(pi) {
    const p = this.P(pi), s = this.s;
    const regions = REGIONS.map((r) => r.id);
    if (p.hand.length >= 3) {
      for (const rid of regions) {
        const uid = await this.ask(pi, { key: 'place', region: rid, text: `Place a face-down card next to the ${regionName(rid)}. You must put one card in each Region.`, cards: p.hand.map((c) => c.uid) });
        s.regions[rid].cards.push({ card: take(p.hand, uid), up: false, used: false });
      }
    } else {
      let free = regions.slice();
      while (p.hand.length && free.length) {
        const rid = await this.ask(pi, { key: 'placeRegion', text: `You have fewer than 3 cards, so choose which Regions get one.`, options: free.map((r) => ({ id: r, label: regionName(r) })) });
        free = free.filter((r) => r !== rid);
        const uid = await this.ask(pi, { key: 'place', region: rid, text: `Card for the ${regionName(rid)}:`, cards: p.hand.map((c) => c.uid) });
        s.regions[rid].cards.push({ card: take(p.hand, uid), up: false, used: false });
      }
    }
  }

  // ---------------- SUMMER ----------------
  async summer() {
    const s = this.s;
    this.step('summer', 'Place Clash Markers');
    await this.coach('clashOrder');
    const last = s.order[s.order.length - 1];
    let left = REGIONS.map((r) => r.id);
    s.clashOrder = [];
    for (const n of ['I', 'II']) {
      const rid = await this.ask(last, { key: 'clashOrder', text: `You're last in turn order, so you decide the order of the Clashes. Which Region gets Clash Marker ${n}?`, options: left.map((r) => ({ id: r, label: `${n}: ${regionName(r)}` })) });
      s.clashOrder.push(rid); left = left.filter((r) => r !== rid);
    }
    s.clashOrder.push(left[0]);
    this.log(`${this.P(last).name} sets the Clash order: ${s.clashOrder.map(regionName).join(' → ')}.`);
    for (const rid of s.clashOrder) await this.resolveRegion(rid);
    s.current = null;
  }

  async resolveRegion(rid) {
    const s = this.s, R = s.regions[rid];
    s.current = rid;
    let contenders = s.order.slice();
    let first = true;
    for (;;) {
      this.step('summer', `${regionName(rid)}: Reveal`);
      const fresh = () => R.cards.filter((c) => !c.used);
      fresh().forEach((c) => (c.up = true));
      this.log(`${regionName(rid)} Clash — revealed: ${fresh().map((c) => `${this.P(c.card.owner).name} ${c.card.name} (${c.card.str})`).join(', ') || 'no cards'}.`, 'head');
      if (first) await this.coach('reveal');

      // Day Action Step
      this.step('summer', `${regionName(rid)}: Day Actions`);
      if (first) await this.coach('day');
      for (const pi of s.order) if (contenders.includes(pi)) await this.dayActions(pi, rid);
      const ambushed = R.cards.filter((c) => !c.used && !c.up);
      if (ambushed.length) {
        ambushed.forEach((c) => (c.up = true));
        this.log(`Ambush revealed: ${ambushed.map((c) => `${this.P(c.card.owner).name} ${c.card.name} (${c.card.str})`).join(', ')}.`);
        for (const pi of s.order) if (ambushed.some((c) => c.card.owner === pi && c.card.cmd)) await this.dayActions(pi, rid);
      }

      // Night Effects Step
      this.step('summer', `${regionName(rid)}: Night Effects`);
      const killers = new Set(fresh().filter((c) => c.card.cmd === 'deadly').map((c) => c.card.owner));
      if (killers.size) {
        await this.coach('night');
        const doomed = fresh().filter((c) => [...killers].some((k) => k !== c.card.owner));
        for (const c of doomed) {
          if (c.card.traits.includes('invulnerable')) { this.log(`${c.card.name} is Invulnerable and survives the Deadly strike.`); continue; }
          R.cards.splice(R.cards.indexOf(c), 1);
          this.log(`Deadly! ${this.P(c.card.owner).name}'s ${c.card.name} is Eliminated → ${this.eliminate(c.card)}.`, 'warn');
        }
      }

      // Tally Strength
      this.step('summer', `${regionName(rid)}: Tally Strength`);
      const totals = {}, parts = {};
      for (const pi of contenders) {
        const p = this.P(pi);
        const cards = fresh().filter((c) => c.card.owner === pi);
        const cs = cards.reduce((a, c) => a + c.card.str, 0);
        const sup = R.fresh[pi] || 0;
        const bonus = cards.length || sup ? this.regionBonus(p, rid) : 0;
        totals[pi] = cs + sup + bonus;
        parts[pi] = [cards.length ? `cards ${cs}` : null, sup ? `Supporters ${sup}` : null, bonus ? `Kingdom Card +${bonus}` : null].filter(Boolean).join(' + ') || 'nothing';
      }
      fresh().forEach((c) => (c.used = true));
      R.fresh = {};
      if (first) await this.coach('tally');
      const max = Math.max(...contenders.map((pi) => totals[pi]));
      const winners = contenders.filter((pi) => totals[pi] === max);
      const summary = contenders.map((pi) => `${this.P(pi).name} ${totals[pi]} (${parts[pi]})`).join(' vs ');
      this.log(`${regionName(rid)} Strength: ${summary}.`);
      if (winners.length === 1 && max > 0) {
        await this.beat(`${regionName(rid)}: ${summary}. ${this.P(winners[0]).name} wins!`);
        await this.claim(winners[0], rid);
        return;
      }
      // Tie: tied players may each add one more face-down card, in turn order.
      this.log(`${regionName(rid)} is tied at ${max}.`, 'warn');
      await this.beat(`${regionName(rid)}: ${summary}. It's a tie!`);
      await this.coach('tie');
      const played = [];
      for (const pi of s.order) {
        if (!winners.includes(pi)) continue;
        const p = this.P(pi);
        if (!p.hand.length) continue;
        const ch = await this.ask(pi, { key: 'tie', text: `Tie in the ${regionName(rid)}! Add one more face-down card from your hand to start a new Clash here, or pass. Only the new cards count in the new Clash.`, options: [{ id: 'play', label: 'Add a card' }, { id: 'pass', label: 'Pass' }] });
        if (ch !== 'play') { this.log(`${p.name} passes.`); continue; }
        const uid = await this.ask(pi, { key: 'tieCard', region: rid, text: `Which card joins the new Clash in the ${regionName(rid)}? Only new cards count.`, cards: p.hand.map((c) => c.uid) });
        R.cards.push({ card: take(p.hand, uid), up: false, used: false });
        played.push(pi);
        this.log(`${p.name} adds another card to the ${regionName(rid)}.`);
      }
      if (!played.length) {
        this.log(`Everyone passed: the ${regionName(rid)} is a tie. Nobody gets its rewards this Round.`, 'warn');
        R.tie = true;
        return;
      }
      contenders = winners;
      first = false;
    }
  }

  async dayActions(pi, rid) {
    const p = this.P(pi), R = this.s.regions[rid];
    for (;;) {
      const mine = R.cards.filter((c) => !c.used && c.up && c.card.owner === pi && !c.cmdUsed);
      const opts = [];
      const amb = mine.find((c) => c.card.cmd === 'ambush');
      const ret = mine.find((c) => c.card.cmd === 'retreat');
      if (amb && p.hand.length) opts.push({ id: 'ambush', label: `Ambush (${amb.card.name}): add a card from hand` });
      if (ret) opts.push({ id: 'retreat', label: `Retreat (${ret.card.name}): pull your cards & Supporters out` });
      if (!opts.length) return;
      opts.push({ id: 'done', label: 'No more Day Actions' });
      const ch = await this.ask(pi, { key: 'day', region: rid, text: `Day Actions in the ${regionName(rid)}: you may use Commands on your revealed cards.`, options: opts });
      if (ch === 'done') return;
      if (ch === 'ambush') {
        amb.cmdUsed = true;
        const uid = await this.ask(pi, { key: 'ambushCard', region: rid, text: 'Ambush: which card joins the Clash? (It is revealed at the end of the Day.)', cards: p.hand.map((c) => c.uid) });
        R.cards.push({ card: take(p.hand, uid), up: false, used: false });
        this.log(`${p.name} uses Ambush: a hidden card joins the ${regionName(rid)}.`);
      } else {
        const back = R.cards.filter((c) => !c.used && c.card.owner === pi);
        back.forEach((c) => { R.cards.splice(R.cards.indexOf(c), 1); p.hand.push(c.card); });
        const sup = R.fresh[pi] || 0;
        p.supporters += sup; R.sup[pi] = (R.sup[pi] || 0) - sup; R.fresh[pi] = 0;
        this.log(`${p.name} Retreats from the ${regionName(rid)}: ${back.map((c) => c.card.name).join(', ')} back to hand${sup ? `, ${sup} Supporter(s) back to their board` : ''}.`);
        return;
      }
    }
  }

  async claim(pi, rid) {
    const s = this.s, p = this.P(pi), R = s.regions[rid];
    this.step('summer', `${regionName(rid)}: Claim Rewards`);
    await this.coach('claim');
    const reg = REGIONS.find((r) => r.id === rid);
    const loc = await this.ask(pi, {
      key: 'loc', region: rid, text: `You won the ${regionName(rid)}! Choose one Location to claim.`,
      options: reg.locs.map((l) => {
        const herald = s.players.filter((q) => q.herald === l);
        return { id: l, label: `${LOCATIONS[l].name}: ${LOCATIONS[l].inf} Influence`, sub: LOCATIONS[l].text + (herald.length ? ` Heralds here: ${herald.map((q) => q.name).join(', ')}.` : '') };
      }),
    });
    R.winner = pi; R.claimed = loc;
    this.gainInf(p, LOCATIONS[loc].inf, `the ${locName(loc)}`);
    await this.locationEffect(p, loc, rid);
    if (p.herald === loc) {
      this.gainInf(p, 1 + this.fx(p, 'herald'), 'Herald Reward');
      for (const op of s.players) if (op.i !== pi && op.herald === loc && op.inf > 0) {
        op.inf--; p.inf++; this.log(`${p.name} steals 1 Influence from ${op.name}'s Herald.`, 'inf');
      }
      const rv = this.votes(pi, 'relics');
      if (rv > 0) {
        const ch = await this.ask(pi, { key: 'relics', text: `Council of Relics: cash in your cards there for ${rv} Influence? (They go to your Discard Pile, so you lose those Votes.)`, options: [{ id: 'yes', label: `Cash in for ${rv} Influence` }, { id: 'no', label: 'Keep them' }], votes: rv });
        if (ch === 'yes') {
          const mine = s.councils.relics.filter((e) => e.owner === pi);
          s.councils.relics = s.councils.relics.filter((e) => e.owner !== pi);
          mine.forEach((e) => p.discard.push(e.card));
          this.gainInf(p, rv, 'Council of Relics');
        }
      }
    }
  }

  async locationEffect(p, loc, rid) {
    const s = this.s;
    switch (LOCATIONS[loc].fx) {
      case 'favour':
        s.favour = p.i; this.log(`${p.name} takes the Kingdom's Favour.`); break;
      case 'lore2':
        await this.gainLore(p, 2, 'the Wilderness'); break;
      case 'supporter':
        if (p.lostSup > 0) { p.lostSup--; p.supporters++; this.log(`${p.name} gets a Supporter back.`); } break;
      case 'draw':
        if (p.hand.length < this.maxHand(p) && this.drawOne(p)) this.log(`${p.name} draws a card.`);
        else this.log(`${p.name}'s hand is full — no card drawn.`); break;
      case 'govern': {
        const R = rid ? s.regions[rid] : null;
        const pool = [...p.hand.filter((c) => c.votes > 0).map((c) => ({ c, from: 'hand' })), ...(R ? R.cards.filter((x) => x.card.owner === p.i && x.card.votes > 0).map((x) => ({ c: x.card, from: 'active', x })) : [])];
        if (!pool.length) { this.log(`${p.name} has no card with Votes to Govern with.`); break; }
        const uid = await this.ask(p.i, { key: 'castleGovern', text: 'Castle: Govern with a card that has Votes. All OTHER cards in the Council you pick are removed!', cards: pool.map((e) => e.c.uid), optional: true });
        if (uid == null) break;
        const e = pool.find((x) => x.c.uid === uid);
        if (e.from === 'hand') take(p.hand, uid); else R.cards.splice(R.cards.indexOf(e.x), 1);
        const council = await this.askCouncil(p, e.c);
        const removed = s.councils[council];
        removed.forEach((x) => this.P(x.owner).discard.push(x.card));
        s.councils[council] = [{ owner: p.i, card: e.c }];
        this.log(`${p.name} Governs at the Castle: ${e.c.name} enters the ${councilName(council)}${removed.length ? `, removing ${removed.map((x) => x.card.name).join(', ')}` : ''}.`);
        break;
      }
    }
  }

  async askCouncil(p, card) {
    return this.ask(p.i, { key: 'council', text: `Which Council does ${card.name} (${card.votes} Vote${card.votes > 1 ? 's' : ''}) join? It stays there in later Rounds too.`, options: COUNCILS.map((c) => ({ id: c.id, label: c.name, sub: `${c.text} You have ${this.votes(p.i, c.id)} Votes there now.` })), card: card.uid });
  }

  async gainLore(p, n, why) {
    p.lore += n;
    this.log(`${p.name} gains ${n} Lore — ${why}.`);
    // Lore can only be spent right when it is gained.
    for (;;) {
      const can = p.site.filter((c) => c.cost <= p.lore);
      if (!can.length) return;
      await this.coach('buy', p.i);
      const ch = await this.ask(p.i, { key: 'buy', text: `You have ${p.lore} Lore. Spend it now at your Site of Power? (Lore can only be spent right when you gain it.)`, options: [...can.map((c) => ({ id: String(c.uid), label: `${c.name} — ${c.cost} Lore`, sub: (c.hq ? 'HQ (stays in front of you). ' : `Advanced card to your hand, Strength ${c.str}${c.votes ? `, ${c.votes} Votes` : ''}${c.lore ? `, ${c.lore} Lore` : ''}. `) + c.text })), { id: 'done', label: 'Save the Lore' }] });
      if (ch === 'done') return;
      const c = take(p.site, +ch);
      p.lore -= c.cost;
      if (c.hq) p.hq.push(c); else this.toHand(p, c);
      this.log(`${p.name} buys ${c.name} from their Site of Power.`);
    }
  }

  // ---------------- AUTUMN ----------------
  async autumn() {
    const s = this.s;
    this.step('autumn', 'Autumn Actions');
    await this.coach('autumn');
    for (const pi of s.order) {
      const p = this.P(pi);
      const used = {};
      for (;;) {
        const opts = [];
        if (!used.govern && p.hand.some((c) => c.votes > 0)) opts.push({ id: 'govern', label: 'Govern: put a card with Votes into a Council' });
        if (!used.journey && p.hand.some((c) => c.lore > 0)) opts.push({ id: 'journey', label: 'Journey: send a card with Lore away for Lore' });
        const sv = this.votes(pi, 'secrets');
        if (!used.secrets && sv > 0 && p.markers > 0) opts.push({ id: 'secrets', label: `Council of Secrets: place ${Math.min(sv, p.markers)} Faction Marker(s)` });
        const ov = this.votes(pi, 'oaths');
        if (!used.oaths && ov > 0 && p.lostSup > 0) opts.push({ id: 'oaths', label: `Council of Oaths: get Supporters back` });
        if (!opts.length) break;
        opts.push({ id: 'done', label: 'End my Autumn' });
        const ch = await this.ask(pi, { key: 'autumn', text: 'Autumn: you may Govern once and Journey once, and use your Councils. Cards you use now leave your hand, so think about next year too.', options: opts });
        if (ch === 'done') break;
        used[ch] = true;
        if (ch === 'govern') {
          await this.coach('govern', pi);
          const uid = await this.ask(pi, { key: 'governCard', text: 'Govern with which card? Its Votes count in that Council from now on.', cards: p.hand.filter((c) => c.votes > 0).map((c) => c.uid) });
          const c = take(p.hand, uid);
          const council = await this.askCouncil(p, c);
          s.councils[council].push({ owner: pi, card: c });
          this.log(`${p.name} Governs: ${c.name} (${c.votes} Votes) joins the ${councilName(council)}.`);
        } else if (ch === 'journey') {
          await this.coach('journey', pi);
          const uid = await this.ask(pi, { key: 'journeyCard', text: 'Journey with which card? It goes to the Lost Pile (Pathfinders go to your Discard Pile instead) and you gain its Lore.', cards: p.hand.filter((c) => c.lore > 0).map((c) => c.uid) });
          const c = take(p.hand, uid);
          const path = c.traits.includes('pathfinder');
          if (path) p.discard.push(c); else s.lost.push(c);
          this.log(`${p.name} Journeys with ${c.name} → ${path ? 'Discard Pile (Pathfinder)' : 'Lost Pile'}.`);
          await this.gainLore(p, c.lore + this.fx(p, 'journey'), `Journey`);
        } else if (ch === 'secrets') {
          const n = Math.min(sv, p.markers);
          const loc = await this.ask(pi, { key: 'secretsLoc', text: `Council of Secrets: put ${n} Faction Marker(s) on one Location. At 4 markers you get that Location's reward text (not its Influence).`, options: Object.keys(LOCATIONS).map((l) => ({ id: l, label: `${LOCATIONS[l].name} (you have ${(s.marks[l] || {})[pi] || 0})`, sub: LOCATIONS[l].text })) });
          s.marks[loc] = s.marks[loc] || {};
          s.marks[loc][pi] = (s.marks[loc][pi] || 0) + n; p.markers -= n;
          this.log(`${p.name} places ${n} Faction Marker(s) on the ${locName(loc)}.`);
          if (s.marks[loc][pi] >= 4) {
            p.markers += s.marks[loc][pi]; s.marks[loc][pi] = 0;
            this.log(`${p.name} has 4+ markers on the ${locName(loc)} and gets its reward!`);
            await this.locationEffect(p, loc, null);
          }
        } else if (ch === 'oaths') {
          const most = s.players.every((q) => q.i === pi || this.votes(q.i, 'oaths') < ov);
          const n = Math.min(p.lostSup, ov + (most ? 1 : 0));
          p.lostSup -= n; p.supporters += n;
          this.log(`${p.name} uses the Council of Oaths: ${n} Supporter(s) come back.`);
        }
      }
    }
  }

  // ---------------- WINTER ----------------
  async winter() {
    const s = this.s;
    this.step('winter', 'Winter Effects & Cleanup');
    await this.coach('winter');
    for (const p of s.players) {
      const w = this.fx(p, 'winterInf');
      if (w) this.gainInf(p, w, 'Winter effects');
    }
    for (const p of s.players) p.herald = null;
    for (const r of REGIONS) {
      const R = s.regions[r.id];
      for (const [pi, n] of Object.entries(R.sup)) if (n > 0) this.P(+pi).lostSup += n;
      for (const c of R.cards) this.P(c.card.owner).discard.push(c.card);
      s.regions[r.id] = blankRegion();
    }
    this.log(`Winter cleanup: Heralds go home, Supporters on the Map go to the Lost Pile, Active cards go to Discard Piles.`);
    await this.beat(`End of Round ${s.round}. Influence: ${s.players.map((p) => `${p.name} ${p.inf}`).join(' · ')}.`);
  }

  finish() {
    const s = this.s;
    s.season = 'end'; s.step = 'Game over';
    for (const p of s.players) if (!p.site.length && p.lore >= 2) this.gainInf(p, Math.floor(p.lore / 2), 'empty Site of Power (1 per 2 Lore)');
    const rank = s.players.slice().sort((a, b) => b.inf - a.inf || (s.favour === b.i) - (s.favour === a.i) || s.order.indexOf(a.i) - s.order.indexOf(b.i));
    s.over = true;
    s.result = { winner: rank[0].i, scores: s.players.map((p) => p.inf) };
    this.log(`Game over! ${rank[0].name} claims the Old King's Crown with ${rank[0].inf} Influence.`, 'head');
    this.io.update?.(s);
    return s.result;
  }
}

function blankRegion() { return { cards: [], sup: {}, fresh: {}, winner: null, claimed: null, tie: false }; }
function take(arr, uid) { const i = arr.findIndex((c) => c.uid === uid); if (i < 0) throw new Error('card not found ' + uid); return arr.splice(i, 1)[0]; }
export function councilName(id) { return COUNCILS.find((c) => c.id === id).name; }
export { regionOfLoc };
