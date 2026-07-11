import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";

// Loads rigged, animated humanoid/robot models and hands out independent
// animated instances. Two CC0 species give the enemy roster visual variety:
//   * "soldier" — three.js "Soldier" (Mixamo vanguard) + procedural tac-gear
//   * "robot"   — three.js "RobotExpressive" (CC0), a compact battle droid
// Both expose the SAME instance API (group / play / setLocoRate / flash / tick)
// so world.js can drive them identically. See docs/CREDITS.md for attribution.

const SOLDIER_URL = "./assets/models/Soldier.glb?v=260711010";
const ROBOT_URL = "./assets/models/RobotExpressive.glb?v=260711010";
const TARGET_HEIGHT = 1.85; // metres — sized so a bodyshot lands centre-mass

// Logical clip name -> per-species real clip name.
const CLIP_MAP = {
  soldier: { Idle: "Idle", Walk: "Walk", Run: "Run" },
  robot: { Idle: "Idle", Walk: "Walking", Run: "Running", Punch: "Punch" },
};
// Base yaw so the model's FRONT points +Z (world.js faces the group at the
// player and treats +Z as forward). Soldier GLB faces -Z; robot faces +Z.
const BASE_YAW = { soldier: Math.PI, robot: 0 };

// --- COD-style tactical gear, bolted onto the SOLDIER skeleton --------------
function findBone(model, re) {
  let found = null;
  model.traverse((o) => { if (!found && o.isBone && re.test(o.name)) found = o; });
  return found;
}
const gearDark = (c) => new THREE.MeshStandardMaterial({ color: c || 0x22262b, roughness: 0.62, metalness: 0.35 });
const gearMid = (c) => new THREE.MeshStandardMaterial({ color: c || 0x33383e, roughness: 0.78, metalness: 0.12 });
const gearTan = (c) => new THREE.MeshStandardMaterial({ color: c || 0x6d6350, roughness: 0.85, metalness: 0.05 });

function attachTacticalGear(model, opts = {}) {
  const kit = opts.kit || {};
  const dark = gearDark(kit.dark);
  const mid = gearMid(kit.mid);
  const tan = gearTan(kit.tan);
  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

  const head = findBone(model, /Head$/);
  if (head) {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(5.2, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), dark);
    dome.scale.set(1.02, 0.9, 1.12);
    g.add(dome);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(5.0, 0.7, 8, 22), dark);
    rim.rotation.x = Math.PI / 2; rim.position.y = -0.2; rim.scale.set(1.02, 1.14, 1);
    g.add(rim);
    const mount = box(1.8, 1.3, 1.0, mid); mount.position.set(0, 1.0, 5.4); g.add(mount);
    for (const sx of [-1, 1]) { const r = box(0.7, 1.8, 5, mid); r.position.set(sx * 4.7, 0.5, 0); g.add(r); }
    g.position.set(0, 2.6, 0.6);
    head.add(g);
  }
  const chest = findBone(model, /Spine2$/) || findBone(model, /Spine1$/) || findBone(model, /Spine$/);
  if (chest) {
    const g = new THREE.Group();
    const plate = box(15, 17, 6.5, mid); plate.position.set(0, 3, 3.6); g.add(plate);
    const plateTrim = box(15.4, 3, 6.7, dark); plateTrim.position.set(0, 9.5, 3.7); g.add(plateTrim);
    for (const px of [-4.6, 0, 4.6]) { const p = box(3.6, 4.4, 3.2, dark); p.position.set(px, -3.5, 6.4); g.add(p); }
    for (const sx of [-1, 1]) { const s = box(3, 12, 5, dark); s.position.set(sx * 5.5, 8, 2.5); s.rotation.z = sx * 0.15; g.add(s); }
    g.position.set(0, 2, 0);
    chest.add(g);
  }
  for (const re of [/LeftLeg$/, /RightLeg$/]) {
    const leg = findBone(model, re);
    if (leg) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 10), tan);
      pad.scale.set(1, 1.2, 0.8);
      pad.position.set(0, -6, 3.4);
      leg.add(pad);
    }
  }
}

