import { Game, regionName, locName, councilName, kText } from './engine.js';
import { aiAnswer } from './ai.js';
import { COACH } from './coach.js';
import { CARDS, FACTIONS, REGIONS, LOCATIONS, COUNCILS, ARCH } from './data.js';
import { RULES_HTML } from './rules.js';

const $app = document.getElementById('app');
const $sheet = document.getElementById('sheet');
const store = {
  get(k, d) { try { const v = localStorage.getItem('kc:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('kc:' + k, JSON.stringify(v)); } catch {} },
};
const BACK = (f) => `https://cards.eerieidolgames.com/cards/tokc/en-US/${f[0].toUpperCase() + f.slice(1)}_Reverse.webp`;

let cfg = { you: store.get('you', 'nobility'), them: store.get('them', 'clans'), rounds: store.get('rounds', 5), coach: store.get('coach', true) };
let game = null, S = null, ME = 0;
let pending = null, coachP = null, beatP = null;
let seen = new Set();

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : '');
const who = (pi) => (pi === ME ? 'You' : 'Computer');

// ---------------- setup screen ----------------
function setup() {
  game = null;
  const fac = (key) => `<div class="pick">${FACTIONS.map((f) => {
    const heir = CARDS.factions[f.id].find((c) => c.num === 14);
    return `<button data-act="fac" data-key="${key}" data-id="${f.id}" class="${cfg[key] === f.id ? 'on' : ''}"><span class="swatch" style="background:${f.color}"></span>${f.name}<small>Heir: ${esc(heir.name)}</small></button>`;
  }).join('')}</div>`;
  $app.innerHTML = `<div class="setup">
    <h1>King's Crown</h1>
    <div class="tag">Learn to play <i>The Old King's Crown</i> one season at a time, with a coach explaining each step — using the real cards.</div>
    <h3>Your faction</h3>${fac('you')}
    <h3>Computer opponent</h3>${fac('them')}
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
      <button data-act="coach" data-on="0" class="${!cfg.coach ? 'on' : ''}">Coach off<small>Just the prompts</small></button>
    </div>
    <button class="big" data-act="start">Start the game</button>
    <button class="link" data-act="rules">Read the rules overview</button>
    <button class="link" data-act="browse">Browse the cards</button>
    <div class="note">Unofficial fan-made learning aid. Card text and art © Eerie Idol Games, loaded from the <a href="https://library.eerieidolgames.com/" target="_blank" rel="noopener">Eerie Card Library</a>. Base game only (no Wild Kingdom or solo mode yet).</div>
  </div>`;
}

function start() {
  if (cfg.you === cfg.them) cfg.them = FACTIONS.find((f) => f.id !== cfg.you).id;
  seen = new Set(); pending = coachP = beatP = null;
  const seed = (Math.random() * 2 ** 31) | 0;
  game = new Game({ seed, factions: [cfg.you, cfg.them], humans: [true, false], rounds: cfg.rounds }, io);
  ME = 0; S = game.s;
  window.scrollTo(0, 0);
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
    if (!cfg.coach || !COACH[key]) return;
    return new Promise((res) => { coachP = { key, res }; render(); });
  },
  beat(text) { return new Promise((res) => { beatP = { text, res }; render(); }); },
};

let raf = 0;
function scheduleRender() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }

