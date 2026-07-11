import * as THREE from "three";
import { buildKnife, makeFlash } from "./models.js?v=260711010";
import { loadArms } from "./akmodel.js?v=260711010";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// 3D first-person view-model. Each weapon shows a distinct real GLB gun model
// (CC0 Kenney "Blaster Kit" — see docs/CREDITS.md) gripped in front of the
// camera. Models are auto-normalised (centred + scaled to a target length) and
// pointed down -Z (the Kenney blasters have their muzzle on -Z, grip on -Y, so
// they need no re-orientation). The melee knife stays procedural.

// Placement per pose category, in camera space (eye at origin, -Z forward).
// `len` = target longest-axis length in metres (the auto-scale target).
const GUN_BASE = {
  rifle: { pos: [0.15, -0.16, -0.52], rot: [0.05, 0.02, 0.04], len: 0.44 },
  pistol: { pos: [0.12, -0.15, -0.40], rot: [0.02, 0.0, 0.0], len: 0.26 },
  knife: { pos: [-0.08, -0.13, -0.67], rot: [-0.36, 0.24, -0.52], scale: 1.12 },
};
const MODEL_DIR = "./assets/models/guns/";
const MODEL_VER = "260711010";
const loader = new GLTFLoader();

export function createViewmodel(camera) {
  const root = new THREE.Group();
  camera.add(root);
  const poseGroup = new THREE.Group(); // live pose (recoil/sway/switch) lives here
  root.add(poseGroup);

  // --- procedural melee knife (always available) ---
  const knife = buildKnife();
  {
    const b = GUN_BASE.knife;
    knife.group.position.set(...b.pos);
    knife.group.rotation.set(...b.rot);
    knife.group.scale.setScalar(b.scale);
    knife.group.visible = false;
    knife.group.traverse((o) => { o.frustumCulled = false; });
    poseGroup.add(knife.group);
  }
  // Attach the CS arms to the knife (tunable via tools/knife.html).
  const KA = (typeof window !== "undefined" && window.__PN_KNIFE_ARM__) || { s: 0.03, px: 0, py: -0.1, pz: 0.1, rx: 0, ry: 0, rz: 0 };
  loadArms((arms) => {
    arms.scale.setScalar(KA.s);
    arms.position.set(KA.px, KA.py, KA.pz);
    arms.rotation.set(KA.rx, KA.ry, KA.rz);
    knife.blade.add(arms);
    if (typeof window !== "undefined") {
      window.__PN_SET_KNIFE_ARM__ = (s, px, py, pz, rx, ry, rz) => { arms.scale.setScalar(s); arms.position.set(px, py, pz); arms.rotation.set(rx, ry, rz); };
    }
  });

  // --- GLB gun models, built lazily and cached by model key ---
  const guns = {}; // key -> { group, flash, ready, category, meshes }
  let currentKey = "knife";
  let flashT = 0;
  let rifleSkin = "black";

  function applySkin(entry) {
    if (!entry || entry.category !== "rifle") return;
    const gold = rifleSkin === "gold";
    for (const m of entry.meshes) {
      if (!m.material) continue;
      m.material.emissive = new THREE.Color(gold ? 0x5a3d00 : 0x000000);
      m.material.emissiveIntensity = gold ? 0.5 : 0;
      if (gold) { m.material.color = new THREE.Color(0xffcf45); m.material.metalness = 0.7; m.material.roughness = 0.3; }
    }
  }

  function buildGun(key, category) {
    const holder = new THREE.Group();
    holder.visible = false;
    poseGroup.add(holder);
    const entry = { group: holder, flash: null, ready: false, category, meshes: [] };
    guns[key] = entry;
    loader.load(`${MODEL_DIR}${key}.glb?v=${MODEL_VER}`,
      (g) => {
        const model = g.scene;
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center); // centre on origin
        const base = GUN_BASE[category] || GUN_BASE.rifle;
        const s = (base.len || 0.5) / Math.max(size.x, size.y, size.z || 0.001);
        const inner = new THREE.Group();
        inner.add(model);
        inner.scale.setScalar(s);
        holder.add(inner);
        holder.position.set(...base.pos);
        holder.rotation.set(...base.rot);
        model.traverse((o) => {
          if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.material = o.material.clone(); entry.meshes.push(o); }
        });
        // muzzle flash at the -Z (barrel) tip, in holder space after scaling
        const muzzleZ = -(size.z * 0.5) * s - 0.03;
        const flash = makeFlash(new THREE.Vector3(0, 0.01, muzzleZ));
        holder.add(flash);
        holder.traverse((o) => { o.frustumCulled = false; });
        entry.flash = flash;
        entry.ready = true;
        applySkin(entry);
        if (currentKey === key) holder.visible = true;
      },
      undefined,
      (err) => { console.warn("gun model failed:", key, err); });
    return entry;
  }

  function show() {
    knife.group.visible = currentKey === "knife";
    for (const k of Object.keys(guns)) guns[k].group.visible = (k === currentKey && guns[k].ready);
  }

  // Expose AK skin swap (gold craft) — retints the rifle-category gun model.
  if (typeof window !== "undefined") {
    window.__PN_SET_AK_SKIN__ = (which) => {
      rifleSkin = which === "gold" ? "gold" : "black";
      for (const k of Object.keys(guns)) applySkin(guns[k]);
    };
  }

  return {
    // Accepts a weapon def; picks the model by def.vmModel and the pose
    // category by def.vm / def.id. Melee -> the procedural knife.
    setWeapon(def) {
      if (!def || def.mode === "melee" || def.id === "knife") { currentKey = "knife"; show(); return; }
      const category = def.vm || def.id || "rifle";
      const key = def.vmModel || "blaster-g";
      if (!guns[key]) buildGun(key, category === "pistol" ? "pistol" : "rifle");
      currentKey = key;
      show();
    },
    setBladeDrawn() {},
    setPose({ posX = 0, posY = 0, posZ = 0, rotX = 0, rotY = 0, rotZ = 0 }) {
      poseGroup.position.set(posX, posY, posZ);
      poseGroup.rotation.set(rotX, rotY, rotZ);
    },
    flash() {
      flashT = 0.06;
      const f = currentKey === "knife" ? null : (guns[currentKey] && guns[currentKey].flash);
      if (f) { f.visible = true; f.rotation.z = Math.random() * Math.PI; f.userData.mat.opacity = 1; }
    },
    tick(dt) {
      root.scale.x = camera.aspect / (16 / 9); // aspect-lock (16:9 reference)
      if (flashT > 0) {
        flashT -= dt;
        const f = currentKey === "knife" ? null : (guns[currentKey] && guns[currentKey].flash);
        if (f) {
          const k = Math.max(0, flashT / 0.06);
          f.userData.mat.opacity = k;
          f.scale.setScalar(0.8 + (1 - k) * 0.6);
          if (flashT <= 0) f.visible = false;
        }
      }
    },
  };
}
