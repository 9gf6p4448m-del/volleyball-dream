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

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1c2230);
  scene.fog = new THREE.Fog(0x1c2230, 35, 70);
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
  const hemi = new THREE.HemisphereLight(0xdde7ff, 0x3a3f4a, 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(10, 18, 8);
  if (quality.shadowSize > 0) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 45;
    sun.shadow.bias = -0.0004;
  }
  scene.add(sun);
}

export function bindResize(renderer, camera) {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
