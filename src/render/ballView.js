// 排球的畫面呈現：讀取模擬狀態＋插值，不寫入任何模擬資料
import * as THREE from 'three';
import { SIM_DT } from '../sim/constants.js';

const TRAIL_N = 10;       // 尾跡取樣點數
const TRAIL_SPEED = 9;    // 球速高於此（m/s）才顯示尾跡（重扣/強發球）

export function createBallView(scene, quality) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.105, 24, 18),
    new THREE.MeshStandardMaterial({
      map: makeBallTexture(),
      roughness: 0.55,
    }),
  );
  mesh.castShadow = quality.shadowSize > 0;
  scene.add(mesh);

  // 落點視覺線索：貼地圓影（設計要求「球的即時影子」，即使關閉即時陰影也存在）
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.14, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.012;
  scene.add(blob);

  // 高速球尾跡（重扣的速度感）：最近 N 個位置連線
  const trailPos = new Float32Array(TRAIL_N * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Line(
    trailGeo,
    new THREE.LineBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.55 }),
  );
  trail.visible = false;
  trail.frustumCulled = false;
  scene.add(trail);

  return {
    // alpha = 累積器剩餘時間 / SIM_DT，於上一步與當前步之間插值；dt＝幀時間（視覺滾動用）
    sync(ball, alpha, dt = 1 / 60) {
      const x = ball.px + (ball.x - ball.px) * alpha;
      const y = ball.py + (ball.y - ball.py) * alpha;
      const z = ball.pz + (ball.z - ball.pz) * alpha;
      mesh.position.set(x, y, z);
      mesh.rotation.x += 4.8 * dt; // 純視覺滾動（與幀率脫鉤）
      blob.position.x = x;
      blob.position.z = z;

      // 尾跡：往後平移取樣點、插入當前位置；只在高速時顯示
      for (let i = TRAIL_N - 1; i > 0; i -= 1) {
        trailPos[i * 3] = trailPos[(i - 1) * 3];
        trailPos[i * 3 + 1] = trailPos[(i - 1) * 3 + 1];
        trailPos[i * 3 + 2] = trailPos[(i - 1) * 3 + 2];
      }
      trailPos[0] = x; trailPos[1] = y; trailPos[2] = z;
      trailGeo.attributes.position.needsUpdate = true;
      const speed = Math.hypot(ball.x - ball.px, ball.y - ball.py, ball.z - ball.pz) / SIM_DT;
      trail.visible = speed > TRAIL_SPEED;
      const h = Math.min(Math.max(y, 0), 8) / 8;
      blob.material.opacity = 0.4 * (1 - h * 0.8);
      const s = 1 + h * 1.5;
      blob.scale.set(s, s, 1);
    },
  };
}

// 程序化藍黃排球貼圖（不依賴外部圖檔）
function makeBallTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const bands = ['#f7d117', '#1a4fa0', '#f7d117', '#ffffff', '#1a4fa0', '#f7d117'];
  const bandH = canvas.height / bands.length;
  bands.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, i * bandH, canvas.width, bandH + 1);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
