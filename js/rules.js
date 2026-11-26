// Rules overview, in our own words, written from the rulebook.
export const RULES_HTML = `
<h2>How to play — the short version</h2>
<p>You're an heir fighting for an empty throne. The player with the most <b>Influence</b> after the last Round wins (5 Rounds normally; 4 for a short game, 6 for a long one). Ties go to whoever holds the <b>Kingdom's Favour</b>, then to whoever is higher in turn order.</p>
<p>Everything runs on your hand of cards. Each card can be used one way each year — to Bid, to fight in a Region, to Govern or to Journey — and you only draw back up at the start of the next year. Choosing <i>what each card is for</i> is the whole game.</p>

<h3>Reading a card</h3>
<ul>
<li><b>Strength</b> (big number) — used in Bids and Clashes.</li>
<li><b>Votes</b> — lets the card Govern (sit in a Council).</li>
<li><b>Lore</b> — lets the card Journey (trade it away for Lore).</li>
<li><b>Commands</b> and <b>Traits</b> — special rules, see below.</li>
</ul>

<h3>A Round (one year)</h3>
<p><b>Start of the Year</b> (not in Round 1)</p>
<ol><li>Draw up to your Hand Size. Empty Deck → <b>Attrition</b>: shuffle your Discard Pile into a new Deck and lower your Hand Size by 1 (minimum 3).</li>
<li>Turn order: most Influence goes first.</li></ol>
<p><b>Spring</b></p>
<ol><li><b>Bid</b>: everyone secretly picks one card. Reveal.</li>
<li>Highest Bid first: take a Kingdom Card from the Great Road, steal one from a rival (your Bid must beat their guard card's Strength), or take nothing. The Bid card stays under the Kingdom Card as its guard. You have two Kingdom spaces.</li>
<li>The Great Road slides along and refills.</li>
<li><b>Heralds</b>: in turn order, put your Herald on any Location.</li>
<li><b>Cards by Regions</b>: everyone puts one face-down card next to each of the 3 Regions, at the same time.</li>
<li><b>Spring Actions</b>: in turn order, place Supporters on Regions (+1 Strength each) and use Spring Actions.</li></ol>
<p><b>Summer</b></p>
<ol><li>The last player in turn order sets the order of the 3 Clashes (markers I, II, III).</li>
<li>For each Region in order: <b>Reveal</b> → <b>Day</b> (Commands in turn order) → <b>Night</b> (automatic effects, like Deadly) → <b>Tally</b> Strength → winner <b>claims</b> one of the Region's two Locations.</li>
<li>Claiming gives that Location's Influence and effect. If your Herald is there: +1 Influence and steal 1 from each rival Herald there.</li>
<li><b>Ties</b>: tied players may add one more face-down card to start a new Clash (only new cards count) or pass. All pass → nobody wins that Region.</li></ol>
<p><b>Autumn</b> — in turn order, each player may:</p>
<ul><li><b>Govern</b> once: put a card with Votes from hand into a Council (it stays there).</li>
<li><b>Journey</b> once: send a card with Lore to the Lost Pile and gain its Lore. Spend Lore right away at your Site of Power on Advanced cards (to your hand) or HQ cards (lasting bonuses).</li>
<li>Use Actions and Councils.</li></ul>
<p><b>Winter</b></p>
<ol><li>Winter Effects.</li>
<li>Cleanup: Heralds go home, Supporters on the Map go to the Lost Pile, Active cards go to Discard Piles.</li>
<li>Next Round (or the game ends).</li></ol>

<h3>Councils</h3>
<ul><li><b>Relics</b> — when you claim a Herald Reward, cash in your cards here for Influence (1 per Vote).</li>
<li><b>Secrets</b> — place Faction Markers on Locations (1 per Vote). With 4+ on one Location you get its effect.</li>
<li><b>Oaths</b> — get Supporters back from the Lost Pile (1 per Vote, +1 if you have the most Votes).</li>
<li>The <b>Castle</b> lets its winner Govern too — and that clears out everyone else's cards from that Council.</li></ul>

<h3>Commands</h3>
<dl class="glos">
<dt>Ambush (Day)</dt><dd>Add a face-down card from your hand to the Clash.</dd>
<dt>Retreat (Day)</dt><dd>Return your Active cards in the Region to your hand and/or your Herald and Supporters there to your board.</dd>
<dt>Flank (Day)</dt><dd>Move the card to a Region that hasn't fought yet, where it's Active. <i>(Not used by the stand-in cards yet.)</i></dd>
<dt>Rally (Autumn)</dt><dd>Return Active cards to your hand. <i>(Not used yet.)</i></dd>
<dt>Deploy (X)</dt><dd>Place a card from hand face-up next to a Region with X Influence on it. <i>(Not used yet.)</i></dd>
<dt>Deadly (Night)</dt><dd>Eliminate all opposing Active cards in the Clash.</dd>
</dl>
<h3>Traits</h3>
<dl class="glos">
<dt>Resilient</dt><dd>When Eliminated, goes to your Discard Pile instead of the Lost Pile.</dd>
<dt>Invulnerable</dt><dd>Can't be Eliminated.</dd>
<dt>Pathfinder</dt><dd>After a Journey, goes to your Discard Pile instead of the Lost Pile.</dd>
</dl>
<h3>Words worth knowing</h3>
<dl class="glos">
<dt>Active</dt><dd>A face-up card next to a Region.</dd>
<dt>Lost Pile</dt><dd>Cards removed from play, shared and public. Cards here don't come back.</dd>
<dt>Discard Pile</dt><dd>Your used cards. They become your Deck again when it runs out.</dd>
<dt>Supply</dt><dd>Your Influence, Lore and HQ cards.</dd>
<dt>Kingdom's Favour</dt><dd>Won at the Harvest Field. Wins tied games (in the full game it also gives your faction a special Action).</dd>
<dt>Site of Power</dt><dd>Your five Advanced/HQ cards, bought with Lore. If it's empty at the end, every 2 leftover Lore is 1 Influence.</dd>
</dl>
<p style="color:#b5a68c;font-size:13px;margin-top:18px">Unofficial fan-made learning aid. The Old King's Crown is by Pablo Clark / Eerie Idol Games. Card values in this app are stand-ins.</p>
`;
