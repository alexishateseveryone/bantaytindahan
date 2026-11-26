// Steel shelf: one long heavy-duty shelf that replaces a row of 3 shelves (3 cells long, one entity).
// Built along the z axis; `sh.dir === 'x'` turns it to run along x.
import * as THREE from 'three';

export function makeSteel(v, sh) {
  const g = new THREE.Group(), body = new THREE.Group(), rot = new THREE.Group();
  g.add(body); body.add(rot);
  if (sh.dir === 'x') rot.rotation.y = Math.PI / 2;
  const L = 3.0, steel = 0xc9d0db, dark = 0x59616f, post = 0x7d8696;
  v.part(rot, v.box, dark, 0.96, 0.1, L, 0, 0.05, 0);                                   // base plate
  v.part(rot, v.box, 0xaab2c0, 0.14, 1.04, L - 0.06, 0, 0.57, 0);                       // spine
  for (const y of [0.3, 0.62, 0.94]) v.part(rot, v.box, steel, 0.94, 0.05, L - 0.04, 0, y, 0);   // boards
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) v.part(rot, v.box, post, 0.06, 1.1, 0.06, sx * 0.45, 0.58, -1.47 + i * 0.98, false);   // uprights
  for (const sx of [-1, 1]) {
    v.part(rot, v.box, 0xe9eef5, 0.04, 0.035, L - 0.1, sx * 0.45, 1.12, 0, false);        // top rails
    for (let i = 0; i < 3; i++) v.glow(rot, 0x2a5db0, 0.03, 0.07, 0.34, sx * 0.47, 0.17, -1 + i);   // blue price strips
  }
  g.userData.body = body; g.userData.rot = rot;
  g.userData.goods = new THREE.Group(); rot.add(g.userData.goods); g.userData.stock = -1; g.userData.sv = sh.v || 0;
  g.userData.setGoods = setSteelGoods;
  return g;
}

// 18 units: spread over the three sections so a half-empty shelf looks half-empty everywhere
export function setSteelGoods(v, g, units) {
  const goods = g.userData.goods;
  while (goods.children.length) goods.remove(goods.children[0]);
  g.userData.stock = units;
  const pc = [0xff5a5f, 0xffcf4a, 0x5fe3a1, 0x6fa8ff, 0xffffff, 0xb26bd6];
  for (let n = 0; n < units; n++) for (const side of [-1, 1]) {
    const sec = n % 3, k = (n / 3) | 0, r = 2 - (k >> 1), i = k & 1;
    const h = 0.16 + ((r + i) % 3) * 0.04, col = pc[(n * 3 + (side > 0 ? 2 : 0)) % 6];
    v.part(goods, v.box, col, 0.24, h, 0.26, side * 0.27, 0.33 + r * 0.32 + h / 2 - 0.01, (sec - 1) + (-0.24 + i * 0.5));
  }
}