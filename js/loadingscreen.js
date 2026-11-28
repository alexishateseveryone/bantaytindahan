// Loading screen + install screen (PWA), drawn with the game's OWN 3D renderer and models (same toon look, pixel pass, camera angle, tiles).
//  - LOADING: black screen. Floor tiles pop in until the whole screen is covered, then the real sellable shelves and machines
//    are placed on it one after another (skill items are not used). When the game is ready a motor bandit rides in from the
//    left, never stops, wrecks everything in its lane and crashes. At the crash the title screen is shown UNDER the loading screen
//    (the loading screen turns see-through) while everything scales down with an ease, item by item and tile by tile.
//  - INSTALL: on a phone / tablet that has NOT installed the app yet, the same scene (dimmed) is an install screen
//    (Android: native install prompt, iOS: Add to Home Screen steps). Once installed (standalone) it becomes the loading screen.
import * as THREE from 'three';
import { View } from './view.js';
import { SELLABLES, ITEMS, MAX_STOCK } from './game.js';
import { makeItem, makeShelf, setShelfGoods, makeEnemy } from './model/index.js';

const MIN_SHOW = 5200;   // ms the loading screen stays at least, so the floor + placing animation can finish
const ELEV = 40 * Math.PI / 180, SIN = Math.sin(ELEV), C45 = Math.SQRT1_2;   // the game's isometric camera angle (45 deg around, 40 deg down)
const HINTS = ['Laying the floor...', 'Building the shelves...', 'Plugging in the machines...', 'Stocking up...', 'Opening soon!'];
const PRELOAD = ['assets/sara/talk.png', 'assets/sara/normal.png', 'assets/sara/shh.png'];
const POP = 0.45;        // seconds of one elastic pop (same as placing in the game)

// ---------- environment ----------
const ua = navigator.userAgent || '';
const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(ua);
const standalone = (window.matchMedia && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches)) || navigator.standalone === true;
const isPhone = isIOS || isAndroid || (window.matchMedia && matchMedia('(pointer:coarse)').matches && Math.min(screen.width, screen.height) < 820);
let skipInstall = false; try { skipInstall = sessionStorage.getItem('ls-skip-install') === '1'; } catch (e) { /* storage blocked */ }
let mode = isPhone && !standalone && !skipInstall ? 'install' : 'loading';
let deferred = window.__bip || null;   // Android "beforeinstallprompt" (captured early by index.html)
let installed = false;

// ---------- service worker (needed for installability + offline play) ----------
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => { /* ignore */ }));
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; if (mode === 'install') renderBody(); });
window.addEventListener('appinstalled', () => { installed = true; deferred = null; if (mode === 'install') renderBody(); });

