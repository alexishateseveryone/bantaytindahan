// Drinks vending machine. NOT a turret: it never turns, cans pop out of its chute at the front.
import * as THREE from 'three';
import { ITEMS } from '../../game.js';

export function makeVending(v, t) {
  const g = new THREE.Group(), color = ITEMS.cans.color;
  const cans = [0xe0463e, 0x3a86ff, 0x2fb67a, 0xffb703, 0xb26bd6, 0xff7aa2];
  v.part(g, v.box, 0x2c2845, 0.84, 0.08, 0.7, 0, 0.04, 0);
  v.part(g, v.box, color, 0.8, 1.14, 0.62, 0, 0.65, 0);
  v.part(g, v.box, 0xb23a37, 0.82, 0.05, 0.64, 0, 1.24, 0, false);
  v.glow(g, 0xfff3b0, 0.74, 0.13, 0.04, 0, 1.12, 0.33);
  v.glow(g, 0xe0463e, 0.5, 0.05, 0.05, -0.04, 1.12, 0.35);
  v.glow(g, 0x16283a, 0.5, 0.74, 0.04, -0.1, 0.76, 0.32);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const col = cans[(r * 2 + c) % 6];
    v.part(g, v.cyl, col, 0.065, 0.14, 0.065, -0.27 + c * 0.17, 0.52 + r * 0.24, 0.33, false);
    v.part(g, v.cyl, 0xd9dde5, 0.055, 0.02, 0.055, -0.27 + c * 0.17, 0.6 + r * 0.24, 0.33, false);
  }
  v.part(g, v.box, 0xe9eef5, 0.17, 0.74, 0.05, 0.29, 0.76, 0.32, false);
  v.glow(g, 0x1e2230, 0.1, 0.05, 0.02, 0.29, 0.98, 0.35);
  v.glow(g, 0x5fe3a1, 0.09, 0.05, 0.02, 0.29, 0.86, 0.35);
  for (let i = 0; i < 3; i++) v.glow(g, [0xffcf4a, 0xff5a5f, 0x6fa8ff][i], 0.06, 0.04, 0.02, 0.29, 0.74 - i * 0.08, 0.35);
  v.part(g, v.box, 0x1b1d28, 0.5, 0.2, 0.05, -0.1, 0.24, 0.32, false);
  v.part(g, v.box, 0x6b7080, 0.5, 0.03, 0.06, -0.1, 0.36, 0.33, false);
  g.userData.flap = v.part(g, v.box, 0x363a48, 0.44, 0.14, 0.02, -0.1, 0.24, 0.35, false);
  g.userData.prop = null; g.userData.pipZ = 0.38; g.userData.pipY = 0.1; g.userData.top = 1.5;
  return g;
}
