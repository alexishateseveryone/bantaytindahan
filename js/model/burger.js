// All Out Burger skill model: a giant 3x3 burger (sesame bun, lettuce, tomato, onion, cheese, patty) that drops from the ceiling,
// squashes on landing, wobbles harder while it holds as a temporary wall, then pops. Also the tiny burgers that fly out of it.
import * as THREE from 'three';

const BUN = 0xd9963a, BUN_D = 0xb87a28, PATTY = 0x5a2f1a, CHEESE = 0xffc833, LET = 0x58b947, LET_D = 0x3f9a35, TOM = 0xe0332a, ONION = 0xf4ecf0, KETCH = 0xd2231a, SESAME = 0xfff1cc;

// opts.landY = height of whatever it lands on; opts.icon = static burger for the build menu (no landing marker)
export function makeBigBurger(v, opts = {}) {
  const g = new THREE.Group(), pile = new THREE.Group(); g.add(pile);
  const R = 1.28;                                                      // 3x3 tiles: nearly 3 wide
  const P = (geo, c, sx, sy, sz, x, y, z, sh = true) => v.part(pile, geo, c, sx, sy, sz, x, y, z, sh);
  P(v.cyl, BUN_D, R * 0.96, 0.12, R * 0.96, 0, 0.06, 0);               // bottom bun: a thick, slightly darker base
  P(v.cyl, BUN, R, 0.2, R, 0, 0.2, 0);
  P(v.cyl, PATTY, R * 1.02, 0.17, R * 1.02, 0, 0.42, 0);               // beef patty
  for (let i = 0; i < 9; i++) { const a = i * 0.7, rr = R * 0.6 * (i % 3 ? 0.8 : 0.4); P(v.box, 0x3a1d10, 0.2, 0.02, 0.07, Math.cos(a) * rr, 0.515, Math.sin(a) * rr, false); }   // grill marks
  P(v.box, CHEESE, R * 1.72, 0.04, R * 1.72, 0, 0.56, 0).rotation.y = Math.PI / 4;   // square cheese slice, corners hang over
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; P(v.box, CHEESE, 0.26, 0.2, 0.26, Math.cos(a) * R * 1.12, 0.46, Math.sin(a) * R * 1.12, false).rotation.y = Math.PI / 4; }   // melted drips
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; P(v.cyl, i % 2 ? LET : LET_D, 0.46, 0.07, 0.46, Math.cos(a) * R * 0.92, 0.62 + (i % 2) * 0.03, Math.sin(a) * R * 0.92, false); }   // ruffled lettuce
  P(v.cyl, LET, R * 0.96, 0.05, R * 0.96, 0, 0.6, 0, false);
  for (const [x, z] of [[-0.62, -0.35], [0.5, -0.5], [0, 0.55], [-0.5, 0.5], [0.7, 0.3]]) P(v.cyl, TOM, 0.5, 0.09, 0.5, x, 0.7, z);   // tomato slices
  for (let i = 0; i < 3; i++) { const a = i * 2.1; P(v.cyl, ONION, 0.55, 0.05, 0.55, Math.cos(a) * 0.5, 0.78, Math.sin(a) * 0.5, false); }   // onion rings
  P(v.cyl, KETCH, R * 0.8, 0.04, R * 0.8, 0, 0.74, 0, false);          // ketchup layer
  for (const [a, h] of [[-1.1, 0.4], [0.9, 0.7], [1.15, -0.5], [-0.3, 1.18], [0.3, -1.2]]) { const x = Math.cos(a * 2) * R * 0.9, z = Math.sin(a * 2) * R * 0.9; P(v.box, KETCH, 0.13, h * 0.5, 0.13, x, 0.68 - h * 0.15, z, false); }   // ketchup drips
  const top = P(v.sph, BUN, R * 1.02, 0.62, R * 1.02, 0, 0.84, 0);     // domed top bun
  for (let i = 0; i < 26; i++) {                                       // sesame seeds
    const a = i * 2.4, r = Math.sqrt((i + 0.5) / 26) * R * 0.78, x = Math.cos(a) * r, z = Math.sin(a) * r, h = Math.sqrt(Math.max(0, 1 - (r / (R * 1.02)) ** 2)) * 0.62;
    P(v.box, SESAME, 0.11, 0.05, 0.06, x, 0.84 + h - 0.01, z, false).rotation.y = a * 1.7;
  }
  // the 3x3 landing zone on the floor, only while it is still on its way down
  const markMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.8 });
  const marker = new THREE.Group();
  if (!opts.icon) {
    for (const [sx, sz, x, z] of [[3, 0.07, 0, -1.5], [3, 0.07, 0, 1.5], [0.07, 3, -1.5, 0], [0.07, 3, 1.5, 0]]) {
      const m = new THREE.Mesh(v.box, markMat); m.scale.set(sx, 0.02, sz); m.position.set(x, 0.07, z); m.castShadow = false; marker.add(m);
    }
    g.add(marker);
  }
  g.userData = { pile, marker, markMat, top, landY: opts.landY || 0 };
  return g;
}

