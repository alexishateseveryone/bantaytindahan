// UI, input, save data, audio and the main loop
import { Game, peso, pesoN, ITEMS, BUILD_ORDER, SKILLS, META, ROOM_UPGRADE, UNLOCKS, SKILL_UNLOCKS, MAX_LEVEL, MAX_STOCK, MAX_ROOM, ROOM_BASE, ROOM_STEP, RENO_COST, STATUE_RANGE, MAX_PERMIT, PERMIT_FOR_RENO, ITEM_LIMITS, UNLOCK_DAY, BOSS_INFO } from './game.js';
import { View } from './view.js';
import { pxText, setHTML, pxEmoji, pxifyStatic } from './ui/icons.js';
import { loader } from './loadingscreen.js';   // install screen on phones, loading screen otherwise

const $ = id => document.getElementById(id);

// ---------- save (permanent paychecks) ----------
const KEY = 'shelf-defense-closing-time-v1';
let save = { bank: 0, levels: {}, best: 0, shifts: 0, run: null };   // run = the current store, saved between days
try { Object.assign(save, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* storage may be blocked */ }
save.settings = Object.assign({ music: 0.3, sfx: 1 }, save.settings || {});   // volume sliders (0..1)
const settings = save.settings;
// 5 save slots: each one keeps its own store (save.run) and tutorial progress. The paycheck bank and shop upgrades are shared by all slots.
const SLOTS = 5;
if (!Array.isArray(save.slots)) { save.slots = [null, null, null, null, null]; if (save.run) save.slots[0] = { run: save.run, tutDone: save.tutDone, tutStep: save.tutStep, t: Date.now() }; save.slot = 0; }
while (save.slots.length < SLOTS) save.slots.push(null);
if (!(save.slot >= 0 && save.slot < SLOTS)) save.slot = 0;
{ const s0 = save.slots[save.slot]; save.run = s0 ? s0.run : null; if (s0) { save.tutDone = s0.tutDone; save.tutStep = s0.tutStep; } }   // the active slot's store
const persist = () => {
  save.slots[save.slot] = (save.run || save.tutStep) ? { run: save.run, tutDone: save.tutDone, tutStep: save.tutStep, t: Date.now() } : null;
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
};

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
    else if (k === 'coffee') { noise(0.3, 0.06, { f: 2600, q: 0.7, type: 'highpass', slide: -1400 }); tone(180, 0.25, 'sawtooth', 0.03, -60); tone(880, 0.1, 'sine', 0.03, 0, 0.22, true); }   // psssh + ding
    else if (k === 'noodle') { tone(210, 0.12, 'sine', 0.08, -90); noise(0.1, 0.04, { f: 1500, q: 1 }); tone(640, 0.06, 'triangle', 0.03, 200, 0.05); }   // thwoop
    else if (k === 'eggtray') { for (let i = 0; i < 4; i++) tone(240 + i * 40, 0.06, 'triangle', 0.04, 120, i * 0.06); noise(0.18, 0.03, { f: 1800, q: 1, slide: -600 }); }   // clack-clack-clack
    else if (k === 'water') { for (let i = 0; i < 3; i++) { tone(420 + i * 60, 0.12, 'sine', 0.05, 380, i * 0.3); noise(0.1, 0.03, { f: 1400, q: 1.2, delay: i * 0.3 }); } }   // glug-glug-glug
    else if (k === 'donut') { tone(300, 0.09, 'triangle', 0.06, 260); tone(300, 0.09, 'triangle', 0.06, 260, 0.3); noise(0.05, 0.03, { f: 1500 }); }                          // fwip fwip
    else if (k === 'cereal') { noise(0.14, 0.06, { f: 700, q: 0.8 }); tone(180, 0.14, 'triangle', 0.07, -90); tone(90, 0.1, 'sine', 0.06, -40, 0.12); }                       // rattle + thunk
    else if (k === 'tissue') { noise(0.2, 0.05, { f: 3000, q: 0.5, type: 'highpass', slide: 1500 }); tone(700, 0.1, 'sine', 0.02, 400); }                                       // fwoosh
    else tone(330, 0.05, 'square', 0.025, -200);
  },
  gumHit: () => { if (gate('gumHit', 50)) { tone(900, 0.06, 'sine', 0.035, -350); tone(1350, 0.05, 'triangle', 0.02, -300, 0.04); } },
  colaBlast: () => { noise(0.4, 0.12, { f: 2600, q: 0.7, type: 'highpass', slide: -1800 }); tone(130, 0.3, 'sine', 0.09, -70); tone(520, 0.2, 'triangle', 0.04, -300, 0.02); },   // pssshHH-BOOM
  cigLaunch: () => { if (gate('cigLaunch', 55)) { noise(0.04, 0.03, { f: 2200, q: 1.5 }); tone(700, 0.05, 'triangle', 0.02, 300); } },
  iceLand: () => { noise(0.18, 0.08, { f: 1200, q: 0.8 }); tone(90, 0.2, 'sine', 0.09, -40); tone(1800, 0.12, 'triangle', 0.03, -600, 0.02, true); },   // crunch-thud
  iceSnap: () => { noise(0.35, 0.1, { f: 7000, type: 'highpass', q: 0.5 }); arp([2093, 2637, 3136, 2349, 3520], 0.035, 0.22, 'sine', 0.03); tone(220, 0.25, 'sawtooth', 0.05, -160); },   // glassy SNAP
  bananaPop: () => { noise(0.12, 0.07, { f: 900, q: 0.8 }); tone(200, 0.14, 'square', 0.05, 260); tone(520, 0.1, 'triangle', 0.04, 300, 0.05); },   // crate pops open
  bananaLaunch: () => { if (gate('bananaLaunch', 60)) { tone(380, 0.08, 'sine', 0.05, 260); noise(0.04, 0.03, { f: 1500 }); } },
  bananaBoom: () => { if (gate('bananaBoom', 45)) { noise(0.1, 0.06, { f: 1800, q: 0.7 }); tone(260, 0.1, 'triangle', 0.05, -120); tone(700, 0.08, 'sine', 0.03, 200, 0.03); } },   // splat
  burgerLand: () => { noise(0.22, 0.1, { f: 500, q: 0.8 }); tone(70, 0.28, 'sine', 0.12, -30); tone(180, 0.14, 'triangle', 0.05, -100, 0.02); noise(0.12, 0.05, { f: 2200, q: 0.7, delay: 0.04 }); },   // heavy squishy THUD
  burgerPop: () => { noise(0.3, 0.1, { f: 1400, q: 0.6, slide: -900 }); tone(110, 0.25, 'square', 0.07, 200); tone(330, 0.16, 'triangle', 0.06, 420, 0.04); tone(660, 0.12, 'sine', 0.04, 300, 0.1); },   // pop + sauce
  miniHit: () => { if (gate('miniHit', 50)) { noise(0.06, 0.04, { f: 1600, q: 1 }); tone(420, 0.06, 'triangle', 0.04, -150); } },
  miniPop: () => { if (gate('miniPop', 45)) { noise(0.1, 0.06, { f: 1100, q: 0.8 }); tone(240, 0.1, 'square', 0.04, -120); tone(780, 0.08, 'sine', 0.03, 200, 0.03); } },
  goldBlast: () => { noise(0.4, 0.11, { f: 3200, q: 0.7, type: 'highpass', slide: -1800 }); tone(130, 0.3, 'sine', 0.09, -70); arp([1319, 1568, 1976, 2637, 3136], 0.045, 0.25, 'sine', 0.035); tone(520, 0.2, 'triangle', 0.04, -300, 0.02); },   // gold BOOM + chime
  cigPop: () => { if (gate('cigPop', 45)) { noise(0.05, 0.04, { f: 3000, q: 1 }); tone(520, 0.05, 'square', 0.02, -300); } },
  swirl: () => { noise(0.5, 0.05, { f: 800, q: 1.2, slide: 2400 }); tone(400, 0.45, 'triangle', 0.03, 600, 0, true); },
  fruitScatter: () => { noise(0.2, 0.05, { f: 1500, q: 0.8, slide: 800 }); tone(300, 0.12, 'triangle', 0.05, 300); tone(450, 0.1, 'triangle', 0.04, 300, 0.07); },
  fruitBoom: () => { if (gate('fruitBoom', 60)) { noise(0.22, 0.07, { f: 900, type: 'lowpass', q: 0.7, slide: -600 }); tone(170, 0.16, 'sine', 0.09, -90); tone(700, 0.08, 'triangle', 0.04, 300, 0.02); } },   // squishy pop
  repair: () => { if (gate('repair', 450)) arp([784, 988, 1319], 0.05, 0.12, 'sine', 0.025); },
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
  // --- bosses ---
  bossHorn: () => { tone(98, 0.9, 'sawtooth', 0.08, -20); tone(147, 0.9, 'square', 0.05, -30, 0.02); tone(73, 1.1, 'sawtooth', 0.07, -10, 0.25); noise(0.6, 0.05, { f: 400, type: 'lowpass', delay: 0.1 }); },
  shotgun: () => { noise(0.35, 0.16, { f: 1100, q: 0.5, type: 'lowpass', slide: -800 }); tone(70, 0.3, 'sawtooth', 0.12, -40); tone(2200, 0.05, 'square', 0.04, -1500); noise(0.12, 0.06, { f: 4000, type: 'highpass', delay: 0.32 }); tone(480, 0.05, 'square', 0.03, -200, 0.4); },   // BOOM... chk-chk
  gunShot: () => { if (gate('gunShot', 60)) { noise(0.08, 0.07, { f: 1800, q: 0.7, slide: -1200 }); tone(300, 0.07, 'square', 0.05, -220); } },
  summon: () => { arp([392, 330, 262], 0.09, 0.18, 'sawtooth', 0.04); noise(0.3, 0.04, { f: 1500, q: 1, slide: 1500 }); },
  slamWarn: () => { tone(110, 0.8, 'sawtooth', 0.04, 90); arp([330, 330, 330], 0.2, 0.08, 'square', 0.03, false); },
  slam: () => { noise(0.7, 0.18, { f: 500, type: 'lowpass', q: 0.7, slide: -380 }); tone(48, 0.7, 'sine', 0.2, -22); tone(95, 0.3, 'square', 0.1, -60); noise(0.2, 0.08, { f: 1500, delay: 0.02 }); },
  clink: () => { if (gate('clink', 60)) { tone(1700, 0.05, 'square', 0.035, -300); tone(2400, 0.07, 'triangle', 0.025, -400, 0.02); noise(0.03, 0.03, { f: 5000, type: 'highpass' }); } },
  engine: () => { if (gate('engine', 250)) { tone(70, 0.3, 'sawtooth', 0.05, 40); tone(105, 0.3, 'square', 0.025, 50); } },
  whirl: () => { noise(0.8, 0.07, { f: 500, q: 1.3, slide: 1800 }); tone(220, 0.8, 'triangle', 0.04, 500, 0, true); },
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
let moving = null, drag = null;   // moving = the owned item being relocated (tap a new spot, or drag it there)
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
  if (!game || !running || game.sandbox) return;
  const snap = (game.phase === 'prep' || game.phase === 'restock') ? game.snapshot() : game.daySnap;
  if (!snap) return;
  snap.paidOut = game.paidOut;
  save.run = snap; persist();
}
const SAVE_EVENTS = new Set(['place', 'sell', 'upgrade', 'stock', 'service', 'replace', 'unlock', 'renovate', 'permit', 'dayStart', 'newDay', 'restock', 'retry', 'waveClear', 'lost']);

// every run starts in a freshly generated store (or your saved one), shown behind the title plate
function newStore(fresh = false, sandbox = false) {
  if (fresh) { save.run = null; save.tutDone = false; save.tutStep = 0; persist(); }   // a brand new store plays Sara's tutorial again
  game = new Game({ meta: save.levels });
  game.on = onEvent;
  if (sandbox) devSetup(game);
  else if (save.run) { try { game.restore(save.run); } catch (e) { save.run = null; game = new Game({ meta: save.levels }); game.on = onEvent; } }
  view.setGame(game); view.menu = true; view.tod = 0; view.resetView();
  running = false; selected = null; pickedTower = null; moving = null; drag = null; preview = null; speed = 1;
  $('speed').textContent = '1x'; setPaused(false);
  $('hud').classList.add('off'); $('info').classList.add('off'); $('dock').classList.add('off'); $('skillSlots').classList.add('off'); closeTray(); setTab('stocks'); $('title').classList.remove('off', 'pop', 'slotsOut'); closeSlots(false); $('stage').classList.add('menu'); $('t-restart').classList.add('off');
  niQueue.length = 0; newItemEl.classList.remove('on'); newItemThen = null; newItemDay = 0;
  closeModal(); hideTarot(); buildCards(); refresh(); tutStop(); hideBossBanner(true);
}

function startRun() {
  running = true; view.menu = false; selected = null;
  $('stage').classList.remove('menu'); $('title').classList.add('pop'); setTimeout(() => { if (running) $('title').classList.add('off'); }, 480);
  $('hud').classList.remove('off'); $('info').classList.remove('off'); $('dock').classList.remove('off'); $('skillSlots').classList.remove('off');
  banner(game.sandbox ? '🛠 SANDBOX: unlimited money, everything unlocked' : game.wave ? `☀ Day ${game.wave + 1} — welcome back` : '☀ Day 1 — stock up, then open the store!'); refresh();
  if (game.phase === 'restock') restockFlow();
  tutStart();
}

