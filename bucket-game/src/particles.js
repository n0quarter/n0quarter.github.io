import * as THREE from "three";
import { rand, TAU } from "./utils.js";

const UP = new THREE.Vector3(0, 1, 0);

const vertexShader = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 tint;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    vAlpha = alpha;
    vTint = tint;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uScale / max(-mvPosition.z, 0.1);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    float alpha = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)) * vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vTint, alpha);
    #include <colorspace_fragment>
  }
`;

function createPointCloud(capacity, blending) {
  const geometry = new THREE.BufferGeometry();
  const attribute = (name, itemSize) => {
    const buffer = new THREE.BufferAttribute(new Float32Array(capacity * itemSize), itemSize);
    buffer.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, buffer);
    return buffer;
  };
  const position = attribute("position", 3);
  const tint = attribute("tint", 3);
  const size = attribute("size", 1);
  const alpha = attribute("alpha", 1);

  const material = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 500 } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    position,
    tint,
    size,
    alpha,
    flush() {
      position.needsUpdate = tint.needsUpdate = size.needsUpdate = alpha.needsUpdate = true;
    },
    setScale(renderer, camera) {
      const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
      material.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(halfFov));
    },
  };
}

export function createParticles(capacity = 1400) {
  const cloud = createPointCloud(capacity, THREE.NormalBlending);
  const pool = Array.from({ length: capacity }, () => ({
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    color: new THREE.Color(),
    life: 0,
    maxLife: 1,
    size: 0,
    grow: 0,
    gravity: 0,
    drag: 0,
    opacity: 1,
  }));
  const direction = new THREE.Vector3();
  const jitter = new THREE.Vector3();
  let cursor = 0;

  function emit({
    origin,
    count,
    color,
    radius = 0,
    direction: aim = UP,
    spread = 0.3,
    speed = [1, 2],
    size = [0.1, 0.2],
    life = [0.6, 1],
    gravity = 9.81,
    drag = 0,
    grow = 0,
    opacity = 1,
  }) {
    for (let i = 0; i < count; i += 1) {
      const particle = pool[cursor];
      cursor = (cursor + 1) % capacity;
      const angle = Math.random() * TAU;
      particle.position.copy(origin).add(jitter.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
      direction.copy(aim).normalize().addScaledVector(jitter.randomDirection(), spread).normalize();
      particle.velocity.copy(direction).multiplyScalar(rand(...speed));
      particle.color.set(color).offsetHSL(0, 0, rand(-0.06, 0.06));
      particle.life = particle.maxLife = rand(...life);
      particle.size = rand(...size);
      Object.assign(particle, { grow, gravity, drag, opacity });
    }
  }

  function update(dt) {
    pool.forEach((particle, i) => {
      if (particle.life > 0) {
        particle.life -= dt;
        particle.velocity.y -= particle.gravity * dt;
        particle.velocity.multiplyScalar(Math.exp(-particle.drag * dt));
        particle.position.addScaledVector(particle.velocity, dt);
        particle.size += particle.grow * dt;
        if (particle.gravity > 0 && particle.position.y < 0) particle.life = 0;
      }
      const { position, color } = particle;
      cloud.position.setXYZ(i, position.x, position.y, position.z);
      cloud.tint.setXYZ(i, color.r, color.g, color.b);
      cloud.size.setX(i, particle.size);
      cloud.alpha.setX(i, particle.life > 0 ? particle.opacity * Math.min(1, (particle.life / particle.maxLife) * 2.5) : 0);
    });
    cloud.flush();
  }

  return { points: cloud.points, emit, update, setScale: cloud.setScale };
}

// Floating pollen that drifts with the wind, so the wind is visible in the world.
export function createMotes(count = 170) {
  const cloud = createPointCloud(count, THREE.AdditiveBlending);
  const bounds = { x: 22, minY: 0.3, maxY: 6, minZ: -40, maxZ: 4 };
  const color = new THREE.Color("#ffe3a0");
  const motes = Array.from({ length: count }, (_, i) => {
    cloud.tint.setXYZ(i, color.r, color.g, color.b);
    cloud.size.setX(i, rand(0.04, 0.09));
    return {
      position: new THREE.Vector3(rand(-bounds.x, bounds.x), rand(bounds.minY, bounds.maxY), rand(bounds.minZ, bounds.maxZ)),
      phase: rand(0, TAU),
    };
  });
  const wrap = (value, min, max) => (value < min ? max : value > max ? min : value);
  let time = 0;

  function update(dt, wind) {
    time += dt;
    motes.forEach(({ position, phase }, i) => {
      position.x += (wind.x * 0.35 + Math.sin(time * 0.6 + phase) * 0.25) * dt;
      position.y += Math.sin(time * 0.8 + phase * 2) * 0.12 * dt;
      position.z += (wind.z * 0.35 + Math.cos(time * 0.5 + phase) * 0.25) * dt;
      position.x = wrap(position.x, -bounds.x, bounds.x);
      position.z = wrap(position.z, bounds.minZ, bounds.maxZ);
      cloud.position.setXYZ(i, position.x, position.y, position.z);
      cloud.alpha.setX(i, 0.35 + 0.35 * Math.sin(time * 2 + phase));
    });
    cloud.flush();
  }

  return { points: cloud.points, update, setScale: cloud.setScale };
}
