// Motor bandit: rider on a red motorbike. Rides in from outside, crashes through the door, then two robbers jump off.
import * as THREE from 'three';
import { buildHumanoid } from './humanoid.js';
export function makeMoto(v, e) {
  const g = buildHumanoid(v, e, {
    shirt: 0x1d1d26, head: 0xd62828, big: 1.0,
    headgear: b => v.part(b, v.box, 0xd62828, 0.3, 0.14, 0.28, 0, 0.77, 0),         // helmet
  });
  const body = g.userData.body;
  v.part(body, v.box, 0xd62828, 0.17, 0.12, 0.6, 0, 0.17, 0);                          // frame / tank
  v.part(body, v.box, 0x2a2a34, 0.12, 0.06, 0.26, 0, 0.26, -0.12, false);              // seat
  v.part(body, v.box, 0x9a9aa8, 0.34, 0.04, 0.04, 0, 0.36, 0.3, false);                // handlebars
  v.part(body, v.box, 0xffee58, 0.08, 0.07, 0.04, 0, 0.26, 0.37, false);               // headlight
  v.part(body, v.box, 0x9a9aa8, 0.05, 0.05, 0.2, 0.09, 0.08, -0.4, false);             // exhaust
  g.userData.wheels = [];
  for (const z of [0.32, -0.32]) {
    const wh = new THREE.Group(); wh.position.set(0, 0.15, z); body.add(wh);
    const tire = v.part(wh, v.cyl, 0x15151c, 0.3, 0.07, 0.3, 0, 0, 0); tire.rotation.z = Math.PI / 2;
    v.part(wh, v.box, 0xcfcfd8, 0.05, 0.22, 0.03, 0, 0, 0, false);                      // spoke so you can see it spin
    g.userData.wheels.push(wh);
  }
  return g;
}