// ---------- styles ----------
const css = document.createElement('style');
css.textContent = `
#ls{position:fixed;inset:0;z-index:200;background:#000;overflow:hidden;font-family:var(--cf,system-ui,sans-serif);color:#fff7e0;-webkit-user-select:none;user-select:none;touch-action:manipulation;transition:opacity .5s ease}
#ls.gone{opacity:0;pointer-events:none}
#ls.fast{transition:opacity .22s ease}
#ls.clear{background:transparent}
#ls .ls-3d{position:absolute;inset:0;transition:opacity .4s ease}
#ls .ls-3d canvas{display:block;image-rendering:pixelated;image-rendering:crisp-edges;image-rendering:pixelated}
#ls.install .ls-3d{opacity:.32}
#ls .ls-c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:12px;padding:max(14px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));text-align:center;overflow:auto;transition:transform .4s cubic-bezier(.45,0,.2,1),opacity .35s ease}
#ls.install .ls-c{justify-content:center;gap:clamp(10px,3vh,22px)}
#ls.out .ls-c{transform:scale(.9);opacity:0}
#ls .ls-logo{font:700 clamp(26px,7vh,56px)/1 var(--cf,system-ui,sans-serif);letter-spacing:2px;color:#ffd23f;text-shadow:0 4px 0 rgba(0,0,0,.8),0 0 22px rgba(0,0,0,.95);animation:lsLogo .7s cubic-bezier(.34,1.56,.64,1) .1s both}
#ls .ls-logo br{display:none}
#ls.install .ls-logo br{display:inline}
@keyframes lsLogo{from{transform:scale(.5);opacity:0}to{transform:scale(1);opacity:1}}
#ls .ls-body{display:flex;flex-direction:column;align-items:center;gap:10px;width:min(420px,88vw)}
#ls .ls-bar{width:100%;height:14px;border-radius:99px;background:rgba(0,0,0,.55);padding:3px;box-shadow:0 0 0 2px rgba(0,0,0,.8)}
#ls .ls-bar i{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(180deg,#ffe98a,#ffc233)}
#ls .ls-msg{font:600 clamp(13px,2.6vh,17px)/1.2 var(--cf,system-ui,sans-serif);color:#fff3dc;text-shadow:0 2px 0 #000,0 0 8px #000}
#ls .ls-tag{font:600 clamp(13px,2.8vh,18px)/1.35 var(--cf,system-ui,sans-serif);color:#fff3dc;text-shadow:0 2px 0 #000,0 0 10px #000}
#ls .ls-btn{width:100%;border:0;border-radius:99px;padding:15px 20px;font:700 18px/1 var(--cf,system-ui,sans-serif);cursor:pointer;color:#5a3a00;background:linear-gradient(180deg,#ffe98a,#ffc233);box-shadow:0 5px 0 #d9962a;touch-action:manipulation}
#ls .ls-btn:active{transform:translateY(3px);box-shadow:0 2px 0 #d9962a}
#ls .ls-link{background:none;border:0;color:#c9b8a6;font:600 14px/1 var(--cf,system-ui,sans-serif);text-decoration:underline;padding:8px;cursor:pointer}
#ls .ls-steps{width:100%;margin:0;padding:12px 14px;list-style:none;display:flex;flex-direction:column;gap:10px;text-align:left;background:rgba(34,24,18,.88);border:2px solid rgba(255,255,255,.14);border-radius:22px;font:500 clamp(13px,2.7vh,16px)/1.3 var(--cf,system-ui,sans-serif)}
#ls .ls-steps li{display:flex;align-items:center;gap:10px}
#ls .ls-steps b{flex:none;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#ffc233;color:#5a3a00;font:700 14px/1 var(--cf,system-ui,sans-serif)}
#ls .ls-steps svg{width:20px;height:20px;vertical-align:-4px;fill:none;stroke:#6fa8ff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
#ls .ls-ok{color:#5fe3a1;font:700 18px/1.3 var(--cf,system-ui,sans-serif)}
#ls .ls-feat{font:500 12px/1.3 var(--cf,system-ui,sans-serif);color:#a99a89}
@media (max-height:420px){#ls .ls-logo{font-size:24px}#ls .ls-body{gap:6px}#ls .ls-btn{padding:11px 16px;font-size:16px}#ls.install .ls-c{justify-content:flex-start}}
`;
document.head.appendChild(css);

// ---------- DOM ----------
const root = document.createElement('div'); root.id = 'ls'; root.className = mode;
root.innerHTML = '<div class="ls-3d"><canvas></canvas></div><div class="ls-c"><div class="ls-body"></div></div>';
document.body.appendChild(root);
const box = root.querySelector('.ls-3d'), body = root.querySelector('.ls-body');

// ---------- the game's own renderer, with the camera zoomed so the floor fills the screen ----------
let VIS = 12;   // how many cells are visible across the screen
class LoadView extends View {
  resize() {
    super.resize();   // pixel size, render target, pixel pass
    const w = this.w || 1, h = this.h || 1;
    VIS = Math.max(9, Math.min(14, w / 100));
    const hw = VIS / 2, hh = hw * h / w, c = this.camera;
    c.left = -hw; c.right = hw; c.top = hh; c.bottom = -hh; c.updateProjectionMatrix();
    const half = (hw + hh / SIN) * C45 + 6, sc = this.sun.shadow.camera;   // shadow box covers the whole visible floor
    sc.left = -half; sc.right = half; sc.top = half + 1; sc.bottom = -half - 1; sc.updateProjectionMatrix();
    this.dirty = true;
  }
}
let view = null, failed = false;
try { const cv = box.querySelector('canvas'); try { cv.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true }); } catch (e) { /* the view makes its own */ }   // alpha canvas: the title screen shows through once the loading screen turns see-through
  view = new LoadView(box, cv); view.game = null; } catch (e) { failed = true; box.remove(); }   // no WebGL: plain progress bar only

