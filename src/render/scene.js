// 場景基礎：renderer、camera、燈光（畫面層，不含任何模擬邏輯）
import * as THREE from 'three';

export function createRenderer(container, quality) {
  const renderer = new THREE.WebGLRenderer({
    antialias: quality.antialias,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(quality.dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  if (quality.shadowSize > 0) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  container.appendChild(renderer.domElement);
  return renderer;
}

// 夜賽氛圍（vow3d 剪影美學的排球版）：暗色場館＋球場聚光——人物從背景跳出來
export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e1a);
  scene.fog = new THREE.Fog(0x0b0e1a, 28, 62);
  return scene;
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    120,
  );
  camera.position.set(13, 8, 15);
  camera.lookAt(0, 1.5, 0);
  return camera;
}

export function createLights(scene, quality) {
  // 底光：冷藍夜色（壓暗——聚光燈才有戲）
  const hemi = new THREE.HemisphereLight(0x4a5a8c, 0x141821, 0.5);
  scene.add(hemi);

  // 主燈：暖白「場館頂燈」（唯一影燈——效能不加價）
  const key = new THREE.DirectionalLight(0xffefd8, 2.6);
  key.position.set(8, 20, 6);
  if (quality.shadowSize > 0) {
    key.castShadow = true;
    key.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    key.shadow.camera.left = -14;
    key.shadow.camera.right = 14;
    key.shadow.camera.top = 14;
    key.shadow.camera.bottom = -14;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 45;
    key.shadow.bias = -0.0004;
  }
  scene.add(key);

  // 逆光：冷藍輪廓光（剪影感——人物邊緣從暗背景切出來）
  const rim = new THREE.DirectionalLight(0x5f7dff, 0.7);
  rim.position.set(-9, 12, -14);
  scene.add(rim);

  // 球場聚光光池 ×2（不投影的氛圍燈：兩個半場各一盞暖光錐）
  for (const sz of [7, -7]) {
    const spot = new THREE.SpotLight(0xffe6bf, 260, 40, 0.62, 0.55, 1.6);
    spot.position.set(0, 15, sz * 0.55);
    spot.target.position.set(0, 0, sz * 0.6);
    scene.add(spot);
    scene.add(spot.target);
  }

  // 局點張力：底光再壓、輪廓光加強（戲劇性收攏）——幀率無關指數收斂
  let tension = 0;
  return {
    setTension(active, dt) {
      const t = active ? 1 : 0;
      tension += (t - tension) * (1 - Math.exp(-3 * dt));
      hemi.intensity = 0.5 - 0.22 * tension;
      rim.intensity = 0.7 + 0.55 * tension;
      key.intensity = 2.6 - 0.25 * tension;
    },
  };
}

export function bindResize(renderer, camera) {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
