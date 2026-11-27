// Board view: the Map window built from the real Location tiles, card spaces beside each
// Region, the Great Road and Councils above, your Kingdom spaces below, and a fanned hand
// you drag cards from.
import { Game, regionName, councilName, kText } from './engine.js?v=17';
import { aiAnswer } from './ai.js?v=17';
import { COACH } from './coach.js?v=17';
import { CARDS, FACTIONS, REGIONS, LOCATIONS, COUNCILS, ARCH } from './data.js?v=17';
import { RULES_HTML } from './rules.js?v=17';
import { morph } from './morph.js?v=17';
import { CHAPTERS, strategyTip } from './strategy.js?v=17';

const $app = document.getElementById('app');
const $sheet = document.getElementById('sheet');
const store = {
  get(k, d) { try { const v = localStorage.getItem('kc:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('kc:' + k, JSON.stringify(v)); } catch {} },
};
const BACK = (f) => `https://cards.eerieidolgames.com/cards/tokc/en-US/${f[0].toUpperCase() + f.slice(1)}_Reverse.webp`;
const RIDS = REGIONS.map((r) => r.id);

let cfg = { wk: store.get('wk', { cards: 0, night: false, aeronauts: false, legendary: false, tower: false }), you: store.get('you', 'nobility'), them: store.get('them', 'clans'), rounds: store.get('rounds', 5), coach: store.get('coach', true) };
let game = null, S = null, ME = 0;
let pending = null, coachP = null, beatP = null, showOpts = false, autoNext = null, toast = '';
let seen = new Set();

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : '');
const who = (pi) => (pi === ME ? 'You' : 'Computer');
// Official Old King's Crown symbols, taken from the Eerie Card Library's icon font (img/icons).
const COLOUR_IC = new Set(['spring', 'day', 'night', 'autumn', 'winter']);
const ic = (n, cls = '') => (COLOUR_IC.has(n) ? `<img class="ic ${cls}" src="img/icons/${n}.svg" alt="">` : `<i class="ic ${cls}" style="-webkit-mask-image:url(img/icons/${n}.svg);mask-image:url(img/icons/${n}.svg)"></i>`);
const ARCH_IC = { heir: 'heir', captain: 'captain', follower: 'follower', cavalry: 'cavalry', warmachine: 'war-machine', agent: 'agent', trader: 'trader', ruse: 'ruse', champion: 'champion' };
const NIGHT_KEY = { castle: 'castle', wilderness: 'wilderness', harvest: 'harvest-field', battlefield: 'battlefield', shrine: 'shrine', necropolis: 'necropolis' };
const locImg = (l) => (S && S.night ? CARDS.wk.night[NIGHT_KEY[l]].image : LOCATIONS[l].image);
const boonText = (b) => b.text || (b.rules || []).map((r) => `${cap(r.season)}: ${r.text}`).join(' ');
const SEASON = { year: 'Start of the Year', spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter', end: 'Game over', setup: '' };

// ---------------- title & new game screens ----------------
const FDESC = {
  nobility: 'Choose the Nobility if you like a steady, powerful game: strong Councils, Supporters that hit harder, and a Royal Seal to win the Bid that matters.',
  clans: 'Choose the Clans if you enjoy mobility and momentum: Flanking across the Map, Sea Lanes, and snatching rivals’ Kingdom Cards with River Runners.',
  uprising: 'Choose the Uprising if you like ambushes and dirty tricks: Deadly Heirs, False Orders that shuffle your rivals’ plans, and Night Raids on their hands.',
  gathering: 'Choose the Gathering if you like strange rituals: pulling cards back from the Lost Pile, swapping cards across the Map and bending the rules of a Clash.',
};
const heirArt = (f) => CARDS.factions[f].find((c) => c.num === 14).image;

function clearGame() {
  game = null;
  document.querySelector('.dock')?.remove();
  document.querySelector('.cmodal')?.remove();
  document.body.classList.remove('ingame');
}

function title() {
  clearGame();
  const saved = store.get('save', null);
  $app.innerHTML = `<div class="title" style="background-image:url('${LOCATIONS.castle.image}')">
    <div class="tbanner"><div class="tsmall">The</div><div class="tbig">Old King's<br>Crown</div><div class="trule"></div><div class="ttag">A tale of royalty, rebels and ruses.</div><div class="tsub">A learn-to-play companion</div></div>
    <div class="tbtns">
      <button class="tbtn gold" data-act="newgame">Play vs computer</button>
      ${saved ? '<button class="tbtn" data-act="resume">Resume game</button>' : ''}
      <button class="tbtn" data-act="rules">How to play</button>
      <button class="tbtn" data-act="guide">Strategy guide</button>
      <button class="tbtn" data-act="browse">Card library</button>
    </div>
    <div class="tfoot">The Old King's Crown was designed by Pablo Clark and published by <a href="https://www.eerieidolgames.com" target="_blank" rel="noopener">Eerie Idol Games</a>. This is an unofficial, fan-made learning tool. Card text and art are © Eerie Idol Games, loaded from the <a href="https://library.eerieidolgames.com/" target="_blank" rel="noopener">Eerie Card Library</a>.</div>
  </div>`;
}

function setup() {
  clearGame();
  if (cfg.you === cfg.them) cfg.them = FACTIONS.find((f) => f.id !== cfg.you).id;
  const wkOn = cfg.wk.cards || cfg.wk.night || cfg.wk.aeronauts || cfg.wk.legendary || cfg.wk.tower;
  const F = (id) => FACTIONS.find((f) => f.id === id);
  $app.innerHTML = `<div class="ng">
    <button class="back" data-act="title">‹ Main menu</button>
    <h1>New Game</h1>
    <button class="cfgrow" data-act="configure"><span>2 players, ${cfg.rounds} year${cfg.rounds > 1 ? 's' : ''}, ${wkOn ? 'Wild Kingdom' : 'Base'}${cfg.coach ? ', coach on' : ''}</span><b>Configure</b></button>
    <h2>Choose your faction</h2>
    <div class="fgrid">${FACTIONS.map((f) => `<button class="ftile ${cfg.you === f.id ? 'you' : cfg.them === f.id ? 'them' : ''}" data-act="fac" data-id="${f.id}" style="--fc:${f.color}">
      <img src="${heirArt(f.id)}" alt=""><span class="fname"><span class="fcrown" style="color:${f.color}">${ic(f.id)}</span><span>${f.name.replace('The ', '')}<small>${cfg.you === f.id ? 'You' : cfg.them === f.id ? 'Computer' : 'Open'}</small></span></span></button>`).join('')}</div>
    <h2 class="fh">${F(cfg.you).name}</h2>
    <p class="fdesc"><span class="fcrown" style="color:${F(cfg.you).color}">${ic(cfg.you)}</span>${FDESC[cfg.you]} <button class="inl" data-act="guide" data-c="${cfg.you}">How to play them well ›</button></p>
    <div class="seats"><button class="seat" data-act="noop"><span class="sn" style="background:${F(cfg.you).color}">1</span><span style="color:${F(cfg.you).color}">${ic(cfg.you)}</span>${F(cfg.you).name.replace('The ', '')}<small>You</small></button>
      <button class="seat" data-act="cycleopp"><span class="sn" style="background:${F(cfg.them).color}">2</span><span style="color:${F(cfg.them).color}">${ic(cfg.them)}</span>${F(cfg.them).name.replace('The ', '')}<small>Computer ↻</small></button></div>
    <button class="tbtn gold wide" data-act="start">Start game</button>
  </div>`;
}

function configure() {
  sheet(`<h2>Configure</h2>
    <h3>Game length</h3><div class="pick">${[[1, 'Practice year', '1 Round — just the basics'], [3, 'Quick', '3 years'], [4, 'Short', '4 years'], [5, 'Standard', '5 years (rulebook default)']].map(([n, a, b]) => `<button data-act="rounds" data-n="${n}" class="${cfg.rounds === n ? 'on' : ''}">${a}<small>${b}</small></button>`).join('')}</div>
    <h3>Coach</h3><div class="pick"><button data-act="coach" data-on="1" class="${cfg.coach ? 'on' : ''}">Coach on<small>Explains each step the first time</small></button><button data-act="coach" data-on="0" class="${!cfg.coach ? 'on' : ''}">Coach off<small>Just the prompts</small></button></div>
    <h3>Wild Kingdom expansion</h3><div class="pick">
      ${[['night', 'Night Map', 'Night art in a random layout'], ['aeronauts', 'Aeronauts', 'Recruit Aeronaut Allies at the Near & Far'], ['legendary', 'Legendary Creatures', 'A second Herald and a Strength 13 card'], ['tower', 'Whispering Tower', 'Visit the Tower for Boons']].map(([k, n, d]) => `<button data-act="wk" data-k="${k}" class="${cfg.wk[k] ? 'on' : ''}">${n}<small>${d}</small></button>`).join('')}</div>
    <div class="pick" style="grid-template-columns:repeat(4,1fr);margin-top:8px">${[0, 5, 10, 15].map((n) => `<button data-act="wkcards" data-n="${n}" class="${cfg.wk.cards === n ? 'on' : ''}" style="text-align:center">${n}<small>WK cards</small></button>`).join('')}</div>
    <p class="dim">Wild Kingdom Cards are mixed into a 30-card Kingdom deck (0 = base game only).</p>
    <button class="big" data-act="close">Done</button>`);
}

// ---------------- starting, saving and resuming ----------------
// Every answer (yours and the computer's) is recorded, so a game can be rebuilt exactly by replaying them.
let record = [], replay = [];
function start(resume = false) {
  const saved = resume ? store.get('save', null) : null;
  const opts = saved ? saved.opts : { seed: (Math.random() * 2 ** 31) | 0, factions: [cfg.you, cfg.them], humans: [true, false], rounds: cfg.rounds, wk: cfg.wk, coach: cfg.coach };
  if (saved) cfg.coach = saved.opts.coach;
  seen = new Set(saved ? saved.seen || [] : []); pending = coachP = beatP = autoNext = null; showOpts = false;
  record = []; replay = saved ? saved.answers.slice() : [];
  game = new Game(opts, io);
  game.opts = opts;
  ME = 0; S = game.s;
  document.body.classList.add('ingame');
  $app.innerHTML = '';
  view = { s: 0, x: 0, y: 200, fit: true };
  render();
  game.run().then(() => { store.set('save', null); render(); }).catch((e) => { console.error(e); alert('Something went wrong: ' + e.message); });
}
function save() { if (game && !S.over) store.set('save', { opts: game.opts, answers: record, seen: [...seen] }); }

const io = {
  update(s) { S = s; scheduleRender(); },
  ask(pi, prompt, s, g) {
    if (replay.length) { const a = replay.shift(); record.push(a); return a; }
    if (!s.players[pi].human) { const a = aiAnswer(pi, prompt, s, g); record.push(a); return a; }
    if (autoNext && autoNext.key === prompt.key && prompt.options?.some((o) => o.id === autoNext.id)) { const id = autoNext.id; autoNext = null; record.push(id); save(); return id; }
    autoNext = null;
    save();
    return new Promise((res) => { pending = { prompt, res: (v) => { record.push(v); res(v); } }; showOpts = false; render(); });
  },
  coach(key) {
    if (replay.length) { seen.add(key); return; }
    if (seen.has(key)) return;
    seen.add(key);
    if (!cfg.coach || !COACH[key]) return;
    return new Promise((res) => { coachP = { key, res }; render(); });
  },
  beat(text) { if (replay.length) return; return new Promise((res) => { beatP = { text, res }; render(); }); },
};
let raf = 0;
function scheduleRender() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }

// ---------------- what the current prompt lets you tap or drop on ----------------
function targets() {
  const t = { tiles: {}, rows: {}, nf: {}, road: {}, oppSlots: {}, councils: {}, rest: [], drop: null };
  const p = pending && !coachP && !beatP ? pending.prompt : null;
  if (!p) return t;
  if (p.options) for (const o of p.options) {
    let m;
    if (LOCATIONS[o.id]) t.tiles[o.id] = o.id;
    else if (RIDS.includes(o.id)) t.rows[o.id] = o.id;
    else if ((m = /^sup:(\w+)$/.exec(o.id))) t.rows[m[1]] = o.id;
    else if ((m = /^nf:(\w+)$/.exec(o.id))) t.nf[m[1]] = o.id;
    else if ((m = /^take:road:(\d)$/.exec(o.id))) t.road[m[1]] = o.id;
    else if ((m = /^steal:(\d+):(\d+)$/.exec(o.id))) t.oppSlots[`${m[1]}:${m[2]}`] = o.id;
    else if (p.key === 'council' && COUNCILS.some((c) => c.id === o.id)) { t.councils[o.id] = o.id; t.rest.push(o); }
    else t.rest.push(o);
  }
  if (p.cards) {
    if (p.key === 'place') t.drop = { rows: p.regions || RIDS };
    else if ((p.key === 'ambushCard' || p.key === 'tieCard') && p.region) t.drop = { rows: [p.region] };
    else if (p.key === 'governCard' || p.key === 'castleGovern') t.drop = { councils: true };
    else if (p.key === 'bid') t.drop = { bid: true };
    else t.drop = { any: true };
  }
  return t;
}

// ---------------- rendering ----------------
function cardHTML(c, { cls = '', mini = false, style = '' } = {}) {
  const inf = (c.inf ? `<span class="cinf">${c.inf}${ic('influence')}</span>` : '') + (c.boons && c.boons.length ? `<span class="boonb">${c.boons.length}</span>` : '');
  return `<button class="card ${mini ? 'mini' : ''} ${cls}" data-act="card" data-uid="${c.uid}" style="${style}"><img src="${c.image}" alt="${esc(c.name)}" draggable="false">${inf}<span class="cnm">${esc(c.name)}</span></button>`;
}
const backHTML = (f, mini = true, url = null, boons = 0) => `<div class="card back ${mini ? 'mini' : ''}"><img src="${url || BACK(f)}" alt="" draggable="false">${boons ? `<span class="boonb">${boons}</span>` : ''}</div>`;
const kcHTML = (k, cls = '', extra = '') => `<button class="kc ${cls}" data-act="kinfo" data-uid="${k.uid}" ${extra}><img src="${k.image}" alt="${esc(k.name)}"><span class="kn">${esc(k.name)}</span></button>`;

// Wooden-style pieces: Heralds are pawns, Legendary Creatures diamonds, Supporters small blocks.
const tok = (p, kind, extra = '', cls = '') => `<span class="tok ${kind} ${cls}" style="--fc:${p.color}" ${extra}>${kind === 'sup' ? ic('supporter') : kind === 'nf' ? ic('wind') : ic(p.faction)}</span>`;

function render() {
  if (!game) return;
  const s = S, me = s.players[ME], opp = s.players.find((p) => p.i !== ME);
  const T = targets();
  const prompt = pending && pending.prompt;
  const choosable = new Set(prompt && prompt.cards && !coachP && !beatP ? prompt.cards : []);

  // banner
  let msg = '';
  if (s.over) msg = s.players[s.result.winner].i === ME ? 'You claim the Old King\'s Crown!' : 'The computer claims the crown';
  else if (coachP) msg = COACH[coachP.key].title;
  else if (beatP) msg = beatP.text;
  else if (prompt) msg = prompt.text;
  else msg = 'The computer is thinking…';
  const chips = [];
  if (prompt && !coachP && !beatP) {
    const mapped = Object.keys(T.tiles).length + Object.keys(T.rows).length + Object.keys(T.road).length + Object.keys(T.oppSlots).length + Object.keys(T.councils).length;
    if (mapped && T.rest.length <= 3) for (const o of T.rest) chips.push(`<button class="chip ${o.id === 'done' || o.id === 'return' ? '' : 'go'}" data-act="opt" data-id="${esc(o.id)}">${esc(o.label.length > 46 ? o.label.slice(0, 44) + '…' : o.label)}</button>`);
    else if (mapped && T.rest.length) chips.push(`<button class="chip go" data-act="toggleopts">${showOpts ? 'Hide' : 'Show'} other options (${T.rest.length})</button>`);
    if (prompt.cards && prompt.optional) chips.push(`<button class="chip" data-act="skip">Skip</button>`);
  }
  const banner = `<div class="banner"><div class="row"><div class="grow">
      <div class="step">${esc(SEASON[s.season] || '')}${s.step ? ' · ' + esc(s.step.replace(/^.*?: /, '')) : ''} · Round ${Math.min(s.round, s.rounds)}/${s.rounds}</div>
      <div class="msg ${msg.length > 70 ? 'long' : ''}">${esc(msg)}</div></div>
      <button class="ibtn tipb" data-act="tip" aria-label="Strategy tip">${ic('eye')}</button><button class="ibtn" data-act="rules" aria-label="Rules">?</button><button class="ibtn" data-act="log" aria-label="Log">☰</button><button class="ibtn" data-act="menu" aria-label="Menu">⚙</button></div>
      ${chips.length ? `<div class="more">${chips.join('')}</div>` : ''}
      ${toast ? `<div class="more"><span class="chip">${esc(toast)}</span></div>` : ''}</div>`;

  // season track (left) and the opponent's box (right), like the real table
  const SEAS = [['year', ic('heir'), 'Start of the Year'], ['spring', ic('spring'), 'Spring'], ['summer', ic('day') , 'Summer'], ['autumn', ic('autumn'), 'Autumn'], ['winter', ic('winter'), 'Winter']];
  const track = `<div class="track"><div class="seas">${SEAS.map(([id, ic, n]) => `<span class="sea ${s.season === id ? 'on' : ''}" title="${n}">${ic}</span>`).join('')}</div>
    <div class="rounds">${Array.from({ length: s.rounds }, (_, i) => `<span class="rd ${i + 1 === s.round ? 'on' : i + 1 < s.round ? 'past' : ''}">${['I', 'II', 'III', 'IV', 'V', 'VI'][i]}</span>`).join('')}</div>
    <div class="order">Turn order: ${s.order.map((i) => `<b style="color:${s.players[i].color}">${i === ME ? 'You' : 'CPU'}</b>`).join(' → ')}</div></div>`;
  const oppHTML = opp ? `<div class="obox" style="--fc:${opp.color}">
      <button class="otop" data-act="player" data-pi="${opp.i}"><span class="emb" style="background-image:url('${BACK(opp.faction)}')"></span>
        <span class="onum">${opp.inf}</span>
        <span class="ores"><span>${ic('influence')} ${opp.inf}</span><span>${ic('lore')} ${opp.lore}</span><span>${ic('supporter')} ${opp.supporters}</span></span>
        <span class="backs">${opp.hand.map(() => `<img src="${BACK(opp.faction)}" alt="">`).join('')}</span></button>
      ${[...opp.slots.map((sl, si) => sl && { k: sl.card, g: sl.occ, opt: T.oppSlots[`${opp.i}:${si}`] }).filter(Boolean), ...opp.ksupply.map((k) => ({ k }))].map((x) => `<button class="okc ${x.opt ? 'pickable' : ''}" data-act="kinfo" data-uid="${x.k.uid}" ${x.opt ? `data-opt="${x.opt}"` : ''}>${ic(x.k.suit, 'suit ' + x.k.suit)}<span class="nm">${esc(x.k.name)}</span>${x.g ? `<span class="g">${x.g.str}</span>` : ''}</button>`).join('') || '<div class="okc none">No Kingdom Cards</div>'}
      <div class="ofoot">${esc(opp.short)}${s.favour && s.favour.pi === opp.i ? ` · ${ic('kingdoms-favour')}${'I'.repeat(s.favour.val)}` : ''} · Deck ${opp.deck.length}</div></div>` : '';
  const top = `<div class="toprow">${track}${oppHTML}</div>`;

  // Councils as text panels along the top of the window
  // Councils: the real Council cards, with everyone's Votes and how many cards sit in each
  const councils = `<div class="cpanels">${COUNCILS.map((c) => `<button class="ccard ${T.councils[c.id] || (T.drop && T.drop.councils) ? 'pickable' : ''}" data-act="council" data-c="${c.id}" data-k="council-${c.id}" ${T.drop && T.drop.councils ? `data-drop="council:${c.id}"` : ''}>
      <img src="${c.image}" alt="${c.name}">${s.councils[c.id].length ? `<span class="ccount">${s.councils[c.id].length} card${s.councils[c.id].length > 1 ? 's' : ''}</span>` : ''}
      <span class="votes">${s.players.map((p) => `<span style="color:${p.color}">${ic('votes')} ${p.i === ME ? 'You' : 'CPU'} ${game.votes(p.i, c.id)}</span>`).join('')}</span></button>`).join('')}</div>`;

  // the Great Road (under the window) and bids
  const bids = s.bids ? `<div class="bidrow">Bids: ${Object.entries(s.bids).map(([pi, c]) => `${who(+pi)} <b>${esc(c.name)} (${s.bstr ? s.bstr[pi] : c.str})</b>`).join(' · ')}</div>` : '';
  const lastLost = s.lost[s.lost.length - 1];
  const road = `<div class="road"><span class="lbl">Great Road</span>${s.road.map((k, i) => (k ? kcHTML(k, T.road[i] ? 'pickable' : '', T.road[i] ? `data-opt="${T.road[i]}"` : '') : '<div class="kc deck"></div>')).join('')}
      <div class="kc deck">${s.kdeck.length}</div><button class="lostpile" data-act="lost">${lastLost ? `<img src="${lastLost.image}" alt="">` : ''}<span>Lost ${s.lost.length}</span></button></div>${bids}
    ${T.drop && T.drop.bid ? '<div class="bidzone" data-drop="bid">Drag a card here to Bid with it</div>' : ''}
    ${T.drop && T.drop.any ? '<div class="bidzone" data-drop="any">Drag a highlighted card here (or tap it)</div>' : ''}`;

  // the Map
  const map = `<div class="map">${REGIONS.map((r) => {
    const R = s.regions[r.id];
    const mk = s.clashOrder.indexOf(r.id);
    const dropOK = T.drop && T.drop.rows && T.drop.rows.includes(r.id);
    const pick = T.rows[r.id] || T.nf[r.id] || dropOK;
    const rowDrop = dropOK || T.rows[r.id] || T.nf[r.id];
    const cur = s.current === r.id;
    const res = R.winner != null ? `<span class="res">${R.winner === ME ? '✓ yours' : '✗ theirs'}</span>` : R.tie ? '<span class="res">tie</span>' : '';
    const col = (p) => {
      const cs = R.cards.filter((c) => c.card.owner === p.i).map((c) => {
        if (!c.up && p.i !== ME) return backHTML(p.faction, true, c.card.back || (c.card.faction !== p.faction ? BACK(c.card.faction) : null), c.card.boons.length);
        return cardHTML(c.card, { mini: true, cls: `${!c.up ? 'down' : ''} ${c.used && !cur ? 'used' : ''} ${choosable.has(c.card.uid) ? 'ok' : ''}` });
      }).join('');
      const sup = (R.sup[p.i] || R.nf === p.i) ? `<span class="toks">${Array.from({ length: R.sup[p.i] || 0 }, () => tok(p, 'sup')).join('')}${R.nf === p.i ? tok(p, 'nf') : ''}</span>` : '';
      return `<div class="sidecol" style="background:linear-gradient(${p.color}22, transparent)">${sup}<div class="stack">${cs}</div></div>`;
    };
    const tiles = s.map[r.id].map((l) => {
      const hs = s.players.filter((p) => p.herald === l).map((p) => tok(p, 'herald')).join('')
        + s.players.filter((p) => p.legend === l).map((p) => tok(p, 'legend')).join('')
        + (s.pieces.tower === l ? `<span class="piece" title="Whispering Tower">${ic('tower')}</span>` : '')
        + (s.pieces.nearfar === l ? `<span class="piece" title="Near & Far">${ic('wind')}</span>` : '');
      const mks = s.marks[l] ? s.players.filter((p) => s.marks[l][p.i]).map((p) => `<span class="mk" style="background:${p.color}">${s.marks[l][p.i]}</span>`).join('') : '';
      const lk = (s.locKs[l] || []).map((k) => `<span class="ktile">${esc(k.card.name)}</span>`).join('');
      return `<button class="tile ${T.tiles[l] ? 'pickable' : ''} ${R.claimed === l ? 'claimed' : ''}" data-act="tile" data-l="${l}" data-rid="${r.id}" ${T.tiles[l] ? `data-drop="tile:${l}"` : ''}><img src="${locImg(l)}" alt="${LOCATIONS[l].name}"><span class="tokens">${hs}${mks}</span>${lk}</button>`;
    }).join('');
    const kOn = R.ks.map((k) => `<button data-act="kinfo" data-uid="${k.card.uid}" style="border-color:${s.players[k.owner].color}">${esc(k.card.name)}</button>`).join('') + (R.martial != null ? '<button>Martial Law</button>' : '');
    return `<div class="mrow ${pick ? 'pickable' : ''} ${cur ? 'cur' : ''}" data-act="row" data-rid="${r.id}" data-row="${r.id}" ${rowDrop ? `data-drop="row:${r.id}"` : ''}>
      ${col(me)}<div class="tiles"><span class="rname">${mk >= 0 ? `<span class="cm">${['I', 'II', 'III'][mk]}</span>` : ''}${r.name}${res}</span>${tiles}${kOn ? `<div class="rks">${kOn}</div>` : ''}</div>${opp ? col(opp) : ''}</div>`;
  }).join('')}</div>`;

  // your board
  const mine = `<div class="mine" style="border-color:${me.color}"><div class="hdr"><span>Your Tactics</span><button class="chip" data-act="discard">Discard · Site of Power</button></div>
    <div class="chips">${me.ksupply.map((k) => `<button class="chip" data-act="kinfo" data-uid="${k.uid}">${esc(k.name)}</button>`).join('')}${me.hq.map((c) => `<button class="chip" data-act="card" data-uid="${c.uid}">HQ: ${esc(c.name)}</button>`).join('')}
      ${me.tactics.map((t) => `<button class="chip ${t.exhausted ? 'ex' : ''}" data-act="tactic" data-pi="${me.i}" data-k="${t.k}">${ic('lore-cost')} ${esc(t.name)}${t.markers ? ` (${t.markers})` : ''}</button>`).join('')}
      <button class="chip fav" data-act="favour" data-f="${me.faction}">${ic('kingdoms-favour')} ${esc(CARDS.favour[me.faction].name)}${s.favour && s.favour.pi === ME ? ' ' + 'I'.repeat(s.favour.val) : ''}</button></div></div>`;

  // Wild Kingdom modules: the Whispering Tower, the Aeronauts and your Boons
  let wkHTML = '';
  if (s.tower || s.pieces.nearfar || s.aeroDeck.length || me.boons.length || me.lsupply.length || me.nf !== 'none') {
    const T2 = s.tower;
    wkHTML = `<div class="wkrow">
      ${T2 ? `<button class="wkbox" data-act="tower"><img src="${CARDS.wk.tower.image}" alt=""><span>${ic('tower')} Whispering Tower${s.pieces.tower ? ` · ${LOCATIONS[s.pieces.tower].name}` : ''}<br><small>Entrance ${T2.entrance.length} · Labyrinth ${T2.lab.length} · Pinnacle ${T2.pin.length}</small></span></button>` : ''}
      ${s.pieces.nearfar || s.aeroDeck.length || me.nf !== 'none' ? `<button class="wkbox" data-act="aero"><span>${ic('wind')} Aeronauts${s.pieces.nearfar ? ` · ${LOCATIONS[s.pieces.nearfar].name}` : ''}<br><small>${s.aeroDeck.length} Aeronaut${s.aeroDeck.length === 1 ? '' : 's'} left${me.nf !== 'none' ? ' · you have the Near & Far' : s.players.some((q) => q.nf !== 'none') ? ' · Near & Far claimed' : ''}</small></span></button>` : ''}
    </div>
    ${me.boons.length || me.lsupply.length ? `<div class="chips" style="margin:6px 8px 0">${me.lsupply.map((c) => `<button class="chip" data-act="card" data-uid="${c.uid}">${esc(c.name)} (in your Supply)</button>`).join('')}${me.boons.map((b) => `<button class="chip boonchip" data-act="boon" data-id="${b.bid}"><img src="${b.image}" alt="">${esc(boonText(b))}</button>`).join('')}</div>` : ''}`;
  }
  // The game screen: a fixed banner, a board you can pinch-zoom and pan, and the hand dock.
  if (!document.getElementById('zoom')) {
    $app.innerHTML = `<div class="gshell"><div id="gbanner"></div><div class="vp" id="vp"><div id="zoom"></div></div>
      <div class="zbtns"><button data-act="zin" aria-label="Zoom in">+</button><button data-act="zout" aria-label="Zoom out">−</button><button data-act="zfit" aria-label="Fit">⤢</button></div></div>`;
    initZoom();
  }
  morph(document.getElementById('gbanner'), banner);
  morph(document.getElementById('zoom'), `<div class="table">${top}${councils}${map}${road}${wkHTML}${mine}</div>`);
  renderDock(me, T, choosable);
  if (view.fit) fitBoard();
  const focus = s.current || (prompt && prompt.region) || null;
  if (focus && focus !== lastFocus) showRegion(focus);
  lastFocus = focus;
}
let lastFocus = null;

// ---------------- zoom & pan (two fingers, mouse wheel, or the +/− buttons) ----------------
const BOARD_W = 760;
let view = { s: 0, x: 0, y: 0, fit: true };
function applyView() { const z = document.getElementById('zoom'); if (z) z.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`; }
function fitBoard() {
  const vp = document.getElementById('vp'); if (!vp) return;
  view.s = vp.clientWidth / BOARD_W; view.x = 0;
  clampView(); applyView();
}
function clampView() {
  const vp = document.getElementById('vp'), z = document.getElementById('zoom'); if (!vp || !z) return;
  const w = BOARD_W * view.s, h = z.scrollHeight * view.s;
  const top = (document.getElementById('gbanner')?.offsetHeight || 0) + 6;
  const bot = (document.querySelector('.dock')?.offsetHeight || 0) + 6;
  const minX = Math.min(0, vp.clientWidth - w), maxX = Math.max(0, vp.clientWidth - w);
  const maxY = top, minY = Math.min(top, vp.clientHeight - bot - h);
  view.x = Math.min(maxX, Math.max(minX, view.x)); view.y = Math.min(maxY, Math.max(minY, view.y));
}
function zoomAt(f, cx, cy) {
  const vp = document.getElementById('vp'), r = vp.getBoundingClientRect();
  const px = cx - r.left, py = cy - r.top;
  const fitS = vp.clientWidth / BOARD_W;
  const ns = Math.min(fitS * 4, Math.max(fitS * 0.6, view.s * f));
  view.x = px - (px - view.x) * (ns / view.s); view.y = py - (py - view.y) * (ns / view.s); view.s = ns;
  view.fit = Math.abs(ns - fitS) < 0.001; clampView(); applyView();
}
function showRegion(rid) {
  const vp = document.getElementById('vp'), el = document.querySelector(`#zoom .mrow[data-row="${rid}"]`); if (!vp || !el) return;
  const er = el.getBoundingClientRect();
  const top = (document.getElementById('gbanner')?.offsetHeight || 0) + 8, bot = window.innerHeight - (document.querySelector('.dock')?.offsetHeight || 0);
  if (er.top < top || er.bottom > bot) { view.y += top - er.top; clampView(); const z = document.getElementById('zoom'); z.style.transition = 'transform .35s'; applyView(); setTimeout(() => (z.style.transition = ''), 400); }
}
function initZoom() {
  const vp = document.getElementById('vp');
  const pts = new Map(); let g = null, pan = null;
  vp.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      g = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, s: view.s, x: view.x, y: view.y };
      pan = null; drag = null;
    } else if (pts.size === 1) pan = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
  });
  vp.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const r = vp.getBoundingClientRect();
      const fitS = vp.clientWidth / BOARD_W;
      const ns = Math.min(fitS * 4, Math.max(fitS * 0.6, g.s * d / g.d));
      const ox = g.mx - r.left, oy = g.my - r.top;
      view.s = ns; view.x = mx - r.left - (ox - g.x) * (ns / g.s); view.y = my - r.top - (oy - g.y) * (ns / g.s);
      view.fit = false; clampView(); applyView(); e.preventDefault();
    } else if (pan && !drag) {
      if (!pan.moved && Math.hypot(e.clientX - pan.x, e.clientY - pan.y) < 8) return;
      pan.moved = true; view.x = pan.vx + e.clientX - pan.x; view.y = pan.vy + e.clientY - pan.y; clampView(); applyView();
    }
  }, { passive: false });
  const up = (e) => { if ((pan && pan.moved) || g) justDragged = Date.now(); pts.delete(e.pointerId); if (pts.size < 2) g = null; pan = null; };
  vp.addEventListener('pointerup', up); vp.addEventListener('pointercancel', up);
  // trackpad pinch / ctrl+wheel zooms; a plain wheel scrolls the board
  vp.addEventListener('wheel', (e) => { e.preventDefault(); if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY); else { view.x -= e.deltaX; view.y -= e.deltaY; clampView(); applyView(); } }, { passive: false });
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault());
  window.addEventListener('resize', () => { if (view.fit) fitBoard(); else { clampView(); applyView(); } });
}

