// Enemy (burglar) models. One file per type; add a type by adding a file and a line here.
import { makeSneak } from './sneak.js';
import { makeRunner } from './runner.js';
import { makeVest } from './vest.js';
import { makeBruiser } from './bruiser.js';
import { makeBombExpert } from './bombexpert.js';
import { makeGunslinger } from './gunslinger.js';
import { makeGunner } from './gunner.js';
import { makeMotoDuo } from './motoduo.js';
import { makeDoorRobber } from './doorrobber.js';
import { makeJacket } from './jacket.js';
import { makeMolotov } from './molotov.js';
import { makeMoto } from './moto.js';
import { makeBat } from './bat.js';

const BUILDERS = { sneak: makeSneak, runner: makeRunner, vest: makeVest, bruiser: makeBruiser, jacket: makeJacket, molotov: makeMolotov, moto: makeMoto, bat: makeBat,
  // bosses (one every 10th day, in the last wave)
  bombexpert: makeBombExpert, gunslinger: makeGunslinger, motoduo: makeMotoDuo, doorrobber: makeDoorRobber, gunner: makeGunner };
export function makeEnemy(v, e) { return BUILDERS[e.type](v, e); }
