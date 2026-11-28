// Noodle Station: an instant-noodle hot-water dispenser (white cabinet, green trim, hot-water display, spigot).
// It never turns its head: the machine faces an open side and lobs cup noodles from its chute (see noodleFire in game.js).
import * as THREE from 'three';
import { ITEMS } from '../../game.js';

// a real instant-noodle cup: white ribbed collar + wide rim, red-orange label with yellow dashed borders, noodles heaped inside
const CUP_H = 0.3, R0 = 0.1, R1 = 0.15, Y0 = -0.15;            // cup height, bottom / top radius, bottom y
const rAt = y => R0 + (R1 - R0) * (y - Y0) / CUP_H;
export function makeCupNoodle(v, s = 1) {
  const g = new THREE.Group(), cup = new THREE.Group(); g.add(cup);
  const seg = (y0, y1, col, grow = 1) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rAt(y1) * grow, rAt(y0) * grow, y1 - y0, 14), v.basic(col)); m.position.y = (y0 + y1) / 2; cup.add(m); return m; };
  seg(-0.15, -0.125, 0xf4f4f0);                                  // white base
  seg(-0.125, -0.115, 0xffc933, 1.012);                          // yellow dash border (bottom)
  seg(-0.115, 0.045, 0xd9441f, 1.01);                            // red-orange label
  seg(-0.062, -0.04, 0xff8a2a, 1.016);                           // lighter orange stripe on the label
  seg(0.045, 0.055, 0xffc933, 1.012);                            // yellow dash border (top)
  seg(0.055, 0.13, 0xf6f6f2);                                    // white ribbed collar...
  for (let i = 0; i < 14; i++) {                                 // ...with little vertical ribs
    const a = i / 14 * Math.PI * 2, r = rAt(0.092) + 0.002;
    const rib = new THREE.Mesh(v.box, v.basic(0xdedcd4)); rib.scale.set(0.012, 0.07, 0.012);
    rib.position.set(Math.cos(a) * r, 0.092, Math.sin(a) * r); rib.rotation.y = -a; rib.rotation.z = 0; cup.add(rib);
  }
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(R1 + 0.022, R1 + 0.012, 0.022, 16), v.basic(0xffffff)); lip.position.y = 0.141; cup.add(lip);   // wide rim
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(R1 - 0.006, R1 - 0.006, 0.004, 16), v.basic(0xe9e4d4)); hole.position.y = 0.153; cup.add(hole);  // inner wall
  const nd = new THREE.Mesh(v.sph, v.basic(0xf0d58a)); nd.scale.set(0.2, 0.06, 0.2); nd.position.y = 0.138; cup.add(nd);                              // heap of noodles
  for (let i = 0; i < 5; i++) {                                  // curly noodle strands
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.04 + (i % 2) * 0.02, 0.009, 5, 12), v.basic(i % 2 ? 0xf3dc98 : 0xe6c777));
    t.position.set(Math.cos(i * 1.9) * 0.03, 0.146 + (i % 3) * 0.004, Math.sin(i * 1.9) * 0.03); t.rotation.set(Math.PI / 2 + (i - 2) * 0.12, 0, i * 1.1); cup.add(t);
  }
  const bit = (col, x, z, sx = 0.032) => { const m = new THREE.Mesh(v.box, v.basic(col)); m.scale.set(sx, 0.022, sx); m.position.set(x, 0.158, z); m.rotation.y = x * 20; cup.add(m); };
  bit(0xf07a1c, 0.06, 0.02); bit(0xf07a1c, -0.05, 0.05); bit(0xf07a1c, 0.0, -0.065);        // carrot
  bit(0x2f9e3a, -0.07, -0.03, 0.024); bit(0x2f9e3a, 0.03, 0.07, 0.024); bit(0x2f9e3a, 0.07, -0.04, 0.024); bit(0xd62828, -0.02, 0.0, 0.024);   // greens + a red bit
  g.userData.cup = cup; g.scale.setScalar(s);
  return g;
}

export function makeNoodle(v, t) {
  const g = new THREE.Group(), color = ITEMS.noodle.color;
  v.part(g, v.box, 0x2c2845, 0.74, 0.08, 0.6, 0, 0.04, 0);                 // base plate
  v.part(g, v.box, 0x2f9e57, 0.7, 1.12, 0.52, 0, 0.64, 0);                  // green frame
  v.part(g, v.box, color, 0.6, 1.04, 0.54, 0, 0.64, 0.01, false);           // white cabinet face
  v.part(g, v.box, 0x1b1d26, 0.4, 0.14, 0.04, 0, 1.08, 0.29, false);       // display housing
  v.glow(g, 0xff3b3b, 0.3, 0.07, 0.03, 0, 1.08, 0.3);                       // red "95" display
  const cup = makeCupNoodle(v, 1.25); cup.position.set(0, 0.84, 0.3); g.add(cup);   // the cup picture
  v.part(g, v.box, 0x1b1d26, 0.12, 0.12, 0.1, 0, 0.58, 0.33, false);        // spigot block
  v.part(g, v.cyl, 0xb0b6c4, 0.06, 0.16, 0.06, 0, 0.5, 0.38, false);        // spigot nozzle
  v.part(g, v.box, 0x1b1d26, 0.32, 0.2, 0.05, 0, 0.26, 0.3, false);         // output chute
  v.part(g, v.box, 0x6b7080, 0.32, 0.03, 0.06, 0, 0.38, 0.31, false);
  g.userData.win = v.glow(g, 0x1e2230, 0.2, 0.1, 0.03, 0.2, 0.7, 0.3);      // status light (flashes when it fires)
  g.userData.prop = null; g.userData.pipZ = 0.36; g.userData.pipY = 0.1; g.userData.top = 1.35;
  return g;
}
