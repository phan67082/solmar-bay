// The full-screen city map: district map with a route line to the
// objective, the six story missions with payouts and states, side jobs,
// a legend, and the player's stats. It is a DOM overlay (a canvas for
// the map itself, DOM lists around it) opened with M or from the pause
// menu, and it pauses the sim while it is up — the same way the pause
// menu does. District shapes are rectangles over the 12x12 grid, so
// the minimap in hud.js can reuse districtAt() for its labels.
import { MISSIONS } from './missions.js';
import { SKILL_NAMES } from './progression.js';

// Shift a #rrggbb colour by n per channel, clamped — the per-block
// shade variation that keeps the map from reading as flat colour.
function shade(hex, n) {
  const r = Math.max(0, Math.min(255, parseInt(hex.slice(1, 3), 16) + n));
  const g = Math.max(0, Math.min(255, parseInt(hex.slice(3, 5), 16) + n));
  const b = Math.max(0, Math.min(255, parseInt(hex.slice(5, 7), 16) + n));
  return `rgb(${r},${g},${b})`;
}

export const DISTRICTS = [
  { name: 'BEACHFRONT', tag: 'Sun, sand and fast cars on the strip', x0: -396, x1: -360, z0: -396, z1: 400, colour: '#e0c48f' },
  { name: 'DOWNTOWN', tag: 'Glass towers and the bank', x0: -180, x1: 180, z0: -180, z1: 60, colour: '#7d8aa8', lx: 160, lz: -165 },
  { name: 'OLD TOWN', tag: 'Narrow streets, old money', x0: -360, x1: -180, z0: -360, z1: -60, colour: '#a89a80' },
  { name: 'PLAZA', tag: 'The fountain at the heart of the bay', x0: -60, x1: 0, z0: -60, z1: 0, colour: '#c9b489' },
  { name: 'HILLSIDE', tag: 'Winding roads above the bay', x0: 180, x1: 396, z0: -360, z1: -60, colour: '#7fae62' },
  { name: 'MARINA', tag: 'Yachts, chop shops and salt air', x0: -360, x1: 120, z0: 300, z1: 400, colour: '#4f8aa8' },
  { name: 'PORT', tag: "Vane's docks — keep your head down", x0: 120, x1: 396, z0: 240, z1: 400, colour: '#8a6f4f' },
  { name: 'INDUSTRIAL', tag: 'Warehouses and container yards', x0: 180, x1: 396, z0: 60, z1: 240, colour: '#6e6e72', lx: 215, lz: 100 },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
  }
  return DISTRICTS[1];
}

const LEGEND = [
  ['◆', '#ffd21f', 'Story contact / objective'],
  ['▲', '#ffffff', 'You'],
  ['●', '#3a86ff', 'Police'],
  ['■', '#39d353', 'Taxi fare / destination'],
  ['✦', '#39d353', 'Cash drop'],
  ['⌂', '#ffb45e', 'Safehouse — Tess’s garage'],
  ['⚙', '#ff9d5c', 'Garage upgrades'],
  ['✚', '#ff5a5a', 'Hospital'],
  ['⚑', '#e5534b', 'Street race'],
  ['↗', '#7dd87d', 'Stunt jump'],
];

const SIDE_JOBS = [
  { name: 'Taxi fares', state: (s) => `${s.faresDone} done — hail a waving passenger` },
  { name: 'Package deliveries', state: (s) => `${s.deliveriesDone ?? 0} done — pick up the glowing parcel` },
  { name: 'Street races', state: (s) => `${s.racesWon ?? 0}/3 won — gates at Beachfront, Marina, Downtown` },
  { name: 'Stunt jumps', state: (s) => `${s.stuntsDone ?? 0}/3 cleared — +$200 a clear` },
  { name: 'Cash drops', state: (s) => `${s.dropsGot}/20 found — +$50 each, +$500 for all 20` },
];

