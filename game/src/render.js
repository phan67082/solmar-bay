// The 3D scene: golden-hour sun (low, warm, fixed), warm haze, the sky
// gradient and the sun disc, and the camera rigs — orbit on foot, chase
// with a lag while driving, a slow vista sweep on the title screen, and
// the staged cameras the screenshot scenes set directly.
import * as THREE from 'three';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_COMPLETE = 'complete';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffc98a);
  scene.fog = new THREE.Fog(0xffd9a8, 260, 900);

  const hemi = new THREE.HemisphereLight(0xffd9a8, 0x5a4a3a, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb45e, 2.2);
  sun.position.set(-180, 90, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220;
  sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0015;
  scene.add(sun);
  scene.add(sun.target);

  // Sun disc low over the sea, west.
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(26, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false }),
  );
  sunDisc.position.set(-640, 95, 40);
  scene.add(sunDisc);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2000);

  // Camera state. On foot the camera orbits the player; driving it chases
  // the car with a lag; the title screen sweeps the vista.
  const cam = {
    yaw: 0,
    pitch: 0.32,
    dist: 9,
    pos: new THREE.Vector3(-20, 8, 30),
    look: new THREE.Vector3(0, 1, 0),
    mode: 'orbit',
  };

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  function updateCamera(dt, target, heading, inCar, lookBack, screen, time) {
    if (screen === SCREEN_TITLE) {
      // Slow sweep over the city vista, from above the beach toward downtown.
      const a = time * 0.02;
      cam.pos.set(-260 + Math.sin(a) * 40, 90, -40 + Math.cos(a * 0.7) * 60);
      cam.look.set(60, 8, 60);
    } else if (inCar) {
      const back = lookBack ? 1 : -1;
      const want = new THREE.Vector3(
        target.x - Math.sin(heading) * 11 * back,
        5.2,
        target.z - Math.cos(heading) * 11 * back,
      );
      cam.pos.lerp(want, Math.min(1, dt * 4));
      cam.look.lerp(new THREE.Vector3(target.x + Math.sin(heading) * 8 * (lookBack ? -1 : 1), 1.6, target.z + Math.cos(heading) * 8 * (lookBack ? -1 : 1)), Math.min(1, dt * 6));
      // Keep the chase camera out of the ground and inside the world.
      cam.pos.y = Math.max(cam.pos.y, 2.2);
    } else {
      const cx = target.x - Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
      const cz = target.z - Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
      const cy = target.y + 1.6 + Math.sin(cam.pitch) * cam.dist;
      cam.pos.set(cx, Math.max(cy, 1.2), cz);
      cam.look.set(target.x, target.y + 1.4, target.z);
    }
    camera.position.copy(cam.pos);
    camera.lookAt(cam.look);
    // The shadow camera follows the player so shadows stay crisp nearby.
    sun.position.set(target.x - 180, 90, target.z + 60);
    sun.target.position.set(target.x, 0, target.z);
    sun.target.updateMatrixWorld();
  }

  function draw() {
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, cam, draw, updateCamera };
}
