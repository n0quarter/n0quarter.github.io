import * as THREE from "three";
import { canvasTexture, easeOutBack, rand, TAU } from "./utils.js";

export const WELL = { innerRadius: 0.8, outerRadius: 1.12, height: 0.85 };

const POST_X = WELL.outerRadius + 0.12;
const POST_HEIGHT = 2.6;
const BAR_Y = 2.15;
const RIDGE_Y = 2.95;
const ROOF_SLOPE = 0.62;
const ROOF_DEPTH = 1.0;
const ROOF_WIDTH = POST_X * 2 + 0.7;
const SINK_DEPTH = 3.6;
const SINK_TIME = 0.45;
const RISE_TIME = 0.8;
const SWAY_SPEED = 0.7;

const STONE_TONES = ["#8f8a80", "#7d766b", "#9b958a", "#857c70", "#6f695f"];
const MOSS = "#5f6e3c";

export function createWell() {
  const group = new THREE.Group();
  group.add(createStones(), createShaft(), createFrame(), createRoof(), createDirtPatch());
  group.traverse((child) => {
    if (child.isMesh && !child.userData.flat) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const collider = { x: 0, z: 0, ...WELL, capsules: createCapsules(), boxes: createRoofPlanks() };
  const motion = { baseX: 0, swayAmplitude: 0, time: 0 };
  let relocation = null;

  function setX(x) {
    collider.x = x;
    group.position.x = x;
  }

  function placeAt(x, z) {
    motion.baseX = x;
    motion.time = 0;
    collider.z = z;
    group.position.z = z;
    setX(x);
  }

  function relocate(x, z, onSurface) {
    return new Promise((resolve) => {
      relocation = { x, z, time: 0, moved: false, onSurface, resolve };
    });
  }

  function update(dt) {
    motion.time += dt;
    if (relocation) {
      updateRelocation(dt);
      return;
    }
    setX(motion.baseX + Math.sin(motion.time * SWAY_SPEED) * motion.swayAmplitude);
  }

  function updateRelocation(dt) {
    relocation.time += dt;
    if (relocation.time < SINK_TIME) {
      const t = relocation.time / SINK_TIME;
      group.position.y = -SINK_DEPTH * t * t * t;
      group.rotation.y = t * 0.4;
      return;
    }
    if (!relocation.moved) {
      relocation.moved = true;
      placeAt(relocation.x, relocation.z);
      relocation.onSurface?.();
    }
    const t = Math.min((relocation.time - SINK_TIME) / RISE_TIME, 1);
    group.position.y = -SINK_DEPTH * (1 - easeOutBack(t));
    group.rotation.y = (1 - t) * -0.4;
    if (t >= 1) {
      group.position.y = 0;
      group.rotation.y = 0;
      const { resolve } = relocation;
      relocation = null;
      resolve();
    }
  }

  return {
    group,
    collider,
    placeAt,
    relocate,
    update,
    setSway(amplitude) {
      motion.swayAmplitude = amplitude;
    },
  };
}

function createCapsules() {
  const posts = [-1, 1].map((side) => ({
    kind: "post",
    a: new THREE.Vector3(side * POST_X, 0, 0),
    b: new THREE.Vector3(side * POST_X, POST_HEIGHT, 0),
    radius: 0.08,
  }));
  const bar = { kind: "bar", a: new THREE.Vector3(-POST_X, BAR_Y, 0), b: new THREE.Vector3(POST_X, BAR_Y, 0), radius: 0.11 };
  return [...posts, bar];
}

function roofPlankCenter(side) {
  return new THREE.Vector3(0, RIDGE_Y - (Math.sin(ROOF_SLOPE) * ROOF_DEPTH) / 2, (side * Math.cos(ROOF_SLOPE) * ROOF_DEPTH) / 2);
}

function createRoofPlanks() {
  return [-1, 1].map((side) => ({
    kind: "roof",
    center: roofPlankCenter(side),
    half: new THREE.Vector3(ROOF_WIDTH / 2, 0.05, ROOF_DEPTH / 2),
    tilt: side * ROOF_SLOPE,
  }));
}

function createStones() {
  const { innerRadius, outerRadius, height } = WELL;
  const middle = (innerRadius + outerRadius) / 2;
  const depth = (outerRadius - innerRadius) / 2;
  const courses = 4;
  const perCourse = 16;
  const capstones = 14;

  const material = new THREE.MeshStandardMaterial({ roughness: 0.92, flatShading: true });
  const mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), material, courses * perCourse + capstones);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let index = 0;

  function place(angle, y, scale, tone) {
    dummy.position.set(Math.cos(angle) * middle, y, Math.sin(angle) * middle);
    dummy.rotation.set(rand(-0.08, 0.08), -angle - Math.PI / 2, rand(-0.08, 0.08));
    dummy.scale.set(...scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, color.set(tone).offsetHSL(0, 0, rand(-0.05, 0.05)));
    index += 1;
  }

  for (let course = 0; course < courses; course += 1) {
    for (let i = 0; i < perCourse; i += 1) {
      const angle = ((i + (course % 2) * 0.5) / perCourse) * TAU + rand(-0.03, 0.03);
      const tone = course === 0 && Math.random() < 0.45 ? MOSS : STONE_TONES[Math.floor(Math.random() * STONE_TONES.length)];
      place(angle, 0.1 + course * 0.19, [rand(0.18, 0.21), rand(0.1, 0.12), depth * rand(0.95, 1.1)], tone);
    }
  }
  for (let i = 0; i < capstones; i += 1) {
    place((i / capstones) * TAU, height - 0.05, [0.24, 0.07, depth * 1.25], "#b1ab9f");
  }
  return mesh;
}

