// Cigarette pack (the skill item that lobs 24 lit cigarettes one by one) and a single lit cigarette in flight.
import * as THREE from 'three';
import { ITEMS } from '../game.js';

export function makeCigPack(v, s = 1) {
  const g = new THREE.Group(), pack = new THREE.Group(); pack.position.y = 0.26 * s; g.add(pack);
  const P = (geo, c, sx, sy, sz, x, y, z, sh = true, par = pack) => v.part(par, geo, c, sx * s, sy * s, sz * s, x * s, y * s, z * s, sh);
  P(v.box, 0xf3f0e8, 0.34, 0.34, 0.14, 0, -0.08, 0);               // white body
  P(v.box, 0xd62828, 0.346, 0.09, 0.146, 0, -0.17, 0, false);      // red base band
  P(v.box, 0xd9a93a, 0.348, 0.022, 0.148, 0, -0.04, 0, false);     // gold stripe
  P(v.box, 0x1b1b24, 0.12, 0.07, 0.15, 0, -0.1, 0, false);         // label
  P(v.box, 0xffe9a8, 0.05, 0.02, 0.152, 0, -0.1, 0, false);
  const hinge = new THREE.Group(); hinge.position.set(0, 0.09 * s, -0.07 * s); pack.add(hinge);   // flip-top lid on a back hinge
  P(v.box, 0xd62828, 0.346, 0.15, 0.146, 0, 0.078, 0.07, true, hinge);
  P(v.box, 0xd9a93a, 0.348, 0.02, 0.148, 0, 0.03, 0.07, false, hinge);
  const tops = [];   // 24 cigarettes: 6 across x 4 deep, filters up
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
    const x = (i - 2.5) * 0.052, z = (j - 1.5) * 0.03, h = 0.09 + ((i * 3 + j * 5) % 4) * 0.018;
    const c = new THREE.Group(); c.position.set(x * s, 0.1 * s, z * s); pack.add(c);
    P(v.cyl, 0xf3f0e8, 0.026, h, 0.026, 0, h / 2 - 0.04, 0, false, c);
    P(v.cyl, 0xe8a33d, 0.027, 0.045, 0.027, 0, h - 0.04 - 0.012, 0, false, c);
    tops.push(c);
  }
  tops.sort(() => Math.random() - 0.5);
  hinge.rotation.x = -0.9;   // lid half open so the cigarettes show (also in the menu icon)
  g.userData = { pack, tops, hinge };
  return g;
}

export function animCigPack(g, sk, time, v) {
  const u = g.userData, k = Math.max(0, sk.kick || 0), count = ITEMS.cigs.count;
  const gone = Math.max(0, count - (sk.left ?? count)), firing = gone > 0 && (sk.left || 0) > 0;
  u.hinge.rotation.x = -(gone > 0 ? 1.9 : 0.5 + Math.sin(time * 5) * 0.08);          // lid flips back when the firing starts
  u.tops.forEach((c, i) => { c.visible = i >= gone; });                              // one cigarette leaves per shot
  u.pack.position.y = (0.26 + 0.06 * k) * 1;                                          // hops with every launch
  u.pack.rotation.z = Math.sin(time * 60) * 0.1 * k; u.pack.rotation.x = Math.sin(time * 40) * 0.05 * k;
  u.pack.scale.set(1 + 0.07 * k, 1 - 0.12 * k, 1 + 0.07 * k);
  if (v && k > 0.3) { v.burst(sk.x, sk.y, 0.62, 0xff8c1a, 2, 1.8, 0.6); v.puff(sk.x, sk.y, 0.62, 0x9a9aa8, 0.5, 0.8, 0.5); }
  if (v && firing && Math.random() < 0.12) v.puff(sk.x, sk.y, 0.5, 0x9a9aa8, 0.4, 0.5, 0.7);   // smoke curling off the open pack
  if (v && (sk.left || 0) <= 0 && sk.t > 0) v.puff(sk.x, sk.y, 0.4, 0x55556a, 0.6, 0.6, 0.6);  // last gasp
}

// a lit cigarette flying through the air: white paper, orange filter, grey ash, glowing ember tip
export function makeLitCig(v) {
  const g = new THREE.Group(), cig = new THREE.Group(); g.add(cig);
  const P = (geo, mat, sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); cig.add(m); return m; };
  P(v.cyl, v.toon(0xf3f0e8), 0.032, 0.22, 0.032, 0, 0.03, 0);
  P(v.cyl, v.toon(0xe8a33d), 0.033, 0.08, 0.033, 0, -0.16, 0);
  P(v.cyl, v.toon(0x8a8a94), 0.034, 0.03, 0.034, 0, 0.155, 0);     // ash
  P(v.cyl, v.basic(0xff5a1f), 0.036, 0.04, 0.036, 0, 0.19, 0);
  const ember = P(v.sph, v.basic(0xffd23f), 0.045, 0.045, 0.045, 0, 0.215, 0);
  P(v.sph, v.basic(0xff8c1a), 0.07, 0.07, 0.07, 0, 0.215, 0).material = new THREE.MeshBasicMaterial({ color: 0xff8c1a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });   // glow
  cig.rotation.z = Math.PI / 2;                                    // lies along the flight direction
  g.userData.cig = cig; g.userData.ember = ember;
  return g;
}