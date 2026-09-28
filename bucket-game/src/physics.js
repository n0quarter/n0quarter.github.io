import * as THREE from "three";
import { clamp } from "./utils.js";

export const GRAVITY = 9.81;
export const BUCKET_RADIUS = 0.17;

const WIND_FORCE = 0.45;
const SUBSTEPS = 5;
const ROLLING_DRAG = 2.4;
const REST_SPEED = 0.25;
const MIN_EVENT_IMPACT = 0.8;

const SURFACES = {
  stone: { restitution: 0.42, friction: 0.18 },
  wood: { restitution: 0.5, friction: 0.12 },
  roof: { restitution: 0.35, friction: 0.2 },
  ground: { restitution: 0.32, friction: 0.35 },
};
const SURFACE_OF = { rim: "stone", post: "wood", bar: "wood", roof: "roof" };

const local = new THREE.Vector3();
const normal = new THREE.Vector3();
const closest = new THREE.Vector3();
const segment = new THREE.Vector3();
const normalPart = new THREE.Vector3();
const inBox = new THREE.Vector3();

export function createBody(position, velocity, spin) {
  return {
    position: position.clone(),
    velocity: velocity.clone(),
    spin: spin.clone(),
    age: 0,
    restTime: 0,
    grounded: false,
    touchedWell: false,
    hitRoof: false,
  };
}

export function stepBody(body, dt, well, wind, events) {
  const h = dt / SUBSTEPS;
  for (let i = 0; i < SUBSTEPS; i += 1) {
    body.velocity.y -= GRAVITY * h;
    if (!body.grounded) {
      body.velocity.x += wind.x * WIND_FORCE * h;
      body.velocity.z += wind.z * WIND_FORCE * h;
    }
    body.position.addScaledVector(body.velocity, h);
    collideWithWell(body, well, events);
    collideWithGround(body, well, h, events);
  }
  updateSpin(body, dt);
  body.age += dt;
  body.restTime = body.velocity.length() < REST_SPEED ? body.restTime + dt : 0;
}

export function isInsideWell(body, well) {
  const distance = Math.hypot(body.position.x - well.x, body.position.z - well.z);
  return distance < well.innerRadius && body.position.y < well.height * 0.5;
}

export function flightTime(start, velocity) {
  return (velocity.y + Math.sqrt(velocity.y ** 2 + 2 * GRAVITY * start.y)) / GRAVITY;
}

export function positionAt(start, velocity, time, out) {
  return out.set(
    start.x + velocity.x * time,
    start.y + velocity.y * time - 0.5 * GRAVITY * time * time,
    start.z + velocity.z * time,
  );
}

function updateSpin(body, dt) {
  if (body.grounded) {
    body.spin.set(body.velocity.z / BUCKET_RADIUS, 0, -body.velocity.x / BUCKET_RADIUS);
  } else {
    body.spin.multiplyScalar(Math.exp(-0.3 * dt));
  }
}

function collideWithGround(body, well, h, events) {
  const p = body.position;
  const overShaft = Math.hypot(p.x - well.x, p.z - well.z) < well.innerRadius;
  if (overShaft || p.y > BUCKET_RADIUS) {
    body.grounded = false;
    return;
  }
  p.y = BUCKET_RADIUS;
  const impact = -body.velocity.y;
  if (impact > MIN_EVENT_IMPACT) {
    const { restitution, friction } = SURFACES.ground;
    events.push({ kind: "ground", impact, position: p.clone() });
    body.velocity.y = impact * restitution;
    body.velocity.x *= 1 - friction;
    body.velocity.z *= 1 - friction;
    body.spin.x += (Math.random() - 0.5) * impact * 3;
    return;
  }
  body.velocity.y = Math.max(body.velocity.y, 0);
  body.grounded = true;
  const drag = Math.max(0, 1 - ROLLING_DRAG * h);
  body.velocity.x *= drag;
  body.velocity.z *= drag;
}

function collideWithWell(body, well, events) {
  local.set(body.position.x - well.x, body.position.y, body.position.z - well.z);
  collideWithWall(body, local, well, events);
  for (const capsule of well.capsules) collideWithCapsule(body, local, capsule, well, events);
  for (const box of well.boxes) collideWithBox(body, local, box, well, events);
  body.position.set(local.x + well.x, local.y, local.z + well.z);
}

