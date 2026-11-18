// Wanted level and police pursuit. 0–5 stars: one star brings a patrol
// car that follows; two add a second cruiser and foot officers who chase
// the player on foot; three and up add roadblocks, more cruisers and
// aggressive ramming. Wanted rises for stealing a car in view, hitting
// pedestrians, shooting, killing officers and speeding through a
// roadblock; it fades when the player breaks line of sight and stays
// hidden — faster near the player's own garage. Caught slow and boxed
// in, or grabbed on foot by an officer, the game ends busted (zero
// health ends it wasted; the screens live in main.js).
import * as THREE from 'three';
import { CAR_TYPES } from './config.js';
import { makeCarMesh, driveCar, pursueSteer, applyCarDamage } from './vehicles.js';

const GARAGE = { x: 150, z: 210 };

function makeHeliMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1c3a6e });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 1.8), bodyMat);
  body.castShadow = true;
  g.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.6), new THREE.MeshLambertMaterial({ color: 0x9fd8e8 }));
  glass.position.set(1.6, 0.2, 0);
  g.add(glass);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 0.5), bodyMat);
  tail.position.set(-3.0, 0.3, 0);
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 0.5), bodyMat);
  fin.position.set(-4.5, 0.9, 0);
  g.add(fin);
  const skidMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  for (const s of [-0.8, 0.8]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.12, 0.12), skidMat);
    skid.position.set(0, -1.0, s);
    g.add(skid);
  }
  // Main rotor (spins) and tail rotor.
  const rotor = new THREE.Group();
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 7.6), bladeMat);
    blade.rotation.y = a;
    rotor.add(blade);
  }
  rotor.position.y = 1.0;
  g.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), bladeMat);
  tailRotor.position.set(-4.6, 0.9, 0.35);
  g.add(tailRotor);
  // Searchlight cone under the nose, aimed by code each step.
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(5.5, 34, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  g.add(cone);
  const spot = new THREE.SpotLight(0xfff2b0, 0, 90, 0.28, 0.5);
  g.add(spot);
  g.add(spot.target);
  g.userData.rotor = rotor;
  g.userData.tailRotor = tailRotor;
  g.userData.cone = cone;
  g.userData.spot = spot;
  return g;
}

function makeOfficerMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.35), new THREE.MeshLambertMaterial({ color: 0x1c3a6e }));
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshLambertMaterial({ color: 0xe8b88a }));
  head.position.y = 1.68;
  g.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.65, 0.3), new THREE.MeshLambertMaterial({ color: 0x14181f }));
  legs.position.y = 0.33;
  g.add(legs);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), new THREE.MeshLambertMaterial({ color: 0x101418 }));
  cap.position.y = 1.9;
  g.add(cap);
  return g;
}

