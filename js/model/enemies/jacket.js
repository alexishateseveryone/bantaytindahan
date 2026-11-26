// Jacket: thick padded puffer jacket. Immune to slow and freeze.
import { buildHumanoid, lootBag } from './humanoid.js';
export function makeJacket(v, e) {
  return buildHumanoid(v, e, {
    shirt: 0x3d6b4f, big: 1.1,
    torso: b => {
      v.part(b, v.box, 0x3d6b4f, 0.42, 0.34, 0.3, 0, 0.4, 0);                       // puffy body
      for (let i = 0; i < 3; i++) v.part(b, v.box, 0x2c5039, 0.43, 0.03, 0.31, 0, 0.3 + i * 0.09, 0, false);   // quilted bands
      v.part(b, v.box, 0x2c5039, 0.46, 0.08, 0.32, 0, 0.55, 0, false);             // fat collar
      v.part(b, v.box, 0x9fe3ff, 0.06, 0.06, 0.02, 0, 0.5, 0.16, false);            // frosty zip pull
      lootBag(v, b);
    },
    headgear: b => v.part(b, v.box, 0x2c5039, 0.3, 0.07, 0.28, 0, 0.8, 0),          // beanie
  });
}