// S15：桌機 node 每人每幀耗時（ms，暖機 20 次後取 200 次平均；K1a、K4b 兩個姿勢各量一次）。12 人合計＝單人×12（單執行緒循序）
// 方案3＝p.updateSkin()（遊戲每幀實際呼叫的那一個：LBS＋碰撞修正＋寫 position／normal）；另拆出 collideArms 單獨耗時
import { loadSetup, lib, V2 } from './evalx.mjs';
import { variantRp, DQS_WEIGHTS, skinDQS, skinDQSCollide, boneMatrices } from './exp-dqs.mjs';
const faces = process.argv[2] || '5k';
const src = await import('../../../../../src/render/realPlayer.js');
const rpD = await variantRp(DQS_WEIGHTS);
const sS = await loadSetup(faces, src); const sD = await loadSetup(faces, rpD);
const time = (f) => { for (let i = 0; i < 20; i += 1) f(); const t = performance.now(); for (let i = 0; i < 200; i += 1) f(); return (performance.now() - t) / 200; };
const row = {};
for (const key of lib.ALL_KEYS.filter((k) => ['K1a', 'K4b'].includes(k.id))) {
  const a = lib.makeReal(sS.mods, sS.loaded); lib.driveKey(sS.mods, [a], key);
  const P0 = Float32Array.from(a.p.renderedPositions()); const N0 = Float32Array.from(a.p.renderedNormals());
  const MB = boneMatrices(a.p.skeleton); const w = src.collideWork(sS.loaded.collide);
  const P = new Float32Array(P0.length); const N = new Float32Array(N0.length);
  const copy = time(() => { P.set(P0); N.set(N0); });
  const coll = time(() => { P.set(P0); N.set(N0); src.collideArms(sS.loaded.collide, MB, P, N, sS.G.index.array, w); }) - copy;
  const s3 = time(() => a.p.updateSkin());
  const b = lib.makeReal(sD.mods, sD.loaded); lib.driveKey(sD.mods, [b], key);
  const dq = time(() => skinDQS(b.p)); const dqc = time(() => skinDQSCollide(b.p, rpD, sD.loaded));
  row[key.id] = { s3, s3collide: coll, dqs: dq, dqsc: dqc, hits: a.p.skinStats().hits };
}
const f2 = (x) => x.toFixed(2);
console.log(`S15 ${faces}（頂點 ${sS.G.attributes.position.count}；node ${process.version}；${process.platform}）`);
for (const [k, v] of Object.entries(row)) console.log(`${k}：方案3 updateSkin ${f2(v.s3)} ms（其中碰撞修正 ${f2(v.s3collide)} ms，碰撞群組 ${v.hits}）→ 12 人 ${f2(v.s3 * 12)} ms｜DQS ${f2(v.dqs)} ms → 12 人 ${f2(v.dqs * 12)}｜DQS＋碰撞 ${f2(v.dqsc)} ms → 12 人 ${f2(v.dqsc * 12)}`);
