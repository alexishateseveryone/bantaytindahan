// UI, input, save data, audio and the main loop
import { Game, ITEMS, BUILD_ORDER, META, ROOM_UPGRADE, UNLOCKS, MAX_LEVEL, MAX_STOCK, MAX_ROOM, ROOM_BASE, ROOM_STEP, RENO_COST } from './game.js';
import { View } from './view.js';
import { pxText, setHTML, pxEmoji, pxifyStatic } from './ui/pixel.js';

const $ = id => document.getElementById(id);

// ---------- save (permanent paychecks) ----------
const KEY = 'shelf-defense-closing-time-v1';
let save = { bank: 0, levels: {}, best: 0, shifts: 0, run: null };   // run = the current store, saved between days
try { Object.assign(save, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* storage may be blocked */ }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };

// ---------- tiny synth sfx ----------
let ac = null, muted = false;
function beep(freq, dur = 0.08, type = 'square', vol = 0.05, slide = 0) {
  if (muted) return;
  try {
    ac ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
  } catch (e) { /* audio unavailable */ }
}
const sfx = {
  place: () => { beep(260, 0.07, 'square', 0.06); setTimeout(() => beep(390, 0.08), 60); },
  bad: () => beep(110, 0.12, 'sawtooth', 0.05),
  shoot: k => k === 'sauce' ? sfx.lob() : k === 'soda' ? beep(820, 0.14, 'sawtooth', 0.02, -500) : k === 'cans' ? beep(240, 0.07, 'triangle', 0.05, -100) : k === 'hotdog' ? beep(420, 0.08, 'triangle', 0.04, 160) : k === 'fridge' ? beep(980, 0.1, 'sine', 0.03, -300) : beep(330, 0.05, 'square', 0.025, -200),
  buy: () => beep(620, 0.05, 'triangle', 0.025),
  day: () => [392, 523, 659].forEach((f, i) => setTimeout(() => beep(f, 0.14, 'triangle', 0.05), i * 110)),
  kill: () => beep(880, 0.09, 'triangle', 0.05, 300),
  leak: () => beep(160, 0.3, 'sawtooth', 0.07, -100),
  pulse: () => beep(120, 0.2, 'sawtooth', 0.04, 200),
  wave: () => { beep(330, 0.1); setTimeout(() => beep(440, 0.1), 100); setTimeout(() => beep(660, 0.2), 200); },
  sale: () => { beep(988, 0.05, 'square', 0.03); setTimeout(() => beep(1319, 0.08, 'square', 0.03), 50); },
  crash: () => { beep(90, 0.25, 'sawtooth', 0.08, -40); setTimeout(() => beep(60, 0.2, 'square', 0.06), 60); },
  splat: () => { beep(200, 0.16, 'sawtooth', 0.04, -120); setTimeout(() => beep(520, 0.06, 'triangle', 0.03, 200), 40); },
  lob: () => beep(300, 0.18, 'triangle', 0.04, 260),
  whistle: () => beep(900, 0.35, 'sine', 0.03, -600),
  boom: () => { beep(70, 0.45, 'sawtooth', 0.1, -40); setTimeout(() => beep(45, 0.35, 'square', 0.08, -15), 40); },
  dash: () => beep(180, 0.16, 'sawtooth', 0.04, 500),
  tick: () => beep(1200, 0.04, 'square', 0.025),
  thud: () => beep(100, 0.12, 'square', 0.07, -50),
  warn: () => { beep(740, 0.08, 'square', 0.04); setTimeout(() => beep(740, 0.08, 'square', 0.04), 120); },
  freeze: () => { beep(1400, 0.1, 'sine', 0.03, -700); setTimeout(() => beep(900, 0.12, 'sine', 0.03, -300), 60); },
  bounce: () => beep(500, 0.05, 'triangle', 0.03, 250),
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.18, 'square', 0.06), i * 120)),
};

// ---------- state ----------
const view = new View($('stage'), $('view'));
let game = null, running = false, selected = null /* build item id */, pickedTower = null, preview = null, hover = null, speed = 1;
pxifyStatic();

