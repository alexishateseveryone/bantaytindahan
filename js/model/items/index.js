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
import { makeGum, makeGumProjectile } from './gum.js';
import { makeCola, makeColaProjectile } from './cola.js';
import { makeAtm, makeReceiptProjectile } from './atm.js';
import { makeSteel } from './steel.js';
import { makeFruitShelf, makeFruit } from './fruit.js';
import { makeStatue } from './statue.js';
import { makeFence } from './fence.js';
import { makeWater, makeWaterProjectile } from './water.js';
import { makeDonut, makeDonutProjectile } from './donut.js';
import { makeCereal, makeCerealProjectile, makeCerealBox } from './cereal.js';
import { makeTissue, makeTissueRoll } from './tissue.js';

export { makeShelf, setShelfGoods, makeCan, makeBomb, makeGroundBomb, animGroundBomb, makeFire, animFire, makeIceCube, makeFruit };

const BUILDERS = { shelf: makeShelf, cans: makeVending, sauce: makeSauce, soda: makeSoda, micro: makeMicrowave, mop: makeMop, hotdog: makeHotdog, fridge: makeFridge,
  gum: makeGum, cola: makeCola, atm: makeAtm, steel: makeSteel, fruit: makeFruitShelf, statue: makeStatue, fence: makeFence,
  water: makeWater, donut: makeDonut, cereal: makeCereal, tissue: makeTissue, cerealbox: makeCerealBox };
const PROJECTILES = { cans: makeCanProjectile, soda: makeSprayProjectile, sauce: makeSauceProjectile, bomb: makeBombProjectile,
  hotdog: makeHotdogProjectile, milk: makeMilkProjectile, icecream: makeIceCreamProjectile, ice: makeIceProjectile,
  gum: makeGumProjectile, cola: makeColaProjectile, atm: makeReceiptProjectile,
  water: makeWaterProjectile, cereal: makeCerealProjectile, donut: makeDonutProjectile, tissue: makeTissueRoll };

// Any buildable thing: entity = { type, ... } (shelves use type 'shelf')
export function makeItem(v, entity) { return BUILDERS[entity.type || 'shelf'](v, entity); }
export function makeProjectile(v, p) { return PROJECTILES[p.kind](v, p); }
