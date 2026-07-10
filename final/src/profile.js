import * as THREE from "three";
import { account, xpNeed } from "./account.js?v=260710012";
import { ITEM_DB } from "./inventory.js?v=260710012";
import { loadCharacter, makeCharacter, characterReady } from "./character.js?v=260710012";

// Player profile screen: a rotating 3D character wearing the equipped loadout
// on the left, account stats + equipment on the right. Runs its own small
// WebGL renderer so it's fully independent of the in-game renderer, and only
// animates while open.

const RARITY_LABEL = { common: "普通", rare: "稀有", epic: "史诗", legend: "传说" };
const SLOTS = [
  { key: "primary", label: "主武器" },
  { key: "secondary", label: "副武器" },
  { key: "melee", label: "近战" },
  { key: "armor", label: "护甲" },
  { key: "gear", label: "装备" },
];

// Build a stylised operator wearing the given loadout. Returns a Group.
function buildCharacter(data) {
  const g = new THREE.Group();
  const eq = data.equipment || {};
  const hasArmor = eq.armor === "nano_armor";
  const suitColor = hasArmor ? 0x33506e : 0x3a444f;
  const suit = new THREE.MeshStandardMaterial({ color: suitColor, roughness: 0.55, metalness: 0.35 });
  const plate = new THREE.MeshStandardMaterial({ color: 0x2a323c, roughness: 0.45, metalness: 0.55 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x6fd0ff, emissive: 0x2a90c0, emissiveIntensity: 0.9, roughness: 0.4 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.46, 6, 16), suit);
  torso.position.y = 1.3;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), plate);
  head.position.y = 1.9;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 12), visorMat);
  visor.position.set(0, 1.9, 0.12); visor.scale.set(1, 0.55, 0.6);
  const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), plate); shoulderL.position.set(-0.36, 1.52, 0);
  const shoulderR = shoulderL.clone(); shoulderR.position.x = 0.36;
  const capsule = (r, len, x, y, z = 0) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, 12), suit);
    m.position.set(x, y, z);
    return m;
  };
  const armL = capsule(0.09, 0.44, -0.4, 1.2);
  const armR = capsule(0.09, 0.44, 0.4, 1.2);
  const legL = capsule(0.125, 0.56, -0.15, 0.45);
  const legR = capsule(0.125, 0.56, 0.15, 0.45);
  const parts = [torso, head, visor, shoulderL, shoulderR, armL, armR, legL, legR];

  // nano armor: a chest plate + pauldron trim
  if (hasArmor) {
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x5ad0ff, emissive: 0x1c6f9c, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.6 });
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.24, 4, 12), armorMat);
    chest.position.set(0, 1.36, 0.14); chest.scale.set(1, 1, 0.5);
    parts.push(chest);
  }
  // tactical gloves: bright cuffs
  if (eq.gear === "tac_gloves") {
    const glove = new THREE.MeshStandardMaterial({ color: 0x2ad6a0, emissive: 0x1a8060, emissiveIntensity: 0.5, roughness: 0.5 });
    for (const x of [-0.4, 0.4]) {
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 12), glove);
      cuff.position.set(x, 0.98, 0);
      parts.push(cuff);
    }
  }

  // primary weapon held across the chest (gold if the gold AK is equipped)
  const primary = eq.primary || "ak47_black";
  const gunColor = primary === "ak47_gold" ? 0xe0ab3c : primary === "smg_proto" ? 0x394a5a : 0x23272e;
  const gunMat = new THREE.MeshStandardMaterial({ color: gunColor, roughness: 0.45, metalness: 0.8, emissive: primary === "ak47_gold" ? 0x5a3d08 : 0x000000, emissiveIntensity: 0.4 });
  const gun = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.86), gunMat);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.12), gunMat); mag.position.set(0, -0.16, 0.02); mag.rotation.x = 0.3;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), gunMat); grip.position.set(0, -0.13, -0.24); grip.rotation.x = -0.3;
  gun.add(body, mag, grip);
  gun.position.set(0.16, 1.24, 0.34);
  gun.rotation.set(-0.06, 0.05, 0);
  parts.push(gun);

  for (const p of parts) { p.castShadow = true; g.add(p); }
  return g;
}

