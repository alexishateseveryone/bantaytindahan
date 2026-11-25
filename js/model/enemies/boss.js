// Mastermind: top hat, striped shirt, huge.
import { buildHumanoid, lootBag } from './humanoid.js';
export function makeBoss(v, e) {
  return buildHumanoid(v, e, {
    shirt: 0x1a1a24, big: 1.7,
    torso: b => { for (let i = 0; i < 3; i++) v.part(b, v.box, 0xffffff, 0.35, 0.05, 0.23, 0, 0.3 + i * 0.1, 0, false); lootBag(v, b); },
    headgear: b => {
      v.part(b, v.cyl, 0x111118, 0.17, 0.2, 0.17, 0, 0.86, 0);
      v.part(b, v.cyl, 0x111118, 0.26, 0.03, 0.26, 0, 0.77, 0);
      v.part(b, v.box, 0xffcf4a, 0.18, 0.03, 0.18, 0, 0.8, 0.0, false);
    },
  });
}
