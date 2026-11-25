// Mop & bucket floor trap.
import * as THREE from 'three';

export function makeMop(v, t) {
  const g = new THREE.Group();
  v.part(g, v.cyl, 0xf2c94c, 0.26, 0.34, 0.26, 0, 0.17, 0);
  v.part(g, v.cyl, 0x4aa3df, 0.2, 0.04, 0.2, 0, 0.35, 0, false);
  const stick = v.part(g, v.cyl, 0xb0824a, 0.025, 0.9, 0.025, 0.1, 0.65, -0.05); stick.rotation.z = -0.25;
  v.part(g, v.box, 0xffffff, 0.2, 0.1, 0.12, 0.28, 0.12, -0.05);
  v.part(g, v.cyl, 0x8fd3ff, 0.45, 0.02, 0.45, 0, 0.02, 0.2, false);
  g.userData.prop = null;
  return g;
}
