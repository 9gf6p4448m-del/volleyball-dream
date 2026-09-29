// step8 S15 優化等價性：src 正式版（每骨每幀一次 DQ、預配置緩衝、內聯）vs step7 比較原型（每幀逐骨 decompose、配置陣列、閉包），
// 同一個受測者（同骨架姿勢、同烘焙權重、同 SDF、同一份 collideArms）逐幀比對：
//  ① 頂點位置 Float32 逐位元　② 法線 Float32 逐位元　③ 快速評估治具輸出（兩種讀法各跑一次）逐行相同
// 用法：node equiv.mjs <5k|20k>
import { createHash } from 'node:crypto';
import { evaluate, loadSetup, lib } from '../../step7/harness/evalx.mjs';
import { skinDQSCollide } from '../../step7/harness/exp-dqs.mjs';
const faces = process.argv[2] || '5k';
const src = await import('../../../../../src/render/realPlayer.js');
const setup = await loadSetup(faces, src);
const sha = (a) => createHash('sha256').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex').slice(0, 12);
let bad = 0;
for (const key of lib.ALL_KEYS) {
  const real = lib.makeReal(setup.mods, setup.loaded);
  lib.driveKey(setup.mods, [real], key);
  const A = Float32Array.from(real.p.renderedPositions()); const AN = Float32Array.from(real.p.renderedNormals());
  const B = skinDQSCollide(real.p, src, setup.loaded);
  const same = Buffer.compare(Buffer.from(A.buffer), Buffer.from(B.P.buffer)) === 0;
  const sameN = Buffer.compare(Buffer.from(AN.buffer), Buffer.from(B.N.buffer)) === 0;
  let dP = 0; let dN = 0;
  for (let i = 0; i < A.length; i += 1) { dP = Math.max(dP, Math.abs(A[i] - B.P[i])); dN = Math.max(dN, Math.abs(AN[i] - B.N[i])); }
  if (!same || !sameN) bad += 1;
  console.log(`${key.id} 位置 ${same ? '逐位元相同' : `不同（最大差 ${dP}）`} sha ${sha(A)}/${sha(B.P)}｜法線 ${sameN ? '逐位元相同' : `不同（最大差 ${dN}）`}`);
}
const r1 = await evaluate(src, faces, { setup });
const r2 = await evaluate(src, faces, { setup, skin: (p) => skinDQSCollide(p, src, setup.loaded) });
const L1 = r1.lines.join('\n'); const L2 = r2.lines.join('\n');
console.log(`治具輸出（正式版 renderedPositions vs 原型算法）：${L1 === L2 ? '逐行相同' : '不同'}（${r1.lines.length} 行）`);
console.log(`結論：${bad === 0 && L1 === L2 ? '等價' : '不等價'}`);
