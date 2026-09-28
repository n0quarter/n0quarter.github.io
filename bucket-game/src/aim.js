import * as THREE from "three";
import { clamp } from "./utils.js";
import { flightTime, positionAt } from "./physics.js";

const FULL_POWER_DRAG = 0.5; // fraction of the screen height
const MIN_DRAG = 0.035;
const MAX_YAW = 0.6;
const LAUNCH_PITCH = THREE.MathUtils.degToRad(50);
const SPEED = { min: 5, max: 16 };
const PREVIEW_DOTS = 44;

export function throwVelocity({ power, yaw }) {
  const speed = SPEED.min + (SPEED.max - SPEED.min) * power;
  const horizontal = Math.cos(LAUNCH_PITCH) * speed;
  return new THREE.Vector3(Math.sin(yaw) * horizontal, Math.sin(LAUNCH_PITCH) * speed, -Math.cos(yaw) * horizontal);
}

// Drag upward anywhere: drag length sets the power, drag angle sets the direction.
export function createAimControl(element, { onChange, onRelease }) {
  let enabled = false;
  let pointerId = null;
  let start = null;

  function read(event) {
    const dx = (event.clientX - start.x) / window.innerHeight;
    const dy = (start.y - event.clientY) / window.innerHeight;
    if (dy < MIN_DRAG) return { valid: false, power: 0, yaw: 0 };
    return {
      valid: true,
      power: clamp(Math.hypot(dx, dy) / FULL_POWER_DRAG, 0, 1),
      yaw: clamp(Math.atan2(dx, dy) * 0.6, -MAX_YAW, MAX_YAW),
    };
  }

  element.addEventListener("pointerdown", (event) => {
    if (!enabled || pointerId !== null) return;
    pointerId = event.pointerId;
    start = { x: event.clientX, y: event.clientY };
    element.setPointerCapture(pointerId);
    onChange(read(event));
  });
  element.addEventListener("pointermove", (event) => {
    if (event.pointerId === pointerId) onChange(read(event));
  });
  element.addEventListener("pointerup", (event) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    onRelease(read(event));
  });
  element.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    onChange(null);
  });

  return {
    setEnabled(value) {
      enabled = value;
      if (!value) pointerId = null;
    },
  };
}

export function createTrajectoryPreview() {
  const mesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.03, 10, 8),
    new THREE.MeshBasicMaterial({ color: "#fff3cf", transparent: true, opacity: 0.85, depthWrite: false }),
    PREVIEW_DOTS,
  );
  mesh.frustumCulled = false;
  mesh.visible = false;
  const dummy = new THREE.Object3D();

  function show(start, velocity, portion, time) {
    const duration = flightTime(start, velocity) * portion;
    const flow = (time * 1.5) % 1;
    for (let i = 0; i < PREVIEW_DOTS; i += 1) {
      const progress = (i + flow) / PREVIEW_DOTS;
      positionAt(start, velocity, progress * duration, dummy.position);
      dummy.scale.setScalar(1 - progress * 0.6);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = true;
  }

  return {
    mesh,
    show,
    hide() {
      mesh.visible = false;
    },
  };
}