// the run is saved in localStorage: at the start of every day (layout, machines, cash, upgrades) and while you build in prep.
// Closing the game mid-day puts you back at the moment you opened that day.
function saveRun() {
  if (!game || !running) return;
  const snap = (game.phase === 'prep' || game.phase === 'restock') ? game.snapshot() : game.daySnap;
  if (!snap) return;
  snap.paidOut = game.paidOut;
  save.run = snap; persist();
}
const SAVE_EVENTS = new Set(['place', 'sell', 'upgrade', 'stock', 'service', 'replace', 'unlock', 'renovate', 'dayStart', 'newDay', 'restock', 'retry', 'waveClear', 'lost']);

// every run starts in a freshly generated store (or your saved one), shown behind the title plate
function newStore(fresh = false) {
  if (fresh) { save.run = null; persist(); }
  game = new Game({ meta: save.levels });
  game.on = onEvent;
  if (save.run) { try { game.restore(save.run); } catch (e) { save.run = null; game = new Game({ meta: save.levels }); game.on = onEvent; } }
  view.setGame(game); view.menu = true; view.tod = 0;
  running = false; selected = null; pickedTower = null; preview = null; speed = 1;
  $('speed').textContent = '1x';
  $('hud').classList.add('off'); $('info').classList.add('off'); $('dock').classList.add('off'); closeTray(); setTab('stocks'); $('title').classList.remove('off');
  setHTML($('t-stats'), `Banked 💰 ${save.bank} · Runs ${save.shifts} · Best: ${save.best} nights`);
  closeModal(); buildCards(); refresh();
}

function startRun() {
  running = true; view.menu = false; selected = null;
  $('title').classList.add('off'); $('hud').classList.remove('off'); $('info').classList.remove('off'); $('dock').classList.remove('off');
  banner(game.wave ? `☀ Day ${game.wave + 1} — welcome back` : '☀ Day 1 — stock up, then open the store!'); refresh();
  if (game.phase === 'restock') showRestock();
}

// the paycheck is banked night by night (and on a loss), so closing the game never loses it
function bankProgress() {
  if (!game) return 0;
  const pay = Math.max(0, game.paycheck() - game.paidOut);
  game.paidOut += pay; save.bank += pay; save.best = Math.max(save.best, game.wave); persist();
  return pay;
}

// ---------- events from the game ----------
function floatText(cx, cy, text, cls = '', h = 1.1) {
  const p = view.project(cx, cy, h), r = $('stage').getBoundingClientRect();
  const d = document.createElement('div'); d.className = 'float ' + cls; d.innerHTML = pxText(text);
  d.style.left = (p.x - r.left) + 'px'; d.style.top = (p.y - r.top) + 'px';
  $('floats').appendChild(d); setTimeout(() => d.remove(), 950);
}
function banner(t) { const b = $('banner'); b.innerHTML = pxText(t); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }

