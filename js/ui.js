import { Game, regionName, locName, councilName } from './engine.js';
import { aiAnswer } from './ai.js';
import { COACH } from './coach.js';
import { FACTIONS, REGIONS, LOCATIONS, COUNCILS, STARTER, SITE, KINGDOM } from './data.js';
import { RULES_HTML } from './rules.js';

const $app = document.getElementById('app');
const $sheet = document.getElementById('sheet');
const store = {
  get(k, d) { try { const v = localStorage.getItem('kc:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('kc:' + k, JSON.stringify(v)); } catch {} },
};

let cfg = { you: store.get('you', 'nobility'), them: store.get('them', 'clans'), rounds: store.get('rounds', 5), coach: store.get('coach', true) };
let game = null, S = null, ME = 0;
let pending = null;   // { prompt, res }
let coachP = null;    // { key, res }
let beatP = null;     // { text, res }
let seen = new Set();

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------- setup screen ----------------
function setup() {
  game = null;
  const fac = (sel, key) => `<div class="pick">${FACTIONS.map((f) => `<button data-act="fac" data-key="${key}" data-id="${f.id}" class="${cfg[key] === f.id ? 'on' : ''}"><span class="swatch" style="background:${f.color}"></span>${f.name}</button>`).join('')}</div>`;
  $app.innerHTML = `<div class="setup">
    <h1>King's Crown</h1>
    <div class="tag">Learn to play <i>The Old King's Crown</i> one season at a time, with a coach explaining each step.</div>
    <h3>Your faction</h3>${fac(0, 'you')}
    <h3>Computer opponent</h3>${fac(1, 'them')}
    <h3>Game length</h3>
    <div class="pick">
      <button data-act="rounds" data-n="1" class="${cfg.rounds === 1 ? 'on' : ''}">Practice year<small>1 Round — just the basics</small></button>
      <button data-act="rounds" data-n="3" class="${cfg.rounds === 3 ? 'on' : ''}">Quick<small>3 Rounds</small></button>
      <button data-act="rounds" data-n="4" class="${cfg.rounds === 4 ? 'on' : ''}">Short game<small>4 Rounds</small></button>
      <button data-act="rounds" data-n="5" class="${cfg.rounds === 5 ? 'on' : ''}">Standard<small>5 Rounds (rulebook default)</small></button>
    </div>
    <h3>Coach</h3>
    <div class="pick">
      <button data-act="coach" data-on="1" class="${cfg.coach ? 'on' : ''}">Coach on<small>Explains each step the first time</small></button>
      <button data-act="coach" data-on="0" class="${!cfg.coach ? 'on' : ''}">Coach off<small>Just short hints</small></button>
    </div>
    <button class="big" data-act="start">Start the game</button>
    <button class="link" data-act="rules">Read the rules overview</button>
    <div class="note"><b>Stand-in cards:</b> the round structure, Commands, Traits and Councils follow the rulebook, but the card numbers (Strengths, Votes, Lore, Location rewards and Kingdom Cards) are made-up stand-ins until the real card list is added. The real factions also have their own special cards and Tactics, which aren't in this version yet.</div>
  </div>`;
}

function start() {
  if (cfg.you === cfg.them) cfg.them = FACTIONS.find((f) => f.id !== cfg.you).id;
  seen = new Set(); pending = coachP = beatP = null;
  const seed = (Math.random() * 2 ** 31) | 0;
  game = new Game({ seed, factions: [cfg.you, cfg.them], humans: [true, false], rounds: cfg.rounds }, io);
  ME = 0; S = game.s;
  render();
  game.run().then(() => render()).catch((e) => { console.error(e); alert('Something went wrong: ' + e.message); });
}

const io = {
  update(s) { S = s; scheduleRender(); },
  ask(pi, prompt, s, g) {
    if (!s.players[pi].human) return aiAnswer(pi, prompt, s, g);
    return new Promise((res) => { pending = { prompt, res }; render(); });
  },
  coach(key) {
    if (seen.has(key)) return;
    seen.add(key);
    if (!cfg.coach) return;
    return new Promise((res) => { coachP = { key, res }; render(); });
  },
  beat(text) { return new Promise((res) => { beatP = { text, res }; render(); }); },
};

let raf = 0;
function scheduleRender() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }

// ---------------- rendering ----------------
function cardHTML(c, { cls = '', sm = false, data = '' } = {}) {
  const icons = [];
  if (c.votes) icons.push(`<span class="v">${c.votes} Vote${c.votes > 1 ? 's' : ''}</span>`);
  if (c.lore) icons.push(`<span class="l">${c.lore} Lore</span>`);
  for (const t of c.traits || []) icons.push(`<span class="t">${cap(t)}</span>`);
  if (c.cmd) icons.push(`<span class="c">${cap(c.cmd)}</span>`);
  if (c.hq) icons.push(`<span class="t">HQ</span>`);
  return `<button class="card ${sm ? 'sm' : ''} ${cls}" data-act="card" data-uid="${c.uid}" ${data}><div class="st">${c.hq ? '' : c.str}</div><div class="cn">${esc(c.name)}</div><div class="ic">${icons.join('')}</div></button>`;
}
const backHTML = (sm = true) => `<div class="card back ${sm ? 'sm' : ''}"></div>`;
const cap = (t) => t[0].toUpperCase() + t.slice(1);

function render() {
  if (!game) return;
  const s = S, me = s.players[ME];
  const seasons = [['year', 'Year'], ['spring', 'Spring'], ['summer', 'Summer'], ['autumn', 'Autumn'], ['winter', 'Winter']];
  const top = `<div class="top">
    <div class="toprow"><h2>Round ${Math.min(s.round, s.rounds)} of ${s.rounds}</h2>
      <button class="iconbtn" data-act="rules">Rules</button>
      <button class="iconbtn" data-act="log">Log</button>
      <button class="iconbtn" data-act="menu">☰</button></div>
    <div class="seasons">${seasons.map(([id, n]) => `<span class="${s.season === id ? 'on' : ''}">${n}</span>`).join('')}</div>
    <div class="stepname">${esc(s.step || '')}</div>
    <div class="players">${s.players.map((p) => `<div class="pchip" style="border-color:${p.color}">
      <span class="inf">${p.inf}</span><div class="nm">${p.i === ME ? 'You' : 'Computer'} · ${esc(p.name.replace('The ', ''))}</div>
      <div class="stats">Hand ${p.hand.length}/${game.maxHand(p)} · Deck ${p.deck.length} · Lore ${p.lore} · Supp. ${p.supporters}${s.favour === p.i ? ' · ♛ Favour' : ''}${s.order[0] === p.i ? ' · 1st' : ''}</div></div>`).join('')}</div>
  </div>`;

  // Great Road (+ revealed bids)
  const bids = s.bids ? `<div class="minirow">Bids: ${Object.entries(s.bids).map(([pi, c]) => `<span>${pi == ME ? 'You' : 'Computer'}: <b>${esc(c.name)} (${c.str})</b></span>`).join('')}</div>` : '';
  const road = `<div class="section"><div class="lbl"><span>The Great Road — Kingdom Cards</span><span>Deck ${s.kdeck.length}</span></div>
    <div class="road">${s.road.map((k) => k ? `<button class="kcard" data-act="kinfo" data-k="${k.k}"><div class="kn">${esc(k.name)}</div>${esc(k.text)}</button>` : `<div class="kcard empty"></div>`).join('')}</div>${bids}</div>`;

  // Map
  const prompt = pending && pending.prompt;
  const map = `<div class="section"><div class="lbl"><span>The Map</span><span>Lost Pile ${s.lost.length}</span></div>${REGIONS.map((r) => {
    const R = s.regions[r.id];
    const mk = s.clashOrder.indexOf(r.id);
    const cur = s.current === r.id || (prompt && prompt.region === r.id);
    const res = R.winner != null ? `<span class="result">Won by ${R.winner === ME ? 'you' : 'computer'}</span>` : R.tie ? `<span class="result">Tie</span>` : '';
    const locs = r.locs.map((l) => {
      const hs = s.players.filter((p) => p.herald === l).map((p) => `<span class="herald" style="background:${p.color}">Herald</span>`).join('');
      const mks = s.marks[l] ? s.players.filter((p) => s.marks[l][p.i]).map((p) => `<span class="herald" style="background:${p.color};opacity:.7">${s.marks[l][p.i]} mk</span>`).join('') : '';
      return `<button class="loc ${R.claimed === l ? 'claimed' : ''}" data-act="loc" data-l="${l}"><span class="li">${LOCATIONS[l].inf}</span><div class="ln">${LOCATIONS[l].name}</div>${esc(short(LOCATIONS[l].text))}<div>${hs}${mks}</div></button>`;
    }).join('');
    const sides = s.players.map((p) => {
      const cs = R.cards.filter((c) => c.card.owner === p.i).map((c) => {
        if (!c.up && p.i !== ME) return backHTML();
        return cardHTML(c.card, { sm: true, cls: `${!c.up ? 'down' : ''} ${c.used && s.current !== r.id ? 'used' : ''}` });
      }).join('');
      const sup = R.sup[p.i] ? `<span class="sup">+${R.sup[p.i]} Supporter${R.sup[p.i] > 1 ? 's' : ''}</span>` : '';
      return `<div class="side" style="border-top:3px solid ${p.color}"><div class="who"><span>${p.i === ME ? 'You' : 'Computer'}${sup}</span></div><div class="cards">${cs}</div></div>`;
    }).join('');
    return `<div class="region ${cur ? 'cur' : ''}"><div class="rhead">${mk >= 0 ? `<span class="marker">${['I', 'II', 'III'][mk]}</span>` : ''}<h3>${r.name}</h3>${res}</div>
      <div class="locs">${locs}</div><div class="lane">${sides}</div></div>`;
  }).join('')}</div>`;

  // Councils
  const councils = `<div class="section"><div class="lbl"><span>Councils (Votes)</span></div><div class="councils">${COUNCILS.map((c) => `<button class="council" data-act="council" data-c="${c.id}"><div class="cn">${c.name.replace('Council of ', '')}</div><div class="vt">${s.players.map((p) => `<span style="color:${p.color}">${p.i === ME ? 'You' : 'CPU'} ${game.votes(p.i, c.id)}</span>`).join('')}</div></button>`).join('')}</div></div>`;

  // Players' boards
  const boards = s.players.map((p) => {
    const slots = p.kingdom.map((k) => k ? `<div class="slot"><button class="kcard" data-act="kinfo" data-k="${k.card.k}"><div class="kn">${esc(k.card.name)}</div>${esc(k.card.text)}</button>${cardHTML(k.occ, { sm: true })}</div>` : `<div class="kcard empty">Empty Kingdom space</div>`).join('');
    const extra = p.i === ME ? `<div class="minirow"><span>Site of Power: ${p.site.map((c) => `<b>${c.name}</b> (${c.cost})`).join(', ') || 'empty'}</span></div>
      <div class="minirow"><span>HQ: <b>${p.hq.map((c) => c.name).join(', ') || 'none'}</b></span><span>Discard <b>${p.discard.length}</b></span><span>Lost Supporters <b>${p.lostSup}</b></span><span>Hand Size <b>${game.maxHand(p)}</b></span><button class="link" data-act="discard">see Discard</button></div>`
      : `<div class="minirow"><span>HQ: <b>${p.hq.map((c) => c.name).join(', ') || 'none'}</b></span><span>Discard <b>${p.discard.length}</b></span><span>Hand Size <b>${game.maxHand(p)}</b></span></div>`;
    return `<div class="section"><div class="lbl"><span style="color:${p.color}">${p.i === ME ? 'Your board' : 'Computer’s board'} — Kingdom Cards</span></div><div class="mine">
      <div class="slots">${slots}</div>${extra}</div></div>`;
  }).join('');

  $app.innerHTML = `${top}<div class="game"><div class="main">${road}${map}${councils}${boards}</div>${dock(me)}</div>`;
  // Keep the Region being fought (or chosen for) on screen.
  const focus = s.current || (prompt && prompt.region) || null;
  if (focus && focus !== lastFocus) {
    const el = $app.querySelector('.region.cur');
    const topH = $app.querySelector('.top').offsetHeight;
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - topH - 6, behavior: 'smooth' });
  }
  lastFocus = focus;
}
let lastFocus = null;

