import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { createWorld } from "./world.js?v=DEV";
import { createPlayer } from "./player.js?v=DEV";
import { createWeapons } from "./weapons.js?v=DEV";
import { createUI } from "./ui.js?v=DEV";
import "./shell.js?v=DEV"; // boot logo + login + lobby + backpack (front-end shell)
import { account } from "./account.js?v=DEV";
import { renderInventory, ITEM_DB } from "./inventory.js?v=DEV";
import { audio } from "./audio.js?v=DEV";
import { recordProgress, trackedMissions } from "./missions.js?v=DEV";
import { xpNeed } from "./account.js?v=DEV";

// Human-readable build version: YYMMDD + 3-digit deploy count for that day
// (e.g. 260611001 = 2026-06-11, 1st deploy). Bumped by hand each deploy so a
// refresh visibly confirms whether the new build is live.
const BUILD_VERSION = "260710001";
(() => {
  const el = document.getElementById("buildVer");
  if (el) el.textContent = `v${BUILD_VERSION}`;
})();

// --- Renderer / scene / camera ------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // filmic, realistic response
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 200);
scene.add(camera);

// Separate scene/camera for the first-person view-model, rendered on top of the
// world with a cleared depth buffer so the weapon never clips into floors/walls.
const viewScene = new THREE.Scene();
const viewCamera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.01, 10);
viewScene.add(viewCamera);
viewScene.add(new THREE.HemisphereLight(0xcfe6ff, 0x35506a, 1.1));
const vmKey = new THREE.DirectionalLight(0xfff4e0, 2.0);
vmKey.position.set(0.4, 1, 0.8);
viewScene.add(vmKey);

const world = createWorld(scene, {
  // Walking over a loot orb in Area 1 picks it up into the account inventory.
  onLoot(drop) {
    account.addItem(drop.id, drop.qty);
    const it = ITEM_DB[drop.id];
    ui.toast(`拾取：${it ? it.name : drop.id}${drop.qty > 1 ? " ×" + drop.qty : ""}`);
    // advance accepted collect missions (e.g. data chips)
    for (const m of recordProgress("collect", drop.id, drop.qty)) {
      ui.toast(`任务目标达成：${m.name} · 回任务官领取奖励`);
    }
    refreshMissionHUD();
    if (charPanel && !charPanel.classList.contains("hidden")) renderInventory(charBody);
  },
  // Enemy fire that connects: flash the screen, then die/respawn at 0 HP.
  onPlayerHit(dmg) {
    if (dead || !inputState.locked) return;
    player.state.health = Math.max(0, player.state.health - dmg);
    audio.hurt();
    const flash = document.getElementById("damageFlash");
    flash.classList.remove("show");
    void flash.offsetWidth;
    flash.classList.add("show");
    if (player.state.health <= 0) die();
  },
  onWaveCleared(wave) {
    const bonus = 80 + wave * 40;
    const ups = account.award(bonus, 30);
    ui.toast(`第 ${wave} 波已清剿 · 奖励 ◈${bonus}，下一波即将来袭`);
    if (ups > 0) celebrateLevelUp();
    refreshMissionHUD();
  },
  onWaveSpawn(wave, count) {
    if (wave > 1) ui.toast(`第 ${wave} 波来袭 · ${count} 名敌人`);
  },
});
const player = createPlayer(camera, world);

// --- Post-processing: clean anime presentation -------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// gentle bloom for energy/holo glow only
composer.addPass(
  new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.14, 0.4, 1.0)
);
composer.addPass(new OutputPass());
composer.addPass(new SMAAPass(window.innerWidth, window.innerHeight)); // crisp line art

// HUD elements
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const crosshair = document.getElementById("crosshair");
const hitmarker = document.getElementById("hitmarker");
const scoreEl = document.getElementById("score");
const ammoEl = document.getElementById("ammo");
const healthEl = document.getElementById("health");
const weaponEl = document.getElementById("weapon");
const sprintEl = document.getElementById("sprint");
const promptEl = document.getElementById("prompt");

// In-game character / backpack panel (toggle with B).
const charPanel = document.getElementById("charPanel");
const charBody = document.getElementById("charBody");
function openChar() {
  renderInventory(charBody);
  charPanel.classList.remove("hidden");
  if (document.pointerLockElement) document.exitPointerLock?.();
}
function closeChar(resume = true) {
  charPanel.classList.add("hidden");
  if (resume) requestLock();
  else showPause();
}
document.getElementById("charClose").addEventListener("click", () => closeChar(true));

const killBanner = document.getElementById("killBanner");
function showKill() {
  audio.kill();
  killBanner.classList.remove("show");
  void killBanner.offsetWidth;
  killBanner.classList.add("show");
}

const weapons = createWeapons(camera, scene, world, player, {
  onHitmarker(killed, kind) {
    // retrigger the CSS flash animation
    hitmarker.classList.remove("show");
    void hitmarker.offsetWidth;
    hitmarker.classList.add("show");
    if (killed) {
      showKill();
      if (kind === "enemy") onEnemyKill();
    }
  },
}, viewCamera);

