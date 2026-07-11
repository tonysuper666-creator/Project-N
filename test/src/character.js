import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";

// Loads a rigged, animated humanoid (skeletal model + baked textures) and hands
// out independent animated instances. Model-agnostic: point MODEL_URL at any
// GLB with Idle/Walk/Run clips and it works. Currently uses the three.js
// "Soldier" (Mixamo "vanguard") model — see docs/CREDITS.md for attribution;
// swap the file for a CC0 model later without touching this code.

const MODEL_URL = "./assets/models/Soldier.glb?v=260711009";
const TARGET_HEIGHT = 1.85; // metres — sized so a bodyshot lands centre-mass

// --- COD-style tactical gear, bolted onto the rigged skeleton ---------------
// Procedural modern-operator kit (helmet, plate carrier, pouches, knee pads)
// parented to skeleton bones so it moves with the animation. All original
// geometry — no third-party assets. Sizes are in bone-local units and tuned
// against this model's bone scale.
function findBone(model, re) {
  let found = null;
  model.traverse((o) => { if (!found && o.isBone && re.test(o.name)) found = o; });
  return found;
}
const gearDark = () => new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.62, metalness: 0.35 });
const gearMid = () => new THREE.MeshStandardMaterial({ color: 0x33383e, roughness: 0.78, metalness: 0.12 });
const gearTan = () => new THREE.MeshStandardMaterial({ color: 0x6d6350, roughness: 0.85, metalness: 0.05 });

function attachTacticalGear(model, opts = {}) {
  const dark = gearDark();
  const mid = gearMid();
  const tan = gearTan();
  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

  // helmet on the head bone
  const head = findBone(model, /Head$/);
  if (head) {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(5.2, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), dark);
    dome.scale.set(1.02, 0.9, 1.12);
    g.add(dome);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(5.0, 0.7, 8, 22), dark);
    rim.rotation.x = Math.PI / 2; rim.position.y = -0.2; rim.scale.set(1.02, 1.14, 1);
    g.add(rim);
    // NVG mount stub on the front
    const mount = box(1.8, 1.3, 1.0, mid); mount.position.set(0, 1.0, 5.4); g.add(mount);
    // side rails
    for (const sx of [-1, 1]) { const r = box(0.7, 1.8, 5, mid); r.position.set(sx * 4.7, 0.5, 0); g.add(r); }
    g.position.set(0, 2.6, 0.6); // sit on top of the skull (bone-local)
    head.add(g);
  }

  // plate carrier + pouches on the upper spine (chest)
  const chest = findBone(model, /Spine2$/) || findBone(model, /Spine1$/) || findBone(model, /Spine$/);
  if (chest) {
    const g = new THREE.Group();
    const plate = box(15, 17, 6.5, mid); plate.position.set(0, 3, 3.6); g.add(plate);
    const plateTrim = box(15.4, 3, 6.7, dark); plateTrim.position.set(0, 9.5, 3.7); g.add(plateTrim);
    // magazine / utility pouches across the front
    for (const px of [-4.6, 0, 4.6]) { const p = box(3.6, 4.4, 3.2, dark); p.position.set(px, -3.5, 6.4); g.add(p); }
    // shoulder straps
    for (const sx of [-1, 1]) { const s = box(3, 12, 5, dark); s.position.set(sx * 5.5, 8, 2.5); s.rotation.z = sx * 0.15; g.add(s); }
    g.position.set(0, 2, 0);
    chest.add(g);
  }

  // knee pads on the shins
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

let gltfCache = null;
let loadPromise = null;

// Kick off (or reuse) the model download. Resolves with the parsed gltf.
export function loadCharacter() {
  if (gltfCache) return Promise.resolve(gltfCache);
  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      new GLTFLoader().load(MODEL_URL, (g) => { gltfCache = g; resolve(g); }, undefined, reject);
    }).catch((e) => { loadPromise = null; throw e; });
  }
  return loadPromise;
}
export function characterReady() { return !!gltfCache; }

// Build an independent animated instance. `tint` recolours the body; `emissive`
// adds a glow (used to distinguish heavy units). Returns null if not loaded yet.
export function makeCharacter(opts = {}) {
  if (!gltfCache) return null;
  const model = skeletonClone(gltfCache.scene);

  // scale to a consistent in-world height, feet on y=0 (force world-matrix
  // refreshes so the bounding box reflects the scale/offset we just applied)
  model.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model);
  const h = box.getSize(new THREE.Vector3()).y || 1;
  model.scale.setScalar(TARGET_HEIGHT / h);
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  model.position.y = -box.min.y;
  model.updateMatrixWorld(true);

  const bodies = [];
  // default to a darker, tactical body tint (COD night-ops vibe) unless the
  // caller overrides — pushes the light-tan camo toward modern operator.
  const bodyTint = opts.tint != null ? opts.tint : 0x5b5c52;
  model.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // skinned bounds can be wrong; never cull mid-animation
      o.material = o.material.clone();
      o.material.color = new THREE.Color(bodyTint);
      if (opts.emissive != null) { o.material.emissive = new THREE.Color(opts.emissive); o.material.emissiveIntensity = 0.6; }
      bodies.push(o);
    }
  });

  // bolt on the tactical gear (unless disabled)
  if (opts.gear !== false) attachTacticalGear(model, opts);

  const group = new THREE.Group();
  group.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const name of ["Idle", "Walk", "Run"]) {
    const clip = gltfCache.animations.find((a) => a.name === name);
    if (clip) actions[name] = mixer.clipAction(clip);
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

  // Sync the walk/run leg cycle to the real ground speed so the feet don't
  // slide (moonwalk). Idle stays at 1x. rate = movementSpeed / clip-natural.
  function setLocoRate(rate) {
    const r = Math.max(0.4, Math.min(2.0, rate));
    if (actions.Walk) actions.Walk.timeScale = r;
    if (actions.Run) actions.Run.timeScale = r;
  }

  return {
    group, model, mixer, bodies, headBone, actions,
    play, setLocoRate,
    tick: (dt) => mixer.update(dt),
    // brief white-hot flash on hit
    flash() {
      for (const b of bodies) if (b.material) b.material.emissiveIntensity = 1.4;
    },
    fadeFlash(dt) {
      for (const b of bodies) if (b.material && b.material.emissiveIntensity > 0.6) {
        b.material.emissiveIntensity = Math.max(0.6, b.material.emissiveIntensity - dt * 4);
      }
    },
    dispose() { mixer.stopAllAction(); },
  };
}
