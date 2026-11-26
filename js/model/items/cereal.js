// Cereal Shelf: a shelf of cereal boxes with a spoon catapult. It lobs a 3D cereal box that, on landing, stands up
// as a temporary wall (5 s) burglars must go around or smash. The wall box is a "shelf" entity (type 'cerealbox').
import * as THREE from 'three';
import { ITEMS } from '../../game.js';

const PAL = [[0xff9f1c, 0xffd23f], [0x3a86ff, 0xffffff], [0xe0463e, 0xffd23f], [0x2fb67a, 0xfff1d6]];

// a cereal box standing upright, centre at the origin. s = size multiplier (1 = 0.5 x 0.72 x 0.2)
export function cerealBoxModel(v, variant = 0, s = 1) {
  const [c1, c2] = PAL[variant % PAL.length], b = new THREE.Group();
  v.part(b, v.box, c1, 0.5 * s, 0.72 * s, 0.2 * s, 0, 0, 0);                              // the box
  v.part(b, v.box, c2, 0.5 * s, 0.05 * s, 0.205 * s, 0, 0.33 * s, 0, false);              // top flap line
  v.part(b, v.box, c2, 0.5 * s, 0.05 * s, 0.205 * s, 0, -0.33 * s, 0, false);             // bottom edge
  v.part(b, v.box, c2, 0.36 * s, 0.22 * s, 0.208 * s, 0, 0.14 * s, 0, false);             // label panel
  const bowl = v.part(b, v.cyl, 0xffffff, 0.13 * s, 0.04 * s, 0.13 * s, 0, -0.1 * s, 0.1 * s, false); bowl.rotation.x = Math.PI / 2;   // bowl picture
  for (let i = 0; i < 3; i++) v.part(b, v.sph, 0xc98a5a, 0.04 * s, 0.04 * s, 0.04 * s, (i - 1) * 0.06 * s, -0.1 * s, 0.125 * s, false);   // puffs in the bowl
  return b;
}

export function makeCereal(v, t) {
  const g = new THREE.Group(), color = ITEMS.cereal.color;
  v.part(g, v.box, 0x2c2845, 0.84, 0.08, 0.6, 0, 0.04, 0);                 // base plate
  v.part(g, v.box, 0x6b7080, 0.76, 1.1, 0.05, 0, 0.62, -0.22);             // back panel
  v.part(g, v.box, 0xaab2c0, 0.05, 1.14, 0.5, -0.38, 0.62, 0);             // uprights
  v.part(g, v.box, 0xaab2c0, 0.05, 1.14, 0.5, 0.38, 0.62, 0);
  for (let r = 0; r < 3; r++) {                                            // 3 shelves, each with 3 cereal boxes
    const y = 0.14 + r * 0.36;
    v.part(g, v.box, 0xd9dee8, 0.76, 0.04, 0.5, 0, y, 0, false);
    v.part(g, v.box, color, 0.76, 0.03, 0.03, 0, y + 0.03, 0.24, false);   // price strip
    for (let c = 0; c < 3; c++) { const b = cerealBoxModel(v, r + c, 0.4); b.position.set(-0.23 + c * 0.23, y + 0.02 + 0.144, -0.04); g.add(b); }
  }
  v.part(g, v.box, 0xd9dee8, 0.1, 0.05, 0.46, 0, 1.28, 0.05, false);       // catapult arm (spoon)
  v.part(g, v.cyl, 0xe8ecf3, 0.14, 0.04, 0.14, 0, 1.31, 0.3, false);       // spoon bowl
  const top = cerealBoxModel(v, 1, 0.36); top.position.set(0, 1.46, 0.3); top.rotation.x = -0.35; g.add(top);   // box loaded on the spoon
  v.part(g, v.box, color, 0.84, 0.06, 0.62, 0, 1.2, 0, false);             // top cap
  g.userData.prop = null; g.userData.pipZ = 0.3; g.userData.pipY = 0.08; g.userData.top = 1.75;
  return g;
}

// the lobbed box (tumbles in the air)
export function makeCerealProjectile(v, p) {
  const g = new THREE.Group();
  g.add(cerealBoxModel(v, p.variant || 0, 0.6));
  return g;
}

// the standing wall box that sits on the floor for a few seconds. Entity = shelf { type:'cerealbox', v:variant, ttl, age }.
export function makeCerealBox(v, sh) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const m = cerealBoxModel(v, sh.v || 0, 1.5); m.position.y = 0.54; m.rotation.y = ((sh.id || 0) % 5 - 2) * 0.07; body.add(m);
  v.part(body, v.box, 0x000000, 0.7, 0.02, 0.34, 0, 0.011, 0, false);       // contact shadow
  g.userData.body = body; g.userData.stock = 0; g.userData.top = 1.2;
  g.userData.setGoods = () => {};
  g.userData.anim = (grp, s, time) => {                                    // pop in; blink when about to vanish
    const k = Math.min(1, (s.age || 0) / 0.25), e = k >= 1 ? 1 : 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
    grp.scale.setScalar(Math.max(0.01, e));
    grp.visible = !(s.ttl < 1.3 && Math.floor(time * 12) % 2 === 0);
  };
  return g;
}