const short = (t) => t.length > 60 ? t.slice(0, 58) + '…' : t;

function dock(me) {
  const s = S;
  let head = '';
  if (s.over) {
    const w = s.players[s.result.winner];
    head = `<div class="beat"><h3>${w.i === ME ? 'You win the crown!' : 'The computer wins the crown.'}</h3>Final Influence: ${s.players.map((p) => `${p.i === ME ? 'You' : 'Computer'} ${p.inf}`).join(' · ')}.</div>
      <div class="opts"><button class="opt main" data-act="again">Play again</button><button class="opt" data-act="newsetup">Change factions</button><button class="opt" data-act="log">Read the game log</button></div>`;
  } else if (coachP) {
    const c = COACH[coachP.key];
    head = `<div class="coach"><h3>${c.title}</h3>${c.text}</div><div class="opts"><button class="opt main" data-act="coachok">Got it</button></div>`;
  } else if (beatP) {
    head = `<div class="beat">${esc(beatP.text)}</div><div class="opts"><button class="opt main" data-act="beatok">Continue</button></div>`;
  } else if (pending) {
    const p = pending.prompt;
    const tip = COACH[p.key] && !cfg.coach ? '' : '';
    head = `<div class="ptext"><span class="who">Your move:</span> ${esc(p.text)}${tip}</div>`;
    if (p.options) head += `<div class="opts">${p.options.map((o) => `<button class="opt" data-act="opt" data-id="${esc(o.id)}">${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')}</div>`;
    if (p.cards) head += `<div class="waiting">Highlighted cards can be chosen. Tap one to see it${p.optional ? ', or skip' : ''}.</div>${p.optional ? `<div class="opts"><button class="opt" data-act="skip">Skip</button></div>` : ''}`;
  } else {
    head = `<div class="waiting">The computer is thinking…</div>`;
  }
  // Hand (plus any choosable non-hand cards, e.g. Active cards for the Castle)
  const choosable = new Set(pending && pending.prompt.cards ? pending.prompt.cards : []);
  const extra = [];
  if (pending && pending.prompt.cards) for (const uid of choosable) if (!me.hand.some((c) => c.uid === uid)) { const c = findCard(uid); if (c) extra.push(c); }
  const hand = [...me.hand, ...extra].map((c) => cardHTML(c, { cls: pending && pending.prompt.cards ? (choosable.has(c.uid) ? 'ok' : 'no') : '' })).join('');
  return `<div class="dock">${head}<div class="lbl" style="font-size:11px;color:var(--dim);margin-top:8px;text-transform:uppercase;letter-spacing:1px">Your hand (${me.hand.length})</div><div class="hand">${hand || '<span class="waiting">No cards in hand.</span>'}</div></div>`;
}

function findCard(uid) {
  const s = S;
  for (const p of s.players) {
    for (const z of [p.hand, p.deck, p.discard, p.site, p.hq]) { const c = z.find((x) => x.uid === uid); if (c) return c; }
    for (const k of p.kingdom) if (k && k.occ.uid === uid) return k.occ;
  }
  for (const r of Object.values(s.regions)) for (const c of r.cards) if (c.card.uid === uid) return c.card;
  for (const e of Object.values(s.councils).flat()) if (e.card.uid === uid) return e.card;
  return s.lost.find((c) => c.uid === uid);
}

// ---------------- sheets ----------------
function sheet(html) { $sheet.innerHTML = `<div class="inner"><button class="iconbtn close" data-act="close">Close</button>${html}</div>`; $sheet.classList.remove('hidden'); }
function closeSheet() { $sheet.classList.add('hidden'); $sheet.innerHTML = ''; }

function cardSheet(uid) {
  const c = findCard(uid);
  if (!c) return;
  const p = pending && pending.prompt;
  const can = p && p.cards && p.cards.includes(uid);
  const verb = p ? { bid: 'Bid with this card', place: `Place in the ${p.region ? regionName(p.region) : ''}`, ambushCard: 'Ambush with this card', tieCard: 'Add this card', governCard: 'Govern with this card', journeyCard: 'Journey with this card', castleGovern: 'Govern with this card' }[p.key] : null;
  const facts = [];
  if (!c.hq) facts.push(`<li><b>Strength ${c.str}</b> — counts in Clashes and Bids.</li>`);
  if (c.votes) facts.push(`<li><b>${c.votes} Vote${c.votes > 1 ? 's' : ''}</b> — can Govern (go into a Council).</li>`);
  if (c.lore) facts.push(`<li><b>${c.lore} Lore</b> — can Journey for Lore.</li>`);
  for (const t of c.traits) facts.push(`<li><b>${cap(t)}</b> — ${TRAIT[t]}</li>`);
  if (c.cmd) facts.push(`<li><b>${cap(c.cmd)}</b> — ${CMD[c.cmd]}</li>`);
  sheet(`<div class="detail">${cardHTML(c)}<div><h2>${esc(c.name)}</h2><p>${esc(c.text || '')}</p></div></div><ul>${facts.join('')}</ul>
    ${can ? `<button class="big" data-act="choose" data-uid="${uid}">${verb || 'Choose this card'}</button>` : ''}`);
}

const TRAIT = { resilient: 'if Eliminated, goes to your Discard Pile instead of the Lost Pile.', invulnerable: "can't be Eliminated.", pathfinder: 'after a Journey, goes to your Discard Pile instead of the Lost Pile.' };
const CMD = { deadly: 'Night: Eliminates every opposing Active card in this Clash.', ambush: 'Day Action: add a card from your hand to this Clash.', retreat: 'Day Action: return your Active cards here to your hand and your Supporters here to your board.' };

function logSheet() {
  sheet(`<h2>Game log</h2><div class="log">${S.log.slice().reverse().map((l) => `<div class="${l.cls}">${esc(l.msg)}</div>`).join('')}</div>`);
}

// ---------------- events ----------------
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) { if (e.target === $sheet) closeSheet(); return; }
  const a = b.dataset.act;
  switch (a) {
    case 'fac': cfg[b.dataset.key] = b.dataset.id; store.set(b.dataset.key, b.dataset.id); setup(); break;
    case 'rounds': cfg.rounds = +b.dataset.n; store.set('rounds', cfg.rounds); setup(); break;
    case 'coach': cfg.coach = b.dataset.on === '1'; store.set('coach', cfg.coach); setup(); break;
    case 'start': case 'again': start(); break;
    case 'newsetup': setup(); break;
    case 'rules': sheet(RULES_HTML); break;
    case 'log': logSheet(); break;
    case 'close': closeSheet(); break;
    case 'menu': sheet(`<h2>Menu</h2><div class="opts">
      <button class="opt" data-act="togglecoach">${cfg.coach ? 'Turn coach off' : 'Turn coach on'}</button>
      <button class="opt" data-act="replaytips">Show all coach tips again</button>
      <button class="opt" data-act="cardlist">All stand-in cards</button>
      <button class="opt" data-act="quit">Quit to setup</button></div>`); break;
    case 'togglecoach': cfg.coach = !cfg.coach; store.set('coach', cfg.coach); closeSheet(); render(); break;
    case 'replaytips': seen = new Set(); cfg.coach = true; closeSheet(); render(); break;
    case 'quit': closeSheet(); if (confirmQuit()) setup(); break;
    case 'cardlist': sheet(cardList()); break;
    case 'coachok': { const r = coachP.res; coachP = null; r(); render(); break; }
    case 'beatok': { const r = beatP.res; beatP = null; r(); render(); break; }
    case 'opt': answer(b.dataset.id); break;
    case 'skip': answer(null); break;
    case 'card': if (!game) break; cardSheet(+b.dataset.uid); break;
    case 'choose': closeSheet(); answer(+b.dataset.uid); break;
    case 'kinfo': { const k = KINGDOM.find((x) => x.k === b.dataset.k); sheet(`<h2>${esc(k.name)}</h2><p>Kingdom Card. ${esc(k.text)}</p><p>Win it by Bidding in Spring. While it's on your board, a card of yours guards it; a rival Bid higher than the guard's Strength can steal it.</p>`); break; }
    case 'loc': { const l = LOCATIONS[b.dataset.l]; sheet(`<h2>${l.name}</h2><p><b>${l.inf} Influence</b> when you win this Region and pick this Location.</p><p>${esc(l.text)}</p><p>If your Herald is here too: +1 Influence, and steal 1 from every rival Herald here.</p>`); break; }
    case 'council': { const c = COUNCILS.find((x) => x.id === b.dataset.c); const cards = S.councils[c.id]; sheet(`<h2>${c.name}</h2><p>${esc(c.text)}</p><h3>Cards here</h3><div class="cards">${cards.map((e) => cardHTML(e.card, { sm: true })).join('') || '<p>None yet.</p>'}</div>`); break; }
    case 'discard': sheet(`<h2>Your Discard Pile</h2><p>These shuffle back into your Deck when it runs out (Attrition).</p><div class="cards">${S.players[ME].discard.map((c) => cardHTML(c, { sm: true })).join('') || '<p>Empty.</p>'}</div><h3>Lost Pile (gone for good)</h3><div class="cards">${S.lost.map((c) => cardHTML(c, { sm: true })).join('') || '<p>Empty.</p>'}</div>`); break;
  }
});

