// UI, input, save data, audio and the main loop
import { Game, ITEMS, BUILD_ORDER, SKILLS, META, ROOM_UPGRADE, UNLOCKS, MAX_LEVEL, MAX_STOCK, MAX_ROOM, ROOM_BASE, ROOM_STEP, RENO_COST } from './game.js';
import { View } from './view.js';
import { pxText, setHTML, pxEmoji, pxifyStatic } from './ui/pixel.js';

const $ = id => document.getElementById(id);

// ---------- save (permanent paychecks) ----------
const KEY = 'shelf-defense-closing-time-v1';
let save = { bank: 0, levels: {}, best: 0, shifts: 0, run: null };   // run = the current store, saved between days
try { Object.assign(save, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* storage may be blocked */ }
save.settings = Object.assign({ music: 0.5, sfx: 0.7 }, save.settings || {});   // volume sliders (0..1)
const settings = save.settings;
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };

// ---------- audio: synthesized sfx (every machine sounds different) + background music ----------
let ac = null, master = null, echo = null, noiseBuf = null, muted = false, outGain = null;
function audio() {
  if (muted) return null;
  try {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5;
      const out = ac.createGain(); out.gain.value = settings.sfx * 1.36; outGain = out; comp.connect(out); out.connect(ac.destination); master = comp;
      const d = ac.createDelay(1), fb = ac.createGain(), wet = ac.createGain();   // soft echo for chimes
      d.delayTime.value = 0.15; fb.gain.value = 0.33; wet.gain.value = 0.38; d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(master); echo = d;
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  } catch (e) { return null; }
}
// one pitched blip: frequency f gliding by `slide` Hz, started `delay` seconds from now, optional echo
function tone(f, dur = 0.1, type = 'square', vol = 0.05, slide = 0, delay = 0, fx = false) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); if (fx) g.connect(echo);
  o.start(t); o.stop(t + dur + 0.03);
}
// filtered noise burst (hiss, crash, splash, whoosh...)
function noise(dur = 0.1, vol = 0.05, o = {}) {
  const a = audio(); if (!a) return;
  const { f = 2000, q = 1, type = 'bandpass', slide = 0, delay = 0, fx = false } = o;
  const t = a.currentTime + delay, s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf; fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t);
  if (slide) fl.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(master); if (fx) g.connect(echo);
  s.start(t, Math.random() * Math.max(0, 0.95 - dur), dur + 0.02);
}
const arp = (notes, step, dur, type, vol, fx = true) => notes.forEach((f, i) => tone(f, dur, type, vol, 0, i * step, fx));
const lastPlayed = {};
const gate = (k, ms) => { const n = performance.now(); if (n - (lastPlayed[k] || 0) < ms) return false; lastPlayed[k] = n; return true; };

const sfx = {
  // --- buttons & building ---
  click: () => { if (gate('click', 40)) tone(1250, 0.035, 'triangle', 0.03, -450); },
  bad: () => { tone(150, 0.16, 'sawtooth', 0.05, -50); tone(110, 0.2, 'square', 0.04, -30, 0.08); },
  place: () => { tone(120, 0.12, 'sine', 0.11, -60); noise(0.06, 0.05, { f: 700, type: 'lowpass' }); tone(520, 0.09, 'triangle', 0.05, 380, 0.05, true); tone(780, 0.12, 'sine', 0.035, 0, 0.1, true); },
  upgrade: () => { arp([392, 523, 659, 784, 1047], 0.055, 0.16, 'triangle', 0.045); tone(300, 0.3, 'sawtooth', 0.025, 700); noise(0.25, 0.02, { f: 3000, type: 'highpass', delay: 0.1 }); },
  sell: () => { tone(1319, 0.06, 'square', 0.04); tone(1760, 0.07, 'square', 0.045, 0, 0.06); tone(2349, 0.3, 'sine', 0.05, 0, 0.12, true); noise(0.07, 0.03, { f: 6500, type: 'highpass', delay: 0.02 }); },
  fix: () => { for (let i = 0; i < 4; i++) { tone(1400 + i * 110, 0.025, 'square', 0.035, 0, i * 0.055); noise(0.02, 0.03, { f: 3500, delay: i * 0.055 }); } arp([659, 880, 1175], 0.07, 0.18, 'sine', 0.04); },
  replace: () => { tone(90, 0.16, 'square', 0.08, -30); noise(0.1, 0.06, { f: 900, type: 'lowpass' }); setTimeout(() => sfx.fix(), 130); },
  restock: () => { noise(0.16, 0.05, { f: 1400, q: 0.6, slide: -700 }); tone(430, 0.08, 'triangle', 0.05, 250, 0.06); tone(640, 0.1, 'triangle', 0.04, 0, 0.12, true); },
  unlock: () => { arp([392, 523, 659, 784, 1047, 1319], 0.07, 0.22, 'square', 0.035); tone(2093, 0.4, 'sine', 0.04, 0, 0.45, true); },
  renovate: () => { for (let i = 0; i < 3; i++) { tone(95, 0.1, 'square', 0.08, -30, i * 0.14); noise(0.06, 0.06, { f: 1800, delay: i * 0.14 }); } arp([523, 659, 784, 1047], 0.08, 0.2, 'triangle', 0.04); },
  // --- tarot cards ---
  deal: () => { noise(0.12, 0.045, { f: 2600, q: 0.7, type: 'highpass', slide: -1200 }); tone(240, 0.08, 'sine', 0.03, 120); },
  flip: () => { noise(0.18, 0.05, { f: 3200, q: 0.8, slide: -2200 }); tone(520, 0.14, 'triangle', 0.035, 420, 0, true); tone(1040, 0.12, 'sine', 0.02, 0, 0.08, true); },
  pick: () => { arp([523, 659, 784, 1047, 1319, 1568], 0.06, 0.4, 'sine', 0.05); noise(0.5, 0.03, { f: 5000, type: 'highpass', delay: 0.05, fx: true }); tone(130, 0.5, 'sine', 0.08, 60); },
  // --- shop life ---
  buy: () => { if (gate('buy', 60)) { tone(700, 0.05, 'triangle', 0.03, 350); } },
  sale: () => { tone(1568, 0.06, 'square', 0.035); tone(2093, 0.14, 'square', 0.035, 0, 0.06, true); noise(0.03, 0.025, { f: 5000, type: 'highpass' }); },
  day: () => arp([392, 523, 659, 784], 0.11, 0.22, 'triangle', 0.045),
  // --- combat: every machine has its own voice ---
  shoot: k => {
    if (!gate('shoot' + k, 45)) return;
    if (k === 'cans') { tone(190, 0.09, 'triangle', 0.08, -110); noise(0.05, 0.05, { f: 1900, q: 2 }); tone(1350, 0.05, 'sine', 0.025, -300, 0.02); }      // clunk-pop
    else if (k === 'sauce') sfx.lob();                                                                                                                  // bloop
    else if (k === 'soda') { noise(0.22, 0.06, { f: 4800, q: 0.6, type: 'highpass', slide: -2200 }); tone(1100, 0.12, 'sawtooth', 0.012, -500); }        // psssht
    else if (k === 'hotdog') { tone(150, 0.13, 'sine', 0.1, -80); tone(520, 0.07, 'triangle', 0.045, 260, 0.03); noise(0.05, 0.03, { f: 900 }); }       // thwump
    else if (k === 'fridge') { tone(950, 0.14, 'sine', 0.04, -420, 0, true); tone(1420, 0.2, 'triangle', 0.022, -500, 0.02, true); noise(0.08, 0.025, { f: 6000, type: 'highpass' }); }  // glassy
    else if (k === 'gum') { for (let i = 0; i < 5; i++) { tone(620 + i * 70, 0.05, 'triangle', 0.04, 260, i * 0.11); noise(0.02, 0.025, { f: 2400, delay: i * 0.11 }); } }   // pop-pop-pop-pop-pop
    else if (k === 'cola') { noise(0.16, 0.05, { f: 5200, q: 0.6, type: 'highpass', slide: -2400 }); tone(260, 0.1, 'sine', 0.03, 140); }                   // fizzy pshh
    else if (k === 'atm') { for (let i = 0; i < 4; i++) { tone(1050 + (i % 2) * 120, 0.03, 'square', 0.025, 0, i * 0.045); noise(0.025, 0.02, { f: 3200, q: 3, delay: i * 0.045 }); } tone(1760, 0.12, 'sine', 0.025, 0, 0.19, true); }   // printer brrt + ding
    else tone(330, 0.05, 'square', 0.025, -200);
  },
  gumHit: () => { if (gate('gumHit', 50)) { tone(900, 0.06, 'sine', 0.035, -350); tone(1350, 0.05, 'triangle', 0.02, -300, 0.04); } },
  colaBlast: () => { noise(0.4, 0.12, { f: 2600, q: 0.7, type: 'highpass', slide: -1800 }); tone(130, 0.3, 'sine', 0.09, -70); tone(520, 0.2, 'triangle', 0.04, -300, 0.02); },   // pssshHH-BOOM
  cigLaunch: () => { if (gate('cigLaunch', 55)) { noise(0.04, 0.03, { f: 2200, q: 1.5 }); tone(700, 0.05, 'triangle', 0.02, 300); } },
  cigPop: () => { if (gate('cigPop', 45)) { noise(0.05, 0.04, { f: 3000, q: 1 }); tone(520, 0.05, 'square', 0.02, -300); } },
  swirl: () => { noise(0.5, 0.05, { f: 800, q: 1.2, slide: 2400 }); tone(400, 0.45, 'triangle', 0.03, 600, 0, true); },
  lob: () => { tone(230, 0.22, 'sine', 0.07, 430); noise(0.14, 0.03, { f: 600, type: 'lowpass', slide: 400 }); tone(120, 0.1, 'sawtooth', 0.025, 60, 0.05); },
  pulse: () => { if (!gate('pulse', 120)) return; tone(95, 0.28, 'sawtooth', 0.055, 140); noise(0.14, 0.05, { f: 3200, q: 4, slide: -1800 }); tone(1760, 0.28, 'sine', 0.04, 0, 0.16, true); },   // bzzt-ding
  hit: () => { if (gate('hit', 55)) noise(0.035, 0.03, { f: 2600, q: 1.5 }); },
  wet: () => { if (gate('wet', 60)) { noise(0.12, 0.045, { f: 1800, q: 1, slide: -1200 }); tone(420, 0.09, 'sine', 0.03, -200); } },
  splat: () => { noise(0.18, 0.06, { f: 1200, q: 0.8, slide: -800 }); tone(200, 0.14, 'sawtooth', 0.035, -110); tone(560, 0.07, 'triangle', 0.03, 200, 0.04); },
  shatter: () => { noise(0.3, 0.07, { f: 7000, type: 'highpass', q: 0.5 }); arp([2093, 2637, 3136, 2349], 0.04, 0.2, 'sine', 0.025); },
  can: () => { if (gate('can', 70)) { tone(1500, 0.06, 'triangle', 0.025, -400); tone(1100, 0.08, 'triangle', 0.02, -300, 0.05); } },
  bounce: () => tone(480, 0.07, 'triangle', 0.045, 380),
  slip: () => { tone(620, 0.2, 'sine', 0.06, -420); tone(300, 0.14, 'triangle', 0.04, 200, 0.14); },
  freeze: () => { tone(1500, 0.12, 'sine', 0.035, -750, 0, true); tone(950, 0.14, 'sine', 0.03, -300, 0.06, true); },
  kill: () => { if (!gate('kill', 35)) return; tone(660, 0.08, 'triangle', 0.05, 520); tone(1175, 0.18, 'sine', 0.04, 0, 0.05, true); noise(0.04, 0.025, { f: 6000, type: 'highpass', delay: 0.04 }); },
  leak: () => { tone(220, 0.3, 'sawtooth', 0.07, -140); tone(165, 0.4, 'square', 0.05, -100, 0.12); },
  crash: () => { noise(0.35, 0.11, { f: 900, q: 0.5, slide: -600 }); tone(85, 0.3, 'sawtooth', 0.09, -45); for (let i = 0; i < 4; i++) tone(500 + Math.random() * 900, 0.03, 'square', 0.03, 0, 0.05 + i * 0.05); },
  whistle: () => tone(950, 0.4, 'sine', 0.035, -650),
  boom: () => { noise(0.65, 0.16, { f: 700, type: 'lowpass', q: 0.7, slide: -550 }); tone(62, 0.55, 'sine', 0.17, -36); tone(40, 0.4, 'square', 0.06, -10, 0.03); },
  dash: () => { noise(0.2, 0.05, { f: 700, q: 1.5, slide: 1800 }); tone(180, 0.16, 'sawtooth', 0.04, 500); },
  tick: () => tone(1250, 0.04, 'square', 0.025),
  thud: () => { tone(105, 0.13, 'square', 0.07, -55); noise(0.05, 0.04, { f: 500, type: 'lowpass' }); },
  warn: () => { tone(740, 0.08, 'square', 0.04); tone(740, 0.08, 'square', 0.04, 0, 0.12); },
  wave: () => { for (let i = 0; i < 2; i++) { tone(660, 0.17, 'square', 0.045, 0, i * 0.4); tone(880, 0.17, 'square', 0.045, 0, i * 0.4 + 0.19); } tone(110, 0.8, 'sawtooth', 0.04, -30); },
  win: () => arp([523, 659, 784, 1047, 1319], 0.1, 0.3, 'square', 0.04),
  lost: () => arp([392, 330, 262, 196], 0.18, 0.35, 'sawtooth', 0.045),
};
// every button gets a soft click (the action itself - build, upgrade, sell, fix - adds its own sound)
let musicOn = false;
document.addEventListener('pointerdown', e => {
  musicOn = true; audio();
  const b = e.target.closest && e.target.closest('button');
  if (b && !b.disabled) sfx.click();
}, true);
window.addEventListener('keydown', () => { musicOn = true; audio(); }, true);