export function createPolice(scene) {
  let stars = 0;
  let hiddenT = 0;
  let boxedT = 0;
  let roadblocksEnabled = true;
  let ramCooldown = 0;
  const cruisers = [];
  const officers = [];
  const roadblocks = []; // { x, z, cars: [mesh, mesh], tripped }
  // The police helicopter: one air unit that joins the chase at three
  // stars and up, circling above the player with its searchlight cone
  // locked on. It never lands and never rams — it holds the heat by
  // keeping the player in sight.
  let heli = null;
  let heliAngle = 0;

  function setStars(n) {
    stars = Math.max(0, Math.min(5, n));
    hiddenT = 0;
    boxedT = 0;
    if (stars < 2) clearOfficers();
    if (stars < 3) clearRoadblocks();
  }

  function addStars(n) {
    setStars(stars + n);
  }

  // Spawn a cruiser on a road near the player and set it pursuing.
  function spawnCruiser(x, z) {
    const mesh = makeCarMesh('police', CAR_TYPES.police.colours[0]);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const car = {
      type: 'police', x, z, heading: 0, speed: 0, steer: 0,
      damage: 0, mesh, spec: CAR_TYPES.police,
      headlights: false, hornT: 0, pursuit: true, boxedT: 0,
    };
    cruisers.push(car);
    return car;
  }

  function nearestCruiserDistance(px, pz) {
    let best = Infinity;
    for (const c of cruisers) best = Math.min(best, Math.hypot(c.x - px, c.z - pz));
    return best;
  }

  function spawnOfficer(x, z) {
    const mesh = makeOfficerMesh();
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const officer = { x, z, hp: 50, mesh, grabT: 0, dead: false };
    officers.push(officer);
    return officer;
  }

  function clearOfficers() {
    for (const o of officers) scene.remove(o.mesh);
    officers.length = 0;
  }

  function removeOfficer(o) {
    scene.remove(o.mesh);
    const i = officers.indexOf(o);
    if (i >= 0) officers.splice(i, 1);
  }

  // A roadblock: two parked cruisers across the road ahead of the player.
  // They are static meshes, not pursuing cars, so the player must steer
  // around them or take the hit.
  function spawnRoadblock(px, pz, heading) {
    const ax = px + Math.sin(heading) * 70;
    const az = pz + Math.cos(heading) * 70;
    const snap = (v) => Math.round((v + 360) / 60) * 60 - 360;
    const bx = snap(ax);
    const bz = snap(az);
    if (Math.hypot(bx - px, bz - pz) < 40) return null;
    const across = Math.abs(bx - ax) > Math.abs(bz - az) ? 'z' : 'x';
    const cars = [];
    for (const off of [-2.6, 2.6]) {
      const mesh = makeCarMesh('police', CAR_TYPES.police.colours[0]);
      const cx = across === 'x' ? bx : bx + off;
      const cz = across === 'x' ? bz + off : bz;
      mesh.position.set(cx, 0, cz);
      mesh.rotation.y = across === 'x' ? Math.PI / 2 : 0;
      scene.add(mesh);
      cars.push({ x: cx, z: cz, mesh });
    }
    const block = { x: bx, z: bz, cars, tripped: false };
    roadblocks.push(block);
    return block;
  }

  function clearRoadblocks() {
    for (const b of roadblocks) for (const c of b.cars) scene.remove(c.mesh);
    roadblocks.length = 0;
  }

  // Fists or a pistol round at (ox, oz) along (dx, dz): an officer in the
  // way goes down. Returns the officer hit, if any.
  function hitOfficer(ox, oz, dx, dz, range, dmg, isPunch) {
    for (const o of officers) {
      if (o.dead) continue;
      const ex = o.x - ox;
      const ez = o.z - oz;
      const d = Math.hypot(ex, ez);
      if (d > range) continue;
      if (isPunch) {
        o.hp -= dmg;
        if (o.hp <= 0) { o.dead = true; removeOfficer(o); return o; }
        return o;
      }
      const dot = (ex * dx + ez * dz) / (d || 1);
      if (dot < 0.985) continue;
      o.hp -= dmg;
      if (o.hp <= 0) { o.dead = true; removeOfficer(o); }
      return o;
    }
    return null;
  }

  // Drive the cruisers after the player with pure pursuit at a capped
  // speed that rises with the wanted level. Returns { busted, rammed }:
  // busted when the player is boxed in slow or grabbed by an officer,
  // rammed when a cruiser just slammed the player's car.
  function update(dt, player, collide) {
    if (ramCooldown > 0) ramCooldown -= dt;
    // Cruiser count scales with stars: 1 star patrols, 5 stars floods.
    const want = stars === 0 ? 0 : Math.min(stars + 1, 5);
    while (cruisers.length < want) {
      const a = Math.random() * Math.PI * 2;
      spawnCruiser(player.x + Math.cos(a) * 70, player.z + Math.sin(a) * 70);
    }
    while (cruisers.length > want) {
      const c = cruisers.pop();
      scene.remove(c.mesh);
    }
    let nearest = Infinity;
    let rammed = false;
    for (const c of cruisers) {
      const d = Math.hypot(c.x - player.x, c.z - player.z);
      nearest = Math.min(nearest, d);
      // Three stars and up: faster, and they aim to hit the player's car.
      const cruise = stars >= 3 ? Math.min(34, 18 + stars * 3) : Math.min(30, 16 + stars * 3);
      const { throttle, steer } = pursueSteer(c, player.x, player.z, cruise);
      driveCar(c, throttle, steer, false, dt, collide);
      if (stars >= 3 && player.inCar && player.car && d < 4 && ramCooldown <= 0) {
        rammed = true;
        ramCooldown = 1;
        applyCarDamage(player.car, 5);
        player.car.speed *= 0.7;
      }
    }
    // Helicopter: joins at three stars, leaves when the heat drops.
    // It circles the player at ~34 m up, rotor spinning, searchlight
    // cone and spotlight tracking the player from above.
    if (stars >= 3) {
      if (!heli) {
        const mesh = makeHeliMesh();
        scene.add(mesh);
        // The cone and spotlight live in world space (not as children
        // of the spinning heli group), so their aim is exact.
        const cone = mesh.userData.cone;
        mesh.remove(cone);
        scene.add(cone);
        const spot = mesh.userData.spot;
        mesh.remove(spot);
        scene.add(spot);
        scene.add(spot.target);
        heli = { mesh, cone, spot, x: player.x + 20, z: player.z - 20, y: 34 };
      }
      heliAngle += dt * 0.25;
      const tx = player.x + Math.cos(heliAngle) * 22;
      const tz = player.z + Math.sin(heliAngle) * 22;
      heli.x += (tx - heli.x) * Math.min(1, dt * 1.2);
      heli.z += (tz - heli.z) * Math.min(1, dt * 1.2);
      heli.y += (34 - heli.y) * Math.min(1, dt * 1.5);
      heli.mesh.position.set(heli.x, heli.y, heli.z);
      heli.mesh.rotation.y = Math.atan2(player.x - heli.x, player.z - heli.z) + Math.PI / 2;
      heli.mesh.userData.rotor.rotation.y += dt * 22;
      heli.mesh.userData.tailRotor.rotation.x += dt * 30;
      // Aim the cone from the player up to the heli: the cone's apex
      // (+Y) points at the heli, its base opens over the player.
      const dx = heli.x - player.x;
      const dz = heli.z - player.z;
      const dy = heli.y;
      const len = Math.hypot(dx, dy, dz) || 1;
      heli.cone.position.set((heli.x + player.x) / 2, heli.y / 2, (heli.z + player.z) / 2);
      heli.cone.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(dx / len, dy / len, dz / len),
      );
      heli.cone.scale.set(1, len / 34, 1);
      heli.spot.position.set(heli.x, heli.y - 0.8, heli.z);
      heli.spot.target.position.set(player.x, 0, player.z);
      heli.spot.intensity = 220;
    } else if (heli) {
      scene.remove(heli.mesh);
      scene.remove(heli.cone);
      scene.remove(heli.spot);
      scene.remove(heli.spot.target);
      heli = null;
    }
    // Foot officers at two stars and up, only while the player is on foot.
    if (stars >= 2 && !player.inCar) {
      const wantOfficers = Math.min(stars - 1, 2);
      while (officers.length < wantOfficers) {
        const a = Math.random() * Math.PI * 2;
        spawnOfficer(player.x + Math.cos(a) * 25, player.z + Math.sin(a) * 25);
      }
      for (const o of officers) {
        const dx = player.x - o.x;
        const dz = player.z - o.z;
        const d = Math.hypot(dx, dz) || 1;
        const speed = 5.5;
        o.x += (dx / d) * speed * dt;
        o.z += (dz / d) * speed * dt;
        o.mesh.position.set(o.x, 0, o.z);
        o.mesh.rotation.y = Math.atan2(dx, dz);
        if (d < 1.6) {
          o.grabT += dt;
          if (o.grabT > 1.5) return { busted: true, rammed };
        } else o.grabT = 0;
      }
    } else if (officers.length > 0 && (stars < 2 || player.inCar)) {
      clearOfficers();
    }
    // Roadblocks at three stars and up: keep two ahead of the player.
    if (stars >= 3 && roadblocksEnabled) {
      for (const b of roadblocks) {
        if (Math.hypot(b.x - player.x, b.z - player.z) > 160) {
          for (const c of b.cars) scene.remove(c.mesh);
          roadblocks.splice(roadblocks.indexOf(b), 1);
        }
      }
      while (roadblocks.length < 2) {
        if (!spawnRoadblock(player.x, player.z, player.heading)) break;
      }
    }
    // Wanted fades when no cruiser is near the player for a while —
    // faster near the player's own garage, where the heat dies down.
    if (stars > 0) {
      const nearGarage = Math.hypot(player.x - GARAGE.x, player.z - GARAGE.z) < 40;
      const fadeAfter = nearGarage ? 6 : 15;
      if (nearest > 45) {
        hiddenT += dt;
        if (hiddenT > fadeAfter) { stars -= 1; hiddenT = 0; }
      } else hiddenT = 0;
    }
    // Busted: boxed in by cruisers while slow.
    const playerSpeed = player.inCar ? Math.abs(player.car ? player.car.speed : 0) : 0;
    if (stars > 0 && nearest < 4 && playerSpeed < 2) {
      boxedT += dt;
      if (boxedT > 3) return { busted: true, rammed };
    } else boxedT = 0;
    return { busted: false, rammed };
  }

  // Drop cruisers beyond `n` (screenshot scenes keep a staged formation).
  function trimCruisers(n) {
    while (cruisers.length > n) {
      const c = cruisers.pop();
      scene.remove(c.mesh);
    }
  }

  return {
    get stars() { return stars; },
    get heliActive() { return !!heli; },
    get heliPos() { return heli ? { x: heli.x, y: heli.y, z: heli.z } : null; },
    cruisers,
    officers,
    roadblocks,
    setStars,
    addStars,
    spawnCruiser,
    trimCruisers,
    nearestCruiserDistance,
    hitOfficer,
    setRoadblocksEnabled(v) { roadblocksEnabled = v; if (!v) clearRoadblocks(); },
    // Put the helicopter at an exact spot (screenshot staging) and aim
    // its searchlight cone at (px, pz) on the ground.
    stageHeli(x, y, z, px, pz) {
      if (!heli) return;
      heli.x = x;
      heli.y = y;
      heli.z = z;
      heli.mesh.position.set(x, y, z);
      const dx = x - px;
      const dz = z - pz;
      const len = Math.hypot(dx, y, dz) || 1;
      heli.cone.position.set((x + px) / 2, y / 2, (z + pz) / 2);
      heli.cone.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(dx / len, y / len, dz / len),
      );
      heli.cone.scale.set(1, len / 34, 1);
      heli.spot.position.set(x, y - 0.8, z);
      heli.spot.target.position.set(px, 0, pz);
      heli.spot.intensity = 220;
    },
    update,
  };
}
