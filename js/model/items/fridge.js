// Fridge: a tall freezer. NOT a turret: it never turns, milk, ice cream and bags of ice pop out of its front chute.
import * as THREE from 'three';
import { ITEMS } from '../../game.js';

export function makeFridge(v, t) {
  const g = new THREE.Group(), color = ITEMS.fridge.color;
  v.part(g, v.box, 0x2c2845, 0.84, 0.08, 0.7, 0, 0.04, 0);
  v.part(g, v.box, 0xe9f4fa, 0.8, 1.3, 0.62, 0, 0.73, 0);                 // white body
  v.part(g, v.box, color, 0.82, 0.05, 0.64, 0, 1.4, 0, false);            // icy top
  v.part(g, v.box, 0xcfe9f5, 0.74, 0.5, 0.04, 0, 1.0, 0.32, false);       // freezer door
  v.part(g, v.box, 0xcfe9f5, 0.74, 0.62, 0.04, 0, 0.45, 0.32, false);     // fridge door
  v.part(g, v.box, 0x9aa7b3, 0.03, 0.2, 0.05, 0.3, 1.0, 0.35, false);     // handles
  v.part(g, v.box, 0x9aa7b3, 0.03, 0.24, 0.05, 0.3, 0.55, 0.35, false);
  v.glow(g, 0x6fd6ff, 0.34, 0.06, 0.03, -0.12, 1.2, 0.34);                // frost light
  // snacks stuck on the doors: milk carton + ice cream cone
  v.part(g, v.box, 0xffffff, 0.12, 0.16, 0.1, -0.2, 0.62, 0.36, false);
  v.part(g, v.box, 0x3a86ff, 0.12, 0.05, 0.1, -0.2, 0.72, 0.36, false);
  v.part(g, v.cone, 0xd9a25a, 0.09, 0.14, 0.09, -0.02, 0.58, 0.36, false);
  v.part(g, v.sph, 0xff9ec4, 0.1, 0.1, 0.1, -0.02, 0.69, 0.36, false);
  v.part(g, v.box, 0x1b1d28, 0.5, 0.18, 0.05, -0.05, 0.22, 0.32, false);  // output chute
  g.userData.flap = v.part(g, v.box, 0x363a48, 0.44, 0.12, 0.02, -0.05, 0.22, 0.35, false);
  g.userData.prop = null; g.userData.pipZ = 0.38; g.userData.pipY = 0.1; g.userData.top = 1.6;
  return g;
}

const ball = (v, color, s, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(v.sph, v.basic(color)); m.scale.setScalar(s); m.position.set(x, y, z); return m; };

// milk carton
export function makeMilkProjectile(v, p) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(v.box, v.basic(0xffffff)); body.scale.set(0.16, 0.22, 0.16); g.add(body);
  const top = new THREE.Mesh(v.box, v.basic(0x3a86ff)); top.scale.set(0.16, 0.07, 0.16); top.position.y = 0.14; g.add(top);
  const label = new THREE.Mesh(v.box, v.basic(0x6fa8ff)); label.scale.set(0.1, 0.08, 0.17); label.position.y = -0.02; g.add(label);
  g.userData.core = g;
  return g;
}

// ice cream scoop on a cone
export function makeIceCreamProjectile(v, p) {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(v.cone, v.basic(0xd9a25a)); cone.scale.set(0.13, 0.22, 0.13); cone.rotation.x = Math.PI; g.add(cone);
  g.add(ball(v, 0xff9ec4, 0.17, 0, 0.14, 0));
  g.add(ball(v, 0xfff3d6, 0.12, 0.02, 0.26, 0));
  g.userData.core = g;
  return g;
}

// a lobbed bag of ice cubes; on landing the game scatters them on the floor ('iceBurst' event carries the cube positions)
export function makeIceProjectile(v, p) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(v.box, v.basic(i % 2 ? 0xbfeaff : 0x8fd3f4));
    c.scale.setScalar(0.11 + i * 0.01); c.position.set((i - 1.5) * 0.06, (i % 2) * 0.06, (i % 3 - 1) * 0.05); c.rotation.set(i, i * 1.3, 0); g.add(c);
  }
  g.userData.core = g;
  return g;
}

// one ice cube lying on the floor (for the view to place at each cube in an 'iceBurst' event)
export function makeIceCube(v) {
  const c = new THREE.Mesh(v.box, v.basic(0xbfeaff)); c.scale.setScalar(0.16); c.position.y = 0.08; return c;
}