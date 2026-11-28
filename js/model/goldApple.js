// Golden Apple skill model: a shiny gold apple that glows and pulses while it powers up every item, then bursts in a gold 3x3 blast.
// While the fuse burns, the 3x3 tiles it will blast blink like the Shaken Cola grid.
import * as THREE from 'three';

function goldMats(v) {
  if (!v._goldMat) {
    v._goldMat = new THREE.MeshToonMaterial({ color: 0xffc83a, emissive: 0x5a3c00, gradientMap: v.gradient });
    v._goldLite = new THREE.MeshToonMaterial({ color: 0xffe27a, emissive: 0x7a5200, gradientMap: v.gradient });
    v._goldDark = new THREE.MeshToonMaterial({ color: 0xb8860b, gradientMap: v.gradient });
    v._goldGlow = new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.25, depthWrite: false });
  }
  return [v._goldMat, v._goldLite, v._goldGlow, v._goldDark];
}

// opts.blast = draw the blinking 3x3 grid under it; opts.icon = static apple for the build menu
export function makeGoldApple(v, opts = {}) {
  const [gold, lite, glowMat, dark] = goldMats(v);
  const g = new THREE.Group(), apple = new THREE.Group(); g.add(apple);
  const M = (geo, mat, sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; apple.add(m); return m; };
  M(v.sph, gold, 0.3, 0.27, 0.3, 0, 0.3, 0);                               // body: overlapping lobes make the apple shape
  M(v.sph, gold, 0.26, 0.25, 0.26, 0.05, 0.3, 0.04); M(v.sph, gold, 0.26, 0.25, 0.26, -0.05, 0.3, -0.04);
  M(v.sph, gold, 0.2, 0.1, 0.2, 0, 0.12, 0);                               // rounded bottom
  M(v.sph, lite, 0.08, 0.14, 0.05, -0.14, 0.38, 0.22).rotation.z = 0.5;    // shine
  M(v.cyl, dark, 0.07, 0.03, 0.07, 0, 0.55, 0);                            // dip where the stem sits
  const stem = M(v.box, lite, 0.035, 0.15, 0.035, 0.015, 0.62, 0); stem.rotation.z = -0.25;
  const leaf = M(v.sph, lite, 0.13, 0.025, 0.065, 0.14, 0.66, 0); leaf.rotation.z = 0.5; leaf.rotation.y = 0.4;
  const glow = new THREE.Mesh(v.sph, glowMat); glow.position.y = 0.32; glow.scale.setScalar(0.5); g.add(glow);   // soft halo
  const sparks = [];
  for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(v.box, v.basic(i % 2 ? 0xffffff : 0xffe27a)); s.scale.setScalar(0.04); g.add(s); sparks.push(s); }
  g.userData = { apple, glow, sparks, tiles: [], tm: null };
  if (opts.blast && !opts.icon) {
    const tm = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.3 }), tiles = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const t = new THREE.Mesh(v.box, tm); t.scale.set(0.9, 0.012, 0.9); t.position.set(i, 0.065, j); t.castShadow = false; g.add(t); tiles.push({ t, d: Math.hypot(i, j) });
    }
    g.userData.tiles = tiles; g.userData.tm = tm;
  }
  return g;
}

// s.t counts down the power-up
export function animGoldApple(g, s, time) {
  const u = g.userData, prog = 1 - Math.max(0, s.t) / s.max, a = 0.005 + prog * prog * 0.04;
  u.apple.position.set(Math.sin(time * 64) * a, 0.12 + Math.sin(time * 4) * 0.05 + prog * 0.1, Math.cos(time * 57) * a);   // floats and hums, shaking more near the end
  u.apple.rotation.y = time * (1.5 + prog * 7);
  u.apple.rotation.z = Math.sin(time * 40) * 0.12 * prog;
  u.apple.scale.setScalar(1 + Math.sin(time * 9) * 0.04 + prog * 0.16);
  u.glow.scale.setScalar(0.5 + 0.06 * Math.sin(time * 7) + prog * 0.35); u.glow.position.y = 0.42 + prog * 0.1;
  u.sparks.forEach((p, i) => { const k = (time * 0.9 + i / u.sparks.length) % 1, ang = i * 1.9 + time * 2; p.position.set(Math.cos(ang) * (0.22 + k * 0.25), 0.2 + k * 0.7, Math.sin(ang) * (0.22 + k * 0.25)); p.scale.setScalar(0.05 * (1 - k)); p.rotation.y = time * 5; });
  if (u.tm) {
    const on = Math.floor(time * (4 + prog * 16)) % 2 === 0; u.tm.opacity = on ? 0.4 : 0.12;
    for (const q of u.tiles) { const w = 0.5 + 0.5 * Math.sin(time * 6 - q.d * 2.2); q.t.scale.set(0.8 + 0.1 * w, 0.012, 0.8 + 0.1 * w); }
  }
}