// ---------------- cards ----------------
function cardHTML(c, { cls = '', sm = false } = {}) {
  const inf = c.inf ? `<span class="cinf">${c.inf}◉</span>` : '';
  return `<button class="card ${sm ? 'sm' : ''} ${cls}" data-act="card" data-uid="${c.uid}">
    <img src="${c.image}" alt="" loading="lazy" draggable="false">
    <span class="cst">${c.hq ? 'HQ' : game ? game.str(c) : c.str}</span>${inf}
    <span class="cnm">${esc(c.name)}</span></button>`;
}
const backHTML = (f, sm = true) => `<div class="card back ${sm ? 'sm' : ''}"><img src="${BACK(f)}" alt="" loading="lazy"></div>`;

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
    <div class="players">${s.players.map((p) => `<button class="pchip" data-act="player" data-pi="${p.i}" style="border-color:${p.color}">
      <span class="inf">${p.inf}</span><div class="nm">${who(p.i)} · ${esc(p.short)}</div>
      <div class="stats">Hand ${p.hand.length}/${game.maxHand(p)} · Deck ${p.deck.length} · Lore ${p.lore} · Supp. ${p.supporters}${s.favour && s.favour.pi === p.i ? ` · ♛ Favour ${'I'.repeat(s.favour.val)}` : ''}${s.order[0] === p.i ? ' · 1st' : ''}</div></button>`).join('')}</div>
  </div>`;

  const bids = s.bids ? `<div class="minirow">Bids: ${Object.entries(s.bids).map(([pi, c]) => `<span>${who(+pi)}: <b>${esc(c.name)} (${s.bstr ? s.bstr[pi] : c.str})</b></span>`).join('')}</div>` : '';
  const road = `<div class="section"><div class="lbl"><span>The Great Road — Kingdom Cards</span><span>Deck ${s.kdeck.length}</span></div>
    <div class="road">${s.road.map((k) => (k ? kcardHTML(k) : `<div class="kcard empty"></div>`)).join('')}</div>${bids}</div>`;

  const prompt = pending && pending.prompt;
  const map = `<div class="section"><div class="lbl"><span>The Map</span><button class="link sm" data-act="lost">Lost Pile ${s.lost.length}</button></div>${REGIONS.map((r) => {
    const R = s.regions[r.id];
    const mk = s.clashOrder.indexOf(r.id);
    const cur = s.current === r.id || (prompt && prompt.region === r.id);
    const res = R.winner != null ? `<span class="result">Won by ${who(R.winner).toLowerCase()}</span>` : R.tie ? '<span class="result">Tie</span>' : '';
    const kOn = R.ks.map((k) => `<button class="ktag" data-act="kinfo" data-uid="${k.card.uid}" style="border-color:${s.players[k.owner].color}">${esc(k.card.name)}</button>`).join('') + (R.martial != null ? `<span class="ktag">Martial Law</span>` : '');
    const locs = r.locs.map((l) => {
      const hs = s.players.filter((p) => p.herald === l).map((p) => `<span class="herald" style="background:${p.color}">${p.i === ME ? 'Your' : 'CPU'} Herald</span>`).join('');
      const mks = s.marks[l] ? s.players.filter((p) => s.marks[l][p.i]).map((p) => `<span class="herald" style="background:${p.color};opacity:.75">${s.marks[l][p.i]} marker${s.marks[l][p.i] > 1 ? 's' : ''}</span>`).join('') : '';
      const lk = (s.locKs[l] || []).map((k) => `<span class="herald" style="background:#5a4a33">${esc(k.card.name)}</span>`).join('');
      return `<button class="loc ${R.claimed === l ? 'claimed' : ''}" data-act="loc" data-l="${l}"><span class="li">${LOCATIONS[l].inf}◉</span><div class="ln">${LOCATIONS[l].name}</div>${esc(short(LOCATIONS[l].text))}<div>${hs}${mks}${lk}</div></button>`;
    }).join('');
    const sides = s.players.map((p) => {
      const cs = R.cards.filter((c) => c.card.owner === p.i).map((c) => {
        if (!c.up && p.i !== ME) return backHTML(p.faction);
        return cardHTML(c.card, { sm: true, cls: `${!c.up ? 'down' : ''} ${c.used && s.current !== r.id ? 'used' : ''}` });
      }).join('');
      const sup = R.sup[p.i] ? `<span class="sup">+${R.sup[p.i]} Supporter${R.sup[p.i] > 1 ? 's' : ''}</span>` : '';
      return `<div class="side" style="border-top:3px solid ${p.color}"><div class="who"><span>${who(p.i)}${sup}</span></div><div class="cards">${cs}</div></div>`;
    }).join('');
    return `<div class="region ${cur ? 'cur' : ''}"><div class="rhead">${mk >= 0 ? `<span class="marker">${['I', 'II', 'III'][mk]}</span>` : ''}<h3>${r.name}</h3>${res}</div>
      ${kOn ? `<div class="ktags">${kOn}</div>` : ''}<div class="locs">${locs}</div><div class="lane">${sides}</div></div>`;
  }).join('')}</div>`;

  const councils = `<div class="section"><div class="lbl"><span>Councils (Votes)</span></div><div class="councils">${COUNCILS.map((c) => `<button class="council" data-act="council" data-c="${c.id}"><div class="cn">${c.name.replace('Council of ', '')}</div><div class="vt">${s.players.map((p) => `<span style="color:${p.color}">${p.i === ME ? 'You' : 'CPU'} ${game.votes(p.i, c.id)}</span>`).join('')}</div></button>`).join('')}</div></div>`;

  const boards = s.players.map((p) => {
    const slots = p.slots.map((k) => (k ? `<div class="slot">${kcardHTML(k.card)}${k.occ ? cardHTML(k.occ, { sm: true }) : ''}</div>` : `<div class="kcard empty">Empty Kingdom space</div>`)).join('');
    const supply = p.ksupply.length ? `<div class="minirow">In Supply: ${p.ksupply.map((k) => `<button class="ktag" data-act="kinfo" data-uid="${k.uid}">${esc(k.name)}</button>`).join('')}</div>` : '';
    const tactics = `<div class="minirow tactics">Tactics: ${p.tactics.map((t) => `<button class="ktag ${t.exhausted ? 'ex' : ''}" data-act="tactic" data-pi="${p.i}" data-k="${t.k}">${esc(t.name)}${t.markers ? ` (${t.markers})` : ''}</button>`).join('')}
      <button class="ktag fav" data-act="favour" data-f="${p.faction}">♛ ${esc(CARDS.favour[p.faction].name)}</button></div>`;
    const extra = `<div class="minirow"><span>HQ: <b>${p.hq.map((c) => c.name).join(', ') || 'none'}</b></span><span>Discard <b>${p.discard.length}</b></span><span>Lost Supporters <b>${p.lostSup}</b></span><span>Markers <b>${p.markers}</b></span>${p.i === ME ? '<button class="link sm" data-act="discard">see Discard & Site of Power</button>' : ''}</div>`;
    return `<div class="section"><div class="lbl"><span style="color:${p.color}">${p.i === ME ? 'Your board' : 'Computer’s board'} — ${esc(p.name)}</span></div><div class="mine">
      <div class="slots">${slots}</div>${supply}${tactics}${extra}</div></div>`;
  }).join('');

  $app.innerHTML = `${top}<div class="game"><div class="main">${road}${map}${councils}${boards}</div>${dock(me)}</div>`;
  const focus = s.current || (prompt && prompt.region) || null;
  if (focus && focus !== lastFocus) {
    const el = $app.querySelector('.region.cur');
    const topH = $app.querySelector('.top').offsetHeight;
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - topH - 6, behavior: 'smooth' });
  }
  lastFocus = focus;
}
let lastFocus = null;
const short = (t) => (t.length > 64 ? t.slice(0, 62) + '…' : t);
const kcardHTML = (k) => `<button class="kcard" data-act="kinfo" data-uid="${k.uid}"><div class="kn">${esc(k.name)}</div><span class="suit">${councilName(k.suit).replace('Council of ', '')}</span> ${esc(short(kText(k)))}</button>`;

function dock(me) {
  const s = S;
  let head = '';
  if (s.over) {
    const w = s.players[s.result.winner];
    head = `<div class="beat"><h3>${w.i === ME ? 'You win the crown!' : 'The computer wins the crown.'}</h3>Final Influence: ${s.players.map((p) => `${who(p.i)} ${p.inf}`).join(' · ')}.</div>
      <div class="opts"><button class="opt main" data-act="again">Play again</button><button class="opt" data-act="newsetup">Change factions</button><button class="opt" data-act="log">Read the game log</button></div>`;
  } else if (coachP) {
    const c = COACH[coachP.key];
    head = `<div class="coach"><h3>${c.title}</h3>${c.text}</div><div class="opts"><button class="opt main" data-act="coachok">Got it</button></div>`;
  } else if (beatP) {
    head = `<div class="beat">${esc(beatP.text)}</div><div class="opts"><button class="opt main" data-act="beatok">Continue</button></div>`;
  } else if (pending) {
    const p = pending.prompt;
    head = s.peek ? `<div class="beat">👁 ${esc(s.peek)}</div>` : '';
    head += `<div class="ptext"><span class="who">Your move:</span> ${esc(p.text)}</div>`;
    if (p.options) head += `<div class="opts">${p.options.map((o) => `<button class="opt" data-act="opt" data-id="${esc(o.id)}">${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')}</div>`;
    if (p.cards) head += `<div class="waiting">Highlighted cards can be chosen — tap one to see it${p.optional ? ', or skip' : ''}.</div>${p.optional ? `<div class="opts"><button class="opt" data-act="skip">Skip</button></div>` : ''}`;
  } else head = `<div class="waiting">The computer is thinking…</div>`;
  const choosable = new Set(pending && pending.prompt.cards ? pending.prompt.cards : []);
  const extra = [];
  if (pending && pending.prompt.cards) for (const uid of choosable) if (!me.hand.some((c) => c.uid === uid)) { const c = findCard(uid); if (c) extra.push(c); }
  const hand = me.hand.map((c) => cardHTML(c, { cls: pending && pending.prompt.cards ? (choosable.has(c.uid) ? 'ok' : 'no') : '' })).join('');
  const more = extra.length ? `<div class="lbl dl">Other cards you can choose</div><div class="hand">${extra.map((c) => cardHTML(c, { cls: 'ok' })).join('')}</div>` : '';
  return `<div class="dock">${head}${more}<div class="lbl dl">Your hand (${me.hand.length})</div><div class="hand">${hand || '<span class="waiting">No cards in hand.</span>'}</div></div>`;
}