// background music: assets/sfx/newday.mp3 by day, assets/sfx/robbery.mp3 while burglars are in the store. Cross-fades.
const MUSIC_VOL = 0.4;
const music = { day: new Audio('assets/sfx/newday.mp3'), night: new Audio('assets/sfx/robbery.mp3') };
let musicWant = null;
for (const k in music) { music[k].loop = true; music[k].preload = 'auto'; music[k].volume = 0; }
function musicTick(dt) {
  for (const k in music) {
    const m = music[k], want = musicOn && !muted && musicWant === k ? settings.music * 0.8 : 0, diff = want - m.volume;
    m.volume = Math.max(0, Math.min(1, m.volume + Math.sign(diff) * Math.min(Math.abs(diff), dt * 0.7)));
    if (want > 0 && m.paused && !m._busy && performance.now() > (m._retry || 0)) {
      m._busy = true;
      m.play().catch(() => { m._retry = performance.now() + 3000; }).finally(() => { m._busy = false; });   // blocked or missing file: try again later
    } else if (want === 0 && m.volume <= 0.001 && !m.paused) { m.pause(); m.currentTime = 0; }
  }
}

// ---------- state ----------
const view = new View($('stage'), $('view'));
let game = null, running = false, selected = null /* build item id */, pickedTower = null, preview = null, hover = null, speed = 1, paused = false;
pxifyStatic();

// ---------- HUD: the time sits in the top-left corner, the till and the money right below it. No containers. ----------
(function layoutHud() {
  const hud = $('hud'); if (!hud) return;
  const top = id => { let el = $(id); while (el && el.parentElement && el.parentElement !== hud) el = el.parentElement; return el; };
  const parts = [...new Set([top('hour') || $('clock'), top('lives'), top('cash')].filter(Boolean))];
  const box = document.createElement('div'); box.id = 'hudL'; hud.appendChild(box);
  for (const p of parts) box.appendChild(p);
  const css = document.createElement('style');
  css.textContent = `
#hudL{position:fixed;top:max(8px,env(safe-area-inset-top));left:max(12px,env(safe-area-inset-left));z-index:6;display:flex;flex-direction:column;align-items:flex-start;gap:3px;pointer-events:none}
#hudL>*{position:static!important;transform:none!important;margin:0!important;background:none!important;border:0!important;box-shadow:none!important;padding:0!important;min-width:0!important;width:auto!important;height:auto!important;display:flex!important;flex-direction:row;align-items:center;gap:8px;text-shadow:0 2px 0 #000,0 0 8px rgba(0,0,0,.9);filter:drop-shadow(0 2px 0 rgba(0,0,0,.75))}
#hudL #hour{font-size:clamp(20px,5.2vw,30px)}
#hudL #lives,#hudL #cash{font-size:clamp(16px,4.2vw,22px)}`;
  document.head.appendChild(css);
})();

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
  if (fresh) { save.run = null; save.tutDone = false; save.tutStep = 0; persist(); }   // a brand new store plays Sara's tutorial again
  game = new Game({ meta: save.levels });
  game.on = onEvent;
  if (save.run) { try { game.restore(save.run); } catch (e) { save.run = null; game = new Game({ meta: save.levels }); game.on = onEvent; } }
  view.setGame(game); view.menu = true; view.tod = 0;
  running = false; selected = null; pickedTower = null; preview = null; speed = 1;
  $('speed').textContent = '1x'; setPaused(false);
  $('hud').classList.add('off'); $('info').classList.add('off'); $('dock').classList.add('off'); $('skillSlots').classList.add('off'); closeTray(); setTab('stocks'); $('title').classList.remove('off', 'pop'); $('stage').classList.add('menu'); $('t-restart').classList.toggle('off', !save.run);
  closeModal(); hideTarot(); buildCards(); refresh(); tutStop();
}

function startRun() {
  running = true; view.menu = false; selected = null;
  $('stage').classList.remove('menu'); $('title').classList.add('pop'); setTimeout(() => { if (running) $('title').classList.add('off'); }, 480);
  $('hud').classList.remove('off'); $('info').classList.remove('off'); $('dock').classList.remove('off'); $('skillSlots').classList.remove('off');
  banner(game.wave ? `☀ Day ${game.wave + 1} — welcome back` : '☀ Day 1 — stock up, then open the store!'); refresh();
  if (game.phase === 'restock') showRestock();
  tutStart();
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
// money bullets: a green pellet with a particle trail flies from the counter to the money counter in the top-left corner
function moneyShot(x, y, amount) {
  if (document.hidden) return;
  const n = amount >= 60 ? 3 : amount >= 25 ? 2 : 1;
  for (let i = 0; i < n; i++) setTimeout(() => shootOne(x, y), i * 90);
}
function trailBit(x, y, spread, life) {
  const p = document.createElement('div'); p.className = 'mtrail';
  p.style.left = x + 'px'; p.style.top = y + 'px'; p.style.background = ['#3ddc84', '#8dffb4', '#1f9d55'][Math.floor(Math.random() * 3)];
  document.body.appendChild(p);
  p.animate([{ opacity: 1, transform: 'translate(-50%,-50%) scale(1)' },
    { opacity: 0, transform: `translate(calc(-50% + ${(Math.random() - 0.5) * spread}px), calc(-50% + ${(Math.random() - 0.5) * spread}px)) scale(.2)` }],
    { duration: life * (0.7 + Math.random() * 0.6), easing: 'ease-out' }).onfinish = () => p.remove();
}
function shootOne(x, y) {
  const a = view.project(x, y, 1.35), cr = $('cash').getBoundingClientRect(), b = { x: cr.left + cr.width / 2, y: cr.top + cr.height / 2 };
  const c = { x: (a.x + b.x) / 2 + (Math.random() - 0.5) * 120, y: Math.min(a.y, b.y) - 60 - Math.random() * 50 };   // bends the flight into an arc
  const el = document.createElement('div'); el.className = 'mshot'; document.body.appendChild(el);
  const T = 600, t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / T), e = k * k * 0.75 + k * 0.25, u = 1 - e;   // starts fast, speeds up into the target
    const px = u * u * a.x + 2 * u * e * c.x + e * e * b.x, py = u * u * a.y + 2 * u * e * c.y + e * e * b.y;
    const dx = 2 * u * (c.x - a.x) + 2 * e * (b.x - c.x), dy = 2 * u * (c.y - a.y) + 2 * e * (b.y - c.y);
    el.style.transform = `translate(${px}px,${py}px) translate(-50%,-50%) rotate(${Math.atan2(dy, dx)}rad)`;
    trailBit(px, py, 26, 460); if (k > 0.1) trailBit(px, py, 16, 360);
    if (k < 1) { requestAnimationFrame(step); return; }
    el.remove();
    for (let i = 0; i < 12; i++) trailBit(b.x, b.y, 70, 480);
    const cash = $('cash'); cash.classList.remove('pulse'); void cash.offsetWidth; cash.classList.add('pulse');
  };
  requestAnimationFrame(step);
}
function banner(t) { const b = $('banner'); b.innerHTML = pxText(t); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }

