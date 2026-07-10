import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { createWorld } from "./world.js?v=260710012";
import { createPlayer } from "./player.js?v=260710012";
import { createWeapons } from "./weapons.js?v=260710012";
import { createUI } from "./ui.js?v=260710012";
import "./shell.js?v=260710012"; // boot logo + login + lobby + backpack (front-end shell)
import { account } from "./account.js?v=260710012";
import { renderInventory, ITEM_DB } from "./inventory.js?v=260710012";
import { audio } from "./audio.js?v=260710012";
import { recordProgress, trackedMissions } from "./missions.js?v=260710012";
import { xpNeed } from "./account.js?v=260710012";
import { createProfile } from "./profile.js?v=260710012";

// Human-readable build version: YYMMDD + 3-digit deploy count for that day
// (e.g. 260611001 = 2026-06-11, 1st deploy). Bumped by hand each deploy so a
// refresh visibly confirms whether the new build is live.
const BUILD_VERSION = "260710012";
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
renderer.toneMappingExposure = 1.12;
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

// Per-run haul, shown in the extraction summary.
const runStats = { kills: 0, coins: 0, xp: 0, waves: 0, loot: {} };
function resetRunStats() {
  runStats.kills = 0; runStats.coins = 0; runStats.xp = 0; runStats.waves = 0; runStats.loot = {};
}

const world = createWorld(scene, {
  // Walking over a loot orb in Area 1 picks it up into the account inventory.
  onLoot(drop) {
    account.addItem(drop.id, drop.qty);
    audio.pickup();
    runStats.loot[drop.id] = (runStats.loot[drop.id] || 0) + drop.qty;
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
    // equipped nano armor soaks 30% of incoming damage
    const d = account.getData();
    if (d && d.equipment && d.equipment.armor === "nano_armor") dmg = Math.max(1, Math.round(dmg * 0.7));
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
    runStats.coins += bonus; runStats.xp += 30; runStats.waves += 1;
    ui.toast(`第 ${wave} 波已清剿 · 奖励 ◈${bonus}，下一波即将来袭`);
    if (ups > 0) celebrateLevelUp();
    for (const m of recordProgress("wave")) {
      ui.toast(`任务目标达成：${m.name} · 回任务官领取奖励`);
    }
    refreshMissionHUD();
  },
  onWaveSpawn(wave, count, hasBoss) {
    if (wave > 1) ui.toast(`第 ${wave} 波来袭 · ${count} 名敌人${hasBoss ? " · ⚠ 重型单位出现" : ""}`);
  },
});
const player = createPlayer(camera, world);

// --- Post-processing: clean anime presentation -------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// gentle bloom for energy/holo glow only
composer.addPass(
  new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.2, 0.45, 0.95)
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
  if (resume) resumeGame();
  else showPause();
}

// Close a panel and go straight back into the game. Re-locking the pointer is
// the goal, but a browser may block a pointer-lock request that originates from
// the Esc key; if the re-lock hasn't taken hold shortly after, fall back to the
// pause overlay so the player is never stranded in an unlocked, menu-less state.
function resumeGame() {
  requestLock();
  setTimeout(() => { if (!inputState.locked) showPause(); }, 280);
}
document.getElementById("charClose").addEventListener("click", () => closeChar(true));

const killBanner = document.getElementById("killBanner");
function showKill(headshot = false) {
  audio.kill();
  killBanner.querySelector(".kb-text").textContent = headshot ? "爆头击杀" : "击杀";
  killBanner.classList.toggle("head", headshot);
  killBanner.classList.remove("show");
  void killBanner.offsetWidth;
  killBanner.classList.add("show");
}

// Kill feed (top right): short-lived rows, newest on top.
const killFeed = document.getElementById("killFeed");
function pushKillFeed(text) {
  if (!killFeed) return;
  const row = document.createElement("div");
  row.className = "kf-row";
  row.textContent = text;
  killFeed.prepend(row);
  while (killFeed.children.length > 5) killFeed.lastChild.remove();
  setTimeout(() => { row.classList.add("out"); setTimeout(() => row.remove(), 400); }, 3600);
}