function findCard(uid) {
  const s = S;
  for (const p of s.players) {
    for (const z of [p.hand, p.deck, p.discard, p.site, p.hq]) { const c = z.find((x) => x.uid === uid); if (c) return c; }
    for (const k of p.slots) if (k && k.occ && k.occ.uid === uid) return k.occ;
  }
  for (const r of Object.values(s.regions)) for (const c of r.cards) if (c.card.uid === uid) return c.card;
  for (const e of Object.values(s.councils).flat()) if (e.card.uid === uid) return e.card;
  return s.lost.find((c) => c.uid === uid) || s.burned.find((c) => c.uid === uid);
}
function findKingdom(uid) {
  const s = S;
  const all = [...s.road.filter(Boolean), ...s.kdiscard, ...s.players.flatMap((p) => [...p.slots.filter(Boolean).map((x) => x.card), ...p.ksupply]),
    ...Object.values(s.regions).flatMap((r) => r.ks.map((k) => k.card)), ...Object.values(s.locKs).flat().map((k) => k.card)];
  return all.find((k) => k.uid === uid);
}

// ---------------- sheets ----------------
function sheet(html) { $sheet.innerHTML = `<div class="inner"><button class="iconbtn close" data-act="close">Close</button>${html}</div>`; $sheet.classList.remove('hidden'); $sheet.scrollTop = 0; }
function closeSheet() { $sheet.classList.add('hidden'); $sheet.innerHTML = ''; }

