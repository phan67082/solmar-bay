// Side jobs beyond the taxi: package-delivery runs and street races.
// Deliveries: a glowing parcel waits at a roadside point near the
// player; pick it up (on foot or by car) and carry it to the marked
// destination before the timer runs out — cash plus a speed tip, and
// REP for every completed run. Street races: three fixed start gates
// (Beachfront, Marina, Downtown); drive into a gate in a car to start
// the clock, hit every checkpoint in order, and get paid by your time.
// Both feed the progression stats the map screen shows.
import * as THREE from 'three';
import { roadLines } from './config.js';

const RACES = [
  {
    name: 'Beachfront Dash', start: { x: -357, z: 120 },
    points: [{ x: -357, z: -60 }, { x: -357, z: -240 }, { x: -357, z: -330 }],
  },
  {
    name: 'Marina Mile', start: { x: 60, z: 357 },
    points: [{ x: 180, z: 357 }, { x: 300, z: 357 }, { x: 350, z: 357 }],
  },
  {
    name: 'Downtown Sprint', start: { x: 0, z: -180 },
    points: [{ x: 120, z: -180 }, { x: 240, z: -180 }, { x: 330, z: -180 }],
  },
];

// A roadside point roughly `minD`–`maxD` metres from (cx, cz).
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

function makeCrateMesh(colour) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), new THREE.MeshLambertMaterial({ color: colour }));
  box.position.y = 0.35;
  box.castShadow = true;
  g.add(box);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff9d2e }));
  beacon.position.y = 1.4;
  g.add(beacon);
  g.userData.beacon = beacon;
  return g;
}

function makeGateMesh() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4.4, 5.2, 20),
    new THREE.MeshBasicMaterial({ color: 0xe5534b, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  g.add(ring);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2f3338 });
  for (const s of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.25, 5, 0.25), poleMat);
    pole.position.set(s * 4.8, 2.5, 0);
    g.add(pole);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(9.8, 1.0, 0.15), new THREE.MeshBasicMaterial({ color: 0xe5534b }));
  banner.position.y = 4.8;
  g.add(banner);
  return g;
}

