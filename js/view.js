// Three.js view: flat toon materials + low-res render target upscaled with nearest filtering (pixel look)
import * as THREE from 'three';
import { COLS, ROWS, ITEMS, MAX_STOCK, BOMB_RADIUS, GUM_COLORS } from './game.js';   // COLS/ROWS are live bindings: the room size changes per game
const COLA_PAL = [0x3b1f14, 0x6b3a22, 0xffffff, 0xc98a5a, 0xffffff, 0x8a4b2a];
const FRUIT_COL = [0xe0463e, 0xff9f1c, 0x8bd450, 0xffd23f, 0x7b3fa0];
import { makeItem, makeShelf, setShelfGoods, makeCan, makeEnemy, makeCustomer, makeProjectile, makeFruit,
  makeGroundBomb, animGroundBomb, makeFire, animFire } from './model/index.js';

import { makeShakenCola, animShakenCola } from './model/colaShake.js';
import { makeCigPack, animCigPack, makeLitCig } from './model/cigs.js';

// Keep raw hex colors, no sRGB conversion: flat, predictable retro palette
THREE.ColorManagement.enabled = false;

// the store grows with the Room Expansion upgrade, so the origin is recomputed for every new game
let OX = (COLS - 1) / 2, OZ = (ROWS - 1) / 2;
const wx = x => x - OX, wz = y => y - OZ;
const ELEV = 58 * Math.PI / 180;

