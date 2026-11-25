// Vest: hi-vis vest, armored.
import { buildHumanoid, lootBag } from './humanoid.js';
export function makeVest(v, e) {
  return buildHumanoid(v, e, {
    shirt: 0x2b2b3a,
    torso: b => { v.part(b, v.box, 0xffa62b, 0.38, 0.3, 0.26, 0, 0.4, 0); v.part(b, v.box, 0xdcdcdc, 0.39, 0.04, 0.27, 0, 0.45, 0, false); lootBag(v, b); },
  });
}
