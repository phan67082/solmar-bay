// Tess's garage: the upgrade shop. Four upgrade lines per car —
// ENGINE, ARMOUR, NITRO, RESPRAY — with prices and REP gates, pips for
// owned tiers, and the car on a lift in the corner. Purchases are real:
// they take cash, check REP, persist in the save through the callbacks
// main.js supplies, and RESPRAY clears the wanted level on the spot.
// The shop is a DOM overlay opened with G near the garage or from the
// pause menu; the game is paused while it is up.
import { CAR_TYPES } from './config.js';

export const GARAGE_POS = { x: 150, z: 180 };

export const GARAGE_CARS = [
  { type: 'hatchback', price: 800, top: 24, desc: 'Nippy city runabout' },
  { type: 'sedan', price: 1400, top: 28, desc: 'Tess’s workhorse' },
  { type: 'taxi', price: 1800, top: 26, desc: 'Fares pay for themselves' },
  { type: 'pickup', price: 2200, top: 24, desc: 'Built to take a hit' },
  { type: 'sports', price: 5200, top: 38, desc: 'Veloce GT — the fastest in the bay' },
  { type: 'van', price: 1600, top: 22, desc: 'Room for the whole crew' },
];

export const UPGRADES = [
  { kind: 'engine', name: 'ENGINE', desc: '+top speed, sharper throttle', prices: [1800, 3200, 5000], rep: [0, 3, 5] },
  { kind: 'armour', name: 'ARMOUR', desc: 'Soaks damage, shrugs off rams', prices: [2000, 3600, 5200], rep: [0, 3, 5] },
  { kind: 'nitro', name: 'NITRO', desc: 'Short speed bursts (hold Shift)', prices: [2400, 4200, 0], rep: [2, 4, 99] },
  { kind: 'respray', name: 'RESPRAY', desc: 'New paint — clears your wanted level', prices: [600, 600, 600], rep: [0, 0, 0] },
];

export function createGarage(doc, getState, hooks) {
  const root = doc.getElementById('garage-screen');
  const carList = doc.getElementById('garage-cars');
  const upList = doc.getElementById('garage-upgrades');
  const cashEl = doc.getElementById('garage-cash');
  const noteEl = doc.getElementById('garage-note');
  let open = false;
  let selected = 'sports';

  function ownedCars() { return getState().garage.owned; }
  function upgrades() { return getState().garage.upgrades; }

  function render() {
    const s = getState();
    const cash = s.cash;
    const repLevel = s.progression.tier.level;
    cashEl.textContent = `Cash $${Math.floor(cash).toLocaleString('en-US')} · REP ${repLevel} · ${s.progression.tier.name}`;
    carList.innerHTML = '';
    for (const c of GARAGE_CARS) {
      const spec = CAR_TYPES[c.type];
      const owned = ownedCars().includes(c.type);
      const btn = doc.createElement('button');
      btn.className = `garage-car${selected === c.type ? ' selected' : ''}${owned ? ' owned' : ''}`;
      btn.innerHTML = `<b>${spec.name}</b> — ${c.desc}<br>Top ${c.top * 3.6 | 0} km/h · ${owned ? 'OWNED — your garage keeps it' : `BUY $${c.price.toLocaleString('en-US')}`}`;
      btn.addEventListener('click', () => {
        if (owned) { selected = c.type; render(); return; }
        if (cash < c.price) { noteEl.textContent = `Not enough cash for the ${spec.name} — $${c.price.toLocaleString('en-US')} needed.`; return; }
        if (hooks.buyCar(c.type, c.price)) {
          selected = c.type;
          noteEl.textContent = `The ${spec.name} is yours. Tess tosses you the keys.`;
          render();
        }
      });
      carList.appendChild(btn);
    }
    upList.innerHTML = '';
    const spec = CAR_TYPES[selected];
    for (const u of UPGRADES) {
      const owned = upgrades()[selected]?.[u.kind] ?? 0;
      const maxed = owned >= u.prices.length || u.prices[owned] === 0;
      const price = maxed ? 0 : u.prices[owned];
      const needRep = maxed ? 0 : u.rep[owned];
      const row = doc.createElement('div');
      row.className = 'garage-upgrade';
      const pips = '●'.repeat(owned) + '○'.repeat(Math.max(0, u.prices.length - owned));
      row.innerHTML = `<b>${u.name}</b> <span class="pips">${pips}</span><br><span class="muted">${u.desc} — for the ${spec.name}</span><br>` +
        (maxed ? '<span class="muted">MAXED OUT</span>'
          : `<button data-kind="${u.kind}">${price === 0 ? '—' : `BUY $${price.toLocaleString('en-US')}${needRep > 0 ? ` · REP ${needRep}+` : ''}`}</button>`);
      const btn = row.querySelector('button');
      if (btn) {
        btn.disabled = cash < price || repLevel < needRep;
        btn.addEventListener('click', () => {
          if (hooks.buyUpgrade(selected, u.kind, price, needRep)) {
            noteEl.textContent = `${u.name} fitted to the ${spec.name}. Tess wipes her hands on a rag and grins.`;
            render();
          } else {
            noteEl.textContent = `Can't fit that yet — check your cash and REP.`;
          }
        });
      }
      upList.appendChild(row);
    }
    noteEl.textContent = noteEl.textContent || 'TESS: "Pick a car, pick a part. Cash up front, no favours — except for you, Jace."';
  }

  function show() {
    open = true;
    noteEl.textContent = '';
    root.classList.remove('hidden');
    render();
  }

  function hide() {
    open = false;
    root.classList.add('hidden');
  }

  doc.getElementById('btn-garage-close').addEventListener('click', hide);

  return {
    get isOpen() { return open; },
    get selected() { return selected; },
    show, hide, render,
    // Driving hook for later use: how many tiers of `kind` a car owns.
    upgradeLevel(type, kind) { return upgrades()[type]?.[kind] ?? 0; },
  };
}