export function createSideJobs(scene) {
  // Delivery parcel + its beacon.
  const parcel = makeCrateMesh(0xd97b2e);
  parcel.visible = false;
  scene.add(parcel);
  const destBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0x39d353 }));
  destBeacon.visible = false;
  scene.add(destBeacon);

  // Race start gates (always visible) + one moving checkpoint beacon.
  for (const r of RACES) {
    const gate = makeGateMesh();
    gate.position.set(r.start.x, 0, r.start.z);
    scene.add(gate);
  }
  const checkpoint = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd21f }));
  checkpoint.visible = false;
  scene.add(checkpoint);

  let deliveryState = 'idle'; // idle | pickup | carrying
  let deliveryCooldown = 4;
  let deliveryT = 0;
  let deliveryT0 = 1;
  let deliveryDest = null;
  let deliveryPay = 0;
  let deliveryBob = 0;
  let deliveriesDone = 0;
  let deliveryEarned = 0;

  let raceIndex = -1;
  let racePoint = 0;
  let raceT = 0;
  let raceCooldown = 0;
  let racesWon = 0;
  let racesDone = 0;
  const bestTimes = [null, null, null];

  function spawnDelivery(px, pz) {
    const spot = roadsidePoint(px, pz, 30, 80);
    parcel.position.set(spot.x, 0, spot.z);
    parcel.visible = true;
    deliveryState = 'pickup';
    deliveryT = 40;
  }

  function update(dt, player) {
    const events = [];
    deliveryBob += dt * 4;
    if (parcel.visible) parcel.userData.beacon.position.y = 1.4 + Math.sin(deliveryBob) * 0.15;
    if (destBeacon.visible) destBeacon.position.y = 1.2 + Math.sin(deliveryBob) * 0.2;
    if (raceCooldown > 0) raceCooldown -= dt;
    if (deliveryCooldown > 0) deliveryCooldown -= dt;

    // --- deliveries ------------------------------------------------------
    if (deliveryState === 'idle') {
      if (deliveryCooldown <= 0) spawnDelivery(player.x, player.z);
    } else if (deliveryState === 'pickup') {
      deliveryT -= dt;
      const d = Math.hypot(player.x - parcel.position.x, player.z - parcel.position.z);
      if (d < 3.5) {
        deliveryDest = roadsidePoint(player.x, player.z, 150, 350);
        const dist = Math.hypot(deliveryDest.x - player.x, deliveryDest.z - player.z);
        deliveryPay = 60 + Math.round(dist * 0.15);
        deliveryT0 = dist / 9 + 25;
        deliveryT = deliveryT0;
        destBeacon.position.set(deliveryDest.x, 1.2, deliveryDest.z);
        destBeacon.visible = true;
        parcel.visible = false;
        deliveryState = 'carrying';
        events.push({ kind: 'delivery-picked', pay: deliveryPay });
      } else if (deliveryT <= 0) {
        parcel.visible = false;
        deliveryState = 'idle';
        deliveryCooldown = 10;
        events.push({ kind: 'delivery-expired' });
      }
    } else if (deliveryState === 'carrying') {
      deliveryT -= dt;
      const d = Math.hypot(player.x - deliveryDest.x, player.z - deliveryDest.z);
      if (d < 8) {
        const tip = Math.round(20 * Math.max(0, deliveryT / deliveryT0));
        const total = deliveryPay + tip;
        deliveriesDone += 1;
        deliveryEarned += total;
        destBeacon.visible = false;
        deliveryState = 'idle';
        deliveryCooldown = 8;
        events.push({ kind: 'delivery-done', pay: deliveryPay, tip, total });
      } else if (deliveryT <= 0) {
        destBeacon.visible = false;
        deliveryState = 'idle';
        deliveryCooldown = 10;
        events.push({ kind: 'delivery-expired' });
      }
    }

    // --- street races -----------------------------------------------------
    if (raceIndex < 0) {
      if (player.inCar && player.car && raceCooldown <= 0) {
        for (let i = 0; i < RACES.length; i += 1) {
          const r = RACES[i];
          if (Math.hypot(player.x - r.start.x, player.z - r.start.z) < 7) {
            raceIndex = i;
            racePoint = 0;
            raceT = 0;
            checkpoint.position.set(r.points[0].x, 1.2, r.points[0].z);
            checkpoint.visible = true;
            events.push({ kind: 'race-started', name: r.name });
            break;
          }
        }
      }
    } else {
      raceT += dt;
      const r = RACES[raceIndex];
      const p = r.points[racePoint];
      checkpoint.position.set(p.x, 1.2 + Math.sin(deliveryBob) * 0.2, p.z);
      const d = Math.hypot(player.x - p.x, player.z - p.z);
      if (d < 10) {
        racePoint += 1;
        if (racePoint >= r.points.length) {
          const pay = raceT < 40 ? 400 : raceT < 55 ? 300 : 200;
          racesWon += 1;
          racesDone += 1;
          if (bestTimes[raceIndex] === null || raceT < bestTimes[raceIndex]) bestTimes[raceIndex] = raceT;
          checkpoint.visible = false;
          raceCooldown = 10;
          events.push({ kind: 'race-done', name: r.name, time: raceT, pay });
          raceIndex = -1;
        } else {
          const next = r.points[racePoint];
          checkpoint.position.set(next.x, 1.2, next.z);
          events.push({ kind: 'race-checkpoint', point: racePoint, total: r.points.length });
        }
      }
      if (raceIndex >= 0 && (!player.inCar || !player.car)) {
        // Out of the car mid-race: the race is over.
        checkpoint.visible = false;
        raceIndex = -1;
        raceCooldown = 5;
        events.push({ kind: 'race-quit' });
      }
    }
    return events;
  }

  // The current side-job marker for the minimap / map screen.
  function marker() {
    if (deliveryState === 'pickup') return { x: parcel.position.x, z: parcel.position.z, kind: 'delivery' };
    if (deliveryState === 'carrying' && deliveryDest) return { x: deliveryDest.x, z: deliveryDest.z, kind: 'dest' };
    if (raceIndex >= 0) {
      const p = RACES[raceIndex].points[racePoint];
      return { x: p.x, z: p.z, kind: 'race' };
    }
    return null;
  }

  function info() {
    if (deliveryState === 'pickup') return { text: 'Package waiting — pick it up', timer: Math.ceil(deliveryT) };
    if (deliveryState === 'carrying') return { text: `Deliver the package — $${deliveryPay}`, timer: Math.ceil(deliveryT) };
    if (raceIndex >= 0) return { text: `${RACES[raceIndex].name} — checkpoint ${racePoint + 1}/${RACES[raceIndex].points.length}`, timer: Math.ceil(raceT) };
    return null;
  }

  return {
    update,
    marker,
    info,
    get deliveryState() { return deliveryState; },
    get deliveriesDone() { return deliveriesDone; },
    get deliveryEarned() { return deliveryEarned; },
    get racesWon() { return racesWon; },
    get racesDone() { return racesDone; },
    get bestTimes() { return [...bestTimes]; },
    get raceNames() { return RACES.map((r) => r.name); },
  };
}
