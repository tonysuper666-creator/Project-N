import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { createArena, buildAvatar } from "./arena.js?v=260711002";
import { createPlayer } from "./player.js?v=260711002";
import { createWeapons } from "./weapons.js?v=260711002";
import { createNet } from "./net.js?v=260711002";
import { audio } from "./audio.js?v=260711002";

const BUILD_VERSION = "260611lan3";
document.getElementById("buildVer").textContent = `v${BUILD_VERSION}`;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 200);
scene.add(camera);

// separate view-model scene/camera (rendered on top with cleared depth)
const viewScene = new THREE.Scene();
const viewCamera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.01, 10);
viewScene.add(viewCamera);
viewScene.add(new THREE.HemisphereLight(0xcfe6ff, 0x35506a, 1.1));
const vmKey = new THREE.DirectionalLight(0xfff4e0, 2.0); vmKey.position.set(0.4, 1, 0.8); viewScene.add(vmKey);

const arena = createArena(scene);
const player = createPlayer(camera, arena);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.14, 0.4, 1.0));
composer.addPass(new OutputPass());
composer.addPass(new SMAAPass(window.innerWidth, window.innerHeight));

// HUD refs
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const crosshair = document.getElementById("crosshair");
const hitmarker = document.getElementById("hitmarker");
const killBanner = document.getElementById("killBanner");
const scoreEl = document.getElementById("score");
const ammoEl = document.getElementById("ammo");
const healthEl = document.getElementById("health");
const weaponEl = document.getElementById("weapon");
const sprintEl = document.getElementById("sprint");
const promptEl = document.getElementById("prompt");
const oppStatus = document.getElementById("oppStatus");
const oppHpEl = document.getElementById("oppHp");
const fpsEl = document.getElementById("fps");

function toast(msg) {
  const el = document.createElement("div"); el.className = "toast"; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("show"), 10);
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 400); }, 2000);
}
function showKill() {
  audio.kill();
  killBanner.classList.remove("show"); void killBanner.offsetWidth; killBanner.classList.add("show");
}

const weapons = createWeapons(camera, scene, arena, player, {
  onHitmarker(killed) { hitmarker.classList.remove("show"); void hitmarker.offsetWidth; hitmarker.classList.add("show"); if (killed) showKill(); },
}, viewCamera);

// --- boot logo: show until the gun model is ready (or a short minimum) ---
const bootLogo = document.getElementById("bootLogo");
let bootDone = false;
function endBoot() {
  if (bootDone) return; bootDone = true;
  bootLogo.classList.add("done");
  setTimeout(() => { bootLogo.style.display = "none"; overlay.classList.remove("hidden"); }, 500);
}
setTimeout(endBoot, 2600);

// --- opponent + networking ---
const net = createNet();
let connected = false, role = 0, myKills = 0, dead = false;
const opp = buildAvatar(0xff5a5a);
opp.group.visible = false; scene.add(opp.group);
opp.hit.userData.onHit = (dmg) => net.send({ t: "hit", d: dmg });
arena.addHittable(opp.hit);
let oppFlash = 0;
const oppTarget = { x: 0, y: 0, z: 0, ry: 0 };

function mySpawn() { return arena.spawns[role]; }
function respawnSelf() {
  const s = mySpawn();
  player.state.pos.set(s.pos.x, 0, s.pos.z);
  player.state.yaw = s.yaw; player.state.vy = 0; player.state.health = 100; dead = false;
}
function takeDamage(d) {
  if (dead) return;
  player.state.health = Math.max(0, player.state.health - d);
  if (player.state.health <= 0) { dead = true; net.send({ t: "dead" }); toast("你被击败，正在重生…"); setTimeout(respawnSelf, 900); }
}
net.on("message", (m) => {
  if (m.t === "s") {
    opp.group.visible = true;
    oppTarget.x = m.x; oppTarget.y = m.y || 0; oppTarget.z = m.z; oppTarget.ry = m.ry + Math.PI;
    if (typeof m.hp === "number") oppHpEl.textContent = String(Math.round(m.hp));
    if (m.f) oppFlash = 0.05;
  } else if (m.t === "hit") { takeDamage(m.d || 14); }
  else if (m.t === "dead") { myKills += 1; scoreEl.textContent = String(myKills); showKill(); toast("击败对手 ✦"); }
});
net.on("open", () => { connected = true; netPanel.classList.add("hidden"); oppStatus.classList.remove("hidden"); respawnSelf(); toast("已连接对手！点击屏幕开战"); overlay.classList.remove("hidden"); });
net.on("close", () => { if (connected) toast("连接已断开"); connected = false; opp.group.visible = false; oppStatus.classList.add("hidden"); });
net.on("error", (e) => { $("netMsg").textContent = "网络错误：" + (e.type || e.message || e); });

