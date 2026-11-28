// Egg Tray station: a tall stack of egg trays (blue / green / grey) with a full tray of eggs on top and a dark slot at the front
// where the eggs roll out. It never turns its head: the machine faces an open side (see eggFire / stepEggs in game.js).
import * as THREE from 'three';
import { ITEMS } from '../../game.js';

// one 3D egg (used for the rolling eggs and the tray on top)
export function makeEgg(v, s = 1) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const e = new THREE.Mesh(v.sph, v.toon(0xf6f1e4)); e.scale.set(0.14, 0.19, 0.14); e.castShadow = true; e.receiveShadow = true; body.add(e);                 // egg body (taller than wide)
  const tip = new THREE.Mesh(v.sph, v.basic(0xffffff)); tip.scale.set(0.05, 0.05, 0.05); tip.position.set(-0.03, 0.05, 0.042); tip.castShadow = false; body.add(tip);   // shine
  const sp = new THREE.Mesh(v.sph, v.toon(0xd9c9a8)); sp.scale.set(0.024, 0.024, 0.024); sp.position.set(0.05, -0.03, 0.058); sp.castShadow = false; body.add(sp);        // a speckle
  body.rotation.z = Math.PI / 2;   // lie on its side so it rolls
  g.userData.body = body; g.scale.setScalar(s);
  return g;
}

export function makeEggtray(v, t) {
  const g = new THREE.Group(), cols = [0x2f6fd0, 0x2c8a63, 0x59607a, 0x2f6fd0, 0x2c8a63];
  v.part(g, v.box, 0x2c2845, 0.84, 0.06, 0.74, 0, 0.03, 0);                                   // base plate
  for (let i = 0; i < 5; i++) {                                                                // the stack of trays
    v.part(g, v.box, cols[i], 0.78, 0.1, 0.66, 0, 0.11 + i * 0.12, 0);
    v.part(g, v.box, 0x1b1d26, 0.8, 0.02, 0.68, 0, 0.17 + i * 0.12, 0, false);                 // dark gap between trays
  }
  v.part(g, v.box, 0x1b1d26, 0.5, 0.16, 0.06, 0, 0.3, 0.34, false);                          // the slot the eggs roll out of
  for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 3; iz++) {                              // the full tray on top: 12 eggs
    const e = v.part(g, v.sph, 0xf6f1e4, 0.15, 0.19, 0.15, -0.24 + ix * 0.16, 0.77, -0.2 + iz * 0.2, false);
    e.rotation.y = ix + iz;
  }
  v.part(g, v.box, 0xe0a458, 0.14, 0.12, 0.04, 0.26, 0.62, 0.34, false);                      // a little "EGGS" crate tag
  g.userData.win = v.glow(g, 0x1e2230, 0.12, 0.08, 0.03, -0.25, 0.42, 0.345);                 // status light (flashes when it rolls)
  g.userData.prop = null; g.userData.pipZ = 0.38; g.userData.pipY = 0.1; g.userData.top = 1.1;
  return g;
}