function onEvent(type, d) {
  view.onEvent(type, d);
  switch (type) {
    case 'place': case 'upgrade': case 'stock': sfx.place(); break;
    case 'unlock': sfx.place(); banner(`🔓 ${ITEMS[d.type].name} unlocked!`); break;
    case 'buy': sfx.buy(); floatText(d.x, d.y, '🛒', 'sale', 1.5); break;
    case 'pay': sfx.sale(); floatText(d.x, d.y, '+$' + d.amount, 'sale', 1.5); break;
    case 'soldout': floatText(d.x, d.y, 'Sold out!', 'bad', 1.5); break;
    case 'empty': floatText(d.x, d.y, '😕 nothing to buy', 'bad', 1.2); break;
    case 'dayStart': sfx.day(); banner(`☀ Day ${d.n} — ${d.count} customers coming`); break;
    case 'evening': banner(`Store closed: +$${d.sales} from ${d.served} customers`); break;
    case 'newDay': banner(`☀ Day ${d.n} — restock and open up`); break;
    case 'shelfBreak': sfx.crash(); floatText(d.shelf.x, d.shelf.y, 'Shelf smashed!', 'bad', 1.4); break;
    case 'shoot': sfx.shoot(d.tower.type); break;
    case 'kill': sfx.kill(); floatText(d.enemy.x, d.enemy.y, '+$' + d.cash); break;
    case 'leak': sfx.leak(); floatText(d.enemy.x, d.enemy.y, '-' + d.enemy.steal + ' 🧾', 'bad'); break;
    case 'pulse': sfx.pulse(); break;
    case 'sauceSplash': sfx.splat(); break;
    case 'panic': floatText(d.enemy.x, d.enemy.y, 'Aaah!', 'bad', 1.5); break;
    case 'windup': sfx.tick(); break;
    case 'throw': sfx.whistle(); floatText(d.enemy.x, d.enemy.y, '💣 !', 'bad', 1.4); break;
    case 'dash': sfx.dash(); break;
    case 'dashHit': if (d.kind >= 2) sfx.thud(); break;
    case 'explode': sfx.boom(); break;
    case 'towerHit': sfx.thud(); break;
    case 'towerWarn': sfx.warn(); floatText(d.tower.x, d.tower.y, 'Overheating!', 'bad', 1.8); break;
    case 'towerBreak': sfx.crash(); floatText(d.tower.x, d.tower.y, d.why === 'destroyed' ? 'Destroyed!' : 'Broke down!', 'bad', 1.8); break;
    case 'service': sfx.place(); floatText(d.tower.x, d.tower.y, 'Serviced', 'good', 1.6); break;
    case 'replace': sfx.place(); floatText(d.tower.x, d.tower.y, 'Replaced!', 'good', 1.6); break;
    case 'waveStart': sfx.wave(); banner(`🌙 Night ${d.n} — ${d.count} burglars!`); break;
    case 'waveClear': bankProgress(); banner('Clear! +$' + d.bonus); break;
    case 'freeze': sfx.freeze(); floatText(d.enemy.x, d.enemy.y, '🧊 Frozen!', 'good', 1.5); break;
    case 'bounce': sfx.bounce(); break;
    case 'retry': banner(`☀ Day ${d.n} again — you've got this`); break;
    case 'restock': setTimeout(showRestock, 900); break;
    case 'lost': sfx.leak(); setTimeout(showLost, 700); break;
  }
  if (SAVE_EVENTS.has(type)) saveRun();
  refresh();
}