// --- net panel ---
const netPanel = document.getElementById("netPanel");
const $ = (id) => document.getElementById(id);
function openNet() { netPanel.classList.remove("hidden"); overlay.classList.add("hidden"); if (document.pointerLockElement) document.exitPointerLock?.(); }
function closeNet() { netPanel.classList.add("hidden"); if (!connected) overlay.classList.remove("hidden"); }
function randCode() { const a = "ACDEFGHJKLMNPQRSTUVWXY3479"; let s = ""; for (let i = 0; i < 5; i += 1) s += a[Math.floor(Math.random() * a.length)]; return s; }
$("openNet").addEventListener("click", openNet);
$("netClose").addEventListener("click", closeNet);
$("roleHost").addEventListener("click", async () => {
  role = 0; $("hostFlow").classList.remove("hidden"); $("guestFlow").classList.add("hidden");
  const code = randCode(); $("roomCode").textContent = "…";
  $("netMsg").textContent = "正在创建房间…";
  try { await net.host(code); $("roomCode").textContent = code; $("netMsg").textContent = "把房间码发给好友，等待加入…"; }
  catch (e) { $("netMsg").textContent = "创建失败：" + (e.message || e.type || e) + "（房间码可能被占用，重试一次）"; }
});
$("roleGuest").addEventListener("click", () => { role = 1; $("guestFlow").classList.remove("hidden"); $("hostFlow").classList.add("hidden"); $("netMsg").textContent = "输入主机的房间码后点加入。"; });
$("joinBtn").addEventListener("click", async () => {
  const code = ($("joinCode").value || "").trim().toUpperCase();
  if (code.length < 3) { $("netMsg").textContent = "请输入房间码"; return; }
  $("netMsg").textContent = "正在连接…";
  try { await net.join(code); $("netMsg").textContent = "已连接，等待开战…"; }
  catch (e) { $("netMsg").textContent = "连接失败：" + (e.message || e.type || e); }
});
$("copyCode").addEventListener("click", () => { navigator.clipboard.writeText($("roomCode").textContent); $("netMsg").textContent = "房间码已复制"; });

// --- input ---
const inputState = { locked: false };
let localFiring = false;
let activeInteractable = null;
function requestLock() { audio.resume(); renderer.domElement.requestPointerLock?.(); }
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    const p = document.documentElement.requestFullscreen?.();
    (p || Promise.resolve()).then(() => { try { navigator.keyboard?.lock?.(); } catch (_) {} }).catch(() => {});
  } else { try { navigator.keyboard?.unlock?.(); } catch (_) {} document.exitFullscreen?.(); }
}
function showPause() { overlay.classList.remove("hidden"); crosshair.style.display = "none"; player.keys.clear(); }

function interact() {
  if (!activeInteractable) return;
  if (activeInteractable.action === "ammo") { weapons.resupply(); audio.reload(); toast("弹药已补充"); }
}
function updateInteraction() {
  let best = null, bestD = Infinity;
  const p = player.state.pos;
  for (const it of arena.interactables) {
    const d = Math.hypot(p.x - it.pos.x, p.z - it.pos.z);
    if (d < it.radius && d < bestD) { best = it; bestD = d; }
  }
  activeInteractable = best;
  if (best) { promptEl.textContent = `[E] ${best.name}`; promptEl.style.display = "block"; }
  else promptEl.style.display = "none";
}

