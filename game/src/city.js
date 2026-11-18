// Solmar Bay itself: the 12x12 block grid, beach and sea, marina and port,
// central plaza, hillside towers, palms, streetlights, traffic lights and
// props. Everything static is built once from the seeded RNG; the module
// hands back the mesh group, the building colliders (AABBs), the traffic
// lights, and the named places missions and shots need.
import * as THREE from 'three';
import { blockCentres, roadLines } from './config.js';
import { pick, range, intRange } from './random.js';

const BUILDING_COLOURS = [0xc9a06a, 0xb98a6e, 0x9aa7b5, 0xd9c9a8, 0x8f7d6b, 0x7d94a6, 0xc2b49a, 0xa88f7a];

// A facade texture: coloured wall with a grid of windows, some lit warm.
function facadeTexture(rng, base) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `#${base.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, 128, 10);
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const lit = rng() < 0.45;
      ctx.fillStyle = lit ? '#ffd98a' : '#2c3542';
      ctx.fillRect(10 + col * 23, 18 + row * 23, 15, 16);
    }
  }
  // Street level: a dark shopfront band with one lit doorway, plus a
  // pale cornice line under the roof — the box reads as a building with
  // a ground floor instead of a flat slab.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 228, 128, 28);
  ctx.fillStyle = '#ffd98a';
  ctx.fillRect(56, 232, 16, 24);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(0, 12, 128, 3);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function signTexture(text, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = fg;
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(rng) {
  const group = new THREE.Group();
  const colliders = [];
  const lights = [];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
  const dummy = new THREE.Object3D();

  const facadeMats = BUILDING_COLOURS.map((c) => new THREE.MeshLambertMaterial({ map: facadeTexture(rng, c) }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4440 });
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3a40 });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x8d8578 });
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x6f6a58 });
  const sandMat = new THREE.MeshLambertMaterial({ color: 0xe0c48f });
  const seaMat = new THREE.MeshLambertMaterial({ color: 0x2a6f8e });
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0xa89a80 });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f7d3a });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2f3338 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x8a6b45 });
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xc26a2a });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x3c4654 });

  function box(w, h, d, mat, x, y, z, ry = 0) {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = h > 4;
    m.receiveShadow = true;
    group.add(m);
    return m;
  }

  function addCollider(x, z, halfW, halfD) {
    colliders.push({ minX: x - halfW, maxX: x + halfW, minZ: z - halfD, maxZ: z + halfD });
  }

  // --- ground, sea, beach, marina water ---------------------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(320, 900), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(-556, 0.03, 0);
  group.add(sea);
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(30, 900), sandMat);
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(-381, 0.04, 0);
  beach.receiveShadow = true;
  group.add(beach);
  const marinaWater = new THREE.Mesh(new THREE.PlaneGeometry(720, 80), seaMat);
  marinaWater.rotation.x = -Math.PI / 2;
  marinaWater.position.set(0, 0.03, 406);
  group.add(marinaWater);

  // --- roads and sidewalks ------------------------------------------------
  for (const line of roadLines()) {
    const roadNS = new THREE.Mesh(new THREE.PlaneGeometry(12, 780), roadMat);
    roadNS.rotation.x = -Math.PI / 2;
    roadNS.position.set(line, 0.05, 0);
    roadNS.receiveShadow = true;
    group.add(roadNS);
    const roadEW = new THREE.Mesh(new THREE.PlaneGeometry(780, 12), roadMat);
    roadEW.rotation.x = -Math.PI / 2;
    roadEW.position.set(0, 0.05, line);
    roadEW.receiveShadow = true;
    group.add(roadEW);
    for (const side of [-7.75, 7.75]) {
      const walkNS = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 780), walkMat);
      walkNS.rotation.x = -Math.PI / 2;
      walkNS.position.set(line + side, 0.06, 0);
      group.add(walkNS);
      const walkEW = new THREE.Mesh(new THREE.PlaneGeometry(780, 3.5), walkMat);
      walkEW.rotation.x = -Math.PI / 2;
      walkEW.position.set(0, 0.06, line + side);
      group.add(walkEW);
    }
  }

  // --- block slabs: paved lots so block interiors read as city, not dirt ---
  const slabCentres = blockCentres();
  const slabGeo = new THREE.PlaneGeometry(48, 48);
  const slabMat = new THREE.MeshLambertMaterial({ color: 0x8a7f6e });
  const slabMesh = new THREE.InstancedMesh(slabGeo, slabMat, slabCentres.length * slabCentres.length);
  {
    let si = 0;
    for (const bx of slabCentres) {
      for (const bz of slabCentres) {
        dummy.position.set(bx, 0.07, bz);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        slabMesh.setMatrixAt(si, dummy.matrix);
        si += 1;
      }
    }
    slabMesh.instanceMatrix.needsUpdate = true;
  }
  slabMesh.receiveShadow = true;
  group.add(slabMesh);
  const stripes = [];
  for (const x of roadLines()) {
    for (const z of roadLines()) {
      if ((Math.round((x + 360) / 60) + Math.round((z + 360) / 60)) % 2 !== 0) continue;
      for (let i = -2; i <= 2; i += 1) {
        stripes.push({ x: x + i * 1.8, z: z - 8, ry: 0 });
        stripes.push({ x: x + i * 1.8, z: z + 8, ry: 0 });
        stripes.push({ x: x - 8, z: z + i * 1.8, ry: Math.PI / 2 });
        stripes.push({ x: x + 8, z: z + i * 1.8, ry: Math.PI / 2 });
      }
    }
  }
  const stripeGeo = new THREE.PlaneGeometry(1, 2.4);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d0 });
  const stripeMesh = new THREE.InstancedMesh(stripeGeo, stripeMat, stripes.length);
  stripes.forEach((s, i) => {
    dummy.position.set(s.x, 0.08, s.z);
    dummy.rotation.set(-Math.PI / 2, 0, s.ry);
    dummy.updateMatrix();
    stripeMesh.setMatrixAt(i, dummy.matrix);
  });
  stripeMesh.instanceMatrix.needsUpdate = true;
  group.add(stripeMesh);

  // --- buildings ----------------------------------------------------------
  const centres = blockCentres();
  const plaza = { x: -30, z: -30 };
  for (const bx of centres) {
    for (const bz of centres) {
      if (bx === plaza.x && bz === plaza.z) continue; // plaza block stays open
      const hillside = bx >= 210 && bz <= -210;
      const port = bz === 330;
      const count = port ? 1 : intRange(rng, 1, 3);
      for (let i = 0; i < count; i += 1) {
        let w = range(rng, 12, 22);
        let d = range(rng, 12, 22);
        let h;
        if (port) { w = 34; d = 20; h = range(rng, 7, 10); }
        else if (hillside) h = range(rng, 38, 68);
        else if (Math.abs(bx) <= 90 && Math.abs(bz) <= 90) h = range(rng, 18, 46); // downtown towers
        else h = range(rng, 7, 20);
        // Keep the whole footprint inside the 48 m block (with a 0.5 m
        // margin): a building poking past the block edge would sit in the
        // road and trap any car parked or driving beside it.
        const oxLimit = Math.max(0, 24 - w / 2 - 0.5);
        const ozLimit = Math.max(0, 24 - d / 2 - 0.5);
        const ox = Math.max(-oxLimit, Math.min(oxLimit, (i % 2 === 0 ? -12 : 12) + range(rng, -4, 4)));
        const oz = Math.max(-ozLimit, Math.min(ozLimit, (i < 2 ? -12 : 12) + range(rng, -4, 4)));
        const x = bx + ox;
        const z = bz + oz;
        // District palettes: pastel beachfront, warm hillside, cool
        // glass downtown, mixed elsewhere — the city reads district by
        // district instead of one brown repeat.
        const regionMats = bx < -180
          ? [facadeMats[3], facadeMats[5], facadeMats[2]]
          : (bx >= 210 && bz <= -210)
            ? [facadeMats[0], facadeMats[4], facadeMats[6]]
            : (Math.abs(bx) <= 90 && Math.abs(bz) <= 90)
              ? [facadeMats[2], facadeMats[5], facadeMats[1]]
              : facadeMats;
        const mat = pick(rng, regionMats);
        const b = box(w, h, d, mat, x, h / 2, z);
        b.castShadow = true;
        box(w + 0.6, 0.5, d + 0.6, roofMat, x, h + 0.25, z);
        addCollider(x, z, w / 2 + 0.4, d / 2 + 0.4);
        // Rooftop props.
        const roll = rng();
        if (roll < 0.3) {
          const tank = new THREE.Mesh(cylGeo, woodMat);
          tank.scale.set(1.6, 2.2, 1.6);
          tank.position.set(x + w / 4, h + 1.6, z);
          group.add(tank);
        } else if (roll < 0.5) {
          const ant = new THREE.Mesh(cylGeo, poleMat);
          ant.scale.set(0.15, 7, 0.15);
          ant.position.set(x, h + 3.5, z);
          group.add(ant);
        } else if (roll < 0.65) {
          const neon = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: pick(rng, [0xff5a7a, 0x37e0c8, 0xffb02e]) }));
          neon.scale.set(Math.min(w * 0.7, 12), 1.2, 0.5);
          neon.position.set(x, h - 1.5, z + d / 2 + 0.3);
          group.add(neon);
        }
        // Rooftop clutter and vertical glow: an AC box on about half
        // the roofs, and a neon strip down the face of tall downtown
        // towers — the skyline reads varied from street and from above.
        if (rng() < 0.5) {
          const ac = box(Math.min(w * 0.3, 3), 1.1, Math.min(d * 0.3, 2.4), darkMat, x - w / 4, h + 1.05, z - d / 4);
          ac.castShadow = false;
        }
        if (h >= 30 && rng() < 0.45) {
          const strip = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: pick(rng, [0xff5a7a, 0x37e0c8, 0xffb02e, 0xb48ae0]) }));
          strip.scale.set(0.5, h * 0.7, 0.5);
          strip.position.set(x + w / 2 + 0.3, h * 0.45, z);
          group.add(strip);
        }
        // Ground-floor shop awning on a street-facing side.
        if (rng() < 0.5 && h < 24) {
          const awn = box(Math.min(w * 0.7, 10), 0.3, 2.4, new THREE.MeshLambertMaterial({ color: pick(rng, [0xc22730, 0x1f6fb2, 0x2e7d4f, 0xe08a2e]) }), x, 3.4, z + d / 2 + 1.2);
          awn.castShadow = false;
        }
      }
    }
  }

  // Named places: Tess's garage and the bank, with signs.
  const garage = { x: 150, z: 210 };
  box(26, 7, 16, new THREE.MeshLambertMaterial({ color: 0x4a6b6e }), garage.x, 3.5, garage.z);
  addCollider(garage.x, garage.z, 13.4, 8.4);
  const garageSign = new THREE.Mesh(new THREE.PlaneGeometry(20, 3.75), new THREE.MeshBasicMaterial({ map: signTexture("TESS'S GARAGE", '#14343a', '#ffd98a') }));
  garageSign.position.set(garage.x, 6.2, garage.z - 8.3);
  garageSign.rotation.y = Math.PI;
  group.add(garageSign);
  const bank = { x: 90, z: -90 };
  const bankSign = new THREE.Mesh(new THREE.PlaneGeometry(20, 3.75), new THREE.MeshBasicMaterial({ map: signTexture('SOLMAR NATIONAL BANK', '#2a2f3a', '#e8e4da') }));
  bankSign.position.set(bank.x, 12, bank.z - 11.3);
  bankSign.rotation.y = Math.PI;
  group.add(bankSign);

  // --- central plaza: stone circle and fountain ---------------------------
  const plazaDisc = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 0.3, 24), stoneMat);
  plazaDisc.position.set(plaza.x, 0.15, plaza.z);
  plazaDisc.receiveShadow = true;
  group.add(plazaDisc);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 1.2, 20), stoneMat);
  basin.position.set(plaza.x, 0.6, plaza.z);
  group.add(basin);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 0.2, 20), seaMat);
  water.position.set(plaza.x, 1.15, plaza.z);
  group.add(water);
  const column = new THREE.Mesh(cylGeo, stoneMat);
  column.scale.set(1, 4.5, 1);
  column.position.set(plaza.x, 2.4, plaza.z);
  group.add(column);
  addCollider(plaza.x, plaza.z, 7.4, 7.4);

  // --- marina docks, boats, port cranes ------------------------------------
  for (let i = 0; i < 4; i += 1) {
    const dx = -180 + i * 120;
    box(8, 0.6, 44, woodMat, dx, 0.35, 388);
    const hull = box(5, 2, 14, new THREE.MeshLambertMaterial({ color: pick(rng, [0xf0f0f0, 0xc22730, 0x1f6fb2]) }), dx + 10, 0.8, 380 + i * 4);
    hull.castShadow = false;
    const mast = new THREE.Mesh(cylGeo, poleMat);
    mast.scale.set(0.15, 9, 0.15);
    mast.position.set(dx + 10, 5, 380 + i * 4);
    group.add(mast);
  }
  for (let i = 0; i < 3; i += 1) {
    const cx = 210 + i * 60;
    box(2, 26, 2, craneMat, cx - 8, 13, 378);
    box(2, 26, 2, craneMat, cx + 8, 13, 378);
    box(30, 2.5, 3, craneMat, cx, 25, 378);
    box(4, 6, 4, darkMat, cx - 4, 21, 378);
    addCollider(cx, 378, 16, 3);
  }

  // --- stunt ramp over the marina gap --------------------------------------
  const ramp = { x: 60, z: 352, heading: Math.PI };
  const rampMesh = box(8, 1, 14, new THREE.MeshLambertMaterial({ color: 0xe08a2e }), ramp.x, 1.2, ramp.z);
  rampMesh.rotation.x = -0.35;
  rampMesh.castShadow = false;

  // --- palms along the boulevard and around the plaza ----------------------
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(cylGeo, trunkMat);
    trunk.scale.set(0.35, 7, 0.35);
    trunk.position.y = 3.5;
    trunk.rotation.z = 0.08;
    g.add(trunk);
    for (let i = 0; i < 6; i += 1) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.5, 4), frondMat);
      frond.position.y = 7;
      frond.rotation.z = Math.PI / 2.3;
      frond.rotation.y = (i / 6) * Math.PI * 2;
      frond.scale.set(1, 1, 0.25);
      g.add(frond);
    }
    g.position.set(x, 0, z);
    group.add(g);
  }
  for (let z = -360; z <= 360; z += 30) palm(-372, z);
  for (let a = 0; a < 8; a += 1) {
    const ang = (a / 8) * Math.PI * 2;
    palm(plaza.x + Math.cos(ang) * 20, plaza.z + Math.sin(ang) * 20);
  }

  // --- streetlights along the boulevard and main avenues -------------------
  function streetlight(x, z) {
    const pole = new THREE.Mesh(cylGeo, poleMat);
    pole.scale.set(0.18, 6.5, 0.18);
    pole.position.set(x, 3.25, z);
    group.add(pole);
    const arm = box(2.2, 0.18, 0.18, poleMat, x + 1, 6.4, z);
    arm.castShadow = false;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampMat);
    lamp.position.set(x + 2, 6.3, z);
    group.add(lamp);
  }
  for (let z = -360; z <= 360; z += 60) {
    streetlight(-353, z);
    streetlight(7, z);
    streetlight(-7, z + 30 > 360 ? z - 30 : z + 30);
  }
  for (let x = -300; x <= 300; x += 60) {
    streetlight(x, -173);
    streetlight(x + 30 > 360 ? x - 30 : x + 30, 173);
  }

  // --- plaza lamps, planters, boulevard benches (street furniture) ----
  // Four short lamp posts on the plaza ring, between the palms, so the
  // square reads as lived-in at dusk rather than an empty disc.
  for (let i = 0; i < 4; i += 1) {
    const ang = ((i + 0.5) / 4) * Math.PI * 2;
    const lx = plaza.x + Math.cos(ang) * 26;
    const lz = plaza.z + Math.sin(ang) * 26;
    const pole = new THREE.Mesh(cylGeo, poleMat);
    pole.scale.set(0.14, 4.2, 0.14);
    pole.position.set(lx, 2.1, lz);
    group.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), lampMat);
    lamp.position.set(lx, 4.3, lz);
    group.add(lamp);
  }
  // Stone planters with shrubs: a ring around the plaza (offset from the
  // palms) plus downtown corners — all inside block edges, clear of the
  // sidewalk lines pedestrians walk and of the roads.
  const shrubMat = new THREE.MeshLambertMaterial({ color: 0x3f7d3a });
  function planter(x, z) {
    box(1.7, 0.6, 1.7, stoneMat, x, 0.3, z);
    const shrub = box(1.25, 0.8, 1.25, shrubMat, x, 0.95, z);
    shrub.castShadow = false;
    addCollider(x, z, 0.9, 0.9);
  }
  for (let i = 0; i < 8; i += 1) {
    const ang = ((i + 0.5) / 8) * Math.PI * 2;
    planter(plaza.x + Math.cos(ang) * 20.5, plaza.z + Math.sin(ang) * 20.5);
  }
  for (const [px, pz] of [[-50, -50], [70, -50], [-50, 70], [70, 70], [-110, 10], [130, -110], [-170, 130], [190, 130]]) {
    planter(px, pz);
  }
  // Benches along the boulevard's east sidewalk, facing the sea.
  for (const bz of [-300, -180, -60, 60, 180, 300]) {
    box(1, 0.5, 3, woodMat, -350.5, 0.5, bz);
  }

  // --- traffic lights at six intersections ----------------------------------
  function trafficLight(x, z) {
    const pole = new THREE.Mesh(cylGeo, poleMat);
    pole.scale.set(0.2, 5.5, 0.2);
    pole.position.set(x + 7, 2.75, z + 7);
    group.add(pole);
    const housing = box(0.7, 1.8, 0.7, darkMat, x + 7, 5.4, z + 7);
    housing.castShadow = false;
    const lampGeo = new THREE.SphereGeometry(0.22, 8, 6);
    const red = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    red.position.set(x + 7, 5.9, z + 6.6);
    const yellow = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0x554400 }));
    yellow.position.set(x + 7, 5.4, z + 6.6);
    const green = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0x22cc44 }));
    green.position.set(x + 7, 4.9, z + 6.6);
    group.add(red, yellow, green);
    lights.push({ x, z, state: 'ns', timer: 0, red, yellow, green });
  }
  [[-180, -180], [180, -180], [-180, 180], [180, 180], [0, 180], [0, -180]].forEach(([x, z]) => trafficLight(x, z));

  // --- billboards, benches, hydrants, crates --------------------------------
  const slogans = [
    ['SOLMAR BAY', '#c22730', '#ffe9a8'],
    ['GOLDEN HOUR, EVERY HOUR', '#1f6fb2', '#f5f5f0'],
    ['VISIT THE MARINA', '#2e7d4f', '#ffe9a8'],
    ['SUNSET TAPES — FIND ALL 20', '#7b2d8e', '#ffe9a8'],
    ['DRIVE THE BAY', '#e08a2e', '#1a120c'],
  ];
  slogans.forEach(([text, bg, fg], i) => {
    const bx = [-285, 75, 255, -15, 315][i];
    const bz = [-285, 135, -225, 285, 45][i];
    box(0.8, 12, 0.8, poleMat, bx, 6, bz);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(18, 4), new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg) }));
    board.position.set(bx, 12.5, bz);
    board.rotation.y = i % 2 === 0 ? 0 : Math.PI / 2;
    group.add(board);
    addCollider(bx, bz, 1, 1);
  });
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    box(3, 0.5, 1, woodMat, plaza.x + Math.cos(a) * 16, 0.5, plaza.z + Math.sin(a) * 16);
  }
  for (let i = 0; i < 12; i += 1) {
    const hx = pick(rng, roadLines().slice(1, 12)) + 8;
    const hz = pick(rng, roadLines().slice(1, 12)) + 8;
    const hyd = new THREE.Mesh(cylGeo, new THREE.MeshLambertMaterial({ color: 0xc22730 }));
    hyd.scale.set(0.35, 0.9, 0.35);
    hyd.position.set(hx, 0.45, hz);
    group.add(hyd);
  }
  for (let i = 0; i < 10; i += 1) {
    const cx = pick(rng, centres) + range(rng, -18, 18);
    const cz = pick(rng, centres) + range(rng, -18, 18);
    if (Math.abs(cx - plaza.x) < 26 && Math.abs(cz - plaza.z) < 26) continue;
    box(2, 2, 2, woodMat, cx, 1, cz);
    addCollider(cx, cz, 1.1, 1.1);
  }

  // --- neon signposts, market stalls, extra stunt ramps ------------------
  const neonSigns = [
    ['SOLMAR FM 88.1', '#7b2d8e', '#ffe9a8', -348, -120, 0],
    ['CASINO MIRAMAR', '#c22730', '#ffe9a8', 12, -348, Math.PI / 2],
    ['CLUB VOLTAGE', '#1f6fb2', '#f5f5f0', -348, 240, 0],
    ['HOTEL MIRAMAR', '#2e7d4f', '#ffe9a8', 168, -348, Math.PI / 2],
    ['BOLT BURGER', '#e08a2e', '#1a120c', -168, 348, 0],
    ['FLAMINGO FM', '#b48ae0', '#ffe9a8', -168, -348, Math.PI / 2],
    ['FARMACIA SOL', '#2e7d4f', '#f5f5f0', 288, 12, 0],
    ['TACO LOCO', '#c22730', '#ffe9a8', -108, 168, Math.PI / 2],
    ['ZAPATOS ALBA', '#1f6fb2', '#ffe9a8', 228, -228, 0],
  ];
  for (const [text, bg, fg, sx, sz, ry] of neonSigns) {
    box(0.5, 11, 0.5, poleMat, sx, 5.5, sz);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 3), new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg) }));
    sign.position.set(sx, 11.5, sz);
    sign.rotation.y = ry;
    group.add(sign);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(16.6, 3.6), new THREE.MeshBasicMaterial({ color: 0xff5a7a, transparent: true, opacity: 0.25 }));
    glow.position.set(sx, 11.5, sz);
    glow.rotation.y = ry;
    glow.position.x += Math.sin(ry) * -0.15;
    glow.position.z += Math.cos(ry) * -0.15;
    group.add(glow);
    addCollider(sx, sz, 1, 1);
  }
  // Market stalls on the plaza: striped awnings, counters, crates.
  for (const [sx, sz, awnColour] of [[-14, -16, 0xc22730], [-46, -42, 0x1f6fb2], [-46, -16, 0x2e7d4f], [-14, -44, 0xe08a2e]]) {
    box(5, 0.3, 3.5, new THREE.MeshLambertMaterial({ color: awnColour }), sx, 2.6, sz);
    box(4.6, 1.0, 2.6, woodMat, sx, 0.5, sz);
    box(1.2, 1.2, 1.2, woodMat, sx + 3, 0.6, sz + 2);
    box(1.2, 1.2, 1.2, new THREE.MeshLambertMaterial({ color: 0x2e7d4f }), sx - 3, 0.6, sz - 2);
    addCollider(sx, sz, 2.6, 1.8);
  }
  // Two more stunt ramps, both on open road so a car can actually hit
  // them at speed: one on the beachfront boulevard, one on the east
  // road through downtown — three jumps total, each with its own bonus.
  const ramp2 = { x: -357, z: 200, heading: Math.PI };
  const ramp2Mesh = box(8, 1, 14, new THREE.MeshLambertMaterial({ color: 0x37e0c8 }), ramp2.x, 1.2, ramp2.z);
  ramp2Mesh.rotation.x = -0.35;
  ramp2Mesh.castShadow = false;
  const ramp3 = { x: 240, z: -180, heading: Math.PI / 2 };
  const ramp3Mesh = box(14, 1, 8, new THREE.MeshLambertMaterial({ color: 0xff5a7a }), ramp3.x, 1.2, ramp3.z);
  ramp3Mesh.rotation.z = 0.35;
  ramp3Mesh.castShadow = false;

  // --- distant skyline ring and the hillside --------------------------------
  const skylineMat = new THREE.MeshLambertMaterial({ color: 0x6b5a52 });
  for (let i = 0; i < 22; i += 1) {
    const ang = (i / 22) * Math.PI * 2;
    const r = 480 + rng() * 60;
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    if (x < -420) continue; // the sea stays open to the west
    const h = 40 + rng() * 70;
    const t = box(range(rng, 18, 30), h, range(rng, 18, 30), skylineMat, x, h / 2, z);
    t.castShadow = false;
  }
  const hill = new THREE.Mesh(new THREE.ConeGeometry(120, 55, 12), new THREE.MeshLambertMaterial({ color: 0x7d6b52 }));
  hill.position.set(440, 10, -440);
  group.add(hill);

  return {
    group,
    colliders,
    lights,
    plaza,
    garage,
    bank,
    ramp,
    ramp2,
    ramp3,
    spawn: { x: -20, z: -8, heading: Math.PI / 2 },
  };
}
