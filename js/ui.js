// Board view: the Map window built from the real Location tiles, card spaces beside each
// Region, the Great Road and Councils above, your Kingdom spaces below, and a fanned hand
// you drag cards from.
import { Game, regionName, councilName, kText } from './engine.js';
import { aiAnswer } from './ai.js';
import { COACH } from './coach.js';
import { CARDS, FACTIONS, REGIONS, LOCATIONS, COUNCILS, ARCH } from './data.js';
import { RULES_HTML } from './rules.js';
import { morph } from './morph.js';

const $app = document.getElementById('app');
const $sheet = document.getElementById('sheet');
const store = {
  get(k, d) { try { const v = localStorage.getItem('kc:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('kc:' + k, JSON.stringify(v)); } catch {} },
};
const BACK = (f) => `https://cards.eerieidolgames.com/cards/tokc/en-US/${f[0].toUpperCase() + f.slice(1)}_Reverse.webp`;
const RIDS = REGIONS.map((r) => r.id);

let cfg = { you: store.get('you', 'nobility'), them: store.get('them', 'clans'), rounds: store.get('rounds', 5), coach: store.get('coach', true) };
let game = null, S = null, ME = 0;
let pending = null, coachP = null, beatP = null, showOpts = false, autoNext = null, toast = '';
let seen = new Set();

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : '');
const who = (pi) => (pi === ME ? 'You' : 'Computer');
const SEASON = { year: 'Start of the Year', spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter', end: 'Game over', setup: '' };

// ---------------- setup screen ----------------
function setup() {
  game = null;
  document.querySelector('.dock')?.remove();
  document.querySelector('.cmodal')?.remove();
  const fac = (key) => `<div class="pick">${FACTIONS.map((f) => {
    const heir = CARDS.factions[f.id].find((c) => c.num === 14);
    return `<button data-act="fac" data-key="${key}" data-id="${f.id}" class="${cfg[key] === f.id ? 'on' : ''}"><span class="swatch" style="background:${f.color}"></span>${f.name}<small>Heir: ${esc(heir.name)}</small></button>`;
  }).join('')}</div>`;
  $app.innerHTML = `<div class="setup">
    <h1>King's Crown</h1>
    <div class="tag">Learn to play <i>The Old King's Crown</i> on the real board with the real cards, with a coach explaining each step.</div>
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
  seen = new Set(); pending = coachP = beatP = autoNext = null; showOpts = false;
  game = new Game({ seed: (Math.random() * 2 ** 31) | 0, factions: [cfg.you, cfg.them], humans: [true, false], rounds: cfg.rounds }, io);
  ME = 0; S = game.s;
  window.scrollTo(0, 0);
  render();
  game.run().then(() => render()).catch((e) => { console.error(e); alert('Something went wrong: ' + e.message); });
}

const io = {
  update(s) { S = s; scheduleRender(); },
  ask(pi, prompt, s, g) {
    if (!s.players[pi].human) return aiAnswer(pi, prompt, s, g);
    if (autoNext && autoNext.key === prompt.key && prompt.options?.some((o) => o.id === autoNext.id)) { const id = autoNext.id; autoNext = null; return id; }
    autoNext = null;
    return new Promise((res) => { pending = { prompt, res }; showOpts = false; render(); });
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

// ---------------- what the current prompt lets you tap or drop on ----------------
function targets() {
  const t = { tiles: {}, rows: {}, road: {}, oppSlots: {}, councils: {}, rest: [], drop: null };
  const p = pending && !coachP && !beatP ? pending.prompt : null;
  if (!p) return t;
  if (p.options) for (const o of p.options) {
    let m;
    if (LOCATIONS[o.id]) t.tiles[o.id] = o.id;
    else if (RIDS.includes(o.id)) t.rows[o.id] = o.id;
    else if ((m = /^sup:(\w+)$/.exec(o.id))) t.rows[m[1]] = o.id;
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
  const inf = c.inf ? `<span class="cinf">${c.inf}◉</span>` : '';
  return `<button class="card ${mini ? 'mini' : ''} ${cls}" data-act="card" data-uid="${c.uid}" style="${style}"><img src="${c.image}" alt="${esc(c.name)}" draggable="false">${inf}<span class="cnm">${esc(c.name)}</span></button>`;
}
const backHTML = (f, mini = true) => `<div class="card back ${mini ? 'mini' : ''}"><img src="${BACK(f)}" alt="" draggable="false"></div>`;
const kcHTML = (k, cls = '', extra = '') => `<button class="kc ${cls}" data-act="kinfo" data-uid="${k.uid}" ${extra}><img src="${k.image}" alt="${esc(k.name)}"><span class="kn">${esc(k.name)}</span></button>`;

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
      <button class="ibtn" data-act="rules" aria-label="Rules">?</button><button class="ibtn" data-act="log" aria-label="Log">☰</button><button class="ibtn" data-act="menu" aria-label="Menu">⚙</button></div>
      ${chips.length ? `<div class="more">${chips.join('')}</div>` : ''}
      ${toast ? `<div class="more"><span class="chip">${esc(toast)}</span></div>` : ''}</div>`;

  // season track (left) and the opponent's box (right), like the real table
  const SEAS = [['year', '♛', 'Start of the Year'], ['spring', '✿', 'Spring'], ['summer', '☀', 'Summer'], ['autumn', '❦', 'Autumn'], ['winter', '❄', 'Winter']];
  const track = `<div class="track"><div class="seas">${SEAS.map(([id, ic, n]) => `<span class="sea ${s.season === id ? 'on' : ''}" title="${n}">${ic}</span>`).join('')}</div>
    <div class="rounds">${Array.from({ length: s.rounds }, (_, i) => `<span class="rd ${i + 1 === s.round ? 'on' : i + 1 < s.round ? 'past' : ''}">${['I', 'II', 'III', 'IV', 'V', 'VI'][i]}</span>`).join('')}</div>
    <div class="order">Turn order: ${s.order.map((i) => `<b style="color:${s.players[i].color}">${i === ME ? 'You' : 'CPU'}</b>`).join(' → ')}</div></div>`;
  const oppHTML = opp ? `<div class="obox" style="--fc:${opp.color}">
      <button class="otop" data-act="player" data-pi="${opp.i}"><span class="emb" style="background-image:url('${BACK(opp.faction)}')"></span>
        <span class="onum">${opp.inf}</span>
        <span class="ores"><span>◉ ${opp.inf}</span><span>✒ ${opp.lore}</span><span>⚑ ${opp.supporters}</span></span>
        <span class="backs">${opp.hand.map(() => `<img src="${BACK(opp.faction)}" alt="">`).join('')}</span></button>
      ${[...opp.slots.map((sl, si) => sl && { k: sl.card, g: sl.occ, opt: T.oppSlots[`${opp.i}:${si}`] }).filter(Boolean), ...opp.ksupply.map((k) => ({ k }))].map((x) => `<button class="okc ${x.opt ? 'pickable' : ''}" data-act="kinfo" data-uid="${x.k.uid}" ${x.opt ? `data-opt="${x.opt}"` : ''}><span class="suit ${x.k.suit}"></span><span class="nm">${esc(x.k.name)}</span>${x.g ? `<span class="g">${x.g.str}</span>` : ''}</button>`).join('') || '<div class="okc none">No Kingdom Cards</div>'}
      <div class="ofoot">${esc(opp.short)}${s.favour && s.favour.pi === opp.i ? ` · ♛${'I'.repeat(s.favour.val)}` : ''} · Deck ${opp.deck.length}</div></div>` : '';
  const top = `<div class="toprow">${track}${oppHTML}</div>`;

  // Councils as text panels along the top of the window
  const CSHORT = { relics: 'Herald Reward: discard your cards here for 1◉ per Vote.', secrets: 'Autumn: place a marker per Vote on Locations. 4 on one = claim its reward.', oaths: 'Autumn: get a Supporter back per Vote (+1 if you have the most).' };
  const councils = `<div class="cpanels">${COUNCILS.map((c) => `<button class="cpanel ${T.councils[c.id] || (T.drop && T.drop.councils) ? 'pickable' : ''}" data-act="council" data-c="${c.id}" ${T.drop && T.drop.councils ? `data-drop="council:${c.id}"` : ''}>
      <span class="ctext">${CSHORT[c.id]}</span><span class="cname"><span class="suit ${c.id}"></span>${c.name.replace('Council of ', '')}</span>
      <span class="votes">${s.players.map((p) => `<span style="color:${p.color}">${p.i === ME ? 'You' : 'CPU'} ${game.votes(p.i, c.id)}</span>`).join('')}</span></button>`).join('')}</div>`;

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
    const pick = T.rows[r.id] || dropOK;
    const cur = s.current === r.id;
    const res = R.winner != null ? `<span class="res">${R.winner === ME ? '✓ yours' : '✗ theirs'}</span>` : R.tie ? '<span class="res">tie</span>' : '';
    const col = (p) => {
      const cs = R.cards.filter((c) => c.card.owner === p.i).map((c) => {
        if (!c.up && p.i !== ME) return backHTML(p.faction);
        return cardHTML(c.card, { mini: true, cls: `${!c.up ? 'down' : ''} ${c.used && !cur ? 'used' : ''} ${choosable.has(c.card.uid) ? 'ok' : ''}` });
      }).join('');
      const sup = R.sup[p.i] ? `<span class="sup">⚑${R.sup[p.i]}</span>` : '';
      return `<div class="sidecol" style="background:linear-gradient(${p.color}22, transparent)">${sup}<div class="stack">${cs}</div></div>`;
    };
    const tiles = r.locs.map((l) => {
      const hs = s.players.filter((p) => p.herald === l).map((p) => `<span class="herald" style="background:${p.color}">♛</span>`).join('');
      const mks = s.marks[l] ? s.players.filter((p) => s.marks[l][p.i]).map((p) => `<span class="mk" style="background:${p.color}">${s.marks[l][p.i]}</span>`).join('') : '';
      const lk = (s.locKs[l] || []).map((k) => `<span class="ktile">${esc(k.card.name)}</span>`).join('');
      return `<button class="tile ${T.tiles[l] ? 'pickable' : ''} ${R.claimed === l ? 'claimed' : ''}" data-act="tile" data-l="${l}" data-rid="${r.id}"><img src="${LOCATIONS[l].image}" alt="${LOCATIONS[l].name}"><span class="tokens">${hs}${mks}</span>${lk}</button>`;
    }).join('');
    const kOn = R.ks.map((k) => `<button data-act="kinfo" data-uid="${k.card.uid}" style="border-color:${s.players[k.owner].color}">${esc(k.card.name)}</button>`).join('') + (R.martial != null ? '<button>Martial Law</button>' : '');
    return `<div class="mrow ${pick ? 'pickable' : ''} ${cur ? 'cur' : ''}" data-act="row" data-rid="${r.id}" data-row="${r.id}" ${dropOK ? `data-drop="row:${r.id}"` : ''}>
      ${col(me)}<div class="tiles"><span class="rname">${mk >= 0 ? `<span class="cm">${['I', 'II', 'III'][mk]}</span>` : ''}${r.name}${res}</span>${tiles}${kOn ? `<div class="rks">${kOn}</div>` : ''}</div>${opp ? col(opp) : ''}</div>`;
  }).join('')}</div>`;

  // your board
  const mine = `<div class="mine" style="border-color:${me.color}"><div class="hdr"><span>Your Tactics</span><button class="chip" data-act="discard">Discard · Site of Power</button></div>
    <div class="chips">${me.ksupply.map((k) => `<button class="chip" data-act="kinfo" data-uid="${k.uid}">${esc(k.name)}</button>`).join('')}${me.hq.map((c) => `<button class="chip" data-act="card" data-uid="${c.uid}">HQ: ${esc(c.name)}</button>`).join('')}
      ${me.tactics.map((t) => `<button class="chip ${t.exhausted ? 'ex' : ''}" data-act="tactic" data-pi="${me.i}" data-k="${t.k}">${esc(t.name)}${t.markers ? ` (${t.markers})` : ''}</button>`).join('')}
      <button class="chip fav" data-act="favour" data-f="${me.faction}">♛ ${esc(CARDS.favour[me.faction].name)}${s.favour && s.favour.pi === ME ? ' ' + 'I'.repeat(s.favour.val) : ''}</button></div></div>`;

  morph($app, `<div class="table">${banner}${top}${councils}${map}${road}${mine}</div>`);
  renderDock(me, T, choosable);
  const focus = s.current || (prompt && prompt.region) || null;
  if (focus && focus !== lastFocus) {
    const el = $app.querySelector(`.mrow[data-row="${focus}"]`);
    const topH = $app.querySelector('.banner').offsetHeight;
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - topH - 10, behavior: 'smooth' });
  }
  lastFocus = focus;
}
let lastFocus = null;

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
  const fav = s.favour && s.favour.pi === ME ? `<div class="stat"><i>♛</i>${'I'.repeat(s.favour.val)}<small>Favour</small></div>` : '';
  const slots = `<div class="slots">${me.slots.map((sl) => (sl ? `<div class="slot full">${kcHTML(sl.card)}${sl.occ ? cardHTML(sl.occ, { cls: choosable.has(sl.occ.uid) ? 'ok' : '' }) : ''}</div>` : '<div class="slot"><span class="empty">Kingdom slot</span></div>')).join('')}</div>`;
  // the coach is a pop-up whose button is always on screen; only its text scrolls
  let modal = document.querySelector('.cmodal');
  if (coachP) {
    if (!modal) { modal = document.createElement('div'); modal.className = 'cmodal'; document.body.appendChild(modal); }
    const c = COACH[coachP.key];
    if (modal.dataset.key !== coachP.key) { modal.dataset.key = coachP.key; modal.innerHTML = `<div class="cbox"><h3>${c.title}</h3><div class="cbody">${c.text}</div><button class="opt main" data-act="coachok">Got it</button></div>`; }
  } else if (modal) modal.remove();
  morph(dock, `<div class="dockin">${panel}<div class="handrow"><div class="hand">${hand || '<span class="empty">No cards in hand</span>'}</div>${slots}</div>
    <div class="stats"><div class="stat fac"><span class="emb" style="background-image:url('${BACK(me.faction)}')"></span><span class="rdb">${['I', 'II', 'III', 'IV', 'V', 'VI'][Math.min(s.round, s.rounds) - 1]}</span></div><div class="stat"><i>◉</i>${me.inf}<small>Influence</small></div><div class="stat"><i>✒</i>${me.lore}<small>Lore</small></div>
      <div class="stat"><i>⚑</i>${me.supporters}<small>Supporters</small></div><div class="stat"><i>✋</i>${me.hand.length}/${game.maxHand(me)}<small>Hand</small></div>
      <button class="stat" data-act="discard"><i>▤</i>${me.deck.length}<small>Deck</small></button><button class="stat" data-act="discard"><i>♻</i>${me.discard.length}<small>Discard</small></button>
      <button class="stat" data-act="lost"><i>✝</i>${s.lost.filter((c) => c.owner === ME).length}<small>Lost</small></button><div class="stat"><i>▽</i>${me.tactics.filter((x) => !x.exhausted).length}<small>Tactics</small></div>${fav}</div></div>`);
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
  const all = [...s.road.filter(Boolean), ...s.kdiscard, ...s.kdeck, ...s.players.flatMap((p) => [...p.slots.filter(Boolean).map((x) => x.card), ...p.ksupply]),
    ...Object.values(s.regions).flatMap((r) => r.ks.map((k) => k.card)), ...Object.values(s.locKs).flat().map((k) => k.card)];
  return all.find((k) => k.uid === uid);
}

// ---------------- sheets ----------------
function sheet(html) { $sheet.innerHTML = `<div class="inner"><button class="close" data-act="close">Close</button>${html}</div>`; $sheet.classList.remove('hidden'); $sheet.scrollTop = 0; }
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
  if (!c.hq) facts.push(`<li><b>Strength ${game.str(c)}</b>${c.arch ? ` · ${ARCH[c.arch]}` : ''} — counts in Bids and Clashes.</li>`);
  if (game.votesOf(c)) facts.push(`<li><b>${game.votesOf(c)} Vote${game.votesOf(c) > 1 ? 's' : ''}</b> — it can Govern (go into a Council).</li>`);
  if (game.loreOf(c)) facts.push(`<li><b>${game.loreOf(c)} Lore</b> — it can Journey for Lore.</li>`);
  for (const t of game.traits(c, rid)) facts.push(`<li><b>${cap(t)}</b> — ${TRAIT[t]}</li>`);
  for (const x of game.cmds(c, rid)) facts.push(`<li><b>${cap(x.cmd)}${x.arg ? ` (${x.arg})` : ''}</b> — ${CMD[x.cmd] || ''}${x.cmd === 'rally' ? (x.arg === 'self' ? ' (Just this card.)' : ' (Any two of your Active cards.)') : ''}</li>`);
  if (c.cost) facts.push(`<li>Costs <b>${c.cost} Lore</b> at your Site of Power.</li>`);
  if (c.inf) facts.push(`<li>Has <b>${c.inf} Influence</b> on it, so it stays through Winter.</li>`);
  let btns = '';
  if (can && p.key === 'place') btns = `<div class="btnrow">${(p.regions || RIDS).map((r) => `<button class="big" data-act="placeIn" data-uid="${uid}" data-rid="${r}">${regionName(r)}</button>`).join('')}</div>`;
  else if (can) btns = `<div class="btnrow"><button class="big" data-act="choose" data-uid="${uid}">${VERB[p.key] || 'Choose this card'}</button></div>`;
  sheet(`<div class="detail"><img class="cimg" src="${c.image}" alt="${esc(c.name)}"><div><h2>${esc(c.name)}</h2>${c.text ? `<p>${esc(c.text)}</p>` : ''}<ul>${facts.join('')}</ul></div></div>${can && p.key === 'place' ? '<p class="dim">Place it face down by:</p>' : ''}${btns}`);
}
function kSheet(k, optId) {
  sheet(`<div class="detail kd"><img class="cimg wide" src="${k.image}" alt="${esc(k.name)}"><div><h2>${esc(k.name)}</h2><p><b>${councilName(k.suit).replace('Council of ', '')} suit</b> Kingdom Card.</p><p>${esc(kText(k))}</p>
    <p class="dim">Win it by Bidding in Spring. While it's on your board, the card you Bid guards it: a rival Bid higher than the guard's Strength can steal it. Actions on Kingdom Cards can be used once per Round in the season shown.</p></div></div>
    ${optId ? `<button class="big" data-act="opt" data-id="${esc(optId)}">${optId.startsWith('steal') ? 'Steal this card' : 'Take this card'}</button>` : ''}`);
}
function logSheet() { sheet(`<h2>Game log</h2><div class="log">${S.log.slice().reverse().map((l) => `<div class="${l.cls}">${esc(l.msg)}</div>`).join('')}</div>`); }
function tacticSheet(t, p) {
  sheet(`<div class="detail kd"><img class="cimg wide" src="${t.image}" alt="${esc(t.name)}"><div><h2>${esc(t.name)}</h2><p>${esc(p.name)} Tactic${t.exhausted ? ' — <b>exhausted</b>' : t.markers ? ` — ${t.markers} marker(s) left` : ' — ready'}.</p>
    ${t.text ? `<p>${esc(t.text)}</p>` : ''}${t.rules.map((r) => `<p><b>${cap(r.season)}:</b> ${esc(r.text)}</p>`).join('')}
    <p class="dim">Each Tactic can be used once (it then flips to Exhausted). Tactics with markers can be used once per marker. When one is usable, it shows up in that step's options.</p></div></div>`);
}
function browse(f = 'nobility') {
  const cards = CARDS.factions[f];
  const g = (list, wide) => `<div class="gallery ${wide ? 'wide' : ''}">${list.map((c) => `<a href="${c.image}" target="_blank" rel="noopener"><img src="${c.image}" loading="lazy" alt="${esc(c.name)}"></a>`).join('')}</div>`;
  sheet(`<h2>Card browser</h2><div class="pick tabs">${FACTIONS.map((x) => `<button data-act="browse" data-f="${x.id}" class="${x.id === f ? 'on' : ''}">${x.name.replace('The ', '')}</button>`).join('')}<button data-act="browse" data-f="kingdom" class="${f === 'kingdom' ? 'on' : ''}">Kingdom</button></div>
    ${f === 'kingdom' ? g(CARDS.kingdom, true) : `<h3>Starting deck (14)</h3>${g(cards.filter((c) => c.num <= 14))}<h3>Site of Power (bought with Lore)</h3>${g(cards.filter((c) => c.num >= 15))}<h3>Tactics & Kingdom's Favour</h3>${g([...CARDS.tactics[f], CARDS.favour[f]], true)}`}`);
}

// ---------------- answering ----------------
function answer(v) {
  if (!pending) return;
  const r = pending.res; pending = null; S.peek = null; toast = ''; showOpts = false; r(v); render();
}
function flash(t) { toast = t; render(); setTimeout(() => { if (toast === t) { toast = ''; render(); } }, 2200); }

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
  const el = e.target.closest('.hand .card, .sheetcards .card');
  if (!el || !pending) return;
  drag = { uid: +el.dataset.uid, el, x: e.clientX, y: e.clientY, moved: false, ghost: null, over: null };
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.moved) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 10) return;
    const p = pending && pending.prompt;
    if (!p || !p.cards || !p.cards.includes(drag.uid)) { drag = null; return; }
    drag.moved = true;
    drag.el.classList.add('dragging');
    drag.ghost = document.createElement('div'); drag.ghost.className = 'ghost';
    drag.ghost.innerHTML = drag.el.querySelector('img').outerHTML;
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
  if (dd.over) { dd.over.classList.remove('over'); drop(dd.uid, dd.over.dataset.drop); }
  else render();
});
document.addEventListener('pointercancel', () => { if (drag && drag.ghost) drag.ghost.remove(); drag = null; render(); });

