// 鏡頭操作（輸入層）：OrbitControls 原生支援滑鼠與觸控（單指旋轉、雙指縮放/平移）
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createCameraControls(camera, domElement) {
  const controls = new OrbitControls(camera, domElement);
  controls.target.set(0, 1.5, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 45;
  controls.maxPolarAngle = Math.PI / 2 - 0.02; // 不鑽到地板下
  controls.update();
  return controls;
}
