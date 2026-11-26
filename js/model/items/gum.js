// Bubblegum machine. NOT a turret: it never turns, gumballs pop out of its chute at the front.
import * as THREE from 'three';
import { GUM_COLORS } from '../../game.js';

export function makeGum(v, t) {
  const g = new THREE.Group(), pink = 0xff7aa2, dark = 0xd9547f;
  v.part(g, v.cyl, 0xb23f66, 0.4, 0.08, 0.4, 0, 0.04, 0);                  // foot
  v.part(g, v.cyl, pink, 0.3, 0.62, 0.3, 0, 0.39, 0);                        // pedestal
  v.part(g, v.cyl, dark, 0.34, 0.07, 0.34, 0, 0.7, 0, false);                // collar under the globe
  // front plate, coin knob and chute
  v.part(g, v.box, 0xd9dde5, 0.26, 0.3, 0.05, 0, 0.42, 0.28, false);
  v.part(g, v.cyl, 0x8b92a3, 0.07, 0.04, 0.07, 0, 0.47, 0.32, false).rotation.x = Math.PI / 2;
  v.part(g, v.box, 0x6b7080, 0.14, 0.03, 0.02, 0, 0.47, 0.35, false);
  v.part(g, v.box, 0x1b1d28, 0.16, 0.1, 0.06, 0, 0.27, 0.3, false);
  g.userData.flap = v.part(g, v.box, 0x363a48, 0.12, 0.06, 0.02, 0, 0.27, 0.34, false);
  // the globe: a ball of gumballs (no glass, so you can see them)
  const R = 0.27, N = 28;
  for (let i = 0; i < N; i++) {
    const phi = i * 2.399963, yy = 1 - 2 * (i + 0.5) / N, rr = Math.sqrt(1 - yy * yy);
    v.part(g, v.sph, GUM_COLORS[(i * 3) % GUM_COLORS.length], 0.085, 0.085, 0.085, Math.cos(phi) * rr * R, 1.04 + yy * R, Math.sin(phi) * rr * R, false);
  }
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05;
    v.part(g, v.sph, GUM_COLORS[(i * 2 + 1) % GUM_COLORS.length], 0.09, 0.09, 0.09, Math.cos(a) * 0.12, 1.04 + (i % 3 - 1) * 0.1, Math.sin(a) * 0.12, false);
  }
  v.part(g, v.cyl, pink, 0.3, 0.07, 0.3, 0, 1.38, 0);                        // lid
  v.part(g, v.sph, pink, 0.2, 0.12, 0.2, 0, 1.43, 0, false);
  v.part(g, v.sph, dark, 0.05, 0.05, 0.05, 0, 1.53, 0, false);               // knob
  g.userData.prop = null; g.userData.pipZ = 0.34; g.userData.pipY = 0.14; g.userData.top = 1.75;
  return g;
}

// a single gumball, flying
export function makeGumProjectile(v, p) {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(v.sph, v.toon(p.color || 0xff5a8a)); ball.scale.setScalar(0.1); g.add(ball);
  const shine = new THREE.Mesh(v.sph, v.basic(0xffffff)); shine.scale.setScalar(0.03); shine.position.set(0.04, 0.05, 0.05); g.add(shine);
  return g;
}