const TRAIT = { resilient: 'if Eliminated, goes to your Discard Pile instead of the Lost Pile.', invulnerable: "can't be Eliminated.", pathfinder: 'after a Journey, goes to your Discard Pile instead of the Lost Pile.' };
const CMD = {
  deadly: 'Night: Eliminates every opposing Active card in the Clash.', ambush: 'Day: add a card from your hand face down to the Clash (revealed at the end of the Day).',
  retreat: 'Day: return your Active cards in the Region to your hand and your Supporters there to your board.', flank: "Day: move this card to a Region that hasn't fought yet; it's Active there.",
  rally: 'Autumn: return Active cards to your hand.', deploy: 'Autumn (from your hand): place it face up by a Region with Influence on it. Cards with Influence stay through Winter, losing 1, so it fights next Summer too.',
};

function cardSheet(uid) {
  const c = findCard(uid);
  if (!c) return;
  const p = pending && pending.prompt;
  const can = p && p.cards && p.cards.includes(uid);
  const verb = p ? { bid: 'Bid with this card', place: `Place by the ${p.region ? regionName(p.region) : ''}`, ambushCard: 'Ambush with this card', tieCard: 'Add this card', governCard: 'Govern with this card', journeyCard: 'Journey with this card', castleGovern: 'Govern with this card' }[p.key] : null;
  const rid = game.regionOf(c);
  const facts = [];
  if (!c.hq) facts.push(`<li><b>Strength ${game.str(c)}</b>${c.arch ? ` · ${ARCH[c.arch]}` : ''} — counts in Bids and Clashes.</li>`);
  if (game.votesOf(c)) facts.push(`<li><b>${game.votesOf(c)} Vote${game.votesOf(c) > 1 ? 's' : ''}</b> — it can Govern (go into a Council).</li>`);
  if (game.loreOf(c)) facts.push(`<li><b>${game.loreOf(c)} Lore</b> — it can Journey for Lore.</li>`);
  for (const t of game.traits(c, rid)) facts.push(`<li><b>${cap(t)}</b> — ${TRAIT[t]}</li>`);
  for (const x of game.cmds(c, rid)) facts.push(`<li><b>${cap(x.cmd)}${x.arg ? ` (${x.arg})` : ''}</b> — ${CMD[x.cmd] || ''}${x.cmd === 'rally' ? (x.arg === 'self' ? ' (Just this card.)' : ' (Any two of your Active cards.)') : ''}</li>`);
  if (c.cost) facts.push(`<li>Costs <b>${c.cost} Lore</b> at your Site of Power.</li>`);
  if (c.inf) facts.push(`<li>Has <b>${c.inf} Influence</b> on it, so it stays through Winter.</li>`);
  sheet(`<div class="detail"><img class="cimg" src="${c.image}" alt="${esc(c.name)}"><div><h2>${esc(c.name)}</h2>${c.text ? `<p>${esc(c.text)}</p>` : ''}<ul>${facts.join('')}</ul></div></div>
    ${can ? `<button class="big" data-act="choose" data-uid="${uid}">${verb || 'Choose this card'}</button>` : ''}`);
}
function kSheet(k) {
  sheet(`<div class="detail kd"><img class="cimg wide" src="${k.image}" alt="${esc(k.name)}"><div><h2>${esc(k.name)}</h2><p><b>${councilName(k.suit).replace('Council of ', '')} suit</b> Kingdom Card.</p><p>${esc(kText(k))}</p>
    <p class="dim">Win it by Bidding in Spring. While it's on your board, the card you Bid guards it: a rival Bid higher than the guard's Strength can steal it. Actions on Kingdom Cards can be used once per Round in the season shown.</p></div></div>`);
}
function logSheet() { sheet(`<h2>Game log</h2><div class="log">${S.log.slice().reverse().map((l) => `<div class="${l.cls}">${esc(l.msg)}</div>`).join('')}</div>`); }
function tacticSheet(t, p) {
  sheet(`<div class="detail kd"><img class="cimg wide" src="${t.image}" alt="${esc(t.name)}"><div><h2>${esc(t.name)}</h2><p>${esc(p.name)} Tactic${t.exhausted ? ' — <b>exhausted</b>' : t.markers ? ` — ${t.markers} marker(s) left` : ' — ready'}.</p>
    ${t.text ? `<p>${esc(t.text)}</p>` : ''}${t.rules.map((r) => `<p><b>${cap(r.season)}:</b> ${esc(r.text)}</p>`).join('')}
    <p class="dim">Each Tactic can be used once (it then flips to Exhausted). Tactics with markers can be used once per marker.</p></div></div>`);
}

