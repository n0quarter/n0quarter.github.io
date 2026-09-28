import * as THREE from "three";
import { clamp, rand } from "./utils.js";

export const CAMERA_HOME = new THREE.Vector3(0, 1.85, 3.4);

const DAMPING = 3.2;
const FOV_LIMITS = { min: 38, max: 80 };
const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;

export function createCameraRig(camera) {
  const position = CAMERA_HOME.clone();
  const target = new THREE.Vector3(0, 1, -10);
  const desired = { position: CAMERA_HOME.clone(), target: target.clone(), fov: 50 };
  const toWell = new THREE.Vector3();
  const toHand = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const jolt = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const home = CAMERA_HOME.clone();
  let fov = 50;
  let shake = 0;
  let kick = 0;

  // Keeps both the bucket in hand and the well comfortably in view.
  function frame(wellPoint, handPoint) {
    toWell.subVectors(wellPoint, home).normalize();
    toHand.subVectors(handPoint, home).normalize();
    direction.addVectors(toWell, toHand).normalize();
    desired.position.copy(home);
    desired.target.copy(home).addScaledVector(direction, 10);

    const vertical = toWell.angleTo(toHand) + 0.38;
    const horizontalHalf = Math.abs(Math.atan2(toWell.x, -toWell.z) - Math.atan2(direction.x, -direction.z)) + 0.22;
    const fromHorizontal = 2 * Math.atan(Math.tan(horizontalHalf) / camera.aspect);
    desired.fov = clamp(THREE.MathUtils.radToDeg(Math.max(vertical, fromHorizontal)), FOV_LIMITS.min, FOV_LIMITS.max);
  }

  function follow(point, wellPoint, handPoint, zoom = 1) {
    frame(wellPoint, handPoint);
    focus.copy(point).setY(Math.max(point.y, 0.9));
    desired.target.lerp(focus, 0.45);
    desired.position.set(home.x + (point.x - home.x) * 0.25, home.y + 0.35, home.z + Math.min(0, point.z - home.z) * 0.3);
    desired.fov *= zoom;
  }

  function snap() {
    position.copy(desired.position);
    target.copy(desired.target);
    fov = desired.fov;
  }

  function update(dt) {
    const k = 1 - Math.exp(-dt * DAMPING);
    position.lerp(desired.position, k);
    target.lerp(desired.target, k);
    fov += (desired.fov - fov) * k;
    shake *= Math.exp(-dt * 8);
    kick *= Math.exp(-dt * 5);

    camera.position.copy(position);
    if (shake > 0.001) camera.position.add(jolt.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(shake));
    camera.lookAt(target);
    camera.fov = fov + kick;
    camera.updateProjectionMatrix();
  }

  return {
    setPlayerX(x) {
      home.x = x;
    },
    frame,
    follow,
    snap,
    update,
    addShake(amount) {
      if (!REDUCED_MOTION) shake = Math.min(shake + amount, 0.25);
    },
    // A brief field-of-view punch, in degrees: positive widens, negative zooms in.
    kick(degrees) {
      if (!REDUCED_MOTION) kick += degrees;
    },
  };
}
