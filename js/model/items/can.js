// 3D soda can: body + label + rims + pull tab. Nested groups so it can tumble in the air,
// then lie on its side and roll on the floor (yaw -> tilt -> can).
import * as THREE from 'three';

export function makeCan(v, color, s = 1) {
  const root = new THREE.Group(), yaw = new THREE.Group(), tilt = new THREE.Group(), can = new THREE.Group();
  root.add(yaw); yaw.add(tilt); tilt.add(can);
  const P = (geo, c, sx, sy, sz, x, y, z, sh = true) => v.part(can, geo, c, sx * s, sy * s, sz * s, x * s, y * s, z * s, sh);
  P(v.cyl, color, 0.14, 0.32, 0.14, 0, 0, 0);
  P(v.box, 0xffffff, 0.13, 0.15, 0.02, 0, 0, 0.14, false);
  P(v.cyl, 0xd9dde5, 0.12, 0.04, 0.12, 0, 0.17, 0);
  P(v.cyl, 0xd9dde5, 0.12, 0.04, 0.12, 0, -0.17, 0);
  P(v.box, 0x9aa1ad, 0.07, 0.015, 0.04, 0, 0.2, 0, false);
  return { root, yaw, tilt, can, r: 0.14 * s };
}

// a can flying out of the vending machine
export function makeCanProjectile(v, p) {
  const c = makeCan(v, p.color, 1), g = new THREE.Group(); g.add(c.root); g.userData.can = c;
  c.tilt.rotation.set(Math.random() * 6, 0, Math.random() * 6);
  return g;
}
