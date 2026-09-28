// 診斷（唯讀）：__BR=1 時 S2(i)(b) 拆解。新尺＝手臂代表點（R5 NF3：只收主骨屬手臂骨的複製點）；
// 只原頂點＝只量凍結原頂點；原頂點對未拆表面＝把 S_b 三角形的複製點角換回來源後再量原頂點（＝表面沒被拆時的讀數）
import { readFile } from 'node:fs/promises';
import * as V2 from './real-skin-penetration-v2.mjs';
import * as lib from './real-skin-lib.mjs';
const faces = process.argv[2] || '5k'; const base = JSON.parse(await readFile(process.argv[3], 'utf8'));
const setup = await V2.loadSetup(faces);
const { R, Sb } = setup; const F = setup.frozen.fz[faces]; const n0 = F.verts;
let allDup = 0; let armDup = 0;
for (const i of [...F.arm.r, ...F.arm.l]) { allDup += R.reps.get(i).filter((v) => v >= n0).length; armDup += R.armReps.get(i).filter((v) => v >= n0).length; }
console.log(`faces=${faces} R.n=${R.n} 原頂點=${n0}；手臂凍結頂點的被畫出複製點 ${allDup}，其中主骨屬手臂骨（計入手臂代表點）${armDup}、非手臂骨（NF3 排除）${allDup - armDup}`);
const srcOf = new Int32Array(R.n).fill(-1);
for (const [v, reps] of R.reps) for (const a of reps) if (a >= n0) srcOf[a] = v;
const idxUn = Uint32Array.from(R.index, (a) => (a >= n0 && srcOf[a] >= 0 ? srcOf[a] : a));
const cm = (m) => Number((m * 100).toFixed(1));
console.log('| 幀臂 | 現況 | 新尺（手臂代表點） | 只原頂點 | 原頂點對未拆表面 | 判讀 |'); console.log('|---|---|---|---|---|---|');
for (const key of lib.ALL_KEYS) {
  const { P1 } = V2.poseKey(setup, key);
  const Ts = V2.surfaceArrays(P1, R.index, Sb.tris); const bs = V2.triBoxes(Ts);
  const Tu = V2.surfaceArrays(P1, idxUn, Sb.tris); const bu = V2.triBoxes(Tu);
  for (const s of ['r', 'l']) {
    const acc = { rep: [0, 0], orig: [0, 0], un: [0, 0] };
    const add = (a, T, bb, vs) => { let d = -1; for (const v of vs) { const p = [P1[v * 3], P1[v * 3 + 1], P1[v * 3 + 2]]; if (V2.windingNumber(T, p) > 0.5) d = Math.max(d, V2.nearestOnSurface(T, bb, p).d); } if (d >= 0) { a[0] += 1; a[1] = Math.max(a[1], d); } };
    for (const i of R.armVerts[s]) {
      add(acc.rep, Ts, bs, R.armReps.get(i));
      if (R.reps.get(i).includes(i)) { add(acc.orig, Ts, bs, [i]); add(acc.un, Tu, bu, [i]); }
    }
    const z = base.rows[key.id].b.new[s];
    const reg = (x) => x[0] > z.inside || cm(x[1]) > cm(z.maxDepth);
    const f = (x) => `${x[0]}/${cm(x[1])}${reg(x) ? ' ✗' : ''}`;
    const why = !reg(acc.rep) ? '' : reg(acc.un) ? '原頂點在未拆表面也退步' : reg(acc.orig) ? '表面被拆開造成（真實幾何）' : '只因複製點';
    console.log(`| ${key.id}${s === 'r' ? '右' : '左'} | ${z.inside}/${cm(z.maxDepth)} | ${f(acc.rep)} | ${f(acc.orig)} | ${f(acc.un)} | ${why} |`);
  }
}
