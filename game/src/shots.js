// The four screenshot scenes. Each one plays the real rules forward from
// a fresh world for a fixed number of steps, steered by a simple autopilot
// (pure pursuit toward a waypoint at a capped cruise speed — stable, no
// spins, no building hits), so the frame is what real play looks like and
// the same seed always gives the same frame.
// 1-chase: golden-hour police chase with the helicopter overhead.
// 2-plaza-fight: a dusk shootout in the plaza, rifle out, rivals firing.
// 3-map: the full-screen city map mid-mission, route line and stats.
// 4-title: the title poster over the city vista.
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
    game.setSky(18.7);
    for (let i = 0; i < 300; i += 1) game.stepSim(STEP, null, true);
    game.setScreen(SCREEN_TITLE);
    game.stageCamera({ x: -280, y: 80, z: -120 }, { x: 80, y: 10, z: 80 });
    return;
  }
  if (name === 'map') {
    // Mid-mission map: mission 5 running, two stars on the tail, the
    // player halfway to the bank, so the map shows a route line, police
    // blips, mission states and live stats.
    game.setSky(18.7);
    game.setScreen(SCREEN_PLAY);
    game.missions.setUnlocked(5);
    game.missions.start(4);
    game.placePlayerInCar('sedan', 30, 30, Math.PI / 2);
    game.police.setStars(2);
    game.police.spawnCruiser(48, 30);
    game.police.spawnCruiser(12, 48);
    for (let i = 0; i < 120; i += 1) game.stepSim(STEP, null, true);
    game.openMap();
    return;
  }
  if (name === 'combat') {
    // A shootout in the plaza at dusk: Jace on foot with the rifle,
    // Vane's crew holding the fountain, neon signs lit behind them.
    // The mission itself supplies the six rivals, so the panel, the
    // objective and the dialogue bar all read as one real job.
    game.setSky(20.3);
    game.setScreen(SCREEN_PLAY);
    game.missions.setUnlocked(5);
    game.missions.start(3);
    game.placePlayerOnFoot(-30, -12, Math.PI);
    game.combat.pickupWeapon('rifle');
    game.combat.switchWeapon('rifle');
    game.police.setStars(0);
    // Let the rivals open fire for a couple of seconds so the fight
    // reads as live, then hold the frame.
    for (let i = 0; i < 150; i += 1) game.stepSim(STEP, null, true);
    // Three-quarter view from behind the player's right shoulder: Jace
    // in the lower frame, the fountain and the crew across the plaza.
    game.stageCamera({ x: -22, y: 4.2, z: 0 }, { x: -33, y: 1.4, z: -30 });
    return;
  }
  if (name === 'boulevard') {
    // Golden-hour drive down the beachfront boulevard, sea on the left.
    game.setSky(18.7);
    game.setScreen(SCREEN_PLAY);
    game.placePlayerInCar('sedan', -363, -120, 0);
    game.police.setStars(0);
    autopilotDrive(game, -363, 140, 12, 9);
    const p = game.player;
    // Camera over the road itself, trailing the car and looking down the
    // boulevard: the car is large in frame, the beach, sea and palms fill
    // the background, and the streetlights stay out of the lens.
    game.stageCamera(
      { x: p.x + 3, y: 7, z: p.z - 12 },
      { x: p.x - 3, y: 1.5, z: p.z + 24 },
    );
    return;
  }
  // Default: the cover — a police chase on the boulevard at golden
  // hour, with the police helicopter circling overhead and its
  // searchlight cone tracking the player. Mission 5 is running, so the
  // panel, the objective and the dialogue all read as one real job.
  game.setSky(18.7);
  game.setScreen(SCREEN_PLAY);
  game.missions.setUnlocked(5);
  game.missions.start(4);
  game.placePlayerInCar('sports', -357, 60, Math.PI);
  game.police.setStars(3);
  // Roadblocks stay off in the staged chase: they would sit on the road
  // ahead and block the autopilot's line.
  game.police.setRoadblocksEnabled(false);
  // Two cruisers right behind the player before the drive starts.
  game.police.spawnCruiser(-357, 74);
  game.police.spawnCruiser(-354, 88);
  autopilotDrive(game, -357, -280, 14, 3);
  // Stage the pursuit formation for the frame: the two cruisers sit right
  // behind the player's car, matching its heading and speed, and any extra
  // cruisers the wanted level spawned are trimmed away. The helicopter
  // joined during the drive and keeps circling above.
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
  // Park the helicopter in frame: out over the sea to the west, low
  // against the sunset, its searchlight slanting down onto the car.
  game.police.stageHeli(p.x - 25, 18, p.z - 25, p.x, p.z);
  // Camera high behind the player car, looking north down the boulevard:
  // the player's car is centred, both cruisers are visible in line behind
  // it, palms on the beach side and the skyline ahead. The camera sits
  // over the road itself, clear of the building row across the street.
  game.stageCamera(
    { x: p.x + 2, y: 7, z: p.z + 30 },
    { x: p.x, y: 2, z: p.z - 24 },
  );
}