function onEvent(type, d) {
  view.onEvent(type, d);
  switch (type) {
    case 'place': sfx.place(); break;
    case 'upgrade': sfx.upgrade(); break;
    case 'stock': sfx.restock(); break;
    case 'sell': if (d.tower.broken !== 'destroyed') sfx.sell(); break;
    case 'renovate': sfx.renovate(); break;
    case 'hit': sfx.hit(); break;
    case 'splash': sfx.wet(); break;
    case 'iceBurst': sfx.shatter(); break;
    case 'canHit': sfx.can(); break;
    case 'gumHit': sfx.gumHit(); break;
    case 'colaSplash': sfx.wet(); break;
    case 'swirl': sfx.swirl(); break;
    case 'skillPlace': sfx.place(); break;
    case 'colaBlast': sfx.colaBlast(); break;
    case 'cigLaunch': sfx.cigLaunch(); break;
    case 'cigBoom': sfx.cigPop(); break;
    case 'slip': sfx.slip(); break;
    case 'unlock': sfx.unlock(); banner(`🔓 ${ITEMS[d.type].name} unlocked!`); break;
    case 'buy': sfx.buy(); floatText(d.x, d.y, '🛒', 'sale', 1.5); break;
    case 'pay': sfx.sale(); floatText(d.x, d.y, '+$' + d.amount, 'sale', 1.5); moneyShot(d.x, d.y, d.amount); break;
    case 'soldout': floatText(d.x, d.y, 'Sold out!', 'bad', 1.5); break;
    case 'empty': floatText(d.x, d.y, '😕 nothing to buy', 'bad', 1.2); break;
    case 'dayStart': sfx.day(); banner(`☀ Day ${d.n}`); break;
    case 'evening': banner(`Store closed: +$${d.sales}`); break;
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
    case 'service': sfx.fix(); floatText(d.tower.x, d.tower.y, 'Serviced', 'good', 1.6); break;
    case 'replace': sfx.replace(); floatText(d.tower.x, d.tower.y, 'Replaced!', 'good', 1.6); break;
    case 'waveStart': sfx.wave(); banner(d.subs > 1 ? `🌙 Night ${d.n} — wave 1/${d.subs}` : `🌙 Night ${d.n} — burglars!`); break;
    case 'subClear': sfx.win(); banner(`Wave ${d.sub}/${d.subs} cleared — next one in ${d.gap}s`); break;
    case 'subWave': sfx.wave(); banner(d.sub === d.subs ? `🌙 Final wave ${d.sub}/${d.subs}!` : `🌙 Wave ${d.sub}/${d.subs}`); break;
    case 'waveClear': bankProgress(); sfx.win(); banner('Clear! +$' + d.bonus); break;
    case 'freeze': sfx.freeze(); floatText(d.enemy.x, d.enemy.y, '🧊 Frozen!', 'good', 1.5); break;
    case 'bounce': sfx.bounce(); break;
    case 'retry': banner(`☀ Day ${d.n} again — you've got this`); break;
    case 'restock': setTimeout(showRestock, 900); break;
    case 'lost': sfx.lost(); setTimeout(showLost, 700); break;
  }
  if (SAVE_EVENTS.has(type)) saveRun();
  refresh();
}

// ---------- build tray (opened by the icon in the bottom-right; 3D assets rendered as pixel icons) ----------
const icons = {};   // pixel-art item icons (build button + cards)
const available = () => BUILD_ORDER.filter(id => game.isUnlocked(id));   // shelves + vending machine at first, the rest are bought in the shop
// ---------- build menu: a fixed-size card. LEFT = detail card of the focused item, RIGHT = tabs + 5x5 item grid ----------
const trayCss = document.createElement('style');
trayCss.textContent = `
#tray{width:min(940px,96vw)!important;height:min(540px,88vh)!important;max-width:96vw!important;max-height:94vh!important;padding:16px!important;overflow:hidden!important}
#tray,#tray *,#modal,#card{scrollbar-width:none;-ms-overflow-style:none}
#tray::-webkit-scrollbar,#tray *::-webkit-scrollbar,#modal::-webkit-scrollbar,#card::-webkit-scrollbar{display:none;width:0;height:0}
#skillSlots.dayHide{display:none!important}
#tray .tWrap{height:100%;display:flex;flex-direction:column;gap:14px;min-height:0}
#tray .tWrap>.hd{margin:0;flex:none}
#tray .tBody{position:relative;flex:1;min-height:0}
#tray .tPane{position:absolute;inset:0;overflow:auto}
#tray #renoPane{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px}
#tray #renoPane .grid{justify-content:center}
#tray #stocksPane{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.25fr);gap:16px;overflow:hidden;padding:0 4px 8px}
#tray .dCard{flex:none;min-height:0;overflow:hidden;gap:8px;padding:14px 14px 12px;box-shadow:0 6px 0 #d9b08a}
#tray .dCard .pic{flex:none;width:clamp(64px,20vh,104px);height:auto;aspect-ratio:1}
#tray .dCard .pic img{width:84%;height:84%}
#tray .dCard .nm{flex:none}
#tray .dCard .ds{min-height:0;overflow:auto}
#tray .gCol{min-height:0;display:flex;flex-direction:column;gap:12px}
#tray #subTabs{margin:0;flex:none}
#tray #trayGrid{flex:1;min-height:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));grid-template-rows:repeat(5,minmax(0,1fr));gap:8px;padding:10px;border-radius:22px;background:rgba(0,0,0,.24);overflow:hidden}
#tray .sc{position:relative;min-width:0;min-height:0;padding:0;border-radius:16px;border:3px solid #fff;background:linear-gradient(180deg,#fffaf0,#ffe9cf);box-shadow:0 3px 0 #d9b08a;display:grid;place-items:center;cursor:pointer;overflow:hidden;font:inherit}
#tray .sc:active{transform:translateY(2px);box-shadow:0 1px 0 #d9b08a}
#tray .sc img{width:62%;height:62%;object-fit:contain;image-rendering:pixelated;margin-bottom:10px}
#tray .sc.empty{background:rgba(255,255,255,.06);border:2px dashed rgba(255,255,255,.12);box-shadow:none;cursor:default}
#tray .sc.foc{border-color:#ffd23f;box-shadow:0 3px 0 #e0a800,0 0 0 3px rgba(255,210,63,.5)}
#tray .sc.sel:not(.foc){border-color:#5fe3a1}
#tray .sc.lock{background:linear-gradient(180deg,#f1ebe3,#ded3c6)}
#tray .sc.lock img{filter:grayscale(1) opacity(.55)}
#tray .sc-k{position:absolute;left:5px;top:3px;font:700 11px/1 var(--cf);color:#d2631a}
#tray .sc-lk{position:absolute;right:4px;top:2px;font-size:12px;display:none}
#tray .sc.lock .sc-lk{display:block}
#tray .sc-pr{position:absolute;left:0;right:0;bottom:2px;text-align:center;font:700 12px/1 var(--cf);color:#d2631a}
@media (max-height:480px){
  #tray{height:94vh!important;padding:10px!important}
  #tray .tWrap{gap:8px}  #tray .dCard{padding:8px 10px;gap:5px}#tray .dCard .pic{width:48px}  #tray #stocksPane{gap:10px}#tray #trayGrid{gap:5px;padding:6px}
}`;
document.head.appendChild(trayCss);
$('tray').innerHTML = `<div class="tWrap">
  <div class="hd"><div class="tabs"><button class="pxb tab on" id="tabStocks">STOCKS</button><button class="pxb tab" id="tabReno">RENOVATE</button><button class="pxb tab" id="tabShop">PAYCHECK SHOP</button></div><button class="pxb sq" id="trayClose" aria-label="Close">X</button></div>
  <div class="tBody">
    <div class="tPane" id="stocksPane">
      <div class="card dCard" id="dCard"><div class="pic"><img id="dImg" alt=""></div><div class="nm" id="dNm"></div><div class="ds" id="dDs"></div><button class="pxb" id="dAct"></button></div>
      <div class="gCol"><div id="subTabs" class="tabs"><button class="pxb tab on" id="subSell">SELLABLES</button><button class="pxb tab" id="subSkill">SKILL ITEMS</button></div><div id="trayGrid"></div></div>
    </div>
    <div class="tPane off" id="renoPane"></div>
    <div class="tPane off" id="shopPane"></div>
  </div></div>`;

