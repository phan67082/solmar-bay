// The four screenshot scenes. Each one plays the real rules forward from
// a fresh world for a fixed number of steps, steered by a simple autopilot
// (pure pursuit toward a waypoint at a capped cruise speed — stable, no
// spins, no building hits), so the frame is what real play looks like and
// the same seed always gives the same frame. The cover is the police
// chase: the camera sits on the beach side looking back at the player's
// car so both cruisers are in frame.
import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

// Drive the player's car toward (tx, tz) for `seconds` of simulation.
function autopilotDrive(game, tx, tz, cruise, seconds) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const car = game.player.car;
    if (!car) break;
    const input = game.pursueInput(car, tx, tz, cruise);
    game.stepSim(STEP, input);
  }
}

export function stageShot(name, game) {
  game.resetWorld();
  if (name === 'title') {
    for (let i = 0; i < 300; i += 1) game.stepSim(STEP, null, true);
    game.setScreen(SCREEN_TITLE);
    game.stageCamera({ x: -280, y: 80, z: -120 }, { x: 80, y: 10, z: 80 });
    return;
  }
  if (name === 'combat') {
    // A shootout in the plaza: Jace on foot, four rivals around the fountain.
    game.setScreen(SCREEN_PLAY);
    game.placePlayerOnFoot(-30, -12, Math.PI);
    game.combat.switchWeapon('pistol');
    game.combat.spawnEnemy(-42, -40);
    game.combat.spawnEnemy(-18, -42);
    game.combat.spawnEnemy(-44, -22);
    game.combat.spawnEnemy(-16, -20);
    game.missions.setObjectiveOverride('Street Sweep: Clear the rival crew from the plaza');
    game.police.setStars(0);
    // Let the rivals open fire, then freeze one muzzle flash in frame.
    for (let i = 0; i < 150; i += 1) game.stepSim(STEP, null, true);
    const shooter = game.combat.enemies[0];
    if (shooter && !shooter.dead) {
      shooter.flashT = 0.2;
      const flash = game.combat.muzzleFlash;
      flash.position.set(shooter.x, 1.3, shooter.z + 1);
      flash.material.opacity = 0.95;
      flash.lookAt(game.player.x, 1.3, game.player.z);
    }
    game.stageCamera({ x: -24, y: 3.5, z: -6 }, { x: -33, y: 1.5, z: -32 });
    return;
  }
  if (name === 'boulevard') {
    // Golden-hour drive down the beachfront boulevard, sea on the left.
    game.setScreen(SCREEN_PLAY);
    game.placePlayerInCar('sedan', -363, -120, 0);
    game.police.setStars(0);
    autopilotDrive(game, -363, 140, 12, 9);
    const p = game.player;
    // Camera over the road itself, trailing the car and looking down the
    // boulevard: the car is large in frame, the beach, sea and palms fill
    // the background, and the streetlights stay out of the lens. (The old
    // camera sat 18 m east of the car, inside the building row, with a
    // streetlight pole dead in the sightline.)
    game.stageCamera(
      { x: p.x + 3, y: 7, z: p.z - 12 },
      { x: p.x - 3, y: 1.5, z: p.z + 24 },
    );
    return;
  }
  // Default: the cover — a police chase on the boulevard.
  game.setScreen(SCREEN_PLAY);
  game.placePlayerInCar('sports', -357, 60, Math.PI);
  game.police.setStars(3);
  // Roadblocks stay off in the staged chase: they would sit on the road
  // ahead and block the autopilot's line.
  game.police.setRoadblocksEnabled(false);
  // Two cruisers right behind the player before the drive starts.
  game.police.spawnCruiser(-357, 74);
  game.police.spawnCruiser(-354, 88);
  game.missions.setObjectiveOverride('Bank on It: Escape to the safehouse');
  autopilotDrive(game, -357, -280, 14, 3);
  // Stage the pursuit formation for the frame: the two cruisers sit right
  // behind the player's car, matching its heading and speed, and any extra
  // cruisers the wanted level spawned are trimmed away.
  const p = game.player;
  const car = p.car;
  game.police.trimCruisers(2);
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const rx = -fz;
  const rz = fx;
  game.police.cruisers.forEach((c, i) => {
    const back = i === 0 ? 9 : 16;
    const side = i === 0 ? 1.5 : -1.5;
    c.x = car.x - fx * back + rx * side;
    c.z = car.z - fz * back + rz * side;
    c.heading = car.heading;
    c.speed = car.speed;
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.heading;
  });
  // Camera high behind the player car, looking north down the boulevard:
  // the player's car is centred, both cruisers are visible in line behind
  // it, palms on the beach side and the skyline ahead. The camera sits
  // over the road itself, clear of the building row across the street.
  game.stageCamera(
    { x: p.x + 2, y: 6, z: p.z + 28 },
    { x: p.x, y: 1.8, z: p.z - 20 },
  );
}
