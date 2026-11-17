# Solmar Bay

An offline browser open-world game in the spirit of a GTA-style city
sandbox — built for the Make Fun bounty "Make GTA 6" (gta6-01). All
original: a fictional sun-soaked coastal city, its own story, names and
slogans. No network, no external assets, no audio files — the 3D engine
is vendored under `game/vendor/`, and every sound is synthesised in code.

## The game

You are **Jace Moreno**, a wheelman just out of prison, back in his home
city. **Tess Alvarez** runs jobs from her garage. **Councillor Dario
Vane** owns the port — and the police captain.

Explore a 12×12-block city on foot and by car: a beachfront boulevard
along the sea, a marina and port with cranes, a central plaza with a
fountain, downtown towers, a hillside district, palms, neon signs and
golden-hour light. Steal parked cars, drive through traffic that stops
at lights, pick up taxi fares, find 20 hidden cash drops, and clear the
stunt jump over the marina gap. Six story missions run from a tutorial
drive to a three-stage finale at the port. Wanted stars bring police
cruisers; get busted or wasted and you retry from the checkpoint.

## How to play

| Key | Action |
| --- | --- |
| W A S D / arrows | Move on foot / drive |
| Shift | Run |
| Mouse drag | Orbit the camera |
| Space | Jump (on foot) / handbrake (driving) |
| E | Enter / exit a car |
| F | Punch |
| Click | Shoot the pistol |
| 1 / 2 | Fists / pistol |
| R | Reload |
| H | Horn |
| L | Headlights |
| C | Look back while driving |
| P / Esc | Pause |
| M | Mute |
| T | Restart |

Progress, cash and unlocked missions save to the browser's local storage
(Continue on the title screen, or Save in the pause menu).

## How to run

No build step. Serve the `game/` folder from any plain static file
server and open it in desktop Chrome:

```sh
node serve.ts        # serves game/ on http://localhost:8080
```

or with any static server, e.g. `python3 -m http.server` inside `game/`.
The game needs WebGL; it plays with no console errors and makes no
network requests.

## Screenshots

Rendered deterministically from a fixed seed — each one plays the real
rules forward with a simple autopilot:

1. `1-chase.jpg` — the cover: a police chase on the boulevard, three
   wanted stars.
2. `2-plaza-fight.jpg` — a shootout in the central plaza.
3. `3-boulevard.jpg` — driving down the beachfront boulevard at golden
   hour.
4. `4-title.jpg` — the title screen over the city vista.

Re-render them with the tooling in `../tools/` (outside this repo):
`node ../tools/shots.mjs` serves `game/` and captures each
`?shot=cover|combat|boulevard|title&seed=1` scene at 1280×720.

## Layout

```
game/
  index.html        page shell, import map, HUD and menus
  vendor/           three.js 0.170.0 module build (vendored)
  src/
    config.js       tuning constants and city layout
    random.js       seeded RNG
    audio.js        synthesised sound and music
    input.js        keyboard and mouse state
    city.js         the static city (streets, buildings, beach, marina)
    vehicles.js     car models, driving physics, traffic
    pedestrians.js  walkers and taxi fares
    police.js       wanted level, pursuit, busted/wasted
    combat.js       weapons, shooting, enemy behaviour
    missions.js     the story, six missions, objectives
    collectibles.js cash drops and the stunt jump
    hud.js          DOM HUD and minimap canvas
    save.js         local-storage save
    render.js       3D scene, lighting, camera rigs
    shots.js        deterministic screenshot scenes
    main.js         boot, screen state machine, fixed-step loop
main.ts             copies game/ + screenshots/ to the output dir and
                    writes dossier.json with the make.fun library
```

## Build the entry

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Run it twice and the two outputs are byte-identical. Check the repo
with the kit:

```sh
node ../gta6-01-kit/cli/makefun.mjs check --kit ../gta6-01-kit --repo entry --worktree
```