const cells = new Map();   // item id -> grid cell button
let focusId = 'shelf';     // the item shown in the left detail card
function buildCards() {
  $('trayGrid').innerHTML = ''; cells.clear();
  BUILD_ORDER.forEach(id => {
    icons[id] = view.makeIcon(id);
    const c = document.createElement('button'); c.className = 'sc'; c.dataset.id = id; c.title = ITEMS[id].name;
    c.innerHTML = `<img alt="" src="${icons[id]}"><span class="sc-k" data-k></span><span class="sc-lk">🔒</span><span class="sc-pr" data-pr></span>`;
    c.onclick = () => { focusId = id; refresh(); };
    cells.set(id, c);
  });
  $('buildIcon').src = pxEmoji('🔨', 16);
  applySub();
}
// the STOCKS tab has two sub-tabs: SELLABLES (shelves + turrets) and SKILL ITEMS (mop, shaken cola, cigarettes)
let subTab = 'sell';
function applySub() {
  $('subSell').classList.toggle('on', subTab === 'sell'); $('subSkill').classList.toggle('on', subTab === 'skill');
  const box = $('trayGrid'), ids = BUILD_ORDER.filter(id => (SKILLS.includes(id) ? 'skill' : 'sell') === subTab);
  box.innerHTML = '';
  if (!ids.includes(focusId)) focusId = ids[0];
  ids.forEach(id => box.appendChild(cells.get(id)));
  for (let i = ids.length; i < 25; i++) { const e = document.createElement('div'); e.className = 'sc empty'; box.appendChild(e); }   // always a full 5x5 grid
  if (game) refresh();
}
// left card: icon, name, description, stats and the build / unlock button
let detailKey = '';
function renderDetail() {
  const id = focusId, def = ITEMS[id]; if (!def || !game) return;
  const locked = !game.isUnlocked(id), cost = game.costOf(id), uc = UNLOCKS[id];
  const key = id + '|' + locked; if (key !== detailKey) {
    detailKey = key;
    $('dImg').src = icons[id] || ''; $('dNm').textContent = def.name; $('dDs').textContent = def.desc; $('dDs').scrollTop = 0;
  }
  $('dCard').classList.toggle('lock', locked); $('dCard').classList.toggle('sel', !locked && selected === id);
  const act = $('dAct');
  act.className = 'pxb ' + (locked ? 'gold' : selected === id ? 'green' : '');
  act.disabled = locked ? game.cash < uc : cost > game.cash;
  const txt = locked ? `🔒 Unlock $${uc}` : selected === id ? '✔ Selected' : `🔨 Build $${cost}`;   // plain text: smooth emoji, not pixel sprites
  if (act.textContent !== txt) act.textContent = txt;
}
$('dAct').onclick = () => {
  const id = focusId;
  if (!game.isUnlocked(id)) { if (!game.unlock(id)) { sfx.bad(); banner(`Need $${UNLOCKS[id]} to unlock ${ITEMS[id].name}`); } else noteSkill(id, true); return; }   // unlocking costs store profit
  selected = selected === id ? null : id; if (selected) noteSkill(id, true); pickedTower = null; preview = null; view.setCursor(null); closeTray(); refresh();
};
$('subSell').onclick = () => { subTab = 'sell'; applySub(); };
$('subSkill').onclick = () => { subTab = 'skill'; applySub(); };
// the 3 most recently bought / selected skill items sit in slots at the bottom-left
const RECENT_KEY = 'shelfDefenseRecentSkills';
let recentSkills = []; try { recentSkills = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter(id => SKILLS.includes(id)).slice(0, 3); } catch (e) { /* no storage */ }
function noteSkill(id, toFront) {
  if (!SKILLS.includes(id)) return;
  if (!toFront && recentSkills.includes(id)) return;   // placing one from a slot must not shuffle the slots under your finger
  recentSkills = [id, ...recentSkills.filter(x => x !== id)].slice(0, 3);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentSkills)); } catch (e) { /* no storage */ }
}
let slotHTML = '';
function renderSlots() {
  const box = $('skillSlots'); if (!box || !game) return;
  const ids = recentSkills.filter(id => game.isUnlocked(id));
  let html = '';
  for (let i = 0; i < 3; i++) {
    const id = ids[i];
    if (!id) { html += '<button class="slot empty" title="Skill items">+</button>'; continue; }
    const def = ITEMS[id], cost = game.costOf(id), wait = def.kind === 'skill' && game.phase !== 'wave', dis = cost > game.cash || wait;
    html += `<button class="slot ${selected === id ? 'sel' : ''} ${dis ? 'dis' : ''}" data-id="${id}" title="${def.name}"><img alt="" src="${icons[id] || ''}"><span class="cost">$${cost}</span>${wait ? '<span class="lk">🌙</span>' : ''}</button>`;
  }
  if (html !== slotHTML) { box.innerHTML = html; slotHTML = html; }
}
$('skillSlots').addEventListener('click', e => {
  const b = e.target.closest('.slot'); if (!b || !game) return;
  if (!b.dataset.id) { subTab = 'skill'; setTab('stocks'); applySub(); openTray(); return; }   // empty slot: open the skill items
  const id = b.dataset.id;
  selected = selected === id ? null : id; pickedTower = null; preview = null; view.setCursor(null); closeTray(); refresh();
});
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
  $('stocksPane').classList.toggle('off', tab !== 'stocks'); $('renoPane').classList.toggle('off', tab !== 'reno'); $('shopPane').classList.toggle('off', tab !== 'shop');
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
    if (game.renovate()) { view.setGame(game); banner(`🏠 Renovated: ${size(game.room)}x${size(game.room)} store`); pickedTower = null; preview = null; refresh(); }
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
  $('waveTxt').textContent = game.phase === 'wave' ? (game.subWaves > 1 ? `NIGHT ${game.wave + 1} · WAVE ${game.subWave}/${game.subWaves}` : `NIGHT ${game.wave + 1}`) : `DAY ${game.wave + 1}`;
  $('clock').classList.toggle('night', game.isNight);
  const rs = $('restockAll'), cost = game.restockCost();
  $('rsCost').textContent = cost; rs.disabled = cost === 0 || game.cash < cost || game.phase === 'lost';   // restock-all only when you can afford the whole refill
  const av = available();
  for (const [id, c] of cells) {
    const locked = !game.isUnlocked(id), cost = game.costOf(id);
    c.classList.toggle('lock', locked); c.classList.toggle('sel', !locked && selected === id); c.classList.toggle('foc', focusId === id);
    c.querySelector('[data-k]').textContent = locked ? '' : av.indexOf(id) + 1;
    c.querySelector('[data-pr]').textContent = '$' + (locked ? UNLOCKS[id] : cost);
  }
  renderDetail();
  const bi = $('buildIcon');   // the build icon shows what you're holding
  if (selected && icons[selected]) { if (bi.dataset.k !== selected) { bi.src = icons[selected]; bi.className = ''; bi.dataset.k = selected; } }
  else if (bi.dataset.k !== 'hammer') { bi.src = pxEmoji('🔨', 16); bi.className = 'pxe'; bi.dataset.k = 'hammer'; }
  const go = $('go'), setGo = (cls, dis, txt) => { go.disabled = dis; go.className = 'pxb ' + cls; setHTML(go, txt); };
  if (game.phase === 'prep') { if (game.canOpen().ok) setGo('gold', false, '☀ OPEN<br>STORE'); else setGo('', false, '🔒 OPEN<br>STORE'); }   // an empty store can't open
  else if (game.phase === 'morning') setGo('', true, '🛒 STORE<br>OPEN');
  else if (game.phase === 'evening') setGo('red', false, `🌙 NIGHT IN ${Math.max(1, Math.ceil(game.nightIn))}<br>TAP: NOW`);   // starts by itself; tapping skips the wait
  else if (game.phase === 'wave') setGo('', true, '🌙 NIGHT<br>DEFEND!');
  else setGo('', true, '...');
  musicWant = !running ? null : game.phase === 'wave' ? 'night' : game.phase === 'lost' ? null : 'day';
  renderInfo();
  renderReno(); renderSlots();
  $('skillSlots').classList.toggle('dayHide', game.phase !== 'wave');   // skill items only work at night
  view.setRange(...rangeFor());
}

function rangeFor() {
  if (pickedTower && pickedTower.kind === 'tower') return [pickedTower, game.stat(pickedTower, 'range')];
  const c = preview || hover;
  if (selected && c && ITEMS[selected].range) return [c, ITEMS[selected].range * (ITEMS[selected].kind === 'skill' ? 1 : game.mods.range)];
  if (selected && c && ITEMS[selected].radius) return [c, ITEMS[selected].radius];
  return [null, 0];
}

// ---------- floating action icons (replaces the old bottom-left info card) ----------
// Tap a shelf / machine and a little row of icon buttons pops up right on top of it. Delegated click handler, so the
// buttons survive refresh() calls; the markup is only rebuilt when something in it actually changed.
const popCss = document.createElement('style');
popCss.textContent = `
#pop{position:fixed;z-index:30;display:none;flex-direction:column;align-items:center;gap:4px;pointer-events:none;transform:translate(-50%,-100%);font-family:inherit}
#pop.on{display:flex}
#pop .hd{pointer-events:none;background:rgba(17,13,38,.92);color:#fff;border:2px solid #0d0b1d;border-radius:8px;padding:2px 8px;font-size:12px;line-height:1.3;text-align:center;white-space:nowrap}
#pop .hd small{color:#ffcf4a;margin-left:4px}
#pop .bars{display:flex;gap:4px;margin-top:2px}
#pop .b{display:block;width:34px;height:5px;background:#2a2450;border-radius:3px;overflow:hidden}
#pop .b i{display:block;height:100%;background:#5fe3a1}#pop .b.lo i{background:#ff5a5f}#pop .b.wear i{background:#6fa8ff}#pop .b.hot i{background:#ffb703}
#pop .row{display:flex;gap:6px;pointer-events:auto}
#pop .pi{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:46px;min-height:46px;padding:3px 6px;border-radius:12px;border:2px solid #0d0b1d;background:#ffcf4a;color:#1b1530;font:inherit;font-weight:700;cursor:pointer;box-shadow:0 3px 0 #0d0b1d;touch-action:manipulation}
#pop .pi .ic{font-size:20px;line-height:1}#pop .pi .lb{font-size:11px;line-height:1.1;margin-top:1px}
#pop .pi.blue{background:#8fc2ff;margin-left:6px}#pop .pi.green{background:#5fe3a1}#pop .pi.red{background:#ff6b6b}#pop .pi.gray{background:#d9d4ec}
#pop .pi:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 #0d0b1d}
#pop .pi:disabled{opacity:.45;cursor:default}
#info{display:none!important}
canvas#view{touch-action:none;-webkit-tap-highlight-color:transparent;user-select:none}
html,body{overscroll-behavior:none;-webkit-text-size-adjust:100%}
@media (max-width:760px),(pointer:coarse){
  #card{max-width:94vw;max-height:86vh;overflow:auto;box-sizing:border-box}
  #pop .pi{min-width:52px;min-height:52px}
}`;
document.head.appendChild(popCss);
const pop = document.createElement('div'); pop.id = 'pop'; document.body.appendChild(pop);
let popHTML = '', popKey = '';
const pbtn = (act, icon, label, dis, cls = '') => `<button class="pi ${cls}" data-a="${act}" ${dis ? 'disabled' : ''}><span class="ic">${icon}</span>${label ? `<span class="lb">${label}</span>` : ''}</button>`;
const pbar = (cls, v) => `<span class="b ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></span>`;

