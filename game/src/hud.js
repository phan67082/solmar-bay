// The DOM HUD and the minimap canvas. Top-left: health and armour bars,
// cash, wanted stars. Top-right: minimap (streets, beach and water, the
// player arrow, mission markers, police blips, cash drops). Bottom-right:
// weapon and ammo, speed while driving. Centre-top: the objective banner
// and mission timer. Bottom-left: context hints. Damage vignette and
// low-health pulse are CSS overlays.
import { CASH_DROP_COUNT } from './config.js';

export function createHud(doc) {
  const el = (id) => doc.getElementById(id);
  const healthFill = el('health-fill');
  const armourFill = el('armour-fill');
  const cashEl = el('cash');
  const starsEl = el('stars');
  const weaponEl = el('weapon');
  const speedEl = el('speed');
  const clockEl = el('clock');
  const objectiveEl = el('objective');
  const hintEl = el('hint');
  const toastEl = el('toast');
  const vignette = el('vignette');
  const radioEl = el('radio');
  const dropsEl = el('drops');
  const minimap = el('minimap');
  const mctx = minimap.getContext('2d');
  let toastT = 0;

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.remove('hidden');
    toastT = 3;
  }

  function drawMinimap(state) {
    const S = 220;
    const scale = S / 760; // city + sea margin
    const px = (x) => (x + 400) * scale;
    const pz = (z) => (z + 380) * scale;
    mctx.clearRect(0, 0, S, S);
    mctx.fillStyle = '#1c2f42';
    mctx.fillRect(0, 0, S, S);
    // Sea (west) and marina water (south).
    mctx.fillStyle = '#2a6f8e';
    mctx.fillRect(0, 0, px(-396), S);
    mctx.fillRect(0, pz(366), S, S - pz(366));
    // Beach.
    mctx.fillStyle = '#e0c48f';
    mctx.fillRect(px(-396), 0, px(-366) - px(-396), S);
    // Land.
    mctx.fillStyle = '#4a4a42';
    mctx.fillRect(px(-366), 0, S - px(-366), pz(366));
    // Streets.
    mctx.strokeStyle = '#8d8578';
    mctx.lineWidth = 2;
    for (let i = 0; i <= 12; i += 1) {
      const v = -360 + i * 60;
      mctx.beginPath(); mctx.moveTo(px(v), 0); mctx.lineTo(px(v), S); mctx.stroke();
      mctx.beginPath(); mctx.moveTo(0, pz(v)); mctx.lineTo(S, pz(v)); mctx.stroke();
    }
    // Plaza.
    mctx.fillStyle = '#a89a80';
    mctx.beginPath(); mctx.arc(px(-30), pz(-30), 6, 0, Math.PI * 2); mctx.fill();
    // Cash drops.
    mctx.fillStyle = '#39d353';
    for (const d of state.drops) {
      if (d.taken) continue;
      mctx.fillRect(px(d.x) - 1.5, pz(d.z) - 1.5, 3, 3);
    }
    // Mission marker.
    if (state.marker) {
      mctx.fillStyle = '#ffd21f';
      mctx.beginPath(); mctx.arc(px(state.marker.x), pz(state.marker.z), 5, 0, Math.PI * 2); mctx.fill();
      mctx.strokeStyle = '#ffd21f';
      mctx.beginPath(); mctx.arc(px(state.marker.x), pz(state.marker.z), 8, 0, Math.PI * 2); mctx.stroke();
    }
    // Police blips.
    mctx.fillStyle = '#3a86ff';
    for (const c of state.cruisers) {
      mctx.beginPath(); mctx.arc(px(c.x), pz(c.z), 3, 0, Math.PI * 2); mctx.fill();
    }
    // Player arrow (north up, rotated by heading).
    mctx.save();
    mctx.translate(px(state.player.x), pz(state.player.z));
    mctx.rotate(-state.player.heading);
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(0, -7); mctx.lineTo(5, 6); mctx.lineTo(-5, 6); mctx.closePath();
    mctx.fill();
    mctx.restore();
  }

  function update(dt, state) {
    if (toastT > 0) {
      toastT -= dt;
      if (toastT <= 0) toastEl.classList.add('hidden');
    }
    healthFill.style.width = `${Math.max(0, state.health)}%`;
    armourFill.style.width = `${Math.max(0, state.armour)}%`;
    cashEl.textContent = `$${Math.floor(state.cash).toLocaleString('en-US')}`;
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < state.stars ? '★' : '☆';
    starsEl.textContent = stars;
    starsEl.classList.toggle('hot', state.stars > 0);
    weaponEl.textContent = state.inCar ? '—' : `${state.weaponName}  ${state.ammoText}`;
    speedEl.textContent = state.inCar ? `${Math.round(Math.abs(state.speed) * 3.6)} km/h` : '';
    const mins = 18 * 60 + 42 + Math.floor(state.time / 10);
    clockEl.textContent = `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    objectiveEl.textContent = state.objective;
    hintEl.textContent = state.hint;
    dropsEl.textContent = `Cash drops ${state.dropsGot}/${CASH_DROP_COUNT}`;
    radioEl.textContent = state.muted ? 'MUTED' : 'SOLMAR FM 88.1 — synthwave';
    vignette.style.opacity = String(Math.max(0, 1 - state.health / 45) * 0.55 + state.flash);
    drawMinimap(state);
  }

  return { update, toast };
}
