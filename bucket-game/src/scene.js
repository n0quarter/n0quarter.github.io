import * as THREE from "three";
import { canvasTexture, fbm, rand, smoothstep, TAU, valueNoise } from "./utils.js";

export const SUN_DIRECTION = new THREE.Vector3(-0.8, 0.35, -0.48).normalize();

const PLAY_CENTER = new THREE.Vector3(0, 0, -11);
const PALETTE = {
  skyTop: "#3a6fc0",
  skyMiddle: "#bdd8f2",
  horizon: "#ffcf98",
  skyBottom: "#c8b38c",
  sun: "#ffb368",
  fog: "#f3cf9f",
};

// Keeps props out of the lane where the well can appear.
const isInPlayLane = (x, z) => Math.abs(x) < 9 && z > -28 && z < 4;

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.fog, 60, 620);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);

  const sky = createSky();
  scene.add(sky);
  scene.environment = createEnvironment(renderer, sky);
  scene.environmentIntensity = 0.55;

  addLights(scene);
  scene.add(createGround(), createMountains(), createTrees(), createRocks(), createFlowers());
  const clouds = createClouds();
  scene.add(clouds.group);

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  return {
    renderer,
    scene,
    camera,
    update(dt) {
      sky.position.copy(camera.position);
      clouds.update(dt);
    },
  };
}

export function groundHeight(x, z) {
  const fromPlay = Math.hypot(x / 1.5, (z - PLAY_CENTER.z) / 1.3);
  const hills = smoothstep(45, 170, fromPlay);
  return hills * Math.max(0, fbm(x * 0.012 + 3.1, z * 0.012 + 7.7) * 46 - 8);
}

function createSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(PALETTE.skyTop) },
      uMiddle: { value: new THREE.Color(PALETTE.skyMiddle) },
      uHorizon: { value: new THREE.Color(PALETTE.horizon) },
      uBottom: { value: new THREE.Color(PALETTE.skyBottom) },
      uSun: { value: new THREE.Color(PALETTE.sun) },
      uSunDirection: { value: SUN_DIRECTION },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uMiddle;
      uniform vec3 uHorizon;
      uniform vec3 uBottom;
      uniform vec3 uSun;
      uniform vec3 uSunDirection;
      varying vec3 vDirection;
      void main() {
        vec3 direction = normalize(vDirection);
        float height = direction.y;
        vec3 color = mix(uHorizon, uMiddle, smoothstep(0.0, 0.16, height));
        color = mix(color, uTop, smoothstep(0.12, 0.75, height));
        color = mix(color, uBottom, smoothstep(0.0, -0.25, height));
        float sunAmount = max(dot(direction, uSunDirection), 0.0);
        color += uSun * (pow(sunAmount, 6.0) * 0.45 + pow(sunAmount, 48.0) * 0.8);
        color += uSun * 0.22 * pow(1.0 - abs(height), 14.0);
        color += vec3(1.0, 0.93, 0.8) * smoothstep(0.9990, 0.9996, sunAmount) * 6.0;
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), material);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}

function createEnvironment(renderer, sky) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentScene = new THREE.Scene();
  environmentScene.add(new THREE.Mesh(sky.geometry, sky.material));
  const target = pmrem.fromScene(environmentScene, 0.02, 0.1, 2000);
  pmrem.dispose();
  return target.texture;
}

function addLights(scene) {
  scene.add(new THREE.HemisphereLight("#cfe0ff", "#5d6b3a", 0.55));

  const sun = new THREE.DirectionalLight("#ffd6a3", 3.2);
  sun.position.copy(PLAY_CENTER).addScaledVector(SUN_DIRECTION, 70);
  sun.target.position.copy(PLAY_CENTER);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 160 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
}

function createGround() {
  const geometry = new THREE.PlaneGeometry(1300, 1300, 260, 260);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const dark = new THREE.Color("#3f6a25");
  const lush = new THREE.Color("#5f8c30");
  const dry = new THREE.Color("#a6a14a");
  const color = new THREE.Color();

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, groundHeight(x, z));
    color
      .copy(dark)
      .lerp(lush, smoothstep(0.3, 0.6, fbm(x * 0.08 + 13, z * 0.08)))
      .lerp(dry, smoothstep(0.5, 0.8, fbm(x * 0.03, z * 0.03 + 7)) * 0.7);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  return ground;
}

function createMountains() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: "#6f8a78", roughness: 1, flatShading: true });
  for (let i = 0; i < 11; i += 1) {
    const geometry = new THREE.IcosahedronGeometry(1, 2);
    const position = geometry.attributes.position;
    const seed = i * 17.3;
    for (let v = 0; v < position.count; v += 1) {
      const vertex = new THREE.Vector3().fromBufferAttribute(position, v);
      vertex.multiplyScalar(1 + (valueNoise(vertex.x * 2.5 + seed, vertex.z * 2.5 + vertex.y * 2) - 0.5) * 0.45);
      if (vertex.y < 0) vertex.y *= 0.2;
      position.setXYZ(v, vertex.x, vertex.y, vertex.z);
    }
    geometry.computeVertexNormals();

    const angle = -Math.PI / 2 + (i / 10 - 0.5) * 3 + rand(-0.08, 0.08);
    const distance = rand(420, 560);
    const mountain = new THREE.Mesh(geometry, material);
    mountain.scale.set(rand(70, 130), rand(22, 48), rand(50, 80));
    mountain.position.set(Math.cos(angle) * distance, -4, Math.sin(angle) * distance);
    mountain.rotation.y = rand(0, TAU);
    group.add(mountain);
  }
  return group;
}

