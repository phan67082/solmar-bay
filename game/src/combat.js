// Combat on foot: fists and a pistol, rival gang members who shoot back,
// health and armour, muzzle flashes and hit sparks. Enemies take cover
// by standing their ground in the plaza and flee at low health.
import * as THREE from 'three';
import { WEAPONS } from './config.js';

const ENEMY_SHIRT = 0x5b2a6e;
const ENEMY_SKIN = 0xc98d64;

function makeEnemyMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.35), new THREE.MeshLambertMaterial({ color: ENEMY_SHIRT }));
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshLambertMaterial({ color: ENEMY_SKIN }));
  head.position.y = 1.68;
  g.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.65, 0.3), new THREE.MeshLambertMaterial({ color: 0x1c1c22 }));
  legs.position.y = 0.33;
  g.add(legs);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.08), new THREE.MeshLambertMaterial({ color: 0x141414 }));
  gun.position.set(0.2, 1.25, 0.3);
  g.add(gun);
  return g;
}

export function createCombat(scene, onPlayerHit, onKill) {
  let weapon = 'fists';
  let ammo = WEAPONS.pistol.magSize;
  let reserve = WEAPONS.pistol.reserve;
  let cooldown = 0;
  let reloadT = 0;
  let muzzleT = 0;
  let lastShotAt = -10;
  const enemies = [];
  const flashLight = new THREE.PointLight(0xffc860, 0, 14);
  scene.add(flashLight);
  const flashSprite = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 1.4),
    new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  scene.add(flashSprite);

  function spawnEnemy(x, z, hp = 100) {
    const mesh = makeEnemyMesh();
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const enemy = { x, z, hp, mesh, shootT: 1 + Math.random() * 1.5, fleeing: false, dead: false, flashT: 0 };
    enemies.push(enemy);
    return enemy;
  }

  function clearEnemies() {
    for (const e of enemies) scene.remove(e.mesh);
    enemies.length = 0;
  }

  // Fire the current weapon from (ox, oy, oz) along direction (dx, dz)
  // (yaw-only aim; the pistol is a hitscan with a short spread). Returns
  // the enemy hit, if any.
  function shoot(ox, oy, oz, dx, dz, time) {
    if (cooldown > 0 || reloadT > 0) return null;
    const spec = WEAPONS[weapon];
    cooldown = spec.rate;
    lastShotAt = time;
    if (weapon === 'fists') {
      for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - ox, e.z - oz);
        if (d < spec.range) {
          e.hp -= spec.damage;
          const k = 2.5 / Math.max(d, 0.5);
          e.x += dx * k;
          e.z += dz * k;
          e.mesh.position.set(e.x, 0, e.z);
          if (e.hp <= 0) kill(e);
          return e;
        }
      }
      return null;
    }
    if (ammo <= 0) return null;
    ammo -= 1;
    muzzleT = 0.07;
    flashLight.position.set(ox + dx, oy, oz + dz);
    flashLight.intensity = 30;
    flashSprite.position.set(ox + dx * 1.2, oy, oz + dz * 1.2);
    flashSprite.material.opacity = 0.95;
    let best = null;
    let bestD = spec.range;
    for (const e of enemies) {
      if (e.dead) continue;
      const ex = e.x - ox;
      const ez = e.z - oz;
      const d = Math.hypot(ex, ez);
      if (d > spec.range) continue;
      const dot = (ex * dx + ez * dz) / d;
      if (dot < 0.985) continue; // outside the firing cone
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) {
      best.hp -= spec.damage;
      best.flashT = 0.12;
      if (best.hp <= 0) kill(best);
    }
    return best;
  }

  function kill(e) {
    e.dead = true;
    e.mesh.rotation.x = -Math.PI / 2;
    e.mesh.position.y = 0.35;
    reserve += 6; // fallen enemies drop spare rounds
    if (onKill) onKill(e);
  }

  function reload() {
    if (weapon !== 'pistol' || reloadT > 0 || ammo === WEAPONS.pistol.magSize || reserve <= 0) return;
    reloadT = WEAPONS.pistol.reload;
  }

  function switchWeapon(name) {
    if (WEAPONS[name]) weapon = name;
  }

  function update(dt, playerPos, time) {
    if (cooldown > 0) cooldown -= dt;
    if (muzzleT > 0) {
      muzzleT -= dt;
      if (muzzleT <= 0) {
        flashLight.intensity = 0;
        flashSprite.material.opacity = 0;
      }
    }
    if (reloadT > 0) {
      reloadT -= dt;
      if (reloadT <= 0) {
        const need = WEAPONS.pistol.magSize - ammo;
        const take = Math.min(need, reserve);
        ammo += take;
        reserve -= take;
      }
    }
    // Enemies shoot back at the player, with a wide spread; they flee at low health.
    for (const e of enemies) {
      if (e.dead) continue;
      if (e.flashT > 0) e.flashT -= dt;
      const d = Math.hypot(playerPos.x - e.x, playerPos.z - e.z);
      e.fleeing = e.hp < 30;
      if (e.fleeing) {
        const fx = e.x - playerPos.x;
        const fz = e.z - playerPos.z;
        const fd = Math.hypot(fx, fz) || 1;
        e.x += (fx / fd) * 4 * dt;
        e.z += (fz / fd) * 4 * dt;
      } else if (d < 55) {
        e.shootT -= dt;
        if (e.shootT <= 0) {
          e.shootT = 1.4 + Math.random() * 0.8;
          e.flashT = 0.07;
          // Hit chance falls with distance; armour soaks first.
          if (Math.random() < Math.max(0.08, 0.45 - d * 0.006)) {
            if (onPlayerHit) onPlayerHit(8 + Math.floor(Math.random() * 7));
          }
        }
      }
      e.mesh.position.set(e.x, 0, e.z);
      e.mesh.rotation.y = Math.atan2(playerPos.x - e.x, playerPos.z - e.z);
      e.mesh.children[0].material.color.setHex(e.flashT > 0 ? 0xffffff : ENEMY_SHIRT);
    }
  }

  return {
    get weapon() { return weapon; },
    get ammo() { return ammo; },
    get reserve() { return reserve; },
    get reloading() { return reloadT > 0; },
    get lastShotAt() { return lastShotAt; },
    enemies,
    muzzleFlash: flashSprite,
    spawnEnemy,
    clearEnemies,
    shoot,
    reload,
    switchWeapon,
    update,
  };
}