// ---------------- taps ----------------
document.addEventListener('click', (e) => {
  if (Date.now() - justDragged < 350) return;
  const b = e.target.closest('[data-act]');
  if (!b) { if (e.target === $sheet) closeSheet(); return; }
  const a = b.dataset.act;
  const T = game ? targets() : null;
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
    case 'toggleopts': showOpts = !showOpts; render(); break;
    case 'coachok': { const r = coachP.res; coachP = null; r(); render(); break; }
    case 'beatok': { const r = beatP.res; beatP = null; r(); render(); break; }
    case 'opt': closeSheet(); answer(b.dataset.id); break;
    case 'skip': answer(null); break;
    case 'card': if (game) cardSheet(+b.dataset.uid); break;
    case 'choose': closeSheet(); answer(+b.dataset.uid); break;
    case 'placeIn': closeSheet(); answer({ uid: +b.dataset.uid, rid: b.dataset.rid }); break;
    case 'row': if (T.rows[b.dataset.rid]) answer(T.rows[b.dataset.rid]); break;
    case 'tile': {
      const l = b.dataset.l, rid = b.dataset.rid;
      if (T.tiles[l]) return answer(T.tiles[l]);
      if (T.rows[rid]) return answer(T.rows[rid]);
      const L = LOCATIONS[l];
      sheet(`<div class="detail kd"><img class="cimg wide" src="${L.image}" alt=""><div><h2>${L.name} <span class="dim">(${regionName(rid)})</span></h2><p><b>${L.inf} Influence</b> when you win this Region and claim this Location.</p><p>${esc(L.text)}</p><p>If your Herald is here too: +1 Influence, and steal 1 from every rival Herald here. Council of Relics cards can be cashed in then too.</p></div></div>`);
      break;
    }
    case 'kinfo': { const k = findKingdom(+b.dataset.uid); if (k) kSheet(k, b.dataset.opt); break; }
    case 'tactic': { const p = S.players[+b.dataset.pi]; tacticSheet(p.tactics.find((t) => t.k === b.dataset.k), p); break; }
    case 'favour': { const f = CARDS.favour[b.dataset.f]; sheet(`<div class="detail kd"><img class="cimg wide" src="${f.image}" alt=""><div><h2>${esc(f.name)}</h2><p>Kingdom's Favour action. Whoever claims the Harvest Field takes the Kingdom's Favour (set to III). Each use turns it down one; after I it goes back to the Harvest Field. It also wins tied games.</p>${f.rules.map((r) => `<p><b>${cap(r.season)}:</b> ${esc(r.text)}</p>`).join('')}</div></div>`); break; }
    case 'player': { const p = S.players[+b.dataset.pi]; sheet(`<h2>${esc(p.name)}</h2><p>${who(p.i)}. Influence <b>${p.inf}</b>, Lore <b>${p.lore}</b>, Hand Size <b>${game.maxHand(p)}</b>, Supporters on board <b>${p.supporters}</b> (Lost: ${p.lostSup}).</p>
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

setup();
