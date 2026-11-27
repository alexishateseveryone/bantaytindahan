// Gunner: small, fast, black beanie and red mask, a pistol in his hand. Summoned by the Gunslinger.
import { buildHumanoid } from './humanoid.js';
export function makeGunner(v, e) {
  return buildHumanoid(v, e, {
    shirt: 0x222831, big: 1,
    torso: b => {
      v.part(b, v.box, 0xd62828, 0.36, 0.05, 0.24, 0, 0.5, 0, false);                                    // red belt of ammo
      v.part(b, v.box, 0x2b2b33, 0.05, 0.07, 0.2, 0.2, 0.38, 0.2, false);                                // pistol
      v.part(b, v.box, 0x2b2b33, 0.05, 0.14, 0.05, 0.2, 0.32, 0.12, false);
    },
    headgear: b => {
      v.part(b, v.cyl, 0x111118, 0.15, 0.07, 0.15, 0, 0.79, 0);                                          // beanie
      v.part(b, v.box, 0xd62828, 0.27, 0.07, 0.27, 0, 0.7, 0, false);                                    // mask band
    },
  });
}
