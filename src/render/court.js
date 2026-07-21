// 標準排球場：地板、界線、球網、網柱、標誌竿（尺寸取自 sim/constants，單一事實來源）
import * as THREE from 'three';
import { COURT } from '../sim/constants.js';

export function createCourt(scene, quality) {
  const receiveShadow = quality.shadowSize > 0;
  const group = new THREE.Group();

  buildFloor(group, receiveShadow);
  buildLines(group);
  buildNet(group);
  group.traverse((o) => { if (o.isMesh) o.matrixAutoUpdate = false; });
  scene.add(group);
  return group;
}

function buildFloor(group, receiveShadow) {
  const freeW = COURT.WIDTH + COURT.FREE_ZONE * 2;
  const freeL = COURT.LENGTH + COURT.FREE_ZONE * 2;

  // 自由區（暗色木地板）
  const zone = new THREE.Mesh(
    new THREE.PlaneGeometry(freeW + 4, freeL + 4),
    new THREE.MeshStandardMaterial({ color: 0x6b4f35, roughness: 0.9 }),
  );
  zone.rotation.x = -Math.PI / 2;
  zone.receiveShadow = receiveShadow;
  zone.updateMatrix();
  group.add(zone);

  // 比賽場地（亮橘色區）
  const court = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT.WIDTH, COURT.LENGTH),
    new THREE.MeshStandardMaterial({ color: 0xc97b3d, roughness: 0.85 }),
  );
  court.rotation.x = -Math.PI / 2;
  court.position.y = 0.005;
  court.receiveShadow = receiveShadow;
  court.updateMatrix();
  group.add(court);
}

function buildLines(group) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xf5f1e8 });
  const y = 0.011;
  const w = COURT.LINE_WIDTH;
  const halfW = COURT.WIDTH / 2;
  const halfL = COURT.LENGTH / 2;

  const addLine = (sx, sz, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.updateMatrix();
    group.add(m);
  };

  addLine(COURT.WIDTH + w, w, 0, halfL); // 底線 ×2
  addLine(COURT.WIDTH + w, w, 0, -halfL);
  addLine(w, COURT.LENGTH + w, halfW, 0); // 邊線 ×2
  addLine(w, COURT.LENGTH + w, -halfW, 0);
  addLine(COURT.WIDTH, w, 0, COURT.ATTACK_LINE); // 攻擊線 ×2
  addLine(COURT.WIDTH, w, 0, -COURT.ATTACK_LINE);
  addLine(COURT.WIDTH, w, 0, 0); // 中線
}

function buildNet(group) {
  const span = COURT.WIDTH + COURT.NET_OVERHANG * 2;
  const netBottom = COURT.NET_HEIGHT - COURT.NET_BAND;

  // 網面：程序化格紋貼圖（不依賴外部圖檔）
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(span, COURT.NET_BAND),
    new THREE.MeshStandardMaterial({
      map: makeNetTexture(span),
      transparent: true,
      side: THREE.DoubleSide,
      roughness: 1,
    }),
  );
  mesh.position.set(0, netBottom + COURT.NET_BAND / 2, 0);
  mesh.updateMatrix();
  group.add(mesh);

  // 上下白帶
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xf5f1e8, side: THREE.DoubleSide });
  for (const yy of [COURT.NET_HEIGHT - 0.035, netBottom + 0.025]) {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(span, 0.07), bandMat);
    band.position.set(0, yy, 0);
    band.updateMatrix();
    group.add(band);
  }

  // 網柱 ×2
  const postMat = new THREE.MeshStandardMaterial({ color: 0x3d4451, roughness: 0.5 });
  for (const sx of [1, -1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, COURT.NET_HEIGHT + 0.12, 12),
      postMat,
    );
    post.position.set(sx * (COURT.WIDTH / 2 + COURT.NET_OVERHANG), (COURT.NET_HEIGHT + 0.12) / 2, 0);
    post.castShadow = true;
    post.updateMatrix();
    group.add(post);
  }

  // 標誌竿（紅白相間，立於邊線正上方）
  for (const sx of [1, -1]) {
    const antenna = new THREE.Group();
    for (let seg = 0; seg < 8; seg += 1) {
      const part = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8),
        new THREE.MeshBasicMaterial({ color: seg % 2 === 0 ? 0xe03a3a : 0xf5f1e8 }),
      );
      part.position.y = seg * 0.1 + 0.05;
      part.updateMatrix();
      antenna.add(part);
    }
    antenna.position.set(sx * COURT.WIDTH / 2, COURT.NET_HEIGHT - 0.4 + 0.02, 0);
    group.add(antenna);
  }
}

function makeNetTexture(span) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(235, 238, 245, 0.85)';
  ctx.lineWidth = 1.5;
  const cell = 8; // 約 10cm 網目
  for (let x = 0; x <= canvas.width; x += cell) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += cell) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.x = span / 5;
  return tex;
}
