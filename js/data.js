// Game data for King's Crown, a learn-to-play helper for The Old King's Crown (Eerie Idol Games).
//
// IMPORTANT: the round structure, steps, Commands, Traits and Councils follow the rulebook.
// The individual CARD values below (strengths, votes, lore, Location rewards, Kingdom Cards)
// are STAND-INS made up for learning, because the real card text isn't available yet.
// Every stand-in is marked `standIn: true` so it is easy to find and replace with the real cards.

export const FACTIONS = [
  { id: 'nobility', name: 'The Nobility', color: '#d9a441' },
  { id: 'clans', name: 'The Clans', color: '#5f9e5a' },
  { id: 'uprising', name: 'The Uprising', color: '#c4553f' },
  { id: 'gathering', name: 'The Gathering', color: '#7b6cc4' },
];

// The Map: three Regions (rows), two Locations each. (Real layout from the rulebook.)
export const REGIONS = [
  { id: 'high', name: 'Highlands', locs: ['castle', 'wild'] },
  { id: 'plat', name: 'Plateau', locs: ['harvest', 'battle'] },
  { id: 'low', name: 'Lowlands', locs: ['shrine', 'necro'] },
];

export const regionOfLoc = (loc) => REGIONS.find((r) => r.locs.includes(loc)).id;

// Location rewards. Names and the Castle/Harvest Field ideas come from the rulebook;
// the numbers and the other four texts are stand-ins.
export const LOCATIONS = {
  castle: { name: 'Castle', inf: 1, fx: 'govern', text: 'Govern: put a card with Votes (from your hand, or Active here) into a Council. All other cards in that Council are removed.', standIn: true },
  wild: { name: 'Wilderness', inf: 1, fx: 'lore2', text: 'Gain 2 Lore (you may spend it right away at your Site of Power).', standIn: true },
  harvest: { name: 'Harvest Field', inf: 1, fx: 'favour', text: "Take the Kingdom's Favour (it wins ties at the end of the game).", standIn: true },
  battle: { name: 'Battlefield', inf: 3, fx: null, text: 'No extra effect — just the most Influence.', standIn: true },
  shrine: { name: 'Shrine', inf: 2, fx: 'supporter', text: 'Get 1 of your Supporters back from the Lost Pile.', standIn: true },
  necro: { name: 'Necropolis', inf: 2, fx: 'draw', text: 'Draw 1 card (if your hand has room).', standIn: true },
};

// The 14-card starting deck. Every faction's deck has the same make-up in the real game
// (only the art and a few special cards differ), so all factions use this list here.
export const STARTER = [
  { k: 'heir', name: 'Heir', str: 6, votes: 1, traits: ['resilient'], text: 'Your leader. Strong, and Resilient: if Eliminated it goes to your Discard Pile, not the Lost Pile.' },
  { k: 'soldier', name: 'Soldier', str: 4, n: 2 },
  { k: 'scout', name: 'Scout', str: 2, lore: 2, traits: ['pathfinder'], n: 2, text: 'Good for Journeying. Pathfinder: comes back to your Discard Pile after a Journey.' },
  { k: 'advisor', name: 'Advisor', str: 1, votes: 2, n: 2, text: 'Weak in a fight, but 2 Votes when you Govern.' },
  { k: 'priest', name: 'Priest', str: 1, votes: 2, lore: 1 },
  { k: 'knight', name: 'Knight', str: 5, traits: ['resilient'] },
  { k: 'assassin', name: 'Assassin', str: 0, cmd: 'deadly', text: 'Deadly: at Night, Eliminates every opposing Active card in this Clash.' },
  { k: 'guard', name: 'Shieldbearer', str: 3, traits: ['invulnerable'], text: 'Invulnerable: cannot be Eliminated (Deadly does nothing to it).' },
  { k: 'skirmisher', name: 'Skirmisher', str: 3, cmd: 'ambush', text: 'Ambush (Day): add a card from your hand to this Clash.' },
  { k: 'envoy', name: 'Envoy', str: 2, votes: 1, lore: 1 },
  { k: 'outrider', name: 'Outrider', str: 2, cmd: 'retreat', text: 'Retreat (Day): take your Active cards and Supporters here back to your hand/board.' },
].map((c) => ({ votes: 0, lore: 0, traits: [], cmd: null, n: 1, text: '', standIn: true, ...c }));

// Site of Power: five Advanced/HQ cards bought with Lore. Advanced cards go to your hand,
// HQ cards stay in your Supply and give a lasting bonus.
export const SITE = [
  { k: 'champion', name: 'Champion', str: 7, cost: 3, adv: true, text: 'A big hitter for a Clash.' },
  { k: 'sage', name: 'Sage', str: 2, votes: 3, cost: 3, adv: true, text: '3 Votes when you Govern.' },
  { k: 'wayfarer', name: 'Wayfarer', str: 3, lore: 2, traits: ['pathfinder'], cost: 2, adv: true },
  { k: 'keep', name: 'Keep', cost: 4, hq: true, fx: { hand: 1 }, text: 'HQ: +1 Hand Size.' },
  { k: 'reliquary', name: 'Reliquary', cost: 4, hq: true, fx: { winterInf: 1 }, text: 'HQ: Winter — gain 1 Influence.' },
].map((c) => ({ str: 0, votes: 0, lore: 0, traits: [], cmd: null, fx: {}, text: '', standIn: true, ...c }));

// Kingdom Cards (bid for in Spring). Three copies of each go in the Kingdom Deck.
export const KINGDOM = [
  { k: 'watchtower', name: 'Watchtower', fx: { regionStr: 'high' }, text: '+1 Strength in your Highlands Clashes.' },
  { k: 'banner', name: 'War Banner', fx: { regionStr: 'plat' }, text: '+1 Strength in your Plateau Clashes.' },
  { k: 'ossuary', name: 'Ossuary', fx: { regionStr: 'low' }, text: '+1 Strength in your Lowlands Clashes.' },
  { k: 'granary', name: 'Granary', fx: { hand: 1 }, text: '+1 Hand Size while you hold it.' },
  { k: 'taxes', name: 'Tax Rolls', fx: { winterInf: 1 }, text: 'Winter: gain 1 Influence.' },
  { k: 'library', name: 'Old Library', fx: { journey: 1 }, text: 'When you Journey, gain 1 extra Lore.' },
  { k: 'horn', name: "Herald's Horn", fx: { herald: 1 }, text: 'Your Herald Reward gives 1 extra Influence.' },
  { k: 'bridge', name: 'Toll Bridge', fx: { bid: 1 }, text: '+1 Strength when you Bid.' },
  { k: 'seal', name: 'Royal Seal', fx: { onTakeInf: 2 }, text: 'When you take this: gain 2 Influence.' },
].map((c) => ({ standIn: true, ...c }));

export const COUNCILS = [
  { id: 'relics', name: 'Council of Relics', text: 'When you claim a Herald Reward, you may cash in your cards here: gain 1 Influence per Vote (the cards go to your Discard Pile).' },
  { id: 'secrets', name: 'Council of Secrets', text: 'Autumn: place Faction Markers on a Location, one per Vote. When you have 4+ on one Location, you get its reward text (not its Influence) and take the markers back.' },
  { id: 'oaths', name: 'Council of Oaths', text: 'Autumn: get Supporters back from the Lost Pile, one per Vote (+1 if you have the most Votes here).' },
];

export const GAME = { rounds: 5, startHand: 6, supporters: 5, markers: 10 };