// ---------- build tray (opened by the icon in the bottom-right; 3D assets rendered as pixel icons) ----------
const icons = {};   // pixel-art item icons (build button + cards)
const available = () => BUILD_ORDER.filter(id => game.isUnlocked(id));   // shelves + vending machine at first, the rest are bought in the shop
function buildCards() {
  const box = $('trayGrid'); box.innerHTML = '';
  BUILD_ORDER.forEach(id => {
    icons[id] = view.makeIcon(id);
    const c = document.createElement('div'); c.className = 'card px'; c.dataset.id = id;
    c.innerHTML = `<div class="pic"><img alt="" src="${icons[id]}"></div><div class="nm">${ITEMS[id].name}<span class="k" data-k></span></div><div class="ds">${ITEMS[id].desc}</div><button class="pxb" data-act></button>`;
    c.querySelector('[data-act]').onclick = () => {
      if (!game.isUnlocked(id)) { if (!game.unlock(id)) { sfx.bad(); banner(`Need $${UNLOCKS[id]} to unlock ${ITEMS[id].name}`); } return; }   // unlocking costs store profit
      selected = selected === id ? null : id; pickedTower = null; preview = null; view.setCursor(null); closeTray(); refresh();
    };
    box.appendChild(c);
  });
  $('buildIcon').src = pxEmoji('🔨', 16);
}
// mouse wheel scrolls the card row sideways
$('trayGrid').addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); e.currentTarget.scrollLeft += e.deltaY; } }, { passive: false });
// the build menu is a centered modal with two tabs: STOCKS (things to build) and RENOVATE (grow the store)
let trayTab = 'stocks';
const trayOpen = () => { const t = $('tray'); return !t.classList.contains('off') && !t.classList.contains('hide'); };
function openTray() {
  const t = $('tray'), bk = $('trayBack');
  clearTimeout(openTray.timer);
  t.classList.remove('off'); bk.classList.remove('off'); t.classList.add('hide'); bk.classList.add('hide');
  void t.offsetWidth;                                   // let the browser register the start state so the pop animates
  requestAnimationFrame(() => { t.classList.remove('hide'); bk.classList.remove('hide'); });
  refresh();
}
function closeTray() {
  const t = $('tray'), bk = $('trayBack');
  if (t.classList.contains('off') || t.classList.contains('hide')) return;
  t.classList.add('hide'); bk.classList.add('hide');
  clearTimeout(openTray.timer);
  openTray.timer = setTimeout(() => { if (t.classList.contains('hide')) { t.classList.add('off'); bk.classList.add('off'); } }, 340);
}
function setTab(tab) {
  trayTab = tab;
  $('tabStocks').classList.toggle('on', tab === 'stocks'); $('tabReno').classList.toggle('on', tab === 'reno'); $('tabShop').classList.toggle('on', tab === 'shop');
  $('trayGrid').classList.toggle('off', tab !== 'stocks'); $('renoPane').classList.toggle('off', tab !== 'reno'); $('shopPane').classList.toggle('off', tab !== 'shop');
  renderReno(); renderShopTab();
}
function renderReno() {
  if (!game || trayTab !== 'reno') return;
  const lv = game.room, maxed = lv >= MAX_ROOM, size = n => ROOM_BASE + ROOM_STEP * n;
  const chk = game.canRenovate(), cost = game.renovateCost();
  let cells = ''; for (let i = 0; i <= MAX_ROOM; i++) cells += `<span class="cell ${i <= lv ? 'on' : ''}"></span>`;
  $('renoPane').innerHTML = (`<div class="big">🏠 ${size(lv)}x${size(lv)} store</div><div class="grid">${cells}</div>
    <p>${maxed ? 'The store is as big as it gets.' : `Renovate to <b style="color:#5fe3a1">${size(lv + 1)}x${size(lv + 1)}</b>: +${ROOM_STEP} columns on the right and +${ROOM_STEP} rows at the bottom. Everything you built stays put. More floor, more room for machines and customers, but burglars get more room too.`}</p>
    <p style="color:var(--dim)">Only before you open the store for the day.</p>
    <button class="pxb ${maxed ? '' : 'gold'}" id="renoBtn" ${chk.ok ? '' : 'disabled'}>${maxed ? 'MAX SIZE' : chk.ok ? '🔨 RENOVATE $' + cost : (game.phase !== 'prep' ? '🔒 CLOSED: ' : '') + '$' + cost + ' — ' + chk.reason.toUpperCase()}</button>`);
  $('renoBtn').onclick = () => {
    if (game.renovate()) { view.setGame(game); sfx.place(); banner(`🏠 Renovated: ${size(game.room)}x${size(game.room)} store`); pickedTower = null; preview = null; refresh(); }
    else sfx.bad();
  };
}
$('tabStocks').onclick = () => setTab('stocks');
$('tabReno').onclick = () => setTab('reno');
$('tabShop').onclick = () => setTab('shop');
$('buildBtn').onclick = () => { trayOpen() ? closeTray() : openTray(); };
$('trayClose').onclick = closeTray;
$('trayBack').onclick = closeTray;