// ---------- seeded random, so a rebuild (resize) lays out the same store ----------
const rng = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---------- what gets built: only SELLABLES (shelves + machines), never skill items ----------
const MACHINES = SELLABLES.filter(id => ITEMS[id].kind === 'tower');
function layout(hx, hz) {
  const r = rng(20261126), occ = new Set(), out = [];
  const key = (x, z) => x + ',' + z, free = (x, z) => !occ.has(key(x, z));
  const inb = (x, z) => x >= -hx + 1 && x <= hx - 1 && z >= -hz + 1 && z <= hz - 1;
  const spot = (cellsOf, tries = 200, aisle = false) => {
    for (let i = 0; i < tries; i++) {
      const x = Math.round((r() * 2 - 1) * (hx - 1)), z = Math.round((r() * 2 - 1) * (hz - 1));
      if (aisle && ((x + hx) % 3 === 2)) continue;
      const cells = cellsOf(x, z);
      if (cells.every(([cx, cz]) => inb(cx, cz) && free(cx, cz))) return { x, z, cells };
    }
    return null;
  };
  const put = (type, s, big = 0) => { if (!s) return; out.push({ type, x: s.x, z: s.z, big }); for (const [cx, cz] of s.cells) occ.add(key(cx, cz)); };
  const one = (x, z) => [[x, z]];
  // big pieces first: the soda statue (3x3) and steel shelves (a row of 3)
  put('statue', spot((x, z) => { const c = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) c.push([x + a, z + b]); return c; }), 2);
  for (let i = 0; i < 2; i++) put('steel', spot((x, z) => [[x, z - 1], [x, z], [x, z + 1]]), 1);
  // shelf columns with aisles between them (two free columns after every shelf column)
  for (let gx = -hx + 2; gx <= hx - 1; gx += 3) for (let gz = -hz + 1; gz <= hz - 1; gz++) {
    if (!inb(gx, gz) || !free(gx, gz) || r() > 0.68) continue;
    put('shelf', { x: gx, z: gz, cells: one(gx, gz) });
  }
  // every machine, a few of each, in the aisles
  for (const id of MACHINES) for (let k = 0; k < (hx > 6 ? 2 : 1); k++) put(id, spot(one, 200, true));
  for (let k = 0; k < 2; k++) put('fruit', spot(one, 200, true));
  put('fence', spot((x, z) => [[x - 1, z], [x, z], [x + 1, z]], 200, true));
  const fence = out.find(o => o.type === 'fence');
  if (fence) { out.push({ type: 'fence', x: fence.x - 1, z: fence.z, big: 0 }); out.push({ type: 'fence', x: fence.x + 1, z: fence.z, big: 0 }); }
  out.sort((a, b) => a.z - b.z || a.x - b.x);   // placed row by row, back of the store first
  return out;
}

