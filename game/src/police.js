// Wanted level and police pursuit. 0–5 stars: at one star a patrol car
// follows; more stars mean more cruisers, faster and more aggressive.
// Wanted rises for stealing a car in view, hitting pedestrians, shooting
// and killing officers; it fades when the player breaks line of sight and
// stays hidden. Caught slow and boxed in, or at zero health, the game
// ends busted or wasted (the screens live in main.js).
import { CAR_TYPES } from './config.js';
import { makeCarMesh, driveCar, pursueSteer } from './vehicles.js';

export function createPolice(scene) {
  let stars = 0;
  let hiddenT = 0;
  let boxedT = 0;
  const cruisers = [];

  function setStars(n) {
    stars = Math.max(0, Math.min(5, n));
    hiddenT = 0;
    boxedT = 0;
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

  // Drive the cruisers after the player with pure pursuit at a capped
  // speed. Returns 'busted' when the player is boxed in slow, else null.
  function update(dt, player, collide) {
    const want = stars === 0 ? 0 : Math.min(stars + 1, 4);
    while (cruisers.length < want) {
      const a = Math.random() * Math.PI * 2;
      spawnCruiser(player.x + Math.cos(a) * 70, player.z + Math.sin(a) * 70);
    }
    while (cruisers.length > want) {
      const c = cruisers.pop();
      scene.remove(c.mesh);
    }
    let nearest = Infinity;
    for (const c of cruisers) {
      const d = Math.hypot(c.x - player.x, c.z - player.z);
      nearest = Math.min(nearest, d);
      const cruise = Math.min(30, 16 + stars * 3);
      const { throttle, steer } = pursueSteer(c, player.x, player.z, cruise);
      driveCar(c, throttle, steer, false, dt, collide);
    }
    // Wanted fades when no cruiser is near the player for a while.
    if (stars > 0) {
      if (nearest > 45) {
        hiddenT += dt;
        if (hiddenT > 15) { stars -= 1; hiddenT = 0; }
      } else hiddenT = 0;
    }
    // Busted: boxed in by cruisers while slow.
    const playerSpeed = player.inCar ? Math.abs(player.car ? player.car.speed : 0) : 0;
    if (stars > 0 && nearest < 4 && playerSpeed < 2) {
      boxedT += dt;
      if (boxedT > 3) return 'busted';
    } else boxedT = 0;
    return null;
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
    cruisers,
    setStars,
    addStars,
    spawnCruiser,
    trimCruisers,
    nearestCruiserDistance,
    update,
  };
}