function browse(f = 'nobility') {
  const cards = CARDS.factions[f];
  sheet(`<h2>Card browser</h2><div class="pick tabs">${FACTIONS.map((x) => `<button data-act="browse" data-f="${x.id}" class="${x.id === f ? 'on' : ''}">${x.name.replace('The ', '')}</button>`).join('')}<button data-act="browse" data-f="kingdom" class="${f === 'kingdom' ? 'on' : ''}">Kingdom</button></div>
    ${f === 'kingdom' ? `<div class="gallery wide">${CARDS.kingdom.map((k) => `<a href="${k.image}" target="_blank" rel="noopener"><img src="${k.image}" loading="lazy" alt="${esc(k.name)}"></a>`).join('')}</div>`
      : `<h3>Starting deck (14)</h3><div class="gallery">${cards.filter((c) => c.num <= 14).map((c) => `<a href="${c.image}" target="_blank" rel="noopener"><img src="${c.image}" loading="lazy" alt="${esc(c.name)}"></a>`).join('')}</div>
      <h3>Site of Power (bought with Lore)</h3><div class="gallery">${cards.filter((c) => c.num >= 15).map((c) => `<a href="${c.image}" target="_blank" rel="noopener"><img src="${c.image}" loading="lazy" alt="${esc(c.name)}"></a>`).join('')}</div>
      <h3>Tactics & Kingdom's Favour</h3><div class="gallery wide">${[...CARDS.tactics[f], CARDS.favour[f]].map((c) => `<a href="${c.image}" target="_blank" rel="noopener"><img src="${c.image}" loading="lazy" alt="${esc(c.name)}"></a>`).join('')}</div>`}`);
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
    case 'browse': browse(b.dataset.f); break;
    case 'log': logSheet(); break;
    case 'close': closeSheet(); break;
    case 'menu': sheet(`<h2>Menu</h2><div class="opts">
      <button class="opt" data-act="togglecoach">${cfg.coach ? 'Turn coach off' : 'Turn coach on'}</button>
      <button class="opt" data-act="replaytips">Show all coach tips again</button>
      <button class="opt" data-act="browse">Browse the cards</button>
      <button class="opt" data-act="quit">Quit to setup</button></div>`); break;
    case 'togglecoach': cfg.coach = !cfg.coach; store.set('coach', cfg.coach); closeSheet(); render(); break;
    case 'replaytips': seen = new Set(); cfg.coach = true; closeSheet(); render(); break;
    case 'quit': closeSheet(); if (!game || S.over || confirm('Quit this game?')) setup(); break;
    case 'coachok': { const r = coachP.res; coachP = null; r(); render(); break; }
    case 'beatok': { const r = beatP.res; beatP = null; r(); render(); break; }
    case 'opt': answer(b.dataset.id); break;
    case 'skip': answer(null); break;
    case 'card': if (game) cardSheet(+b.dataset.uid); break;
    case 'choose': closeSheet(); answer(+b.dataset.uid); break;
    case 'kinfo': { const k = findKingdom(+b.dataset.uid); if (k) kSheet(k); break; }
    case 'tactic': { const p = S.players[+b.dataset.pi]; tacticSheet(p.tactics.find((t) => t.k === b.dataset.k), p); break; }
    case 'favour': { const f = CARDS.favour[b.dataset.f]; sheet(`<div class="detail kd"><img class="cimg wide" src="${f.image}" alt=""><div><h2>${esc(f.name)}</h2><p>Kingdom's Favour action. Whoever claims the Harvest Field takes the Kingdom's Favour (set to III). Each use rotates it down; after I it goes back to the Harvest Field. It also wins tied games.</p>${f.rules.map((r) => `<p><b>${cap(r.season)}:</b> ${esc(r.text)}</p>`).join('')}</div></div>`); break; }
    case 'player': { const p = S.players[+b.dataset.pi]; sheet(`<h2>${esc(p.name)}</h2><p>${who(p.i)}. Influence <b>${p.inf}</b>, Lore <b>${p.lore}</b>, Hand Size <b>${game.maxHand(p)}</b>, Supporters on board <b>${p.supporters}</b> (Lost: ${p.lostSup}).</p><h3>Discard Pile</h3><div class="cards">${p.discard.map((c) => cardHTML(c, { sm: true })).join('') || '<p>Empty.</p>'}</div><h3>Site of Power — ${esc(p.siteName)}</h3><div class="cards">${p.site.map((c) => cardHTML(c, { sm: true })).join('') || '<p>Empty.</p>'}</div>`); break; }
    case 'loc': { const l = LOCATIONS[b.dataset.l]; sheet(`<div class="detail kd"><img class="cimg wide" src="${l.image}" alt=""><div><h2>${l.name}</h2><p><b>${l.inf} Influence</b> when you win this Region and claim this Location.</p><p>${esc(l.text)}</p><p>If your Herald is here too: +1 Influence, and steal 1 from every rival Herald here. Council of Relics cards can be cashed in then too.</p></div></div>`); break; }
    case 'council': { const c = COUNCILS.find((x) => x.id === b.dataset.c); const cards = S.councils[c.id]; sheet(`<div class="detail kd"><img class="cimg wide" src="${c.image}" alt=""><div><h2>${c.name}</h2><p>${esc(c.text)}</p></div></div><h3>Cards here</h3><div class="cards">${cards.map((e) => cardHTML(e.card, { sm: true })).join('') || '<p>None yet.</p>'}</div>`); break; }
    case 'lost': sheet(`<h2>Lost Pile</h2><p>Cards removed from play — they don't come back unless a card says so.</p><div class="cards">${S.lost.map((c) => cardHTML(c, { sm: true })).join('') || '<p>Empty.</p>'}</div>`); break;
    case 'discard': { const p = S.players[ME]; sheet(`<h2>Your Discard Pile</h2><p>These shuffle back into your Deck when it runs out (Attrition).</p><div class="cards">${p.discard.map((c) => cardHTML(c, { sm: true })).join('') || '<p>Empty.</p>'}</div><h3>Site of Power — ${esc(p.siteName)}</h3><p>Buy these with Lore right when you gain it.</p><div class="cards">${p.site.map((c) => cardHTML(c, { sm: true })).join('') || '<p>Empty — at the end of the game every 2 Lore you have is worth 1 Influence.</p>'}</div>`); break; }
  }
});

function answer(v) {
  if (!pending) return;
  const r = pending.res; pending = null; S.peek = null; r(v); render();
}

setup();
