# Solmar Bay

[![Solmar Bay](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/phan67082/solmar-bay/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/phan67082/solmar-bay/reward.svg)](https://make.fun/bounty/gta6-01)

An open-world 3D browser game set in Solmar Bay, a sun-soaked fictional
coastal city. Built with three.js, it runs entirely offline in desktop
Chrome — no network, no install, just open the page and play.

Built for the [Make GTA 6 bounty on make.fun](https://make.fun/bounty/gta6-01).

## Story

Jace Moreno is a wheelman fresh out of prison and back in the city that
raised him. The fixer Tess Alvarez runs jobs out of her garage and has
work for him — if he can stay ahead of the law long enough to finish it.
Standing in his way is Councillor Dario Vane, who owns the port, the
docks, and the police captain.

## Features

- **A living city** — drive through streets full of traffic and
  pedestrians, from the beachfront to the port district.
- **Drive and steal cars** — walk up to any car, take it, and go.
  Every car handles differently.
- **Wanted system** — a 0–5 star wanted level. Cause trouble and the
  police come after you; get busted or wasted and you lose the chase.
- **On-foot combat** — fists up close, pistol at range.
- **Six story missions** — *Homecoming* (tutorial drive), *The Pickup*,
  *Hot Wheels*, *Street Sweep*, *Bank on It*, and the finale,
  *King of the Bay*.
- **Side activities** — run taxi fares for cash, hunt down 20 hidden
  cash drops scattered around the city, and hit the stunt jump.
- **HUD** — minimap, health and armour bars, cash, and wanted stars,
  all on screen while you play.
- **Save game** — progress is stored in the browser (local storage),
  so you can pick up where you left off.
- **Synthesised audio** — engine notes, police sirens, and a synthwave
  soundtrack, all generated in code. No audio files.
- **Menus** — a start screen and a pause menu with the full control list.

## How to run

Serve the `game/` folder with any static file server, then open it in
desktop Chrome:

```sh
cd game
python3 -m http.server
```

Then open <http://localhost:8000> in Chrome and play. The game needs no
network connection once the page is loaded.

## Controls

- **W A S D / arrow keys** — drive and move (steer with A/D or the
  left/right arrows).
- **Space** — jump on foot; handbrake while driving.
- **E** — enter or exit a car.
- **F** — punch.
- **Mouse click** — fire the pistol when armed.
- **1 / 2** — switch weapon (fists / pistol).
- **R** — reload.
- **H** — horn.
- **L** — headlights.
- **C** — look back.
- **Mouse drag** — orbit the camera.
- **M** — mute audio.
- **P or Esc** — pause.
- **T** — restart.

The full control list is also shown on the start screen and in the
pause menu.

## Screenshots

See the `screenshots/` folder for in-game shots of the city, a police
chase, and a mission in progress.

---

Built for [make.fun](https://make.fun/r/54n9deeb) — try making your own
game and entering a bounty there.
