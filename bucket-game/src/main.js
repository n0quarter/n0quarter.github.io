import * as THREE from "three";
import { createWorld } from "./scene.js";
import { createGrass } from "./grass.js";
import { createWell, WELL } from "./well.js";
import { createBucket } from "./bucket.js";
import { createBody, isInsideWell, stepBody } from "./physics.js";
import { createMotes, createParticles } from "./particles.js";
import { createAudio } from "./audio.js";
import { createHud } from "./hud.js";
import { createAimControl, createTrajectoryPreview, throwVelocity } from "./aim.js";
import { createCameraRig } from "./cameraRig.js";
import { createWalkControl } from "./walk.js";
import { createLitter } from "./litter.js";
import { finalLine, MISS_LINES, SCORE_LINES, statsLine, SWISH_LINES } from "./messages.js";
import { clamp, easeOutBack, pick, rand } from "./utils.js";

const HAND = new THREE.Vector3(0.38, 0.98, 1.35);
const BUCKETS_PER_GAME = 10;
const BONUS_BUCKET_STREAK = 5;
const WALK_SPEED = 3.2;
const WALK_LIMIT = 8;
const STEP_INTERVAL = 0.32;
const TRAIL_INTERVAL = 0.025;
const BEST_KEY = "well-well-well:best";

const world = createWorld(document.getElementById("scene"));
const { scene, camera, renderer } = world;
const rig = createCameraRig(camera);
const well = createWell();
const grass = createGrass(matchMedia("(pointer: coarse)").matches ? 28000 : 70000);
const particles = createParticles();
const motes = createMotes();
const preview = createTrajectoryPreview();
const audio = createAudio();
const hud = createHud();
const walk = createWalkControl(document.getElementById("walkLeft"), document.getElementById("walkRight"));
const litter = createLitter(scene, particles);
scene.add(well.group, grass.mesh, particles.points, motes.points, preview.mesh);

const game = {
  phase: "menu",
  score: 0,
  best: loadBest(),
  buckets: BUCKETS_PER_GAME,
  playerX: 0,
  throwOrigin: new THREE.Vector3(),
  streak: 0,
  level: 0,
  throws: 0,
  makes: 0,
  swishes: 0,
  bestStreak: 0,
  stepTimer: 0,
  trailTimer: 0,
  wind: new THREE.Vector3(),
  shot: null,
  bucket: null,
  body: null,
  golden: false,
  celebration: null,
  spawnAge: 0,
  timeScale: 1,
  timers: [],
  announced: { wind: false, sway: false, best: false },
};

const aim = createAimControl(renderer.domElement, {
  onChange: (shot) => (game.shot = shot),
  onRelease: throwBucket,
});

const wellFocus = new THREE.Vector3();
const hand = HAND.clone();
const screenPoint = new THREE.Vector3();

function later(seconds, action) {
  game.timers.push({ remaining: seconds, action });
}

function runTimers(dt) {
  for (const timer of [...game.timers]) {
    timer.remaining -= dt;
    if (timer.remaining <= 0) {
      game.timers.splice(game.timers.indexOf(timer), 1);
      timer.action();
    }
  }
}

function setPhase(phase) {
  game.phase = phase;
  hud.setPhase(phase);
}

function layoutFor(level) {
  const distance = Math.min(8 + level * 0.9, 21) + rand(-1, 1.5);
  const lateral = Math.min(0.5 + level * 0.45, 6);
  const windSpeed = level < 2 ? 0 : Math.min(1.5 + (level - 2) * 0.5, 6) * rand(0.75, 1);
  // Mostly a crosswind: it pushes the bucket sideways, which the player can read and correct for.
  const windAngle = (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.6, 0.6);
  return {
    x: rand(-lateral, lateral),
    z: -distance,
    wind: new THREE.Vector3(Math.cos(windAngle) * windSpeed, 0, Math.sin(windAngle) * windSpeed),
    sway: level < 9 ? 0 : Math.min(0.4 + (level - 9) * 0.15, 1.6),
  };
}

async function startGame() {
  if (game.phase !== "menu" && game.phase !== "gameover") return;
  audio.unlock();
  hud.hideScreens();
  Object.assign(game, { score: 0, buckets: BUCKETS_PER_GAME, playerX: 0, streak: 0, level: 0, throws: 0, makes: 0, swishes: 0, bestStreak: 0, timers: [] });
  game.announced = { wind: false, sway: false, best: false };
  hand.copy(HAND);
  litter.remove(() => true);
  hud.setScore(0);
  hud.setCombo(0);
  hud.setBuckets(game.buckets);
  await moveWell(layoutFor(0));
  spawnBucket();
}

