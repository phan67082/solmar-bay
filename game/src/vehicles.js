// Cars: box-and-cylinder models with turning wheels, arcade driving
// physics, and traffic that follows the road grid, stops at red lights and
// keeps its distance. A stolen car leaves the traffic flow entirely —
// traffic never keeps self-driving the car the player is in.
import * as THREE from 'three';
import { CAR_TYPES, PARKED_COUNT, TRAFFIC_COUNT } from './config.js';
import { pick, range } from './random.js';

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
const hubMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a6 });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2836 });
const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });

// The city's one motorcycle: two thin wheels, a low tank and a tail
// cowl. The wheel pivots mirror the cars exactly (wheel + hub children)
// so the shared spin / steering code in driveCar works untouched.
function makeBikeMesh(colour) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: colour });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c1c20 });
  const chrome = new THREE.MeshLambertMaterial({ color: 0x9aa0a6 });
  // Frame spine + fuel tank + seat + tail cowl, nose to tail.
  const spine = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 0.22), dark);
  spine.position.y = 0.62;
  g.add(spine);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.3, 0.42), paint);
  tank.position.set(0.35, 0.82, 0);
  tank.castShadow = true;
  g.add(tank);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.34), dark);
  seat.position.set(-0.35, 0.78, 0);
  g.add(seat);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.3), paint);
  tail.position.set(-0.82, 0.86, 0);
  g.add(tail);
  // Handlebars + front fork.
  const bars = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.8), chrome);
  bars.position.set(0.82, 0.98, 0);
  g.add(bars);
  const fork = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), chrome);
  fork.position.set(0.92, 0.6, 0);
  fork.rotation.z = -0.35;
  g.add(fork);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.24), lightMat);
  lamp.position.set(1.02, 0.72, 0);
  g.add(lamp);
  // Wheels: front pair steers, both spin — same pivot shape as cars.
  const wheels = [];
  const front = [];
  for (const [wx, isFront] of [[0.95, true], [-0.85, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.33, 0);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.12, 12), wheelMat);
    tyre.rotation.x = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.14, 8), hubMat);
    hub.rotation.x = Math.PI / 2;
    pivot.add(tyre, hub);
    g.add(pivot);
    wheels.push(pivot);
    if (isFront) front.push(pivot);
  }
  g.userData.wheels = wheels;
  g.userData.frontWheels = front;
  return g;
}

export function makeCarMesh(type, colour) {
  if (type === 'motorcycle') return makeBikeMesh(colour);
  const spec = CAR_TYPES[type];
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: colour });
  const L = spec.length;
  const W = spec.width;
  const H = spec.height;
  const body = new THREE.Mesh(new THREE.BoxGeometry(L, H * 0.55, W), bodyMat);
  body.position.y = H * 0.42;
  body.castShadow = true;
  g.add(body);
  const cabinH = H * 0.45;
  const cabinL = type === 'van' ? L * 0.85 : L * 0.5;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabinL, cabinH, W * 0.88), type === 'van' ? bodyMat : glassMat);
  cabin.position.set(type === 'pickup' ? -L * 0.22 : -L * 0.05, H * 0.7 + cabinH / 2, 0);
  cabin.castShadow = true;
  g.add(cabin);
  if (type === 'pickup') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(L * 0.34, 0.35, W * 0.9), new THREE.MeshLambertMaterial({ color: 0x2f3338 }));
    bed.position.set(L * 0.3, H * 0.72, 0);
    g.add(bed);
  }
  if (type === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, W * 0.9), new THREE.MeshLambertMaterial({ color: 0x141414 }));
    spoiler.position.set(-L / 2 + 0.1, H + 0.15, 0);
    g.add(spoiler);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.5), new THREE.MeshBasicMaterial({ color: 0xffd21f }));
    sign.position.set(0, H + cabinH + 0.1, 0);
    g.add(sign);
  }
  if (type === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 1.1), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    bar.position.set(-L * 0.05, H + cabinH + 0.05, -0.3);
    g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 1.1), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar2.position.set(-L * 0.05, H + cabinH + 0.05, 0.3);
    g.add(bar2);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, 0.12, W + 0.02), new THREE.MeshBasicMaterial({ color: 0x1c2836 }));
    stripe.position.set(0, H * 0.55, 0);
    g.add(stripe);
  }
  // Headlights and taillights.
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.35), lightMat);
    hl.position.set(L / 2, H * 0.45, s * W * 0.32);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.35), new THREE.MeshBasicMaterial({ color: 0xcc2222 }));
    tl.position.set(-L / 2, H * 0.45, s * W * 0.32);
    g.add(tl);
  }
  // Wheels: front pair steers, all four spin.
  const wheels = [];
  const front = [];
  for (const [wx, wz, isFront] of [[L * 0.32, W / 2, true], [L * 0.32, -W / 2, true], [-L * 0.32, W / 2, false], [-L * 0.32, -W / 2, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.36, wz);
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8), hubMat);
    hub.rotation.x = Math.PI / 2;
    pivot.add(wheel, hub);
    g.add(pivot);
    wheels.push(pivot);
    if (isFront) front.push(pivot);
  }
  g.userData.wheels = wheels;
  g.userData.frontWheels = front;
  return g;
}