// A real enemy kill (not a training target) pays out coins + XP, counts
// toward kill missions, and bumps the persistent kill stat.
const KILL_COINS = 25;
const KILL_XP = 20;
function onEnemyKill() {
  const d = account.getData();
  if (d) { d.stats.kills += 1; account.save(d); }
  const ups = account.award(KILL_COINS, KILL_XP);
  if (ups > 0) celebrateLevelUp();
  for (const m of recordProgress("kill")) {
    ui.toast(`任务目标达成：${m.name} · 回任务官领取奖励`);
  }
  refreshMissionHUD();
}

function celebrateLevelUp() {
  const d = account.getData();
  audio.levelup();
  ui.toast(`等级提升！当前 Lv.${d ? d.level : "?"}`);
}

const ui = createUI({
  onResume: () => requestLock(),
  onDeploy: (area) => {
    world.enterArea1();
    player.state.pos.copy(world.areaSpawn);
    player.state.vy = 0;
    const d = account.getData();
    if (d) { d.stats.runs += 1; account.save(d); }
    ui.toast(`已进入 ${area.name} · 走到撤离点按 E 返回`);
  },
  onBuyAmmo: (ammo) => weapons.addReserve(ammo.id, ammo.qty),
  onMissionsChanged: () => refreshMissionHUD(),
});

// --- Death / respawn ------------------------------------------------------
const deathScreen = document.getElementById("deathScreen");
let dead = false;

function die() {
  dead = true;
  weapons.triggerUp();
  const d = account.getData();
  if (d) { d.stats.deaths += 1; account.save(d); }
  // the recovery system hauls you back to base; loot stays with you
  world.extract();
  player.state.pos.copy(world.baseSpawn);
  player.state.vy = 0;
  deathScreen.classList.remove("hidden");
  document.exitPointerLock?.();
}

document.getElementById("deathRespawn").addEventListener("click", () => {
  dead = false;
  player.state.health = 100;
  deathScreen.classList.add("hidden");
  requestLock();
});

// --- Med stim (Q) -----------------------------------------------------------
function useStim() {
  if (player.state.health >= 100) { ui.toast("生命值已满"); return; }
  if (!account.take("med_stim", 1)) { ui.toast("没有医疗针剂"); return; }
  player.state.health = Math.min(100, player.state.health + 50);
  audio.heal();
  ui.toast(`使用医疗针剂 +50 · 剩余 ${account.count("med_stim")} 支`);
  if (charPanel && !charPanel.classList.contains("hidden")) renderInventory(charBody);
}

// --- Mission tracker + level HUD (event-driven, not per-frame) --------------
const missionTrackerEl = document.getElementById("missionTracker");
const levelEl = document.getElementById("level");
function refreshMissionHUD() {
  const d = account.getData();
  if (levelEl && d) levelEl.textContent = `Lv.${d.level} · ${d.xp}/${xpNeed(d.level)}`;
  if (!missionTrackerEl) return;
  missionTrackerEl.innerHTML = "";
  for (const { def, st } of trackedMissions()) {
    const row = document.createElement("div");
    row.className = "mt-row" + (st.done ? " done" : "");
    row.innerHTML = st.done
      ? `${def.name}<span class="mt-prog">✔ 待领取</span>`
      : `${def.name}<span class="mt-prog">${st.progress}/${def.goal}</span>`;
    missionTrackerEl.appendChild(row);
  }
}
refreshMissionHUD();

// --- Input --------------------------------------------------------------
const inputState = { locked: false };
let activeInteractable = null;

function interact() {
  if (!activeInteractable) return;
  if (activeInteractable.action === "extract") {
    world.extract();
    player.state.pos.copy(world.baseSpawn);
    player.state.vy = 0;
    ui.toast("已撤离回基地");
    return;
  }
  if (activeInteractable.action === "ammo") {
    weapons.resupply();
    audio.reload();
    ui.toast("弹药已补充");
    return;
  }
  ui.openAction(activeInteractable.action);
  document.exitPointerLock?.();
}

function updateInteraction() {
  let best = null;
  let bestD = Infinity;
  const p = player.state.pos;
  for (const it of world.interactables) {
    const d = Math.hypot(p.x - it.pos.x, p.z - it.pos.z);
    if (d < it.radius && d < bestD) {
      best = it;
      bestD = d;
    }
  }
  activeInteractable = best;
  if (best) {
    promptEl.textContent = `[E] ${best.name}`;
    promptEl.style.display = "block";
  } else {
    promptEl.style.display = "none";
  }
}

