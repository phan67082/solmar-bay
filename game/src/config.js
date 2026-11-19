// Solmar Bay — every tuning number and city constant in one place.
// The city is a 12x12 block grid on a 60 m pitch. Roads run on the grid
// lines (x and z = -360, -300, ..., 360); block centres sit between them.
// West of x = -372 is the beach and the sea; the boulevard is the
// westernmost road (x = -360). South of z = 366 is the marina and port.
export const STEP = 1 / 60;
export const SAVE_KEY = 'solmar-bay.save.v1';

export const CITY = {
  pitch: 60,
  half: 360,
  roadHalf: 6,
  sidewalk: 3.5,
  blocks: 12,
  seaX: -396, // water starts here (west)
  beachX0: -396,
  beachX1: -366,
  marinaZ: 366, // marina / port starts here (south)
  plaza: { x: -30, z: -30 }, // central plaza block centre
};

export const PLAYER = {
  walkSpeed: 5,
  runSpeed: 9.5,
  accel: 40,
  jumpSpeed: 8.5,
  gravity: 24,
  radius: 0.55,
  maxHealth: 100,
  maxArmour: 100,
  healthRegen: 2, // per second, out of combat
};

export const CAR_TYPES = {
  hatchback: { name: 'Hatchback', topSpeed: 24, accel: 12, brake: 28, grip: 2.6, length: 3.6, width: 1.7, height: 1.35, colours: [0xd94f3d, 0x4f7fd9, 0xe8e4da, 0x7fae62] },
  sedan: { name: 'Sedan', topSpeed: 28, accel: 13, brake: 30, grip: 2.4, length: 4.4, width: 1.85, height: 1.4, colours: [0x2e3440, 0x8a8f98, 0x5b6e8c, 0xb8b0a0] },
  taxi: { name: 'Taxi', topSpeed: 26, accel: 13, brake: 30, grip: 2.4, length: 4.4, width: 1.85, height: 1.45, colours: [0xf2c230] },
  sports: { name: 'Sports car', topSpeed: 38, accel: 18, brake: 34, grip: 2.9, length: 4.2, width: 1.9, height: 1.15, colours: [0xc22730, 0x1f6fb2, 0xf5f5f0] },
  pickup: { name: 'Pickup', topSpeed: 24, accel: 11, brake: 26, grip: 2.2, length: 4.8, width: 1.9, height: 1.7, colours: [0x6b4f2a, 0x3f6b4f, 0x9aa0a6] },
  van: { name: 'Van', topSpeed: 22, accel: 10, brake: 24, grip: 2.0, length: 5.0, width: 2.0, height: 2.1, colours: [0xd8d3c8, 0x4a6b8a, 0x8a4a4a] },
  police: { name: 'Police cruiser', topSpeed: 34, accel: 16, brake: 34, grip: 2.7, length: 4.5, width: 1.9, height: 1.45, colours: [0xf0f0f0] },
  // The one motorcycle in the city: quicker off the line and faster flat
  // out than any stock car, but no armour and no roof — a hard crash
  // throws the rider off (see driveCar / stepPlayer).
  motorcycle: { name: 'Nightrider 600', topSpeed: 42, accel: 22, brake: 30, grip: 2.8, length: 2.2, width: 0.8, height: 1.15, colours: [0x1a1a1a, 0xc22730, 0x1f6fb2] },
};

// A busier city for the polished build: more traffic on the roads,
// more parked cars at the kerbs, more pedestrians on the sidewalks.
// (Counts only — the seeded RNG in the world builders is untouched.)
// v3 world layer: traffic 28 + 6 boulevard extras in vehicles.js,
// pedestrians 48 + 12 plaza/boulevard clusters in pedestrians.js.
export const TRAFFIC_COUNT = 28;
export const PARKED_COUNT = 26;
export const PED_COUNT = 48;
export const CASH_DROP_COUNT = 20;

export const WEAPONS = {
  fists: { name: 'Fists', range: 2.2, damage: 25, rate: 0.45, ammo: Infinity },
  pistol: { name: 'Pistol', range: 70, damage: 34, rate: 0.28, magSize: 12, reserve: 60, reload: 1.1 },
  smg: { name: 'SMG', range: 55, damage: 16, rate: 0.09, magSize: 32, reserve: 160, reload: 1.4 },
  shotgun: { name: 'Shotgun', range: 26, damage: 22, rate: 0.85, magSize: 6, reserve: 30, reload: 1.8, pellets: 5, spread: 0.09 },
  rifle: { name: 'Rifle', range: 110, damage: 68, rate: 0.55, magSize: 10, reserve: 50, reload: 1.6 },
};

export const PALETTE = {
  sky: 0xffc98a,
  haze: 0xffd9a8,
  sun: 0xffb45e,
  asphalt: 0x3a3a40,
  sidewalk: 0x8d8578,
  sand: 0xe0c48f,
  sea: 0x2a6f8e,
  grass: 0x5e7d4a,
  text: '#f5efe4',
  muted: '#cbb98f',
  panel: 'rgba(20, 16, 12, 0.72)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// Road centre lines (13 of them, -360..360 step 60).
export function roadLines() {
  const lines = [];
  for (let i = 0; i <= 12; i += 1) lines.push(-360 + i * 60);
  return lines;
}

// Block centres (12 of them, -330..330 step 60).
export function blockCentres() {
  const centres = [];
  for (let i = 0; i < 12; i += 1) centres.push(-330 + i * 60);
  return centres;
}

// Is (x, z) on a road (within the asphalt, kerb to kerb)?
export function onRoad(x, z) {
  const near = (v) => {
    const m = ((v + 360) % 60 + 60) % 60;
    return m < 6 || m > 54;
  };
  return near(x) || near(z);
}

// Nearest road centre line to a coordinate.
export function nearestRoad(v) {
  return Math.round((v + 360) / 60) * 60 - 360;
}