// ---------- scene content ----------
let content = null, nextId = 1, built = '', T0 = performance.now(), exitAt = 0;
const rings = [];
const floorMats = [];
function floorMat(odd) {   // the game's tile: two beige tones with a faint edge line, nearest filtering
  if (!floorMats[odd]) {
    const K = 16, cv = document.createElement('canvas'); cv.width = cv.height = K; const x = cv.getContext('2d');
    x.fillStyle = odd ? '#e7dfc6' : '#d3caaa'; x.fillRect(0, 0, K, K);
    x.fillStyle = 'rgba(0,0,0,0.07)'; x.fillRect(0, 0, K, 1); x.fillRect(0, 0, 1, K);
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    floorMats[odd] = new THREE.MeshToonMaterial({ map: tex, gradientMap: view.gradient });
  }
  return floorMats[odd];
}
function makeThing(type, v) {   // the same models and set-up as the game's build-menu icons
  const id = nextId++;
  if (type === 'shelf') { const o = makeShelf(view, { v }); setShelfGoods(view, o, MAX_STOCK); return o; }
  if (ITEMS[type].kind === 'shelf') {
    const o = makeItem(view, { type, id, dir: 'y', v });
    if (o.userData.setGoods) o.userData.setGoods(view, o, ITEMS[type].cap);
    return o;
  }
  return makeItem(view, { type, id, level: 1 });
}
function build() {
  if (!view) return;
  if (content) { view.scene.remove(content.group); }
  const reach = Math.ceil((VIS / 2 + (VIS / 2 * view.h / view.w) / SIN) * C45) + 3, hx = reach, hz = reach;   // the rotated screen needs a square floor
  const group = new THREE.Group(), floors = [], things = [];
  view.scene.add(group);
  // floor tiles: a ripple from the middle outwards until the whole screen is covered
  let floorEnd = 0;
  for (let gz = -hz; gz <= hz; gz++) for (let gx = -hx; gx <= hx; gx++) {
    const m = new THREE.Mesh(view.plane, floorMat((gx + gz) & 1 ? 1 : 0));
    m.rotation.x = -Math.PI / 2; m.position.set(gx, 0, gz); m.receiveShadow = true; m.visible = false; group.add(m);
    const dist = Math.hypot(gx, gz * 1.3), jit = (((gx * 73856093) ^ (gz * 19349663)) >>> 0) % 100 / 100 * 0.07;
    const d = 0.1 + dist * 0.095 + jit;
    floors.push({ m, d, od: 0.35 + (hx + hz - Math.abs(gx) - Math.abs(gz)) * 0.012 });
    floorEnd = Math.max(floorEnd, d + POP);
  }
  // items: placed one after another once the floor is done
  const list = layout(hx, hz), step = Math.min(0.085, 2.6 / Math.max(1, list.length)), r = rng(7);
  list.forEach((l, i) => {
    let o; try { o = makeThing(l.type, Math.floor(r() * 3)); } catch (e) { return; }   // a model that fails never blocks loading
    o.position.set(l.x, 0, l.z); o.scale.setScalar(0.001); o.visible = false; group.add(o);
    o.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    things.push({ o, x: l.x, z: l.z, big: l.big, d: floorEnd + 0.15 + i * step, od: 0.05 + (hz - l.z) * 0.02 + r() * 0.08, ringed: false });
  });
  content = { group, floors, things, moto: null, exitEnd: 0.5 };
  built = view.w + 'x' + view.h;
}
const pop = x => { if (x <= 0) return 0; if (x >= 1) return 1; const y = x - 1; return 1 + 2.70158 * y * y * y + 1.70158 * y * y; };   // elastic out, as in the game
const popOut = x => { if (x <= 0) return 1; if (x >= 1) return 0; return 1 - (2.70158 * x * x * x - 1.70158 * x * x); };   // swells a little, then pops away
let ringGeo = null;
function ring(x, z, rr, color = 0xffffff) {
  ringGeo ||= new THREE.RingGeometry(0.8, 1, 32);
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.1, z); view.scene.add(m); rings.push({ m, r: rr, t: 0 });
}