function refresh() {
  if (!game) return;
  $('lives').textContent = game.lives; $('cash').textContent = game.cash;
  const ck = game.clock();
  setHTML($('hour'), `${ck.icon} ${ck.text}`);
  $('waveTxt').textContent = `DAY ${game.wave + 1}`;
  $('clock').classList.toggle('night', game.isNight);
  const rs = $('restockAll'), cost = game.restockCost();
  $('rsCost').textContent = cost; rs.disabled = cost === 0 || game.cash < cost || game.phase === 'lost';   // restock-all only when you can afford the whole refill
  const av = available();
  for (const b of $('trayGrid').children) {
    const id = b.dataset.id, cost = game.costOf(id), locked = !game.isUnlocked(id), uc = UNLOCKS[id], act = b.querySelector('[data-act]');
    b.classList.toggle('lock', locked); b.classList.toggle('sel', !locked && selected === id);
    b.querySelector('[data-k]').textContent = locked ? '' : av.indexOf(id) + 1;
    act.className = 'pxb ' + (locked ? 'gold' : selected === id ? 'green' : '');
    act.disabled = locked ? game.cash < uc : cost > game.cash;
    act.textContent = locked ? `🔒 Unlock $${uc}` : selected === id ? '✔ Selected' : `🔨 Build $${cost}`;   // plain text: smooth emoji, not pixel sprites
  }
  const bi = $('buildIcon');   // the build icon shows what you're holding
  if (selected && icons[selected]) { if (bi.dataset.k !== selected) { bi.src = icons[selected]; bi.className = ''; bi.dataset.k = selected; } }
  else if (bi.dataset.k !== 'hammer') { bi.src = pxEmoji('🔨', 16); bi.className = 'pxe'; bi.dataset.k = 'hammer'; }
  const go = $('go'), setGo = (cls, dis, txt) => { go.disabled = dis; go.className = 'pxb ' + cls; setHTML(go, txt); };
  if (game.phase === 'prep') setGo('gold', false, '☀ OPEN<br>STORE');
  else if (game.phase === 'morning') setGo('', true, `🛒 ${game.customers.length + game.dayQueue.length}<br>SHOPPERS`);
  else if (game.phase === 'evening') setGo('red', false, `🌙 NIGHT IN ${Math.max(1, Math.ceil(game.nightIn))}<br>TAP: NOW`);   // starts by itself; tapping skips the wait
  else if (game.phase === 'wave') setGo('', true, `🦹 ${game.enemies.length + game.spawnQueue.length}<br>LEFT`);
  else setGo('', true, '...');
  renderInfo();
  renderReno();
  view.setRange(...rangeFor());
}

function rangeFor() {
  if (pickedTower && pickedTower.kind === 'tower') return [pickedTower, game.stat(pickedTower, 'range')];
  const c = preview || hover;
  if (selected && c && ITEMS[selected].range) return [c, ITEMS[selected].range * game.mods.range];
  return [null, 0];
}

