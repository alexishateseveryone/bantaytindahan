// Soda Fizz turret + its spray projectile.
import * as THREE from 'three';
import { ITEMS } from '../../game.js';
import { cabinet, aimProp } from './shared.js';

export function makeSoda(v, t) {
  const g = new THREE.Group(); cabinet(v, g, ITEMS.soda.color);
  const prop = aimProp(g);
  v.part(prop, v.cyl, 0xffffff, 0.26, 0.52, 0.26, 0, 0.27, 0);
  v.part(prop, v.cyl, 0xe63946, 0.275, 0.2, 0.275, 0, 0.25, 0);
  v.part(prop, v.cyl, 0x8fe3d5, 0.27, 0.07, 0.27, 0, 0.56, 0, false);
  const nozzle = v.part(prop, v.cyl, 0x2d2d3a, 0.07, 0.34, 0.07, 0, 0.55, 0.2); nozzle.rotation.x = Math.PI / 2;
  g.userData.top = 1.25;
  return g;
}

// a little cloud of droplets (the trail is dropped by the view)
export function makeSprayProjectile(v, p) {
  const g = new THREE.Group(); g.userData.drops = [];
  [0x7df0d8, 0xffffff, 0xb8fff2, 0x2fb6a6, 0xffffff].forEach((c, i) => {
    const m = new THREE.Mesh(v.sph, v.basic(c)); m.scale.setScalar(i === 0 ? 0.11 : 0.06 + (i % 3) * 0.015);
    g.add(m); g.userData.drops.push(m);
  });
  return g;
}
