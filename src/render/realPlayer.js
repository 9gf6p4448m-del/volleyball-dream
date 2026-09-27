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

// 載入白模：縮放到 BASE_H、腳底貼地、補法線、算一次權重與部位（全員共用）
export async function loadRealPlayerAsset(url) {
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
  const pos = geometry.attributes.position.array;
  const nor = geometry.attributes.normal.array;
  const w = computeSkinWeights(pos, nor);
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
  return {
    geometry: out, faces, primary: split.primary, parts: split.parts, url, bridgeTris: split.bridgeTris,
    sole: collectSole(split),
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

const STUB_POOL = { claim: (key) => ({ key, index: 0 }) };
let MAT = null;
function realMaterial() {
  if (!MAT) MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8, metalness: 0.02 });
  return MAT;
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

  const geometry = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'skinIndex', 'skinWeight']) {
    geometry.setAttribute(k, asset.geometry.attributes[k]);
  }
  geometry.setIndex(asset.geometry.index);
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

  const mesh = new THREE.SkinnedMesh(geometry, realMaterial());
  mesh.frustumCulled = false; // 骨架帶著網格跑遍全場，原始包圍球不準
  mesh.bind(skeleton, new THREE.Matrix4());
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
  root.scale.setScalar(rootScale);

  return {
    rig, mesh, skeleton, kit, skin, hair, playerId, teamId, isLibero, height, rootScale,
    // 接地（A9／A10）：animator 更新、root 高度寫好之後呼叫。鞋底入地的那隻腳用兩骨 IK
    // 抬回地面（骨盆不動＝保留動畫的下蹲深度）；腳在空中不介入。IK 迭代後仍有殘差
    // （例：蹲到大腿小腿折疊極限、目標比 |大腿−小腿| 還近）才退回抬 root，回傳是否動用
    groundLegs() {
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
