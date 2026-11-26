// Enemy (burglar) models. One file per type; add a type by adding a file and a line here.
import { makeSneak } from './sneak.js';
import { makeRunner } from './runner.js';
import { makeVest } from './vest.js';
import { makeBruiser } from './bruiser.js';
import { makeBoss } from './boss.js';
import { makeJacket } from './jacket.js';
import { makeMolotov } from './molotov.js';
import { makeMoto } from './moto.js';
import { makeBat } from './bat.js';

const BUILDERS = { sneak: makeSneak, runner: makeRunner, vest: makeVest, bruiser: makeBruiser, boss: makeBoss, jacket: makeJacket, molotov: makeMolotov, moto: makeMoto, bat: makeBat };
export function makeEnemy(v, e) { return BUILDERS[e.type](v, e); }
