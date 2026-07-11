import { account } from "./account.js?v=260711003";

// Front-end shell: boot logo animation -> login/register -> home lobby ->
// enter game. The 3D game (main.js) renders behind these screens and is only
// revealed when the player deploys. The backpack is an in-game panel (B), owned
// by main.js, not a lobby screen.

const $ = (id) => document.getElementById(id);
const SCREENS = ["bootLogo", "authScreen", "homeScreen"];

function show(id) {
  for (const s of SCREENS) {
    const e = $(s);
    if (e) e.classList.toggle("hidden", s !== id);
  }
}
function hideAll() {
  for (const s of SCREENS) { const e = $(s); if (e) e.classList.add("hidden"); }
}

// --- boot logo -------------------------------------------------------------
function boot() {
  show("bootLogo");
  let routed = false;
  const go = () => { if (routed) return; routed = true; route(); };
  const skip = () => {
    const b = $("bootLogo");
    if (!b || b.classList.contains("done")) return;
    b.classList.add("done");
    setTimeout(go, 500);
  };
  setTimeout(skip, 3200);
  $("bootLogo").addEventListener("click", skip);
}

function route() {
  if (account.current()) showHome();
  else showAuth();
}

// --- auth ------------------------------------------------------------------
function showAuth() {
  show("authScreen");
  $("authMsg").textContent = "";
}
function doAuth(mode) {
  const u = $("authUser").value;
  const p = $("authPass").value;
  const res = mode === "register" ? account.register(u, p) : account.login(u, p);
  if (res.ok) { $("authPass").value = ""; showHome(); }
  else { $("authMsg").textContent = res.msg; }
}

// --- home lobby ------------------------------------------------------------
function showHome() {
  const data = account.getData();
  $("homeUser").textContent = account.current() || "—";
  $("homeCoins").textContent = data ? data.coins : 0;
  show("homeScreen");
  if (document.pointerLockElement) document.exitPointerLock?.();
}

// --- enter game ------------------------------------------------------------
function enterGame() {
  hideAll(); // reveal the game + its "click to start" overlay
}

function wire() {
  $("authLoginBtn").addEventListener("click", () => doAuth("login"));
  $("authRegBtn").addEventListener("click", () => doAuth("register"));
  $("authPass").addEventListener("keydown", (e) => { if (e.key === "Enter") doAuth("login"); });

  $("btnDeploy").addEventListener("click", enterGame);
  $("btnLogout").addEventListener("click", () => { account.logout(); showAuth(); });

  const back = $("backToLobby");
  if (back) back.addEventListener("click", showHome);
}

// expose for main.js (pause menu "back to lobby")
window.PN_SHELL = { showHome, enterGame };

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { wire(); boot(); });
} else { wire(); boot(); }