const bar = (cls, v) => `<span class="bar ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></span>`;
function renderInfo() {
  const el = $('info');
  let html = '';
  if (pickedTower && pickedTower.kind === 'shelf' && game.shelves.includes(pickedTower)) {
    const s = pickedTower, need = MAX_STOCK - s.units, can = Math.min(need, Math.floor(game.cash / game.unitCost()));
    html = `<div><div class="t">Shelf <span class="lvl">${s.units}/${MAX_STOCK} goods</span></div><div class="d">${s.units === 0 ? 'Empty — customers skip it.' : 'Customers buy from stocked shelves.'}</div>
      <div class="bars">HP ${bar(s.hp / s.maxhp < 0.35 ? 'lo' : '', s.hp / s.maxhp)}</div></div>
      <div class="acts"><button class="pxb green" id="rst" ${can <= 0 ? 'disabled' : ''}>${need === 0 ? 'FULL' : '📦 $' + can * game.unitCost()}</button>${s.placed ? `<button class="pxb red" id="sell">SELL $${game.sellValue(s)}</button>` : ''}</div>`;
    setHTML(el, html);
    $('rst').onclick = () => { if (game.restock(s)) refresh(); else sfx.bad(); };
    const sl = $('sell'); if (sl) sl.onclick = () => { game.sell(s); pickedTower = null; refresh(); };
  } else if (pickedTower && game.towers.includes(pickedTower)) {
    const t = pickedTower, def = ITEMS[t.type], isT = t.kind === 'tower', up = game.upgradeCost(t);
    let stats = '';
    if (isT) stats = t.broken ? '<span style="color:#ff5a5f">Out of order. Replace it to use it again.</span>' : `DMG ${game.stat(t, 'dmg').toFixed(0)} · RNG ${game.stat(t, 'range').toFixed(1)} · ${game.stat(t, 'rate').toFixed(1)}/s`;
    const hp = t.hp / t.maxhp;
    const bars = isT ? `<div class="bars">HP ${bar(hp < 0.35 ? 'lo' : '', hp)} WEAR ${bar(t.wear > 0.7 ? 'hot' : 'wear', t.wear)}</div>` : '';
    let acts = '';
    if (isT && t.broken) acts += `<button class="pxb gold" id="rpl" ${game.replaceCost(t) > game.cash ? 'disabled' : ''}>REPLACE $${game.replaceCost(t)}</button>`;
    if (isT && !t.broken) {
      acts += `<button class="pxb green" id="upg" ${up > game.cash ? 'disabled' : ''}>${t.level >= MAX_LEVEL ? 'MAX' : '⏫ $' + up}</button>`;
      if (game.needsService(t)) acts += `<button class="pxb" id="svc" ${game.serviceCost(t) > game.cash ? 'disabled' : ''}>🔧 $${game.serviceCost(t)}</button>`;
    }
    acts += `<button class="pxb red" id="sell">SELL $${game.sellValue(t)}</button>`;
    html = `<div><div class="t">${def.name} <span class="lvl">${t.broken ? 'BROKEN' : 'Lv ' + t.level + (isT ? '/' + MAX_LEVEL : '')}</span></div><div class="d">${stats || def.desc}</div>${bars}</div><div class="acts">${acts}</div>`;
    setHTML(el, html);
    const u = $('upg'); if (u) u.onclick = () => { if (game.upgrade(t)) refresh(); else sfx.bad(); };
    const sv = $('svc'); if (sv) sv.onclick = () => { if (!game.service(t)) sfx.bad(); refresh(); };
    const rp = $('rpl'); if (rp) rp.onclick = () => { if (!game.replace(t)) sfx.bad(); refresh(); };
    $('sell').onclick = () => { game.sell(t); pickedTower = null; refresh(); };
  } else if (selected) {
    const def = ITEMS[selected];
    const touch = preview ? ' <b style="color:#5fe3a1">Tap again to place.</b>' : '';
    setHTML(el, `<div><div class="t">${def.name} — $${game.costOf(selected)}</div><div class="d">${def.desc}${touch}</div></div><div class="acts"><button class="pxb" id="cancel">CANCEL</button></div>`);
    $('cancel').onclick = () => { selected = null; preview = null; view.setCursor(null); refresh(); };
  } else {
    el.innerHTML = ''; el.classList.add('off'); return;   // nothing picked: no help card
  }
  el.classList.remove('off');
}

