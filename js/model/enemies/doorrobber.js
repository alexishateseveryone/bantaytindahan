// 4. Door Robber: hard hat, big grey coat and a whole door ripped off its hinges that he carries as a shield.
// userData.door is the shield; the view hides it when it breaks and lifts it for the floor slam.
import { buildHumanoid } from './humanoid.js';
import * as THREE from 'three';
export function makeDoorRobber(v, e) {
  let door = null;
  const g = buildHumanoid(v, e, {
    shirt: 0x4a4a52, big: 1.6,
    torso: b => {
      v.part(b, v.box, 0xffcf4a, 0.37, 0.05, 0.25, 0, 0.32, 0, false);                                   // hi-vis stripes
      v.part(b, v.box, 0xffcf4a, 0.37, 0.05, 0.25, 0, 0.46, 0, false);
      door = new THREE.Group(); door.position.set(0, 0.02, 0.34);
      v.part(door, v.box, 0x6e4423, 0.62, 0.98, 0.08, 0, 0.5, 0);                                         // frame
      v.part(door, v.box, 0xa56a3a, 0.5, 0.86, 0.1, 0, 0.5, 0.01, false);                                 // door panel
      v.part(door, v.box, 0x8a5430, 0.36, 0.3, 0.11, 0, 0.3, 0.02, false);                                // lower inset
      v.part(door, v.box, 0x9ad7ff, 0.3, 0.22, 0.11, 0, 0.74, 0.02, false);                               // little window
      v.part(door, v.sph, 0xffd23f, 0.05, 0.05, 0.05, 0.2, 0.46, 0.09, false);                            // handle
      v.part(door, v.box, 0x2b2b33, 0.04, 0.12, 0.03, -0.27, 0.8, 0.0, false);                            // hinges
      v.part(door, v.box, 0x2b2b33, 0.04, 0.12, 0.03, -0.27, 0.2, 0.0, false);
      b.add(door);
    },
    headgear: b => {
      v.part(b, v.cyl, 0xffcf4a, 0.17, 0.09, 0.17, 0, 0.82, 0);                                          // hard hat
      v.part(b, v.box, 0xffcf4a, 0.26, 0.025, 0.14, 0, 0.77, 0.1, false);                                 // peak
    },
  });
  g.userData.door = door;
  return g;
}
