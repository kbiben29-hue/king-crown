// Game data for King's Crown. Card text, stats and images come from js/cards.js,
// which is generated from the Eerie Card Library (see tools/build-cards.py).
import { CARDS } from './cards.js?v=9';
export { CARDS };

export const FACTIONS = [
  { id: 'nobility', name: 'The Nobility', color: '#4f7bd0' },
  { id: 'clans', name: 'The Clans', color: '#4f9e8a' },
  { id: 'uprising', name: 'The Uprising', color: '#c4553f' },
  { id: 'gathering', name: 'The Gathering', color: '#9a5cc4' },
];

// The Map: three Regions (rows), two Locations each.
export const REGIONS = [
  { id: 'high', name: 'Highlands', locs: ['castle', 'wilderness'] },
  { id: 'plat', name: 'Plateau', locs: ['harvest', 'battlefield'] },
  { id: 'low', name: 'Lowlands', locs: ['shrine', 'necropolis'] },
];
export const regionOfLoc = (loc) => REGIONS.find((r) => r.locs.includes(loc)).id;

const M = CARDS.map;
export const LOCATIONS = {
  castle: { name: 'Castle', inf: 1, fx: 'govern', text: 'Govern with one card that is Active or in your hand. If you do, discard all other cards at that Council.', image: M.castle.image },
  wilderness: { name: 'Wilderness', inf: 1, fx: 'journey', text: 'Journey with one card that is Active or in your hand.', image: M.wilderness.image },
  harvest: { name: 'Harvest Field', inf: 1, fx: 'favour', text: "Gain the Kingdom's Favour.", image: M['harvest-field'].image },
  battlefield: { name: 'Battlefield', inf: 2, fx: null, text: 'Just Influence — the most on the Map.', image: M.battlefield.image },
  shrine: { name: 'Shrine', inf: 1, fx: 'shrine', text: 'Move up to three cards that are Active and/or in your hand to the bottom of your Deck.', image: M.shrine.image },
  necropolis: { name: 'Necropolis', inf: 1, fx: 'necro', text: 'Shuffle your Discard Pile and draw up to three cards from it. You may then discard any number of cards from your hand.', image: M.necropolis.image },
};

export const COUNCILS = [
  { id: 'relics', name: 'Council of Relics', suit: 'Trade', text: 'When you resolve your Herald Reward, discard any of your cards here: gain 1 Influence per Vote discarded.', image: CARDS.councils.relics.image },
  { id: 'secrets', name: 'Council of Secrets', suit: 'Intrigue', text: 'Autumn: place Faction Markers on Locations, one per Vote. A Location with 4+ of your markers: remove them and claim its reward (ignoring its Influence).', image: CARDS.councils.secrets.image },
  { id: 'oaths', name: 'Council of Oaths', suit: 'Martial', text: 'Autumn: move one Supporter from the Map and/or Lost Pile to your board per Vote (+1 if you have the most Votes here).', image: CARDS.councils.oaths.image },
];

export const ARCH = { heir: 'Heir', captain: 'Captain', follower: 'Follower', cavalry: 'Cavalry', warmachine: 'War Machine', agent: 'Agent', trader: 'Trader', ruse: 'Ruse', champion: 'Champion' };

export const GAME = { rounds: 5, startHand: 6, supporters: 5, markers: 10 };
