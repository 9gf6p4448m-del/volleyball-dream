// 排球的畫面呈現：讀取模擬狀態＋插值，不寫入任何模擬資料
import * as THREE from 'three';

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

  return {
    // alpha = 累積器剩餘時間 / SIM_DT，於上一步與當前步之間插值
    sync(ball, alpha) {
      const x = ball.px + (ball.x - ball.px) * alpha;
      const y = ball.py + (ball.y - ball.py) * alpha;
      const z = ball.pz + (ball.z - ball.pz) * alpha;
      mesh.position.set(x, y, z);
      mesh.rotation.x += 0.08; // 純視覺滾動
      blob.position.x = x;
      blob.position.z = z;
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
