// Strategy guide: why you make each kind of move, written in our own words from the rules and the real cards.
// Chapters are functions of a few helpers from ui.js: ic(name) for official symbols, card(faction, num) and
// kcard(name) for card images.

export const CHAPTERS = [
  {
    id: 'idea', title: 'The big idea', icon: 'heir',
    body: (h) => `
      <p class="lead">The Old King's Crown isn't won by the biggest army. It's won by whoever turns <b>cards</b> into <b>Influence</b> most efficiently.</p>
      <p>Each card you hold can do one job per year: Bid, fight beside a Region, Govern in a Council, or Journey for Lore. You only refill your hand at the start of the next year, and every time your Deck runs out your Hand Size drops by one. So your hand is a budget, and every card you spend is gone until next year.</p>
      <div class="tipbox">${h.ic('influence')} <b>Rule of thumb:</b> before you place anything, ask "how much Influence does this card buy?" A 10-Strength Heir that wins a Region by 9 bought the same Influence as a 2-Strength Follower that won it by 1.</div>
      <h3>Where Influence comes from</h3>
      <ul>
        <li><b>Claiming Locations</b>: 1 each (Battlefield 2), plus the Location's effect.</li>
        <li><b>Herald Reward</b>: +1 if your Herald is on the Location you claim, <i>and</i> you steal 1 from every rival Herald there. That's a 2-point swing per rival.</li>
        <li><b>Kingdom Cards</b> and <b>HQ cards</b> that pay out every year.</li>
        <li><b>Councils</b>: Relics converts Votes to Influence; Secrets grabs Location rewards.</li>
        <li><b>Leftover Lore</b> at the end: 2 Lore = 1 Influence, but only if your Site of Power is empty.</li>
      </ul>
      <p>Notice that winning a Clash is only one of these. Strong players get a point or two from somewhere every single season.</p>`,
  },
  {
    id: 'plan', title: 'Plan your hand for the year', icon: 'follower',
    body: (h) => `
      <p class="lead">At the start of every year, give each card in your hand a job <i>before</i> you Bid.</p>
      <p>A typical 6-card hand might break down like this:</p>
      <ul>
        <li>1 card to <b>Bid</b> (often a low one; see Bidding).</li>
        <li>3 cards for the <b>Regions</b>, one each, and at least one of them should be cheap.</li>
        <li>1 card with Votes to <b>Govern</b> in Autumn.</li>
        <li>1 card with Lore to <b>Journey</b>, or to hold back for a tie or an Ambush.</li>
      </ul>
      <p>The hand you'll have in Autumn is whatever survives Summer. Cards that win stay Active and are discarded in Winter. Cards that lose may be Eliminated into the Lost Pile, and those never come back. Commands like <b>Retreat</b> and <b>Rally</b> exist to get cards back so you can use them twice.</p>
      <div class="tipbox">${h.ic('lore')} <b>Why it matters:</b> new players fling their best cards at Summer and arrive in Autumn with nothing to Govern or Journey. Autumn is where a lot of the long-term value lives.</div>
      <h3>Watch your Deck</h3>
      <p>When your Deck is empty at the start of a year you suffer <b>Attrition</b>: shuffle your Discard Pile back in, and your Hand Size drops by 1 (down to 3). Cards sent to the Lost Pile (Journeys, Eliminations) shrink your deck. That makes Attrition come sooner, but it also means you draw your good cards more often. A small, strong deck is fine; just don't fall to a 3-card hand by year 3.</p>`,
  },
  {
    id: 'bid', title: 'Bidding for Kingdom Cards', icon: 'champion',
    body: (h) => `
      <p class="lead">A Kingdom Card works for you every year until the end of the game, so <b>early Kingdom Cards are worth the most</b>.</p>
      <p>The highest Bid picks first: a card from the Great Road, a steal from a rival, or nothing. Your Bid card then sits under the Kingdom Card as its <b>guard</b>, and it stays there.</p>
      <h3>What to Bid with</h3>
      <ul>
        <li><b>High Bid (8–11):</b> when there's a Kingdom Card you really want, especially in year 1 or 2. It also makes a strong guard, because a rival needs a higher Bid to steal it.</li>
        <li><b>Low Bid (0–3):</b> when nothing on the Road fits your plan, or you're happy to pick last. Your <b>Ruse!</b> (Strength 0) is a free Bid: it costs you nothing you'd fight with.</li>
        <li><b>Champions (Strength 11)</b> treat the guard as Strength 0 when stealing. They're excellent at taking a rival's best Kingdom Card.</li>
      </ul>
      <div class="tipbox">${h.ic('captain')} <b>The hidden cost:</b> a Captain you Bid is a Captain you can't fight with this year, and it's locked under the Kingdom Card until it's replaced or stolen. Bid with cards whose <i>other</i> jobs you don't need.</div>
      <p>Late in the game a Kingdom Card has fewer years left to pay out. In the final year, only Bid high if the card scores immediately or wins a key Clash.</p>`,
  },
  {
    id: 'herald', title: 'Heralds: say where you\'ll win', icon: 'heir',
    body: (h) => `
      <p class="lead">Your Herald is worth +1 Influence plus 1 stolen from every rival Herald on the same Location. Put it where you <b>expect to win</b>.</p>
      <p>Heralds go down <i>before</i> cards are placed, in turn order, and everyone can see them. That makes them both a promise and a bluff:</p>
      <ul>
        <li><b>Honest Herald:</b> place it on the Region where your hand is strongest, then commit enough cards there to win.</li>
        <li><b>Contesting Herald:</b> put it on the <i>same</i> Location as a rival. If you win there you steal from them; if they win, they steal from you. It's a 2-point swing either way.</li>
        <li><b>Bluff Herald:</b> place it where you're weak to draw the opponent's big cards there, then win the other two Regions cheaply.</li>
      </ul>
      <div class="tipbox">${h.ic('influence')} <b>The Battlefield</b> is worth 2 Influence and the Herald makes it 3+. It's the obvious target, which is exactly why it's often heavily defended.</div>
      <p>Going later in turn order (because you have less Influence) means you see where rivals put their Heralds first. It's a real catch-up advantage.</p>`,
  },
  {
    id: 'place', title: 'Placing cards: win two, lose one cheaply', icon: 'cavalry',
    body: (h) => `
      <p class="lead">You must put one face-down card by each Region. You don't have to try to win all three.</p>
      <p>The classic plan is to <b>win two Regions and throw away the third</b> with your cheapest card (a Ruse!, a low Follower). Losing a Region with a 0 costs you nothing; losing it with a 9 costs you a lot.</p>
      <h3>Reading the matchups</h3>
      <ul>
        <li><b>Agents</b> (Strength 5, Night: Deadly) wipe out every opposing Active card, but they Eliminate <i>themselves</i> if an opponent has an Active <b>Follower</b> there. Followers are cheap insurance against Agents.</li>
        <li><b>Followers</b> are Invulnerable, so Deadly can't kill them. They're low Strength but never wasted.</li>
        <li><b>Heirs and Captains</b> are your big hitters, and they're Pathfinder, so a Journey with them sends them to your Discard Pile instead of the Lost Pile.</li>
        <li><b>Cavalry</b> can Flank (move to a Region that hasn't fought yet), so they cover two Regions with one card.</li>
        <li><b>War Machines</b> can Deploy: they stay on the Map with Influence and fight again next Summer.</li>
        <li>The <b>Ruse!</b> can Ambush (add a hidden card mid-Clash) or Retreat (pull your cards back to hand). Either way it makes your 0 look scary.</li>
      </ul>
      <div class="tipbox">${h.ic('supporter')} <b>Supporters</b> add +1 Strength each but go to the Lost Pile in Winter. Spend them where one point decides a Clash, not where you're already winning by five.</div>`,
  },
  {
    id: 'summer', title: 'Summer: order, Commands and ties', icon: 'day',
    body: (h) => `
      <p class="lead">The <b>last</b> player in turn order sets the Clash order. Use it.</p>
      <ul>
        <li>Fight your strongest Region <b>first</b> to lock in Influence before anything can change.</li>
        <li>Fight where you have a Cavalry <b>early</b> so it can Flank into a later Region.</li>
        <li>Put the Region where you're bluffing <b>last</b>: the opponent may spend Ambushes and Supporters before they know it doesn't matter.</li>
      </ul>
      <h3>Day Commands</h3>
      <p>Commands go in turn order. A Retreat after the reveal saves your cards when you're clearly losing, so you keep them for Autumn or next year. An Ambush adds a face-down card from your hand, which is strongest when the opponent has already shown their hand.</p>
      <h3>Ties</h3>
      <p>If you tie, each tied player may add one more face-down card, and only those new cards count. A Ruse! or low card can win a tie if the other player passes. Or pass yourself and save a card when the Region isn't worth it.</p>`,
  },
  {
    id: 'locations', title: 'Which Location to claim', icon: 'gate',
    body: (h) => `
      <p class="lead">When you win a Region you choose one of its two Locations. The Influence is the same (except the Battlefield), so the <b>effect</b> decides.</p>
      <ul>
        <li><b>Castle:</b> Govern with a card, and wipe every <i>other</i> card in that Council. It's the best way to break a rival's Council lead.</li>
        <li><b>Wilderness:</b> a free extra Journey (Lore now, which means Site of Power cards now).</li>
        <li><b>Harvest Field:</b> the Kingdom's Favour. It's your faction's special action three times, and it <b>wins tied games</b>.</li>
        <li><b>Battlefield:</b> 2 Influence. Simple and strong, especially late.</li>
        <li><b>Shrine:</b> put up to 3 cards on the bottom of your Deck. It delays Attrition and sets up next year's draw.</li>
        <li><b>Necropolis:</b> draw up to 3 from your Discard Pile. It refills your hand for Autumn.</li>
      </ul>
      <div class="tipbox">${h.ic('heir')} Always check where the Heralds are. Claiming a Location with a rival Herald on it steals from them only if <i>your</i> Herald is there too; otherwise it simply denies them their reward.</div>`,
  },
  {
    id: 'autumn', title: 'Autumn: Govern and Journey', icon: 'autumn',
    body: (h) => `
      <p class="lead">Autumn turns leftover cards into long-term power. Don't skip it.</p>
      <h3>Govern (once): put a card with Votes in a Council</h3>
      <p>The card stays there, and Councils pay off every year:</p>
      <ul>
        <li><b>Relics:</b> when you claim a Herald Reward, cash in cards here for 1 Influence per Vote. It pairs with an aggressive Herald plan.</li>
        <li><b>Secrets:</b> put Faction Markers on Locations; with 4+ on one, you take its reward. It lets you score a Location without winning the Clash.</li>
        <li><b>Oaths:</b> get Supporters back from the Lost Pile, plus one more if you have the most Votes. It keeps your Supporters flowing.</li>
      </ul>
      <p>Traders (Strength 0, 2 Votes, 2 Lore) are made for this: useless in a fight, great in a Council or on a Journey.</p>
      <h3>Journey (once): Lost Pile the card, gain its Lore</h3>
      <p>Spend the Lore <i>right away</i> at your Site of Power on Advanced cards (straight to your hand) or HQ cards (permanent bonuses). <b>Buy HQs early</b>: an HQ bought in year 1 works for four more years. Journey with Pathfinder cards when you can, because they come back to your Discard Pile.</p>`,
  },
  {
    id: 'tempo', title: 'Pacing the game', icon: 'winter',
    body: (h) => `
      <ul>
        <li><b>Year 1–2: build.</b> Kingdom Cards, HQs and Council seats pay out for the rest of the game, so invest even if it costs you a Region.</li>
        <li><b>Year 3: balance.</b> Your engine should be working by now. Start counting Influence and see who's ahead.</li>
        <li><b>Final year: cash out.</b> Nothing carries over. Bid only for instant gains, throw every card and Supporter into Clashes, Journey only if the Lore turns into Influence, and use any Tactics you haven't used.</li>
      </ul>
      <div class="tipbox">${h.ic('kingdoms-favour')} <b>Tactics</b> are mostly once per game. Holding one forever is the same as not having it, so plan which year each one is for.</div>
      <p>Being behind isn't all bad: you go later in turn order, see the other Heralds before placing yours, and the last player sets the Clash order.</p>`,
  },
  {
    id: 'nobility', title: 'Playing the Nobility', icon: 'nobility', faction: 'nobility',
    body: (h) => `
      <p class="lead">A steady, powerful faction: big Supporters, strong Councils, and a Tactic to win the one Bid that matters.</p>
      <ul>
        <li><b>School of the Stones:</b> each Supporter gives +1 extra Strength this Round, and they stay on the Map in Winter. Use it in a year you have lots of Supporters out; it's huge.</li>
        <li><b>Royal Seal:</b> sets every rival's Bid to 0. Save it for the year the Great Road shows a game-winning Kingdom Card.</li>
        <li><b>Witch Trial:</b> discards every rival card in a Council and returns yours to the top of your Deck for Lore. It breaks a rival's Council plan in one move.</li>
        <li><b>Martial Law:</b> with an Active War Machine, rivals can't add, swap or move cards into that Region. It locks down your Gilded Wall or Woe.</li>
      </ul>
      <p><b>Kingdom's Favour (Regal Guard):</b> 1 Influence, or make your Heir Invulnerable. Use it to send Titus into a Region where you fear an Agent.</p>
      <div class="tipbox">The Royal Bank HQ gives +1 Vote to cards with no printed Vote, so every Follower becomes a Councillor. With it, Govern every year.</div>`,
  },
  {
    id: 'clans', title: 'Playing the Clans', icon: 'clans', faction: 'clans',
    body: (h) => `
      <p class="lead">Mobility and momentum: cards that move between Regions, and a habit of taking rivals' Kingdom Cards.</p>
      <ul>
        <li><b>Sea Lanes:</b> give an Active Heir, Captain or War Machine Flank. Win a Region early, then Flank the winner into the next one.</li>
        <li><b>School of the Storms:</b> you set the Clash order, and you gain Influence or Lore for having the most Supporters or Active cards in each Region. It's a big year when you go wide.</li>
        <li><b>River Runners:</b> take an opponent's Occupied Kingdom Card in Autumn. Aim it at their best engine card.</li>
        <li><b>Salt Toughness:</b> pull Active and discarded cards back to hand. It's a whole second hand for the final year.</li>
      </ul>
      <p><b>Kingdom's Favour (Prophet of the Waves):</b> move your Herald into the current Region and pull two Supporters there. It turns a surprise win into a Herald Reward.</p>
      <div class="tipbox">Riders of the North Sky (Strength 11, Invulnerable, +1 Influence when it wins) and Raid & Raze (Flank with your Supporters) are worth buying early.</div>`,
  },
  {
    id: 'uprising', title: 'Playing the Uprising', icon: 'uprising', faction: 'uprising',
    body: (h) => `
      <p class="lead">Traps and dirty tricks: Deadly Heirs, swapped plans and hands shredded before the fight.</p>
      <ul>
        <li><b>School of the Streets:</b> your Heir gains Deadly, and every Elimination earns 1 Influence and 1 Lore. Plan a year around wiping a stacked Region.</li>
        <li><b>False Orders:</b> swap two of a rival's face-down cards. Their 10 ends up where they meant to throw away a 0.</li>
        <li><b>Safehouses:</b> give a card Retreat mid-Clash. It lets you risk an Agent and pull it back if the reveal goes badly.</li>
        <li><b>Night Raids:</b> each rival discards a card per Kingdom Card you Occupy. It's strongest once you have two (or three with Moonshine Cove).</li>
      </ul>
      <p><b>Kingdom's Favour (Spy Network):</b> look at all face-down cards in a Region, then swap one of yours. That's perfect information right before Summer.</p>
      <div class="tipbox">Black Powder Ploy kills Heirs and Captains, and Guerrilla Fighters blank rival abilities. Both punish the opponent's biggest cards.</div>`,
  },
  {
    id: 'gathering', title: 'Playing the Gathering', icon: 'gathering', faction: 'gathering',
    body: (h) => `
      <p class="lead">Strange rituals: the Lost Pile is your second deck, and you bend how Clashes are won.</p>
      <ul>
        <li><b>School of the Stars:</b> trade two Supporters in a Region for a card from the Lost Pile. Bring back an Eliminated Captain right where it's needed.</li>
        <li><b>Out Beyond the Lights:</b> swap two of your Active cards. Move your big card to whichever Region is still undecided.</li>
        <li><b>Moonlit Foragers:</b> pick a Kingdom Card from five in the discard. It's a second shot at Kingdom Cards without winning the Bid.</li>
        <li><b>Ritual Sacrifice:</b> Lost Pile up to three of your cards for Lore, then take one back from Discard. It feeds your Site of Power fast.</li>
      </ul>
      <p><b>Kingdom's Favour (Herald of the Moon):</b> return an Active card in your Herald's Region to your hand. You fight, win, and keep the card.</p>
      <div class="tipbox">Ritual of the Eye makes the <i>lowest</i> Strength above 0 win the Clash. Pair it with a Follower and watch the opponent's Heir lose.</div>`,
  },
  {
    id: 'mistakes', title: 'Common mistakes', icon: 'ruse',
    body: (h) => `
      <ul>
        <li><b>Winning by a mile.</b> Every extra point of Strength in a Region you'd win anyway is wasted. Put the surplus card somewhere else.</li>
        <li><b>Fighting all three Regions.</b> Lose one on purpose with a 0 and win the other two.</li>
        <li><b>Forgetting Autumn.</b> Keep a Voter and a Lore card back; Councils and HQs win long games.</li>
        <li><b>Agents into Followers.</b> An Agent Eliminates itself if a rival has an Active Follower there. Check what they usually place.</li>
        <li><b>Spending Supporters early.</b> They go to the Lost Pile each Winter. Use them to swing close Clashes.</li>
        <li><b>Hoarding Tactics.</b> An unused Tactic scores nothing.</li>
        <li><b>Ignoring the Harvest Field.</b> The Kingdom's Favour breaks ties, and close games are common.</li>
      </ul>`,
  },
];

