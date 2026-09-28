import * as THREE from "three";
import { canvasTexture, rand } from "./utils.js";

const TOP_RADIUS = 0.2;
const BOTTOM_RADIUS = 0.135;
const HALF_HEIGHT = 0.16;

let shared = null;

export function createBucket({ golden = false } = {}) {
  shared ??= createShared();
  const group = new THREE.Group();
  const shell = golden ? shared.gold : shared.wood;

  group.add(new THREE.Mesh(shared.body, shell), new THREE.Mesh(shared.bottom, shell));
  for (const band of shared.bands) group.add(new THREE.Mesh(band, shared.iron));
  group.add(new THREE.Mesh(shared.handle, shared.iron));

  group.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });
  return group;
}

function radiusAt(y) {
  return BOTTOM_RADIUS + ((y + HALF_HEIGHT) / (HALF_HEIGHT * 2)) * (TOP_RADIUS - BOTTOM_RADIUS);
}

function createShared() {
  const profile = [new THREE.Vector2(BOTTOM_RADIUS, -HALF_HEIGHT), new THREE.Vector2(TOP_RADIUS, HALF_HEIGHT)];
  const bandHeights = [-0.11, 0.115];
  const handlePoints = [];
  for (let i = 0; i <= 12; i += 1) {
    const t = (i / 12) * Math.PI;
    handlePoints.push(new THREE.Vector3(Math.cos(t) * (TOP_RADIUS + 0.01), HALF_HEIGHT - 0.03 + Math.sin(t) * 0.2, 0));
  }

  return {
    body: new THREE.LatheGeometry(profile, 28),
    bottom: new THREE.CircleGeometry(BOTTOM_RADIUS, 28).rotateX(Math.PI / 2).translate(0, -HALF_HEIGHT, 0),
    bands: bandHeights.map((y) =>
      new THREE.TorusGeometry(radiusAt(y) + 0.006, 0.013, 6, 36).rotateX(Math.PI / 2).translate(0, y, 0),
    ),
    handle: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(handlePoints), 24, 0.009, 6),
    wood: new THREE.MeshStandardMaterial({ map: staveTexture(), roughness: 0.75, side: THREE.DoubleSide }),
    iron: new THREE.MeshStandardMaterial({ color: "#34343a", metalness: 0.8, roughness: 0.38 }),
    gold: new THREE.MeshStandardMaterial({
      color: "#ffc93c",
      metalness: 1,
      roughness: 0.22,
      emissive: "#5a3800",
      emissiveIntensity: 0.35,
      side: THREE.DoubleSide,
    }),
  };
}

function staveTexture() {
  return canvasTexture(512, 128, (ctx, w, h) => {
    const staves = 14;
    const width = w / staves;
    for (let i = 0; i < staves; i += 1) {
      ctx.fillStyle = `hsl(${rand(24, 32)}, ${rand(42, 55)}%, ${rand(36, 46)}%)`;
      ctx.fillRect(i * width, 0, width, h);
      for (let g = 0; g < 7; g += 1) {
        ctx.strokeStyle = `rgba(70, 40, 18, ${rand(0.08, 0.22)})`;
        ctx.lineWidth = rand(0.6, 1.6);
        const x = i * width + rand(3, width - 3);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + rand(-3, 3), h * 0.3, x + rand(-3, 3), h * 0.7, x + rand(-2, 2), h);
        ctx.stroke();
      }
      ctx.fillStyle = "#3f2512";
      ctx.fillRect(i * width, 0, 2.5, h);
    }
  });
}
