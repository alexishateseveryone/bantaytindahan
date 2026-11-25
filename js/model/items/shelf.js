// Double-sided gondola shelf: one grid cell, joins neighbours into long aisles.
import * as THREE from 'three';

export function makeShelf(v, sh) {
  const g = new THREE.Group(); g.position.set(0, 0, 0);
  const body = new THREE.Group(); g.add(body); g.userData.body = body;
  const wood = [0xa0703f, 0x8f6a4a, 0xb07d4a][sh.v], board = [0xc08a50, 0xb8946a, 0xd0985c][sh.v];
  v.part(body, v.box, 0x6b4526, 0.9, 0.1, 1.0, 0, 0.05, 0);
  v.part(body, v.box, wood, 0.14, 1.0, 1.0, 0, 0.55, 0);
  for (const y of [0.3, 0.62, 0.94]) v.part(body, v.box, board, 0.9, 0.06, 0.98, 0, y, 0);
  v.part(body, v.box, 0xf3e3c3, 0.06, 0.03, 0.9, 0.42, 0.97, 0, false);
  v.part(body, v.box, 0xf3e3c3, 0.06, 0.03, 0.9, -0.42, 0.97, 0, false);
  g.userData.goods = new THREE.Group(); body.add(g.userData.goods); g.userData.stock = -1; g.userData.sv = sh.v;
  return g;
}

// one unit of stock = one good on each side; units fill the top board first so they show from above
export function setShelfGoods(v, g, units) {
  const goods = g.userData.goods;
  while (goods.children.length) goods.remove(goods.children[0]);
  g.userData.stock = units;
  const pc = [0xff5a5f, 0xffcf4a, 0x5fe3a1, 0x6fa8ff, 0xffffff, 0xb26bd6];
  for (let n = 0; n < units; n++) for (const side of [-1, 1]) {
    const r = 2 - (n >> 1), i = n & 1;
    const k = (g.userData.sv * 5 + n * 3 + (side > 0 ? 2 : 0)) % 6;
    const h = 0.16 + ((r + i) % 3) * 0.04;
    v.part(goods, v.box, pc[k], 0.24, h, 0.26, side * 0.27, 0.33 + r * 0.32 + h / 2 - 0.01, -0.24 + i * 0.5);
  }
}
