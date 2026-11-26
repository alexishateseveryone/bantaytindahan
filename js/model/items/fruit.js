// Fruit basket shelf (a shelf with baskets of fruit) + the loose fruit that rolls out when it is smashed.
import * as THREE from 'three';

export const FRUIT_COLORS = [0xe0463e, 0xff9f1c, 0x8bd450, 0xffd23f, 0x7b3fa0];   // apple, orange, pear, lemon, grapes

export function makeFruitShelf(v, sh) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const wood = [0xb8793a, 0xa86d33, 0xc4863f][(sh.v || 0) % 3], board = 0xd9a45c;
  v.part(body, v.box, 0x7a4a24, 0.9, 0.1, 1.0, 0, 0.05, 0);
  v.part(body, v.box, wood, 0.14, 1.0, 1.0, 0, 0.55, 0);
  for (const y of [0.3, 0.62, 0.94]) {
    v.part(body, v.box, board, 0.9, 0.06, 0.98, 0, y, 0);
    for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) v.part(body, v.box, i % 2 ? 0xffffff : 0xe0463e, 0.03, 0.05, 0.2, sx * 0.455, y + 0.04, -0.4 + i * 0.2, false);   // checkered trim
  }
  g.userData.body = body;
  g.userData.goods = new THREE.Group(); body.add(g.userData.goods); g.userData.stock = -1; g.userData.sv = sh.v || 0;
  g.userData.setGoods = setFruitGoods;
  return g;
}

// one unit = one basket of fruit on each side
export function setFruitGoods(v, g, units) {
  const goods = g.userData.goods;
  while (goods.children.length) goods.remove(goods.children[0]);
  g.userData.stock = units;
  for (let n = 0; n < units; n++) for (const side of [-1, 1]) {
    const r = 2 - (n >> 1), i = n & 1, k = (g.userData.sv + n + (side > 0 ? 2 : 0)) % 5;
    const y = 0.33 + r * 0.32, x = side * 0.27, z = -0.24 + i * 0.5;
    v.part(goods, v.box, 0x8a5a2b, 0.27, 0.1, 0.27, x, y + 0.05, z);                                              // basket
    for (const [dx, dz, dy] of [[-0.06, -0.05, 0.17], [0.07, -0.03, 0.17], [0, 0.07, 0.17], [0.01, 0, 0.25]])
      v.part(goods, v.sph, FRUIT_COLORS[(k + (dx > 0 ? 1 : 0) + (dy > 0.2 ? 2 : 0)) % 5], 0.075, 0.075, 0.075, x + dx, y + dy, z + dz, false);   // heap of fruit
  }
}

// loose fruit lying on the floor with a lit fuse: flashes faster as it gets close to going off
export function makeFruit(v, f) {
  const g = new THREE.Group(), col = FRUIT_COLORS[f.kind % FRUIT_COLORS.length];
  const body = v.part(g, v.sph, col, 0.16, 0.16, 0.16, 0, 0.16, 0);
  v.part(g, v.box, 0x5a3b1e, 0.02, 0.07, 0.02, 0, 0.33, 0, false);                                                // stem
  v.part(g, v.box, 0x4cae4c, 0.09, 0.015, 0.05, 0.05, 0.34, 0, false);                                            // leaf
  const flash = new THREE.Mesh(v.sph, v.basic(0xffffff)); flash.scale.setScalar(0.175); flash.position.y = 0.16; flash.visible = false; g.add(flash);
  g.userData.flash = flash; g.userData.fruitBody = body;
  return g;
}