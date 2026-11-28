// Banana models: a real 3D banana (curved, five-sided, tapered, with stem and dark tip) and the cardboard banana crate of the Banana Split skill.
import * as THREE from 'three';

const R = 0.34, A = 1.45;   // the banana is an arc of radius R spanning A radians: about 0.5 long
const YOFF = R * (1 - Math.cos(A / 2)) * 0.5;
const pt = a => [R * Math.sin(a), R * (1 - Math.cos(a)) - YOFF];

function bananaGeo() {
  const N = 14, S = 5, pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = (t - 0.5) * A, [cx, cy] = pt(a), nx = -Math.sin(a), ny = Math.cos(a);
    const r = 0.058 * (0.28 + 0.72 * Math.pow(Math.sin(Math.PI * t), 0.5));   // fat in the middle, thin at both ends
    for (let k = 0; k < S; k++) {
      const th = k / S * Math.PI * 2 + 0.3;
      pos.push(cx + Math.cos(th) * r * nx, cy + Math.cos(th) * r * ny, Math.sin(th) * r);
    }
  }
  const c0 = pos.length / 3, [sx, sy] = pt(-A / 2), [ex, ey] = pt(A / 2);
  pos.push(sx, sy, 0, ex, ey, 0);   // cap centres
  for (let i = 0; i < N; i++) for (let k = 0; k < S; k++) {
    const a = i * S + k, b = i * S + (k + 1) % S, c = (i + 1) * S + k, d = (i + 1) * S + (k + 1) % S;
    idx.push(a, c, b, b, c, d);
  }
  for (let k = 0; k < S; k++) { idx.push(c0, k, (k + 1) % S); idx.push(c0 + 1, N * S + (k + 1) % S, N * S + k); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const flat = g.toNonIndexed(); flat.computeVertexNormals();   // faceted: matches the flat toon look
  return flat;
}

export function makeBanana(v, scale = 1) {
  const g = new THREE.Group();
  v._bananaGeo ||= bananaGeo();
  v._bananaMat ||= new THREE.MeshToonMaterial({ color: 0xffd93b, gradientMap: v.gradient, side: THREE.DoubleSide });
  const body = new THREE.Mesh(v._bananaGeo, v._bananaMat); body.castShadow = true; g.add(body);
  const [ex, ey] = pt(A / 2), [sx, sy] = pt(-A / 2);
  const stem = new THREE.Mesh(v.box, v.toon(0x8a7a34)); stem.scale.set(0.07, 0.045, 0.045);
  stem.position.set(ex + Math.cos(A / 2) * 0.03, ey + Math.sin(A / 2) * 0.03, 0); stem.rotation.z = A / 2; g.add(stem);
  const tip = new THREE.Mesh(v.box, v.toon(0x3b2a14)); tip.scale.set(0.045, 0.04, 0.04);
  tip.position.set(sx - Math.cos(A / 2) * 0.012, sy + Math.sin(A / 2) * 0.012, 0); tip.rotation.z = -A / 2; g.add(tip);
  g.scale.setScalar(scale);
  return g;
}

// cardboard crate with a blue band and label, full of 10 bananas (one flies out per banana lobbed)
export function makeBananaCrate(v) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const W = 0.8, D = 0.58, H = 0.34, T = 0.03, card = 0xc99a5b, dark = 0x8f6a3a, blue = 0x2b6cb0, yel = 0xffd23f;
  v.part(body, v.box, dark, W, T, D, 0, T / 2, 0);
  for (const sg of [-1, 1]) {
    v.part(body, v.box, card, W, H, T, 0, H / 2, sg * (D / 2 - T / 2));
    v.part(body, v.box, card, T, H, D, sg * (W / 2 - T / 2), H / 2, 0);
    v.part(body, v.box, blue, W * 0.94, 0.07, 0.006, 0, H * 0.58, sg * (D / 2 + 0.001), false);   // blue band
    v.part(body, v.box, yel, 0.16, 0.11, 0.008, sg * 0.18, H * 0.5, sg * (D / 2 + 0.003), false);  // label
    v.part(body, v.box, blue, 0.08, 0.06, 0.01, sg * 0.18, H * 0.5, sg * (D / 2 + 0.005), false);
  }
  const flaps = [];
  for (const sg of [-1, 1]) {   // two flaps hinged on the short sides: they spring open when the crate pops
    const hinge = new THREE.Group(); hinge.position.set(sg * (W / 2 - T / 2), H, 0); body.add(hinge);
    v.part(hinge, v.box, card, 0.24, T, D, sg * 0.12, 0, 0); flaps.push(hinge);
  }
  const fruit = [];
  for (let L = 0; L < 2; L++) for (let i = 0; i < 5; i++) {
    const b = makeBanana(v, 0.95);
    b.position.set(0, L ? 0.27 : 0.13, -0.2 + i * 0.1); b.rotation.y = (L ? Math.PI : 0) + (Math.random() - 0.5) * 0.3;
    b.userData.base = b.position.y; body.add(b); fruit.push(b);
  }
  fruit.reverse();   // the top layer goes first
  g.userData = { body, flaps, fruit };
  return g;
}

// s.t counts down the fuse (crate shakes harder), then the lid springs open and the bananas leave one by one
export function animBananaCrate(g, s, time, v, def) {
  const u = g.userData;
  let open = 0.25, wob = 0;
  if (!s.popped) {
    wob = 1 - Math.max(0, s.t) / def.fuse; wob *= wob;
    g.rotation.set(Math.cos(time * 33) * 0.05 * wob, 0, Math.sin(time * 40) * 0.06 * wob);
    g.position.y = Math.abs(Math.sin(time * 18)) * 0.06 * wob; g.scale.set(1, 1, 1);
    open = 0.25 + 0.5 * wob;
    u.fruit.forEach((b, i) => { b.position.y = b.userData.base + Math.sin(time * 30 + i) * 0.02 * wob; });
  } else {
    const k = s.kick || 0;
    g.rotation.set(0, 0, 0); g.position.y = 0;
    g.scale.set(1 + 0.12 * k, 1 - 0.18 * k, 1 + 0.12 * k);
    open = 1.1 + 0.4 * k;
    const gone = def.count - s.left;                      // bananas already thrown leave the crate
    u.fruit.forEach((b, i) => { b.visible = i >= gone; });
    if (s.after > 0.3) g.scale.multiplyScalar(Math.max(0.01, 1 - (s.after - 0.3) / 0.3));
  }
  u.flaps[0].rotation.z = -open; u.flaps[1].rotation.z = open;
}