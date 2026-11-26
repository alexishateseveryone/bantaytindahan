// Security fence: a stainless steel post with rails that reach toward neighbouring fence pieces,
// so a row of them looks like one continuous barrier.
import * as THREE from 'three';

export function makeFence(v, sh) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const steel = 0xc9ced6;
  v.part(body, v.cyl, 0x8b92a3, 0.17, 0.05, 0.17, 0, 0.025, 0);                   // foot plate
  v.part(body, v.cyl, steel, 0.055, 0.9, 0.055, 0, 0.5, 0);                        // post
  v.part(body, v.sph, 0xe9eef5, 0.075, 0.075, 0.075, 0, 0.97, 0, false);          // ball top
  v.part(body, v.cyl, 0xf2c200, 0.062, 0.07, 0.062, 0, 0.55, 0, false);           // yellow safety band
  // rails towards +x, -x, +z, -z (shown only when a fence piece is next to this one)
  const rails = [];
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const r = new THREE.Group();
    for (const y of [0.4, 0.75]) v.part(r, v.box, steel, dx ? 0.5 : 0.035, 0.035, dz ? 0.5 : 0.035, dx * 0.25, y, dz * 0.25, false);
    v.part(r, v.box, 0xf2c200, dx ? 0.5 : 0.036, 0.03, dz ? 0.5 : 0.036, dx * 0.25, 0.575, dz * 0.25, false);   // yellow hazard rail between the steel ones
    body.add(r); rails.push(r);
  }
  g.userData.body = body; g.userData.rails = rails; g.userData.links = -1; g.userData.stock = 0;
  g.userData.setLinks = mask => {
    g.userData.links = mask;
    const m = mask || 3;   // a lone fence piece still looks like a fence segment: rails left and right
    rails.forEach((r, i) => { r.visible = !!(m & (1 << i)); });
  };
  g.userData.setGoods = () => { g.userData.stock = 0; };
  g.userData.setLinks(0);
  return g;
}