import * as THREE from "three";

// Procedural first-person view-models with a real arm "skeleton": each weapon
// is gripped by hands, and each hand is connected back to a shoulder anchor
// (near the bottom of the screen) through an upper-arm + forearm segment with a
// bent elbow. Everything is plain geometry so the toonify pass can cel-shade and
// outline it. No external assets.

const metal = () => new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.42, metalness: 0.75 });
const polymer = () => new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.75, metalness: 0.15 });
const accent = () => new THREE.MeshStandardMaterial({ color: 0x6fd0ff, emissive: 0x2a90c0, emissiveIntensity: 0.85, roughness: 0.4 });
const steel = () => new THREE.MeshStandardMaterial({ color: 0xd2dae2, roughness: 0.22, metalness: 0.92 });
const gold = () => new THREE.MeshStandardMaterial({ color: 0xe0ab3c, roughness: 0.3, metalness: 0.95, emissive: 0x6b4a08, emissiveIntensity: 0.4 });
const ember = () => new THREE.MeshStandardMaterial({ color: 0xff5a3c, emissive: 0xff2a14, emissiveIntensity: 1.0, roughness: 0.4 });
const skin = () => new THREE.MeshStandardMaterial({ color: 0xe6b48c, roughness: 0.7, metalness: 0.0 });
const sleeve = () => new THREE.MeshStandardMaterial({ color: 0x39414e, roughness: 0.85, metalness: 0.1 });

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
function cyl(r, len, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}
// A cylinder kept on its natural Y axis (for vertical grips / handles).
function cylY(rTop, rBot, len, mat, x = 0, y = 0, z = 0, seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, seg), mat);
  m.position.set(x, y, z);
  return m;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const UP = new THREE.Vector3(0, 1, 0);
// A tapered bone spanning two points (a -> b), oriented along the segment.
function bone(a, b, rA, rB, mat) {
  const dir = b.clone().sub(a);
  const len = Math.max(1e-4, dir.length());
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rB, rA, len, 12), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, dir.multiplyScalar(1 / len));
  return m;
}
function joint(pos, r, mat) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat);
  m.position.copy(pos);
  return m;
}

// A skin-toned hand: palm, four 2-segment fingers curling forward over the
// grip, a thumb. Grip axis is local -Z (fingers curl that way); the wrist /
// arm attaches on the +Z side.
function hand() {
  const g = new THREE.Group();
  const sk = skin();
  g.add(box(0.085, 0.038, 0.095, sk, 0, 0, -0.01)); // back of hand / palm

  const xs = [-0.031, -0.011, 0.011, 0.031];
  const lens = [0.05, 0.056, 0.053, 0.046];
  xs.forEach((fx, i) => {
    const knuckle = box(0.017, 0.02, lens[i], sk, fx, 0.002, -0.07);
    knuckle.rotation.x = -0.55; // angle down over the front
    g.add(knuckle);
    const tip = box(0.016, 0.018, 0.03, sk, fx, -0.03, -0.095);
    tip.rotation.x = -1.15; // curl under (wrapping the grip)
    g.add(tip);
  });

  const thumb = box(0.021, 0.021, 0.052, sk, 0.05, 0.006, -0.02);
  thumb.rotation.z = 0.5;
  thumb.rotation.x = -0.35;
  g.add(thumb);
  return g;
}

function handAt(pos, rot) {
  const h = hand();
  h.position.copy(pos);
  h.rotation.set(rot[0], rot[1], rot[2] || 0);
  return h;
}

// Bones only (no hand): shoulder -> bent elbow -> wrist, plus a glowing cuff.
function armBones(wrist, shoulder, side, cuffRot) {
  const g = new THREE.Group();
  const elbow = shoulder.clone().lerp(wrist, 0.5).add(V(side * 0.08, -0.05, 0.02));
  g.add(bone(elbow, wrist, 0.05, 0.045, skin())); // forearm
  g.add(bone(shoulder, elbow, 0.075, 0.055, sleeve())); // upper arm (sleeved)
  g.add(joint(elbow, 0.052, sleeve())); // elbow pad
  g.add(joint(shoulder, 0.085, sleeve())); // shoulder / deltoid
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 18), accent());
  cuff.position.copy(wrist);
  if (cuffRot) cuff.rotation.copy(cuffRot);
  g.add(cuff);
  return g;
}

// A full arm: hand at `handPos/handRot`, connected back to `shoulder`.
export function buildArm(handPos, handRot, shoulder, side) {
  return arm(handPos, handRot, shoulder, side);
}
function arm(handPos, handRot, shoulder, side) {
  const g = new THREE.Group();
  const h = handAt(handPos, handRot);
  g.add(h);
  const wrist = handPos.clone().add(V(0, 0.01, 0.08)); // just behind the hand
  g.add(armBones(wrist, shoulder, side, h.rotation));
  return g;
}

// Shoulder anchors in weapon-group local space (the group is parented under the
// camera and offset toward bottom-right; these sit low + near the camera so the
// arms recede from the bottom corners up to the hands).
const SH_R = V(0.12, -0.46, 0.30);
const SH_L = V(-0.16, -0.44, 0.26);