function newCar(type, x, z, heading, colour) {
  const spec = CAR_TYPES[type];
  const mesh = makeCarMesh(type, colour);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  return {
    type, x, z, heading, speed: 0, steer: 0,
    damage: 0, mesh, spec,
    headlights: false, hornT: 0,
    // Traffic state (unused for the player's car).
    ai: false, axis: 'x', dir: 1, lane: 0, cruise: 12, waitT: 0, parked: false,
    // Police pursuit state.
    pursuit: false, boxedT: 0,
    // Garage upgrades (engine / armour / nitro tiers, 0 = stock).
    upgrades: { engine: 0, armour: 0, nitro: 0 },
    nitroBoost: false,
  };
}

// Damage to a car, soaked by its armour upgrade: each armour tier
// shrugs off 15% of the hit. The player's car and police rams both
// go through here so armour matters everywhere.
export function applyCarDamage(car, amount) {
  const soak = 1 - 0.15 * ((car.upgrades && car.upgrades.armour) || 0);
  car.damage += amount * soak;
  return amount * soak;
}

// Arcade driving: accelerate, brake, reverse, steering that tightens with
// speed, handbrake slides. Garage upgrades change the car: each engine
// tier adds 12% top speed and 15% acceleration, nitro (while the boost
// flag is held) adds a burst of top speed and throttle, and each armour
// tier soaks 15% of collision damage. Returns the impact speed of any
// building hit.
export function driveCar(car, throttle, steerInput, handbrake, dt, collide) {
  const spec = car.spec;
  const up = car.upgrades || { engine: 0, armour: 0, nitro: 0 };
  const nitroOn = car.nitroBoost && up.nitro > 0;
  const isBike = car.type === 'motorcycle';
  const topSpeed = spec.topSpeed * (1 + 0.12 * up.engine) + (nitroOn ? 6 * up.nitro : 0);
  const accel = spec.accel * (1 + 0.15 * up.engine) * (nitroOn ? 1.6 : 1);
  const maxSteer = 0.55 / (1 + Math.abs(car.speed) * 0.045);
  // A bike flicks over quicker than a car at the same speed.
  const targetSteer = steerInput * maxSteer * (handbrake ? 1.5 : 1) * (isBike ? 1.25 : 1);
  car.steer += (targetSteer - car.steer) * Math.min(1, dt * 8);
  if (throttle > 0) car.speed += accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 0.5) car.speed -= spec.brake * dt;
    else car.speed += accel * 0.55 * dt; // reverse
  }
  if (handbrake) car.speed -= Math.sign(car.speed) * 12 * dt;
  car.speed -= car.speed * (handbrake ? 0.25 : 0.55) * dt; // drag / rolling resistance
  car.speed = Math.max(-9, Math.min(topSpeed, car.speed));
  if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;
  // A bike's short wheelbase would make it spin like a top at speed, so
  // it steers on a longer effective wheelbase — still nimbler than a car,
  // but a held turn no longer throws it off the road.
  const turnLength = isBike ? spec.length * 1.6 : spec.length;
  car.heading += (car.speed / turnLength) * Math.tan(car.steer) * dt * (handbrake ? 1.6 : 1);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  let impact = 0;
  if (collide) {
    const hit = collide(nx, nz, 1.5);
    if (hit) {
      impact = Math.abs(car.speed);
      car.speed *= -0.25;
      // No armour, no crumple zone: a bike takes 60% more crash damage.
      applyCarDamage(car, impact * 2.2 * (isBike ? 1.6 : 1));
    }
  }
  if (!impact) { car.x = nx; car.z = nz; }
  else { car.x += Math.sin(car.heading) * car.speed * dt; car.z += Math.cos(car.heading) * car.speed * dt; }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  // A bike leans into the turn; a car only rolls a little on the handbrake.
  car.mesh.rotation.z = isBike ? -car.steer * 0.5 : (handbrake && Math.abs(car.speed) > 6 ? -car.steer * 0.12 : 0);
  const spin = (car.speed * dt) / 0.36;
  for (const w of car.mesh.userData.wheels) {
    w.children[0].rotation.z += spin;
    w.children[1].rotation.z += spin;
  }
  for (const w of car.mesh.userData.frontWheels) w.rotation.y = car.steer * 0.9;
  if (car.hornT > 0) car.hornT -= dt;
  return impact;
}

