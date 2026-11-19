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
    // The title shot keeps the staged close-up from stageTitleScene
    // (Jace + the red sports car on the plaza, right of the panel) —
    // the old wide-vista camera override is dropped, it hid the pair
    // behind the panel. The mid-progress save is seeded by the shot
    // renderer (tools/shots-v2.mjs), so CONTINUE reads Mission 4/6 ·
    // $12,400 · 37%, not "NO SAVE YET".
    game.setSky(18.7);
    for (let i = 0; i < 300; i += 1) game.stepSim(STEP, null, true);
    game.setScreen(SCREEN_TITLE);
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
    // Mid-progress save state for the map read-outs: four story jobs
    // done (54% complete), so the save-slot line and the mission
    // states read as a played save, not a fresh 0%. Set after the
    // sim steps, so nothing in the drive can move it — the missions
    // counter is the authority (the map list reads it) and the
    // progression counter feeds the completion %.
    game.missions.setStats(4, 0);
    game.progression.stats.missionsDone = 4;
    game.openMap();
    return;
  }
  if (name === 'combat') {
    // A shootout in the plaza at dusk: Jace on foot with the rifle,
    // Vane's crew holding the fountain, neon signs lit behind them.
    // The mission itself supplies the six rivals, so the panel, the
    // objective and the dialogue bar all read as one real job. The crew
    // is re-formed into a firing line across the fountain — every rival
    // in frame, close enough to read — and a full volley is frozen
    // mid-flight (muzzle flashes, tracers, health bars) so the frame
    // reads as a shootout at a glance. The sky stays at golden dusk
    // (19.3) rather than full night, so the plaza floor stays lit and
    // the foreground cannot fall into black shadow.
    game.setSky(19.3);
    game.setScreen(SCREEN_PLAY);
    game.missions.setUnlocked(5);
    game.missions.start(3);
    game.placePlayerOnFoot(-28, -12.5, Math.PI);
    game.combat.pickupWeapon('rifle');
    game.combat.switchWeapon('rifle');
    game.police.setStars(0);
    // Let the rivals open fire for a couple of seconds so the fight
    // reads as live, then hold the frame.
    for (let i = 0; i < 150; i += 1) game.stepSim(STEP, null, true);
    // Re-form the live mission crew into a firing line due south of the
    // fountain: a straight east-west rank, so no rival hides behind
    // another from the camera (a diagonal rank put two of them on the
    // same sight-line). All six sit ~11 m from the fountain centre,
    // clear of its 7 m rim, 7.5 m from Jace and 13–19 m from the lens.
    const rank = [[-37, -20], [-32.5, -20], [-28, -20], [-23.5, -20], [-19, -20], [-14.5, -20]];
    const crew = game.combat.enemies.filter((e) => !e.dead && e.tag === 'mission');
    crew.forEach((e, i) => {
      const spot = rank[i % rank.length];
      game.combat.placeEnemy(e, spot[0], spot[1]);
    });
    // Freeze the volley: enemy muzzle flashes + tracers at Jace, Jace's
    // own rifle flash + tracer at the nearest rival, health bars up.
    game.combat.stageFx(game.player);
    // Over-the-shoulder from behind Jace's right side: Jace large in
    // the lower frame, the whole firing line across the plaza ahead,
    // the fountain and the downtown towers behind them, sky above —
    // the plaza floor fills the bottom instead of a black void.
    game.stageCamera({ x: -23, y: 3.2, z: -4 }, { x: -30.5, y: 1.3, z: -30 });
    // One visible damage number over the nearest rival (the same
    // showDamage live play uses, projected through the staged camera),
    // so the frame carries the top-5 "-NN HEAVY HIT" feedback. It gets
    // a 5-minute lifetime and a pinned style: the default 1150 ms float
    // would expire before the screenshot (slow SwiftShader boot), the
    // float animation would fade it out even if the node survived, and
    // a 30 s lifetime still lost to the font-load stall + screenshot
    // retry (proven firsthand: the node was present at staging and
    // gone ~31 s later when the retry landed).
    const foe = crew.find((e) => !e.dead);
    if (foe) {
      const p = game.project(foe.x, 1.3, foe.z);
      if (p) game.showDamage(p.x, p.y, 68, 'HEAVY HIT', 300000);
    }
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