export class View {
  constructor(container, canvas) {
    this.container = container; this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;     // hard pixel shadows
    this.renderer.setClearColor(0x000000);
    this.pixel = 3; this.sx = 1; this.sy = 1;

    // 3-step flat gradient map (matte cel shading, no specular)
    const g = new Uint8Array([105, 175, 255]);
    this.gradient = new THREE.DataTexture(g, 3, 1, THREE.RedFormat);
    this.gradient.minFilter = this.gradient.magFilter = THREE.NearestFilter;
    this.gradient.generateMipmaps = false; this.gradient.needsUpdate = true;
    this.mats = new Map(); this.basics = new Map();

    this.scene = new THREE.Scene();
    this.amb = new THREE.AmbientLight(0xffffff, 0.75); this.scene.add(this.amb);
    const sun = this.sun = new THREE.DirectionalLight(0xfff2dd, 1.4);
    this.tod = 0;   // 0 = bright morning, 1 = night
    this.sky = new THREE.Color();
    sun.position.set(-6, 14, 5); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 10; sc.bottom = -10; sc.near = 1; sc.far = 40;
    sun.shadow.bias = -0.002;
    this.scene.add(sun);

    this.camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    this.camera.position.set(0, Math.sin(ELEV) * 30, Math.cos(ELEV) * 30);
    this.camera.lookAt(0, 0.2, 0);
    this.camBase = this.camera.position.clone();

    this.box = new THREE.BoxGeometry(1, 1, 1);
    this.cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
    this.sph = new THREE.SphereGeometry(1, 8, 6);
    this.cone = new THREE.ConeGeometry(1, 1, 8);
    this.plane = new THREE.PlaneGeometry(1, 1);

    // fullscreen pixel pass
    this.rt = new THREE.WebGLRenderTarget(64, 64, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.quadMat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: this.rt.texture }, uvScale: { value: new THREE.Vector2(1, 1) }, res: { value: new THREE.Vector2(64, 64) }, tint: { value: new THREE.Vector3(1, 1, 1) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `precision mediump float; uniform sampler2D tex; uniform vec2 uvScale; uniform vec3 tint; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tex, vUv * uvScale).rgb * tint;   // day/night colour grade
          c = floor(c * 31.0 + 0.5) / 31.0;                    // 5-bit palette crunch
          float v = smoothstep(1.15, 0.35, distance(vUv, vec2(0.5)));
          gl_FragColor = vec4(c * mix(0.78, 1.0, v), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quadScene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.quadMat);
    this.quad.frustumCulled = false; this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.ray = new THREE.Raycaster(); this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.dyn = new THREE.Group(); this.scene.add(this.dyn);
    this.meshes = new Map();   // entity id -> {group,...}
    this.fx = []; this.shake = 0;
    this.pops = new Map();            // entity id -> pop-in animation time
    this.wind = []; this.windAcc = 0; // daytime wind streaks
    this.hoverId = null; this.outline = [];
    this.olMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide });
    this.ext = { left: 0.5, right: 0.5, top: 1.7, bottom: 0.5 };   // how far each side sticks out (counter on top, sidewalk on the door side): frame + aim the camera at the whole shop

    // cursor + range ring + path dots
    this.cursor = new THREE.Mesh(this.box, new THREE.MeshBasicMaterial({ color: 0x5fe3a1, transparent: true, opacity: 0.55 }));
    this.cursor.scale.set(0.96, 0.05, 0.96); this.cursor.visible = false; this.scene.add(this.cursor);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.955, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.06; this.ring.visible = false; this.scene.add(this.ring);

    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
  }

  toon(color) {
    let m = this.mats.get(color);
    if (!m) { m = new THREE.MeshToonMaterial({ color, gradientMap: this.gradient }); this.mats.set(color, m); }
    return m;
  }
  basic(color) {
    let m = this.basics.get(color);
    if (!m) { m = new THREE.MeshBasicMaterial({ color }); this.basics.set(color, m); }
    return m;
  }
  // helper: add a shaded part to a group
  part(parent, geo, color, sx, sy, sz, x = 0, y = 0, z = 0, shadow = true) {
    const m = new THREE.Mesh(geo, this.toon(color));
    m.scale.set(sx, sy, sz); m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
  }

  resize() {
    const w = Math.max(50, this.container.clientWidth), h = Math.max(50, this.container.clientHeight);
    this.w = w; this.h = h;
    this.pixel = Math.max(2, Math.round(h / 240));
    const P = this.pixel, tw = Math.ceil(w / P), th = Math.ceil(h / P);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.rt.setSize(tw, th);
    this.sx = w / (tw * P); this.sy = h / (th * P);
    this.quadMat.uniforms.uvScale.value.set(this.sx, this.sy);
    // frame the store (wide room + side wall + register)
    const aspect = tw / th;
    const ex = this.ext; let halfH = ((ROWS + 1.6 + (ex.top - 0.5) + (ex.bottom - 0.5)) * Math.sin(ELEV) + 2.2) / 2, halfW = (COLS + ex.left + ex.right + 1.2) / 2;
    if (halfW / aspect > halfH) halfH = halfW / aspect; else halfW = halfH * aspect;
    // the build receipt covers the right side: frame the WHOLE store inside the free part of the screen (left of the receipt)
    const res = Math.min(w * 0.6, Math.max(0, this.reserveRight || 0));
    let shift = 0;
    if (res > 0) {
      const free = (w - res) / w;                         // share of the screen the store may use
      halfW /= free; halfH = halfW / aspect;              // widen the frustum so the store fits that share
      shift = halfW * (1 - free);                         // ...and slide it so the store is centred in the free part
    } else { shift = halfW * 0.0; }
    const c = this.camera; c.left = -halfW + shift; c.right = halfW + shift; c.top = halfH; c.bottom = -halfH;
    c.updateProjectionMatrix();
  }

  // px of the screen (from the right edge) that the build receipt covers; the camera re-frames the store around it
  setReserve(px) { px = Math.round(px || 0); if (Math.abs(px - (this.reserveRight || 0)) < 2) return; this.reserveRight = px; this.resize(); }

  // ---------- store set dressing (rebuilt per game; the shapes live in js/model/) ----------
  setGame(game) {
    this.game = game;
    OX = (COLS - 1) / 2; OZ = (ROWS - 1) / 2;
    const e = side => game.counterSide === side ? 1.7 : game.doorSide === side ? 3.2 : 0.5;   // how far each side sticks out of the floor: counter strip, sidewalk on the door side
    this.ext = { left: e('left'), right: e('right'), top: e('top'), bottom: e('bottom') };
    this.bounds = { L: wx(-0.5), R: wx(COLS - 0.5), T: wz(-0.5), B: wz(ROWS - 0.5) };
    this.fitRoom();
    for (const m of this.meshes.values()) {
      this.dyn.remove(m.group);
      if (m.mark) { this.scene.remove(m.mark); m.mark.material.dispose(); }
      if (m.warn) this.scene.remove(m.warn);          // warning signs live in the scene, not in the group: don't leave them behind
    }
    this.meshes.clear();
    if (this.stat) { this.scene.remove(this.stat); this.stat.traverse(o => { if (o.userData.own) { o.material.map.dispose(); o.material.dispose(); } }); }
    for (const w of this.wind) { for (const m of w.cubes) this.scene.remove(m); w.mat.dispose(); } this.wind = [];
    this.pops.clear(); this.hoverId = null; this.outline = [];
    const { group, clerk } = this.buildShell(game);
    this.stat = group; this.clerk = clerk; this.scene.add(group);
    this.blackenEdges(group);
    this.pathVersion = -1;
  }
  // the store shell (walls, frame, ledges) was dark blue / purple: recolor every dark blue-ish lit material in it to black
  blackenEdges(group) {
    const c = new THREE.Color();
    group.traverse(o => {
      if (!o.isMesh || !o.material || !o.material.isMeshToonMaterial) return;
      const { r, g, b } = o.material.color, mx = Math.max(r, g, b);
      if (b >= r && b >= g && b - g > 0.03 && mx < 0.5) {   // dark, bluish / purplish
        const k = Math.max(0.03, Math.min(0.16, mx * 0.3));
        c.setRGB(k, k, k * 1.05); o.material = this.toon(c.getHex());
      }
    });
  }
  // ---------- store shell: floor, walls, doors, counter. Rebuilt from COLS/ROWS, so renovating grows the walls too ----------
  buildShell(game) {
    const S = new THREE.Group(), part = (...a) => this.part(S, ...a);
    const cs = game.counterSide, ds = game.doorSide;
    const L = wx(-0.5), R = wx(COLS - 0.5), Tt = wz(-0.5), B = wz(ROWS - 0.5);   // floor edges (from the live COLS/ROWS, so renovating regrows everything)

    // ----- floor: ONE canvas texture (your original checker + lane tints + hazard stripes) on ONE plane -----
    const K = 16, cv = document.createElement('canvas'); cv.width = COLS * K; cv.height = ROWS * K; const cx = cv.getContext('2d');
    const lane = (x, y) => (cs === 'right' && x === COLS - 1) || (cs === 'left' && x === 0) || (cs === 'top' && y === 0) ? 'counter'
      : (ds === 'left' && x === 0) || (ds === 'right' && x === COLS - 1) || (ds === 'bottom' && y === ROWS - 1) ? 'door' : '';
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const l = lane(x, y), odd = (x + y) % 2;
      cx.fillStyle = l === 'counter' ? (odd ? '#c9bf9d' : '#bfb48f') : l === 'door' ? (odd ? '#b8c4cc' : '#a9b6c0') : (odd ? '#e7dfc6' : '#d3caaa');
      cx.fillRect(x * K, y * K, K, K);
      cx.fillStyle = 'rgba(0,0,0,0.07)'; cx.fillRect(x * K, y * K, K, 1); cx.fillRect(x * K, y * K, 1, K);
    }
    for (let i = 0; i < (cs === 'top' ? COLS : ROWS) * K; i += 8) {   // hazard stripes along the inside edge of the counter lane
      cx.fillStyle = (i / 8) % 2 ? '#f2c94c' : '#33302e';
      if (cs === 'right') cx.fillRect((COLS - 1) * K, i, 3, 8); else if (cs === 'left') cx.fillRect(K - 3, i, 3, 8); else cx.fillRect(i, K - 3, 8, 3);
    }
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    const floor = new THREE.Mesh(this.plane, new THREE.MeshToonMaterial({ map: tex, gradientMap: this.gradient }));
    floor.rotation.x = -Math.PI / 2; floor.scale.set(COLS, ROWS, 1); floor.receiveShadow = true; floor.userData.own = true; S.add(floor);
    const slab = new THREE.Mesh(this.box, this.basic(0x000000));   // pure black outside the store (unlit, so it can never look grey)
    slab.scale.set(COLS + 12, 0.2, ROWS + 10); slab.position.set(0, -0.12, 0); S.add(slab);

    // ----- walls: purple, door walls low, counter wall lower and set back behind the desk, back wall with posters. No wall shadows. -----
    const off = side => side === cs ? 1.45 : 0.25, H = side => side === 'top' ? 1.6 : side === cs ? 0.7 : side === 'bottom' ? 0.55 : 1.1;
    const xL = L - off('left'), xR = R + off('right'), zT = Tt - off('top');
    const wall = (sx, sz, x, z, h) => part(this.box, 0x4b3f8f, sx, h, sz, x, h / 2, z, false);
    const zBt = B + 0.25, zA = zT + 0.25, zB = B + 0.5;                                          // side walls run from the back wall's inner face to just past the floor
    wall(0.5, zB - zA, xL, (zA + zB) / 2, H('left')); wall(0.5, zB - zA, xR, (zA + zB) / 2, H('right'));
    wall(xR - xL + 0.5, 0.5, (xL + xR) / 2, zT, H('top'));
    if (ds === 'bottom') wall(xR - xL + 0.5, 0.5, (xL + xR) / 2, zBt, H('bottom'));   // low front wall on the door side
    const PC = [0xff5a5f, 0xffcf4a, 0x5fe3a1, 0x6fa8ff, 0xff9f1c];
    for (let x = xL + 1.5, i = 0; x < xR - 1; x += 3.5, i++) part(this.box, PC[i % 5], 1.0, 0.6, 0.05, x, 1.0, zT + 0.28, false);   // posters

    // ----- doors: mat on the floor + glass door set into the wall -----
    for (const sp of game.spawns) {
      part(this.box, 0x6e5f4a, 0.9, 0.03, 0.9, wx(sp.x), 0.02, wz(sp.y), false);
      const orange = sp.from > 1;
      if (ds === 'bottom') {
        const dx = wx(sp.x);
        part(this.box, 0x9ad7ff, 1.3, 0.9, 0.55, dx, 0.45, zBt, false); part(this.box, 0x6fb7e8, 0.9, 0.7, 0.58, dx, 0.42, zBt, false);
        if (orange) part(this.box, 0xff9f1c, 0.35, 0.18, 0.35, dx, 1.05, zBt, false);
      } else {
        const dx = ds === 'left' ? xL : xR, dz = wz(sp.y);
        part(this.box, 0x9ad7ff, 0.55, 1.3, 1.3, dx, 0.65, dz, false); part(this.box, 0x6fb7e8, 0.58, 1.0, 0.9, dx, 0.6, dz, false);
        if (orange) part(this.box, 0xff9f1c, 0.35, 0.18, 0.35, dx, 1.45, dz, false);
      }
    }

    // ----- sidewalk outside the doors (the other sides stay black) -----
    {
      const D = 2.6, xl = L - off('left'), xr = R + off('right');
      let x0, x1, z0, z1;
      if (ds === 'left') { x1 = xl - 0.25; x0 = x1 - D; z0 = zT - 0.25; z1 = B + 0.9; }
      else if (ds === 'right') { x0 = xr + 0.25; x1 = x0 + D; z0 = zT - 0.25; z1 = B + 0.9; }
      else { x0 = xl - 0.25; x1 = xr + 0.25; z0 = zBt + 0.25; z1 = z0 + D; }
      const K2 = 16, w = x1 - x0, d = z1 - z0, sc = document.createElement('canvas'); sc.width = Math.round(w * K2); sc.height = Math.round(d * K2);
      const c2 = sc.getContext('2d');
      for (let y = 0; y < sc.height; y += K2) for (let x = 0; x < sc.width; x += K2) {
        c2.fillStyle = ((x + y) / K2) % 2 ? '#c9c5ba' : '#bdb9ad'; c2.fillRect(x, y, K2, K2);
        c2.fillStyle = 'rgba(0,0,0,0.12)'; c2.fillRect(x, y, K2, 1); c2.fillRect(x, y, 1, K2);
      }
      c2.fillStyle = '#6f6c66';   // curb along the street edge
      if (ds === 'left') c2.fillRect(0, 0, 4, sc.height); else if (ds === 'right') c2.fillRect(sc.width - 4, 0, 4, sc.height); else c2.fillRect(0, sc.height - 4, sc.width, 4);
      const st = new THREE.CanvasTexture(sc); st.magFilter = st.minFilter = THREE.NearestFilter; st.generateMipmaps = false;
      const sw = new THREE.Mesh(this.plane, new THREE.MeshToonMaterial({ map: st, gradientMap: this.gradient }));
      sw.rotation.x = -Math.PI / 2; sw.scale.set(w, d, 1); sw.position.set((x0 + x1) / 2, 0.004, (z0 + z1) / 2); sw.receiveShadow = true; sw.userData.own = true; S.add(sw);
      // two street lamps (the glow stays bright at night)
      const lamp = (lx, lz) => { part(this.box, 0x2b2b33, 0.1, 1.9, 0.1, lx, 0.95, lz, false); this.glow(S, 0xffe9a6, 0.3, 0.14, 0.3, lx, 1.95, lz); };
      if (ds === 'bottom') { const lz = z1 - 0.35; lamp(x0 + 0.8, lz); lamp(x1 - 0.8, lz); }
      else { const lx = ds === 'left' ? x0 + 0.35 : x1 - 0.35; lamp(lx, z0 + 0.8); lamp(lx, z1 - 0.9); }
    }

    // ----- checkout counter + register + clerk, built once facing +x and turned onto its wall -----
    const len = cs === 'top' ? COLS : ROWS, cg = new THREE.Group(); S.add(cg);
    cg.position.set(cs === 'right' ? R : cs === 'left' ? L : 0, 0, cs === 'top' ? Tt : 0);
    cg.rotation.y = cs === 'left' ? Math.PI : cs === 'top' ? Math.PI / 2 : 0;
    const cp = (...a) => this.part(cg, ...a), ox = 0.45;
    const az = (game.counterPos - (len - 1) / 2) * (cs === 'left' ? -1 : 1);       // where the till cells sit along the wall
    cp(this.box, 0x7a4b2b, 0.9, 0.9, len, ox, 0.45, 0, false);
    cp(this.box, 0xe9d8a6, 0.95, 0.08, len, ox, 0.92, 0, false);
    cp(this.box, 0xdedede, 0.6, 0.35, 0.9, ox, 1.12, az, false);
    cp(this.box, 0x2d2d3a, 0.08, 0.28, 0.8, ox - 0.1, 1.45, az, false).rotation.z = 0.4;
    cp(this.box, 0x3ddc84, 0.05, 0.1, 0.5, ox - 0.15, 1.46, az, false).rotation.z = 0.4;
    for (let i = 0; i < 4; i++) cp(this.box, [0xff5a5f, 0xffcf4a, 0x5fe3a1, 0x6fa8ff][i], 0.22, 0.14, 0.28, ox, 1.06, az - 1.8 + i * 0.4, false);
    const clerk = new THREE.Group(); clerk.position.set(ox + 0.05, 0.9, az + 1.6); clerk.rotation.y = -Math.PI / 2; cg.add(clerk);
    this.part(clerk, this.box, 0x3a7bd5, 0.34, 0.4, 0.22, 0, 0.35, 0, false);
    this.part(clerk, this.box, 0xf1c9a0, 0.24, 0.22, 0.22, 0, 0.68, 0, false);
    this.part(clerk, this.box, 0xd9534f, 0.28, 0.07, 0.26, 0, 0.82, 0.01, false);
    // ----- money stack: bricks of cash piled on the counter next to the register, growing with the player's cash -----
    this.money = new THREE.Group(); cg.add(this.money); this.moneyN = -1; this.moneyPop = 0; this.moneyOx = ox;
    this.moneySlots = [az + 0.72, az + 1.05, az - 2.25, az - 2.62, az + 2.15].filter(z => Math.abs(z) < len / 2 - 0.25);
    return { group: S, clerk };
  }

  // cash on the counter: one brick per ~4x$ (square-root growth so it keeps filling up), ten bricks high per pile
  syncMoney(g, dt) {
    const cap = this.moneySlots.length * 10;
    const n = Math.min(cap, Math.max(0, Math.floor(Math.sqrt(Math.max(0, g.cash) / 4))));
    if (n !== this.moneyN) {
      if (this.moneyN >= 0 && n > this.moneyN) this.moneyPop = 1;
      this.moneyN = n;
      while (this.money.children.length) this.money.remove(this.money.children[0]);
      for (let i = 0; i < n; i++) {
        const z = this.moneySlots[Math.floor(i / 10)], h = i % 10;
        const r1 = ((i * 9301 + 49297) % 233280) / 233280, r2 = ((i * 4271 + 1237) % 9973) / 9973;
        const rot = (r1 - 0.5) * 0.3, y = 0.96 + 0.0375 + h * 0.075, x = this.moneyOx + (r2 - 0.5) * 0.03;
        this.part(this.money, this.box, i % 2 ? 0x3fae5a : 0x35a04e, 0.34, 0.07, 0.2, x, y, z + (r1 - 0.5) * 0.03, true).rotation.y = rot;
        this.part(this.money, this.box, 0xe9ddc0, 0.09, 0.076, 0.21, x, y, z + (r1 - 0.5) * 0.03, false).rotation.y = rot;
      }
    }
    if (this.moneyPop > 0) this.moneyPop = Math.max(0, this.moneyPop - dt * 5);
    const sy = 1 + 0.18 * Math.sin(this.moneyPop * Math.PI);
    this.money.scale.y = sy; this.money.position.y = 0.96 * (1 - sy);
  }

  // ---------- hover outline: a white pixel outline around the building under the mouse ----------
  setHover(ent) {
    const id = ent ? ent.id : null;
    if (id === this.hoverId) return;
    for (const o of this.outline) o.parent && o.parent.remove(o);
    this.outline = []; this.hoverId = id;
    const m = id && this.meshes.get(id); if (!m) return;
    const list = []; m.group.traverse(o => { if (o.isMesh && !o.userData.ol && o.material !== this.olMat) list.push(o); });
    for (const o of list) {
      const geo = o.geometry; if (!geo.boundingBox) geo.computeBoundingBox();
      const bb = geo.boundingBox, sz = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
      const ol = new THREE.Mesh(geo, this.olMat); ol.userData.ol = true;
      ol.position.copy(o.position); ol.quaternion.copy(o.quaternion);
      const k = (a, i) => { const w = Math.abs(a) * sz[i]; return w < 1e-4 ? a : a * (w + 0.13) / w; };   // grow ~0.065 each side
      ol.scale.set(k(o.scale.x, 0), k(o.scale.y, 1), k(o.scale.z, 2));
      o.parent.add(ol); this.outline.push(ol);
    }
  }

  // ---------- dark blue pixel outline around burglars and customers: an inverted hull behind every solid body part. The scene is drawn on the
  // low-res pixel grid, so a hull ~1 pixel thick shows up as a crisp, chunky pixel outline. It follows every animation (it is a child of the part). ----------
  outlineBody(grp) {
    const T = 0.055;   // outline thickness in world units (about one render pixel)
    const mat = this.olBlue || (this.olBlue = new THREE.MeshBasicMaterial({ color: 0x101c5a, side: THREE.BackSide }));
    const u = grp.userData, skip = new Set();
    for (const r of [u.bar, ...(u.st ? Object.values(u.st) : [])]) if (r) r.traverse(x => skip.add(x));   // health bar + status icons stay un-outlined
    grp.updateMatrixWorld(true);
    const list = []; grp.traverse(o => { if (o.isMesh && !o.userData.ol && !skip.has(o) && !o.isInstancedMesh && !o.isSkinnedMesh && o.geometry) list.push(o); });
    const ws = new THREE.Vector3(), c = new THREE.Vector3(), sz = new THREE.Vector3();
    for (const o of list) {
      const mt = o.material; if (!mt || Array.isArray(mt) || mt.transparent || mt.depthWrite === false) continue;
      const geo = o.geometry; if (!geo.boundingBox) geo.computeBoundingBox();
      geo.boundingBox.getCenter(c); geo.boundingBox.getSize(sz); o.getWorldScale(ws);
      const w = [Math.abs(sz.x * ws.x), Math.abs(sz.y * ws.y), Math.abs(sz.z * ws.z)];
      if (Math.min(...w) < 0.03 || Math.max(...w) < 0.1) continue;   // flat blobs (shadows, bars) and tiny bits (eyes) get no outline
      const f = [1 + 2 * T / w[0], 1 + 2 * T / w[1], 1 + 2 * T / w[2]];
      const ol = new THREE.Mesh(geo, mat); ol.userData.ol = true; ol.castShadow = false; ol.receiveShadow = false;
      ol.scale.set(f[0], f[1], f[2]); ol.position.set(c.x * (1 - f[0]), c.y * (1 - f[1]), c.z * (1 - f[2]));   // grow around the part's own centre
      o.add(ol);
    }
    return grp;
  }

  // daytime wind: a few blocky pixel swirls that curl their way across the store
  windTick(dt, time) {
    const b = this.bounds; if (!b) return;
    const day = Math.max(0, 1 - this.tod * 1.8), SNAP = 0.07, N = 10;
    this.windAcc += dt * day * 0.45;                       // about one swirl every 2 seconds in full daylight
    if (this.windAcc >= 1 && this.wind.length < 5) {
      this.windAcc = 0;
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }), cubes = [];
      for (let i = 0; i < N; i++) { const m = new THREE.Mesh(this.box, mat); m.scale.setScalar(SNAP * (1.35 - i * 0.07)); this.scene.add(m); cubes.push(m); }
      const spd = 2.6 + Math.random() * 1.6, x0 = b.L - 2.5;
      this.wind.push({ cubes, mat, x0, y: 0.5 + Math.random() * 1.6, z: b.T + Math.random() * (b.B - b.T), spd, r: 0.28 + Math.random() * 0.3, w: (5 + Math.random() * 3) * (Math.random() < 0.5 ? -1 : 1), ph: Math.random() * 6.28, t: 0, life: (b.R - x0 + 4) / spd });
    }
    for (let i = this.wind.length - 1; i >= 0; i--) {
      const w = this.wind[i]; w.t += dt;
      const k = w.t / w.life;
      w.cubes.forEach((m, j) => {
        const tt = Math.max(0, w.t - j * 0.045), a = w.w * tt + w.ph, fade = 1 - tt / w.life * 0.0;
        // blocky helix around a drifting axis: the camera sees it as a curl; every position snaps to the pixel grid
        m.position.set(Math.round((w.x0 + w.spd * tt) / SNAP) * SNAP, Math.round((w.y + Math.sin(a) * w.r) / SNAP) * SNAP, Math.round((w.z + Math.cos(a) * w.r * 1.2) / SNAP) * SNAP);
        m.visible = w.t - j * 0.045 > 0;
      });
      w.mat.opacity = Math.sin(Math.min(1, k) * Math.PI) * 0.7 * Math.max(day, 0.15);
      if (k >= 1) { for (const m of w.cubes) this.scene.remove(m); w.mat.dispose(); this.wind.splice(i, 1); }
    }
  }

  // re-frame the camera and the shadow box for the current room size
  fitRoom() {
    const half = Math.max(COLS, ROWS) / 2 + 2, sun = this.sun, sc = sun.shadow.camera;
    if (sc.right !== half) {
      sc.left = -half; sc.right = half; sc.top = half + 1; sc.bottom = -half - 1; sc.updateProjectionMatrix();
      const size = half > 9 ? 2048 : 1024;
      if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    }
    this.resize();
  }
  at(grp, o) { grp.position.set(wx(o.x), 0, wz(o.y)); return grp; }

  // unlit mesh (signs, screens, glass): stays bright at night
  glow(parent, color, sx, sy, sz, x, y, z) {
    const m = new THREE.Mesh(this.box, this.basic(color));
    m.scale.set(sx, sy, sz); m.position.set(x, y, z); parent.add(m); return m;
  }

  // ---------- pixel icons: the real 3D asset rendered tiny with nearest filtering ----------
  makeIcon(type, S = 32) {
    const rt = new THREE.WebGLRenderTarget(S, S, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const l = new THREE.DirectionalLight(0xfff2dd, 1.3); l.position.set(-2, 4, 3); scene.add(l);
    let obj;
    if (type === 'shelf') {
      obj = makeShelf(this, { v: 0 }); setShelfGoods(this, obj, MAX_STOCK); obj.rotation.y = Math.PI / 2;
    } else if (type === 'shakecola') obj = makeShakenCola(this, 1, 0);
    else if (type === 'cigs') obj = makeCigPack(this, 1);
    else if (ITEMS[type] && ITEMS[type].kind === 'shelf') {   // steel shelf, fruit shelf, soda statue, fence
      obj = makeItem(this, { type, id: 1, dir: 'y', v: 0 });
      if (obj.userData.setGoods) obj.userData.setGoods(this, obj, ITEMS[type].cap);
      if (type === 'fruit') obj.rotation.y = Math.PI / 2;
    } else obj = makeItem(this, { type, id: 1, level: 1 });
    if (type === 'fridge') obj.scale.setScalar(0.78);
    else if (type === 'water' || type === 'cereal') obj.scale.setScalar(0.62);
    else if (type === 'tissue') obj.scale.setScalar(0.78);
    else if (type === 'steel') obj.scale.setScalar(0.5);
    else if (type === 'statue') obj.scale.setScalar(0.42);
    obj.position.set(0, 0, 0); scene.add(obj);
    const cam = new THREE.OrthographicCamera(-0.98, 0.98, 0.98, -0.98, 0.1, 20);
    cam.position.set(2.4, 2.5, 3.0); cam.lookAt(0, type === 'mop' ? 0.35 : type === 'shakecola' || type === 'cigs' ? 0.36 : type === 'cans' || type === 'gum' || type === 'atm' ? 0.65 : 0.5, 0);
    const prevClear = new THREE.Color(); this.renderer.getClearColor(prevClear); const prevA = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setRenderTarget(rt); this.renderer.clear(); this.renderer.render(scene, cam); this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(prevClear, prevA);
    const buf = new Uint8Array(S * S * 4); this.renderer.readRenderTargetPixels(rt, 0, 0, S, S, buf); rt.dispose();
    // flip, then add a 1px dark outline so it reads like a sprite
    const px = new Uint8ClampedArray(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const a = ((S - 1 - y) * S + x) * 4, b = (y * S + x) * 4;
      const al = buf[a + 3] > 128;
      px[b] = buf[a]; px[b + 1] = buf[a + 1]; px[b + 2] = buf[a + 2]; px[b + 3] = al ? 255 : 0;
    }
    const out = new Uint8ClampedArray(px);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const b = (y * S + x) * 4; if (px[b + 3]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
        if (px[(ny * S + nx) * 4 + 3]) { out[b] = 13; out[b + 1] = 11; out[b + 2] = 29; out[b + 3] = 255; break; }
      }
    }
    const c = document.createElement('canvas'); c.width = c.height = S;
    c.getContext('2d').putImageData(new ImageData(out, S, S), 0, 0);
    return c.toDataURL();
  }

  // ---------- projectile models that live in the view (hot dog + bag of ice cubes) ----------
  makeHotdogProj() {
    const g = new THREE.Group();
    this.part(g, this.box, 0xe8b77a, 0.4, 0.09, 0.14, 0, -0.02, 0, false);   // bun
    this.part(g, this.box, 0xc0392b, 0.46, 0.08, 0.08, 0, 0.03, 0, false);   // sausage
    this.part(g, this.box, 0xffd23f, 0.34, 0.025, 0.03, 0, 0.075, 0, false); // mustard
    return g;
  }
  makeMoloProj() {   // molotov: green bottle with a rag
    const g = new THREE.Group();
    this.part(g, this.box, 0x3fae5b, 0.14, 0.22, 0.14, 0, 0, 0, false);
    this.part(g, this.box, 0x3fae5b, 0.06, 0.1, 0.06, 0, 0.15, 0, false);
    this.part(g, this.box, 0xffd23f, 0.05, 0.08, 0.05, 0, 0.24, 0, false);
    return g;
  }
  makeIceProj() {
    const g = new THREE.Group();
    const cubes = [[0, 0, 0, 0.2], [0.13, 0.05, 0.04, 0.13], [-0.1, -0.04, 0.08, 0.12], [0.02, 0.09, -0.1, 0.11]];
    for (const [x, y, z, s] of cubes) this.part(g, this.box, 0xbfeaff, s, s, s, x, y, z, false);
    return g;
  }

  // ---------- picking ----------
  pick(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const u = (clientX - r.left) / r.width * this.sx, v = (1 - (clientY - r.top) / r.height) * this.sy;
    this.ray.setFromCamera(new THREE.Vector2(u * 2 - 1, v * 2 - 1), this.camera);
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.groundPlane, p)) return null;
    const cx = Math.round(p.x + OX), cy = Math.round(p.z + OZ);
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return null;
    return { x: cx, y: cy };
  }

  project(cellX, cellY, h = 1) {
    const v = new THREE.Vector3(wx(cellX), h, wz(cellY)).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2 / this.sx) * r.width, y: r.top + ((1 - v.y) / 2 / this.sy) * r.height };
  }

  setCursor(c, valid, fp = 1) {   // fp = footprint in tiles (3 for the soda statue)
    if (!c) { this.cursor.visible = false; return; }
    this.cursor.visible = true; this.cursor.position.set(wx(c.x), 0.04, wz(c.y)); this.cursor.scale.set(0.96 * fp, 0.05, 0.96 * fp);
    this.cursor.material.color.set(valid ? 0x5fe3a1 : 0xff5a5f);
  }
  setRange(c, r) {
    if (!c || !r) { this.ring.visible = false; return; }
    this.ring.visible = true; this.ring.position.set(wx(c.x), 0.06, wz(c.y)); this.ring.scale.set(r, r, 1);
  }

  // ---------- one-shot effects ----------
  burst(x, y, h, color, n = 6, spd = 2, size = 1) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.box, this.basic(color)); const sz = (0.07 + Math.random() * 0.06) * size; m.scale.setScalar(sz);
      m.position.set(wx(x), h, wz(y)); this.scene.add(m);
      this.fx.push({ m, vx: (Math.random() - 0.5) * spd, vy: 1.2 + Math.random() * spd, vz: (Math.random() - 0.5) * spd, life: 0.5 + Math.random() * 0.3, t: 0, s: sz });
    }
  }
  // ---------- 3D fire (molotov): glowing, per tile, no shared look with the hot sauce ----------
  fireMat(color, op = 0.9) {
    this.fireMats ||= new Map();
    const k = color + ':' + op; let m = this.fireMats.get(k);
    if (!m) { m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }); this.fireMats.set(k, m); }
    return m;
  }
  glowMat() {
    if (!this._glowMat) {
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,230,150,1)'); gr.addColorStop(0.3, 'rgba(255,140,40,.6)'); gr.addColorStop(0.7, 'rgba(255,70,10,.18)'); gr.addColorStop(1, 'rgba(255,50,0,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      this._glowMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    }
    return this._glowMat;
  }
  // one burning patch = one little fire per tile: scorched floor, glow, and a column of voxel flames
  makeFoeFire(f) {
    const g = new THREE.Group(), n = f.size, tiles = [];
    this.scorchMat ||= new THREE.MeshBasicMaterial({ color: 0x120d0a, transparent: true, opacity: 0.6, depthWrite: false });
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const t = new THREE.Group(); t.position.set(i - (n - 1) / 2, 0, j - (n - 1) / 2); g.add(t);
      const sc = new THREE.Mesh(this.plane, this.scorchMat); sc.rotation.x = -Math.PI / 2; sc.position.y = 0.035; sc.scale.set(0.94, 0.94, 1); sc.castShadow = false; t.add(sc);
      const gf = new THREE.Mesh(this.plane, this.fireMat(0xff6a00, 0.5)); gf.rotation.x = -Math.PI / 2; gf.position.y = 0.05; gf.castShadow = false; t.add(gf);
      const sp = new THREE.Sprite(this.glowMat()); sp.position.y = 0.45; t.add(sp);
      const flames = [];
      for (let k = 0; k < 8; k++) { const m = new THREE.Mesh(this.box, this.fireMat(0xff8a1a)); m.castShadow = false; t.add(m); flames.push({ m, ph: Math.random(), ox: (Math.random() - 0.5) * 0.76, oz: (Math.random() - 0.5) * 0.76 }); }
      tiles.push({ t, gf, sp, flames, tx: t.position.x, tz: t.position.z, seed: Math.random() * 6 });
    }
    g.userData.tiles = tiles;
    return g;
  }
  animFoeFire(grp, f, time, dt) {
    const tiles = grp.userData.tiles, age = f.max - f.t, k = Math.min(1, age / 0.3) * Math.min(1, f.t / 0.6), big = f.fueled ? 1.3 : 1;
    const hot = [this.fireMat(0xffe27a), this.fireMat(0xff8a1a), this.fireMat(0xd2340f, 0.8)];
    for (const T of tiles) {
      const fl = 1 + 0.1 * Math.sin(time * 11 + T.seed) + 0.06 * Math.sin(time * 23 + T.seed * 2);
      T.gf.scale.set(1.35 * k * fl, 1.35 * k * fl, 1);
      T.sp.scale.set(2.0 * k * fl * big, 2.0 * k * fl * big, 1);
      for (const F of T.flames) {
        const p = (time * 1.4 + F.ph) % 1, sc = (0.28 * Math.pow(1 - p, 0.8) + 0.04) * k * big;
        F.m.position.set(F.ox + Math.sin(time * 6 + F.ph * 9) * 0.06 * p, 0.03 + p * 0.95 * big, F.oz + Math.cos(time * 5 + F.ph * 7) * 0.06 * p);
        F.m.scale.set(sc, sc * 1.6, sc); F.m.rotation.y = time * 3 + F.ph * 6; F.m.material = p < 0.25 ? hot[0] : p < 0.6 ? hot[1] : hot[2]; F.m.visible = k > 0.02;
      }
      if (k > 0.3 && Math.random() < dt * 3) this.fireBit(f.x + T.tx + (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.4, f.y + T.tz + (Math.random() - 0.5) * 0.6, 0.6, 0.9);   // flying embers
      if (k > 0.3 && Math.random() < dt * 1.1) this.puff(f.x + T.tx, f.y + T.tz, 0.9, 0x3a3a46, 1.2, 0.9, 1.2);                                                                      // smoke
    }
  }
  // a single glowing voxel of fire that rises and shrinks
  fireBit(gx, h, gy, size = 1, life = 0.55) {
    const m = new THREE.Mesh(this.box, this.fireMat([0xffe27a, 0xff8a1a, 0xff5a14][Math.floor(Math.random() * 3)])), sz = (0.08 + Math.random() * 0.1) * size;
    m.castShadow = false; m.scale.setScalar(sz); m.position.set(wx(gx), h, wz(gy)); this.scene.add(m);
    this.fx.push({ m, vx: (Math.random() - 0.5) * 0.4, vy: 1 + Math.random() * 1.2, vz: (Math.random() - 0.5) * 0.4, life: life * (0.7 + Math.random() * 0.6), t: 0, s: sz, g: -0.4 });
  }
  trailBit(pos, kind) {
    const smoke = kind === 'smoke', m = new THREE.Mesh(this.box, smoke ? this.basic([0x2a2a33, 0x3a3a46, 0x55556a][Math.floor(Math.random() * 3)]) : this.fireMat([0xffe27a, 0xff8a1a, 0xff5a14][Math.floor(Math.random() * 3)]));
    const sz = smoke ? 0.12 + Math.random() * 0.1 : 0.06 + Math.random() * 0.06;
    m.castShadow = false; m.scale.setScalar(sz); m.position.copy(pos); this.scene.add(m);
    this.fx.push(smoke ? { m, vx: (Math.random() - 0.5) * 0.3, vy: 0.4 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.3, life: 0.7 + Math.random() * 0.4, t: 0, s: sz, g: -0.2, grow: true }
                       : { m, vx: (Math.random() - 0.5) * 0.3, vy: 0.2 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 0.3, life: 0.28 + Math.random() * 0.2, t: 0, s: sz, g: -0.3 });
  }
  // explosion made of real 3D particles: fireball voxels with flame trails, fiery gobs with smoke trails, glass, a rolling smoke cloud and a scorch mark
  blast3d(x, y, r, power = 1, glass = false) {
    this.flashFx(x, y, r * 1.5, 0.5); this.ringFx(x, y, r * 1.4, 0xff9a2a); this.ringFx(x, y, r * 0.8, 0xffe27a);
    const add = (mat, sz, vx, vy, vz, life, g, extra = {}) => {
      const m = new THREE.Mesh(this.box, mat); m.castShadow = false; m.scale.setScalar(sz); m.position.set(wx(x) + (Math.random() - 0.5) * 0.2, 0.3, wz(y) + (Math.random() - 0.5) * 0.2); this.scene.add(m);
      this.fx.push({ m, vx, vy, vz, life, t: 0, s: sz, g, ...extra });
    };
    const cols = [0xffe27a, 0xff8a1a, 0xff5a14];
    for (let i = 0; i < Math.round(16 * power); i++) {            // fireball
      const a = Math.random() * Math.PI * 2, sp = (0.8 + Math.random() * 2.6) * power;
      add(this.fireMat(cols[i % 3]), 0.12 + Math.random() * 0.14, Math.cos(a) * sp, 2 + Math.random() * 3.2, Math.sin(a) * sp, 0.55 + Math.random() * 0.45, 7, { trail: 'fire' });
    }
    for (let i = 0; i < 6; i++) {                                 // heavy burning gobs thrown further, smoky trail
      const a = Math.random() * Math.PI * 2, sp = (2 + Math.random() * 2.2) * power;
      add(this.fireMat(0xff6a00), 0.17 + Math.random() * 0.1, Math.cos(a) * sp, 2.4 + Math.random() * 2.2, Math.sin(a) * sp, 0.8 + Math.random() * 0.4, 8, { trail: 'smoke' });
    }
    for (let i = 0; i < 8; i++) {                                 // smoke cloud
      const a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.5;
      add(this.basic([0x2a2a33, 0x3a3a46, 0x55556a][i % 3]), 0.45 + Math.random() * 0.35, Math.cos(a) * d * 0.6, 0.6 + Math.random() * 0.9, Math.sin(a) * d * 0.6, 1.4 + Math.random() * 0.9, -0.2, { grow: true });
    }
    if (glass) for (let i = 0; i < 7; i++) {                      // bottle shards
      const sx = 0.07, sy = 0.05, sz = 0.14 + Math.random() * 0.1, a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 2.5;
      add(this.basic(i % 2 ? 0x3fae5b : 0x8be0a0), 1, Math.cos(a) * sp, 2 + Math.random() * 2, Math.sin(a) * sp, 1.0 + Math.random() * 0.5, 9, { sx, sy, sz, spin: [(Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16], lateShrink: true });
    }
    this.splat(x, y, r, 0x120d0a); this.splat(x, y, r * 0.8, 0xff4a00);
    this.shake = Math.max(this.shake, 0.12 * power + 0.08);
  }
  // splintering shelf: planks tumble, goods scatter, dust ring
  debris(sh) {
    const t = sh.type, metal = t === 'steel' || t === 'fence', big = t === 'steel' || t === 'statue';
    const wood = metal ? 0xc9d0db : t === 'cerealbox' ? 0xe0a458 : t === 'statue' ? 0xd6262b : t === 'fruit' ? 0xb8793a : [0xa0703f, 0x8f6a4a, 0xb07d4a][sh.v], pc = t === 'fruit' || t === 'cerealbox' ? FRUIT_COL : [0xff5a5f, 0xffcf4a, 0x5fe3a1, 0x6fa8ff, 0xffffff];
    const piece = (color, sx, sy, sz, spd, life) => {
      const m = new THREE.Mesh(this.box, this.basic(color)); m.scale.set(sx, sy, sz);
      m.position.set(wx(sh.x) + (Math.random() - 0.5) * 0.5, 0.3 + Math.random() * 0.7, wz(sh.y) + (Math.random() - 0.5) * 0.7); this.scene.add(m);
      this.fx.push({ m, vx: (Math.random() - 0.5) * spd, vy: 2 + Math.random() * spd, vz: (Math.random() - 0.5) * spd, life, t: 0, s: 1, sx, sy, sz, spin: [(Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14], lateShrink: true });
    };
    for (let i = 0; i < (big ? 16 : 9); i++) piece(i % 2 ? wood : (metal ? 0x59616f : 0x6b4526), 0.1, 0.07, 0.34 + Math.random() * 0.3, 4.5, 1.1 + Math.random() * 0.5);
    for (let i = 0; i < Math.min(16, 4 + sh.units * 2); i++) piece(pc[(i + sh.v) % 5], 0.13, 0.15, 0.13, 5, 1.0 + Math.random() * 0.5);
    this.burst(sh.x, sh.y, 0.5, metal ? 0xd9dee8 : 0xe9ddc0, 14, 3, 1.6);
    this.ringFx(sh.x, sh.y, big ? 2.4 : 1.4, metal ? 0xd9dee8 : 0xe9ddc0);
    this.shake = Math.max(this.shake, big ? 0.45 : 0.3);
  }
  ringFx(x, y, r, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(wx(x), 0.1, wz(y)); this.scene.add(m);
    this.fx.push({ ring: true, m, r, life: 0.35, t: 0 });
  }
  // a can (or several) bouncing off an enemy and scattering over the floor
  scatterCans(x, y, dx, dy, color) {
    const px = wx(x), pz = wz(y);
    for (let i = 0; i < 3; i++) {
      const main = i === 0, s = main ? 1 : 0.72, spd = 1.6 + Math.random() * 2.2;
      const c = makeCan(this, main ? color : [0xe0463e, 0x3a86ff, 0x2fb67a, 0xffb703, 0xb26bd6, 0xff7aa2][Math.floor(Math.random() * 6)], s);
      c.root.position.set(px, 0.5, pz); this.scene.add(c.root);
      const back = main ? 0.9 : 0.35;
      this.fx.push({ can: true, c, m: c.root, r: c.r, rest: false, lying: false,
        vx: -dx * spd * back + (Math.random() - 0.5) * spd * 1.5, vy: 2.2 + Math.random() * 2.2, vz: -dy * spd * back + (Math.random() - 0.5) * spd * 1.5,
        sx: (Math.random() - 0.5) * 16, sz: (Math.random() - 0.5) * 16, life: 4.5 + Math.random() * 1.5, t: 0 });
    }
    // keep the floor from filling up forever: the oldest cans fade out early
    const cans = this.fx.filter(f => f.can);
    for (let i = 0; i < cans.length - 60; i++) cans[i].t = Math.max(cans[i].t, cans[i].life - 0.4);
  }
  // gumballs bouncing off an enemy and rolling around the floor
  scatterGum(x, y, dx, dy, color) {
    const px = wx(x), pz = wz(y);
    for (let i = 0; i < 3; i++) {
      const main = i === 0, spd = 1.4 + Math.random() * 2, r = main ? 0.1 : 0.075;
      const m = new THREE.Mesh(this.sph, this.toon(main ? color : GUM_COLORS[Math.floor(Math.random() * GUM_COLORS.length)]));
      m.scale.setScalar(r); m.position.set(px, 0.5, pz); this.scene.add(m);
      const back = main ? 0.9 : 0.35;
      this.fx.push({ ball: true, m, r, rest: false, vx: -dx * spd * back + (Math.random() - 0.5) * spd * 1.5, vy: 2 + Math.random() * 2, vz: -dy * spd * back + (Math.random() - 0.5) * spd * 1.5, life: 4.5 + Math.random() * 1.5, t: 0 });
    }
    const balls = this.fx.filter(f => f.ball);   // keep the floor from filling up forever
    for (let i = 0; i < balls.length - 70; i++) balls[i].t = Math.max(balls[i].t, balls[i].life - 0.4);
  }
  // a tissue roll reached the end of its lane / the room: a ribbon of paper stays on the floor, scraps fly and a small roll rolls off
  scatterTissue(d) {
    const len = Math.hypot(d.x - d.sx, d.y - d.sy), n = Math.max(2, Math.ceil(len / 0.4)), seg = len / n, yaw = Math.atan2(d.dx, d.dy);
    for (let i = 0; i < n; i++) {   // the trail: wavy flat strips lying along the lane
      const t = (i + 0.5) / n, w = Math.sin(i * 1.7) * 0.07;
      const m = new THREE.Mesh(this.box, this.toon(0xf4f6fb)); m.receiveShadow = true;
      m.scale.set(0.2, 0.012, seg * 1.1); m.rotation.y = yaw + Math.sin(i * 2.3) * 0.22;
      m.position.set(wx(d.sx + (d.x - d.sx) * t) - d.dy * w, 0.06 + i * 0.0006, wz(d.sy + (d.y - d.sy) * t) + d.dx * w); this.scene.add(m);
      this.fx.push({ decal: true, m, sx: 0.2, sz: seg * 1.1, life: 4.2 + Math.random() * 0.8, t: 0 });
    }
    for (let i = 0; i < 14; i++) {   // scraps of paper
      const m = new THREE.Mesh(this.box, this.toon(i % 3 ? 0xffffff : 0xe3e8f2)), sx = 0.12 + Math.random() * 0.1, sz = 0.1 + Math.random() * 0.12, sp = 1.5 + Math.random() * 3;
      m.castShadow = true; m.receiveShadow = true; m.scale.set(sx, 0.015, sz); m.position.set(wx(d.x), 0.35 + Math.random() * 0.3, wz(d.y)); this.scene.add(m);
      this.fx.push({ m, vx: d.dx * sp + (Math.random() - 0.5) * 2.4, vy: 1.6 + Math.random() * 2.2, vz: d.dy * sp + (Math.random() - 0.5) * 2.4, life: 2.6 + Math.random() * 1.2, t: 0, s: 1, sx, sy: 0.015, sz, g: 6,
        spin: [(Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10] });
    }
    this.puff(d.x, d.y, 0.4, 0xf4f6fb, 1.1, 0.5, 0.6);
    const R = 0.15, wrap = new THREE.Group(), model = makeProjectile(this, { kind: 'tissue' });   // a roll that bounces on and rolls to a stop (like the cans)
    model.userData.rib.visible = false; model.rotation.y = yaw; model.scale.setScalar(1 / R); wrap.add(model);
    wrap.position.set(wx(d.x), 0.5, wz(d.y)); this.scene.add(wrap);
    this.fx.push({ ball: true, roll: true, m: wrap, r: R, rest: false, vx: d.dx * 2.2, vy: 1.6, vz: d.dy * 2.2, life: 4.5, t: 0 });
  }
  // receipt whirlwind: paper strips spiral around the centre while the swirl lasts
  makeSwirlModel() {
    const g = new THREE.Group(); g.userData.strips = [];
    for (let i = 0; i < 12; i++) {
      const w = new THREE.Group(); this.part(w, this.box, i % 3 ? 0xffffff : 0xe8e8f0, 0.12, 0.012, 0.3, 0, 0, 0, false);
      this.part(w, this.box, 0x8b92a3, 0.08, 0.014, 0.015, 0, 0, 0.05, false);
      g.add(w); g.userData.strips.push(w);
    }
    return g;
  }
  animSwirl(g, s, time) {
    const sc = Math.max(0.01, Math.min(1, (s.max - s.t) / 0.25, s.t / 0.4));
    g.userData.strips.forEach((w, i) => {
      const a = time * (4.5 + (i % 3) * 1.1) + i * 0.52, rr = s.r * (0.3 + 0.7 * ((i * 0.37) % 1)) * 0.9;
      w.position.set(Math.cos(a) * rr, 0.12 + ((time * 0.7 + i * 0.17) % 1) * 0.95, Math.sin(a) * rr);
      w.rotation.set(time * 3 + i, -a, time * 2 + i * 0.5); w.scale.setScalar(sc);
    });
  }
  // one droplet of soda spray that hangs in the air and shrinks away: many of them make the trail
  trailDrop(x, y, z, pal = [0x7df0d8, 0xffffff, 0xb8fff2, 0x2fb6a6], g = 1.2, size = 1) {
    const col = pal[Math.floor(Math.random() * pal.length)], sz = (0.06 + Math.random() * 0.08) * size;
    const m = new THREE.Mesh(this.sph, this.basic(col)); m.scale.setScalar(sz);
    m.position.set(x + (Math.random() - 0.5) * 0.16, y + (Math.random() - 0.5) * 0.12, z + (Math.random() - 0.5) * 0.16); this.scene.add(m);
    this.fx.push({ m, vx: (Math.random() - 0.5) * 0.5, vy: Math.random() * 0.5 - 0.15, vz: (Math.random() - 0.5) * 0.5, life: 0.4 + Math.random() * 0.3, t: 0, s: sz, g });
  }
  // rising puff of smoke / flame (negative gravity)
  puff(x, y, h, color = 0x55556a, size = 1, rise = 0.7, life = 0.8) {
    const sz = (0.1 + Math.random() * 0.08) * size, m = new THREE.Mesh(this.box, this.basic(color)); m.scale.setScalar(sz);
    m.position.set(wx(x) + (Math.random() - 0.5) * 0.2, h, wz(y) + (Math.random() - 0.5) * 0.2); this.scene.add(m);
    this.fx.push({ m, vx: (Math.random() - 0.5) * 0.3, vy: rise, vz: (Math.random() - 0.5) * 0.3, life: life * (0.7 + Math.random() * 0.5), t: 0, s: sz, g: -0.6 });
  }
  flame(x, y, h) { this.puff(x, y, h, [0xff8c1a, 0xffd23f, 0xe0391a][Math.floor(Math.random() * 3)], 0.7, 1.3, 0.35); }
  // splatters of sauce stuck to the floor that slowly shrink away
  splat(x, y, r, color) {
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r * 0.9, s = (0.08 + Math.random() * 0.2) * (1 - d / (r * 1.3));
      const m = new THREE.Mesh(this.cyl, this.basic(i % 3 ? color : 0xff5a1f)); m.scale.set(s, 0.01, s);
      m.position.set(wx(x) + Math.cos(a) * d, 0.055 + i * 0.002, wz(y) + Math.sin(a) * d); this.scene.add(m);
      this.fx.push({ decal: true, m, sx: s, sz: s, life: 2.2 + Math.random() * 0.8, t: 0 });
    }
  }
  // ice cubes from the fridge: drop onto the floor, stay while the freeze patch is active, then melt away
  iceCubes(d) {
    this.ringFx(d.x, d.y, d.r, 0x8fd3f4); this.burst(d.x, d.y, 0.5, 0xbfeaff, 10, 2.4, 1.1); this.burst(d.x, d.y, 0.5, 0xffffff, 5, 1.8, 0.8);
    for (const c of d.cubes) {
      const m = new THREE.Mesh(this.box, this.basic(0xbfeaff)); m.scale.setScalar(0.16);   // one ice cube
      m.position.set(wx(c.x), 0.9, wz(c.y)); m.rotation.set(0, c.rot, 0); this.scene.add(m);
      this.fx.push({ iceCube: true, m, life: d.patch.max, t: 0, s: 0.16, spin: (Math.random() - 0.5) * 8 });
    }
    // keep the floor from filling up forever
    const cubes = this.fx.filter(f => f.iceCube);
    for (let i = 0; i < cubes.length - 60; i++) cubes[i].t = Math.max(cubes[i].t, cubes[i].life - 0.3);
  }
  flashFx(x, y, r, h = 0.5) {
    const m = new THREE.Mesh(this.sph, this.basic(0xffd23f)); m.position.set(wx(x), h, wz(y)); m.scale.setScalar(0.01); this.scene.add(m);
    this.fx.push({ flash: true, m, r, life: 0.3, t: 0 });
  }
  onEvent(type, d) {
    if (type === 'shoot') { const o = this.meshes.get(d.tower.id); if (o) o.kick = 0.18; if (d.tower.type === 'soda') this.burst(d.tower.x, d.tower.y, 0.8, 0x7df0d8, 5, 1.4, 0.8); if (d.tower.type === 'sauce') { this.burst(d.tower.x, d.tower.y, 1.1, 0xff5a1f, 6, 1.8, 0.9); this.burst(d.tower.x, d.tower.y, 1.1, 0xffd23f, 3, 1.4, 0.7); } }
    else if (type === 'gumHit') { this.scatterGum(d.x, d.y, d.dx, d.dy, d.color); this.burst(d.x, d.y, 0.5, d.color, 4, 1.8, 0.8); }
    else if (type === 'colaSplash') {
      this.ringFx(d.x, d.y, d.r * 1.4, 0xc98a5a);
      for (const c of [0x3b1f14, 0x6b3a22, 0xffffff]) this.burst(d.x, d.y, 0.5, c, 5, 2.2, 0.9);
    }
    else if (type === 'swirl') { this.ringFx(d.swirl.x, d.swirl.y, d.swirl.r, 0xffffff); this.burst(d.swirl.x, d.swirl.y, 0.5, 0xffffff, 8, 2.2, 1); }
    else if (type === 'canHit') { this.scatterCans(d.x, d.y, d.dx, d.dy, d.color); this.burst(d.x, d.y, 0.5, 0xffffff, 4, 1.8); }
    else if (type === 'skillPlace') { const k = d.skill; this.ringFx(k.x, k.y, 1.2, 0xffffff); this.burst(k.x, k.y, 0.3, 0xffffff, 8, 2, 1); }
    else if (type === 'colaBlast') {                                                      // the shaken bottle erupts: big brown + white fizz burst
      this.ringFx(d.x, d.y, d.r, 0xc98a5a); this.ringFx(d.x, d.y, d.r * 0.6, 0xffffff);
      this.burst(d.x, d.y, 0.5, 0x6b3a22, 26, 4.2, 1.7); this.burst(d.x, d.y, 0.6, 0xffffff, 18, 3.4, 1.4); this.burst(d.x, d.y, 1.1, 0x3b1f14, 10, 2.6, 1.2);
      for (let i = 0; i < 8; i++) this.puff(d.x + (Math.random() - 0.5) * 1.2, d.y + (Math.random() - 0.5) * 1.2, 0.4, 0xffffff, 1.6, 0.9, 0.7);
      this.shake = Math.max(this.shake || 0, 0.3);
    }
    else if (type === 'cigBoom') {                                                        // small pop where a cigarette lands
      this.ringFx(d.x, d.y, d.r, 0xffb347); this.burst(d.x, d.y, 0.25, 0xffd23f, 6, 2.2, 1); this.burst(d.x, d.y, 0.3, 0xff5a1f, 5, 1.8, 1);
      this.puff(d.x, d.y, 0.3, 0x55556a, 0.9, 0.6, 0.5);
    }
    else if (type === 'buy') { this.burst(d.x, d.y, 0.9, 0xffcf4a, 4, 1.6); const o = this.meshes.get(d.id); if (o) { o.kick = 0.18; o.flash = 0.35; if (d.kind === 'shelf') o.pop = 0.34; } }
    else if (type === 'pay') this.burst(d.x, d.y, 1.1, 0xffe45c, 7, 2.2, 1.2);
    else if (type === 'hit') this.burst(d.x, d.y, 0.5, d.crit ? 0xffee58 : 0xffffff, d.crit ? 6 : 3, 1.5);
    else if (type === 'kill') this.burst(d.enemy.x, d.enemy.y, 0.4, 0xffcf4a, 8, 2.5);
    else if (type === 'splash') { this.ringFx(d.x, d.y, d.r, 0x7df0d8); this.burst(d.x, d.y, 0.45, 0x7df0d8, 10, 2.6, 1.2); this.burst(d.x, d.y, 0.5, 0xffffff, 5, 2, 0.9); }
    else if (type === 'pulse') { this.ringFx(d.tower.x, d.tower.y, d.r, 0xffee58); const o = this.meshes.get(d.tower.id); if (o) o.flash = 0.25; }
    else if (type === 'slip') this.burst(d.enemy.x, d.enemy.y, 0.2, 0x8fd3ff, 8, 2);
    else if (type === 'leak') { this.shake = 0.35; this.burst(d.enemy.x, d.enemy.y, 0.6, 0x5fe3a1, 10, 3); }
    else if (type === 'place' || type === 'upgrade') {
      const t = d.tower, big = type === 'place';
      this.pops.set(t.id, 0);
      this.ringFx(t.x, t.y, big ? 1.5 : 1.1, 0xffffff);
      this.burst(t.x, t.y, 0.3, 0xffffff, big ? 10 : 6, 2.2, 1.1);
      if (big) { this.burst(t.x, t.y, 0.5, 0xffcf4a, 8, 2.8, 1.1); this.burst(t.x, t.y, 0.2, 0xe9ddc0, 8, 1.8, 1.5); for (let i = 0; i < 4; i++) this.puff(t.x, t.y, 0.15, 0xe9ddc0, 1.2, 0.5, 0.5); }
    }
    else if (type === 'stock') for (const s of d.shelves || [d.shelf]) this.burst(s.x, s.y, 0.8, 0xffcf4a, 5, 2);
    else if (type === 'push') {
      const metal = d.shelf.type === 'steel' || d.shelf.type === 'fence';
      this.burst(d.shelf.x, d.shelf.y, 0.6, metal ? 0xd9dee8 : 0xc08a50, 3, 1.8);
      if (metal) this.burst(d.shelf.x, d.shelf.y, 0.7, 0xffe08a, 2, 2.2, 0.7);   // sparks off the steel
    }
    else if (type === 'fruitScatter') { this.burst(d.x, d.y, 0.5, 0xff9f1c, 8, 2.6, 1.2); this.burst(d.x, d.y, 0.5, 0xe0463e, 6, 2.2, 1.1); this.ringFx(d.x, d.y, 1.2, 0xffd23f); }
    else if (type === 'fruitBoom') {
      this.ringFx(d.x, d.y, d.r * 1.3, 0xff9f1c); this.burst(d.x, d.y, 0.4, FRUIT_COL[d.kind % 5], 10, 3, 1.3);
      this.burst(d.x, d.y, 0.5, 0xffd23f, 6, 2.4, 1); this.burst(d.x, d.y, 0.4, 0xffffff, 5, 2, 1); this.shake = Math.max(this.shake, 0.12);
    }
    else if (type === 'repair') {
      for (const it of d.items) this.burst(it.x, it.y, 0.9, 0x5fe3a1, 3, 1.2, 0.9);
      const now = performance.now(); if (now - (this._rr || 0) > 1400) { this._rr = now; this.ringFx(d.statue.x, d.statue.y, 5.5, 0x5fe3a1); }   // the repair area pulses outwards
    }
    else if (type === 'statueDry') this.burst(d.x, d.y, 1.2, 0xaab2c0, 8, 1.6, 1.1);
    else if (type === 'refund') { this.burst(d.x, d.y, 0.8, 0xffe45c, 12, 3, 1.3); this.ringFx(d.x, d.y, 1.8, 0xffe45c); }
    else if (type === 'shelfBreak') this.debris(d.shelf);
    else if (type === 'sell') this.burst(d.tower.x, d.tower.y, 0.3, 0xffcf4a, 6, 1.5);
    else if (type === 'sauceSplash') {
      this.ringFx(d.x, d.y, d.r, 0xff8c1a); this.splat(d.x, d.y, d.r, 0xd62828);
      this.burst(d.x, d.y, 0.4, 0xd62828, 12, 2.8, 1.3); this.burst(d.x, d.y, 0.5, 0xff8c1a, 10, 2.4, 1.1); this.burst(d.x, d.y, 0.6, 0xffd23f, 6, 2, 0.9);
      this.shake = Math.max(this.shake, 0.1);
    }
    else if (type === 'bounce') this.burst(d.x, d.y, 0.8, 0xffa94d, 4, 1.8, 0.8);
    else if (type === 'freeze') { this.burst(d.enemy.x, d.enemy.y, 0.6, 0xbfeaff, 8, 2, 0.9); this.burst(d.enemy.x, d.enemy.y, 0.6, 0xffffff, 4, 1.4, 0.7); }
    else if (type === 'iceBurst') this.iceCubes(d);
    else if (type === 'panic') this.burst(d.enemy.x, d.enemy.y, 1.0, 0x8fd3ff, 6, 1.6, 0.7);
    else if (type === 'molotovSplash') this.blast3d(d.x, d.y, d.r, d.fueled ? 1.35 : 1, true);
    else if (type === 'doorCrash') {
      this.burst(d.x, d.y, 0.8, 0xc08a50, 14, 3.4, 1.3); this.burst(d.x, d.y, 0.8, 0x9ad7ff, 10, 3, 1); this.ringFx(d.x, d.y, 1.4, 0xe9ddc0);
      for (let i = 0; i < 5; i++) this.puff(d.x, d.y, 0.3 + Math.random() * 0.4, 0xb9b3a4, 1.2, 0.8, 0.8);
      this.shake = Math.max(this.shake, 0.35);
    }
    else if (type === 'motoCrash') {
      this.flashFx(d.x, d.y, 1.4); this.ringFx(d.ex, d.ey, 1.3, 0xffee58);
      this.burst(d.ex, d.ey, 0.5, 0xffee58, 10, 3, 1); this.burst(d.ex, d.ey, 0.4, 0xd62828, 8, 2.6, 1.2); this.burst(d.ex, d.ey, 0.4, 0x3a3a4a, 6, 2.2, 1.4);
      for (let i = 0; i < 5; i++) this.puff(d.ex, d.ey, 0.4 + Math.random() * 0.4, 0x55556a, 1.6, 1.1, 1.1);
      this.shake = Math.max(this.shake, 0.5);
    }
    else if (type === 'riders') { this.burst(d.x, d.y, 0.8, 0xffffff, 8, 2, 1); this.ringFx(d.x, d.y, 1.0, 0xffffff); }
    else if (type === 'smash') {
      this.burst(d.x, d.y, 0.5, 0xc89a5a, 8, 2.4, 1.1); this.burst(d.x, d.y, 0.6, 0xffee58, 5, 2.2, 0.9);
      if (d.kind === 3) this.burst(d.x, d.y, 0.6, 0xc08a50, 5, 2.2, 1);
      this.shake = Math.max(this.shake, 0.15);
    }
    else if (type === 'deflect') { this.burst(d.x, d.y, 0.8, 0xffffff, 8, 3, 0.9); this.ringFx(d.x, d.y, 0.6, 0xffee58); }
    else if (type === 'bombLand') this.burst(d.x, d.y, 0.2, 0xe9ddc0, 5, 1.2, 1);
    else if (type === 'explode') {
      this.blast3d(d.x, d.y, d.r, 1.1, false);   // 3D fireball, glowing embers and a smoke cloud on top of the flash
      this.flashFx(d.x, d.y, d.r * 1.3); this.ringFx(d.x, d.y, d.r * 1.5, 0xffd23f); this.ringFx(d.x, d.y, d.r, 0xff5a1f);
      this.burst(d.x, d.y, 0.5, 0xff8c1a, 14, 3.4, 1.4); this.burst(d.x, d.y, 0.5, 0xffd23f, 8, 3, 1.1); this.burst(d.x, d.y, 0.4, 0x3a3a4a, 8, 2.6, 1.5);
      for (let i = 0; i < 6; i++) this.puff(d.x, d.y, 0.4 + Math.random() * 0.4, 0x55556a, 1.8, 1.1, 1.1);
      this.shake = Math.max(this.shake, 0.45);
    }
    else if (type === 'dashHit') {
      this.burst(d.x, d.y, 0.4, 0xe9ddc0, 8, 2.4, 1.3);
      if (d.kind >= 2) { this.burst(d.x, d.y, 0.6, 0xffee58, 5, 2.2, 0.9); this.shake = Math.max(this.shake, 0.18); }
      if (d.kind === 3) this.burst(d.x, d.y, 0.6, 0xc08a50, 5, 2.2, 1);
    }
    else if (type === 'towerHit') this.burst(d.tower.x, d.tower.y, 0.7, 0xffee58, 5, 2, 0.9);
    else if (type === 'towerBreak') {
      const t = d.tower; this.ringFx(t.x, t.y, 1.3, 0xffee58);
      this.burst(t.x, t.y, 0.7, 0xffee58, 10, 3, 1); this.burst(t.x, t.y, 0.6, 0x55556a, 8, 2.4, 1.4);
      for (let i = 0; i < 5; i++) this.puff(t.x, t.y, 0.6 + Math.random() * 0.5, 0x55556a, 1.6, 1, 1);
      this.shake = Math.max(this.shake, 0.3);
    }
    else if (type === 'waterSplash') {
      this.ringFx(d.x, d.y, d.r, 0x4aa8ff); this.splat(d.x, d.y, d.r * 0.8, 0x4aa8ff);
      this.burst(d.x, d.y, 0.4, 0x4aa8ff, 10, 2.6, 1.1); this.burst(d.x, d.y, 0.5, 0xcdeeff, 6, 2.2, 0.9); this.burst(d.x, d.y, 0.3, 0xffffff, 4, 1.6, 0.8);
    }
    else if (type === 'donutHit') { this.burst(d.x, d.y, d.h, 0xff7aa2, 5, 2, 0.9); this.burst(d.x, d.y, d.h, 0xffcf4a, 3, 1.8, 0.8); this.burst(d.x, d.y, d.h, 0xe0a458, 3, 1.4, 0.8); }
    else if (type === 'donutCatch') { const o = this.meshes.get(d.tower.id); if (o) o.kick = 0.18; this.burst(d.tower.x, d.tower.y, 0.7, 0xff7aa2, 4, 1.4, 0.8); }
    else if (type === 'cerealLand') {
      const s = d.shelf; this.ringFx(s.x, s.y, 1.1, 0xffd23f); this.shake = Math.max(this.shake, 0.12);
      this.burst(s.x, s.y, 0.5, 0xffd23f, 8, 2.4, 1.1); this.burst(s.x, s.y, 0.4, 0xc98a5a, 8, 2.2, 1.3); this.burst(s.x, s.y, 0.4, 0xff9f1c, 5, 1.8, 1);
      for (let i = 0; i < 4; i++) this.puff(s.x, s.y, 0.15, 0xe9ddc0, 1.2, 0.5, 0.5);
    }
    else if (type === 'cerealPoof') { this.burst(d.x, d.y, 0.3, 0xc98a5a, 6, 2, 1); this.puff(d.x, d.y, 0.2, 0xe9ddc0, 1, 0.5, 0.5); }
    else if (type === 'boxGone') { const s = d.shelf; this.burst(s.x, s.y, 0.5, 0xc98a5a, 8, 2, 1); this.burst(s.x, s.y, 0.5, 0xffd23f, 5, 1.8, 0.9); for (let i = 0; i < 3; i++) this.puff(s.x, s.y, 0.3, 0xe9ddc0, 1.2, 0.6, 0.6); }
    else if (type === 'tissueEnd') this.scatterTissue(d);
    else if (type === 'tissueHit') { this.burst(d.x, d.y, 0.6, 0xffffff, 6, 2, 1.1); this.puff(d.x, d.y, 0.5, 0xf4f6fb, 0.9, 0.5, 0.5); }
    else if (type === 'service' || type === 'replace') { const t = d.tower; this.ringFx(t.x, t.y, 1.1, 0x5fe3a1); this.burst(t.x, t.y, 0.8, 0x5fe3a1, 8, 2, 1); this.burst(t.x, t.y, 0.8, 0xffffff, 4, 1.6, 0.8); }
    else if (type === 'bossSpawn') { const e = d.enemy; this.ringFx(e.x, e.y, 2.2, 0xff3b3b); this.burst(e.x, e.y, 0.6, 0xff3b3b, 12, 3, 1.2); this.shake = Math.max(this.shake, 0.4); }
    else if (type === 'aim') { this.ringFx(d.x, d.y, 0.8, 0xff3b3b); }
    else if (type === 'shotgun') {                                                        // one shotgun blast: muzzle flash, a fan of pellets and the target flying apart
      const dx = d.tx - d.x, dy = d.ty - d.y, L = Math.hypot(dx, dy) || 1;
      this.flashFx(d.x + dx / L * 0.6, d.y + dy / L * 0.6, 0.9, 0.9);
      for (let i = 1; i <= 7; i++) { const k = i / 7, sp = (Math.random() - 0.5) * 0.35 * k; this.burst(d.x + dx * k - dy / L * sp, d.y + dy * k + dx / L * sp, 0.7, i % 2 ? 0xffee58 : 0xffffff, 2, 1, 0.8); }
      this.burst(d.x, d.y, 0.9, 0xffd23f, 8, 2.4, 1); this.puff(d.x + dx / L * 0.5, d.y + dy / L * 0.5, 0.9, 0x9a9aa8, 0.9, 0.6, 0.6);
      this.ringFx(d.tx, d.ty, 1.2, 0xffee58); this.burst(d.tx, d.ty, 0.5, 0xc08a50, 12, 3, 1.2); this.shake = Math.max(this.shake, 0.3);
    }
    else if (type === 'gunShot') {
      const dx = d.tx - d.x, dy = d.ty - d.y;
      for (let i = 1; i <= 4; i++) this.burst(d.x + dx * i / 5, d.y + dy * i / 5, 0.6, 0xffee58, 1, 0.5, 0.6);
      this.burst(d.x, d.y, 0.6, 0xffffff, 2, 1.2, 0.8); this.burst(d.tx, d.ty, 0.6, 0xffee58, 3, 1.6, 0.8);
    }
    else if (type === 'summon') { this.ringFx(d.x, d.y, 1.8, 0xff5a5f); this.ringFx(d.x, d.y, 1.1, 0xffffff); this.burst(d.x, d.y, 0.8, 0xff5a5f, 10, 2.6, 1); this.shake = Math.max(this.shake, 0.2); }
    else if (type === 'slamWarn') this.slamMark(d.x, d.y, d.t);
    else if (type === 'slam') {
      this.ringFx(d.x, d.y, 2.2, 0xffffff); this.ringFx(d.x, d.y, 1.4, 0xffcf4a); this.flashFx(d.x, d.y, 1.8, 0.3);
      this.burst(d.x, d.y, 0.3, 0xc08a50, 18, 3.6, 1.3); this.burst(d.x, d.y, 0.3, 0xe9ddc0, 14, 3, 1.2);
      for (let i = 0; i < 8; i++) this.puff(d.x + (Math.random() - 0.5) * 2.6, d.y + (Math.random() - 0.5) * 2.6, 0.2, 0xb9b3a4, 1.3, 0.8, 0.9);
      this.shake = Math.max(this.shake, 0.7);
    }
    else if (type === 'shieldHit') { if (Math.random() < 0.5) this.burst(d.x, d.y, 0.7, 0xffee58, 2, 1.8, 0.7); }
    else if (type === 'shieldBreak') {
      this.ringFx(d.x, d.y, 1.6, 0xc08a50); this.burst(d.x, d.y, 0.7, 0xa56a3a, 16, 3.4, 1.5); this.burst(d.x, d.y, 0.7, 0x9ad7ff, 8, 3, 1.2); this.burst(d.x, d.y, 0.7, 0x6e4423, 8, 2.6, 1.4);
      this.shake = Math.max(this.shake, 0.4);
    }
    else if (type === 'park') { for (let i = 0; i < 6; i++) this.puff(d.x, d.y, 0.2, 0xb9b3a4, 1, 0.6, 0.8); this.ringFx(d.x, d.y, 1.2, 0xe9ddc0); }
    else if (type === 'spinStart') { this.ringFx(d.x, d.y, 1.8, 0xc9b48a); for (let i = 0; i < 8; i++) this.puff(d.x, d.y, 0.2, 0xc9b48a, 1.2, 0.8, 0.9); }
    else if (type === 'tornado') { this.ringFx(d.x, d.y, 1.5, 0xc9b48a); this.burst(d.x, d.y, 0.3, 0xc9b48a, 10, 2.4, 1.1); }
    else if (type === 'bossSmash') {
      this.flashFx(d.x, d.y, 1.2); this.burst(d.x, d.y, 0.5, 0xffee58, 8, 3, 1); this.burst(d.x, d.y, 0.5, 0xc08a50, 8, 2.6, 1.2); this.burst(d.x, d.y, 0.4, 0x55556a, 6, 2.2, 1.3);
      for (let i = 0; i < 3; i++) this.puff(d.x, d.y, 0.4, 0x55556a, 1.2, 1, 0.9);
      this.shake = Math.max(this.shake, 0.3);
    }
  }

  // ---------- Door Robber: red 3x3 floor warning that blinks until the slam lands ----------
  slamMark(x, y, life) {
    const grp = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.35 });
    const fill = new THREE.Mesh(this.box, mat); fill.scale.set(3, 0.03, 3); grp.add(fill);
    for (const [sx, sz, px, pz] of [[3.12, 0.1, 0, 1.55], [3.12, 0.1, 0, -1.55], [0.1, 3.12, 1.55, 0], [0.1, 3.12, -1.55, 0]]) {
      const m = new THREE.Mesh(this.box, this.basic(0xffee58)); m.scale.set(sx, 0.05, sz); m.position.set(px, 0.01, pz); grp.add(m);
    }
    grp.position.set(wx(x), 0.07, wz(y)); this.scene.add(grp);
    this.fx.push({ warn: true, m: grp, mat, life: life + 0.05, t: 0 });
  }
  // ---------- Riding in Tandem: dust tornado ----------
  makeTornado() {
    const g = new THREE.Group(); g.userData.discs = []; g.userData.bits = [];
    const cols = [0xc9b48a, 0xb09a72, 0xd8c7a0];
    for (let i = 0; i < 7; i++) {
      const w = new THREE.Group(), r = 0.22 + i * 0.13;
      this.part(w, this.box, cols[i % 3], r * 2, 0.1, 0.1, 0, 0, r, false); this.part(w, this.box, cols[(i + 1) % 3], 0.1, 0.1, r * 1.4, -r, 0, 0, false); this.part(w, this.box, cols[(i + 2) % 3], r * 1.4, 0.1, 0.1, 0, 0, -r, false);
      w.position.y = 0.1 + i * 0.22; g.add(w); g.userData.discs.push(w);
    }
    for (let i = 0; i < 8; i++) { const m = this.part(g, this.box, i % 2 ? 0x8a6a3a : 0xe9ddc0, 0.09, 0.09, 0.09, 0, 0, 0, false); g.userData.bits.push(m); }
    return g;
  }
  animTornado(g, tn, time) {
    const sc = Math.max(0.01, Math.min(1, tn.t / 0.5, (tn.max - tn.t) / 0.4)), u = g.userData;
    u.discs.forEach((w, i) => { w.rotation.y = time * (5 + i * 0.7) * (i % 2 ? -1 : 1); w.position.x = Math.sin(time * 3 + i) * 0.08 * (i + 1) * 0.4; w.scale.setScalar(sc); });
    u.bits.forEach((m, i) => { const a = time * (6 + (i % 3)) + i * 0.8, rr = 0.5 + ((i * 0.37 + time * 0.3) % 1) * 0.7; m.position.set(Math.cos(a) * rr, 0.2 + ((time * 0.8 + i * 0.13) % 1) * 1.4, Math.sin(a) * rr); m.rotation.set(time * 4 + i, a, 0); m.scale.setScalar(0.09 * sc); });
    if (Math.random() < 0.5) this.puff(tn.x + (Math.random() - 0.5), tn.y + (Math.random() - 0.5), 0.1, 0xc9b48a, 0.9, 0.5, 0.6);
  }

  // ---------- per frame ----------
  render(dt, time) {
    const g = this.game; if (!g) return;
    if (this.money) this.syncMoney(g, dt);
    // sync dynamic entities
    const seen = new Set();
    const sync = (list, make, upd) => {
      for (const o of list) {
        seen.add(o.id);
        let m = this.meshes.get(o.id);
        if (!m) { const grp = make(o); this.dyn.add(grp); m = { group: grp, lvl: 0 }; this.meshes.set(o.id, m); grp.traverse(c => { if (c.isMesh && c.castShadow === undefined) c.castShadow = true; }); }
        if (m.group && (o.kind === 'tower' || o.kind === 'shelf' || o.kind === 'trap')) { m.group.position.x = wx(o.x); m.group.position.z = wz(o.y); }   // items can be moved
        upd(o, m);
      }
    };
    sync(g.towers, t => this.at(makeItem(this, t), t), (t, m) => this.updTower(t, m, dt));
    sync(g.fruits || [], f => makeFruit(this, f), (f, m) => {          // loose fruit from a smashed fruit shelf: arcs out, then flashes until it blows
      const u = m.group.userData, left = f.fuse - f.age;
      m.group.position.set(wx(f.x), f.h, wz(f.y));
      u.flash.visible = f.age > f.land && Math.floor(time * (left < 0.5 ? 40 : left < 1 ? 20 : 8)) % 2 === 0;
      m.group.scale.setScalar(1 + (left < 0.4 ? (0.4 - left) * 0.9 : 0));
      if (f.age < f.land) m.group.rotation.z += dt * 12;
    });
    sync(g.shelves, sh => this.at(makeItem(this, sh), sh), (sh, m) => {
      const u = m.group.userData;
      if (u.stock !== sh.units) (u.setGoods || setShelfGoods)(this, m.group, sh.units);
      if (u.setLinks) {   // security fence: reach rails towards the fence pieces next to it
        const nb = (dx, dy) => { const o = g.shelfAt(sh.x + dx, sh.y + dy); return o && o.type === 'fence' ? 1 : 0; };
        const mask = nb(1, 0) | nb(-1, 0) << 1 | nb(0, 1) << 2 | nb(0, -1) << 3;
        if (mask !== u.links) u.setLinks(mask);
      }
      if (u.anim) u.anim(m.group, sh, time, dt);
      const k = sh.hit > 0 ? 0.05 : 0;
      u.body.position.x = (Math.random() - 0.5) * k * 2; u.body.position.z = (Math.random() - 0.5) * k;
      u.body.rotation.z = sh.hit > 0 ? (Math.random() - 0.5) * 0.08 : 0;
      // a customer took something: the shelf hops and squashes (jelly pop)
      if (m.pop > 0) {
        m.pop -= dt; const p = 1 - Math.max(0, m.pop) / 0.34, s = Math.sin(p * Math.PI) * (1 - p * 0.35), w = Math.sin(p * Math.PI * 3) * (1 - p) * 0.06;
        m.group.scale.set(1 + 0.07 * s + w * 0.5, 1 + 0.12 * s - w * 0.5, 1 + 0.07 * s + w * 0.5); m.group.position.y = 0.07 * s; m.popping = true;
      } else if (m.popping) { m.popping = false; m.group.scale.set(1, 1, 1); m.group.position.y = 0; }
    });
    sync(g.traps, t => this.at(makeItem(this, t), t), (t, m) => { const s = 0.7 + 0.3 * Math.min(1, t.uses / 12); m.group.scale.setScalar(s); });
    sync(g.enemies, e => makeEnemy(this, e), (e, m) => this.updEnemy(e, m, time, dt));
    sync(g.customers, c => makeCustomer(this, c), (c, m) => this.updCustomer(c, m, time, dt));
    sync(g.walkers || [], w => makeCustomer(this, w), (w, m) => {
      this.updCustomer(w, m, time, dt);
      if (!m.fade) { m.fade = []; m.group.traverse(o => { if (o.isMesh && o.material && !Array.isArray(o.material)) { o.material = o.material.clone(); o.material.transparent = true; m.fade.push(o.material); } }); }
      for (const mt of m.fade) mt.opacity = w.a;
    });
    sync(g.fires, f => this.at(f.foe ? this.makeFoeFire(f) : makeFire(this, f), f), (f, m) => f.foe ? this.animFoeFire(m.group, f, time, dt) : animFire(this, m.group, f, time));
    for (const it of [...g.towers.filter(t => t.kind === 'tower'), ...g.shelves]) {   // burning shelves and machines throw flames and smoke
      if (!(it.burning > 0)) continue;
      const c = it.cells || (g.cellsOf ? g.cellsOf(it) : [[it.x, it.y]]);
      if (Math.random() < dt * 16) { const [cx, cy] = c[Math.floor(Math.random() * c.length)]; this.fireBit(cx + (Math.random() - 0.5) * 0.7, 0.15 + Math.random() * 0.7, cy + (Math.random() - 0.5) * 0.7, 1.1); }
      if (Math.random() < dt * 4) { const [cx, cy] = c[Math.floor(Math.random() * c.length)]; this.puff(cx, cy, 0.9, 0x3a3a46, 1.1, 0.9, 1.1); }
    }
    sync(g.bombs, b => this.at(makeGroundBomb(this, b), b), (b, m) => animGroundBomb(m.group, b, time));
    sync(g.skills || [], s => this.at(s.type === 'cigs' ? makeCigPack(this, 1) : makeShakenCola(this, 1, ITEMS.shakecola.radius), s),
      (s, m) => s.type === 'cigs' ? animCigPack(m.group, s, time, this) : animShakenCola(m.group, s, time, this));
    sync(g.swirls || [], s => this.at(this.makeSwirlModel(), s), (s, m) => this.animSwirl(m.group, s, time));
    sync(g.tornados || [], tn => this.at(this.makeTornado(), tn), (tn, m) => { m.group.position.set(wx(tn.x), 0, wz(tn.y)); this.animTornado(m.group, tn, time); });
    sync(g.donuts || [], d => makeProjectile(this, d), (d, m) => {                // boomerang donuts: twirl flat, sprinkle crumbs
      m.group.position.set(wx(d.x), d.h, wz(d.y)); m.group.visible = !(d.delay > 0);
      m.group.userData.spin.rotation.y += dt * 24;
      if (Math.random() < dt * 22) this.burst(d.x, d.y, d.h, 0xffc0d0, 1, 0.5, 0.5);
    });
    sync(g.rolls || [], r => makeProjectile(this, r), (r, m) => {                 // tissue roll: spins along the lane, ribbon trails behind it
      const u = m.group.userData, L = Math.max(0.01, Math.min(r.dist + 0.3, 2.2));
      m.group.position.set(wx(r.x), 0.5, wz(r.y)); m.group.rotation.y = Math.atan2(r.dx, r.dy);
      u.spin.rotation.x += dt * 20;
      u.rib.scale.set(0.22, 0.015, L); u.rib.position.set(0, -0.04 + Math.sin(time * 18 + r.id) * 0.02, -L / 2);
    });
    sync(g.projectiles, p => p.kind === 'molo' ? this.makeMoloProj() : p.kind === 'hotdog' ? this.makeHotdogProj() : p.kind === 'ice' ? this.makeIceProj() : p.kind === 'cig' ? makeLitCig(this) : makeProjectile(this, p), (p, m) => {
      const grp = m.group; grp.position.set(wx(p.x), p.h, wz(p.y));
      grp.visible = !(p.delay > 0);   // queued gumballs are still inside the machine
      if (p.kind === 'gum') { grp.rotation.x += dt * 9; grp.rotation.z += dt * 6; }
      else if (p.kind === 'cola') {                                                                                           // fizzy spray + brown trail
        for (const d of grp.userData.drops) d.position.set((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 0.2);
        m.acc = (m.acc || 0) + dt;
        while (m.acc > 0.012) { m.acc -= 0.012; this.trailDrop(wx(p.x) - p.dx * m.acc * p.speed, p.h, wz(p.y) - p.dy * m.acc * p.speed, COLA_PAL, 1.0, 0.9); }
      } else if (p.kind === 'atm') {                                                                                          // receipt flutters through the air
        const pa = grp.userData.paper; pa.rotation.y = Math.atan2(p.dx, p.dy); pa.rotation.z = Math.sin(time * 22 + p.id) * 0.9; pa.rotation.x = Math.cos(time * 17 + p.id) * 0.5;
      } else if (p.kind === 'cans') { const c = grp.userData.can; c.tilt.rotation.x += dt * 13; c.tilt.rotation.z += dt * 8; }          // tumbling can
      else if (p.kind === 'soda') {                                                                                           // spray + trail
        for (const d of grp.userData.drops) d.position.set((Math.random() - 0.5) * 0.22, (Math.random() - 0.5) * 0.16, (Math.random() - 0.5) * 0.22);
        m.acc = (m.acc || 0) + dt;
        while (m.acc > 0.014) { m.acc -= 0.014; this.trailDrop(wx(p.x) - p.dx * m.acc * p.speed, p.h, wz(p.y) - p.dy * m.acc * p.speed); }
      } else if (p.kind === 'sauce') {                                                                                        // wobbling glob + burning drip trail
        const u = grp.userData, w = Math.sin(time * 24);
        u.core.scale.set(0.2 * (1 + 0.1 * w), 0.2 * (1 - 0.12 * w), 0.2 * (1 + 0.1 * w));
        u.drips.forEach((dr, i) => dr.position.set(Math.cos(time * 9 + i * 2.1) * 0.2, Math.sin(time * 7 + i * 3) * 0.12 - 0.08, Math.sin(time * 9 + i * 2.1) * 0.2));
        m.acc = (m.acc || 0) + dt;
        while (m.acc > 0.02) { m.acc -= 0.02; this.trailDrop(wx(p.x) - p.dx * m.acc * p.speed, p.h, wz(p.y) - p.dy * m.acc * p.speed, [0xd62828, 0xff5a1f, 0xffd23f, 0xff8c1a], 3, 0.8); }
        if (Math.random() < dt * 25) this.flame(p.x, p.y, p.h + 0.1);
      } else if (p.kind === 'cig') {                                                                                          // tumbling lit cigarette, ember sparks + smoke
        grp.rotation.y = Math.atan2(-p.dy, p.dx); grp.userData.cig.rotation.x += dt * 14;
        if (Math.random() < dt * 40) this.burst(p.x, p.y, p.h, 0xff8c1a, 1, 0.5, 0.5);
        if (Math.random() < dt * 18) this.puff(p.x, p.y, p.h + 0.1, 0x9a9aa8, 0.35, 0.5, 0.35);
      } else if (p.kind === 'molo') {                                                                                         // spinning bottle with a burning rag
        grp.rotation.z += dt * 9; grp.rotation.x += dt * 4;
        if (Math.random() < dt * 34) this.flame(p.x, p.y, p.h + 0.18);
        if (Math.random() < dt * 14) this.puff(p.x, p.y, p.h + 0.2, 0x3a3a4a, 0.4, 0.5, 0.4);
      } else if (p.kind === 'bomb') {                                                                                         // spinning bomb with a sparking fuse
        grp.rotation.z += dt * 7; grp.userData.spark.visible = Math.floor(time * 30) % 2 === 0;
        if (Math.random() < dt * 20) this.puff(p.x, p.y, p.h + 0.3, 0xffd23f, 0.5, 0.4, 0.25);
      } else if (p.kind === 'hotdog') {                                                                                       // tumbling hot dog, nose along the flight direction
        grp.rotation.y = Math.atan2(-p.dy, p.dx); grp.rotation.z += dt * 14;
        if (Math.random() < dt * 14) this.burst(p.x, p.y, p.h, 0xffd23f, 1, 0.6, 0.6);
      } else if (p.kind === 'water') {                                                                                        // wobbling water drop + droplets
        const w = Math.sin(time * 22 + p.id); grp.userData.core.scale.set(0.17 * (1 + 0.1 * w), 0.2 * (1 - 0.1 * w), 0.17 * (1 + 0.1 * w));
        m.acc = (m.acc || 0) + dt;
        while (m.acc > 0.02) { m.acc -= 0.02; this.trailDrop(wx(p.x) - p.dx * m.acc * p.speed, p.h, wz(p.y) - p.dy * m.acc * p.speed, [0x4aa8ff, 0xcdeeff, 0xffffff, 0x7cc4ff], 1.2, 0.8); }
      } else if (p.kind === 'cereal') { grp.rotation.x += dt * 5; grp.rotation.y += dt * 3.5; grp.rotation.z += dt * 2;                         // tumbling cereal box
      } else if (p.kind === 'ice') { grp.rotation.y += dt * 9; grp.rotation.x += dt * 5;
      } else grp.rotation.y += dt * 12;
      if (p.lob && (p.kind === 'bomb' || p.kind === 'molo')) {                                                                // landing warning for the burglars' bombs only
        if (!m.mark) {
          const r = p.kind === 'bomb' ? BOMB_RADIUS : p.kind === 'molo' ? 1.0 : p.kind === 'ice' ? 1.0 : p.kind === 'water' ? ITEMS.water.splash * (this.game.mods.waterR || 1) : p.kind === 'cereal' ? 0.5 : ITEMS.sauce.splash;
          m.mark = new THREE.Mesh(this.markGeo ||= new THREE.RingGeometry(0.88, 1, 32), new THREE.MeshBasicMaterial({ color: p.kind === 'bomb' ? 0xff3b3b : p.kind === 'molo' ? 0xff6a00 : p.kind === 'ice' ? 0x8fd3f4 : p.kind === 'water' ? 0x4aa8ff : p.kind === 'cereal' ? 0xffd23f : 0xff8c1a, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
          m.mark.rotation.x = -Math.PI / 2; m.mark.position.set(wx(p.tx), 0.07, wz(p.ty)); m.mark.scale.setScalar(r); this.scene.add(m.mark);
        }
        m.mark.material.opacity = 0.45 + 0.3 * Math.sin(time * 18);
      }
    });
    for (const [id, t0] of this.pops) {   // pop-in: elastic scale 0 -> 1
      const m = this.meshes.get(id); if (!m) continue;
      const t = t0 + dt, x = Math.min(1, t / 0.45), k = x >= 1 ? 1 : 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
      const trap = g.traps.some(o => o.id === id);
      if (trap) m.group.scale.multiplyScalar(k); else m.group.scale.setScalar(Math.max(0.01, k));
      if (x >= 1) this.pops.delete(id); else this.pops.set(id, t);
    }
    for (const [id, m] of this.meshes) if (!seen.has(id)) { if (id === this.hoverId) { this.hoverId = null; this.outline = []; } this.dyn.remove(m.group); if (m.mark) { this.scene.remove(m.mark); m.mark.material.dispose(); } if (m.warn) this.scene.remove(m.warn); this.meshes.delete(id); }

    // morning -> night lighting
    const target = { morning: 0, prep: 0, evening: 0.55, wave: 1, restock: 1, lost: 1, won: 0 }[g.phase] ?? 0;
    this.tod += (target - this.tod) * Math.min(1, dt * 1.4);
    const k = this.tod, lerp = (a, b) => a + (b - a) * k;
    this.amb.color.setRGB(lerp(1, 0.62), lerp(1, 0.68), 1); this.amb.intensity = lerp(0.78, 0.8);
    this.sun.color.setRGB(lerp(1, 0.66), lerp(0.95, 0.74), lerp(0.87, 1)); this.sun.intensity = lerp(1.4, 0.95);
    this.quadMat.uniforms.tint.value.set(lerp(1, 0.8), lerp(1, 0.86), lerp(1, 1.08));
    this.renderer.setClearColor(this.sky.setRGB(0, 0, 0));   // black outside the store, day and night
    if (this.clerk) this.clerk.position.y = 0.9 + Math.abs(Math.sin(time * 2.2)) * 0.03;

    // fx particles
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.t += dt;
      if (f.ring) { const k = f.t / f.life; f.m.scale.setScalar(f.r * (0.3 + k * 0.7)); f.m.material.opacity = 0.8 * (1 - k); }
      else if (f.warn) { const k = f.t / f.life; f.mat.opacity = 0.2 + 0.35 * (Math.floor(f.t * (6 + 14 * k)) % 2) + 0.2 * k; }
      else if (f.decal) { const k = Math.max(0.01, Math.min(1, (f.life - f.t) / (f.life * 0.4))); f.m.scale.set(f.sx * k, 0.01, f.sz * k); }
      else if (f.iceCube) {
        const y0 = 0.08, drop = Math.min(1, f.t / 0.25);
        f.m.position.y = y0 + (1 - drop) * (1 - drop) * 0.8; if (drop < 1) f.m.rotation.x += f.spin * dt;
        const k = Math.max(0.01, Math.min(1, f.t / 0.1, (f.life - f.t) / 0.6)); f.m.scale.setScalar(f.s * k);
      }
      else if (f.ball) {
        const p = f.m.position;
        if (f.roll) f.m.children[0].children[0].rotation.x += Math.hypot(f.vx, f.vz) / f.r * dt;   // the roll turns as it rolls
        if (!f.rest) {
          f.vy -= 14 * dt; p.x += f.vx * dt; p.y += f.vy * dt; p.z += f.vz * dt;
          if (p.y <= f.r) { p.y = f.r; if (f.vy < -1.2) { f.vy = -f.vy * 0.55; f.vx *= 0.8; f.vz *= 0.8; } else { f.vy = 0; f.rest = true; } }
        } else { const damp = Math.exp(-2.2 * dt); f.vx *= damp; f.vz *= damp; p.x += f.vx * dt; p.z += f.vz * dt; }
        f.m.scale.setScalar(Math.max(0.01, Math.min(1, (f.life - f.t) / 0.4)) * f.r);
      }
      else if (f.flash) { const k = f.t / f.life; f.m.scale.setScalar(Math.max(0.01, f.r * Math.sin(k * Math.PI))); }
      else if (f.can) {
        // can physics: tumble in the air, bounce, lie down on its side and roll to a stop
        const p = f.m.position, c = f.c;
        if (!f.rest) {
          f.vy -= 14 * dt; p.x += f.vx * dt; p.y += f.vy * dt; p.z += f.vz * dt;
          if (p.y <= f.r) {
            p.y = f.r;
            if (!f.lying) { f.lying = true; c.tilt.rotation.set(0, 0, Math.PI / 2); }
            if (f.vy < -1.5) { f.vy = -f.vy * 0.4; f.vx *= 0.75; f.vz *= 0.75; } else { f.vy = 0; f.rest = true; }
          } else if (!f.lying) { c.tilt.rotation.x += f.sx * dt; c.tilt.rotation.z += f.sz * dt; }
        } else { const damp = Math.exp(-2.8 * dt); f.vx *= damp; f.vz *= damp; p.x += f.vx * dt; p.z += f.vz * dt; }
        const sp = Math.hypot(f.vx, f.vz);
        if (f.lying && sp > 0.12) { c.yaw.rotation.y = Math.atan2(f.vx, f.vz); c.can.rotation.y -= sp / f.r * dt; }
        f.m.scale.setScalar(Math.max(0.01, Math.min(1, (f.life - f.t) / 0.4)));
      }
      else {
        f.vy -= (f.g ?? 9) * dt; f.m.position.x += f.vx * dt; f.m.position.y = Math.max(0.05, f.m.position.y + f.vy * dt); f.m.position.z += f.vz * dt;
        if (f.trail) { f.ta = (f.ta || 0) + dt; while (f.ta > 0.03) { f.ta -= 0.03; this.trailBit(f.m.position, f.trail); } }   // leaves a trail behind it
        if (f.spin) {
          const onGround = f.m.position.y <= 0.051; if (onGround) { f.vx *= 0.9; f.vz *= 0.9; f.vy = 0; }
          else { f.m.rotation.x += f.spin[0] * dt; f.m.rotation.y += f.spin[1] * dt; f.m.rotation.z += f.spin[2] * dt; }
          const k = Math.min(1, (f.life - f.t) / 0.35); f.m.scale.set(f.sx * k, f.sy * k, f.sz * k);
        } else if (f.grow) { const k = f.t / f.life; f.m.scale.setScalar(Math.max(0.01, f.s * (0.5 + 1.4 * k) * (1 - k * k))); }   // smoke: swells, then thins out
        else f.m.scale.setScalar(f.s * (1 - f.t / f.life));
      }
      if (f.t >= f.life) { this.scene.remove(f.m); if (f.ring) { f.m.geometry.dispose(); f.m.material.dispose(); } if (f.warn) f.mat.dispose(); this.fx.splice(i, 1); }
    }
    this.windTick(dt, time);
    // camera shake
    this.shake = Math.max(0, this.shake - dt);
    const sh = this.shake * this.shake * 0.9;
    const offX = (this.ext.right - this.ext.left) / 2, offZ = (this.ext.bottom - this.ext.top) / 2;   // fixed camera, aimed at the middle of the whole shop
    this.camera.position.set(this.camBase.x + offX + (Math.random() - 0.5) * sh, this.camBase.y + (Math.random() - 0.5) * sh, this.camBase.z + offZ);
    this.camera.lookAt(offX, 0.2, offZ);

    // two-pass: low-res target, then nearest-neighbour upscale
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  updTower(t, m, dt) {
    const grp = m.group, prop = grp.userData.prop;
    if (t.level !== m.lvl) {
      m.lvl = t.level;
      if (m.pips) grp.remove(m.pips);
      m.pips = new THREE.Group(); grp.add(m.pips);
      for (let i = 0; i < t.level - 1 + 0; i++) this.part(m.pips, this.box, 0xffcf4a, 0.1, 0.1, 0.06, -0.12 + i * 0.24, grp.userData.pipY ?? 0.22, grp.userData.pipZ ?? 0.43, false);
      if (prop) prop.scale.setScalar(1 + 0.12 * (t.level - 1));
    }
    if (m.kick > 0) {   // little recoil when it fires / dispenses
      m.kick -= dt; const k = Math.max(0, m.kick) / 0.18;
      grp.scale.set(1 + 0.07 * k, 1 - 0.06 * k, 1 + 0.07 * k);
    }
    // wear & damage feedback: smoke when worn out, tilted + smoking when broken, shake when hit, '!' sign
    const top = grp.userData.top || 1.2, wear = t.wear || 0;
    m.fxT = (m.fxT || 0) - dt;
    if (t.broken) {
      grp.rotation.z = 0.14; grp.rotation.x = -0.06;
      if (m.fxT <= 0) { m.fxT = 0.1; this.puff(t.x, t.y, top * 0.7, 0x2a2a38, 1.3, 0.8, 1); if (Math.random() < 0.3) this.burst(t.x, t.y, top * 0.6, 0xffee58, 1, 1.4, 0.6); }
    } else {
      grp.rotation.z = 0; grp.rotation.x = 0;
      if (wear > 0.7 && m.fxT <= 0) { m.fxT = 0.55 - (wear - 0.7) * 1.0; this.puff(t.x, t.y, top * 0.8, 0x777788, 1, 0.7, 0.9); }
    }
    if (t.hit > 0) { grp.position.x = wx(t.x) + (Math.random() - 0.5) * 0.08; grp.position.z = wz(t.y) + (Math.random() - 0.5) * 0.08; } else { grp.position.x = wx(t.x); grp.position.z = wz(t.y); }
    if (t.kind === 'tower') {
      if (!m.warn) {
        const w = new THREE.Group(); const c = this.basic(0xffffff);
        const a = new THREE.Mesh(this.box, c); a.scale.set(0.1, 0.22, 0.04); a.position.y = 0.08; w.add(a);
        const b = new THREE.Mesh(this.box, c); b.scale.set(0.1, 0.1, 0.04); b.position.y = -0.1; w.add(b);
        m.warn = w; m.warnParts = [a, b]; this.scene.add(w);
      }
      const show = t.broken || wear > 0.7;
      const blink = t.broken && t.fuse != null ? (t.fuse < 2 ? 80 : 150) : 280;   // the closer the explosion, the faster it blinks
      m.warn.visible = show && Math.floor(performance.now() / blink) % 2 === 0;
      m.warn.position.set(wx(t.x), top + 0.4, wz(t.y)); m.warn.quaternion.copy(this.camera.quaternion);
      const col = this.basic(t.broken ? 0xff3b3b : 0xffb703); m.warnParts[0].material = col; m.warnParts[1].material = col;
    }
    if ((!prop || t.type === 'micro') && t.facing !== undefined) {   // vending / hot dog / fridge / microwave: whole machine turns to its open side
      if (m.face === undefined) m.face = t.facing;
      const d = Math.atan2(Math.sin(t.facing - m.face), Math.cos(t.facing - m.face));
      m.face += d * Math.min(1, dt * 10); grp.rotation.y = m.face;
    }
    if (prop && t.type !== 'micro') {
      let a = prop.rotation.y, d = t.angle - a; d = Math.atan2(Math.sin(d), Math.cos(d));
      prop.rotation.y = a + d * Math.min(1, dt * 14);
    }
    if (t.type === 'micro' && grp.userData.win) {
      m.flash = Math.max(0, (m.flash || 0) - dt);
      grp.userData.win.material.color.set(m.flash > 0 ? 0xffee58 : 0x1e2230);
    }
  }

  updCustomer(c, m, time, dt) {
    const grp = m.group, u = grp.userData;
    grp.position.set(wx(c.x), 0, wz(c.y));
    u.body.rotation.y += Math.atan2(Math.sin(c.angle - u.body.rotation.y), Math.cos(c.angle - u.body.rotation.y)) * Math.min(1, dt * 10);
    const moving = c.state === 'walk' || c.state === 'enter' || c.state === 'exit';
    const ph = time * 11 + c.id;
    u.legs[0].rotation.x = moving ? Math.sin(ph) * 0.5 : 0; u.legs[1].rotation.x = moving ? -Math.sin(ph) * 0.5 : 0;
    u.body.position.y = moving ? Math.abs(Math.sin(ph)) * 0.05 : (c.state === 'browse' ? Math.abs(Math.sin(time * 4 + c.id)) * 0.02 : 0);
    u.body.rotation.x = c.state === 'browse' ? 0.12 : 0;   // lean in to look at the goods
    const has = c.bags.length > 0; u.bag.visible = has;
    if (has) u.bag.material = this.toon(c.bags[c.bags.length - 1]);
  }

  updEnemy(e, m, time, dt) {
    const grp = m.group, u = grp.userData;
    grp.position.set(wx(e.x), 0, wz(e.y));
    if (e.tier && m.tierScale !== e.tier) { m.tierScale = e.tier; grp.scale.setScalar(1 + Math.min(0.3, 0.07 * e.tier)); }   // every 10 days the burglars look bigger
    if (e.spin) u.body.rotation.y = e.angle;   // the tandem's rotate attack: no smoothing, it whirls
    else u.body.rotation.y += (Math.atan2(Math.sin(e.angle - u.body.rotation.y), Math.cos(e.angle - u.body.rotation.y))) * Math.min(1, dt * (e.bk === 'motoduo' ? 7 : 10));
    const stunned = e.stun > 0;
    const sw = stunned ? 0 : Math.sin(time * 9 * (0.5 + e.speed * 0.5) + e.id) * 0.5;
    u.legs[0].rotation.x = sw; u.legs[1].rotation.x = -sw;
    u.body.position.y = stunned ? 0 : Math.abs(Math.sin(time * 9 * (0.5 + e.speed * 0.5) + e.id)) * 0.05;
    u.body.rotation.z = stunned ? Math.sin(time * 20) * 0.35 : 0;
    u.body.rotation.x = e.pushing ? 0.35 + Math.sin(time * 26) * 0.12 : e.dash ? 0.55 : e.wind > 0 && e.pending && e.pending.kind === 'dash' ? -0.35 : 0;
    if (e.wind > 0) u.body.rotation.z = Math.sin(time * 42) * 0.14;
    u.hold.visible = e.wind > 0 && !!e.pending && e.pending.kind === 'bomb';
    if (u.hold.visible) { u.hold.position.y = (1.1 + (0.55 - e.wind) * 0.3) * u.big; u.hold.children[1].visible = Math.floor(time * 30) % 2 === 0; }
    grp.position.y = (e.air || 0) * 0.9;                                   // riders jumping off the motorbike
    if (u.bottle) { const up = e.wind > 0 && e.pending && e.pending.kind === 'molo'; u.bottle.position.set(up ? 0.1 : 0.2, up ? 0.95 + Math.sin(time * 30) * 0.02 : 0.3, up ? 0 : 0.05); }   // bottle held up while winding up
    if (u.batPivot) {                                                        // bat raised while winding up, then swung
      const smashing = e.wind > 0 && e.pending && e.pending.kind === 'smash', sw2 = e.swing > 0 ? e.swing / 0.3 : 0;
      u.batPivot.rotation.x = smashing ? -2.3 : sw2 > 0 ? -2.3 + (1 - sw2) * 3.5 : 0;
    }
    if (u.wheels) {                                                          // motorbike: wheels spin, exhaust puffs, wrecked after the crash
      const ride = e.moto === 'ride' || (e.bk === 'motoduo' && !e.parked && !e.spin), crash = e.moto === 'crash';
      for (const w of u.wheels) w.rotation.x -= dt * (ride ? 32 : 0);
      u.legs[0].rotation.x = u.legs[1].rotation.x = 0;
      u.body.position.y = ride ? Math.abs(Math.sin(time * 40)) * 0.015 : 0;
      u.body.rotation.x = crash ? -0.45 + Math.sin(time * 50) * 0.03 : ride ? -0.06 : 0;
      u.body.rotation.z = crash ? Math.sin(time * 30) * 0.12 : 0;
      if ((m.dust = (m.dust || 0) - dt) <= 0) { m.dust = ride ? 0.05 : 0.12; if (ride) this.puff(e.x, e.y, 0.22, 0xb9b3a4, 0.45, 0.4, 0.4); else if (crash) this.puff(e.x, e.y, 0.5, 0x55556a, 0.8, 1.0, 0.8); }
    }
    if (u.door) {                                                            // Door Robber: shield door up front; raised overhead for the slam, gone once it breaks
      u.door.visible = e.shield > 0;
      const slamming = e.wind > 0 && e.pending && e.pending.kind === 'slam', want = slamming ? 1 : 0;
      m.dl = (m.dl || 0) + (want - (m.dl || 0)) * Math.min(1, dt * (slamming ? 6 : 22));
      u.door.position.y = 0.02 + m.dl * 0.55; u.door.position.z = 0.34 - m.dl * 0.18; u.door.rotation.x = -m.dl * 1.1;
      if (e.shield > 0 && e.shieldMax) { const k = e.shield / e.shieldMax; u.door.rotation.z = k < 0.35 ? Math.sin(time * 30) * 0.03 : 0; }
    }
    if (e.bk === 'gunslinger' && e.wind > 0 && e.pending && e.pending.kind === 'summon') u.body.rotation.x = -0.3 + Math.sin(time * 30) * 0.05;   // rears back to call his gunners
    m.fl = (m.fl || 0) - dt;
    if (e.burn > 0 && m.fl <= 0) { m.fl = 0.05; this.flame(e.x, e.y, (0.25 + Math.random() * 0.55) * u.big); }       // on fire!
    if (e.soak > 0 && (m.sk = (m.sk || 0) - dt) <= 0) { m.sk = 0.07; this.trailDrop(wx(e.x), (0.25 + Math.random() * 0.6) * u.big, wz(e.y), COLA_PAL, -0.5, 0.7); }   // soaked in cola: fizz rising off them
    if (e.dash && (m.dust = (m.dust || 0) - dt) <= 0) { m.dust = 0.04; this.burst(e.x, e.y, 0.1, 0xe9ddc0, 2, 1, 0.9); }   // dash dust trail
    u.body.visible = !(e.flash > 0 && Math.floor(time * 40) % 2 === 0);
    const r = Math.max(0, e.hp / e.maxhp);
    u.bar.visible = r < 0.999; u.bar.quaternion.copy(this.camera.quaternion);
    u.fg.scale.set(0.58 * r, 0.07, 1); u.fg.position.x = -0.29 * (1 - r);
    u.st.burn.visible = e.burn > 0 && Math.floor(time * 12) % 2 === 0;
    u.st.slow.visible = e.slow > 0; u.st.stun.visible = stunned;
    u.st.flee.visible = e.flee > 0 && Math.floor(time * 10) % 2 === 0; u.st.wind.visible = e.wind > 0;
    for (const k of ['burn', 'slow', 'stun', 'flee', 'wind']) u.st[k].quaternion.copy(this.camera.quaternion);
  }
}
