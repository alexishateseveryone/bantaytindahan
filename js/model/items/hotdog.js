// Hot Dog Launcher: a hot dog cart. NOT a turret: it never turns, hot dogs pop out of its chute at the front.
// Fired hot dogs BOUNCE from burglar to burglar (see hotdogHit in game.js).
import * as THREE from 'three';
import { ITEMS } from '../../game.js';

export function makeHotdog(v, t) {
  const g = new THREE.Group(), color = ITEMS.hotdog.color;
  v.part(g, v.box, 0x2c2845, 0.84, 0.08, 0.7, 0, 0.04, 0);              // base plate
  v.part(g, v.box, color, 0.78, 0.8, 0.6, 0, 0.48, 0);                  // cart body
  v.part(g, v.box, 0xc8321f, 0.82, 0.06, 0.64, 0, 0.9, 0, false);       // red awning trim
  v.part(g, v.box, 0xfff3b0, 0.82, 0.14, 0.64, 0, 1.0, 0, false);       // awning stripe
  v.part(g, v.box, 0xc8321f, 0.82, 0.06, 0.64, 0, 1.1, 0, false);
  v.glow(g, 0x16283a, 0.6, 0.3, 0.04, 0, 0.66, 0.31);                   // display window
  for (let i = 0; i < 3; i++) {                                          // hot dogs lined up behind the glass
    v.part(g, v.cyl, 0xd9a25a, 0.07, 0.34, 0.07, -0.17 + i * 0.17, 0.66, 0.3, false).rotation.z = Math.PI / 2;
    v.part(g, v.cyl, 0xb5382a, 0.05, 0.36, 0.05, -0.17 + i * 0.17, 0.66, 0.32, false).rotation.z = Math.PI / 2;
  }
  v.part(g, v.box, 0x1b1d28, 0.46, 0.2, 0.05, 0, 0.24, 0.31, false);    // output chute
  v.part(g, v.box, 0x6b7080, 0.46, 0.03, 0.06, 0, 0.36, 0.32, false);
  g.userData.flap = v.part(g, v.box, 0x363a48, 0.4, 0.14, 0.02, 0, 0.24, 0.34, false);
  v.part(g, v.cyl, 0xffd23f, 0.06, 0.16, 0.06, 0.28, 1.2, 0.0, false);  // mustard bottle on top
  v.part(g, v.cyl, 0xd62828, 0.06, 0.16, 0.06, 0.18, 1.2, 0.0, false);  // ketchup bottle on top
  g.userData.prop = null; g.userData.pipZ = 0.38; g.userData.pipY = 0.1; g.userData.top = 1.4;
  return g;
}

// a flying hot dog: sausage in a bun
export function makeHotdogProjectile(v, p) {
  const g = new THREE.Group();
  const bun = new THREE.Mesh(v.cyl, v.basic(0xe0a458)); bun.scale.set(0.11, 0.34, 0.11); bun.rotation.z = Math.PI / 2; g.add(bun);
  const dog = new THREE.Mesh(v.cyl, v.basic(0xb5382a)); dog.scale.set(0.07, 0.4, 0.07); dog.rotation.z = Math.PI / 2; dog.position.y = 0.05; g.add(dog);
  const mus = new THREE.Mesh(v.cyl, v.basic(0xffd23f)); mus.scale.set(0.025, 0.3, 0.025); mus.rotation.z = Math.PI / 2; mus.position.y = 0.1; g.add(mus);
  g.userData.core = g;
  return g;
}