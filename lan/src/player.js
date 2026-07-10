import * as THREE from "three";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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
  };

  const keys = new Set();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  let lookAccX = 0; // mouse delta accumulated since the last update()
  let lookAccY = 0;

  function eyeHeight() {
    return 1.62 + (1.05 - 1.62) * state.crouchT;
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

  // Called from the Space keydown event. Driving the jump from the event
  // (instead of polling keys.has("Space")) means a lost keyup can never
  // leave Space "stuck" and disable future jumps.
  function queueJump() {
    // Space always jumps the instant it's pressed, in any state (no ground /
    // coyote gating), so a jump input is never eaten.
    state.vy = state.jumpSpeed;
    state.grounded = false;
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
    const wantCrouch = keys.has("ControlLeft") || keys.has("ControlRight");
    state.crouching = wantCrouch;
    state.crouchT += (Number(wantCrouch) - state.crouchT) * Math.min(1, 12 * dt);
    const moving =
      keys.has("KeyW") || keys.has("KeyA") || keys.has("KeyS") || keys.has("KeyD");
    state.moving = moving;
    // Sprint is derived from input every frame (held Shift), decoupled from
    // jumping: holding Shift in mid-air simply makes sprint engage the moment
    // you land. Only a *new* Space press while W+Shift are held can be blocked
    // by keyboard ghosting — and that combo isn't needed to sprint on landing.
    const sprintHeld = keys.has("ShiftLeft") || keys.has("ShiftRight");
    state.sprinting = sprintHeld && !state.crouching && state.grounded && moving;

    let speed = state.moveSpeed;
    if (state.crouching) speed *= state.crouchMul;
    if (state.sprinting) speed *= state.sprintMul;

    // horizontal basis from yaw
    forward.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));

    let mx = 0;
    let mz = 0;
    if (keys.has("KeyW")) { mx += forward.x; mz += forward.z; }
    if (keys.has("KeyS")) { mx -= forward.x; mz -= forward.z; }
    if (keys.has("KeyD")) { mx += right.x; mz += right.z; }
    if (keys.has("KeyA")) { mx -= right.x; mz -= right.z; }

    // wish velocity -> exponential approach: quick to top speed on the ground,
    // gentle drift in the air. Feels like acceleration without losing max speed.
    let wishX = 0;
    let wishZ = 0;
    const len = Math.hypot(mx, mz);
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

    resolveCollisions();

    // (jump is applied immediately in queueJump, on the Space keydown event)

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

  return { state, keys, look, addPitch, queueJump, update };
}
