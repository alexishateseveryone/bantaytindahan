// Three.js view: flat toon materials + low-res render target upscaled with nearest filtering (pixel look)
import * as THREE from 'three';
import { COLS, ROWS, ITEMS, MAX_STOCK, BOMB_RADIUS, GUM_COLORS } from './game.js';   // COLS/ROWS are live bindings: the room size changes per game
const COLA_PAL = [0x3b1f14, 0x6b3a22, 0xffffff, 0xc98a5a, 0xffffff, 0x8a4b2a];
const FRUIT_COL = [0xe0463e, 0xff9f1c, 0x8bd450, 0xffd23f, 0x7b3fa0];
import { makeCoffee } from './model/items/coffee.js';
import { makeNoodle, makeCupNoodle } from './model/items/noodle.js';
import { makeEggtray, makeEgg } from './model/items/eggtray.js';
import { makeItem, makeShelf, setShelfGoods, makeCan, makeEnemy, makeCustomer, makeProjectile, makeFruit,
  makeGroundBomb, animGroundBomb, makeFire, animFire } from './model/index.js';

import { makeShakenCola, animShakenCola } from './model/colaShake.js';
import { makeCigPack, animCigPack, makeLitCig } from './model/cigs.js';
import { makeIceDrop, animIceDrop } from './model/iceDrop.js';
import { makeBanana, makeBananaCrate, animBananaCrate } from './model/banana.js';
import { makeBigBurger, animBigBurger, makeMiniBurger } from './model/burger.js';
import { makeGoldApple, animGoldApple } from './model/goldApple.js';

// Keep raw hex colors, no sRGB conversion: flat, predictable retro palette
THREE.ColorManagement.enabled = false;

// the store grows with the Room Expansion upgrade, so the origin is recomputed for every new game
let OX = (COLS - 1) / 2, OZ = (ROWS - 1) / 2;
const wx = x => x - OX, wz = y => y - OZ;
// true isometric-style camera: 45 degrees around, looking down at ELEV
const AZ = Math.PI / 4, ELEV = 40 * Math.PI / 180;
const CAMDIR = new THREE.Vector3(Math.sin(AZ) * Math.cos(ELEV), Math.sin(ELEV), Math.cos(AZ) * Math.cos(ELEV));

