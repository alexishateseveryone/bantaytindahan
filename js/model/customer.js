// Daytime shoppers.
import * as THREE from 'three';

export function makeCustomer(v, c) {
  const k = c.look, g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.userData.body = body;
  const shirt = [0xff7aa2, 0x4cc9f0, 0x80ed99, 0xffd166, 0xb388eb, 0xf4845f][k % 6];
  const skin = [0xf1c9a0, 0xd9a577, 0x8d5a3a, 0xffdcbc][(k >> 3) % 4];
  const hair = [0x3a2a1a, 0x1a1a1a, 0xc98a3a, 0xe8d9a0, 0x8a3a2a][(k >> 5) % 5];
  const pants = [0x35507a, 0x4a4a58, 0x7a5a3a][(k >> 7) % 3];
  const legL = v.part(body, v.box, pants, 0.11, 0.24, 0.12, -0.08, 0.12, 0), legR = v.part(body, v.box, pants, 0.11, 0.24, 0.12, 0.08, 0.12, 0);
  g.userData.legs = [legL, legR];
  v.part(body, v.box, shirt, 0.34, 0.34, 0.22, 0, 0.4, 0);
  v.part(body, v.box, skin, 0.24, 0.22, 0.22, 0, 0.68, 0);
  v.part(body, v.box, hair, 0.26, 0.08, 0.24, 0, 0.8, -0.01);
  v.part(body, v.box, hair, 0.26, 0.2, 0.06, 0, 0.7, -0.11, false);
  v.part(body, v.box, 0x15151c, 0.04, 0.04, 0.03, -0.05, 0.69, 0.12, false);
  v.part(body, v.box, 0x15151c, 0.04, 0.04, 0.03, 0.05, 0.69, 0.12, false);
  if (k % 4 === 0) v.part(body, v.box, shirt, 0.28, 0.05, 0.34, 0, 0.84, 0.04);
  const bag = v.part(body, v.box, 0xffffff, 0.14, 0.2, 0.11, 0.24, 0.34, 0.04); bag.visible = false;
  g.userData.bag = bag;
  body.scale.setScalar(0.95);
  return g;
}
