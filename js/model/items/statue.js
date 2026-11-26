// Soda statue: a giant soda bottle on a round plinth (3x3 tiles, no brand marks). Its gauge shows how much stock is left;
// while there is stock it repairs everything damaged around it.
import * as THREE from 'three';

export function makeStatue(v, sh) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const red = 0xd6262b;
  v.part(body, v.cyl, 0x2c2845, 1.28, 0.16, 1.28, 0, 0.08, 0);                       // base ring
  v.part(body, v.cyl, 0xc9ced6, 1.12, 0.22, 1.12, 0, 0.27, 0);                       // steel plinth
  v.part(body, v.cyl, 0xa9afba, 1.18, 0.05, 1.18, 0, 0.4, 0, false);
  // the bottle
  const bottle = new THREE.Group(); bottle.position.y = 0.42; body.add(bottle);
  v.part(bottle, v.cyl, red, 0.5, 1.0, 0.5, 0, 0.5, 0);                              // body
  v.part(bottle, v.cyl, 0xffffff, 0.515, 0.12, 0.515, 0, 0.5, 0, false);             // white wave band
  v.part(bottle, v.cyl, 0xffffff, 0.515, 0.04, 0.515, 0, 0.35, 0, false);
  v.part(bottle, v.cyl, 0xffffff, 0.515, 0.04, 0.515, 0, 0.65, 0, false);
  v.part(bottle, v.cyl, red, 0.38, 0.22, 0.38, 0, 1.1, 0);                           // shoulder
  v.part(bottle, v.cyl, red, 0.24, 0.2, 0.24, 0, 1.28, 0);
  v.part(bottle, v.cyl, red, 0.16, 0.34, 0.16, 0, 1.5, 0);                           // neck
  v.part(bottle, v.cyl, 0xe9eef5, 0.2, 0.09, 0.2, 0, 1.76, 0);                       // cap
  v.part(bottle, v.cyl, 0xe9eef5, 0.21, 0.03, 0.21, 0, 1.69, 0, false);
  // fizz bubbles floating around it
  const bubbles = [];
  for (let i = 0; i < 7; i++) bubbles.push(v.part(body, v.sph, 0xffffff, 0.05 + (i % 3) * 0.015, 0.05 + (i % 3) * 0.015, 0.05 + (i % 3) * 0.015, 0, 1, 0, false));
  // stock gauge on the front of the plinth: 6 segments
  v.part(body, v.box, 0x14161f, 0.96, 0.2, 0.06, 0, 0.27, 1.07, false);
  const segs = [];
  for (let i = 0; i < 6; i++) segs.push(v.glow(body, 0x5fe3a1, 0.13, 0.12, 0.03, -0.375 + i * 0.15, 0.27, 1.1));
  // little steel posts at the corners of the 3x3 area
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    v.part(body, v.cyl, 0x8b92a3, 0.07, 0.5, 0.07, sx * 1.3, 0.25, sz * 1.3, false);
    v.part(body, v.sph, red, 0.1, 0.1, 0.1, sx * 1.3, 0.52, sz * 1.3, false);
  }
  g.userData.body = body; g.userData.bottle = bottle; g.userData.bubbles = bubbles; g.userData.segs = segs;
  g.userData.stock = -1; g.userData.setGoods = setStatueFill;
  g.userData.anim = animStatue;
  return g;
}

export function setStatueFill(v, g, units) {
  g.userData.stock = units;
  g.userData.segs.forEach((s, i) => { s.visible = i < units; });
}

// slow spin while it has stock, bubbles drifting up
export function animStatue(g, sh, time, dt) {
  const u = g.userData, on = sh.units > 0;
  u.bottle.rotation.y += dt * (on ? 0.9 : 0);
  u.bubbles.forEach((b, i) => {
    b.visible = on;
    const t = (time * 0.35 + i * 0.37) % 1, a = i * 2.4 + time * 0.8;
    b.position.set(Math.cos(a) * (0.55 + (i % 3) * 0.12), 0.7 + t * 1.5, Math.sin(a) * (0.55 + (i % 3) * 0.12));
  });
}