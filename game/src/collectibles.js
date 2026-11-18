// Side activities: twenty hidden glowing cash bundles across the city
// (rooftops, alleys, the beach) and one stunt ramp over the marina gap.
// Collecting them all pays a bonus; the count shows on the HUD.
import * as THREE from 'three';
import { CASH_DROP_COUNT } from './config.js';
import { pick, range } from './random.js';

export function createCollectibles(rng, scene, city) {
  const drops = [];
  const geo = new THREE.BoxGeometry(0.7, 0.35, 0.5);
  const mat = new THREE.MeshBasicMaterial({ color: 0x39d353 });
  const lines = [-360, -300, -240, -180, -120, -60, 0, 60, 120, 180, 240, 300, 360];
  for (let i = 0; i < CASH_DROP_COUNT; i += 1) {
    let x;
    let z;
    const roll = rng();
    if (roll < 0.2) { // the beach
      x = range(rng, -392, -372);
      z = range(rng, -340, 340);
    } else if (roll < 0.35) { // near the plaza
      x = city.plaza.x + range(rng, -24, 24);
      z = city.plaza.z + range(rng, -24, 24);
    } else { // a sidewalk somewhere
      const axis = rng() < 0.5 ? 'x' : 'z';
      const line = pick(rng, lines);
      const side = rng() < 0.5 ? 1 : -1;
      const along = range(rng, -340, 340);
      x = axis === 'x' ? along : line + side * 7.75;
      z = axis === 'x' ? line + side * 7.75 : along;
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.8, z);
    scene.add(mesh);
    drops.push({ x, z, mesh, taken: false, phase: rng() * Math.PI * 2 });
  }

  // Three stunt ramps: the marina gap, the boulevard, and the downtown
  // east road. Each clears once per world (a retry does not re-pay it),
  // and each pays its own bonus.
  const ramps = [city.ramp, city.ramp2, city.ramp3].filter(Boolean).map((r) => ({ ...r, done: false }));
  let stuntCooldown = 0;

  function update(dt, px, pz, inCar, speed) {
    let collected = 0;
    for (const d of drops) {
      if (d.taken) continue;
      d.phase += dt * 3;
      d.mesh.position.y = 0.8 + Math.sin(d.phase) * 0.25;
      d.mesh.rotation.y += dt * 2;
      if (Math.hypot(px - d.x, pz - d.z) < 2.2) {
        d.taken = true;
        d.mesh.visible = false;
        collected += 1;
      }
    }
    // Stunt jump: cross a ramp fast and the bonus is yours.
    if (stuntCooldown > 0) stuntCooldown -= dt;
    let stunt = false;
    if (inCar && stuntCooldown <= 0) {
      for (const r of ramps) {
        if (!r.done && Math.hypot(px - r.x, pz - r.z) < 7 && Math.abs(speed) > 18) {
          r.done = true;
          stuntCooldown = 10;
          stunt = true;
          break;
        }
      }
    }
    return { collected, stunt, total: drops.length, got: drops.filter((d) => d.taken).length };
  }

  function reset() {
    for (const d of drops) {
      d.taken = false;
      d.mesh.visible = true;
    }
    for (const r of ramps) r.done = false;
  }

  // Indices of the drops already taken, for the save file.
  function takenIndices() {
    const out = [];
    drops.forEach((d, i) => { if (d.taken) out.push(i); });
    return out;
  }

  // Re-apply a saved set of taken drops (same seed, same order).
  function restoreTaken(indices) {
    if (!Array.isArray(indices)) return;
    for (const i of indices) {
      const d = drops[i];
      if (d) {
        d.taken = true;
        d.mesh.visible = false;
      }
    }
  }

  return {
    drops,
    update,
    reset,
    takenIndices,
    restoreTaken,
    get collectedCount() { return drops.filter((d) => d.taken).length; },
    get stuntsDone() { return ramps.filter((r) => r.done).length; },
    get stuntsTotal() { return ramps.length; },
  };
}
