// Cash machine (a generic blue ATM with a yellow header, no bank marks).
// NOT a turret: it never turns, receipts print out of the slot at the front.
import * as THREE from 'three';

export function makeAtm(v, t) {
  const g = new THREE.Group(), blue = 0x2a5db0, yellow = 0xf2c200;
  v.part(g, v.box, 0x20232e, 0.76, 0.06, 0.58, 0, 0.03, 0);                       // foot
  v.part(g, v.box, blue, 0.66, 0.62, 0.5, 0, 0.37, 0);                            // lower cabinet
  v.part(g, v.box, 0x1d4a92, 0.5, 0.36, 0.02, 0, 0.36, 0.26, false);              // service door
  v.part(g, v.box, blue, 0.7, 0.56, 0.5, 0, 0.96, 0);                             // upper unit
  v.part(g, v.box, yellow, 0.74, 0.2, 0.54, 0, 1.36, 0);                          // header
  v.part(g, v.box, yellow, 0.04, 0.6, 0.52, -0.36, 0.96, 0, false);               // side trim
  v.part(g, v.box, yellow, 0.04, 0.6, 0.52, 0.36, 0.96, 0, false);
  v.glow(g, 0x16283a, 0.74, 0.12, 0.02, 0, 1.36, 0.28);                           // sign plate
  v.glow(g, 0x6fa8ff, 0.3, 0.07, 0.02, -0.05, 1.37, 0.29);
  v.glow(g, 0xffffff, 0.12, 0.035, 0.02, 0.24, 1.37, 0.29);
  // screen, keypad, slots
  v.part(g, v.box, 0x14161f, 0.42, 0.32, 0.04, -0.08, 1.06, 0.26, false);
  v.glow(g, 0x16283a, 0.36, 0.26, 0.03, -0.08, 1.06, 0.285);
  v.glow(g, 0x5fe3a1, 0.22, 0.03, 0.02, -0.08, 1.12, 0.305);
  v.glow(g, 0xffcf4a, 0.14, 0.03, 0.02, -0.08, 1.04, 0.305);
  v.part(g, v.box, 0xe9eef5, 0.17, 0.22, 0.04, 0.24, 1.02, 0.26, false);           // keypad
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) v.glow(g, 0x4a4f60, 0.04, 0.03, 0.02, 0.19 + c * 0.05, 1.08 - r * 0.05, 0.285);
  v.part(g, v.box, 0x1b1d28, 0.34, 0.07, 0.06, -0.04, 0.8, 0.28, false);           // cash slot
  v.glow(g, 0x5fe3a1, 0.3, 0.015, 0.02, -0.04, 0.835, 0.315);
  v.part(g, v.box, 0x1b1d28, 0.14, 0.03, 0.05, 0.24, 0.8, 0.28, false);            // card slot
  g.userData.slot = v.part(g, v.box, 0xffffff, 0.12, 0.02, 0.07, 0.24, 0.7, 0.28, false);   // receipt slot with a bit of paper sticking out
  g.userData.prop = null; g.userData.pipZ = 0.28; g.userData.pipY = 0.2; g.userData.top = 1.6;
  return g;
}

// a flying receipt: a long thin paper strip
export function makeReceiptProjectile(v, p) {
  const g = new THREE.Group(), paper = new THREE.Group(); g.add(paper); g.userData.paper = paper;
  v.part(paper, v.box, 0xffffff, 0.1, 0.01, 0.34, 0, 0, 0, false);
  for (let i = 0; i < 4; i++) v.part(paper, v.box, 0x8b92a3, 0.07, 0.012, 0.015, 0, 0, -0.12 + i * 0.07, false);
  return g;
}