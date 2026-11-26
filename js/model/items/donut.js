// Donut Tray: a bakery tray. Fires 2 donuts in a row; a donut that hits a burglar flies back to the tray like a boomerang.
// The flying donut is a real 3D torus with icing and sprinkles.
import * as THREE from 'three';
import { ITEMS } from '../../game.js';

const DOUGH = 0xe0a458;
const ICING = [0xff7aa2, 0x5a2d1a, 0xfff1d6, 0x7df0d8, 0xffcf4a, 0xb26bd6];
const SPRINKLE = [0xff5a5f, 0xffcf4a, 0x5fe3a1, 0x6fa8ff, 0xffffff];
const torus = v => v.torusGeo ||= new THREE.TorusGeometry(0.5, 0.2, 8, 14);

// one donut lying flat: dough ring + icing on top + sprinkles. Lit (toon) and shadow-casting, like the 3D cans.
// `s` = scale (outer radius = 0.7 * s)
export function donutMesh(v, s, icing = ICING[0], sprinkles = true) {
  const g = new THREE.Group();
  const lit = (mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; return mesh; };
  const dough = lit(new THREE.Mesh(torus(v), v.toon(DOUGH))); dough.rotation.x = Math.PI / 2; dough.scale.setScalar(s); g.add(dough);
  const ice = lit(new THREE.Mesh(torus(v), v.toon(icing))); ice.rotation.x = Math.PI / 2; ice.scale.set(s * 1.02, s * 1.02, s * 0.75); ice.position.y = 0.07 * s; g.add(ice);
  if (sprinkles) for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4, r = 0.5 * s;
    const sp = lit(new THREE.Mesh(v.box, v.toon(SPRINKLE[i % 5]))); sp.scale.set(0.2 * s, 0.07 * s, 0.07 * s);
    sp.position.set(Math.cos(a) * r, 0.22 * s, Math.sin(a) * r); sp.rotation.y = -a + (i % 2 ? 0.8 : -0.5); g.add(sp);
  }
  g.position.y = 0.2 * s;
  return g;
}

export function makeDonut(v, t) {
  const g = new THREE.Group(), color = ITEMS.donut.color;
  v.part(g, v.box, 0x2c2845, 0.84, 0.08, 0.7, 0, 0.04, 0);                 // base plate
  v.part(g, v.box, 0x6b4526, 0.78, 0.5, 0.6, 0, 0.33, 0);                  // wooden counter
  v.part(g, v.box, color, 0.8, 0.05, 0.62, 0, 0.6, 0, false);              // pink tray
  v.part(g, v.box, color, 0.8, 0.07, 0.04, 0, 0.65, 0.29, false);          // low front rim
  v.part(g, v.box, color, 0.04, 0.07, 0.6, -0.39, 0.65, 0, false);         // side rims
  v.part(g, v.box, color, 0.04, 0.07, 0.6, 0.39, 0.65, 0, false);
  v.part(g, v.box, 0xfff1d6, 0.8, 0.34, 0.05, 0, 0.8, -0.29, false);       // back board
  const big = donutMesh(v, 0.3, 0xff7aa2, true); big.rotation.x = Math.PI / 2; big.position.set(0, 0.84, -0.25); g.add(big);   // donut sign
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {                // donuts lying on the tray
    const d = donutMesh(v, 0.2, ICING[(r * 3 + c) % ICING.length], (r + c) % 2 === 0);
    d.position.set(-0.26 + c * 0.26, 0.64 + 0.04, -0.08 + r * 0.24); d.rotation.y = r * 0.7 + c; g.add(d);
  }
  v.part(g, v.box, 0x1b1d28, 0.4, 0.18, 0.05, 0, 0.28, 0.31, false);       // output chute
  v.part(g, v.box, 0x363a48, 0.4, 0.14, 0.02, 0, 0.28, 0.34, false);       // chute flap
  g.userData.prop = null; g.userData.pipZ = 0.38; g.userData.pipY = 0.1; g.userData.top = 1.2;
  return g;
}

// a flying donut. userData.spin is what the view twirls around the vertical axis.
export function makeDonutProjectile(v, p) {
  const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin);
  const d = donutMesh(v, 0.27, ICING[(p.id || 0) % ICING.length], true); d.position.y = 0; spin.add(d);   // lit + casts a shadow on the floor
  g.userData.spin = spin;
  return g;
}