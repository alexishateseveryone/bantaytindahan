// Tissue Dispenser: a wire stand with a tissue box on top and spare rolls below. It only fires along its own row / column
// (4 directions, never omni): a 3D roll of tissue shoots out unrolling a paper ribbon and PIERCES everything on the way.
import * as THREE from 'three';
import { ITEMS } from '../../game.js';

export function makeTissue(v, t) {
  const g = new THREE.Group(), prop = new THREE.Group(); g.add(prop);
  v.part(g, v.cyl, 0xdfe5ee, 0.34, 0.05, 0.34, 0, 0.025, 0.04);                     // foot
  for (let i = 0; i < 3; i++) {                                                      // spare rolls in the wire basket
    v.part(g, v.cyl, 0xffffff, 0.22, 0.19, 0.22, 0, 0.17 + i * 0.2, 0.04);
    v.part(g, v.cyl, 0xc9a27a, 0.07, 0.2, 0.07, 0, 0.17 + i * 0.2, 0.04, false);
    v.part(g, v.cyl, 0xf4f6fb, 0.26, 0.02, 0.26, 0, 0.065 + i * 0.2, 0.04, false); // wire rings
  }
  v.part(g, v.cyl, 0xf4f6fb, 0.26, 0.02, 0.26, 0, 0.67, 0.04, false);
  v.part(g, v.box, 0xf4f6fb, 0.06, 1.05, 0.06, 0, 0.55, -0.24);                       // pole
  v.part(g, v.box, 0xf4f6fb, 0.76, 0.04, 0.5, 0, 1.08, -0.02, false);                // top shelf
  v.part(g, v.box, 0xf4f6fb, 0.76, 0.1, 0.03, 0, 1.14, 0.22, false);                 // shelf front rail
  v.part(g, v.box, 0x5aa0e6, 0.32, 0.12, 0.2, -0.2, 1.16, -0.02, false);             // tissue box
  v.part(g, v.box, 0xffffff, 0.12, 0.12, 0.05, -0.2, 1.26, -0.02, false);            // tissue sticking out
  v.part(g, v.box, ITEMS.tissue.color, 0.16, 0.1, 0.1, 0.22, 1.15, 0.0, false);      // small pack
  // rotating head: a roll on an arm with a paper tongue pointing where it fires (+z)
  const roll = v.part(prop, v.cyl, 0xffffff, 0.2, 0.24, 0.2, 0, 0.8, 0.0); roll.rotation.z = Math.PI / 2;
  const core = v.part(prop, v.cyl, 0xc9a27a, 0.07, 0.26, 0.07, 0, 0.8, 0.0, false); core.rotation.z = Math.PI / 2;
  v.part(prop, v.box, 0xd9dee8, 0.1, 0.08, 0.3, 0, 0.8, 0.22, false);                // nozzle arm
  v.part(prop, v.box, 0xffffff, 0.16, 0.02, 0.2, 0, 0.8, 0.42, false);               // tissue tongue
  v.part(prop, v.box, 0xe63946, 0.06, 0.06, 0.06, 0, 0.88, 0.3, false);              // aim marker
  g.userData.prop = prop; g.userData.pipZ = 0.34; g.userData.pipY = 0.1; g.userData.top = 1.4;
  return g;
}

// a 3D roll of tissue: lit (toon) + shadow-casting, like the 3D cans. Axis along local x so the view can spin it around x.
function rollParts(v, parent) {
  const along = (m) => { m.rotation.z = Math.PI / 2; return m; };
  along(v.part(parent, v.cyl, 0xffffff, 0.15, 0.24, 0.15, 0, 0, 0));            // paper body
  along(v.part(parent, v.cyl, 0xe3e8f2, 0.156, 0.025, 0.156, 0.06, 0, 0, false));   // quilted bands
  along(v.part(parent, v.cyl, 0xe3e8f2, 0.156, 0.025, 0.156, -0.06, 0, 0, false));
  along(v.part(parent, v.cyl, 0xc9a27a, 0.075, 0.256, 0.075, 0, 0, 0, false));  // cardboard core
  along(v.part(parent, v.cyl, 0x4a3a2a, 0.05, 0.262, 0.05, 0, 0, 0, false));    // hole
}

// the flying roll. The view puts the group at the roll, yaws it along the flight direction and stretches the ribbon behind it.
export function makeTissueRoll(v, r) {
  const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin);
  rollParts(v, spin);
  const rib = v.part(g, v.box, 0xf4f6fb, 0.22, 0.015, 0.01, 0, 0, 0, true);      // paper ribbon (stretched by the view)
  g.userData.spin = spin; g.userData.rib = rib;
  return g;
}
