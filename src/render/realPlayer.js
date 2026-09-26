// 寫實球員卷 第一階段：Modly 寫實白模綁到既有 geoCharacter 關節樹（純預覽用，不進正式賽場）
//
// 路線：骨架＝createGeoCharacter 建出的不可見關節 Object3D（部件 slot 不建任何 Mesh），
// THREE.Skeleton 直接綁這些關節 ⇒ geoAnimator 照原樣寫關節旋轉，動作零移植。
//
// 綁定姿勢＝「geoAnimator 的零旋轉姿勢」：本檔把 **這名球員自己的** 關節位置
// （.position，不是 geoCharacter.js 的常數）搬到白模的解剖地標上、旋轉全 0，
// 在這個狀態算 boneInverses。之後動畫寫的絕對旋轉＝相對白模原始姿勢的旋轉：
// 待命時四肢維持白模本身的張角（手臂微張、雙腿微開），動作姿勢照 POSES 旋轉。
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
// 量法：每 4cm 高度切片，取 |x|>0.205 的手臂截面質心／x<0 的腿截面質心
// （scratchpad axis.mjs 實跑輸出，見回報）。
export const LANDMARKS = {
  pelvis: [0, 0.74, -0.02],
  spine: [0, 0.88, -0.03],
  spineUpper: [0, 1.18, -0.03],
  neck: [0, 1.54, -0.02],
  headTop: [0, 1.85, 0],
  crotch: [0, 0.62, -0.01],
  rHip: [-0.12, 0.68, 0],
  rKnee: [-0.16, 0.38, -0.02],
  rAnkle: [-0.175, 0.1, -0.03],
  rToe: [-0.19, 0.02, 0.15],
  rShoulder: [-0.235, 1.42, -0.05],
  rElbow: [-0.265, 1.1, -0.045],
  rWrist: [-0.27, 0.9, 0.01],
  rHandTip: [-0.255, 0.68, 0.01],
};
const mirror = (p) => [-p[0], p[1], p[2]];
for (const k of ['Hip', 'Knee', 'Ankle', 'Toe', 'Shoulder', 'Elbow', 'Wrist', 'HandTip']) {
  LANDMARKS[`l${k}`] = mirror(LANDMARKS[`r${k}`]);
}

// 骨頭清單（順序＝skinIndex）與父子關係（取 geoCharacter 的關節樹）
export const BONES = [
  'pelvis', 'rHip', 'rKnee', 'lHip', 'lKnee', 'spine', 'spineUpper', 'neck',
  'rShoulder', 'rElbow', 'rWrist', 'lShoulder', 'lElbow', 'lWrist',
];
const PARENT = {
  pelvis: null, rHip: 'pelvis', rKnee: 'rHip', lHip: 'pelvis', lKnee: 'lHip',
  spine: 'pelvis', spineUpper: 'spine', neck: 'spineUpper',
  rShoulder: 'spineUpper', rElbow: 'rShoulder', rWrist: 'rElbow',
  lShoulder: 'spineUpper', lElbow: 'lShoulder', lWrist: 'lElbow',
};
// 權重用的骨段（每骨一到兩段線段＋半徑；torso＝橢圓截面 rx/rz）
const L = LANDMARKS;
const TORSO = { rx: 0.19, rz: 0.14 };
const SEGMENTS = {
  pelvis: { segs: [[L.crotch, L.spine]], torso: true },
  spine: { segs: [[L.spine, L.spineUpper]], torso: true },
  spineUpper: { segs: [[L.spineUpper, [0, 1.5, -0.03]]], torso: true },
  neck: { segs: [[L.neck, [0, 1.78, 0]]], r: 0.085 },
};
for (const s of ['r', 'l']) {
  SEGMENTS[`${s}Hip`] = { segs: [[L[`${s}Hip`], L[`${s}Knee`]]], r: 0.07 };
  SEGMENTS[`${s}Knee`] = { segs: [[L[`${s}Knee`], L[`${s}Ankle`]], [L[`${s}Ankle`], L[`${s}Toe`]]], r: 0.05 };
  SEGMENTS[`${s}Shoulder`] = { segs: [[L[`${s}Shoulder`], L[`${s}Elbow`]]], r: 0.05 };
  SEGMENTS[`${s}Elbow`] = { segs: [[L[`${s}Elbow`], L[`${s}Wrist`]]], r: 0.042 };
  SEGMENTS[`${s}Wrist`] = { segs: [[L[`${s}Wrist`], L[`${s}HandTip`]]], r: 0.04 };
}

