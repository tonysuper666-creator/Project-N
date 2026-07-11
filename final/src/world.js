import * as THREE from "three";
import { techPanel, techFloor, hazardStripes, brushedMetal, holoScreen } from "./textures.js?v=260711001";
import { rollLoot, ITEM_DB, RARITY_COLOR } from "./inventory.js?v=260711001";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { audio } from "./audio.js?v=260711001";
import { loadCharacter, makeCharacter, characterReady } from "./character.js?v=260711001";

// Futuristic command-hub base. Uses beveled extruded panels, polygonal
// columns, a lathed dome, trusses, light coves and energy conduits instead
// of plain slabs, so it reads as designed sci-fi architecture rather than a
// metal box. Materials are MeshStandard (the toonify pass cel-shades them).
export function createWorld(scene, hooks = {}) {
  const ROOM = 16;
  const HEIGHT = 7.5;

  // Start downloading the rigged enemy model now so it's ready by deploy time.
  loadCharacter().catch(() => {}); // falls back to procedural soldiers if it fails

  scene.background = new THREE.Color(0x0c1622);
  scene.fog = new THREE.Fog(0x0c1622, 36, 92);

  // --- Lighting --------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x35506a, 1.1);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff4e0, 2.8); // sun
  key.position.set(8, 20, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 70;
  key.shadow.camera.left = -28;
  key.shadow.camera.right = 28;
  key.shadow.camera.top = 28;
  key.shadow.camera.bottom = -28;
  scene.add(key);
  scene.add(key.target);
  for (const [lx, lz, col] of [[-9, -4, 0x59c8ff], [9, -4, 0xffac4d], [0, 8, 0x59c8ff], [0, -10, 0x6affc0]]) {
    const lamp = new THREE.PointLight(col, 0.28, 22, 2);
    lamp.position.set(lx, HEIGHT - 1.0, lz);
    scene.add(lamp);
  }

  // --- Textures + materials --------------------------------------------
  const floorTex = techFloor();
  floorTex.repeat.set(10, 10);
  const wallTex = techPanel();
  wallTex.repeat.set(4, 2);
  const ceilTex = brushedMetal("#26323f");
  ceilTex.repeat.set(8, 8);
  const metalTex = brushedMetal("#4a5e76");
  const hazardTex = hazardStripes();
  hazardTex.repeat.set(4, 1);

  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.7, metalness: 0.2 });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.75, metalness: 0.2 });
  const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.8, metalness: 0.2 });
  const panelMat = new THREE.MeshStandardMaterial({ map: metalTex, roughness: 0.45, metalness: 0.4 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x232c38, roughness: 0.6, metalness: 0.4 });
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.6, metalness: 0.2 });
  const cyan = new THREE.MeshStandardMaterial({ color: 0x36c4ff, emissive: 0x36c4ff, emissiveIntensity: 0.7, roughness: 0.4 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xff9a3c, emissive: 0xff8a2c, emissiveIntensity: 0.7, roughness: 0.4 });
  const mint = new THREE.MeshStandardMaterial({ color: 0x46ffb0, emissive: 0x40f0a0, emissiveIntensity: 0.65, roughness: 0.4 });
  const field = new THREE.MeshStandardMaterial({ color: 0x49c0ff, emissive: 0x49c0ff, emissiveIntensity: 0.7, transparent: true, opacity: 0.28, roughness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x8fd8ff, emissive: 0x3aa0e0, emissiveIntensity: 0.4, transparent: true, opacity: 0.22, roughness: 0.2 });

  const colliders = [];
  const solids = [];
  const interactables = [];
  const decor = [];

  function add(mesh, asCollider) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    solids.push(mesh);
    if (asCollider) colliders.push(new THREE.Box3().setFromObject(mesh));
    return mesh;
  }
  const place = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  const boxMesh = (w, h, d, mat, x, y, z) => place(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), x, y, z);
  const col = (r, h, mat, x, y, z, seg = 24, axis = "y") => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
    if (axis === "x") m.rotation.z = Math.PI / 2;
    if (axis === "z") m.rotation.x = Math.PI / 2;
    return place(m, x, y, z);
  };
  const torus = (r, tube, mat, x, y, z) => place(new THREE.Mesh(new THREE.TorusGeometry(r, tube, 12, 40), mat), x, y, z);
  const sphere = (r, mat, x, y, z) => place(new THREE.Mesh(new THREE.SphereGeometry(r, 22, 16), mat), x, y, z);

  // Beveled extruded panel (chamfered slab) — the key "designed" detail.
  function bevelPanel(w, h, depth, mat) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -h / 2);
    s.lineTo(w / 2, -h / 2);
    s.lineTo(w / 2, h / 2);
    s.lineTo(-w / 2, h / 2);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.07, bevelSegments: 2, steps: 1 });
    geo.center();
    return new THREE.Mesh(geo, mat);
  }

  // Angled-screen console (extruded wedge profile).
  function console(width, mat) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.75, 0);
    s.lineTo(0.75, 0.82);
    s.lineTo(0.12, 1.12);
    s.lineTo(0, 1.12);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
    geo.center();
    return new THREE.Mesh(geo, mat);
  }

  // Lathed half-dome (ceiling skylight / holo dome).
  function dome(radius, height, mat) {
    const pts = [];
    const seg = 14;
    for (let i = 0; i <= seg; i += 1) {
      const a = (i / seg) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.cos(a) * radius, Math.sin(a) * height));
    }
    return new THREE.Mesh(new THREE.LatheGeometry(pts, 36), mat);
  }

  // ---------------------------------------------------------------------
  // FLOOR — tiered: outer floor, raised border ring, glowing inlays.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(ROOM * 2, 0.2, ROOM * 2), floorMat);
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  scene.add(floor);
  solids.push(floor);
  // glowing inlay lines down the central axis + cross rings
  for (const gx of [-6, 0, 6]) scene.add(boxMesh(0.14, 0.03, ROOM * 1.7, cyan, gx, 0.02, 0));
  scene.add(place(new THREE.Mesh(new THREE.RingGeometry(3.0, 3.2, 48), cyan), 0, 0.04, 0).rotateX(-Math.PI / 2));
  scene.add(place(new THREE.Mesh(new THREE.RingGeometry(3.5, 3.62, 48), mint), 0, 0.04, 0).rotateX(-Math.PI / 2));

  // CEILING — recessed dark deck with glowing light panels + trusses.
  scene.add(boxMesh(ROOM * 2, 0.3, ROOM * 2, ceilMat, 0, HEIGHT, 0));
  for (let gx = -ROOM + 4; gx <= ROOM - 4; gx += 8) {
    for (let gz = -ROOM + 4; gz <= ROOM - 4; gz += 8) {
      scene.add(boxMesh(2.6, 0.08, 2.6, cyan, gx, HEIGHT - 0.32, gz)); // recessed light panel
    }
  }
  // ceiling trusses (cross beams)
  for (let gx = -ROOM + 5; gx <= ROOM - 5; gx += 6) scene.add(boxMesh(0.25, 0.4, ROOM * 2, darkMat, gx, HEIGHT - 0.5, 0));
  for (let gz = -ROOM + 5; gz <= ROOM - 5; gz += 6) scene.add(boxMesh(ROOM * 2, 0.25, 0.4, darkMat, 0, HEIGHT - 0.85, gz));
  // central holo dome
  const dm = dome(4.5, 1.6, glass);
  place(dm, 0, HEIGHT - 0.15, 0);
  scene.add(dm);
  scene.add(torus(4.5, 0.08, cyan, 0, HEIGHT - 0.12, 0).rotateX(Math.PI / 2));

  // ---------------------------------------------------------------------
  // WALLS — structural slab (collider) + layered cladding per wall.
  const wallDefs = [
    { axis: "x", pos: -ROOM, inward: 1, len: ROOM * 2 }, // back (-z)
    { axis: "x", pos: ROOM, inward: -1, len: ROOM * 2 }, // front (+z)
    { axis: "z", pos: -ROOM, inward: 1, len: ROOM * 2 }, // left (-x)
    { axis: "z", pos: ROOM, inward: -1, len: ROOM * 2 }, // right (+x)
  ];

  function wallPoint(def, u, depth, y) {
    if (def.axis === "x") return [u, y, def.pos + def.inward * depth];
    return [def.pos + def.inward * depth, y, u];
  }
  function faceYawInto(def) {
    if (def.axis === "x") return def.inward > 0 ? 0 : Math.PI;
    return def.inward > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  for (const def of wallDefs) {
    // structural slab
    if (def.axis === "x") add(boxMesh(def.len, HEIGHT, 0.6, wallMat, 0, HEIGHT / 2, def.pos), true);
    else add(boxMesh(0.6, HEIGHT, def.len, wallMat, def.pos, HEIGHT / 2, 0), true);

    const yaw = faceYawInto(def);
    // recessed beveled panels + vertical light pilasters along the wall
    for (let u = -ROOM + 3; u <= ROOM - 3; u += 6) {
      const [px, , pz] = wallPoint(def, u, 0.25, HEIGHT / 2 + 0.2);
      const panel = bevelPanel(4.2, HEIGHT - 1.6, 0.2, panelMat);
      panel.rotation.y = yaw;
      scene.add(place(panel, px, HEIGHT / 2 + 0.2, pz));
      // pilaster between panels
      const [lx, , lz] = wallPoint(def, u + 3, 0.34, HEIGHT / 2);
      scene.add(col(0.08, HEIGHT - 1.2, cyan, lx, HEIGHT / 2, lz));
    }
    // canted skirt at the base (angled lower wall)
    const [sx, , sz] = wallPoint(def, 0, 0.55, 0.55);
    const skirt = boxMesh(def.axis === "x" ? def.len : 0.5, 1.2, def.axis === "x" ? 0.5 : def.len, panelMat, sx, 0.55, sz);
    if (def.axis === "x") skirt.rotation.x = def.inward * 0.35;
    else skirt.rotation.z = -def.inward * 0.35;
    scene.add(skirt);
    // top + bottom light coves
    const [tx, , tz] = wallPoint(def, 0, 0.45, HEIGHT - 0.5);
    scene.add(boxMesh(def.axis === "x" ? def.len - 1 : 0.12, 0.1, def.axis === "x" ? 0.12 : def.len - 1, cyan, tx, HEIGHT - 0.5, tz));
    const [bx, , bz] = wallPoint(def, 0, 0.5, 0.12);
    scene.add(boxMesh(def.axis === "x" ? def.len - 1 : 0.1, 0.08, def.axis === "x" ? 0.1 : def.len - 1, cyan, bx, 0.12, bz));
  }

  // Angled corner panels (cut the boxy corners) + collider.
  for (const [cx, cz, ry] of [[-ROOM, -ROOM, Math.PI / 4], [ROOM, -ROOM, -Math.PI / 4], [-ROOM, ROOM, -Math.PI / 4], [ROOM, ROOM, Math.PI / 4]]) {
    const p = bevelPanel(3.8, HEIGHT, 0.4, panelMat);
    p.rotation.y = ry;
    place(p, cx - Math.sign(cx) * 1.3, HEIGHT / 2, cz - Math.sign(cz) * 1.3);
    add(p, true);
    scene.add(col(0.1, HEIGHT, cyan, cx - Math.sign(cx) * 1.9, HEIGHT / 2, cz - Math.sign(cz) * 1.9));
  }

  // ---------------------------------------------------------------------
  // HEX COLUMNS with tapered glowing capitals + energy collars.
  for (const [hx, hz] of [[-7, 2], [7, 2], [-7, -10], [7, -10]]) {
    add(col(0.55, HEIGHT - 0.6, panelMat, hx, (HEIGHT - 0.6) / 2, hz, 6), true);
    scene.add(col(0.7, 0.4, darkMat, hx, 0.2, hz, 6)); // base
    scene.add(col(0.7, 0.4, darkMat, hx, HEIGHT - 0.6, hz, 6)); // capital
    scene.add(torus(0.62, 0.06, cyan, hx, 1.4, hz).rotateX(Math.PI / 2));
    scene.add(torus(0.62, 0.06, cyan, hx, HEIGHT - 1.4, hz).rotateX(Math.PI / 2));
    scene.add(col(0.06, HEIGHT - 1.2, cyan, hx, HEIGHT / 2, hz)); // glowing core seam
  }

  // --- Holo label + capsule operator -----------------------------------
  function makeLabel(text, color = "#7fd1ff") {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 64;
    const x = c.getContext("2d");
    x.fillStyle = "rgba(8,20,30,0.55)"; x.fillRect(0, 0, 256, 64);
    x.strokeStyle = color; x.lineWidth = 2; x.strokeRect(3, 3, 250, 58);
    x.fillStyle = color; x.fillRect(3, 3, 6, 58);
    x.font = "bold 30px system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(text, 132, 34);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
    sp.scale.set(1.9, 0.48, 1);
    return sp;
  }

  function makeOperator(x, z, faceYaw, suitColor, visorMat, labelText, labelColor) {
    const g = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: suitColor, roughness: 0.5, metalness: 0.3 });
    const plate = new THREE.MeshStandardMaterial({ color: 0x2a323c, roughness: 0.45, metalness: 0.45 });
    const torsoM = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.42, 6, 14), suit); torsoM.position.y = 1.3;
    const chestPlate = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.2, 4, 10), plate); chestPlate.position.set(0, 1.34, 0.16); chestPlate.scale.set(1, 1, 0.5);
    const head = sphere(0.2, plate, 0, 1.86, 0);
    const visor = sphere(0.14, visorMat, 0, 1.86, 0.1); visor.scale.set(1, 0.55, 0.6);
    const shoulderL = sphere(0.16, plate, -0.34, 1.5, 0);
    const shoulderR = sphere(0.16, plate, 0.34, 1.5, 0);
    const limb = (r, len, px, py) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, 10), suit); m.position.set(px, py, 0); return m; };
    for (const part of [torsoM, chestPlate, head, visor, shoulderL, shoulderR, limb(0.085, 0.42, -0.4, 1.18), limb(0.085, 0.42, 0.4, 1.18), limb(0.12, 0.5, -0.15, 0.45), limb(0.12, 0.5, 0.15, 0.45)]) {
      part.castShadow = true; g.add(part);
    }
    g.position.set(x, 0, z); g.rotation.y = faceYaw; scene.add(g);
    solids.push(torsoM, head);
    const label = makeLabel(labelText, labelColor); label.position.set(x, 2.45, z); scene.add(label);
  }

  // ---------------------------------------------------------------------
  // VENDOR alcove (left wall) — recessed frame, wedge console, holo, NPC.
  function station(side, screenTitle, accent, labelText, labelColor, name, action) {
    const wx = side * (ROOM - 0.7);
    const z = -2;
    const yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    // alcove back-lit recess
    scene.add(place(bevelPanel(5, HEIGHT - 1.4, 0.3, darkMat).rotateY(yaw), wx + side * -0.05, HEIGHT / 2, z));
    scene.add(boxMesh(0.12, 0.1, 5, accent, wx - side * 0.4, HEIGHT - 0.9, z)); // overhead cove
    // wedge console
    const cons = console(3.0);
    cons.rotation.y = yaw;
    add(place(cons, wx - side * 1.0, 0.0, z), true);
    // holo screen on the angled face
    const scr = holoScreen(screenTitle, 4, labelColor);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.0), new THREE.MeshStandardMaterial({ map: scr, emissiveMap: scr, emissive: 0xffffff, emissiveIntensity: 1.1, color: 0x0a1622, side: THREE.DoubleSide }));
    screen.rotation.y = yaw;
    place(screen, wx - side * 1.0, 1.15, z);
    scene.add(screen);
    scene.add(torus(0.9, 0.05, accent, wx - side * 1.0, 1.15, z).rotateY(yaw));
    makeOperator(wx - side * 1.7, z + 1.6, yaw, side > 0 ? 0xc06a1f : 0x2f7fb0, accent, labelText, labelColor);
    interactables.push({ name, action, pos: new THREE.Vector3(wx - side * 2.4, 0, z), radius: 3 });
  }
  station(-1, "ARMORY", cyan, "商人 · 军械", "#7fe0ff", "商人 · 装备售卖", "vendor");
  station(1, "MISSIONS", orange, "任务官 · 行动", "#ffc070", "任务官 · 任务接取", "mission");

  // ---------------------------------------------------------------------
  // DEPLOY PORTAL (far wall) — layered beveled frame + energy field.
  scene.add(place(bevelPanel(6.5, 6.0, 0.5, panelMat), 0, 3.0, -ROOM + 0.4));
  scene.add(place(bevelPanel(5.2, 5.0, 0.4, darkMat), 0, 2.7, -ROOM + 0.6));
  // arched header
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.5, 28, 1, false, 0, Math.PI), panelMat);
  arch.rotation.z = Math.PI; arch.rotation.x = Math.PI / 2;
  add(place(arch, 0, 5.0, -ROOM + 0.45), false);
  scene.add(place(col(2.4, 0.5, hazardMat, 0, 5.0, -ROOM + 0.4, 28, "z"), false));
  // energy field
  const fieldMesh = boxMesh(3.4, 4.2, 0.12, field, 0, 2.4, -ROOM + 0.75);
  scene.add(fieldMesh);
  solids.push(fieldMesh);
  // chevrons + glowing frame
  for (const sgn of [-1, 1]) scene.add(col(0.1, 4.2, orange, sgn * 1.8, 2.4, -ROOM + 0.7));
  scene.add(boxMesh(3.8, 0.12, 0.2, orange, 0, 4.6, -ROOM + 0.7));
  const doorScreen = holoScreen("DEPLOY", 3, "#ffd23f");
  scene.add(boxMesh(1.6, 0.6, 0.05, new THREE.MeshStandardMaterial({ map: doorScreen, emissiveMap: doorScreen, emissive: 0xffffff, emissiveIntensity: 1.1, color: 0x0a1018 }), 0, 0.9, -ROOM + 0.85));
  const doorRing = torus(2.0, 0.08, orange, 0, 2.4, -ROOM + 0.9);
  scene.add(doorRing);
  decor.push({ mesh: doorRing, spin: 0.5 });
  const doorLabel = makeLabel("部署门 · 选择副本", "#ffd23f");
  doorLabel.position.set(0, 5.9, -ROOM + 0.9);
  scene.add(doorLabel);
  interactables.push({ name: "部署门 · 选择副本", action: "deploy", pos: new THREE.Vector3(0, 0, -ROOM + 2.6), radius: 3.5 });

  // ---------------------------------------------------------------------
  // CENTRAL HOLO PROJECTOR (off the main walkway) + rotating rings.
  const PX = 0, PZ = 0;
  add(col(1.3, 0.25, darkMat, PX, 0.12, PZ, 8), true); // octagonal dais
  scene.add(col(1.1, 0.08, cyan, PX, 0.27, PZ, 8));
  scene.add(col(0.12, 1.6, cyan, PX, 1.0, PZ));
  const holoBall = sphere(0.5, glass, PX, 2.0, PZ);
  scene.add(holoBall);
  decor.push({ mesh: holoBall, spin: 0.4, axis: "y" });
  const ring1 = torus(0.9, 0.04, mint, PX, 1.7, PZ);
  const ring2 = torus(1.15, 0.04, cyan, PX, 1.7, PZ); ring2.rotation.x = Math.PI / 2;
  scene.add(ring1, ring2);
  decor.push({ mesh: ring1, spin: 0.7 }, { mesh: ring2, spin: -0.5, axis: "y" });

  // supply props: hex canisters with glowing collars
  for (const [x, z, m] of [[-12.5, 9, cyan], [-11, 10.5, orange], [12.5, 9, mint], [11, 10.5, cyan]]) {
    add(col(0.55, 1.5, panelMat, x, 0.75, z, 6), true);
    scene.add(torus(0.56, 0.05, m, x, 1.2, z).rotateX(Math.PI / 2));
    scene.add(torus(0.56, 0.05, m, x, 0.45, z).rotateX(Math.PI / 2));
  }

  // AMMO stations — walk up and press E to resupply.
  function ammoStation(x, z) {
    add(boxMesh(1.0, 0.7, 0.7, hazardMat, x, 0.35, z), true);
    scene.add(boxMesh(1.04, 0.1, 0.74, orange, x, 0.72, z));
    const lbl = makeLabel("弹药补给 [E]", "#ffd23f");
    lbl.position.set(x, 1.4, z);
    scene.add(lbl);
    interactables.push({ name: "弹药补给", action: "ammo", pos: new THREE.Vector3(x, 0, z), radius: 2.2 });
  }
  ammoStation(-13, 5);
  ammoStation(13, 5);

  // ---------------------------------------------------------------------
  // BASE DETAIL PASS — lockers, weapon rack, pipes, crate stacks, screens.
  // Locker row along the back wall (one shared collider strip).
  for (let i = 0; i < 5; i += 1) {
    const lx = -12.5 + i * 1.15;
    scene.add(boxMesh(1.0, 2.0, 0.5, panelMat, lx, 1.0, ROOM - 0.85));
    scene.add(boxMesh(0.04, 1.7, 0.06, cyan, lx + 0.38, 1.0, ROOM - 1.12));
    scene.add(boxMesh(0.5, 0.06, 0.04, darkMat, lx, 1.75, ROOM - 1.12));
  }
  colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(-10.2, 1, ROOM - 0.85), new THREE.Vector3(6.2, 2, 0.6)));
  // Weapon rack (right wall): frame + three stylised rifles.
  const rackX = ROOM - 0.95;
  scene.add(place(bevelPanel(3.2, 2.2, 0.18, darkMat).rotateY(-Math.PI / 2), rackX, 1.5, 3.5));
  for (let i = 0; i < 3; i += 1) {
    const gz = 2.6 + i * 0.9;
    const body = boxMesh(0.12, 0.16, 0.9, panelMat, rackX - 0.18, 1.5, gz);
    body.rotation.x = -0.5;
    scene.add(body);
    const barrel = col(0.03, 0.5, darkMat, rackX - 0.18, 1.85, gz + 0.28, 8);
    barrel.rotation.x = 1.07;
    scene.add(barrel);
  }
  scene.add(boxMesh(0.06, 0.06, 2.9, orange, rackX - 0.3, 0.6, 3.5));
  // Ceiling pipe runs with glowing collars.
  for (const pz of [-6, 6]) {
    scene.add(col(0.14, ROOM * 2 - 2, panelMat, 0, HEIGHT - 1.15, pz, 10, "x"));
    for (const px of [-9, 0, 9]) scene.add(torus(0.2, 0.05, cyan, px, HEIGHT - 1.15, pz).rotateY(Math.PI / 2));
  }
  // Crate stacks near the deploy door corners.
  for (const [cx2, cz2] of [[-5.5, -ROOM + 2.2], [5.5, -ROOM + 2.2]]) {
    add(boxMesh(1.15, 1.05, 1.15, hazardMat, cx2, 0.52, cz2), true);
    scene.add(boxMesh(0.95, 0.85, 0.95, panelMat, cx2 + 0.35, 1.45, cz2 - 0.1));
    scene.add(boxMesh(0.05, 0.05, 1.17, mint, cx2, 1.07, cz2));
  }
  // Extra wall status screens (emissive holo panels).
  for (const [sx2, sz2, yaw2, title2, col2] of [[-ROOM + 0.72, 8, Math.PI / 2, "SYSTEMS", "#7fe0ff"], [ROOM - 0.72, -8, -Math.PI / 2, "AREA STATUS", "#8effb0"]]) {
    const scr2 = holoScreen(title2, 4, col2);
    const panel2 = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshStandardMaterial({ map: scr2, emissiveMap: scr2, emissive: 0xffffff, emissiveIntensity: 1.0, color: 0x0a1622 }));
    panel2.rotation.y = yaw2;
    place(panel2, sx2, 3.4, sz2);
    scene.add(panel2);
  }
  // Soft spotlights over the two station alcoves.
  for (const sx3 of [-1, 1]) {
    const spot = new THREE.SpotLight(0xbfe4ff, 6, 14, 0.5, 0.5, 1.4);
    spot.position.set(sx3 * (ROOM - 2.5), HEIGHT - 0.6, -2);
    spot.target.position.set(sx3 * (ROOM - 1.5), 0.8, -2);
    scene.add(spot);
    scene.add(spot.target);
  }

  // ---------------------------------------------------------------------
  // TRAINING RANGE (behind spawn).
  const TARGET_HP = 30;
  const RESPAWN_DELAY = 1.5;
  const targetGeo = new THREE.OctahedronGeometry(0.55, 0);
  const targets = [];
  add(boxMesh(12, 0.8, 0.5, panelMat, 0, 0.4, 11.5), true);
  scene.add(boxMesh(12, 0.1, 0.55, cyan, 0, 0.82, 11.5));
  const rangeLabel = makeLabel("训练靶场", "#8effb0");
  rangeLabel.position.set(0, 3.2, 14.5);
  scene.add(rangeLabel);
  const trainSpots = [[-4, 13], [0, 13.6], [4, 13]];
  for (let i = 0; i < trainSpots.length; i += 1) {
    const [tx, tz] = trainSpots[i];
    const mat = new THREE.MeshStandardMaterial({ color: 0xff5a3c, emissive: 0xff6a44, emissiveIntensity: 0.9, roughness: 0.4 });
    const mesh = new THREE.Mesh(targetGeo, mat);
    mesh.castShadow = true;
    mesh.position.set(tx, 1.6, tz);
    mesh.userData = { type: "target", health: TARGET_HP, maxHealth: TARGET_HP, alive: true, baseY: 1.6, home: new THREE.Vector3(tx, 1.6, tz), phase: i * 1.7, hitFlash: 0, respawnAt: 0 };
    scene.add(mesh);
    targets.push(mesh);
  }

  // =====================================================================
  // AREA 1 — procedural FOREST (built far away; player teleports in).
  const AX = 260; // x offset of the area region from the base
  const FH = 55; // forest half-extent
  const areaSpawn = new THREE.Vector3(AX, 0, 0);
  const baseSpawn = new THREE.Vector3(0, 0, 9);
  const areaHalfX = FH;
  const areaHalfZ = FH;
  const enemies = [];
  const loot = [];

  // store the base atmosphere so we can swap to a forest sky on deploy
  const baseFog = scene.fog;
  const baseBg = scene.background;
  const forestFog = new THREE.Fog(0xc3d8cf, 22, 98);
  const forestBg = (() => {
    const c = document.createElement("canvas"); c.width = 8; c.height = 256;
    const x = c.getContext("2d"); const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#5e93c8"); g.addColorStop(0.55, "#9fc2d6"); g.addColorStop(1, "#ccd9cf");
    x.fillStyle = g; x.fillRect(0, 0, 8, 256);
    return new THREE.CanvasTexture(c);
  })();
  // all forest geometry lives in this group so it can be hidden (not rendered)
  // while the player is back in the base.
  const areaGroup = new THREE.Group();
  areaGroup.visible = false;
  scene.add(areaGroup);

  // --- Area 1 layout: points of interest (positions relative to AX) -------
  const POI = {
    compound: { x: 22, z: -20, w: 22, d: 18 }, // ruined outpost
    pod: { x: -26, z: 18, r: 8 }, // crashed drop pod
    pond: { x: -12, z: -28, rx: 7, rz: 5 },
  };
  // keep spawn/extract clearings and POI footprints free of vegetation
  function isBlockedRel(ex, ez) {
    if (Math.hypot(ex, ez) < 6) return true; // spawn clearing
    if (Math.hypot(ex, ez - 8) < 3.5) return true; // extract pad
    const c = POI.compound;
    if (ex > c.x - c.w / 2 - 1.5 && ex < c.x + c.w / 2 + 1.5 && ez > c.z - c.d / 2 - 1.5 && ez < c.z + c.d / 2 + 1.5) return true;
    if (Math.hypot(ex - POI.pod.x, ez - POI.pod.z) < POI.pod.r) return true;
    if (Math.hypot((ex - POI.pond.x) / POI.pond.rx, (ez - POI.pond.z) / POI.pond.rz) < 1.35) return true;
    return false;
  }

  // --- supply crates: openable once per run, burst into loot --------------
  const supplyCrates = [];
  function makeSupplyCrate(ex, ez, id) {
    const seamMat = new THREE.MeshStandardMaterial({ color: 0x46ffb0, emissive: 0x40f0a0, emissiveIntensity: 0.9, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.66, 0.75), new THREE.MeshStandardMaterial({ color: 0x2c343e, roughness: 0.5, metalness: 0.5 }));
    body.position.set(AX + ex, 0.33, ez);
    body.castShadow = true; body.receiveShadow = true;
    areaGroup.add(body); solids.push(body);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.99, 0.05, 0.79), seamMat);
    seam.position.set(AX + ex, 0.52, ez);
    areaGroup.add(seam);
    const lbl = makeLabel("补给箱 [E]", "#8effb0");
    lbl.position.set(AX + ex, 1.5, ez);
    areaGroup.add(lbl);
    supplyCrates.push({ id, opened: false, seamMat, pos: new THREE.Vector3(AX + ex, 0, ez) });
    interactables.push({ name: "补给箱", action: "supply", id, pos: new THREE.Vector3(AX + ex, 0, ez), radius: 2.4 });
  }
  // Open a crate (once per run). Spawns a burst of loot orbs; false if empty.
  function openSupplyCrate(id) {
    const c = supplyCrates.find((s) => s.id === id);
    if (!c || c.opened) return false;
    c.opened = true;
    c.seamMat.emissiveIntensity = 0.05;
    for (let i = 0; i < 3; i += 1) {
      spawnLoot({ x: c.pos.x + (Math.random() - 0.5) * 2, z: c.pos.z + 1 + Math.random() });
    }
    return true;
  }

  function grassTexture() {
    const c = document.createElement("canvas"); c.width = 256; c.height = 256;
    const x = c.getContext("2d");
    x.fillStyle = "#557f3a"; x.fillRect(0, 0, 256, 256);
    // mottled moss/dry patches for large-scale variation
    for (let i = 0; i < 26; i += 1) {
      const g = x.createRadialGradient(Math.random() * 256, Math.random() * 256, 4, Math.random() * 256, Math.random() * 256, 26 + Math.random() * 40);
      const dry = Math.random() < 0.4;
      g.addColorStop(0, dry ? "rgba(122,124,58,0.35)" : "rgba(60,104,44,0.4)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    }
    for (let i = 0; i < 5200; i += 1) {
      const g = 90 + Math.random() * 70;
      x.fillStyle = `rgba(${50 + Math.random() * 40 | 0},${g | 0},${45 + Math.random() * 35 | 0},0.5)`;
      x.fillRect(Math.random() * 256, Math.random() * 256, 2, 3);
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(44, 44);
    return t;
  }

  // paint a flat vertex color onto a geometry so tree parts can be merged
  // into one instanced mesh
  function tintGeo(geo, hex) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const col = new THREE.Color(hex);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    return g;
  }
  // one merged geometry per tree species (instanced below)
  function treeGeometry(kind) {
    const parts = [];
    if (kind === 0) { // conifer
      parts.push(tintGeo(new THREE.CylinderGeometry(0.14, 0.3, 2.4, 7).translate(0, 1.2, 0), 0x4f3a26));
      for (let i = 0; i < 4; i += 1) {
        parts.push(tintGeo(new THREE.ConeGeometry(1.7 - i * 0.34, 1.7, 8).translate(0, 2.1 + i * 0.95, 0), i % 2 ? 0x2b562e : 0x33643a));
      }
    } else if (kind === 1) { // broadleaf
      parts.push(tintGeo(new THREE.CylinderGeometry(0.16, 0.32, 2.6, 7).translate(0, 1.3, 0), 0x53412c));
      for (const [dx, dy, dz, r] of [[0, 2.9, 0, 1.5], [0.9, 2.6, 0.2, 1.0], [-0.8, 2.7, -0.3, 1.05], [0.1, 3.5, 0.3, 0.95], [-0.2, 3.0, 0.8, 0.85]]) {
        parts.push(tintGeo(new THREE.IcosahedronGeometry(r, 1).translate(dx, dy, dz), 0x46792f));
      }
    } else if (kind === 2) { // birch: pale trunk, airy light foliage
      parts.push(tintGeo(new THREE.CylinderGeometry(0.1, 0.16, 3.2, 7).translate(0, 1.6, 0), 0xd9d9cd));
      for (const [dx, dy, dz, r] of [[0, 3.5, 0, 1.05], [0.6, 3.0, 0.3, 0.7], [-0.55, 3.2, -0.25, 0.75]]) {
        parts.push(tintGeo(new THREE.IcosahedronGeometry(r, 1).translate(dx, dy, dz), 0x8fbe62));
      }
    } else { // dead snag: bare trunk + skeletal branches
      parts.push(tintGeo(new THREE.CylinderGeometry(0.09, 0.24, 3.4, 6).translate(0, 1.7, 0), 0x4a3828));
      parts.push(tintGeo(new THREE.CylinderGeometry(0.045, 0.07, 1.5, 5).rotateZ(0.85).translate(0.55, 2.6, 0.1), 0x4a3828));
      parts.push(tintGeo(new THREE.CylinderGeometry(0.04, 0.06, 1.2, 5).rotateZ(-0.95).translate(-0.45, 2.2, -0.1), 0x4a3828));
      parts.push(tintGeo(new THREE.CylinderGeometry(0.035, 0.05, 1.0, 5).rotateX(0.9).translate(0, 3.0, 0.4), 0x4a3828));
    }
    return mergeGeometries(parts);
  }
  // instanced mesh from a transform list ({x,y,z,s|sx..,ry,tint})
  function instancedFrom(geo, mat, items, opts = {}) {
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    items.forEach((it, i) => {
      dummy.position.set(it.x, it.y || 0, it.z);
      dummy.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
      const s = it.s || 1;
      dummy.scale.set(it.sx || s, it.sy || s, it.sz || s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (it.tint != null) mesh.setColorAt(i, col.setScalar(it.tint));
    });
    mesh.castShadow = opts.shadow !== false;
    mesh.receiveShadow = true;
    areaGroup.add(mesh);
    return mesh;
  }

  let waterMat = null;
  let sporesRef = null;

  (function buildForest() {
    // GROUND + dirt paths between the POIs
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(FH * 2 + 30, FH * 2 + 30), new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(AX, 0, 0); ground.receiveShadow = true;
    areaGroup.add(ground); solids.push(ground);
    const pathMat = new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 1 });
    function dirtPath(x1, z1, x2, z2, w) {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), pathMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -Math.atan2(z2 - z1, x2 - x1);
      m.position.set(AX + (x1 + x2) / 2, 0.015, (z1 + z2) / 2);
      m.receiveShadow = true;
      areaGroup.add(m);
    }
    dirtPath(0, 0, POI.compound.x - 6, POI.compound.z + 6, 2.4); // spawn -> outpost
    dirtPath(0, 0, POI.pod.x + 5, POI.pod.z - 4, 2.2); // spawn -> pod
    dirtPath(0, 0, POI.pond.x + 4, POI.pond.z + 4, 1.8); // spawn -> pond
    for (let i = 0; i < 12; i += 1) { // loose dirt patches
      const p = new THREE.Mesh(new THREE.CircleGeometry(2 + Math.random() * 4, 16), pathMat);
      p.rotation.x = -Math.PI / 2;
      p.position.set(AX + (Math.random() - 0.5) * FH * 1.6, 0.01, (Math.random() - 0.5) * FH * 1.6);
      areaGroup.add(p);
    }

    // POND — still water, sandy rim, reeds
    waterMat = new THREE.MeshStandardMaterial({ color: 0x3a7a9c, emissive: 0x14405c, emissiveIntensity: 0.35, transparent: true, opacity: 0.88, roughness: 0.15, metalness: 0.1 });
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 40), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.scale.set(POI.pond.rx, POI.pond.rz, 1);
    water.position.set(AX + POI.pond.x, 0.03, POI.pond.z);
    areaGroup.add(water);
    const rim = new THREE.Mesh(new THREE.RingGeometry(1, 1.18, 40), new THREE.MeshStandardMaterial({ color: 0x9a8a62, roughness: 1 }));
    rim.rotation.x = -Math.PI / 2;
    rim.scale.set(POI.pond.rx, POI.pond.rz, 1);
    rim.position.set(AX + POI.pond.x, 0.02, POI.pond.z);
    areaGroup.add(rim);
    const reedItems = [];
    for (let i = 0; i < 40; i += 1) {
      const a = Math.random() * Math.PI * 2;
      reedItems.push({
        x: AX + POI.pond.x + Math.cos(a) * POI.pond.rx * (1.02 + Math.random() * 0.18),
        y: 0.55, z: POI.pond.z + Math.sin(a) * POI.pond.rz * (1.02 + Math.random() * 0.18),
        sx: 1, sy: 0.8 + Math.random() * 0.7, sz: 1, rz: (Math.random() - 0.5) * 0.2,
      });
    }
    instancedFrom(new THREE.CylinderGeometry(0.02, 0.035, 1.1, 5), new THREE.MeshStandardMaterial({ color: 0x6f8a3c, roughness: 0.9 }), reedItems, { shadow: false });

    // RUINED OUTPOST — concrete slab, broken walls, containers, watchtower
    const conc = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.92, metalness: 0.05 });
    const concDark = new THREE.MeshStandardMaterial({ color: 0x767c82, roughness: 0.95 });
    const CX = POI.compound.x, CZ = POI.compound.z;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(POI.compound.w, 0.12, POI.compound.d), concDark);
    slab.position.set(AX + CX, 0.06, CZ); slab.receiveShadow = true;
    areaGroup.add(slab); solids.push(slab);
    // axis-aligned wall segments (h, so AABB colliders fit exactly)
    const walls = [
      [CX - 10, CZ - 4, 0.4, 2.2, 9], // west wall (partial)
      [CX - 10, CZ + 6.5, 0.4, 1.1, 4], // west wall broken stub
      [CX - 3, CZ - 8.6, 8, 2.2, 0.4], // north wall
      [CX + 6.5, CZ - 8.6, 4, 1.0, 0.4], // north broken stub
      [CX + 10.6, CZ + 1, 0.4, 2.2, 7], // east wall
      [CX + 2, CZ + 8.6, 6, 1.2, 0.4], // south low wall
    ];
    for (const [wx, wz, w, h, d] of walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), conc);
      m.position.set(AX + wx, h / 2, wz);
      m.castShadow = true; m.receiveShadow = true;
      areaGroup.add(m); solids.push(m);
      colliders.push(new THREE.Box3().setFromObject(m));
    }
    // cargo containers with a contrasting stripe
    for (const [ox, oz, hue, ry] of [[CX + 5, CZ - 3, 0xa04a2a, 0], [CX - 4, CZ + 3.5, 0x2a5a8a, Math.PI / 2]]) {
      const alongX = ry === 0;
      const box = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 5.6 : 2.35, 2.3, alongX ? 2.35 : 5.6), new THREE.MeshStandardMaterial({ color: hue, roughness: 0.6, metalness: 0.35 }));
      box.position.set(AX + ox, 1.15, oz);
      box.castShadow = true; box.receiveShadow = true;
      areaGroup.add(box); solids.push(box);
      colliders.push(new THREE.Box3().setFromObject(box));
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 5.64 : 0.4, 0.5, alongX ? 0.4 : 5.64), new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.6 }));
      stripe.position.set(AX + ox, 1.7, oz);
      areaGroup.add(stripe);
    }
    // watchtower (SE corner)
    const TX = CX + 8, TZ = CZ + 6;
    for (const [lx, lz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 3.4, 7), concDark);
      leg.position.set(AX + TX + lx, 1.7, TZ + lz);
      leg.castShadow = true;
      areaGroup.add(leg);
    }
    const platform = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 2.2), conc);
    platform.position.set(AX + TX, 3.5, TZ); platform.castShadow = true;
    areaGroup.add(platform);
    for (const sgn of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(sgn[0] === 0 ? 2.2 : 0.08, 0.5, sgn[0] === 0 ? 0.08 : 2.2), concDark);
      rail.position.set(AX + TX + sgn[0] * 1.06, 3.85, TZ + sgn[1] * 1.06);
      areaGroup.add(rail);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.9, 4), new THREE.MeshStandardMaterial({ color: 0x5a6a4a, roughness: 0.8 }));
    roof.position.set(AX + TX, 4.9, TZ); roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    areaGroup.add(roof);
    colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(AX + TX, 1.7, TZ), new THREE.Vector3(1.9, 3.4, 1.9)));
    // sandbag lines
    for (const [sx, sz, w, d] of [[CX - 2, CZ - 2, 2.2, 0.55], [CX + 1.5, CZ + 5, 0.55, 2.2]]) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(w, 0.72, d), new THREE.MeshStandardMaterial({ color: 0xb8a76a, roughness: 1 }));
      bag.position.set(AX + sx, 0.36, sz);
      bag.castShadow = true; bag.receiveShadow = true;
      areaGroup.add(bag); solids.push(bag);
      colliders.push(new THREE.Box3().setFromObject(bag));
    }
    makeSupplyCrate(CX, CZ, "crate_outpost");

    // CRASHED DROP POD — scorched crater, tilted hull, ember glow
    const PDX = POI.pod.x, PDZ = POI.pod.z;
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(5, 26), new THREE.MeshStandardMaterial({ color: 0x1e1a16, roughness: 1 }));
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.set(AX + PDX, 0.018, PDZ);
    areaGroup.add(scorch);
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.15, 2.3, 6, 12), new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.45, metalness: 0.6 }));
    hull.rotation.z = 1.2; hull.rotation.y = 0.4;
    hull.position.set(AX + PDX, 0.95, PDZ);
    hull.castShadow = true; hull.receiveShadow = true;
    areaGroup.add(hull); solids.push(hull);
    colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(AX + PDX, 1, PDZ), new THREE.Vector3(3.4, 2, 2.6)));
    for (const [gx, gy, gz, ry] of [[0.4, 1.3, 0.6, 0.5], [-0.6, 0.8, -0.5, -0.7]]) { // glowing cracks
      const crack = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.1), new THREE.MeshStandardMaterial({ color: 0xff7030, emissive: 0xff5a20, emissiveIntensity: 1.3, roughness: 0.4 }));
      crack.position.set(AX + PDX + gx, gy, PDZ + gz);
      crack.rotation.set(0.4, ry, 0.9);
      areaGroup.add(crack);
    }
    const podGlow = new THREE.PointLight(0xff7030, 1.1, 11, 2);
    podGlow.position.set(AX + PDX, 1.4, PDZ);
    areaGroup.add(podGlow);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.9), new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.5, metalness: 0.6 }));
    fin.position.set(AX + PDX - 1.6, 1.6, PDZ - 0.4);
    fin.rotation.z = 0.9; fin.castShadow = true;
    areaGroup.add(fin);
    const shardMat = new THREE.MeshStandardMaterial({ color: 0x30353c, roughness: 0.6, metalness: 0.5 });
    const shardItems = [];
    for (let i = 0; i < 14; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.8 + Math.random() * 3;
      shardItems.push({ x: AX + PDX + Math.cos(a) * r, y: 0.1, z: PDZ + Math.sin(a) * r, s: 0.35 + Math.random() * 0.5, ry: Math.random() * 6, rx: Math.random() });
    }
    instancedFrom(new THREE.TetrahedronGeometry(0.5, 0), shardMat, shardItems);
    makeSupplyCrate(PDX + 3.4, PDZ + 2.2, "crate_pod");

    // ROCK PLATEAUS — big landmarks / hard cover
    const plateauMat = new THREE.MeshStandardMaterial({ color: 0x84898f, roughness: 0.95, flatShading: true });
    for (const [px, pz, r, h] of [[14, 20, 4.4, 2.6], [-20, -12, 3.4, 2.1], [34, 8, 3.8, 2.4]]) {
      const rock = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.82, r, h, 7), plateauMat);
      rock.position.set(AX + px, h / 2, pz);
      rock.castShadow = true; rock.receiveShadow = true;
      areaGroup.add(rock); solids.push(rock);
      colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(AX + px, h / 2, pz), new THREE.Vector3(r * 1.7, h, r * 1.7)));
    }

    // FOREST — four species, instanced (one draw call per species)
    const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const treeLists = [[], [], [], []];
    let placed = 0, tries = 0;
    while (placed < 300 && tries < 2600) {
      tries += 1;
      const ex = (Math.random() - 0.5) * 2 * (FH - 2.5);
      const ez = (Math.random() - 0.5) * 2 * (FH - 2.5);
      if (isBlockedRel(ex, ez)) continue;
      const roll = Math.random();
      const kind = roll < 0.45 ? 0 : roll < 0.75 ? 1 : roll < 0.9 ? 2 : 3;
      const s = 0.85 + Math.random() * 0.9;
      treeLists[kind].push({ x: AX + ex, z: ez, s, ry: Math.random() * 6.28, tint: 0.85 + Math.random() * 0.3 });
      colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(AX + ex, 1, ez), new THREE.Vector3(0.55 * s, 2.2, 0.55 * s)));
      placed += 1;
    }
    // dense boundary ring (natural wall)
    for (let a = 0; a < Math.PI * 2; a += 0.045) {
      const r = FH - 0.5 + Math.random() * 3;
      const kind = Math.random() < 0.75 ? 0 : 1;
      treeLists[kind].push({ x: AX + Math.cos(a) * r, z: Math.sin(a) * r, s: 1.1 + Math.random() * 0.8, ry: Math.random() * 6.28, tint: 0.8 + Math.random() * 0.25 });
    }
    for (let k = 0; k < 4; k += 1) {
      if (treeLists[k].length) instancedFrom(treeGeometry(k), treeMat, treeLists[k]);
    }

    // rocks / bushes / stumps — instanced clutter
    const rockItems = [];
    for (let i = 0; i < 70; i += 1) {
      const r = 0.4 + Math.random() * 0.9;
      const ex = (Math.random() - 0.5) * FH * 1.8;
      const ez = (Math.random() - 0.5) * FH * 1.8;
      if (isBlockedRel(ex, ez)) continue;
      rockItems.push({ x: AX + ex, y: r * 0.42, z: ez, s: r, rx: Math.random(), ry: Math.random() * 6 });
      if (r > 0.85) colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(AX + ex, r * 0.5, ez), new THREE.Vector3(r * 1.4, r, r * 1.4)));
    }
    instancedFrom(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.95, flatShading: true }), rockItems);
    const bushItems = [];
    for (let i = 0; i < 150; i += 1) {
      const ex = (Math.random() - 0.5) * FH * 1.8;
      const ez = (Math.random() - 0.5) * FH * 1.8;
      if (isBlockedRel(ex, ez)) continue;
      const s = 0.4 + Math.random() * 0.5;
      bushItems.push({ x: AX + ex, y: s * 0.6, z: ez, s, ry: Math.random() * 6, tint: 0.8 + Math.random() * 0.4 });
    }
    instancedFrom(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.9, flatShading: true }), bushItems);
    const stumpItems = [];
    for (let i = 0; i < 22; i += 1) {
      const ex = (Math.random() - 0.5) * FH * 1.7;
      const ez = (Math.random() - 0.5) * FH * 1.7;
      if (isBlockedRel(ex, ez)) continue;
      stumpItems.push({ x: AX + ex, y: 0.17, z: ez, s: 0.8 + Math.random() * 0.5, ry: Math.random() * 6 });
    }
    instancedFrom(new THREE.CylinderGeometry(0.24, 0.32, 0.36, 8), new THREE.MeshStandardMaterial({ color: 0x584127, roughness: 1 }), stumpItems);
    // fallen logs (few, individual)
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x584127, roughness: 1 });
    for (let i = 0; i < 12; i += 1) {
      const ex = (Math.random() - 0.5) * FH * 1.6;
      const ez = (Math.random() - 0.5) * FH * 1.6;
      if (isBlockedRel(ex, ez)) continue;
      const len = 2 + Math.random() * 1.8;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, len, 7), barkMat);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = Math.random() * Math.PI;
      log.position.set(AX + ex, 0.18, ez);
      log.castShadow = true; log.receiveShadow = true;
      areaGroup.add(log);
    }
    // bioluminescent mushrooms (instanced caps + stems)
    const capItems = [];
    const stemItems = [];
    for (let i = 0; i < 26; i += 1) {
      const ex = (Math.random() - 0.5) * FH * 1.8;
      const ez = (Math.random() - 0.5) * FH * 1.8;
      if (isBlockedRel(ex, ez)) continue;
      for (let j = 0; j < 3; j += 1) {
        const s = 0.5 + Math.random() * 0.8;
        const ox = (Math.random() - 0.5) * 0.7;
        const oz = (Math.random() - 0.5) * 0.7;
        stemItems.push({ x: AX + ex + ox, y: 0.07 * s, z: ez + oz, s });
        capItems.push({ x: AX + ex + ox, y: 0.16 * s, z: ez + oz, s });
      }
    }
    instancedFrom(new THREE.CylinderGeometry(0.02, 0.03, 0.14, 5), new THREE.MeshStandardMaterial({ color: 0xd8e2d0, roughness: 0.9 }), stemItems, { shadow: false });
    instancedFrom(new THREE.ConeGeometry(0.07, 0.08, 7), new THREE.MeshStandardMaterial({ color: 0x5adfff, emissive: 0x38c8f0, emissiveIntensity: 1.1, roughness: 0.5 }), capItems, { shadow: false });

    // scattered field cover (crates + barriers) between the POIs
    const crateMat = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.6, metalness: 0.2 });
    const barrierMat = new THREE.MeshStandardMaterial({ map: metalTex, roughness: 0.5, metalness: 0.4 });
    let cover = 0, coverTries = 0;
    while (cover < 12 && coverTries < 90) {
      coverTries += 1;
      const a = Math.random() * Math.PI * 2;
      const r = 7 + Math.random() * (FH - 14);
      const ex = Math.cos(a) * r;
      const ez = Math.sin(a) * r;
      if (isBlockedRel(ex, ez)) continue;
      if (cover % 2 === 0) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.1, 1.25), crateMat);
        box.position.set(AX + ex, 0.55, ez);
        box.rotation.y = Math.random() * Math.PI;
        box.castShadow = true; box.receiveShadow = true;
        areaGroup.add(box); solids.push(box);
        colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(AX + ex, 0.55, ez), new THREE.Vector3(1.5, 1.1, 1.5)));
      } else {
        const alongX = Math.random() < 0.5;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 2.4 : 0.35, 0.95, alongX ? 0.35 : 2.4), barrierMat);
        bar.position.set(AX + ex, 0.47, ez);
        bar.castShadow = true; bar.receiveShadow = true;
        areaGroup.add(bar); solids.push(bar);
        colliders.push(new THREE.Box3().setFromObject(bar));
      }
      cover += 1;
    }

    // drifting spores/pollen — subtle life in the air
    const sporeCount = 260;
    const positions = new Float32Array(sporeCount * 3);
    for (let i = 0; i < sporeCount; i += 1) {
      positions[i * 3] = AX + (Math.random() - 0.5) * FH * 1.8;
      positions[i * 3 + 1] = 0.4 + Math.random() * 4.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * FH * 1.8;
    }
    const sporeGeo = new THREE.BufferGeometry();
    sporeGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    sporesRef = new THREE.Points(sporeGeo, new THREE.PointsMaterial({ color: 0xe8ffe8, size: 0.06, transparent: true, opacity: 0.45, sizeAttenuation: true }));
    areaGroup.add(sporesRef);

    // extract pad (return to base)
    areaGroup.add(place(new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 40), mint), AX, 0.05, 8).rotateX(-Math.PI / 2));
    areaGroup.add(col(1.7, 0.1, mint, AX, 0.06, 8, 28));
    const exLabel = makeLabel("撤离点 [E]", "#8effb0"); exLabel.position.set(AX, 2.4, 8); areaGroup.add(exLabel);
  })();
  interactables.push({ name: "撤离点", action: "extract", pos: new THREE.Vector3(AX, 0, 8), radius: 2.6 });

  // Articulated soldier: limbs hang from hip/shoulder pivots so they can be
  // swung procedurally while the enemy walks. Head parts are tagged for
  // headshot detection.
  function buildSoldier(suitColor) {
    const g = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: suitColor, roughness: 0.45, metalness: 0.5 });
    const plate = new THREE.MeshStandardMaterial({ color: 0x6a7686, roughness: 0.4, metalness: 0.6 });
    const visorM = new THREE.MeshStandardMaterial({ color: 0xff5a5a, emissive: 0xff3a3a, emissiveIntensity: 0.8, roughness: 0.3 });
    const torsoM = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.42, 6, 14), suit); torsoM.position.y = 1.3;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), plate); head.position.y = 1.86;
    head.userData.part = "head";
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), visorM); visor.position.set(0, 1.86, 0.1); visor.scale.set(1, 0.55, 0.6);
    visor.userData.part = "head";
    const sL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), plate); sL.position.set(-0.34, 1.5, 0);
    const sR = sL.clone(); sR.position.x = 0.34;
    for (const part of [torsoM, head, visor, sL, sR]) { part.castShadow = true; g.add(part); }
    // limb pivots: mesh hangs below the joint so rotation.x swings it
    const limbPivot = (r, len, px, py) => {
      const pivot = new THREE.Group();
      pivot.position.set(px, py, 0);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, 10), suit);
      m.position.y = -(len / 2 + r * 0.5);
      m.castShadow = true;
      pivot.add(m);
      g.add(pivot);
      return pivot;
    };
    const rig = {
      armL: limbPivot(0.085, 0.42, -0.4, 1.5),
      armR: limbPivot(0.085, 0.42, 0.4, 1.5),
      legL: limbPivot(0.12, 0.5, -0.15, 0.85),
      legR: limbPivot(0.12, 0.5, 0.15, 0.85),
    };
    // small rifle held across the chest (drawn to the muzzle flash point)
    const gunGrp = new THREE.Group();
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.62), new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.5, metalness: 0.6 }));
    gunBody.castShadow = true;
    gunGrp.add(gunBody);
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.95 }));
    flash.position.z = 0.38;
    flash.visible = false;
    gunGrp.add(flash);
    gunGrp.position.set(0.12, 1.32, 0.3);
    gunGrp.rotation.x = -0.08;
    g.add(gunGrp);
    g.userData.rig = rig;
    g.userData.flash = flash;
    return g;
  }
  // invisible hit material shared by all enemy hitboxes
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });

  function makeEnemy(x, z, hp, heavy = false) {
    const g = new THREE.Group();
    g.position.set(AX + x, 0, z);
    const ctrl = {
      group: g, health: hp, maxHealth: hp, alive: true, hitFlash: 0, phase: Math.random() * 6,
      heavy,
      dying: false, deathT: 0,
      speed: heavy ? 1.5 : 2.4 + Math.random() * 0.9, // a touch faster so they close the gap
      engaged: false, // flips true once within detection range (then they fire)
      nextShot: state.time + 3.5 + Math.random() * 3, // long grace: time to get bearings
      strafePhase: Math.random() * 6, // zig-zag approach offset
      strafeDir: Math.random() < 0.5 ? 1 : -1,
      stagger: 0, // brief pause after taking a hit
      flashT: 0, // muzzle flash visibility timer
      character: null, // rigged GLB instance (preferred)
      rig: null, // procedural fallback rig
    };

    // Prefer the rigged/animated soldier model; fall back to procedural blocks
    // if the GLB hasn't downloaded yet (keeps the game playable regardless).
    const scale = heavy ? 1.45 : 1;
    const inst = characterReady()
      ? makeCharacter({ tint: heavy ? 0xd06a5a : undefined, emissive: heavy ? 0x902018 : null })
      : null;
    if (inst) {
      inst.group.scale.setScalar(scale);
      g.add(inst.group);
      ctrl.character = inst;
      ctrl.walkAnim = "Idle";
    } else {
      const body = buildSoldier(heavy ? 0xb03a3a : 0xc8d2dc);
      body.scale.setScalar(scale);
      g.add(body);
      ctrl.rig = body.userData.rig;
      ctrl.flashMesh = body.userData.flash;
      ctrl.walkPhase = Math.random() * 6;
    }

    // simple invisible hitboxes (fast, reliable) — body + head (2x damage)
    const bodyBox = new THREE.Mesh(new THREE.BoxGeometry(0.6 * scale, 1.15 * scale, 0.42 * scale), hitMat);
    bodyBox.position.y = 1.0 * scale;
    bodyBox.userData = { type: "enemy", enemy: ctrl, part: "body" };
    g.add(bodyBox);
    const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.34 * scale, 0.36 * scale, 0.34 * scale), hitMat);
    headBox.position.y = 1.66 * scale;
    headBox.userData = { type: "enemy", enemy: ctrl, part: "head" };
    g.add(headBox);
    ctrl.bodies = [bodyBox, headBox];
    ctrl.headBox = headBox;

    scene.add(g);
    enemies.push(ctrl);
    return ctrl;
  }

  const state = { score: 0, time: 0, inArea: false, wave: 0 };
  let nextWaveAt = -1; // >0 while waiting between cleared waves

  function spawnWave(n) {
    for (const e of enemies) scene.remove(e.group);
    enemies.length = 0;
    // enemies get a bit tougher each wave
    const hp = Math.min(60 + (state.wave - 1) * 15, 120);
    // Spawn as a squad coming from ONE direction (a frontal arc), not a full
    // 360° ring — so entering an area never means being surrounded. Each wave
    // picks a fresh approach bearing; enemies spread ±60° around it, far off.
    const baseAngle = Math.random() * Math.PI * 2;
    let placed = 0, tries = 0;
    while (placed < n && tries < n * 12) {
      tries += 1;
      const a = baseAngle + (Math.random() - 0.5) * (Math.PI * 2 / 3); // ±60°
      const r = 26 + Math.random() * 16; // 26–42m out: they must walk in
      const ex = Math.cos(a) * r;
      const ez = Math.sin(a) * r;
      if (isBlockedRel(ex, ez)) continue; // don't spawn inside a POI
      makeEnemy(ex, ez, hp);
      placed += 1;
    }
    // every 3rd wave a heavy joins the squad from the same direction
    const hasBoss = state.wave > 0 && state.wave % 3 === 0;
    if (hasBoss) {
      makeEnemy(Math.cos(baseAngle) * 30, Math.sin(baseAngle) * 30, 240 + state.wave * 20, true);
    }
    if (hooks.onWaveSpawn) hooks.onWaveSpawn(state.wave, placed + (hasBoss ? 1 : 0), hasBoss);
  }

  // --- transient combat FX: death bursts + shell shards -------------------
  const burstGeo = new THREE.OctahedronGeometry(0.06, 0);
  const bursts = [];
  function spawnDeathBurst(pos, heavy) {
    const n = heavy ? 16 : 9;
    for (let i = 0; i < n; i += 1) {
      const mat = new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xff8a5a : 0xcfe0ee, transparent: true, opacity: 1 });
      const m = new THREE.Mesh(burstGeo, mat);
      m.position.set(pos.x, pos.y + 1.2, pos.z);
      const life = 0.45 + Math.random() * 0.25;
      bursts.push({
        mesh: m, life, max: life,
        vel: new THREE.Vector3((Math.random() - 0.5) * 5, 1.5 + Math.random() * 3.5, (Math.random() - 0.5) * 5),
      });
      scene.add(m);
    }
  }

  // --- enemy fire: brief tracer line + distant crack, chance-to-hit ------
  const tracers = [];
  function spawnTracer(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }));
    scene.add(line);
    tracers.push({ line, life: 0.12, max: 0.12 });
  }
  function clearTracers() {
    for (const t of tracers) { scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); }
    tracers.length = 0;
  }
  function enemyFire(e, ps, dist) {
    // hit chance falls off sharply with range: lethal up close, mostly harmless
    // at a distance so you can reposition. Crouching makes you a harder target.
    let chance = Math.max(0.08, 0.5 - Math.max(0, dist - 6) * 0.03);
    if (ps.crouching) chance *= 0.6;
    if (ps.sprinting) chance *= 0.8; // moving fast is safer too
    const hit = Math.random() < chance;
    const from = e.group.position.clone();
    from.y += e.heavy ? 2.2 : 1.55;
    const to = new THREE.Vector3(ps.pos.x, ps.pos.y + (ps.crouching ? 1.0 : 1.5), ps.pos.z);
    if (!hit) { // visible near miss
      to.x += (Math.random() - 0.5) * 2.6;
      to.y += Math.random() * 1.4;
      to.z += (Math.random() - 0.5) * 2.6;
    }
    spawnTracer(from, to, e.heavy ? 0xff4030 : 0xff8a5a);
    audio.enemyShot();
    const dmg = e.heavy ? 9 + Math.floor(Math.random() * 6) : 4 + Math.floor(Math.random() * 4);
    if (hit && hooks.onPlayerHit) hooks.onPlayerHit(dmg);
  }

  // Bright, very short tracer for the player's own shots.
  function spawnPlayerTracer(camera, end) {
    const from = new THREE.Vector3();
    camera.getWorldPosition(from);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    // offset toward the muzzle (right + down + forward of the eye)
    const rightV = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
    from.addScaledVector(rightV, 0.14).addScaledVector(camera.up, -0.12).addScaledVector(dir, 0.55);
    const geo = new THREE.BufferGeometry().setFromPoints([from, end]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.7 }));
    scene.add(line);
    tracers.push({ line, life: 0.06, max: 0.06 });
  }
  function spawnLoot(pos) {
    const drop = rollLoot();
    const item = ITEM_DB[drop.id];
    const c = new THREE.Color(RARITY_COLOR[item ? item.rarity : "common"]);
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.95, roughness: 0.4 }));
    orb.position.set(pos.x, 0.5, pos.z); orb.castShadow = true; scene.add(orb);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35 }));
    beam.position.set(pos.x, 1.1, pos.z); scene.add(beam);
    loot.push({ orb, beam, drop, baseY: 0.5, phase: Math.random() * 6 });
  }
  function clearLoot() { for (const l of loot) { scene.remove(l.orb); scene.remove(l.beam); } loot.length = 0; }
  function damageEnemy(ctrl, dmg) {
    if (!ctrl || !ctrl.alive) return false;
    ctrl.health -= dmg; ctrl.hitFlash = 1;
    if (ctrl.character) ctrl.character.flash(); // white-hot hit flash on the model
    ctrl.stagger = Math.max(ctrl.stagger || 0, ctrl.heavy ? 0.08 : 0.18); // hit reaction
    if (ctrl.health <= 0) {
      ctrl.alive = false;
      ctrl.dying = true; // fall over, then sink away (animated in update)
      ctrl.deathT = 0;
      spawnDeathBurst(ctrl.group.position, ctrl.heavy);
      // heavies guarantee a haul of three drops
      const drops = ctrl.heavy ? 3 : 1;
      for (let i = 0; i < drops; i += 1) {
        const off = i === 0 ? { x: 0, z: 0 } : { x: (Math.random() - 0.5) * 1.6, z: (Math.random() - 0.5) * 1.6 };
        spawnLoot({ x: ctrl.group.position.x + off.x, z: ctrl.group.position.z + off.z });
      }
      state.score += 1;
      return true;
    }
    return false;
  }
  function enterArea1() {
    scene.fog = forestFog; scene.background = forestBg;
    // warm daylight over the forest, greener bounce light; the sun follows the
    // player into the far-away area so shadows actually cover it
    key.color.set(0xffe9c4); key.intensity = 3.3;
    key.position.set(AX + 16, 30, 14);
    key.target.position.set(AX, 0, 0);
    const sc = key.shadow.camera;
    sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.far = 110;
    sc.updateProjectionMatrix();
    hemi.color.set(0xdcecff); hemi.groundColor.set(0x4a6a3c); hemi.intensity = 1.25;
    for (const c of supplyCrates) { c.opened = false; c.seamMat.emissiveIntensity = 0.9; }
    areaGroup.visible = true;
    state.inArea = true;
    state.wave = 1;
    nextWaveAt = -1;
    clearLoot(); clearTracers(); spawnWave(6);
  }
  function extract() {
    scene.fog = baseFog; scene.background = baseBg;
    key.color.set(0xfff4e0); key.intensity = 2.8;
    key.position.set(8, 20, 12);
    key.target.position.set(0, 0, 0);
    const sc = key.shadow.camera;
    sc.left = -28; sc.right = 28; sc.top = 28; sc.bottom = -28; sc.far = 70;
    sc.updateProjectionMatrix();
    hemi.color.set(0xcfe6ff); hemi.groundColor.set(0x35506a); hemi.intensity = 1.1;
    areaGroup.visible = false;
    state.inArea = false;
    state.wave = 0;
    nextWaveAt = -1;
    for (const e of enemies) scene.remove(e.group);
    enemies.length = 0;
    clearLoot(); clearTracers();
  }
  function enemiesLeft() { let n = 0; for (const e of enemies) if (e.alive) n += 1; return n; }

  function damageTarget(mesh, dmg) {
    const d = mesh.userData;
    if (!d.alive) return false;
    d.health -= dmg;
    d.hitFlash = 1;
    if (d.health <= 0) {
      d.alive = false;
      mesh.visible = false;
      d.respawnAt = state.time + RESPAWN_DELAY;
      state.score += 1;
      return true;
    }
    return false;
  }

  function getHittables() {
    const list = solids.slice();
    for (const tgt of targets) if (tgt.userData.alive) list.push(tgt);
    for (const e of enemies) if (e.alive) for (const b of e.bodies) list.push(b);
    return list;
  }

  function update(dt, playerState) {
    state.time += dt;
    const playerPos = playerState ? playerState.pos : null;
    for (const d of decor) {
      if (d.axis === "y") d.mesh.rotation.y += dt * d.spin;
      else d.mesh.rotation.z += dt * d.spin;
    }
    // Area 1 enemies: chase the player to firing range, shoot on a timer.
    for (const e of enemies) {
      if (e.dying) { // death animation: keel over, then sink into the ground
        e.deathT += dt;
        const fall = Math.min(1, e.deathT / 0.45);
        e.group.rotation.x = -fall * fall * 1.4;
        if (e.deathT > 0.5) e.group.position.y = -(e.deathT - 0.5) * 0.9;
        if (e.deathT > 1.4) { e.dying = false; e.group.visible = false; }
        continue;
      }
      if (!e.alive) continue;
      e.group.position.y = Math.sin(state.time * 1.6 + e.phase) * 0.04;
      if (playerPos) {
        // face the player on the yaw axis only (no pitch, so it never tips over)
        e.group.rotation.set(0, Math.atan2(playerPos.x - e.group.position.x, playerPos.z - e.group.position.z), 0);
        if (state.inArea) {
          const dx = playerPos.x - e.group.position.x;
          const dz = playerPos.z - e.group.position.z;
          const dist = Math.max(0.001, Math.hypot(dx, dz));
          const ux = dx / dist;
          const uz = dz / dist;
          e.stagger = Math.max(0, e.stagger - dt);
          let moveX = 0;
          let moveZ = 0;
          if (e.stagger <= 0) {
            if (dist > 9) { // weaving advance toward firing range
              const weave = Math.sin(state.time * 1.7 + e.strafePhase) * 0.55 * e.strafeDir;
              moveX = ux - uz * weave;
              moveZ = uz + ux * weave;
            } else if (dist < 5.5) { // too close: back off at an angle
              moveX = -ux * 0.7 - uz * 0.4 * e.strafeDir;
              moveZ = -uz * 0.7 + ux * 0.4 * e.strafeDir;
            } else { // hold range, strafe sideways
              const weave = Math.sin(state.time * 1.2 + e.strafePhase) * e.strafeDir;
              moveX = -uz * weave * 0.7;
              moveZ = ux * weave * 0.7;
            }
          }
          // separation: never bunch into one blob
          for (const o of enemies) {
            if (o === e || !o.alive) continue;
            const sx = e.group.position.x - o.group.position.x;
            const sz = e.group.position.z - o.group.position.z;
            const d2 = sx * sx + sz * sz;
            if (d2 > 0.0001 && d2 < 2.6) {
              const d = Math.sqrt(d2);
              moveX += (sx / d) * 0.8;
              moveZ += (sz / d) * 0.8;
            }
          }
          const moveMag = Math.hypot(moveX, moveZ);
          if (moveMag > 0.03) {
            const step = (e.speed * dt) / Math.max(1, moveMag);
            e.group.position.x += moveX * step;
            e.group.position.z += moveZ * step;
            e.group.position.x = Math.min(AX + FH - 1.5, Math.max(AX - FH + 1.5, e.group.position.x));
            e.group.position.z = Math.min(FH - 1.5, Math.max(-FH + 1.5, e.group.position.z));
          }
          // drive locomotion animation from actual movement
          const movingNow = moveMag > 0.03 && e.stagger <= 0;
          if (e.character) { // rigged model: blend Idle/Walk/Run clips
            const want = !movingNow ? "Idle" : dist > 9 ? "Run" : "Walk";
            if (want !== e.walkAnim) { e.character.play(want); e.walkAnim = want; }
          } else if (e.rig) { // procedural fallback: swing the limb pivots
            if (movingNow) {
              e.walkPhase += dt * (5.5 + e.speed * 2.5);
              const sw = Math.sin(e.walkPhase) * 0.55;
              e.rig.legL.rotation.x = sw;
              e.rig.legR.rotation.x = -sw;
              e.rig.armL.rotation.x = -sw * 0.6;
              e.rig.armR.rotation.x = sw * 0.6;
            } else {
              for (const p of [e.rig.legL, e.rig.legR, e.rig.armL, e.rig.armR]) {
                p.rotation.x *= Math.max(0, 1 - dt * 10);
              }
            }
          }
          // engagement: only fire once the player is within weapon range.
          // Distant enemies advance in silence instead of sniping across the map.
          const ENGAGE_RANGE = e.heavy ? 24 : 20;
          if (dist < ENGAGE_RANGE) {
            if (!e.engaged) { // just spotted the player — small reaction delay
              e.engaged = true;
              e.nextShot = Math.max(e.nextShot, state.time + 0.5 + Math.random() * 0.6);
            }
            if (state.time >= e.nextShot && e.stagger <= 0) {
              e.nextShot = state.time + (e.heavy ? 2.1 : 1.7) + Math.random() * 0.9;
              enemyFire(e, playerState, dist);
              e.flashT = 0.07;
              if (e.flashMesh) e.flashMesh.visible = true;
            }
          } else {
            e.engaged = false; // lost range: hold fire again
          }
          if (e.flashT > 0) {
            e.flashT -= dt;
            if (e.flashT <= 0 && e.flashMesh) e.flashMesh.visible = false;
          }
        }
      }
      // advance the skeletal animation + fade the hit flash on rigged enemies
      if (e.character) { e.character.tick(dt); e.character.fadeFlash(dt); }
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 4);
    }
    // ambient forest life: drifting spores + water shimmer
    if (state.inArea) {
      if (sporesRef) {
        sporesRef.rotation.y += dt * 0.006;
        sporesRef.position.y = Math.sin(state.time * 0.25) * 0.35;
      }
      if (waterMat) waterMat.opacity = 0.84 + Math.sin(state.time * 0.7) * 0.05;
    }
    // death-burst shards: fly, tumble, fade
    for (let i = bursts.length - 1; i >= 0; i -= 1) {
      const b = bursts[i];
      b.life -= dt;
      b.vel.y -= 10 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.rotation.x += dt * 10;
      b.mesh.rotation.z += dt * 8;
      b.mesh.material.opacity = Math.max(0, b.life / b.max);
      if (b.life <= 0) {
        scene.remove(b.mesh);
        b.mesh.material.dispose();
        bursts.splice(i, 1);
      }
    }
    // fade out enemy tracers
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      const t = tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / t.max) * 0.85;
      if (t.life <= 0) {
        scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        tracers.splice(i, 1);
      }
    }
    // wave flow: clear -> short break -> next (slightly bigger) wave
    if (state.inArea && enemies.length > 0 && enemiesLeft() === 0 && nextWaveAt < 0) {
      nextWaveAt = state.time + 4;
      if (hooks.onWaveCleared) hooks.onWaveCleared(state.wave);
    }
    if (state.inArea && nextWaveAt > 0 && state.time >= nextWaveAt) {
      nextWaveAt = -1;
      state.wave += 1;
      spawnWave(Math.min(6 + (state.wave - 1) * 2, 16));
    }
    // loot orbs: bob + spin, pick up when the player walks over them.
    for (let i = loot.length - 1; i >= 0; i -= 1) {
      const l = loot[i];
      l.orb.position.y = l.baseY + Math.sin(state.time * 3 + l.phase) * 0.12;
      l.orb.rotation.y += dt * 2;
      if (playerPos) {
        const dx = playerPos.x - l.orb.position.x;
        const dz = playerPos.z - l.orb.position.z;
        if (dx * dx + dz * dz < 1.7) {
          scene.remove(l.orb); scene.remove(l.beam);
          loot.splice(i, 1);
          if (hooks.onLoot) hooks.onLoot(l.drop);
        }
      }
    }
    for (const mesh of targets) {
      const d = mesh.userData;
      if (d.alive) {
        mesh.position.y = d.baseY + Math.sin(state.time * 2 + d.phase) * 0.25;
        mesh.rotation.y += dt * 1.4;
        if (d.hitFlash > 0) {
          d.hitFlash = Math.max(0, d.hitFlash - dt * 4);
          mesh.material.emissiveIntensity = 0.9 + d.hitFlash * 1.4;
        }
      } else if (state.time >= d.respawnAt) {
        d.alive = true;
        d.health = d.maxHealth;
        d.hitFlash = 0;
        mesh.material.emissiveIntensity = 0.9;
        mesh.position.copy(d.home);
        mesh.visible = true;
      }
    }
  }

  return {
    ROOM, colliders, solids, targets, interactables, state, enemies, loot, supplyCrates,
    damageTarget, damageEnemy, getHittables, update, spawnPlayerTracer, openSupplyCrate,
    enterArea1, extract, enemiesLeft, areaSpawn, baseSpawn, areaHalfX, areaHalfZ,
  };
}