function confirmQuit() { return !game || S.over || confirm('Quit this game?'); }

function answer(v) {
  if (!pending) return;
  const r = pending.res; pending = null; r(v); render();
}

function cardList() {
  const row = (c) => `<li><b>${c.name}</b>${c.n > 1 ? ` ×${c.n}` : ''}: ${c.hq ? '' : `Strength ${c.str}`}${c.votes ? `, ${c.votes} Votes` : ''}${c.lore ? `, ${c.lore} Lore` : ''}${c.cost ? `, costs ${c.cost} Lore` : ''}${c.traits.length ? `, ${c.traits.map(cap).join(', ')}` : ''}${c.cmd ? `, ${cap(c.cmd)}` : ''}. ${esc(c.text)}</li>`;
  return `<h2>Stand-in cards</h2><p>These made-up cards let you practise the real game flow. They'll be replaced with the real cards.</p>
  <h3>Starting deck (14)</h3><ul>${STARTER.map(row).join('')}</ul>
  <h3>Site of Power (5)</h3><ul>${SITE.map(row).join('')}</ul>
  <h3>Kingdom Cards (3 of each)</h3><ul>${KINGDOM.map((k) => `<li><b>${k.name}</b>: ${esc(k.text)}</li>`).join('')}</ul>
  <h3>Locations</h3><ul>${Object.values(LOCATIONS).map((l) => `<li><b>${l.name}</b>: ${l.inf} Influence. ${esc(l.text)}</li>`).join('')}</ul>`;
}

setup();
