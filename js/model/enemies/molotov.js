// Molotov: orange hood, bottle in the hand and a rag poking out of it. Throws fire bombs, bursts into flames when it dies.
import * as THREE from 'three';
import { buildHumanoid } from './humanoid.js';
export function makeMolotov(v, e) {
  const g = buildHumanoid(v, e, {
    shirt: 0x5a2a1a, head: 0x7a2e12,
    torso: b => {
      v.part(b, v.box, 0xff7a1a, 0.3, 0.12, 0.14, 0, 0.7, -0.1);                    // hood
      v.part(b, v.box, 0xffa62b, 0.36, 0.05, 0.24, 0, 0.3, 0, false);               // scorched hem
      v.part(b, v.box, 0xffa62b, 0.36, 0.05, 0.24, 0, 0.5, 0, false);
    },
    headgear: b => v.part(b, v.box, 0x7a2e12, 0.28, 0.06, 0.26, 0, 0.8, 0),
  });
  // bottle on the belt (hidden while a real bottle is being held up)
  const b = g.userData.body;
  const bottle = new THREE.Group(); bottle.position.set(0.2, 0.3, 0.05); b.add(bottle);
  v.part(bottle, v.box, 0x3fae5b, 0.09, 0.16, 0.09, 0, 0, 0, false);
  v.part(bottle, v.box, 0x3fae5b, 0.04, 0.07, 0.04, 0, 0.11, 0, false);
  v.part(bottle, v.box, 0xffd23f, 0.03, 0.05, 0.03, 0, 0.17, 0, false);              // rag
  g.userData.bottle = bottle;
  return g;
}