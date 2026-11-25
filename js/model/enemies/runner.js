// Runner: purple hoodie, fast and fragile. Loves to dash.
import { buildHumanoid } from './humanoid.js';
export function makeRunner(v, e) {
  return buildHumanoid(v, e, {
    shirt: 0x6a4cff, head: 0x4331b8,
    torso: b => v.part(b, v.box, 0x6a4cff, 0.3, 0.12, 0.14, 0, 0.7, -0.1),   // hood
  });
}
