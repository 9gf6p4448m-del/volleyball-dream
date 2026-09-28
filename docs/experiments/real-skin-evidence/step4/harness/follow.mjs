// 手臂跟隨度：依上臂參數 t 分箱，手臂頂點（主骨 r/l Shoulder/Elbow）的「非手臂鏈權重」（軀幹骨等）平均與最大
import { pathToFileURL } from 'node:url';
import { makeMod } from './evalh.mjs';
const WT = 'C:/Users/shung/worktrees/volleyball-skin';
const BK = await import(pathToFileURL(`${WT}/tools/bake-real-skin-weights.mjs`).href);
const faces = process.argv[2] || '5k';
const P = JSON.parse(process.argv[3] || '{}');
const params = { ...BK.PARAMS, ...P, AUX: { ...BK.PARAMS.AUX, ...(P.AUX || {}) } };
const rp = await makeMod([]);
const V2 = await import(pathToFileURL(`${WT}/tools/real-skin-penetration-v2.mjs`).href);
V2.installNodeFetch();
const g = await rp.loadRealGeometry(pathToFileURL(`${WT}/public/models/real/player_${faces}.glb`).href);
const pos = g.attributes.position.array;
const w = BK.bakeWeights(rp, pos, g.attributes.normal.array, g.index.array, params);
const L = rp.LANDMARKS; const n = pos.length / 3;
const chain = new Set(rp.BONES.map((b, j) => (/^[rl](Shoulder|Elbow|Wrist|ArmAux|ArmHalf)$/.test(b) ? j : -1)).filter((j) => j >= 0));
const bins = {};
for (let i = 0; i < n; i++) {
  const b = rp.BONES[w.primary[i]]; if (!/^r(Shoulder|Elbow)$/.test(b)) continue;
  const a = L.rShoulder, e = L.rElbow, wr = L.rWrist;
  const p = [pos[i*3], pos[i*3+1], pos[i*3+2]];
  const tt = (a, b) => { const ab = [b[0]-a[0], b[1]-a[1], b[2]-a[2]]; return ((p[0]-a[0])*ab[0]+(p[1]-a[1])*ab[1]+(p[2]-a[2])*ab[2])/(ab[0]**2+ab[1]**2+ab[2]**2); };
  const t = b === 'rShoulder' ? tt(a, e) : 1 + tt(e, wr);
  let off = 0; for (let k = 0; k < 4; k++) if (!chain.has(w.skinIndex[i*4+k])) off += w.skinWeight[i*4+k];
  const key = (Math.floor(t * 10) / 10).toFixed(1);
  const bb = (bins[key] ??= { n: 0, sum: 0, max: 0 }); bb.n++; bb.sum += off; bb.max = Math.max(bb.max, off);
}
console.log(Object.entries(bins).sort((x, y) => Number(x[0]) - Number(y[0])).filter(([k]) => Number(k) >= 0).map(([k, v]) => `t${k}:${(v.sum / v.n).toFixed(2)}/${v.max.toFixed(2)}`).join(' '));
