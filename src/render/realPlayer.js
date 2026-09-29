// 寫實球員卷 第一階段：Modly 寫實白模綁到既有 geoCharacter 關節樹（純預覽用，不進正式賽場）
//
// 路線：骨架＝createGeoCharacter 建出的不可見關節 Object3D（部件 slot 不建任何 Mesh），
// THREE.Skeleton 直接綁這些關節 ⇒ geoAnimator 照原樣寫關節旋轉，動作零移植。
//
// 關節位置（改的是 **這名球員自己的** 關節 .position，不是 geoCharacter.js 的常數）：
//  ・軀幹關節（pelvis/spine/spineUpper/neck）與髖、肩＝白模解剖地標（相對父關節）
//  ・四肢子關節（膝、肘、腕）＝沿 geo 人的標準方向 −Y（geoCharacter.js 的
//    knee (0,-0.46,0)／elbow (0,-0.32,0)／wrist (0,-0.34,0)），長度取白模量到的肢段長
// 綁定姿勢：肩／肘／髖／膝擺出「−Y 對齊白模 A-pose 肢段」的旋轉（子關節取父框架內的
// 最短弧，肘與膝只有彎、沒有扭），在這個姿勢算 boneInverses，之後全部旋轉歸 0 交給
// geoAnimator ⇒ 動畫寫 0 時四肢跟 geo 人一樣下垂、動作與 geo 人同方向（A2(d)）。
// applyBindPose() 可重現算 boneInverses 當下的姿勢（A2(c)）。
//
// 白模座標系（2026-09-26 實量 player_20k/5k.glb，兩檔同形）：Y 上、身高 2 單位
// （-1..+1）、面向 +Z（腳尖在 +Z）、中線 x≈0 ⇒ 等比縮放到 BASE_H、腳底貼 y=0 後
// 與 geo 人同朝向（右手側＝-X），不需旋轉。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  BASE_H, createGeoCharacter, resolveKit, SKINS, HAIRS, SHOE, idHash,
} from './geoCharacter.js';

// 解剖地標（公尺，BASE_H=1.85 縮放、腳底 y=0 之後的白模空間；左側 = 右側 x 取反）。
// 量自 public/models/real/player_20k.glb（Modly 1790418894_189a5d87_opt20000.glb，雙臂 A-pose
// 約 38°）；量法與重量指令：node tools/real-player-landmarks.mjs（左右兩側鏡像平均；
// 5k 檔同指令量得腿部差 ≤0.01m、手臂差 ≤0.012m，取 20k 值）。
// 2026-09-26 第三輪：腿部改以小腿肚截面＋人體比例定膝、大腿≈小腿定髖（第二輪把寬鬆短褲的
// 褲管口當胯下，髖 0.714／膝 0.403 都偏低）；軀幹關節隨髖重算；shortsHem＝褲管口高（上色用）。
export const LANDMARKS = {
  pelvis: [0, 1.013, -0.021],
  spine: [0, 1.121, -0.021],
  spineUpper: [0, 1.39, -0.037],
  neck: [0, 1.57, -0.048],
  headTop: [0, 1.85, -0.015],
  crotch: [0, 0.893, -0.02],
  shortsHem: [0, 0.65, 0],
  rHip: [-0.084, 0.973, -0.023],
  rKnee: [-0.136, 0.528, -0.012],
  rAnkle: [-0.187, 0.083, -0.052],
  rToe: [-0.203, 0.02, 0.171],
  rShoulder: [-0.178, 1.47, -0.075],
  rElbow: [-0.363, 1.227, -0.049],
  rWrist: [-0.517, 1.041, 0.02],
  rHandTip: [-0.597, 0.877, 0.065],
};
const mirror = (p) => [-p[0], p[1], p[2]];
for (const k of ['Hip', 'Knee', 'Ankle', 'Toe', 'Shoulder', 'Elbow', 'Wrist', 'HandTip']) {
  LANDMARKS[`l${k}`] = mirror(LANDMARKS[`r${k}`]);
}

// 骨頭清單（順序＝skinIndex）與父子關係（取 geoCharacter 的關節樹）
// rAnkle／lAnkle 不在 geo 關節樹裡：是本檔替這名球員自己加在膝下的「腳」骨（geoAnimator 不驅動，
// 預設旋轉 0＝腳跟著小腿走，同 geo 人）；接地時用來讓腳掌保持平放（見 groundLegs）
export const BONES = [
  'pelvis', 'rHip', 'rKnee', 'lHip', 'lKnee', 'spine', 'spineUpper', 'neck',
  'rShoulder', 'rElbow', 'rWrist', 'lShoulder', 'lElbow', 'lWrist', 'rAnkle', 'lAnkle',
];
const PARENT = {
  pelvis: null, rHip: 'pelvis', rKnee: 'rHip', lHip: 'pelvis', lKnee: 'lHip',
  spine: 'pelvis', spineUpper: 'spine', neck: 'spineUpper',
  rShoulder: 'spineUpper', rElbow: 'rShoulder', rWrist: 'rElbow',
  lShoulder: 'spineUpper', lElbow: 'lShoulder', lWrist: 'lElbow',
  rAnkle: 'rKnee', lAnkle: 'lKnee',
};
// 權重用的骨段（每骨一到兩段線段＋半徑；torso＝橢圓截面 rx/rz）
const L = LANDMARKS;
const TORSO = { rx: 0.19, rz: 0.14 };
const SEGMENTS = {
  pelvis: { segs: [[L.crotch, L.spine]], torso: true },
  spine: { segs: [[L.spine, L.spineUpper]], torso: true },
  spineUpper: { segs: [[L.spineUpper, L.neck]], torso: true },
  neck: { segs: [[L.neck, [0, L.headTop[1] - 0.07, L.headTop[2]]]], r: 0.085 },
};
for (const s of ['r', 'l']) {
  // 大腿／小腿同半徑：半徑不同會把「到骨段表面距離」的分界推向細的一側，膝處分界要落在膝關節
  SEGMENTS[`${s}Hip`] = { segs: [[L[`${s}Hip`], L[`${s}Knee`]]], r: 0.075 };
  SEGMENTS[`${s}Knee`] = { segs: [[L[`${s}Knee`], L[`${s}Ankle`]]], r: 0.075 };
  // 腳：踝→腳尖＋踝→腳跟（腳跟點＝踝正下後方，鞋跟內部；不另量地標）
  const heel = [L[`${s}Ankle`][0], 0.04, L[`${s}Ankle`][2] - 0.06];
  SEGMENTS[`${s}Ankle`] = { segs: [[L[`${s}Ankle`], L[`${s}Toe`]], [L[`${s}Ankle`], heel]], r: 0.075 };
  SEGMENTS[`${s}Shoulder`] = { segs: [[L[`${s}Shoulder`], L[`${s}Elbow`]]], r: 0.05 };
  SEGMENTS[`${s}Elbow`] = { segs: [[L[`${s}Elbow`], L[`${s}Wrist`]]], r: 0.042 };
  SEGMENTS[`${s}Wrist`] = { segs: [[L[`${s}Wrist`], L[`${s}HandTip`]]], r: 0.04 };
}

const SIGMA = 0.03; // 權重平滑衰減寬度（m）
const VIS_REACH = 0.06; // 法線測試的有效距離差（m）
const MAX_INFLUENCES = 3;

function closestOnSeg(p, a, b, out) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const t = Math.min(Math.max(
    ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz) / (abx * abx + aby * aby + abz * abz),
    0), 1);
  out[0] = a[0] + abx * t; out[1] = a[1] + aby * t; out[2] = a[2] + abz * t;
  return out;
}