async function moveWell(layout) {
  setPhase("relocating");
  litter.remove((bucket) => bucket.position.y > 0.45);
  emitDust(new THREE.Vector3(well.collider.x, 0.1, well.collider.z));
  audio.rumble();

  await well.relocate(layout.x, layout.z, () => {
    litter.remove((bucket) => Math.hypot(bucket.position.x - layout.x, bucket.position.z - layout.z) < WELL.outerRadius + 0.5);
    well.setSway(layout.sway);
    game.wind.copy(layout.wind);
    hud.setWind(game.wind);
    hud.setDistance(HAND.z - layout.z);
    emitDust(new THREE.Vector3(layout.x, 0.1, layout.z));
    audio.pop();
    rig.addShake(0.08);
    announceChanges(layout);
  });
}

function announceChanges(layout) {
  if (layout.sway > 0 && !game.announced.sway) {
    game.announced.sway = true;
    hud.toast("The well is getting shy. It moves now.", "warn");
  } else if (layout.wind.length() > 0 && !game.announced.wind) {
    game.announced.wind = true;
    hud.toast("The wind picked up. Watch the arrow up top.", "warn");
  }
}

function spawnBucket() {
  game.golden = game.level >= 3 && Math.random() < 0.15;
  game.bucket = createBucket({ golden: game.golden });
  game.bucket.position.copy(hand);
  game.bucket.scale.setScalar(0.001);
  scene.add(game.bucket);
  Object.assign(game, { spawnAge: 0, shot: null, body: null });
  setPhase("aiming");
  aim.setEnabled(true);
  hud.showHint(game.throws < 2);
  if (game.golden) hud.toast("A golden bucket! Double points.", "gold");
  else if (game.buckets === 1) hud.toast("Last bucket. Make it count.", "warn");
}

function updateAiming(dt, time) {
  game.spawnAge += dt;
  const walking = walk.direction();
  game.playerX = clamp(game.playerX + walking * WALK_SPEED * dt, -WALK_LIMIT, WALK_LIMIT);
  hand.set(HAND.x + game.playerX, HAND.y, HAND.z);
  updateFootsteps(dt, walking);

  const shot = game.shot?.valid ? game.shot : null;
  const power = shot?.power ?? 0;
  const yaw = shot?.yaw ?? 0;
  const bucket = game.bucket;

  bucket.scale.setScalar(Math.max(easeOutBack(Math.min(game.spawnAge / 0.4, 1)), 0.001));
  const stride = walking ? Math.abs(Math.sin(time * 9)) * 0.03 : 0;
  bucket.position.set(hand.x + Math.sin(yaw) * 0.15, hand.y - power * 0.1 + Math.sin(time * 2) * 0.015 + stride, hand.z + power * 0.18);
  bucket.rotation.set(power * 0.45 + Math.sin(time * 1.6) * 0.04, -yaw, Math.sin(time * 1.2) * 0.05 - walking * 0.12);

  hud.setPower(shot ? power : null);
  if (shot) preview.show(bucket.position, throwVelocity(shot), game.level < 3 ? 1 : 0.5, time);
  else preview.hide();
}

function updateFootsteps(dt, walking) {
  if (!walking) {
    game.stepTimer = 0;
    return;
  }
  game.stepTimer -= dt;
  if (game.stepTimer > 0) return;
  game.stepTimer = STEP_INTERVAL;
  audio.step();
}

function throwBucket(shot) {
  game.shot = null;
  if (game.phase !== "aiming" || !shot?.valid) return;
  aim.setEnabled(false);
  preview.hide();
  hud.setPower(null);
  hud.showHint(false);

  const spin = new THREE.Vector3(-(2 + shot.power * 4), rand(-1, 1), rand(-0.6, 0.6));
  game.bucket.scale.setScalar(1);
  game.body = createBody(game.bucket.position, throwVelocity(shot), spin);
  game.throwOrigin.copy(game.bucket.position);
  game.throws += 1;
  game.buckets -= 1;
  hud.setBuckets(game.buckets);
  setPhase("flying");
  audio.whoosh(shot.power);
  rig.kick(2 + shot.power * 3);
}

const spinStep = new THREE.Quaternion();
const spinAxis = new THREE.Vector3();

function syncBucketToBody(dt) {
  const { bucket, body } = game;
  bucket.position.copy(body.position);
  const angle = body.spin.length() * dt;
  if (angle > 0) {
    spinStep.setFromAxisAngle(spinAxis.copy(body.spin).normalize(), angle);
    bucket.quaternion.premultiply(spinStep);
  }
}

function simulate(dt) {
  const events = [];
  stepBody(game.body, dt, well.collider, game.wind, events);
  events.forEach(playImpact);
  syncBucketToBody(dt);
}