function createTrees() {
  const spots = [];
  while (spots.length < 150) {
    const x = rand(-170, 170);
    const z = rand(-230, 30);
    if (Math.abs(x) < 17 && z > -55) continue;
    if (z > 5 && Math.abs(x) < 45) continue;
    spots.push({ x, z, y: groundHeight(x, z), pine: Math.random() < 0.6, size: rand(0.8, 1.7) });
  }

  const woodMaterial = new THREE.MeshStandardMaterial({ color: "#5b3d26", roughness: 1 });
  const leafMaterial = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.2, 1, 6).translate(0, 0.5, 0), woodMaterial, spots.length);
  const cones = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), leafMaterial, spots.length * 3);
  const blobs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), leafMaterial, spots.length * 2);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let coneCount = 0;
  let blobCount = 0;

  function set(mesh, index, x, y, z, sx, sy, sz, tone) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rand(0, TAU), 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    if (tone) mesh.setColorAt(index, color.set(tone).offsetHSL(rand(-0.02, 0.02), 0, rand(-0.05, 0.05)));
  }

  spots.forEach(({ x, y, z, pine, size }, i) => {
    const trunkHeight = (pine ? 1.6 : 2.2) * size;
    set(trunks, i, x, y, z, size, trunkHeight, size);
    if (pine) {
      for (let layer = 0; layer < 3; layer += 1) {
        const radius = (1.5 - layer * 0.38) * size;
        set(cones, coneCount++, x, y + (1.2 + layer * 0.95) * size, z, radius, 2 * size, radius, "#2f5b36");
      }
    } else {
      const tone = Math.random() < 0.2 ? "#c98b33" : "#4f7f2e";
      set(blobs, blobCount++, x, y + 3.1 * size, z, 1.6 * size, 1.4 * size, 1.6 * size, tone);
      set(blobs, blobCount++, x + 0.6 * size, y + 3.9 * size, z + 0.3 * size, 1.1 * size, 1 * size, 1.1 * size, tone);
    }
  });
  cones.count = coneCount;
  blobs.count = blobCount;

  const group = new THREE.Group();
  for (const mesh of [trunks, cones, blobs]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

function createRocks() {
  const mesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }),
    36,
  );
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let count = 0;
  while (count < 36) {
    const x = rand(-26, 26);
    const z = rand(-50, 2);
    if (isInPlayLane(x, z) || Math.abs(x) < 3) continue;
    const size = rand(0.15, 0.7);
    dummy.position.set(x, size * 0.25, z);
    dummy.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
    dummy.scale.set(size * rand(1, 1.6), size * rand(0.6, 1), size * rand(1, 1.4));
    dummy.updateMatrix();
    mesh.setMatrixAt(count, dummy.matrix);
    mesh.setColorAt(count, color.set("#8a857c").offsetHSL(0, 0, rand(-0.08, 0.06)));
    count += 1;
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createFlowers() {
  const count = 900;
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.05, 0), new THREE.MeshStandardMaterial({ roughness: 0.6 }), count);
  const tones = ["#fff8e8", "#ffd84a", "#ff9fb8", "#c9a2ff", "#ffffff"];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let placed = 0;
  while (placed < count) {
    const x = rand(-32, 32);
    const z = rand(-55, 3);
    if (isInPlayLane(x, z)) continue;
    const patch = valueNoise(x * 0.15, z * 0.15);
    if (Math.random() > patch * patch * 1.6) continue;
    dummy.position.set(x, rand(0.2, 0.42), z);
    dummy.scale.setScalar(rand(0.7, 1.3));
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    mesh.setColorAt(placed, color.set(tones[Math.floor(patch * 13) % tones.length]));
    placed += 1;
  }
  return mesh;
}

// Brighter than white, so clouds stay luminous against the tone-mapped sky.
const CLOUD_GLOW = new THREE.Color().setRGB(1.7, 1.55, 1.4);

function createClouds() {
  const texture = canvasTexture(256, 128, (ctx, w, h) => {
    for (let i = 0; i < 22; i += 1) {
      const x = rand(w * 0.2, w * 0.8);
      const y = rand(h * 0.4, h * 0.7);
      const radius = rand(18, 42);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.55)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    }
  });

  const group = new THREE.Group();
  const sprites = [];
  for (let i = 0; i < 16; i += 1) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, color: CLOUD_GLOW, transparent: true, opacity: rand(0.5, 0.85), depthWrite: false, fog: false }),
    );
    sprite.scale.set(rand(110, 200), rand(40, 70), 1);
    sprite.position.set(rand(-650, 650), rand(80, 170), rand(-700, -420));
    sprites.push(sprite);
    group.add(sprite);
  }

  return {
    group,
    update(dt) {
      for (const sprite of sprites) {
        sprite.position.x += dt * 2.5;
        if (sprite.position.x > 700) sprite.position.x = -700;
      }
    },
  };
}
