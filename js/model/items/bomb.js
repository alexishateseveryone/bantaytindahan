// Burglar bomb: a black ball with a lit fuse. Thrown in an arc, then sits on the floor with a
// warning ring before it blows.
import * as THREE from 'three';

export function makeBomb(v, s = 1) {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(v.sph, v.toon(0x1b1b24)); ball.scale.setScalar(0.17 * s); ball.castShadow = true; g.add(ball);
  const shine = new THREE.Mesh(v.sph, v.basic(0x6a6a82)); shine.scale.setScalar(0.04 * s); shine.position.set(-0.06 * s, 0.07 * s, 0.08 * s); g.add(shine);
  const cap = new THREE.Mesh(v.cyl, v.toon(0x8a8a9a)); cap.scale.set(0.05 * s, 0.05 * s, 0.05 * s); cap.position.y = 0.17 * s; g.add(cap);
  const fuse = new THREE.Mesh(v.cyl, v.toon(0xc4894d)); fuse.scale.set(0.015 * s, 0.1 * s, 0.015 * s); fuse.position.set(0.02 * s, 0.24 * s, 0); fuse.rotation.z = -0.4; g.add(fuse);
  const spark = new THREE.Mesh(v.box, v.basic(0xffd23f)); spark.scale.setScalar(0.07 * s); spark.position.set(0.06 * s, 0.3 * s, 0); g.add(spark);
  g.userData.spark = spark; g.userData.ball = ball;
  return g;
}

export function makeBombProjectile(v, p) { return makeBomb(v, 1); }

// sitting on the floor: bomb + danger ring showing the blast radius
export function makeGroundBomb(v, b) {
  const g = new THREE.Group();
  const bomb = makeBomb(v, 1.1); bomb.position.y = 0.19; g.add(bomb); g.userData.bomb = bomb;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 32), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07; ring.scale.setScalar(b.r); g.add(ring);
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
  fill.rotation.x = -Math.PI / 2; fill.position.y = 0.065; fill.scale.setScalar(b.r); g.add(fill);
  g.userData.ring = ring; g.userData.fill = fill;
  return g;
}

export function animGroundBomb(g, b, time) {
  const rate = 4 + (1 - b.t / b.max) * 16;      // blinks faster as the fuse burns down
  const on = Math.floor(time * rate) % 2 === 0;
  g.userData.ring.material.opacity = on ? 0.95 : 0.35;
  g.userData.fill.material.opacity = on ? 0.3 : 0.1;
  g.userData.bomb.userData.spark.visible = on;
  g.userData.bomb.scale.setScalar(1 + (on ? 0.08 : 0));
}
