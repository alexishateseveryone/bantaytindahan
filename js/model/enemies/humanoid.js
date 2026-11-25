// Shared burglar body: legs, torso, head, hp bar, status pips and the bomb they hold up when winding up.
// Each enemy file passes colours and a couple of "extras" callbacks to customise it.
import * as THREE from 'three';

export function buildHumanoid(v, e, cfg) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.userData.body = body;
  const big = cfg.big || 1;
  const legL = v.part(body, v.box, 0x1e1e28, 0.11, 0.24, 0.12, -0.08, 0.12, 0), legR = v.part(body, v.box, 0x1e1e28, 0.11, 0.24, 0.12, 0.08, 0.12, 0);
  g.userData.legs = [legL, legR];
  v.part(body, v.box, cfg.shirt, 0.34, 0.34, 0.22, 0, 0.4, 0);          // torso
  if (cfg.torso) cfg.torso(body);
  v.part(body, v.box, cfg.head || 0x15151c, 0.26, 0.24, 0.24, 0, 0.67, 0);   // head / mask
  v.part(body, v.box, 0xf1c9a0, 0.2, 0.06, 0.04, 0, 0.69, 0.125, false);      // eye strip
  v.part(body, v.box, 0x15151c, 0.06, 0.05, 0.04, -0.05, 0.69, 0.14, false);
  if (cfg.headgear) cfg.headgear(body);
  body.scale.setScalar(big);

  // a bomb held over the head while winding up
  const hold = new THREE.Group(); hold.position.set(0, 1.12 * big, 0); hold.visible = false;
  const hb = new THREE.Mesh(v.sph, v.toon(0x1b1b24)); hb.scale.setScalar(0.14); hold.add(hb);
  const hs = new THREE.Mesh(v.box, v.basic(0xffd23f)); hs.scale.setScalar(0.06); hs.position.set(0.05, 0.17, 0); hold.add(hs);
  g.add(hold); g.userData.hold = hold;

  // hp bar
  const bar = new THREE.Group(); bar.position.y = 0.95 * big + 0.15; g.add(bar);
  const bg = new THREE.Mesh(v.plane, v.basic(0x15122b)); bg.scale.set(0.62, 0.11, 1); bar.add(bg);
  const fg = new THREE.Mesh(v.plane, v.basic(0xff5a5f)); fg.position.z = 0.01; bar.add(fg);
  g.userData.bar = bar; g.userData.fg = fg; bar.visible = false;

  // status pips: burning, slowed, stunned, panicking, about to act
  const mk = (c, x) => { const m = new THREE.Mesh(v.box, v.basic(c)); m.scale.set(0.1, 0.1, 0.1); m.position.set(x, 0.95 * big + 0.34, 0); m.visible = false; g.add(m); return m; };
  g.userData.st = { burn: mk(0xff8c1a, -0.24), slow: mk(0x6fe3ff, -0.12), stun: mk(0xffee58, 0), flee: mk(0xffffff, 0.12), wind: mk(0xff2d2d, 0.24) };
  g.userData.big = big;
  return g;
}

// the loot bag most burglars carry on their back
export function lootBag(v, body) {
  const bag = v.part(body, v.sph, 0x7a5a2f, 0.17, 0.2, 0.15, 0.0, 0.42, -0.2); bag.userData.bag = true;
  v.part(body, v.box, 0x33d17a, 0.1, 0.12, 0.02, 0, 0.45, -0.34, false);
}
