// S14 判讀（使用者追加要求 3；不改 S14 定義或門檻，只把 armpitWeb 的逐點 δ 拆開看）：
// 對 K1a、K4b，在同一組權重（DQS 欄的熱擴散權重）上比較 LBS 與 DQS 的逐點 δ，並列出 δ>2 cm 的點分布在
//  ・上臂段參數 t（0.3–0.5／0.5–0.7／0.7–1）
//  ・綁定時的朝向：內側（徑向朝軀幹，cos>0.3）／外側（cos<−0.3）／前後
//  ・非手臂骨權重（>0.3＝被軀幹拖住的皮）
// 並找出最大 δ 的點。δ 的算法照抄 tools/real-skin-armpit-web.mjs（當幀臂軸距離／臂段長度比 − 綁定臂軸距離，代表點取最差）。
// 用法：node diag-s14.mjs <5k|20k>
import { loadSetup, lib, V2 } from './evalx.mjs';
import { variantRp, DQS_WEIGHTS, skinDQS, skinDQSCollide } from './exp-dqs.mjs';
import { deltas } from './s14delta.mjs';
const faces = process.argv[2] || '20k';
const src = await import('../../../../../src/render/realPlayer.js');
const nonArmW = (G, BONES) => {
  const AI = new Set(['rShoulder', 'rElbow', 'rWrist', 'lShoulder', 'lElbow', 'lWrist'].map((b) => BONES.indexOf(b)));
  const SI = G.attributes.skinIndex.array; const SW = G.attributes.skinWeight.array;
  return (v) => { let s = 0; for (let q = 0; q < 4; q += 1) if (!AI.has(SI[v * 4 + q])) s += SW[v * 4 + q]; return s; };
};
function summarize(rows, naw) {
  const off = rows.filter((x) => x.d > 0.02);
  const bin = (f) => off.filter(f).length;
  const mx = rows.reduce((a, b) => (b.d > a.d ? b : a));
  return {
    n: rows.length, off: off.length,
    t: [bin((x) => x.t < 0.5), bin((x) => x.t >= 0.5 && x.t < 0.7), bin((x) => x.t >= 0.7)],
    side: [bin((x) => x.cosIn > 0.3), bin((x) => x.cosIn < -0.3), bin((x) => Math.abs(x.cosIn) <= 0.3)],
    dragged: bin((x) => naw(x.v) > 0.3),
    max: { d: +(mx.d * 100).toFixed(1), t: +mx.t.toFixed(2), cosIn: +mx.cosIn.toFixed(2), nonArmW: +naw(mx.v).toFixed(2), v: mx.v, pos: mx.pos.map((x) => +x.toFixed(4)) },
  };
}
const VARS = [['方案3', src, null], ['同權重LBS', null, 'lbs'], ['DQS', null, 'dqs'], ['DQS＋碰撞', null, 'dqsc']];
const rpV = await variantRp(DQS_WEIGHTS);
const setups = { src: await loadSetup(faces, src), v: await loadSetup(faces, rpV) };
const result = {};
for (const key of lib.ALL_KEYS.filter((k) => ['K1a', 'K4b'].includes(k.id))) {
  for (const [name, mod, mode] of VARS) {
    const setup = mod ? setups.src : setups.v;
    const real = lib.makeReal(setup.mods, setup.loaded);
    lib.driveKey(setup.mods, [real], key);
    let P1;
    if (mode === 'dqs') P1 = skinDQS(real.p).P;
    else if (mode === 'dqsc') P1 = skinDQSCollide(real.p, rpV, setup.loaded).P;
    else if (mode === 'lbs') P1 = lib.skinPositions(V2.MODS.THREE, { mesh: { skeleton: real.p.skeleton, geometry: setup.G } });
    else P1 = Float32Array.from(real.p.renderedPositions());
    const dd = deltas(setup, real.p.skeleton, P1, faces);
    const naw = nonArmW(setup.G, setup.mods.rp.BONES);
    result[`${key.id} ${name}`] = { r: summarize(dd.r, naw), l: summarize(dd.l, naw) };
  }
}
for (const [k, v] of Object.entries(result)) {
  for (const s of ['r', 'l']) {
    const x = v[s];
    console.log(`${k} ${s}：δ>2cm ${x.off}/${x.n}；t[0.3-0.5,0.5-0.7,0.7-1]=${x.t.join('/')}；內側/外側/前後=${x.side.join('/')}；非手臂權重>0.3=${x.dragged}；最大 δ ${x.max.d} cm @t=${x.max.t} cosIn=${x.max.cosIn} 非手臂權重=${x.max.nonArmW} 頂點${x.max.v} 位置${JSON.stringify(x.max.pos)}`);
  }
}
console.log('JSON', JSON.stringify(result));
