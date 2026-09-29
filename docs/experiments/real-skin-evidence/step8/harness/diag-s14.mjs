// step8 S14 拆解（R13：S14 若仍紅須附；S14 定義與門檻不動，只把 armpit-web 的逐點 δ 拆開看）
// 比較同一組權重、同一個姿勢下：
//  ・新正式版（src：DQS＋碰撞修正，讀 renderedPositions）
//  ・同權重 LBS（lib.skinPositions，綁定幾何＋同骨架）
//  ・同權重 LBS＋碰撞修正（src collideArms 套在 LBS 上：分離「DQS」與「碰撞修正」各自的貢獻）
// 每幀每臂列：δ>2cm 點數；按綁定上臂段參數 t 分帶 [0,0.3)／[0.3,0.7)／[0.7,∞)；按綁定朝向 內側（徑向朝軀幹 cos>0.3）／
// 外側（cos<−0.3）／前後；以及其中非手臂骨權重 >0.3 的點數；最大 δ 與其位置。
// 用法：node diag-s14.mjs <5k|20k>
import { loadSetup, lib, V2 } from '../../step7/harness/evalx.mjs';
import { boneMatrices } from '../../step7/harness/exp-dqs.mjs';
import { deltas } from '../../step7/harness/s14delta.mjs';
const faces = process.argv[2] || '20k';
const src = await import('../../../../../src/render/realPlayer.js');
const setup = await loadSetup(faces, src);
const G = setup.G;
const AI = new Set(['rShoulder', 'rElbow', 'rWrist', 'lShoulder', 'lElbow', 'lWrist'].map((b) => src.BONES.indexOf(b)));
const SI = G.attributes.skinIndex.array; const SW = G.attributes.skinWeight.array;
const naw = (v) => { let s = 0; for (let q = 0; q < 4; q += 1) if (!AI.has(SI[v * 4 + q])) s += SW[v * 4 + q]; return s; };
function lbsNormals(p) {
  const MB = boneMatrices(p.skeleton); const Nn = G.attributes.normal.array; const N = new Float32Array(Nn.length);
  for (let i = 0; i < Nn.length / 3; i += 1) {
    let x = 0; let y = 0; let z = 0;
    for (let k = 0; k < 4; k += 1) { const w = SW[i * 4 + k]; if (!w) continue; const e = SI[i * 4 + k] * 16; x += w * (MB[e] * Nn[i * 3] + MB[e + 4] * Nn[i * 3 + 1] + MB[e + 8] * Nn[i * 3 + 2]); y += w * (MB[e + 1] * Nn[i * 3] + MB[e + 5] * Nn[i * 3 + 1] + MB[e + 9] * Nn[i * 3 + 2]); z += w * (MB[e + 2] * Nn[i * 3] + MB[e + 6] * Nn[i * 3 + 1] + MB[e + 10] * Nn[i * 3 + 2]); }
    const l = Math.sqrt(x * x + y * y + z * z) || 1; N[i * 3] = x / l; N[i * 3 + 1] = y / l; N[i * 3 + 2] = z / l;
  }
  return { N, MB };
}
const work = src.collideWork(setup.loaded.collide);
const sum = (rows) => {
  const off = rows.filter((x) => x.d > 0.02); const c = (f) => off.filter(f).length;
  const mx = rows.reduce((a, b) => (b.d > a.d ? b : a));
  return {
    off: off.length, t: [c((x) => x.t < 0.3), c((x) => x.t >= 0.3 && x.t < 0.7), c((x) => x.t >= 0.7)],
    side: [c((x) => x.cosIn > 0.3), c((x) => x.cosIn < -0.3), c((x) => Math.abs(x.cosIn) <= 0.3)], drag: c((x) => naw(x.v) > 0.3),
    max: { d: +(mx.d * 100).toFixed(1), t: +mx.t.toFixed(2), cosIn: +mx.cosIn.toFixed(2), naw: +naw(mx.v).toFixed(2), pos: mx.pos.map((q) => +q.toFixed(4)) },
  };
};
const out = {};
console.log(`S14 拆解 ${faces}｜欄位：δ>2cm 點數 [t<0.3 / 0.3–0.7 / ≥0.7] {內側/外側/前後} 非手臂權重>0.3 的點數｜最大 δ cm (t, cosIn, 非手臂權重)`);
for (const key of lib.ALL_KEYS) {
  const real = lib.makeReal(setup.mods, setup.loaded); lib.driveKey(setup.mods, [real], key);
  const pNew = Float32Array.from(real.p.renderedPositions());
  const pL = lib.skinPositions(V2.MODS.THREE, { mesh: { skeleton: real.p.skeleton, geometry: G } });
  const { N, MB } = lbsNormals(real.p); const pLC = Float32Array.from(pL);
  src.collideArms(setup.loaded.collide, MB, pLC, N, G.index.array, work);
  for (const [name, P] of [['新正式版 DQS＋碰撞', pNew], ['同權重 LBS', pL], ['同權重 LBS＋碰撞', pLC]]) {
    const dd = deltas(setup, real.p.skeleton, P, faces);
    const r = sum(dd.r); const l = sum(dd.l);
    (out[key.id] = out[key.id] || {})[name] = { r, l };
    const f = (x) => `${x.off} [${x.t.join('/')}] {${x.side.join('/')}} 拖${x.drag}｜max ${x.max.d} (${x.max.t}, ${x.max.cosIn}, ${x.max.naw})`;
    console.log(`${key.id} ${name.padEnd(12, '　')} 右 ${f(r)}　左 ${f(l)}`);
  }
}
console.log('JSON', JSON.stringify(out));