// Soft radial glow texture for the muzzle flash (white-hot core -> orange).
function makeFlashTex() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const x = c.getContext("2d");
  const grd = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0.0, "rgba(255,255,238,1)");
  grd.addColorStop(0.22, "rgba(255,224,130,0.95)");
  grd.addColorStop(0.5, "rgba(255,148,48,0.55)");
  grd.addColorStop(1.0, "rgba(255,96,24,0)");
  x.fillStyle = grd;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const FLASH_TEX = makeFlashTex();

// Muzzle flash: additive glowing billboards (cross star + a forward streak),
// hidden until fired. A shared material drives the fade from the view-model.
export function makeFlash(pos) {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mat = new THREE.MeshBasicMaterial({
    map: FLASH_TEX,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const star = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), mat);
  g.add(star);
  const star2 = star.clone();
  star2.rotation.z = Math.PI / 4;
  g.add(star2);
  const streak = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.13), mat);
  streak.position.z = -0.14; // reach down the barrel
  g.add(streak);
  g.visible = false;
  g.userData.mat = mat;
  return g;
}

export function buildRifle() {
  const g = new THREE.Group();
  const mMetal = metal();
  const mPoly = polymer();
  const mSteel = steel();
  const mAccent = accent();

  // --- Receiver (main body) ---
  g.add(box(0.13, 0.155, 0.5, mMetal, 0, 0, -0.08)); // primary receiver (larger)
  g.add(box(0.11, 0.04, 0.48, mSteel, 0, 0.075, -0.08)); // top rail / mounting surface

  // --- Barrel assembly ---
  g.add(cyl(0.032, 0.56, mMetal, 0, 0.035, -0.54)); // barrel (thicker, longer)
  g.add(cyl(0.038, 0.08, mSteel, 0, 0.035, -0.82)); // muzzle brake
  g.add(cyl(0.055, 0.28, mPoly, 0, 0.035, -0.36)); // handguard / rail system

  // --- Handguard details ---
  for (let i = 0; i < 3; i++) {
    g.add(box(0.065, 0.008, 0.06, mMetal, 0, 0.06, -0.24 + i * 0.08)); // rail slots
  }

  // --- Gas tube above barrel ---
  g.add(cyl(0.016, 0.42, mMetal, 0, 0.09, -0.42));
  g.add(cyl(0.018, 0.04, mMetal, 0, 0.09, -0.78)); // gas block

  // --- Grip (ergonomic angle) ---
  const grip = box(0.082, 0.22, 0.11, mPoly, 0, -0.18, 0.06);
  grip.rotation.x = 0.38;
  g.add(grip);

  // --- Magazine (curved, larger) ---
  const mag = box(0.075, 0.29, 0.14, mMetal, 0, -0.24, -0.14);
  mag.rotation.x = -0.22;
  mag.rotation.z = 0.05;
  g.add(mag);
  g.add(box(0.069, 0.26, 0.08, new THREE.MeshStandardMaterial({ color: 0x1a1f28, roughness: 0.8 }), 0.001, -0.24, -0.12)); // mag shadow/texture

  // --- Stock ---
  g.add(box(0.09, 0.14, 0.28, mPoly, 0, -0.01, 0.28)); // stock body
  g.add(box(0.11, 0.038, 0.28, mAccent, 0, 0.09, 0.28)); // top cheek rest (accent glow)

  // --- Charging handle ---
  g.add(cyl(0.012, 0.04, mMetal, 0.06, 0.04, -0.1));
  g.add(box(0.024, 0.016, 0.016, mMetal, 0.065, 0.04, -0.1)); // charging handle knob

  // --- Sight/optic area ---
  g.add(box(0.032, 0.048, 0.06, mSteel, 0, 0.135, -0.06)); // front sight post
  g.add(box(0.038, 0.038, 0.08, mMetal, 0, 0.138, -0.26)); // rear sight / optic mount

  // --- Safety selector ---
  const selector = box(0.024, 0.06, 0.024, mAccent, -0.068, -0.04, -0.06);
  selector.rotation.z = 0.3;
  g.add(selector);

  // --- Trigger guard ---
  g.add(box(0.078, 0.042, 0.065, mMetal, 0, -0.11, 0.02));

  // --- Arms (properly positioned for ALT grip) ---
  g.add(arm(V(0.0, -0.13, 0.08), [-0.35, -0.08, 0], SH_R, 1)); // right hand on grip
  g.add(arm(V(0.0, 0.06, -0.34), [-1.15, 0.12, 0.08], SH_L, -1)); // left hand further forward

  const muzzle = V(0, 0.035, -0.86);
  const flash = makeFlash(muzzle);
  g.add(flash);
  return { group: g, muzzle, flash };
}

