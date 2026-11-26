// Cola dispenser (a generic soda fountain: silver base, dark hood, red panel, a row of nozzles).
// NOT a turret: it never turns, the spray comes out of the nozzles at the front.
import * as THREE from 'three';

export const COLA_PAL = [0x3b1f14, 0x6b3a22, 0xffffff, 0xc98a5a, 0xffffff, 0x8a4b2a];

export function makeCola(v, t) {
  const g = new THREE.Group(), red = 0xd6262b;
  v.part(g, v.box, 0x2c2845, 0.86, 0.06, 0.72, 0, 0.03, 0);                       // foot
  v.part(g, v.box, 0xc9ced6, 0.76, 0.52, 0.58, 0, 0.36, -0.04);                   // stainless lower body
  v.part(g, v.box, 0xa9afba, 0.76, 0.03, 0.58, 0, 0.62, -0.04, false);            // seam
  v.part(g, v.box, 0x3b3d46, 0.8, 0.5, 0.66, 0, 0.88, 0);                         // dark hood
  v.part(g, v.box, 0x2a2c34, 0.7, 0.05, 0.5, 0, 1.15, 0, false);                  // lid
  v.part(g, v.box, red, 0.02, 0.46, 0.5, -0.39, 0.37, -0.04, false);              // red side panel
  v.part(g, v.box, red, 0.02, 0.4, 0.58, -0.41, 0.88, 0, false);
  // red front panel with a plain white wave stripe and bottle silhouette (no brand marks)
  v.glow(g, 0xd6262b, 0.74, 0.34, 0.03, 0, 0.9, 0.34);
  v.glow(g, 0xffffff, 0.5, 0.05, 0.02, -0.06, 0.86, 0.36).rotation.z = -0.12;
  v.glow(g, 0xffffff, 0.4, 0.035, 0.02, -0.08, 0.95, 0.36).rotation.z = 0.1;
  v.glow(g, 0xffffff, 0.07, 0.16, 0.02, 0.28, 0.9, 0.36);
  v.glow(g, 0xffffff, 0.035, 0.07, 0.02, 0.28, 1.0, 0.36);
  // nozzle row
  const lv = [0xffcf4a, 0xff7a1a, 0x6bd16b, 0xffffff, 0xe0463e];
  for (let i = 0; i < 5; i++) {
    const x = -0.28 + i * 0.14;
    v.part(g, v.box, lv[i], 0.08, 0.1, 0.05, x, 0.68, 0.3, false);
    v.part(g, v.cyl, 0x2d2d3a, 0.025, 0.16, 0.025, x, 0.56, 0.3, false);
  }
  // drip tray
  v.part(g, v.box, 0x3a3d46, 0.78, 0.05, 0.24, 0, 0.12, 0.3, false);
  v.part(g, v.box, 0x6b7080, 0.7, 0.02, 0.18, 0, 0.15, 0.3, false);
  g.userData.prop = null; g.userData.pipZ = 0.34; g.userData.pipY = 0.3; g.userData.top = 1.4;
  return g;
}

// a little cloud of cola spray (the trail is dropped by the view)
export function makeColaProjectile(v, p) {
  const g = new THREE.Group(); g.userData.drops = [];
  COLA_PAL.slice(0, 5).forEach((c, i) => {
    const m = new THREE.Mesh(v.sph, v.basic(c)); m.scale.setScalar(i === 0 ? 0.1 : 0.05 + (i % 3) * 0.015);
    g.add(m); g.userData.drops.push(m);
  });
  return g;
}