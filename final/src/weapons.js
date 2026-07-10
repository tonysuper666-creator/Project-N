import * as THREE from "three";
import { createViewmodel } from "./viewmodel.js?v=DEV";
import { audio } from "./audio.js?v=DEV";

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
  }));

  let current = weapons[0];
  vm.setWeapon(current.def.vm || current.def.id);

  const SWITCH_TIME = 0.16;
  let equipT = 0;
  let equipPhase = "idle";
  let pendingIndex = -1;

  // Loadout modifiers applied from the equipped gear (set via applyLoadout).
  const loadout = { reloadMul: 1 };

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
  function damageAt(range, damage) {
    ray.setFromCamera(screenCenter, camera);
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
    } else if (obj.userData && obj.userData.type === "enemy") {
      const killed = world.damageEnemy(obj.userData.enemy, damage);
      if (hooks.onHitmarker) hooks.onHitmarker(killed, "enemy");
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
    player.addPitch(w.def.kick * rm);
    muzzle.intensity = 4.5;
    vm.flash();
    audio.shot(w.def.sound || w.def.id);
    const end = damageAt(w.def.range, w.def.damage);
    // brief bullet tracer (worlds that support it draw the line)
    if (end && world.spawnPlayerTracer) world.spawnPlayerTracer(camera, end);
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

  return { triggerDown, triggerUp, select, reload, resupply, addReserve, applyLoadout, update, getHUD };
}
