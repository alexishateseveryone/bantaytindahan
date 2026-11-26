// Bat: green hoodie and a baseball bat. Smashes the closest item and sometimes swats projectiles away.
import * as THREE from 'three';
import { buildHumanoid } from './humanoid.js';
export function makeBat(v, e) {
  const g = buildHumanoid(v, e, {
    shirt: 0x2f6f8f, big: 1.2, head: 0x1d3f52,
    torso: b => {
      v.part(b, v.box, 0xe8e8ee, 0.3, 0.05, 0.23, 0, 0.45, 0, false);               // jersey stripe
      v.part(b, v.box, 0xe8e8ee, 0.3, 0.05, 0.23, 0, 0.33, 0, false);
    },
    headgear: b => { v.part(b, v.box, 0xd62828, 0.28, 0.07, 0.26, 0, 0.82, 0); v.part(b, v.box, 0xd62828, 0.2, 0.03, 0.12, 0, 0.8, 0.17, false); },   // cap + brim
  });
  // the bat hangs from a shoulder pivot so it can swing
  const pivot = new THREE.Group(); pivot.position.set(0.24, 0.5, 0.05); g.userData.body.add(pivot);
  const bat = new THREE.Group(); pivot.add(bat); bat.rotation.x = -0.5;
  v.part(bat, v.box, 0xc89a5a, 0.06, 0.5, 0.06, 0, 0.25, 0, false);                   // handle + barrel
  v.part(bat, v.box, 0xc89a5a, 0.1, 0.26, 0.1, 0, 0.52, 0, false);
  v.part(bat, v.box, 0x6b4a22, 0.07, 0.05, 0.07, 0, 0.02, 0, false);                  // grip tape
  g.userData.batPivot = pivot;
  return g;
}