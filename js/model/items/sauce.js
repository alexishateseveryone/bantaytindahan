// Hot Sauce LOBBER: a bottle-mortar that arcs a glob of sauce over the shelves.
// The glob (projectile) is lobbed, trails burning droplets, and splashes where it lands.
import * as THREE from 'three';
import { ITEMS } from '../../game.js';
import { cabinet, aimProp } from './shared.js';

export function makeSauce(v, t) {
  const g = new THREE.Group(); cabinet(v, g, ITEMS.sauce.color);
  const prop = aimProp(g);
  // splayed legs / cradle
  v.part(prop, v.box, 0x2d2d3a, 0.44, 0.08, 0.5, 0, 0.04, -0.02);
  v.part(prop, v.box, 0x2d2d3a, 0.06, 0.22, 0.3, -0.2, 0.15, -0.08);
  v.part(prop, v.box, 0x2d2d3a, 0.06, 0.22, 0.3, 0.2, 0.15, -0.08);
  // the tilted bottle (tube) pointing forward + up like a mortar
  const tube = new THREE.Group(); tube.position.set(0, 0.2, -0.1); tube.rotation.x = 0.95; prop.add(tube);
  v.part(tube, v.cyl, 0xd62828, 0.2, 0.52, 0.2, 0, 0.26, 0);
  v.part(tube, v.cyl, 0xa81d1d, 0.205, 0.06, 0.205, 0, 0.05, 0, false);
  v.part(tube, v.cyl, 0xd62828, 0.11, 0.2, 0.11, 0, 0.62, 0);
  v.part(tube, v.cyl, 0xfff3b0, 0.13, 0.07, 0.13, 0, 0.74, 0);
  v.part(tube, v.cone, 0xfff3b0, 0.09, 0.12, 0.09, 0, 0.82, 0);
  v.part(tube, v.box, 0xffe8a0, 0.24, 0.24, 0.05, 0, 0.28, 0.19, false);
  v.part(tube, v.box, 0x2d8a34, 0.11, 0.14, 0.05, 0, 0.28, 0.215, false);
  v.part(tube, v.box, 0x2d8a34, 0.03, 0.05, 0.05, 0, 0.38, 0.215, false);
  g.userData.tube = tube; g.userData.top = 1.2;
  return g;
}

// a fat wobbling glob of sauce
export function makeSauceProjectile(v, p) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(v.sph, v.basic(0xd62828)); core.scale.setScalar(0.2); g.add(core);
  const mid = new THREE.Mesh(v.sph, v.basic(0xff5a1f)); mid.scale.setScalar(0.14); mid.position.set(0.02, 0.03, 0.02); g.add(mid);
  const hot = new THREE.Mesh(v.sph, v.basic(0xffd23f)); hot.scale.setScalar(0.07); hot.position.set(0.04, 0.06, 0.04); g.add(hot);
  g.userData.core = core; g.userData.drips = [];
  for (let i = 0; i < 3; i++) {
    const d = new THREE.Mesh(v.sph, v.basic(i % 2 ? 0xff5a1f : 0xd62828)); d.scale.setScalar(0.06 + i * 0.012); g.add(d); g.userData.drips.push(d);
  }
  return g;
}
