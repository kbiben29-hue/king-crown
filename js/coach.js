// The coach: a short plain-language explanation the first time each step comes up.
// (Our own wording, written from the rulebook.)
export const COACH = {
  intro: {
    title: 'Welcome, heir',
    text: `The old king is gone and the crown is up for grabs. The heir with the most <b>Influence</b> at the end of the last Round wins.<br><br>
Every Round is one year with four seasons:<br>
<b>Spring</b> — bid for Kingdom Cards, place your Herald, put one face-down card next to each of the 3 Regions, add Supporters.<br>
<b>Summer</b> — the 3 Regions Clash one at a time. Highest Strength wins Influence.<br>
<b>Autumn</b> — Govern (cards into Councils) and Journey (cards away for Lore).<br>
<b>Winter</b> — clean up and get ready for next year.<br><br>
The big idea: your cards are everything. Every card you use for one thing can't be used for another — and you only draw back up at the start of each year.`,
  },
  year: {
    title: 'Start of the Year',
    text: `Everyone draws back up to their <b>Hand Size</b>. If your Deck runs out you suffer <b>Attrition</b>: your Discard Pile becomes your new Deck, but your Hand Size goes down by 1 (never below 3).<br><br>
Then turn order is reset: the player with the most Influence goes first. Going last isn't all bad — the last player picks the order of the Summer Clashes.`,
  },
  bid: {
    title: 'Spring 1: Bidding',
    text: `Everyone secretly picks one card from their hand as a <b>Bid</b>. Only its <b>Strength</b> (the big number) matters.<br><br>
Highest Bid chooses first: take a Kingdom Card from the <b>Great Road</b>, steal one from a rival by beating the card guarding it, or take nothing.<br><br>
The catch: the card you bid stays under the Kingdom Card to guard it. So a strong Bid gets first pick but costs you a strong card for the Clashes.`,
  },
  bidUse: {
    title: 'Using your Bid',
    text: `Kingdom Cards give you lasting bonuses while you hold them. You have room for two. If you take a third, one of your old ones is discarded and its guard card comes back to your hand.<br><br>
A rival can steal your Kingdom Card if their Bid is higher than your guard card's Strength — then your guard card returns to your hand.`,
  },
  herald: {
    title: 'Spring 3: Your Herald',
    text: `Put your Herald on any Location. If you win that Region's Clash <i>and</i> pick that Location, you get a <b>Herald Reward</b>: +1 Influence, and you steal 1 Influence from every rival Herald on the same Location.<br><br>
Your Herald also tells your rival where you plan to fight hard — or where you want them to <i>think</i> you'll fight.`,
  },
  place: {
    title: 'Spring 4: Cards by the Regions',
    text: `Now put one card face down next to <b>each</b> of the three Regions. Your rival does the same, at the same time.<br><br>
You can't win everywhere. A common plan: one strong card where you really want to win, and weak cards (or tricks like the Assassin) elsewhere.<br><br>
Tap a card to see what it does, then choose it.`,
  },
  supporters: {
    title: 'Spring 5: Spring Actions',
    text: `You can place <b>Supporters</b> on Regions. Each one is +1 Strength in that Region's Clash.<br><br>
But Supporters are spent: in Winter they go to the Lost Pile, and you only get them back with the Council of Oaths or the Shrine. You have 5 for the whole game, so pick your moments.`,
  },
  clashOrder: {
    title: 'Summer: Clash order',
    text: `The player last in turn order chooses which Region fights first, second and third. Order matters: a tie can pull extra cards from your hand, and some Commands move cards between Regions that haven't fought yet.`,
  },
  reveal: {
    title: 'Summer: a Clash begins',
    text: `All face-down cards in this Region flip face up. They are now <b>Active</b>.<br><br>
Next comes the <b>Day</b> (players use Commands like Ambush or Retreat in turn order), then the <b>Night</b> (automatic effects like Deadly), then everyone adds up their Strength.`,
  },
  day: {
    title: 'Day Actions',
    text: `If one of your revealed cards has a Command you can use it now:<br>
<b>Ambush</b> — add another card from your hand to this Clash.<br>
<b>Retreat</b> — pull your cards and Supporters out of this Region (to save them when you can't win).<br><br>
If you have nothing to do, the game skips you.`,
  },
  night: {
    title: 'Night Effects',
    text: `Night effects happen automatically. <b>Deadly</b> Eliminates every opposing Active card in this Clash. Eliminated cards go to the <b>Lost Pile</b> — gone for good — unless they are <b>Resilient</b> (back to the Discard Pile) or <b>Invulnerable</b> (not Eliminated at all).<br><br>
Two Assassins in the same Clash wipe each other out.`,
  },
  tally: {
    title: 'Adding up Strength',
    text: `Your Strength = your Active cards' Strength + 1 per Supporter here + bonuses (like Kingdom Cards). Highest total wins the Region.`,
  },
  tie: {
    title: 'A tie!',
    text: `Tied players may each add one more face-down card from hand, which starts a fresh Clash in this Region. Only the new cards count — the old cards and Supporters already fought.<br><br>
If everybody passes, nobody wins this Region this Round.`,
  },
  claim: {
    title: 'Claiming a Location',
    text: `The winner picks one of the Region's two Locations. You gain its Influence and its extra effect. If your Herald is on the Location you pick, you also get the Herald Reward.`,
  },
  autumn: {
    title: 'Autumn',
    text: `In turn order, each player may:<br>
<b>Govern</b> once — put a card with Votes from your hand into a Council. It stays there every Round, giving you that Council's power.<br>
<b>Journey</b> once — send a card with Lore away to gain Lore, then buy Advanced or HQ cards from your Site of Power.<br>
<b>Use Councils</b> — Secrets and Oaths are used now.<br><br>
Careful: every card you use here is out of your hand, and you only draw back up next year.`,
  },
  govern: {
    title: 'Councils',
    text: `<b>Relics</b> — when you claim a Herald Reward, cash in your cards here for Influence.<br>
<b>Secrets</b> — each Autumn, place Faction Markers on a Location. At 4, you get that Location's effect.<br>
<b>Oaths</b> — each Autumn, get spent Supporters back.<br><br>
More Votes = stronger power. Watch out: winning the Castle lets someone clear a whole Council!`,
  },
  journey: {
    title: 'Journeys and Lore',
    text: `The card you Journey with goes to the Lost Pile (a <b>Pathfinder</b> goes to your Discard Pile instead). Lore must be spent the moment you gain it — otherwise it waits in your Supply. At the end of the game, if you've bought everything at your Site of Power, every 2 Lore you have left is worth 1 Influence.`,
  },
  buy: {
    title: 'Site of Power',
    text: `Advanced cards go to your hand — they're stronger versions that join your deck. HQ cards stay in front of you and give a bonus for the rest of the game.`,
  },
  winter: {
    title: 'Winter',
    text: `Winter effects happen (like Tax Rolls). Then cleanup: Heralds go home, Supporters on the Map go to the Lost Pile, and Active cards go to their owners' Discard Piles. Cards guarding Kingdom Cards and cards in Councils stay where they are.`,
  },
};