// 自動權重（純函式，可 node 直測）：positions/normals＝綁定姿勢下的 Float32Array。
// 回傳 { skinIndex:Uint16Array(n*4), skinWeight:Float32Array(n*4), primary:Uint8Array(n) }
// 規則：
//  ① 有效骨＝頂點法線朝外於該骨軸（dot(n, v−軸上最近點) > −0.1）——手臂內側貼著軀幹
//     時，前臂內側面的法線朝軀幹、軀幹側面的法線朝外，這一刀把兩片表面分開
//  ② 主骨＝有效骨中「到骨段表面距離」最小者；其餘候選只限主骨的父／子（階層鄰接），
//     手不會綁到髖、軀幹不會跳過肩綁到腕
//  ③ 對側骨硬排除：|x|>0.02 的頂點不得有對側 r*/l* 四肢骨權重
//  ④ exp(−(Δ/σ)²) 平滑衰減、取前 3 骨、正規化
export function computeSkinWeights(positions, normals) {
  const n = positions.length / 3;
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const primary = new Uint8Array(n);
  const p = [0, 0, 0];
  const nn = [0, 0, 0];
  const c = [0, 0, 0];
  const eff = new Float64Array(BONES.length);
  const valid = new Uint8Array(BONES.length);
  const adj = BONES.map((b) => {
    const set = new Set([b]);
    if (PARENT[b]) set.add(PARENT[b]);
    for (const o of BONES) if (PARENT[o] === b) set.add(o);
    return [...set].map((x) => BONES.indexOf(x));
  });
  for (let i = 0; i < n; i += 1) {
    p[0] = positions[i * 3]; p[1] = positions[i * 3 + 1]; p[2] = positions[i * 3 + 2];
    nn[0] = normals[i * 3]; nn[1] = normals[i * 3 + 1]; nn[2] = normals[i * 3 + 2];
    const side = p[0] < -0.02 ? 'r' : (p[0] > 0.02 ? 'l' : null);
    for (let b = 0; b < BONES.length; b += 1) {
      const name = BONES[b];
      const limbSide = /^[rl][A-Z]/.test(name) ? name[0] : null;
      valid[b] = 0;
      eff[b] = Infinity;
      if (side && limbSide && limbSide !== side) continue; // ③
      const seg = SEGMENTS[name];
      let best = Infinity;
      let dot = 0;
      for (const [a, bb] of seg.segs) {
        closestOnSeg(p, a, bb, c);
        const dx = p[0] - c[0], dy = p[1] - c[1], dz = p[2] - c[2];
        const d = Math.hypot(dx, dy, dz);
        let r = seg.r;
        if (seg.torso) {
          const hd = Math.hypot(dx, dz) || 1e-6;
          const cx = dx / hd, cz = dz / hd;
          r = 1 / Math.hypot(cx / TORSO.rx, cz / TORSO.rz);
        }
        if (d - r < best) {
          best = d - r;
          dot = d > 1e-6 ? (nn[0] * dx + nn[1] * dy + nn[2] * dz) / d : 1;
        }
      }
      eff[b] = best;
      if (dot > -0.1) valid[b] = 1;
    }
    // 法線測試只在「近處」有效：有效骨若比全域最近骨遠超過 VIS_REACH，就視為
    // 凹面（手掌內側、指縫）造成的誤判，退回純距離——不讓手心綁到遠處的膝
    let nearest = -1;
    for (let b = 0; b < BONES.length; b += 1) {
      if (eff[b] !== Infinity && (nearest < 0 || eff[b] < eff[nearest])) nearest = b;
    }
    let pb = -1;
    for (let b = 0; b < BONES.length; b += 1) {
      if (valid[b] && eff[b] <= eff[nearest] + VIS_REACH && (pb < 0 || eff[b] < eff[pb])) pb = b;
    }
    const visOk = pb >= 0;
    if (!visOk) pb = nearest;
    primary[i] = pb;
    const cand = [];
    for (const b of adj[pb]) {
      if (eff[b] === Infinity) continue;
      if (b !== pb && !valid[b] && visOk) continue;
      const w = Math.exp(-(((eff[b] - eff[pb]) / SIGMA) ** 2));
      if (w >= 0.05) cand.push([b, w]);
    }
    cand.sort((x, y) => y[1] - x[1]);
    cand.length = Math.min(cand.length, MAX_INFLUENCES);
    const sum = cand.reduce((s, x) => s + x[1], 0);
    for (let k = 0; k < cand.length; k += 1) {
      skinIndex[i * 4 + k] = cand[k][0];
      skinWeight[i * 4 + k] = cand[k][1] / sum;
    }
  }
  return { skinIndex, skinWeight, primary };
}

// 部位標籤（上色用）：依主骨＋綁定姿勢位置（全部相對地標，換白模重量地標即跟著走）
export const PART = { SKIN: 0, HAIR: 1, JERSEY: 2, SHORTS: 3, SHOE: 4, PAD: 5 };
export const PAD_COLOR = 0x1c1d22; // 護膝（原圖黑色）
const WAIST_Y = L.rHip[1] - 0.045; // 球衣下擺（原圖量得 0.92m；髖 0.973 下方約 4.5cm）
const SLEEVE_T = 0.6; // 短袖蓋住上臂（肩→肘）的前 60%
const SHOE_TOP_Y = 0.13 * BASE_H; // 白鞋＋白襪到小腿下段（原圖襪口約 0.24m）
const PAD_HALF = 0.04 * BASE_H; // 護膝以膝關節為中心上下各 0.074m（原圖 0.44～0.60m）
const HAIR_TOP_Y = L.headTop[1] - 0.105;
const HAIR_BACK_Z = L.headTop[2] - 0.02;
const HAIR_BACK_Y = L.neck[1] + 0.06;
function segT(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  return ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2])
    / (ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2]);
}
export function computePartLabels(positions, primary) {
  const n = positions.length / 3;
  const out = new Uint8Array(n);
  const p = [0, 0, 0];
  for (let i = 0; i < n; i += 1) {
    p[0] = positions[i * 3]; p[1] = positions[i * 3 + 1]; p[2] = positions[i * 3 + 2];
    const y = p[1], z = p[2];
    const bone = BONES[primary[i]];
    const side = bone[0];
    let part;
    if (bone === 'neck' || y >= L.neck[1] + 0.02) {
      // 髮：頭頂與後腦（露臉）
      part = (y > HAIR_TOP_Y || (z < HAIR_BACK_Z && y > HAIR_BACK_Y)) ? PART.HAIR : PART.SKIN;
      if (y < L.neck[1] + 0.02 && bone !== 'neck') part = PART.JERSEY;
    } else if (bone === 'spine' || bone === 'spineUpper') {
      part = PART.JERSEY;
    } else if (bone === 'pelvis') {
      part = y >= WAIST_Y ? PART.JERSEY : PART.SHORTS;
    } else if (bone.endsWith('Shoulder')) {
      part = segT(p, L[`${side}Shoulder`], L[`${side}Elbow`]) < SLEEVE_T ? PART.JERSEY : PART.SKIN;
    } else if (bone.endsWith('Elbow') || bone.endsWith('Wrist')) {
      part = PART.SKIN;
    } else if (bone.endsWith('Hip') || bone.endsWith('Knee') || bone.endsWith('Ankle')) { // 大腿／小腿／腳
      if (y >= L.shortsHem[1]) part = PART.SHORTS;
      else if (Math.abs(y - L[`${side}Knee`][1]) <= PAD_HALF) part = PART.PAD;
      else if (y < SHOE_TOP_Y) part = PART.SHOE;
      else part = PART.SKIN;
    }
    out[i] = part;
  }
  return out;
}

