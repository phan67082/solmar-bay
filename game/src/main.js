// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. Screens: title, play, paused, busted,
// wasted, complete.
//
// ?seed=N fixes the city. ?shot=cover|combat|boulevard|title (with
// &seed=N) stages that scene instead of running the loop, paints it and
// sets window.__shotReady for a screenshot.
//
// The debug handle window.__solmar exposes the live state the play-test
// tooling reads (player, traffic, pedestrians, collectibles, combat,
// police, screen, time, scene, renderer).
import * as THREE from 'three';
import { STEP, PLAYER, SAVE_KEY, WEAPONS } from './config.js';
import { createRandom } from './random.js';
import { createInput, ACTION_PAUSE, ACTION_ENTER, ACTION_JUMP, ACTION_PUNCH, ACTION_SHOOT, ACTION_HORN, ACTION_LIGHTS, ACTION_MUTE, ACTION_RELOAD, ACTION_WEAPON1, ACTION_WEAPON2, ACTION_WEAPON3, ACTION_WEAPON4, ACTION_WEAPON5, ACTION_RESTART, ACTION_MAP, ACTION_GARAGE } from './input.js';
import { createAudio } from './audio.js';
import { buildCity } from './city.js';
import { createTraffic, driveCar, pursueSteer, newCar, applyCarDamage } from './vehicles.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createHelicopter, HELIPAD } from './helicopter.js';
import { createSideJobs } from './sidejobs.js';
import { createCombat } from './combat.js';
import { createMissions, MISSIONS } from './missions.js';
import { createCollectibles } from './collectibles.js';
import { createTaxi } from './taxi.js';
import { createHud } from './hud.js';
import { createMap, districtAt } from './map.js';
import { createProgression, tierForRep } from './progression.js';
import { createGarage, GARAGE_POS } from './garage.js';
import { readSave, writeSave, hasSave } from './save.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_BUSTED, SCREEN_WASTED, SCREEN_COMPLETE } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const scene = renderer.scene;
const audio = createAudio();
const input = createInput(canvas);
const hud = createHud(document);

// Progression (REP, skills, lifetime stats) and the garage (owned cars
// + upgrades) live outside the world reset, like the cash drops: a
// retry or a mission restart must not wipe them.
const progression = createProgression(readSave());
const garageState = { owned: ['sedan'], upgrades: {} };
const garageHooks = {
  buyCar(type, price) {
    if (player.cash < price || garageState.owned.includes(type)) return false;
    player.cash -= price;
    garageState.owned.push(type);
    writeSave(collectSave());
    return true;
  },
  buyUpgrade(type, kind, price, needRep) {
    if (player.cash < price || progression.tier.level < needRep) return false;
    player.cash -= price;
    garageState.upgrades[type] = garageState.upgrades[type] || {};
    garageState.upgrades[type][kind] = (garageState.upgrades[type][kind] ?? 0) + 1;
    if (kind === 'respray' && police) police.setStars(0);
    // A purchase takes effect at once, even if the player is sitting in
    // that car right now — no re-enter needed to feel the new engine.
    if (player.car && player.car.type === type) {
      const up = garageState.upgrades[type];
      player.car.upgrades = { engine: up.engine ?? 0, armour: up.armour ?? 0, nitro: up.nitro ?? 0 };
    }
    writeSave(collectSave());
    return true;
  },
};
const garage = createGarage(document, () => ({
  cash: player.cash, progression, garage: garageState,
}), garageHooks);
const cityMap = createMap(document, () => ({
  player: { x: player.x, z: player.z, heading: player.heading },
  marker: missions.marker(),
  missionsDone: missions.missionsDone,
  currentMission: missions.current,
  unlocked: missions.unlocked,
  cash: player.cash,
  progression,
  completion: progression.completionPercent(missions.unlocked, MISSIONS.length),
  timePlayed: time,
  faresDone: taxi ? taxi.faresDone : 0,
  taxiEarned: taxi ? taxi.totalEarned : 0,
  deliveriesDone: progression.stats.deliveriesDone,
  deliveryEarned: progression.stats.deliveryEarned,
  racesWon: progression.stats.racesWon,
  stuntsDone: progression.stats.stuntsDone,
  dropsGot: collectibles ? collectibles.collectedCount : 0,
  drops: collectibles ? collectibles.drops : [],
  cruisers: police ? police.cruisers : [],
}));

// The title poster: canvas-drawn art (no external assets) — a golden
// hour sky, the sun over the sea, the downtown skyline, palms, and a
// sports-car silhouette under the logo.
function drawTitlePoster() {
  const poster = document.getElementById('poster');
  if (!poster) return;
  const c = poster.getContext('2d');
  const W = poster.width;
  const H = poster.height;
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#ff7e5f');
  sky.addColorStop(0.5, '#feb47b');
  sky.addColorStop(1, '#7b2d8e');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);
  // Sun disc + glow over the sea.
  const glow = c.createRadialGradient(W * 0.72, H * 0.42, 4, W * 0.72, H * 0.42, 90);
  glow.addColorStop(0, 'rgba(255,233,168,0.95)');
  glow.addColorStop(1, 'rgba(255,233,168,0)');
  c.fillStyle = glow;
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#ffe9a8';
  c.beginPath(); c.arc(W * 0.72, H * 0.42, 26, 0, Math.PI * 2); c.fill();
  // Sea band.
  c.fillStyle = '#2a6f8e';
  c.fillRect(0, H * 0.62, W, H * 0.38);
  // Skyline silhouettes.
  c.fillStyle = '#2e1a33';
  const towers = [[0.05, 0.30], [0.14, 0.42], [0.24, 0.26], [0.34, 0.38], [0.46, 0.22], [0.56, 0.36], [0.66, 0.28], [0.86, 0.40], [0.94, 0.30]];
  for (const [fx, fh] of towers) {
    c.fillRect(W * fx, H * 0.62 - H * fh, W * 0.07, H * fh);
  }
  // Lit windows.
  c.fillStyle = '#ffd21f';
  for (let i = 0; i < 40; i += 1) {
    c.fillRect(W * (0.06 + Math.random() * 0.9), H * (0.28 + Math.random() * 0.3), 3, 4);
  }
  // Palm silhouettes on the beach side.
  c.strokeStyle = '#1c2f1a';
  c.lineWidth = 4;
  for (const fx of [0.08, 0.16]) {
    c.beginPath(); c.moveTo(W * fx, H * 0.98); c.quadraticCurveTo(W * fx + 6, H * 0.8, W * fx + 14, H * 0.72); c.stroke();
    c.beginPath(); c.moveTo(W * fx + 14, H * 0.72); c.lineTo(W * fx + 34, H * 0.66); c.moveTo(W * fx + 14, H * 0.72); c.lineTo(W * fx - 4, H * 0.64); c.stroke();
  }
  // Sports-car silhouette on the boulevard.
  c.fillStyle = '#c22730';
  c.beginPath();
  c.moveTo(W * 0.38, H * 0.92);
  c.lineTo(W * 0.42, H * 0.80);
  c.lineTo(W * 0.52, H * 0.76);
  c.lineTo(W * 0.60, H * 0.80);
  c.lineTo(W * 0.66, H * 0.92);
  c.closePath();
  c.fill();
  c.fillStyle = '#141414';
  c.beginPath(); c.arc(W * 0.44, H * 0.92, 9, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(W * 0.60, H * 0.92, 9, 0, Math.PI * 2); c.fill();
  // Logo text over the sky.
  const grad = c.createLinearGradient(0, H * 0.08, 0, H * 0.34);
  grad.addColorStop(0, '#ffe9a8');
  grad.addColorStop(1, '#ffb45e');
  c.fillStyle = grad;
  c.font = 'bold 44px system-ui, sans-serif';
  c.textAlign = 'center';
  c.shadowColor = 'rgba(0,0,0,0.6)';
  c.shadowBlur = 10;
  c.fillText('SOLMAR BAY', W / 2, H * 0.30);
  c.shadowBlur = 0;
  c.fillStyle = '#f5efe4';
  c.font = 'italic 15px system-ui, sans-serif';
  c.fillText('Six jobs. One city. Take it back.', W / 2, H * 0.48);
}

