// Item models: shelves, turrets, traps, projectiles and ground effects.
// Add a new item by creating a file here and adding one line to the tables below.
import { makeShelf, setShelfGoods } from './shelf.js';
import { makeVending } from './vending.js';
import { makeHotdog, makeHotdogProjectile } from './hotdog.js';
import { makeFridge, makeMilkProjectile, makeIceCreamProjectile, makeIceProjectile, makeIceCube } from './fridge.js';
import { makeSauce, makeSauceProjectile } from './sauce.js';
import { makeSoda, makeSprayProjectile } from './soda.js';
import { makeMicrowave } from './microwave.js';
import { makeMop } from './mop.js';
import { makeCan, makeCanProjectile } from './can.js';
import { makeBombProjectile, makeGroundBomb, animGroundBomb, makeBomb } from './bomb.js';
import { makeFire, animFire } from './fire.js';

export { makeShelf, setShelfGoods, makeCan, makeBomb, makeGroundBomb, animGroundBomb, makeFire, animFire, makeIceCube };

const BUILDERS = { shelf: makeShelf, cans: makeVending, sauce: makeSauce, soda: makeSoda, micro: makeMicrowave, mop: makeMop, hotdog: makeHotdog, fridge: makeFridge };
const PROJECTILES = { cans: makeCanProjectile, soda: makeSprayProjectile, sauce: makeSauceProjectile, bomb: makeBombProjectile,
  hotdog: makeHotdogProjectile, milk: makeMilkProjectile, icecream: makeIceCreamProjectile, ice: makeIceProjectile };

// Any buildable thing: entity = { type, ... } (shelves use type 'shelf')
export function makeItem(v, entity) { return BUILDERS[entity.type || 'shelf'](v, entity); }
export function makeProjectile(v, p) { return PROJECTILES[p.kind](v, p); }