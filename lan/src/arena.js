import * as THREE from "three";
import { techFloor, techPanel, brushedMetal } from "./textures.js?v=260711002";

// A compact, symmetric 1v1 arena: bounded room, cover crates and pillars,
// two spawn points at opposite ends. No NPCs, no doors.
export function createArena(scene) {
  const ROOM = 18;
  const H = 8;

  scene.background = new THREE.Color(0x0a0f16);
  scene.fog = new THREE.Fog(0x0a0f16, 44, 110);

  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x35506a, 1.0));
  const key = new THREE.DirectionalLight(0xfff4e0, 2.4);
  key.position.set(10, 24, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1; key.shadow.camera.far = 80;
  key.shadow.camera.left = -30; key.shadow.camera.right = 30; key.shadow.camera.top = 30; key.shadow.camera.bottom = -30;
  scene.add(key);
  for (const [x, z, c] of [[-12, -12, 0x49c0ff], [12, 12, 0xff7a3c], [-12, 12, 0x6affc0], [12, -12, 0x49c0ff]]) {
    const l = new THREE.PointLight(c, 0.5, 30, 2); l.position.set(x, H - 1.2, z); scene.add(l);
  }

  const colliders = [];
  const solids = [];
  const extra = [];
  function add(mesh, asCollider) {
    mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); solids.push(mesh);
    if (asCollider) colliders.push(new THREE.Box3().setFromObject(mesh));
    return mesh;
  }
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };

  const floorTex = techFloor(); floorTex.repeat.set(12, 12);
  const wallTex = techPanel(); wallTex.repeat.set(6, 3);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.7, metalness: 0.2 });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.75, metalness: 0.25 });
  const crateMat = new THREE.MeshStandardMaterial({ map: brushedMetal("#586b82"), roughness: 0.5, metalness: 0.5 });
  const cyan = new THREE.MeshStandardMaterial({ color: 0x36c4ff, emissive: 0x36c4ff, emissiveIntensity: 0.8, roughness: 0.4 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xff8a3c, emissive: 0xff7a2c, emissiveIntensity: 0.8, roughness: 0.4 });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(ROOM * 2, 0.2, ROOM * 2), floorMat);
  floor.position.y = -0.1; floor.receiveShadow = true; scene.add(floor); solids.push(floor);
  scene.add(box(ROOM * 2, 0.3, ROOM * 2, wallMat, 0, H, 0));
  add(box(ROOM * 2, H, 0.6, wallMat, 0, H / 2, -ROOM), true);
  add(box(ROOM * 2, H, 0.6, wallMat, 0, H / 2, ROOM), true);
  add(box(0.6, H, ROOM * 2, wallMat, -ROOM, H / 2, 0), true);
  add(box(0.6, H, ROOM * 2, wallMat, ROOM, H / 2, 0), true);
  // centre line + accents
  scene.add(box(0.18, 0.03, ROOM * 2, cyan, 0, 0.02, 0));
  scene.add(box(ROOM * 2, 0.03, 0.18, orange, 0, 0.02, 0));
  // symmetric cover crates
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6], [0, -10], [0, 10], [-11, 0], [11, 0]]) {
    add(box(2, 1.4, 2, crateMat, x, 0.7, z), true);
    scene.add(box(2.06, 0.08, 2.06, cyan, x, 1.45, z));
  }
  // central platform + corner pillars
  add(box(5, 0.6, 5, crateMat, 0, 0.3, 0), true);
  scene.add(box(5.1, 0.06, 5.1, orange, 0, 0.62, 0));
  for (const [sx, sz] of [[-8, -8], [8, 8], [-8, 8], [8, -8]]) add(box(0.9, H - 1, 0.9, wallMat, sx, (H - 1) / 2, sz), true);

  const spawns = [
    { pos: new THREE.Vector3(0, 0, -15), yaw: 0 },
    { pos: new THREE.Vector3(0, 0, 15), yaw: Math.PI },
  ];
  // spawn markers
  const m1 = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.3, 36), cyan); m1.rotation.x = -Math.PI / 2; m1.position.set(0, 0.04, -15); scene.add(m1);
  const m2 = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.3, 36), orange); m2.rotation.x = -Math.PI / 2; m2.position.set(0, 0.04, 15); scene.add(m2);

  // ammo stations (press E to resupply) at the four corners
  const interactables = [];
  function ammoStation(x, z) {
    add(box(1.0, 0.7, 0.7, crateMat, x, 0.35, z), true);
    scene.add(box(1.04, 0.1, 0.74, orange, x, 0.72, z));
    interactables.push({ name: "弹药补给", action: "ammo", pos: new THREE.Vector3(x, 0, z), radius: 2.2 });
  }
  ammoStation(-14, -14); ammoStation(14, 14); ammoStation(14, -14); ammoStation(-14, 14);

  const state = { time: 0 };
  function getHittables() { return solids.concat(extra); }
  function addHittable(m) { extra.push(m); }
  function update(dt) { state.time += dt; }

  return { ROOM, colliders, solids, state, spawns, interactables, getHittables, addHittable, update };
}

// A simple opponent avatar (soldier holding a rifle) + a name tag.
export function buildAvatar(color = 0xff5a5a) {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
  const plate = new THREE.MeshStandardMaterial({ color: 0x2a323c, roughness: 0.45, metalness: 0.5 });
  const gun = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.5, metalness: 0.7 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.44, 6, 14), suit); torso.position.y = 1.3;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), plate); head.position.y = 1.86;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), new THREE.MeshStandardMaterial({ color: 0x6fd0ff, emissive: 0x2a90c0, emissiveIntensity: 0.8 }));
  visor.position.set(0, 1.86, 0.12); visor.scale.set(1, 0.55, 0.6);
  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.55, 5, 10), suit); legL.position.set(-0.15, 0.45, 0);
  const legR = legL.clone(); legR.position.x = 0.15;
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.42, 5, 10), suit); armL.position.set(-0.4, 1.18, 0.1);
  const armR = armL.clone(); armR.position.set(0.32, 1.2, 0.28);
  const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.95), gun); rifle.position.set(0.25, 1.2, 0.45);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe7a0, transparent: true, opacity: 0 }));
  muzzle.position.set(0.25, 1.2, 0.95);
  for (const p of [torso, head, visor, legL, legR, armL, armR, rifle]) { p.castShadow = true; g.add(p); }
  g.add(muzzle);
  // hit box (invisible) used for raycast
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.9, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 1.0;
  g.add(hit);
  return { group: g, hit, muzzle };
}