// ---------- the exit: a motor bandit rides in from the left without stopping, destroys everything in its lane and crashes ----------
const parts = []; let shake = 0;
function spawn(mat, sz, x, y, z, vx, vy, vz, life, g = 9, extra = {}) {
  const m = new THREE.Mesh(view.box, mat); m.castShadow = false; m.scale.setScalar(sz); m.position.set(x, y, z); view.scene.add(m);
  parts.push({ m, vx, vy, vz, life, t: 0, s: sz, g, ...extra });
}
const SMOKE = [0x2a2a33, 0x3a3a46, 0x55556a], FIRE = [0xffe27a, 0xff8a1a, 0xff5a14];
function boom(x, z, big = 0, lite = false) {   // the game's explosion: flash, rings, fireball, burning gobs, smoke cloud and flying chunks of the item
  const R = (lite ? 1.1 : 1.9) + big * 0.5, rnd = Math.random, n = lite ? 0.45 : 1;
  const fl = new THREE.Mesh(view.sph, view.basic(0xffd23f)); fl.position.set(x, 0.5, z); fl.scale.setScalar(0.01); view.scene.add(fl);
  parts.push({ m: fl, flash: true, r: R, life: 0.3, t: 0 });
  ring(x, z, R * 1.5, 0xff9a2a); if (!lite) { ring(x, z, R * 0.8, 0xffe27a); ring(x, z, R * 1.1, 0xffffff); }
  for (let i = 0; i < Math.ceil(24 * n); i++) { const a = rnd() * 6.283, sp = 0.8 + rnd() * 2.8; spawn(view.fireMat(FIRE[i % 3]), 0.12 + rnd() * 0.14, x + (rnd() - 0.5) * 0.2, 0.3, z + (rnd() - 0.5) * 0.2, Math.cos(a) * sp, 2 + rnd() * 3.2, Math.sin(a) * sp, 0.55 + rnd() * 0.45, 7); }
  for (let i = 0; i < Math.ceil(8 * n); i++) { const a = rnd() * 6.283, sp = 2 + rnd() * 2.4; spawn(view.fireMat(0xff6a00), 0.17 + rnd() * 0.1, x, 0.3, z, Math.cos(a) * sp, 2.4 + rnd() * 2.2, Math.sin(a) * sp, 0.8 + rnd() * 0.4, 8); }
  for (let i = 0; i < Math.ceil(10 * n); i++) { const a = rnd() * 6.283, d = rnd() * R * 0.5; spawn(view.basic(SMOKE[i % 3]), 0.45 + rnd() * 0.35, x, 0.3, z, Math.cos(a) * d * 0.6, 0.6 + rnd() * 0.9, Math.sin(a) * d * 0.6, 1.4 + rnd() * 0.9, -0.2, { grow: true }); }
  for (let i = 0; i < Math.ceil(12 * n); i++) { const a = rnd() * 6.283, sp = 1.5 + rnd() * 3; spawn(view.basic(i % 2 ? 0xa0703f : 0x6b4526), 1, x, 0.4 + rnd() * 0.5, z, Math.cos(a) * sp, 2 + rnd() * 3, Math.sin(a) * sp, 1 + rnd() * 0.5, 9, { sx: 0.1, sy: 0.07, sz: 0.3 + rnd() * 0.25, spin: [(rnd() - 0.5) * 14, (rnd() - 0.5) * 14, (rnd() - 0.5) * 14] }); }
  shake = Math.max(shake, lite ? 0.18 : 0.55);
}
const RIDE = 28;   // bike speed (cells / s): the whole screen is swept in well under a second
function planExit() {
  const c = content; if (!c) return 0;
  const hxOf = t => t.big === 2 ? 1.5 : 0.5, hzOf = t => t.big ? 1.5 : 0.5;
  const hwv = VIS / 2, hhv = hwv * view.h / view.w, halfW = (hwv + hhv / SIN) * C45, lim = Math.max(1, Math.floor(Math.min(hwv, hhv / SIN) * 0.7));
  // the lane (a row across the screen) with the most stuff in it
  let lane = 0, best = -1;
  for (let z = -lim; z <= lim; z++) {
    const n = c.things.filter(t => Math.abs(t.x) <= halfW && Math.abs(t.z - z) <= hzOf(t) + 0.3).length - Math.abs(z) * 0.05;
    if (n > best) { best = n; lane = z; }
  }
  // where that lane enters and leaves the (diagonal) screen
  const xmin = Math.max(lane - hwv / C45, -lane - hhv / (C45 * SIN)), xmax = Math.min(lane + hwv / C45, -lane + hhv / (C45 * SIN));
  const startX = xmin - 3, crashX = Math.max(xmin + 4, xmax - 1), tStart = 0.1, timeAt = x => tStart + (x - startX) / RIDE, tCrash = timeAt(crashX);
  let bike = null;
  try {
    bike = makeEnemy(view, { id: nextId++, type: 'moto', look: 4242, hp: 50, maxhp: 50, speed: 4, x: 0, y: 0, angle: Math.PI, soak: 0, burn: 0, slow: 0, stun: 0, flee: 0, wind: 0, moto: 'ride' });
    const u = bike.userData; if (u.bar) u.bar.visible = false; if (u.st) for (const k in u.st) u.st[k].visible = false;
    if (u.body) { u.body.rotation.order = 'YXZ'; u.body.rotation.y = Math.PI / 2; }   // heading right (+x), pitch stays local
    bike.position.set(startX, 0, lane); bike.traverse(o => { if (o.isMesh) o.castShadow = true; }); c.group.add(bike);
  } catch (e) { bike = null; }
  // the destruction sweeps from left to right with the bike: every item and floor tile scales away (ease pop) as the wave reaches its column
  const r = Math.random, LEN = 0.22, jit = () => r() * 0.05;
  let end = 0;
  for (const f of c.floors) { f.od = timeAt(f.m.position.x) + jit(); f.len = LEN; end = Math.max(end, f.od + LEN); }
  const hits = [];
  for (const t of c.things) {
    const inLane = Math.abs(t.z - lane) <= hzOf(t) + 0.3;
    t.od = timeAt(inLane ? t.x - hxOf(t) : t.x) + jit(); t.len = inLane ? 0.08 : LEN; end = Math.max(end, t.od + LEN);
    if (inLane && t.x <= crashX) hits.push({ t: t.od, th: t, done: false });   // what the bike runs over blows up
  }
  c.moto = { g: bike, lane, startX, tStart, tCrash, crashX, hits, crashed: false, puff: 0 };
  return c.exitEnd = Math.max(end, tCrash + 0.3);
}
function stepExit(X, dt) {
  const mo = content.moto; if (!mo) return;
  const b = mo.g, rnd = Math.random;
  if (X >= mo.tStart) reveal();   // the title screen is under us from the moment the bike appears
  if (mo.crashed) return;
  const x = Math.min(mo.crashX, mo.startX + Math.max(0, X - mo.tStart) * RIDE);
  if (b) {
    const u = b.userData;
    b.position.x = x; b.position.z = mo.lane;
    if (u.wheels) for (const w of u.wheels) w.rotation.x -= dt * 40;
    if (u.body) { u.body.position.y = Math.abs(Math.sin(X * 40)) * 0.015; u.body.rotation.x = -0.06; }
    mo.puff -= dt; if (mo.puff <= 0 && x > mo.startX + 0.5) { mo.puff = 0.03; spawn(view.basic(0xb9b3a4), 0.1 + rnd() * 0.08, x - 0.5, 0.22, mo.lane + (rnd() - 0.5) * 0.2, -0.5, 0.4, 0, 0.4, -0.6, { grow: true }); }
  }
  for (const h of mo.hits) if (!h.done && X >= h.t) { h.done = true; boom(h.th.x, h.th.z, h.th.big, true); }
  if (X >= mo.tCrash) {   // the bike never stops: it crashes at the far side of the screen with a big blast
    mo.crashed = true; if (b) b.visible = false;
    boom(mo.crashX, mo.lane, 1);
  }
}
function frame3d(now, dt) {
  if (!view) return;
  if (view.dirty && built !== view.w + 'x' + view.h) { view.dirty = false; build(); }
  if (!content) return;
  const T = (now - T0) / 1000, X = exitAt ? (now - exitAt) / 1000 : -1;
  const out = (d, len) => X < 0 ? 1 : popOut((X - d) / len);
  if (X >= 0) stepExit(X, dt);
  for (const f of content.floors) {
    const s = pop((T - f.d) / POP) * out(f.od || 0, f.len || 0.3);
    f.m.visible = s > 0.002; f.m.scale.set(Math.max(0.001, s), Math.max(0.001, s), 1);
  }
  for (const t of content.things) {
    if (!t.ringed && T >= t.d) { t.ringed = true; ring(t.x, t.z, t.big === 2 ? 2.4 : t.big ? 1.6 : 1.1); }
    const s = pop((T - t.d) / POP) * out(t.od || 0, t.len || 0.3);
    t.o.visible = s > 0.002; t.o.scale.setScalar(Math.max(0.001, s));
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const g = rings[i]; g.t += dt; const k = g.t / 0.35;
    g.m.scale.setScalar(g.r * (0.3 + k * 0.7)); g.m.material.opacity = 0.8 * (1 - k);
    if (k >= 1) { view.scene.remove(g.m); g.m.material.dispose(); rings.splice(i, 1); }
  }
  for (let i = parts.length - 1; i >= 0; i--) {   // explosion particles
    const p = parts[i]; p.t += dt;
    if (p.flash) p.m.scale.setScalar(Math.max(0.01, p.r * Math.sin(Math.min(1, p.t / p.life) * Math.PI)));
    else {
      p.vy -= p.g * dt; p.m.position.x += p.vx * dt; p.m.position.y = Math.max(0.05, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
      const k = Math.min(1, p.t / p.life);
      if (p.spin) { if (p.m.position.y > 0.051) { p.m.rotation.x += p.spin[0] * dt; p.m.rotation.y += p.spin[1] * dt; p.m.rotation.z += p.spin[2] * dt; } const sk = Math.min(1, (p.life - p.t) / 0.35); p.m.scale.set(p.sx * sk, p.sy * sk, p.sz * sk); }
      else if (p.grow) p.m.scale.setScalar(Math.max(0.01, p.s * (0.5 + 1.4 * k) * (1 - k * k)));
      else p.m.scale.setScalar(Math.max(0.01, p.s * (1 - k)));
    }
    if (p.t >= p.life) { view.scene.remove(p.m); parts.splice(i, 1); }
  }
  shake = Math.max(0, shake - dt); const sh = shake * shake * 0.9, cb = view.camBase;   // camera shake, as in the game
  view.camera.position.set(cb.x + (Math.random() - 0.5) * sh, cb.y + (Math.random() - 0.5) * sh, cb.z); view.camera.lookAt(0, 0.2, 0);
  view.renderer.setRenderTarget(view.rt);   // low-res target, then the nearest-neighbour upscale: the game's pixel look
  view.renderer.render(view.scene, view.camera);
  view.renderer.setRenderTarget(null);
  view.renderer.render(view.quadScene, view.quadCam);
}

// ---------- body: install UI or progress bar ----------
const SHARE = '<svg viewBox="0 0 24 24"><path d="M12 15V3M8 7l4-4 4 4M5 11v9h14v-9"/></svg>';
let bar = null, msg = null;
function renderBody() {
  bar = msg = null; root.classList.toggle('install', mode === 'install');
  if (mode === 'loading') { body.innerHTML = ''; return; }   // loading: nothing but the floor and the items
  let h = '';
  if (installed) {
    h = '<div class="ls-ok">✔ Installed!</div><div class="ls-tag">Open <b>Tindang Sara</b> from your home screen to play fullscreen.</div>';
  } else if (isIOS) {
    h = '<div class="ls-tag">Install Tindang Sara for fullscreen play</div>'
      + '<ol class="ls-steps"><li><b>1</b><span>Tap the Share button ' + SHARE + ' in Safari</span></li>'
      + '<li><b>2</b><span>Choose <u>Add to Home Screen</u></span></li>'
      + '<li><b>3</b><span>Tap <u>Add</u>, then open the game from your home screen</span></li></ol>';
  } else if (deferred) {
    h = '<div class="ls-tag">Install Tindang Sara for fullscreen play</div><button class="ls-btn" id="ls-install">⬇ INSTALL APP</button>';
  } else {
    h = '<div class="ls-tag">Install Tindang Sara for fullscreen play</div>'
      + '<ol class="ls-steps"><li><b>1</b><span>Open the browser menu <u>⋮</u></span></li>'
      + '<li><b>2</b><span>Tap <u>Install app</u> (or <u>Add to Home screen</u>)</span></li></ol>';
  }
  h += '<div class="ls-feat">Fullscreen · Plays offline · Saves on your phone</div><button class="ls-link" id="ls-skip">Play in browser instead</button>';
  body.innerHTML = h;
  const ib = body.querySelector('#ls-install');
  if (ib) ib.onclick = async () => {
    try { deferred.prompt(); const r = await deferred.userChoice; deferred = null; if (r && r.outcome === 'accepted') installed = true; } catch (e) { deferred = null; }
    renderBody();
  };
  body.querySelector('#ls-skip').onclick = proceed;
}
// leave the install screen: it becomes the loading screen and the build animation plays from the start
function proceed() {
  try { sessionStorage.setItem('ls-skip-install', '1'); } catch (e) { /* ignore */ }
  mode = 'loading'; renderBody(); t0 = T0 = performance.now();
  if (content) for (const t of content.things) t.ringed = false;
}

// ---------- progress ----------
const st = { fonts: false, assets: false, game: false };
let shown = 0, t0 = performance.now(), exiting = false, raf = 0, last = performance.now();
const wait = ms => new Promise(r => setTimeout(r, ms));
Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), wait(4000)]).then(() => { st.fonts = true; });
Promise.race([Promise.all(PRELOAD.map(u => new Promise(r => { const im = new Image(); im.onload = im.onerror = r; im.src = u; }))), wait(6000)]).then(() => { st.assets = true; });
setTimeout(() => { st.fonts = st.assets = st.game = true; }, 25000);   // failsafe: never get stuck on the loading screen