function onKeyDown(e) {
  if (e.code === "F8") { e.preventDefault(); toggleFullscreen(); return; }
  // Backpack/attributes panel: B resumes the game, Esc goes to the pause overlay.
  if (!charPanel.classList.contains("hidden")) {
    if (e.code === "KeyB") closeChar(true);
    else if (e.code === "Escape") closeChar(false);
    return;
  }
  // While a menu is open, Esc closes it to the pause overlay.
  if (ui.isOpen()) {
    if (e.code === "Escape") {
      ui.close();
      showPause();
    }
    return;
  }
  if (e.code === "KeyB" && inputState.locked) { openChar(); return; }
  if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ControlLeft"].includes(e.code)) {
    e.preventDefault();
  }
  player.keys.add(e.code);
  if (e.code === "Space" && !e.repeat) player.queueJump();
  if (e.code === "KeyE") interact();
  if (e.code === "KeyR") weapons.reload();
  if (e.code === "KeyQ" && inputState.locked && !e.repeat) useStim();
  if (e.code === "Digit1") weapons.select(0);
  if (e.code === "Digit2") weapons.select(1);
  if (e.code === "Digit3") weapons.select(2);
}

function onKeyUp(e) {
  player.keys.delete(e.code);
}

function onMouseMove(e) {
  if (!inputState.locked) return;
  player.look(e.movementX, e.movementY);
}

function onMouseDown(e) {
  if (!inputState.locked) return;
  if (e.button === 0) weapons.triggerDown(performance.now() / 1000);
}

function onMouseUp(e) {
  if (e.button === 0) weapons.triggerUp();
}

function requestLock() {
  audio.resume(); // unlock audio within the click gesture
  renderer.domElement.requestPointerLock?.();
}

// F8 toggles fullscreen. In fullscreen we also take a Keyboard Lock so the page
// captures Ctrl+W etc. (otherwise crouch+forward closes the browser tab).
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    const p = document.documentElement.requestFullscreen?.();
    (p || Promise.resolve()).then(() => { try { navigator.keyboard?.lock?.(); } catch (_) {} }).catch(() => {});
  } else {
    try { navigator.keyboard?.unlock?.(); } catch (_) {}
    document.exitFullscreen?.();
  }
}

// Browsers block requestPointerLock when it's triggered by the Esc key (Esc is
// the exit key), so closing a panel with Esc shows the pause overlay instead of
// snapping back into the game — the player clicks "点击开始" to resume.
function showPause() {
  overlay.classList.remove("hidden");
  crosshair.style.display = "none";
  player.keys.clear();
}

function onPointerLockChange() {
  inputState.locked = document.pointerLockElement === renderer.domElement;
  // Show the start overlay only when paused with no menu/backpack/death panel open.
  const panelOpen = ui.isOpen() || !charPanel.classList.contains("hidden") || dead;
  overlay.classList.toggle("hidden", inputState.locked || panelOpen);
  crosshair.style.display = inputState.locked ? "block" : "none";
  if (inputState.locked) refreshMissionHUD(); // pick up level/mission changes made in menus
  // Sync the in-hand AK skin to the account (gold once unlocked from merchant).
  if (inputState.locked && window.__PN_SET_AK_SKIN__) {
    const d = account.getData();
    window.__PN_SET_AK_SKIN__(d && d.skins && d.skins.ak === "gold" ? "gold" : "black");
  }
  if (!inputState.locked) {
    weapons.triggerUp();
    player.keys.clear();
    promptEl.style.display = "none";
  }
}

startBtn.addEventListener("click", requestLock);
renderer.domElement.addEventListener("click", () => {
  if (!inputState.locked) requestLock();
});
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("mousemove", onMouseMove);
window.addEventListener("mousedown", onMouseDown);
window.addEventListener("mouseup", onMouseUp);
document.addEventListener("pointerlockchange", onPointerLockChange);

// Losing focus can drop keyup events — clear held keys so nothing sticks.
window.addEventListener("blur", () => {
  player.keys.clear();
  weapons.triggerUp();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  viewCamera.aspect = camera.aspect;
  viewCamera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// --- HUD ----------------------------------------------------------------
function updateHUD() {
  scoreEl.textContent = String(world.state.score);
  const hud = weapons.getHUD();
  weaponEl.textContent = hud.name;
  ammoEl.textContent = hud.ammoText;
  sprintEl.textContent = player.state.sprinting ? "开" : "关";
  healthEl.textContent = String(Math.round(player.state.health));
}

// --- Main loop ----------------------------------------------------------
const fpsEl = document.getElementById("fps");
let fpsFrames = 0;
let fpsLast = performance.now();
let last = performance.now();
function animate(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  if (inputState.locked) {
    player.update(dt);
    weapons.update(dt, now / 1000);
    world.update(dt, player.state);
    updateInteraction();
    // the base slowly patches you up; out in the field you need med stims
    if (!world.state.inArea && !dead && player.state.health < 100) {
      player.state.health = Math.min(100, player.state.health + 4 * dt);
    }
  }

  composer.render();
  // draw the view-model on top with a fresh depth buffer (no world clipping)
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(viewScene, viewCamera);
  renderer.autoClear = true;
  updateHUD();

  fpsFrames += 1;
  if (now - fpsLast >= 500) {
    if (fpsEl) fpsEl.textContent = `${Math.round((fpsFrames * 1000) / (now - fpsLast))} FPS`;
    fpsFrames = 0;
    fpsLast = now;
  }
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

// Handle for automated smoke tests (same spirit as __PN_SET_AK_SKIN__).
window.__PN_DEBUG__ = { player, world, weapons, ui, account };
