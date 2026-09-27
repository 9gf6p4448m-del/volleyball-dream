// 魚躍「現代貼地救球」提案（feat/dive-proposals，僅供使用者目視挑選；預設遊戲不走這裡）
//
// 切換：網址帶 `?dive=a|b|c` 才生效（matchView 與 ?mode=divelab 預覽共用）；不帶＝現行 dive 逐值不變。
//   a＝sprawl 貼地滑撲：跨步壓低→雙臂平台貼地前伸→胸腹著地前滑→撐地收腿→起身
//   b＝pancake 手掌貼地：低平飛撲、慣用手掌心貼地伸到最遠、另一手撐地緩衝、全身平貼滑行
//   c＝依球高自動：sim 出手瞬間球高 ≥ C_SWITCH_Y 走「跨步平台墊（平台抬到球高）→順勢趴地」，
//      低於門檻改走 b 的 pancake
//
// 時序：三支序列 dur 0.72／jump 0／無 hit，與現行 dive 相同（判定時間由 sim 決定，本檔不碰 sim）。
// 位移：sim 魚躍期間 actor 原地不動（game.js:549），撲出距離全是表現層——root 曲線在
// p＝1（divedUntil 到期）時必須回到 sim 位置、前傾歸零，否則起身後會瞬移。
//
// 左右語意（實測，不從既有 POSES 推論；見 tools/dive-proposal-check.mjs 的 semantics 段）：
//   肩 z 正＝手往 +X 移；角色右手在 −X ⇒ rSh z 正＝右臂內收、lSh z 負＝左臂內收（平台併攏）。
//   髖 x 負＝大腿前抬、膝 x 正＝小腿往後彎（屈膝）；腿偏移欄位 rHipX/lHipX/rKneeX/lKneeX。
//   髖 z 正＝腿往 +X ⇒ rHipZ 負＝右腿外展（蛙腿側收膝）、lHipZ 正＝左腿外展。

import * as THREE from 'three';
import { geometries } from './geoCharacter.js';

export const DIVE_STYLES = ['a', 'b', 'c'];
export const C_SWITCH_Y = 0.45; // c：球高低於此（m）改走 pancake

// 網址參數 → 提案代號；非法值＝null（走現行 dive）
export function diveStyleFromSearch(search) {
  try {
    const v = new URLSearchParams(search).get('dive');
    return DIVE_STYLES.includes(v) ? v : null;
  } catch { return null; }
}

// 提案 → 這一撲要播哪支序列。ballY＝sim 出手那一刻的球高（m，matchView 讀 gameState.ball.y）
export function diveSeqFor(style, ballY = 1) {
  if (style === 'a') return 'diveSprawlA';
  if (style === 'b') return 'divePancakeB';
  if (style === 'c') return ballY >= C_SWITCH_Y ? 'diveLungeC' : 'divePancakeB';
  return 'dive';
}

