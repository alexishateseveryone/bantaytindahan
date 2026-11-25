// Microwave: pulses every burglar nearby.
import * as THREE from 'three';
import { ITEMS } from '../../game.js';
import { cabinet, aimProp } from './shared.js';

export function makeMicrowave(v, t) {
  const g = new THREE.Group(); cabinet(v, g, ITEMS.micro.color);
  const prop = aimProp(g);
  v.part(prop, v.box, 0xeeeeee, 0.74, 0.46, 0.6, 0, 0.23, 0);
  g.userData.win = v.part(prop, v.box, 0x1e2230, 0.44, 0.3, 0.04, -0.1, 0.24, 0.31, false);
  v.part(prop, v.box, 0x7a7f90, 0.16, 0.3, 0.04, 0.24, 0.24, 0.31, false);
  g.userData.win.material = new THREE.MeshBasicMaterial({ color: 0x1e2230 });
  g.userData.top = 1.2;
  return g;
}
