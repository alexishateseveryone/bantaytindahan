// Cigarette pack (the skill item that lobs 20 lit cigarettes) and a single lit cigarette in flight.
import * as THREE from 'three';

export function makeCigPack(v, s = 1) {
  const g = new THREE.Group(), pack = new THREE.Group(); pack.position.y = 0.28 * s; g.add(pack);
  const P = (geo, c, sx, sy, sz, x, y, z, sh = true) => v.part(pack, geo, c, sx * s, sy * s, sz * s, x * s, y * s, z * s, sh);
  P(v.box, 0xf3f0e8, 0.34, 0.46, 0.14, 0, 0, 0);               // white body
  P(v.box, 0xd62828, 0.346, 0.17, 0.146, 0, 0.145, 0, false);   // red top band
  P(v.box, 0xd9a93a, 0.348, 0.025, 0.148, 0, 0.055, 0, false);  // gold stripe
  P(v.box, 0x1b1b24, 0.1, 0.07, 0.15, 0, -0.1, 0, false);       // little label
  const tops = [];
  for (let i = 0; i < 5; i++) {                                  // cigarettes poking out of the open top
    const x = (i - 2) * 0.062, h = 0.1 + (i % 2) * 0.04;
    P(v.cyl, 0xf3f0e8, 0.022, h, 0.022, x, 0.23 + h / 2 - 0.02, 0.0);
    tops.push(P(v.cyl, 0xe8a33d, 0.023, 0.06, 0.023, x, 0.23 + h - 0.0, 0.0, false));
  }
  g.userData.pack = pack; g.userData.tops = tops;
  return g;
}

export function animCigPack(g, sk, time, v) {
  const k = Math.max(0, sk.kick || 0);                           // every launched cigarette kicks the pack
  g.userData.pack.rotation.z = Math.sin(time * 60) * 0.08 * k;
  g.userData.pack.scale.set(1 + 0.06 * k, 1 - 0.1 * k, 1 + 0.06 * k);
  if (v && k > 0.4 && Math.random() < 0.6) { v.burst(sk.x, sk.y, 0.62, 0xff8c1a, 1, 1.4, 0.5); v.puff(sk.x, sk.y, 0.62, 0x9a9aa8, 0.4, 0.7, 0.4); }
}

// a lit cigarette flying through the air: white paper, orange filter, glowing ember tip
export function makeLitCig(v) {
  const g = new THREE.Group(), cig = new THREE.Group(); g.add(cig);
  const P = (geo, mat, sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); cig.add(m); return m; };
  P(v.cyl, v.toon(0xf3f0e8), 0.03, 0.2, 0.03, 0, 0.03, 0);
  P(v.cyl, v.toon(0xe8a33d), 0.031, 0.07, 0.031, 0, -0.15, 0);
  P(v.cyl, v.basic(0xff5a1f), 0.032, 0.035, 0.032, 0, 0.255, 0);
  P(v.sph, v.basic(0xffd23f), 0.035, 0.035, 0.035, 0, 0.28, 0);
  cig.rotation.z = Math.PI / 2;                                  // lies along the flight direction
  g.userData.cig = cig;
  return g;
}