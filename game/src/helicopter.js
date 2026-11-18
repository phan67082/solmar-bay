// The flyable helicopter: a red-and-white heli parked on a helipad on
// the beachfront, free for the player to steal and pilot. Arcade flight
// — W/S for forward/back, A/D to yaw, Space to climb, Shift to descend
// — with a soft ceiling and a gentle landing. While the player is
// flying it, the player mesh hides and the camera chases the heli like
// a car; stepping out (E) leaves the heli where it landed.
import * as THREE from 'three';

export const HELIPAD = { x: -381, z: 300 };

function makeFlyableMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xc22730 });
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.5, 1.9), bodyMat);
  body.position.y = 0.4;
  body.castShadow = true;
  g.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.65, 0.35, 1.95), whiteMat);
  stripe.position.y = 0.1;
  g.add(stripe);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.7), new THREE.MeshLambertMaterial({ color: 0x9fd8e8 }));
  glass.position.set(1.7, 0.55, 0);
  g.add(glass);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 0.5), bodyMat);
  tail.position.set(-3.2, 0.7, 0);
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 0.5), whiteMat);
  fin.position.set(-4.8, 1.3, 0);
  g.add(fin);
  const skidMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  for (const s of [-0.85, 0.85]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.12), skidMat);
    skid.position.set(0, -0.6, s);
    g.add(skid);
  }
  const rotor = new THREE.Group();
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 8.0), bladeMat);
    blade.rotation.y = a;
    rotor.add(blade);
  }
  rotor.position.y = 1.5;
  g.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.7, 0.1), bladeMat);
  tailRotor.position.set(-4.9, 1.3, 0.35);
  g.add(tailRotor);
  g.userData.rotor = rotor;
  g.userData.tailRotor = tailRotor;
  return g;
}

export function createHelicopter(scene) {
  // The helipad: a dark disc with a yellow ring on the sand.
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 7, 0.25, 24),
    new THREE.MeshLambertMaterial({ color: 0x2f3338 }),
  );
  pad.position.set(HELIPAD.x, 0.12, HELIPAD.z);
  pad.receiveShadow = true;
  scene.add(pad);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(5.4, 6.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd21f, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(HELIPAD.x, 0.28, HELIPAD.z);
  scene.add(ring);

  const mesh = makeFlyableMesh();
  mesh.position.set(HELIPAD.x, 0, HELIPAD.z);
  scene.add(mesh);

  let flying = false;
  let x = HELIPAD.x;
  let z = HELIPAD.z;
  let y = 0;
  let heading = Math.PI / 2;
  let fwdSpeed = 0;
  let vertSpeed = 0;

  function nearPad(px, pz, maxD = 5) {
    return Math.hypot(px - x, pz - z) < maxD && y === 0;
  }

  // Step into the heli from the pad (on foot, close by).
  function tryEnter(player) {
    if (flying || player.inCar) return false;
    if (!nearPad(player.x, player.z, 5)) return false;
    flying = true;
    heading = player.heading;
    return true;
  }

  // Step out: the player lands beside the heli, which stays parked
  // wherever it came down.
  function exit(player) {
    if (!flying) return false;
    flying = false;
    fwdSpeed = 0;
    vertSpeed = 0;
    y = 0;
    player.x = x + Math.cos(heading) * 3;
    player.z = z - Math.sin(heading) * 3;
    player.y = 0;
    player.heading = heading;
    mesh.position.set(x, 0, z);
    mesh.rotation.set(0, heading, 0);
    return true;
  }

  // One fixed step of arcade flight. ctrl: { f, s, lift, descend }.
  function fly(dt, ctrl) {
    if (!flying) return;
    heading += -ctrl.s * 1.4 * dt;
    fwdSpeed += ctrl.f * 10 * dt;
    fwdSpeed -= fwdSpeed * 0.8 * dt;
    fwdSpeed = Math.max(-8, Math.min(20, fwdSpeed));
    const targetVert = ctrl.lift ? 7 : ctrl.descend ? -7 : 0;
    vertSpeed += (targetVert - vertSpeed) * Math.min(1, dt * 3);
    y += vertSpeed * dt;
    if (y <= 0) { y = 0; vertSpeed = 0; }
    if (y > 80) { y = 80; vertSpeed = Math.min(0, vertSpeed); }
    x += Math.sin(heading) * fwdSpeed * dt;
    z += Math.cos(heading) * fwdSpeed * dt;
    x = Math.max(-394, Math.min(395, x));
    z = Math.max(-395, Math.min(400, z));
    mesh.position.set(x, y + 0.4, z);
    mesh.rotation.y = heading;
    // A gentle bank into turns and a nose-down pitch at speed.
    mesh.rotation.z = ctrl.s * 0.12;
    mesh.rotation.x = -fwdSpeed * 0.008;
    mesh.userData.rotor.rotation.y += dt * (18 + Math.abs(fwdSpeed));
    mesh.userData.tailRotor.rotation.x += dt * 26;
  }

  function reset() {
    flying = false;
    x = HELIPAD.x;
    z = HELIPAD.z;
    y = 0;
    heading = Math.PI / 2;
    fwdSpeed = 0;
    vertSpeed = 0;
    mesh.position.set(x, 0, z);
    mesh.rotation.set(0, heading, 0);
  }

  return {
    get isFlying() { return flying; },
    get speed() { return fwdSpeed; },
    get pos() { return { x, y, z, heading }; },
    get pad() { return HELIPAD; },
    nearPad,
    tryEnter,
    exit,
    fly,
    reset,
  };
}