function renderDock(me, T, choosable) {
  let dock = document.querySelector('.dock');
  if (!dock) { dock = document.createElement('div'); dock.className = 'dock'; document.body.appendChild(dock); }
  const s = S;
  let panel = '';
  if (s.over) {
    panel = `<div class="panel"><h3>Final Influence</h3>${s.players.map((p) => `${who(p.i)} (${esc(p.short)}): <b>${p.inf}</b>`).join(' · ')}
      <div class="opts"><button class="opt main" data-act="again">Play again</button><button class="opt" data-act="newsetup">Change factions</button><button class="opt" data-act="log">Read the game log</button></div></div>`;
  } else if (beatP) {
    panel = `<div class="panel"><div class="opts"><button class="opt main" data-act="beatok">Continue</button></div></div>`;
  } else if (pending) {
    const p = pending.prompt;
    const mapped = Object.keys(T.tiles).length + Object.keys(T.rows).length + Object.keys(T.road).length + Object.keys(T.oppSlots).length + Object.keys(T.councils).length;
    const peek = s.peek ? `<div class="dim">👁 ${esc(s.peek)}</div>` : '';
    if (p.options && (!mapped || (showOpts && T.rest.length > 3))) {
      const list = mapped ? T.rest : p.options;
      panel = `<div class="panel">${peek}<div class="opts">${list.map((o) => `<button class="opt" data-act="opt" data-id="${esc(o.id)}">${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')}</div></div>`;
    } else if (peek) panel = `<div class="panel">${peek}</div>`;
    // cards you can choose that aren't in your hand or on the Map
    const onBoard = new Set([...Object.values(s.regions).flatMap((R) => R.cards.map((x) => x.card.uid)), ...me.slots.filter((x) => x && x.occ).map((x) => x.occ.uid)]);
    const extra = p.cards ? p.cards.filter((uid) => !me.hand.some((c) => c.uid === uid) && !onBoard.has(uid)).map(findCard).filter(Boolean) : [];
    if (extra.length) panel += `<div class="panel"><div class="dim">Other cards you can choose (tap one):</div><div class="sheetcards" style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">${extra.map((c) => cardHTML(c, { cls: 'ok', style: 'width:60px' })).join('')}</div></div>`;
  }
  const n = me.hand.length;
  const hand = me.hand.map((c, i) => {
    const off = i - (n - 1) / 2;
    const cls = choosable.size ? (choosable.has(c.uid) ? 'ok' : 'no') : '';
    // squeeze the fan so any number of cards fits beside the Kingdom slots
    const step = n > 1 ? Math.min(0.11, (0.48 - 0.17) / (n - 1)) : 0;
    return cardHTML(c, { cls, style: `margin:0 0 0 ${i ? `calc(var(--W) * ${-(0.17 - step).toFixed(4)})` : '0'};transform: rotate(${off * 3}deg) translateY(${Math.abs(off) * 4}px); z-index:${i + 1}` });
  }).join('');
  const fav = s.favour && s.favour.pi === ME ? `<div class="stat">${ic('kingdoms-favour', 'big')}${'I'.repeat(s.favour.val)}<small>Favour</small></div>` : '';
  const slots = `<div class="slots">${me.slots.map((sl) => (sl ? `<div class="slot full">${kcHTML(sl.card)}${sl.occ ? cardHTML(sl.occ, { cls: choosable.has(sl.occ.uid) ? 'ok' : '' }) : ''}</div>` : '<div class="slot"><span class="empty">Kingdom slot</span></div>')).join('')}</div>`;
  // the coach is a pop-up whose button is always on screen; only its text scrolls
  let modal = document.querySelector('.cmodal');
  if (coachP) {
    if (!modal) { modal = document.createElement('div'); modal.className = 'cmodal'; document.body.appendChild(modal); }
    const c = COACH[coachP.key];
    if (modal.dataset.key !== coachP.key) { modal.dataset.key = coachP.key; modal.innerHTML = `<div class="cbox"><h3>${c.title}</h3><div class="cbody">${c.text}</div><button class="opt main" data-act="coachok">Got it</button></div>`; }
  } else if (modal) modal.remove();
  const canHerald = pending && ['herald', 'legend'].includes(pending.prompt.key) && !coachP && !beatP;
  const canSup = Object.values(T.rows).some((v) => String(v).startsWith('sup:'));
  const tray = `<div class="tray">
    ${!me.herald ? tok(me, 'herald', 'data-piece="herald"', canHerald && pending.prompt.key === 'herald' ? 'live' : '') : ''}
    ${game.wk.legendary && !me.legend ? tok(me, 'legend', 'data-piece="legend"', canHerald && pending.prompt.key === 'legend' ? 'live' : '') : ''}
    ${Array.from({ length: me.supporters }, () => tok(me, 'sup', 'data-piece="sup"', canSup ? 'live' : '')).join('')}
    ${me.nf === 'board' ? tok(me, 'nf', 'data-piece="nf"', Object.keys(T.nf).length ? 'live' : '') : ''}
    ${canHerald ? '<span class="thint">Drag your Herald onto a Location</span>' : canSup ? '<span class="thint">Drag a Supporter to a Region</span>' : Object.keys(T.nf).length ? '<span class="thint">Drag the Near & Far to a Region</span>' : ''}</div>`;
  morph(dock, `<div class="dockin">${panel}${tray}<div class="handrow"><div class="hand">${hand || '<span class="empty">No cards in hand</span>'}</div>${slots}</div>
    <div class="stats" data-act="pboard"><div class="stat fac"><span class="emb" style="background-image:url('${BACK(me.faction)}')"></span><span class="rdb">${['I', 'II', 'III', 'IV', 'V', 'VI'][Math.min(s.round, s.rounds) - 1]}</span></div><div class="stat">${ic('influence', 'big')}${me.inf}<small>Influence</small></div><div class="stat">${ic('lore', 'big')}${me.lore}<small>Lore</small></div>
      <div class="stat">${ic('supporter', 'big')}${me.supporters}<small>Supporters</small></div><div class="stat"><span class="cic hand"></span>${me.hand.length}/${game.maxHand(me)}<small>Hand</small></div>
      <button class="stat" data-act="discard"><span class="cic deck"></span>${me.deck.length}<small>Deck</small></button><button class="stat" data-act="discard"><span class="cic discard"></span>${me.discard.length}<small>Discard</small></button>
      <button class="stat" data-act="lost"><span class="cic lost"></span>${s.lost.filter((c) => c.owner === ME).length}<small>Lost</small></button><div class="stat">${ic('lore-cost', 'big')}${me.tactics.filter((x) => !x.exhausted).length}<small>Tactics</small></div>${fav}</div></div>`);
}

function findCard(uid) {
  const s = S;
  for (const p of s.players) {
    for (const z of [p.hand, p.deck, p.discard, p.site, p.hq, p.lsupply]) { const c = z.find((x) => x.uid === uid); if (c) return c; }
    for (const k of p.slots) if (k && k.occ && k.occ.uid === uid) return k.occ;
  }
  for (const r of Object.values(s.regions)) for (const c of r.cards) if (c.card.uid === uid) return c.card;
  for (const e of Object.values(s.councils).flat()) if (e.card.uid === uid) return e.card;
  return s.lost.find((c) => c.uid === uid) || s.burned.find((c) => c.uid === uid) || s.aeroDeck.find((c) => c.uid === uid);
}
function findKingdom(uid) {
  const s = S;
  const all = [...s.road.filter(Boolean), ...s.kdiscard, ...s.kdeck, ...s.players.flatMap((p) => [...p.slots.filter(Boolean).map((x) => x.card), ...p.ksupply]),
    ...Object.values(s.regions).flatMap((r) => r.ks.map((k) => k.card)), ...Object.values(s.locKs).flat().map((k) => k.card)];
  return all.find((k) => k.uid === uid);
}

// ---------------- sheets ----------------
function sheet(html) { $sheet.innerHTML = `<div class="inner"><button class="close" data-act="close">Close</button>${html}</div>`; $sheet.classList.remove('hidden'); $sheet.scrollTop = 0; }
function playerBoard(pi) {
  const p = S.players[pi];
  const fav = CARDS.favour[p.faction];
  const tabs = S.players.map((q) => `<button class="pbtab ${q.i === pi ? 'on' : ''}" style="--fc:${q.color}" data-act="pboard" data-pi="${q.i}">${q.i + 1} ${ic(q.faction)} ${esc(q.short)}</button>`).join('');
  const mineP = pi === ME;
  const pile = (lbl, n, img) => `<div class="pile"><div class="pimg">${img ? `<img src="${img}" alt="">` : ''}<span class="pn">${n}</span></div><small>${lbl}</small></div>`;
  const deckImg = BACK(p.faction);
  const discImg = p.discard.length ? p.discard[p.discard.length - 1].image : null;
  const slot = (sl) => sl ? `<div class="pslot">${kcHTML(sl.card)}${sl.occ ? `<span class="pocc">${esc(sl.occ.name)}</span>` : ''}</div>` : '<div class="pslot empty">Kingdom card</div>';
  const stat = (icn, v, l) => `<div class="pst">${ic(icn, 'big')}<b>${v}</b><small>${l}</small></div>`;
  sheet(`<div class="pbtabs">${tabs}</div><div class="pboard" style="--fc:${p.color}">
    <div class="pbtop">${pile('Deck', p.deck.length, deckImg)}<button class="pilebtn" data-act="${mineP ? 'discard' : 'player'}" data-pi="${p.i}">${pile('Discard', p.discard.length, discImg)}</button>
      ${slot(p.slots[0])}${slot(p.slots[1])}
      <button class="pfav" data-act="favour" data-f="${p.faction}"><img src="${fav.image}" alt="${esc(fav.name)}">${S.favour && S.favour.pi === p.i ? `<span class="pn">${'I'.repeat(S.favour.val)}</span>` : ''}</button></div>
    <div class="pstats">${stat('influence', p.inf, 'Influence')}${stat('lore', p.lore, 'Lore')}<div class="pst"><span class="cic hand"></span><b>${p.hand.length}/${game.maxHand(p)}</b><small>Hand</small></div>
      <div class="pst"><span class="cic deck"></span><b>${p.site.length}</b><small>Site of Power</small></div><div class="pst">${ic('supporter', 'big')}<b>${p.ksupply.length + p.lsupply.length}</b><small>Supply</small></div><div class="pst"><span class="cic lost"></span><b>${S.lost.filter((c) => c.owner === p.i).length}</b><small>Lost</small></div></div>
    <div class="pbname"><span class="fcrown">${ic(p.faction)}</span>${esc(p.name)}<small>${who(p.i)}</small></div>
    <div class="pbrow"><span>Herald</span><b>${p.herald ? esc(LOCATIONS[p.herald].name) : 'Unplaced'}</b>${S.players[pi].legend ? `<span>Legend</span><b>${esc(LOCATIONS[p.legend].name)}</b>` : ''}</div>
    <div class="pbrow"><span>Supporters</span><span class="toks">${Array.from({ length: p.supporters }, () => tok(p, 'sup')).join('')}${p.nf === 'board' ? tok(p, 'nf') : ''}</span>${p.lostSup ? `<small>${p.lostSup} lost</small>` : ''}</div>
    <h3>Tactics</h3><div class="ptac">${p.tactics.map((x) => `<button class="${x.exhausted ? 'ex' : ''}" data-act="tactic" data-pi="${p.i}" data-k="${x.k}"><img src="${x.image}" alt="${esc(x.name)}">${x.exhausted ? '<span>Used</span>' : ''}</button>`).join('')}</div>
    ${p.hq.length ? `<h3>HQ</h3><div class="cards">${p.hq.map((c) => cardHTML(c)).join('')}</div>` : ''}
    ${p.boons.length && mineP ? `<h3>Boons</h3><div class="chips">${p.boons.map((b) => `<button class="chip boonchip" data-act="boon" data-id="${b.bid}"><img src="${b.image}" alt="">${esc(boonText(b))}</button>`).join('')}</div>` : ''}
  </div>`);
}

// ---------------- strategy guide ----------------
const GH = { ic, card: (f, n) => CARDS.factions[f].find((c) => c.num === n).image };
const TIP_CH = { bid: 'bid', bidAlly: 'bid', bidUse: 'bid', herald: 'herald', legend: 'herald', place: 'place', placeRegion: 'place', placeAlly: 'place', clashOrder: 'summer', tie: 'summer', tieCard: 'summer', ambushCard: 'summer', loc: 'locations', council: 'autumn', governCard: 'autumn', castleGovern: 'autumn', journeyCard: 'autumn', buy: 'autumn' };
function guide(id) {
  const i = Math.max(0, CHAPTERS.findIndex((c) => c.id === id));
  const c = CHAPTERS[i], prev = CHAPTERS[i - 1], next = CHAPTERS[i + 1];
  const F = c.faction && FACTIONS.find((f) => f.id === c.faction);
  sheet(`<div class="guide">
    <div class="gtoc">${CHAPTERS.map((x, k) => `<button class="${k === i ? 'on' : ''}" data-act="guide" data-c="${x.id}">${ic(x.icon)}<span>${k + 1}</span></button>`).join('')}</div>
    ${F ? `<div class="ghero" style="--fc:${F.color}"><img src="${heirArt(F.id)}" alt=""><span>${ic(F.id)}</span></div>` : ''}
    <div class="gnum">Strategy · ${i + 1} of ${CHAPTERS.length}</div>
    <h2>${ic(c.icon)} ${c.title}</h2>
    ${c.body(GH)}
    <div class="gnav">${prev ? `<button class="opt" data-act="guide" data-c="${prev.id}">‹ ${prev.title}</button>` : '<span></span>'}${next ? `<button class="opt main" data-act="guide" data-c="${next.id}">${next.title} ›</button>` : `<button class="opt main" data-act="close">Done</button>`}</div>
  </div>`);
}
function tipSheet() {
  const prompt = pending && pending.prompt;
  const me = S.players[ME];
  const ch = (prompt && TIP_CH[prompt.key]) || (prompt && prompt.key === 'action' ? (S.season === 'autumn' ? 'autumn' : S.season === 'spring' ? 'place' : 'summer') : 'idea');
  sheet(`<div class="guide"><div class="gnum">Strategy tip</div><h2>${ic('eye')} What should I do here?</h2>
    <div class="tipbox tipbig">${strategyTip(prompt, S, me, game)}</div>
    <div class="gnav"><button class="opt" data-act="guide" data-c="${me.faction}">${ic(me.faction)} Playing the ${esc(FACTIONS.find((f) => f.id === me.faction).name.replace('The ', ''))}</button><button class="opt main" data-act="guide" data-c="${ch}">Read more ›</button></div></div>`);
}

function closeSheet() { $sheet.classList.add('hidden'); $sheet.innerHTML = ''; }

const TRAIT = { resilient: 'if Eliminated, goes to your Discard Pile instead of the Lost Pile.', invulnerable: "can't be Eliminated.", pathfinder: 'after a Journey, goes to your Discard Pile instead of the Lost Pile.' };
const CMD = {
  deadly: 'Night: Eliminates every opposing Active card in the Clash.', ambush: 'Day: add a card from your hand face down to the Clash (revealed at the end of the Day).',
  retreat: 'Day: return your Active cards in the Region to your hand and your Supporters there to your board.', flank: "Day: move this card to a Region that hasn't fought yet; it's Active there.",
  rally: 'Autumn: return Active cards to your hand.', deploy: 'From your hand: place it face up by a Region with Influence on it. Cards with Influence stay through Winter, losing 1, so it fights next Summer too.',
};
const VERB = { bid: 'Bid with this card', ambushCard: 'Ambush with this card', tieCard: 'Add this card', governCard: 'Govern with this card', journeyCard: 'Journey with this card', castleGovern: 'Govern with this card' };

function cardSheet(uid) {
  const c = findCard(uid);
  if (!c) return;
  const p = pending && !coachP && !beatP ? pending.prompt : null;
  const can = p && p.cards && p.cards.includes(uid);
  const rid = game.regionOf(c);
  const facts = [];
  if (!c.hq) facts.push(`<li><b>Strength ${game.str(c)}</b>${c.arch ? ` · ${ic(ARCH_IC[c.arch])} ${ARCH[c.arch]}` : ''} — counts in Bids and Clashes.</li>`);
  if (game.votesOf(c)) facts.push(`<li>${ic('votes')} <b>${game.votesOf(c)} Vote${game.votesOf(c) > 1 ? 's' : ''}</b> — it can Govern (go into a Council).</li>`);
  if (game.loreOf(c)) facts.push(`<li>${ic('lore')} <b>${game.loreOf(c)} Lore</b> — it can Journey for Lore.</li>`);
  for (const t of game.traits(c, rid)) facts.push(`<li>${ic(t)} <b>${cap(t)}</b> — ${TRAIT[t]}</li>`);
  for (const x of game.cmds(c, rid)) facts.push(`<li>${ic(x.season === 'summer' ? 'day' : x.season)} <b>${cap(x.cmd)}${x.arg ? ` (${x.arg})` : ''}</b> — ${CMD[x.cmd] || ''}${x.cmd === 'rally' ? (x.arg === 'self' ? ' (Just this card.)' : ' (Any two of your Active cards.)') : ''}</li>`);
  if (c.cost) facts.push(`<li>${ic('lore-cost')} Costs <b>${c.cost} Lore</b> at your Site of Power.</li>`);
  if (c.inf) facts.push(`<li>Has <b>${c.inf} Influence</b> on it, so it stays through Winter.</li>`);
  if (game.isAlly(c)) facts.push(`<li><b>Ally</b> — a card from another faction that now fights for ${c.owner === ME ? 'you' : 'them'}.</li>`);
  for (const b of c.boons || []) if (c.owner === ME || game.regionOf(c) && S.regions[game.regionOf(c)].cards.find((x) => x.card === c)?.up) facts.push(`<li>${ic('tower')} <b>Boon:</b> ${esc(boonText(b))}</li>`);
  let btns = '';
  if (can && p.key === 'place') btns = `<div class="btnrow">${(p.regions || RIDS).map((r) => `<button class="big" data-act="placeIn" data-uid="${uid}" data-rid="${r}">${regionName(r)}</button>`).join('')}</div>`;
  else if (can) btns = `<div class="btnrow"><button class="big" data-act="choose" data-uid="${uid}">${VERB[p.key] || 'Choose this card'}</button></div>`;
  sheet(`<div class="detail"><img class="cimg" src="${c.image}" alt="${esc(c.name)}"><div><h2>${esc(c.name)}</h2>${c.text ? `<p>${esc(c.text)}</p>` : ''}<ul>${facts.join('')}</ul></div></div>${can && p.key === 'place' ? '<p class="dim">Place it face down by:</p>' : ''}${btns}`);
}
function kSheet(k, optId) {
  sheet(`<div class="detail kd"><img class="cimg wide" src="${k.image}" alt="${esc(k.name)}"><div><h2>${esc(k.name)}</h2><p>${ic(k.suit)} <b>${councilName(k.suit).replace('Council of ', '')} suit</b> Kingdom Card.</p><p>${esc(kText(k))}</p>
    <p class="dim">Win it by Bidding in Spring. While it's on your board, the card you Bid guards it: a rival Bid higher than the guard's Strength can steal it. Actions on Kingdom Cards can be used once per Round in the season shown.</p></div></div>
    ${optId ? `<button class="big" data-act="opt" data-id="${esc(optId)}">${optId.startsWith('steal') ? 'Steal this card' : 'Take this card'}</button>` : ''}`);
}
function logSheet() { sheet(`<h2>Game log</h2><div class="log">${S.log.slice().reverse().map((l) => `<div class="${l.cls}">${esc(l.msg)}</div>`).join('')}</div>`); }
function tacticSheet(t, p) {
  sheet(`<div class="detail kd"><img class="cimg wide" src="${t.image}" alt="${esc(t.name)}"><div><h2>${esc(t.name)}</h2><p>${esc(p.name)} Tactic${t.exhausted ? ' — <b>exhausted</b>' : t.markers ? ` — ${t.markers} marker(s) left` : ' — ready'}.</p>
    ${t.text ? `<p>${esc(t.text)}</p>` : ''}${t.rules.map((r) => `<p>${ic(r.season === 'summer' ? 'day' : r.season)} <b>${cap(r.season)}:</b> ${esc(r.text)}</p>`).join('')}
    <p class="dim">Each Tactic can be used once (it then flips to Exhausted). Tactics with markers can be used once per marker. When one is usable, it shows up in that step's options.</p></div></div>`);
}
function browse(f = 'nobility') {
  const cards = CARDS.factions[f];
  const g = (list, wide) => `<div class="gallery ${wide ? 'wide' : ''}">${list.map((c) => `<a href="${c.image}" target="_blank" rel="noopener"><img src="${c.image}" loading="lazy" alt="${esc(c.name)}"></a>`).join('')}</div>`;
  sheet(`<h2>Card browser</h2><div class="pick tabs">${FACTIONS.map((x) => `<button data-act="browse" data-f="${x.id}" class="${x.id === f ? 'on' : ''}">${x.name.replace('The ', '')}</button>`).join('')}<button data-act="browse" data-f="kingdom" class="${f === 'kingdom' ? 'on' : ''}">Kingdom</button><button data-act="browse" data-f="wk" class="${f === 'wk' ? 'on' : ''}">Wild Kingdom</button></div>
    ${f === 'wk' ? `<h3>Aeronauts & Legendary Creatures</h3>${g(CARDS.wk.factionCards)}<h3>Wild Kingdom Cards</h3>${g(CARDS.wk.kingdom, true)}<h3>Night Map</h3>${g(Object.values(CARDS.wk.night), true)}<h3>Whispering Tower & Boons</h3>${g([CARDS.wk.tower], true)}${g(CARDS.wk.boons)}` : f === 'kingdom' ? g(CARDS.kingdom, true) : `<h3>Starting deck (14)</h3>${g(cards.filter((c) => c.num <= 14))}<h3>Site of Power (bought with Lore)</h3>${g(cards.filter((c) => c.num >= 15))}<h3>Tactics & Kingdom's Favour</h3>${g([...CARDS.tactics[f], CARDS.favour[f]], true)}`}`);
}

// ---------------- answering ----------------
function answer(v) {
  if (!pending) return;
  const r = pending.res; pending = null; S.peek = null; toast = ''; showOpts = false; r(v); render();
}
function flash(t) { toast = t; render(); setTimeout(() => { if (toast === t) { toast = ''; render(); } }, 2200); }

function dropPiece(piece, spec) {
  const p = pending && !coachP && !beatP ? pending.prompt : null;
  const T = targets();
  const [kind, arg] = spec.split(':');
  if (p && (piece === 'herald' || piece === 'legend') && p.key === piece && kind === 'tile' && T.tiles[arg]) return answer(T.tiles[arg]);
  if (p && piece === 'sup' && kind === 'row' && String(T.rows[arg] || '').startsWith('sup:')) return answer(T.rows[arg]);
  if (p && piece === 'nf' && kind === 'row' && T.nf[arg]) return answer(T.nf[arg]);
  const why = { herald: 'Your Herald goes on a Location when the game asks you to place it (Start of the Year).', legend: 'Your Legendary Creature is placed right after your Herald.', sup: 'Supporters go by a Region when you take the Place a Supporter action in Spring.', nf: 'The Near & Far goes by a Region as a Spring action.' };
  flash(why[piece]);
}
function drop(uid, spec) {
  const p = pending && !coachP && !beatP ? pending.prompt : null;
  if (!p || !p.cards || !p.cards.includes(uid)) return flash("That card can't be used right now.");
  const [kind, arg] = spec.split(':');
  if (kind === 'row') {
    if (p.key === 'place') return answer({ uid, rid: arg });
    return answer(uid);
  }
  if (kind === 'council') { autoNext = { key: 'council', id: arg }; return answer(uid); }
  return answer(uid);
}

// ---------------- dragging cards from your hand ----------------
let drag = null, justDragged = 0;
document.addEventListener('pointerdown', (e) => {
  const pc = e.target.closest('.tray [data-piece]');
  if (pc && pending) { drag = { piece: pc.dataset.piece, el: pc, x: e.clientX, y: e.clientY, moved: false, ghost: null, over: null }; return; }
  const el = e.target.closest('.hand .card, .sheetcards .card');
  if (!el || !pending) return;
  drag = { uid: +el.dataset.uid, el, x: e.clientX, y: e.clientY, moved: false, ghost: null, over: null };
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.moved) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 10) return;
    const p = pending && pending.prompt;
    if (!drag.piece && (!p || !p.cards || !p.cards.includes(drag.uid))) { drag = null; return; }
    drag.moved = true;
    drag.el.classList.add('dragging');
    drag.ghost = document.createElement('div'); drag.ghost.className = drag.piece ? 'ghost pghost' : 'ghost';
    drag.ghost.innerHTML = drag.piece ? drag.el.outerHTML : drag.el.querySelector('img').outerHTML;
    if (drag.piece) document.body.classList.add('placing-' + drag.piece);
    document.body.appendChild(drag.ghost);
  }
  e.preventDefault();
  drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
  const t = document.elementFromPoint(e.clientX, e.clientY);
  const d = t && t.closest('[data-drop]');
  if (drag.over && drag.over !== d) drag.over.classList.remove('over');
  if (d) d.classList.add('over');
  drag.over = d;
}, { passive: false });
document.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const dd = drag; drag = null;
  if (!dd.moved) return;
  justDragged = Date.now();
  dd.ghost.remove(); dd.el.classList.remove('dragging');
  document.body.classList.remove('placing-herald', 'placing-legend', 'placing-sup', 'placing-nf');
  if (dd.over) { dd.over.classList.remove('over'); if (dd.piece) dropPiece(dd.piece, dd.over.dataset.drop); else drop(dd.uid, dd.over.dataset.drop); }
  else render();
});
document.addEventListener('pointercancel', () => { if (drag && drag.ghost) drag.ghost.remove(); drag = null; document.body.classList.remove('placing-herald', 'placing-legend', 'placing-sup', 'placing-nf'); render(); });