const SIGMA = 0.03;
const VIS_REACH = 0.06; // 法線測試的有效距離差（m） // 權重平滑衰減寬度（m）
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

// 部位標籤（上色用）：依主骨＋綁定姿勢高度
export const PART = { SKIN: 0, HAIR: 1, JERSEY: 2, SHORTS: 3, SHOE: 4 };
const WAIST_Y = 0.86;
const SLEEVE_END_Y = L.rElbow[1] + 0.12;
const SHORTS_HEM_Y = L.rKnee[1] + 0.13;
const SHOE_TOP_Y = 0.12;
export function computePartLabels(positions, primary) {
  const n = positions.length / 3;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    const bone = BONES[primary[i]];
    let part;
    if (bone === 'neck' || y >= L.neck[1] + 0.02) {
      // 髮：頭頂與後腦（露臉）
      part = (y > 1.745 || (z < -0.035 && y > 1.63)) ? PART.HAIR : PART.SKIN;
      if (y < L.neck[1] + 0.02 && bone !== 'neck') part = PART.JERSEY;
    } else if (bone === 'spine' || bone === 'spineUpper') {
      part = PART.JERSEY;
    } else if (bone === 'pelvis') {
      part = y >= WAIST_Y ? PART.JERSEY : PART.SHORTS;
    } else if (bone.endsWith('Shoulder')) {
      part = y >= SLEEVE_END_Y ? PART.JERSEY : PART.SKIN;
    } else if (bone.endsWith('Elbow') || bone.endsWith('Wrist')) {
      part = PART.SKIN;
    } else if (bone.endsWith('Hip')) {
      part = y >= SHORTS_HEM_Y ? PART.SHORTS : PART.SKIN;
    } else { // Knee（小腿＋腳）
      part = y < SHOE_TOP_Y ? PART.SHOE : PART.SKIN;
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
  };
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

const STUB_POOL = { claim: (key) => ({ key, index: 0 }) };
let MAT = null;
function realMaterial() {
  if (!MAT) MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8, metalness: 0.02 });
  return MAT;
}

// 一名寫實球員：geo 關節樹（搬到白模地標）＋SkinnedMesh（共用位置/權重，獨立頂點色）
export function createRealPlayer(asset, {
  playerId, teamId, height = BASE_H, isLibero = false, name = '',
}) {
  const rig = createGeoCharacter(STUB_POOL, playerId, teamId, height, isLibero, name, null, null);
  const kit = resolveKit(teamId, isLibero, null);
  const h = idHash(playerId);
  const skin = SKINS[h % SKINS.length];
  const hair = HAIRS[(h >> 3) % HAIRS.length];

  // 綁定姿勢：關節位置＝地標（相對父關節）、旋轉全 0、root 單位變換
  const { root, joints } = rig;
  for (const b of BONES) {
    const parent = PARENT[b];
    const w = LANDMARKS[b];
    const pw = parent ? LANDMARKS[parent] : [0, 0, 0];
    joints[b].position.set(w[0] - pw[0], w[1] - pw[1], w[2] - pw[2]);
    joints[b].rotation.set(0, 0, 0);
  }
  const rootScale = root.scale.x;
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.setScalar(1);
  root.updateMatrixWorld(true);
  const bones = BONES.map((b) => joints[b]);
  const skeleton = new THREE.Skeleton(bones); // 以當下（綁定姿勢）matrixWorld 算 boneInverses

  const geometry = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'skinIndex', 'skinWeight']) {
    geometry.setAttribute(k, asset.geometry.attributes[k]);
  }
  geometry.setIndex(asset.geometry.index);
  geometry.boundingBox = asset.geometry.boundingBox;
  geometry.boundingSphere = asset.geometry.boundingSphere;
  const palette = [skin, hair, kit.jersey, kit.shorts, SHOE].map((hex) => new THREE.Color().setHex(hex));
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
  root.scale.setScalar(rootScale);

  return {
    rig, mesh, skeleton, kit, skin, hair, playerId, teamId, isLibero,
    // 回到綁定姿勢（治具量 C_rest/J_rest 用；root 位置/朝向由呼叫端另存）
    resetToBind() {
      for (const b of BONES) joints[b].rotation.set(0, 0, 0);
    },
  };
}
