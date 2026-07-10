import * as THREE from "three";
import { createViewmodel } from "./viewmodel.js?v=DEV";
import { audio } from "./audio.js?v=DEV";

// Weapon definitions. mode drives trigger behaviour:
//   auto  -> fires continuously while held
//   semi  -> one shot per press
//   melee -> draw-slash on press
const DEFS = [
  { id: "rifle", name: "步枪", mode: "auto", damage: 14, fireRate: 0.1, mag: 30, reserve: 150, reload: 1.4, range: 120, recoil: 0.05, kick: 0.012 },
  { id: "pistol", name: "手枪", mode: "semi", damage: 26, fireRate: 0.2, mag: 12, reserve: 96, reload: 1.0, range: 90, recoil: 0.08, kick: 0.022 },
  { id: "knife", name: "近战刀", mode: "melee", damage: 150, fireRate: 0.42, range: 2.4 },
];

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

  // 3D impact sparks at hit points.
  const impacts = [];
  const sparkGeo = new THREE.SphereGeometry(0.06, 6, 6);
  function spawnImpact(point) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 1 });
    const spark = new THREE.Mesh(sparkGeo, mat);
    spark.position.copy(point);
    scene.add(spark);
    impacts.push({ mesh: spark, life: 0.25, max: 0.25 });
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
  vm.setWeapon(current.def.id);

  const SWITCH_TIME = 0.16;
  let equipT = 0;
  let equipPhase = "idle";
  let pendingIndex = -1;

  function damageAt(range, damage) {
    ray.setFromCamera(screenCenter, camera);
    ray.far = range;
    const hits = ray.intersectObjects(world.getHittables(), false);
    if (hits.length === 0) return;
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
  }

  function reload() {
    const w = current;
    if (w.def.mode === "melee" || w.reloading || equipPhase !== "idle") return;
    if (w.ammo === w.def.mag || w.reserve === 0) return;
    w.reloading = true;
    w.reloadStart = performance.now() / 1000;
    audio.reload();
    setTimeout(() => {
      const need = w.def.mag - w.ammo;
      const take = Math.min(need, w.reserve);
      w.ammo += take;
      w.reserve -= take;
      w.reloading = false;
    }, w.def.reload * 1000);
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
    audio.shot(w.def.id);
    damageAt(w.def.range, w.def.damage);
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
        vm.setWeapon(current.def.id);
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
    if (w.reloading) reloadDip = Math.sin(Math.min(1, (time - w.reloadStart) / w.def.reload) * Math.PI);

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

    // fade impact sparks
    for (let i = impacts.length - 1; i >= 0; i -= 1) {
      const fx = impacts[i];
      fx.life -= dt;
      const k = Math.max(0, fx.life / fx.max);
      fx.mesh.material.opacity = k;
      fx.mesh.scale.setScalar(0.5 + (1 - k) * 1.5);
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

  return { triggerDown, triggerUp, select, reload, resupply, addReserve, update, getHUD };
}
