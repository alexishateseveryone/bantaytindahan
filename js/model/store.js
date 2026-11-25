// The store itself: floor, walls, doors, checkout counter, clerk and the fixed props.
import * as THREE from 'three';
import { COLS, ROWS } from '../game.js';

const OX = (COLS - 1) / 2, OZ = (ROWS - 1) / 2;
const wx = x => x - OX, wz = y => y - OZ;

// loose props / fixed obstacles (v = variant 0..5)
export function makeProp(v, g, k) {
  const P = (...a) => v.part(g, ...a);
  if (k === 0) { P(v.box, 0xe8f4ff, 0.9, 0.9, 0.9, 0, 0.45, 0); P(v.box, 0x7fc6ee, 0.74, 0.05, 0.74, 0, 0.93, 0, false); P(v.box, 0x44546a, 0.5, 0.08, 0.03, 0, 0.55, 0.46, false); }
  else if (k === 1) { P(v.box, 0xc4894d, 0.86, 0.5, 0.86, 0, 0.25, 0); P(v.box, 0xd69c5f, 0.66, 0.45, 0.66, 0.02, 0.72, 0); P(v.box, 0xa8703a, 0.3, 0.04, 0.68, 0.02, 0.96, 0, false); }
  else if (k === 2) { P(v.cyl, 0xb7b3c8, 0.44, 1.1, 0.44, 0, 0.55, 0); P(v.cyl, 0x8a86a0, 0.52, 0.08, 0.52, 0, 1.12, 0, false); P(v.box, 0xffcf4a, 0.5, 0.1, 0.02, 0, 0.3, 0.44, false); }
  else if (k === 3) { P(v.cyl, 0xb5651d, 0.26, 0.3, 0.26, 0, 0.15, 0); P(v.sph, 0x2e9e4f, 0.34, 0.34, 0.34, 0, 0.55, 0); P(v.sph, 0x45c46a, 0.22, 0.22, 0.22, 0.12, 0.8, 0.05); P(v.cone, 0x2e9e4f, 0.12, 0.3, 0.12, -0.13, 0.78, -0.04); }
  else if (k === 4) { P(v.box, 0xc4894d, 0.5, 0.4, 0.5, -0.15, 0.2, -0.12); P(v.box, 0xd69c5f, 0.42, 0.34, 0.42, 0.2, 0.17, 0.15); P(v.box, 0xe0b27a, 0.34, 0.3, 0.34, -0.12, 0.55, -0.1); }
  else { P(v.cyl, 0x4aa3df, 0.34, 0.5, 0.34, 0, 0.25, 0); P(v.cyl, 0xffffff, 0.3, 0.06, 0.3, 0, 0.52, 0, false); P(v.cyl, 0x8fd3ff, 0.14, 0.34, 0.14, 0, 0.72, 0); }
}

// builds the whole static room for a game; returns { group, clerk }
export function buildStore(v, game) {
  const S = new THREE.Group();

  // checkered floor texture
  const cv = document.createElement('canvas'); const T = 16;
  cv.width = COLS * T; cv.height = ROWS * T; const cx = cv.getContext('2d');
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    cx.fillStyle = (x + y) % 2 ? '#e7dfc6' : '#d3caaa';
    if (x === COLS - 1) cx.fillStyle = (x + y) % 2 ? '#c9bf9d' : '#bfb48f';
    if (x === 0) cx.fillStyle = (x + y) % 2 ? '#b8c4cc' : '#a9b6c0';
    cx.fillRect(x * T, y * T, T, T);
    cx.fillStyle = 'rgba(0,0,0,0.07)'; cx.fillRect(x * T, y * T, T, 1); cx.fillRect(x * T, y * T, 1, T);
  }
  for (let i = 0; i < ROWS * T; i += 8) { cx.fillStyle = (i / 8) % 2 ? '#f2c94c' : '#33302e'; cx.fillRect((COLS - 1) * T, i, 3, 8); }
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  const floor = new THREE.Mesh(v.plane, new THREE.MeshToonMaterial({ map: tex, gradientMap: v.gradient }));
  floor.rotation.x = -Math.PI / 2; floor.scale.set(COLS, ROWS, 1); floor.receiveShadow = true; S.add(floor);
  v.part(S, v.box, 0x241f45, COLS + 10, 0.2, ROWS + 8, 0, -0.12, 0, false);

  // walls: left (doors), back (posters), right (register)
  const wall = (sx, sz, x, z, h = 1.1) => v.part(S, v.box, 0x4b3f8f, sx, h, sz, x, h / 2, z);
  wall(0.5, ROWS + 1, -OX - 0.75, 0); wall(0.5, ROWS + 1, OX + 0.75 + 1.2, 0, 0.7);
  wall(COLS + 2.9, 0.5, 0.6, -OZ - 0.75, 1.6);
  [[-8, 0xff5a5f], [-4.5, 0xffcf4a], [-1, 0x5fe3a1], [3, 0x6fa8ff], [7, 0xff9f1c]].forEach(([x, c]) => v.part(S, v.box, c, 1.0, 0.6, 0.05, x, 1.0, -OZ - 0.47, false));

  // doors
  for (const s of game.spawns) {
    v.part(S, v.box, 0x6e5f4a, 0.9, 0.03, 0.9, wx(s.x), 0.02, wz(s.y), false);
    const dx = -OX - 0.75, dz = wz(s.y);
    v.part(S, v.box, 0x9ad7ff, 0.55, 1.3, 1.3, dx, 0.65, dz);
    v.part(S, v.box, 0x6fb7e8, 0.58, 1.0, 0.9, dx, 0.6, dz, false);
    if (s.from > 1) v.part(S, v.box, 0xff9f1c, 0.35, 0.18, 0.35, dx, 1.45, dz);
  }

  // checkout counter + register along the right side
  const cxp = wx(COLS - 1) + 0.95;
  v.part(S, v.box, 0x7a4b2b, 0.9, 0.9, ROWS, cxp, 0.45, 0);
  v.part(S, v.box, 0xe9d8a6, 0.95, 0.08, ROWS, cxp, 0.92, 0, false);
  v.part(S, v.box, 0xdedede, 0.6, 0.35, 0.9, cxp, 1.12, 0);
  v.part(S, v.box, 0x2d2d3a, 0.08, 0.28, 0.8, cxp - 0.1, 1.45, 0, false).rotation.z = 0.4;
  v.part(S, v.box, 0x3ddc84, 0.05, 0.1, 0.5, cxp - 0.15, 1.46, 0, false).rotation.z = 0.4;
  for (let i = 0; i < 4; i++) v.part(S, v.box, [0xff5a5f, 0xffcf4a, 0x5fe3a1, 0x6fa8ff][i], 0.22, 0.14, 0.28, cxp, 1.06, -3.2 + i * 0.4 - 2);
  const clerk = new THREE.Group(); clerk.position.set(cxp + 0.05, 0.9, 1.6); clerk.rotation.y = -Math.PI / 2; S.add(clerk);
  v.part(clerk, v.box, 0x3a7bd5, 0.34, 0.4, 0.22, 0, 0.35, 0);
  v.part(clerk, v.box, 0xf1c9a0, 0.24, 0.22, 0.22, 0, 0.68, 0);
  v.part(clerk, v.box, 0xd9534f, 0.28, 0.07, 0.26, 0, 0.82, 0.01);

  // fixed walls and props from the generator
  for (const o of game.obstacles) {
    const g = new THREE.Group(); g.position.set(wx(o.x), 0, wz(o.y)); S.add(g);
    makeProp(v, g, o.v);
  }
  return { group: S, clerk };
}
