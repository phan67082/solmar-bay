// Taxi fares: drive a taxi and passengers hail you. A waving passenger
// appears at a roadside near the player; stop the taxi beside them and
// they get in. Drive them to the marked destination before the timer
// runs out for the fare plus a tip for speed. Walk away mid-ride, or
// let the timer run out, and the fare is lost.
import * as THREE from 'three';
import { roadLines } from './config.js';

function makeFareMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.32), new THREE.MeshLambertMaterial({ color: 0xf2c230 }));
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshLambertMaterial({ color: 0xe8b88a }));
  head.position.y = 1.68;
  g.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.3), new THREE.MeshLambertMaterial({ color: 0x2e3440 }));
  legs.position.y = 0.33;
  g.add(legs);
  // Raised arm, hailing the taxi.
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), new THREE.MeshLambertMaterial({ color: 0xf2c230 }));
  arm.position.set(0.35, 1.5, 0);
  arm.rotation.z = -0.5;
  g.add(arm);
  // Green beacon so the fare is easy to spot from the car.
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0x39d353 }));
  beacon.position.y = 2.4;
  g.add(beacon);
  g.userData.beacon = beacon;
  return g;
}

// A point on a sidewalk, roughly `minD`–`maxD` metres from (cx, cz).
function roadsidePoint(cx, cz, minD, maxD) {
  const lines = roadLines();
  for (let tries = 0; tries < 24; tries += 1) {
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    const line = lines[Math.floor(Math.random() * lines.length)];
    const side = Math.random() < 0.5 ? 1 : -1;
    const along = (axis === 'x' ? cx : cz) + (Math.random() < 0.5 ? -1 : 1) * (minD + Math.random() * (maxD - minD));
    const x = axis === 'x' ? Math.max(-350, Math.min(350, along)) : line + side * 7.75;
    const z = axis === 'x' ? line + side * 7.75 : Math.max(-350, Math.min(350, along));
    const d = Math.hypot(x - cx, z - cz);
    if (d >= minD * 0.7 && d <= maxD * 1.3) return { x, z };
  }
  return { x: cx + minD, z: cz };
}

export function createTaxi(scene) {
  const mesh = makeFareMesh();
  mesh.visible = false;
  scene.add(mesh);

  let state = 'idle'; // idle | waiting | riding
  let cooldownT = 0;
  let waitT = 0;
  let rideT = 0;
  let rideT0 = 1;
  let dest = null;
  let fare = 0;
  let faresDone = 0;
  let totalEarned = 0;
  let bob = 0;

  function spawnFare(px, pz) {
    const spot = roadsidePoint(px, pz, 40, 100);
    mesh.position.set(spot.x, 0, spot.z);
    mesh.visible = true;
    state = 'waiting';
    waitT = 25;
  }

  function update(dt, player) {
    const events = [];
    bob += dt * 4;
    if (mesh.visible) mesh.userData.beacon.position.y = 2.4 + Math.sin(bob) * 0.15;
    if (cooldownT > 0) cooldownT -= dt;

    const inTaxi = player.inCar && player.car && player.car.type === 'taxi';
    const speed = player.inCar && player.car ? Math.abs(player.car.speed) : 0;

    if (state === 'idle') {
      if (inTaxi && cooldownT <= 0) spawnFare(player.x, player.z);
      return events;
    }
    if (state === 'waiting') {
      waitT -= dt;
      const d = Math.hypot(player.x - mesh.position.x, player.z - mesh.position.z);
      if (inTaxi && speed < 2 && d < 6) {
        // Picked up: choose a destination and start the clock.
        dest = roadsidePoint(player.x, player.z, 150, 350);
        const dist = Math.hypot(dest.x - player.x, dest.z - player.z);
        fare = 20 + Math.round(dist * 0.12);
        rideT0 = dist / 9 + 25;
        rideT = rideT0;
        mesh.visible = false;
        state = 'riding';
        events.push({ kind: 'picked', fare });
      } else if (waitT <= 0) {
        mesh.visible = false;
        state = 'idle';
        cooldownT = 8;
        events.push({ kind: 'left' });
      }
      return events;
    }
    // riding
    if (!player.inCar) {
      mesh.position.set(player.x + 2, 0, player.z + 2);
      mesh.visible = true;
      state = 'waiting';
      waitT = 12;
      events.push({ kind: 'cancelled' });
      return events;
    }
    rideT -= dt;
    const d = Math.hypot(player.x - dest.x, player.z - dest.z);
    if (d < 8) {
      const tip = Math.round(15 * Math.max(0, rideT / rideT0));
      const total = fare + tip;
      faresDone += 1;
      totalEarned += total;
      mesh.position.set(dest.x, 0, dest.z);
      mesh.visible = false; // the passenger gets out and walks off
      state = 'idle';
      cooldownT = 6;
      events.push({ kind: 'delivered', fare, tip, total });
      return events;
    }
    if (rideT <= 0) {
      mesh.visible = false; // the fare gave up and walked off
      state = 'idle';
      cooldownT = 8;
      events.push({ kind: 'expired' });
    }
    return events;
  }

  function marker() {
    if (state === 'waiting') return { x: mesh.position.x, z: mesh.position.z, kind: 'fare' };
    if (state === 'riding' && dest) return { x: dest.x, z: dest.z, kind: 'dest' };
    return null;
  }

  function fareInfo() {
    if (state === 'waiting') return { text: 'Fare waiting — stop your taxi by the waving passenger', timer: Math.ceil(waitT) };
    if (state === 'riding') return { text: `Fare $${fare} — reach the green marker`, timer: Math.ceil(rideT) };
    return null;
  }

  return {
    get state() { return state; },
    get faresDone() { return faresDone; },
    get totalEarned() { return totalEarned; },
    update,
    marker,
    fareInfo,
    setStats(done, earned) { faresDone = done; totalEarned = earned; },
  };
}