// real-skin 修正：烘焙權重（tools/bake-real-skin-weights.mjs 離線產生；熱擴散求解器只在 tools/，src 不含）。
// 檔案＝與白模同名的 `.weights.glb`（PWA 預快取的 models/real/*.glb 自動涵蓋），只放權重 accessor：
// JOINTS_0（UNSIGNED_BYTE VEC4）、WEIGHTS_0（正規化 UNSIGNED_SHORT VEC4）、_PRIMARY（UNSIGNED_BYTE SCALAR＝computeSkinWeights
// 的主骨，部位上色與接縫拆分沿用它）；extras 帶骨名、頂點數與綁定位置雜湊。讀不到或任一項不符 ⇒ 退回 computeSkinWeights
export const WEIGHTS_FORMAT = 'real-skin-weights';
// FNV-1a（32 位元）雜湊縮放、貼地後的綁定位置（Float32 原始位元）：確認烘焙檔對應的是同一個白模
export function positionHash(pos) {
  const u = new Uint32Array(pos.buffer, pos.byteOffset, pos.length);
  let h = 0x811c9dc5;
  for (let i = 0; i < u.length; i += 1) {
    let x = u[i];
    for (let b = 0; b < 4; b += 1) { h ^= x & 0xff; h = Math.imul(h, 0x01000193) >>> 0; x >>>= 8; }
  }
  return h >>> 0;
}
async function loadBakedWeights(url, pos) {
  const wurl = url.replace(/\.glb(\?.*)?$/i, '.weights.glb$1');
  if (wurl === url) return null;
  const fail = (why) => {
    // eslint-disable-next-line no-console
    console.warn(`[real-skin] 烘焙權重不採用（${why}），改用即時計算：${wurl}`);
    return null;
  };
  let buf;
  try {
    const res = await fetch(wurl);
    if (!res.ok) return fail(`HTTP ${res.status}`);
    buf = await res.arrayBuffer();
  } catch (e) {
    return fail(e?.message ?? '讀取失敗');
  }
  const dv = new DataView(buf);
  if (buf.byteLength < 28 || dv.getUint32(0, true) !== 0x46546c67) return fail('不是 GLB');
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const binStart = 20 + jsonLen + 8;
  const ex = json.extras || {};
  const n = pos.length / 3;
  if (ex.format !== WEIGHTS_FORMAT) return fail('格式不符');
  if (!Array.isArray(ex.bones) || ex.bones.join(',') !== BONES.join(',')) return fail('骨名不符');
  if (ex.vertexCount !== n) return fail('頂點數不符');
  if (ex.positionHash !== positionHash(pos)) return fail('白模位置雜湊不符');
  const view = (name, T, comps) => {
    const a = json.accessors.find((x) => x.name === name);
    const bv = json.bufferViews[a.bufferView];
    return new T(buf, binStart + (bv.byteOffset || 0) + (a.byteOffset || 0), a.count * comps);
  };
  const J = view('JOINTS_0', Uint8Array, 4);
  const W = view('WEIGHTS_0', Uint16Array, 4);
  const P = view('_PRIMARY', Uint8Array, 1);
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    let s = 0;
    for (let k = 0; k < 4; k += 1) s += W[i * 4 + k];
    if (!(s > 0)) return fail(`頂點 ${i} 權重和為 0`);
    for (let k = 0; k < 4; k += 1) {
      if (J[i * 4 + k] >= BONES.length) return fail(`頂點 ${i} 骨索引越界`);
      skinIndex[i * 4 + k] = J[i * 4 + k];
      skinWeight[i * 4 + k] = W[i * 4 + k] / s;
    }
  }
  return { skinIndex, skinWeight, primary: Uint8Array.from(P) };
}

// real-skin 修正（驗收修訂 R12，方案 3）：綁定姿勢軀幹符號距離場（tools/bake-real-skin-sdf.mjs 離線產生；
// 距離場求解只在 tools/，src 只讀檔）。檔案＝與白模同名的 `.sdf.glb`：單一 FLOAT accessor `_SDF`（格點值，x 最快），
// extras 帶格點原點 min、格距 h、dims、頂點數與（接縫拆分後）綁定位置雜湊。讀不到或不符 ⇒ 不做碰撞修正（console.warn）
export const SDF_FORMAT = 'real-skin-sdf';
async function loadBakedSdf(url, pos) {
  const surl = url.replace(/\.glb(\?.*)?$/i, '.sdf.glb$1');
  if (surl === url) return null;
  const fail = (why) => {
    // eslint-disable-next-line no-console
    console.warn(`[real-skin] 軀幹距離場不採用（${why}），不做手臂碰撞修正：${surl}`);
    return null;
  };
  let buf;
  try {
    const res = await fetch(surl);
    if (!res.ok) return fail(`HTTP ${res.status}`);
    buf = await res.arrayBuffer();
  } catch (e) {
    return fail(e?.message ?? '讀取失敗');
  }
  const dv = new DataView(buf);
  if (buf.byteLength < 28 || dv.getUint32(0, true) !== 0x46546c67) return fail('不是 GLB');
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const ex = json.extras || {};
  if (ex.format !== SDF_FORMAT) return fail('格式不符');
  if (ex.vertexCount !== pos.length / 3) return fail('頂點數不符');
  if (ex.positionHash !== positionHash(pos)) return fail('白模位置雜湊不符');
  const a = json.accessors.find((x) => x.name === '_SDF');
  const bv = json.bufferViews[a.bufferView];
  const [dx, dy, dz] = ex.dims;
  if (a.count !== dx * dy * dz) return fail('格點數不符');
  const data = new Float32Array(buf.slice(20 + jsonLen + 8 + (bv.byteOffset || 0), 20 + jsonLen + 8 + (bv.byteOffset || 0) + a.count * 4));
  return { data, min: ex.min, h: ex.h, dims: ex.dims };
}

