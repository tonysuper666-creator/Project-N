import * as THREE from "three";
import { createViewmodel } from "./viewmodel.js?v=260710012";
import { audio } from "./audio.js?v=260710012";

// Weapon definitions. mode drives trigger behaviour:
//   auto  -> fires continuously while held
//   semi  -> one shot per press
//   melee -> draw-slash on press
// vm picks the view-model rig; sound picks the shot SFX (default: id).
const DEFS = [
  { id: "rifle", name: "步枪", mode: "auto", damage: 14, fireRate: 0.1, mag: 30, reserve: 150, reload: 1.4, range: 120, recoil: 0.05, kick: 0.012 },
  { id: "pistol", name: "手枪", mode: "semi", damage: 26, fireRate: 0.2, mag: 12, reserve: 96, reload: 1.0, range: 90, recoil: 0.08, kick: 0.022 },
  { id: "knife", name: "近战刀", mode: "melee", damage: 150, fireRate: 0.42, range: 2.4 },
];

// Alternate primary: the looted prototype SMG (equip it in the backpack).
// Shares the rifle view-model rig for now (dedicated model comes later).
const SMG_DEF = {
  id: "smg", name: "原型冲锋枪", mode: "auto", damage: 9, fireRate: 1 / 15,
  mag: 35, reserve: 175, reload: 1.2, range: 100, recoil: 0.035, kick: 0.008,
  vm: "rifle", sound: "smg",
};

// Spread tuning (radians): standing-still baseline + per-shot bloom.
const SPREAD = {
  rifle: { base: 0.0012, perShot: 0.13 },
  smg: { base: 0.002, perShot: 0.09 },
  pistol: { base: 0.0015, perShot: 0.2 },
};

