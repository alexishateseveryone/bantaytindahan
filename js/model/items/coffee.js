// Coffee Machine: an espresso machine (black body, steel face, two glasses under the spout).
// Like the microwave it never turns its head: the whole machine faces an open side and splashes coffee over a 4x4 area.
import * as THREE from 'three';
import { ITEMS } from '../../game.js';

export function makeCoffee(v, t) {
  const g = new THREE.Group(), color = ITEMS.coffee.color;
  v.part(g, v.box, 0x1b1d26, 0.78, 0.1, 0.7, 0, 0.05, 0);                 // drip tray base
  v.part(g, v.box, 0x6b7080, 0.7, 0.03, 0.5, 0, 0.115, 0.04, false);      // tray grate
  v.part(g, v.box, color, 0.74, 0.98, 0.5, 0, 0.62, -0.1);                // black body (back)
  v.part(g, v.box, 0xc5cad6, 0.6, 0.52, 0.06, 0, 0.9, 0.17, false);       // steel face plate
  v.part(g, v.box, 0x1b1d26, 0.78, 0.1, 0.5, 0, 1.16, -0.1, false);      // top cap
  v.part(g, v.cyl, 0x2b2f3d, 0.2, 0.05, 0.2, 0, 0.9, 0.22, false).rotation.x = Math.PI / 2;   // dial
  v.part(g, v.box, 0xe8ecf4, 0.03, 0.14, 0.03, 0, 0.92, 0.26, false);     // dial marker
  v.part(g, v.box, 0xff5a3a, 0.05, 0.05, 0.03, -0.22, 0.74, 0.21, false); // READY light
  v.part(g, v.box, 0x3ddc84, 0.05, 0.05, 0.03, -0.22, 0.66, 0.21, false); // ON light
  v.part(g, v.cyl, 0x1b1d26, 0.14, 0.16, 0.14, 0, 0.56, 0.2, false);      // group head / portafilter
  v.part(g, v.cyl, 0x2b2f3d, 0.05, 0.22, 0.05, 0.14, 0.56, 0.3, false).rotation.x = Math.PI / 2;   // handle
  for (const x of [-0.14, 0.14]) {                                        // two little glasses of coffee
    v.part(g, v.cyl, 0xcfe8ff, 0.1, 0.16, 0.1, x, 0.21, 0.2, false);
    v.part(g, v.cyl, 0x4a2616, 0.085, 0.1, 0.085, x, 0.2, 0.2, false);
    v.part(g, v.cyl, 0xc98a5a, 0.085, 0.02, 0.085, x, 0.26, 0.2, false);  // crema
  }
  v.part(g, v.cyl, 0xaab0c0, 0.04, 0.5, 0.04, 0.33, 0.62, 0.12, false);   // steam wand
  g.userData.win = v.glow(g, 0x1e2230, 0.2, 0.12, 0.03, 0, 0.74, 0.215);  // status window (flashes when it splashes)
  g.userData.prop = null; g.userData.pipZ = 0.3; g.userData.pipY = 0.1; g.userData.top = 1.35;
  return g;
}