function hidePop() { pop.classList.remove('on'); popKey = ''; }
function placePop(x, y, h) {
  const p = view.project(x, y, h), w = pop.offsetWidth, ph = pop.offsetHeight, below = p.y - ph < 56;
  const px = Math.max(w / 2 + 6, Math.min(innerWidth - w / 2 - 6, p.x));
  let py = below ? view.project(x, y, 0).y + 14 : p.y;
  py = Math.max(ph + 4, Math.min(innerHeight - 4, below ? py + ph : py));
  pop.style.left = px + 'px'; pop.style.top = py + 'px';
}
function renderInfo() {
  $('info').classList.add('off');
  if (!game || !running || game.phase === 'lost' || trayOpen()) { hidePop(); return; }
  let html = '', at = null, key = '';
  if (pickedTower && pickedTower.kind === 'shelf' && game.shelves.includes(pickedTower)) {
    const s = pickedTower, need = MAX_STOCK - s.units, can = Math.min(need, Math.floor(game.cash / game.unitCost()));
    at = [s.x, s.y, 1.5];
    html = `<div class="hd">Shelf <small>${s.units}/${MAX_STOCK}</small><div class="bars">${pbar(s.hp / s.maxhp < 0.35 ? 'lo' : '', s.hp / s.maxhp)}</div></div><div class="row">`
      + pbtn('rst', '📦', need === 0 ? 'FULL' : '$' + can * game.unitCost(), can <= 0, 'green') + (s.placed ? pbtn('sell', '💰', '$' + game.sellValue(s), false, 'red') : '') + '</div>';
  } else if (pickedTower && (game.towers.includes(pickedTower) || game.traps.includes(pickedTower))) {
    const t = pickedTower, def = ITEMS[t.type], isT = t.kind === 'tower', up = isT ? game.upgradeCost(t) : 0;
    at = [t.x, t.y, isT ? 1.9 : 0.8];
    const bars = isT ? `<div class="bars">${pbar(t.hp / t.maxhp < 0.35 ? 'lo' : '', t.hp / t.maxhp)}${pbar(t.wear > 0.7 ? 'hot' : 'wear', t.wear)}</div>` : '';
    const tag = !isT ? `${t.uses} left` : t.broken ? 'BROKEN' : `Lv ${t.level}/${MAX_LEVEL}`;
    let acts = '';
    if (isT && t.broken) acts += pbtn('rpl', '🛠️', '$' + game.replaceCost(t), game.replaceCost(t) > game.cash, 'gold');
    if (isT && !t.broken) {
      acts += pbtn('upg', '⏫', t.level >= MAX_LEVEL ? 'MAX' : '$' + up, t.level >= MAX_LEVEL || up > game.cash, 'green');
      if (game.needsService(t)) acts += pbtn('svc', '🔧', '$' + game.serviceCost(t), game.serviceCost(t) > game.cash);
    }
    acts += pbtn('sell', '💰', '$' + game.sellValue(t), false, 'red');
    if (isT) acts += pbtn('rot', '🔄', 'TURN', false, 'blue');   // rightmost button
    html = `<div class="hd">${def.name} <small>${tag}</small>${bars}</div><div class="row">${acts}</div>`;
  } else if (selected && preview) {   // touch: first tap previews the spot, then confirm / cancel right on it
    at = [preview.x, preview.y, 1.3];
    html = `<div class="hd">${ITEMS[selected].name} <small>$${game.costOf(selected)}</small></div><div class="row">${pbtn('place', '✔', '', !game.canPlace(selected, preview.x, preview.y).ok, 'green')}${pbtn('cancel', '✖', '', false, 'gray')}</div>`;
  } else if (selected) {   // mouse: nothing on the map to hang icons on, so just a small cancel chip
    hidePop(); return;
  } else { hidePop(); return; }
  key = html + at.join(',');
  if (key !== popKey) { pop.innerHTML = html; popKey = key; }
  pop.classList.add('on'); placePop(...at);
}
pop.addEventListener('click', e => {
  const b = e.target.closest('button[data-a]'); if (!b || b.disabled || !game) return;
  const t = pickedTower, a = b.dataset.a;
  if (a === 'rst') { if (!game.restock(t)) sfx.bad(); }
  else if (a === 'sell') { if (t.kind === 'trap') sfx.sell(); game.sell(t); pickedTower = null; }
  else if (a === 'upg') { if (!game.upgrade(t)) sfx.bad(); }
  else if (a === 'svc') { if (!game.service(t)) sfx.bad(); }
  else if (a === 'rot') { if (game.rotate(t)) sfx.place(); }
  else if (a === 'rpl') { if (!game.replace(t)) sfx.bad(); }
  else if (a === 'place' && selected && preview) { if (game.canPlace(selected, preview.x, preview.y).ok) { game.place(selected, preview.x, preview.y); noteSkill(selected, false); preview = null; view.setCursor(null); } else sfx.bad(); }
  else if (a === 'cancel') { selected = null; preview = null; pickedTower = null; view.setCursor(null); }
  refresh();
});
window.addEventListener('resize', () => game && refresh());
window.addEventListener('orientationchange', () => setTimeout(() => game && refresh(), 250));

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
  if (chk.ok) { game.place(selected, c.x, c.y); noteSkill(selected, false); preview = null; view.setCursor(null); }
  else { sfx.bad(); floatText(c.x, c.y, chk.reason, 'bad'); }
  refresh();
});
window.addEventListener('keydown', e => {
  if (!game || !running) return;
  if (paused) { if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') $('pause').click(); return; }
  const i = parseInt(e.key, 10);
  const av = available();
  if (i >= 1 && i <= av.length) { selected = av[i - 1]; pickedTower = null; preview = null; closeTray(); refresh(); }
  else if (e.key === 'b' || e.key === 'B') { trayOpen() ? closeTray() : openTray(); }
  else if (e.key === 'Escape') { selected = null; pickedTower = null; preview = null; view.setCursor(null); refresh(); }
  else if (e.key === ' ' && (game.phase === 'prep' || game.phase === 'evening')) { e.preventDefault(); $('go').click(); }
  else if (e.key === 'p' || e.key === 'P') $('pause').click();
  else if ((e.key === 't' || e.key === 'T') && pickedTower && pickedTower.kind === 'tower') { if (game.rotate(pickedTower)) { sfx.place(); refresh(); } }
  else if ((e.key === 'r' || e.key === 'R') && !$('restockAll').disabled) $('restockAll').click();
});
$('go').onclick = () => {
  if (paused) setPaused(false);
  if (tutBlocksOpen()) { sfx.bad(); banner('Sara: Tapusin muna natin ang 5 shelf!'); return; }
  if (game.phase === 'prep') { const c = game.canOpen(); if (!c.ok) { sfx.bad(); banner('🔒 ' + c.reason); return; } }
  if (game.startDay() || game.startWave()) { preview = null; view.setCursor(null); refresh(); }
};
$('restockAll').onclick = () => { if (!game.restockAll()) sfx.bad(); refresh(); };
$('speed').onclick = () => { speed = speed % 3 + 1; $('speed').textContent = speed + 'x'; };
function setPaused(v) {
  paused = v; $('pause').textContent = v ? '▶' : '❚❚'; $('pause').classList.toggle('on', v); $('pauseMenu').classList.toggle('off', !v); if (!v) pauseView(false);
}
$('p-continue').onclick = () => setPaused(false);
const pSet = document.createElement('button'); pSet.id = 'p-settings'; pSet.className = 'pxb'; pSet.textContent = '⚙ SETTINGS';
$('p-exit').before(pSet);
const setCss = document.createElement('style');
setCss.textContent = `
#p-set{display:flex;flex-direction:column;gap:14px;text-align:left}
#p-set .sr{display:flex;flex-direction:column;gap:6px;background:rgba(255,255,255,.1);border-radius:20px;padding:12px 16px}
#p-set .sl{display:flex;justify-content:space-between;font:700 17px/1 var(--cf);color:#fff7e0}
#p-set .sl b{color:#ffd23f}
#p-set input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:14px;border-radius:99px;margin:8px 0;cursor:pointer;outline:none;border:0;
  background:linear-gradient(90deg,#ffc233 var(--v,50%),rgba(255,255,255,.2) var(--v,50%));touch-action:none}
#p-set input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:28px;height:28px;border-radius:50%;background:#fff;border:5px solid #ffc233;box-shadow:0 3px 0 rgba(0,0,0,.35)}
#p-set input[type=range]::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:#fff;border:5px solid #ffc233;box-shadow:0 3px 0 rgba(0,0,0,.35)}`;
document.head.appendChild(setCss);
const pPane = document.createElement('div'); pPane.id = 'p-set'; pPane.className = 'off';
pPane.innerHTML = `<div class="sr"><div class="sl"><span>🎵 Music</span><b id="vMusicV"></b></div><input type="range" id="vMusic" min="0" max="100" step="1"></div>
  <div class="sr"><div class="sl"><span>🔊 Sound effects</span><b id="vSfxV"></b></div><input type="range" id="vSfx" min="0" max="100" step="1"></div>
  <button class="pxb gold" id="p-back">◀ BACK</button>`;
$('pauseMenu').querySelector('.pbox').appendChild(pPane);
function bindSlider(id, key, apply) {
  const el = $(id), val = $(id + 'V');
  const paint = () => { el.value = Math.round(settings[key] * 100); el.style.setProperty('--v', el.value + '%'); val.textContent = el.value + '%'; };
  paint();
  el.addEventListener('input', () => { settings[key] = el.value / 100; paint(); apply(); });
  el.addEventListener('change', () => { persist(); if (key === 'sfx') sfx.sale(); });   // let go of the sfx slider = hear a sample
}
bindSlider('vMusic', 'music', () => { musicOn = true; });
bindSlider('vSfx', 'sfx', () => { if (outGain) outGain.gain.value = settings.sfx * 1.36; });
function pauseView(on) {
  $('pauseMenu').querySelector('h1').textContent = on ? 'SETTINGS' : 'PAUSED';
  for (const id of ['p-continue', 'p-settings', 'p-exit']) $(id).classList.toggle('off', on);
  pPane.classList.toggle('off', !on);
}
pSet.onclick = () => pauseView(true);
$('p-back').onclick = () => pauseView(false);
$('p-exit').onclick = () => { setPaused(false); persist(); newStore(); };
$('pause').onclick = () => { if (game && running) setPaused(!paused); };
$('mute').onclick = () => { muted = !muted; if (!muted) { musicOn = true; audio(); } setHTML($('mute'), muted ? '🔇' : '🔊'); };

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
  const pane = $('shopPane'), top = $('shopPane').scrollTop;
  pane.innerHTML = shopHTML();
  pane.querySelectorAll('.choice').forEach(b => b.onclick = () => {
    if (buyMeta(b.dataset.id)) { if (shopDirty) { buildCards(); shopDirty = false; } renderShopTab(); refresh(); }
  });
  pane.scrollTop = top;
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

// ---------- the morning delivery: tarot cards (3D tilt, flip to reveal, pick one) ----------
const tarotCss = document.createElement('style');
tarotCss.textContent = `
#tarot{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 35%,rgba(70,34,130,.9),rgba(6,3,16,.97));overflow:auto;padding:14px;box-sizing:border-box;color:#fff;font-family:inherit}
#tarot.on{display:flex;animation:tfade .45s both}
@keyframes tfade{from{opacity:0}to{opacity:1}}
#tarot .tt{display:flex;flex-direction:column;align-items:center;gap:12px;max-width:100%;margin:auto}
#tarot .th{font-size:clamp(18px,4.6vw,30px);color:#ffcf4a;text-align:center;text-shadow:0 3px 0 #000}
#tarot .ts{font-size:clamp(11px,2.8vw,14px);color:#cfc6ff;text-align:center}
#tarot .tr{display:flex;flex-wrap:wrap;justify-content:center;gap:clamp(8px,2.4vw,22px);perspective:1200px}
#tarot .tc{--w:min(172px,28vw);width:var(--w);height:calc(var(--w)*1.62);font-size:max(10px,calc(var(--w)/11.5));position:relative;cursor:pointer;perspective:900px;-webkit-tap-highlight-color:transparent;user-select:none;
  animation:tdeal .8s cubic-bezier(.2,.9,.25,1.12) both;animation-delay:calc(var(--i)*.14s)}
@keyframes tdeal{from{transform:translateY(90vh) rotate(-24deg) scale(.5);opacity:0}to{transform:none;opacity:1}}
#tarot .ti{position:absolute;inset:0;transform-style:preserve-3d;transform:translateZ(var(--z,0px)) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .16s ease-out}
#tarot .tf{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .9s cubic-bezier(.2,.8,.2,1)}
#tarot .tc.up .tf{transform:rotateY(180deg)}
#tarot .face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:calc(var(--w)/12);border:calc(var(--w)/36) solid #e3b93c;box-shadow:0 16px 30px rgba(0,0,0,.6),inset 0 0 0 calc(var(--w)/55) rgba(0,0,0,.55);overflow:hidden;box-sizing:border-box;display:flex;flex-direction:column;align-items:center}
#tarot .back{background:repeating-linear-gradient(45deg,#2b1662 0 9px,#37197f 9px 18px);justify-content:center;gap:.4em;color:#e3b93c}
#tarot .back::after{content:'';position:absolute;inset:7%;border:2px dashed rgba(227,185,60,.65);border-radius:calc(var(--w)/16)}
#tarot .back .sg{font-size:4.2em;text-shadow:0 0 18px rgba(255,207,74,.8)}#tarot .back .sg2{font-size:1.8em;opacity:.8;letter-spacing:.3em}
#tarot .front{transform:rotateY(180deg);background:linear-gradient(165deg,hsl(var(--hue) 55% 32%),hsl(var(--hue) 50% 13%));padding:7% 8%;gap:.35em;text-align:center}
#tarot .rn{color:#e3b93c;font-size:1.15em;letter-spacing:.2em;border-bottom:1px solid rgba(227,185,60,.5);padding-bottom:.2em;width:70%}
#tarot .ic{font-size:3.7em;line-height:1.15;filter:drop-shadow(0 4px 6px rgba(0,0,0,.5))}
#tarot .nm{font-weight:800;font-size:1.2em;color:#ffe08a;line-height:1.15}
#tarot .ds{font-size:.98em;color:#e9e4ff;line-height:1.25}
#tarot .gl{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .2s;mix-blend-mode:screen;background:radial-gradient(circle at var(--gx,50%) var(--gy,30%),rgba(255,255,255,.42),transparent 55%)}
#tarot .tc:hover .gl{opacity:1}
#tarot .tc.up:hover .face{border-color:#fff1b8}
#tarot .tc.chosen{z-index:3;animation:tchosen 1s ease-in forwards}
@keyframes tchosen{0%{transform:none}35%{transform:translateY(-4%) scale(1.22)}100%{transform:translateY(-8%) scale(1.55);opacity:0}}
#tarot .tc.chosen .face{box-shadow:0 0 50px 14px rgba(255,207,74,.95)}
#tarot .tc.gone{animation:tgone .6s ease-in forwards;pointer-events:none}
@keyframes tgone{to{transform:translateY(70vh) rotate(16deg) scale(.7);opacity:0}}
#tarot .tbtn{font:inherit;font-weight:800;padding:10px 18px;border-radius:12px;border:2px solid #0d0b1d;background:#ffcf4a;color:#1b1530;cursor:pointer;box-shadow:0 3px 0 #0d0b1d;min-height:44px}
#tarot .tbtn:disabled{opacity:.45}
@media (max-width:640px){#tarot .tc{--w:min(172px,42vw)}}
@media (max-height:520px){#tarot .tc{--w:min(150px,25vh)}#tarot .tt{gap:6px}}`;
document.head.appendChild(tarotCss);
const tarot = document.createElement('div'); tarot.id = 'tarot'; document.body.appendChild(tarot);
const hideTarot = () => tarot.classList.remove('on');
let tarotTimers = [];
function showRestock() {
  if (!game || game.phase !== 'restock') return;
  tarotTimers.forEach(clearTimeout); tarotTimers = [];
  const ROM = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  const hue = id => { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const cards = game.choices.map((u, i) => `<div class="tc" data-id="${u.id}" style="--i:${i};--hue:${hue(u.id)}"><div class="ti"><div class="tf">
    <div class="face back"><div class="sg">✦</div><div class="sg2">☾ ☀</div></div>
    <div class="face front"><div class="rn">${ROM[i] || i + 1}</div><div class="ic">${u.icon}</div><div class="nm">${u.name}</div><div class="ds">${u.desc}</div><div class="gl"></div></div>
  </div></div></div>`).join('');
  tarot.innerHTML = `<div class="tt"><div class="th">📦 Morning delivery — day ${game.wave + 1}</div>
    <div class="ts">You survived night ${game.wave}. Draw one card · Till ${game.lives}/${game.maxLives}</div>
    <div class="tr">${cards}</div><button class="tbtn" id="t-reroll" ${game.rerolls ? '' : 'disabled'}>🔄 Reroll (${game.rerolls})</button></div>`;
  tarot.classList.add('on');
  const els = [...tarot.querySelectorAll('.tc')]; let busy = false;
  const flip = el => { if (el.classList.contains('up')) return; el.classList.add('up'); el._up = performance.now(); sfx.flip(); };
  const pick = el => {
    busy = true; sfx.pick();
    els.forEach(o => o.classList.add(o === el ? 'chosen' : 'gone'));
    tarotTimers.push(setTimeout(() => { hideTarot(); game.pickUpgrade(el.dataset.id); refresh(); }, 950));
  };
  els.forEach((el, i) => {
    tarotTimers.push(setTimeout(() => sfx.deal(), i * 140 + 120));
    tarotTimers.push(setTimeout(() => flip(el), 1000 + i * 280));   // they turn over by themselves; tap to turn one early
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      el.style.setProperty('--ry', ((px - 0.5) * 30) + 'deg'); el.style.setProperty('--rx', ((0.5 - py) * 24) + 'deg'); el.style.setProperty('--z', '36px');
      el.style.setProperty('--gx', (px * 100) + '%'); el.style.setProperty('--gy', (py * 100) + '%');
    });
    el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); el.style.setProperty('--z', '0px'); });
    el.addEventListener('click', () => {
      if (busy) return;
      if (!el.classList.contains('up')) { flip(el); return; }
      if (performance.now() - el._up < 500) return;   // not while it is still turning over
      pick(el);
    });
  });
  $('t-reroll').onclick = () => { if (busy) return; if (game.reroll()) showRestock(); else sfx.bad(); };
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