function tick(now) {
  raf = requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  frame3d(now, dt);
  if (exiting) return;
  const real = (st.fonts ? 0.25 : 0) + (st.assets ? 0.3 : 0) + (st.game ? 0.45 : 0);
  const target = Math.min(real, 0.15 + (now - t0) / MIN_SHOW * 0.85);   // the bar also follows the animation so it never jumps ahead of it
  shown += (target - shown) * 0.1; if (Math.abs(target - shown) < 0.002) shown = target;
  if (bar) { bar.style.width = (shown * 100).toFixed(1) + '%'; msg.textContent = HINTS[Math.min(HINTS.length - 1, Math.floor(shown * HINTS.length))]; }
  if (mode === 'loading' && real >= 0.999 && now - t0 >= MIN_SHOW) exit();
}

// the bike rides in from the left, wrecks its lane and crashes (see planExit / stepExit); the crash calls reveal(),
// then the rest scales away and finish() removes the loading screen
function exit() {
  if (exiting) return;
  exiting = true; exitAt = performance.now();
  const len = content ? planExit() : 0;
  if (!content || !content.moto) reveal();
  setTimeout(finish, (len + 0.2) * 1000);
}
let revealed = false, finished = false;
// loading isn't "done" or not: at the crash the title screen is shown anyway, under the loading screen, so the hand-over is seamless
function reveal() {
  if (revealed) return; revealed = true;
  root.classList.add('clear');
  if (view) { try {
    view.scene.background = null; view.renderer.setClearColor(0x000000, 0);
    // view.js's pixel pass writes alpha 1.0: make it pass the target's alpha through (premultiplied) so empty space is see-through
    const qm = view.quadMat, fs = qm.fragmentShader;
    qm.fragmentShader = fs.replace('vec3 c = texture2D(tex, vUv * uvScale).rgb * tint;', 'vec4 s = texture2D(tex, vUv * uvScale); vec3 c = s.rgb * tint;')
      .replace('gl_FragColor = vec4(c * mix(0.78, 1.0, v), 1.0);', 'gl_FragColor = vec4(c * mix(0.78, 1.0, v) * s.a, s.a);');
    qm.needsUpdate = true;
  } catch (e) { /* ignore */ } }
  window.dispatchEvent(new Event('loadingdone'));
}
function finish() {
  if (finished) return; finished = true; reveal();
  root.classList.add('gone');
  setTimeout(() => {
    cancelAnimationFrame(raf); root.remove(); css.remove();
    if (view) { try { view.renderer.dispose(); view.renderer.forceContextLoss(); } catch (e) { /* ignore */ } }
    if (standalone && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => { /* not allowed here */ });
  }, 600);
}

if (view) { view.resize(); build(); }
renderBody();
raf = requestAnimationFrame(tick);

export const loader = {
  get mode() { return mode; },
  setIcons() { /* the loading screen renders the real 3D models itself; kept so older callers don't break */ },
  ready() { st.game = true; },
};
window.__loader = loader;
