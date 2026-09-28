import * as THREE from "three";
import { easeOutCubic, lerp, rand, TAU } from "./utils.js";

const MAX_LITTER = 8;
const REST_Y = 0.17;
const SETTLE_TIME = 0.45;

// Missed buckets stay in the world for a while, lying on their side.
export function createLitter(scene, particles) {
  let items = [];

  function add(bucket) {
    const onGround = bucket.position.y < 0.45;
    const settle = onGround
      ? {
          from: bucket.quaternion.clone(),
          to: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand(0, TAU), Math.PI / 2)),
          fromY: bucket.position.y,
          t: 0,
        }
      : null;
    items.push({ mesh: bucket, settle });
    if (items.length > MAX_LITTER) scene.remove(items.shift().mesh);
  }

  function update(dt) {
    for (const { mesh, settle } of items) {
      if (!settle || settle.t >= 1) continue;
      settle.t = Math.min(settle.t + dt / SETTLE_TIME, 1);
      const eased = easeOutCubic(settle.t);
      mesh.quaternion.slerpQuaternions(settle.from, settle.to, eased);
      mesh.position.y = lerp(settle.fromY, REST_Y, eased);
    }
  }

  // Removes buckets matching the predicate (it receives the bucket mesh) with a puff of dust.
  function remove(predicate) {
    items = items.filter(({ mesh }) => {
      if (!predicate(mesh)) return true;
      particles.emit({ origin: mesh.position, count: 12, color: "#e8dcc6", spread: 1, speed: [0.5, 1.5], size: [0.2, 0.4], grow: 0.4, gravity: 0, drag: 3, opacity: 0.5 });
      scene.remove(mesh);
      return false;
    });
  }

  return { add, update, remove };
}