// ---- 姿勢（欄位語意同 geoAnimator POSES；另加腿偏移 rHipX/lHipX/rKneeX/lKneeX）----
// 右手選手的「慣用側」＝r；左手選手由 geoAnimator 鏡像（左右對調、肩 z 取反）
export const DIVE_PROPOSAL_POSES = {
  // A sprawl：弓箭步壓低（慣用側腳在前）→ 雙臂併攏平台斜下伸 → 前腳一推、後腿順勢往後甩直，
  // 胸腹貼地往前滑、平台貼地前伸 → 雙手撐地、雙膝收到髖下 → 站起
  diveA_step: {
    rSh: [-1.3, 0.3], lSh: [-1.3, -0.3], rEl: 0, lEl: 0, spine: 0.35, neck: -0.55, crouch: 0, spineUp: 0.05,
    rHipX: -0.95, lHipX: 0.1, rKneeX: 1.0, lKneeX: 0.25,
  },
  diveA_reach: {
    rSh: [-1.95, 0.3], lSh: [-1.95, -0.3], rEl: 0, lEl: 0, spine: 0.2, neck: -0.75, crouch: 0, spineUp: 0,
    rHipX: -1.3, lHipX: 0.2, rKneeX: 1.35, lKneeX: 0.35,
  },
  diveA_slide: {
    rSh: [-2.95, 0.16], lSh: [-2.95, -0.16], rEl: 0, lEl: 0, spine: -0.06, neck: -0.85, crouch: 0, spineUp: -0.12,
    rHipX: 0, lHipX: 0.08, rKneeX: 1.1, lKneeX: 0.35, rHipZ: -0.8,
  },
  diveA_push: {
    rSh: [-1.2, -0.1], lSh: [-1.2, 0.1], rEl: -0.35, lEl: -0.35, spine: 0.4, neck: -0.6, crouch: 0, spineUp: 0.1,
    rHipX: -1.45, lHipX: -1.45, rKneeX: 1.95, lKneeX: 1.95,
  },
  diveA_rise: {
    rSh: [-0.55, -0.18], lSh: [-0.55, 0.18], rEl: -0.5, lEl: -0.5, spine: 0.55, neck: -0.35, crouch: 0.3, spineUp: 0.1,
  },
  // B pancake：一步低平飛撲、全身幾乎與地平行 → 慣用手臂伸到最遠、手掌平貼地板（球彈在手背）、
  // 非慣用手斜前外側撐地緩衝 → 胸腹著地前滑 → 撐地收腿 → 站起
  diveB_launch: {
    rSh: [-1.7, 0.1], lSh: [-1.5, -0.1], rEl: 0, lEl: -0.3, spine: 0.3, neck: -0.7, crouch: 0, spineUp: 0,
    rHipX: -0.85, lHipX: 0.25, rKneeX: 0.8, lKneeX: 0.3,
  },
  diveB_reach: {
    rSh: [-2.7, 0.08], lSh: [-2.3, 0.35], rEl: 0, lEl: -0.35, spine: 0.02, neck: -0.9, crouch: 0, spineUp: -0.1, wrist: -0.5,
    rHipX: 0.1, lHipX: 0.1, rKneeX: 0.15, lKneeX: 0.15,
  },
  diveB_slide: {
    rSh: [-3.0, 0.06], lSh: [-2.35, 0.4], rEl: 0, lEl: -0.4, spine: -0.08, neck: -0.9, crouch: 0, spineUp: -0.15, wrist: -0.5,
    rHipX: 0.05, lHipX: 0.05, rKneeX: 0.3, lKneeX: 0.3,
  },
  // C 高球：跨步平台墊（雙臂在球高、身體還沒倒）→ 觸球後順勢倒成 A 的滑撲
  diveC_step: {
    rSh: [-1.35, 0.3], lSh: [-1.35, -0.3], rEl: 0, lEl: 0, spine: 0.3, neck: -0.45, crouch: 0, spineUp: 0.05,
    rHipX: -0.8, lHipX: 0.1, rKneeX: 0.85, lKneeX: 0.2,
  },
  diveC_platform: {
    rSh: [-1.8, 0.32], lSh: [-1.8, -0.32], rEl: 0, lEl: 0, spine: 0.25, neck: -0.55, crouch: 0, spineUp: 0.05,
    rHipX: -1.2, lHipX: 0.15, rKneeX: 1.3, lKneeX: 0.3,
  },
};

const K = (at, p) => ({ at, p });
export const DIVE_PROPOSAL_SEQUENCES = {
  diveSprawlA: {
    dur: 0.72, jump: 0, land: false,
    keys: [K(0, 'bumpReady'), K(0.07, 'diveA_step'), K(0.14, 'diveA_reach'), K(0.32, 'diveA_slide'),
      K(0.5, 'diveA_slide'), K(0.7, 'diveA_push'), K(0.86, 'diveA_rise'), K(1, 'bumpReady')],
  },
  divePancakeB: {
    dur: 0.72, jump: 0, land: false,
    keys: [K(0, 'bumpReady'), K(0.07, 'diveB_launch'), K(0.16, 'diveB_reach'), K(0.32, 'diveB_slide'),
      K(0.52, 'diveB_slide'), K(0.7, 'diveA_push'), K(0.86, 'diveA_rise'), K(1, 'bumpReady')],
  },
  diveLungeC: {
    dur: 0.72, jump: 0, land: false,
    keys: [K(0, 'bumpReady'), K(0.07, 'diveC_step'), K(0.14, 'diveC_platform'), K(0.22, 'diveC_platform'),
      K(0.38, 'diveA_slide'), K(0.52, 'diveA_slide'), K(0.7, 'diveA_push'), K(0.86, 'diveA_rise'), K(1, 'bumpReady')],
  },
};

