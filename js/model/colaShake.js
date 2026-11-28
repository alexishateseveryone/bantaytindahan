// Shaken cola: a contoured cola bottle that trembles, foams and splashes the grid around it, then erupts.
// While the fuse burns, the tiles it will blast blink like a grid, and foam drips land on the nearby cells.
import * as THREE from 'three';
import { COLS, ROWS } from '../game.js';

export function makeShakenCola(v, s = 1, radius = 0) {
  const g = new THREE.Group(), bottle = new THREE.Group(); g.add(bottle);
  const P = (geo, c, sx, sy, sz, x, y, z, sh = true) => v.part(bottle, geo, c, sx * s, sy * s, sz * s, x * s, y * s, z * s, sh);
  P(v.cyl, 0x2a140c, 0.125, 0.05, 0.125, 0, 0.045, 0);        // base
  P(v.cyl, 0x3b1f14, 0.14, 0.3, 0.14, 0, 0.22, 0);            // dark cola body
  P(v.cyl, 0xd6262b, 0.146, 0.13, 0.146, 0, 0.22, 0, false);  // red label
  P(v.cyl, 0xffffff, 0.15, 0.022, 0.15, 0, 0.255, 0, false);  // white swoosh
  P(v.cyl, 0xffffff, 0.15, 0.012, 0.15, 0, 0.19, 0, false);
  P(v.cyl, 0x3b1f14, 0.118, 0.06, 0.118, 0, 0.4, 0);          // shoulders, narrowing up
  P(v.cyl, 0x3b1f14, 0.088, 0.06, 0.088, 0, 0.45, 0);
  P(v.cyl, 0x3b1f14, 0.058, 0.14, 0.058, 0, 0.55, 0);         // neck
  P(v.cyl, 0xe8d9c0, 0.07, 0.02, 0.07, 0, 0.62, 0, false);    // neck ring
  const cap = P(v.cyl, 0xd6262b, 0.072, 0.045, 0.072, 0, 0.655, 0);   // cap: lifts and wobbles before it blows
  P(v.box, 0xffffff, 0.015, 0.2, 0.015, -0.06, 0.2, 0.062, false);   // glass glint
  const bub = [];   // bubbles racing up inside the bottle
  for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(v.sph, v.basic(0xc98a5a)); b.scale.setScalar(0.022 * s); bottle.add(b); bub.push(b); }
  const foam = [];
  for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(v.sph, v.basic(i % 2 ? 0xffffff : 0xf0dcc4)); f.scale.setScalar(0.05); f.position.set(0, 0.68, 0); f.visible = false; bottle.add(f); foam.push(f); }
  g.userData = { bottle, foam, cap, bub, tiles: [] };
  if (radius > 0) {   // blast area as GRID TILES that blink faster as the fuse runs out
    const rc = Math.ceil(radius), tiles = [], tm = new THREE.MeshBasicMaterial({ color: 0xc98a5a, transparent: true, opacity: 0.3 });
    for (let i = -rc; i <= rc; i++) for (let j = -rc; j <= rc; j++) {
      const d = Math.hypot(i, j); if (d > radius + 0.3) continue;
      const t = new THREE.Mesh(v.box, tm); t.scale.set(0.9, 0.012, 0.9); t.position.set(i, 0.065, j); t.castShadow = false; g.add(t); tiles.push({ t, i, j, d });
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 32), new THREE.MeshBasicMaterial({ color: 0xc98a5a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.075; ring.scale.setScalar(radius); g.add(ring);
    g.userData.ring = ring; g.userData.tiles = tiles; g.userData.tm = tm; g.userData.radius = radius;
  }
  return g;
}

export function animShakenCola(g, sk, time, v) {
  const u = g.userData, prog = 1 - Math.max(0, sk.t) / sk.max, a = 0.015 + prog * 0.055;
  u.bottle.position.set(Math.sin(time * 70) * a, Math.abs(Math.sin(time * 22)) * 0.03 * prog, Math.cos(time * 63) * a);
  u.bottle.rotation.z = Math.sin(time * 55) * (0.05 + prog * 0.2); u.bottle.rotation.x = Math.cos(time * 48) * prog * 0.17;
  u.bottle.scale.setScalar(1 + Math.sin(time * 40) * 0.03 * prog + prog * 0.1);
  u.cap.position.y = 0.655 + prog * prog * 0.05 + Math.max(0, Math.sin(time * 35)) * 0.015 * prog; u.cap.rotation.y = time * 14 * prog;
  u.bub.forEach((b, i) => { const k = (time * (0.8 + prog * 2.2) + i * 0.37) % 1; b.position.set(Math.sin(i * 2.3 + time * 3) * 0.04, 0.1 + k * 0.4, Math.cos(i * 2.3) * 0.04); });
  u.foam.forEach((f, i) => {
    f.visible = prog > 0.1 + i * 0.1;
    f.scale.setScalar(0.04 + prog * 0.06 + Math.sin(time * 30 + i * 2) * 0.012);
    f.position.set(Math.sin(time * 9 + i * 1.7) * 0.06, 0.68 + ((time * 1.8 + i * 0.3) % 1) * 0.16 * prog, Math.cos(time * 9 + i * 1.7) * 0.06);
  });
  if (u.ring) {
    if (!u.placed) {   // hide tiles that fall outside the room
      u.placed = true;
      for (const q of u.tiles) { const x = sk.x + q.i, y = sk.y + q.j; q.t.visible = x >= 0 && y >= 0 && x < COLS && y < ROWS; }
    }
    const on = Math.floor(time * (4 + prog * 16)) % 2 === 0;
    u.ring.material.opacity = on ? 0.95 : 0.35; u.tm.opacity = on ? 0.38 : 0.12;
    for (const q of u.tiles) { const w = 0.5 + 0.5 * Math.sin(time * 6 - q.d * 2.2); q.t.scale.set(0.8 + 0.1 * w, 0.012, 0.8 + 0.1 * w); }   // ripple through the tiles
  }
  if (!v) return;
  if (Math.random() < prog * 0.5) v.puff(sk.x, sk.y, 0.74, 0xffffff, 0.45, 0.9, 0.4);            // fizz out of the cap
  if (prog > 0.25 && Math.random() < prog * 0.12) {   // foam drips land on the cells around the bottle (trail splashes on the grid)
    const a2 = Math.random() * Math.PI * 2, r = 0.7 + Math.random() * Math.min(1.8, (u.radius || 2) - 0.5), cx = Math.round(sk.x + Math.cos(a2) * r), cy = Math.round(sk.y + Math.sin(a2) * r);
    if (cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS) { v.cellStain(cx, cy, 0x6b3a22, 1.4, 0.5); v.burst(cx, cy, 0.2, 0xffffff, 3, 1.2, 0.7); }
  }
  if (prog > 0.2 && Math.random() < prog * 0.3) v.burst(sk.x, sk.y, 0.75, Math.random() < 0.5 ? 0xffffff : 0x6b3a22, 2, 1.6, 0.8);   // spurts arcing out of the neck
}