function createShaft() {
  const { innerRadius, outerRadius, height } = WELL;
  const group = new THREE.Group();
  const mortar = new THREE.MeshStandardMaterial({ color: "#564e45", roughness: 1 });

  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(innerRadius + 0.02, innerRadius + 0.02, height, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: "#3a332c", roughness: 1, side: THREE.BackSide }),
  );
  inner.position.y = height / 2;

  const outer = new THREE.Mesh(new THREE.CylinderGeometry(outerRadius - 0.05, outerRadius - 0.03, height - 0.05, 32, 1, true), mortar);
  outer.position.y = (height - 0.05) / 2;

  const top = new THREE.Mesh(new THREE.RingGeometry(innerRadius, outerRadius - 0.02, 40), mortar);
  top.rotation.x = -Math.PI / 2;
  top.position.y = height - 0.06;

  const holeTexture = canvasTexture(128, 128, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, "#000000");
    gradient.addColorStop(0.7, "#080605");
    gradient.addColorStop(1, "#261f19");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
  const hole = new THREE.Mesh(new THREE.CircleGeometry(innerRadius + 0.02, 40), new THREE.MeshBasicMaterial({ map: holeTexture }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.02;
  hole.userData.flat = true;

  group.add(inner, outer, top, hole);
  return group;
}

function createFrame() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: "#7b5433", roughness: 0.85 });
  const rope = new THREE.MeshStandardMaterial({ color: "#c9a56b", roughness: 1 });

  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.13, POST_HEIGHT, 0.13), wood);
    post.position.set(side * POST_X, POST_HEIGHT / 2, 0);
    group.add(post);
  }

  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, POST_X * 2 + 0.3, 12), wood);
  axle.rotation.z = Math.PI / 2;
  axle.position.y = BAR_Y;

  const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.55, 18), rope);
  coil.rotation.z = Math.PI / 2;
  coil.position.y = BAR_Y;

  const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.05), wood);
  crankArm.position.set(POST_X + 0.17, BAR_Y - 0.14, 0);
  const crankHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8), wood);
  crankHandle.rotation.z = Math.PI / 2;
  crankHandle.position.set(POST_X + 0.27, BAR_Y - 0.28, 0);

  group.add(axle, coil, crankArm, crankHandle);
  return group;
}

function createRoof() {
  const group = new THREE.Group();
  const shingles = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#6e2f1d";
    ctx.fillRect(0, 0, w, h);
    const rows = 8;
    const rowHeight = h / rows;
    for (let row = 0; row < rows; row += 1) {
      const offset = row % 2 ? 16 : 0;
      for (let x = -offset; x < w; x += 32) {
        ctx.fillStyle = `hsl(${rand(8, 18)}, ${rand(45, 60)}%, ${rand(30, 40)}%)`;
        ctx.fillRect(x + 1, row * rowHeight + 1, 30, rowHeight - 2);
        ctx.fillStyle = "rgba(30, 10, 5, 0.45)";
        ctx.fillRect(x + 1, row * rowHeight + rowHeight - 5, 30, 4);
      }
    }
  });
  shingles.wrapS = shingles.wrapT = THREE.RepeatWrapping;
  shingles.repeat.set(3, 1);
  const material = new THREE.MeshStandardMaterial({ map: shingles, roughness: 0.85 });

  for (const side of [-1, 1]) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(ROOF_WIDTH, 0.06, ROOF_DEPTH), material);
    plank.rotation.x = side * ROOF_SLOPE;
    plank.position.copy(roofPlankCenter(side));
    group.add(plank);
  }
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(ROOF_WIDTH + 0.08, 0.1, 0.1), new THREE.MeshStandardMaterial({ color: "#5a3b22", roughness: 0.9 }));
  ridge.position.y = RIDGE_Y + 0.02;
  ridge.rotation.x = Math.PI / 4;
  group.add(ridge);
  return group;
}

function createDirtPatch() {
  const texture = canvasTexture(256, 256, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, "rgba(118, 88, 56, 1)");
    gradient.addColorStop(0.5, "rgba(122, 94, 60, 0.85)");
    gradient.addColorStop(1, "rgba(110, 90, 55, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i += 1) {
      const angle = Math.random() * TAU;
      const distance = Math.sqrt(Math.random()) * w * 0.4;
      ctx.fillStyle = `rgba(${rand(60, 160)}, ${rand(50, 130)}, ${rand(40, 100)}, ${rand(0.3, 0.7)})`;
      ctx.beginPath();
      ctx.arc(w / 2 + Math.cos(angle) * distance, h / 2 + Math.sin(angle) * distance, rand(1, 3), 0, TAU);
      ctx.fill();
    }
  });
  const patch = new THREE.Mesh(
    new THREE.CircleGeometry(WELL.outerRadius + 1.1, 40),
    new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  patch.rotation.x = -Math.PI / 2;
  patch.position.y = 0.012;
  patch.receiveShadow = true;
  patch.userData.flat = true;
  return patch;
}
