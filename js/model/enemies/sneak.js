// Sneak: striped shirt + loot bag. The basic burglar.
import { buildHumanoid, lootBag } from './humanoid.js';
export function makeSneak(v, e) {
  return buildHumanoid(v, e, {
    shirt: 0x2b2b3a,
    torso: b => { for (let i = 0; i < 3; i++) v.part(b, v.box, 0xffffff, 0.35, 0.05, 0.23, 0, 0.3 + i * 0.1, 0, false); lootBag(v, b); },
  });
}