// A short, situation-aware tip for whatever the game is asking right now.
export function strategyTip(prompt, s, me, g) {
  const key = prompt && prompt.key;
  const last = s.round >= s.rounds;
  const lastLine = last ? ' <b>This is the final year</b>, so nothing carries over: spend everything.' : '';
  const hand = me.hand.length;
  switch (key) {
    case 'bid': case 'bidAlly':
      return `<b>Bidding.</b> ${s.road.filter(Boolean).length} Kingdom Cards are on the Road. If one fits your plan, Bid high, because your Bid card becomes its guard against thieves. If not, Bid your Ruse! or a low Follower so you keep your fighters.${last ? ' In the final year, a Kingdom Card only helps if it scores right away.' : s.round <= 2 ? ' Early Kingdom Cards pay out every year, so they are worth a strong Bid.' : ''}`;
    case 'bidUse': return `<b>Taking a Kingdom Card.</b> Pick the one that pays most over the years left (${s.rounds - s.round + 1}). Stealing is only possible if your Bid beats the guard's Strength, and Champions treat the guard as 0.`;
    case 'herald': case 'legend':
      return `<b>Herald.</b> Put it on the Location you <i>expect to win</i>: +1 Influence there, and you steal 1 from each rival Herald on the same spot. Look at your hand: where would your strongest card go? Stacking on a rival's Herald makes it a 2-point swing either way.`;
    case 'place': case 'placeRegion': case 'placeAlly':
      return `<b>Placing cards.</b> Plan to win two Regions and lose one cheaply with your lowest card. Put strength where your Herald is. Hold back a Follower against Agents (they Eliminate themselves if you have an Active Follower). You have ${hand} cards; keep one with Votes or Lore for Autumn if you can.${lastLine}`;
    case 'clashOrder': return `<b>Clash order.</b> Fight your surest win first to lock it in, a Region with your Cavalry early so it can Flank onward, and your bluff Region last.`;
    case 'tie': case 'tieCard': return `<b>Tie.</b> Only the new face-down cards count. A small card wins if they pass; pass yourself if this Region isn't worth another card.`;
    case 'ambushCard': return `<b>Ambush.</b> You've seen their cards, so add just enough to win. Don't overspend.`;
    case 'loc': return `<b>Claim a Location.</b> Same Influence (Battlefield is 2), so pick the effect you need: the Harvest Field's Favour breaks ties, the Castle wipes a Council, the Necropolis refills your hand. Your Herald there adds +1 and steals.`;
    case 'council': case 'governCard': case 'castleGovern':
      return `<b>Governing.</b> Relics pays when you take Herald Rewards, Secrets scores Locations without winning Clashes, and Oaths brings Supporters back. A card in a Council keeps working every year, so Traders and spare Voters belong here.`;
    case 'journeyCard': return `<b>Journey.</b> Send a card with Lore (Pathfinder cards come back to your Discard Pile) and spend the Lore now at your Site of Power. HQs bought early keep paying.${lastLine}`;
    case 'buy': return `<b>Site of Power.</b> HQ cards are permanent bonuses, so they're best early. Advanced cards go straight to your hand for this year.${last ? ' In the final year, 2 leftover Lore = 1 Influence only if your Site is empty.' : ''}`;
    case 'action':
      if (s.season === 'spring') return `<b>Spring Actions.</b> Supporters add +1 each but are lost in Winter, so put them where a point or two decides the Clash. Use a Tactic if this is its year.${lastLine}`;
      if (s.season === 'autumn') return `<b>Autumn.</b> You can Govern once and Journey once. Turn spare cards into Council seats and Lore; anything left in hand is discarded in Winter anyway.${lastLine}`;
      return `<b>Day Commands.</b> Retreat if you're clearly losing (keep the cards for later), Ambush if you can win with one more card, and Flank a Cavalry to a Region that hasn't fought yet.`;
    default:
      return `<b>Think in Influence.</b> Every card has one job a year. Win two Regions, lose one cheaply, put your Herald where you'll win, and keep something for Autumn.${lastLine}`;
  }
}
