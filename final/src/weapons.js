import * as THREE from "three";
import { createViewmodel } from "./viewmodel.js?v=260711007";
import { audio } from "./audio.js?v=260711007";

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

// Alternate primaries (looted; equip in the backpack). They share the rifle
// view-model rig for now but have distinct stats, sounds and tracer colours.
// `tracer` recolours the bullet line; `beam` widens+brightens it (laser look).
const SMG_DEF = {
  id: "smg", name: "原型冲锋枪", mode: "auto", damage: 9, fireRate: 1 / 15,
  mag: 35, reserve: 175, reload: 1.2, range: 100, recoil: 0.035, kick: 0.008,
  vm: "rifle", sound: "smg",
};
// Laser: a TRUE continuous beam. While the trigger is held it deals damage and
// drains ammo every frame (no discrete cadence). `damage` here is DPS; ammo
// drains at `drainRate` rounds/sec (kept at the old 25/s so a mag lasts ~4s).
const LASER_DEF = {
  id: "laser", name: "激光步枪", mode: "auto", damage: 130, fireRate: 0,
  mag: 100, reserve: 300, reload: 1.3, range: 160, recoil: 0, kick: 0,
  vm: "rifle", sound: "laser", tracer: 0x66e0ff, beam: true,
  beamContinuous: true, drainRate: 25,
};
// Gatling: spins up while the trigger is held — the barrel cadence climbs from
// `fireRate` (spun-down) toward `spinFast` (spun-up). 100-round belt, slow reload.
const MINIGUN_DEF = {
  id: "minigun", name: "加特林", mode: "auto", damage: 8, fireRate: 0.14,
  mag: 100, reserve: 400, reload: 3.6, range: 120, recoil: 0.03, kick: 0.006,
  vm: "rifle", sound: "minigun", tracer: 0xffb060,
  spinup: true, spinFast: 0.045, spinUp: 0.9, spinDown: 0.7,
};
// Sniper: bolt-action, huge single-shot damage, right-click to scope (narrow
// FOV + steady). Slow cadence, tiny mag.
const SNIPER_DEF = {
  id: "sniper", name: "反器材狙击枪", mode: "semi", damage: 150, fireRate: 1.1,
  mag: 5, reserve: 30, reload: 2.6, range: 320, recoil: 0.16, kick: 0.05,
  vm: "rifle", sound: "sniper", tracer: 0xfff2c0,
  scope: true, zoomFov: 28,
};
// Laser sniper (联狙): scoped rapid semi — hold to fire a rhythmic 4 bolts/sec,
// each an instant high-damage energy beam.
const LASER_SNIPER_DEF = {
  id: "lasersniper", name: "激光狙击枪", mode: "auto", damage: 95, fireRate: 0.25,
  mag: 12, reserve: 72, reload: 2.2, range: 340, recoil: 0.05, kick: 0.02,
  vm: "rifle", sound: "laser", tracer: 0x66e0ff, beam: true,
  scope: true, zoomFov: 32,
};
// Rocket launcher: fires an explosive PROJECTILE (not hitscan). Single shot,
// high AOE, fast flat-shooting rocket (low drop). vm rifle for now.
const ROCKET_DEF = {
  id: "rocket", name: "火箭筒", mode: "semi", fireRate: 1.0,
  mag: 1, reserve: 12, reload: 2.4, recoil: 0.14, kick: 0.05,
  vm: "rifle", sound: "rocket", projectile: true,
  projSpeed: 70, projGravity: 6, aoeRadius: 6.5, aoeDamage: 200, projColor: 0xffa040,
};
// Auto rocket launcher: rapid burst of slower, arcing rockets (more drop),
// smaller each but they add up.
const AUTO_ROCKET_DEF = {
  id: "autorocket", name: "连发火箭筒", mode: "auto", fireRate: 0.35,
  mag: 8, reserve: 48, reload: 3.2, recoil: 0.06, kick: 0.02,
  vm: "rifle", sound: "rocket", projectile: true,
  projSpeed: 34, projGravity: 16, aoeRadius: 4.5, aoeDamage: 85, projColor: 0xff7a3a,
};
const PRIMARY_DEFS = {
  smg_proto: SMG_DEF, laser_rifle: LASER_DEF, minigun: MINIGUN_DEF,
  sniper: SNIPER_DEF, laser_sniper: LASER_SNIPER_DEF,
  rocket: ROCKET_DEF, auto_rocket: AUTO_ROCKET_DEF,
};

