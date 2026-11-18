// The save: progress, cash, unlocked missions and the player's spot,
// kept in the browser's local storage. Saving also happens from the
// pause menu. v2 adds progression (REP, skills, lifetime stats) and
// the garage (owned cars, upgrades); normalizeSave fills those in so
// a v1 save — which has none of them — still loads cleanly.
import { SAVE_KEY } from './config.js';

export function normalizeSave(data) {
  const d = data && typeof data === 'object' ? data : {};
  return {
    cash: typeof d.cash === 'number' ? d.cash : 500,
    mission: typeof d.mission === 'number' ? d.mission : 0,
    x: typeof d.x === 'number' ? d.x : null,
    z: typeof d.z === 'number' ? d.z : null,
    drops: Array.isArray(d.drops) ? d.drops : [],
    taxiEarned: d.taxiEarned ?? 0,
    fares: d.fares ?? 0,
    time: d.time ?? 0,
    health: d.health ?? 100,
    armour: d.armour ?? 0,
    missionsDone: d.missionsDone ?? 0,
    cashEarned: d.cashEarned ?? 0,
    // v2 fields, defaulted for v1 saves.
    rep: typeof d.rep === 'number' ? d.rep : 0,
    skills: d.skills ?? {},
    practice: d.practice ?? {},
    carsStolen: d.carsStolen ?? 0,
    takedowns: d.takedowns ?? 0,
    escapes: d.escapes ?? 0,
    timePlayed: d.timePlayed ?? d.time ?? 0,
    ownedCars: Array.isArray(d.ownedCars) ? d.ownedCars : ['sedan'],
    upgrades: d.upgrades && typeof d.upgrades === 'object' ? d.upgrades : {},
  };
}

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return normalizeSave(data);
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function hasSave() {
  return readSave() !== null;
}
