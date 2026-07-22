// 體育館夜賽環境（純視覺，不碰 sim）：環繞看台＋觀眾剪影＋場邊 LED 廣告板
// 效能約定：看台為靜態 box、觀眾單一 InstancedMesh（1 draw call）、廣告板共用少量材質
import * as THREE from 'three';
import { COURT } from '../sim/constants.js';

const STAND_COLOR = 0x131a2c;   // 看台結構（暗藍，融進夜色）
const CROWD_COLORS = [0x2a3352, 0x3a2f4a, 0x27354a, 0x40304a, 0x223047, 0x4a3a30];

function hash01(n) {
  let x = Math.imul(n | 0, 2654435761);
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export function createArena(scene) {
  const group = new THREE.Group();

  buildStands(group);
  buildCrowd(group);
  buildAdBoards(group);

  group.traverse((o) => { if (o.isMesh) o.matrixAutoUpdate = false; });
  scene.add(group);
  return group;
}

// 四面看台：各 4 層階梯（長邊沿 z、短邊沿 x），越外越高
const TIERS = 4;
const LONG_X0 = 13.2;   // 長邊看台第一層的 |x|
const SHORT_Z0 = 15.6;  // 短邊看台第一層的 |z|
const TIER_STEP = 2.0;  // 每層外推距離
const TIER_RISE = 1.15; // 每層升高

function buildStands(group) {
  const mat = new THREE.MeshStandardMaterial({ color: STAND_COLOR, roughness: 0.95 });
  for (let t = 0; t < TIERS; t += 1) {
    const y = t * TIER_RISE + 0.5;
    // 長邊 ×2（面向球場，沿 z 展開）
    const longGeo = new THREE.BoxGeometry(TIER_STEP, 1.0, 34);
    for (const sx of [1, -1]) {
      const m = new THREE.Mesh(longGeo, mat);
      m.position.set(sx * (LONG_X0 + t * TIER_STEP), y, 0);
      m.updateMatrix();
      group.add(m);
    }
    // 短邊 ×2（沿 x 展開，避開長邊角落）
    const shortGeo = new THREE.BoxGeometry(24, 1.0, TIER_STEP);
    for (const sz of [1, -1]) {
      const m = new THREE.Mesh(shortGeo, mat);
      m.position.set(0, y, sz * (SHORT_Z0 + t * TIER_STEP));
      m.updateMatrix();
      group.add(m);
    }
  }
}

// 觀眾剪影：單一 InstancedMesh；決定論散佈（hash，非亂數）＋輕微高低與色彩變化
function buildCrowd(group) {
  const spots = [];
  for (let t = 0; t < TIERS; t += 1) {
    const y = t * TIER_RISE + 1.25;
    const lx = LONG_X0 + t * TIER_STEP;
    for (let i = 0; i < 52; i += 1) {
      const z = -15.5 + i * 0.61;
      spots.push([lx, y, z], [-lx, y, z]);
    }
    const sz = SHORT_Z0 + t * TIER_STEP;
    for (let i = 0; i < 36; i += 1) {
      const x = -10.8 + i * 0.62;
      spots.push([x, y, sz], [x, y, -sz]);
    }
  }
  const geo = new THREE.CapsuleGeometry(0.17, 0.36, 3, 8);
  const mat = new THREE.MeshStandardMaterial({ roughness: 1 });
  const crowd = new THREE.InstancedMesh(geo, mat, spots.length);
  const m4 = new THREE.Matrix4();
  const color = new THREE.Color();
  spots.forEach(([x, y, z], i) => {
    // 決定論變化：出席率 88%（缺席者移到地下）、身高與左右微偏
    const h = hash01(i * 7919 + 13);
    const present = h < 0.88;
    const jx = (hash01(i * 104729 + 7) - 0.5) * 0.22;
    const jy = (hash01(i * 1301 + 3) - 0.5) * 0.14;
    m4.makeTranslation(present ? x + jx : 0, present ? y + jy : -50, z);
    crowd.setMatrixAt(i, m4);
    color.setHex(CROWD_COLORS[Math.floor(h * CROWD_COLORS.length) % CROWD_COLORS.length]);
    crowd.setColorAt(i, color);
  });
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  group.add(crowd);
}

// 場邊 LED 廣告板：自由區外緣、面向球場；MeshBasic（不受光）＝自發光 LED 感
const AD_TEXTS = ['排球夢 VOLLEYBALL DREAM', 'SAWMAH SPORTS', 'NIGHT MATCH ★ 夜賽'];
const AD_COLORS = [['#0b1430', '#6ee7ff'], ['#301010', '#ff9d7a'], ['#101f14', '#8dffb0']];

function buildAdBoards(group) {
  const texs = AD_TEXTS.map((t, i) => makeAdTexture(t, AD_COLORS[i][0], AD_COLORS[i][1]));
  const mats = texs.map((map) => new THREE.MeshBasicMaterial({ map, toneMapped: false }));
  const geo = new THREE.PlaneGeometry(7.2, 0.85);
  const edgeX = COURT.WIDTH / 2 + COURT.FREE_ZONE + 0.6;
  const edgeZ = COURT.LENGTH / 2 + COURT.FREE_ZONE + 0.6;
  const put = (x, z, ry, mi) => {
    const m = new THREE.Mesh(geo, mats[mi % mats.length]);
    m.position.set(x, 0.46, z);
    m.rotation.y = ry;
    m.updateMatrix();
    group.add(m);
  };
  // 長邊各 2 面、短邊各 1 面（面向球場中央）
  put(edgeX, 5.5, -Math.PI / 2, 0);
  put(edgeX, -5.5, -Math.PI / 2, 1);
  put(-edgeX, 5.5, Math.PI / 2, 2);
  put(-edgeX, -5.5, Math.PI / 2, 0);
  put(0, edgeZ, Math.PI, 1);
  put(0, -edgeZ, 0, 2);
}

function makeAdTexture(text, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 128);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 1012, 116);
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fg;
  ctx.fillText(text, 512, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