// Spread tuning (radians): standing-still baseline + per-shot bloom.
const SPREAD = {
  rifle: { base: 0.0012, perShot: 0.13 },
  smg: { base: 0.002, perShot: 0.09 },
  pistol: { base: 0.0015, perShot: 0.2 },
  laser: { base: 0.0006, perShot: 0.05 }, // pinpoint energy weapon
  minigun: { base: 0.004, perShot: 0.05 }, // sprays, but bloom builds slowly
  sniper: { base: 0.0004, perShot: 0.28 }, // pinpoint scoped, big bloom if spammed
  lasersniper: { base: 0.0003, perShot: 0.24 },
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

  // Persistent beam for continuous-fire weapons (laser): one steady line +
  // glow tube updated every frame while held, rather than per-shot tracers.
  const UP = new THREE.Vector3(0, 1, 0);
  const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
  const beamLine = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.95 }));
  beamLine.visible = false; beamLine.frustumCulled = false;
  scene.add(beamLine);
  const beamTube = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6), new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.4 }));
  beamTube.visible = false; beamTube.frustumCulled = false;
  scene.add(beamTube);
  let beamHumOn = false;

  // Aim-down-sight (right mouse). Scoped weapons narrow the FOV a lot + show a
  // scope overlay; other guns get a mild zoom.
  let aiming = false;
  function aimDown() { if (current.def.mode !== "melee") aiming = true; }
  function aimUp() { aiming = false; }
  function getADS() {
    const def = current.def;
    if (!aiming || def.mode === "melee" || equipPhase !== "idle") return { aiming: false, fov: null, scope: false };
    return { aiming: true, fov: def.scope ? def.zoomFov : 58, scope: !!def.scope };
  }

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
    spin: 0, // gatling spin-up state (0 = spun down, 1 = full RPM)
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
    if (aiming) s *= 0.3; // aiming down sight steadies the shot
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
    const targetDef = PRIMARY_DEFS[opts.primary] || DEFS[0];
    const slot = weapons[0];
    if (slot.def !== targetDef) {
      beamOff();
      slot.def = targetDef;
      slot.ammo = targetDef.mag;
      slot.reserve = targetDef.reserve;
      slot.reloading = false;
      slot.recoil = 0;
      slot.ammoFrac = 0;
      slot.spin = 0;
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
      const isHead = obj.userData.part === "head"; // head/chest/limb multipliers
      const applied = damage * (obj.userData.mult || 1);
      const ctrl = obj.userData.enemy;
      const killed = world.damageEnemy(ctrl, applied);
      if (hooks.onHitmarker) hooks.onHitmarker(killed, "enemy", { headshot: isHead, heavy: !!ctrl.heavy, elite: !!ctrl.elite, boss: !!ctrl.boss });
      if (hooks.onDamageNumber) hooks.onDamageNumber(hit.point, applied, isHead);
    } else if (obj.userData && typeof obj.userData.onHit === "function") {
      obj.userData.onHit(damage); // e.g. a networked opponent in the 1v1 mode
      if (hooks.onHitmarker) hooks.onHitmarker(false);
    }
    return hit.point.clone();
  }

  // --- continuous laser beam: damage + ammo drain + steady visual per frame ---
  const beamFrom = new THREE.Vector3();
  function beamTick(dt) {
    const w = current;
    // drain ammo at the weapon's rounds/sec rate (kept as before)
    w.ammoFrac = (w.ammoFrac || 0) + dt * (w.def.drainRate || 25);
    while (w.ammoFrac >= 1 && w.ammo > 0) { w.ammoFrac -= 1; w.ammo -= 1; }
    // raycast for the impact point + apply continuous (DPS × dt) damage
    ray.setFromCamera(screenCenter, camera);
    ray.far = w.def.range;
    const hits = ray.intersectObjects(world.getHittables(), false);
    let end;
    if (hits.length) {
      const hit = hits[0];
      end = hit.point;
      const obj = hit.object;
      const dmg = w.def.damage * dt; // damage is DPS for the beam
      if (obj.userData && obj.userData.type === "enemy") {
        const isHead = obj.userData.part === "head";
        const ctrl = obj.userData.enemy;
        const applied = dmg * (obj.userData.mult || 1);
        const killed = world.damageEnemy(ctrl, applied);
        // accumulate beam damage and flush a floating number ~8x/sec so it
        // "ticks" damage like the other guns instead of showing nothing
        w.beamAccum = (w.beamAccum || 0) + applied;
        if (Math.random() < dt * 8 && hooks.onDamageNumber) {
          hooks.onDamageNumber(hit.point, w.beamAccum, isHead);
          w.beamAccum = 0;
        }
        if (killed && hooks.onHitmarker) hooks.onHitmarker(true, "enemy", { headshot: isHead, heavy: !!ctrl.heavy, elite: !!ctrl.elite, boss: !!ctrl.boss });
      } else if (obj.userData && obj.userData.type === "target") {
        world.damageTarget(obj, dmg);
      } else if (obj.userData && typeof obj.userData.onHit === "function") {
        obj.userData.onHit(dmg);
      }
      if (Math.random() < dt * 26) spawnImpact(hit.point); // occasional sparks
    } else {
      end = ray.ray.origin.clone().addScaledVector(ray.ray.direction, w.def.range);
    }
    // steady beam from the muzzle to the impact
    camera.getWorldPosition(beamFrom);
    camera.getWorldDirection(camDir);
    camRight.crossVectors(camDir, camera.up).normalize();
    beamFrom.addScaledVector(camRight, 0.14).addScaledVector(camera.up, -0.12).addScaledVector(camDir, 0.55);
    beamGeo.setFromPoints([beamFrom, end]);
    beamLine.visible = true;
    const len = Math.max(0.01, beamFrom.distanceTo(end));
    beamTube.position.copy(beamFrom).add(end).multiplyScalar(0.5);
    beamTube.scale.set(1, len, 1);
    beamTube.quaternion.setFromUnitVectors(UP, end.clone().sub(beamFrom).normalize());
    beamTube.visible = true;
    muzzle.intensity = 3;
    vm.flash();
    if (!beamHumOn) { audio.laserBeam(true); beamHumOn = true; }
  }
  function beamOff() {
    if (beamLine.visible) beamLine.visible = false;
    if (beamTube.visible) beamTube.visible = false;
    if (beamHumOn) { audio.laserBeam(false); beamHumOn = false; }
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

  // Effective shot interval: gatling shortens it as the barrel spins up.
  function shotInterval(w) {
    if (w.def.spinup) return w.def.fireRate + (w.def.spinFast - w.def.fireRate) * w.spin;
    return w.def.fireRate;
  }

  function fireRanged(time) {
    const w = current;
    if (w.reloading || time - w.lastShot < shotInterval(w)) return;
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
    w.bloom = Math.min(1, w.bloom + (cfg.perShot || 0));
    muzzle.intensity = 4.5;
    vm.flash();
    audio.shot(w.def.sound || w.def.id);
    if (w.def.projectile) { spawnRocket(w.def); return; } // explosive projectile, no hitscan
    spawnCasing();
    const end = damageAt(w.def.range, w.def.damage, spread);
    // brief bullet tracer (worlds that support it draw the line). Energy/heavy
    // weapons recolour + (for the laser) thicken the beam.
    if (end && world.spawnPlayerTracer) {
      world.spawnPlayerTracer(camera, end, { color: w.def.tracer, beam: w.def.beam });
    }
  }

  // --- explosive projectiles (rocket launchers) ----------------------------
  const rockets = [];
  const rocketGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8);
  const rDir = new THREE.Vector3();
  const rPrev = new THREE.Vector3();
  function spawnRocket(def) {
    const from = new THREE.Vector3();
    camera.getWorldPosition(from);
    camera.getWorldDirection(rDir);
    const rightV = new THREE.Vector3().crossVectors(rDir, camera.up).normalize();
    from.addScaledVector(rightV, 0.16).addScaledVector(camera.up, -0.12).addScaledVector(rDir, 0.7);
    const mat = new THREE.MeshBasicMaterial({ color: def.projColor || 0xffa040 });
    const mesh = new THREE.Mesh(rocketGeo, mat);
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(UP, rDir.clone());
    scene.add(mesh);
    rockets.push({ mesh, vel: rDir.clone().multiplyScalar(def.projSpeed), def, life: 5 });
  }
  function detonate(r, point) {
    scene.remove(r.mesh); r.mesh.material.dispose();
    if (world.explodeAt) {
      const results = world.explodeAt(point, r.def.aoeRadius, r.def.aoeDamage);
      for (const res of results) {
        if (hooks.onDamageNumber) hooks.onDamageNumber(res.point, res.dmg, false);
        if (res.killed && hooks.onHitmarker) hooks.onHitmarker(true, "enemy", { heavy: res.heavy, elite: res.elite, boss: res.boss });
      }
    }
  }
  function updateRockets(dt) {
    for (let i = rockets.length - 1; i >= 0; i -= 1) {
      const r = rockets[i];
      r.life -= dt;
      rPrev.copy(r.mesh.position);
      r.vel.y -= r.def.projGravity * dt;
      r.mesh.position.addScaledVector(r.vel, dt);
      r.mesh.quaternion.setFromUnitVectors(UP, r.vel.clone().normalize());
      // impact test: raycast the travelled segment against world geometry/enemies
      const seg = r.mesh.position.clone().sub(rPrev);
      const dist = seg.length();
      let hitPoint = null;
      if (dist > 0.0001) {
        ray.ray.origin.copy(rPrev);
        ray.ray.direction.copy(seg).normalize();
        ray.far = dist;
        const hits = ray.intersectObjects(world.getHittables(), false);
        if (hits.length) hitPoint = hits[0].point;
      }
      if (!hitPoint && r.mesh.position.y <= 0.2) { // ground
        hitPoint = r.mesh.position.clone(); hitPoint.y = 0.1;
      }
      if (hitPoint) { detonate(r, hitPoint); rockets.splice(i, 1); continue; }
      if (r.life <= 0) { detonate(r, r.mesh.position.clone()); rockets.splice(i, 1); }
    }
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
      if (!current.def.beamContinuous) fireRanged(time); // beam is driven in update()
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
    aiming = false;
    beamOff();
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

    // continuous laser beam is driven here (steady damage + visual); every
    // other case falls back to the discrete auto-fire / melee paths.
    if (current.def.beamContinuous && current.firing && !current.reloading && current.ammo > 0 && equipPhase === "idle") {
      beamTick(dt);
    } else {
      beamOff();
      if (current.def.beamContinuous && current.firing && current.ammo <= 0 && !current.reloading && equipPhase === "idle") reload();
      if (current.def.mode === "auto" && !current.def.beamContinuous && current.firing && equipPhase === "idle") fireRanged(time);
    }
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
    // gatling spin: climbs while the trigger's held with ammo, winds back down
    // otherwise. Drives the shot cadence via shotInterval().
    for (const wp of weapons) {
      if (!wp.def.spinup) continue;
      const spinning = wp === current && wp.firing && !wp.reloading && wp.ammo > 0 && equipPhase === "idle";
      if (spinning) wp.spin = Math.min(1, wp.spin + dt / wp.def.spinUp);
      else wp.spin = Math.max(0, wp.spin - dt / wp.def.spinDown);
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

    // scoped aiming: drop the view-model out of the way behind the scope overlay
    if (aiming && w.def.scope) { posY -= 0.5; posX += 0.05; }

    vm.setPose({ posX, posY, posZ, rotX, rotY, rotZ });
    vm.tick(dt);

    updateRockets(dt); // advance explosive projectiles + detonate on impact

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

  return { triggerDown, triggerUp, aimDown, aimUp, getADS, select, reload, resupply, addReserve, applyLoadout, update, getHUD, getSpread: currentSpread };
}