// ---------------- taps ----------------
document.addEventListener('click', (e) => {
  if (Date.now() - justDragged < 350) return;
  const b = e.target.closest('[data-act]');
  if (!b) { if (e.target === $sheet) closeSheet(); return; }
  const a = b.dataset.act;
  const T = game ? targets() : null;
  switch (a) {
    case 'fac': {
      const id = b.dataset.id;
      if (id === cfg.them) { cfg.them = cfg.you; store.set('them', cfg.them); }
      cfg.you = id; store.set('you', id); setup(); break;
    }
    case 'cycleopp': { const ids = FACTIONS.map((f) => f.id).filter((f) => f !== cfg.you); cfg.them = ids[(ids.indexOf(cfg.them) + 1) % ids.length]; store.set('them', cfg.them); setup(); break; }
    case 'configure': configure(); break;
    case 'wk': cfg.wk = { ...cfg.wk, [b.dataset.k]: !cfg.wk[b.dataset.k] }; store.set('wk', cfg.wk); setup(); configure(); break;
    case 'wkcards': cfg.wk = { ...cfg.wk, cards: +b.dataset.n }; store.set('wk', cfg.wk); setup(); configure(); break;
    case 'rounds': cfg.rounds = +b.dataset.n; store.set('rounds', cfg.rounds); setup(); configure(); break;
    case 'coach': cfg.coach = b.dataset.on === '1'; store.set('coach', cfg.coach); if (game) { closeSheet(); render(); } else { setup(); configure(); } break;
    case 'title': closeSheet(); title(); break;
    case 'newgame': setup(); break;
    case 'resume': start(true); break;
    case 'start': case 'again': closeSheet(); start(); break;
    case 'newsetup': closeSheet(); setup(); break;
    case 'noop': break;
    case 'pboard': if (game) playerBoard(b.dataset.pi != null ? +b.dataset.pi : ME); break;
    case 'zin': { const r = document.getElementById('vp').getBoundingClientRect(); zoomAt(1.3, r.left + r.width / 2, r.top + r.height / 2); break; }
    case 'zout': { const r = document.getElementById('vp').getBoundingClientRect(); zoomAt(1 / 1.3, r.left + r.width / 2, r.top + r.height / 2); break; }
    case 'zfit': view.fit = true; view.y = 0; fitBoard(); break;
    case 'rules': sheet(RULES_HTML); break;
    case 'guide': guide(b.dataset.c); break;
    case 'tip': if (game) tipSheet(); break;
    case 'browse': browse(b.dataset.f); break;
    case 'log': logSheet(); break;
    case 'close': closeSheet(); break;
    case 'menu': sheet(`<h2>Menu</h2><div class="opts">
      <button class="opt" data-act="togglecoach">${cfg.coach ? 'Turn coach off' : 'Turn coach on'}</button>
      <button class="opt" data-act="replaytips">Show all coach tips again</button>
      <button class="opt" data-act="guide">Strategy guide</button>
      <button class="opt" data-act="browse">Browse the cards</button>
      <button class="opt" data-act="quit">Save and quit to the main menu</button></div>`); break;
    case 'togglecoach': cfg.coach = !cfg.coach; store.set('coach', cfg.coach); closeSheet(); render(); break;
    case 'replaytips': seen = new Set(); cfg.coach = true; closeSheet(); render(); break;
    case 'quit': closeSheet(); title(); break;
    case 'toggleopts': showOpts = !showOpts; render(); break;
    case 'coachok': { const r = coachP.res; coachP = null; r(); render(); break; }
    case 'beatok': { const r = beatP.res; beatP = null; r(); render(); break; }
    case 'opt': closeSheet(); answer(b.dataset.id); break;
    case 'skip': answer(null); break;
    case 'card': if (game) cardSheet(+b.dataset.uid); break;
    case 'boon': { const bb = S.players[ME].boons.find((x) => String(x.bid) === b.dataset.id); if (bb) sheet(`<div class="detail kd"><img class="cimg" style="width:40%" src="${bb.image}" alt=""><div><h2>Boon</h2><p>${esc(boonText(bb))}</p><p class="dim">In Spring (as an Action) put Boons face down on your face-down cards by the Regions, up to two per card. They're revealed with the card and work while it stays Active.</p></div></div>`); break; }
    case 'tower': { const T2 = S.tower; sheet(`<div class="detail kd"><img class="cimg wide" src="${CARDS.wk.tower.image}" alt=""><div><h2>The Whispering Tower</h2><p>${ic('tower')} On the <b>${S.pieces.tower ? LOCATIONS[S.pieces.tower].name : '—'}</b>. Whoever claims that Location <b>must</b> visit it instead of taking the Location's reward.</p><p><b>Entrance</b> (${T2.entrance.length}): take its Boon. <b>Labyrinth</b> (${T2.lab.length}): look at both, keep one, give the other to an opponent. <b>Pinnacle</b> (${T2.pin.length}): pay 1 Lore, take all three, then discard two Boons. You can leave after any level. Then the Tower moves to a Location in another Region.</p></div></div>`); break; }
    case 'aero': sheet(`<h2>The Aeronauts</h2><p>${ic('wind')} The Near & Far is ${S.pieces.nearfar ? `on the <b>${LOCATIONS[S.pieces.nearfar].name}</b>; it travels diagonally down the Map each Winter` : 'claimed'}. If you claim its Location you <b>may</b> visit instead of taking the reward: gain 1 Influence or 1 Lore, then take an Aeronaut into your hand as an Ally. Once they're all gone, the next visitor may unexhaust a Tactic and claims the Near & Far: a Supporter worth 3 Strength that always comes home.</p><h3>Aeronauts still waiting</h3><div class="cards">${S.aeroDeck.map((c) => cardHTML(c)).join('') || '<p>None.</p>'}</div>`); break;
    case 'choose': closeSheet(); answer(+b.dataset.uid); break;
    case 'placeIn': closeSheet(); answer({ uid: +b.dataset.uid, rid: b.dataset.rid }); break;
    case 'row': if (T.rows[b.dataset.rid]) answer(T.rows[b.dataset.rid]); break;
    case 'tile': {
      const l = b.dataset.l, rid = b.dataset.rid;
      if (T.tiles[l]) return answer(T.tiles[l]);
      if (T.rows[rid]) return answer(T.rows[rid]);
      const L = LOCATIONS[l];
      sheet(`<div class="detail kd"><img class="cimg wide" src="${locImg(l)}" alt=""><div><h2>${L.name} <span class="dim">(${regionName(rid)})</span></h2><p><b>${L.inf} Influence</b> when you win this Region and claim this Location.</p><p>${esc(L.text)}</p><p>If your Herald is here too: +1 Influence, and steal 1 from every rival Herald here. Council of Relics cards can be cashed in then too.</p></div></div>`);
      break;
    }
    case 'kinfo': { const k = findKingdom(+b.dataset.uid); if (k) kSheet(k, b.dataset.opt); break; }
    case 'tactic': { const p = S.players[+b.dataset.pi]; tacticSheet(p.tactics.find((t) => t.k === b.dataset.k), p); break; }
    case 'favour': { const f = CARDS.favour[b.dataset.f]; sheet(`<div class="detail kd"><img class="cimg wide" src="${f.image}" alt=""><div><h2>${esc(f.name)}</h2><p>Kingdom's Favour action. Whoever claims the Harvest Field takes the Kingdom's Favour (set to III). Each use turns it down one; after I it goes back to the Harvest Field. It also wins tied games.</p>${f.rules.map((r) => `<p><b>${cap(r.season)}:</b> ${esc(r.text)}</p>`).join('')}</div></div>`); break; }
    case 'player': if (b.closest('.obox')) { playerBoard(+b.dataset.pi); break; } { const p = S.players[+b.dataset.pi]; sheet(`<h2>${esc(p.name)}</h2><p>${who(p.i)}. Influence <b>${p.inf}</b>, Lore <b>${p.lore}</b>, Hand Size <b>${game.maxHand(p)}</b>, Supporters on board <b>${p.supporters}</b> (Lost: ${p.lostSup}).</p>
      <p>HQ: ${p.hq.map((c) => esc(c.name)).join(', ') || 'none'}. Tactics: ${p.tactics.map((t) => `${esc(t.name)}${t.exhausted ? ' (used)' : ''}`).join(', ')}.</p>
      <h3>Discard Pile</h3><div class="cards">${p.discard.map((c) => cardHTML(c)).join('') || '<p>Empty.</p>'}</div><h3>Site of Power — ${esc(p.siteName)}</h3><div class="cards">${p.site.map((c) => cardHTML(c)).join('') || '<p>Empty.</p>'}</div>`); break; }
    case 'council': {
      const c = COUNCILS.find((x) => x.id === b.dataset.c);
      if (T.councils[c.id]) return answer(T.councils[c.id]);
      sheet(`<div class="detail kd"><img class="cimg wide" src="${c.image}" alt=""><div><h2>${c.name}</h2><p>${esc(c.text)}</p></div></div><h3>Cards here</h3><div class="cards">${S.councils[c.id].map((e) => cardHTML(e.card)).join('') || '<p>None yet.</p>'}</div>`);
      break;
    }
    case 'lost': sheet(`<h2>Lost Pile</h2><p>Cards removed from play — they don't come back unless a card says so.</p><div class="cards">${S.lost.map((c) => cardHTML(c)).join('') || '<p>Empty.</p>'}</div>`); break;
    case 'discard': { const p = S.players[ME]; sheet(`<h2>Your Discard Pile</h2><p>These shuffle back into your Deck when it runs out (Attrition). Deck: ${p.deck.length} cards.</p><div class="cards">${p.discard.map((c) => cardHTML(c)).join('') || '<p>Empty.</p>'}</div><h3>Site of Power — ${esc(p.siteName)}</h3><p>Buy these with Lore right when you gain it.</p><div class="cards">${p.site.map((c) => cardHTML(c)).join('') || '<p>Empty — at the end of the game every 2 Lore you have is worth 1 Influence.</p>'}</div>`); break; }
  }
});

title();
