import * as THREE from "three";
import { techPanel, techFloor, hazardStripes, brushedMetal, holoScreen } from "./textures.js?v=260711010";
import { rollLoot, LONDON_LOOT, PARIS_LOOT, MOSCOW_LOOT, ITEM_DB, RARITY_COLOR } from "./inventory.js?v=260711010";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { audio } from "./audio.js?v=260711010";
import { loadCharacter, loadRobot, makeCharacter, characterReady } from "./character.js?v=260711010";

// Futuristic command-hub base. Uses beveled extruded panels, polygonal
// columns, a lathed dome, trusses, light coves and energy conduits instead
// of plain slabs, so it reads as designed sci-fi architecture rather than a
// metal box. Materials are MeshStandard (the toonify pass cel-shades them).
export function createWorld(scene, hooks = {}) {
  const ROOM = 16;
  const HEIGHT = 7.5;

  // Start downloading the rigged enemy models now so they're ready by deploy.
  loadCharacter().catch(() => {}); // falls back to procedural soldiers if it fails
  loadRobot().catch(() => {}); // second species (battle droid) for enemy variety

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
  // London street corridor: a long avenue running along Z. The player deploys
  // at the near end (+RL) and pushes FORWARD toward the boss at the far end
  // (-RL). SHW is the walkable street half-width; buildings line both sides.
  // Two separate maps (副本) live at far-apart X offsets so their geometry
  // never interferes (raycasts/collision are local and weapon range << the gap).
  // `AX` is the ACTIVE map's offset — set per-build and again on deploy.
  const AXL = 260;  // London offset
  const AXP = 3000; // Paris offset (far away)
  const AXM = 6000; // Moscow offset (hardest campaign)
  let AX = AXL;     // active map offset (mutable)
  const SHW = 12; // street half-width (walkable X)
  const RL = 128; // route half-length (Z)
  const areaSpawn = new THREE.Vector3(AXL, 0, RL - 12); // .set() on deploy
  const baseSpawn = new THREE.Vector3(0, 0, 9);
  const areaHalfX = SHW;
  const areaHalfZ = RL;
  const extractPos = new THREE.Vector3(AXL, 0, RL - 8); // .set() on deploy
  const enemies = [];
  const loot = [];

  // store the base atmosphere so we can swap skies on deploy
  const baseFog = scene.fog;
  const baseBg = scene.background;
  function skyTex(c0, c1, c2) {
    const c = document.createElement("canvas"); c.width = 8; c.height = 256;
    const x = c.getContext("2d"); const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, c0); g.addColorStop(0.5, c1); g.addColorStop(1, c2);
    x.fillStyle = g; x.fillRect(0, 0, 8, 256);
    return new THREE.CanvasTexture(c);
  }
  const londonFog = new THREE.Fog(0x9aa2ac, 26, 165);
  const londonBg = skyTex("#868e9b", "#a6adb6", "#c6c9cb"); // overcast grey
  const parisFog = new THREE.Fog(0xd8c9a8, 34, 200);
  const parisBg = skyTex("#e6b96a", "#e9cf9a", "#cfe0e6"); // warm golden-hour sky
  const moscowFog = new THREE.Fog(0x7a8aaa, 22, 160); // cold greyish-blue
  const moscowBg = skyTex("#5a6a7a", "#6a7a8a", "#7a8a9a"); // cold overcast
  // each map's geometry lives in its own group (only the active one is shown)
  const londonGroup = new THREE.Group(); londonGroup.visible = false; scene.add(londonGroup);
  const parisGroup = new THREE.Group(); parisGroup.visible = false; scene.add(parisGroup);
  const moscowGroup = new THREE.Group(); moscowGroup.visible = false; scene.add(moscowGroup);
  let areaGroup = londonGroup; // current build target / active group

  // --- animated sky FX: a sun disc + slowly drifting cloud billboards ------
  const skyGroup = new THREE.Group(); skyGroup.visible = false; scene.add(skyGroup);
  const cloudTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
    const g = x.createRadialGradient(64, 64, 6, 64, 64, 62);
    g.addColorStop(0, "rgba(255,255,255,0.95)"); g.addColorStop(0.5, "rgba(255,255,255,0.5)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const clouds = [];
  for (let i = 0; i < 16; i += 1) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.7, depthWrite: false }));
    const sc = 26 + Math.random() * 40;
    spr.scale.set(sc, sc * 0.55, 1);
    spr.position.set((Math.random() - 0.5) * 300, 55 + Math.random() * 45, -60 - Math.random() * 260);
    skyGroup.add(spr); clouds.push({ spr, speed: 1.2 + Math.random() * 2.2 });
  }
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: 0xfff2c0, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  sunSprite.scale.set(34, 34, 1); sunSprite.position.set(70, 90, -230); skyGroup.add(sunSprite);
  const sunCore = new THREE.Mesh(new THREE.SphereGeometry(6, 20, 16), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
  sunCore.position.copy(sunSprite.position); skyGroup.add(sunCore);
  function setSky(mapId) {
    skyGroup.visible = true;
    skyGroup.position.x = AX; // clouds drift over the active map
    if (mapId === "paris") { // warm low sun
      sunSprite.material.color.setHex(0xffcf7a); sunCore.material.color.setHex(0xffd98a);
      sunSprite.position.set(40, 55, -240); sunCore.position.copy(sunSprite.position); sunCore.scale.setScalar(1.4);
      for (const c of clouds) c.spr.material.color.setHex(0xffe6c0);
    } else { // pale overcast sun
      sunSprite.material.color.setHex(0xdfe4ea); sunCore.material.color.setHex(0xeef2f6);
      sunSprite.position.set(70, 95, -230); sunCore.position.copy(sunSprite.position); sunCore.scale.setScalar(0.9);
      for (const c of clouds) c.spr.material.color.setHex(0xd8dce2);
    }
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

  // --- London photo textures (CC0 Poly Haven, committed under assets/) ------
  const texLoader = new THREE.TextureLoader();
  const texCache = {};
  function loadTex(name, rx, ry) {
    const t = texLoader.load(`./assets/textures/${name}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    if ("colorSpace" in t) t.colorSpace = THREE.SRGBColorSpace;
    else t.encoding = 3001; // sRGBEncoding fallback
    texCache[name] = t;
    return t;
  }

  // Facade with rows of sash windows drawn over a transparent canvas — placed
  // just in front of a brick building so lit windows read as a London terrace.
  function facadeTexture(cols, rows) {
    const cw = cols * 34, ch = rows * 46;
    const c = document.createElement("canvas"); c.width = cw; c.height = ch;
    const x = c.getContext("2d");
    x.clearRect(0, 0, cw, ch);
    for (let r = 0; r < rows; r += 1) {
      for (let cc = 0; cc < cols; cc += 1) {
        const lit = Math.random() < 0.34;
        const px = cc * 34 + 8, py = r * 46 + 9, ww = 18, hh = 28;
        x.fillStyle = lit
          ? `rgba(255,${(205 + Math.random() * 40) | 0},${(150 + Math.random() * 45) | 0},0.96)`
          : `rgba(${(24 + Math.random() * 12) | 0},${(30 + Math.random() * 12) | 0},${(40 + Math.random() * 14) | 0},0.92)`;
        x.fillRect(px, py, ww, hh);
        x.strokeStyle = "rgba(236,238,240,0.85)"; x.lineWidth = 2; // pale window frames
        x.strokeRect(px, py, ww, hh);
        x.beginPath();
        x.moveTo(px + ww / 2, py); x.lineTo(px + ww / 2, py + hh);
        x.moveTo(px, py + hh / 2); x.lineTo(px + ww, py + hh / 2); x.stroke();
      }
    }
    return new THREE.CanvasTexture(c);
  }

  // A clock face (Big Ben): cream dial, roman ticks, hands.
  function clockTexture() {
    const s = 256; const c = document.createElement("canvas"); c.width = c.height = s;
    const x = c.getContext("2d"); const cx = s / 2, cy = s / 2, R = s * 0.45;
    x.fillStyle = "#efe7cf"; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "#3a3122"; x.lineWidth = 8; x.stroke();
    x.strokeStyle = "#2a241a"; x.lineWidth = 4;
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      x.beginPath();
      x.moveTo(cx + Math.cos(a) * R * 0.82, cy + Math.sin(a) * R * 0.82);
      x.lineTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95); x.stroke();
    }
    x.lineCap = "round";
    x.strokeStyle = "#20180f"; x.lineWidth = 9; // hour hand
    x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(-1.1) * R * 0.5, cy + Math.sin(-1.1) * R * 0.5); x.stroke();
    x.lineWidth = 6; // minute hand
    x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(1.6) * R * 0.78, cy + Math.sin(1.6) * R * 0.78); x.stroke();
    return new THREE.CanvasTexture(c);
  }

  // Union Jack banner texture.
  function unionJackTexture() {
    const w = 128, h = 80; const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d");
    x.fillStyle = "#0a2472"; x.fillRect(0, 0, w, h); // navy field
    x.strokeStyle = "#fff"; x.lineWidth = 16; // white diagonals
    x.beginPath(); x.moveTo(0, 0); x.lineTo(w, h); x.moveTo(w, 0); x.lineTo(0, h); x.stroke();
    x.strokeStyle = "#c8102e"; x.lineWidth = 7; // red diagonals
    x.beginPath(); x.moveTo(0, 0); x.lineTo(w, h); x.moveTo(w, 0); x.lineTo(0, h); x.stroke();
    x.fillStyle = "#fff"; x.fillRect(w / 2 - 12, 0, 24, h); x.fillRect(0, h / 2 - 12, w, 24); // white cross
    x.fillStyle = "#c8102e"; x.fillRect(w / 2 - 6, 0, 12, h); x.fillRect(0, h / 2 - 6, w, 12); // red cross
    return new THREE.CanvasTexture(c);
  }

  // Underground roundel sign texture (red ring + blue bar + UNDERGROUND).
  function roundelTexture() {
    const s = 128; const c = document.createElement("canvas"); c.width = s; c.height = s;
    const x = c.getContext("2d"); x.clearRect(0, 0, s, s);
    x.strokeStyle = "#e1251b"; x.lineWidth = 14;
    x.beginPath(); x.arc(s / 2, s / 2, 40, 0, Math.PI * 2); x.stroke();
    x.fillStyle = "#0a2472"; x.fillRect(8, s / 2 - 13, s - 16, 26);
    x.fillStyle = "#fff"; x.font = "bold 15px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText("UNDERGROUND", s / 2, s / 2);
    return new THREE.CanvasTexture(c);
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

  // --- walkable area shape: the player + enemies are clamped to the union of
  // the active map's rectangular segments. A straight map is one segment; a
  // winding map (Paris) is a chain of segments so the route can bend. --------
  const londonSegments = [{ minX: AXL - SHW, maxX: AXL + SHW, minZ: -RL, maxZ: RL }];
  const parisSegments = []; // filled by buildParis
  let activeSegments = londonSegments;
  const clampMargin = 0.9; // keep the player off the exact wall (radius)
  function clampToArea(pos) {
    const segs = activeSegments; if (!segs || !segs.length) return;
    let bx = pos.x, bz = pos.z, bd = Infinity, inside = false;
    for (const s of segs) {
      const cx = Math.max(s.minX + clampMargin, Math.min(s.maxX - clampMargin, pos.x));
      const cz = Math.max(s.minZ + clampMargin, Math.min(s.maxZ - clampMargin, pos.z));
      const d = (pos.x - cx) * (pos.x - cx) + (pos.z - cz) * (pos.z - cz);
      if (d < 1e-6) { inside = true; break; }
      if (d < bd) { bd = d; bx = cx; bz = cz; }
    }
    if (!inside) { pos.x = bx; pos.z = bz; }
  }

  // --- stage gates: iron portcullises that seal the route until a stage's
  // enemies are cleared. A gate spans the corridor at (cx,cz); `axis` is the
  // corridor direction there — "z" for a N/S street (wall spans X), "x" for an
  // E/W street (wall spans Z). ----------------------------------------------
  const londonGates = [];
  const parisGates = [];
  const moscowGates = [];
  let gates = londonGates; // active map's gate list (set per-build & on deploy)
  const londonSegments = [], parisSegments = [], moscowSegments = [];
  const GATE_Z = [64, 12, -40, -84]; // London gates (one per non-boss stage)
  const GATE_H = 5.2;
  function makeGate(cx, cz, axis = "z") {
    const grp = new THREE.Group();
    const barMat = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.45, metalness: 0.85 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.6, metalness: 0.7 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(SHW * 2 + 1, 0.5, 0.6), frameMat); top.position.set(0, GATE_H, 0); grp.add(top);
    for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, GATE_H + 1, 0.6), frameMat); post.position.set(sx * (SHW + 0.2), GATE_H / 2, 0); grp.add(post); }
    for (let bx = -SHW + 0.7; bx <= SHW - 0.7; bx += 1.05) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, GATE_H, 8), barMat); bar.position.set(bx, GATE_H / 2, 0); bar.castShadow = true; grp.add(bar); }
    for (const by of [1.3, 3.0, 4.4]) { const cb = new THREE.Mesh(new THREE.BoxGeometry(SHW * 2, 0.14, 0.16), barMat); cb.position.set(0, by, 0); grp.add(cb); }
    if (axis === "x") grp.rotation.y = Math.PI / 2; // wall spans Z instead of X
    grp.position.set(cx, 7, cz); // start raised (open)
    areaGroup.add(grp);
    gates.push({ cx, cz, axis, group: grp, box: null, closed: false });
  }
  function closeGate(i) {
    const gt = gates[i]; if (!gt || gt.closed) return;
    gt.closed = true;
    gt.box = gt.axis === "x"
      ? new THREE.Box3(new THREE.Vector3(gt.cx - 0.5, 0, gt.cz - SHW), new THREE.Vector3(gt.cx + 0.5, GATE_H + 1, gt.cz + SHW))
      : new THREE.Box3(new THREE.Vector3(gt.cx - SHW, 0, gt.cz - 0.5), new THREE.Vector3(gt.cx + SHW, GATE_H + 1, gt.cz + 0.5));
    colliders.push(gt.box);
  }
  function openGate(i) {
    const gt = gates[i]; if (!gt || !gt.closed) return;
    gt.closed = false;
    if (gt.box) { const idx = colliders.indexOf(gt.box); if (idx >= 0) colliders.splice(idx, 1); gt.box = null; }
  }
  function resetGates() { for (let i = 0; i < gates.length; i += 1) { openGate(i); gates[i].group.position.y = 7; } }

  function buildLondon() {
    const L = RL;
    // shared materials (real CC0 photo textures)
    const roadMat = new THREE.MeshStandardMaterial({ map: loadTex("asphalt", 4, 44), roughness: 0.93, metalness: 0.04 });
    const paveMat = new THREE.MeshStandardMaterial({ map: loadTex("pavement", 3, 46), roughness: 1 });
    const brickA = new THREE.MeshStandardMaterial({ map: loadTex("brick_red", 2, 3), roughness: 0.95 });
    const brickB = new THREE.MeshStandardMaterial({ map: loadTex("brick_wall", 2, 3), roughness: 0.95 });
    const stoneMat = new THREE.MeshStandardMaterial({ map: loadTex("stone", 2, 3), roughness: 0.9 });
    const brickMats = [brickA, brickB, brickA, stoneMat];

    // ROAD down the middle (wet asphalt)
    const road = new THREE.Mesh(new THREE.PlaneGeometry(SHW * 2, L * 2 + 30), roadMat);
    road.rotation.x = -Math.PI / 2; road.position.set(AX, 0, 0); road.receiveShadow = true;
    areaGroup.add(road); solids.push(road);
    // dashed centre line
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xd8d2bc, roughness: 0.85 });
    for (let z = -L + 4; z < L; z += 6) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 2.6), lineMat);
      m.rotation.x = -Math.PI / 2; m.position.set(AX, 0.02, z); areaGroup.add(m);
    }
    // raised pavements + kerbs on both sides
    for (const s of [-1, 1]) {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(7, 0.2, L * 2 + 30), paveMat);
      sw.position.set(AX + s * (SHW + 3.5), 0.1, 0); sw.receiveShadow = true;
      areaGroup.add(sw); solids.push(sw);
    }

    // --- terraces lining both sides -----------------------------------------
    function terrace(cx, cz, w, h, d, mat, faceDir) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(cx, h / 2, cz); b.castShadow = true; b.receiveShadow = true;
      areaGroup.add(b); solids.push(b);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.6, d + 0.5), stoneMat);
      cap.position.set(cx, h + 0.25, cz); areaGroup.add(cap);
      const ground0 = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 1.4, d + 0.2), stoneMat); // shopfront band
      ground0.position.set(cx, 0.7, cz); areaGroup.add(ground0);
      // window facade on the street-facing side
      const cols = Math.max(2, Math.floor(w / 2.4));
      const rows = Math.max(3, Math.floor((h - 3) / 2.8));
      const facMat = new THREE.MeshBasicMaterial({ map: facadeTexture(cols, rows), transparent: true });
      const fac = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.92, h - 3), facMat);
      fac.position.set(cx + faceDir * (d / 2 + 0.06), (h - 3) / 2 + 1.6, cz);
      fac.rotation.y = faceDir * Math.PI / 2;
      areaGroup.add(fac);
      return b;
    }
    const depth = 8;
    const innerX = SHW + 7; // building inner face = outer edge of the pavement
    const PLAZA = [-26, 6]; // right side opens into a plaza here (Eiffel Tower)
    const PARK = [30, 58];  // left side opens into a park here
    for (const s of [-1, 1]) {
      let z = -L + 20;
      while (z < L - 8) {
        const w = 10 + Math.random() * 4;
        const mid = z + w / 2;
        // leave the plaza (right) and park (left) frontages open, plus random alleys
        const inPlaza = s === 1 && mid > PLAZA[0] && mid < PLAZA[1];
        const inPark = s === -1 && mid > PARK[0] && mid < PARK[1];
        if (inPlaza || inPark || Math.random() < 0.12) { z += w + 5; continue; }
        const h = 11 + Math.random() * 15;
        const mat = brickMats[(Math.random() * brickMats.length) | 0];
        terrace(AX + s * (innerX + depth / 2), mid, w, h, depth, mat, -s);
        z += w + 1.2;
      }
    }

    // --- landmarks at the far end: Big Ben + Parliament silhouette -----------
    (function bigBen() {
      const x = AX, z = -L - 1;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(9, 42, 9), stoneMat);
      tower.position.set(x, 21, z); tower.castShadow = true; areaGroup.add(tower); solids.push(tower);
      const band = new THREE.Mesh(new THREE.BoxGeometry(9.8, 8, 9.8), stoneMat); band.position.set(x, 40, z); areaGroup.add(band);
      const clockMat = new THREE.MeshStandardMaterial({ map: clockTexture(), emissive: 0x2a2410, emissiveIntensity: 0.35, roughness: 0.6 });
      for (const [dx, dz, ry] of [[0, 5.0, 0], [0, -5.0, Math.PI], [5.0, 0, Math.PI / 2], [-5.0, 0, -Math.PI / 2]]) {
        const cf = new THREE.Mesh(new THREE.CircleGeometry(2.7, 30), clockMat);
        cf.position.set(x + dx, 40, z + dz); cf.rotation.y = ry; areaGroup.add(cf);
      }
      const belfry = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), stoneMat); belfry.position.set(x, 48, z); areaGroup.add(belfry);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(6.2, 13, 4), stoneMat); spire.position.set(x, 58.5, z); spire.rotation.y = Math.PI / 4; spire.castShadow = true; areaGroup.add(spire);
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd9b24a, metalness: 0.7, roughness: 0.3, emissive: 0x5a4310, emissiveIntensity: 0.5 }));
      finial.position.set(x, 65.5, z); areaGroup.add(finial);
    })();
    (function parliament() {
      const z = -L - 10;
      const body = new THREE.Mesh(new THREE.BoxGeometry(64, 20, 8), stoneMat); body.position.set(AX, 10, z); body.castShadow = true; areaGroup.add(body);
      for (let ix = -30; ix <= 30; ix += 4) { const m = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 8), stoneMat); m.position.set(AX + ix, 21, z); areaGroup.add(m); }
      for (const ix of [-26, -9, 9, 26]) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(5, 28, 6), stoneMat); t.position.set(AX + ix, 14, z - 1); areaGroup.add(t);
        const sp = new THREE.Mesh(new THREE.ConeGeometry(3.6, 6, 4), stoneMat); sp.position.set(AX + ix, 31, z - 1); sp.rotation.y = Math.PI / 4; areaGroup.add(sp);
      }
    })();

    // --- street props -------------------------------------------------------
    const busRed = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.5, metalness: 0.2 });
    const busWin = new THREE.MeshStandardMaterial({ color: 0x1a2430, emissive: 0x0a1018, roughness: 0.3, metalness: 0.4 });
    const tyre = new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.85 });
    function bus(x, z, ry) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 4.2, 9), busRed); body.position.y = 2.4; body.castShadow = true; g.add(body); solids.push(body);
      for (const wy of [3.3, 1.9]) { const win = new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.9, 8.2), busWin); win.position.y = wy; g.add(win); }
      for (const wz of [-3, 3]) for (const wx of [-1.1, 1.1]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 14), tyre); wh.rotation.z = Math.PI / 2; wh.position.set(wx, 0.6, wz); g.add(wh); }
      areaGroup.add(g); colliders.push(new THREE.Box3().setFromObject(g));
    }
    const cabBlack = new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.4, metalness: 0.4 });
    function cab(x, z, ry) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.5, 4.4), cabBlack); body.position.y = 0.9; body.castShadow = true; g.add(body); solids.push(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 2.4), cabBlack); cabin.position.set(0, 1.9, -0.2); g.add(cabin); solids.push(cabin);
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.8, 2.2), busWin); win.position.set(0, 2.0, -0.2); g.add(win);
      for (const wz of [-1.4, 1.4]) for (const wx of [-1.0, 1.0]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12), tyre); wh.rotation.z = Math.PI / 2; wh.position.set(wx, 0.45, wz); g.add(wh); }
      areaGroup.add(g); colliders.push(new THREE.Box3().setFromObject(g));
    }
    // red K6 phone box
    const phoneRed = new THREE.MeshStandardMaterial({ color: 0xd21f2e, roughness: 0.45, metalness: 0.2 });
    function phoneBox(x, z) {
      const g = new THREE.Group(); g.position.set(x, 0, z);
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.6, 1.0), phoneRed); body.position.y = 1.3; body.castShadow = true; g.add(body); solids.push(body);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.04, 1.5, 1.04), busWin); glass.position.y = 1.7; g.add(glass);
      const crown = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 1.1), phoneRed); crown.position.y = 2.75; g.add(crown);
      areaGroup.add(g); colliders.push(new THREE.Box3().setFromObject(g));
    }
    // street lamp (fake warm glow via emissive, no extra real light)
    const lampPole = new THREE.MeshStandardMaterial({ color: 0x1c2430, roughness: 0.6, metalness: 0.5 });
    const lampGlow = new THREE.MeshStandardMaterial({ color: 0xffe6a8, emissive: 0xffcf80, emissiveIntensity: 1.2, roughness: 0.4 });
    function lamp(x, z) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 10), lampPole); pole.position.set(x, 2.6, z); pole.castShadow = true; areaGroup.add(pole); solids.push(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), lampGlow); head.position.set(x, 5.2, z); areaGroup.add(head);
    }
    // Underground roundel on a pole
    const roundelMat = new THREE.MeshBasicMaterial({ map: roundelTexture(), transparent: true, side: THREE.DoubleSide });
    function roundel(x, z, ry) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 8), lampPole); pole.position.set(x, 1.7, z); areaGroup.add(pole); solids.push(pole);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), roundelMat); sign.position.set(x, 3.5, z); sign.rotation.y = ry; areaGroup.add(sign);
    }
    // Union Jack banner hung on a building front
    const jackMat = new THREE.MeshBasicMaterial({ map: unionJackTexture(), side: THREE.DoubleSide });
    function unionJack(x, z, ry) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), jackMat); b.position.set(x, 6.5, z); b.rotation.y = ry; areaGroup.add(b);
    }

    // scatter the props down the avenue
    for (let z = -L + 24; z < L - 8; z += 15) {
      lamp(AX - (SHW + 2), z); lamp(AX + (SHW + 2), z + 7);
    }
    for (const [x, z, ry] of [[AX - (SHW - 1.5), 60, 0.4], [AX + (SHW - 1.8), 8, -0.3], [AX - (SHW - 2), -44, 0.2], [AX + (SHW - 1.5), -84, -0.4]]) bus(x, z, ry);
    for (const [x, z, ry] of [[AX + (SHW - 1.2), 88, 2.4], [AX - (SHW - 1.2), 24, 0.9], [AX + (SHW - 1.4), -16, 2.0], [AX - (SHW - 1.3), -64, 1.2]]) cab(x, z, ry);
    for (const [x, z] of [[AX - (SHW + 2.6), 96], [AX + (SHW + 2.6), 40], [AX - (SHW + 2.6), -24], [AX + (SHW + 2.6), -70]]) phoneBox(x, z);
    for (const [x, z, ry] of [[AX - (SHW + 2.4), 72, Math.PI / 2], [AX + (SHW + 2.4), -8, -Math.PI / 2], [AX - (SHW + 2.4), -88, Math.PI / 2]]) roundel(x, z, ry);
    for (const [x, z, ry] of [[AX - (innerX - 0.2), 50, Math.PI / 2], [AX + (innerX - 0.2), -2, -Math.PI / 2], [AX - (innerX - 0.2), -56, Math.PI / 2]]) unionJack(x, z, ry);

    // sandbag/concrete cover in the street for firefights (colliders)
    const coverMat = new THREE.MeshStandardMaterial({ map: loadTex("stone", 1, 1), roughness: 0.95 });
    for (const [ex, z] of [[-4, 78], [5, 30], [-6, -12], [4, -50], [-3, -78]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 1.1), coverMat);
      bar.position.set(AX + ex, 0.55, z); bar.castShadow = true; areaGroup.add(bar); solids.push(bar);
      colliders.push(new THREE.Box3().setFromObject(bar));
    }

    // --- extra vehicles: saloon cars + vans, some angled in the street to
    // form chicanes you weave around (breaks the straight-line run) ----------
    const carCols = [0x274a7a, 0x6a1e1e, 0x2c2f33, 0x1f5a3a, 0xb8b2a4];
    function sedan(x, z, ry, col) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
      const paint = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.55 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 4.4), paint); body.position.y = 0.7; body.castShadow = true; g.add(body); solids.push(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.86, 2.2), paint); cabin.position.set(0, 1.5, -0.1); g.add(cabin); solids.push(cabin);
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 2.0), busWin); win.position.set(0, 1.55, -0.1); g.add(win);
      for (const wz of [-1.4, 1.4]) for (const wx of [-0.98, 0.98]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), tyre); wh.rotation.z = Math.PI / 2; wh.position.set(wx, 0.42, wz); g.add(wh); }
      areaGroup.add(g); colliders.push(new THREE.Box3().setFromObject(g));
    }
    function van(x, z, ry, col) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
      const paint = new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, metalness: 0.4 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.0, 5.0), paint); body.position.y = 1.2; body.castShadow = true; g.add(body); solids.push(body);
      const win = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.7, 1.6), busWin); win.position.set(0, 1.9, 1.6); g.add(win);
      for (const wz of [-1.7, 1.7]) for (const wx of [-1.08, 1.08]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.34, 12), tyre); wh.rotation.z = Math.PI / 2; wh.position.set(wx, 0.5, wz); g.add(wh); }
      areaGroup.add(g); colliders.push(new THREE.Box3().setFromObject(g));
    }
    let ci = 0;
    for (const [ex, z, ry] of [[7, 100, 0.5], [-7, 44, -0.5], [6, -4, 1.4], [-6, -34, 0.7], [7, -66, -1.2], [-7, -100, 0.3]]) sedan(AX + ex, z, ry, carCols[ci++ % carCols.length]);
    for (const [ex, z, ry] of [[-8, 68, 1.6], [8, 12, -1.6], [-8, -54, 1.2]]) van(AX + ex, z, ry, carCols[ci++ % carCols.length]);

    // --- PLAZA (right side, z ~ -10): fountain island you round + market ------
    (function plaza() {
      const px = AX + 8, pz = -10;
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.8, 20), coverMat);
      basin.position.set(px, 0.4, pz); basin.castShadow = true; areaGroup.add(basin); solids.push(basin);
      colliders.push(new THREE.Box3().setFromObject(basin));
      const water = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.2, 20), new THREE.MeshStandardMaterial({ color: 0x2f6f9c, transparent: true, opacity: 0.8, roughness: 0.2, metalness: 0.1 }));
      water.position.set(px, 0.75, pz); areaGroup.add(water);
      const col2 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 2.4, 12), coverMat); col2.position.set(px, 1.6, pz); areaGroup.add(col2);
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), coverMat); top.position.set(px, 3.1, pz); areaGroup.add(top);
      // market stalls (striped awnings) forming a slalom nearby
      const awnCols = [0xcf3b3b, 0x2f7fcf, 0x2fae5f];
      for (const [sx, sz, aw] of [[-5, 8, 0], [5, -26, 1], [-4, -46, 2]]) {
        const st = new THREE.Group(); st.position.set(AX + sx, 0, sz);
        const table = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 1.4), new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.8 })); table.position.y = 0.5; st.add(table); solids.push(table);
        const awn = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 1.8), new THREE.MeshStandardMaterial({ color: awnCols[aw], roughness: 0.6 })); awn.position.set(0, 2.1, 0); awn.rotation.x = -0.2; st.add(awn);
        for (const cx2 of [-1.2, 1.2]) { const pst = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.1, 6), lampPole); pst.position.set(cx2, 1.05, -0.7); st.add(pst); }
        areaGroup.add(st); colliders.push(new THREE.Box3().setFromObject(st));
      }
    })();

    // --- PARK (left side, z 30..58): grass, trees, fence, benches ------------
    (function park() {
      const grassMat = new THREE.MeshStandardMaterial({ color: 0x3f6b34, roughness: 1 });
      const gx = AX - (SHW + 8);
      const lawn = new THREE.Mesh(new THREE.BoxGeometry(16, 0.22, 30), grassMat); lawn.position.set(gx, 0.11, 44); lawn.receiveShadow = true; areaGroup.add(lawn); solids.push(lawn);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.9 });
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x35702f, roughness: 0.85 });
      for (const [tx, tz] of [[-4, 34], [3, 40], [-2, 48], [5, 54], [-5, 56], [1, 30]]) {
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 2.6, 8), trunkMat); tr.position.set(gx + tx, 1.3, tz); tr.castShadow = true; areaGroup.add(tr);
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 1), leafMat); crown.position.set(gx + tx, 3.4, tz); crown.castShadow = true; areaGroup.add(crown);
      }
      // low iron fence along the park frontage
      for (let fz = 30; fz <= 58; fz += 1.4) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), lampPole); post.position.set(AX - (SHW + 0.6), 0.6, fz); areaGroup.add(post);
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 28), lampPole); rail.position.set(AX - (SHW + 0.6), 1.0, 44); areaGroup.add(rail);
      // a couple of benches just inside the street
      for (const bz of [36, 50]) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.15, 0.6), trunkMat); seat.position.set(AX - (SHW - 1.4), 0.55, bz); areaGroup.add(seat); solids.push(seat);
      }
    })();

    // --- cross-street vistas: perpendicular roads receding into the fog ------
    for (const [s, z] of [[-1, 20], [1, 78], [-1, -68]]) {
      const road2 = new THREE.Mesh(new THREE.PlaneGeometry(40, 7), roadMat); // 40 along X (into the side street)
      road2.rotation.x = -Math.PI / 2;
      road2.position.set(AX + s * (SHW + 22), 0.02, z); areaGroup.add(road2);
      // distant buildings framing the side street
      for (const dz of [-7, 7]) {
        const fb = new THREE.Mesh(new THREE.BoxGeometry(10, 16, 8), brickMats[(Math.random() * brickMats.length) | 0]);
        fb.position.set(AX + s * (SHW + 32), 8, z + dz); fb.castShadow = true; areaGroup.add(fb);
      }
    }

    // --- ammo supply points along the route (kept inside the walkable width
    // so you can actually reach them; radius is generous) -------------------
    function ammoPoint(z, s) {
      const x = AX + s * (SHW - 1.6);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.05, 1.05), new THREE.MeshStandardMaterial({ color: 0x3f4a2c, roughness: 0.7, metalness: 0.2 }));
      crate.position.set(x, 0.62, z); crate.castShadow = true; areaGroup.add(crate); solids.push(crate);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.18, 1.09), new THREE.MeshStandardMaterial({ color: 0xffcf3a, emissive: 0xffb000, emissiveIntensity: 0.55 }));
      stripe.position.set(x, 0.95, z); areaGroup.add(stripe);
      const lbl = makeLabel("弹药补给 [E]", "#ffd23a"); lbl.position.set(x, 1.8, z); areaGroup.add(lbl);
      interactables.push({ name: "弹药补给", action: "ammo", pos: new THREE.Vector3(x, 0, z), radius: 3.0 });
    }
    ammoPoint(84, 1); ammoPoint(28, -1); ammoPoint(-26, 1); ammoPoint(-78, -1);

    // a couple of loot supply crates along the way (also within reach)
    makeSupplyCrate(-(SHW - 1.6), 54, "lc1");
    makeSupplyCrate(SHW - 1.6, -40, "lc2");

    // stage gates spanning the street (open until each stage seals them)
    for (const z of GATE_Z) makeGate(AX, z, "z");

    // extract pad at the near (spawn) end (per-map interactable at this AX)
    areaGroup.add(place(new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 40), mint), AX, 0.16, RL - 8).rotateX(-Math.PI / 2));
    const exLabel = makeLabel("撤离点 [E]", "#8effb0"); exLabel.position.set(AX, 2.4, RL - 8); areaGroup.add(exLabel);
    interactables.push({ name: "撤离点", action: "extract", pos: new THREE.Vector3(AX, 0, RL - 8), radius: 2.6 });
  }

  // Reusable Eiffel Tower (lattice iron) added to the current areaGroup at (bx,bz).
  function buildEiffel(bx, bz) {
    const iron = new THREE.MeshStandardMaterial({ color: 0x6b5b45, roughness: 0.6, metalness: 0.55 });
    const H = 82;
    const legSpread = [12, 7.5, 4, 2.2, 1.1];
    const legY = [0, 22, 40, 58, H];
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      for (let k = 0; k < legY.length - 1; k += 1) {
        const y0 = legY[k], y1 = legY[k + 1], r0 = legSpread[k], r1 = legSpread[k + 1];
        const x0 = bx + sx * r0, z0 = bz + sz * r0, x1 = bx + sx * r1, z1 = bz + sz * r1;
        const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
        const beam = new THREE.Mesh(new THREE.BoxGeometry(1.0, len, 1.0), iron);
        beam.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize());
        beam.castShadow = true; areaGroup.add(beam);
      }
    }
    for (const [py, pr] of [[22, 8.5], [40, 5], [58, 3]]) {
      const ring = new THREE.Mesh(new THREE.BoxGeometry(pr * 2 + 1, 1.3, pr * 2 + 1), iron);
      ring.position.set(bx, py, bz); areaGroup.add(ring);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(8, 0.7, 8, 20, Math.PI), iron);
    arch.position.set(bx, 13, bz); arch.rotation.x = Math.PI; areaGroup.add(arch);
    const upper = new THREE.Mesh(new THREE.ConeGeometry(2.2, 18, 6), iron); upper.position.set(bx, H - 5, bz); upper.castShadow = true; areaGroup.add(upper);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 9, 6), iron); ant.position.set(bx, H + 6, bz); areaGroup.add(ant);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffb020, emissiveIntensity: 1.3 }));
    beacon.position.set(bx, H + 10.5, bz); areaGroup.add(beacon);
  }

  // ===== PARIS map: a WINDING Haussmann boulevard (~5× the London footprint).
  // The route zig-zags through 5 legs with 90° turns at landmark junctions.
  // Player + enemies are confined to the union of the leg segments. =========
  // Path points: x is LOCAL (relative to AX); z is absolute.
  const PARIS_PATH = [
    { x: 0, z: 120 }, { x: 0, z: 48 }, { x: 88, z: 48 },
    { x: 88, z: -44 }, { x: -44, z: -44 }, { x: -44, z: -150 },
  ];
  function buildParis() {
    const PHW = SHW; // corridor half-width
    const cobbleMat = new THREE.MeshStandardMaterial({ map: loadTex("cobble", 6, 6), roughness: 0.95 });
    const paveMat = new THREE.MeshStandardMaterial({ map: loadTex("pavement", 3, 3), roughness: 1 });
    const limeMats = [
      new THREE.MeshStandardMaterial({ map: loadTex("limestone", 2, 3), color: 0xe8dcc0, roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ map: loadTex("limestone", 2, 3), color: 0xd8ccae, roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ map: loadTex("paris_wall", 2, 3), color: 0xe4dcc6, roughness: 0.85 }),
    ];
    const roofMat = new THREE.MeshStandardMaterial({ map: loadTex("roof", 3, 2), color: 0x5a6470, roughness: 0.8 });
    const stoneMat = new THREE.MeshStandardMaterial({ map: loadTex("stone", 2, 3), roughness: 0.9 });
    const winMat = new THREE.MeshStandardMaterial({ color: 0x2a3542, emissive: 0x0a1420, roughness: 0.3, metalness: 0.4 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4530, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x5a8a3a, roughness: 0.85 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x16181e, roughness: 0.5, metalness: 0.6 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xffe6a8, emissive: 0xffcf80, emissiveIntensity: 1.3, roughness: 0.4 });

    parisSegments.length = 0;
    for (let i = 0; i < PARIS_PATH.length - 1; i += 1) {
      const a = PARIS_PATH[i], b = PARIS_PATH[i + 1];
      parisSegments.push({
        minX: AX + Math.min(a.x, b.x) - PHW, maxX: AX + Math.max(a.x, b.x) + PHW,
        minZ: Math.min(a.z, b.z) - PHW, maxZ: Math.max(a.z, b.z) + PHW,
      });
    }

    function building(cx, cz, alongZ, w, mat) {
      const h = 18 + Math.random() * 5, depth = 9;
      const sizeX = alongZ ? depth : w, sizeZ = alongZ ? w : depth;
      const b = new THREE.Mesh(new THREE.BoxGeometry(sizeX, h, sizeZ), mat);
      b.position.set(cx, h / 2, cz); b.castShadow = true; b.receiveShadow = true; areaGroup.add(b); solids.push(b);
      const shop = new THREE.Mesh(new THREE.BoxGeometry(sizeX + 0.2, 3, sizeZ + 0.2), stoneMat); shop.position.set(cx, 1.5, cz); areaGroup.add(shop);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(sizeX, 3.2, sizeZ), roofMat); roof.position.set(cx, h + 1.4, cz); roof.scale.set(0.86, 1, 0.86); roof.castShadow = true; areaGroup.add(roof);
    }
    function buildLeg(a, b) {
      const vert = a.x === b.x;
      const cx = AX + (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
      const span = vert ? Math.abs(b.z - a.z) : Math.abs(b.x - a.x);
      const roadX = vert ? PHW * 2 : span + PHW * 2, roadZ = vert ? span + PHW * 2 : PHW * 2;
      const road = new THREE.Mesh(new THREE.PlaneGeometry(roadX, roadZ), cobbleMat);
      road.rotation.x = -Math.PI / 2; road.position.set(cx, 0, cz); road.receiveShadow = true; areaGroup.add(road); solids.push(road);
      for (const s of [-1, 1]) {
        const swX = vert ? 6 : roadX, swZ = vert ? roadZ : 6;
        const sx = vert ? cx + s * (PHW + 3) : cx, sz = vert ? cz : cz + s * (PHW + 3);
        const sw = new THREE.Mesh(new THREE.BoxGeometry(swX, 0.2, swZ), paveMat); sw.position.set(sx, 0.1, sz); sw.receiveShadow = true; areaGroup.add(sw); solids.push(sw);
      }
      const lo = vert ? Math.min(a.z, b.z) : Math.min(a.x, b.x);
      const hi = vert ? Math.max(a.z, b.z) : Math.max(a.x, b.x);
      for (const s of [-1, 1]) {
        for (let t = lo + 8; t < hi - 4; t += 13) {
          if (Math.random() < 0.14) continue;
          const bx = vert ? cx + s * (PHW + 9) : AX + t;
          const bz = vert ? t : cz + s * (PHW + 9);
          building(bx, bz, vert, 11, limeMats[(Math.random() * limeMats.length) | 0]);
        }
        for (let t = lo + 12; t < hi - 6; t += 22) {
          const tx = vert ? cx + s * (PHW + 1.6) : AX + t;
          const tz = vert ? t : cz + s * (PHW + 1.6);
          const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 3.2, 8), trunkMat); tr.position.set(tx, 1.6, tz); tr.castShadow = true; areaGroup.add(tr); solids.push(tr);
          const cr = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 1), leafMat); cr.position.set(tx, 4.2, tz); cr.castShadow = true; areaGroup.add(cr);
          const px = vert ? cx + s * (PHW + 1.4) : AX + t + 8;
          const pz = vert ? t + 8 : cz + s * (PHW + 1.4);
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 5, 8), lampMat); pole.position.set(px, 2.5, pz); areaGroup.add(pole); solids.push(pole);
          const hd = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), glowMat); hd.position.set(px, 5.1, pz); areaGroup.add(hd);
        }
      }
    }
    for (let i = 0; i < PARIS_PATH.length - 1; i += 1) buildLeg(PARIS_PATH[i], PARIS_PATH[i + 1]);

    // Arc de Triomphe over the P1→P2 turn (pass under it)
    (function arc() {
      const z = 48, x0 = AX + 20, aw = 16, ah = 17, at = 8;
      for (const sz of [-1, 1]) {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(at, ah, 3.4), stoneMat);
        pier.position.set(x0, ah / 2, z + sz * (aw / 2)); pier.castShadow = true; areaGroup.add(pier); solids.push(pier);
        colliders.push(new THREE.Box3().setFromObject(pier));
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(at + 1, 5, aw + 3.4), stoneMat); top.position.set(x0, ah + 2.5, z); top.castShadow = true; areaGroup.add(top); solids.push(top);
      const vault = new THREE.Mesh(new THREE.TorusGeometry(aw / 2 - 1.8, 1.4, 8, 16, Math.PI), stoneMat); vault.position.set(x0, ah - 2, z); vault.rotation.set(Math.PI, Math.PI / 2, 0); areaGroup.add(vault);
      const attic = new THREE.Mesh(new THREE.BoxGeometry(at + 1.6, 3, aw + 4), stoneMat); attic.position.set(x0, ah + 6.5, z); areaGroup.add(attic);
    })();
    // roundabout island at the P2→P3 corner (round it)
    (function rond() {
      const cx = AX + 88, cz = 48;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.7, 0.7, 24), stoneMat); base.position.set(cx, 0.35, cz); areaGroup.add(base); solids.push(base); colliders.push(new THREE.Box3().setFromObject(base));
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 9, 12), stoneMat); col.position.set(cx, 4.9, cz); col.castShadow = true; areaGroup.add(col);
      const statue = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), new THREE.MeshStandardMaterial({ color: 0xc9a94a, metalness: 0.7, roughness: 0.3, emissive: 0x5a4310, emissiveIntensity: 0.4 })); statue.position.set(cx, 9.9, cz); areaGroup.add(statue);
    })();
    // Eiffel Tower at the finale (beyond the boss)
    buildEiffel(AX - 44, -168);
    // Seine strip + bridge alongside leg D
    (function seine() {
      const river = new THREE.Mesh(new THREE.PlaneGeometry(120, 20), new THREE.MeshStandardMaterial({ color: 0x35617f, transparent: true, opacity: 0.9, roughness: 0.25 }));
      river.rotation.x = -Math.PI / 2; river.position.set(AX + 22, -0.05, -66); areaGroup.add(river);
      for (const bx of [AX - 10, AX + 54]) { const arch = new THREE.Mesh(new THREE.TorusGeometry(3, 0.8, 8, 14, Math.PI), stoneMat); arch.position.set(bx, 1.4, -66); arch.rotation.x = Math.PI; areaGroup.add(arch); }
    })();

    // parked cars (weave obstacles) + cover
    const carPaint = [0x9a9a9a, 0x2a2f3a, 0x6a1e1e, 0x27506a];
    function car(cx, cz, ry, col) {
      const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = ry;
      const paint = new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, metalness: 0.5 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.0, 4.0), paint); body.position.y = 0.7; body.castShadow = true; g.add(body); solids.push(body);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 2.0), paint); cab.position.set(0, 1.45, -0.1); g.add(cab); solids.push(cab);
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.62, 1.8), winMat); win.position.set(0, 1.5, -0.1); g.add(win);
      areaGroup.add(g); colliders.push(new THREE.Box3().setFromObject(g));
    }
    let ci = 0;
    for (const [lx, z, ry] of [[5, 90, 0.4], [40, 48, 1.6], [88, 4, 0.3], [20, -44, 1.6], [-44, -100, 0.5]]) car(AX + lx, z, ry, carPaint[ci++ % carPaint.length]);
    for (const [lx, z] of [[-5, 70], [60, 48], [88, -18], [0, -44], [-44, -78]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 1.1), stoneMat); bar.position.set(AX + lx, 0.55, z); bar.castShadow = true; areaGroup.add(bar); solids.push(bar); colliders.push(new THREE.Box3().setFromObject(bar));
    }

    // ammo/loot along the winding route
    function ammoPoint(lx, z) {
      const x = AX + lx;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.05, 1.05), new THREE.MeshStandardMaterial({ color: 0x3f4a2c, roughness: 0.7 })); crate.position.set(x, 0.62, z); crate.castShadow = true; areaGroup.add(crate); solids.push(crate);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.18, 1.09), new THREE.MeshStandardMaterial({ color: 0xffcf3a, emissive: 0xffb000, emissiveIntensity: 0.55 })); stripe.position.set(x, 0.95, z); areaGroup.add(stripe);
      const lbl = makeLabel("弹药补给 [E]", "#ffd23a"); lbl.position.set(x, 1.8, z); areaGroup.add(lbl);
      interactables.push({ name: "弹药补给", action: "ammo", pos: new THREE.Vector3(x, 0, z), radius: 3.0 });
    }
    ammoPoint(8, 100); ammoPoint(60, 48); ammoPoint(88, -20); ammoPoint(10, -44); ammoPoint(-44, -110);
    makeSupplyCrate(9, 64, "pc1"); makeSupplyCrate(88, 20, "pc2"); makeSupplyCrate(-44, -120, "pc3");

    // gates seal each turn until that leg's stage is cleared
    makeGate(AX + 6, 48, "x");   // G0 → entry to leg B
    makeGate(AX + 88, 42, "z");  // G1 → entry to leg C
    makeGate(AX + 82, -44, "x"); // G2 → entry to leg D
    makeGate(AX - 44, -50, "z"); // G3 → entry to leg E

    // extract pad at the spawn end
    areaGroup.add(place(new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 40), mint), AX, 0.16, 116).rotateX(-Math.PI / 2));
    const exLabel = makeLabel("撤离点 [E]", "#8effb0"); exLabel.position.set(AX, 2.4, 116); areaGroup.add(exLabel);
    interactables.push({ name: "撤离点", action: "extract", pos: new THREE.Vector3(AX, 0, 116), radius: 2.6 });
  }

  function buildMoscow() {
    // Soviet / fortress aesthetic: grey concrete, brick, armor plating, missiles
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x6b7a8f, roughness: 0.92, metalness: 0.1 });
    const brickMat = new THREE.MeshStandardMaterial({ map: loadTex("brick_red", 3, 3), color: 0x8a4a3a, roughness: 0.9 });
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.4, metalness: 0.7 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x5a6b7c, roughness: 0.3, metalness: 0.8 });
    const darkConcrete = new THREE.MeshStandardMaterial({ color: 0x4a5566, roughness: 0.85, metalness: 0.05 });

    // Road (concrete, utilitarian)
    const roadLength = RL * 2 + 32, roadWidth = SHW * 2 + 12;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, roadLength), concreteMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(AX, 0, 0);
    road.receiveShadow = true;
    areaGroup.add(road);
    solids.push(road);

    // Bunker / fortress structures along the route
    const bunkers = [
      { z: 76, name: "装甲门前 I" },
      { z: 40, name: "装甲门前 II" },
      { z: -20, name: "指挥堡垒" },
      { z: -64, name: "导弹阵地" },
    ];

    for (const bunk of bunkers) {
      // Main bunker body (tall, fortress-like)
      const body = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 12), armorMat);
      body.position.set(AX, 4, bunk.z);
      body.castShadow = true;
      areaGroup.add(body);
      solids.push(body);

      // Roof plating (angled)
      const roof = new THREE.Mesh(new THREE.BoxGeometry(16.8, 2, 13), steelMat);
      roof.position.set(AX, 9, bunk.z);
      roof.castShadow = true;
      areaGroup.add(roof);

      // Gun emplacements / slit windows (small rectangles)
      for (let i = 0; i < 3; i++) {
        const slits = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.4), darkConcrete);
        slits.position.set(AX - 6 + i * 6, 5.5, bunk.z + 6.2);
        areaGroup.add(slits);
      }

      // Label
      const lbl = makeLabel(bunk.name, "#6b9eff");
      lbl.position.set(AX, 10.5, bunk.z);
      areaGroup.add(lbl);
    }

    // Missile / antenna towers (Soviet style)
    for (let i = 0; i < 3; i++) {
      const z = 60 - i * 50, x = AX + (i % 2 ? 20 : -20);
      // Tower pole
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 28, 8), steelMat);
      pole.position.set(x, 14, z);
      pole.castShadow = true;
      areaGroup.add(pole);
      solids.push(pole);
      // Antenna dish
      const dish = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.2, 12), armorMat);
      dish.position.set(x, 30, z);
      dish.castShadow = true;
      areaGroup.add(dish);
      // Support struts
      for (let j = 0; j < 3; j++) {
        const angle = (j / 3) * Math.PI * 2;
        const sx = x + Math.cos(angle) * 4, sz = z + Math.sin(angle) * 4;
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 18, 6), steelMat);
        strut.position.set(sx, 11, sz);
        const dir = new THREE.Vector3(x - sx, 18, z - sz);
        strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        areaGroup.add(strut);
      }
    }

    // Industrial buildings (concrete blocks)
    const buildingPositions = [
      { x: -18, z: 50 }, { x: 18, z: 50 },
      { x: -20, z: 0 }, { x: 20, z: 0 },
      { x: -22, z: -50 }, { x: 22, z: -50 },
    ];

    for (const pos of buildingPositions) {
      const building = new THREE.Mesh(new THREE.BoxGeometry(10, 7, 9), brickMat);
      building.position.set(AX + pos.x, 3.5, pos.z);
      building.castShadow = true;
      areaGroup.add(building);
      solids.push(building);

      // Small windows (industrial style)
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.2), darkConcrete);
          win.position.set(AX + pos.x - 3 + col * 3, 4 + row * 2, pos.z + 4.6);
          areaGroup.add(win);
        }
      }
    }

    // Fence / barrier system (chainlink style)
    for (let i = 0; i < 5; i++) {
      const fencePost = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 4, 6), steelMat);
      fencePost.position.set(AX - 30, 2, -90 + i * 30);
      fencePost.castShadow = true;
      areaGroup.add(fencePost);
      solids.push(fencePost);
    }

    // Deploy and extract points
    areaSpawn.set(AX, 0, RL - 12);
    areaGroup.add(place(new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 40), mint), AX, 0.16, RL - 10).rotateX(-Math.PI / 2));
    const dpLabel = makeLabel("部署点 [D]", "#8effb0");
    dpLabel.position.set(AX, 2.4, RL - 12);
    areaGroup.add(dpLabel);

    // Extract
    areaGroup.add(place(new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 40), mint), AX, 0.16, -RL + 10).rotateX(-Math.PI / 2));
    const exLabel2 = makeLabel("撤离点 [E]", "#8effb0");
    exLabel2.position.set(AX, 2.4, -RL + 12);
    areaGroup.add(exLabel2);
    interactables.push({ name: "撤离点", action: "extract", pos: new THREE.Vector3(AX, 0, -RL + 10), radius: 2.6 });

    // Setup Moscow gates (4 gates, like London)
    const GATE_Z_MOSCOW = [64, 12, -40, -84];
    for (let i = 0; i < GATE_Z_MOSCOW.length; i++) {
      const gz = GATE_Z_MOSCOW[i];
      moscowGates[i] = makeGate(AX, gz, "x");
    }

    // Setup Moscow segments (simple: just the main corridor)
    moscowSegments.length = 0;
    moscowSegments.push({
      minX: AX - SHW, maxX: AX + SHW,
      minZ: -RL, maxZ: RL,
    });
  }

  // Build all three maps at their own offsets/groups (only one is shown at a time).
  AX = AXL; areaGroup = londonGroup; gates = londonGates; buildLondon();
  AX = AXP; areaGroup = parisGroup; gates = parisGates; buildParis();
  AX = AXM; areaGroup = moscowGroup; gates = moscowGates; buildMoscow();
  AX = AXL; areaGroup = londonGroup; gates = londonGates; // default active = London

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

  // Enemy tiers: colour-coded so elites read at a glance. dmgMul scales the
  // damage they deal; hpMul/scale set their toughness/size.
  // Melee-only swarm: fast, aggressive, they rush you and strike in melee.
  const TIERS = {
    grunt: { tint: null, emissive: null, hpMul: 1, dmgMul: 1, speed: 5.6, scale: 1 },
    elite1: { tint: 0x4aa3ff, emissive: 0x123a6a, hpMul: 1.7, dmgMul: 1.3, speed: 6.2, scale: 1.12, name: "精英" },
    elite2: { tint: 0xb06bff, emissive: 0x40206a, hpMul: 2.6, dmgMul: 1.6, speed: 5.2, scale: 1.22, name: "重装精英" },
    heavy: { tint: 0xd06a5a, emissive: 0x902018, hpMul: 4, dmgMul: 1.8, speed: 3.8, scale: 1.45, name: "重型" },
    boss: { tint: 0xffb020, emissive: 0x7a3a00, hpMul: 1, dmgMul: 2.4, speed: 5.0, scale: 2.4, name: "首领" },
  };

  // makeEnemy(x, z, opts) — x/z are relative to AX. opts: { hp, tier, dmgMul, boss, name }.
  function makeEnemy(x, z, opts = {}) {
    const tier = TIERS[opts.tier || "grunt"] || TIERS.grunt;
    const scale = opts.scale || tier.scale;
    const hp = opts.hp != null ? opts.hp : 60;
    const g = new THREE.Group();
    g.position.set(AX + x, 0, z);
    const ctrl = {
      group: g, health: hp, maxHealth: hp, alive: true, hitFlash: 0, phase: Math.random() * 6,
      heavy: opts.tier === "heavy" || !!opts.boss,
      elite: opts.tier === "elite1" || opts.tier === "elite2",
      boss: !!opts.boss,
      tier: opts.tier || "grunt",
      name: opts.name || tier.name || "训练兵",
      dmgMul: opts.dmgMul != null ? opts.dmgMul : tier.dmgMul,
      dying: false, deathT: 0,
      speed: opts.speed || tier.speed + (opts.boss ? 0 : Math.random() * 0.7),
      engaged: false,
      nextShot: state.time + (opts.boss ? 1.5 : 3.5 + Math.random() * 3),
      strafePhase: Math.random() * 6,
      strafeDir: Math.random() < 0.5 ? 1 : -1,
      stagger: 0,
      flashT: 0,
      character: null,
      rig: null,
    };

    // Pick a species for visual variety. Robots skew toward the tougher tiers
    // (elite2 always a droid; grunts/elite1 ~40% droids); heavy & boss stay
    // humanoid brutes. `species` can be forced via opts.
    let species = opts.species;
    if (!species) {
      if (opts.tier === "elite2") species = "robot";
      else if (opts.boss || opts.tier === "heavy") species = "soldier";
      else species = Math.random() < 0.4 ? "robot" : "soldier";
    }
    const inst = characterReady()
      ? makeCharacter({ species, tint: tier.tint == null ? undefined : tier.tint, emissive: tier.emissive, kitIndex: Math.floor(Math.random() * 4) })
      : null;
    if (inst) {
      inst.group.scale.setScalar(scale);
      inst.group.rotation.y = inst.baseYaw; // orient the model's front to +Z
      g.add(inst.group);
      ctrl.character = inst;
      ctrl.walkAnim = "Idle";
      ctrl.lastX = g.position.x;
      ctrl.lastZ = g.position.z;
    } else {
      const body = buildSoldier(tier.tint == null ? 0xc8d2dc : tier.tint);
      body.scale.setScalar(scale);
      g.add(body);
      ctrl.rig = body.userData.rig;
      ctrl.flashMesh = body.userData.flash;
      ctrl.walkPhase = Math.random() * 6;
    }

    // per-part invisible hitboxes with distinct damage multipliers:
    // [w, h, d, y, x, part, mult]
    const PARTS = [
      [0.34, 0.36, 0.34, 1.66, 0, "head", 2.5], // head — highest
      [0.6, 0.42, 0.42, 1.28, 0, "chest", 1.3], // chest — vitals
      [0.56, 0.5, 0.4, 0.86, 0, "body", 1.0], // abdomen — baseline
      [0.2, 0.7, 0.28, 1.24, 0.4, "arm", 0.7], // right arm
      [0.2, 0.7, 0.28, 1.24, -0.4, "arm", 0.7], // left arm
      [0.24, 0.9, 0.3, 0.45, 0.16, "leg", 0.65], // right leg
      [0.24, 0.9, 0.3, 0.45, -0.16, "leg", 0.65], // left leg
    ];
    ctrl.bodies = [];
    for (const [w, h, dp, y, x, part, mult] of PARTS) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(w * scale, h * scale, dp * scale), hitMat);
      box.position.set(x * scale, y * scale, 0);
      box.userData = { type: "enemy", enemy: ctrl, part, mult };
      g.add(box);
      ctrl.bodies.push(box);
      if (part === "head") ctrl.headBox = box;
    }

    scene.add(g);
    enemies.push(ctrl);
    return ctrl;
  }

  const state = { score: 0, time: 0, inArea: false, wave: 0, stage: 0, boss: null, activeGate: -1 };

  // --- linear stage progression -------------------------------------------
  // Each stage triggers when the player advances past `triggerZ` (moving from
  // +Z toward -Z), spawns a squad AHEAD, and seals the street with `gate`
  // (an index into the gate list). The gate opens only when the squad is
  // cleared, so you must fight your way forward — no running to the boss.
  const LONDON_STAGES = [
    { triggerZ: RL - 30, gate: 0, name: "第 1 区 · 街口", sub: "清空敌人后闸门开启", zone: [66, 92],
      squad: [{ tier: "grunt", hp: 55, n: 12 }] },
    { triggerZ: 62, gate: 1, name: "第 2 区 · 商业街", sub: "敌人增援，出现精英", zone: [12, 58],
      squad: [{ tier: "grunt", hp: 75, n: 16 }, { tier: "elite1", hp: 150, n: 3 }] },
    { triggerZ: 10, gate: 2, name: "第 3 区 · 广场", sub: "潮水般的敌人，蓝色精英", zone: [-38, 6],
      squad: [{ tier: "grunt", hp: 110, n: 20 }, { tier: "elite1", hp: 180, n: 4 }] },
    { triggerZ: -42, gate: 3, name: "第 4 区 · 议会前", sub: "重装精英把守", zone: [-82, -46],
      squad: [{ tier: "grunt", hp: 130, n: 16 }, { tier: "elite2", hp: 320, n: 5 }, { tier: "heavy", hp: 520, n: 2 }] },
    { triggerZ: -86, gate: -1, name: "最终 · 大本钟", sub: "⚠ 最终首领现身", zone: [-100, -92], boss: true,
      bossName: "钢铁首领", bossHp: 4200, squad: [{ tier: "grunt", hp: 120, n: 8 }, { tier: "elite1", hp: 200, n: 4 }] },
  ];
  // Paris is a tougher second campaign (bigger swarms, bigger boss).
  // Paris stages are PATH-aware: `triggerPt`/`spawnPt`/`bossPt` are {x (local),z}
  // points along the winding route (instead of London's z thresholds/zone).
  const PARIS_STAGES = [
    { triggerPt: { x: 0, z: 112 }, spawnPt: { x: 0, z: 82 }, gate: 0, name: "第 1 区 · 林荫大道", sub: "清空敌人后闸门开启",
      squad: [{ tier: "grunt", hp: 80, n: 16 }] },
    { triggerPt: { x: 16, z: 48 }, spawnPt: { x: 50, z: 48 }, gate: 1, name: "第 2 区 · 凯旋门", sub: "穿过凯旋门，精英拦截",
      squad: [{ tier: "grunt", hp: 110, n: 20 }, { tier: "elite1", hp: 200, n: 4 }] },
    { triggerPt: { x: 88, z: 36 }, spawnPt: { x: 88, z: -4 }, gate: 2, name: "第 3 区 · 环岛广场", sub: "重装精英把守环岛",
      squad: [{ tier: "grunt", hp: 150, n: 24 }, { tier: "elite2", hp: 340, n: 5 }] },
    { triggerPt: { x: 76, z: -44 }, spawnPt: { x: 20, z: -44 }, gate: 3, name: "第 4 区 · 塞纳河畔", sub: "重型单位增援",
      squad: [{ tier: "grunt", hp: 170, n: 18 }, { tier: "elite2", hp: 420, n: 6 }, { tier: "heavy", hp: 680, n: 3 }] },
    { triggerPt: { x: -44, z: -58 }, spawnPt: { x: -44, z: -100 }, bossPt: { x: -44, z: -140 }, gate: -1,
      name: "最终 · 埃菲尔铁塔", sub: "⚠ 铁塔首领现身", boss: true,
      bossName: "铁塔守卫者", bossHp: 6000, squad: [{ tier: "grunt", hp: 150, n: 10 }, { tier: "elite2", hp: 320, n: 4 }] },
  ];
  // Moscow is the ultimate challenge — hardest enemies, toughest boss
  const MOSCOW_STAGES = [
    { triggerZ: RL - 30, gate: 0, name: "第 1 区 · 装甲门前", sub: "苏联防线，清空敌人后闸门开启", zone: [66, 92],
      squad: [{ tier: "grunt", hp: 100, n: 18 }, { tier: "elite1", hp: 220, n: 2 }] },
    { triggerZ: 62, gate: 1, name: "第 2 区 · 装备库", sub: "敌人增援，精英把守", zone: [12, 58],
      squad: [{ tier: "grunt", hp: 140, n: 22 }, { tier: "elite1", hp: 280, n: 5 }] },
    { triggerZ: 10, gate: 2, name: "第 3 区 · 指挥中心", sub: "潮水般的敌人，重装精英", zone: [-38, 6],
      squad: [{ tier: "grunt", hp: 180, n: 26 }, { tier: "elite2", hp: 400, n: 6 }] },
    { triggerZ: -42, gate: 3, name: "第 4 区 · 导弹阵地", sub: "终极防线，重型单位群", zone: [-82, -46],
      squad: [{ tier: "grunt", hp: 200, n: 20 }, { tier: "elite2", hp: 480, n: 7 }, { tier: "heavy", hp: 800, n: 3 }] },
    { triggerZ: -86, gate: -1, name: "最终 · 克里姆林宫", sub: "⚠ 红堡首领现身", zone: [-100, -92], boss: true,
      bossName: "红堡首领", bossHp: 7500, squad: [{ tier: "grunt", hp: 180, n: 12 }, { tier: "elite2", hp: 420, n: 5 }] },
  ];
  let STAGES = LONDON_STAGES; // active map's stages (set on deploy)
  const _tmpV = new THREE.Vector3();

  function spawnSquad(st) {
    for (const e of st.squad) {
      for (let i = 0; i < e.n; i += 1) {
        let ex, ez;
        if (st.spawnPt) { // path-aware: cluster around the spawn point, then clamp to the corridor
          ex = st.spawnPt.x + (Math.random() - 0.5) * (SHW * 2 - 4);
          ez = st.spawnPt.z + (Math.random() - 0.5) * 26;
          _tmpV.set(AX + ex, 0, ez); clampToArea(_tmpV); ex = _tmpV.x - AX; ez = _tmpV.z;
        } else { // London zone form
          ex = (Math.random() - 0.5) * (SHW * 2 - 3);
          ez = st.zone[0] + Math.random() * (st.zone[1] - st.zone[0]);
        }
        makeEnemy(ex, ez, { tier: e.tier, hp: e.hp });
      }
    }
  }

  function startStage(idx) {
    const st = STAGES[idx];
    if (!st) return;
    state.stage = idx + 1;
    spawnSquad(st);
    if (st.boss) {
      const bp = st.bossPt || { x: 0, z: -110 };
      const boss = makeEnemy(bp.x, bp.z, { boss: true, tier: "boss", hp: st.bossHp || 4200, name: st.bossName || "最终首领" });
      state.boss = boss;
      if (hooks.onBossSpawn) hooks.onBossSpawn(boss);
    }
    if (st.gate >= 0) { closeGate(st.gate); state.activeGate = st.gate; } // seal the way forward
    if (hooks.onStage) hooks.onStage(st.name, st.sub);
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

  // --- explosions: AOE damage + expanding shockwave visual (rockets) --------
  const explosions = [];
  const explGeo = new THREE.SphereGeometry(1, 16, 12);
  function spawnExplosion(point, radius) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9 });
    const m = new THREE.Mesh(explGeo, mat);
    m.position.copy(point); m.scale.setScalar(0.4);
    scene.add(m);
    explosions.push({ mesh: m, life: 0.4, max: 0.4, radius });
    const light = new THREE.PointLight(0xffb060, 6, radius * 3, 2);
    light.position.copy(point); scene.add(light);
    explosions.push({ light, life: 0.25, max: 0.25 });
    spawnDeathBurst({ x: point.x, y: point.y - 1.2, z: point.z }, true);
    audio.explosion();
  }
  // Damage every enemy within `radius` of `point` (linear falloff). Returns a
  // list of { killed, dmg, heavy, elite, boss, point } for the caller to score.
  function explodeAt(point, radius, maxDamage) {
    const results = [];
    for (const e of enemies) {
      if (!e.alive) continue;
      const cx = e.group.position.x, cy = e.group.position.y + 1.0, cz = e.group.position.z;
      const d = Math.hypot(point.x - cx, point.y - cy, point.z - cz);
      if (d < radius) {
        const dmg = maxDamage * Math.max(0.35, 1 - d / radius);
        const killed = damageEnemy(e, dmg);
        results.push({ killed, dmg, heavy: !!e.heavy, elite: !!e.elite, boss: !!e.boss, point: new THREE.Vector3(cx, cy, cz) });
      }
    }
    spawnExplosion(point, radius);
    return results;
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
    spawnTracer(from, to, e.boss ? 0xff2060 : e.heavy || e.elite ? 0xff4030 : 0xff8a5a);
    audio.enemyShot();
    const base = e.heavy ? 9 + Math.floor(Math.random() * 6) : 4 + Math.floor(Math.random() * 4);
    const dmg = Math.round(base * (e.dmgMul || 1)); // later stages hit harder
    if (hit && hooks.onPlayerHit) hooks.onPlayerHit(dmg);
  }

  // Bright, very short tracer for the player's own shots.
  function spawnPlayerTracer(camera, end, opts = {}) {
    const from = new THREE.Vector3();
    camera.getWorldPosition(from);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    // offset toward the muzzle (right + down + forward of the eye)
    const rightV = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
    from.addScaledVector(rightV, 0.14).addScaledVector(camera.up, -0.12).addScaledVector(dir, 0.55);
    const color = opts.color != null ? opts.color : 0xffe9a0;
    const geo = new THREE.BufferGeometry().setFromPoints([from, end]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: opts.beam ? 0.95 : 0.7 }));
    scene.add(line);
    // laser beams linger a touch longer + glow with a fat translucent tube
    if (opts.beam) {
      const mid = from.clone().add(end).multiplyScalar(0.5);
      const len = from.distanceTo(end);
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, len, 6),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 }),
      );
      tube.position.copy(mid);
      tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(from).normalize());
      scene.add(tube);
      tracers.push({ line: tube, life: 0.1, max: 0.1 });
    }
    tracers.push({ line, life: opts.beam ? 0.1 : 0.06, max: opts.beam ? 0.1 : 0.06 });
  }
  let activeLoot = LONDON_LOOT; // active map's drop table (set on deploy)
  function spawnLoot(pos) {
    const drop = rollLoot(activeLoot);
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
      spawnDeathBurst(ctrl.group.position, ctrl.heavy || ctrl.boss);
      // tougher units guarantee a bigger haul
      const drops = ctrl.boss ? 8 : ctrl.heavy ? 3 : ctrl.elite ? 2 : 1;
      for (let i = 0; i < drops; i += 1) {
        const off = i === 0 ? { x: 0, z: 0 } : { x: (Math.random() - 0.5) * 2.4, z: (Math.random() - 0.5) * 2.4 };
        spawnLoot({ x: ctrl.group.position.x + off.x, z: ctrl.group.position.z + off.z });
      }
      state.score += 1;
      if (ctrl.boss) {
        state.boss = null;
        spawnBossExtract(ctrl.group.position); // #5: extraction appears where the boss fell
        if (hooks.onBossDefeated) hooks.onBossDefeated();
      }
      return true;
    }
    return false;
  }

  // Extra extraction pad spawned right where the boss died, so you don't have
  // to walk the whole route back.
  let bossExtract = null;
  function spawnBossExtract(pos) {
    clearBossExtract();
    const ex = pos ? pos.x : AX, ez = pos ? pos.z : -RL + 14;
    const ring = place(new THREE.Mesh(new THREE.RingGeometry(1.3, 1.8, 40), mint), ex, 0.18, ez).rotateX(-Math.PI / 2);
    areaGroup.add(ring);
    const lbl = makeLabel("撤离点 [E]", "#8effb0"); lbl.position.set(ex, 2.6, ez); areaGroup.add(lbl);
    const it = { name: "撤离点", action: "extract", pos: new THREE.Vector3(ex, 0, ez), radius: 3.4 };
    interactables.push(it);
    bossExtract = { ring, lbl, it };
  }
  function clearBossExtract() {
    if (!bossExtract) return;
    areaGroup.remove(bossExtract.ring); areaGroup.remove(bossExtract.lbl);
    const idx = interactables.indexOf(bossExtract.it); if (idx >= 0) interactables.splice(idx, 1);
    bossExtract = null;
  }

  // Deploy into a specific map ("london" | "paris"). Sets the active offset,
  // group, stages, gates and drop table, then resets the run.
  const MAPS = {
    london: { group: londonGroup, ax: AXL, stages: LONDON_STAGES, gates: londonGates, loot: LONDON_LOOT, segments: londonSegments,
      spawnZ: RL - 12, fog: londonFog, bg: londonBg, key: 0xdfe4ea, keyI: 2.1, hemiSky: 0xc4ccd6, hemiGround: 0x555a60, hemiI: 1.15 },
    paris: { group: parisGroup, ax: AXP, stages: PARIS_STAGES, gates: parisGates, loot: PARIS_LOOT, segments: parisSegments,
      spawnZ: 116, fog: parisFog, bg: parisBg, key: 0xffe7c0, keyI: 2.5, hemiSky: 0xe6d3b0, hemiGround: 0x6a5a44, hemiI: 1.2 },
    moscow: { group: moscowGroup, ax: AXM, stages: MOSCOW_STAGES, gates: moscowGates, loot: MOSCOW_LOOT, segments: moscowSegments,
      spawnZ: RL - 12, fog: moscowFog, bg: moscowBg, key: 0xa8c4e0, keyI: 2.0, hemiSky: 0x7a8aaa, hemiGround: 0x4a5566, hemiI: 1.1 },
  };
  function enterArea(mapId = "london") {
    const m = MAPS[mapId] || MAPS.london;
    // switch the active map wiring
    AX = m.ax; areaGroup = m.group; STAGES = m.stages; gates = m.gates; activeLoot = m.loot; activeSegments = m.segments;
    areaSpawn.set(AX, 0, m.spawnZ);
    extractPos.set(AX, 0, m.spawnZ + 4);
    // atmosphere + sun
    scene.fog = m.fog; scene.background = m.bg;
    key.color.set(m.key); key.intensity = m.keyI;
    key.position.set(AX + 20, 36, 30); key.target.position.set(AX, 0, -20);
    const sc = key.shadow.camera; sc.left = -40; sc.right = 40; sc.top = 60; sc.bottom = -60; sc.far = 150; sc.updateProjectionMatrix();
    hemi.color.set(m.hemiSky); hemi.groundColor.set(m.hemiGround); hemi.intensity = m.hemiI;
    for (const c of supplyCrates) { c.opened = false; c.seamMat.emissiveIntensity = 0.9; }
    londonGroup.visible = mapId === "london";
    parisGroup.visible = mapId === "paris";
    setSky(mapId);
    clearBossExtract();
    state.inArea = true; state.wave = 0; state.stage = 0; state.boss = null; state.activeGate = -1;
    resetGates();
    for (const e of enemies) scene.remove(e.group);
    enemies.length = 0;
    clearLoot(); clearTracers();
    // no enemies up front — stage 1 triggers as the player advances forward
  }
  function enterArea1() { enterArea("london"); } // back-compat
  function extract() {
    scene.fog = baseFog; scene.background = baseBg;
    key.color.set(0xfff4e0); key.intensity = 2.8;
    key.position.set(8, 20, 12);
    key.target.position.set(0, 0, 0);
    const sc = key.shadow.camera;
    sc.left = -28; sc.right = 28; sc.top = 28; sc.bottom = -28; sc.far = 70;
    sc.updateProjectionMatrix();
    hemi.color.set(0xcfe6ff); hemi.groundColor.set(0x35506a); hemi.intensity = 1.1;
    londonGroup.visible = false; parisGroup.visible = false; skyGroup.visible = false;
    clearBossExtract();
    state.inArea = false;
    state.wave = 0;
    state.stage = 0;
    state.boss = null;
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
    // drifting clouds (relative to the sky group centred on the active map)
    if (skyGroup.visible) {
      for (const c of clouds) {
        c.spr.position.x += c.speed * dt;
        if (c.spr.position.x > 170) c.spr.position.x = -170;
      }
    }
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
        // record last frame's position first so real ground speed can be
        // measured after the move (drives the leg-cycle rate; anti foot-slide)
        const prevX = e.group.position.x;
        const prevZ = e.group.position.z;
        // default facing toward the player (used when standing still to shoot)
        const facePlayerYaw = Math.atan2(playerPos.x - e.group.position.x, playerPos.z - e.group.position.z);
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
            if (dist > 1.9) { // RUSH the player to melee range (slight weave)
              const weave = Math.sin(state.time * 1.9 + e.strafePhase) * (dist > 8 ? 0.22 : 0.1) * e.strafeDir;
              moveX = ux - uz * weave;
              moveZ = uz + ux * weave;
            } else { // in melee range: hold + small sidestep, keep attacking
              const weave = Math.sin(state.time * 2.2 + e.strafePhase) * e.strafeDir;
              moveX = -uz * weave * 0.2;
              moveZ = ux * weave * 0.2;
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
            clampToArea(e.group.position); // keep enemies on the walkable route
          }
          const movingNow = moveMag > 0.03 && e.stagger <= 0;
          // --- BODY FACING (anti foot-slide) ---------------------------------
          // The legs only have a forward walk/run cycle. If the body faced the
          // player while travelling sideways the feet would skate. So while
          // advancing/strafing at range we turn the body toward the actual
          // travel direction. But when the player is CLOSE we always face them
          // (so they never turn tail and can still be knifed / aim at you). The
          // turn is eased so it never snaps.
          const closeUp = dist < 6;
          const targetYaw = (movingNow && !closeUp)
            ? Math.atan2(e.group.position.x - prevX, e.group.position.z - prevZ)
            : facePlayerYaw;
          let dyaw = targetYaw - e.group.rotation.y;
          while (dyaw > Math.PI) dyaw -= Math.PI * 2;
          while (dyaw < -Math.PI) dyaw += Math.PI * 2;
          e.group.rotation.set(0, e.group.rotation.y + dyaw * Math.min(1, dt * 9), 0);
          // drive locomotion animation from actual movement
          if (e.character) { // rigged model: blend Idle/Walk/Run clips
            const want = !movingNow ? "Idle" : dist > 9 ? "Run" : "Walk";
            if (want !== e.walkAnim) { e.character.play(want); e.walkAnim = want; }
            // measure the real ground speed and match the leg cycle to it so the
            // feet plant instead of sliding (no root motion in the clips).
            const realSpeed = dt > 0 ? Math.hypot(e.group.position.x - prevX, e.group.position.z - prevZ) / dt : 0;
            e.lastX = e.group.position.x;
            e.lastZ = e.group.position.z;
            if (want === "Run") e.character.setLocoRate(realSpeed / 3.4);
            else if (want === "Walk") e.character.setLocoRate(realSpeed / 1.35);
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
          // MELEE-ONLY: they rush in and strike; no ranged fire at all. Each
          // strike plays a visible lunge (meleeT drives a forward-lean below).
          const MELEE_RANGE = e.boss ? 3.4 : 2.3;
          if (dist < MELEE_RANGE && e.stagger <= 0) {
            if (state.time >= (e.nextMelee || 0)) {
              e.nextMelee = state.time + (e.boss ? 0.85 : 0.7) + Math.random() * 0.25;
              e.meleeT = 0.28; // start the lunge animation
              const md = Math.round((e.boss ? 24 : 8 + Math.random() * 6) * (e.dmgMul || 1));
              if (hooks.onPlayerHit) hooks.onPlayerHit(md);
              audio.enemyShot();
              if (e.character && e.character.flash) e.character.flash();
            }
          }
          // melee lunge animation: a quick forward lean + jab of the model
          if (e.meleeT > 0) {
            e.meleeT -= dt;
            const p = 1 - Math.max(0, e.meleeT) / 0.28; // 0 -> 1
            const arc = Math.sin(p * Math.PI); // 0 -> 1 -> 0
            const m = e.character ? e.character.group : e.rig;
            if (m) { m.rotation.x = -arc * 0.5; m.position.z = arc * 0.35; }
          } else {
            const m = e.character ? e.character.group : e.rig;
            if (m && (m.rotation.x !== 0 || m.position.z !== 0)) { m.rotation.x *= Math.max(0, 1 - dt * 12); m.position.z *= Math.max(0, 1 - dt * 12); }
          }
        } else {
          // outside a combat area: just stand and face the player
          e.group.rotation.set(0, facePlayerYaw, 0);
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
    // explosions: expand the shockwave sphere + fade the flash light
    for (let i = explosions.length - 1; i >= 0; i -= 1) {
      const x = explosions[i];
      x.life -= dt;
      const k = Math.max(0, x.life / x.max);
      if (x.mesh) { x.mesh.scale.setScalar(x.radius * (1 - k) + 0.4); x.mesh.material.opacity = k * 0.85; }
      if (x.light) x.light.intensity = k * 6;
      if (x.life <= 0) {
        if (x.mesh) { scene.remove(x.mesh); x.mesh.material.dispose(); }
        if (x.light) scene.remove(x.light);
        explosions.splice(i, 1);
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
    // stage progression: each stage triggers as the player reaches it — by a
    // z threshold (London straight route) or proximity to a path point (Paris).
    if (state.inArea && playerPos && state.stage < STAGES.length) {
      const next = STAGES[state.stage];
      const reached = next.triggerPt
        ? Math.hypot(playerPos.x - (AX + next.triggerPt.x), playerPos.z - next.triggerPt.z) < 13
        : playerPos.z <= next.triggerZ;
      if (reached) startStage(state.stage);
    }
    // gate flow: a sealed gate opens the moment its stage's squad is cleared
    if (state.inArea) {
      if (state.activeGate >= 0 && gates[state.activeGate] && gates[state.activeGate].closed && enemiesLeft() === 0) {
        openGate(state.activeGate);
        state.activeGate = -1;
        if (hooks.onStage) hooks.onStage("闸门开启", "继续向前推进");
      }
      // smoothly raise open gates up out of the way / drop closed ones to block
      for (const gt of gates) {
        const ty = gt.closed ? 0 : 7;
        if (Math.abs(gt.group.position.y - ty) > 0.01) gt.group.position.y += (ty - gt.group.position.y) * Math.min(1, dt * 3);
      }
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
    damageTarget, damageEnemy, explodeAt, getHittables, update, spawnPlayerTracer, openSupplyCrate,
    enterArea, enterArea1, extract, enemiesLeft, clampToArea, areaSpawn, baseSpawn, areaHalfX, areaHalfZ, extractPos,
  };
}
