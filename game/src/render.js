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
  scene.fog = new THREE.Fog(0xffd9a8, 260, 900);

  // Gradient sky dome: a big back-face sphere whose shader blends a
  // horizon colour into a zenith colour (and a darker ground haze
  // below the horizon). setSky() repaints it for the time of day —
  // dawn pink, noon blue, golden hour orange-purple, dusk violet —
  // so the city never sits under a flat sky again.
  const skyUniforms = {
    topColor: { value: new THREE.Color(0x7b2d8e) },
    horizonColor: { value: new THREE.Color(0xffb45e) },
    bottomColor: { value: new THREE.Color(0x3a2a3a) },
  };
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(950, 24, 16),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 bottomColor; varying vec3 vPos; void main() { float h = normalize(vPos).y; vec3 c = h > 0.0 ? mix(horizonColor, topColor, pow(h, 0.55)) : mix(horizonColor, bottomColor, pow(-h, 0.6)); gl_FragColor = vec4(c, 1.0); }',
    }),
  );
  scene.add(skyDome);

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

  // Time-of-day palettes: [hour, top, horizon, fog, sun colour, sun intensity, hemi intensity, disc y].
  const SKY_KEYS = [
    [5, 0x3a2a5e, 0xff8a7a, 0x8a6a7a, 0xff9a7a, 1.2, 0.5, 40],
    [7, 0x7a6ab0, 0xffb48a, 0xffc9a8, 0xffc98a, 1.8, 0.65, 90],
    [12, 0x3a7ab8, 0x9fd8e8, 0xcfe8f0, 0xfff2c8, 2.6, 0.9, 320],
    [16, 0x4a6ab0, 0xffd9a8, 0xffe0b8, 0xffe0a0, 2.4, 0.85, 220],
    [18.7, 0x7b2d8e, 0xffb45e, 0xffd9a8, 0xffb45e, 2.2, 0.75, 95],
    [20.5, 0x2a1a4e, 0xff5a7a, 0xc98a9a, 0xff7a5e, 1.7, 0.7, 55], // dusk: sun/hemi lifted so shadowed ground still reads
    [22, 0x0e1230, 0x3a2a5e, 0x2a2438, 0x8a7ab8, 0.7, 0.35, 20],
    [24, 0x3a2a5e, 0xff8a7a, 0x8a6a7a, 0xff9a7a, 1.2, 0.5, 40],
  ];
  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();
  function setSky(hour) {
    const h = ((hour % 24) + 24) % 24;
    let i = 0;
    while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1][0] <= h) i += 1;
    const a = SKY_KEYS[i];
    const b = SKY_KEYS[i + 1];
    const t = Math.max(0, Math.min(1, (h - a[0]) / (b[0] - a[0] || 1)));
    skyUniforms.topColor.value.lerpColors(tmpA.setHex(a[1]), tmpB.setHex(b[1]), t);
    skyUniforms.horizonColor.value.lerpColors(tmpA.setHex(a[2]), tmpB.setHex(b[2]), t);
    skyUniforms.bottomColor.value.lerpColors(tmpA.setHex(0x2a2030), tmpB.setHex(0x2a2030), t);
    scene.fog.color.lerpColors(tmpA.setHex(a[3]), tmpB.setHex(b[3]), t);
    sun.color.lerpColors(tmpA.setHex(a[4]), tmpB.setHex(b[4]), t);
    sun.intensity = a[5] + (b[5] - a[5]) * t;
    hemi.intensity = a[6] + (b[6] - a[6]) * t;
    sunDisc.position.y = a[7] + (b[7] - a[7]) * t;
    sunDisc.material.color.lerpColors(tmpA.setHex(0xffe9a8), tmpB.setHex(0xffd9a8), t);
  }
  setSky(18.7); // golden hour by default

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
      const alt = target.y || 0;
      const back = lookBack ? 1 : -1;
      const want = new THREE.Vector3(
        target.x - Math.sin(heading) * 11 * back,
        alt + 5.2,
        target.z - Math.cos(heading) * 11 * back,
      );
      cam.pos.lerp(want, Math.min(1, dt * 4));
      cam.look.lerp(new THREE.Vector3(target.x + Math.sin(heading) * 8 * (lookBack ? -1 : 1), alt + 1.6, target.z + Math.cos(heading) * 8 * (lookBack ? -1 : 1)), Math.min(1, dt * 6));
      // Keep the chase camera out of the ground and inside the world.
      cam.pos.y = Math.max(cam.pos.y, alt + 2.2);
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

  return { renderer, scene, camera, cam, draw, updateCamera, setSky };
}