// the paycheck is banked night by night (and on a loss), so closing the game never loses it
function bankProgress() {
  if (!game || game.sandbox) return 0;   // sandbox never touches the paycheck bank
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


// ---------- victory banner: the item that becomes available today (pixel card, white, centred, with a GOT IT! button) ----------
const niCss = document.createElement('style');
niCss.textContent = `
#newItem{position:fixed;inset:0;z-index:70;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.66);padding:14px;box-sizing:border-box;font-family:var(--cf)}
#newItem.on{display:flex}
/* the same paper receipt as the build tray: cream paper, hard pixel shadow, torn bottom edge */
#newItem .nw{position:relative;isolation:isolate;animation:niIn .4s cubic-bezier(.22,1.2,.36,1) both;will-change:transform,opacity}
#newItem .nw::before{content:'';position:absolute;inset:0;z-index:-1;transform:translate(6px,6px);background:rgba(0,0,0,.65);--u:4px;clip-path:polygon(0 calc(var(--u)*2),var(--u) calc(var(--u)*2),var(--u) var(--u),calc(var(--u)*2) var(--u),calc(var(--u)*2) 0,calc(100% - var(--u)*2) 0,calc(100% - var(--u)*2) var(--u),calc(100% - var(--u)) var(--u),calc(100% - var(--u)) calc(var(--u)*2),100% calc(var(--u)*2),100% 100%,0 100%)}
#newItem .nw::after{content:'';position:absolute;left:0;right:0;top:100%;height:12px;z-index:-1;transform:translate(6px,6px);background:repeating-linear-gradient(90deg,rgba(0,0,0,.65) 0 12px,transparent 12px 24px)}
#newItem .nc{--u:4px;width:min(340px,88vw);box-sizing:border-box;position:relative;background:#fffdf4;color:#2a2622;text-align:center;padding:24px 22px 26px;border-radius:0;
  display:flex;flex-direction:column;align-items:center;gap:10px;font-family:var(--cf);
  clip-path:polygon(0 calc(var(--u)*2),var(--u) calc(var(--u)*2),var(--u) var(--u),calc(var(--u)*2) var(--u),calc(var(--u)*2) 0,calc(100% - var(--u)*2) 0,calc(100% - var(--u)*2) var(--u),calc(100% - var(--u)) var(--u),calc(100% - var(--u)) calc(var(--u)*2),100% calc(var(--u)*2),100% calc(100% + 12px),0 calc(100% + 12px))}
#newItem .nc::before{content:'';position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 0 2px rgba(42,38,34,.22)}
#newItem .nc::after{content:'';position:absolute;left:0;right:0;top:100%;height:12px;background:repeating-linear-gradient(90deg,#fffdf4 0 12px,transparent 12px 24px)}
@keyframes niIn{0%{transform:translateY(26px) scale(.82);opacity:0}100%{transform:none;opacity:1}}
#newItem .nt{font:700 22px/1 var(--cf);letter-spacing:2px;color:#d4452a;text-transform:uppercase}
#newItem .ns{font:600 13px/1 var(--cf);letter-spacing:.8px;color:#8b8277;text-transform:uppercase}
#newItem hr{width:100%;border:0;border-top:2px dashed rgba(42,38,34,.28);margin:2px 0}
#newItem .pic{--u:3px;width:112px;height:112px;border-radius:0;display:grid;place-items:center;background:rgba(42,38,34,.07);clip-path:polygon(0 calc(var(--u)*2),var(--u) calc(var(--u)*2),var(--u) var(--u),calc(var(--u)*2) var(--u),calc(var(--u)*2) 0,calc(100% - var(--u)*2) 0,calc(100% - var(--u)*2) var(--u),calc(100% - var(--u)) var(--u),calc(100% - var(--u)) calc(var(--u)*2),100% calc(var(--u)*2),100% calc(100% - var(--u)*2),calc(100% - var(--u)) calc(100% - var(--u)*2),calc(100% - var(--u)) calc(100% - var(--u)),calc(100% - var(--u)*2) calc(100% - var(--u)),calc(100% - var(--u)*2) 100%,calc(var(--u)*2) 100%,calc(var(--u)*2) calc(100% - var(--u)),var(--u) calc(100% - var(--u)),var(--u) calc(100% - var(--u)*2),0 calc(100% - var(--u)*2))}
#newItem .ni{width:80%;height:80%;object-fit:contain;image-rendering:pixelated}
#newItem .nn{font:600 24px/1.05 var(--cf);letter-spacing:.6px;text-transform:uppercase;color:#2a2622}
#newItem .nd{font:600 15px/1.2 var(--cf);color:#5b534a}
#newItem .np{width:100%;display:flex;justify-content:space-between;align-items:baseline;font:600 15px/1 var(--cf);letter-spacing:.6px;text-transform:uppercase;color:#5b534a}
#newItem .np b{font:700 20px/1 var(--cf);color:#1e8a52}
#newItem button{margin-top:4px;min-width:150px;font:600 17px/1 var(--cf);letter-spacing:.6px;text-transform:uppercase;padding:13px 20px 11px;border:0;border-radius:0;color:#fffdf4;background:#d4452a;cursor:pointer;-webkit-tap-highlight-color:transparent;--u:3px;box-shadow:inset 0 -4px 0 rgba(0,0,0,.28);clip-path:polygon(0 calc(var(--u)*2),var(--u) calc(var(--u)*2),var(--u) var(--u),calc(var(--u)*2) var(--u),calc(var(--u)*2) 0,calc(100% - var(--u)*2) 0,calc(100% - var(--u)*2) var(--u),calc(100% - var(--u)) var(--u),calc(100% - var(--u)) calc(var(--u)*2),100% calc(var(--u)*2),100% calc(100% - var(--u)*2),calc(100% - var(--u)) calc(100% - var(--u)*2),calc(100% - var(--u)) calc(100% - var(--u)),calc(100% - var(--u)*2) calc(100% - var(--u)),calc(100% - var(--u)*2) 100%,calc(var(--u)*2) 100%,calc(var(--u)*2) calc(100% - var(--u)),var(--u) calc(100% - var(--u)),var(--u) calc(100% - var(--u)*2),0 calc(100% - var(--u)*2))}
#newItem button:active{transform:translateY(2px);box-shadow:inset 0 -2px 0 rgba(0,0,0,.28)}`;
document.head.appendChild(niCss);
const newItemEl = document.createElement('div'); newItemEl.id = 'newItem';
newItemEl.innerHTML = '<div class="nw"><div class="nc"><div class="nt">NEW ITEM!</div><div class="ns" id="niSub"></div><hr><div class="pic"><img class="ni" alt=""></div><div class="nn"></div><div class="nd"></div><hr><div class="np"><span>Build price</span><b></b></div><button type="button">GOT IT!</button></div></div>';
document.body.appendChild(newItemEl);
let newItemThen = null;
newItemEl.querySelector('button').onclick = () => { newItemEl.classList.remove('on'); const f = newItemThen; newItemThen = null; if (f) f(); drainNewItems(); };   // GOT IT! -> then the tarot cards come up
// skill items unlocked by a goal: their NEW ITEM card waits here if another card is already open
const niQueue = [];
const overlayOpen = () => newItemEl.classList.contains('on') || tarot.classList.contains('on');
function drainNewItems() { if (niQueue.length && !overlayOpen()) showSkillUnlock(niQueue.shift()); }
function fillNewItem(id, sub) {
  const q = s => newItemEl.querySelector(s);
  q('#niSub').textContent = sub;
  q('.ni').src = icons[id] || view.makeIcon(id); q('.nn').textContent = ITEMS[id].name; q('.nd').textContent = ITEMS[id].desc;
  q('.np span').textContent = SKILLS.includes(id) ? 'Use price' : 'Build price';
  q('.np b').textContent = peso(game.costOf(id));   // the BUILD price, not the unlock price
  newItemEl.classList.add('on');
}
function showSkillUnlock(id) {
  if (!game || game.sandbox || !ITEMS[id]) return;
  if (overlayOpen()) { if (!niQueue.includes(id)) niQueue.push(id); return; }
  newItemThen = null; fillNewItem(id, 'Skill unlocked!');
}
let newItemDay = 0;
// shows the new-item receipt for this day (if there is one) and returns true; `then` runs after GOT IT!
function showNewItem(day, then) {
  if (!game || game.sandbox || day <= 1 || newItemDay === day) return false;
  const id = Object.keys(UNLOCK_DAY).find(k => UNLOCK_DAY[k] === day && ITEMS[k]);
  if (!id || game.isUnlocked(id)) return false;
  newItemDay = day; newItemThen = then || null;
  fillNewItem(id, 'Day ' + day + ' delivery');
  return true;
}
// the morning delivery: the new item comes first, the tarot cards after GOT IT!
function restockFlow() {
  if (!game || game.phase !== 'restock') return;
  if (!showNewItem(game.wave + 1, showRestock)) showRestock();
}

// ---------- boss banner: just the boss name and its health bar, bottom centre. No plate, no warning, no subtitle ----------
const bbCss = document.createElement('style');
bbCss.textContent = `
#bossBanner{position:fixed;bottom:calc(14px + env(safe-area-inset-bottom));left:50%;z-index:40;pointer-events:none;display:none;transform:translateX(-50%);width:min(340px,64vw);text-align:center;image-rendering:pixelated;font-family:var(--cf)}
#bossBanner.on{display:block;animation:bbIn .25s steps(4) both}
#bossBanner.out{animation:bbOut .25s steps(4) both}
@keyframes bbIn{from{transform:translate(-50%,160%)}to{transform:translate(-50%,0)}}
@keyframes bbOut{from{transform:translate(-50%,0)}to{transform:translate(-50%,160%)}}
#bossBanner .bbName{font-size:clamp(12px,3vw,17px);color:#fff;line-height:1.1;margin-bottom:7px;text-shadow:2px 0 #0d0b1d,-2px 0 #0d0b1d,0 2px #0d0b1d,0 -2px #0d0b1d,2px 2px #0d0b1d,-2px -2px #0d0b1d,2px -2px #0d0b1d,-2px 2px #0d0b1d}
#bossBanner .bbBar{height:12px;background:#3a0f16;box-shadow:0 0 0 3px #0d0b1d}
#bossBanner .bbFill{height:100%;width:100%;background:#ff3b3b;transition:width .25s steps(6)}
#bossBanner .bbShield{height:5px;margin-top:6px;background:#222;box-shadow:0 0 0 3px #0d0b1d;display:none}
#bossBanner .bbShield i{display:block;height:100%;width:100%;background:#9ad7ff;transition:width .2s steps(5)}`;
document.head.appendChild(bbCss);
const bossBanner = document.createElement('div'); bossBanner.id = 'bossBanner';
bossBanner.innerHTML = '<div class="bbName"></div><div class="bbBar"><div class="bbFill"></div></div><div class="bbShield"><i></i></div>';
document.body.appendChild(bossBanner);
const bb = { ref: null, timer: null, hide: null, hp: -1, sh: -1 };
function showBossBanner(e, info) {
  if (!info) return;
  clearTimeout(bb.timer); clearTimeout(bb.hide);
  bb.ref = e; bb.hp = bb.sh = -1;
  const q = s => bossBanner.querySelector(s);
  q('.bbName').innerHTML = pxText(info.icon + ' ' + info.title);
  q('.bbShield').style.display = e.shield > 0 ? 'block' : 'none';
  bossBanner.classList.remove('out', 'on'); void bossBanner.offsetWidth; bossBanner.classList.add('on');
}
function hideBossBanner(now = false) {
  clearTimeout(bb.timer); clearTimeout(bb.hide); bb.ref = null;
  if (!bossBanner.classList.contains('on')) return;
  if (now) { bossBanner.classList.remove('on', 'out'); return; }
  bossBanner.classList.add('out'); bb.hide = setTimeout(() => bossBanner.classList.remove('on', 'out'), 460);
}
function bossBannerTick() {
  const e = bb.ref; if (!e) return;
  if (!game || e.dead || !game.enemies.includes(e) || game.phase === 'lost') { hideBossBanner(); return; }
  const hp = Math.round(Math.max(0, e.hp / e.maxhp) * 100), sh = e.shieldMax ? Math.round(Math.max(0, e.shield / e.shieldMax) * 100) : -1;
  if (hp !== bb.hp) { bb.hp = hp; bossBanner.querySelector('.bbFill').style.width = hp + '%'; }
  if (sh !== bb.sh) { bb.sh = sh; const row = bossBanner.querySelector('.bbShield'); row.style.display = sh > 0 ? 'block' : 'none'; row.firstChild.style.width = Math.max(0, sh) + '%'; }
}

function onEvent(type, d) {
  view.onEvent(type, d);
  switch (type) {
    case 'place': sfx.place(); break;
    case 'move': break;
    case 'upgrade': sfx.upgrade(); break;
    case 'stock': sfx.restock(); break;
    case 'sell': if (d.tower.broken !== 'destroyed') sfx.sell(); break;
    case 'renovate': sfx.renovate(); break;
    case 'permit': sfx.unlock(); break;
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
    case 'iceLand': sfx.iceLand(); break;
    case 'iceSnap': sfx.iceSnap(); break;
    case 'bananaPop': sfx.bananaPop(); break;
    case 'bananaLaunch': sfx.bananaLaunch(); break;
    case 'bananaBoom': sfx.bananaBoom(); break;
    case 'burgerLand': sfx.burgerLand(); break;
    case 'burgerPop': sfx.burgerPop(); break;
    case 'miniHit': sfx.miniHit(); break;
    case 'miniPop': sfx.miniPop(); break;
    case 'goldBlast': sfx.goldBlast(); break;
    case 'fruitScatter': sfx.fruitScatter(); break;
    case 'fruitBoom': sfx.fruitBoom(); break;
    case 'repair': sfx.repair(); break;
    case 'statueDry': floatText(d.x, d.y, 'Statue empty!', 'bad', 2.4); break;
    case 'refund': sfx.sell(); floatText(d.x, d.y, '+' + peso(d.amount) + ' refund', 'good', 1.8); break;
    case 'slip': sfx.slip(); break;
    case 'unlock': sfx.unlock(); banner(`🔓 ${ITEMS[d.type].name} unlocked!`); if (d.skill) { noteSkill(d.type, true); noteRecent(d.type); showSkillUnlock(d.type); } break;
    case 'buy': sfx.buy(); floatText(d.x, d.y, '🛒', 'sale', 1.5); break;
    case 'pay': sfx.sale(); floatText(d.x, d.y, '+' + peso(d.amount), 'sale', 1.5); moneyShot(d.x, d.y, d.amount); break;
    case 'soldout': floatText(d.x, d.y, 'Sold out!', 'bad', 1.5); break;
    case 'empty': floatText(d.x, d.y, '😕 nothing to buy', 'bad', 1.2); break;
    case 'dayStart': sfx.day(); banner(`☀ Day ${d.n}`); break;
    case 'evening': banner(`Store closed: +${peso(d.sales)}`); break;
    case 'newDay': banner(`☀ Day ${d.n} — restock and open up`); setTimeout(() => showNewItem(d.n), 350); break;
    case 'shelfBreak': sfx.crash(); floatText(d.shelf.x, d.shelf.y, 'Shelf smashed!', 'bad', 1.4); break;
    case 'shoot': sfx.shoot(d.tower.type); break;
    case 'kill': sfx.kill(); floatText(d.enemy.x, d.enemy.y, '+' + peso(d.cash)); if (d.enemy === bb.ref) { floatText(d.enemy.x, d.enemy.y, 'BOSS DOWN!', 'good', 2.4); sfx.win(); hideBossBanner(); } break;
    case 'bossSpawn': sfx.bossHorn(); showBossBanner(d.enemy, d.info); break;
    case 'aim': sfx.tick(); floatText(d.x, d.y, '🎯', 'bad', 1.3); break;
    case 'shotgun': sfx.shotgun(); break;
    case 'gunShot': sfx.gunShot(); break;
    case 'summon': sfx.summon(); floatText(d.x, d.y, d.label, 'bad', 2.4); break;
    case 'slamWarn': sfx.slamWarn(); break;
    case 'slam': sfx.slam(); floatText(d.x, d.y, 'SLAM!', 'bad', 1.9); break;
    case 'sodaRapid': sfx.upgrade(); floatText(d.tower.x, d.tower.y, 'RAPID FIRE!', 'good', 1.5); break;
    case 'overheat': sfx.warn(); floatText(d.tower.x, d.tower.y, 'OVERHEAT!', 'bad', 1.5); break;
    case 'cooled': break;
    case 'barrage': sfx.slamWarn(); floatText(d.enemy.x, d.enemy.y, 'BOMB RAIN!', 'bad', 1.8); break;
    case 'doorThrow': sfx.slamWarn(); floatText(d.x, d.y, 'DOOR!', 'bad', 1.6); break;
    case 'doorHit': sfx.slam(); break;
    case 'shieldHit': sfx.clink(); break;
    case 'shieldBreak': sfx.crash(); floatText(d.x, d.y, 'Shield broken!', 'good', 2.4); break;
    case 'park': sfx.engine(); floatText(d.x, d.y, '🏍️ parked', 'bad', 2.2); break;
    case 'revStart': sfx.engine(); floatText(d.x, d.y, '💨 revving…', 'bad', 2.2); break;
    case 'roamStart': sfx.whirl(); floatText(d.x, d.y, '🔥 ROAM DRIVE!', 'bad', 2.4); break;
    case 'spinStart': sfx.whirl(); floatText(d.x, d.y, '🌪️ !', 'bad', 2.2); break;
    case 'tornado': sfx.swirl(); break;
    case 'bossSmash': sfx.crash(); sfx.thud(); break;
    case 'leak': if (d.enemy === bb.ref) hideBossBanner(); sfx.leak(); floatText(d.enemy.x, d.enemy.y, '-' + d.enemy.steal + ' 🧾', 'bad'); break;
    case 'pulse': sfx.pulse(); break;
    case 'eggBoom': sfx.fruitBoom(); break;
    case 'noodleLand': sfx.wet(); break;
    case 'noodleSplash': sfx.wet(); sfx.fruitBoom(); break;
    case 'coffeeSplash': sfx.shoot('coffee'); break;
    case 'sauceSplash': sfx.splat(); break;
    case 'windup': sfx.tick(); break;
    case 'throw': sfx.whistle(); floatText(d.enemy.x, d.enemy.y, d.kind === 'molo' ? '🔥 !' : '💣 !', 'bad', 1.4); break;
    case 'molotovSplash': sfx.splat(); break;
    case 'doorCrash': sfx.crash(); floatText(d.x, d.y, '🏍️ CRASH!', 'bad', 1.8); break;
    case 'motoCrash': sfx.crash(); if (d.kind >= 2) sfx.thud(); if (d.crit) { sfx.thud(); floatText(d.x, d.y, 'CRITICAL CRASH!', 'bad', 2.2); } break;
    case 'riders': floatText(d.x, d.y, '2 robbers!', 'bad', 1.6); break;
    case 'smash': sfx.thud(); break;
    case 'deflect': sfx.bounce(); break;
    case 'immune': break;
    case 'dash': sfx.dash(); break;
    case 'dashHit': if (d.kind >= 2) sfx.thud(); break;
    case 'explode': sfx.boom(); break;
    case 'towerHit': sfx.thud(); break;
    case 'towerWarn': sfx.warn(); floatText(d.tower.x, d.tower.y, 'Overheating!', 'bad', 1.8); break;
    case 'towerBreak': sfx.crash(); floatText(d.tower.x, d.tower.y, d.why === 'destroyed' ? 'Destroyed!' : 'Broke down! Fix it: 5s', 'bad', 2.2); break;
    case 'towerFuse': sfx.warn(); floatText(d.tower.x, d.tower.y, String(d.left), 'bad', 0.9); break;
    case 'towerBlast': floatText(d.tower.x, d.tower.y, 'BOOM!', 'bad', 1.8); break;
    case 'service': sfx.fix(); floatText(d.tower.x, d.tower.y, 'Serviced', 'good', 1.6); break;
    case 'replace': sfx.replace(); floatText(d.tower.x, d.tower.y, 'Replaced!', 'good', 1.6); break;
    case 'waveStart': sfx.wave(); banner(d.subs > 1 ? `🌙 Night ${d.n} — wave 1/${d.subs}` : `🌙 Night ${d.n} — burglars!`); break;
    case 'subClear': sfx.win(); banner(`Wave ${d.sub}/${d.subs} cleared — next one in ${d.gap}s`); break;
    case 'subWave': sfx.wave(); banner(d.sub === d.subs ? `🌙 Final wave ${d.sub}/${d.subs}!` : `🌙 Wave ${d.sub}/${d.subs}`); break;
    case 'waveClear': hideBossBanner(); bankProgress(); sfx.win(); banner('Clear! +' + peso(d.bonus)); break;
    case 'freeze': sfx.freeze(); break;
    case 'bounce': sfx.bounce(); break;
    case 'retry': hideBossBanner(true); banner(`☀ Day ${d.n} again — you've got this`); break;
    case 'restock': setTimeout(restockFlow, 900); break;
    case 'lost': hideBossBanner(); sfx.lost(); setTimeout(showLost, 700); break;
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
/* ===== the build card: a rounded RECEIPT with a hard pixel shadow, pinned on the right above the whole dock (restock / speed / OPEN STORE). always on screen ===== */
#tray{position:fixed;left:auto;top:auto;right:var(--r,8px);bottom:var(--b,90px);z-index:5;width:var(--w,340px);height:var(--h,600px);animation:bpDrop .3s steps(5)}
@keyframes bpDrop{from{opacity:0;translate:0 14px}}
#tray.off{display:none!important}
#tray,#tray *,#modal,#card{scrollbar-width:none;-ms-overflow-style:none}
#tray::-webkit-scrollbar,#tray *::-webkit-scrollbar,#modal::-webkit-scrollbar,#card::-webkit-scrollbar{display:none;width:0;height:0}
#skillSlots.dayHide{display:none!important}
/* dock buttons (restock / speed / OPEN STORE): squarer corners + hard pixel shadow, matching the receipt card */
#dock #restockAll,#dock #speed,#dock #go{border-radius:14px;box-shadow:4px 4px 0 rgba(0,0,0,.65);white-space:nowrap;transition:transform .1s,box-shadow .1s,filter .15s}
#dock #go{padding:14px 22px;min-width:0}
#dock #restockAll:active:not(:disabled),#dock #speed:active:not(:disabled),#dock #go:active:not(:disabled){transform:translate(3px,3px);box-shadow:1px 1px 0 rgba(0,0,0,.65)}
/* defeat screen: centred text on top of everything, gameplay dims + blurs in behind it, no container */
body.lostOpen #modal{z-index:45;background:rgba(8,5,16,.62);-webkit-backdrop-filter:blur(7px);backdrop-filter:blur(7px);animation:lostFade .7s ease-out both}
body.lostOpen #card{background:none!important;border:0!important;box-shadow:none!important;clip-path:none!important;border-radius:0!important;padding:0!important;max-width:min(640px,92vw);text-align:center;overflow:visible;animation:lostText .7s .3s cubic-bezier(.2,.8,.3,1) both}
body.lostOpen #card::before,body.lostOpen #card::after{display:none!important}
body.lostOpen #card h1{font-size:clamp(20px,4.2vw,34px);line-height:1.3;margin:0 0 14px;color:#ff5a4a;text-shadow:4px 4px 0 #000}
body.lostOpen #card .sub,body.lostOpen #card p{text-shadow:2px 2px 0 #000}
body.lostOpen #card .row{justify-content:center;max-width:440px;margin-left:auto;margin-right:auto}
@keyframes lostFade{from{opacity:0;-webkit-backdrop-filter:blur(0);backdrop-filter:blur(0)}to{opacity:1;-webkit-backdrop-filter:blur(7px);backdrop-filter:blur(7px)}}
@keyframes lostText{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}
#tray .pxb,#tray .choice{clip-path:none}
#tray .bp{position:absolute;left:0;top:0;width:var(--lw,400px);height:var(--lh,620px);transform-origin:0 0;transform:scale(var(--k,1));box-sizing:border-box;border-radius:22px;color:#2a2622;font-family:var(--cf);
  background:linear-gradient(180deg,#fffdf4,#f5efdc);
  box-shadow:6px 6px 0 rgba(0,0,0,.65),10px 10px 0 rgba(0,0,0,.25)}
#tray .bpIn{position:absolute;inset:20px 20px 18px;display:flex;flex-direction:column;gap:10px}
/* buttons: wipe the page's button styles, then paint them receipt-style */
#tray .bpTab,#tray .sc,#tray .rc,#tray #dAct,#tray #renoPane .pxb{all:unset;box-sizing:border-box;cursor:pointer;-webkit-tap-highlight-color:transparent}
/* bookmark tabs: on the receipt's left side, tucked UNDER the sheet (no cutout), hard pixel shadow, ease-out-back pop when clicked */
#tray .bpTabs{position:absolute;left:0;top:0;width:64px;height:var(--lh,620px);transform-origin:0 0;transform:scale(var(--k,1)) translateX(-50px);display:flex;flex-direction:column;gap:10px;padding-top:min(40px,calc(var(--lh,620px)*.07));box-sizing:border-box}
#tray .bpTab{width:64px;height:124px;flex:0 1 124px;min-height:0;padding-right:14px;display:flex;flex-direction:column-reverse;align-items:center;justify-content:center;gap:8px;border-radius:14px 0 0 14px;
  background:var(--tc,#ff9a4a);color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.3);font:600 16px/1 var(--cf);letter-spacing:.5px;white-space:nowrap;filter:brightness(.86) saturate(.85);
  box-shadow:-4px 4px 0 rgba(0,0,0,.65);transform-origin:100% 50%;
  transition:transform .22s cubic-bezier(.3,1.15,.5,1),filter .2s,box-shadow .22s cubic-bezier(.3,1.15,.5,1)}
#tray .bpTab .pxe{width:24px;height:24px;margin:0;vertical-align:0;filter:brightness(0) invert(1) drop-shadow(0 2px 0 rgba(0,0,0,.3))}
#tray .bpTab .tl{writing-mode:vertical-rl;transform:rotate(180deg)}
#tray .bpTab:hover:not(.on){transform:translateX(-4px);filter:none}
#tray .bpTab.on{transform:translateX(-9px);filter:none;box-shadow:-6px 5px 0 rgba(0,0,0,.65)}
#tray .bpTab:active{transform:translateX(-5px) scale(.98)}
#tray .bpTab.pop{animation:tabPop .28s ease-out}
@keyframes tabPop{0%{transform:translateX(-6px) scale(.98)}60%{transform:translateX(-10px) scale(1.015)}100%{transform:translateX(-9px) scale(1)}}
#tray .bpBody{position:relative;flex:1;min-height:0}
#tray .tPane{position:absolute;inset:0;overflow:auto}
#tray .tPane.off{display:none!important}
#tray [data-tut]{outline:3px solid #e0891a!important;outline-offset:-3px!important;animation:tutPulseIn .7s ease-in-out infinite alternate}
@keyframes tutPulseIn{to{outline-color:#ffd23f;outline-offset:-1px}}
#tray #stocksPane{display:flex;flex-direction:column;gap:10px;overflow:hidden}
#tray .pv{flex:none;height:112px;display:flex;gap:12px}
#tray .pv .pic{flex:none;width:104px;height:104px;border-radius:12px;display:grid;place-items:center;background:rgba(42,38,34,.07)}
#tray .pv .pic img{width:80%;height:80%;object-fit:contain;image-rendering:pixelated}
#tray .pv .pvTx{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
#tray .pv .pvTop{flex:none;display:flex;align-items:center;gap:6px;min-height:26px}
#tray .pv .nm{flex:1;min-width:0;font:600 21px/1 var(--cf);letter-spacing:.6px;text-transform:uppercase;color:#2a2622;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#tray .pv .ds{flex:1;min-height:0;overflow:auto;font:600 14px/1.05 var(--cf);color:#5b534a}
#tray .pv.lock .pic img{filter:grayscale(1) opacity(.55)} #tray .pv.lock .nm{color:#8b8277}
#tray #recentRow{flex:none;display:flex;gap:4px}
#tray .rc{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;background:rgba(42,38,34,.08)}
#tray .rc img{width:80%;height:80%;object-fit:contain;image-rendering:pixelated}
#tray .rc.foc{background:rgba(212,69,42,.28)}
#tray #trayGrid{flex:1;min-height:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:112px;align-content:start;gap:8px;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain}
#tray .sc{height:112px;position:relative;min-width:0;border-radius:10px;background:rgba(42,38,34,.07);display:grid;place-items:center;overflow:hidden}
#tray .sc:hover:not(.empty):not(.foc){background:rgba(42,38,34,.15)}
#tray .sc:active:not(.empty){transform:translate(1px,1px)}
#tray .sc>img:first-child{width:58px;height:58px;object-fit:contain;image-rendering:pixelated;margin-bottom:14px}
#tray .sc.empty{background:rgba(42,38,34,.035);cursor:default}
#tray .sc.foc{background:rgba(212,69,42,.24)}
#tray .sc.sel:not(.foc){background:rgba(63,138,74,.3)}
#tray .sc.lock{background:rgba(42,38,34,.13)}
#tray .sc.lock>img:first-child{filter:grayscale(1) opacity(.5)}
#tray .sc-k{position:absolute;left:6px;top:3px;font:600 12px/1 var(--cf);color:#8b8277}
#tray .sc-lk{position:absolute;right:6px;top:5px;font-size:0;display:none} #tray .sc-lk .pxe{width:16px;height:16px;margin:0;vertical-align:0}
#tray .sc.lock .sc-lk{display:block}
#tray .sc-ct{position:absolute;right:6px;top:3px;font:600 12px/1 var(--cf);color:#8b8277} #tray .sc.lock .sc-ct{display:none} #tray .sc-ct.full{color:#c4570f}
#tray .sc-pr{position:absolute;left:0;right:0;bottom:5px;text-align:center;font:600 14px/1 var(--cf);color:#2a2622}
#tray .gBar{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;height:56px;padding-top:10px;border-top:2px dashed rgba(42,38,34,.3)}
#tray .gInfo{min-width:0;font:600 11px/1.1 var(--cf);color:#6b6258}
#tray .gInfo b{display:block;font:600 16px/1 var(--cf);letter-spacing:.5px;text-transform:uppercase;color:#2a2622;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#tray #dAct{flex:none;min-width:118px;text-align:center;padding:11px 14px 9px;border-radius:10px;font:600 16px/1 var(--cf);letter-spacing:.6px;text-transform:uppercase;color:#fffdf4;background:#d4452a;box-shadow:3px 3px 0 rgba(0,0,0,.6)}
#tray #dAct:active:not(:disabled){transform:translate(2px,2px);box-shadow:1px 1px 0 rgba(0,0,0,.6)}
#tray #dAct.gold{background:#d99a14} #tray #dAct.green{background:#3f8a4a}
#tray #dAct:disabled{background:rgba(42,38,34,.18);color:#8b8277;box-shadow:none;cursor:default}
#tray .bpBar{flex:none;height:14px;opacity:.8;background:repeating-linear-gradient(90deg,#2a2622 0 2px,transparent 2px 4px,#2a2622 4px 5px,transparent 5px 8px,#2a2622 8px 11px,transparent 11px 12px,#2a2622 12px 13px,transparent 13px 17px)}
/* STATUS tab */
#tray #renoPane{display:block;padding:0 0 8px;text-align:left}
#tray #renoPane .stHd{font:600 12px/1 var(--cf);letter-spacing:1.5px;color:#8b8277;margin:2px 2px 6px}
#tray #renoPane .stCard{background:rgba(42,38,34,.07);border-radius:12px;padding:11px 12px;margin-bottom:11px}
#tray #renoPane .stRow{display:flex;align-items:center;justify-content:space-between;gap:10px}
#tray #renoPane .stRow b{display:block;font:600 17px/1.05 var(--cf);text-transform:uppercase;color:#2a2622}
#tray #renoPane .stRow span{font:600 12px/1.1 var(--cf);color:#6b6258}
#tray #renoPane .dots{display:flex;gap:3px;margin:9px 0 6px}
#tray #renoPane .dot{flex:1;height:8px;border-radius:2px;background:rgba(42,38,34,.16)} #tray #renoPane .dot.on{background:#3f8a4a}
#tray #renoPane p{margin:4px 0 0;font:600 12px/1.1 var(--cf);color:#5b534a} #tray #renoPane p.warn{color:#c8321f} #tray #renoPane p.ok{color:#3f8a4a}
#tray #renoPane .pxb{flex:none;min-width:112px;text-align:center;padding:10px 12px 8px;border-radius:10px;font:600 14px/1 var(--cf);letter-spacing:.5px;text-transform:uppercase;color:#fffdf4;background:#d4452a;box-shadow:3px 3px 0 rgba(0,0,0,.6);white-space:nowrap}
#tray #renoPane .pxb:active:not(:disabled){transform:translate(2px,2px);box-shadow:1px 1px 0 rgba(0,0,0,.6)}
#tray #renoPane .pxb:disabled{background:rgba(42,38,34,.18);color:#8b8277;box-shadow:none;cursor:default}
#tray #renoPane .lim{display:grid;grid-template-columns:1fr 1fr;gap:9px 12px}
#tray #renoPane .lr{display:flex;align-items:center;gap:7px;min-width:0}
#tray #renoPane .lr img{width:24px;height:24px;image-rendering:pixelated;flex:none;object-fit:contain}
#tray #renoPane .lr .t{flex:1;min-width:0}
#tray #renoPane .lr .n{display:flex;justify-content:space-between;gap:5px;font:600 11px/1.1 var(--cf);color:#2a2622}
#tray #renoPane .lr .n i{font-style:normal;color:#6b6258}
#tray #renoPane .lr .bar{height:6px;border-radius:2px;background:rgba(42,38,34,.16);margin-top:3px;overflow:hidden}
#tray #renoPane .lr .bar u{display:block;height:100%;background:#3f8a4a;text-decoration:none}
#tray #renoPane .lr.full .bar u{background:#c4570f} #tray #renoPane .lr.full .n i{color:#c4570f}
/* PAYCHECK SHOP tab */
#tray #shopPane{padding:0 0 8px}
#tray #shopPane .sub{color:#5b534a!important;font:600 13px/1.1 var(--cf)}
#tray #shopPane .choice{background:rgba(42,38,34,.07);color:#2a2622;border:0;border-radius:12px;box-shadow:none;backdrop-filter:none}
#tray #shopPane .choice .nm{color:#2a2622;font:600 16px/1.05 var(--cf);text-transform:uppercase;letter-spacing:.4px} #tray #shopPane .choice .ds{color:#5b534a;font:600 12px/1.05 var(--cf)} #tray #shopPane .lvl{color:#8b8277}
#tray #shopPane .choice>span:last-child{color:#c4570f!important}
#tray #shopPane .choice:disabled{opacity:.5}
/* ----- compact receipt (phones, short tablets): the card is laid out at the REAL size, so text stays readable ----- */
#tray.bpc .bpIn{inset:14px 14px 12px;gap:6px}
#tray.bpc .bpTab{padding-right:10px;gap:5px;font-size:13px} #tray.bpc .bpTab .pxe{width:20px;height:20px}
#tray.bpc .pv{height:74px;gap:8px} #tray.bpc .pv .pic{width:68px;height:68px}
#tray.bpc .pv .nm{font-size:19px} #tray.bpc .pv .ds{font-size:13px;line-height:1.05}
#tray.bpc #stocksPane{gap:6px}
#tray.bpc #trayGrid{grid-auto-rows:90px;gap:6px} #tray.bpc .sc{height:90px}
#tray.bpc .sc>img:first-child{width:46px;height:46px;margin-bottom:14px}
#tray.bpc .sc-k,#tray.bpc .sc-ct{font-size:12px} #tray.bpc .sc-pr{font-size:15px;bottom:4px}
#tray.bpc .gBar{height:46px;padding-top:6px;gap:8px}
#tray.bpc .gInfo{font-size:11px} #tray.bpc .gInfo b{font-size:15px}
#tray.bpc #dAct{min-width:96px;padding:10px 10px 8px;font-size:15px}
#tray.bpc .bpBar{height:8px}
#tray.bpc #renoPane .stCard{padding:8px 10px;margin-bottom:8px} #tray.bpc #renoPane .stRow b{font-size:16px} #tray.bpc #renoPane .stRow span,#tray.bpc #renoPane p{font-size:12px}
#tray.bpc #shopPane .choice{padding:8px 10px} #tray.bpc #shopPane .choice .nm{font-size:15px} #tray.bpc #shopPane .choice .ds{font-size:12px}
`;
document.head.appendChild(trayCss);
$('tray').innerHTML = `<nav class="bpTabs">
    <button class="bpTab on" id="subSell" style="--tc:#ff9a4a" title="Shelves and turrets"><span>🛒</span><span class="tl">ITEMS</span></button>
    <button class="bpTab" id="subSkill" style="--tc:#8fc2ff" title="Skill items: mop, shaken cola, cigarettes"><span>⚡</span><span class="tl">SKILLS</span></button>
    <button class="bpTab" id="tabReno" style="--tc:#6fe3a8" title="Permit, store size and item limits"><span>📜</span><span class="tl">STATUS</span></button>
    <button class="bpTab" id="tabShop" style="--tc:#ffd23f" title="Paycheck Shop"><span>💰</span><span class="tl">SHOP</span></button>
  </nav>
<div class="bp" id="bpSheet">
  <div class="bpIn">
    <div class="bpBody">
      <div class="tPane" id="stocksPane">
        <div class="pv" id="dCard">
          <div class="pic"><img id="dImg" alt=""></div>
          <div class="pvTx"><div class="pvTop"><div class="nm" id="dNm"></div><div id="recentRow"></div></div><div class="ds" id="dDs"></div></div>
        </div>
        <div id="trayGrid"></div>
        <div class="gBar"><div class="gInfo" id="gInfo"></div><button id="dAct"></button></div>
      </div>
      <div class="tPane off" id="renoPane"></div>
      <div class="tPane off" id="shopPane"></div>
    </div>
    <div class="bpBar"></div>
  </div>
</div>`;

const cells = new Map();   // item id -> grid cell button
let focusId = 'shelf';     // the item shown in the left detail card
function buildCards() {
  $('trayGrid').innerHTML = ''; cells.clear();
  BUILD_ORDER.forEach(id => {
    icons[id] = view.makeIcon(id);
    const c = document.createElement('button'); c.className = 'sc'; c.dataset.id = id; c.title = ITEMS[id].name;
    c.innerHTML = `<img alt="" src="${icons[id]}"><span class="sc-k" data-k></span><span class="sc-lk">🔒</span><span class="sc-ct" data-ct></span><span class="sc-pr" data-pr></span>`;
    c.onclick = () => {   // an item you already own: one tap on its icon selects it (no need to press Build)
      focusId = id;
      if (game && game.isUnlocked(id)) {
        if (selected === id) selected = null;
        else if (game.countOf(id) >= game.limitOf(id)) { sfx.bad(); banner(`${ITEMS[id].name}: limit reached`); }
        else if (game.costOf(id) > game.cash) { sfx.bad(); banner(`Need ${peso(game.costOf(id))} for ${ITEMS[id].name}`); }
        else { selected = id; noteSkill(id, true); noteRecent(id); }
        pickedTower = null; moving = null; preview = null; view.setCursor(null);
      }
      refresh();
    };
    cells.set(id, c);
  });
  applySub();
}
// the STOCKS tab has two sub-tabs: SELLABLES (shelves + turrets) and SKILL ITEMS (mop, shaken cola, cigarettes)
let subTab = 'sell';
// items whose unlock day has not been reached yet are NOT shown on the receipt card at all
const visibleIds = () => BUILD_ORDER.filter(id => !game || game.isUnlocked(id) || game.canUnlock(id));   // locked skills stay hidden until their goal is done
let visKey = '';
function applySub() {
  syncTabs();
  const box = $('trayGrid'), ids = visibleIds().filter(id => (SKILLS.includes(id) ? 'skill' : 'sell') === subTab);
  box.innerHTML = '';
  if (!ids.includes(focusId)) focusId = ids[0];
  ids.forEach(id => box.appendChild(cells.get(id)));
  const total = Math.max(12, Math.ceil(ids.length / 3) * 3);
  for (let i = ids.length; i < total; i++) { const e = document.createElement('div'); e.className = 'sc empty'; box.appendChild(e); }   // always full rows of 3
  if (game) refresh();
}
// the four tabs on top of the card: SELLABLES + SKILLS (both item grids), STATUS, SHOP
function syncTabs() {
  $('subSell').classList.toggle('on', trayTab === 'stocks' && subTab === 'sell');
  $('subSkill').classList.toggle('on', trayTab === 'stocks' && subTab === 'skill');
  $('tabReno').classList.toggle('on', trayTab === 'reno'); $('tabShop').classList.toggle('on', trayTab === 'shop');
}
// left card: icon, name, description, stats and the build / unlock button
let detailKey = '';
function renderDetail() {
  const id = focusId, def = ITEMS[id]; if (!def || !game) return;
  const locked = !game.isUnlocked(id), cost = game.costOf(id), uc = UNLOCKS[id], reach = !locked || game.canUnlock(id), ud = UNLOCK_DAY[id] || 1, sk = SKILL_UNLOCKS[id];
  const key = id + '|' + locked; if (key !== detailKey) {
    detailKey = key;
    $('dImg').src = icons[id] || ''; $('dNm').textContent = def.name; $('dDs').textContent = def.desc; $('dDs').scrollTop = 0;
  }
  $('dCard').classList.toggle('lock', locked); $('dCard').classList.toggle('sel', !locked && selected === id);
  const act = $('dAct');
  act.className = 'pxb ' + (locked ? 'gold' : selected === id ? 'green' : '');
  const lm = game.limitOf(id), cn = game.countOf(id), full = !locked && lm !== Infinity && cn >= lm;
  act.disabled = locked ? (!!sk || !reach || game.cash < uc) : (cost > game.cash || (full && selected !== id));
  const txt = locked ? (sk ? '🔒 Locked' : reach ? `Unlock  ${peso(uc)}` : `🔒 Day ${ud}`) : selected === id ? `Selected ✓  ${peso(cost)}` : full ? 'Limit reached' : `Build  ${peso(cost)}`;
  if (act.dataset.t !== txt) { act.dataset.t = txt; act.textContent = txt; }
  const info = locked ? `<b>${def.name}</b>${sk ? sk.text + ' (' + sk.prog(game).join('/') + ')' : reach ? 'Locked · buy it to use it' : 'Unlocks on day ' + ud}` : `<b>${def.name}</b>${selected === id ? 'Tap the store to place it' : 'Cost ' + peso(cost)}${lm === Infinity ? '' : ' · Placed ' + cn + '/' + lm}`;
  if ($('gInfo').dataset.k !== info) { $('gInfo').dataset.k = info; $('gInfo').innerHTML = info; }
  renderRecent();
}
// RECENT: the last things you built or unlocked (kept between runs), shown under the preview card
const RECENT_ITEMS_KEY = 'shelfDefenseRecentItems';
let recentItems = []; try { recentItems = JSON.parse(localStorage.getItem(RECENT_ITEMS_KEY) || '[]').filter(id => ITEMS[id]).slice(0, 8); } catch (e) { /* no storage */ }
function noteRecent(id) {
  if (!ITEMS[id]) return;
  recentItems = [id, ...recentItems.filter(x => x !== id)].slice(0, 8);
  try { localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(recentItems)); } catch (e) { /* no storage */ }
}
let recentKey = '';
function renderRecent() {
  if (!game) return;
  const ids = recentItems.filter(id => game.isUnlocked(id)).slice(0, 3), key = ids.join(',') + '|' + focusId;
  if (key === recentKey) return; recentKey = key;
  const row = $('recentRow');
  row.innerHTML = ids.length ? ids.map(id => `<button class="rc ${id === focusId ? 'foc' : ''}" data-id="${id}" title="${ITEMS[id].name}"><img alt="" src="${icons[id] || ''}"></button>`).join('') : '';
  row.querySelectorAll('.rc').forEach(b => b.onclick = () => { focusId = b.dataset.id; subTab = SKILLS.includes(focusId) ? 'skill' : 'sell'; applySub(); });
}
$('dAct').onclick = () => {
  const id = focusId;
  if (!game.isUnlocked(id)) { if (SKILL_UNLOCKS[id]) { sfx.bad(); banner(`🔒 ${SKILL_UNLOCKS[id].text} (${SKILL_UNLOCKS[id].prog(game).join('/')})`); return; } if (!game.canUnlock(id)) { sfx.bad(); banner(`🔒 ${ITEMS[id].name} unlocks on day ${UNLOCK_DAY[id]}`); return; } if (!game.unlock(id)) { sfx.bad(); banner(`Need ${peso(UNLOCKS[id])} to unlock ${ITEMS[id].name}`); } else { noteSkill(id, true); noteRecent(id); } return; }   // unlocking costs store profit
  selected = selected === id ? null : id; if (selected) noteSkill(id, true); pickedTower = null; moving = null; preview = null; view.setCursor(null); closeTray(); refresh();
};
$('subSell').onclick = () => { subTab = 'sell'; setTab('stocks'); applySub(); };
$('subSkill').onclick = () => { subTab = 'skill'; setTab('stocks'); applySub(); };
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
    const def = ITEMS[id], cost = game.costOf(id), wait = def.kind === 'skill' && game.phase !== 'wave' && !game.sandbox, dis = cost > game.cash || wait;
    html += `<button class="slot ${selected === id ? 'sel' : ''} ${dis ? 'dis' : ''}" data-id="${id}" title="${def.name}"><img alt="" src="${icons[id] || ''}"><span class="cost">${peso(cost)}</span>${wait ? '<span class="lk">🌙</span>' : ''}</button>`;
  }
  if (html !== slotHTML) { box.innerHTML = html; slotHTML = html; }
}
$('skillSlots').addEventListener('click', e => {
  const b = e.target.closest('.slot'); if (!b || !game) return;
  if (!b.dataset.id) { subTab = 'skill'; setTab('stocks'); applySub(); openTray(); return; }   // empty slot: open the skill items
  const id = b.dataset.id;
  selected = selected === id ? null : id; pickedTower = null; moving = null; preview = null; view.setCursor(null); closeTray(); refresh();
});
// the build card is always on the right side (above OPEN STORE), so it's never a modal: no open / close, just tabs.
let trayTab = 'stocks', panelFolded = false, panelTouched = false;
const trayOpen = () => false;   // kept for the popups / tutorial: the card never blocks the store, so it never counts as "open"
function openTray() { panelFolded = false; placeBuild(); refresh(); }
function closeTray() { /* the card stays put: selecting an item leaves it in view */ }
function setTab(tab) {
  trayTab = tab; syncTabs();
  $('stocksPane').classList.toggle('off', tab !== 'stocks'); $('renoPane').classList.toggle('off', tab !== 'reno'); $('shopPane').classList.toggle('off', tab !== 'shop');
  renderReno(); renderShopTab();
}
// the STATUS tab: store permit, store size (renovation) and how many of every item you may place
let statusKey = '';
function renderReno() {
  if (!game || trayTab !== 'reno') return;
  const lv = game.room, maxed = lv >= MAX_ROOM, size = n => ROOM_BASE + ROOM_STEP * n, permit = game.permit, need = maxed ? 0 : PERMIT_FOR_RENO[lv];
  const pMax = permit >= MAX_PERMIT, pChk = game.canUpgradePermit(), pCost = game.permitCost();
  const rChk = game.canRenovate(), rCost = game.renovateCost();
  const dots = (n, on) => Array.from({ length: n }, (_, i) => `<span class="dot ${i < on ? 'on' : ''}"></span>`).join('');
  const lim = BUILD_ORDER.filter(id => ITEM_LIMITS[id] !== undefined && game.isUnlocked(id)).map(id => {
    const c = game.countOf(id), l = game.limitOf(id);
    return `<div class="lr ${c >= l ? 'full' : ''}"><img alt="" src="${icons[id] || ''}"><div class="t"><div class="n"><span>${ITEMS[id].name}</span><i>${c}/${l === Infinity ? '∞' : l}</i></div><div class="bar"><u style="width:${Math.min(100, c / l * 100)}%"></u></div></div></div>`;
  }).join('');
  const permitHint = maxed ? 'The store is fully renovated.' : permit >= need ? `Permit Lv ${need} unlocks the next renovation: you have it.` : `The next renovation needs Permit Lv ${need}.`;
  const renoHint = maxed ? 'The store is as big as it gets.' : `Next: ${size(lv + 1)}x${size(lv + 1)} (+${ROOM_STEP} columns and rows). Everything you built stays put, and every item limit goes up. Only before you open the store.`;
  const renoWarn = !maxed && !rChk.ok ? rChk.reason : '';
  const html = `<div class="stHd">STORE PERMIT</div>
    <div class="stCard"><div class="stRow"><div><b>Permit Level ${permit}</b><span>of ${MAX_PERMIT}</span></div>
      <button class="pxb" id="permitBtn" ${pChk.ok ? '' : 'disabled'}>${pMax ? 'MAX PERMIT' : `Upgrade  ${peso(pCost)}`}</button></div>
      <div class="dots">${dots(MAX_PERMIT, permit)}</div><p class="${maxed || permit >= need ? 'ok' : ''}">${permitHint}</p></div>
    <div class="stHd">STORE SIZE</div>
    <div class="stCard"><div class="stRow"><div><b>${size(lv)} x ${size(lv)} store</b><span>Renovation ${lv} of ${MAX_ROOM}</span></div>
      <button class="pxb" id="renoBtn" ${rChk.ok ? '' : 'disabled'}>${maxed ? 'MAX SIZE' : `Renovate  ${peso(rCost)}`}</button></div>
      <div class="dots">${dots(MAX_ROOM + 1, lv + 1)}</div><p>${renoHint}</p>${renoWarn ? `<p class="warn">${renoWarn}</p>` : ''}</div>
    <div class="stHd">ITEM LIMITS</div>
    <div class="stCard"><div class="lim">${lim}</div><p>Each renovation raises every limit.</p></div>`;
  if (html === statusKey) return;
  const pane = $('renoPane'), top = pane.scrollTop;
  statusKey = html; pane.innerHTML = html; pane.scrollTop = top;
  $('permitBtn').onclick = () => { if (game.upgradePermit()) { banner(`📜 Store permit Lv ${game.permit}`); refresh(); } else sfx.bad(); };
  $('renoBtn').onclick = () => {
    if (game.renovate()) { view.setGame(game); banner(`🏠 Renovated: ${size(game.room)}x${size(game.room)} store`); pickedTower = null; preview = null; refresh(); }
    else { sfx.bad(); if (!rChk.ok) banner(rChk.reason); }
  };
}
$('tabReno').onclick = () => setTab('reno');
$('tabShop').onclick = () => setTab('shop');
// every click on a bookmark restarts its ease pop
document.querySelectorAll('#tray .bpTab').forEach(b => b.addEventListener('click', () => { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }));
$('tray').addEventListener('pointerdown', () => { panelTouched = true; });
// pin the card to the right side, right above the OPEN STORE button, and shrink it to the room there is
const BP_W = 400, BP_H = 620, TAB_W = 60;   // TAB_W = how far the bookmark tabs stick out to the left
function placeBuild() {
  const t = $('tray'), dock = $('dock');
  const r = dock.getBoundingClientRect();   // anchored above the WHOLE dock, so it never covers restock / speed / OPEN STORE
  const show = !!game && running && !dock.classList.contains('off') && r.width > 0 && !panelFolded;
  t.classList.toggle('off', !show);
  const mR = Math.max(6, innerWidth - r.right);
  const hidden = !game || !running || panelFolded || dock.classList.contains('off');   // really hidden (menu / folded) vs just measured at 0 for a moment
  if (!show) { if (r.width) document.documentElement.style.setProperty('--bpx', Math.round(innerWidth - r.left + 14) + 'px'); if (hidden) view.setReserve(0); return; }
  // responsive receipt: pick a READABLE text scale, then give the card whatever real width / height is free (it reflows instead of shrinking)
  const keyS = innerWidth + 'x' + innerHeight + ':' + Math.round(dock.offsetHeight / 2);
  if (placeBuild.key !== keyS) { placeBuild.key = keyS; placeBuild.top = r.top; }   // the dock top only changes with the screen, not with the labels
  const availH = Math.max(150, placeBuild.top - 10 - 52);                // from under the mute / pause buttons down to the dock
  let k = Math.max(0.85, Math.min(1, innerHeight / 760));                // text scale: 1 on PC / iPad, ~.85 on phones
  const frac = innerWidth < 800 ? 0.42 : 0.36;                           // share of the screen width the card may take
  const W0 = Math.min(BP_W * k, innerWidth * frac - TAB_W * k * 0.8), H0 = Math.min(BP_H * k, availH);
  k = Math.max(0.55, Math.min(k, W0 / 290, H0 / 270));                   // only shrink the text if the card would get tinier than 290 x 270
  const LW = Math.round(W0 / k), LH = Math.round(H0 / k);
  t.classList.toggle('bpc', LH < 570 || LW < 380);
  t.style.setProperty('--k', k.toFixed(4)); t.style.setProperty('--lw', LW + 'px'); t.style.setProperty('--lh', LH + 'px');
  t.style.setProperty('--w', (LW * k).toFixed(1) + 'px'); t.style.setProperty('--h', (LH * k).toFixed(1) + 'px');
  const used = (LW * k) + 50 * k + mR + 8;                                // card + the tabs that stick out on its left
  document.documentElement.style.setProperty('--bpx', Math.round(used + 6) + 'px');   // Sara stays left of the card
  t.style.setProperty('--r', mR + 'px'); t.style.setProperty('--b', Math.max(6, innerHeight - r.top + 10) + 'px');
  view.setReserve(used - 34 * k);   // the store is re-framed in the space LEFT of the receipt (its tabs may overlap the store's edge a little)
}
window.addEventListener('resize', placeBuild);
window.addEventListener('orientationchange', () => setTimeout(placeBuild, 300));
// keep the receipt snapped to the dock whenever the dock or the screen changes (day won, modals closing, browser bars, rotation...)
try {
  const ro = new ResizeObserver(() => placeBuild()); ro.observe($('dock')); ro.observe($('stage'));
  const mo = new MutationObserver(() => placeBuild()); mo.observe($('dock'), { attributes: true, attributeFilter: ['class', 'style'] }); mo.observe($('modal'), { attributes: true, attributeFilter: ['class'] });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', placeBuild);
} catch (e) { /* old browser: the resize listener still works */ }
function renderTabletStatus() { placeBuild(); }


// on touch screens there is no hover, so the item you tapped (or are moving) keeps the white pixel outline
let touchUI = false;
$('view').addEventListener('pointerdown', e => { touchUI = e.pointerType !== 'mouse'; }, true);
function refresh() {
  if (touchUI && game) view.setHover(moving || pickedTower || null);
  if (!game) return;
  $('lives').textContent = game.lives; $('cash').textContent = pesoN(game.cash);
  const ck = game.clock();
  setHTML($('hour'), `${ck.icon} ${ck.text}`);
  $('waveTxt').textContent = game.phase === 'wave' ? (game.subWaves > 1 ? `NIGHT ${game.wave + 1} · WAVE ${game.subWave}/${game.subWaves}` : `NIGHT ${game.wave + 1}`) : `DAY ${game.wave + 1}`;
  $('clock').classList.toggle('night', game.isNight);
  const rs = $('restockAll'), cost = game.restockCost();
  $('rsCost').textContent = pesoN(cost); rs.disabled = cost === 0 || game.cash < cost || game.phase === 'lost';   // restock-all only when you can afford the whole refill
  const vk = visibleIds().join(',') + '|' + subTab;
  if (vk !== visKey) { visKey = vk; applySub(); return; }   // a new day reached: re-list the receipt (applySub calls refresh again)
  const av = available();
  for (const [id, c] of cells) {
    const locked = !game.isUnlocked(id), cost = game.costOf(id);
    c.classList.toggle('lock', locked); c.classList.toggle('sel', !locked && selected === id); c.classList.toggle('foc', focusId === id);
    c.querySelector('[data-k]').textContent = locked ? '' : av.indexOf(id) + 1;
    c.querySelector('[data-pr]').textContent = locked && SKILL_UNLOCKS[id] ? '🔒' : locked && !game.canUnlock(id) ? 'Day ' + UNLOCK_DAY[id] : peso(locked ? UNLOCKS[id] : cost);
    const lm = game.limitOf(id), ct = c.querySelector('[data-ct]'), cn = game.countOf(id);
    ct.textContent = locked || lm === Infinity ? '' : cn + '/' + lm; ct.classList.toggle('full', cn >= lm);
  }
  renderDetail();
  const go = $('go'), setGo = (cls, dis, txt) => { go.disabled = dis; go.className = 'pxb ' + cls; setHTML(go, txt); };
  // the label NEVER changes (always OPEN STORE); only the look does: gold = tap to open, grey = not available right now
  const OPEN = '<svg class="sun" viewBox="0 0 9 9" shape-rendering="crispEdges"><path fill="currentColor" d="M4 0h1v1H4zM4 8h1v1H4zM0 4h1v1H0zM8 4h1v1H8zM1 1h1v1H1zM7 1h1v1H7zM1 7h1v1H1zM7 7h1v1H7zM3 2h3v1H3zM2 3h5v3H2zM3 6h3v1H3z"/></svg> OPEN STORE';
  if (game.phase === 'prep') setGo(game.canOpen().ok ? 'gold' : '', false, OPEN);   // an empty store can't open
  else if (game.phase === 'evening') setGo('gold', false, OPEN);                      // tapping still skips the wait for night
  else setGo('', true, OPEN);                                                          // store already open / night / lost
  musicWant = !running ? null : game.phase === 'wave' ? 'night' : game.phase === 'lost' ? null : 'day';
  renderInfo();
  renderReno(); renderSlots(); renderTabletStatus();
  $('skillSlots').classList.toggle('dayHide', game.phase !== 'wave' && !game.sandbox);   // skill items only work at night
  view.setRange(...rangeFor());
  devSync();
}

const fpOf = id => (ITEMS[id].foot > 1 && !ITEMS[id].onShelves) ? ITEMS[id].foot : 1;   // size of the placement cursor (the soda statue is 3x3)
function rangeFor() {
  if (pickedTower && pickedTower.type === 'statue') return [pickedTower, STATUE_RANGE];
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
  if (moving && ![...game.towers, ...game.shelves, ...game.traps].includes(moving)) { moving = null; drag = null; preview = null; view.setCursor(null); }
  if (moving) {   // relocating: touch gets a confirm / cancel right on the target spot; mouse just clicks the spot
    if (preview && !(drag && drag.on)) {
      at = [preview.x, preview.y, 1.3];
      html = `<div class="hd">Move ${ITEMS[moving.type || 'shelf'].name} here?</div><div class="row">${pbtn('mvok', '✔', '', !game.canMove(moving, preview.x, preview.y).ok, 'green')}${pbtn('mvno', '✖', '', false, 'gray')}</div>`;
    } else { hidePop(); return; }
  } else if (pickedTower && pickedTower.kind === 'shelf' && game.shelves.includes(pickedTower)) {
    const s = pickedTower, cap = game.capOf(s), uc = game.unitCostOf(s), need = cap - s.units, can = Math.min(need, Math.floor(game.cash / uc));
    at = [s.x, s.y, s.type === 'statue' ? 2.6 : s.type === 'steel' ? 1.7 : 1.5];
    html = `<div class="hd">${ITEMS[s.type || 'shelf'].name} ${cap ? `<small>${s.units}/${cap}</small>` : ''}<div class="bars">${pbar(s.hp / s.maxhp < 0.35 ? 'lo' : '', s.hp / s.maxhp)}</div></div><div class="row">`
      + (cap ? pbtn('rst', '📦', need === 0 ? 'FULL' : peso(can * uc), can <= 0, 'green') : '') + (game.canMoveItem(s) ? pbtn('mov', '✥', 'MOVE', false, 'blue') : '') + (s.placed ? pbtn('sell', '💰', peso(game.sellValue(s)), false, 'red') : '') + '</div>';
  } else if (pickedTower && (game.towers.includes(pickedTower) || game.traps.includes(pickedTower))) {
    const t = pickedTower, def = ITEMS[t.type], isT = t.kind === 'tower', up = isT ? game.upgradeCost(t) : 0;
    at = [t.x, t.y, isT ? 1.9 : 0.8];
    const bars = isT ? `<div class="bars">${pbar(t.hp / t.maxhp < 0.35 ? 'lo' : '', t.hp / t.maxhp)}${pbar(t.wear > 0.7 ? 'hot' : 'wear', t.wear)}</div>` : '';
    const tag = !isT ? `${t.uses} left` : t.broken ? 'BROKEN' : `Lv ${t.level}/${MAX_LEVEL}`;
    let acts = '';
    if (isT && t.broken) acts += pbtn('rpl', '🛠️', peso(game.replaceCost(t)), game.replaceCost(t) > game.cash, 'gold');
    if (isT && !t.broken) {
      acts += pbtn('upg', '⏫', t.level >= MAX_LEVEL ? 'MAX' : peso(up), t.level >= MAX_LEVEL || up > game.cash, 'green');
      if (game.needsService(t)) acts += pbtn('svc', '🔧', peso(game.serviceCost(t)), game.serviceCost(t) > game.cash);
    }
    acts += pbtn('mov', '✥', 'MOVE', false, 'blue');
    acts += pbtn('sell', '💰', peso(game.sellValue(t)), false, 'red');
    if (isT) acts += pbtn('rot', '🔄', 'TURN', false, 'blue');   // rightmost button
    html = `<div class="hd">${def.name} <small>${tag}</small>${bars}</div><div class="row">${acts}</div>`;
  } else if (selected && preview) {   // touch: first tap previews the spot, then confirm / cancel right on it
    at = [preview.x, preview.y, 1.3];
    html = `<div class="hd">${ITEMS[selected].name} <small>${peso(game.costOf(selected))}</small></div><div class="row">${pbtn('place', '✔', '', !game.canPlace(selected, preview.x, preview.y).ok, 'green')}${pbtn('cancel', '✖', '', false, 'gray')}</div>`;
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
  else if (a === 'place' && selected && preview) { if (game.canPlace(selected, preview.x, preview.y).ok) { game.place(selected, preview.x, preview.y); noteRecent(selected); noteSkill(selected, false); preview = null; view.setCursor(null); } else sfx.bad(); }
  else if (a === 'cancel') { selected = null; preview = null; pickedTower = null; view.setCursor(null); }
  else if (a === 'mov') { if (game.canMoveItem(t)) { moving = t; selected = null; preview = null; view.setCursor(null); banner('✥ Tap a new spot (or drag the item)'); } else sfx.bad(); }
  else if (a === 'mvok') { if (moving && preview && game.move(moving, preview.x, preview.y)) endMove(); else sfx.bad(); }
  else if (a === 'mvno') { moving = null; preview = null; view.setCursor(null); }
  refresh();
});
// finish a move: the item stays picked so its buttons pop up again at the new spot
function endMove() { pickedTower = moving; moving = null; drag = null; preview = null; view.setCursor(null); sfx.place(); }
window.addEventListener('resize', () => game && refresh());
window.addEventListener('orientationchange', () => setTimeout(() => game && refresh(), 250));

// ---------- input ----------
const cv = $('view');
// what is under the pointer? With nothing selected to build, items are picked by their real 3D shape (so a tall machine never hits the floor behind it);
// a mouse over bare floor is simply "nothing". Placing / moving works on floor cells; touch keeps the forgiving floor cell.
function pickAt(e) {
  const at = c => c && (game.towerAt(c.x, c.y) || game.shelfAt(c.x, c.y) || game.trapAt(c.x, c.y));
  if (!selected && !moving) {
    const ia = view.pickItem(e.clientX, e.clientY);
    if (ia) return { c: { x: ia.x, y: ia.y }, item: ia.item };
    const c = view.pick(e.clientX, e.clientY);
    return { c, item: e.pointerType === 'mouse' ? null : at(c) };
  }
  const c = view.pick(e.clientX, e.clientY);
  return { c, item: at(c) };
}
cv.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || !game || !running) return;
  const pk = pickAt(e); hover = pk.c;
  view.setHover(pk.item || null);
  if (moving && hover) view.setCursor(hover, game.canMove(moving, hover.x, hover.y).ok, fpOf(moving.type || 'shelf'));
  else if (selected && hover) view.setCursor(hover, game.canPlace(selected, hover.x, hover.y).ok, fpOf(selected)); else view.setCursor(null);
  view.setRange(...rangeFor());
});
// drag an item (mouse or finger): press the item you already tapped, drag it over the floor, release on the new spot
cv.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id || !game) return;
  if (!drag.on && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 10) return;
  if (!drag.on) { drag.on = true; moving = drag.item; hidePop(); }
  const c = view.pick(e.clientX, e.clientY);
  preview = c; if (c) view.setCursor(c, game.canMove(moving, c.x, c.y).ok, fpOf(moving.type || 'shelf')); else view.setCursor(null);
});
function dragEnd(e, cancel) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null; try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
  if (!d.on) return;
  const c = cancel ? null : view.pick(e.clientX, e.clientY);
  if (c && game.move(d.item, c.x, c.y)) { moving = d.item; endMove(); }
  else { if (c && !(c.x === d.item.x && c.y === d.item.y)) { sfx.bad(); floatText(c.x, c.y, game.canMove(d.item, c.x, c.y).reason, 'bad'); } moving = null; preview = null; view.setCursor(null); }
  refresh();
}
cv.addEventListener('pointerup', e => dragEnd(e, false));
cv.addEventListener('pointercancel', e => dragEnd(e, true));
cv.addEventListener('pointerleave', () => { hover = null; view.setHover(null); if (!preview) view.setCursor(null); });
function cvDown(e) {
  if (!game || !running || game.phase === 'lost') return;
  closeTray();
  const pk = pickAt(e), c = pk.c;
  if (!c) return;
  const existing = pk.item;
  if (moving) {   // tap-to-move: pick the new spot (touch: first tap previews, the ✔ confirms)
    if (existing === moving) { moving = null; preview = null; view.setCursor(null); refresh(); return; }
    const touch = e.pointerType !== 'mouse';
    if (touch && !(preview && preview.x === c.x && preview.y === c.y)) { preview = c; view.setCursor(c, game.canMove(moving, c.x, c.y).ok, fpOf(moving.type || 'shelf')); refresh(); return; }
    if (game.move(moving, c.x, c.y)) endMove();
    else { sfx.bad(); floatText(c.x, c.y, game.canMove(moving, c.x, c.y).reason, 'bad'); }
    refresh(); return;
  }
  if (existing && existing === pickedTower && !selected && game.canMoveItem(existing)) {   // already selected: pressing it can start a drag
    drag = { item: existing, id: e.pointerId, sx: e.clientX, sy: e.clientY, on: false }; try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  }
  const overShelf = selected && ITEMS[selected].onShelves && existing && existing.kind === 'shelf' && !existing.type;   // the steel shelf is built ON a plain shelf
  const overItem = selected && ITEMS[selected].onItems;   // the ice cubes drop on top of shelves and machines
  if (existing && !overShelf && !overItem && !(selected && ITEMS[selected].kind === 'trap' && !game.towerAt(c.x, c.y) && !game.shelfAt(c.x, c.y))) {
    pickedTower = existing; preview = null; selected = null; view.setCursor(null); refresh(); return;
  }
  if (!selected) { pickedTower = null; refresh(); return; }
  pickedTower = null;
  const touch = e.pointerType !== 'mouse';
  if (touch && !(preview && preview.x === c.x && preview.y === c.y)) {   // first tap previews
    preview = c; view.setCursor(c, game.canPlace(selected, c.x, c.y).ok, fpOf(selected)); refresh(); return;
  }
  const chk = game.canPlace(selected, c.x, c.y);
  if (chk.ok) { game.place(selected, c.x, c.y); noteRecent(selected); noteSkill(selected, false); preview = null; view.setCursor(null); }
  else { sfx.bad(); floatText(c.x, c.y, chk.reason, 'bad'); }
  refresh();
}
// ---------- camera: drag the floor to pan, wheel / pinch to zoom (limits live in view.js). A press only counts as a tap on release, if it wasn't a drag. ----------
const ptrs = new Map();   // active pointers on the canvas
let tap = null, pinch = null, panning = false;
cv.addEventListener('pointerdown', e => {
  if (!game || !running || game.phase === 'lost') return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) {   // second finger: pinch-zoom, forget any pending tap
    const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; tap = null; panning = true; return;
  }
  if (e.button === 1 || e.button === 2) { tap = null; panning = true; try { cv.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); return; }
  // pressing the already-picked item starts moving it (its own drag logic), everything else waits for the release
  const ex = pickAt(e).item;
  if (moving || (ex && ex === pickedTower && !selected && game.canMoveItem(ex))) { tap = null; cvDown(e); return; }
  tap = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ev: e }; panning = false;
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
});
cv.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (pinch.d > 0 && d > 0) view.zoomBy(d / pinch.d);
    view.panBy(mx - pinch.mx, my - pinch.my); pinch = { d, mx, my }; return;
  }
  if (tap && e.pointerId === tap.id && !panning && Math.hypot(e.clientX - tap.sx, e.clientY - tap.sy) > 9) { panning = true; tap = null; hidePop(); }
  if (panning && !drag) { view.panBy(dx, dy); cv.style.cursor = 'grabbing'; }
});
function ptrEnd(e, cancel) {
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (ptrs.size === 0) { panning = false; cv.style.cursor = ''; }
  if (tap && e.pointerId === tap.id) {
    const t = tap; tap = null; try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
    if (!cancel) cvDown(t.ev);   // it was a real tap: act on the spot where it started
  }
}
cv.addEventListener('pointerup', e => ptrEnd(e, false));
cv.addEventListener('pointercancel', e => ptrEnd(e, true));
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => { if (!game || !running) return; e.preventDefault(); view.zoomBy(Math.exp(-e.deltaY * 0.0014)); }, { passive: false });
window.addEventListener('keydown', e => { if (game && running && (e.key === 'v' || e.key === 'V') && !paused) view.resetView(); });   // V = recentre the camera
window.addEventListener('keydown', e => {
  if (!game || !running) return;
  if (paused) { if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') $('pause').click(); return; }
  const i = parseInt(e.key, 10);
  const av = available();
  if (i >= 1 && i <= av.length) { selected = av[i - 1]; pickedTower = null; moving = null; preview = null; closeTray(); refresh(); }
  else if (e.key === 'Escape') { selected = null; pickedTower = null; moving = null; drag = null; preview = null; view.setCursor(null); refresh(); }
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
const openModal = html => { card.innerHTML = pxText(html); modal.classList.add('on'); document.body.classList.toggle('lostOpen', !!game && game.phase === 'lost'); placeBuild(); };
function closeModal() { modal.classList.remove('on'); document.body.classList.remove('lostOpen'); }

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
    ${sec('UPGRADES')}${META.map(row).join('')}`;
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
const hideTarot = () => { tarot.classList.remove('on'); setTimeout(drainNewItems, 0); };
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
  openModal(`<h1>YOU HAVE BEEN ROBBED!</h1>
    <div class="sub">They cleaned you out on night ${game.wave + 1}. The cops showed up, the store is yours again. Nothing is lost.</div>
    <p>Nights survived: <b>${game.wave}</b><br>Customers served: <b>${game.served}</b> (${peso(game.sales)})<br>Burglars busted: <b>${game.kills}</b></p>
    <p style="font-size:18px;color:#ffcf4a">Paycheck: 💰 ${lastPay} <span class="lvl">(banked: ${save.bank})</span></p>
    <div class="row"><button class="pxb gold" id="m-retry">▶ Retry day ${game.wave + 1}</button></div>
    <div class="row" style="margin-top:8px"><button class="pxb" id="m-new">↻ Brand new store</button></div>`);
  $('m-retry').onclick = () => { game.retryDay(); view.setGame(game); pickedTower = null; moving = null; preview = null; selected = null; view.setCursor(null); closeModal(); refresh(); };
  $('m-new').onclick = () => { save.shifts++; persist(); newStore(true); };
}

// ---------- Sara's tutorial (first run only) ----------
const SARA_DIR = 'assets/sara/';   // Sara's pictures live here (see SARA_FILES)
// which button / tab / cell to pulse so the player can find the item in the build menu
function hintBuild(id, cellOnly) {
  if (selected === id) return null;
  const sk = SKILLS.includes(id) ? 'skill' : 'sell';
  if (panelFolded) return null;
  if (trayTab !== 'stocks' || subTab !== sk) return sk === 'sell' ? '#subSell' : '#subSkill';
  return focusId === id && !cellOnly ? '#dAct' : `#trayGrid .sc[data-id="${id}"]`;
}
// say: [text, face?] lines with a NEXT button. task: Sara waits until done() is true.
const TUT = [
  { id: 'hello', say: [
    ['Ay, ikaw pala yung nag-apply kahapon! Buti naman dumating ka. 😄', 'point'],
    ['Ako si Sara. Ako ang magtuturo sa iyo ngayong unang araw. Madali lang ito, promise!'],
    ['Ganito ang takbo dito: sa umaga, mamimili ang mga customer. Pagdating ng gabi, papasok ang mga magnanakaw para nakawin ang kaha natin.'],
    ['Kaya unahin muna natin ang mga shelf. Doon kasi bumibili ang mga customer.'] ] },
  { id: 'receipt', say: [
    ['Nakikita mo ba ang resibo sa kanan, sa itaas ng OPEN STORE? 🧾', 'point'],
    ['Diyan mo bibilhin ang lahat ng gamit sa tindahan. May apat na tab sa gilid nito: ITEMS, SKILLS, STATUS at SHOP.'],
    ['Ganito ang paglalagay: una, piliin ang Shelf sa grid ng ITEMS. Pangalawa, pindutin ang BUILD sa ibaba ng resibo. Pangatlo, i-tap ang sahig kung saan mo ito gustong ilagay.'],
    ['Kapag nailagay na, i-tap mo ulit ang shelf para i-restock, ibenta, o ilipat gamit ang ✥ MOVE. Pwede mo rin siyang i-drag papunta sa ibang pwesto!'] ] },
  { id: 'menu', task: () => 'Sa resibo, nasa ITEMS tab ang grid. Pindutin ang Shelf.',
    done: () => panelTouched || !!selected || game.shelves.length > 0, hint: () => hintBuild('shelf', true) },
  { id: 'pick', task: () => 'Pindutin ang BUILD sa ibaba ng resibo para kunin ang Shelf.',
    done: () => selected === 'shelf' || game.shelves.length > 0, hint: () => hintBuild('shelf') },
  { id: 'shelves', task: () => { const n = Math.min(5, game.shelves.length);
      return selected === 'shelf' ? `I-tap ang sahig para maglagay ng shelf: ${n}/5. Mag-iwan ng daanan para sa mga customer!` : `Piliin ulit ang Shelf sa resibo at pindutin ang BUILD: ${n}/5.`; },
    done: () => game.shelves.length >= 5, hint: () => hintBuild('shelf') },
  { id: 'open', say: [
    ['Ang galing mo! Kumpleto na ang mga shelf natin. 💪', 'point'],
    ['Buksan na natin ang tindahan para makapasok ang mga customer.'] ] },
  { id: 'go', task: () => 'Pindutin ang OPEN STORE sa kanang-ibaba!', done: () => game.phase !== 'prep', hint: () => '#go' },
  { id: 'watch', task: () => 'Panoorin mo muna silang mamili sa mga shelf at magbayad sa counter...', done: () => game.served > 0 },
  { id: 'vend', say: [
    ['Tingnan mo, may kita na tayo! 💰', 'point'],
    ['Pero mag-ingat, pagdating ng gabi ay may mga magnanakaw na papasok sa pinto.'],
    ['Haay... nakakadismaya na talaga. Lagi na lang nananakawan ang tindahan natin. Pagod na pagod na ako dito.', 'disappointed'],
    ['Kaya ikaw na ang bahala magbantay sa tindahan! Bugbugin mo nang todo ang mga magnanakaw na yan, hanggang hindi na sila makabalik! Walang awa!', 'angry'],
    ['Maglagay ka ng Vending Machine malapit sa pinto, kung saan sila dadaan. Minarkahan ko na para sa iyo.'] ] },
  { id: 'vendTask', marks: true,
    task: () => selected === 'cans' ? 'I-tap ang may markang sahig malapit sa pinto para ilagay ang Vending Machine.' : 'Sa resibo, piliin ang Vending Machine sa grid at pindutin ang BUILD, tapos ilagay ito malapit sa pinto.',
    done: () => game.towers.some(t => t.type === 'cans'), hint: () => hintBuild('cans') },
  { id: 'bye', say: [
    ['Tahimik lang. Maririnig mo na sila, malapit na silang dumating.'],
    ['Ang vending machine na ang bahala sa kanila. Good luck, boss! Kaya mo yan! ✨', 'point'] ] },
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
#sara{position:fixed;left:calc((100vw - var(--bpx,190px)) / 2);width:min(620px,calc(100vw - var(--bpx,190px)));transform:translateX(-50%);bottom:0;display:flex;align-items:flex-end;gap:6px;z-index:8;pointer-events:none;font-family:var(--cf);transition:left .45s cubic-bezier(.4,0,.2,1),width .45s cubic-bezier(.4,0,.2,1)}
#saraCv{flex:none;display:block;transform-origin:50% 100%;transition:width .45s cubic-bezier(.4,0,.2,1),height .45s cubic-bezier(.4,0,.2,1);image-rendering:pixelated;image-rendering:crisp-edges;image-rendering:pixelated;filter:drop-shadow(3px 3px 0 rgba(8,6,24,.45))}
#sara.big{left:50vw;width:min(1000px,96vw)}
#sara.big #saraBox{font-size:clamp(16px,2.1vw,22px);margin-bottom:9vh;padding:22px 24px 12px;min-height:130px}
#saraBox{transition:margin-bottom .45s cubic-bezier(.4,0,.2,1),padding .45s cubic-bezier(.4,0,.2,1),min-height .45s cubic-bezier(.4,0,.2,1),font-size .45s cubic-bezier(.4,0,.2,1)}
#saraBox .sn{transition:top .45s cubic-bezier(.4,0,.2,1),font-size .45s cubic-bezier(.4,0,.2,1)}
#sara.big #saraBox .sn{font-size:14px;top:-15px}
@keyframes saraBoxPop{from{transform:scale(.6);opacity:0}to{transform:none;opacity:1}}
#sara:not(.off) #saraBox{transform-origin:0 100%;animation:saraBoxPop .26s cubic-bezier(.34,1.56,.64,1)}
#saraDim{position:fixed;inset:0;z-index:7;background:rgba(8,5,16,.55);backdrop-filter:blur(0);-webkit-backdrop-filter:blur(0);visibility:hidden;opacity:0;transition:opacity .45s cubic-bezier(.4,0,.2,1),backdrop-filter .45s cubic-bezier(.4,0,.2,1),-webkit-backdrop-filter .45s cubic-bezier(.4,0,.2,1),visibility .45s}
#saraDim.on{visibility:visible;opacity:1;backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)}
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
  const face = tut.face || 'normal';
  if (tut.faceNow !== face) tut.faceNow = face;
  const isSay = !!s.say, last = isSay && tut.li === s.say.length - 1 && tut.i === TUT.length - 1;
  $('saraNext').style.display = isSay ? '' : 'none';
  $('saraNext').textContent = last ? 'GOOD LUCK ✔' : 'NEXT ▶';
}

// ---- Sara: 2D pixel-art sprite drawn on #saraCv. The four pictures (idle1, point, disappointed, angry) are loaded once; the green screen is
// removed automatically and a thick, chunky white outline is added, all at load time, so the raw art can stay as it is. ----
const SARA_FRAMES = ['idle1', 'point', 'disappointed', 'angry', 'blink'];   // a line's face name = the picture it shows; no face = point while she talks, idle1 once she is done
const SARA_FILES = { idle1: 'normal.png', point: 'talk.png', disappointed: 'dissapointed.png', angry: 'angry.png', blink: 'blink.png' };   // picture -> file in assets/sara/
const SARA_GRID = 128, SARA_OUTLINE = 3;
// sample the picture on a coarse "art pixel" grid (centre of every block) so the result is crisp, chunky pixel art
function saraSample(data, w, h, G) {
  const out = new Uint8ClampedArray(G * G * 4), sx = w / G, sy = h / G;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const i = (Math.min(h - 1, (y * sy + sy / 2) | 0) * w + Math.min(w - 1, (x * sx + sx / 2) | 0)) * 4, o = (y * G + x) * 4;
    out[o] = data[i]; out[o + 1] = data[i + 1]; out[o + 2] = data[i + 2]; out[o + 3] = 255;
  }
  return out;
}
// chroma key: find the green from the corners, flood-fill it away from the edges (so green INSIDE the art is safe), keep the biggest blob
function saraKey(px, G) {
  let kr = 0, kg = 0, kb = 0, n = 0;
  for (const [cx, cy] of [[0, 0], [G - 4, 0], [0, 4], [G - 4, 4]]) for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const i = ((cy + y) * G + cx + x) * 4; kr += px[i]; kg += px[i + 1]; kb += px[i + 2]; n++; }
  kr /= n; kg /= n; kb /= n;
  const isKey = i => { const r = px[i], g = px[i + 1], b = px[i + 2], d = Math.hypot(r - kr, g - kg, b - kb); return d < 70 || (g - Math.max(r, b) > 45 && d < 120); };
  const bg = new Uint8Array(G * G), st = [];
  const push = (x, y) => { if (x < 0 || y < 0 || x >= G || y >= G) return; const p = y * G + x; if (bg[p] || !isKey(p * 4)) return; bg[p] = 1; st.push(p); };
  for (let i = 0; i < G; i++) { push(i, 0); push(i, G - 1); push(0, i); push(G - 1, i); }
  while (st.length) { const p = st.pop(), x = p % G, y = (p / G) | 0; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  // enclosed pockets of pure key colour (e.g. the gap between an arm and the body) are removed too
  { const seen = new Uint8Array(G * G);
    const strong = p => { if (bg[p]) return false; const i = p * 4, r = px[i], g = px[i + 1], b = px[i + 2]; return Math.hypot(r - kr, g - kg, b - kb) < 85 && g - Math.max(r, b) > 30; };
    for (let s = 0; s < G * G; s++) { if (seen[s] || !strong(s)) continue;
      const comp = [s], q = [s]; seen[s] = 1;
      while (q.length) { const p = q.pop(), x = p % G, y = (p / G) | 0;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue; const np = ny * G + nx; if (!seen[np] && strong(np)) { seen[np] = 1; q.push(np); comp.push(np); } } }
      if (comp.length >= 2) for (const p of comp) bg[p] = 1; } }
  // fringe: art pixels touching the key that are still tinted green get eaten too
  for (let pass = 0; pass < 2; pass++) {
    const kill = [];
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) { const p = y * G + x; if (bg[p]) continue; const i = p * 4;
      if (px[i + 1] - Math.max(px[i], px[i + 2]) < 22) continue;
      if ((x > 0 && bg[p - 1]) || (x < G - 1 && bg[p + 1]) || (y > 0 && bg[p - G]) || (y < G - 1 && bg[p + G])) kill.push(p); }
    for (const p of kill) bg[p] = 1;
  }
  const m = new Uint8Array(G * G); for (let p = 0; p < G * G; p++) m[p] = bg[p] ? 0 : 1;
  // keep only the largest connected blob (drops stray specks)
  const lab = new Int32Array(G * G); let best = 0, bestN = 0, id = 0;
  for (let s = 0; s < G * G; s++) { if (!m[s] || lab[s]) continue; id++; let c = 0; const q = [s]; lab[s] = id;
    while (q.length) { const p = q.pop(); c++; const x = p % G, y = (p / G) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue; const np = ny * G + nx; if (m[np] && !lab[np]) { lab[np] = id; q.push(np); } } }
    if (c > bestN) { bestN = c; best = id; } }
  for (let p = 0; p < G * G; p++) if (lab[p] !== best) m[p] = 0;
  return m;
}
// chunky outline: grow the silhouette by R art-pixels (rounded square-ish brush) and paint the new ring white
function saraOutline(m, G, R) {
  const ring = new Uint8Array(G * G);
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    if (m[y * G + x]) continue;
    let hit = false;
    for (let dy = -R; dy <= R && !hit; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R + R) continue;
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue;
      if (m[ny * G + nx]) { hit = true; break; }
    }
    if (hit) ring[y * G + x] = 1;
  }
  return ring;
}

