// Solmar Bay — the entry program for the gta6-01 bounty.
//
// What this program does is small on purpose: the game itself is plain
// static files under game/ (an index page, ES modules and a vendored
// three.js build) that any desktop browser opens offline, and the four
// screenshots sit in screenshots/. This program gathers those two folders
// into the output directory and asks the vendored make.fun library to
// write the dossier the judge reads.
//
// Run it from this folder with an output directory of your choosing:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// In the grader's container the output directory is /output instead.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The game folder goes over whole: the page, its modules and the vendored
// engine build, nothing added and nothing left behind.
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });

// Screenshots are optional on disk (the folder may be absent on a fresh
// checkout), but when present they are the images the judge sees, the
// first by name being the cover.
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The dossier is the library's own summary of the output just written.
// These caps mirror the scorer's gates so a bad entry fails here, loudly,
// instead of failing silently on the server: at most four screenshots,
// each no bigger than 256 KiB, and the game folder within its file count
// and byte budget. Only the text cap shapes the dossier's own size.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