// Pure-pursuit steering toward a target point, at a capped cruise speed.
// Used by the driving autopilot and by police pursuit: stable, no spins.
export function pursueSteer(car, tx, tz, cruise) {
  const dx = tx - car.x;
  const dz = tz - car.z;
  const targetHeading = Math.atan2(dx, dz);
  let diff = targetHeading - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  const throttle = car.speed < cruise ? 1 : 0;
  return { throttle, steer };
}

export { newCar };
export function createTraffic(rng, city, scene) {
  const lines = [-360, -300, -240, -180, -120, -60, 0, 60, 120, 180, 240, 300, 360];
  const cars = [];
  const parked = [];
  const types = ['hatchback', 'sedan', 'taxi', 'sports', 'pickup', 'van'];

  function placeOnRoad() {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = pick(rng, lines);
    const along = range(rng, -330, 330);
    const dir = rng() < 0.5 ? 1 : -1;
    return { axis, line, along, dir };
  }

  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    const type = pick(rng, types);
    const spec = CAR_TYPES[type];
    const p = placeOnRoad();
    const lane = p.axis === 'x' ? (p.dir === 1 ? 3 : -3) : (p.dir === 1 ? -3 : 3);
    const x = p.axis === 'x' ? p.along : p.line + lane;
    const z = p.axis === 'x' ? p.line + lane : p.along;
    const heading = p.axis === 'x' ? (p.dir === 1 ? Math.PI / 2 : -Math.PI / 2) : (p.dir === 1 ? 0 : Math.PI);
    const car = newCar(type, x, z, heading, pick(rng, spec.colours));
    car.ai = true;
    car.axis = p.axis;
    car.dir = p.dir;
    car.cruise = range(rng, 9, 13);
    car.speed = car.cruise;
    scene.add(car.mesh);
    cars.push(car);
  }

  for (let i = 0; i < PARKED_COUNT; i += 1) {
    // The first parked car is always a taxi (the taxi rank): fares need
    // a cab the player can actually find.
    const type = i === 0 ? 'taxi' : pick(rng, types);
    const spec = CAR_TYPES[type];
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = pick(rng, lines.slice(1, 12));
    const along = range(rng, -330, 330);
    const side = rng() < 0.5 ? 1 : -1;
    const x = axis === 'x' ? along : line + side * 4.6;
    const z = axis === 'x' ? line + side * 4.6 : along;
    const heading = axis === 'x' ? (side === 1 ? Math.PI / 2 : -Math.PI / 2) : (side === 1 ? 0 : Math.PI);
    const car = newCar(type, x, z, heading, pick(rng, spec.colours));
    car.parked = true;
    scene.add(car.mesh);
    parked.push(car);
  }

  // The city's one motorcycle, always parked in the same spot so the
  // player can find it: the kerb of the west road by the plaza
  // (road z = -60, kerb offset 4.6). It is parked, never traffic, and
  // the player steals it with E like any other parked vehicle.
  const bike = newCar('motorcycle', -25, -55.4, Math.PI / 2, 0x1a1a1a);
  bike.parked = true;
  scene.add(bike.mesh);
  parked.push(bike);

  function lightAt(x, z) {
    for (const l of city.lights) {
      if (Math.abs(l.x - x) < 1 && Math.abs(l.z - z) < 1) return l;
    }
    return null;
  }

  // Is the light red for travel along `axis` at the intersection (x, z)?
  function redFor(light, axis) {
    if (!light) return false;
    return axis === 'x' ? light.state === 'ns' : light.state === 'ew';
  }

  function update(dt, collide, playerCar) {
    for (const car of cars) {
      if (car === playerCar) continue; // a stolen car is no longer traffic
      // Car ahead on the same road?
      let blocked = false;
      const aheadX = car.x + Math.sin(car.heading) * 9;
      const aheadZ = car.z + Math.cos(car.heading) * 9;
      for (const other of cars) {
        if (other === car || other === playerCar) continue;
        if (Math.hypot(other.x - aheadX, other.z - aheadZ) < 4.5) { blocked = true; break; }
      }
      if (!blocked && playerCar) {
        if (Math.hypot(playerCar.x - aheadX, playerCar.z - aheadZ) < 4.5) blocked = true;
      }
      // Red light ahead at the next intersection?
      const nextLine = car.axis === 'x'
        ? Math.round((car.x + car.dir * 14 + 360) / 60) * 60 - 360
        : Math.round((car.z + car.dir * 14 + 360) / 60) * 60 - 360;
      const crossLine = car.axis === 'x' ? Math.round((car.z + 360) / 60) * 60 - 360 : Math.round((car.x + 360) / 60) * 60 - 360;
      const distToLine = car.axis === 'x' ? (nextLine - car.x) * car.dir : (nextLine - car.z) * car.dir;
      if (distToLine > 0 && distToLine < 16) {
        const light = lightAt(car.axis === 'x' ? nextLine : crossLine, car.axis === 'x' ? crossLine : nextLine);
        if (redFor(light, car.axis)) blocked = true;
      }
      const targetSpeed = blocked ? 0 : car.cruise;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 2.5);
      if (car.speed < 0.05 && blocked) car.speed = 0;
      // Maybe turn at an intersection.
      const along = car.axis === 'x' ? car.x : car.z;
      const nearCross = Math.abs(((along + 360) % 60 + 60) % 60) < 2 || Math.abs(((along + 360) % 60 + 60) % 60 - 60) < 2;
      if (nearCross && car.speed > 2 && rng() < dt * 0.12) {
        const newAxis = car.axis === 'x' ? 'z' : 'x';
        const newDir = rng() < 0.5 ? 1 : -1;
        const line = Math.round((along + 360) / 60) * 60 - 360;
        car.axis = newAxis;
        car.dir = newDir;
        car.heading = newAxis === 'x' ? (newDir === 1 ? Math.PI / 2 : -Math.PI / 2) : (newDir === 1 ? 0 : Math.PI);
        const lane = newAxis === 'x' ? (newDir === 1 ? 3 : -3) : (newDir === 1 ? -3 : 3);
        if (newAxis === 'x') { car.z = line + lane; car.x = Math.max(-355, Math.min(355, car.x)); }
        else { car.x = line + lane; car.z = Math.max(-355, Math.min(355, car.z)); }
      }
      const nx = car.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.z + Math.cos(car.heading) * car.speed * dt;
      if (!collide(nx, nz, 1.5)) { car.x = nx; car.z = nz; }
      else car.speed = 0;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      const spin = (car.speed * dt) / 0.36;
      for (const w of car.mesh.userData.wheels) {
        w.children[0].rotation.z += spin;
        w.children[1].rotation.z += spin;
      }
    }
  }

  return { cars, parked, bike, update };
}