// The stone wall is a ring: in the (radius, height) plane its cross-section is a rectangle.
function collideWithWall(body, p, well, events) {
  const { innerRadius: inner, outerRadius: outer, height } = well;
  const rho = Math.hypot(p.x, p.z);
  if (rho > outer + BUCKET_RADIUS || rho < inner - BUCKET_RADIUS || p.y > height + BUCKET_RADIUS) return;

  const dirX = rho > 1e-6 ? p.x / rho : 1;
  const dirZ = rho > 1e-6 ? p.z / rho : 0;
  let nr = rho - clamp(rho, inner, outer);
  let ny = p.y - Math.min(p.y, height);
  const distance = Math.hypot(nr, ny);
  let depth;

  if (distance > 1e-6) {
    if (distance >= BUCKET_RADIUS) return;
    nr /= distance;
    ny /= distance;
    depth = BUCKET_RADIUS - distance;
  } else {
    const toInner = rho - inner;
    const toOuter = outer - rho;
    const toTop = height - p.y;
    const nearest = Math.min(toInner, toOuter, toTop);
    [nr, ny] = nearest === toTop ? [0, 1] : nearest === toInner ? [-1, 0] : [1, 0];
    depth = nearest + BUCKET_RADIUS;
  }

  normal.set(dirX * nr, ny, dirZ * nr);
  respond(body, p, depth, "rim", well, events);
}

function collideWithCapsule(body, p, capsule, well, events) {
  segment.subVectors(capsule.b, capsule.a);
  const t = clamp(closest.subVectors(p, capsule.a).dot(segment) / segment.lengthSq(), 0, 1);
  closest.copy(capsule.a).addScaledVector(segment, t);
  normal.subVectors(p, closest);
  const distance = normal.length();
  const reach = BUCKET_RADIUS + capsule.radius;
  if (distance >= reach || distance < 1e-6) return;
  normal.divideScalar(distance);
  respond(body, p, reach - distance, capsule.kind, well, events);
}

// Boxes can be tilted around the x axis (the roof planks are).
function collideWithBox(body, p, box, well, events) {
  const cos = Math.cos(box.tilt);
  const sin = Math.sin(box.tilt);
  const dy = p.y - box.center.y;
  const dz = p.z - box.center.z;
  inBox.set(p.x - box.center.x, cos * dy + sin * dz, -sin * dy + cos * dz);
  closest.copy(inBox).clamp(segment.copy(box.half).negate(), box.half);
  normal.subVectors(inBox, closest);
  let distance = normal.length();
  let depth;

  if (distance < 1e-6) {
    normal.set(0, Math.sign(inBox.y) || 1, 0);
    depth = box.half.y - Math.abs(inBox.y) + BUCKET_RADIUS;
  } else {
    if (distance >= BUCKET_RADIUS) return;
    normal.divideScalar(distance);
    depth = BUCKET_RADIUS - distance;
  }

  const localY = normal.y;
  normal.set(normal.x, localY * cos - normal.z * sin, localY * sin + normal.z * cos);
  respond(body, p, depth, box.kind, well, events);
}

function respond(body, p, depth, kind, well, events) {
  p.addScaledVector(normal, depth);
  const approach = body.velocity.dot(normal);
  if (approach >= 0) return;

  const impact = -approach;
  const { restitution, friction } = SURFACES[SURFACE_OF[kind]];
  // Full friction on impacts, a little while sliding, so buckets slide off slopes instead of sticking.
  const grip = impact > MIN_EVENT_IMPACT ? friction : friction * 0.05;
  body.velocity.addScaledVector(normal, -(1 + restitution) * approach);
  normalPart.copy(normal).multiplyScalar(body.velocity.dot(normal));
  body.velocity.sub(normalPart).multiplyScalar(1 - grip).add(normalPart);

  body.touchedWell = true;
  if (kind === "roof") body.hitRoof = true;

  if (impact > MIN_EVENT_IMPACT) {
    events.push({ kind, impact, position: new THREE.Vector3(p.x + well.x, p.y, p.z + well.z) });
    body.spin.x += (Math.random() - 0.5) * impact * 3;
    body.spin.y += (Math.random() - 0.5) * impact * 2;
    body.spin.z += (Math.random() - 0.5) * impact * 3;
  }
}