// Soldier gear palettes — pick per-instance so grunts don't look identical.
const KITS = [
  { dark: 0x22262b, mid: 0x33383e, tan: 0x6d6350 }, // night-ops (default)
  { dark: 0x2b2620, mid: 0x4a4030, tan: 0x7a6a48 }, // desert tan
  { dark: 0x1c2a22, mid: 0x2c4032, tan: 0x4a5a3a }, // woodland green
  { dark: 0x2a1c22, mid: 0x402630, tan: 0x6a4048 }, // crimson raider
];

// --- model caches -----------------------------------------------------------
const cache = { soldier: null, robot: null };
const promises = { soldier: null, robot: null };
function loadModel(species, url) {
  if (cache[species]) return Promise.resolve(cache[species]);
  if (!promises[species]) {
    promises[species] = new Promise((resolve, reject) => {
      new GLTFLoader().load(url, (g) => { cache[species] = g; resolve(g); }, undefined, reject);
    }).catch((e) => { promises[species] = null; throw e; });
  }
  return promises[species];
}
export function loadCharacter() { return loadModel("soldier", SOLDIER_URL).catch(() => {}); }
export function loadRobot() { return loadModel("robot", ROBOT_URL).catch(() => {}); }
export function characterReady() { return !!cache.soldier; }
export function robotReady() { return !!cache.robot; }

// Build an independent animated instance. `opts.species` = "soldier" | "robot"
// (falls back to soldier if the robot isn't loaded). `tint` recolours the body,
// `emissive` adds a glow, `kit` overrides the soldier gear palette.
export function makeCharacter(opts = {}) {
  let species = opts.species === "robot" && cache.robot ? "robot" : "soldier";
  const gltf = cache[species];
  if (!gltf) return null;
  const model = skeletonClone(gltf.scene);

  model.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model);
  const h = box.getSize(new THREE.Vector3()).y || 1;
  model.scale.setScalar(TARGET_HEIGHT / h);
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  model.position.y = -box.min.y;
  model.updateMatrixWorld(true);

  const bodies = [];
  const bodyTint = opts.tint != null ? opts.tint : (species === "robot" ? 0x7a8794 : 0x5b5c52);
  model.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      o.material = o.material.clone();
      o.material.color = new THREE.Color(bodyTint);
      if (opts.emissive != null) { o.material.emissive = new THREE.Color(opts.emissive); o.material.emissiveIntensity = 0.6; }
      bodies.push(o);
    }
  });

  if (species === "soldier" && opts.gear !== false) {
    const kit = opts.kit || KITS[opts.kitIndex != null ? opts.kitIndex % KITS.length : 0];
    attachTacticalGear(model, { kit });
  }

  const group = new THREE.Group();
  group.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const map = CLIP_MAP[species];
  const actions = {};
  for (const logical of Object.keys(map)) {
    const clip = gltf.animations.find((a) => a.name === map[logical]);
    if (clip) actions[logical] = mixer.clipAction(clip);
  }
  let current = null;
  function play(name, fade = 0.22) {
    const next = actions[name];
    if (!next || next === current) return;
    next.reset();
    next.fadeIn(fade);
    next.play();
    if (current) current.fadeOut(fade);
    current = next;
  }
  play("Idle", 0);

  let headBone = null;
  model.traverse((o) => { if (o.isBone && /Head$/.test(o.name)) headBone = o; });

  function setLocoRate(rate) {
    const r = Math.max(0.4, Math.min(2.0, rate));
    if (actions.Walk) actions.Walk.timeScale = r;
    if (actions.Run) actions.Run.timeScale = r;
  }

  return {
    group, model, mixer, bodies, headBone, actions, species,
    baseYaw: BASE_YAW[species],
    play, setLocoRate,
    tick: (dt) => mixer.update(dt),
    flash() { for (const b of bodies) if (b.material) b.material.emissiveIntensity = 1.4; },
    fadeFlash(dt) {
      for (const b of bodies) if (b.material && b.material.emissiveIntensity > 0.6) {
        b.material.emissiveIntensity = Math.max(0.6, b.material.emissiveIntensity - dt * 4);
      }
    },
    dispose() { mixer.stopAllAction(); },
  };
}