// What a mission stage needs from the world: spawn/remove its car and
// enemies, set the wanted level, count live mission enemies. The
// callbacks close over the dynamic modules, which are built by
// resetWorld() before any mission can start.
const missionWorld = {
  spawnMissionCar(type, x, z, heading, colour) {
    const car = newCar(type, x, z, heading, colour);
    car.parked = true;
    dynamicGroup.add(car.mesh);
    traffic.parked.push(car);
    return car;
  },
  removeMissionCar(car) {
    if (!car) return;
    traffic.parked = traffic.parked.filter((c) => c !== car);
    if (dynamicGroup) dynamicGroup.remove(car.mesh);
  },
  spawnMissionEnemies(positions) {
    for (const [x, z] of positions) combat.spawnEnemy(x, z, 100, 'mission');
  },
  clearMissionEnemies() { combat.clearEnemies('mission'); },
  missionEnemiesAlive() { return combat.aliveCount('mission'); },
  setStars(n) { police.setStars(n); },
  nearestCruiser() { return police.nearestCruiserDistance(player.x, player.z); },
  toast(text) { hud.toast(text); },
};
const missions = createMissions(missionWorld);

const city = buildCity(createRandom(seed));
scene.add(city.group);

// --- dynamic world (rebuilt on reset) --------------------------------------
let dynamicGroup = null;
let traffic = null;
let peds = null;
let collectibles = null;
let combat = null;
let police = null;
let taxi = null;
let heli = null;
let sideJobs = null;

// Cash drops collected in this session, kept across world resets so a
// retry or a mission restart cannot farm the same drop twice.
const persistentDrops = new Set();

function buildDynamic() {
  if (dynamicGroup) scene.remove(dynamicGroup);
  dynamicGroup = new THREE.Group();
  scene.add(dynamicGroup);
  const rng = createRandom(seed + 7);
  traffic = createTraffic(rng, city, dynamicGroup);
  peds = createPedestrians(rng, dynamicGroup);
  collectibles = createCollectibles(rng, dynamicGroup, city);
  combat = createCombat(dynamicGroup, onPlayerHit, onKill, city.colliders, onHotspotClear, onWeaponPickup);
  police = createPolice(dynamicGroup);
  taxi = createTaxi(dynamicGroup);
  heli = createHelicopter(dynamicGroup);
  sideJobs = createSideJobs(dynamicGroup);
  collectibles.restoreTaken([...persistentDrops]);
}

// --- the player --------------------------------------------------------------
const playerMesh = (() => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.35), new THREE.MeshLambertMaterial({ color: 0xe08a2e }));
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshLambertMaterial({ color: 0xe8b88a }));
  head.position.y = 1.68;
  g.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.65, 0.3), new THREE.MeshLambertMaterial({ color: 0x2e3440 }));
  legs.position.y = 0.33;
  g.add(legs);
  scene.add(g);
  return g;
})();

const headlightSpot = new THREE.SpotLight(0xfff2b0, 0, 40, 0.5, 0.4);
scene.add(headlightSpot);
scene.add(headlightSpot.target);

const player = {
  x: city.spawn.x, z: city.spawn.z, y: 0, vy: 0,
  heading: city.spawn.heading, vx: 0, vz: 0,
  inCar: false, car: null,
  health: PLAYER.maxHealth, armour: 0, cash: 500, stamina: 100,
  flash: 0, lastHitT: -10, grounded: true,
  get speed() { return this.inCar && this.car ? this.car.speed : Math.hypot(this.vx, this.vz); },
};

let screen = SCREEN_TITLE;
let time = 0;
let staged = false; // a screenshot scene holds the camera still
let muted = false;
let prevStars = 0; // for counting escapes when the heat drops to zero
let slowmoT = 0; // kill slow-down: sim time runs at 0.35x while this lasts

// The last checkpoint: where a retry puts the player back (mission start
// or game start). Cash and collected drops are kept across a retry —
// only the position and the mission restart.
let checkpoint = { mission: -1, x: city.spawn.x, z: city.spawn.z };

function saveCheckpoint() {
  checkpoint = { mission: missions.current, x: player.x, z: player.z };
}

function retryFromCheckpoint() {
  const cash = player.cash;
  const cp = checkpoint;
  resetWorld();
  player.cash = cash;
  player.x = cp.x;
  player.z = cp.z;
  player.heading = city.spawn.heading;
  renderer.cam.yaw = city.spawn.heading;
  if (cp.mission >= 0) missions.start(cp.mission);
  police.setStars(0);
  setScreen(SCREEN_PLAY);
}

