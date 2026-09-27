// 魚躍方案 A（sprawl 滑撲）root 曲線與接地補償——使用者選定 A 後併入正式版
// （docs/kickoffs/real-player-stage2-match.md 修訂紀錄 DA1）。姿勢與序列已直接移植進
// geoAnimator.js 的 POSES（diveA_step/diveA_reach/diveA_slide/diveA_push/diveA_rise）
// 與 SEQUENCES.dive（取代原 dive），本檔只留 matchView 與 tools/dive-proposal-check.mjs
// 共用的 root 位移／前傾曲線與接地補償（純表現層，不含 sim；來源＝分支
// feat/dive-proposals 的 diveStyles.js，只保留方案 A、拿掉 B/C 與 ?dive= 切換）。
//
// 位移：sim 魚躍期間 actor 原地不動（game.js:549），撲出距離全是表現層——root 曲線在
// p＝1（divedUntil 到期）時必須回到 sim 位置、前傾歸零，否則起身後會瞬移。
import { geometries } from './geoCharacter.js';

// ---- root 曲線（p＝撲救進度 0→1，同 matchView：1 − remain/DIVE_RECOVER）----
// fwd＝沿朝向位移（m，乘身高比例前的基準身高 1.85 值）、up＝root 額外抬升（m）、tilt＝前傾（rad）
// 關鍵幀之間 smoothstep；p≥1 恆為 0（回到 sim 位置）
// root 原點＝雙腳下方；前傾以腳為支點 ⇒ 趴地時 root 往後（腿往後甩），骨盆與手自然落在前方
const ROOT_KEYS = [
  [0, 0, 0, 0], [0.07, 0.3, 0, 0.35], [0.14, 0.45, 0, 0.75], [0.32, -0.1, 0, 1.5],
  [0.5, -0.05, 0, 1.5], [0.7, 0.1, 0, 0.9], [0.86, 0.04, 0, 0.35], [1, 0, 0, 0],
];

const ss = (t) => t * t * (3 - 2 * t);
export function diveRootPose(p) {
  if (p >= 1 || p <= 0) return { fwd: 0, up: 0, tilt: 0 };
  let i = 0;
  while (i < ROOT_KEYS.length - 2 && p > ROOT_KEYS[i + 1][0]) i += 1;
  const a = ROOT_KEYS[i]; const b = ROOT_KEYS[i + 1];
  const f = ss(Math.min(Math.max((p - a[0]) / (b[0] - a[0]), 0), 1));
  return {
    fwd: a[1] + (b[1] - a[1]) * f,
    up: a[2] + (b[2] - a[2]) * f,
    tilt: a[3] + (b[3] - a[3]) * f,
  };
}

// ---- 接地補償 ----
// geoAnimator 的下蹲是關節角度的近似解，魚躍身體會趴到地上、近似誤差更大，所以 root 擺好後
// 量全身最低點，低於 DIVE_FLOOR_TARGET 才把 root 往上抬（只抬不壓）。
export const DIVE_FLOOR_TARGET = -0.02;
let SUPPORT = null;
function supportPoints() {
  if (SUPPORT) return SUPPORT;
  SUPPORT = {};
  for (const [key, geo] of Object.entries(geometries())) {
    const pos = geo.attributes.position;
    const seen = new Set();
    const pts = [];
    for (let i = 0; i < pos.count; i += 1) {
      const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      pts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    SUPPORT[key] = pts;
  }
  return SUPPORT;
}
// 幾何人全身最低點（世界 y）；呼叫前 root.updateMatrixWorld(true) 必須已做
export function geoBodyMinY(rig) {
  const sp = supportPoints();
  let min = Infinity;
  for (const part of rig.parts) {
    const pts = sp[part.key];
    const e = part.node.matrixWorld.elements;
    for (let i = 0; i < pts.length; i += 3) {
      const y = e[1] * pts[i] + e[5] * pts[i + 1] + e[9] * pts[i + 2] + e[13];
      if (y < min) min = y;
    }
  }
  return min;
}
export function diveGroundLift(minY, target = DIVE_FLOOR_TARGET) {
  return minY < target ? target - minY : 0;
}
