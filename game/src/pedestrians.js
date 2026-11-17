// Pedestrians: walkers on the sidewalks with varied colours and speeds who
// flee from gunfire and collisions. A few can be hailed as taxi fares
// (Builder 2 wires the fare flow; the walkers and the flee behaviour are
// here now).
import * as THREE from 'three';
import { PED_COUNT } from './config.js';
import { pick, range } from './random.js';

const SHIRT_COLOURS = [0xd94f3d, 0x4f7fd9, 0x7fae62, 0xf2c230, 0x9b59b6, 0xe8e4da, 0x2e3440, 0xe08a2e];
const SKIN_COLOURS = [0xe8b88a, 0xc98d64, 0x8a5a3b, 0xf0c8a0];

function makePedMesh(shirt, skin) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.32), new THREE.MeshLambertMaterial({ color: shirt }));
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.68;
  head.castShadow = true;
  g.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.3), new THREE.MeshLambertMaterial({ color: 0x2e3440 }));
  legs.position.y = 0.33;
  g.add(legs);
  return g;
}

export function createPedestrians(rng, scene) {
  const lines = [-360, -300, -240, -180, -120, -60, 0, 60, 120, 180, 240, 300, 360];
  const peds = [];
  for (let i = 0; i < PED_COUNT; i += 1) {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = pick(rng, lines);
    const side = rng() < 0.5 ? 1 : -1;
    const along = range(rng, -350, 350);
    const dir = rng() < 0.5 ? 1 : -1;
    const x = axis === 'x' ? along : line + side * 7.75;
    const z = axis === 'x' ? line + side * 7.75 : along;
    const mesh = makePedMesh(pick(rng, SHIRT_COLOURS), pick(rng, SKIN_COLOURS));
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    peds.push({
      x, z, axis, dir, side, line,
      speed: range(rng, 0.9, 1.6),
      walkSpeed: range(rng, 0.9, 1.6),
      heading: axis === 'x' ? (dir === 1 ? Math.PI / 2 : -Math.PI / 2) : (dir === 1 ? 0 : Math.PI),
      mesh, panic: 0, fleeX: 0, fleeZ: 0, bob: rng() * Math.PI * 2,
    });
  }

  function update(dt) {
    for (const p of peds) {
      if (p.panic > 0) {
        p.panic -= dt;
        const dx = p.x - p.fleeX;
        const dz = p.z - p.fleeZ;
        const d = Math.hypot(dx, dz) || 1;
        p.x += (dx / d) * 5.5 * dt;
        p.z += (dz / d) * 5.5 * dt;
        p.heading = Math.atan2(dx, dz);
      } else {
        const step = p.speed * dt;
        if (p.axis === 'x') p.x += p.dir * step;
        else p.z += p.dir * step;
        // Turn at a random intersection instead of walking off the map.
        const along = p.axis === 'x' ? p.x : p.z;
        const nearCross = Math.abs(((along + 360) % 60 + 60) % 60) < 1.5;
        if (nearCross && rng() < dt * 0.25) {
          const newAxis = p.axis === 'x' ? 'z' : 'x';
          const newDir = rng() < 0.5 ? 1 : -1;
          const line = Math.round((along + 360) / 60) * 60 - 360;
          p.axis = newAxis;
          p.dir = newDir;
          if (newAxis === 'x') { p.z = line + p.side * 7.75; p.x = Math.max(-355, Math.min(355, p.x)); }
          else { p.x = line + p.side * 7.75; p.z = Math.max(-355, Math.min(355, p.z)); }
          p.heading = newAxis === 'x' ? (newDir === 1 ? Math.PI / 2 : -Math.PI / 2) : (newDir === 1 ? 0 : Math.PI);
        }
        if (p.x > 356) { p.x = 356; p.dir = -1; p.heading = -Math.PI / 2; }
        if (p.x < -356) { p.x = -356; p.dir = 1; p.heading = Math.PI / 2; }
        if (p.z > 356) { p.z = 356; p.dir = -1; p.heading = Math.PI; }
        if (p.z < -356) { p.z = -356; p.dir = 1; p.heading = 0; }
      }
      p.bob += dt * (p.panic > 0 ? 14 : 7);
      p.mesh.position.set(p.x, Math.abs(Math.sin(p.bob)) * 0.06, p.z);
      p.mesh.rotation.y = p.heading;
    }
  }

  // A gunshot or a collision at (x, z) sends nearby walkers running.
  function scare(x, z, radius = 14) {
    for (const p of peds) {
      if (Math.hypot(p.x - x, p.z - z) < radius) {
        p.panic = 3;
        p.fleeX = x;
        p.fleeZ = z;
      }
    }
  }

  return { peds, update, scare };
}