function collectSave() {
  return {
    ...progression.toSave(),
    cash: player.cash,
    mission: missions.unlocked,
    x: player.x,
    z: player.z,
    drops: [...persistentDrops],
    taxiEarned: taxi.totalEarned,
    fares: taxi.faresDone,
    time,
    health: player.health,
    armour: player.armour,
    missionsDone: missions.missionsDone,
    cashEarned: missions.cashEarned,
    timePlayed: time,
    ownedCars: [...garageState.owned],
    upgrades: JSON.parse(JSON.stringify(garageState.upgrades)),
  };
}

function formatTime(t) {
  const s = Math.floor(t);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function handleMissionEvent(ev) {
  if (ev.kind === 'stage') {
    audio.objective();
  } else if (ev.kind === 'complete') {
    player.cash += ev.reward;
    audio.missionComplete();
    const levelled = progression.addRep(150 + ev.reward / 10);
    progression.stats.missionsDone = missions.missionsDone;
    progression.stats.cashEarned = missions.cashEarned;
    progression.addPractice('Driving', 10);
    hud.toast(`${MISSIONS[ev.index].name} complete!  +$${ev.reward}`);
    hud.popup(`+$${ev.reward} · +${Math.round(150 + ev.reward / 10)} REP${levelled ? ' · REP UP!' : ''}`);
    writeSave(collectSave()); // auto-save on mission complete
    if (missions.gameComplete) {
      document.getElementById('complete-stats').textContent =
        `6/6 missions · $${missions.cashEarned.toLocaleString('en-US')} earned on jobs · ` +
        `${taxi.faresDone} taxi fares · ${collectibles.collectedCount}/20 cash drops · ${formatTime(time)} on the streets`;
      setScreen(SCREEN_COMPLETE);
    }
  } else if (ev.kind === 'failed') {
    audio.missionFail();
    hud.toast(`Mission failed: ${ev.reason}`);
  }
}

function onWeaponPickup(name, first) {
  audio.pickup();
  progression.addPractice('Shooting', 3);
  const key = name === 'smg' ? '3' : name === 'shotgun' ? '4' : '5';
  hud.toast(first ? `${WEAPONS[name].name} picked up! Press ${key} to use it.` : `${WEAPONS[name].name} restocked.`);
  if (first) hud.popup(`${WEAPONS[name].name.toUpperCase()} UNLOCKED`);
}

function handleSideJobEvent(ev) {
  if (ev.kind === 'delivery-picked') {
    audio.taxi();
    hud.toast(`Package picked up — $${ev.pay} to the green marker`);
  } else if (ev.kind === 'delivery-done') {
    player.cash += ev.total;
    audio.cash();
    progression.addRep(20);
    progression.stats.deliveriesDone = sideJobs.deliveriesDone;
    progression.stats.deliveryEarned = sideJobs.deliveryEarned;
    progression.addPractice('Driving', 4);
    hud.toast(`Delivery complete  +$${ev.total}  (tip $${ev.tip})`);
    hud.popup(`DELIVERY +$${ev.total} · +20 REP`);
  } else if (ev.kind === 'delivery-expired') {
    hud.toast('The delivery window closed — no pay.');
  } else if (ev.kind === 'race-started') {
    audio.taxi();
    hud.toast(`${ev.name} — hit every checkpoint, fast!`);
  } else if (ev.kind === 'race-checkpoint') {
    audio.pickup();
    hud.toast(`Checkpoint ${ev.point}/${ev.total}`);
  } else if (ev.kind === 'race-done') {
    player.cash += ev.pay;
    audio.missionComplete();
    progression.addRep(40);
    progression.stats.racesWon = sideJobs.racesWon;
    progression.addPractice('Driving', 8);
    hud.toast(`${ev.name} won in ${ev.time.toFixed(1)}s!  +$${ev.pay}`);
    hud.popup(`RACE WON +$${ev.pay} · +40 REP`);
  } else if (ev.kind === 'race-quit') {
    hud.toast('Race abandoned — you left the car.');
  }
}

function handleTaxiEvent(ev) {
  if (ev.kind === 'picked') {
    audio.taxi();
    hud.toast(`Fare picked up — $${ev.fare} to the green marker`);
  } else if (ev.kind === 'delivered') {
    player.cash += ev.total;
    audio.cash();
    progression.addRep(15);
    progression.stats.faresDone = taxi.faresDone;
    progression.stats.taxiEarned = taxi.totalEarned;
    progression.addPractice('Driving', 4);
    hud.toast(`Fare complete  +$${ev.total}  (tip $${ev.tip})`);
    hud.popup(`FARE +$${ev.total} · +15 REP`);
  } else if (ev.kind === 'left') {
    hud.toast('The fare got tired of waiting.');
  } else if (ev.kind === 'expired') {
    hud.toast('The fare ran out of patience — no pay.');
  } else if (ev.kind === 'cancelled') {
    hud.toast('The fare walked off.');
  }
}

function onPlayerHit(dmg) {
  const now = time;
  player.lastHitT = now;
  let rest = dmg;
  if (player.armour > 0) {
    const soaked = Math.min(player.armour, rest);
    player.armour -= soaked;
    rest -= soaked;
  }
  player.health -= rest;
  player.flash = 0.6;
  if (player.health <= 0) {
    player.health = 0;
    setScreen(SCREEN_WASTED);
    audio.missionFail();
  }
}

function onKill() {
  player.cash += 25;
  progression.stats.takedowns += 1;
  progression.addRep(10);
  progression.addPractice('Shooting', 6);
  hud.toast('Rival down  +$25');
  hud.popup('TAKEDOWN +$25 · +10 REP');
  slowmoT = 0.35; // a brief slow-down on a kill
}

function onHotspotClear() {
  player.cash += 100;
  hud.toast('Rival hotspot cleared!  +$100');
  audio.cash();
}

// --- collisions ---------------------------------------------------------------
function circleBlocked(x, z, r) {
  if (x < -394 || x > 395 || z < -395 || z > 400) return true;
  for (const c of city.colliders) {
    if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
  }
  return false;
}

function collideCar(x, z, r) {
  return circleBlocked(x, z, r);
}

// --- screens ------------------------------------------------------------------
const screens = {
  [SCREEN_TITLE]: 'title-screen',
  [SCREEN_PAUSED]: 'pause-screen',
  [SCREEN_BUSTED]: 'busted-screen',
  [SCREEN_WASTED]: 'wasted-screen',
  [SCREEN_COMPLETE]: 'complete-screen',
};

function setScreen(next) {
  screen = next;
  for (const [key, id] of Object.entries(screens)) {
    document.getElementById(id).classList.toggle('hidden', key !== next);
  }
  document.getElementById('hud').classList.toggle('hidden', next === SCREEN_TITLE || next === SCREEN_COMPLETE);
  document.getElementById('btn-continue').disabled = !hasSave();
  if (next === SCREEN_TITLE) {
    status.textContent = 'Solmar Bay. Press New Game to start.';
    drawTitlePoster();
    const save = readSave();
    const summary = document.getElementById('save-summary');
    if (save) {
      const tier = tierForRep(save.rep ?? 0);
      summary.textContent = `Continue — Mission ${Math.min(save.mission + 1, 6)}/6 · $${Math.floor(save.cash).toLocaleString('en-US')} · REP ${tier.level} · ${tier.name}`;
    } else summary.textContent = '';
  }
}

// Map and garage overlays pause the sim (the screen goes to PAUSED
// underneath) and close back to play.
function openMap() {
  if (screen !== SCREEN_PLAY && screen !== SCREEN_PAUSED) return;
  setScreen(SCREEN_PAUSED);
  document.getElementById('pause-screen').classList.add('hidden');
  cityMap.show();
}
function closeMap() {
  cityMap.hide();
  setScreen(SCREEN_PLAY);
}
function openGarage() {
  if (screen !== SCREEN_PLAY && screen !== SCREEN_PAUSED) return;
  setScreen(SCREEN_PAUSED);
  document.getElementById('pause-screen').classList.add('hidden');
  document.getElementById('garage-selected').textContent = garage.selected.toUpperCase();
  garage.show();
}
function closeGarage() {
  garage.hide();
  setScreen(SCREEN_PLAY);
}

// --- world reset ---------------------------------------------------------------
function resetWorld() {
  buildDynamic();
  player.x = city.spawn.x;
  player.z = city.spawn.z;
  player.y = 0;
  player.vy = 0;
  player.vx = 0;
  player.vz = 0;
  player.heading = city.spawn.heading;
  player.inCar = false;
  player.car = null;
  player.health = PLAYER.maxHealth;
  player.armour = 0;
  player.cash = 500;
  player.stamina = 100;
  player.flash = 0;
  player.lastHitT = -10;
  prevStars = 0;
  missions.quitToFreeRoam();
  time = 0;
  staged = false;
  pendingActions = 0;
  renderer.cam.yaw = city.spawn.heading;
  renderer.cam.pitch = 0.32;
}

// --- shot-scene helpers ---------------------------------------------------------
function placePlayerOnFoot(x, z, heading) {
  player.x = x;
  player.z = z;
  player.y = 0;
  player.heading = heading;
  player.inCar = false;
  player.car = null;
  renderer.cam.yaw = heading;
}

function placePlayerInCar(type, x, z, heading) {
  const car = newCar(type, x, z, heading, 0xd94f3d);
  const up = garageState.upgrades[type] || {};
  car.upgrades = { engine: up.engine ?? 0, armour: up.armour ?? 0, nitro: up.nitro ?? 0 };
  dynamicGroup.add(car.mesh);
  player.car = car;
  player.inCar = true;
  player.x = x;
  player.z = z;
  player.heading = heading;
  return car;
}

function stageCamera(pos, look) {
  staged = true;
  renderer.cam.pos.set(pos.x, pos.y, pos.z);
  renderer.cam.look.set(look.x, look.y, look.z);
  renderer.camera.position.copy(renderer.cam.pos);
  renderer.camera.lookAt(renderer.cam.look);
}

const game = {
  player, missions, police: null, combat: null, traffic: null, peds: null, collectibles: null,
  resetWorld, stepSim, setScreen, placePlayerOnFoot, placePlayerInCar, stageCamera,
  openMap, closeMap,
  setSky(hour) { renderer.setSky(hour); },
  pursueInput(car, tx, tz, cruise) { return pursueSteer(car, tx, tz, cruise); },
};
Object.defineProperties(game, {
  police: { get: () => police },
  combat: { get: () => combat },
  traffic: { get: () => traffic },
  peds: { get: () => peds },
  collectibles: { get: () => collectibles },
  heli: { get: () => heli },
  sideJobs: { get: () => sideJobs },
  taxi: { get: () => taxi },
});

// --- one fixed step ---------------------------------------------------------------
function stepSim(dt, inputOverride, ambient = false) {
  time += dt;
  // Traffic lights flip every 8 seconds.
  for (const l of city.lights) {
    l.timer += dt;
    if (l.timer >= 8) {
      l.timer = 0;
      l.state = l.state === 'ns' ? 'ew' : 'ns';
      l.red.material.color.setHex(l.state === 'ew' ? 0xff2a2a : 0x441111);
      l.green.material.color.setHex(l.state === 'ns' ? 0x22cc44 : 0x113311);
    }
  }
  traffic.update(dt, collideCar, player.inCar ? player.car : null);
  peds.update(dt);
  combat.update(dt, player, time);
  const policeResult = police.update(dt, player, collideCar);
  if (prevStars > 0 && police.stars === 0) {
    progression.stats.escapes += 1;
    progression.addRep(25);
    hud.popup('ESCAPED THE LAW · +25 REP');
  }
  prevStars = police.stars;
  if (policeResult.rammed) {
    audio.crash();
    player.flash = Math.max(player.flash, 0.3);
  }
  if (policeResult.busted && screen === SCREEN_PLAY) {
    setScreen(SCREEN_BUSTED);
    audio.missionFail();
  }
  const drops = collectibles.update(dt, player.x, player.z, player.inCar, player.inCar && player.car ? player.car.speed : 0);
  if (drops.collected > 0) {
    player.cash += 50 * drops.collected;
    audio.pickup();
    hud.toast(`Cash drop  +$${50 * drops.collected}`);
    if (drops.got === drops.total) {
      player.cash += 500;
      hud.toast('All cash drops found! Bonus +$500');
      audio.missionComplete();
    }
  }
  if (drops.stunt) {
    player.cash += 200;
    progression.addRep(15);
    progression.stats.stuntsDone = collectibles.stuntsDone;
    hud.toast('Stunt jump!  +$200');
    hud.popup('STUNT JUMP +$200 · +15 REP');
    audio.pickup();
  }

  // The sky follows the in-game clock: 10 seconds of play is one game
  // minute, starting at 18:42 golden hour and sliding toward dusk.
  renderer.setSky((18.7 + time / 600) % 24);

  if (!ambient) stepPlayer(dt, inputOverride);
  else {
    playerMesh.position.set(player.x, 0, player.z);
    playerMesh.rotation.y = player.heading;
    playerMesh.visible = !player.inCar;
  }

  // Cash drops collected this step join the session set (kept across resets).
  collectibles.drops.forEach((d, i) => { if (d.taken) persistentDrops.add(i); });

  // Roadblocks are solid: ramming one wrecks the car, and blowing through
  // one at speed raises the heat.
  if (player.inCar && player.car) {
    for (const b of police.roadblocks) {
      for (const c of b.cars) {
        if (Math.hypot(c.x - player.x, c.z - player.z) < 2.6 && Math.abs(player.car.speed) > 1) {
          const impact = Math.abs(player.car.speed);
          player.car.speed *= -0.3;
          applyCarDamage(player.car, impact * 2);
          audio.crash();
          player.flash = Math.max(player.flash, 0.3);
        }
      }
      if (!b.tripped && Math.abs(player.car.speed) > 12 && Math.hypot(b.x - player.x, b.z - player.z) < 8) {
        b.tripped = true;
        police.addStars(1);
        hud.toast('You blew through a roadblock! Wanted +1');
      }
    }
  }

  // Missions, taxi fares and side jobs only advance while actually
  // playing — never during the title-screen sweep or a staged screenshot.
  if (!ambient && screen === SCREEN_PLAY) {
    for (const ev of missions.update(dt, {
      x: player.x, z: player.z, inCar: player.inCar, car: player.car,
      carDamage: player.car ? player.car.damage : 0, time,
    })) handleMissionEvent(ev);
    for (const ev of taxi.update(dt, player)) handleTaxiEvent(ev);
    for (const ev of sideJobs.update(dt, player)) handleSideJobEvent(ev);
  }

  // Health regenerates slowly out of combat.
  if (time - player.lastHitT > 8 && player.health > 0 && player.health < PLAYER.maxHealth) {
    player.health = Math.min(PLAYER.maxHealth, player.health + PLAYER.healthRegen * dt);
  }
  // Stamina drains while running on foot, recovers otherwise.
  if (!player.inCar && input.run() && Math.hypot(player.vx, player.vz) > 1) {
    player.stamina = Math.max(0, player.stamina - 12 * dt);
  } else {
    player.stamina = Math.min(100, player.stamina + 9 * dt);
  }
  if (player.flash > 0) player.flash = Math.max(0, player.flash - dt * 1.5);

  // Audio follows the world.
  const nearestPolice = police.nearestCruiserDistance(player.x, player.z);
  audio.setSiren(police.stars > 0, nearestPolice);
  audio.setEngine(player.inCar && player.car ? Math.abs(player.car.speed) / player.car.spec.topSpeed : 0, player.inCar);

  // Headlights: one spotlight follows the player's car.
  if (player.inCar && player.car && player.car.headlights) {
    headlightSpot.intensity = 60;
    headlightSpot.position.set(player.car.x + Math.sin(player.car.heading) * 2, 1.2, player.car.z + Math.cos(player.car.heading) * 2);
    headlightSpot.target.position.set(player.car.x + Math.sin(player.car.heading) * 20, 0.5, player.car.z + Math.cos(player.car.heading) * 20);
  } else headlightSpot.intensity = 0;

  updateHud(dt);
}

function stepPlayer(dt, inputOverride) {
  // Actions are taken once per frame by the loop and held here, so a press
  // is never lost between frames or counted twice. An autopilot override
  // carries { throttle, steer } instead of the usual { move, actions }.
  const inputState = inputOverride || null;
  let move;
  let actions = 0;
  let orbit = { dx: 0, dy: 0 };
  let run = false;
  let handbrake = false;
  if (inputState && typeof inputState.throttle === 'number') {
    move = { f: inputState.throttle, s: -inputState.steer };
  } else {
    move = inputState ? inputState.move : input.move();
    actions = inputState ? (inputState.actions || 0) : pendingActions;
    pendingActions = 0;
    orbit = inputState ? { dx: 0, dy: 0 } : input.takeOrbit();
    run = inputState ? false : input.run();
    handbrake = inputState ? false : input.handbrake();
  }

  renderer.cam.yaw -= orbit.dx * 0.005;
  renderer.cam.pitch = Math.max(0.05, Math.min(1.2, renderer.cam.pitch + orbit.dy * 0.004));

  // Flying the helicopter: W/S forward/back, A/D yaw, Space climbs,
  // Shift descends, E lands and steps out.
  if (heli && heli.isFlying) {
    heli.fly(dt, { f: move.f, s: move.s, lift: input.held('Space'), descend: run });
    const hp = heli.pos;
    player.x = hp.x;
    player.z = hp.z;
    player.y = hp.y;
    player.heading = hp.heading;
    playerMesh.visible = false;
    if (actions & ACTION_ENTER) {
      heli.exit(player);
      playerMesh.visible = true;
    }
    return;
  }

  if (player.inCar && player.car) {
    const car = player.car;
    // Nitro: hold Shift while driving a nitro-fitted car for a boost.
    car.nitroBoost = run && ((car.upgrades && car.upgrades.nitro) || 0) > 0;
    const throttle = move.f;
    const steerInput = move.s; // A = left, D = right (see vehicles.driveCar)
    const impact = driveCar(car, throttle, -steerInput, handbrake, dt, collideCar);
    if (impact > 6) {
      audio.crash();
      player.flash = Math.max(player.flash, 0.25);
      peds.scare(car.x, car.z, 10);
    }
    player.x = car.x;
    player.z = car.z;
    player.heading = car.heading;
    // Hitting a pedestrian: they flee, and the law notices.
    for (const p of peds.peds) {
      if (p.panic <= 0 && Math.abs(car.speed) > 4 && Math.hypot(p.x - car.x, p.z - car.z) < 2.2) {
        peds.scare(car.x, car.z, 12);
        police.addStars(1);
        audio.crash();
        hud.toast('You hit a pedestrian! Wanted +1');
      }
    }
    if (actions & ACTION_ENTER) exitCar();
    if (actions & ACTION_HORN) { audio.horn(); car.hornT = 0.4; }
    if (actions & ACTION_LIGHTS) car.headlights = !car.headlights;
    playerMesh.visible = false;
    return;
  }

  // On foot. Forward is (sin yaw, cos yaw); right is (-cos yaw, sin yaw).
  const yaw = renderer.cam.yaw;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = -Math.cos(yaw);
  const rz = Math.sin(yaw);
  const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const tx = (fx * move.f + rx * move.s) * speed;
  const tz = (fz * move.f + rz * move.s) * speed;
  player.vx += (tx - player.vx) * Math.min(1, dt * 10);
  player.vz += (tz - player.vz) * Math.min(1, dt * 10);
  if (Math.hypot(player.vx, player.vz) > 0.3) {
    player.heading = Math.atan2(player.vx, player.vz);
  }
  // Move axis by axis so a wall stops one axis, not both.
  const nx = player.x + player.vx * dt;
  if (!circleBlocked(nx, player.z, PLAYER.radius)) player.x = nx;
  const nz = player.z + player.vz * dt;
  if (!circleBlocked(player.x, nz, PLAYER.radius)) player.z = nz;
  player.x = Math.max(-394, Math.min(395, player.x));
  player.z = Math.max(-395, Math.min(400, player.z));
  if (actions & ACTION_JUMP && player.grounded) {
    player.vy = PLAYER.jumpSpeed;
    player.grounded = false;
  }
  player.vy -= PLAYER.gravity * dt;
  player.y += player.vy * dt;
  if (player.y <= 0) { player.y = 0; player.vy = 0; player.grounded = true; }
  playerMesh.position.set(player.x, player.y, player.z);
  playerMesh.rotation.y = player.heading;
  playerMesh.visible = true;

  if (actions & ACTION_ENTER) tryEnterCar();
  if (actions & ACTION_PUNCH) doPunch();
  if (actions & ACTION_SHOOT) doShoot();
  if (actions & ACTION_RELOAD) combat.reload();
  if (actions & ACTION_WEAPON1) combat.switchWeapon('fists');
  if (actions & ACTION_WEAPON2) combat.switchWeapon('pistol');
  if (actions & ACTION_WEAPON3) combat.switchWeapon('smg');
  if (actions & ACTION_WEAPON4) combat.switchWeapon('shotgun');
  if (actions & ACTION_WEAPON5) combat.switchWeapon('rifle');
}

function nearestParked(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of traffic.parked) {
    const d = Math.hypot(car.x - player.x, car.z - player.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function tryEnterCar() {
  // The helipad heli comes first: stealing it is the same E key.
  if (heli && heli.tryEnter(player)) {
    player.inCar = false;
    player.car = null;
    progression.stats.carsStolen += 1;
    hud.toast('Helicopter — Space climbs, Shift descends, E lands and steps out.');
    audio.pickup();
    return;
  }
  const car = nearestParked(4);
  if (!car) return;
  const isMissionCar = car === missions.missionCar;
  const seen = !isMissionCar && (police.nearestCruiserDistance(player.x, player.z) < 35 || peds.peds.some((p) => Math.hypot(p.x - player.x, p.z - player.z) < 12));
  player.car = car;
  player.inCar = true;
  // The car drives with whatever the garage fitted to it.
  const up = garageState.upgrades[car.type] || {};
  car.upgrades = { engine: up.engine ?? 0, armour: up.armour ?? 0, nitro: up.nitro ?? 0 };
  car.parked = false;
  traffic.parked = traffic.parked.filter((c) => c !== car);
  player.x = car.x;
  player.z = car.z;
  player.heading = car.heading;
  if (isMissionCar) {
    hud.toast(car.type === 'sports' ? 'The sports car — get it to the chop shop.' : "Tess's sedan — take it to the garage.");
  } else if (seen) {
    progression.stats.carsStolen += 1;
    progression.addPractice('Driving', 2);
    police.addStars(1);
    hud.toast('Seen stealing the car! Wanted +1');
  } else {
    progression.stats.carsStolen += 1;
    progression.addPractice('Driving', 2);
    hud.toast(`${car.spec.name} — yours now. Drive!`);
  }
  audio.pickup();
}

function exitCar() {
  const car = player.car;
  if (!car) return;
  car.speed = 0;
  car.parked = true;
  traffic.parked.push(car);
  player.inCar = false;
  player.car = null;
  player.x = car.x + Math.cos(car.heading) * 2.2;
  player.z = car.z - Math.sin(car.heading) * 2.2;
  player.heading = car.heading;
  playerMesh.visible = true;
}

function aimDirection() {
  const cam = renderer.cam;
  const dx = cam.look.x - cam.pos.x;
  const dz = cam.look.z - cam.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  return { dx: dx / d, dz: dz / d };
}

function doPunch() {
  audio.punch();
  const dir = aimDirection();
  const hit = combat.shoot(player.x, 1.4, player.z, dir.dx, dir.dz, time);
  if (hit) peds.scare(player.x, player.z, 10);
  const officer = police.hitOfficer(player.x, player.z, dir.dx, dir.dz, 2.2, 25, true);
  if (officer && officer.dead) {
    police.addStars(1);
    hud.toast('You floored an officer! Wanted +1');
    peds.scare(player.x, player.z, 16);
  }
}

function doShoot() {
  if (combat.weapon === 'fists') { doPunch(); return; }
  const before = combat.ammo;
  const dir = aimDirection();
  combat.shoot(player.x, 1.5, player.z, dir.dx, dir.dz, time);
  if (combat.ammo < before) {
    audio.gunshot();
    peds.scare(player.x, player.z, 16);
    if (police.stars === 0) police.addStars(1);
    const officer = police.hitOfficer(player.x, player.z, dir.dx, dir.dz, WEAPONS[combat.weapon].range, WEAPONS[combat.weapon].damage, false);
    if (officer && officer.dead) {
      police.addStars(1);
      hud.toast('You killed an officer! Wanted +1');
    }
  }
}

// --- HUD ----------------------------------------------------------------------
const RADIO_TRACKS = [
  'Neon Drive — Pink Horizon',
  'Midnight Palm — Sunset Static',
  'Chrome Sunset — Velvet Coast',
  'Night Runner — Lumen Kids',
  'Bay Lights — Mira Sol',
];
const UNIT_CALLSIGNS = ['VIPER-1', 'GULL-2', 'REEF-7', 'HARBOUR-3', 'AIR-1', 'TIDE-4', 'CORAL-9', 'PIER-5'];

function updateHud(dt) {
  const nearCar = !player.inCar ? nearestParked(4) : null;
  const nearGarage = Math.hypot(player.x - GARAGE_POS.x, player.z - GARAGE_POS.z) < 40;
  const nearHeli = heli && !heli.isFlying && heli.nearPad(player.x, player.z, 6) && !player.inCar;
  let hint = '';
  if (heli && heli.isFlying) hint = 'W/S fly · A/D turn · Space climb · Shift descend · E land & exit';
  else if (player.inCar) hint = 'W/S drive · A/D steer · Space handbrake · H horn · L lights · E exit';
  else if (nearCar) hint = `Press E to take the ${nearCar.spec.name}`;
  else if (combat.weapon !== 'fists' && combat.ammo === 0) hint = 'Press R to reload';
  else hint = 'WASD move · Shift run · Space jump · F punch · 1-5 weapons · M map · P pause';
  if (nearGarage && !player.inCar) hint += ' · G — Tess’s garage (upgrades & cars)';
  if (nearHeli) hint += ' · E — steal the helicopter';
  if (player.inCar && player.car && (player.car.upgrades?.nitro ?? 0) > 0) hint += ' · Shift — NITRO';
  const sideInfo = sideJobs ? sideJobs.info() : null;
  if (sideInfo) hint = `${sideInfo.text} — ${sideInfo.timer}s · ${hint}`;
  const weaponName = combat.weaponName;
  if (taxi.state === 'waiting') hint = 'A fare is waiting — stop your taxi by the green marker';
  else if (taxi.state === 'riding') hint = 'Deliver the fare to the green marker';
  else if (player.inCar && player.car && player.car.type === 'taxi') hint = 'Taxi: fares hail you while you drive — watch for the green marker';
  // Police response panel: named units with distance + state, TRACE %.
  const nearest = police.nearestCruiserDistance(player.x, player.z);
  const units = police.cruisers.map((c, i) => {
    const dist = Math.round(Math.hypot(c.x - player.x, c.z - player.z));
    const callsign = UNIT_CALLSIGNS[i % UNIT_CALLSIGNS.length];
    let state = 'EN ROUTE';
    if (callsign === 'AIR-1') state = 'SEARCHLIGHT';
    else if (dist < 12) state = 'RAMMING';
    else if (dist < 35) state = 'PURSUIT';
    else if (police.roadblocks.length > 0) state = 'ROADBLOCK';
    return { callsign, dist, state };
  });
  // The air unit reports as AIR-1 with its searchlight state.
  if (police.heliActive && police.heliPos) {
    const hd = Math.round(Math.hypot(police.heliPos.x - player.x, police.heliPos.z - player.z));
    units.push({ callsign: 'AIR-1', dist: hd, state: 'SEARCHLIGHT' });
  }
  const trace = police.stars > 0 ? Math.max(5, Math.min(98, Math.round(100 - nearest * 0.9))) : 0;
  const mission = missions.current >= 0 ? {
    index: missions.current,
    name: MISSIONS[missions.current].name,
    stage: missions.stage,
    stages: MISSIONS[missions.current].stages.length,
    next: MISSIONS[missions.current].stages[missions.stage + 1]?.text ?? null,
  } : null;
  const car = player.inCar && player.car ? player.car : null;
  const absSpeed = car ? Math.abs(car.speed) : 0;
  const gear = !car ? '' : car.speed < -0.5 ? 'R' : absSpeed < 5 ? 'G1' : absSpeed < 12 ? 'G2' : absSpeed < 20 ? 'G3' : absSpeed < 28 ? 'G4' : 'G5';
  progression.stats.timePlayed = time;
  progression.stats.dropsGot = collectibles.collectedCount;
  hud.update(dt, {
    health: player.health,
    armour: player.armour,
    stamina: player.stamina,
    cash: player.cash,
    stars: police.stars,
    weaponName,
    ownedWeapons: combat.ownedWeapons(),
    ammoText: combat.weapon === 'fists' ? '' : `${combat.ammo} / ${combat.reserve}${combat.reloading ? ' …' : ''}`,
    speed: player.inCar && player.car ? player.car.speed : (heli && heli.isFlying ? heli.speed : 0),
    time,
    objective: missions.objectiveText(),
    timer: missions.timerLeft(),
    fare: taxi.fareInfo(),
    fareMarker: taxi.marker(),
    roadblocks: police.roadblocks,
    hint,
    muted,
    dropsGot: collectibles.collectedCount,
    drops: collectibles.drops,
    marker: missions.marker(),
    cruisers: police.cruisers,
    player: { x: player.x, z: player.z, heading: player.heading },
    inCar: player.inCar,
    flash: player.flash * 0.4,
    units,
    trace,
    mission,
    rep: progression.progress,
    carName: car ? car.spec.name : (heli && heli.isFlying ? 'HELICOPTER' : ''),
    carCondition: car ? Math.max(0, 100 - car.damage * 0.8) : 100,
    gear,
    radioTrack: RADIO_TRACKS[Math.floor(time / 45) % RADIO_TRACKS.length],
  });
}

// --- menus ----------------------------------------------------------------------
function buildMissionList() {
  const list = document.getElementById('mission-list');
  list.innerHTML = '';
  MISSIONS.forEach((m, i) => {
    const btn = document.createElement('button');
    btn.textContent = `${i + 1}. ${m.name} — $${m.reward}${i > missions.unlocked ? ' (locked)' : ''}`;
    btn.disabled = i > missions.unlocked;
    btn.addEventListener('click', () => {
      audio.unlock();
      if (missions.start(i)) {
        saveCheckpoint();
        hud.toast(m.briefing);
        setScreen(SCREEN_PLAY);
      }
    });
    list.appendChild(btn);
  });
}

function startGame(fromSave) {
  audio.unlock();
  if (!fromSave) {
    // A fresh game: wipe the session's progress, not just the world.
    persistentDrops.clear();
    missions.setUnlocked(0);
    missions.setStats(0, 0);
    progression.reset();
    garageState.owned = ['sedan'];
    garageState.upgrades = {};
  }
  resetWorld();
  if (fromSave) {
    const save = readSave();
    if (save) {
      player.cash = save.cash ?? 500;
      player.health = save.health ?? PLAYER.maxHealth;
      player.armour = save.armour ?? 0;
      missions.setUnlocked(save.mission ?? 0);
      missions.setStats(save.missionsDone ?? 0, save.cashEarned ?? 0);
      // Progression + garage restore from the same save (v1 saves get
      // defaults from normalizeSave, so nothing here can throw).
      const prog = createProgression(save);
      progression.reset();
      progression.addRep(prog.rep);
      Object.assign(progression.skills, prog.skills);
      Object.assign(progression.practice, prog.practice);
      Object.assign(progression.stats, prog.stats);
      progression.stats.missionsDone = save.missionsDone ?? 0;
      progression.stats.cashEarned = save.cashEarned ?? 0;
      garageState.owned = [...(save.ownedCars ?? ['sedan'])];
      garageState.upgrades = JSON.parse(JSON.stringify(save.upgrades ?? {}));
      if (Array.isArray(save.drops)) {
        persistentDrops.clear();
        for (const i of save.drops) persistentDrops.add(i);
        collectibles.restoreTaken(save.drops);
      }
      if (taxi) taxi.setStats(save.fares ?? 0, save.taxiEarned ?? 0);
      if (typeof save.x === 'number' && typeof save.z === 'number') {
        player.x = save.x;
        player.z = save.z;
      }
    }
  }
  saveCheckpoint();
  buildMissionList();
  setScreen(SCREEN_PLAY);
  status.textContent = 'Playing Solmar Bay.';
}

document.getElementById('btn-new').addEventListener('click', () => startGame(false));
document.getElementById('btn-continue').addEventListener('click', () => startGame(true));
document.getElementById('btn-resume').addEventListener('click', () => setScreen(SCREEN_PLAY));
document.getElementById('btn-restart').addEventListener('click', () => {
  // Restart the current (or last attempted) mission from its start;
  // in pure free roam it just resets the world.
  if (missions.current >= 0 || missions.lastAttempted >= 0) retryFromCheckpoint();
  else { resetWorld(); setScreen(SCREEN_PLAY); }
});
document.getElementById('btn-map').addEventListener('click', () => { audio.unlock(); openMap(); });
document.getElementById('btn-garage').addEventListener('click', () => { audio.unlock(); openGarage(); });
document.getElementById('btn-save').addEventListener('click', () => {
  const ok = writeSave(collectSave());
  hud.toast(ok ? 'Progress saved.' : 'Could not save in this browser.');
});
function syncMuteButton() {
  document.getElementById('btn-mute').textContent = muted ? 'Unmute (N)' : 'Mute (N)';
}
document.getElementById('btn-mute').addEventListener('click', () => {
  muted = !muted;
  audio.setMuted(muted);
  syncMuteButton();
});
document.getElementById('btn-quit').addEventListener('click', () => { buildMissionList(); setScreen(SCREEN_TITLE); });
document.getElementById('btn-retry').addEventListener('click', () => retryFromCheckpoint());
document.getElementById('btn-retry-wasted').addEventListener('click', () => retryFromCheckpoint());
document.getElementById('btn-complete').addEventListener('click', () => { buildMissionList(); setScreen(SCREEN_TITLE); });

// --- the loop ----------------------------------------------------------------------
let accumulator = 0;
let last = performance.now();
let pendingActions = 0;

function frame(now) {
  requestAnimationFrame(frame);
  if (shotName) {
    renderer.draw();
    return;
  }
  const rawDt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  // A kill slows the world briefly; the accumulator still eats real time.
  if (slowmoT > 0) {
    slowmoT -= rawDt;
    accumulator += rawDt * 0.35;
  } else accumulator += rawDt;
  const actions = input.takeActions();
  if (actions & ACTION_PAUSE) {
    if (cityMap.isOpen) closeMap();
    else if (garage.isOpen) closeGarage();
    else if (screen === SCREEN_PLAY) setScreen(SCREEN_PAUSED);
    else if (screen === SCREEN_PAUSED) setScreen(SCREEN_PLAY);
  }
  if (actions & ACTION_MAP) {
    if (cityMap.isOpen) closeMap();
    else if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) openMap();
  }
  if (actions & ACTION_GARAGE) {
    if (garage.isOpen) closeGarage();
    else if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) openGarage();
  }
  if (actions & ACTION_MUTE) {
    muted = !muted;
    audio.setMuted(muted);
    syncMuteButton();
  }
  if (actions & ACTION_RESTART && screen === SCREEN_PLAY) {
    resetWorld();
  }
  // The rest of the press is held for the next fixed step, not dropped.
  pendingActions |= actions & ~(ACTION_PAUSE | ACTION_MUTE | ACTION_RESTART | ACTION_MAP | ACTION_GARAGE);
  if (screen === SCREEN_PLAY || screen === SCREEN_TITLE) {
    while (accumulator >= STEP && (screen === SCREEN_PLAY || screen === SCREEN_TITLE)) {
      stepSim(STEP, null, screen === SCREEN_TITLE);
      accumulator -= STEP;
    }
  } else {
    accumulator = 0;
  }
  // Camera: the title sweep and the chase/orbit rigs, unless a shot holds it.
  if (!staged) {
    const target = { x: player.x, y: player.y, z: player.z };
    renderer.updateCamera(1 / 60, target, player.heading, player.inCar || (heli && heli.isFlying), input.lookBack(), screen, time);
  }
  renderer.draw();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === SCREEN_PLAY) setScreen(SCREEN_PAUSED);
});

// --- debug handle for the play-test tooling ---------------------------------------
window.__solmar = {
  get screen() { return screen; },
  get time() { return time; },
  player,
  get traffic() { return traffic; },
  get peds() { return peds; },
  get collectibles() { return collectibles; },
  get combat() { return combat; },
  get police() { return police; },
  get missions() { return missions; },
  get taxi() { return taxi; },
  get heli() { return heli; },
  get sideJobs() { return sideJobs; },
  get progression() { return progression; },
  get garage() { return garage; },
  get garageState() { return garageState; },
  get cityMap() { return cityMap; },
  openMap, closeMap, openGarage, closeGarage,
  get checkpoint() { return checkpoint; },
  retryFromCheckpoint,
  scene,
  get renderer() { return renderer.renderer; },
};

// --- boot -------------------------------------------------------------------------
resetWorld();
buildMissionList();
setScreen(SCREEN_TITLE);
status.textContent = 'Solmar Bay. Press New Game to start.';

if (shotName) {
  stageShot(shotName, game);
  updateHud(0);
  renderer.draw();
  let painted = 0;
  (function paint() {
    renderer.draw();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  })();
  requestAnimationFrame(frame);
} else {
  requestAnimationFrame(frame);
}