// paves a canvas with a running-bond brick pattern (8px rows, 16px bricks = 1 x 0.5 world units)
function paintBricks(c, w, h, a = '#cfae86', b = '#c29e76', mortar = '#9c8a70') {
  c.fillStyle = mortar; c.fillRect(0, 0, w, h);
  for (let ry = 0, r = 0; ry < h; ry += 8, r++) for (let x = -(r % 2) * 8, i = 0; x < w; x += 16, i++) {
    c.fillStyle = (i + r * 3) % 3 === 0 ? b : a; c.fillRect(x + 1, ry + 1, 14, 6);
  }
}

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
    sun.position.set(6, 14, -4); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 10; sc.bottom = -10; sc.near = 1; sc.far = 40;
    sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.03;
    this.scene.add(sun);

    this.camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    this.camDir = CAMDIR.clone();
    this.camera.position.copy(this.camDir).multiplyScalar(30); this.camera.position.y += 0.2;
    this.camera.lookAt(0, 0.2, 0);
    this.camBase = this.camera.position.clone();   // used by the loading screen

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
    // range indicator: a GRID of tiles (every cell in reach), brighter along the outer edge
    this.gridMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false });
    this.gridEdgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
    this.rangeGrid = new THREE.Group(); this.rangeGrid.visible = false; this.rangeKey = ''; this.scene.add(this.rangeGrid);

    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
    window.addEventListener('resize', () => this.resize());
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.resize());
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
    const w = Math.max(50, window.innerWidth), h = Math.max(50, window.innerHeight);   // the whole screen, not the container's (possibly smaller) box
    this.w = w; this.h = h;
    this.pixel = Math.max(2, Math.round(h / 240));
    const P = this.pixel, tw = Math.ceil(w / P), th = Math.ceil(h / P);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.rt.setSize(tw, th);
    this.sx = w / (tw * P); this.sy = h / (th * P);
    this.quadMat.uniforms.uvScale.value.set(this.sx, this.sy);
    // frame the store: project the store's bounding box through the isometric camera and fit the ortho frustum around it
    const aspect = tw / th, c = this.camera, ex = this.ext, cap = v => Math.min(v, 1.0);   // only a little of the counter strip / sidewalk is framed: the room itself fills the screen
    const tx = (ex.right - ex.left) / 2, tz = (ex.bottom - ex.top) / 2;
    c.position.set(tx + this.camDir.x * 30, 0.2 + this.camDir.y * 30, tz + this.camDir.z * 30); c.lookAt(tx, 0.2, tz); c.updateMatrixWorld(true);
    const x0 = wx(-0.5) - cap(ex.left), x1 = wx(COLS - 0.5) + cap(ex.right), z0 = wz(-0.5) - cap(ex.top), z1 = wz(ROWS - 0.5) + cap(ex.bottom);
    let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9; const v = this._fv || (this._fv = new THREE.Vector3());
    for (const x of [x0, x1]) for (const z of [z0, z1]) for (const y of [0, 1.2]) {
      v.set(x, y, z).applyMatrix4(c.matrixWorldInverse); mnx = Math.min(mnx, v.x); mxx = Math.max(mxx, v.x); mny = Math.min(mny, v.y); mxy = Math.max(mxy, v.y);
    }
    const cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2;
    let halfW = (mxx - mnx) / 2 + 0.2, halfH = (mxy - mny) / 2 + 0.2; const halfW0 = halfW, halfH0 = halfH;
    if (halfW / aspect > halfH) halfH = halfW / aspect; else halfW = halfH * aspect;
    // zoom in: crop the empty corners of the isometric box. A renovated (bigger) store is cropped a little less so its tips stay visible,
    // but it no longer zooms out as far as a full fit would.
    const lvl = Math.max(0, Math.round((COLS - 9) / 2)), crop = Math.max(0.74, 0.84 - 0.025 * lvl);
    // the build receipt covers the right side: the store may slide partly under it (only 55% of its width counts), so the picture doesn't shrink
    const res = Math.min(w * 0.6, Math.max(0, (this.reserveRight || 0) * 0.55));
    let shift = 0;
    if (res > 0) {
      const free = (w - res) / w;
      halfH = Math.max(halfH0, halfW0 / free / aspect) * crop; halfW = halfH * aspect; shift = halfW * (1 - free);
    } else { halfW *= crop; halfH *= crop; }
    this.base = { cx: cx + shift, cy, halfW, halfH };   // the auto-fitted frame; the player's zoom / pan is layered on top of it
    this.applyView(true);
  }

  // ---------- player camera: drag to pan, wheel / pinch to zoom, both limited ----------
  // zoom 1 = the auto-fit frame. Pan is in view units (right / up on screen) and is clamped so the store can never leave the screen.
  panLimits() {
    const b = this.base || { halfW: 5, halfH: 5 }, z = this.zoomT;
    return { x: b.halfW * (Math.max(0, 1 - 1 / z) + 0.35), y: b.halfH * (Math.max(0, 1 - 1 / z) + 0.35) };
  }
  panBy(dxPx, dyPx) {   // screen pixels -> view units
    const c = this.camera, u = (c.right - c.left) / Math.max(1, this.w);
    this.panT.x -= dxPx * u; this.panT.y += dyPx * u; this.clampView();
  }
  zoomBy(f) { this.zoomT = Math.max(this.ZMIN, Math.min(this.ZMAX, this.zoomT * f)); this.clampView(); }
  resetView() { this.zoomT = 1; this.panT.x = this.panT.y = 0; }
  clampView() { const L = this.panLimits(); this.panT.x = Math.max(-L.x, Math.min(L.x, this.panT.x)); this.panT.y = Math.max(-L.y, Math.min(L.y, this.panT.y)); }
  applyView(snap = false) {
    if (!this.base) return;
    if (!this.panT) { this.panT = { x: 0, y: 0 }; this.pan = { x: 0, y: 0 }; this.zoomT = 1; this.zoom = 1; this.ZMIN = 0.8; this.ZMAX = 2.4; }
    if (snap) { this.zoom = this.zoomT; this.pan.x = this.panT.x; this.pan.y = this.panT.y; }
    const c = this.camera, b = this.base, hw = b.halfW / this.zoom, hh = b.halfH / this.zoom;
    c.left = b.cx - hw + this.pan.x; c.right = b.cx + hw + this.pan.x; c.top = b.cy + hh + this.pan.y; c.bottom = b.cy - hh + this.pan.y;
    c.updateProjectionMatrix();
  }
  stepView(dt) {   // ease towards the wanted zoom / pan
    if (!this.panT) return;
    const k = Math.min(1, dt * 14);
    if (Math.abs(this.zoom - this.zoomT) + Math.abs(this.pan.x - this.panT.x) + Math.abs(this.pan.y - this.panT.y) < 1e-4) return;
    this.zoom += (this.zoomT - this.zoom) * k; this.pan.x += (this.panT.x - this.pan.x) * k; this.pan.y += (this.panT.y - this.pan.y) * k;
    this.applyView();
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
    if (this.stat) { this.scene.remove(this.stat); this.stat.traverse(o => { if (o.userData.ownMats) for (const mt of o.userData.ownMats) { if (mt.map) mt.map.dispose(); mt.dispose(); } if (o.userData.ownGeo) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); }); }
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
  // ---------- one thick paving block: a real box, its top face carries a repeating flat-colour pattern ('check' or 'brick') ----------
  slab(S, mode, c1, c2, x0, x1, z0, z1, yTop, yBot, sideColor = 0x6f6c66) {
    const K = 16, cv = document.createElement('canvas'); cv.width = cv.height = K * 2; const c = cv.getContext('2d');
    if (mode === 'brick') paintBricks(c, K * 2, K * 2);
    else { c.fillStyle = c1; c.fillRect(0, 0, K * 2, K * 2); c.fillStyle = c2; c.fillRect(0, 0, K, K); c.fillRect(K, K, K, K); }
    const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set((x1 - x0) / 2, (z1 - z0) / 2);
    const top = new THREE.MeshToonMaterial({ map: t, gradientMap: this.gradient }), side = this.toon(sideColor);
    const m = new THREE.Mesh(this.box, [side, side, top, side, side, side]);   // box faces: +x -x +y -y +z -z  (index 2 = the top)
    m.scale.set(x1 - x0, yTop - yBot, z1 - z0); m.position.set((x0 + x1) / 2, (yTop + yBot) / 2, (z0 + z1) / 2);
    m.receiveShadow = true; m.userData.ownMats = [top]; S.add(m); return m;
  }
  // a street lamp as real parts: base, pole, head and a glowing bulb
  lampMesh(S, x, z) {
    this.part(S, this.cyl, 0x2b2b33, 0.12, 0.16, 0.12, x, 0.08, z);
    this.part(S, this.cyl, 0x2b2b33, 0.045, 1.9, 0.045, x, 0.95, z);
    this.part(S, this.box, 0x2b2b33, 0.3, 0.07, 0.3, x, 1.93, z);
    this.glow(S, 0xffe9a6, 0.22, 0.1, 0.22, x, 1.86, z);
  }

  // ---------- store shell: tiled floor, walls with real door openings, swinging glass doors, counter. Rebuilt from COLS/ROWS, so renovating grows everything ----------
  buildShell(game) {
    const S = new THREE.Group(), part = (...a) => this.part(S, ...a);
    const cs = game.counterSide, ds = game.doorSide;
    const L = wx(-0.5), R = wx(COLS - 0.5), Tt = wz(-0.5), B = wz(ROWS - 0.5);   // floor edges (from the live COLS/ROWS)
    this.doors = [];

    // ----- floor: one instanced 3D tile per cell (flat colours: checker + counter lane + door lane), grout below, a concrete plinth under the whole store -----
    const lane = (x, y) => (cs === 'right' && x === COLS - 1) || (cs === 'left' && x === 0) || (cs === 'top' && y === 0) ? 'counter'
      : (ds === 'left' && x === 0) || (ds === 'right' && x === COLS - 1) || (ds === 'bottom' && y === ROWS - 1) ? 'door' : '';
    const tiles = new THREE.InstancedMesh(this.box, this.toon(0xffffff), COLS * ROWS);
    { const m4 = new THREE.Matrix4(), col = new THREE.Color(); let n = 0;
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const l = lane(x, y), odd = (x + y) % 2;
        col.setHex(l === 'counter' ? (odd ? 0xc9bf9d : 0xbfb48f) : l === 'door' ? (odd ? 0xb8c4cc : 0xa9b6c0) : (odd ? 0xe7dfc6 : 0xd3caaa));
        m4.makeScale(0.98, 0.14, 0.98).setPosition(wx(x), -0.07, wz(y));
        tiles.setMatrixAt(n, m4); tiles.setColorAt(n, col); n++;
      }
      tiles.instanceMatrix.needsUpdate = true; if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true; }
    tiles.receiveShadow = true; tiles.frustumCulled = false; S.add(tiles);
    part(this.box, 0x8d8678, COLS, 0.1, ROWS, 0, -0.07, 0, false);                                   // grout between the tiles
    part(this.box, 0x7f8590, COLS + 3.4, 0.2, ROWS + 3.0, 0, -0.14, 0, false);                       // concrete plinth: the foundation under floor, counter and walls
    { const len = cs === 'top' ? COLS : ROWS;                                                       // hazard stripes along the inside edge of the counter lane
      for (let i = 0; i < len * 2; i++) {
        const along = i * 0.5 + 0.25 - len / 2, col = i % 2 ? 0xf2c94c : 0x33302e;
        if (cs === 'right') part(this.box, col, 0.08, 0.012, 0.5, R - 1 + 0.06, 0.006, along, false);
        else if (cs === 'left') part(this.box, col, 0.08, 0.012, 0.5, L + 1 - 0.06, 0.006, along, false);
        else part(this.box, col, 0.5, 0.012, 0.08, along, 0.006, Tt + 1 - 0.06, false);
      } }

    // ----- walls: real thick boxes with a blue skirting and a dark cap. The two walls the isometric camera looks at (right + front) stay low, the two behind (back + left) are tall -----
    const WALL = 0.5, DW = 1.3, DH = 1.3;
    const off = side => side === cs ? 1.45 : 0.25, H = side => (side === 'top' || side === 'left') ? 1.7 : 0.6;
    const xL = L - off('left'), xR = R + off('right'), zT = Tt - off('top');
    const zBt = B + 0.25, zA = zT + 0.25, zB = B + 0.5;
    const PAL = { wall: 0xf1e4c7, base: 0x4f6b8a, cap: 0x2b2a35, frame: 0x3a3d4a };
    const wallRun = (vertical, fixed, a0, a1, h, gaps) => {      // gaps = centres of the door openings along the wall
      const box = (u0, u1, y0, y1, t, color) => {
        const len = u1 - u0, hh = y1 - y0, uc = (u0 + u1) / 2; if (len <= 0.001) return;
        if (vertical) part(this.box, color, t, hh, len, fixed, y0 + hh / 2, uc, true); else part(this.box, color, len, hh, t, uc, y0 + hh / 2, fixed, true);
      };
      const gs = gaps.map(c => [c - DW / 2, c + DW / 2]).sort((p, q) => p[0] - q[0]), segs = []; let u = a0;
      for (const [g0, g1] of gs) { if (g0 > u) segs.push([u, g0]); u = Math.max(u, g1); }
      if (u < a1) segs.push([u, a1]);
      for (const [s0, s1] of segs) { box(s0, s1, 0, h, WALL, PAL.wall); box(s0, s1, 0, 0.22, WALL + 0.06, PAL.base); box(s0, s1, h, h + 0.07, WALL + 0.08, PAL.cap); }
      if (h > DH + 0.05) for (const [g0, g1] of gs) { box(g0, g1, DH, h, WALL, PAL.wall); box(g0, g1, h, h + 0.07, WALL + 0.08, PAL.cap); }   // wall above the doorway
    };
    const gapsFor = side => ds === side ? game.spawns.map(sp => side === 'bottom' ? wx(sp.x) : wz(sp.y)) : [];
    wallRun(true, xL, zA, zB, H('left'), gapsFor('left'));
    wallRun(true, xR, zA, zB, H('right'), gapsFor('right'));
    wallRun(false, zT, xL - 0.25, xR + 0.25, H('top'), []);
    if (ds === 'bottom') wallRun(false, zBt, xL - 0.25, xR + 0.25, H('bottom'), gapsFor('bottom'));
    // wall decoration: framed posters + windows on the back wall, posters on the left wall
    const PC = [0xff5a5f, 0xffcf4a, 0x5fe3a1, 0x6fa8ff, 0xff9f1c];
    for (let x = xL + 1.5, i = 0; x < xR - 1; x += 3.5, i++) {
      part(this.box, 0x3a3d4a, 1.1, 0.7, 0.04, x, 1.05, zT + 0.27, false); part(this.box, PC[i % 5], 0.95, 0.55, 0.05, x, 1.05, zT + 0.29, false);
      const wxp = x + 1.75;
      if (wxp < xR - 1.3) {   // a window through the back wall: dark frame, bright glass, cross bars
        part(this.box, 0x3a3d4a, 1.3, 0.85, WALL + 0.1, wxp, 1.0, zT, true); this.glow(S, 0x9ad7ff, 1.1, 0.65, WALL + 0.14, wxp, 1.0, zT);
        part(this.box, 0xf6f1e4, 0.06, 0.65, WALL + 0.16, wxp, 1.0, zT, false); part(this.box, 0xf6f1e4, 1.1, 0.06, WALL + 0.16, wxp, 1.0, zT, false);
      }
    }
    if (ds !== 'left') for (let z = zA + 1.5, i = 0; z < zB - 1.5; z += 3.5, i++) {
      part(this.box, 0x3a3d4a, 0.04, 0.7, 1.1, xL + 0.27, 1.05, z, false); part(this.box, PC[(i + 2) % 5], 0.05, 0.55, 0.95, xL + 0.29, 1.05, z, false);
    }

    // ----- doors: frame + two glass leaves hinged on the posts. They swing INWARDS when somebody walks up (animated in render) -----
    for (const sp of game.spawns) {
      part(this.box, 0x6e5f4a, 0.9, 0.03, 0.9, wx(sp.x), 0.02, wz(sp.y), false);   // doormat
      let px, pz, rot;
      if (ds === 'bottom') { px = wx(sp.x); pz = zBt; rot = 0; }
      else if (ds === 'left') { px = xL; pz = wz(sp.y); rot = -Math.PI / 2; }
      else { px = xR; pz = wz(sp.y); rot = Math.PI / 2; }
      const g = new THREE.Group(); g.position.set(px, 0, pz); g.rotation.y = rot; S.add(g);   // local x runs along the wall, local +z points OUT to the street
      const gp = (...a) => this.part(g, ...a);
      for (const sx of [-1, 1]) gp(this.box, PAL.frame, 0.12, DH, WALL + 0.12, sx * (DW / 2 - 0.06), DH / 2, 0, true);   // posts
      gp(this.box, PAL.frame, DW + 0.12, 0.16, WALL + 0.12, 0, DH, 0, true);                                             // lintel beam
      this.glow(g, sp.from > 1 ? 0xff9f1c : 0x5fe3a1, DW - 0.3, 0.05, WALL + 0.14, 0, DH + 0.105, 0);                    // glowing strip on top (orange = the second door)
      const glassMat = new THREE.MeshToonMaterial({ color: 0x9ad7ff, transparent: true, opacity: 0.55, gradientMap: this.gradient, depthWrite: false });
      const leaves = [-1, 1].map(side => {
        const hinge = new THREE.Group(); hinge.position.set(side * (DW / 2 - 0.1), 0.04, 0); g.add(hinge);
        const w = DW / 2 - 0.08, cx = -side * w / 2;
        this.part(hinge, this.box, 0x4a4d5a, w, 1.12, 0.06, cx, 0.58, 0, true);
        const glass = new THREE.Mesh(this.box, glassMat); glass.scale.set(w - 0.1, 0.96, 0.075); glass.position.set(cx, 0.6, 0); glass.userData.ownMats = [glassMat]; hinge.add(glass);
        this.part(hinge, this.box, 0xdedede, 0.04, 0.3, 0.12, -side * (w - 0.08), 0.6, 0, false);                           // handle
        return hinge;
      });
      this.doors.push({ sp, A: leaves[0], B: leaves[1], open: 0, force: 0 });
    }

    // ----- sidewalk outside the doors: a thick brick slab with a curb and two street lamps -----
    {
      const D = 2.6, xl = L - off('left'), xr = R + off('right');
      let x0, x1, z0, z1;
      if (ds === 'left') { x1 = xl - 0.25; x0 = x1 - D; z0 = zT - 0.25; z1 = B + 0.9; }
      else if (ds === 'right') { x0 = xr + 0.25; x1 = x0 + D; z0 = zT - 0.25; z1 = B + 0.9; }
      else { x0 = xl - 0.25; x1 = xr + 0.25; z0 = zBt + 0.25; z1 = z0 + D; }
      this.slab(S, 'brick', 0, 0, x0, x1, z0, z1, 0.03, -0.1, 0x8a7a64);
      if (ds === 'left') part(this.box, 0x6f6c66, 0.2, 0.09, z1 - z0, x0 + 0.1, 0.045, (z0 + z1) / 2, true);
      else if (ds === 'right') part(this.box, 0x6f6c66, 0.2, 0.09, z1 - z0, x1 - 0.1, 0.045, (z0 + z1) / 2, true);
      else part(this.box, 0x6f6c66, x1 - x0, 0.09, 0.2, (x0 + x1) / 2, 0.045, z1 - 0.1, true);
      if (ds === 'bottom') { const lz = z1 - 0.35; this.lampMesh(S, x0 + 0.8, lz); this.lampMesh(S, x1 - 0.8, lz); }
      else { const lx = ds === 'left' ? x0 + 0.35 : x1 - 0.35; this.lampMesh(S, lx, z0 + 0.8); this.lampMesh(S, lx, z1 - 0.9); }
    }

    // ----- the world around the store -----
    {
      const D = 2.6, xl = L - off('left'), xr = R + off('right');
      const curb = ds === 'left' ? xl - 0.25 - D : ds === 'right' ? xr + 0.25 + D : zBt + 0.25 + D;
      const a0 = ds === 'bottom' ? xl - 0.25 : zT - 0.25, a1 = ds === 'bottom' ? xr + 0.25 : B + 0.9;
      this.buildSurroundings(S, ds, curb, a0, a1, D, { xl, xr, zT, zB: B + 0.5 });
    }

    // ----- checkout counter + register + clerk, built once facing +x and turned onto its wall -----
    const len = cs === 'top' ? COLS : ROWS, cg = new THREE.Group(); S.add(cg);
    cg.position.set(cs === 'right' ? R : cs === 'left' ? L : 0, 0, cs === 'top' ? Tt : 0);
    cg.rotation.y = cs === 'left' ? Math.PI : cs === 'top' ? Math.PI / 2 : 0;
    const cp = (...a) => this.part(cg, ...a), ox = 0.45;
    const az = (game.counterPos - (len - 1) / 2) * (cs === 'left' ? -1 : 1);       // where the till cells sit along the wall
    cp(this.box, 0x2b2a35, 0.84, 0.12, len - 0.04, ox + 0.03, 0.06, 0, true);          // kick plate
    cp(this.box, 0x7a4b2b, 0.9, 0.76, len, ox, 0.5, 0, true);                          // cabinet
    for (let z = -len / 2 + 0.5; z < len / 2 - 0.3; z += 1) cp(this.box, 0x8f5d38, 0.04, 0.5, 0.7, ox - 0.46, 0.5, z, false);   // inset panels on the customer side
    cp(this.box, 0x3b2a20, 1.0, 0.03, len + 0.08, ox, 0.885, 0, true);                // dark trim under the top
    cp(this.box, 0xe9d8a6, 0.98, 0.08, len + 0.06, ox, 0.92, 0, true);                 // counter top (surface at y 0.96)
    cp(this.box, 0xdedede, 0.6, 0.35, 0.9, ox, 1.12, az, true);                        // register
    cp(this.box, 0x2d2d3a, 0.08, 0.28, 0.8, ox - 0.1, 1.45, az, true).rotation.z = 0.4;
    this.glow(cg, 0x3ddc84, 0.05, 0.1, 0.5, ox - 0.15, 1.46, az).rotation.z = 0.4;
    cp(this.box, 0x2d2d3a, 0.22, 0.04, 0.32, ox - 0.32, 0.99, az - 0.95, false);       // card reader
    cp(this.box, 0xffffff, 0.1, 0.12, 0.05, ox + 0.12, 1.36, az + 0.46, false);       // receipt coming out
    for (let i = 0; i < 4; i++) cp(this.box, [0xff5a5f, 0xffcf4a, 0x5fe3a1, 0x6fa8ff][i], 0.22, 0.14, 0.28, ox, 1.06, az - 1.8 + i * 0.4, true);   // candy rack
    const clerk = new THREE.Group(); clerk.position.set(ox + 0.05, 0.9, az + 1.6); clerk.rotation.y = -Math.PI / 2; cg.add(clerk);
    this.part(clerk, this.box, 0x3a7bd5, 0.34, 0.4, 0.22, 0, 0.35, 0, true);
    this.part(clerk, this.box, 0xf1c9a0, 0.24, 0.22, 0.22, 0, 0.68, 0, true);
    this.part(clerk, this.box, 0xd9534f, 0.28, 0.07, 0.26, 0, 0.82, 0.01, false);
    // ----- money stack: bricks of cash piled on the counter next to the register, growing with the player's cash -----
    this.money = new THREE.Group(); cg.add(this.money); this.moneyN = -1; this.moneyPop = 0; this.moneyOx = ox;
    this.moneySlots = [az + 0.72, az + 1.05, az - 2.25, az - 2.62, az + 2.15].filter(z => Math.abs(z) < len / 2 - 0.25);
    return { group: S, clerk };
  }

  // ---------- the world around the store: every piece is a real 3D mesh (merged per colour, casting and receiving shadows): grass, paving slabs, highway + traffic,
  // low-poly trees and bushes, lamps, benches, and houses / shops with roofs, framed windows, doors and awnings ----------
  buildSurroundings(S, ds, curb, a0, a1, D, rect) {
    const rnd = (() => { let a = 20260611; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
    const pick = arr => arr[Math.floor(rnd() * arr.length)];
    const hz = ds === 'bottom', sgn = ds === 'left' ? -1 : 1, EXT = 80;
    // street frame: u runs ALONG the street, v runs outward from the footpath's curb edge (v < 0 = footpath / store side)
    const W = (u, v) => hz ? [u, curb + v] : [curb + sgn * v, u];
    const pushed = new Map(), Q = new THREE.Quaternion(), E = new THREE.Euler(), SC = new THREE.Vector3(), PP = new THREE.Vector3();
    const addG = (color, geo, sx, sy, sz, x, y, z, ry = 0, rx = 0, rz = 0) => {
      E.set(rx, ry, rz); Q.setFromEuler(E);
      const m = new THREE.Matrix4().compose(PP.set(x, y, z), Q, SC.set(sx, sy, sz));
      let l = pushed.get(color); if (!l) pushed.set(color, l = []); l.push([geo, m]);
    };
    const add = (color, sx, sy, sz, x, y, z) => addG(color, this.box, sx, sy, sz, x, y, z);
    const bx = (color, du, h, dv, u, y, v) => { const [x, z] = W(u, v); add(color, hz ? du : dv, h, hz ? dv : du, x, y, z); };
    const gx = (color, geo, du, h, dv, u, y, v) => { const [x, z] = W(u, v); addG(color, geo, hz ? du : dv, h, hz ? dv : du, x, y, z); };
    const flat = g => { const f = g.index ? g.toNonIndexed() : g; f.computeVertexNormals(); return f; };   // faceted low-poly normals = flat colour faces
    const cylF = flat(new THREE.CylinderGeometry(1, 1, 1, 8)), coneF = flat(new THREE.ConeGeometry(1, 1, 6)), icoG = new THREE.IcosahedronGeometry(1, 0);
    const roofG = (() => { const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4); g.rotateY(Math.PI / 4); return flat(g); })();   // square pyramid, 1 x 1 footprint
    const lampAt = (u, v) => { const [x, z] = W(u, v); addG(0x2b2b33, cylF, 0.12, 0.16, 0.12, x, 0.08, z); addG(0x2b2b33, cylF, 0.045, 1.9, 0.045, x, 0.95, z); add(0x2b2b33, 0.3, 0.07, 0.3, x, 1.93, z); this.glow(S, 0xffe9a6, 0.22, 0.1, 0.22, x, 1.86, z); };
    const strip = (mode, c1, c2, u0, u1, v0, v1, yTop, yBot, side) => {
      const [xa, za] = W(u0, v0), [xb, zb] = W(u1, v1);
      return this.slab(S, mode, c1, c2, Math.min(xa, xb), Math.max(xa, xb), Math.min(za, zb), Math.max(za, zb), yTop, yBot, side);
    };
    const RW = 6.4, solid = [];   // solid = building footprints in street coordinates [u0, u1, v0, v1] (trees keep out of them)

    // ----- ground + brick pathway along the whole street, and a garden path around the other three sides of the store -----
    this.slab(S, 'check', '#5aa84a', '#52a044', -EXT, EXT, -EXT, EXT, -0.06, -1.2, 0x3f7a35);
    strip('brick', 0, 0, -EXT, a0, -D, 0, 0.03, -0.1, 0x8a7a64); strip('brick', 0, 0, a1, EXT, -D, 0, 0.03, -0.1, 0x8a7a64);
    if (rect) {
      const g1 = 0.4, g2 = 1.7, { xl, xr, zT, zB } = rect;
      for (const sd of ['left', 'right', 'top', 'bottom']) {
        if (sd === ds) continue;
        if (sd === 'left') this.slab(S, 'brick', 0, 0, xl - g2, xl - g1, zT - g2, zB + g2, 0.02, -0.1, 0x8a7a64);
        else if (sd === 'right') this.slab(S, 'brick', 0, 0, xr + g1, xr + g2, zT - g2, zB + g2, 0.02, -0.1, 0x8a7a64);
        else if (sd === 'top') this.slab(S, 'brick', 0, 0, xl - g2, xr + g2, zT - g2, zT - g1, 0.02, -0.1, 0x8a7a64);
        else this.slab(S, 'brick', 0, 0, xl - g2, xr + g2, zB + g1, zB + g2, 0.02, -0.1, 0x8a7a64);
      }
    }
    bx(0x6f6c66, EXT * 2, 0.09, 0.2, 0, 0.045, 0.0);                                  // curb
    // ----- the highway: a sunken asphalt slab with lane markings and zebra crossings -----
    strip('check', '#3d3f49', '#3a3c46', -EXT, EXT, 0, RW, 0.006, -0.2, 0x2d2f38);
    bx(0xdddddd, EXT * 2, 0.02, 0.09, 0, 0.016, 0.35); bx(0xdddddd, EXT * 2, 0.02, 0.09, 0, 0.016, RW - 0.35);
    bx(0xe6c84a, EXT * 2, 0.02, 0.08, 0, 0.016, RW / 2 - 0.1); bx(0xe6c84a, EXT * 2, 0.02, 0.08, 0, 0.016, RW / 2 + 0.1);
    for (let u = -EXT; u < EXT; u += 2.4) { bx(0xdddddd, 1.2, 0.02, 0.07, u, 0.016, RW * 0.25); bx(0xdddddd, 1.2, 0.02, 0.07, u, 0.016, RW * 0.75); }
    for (const cu of [a1 + 7, a0 - 7]) for (let i = 0; i < 6; i++) bx(0xe9e9e9, 0.5, 0.02, RW - 1.2, cu + i * 0.95, 0.016, RW / 2);   // zebra crossings
    strip('brick', 0, 0, -EXT, EXT, RW, RW + 2.4, 0.03, -0.1, 0x8a7a64);                // far footpath
    bx(0x6f6c66, EXT * 2, 0.09, 0.2, 0, 0.045, RW);

    // ----- street furniture: lamps, benches, bins, hydrants, mailboxes -----
    for (let u = -EXT + 4; u < EXT; u += 9) { if (u > a0 - 1.5 && u < a1 + 1.5) continue; lampAt(u, -0.45); }
    for (let u = -EXT + 2; u < EXT; u += 9) lampAt(u, RW + 0.6);
    const bench = (u, v, face) => {        // face = +1 looks towards the road, -1 away from it
      bx(0x8a5a32, 1.3, 0.1, 0.45, u, 0.45, v); bx(0x8a5a32, 1.3, 0.4, 0.08, u, 0.72, v - face * 0.22);
      bx(0x2b2b33, 0.08, 0.4, 0.4, u - 0.5, 0.2, v); bx(0x2b2b33, 0.08, 0.4, 0.4, u + 0.5, 0.2, v);
    };
    const bin = (u, v) => { const [x, z] = W(u, v); addG(0x3a6b4a, cylF, 0.2, 0.55, 0.2, x, 0.28, z); addG(0x2b4d36, cylF, 0.23, 0.07, 0.23, x, 0.58, z); };
    const hydrant = (u, v) => { const [x, z] = W(u, v); addG(0xd62828, cylF, 0.12, 0.4, 0.12, x, 0.2, z); addG(0xd62828, cylF, 0.09, 0.1, 0.09, x, 0.45, z); add(0xd62828, 0.34, 0.07, 0.07, x, 0.3, z); };
    const mail = (u, v) => { bx(0x3a86e8, 0.4, 0.5, 0.3, u, 0.85, v); bx(0x2b2b33, 0.08, 0.7, 0.08, u, 0.35, v); bx(0xffffff, 0.2, 0.04, 0.32, u, 0.97, v); };
    for (let u = -EXT + 12; u < EXT; u += 15) { if (u > a0 - 3 && u < a1 + 3) continue; bench(u, -1.2, 1); bin(u + 2.2, -1.0); }
    for (let u = -EXT + 8; u < EXT; u += 17) { bench(u, RW + 1.7, -1); bin(u + 2.2, RW + 1.5); }
    for (let u = -EXT + 20; u < EXT; u += 31) { if (u > a0 - 3 && u < a1 + 3) continue; hydrant(u, -0.7); mail(u + 6, -0.8); }

    // ----- buildings: shops across the street, neighbours either side of the store, and a row behind it -----
    const AW = [0xe8473f, 0x3a86e8, 0x2fbf71, 0xf2c94c, 0xff8a3d], WALLC = [0xe8c8a0, 0xc9a3d4, 0x9fd0e8, 0xf0b6a8, 0xd9d49a, 0xa8d8b8, 0xf2e6c8], ROOF = [0x9b4a3a, 0x4b3f8f, 0x3f6e8f, 0x7a5a3a, 0x5a7a4a];
    const TRIM = 0xf6f1e4;
    const building = (u, v, du, dv, h, facing, shop) => {     // facing = -1: front is on the low-v side, +1: on the high-v side
      solid.push([u - du / 2, u + du / 2, v - dv / 2, v + dv / 2]);
      const wall = pick(WALLC), roofC = pick(ROOF), fr = v + facing * (dv / 2 + 0.03);
      bx(wall, du, h, dv, u, h / 2, v);
      bx(0x6e675c, du + 0.12, 0.3, dv + 0.12, u, 0.15, v);                                   // stone plinth
      bx(TRIM, du + 0.06, 0.1, dv + 0.06, u, h - 0.05, v);                                    // eave band
      if (rnd() < 0.55) {                                                                     // hip roof + chimney
        const rh = 0.9 + rnd() * 0.7; gx(roofC, roofG, du + 0.5, rh, dv + 0.5, u, h + rh / 2, v);
        if (rnd() < 0.6) { bx(0x8a5a4a, 0.34, rh * 0.8 + 0.4, 0.34, u + du * 0.25, h + (rh * 0.8 + 0.4) / 2 + 0.2, v + dv * 0.12); bx(0x5a3a30, 0.44, 0.08, 0.44, u + du * 0.25, h + rh * 0.8 + 0.6, v + dv * 0.12); }
      } else {                                                                                // flat roof: slab, parapet, air-con unit, water tank
        bx(roofC, du + 0.2, 0.18, dv + 0.2, u, h + 0.09, v);
        bx(TRIM, du + 0.2, 0.22, 0.1, u, h + 0.29, v + dv / 2 + 0.05); bx(TRIM, du + 0.2, 0.22, 0.1, u, h + 0.29, v - dv / 2 - 0.05);
        bx(TRIM, 0.1, 0.22, dv + 0.2, u + du / 2 + 0.05, h + 0.29, v); bx(TRIM, 0.1, 0.22, dv + 0.2, u - du / 2 - 0.05, h + 0.29, v);
        bx(0xb7bcc6, 0.8, 0.4, 0.6, u - du * 0.2, h + 0.38, v); bx(0x8a909c, 0.6, 0.06, 0.45, u - du * 0.2, h + 0.61, v);
        if (rnd() < 0.5) { const [x, z] = W(u + du * 0.22, v); addG(0x8a5a32, cylF, 0.3, 0.5, 0.3, x, h + 0.45, z); addG(0x5a3a22, coneF, 0.34, 0.25, 0.34, x, h + 0.82, z); }
      }
      for (let k = 0; k < Math.floor(du / 1.6); k++) for (let r = 0; r < Math.floor((h - 1.4) / 1.1); r++) {   // framed windows with sills and a mullion
        const wu = u - du / 2 + 0.9 + k * 1.6, wy = 1.9 + r * 1.1;
        bx(TRIM, 0.74, 0.74, 0.1, wu, wy, fr); bx(0x6ab8f0, 0.58, 0.58, 0.13, wu, wy, fr + facing * 0.01); bx(TRIM, 0.05, 0.58, 0.16, wu, wy, fr + facing * 0.02); bx(TRIM, 0.86, 0.07, 0.22, wu, wy - 0.4, fr + facing * 0.07);
      }
      if (shop) {
        const aw = pick(AW), aV = v + facing * (dv / 2 + 0.38), aw0 = du * 0.8;
        for (let k = 0; k < Math.floor(aw0 / 0.4); k++) { const su = u - aw0 / 2 + 0.2 + k * 0.4; bx(k % 2 ? 0xffffff : aw, 0.4, 0.08, 0.76, su, 1.64, aV); bx(k % 2 ? 0xffffff : aw, 0.4, 0.22, 0.06, su, 1.52, aV + facing * 0.38); }   // striped awning with a valance
        bx(0x2b2b33, 0.06, 1.5, 0.06, u - aw0 / 2 + 0.1, 0.75, aV + facing * 0.34); bx(0x2b2b33, 0.06, 1.5, 0.06, u + aw0 / 2 - 0.1, 0.75, aV + facing * 0.34);
        bx(TRIM, 0.96, 1.28, 0.06, u - du * 0.2, 0.64, fr); bx(0x5b3a22, 0.8, 1.2, 0.09, u - du * 0.2, 0.6, fr + facing * 0.02); bx(0xe6c84a, 0.07, 0.07, 0.14, u - du * 0.2 + 0.28, 0.6, fr + facing * 0.04);   // door
        bx(TRIM, 1.26, 0.86, 0.06, u + du * 0.18, 0.85, fr); bx(0x9ccfff, 1.1, 0.7, 0.09, u + du * 0.18, 0.85, fr + facing * 0.02);                                                                         // shop window
        bx(aw, du * 0.5, 0.3, 0.1, u, h - 0.45, fr + facing * 0.03); bx(0xffffff, du * 0.3, 0.07, 0.12, u, h - 0.45, fr + facing * 0.04);                                                                        // sign
      }
    };
    for (let u = -EXT + 6; u < EXT - 4;) {                      // across the street
      const du = 4 + rnd() * 3.4, dv = 3 + rnd() * 1.6;
      if (rnd() < 0.85) building(u + du / 2, RW + 2.4 + 3.2 + dv / 2, du, dv, 2.6 + rnd() * 2.6, -1, rnd() < 0.6);
      u += du + 0.6 + rnd() * 1.4;
    }
    const sideV = dv => -D - 0.8 - dv / 2;                      // neighbours either side of the store, right behind the footpath
    for (const dir of [-1, 1]) for (let u = dir < 0 ? a0 - 3.5 : a1 + 3.5, i = 0; i < 12; i++) {
      const du = 4 + rnd() * 3, dv = 4 + rnd() * 2;
      building(u + dir * du / 2, sideV(dv), du, dv, 2.6 + rnd() * 2.4, 1, rnd() < 0.7);
      u += dir * (du + 0.5 + rnd() * 1.5);
    }
    const back = -D - Math.max(6, rect ? (hz ? (rect.zB - rect.zT) : (rect.xr - rect.xl)) + 0.8 : 12);   // a row of houses behind the store
    for (let u = -EXT + 6; u < EXT - 4;) {
      const du = 4 + rnd() * 3, dv = 4 + rnd() * 2;
      if (rnd() < 0.8) building(u + du / 2, back - 3.4 - dv / 2, du, dv, 2.2 + rnd() * 2.2, 1, rnd() < 0.35);
      u += du + 1 + rnd() * 2.4;
    }

    // ----- low-poly trees and bushes on whatever grass is left -----
    const placed = [], hw = COLS / 2 + 3, hh = ROWS / 2 + 3;
    const free = (x, z) => {
      if (Math.abs(x) < hw && Math.abs(z) < hh) return false;                               // the store + its garden path
      const u = hz ? x : z, v = hz ? z - curb : sgn * (x - curb);
      if (v > -D - 0.8 && v < RW + 2.4 + 8.5) return false;                                 // footpaths, road, shops across the street
      if (solid.some(([u0, u1, v0, v1]) => u > u0 - 1.2 && u < u1 + 1.2 && v > v0 - 1.2 && v < v1 + 1.2)) return false;
      return placed.every(([px, pz, r]) => Math.hypot(px - x, pz - z) > r + 1.4);
    };
    const tree = (x, z, s, kind) => {
      const a = rnd() * 6.28;
      if (kind === 0) {          // round tree: trunk + two faceted crowns
        addG(0x7a4a2a, cylF, 0.15 * s, 0.9 * s, 0.15 * s, x, 0.45 * s, z);
        addG(0x2f8f46, icoG, 0.95 * s, 0.8 * s, 0.95 * s, x, 1.5 * s, z, a); addG(0x43b05a, icoG, 0.65 * s, 0.6 * s, 0.65 * s, x, 2.15 * s, z, a + 1);
      } else if (kind === 1) {   // pine: trunk + three stacked cones
        addG(0x6b4226, cylF, 0.13 * s, 0.7 * s, 0.13 * s, x, 0.35 * s, z);
        addG(0x23743a, coneF, 0.95 * s, 0.9 * s, 0.95 * s, x, 1.05 * s, z, a); addG(0x2c8a46, coneF, 0.72 * s, 0.8 * s, 0.72 * s, x, 1.65 * s, z, a); addG(0x3aa257, coneF, 0.48 * s, 0.7 * s, 0.48 * s, x, 2.2 * s, z, a);
      } else {                   // bush with a flower
        addG(0x2f9a4c, icoG, 0.55 * s, 0.4 * s, 0.55 * s, x, 0.3 * s, z, a); addG(0x45b862, icoG, 0.38 * s, 0.3 * s, 0.38 * s, x + 0.25 * s, 0.38 * s, z + 0.1 * s, a);
        if (rnd() < 0.5) addG(0xff7a9a, icoG, 0.08, 0.08, 0.08, x + 0.15, 0.62 * s, z + 0.3);
      }
    };
    for (let i = 0, tries = 0; i < 70 && tries < 1500; tries++) {
      const R = Math.pow(rnd(), 0.65) * 46 + 4, an = rnd() * Math.PI * 2, x = Math.cos(an) * R * 1.15, z = Math.sin(an) * R;
      if (!free(x, z)) continue;
      const kind = rnd() < 0.3 ? 2 : rnd() < 0.5 ? 1 : 0, s = 0.8 + rnd() * 0.6;
      tree(x, z, s, kind); placed.push([x, z, kind === 2 ? 0.5 : 0.9 * s]); i++;
    }

    // ----- traffic: cars and a bus drive along the road, one lane each way (real parts: body, cabin, glass, cylinder wheels, lights) -----
    this.cars = [];
    for (let i = 0; i < 7; i++) {
      const dir = i % 2 ? 1 : -1, g = new THREE.Group(), bus = i === 3;
      const col = pick([0xe8473f, 0x3a86e8, 0xf2c94c, 0x5fd08a, 0xf2f2f2, 0xff8a3d, 0x9b6be8]), body = bus ? 0xf2c94c : col;
      const L = bus ? 2.6 : 1.5, pp = (geo, c, sx, sy, sz, x, y, z) => this.part(g, geo, c, sx, sy, sz, x, y, z, true);
      pp(this.box, body, L, 0.34, 0.8, 0, 0.32, 0);                                                   // chassis
      if (bus) { pp(this.box, body, L - 0.1, 0.5, 0.78, 0, 0.78, 0); pp(this.box, 0x2a3340, L - 0.3, 0.26, 0.8, 0, 0.84, 0); pp(this.box, 0xdddddd, L - 0.1, 0.05, 0.8, 0, 1.05, 0); }
      else { pp(this.box, body, 0.82, 0.3, 0.72, -0.05, 0.62, 0); pp(this.box, 0x2a3340, 0.6, 0.2, 0.74, 0.0, 0.64, 0); pp(this.box, body, 0.84, 0.04, 0.72, -0.05, 0.79, 0); }
      for (const [wxp, wzp] of [[L * 0.3, 0.4], [L * 0.3, -0.4], [-L * 0.3, 0.4], [-L * 0.3, -0.4]]) {
        pp(this.cyl, 0x16161c, 0.17, 0.12, 0.17, wxp, 0.17, wzp).rotation.x = Math.PI / 2;
        pp(this.cyl, 0xcfd3dc, 0.09, 0.13, 0.09, wxp, 0.17, wzp).rotation.x = Math.PI / 2;
      }
      this.glow(g, 0xfff3b0, 0.06, 0.12, 0.2, L / 2, 0.4, 0.26); this.glow(g, 0xfff3b0, 0.06, 0.12, 0.2, L / 2, 0.4, -0.26);
      this.glow(g, 0xff3b3b, 0.06, 0.12, 0.2, -L / 2, 0.4, 0.26); this.glow(g, 0xff3b3b, 0.06, 0.12, 0.2, -L / 2, 0.4, -0.26);
      const v = dir > 0 ? RW * 0.75 : RW * 0.25;
      g.rotation.y = hz ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      S.add(g); this.cars.push({ g, dir, v, u: -EXT + rnd() * EXT * 2, sp: bus ? 2.4 + rnd() : 3 + rnd() * 3 });
    }

    // ----- merge every static piece of scenery into ONE mesh per colour (a handful of draw calls), shadows on -----
    const nm = new THREE.Matrix3(), tv = new THREE.Vector3();
    for (const [color, list] of pushed) {
      let nv = 0, ni = 0;
      for (const [geo] of list) { const c = geo.attributes.position.count; nv += c; ni += geo.index ? geo.index.count : c; }
      const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), I = new Uint32Array(ni);
      let vo = 0, io = 0;
      for (const [geo, mat] of list) {
        const pos = geo.attributes.position, nor = geo.attributes.normal, cnt = pos.count; nm.getNormalMatrix(mat);
        for (let i = 0; i < cnt; i++) {
          tv.fromBufferAttribute(pos, i).applyMatrix4(mat); P[(vo + i) * 3] = tv.x; P[(vo + i) * 3 + 1] = tv.y; P[(vo + i) * 3 + 2] = tv.z;
          tv.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); N[(vo + i) * 3] = tv.x; N[(vo + i) * 3 + 1] = tv.y; N[(vo + i) * 3 + 2] = tv.z;
        }
        if (geo.index) for (let i = 0; i < geo.index.count; i++) I[io++] = geo.index.getX(i) + vo; else for (let i = 0; i < cnt; i++) I[io++] = vo + i;
        vo += cnt;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setIndex(new THREE.BufferAttribute(I, 1));
      const m = new THREE.Mesh(g, this.toon(color)); m.userData.ownGeo = true; m.castShadow = true; m.receiveShadow = true; S.add(m);
    }
    for (const g of [cylF, coneF, icoG, roofG]) g.dispose();
    this.envW = W; this.envEXT = EXT; this.trafficTick(0);
  }
  trafficTick(dt) {
    if (!this.cars || !this.envW) return;
    for (const c of this.cars) {
      c.u += c.dir * c.sp * dt; if (c.u > this.envEXT) c.u = -this.envEXT; else if (c.u < -this.envEXT) c.u = this.envEXT;
      const [x, z] = this.envW(c.u, c.v); c.g.position.set(x, 0, z);
    }
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
    this.trafficTick(dt);
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
    const half = Math.max(COLS, ROWS) / 2 + 8, sun = this.sun, sc = sun.shadow.camera;
    if (sc.right !== half) {
      sc.left = -half; sc.right = half; sc.top = half + 1; sc.bottom = -half - 1; sc.updateProjectionMatrix();
      const size = half > 14 ? 4096 : 2048;
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
    else if (type === 'icecubes') obj = makeIceDrop(this, { icon: true });
    else if (type === 'bananas') obj = makeBananaCrate(this);
    else if (type === 'burger') { obj = makeBigBurger(this, { icon: true }); obj.scale.setScalar(0.4); }
    else if (type === 'goldapple') { obj = makeGoldApple(this, { icon: true }); obj.scale.setScalar(1.35); obj.userData.apple.position.y = 0.1; }
    else if (ITEMS[type] && ITEMS[type].kind === 'shelf') {   // steel shelf, fruit shelf, soda statue, fence
      obj = makeItem(this, { type, id: 1, dir: 'y', v: 0 });
      if (obj.userData.setGoods) obj.userData.setGoods(this, obj, ITEMS[type].cap);
      if (type === 'fruit') obj.rotation.y = Math.PI / 2;
    } else obj = type === 'coffee' ? makeCoffee(this, { type, id: 1, level: 1 }) : type === 'noodle' ? makeNoodle(this, { type, id: 1, level: 1 }) : type === 'eggtray' ? makeEggtray(this, { type, id: 1, level: 1 }) : makeItem(this, { type, id: 1, level: 1 });
    if (type === 'fridge') obj.scale.setScalar(0.78);
    else if (type === 'water' || type === 'cereal') obj.scale.setScalar(0.62);
    else if (type === 'tissue') obj.scale.setScalar(0.78);
    else if (type === 'steel') obj.scale.setScalar(0.5);
    else if (type === 'statue') obj.scale.setScalar(0.42);
    obj.position.set(0, 0, 0); scene.add(obj);
    const cam = new THREE.OrthographicCamera(-0.98, 0.98, 0.98, -0.98, 0.1, 20);
    cam.position.set(2.4, 2.5, 3.0); cam.lookAt(0, type === 'mop' ? 0.35 : type === 'shakecola' || type === 'cigs' || type === 'icecubes' || type === 'bananas' || type === 'burger' || type === 'goldapple' ? 0.36 : type === 'cans' || type === 'gum' || type === 'atm' ? 0.65 : 0.5, 0);
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

  // ---------- skill models + grid effects ----------
  makeSkillModel(s) {
    if (s.type === 'cigs') return makeCigPack(this, 1);
    if (s.type === 'bananas') return makeBananaCrate(this);
    if (s.type === 'goldapple') return makeGoldApple(this, { blast: true });
    if (s.type === 'burger') {   // lands on top of whatever stands on the cell
      const g = this.game, it = g.towerAt(s.x, s.y) || g.shelfAt(s.x, s.y), mm = it && it.type !== 'burgerwall' && this.meshes.get(it.id);
      let landY = 0; if (mm && mm.group) landY = Math.min(1.8, Math.max(0, new THREE.Box3().setFromObject(mm.group).max.y));
      return makeBigBurger(this, { landY });
    }
    if (s.type === 'icecubes') {   // lands on top of whatever stands on the cell
      const g = this.game, it = g.towerAt(s.x, s.y) || g.shelfAt(s.x, s.y), mm = it && this.meshes.get(it.id);
      let landY = 0; if (mm && mm.group) landY = Math.min(1.8, Math.max(0, new THREE.Box3().setFromObject(mm.group).max.y));
      return makeIceDrop(this, { landY });
    }
    return makeShakenCola(this, 1, ITEMS.shakecola.radius);
  }
  animSkill(s, m, time) {
    if (s.type === 'cigs') animCigPack(m.group, s, time, this);
    else if (s.type === 'icecubes') animIceDrop(m.group, s, time, this, ITEMS.icecubes);
    else if (s.type === 'bananas') animBananaCrate(m.group, s, time, this, ITEMS.bananas);
    else if (s.type === 'burger') animBigBurger(m.group, s, time, this, ITEMS.burger);
    else if (s.type === 'goldapple') animGoldApple(m.group, s, time);
    else animShakenCola(m.group, s, time, this);
  }
  later(delay, fn) { (this.sched ||= []).push({ t: delay, fn }); }
  // a flat tile-sized stain stuck to one grid cell; shrinks away like the other floor decals
  cellStain(cx, cy, color, life = 2.6, size = 0.92, y = 0.052) {
    const m = new THREE.Mesh(this.box, this.basic(color)); m.scale.set(size, 0.01, size); m.position.set(wx(cx), y, wz(cy)); m.castShadow = false; this.scene.add(m);
    this.fx.push({ decal: true, m, sx: size, sz: size, life, t: 0 });
  }
  // the shaken bottle erupts: every grid cell in reach gets splashed, rippling outwards, and fizz jets run along 8 lanes leaving a trail of splashes
  colaGridSplash(d) {
    const rc = Math.ceil(d.r), cx0 = Math.round(d.x), cy0 = Math.round(d.y), pal = [0x4a2616, 0x6b3a22, 0x8a4b2a], inside = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
    for (let i = -rc; i <= rc; i++) for (let j = -rc; j <= rc; j++) {
      const dist = Math.hypot(i, j), cx = cx0 + i, cy = cy0 + j;
      if (dist > d.r + 0.3 || !inside(cx, cy)) continue;
      this.later(dist * 0.07, () => {
        this.cellStain(cx, cy, pal[Math.abs(i * 3 + j * 5) % 3], d.time, 0.94);
        for (let k = 0; k < 4; k++) {   // foam bubbles stuck in the puddle
          const s = 0.06 + Math.random() * 0.1, b = new THREE.Mesh(this.cyl, this.basic(k % 2 ? 0xc98a5a : 0xffffff)); b.scale.set(s, 0.01, s); b.castShadow = false;
          b.position.set(wx(cx) + (Math.random() - 0.5) * 0.7, 0.058 + k * 0.001, wz(cy) + (Math.random() - 0.5) * 0.7); this.scene.add(b);
          this.fx.push({ decal: true, m: b, sx: s, sz: s, life: d.time * (0.5 + Math.random() * 0.5), t: 0 });
        }
        this.burst(cx, cy, 0.12, 0xffffff, 3, 1.6, 0.8); this.burst(cx, cy, 0.15, 0xc98a5a, 2, 1.8, 0.9);
        if ((i + j) % 2 === 0) for (let n = 0; n < 5; n++) this.trailDrop(wx(cx), 0.1 + n * 0.14, wz(cy), COLA_PAL, 3, 1.1);   // little fizz geyser
      });
    }
    for (let k = 0; k < 8; k++) {
      const dx = Math.round(Math.cos(k * Math.PI / 4)), dy = Math.round(Math.sin(k * Math.PI / 4));
      for (let st = 1; st <= rc + 1; st++) this.later(0.04 + st * 0.08, () => {
        const x = cx0 + dx * st, y = cy0 + dy * st; if (!inside(x, y)) return;
        this.cellStain(x, y, 0x3b1f14, d.time * 0.7, 0.55, 0.054);
        for (let n = 0; n < 6; n++) this.trailDrop(wx(x), 0.15 + Math.random() * 0.8, wz(y), COLA_PAL, 4, 1.25);
        this.puff(x, y, 0.15, 0xffffff, 0.6, 0.9, 0.45);
      });
    }
  }
  // soda / cola hit: the cells in reach get splashed one after another (grid style, like the skill items), with foam and little fizz geysers
  gridSplash(d, pal, foam, dropPal, life = 1.3) {
    const cx0 = Math.round(d.x), cy0 = Math.round(d.y), rc = Math.ceil(d.r + 0.5), inside = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
    for (let i = -rc; i <= rc; i++) for (let j = -rc; j <= rc; j++) {
      const dist = Math.hypot(i, j), cx = cx0 + i, cy = cy0 + j;
      if (dist > d.r + 0.5 || !inside(cx, cy)) continue;
      this.later(dist * 0.06, () => {
        this.cellStain(cx, cy, pal[Math.abs(i * 3 + j * 5) % pal.length], life, 0.94);
        this.cellStain(cx, cy, foam[0], life * 0.6, 0.5, 0.056);
        for (let k = 0; k < 3; k++) {   // foam bubbles stuck in the puddle
          const s2 = 0.05 + Math.random() * 0.09, b = new THREE.Mesh(this.cyl, this.basic(foam[k % foam.length])); b.scale.set(s2, 0.01, s2); b.castShadow = false;
          b.position.set(wx(cx) + (Math.random() - 0.5) * 0.7, 0.058 + k * 0.001, wz(cy) + (Math.random() - 0.5) * 0.7); this.scene.add(b);
          this.fx.push({ decal: true, m: b, sx: s2, sz: s2, life: life * (0.5 + Math.random() * 0.5), t: 0 });
        }
        this.burst(cx, cy, 0.12, foam[0], 3, 1.6, 0.8); this.burst(cx, cy, 0.15, pal[1 % pal.length], 2, 1.8, 0.9);
        if ((i + j) % 2 === 0) for (let n = 0; n < 4; n++) this.trailDrop(wx(cx), 0.1 + n * 0.14, wz(cy), dropPal, 3, 1.0);   // little fizz geyser
      });
    }
    this.puff(d.x, d.y, 0.2, 0xffffff, 0.8, 0.8, 0.5);
  }
  // the giant burger lands: a thud, ketchup and mustard splash over the 3x3 and the cells around it
  burgerLandFx(d) {
    const cx0 = Math.round(d.x), cy0 = Math.round(d.y), h = Math.floor(d.size / 2) + 1, inside = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
    this.ringFx(d.x, d.y, d.size * 0.85, 0xffb347); this.ringFx(d.x, d.y, d.size * 0.5, 0xffffff);
    this.burst(d.x, d.y, 0.3, 0xd2231a, 14, 3.4, 1.3); this.burst(d.x, d.y, 0.3, 0xffc833, 8, 3, 1.2); this.burst(d.x, d.y, 0.3, 0xd9963a, 6, 2.6, 1);
    for (let i = 0; i < 4; i++) this.puff(d.x, d.y, 0.2, 0xf3e6c8, 1.4, 0.5, 0.6);
    this.splat(d.x, d.y, d.size * 0.9, 0xd2231a);
    for (let i = -h; i <= h; i++) for (let j = -h; j <= h; j++) {
      const cx = cx0 + i, cy = cy0 + j, dist = Math.hypot(i, j); if (!inside(cx, cy) || dist > h + 0.3) continue;
      this.later(dist * 0.05, () => { this.cellStain(cx, cy, (i + j) % 2 ? 0xd2231a : 0xffc833, 3.2, 0.55 + 0.3 * Math.random(), 0.052); this.burst(cx, cy, 0.15, (i + j) % 2 ? 0xd2231a : 0xffc833, 2, 1.6, 0.8); });
    }
    this.shake = Math.max(this.shake || 0, 0.35);
  }
  // Golden Apple bursts: the cola eruption in gold. Every cell of the 3x3 gets a golden splash rippling out from the middle, and gold jets run along 8 lanes.
  goldBlastFx(d) {
    const h = Math.floor(d.size / 2), cx0 = Math.round(d.x), cy0 = Math.round(d.y), pal = [0xffc83a, 0xffe27a, 0xd99a10], GOLD = [0xffc83a, 0xffe27a, 0xffffff, 0xd99a10], inside = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
    this.flashFx(d.x, d.y, d.size * 1.1, 0.6); this.ringFx(d.x, d.y, d.size * 0.95, 0xffd23f); this.ringFx(d.x, d.y, d.size * 0.55, 0xffffff);
    this.burst(d.x, d.y, 0.5, 0xffc83a, 26, 4.2, 1.6); this.burst(d.x, d.y, 0.6, 0xffe27a, 18, 3.4, 1.3); this.burst(d.x, d.y, 1.0, 0xffffff, 10, 2.6, 1);
    for (let i = 0; i < 8; i++) this.puff(d.x + (Math.random() - 0.5) * 1.2, d.y + (Math.random() - 0.5) * 1.2, 0.4, 0xffe9a0, 1.5, 0.9, 0.7);
    this.shake = Math.max(this.shake || 0, 0.3);
    for (let i = -h; i <= h; i++) for (let j = -h; j <= h; j++) {
      const dist = Math.hypot(i, j), cx = cx0 + i, cy = cy0 + j; if (!inside(cx, cy)) continue;
      this.later(dist * 0.07, () => {
        this.cellStain(cx, cy, pal[Math.abs(i * 3 + j * 5) % 3], d.time, 0.94);
        for (let k = 0; k < 4; k++) {   // glittering gold flecks stuck in the puddle
          const sz = 0.06 + Math.random() * 0.1, b = new THREE.Mesh(this.cyl, this.basic(k % 2 ? 0xffffff : 0xffe27a)); b.scale.set(sz, 0.01, sz); b.castShadow = false;
          b.position.set(wx(cx) + (Math.random() - 0.5) * 0.7, 0.058 + k * 0.001, wz(cy) + (Math.random() - 0.5) * 0.7); this.scene.add(b);
          this.fx.push({ decal: true, m: b, sx: sz, sz, life: d.time * (0.5 + Math.random() * 0.5), t: 0 });
        }
        this.burst(cx, cy, 0.12, 0xffe27a, 3, 1.6, 0.8); this.burst(cx, cy, 0.15, 0xffffff, 2, 1.8, 0.9);
        if ((i + j) % 2 === 0) for (let n = 0; n < 5; n++) this.trailDrop(wx(cx), 0.1 + n * 0.14, wz(cy), GOLD, 3, 1.1);   // little gold geyser
      });
    }
    for (let k = 0; k < 8; k++) {
      const dx = Math.round(Math.cos(k * Math.PI / 4)), dy = Math.round(Math.sin(k * Math.PI / 4));
      for (let st = 1; st <= h + 1; st++) this.later(0.04 + st * 0.08, () => {
        const x = cx0 + dx * st, y = cy0 + dy * st; if (!inside(x, y)) return;
        this.cellStain(x, y, 0xd99a10, d.time * 0.7, 0.55, 0.054);
        for (let n = 0; n < 6; n++) this.trailDrop(wx(x), 0.15 + Math.random() * 0.8, wz(y), GOLD, 4, 1.25);
        this.puff(x, y, 0.15, 0xffe9a0, 0.6, 0.9, 0.45);
      });
    }
  }
  // Ice Cube Drop snaps: a 3x3 of frost tiles, crystals shoot up tile by tile from the middle, then everything shatters and fades out
  iceSnapFx(d) {
    const cx0 = Math.round(d.x), cy0 = Math.round(d.y), h = Math.floor(d.size / 2);
    const fl = new THREE.Mesh(this.sph, this.basic(0xdff6ff)); fl.position.set(wx(d.x), 0.5, wz(d.y)); fl.scale.setScalar(0.01); this.scene.add(fl);
    this.fx.push({ flash: true, m: fl, r: d.size * 0.95, life: 0.3, t: 0 });
    this.ringFx(d.x, d.y, d.size * 0.9, 0xbfeaff); this.ringFx(d.x, d.y, d.size * 0.55, 0xffffff);
    for (let i = -h; i <= h; i++) for (let j = -h; j <= h; j++) {
      const cx = cx0 + i, cy = cy0 + j, dist = Math.hypot(i, j);
      this.later(dist * 0.05, () => {
        this.cellStain(cx, cy, 0x9fd8f5, d.time, 0.97, 0.05); this.cellStain(cx, cy, 0xe6f8ff, d.time * 0.8, 0.72, 0.056);
        const n = 2 + (Math.random() < 0.6 ? 1 : 0);
        for (let k = 0; k < n; k++) this.iceSpike(cx + (Math.random() - 0.5) * 0.6, cy + (Math.random() - 0.5) * 0.6, 0.45 + Math.random() * 0.65 - dist * 0.08, d.time * 0.5);
        this.burst(cx, cy, 0.2, 0xbfeaff, 6, 3, 1.2); this.burst(cx, cy, 0.3, 0xffffff, 3, 2.2, 0.9);
        this.puff(cx, cy, 0.1, 0xeaf8ff, 1.3, 0.9, 0.7);
      });
    }
    this.shake = Math.max(this.shake || 0, 0.25);
  }
  iceSpike(gx, gy, h, life) {
    this._oct ||= new THREE.OctahedronGeometry(0.5);
    const m = new THREE.Mesh(this._oct, this._iceSpikeMat ||= new THREE.MeshBasicMaterial({ color: 0xcdeeff, transparent: true, opacity: 0.8 })), w = 0.2 + Math.random() * 0.1;
    m.castShadow = false; m.position.set(wx(gx), 0.05, wz(gy)); m.rotation.y = Math.random() * 3; m.scale.setScalar(0.01); this.scene.add(m);
    this.fx.push({ spike: true, m, sx: w, sy: Math.max(0.3, h), sz: w, life, t: 0 });
    this.later(life - 0.35, () => this.burst(gx, gy, 0.3, 0xbfeaff, 3, 2, 0.9));   // shatters as it vanishes
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

  // exact picking: the machine / shelf / trap whose 3D model is under the pointer (not the floor cell behind a tall item)
  pickItem(clientX, clientY) {
    const g = this.game; if (!g) return null;
    const r = this.canvas.getBoundingClientRect();
    const u = (clientX - r.left) / r.width * this.sx, v = (1 - (clientY - r.top) / r.height) * this.sy;
    this.ray.setFromCamera(new THREE.Vector2(u * 2 - 1, v * 2 - 1), this.camera);
    const shown = o => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
    let best = null, bd = Infinity;
    for (const it of [...g.towers, ...g.shelves, ...(g.traps || [])]) {
      const m = this.meshes.get(it.id); if (!m || !m.group) continue;
      for (const h of this.ray.intersectObject(m.group, true)) {
        if (h.object.userData.ol || !shown(h.object)) continue;
        if (h.distance < bd) { bd = h.distance; best = it; }
        break;
      }
    }
    return best ? { x: best.x, y: best.y, item: best } : null;
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
  // grid cells (grid coords) whose centre is within r of cell (cx, cy), clipped to the room
  gridCells(cx, cy, r) {
    const out = [], rc = Math.ceil(r);
    for (let i = -rc; i <= rc; i++) for (let j = -rc; j <= rc; j++) {
      const x = Math.round(cx) + i, y = Math.round(cy) + j;
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS || Math.hypot(i, j) > r + 0.01) continue;
      out.push([x, y]);
    }
    return out;
  }
  setRange(c, r) {
    if (!c || !r) { this.rangeGrid.visible = false; return; }
    const key = c.x + ',' + c.y + ',' + r.toFixed(2);
    if (key !== this.rangeKey) {
      this.rangeKey = key;
      while (this.rangeGrid.children.length) this.rangeGrid.remove(this.rangeGrid.children[0]);
      const cells = this.gridCells(c.x, c.y, r), has = new Set(cells.map(([x, y]) => x + ',' + y));
      for (const [x, y] of cells) {
        const edge = ![[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => has.has((x + dx) + ',' + (y + dy)));
        const m = new THREE.Mesh(this.box, edge ? this.gridEdgeMat : this.gridMat);
        m.scale.set(0.9, 0.02, 0.9); m.position.set(wx(x), 0.075, wz(y)); m.castShadow = false; this.rangeGrid.add(m);
      }
    }
    this.rangeGrid.visible = true;
  }
  // landing warning for lobbed shots: the grid cells the blast will cover (group.material is the shared material, so pulsing / disposing works like a mesh)
  makeGridMark(tx, ty, r, color) {
    const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false });
    for (const [x, y] of this.gridCells(tx, ty, Math.max(0.5, r))) {
      const m = new THREE.Mesh(this.box, mat); m.scale.set(0.88, 0.02, 0.88); m.position.set(wx(x), 0.07, wz(y)); m.castShadow = false; g.add(m);
    }
    g.material = mat; return g;
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
  trailBit(pos, kind, cols) {
    if (kind === 'egg' || kind === 'broth') {   // a drip of liquid (egg white / yolk, or noodle broth) falling off a flying gob
      cols = cols || [0xf6f1e4, 0xffc21f];
      const sz = 0.05 + Math.random() * 0.05, m = new THREE.Mesh(this.sph, this.basic(Math.random() < 0.3 ? cols[1] : cols[0]));
      m.castShadow = false; m.scale.setScalar(sz); m.position.copy(pos); this.scene.add(m);
      this.fx.push({ m, vx: (Math.random() - 0.5) * 0.2, vy: 0, vz: (Math.random() - 0.5) * 0.2, life: 0.3 + Math.random() * 0.2, t: 0, s: sz, g: 9 }); return;
    }
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
  // noodle cup detonation: ring + flash, the cup tumbles away, 3D noodle strands fly out, broth gobs leave drip trails and land as puddles
  noodleSplashFx(d) {
    const BR = [0xe8a33d, 0xf2c230];
    this.ringFx(d.x, d.y, d.r * 1.5, 0xf2c230); this.flashFx(d.x, d.y, d.r * 1.1, 0.3);
    this.gridSplash({ x: d.x, y: d.y, r: 0.55 }, [0xe8a33d, 0xf2c230, 0xc98a5a], [0xfff3d0, 0xf0d58a], [0xf2c230, 0xfff3d0, 0xe8a33d], 1.2);
    for (const c of [0xf2c230, 0xfff3d0, 0xd62828]) this.burst(d.x, d.y, 0.4, c, 5, 2.2, 0.9);
    this.puff(d.x, d.y, 0.3, 0xfff3d0, 1.1, 0.7, 0.6); this.shake = Math.max(this.shake, 0.12);
    this.liquidPuddle(wx(d.x), wz(d.y), 0.34, 0xe8a33d, 0xf2c230);                       // broth puddle under the cup
    const cup = makeCupNoodle(this, 1.6); cup.position.set(wx(d.x), 0.3, wz(d.y)); this.scene.add(cup);   // the cup is blown up and tumbles away
    this.fx.push({ m: cup, vx: (Math.random() - 0.5) * 1.6, vy: 3.4, vz: (Math.random() - 0.5) * 1.6, life: 1.5, t: 0, s: 1, sx: 1.6, sy: 1.6, sz: 1.6, g: 10, spin: [7, 4, 9] });
    this.noodleGeo ||= new THREE.TorusGeometry(0.06, 0.013, 5, 12);
    for (let i = 0; i < 10; i++) {                                                         // curly 3D noodle strands
      const m = new THREE.Mesh(this.noodleGeo, this.basic(i % 2 ? 0xf3dc98 : 0xe6c777)), a = Math.random() * Math.PI * 2, spd = 1.2 + Math.random() * 2.2, sc = 0.8 + Math.random() * 0.8;
      m.position.set(wx(d.x), 0.3, wz(d.y)); m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3); this.scene.add(m);
      this.fx.push({ m, vx: Math.cos(a) * spd, vy: 2.2 + Math.random() * 2, vz: Math.sin(a) * spd, life: 2.2, t: 0, s: sc, sx: sc, sy: sc, sz: sc, g: 9, spin: [(Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12], trail: 'broth', cols: BR });
    }
    for (let i = 0; i < 9; i++) {                                                          // liquid broth gobs
      const a = Math.random() * Math.PI * 2, spd = 1.2 + Math.random() * 2.2, sz = 0.08 + Math.random() * 0.07;
      const m = new THREE.Mesh(this.sph, this.basic(i % 3 ? 0xe8a33d : 0xf2c230)); m.scale.set(sz, sz * 0.8, sz); m.position.set(wx(d.x), 0.25, wz(d.y)); this.scene.add(m);
      this.fx.push({ m, vx: Math.cos(a) * spd, vy: 2 + Math.random() * 1.8, vz: Math.sin(a) * spd, life: 1.4, t: 0, s: sz, g: 9, trail: 'broth', cols: BR, land: true, accent: i % 3 === 0 });
    }
  }
  // flat egg puddle on the floor: white blob with a yolk in the middle (decals shrink away on their own)
  eggPuddle(gx, gz, r, yolk = true) { this.liquidPuddle(gx, gz, r, 0xf6f1e4, yolk ? 0xffc21f : 0); }
  liquidPuddle(gx, gz, r, colA, colB) {
    const mk = (col, rr, yo, rise) => {
      const m = new THREE.Mesh(this.cyl, this.basic(col)); m.scale.set(rr, 0.01, rr * (0.8 + Math.random() * 0.4));
      m.position.set(gx + (Math.random() - 0.5) * 0.04, 0.056 + rise, gz + (Math.random() - 0.5) * 0.04); m.rotation.y = Math.random() * 3; this.scene.add(m);
      this.fx.push({ decal: true, m, sx: m.scale.x, sz: m.scale.z, life: 3.2 + Math.random() * 0.8 + yo, t: 0 });
    };
    mk(colA, r, 0, 0.002); if (colB) mk(colB, r * 0.45, 0.2, 0.004);
  }
  // egg explosion with a liquid trail: gobs of white / yolk fly out leaving drips behind them, then splat down as puddles
  eggSplatFx(x, y, r) {
    this.eggPuddle(wx(x), wz(y), 0.3 + r * 0.22);   // the splat under the egg
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, spd = 1.2 + Math.random() * 2.2, yolk = i % 3 === 0, sz = 0.08 + Math.random() * 0.07;
      const m = new THREE.Mesh(this.sph, this.basic(yolk ? 0xffc21f : 0xf6f1e4)); m.scale.set(sz, sz * 0.8, sz); m.position.set(wx(x), 0.25, wz(y)); this.scene.add(m);
      this.fx.push({ m, vx: Math.cos(a) * spd, vy: 2 + Math.random() * 1.8, vz: Math.sin(a) * spd, life: 1.4, t: 0, s: sz, g: 9, trail: 'egg', land: true, accent: yolk });
    }
  }
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
      this.gridSplash(d, [0x4a2616, 0x6b3a22, 0x8a4b2a], [0xffffff, 0xc98a5a], COLA_PAL, 1.6);
      for (const c of [0x3b1f14, 0x6b3a22, 0xffffff]) this.burst(d.x, d.y, 0.5, c, 5, 2.2, 0.9);
    }
    else if (type === 'noodleLand') {   // the cup thuds down and starts hissing
      this.burst(d.x, d.y, 0.15, 0xf2c230, 4, 1.4, 0.7); this.puff(d.x, d.y, 0.2, 0xfff3d0, 0.8, 0.5, 0.4);
    }
    else if (type === 'noodleSplash') {   // detonation: cup flies up, 3D noodle strands + broth gobs with drip trails, puddles on the floor
      this.noodleSplashFx(d);
    }
    else if (type === 'swirl') { this.ringFx(d.swirl.x, d.swirl.y, d.swirl.r, 0xffffff); this.burst(d.swirl.x, d.swirl.y, 0.5, 0xffffff, 8, 2.2, 1); }
    else if (type === 'canHit') { this.scatterCans(d.x, d.y, d.dx, d.dy, d.color); this.burst(d.x, d.y, 0.5, 0xffffff, 4, 1.8); }
    else if (type === 'skillPlace') { const k = d.skill; this.ringFx(k.x, k.y, 1.2, 0xffffff); this.burst(k.x, k.y, 0.3, 0xffffff, 8, 2, 1); }
    else if (type === 'colaBlast') {                                                      // the shaken bottle erupts: big brown + white fizz burst
      this.ringFx(d.x, d.y, d.r, 0xc98a5a); this.ringFx(d.x, d.y, d.r * 0.6, 0xffffff);
      this.burst(d.x, d.y, 0.5, 0x6b3a22, 26, 4.2, 1.7); this.burst(d.x, d.y, 0.6, 0xffffff, 18, 3.4, 1.4); this.burst(d.x, d.y, 1.1, 0x3b1f14, 10, 2.6, 1.2);
      for (let i = 0; i < 8; i++) this.puff(d.x + (Math.random() - 0.5) * 1.2, d.y + (Math.random() - 0.5) * 1.2, 0.4, 0xffffff, 1.6, 0.9, 0.7);
      this.shake = Math.max(this.shake || 0, 0.3);
      this.colaGridSplash(d);
    }
    else if (type === 'cigBoom') {                                                        // small pop where a cigarette lands
      this.ringFx(d.x, d.y, d.r, 0xffb347); this.burst(d.x, d.y, 0.25, 0xffd23f, 6, 2.2, 1); this.burst(d.x, d.y, 0.3, 0xff5a1f, 5, 1.8, 1);
      this.puff(d.x, d.y, 0.3, 0x55556a, 0.9, 0.6, 0.5);
      this.burst(d.x, d.y, 0.3, 0xffffff, 3, 1.4, 0.8); this.ringFx(d.x, d.y, d.r * 1.35, 0xff8c1a);                        // bigger pop + a scorch mark on the grid
      this.cellStain(Math.round(d.x), Math.round(d.y), 0x1a1410, 2.4, 0.8, 0.05); this.cellStain(Math.round(d.x), Math.round(d.y), 0xff6a1a, 0.7, 0.34, 0.056);
    }
    else if (type === 'bananaLaunch') { const k = d.skill; this.burst(k.x, k.y, 0.55, 0xffd93b, 3, 2, 0.9); }
    else if (type === 'bananaPop') {                                                      // the crate bursts open
      this.ringFx(d.x, d.y, 1.3, 0xffd93b); this.burst(d.x, d.y, 0.4, 0xffd93b, 14, 3.4, 1.4); this.burst(d.x, d.y, 0.4, 0xc99a5a, 8, 3, 1.3); this.burst(d.x, d.y, 0.5, 0xffffff, 4, 2.2, 1);
      for (let i = 0; i < 4; i++) this.puff(d.x, d.y, 0.4, 0xe9ddc0, 1.2, 0.8, 0.6);
      this.shake = Math.max(this.shake || 0, 0.15);
    }
    else if (type === 'bananaBoom') {                                                     // banana goes splat: mush, flying halves, a peel on the floor
      this.ringFx(d.x, d.y, d.r * 1.3, 0xffd93b); this.ringFx(d.x, d.y, d.r * 0.7, 0xffffff); this.splat(d.x, d.y, d.r, 0xffe27a);
      this.burst(d.x, d.y, 0.3, 0xfff3b0, 8, 3.2, 1.2); this.burst(d.x, d.y, 0.3, 0xffd93b, 8, 2.8, 1.1); this.burst(d.x, d.y, 0.3, 0x6b4a20, 3, 2.4, 0.8);
      for (let i = 0; i < 3; i++) {
        const b = makeBanana(this, 0.55); b.position.set(wx(d.x), 0.3, wz(d.y)); b.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); this.scene.add(b);
        const a = Math.random() * 6.28, sp = 1.2 + Math.random() * 1.8;
        this.fx.push({ m: b, vx: Math.cos(a) * sp, vy: 2.4 + Math.random() * 1.8, vz: Math.sin(a) * sp, life: 0.8 + Math.random() * 0.3, t: 0, s: 0.55, g: 9 });
      }
      const peel = new THREE.Mesh(this.box, this.basic(0xffd93b)); peel.scale.set(0.28, 0.01, 0.1); peel.rotation.y = Math.random() * 6; peel.castShadow = false;
      peel.position.set(wx(d.x) + (Math.random() - 0.5) * 0.4, 0.06, wz(d.y) + (Math.random() - 0.5) * 0.4); this.scene.add(peel);
      this.fx.push({ decal: true, m: peel, sx: 0.28, sz: 0.1, life: 2.4, t: 0 });
      this.shake = Math.max(this.shake || 0, 0.1);
    }
    else if (type === 'iceLand') {                                                        // the pile hits the floor / the item
      this.ringFx(d.x, d.y, 1.3, 0xbfeaff); this.burst(d.x, d.y, 0.3, 0xbfeaff, 10, 3, 1.2); this.burst(d.x, d.y, 0.3, 0xffffff, 5, 2.4, 0.9);
      for (let i = 0; i < 3; i++) this.puff(d.x, d.y, 0.2, 0xeaf8ff, 1.2, 0.5, 0.6);
      this.shake = Math.max(this.shake || 0, 0.2);
    }
    else if (type === 'iceSnap') this.iceSnapFx(d);
    else if (type === 'burgerLand') this.burgerLandFx(d);
    else if (type === 'burgerPop') {                                                      // the giant burger pops: buns, patty, lettuce and sauce fly, then the 4 tiny ones shoot out
      this.flashFx(d.x, d.y, d.size * 0.9, 0.7); this.ringFx(d.x, d.y, d.size * 0.9, 0xffb347); this.ringFx(d.x, d.y, d.size * 0.5, 0xffffff);
      for (const [c, n] of [[0xd9963a, 12], [0x5a2f1a, 8], [0x58b947, 8], [0xe0332a, 7], [0xffc833, 5], [0xd2231a, 10], [0xfff1cc, 8]]) this.burst(d.x, d.y, 0.7, c, n, 4, 1.5);
      for (let i = 0; i < 5; i++) this.puff(d.x + (Math.random() - 0.5) * 1.6, d.y + (Math.random() - 0.5) * 1.6, 0.5, 0xf3e6c8, 1.7, 0.8, 0.8);
      this.splat(d.x, d.y, d.size * 0.8, 0xd2231a);
      this.shake = Math.max(this.shake || 0, 0.3);
    }
    else if (type === 'miniHit') { this.burst(d.x, d.y, 0.5, 0xd2231a, 4, 2, 0.9); this.burst(d.x, d.y, 0.5, 0xd9963a, 3, 1.8, 0.9); }
    else if (type === 'miniPop') {                                                        // tiny burger smashed on the wall
      this.ringFx(d.x, d.y, 0.9, 0xffb347); this.burst(d.x, d.y, 0.5, 0xd9963a, 7, 2.6, 1.1); this.burst(d.x, d.y, 0.5, 0xd2231a, 5, 2.2, 1); this.burst(d.x, d.y, 0.5, 0x58b947, 3, 2, 0.9);
      this.puff(d.x, d.y, 0.4, 0xf3e6c8, 0.9, 0.6, 0.5); this.shake = Math.max(this.shake || 0, 0.06);
    }
    else if (type === 'goldBlast') this.goldBlastFx(d);
    else if (type === 'buy') { this.burst(d.x, d.y, 0.9, 0xffcf4a, 4, 1.6); const o = this.meshes.get(d.id); if (o) { o.kick = 0.18; o.flash = 0.35; if (d.kind === 'shelf') o.pop = 0.34; } }
    else if (type === 'pay') this.burst(d.x, d.y, 1.1, 0xffe45c, 7, 2.2, 1.2);
    else if (type === 'hit') this.burst(d.x, d.y, 0.5, d.crit ? 0xffee58 : 0xffffff, d.crit ? 6 : 3, 1.5);
    else if (type === 'kill') {
      this.burst(d.enemy.x, d.enemy.y, 0.4, 0xffcf4a, 8, 2.5);
      const m = this.meshes.get(d.enemy.id);
      if (m && m.group) {   // detach the model from the sync so it can sink instead of popping out
        this.meshes.delete(d.enemy.id); if (this.hoverId === d.enemy.id) { this.hoverId = null; this.outline = []; }
        if (m.group.userData.bar) m.group.userData.bar.visible = false;
        m.hitT = 0.13; (this.dying || (this.dying = [])).push({ group: m.group, m, t: 0 });
      }
    }
    else if (type === 'splash') {
      if (d.kind === 'soda') { this.gridSplash(d, [0x7df0d8, 0x2fb6a6, 0xb8fff2], [0xffffff, 0xcffff6], [0x7df0d8, 0xffffff, 0xb8fff2, 0x2fb6a6], 1.3); this.burst(d.x, d.y, 0.45, 0x7df0d8, 8, 2.6, 1.1); this.burst(d.x, d.y, 0.5, 0xffffff, 5, 2, 0.9); }
      else { this.ringFx(d.x, d.y, d.r, 0x7df0d8); this.burst(d.x, d.y, 0.45, 0x7df0d8, 10, 2.6, 1.2); this.burst(d.x, d.y, 0.5, 0xffffff, 5, 2, 0.9); }
    }
    else if (type === 'coffeeSplash') {   // a 4x4 splash of coffee
      const o = this.meshes.get(d.tower.id); if (o) o.flash = 0.25;
      const x = d.tower.x, y = d.tower.y, H = d.half;
      this.ringFx(x, y, H * 1.1, 0xc98a5a);
      for (let i = 0; i < 16; i++) this.burst(x + (Math.random() * 2 - 1) * H, y + (Math.random() * 2 - 1) * H, 0.35, [0x4a2616, 0x6b3a22, 0xc98a5a][i % 3], 4, 1.8, 1);
      this.burst(x, y, 0.6, 0xffffff, 4, 1.4, 0.8);
    }
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
    else if (type === 'eggBoom') {                                                       // egg splat: white + yolk burst, shell bits
      this.ringFx(d.x, d.y, d.r * 1.2, 0xffd23f); this.flashFx(d.x, d.y, d.r * 0.9, 0.3);
      this.burst(d.x, d.y, 0.4, 0xffd23f, 8, 2.8, 1.2); this.burst(d.x, d.y, 0.4, 0xffffff, 8, 2.4, 1.1); this.burst(d.x, d.y, 0.3, 0xf6f1e4, 5, 2, 0.8);
      this.puff(d.x, d.y, 0.3, 0xfff3d0, 0.9, 0.6, 0.5); this.shake = Math.max(this.shake, 0.1);
      this.eggSplatFx(d.x, d.y, d.r);
    }
    else if (type === 'eggFizzle') this.burst(d.x, d.y, 0.2, 0xffffff, 4, 1.2, 0.7);
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
    else if (type === 'molotovSplash') this.blast3d(d.x, d.y, d.r, d.fueled ? 1.35 : 1, true);
    else if (type === 'doorCrash') {
      const dr = this.doors && this.doors.find(q => q.sp.x === d.x && q.sp.y === d.y); if (dr) dr.force = 1.2;
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
    else if (type === 'revStart') { this.ringFx(d.x, d.y, 1.4, 0x9a9a9a); for (let i = 0; i < 6; i++) this.puff(d.x, d.y, 0.25, 0x6b6b72, 1.4, 0.9, 1.0); }
    else if (type === 'roamStart') { this.ringFx(d.x, d.y, 2.0, 0xff5a3a); this.burst(d.x, d.y, 0.4, 0xffb347, 10, 3, 1.0); this.shake = Math.max(this.shake, 0.25); }
    else if (type === 'park') { for (let i = 0; i < 6; i++) this.puff(d.x, d.y, 0.2, 0xb9b3a4, 1, 0.6, 0.8); this.ringFx(d.x, d.y, 1.2, 0xe9ddc0); }
    else if (type === 'spinStart') { this.ringFx(d.x, d.y, 1.8, 0xc9b48a); for (let i = 0; i < 8; i++) this.puff(d.x, d.y, 0.2, 0xc9b48a, 1.2, 0.8, 0.9); }
    else if (type === 'tornado') { this.ringFx(d.x, d.y, 1.5, 0xc9b48a); this.burst(d.x, d.y, 0.3, 0xc9b48a, 10, 2.4, 1.1); }
    else if (type === 'sodaRapid') { this.ringFx(d.tower.x, d.tower.y, 1.1, 0x7df0d8); this.burst(d.tower.x, d.tower.y, 0.9, 0x7df0d8, 10, 2.4, 1); this.burst(d.tower.x, d.tower.y, 0.9, 0xffffff, 6, 2, 0.9); }
    else if (type === 'overheat') { const t = d.tower; this.ringFx(t.x, t.y, 1.3, 0xff5a1f); this.burst(t.x, t.y, 0.8, 0xff5a1f, 8, 2.2, 1); for (let i = 0; i < 5; i++) this.puff(t.x, t.y, 0.8 + Math.random() * 0.4, 0xe6ecf0, 1.5, 1.2, 1.1); this.shake = Math.max(this.shake, 0.12); }
    else if (type === 'cooled') { const t = d.tower; this.ringFx(t.x, t.y, 0.9, 0x9ad7ff); this.burst(t.x, t.y, 0.8, 0x9ad7ff, 5, 1.6, 0.8); }
    else if (type === 'barrage') { this.ringFx(d.enemy.x, d.enemy.y, 1.6, 0xff3b3b); this.burst(d.enemy.x, d.enemy.y, 1.0, 0xffd23f, 10, 2.8, 1); this.shake = Math.max(this.shake, 0.2); }
    else if (type === 'doorThrow') { this.ringFx(d.x, d.y, 1.4, 0xffee58); this.burst(d.x, d.y, 0.7, 0xc08a50, 10, 3, 1.2); this.shake = Math.max(this.shake, 0.2); }
    else if (type === 'doorTurn') { this.ringFx(d.x, d.y, 1.0, 0xffffff); this.burst(d.x, d.y, 0.6, 0xc08a50, 6, 2.2, 1); }
    else if (type === 'doorHit') { this.ringFx(d.x, d.y, 1.3, 0xffee58); this.burst(d.x, d.y, 0.6, 0xffee58, 8, 3, 1.1); this.burst(d.x, d.y, 0.5, 0xc08a50, 8, 3, 1.3); for (let i = 0; i < 3; i++) this.puff(d.x, d.y, 0.4, 0xb9b3a4, 1.2, 0.8, 0.8); this.shake = Math.max(this.shake, 0.3); }
    else if (type === 'doorCatch') { this.burst(d.x, d.y, 0.8, 0xffee58, 6, 2, 0.9); this.ringFx(d.x, d.y, 0.9, 0xffffff); }
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
  // ---------- Door Robber: the thrown door (a flat plank that spins like a boomerang) ----------
  makeFlyDoor() {
    const g = new THREE.Group(), sp = new THREE.Group(); g.add(sp); g.userData.spin = sp;
    this.part(sp, this.box, 0x3a3d4a, 0.62, 0.09, 1.16, 0, 0, 0, false);   // frame
    this.part(sp, this.box, 0x8a5a32, 0.5, 0.11, 1.04, 0, 0, 0, false);    // panel
    this.part(sp, this.box, 0x6b4526, 0.36, 0.12, 0.34, 0, 0, -0.26, false);
    this.part(sp, this.box, 0x6b4526, 0.36, 0.12, 0.34, 0, 0, 0.26, false);
    this.part(sp, this.box, 0xe6c84a, 0.07, 0.15, 0.07, 0.2, 0, 0.04, false);   // handle
    return g;
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
        if (o.kind === 'tower' || o.kind === 'shelf') this.glowItem(o, m, time);
      }
    };
    sync(g.towers, t => this.at(t.type === 'coffee' ? makeCoffee(this, t) : t.type === 'noodle' ? makeNoodle(this, t) : t.type === 'eggtray' ? makeEggtray(this, t) : makeItem(this, t), t), (t, m) => this.updTower(t, m, dt));
    sync(g.eggs || [], e => makeEgg(this, 1.1), (e, m) => {                      // rolling eggs: tumble along the floor, wobble when they stop; blink before they fizzle
      m.group.position.set(wx(e.x), 0.15, wz(e.y));
      m.group.rotation.y = Math.atan2(-e.dy, e.dx);
      m.group.userData.body.rotation.x = e.spin * 5;
      m.group.visible = !(e.delay > 0) && (e.life - e.age > 2 || Math.floor(time * 10) % 2 === 0);
    });
    sync(g.noodleCups || [], c => makeCupNoodle(this, 1.6), (c, m) => {          // landed cup noodle: bounces, lies on its side hissing, shakes harder as the fuse burns down
      const age = c.max - c.t, k = age / c.max, u = m.group.userData;
      if (m.ry === undefined) m.ry = Math.random() * 6;
      m.group.rotation.y = m.ry; u.cup.rotation.z = 1.2; u.cup.rotation.x = Math.sin(time * (20 + k * 50)) * 0.05 * k;
      m.group.position.set(wx(c.x) + Math.sin(time * 60) * 0.015 * k, 0.12 + Math.abs(Math.sin(age * 10)) * 0.3 * Math.exp(-age * 5), wz(c.y) + Math.cos(time * 55) * 0.015 * k);
      m.group.scale.setScalar(1 + 0.18 * k * (0.5 + 0.5 * Math.sin(time * (14 + k * 40))));   // swells and pulses faster until it blows
      m.sp = (m.sp || 0) + dt;
      if (m.sp > 0.12 - k * 0.08) { m.sp = 0; this.puff(c.x, c.y, 0.3, 0xfff3d0, 0.5, 0.8, 0.5); if (k > 0.5) this.burst(c.x, c.y, 0.3, 0xffd23f, 1, 1.2, 0.6); }   // steam + sparks
    });
    sync(g.fruits || [], f => makeFruit(this, f), (f, m) => {          // loose fruit from a smashed fruit shelf: arcs out, then flashes until it blows
      const u = m.group.userData, left = f.fuse - f.age;
      m.group.position.set(wx(f.x), f.h, wz(f.y));
      u.flash.visible = f.age > f.land && Math.floor(time * (left < 0.5 ? 40 : left < 1 ? 20 : 8)) % 2 === 0;
      m.group.scale.setScalar(1 + (left < 0.4 ? (0.4 - left) * 0.9 : 0));
      if (f.age < f.land) m.group.rotation.z += dt * 12;
    });
    sync(g.shelves, sh => { if (sh.type === 'burgerwall') { const w = new THREE.Group(); w.userData = { body: new THREE.Group(), stock: 0 }; return this.at(w, sh); } return this.at(makeItem(this, sh), sh); }, (sh, m) => {
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
    sync(g.skills || [], s => this.at(this.makeSkillModel(s), s), (s, m) => this.animSkill(s, m, time));
    if (g.goldBuff) {   // Golden Apple: every machine glitters while the power-up lasts
      for (const t of g.towers) if (t.kind === 'tower' && !t.broken && Math.random() < dt * 5) { this.burst(t.x, t.y, 0.4 + Math.random() * 0.7, Math.random() < 0.5 ? 0xffe27a : 0xffffff, 1, 0.6, 0.7); if (Math.random() < 0.3) this.puff(t.x, t.y, 0.9, 0xffd23f, 0.35, 0.6, 0.5); }
    }
    sync(g.flyDoors || [], d => this.makeFlyDoor(), (d, m) => {   // Door Robber's boomerang door
      m.group.position.set(wx(d.x), 0.62 + Math.sin(time * 14) * 0.04, wz(d.y));
      m.group.userData.spin.rotation.y += dt * 24;
      if (Math.random() < dt * 40) this.puff(d.x, d.y, 0.55, 0xb9b3a4, 0.5, 0.4, 0.35);
      if (Math.random() < dt * 20) this.burst(d.x, d.y, 0.6, 0xc08a50, 1, 0.8, 0.7);
    });
    sync(g.swirls || [], s => this.at(this.makeSwirlModel(), s), (s, m) => { m.group.position.set(wx(s.x), 0, wz(s.y)); this.animSwirl(m.group, s, time); });
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
    sync(g.projectiles, p => p.kind === 'molo' ? this.makeMoloProj() : p.kind === 'hotdog' ? this.makeHotdogProj() : p.kind === 'noodle' ? makeCupNoodle(this, 1.6) : p.kind === 'ice' ? this.makeIceProj() : p.kind === 'cig' ? makeLitCig(this) : p.kind === 'banana' ? makeBanana(this, 1.15) : p.kind === 'miniburger' ? makeMiniBurger(this) : makeProjectile(this, p), (p, m) => {
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
      } else if (p.kind === 'noodle') {                                                                                       // tumbling cup noodle, broth drips
        grp.rotation.y = Math.atan2(-p.dy, p.dx); grp.userData.cup.rotation.z += dt * 9; grp.userData.cup.rotation.x += dt * 5;
        if (Math.random() < dt * 25) this.burst(p.x, p.y, p.h, Math.random() < 0.5 ? 0xf2c230 : 0xe8a33d, 1, 0.5, 0.5);
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
      } else if (p.kind === 'miniburger') {                                                                                   // tiny burger spinning like a frisbee, sauce crumbs behind it
        grp.userData.body.rotation.y += dt * 16; grp.userData.body.rotation.z = Math.sin(time * 12 + p.id) * 0.25;
        if (Math.random() < dt * 30) this.burst(p.x, p.y, p.h, Math.random() < 0.5 ? 0xd2231a : 0xd9963a, 1, 0.5, 0.6);
        if (Math.random() < dt * 14) this.puff(p.x, p.y, p.h, 0xf3e6c8, 0.3, 0.4, 0.3);
      } else if (p.kind === 'banana') {                                                                                       // tumbling banana, yellow sparkle + peel crumbs
        grp.rotation.y = Math.atan2(-p.dy, p.dx); grp.rotation.z += dt * 12;
        if (Math.random() < dt * 30) this.burst(p.x, p.y, p.h, 0xffd93b, 1, 0.5, 0.6);
        if (Math.random() < dt * 14) this.puff(p.x, p.y, p.h, 0xfff3b0, 0.35, 0.4, 0.35);
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
          m.mark = this.makeGridMark(p.tx, p.ty, r, p.kind === 'bomb' ? 0xff3b3b : p.kind === 'molo' ? 0xff6a00 : p.kind === 'ice' ? 0x8fd3f4 : p.kind === 'water' ? 0x4aa8ff : p.kind === 'cereal' ? 0xffd23f : 0xff8c1a); this.scene.add(m.mark);
        }
        m.mark.material.opacity = 0.4 + 0.3 * Math.sin(time * 18);
      }
    });
    for (const [id, t0] of this.pops) {   // pop-in: elastic scale 0 -> 1
      const m = this.meshes.get(id); if (!m) continue;
      const t = t0 + dt, x = Math.min(1, t / 0.45), k = x >= 1 ? 1 : 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
      const trap = g.traps.some(o => o.id === id);
      if (trap) m.group.scale.multiplyScalar(k); else m.group.scale.setScalar(Math.max(0.01, k));
      if (x >= 1) this.pops.delete(id); else this.pops.set(id, t);
    }
    this.stepDying(dt);
    for (const [id, m] of this.meshes) if (!seen.has(id)) { if (id === this.hoverId) { this.hoverId = null; this.outline = []; } this.dyn.remove(m.group); if (m.mark) { this.scene.remove(m.mark); m.mark.material.dispose(); } if (m.warn) this.scene.remove(m.warn); this.meshes.delete(id); }

    // doors swing open for anybody walking up to them
    if (this.doors) for (const d of this.doors) {
      let near = d.force > 0; d.force = Math.max(0, d.force - dt);
      if (!near) for (const c of g.customers) if (Math.hypot(c.x - d.sp.x, c.y - d.sp.y) < 1.9) { near = true; break; }
      if (!near) for (const e of g.enemies) if (!e.dead && Math.hypot(e.x - d.sp.x, e.y - d.sp.y) < 2.4) { near = true; break; }
      d.open += ((near ? 1 : 0) - d.open) * Math.min(1, dt * 7);
      const a = d.open * 1.75; d.A.rotation.y = a; d.B.rotation.y = -a;   // swing INWARD (into the shop)
    }
    // morning -> night lighting
    const target = { morning: 0, prep: 0, evening: 0.55, wave: 1, restock: 1, lost: 1, won: 0 }[g.phase] ?? 0;
    this.tod += (target - this.tod) * Math.min(1, dt * 1.4);
    const k = this.tod, lerp = (a, b) => a + (b - a) * k;
    this.amb.color.setRGB(lerp(1, 0.62), lerp(1, 0.68), 1); this.amb.intensity = lerp(0.78, 0.8);
    this.sun.color.setRGB(lerp(1, 0.66), lerp(0.95, 0.74), lerp(0.87, 1)); this.sun.intensity = lerp(1.4, 0.95);
    this.quadMat.uniforms.tint.value.set(lerp(1, 0.8), lerp(1, 0.86), lerp(1, 1.08));
    this.renderer.setClearColor(this.sky.setRGB(0, 0, 0));   // black outside the store, day and night
    if (this.clerk) this.clerk.position.y = 0.9 + Math.abs(Math.sin(time * 2.2)) * 0.03;

    if (this.sched && this.sched.length) for (let i = this.sched.length - 1; i >= 0; i--) {   // delayed effects (grid ripples)
      const q = this.sched[i]; q.t -= dt; if (q.t <= 0) { this.sched.splice(i, 1); q.fn(); }
    }
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
      else if (f.spike) {   // ice crystal: shoots up out of the tile, shrinks away at the end
        const up = Math.min(1, f.t / 0.14), out = Math.max(0.01, Math.min(1, (f.life - f.t) / 0.5));
        f.m.scale.set(f.sx * out, Math.max(0.01, f.sy * up * out), f.sz * out); f.m.position.y = f.sy * up * out * 0.5 + 0.05;
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
        if (f.land && f.t > 0.05 && f.m.position.y <= 0.06) { this.liquidPuddle(f.m.position.x, f.m.position.z, 0.07 + f.s * 1.4, f.cols ? f.cols[0] : 0xf6f1e4, f.accent ? f.cols ? f.cols[1] : 0xffc21f : 0); f.t = f.life; }   // egg gob lands: leaves a puddle
        if (f.trail) { f.ta = (f.ta || 0) + dt; while (f.ta > 0.03) { f.ta -= 0.03; this.trailBit(f.m.position, f.trail, f.cols); } }   // leaves a trail behind it
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
    this.gridMat.opacity = 0.24 + 0.08 * Math.sin(time * 5); this.gridEdgeMat.opacity = 0.5 + 0.15 * Math.sin(time * 5);
    // camera shake
    this.shake = Math.max(0, this.shake - dt);
    const sh = this.shake * this.shake * 0.9;
    const offX = (this.ext.right - this.ext.left) / 2, offZ = (this.ext.bottom - this.ext.top) / 2;   // fixed camera, aimed at the middle of the whole shop
    this.camera.position.set(offX + this.camDir.x * 30 + (Math.random() - 0.5) * sh, 0.2 + this.camDir.y * 30 + (Math.random() - 0.5) * sh, offZ + this.camDir.z * 30);
    this.camera.lookAt(offX, 0.2, offZ);
    this.stepView(dt);

    // two-pass: low-res target, then nearest-neighbour upscale
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  // damaged items glow: below 60% HP a soft amber pulse, below 30% HP (or broken) a blinking red glow with a popping squash
  // white hit flash on every material of a model (clones the shared toon materials while it lasts, then puts the originals back)
  enemyFlash(m, k) {
    const g = m.group;
    if (k <= 0) { g.traverse(x => { if (x.userData.origMat) { if (x.material !== x.userData.origMat) x.material.dispose(); x.material = x.userData.origMat; delete x.userData.origMat; } }); m.hitOn = false; return; }
    m.hitOn = true;
    g.traverse(x => {
      if (!x.isMesh || x.userData.ol || !x.material || Array.isArray(x.material)) return;
      if (!x.userData.origMat) { if (!x.material.isMeshToonMaterial || x.material.transparent) return; x.userData.origMat = x.material; x.material = x.material.clone(); }
      x.material.emissive.setRGB(k, k, k);
    });
  }
  // a defeated burglar sinks into the floor (tilting back) instead of vanishing
  stepDying(dt) {
    const L = this.dying; if (!L || !L.length) return;
    for (let i = L.length - 1; i >= 0; i--) {
      const d = L[i]; d.t += dt;
      const k = Math.min(1, d.t / 0.75), u = d.group.userData;
      d.group.position.y = -k * k * 1.6 - k * 0.1;
      if (u.body) u.body.rotation.x = -k * 1.0;
      if (d.t > 0.15) { const f = Math.min(1, (d.t - 0.15) / 0.3); d.m.hitT = 0; this.enemyFlash(d.m, 0.6 * (1 - f)); }
      if (d.t >= 0.8) { this.enemyFlash(d.m, 0); this.dyn.remove(d.group); L.splice(i, 1); }
    }
  }
  glowItem(o, m, time) {
    const r = o.broken ? 0 : o.maxhp ? o.hp / o.maxhp : 1, noGlow = o.kind !== 'tower' || o.type === 'gum', lvl = noGlow ? 0 : r < 0.3 ? 2 : r < 0.6 ? 1 : 0, g = m.group;   // the damage pulse is only for attacking machines: no shelves, and no bubblegum machine (it keeps just its warning sign)
    if (lvl === 0) {
      if (m.glowing) {
        g.traverse(x => { if (x.userData.origMat) { if (x.material !== x.userData.origMat) x.material.dispose(); x.material = x.userData.origMat; delete x.userData.origMat; } });
        m.glowing = false; if (m.glowPop) { g.scale.set(1, 1, 1); m.glowPop = false; }
      }
      return;
    }
    m.glowing = true;
    const mats = [];
    g.traverse(x => {
      if (!x.isMesh || x.userData.ol || !x.material || Array.isArray(x.material)) return;
      if (!x.userData.origMat) {
        if (!x.material.isMeshToonMaterial || x.material.transparent) return;
        x.userData.origMat = x.material; x.material = x.material.clone();
      }
      mats.push(x.material);
    });
    const id = o.id || 0;
    let k, col;
    if (lvl === 1) { k = 0.12 + 0.28 * (0.5 + 0.5 * Math.sin(time * 4 + id)); col = [1, 0.62, 0.12]; }
    else { k = Math.floor(time * 7 + id) % 2 ? 0.95 : 0.1; col = [1, 0.12, 0.08]; }
    for (const mt of mats) mt.emissive.setRGB(col[0] * k, col[1] * k, col[2] * k);
    // popping: a quick squash-and-stretch once a second (only when no other animation owns the scale)
    const busy = (m.kick > 0) || (m.pop > 0) || m.popping || this.pops.has(o.id);
    if (lvl === 2 && !busy) {
      const ph = (time * 1.3 + id * 0.37) % 1, s = ph < 0.35 ? Math.sin(ph / 0.35 * Math.PI) : 0;
      g.scale.set(1 + 0.07 * s, 1 + 0.13 * s, 1 + 0.07 * s); m.glowPop = true;
    } else if (m.glowPop && !busy) { g.scale.set(1, 1, 1); m.glowPop = false; }
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
    if (t.type === 'soda' && !t.broken) {   // rapid-fire frenzy: shakes and sprays; overheated: steams until it cools down
      m.sT = (m.sT || 0) - dt;
      if (t.rapid > 0) {
        grp.position.x += (Math.random() - 0.5) * 0.05; grp.position.z += (Math.random() - 0.5) * 0.05;
        if (m.sT <= 0) { m.sT = 0.05; this.burst(t.x, t.y, top * 0.8, Math.random() < 0.5 ? 0x7df0d8 : 0xffffff, 1, 1.6, 0.7); }
      } else if (t.heat > 0 && m.sT <= 0) {
        m.sT = 0.08; this.puff(t.x, t.y, top * 0.9, 0xe6ecf0, 1.2, 1.1, 0.9);
        if (Math.random() < 0.4) this.fireBit(t.x + (Math.random() - 0.5) * 0.4, top * 0.7, t.y + (Math.random() - 0.5) * 0.4, 0.7, 0.4);
      }
    }
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
    if ((!prop || t.type === 'micro' || t.type === 'coffee' || t.type === 'noodle' || t.type === 'eggtray') && t.facing !== undefined) {   // vending / hot dog / fridge / microwave: whole machine turns to its open side
      if (m.face === undefined) m.face = t.facing;
      const d = Math.atan2(Math.sin(t.facing - m.face), Math.cos(t.facing - m.face));
      m.face += d * Math.min(1, dt * 10); grp.rotation.y = m.face;
    }
    if (prop && t.type !== 'micro' && t.type !== 'coffee' && t.type !== 'noodle' && t.type !== 'eggtray') {
      let a = prop.rotation.y, d = t.angle - a; d = Math.atan2(Math.sin(d), Math.cos(d));
      prop.rotation.y = a + d * Math.min(1, dt * 14);
    }
    if ((t.type === 'micro' || t.type === 'coffee' || t.type === 'noodle' || t.type === 'eggtray') && grp.userData.win) {
      m.flash = Math.max(0, (m.flash || 0) - dt);
      grp.userData.win.material.color.set(m.flash > 0 ? (t.type === 'coffee' ? 0xc98a5a : t.type === 'noodle' || t.type === 'eggtray' ? 0xffd23f : 0xffee58) : 0x1e2230);
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
    u.hold.visible = e.wind > 0 && !!e.pending && (e.pending.kind === 'bomb' || e.pending.kind === 'barrage');
    if (u.hold.visible) { u.hold.position.y = (1.1 + (0.55 - e.wind) * 0.3) * u.big; u.hold.children[1].visible = Math.floor(time * 30) % 2 === 0; }
    grp.position.y = (e.air || 0) * 0.9;                                   // riders jumping off the motorbike
    if (u.bottle) { const up = e.wind > 0 && e.pending && e.pending.kind === 'molo'; u.bottle.position.set(up ? 0.1 : 0.2, up ? 0.95 + Math.sin(time * 30) * 0.02 : 0.3, up ? 0 : 0.05); }   // bottle held up while winding up
    if (u.batPivot) {                                                        // bat raised while winding up, then swung
      const smashing = e.wind > 0 && e.pending && e.pending.kind === 'smash', sw2 = e.swing > 0 ? e.swing / 0.3 : 0;
      u.batPivot.rotation.x = smashing ? -2.3 : sw2 > 0 ? -2.3 + (1 - sw2) * 3.5 : 0;
    }
    if (u.wheels) {                                                          // motorbike: wheels spin, exhaust puffs, wrecked after the crash
      const ride = e.moto === 'ride' || (e.bk === 'motoduo' && !e.parked && !e.spin && !e.rev), crash = e.moto === 'crash';
      for (const w of u.wheels) w.rotation.x -= dt * (ride ? 32 : 0);
      u.legs[0].rotation.x = u.legs[1].rotation.x = 0;
      u.body.position.y = ride ? Math.abs(Math.sin(time * 40)) * 0.015 : e.rev ? Math.abs(Math.sin(time * 70)) * 0.03 : 0;
      if (e.rev) for (const w of u.wheels) w.rotation.x -= dt * 45;   // engine charging: the bike shakes, the back wheel screams
      u.body.rotation.x = crash ? -0.45 + Math.sin(time * 50) * 0.03 : ride ? -0.06 : 0;
      u.body.rotation.z = crash ? Math.sin(time * 30) * 0.12 : e.rev ? Math.sin(time * 65) * 0.05 : 0;
      if ((m.dust = (m.dust || 0) - dt) <= 0) { m.dust = ride ? 0.05 : 0.12; if (e.rev) { m.dust = 0.035; this.puff(e.x - Math.sin(e.angle) * 0.5, e.y - Math.cos(e.angle) * 0.5, 0.3, Math.random() < 0.5 ? 0x4a4a52 : 0x8a8a92, 1.0, 1.1, 1.0); } else if (ride) {
        this.puff(e.x, e.y, 0.22, 0xb9b3a4, 0.45, 0.4, 0.4);
        if (e.bk === 'motoduo') { const bx = e.x - Math.sin(e.angle) * 0.55, by = e.y - Math.cos(e.angle) * 0.55; this.puff(bx, by, 0.32, Math.random() < 0.5 ? 0x5a5a62 : 0x8a8a92, 0.7, 0.75, 0.8); }   // exhaust smoke trailing behind the tandem
      } else if (crash) this.puff(e.x, e.y, 0.5, 0x55556a, 0.8, 1.0, 0.8); }
    }
    if (u.door) {                                                            // Door Robber: shield door up front; raised overhead for the slam, gone once it breaks
      u.door.visible = e.shield > 0 && !e.doorOut;   // the door is in the air
      const slamming = e.wind > 0 && e.pending && (e.pending.kind === 'slam' || e.pending.kind === 'doorThrow'), want = slamming ? 1 : 0;
      m.dl = (m.dl || 0) + (want - (m.dl || 0)) * Math.min(1, dt * (slamming ? 6 : 22));
      u.door.position.y = 0.02 + m.dl * 0.55; u.door.position.z = 0.34 - m.dl * 0.18; u.door.rotation.x = -m.dl * 1.1;
      if (e.shield > 0 && e.shieldMax) { const k = e.shield / e.shieldMax; u.door.rotation.z = k < 0.35 ? Math.sin(time * 30) * 0.03 : 0; }
    }
    if (e.bk === 'gunslinger' && e.wind > 0 && e.pending && e.pending.kind === 'summon') u.body.rotation.x = -0.3 + Math.sin(time * 30) * 0.05;   // rears back to call his gunners
    m.fl = (m.fl || 0) - dt;
    if (e.burn > 0 && m.fl <= 0) { m.fl = 0.05; this.flame(e.x, e.y, (0.25 + Math.random() * 0.55) * u.big); }       // on fire!
    if (e.soak > 0 && (m.sk = (m.sk || 0) - dt) <= 0) { m.sk = 0.07; this.trailDrop(wx(e.x), (0.25 + Math.random() * 0.6) * u.big, wz(e.y), COLA_PAL, -0.5, 0.7); }   // soaked in cola: fizz rising off them
    if (e.dash && (m.dust = (m.dust || 0) - dt) <= 0) { m.dust = 0.04; this.burst(e.x, e.y, 0.1, 0xe9ddc0, 2, 1, 0.9); }   // dash dust trail
    if (e.flash > 0) m.hitT = 0.13;                                         // hit: the whole burglar flashes white
    if ((m.hitT || 0) > 0 || m.hitOn) this.enemyFlash(m, (m.hitT || 0) > 0 ? Math.min(1, m.hitT / 0.13) : 0);
    if (m.hitT > 0) m.hitT -= dt;
    if (e.enraged) {   // boss phase 2: burning outline, flame particles around the body and a pulsing glow (no banner)
      if (!m.rage) {
        m.rage = true; m.rageOl = this.olMat.clone();
        grp.traverse(o => { if (o.userData.ol) o.material = m.rageOl; });
        const sp = new THREE.Sprite(this.glowMat().clone()); sp.scale.setScalar(3.1 * (u.big || 1)); sp.position.y = 0.75 * (u.big || 1); sp.renderOrder = 5; grp.add(sp); m.rageGlow = sp;
        this.ringFx(e.x, e.y, 2.4, 0xff7a1a); this.burst(e.x, e.y, 0.7, 0xff9a2a, 14, 3, 1.1); this.shake = Math.max(this.shake, 0.35);
      }
      const pu = 0.5 + 0.5 * Math.sin(time * 9 + e.id), big = u.big || 1;
      m.rageOl.color.setRGB(1, 0.3 + 0.35 * pu, 0.05);
      m.rageGlow.material.opacity = 0.55 + 0.3 * pu; m.rageGlow.scale.setScalar((2.9 + 0.5 * pu) * big);
      if ((m.rf = (m.rf || 0) - dt) <= 0) {
        m.rf = 0.03;
        for (let i = 0; i < 2; i++) {   // flames licking up the silhouette
          const a = Math.random() * Math.PI * 2, rr = (0.22 + Math.random() * 0.2) * big;
          this.fireBit(e.x + Math.cos(a) * rr, (0.1 + Math.random() * 1.0) * big, e.y + Math.sin(a) * rr, 1.3 * big, 0.6);
        }
        if (Math.random() < 0.5) this.flame(e.x + (Math.random() - 0.5) * 0.4 * big, e.y + (Math.random() - 0.5) * 0.4 * big, (0.3 + Math.random() * 0.7) * big);
      }
    }
    const r = Math.max(0, e.hp / e.maxhp);
    u.bar.visible = r < 0.999; u.bar.quaternion.copy(this.camera.quaternion);
    u.fg.scale.set(0.58 * r, 0.07, 1); u.fg.position.x = -0.29 * (1 - r);
    u.st.burn.visible = e.burn > 0 && Math.floor(time * 12) % 2 === 0;
    u.st.slow.visible = e.slow > 0; u.st.stun.visible = stunned;
    u.st.flee.visible = e.flee > 0 && Math.floor(time * 10) % 2 === 0; u.st.wind.visible = e.wind > 0;
    for (const k of ['burn', 'slow', 'stun', 'flee', 'wind']) u.st[k].quaternion.copy(this.camera.quaternion);
  }
}