// A faint vapour trail makes the arc (and the wind drift) readable.
function emitTrail(dt) {
  game.trailTimer -= dt;
  if (game.trailTimer > 0) return;
  game.trailTimer = TRAIL_INTERVAL;
  particles.emit({ origin: game.body.position, count: 1, color: "#fff6e2", spread: 0, speed: [0, 0], size: [0.1, 0.16], grow: 0.25, gravity: 0, opacity: 0.3, life: [0.45, 0.6] });
}

function updateFlying(dt) {
  simulate(dt);
  emitTrail(dt);
  if (isInsideWell(game.body, well.collider)) {
    scoreBucket();
    return;
  }
  const reason = missReason();
  if (reason) missBucket(reason);
}

function updateSinking(dt) {
  simulate(dt);
  if (game.body.position.y > -1.4) return;
  scene.remove(game.bucket);
  game.bucket = null;
  setPhase("celebrating");
  later(0.45, celebrate);
}

function missReason() {
  const { position, age, restTime, hitRoof, touchedWell } = game.body;
  const outOfBounds = Math.abs(position.x) > 45 || position.z < -70 || position.z > 12;
  if (!outOfBounds && age < 7 && restTime < 0.35) return null;

  const fromWell = Math.hypot(position.x - well.collider.x, position.z - well.collider.z);
  if (hitRoof) return "roof";
  if (fromWell < WELL.outerRadius + 0.3 && position.y > WELL.height * 0.5) return "perched";
  if (touchedWell) return "rim";

  const origin = game.throwOrigin;
  const toWell = new THREE.Vector2(well.collider.x - origin.x, well.collider.z - origin.z);
  const wellDistance = toWell.length();
  toWell.normalize();
  const offsetX = position.x - origin.x;
  const offsetZ = position.z - origin.z;
  const along = offsetX * toWell.x + offsetZ * toWell.y - wellDistance;
  const across = offsetX * toWell.y - offsetZ * toWell.x;
  if (Math.abs(across) > Math.abs(along)) return "wide";
  return along < 0 ? "short" : "long";
}

function scoreBucket() {
  setPhase("sinking");
  const swish = !game.body.touchedWell;
  game.streak += 1;
  game.level += 1;
  game.makes += 1;
  game.swishes += swish ? 1 : 0;
  game.bestStreak = Math.max(game.bestStreak, game.streak);
  const multiplier = Math.min(game.streak, 5);
  const points = (swish ? 2 : 1) * multiplier * (game.golden ? 2 : 1);
  game.score += points;
  game.celebration = { points, swish, multiplier, golden: game.golden };
  audio.drop();
}

function celebrate() {
  const { points, swish, multiplier, golden } = game.celebration;
  const top = new THREE.Vector3(well.collider.x, WELL.height, well.collider.z);

  particles.emit({ origin: top, radius: 0.35, count: 130, color: "#dff3ff", spread: 0.35, speed: [3, 7.5], size: [0.05, 0.12], life: [0.9, 1.5], drag: 0.3 });
  particles.emit({ origin: top, radius: 0.3, count: 30, color: "#f4fbff", spread: 0.5, speed: [1, 2.5], size: [0.3, 0.7], grow: 0.8, gravity: 0.5, drag: 1.5, opacity: 0.45, life: [0.8, 1.3] });
  if (golden) particles.emit({ origin: top, count: 70, color: "#ffd34d", spread: 1, speed: [2, 5], size: [0.06, 0.12], gravity: 2, life: [1, 1.8] });
  audio.splash();
  audio.chime(game.streak);
  rig.addShake(0.05);
  rig.kick(-3);

  hud.setScore(game.score);
  hud.setCombo(game.streak);
  const caption = [swish ? "swish" : "in", multiplier > 1 ? `×${multiplier}` : "", golden ? "gold" : ""].filter(Boolean).join(" · ");
  const screen = toScreen(top.setY(WELL.height + 0.7));
  hud.floatText(`+${points}`, caption, screen.x, screen.y, golden ? "gold" : swish ? "swish" : "");

  if (game.streak % BONUS_BUCKET_STREAK === 0) {
    game.buckets += 1;
    hud.setBuckets(game.buckets);
    hud.toast(`${game.streak} in a row! The well gives you a bucket back.`, "good");
  } else if (!game.announced.best && game.best > 0 && game.score > game.best) {
    game.announced.best = true;
    hud.toast("New best score! The well is impressed.", "gold");
  } else {
    hud.toast(swish ? pick(SWISH_LINES) : pick(SCORE_LINES), "good");
  }

  later(1.4, async () => {
    if (game.buckets === 0) {
      endGame();
      return;
    }
    await moveWell(layoutFor(game.level));
    spawnBucket();
  });
}

