import * as THREE from "three";
import { audio } from "./audio.js?v=DEV";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Slide tuning.
const SLIDE_MAX_T = 0.95; // hard cap on slide duration (s)
const SLIDE_FRICTION = 7.5; // slide speed bleeds off at this rate (units/s²)
const SLIDE_STEER = 3.2; // how quickly the slide can be curved with WASD
const SLIDE_COOLDOWN = 0.45; // gap before you can slide again (s)

// First-person controller: mouse-look (yaw/pitch), WASD movement with
// sprint/crouch/jump + gravity, and AABB collision against the world.
// Movement uses velocity smoothing (acceleration / glide) instead of instant
// velocity, plus smoothed crouch, head-bob, landing dip and look-sway data so
// the camera and view-model feel fluid.
export function createPlayer(camera, world) {
  camera.rotation.order = "YXZ"; // yaw then pitch — correct FPS look order

  const state = {
    pos: new THREE.Vector3(0, 0, 9),
    yaw: 0, // face -Z, toward the deploy door
    pitch: 0,
    vy: 0,
    grounded: true,
    radius: 0.4,
    moveSpeed: 5,
    sprintMul: 1.7,
    crouchMul: 0.55,
    jumpSpeed: 5.7,
    gravity: 15,
    crouching: false,
    sprinting: false,
    moving: false,
    health: 100,
    maxHealth: 100,
    // smoothed motion state
    velX: 0,
    velZ: 0,
    crouchT: 0, // 0 = standing .. 1 = crouched (eased)
    bobPhase: 0,
    bobAmp: 0,
    landDip: 0, // camera dip right after a hard landing
    swayX: 0, // smoothed look velocity (-1..1), consumed by the view-model
    swayY: 0,
    speed2D: 0, // current horizontal speed (for FOV kick etc.)
    sliding: false,
    slideT: 0,
    slideCooldown: 0,
    slideDirX: 0,
    slideDirZ: 0,
  };

  const keys = new Set();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  let lookAccX = 0; // mouse delta accumulated since the last update()
  let lookAccY = 0;
  let prevCrouch = false; // to detect fresh crouch presses (slide trigger)
  let jumpBuffer = 0; // remembers a Space press for a short window
  let coyote = 0; // grace window after leaving the ground where a jump still counts

  function eyeHeight() {
    // slide drops a touch lower than a normal crouch
    const t = state.sliding ? 1.12 : state.crouchT;
    return 1.62 + (1.05 - 1.62) * t;
  }

  function startSlide() {
    state.sliding = true;
    state.slideT = 0;
    // lock the slide direction to current motion (fall back to facing)
    let dx = state.velX;
    let dz = state.velZ;
    const m = Math.hypot(dx, dz);
    if (m < 0.1) { dx = -Math.sin(state.yaw); dz = -Math.cos(state.yaw); }
    else { dx /= m; dz /= m; }
    state.slideDirX = dx;
    state.slideDirZ = dz;
    const boost = Math.max(state.speed2D * 1.25, state.moveSpeed * 2.0);
    state.velX = dx * boost;
    state.velZ = dz * boost;
    audio.slide?.();
  }

  function endSlide() {
    if (!state.sliding) return;
    state.sliding = false;
    state.slideCooldown = SLIDE_COOLDOWN;
  }

  // Called from the mouse-move handler while pointer is locked.
  function look(dx, dy) {
    state.yaw -= dx * 0.0024;
    state.pitch = clamp(state.pitch - dy * 0.0019, -1.5, 1.5);
    lookAccX += dx;
    lookAccY += dy;
  }

  // Small vertical kick used by weapon recoil.
  function addPitch(amount) {
    state.pitch = clamp(state.pitch + amount, -1.5, 1.5);
  }

  // Horizontal recoil jitter (spray drift).
  function addYaw(amount) {
    state.yaw += amount;
  }

  // Called from the Space keydown event. Instead of jumping immediately, we
  // buffer the press; update() consumes it only when grounded (or within the
  // coyote window). Buffering keeps a slightly-early press from being eaten,
  // while the grounded/coyote gate stops mid-air Space from letting you fly.
  function queueJump() {
    jumpBuffer = 0.12;
  }

  function resolveCollisions() {
    const r = state.radius;
    // clamp to the current region's bounds (base, or the far Area 1 room)
    if (world.state && world.state.inArea && world.areaSpawn) {
      const cx = world.areaSpawn.x;
      const hx = (world.areaHalfX || 11) - 0.5 - r;
      const hz = (world.areaHalfZ || 13) - 0.5 - r;
      state.pos.x = clamp(state.pos.x, cx - hx, cx + hx);
      state.pos.z = clamp(state.pos.z, -hz, hz);
    } else {
      const limit = world.ROOM - 0.5 - r;
      state.pos.x = clamp(state.pos.x, -limit, limit);
      state.pos.z = clamp(state.pos.z, -limit, limit);
    }

    // push out of cover/wall boxes (XZ only)
    for (const box of world.colliders) {
      const minX = box.min.x - r;
      const maxX = box.max.x + r;
      const minZ = box.min.z - r;
      const maxZ = box.max.z + r;
      if (state.pos.x <= minX || state.pos.x >= maxX || state.pos.z <= minZ || state.pos.z >= maxZ) {
        continue;
      }
      const pL = state.pos.x - minX;
      const pR = maxX - state.pos.x;
      const pB = state.pos.z - minZ;
      const pF = maxZ - state.pos.z;
      const m = Math.min(pL, pR, pB, pF);
      if (m === pL) state.pos.x = minX;
      else if (m === pR) state.pos.x = maxX;
      else if (m === pB) state.pos.z = minZ;
      else state.pos.z = maxZ;
    }
  }

  function update(dt) {
    state.slideCooldown = Math.max(0, state.slideCooldown - dt);
    const wantCrouch = keys.has("ControlLeft") || keys.has("ControlRight");
    const crouchPressed = wantCrouch && !prevCrouch; // fresh press this frame
    prevCrouch = wantCrouch;

    const moving =
      keys.has("KeyW") || keys.has("KeyA") || keys.has("KeyS") || keys.has("KeyD");
    state.moving = moving;
    const sprintHeld = keys.has("ShiftLeft") || keys.has("ShiftRight");

    // --- slide: tap crouch while sprinting fast on the ground ---
    if (crouchPressed && state.grounded && !state.sliding && state.slideCooldown <= 0 &&
        sprintHeld && state.speed2D > state.moveSpeed * 0.9) {
      startSlide();
    }

    // crouch flag (sliding keeps you low-profile); sprint pauses during a slide
    state.crouching = wantCrouch || state.sliding;
    const crouchTarget = state.sliding ? 1 : Number(wantCrouch);
    state.crouchT += (crouchTarget - state.crouchT) * Math.min(1, 12 * dt);
    // Sprint is derived from input every frame (held Shift), decoupled from
    // jumping so a lost keyup can never leave sprint stuck.
    state.sprinting = sprintHeld && !wantCrouch && !state.sliding && state.grounded && moving;

    // horizontal basis from yaw
    forward.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));

    let mx = 0;
    let mz = 0;
    if (keys.has("KeyW")) { mx += forward.x; mz += forward.z; }
    if (keys.has("KeyS")) { mx -= forward.x; mz -= forward.z; }
    if (keys.has("KeyD")) { mx += right.x; mz += right.z; }
    if (keys.has("KeyA")) { mx -= right.x; mz -= right.z; }
    const len = Math.hypot(mx, mz);

    if (state.sliding) {
      // Slide: decaying burst along a locked (but gently steerable) direction.
      state.slideT += dt;
      let sp = Math.hypot(state.velX, state.velZ);
      sp = Math.max(0, sp - SLIDE_FRICTION * dt);
      if (len > 0) { // curve the slide a little toward the input direction
        const s = Math.min(1, SLIDE_STEER * dt);
        state.slideDirX += (mx / len - state.slideDirX) * s;
        state.slideDirZ += (mz / len - state.slideDirZ) * s;
        const dm = Math.hypot(state.slideDirX, state.slideDirZ) || 1;
        state.slideDirX /= dm;
        state.slideDirZ /= dm;
      }
      state.velX = state.slideDirX * sp;
      state.velZ = state.slideDirZ * sp;
      state.pos.x += state.velX * dt;
      state.pos.z += state.velZ * dt;
      state.speed2D = sp;
      // A tap-slide runs its course: end when timed out, slowed to a crouch-walk,
      // or knocked airborne (a jump slide-hops out via queueJump).
      if (state.slideT > SLIDE_MAX_T || sp < state.moveSpeed || !state.grounded) {
        endSlide();
      }
    } else {
      // wish velocity -> exponential approach: quick to top speed on the ground,
      // gentle drift in the air. Feels like acceleration without losing max speed.
      let speed = state.moveSpeed;
      if (state.crouching) speed *= state.crouchMul;
      if (state.sprinting) speed *= state.sprintMul;
      let wishX = 0;
      let wishZ = 0;
      if (len > 0) {
        wishX = (mx / len) * speed;
        wishZ = (mz / len) * speed;
      }
      const accel = state.grounded ? (len > 0 ? 13 : 11) : 3.2;
      const k = Math.min(1, accel * dt);
      state.velX += (wishX - state.velX) * k;
      state.velZ += (wishZ - state.velZ) * k;
      state.pos.x += state.velX * dt;
      state.pos.z += state.velZ * dt;
      state.speed2D = Math.hypot(state.velX, state.velZ);
    }

    resolveCollisions();

    // --- jump: buffered press consumed only when grounded or within coyote ---
    // This is what kills the old infinite-fly bug: once you've been airborne
    // longer than the coyote window, there is no ground credit left to jump on.
    jumpBuffer = Math.max(0, jumpBuffer - dt);
    coyote = state.grounded ? 0.1 : Math.max(0, coyote - dt);
    if (jumpBuffer > 0 && coyote > 0 && state.vy <= 0.01) {
      state.vy = state.jumpSpeed;
      state.grounded = false;
      coyote = 0;
      jumpBuffer = 0;
      if (state.sliding) endSlide(); // slide-hop: keep the horizontal momentum
    }

    const prevVy = state.vy;
    state.vy -= state.gravity * dt;
    state.pos.y += state.vy * dt;
    if (state.pos.y <= 0) {
      state.pos.y = 0;
      state.vy = 0;
      if (!state.grounded && prevVy < -5) {
        state.landDip = Math.min(1, -prevVy / 14); // hard landing -> camera dip
      }
      state.grounded = true;
    }
    state.landDip = Math.max(0, state.landDip - dt * 3.2);

    // head-bob: driven by actual horizontal speed, fades in/out smoothly
    const bobTarget = state.grounded && state.speed2D > 0.6 ? Math.min(1, state.speed2D / 8.5) : 0;
    state.bobAmp += (bobTarget - state.bobAmp) * Math.min(1, 8 * dt);
    if (state.bobAmp > 0.01) state.bobPhase += dt * (4.4 + state.speed2D * 1.15);
    const bobY = Math.sin(state.bobPhase * 2) * 0.021 * state.bobAmp;

    // smoothed look velocity for view-model sway (normalized, frame-rate safe)
    const swayTX = clamp((lookAccX / Math.max(dt, 0.001)) * 0.0006, -1, 1);
    const swayTY = clamp((lookAccY / Math.max(dt, 0.001)) * 0.0006, -1, 1);
    const sk = Math.min(1, 14 * dt);
    state.swayX += (swayTX - state.swayX) * sk;
    state.swayY += (swayTY - state.swayY) * sk;
    lookAccX = 0;
    lookAccY = 0;

    // apply to camera
    const dip = Math.sin(Math.min(1, state.landDip) * Math.PI) * 0.16;
    camera.position.set(state.pos.x, state.pos.y + eyeHeight() + bobY - dip, state.pos.z);
    camera.rotation.y = state.yaw;
    camera.rotation.x = state.pitch;
  }

  return { state, keys, look, addPitch, addYaw, queueJump, update };
}
