// The story: six missions with briefings, stage-by-stage objectives,
// markers, timers, failure and retry. Each stage has its own marker on
// the minimap; completing a stage advances to the next, completing the
// last stage pays the reward, unlocks the next mission and auto-saves.
// Failure (timer runs out, the getaway car is too wrecked) ends the
// mission and leaves the player in free roam — retry from the checkpoint
// restarts the mission from its first stage and keeps earned cash.
// The world effects a stage needs (mission cars, enemy spawns, wanted
// level) come through the `world` callbacks main.js provides, so this
// module stays pure mission logic.
export const MISSIONS = [
  {
    name: 'Homecoming',
    briefing: "Jace is out. Tess needs her sedan back at the garage — drive it across town, learn the streets, and don't scratch the paint.",
    objectives: ["Pick up Tess's sedan", "Drive to Tess's garage"],
    reward: 200,
    marker: { x: 0, z: 30 },
    stages: [
      { type: 'enterCar', text: "Pick up Tess's sedan", marker: { x: 0, z: 30 }, radius: 5, car: { type: 'sedan', x: 0, z: 30, heading: 0, colour: 0xe08a2e } },
      { type: 'deliver', text: "Drive to Tess's garage", marker: { x: 150, z: 180 }, radius: 10, missionCar: true },
    ],
  },
  {
    name: 'The Pickup',
    briefing: 'A package is waiting downtown by the bank. Grab it, then lose the one-star tail before the drop.',
    objectives: ['Collect the package downtown', 'Escape the pursuit to the drop point'],
    reward: 350,
    marker: { x: 90, z: -60 },
    stages: [
      { type: 'reach', text: 'Collect the package downtown', marker: { x: 90, z: -60 }, radius: 8 },
      { type: 'escape', text: 'Escape the pursuit to the drop point', marker: { x: 150, z: 180 }, radius: 10, stars: 1, tailClear: true },
    ],
  },
  {
    name: 'Hot Wheels',
    briefing: 'A sports car is parked at the marina, owner nowhere in sight. Steal it, deliver it to the chop shop, keep it in one piece.',
    objectives: ['Steal the sports car at the marina', 'Deliver it to the chop shop'],
    reward: 500,
    marker: { x: -180, z: 357 },
    stages: [
      { type: 'enterCar', text: 'Steal the sports car at the marina', marker: { x: -180, z: 357 }, radius: 5, car: { type: 'sports', x: -180, z: 357, heading: 0, colour: 0xc22730 } },
      { type: 'deliver', text: 'Deliver it to the chop shop', marker: { x: 330, z: 180 }, radius: 10, missionCar: true, maxDamage: 120 },
    ],
  },
  {
    name: 'Street Sweep',
    briefing: "Vane's crew is holding the plaza. Clear them out on foot and hold it until Tess's crew arrives.",
    objectives: ['Clear the rival crew from the plaza', 'Hold the plaza'],
    reward: 600,
    marker: { x: -30, z: -30 },
    stages: [
      {
        type: 'clear', text: 'Clear the rival crew from the plaza', marker: { x: -30, z: -30 }, radius: 26,
        enemies: [[-42, -40], [-18, -42], [-44, -22], [-16, -20], [-30, -48], [-48, -32]],
      },
      {
        type: 'hold', text: "Hold the plaza until Tess's crew arrives", marker: { x: -30, z: -30 }, radius: 26, timer: 20,
        enemies: [[-52, -30], [-8, -30], [-30, -52]],
      },
    ],
  },
  {
    name: 'Bank on It',
    briefing: 'The big job: hit Solmar National Bank, grab the cash before the timer runs out, then a three-star getaway to the safehouse.',
    objectives: ['Reach the bank', 'Grab the cash (timed)', 'Escape to the safehouse'],
    reward: 1500,
    marker: { x: 90, z: -60 },
    stages: [
      { type: 'reach', text: 'Reach the bank', marker: { x: 90, z: -60 }, radius: 8 },
      { type: 'grab', text: 'Grab the cash — on foot, before the timer runs out', marker: { x: 120, z: -90 }, radius: 6, timer: 30, onFoot: true },
      { type: 'escape', text: 'Escape to the safehouse', marker: { x: 150, z: 180 }, radius: 12, stars: 3 },
    ],
  },
  {
    name: 'King of the Bay',
    briefing: "The finale: drive to the port, shoot through Vane's guards, and escape by car as the police close in. End this.",
    objectives: ['Drive to the port', "Fight through Vane's guards", 'Escape by car'],
    reward: 3000,
    marker: { x: 240, z: 360 },
    stages: [
      { type: 'reach', text: 'Drive to the port', marker: { x: 240, z: 360 }, radius: 12 },
      {
        type: 'clear', text: "Fight through Vane's guards", marker: { x: 240, z: 352 }, radius: 30,
        enemies: [[222, 352], [258, 352], [240, 340], [228, 360], [252, 360], [216, 344], [264, 344], [240, 352]],
      },
      { type: 'escape', text: 'Escape by car', marker: { x: 150, z: 180 }, radius: 12, stars: 4, requireCar: true },
    ],
  },
];

