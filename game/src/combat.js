// Combat on foot: fists and a pistol, rival gang members who shoot back,
// take cover behind buildings when hurt, and flee at low health. Health
// and armour, muzzle flashes, hit sparks and a brief slow-down on a kill
// (main.js handles the slow-down). Two free-roam hotspots hold rival
// crews that ambush the player; fallen enemies drop spare rounds.
import * as THREE from 'three';
import { WEAPONS } from './config.js';

const ENEMY_SHIRT = 0x5b2a6e;
const ENEMY_SKIN = 0xc98d64;

// Two free-roam rival hotspots: an alley crew and a downtown crew.
const HOTSPOTS = [
  { x: -120, z: 150, spawned: false, cleared: false },
  { x: 180, z: -150, spawned: false, cleared: false },
];

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

export function createCombat(scene, onPlayerHit, onKill, colliders = [], onHotspotClear = null, onWeaponPickup = null, onHit = null) {
  let weapon = 'fists';
  // One magazine + reserve per gun; fists need none. The player starts
  // with fists and the pistol; the SMG, shotgun and rifle are found as
  // glowing weapon crates in the world (see spawnPickup below).
  const owned = new Set(['fists', 'pistol']);
  const mags = {};
  const reserves = {};
  for (const name of Object.keys(WEAPONS)) {
    if (name === 'fists') continue;
    mags[name] = WEAPONS[name].magSize;
    reserves[name] = WEAPONS[name].reserve;
  }
  let cooldown = 0;
  let reloadT = 0;
  let muzzleT = 0;
  let lastShotAt = -10;
  const enemies = [];
  const pickups = [];
  const flashLight = new THREE.PointLight(0xffc860, 0, 14);
  scene.add(flashLight);

  // Tracer rounds: a pool of thin bright bars stretched muzzle-to-target
  // that flare for a tenth of a second. In live play update() fades
  // them; in a staged screenshot they stay frozen in the frame, which
  // is what makes a shootout read as a shootout at a glance.
  const tracers = [];
  for (let i = 0; i < 12; i += 1) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0 }),
    );
    bar.visible = false;
    scene.add(bar);
    tracers.push({ mesh: bar, life: 0 });
  }
  let nextTracer = 0;
  const aimPoint = new THREE.Vector3();
  function fireTracer(x1, y1, z1, x2, y2, z2) {
    const slot = tracers[nextTracer];
    nextTracer = (nextTracer + 1) % tracers.length;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.5) return;
    slot.mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    aimPoint.set(x2, y2, z2);
    slot.mesh.lookAt(aimPoint);
    slot.mesh.scale.set(0.06, 0.06, len);
    slot.mesh.material.opacity = 1;
    slot.mesh.visible = true;
    slot.life = 0.12;
  }

  // One shared radial glow texture for muzzle flashes: a sprite always
  // faces the camera, so a flash reads from any angle.
  function glowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,240,180,1)');
    g.addColorStop(0.4, 'rgba(255,190,60,0.9)');
    g.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const glowTex = glowTexture();

  // The player's muzzle flash: a sprite (always faces the camera) using
  // the same radial glow as the enemies' flashes — a flat plane read as
  // a hard white slab from a low camera; a sprite reads as fire.
  const flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false }));
  flashSprite.scale.set(1.3, 1.3, 1);
  scene.add(flashSprite);

  // An enemy's health bar: a small canvas sprite above the head,
  // redrawn only when the enemy's health changes.
  function makeHealthBar() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 10;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(1.1, 0.17, 1);
    sprite.visible = false;
    scene.add(sprite);
    return { canvas, tex, sprite, lastHp: -1 };
  }
  function paintHealthBar(bar, hp) {
    if (bar.lastHp === hp) return;
    bar.lastHp = hp;
    const ctx = bar.canvas.getContext('2d');
    const f = Math.max(0, hp / 100);
    ctx.clearRect(0, 0, 64, 10);
    ctx.fillStyle = 'rgba(10,10,10,0.85)';
    ctx.fillRect(0, 0, 64, 10);
    ctx.fillStyle = f > 0.5 ? '#39d353' : f > 0.25 ? '#ffb02e' : '#e5534b';
    ctx.fillRect(2, 2, 60 * f, 6);
    ctx.strokeStyle = 'rgba(245,239,228,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, 63, 9);
    bar.tex.needsUpdate = true;
  }

  // Hit sparks: a small pool of bright quads that flare and fade.
  const sparks = [];
  for (let i = 0; i < 10; i += 1) {
    const s = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.6),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    s.visible = false;
    scene.add(s);
    sparks.push({ mesh: s, life: 0 });
  }
  let sparkIdx = 0;

  function spawnSpark(x, y, z) {
    const s = sparks[sparkIdx];
    sparkIdx = (sparkIdx + 1) % sparks.length;
    s.mesh.position.set(x, y, z);
    s.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    s.mesh.material.opacity = 1;
    s.mesh.visible = true;
    s.life = 0.15;
  }

  // The nearest building corner to (x, z) within 25 m, offset just clear
  // of the wall — an enemy hurt in the open runs for it.
  function coverPoint(x, z) {
    let best = null;
    let bestD = 25;
    for (const c of colliders) {
      for (const [cx, cz] of [[c.minX, c.minZ], [c.minX, c.maxZ], [c.maxX, c.minZ], [c.maxX, c.maxZ]]) {
        const d = Math.hypot(cx - x, cz - z);
        if (d < bestD) {
          bestD = d;
          const ox = cx < (c.minX + c.maxX) / 2 ? -1.5 : 1.5;
          const oz = cz < (c.minZ + c.maxZ) / 2 ? -1.5 : 1.5;
          best = { x: cx + ox, z: cz + oz };
        }
      }
    }
    return best;
  }

  // A glowing weapon crate: walk over it to pick the gun up (with a
  // full magazine and reserve). Crates sit at fixed landmarks so the
  // player can find them: SMG by the plaza fountain, shotgun at the
  // port docks, rifle on the hillside overlook.
  function spawnPickup(name, x, z) {
    const g = new THREE.Group();
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9), new THREE.MeshLambertMaterial({ color: 0x2e3440 }));
    crate.position.y = 0.3;
    g.add(crate);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 1.0), new THREE.MeshBasicMaterial({ color: 0xffd21f }));
    glow.position.y = 0.66;
    g.add(glow);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.1), new THREE.MeshLambertMaterial({ color: 0x141414 }));
    barrel.position.y = 0.85;
    barrel.rotation.y = 0.6;
    g.add(barrel);
    g.position.set(x, 0, z);
    scene.add(g);
    const pickup = { name, x, z, mesh: g, taken: false, phase: Math.random() * Math.PI * 2 };
    pickups.push(pickup);
    return pickup;
  }

  function pickupWeapon(name) {
    if (!WEAPONS[name] || name === 'fists') return false;
    const first = !owned.has(name);
    owned.add(name);
    mags[name] = WEAPONS[name].magSize;
    reserves[name] = WEAPONS[name].reserve;
    if (first) weapon = name;
    return first;
  }

  function spawnDefaultPickups() {
    spawnPickup('smg', -48, -48);
    spawnPickup('shotgun', 236, 330);
    spawnPickup('rifle', 300, -300);
  }

  function spawnEnemy(x, z, hp = 100, tag = 'free') {
    const mesh = makeEnemyMesh();
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    // Muzzle flash sprite at the gun, and a health bar over the head —
    // both are what make a distant rival read as an enemy, not a prop.
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0.95, depthWrite: false }));
    flash.scale.set(1.3, 1.3, 1);
    flash.visible = false;
    scene.add(flash);
    const bar = makeHealthBar();
    paintHealthBar(bar, hp);
    bar.sprite.visible = true;
    const cover = coverPoint(x, z);
    const enemy = {
      x, z, hp, mesh, shootT: 1 + Math.random() * 1.5, fleeing: false,
      dead: false, flashT: 0, tag,
      coverX: cover ? cover.x : null, coverZ: cover ? cover.z : null,
      inCover: false, flash, bar,
    };
    enemies.push(enemy);
    return enemy;
  }

  // Move a live enemy (screenshot staging re-forms the crew into a
  // firing line the camera can actually see).
  function placeEnemy(e, x, z) {
    e.x = x;
    e.z = z;
    e.mesh.position.set(x, 0, z);
    const cover = coverPoint(x, z);
    e.coverX = cover ? cover.x : null;
    e.coverZ = cover ? cover.z : null;
    e.inCover = false;
  }

  function clearEnemies(tag) {
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      if (tag === undefined || enemies[i].tag === tag) {
        scene.remove(enemies[i].mesh);
        scene.remove(enemies[i].flash);
        scene.remove(enemies[i].bar.sprite);
        enemies.splice(i, 1);
      }
    }
  }

  function aliveCount(tag) {
    let n = 0;
    for (const e of enemies) if (!e.dead && (tag === undefined || e.tag === tag)) n += 1;
    return n;
  }

  // Fire the current weapon from (ox, oy, oz) along direction (dx, dz)
  // (yaw-only aim; the pistol is a hitscan with a short spread). Returns
  // the enemy hit, if any. An enemy dug into cover is hard to hit: two
  // shots in five spark off the wall instead of landing.
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
          spawnSpark(e.x, 1.2, e.z);
          if (e.hp <= 0) kill(e);
          // Fists land one hit at a time, so the hook fires right here.
          if (onHit) onHit(e, spec.damage);
          return e;
        }
      }
      return null;
    }
    if (mags[weapon] <= 0) return null;
    mags[weapon] -= 1;
    muzzleT = 0.07;
    flashLight.position.set(ox + dx, oy, oz + dz);
    flashLight.intensity = spec.pellets ? 46 : 30;
    flashSprite.position.set(ox + dx * 1.2, oy, oz + dz * 1.2);
    flashSprite.material.opacity = 0.95;
    // One hitscan ray per pellet: the shotgun throws five pellets in a
    // spread cone, the other guns a single tight ray. A pellet that
    // lands still sparks and hurts; pellets past a covered enemy spark
    // off the wall instead.
    const pellets = spec.pellets || 1;
    let hitAny = null;
    let nearestHit = null;
    let nearestHitD = spec.range;
    // Damage tallied per enemy for this trigger pull: a shotgun's five
    // pellets landing on one rival add up to a single number.
    const perEnemy = new Map();
    for (let p = 0; p < pellets; p += 1) {
      const spread = spec.spread || 0;
      const ang = (Math.random() - 0.5) * 2 * spread;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const pdx = dx * ca - dz * sa;
      const pdz = dx * sa + dz * ca;
      let best = null;
      let bestD = spec.range;
      for (const e of enemies) {
        if (e.dead) continue;
        const ex = e.x - ox;
        const ez = e.z - oz;
        const d = Math.hypot(ex, ez);
        if (d > spec.range) continue;
        const dot = (ex * pdx + ez * pdz) / d;
        if (dot < 0.985) continue; // outside the firing cone
        if (d < bestD) { bestD = d; best = e; }
      }
      if (!best) continue;
      if (best.inCover && Math.random() < 0.4) {
        spawnSpark(best.x, 1.3, best.z);
        continue; // the round sparked off the cover
      }
      best.hp -= spec.damage;
      best.flashT = 0.12;
      spawnSpark(best.x, 1.3, best.z);
      if (best.hp <= 0) kill(best);
      perEnemy.set(best, (perEnemy.get(best) || 0) + spec.damage);
      hitAny = best;
      if (bestD < nearestHitD) { nearestHitD = bestD; nearestHit = best; }
    }
    // One bright tracer down the aim line, ending at the first enemy
    // hit — or at full range on a miss, so a miss still reads as fire.
    if (nearestHit) fireTracer(ox + dx, oy, oz + dz, nearestHit.x, 1.3, nearestHit.z);
    else fireTracer(ox + dx, oy, oz + dz, ox + dx * spec.range, oy, oz + dz * spec.range);
    // Report every landed hit once, after kill() settled e.dead, so a
    // takedown callout can trust the flag.
    if (onHit) for (const [foe, dmg] of perEnemy) onHit(foe, dmg);
    return hitAny;
  }

  function kill(e) {
    e.dead = true;
    e.mesh.rotation.x = -Math.PI / 2;
    e.mesh.position.y = 0.35;
    e.flash.visible = false;
    e.bar.sprite.visible = false;
    if (weapon !== 'fists') reserves[weapon] += 6; // fallen enemies drop spare rounds
    if (e.tag === 'hotspot' && aliveCount('hotspot') === 0) {
      // Every hotspot crew is down: each spawned hotspot counts as cleared.
      for (const spot of HOTSPOTS) {
        if (spot.spawned && !spot.cleared) {
          spot.cleared = true;
          if (onHotspotClear) onHotspotClear(spot);
        }
      }
    }
    if (onKill) onKill(e);
  }

  function reload() {
    if (weapon === 'fists' || reloadT > 0 || mags[weapon] === WEAPONS[weapon].magSize || reserves[weapon] <= 0) return;
    reloadT = WEAPONS[weapon].reload;
  }

  function switchWeapon(name) {
    if (WEAPONS[name] && owned.has(name)) weapon = name;
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
    for (const s of sparks) {
      if (s.life > 0) {
        s.life -= dt;
        s.mesh.material.opacity = Math.max(0, s.life / 0.15);
        if (s.life <= 0) s.mesh.visible = false;
      }
    }
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, t.life / 0.12);
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    if (reloadT > 0) {
      reloadT -= dt;
      if (reloadT <= 0 && weapon !== 'fists') {
        const need = WEAPONS[weapon].magSize - mags[weapon];
        const take = Math.min(need, reserves[weapon]);
        mags[weapon] += take;
        reserves[weapon] -= take;
      }
    }
    // Weapon crates: walk over one to pick the gun up.
    for (const pk of pickups) {
      if (pk.taken) continue;
      pk.phase += dt * 3;
      pk.mesh.position.y = Math.sin(pk.phase) * 0.12;
      pk.mesh.rotation.y += dt * 0.8;
      if (Math.hypot(playerPos.x - pk.x, playerPos.z - pk.z) < 2.4) {
        pk.taken = true;
        pk.mesh.visible = false;
        const first = pickupWeapon(pk.name);
        if (onWeaponPickup) onWeaponPickup(pk.name, first);
      }
    }
    // Free-roam hotspots: a rival crew steps out when the player comes near.
    for (const h of HOTSPOTS) {
      if (!h.spawned && Math.hypot(playerPos.x - h.x, playerPos.z - h.z) < 45) {
        h.spawned = true;
        spawnEnemy(h.x - 4, h.z - 3, 100, 'hotspot');
        spawnEnemy(h.x + 4, h.z - 2, 100, 'hotspot');
        spawnEnemy(h.x, h.z + 5, 100, 'hotspot');
      }
    }
    // Enemies shoot back at the player, with a wide spread; hurt enemies
    // fall back to cover and shoot from it, and flee at low health.
    for (const e of enemies) {
      if (e.dead) continue;
      if (e.flashT > 0) e.flashT -= dt;
      const d = Math.hypot(playerPos.x - e.x, playerPos.z - e.z);
      e.fleeing = e.hp < 30;
      if (e.fleeing) {
        e.inCover = false;
        const fx = e.x - playerPos.x;
        const fz = e.z - playerPos.z;
        const fd = Math.hypot(fx, fz) || 1;
        e.x += (fx / fd) * 4 * dt;
        e.z += (fz / fd) * 4 * dt;
      } else if (e.hp < 60 && e.coverX !== null) {
        // Fall back to the nearest building corner and shoot from there.
        const cd = Math.hypot(e.coverX - e.x, e.coverZ - e.z);
        if (cd > 2) {
          e.inCover = false;
          e.x += ((e.coverX - e.x) / cd) * 4.5 * dt;
          e.z += ((e.coverZ - e.z) / cd) * 4.5 * dt;
        } else {
          e.inCover = true;
          if (d < 55) {
            e.shootT -= dt;
            if (e.shootT <= 0) {
              e.shootT = 1.0 + Math.random() * 0.6;
              e.flashT = 0.07;
              fireTracer(e.x, 1.3, e.z, playerPos.x, 1.4, playerPos.z);
              if (Math.random() < Math.min(0.6, Math.max(0.1, 0.45 - d * 0.006) * 1.25)) {
                spawnSpark(playerPos.x, 1.4, playerPos.z);
                if (onPlayerHit) onPlayerHit(8 + Math.floor(Math.random() * 7));
              }
            }
          }
        }
      } else if (d < 55) {
        e.shootT -= dt;
        if (e.shootT <= 0) {
          e.shootT = 1.4 + Math.random() * 0.8;
          e.flashT = 0.07;
          fireTracer(e.x, 1.3, e.z, playerPos.x, 1.4, playerPos.z);
          // Hit chance falls with distance; armour soaks first.
          if (Math.random() < Math.max(0.08, 0.45 - d * 0.006)) {
            spawnSpark(playerPos.x, 1.4, playerPos.z);
            if (onPlayerHit) onPlayerHit(8 + Math.floor(Math.random() * 7));
          }
        }
      }
      e.mesh.position.set(e.x, 0, e.z);
      e.mesh.rotation.y = Math.atan2(playerPos.x - e.x, playerPos.z - e.z);
      e.mesh.children[0].material.color.setHex(e.flashT > 0 ? 0xffffff : ENEMY_SHIRT);
      // Muzzle flash sprite at the gun tip while the shot is live, and
      // the health bar tracking the head — both face the camera.
      if (e.flashT > 0) {
        const gy = e.mesh.rotation.y;
        e.flash.position.set(e.x + Math.sin(gy) * 0.45, 1.3, e.z + Math.cos(gy) * 0.45);
        e.flash.visible = true;
      } else e.flash.visible = false;
      paintHealthBar(e.bar, e.hp);
      e.bar.sprite.position.set(e.x, 2.2, e.z);
    }
  }

  // Freeze a full volley in place for a screenshot: every live enemy
  // shows its muzzle flash and a tracer at the player, and the player's
  // own muzzle flashes with a tracer at the nearest enemy. Nothing here
  // runs a timer — in a staged scene the sim is stopped, so the frame
  // stays exactly like this until the screenshot is taken.
  function stageFx(playerPos) {
    let nearest = null;
    let nearestD = Infinity;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - playerPos.x, e.z - playerPos.z);
      if (d < nearestD) { nearestD = d; nearest = e; }
    }
    for (const e of enemies) {
      if (e.dead) continue;
      e.flashT = 1;
      const gy = Math.atan2(playerPos.x - e.x, playerPos.z - e.z);
      e.mesh.rotation.y = gy;
      e.flash.position.set(e.x + Math.sin(gy) * 0.45, 1.3, e.z + Math.cos(gy) * 0.45);
      e.flash.visible = true;
      paintHealthBar(e.bar, e.hp);
      e.bar.sprite.position.set(e.x, 2.2, e.z);
      e.bar.sprite.visible = true;
      fireTracer(e.x + Math.sin(gy) * 0.45, 1.3, e.z + Math.cos(gy) * 0.45, playerPos.x, 1.4, playerPos.z);
    }
    if (nearest) {
      const dx = nearest.x - playerPos.x;
      const dz = nearest.z - playerPos.z;
      const d = Math.hypot(dx, dz) || 1;
      const ux = dx / d;
      const uz = dz / d;
      muzzleT = 1;
      flashLight.position.set(playerPos.x + ux, 1.5, playerPos.z + uz);
      flashLight.intensity = 30;
      flashSprite.position.set(playerPos.x + ux * 1.2, 1.5, playerPos.z + uz * 1.2);
      flashSprite.material.opacity = 0.95;
      fireTracer(playerPos.x + ux, 1.5, playerPos.z + uz, nearest.x, 1.3, nearest.z);
    }
  }

  // The three weapon crates are part of the world from the start.
  spawnDefaultPickups();

  return {
    get weapon() { return weapon; },
    get weaponName() { return WEAPONS[weapon].name; },
    get ammo() { return weapon === 'fists' ? 0 : mags[weapon]; },
    get reserve() { return weapon === 'fists' ? 0 : reserves[weapon]; },
    get reloading() { return reloadT > 0; },
    get lastShotAt() { return lastShotAt; },
    ownedWeapons() { return ['fists', 'pistol', 'smg', 'shotgun', 'rifle'].filter((n) => owned.has(n)); },
    enemies,
    pickups,
    muzzleFlash: flashSprite,
    spawnEnemy,
    placeEnemy,
    stageFx,
    spawnPickup,
    pickupWeapon,
    clearEnemies,
    aliveCount,
    shoot,
    reload,
    switchWeapon,
    update,
  };
}