export function createWeapons(camera, scene, world, player, hooks = {}, viewCamera = camera) {
  const ray = new THREE.Raycaster();
  const screenCenter = new THREE.Vector2(0, 0);
  // The view-model lives under a dedicated camera (rendered in a separate pass
  // with cleared depth) so it never clips into the world when you look down.
  const vm = createViewmodel(viewCamera);

  // Camera-attached muzzle light: lights the scene briefly on fire.
  const muzzle = new THREE.PointLight(0xffd070, 0, 8, 2);
  muzzle.position.set(0, -0.1, -0.6);
  camera.add(muzzle);

  // 3D impact sparks at hit points — a small burst of flying embers.
  const impacts = [];
  const sparkGeo = new THREE.TetrahedronGeometry(0.035, 0);
  function spawnImpact(point) {
    for (let i = 0; i < 5; i += 1) {
      const mat = new THREE.MeshBasicMaterial({ color: i === 0 ? 0xfff3c0 : 0xffc46a, transparent: true, opacity: 1 });
      const spark = new THREE.Mesh(sparkGeo, mat);
      spark.position.copy(point);
      const life = 0.22 + Math.random() * 0.16;
      impacts.push({
        mesh: spark, life, max: life,
        vel: new THREE.Vector3((Math.random() - 0.5) * 3.4, 1 + Math.random() * 2.6, (Math.random() - 0.5) * 3.4),
      });
      scene.add(spark);
    }
  }

  const weapons = DEFS.map((def) => ({
    def,
    ammo: def.mag ?? 0,
    reserve: def.reserve ?? 0,
    reloading: false,
    reloadStart: 0,
    lastShot: -1,
    firing: false,
    recoil: 0,
    swing: 0,
    bloom: 0, // sustained-fire spread build-up (0..1)
    burst: 0, // shots in the current burst (drives horizontal drift)
    kickAccum: 0, // accumulated camera kick, partially recovered after firing
  }));

  // Current cone spread in radians: baseline + bloom + movement penalties.
  function currentSpread() {
    const w = current;
    if (w.def.mode === "melee") return 0;
    const cfg = SPREAD[w.def.id] || SPREAD.rifle;
    let s = cfg.base + w.bloom * 0.02;
    const ps = player.state;
    if (ps) {
      s += (ps.speed2D || 0) * 0.0016; // moving spreads shots
      if (!ps.grounded) s += 0.02; // jump-shots go wide
      if (ps.crouching) s *= 0.6; // crouch tightens the cone
    }
    return s;
  }

  let current = weapons[0];
  vm.setWeapon(current.def.vm || current.def.id);

  const SWITCH_TIME = 0.16;
  let equipT = 0;
  let equipPhase = "idle";
  let pendingIndex = -1;

  // Loadout modifiers applied from the equipped gear (set via applyLoadout).
  const loadout = { reloadMul: 1 };

  const BASE_RESERVE = 999; // in the base (training) reserve ammo is unlimited
  let prevInArea = false; // tracks base<->area transitions for the ammo reset

  // Swap the primary slot / gear modifiers to match the equipped loadout.
  // Called by the shell when the account's equipment changes.
  function applyLoadout(opts = {}) {
    loadout.reloadMul = opts.reloadMul ?? 1;
    const targetDef = opts.primary === "smg_proto" ? SMG_DEF : DEFS[0];
    const slot = weapons[0];
    if (slot.def !== targetDef) {
      slot.def = targetDef;
      slot.ammo = targetDef.mag;
      slot.reserve = targetDef.reserve;
      slot.reloading = false;
      slot.recoil = 0;
      if (current === slot) vm.setWeapon(targetDef.vm || targetDef.id);
    }
  }

  // Returns the end point of the shot (hit point, or max range) so the caller
  // can draw a tracer.
  const devUp = new THREE.Vector3();
  const devRight = new THREE.Vector3();
  function damageAt(range, damage, spread = 0) {
    ray.setFromCamera(screenCenter, camera);
    if (spread > 0) { // deviate the ray inside the spread cone
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      devRight.crossVectors(ray.ray.direction, camera.up).normalize();
      devUp.crossVectors(devRight, ray.ray.direction).normalize();
      ray.ray.direction
        .addScaledVector(devRight, Math.cos(a) * r)
        .addScaledVector(devUp, Math.sin(a) * r)
        .normalize();
    }
    ray.far = range;
    const hits = ray.intersectObjects(world.getHittables(), false);
    if (hits.length === 0) {
      return ray.ray.origin.clone().addScaledVector(ray.ray.direction, range);
    }
    const hit = hits[0];
    spawnImpact(hit.point);
    const obj = hit.object;
    if (obj.userData && obj.userData.type === "target") {
      const killed = world.damageTarget(obj, damage);
      if (hooks.onHitmarker) hooks.onHitmarker(killed, "target");
      if (hooks.onDamageNumber) hooks.onDamageNumber(hit.point, damage, false);
    } else if (obj.userData && obj.userData.type === "enemy") {
      const isHead = obj.userData.part === "head"; // headshots hit twice as hard
      const applied = isHead ? damage * 2 : damage;
      const ctrl = obj.userData.enemy;
      const killed = world.damageEnemy(ctrl, applied);
      if (hooks.onHitmarker) hooks.onHitmarker(killed, "enemy", { headshot: isHead, heavy: !!ctrl.heavy });
      if (hooks.onDamageNumber) hooks.onDamageNumber(hit.point, applied, isHead);
    } else if (obj.userData && typeof obj.userData.onHit === "function") {
      obj.userData.onHit(damage); // e.g. a networked opponent in the 1v1 mode
      if (hooks.onHitmarker) hooks.onHitmarker(false);
    }
    return hit.point.clone();
  }

  function reload() {
    const w = current;
    if (w.def.mode === "melee" || w.reloading || equipPhase !== "idle") return;
    if (w.ammo === w.def.mag || w.reserve === 0) return;
    w.reloading = true;
    w.reloadStart = performance.now() / 1000;
    w.reloadDur = w.def.reload * loadout.reloadMul; // gear can speed this up
    audio.reload();
    setTimeout(() => {
      const need = w.def.mag - w.ammo;
      const take = Math.min(need, w.reserve);
      w.ammo += take;
      w.reserve -= take;
      w.reloading = false;
    }, w.reloadDur * 1000);
  }

  function fireRanged(time) {
    const w = current;
    if (w.reloading || time - w.lastShot < w.def.fireRate) return;
    if (w.ammo <= 0) {
      reload();
      return;
    }
    w.lastShot = time;
    w.ammo -= 1;
    // a touch more recoil standing; much less when crouched
    const rm = player.state && player.state.crouching ? 0.4 : 1.2;
    w.recoil = Math.min(w.recoil + w.def.recoil * rm, 0.18);
    const kick = w.def.kick * rm;
    player.addPitch(kick);
    w.kickAccum = Math.min(w.kickAccum + kick, 0.12); // recovered after the burst
    // sustained spray drifts sideways in a wobble pattern (CS-style)
    w.burst += 1;
    if (w.burst > 4 && player.addYaw) {
      player.addYaw(Math.sin(w.burst * 0.7) * kick * 0.6);
    }
    const cfg = SPREAD[w.def.id] || SPREAD.rifle;
    const spread = currentSpread();
    w.bloom = Math.min(1, w.bloom + cfg.perShot);
    muzzle.intensity = 4.5;
    vm.flash();
    spawnCasing();
    audio.shot(w.def.sound || w.def.id);
    const end = damageAt(w.def.range, w.def.damage, spread);
    // brief bullet tracer (worlds that support it draw the line)
    if (end && world.spawnPlayerTracer) world.spawnPlayerTracer(camera, end);
  }

  // Brass casing ejected to the right of the view — pure eye candy.
  const casingGeo = new THREE.BoxGeometry(0.014, 0.014, 0.04);
  const camDir = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  function spawnCasing() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xc8a038, transparent: true, opacity: 1 });
    const m = new THREE.Mesh(casingGeo, mat);
    camera.getWorldPosition(m.position);
    camera.getWorldDirection(camDir);
    camRight.crossVectors(camDir, camera.up).normalize();
    m.position.addScaledVector(camRight, 0.22).addScaledVector(camera.up, -0.12).addScaledVector(camDir, 0.35);
    const life = 0.7;
    impacts.push({
      mesh: m, life, max: life,
      vel: new THREE.Vector3().addScaledVector(camRight, 1.4 + Math.random()).addScaledVector(camera.up, 1.4 + Math.random() * 0.8).addScaledVector(camDir, 0.3),
    });
    scene.add(m);
  }

  function meleeSwing(time) {
    const w = current;
    if (time - w.lastShot < w.def.fireRate) return;
    w.lastShot = time;
    w.swing = 1;
    audio.shot("knife");
    damageAt(w.def.range, w.def.damage);
  }

  // refill all ranged weapons to full reserve + mag (ammo stations).
  function resupply() {
    for (const w of weapons) {
      if (w.def.mode === "melee") continue;
      w.reserve = w.def.reserve;
      w.ammo = w.def.mag;
    }
  }

  // add reserve ammo to one weapon (vendor purchases), capped at 999.
  function addReserve(id, amount) {
    const w = weapons.find((x) => x.def.id === id);
    if (!w || w.def.mode === "melee") return;
    w.reserve = Math.min(999, w.reserve + amount);
  }

  function triggerDown(time) {
    if (equipPhase !== "idle") return;
    if (current.def.mode === "auto") {
      current.firing = true;
      fireRanged(time);
    } else if (current.def.mode === "semi") {
      fireRanged(time);
    } else {
      current.firing = true; // hold to keep swinging
      meleeSwing(time);
    }
  }

  function triggerUp() {
    current.firing = false;
  }

  function select(index) {
    if (index < 0 || index >= weapons.length) return;
    const target = weapons[index];
    if (equipPhase === "idle" && target === current) return;
    if (equipPhase === "lower" && weapons[pendingIndex] === target) return;
    pendingIndex = index;
    equipPhase = "lower";
    current.firing = false;
  }

  function update(dt, time) {
    // --- ammo economy by region (PvE world only) ---
    // In the base (training range) reserve ammo is locked to 999 so you can
    // practise freely. Deploying to a combat area resets reserves to the
    // weapon's standard loadout so ammo actually matters out in the field.
    // Guarded on `inArea` existing so the 1v1 arena (no base concept) keeps
    // its own finite-ammo economy untouched.
    if (world.state && "inArea" in world.state) {
      const inArea = !!world.state.inArea;
      if (!inArea) {
        for (const w of weapons) if (w.def.mode !== "melee") w.reserve = BASE_RESERVE;
      } else if (!prevInArea) {
        for (const w of weapons) if (w.def.mode !== "melee") w.reserve = w.def.reserve;
      }
      prevInArea = inArea;
    }

    // weapon switch: lower -> swap -> raise
    if (equipPhase === "lower") {
      equipT = Math.min(1, equipT + dt / SWITCH_TIME);
      if (equipT >= 1) {
        current = weapons[pendingIndex];
        vm.setWeapon(current.def.vm || current.def.id);
        equipPhase = "raise";
      }
    } else if (equipPhase === "raise") {
      equipT = Math.max(0, equipT - dt / SWITCH_TIME);
      if (equipT <= 0) equipPhase = "idle";
    }

    if (current.def.mode === "auto" && current.firing && equipPhase === "idle") fireRanged(time);
    if (current.def.mode === "melee" && current.firing && equipPhase === "idle") meleeSwing(time);

    const w = current;
    if (w.def.mode === "melee") {
      w.swing = Math.max(0, w.swing - dt * 2.4);
    } else {
      w.recoil = Math.max(0, w.recoil - dt * 0.9);
      w.bloom = Math.max(0, w.bloom - dt * 2.2);
      if (time - w.lastShot > 0.3) w.burst = 0;
      // after the burst the camera smoothly recovers ~55% of the kick
      if ((!w.firing || w.reloading) && w.kickAccum > 0) {
        const rec = Math.min(w.kickAccum, dt * 0.4);
        player.addPitch(-rec * 0.55);
        w.kickAccum -= rec;
      }
    }
    if (muzzle.intensity > 0) muzzle.intensity = Math.max(0, muzzle.intensity - dt * 40);

    let reloadDip = 0;
    if (w.reloading) reloadDip = Math.sin(Math.min(1, (time - w.reloadStart) / (w.reloadDur || w.def.reload)) * Math.PI);

    // --- compose the 3D view-model pose (metres / radians) ---
    let posX = 0;
    let posY = 0;
    let posZ = 0;
    let rotX = 0;
    let rotY = 0;
    let rotZ = 0;

    // subtle idle / walk sway so the rig feels alive
    const moving = player.state && player.state.moving;
    const bob = moving ? 1 : 0.35;
    posX += Math.sin(time * 1.6) * 0.004 * bob;
    posY += Math.sin(time * 3.2) * 0.003 * bob;
    rotZ += Math.sin(time * 1.6) * 0.01 * bob;

    // look-sway: the weapon lags a touch behind fast mouse movement
    const ps = player.state;
    if (ps && ps.swayX != null) {
      rotY += -ps.swayX * 0.028;
      rotX += -ps.swayY * 0.016;
      posX += -ps.swayX * 0.008;
      posY += ps.swayY * 0.005;
      // landing dip carries into the weapon too
      if (ps.landDip > 0) posY -= Math.sin(Math.min(1, ps.landDip) * Math.PI) * 0.05;
    }

    posY -= equipT * 0.5; // drop the weapon off-screen while switching
    rotX -= equipT * 1.1;
    posY -= reloadDip * 0.18; // dip + tilt while reloading
    rotX -= reloadDip * 0.55;
    rotZ += reloadDip * 0.3;

    if (w.def.mode === "melee") {
      if (w.swing > 0.001) {
        // ease the blade out and back along a slash arc so it never snaps home
        const p = 1 - w.swing; // 0 -> 1 over the swing
        const arc = Math.sin(p * Math.PI); // 0 -> 1 -> 0
        posX += -0.16 * arc; // sweep across
        posY += 0.08 * arc;
        posZ += -0.14 * arc; // thrust forward
        rotZ += -1.0 * arc; // slash rotation
        rotX += 0.35 * arc;
      }
    } else {
      posZ += w.recoil * 1.25; // kick straight back toward the eye (front-back)
      rotX += w.recoil * 0.2; // only a hint of muzzle rise
    }

    vm.setPose({ posX, posY, posZ, rotX, rotY, rotZ });
    vm.tick(dt);

    // fly + fade impact sparks
    for (let i = impacts.length - 1; i >= 0; i -= 1) {
      const fx = impacts[i];
      fx.life -= dt;
      const k = Math.max(0, fx.life / fx.max);
      fx.mesh.material.opacity = k;
      if (fx.vel) {
        fx.vel.y -= 9.5 * dt;
        fx.mesh.position.addScaledVector(fx.vel, dt);
        fx.mesh.rotation.x += dt * 12;
        fx.mesh.rotation.y += dt * 9;
      }
      if (fx.life <= 0) {
        scene.remove(fx.mesh);
        fx.mesh.material.dispose();
        impacts.splice(i, 1);
      }
    }
  }

  function getHUD() {
    const w = current;
    return {
      name: w.def.name,
      ammoText: w.def.mode === "melee" ? "—" : w.reloading ? "换弹中…" : `${w.ammo} / ${w.reserve}`,
    };
  }

  return { triggerDown, triggerUp, select, reload, resupply, addReserve, applyLoadout, update, getHUD, getSpread: currentSpread };
}
