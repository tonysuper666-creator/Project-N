import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";

// Loads a rigged, animated humanoid (skeletal model + baked textures) and hands
// out independent animated instances. Model-agnostic: point MODEL_URL at any
// GLB with Idle/Walk/Run clips and it works. Currently uses the three.js
// "Soldier" (Mixamo "vanguard") model — see docs/CREDITS.md for attribution;
// swap the file for a CC0 model later without touching this code.

const MODEL_URL = "./assets/models/Soldier.glb?v=DEV";
const TARGET_HEIGHT = 1.85; // metres — sized so a bodyshot lands centre-mass

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
  model.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // skinned bounds can be wrong; never cull mid-animation
      if (opts.tint != null || opts.emissive != null) {
        o.material = o.material.clone();
        if (opts.tint != null) o.material.color = new THREE.Color(opts.tint);
        if (opts.emissive != null) { o.material.emissive = new THREE.Color(opts.emissive); o.material.emissiveIntensity = 0.6; }
      }
      bodies.push(o);
    }
  });

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

  return {
    group, model, mixer, bodies, headBone, actions,
    play,
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
