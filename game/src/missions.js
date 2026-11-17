// The story: six missions with briefings, objectives, markers and cash
// rewards. Builder 1 ships the data, the objective banner and the
// mission-select flow; Builder 2 wires the full stage-by-stage mission
// logic, failure and retry. Free roam is always available.
export const MISSIONS = [
  {
    name: 'Homecoming',
    briefing: "Jace is out. Tess needs her sedan back at the garage — drive it across town, learn the streets, and don't scratch the paint.",
    objectives: ['Pick up Tess\'s sedan', 'Drive to Tess\'s garage'],
    reward: 200,
    marker: { x: 150, z: 210 },
  },
  {
    name: 'The Pickup',
    briefing: 'A package is waiting on the rooftop car park downtown. Grab it, then lose the one-star tail before the drop.',
    objectives: ['Collect the package downtown', 'Escape the pursuit to the drop point'],
    reward: 350,
    marker: { x: 90, z: -90 },
  },
  {
    name: 'Hot Wheels',
    briefing: 'A sports car is parked at the marina, owner nowhere in sight. Steal it, deliver it to the chop shop, keep it in one piece.',
    objectives: ['Steal the sports car at the marina', 'Deliver it to the chop shop'],
    reward: 500,
    marker: { x: -180, z: 330 },
  },
  {
    name: 'Street Sweep',
    briefing: "Vane's crew is holding the plaza. Clear them out on foot and hold it until Tess's crew arrives.",
    objectives: ['Clear the rival crew from the plaza', 'Hold the plaza'],
    reward: 600,
    marker: { x: -30, z: -30 },
  },
  {
    name: 'Bank on It',
    briefing: 'The big job: hit Solmar National Bank, grab the cash before the timer runs out, then a three-star getaway to the safehouse.',
    objectives: ['Reach the bank', 'Grab the cash (timed)', 'Escape to the safehouse'],
    reward: 1500,
    marker: { x: 90, z: -90 },
  },
  {
    name: 'King of the Bay',
    briefing: 'The finale: drive to the port, shoot through Vane\'s guards, and escape by car as the police close in. End this.',
    objectives: ['Drive to the port', 'Fight through Vane\'s guards', 'Escape by car'],
    reward: 3000,
    marker: { x: 240, z: 330 },
  },
];

export function createMissions() {
  let unlocked = 0; // highest unlocked mission index
  let current = -1; // -1 = free roam
  let stage = 0;
  let override = null; // screenshot scenes set the banner text directly

  function objectiveText() {
    if (override) return override;
    if (current < 0) return 'Free roam — explore Solmar Bay';
    const m = MISSIONS[current];
    return `${m.name}: ${m.objectives[Math.min(stage, m.objectives.length - 1)]}`;
  }

  function marker() {
    if (current < 0) return null;
    return MISSIONS[current].marker;
  }

  function start(index) {
    if (index < 0 || index > unlocked || index >= MISSIONS.length) return false;
    current = index;
    stage = 0;
    return true;
  }

  function advance() {
    if (current < 0) return false;
    stage += 1;
    if (stage >= MISSIONS[current].objectives.length) {
      const reward = MISSIONS[current].reward;
      unlocked = Math.min(MISSIONS.length - 1, current + 1);
      current = -1;
      stage = 0;
      return { done: true, reward };
    }
    return { done: false };
  }

  function quitToFreeRoam() {
    current = -1;
    stage = 0;
    override = null;
  }

  return {
    get unlocked() { return unlocked; },
    get current() { return current; },
    get stage() { return stage; },
    objectiveText,
    marker,
    start,
    advance,
    quitToFreeRoam,
    setObjectiveOverride(text) { override = text; },
    setUnlocked(n) { unlocked = Math.max(0, Math.min(MISSIONS.length - 1, n)); },
  };
}
