// Progression and stats: REP tiers with names, three skills that grow
// with use, and the lifetime stats the map screen and the pause screen
// show (missions done, cash earned, cars stolen, takedowns, escapes,
// time played, completion). Everything here is plain data plus small
// pure helpers, so the save file can hold it and an old v1 save (which
// has none of it) still loads with sensible defaults.
export const REP_TIERS = [
  { level: 1, name: 'ROOKIE', at: 0 },
  { level: 2, name: 'STREET', at: 150 },
  { level: 3, name: 'KNOWN DRIVER', at: 400 },
  { level: 4, name: 'BAY HUSTLER', at: 800 },
  { level: 5, name: 'WHEELMAN', at: 1400 },
  { level: 6, name: 'TIDE RUNNER', at: 2200 },
  { level: 7, name: 'KING OF THE BAY', at: 3200 },
];

export const SKILL_NAMES = ['Driving', 'Shooting', 'Stamina'];

export function tierForRep(rep) {
  let tier = REP_TIERS[0];
  for (const t of REP_TIERS) if (rep >= t.at) tier = t;
  return tier;
}

export function repProgress(rep) {
  const tier = tierForRep(rep);
  const next = REP_TIERS.find((t) => t.at > rep);
  if (!next) return { tier, next: null, into: rep - tier.at, need: 0, frac: 1 };
  return { tier, next, into: rep - tier.at, need: next.at - tier.at, frac: (rep - tier.at) / (next.at - tier.at) };
}

export function createProgression(saved) {
  const s = saved && typeof saved === 'object' ? saved : {};
  let rep = typeof s.rep === 'number' ? s.rep : 0;
  const skills = {
    Driving: Math.max(0, Math.min(5, s.skills?.Driving ?? 0)),
    Shooting: Math.max(0, Math.min(5, s.skills?.Shooting ?? 0)),
    Stamina: Math.max(0, Math.min(5, s.skills?.Stamina ?? 0)),
  };
  const stats = {
    missionsDone: s.missionsDone ?? 0,
    cashEarned: s.cashEarned ?? 0,
    carsStolen: s.carsStolen ?? 0,
    takedowns: s.takedowns ?? 0,
    escapes: s.escapes ?? 0,
    faresDone: s.fares ?? 0,
    taxiEarned: s.taxiEarned ?? 0,
    deliveriesDone: s.deliveriesDone ?? 0,
    deliveryEarned: s.deliveryEarned ?? 0,
    racesWon: s.racesWon ?? 0,
    stuntsDone: s.stuntsDone ?? 0,
    dropsGot: s.dropsGot ?? (Array.isArray(s.drops) ? s.drops.length : 0),
    timePlayed: s.timePlayed ?? s.time ?? 0,
  };
  // Skill pips grow from use, one pip per 25 units of practice, capped at 5.
  const practice = {
    Driving: s.practice?.Driving ?? 0,
    Shooting: s.practice?.Shooting ?? 0,
    Stamina: s.practice?.Stamina ?? 0,
  };

  function addRep(n) {
    const before = tierForRep(rep);
    rep = Math.max(0, rep + n);
    return tierForRep(rep).level > before.level;
  }

  function addPractice(skill, n) {
    if (!(skill in practice)) return false;
    practice[skill] += n;
    const pips = Math.min(5, Math.floor(practice[skill] / 25));
    if (pips > skills[skill]) { skills[skill] = pips; return true; }
    return false;
  }

  function completionPercent(unlocked, missionsTotal) {
    const story = Math.round(((stats.missionsDone) / Math.max(1, missionsTotal)) * 100);
    const drops = Math.round((stats.dropsGot / 20) * 100);
    return Math.round(story * 0.8 + drops * 0.2);
  }

  function toSave() {
    return {
      rep,
      skills: { ...skills },
      practice: { ...practice },
      missionsDone: stats.missionsDone,
      cashEarned: stats.cashEarned,
      carsStolen: stats.carsStolen,
      takedowns: stats.takedowns,
      escapes: stats.escapes,
      fares: stats.faresDone,
      taxiEarned: stats.taxiEarned,
      deliveriesDone: stats.deliveriesDone,
      deliveryEarned: stats.deliveryEarned,
      racesWon: stats.racesWon,
      stuntsDone: stats.stuntsDone,
      timePlayed: stats.timePlayed,
    };
  }

  return {
    get rep() { return rep; },
    get tier() { return tierForRep(rep); },
    get progress() { return repProgress(rep); },
    skills,
    stats,
    practice,
    addRep,
    addPractice,
    completionPercent,
    toSave,
    reset() {
      rep = 0;
      for (const k of Object.keys(skills)) skills[k] = 0;
      for (const k of Object.keys(practice)) practice[k] = 0;
      for (const k of Object.keys(stats)) stats[k] = 0;
    },
  };
}