export function buildPistol() {
  const g = new THREE.Group();
  const mMetal = metal();
  const mPoly = polymer();
  const mSteel = steel();
  const mAccent = accent();

  // --- Slide (top, metallic) ---
  g.add(box(0.098, 0.108, 0.38, mMetal, 0, 0.024, -0.13)); // main slide body
  g.add(box(0.085, 0.035, 0.36, mSteel, 0, 0.065, -0.13)); // top surface (polished steel)

  // --- Slide serrations (rear) ---
  for (let i = 0; i < 2; i++) {
    g.add(box(0.088, 0.012, 0.015, new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.5 }), 0, 0.055, -0.05 + i * 0.025));
  }

  // --- Barrel visible under slide ---
  g.add(cyl(0.024, 0.14, mMetal, 0, 0.02, -0.32)); // barrel
  g.add(cyl(0.029, 0.034, mSteel, 0, 0.02, -0.38)); // muzzle

  // --- Frame (polymer body) ---
  g.add(box(0.088, 0.078, 0.34, mPoly, 0, -0.05, -0.1)); // frame grip section
  g.add(box(0.076, 0.048, 0.22, new THREE.MeshStandardMaterial({ color: 0x252a32, roughness: 0.8 }), 0, -0.045, -0.02)); // frame front

  // --- Trigger guard (enlarged) ---
  g.add(box(0.082, 0.05, 0.08, mMetal, 0, -0.075, 0.02));

  // --- Grip texture ---
  const grip = box(0.088, 0.22, 0.13, mPoly, 0, -0.18, 0.04);
  grip.rotation.x = 0.32;
  g.add(grip);
  g.add(box(0.084, 0.2, 0.048, new THREE.MeshStandardMaterial({ color: 0x1f2530, roughness: 0.9 }), -0.008, -0.18, 0.06)); // grip texture shadow

  // --- Hammer / Firing pin area ---
  g.add(box(0.06, 0.045, 0.045, mMetal, 0, 0.065, 0.14)); // hammer
  g.add(cyl(0.008, 0.024, mSteel, 0, 0.06, -0.02)); // firing pin

  // --- Safety selector ---
  g.add(box(0.018, 0.048, 0.024, mAccent, -0.052, 0.008, -0.02)); // left side safety

  // --- Night sights ---
  g.add(box(0.015, 0.035, 0.015, mAccent, 0, 0.095, -0.28)); // rear sight (accent)
  g.add(box(0.012, 0.032, 0.012, mAccent, 0, 0.095, 0.1)); // front sight (accent)

  // --- Magazine well indicator ---
  g.add(box(0.078, 0.012, 0.015, new THREE.MeshStandardMaterial({ color: 0xff6b35, roughness: 0.6 }), 0, -0.115, 0.0)); // orange indicator

  // --- Arms ---
  g.add(arm(V(0.01, -0.15, 0.06), [-0.42, -0.1, 0], SH_R, 1)); // right hand on grip
  g.add(arm(V(-0.062, -0.135, 0.02), [-0.48, 0.32, -0.1], SH_L, -1)); // left support hand

  const muzzle = V(0, 0.02, -0.42);
  const flash = makeFlash(muzzle);
  g.add(flash);
  return { group: g, muzzle, flash };
}

// CrossFire-style ornate dagger held one-handed: handle low, blade pointing
// up-right, always visible. Built pointing up (+Y) in `assembly`, then the
// whole assembly is tilted to read diagonally across the lower-right.
export function buildKnife() {
  const g = new THREE.Group();
  const assembly = new THREE.Group();
  g.add(assembly);

  // --- handle / guard / pommel (handle runs along -Y, blade up +Y) ---
  assembly.add(cylY(0.024, 0.028, 0.16, polymer(), 0, -0.11, 0)); // grip
  for (let i = 0; i < 3; i += 1) {
    assembly.add(cylY(0.029, 0.029, 0.012, gold(), 0, -0.16 + i * 0.05, 0)); // grip rings
  }
  assembly.add(joint(V(0, -0.2, 0), 0.034, gold())); // pommel
  assembly.add(box(0.14, 0.035, 0.055, gold(), 0, -0.02, 0)); // crossguard
  assembly.add(box(0.05, 0.03, 0.07, gold(), 0, -0.02, 0)); // guard centre block
  assembly.add(box(0.016, 0.016, 0.016, ember(), 0, -0.02, 0.04)); // gem on guard

  // --- blade (broad face toward +Z, single ornate edge) ---
  const blade = new THREE.Group();
  blade.add(box(0.06, 0.42, 0.016, steel(), 0, 0.21, 0)); // blade body
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.16, 4), steel());
  tip.position.set(0, 0.49, 0);
  tip.rotation.y = Math.PI / 4; // align the pyramid faces to the blade
  blade.add(tip);
  blade.add(box(0.014, 0.4, 0.006, ember(), 0.024, 0.2, 0.006)); // glowing edge line
  blade.add(box(0.012, 0.34, 0.005, ember(), 0, 0.2, 0.01)); // central fuller glow
  blade.add(box(0.03, 0.1, 0.012, gold(), 0, 0.06, 0.004)); // ornate ricasso etching
  assembly.add(blade);

  // tilt the whole knife to point up-right across the lower-right of the screen
  assembly.rotation.set(-0.32, 0.18, -0.62);
  assembly.position.set(0.05, -0.16, -0.04);
  // (no procedural hand — the CS arms from the AK model are attached in viewmodel.js)

  return { group: g, muzzle: V(0, 0, -1.0), blade: assembly };
}
