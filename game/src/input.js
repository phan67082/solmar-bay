// Keyboard and mouse state. Held keys are read every step; one-shot
// presses (pause, enter car, jump, punch, shoot, horn, lights, mute,
// reload, weapon switch, restart) are queued as flags and taken once by
// the loop, so a press between two frames is never lost or counted twice.
// Mouse drag orbits the camera; a click while armed fires the pistol.
export const ACTION_PAUSE = 1;
export const ACTION_ENTER = 2;
export const ACTION_JUMP = 4;
export const ACTION_PUNCH = 8;
export const ACTION_SHOOT = 16;
export const ACTION_HORN = 32;
export const ACTION_LIGHTS = 64;
export const ACTION_MUTE = 128;
export const ACTION_RELOAD = 256;
export const ACTION_WEAPON1 = 512;
export const ACTION_WEAPON2 = 1024;
export const ACTION_RESTART = 2048;

const KEY_ACTIONS = {
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  KeyE: ACTION_ENTER,
  Space: ACTION_JUMP,
  KeyF: ACTION_PUNCH,
  KeyH: ACTION_HORN,
  KeyL: ACTION_LIGHTS,
  KeyM: ACTION_MUTE,
  KeyR: ACTION_RELOAD,
  Digit1: ACTION_WEAPON1,
  Digit2: ACTION_WEAPON2,
  KeyT: ACTION_RESTART,
};

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let orbitDX = 0;
  let orbitDY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let clickX = 0;
  let clickY = 0;
  let clicked = false;

  window.addEventListener('keydown', (event) => {
    if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'BUTTON')) return;
    keys.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action !== undefined && !event.repeat) actions |= action;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    clickX = event.clientX;
    clickY = event.clientY;
    clicked = false;
  });
  window.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    orbitDX += event.clientX - lastX;
    orbitDY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  window.addEventListener('pointerup', (event) => {
    if (dragging && Math.hypot(event.clientX - clickX, event.clientY - clickY) < 6) {
      clicked = true;
      actions |= ACTION_SHOOT;
    }
    dragging = false;
  });

  return {
    held(code) { return keys.has(code); },
    // Forward/back/strafe as -1/0/1, from WASD or arrows.
    move() {
      const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      return { f, s };
    },
    run() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    handbrake() { return keys.has('Space'); },
    lookBack() { return keys.has('KeyC'); },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    // Mouse orbit deltas since the last call, in pixels.
    takeOrbit() {
      const dx = orbitDX;
      const dy = orbitDY;
      orbitDX = 0;
      orbitDY = 0;
      return { dx, dy };
    },
    takeClick() {
      if (!clicked) return null;
      clicked = false;
      return { x: clickX, y: clickY };
    },
  };
}