function onKeyDown(e) {
  if (e.code === "F8") { e.preventDefault(); toggleFullscreen(); return; }
  if (!netPanel.classList.contains("hidden")) { if (e.code === "Escape") closeNet(); return; }
  if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ControlLeft"].includes(e.code)) e.preventDefault();
  if (e.code === "Escape") { document.exitPointerLock?.(); return; }
  player.keys.add(e.code);
  if (e.code === "Space" && !e.repeat) player.queueJump();
  if (e.code === "KeyE") interact();
  if (e.code === "KeyR") weapons.reload();
  if (e.code === "Digit1") weapons.select(0);
  if (e.code === "Digit2") weapons.select(1);
  if (e.code === "Digit3") weapons.select(2);
}
function onKeyUp(e) { player.keys.delete(e.code); }
function onMouseMove(e) { if (inputState.locked) player.look(e.movementX, e.movementY); }
function onMouseDown(e) { if (!inputState.locked) return; if (e.button === 0) { localFiring = true; weapons.triggerDown(performance.now() / 1000); } }
function onMouseUp(e) { if (e.button === 0) { localFiring = false; weapons.triggerUp(); } }
function onLockChange() {
  inputState.locked = document.pointerLockElement === renderer.domElement;
  const paneOpen = !netPanel.classList.contains("hidden");
  overlay.classList.toggle("hidden", inputState.locked || paneOpen);
  crosshair.style.display = inputState.locked ? "block" : "none";
  if (!inputState.locked) { localFiring = false; weapons.triggerUp(); player.keys.clear(); promptEl.style.display = "none"; }
}
startBtn.addEventListener("click", requestLock);
renderer.domElement.addEventListener("click", () => { if (!inputState.locked && netPanel.classList.contains("hidden") && bootDone) requestLock(); });
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("mousemove", onMouseMove);
window.addEventListener("mousedown", onMouseDown);
window.addEventListener("mouseup", onMouseUp);
document.addEventListener("pointerlockchange", onLockChange);
window.addEventListener("blur", () => { localFiring = false; player.keys.clear(); weapons.triggerUp(); });
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  viewCamera.aspect = camera.aspect; viewCamera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight);
});

function updateHUD() {
  const hud = weapons.getHUD();
  weaponEl.textContent = hud.name; ammoEl.textContent = hud.ammoText;
  sprintEl.textContent = player.state.sprinting ? "开" : "关";
  healthEl.textContent = String(Math.round(player.state.health));
}

let fpsFrames = 0, fpsLast = performance.now(), last = performance.now(), sendAcc = 0;
function animate(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  if (inputState.locked) {
    player.update(dt); weapons.update(dt, now / 1000); arena.update(dt); updateInteraction();
  }
  if (opp.group.visible) {
    opp.group.position.x += (oppTarget.x - opp.group.position.x) * 0.25;
    opp.group.position.y += (oppTarget.y - opp.group.position.y) * 0.25;
    opp.group.position.z += (oppTarget.z - opp.group.position.z) * 0.25;
    let dy = oppTarget.ry - opp.group.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    opp.group.rotation.y += dy * 0.3;
    oppFlash = Math.max(0, oppFlash - dt);
    opp.muzzle.material.opacity = oppFlash > 0 ? 1 : 0;
  }
  if (connected) {
    sendAcc += dt;
    if (sendAcc >= 0.05) { sendAcc = 0; net.send({ t: "s", x: player.state.pos.x, y: player.state.pos.y, z: player.state.pos.z, ry: player.state.yaw, rx: player.state.pitch, f: localFiring, hp: player.state.health }); }
  }
  composer.render();
  renderer.autoClear = false; renderer.clearDepth(); renderer.render(viewScene, viewCamera); renderer.autoClear = true;
  updateHUD();
  fpsFrames += 1;
  if (now - fpsLast >= 500) { fpsEl.textContent = `${Math.round((fpsFrames * 1000) / (now - fpsLast))} FPS`; fpsFrames = 0; fpsLast = now; }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