// s.t counts down the fall (def.fuse); after landing s.h counts down the 2 second wall (def.hold); s.phase 'minis' = it has popped
export function animBigBurger(g, s, time, v, def) {
  const u = g.userData, land = u.landY || 0;
  if (s.phase === 'minis') { g.visible = false; return; }
  g.visible = true;
  if (!s.landed) {
    const k = Math.min(1, Math.max(0, (def.fuse - s.t) / def.fuse));    // falling in from the ceiling, faster and faster
    u.pile.position.set(0, land + (1 - k * k) * 6.5, 0);
    u.pile.rotation.set(Math.sin(time * 6) * 0.15 * (1 - k), time * 5 * (1 - k), Math.cos(time * 5) * 0.15 * (1 - k));
    u.pile.scale.set(1, 1, 1);
    u.marker.visible = true; u.markMat.opacity = 0.45 + 0.4 * Math.sin(time * 16);
  } else {
    u.marker.visible = false;
    const el = def.hold - s.h, prog = Math.min(1, Math.max(0, el / def.hold));
    const sq = el < 0.3 ? Math.sin(el / 0.3 * Math.PI) : 0;           // landing squash, then it sits there and shivers harder and harder before it pops
    const a = 0.01 + prog * prog * 0.05, w = Math.sin(time * 38) * 0.02 * prog;
    u.pile.rotation.set(0, 0, 0);
    u.pile.position.set(Math.sin(time * 60) * a, land, Math.cos(time * 53) * a);
    u.pile.scale.set(1 + 0.16 * sq + 0.07 * prog + w, 1 - 0.3 * sq + 0.06 * prog, 1 + 0.16 * sq + 0.07 * prog + w);
    u.top.position.y = 0.84 + Math.max(0, Math.sin(time * 30)) * 0.05 * prog * prog;   // the top bun lifts as the pressure builds
  }
}

// a tiny burger (about a fifth of the size): one of the four that fly out when the big one pops
export function makeMiniBurger(v) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const P = (geo, c, sx, sy, sz, x, y, z) => v.part(body, geo, c, sx, sy, sz, x, y, z, false);
  P(v.cyl, BUN, 0.15, 0.035, 0.15, 0, 0, 0); P(v.cyl, PATTY, 0.155, 0.03, 0.155, 0, 0.05, 0); P(v.cyl, LET, 0.17, 0.014, 0.17, 0, 0.082, 0); P(v.cyl, TOM, 0.13, 0.014, 0.13, 0, 0.1, 0);
  P(v.sph, BUN, 0.16, 0.1, 0.16, 0, 0.12, 0); P(v.box, SESAME, 0.03, 0.012, 0.02, 0.04, 0.225, 0.02); P(v.box, SESAME, 0.03, 0.012, 0.02, -0.04, 0.22, -0.03);
  g.userData = { body };
  return g;
}