function missBucket(reason) {
  setPhase("missed");
  game.streak = 0;
  hud.setCombo(0);
  hud.toast(pick(MISS_LINES[reason]), "bad");
  audio.womp();
  litter.add(game.bucket);
  game.bucket = null;
  later(1.3, () => (game.buckets > 0 ? spawnBucket() : endGame()));
}

function endGame() {
  setPhase("gameover");
  const isNewBest = game.score > game.best;
  if (isNewBest) {
    game.best = game.score;
    saveBest(game.best);
  }
  audio.sadTrombone();
  hud.showGameOver({ score: game.score, best: game.best, isNewBest, line: finalLine(game.score), stats: statsLine(game) });
}

function playImpact({ kind, impact, position }) {
  const strength = Math.min(impact / 8, 1);
  if (kind === "ground") {
    audio.thud(strength);
    particles.emit({ origin: position.clone().setY(0.05), count: 10, color: "#b39a74", spread: 1, speed: [0.4, 1.2], size: [0.25, 0.5], grow: 0.5, gravity: 0, drag: 3, opacity: 0.45 });
    return;
  }
  const stone = kind === "rim";
  if (stone) audio.clunk(strength);
  else audio.knock(strength);
  particles.emit({ origin: position, count: 14, color: stone ? "#9d968a" : "#8a5a33", spread: 0.9, speed: [1.5, 3.5], size: [0.03, 0.07], life: [0.5, 0.9] });
  rig.addShake(0.04 + strength * 0.12);
}

function emitDust(origin) {
  particles.emit({ origin, radius: WELL.outerRadius + 0.2, count: 45, color: "#c9ab82", direction: new THREE.Vector3(0, 0.5, 0), spread: 1, speed: [0.8, 2.2], size: [0.4, 0.9], grow: 0.6, gravity: -0.3, drag: 2.5, opacity: 0.55, life: [0.8, 1.4] });
}

function updateTimeScale(realDt) {
  const target = game.phase === "flying" && isApproachingRim(game.body) ? 0.3 : 1;
  game.timeScale += (target - game.timeScale) * Math.min(1, realDt * 12);
}

function isApproachingRim({ position, velocity }) {
  const fromWell = Math.hypot(position.x - well.collider.x, position.z - well.collider.z);
  return velocity.y < 0 && fromWell < WELL.outerRadius + 0.7 && position.y < WELL.height + 1.4 && position.y > WELL.height - 0.3;
}

function updateCamera() {
  wellFocus.set(well.collider.x, 1.1, well.collider.z);
  rig.setPlayerX(game.playerX);
  if (game.phase === "flying" || game.phase === "sinking") {
    rig.follow(game.body.position, wellFocus, hand, game.timeScale < 0.6 ? 0.82 : 1);
  } else if (game.phase !== "missed" && game.phase !== "celebrating") {
    rig.frame(wellFocus, hand);
  }
}

function toScreen(position) {
  screenPoint.copy(position).project(camera);
  return { x: ((screenPoint.x + 1) / 2) * window.innerWidth, y: ((1 - screenPoint.y) / 2) * window.innerHeight };
}

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(best) {
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch {
    // Storage can be unavailable (private mode); the best score just won't persist.
  }
}

let lastFrame = performance.now();
let elapsed = 0;

function loop(now) {
  const realDt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  updateTimeScale(realDt);
  const dt = realDt * game.timeScale;
  elapsed += dt;

  runTimers(realDt);
  well.update(dt);
  if (game.phase === "aiming") updateAiming(dt, elapsed);
  else if (game.phase === "flying") updateFlying(dt);
  else if (game.phase === "sinking") updateSinking(dt);
  litter.update(realDt);

  updateCamera();
  rig.update(realDt);
  grass.update(elapsed, game.wind, well.collider);
  particles.update(dt);
  motes.update(dt, game.wind);
  particles.setScale(renderer, camera);
  motes.setScale(renderer, camera);
  world.update(realDt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

hud.onPlay(startGame);
hud.onMute(() => hud.setMuted(audio.toggleMuted()));
hud.setMuted(audio.isMuted());
window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "Enter") {
    if (game.phase !== "menu" && game.phase !== "gameover") return;
    event.preventDefault();
    startGame();
  } else if (event.code === "KeyM") {
    hud.setMuted(audio.toggleMuted());
  }
});

well.placeAt(0, -11);
hud.setWind(game.wind);
hud.setBuckets(game.buckets);
hud.setPhase("menu");
hud.showMenu(game.best);
rig.frame(wellFocus.set(0, 1.1, -11), HAND);
rig.snap();
requestAnimationFrame(loop);