export function createMap(doc, getState) {
  const root = doc.getElementById('map-screen');
  const canvas = doc.getElementById('map-canvas');
  const ctx = canvas.getContext('2d');
  const missionList = doc.getElementById('map-missions');
  const statsEl = doc.getElementById('map-stats');
  const legendEl = doc.getElementById('map-legend');
  const sideEl = doc.getElementById('map-side');
  const titleEl = doc.getElementById('map-title');
  let open = false;
  let tab = 'map';

  function drawMap(s) {
    const W = canvas.width;
    const H = canvas.height;
    const scale = Math.min(W / 800, H / 800);
    const ox = (W - 800 * scale) / 2;
    const oy = (H - 800 * scale) / 2;
    const px = (x) => ox + (x + 400) * scale;
    const pz = (z) => oy + (z + 400) * scale;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#101820';
    ctx.fillRect(0, 0, W, H);
    // Sea west, marina water south.
    ctx.fillStyle = '#1d5a74';
    ctx.fillRect(0, 0, px(-396), H);
    ctx.fillRect(0, pz(366), W, H - pz(366));
    // Districts, coloured.
    for (const d of DISTRICTS) {
      ctx.fillStyle = d.colour;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(px(d.x0), pz(d.z0), px(d.x1) - px(d.x0), pz(d.z1) - pz(d.z0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0e1418';
      ctx.font = `bold ${Math.max(11, 13 * scale)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      // The label sits at the district's label point (lx/lz when set)
      // instead of the bare centre: DOWNTOWN's centre sits almost on
      // top of PLAZA's, and the two names used to print over each other.
      // The label x is clamped inside the canvas so thin districts
      // like BEACHFRONT don't print half off the edge, and every label
      // gets a light halo so it reads on dark and light ground alike.
      const labelCX = Math.max(70, Math.min(W - 70, px(d.lx ?? (d.x0 + d.x1) / 2)));
      const labelCY = pz(d.lz ?? (d.z0 + d.z1) / 2);
      ctx.strokeStyle = 'rgba(245,239,228,0.85)';
      ctx.lineWidth = 3;
      ctx.strokeText(d.name, labelCX, labelCY);
      ctx.fillText(d.name, labelCX, labelCY);
    }
    // City blocks: every 60 m block gets its own shade from a small
    // seeded hash off its grid indices, so the map reads as built-up
    // blocks instead of flat district colour.
    for (let bx = 0; bx < 12; bx += 1) {
      for (let bz = 0; bz < 12; bz += 1) {
        const cx = -330 + bx * 60;
        const cz = -330 + bz * 60;
        const d = districtAt(cx, cz);
        const h = ((bx * 31 + bz * 17) % 5) - 2; // -2..2
        ctx.fillStyle = shade(d.colour, h * 7);
        ctx.globalAlpha = 0.5;
        ctx.fillRect(px(cx - 27), pz(cz - 27), 54 * scale, 54 * scale);
      }
    }
    ctx.globalAlpha = 1;
    // Minor streets halfway between the main roads, thin and faint.
    ctx.strokeStyle = 'rgba(245,239,228,0.28)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i += 1) {
      const v = -330 + i * 60;
      ctx.beginPath(); ctx.moveTo(px(v), 0); ctx.lineTo(px(v), H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, pz(v)); ctx.lineTo(W, pz(v)); ctx.stroke();
    }
    // Streets.
    ctx.strokeStyle = 'rgba(245,239,228,0.55)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 12; i += 1) {
      const v = -360 + i * 60;
      ctx.beginPath(); ctx.moveTo(px(v), 0); ctx.lineTo(px(v), H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, pz(v)); ctx.lineTo(W, pz(v)); ctx.stroke();
    }
    // Street-name labels along the main roads, dark-haloed so they read
    // on light and dark ground alike.
    ctx.font = `bold ${Math.max(10, 11 * scale)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const roadLabel = (text, x, y, vertical) => {
      ctx.save();
      ctx.translate(x, y);
      if (vertical) ctx.rotate(-Math.PI / 2);
      ctx.strokeStyle = 'rgba(14,20,24,0.9)';
      ctx.lineWidth = 3;
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = 'rgba(245,239,228,0.9)';
      ctx.fillText(text, 0, 0);
      ctx.restore();
    };
    roadLabel('BOULEVARD', px(-360) + 10, pz(60), true);
    roadLabel('PALM AVE', px(0) + 10, pz(-180), true);
    roadLabel('HILL RD', px(300) + 10, pz(120), true);
    roadLabel('BANK ST', px(60), pz(-120) - 9, false);
    roadLabel('MARINA DR', px(-60), pz(330) - 9, false);
    roadLabel('PORT RD', px(240), pz(270) - 9, false);
    ctx.textBaseline = 'alphabetic';
    // Grid coordinates along the edges.
    ctx.fillStyle = '#cbb98f';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    for (let i = 0; i <= 12; i += 1) {
      const v = -360 + i * 60;
      ctx.fillText(String(v), px(v) + 2, 12);
      ctx.fillText(String(v), 4, pz(v) - 2);
    }
    // Garage / safehouse.
    ctx.fillStyle = '#ffb45e';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText('⌂', px(150) - 7, pz(180) + 5);
    // Cash drops.
    ctx.fillStyle = '#39d353';
    for (const d of s.drops || []) {
      if (d.taken) continue;
      ctx.fillRect(px(d.x) - 2, pz(d.z) - 2, 4, 4);
    }
    // Route line from the player to the objective.
    if (s.marker) {
      ctx.strokeStyle = '#ffd21f';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(px(s.player.x), pz(s.player.z));
      ctx.lineTo(px(s.marker.x), pz(s.marker.z));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffd21f';
      ctx.beginPath(); ctx.arc(px(s.marker.x), pz(s.marker.z), 7, 0, Math.PI * 2); ctx.fill();
      // GPS distance: printed on the far side of the marker from the
      // player, with a dark backing, so it never sits on the player
      // arrow or the route line.
      ctx.fillStyle = '#0e1418';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const gps = Math.round(Math.hypot(s.marker.x - s.player.x, s.marker.z - s.player.z));
      const gx = s.marker.x - s.player.x;
      const gz = s.marker.z - s.player.z;
      const gl = Math.hypot(gx, gz) || 1;
      const labelX = px(s.marker.x) + (gx / gl) * 26;
      const labelY = pz(s.marker.z) + (gz / gl) * 26;
      const label = `${gps}m`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(14,20,24,0.85)';
      ctx.fillRect(labelX - tw / 2 - 4, labelY - 14, tw + 8, 16);
      ctx.fillStyle = '#ffd21f';
      ctx.fillText(label, labelX, labelY - 2);
    }
    // Police blips.
    ctx.fillStyle = '#3a86ff';
    for (const c of s.cruisers || []) {
      ctx.beginPath(); ctx.arc(px(c.x), pz(c.z), 4, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow.
    ctx.save();
    ctx.translate(px(s.player.x), pz(s.player.z));
    ctx.rotate(-s.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(-7, 8); ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px(s.player.x), pz(s.player.z), 12, 0, Math.PI * 2); ctx.stroke();
  }

  // One mission-list builder for both tabs: the MISSIONS tab has the
  // full list, and the MAP tab carries the same six rows in its left
  // column, so the map never hides what is left to do.
  function fillMissionList(listEl, s) {
    listEl.innerHTML = '';
    MISSIONS.forEach((m, i) => {
      const row = doc.createElement('div');
      row.className = 'map-row';
      const state = i < s.missionsDone ? '✓ COMPLETE' : i === s.currentMission ? '▶ IN PROGRESS' : i <= s.unlocked ? '○ AVAILABLE' : '🔒 LOCKED';
      row.innerHTML = `<span class="map-row-name">${i + 1}. ${m.name}</span><span class="map-row-pay">$${m.reward.toLocaleString('en-US')}</span><span class="map-row-state">${state}</span>`;
      listEl.appendChild(row);
    });
  }

  function render() {
    const s = getState();
    if (!s) return;
    const d = districtAt(s.player.x, s.player.z);
    titleEl.textContent = `SOLMAR BAY — ${d.name} · ${d.tag}`;
    // Mission list with payouts and states, on the MISSIONS tab and
    // on the MAP tab's left column.
    fillMissionList(missionList, s);
    const mapMissionsEl = doc.getElementById('map-missions-map');
    if (mapMissionsEl) fillMissionList(mapMissionsEl, s);
    // Save-slot line with the live completion percentage.
    const saveSlotEl = doc.getElementById('map-save-slot');
    if (saveSlotEl) saveSlotEl.textContent = `SAVE SLOT 1 — ${s.completion}% COMPLETE`;
    // Skills pips panel for the STATS tab, straight from progression.
    const skillsEl = doc.getElementById('map-skills');
    if (skillsEl) {
      const p = s.progression;
      const pips = (n) => '●'.repeat(n) + '○'.repeat(5 - n);
      skillsEl.innerHTML = SKILL_NAMES.map((name) =>
        `<div class="map-row"><span>${name.toUpperCase()}</span><b>${pips(p.skills[name])} · ${p.practice[name] ?? 0} XP</b></div>`).join('');
    }
    // Side jobs.
    sideEl.innerHTML = '';
    for (const j of SIDE_JOBS) {
      const row = doc.createElement('div');
      row.className = 'map-row';
      row.innerHTML = `<span class="map-row-name">${j.name}</span><span class="map-row-state">${j.state(s)}</span>`;
      sideEl.appendChild(row);
    }
    // Legend.
    legendEl.innerHTML = '';
    for (const [mark, colour, label] of LEGEND) {
      const row = doc.createElement('div');
      row.className = 'map-row';
      row.innerHTML = `<span style="color:${colour};font-weight:800;width:22px;display:inline-block">${mark}</span><span>${label}</span>`;
      legendEl.appendChild(row);
    }
    // Stats panel (shown on the map tab and mirrored on the STATS tab).
    const p = s.progression;
    const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const statsHtml =
      `<div class="map-row"><span>Cash</span><b>$${Math.floor(s.cash).toLocaleString('en-US')}</b></div>` +
      `<div class="map-row"><span>REP</span><b>${p.tier.level} · ${p.tier.name} — ${p.rep} REP</b></div>` +
      // Skills sit third, not last: the right column scrolls, and the
      // last rows can fall below the fold — the fold should only ever
      // hide the least important row (Cash drops), never the pips.
      `<div class="map-row"><span>Skills</span><b>Drive ${'●'.repeat(p.skills.Driving)}${'○'.repeat(5 - p.skills.Driving)} · Shoot ${'●'.repeat(p.skills.Shooting)}${'○'.repeat(5 - p.skills.Shooting)} · Stam ${'●'.repeat(p.skills.Stamina)}${'○'.repeat(5 - p.skills.Stamina)}</b></div>` +
      `<div class="map-row"><span>Completion</span><b>${s.completion}%</b></div>` +
      `<div class="map-row"><span>Save slot</span><b>SAVE SLOT 1 — ${s.completion}% COMPLETE</b></div>` +
      `<div class="map-row"><span>Time played</span><b>${fmt(s.timePlayed)}</b></div>` +
      `<div class="map-row"><span>Cars stolen</span><b>${p.stats.carsStolen}</b></div>` +
      `<div class="map-row"><span>Takedowns</span><b>${p.stats.takedowns}</b></div>` +
      `<div class="map-row"><span>Escapes</span><b>${p.stats.escapes}</b></div>` +
      `<div class="map-row"><span>Taxi fares</span><b>${s.faresDone} done · $${s.taxiEarned.toLocaleString('en-US')}</b></div>` +
      `<div class="map-row"><span>Deliveries</span><b>${s.deliveriesDone ?? 0} done · $${(s.deliveryEarned ?? 0).toLocaleString('en-US')}</b></div>` +
      `<div class="map-row"><span>Street races</span><b>${s.racesWon ?? 0}/3 won</b></div>` +
      `<div class="map-row"><span>Stunt jumps</span><b>${s.stuntsDone ?? 0}/3 cleared</b></div>` +
      `<div class="map-row"><span>Cash drops</span><b>${s.dropsGot}/20</b></div>`;
    statsEl.innerHTML = statsHtml;
    const dup = doc.getElementById('map-stats-dup');
    if (dup) dup.innerHTML = statsHtml;
    drawMap(s);
  }

  function show() {
    open = true;
    root.classList.remove('hidden');
    render();
  }

  function hide() {
    open = false;
    root.classList.add('hidden');
  }

  function setTab(next) {
    tab = next;
    for (const b of doc.querySelectorAll('#map-screen .map-tab')) {
      b.classList.toggle('active', b.dataset.tab === tab);
    }
    doc.getElementById('map-tab-map').classList.toggle('hidden', tab !== 'map');
    doc.getElementById('map-tab-missions').classList.toggle('hidden', tab !== 'missions');
    doc.getElementById('map-tab-stats').classList.toggle('hidden', tab !== 'stats');
    if (tab === 'map') render();
  }

  for (const b of doc.querySelectorAll('#map-screen .map-tab')) {
    b.addEventListener('click', () => setTab(b.dataset.tab));
  }
  doc.getElementById('btn-map-close').addEventListener('click', hide);

  return {
    get isOpen() { return open; },
    show, hide, render, setTab,
  };
}