export function createProfile() {
  const root = document.createElement("div");
  root.id = "profileScreen";
  root.className = "hidden";
  root.innerHTML = `
    <div class="pf-panel">
      <div class="pf-head">
        <h2>个人信息</h2>
        <button class="pf-close" title="关闭">✕</button>
      </div>
      <div class="pf-body">
        <div class="pf-left"><canvas class="pf-canvas"></canvas><div class="pf-hint">拖动可旋转 · 装备来自当前配装</div></div>
        <div class="pf-right"></div>
      </div>
    </div>`;
  document.body.appendChild(root);

  const canvas = root.querySelector(".pf-canvas");
  const rightEl = root.querySelector(".pf-right");
  root.querySelector(".pf-close").addEventListener("click", () => close());

  let renderer = null;
  let scene = null;
  let camera = null;
  let charGroup = null;
  let charInst = null; // rigged GLB instance (with animation mixer), if loaded
  let raf = 0;
  let open = false;
  let yaw = 0;
  let dragging = false;
  let lastX = 0;
  const clock = new THREE.Clock();

  function ensureRenderer() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
    camera.position.set(0, 1.15, 4.4);
    camera.lookAt(0, 0.98, 0);
    scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x2a3644, 1.15));
    const key = new THREE.DirectionalLight(0xfff4e0, 2.2);
    key.position.set(2, 4, 3); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fd0ff, 1.1);
    rim.position.set(-3, 2, -2);
    scene.add(rim);
    // pedestal
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.12, 40), new THREE.MeshStandardMaterial({ color: 0x1a2530, roughness: 0.6, metalness: 0.4 }));
    disc.position.y = 0.06; disc.receiveShadow = true;
    scene.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.03, 12, 48), new THREE.MeshStandardMaterial({ color: 0x36c4ff, emissive: 0x36c4ff, emissiveIntensity: 0.8 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.12;
    scene.add(ring);

    // drag-to-rotate
    canvas.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => { if (dragging) { yaw += (e.clientX - lastX) * 0.01; lastX = e.clientX; } });
    canvas.addEventListener("pointerup", () => { dragging = false; });
  }

  function rebuildCharacter() {
    const data = account.getData();
    if (!data) return;
    if (charGroup) { scene.remove(charGroup); charGroup.traverse((o) => { if (o.geometry && o.geometry.dispose) o.geometry.dispose(); }); }
    charInst = null;
    charGroup = null;
    // Prefer the rigged/animated GLB soldier; fall back to procedural geometry
    // if it hasn't downloaded yet.
    if (characterReady()) {
      const eq = data.equipment || {};
      const inst = makeCharacter({ tint: eq.armor === "nano_armor" ? 0x9fc4e6 : undefined });
      if (inst) {
        charInst = inst;
        charGroup = new THREE.Group();
        charGroup.add(inst.group);
        inst.group.rotation.y = Math.PI; // face the camera
        inst.play("Idle", 0);
      }
    }
    if (!charGroup) charGroup = buildCharacter(data);
    scene.add(charGroup);
  }

  function resize() {
    const w = canvas.clientWidth || 360;
    const h = canvas.clientHeight || 460;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function loop() {
    if (!open) return;
    const dt = Math.min(0.05, clock.getDelta());
    if (charInst) charInst.tick(dt); // advance the idle animation
    if (!dragging) yaw += 0.006; // idle turntable
    if (charGroup) charGroup.rotation.y = yaw;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }

  function renderStats() {
    const d = account.getData();
    const user = account.current() || "—";
    if (!d) { rightEl.innerHTML = "<p style='padding:20px'>未登录</p>"; return; }
    const av = d.avatar
      ? `<img src="${d.avatar}" alt="avatar" />`
      : `<span class="pf-av-ph">${(user[0] || "?").toUpperCase()}</span>`;
    const need = xpNeed(d.level);
    const pct = Math.min(100, Math.round((d.xp / need) * 100));
    const equipRows = SLOTS.map((s) => {
      const id = d.equipment[s.key];
      const it = id ? ITEM_DB[id] : null;
      return `<div class="pf-eq-row ${it ? "rar-" + it.rarity : ""}">
        <span class="pf-eq-slot">${s.label}</span>
        <span class="pf-eq-name">${it ? it.icon + " " + it.name : "空"}</span>
        ${it ? `<span class="pf-eq-rar">${RARITY_LABEL[it.rarity]}</span>` : ""}
      </div>`;
    }).join("");
    rightEl.innerHTML = `
      <div class="pf-id">
        <div class="pf-avatar" title="上传头像（开发中）">${av}</div>
        <div class="pf-id-text">
          <div class="pf-name">${user}</div>
          <div class="pf-lv">Lv.${d.level} <span class="pf-coins">◈ ${d.coins}</span></div>
          <div class="pf-xpbar"><div class="pf-xpfill" style="width:${pct}%"></div></div>
          <div class="pf-xptext">经验 ${d.xp} / ${need}</div>
        </div>
      </div>
      <div class="pf-stats-grid">
        <div class="pf-stat"><b>${d.stats.kills}</b><span>击杀</span></div>
        <div class="pf-stat"><b>${d.stats.deaths}</b><span>阵亡</span></div>
        <div class="pf-stat"><b>${d.stats.runs}</b><span>出击</span></div>
        <div class="pf-stat"><b>${d.inventory.length}</b><span>物品</span></div>
      </div>
      <div class="pf-eq"><h3>当前配装</h3>${equipRows}</div>`;
  }

  function openProfile() {
    if (open) return;
    open = true;
    root.classList.remove("hidden");
    ensureRenderer();
    resize();
    rebuildCharacter();
    renderStats();
    yaw = 0;
    clock.getDelta(); // reset delta so the first frame isn't a big jump
    // download the rigged model if needed, then swap it in when ready
    loadCharacter().then(() => { if (open) rebuildCharacter(); }).catch(() => {});
    raf = requestAnimationFrame(loop);
  }
  function close() {
    if (!open) return;
    open = false;
    cancelAnimationFrame(raf);
    root.classList.add("hidden");
    if (hooks.onClose) hooks.onClose();
  }

  const hooks = {};
  window.addEventListener("resize", () => { if (open) resize(); });

  return {
    open: openProfile,
    close,
    isOpen: () => open,
    onClose: (fn) => { hooks.onClose = fn; },
  };
}
