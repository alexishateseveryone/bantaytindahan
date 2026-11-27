// 2. Gunslinger: cowboy hat, long brown duster, bandolier and a pump shotgun. Shoots whatever blocks his way.
import { buildHumanoid } from './humanoid.js';
export function makeGunslinger(v, e) {
  return buildHumanoid(v, e, {
    shirt: 0x7a5230, big: 1.6,
    torso: b => {
      v.part(b, v.box, 0x5b3a1e, 0.37, 0.2, 0.25, 0, 0.18, 0, false);                                   // coat tails
      v.part(b, v.box, 0x3a2412, 0.06, 0.5, 0.26, 0.04, 0.4, 0, false).rotation.z = 0.5;                // bandolier strap
      for (let i = 0; i < 4; i++) v.part(b, v.box, 0xffcf4a, 0.05, 0.05, 0.05, 0.12 - i * 0.07, 0.33 + i * 0.07, 0.14, false);   // shells
      v.part(b, v.box, 0xffee58, 0.07, 0.07, 0.03, -0.12, 0.5, 0.13, false);                              // sheriff star
      // the pump shotgun, held out front on the right side
      v.part(b, v.box, 0x2b2b33, 0.05, 0.05, 0.62, 0.22, 0.4, 0.34, false);                              // barrel
      v.part(b, v.box, 0x7a4b2b, 0.07, 0.09, 0.2, 0.22, 0.38, 0.0, false);                               // stock
      v.part(b, v.box, 0x5b3a1e, 0.08, 0.06, 0.16, 0.22, 0.35, 0.3, false);                              // pump grip
      v.part(b, v.box, 0xffd23f, 0.03, 0.03, 0.03, 0.22, 0.4, 0.66, false);                              // muzzle bead
    },
    headgear: b => {
      v.part(b, v.cyl, 0x4a2f18, 0.31, 0.025, 0.31, 0, 0.78, 0);                                         // wide brim
      v.part(b, v.cyl, 0x5b3a1e, 0.17, 0.14, 0.17, 0, 0.86, 0);                                          // crown
      v.part(b, v.cyl, 0x1a1a24, 0.175, 0.03, 0.175, 0, 0.82, 0, false);                                 // hat band
      v.part(b, v.box, 0x2b2b33, 0.28, 0.07, 0.04, 0, 0.67, 0.12, false);                                // bandana over the face
    },
  });
}