export function createMissions(world = {}) {
  let unlocked = 0; // highest unlocked mission index
  let current = -1; // -1 = free roam
  let stage = 0;
  let lastAttempted = -1;
  let override = null; // screenshot scenes set the banner text directly
  let timerLeft = null;
  let missionCar = null;
  let missionsDone = 0;
  let cashEarned = 0;
  let gameComplete = false;
  let lastToastKey = '';
  let lastToastT = -100;

  function toastThrottled(key, text, time) {
    if (!world.toast) return;
    if (key === lastToastKey && time - lastToastT < 5) return;
    lastToastKey = key;
    lastToastT = time;
    world.toast(text);
  }

  function objectiveText() {
    if (override) return override;
    if (current < 0) return 'Free roam — explore Solmar Bay';
    const m = MISSIONS[current];
    return `${m.name}: ${m.stages[Math.min(stage, m.stages.length - 1)].text}`;
  }

  // The minimap marker follows the current stage, not the mission start.
  function marker() {
    if (current < 0) return null;
    return MISSIONS[current].stages[Math.min(stage, MISSIONS[current].stages.length - 1)].marker;
  }

  function teardown() {
    if (missionCar && world.removeMissionCar) world.removeMissionCar(missionCar);
    missionCar = null;
    if (world.clearMissionEnemies) world.clearMissionEnemies();
    timerLeft = null;
  }

  function setupStage() {
    const s = MISSIONS[current].stages[stage];
    timerLeft = typeof s.timer === 'number' ? s.timer : null;
    if (s.car && world.spawnMissionCar) {
      missionCar = world.spawnMissionCar(s.car.type, s.car.x, s.car.z, s.car.heading, s.car.colour);
    }
    if (s.enemies && world.spawnMissionEnemies) world.spawnMissionEnemies(s.enemies);
    if (typeof s.stars === 'number' && world.setStars) world.setStars(s.stars);
  }

  function start(index) {
    if (index < 0 || index > unlocked || index >= MISSIONS.length) return false;
    teardown();
    current = index;
    stage = 0;
    lastAttempted = index;
    gameComplete = false;
    setupStage();
    return true;
  }

  function advance() {
    stage += 1;
    if (stage >= MISSIONS[current].stages.length) {
      const doneIndex = current;
      const reward = MISSIONS[doneIndex].reward;
      teardown();
      unlocked = Math.min(MISSIONS.length - 1, doneIndex + 1);
      missionsDone += 1;
      cashEarned += reward;
      current = -1;
      stage = 0;
      if (doneIndex === MISSIONS.length - 1) gameComplete = true;
      return { kind: 'complete', reward, index: doneIndex };
    }
    setupStage();
    return { kind: 'stage', index: current, stage };
  }

  function fail(reason) {
    const failedIndex = current;
    teardown();
    current = -1;
    stage = 0;
    return { kind: 'failed', reason, index: failedIndex };
  }

  function quitToFreeRoam() {
    teardown();
    current = -1;
    stage = 0;
    override = null;
  }

  // One fixed step of mission logic. ctx: { x, z, inCar, car, carDamage, time }.
  // Returns the events that happened this step (usually none).
  function update(dt, ctx) {
    if (current < 0) return [];
    const events = [];
    const m = MISSIONS[current];
    const s = m.stages[stage];
    const dist = Math.hypot(ctx.x - s.marker.x, ctx.z - s.marker.z);

    if (s.type === 'grab' && timerLeft !== null) {
      timerLeft -= dt;
      if (timerLeft <= 0) {
        timerLeft = 0;
        events.push(fail('Out of time — the bank job fell apart.'));
        return events;
      }
    }
    if (s.type === 'hold' && timerLeft !== null) {
      if (dist <= s.radius) {
        timerLeft -= dt;
        if (timerLeft <= 0) {
          timerLeft = 0;
          events.push(advance());
          return events;
        }
      } else {
        toastThrottled('hold', "Get back to the plaza — hold the ground!", ctx.time);
      }
      return events;
    }

    let done = false;
    if (s.type === 'reach') {
      done = dist <= s.radius && (!s.onFoot || !ctx.inCar) && (!s.requireCar || ctx.inCar);
    } else if (s.type === 'enterCar') {
      done = ctx.inCar && ctx.car === missionCar;
    } else if (s.type === 'deliver') {
      if (ctx.inCar && ctx.car === missionCar && dist <= s.radius) {
        if (typeof s.maxDamage === 'number' && (ctx.carDamage || 0) > s.maxDamage) {
          events.push(fail('Too wrecked — the chop shop turned the car away.'));
          return events;
        }
        done = true;
      }
    } else if (s.type === 'clear') {
      done = world.missionEnemiesAlive ? world.missionEnemiesAlive() === 0 : false;
    } else if (s.type === 'escape') {
      if (dist <= s.radius && (!s.requireCar || ctx.inCar)) {
        if (s.tailClear && world.nearestCruiser && world.nearestCruiser() <= 20) {
          toastThrottled('tail', 'Lose the tail first — shake the cruisers!', ctx.time);
        } else done = true;
      }
    } else if (s.type === 'grab') {
      done = dist <= s.radius && !ctx.inCar;
    }

    if (done) {
      const ev = advance();
      events.push(ev);
      if (ev.kind === 'stage' && world.toast) {
        world.toast(`Objective complete — ${m.stages[stage].text}`);
      }
    }
    return events;
  }

  return {
    get unlocked() { return unlocked; },
    get current() { return current; },
    get stage() { return stage; },
    get lastAttempted() { return lastAttempted; },
    get missionsDone() { return missionsDone; },
    get cashEarned() { return cashEarned; },
    get gameComplete() { return gameComplete; },
    get missionCar() { return missionCar; },
    objectiveText,
    marker,
    start,
    advance,
    fail,
    update,
    quitToFreeRoam,
    timerLeft() { return timerLeft; },
    setObjectiveOverride(text) { override = text; },
    setUnlocked(n) { unlocked = Math.max(0, Math.min(MISSIONS.length - 1, n)); },
    setStats(done, earned) { missionsDone = done; cashEarned = earned; },
  };
}
