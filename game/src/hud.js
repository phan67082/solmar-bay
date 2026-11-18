// The dense HUD: mission panel with a stage bar and timer, the SBPD
// police-response panel with named units, five weapon slots, the REP
// tier bar, car name + condition + gear + big speed, radio with track
// name, a circular minimap with coloured districts, a dialogue bar
// with a canvas-drawn portrait, and drift / near-miss popups. Every
// panel is a plain DOM node in index.html; this module only fills them
// and paints the minimap canvas. The old createHud/update/toast API
// is unchanged, so main.js keeps calling it the same way.
import { CASH_DROP_COUNT } from './config.js';
import { DISTRICTS, districtAt } from './map.js';

const CALLSIGNS = ['VIPER-1', 'GULL-2', 'REEF-7', 'HARBOUR-3', 'AIR-1', 'TIDE-4', 'CORAL-9', 'PIER-5'];
const UNIT_STATES = ['RAMMING', 'PURSUIT', 'ROADBLOCK', 'EN ROUTE', 'SEARCHLIGHT'];

// One dialogue line per mission stage, so the bar always has something
// to say while a job is running. Portraits are drawn on a small canvas
// next to the line (Tess in amber, Jace in orange, Dario in violet).
const DIALOGUE = {
  0: [
    { who: 'TESS ALVAREZ', role: 'FIXER', colour: '#ffb45e', line: 'Welcome home, Jace. My sedan is across town — bring her back in one piece.' },
    { who: 'TESS ALVAREZ', role: 'FIXER', colour: '#ffb45e', line: 'Easy does it. The garage is at the marina end — park it where the yellow marker is.' },
  ],
  1: [
    { who: 'JACE MORENO', role: 'WHEELMAN', colour: '#e08a2e', line: 'Package downtown, by the bank. In and out, no fuss.' },
    { who: 'TESS ALVAREZ', role: 'FIXER', colour: '#ffb45e', line: 'One star on your tail — lose them before the drop or the buyer walks.' },
  ],
  2: [
    { who: 'JACE MORENO', role: 'WHEELMAN', colour: '#e08a2e', line: 'A Veloce GT, just sitting at the marina. Too easy.' },
    { who: 'TESS ALVAREZ', role: 'FIXER', colour: '#ffb45e', line: 'Chop shop, east side. And Jace — don’t scratch it. It’s worth more than you are.' },
  ],
  3: [
    { who: 'DARIO VANE', role: 'COUNCILLOR', colour: '#b48ae0', line: 'My crew holds that plaza, Moreno. Come and take it, if you can.' },
    { who: 'TESS ALVAREZ', role: 'FIXER', colour: '#ffb45e', line: 'Hold the plaza till my crew gets there. Twenty seconds feels like forever — I know.' },
  ],
  4: [
    { who: 'JACE MORENO', role: 'WHEELMAN', colour: '#e08a2e', line: 'The bank. The big one. Let’s go.' },
    { who: 'TESS ALVAREZ', role: 'FIXER', colour: '#ffb45e', line: 'Thirty seconds, Jace. Grab the cash and get OUT.' },
    { who: 'TESS ALVAREZ', role: 'FIXER', colour: '#ffb45e', line: 'Three stars! Safehouse, now — don’t stop for anything.' },
  ],
  5: [
    { who: 'DARIO VANE', role: 'COUNCILLOR', colour: '#b48ae0', line: 'The port is mine, Moreno. My guards, my police, my city.' },
    { who: 'JACE MORENO', role: 'WHEELMAN', colour: '#e08a2e', line: 'Time to end this. The bay is mine tonight.' },
    { who: 'TESS ALVAREZ', role: 'FIXER', colour: '#ffb45e', line: 'Escape by car — the whole SBPD is coming. Drive like you mean it.' },
  ],
};

const WEAPON_SLOTS = ['Fists', 'Pistol', 'SMG', 'Shotgun', 'Rifle'];