// ---- root 曲線（p＝撲救進度 0→1，同 matchView：1 − remain/DIVE_RECOVER）----
// fwd＝沿朝向位移（m，乘身高比例前的基準身高 1.85 值）、up＝root 額外抬升（m）、tilt＝前傾（rad）
// 關鍵幀之間 smoothstep；p≥1 恆為 0（回到 sim 位置）
const ROOT_KEYS = {
  // root 原點＝雙腳下方；前傾以腳為支點 ⇒ 趴地時 root 往後（腿往後甩），骨盆與手自然落在前方
  diveSprawlA: [
    [0, 0, 0, 0], [0.07, 0.3, 0, 0.35], [0.14, 0.45, 0, 0.75], [0.32, -0.1, 0, 1.5],
    [0.5, -0.05, 0, 1.5], [0.7, 0.1, 0, 0.9], [0.86, 0.04, 0, 0.35], [1, 0, 0, 0],
  ],
  divePancakeB: [
    [0, 0, 0, 0], [0.07, 0.3, 0, 0.5], [0.16, 0.05, 0, 1.4], [0.32, -0.2, 0, 1.52],
    [0.52, -0.12, 0, 1.52], [0.7, 0.1, 0, 0.9], [0.86, 0.04, 0, 0.35], [1, 0, 0, 0],
  ],
  diveLungeC: [
    [0, 0, 0, 0], [0.07, 0.3, 0, 0.25], [0.14, 0.55, 0, 0.45], [0.22, 0.55, 0, 0.55], [0.38, -0.05, 0, 1.5],
    [0.52, 0, 0, 1.5], [0.7, 0.1, 0, 0.9], [0.86, 0.04, 0, 0.35], [1, 0, 0, 0],
  ],
};

const ss = (t) => t * t * (3 - 2 * t);
export function diveRootPose(seq, p) {
  const keys = ROOT_KEYS[seq];
  if (!keys || p >= 1) return { fwd: 0, up: 0, tilt: 0 };
  if (p <= 0) return { fwd: 0, up: 0, tilt: 0 };
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1][0]) i += 1;
  const a = keys[i]; const b = keys[i + 1];
  const f = ss(Math.min(Math.max((p - a[0]) / (b[0] - a[0]), 0), 1));
  return {
    fwd: a[1] + (b[1] - a[1]) * f,
    up: a[2] + (b[2] - a[2]) * f,
    tilt: a[3] + (b[3] - a[3]) * f,
  };
}

// 現行 dive 的 root 曲線（matchView.js:411-430 的同式複本，只給預覽與檢查治具當對照；
// matchView 預設路徑仍用它自己的原碼，本函式不被遊戲呼叫）
const LEGACY = { LUNGE: 1.35, TILT: 1.2, HOP: 0.22 };
export function legacyDiveRootPose(p) {
  if (p >= 1) return { fwd: 0, up: 0, tilt: 0 };
  let lungeP;
  if (p < 0.3) lungeP = (p / 0.3) ** 0.6;
  else if (p < 0.5) lungeP = 1;
  else lungeP = 1 - ss(Math.min((p - 0.5) / 0.36, 1));
  let tiltP;
  if (p < 0.24) tiltP = p / 0.24;
  else if (p < 0.62) tiltP = 1;
  else tiltP = 1 - ss((p - 0.62) / 0.38);
  const hop = p < 0.4 ? LEGACY.HOP * Math.sin((p / 0.4) * Math.PI) : 0;
  return { fwd: LEGACY.LUNGE * lungeP, up: hop, tilt: LEGACY.TILT * tiltP };
}

// ---- 接地補償（只在提案路徑呼叫）----
// geoAnimator 的下蹲是「root 下壓 0.55×crouch、腿用固定係數彎」的近似，腳本來就會入地
// （遊戲既有待命姿勢鞋尖約 −0.06 m）。魚躍身體會趴到地上，近似誤差更大，所以提案路徑在
// root 擺好後量全身最低點，低於 DIVE_FLOOR_TARGET 才把 root 往上抬（只抬不壓）。
// 對向條件（防整個人浮起來）由 tools/dive-proposal-check.mjs 的 H／G 兩條把關。
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
