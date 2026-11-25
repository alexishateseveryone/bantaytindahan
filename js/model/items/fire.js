// Burning sauce puddle left on the floor by the Hot Sauce Lobber.
import * as THREE from 'three';

export function makeFire(v, f) {
  const g = new THREE.Group();
  const puddle = new THREE.Mesh(v.cyl, v.basic(0x8a1c0e)); puddle.scale.set(f.r, 0.02, f.r); puddle.position.y = 0.045; g.add(puddle);
  const glow = new THREE.Mesh(v.cyl, v.basic(0xff5a1f)); glow.scale.set(f.r * 0.7, 0.02, f.r * 0.7); glow.position.y = 0.055; g.add(glow);
  g.userData.flames = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + Math.random(), d = (0.15 + Math.random() * 0.75) * f.r;
    const m = new THREE.Mesh(v.box, v.basic(0xff8c1a)); m.position.set(Math.cos(a) * d, 0.1, Math.sin(a) * d);
    m.userData.ph = Math.random() * 6; g.add(m); g.userData.flames.push(m);
  }
  g.userData.glow = glow; g.userData.puddle = puddle; g.userData.r = f.r;
  return g;
}

export function animFire(v, g, f, time) {
  const fade = Math.min(1, f.t / 0.6);
  g.userData.flames.forEach((m, i) => {
    const k = 0.5 + 0.5 * Math.sin(time * 9 + m.userData.ph);
    const h = (0.1 + k * 0.28) * fade, w = (0.07 + (1 - k) * 0.06) * fade;
    m.scale.set(w, Math.max(0.001, h), w); m.position.y = 0.05 + h / 2;
    m.material = v.basic(k > 0.7 ? 0xffd23f : k > 0.35 ? 0xff8c1a : 0xe0391a);
  });
  const r = g.userData.r;
  g.userData.glow.scale.set(r * 0.7 * fade, 0.02, r * 0.7 * fade);
  g.userData.puddle.scale.set(r * (0.4 + 0.6 * fade), 0.02, r * (0.4 + 0.6 * fade));
}
