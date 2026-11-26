// Shaken cola: a cola bottle that trembles and foams on the floor, then erupts. Shows its blast radius as a ring.
import * as THREE from 'three';

export function makeShakenCola(v, s = 1, radius = 0) {
  const g = new THREE.Group(), bottle = new THREE.Group(); g.add(bottle);
  const P = (geo, c, sx, sy, sz, x, y, z, sh = true) => v.part(bottle, geo, c, sx * s, sy * s, sz * s, x * s, y * s, z * s, sh);
  P(v.cyl, 0x3b1f14, 0.13, 0.34, 0.13, 0, 0.2, 0);          // dark cola
  P(v.cyl, 0xd6262b, 0.135, 0.13, 0.135, 0, 0.2, 0, false);   // red label
  P(v.cyl, 0xffffff, 0.138, 0.025, 0.138, 0, 0.2, 0, false);  // white stripe
  P(v.cyl, 0x3b1f14, 0.1, 0.08, 0.1, 0, 0.41, 0);            // shoulder
  P(v.cyl, 0x3b1f14, 0.055, 0.14, 0.055, 0, 0.52, 0);        // neck
  P(v.cyl, 0xd6262b, 0.068, 0.05, 0.068, 0, 0.6, 0);         // cap
  const foam = [];
  for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(v.sph, v.basic(0xffffff)); f.scale.setScalar(0.05); f.position.set(0, 0.64, 0); f.visible = false; bottle.add(f); foam.push(f); }
  g.userData.bottle = bottle; g.userData.foam = foam;
  if (radius > 0) {   // blast radius, blinking faster as it gets ready to go off
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 32), new THREE.MeshBasicMaterial({ color: 0xc98a5a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07; ring.scale.setScalar(radius); g.add(ring);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: 0xc98a5a, transparent: true, opacity: 0.16, side: THREE.DoubleSide }));
    fill.rotation.x = -Math.PI / 2; fill.position.y = 0.065; fill.scale.setScalar(radius); g.add(fill);
    g.userData.ring = ring; g.userData.fill = fill;
  }
  return g;
}

export function animShakenCola(g, sk, time, v) {
  const u = g.userData, prog = 1 - Math.max(0, sk.t) / sk.max, a = 0.015 + prog * 0.05;
  u.bottle.position.set(Math.sin(time * 70) * a, 0, Math.cos(time * 63) * a);
  u.bottle.rotation.z = Math.sin(time * 55) * (0.05 + prog * 0.18); u.bottle.rotation.x = Math.cos(time * 48) * prog * 0.15;
  u.bottle.scale.setScalar(1 + Math.sin(time * 40) * 0.03 * prog + prog * 0.08);
  u.foam.forEach((f, i) => {
    f.visible = prog > 0.15 + i * 0.12;
    f.scale.setScalar(0.04 + prog * 0.05 + Math.sin(time * 30 + i * 2) * 0.01);
    f.position.set(Math.sin(time * 9 + i * 1.7) * 0.05, 0.66 + ((time * 1.5 + i * 0.3) % 1) * 0.12 * prog, Math.cos(time * 9 + i * 1.7) * 0.05);
  });
  if (u.ring) {
    const on = Math.floor(time * (4 + prog * 16)) % 2 === 0;
    u.ring.material.opacity = on ? 0.95 : 0.35; u.fill.material.opacity = on ? 0.26 : 0.08;
  }
  if (v && Math.random() < prog * 0.4) v.puff(sk.x, sk.y, 0.72, 0xffffff, 0.45, 0.9, 0.4);   // fizz spraying out of the cap
}