// ---------- input ----------
const cv = $('view');
cv.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || !game || !running) return;
  hover = view.pick(e.clientX, e.clientY);
  view.setHover(hover ? (game.towerAt(hover.x, hover.y) || game.shelfAt(hover.x, hover.y) || game.trapAt(hover.x, hover.y)) : null);
  if (selected && hover) view.setCursor(hover, game.canPlace(selected, hover.x, hover.y).ok); else view.setCursor(null);
  view.setRange(...rangeFor());
});
cv.addEventListener('pointerleave', () => { hover = null; view.setHover(null); if (!preview) view.setCursor(null); });
cv.addEventListener('pointerdown', e => {
  if (!game || !running || game.phase === 'lost') return;
  closeTray();
  const c = view.pick(e.clientX, e.clientY);
  if (!c) return;
  const existing = game.towerAt(c.x, c.y) || game.shelfAt(c.x, c.y) || game.trapAt(c.x, c.y);
  if (existing && !(selected && ITEMS[selected].kind === 'trap' && !game.towerAt(c.x, c.y) && !game.shelfAt(c.x, c.y))) {
    pickedTower = existing; preview = null; selected = null; view.setCursor(null); refresh(); return;
  }
  if (!selected) { pickedTower = null; refresh(); return; }
  pickedTower = null;
  const touch = e.pointerType !== 'mouse';
  if (touch && !(preview && preview.x === c.x && preview.y === c.y)) {   // first tap previews
    preview = c; view.setCursor(c, game.canPlace(selected, c.x, c.y).ok); refresh(); return;
  }
  const chk = game.canPlace(selected, c.x, c.y);
  if (chk.ok) { game.place(selected, c.x, c.y); preview = null; view.setCursor(null); }
  else { sfx.bad(); floatText(c.x, c.y, chk.reason, 'bad'); }
  refresh();
});
window.addEventListener('keydown', e => {
  if (!game || !running) return;
  const i = parseInt(e.key, 10);
  const av = available();
  if (i >= 1 && i <= av.length) { selected = av[i - 1]; pickedTower = null; preview = null; closeTray(); refresh(); }
  else if (e.key === 'b' || e.key === 'B') { trayOpen() ? closeTray() : openTray(); }
  else if (e.key === 'Escape') { selected = null; pickedTower = null; preview = null; view.setCursor(null); refresh(); }
  else if (e.key === ' ' && (game.phase === 'prep' || game.phase === 'evening')) { e.preventDefault(); $('go').click(); }
  else if ((e.key === 'r' || e.key === 'R') && !$('restockAll').disabled) $('restockAll').click();
});
$('go').onclick = () => { if (game.startDay() || game.startWave()) { preview = null; view.setCursor(null); refresh(); } };
$('restockAll').onclick = () => { if (!game.restockAll()) sfx.bad(); refresh(); };
$('speed').onclick = () => { speed = speed % 3 + 1; $('speed').textContent = speed + 'x'; };
$('mute').onclick = () => { muted = !muted; setHTML($('mute'), muted ? '🔇' : '🔊'); };

// ---------- modals ----------
const modal = $('modal'), card = $('card');
const openModal = html => { card.innerHTML = pxText(html); modal.classList.add('on'); };
function closeModal() { modal.classList.remove('on'); }

function shopHTML() {
  const row = m => {
    const l = save.levels[m.id] || 0, maxed = l >= m.max, cost = m.cost(l);
    const tag = m.item ? (maxed ? 'OWNED' : '💰' + cost) : (maxed ? 'MAX' : '💰' + cost);
    const lv = m.item ? '' : `<span class="lvl">Lv ${l}/${m.max}</span>`;
    return `<button class="choice pxb" data-id="${m.id}" ${maxed || cost > save.bank ? 'disabled' : ''}><span class="ic">${m.icon}</span>
      <span><div class="nm">${m.name} ${lv}</div><div class="ds">${m.item ? ITEMS[m.item].desc : m.desc}</div></span>
      <span style="margin-left:auto;color:#ffcf4a">${tag}</span></button>`;
  };
  const sec = t => `<div class="sub" style="margin-top:14px">${t}</div>`;
  return `<div class="sub">Banked: 💰 ${save.bank} — permanent upgrades. New machines are unlocked with store profit in the Stocks tab.</div>
    ${sec('STORE SIZE')}${row(ROOM_UPGRADE)}${sec('UPGRADES')}${META.map(row).join('')}`;
}
// buy one paycheck upgrade; returns true if it went through
function buyMeta(id) {
  const m = [...META, ROOM_UPGRADE].find(x => x.id === id), l = save.levels[m.id] || 0, c = m.cost(l);
  if (l >= m.max || c > save.bank) return false;
  save.bank -= c; save.levels[m.id] = l + 1; persist(); sfx.place(); shopDirty = true; return true;
}
// the PAYCHECK SHOP tab of the build menu
function renderShopTab() {
  if (!game || trayTab !== 'shop') return;
  const pane = $('shopPane'), top = $('tray').scrollTop;
  pane.innerHTML = shopHTML();
  pane.querySelectorAll('.choice').forEach(b => b.onclick = () => {
    if (buyMeta(b.dataset.id)) { if (shopDirty) { buildCards(); shopDirty = false; } renderShopTab(); refresh(); }
  });
  $('tray').scrollTop = top;
}
// the same shop as a full modal, reached from the "till is empty" screen
function showShop() {
  openModal(`<h2>Paycheck Shop</h2>${shopHTML()}<div class="row"><button class="pxb gold" id="m-back">◀ Back</button></div>`);
  card.querySelectorAll('.choice').forEach(b => b.onclick = () => {
    const top = card.scrollTop;
    if (buyMeta(b.dataset.id)) { showShop(); card.scrollTop = top; }
  });
  $('m-back').onclick = () => {
    if (game && game.phase === 'lost') { showLost(true); return; }
    closeModal();
    if (shopDirty) { buildCards(); refresh(); }
    shopDirty = false;
  };
}
let shopDirty = false;

