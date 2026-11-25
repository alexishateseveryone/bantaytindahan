// All 3D models live under js/model/. view.js only decides WHERE things go and how they animate;
// what they LOOK like is built here.
//   model/items/    shelves, turrets, traps, projectiles (cans, sauce glob, bombs), fire puddles
//   model/enemies/  burglar types (shared humanoid rig in humanoid.js)
//   model/customer.js, model/store.js   shoppers and the room itself
export { makeItem, makeProjectile, makeShelf, setShelfGoods, makeCan, makeBomb, makeGroundBomb, animGroundBomb, makeFire, animFire } from './items/index.js';
export { makeEnemy } from './enemies/index.js';
export { makeCustomer } from './customer.js';
export { buildStore, makeProp } from './store.js';