// ---------- Sara's tutorial (first run only) ----------
const SARA_DIR = 'assets/sara/', FACE = { talk: SARA_DIR + 'talk.png', normal: SARA_DIR + 'normal.png', shh: SARA_DIR + 'shh.png' };
const FACE_IMG = {};   // preloaded faces (drawn onto the pixel canvas)
for (const k in FACE) { const im = new Image(); im.src = FACE[k]; FACE_IMG[k] = im; }
// which button / tab / cell to pulse so the player can find the item in the build menu
function hintBuild(id) {
  if (selected === id) return null;
  if (!trayOpen()) return '#buildBtn';
  if (trayTab !== 'stocks') return '#tabStocks';
  const sk = SKILLS.includes(id) ? 'skill' : 'sell';
  if (subTab !== sk) return sk === 'sell' ? '#subSell' : '#subSkill';
  return focusId === id ? '#dAct' : `#trayGrid .sc[data-id="${id}"]`;
}
// say: [text, face?] lines with a NEXT button. task: Sara waits until done() is true.
const TUT = [
  { id: 'hello', say: [
    ['Uy, kamusta! Ikaw pala ang bago kong kasama dito sa tindahan! 😄', 'talk'],
    ['Ako nga pala si Sara. Ako muna ang bahala sa iyo ngayong unang araw.'],
    ['Sa umaga, mamimili ang mga customer. Pagdating ng gabi, papasok ang mga magnanakaw, at ang kaha natin ang target nila!'],
    ['Kaya simulan natin sa mga shelf. Doon kasi bumibili ang mga customer.'] ] },
  { id: 'menu', task: () => 'Pindutin ang 🔨 sa kanang-ibaba para buksan ang build menu.',
    done: () => trayOpen() || !!selected || game.shelves.length > 0, hint: () => hintBuild('shelf') },
  { id: 'pick', task: () => 'Piliin ang Shelf, tapos pindutin ang "Build".',
    done: () => selected === 'shelf' || game.shelves.length > 0, hint: () => hintBuild('shelf') },
  { id: 'shelves', task: () => { const n = Math.min(5, game.shelves.length);
      return selected === 'shelf' ? `I-tap ang sahig para maglagay ng shelf: ${n}/5. Mag-iwan ng daanan para sa mga customer!` : `Pindutin ulit ang 🔨 at piliin ang Shelf: ${n}/5.`; },
    done: () => game.shelves.length >= 5, hint: () => hintBuild('shelf') },
  { id: 'open', say: [
    ['Ang galing mo! Kumpleto na ang mga shelf natin. 💪', 'talk'],
    ['Buksan na natin ang tindahan para makapasok ang mga customer.'] ] },
  { id: 'go', task: () => 'Pindutin ang OPEN STORE sa kanang-ibaba!', done: () => game.phase !== 'prep', hint: () => '#go' },
  { id: 'watch', task: () => 'Panoorin mo muna silang mamili sa mga shelf at magbayad sa counter...', done: () => game.served > 0 },
  { id: 'vend', say: [
    ['Tingnan mo, may kita na tayo! 💰', 'talk'],
    ['Pero mag-ingat, pagdating ng gabi ay may mga magnanakaw na papasok sa pinto.'],
    ['Maglagay ka ng Vending Machine malapit sa pinto, kung saan sila dadaan. Minarkahan ko na para sa iyo.'] ] },
  { id: 'vendTask', marks: true,
    task: () => selected === 'cans' ? 'I-tap ang may markang sahig malapit sa pinto para ilagay ang Vending Machine.' : 'Buksan ang 🔨, piliin ang Vending Machine, at ilagay ito malapit sa pinto.',
    done: () => game.towers.some(t => t.type === 'cans'), hint: () => hintBuild('cans') },
  { id: 'bye', say: [
    ['Shhh... Tahimik lang. Maririnig mo na sila, malapit na silang dumating.', 'shh'],
    ['Ang vending machine na ang bahala sa kanila. Good luck, boss! Kaya mo yan! ✨', 'talk'] ] },
];
const TUT_OPEN = TUT.findIndex(s => s.id === 'open');
const tut = { on: false, i: 0, li: 0, full: [], shown: 0, face: null, last: '', timer: null, marks: [] };
let sara = null, dim = null;
// the game stands still while Sara is talking (the NEXT lines), so nothing happens behind the dialogue
const tutHold = () => tut.on && !!TUT[tut.i] && !!TUT[tut.i].say;
const tutTyping = () => tut.shown < tut.full.length;
const tutBlocksOpen = () => tut.on && game && game.phase === 'prep' && tut.i < TUT_OPEN;