function showRestock() {
  if (!game || game.phase !== 'restock') return;
  const opts = game.choices.map(u => `<button class="choice pxb" data-id="${u.id}"><span class="ic">${u.icon}</span><span><div class="nm">${u.name}</div><div class="ds">${u.desc}</div></span></button>`).join('');
  openModal(`<h2>📦 Morning delivery — day ${game.wave + 1}</h2><div class="sub">You survived night ${game.wave}. Truck's here: pick one delivery. Till: ${game.lives}/${game.maxLives}</div>${opts}
    <div class="row"><button class="pxb" id="m-reroll" ${game.rerolls ? '' : 'disabled'}>🔄 Reroll (${game.rerolls})</button></div>`);
  card.querySelectorAll('.choice').forEach(b => b.onclick = () => { game.pickUpgrade(b.dataset.id); sfx.place(); closeModal(); refresh(); });
  $('m-reroll').onclick = () => { game.reroll(); showRestock(); };
}

// losing never wipes anything: the same day just starts again with the same store, cash and upgrades
let lastPay = 0;
function showLost(again = false) {
  if (!game || game.phase !== 'lost') return;
  if (!again) lastPay = bankProgress();
  openModal(`<h1>THE TILL IS EMPTY</h1>
    <div class="sub">They cleaned you out on night ${game.wave + 1}. The cops showed up, the store is yours again. Nothing is lost.</div>
    <p>Nights survived: <b>${game.wave}</b><br>Customers served: <b>${game.served}</b> ($${game.sales})<br>Burglars busted: <b>${game.kills}</b></p>
    <p style="font-size:18px;color:#ffcf4a">Paycheck: 💰 ${lastPay} <span class="lvl">(banked: ${save.bank})</span></p>
    <div class="row"><button class="pxb gold" id="m-retry">▶ Retry day ${game.wave + 1}</button><button class="pxb" id="m-shop">💰 Shop</button></div>
    <div class="row" style="margin-top:8px"><button class="pxb" id="m-new">↻ Brand new store</button></div>`);
  $('m-retry').onclick = () => { game.retryDay(); view.setGame(game); pickedTower = null; preview = null; selected = null; view.setCursor(null); closeModal(); refresh(); };
  $('m-shop').onclick = showShop;
  $('m-new').onclick = () => { save.shifts++; persist(); newStore(true); };
}

// ---------- loop ----------
let last = performance.now(), clock = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
  if (game) {
    const was = game.phase; game.update(dt * speed);
    if (game.phase === 'wave' || game.phase === 'morning' || game.phase === 'evening' || was !== game.phase) { if (Math.floor(clock * 4) !== Math.floor((clock - dt) * 4)) refresh(); }
  }
  view.render(dt, clock);
  requestAnimationFrame(frame);
}
$('t-start').onclick = startRun;
newStore();
requestAnimationFrame(frame);
window.__game = () => game;   // debugging helpers
window.__view = view;