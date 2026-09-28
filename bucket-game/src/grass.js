import * as THREE from "three";
import { rand, smoothstep, TAU } from "./utils.js";
import { SUN_DIRECTION } from "./scene.js";

const AREA = { minX: -36, maxX: 36, minZ: -62, maxZ: 5 };
const EDGE_FADE = 8;
const SEGMENTS = 4;

const vertexShader = /* glsl */ `
  attribute vec3 aOffset;
  attribute vec4 aParams; // yaw, height, width, variation
  uniform float uTime;
  uniform vec2 uWind;
  uniform vec3 uHole; // x, z, radius
  uniform vec3 uSunDirection;
  varying float vHeight;
  varying float vVariation;
  varying float vLight;
  #include <fog_pars_vertex>

  void main() {
    float height = position.y;
    vec3 blade = vec3(position.x * aParams.z, height * aParams.y, height * height * 0.08);
    float c = cos(aParams.x);
    float s = sin(aParams.x);
    blade = vec3(c * blade.x + s * blade.z, blade.y, -s * blade.x + c * blade.z);

    float gust = sin(uTime * 1.3 + aOffset.x * 0.21 + aOffset.z * 0.17) * 0.5 + 0.5;
    vec2 flutter = vec2(
      sin(uTime * 2.1 + aOffset.z * 1.7 + aParams.w * 6.0),
      cos(uTime * 1.7 + aOffset.x * 1.3)
    ) * 0.035;
    blade.xz += (uWind * 0.02 * (0.35 + gust) + flutter) * height * height;

    vec3 world = aOffset + blade;
    if (distance(aOffset.xz, uHole.xy) < uHole.z) world.y -= 2.0;

    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vHeight = height;
    vVariation = aParams.w;
    vLight = abs(dot(vec3(s, 0.0, c), uSunDirection));
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTip;
  uniform vec3 uDry;
  uniform vec3 uSunColor;
  varying float vHeight;
  varying float vVariation;
  varying float vLight;
  #include <fog_pars_fragment>

  void main() {
    vec3 tip = mix(uTip, uDry, smoothstep(0.65, 1.0, vVariation));
    vec3 color = mix(uBase, tip, smoothstep(0.0, 1.0, vHeight));
    color *= 0.8 + 0.3 * vVariation;
    color += uSunColor * vLight * vHeight * vHeight * 0.35;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function createGrass(count) {
  const blade = createBladeGeometry();
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = blade.index;
  geometry.setAttribute("position", blade.getAttribute("position"));

  const offsets = new Float32Array(count * 3);
  const params = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    const x = rand(AREA.minX, AREA.maxX);
    const z = rand(AREA.minZ, AREA.maxZ);
    const edge = Math.min(x - AREA.minX, AREA.maxX - x, z - AREA.minZ, AREA.maxZ - z);
    offsets.set([x, 0, z], i * 3);
    params.set([rand(0, TAU), rand(0.22, 0.5) * smoothstep(0, EDGE_FADE, edge), rand(0.7, 1.3), Math.random()], i * 4);
  }
  geometry.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offsets, 3));
  geometry.setAttribute("aParams", new THREE.InstancedBufferAttribute(params, 4));
  geometry.instanceCount = count;

  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uWind: { value: new THREE.Vector2() },
        uHole: { value: new THREE.Vector3(0, 0, -1) },
        uBase: { value: new THREE.Color("#2f4d17") },
        uTip: { value: new THREE.Color("#9cc24a") },
        uDry: { value: new THREE.Color("#d3bf62") },
        uSunColor: { value: new THREE.Color("#ffc47a") },
        uSunDirection: { value: SUN_DIRECTION },
      },
    ]),
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    fog: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  return {
    mesh,
    update(time, wind, well) {
      material.uniforms.uTime.value = time;
      material.uniforms.uWind.value.set(wind.x, wind.z);
      material.uniforms.uHole.value.set(well.x, well.z, well.outerRadius + 0.03);
    },
  };
}

function createBladeGeometry() {
  const positions = [];
  const indices = [];
  for (let i = 0; i <= SEGMENTS; i += 1) {
    const height = i / SEGMENTS;
    const halfWidth = 0.028 * (1 - height) ** 0.8;
    positions.push(-halfWidth, height, 0, halfWidth, height, 0);
  }
  for (let i = 0; i < SEGMENTS; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}