function tutBuildUI() {
  if (sara) return;
  const css = document.createElement('style');
  css.textContent = `
#sara{position:fixed;left:50%;bottom:0;transform:translateX(-50%);width:min(620px,calc(100vw - 500px));min-width:360px;display:flex;align-items:flex-end;gap:6px;z-index:8;pointer-events:none;font-family:var(--cf)}
#saraCv{flex:none;display:block;image-rendering:pixelated;image-rendering:crisp-edges;image-rendering:pixelated}
#sara.big{width:min(1000px,96vw)}
#sara.big #saraBox{font-size:clamp(16px,2.1vw,22px);margin-bottom:9vh;padding:22px 24px 12px;min-height:130px}
#sara.big #saraBox .sn{font-size:14px;top:-15px}
#saraDim{position:fixed;inset:0;z-index:7;background:rgba(8,5,16,.55);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);visibility:hidden;opacity:0;transition:opacity .35s,visibility .35s}
#saraDim.on{visibility:visible;opacity:1}
#saraBox{pointer-events:auto;position:relative;flex:1;margin-bottom:clamp(12px,3vh,26px);padding:16px 16px 10px;border-radius:24px;background:linear-gradient(180deg,#fffaf0,#ffe9cf);border:3px solid #fff;box-shadow:0 6px 0 #d9b08a,0 14px 26px rgba(0,0,0,.35);color:#7a5a40;font:500 clamp(13px,1.9vw,16px)/1.35 var(--cf);min-height:84px;cursor:default}
#saraBox::before{content:'';position:absolute;left:-10px;bottom:26px;border:9px solid transparent;border-left:0;border-right:10px solid #fff}
#saraBox .sn{position:absolute;top:-13px;left:16px;background:#ff7a2e;color:#fff;font:700 12px/1 var(--cf);padding:5px 12px;border-radius:99px;letter-spacing:.12em;box-shadow:0 2px 0 #c25a14}
#saraTxt{min-height:2.7em}
#saraBox .sa{display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:8px}
#saraBox .sk{background:none;border:0;color:#a8896c;font:600 12px var(--cf);cursor:pointer;text-decoration:underline;padding:4px}
#saraNext{padding:8px 16px;font-size:14px}
#sara.top{bottom:auto;top:10px;align-items:flex-start}
#sara.top #saraCv,#sara.top #saraBox::before{display:none}
#sara.top #saraBox{margin:0}
[data-tut]{outline:4px solid #ffd23f!important;outline-offset:3px;animation:tutPulse .7s ease-in-out infinite alternate}
@keyframes tutPulse{to{outline-offset:8px;outline-color:#fff3a0}}
.tutMark{position:absolute;transform:translate(-50%,-50%);border:3px dashed #ffd23f;border-radius:50%;background:rgba(255,210,63,.25);pointer-events:none;animation:tutMarkP .7s ease-in-out infinite alternate}
@keyframes tutMarkP{to{background:rgba(255,210,63,.5);border-color:#fff3a0}}
@media (max-height:480px){#saraBox{min-height:64px;padding:12px 12px 8px}#sara.big #saraBox{min-height:90px;padding:14px 16px 8px}}`;
  document.head.appendChild(css);
  sara = document.createElement('div'); sara.id = 'sara'; sara.className = 'off';
  sara.innerHTML = `<canvas id="saraCv"></canvas><div id="saraBox"><div class="sn">SARA</div><div id="saraTxt"></div><div class="sa"><button class="sk" id="saraSkip">Skip tutorial</button><button class="pxb gold" id="saraNext">NEXT ▶</button></div></div>`;
  dim = document.createElement('div'); dim.id = 'saraDim'; document.body.appendChild(dim);   // blurs + darkens the game while Sara talks
  document.body.appendChild(sara);
  dim.onclick = () => { if (tut.on) tutNext(); };
  $('saraNext').onclick = tutNext;
  $('saraSkip').onclick = () => tutEnd(true);
  $('saraBox').addEventListener('click', e => { if (!e.target.closest('button') && tutTyping()) tutNext(); });
}
function tutPaint() {
  const s = TUT[tut.i]; if (!s || !sara) return;
  $('saraTxt').textContent = tut.full.slice(0, tut.shown).join('');
  const face = tut.face || (tutTyping() ? 'talk' : 'normal');
  if (tut.faceNow !== face) { tut.faceNow = face; tut.popAt = performance.now(); }   // every new picture pops in
  const isSay = !!s.say, last = isSay && tut.li === s.say.length - 1 && tut.i === TUT.length - 1;
  $('saraNext').style.display = isSay ? '' : 'none';
  $('saraNext').textContent = last ? 'GOOD LUCK ✔' : 'NEXT ▶';
}

