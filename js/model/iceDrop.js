// Ice Cube Drop skill model: a pile of clear ice cubes that falls in from the ceiling, lands on the floor (or on top of an item)
// and trembles for a moment before it snaps into the 3x3 freeze.
import * as THREE from 'three';

function iceMats(v) {
  if (!v._iceShell) {
    v._iceShell = new THREE.MeshToonMaterial({ color: 0xb9e4ff, transparent: true, opacity: 0.72, gradientMap: v.gradient });
    v._iceCore = new THREE.MeshToonMaterial({ color: 0xeaf8ff, transparent: true, opacity: 0.55, gradientMap: v.gradient });
  }
  return [v._iceShell, v._iceCore];
}

// opts.landY = height of whatever it lands on (0 = the floor); opts.icon = static pile for the build-menu icon
export function makeIceDrop(v, opts = {}) {
  const g = new THREE.Group(), pile = new THREE.Group(); g.add(pile);
  const [shell, core] = iceMats(v);
  // x, y, z, size, yaw: 4 on the bottom, 2 in the middle, 1 on top (like the photo)
  const cubes = [[-0.17, 0.15, -0.15, 0.3, 0.2], [0.17, 0.15, -0.14, 0.29, -0.3], [-0.16, 0.15, 0.17, 0.28, 0.35], [0.18, 0.15, 0.17, 0.3, -0.15],
    [-0.08, 0.43, -0.06, 0.28, 0.5], [0.1, 0.42, 0.08, 0.27, -0.4], [0.0, 0.68, 0.0, 0.26, 0.25]];
  for (const [x, y, z, s, yaw] of cubes) {
    const c = new THREE.Group(); c.position.set(x, y, z); c.rotation.set((Math.random() - 0.5) * 0.12, yaw, (Math.random() - 0.5) * 0.12);
    const a = new THREE.Mesh(v.box, shell); a.scale.setScalar(s); a.castShadow = false; c.add(a);              // clear outer cube
    const b = new THREE.Mesh(v.box, core); b.scale.setScalar(s * 0.6); b.rotation.set(0.4, 0.5, 0.2); b.castShadow = false; c.add(b);   // cloudy core
    const h = new THREE.Mesh(v.box, v.basic(0xffffff)); h.scale.set(s * 0.34, 0.012, s * 0.07); h.position.set(-s * 0.18, s * 0.505, s * 0.3); h.castShadow = false; c.add(h);   // glint
    pile.add(c);
  }
  // 3x3 landing zone on the floor, only while it is still on its way
  const markMat = new THREE.MeshBasicMaterial({ color: 0x8fd3f4, transparent: true, opacity: 0.8 });
  const marker = new THREE.Group();
  if (!opts.icon) {
    for (const [sx, sz, x, z] of [[3, 0.07, 0, -1.5], [3, 0.07, 0, 1.5], [0.07, 3, -1.5, 0], [0.07, 3, 1.5, 0]]) {
      const m = new THREE.Mesh(v.box, markMat); m.scale.set(sx, 0.02, sz); m.position.set(x, 0.07, z); m.castShadow = false; marker.add(m);
    }
    g.add(marker);
  }
  g.userData = { pile, marker, markMat, landY: opts.landY || 0 };
  return g;
}

// s.t counts down from def.fuse; the last def.snap seconds the pile sits on the target
export function animIceDrop(g, s, time, v, def) {
  const u = g.userData, total = def.fuse, fall = total - def.snap, el = total - s.t, land = u.landY || 0;
  if (el < fall) {
    const k = Math.max(0, el / fall);                        // falling in from the ceiling, faster and faster
    u.pile.position.y = land + (1 - k * k) * 6.5;
    u.pile.rotation.set(Math.sin(time * 7) * 0.3 * (1 - k), time * 7 * (1 - k), Math.cos(time * 5) * 0.3 * (1 - k));
    u.pile.scale.set(1, 1, 1);
  } else {
    const j = Math.min(1, (el - fall) / def.snap);            // landed: squash, then tremble and swell before the snap
    const sq = j < 0.3 ? Math.sin(j / 0.3 * Math.PI) : 0;
    u.pile.rotation.set(0, 0, 0);
    u.pile.position.set((Math.random() - 0.5) * 0.04 * j, land, (Math.random() - 0.5) * 0.04 * j);
    u.pile.scale.set(1 + 0.18 * sq + 0.1 * j, 1 - 0.28 * sq + 0.08 * j, 1 + 0.18 * sq + 0.1 * j);
  }
  u.markMat.opacity = 0.4 + 0.4 * Math.sin(time * 16);
  u.marker.visible = s.t > 0;
}