// Bruiser: big, tanky, red cap. Dashes hit extra hard.
import { buildHumanoid } from './humanoid.js';
export function makeBruiser(v, e) {
  return buildHumanoid(v, e, {
    shirt: 0x4a3a2e, big: 1.3,
    headgear: b => v.part(b, v.box, 0x7a1f1f, 0.28, 0.08, 0.26, 0, 0.82, 0),
  });
}