// rotate + scale the art around her feet with nearest-neighbour sampling: every output pixel is a whole art pixel (no blur, no jaggies, no AA)
function saraRender(src, w, h, dst, cw, ang, sc) {
  const cos = Math.cos(ang), sin = Math.sin(ang), px = cw / 2, py = h, ox = w / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < cw; x++) {
    const vx = x + 0.5 - px, vy = y + 0.5 - py;
    const sx = ((vx * cos + vy * sin) / sc + ox) | 0, sxf = (vx * cos + vy * sin) / sc + ox;
    let sy = (-vx * sin + vy * cos) / sc + h;
    let c = 0;
    if (sxf >= 0 && sxf < w) { if (sy >= h) sy = h - 1; if (sy >= 0) c = src[(sy | 0) * w + sx]; }
    dst[y * cw + x] = c;
  }
}
let saraAnim = 0, saraSprites = null, saraLoading = false, saraPopAt = 0, saraPose = '', saraDraw = '', saraImg = null, saraDst = null;
function saraLoadImg(file) {
  return new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('missing: ' + SARA_DIR + file)); im.src = SARA_DIR + file; });
}
async function saraLoad() {
  if (saraSprites || saraLoading) return;
  saraLoading = true;
  try {
    const got = await Promise.allSettled(SARA_FRAMES.map(n => saraLoadImg(SARA_FILES[n])));
    got.forEach((r, k) => { if (r.status === 'rejected') console.warn('Sara picture ' + SARA_FRAMES[k] + ' not found (' + r.reason.message + '), using idle instead'); });
    const names = SARA_FRAMES.filter((n, k) => got[k].status === 'fulfilled'), imgs = got.filter(r => r.status === 'fulfilled').map(r => r.value);
    if (!imgs.length) throw new Error('no Sara pictures found in ' + SARA_DIR);
    const G = SARA_GRID, raw = {};
    let x0 = G, y0 = G, x1 = 0, y1 = 0;
    imgs.forEach((im, k) => {
      const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
      const px = saraSample(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, G);
      const m = saraKey(px, G), ring = saraOutline(m, G, SARA_OUTLINE);
      raw[names[k]] = { px, m, ring };
      for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if (m[y * G + x] || ring[y * G + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    });
    const w = x1 - x0 + 1, h = y1 - y0 + 1, frames = {}, px32 = {};   // one shared crop for every frame, so nothing jumps when she changes picture
    for (const n of names) {
      const { px, m, ring } = raw[n], c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'), id = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = (y + y0) * G + x + x0, o = (y * w + x) * 4;
        if (m[p]) { id.data[o] = px[p * 4]; id.data[o + 1] = px[p * 4 + 1]; id.data[o + 2] = px[p * 4 + 2]; id.data[o + 3] = 255; }
        else if (ring[p]) { id.data[o] = id.data[o + 1] = id.data[o + 2] = id.data[o + 3] = 255; }
      }
      g.putImageData(id, 0, 0); frames[n] = c; px32[n] = new Uint32Array(id.data.buffer);
    }
    for (const n of SARA_FRAMES) if (!frames[n]) { frames[n] = frames.idle1 || frames[names[0]]; px32[n] = px32.idle1 || px32[names[0]]; }   // a missing picture falls back to idle
    saraSprites = { frames, px32, w, h };
  } catch (e) { console.warn('Sara sprite failed to load:', e); }
  saraLoading = false;
}
saraLoad();   // preload + key + outline at startup, so Sara is ready the instant the first dialogue opens
function saraFrame(now) {
  if (!tut.on) { saraAnim = 0; return; }
  saraAnim = requestAnimationFrame(saraFrame);
  const cv = $('saraCv'); if (!cv || !sara || !saraSprites || sara.classList.contains('top')) return;
  const { px32, frames, w, h } = saraSprites, vh = innerHeight, big = sara.classList.contains('big');

  // which picture: the line's own pose (disappointed / angry / point) if it has one; otherwise she uses the talking pose while the text types
  // and goes back to the normal pose only once she is done talking
  const base = frames[tut.faceNow] ? tut.faceNow : tutTyping() ? 'point' : 'idle1';
  const key = base === 'idle1' && frames.blink && now % 4200 < 150 ? 'blink' : base;   // when she is just standing there she blinks every ~4 seconds

  // size: whole-number zoom of the art grid, so the pixels stay perfectly square
  const want = (big ? Math.max(260, Math.min(500, vh * 0.64)) : Math.max(130, Math.min(220, vh * 0.32))) * (vh <= 480 ? 0.8 : 1);
  const K = Math.max(1, Math.round(want / h + 0.2)), PAD = 8, cw0 = w + PAD * 2;   // PAD = room on both sides for the tilt
  if (cv.width !== cw0 || cv.height !== h || !saraImg) { cv.width = cw0; cv.height = h; saraImg = cv.getContext('2d').createImageData(cw0, h); saraDst = new Uint32Array(saraImg.data.buffer); saraDraw = ''; }
  const cw = cw0 * K + 'px', ch = h * K + 'px';
  if (cv.style.width !== cw) { cv.style.width = cw; cv.style.height = ch; }
  if (saraPose !== base) { saraPose = base; saraPopAt = now; }                         // every new picture gets a small pop

  // tilt: she rocks around her feet, and a short soft pop (scale) plays when the picture changes. Both are drawn nearest-neighbour on the art grid,
  // so every pixel snaps to a whole art-pixel: no blur, no jagged edges.
  const t = now / 1000, deg = Math.round(Math.sin(t * 1.5) * 2.6 * 10) / 10;
  const pp = Math.min(1, (now - saraPopAt) / 320), back = 1 + 1.70158 * Math.pow(pp - 1, 3) + 0.70158 * Math.pow(pp - 1, 2);
  const sc = Math.round((pp >= 1 ? 1 : 0.92 + 0.08 * back) * 200) / 200;
  const sig = key + '|' + deg + '|' + sc;
  if (saraDraw !== sig) {
    saraRender(px32[key], w, h, saraDst, cw0, deg * Math.PI / 180, sc);
    cv.getContext('2d').putImageData(saraImg, 0, 0); saraDraw = sig;
  }
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
  const talking = !!s.say;
  sara.classList.toggle('big', talking); dim.classList.toggle('on', talking);   // dialogue: big Sara + blurred, dimmed game; tasks: small Sara, game fully usable
  if (s.task) {
    if (s.done()) { sfx.sale(); tutEnter(tut.i + 1); return; }
    const t = s.task();
    if (t !== tut.last) { const typing = tutTyping(); tut.last = t; tut.full = Array.from(t); if (!typing) tut.shown = tut.full.length; tutPaint(); }
    tutHint(s.hint ? s.hint() : null); tutMarks(!!s.marks);
  } else { tutHint(null); tutMarks(false); }
}
function tutStart() {
  if (save.tutDone || tut.on || !game || game.sandbox) return;
  if (game.wave > 0 || (save.tutDone === undefined && save.best > 0)) { save.tutDone = true; persist(); return; }   // veterans who never saw it skip it; a restarted run replays it
  tutBuildUI(); tut.on = true; sara.classList.remove('off'); saraPose = ''; saraDraw = ''; saraLoad(); if (!saraAnim) saraAnim = requestAnimationFrame(saraFrame);
  let st = save.tutStep || 0;   // resume where we left off; a rolled-back day (no sales yet) goes back to opening the store
  const gi = TUT.findIndex(x => x.id === 'go'), bi = TUT.findIndex(x => x.id === 'bye');
  if (st > gi && st < bi && game.served === 0) st = gi;
  tutEnter(st);
  tutTick();   // size + dim right now, not at the next 150ms tick
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
  musicTick(dt); bossBannerTick();
  if (game) {
    if (game.sandbox) { game.cash = 999999; game.lives = 999; }   // dev sandbox: unlimited money, can't lose
    const was = game.phase; game.update(paused || tutHold() || overlayOpen() ? 0 : dt * speed);   // the game freezes while a NEW ITEM card or the tarot cards are open
    if (game.phase === 'wave' || game.phase === 'morning' || game.phase === 'evening' || was !== game.phase) { if (Math.floor(clock * 4) !== Math.floor((clock - dt) * 4)) refresh(); }
  }
  view.render(dt, clock);
  requestAnimationFrame(frame);
}
// ---------- DEV SANDBOX: press M on the title screen. Unlimited money, everything unlocked, summon bosses, open the store ----------
var devPanel = null, devN = 1;
const DEV_BOSSES = [['bombexpert', '💣 Bomb Expert'], ['gunslinger', '🔫 Gunslinger'], ['motoduo', '🏍️ Riding in Tandem'], ['doorrobber', '🚪 Door Robber']];
const DEV_FOES = [['sneak', 'Sneak'], ['runner', 'Runner'], ['vest', 'Vest'], ['bruiser', 'Bruiser'], ['jacket', 'Jacket'], ['molotov', 'Molotov'], ['moto', 'Motor Bandit'], ['bat', 'Bat']];
function devSetup(g) {
  g.sandbox = true; g.unlocked = new Set(BUILD_ORDER); g.permit = MAX_PERMIT; g.cash = 999999; g.lives = 999; g.maxLives = 999;
}
// turn the current moment into a night so burglars can be summoned any time
function devForceNight() {
  const g = game; if (g.phase === 'restock' || g.phase === 'lost') return false;
  if (g.phase !== 'wave') { g.customers = []; g.dayQueue = []; g.walkers = []; g.phase = 'wave'; g.waveTime = 0; g.subWave = 1; g.subWaves = 1; g.gapT = 0; g.spawnQueue = []; g.waveTotal = 1; }
  return true;
}
function devSummon(type, boss) {
  if (!devForceNight()) return;
  const g = game, n = boss ? 1 : devN;
  for (let i = 0; i < n; i++) { const sp = g.activeSpawns; g.spawnEnemy(type, sp[Math.floor(Math.random() * sp.length)]); }
}
function devAct(a, arg) {
  const g = game; if (!g || !g.sandbox) return;
  if (a === 'boss') devSummon(arg, true);
  else if (a === 'foe') devSummon(arg, false);
  else if (a === 'count') devN = devN === 1 ? 5 : devN === 5 ? 10 : 1;
  else if (a === 'open') { if (g.phase === 'prep') g.startDay(); else banner('The store is already open'); }
  else if (a === 'night') { if (g.phase === 'prep' || g.phase === 'morning') { g.customers = []; g.dayQueue = []; g.phase = 'evening'; } if (g.phase === 'evening') g.startWave(); }
  else if (a === 'prep') { g.enemies = []; g.customers = []; g.dayQueue = []; g.spawnQueue = []; g.projectiles = []; g.fires = []; g.bombs = []; g.skills = []; g.zones = []; g.fruits = []; g.donuts = []; g.rolls = []; g.eggs = []; g.tornados = []; g.swirls = []; g.gapT = 0; if (g.phase !== 'restock') g.phase = 'prep'; hideBossBanner(true); }
  else if (a === 'kill') { for (const e of g.enemies) e.dead = true; hideBossBanner(true); }
  else if (a === 'day') { g.wave = Math.max(0, g.wave + arg); }
  else if (a === 'heal') { for (const t of g.towers) if (t.kind === 'tower') { t.broken = null; t.fuse = null; t.wear = 0; t.hp = t.maxhp; t.warned = false; } for (const s of g.shelves) { s.hp = s.maxhp; s.units = g.capOf(s); } }
  else if (a === 'hurt') { for (const t of g.towers) if (t.kind === 'tower') { t.broken = null; t.fuse = null; t.hp = t.maxhp * arg; } for (const s of g.shelves) s.hp = s.maxhp * arg; }
  else if (a === 'stock') { for (const s of g.shelves) s.units = g.capOf(s); }
  else if (a === 'reno') { if (g.phase === 'prep' && g.room < MAX_ROOM) { if (g.renovate()) { view.setGame(g); pickedTower = null; preview = null; banner('🏠 Renovated'); } } else banner(g.room >= MAX_ROOM ? 'Fully renovated' : 'Renovate in prep only'); }
  refresh();
}
function devBuildPanel() {
  const css = document.createElement('style');
  css.textContent = `
#devPanel{position:fixed;left:max(12px,env(safe-area-inset-left));top:max(120px,18vh);z-index:5;width:198px;max-height:calc(100vh - 120px - 86px);overflow:auto;scrollbar-width:none;font-family:var(--cf);color:#fff;background:rgba(20,14,34,.9);border:2px solid #7e5bff;border-radius:16px;box-shadow:4px 4px 0 rgba(0,0,0,.6);padding:8px 8px 10px}
#devPanel::-webkit-scrollbar{display:none}
#devPanel .dh{display:flex;align-items:center;justify-content:space-between;font:700 14px/1 var(--cf);letter-spacing:1px;color:#c8b6ff;cursor:pointer;padding:2px 2px 6px}
#devPanel .ds2{font:600 10px/1 var(--cf);letter-spacing:1.5px;color:#8f84b8;margin:8px 2px 4px}
#devPanel .db{display:grid;grid-template-columns:1fr 1fr;gap:5px}
#devPanel .db.one{grid-template-columns:1fr}
#devPanel button{all:unset;box-sizing:border-box;cursor:pointer;text-align:center;padding:7px 4px 6px;border-radius:9px;background:#3b2f66;font:600 12px/1.1 var(--cf);color:#fff;box-shadow:0 3px 0 #1d1538}
#devPanel button:active{transform:translateY(2px);box-shadow:0 1px 0 #1d1538}
#devPanel button.boss{background:#8a2d3a;box-shadow:0 3px 0 #4a1119}
#devPanel button.go{background:#2f8a5a;box-shadow:0 3px 0 #164a2e}
#devPanel button.warn{background:#9a6a1c;box-shadow:0 3px 0 #523608}
#devPanel .dd{display:flex;align-items:center;justify-content:space-between;gap:5px}
#devPanel .dd b{flex:1;text-align:center;font:700 13px/1 var(--cf);color:#ffd23f}
#devPanel .dd button{width:30px}
#devPanel.fold .dbody{display:none}`;
  document.head.appendChild(css);
  const p = document.createElement('div'); p.id = 'devPanel'; p.className = 'off';
  const btn = (a, label, cls = '', arg = '') => `<button class="${cls}" data-a="${a}" data-arg="${arg}">${label}</button>`;
  p.innerHTML = `<div class="dh" id="devHd"><span>🛠 SANDBOX</span><span id="devFold">▾</span></div><div class="dbody">
    <div class="ds2">STORE</div><div class="db">${btn('open', '☀ Open store', 'go')}${btn('night', '🌙 Start night', 'go')}${btn('prep', '↺ Back to prep', 'warn')}${btn('reno', '🏠 Renovate', '')}</div>
    <div class="ds2">DAY</div><div class="dd">${btn('day', '◀', '', -1)}<b id="devDay">DAY 1</b>${btn('day', '▶', '', 1)}</div>
    <div class="ds2">BOSSES</div><div class="db one">${DEV_BOSSES.map(([id, n]) => btn('boss', n, 'boss', id)).join('')}</div>
    <div class="ds2">BURGLARS <span id="devCnt"></span></div><div class="db">${DEV_FOES.map(([id, n]) => btn('foe', n, '', id)).join('')}${btn('count', 'Amount: x1', '', '')}${btn('kill', '✖ Kill all', 'warn', '')}</div>
    <div class="ds2">ITEMS</div><div class="db">${btn('heal', '🔧 Heal all', 'go')}${btn('stock', '📦 Restock', 'go')}${btn('hurt', '🔥 HP 50%', 'warn', 0.5)}${btn('hurt', '💀 HP 20%', 'warn', 0.2)}</div></div>`;
  document.body.appendChild(p);
  p.addEventListener('click', e => {
    const b = e.target.closest('button[data-a]'); if (b) { const a = b.dataset.a, v = b.dataset.arg; devAct(a, a === 'day' || a === 'hurt' ? Number(v) : v); sfx.click(); return; }
    if (e.target.closest('#devHd')) p.classList.toggle('fold');
  });
  p.addEventListener('pointerdown', e => e.stopPropagation());
  devPanel = p;
}
function devSync() {
  if (!devPanel) { if (!game || !game.sandbox) return; devBuildPanel(); }
  const on = !!game && game.sandbox && running;
  devPanel.classList.toggle('off', !on); if (!on) return;
  $('devDay').textContent = 'DAY ' + (game.wave + 1);
  const c = devPanel.querySelector('[data-a="count"]'); if (c) c.textContent = 'Amount: x' + devN;
}
window.addEventListener('keydown', e => {   // M on the title screen = sandbox
  if ((e.key !== 'm' && e.key !== 'M') || e.repeat || running || !$('stage').classList.contains('menu') || $('title').classList.contains('off') || $('title').classList.contains('pop') || $('modal').classList.contains('on')) return;
  newStore(false, true); startRun();
});

// ---------- PLAY: choose one of 5 save slots ----------
const slotCss = document.createElement('style');
slotCss.textContent = `#title.slotsOut{animation:slotsOut .38s cubic-bezier(.6,-.28,.74,.05) forwards;pointer-events:none}
@keyframes slotsOut{0%{transform:translateY(-50%) scale(1);opacity:1}100%{transform:translateY(-50%) scale(0);opacity:0}}
#slotsPane{position:fixed;inset:0;z-index:9;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;pointer-events:none}
#slotsPane>*{pointer-events:auto}
#slotsPane .slotRow{display:flex;gap:6px;align-items:stretch;width:min(270px,66vw);filter:drop-shadow(4px 4px 0 rgba(0,0,0,.65));opacity:0;transform:scale(0);animation:slotPop .38s cubic-bezier(.3,1.5,.5,1) forwards;animation-delay:calc(var(--i)*60ms + 250ms)}
#slotsPane .slotRow .choice{flex:1;width:auto;margin:0;min-width:0;padding:8px 10px}
#slotsPane .slotRow .pxb.sq{flex:none;align-self:center}
#slotsPane .slotBack{width:min(150px,40vw);filter:drop-shadow(4px 4px 0 rgba(0,0,0,.65));opacity:0;transform:scale(0);animation:slotPop .38s cubic-bezier(.3,1.5,.5,1) forwards;animation-delay:600ms}
@keyframes slotPop{0%{opacity:0;transform:scale(0)}100%{opacity:1;transform:scale(1)}}
.slotRow .choice.cur{--ol:#ffd23f}.slotRow .tag{display:inline-block;margin-left:6px;padding:2px 7px;border-radius:99px;background:#ffd23f;color:#5a3a00;font:700 11px/1.2 var(--cf);vertical-align:2px}`;
document.head.appendChild(slotCss);
function slotInfo(s) {
  if (!s) return 'Empty — start a new store';
  const r = s.run, d = s.t ? new Date(s.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  return (r ? `Day ${r.wave + 1} · ${peso(r.cash)} · ${r.towers ? r.towers.filter(t => t.kind === 'tower').length : 0} machines` : 'Day 1 · just started') + (d ? ` · ${d}` : '');
}
function closeSlots(restore) {
  const p = $('slotsPane'); if (p) p.remove();
  if (restore) $('title').classList.remove('slotsOut');
}
function showSlots() {
  if (running) return;
  $('title').classList.add('slotsOut');
  let pane = $('slotsPane');
  if (!pane) { pane = document.createElement('div'); pane.id = 'slotsPane'; document.body.appendChild(pane); }
  const rows = save.slots.map((s, i) => `<div class="slotRow" style="--i:${i}"><button class="choice pxb ${i === save.slot && s ? 'cur' : ''}" data-slot="${i}"><span class="ic">${s ? '💾' : '➕'}</span><span><div class="nm">SLOT ${i + 1}${i === save.slot && s ? '<span class="tag">LAST</span>' : ''}</div><div class="ds">${slotInfo(s)}</div></span></button>${s ? `<button class="pxb red sq" data-del="${i}" title="Delete slot">🗑</button>` : ''}</div>`).join('');
  pane.innerHTML = rows + '<button class="pxb slotBack" id="s-back">BACK</button>';
  pane.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => playSlot(+b.dataset.slot));
  pane.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const i = +b.dataset.del;
    openModal(`<h2>Delete slot ${i + 1}?</h2><p>${slotInfo(save.slots[i])}<br>This store can't be brought back. Your paycheck bank stays.</p>
      <div class="row"><button class="pxb red" id="m-yes">Delete</button><button class="pxb gold" id="m-no">Cancel</button></div>`);
    $('m-no').onclick = closeModal;
    $('m-yes').onclick = () => {
      const active = i === save.slot;
      if (active) { save.run = null; save.tutStep = 0; save.tutDone = undefined; }
      save.slots[i] = null; persist();
      if (active) newStore();
      closeModal(); showSlots();
    };
  });
  $('s-back').onclick = () => closeSlots(true);
}
addEventListener('keydown', e => { if (e.key === 'Escape' && $('slotsPane') && !$('modal').classList.contains('on')) closeSlots(true); });
function playSlot(i) {
  closeModal(); closeSlots(false);
  const s = save.slots[i];
  if (s) { save.slot = i; save.run = s.run; save.tutDone = s.tutDone; save.tutStep = s.tutStep; persist(); newStore(); }
  else { save.slot = i; newStore(true); }   // an empty slot: a brand new store (and Sara's tutorial)
  startRun();
}
$('t-start').onclick = showSlots;
const tRestart = document.createElement('button'); tRestart.id = 't-restart'; tRestart.className = 'pxb red off'; tRestart.textContent = '↻ RESTART RUN';
$('t-start').after(tRestart);
tRestart.onclick = () => {
  openModal(`<h2>Restart run?</h2><p>Your current store (shelves, machines, cash and upgrades) will be deleted and you start a brand new store. Your paycheck bank stays.</p>
    <div class="row"><button class="pxb red" id="m-yes">Yes, restart</button><button class="pxb gold" id="m-no">Cancel</button></div>`);
  $('m-no').onclick = closeModal;
  $('m-yes').onclick = () => { closeModal(); newStore(true); };
};
newStore();
loader.setIcons(icons);   // the real shelf / machine icons are placed on the loading screen's floor
requestAnimationFrame(frame);
requestAnimationFrame(() => requestAnimationFrame(() => loader.ready()));   // first frame is drawn: the loading screen may fade out
window.__game = () => game;   // debugging helpers
window.__view = view;

// money is shown in pesos: swap any leftover static '$' sign in the page (HUD cash, restock button...) for the peso sign
(function fixCurrency() {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue.includes('$')) n.nodeValue = n.nodeValue.replace(/\$/g, '₱');
})();
