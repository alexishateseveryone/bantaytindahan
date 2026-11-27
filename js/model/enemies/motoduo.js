// 3. Riding in Tandem: the regular motorbike model, 1.4x bigger, with a second robber on the back seat and a loot bag.
// Behaviour (drive in through the door, park, roam in any direction, spin) lives in game.js.
import * as THREE from 'three';
import { makeMoto } from './moto.js';
export function makeMotoDuo(v, e) {
  const g = makeMoto(v, e), u = g.userData, b = u.body;
  b.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(b), top = bb.max.y, back = bb.min.z;
  // passenger: sits behind the driver (the bike faces +z)
  const pz = back + (bb.max.z - bb.min.z) * 0.2;
  v.part(b, v.box, 0xd62828, 0.3, 0.3, 0.2, 0, top - 0.4, pz);                       // body
  v.part(b, v.box, 0xf1c9a0, 0.2, 0.2, 0.2, 0, top - 0.17, pz);                      // head
  v.part(b, v.cyl, 0x111118, 0.14, 0.1, 0.14, 0, top - 0.05, pz);                    // helmet
  v.part(b, v.box, 0xffcf4a, 0.32, 0.12, 0.18, 0, top - 0.55, pz - 0.18, false);      // loot bag
  v.part(b, v.box, 0xd62828, 0.05, 0.05, 0.9, 0, 0.34, 0, false);                    // racing stripe
  b.scale.setScalar(1.4);
  u.big = Math.max(u.big || 1, 1.4);
  if (u.bar && u.bar.position.y < 1.5) u.bar.position.y = 1.5;
  return g;
}