const weapons = createWeapons(camera, scene, world, player, {
  onHitmarker(killed, kind, extra = {}) {
    // retrigger the CSS flash animation
    hitmarker.classList.remove("show");
    void hitmarker.offsetWidth;
    hitmarker.classList.add("show");
    if (extra.headshot) audio.headshot();
    if (killed) {
      showKill(extra.headshot);
      if (kind === "enemy") onEnemyKill(extra);
    }
  },
  // Apex-style floating damage numbers at the hit point.
  onDamageNumber(point, dmg, headshot) {
    const v = point.clone().project(camera);
    if (v.z > 1) return; // behind the camera
    const el = document.createElement("div");
    el.className = "dmgNum" + (headshot ? " head" : "");
    el.textContent = String(Math.round(dmg));
    el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * 100 - 3}%`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 650);
  },
}, viewCamera);

// A real enemy kill (not a training target) pays out coins + XP, counts
// toward kill missions, and bumps the persistent kill stat.
const KILL_COINS = 25;
const KILL_XP = 20;
function onEnemyKill(extra = {}) {
  const d = account.getData();
  if (d) { d.stats.kills += 1; account.save(d); }
  const bounty = extra.heavy ? KILL_COINS * 4 : KILL_COINS;
  const xp = extra.heavy ? KILL_XP * 3 : KILL_XP;
  const ups = account.award(bounty, xp);
  runStats.kills += 1; runStats.coins += bounty; runStats.xp += xp;
  pushKillFeed(`${extra.headshot ? "☠ 爆头 " : ""}击杀 ${extra.heavy ? "重型单位 +◈" + bounty : "训练兵 +◈" + bounty}`);
  if (ups > 0) celebrateLevelUp();
  for (const m of recordProgress("kill")) {
    ui.toast(`任务目标达成：${m.name} · 回任务官领取奖励`);
  }
  refreshMissionHUD();
}

function celebrateLevelUp() {
  const d = account.getData();
  audio.levelup();
  ui.toast(`等级提升！当前 Lv.${d ? d.level : "?"} · 生命上限 +5`);
  syncLoadout(); // level raises max health
}

// Push the account's equipment onto the live systems: primary weapon (SMG or
// AK + skin), gear modifiers, and level-scaled max health.
function syncLoadout() {
  const d = account.getData();
  if (!d) return;
  const primary = (d.equipment && d.equipment.primary) || "ak47_black";
  weapons.applyLoadout({
    primary,
    reloadMul: d.equipment && d.equipment.gear === "tac_gloves" ? 0.85 : 1,
  });
  if (window.__PN_SET_AK_SKIN__) {
    window.__PN_SET_AK_SKIN__(primary === "ak47_gold" ? "gold" : "black");
  }
  const max = Math.min(140, 100 + (d.level - 1) * 5);
  player.state.maxHealth = max;
  player.state.health = Math.min(player.state.health, max);
}

const ui = createUI({
  onResume: () => requestLock(),
  onDeploy: (area) => {
    world.enterArea1();
    resetRunStats();
    player.state.pos.copy(world.areaSpawn);
    player.state.vy = 0;
    audio.setAmbient("forest");
    const d = account.getData();
    if (d) { d.stats.runs += 1; account.save(d); }
    ui.toast(`已进入 ${area.name} · 走到撤离点按 E 返回`);
  },
  onBuyAmmo: (ammo) => weapons.addReserve(ammo.id, ammo.qty),
  onMissionsChanged: () => refreshMissionHUD(),
});

// --- Profile page (3D character + stats) ----------------------------------
const profile = createProfile();
profile.onClose(() => { showPause(); }); // closing the profile returns to the pause menu
function openProfile() {
  if (document.pointerLockElement) document.exitPointerLock?.();
  overlay.classList.add("hidden"); // profile takes over from the pause menu
  profile.open();
}

// --- Player identity chip (bottom-right avatar + username) ------------------
const chipName = document.getElementById("chipName");
const chipAvatar = document.getElementById("chipAvatar");
const playerChip = document.getElementById("playerChip");
function refreshPlayerChip() {
  const d = account.getData();
  const user = account.current() || "—";
  if (chipName) chipName.textContent = user;
  if (chipAvatar) {
    chipAvatar.innerHTML = d && d.avatar
      ? `<img src="${d.avatar}" alt="avatar" />`
      : `<span class="chip-av-ph">${(user[0] || "?").toUpperCase()}</span>`;
  }
}
refreshPlayerChip();
playerChip?.addEventListener("click", openProfile);
document.getElementById("profileBtn")?.addEventListener("click", openProfile);

// --- Settings (mouse sensitivity + volume), persisted in localStorage -------
const sensInput = document.getElementById("setSens");
const sensVal = document.getElementById("setSensVal");
const volInput = document.getElementById("setVol");
const volVal = document.getElementById("setVolVal");
function applySensitivity(v) {
  player.state.lookSens = v;
  if (sensVal) sensVal.textContent = v.toFixed(2);
  localStorage.setItem("pn_sens", String(v));
}
function applyVolume(v) {
  audio.setVolume(v);
  if (volVal) volVal.textContent = `${Math.round(v * 100)}%`;
  localStorage.setItem("pn_vol", String(v));
}
(function initSettings() {
  const sens = parseFloat(localStorage.getItem("pn_sens"));
  const vol = parseFloat(localStorage.getItem("pn_vol"));
  const s = Number.isFinite(sens) ? sens : 1;
  const vv = Number.isFinite(vol) ? vol : 1;
  if (sensInput) sensInput.value = String(s);
  if (volInput) volInput.value = String(vv);
  applySensitivity(s);
  applyVolume(vv);
})();
sensInput?.addEventListener("input", (e) => applySensitivity(parseFloat(e.target.value)));
volInput?.addEventListener("input", (e) => applyVolume(parseFloat(e.target.value)));

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
  player.state.health = player.state.maxHealth;
  deathScreen.classList.add("hidden");
  requestLock();
});

// --- Med stim (Q) -----------------------------------------------------------
function useStim() {
  if (player.state.health >= player.state.maxHealth) { ui.toast("生命值已满"); return; }
  if (!account.take("med_stim", 1)) { ui.toast("没有医疗针剂"); return; }
  player.state.health = Math.min(player.state.maxHealth, player.state.health + 50);
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
    audio.setAmbient("base");
    ui.showSummary(runStats);
    document.exitPointerLock?.();
    return;
  }
  if (activeInteractable.action === "supply") {
    if (world.openSupplyCrate(activeInteractable.id)) {
      audio.pickup();
      ui.toast("补给箱已开启");
    } else {
      ui.toast("这个补给箱已经空了");
    }
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
  if (e.code === "F8" || e.code === "F11") { e.preventDefault(); toggleFullscreen(); return; }
  // Profile page: Esc closes it back to the pause menu.
  if (profile.isOpen()) {
    if (e.code === "Escape") profile.close();
    return;
  }
  // Backpack/attributes panel: B or Esc both just close it and resume the game.
  if (!charPanel.classList.contains("hidden")) {
    if (e.code === "KeyB" || e.code === "Escape") closeChar(true);
    return;
  }
  // While a menu is open, Esc closes it and resumes — not back to the menu.
  if (ui.isOpen()) {
    if (e.code === "Escape") {
      ui.close();
      resumeGame();
    }
    return;
  }
  if (e.code === "KeyB" && inputState.locked) { openChar(); return; }
  // Esc while playing pauses (releases the mouse -> pause overlay). In windowed
  // mode the browser already does this; in fullscreen Esc is keyboard-locked so
  // we must release the pointer ourselves (without dropping out of fullscreen).
  if (e.code === "Escape") {
    if (inputState.locked) document.exitPointerLock?.();
    return;
  }
  if (["KeyW", "KeyA", "KeyS", "KeyD", "KeyC", "Space", "ShiftLeft", "ControlLeft"].includes(e.code)) {
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

// F8 / F11 toggle fullscreen both ways. While fullscreen we take a Keyboard
// Lock on only the GAMEPLAY keys (so Ctrl+W etc. reach the page instead of
// closing the tab) — deliberately NOT the fullscreen/refresh keys, so those
// always work to leave fullscreen. The lock is applied/released by the
// fullscreenchange handler, so exiting by any route releases it.
// Escape is included so that, while fullscreen, pressing Esc (to close a menu
// or pause) is delivered to the game instead of dropping out of fullscreen —
// the browser keeps "hold Esc to exit fullscreen" as the escape hatch.
const FS_LOCK_KEYS = [
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyC", "KeyE", "KeyR", "KeyQ", "KeyB",
  "KeyT", "KeyN", "Space", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
  "Digit1", "Digit2", "Digit3", "Escape",
];
// Cross-browser fullscreen helpers (Safari/iOS still ship webkit-prefixed).
function fsElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}
function enterFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  try { const p = req.call(el); if (p && p.catch) p.catch(() => {}); } catch (_) {}
}
function exitFullscreen() {
  const ex = document.exitFullscreen || document.webkitExitFullscreen;
  if (!ex) return;
  try { const p = ex.call(document); if (p && p.catch) p.catch(() => {}); } catch (_) {}
}
function toggleFullscreen() {
  if (!fsElement()) enterFullscreen();
  else exitFullscreen();
}
function onFullscreenChange() {
  try {
    if (fsElement()) navigator.keyboard?.lock?.(FS_LOCK_KEYS);
    else navigator.keyboard?.unlock?.();
  } catch (_) { /* keyboard lock unsupported (e.g. Firefox) — harmless */ }
}
document.addEventListener("fullscreenchange", onFullscreenChange);
document.addEventListener("webkitfullscreenchange", onFullscreenChange);

// "全屏游戏" button: go fullscreen AND lock the pointer to start playing, all
// within this one click gesture.
function fullscreenAndPlay() {
  if (!fsElement()) enterFullscreen();
  requestLock();
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
  // Show the pause/settings overlay only when paused with no other panel open.
  const panelOpen = ui.isOpen() || !charPanel.classList.contains("hidden") || dead || profile.isOpen();
  overlay.classList.toggle("hidden", inputState.locked || panelOpen);
  crosshair.style.display = inputState.locked ? "block" : "none";
  document.body.classList.toggle("playing", inputState.locked); // shows the minimap
  if (inputState.locked) {
    refreshMissionHUD(); // pick up level/mission changes made in menus
    syncLoadout(); // equipment may have changed in the backpack
    refreshPlayerChip();
    audio.setAmbient(world.state.inArea ? "forest" : "base");
  } else {
    audio.setAmbient(null);
  }
  if (!inputState.locked) {
    weapons.triggerUp();
    player.keys.clear();
    promptEl.style.display = "none";
  }
}

startBtn.addEventListener("click", requestLock);
document.getElementById("fsBtn")?.addEventListener("click", fullscreenAndPlay);
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
const healthFill = document.getElementById("healthFill");
function updateHUD() {
  scoreEl.textContent = String(world.state.score);
  const hud = weapons.getHUD();
  weaponEl.textContent = hud.name;
  ammoEl.textContent = hud.ammoText;
  sprintEl.textContent = player.state.sliding ? "滑铲" : player.state.sprinting ? "疾跑" : "";
  healthEl.textContent = `${Math.round(player.state.health)}`;
  if (healthFill) {
    const pct = (player.state.health / player.state.maxHealth) * 100;
    healthFill.style.width = `${pct}%`;
    healthFill.classList.toggle("low", pct < 30);
  }
  // dynamic crosshair: the gap breathes with the actual spread cone
  if (crosshair && weapons.getSpread) {
    crosshair.style.setProperty("--gap", `${(5 + weapons.getSpread() * 2400).toFixed(1)}px`);
  }
}

// --- Footsteps ------------------------------------------------------------
let strideAcc = 0;
function updateFootsteps(dt) {
  const ps = player.state;
  if (!ps.grounded || ps.speed2D < 1.2) { strideAcc = 0; return; }
  strideAcc += ps.speed2D * dt;
  const stride = ps.sprinting ? 3.0 : 2.3; // metres per step
  if (strideAcc >= stride) {
    strideAcc = 0;
    audio.footstep(ps.crouching ? "crouch" : ps.sprinting ? "sprint" : "walk");
  }
}

// --- Minimap (rotating, player-up, COD style) ------------------------------
const minimap = document.getElementById("minimap");
const mmCtx = minimap ? minimap.getContext("2d") : null;
function drawMinimap() {
  if (!mmCtx) return;
  const W = minimap.width;
  const cx = W / 2;
  const inArea = world.state.inArea;
  const range = inArea ? 46 : 20; // metres of world shown edge-to-edge/2
  const scale = (cx - 7) / range;
  const px = player.state.pos.x;
  const pz = player.state.pos.z;
  const cy = cx;
  const cosY = Math.cos(player.state.yaw);
  const sinY = Math.sin(player.state.yaw);
  const toMap = (wx, wz) => {
    const dx = wx - px;
    const dz = wz - pz;
    return [cx + (dx * cosY - dz * sinY) * scale, cy + (dx * sinY + dz * cosY) * scale];
  };
  mmCtx.clearRect(0, 0, W, W);
  mmCtx.save();
  mmCtx.beginPath();
  mmCtx.arc(cx, cy, cx - 2, 0, 6.2832);
  mmCtx.clip();
  mmCtx.fillStyle = "rgba(5, 12, 18, 0.78)";
  mmCtx.fillRect(0, 0, W, W);
  const dot = (wx, wz, color, r) => {
    const [mx, my] = toMap(wx, wz);
    mmCtx.fillStyle = color;
    mmCtx.beginPath();
    mmCtx.arc(mx, my, r, 0, 6.2832);
    mmCtx.fill();
  };
  if (inArea) {
    dot(world.areaSpawn.x, 8, "#6affc0", 5); // extract pad
    for (const c of world.supplyCrates) if (!c.opened) dot(c.pos.x, c.pos.z, "#46dfa0", 3);
    for (const l of world.loot) dot(l.orb.position.x, l.orb.position.z, "#ffd23f", 2.4);
    for (const e of world.enemies) {
      if (!e.alive) continue;
      dot(e.group.position.x, e.group.position.z, e.heavy ? "#ff5030" : "#ff8a6a", e.heavy ? 4.4 : 3);
    }
  } else {
    for (const it of world.interactables) {
      if (it.pos.x > 100) continue; // area-side markers
      dot(it.pos.x, it.pos.z, "#59c8ff", 3);
    }
  }
  // player arrow (always centred, facing up)
  mmCtx.fillStyle = "#eaf6ff";
  mmCtx.beginPath();
  mmCtx.moveTo(cx, cy - 6);
  mmCtx.lineTo(cx - 4.4, cy + 4.6);
  mmCtx.lineTo(cx + 4.4, cy + 4.6);
  mmCtx.closePath();
  mmCtx.fill();
  mmCtx.restore();
  mmCtx.strokeStyle = "rgba(127, 209, 255, 0.55)";
  mmCtx.lineWidth = 1.5;
  mmCtx.beginPath();
  mmCtx.arc(cx, cy, cx - 2, 0, 6.2832);
  mmCtx.stroke();
}

// --- Dynamic resolution ---------------------------------------------------
let resScale = 1;
function applyResScale() {
  const pr = Math.min(window.devicePixelRatio, 2) * resScale;
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
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
    updateFootsteps(dt);
    drawMinimap();
    // the base slowly patches you up; out in the field you need med stims
    if (!world.state.inArea && !dead && player.state.health < player.state.maxHealth) {
      player.state.health = Math.min(player.state.maxHealth, player.state.health + 4 * dt);
    }
  }

  // sprint widens the FOV slightly for a sense of speed
  const fovTarget = player.state.sliding ? 82 : player.state.sprinting ? 78 : 72;
  if (Math.abs(camera.fov - fovTarget) > 0.05) {
    camera.fov += (fovTarget - camera.fov) * Math.min(1, 9 * dt);
    camera.updateProjectionMatrix();
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
    const fps = Math.round((fpsFrames * 1000) / (now - fpsLast));
    if (fpsEl) fpsEl.textContent = `${fps} FPS`;
    fpsFrames = 0;
    fpsLast = now;
    // dynamic resolution: trade pixels for frame rate on weak GPUs
    if (fps < 40 && resScale > 0.55) { resScale = Math.max(0.55, resScale - 0.1); applyResScale(); }
    else if (fps > 56 && resScale < 1) { resScale = Math.min(1, resScale + 0.05); applyResScale(); }
  }
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

// Handle for automated smoke tests (same spirit as __PN_SET_AK_SKIN__).
window.__PN_DEBUG__ = { player, world, weapons, ui, account };
