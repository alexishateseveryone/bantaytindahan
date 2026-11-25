// Three.js view: flat toon materials + low-res render target upscaled with nearest filtering (pixel look)
import * as THREE from 'three';
import { COLS, ROWS, ITEMS, MAX_STOCK, BOMB_RADIUS } from './game.js';   // COLS/ROWS are live bindings: the room size changes per game
import { makeItem, makeShelf, setShelfGoods, makeCan, makeEnemy, makeCustomer, makeProjectile,
  makeGroundBomb, animGroundBomb, makeFire, animFire } from './model/index.js';

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
    const c = this.camera; c.left = -halfW; c.right = halfW; c.top = halfH; c.bottom = -halfH;
    c.updateProjectionMatrix();
  }

  // ---------- store set dressing (rebuilt per game; the shapes live in js/model/) ----------
  setGame(game) {
    this.game = game;
    OX = (COLS - 1) / 2; OZ = (ROWS - 1) / 2;
    const e = side => side === 'top' ? 1.7 : game.doorSide === side ? 3.2 : 0.5;   // how far each side sticks out of the floor: counter strip on top, sidewalk on the door side
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
    const lane = (x, y) => y === 0 ? 'counter'
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
    const off = side => side === cs ? 1.45 : 0.25, H = side => side === 'top' ? 1.6 : side === 'bottom' ? 0.55 : 1.1;
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
    return { group: S, clerk };
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
    } else obj = makeItem(this, { type, id: 1, level: 1 });
    if (type === 'fridge') obj.scale.setScalar(0.78);
    obj.position.set(0, 0, 0); scene.add(obj);
    const cam = new THREE.OrthographicCamera(-0.98, 0.98, 0.98, -0.98, 0.1, 20);
    cam.position.set(2.4, 2.5, 3.0); cam.lookAt(0, type === 'mop' ? 0.35 : type === 'cans' ? 0.62 : 0.5, 0);
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

  setCursor(c, valid) {
    if (!c) { this.cursor.visible = false; return; }
    this.cursor.visible = true; this.cursor.position.set(wx(c.x), 0.04, wz(c.y));
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
  // splintering shelf: planks tumble, goods scatter, dust ring
  debris(sh) {
    const wood = [0xa0703f, 0x8f6a4a, 0xb07d4a][sh.v], pc = [0xff5a5f, 0xffcf4a, 0x5fe3a1, 0x6fa8ff, 0xffffff];
    const piece = (color, sx, sy, sz, spd, life) => {
      const m = new THREE.Mesh(this.box, this.basic(color)); m.scale.set(sx, sy, sz);
      m.position.set(wx(sh.x) + (Math.random() - 0.5) * 0.5, 0.3 + Math.random() * 0.7, wz(sh.y) + (Math.random() - 0.5) * 0.7); this.scene.add(m);
      this.fx.push({ m, vx: (Math.random() - 0.5) * spd, vy: 2 + Math.random() * spd, vz: (Math.random() - 0.5) * spd, life, t: 0, s: 1, sx, sy, sz, spin: [(Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14], lateShrink: true });
    };
    for (let i = 0; i < 9; i++) piece(i % 2 ? wood : 0x6b4526, 0.1, 0.07, 0.34 + Math.random() * 0.3, 4.5, 1.1 + Math.random() * 0.5);
    for (let i = 0; i < 4 + sh.units * 2; i++) piece(pc[(i + sh.v) % 5], 0.13, 0.15, 0.13, 5, 1.0 + Math.random() * 0.5);
    this.burst(sh.x, sh.y, 0.5, 0xe9ddc0, 14, 3, 1.6);
    this.ringFx(sh.x, sh.y, 1.4, 0xe9ddc0);
    this.shake = Math.max(this.shake, 0.3);
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
    else if (type === 'canHit') { this.scatterCans(d.x, d.y, d.dx, d.dy, d.color); this.burst(d.x, d.y, 0.5, 0xffffff, 4, 1.8); }
    else if (type === 'buy') { this.burst(d.x, d.y, 0.9, 0xffcf4a, 4, 1.6); const o = this.meshes.get(d.id); if (o) { o.kick = 0.18; o.flash = 0.35; } }
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
    else if (type === 'push') this.burst(d.shelf.x, d.shelf.y, 0.6, 0xc08a50, 3, 1.8);
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
    else if (type === 'bombLand') this.burst(d.x, d.y, 0.2, 0xe9ddc0, 5, 1.2, 1);
    else if (type === 'explode') {
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
    else if (type === 'service' || type === 'replace') { const t = d.tower; this.ringFx(t.x, t.y, 1.1, 0x5fe3a1); this.burst(t.x, t.y, 0.8, 0x5fe3a1, 8, 2, 1); this.burst(t.x, t.y, 0.8, 0xffffff, 4, 1.6, 0.8); }
  }

  // ---------- per frame ----------
  render(dt, time) {
    const g = this.game; if (!g) return;
    // sync dynamic entities
    const seen = new Set();
    const sync = (list, make, upd) => {
      for (const o of list) {
        seen.add(o.id);
        let m = this.meshes.get(o.id);
        if (!m) { const grp = make(o); this.dyn.add(grp); m = { group: grp, lvl: 0 }; this.meshes.set(o.id, m); grp.traverse(c => { if (c.isMesh && c.castShadow === undefined) c.castShadow = true; }); }
        upd(o, m);
      }
    };
    sync(g.towers, t => this.at(makeItem(this, t), t), (t, m) => this.updTower(t, m, dt));
    sync(g.shelves, sh => this.at(makeShelf(this, sh), sh), (sh, m) => {
      const u = m.group.userData;
      if (u.stock !== sh.units) setShelfGoods(this, m.group, sh.units);
      const k = sh.hit > 0 ? 0.05 : 0;
      u.body.position.x = (Math.random() - 0.5) * k * 2; u.body.position.z = (Math.random() - 0.5) * k;
      u.body.rotation.z = sh.hit > 0 ? (Math.random() - 0.5) * 0.08 : 0;
    });
    sync(g.traps, t => this.at(makeItem(this, t), t), (t, m) => { const s = 0.7 + 0.3 * Math.min(1, t.uses / 12); m.group.scale.setScalar(s); });
    sync(g.enemies, e => makeEnemy(this, e), (e, m) => this.updEnemy(e, m, time, dt));
    sync(g.customers, c => makeCustomer(this, c), (c, m) => this.updCustomer(c, m, time, dt));
    sync(g.fires, f => this.at(makeFire(this, f), f), (f, m) => animFire(this, m.group, f, time));
    sync(g.bombs, b => this.at(makeGroundBomb(this, b), b), (b, m) => animGroundBomb(m.group, b, time));
    sync(g.projectiles, p => p.kind === 'hotdog' ? this.makeHotdogProj() : p.kind === 'ice' ? this.makeIceProj() : makeProjectile(this, p), (p, m) => {
      const grp = m.group; grp.position.set(wx(p.x), p.h, wz(p.y));
      if (p.kind === 'cans') { const c = grp.userData.can; c.tilt.rotation.x += dt * 13; c.tilt.rotation.z += dt * 8; }          // tumbling can
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
      } else if (p.kind === 'bomb') {                                                                                         // spinning bomb with a sparking fuse
        grp.rotation.z += dt * 7; grp.userData.spark.visible = Math.floor(time * 30) % 2 === 0;
        if (Math.random() < dt * 20) this.puff(p.x, p.y, p.h + 0.3, 0xffd23f, 0.5, 0.4, 0.25);
      } else if (p.kind === 'hotdog') {                                                                                       // tumbling hot dog, nose along the flight direction
        grp.rotation.y = Math.atan2(-p.dy, p.dx); grp.rotation.z += dt * 14;
        if (Math.random() < dt * 14) this.burst(p.x, p.y, p.h, 0xffd23f, 1, 0.6, 0.6);
      } else if (p.kind === 'ice') { grp.rotation.y += dt * 9; grp.rotation.x += dt * 5;
      } else grp.rotation.y += dt * 12;
      if (p.lob) {                                                                                                            // landing marker on the floor
        if (!m.mark) {
          const r = p.kind === 'bomb' ? BOMB_RADIUS : p.kind === 'ice' ? 1.0 : ITEMS.sauce.splash;
          m.mark = new THREE.Mesh(this.markGeo ||= new THREE.RingGeometry(0.88, 1, 32), new THREE.MeshBasicMaterial({ color: p.kind === 'bomb' ? 0xff3b3b : p.kind === 'ice' ? 0x8fd3f4 : 0xff8c1a, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
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
      else if (f.decal) { const k = Math.max(0.01, Math.min(1, (f.life - f.t) / (f.life * 0.4))); f.m.scale.set(f.sx * k, 0.01, f.sz * k); }
      else if (f.iceCube) {
        const y0 = 0.08, drop = Math.min(1, f.t / 0.25);
        f.m.position.y = y0 + (1 - drop) * (1 - drop) * 0.8; if (drop < 1) f.m.rotation.x += f.spin * dt;
        const k = Math.max(0.01, Math.min(1, f.t / 0.1, (f.life - f.t) / 0.6)); f.m.scale.setScalar(f.s * k);
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
        if (f.spin) {
          const onGround = f.m.position.y <= 0.051; if (onGround) { f.vx *= 0.9; f.vz *= 0.9; f.vy = 0; }
          else { f.m.rotation.x += f.spin[0] * dt; f.m.rotation.y += f.spin[1] * dt; f.m.rotation.z += f.spin[2] * dt; }
          const k = Math.min(1, (f.life - f.t) / 0.35); f.m.scale.set(f.sx * k, f.sy * k, f.sz * k);
        } else f.m.scale.setScalar(f.s * (1 - f.t / f.life));
      }
      if (f.t >= f.life) { this.scene.remove(f.m); if (f.ring) { f.m.geometry.dispose(); f.m.material.dispose(); } this.fx.splice(i, 1); }
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
      m.warn.visible = show && Math.floor(performance.now() / 280) % 2 === 0;
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
    u.body.rotation.y += (Math.atan2(Math.sin(e.angle - u.body.rotation.y), Math.cos(e.angle - u.body.rotation.y))) * Math.min(1, dt * 10);
    const stunned = e.stun > 0;
    const sw = stunned ? 0 : Math.sin(time * 9 * (0.5 + e.speed * 0.5) + e.id) * 0.5;
    u.legs[0].rotation.x = sw; u.legs[1].rotation.x = -sw;
    u.body.position.y = stunned ? 0 : Math.abs(Math.sin(time * 9 * (0.5 + e.speed * 0.5) + e.id)) * 0.05;
    u.body.rotation.z = stunned ? Math.sin(time * 20) * 0.35 : 0;
    u.body.rotation.x = e.pushing ? 0.35 + Math.sin(time * 26) * 0.12 : e.dash ? 0.55 : e.wind > 0 && e.pending && e.pending.kind === 'dash' ? -0.35 : 0;
    if (e.wind > 0) u.body.rotation.z = Math.sin(time * 42) * 0.14;
    u.hold.visible = e.wind > 0 && !!e.pending && e.pending.kind === 'bomb';
    if (u.hold.visible) { u.hold.position.y = (1.1 + (0.55 - e.wind) * 0.3) * u.big; u.hold.children[1].visible = Math.floor(time * 30) % 2 === 0; }
    m.fl = (m.fl || 0) - dt;
    if (e.burn > 0 && m.fl <= 0) { m.fl = 0.05; this.flame(e.x, e.y, (0.25 + Math.random() * 0.55) * u.big); }       // on fire!
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