function drawPortrait(canvas, colour, initial) {
  const c = canvas.getContext('2d');
  const S = canvas.width;
  c.clearRect(0, 0, S, S);
  c.fillStyle = colour;
  c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1a120c';
  c.beginPath(); c.arc(S / 2, S * 0.62, S * 0.22, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(S / 2, S * 0.38, S * 0.16, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f5efe4';
  c.font = `bold ${Math.floor(S * 0.32)}px system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(initial, S / 2, S * 0.4);
}

export function createHud(doc) {
  const el = (id) => doc.getElementById(id);
  const healthFill = el('health-fill');
  const armourFill = el('armour-fill');
  const staminaFill = el('stamina-fill');
  const cashEl = el('cash');
  const starsEl = el('stars');
  const weaponEl = el('weapon');
  const slotsEl = el('weapon-slots');
  const speedEl = el('speed');
  const carEl = el('car-name');
  const gearEl = el('gear');
  const clockEl = el('clock');
  const dayEl = el('day');
  const objectiveEl = el('objective');
  const missionTitleEl = el('mission-title');
  const stageBarEl = el('stage-fill');
  const stageTextEl = el('stage-text');
  const nextEl = el('mission-next');
  const timerEl = el('timer');
  const fareEl = el('fare');
  const hintEl = el('hint');
  const toastEl = el('toast');
  const vignette = el('vignette');
  const radioEl = el('radio');
  const dropsEl = el('drops');
  const repFill = el('rep-fill');
  const repText = el('rep-text');
  const policeEl = el('police-panel');
  const traceText = el('trace-text');
  const districtEl = el('district');
  const dialogueEl = el('dialogue');
  const dialogueWho = el('dialogue-who');
  const dialogueLine = el('dialogue-line');
  const portrait = el('portrait');
  const popupsEl = el('popups');
  const minimap = el('minimap');
  const mctx = minimap.getContext('2d');
  let toastT = 0;

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.remove('hidden');
    toastT = 3;
  }

  function popup(text) {
    const node = doc.createElement('div');
    node.className = 'popup';
    node.textContent = text;
    popupsEl.appendChild(node);
    window.setTimeout(() => node.remove(), 2600);
    while (popupsEl.children.length > 4) popupsEl.firstChild.remove();
  }

  function drawMinimap(state) {
    const S = 220;
    const R = S / 2;
    const scale = S / 800;
    const px = (x) => (x + 400) * scale;
    const pz = (z) => (z + 400) * scale;
    mctx.save();
    mctx.clearRect(0, 0, S, S);
    mctx.beginPath(); mctx.arc(R, R, R - 2, 0, Math.PI * 2); mctx.clip();
    mctx.fillStyle = '#1c2f42';
    mctx.fillRect(0, 0, S, S);
    mctx.fillStyle = '#2a6f8e';
    mctx.fillRect(0, 0, px(-396), S);
    mctx.fillRect(0, pz(366), S, S - pz(366));
    mctx.fillStyle = '#e0c48f';
    mctx.fillRect(px(-396), 0, px(-366) - px(-396), S);
    for (const d of DISTRICTS) {
      mctx.fillStyle = d.colour;
      mctx.globalAlpha = 0.6;
      mctx.fillRect(px(d.x0), pz(d.z0), px(d.x1) - px(d.x0), pz(d.z1) - pz(d.z0));
      mctx.globalAlpha = 1;
    }
    mctx.strokeStyle = 'rgba(245,239,228,0.5)';
    mctx.lineWidth = 1.5;
    for (let i = 0; i <= 12; i += 1) {
      const v = -360 + i * 60;
      mctx.beginPath(); mctx.moveTo(px(v), 0); mctx.lineTo(px(v), S); mctx.stroke();
      mctx.beginPath(); mctx.moveTo(0, pz(v)); mctx.lineTo(S, pz(v)); mctx.stroke();
    }
    mctx.fillStyle = '#39d353';
    for (const d of state.drops) {
      if (d.taken) continue;
      mctx.fillRect(px(d.x) - 1.5, pz(d.z) - 1.5, 3, 3);
    }
    if (state.marker) {
      mctx.fillStyle = '#ffd21f';
      mctx.beginPath(); mctx.arc(px(state.marker.x), pz(state.marker.z), 5, 0, Math.PI * 2); mctx.fill();
      mctx.strokeStyle = '#ffd21f';
      mctx.beginPath(); mctx.arc(px(state.marker.x), pz(state.marker.z), 8, 0, Math.PI * 2); mctx.stroke();
    }
    if (state.fareMarker) {
      mctx.fillStyle = '#39d353';
      mctx.beginPath(); mctx.arc(px(state.fareMarker.x), pz(state.fareMarker.z), 5, 0, Math.PI * 2); mctx.fill();
    }
    mctx.fillStyle = '#3a86ff';
    for (const c of state.cruisers) {
      mctx.beginPath(); mctx.arc(px(c.x), pz(c.z), 3, 0, Math.PI * 2); mctx.fill();
    }
    mctx.fillStyle = '#3a86ff';
    for (const b of state.roadblocks || []) {
      mctx.fillRect(px(b.x) - 3, pz(b.z) - 3, 6, 6);
    }
    mctx.save();
    mctx.translate(px(state.player.x), pz(state.player.z));
    mctx.rotate(-state.player.heading);
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(0, -7); mctx.lineTo(5, 6); mctx.lineTo(-5, 6); mctx.closePath();
    mctx.fill();
    mctx.restore();
    mctx.restore();
    mctx.strokeStyle = 'rgba(245,239,228,0.7)';
    mctx.lineWidth = 2;
    mctx.beginPath(); mctx.arc(R, R, R - 2, 0, Math.PI * 2); mctx.stroke();
    // North tick.
    mctx.fillStyle = '#ffd21f';
    mctx.font = 'bold 11px system-ui, sans-serif';
    mctx.textAlign = 'center';
    mctx.fillText('N', R, 14);
  }

  function update(dt, state) {
    if (toastT > 0) {
      toastT -= dt;
      if (toastT <= 0) toastEl.classList.add('hidden');
    }
    healthFill.style.width = `${Math.max(0, state.health)}%`;
    armourFill.style.width = `${Math.max(0, state.armour)}%`;
    staminaFill.style.width = `${Math.max(0, state.stamina ?? 100)}%`;
    cashEl.textContent = `$${Math.floor(state.cash).toLocaleString('en-US')}`;
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < state.stars ? '★' : '☆';
    starsEl.textContent = stars;
    starsEl.classList.toggle('hot', state.stars > 0);
    // Weapon slots: fists + pistol live, SMG / shotgun / rifle locked
    // until the armoury opens them (Builder B's combat pass).
    const owned = { Fists: true, Pistol: state.weaponName !== 'Fists' };
    slotsEl.innerHTML = '';
    WEAPON_SLOTS.forEach((name, i) => {
      const span = doc.createElement('span');
      const active = (i === 0 && state.weaponName === 'Fists') || (i === 1 && state.weaponName !== 'Fists');
      const locked = i >= 2;
      span.className = `slot${active ? ' active' : ''}${locked ? ' locked' : ''}`;
      span.textContent = locked ? `${i + 1} ${name} 🔒` : `${i + 1} ${name}${i === 1 ? ` ${state.ammoText}` : ''}`;
      slotsEl.appendChild(span);
    });
    weaponEl.textContent = state.inCar ? '—' : `${state.weaponName}  ${state.ammoText}`;
    // Car panel: name, condition bar, gear, big speed.
    if (state.inCar && state.carName) {
      carEl.textContent = `${state.carName} — CONDITION ${Math.max(0, Math.round(state.carCondition ?? 100))}%`;
      gearEl.textContent = state.gear || '';
      speedEl.textContent = `${Math.round(Math.abs(state.speed) * 3.6)} km/h`;
    } else {
      carEl.textContent = state.inCar ? '' : 'ON FOOT';
      gearEl.textContent = '';
      speedEl.textContent = state.inCar ? `${Math.round(Math.abs(state.speed) * 3.6)} km/h` : '';
    }
    const mins = 18 * 60 + 42 + Math.floor(state.time / 10);
    dayEl.textContent = `DAY 1 · ${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    clockEl.textContent = dayEl.textContent;
    // Mission panel: number + name, stage bar, next line, district tag.
    if (state.mission) {
      missionTitleEl.textContent = `MISSION ${state.mission.index + 1}/6 · ${state.mission.name.toUpperCase()}`;
      const total = state.mission.stages;
      const done = state.mission.stage;
      stageBarEl.style.width = `${Math.round((done / total) * 100)}%`;
      stageTextEl.textContent = `STAGE ${done + 1}/${total}`;
      nextEl.textContent = state.mission.next ? `NEXT: ${state.mission.next}` : '';
    } else {
      missionTitleEl.textContent = 'FREE ROAM — SOLMAR BAY';
      stageBarEl.style.width = '0%';
      stageTextEl.textContent = '';
      nextEl.textContent = 'Pick a mission from the title screen, or explore.';
    }
    const d = districtAt(state.player.x, state.player.z);
    districtEl.textContent = `${d.name} — ${d.tag}`;
    objectiveEl.textContent = state.objective;
    if (state.timer != null) {
      timerEl.textContent = `⏱ ${Math.ceil(state.timer)}s`;
      timerEl.classList.remove('hidden');
    } else timerEl.classList.add('hidden');
    if (state.fare) {
      fareEl.textContent = `${state.fare.text} — ${state.fare.timer}s`;
      fareEl.classList.remove('hidden');
    } else fareEl.classList.add('hidden');
    hintEl.textContent = state.hint;
    dropsEl.textContent = `Cash drops ${state.dropsGot}/${CASH_DROP_COUNT}`;
    radioEl.textContent = state.muted ? 'MUTED' : `SOLMAR FM 88.1 · ${state.radioTrack || 'Neon Drive — Pink Horizon'}`;
    // REP bar with tier name.
    if (state.rep) {
      repFill.style.width = `${Math.round(state.rep.frac * 100)}%`;
      repText.textContent = state.rep.next
        ? `REP ${state.rep.tier.level} · ${state.rep.tier.name}  ${state.rep.into}/${state.rep.need}`
        : `REP ${state.rep.tier.level} · ${state.rep.tier.name} — MAX`;
    }
    // Police response panel: named units with distance + state.
    const units = state.units || [];
    if (state.stars > 0 && units.length > 0) {
      policeEl.classList.remove('hidden');
      let html = `<div class="police-head">SBPD RESPONSE — ${units.length} UNIT${units.length > 1 ? 'S' : ''} · CODE ${state.stars}</div>`;
      for (const u of units) {
        html += `<div class="police-row"><span>${u.callsign}</span><span>${u.dist}m</span><span class="police-state">${u.state}</span></div>`;
      }
      html += `<div class="trace-row"><span>TRACE ${state.trace}%</span><div class="trace-bar"><div id="trace-fill" style="width:${state.trace}%"></div></div></div>`;
      html += `<div class="police-note">Search zone follows you — break line of sight to cool off.</div>`;
      policeEl.innerHTML = html;
      traceText.textContent = `TRACE ${state.trace}%`;
    } else {
      policeEl.classList.add('hidden');
      traceText.textContent = state.stars > 0 ? `TRACE ${state.trace}%` : '';
    }
    // Dialogue bar with a canvas-drawn portrait.
    const dlg = state.mission ? (DIALOGUE[state.mission.index]?.[state.mission.stage] ?? null) : null;
    if (dlg) {
      dialogueEl.classList.remove('hidden');
      dialogueWho.textContent = `${dlg.who} — ${dlg.role}`;
      dialogueLine.textContent = `“${dlg.line}”`;
      drawPortrait(portrait, dlg.colour, dlg.who[0]);
    } else {
      dialogueEl.classList.add('hidden');
    }
    vignette.style.opacity = String(Math.max(0, 1 - state.health / 45) * 0.55 + state.flash);
    drawMinimap(state);
  }

  return { update, toast, popup };
}
