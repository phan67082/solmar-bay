// Mission briefing / chapter card: a full-screen card shown when a
// story mission starts from the title screen — chapter number, mission
// name, the contact's canvas portrait (the same drawPortrait the HUD
// dialogue bar uses), the briefing text, payout and objective line.
// Space continues into the mission; Esc skips the card (the mission
// starts either way — Esc only dismisses the card). Shot scenes can
// open it directly through window.__solmar.openBriefing(index).
import { MISSIONS } from './missions.js';
import { drawPortrait } from './hud.js';

// Who hands Jace each job: Tess runs the first jobs, Dario is the face
// of the plaza and bank jobs, and the finale goes back to Dario — the
// man Jace has to take down.
const CONTACTS = [
  { who: 'TESS ALVAREZ', role: 'FIXER', colour: '#ffb45e' },
  { who: 'TESS ALVAREZ', role: 'FIXER', colour: '#ffb45e' },
  { who: 'TESS ALVAREZ', role: 'FIXER', colour: '#ffb45e' },
  { who: 'DARIO VANE', role: 'COUNCILLOR', colour: '#b48ae0' },
  { who: 'TESS ALVAREZ', role: 'FIXER', colour: '#ffb45e' },
  { who: 'DARIO VANE', role: 'COUNCILLOR', colour: '#b48ae0' },
];

export function createBriefing(doc, hooks) {
  const root = doc.getElementById('briefing-screen');
  const chapterEl = doc.getElementById('briefing-chapter');
  const nameEl = doc.getElementById('briefing-name');
  const portrait = doc.getElementById('briefing-portrait');
  const whoEl = doc.getElementById('briefing-who');
  const textEl = doc.getElementById('briefing-text');
  const payoutEl = doc.getElementById('briefing-payout');
  const objectiveEl = doc.getElementById('briefing-objective');
  const goBtn = doc.getElementById('btn-briefing-go');
  let open = false;
  let pending = -1;

  function show(mission, index) {
    const contact = CONTACTS[index] || CONTACTS[0];
    pending = index;
    chapterEl.textContent = `CHAPTER ${index + 1} OF ${MISSIONS.length}`;
    nameEl.textContent = mission.name.toUpperCase();
    whoEl.textContent = `${contact.who} — ${contact.role}`;
    textEl.textContent = `“${mission.briefing}”`;
    payoutEl.textContent = `PAYOUT $${mission.reward.toLocaleString('en-US')} · +${Math.round(150 + mission.reward / 10)} REP`;
    objectiveEl.textContent = `OBJECTIVE: ${mission.objectives[0]}`;
    drawPortrait(portrait, contact.colour, contact.who[0]);
    root.classList.remove('hidden');
    open = true;
  }

  function hide() {
    root.classList.add('hidden');
    open = false;
  }

  function cont() {
    if (!open || pending < 0) return;
    const index = pending;
    hide();
    if (hooks && hooks.onContinue) hooks.onContinue(index);
  }

  goBtn.addEventListener('click', cont);
  doc.addEventListener('keydown', (ev) => {
    if (!open) return;
    if (ev.code === 'Space' || ev.code === 'Escape') {
      ev.preventDefault();
      cont();
    }
  });

  return {
    get isOpen() { return open; },
    show, hide,
  };
}