// 碰撞修正的靜態資料（全員共用）：焊接群組（接縫拆分的複製點共用一個位移）、手臂群組（主骨＝肩／肘／腕，且焊接點
// 不含軀幹主骨）、手臂群組的鄰接（CSR；非手臂鄰居記 -1＝位移恆 0）、各群組的頂點與相鄰三角形（重算法線用）
const COLLIDE_TORSO = ['pelvis', 'spine', 'spineUpper'];
function buildCollide(pos, index, primary, sdf) {
  const n = pos.length / 3;
  const armB = new Set(BONES.map((b, i) => (/^[rl](Shoulder|Elbow|Wrist)$/.test(b) ? i : -1)).filter((i) => i >= 0));
  const torsoB = new Set(COLLIDE_TORSO.map((b) => BONES.indexOf(b)));
  const map = new Map(); const g = new Int32Array(n); let ng = 0;
  for (let i = 0; i < n; i += 1) {
    const k = `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
    let v = map.get(k);
    if (v === undefined) { v = ng; ng += 1; map.set(k, v); }
    g[i] = v;
  }
  const armG = new Uint8Array(ng); const torsoG = new Uint8Array(ng);
  for (let i = 0; i < n; i += 1) { if (armB.has(primary[i])) armG[g[i]] = 1; if (torsoB.has(primary[i])) torsoG[g[i]] = 1; }
  const local = new Int32Array(ng).fill(-1); let na = 0;
  for (let q = 0; q < ng; q += 1) if (armG[q] && !torsoG[q]) { local[q] = na; na += 1; }
  const nbr = Array.from({ length: na }, () => new Set());
  const triOf = Array.from({ length: na }, () => []);
  for (let t = 0; t < index.length; t += 3) {
    for (let e = 0; e < 3; e += 1) {
      const a = g[index[t + e]]; const b = g[index[t + (e + 1) % 3]];
      if (a !== b) { if (local[a] >= 0) nbr[local[a]].add(b); if (local[b] >= 0) nbr[local[b]].add(a); }
      if (local[a] >= 0) { const l = triOf[local[a]]; if (l[l.length - 1] !== t) l.push(t); }
    }
  }
  const csr = (lists, f) => {
    const ptr = new Int32Array(na + 1); let m = 0;
    for (let a = 0; a < na; a += 1) { m += lists[a].size ?? lists[a].length; ptr[a + 1] = m; }
    const idx = new Int32Array(m); let o = 0;
    for (let a = 0; a < na; a += 1) for (const x of lists[a]) { idx[o] = f(x); o += 1; }
    return { ptr, idx };
  };
  const adj = csr(nbr, (q) => local[q]);
  const tri = csr(triOf, (t) => t);
  const vl = Array.from({ length: na }, () => []);
  for (let i = 0; i < n; i += 1) if (local[g[i]] >= 0) vl[local[g[i]]].push(i);
  const verts = csr(vl, (i) => i);
  const L = LANDMARKS;
  return {
    sdf, n: na, adj, tri, verts, torso: COLLIDE_TORSO.map((b) => BONES.indexOf(b)),
    // 各軀幹骨負責的綁定高度帶（y）：點轉回該骨綁定空間後落在帶內才查距離場
    bands: [[-Infinity, L.spine[1] + COLLIDE.BAND], [L.spine[1] - COLLIDE.BAND, L.spineUpper[1] + COLLIDE.BAND], [L.spineUpper[1] - COLLIDE.BAND, Infinity]],
  };
}

// 讀白模幾何：縮放到 BASE_H、腳底貼地、補法線（烘焙器 tools/bake-real-skin-weights.mjs 也用這一份）
export async function loadRealGeometry(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  let src = null;
  gltf.scene.traverse((o) => { if (!src && o.isMesh) src = o; });
  if (!src) throw new Error(`寫實白模沒有 Mesh：${url}`);
  const geometry = src.geometry.clone();
  src.updateWorldMatrix(true, false);
  geometry.applyMatrix4(src.matrixWorld);
  geometry.deleteAttribute('normal');
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const s = BASE_H / (bb.max.y - bb.min.y);
  geometry.translate(0, -bb.min.y, 0);
  geometry.scale(s, s, s);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// 載入白模：幾何＋權重（烘焙檔，讀不到則即時計算）＋部位（全員共用）
export async function loadRealPlayerAsset(url, { sdf = true } = {}) {
  const geometry = await loadRealGeometry(url);
  const pos = geometry.attributes.position.array;
  const nor = geometry.attributes.normal.array;
  const baked = await loadBakedWeights(url, pos);
  const w = baked ?? computeSkinWeights(pos, nor);
  const parts = computePartLabels(pos, w.primary);
  const split = splitBridges(pos, nor, geometry.index.array, w, parts);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(split.pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(split.nor, 3));
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(split.skinIndex, 4));
  out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(split.skinWeight, 4));
  out.setIndex(new THREE.Uint32BufferAttribute(split.index, 1));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  const faces = split.index.length / 3;
  // sdf:false 只給烘焙器 tools/bake-real-skin-sdf.mjs 用（產生距離場時還沒有距離場）
  const field = sdf ? await loadBakedSdf(url, split.pos) : null;
  return {
    geometry: out, faces, primary: split.primary, parts: split.parts, url, bridgeTris: split.bridgeTris,
    sole: collectSole(split), weightsSource: baked ? 'baked' : 'computed',
    collide: field ? buildCollide(split.pos, split.index, split.primary, field) : null,
    sdfSource: field ? 'baked' : 'none',
  };
}

// 鞋底頂點（綁定姿勢 y ≤ SOLE_Y）：逐幀接地只算這些點的蒙皮 y（見 createRealPlayer soleMin／groundLegs）
const SOLE_Y = 0.03;
function collectSole(split) {
  const ids = [];
  for (let i = 0; i < split.pos.length / 3; i += 1) if (split.pos[i * 3 + 1] <= SOLE_Y) ids.push(i);
  const n = ids.length;
  const pos = new Float32Array(n * 3); const si = new Uint16Array(n * 4); const sw = new Float32Array(n * 4);
  const bones = new Set();
  ids.forEach((v, k) => {
    for (let c = 0; c < 3; c += 1) pos[k * 3 + c] = split.pos[v * 3 + c];
    for (let c = 0; c < 4; c += 1) {
      si[k * 4 + c] = split.skinIndex[v * 4 + c];
      sw[k * 4 + c] = split.skinWeight[v * 4 + c];
      if (sw[k * 4 + c] > 0) bones.add(si[k * 4 + c]);
    }
  });
  return { n, pos, si, sw, bones: [...bones] };
}

// 骨頭在關節樹上的距離（邊數）
const DEPTH = Object.fromEntries(BONES.map((b) => {
  let d = 0; let p = PARENT[b];
  while (p) { d += 1; p = PARENT[p]; }
  return [b, d];
}));
function treeDist(a, b) {
  const up = (x) => { const s = [x]; while (PARENT[x]) { x = PARENT[x]; s.push(x); } return s; };
  const ua = up(a); const ub = up(b);
  const lca = ua.find((x) => ub.includes(x));
  return ua.indexOf(lca) + ub.indexOf(lca);
}

// 接縫拆分：白模是一整塊 watertight 網格，手掌貼大腿處有三角形直接把「手」和「髖」
// 縫在一起——手一舉，這些三角形被拉成從髖延伸到頭頂的長帶（第一版截圖實見）。
// 橫跨關節樹距離 ≥3 的主骨（腕↔骨盆/髖）的三角形，把非近端那側的頂點複製一份、
// 權重與部位改用近端（較靠根）頂點的，整片三角形歸近端骨：靜止時位置完全不變、
// 面數不變（不刪面），動起來接縫在手的貼身面開口，而不是拉出長帶。
function splitBridges(pos, nor, index, w, parts) {
  const extra = [];
  const newIndex = Uint32Array.from(index);
  let bridgeTris = 0;
  for (let t = 0; t < index.length; t += 3) {
    const vs = [index[t], index[t + 1], index[t + 2]];
    const bs = vs.map((v) => BONES[w.primary[v]]);
    let far = false;
    for (let a = 0; a < 3; a += 1) {
      for (let c = a + 1; c < 3; c += 1) if (treeDist(bs[a], bs[c]) >= 3) far = true;
    }
    if (!far) continue;
    bridgeTris += 1;
    let owner = 0;
    for (let k = 1; k < 3; k += 1) if (DEPTH[bs[k]] < DEPTH[bs[owner]]) owner = k;
    for (let k = 0; k < 3; k += 1) {
      if (k === owner || treeDist(bs[k], bs[owner]) < 3) continue;
      extra.push({ src: vs[k], like: vs[owner] });
      newIndex[t + k] = pos.length / 3 + extra.length - 1;
    }
  }
  const n0 = pos.length / 3;
  const n = n0 + extra.length;
  const P = new Float32Array(n * 3); P.set(pos);
  const N = new Float32Array(n * 3); N.set(nor);
  const SI = new Uint16Array(n * 4); SI.set(w.skinIndex);
  const SW = new Float32Array(n * 4); SW.set(w.skinWeight);
  const PR = new Uint8Array(n); PR.set(w.primary);
  const PT = new Uint8Array(n); PT.set(parts);
  extra.forEach(({ src, like }, e) => {
    const i = n0 + e;
    for (let k = 0; k < 3; k += 1) { P[i * 3 + k] = pos[src * 3 + k]; N[i * 3 + k] = nor[src * 3 + k]; }
    for (let k = 0; k < 4; k += 1) { SI[i * 4 + k] = w.skinIndex[like * 4 + k]; SW[i * 4 + k] = w.skinWeight[like * 4 + k]; }
    PR[i] = w.primary[like];
    PT[i] = parts[like];
  });
  return {
    pos: P, nor: N, skinIndex: SI, skinWeight: SW, primary: PR, parts: PT, index: newIndex, bridgeTris,
  };
}

// 綁定資料（全員共用）：關節位置（相對父關節）與綁定旋轉
const LIMB = { // 子關節 → [父關節, 子關節的下一個地標（算子段方向用，null＝不擺旋轉）]
  rKnee: ['rHip', 'rAnkle'], lKnee: ['lHip', 'lAnkle'],
  rElbow: ['rShoulder', 'rWrist'], lElbow: ['lShoulder', 'lWrist'],
  rWrist: ['rElbow', null], lWrist: ['lElbow', null],
  rAnkle: ['rKnee', null], lAnkle: ['lKnee', null],
};
const DOWN = new THREE.Vector3(0, -1, 0);
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
function computeBind() {
  const position = {};
  const quaternion = {};
  for (const b of BONES) {
    quaternion[b] = new THREE.Quaternion();
    if (LIMB[b]) {
      position[b] = [0, -v3(L[b]).distanceTo(v3(L[LIMB[b][0]])), 0];
    } else {
      const parent = PARENT[b];
      const pw = parent ? L[parent] : [0, 0, 0];
      position[b] = [L[b][0] - pw[0], L[b][1] - pw[1], L[b][2] - pw[2]];
    }
  }
  // 父段（髖／肩）：父框架＝軀幹，綁定時旋轉為 0 ⇒ 世界方向即局部方向
  for (const [seg, child] of [['rHip', 'rKnee'], ['lHip', 'lKnee'], ['rShoulder', 'rElbow'], ['lShoulder', 'lElbow']]) {
    const d = v3(L[child]).sub(v3(L[seg])).normalize();
    quaternion[seg].setFromUnitVectors(DOWN, d);
  }
  // 子段（膝／肘）：在父段框架內取最短弧（只彎不扭）
  for (const b of ['rKnee', 'lKnee', 'rElbow', 'lElbow']) {
    const [parent, next] = LIMB[b];
    const d = v3(L[next]).sub(v3(L[b])).normalize().applyQuaternion(quaternion[parent].clone().invert());
    quaternion[b].setFromUnitVectors(DOWN, d);
  }
  return { position, quaternion };
}
const BIND = computeBind();

// 腿部兩骨 IK（接地用）：踝＝腳骨原點＝膝骨框架內 (0, -小腿長, 0)（綁定時膝的 −Y 對齊踝，見 computeBind）
// 腳掌與小腿一體（geo 關節樹沒有踝關節）：膝彎越多腳尖越往下，踝抬 Δ 時鞋底最低點只抬
// e·Δ（e<1）。迭代時用上一步量到的效率 e 放大下一步的抬高量（割線法），通常 2～4 步收斂
const IK_ITERS = 12;
const IK_EPS = 1e-4;
const FOOT_AIR = 0.01; // 鞋底離地超過這個高度＝騰空：腳骨跟著小腿走（不壓平、不做 IK）

// 寫實專用重定向（real-skin 修正，docs/kickoffs/real-skin-acceptance.md；使用者 09-28 裁定 8°）：
// 寫實白模肩地標 x=0.178（幾何人 0.225）、胸寬 0.19–0.21 m，照幾何人角度下垂的手臂會穿進軀幹。
// 手臂下垂時在肩的局部框架多外展 REST_ABDUCT，隨上臂抬舉角 φ（相對胸節、動畫意圖）以 cos φ 淡出，
// 舉到水平以上歸零——高舉動作不變。只作用在寫實人（geoAnimator 不動）
const REST_ABDUCT = (8 * Math.PI) / 180;
// 胸椎扭轉分段（同上裁定）：animator 的胸扭轉（spineUpper 的 Euler y）移 TWIST_SHARE 到 spine，再反解 spineUpper
// 使胸節的世界朝向與改前完全相同——總扭轉量、雙臂／頭／背號位置都不變，只有中段多轉，蒙皮扭轉分到兩段
const TWIST_SHARE = 0.5;
// 手臂碰撞修正（驗收修訂 R12，方案 3；implicit skinning〔Vaillant et al. 2013〕接觸處理的簡化版）：
// 每幀 CPU 蒙皮後，手臂頂點轉回軀幹骨綁定空間查距離場，穿入（距離 < MARGIN）者沿梯度推到表面外 MARGIN，
// 再在手臂群組上做 SMOOTH 輪鄰居平均（穿入者固定、非手臂鄰居＝0），讓凹痕有過渡。軀幹頂點一律不動（S11）
const COLLIDE = { MARGIN: 0.004, SMOOTH: 6, BAND: 0.03 };

const STUB_POOL = { claim: (key) => ({ key, index: 0 }) };
let MAT = null;
function realMaterial() {
  if (!MAT) MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8, metalness: 0.02 });
  return MAT;
}

// 手臂碰撞修正本體（驗收修訂 R12；見 COLLIDE）。C＝asset.collide、MB＝各骨 matrixWorld·boneInverse（16×骨數，行優先同 three）、
// outP／outN＝已蒙皮的世界座標位置／法線（就地修改）、work＝collideWork(C)。匯出只為實驗治具可在別種蒙皮結果上套同一份修正
export function collideWork(C) {
  return { IT: new Float64Array(3 * 16), D: new Float64Array(C.n * 3), D2: new Float64Array(C.n * 3), hit: new Uint8Array(C.n),
    act: new Int32Array(C.n), inAct: new Uint8Array(C.n), m: new THREE.Matrix4(), stats: { hits: 0, maxPush: 0 } };
}
function sdfAt(f, x, y, z) { // 三線性；格外＝+1（外）
  const nx = f.dims[0]; const ny = f.dims[1]; const nz = f.dims[2];
  const fx = (x - f.min[0]) / f.h; const fy = (y - f.min[1]) / f.h; const fz = (z - f.min[2]) / f.h;
  const i = Math.floor(fx); const j = Math.floor(fy); const k = Math.floor(fz);
  if (i < 0 || j < 0 || k < 0 || i >= nx - 1 || j >= ny - 1 || k >= nz - 1) return 1;
  const u = fx - i; const v = fy - j; const w = fz - k; const a = f.data;
  const o = (k * ny + j) * nx + i; const oy = nx; const oz = nx * ny;
  const c00 = a[o] * (1 - u) + a[o + 1] * u; const c10 = a[o + oy] * (1 - u) + a[o + oy + 1] * u;
  const c01 = a[o + oz] * (1 - u) + a[o + oz + 1] * u; const c11 = a[o + oz + oy] * (1 - u) + a[o + oz + oy + 1] * u;
  return (c00 * (1 - v) + c10 * v) * (1 - w) + (c01 * (1 - v) + c11 * v) * w;
}
export function collideArms(C, MB, outP, outN, index, work) {
  const { IT, D, D2, hit, act, inAct, m: _m, stats } = work;
  stats.hits = 0; stats.maxPush = 0;
  const { MARGIN } = COLLIDE; const hh = C.sdf.h * 0.5;
  let s = 1;
  C.torso.forEach((b, t) => {
    _m.fromArray(MB, b * 16);
    if (t === 0) s = Math.cbrt(_m.determinant());
    _m.invert();
    IT.set(_m.elements, t * 16);
  });
  D.fill(0); D2.fill(0); hit.fill(0); inAct.fill(0);
  let na = 0;
  const { ptr: vp, idx: vi } = C.verts;
  for (let a = 0; a < C.n; a += 1) {
    const v = vi[vp[a]]; const x = outP[v * 3]; const y = outP[v * 3 + 1]; const z = outP[v * 3 + 2];
    let bestD = MARGIN; let bt = -1; let bx = 0; let by = 0; let bz = 0;
    for (let t = 0; t < 3; t += 1) {
      const e = t * 16;
      const qy = IT[e + 1] * x + IT[e + 5] * y + IT[e + 9] * z + IT[e + 13];
      if (qy < C.bands[t][0] || qy > C.bands[t][1]) continue;
      const qx = IT[e] * x + IT[e + 4] * y + IT[e + 8] * z + IT[e + 12];
      const qz = IT[e + 2] * x + IT[e + 6] * y + IT[e + 10] * z + IT[e + 14];
      const d = sdfAt(C.sdf, qx, qy, qz);
      if (d < bestD) { bestD = d; bt = t; bx = qx; by = qy; bz = qz; }
    }
    if (bt < 0) continue;
    const gx = (sdfAt(C.sdf, bx + hh, by, bz) - sdfAt(C.sdf, bx - hh, by, bz)) / (2 * hh);
    const gy = (sdfAt(C.sdf, bx, by + hh, bz) - sdfAt(C.sdf, bx, by - hh, bz)) / (2 * hh);
    const gz = (sdfAt(C.sdf, bx, by, bz + hh) - sdfAt(C.sdf, bx, by, bz - hh)) / (2 * hh);
    const e = C.torso[bt] * 16;
    let nx = MB[e] * gx + MB[e + 4] * gy + MB[e + 8] * gz;
    let ny = MB[e + 1] * gx + MB[e + 5] * gy + MB[e + 9] * gz;
    let nz = MB[e + 2] * gx + MB[e + 6] * gy + MB[e + 10] * gz;
    const ln = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (ln < 1e-9) continue;
    nx /= ln; ny /= ln; nz /= ln;
    const push = (MARGIN - bestD) * s;
    D[a * 3] = nx * push; D[a * 3 + 1] = ny * push; D[a * 3 + 2] = nz * push;
    hit[a] = 1; stats.hits += 1; if (push > stats.maxPush) stats.maxPush = push;
    act[na] = a; na += 1; inAct[a] = 1;
  }
  if (!stats.hits) return stats;
  // 平滑（Jacobi）：每輪先把作用範圍擴一圈鄰居，只更新範圍內的群組——範圍外的群組鄰居全為 0、平均仍為 0，
  // 結果與對全體手臂群組做 Jacobi 逐值相同
  const { ptr: ap, idx: ai } = C.adj;
  let src = D; let dst = D2;
  for (let it = 0; it < COLLIDE.SMOOTH; it += 1) {
    const n0 = na;
    for (let q = 0; q < n0; q += 1) {
      const a = act[q];
      for (let k = ap[a]; k < ap[a + 1]; k += 1) { const j = ai[k]; if (j >= 0 && !inAct[j]) { inAct[j] = 1; act[na] = j; na += 1; } }
    }
    for (let q = 0; q < na; q += 1) {
      const a = act[q];
      if (hit[a]) { dst[a * 3] = src[a * 3]; dst[a * 3 + 1] = src[a * 3 + 1]; dst[a * 3 + 2] = src[a * 3 + 2]; continue; }
      let sx = src[a * 3]; let sy = src[a * 3 + 1]; let sz = src[a * 3 + 2];
      for (let k = ap[a]; k < ap[a + 1]; k += 1) { const j = ai[k]; if (j >= 0) { sx += src[j * 3]; sy += src[j * 3 + 1]; sz += src[j * 3 + 2]; } }
      const c = ap[a + 1] - ap[a] + 1;
      dst[a * 3] = sx / c; dst[a * 3 + 1] = sy / c; dst[a * 3 + 2] = sz / c;
    }
    const tmp = src; src = dst; dst = tmp;
  }
  const { ptr: tp, idx: ti } = C.tri; const ix = index;
  for (let q = 0; q < na; q += 1) {
    const a = act[q];
    const dx = src[a * 3]; const dy = src[a * 3 + 1]; const dz = src[a * 3 + 2];
    if (dx === 0 && dy === 0 && dz === 0) continue;
    for (let k = vp[a]; k < vp[a + 1]; k += 1) { const v = vi[k] * 3; outP[v] += dx; outP[v + 1] += dy; outP[v + 2] += dz; }
  }
  // 位移過的群組：法線改由相鄰三角形（位移後位置）面積加權重算，同群組的複製點共用
  for (let q = 0; q < na; q += 1) {
    const a = act[q];
    if (src[a * 3] === 0 && src[a * 3 + 1] === 0 && src[a * 3 + 2] === 0) continue;
    let sx = 0; let sy = 0; let sz = 0;
    for (let k = tp[a]; k < tp[a + 1]; k += 1) {
      const t = ti[k]; const i0 = ix[t] * 3; const i1 = ix[t + 1] * 3; const i2 = ix[t + 2] * 3;
      const ux = outP[i1] - outP[i0]; const uy = outP[i1 + 1] - outP[i0 + 1]; const uz = outP[i1 + 2] - outP[i0 + 2];
      const wx = outP[i2] - outP[i0]; const wy = outP[i2 + 1] - outP[i0 + 1]; const wz = outP[i2 + 2] - outP[i0 + 2];
      sx += uy * wz - uz * wy; sy += uz * wx - ux * wz; sz += ux * wy - uy * wx;
    }
    const l = Math.sqrt(sx * sx + sy * sy + sz * sz);
    if (l < 1e-12) continue;
    for (let k = vp[a]; k < vp[a + 1]; k += 1) { const v = vi[k] * 3; outN[v] = sx / l; outN[v + 1] = sy / l; outN[v + 2] = sz / l; }
  }
  return stats;
}

// 一名寫實球員：geo 關節樹（搬到白模地標）＋SkinnedMesh（共用位置/權重，獨立頂點色）
// 進賽場卷 2A：新增 teamKit／number（預設 null，與第一階段呼叫端行為完全相同）——
// teamKit 讓正式比賽的隊伍配色覆寫（config.kits）在寫實模式也生效（同一份 resolveKit，
// 同一個值同時餵給內部 createGeoCharacter 的背號槽位與這裡的球衣頂點色，兩處不會分岔）；
// number 讓 createGeoCharacter 建出背號貼齊點（rig.numberSlots），供 matchView 掛面片。
export function createRealPlayer(asset, {
  playerId, teamId, height = BASE_H, isLibero = false, name = '', teamKit = null, number = null,
}) {
  const rig = createGeoCharacter(STUB_POOL, playerId, teamId, height, isLibero, name, teamKit, number);
  const kit = resolveKit(teamId, isLibero, teamKit);
  const h = idHash(playerId);
  const skin = SKINS[h % SKINS.length];
  const hair = HAIRS[(h >> 3) % HAIRS.length];

  const { root, joints } = rig;
  for (const s of ['r', 'l']) { // 本球員自己的腳骨（掛在膝下，不改 geoCharacter）
    const ankle = new THREE.Object3D();
    joints[`${s}Knee`].add(ankle);
    joints[`${s}Ankle`] = ankle;
  }
  for (const b of BONES) {
    const p = BIND.position[b];
    joints[b].position.set(p[0], p[1], p[2]);
    joints[b].quaternion.copy(BIND.quaternion[b]);
  }
  const rootScale = root.scale.x;
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.setScalar(1);
  root.updateMatrixWorld(true);
  const bones = BONES.map((b) => joints[b]);
  const skeleton = new THREE.Skeleton(bones); // 以當下（綁定姿勢）matrixWorld 算 boneInverses
  // 腳掌平放用：綁定時（root 單位變換）腳骨的世界朝向＝白模腳掌平貼地面的朝向
  const footBindQ = { r: joints.rAnkle.getWorldQuaternion(new THREE.Quaternion()), l: joints.lAnkle.getWorldQuaternion(new THREE.Quaternion()) };

  // 驗收修訂 R12（S12 例外）：CPU 蒙皮＋碰撞修正後寫進一般 Mesh——每人一份 position／normal（世界座標，
  // 每幀由 updateSkin 覆寫）；綁定位置／法線／權重留在 asset.geometry（全員共用，見回傳的 bindGeometry）
  const bindGeo = asset.geometry;
  const nv = bindGeo.attributes.position.count;
  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(Float32Array.from(bindGeo.attributes.position.array), 3);
  const norAttr = new THREE.BufferAttribute(Float32Array.from(bindGeo.attributes.normal.array), 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  norAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('normal', norAttr);
  geometry.setIndex(bindGeo.index);
  geometry.boundingBox = asset.geometry.boundingBox;
  geometry.boundingSphere = asset.geometry.boundingSphere;
  const palette = [skin, hair, kit.jersey, kit.shorts, SHOE, PAD_COLOR].map((hex) => new THREE.Color().setHex(hex));
  const n = asset.parts.length;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    const c = palette[asset.parts[i]];
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mesh = new THREE.Mesh(geometry, realMaterial());
  mesh.frustumCulled = false; // 頂點是世界座標、帶著球員跑遍全場，原始包圍球不準
  const bindQuats = BONES.map((b) => joints[b].quaternion.clone());
  for (const b of BONES) joints[b].rotation.set(0, 0, 0); // 交給 geoAnimator 的零姿勢
  const { sole } = asset;
  const soleMats = BONES.map(() => new THREE.Matrix4());
  // side＝'r'／'l'／null（兩腳）：該側鞋底頂點蒙皮後最低 y（世界座標）
  function soleMin(side) {
    joints.rAnkle.updateWorldMatrix(true, false);
    joints.lAnkle.updateWorldMatrix(true, false);
    for (const b of sole.bones) soleMats[b].multiplyMatrices(bones[b].matrixWorld, skeleton.boneInverses[b]);
    let min = Infinity;
    for (let i = 0; i < sole.n; i += 1) {
      const x = sole.pos[i * 3];
      if (side === 'r' ? x >= 0 : side === 'l' ? x < 0 : false) continue; // 右腳在 -X
      const y = sole.pos[i * 3 + 1]; const z = sole.pos[i * 3 + 2];
      let wy = 0;
      for (let k = 0; k < 4; k += 1) {
        const w = sole.sw[i * 4 + k];
        if (w === 0) continue;
        const e = soleMats[sole.si[i * 4 + k]].elements;
        wy += w * (e[1] * x + e[5] * y + e[9] * z + e[13]);
      }
      if (wy < min) min = wy;
    }
    return min;
  }
  // 把骨頭在世界空間轉一下，使世界方向 from 對到 to（改局部四元數，子孫跟著更新）
  const qa = new THREE.Quaternion(); const qw = new THREE.Quaternion(); const qp = new THREE.Quaternion();
  function turnBone(bone, from, to) {
    qa.setFromUnitVectors(from, to);
    bone.getWorldQuaternion(qw);
    bone.parent.getWorldQuaternion(qp);
    bone.quaternion.copy(qp.invert().multiply(qa.multiply(qw)));
    bone.updateMatrixWorld(true);
  }
  const H = new THREE.Vector3(); const K = new THREE.Vector3(); const A = new THREE.Vector3();
  const T = new THREE.Vector3(); const U = new THREE.Vector3(); const P = new THREE.Vector3();
  const K2 = new THREE.Vector3(); const d1 = new THREE.Vector3(); const d2 = new THREE.Vector3();
  const FWD = new THREE.Vector3();
  const preIK = { rHip: new THREE.Vector3(), rKnee: new THREE.Vector3(), lHip: new THREE.Vector3(), lKnee: new THREE.Vector3() };
  const qr = new THREE.Quaternion();
  // 腳掌平放：腳骨世界朝向＝root 朝向 × 綁定時的腳朝向（小腿怎麼傾，腳底都貼平；
  // 沒有這一步時腳掌跟著小腿轉，膝一彎腳尖就往下戳，IK 只好越彎越深、最後踮腳尖跪著）
  function flattenFoot(side) {
    const ankle = joints[`${side}Ankle`];
    ankle.parent.updateWorldMatrix(true, false);
    root.getWorldQuaternion(qr);
    ankle.parent.getWorldQuaternion(qp);
    ankle.quaternion.copy(qp.invert().multiply(qr.multiply(footBindQ[side])));
    ankle.updateMatrixWorld(true);
  }
  // 兩骨解析 IK：骨盆不動，把踝往上抬 lift（世界 m），解髖／膝旋轉。膝只在原動畫的
  // 「髖–膝–踝」平面內、往原本彎的那一側彎（腿打直時取角色正前方＝往前彎）
  function solveLeg(side, lift) {
    const hip = joints[`${side}Hip`]; const knee = joints[`${side}Knee`];
    hip.updateWorldMatrix(true, true);
    hip.getWorldPosition(H); knee.getWorldPosition(K);
    joints[`${side}Ankle`].getWorldPosition(A);
    T.copy(A); T.y += lift;
    const a = K.distanceTo(H); const b = A.distanceTo(K);
    U.subVectors(T, H);
    const c = Math.min(Math.max(U.length(), Math.abs(a - b) + IK_EPS), a + b - IK_EPS);
    U.normalize();
    P.subVectors(K, H); P.addScaledVector(U, -P.dot(U));
    if (P.lengthSq() < 1e-10) {
      root.getWorldDirection(FWD); // Object3D.getWorldDirection＝本地 +Z＝角色正前方
      P.copy(FWD).addScaledVector(U, -FWD.dot(U));
    }
    P.normalize();
    const cosA = Math.min(Math.max((a * a + c * c - b * b) / (2 * a * c), -1), 1);
    K2.copy(H).addScaledVector(U, a * cosA).addScaledVector(P, a * Math.sqrt(1 - cosA * cosA));
    turnBone(hip, d1.subVectors(K, H).normalize(), d2.subVectors(K2, H).normalize());
    knee.getWorldPosition(K);
    joints[`${side}Ankle`].getWorldPosition(A);
    T.copy(H).addScaledVector(U, c);
    turnBone(knee, d1.subVectors(A, K).normalize(), d2.subVectors(T, K).normalize());
  }
  // 寫實專用重定向（見 REST_ABDUCT）：animator（與 matchView 的 reachBias）寫完關節之後、接地 IK 之前套用。
  // animator 每幀都會重寫肩的 x/z，所以偏移不會逐幀累積；同一幀若被呼叫兩次（中間沒有 animator 更新），
  // 先撤銷上一次的偏移再套，結果不變
  const _va = new THREE.Vector3();
  const _qc = new THREE.Quaternion();
  const lastAbduct = { r: null, l: null };
  let lastSplit = null;
  function splitTwist() {
    const sp = joints.spine; const su = joints.spineUpper;
    // 同一幀重入（中間沒有 animator 更新）：已套過就不再套
    if (lastSplit && sp.rotation.y === lastSplit.spineY && su.quaternion.equals(lastSplit.chest)) return;
    const cy = su.rotation.y;
    _qc.copy(sp.quaternion).multiply(su.quaternion); // 胸節相對骨盆（改前）
    sp.rotation.y += cy * TWIST_SHARE; // Euler XYZ：spine 的 x／z 不動
    su.quaternion.copy(sp.quaternion).invert().multiply(_qc); // 反解：spine'·chest' ＝ 改前的 spine·chest
    lastSplit = { spineY: sp.rotation.y, chest: su.quaternion.clone() };
  }
  function retargetArms() {
    splitTwist();
    for (const side of ['r', 'l']) {
      const sh = joints[`${side}Shoulder`];
      const st = lastAbduct[side];
      if (st && sh.rotation.z === st.after) sh.rotation.z -= st.offset;
      _va.set(0, -1, 0).applyEuler(sh.rotation); // 上臂方向（胸節框架）；−y＝cos φ
      const offset = (side === 'r' ? -1 : 1) * REST_ABDUCT * Math.max(0, -_va.y); // 右臂在 −X：外展＝z 負
      sh.rotation.z += offset;
      lastAbduct[side] = { after: sh.rotation.z, offset };
    }
    root.updateMatrixWorld(true);
  }
  // ---- 每幀蒙皮（驗收修訂 R12）：LBS → 手臂碰撞修正 → 寫進 mesh 的 position／normal ----
  const nb = BONES.length;
  const MB = new Float64Array(nb * 16); // 各骨 matrixWorld·boneInverse
  const _m = new THREE.Matrix4();
  const bP = bindGeo.attributes.position.array; const bN = bindGeo.attributes.normal.array;
  const SI = bindGeo.attributes.skinIndex.array; const SW = bindGeo.attributes.skinWeight.array;
  const outP = posAttr.array; const outN = norAttr.array;
  const C = asset.collide;
  const work = C ? collideWork(C) : null;
  const stats = work ? work.stats : { hits: 0, maxPush: 0 };
  function updateSkin() {
    root.updateMatrixWorld(true);
    for (let b = 0; b < nb; b += 1) {
      _m.multiplyMatrices(bones[b].matrixWorld, skeleton.boneInverses[b]);
      MB.set(_m.elements, b * 16);
    }
    for (let i = 0; i < nv; i += 1) {
      const x = bP[i * 3]; const y = bP[i * 3 + 1]; const z = bP[i * 3 + 2];
      const u = bN[i * 3]; const v = bN[i * 3 + 1]; const w = bN[i * 3 + 2];
      let px = 0; let py = 0; let pz = 0; let nx = 0; let ny = 0; let nz = 0;
      for (let k = 0; k < 4; k += 1) {
        const wt = SW[i * 4 + k];
        if (!wt) continue;
        const e = SI[i * 4 + k] * 16;
        px += wt * (MB[e] * x + MB[e + 4] * y + MB[e + 8] * z + MB[e + 12]);
        py += wt * (MB[e + 1] * x + MB[e + 5] * y + MB[e + 9] * z + MB[e + 13]);
        pz += wt * (MB[e + 2] * x + MB[e + 6] * y + MB[e + 10] * z + MB[e + 14]);
        nx += wt * (MB[e] * u + MB[e + 4] * v + MB[e + 8] * w);
        ny += wt * (MB[e + 1] * u + MB[e + 5] * v + MB[e + 9] * w);
        nz += wt * (MB[e + 2] * u + MB[e + 6] * v + MB[e + 10] * w);
      }
      outP[i * 3] = px; outP[i * 3 + 1] = py; outP[i * 3 + 2] = pz;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      outN[i * 3] = nx / l; outN[i * 3 + 1] = ny / l; outN[i * 3 + 2] = nz / l;
    }
    if (C) collideArms(C, MB, outP, outN, bindGeo.index.array, work);
    posAttr.needsUpdate = true;
    norAttr.needsUpdate = true;
  }
  root.scale.setScalar(rootScale);

  return {
    rig, mesh, skeleton, kit, skin, hair, playerId, teamId, isLibero, height, rootScale,
    // 驗收修訂 R12：量尺介面（唯讀）——
    //  bindGeometry：綁定位置／法線／skinIndex／skinWeight（全員共用，與 asset.geometry 同一物件）；
    //  renderedPositions()／renderedNormals()：畫面這一幀實際送進 GPU 的世界座標（mesh.geometry 的同一個陣列，不得寫入）；
    //  updateSkin()：以目前骨架重算 position／normal（groundLegs 結尾已自動呼叫；量尺自己改姿勢後再呼叫）；
    //  skinStats()：最近一次 updateSkin 的碰撞群組數與最大推出量（m）
    bindGeometry: bindGeo,
    renderedPositions: () => outP,
    renderedNormals: () => outN,
    updateSkin,
    skinStats: () => ({ ...stats, collide: Boolean(C) }),
    // 接地（A9／A10）：animator 更新、root 高度寫好之後呼叫。鞋底入地的那隻腳用兩骨 IK
    // 抬回地面（骨盆不動＝保留動畫的下蹲深度）；腳在空中不介入。IK 迭代後仍有殘差
    // （例：蹲到大腿小腿折疊極限、目標比 |大腿−小腿| 還近）才退回抬 root，回傳是否動用。
    // real-skin：開頭先套寫實專用重定向（retargetArms），matchView／realPreview 的呼叫點不用改
    groundLegs() {
      retargetArms();
      // IK 前快照（A2(d) 腿段比的是 animator 寫入後、IK 前的方向）
      joints.rKnee.updateWorldMatrix(true, false);
      joints.lKnee.updateWorldMatrix(true, false);
      for (const b of ['rHip', 'rKnee', 'lHip', 'lKnee']) joints[b].getWorldPosition(preIK[b]);
      let ik = 0;
      for (const side of ['r', 'l']) {
        // 腳掌只在接地時壓平（加嚴・第四批 LOW-1）：先以「腳跟著小腿」量鞋底，離地 > FOOT_AIR
        // 就不動；壓平後若反而懸空（腳尖原本點地、壓平把腳尖抬起）也退回跟著小腿
        let m = soleMin(side);
        if (m > FOOT_AIR) continue;
        flattenFoot(side);
        m = soleMin(side);
        if (m > FOOT_AIR) {
          joints[`${side}Ankle`].rotation.set(0, 0, 0);
          joints[`${side}Ankle`].updateMatrixWorld(true);
          continue;
        }
        let gain = 1;
        for (let it = 0; it < IK_ITERS && m < -IK_EPS; it += 1) {
          const req = -m * gain;
          solveLeg(side, req);
          flattenFoot(side);
          ik += 1;
          const m2 = soleMin(side);
          const eff = (m2 - m) / req; // 這一步踝抬 req，鞋底最低點實際抬了多少比例
          gain = eff > 0.05 ? 1 / eff : gain * 2; // 折到極限（抬不動）時放大再試，仍不行就交給下方抬 root
          m = m2;
        }
      }
      const low = soleMin(null);
      const lifted = low < -IK_EPS;
      if (lifted) { root.position.y -= low; root.updateMatrixWorld(true); }
      updateSkin(); // 驗收修訂 R12：接地之後才蒙皮，mesh 畫的就是這一幀的最終姿勢
      return { ik, lifted, residual: lifted ? -low : 0 };
    },
    legPreIK() {
      return Object.fromEntries(Object.entries(preIK).map(([k, v]) => [k, v.toArray()]));
    },
    // IK 會寫髖／膝的整個四元數（含 animator 不寫的 y／z 分量）：每幀 animator 更新前先歸零
    resetLegs() {
      for (const b of ['rHip', 'lHip', 'rKnee', 'lKnee', 'rAnkle', 'lAnkle']) joints[b].rotation.set(0, 0, 0);
    },
    // 動畫零姿勢：全部關節旋轉歸 0（geoAnimator 接手前的狀態，與 geo 人相同）
    resetPose() {
      for (const b of BONES) joints[b].rotation.set(0, 0, 0);
    },
    // 重現「算 boneInverses 當下」的關節姿勢（A2(c)）。atOrigin＝連 root 也回到
    // 綁定時的單位變換（位置 0、旋轉 0、縮放 1）；否則 root 留在原地（量 C_rest 用）
    applyBindPose({ atOrigin = false } = {}) {
      BONES.forEach((b, i) => joints[b].quaternion.copy(bindQuats[i]));
      if (atOrigin) {
        root.position.set(0, 0, 0);
        root.rotation.set(0, 0, 0);
        root.scale.setScalar(1);
      }
    },
  };
}
