// 診斷（唯讀，不提交為量尺）：R12 下 S11 的 s 改用畫面位置（DQS＋碰撞），r 仍為 R4 的軀幹三骨 LBS。
// 量：計入頂點中「受測權重只含三軀幹骨」者（R4 原意 d 應為 0 的那群）在各幀的 d 最大值，
// 以及同一批頂點若 s 改用全權重 LBS 時的 d 最大值（對照：LBS 下應 ≈0）。
import * as THREE from 'three';
import * as lib from './real-skin-lib.mjs';
import * as V2 from './real-skin-penetration-v2.mjs';
const faces = process.argv[2] || '5k';
const setup = await V2.loadSetup(faces);
const F = setup.frozen.fz[faces]; const B = setup.mods.rp.BONES;
const SI = setup.G.attributes.skinIndex.array; const SW = setup.G.attributes.skinWeight.array;
const TI = ['pelvis', 'spine', 'spineUpper'].map((b) => B.indexOf(b));
const torsoOnly = []; const mixed = [];
F.SbVerts.ids.forEach((i, k) => { if (!['pelvis', 'spine', 'spineUpper'].includes(F.SbVerts.mainBone[k])) return; let nt = 0; for (let q = 0; q < 4; q++) if (SW[i * 4 + q] > 0 && !TI.includes(SI[i * 4 + q])) nt += SW[i * 4 + q]; (nt === 0 ? torsoOnly : mixed).push(k); });
console.log(`faces=${faces} 讀法=${setup.rendered ? 'rendered' : 'skinned'}；計入頂點中只含軀幹三骨權重 ${torsoOnly.length}、含非軀幹骨 ${mixed.length}`);
for (const key of lib.ALL_KEYS) {
  const { real, P1 } = V2.poseKey(setup, key);
  const sk = real.p.skeleton;
  const M = sk.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, sk.boneInverses[i]).elements);
  const P0 = setup.R.P;
  const lbs = (i, torso) => { let ws = 0; const o = [0, 0, 0]; for (let q = 0; q < 4; q++) { const w = SW[i * 4 + q]; if (!w) continue; const b = SI[i * 4 + q]; if (torso && !TI.includes(b)) continue; ws += w; const e = M[b]; const x = P0[i * 3], y = P0[i * 3 + 1], z = P0[i * 3 + 2]; o[0] += w * (e[0] * x + e[4] * y + e[8] * z + e[12]); o[1] += w * (e[1] * x + e[5] * y + e[9] * z + e[13]); o[2] += w * (e[2] * x + e[6] * y + e[10] * z + e[14]); } return o.map((v) => v / ws); };
  let mxR = 0; let mxL = 0; let n2 = 0;
  for (const k of torsoOnly) { const i = F.SbVerts.ids[k]; const r = lbs(i, true); const sL = lbs(i, false); const dR = Math.hypot(P1[i * 3] - r[0], P1[i * 3 + 1] - r[1], P1[i * 3 + 2] - r[2]); const dL = Math.hypot(sL[0] - r[0], sL[1] - r[1], sL[2] - r[2]); mxR = Math.max(mxR, dR); mxL = Math.max(mxL, dL); if (dR > 0.02) n2++; }
  console.log(`${key.id}: 只含軀幹骨頂點 |s−r| 最大 ${(mxR * 100).toFixed(2)} cm（>2cm ${n2} 點）；若 s 用全權重 LBS 則 ${(mxL * 100).toFixed(4)} cm`);
}
