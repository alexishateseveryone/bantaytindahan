// Bits shared by several item models.
import * as THREE from 'three';

// plinth + coloured cabinet that Hot Sauce / Soda / Microwave sit on
export function cabinet(v, g, color) {
  v.part(g, v.box, 0x3a3358, 0.86, 0.12, 0.86, 0, 0.06, 0);
  v.part(g, v.box, color, 0.8, 0.5, 0.8, 0, 0.37, 0);
  v.part(g, v.box, 0xffffff, 0.7, 0.05, 0.03, 0, 0.5, 0.41, false);
}

// the part of a turret that swings round to aim (sits on top of the cabinet)
export function aimProp(g) {
  const prop = new THREE.Group();
  prop.position.y = 0.55; g.userData.prop = prop; g.add(prop);
  return prop;
}