// ---- Sara is drawn on a low-res canvas: hard pixels, a white + dark-blue pixel outline, pop-in and sway all snapped to the pixel grid ----
const sprite = { key: '', cv: document.createElement('canvas') }, bodyCv = document.createElement('canvas');
let saraAnim = 0, saraLast = 0, saraDh = 0;
function saraSprite(face, W, H) {   // the face downscaled to W x H with hard (non-antialiased) edges
  const key = face + '|' + W + 'x' + H; if (sprite.key === key) return sprite.cv;
  const im = FACE_IMG[face]; if (!im || !im.complete || !im.naturalWidth) return null;
  const c = sprite.cv; c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H), a = d.data;
  for (let i = 3; i < a.length; i += 4) a[i] = a[i] > 120 ? 255 : 0;
  x.putImageData(d, 0, 0); sprite.key = key; return c;
}
function saraFrame(now) {
  if (!tut.on) { saraAnim = 0; return; }
  saraAnim = requestAnimationFrame(saraFrame);
  if (now - saraLast < 33) return;   // ~30 fps: reads as chunky pixel animation and keeps it cheap
  saraLast = now;
  const cv = $('saraCv'); if (!cv || !sara || sara.classList.contains('top')) return;
  const vh = innerHeight, big = sara.classList.contains('big');
  const want = (big ? Math.max(260, Math.min(500, vh * 0.64)) : Math.max(130, Math.min(220, vh * 0.32))) * (vh <= 480 ? 0.8 : 1);
  saraDh = saraDh ? saraDh + (want - saraDh) * 0.25 : want;   // glide between the big and the small size
  const P = Math.max(2, Math.round(((view && view.pixel) || 3) * 0.67));   // css px per Sara pixel
  const H = Math.max(40, Math.round(saraDh / P)), W = Math.round(H * 475 / 525);
  const spr = saraSprite(tut.faceNow || 'normal', W, H); if (!spr) return;
  const t = now / 1000, pad = Math.ceil(H * 0.05) + 3, top = Math.ceil(H * 0.06) + 3, CW = W + pad * 2, CH = H + top;
  if (cv.width !== CW || cv.height !== CH) { cv.width = CW; cv.height = CH; bodyCv.width = CW; bodyCv.height = CH; cv.style.width = CW * P + 'px'; cv.style.height = CH * P + 'px'; }
  // pop: ease-out-back scale from 80% with a little hop; sway: rows lean sideways, anchored at the feet; breathing: 1-2px of height
  const pp = Math.min(1, (now - (tut.popAt || 0)) / 450), back = 1 + 2.70158 * Math.pow(pp - 1, 3) + 1.70158 * Math.pow(pp - 1, 2), sc = 0.8 + 0.2 * back;
  const sW = Math.round(W * sc * (1 + 0.05 * (1 - pp))), sH = Math.round(H * sc * (1 + 0.012 * Math.sin(t * 3.4)));
  const hop = Math.round(Math.sin(pp * Math.PI) * 0.03 * H), amp = Math.sin(t * 1.7) * 0.03 * H;
  const bx = bodyCv.getContext('2d', { willReadFrequently: true }); bx.clearRect(0, 0, CW, CH); bx.imageSmoothingEnabled = false;
  const yTop = CH + 3 - hop - sH, x0 = CW / 2 - sW / 2;
  for (let j = 0; j < sH; j++) {
    const k = (sH - j) / sH, sy = Math.min(H - 1, Math.floor(j * H / sH));
    bx.drawImage(spr, 0, sy, W, 1, Math.round(x0 + amp * k * k), yTop + j, sW, 1);
  }
  // pixel outline: dark blue touching her, white outside it
  const src = bx.getImageData(0, 0, CW, CH).data, N = CW * CH, m = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (src[i * 4 + 3]) m[i] = 3;
  const ring = (from, to) => {
    const mark = [];
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const i = y * CW + x; if (m[i]) continue;
      let hit = false;
      for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= CW || ny >= CH) continue;
        if (m[ny * CW + nx] === from) { hit = true; break; }
      }
      if (hit) mark.push(i);
    }
    for (const i of mark) m[i] = to;
  };
  ring(3, 1); ring(1, 2); ring(2, 2);   // dark blue 1px inside, white 2px outside
  const out = new ImageData(CW, CH), o = out.data;
  for (let i = 0; i < N; i++) {
    const v = m[i], q = i * 4;
    if (v === 3) { o[q] = src[q]; o[q + 1] = src[q + 1]; o[q + 2] = src[q + 2]; o[q + 3] = 255; }
    else if (v === 1) { o[q] = 22; o[q + 1] = 34; o[q + 2] = 107; o[q + 3] = 255; }   // inner ring: dark blue
    else if (v === 2) { o[q] = 255; o[q + 1] = 255; o[q + 2] = 255; o[q + 3] = 255; }   // outer ring: white
  }
  cv.getContext('2d').putImageData(out, 0, 0);
}
function tutSay(text, face) {
  clearInterval(tut.timer);
  tut.full = Array.from(text); tut.shown = 0; tut.face = face || null; tut.last = text;
  tut.timer = setInterval(() => {
    tut.shown = Math.min(tut.full.length, tut.shown + 1);
    if (tut.shown % 2 === 0 && tut.full[tut.shown - 1] !== ' ') tone(620 + Math.random() * 140, 0.025, 'triangle', 0.012);
    tutPaint();
    if (!tutTyping()) clearInterval(tut.timer);
  }, 24);
  tutPaint();
}
function tutEnter(i) {
  if (i >= TUT.length) { tutEnd(true); return; }
  tut.i = i; tut.li = 0; save.tutStep = i; persist();
  const s = TUT[i];
  if (s.say) tutSay(s.say[0][0], s.say[0][1]); else tutSay(s.task(), null);
}
function tutNext() {
  if (!tut.on) return;
  if (tutTyping()) { clearInterval(tut.timer); tut.shown = tut.full.length; tutPaint(); return; }
  const s = TUT[tut.i]; if (!s || !s.say) return;
  if (tut.li + 1 < s.say.length) { tut.li++; tutSay(s.say[tut.li][0], s.say[tut.li][1]); } else tutEnter(tut.i + 1);
}
function tutHint(sel) {
  document.querySelectorAll('[data-tut]').forEach(el => { if (!sel || !el.matches(sel)) el.removeAttribute('data-tut'); });
  if (sel) { const el = document.querySelector(sel); if (el) el.setAttribute('data-tut', '1'); }
}
// dashed circles on the floor right in front of the doors: the spots where burglars walk in
function tutMarks(on) {
  const box = $('floats');
  let cells = [];
  if (on) {
    for (const s of game.activeSpawns) {
      const ix = s.x - s.ox, iy = s.y - s.oy, px = s.ox !== 0 ? 0 : 1, py = s.ox !== 0 ? 1 : 0;
      for (const [x, y] of [[ix, iy], [ix + px, iy + py], [ix - px, iy - py]]) if (game.canPlace('cans', x, y).ok) cells.push([x, y]);
    }
  }
  while (tut.marks.length > cells.length) tut.marks.pop().remove();
  while (tut.marks.length < cells.length) { const d = document.createElement('div'); d.className = 'tutMark'; box.appendChild(d); tut.marks.push(d); }
  const r = $('stage').getBoundingClientRect();
  cells.forEach(([x, y], k) => {
    const p0 = view.project(x, y, 0.05), px = view.project(x + 1, y, 0.05), py = view.project(x, y + 1, 0.05), d = tut.marks[k];
    d.style.left = (p0.x - r.left) + 'px'; d.style.top = (p0.y - r.top) + 'px';
    d.style.width = (Math.abs(px.x - p0.x) * 0.9 || 40) + 'px'; d.style.height = (Math.abs(py.y - p0.y) * 0.9 || 24) + 'px';
  });
}
function tutTick() {
  if (!tut.on || !game || !running) return;
  if (game.wave > 0) { tutEnd(true); return; }
  const s = TUT[tut.i]; if (!s) return;
  sara.classList.toggle('top', trayOpen());
  const talking = !!s.say && !trayOpen();
  sara.classList.toggle('big', talking); dim.classList.toggle('on', talking);   // dialogue: big Sara + blurred, dimmed game; tasks: small Sara, game fully usable
  if (s.task) {
    if (s.done()) { sfx.sale(); tutEnter(tut.i + 1); return; }
    const t = s.task();
    if (t !== tut.last) { const typing = tutTyping(); tut.last = t; tut.full = Array.from(t); if (!typing) tut.shown = tut.full.length; tutPaint(); }
    tutHint(s.hint ? s.hint() : null); tutMarks(!!s.marks);
  } else { tutHint(null); tutMarks(false); }
}
function tutStart() {
  if (save.tutDone || tut.on || !game) return;
  if (game.wave > 0 || (save.tutDone === undefined && save.best > 0)) { save.tutDone = true; persist(); return; }   // veterans who never saw it skip it; a restarted run replays it
  tutBuildUI(); tut.on = true; sara.classList.remove('off'); saraDh = 0; if (!saraAnim) saraAnim = requestAnimationFrame(saraFrame);
  let st = save.tutStep || 0;   // resume where we left off; a rolled-back day (no sales yet) goes back to opening the store
  const gi = TUT.findIndex(x => x.id === 'go'), bi = TUT.findIndex(x => x.id === 'bye');
  if (st > gi && st < bi && game.served === 0) st = gi;
  tutEnter(st);
}
function tutEnd(done) {
  clearInterval(tut.timer); tut.on = false;
  if (sara) { sara.classList.add('off'); sara.classList.remove('big'); dim.classList.remove('on'); }
  tut.faceNow = null;
  document.querySelectorAll('[data-tut]').forEach(el => el.removeAttribute('data-tut'));
  while (tut.marks.length) tut.marks.pop().remove();
  if (done) { save.tutDone = true; persist(); }
}
const tutStop = () => tutEnd(false);   // back to the menu: pause the tutorial, resume next time
setInterval(tutTick, 150);

// ---------- loop ----------
let last = performance.now(), clock = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
  musicTick(dt);
  if (game) {
    const was = game.phase; game.update(paused || tutHold() ? 0 : dt * speed);
    if (game.phase === 'wave' || game.phase === 'morning' || game.phase === 'evening' || was !== game.phase) { if (Math.floor(clock * 4) !== Math.floor((clock - dt) * 4)) refresh(); }
  }
  view.render(dt, clock);
  requestAnimationFrame(frame);
}
$('t-start').onclick = startRun;
const tRestart = document.createElement('button'); tRestart.id = 't-restart'; tRestart.className = 'pxb red off'; tRestart.textContent = '↻ RESTART RUN';
$('t-start').after(tRestart);
tRestart.onclick = () => {
  openModal(`<h2>Restart run?</h2><p>Your current store (shelves, machines, cash and upgrades) will be deleted and you start a brand new store. Your paycheck bank stays.</p>
    <div class="row"><button class="pxb red" id="m-yes">Yes, restart</button><button class="pxb gold" id="m-no">Cancel</button></div>`);
  $('m-no').onclick = closeModal;
  $('m-yes').onclick = () => { closeModal(); newStore(true); };
};
newStore();
requestAnimationFrame(frame);
window.__game = () => game;   // debugging helpers
window.__view = view;
