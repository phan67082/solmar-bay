// The save: progress, cash, unlocked missions and the player's spot,
// kept in the browser's local storage. Saving also happens from the
// pause menu. Builder 2 completes the full restore flow; the shape of
// the record is fixed here.
import { SAVE_KEY } from './config.js';

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
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
