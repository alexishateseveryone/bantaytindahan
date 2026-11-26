// Water Dispenser: an office water cooler. Lobs 3 slow drops of water; each one splashes (AoE) where it lands.
// Like the hot dog cart it never aims: the whole machine turns to its open side and lobs from the front.
import * as THREE from 'three';
import { ITEMS } from '../../game.js';

export function makeWater(v, t) {
  const g = new THREE.Group(), color = ITEMS.water.color;
  v.part(g, v.box, 0x2c2845, 0.84, 0.08, 0.7, 0, 0.04, 0);                // base plate
  v.part(g, v.box, 0xdfe6f1, 0.62, 0.52, 0.5, 0, 0.34, 0);                // lower cabinet
  v.part(g, v.box, 0xf4f7fc, 0.62, 0.38, 0.5, 0, 0.79, 0);                // upper body
  v.part(g, v.box, color, 0.64, 0.05, 0.52, 0, 0.6, 0, false);            // blue band between the two
  v.glow(g, 0x16283a, 0.46, 0.2, 0.04, 0, 0.76, 0.26);                    // tap recess
  v.part(g, v.box, 0x2f7be0, 0.09, 0.07, 0.1, -0.1, 0.76, 0.3, false);    // cold tap
  v.part(g, v.box, 0xd62828, 0.09, 0.07, 0.1, 0.1, 0.76, 0.3, false);     // hot tap
  v.part(g, v.box, 0x6b7080, 0.46, 0.03, 0.14, 0, 0.64, 0.3, false);      // drip tray
  v.part(g, v.cyl, 0xffffff, 0.05, 0.1, 0.05, 0.17, 0.7, 0.3, false);     // paper cup
  v.part(g, v.cyl, 0x1b1d28, 0.07, 0.1, 0.07, 0, 0.16, 0.26, false);      // front lobbing hatch
  v.part(g, v.cyl, 0xcfeaff, 0.12, 0.1, 0.12, 0, 1.03, 0, false);         // bottle neck
  v.part(g, v.cyl, 0x8fd0ff, 0.25, 0.46, 0.25, 0, 1.3, 0);                // big water jug
  v.part(g, v.cyl, 0xd8f1ff, 0.255, 0.05, 0.255, 0, 1.2, 0, false);       // water-level rim
  v.part(g, v.sph, 0x8fd0ff, 0.25, 0.16, 0.25, 0, 1.53, 0, false);        // jug dome
  v.part(g, v.box, 0xffffff, 0.04, 0.3, 0.02, -0.14, 1.32, 0.2, false);   // glassy highlight
  g.userData.prop = null; g.userData.pipZ = 0.34; g.userData.pipY = 0.1; g.userData.top = 1.75;
  return g;
}

// a lobbed blob of water (teardrop)
export function makeWaterProjectile(v, p) {
  const g = new THREE.Group();
  const blob = new THREE.Mesh(v.sph, v.basic(0x4aa8ff)); blob.scale.set(0.17, 0.2, 0.17); g.add(blob);
  const tip = new THREE.Mesh(v.cone, v.basic(0x4aa8ff)); tip.scale.set(0.1, 0.2, 0.1); tip.position.y = 0.2; g.add(tip);
  const hi = new THREE.Mesh(v.sph, v.basic(0xcdeeff)); hi.scale.setScalar(0.07); hi.position.set(-0.05, 0.06, 0.08); g.add(hi);
  g.userData.core = blob;
  return g;
}