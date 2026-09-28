#!/usr/bin/env node
// 跳躍前飄卷：把 tools/jump-drift-measure.mjs 的報告 JSON 判成 J2–J8 逐條過／不過
// （docs/kickoffs/jump-drift-acceptance.md，含修訂 R1–R3）。
// 用法：node tools/jump-drift-verdict.mjs <after.json> [<before.json>]
//   before 給了就另算 J4（改後中位數 ≤ 改前中位數、改後最大 ≤ 改前最大＋0.02）與改前同一把尺的數字。
// 樣本：J2–J7 用「正式比賽 6 場」（場次名不含 #J8）；J8 只看 #J8 場次裡 A2 的扣球／後排攻擊。
import { readFileSync } from 'node:fs';

const STEP = 0.07; // R1
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const f3 = (v) => (v == null ? 'null' : Number(v).toFixed(3));

const j2Fail = (r) => r.dRender == null || r.dRender < 0.8 * r.dSim;
const j3Fail = (r) => r.airMaxStep > STEP || r.airMinForwardDelta < -1e-9;
const j5Fail = (r) => r.minNetDist < 0.15 || r.wrongSideFrames > 0;
// J7：只判落地後有看滿 0.5 s 的樣本（得分後重新佈陣的瞬移截斷者列 skipped）
const j7Judged = (r) => r.landed && r.postLandSec >= 0.5;
const j7Fail = (r) => r.mergeMaxStep > STEP || !(r.mergedAtSec != null && r.mergedAtSec <= 0.5);

function verdict(rep, label) {
  const main = rep.rows.filter((r) => !String(r.seed).includes('#J8'));
  const seeds = [...new Set(main.map((r) => r.seed))];
  const out = { label, seeds: seeds.length, cats: {} };
  for (const cat of ['spike', 'back', 'jumpServe']) {
    const rs = main.filter((r) => r.cat === cat);
    const judged7 = rs.filter(j7Judged);
    const o = {
      n: rs.length,
      J2: cat === 'jumpServe'
        ? { rule: 'R3 起跳→落地沿發球方向 0.6–1.5 m', landed: rs.filter((r) => r.landed).length,
          min: Math.min(...rs.filter((r) => r.landed).map((r) => r.serveDrift)), max: Math.max(...rs.filter((r) => r.landed).map((r) => r.serveDrift)),
          fail: rs.filter((r) => r.landed && !(r.serveDrift >= 0.6 && r.serveDrift <= 1.5)).map((r) => `${r.seed}/${r.id}@${r.takeoffTick}:${f3(r.serveDrift)}`) }
        : { ratioMin: Math.min(...rs.map((r) => (r.dSim > 1e-6 ? r.dRender / r.dSim : Infinity))),
          fail: rs.filter(j2Fail).map((r) => `${r.seed}/${r.id}@${r.takeoffTick}:${f3(r.dRender)}<0.8×${f3(r.dSim)}(起跳→擊球 ${r.hitFrames} 幀)`) },
      J3: { maxStep: Math.max(...rs.map((r) => r.airMaxStep)), minFwd: Math.min(...rs.map((r) => r.airMinForwardDelta)),
        fail: rs.filter(j3Fail).map((r) => `${r.seed}/${r.id}@${r.takeoffTick}:step ${f3(r.airMaxStep)} fwd ${r.airMinForwardDelta.toExponential(2)}`) },
      J5: { minNet: Math.min(...rs.map((r) => r.minNetDist)), wrongSide: rs.reduce((a, r) => a + r.wrongSideFrames, 0), fail: rs.filter(j5Fail).length },
      J7: { judged: judged7.length, skipped: rs.length - judged7.length,
        mergedMax: Math.max(...judged7.map((r) => r.mergedAtSec ?? Infinity)), stepMax: Math.max(...judged7.map((r) => r.mergeMaxStep)),
        fail: judged7.filter(j7Fail).map((r) => `${r.seed}/${r.id}@${r.takeoffTick}:land ${f3(r.residAtLand)} merged ${f3(r.mergedAtSec)} step ${f3(r.mergeMaxStep)}`) },
    };
    out.cats[cat] = o;
  }
  // J6
  const blocks = main.filter((r) => r.cat === 'block');
  const sets = main.filter((r) => r.cat === 'jumpSet');
  out.J6 = {
    block: { n: blocks.length, allZero: blocks.every((r) => r.driftAllZero === true), exposed: blocks.every((r) => r.driftAllZero !== null) },
    jumpSet: { n: sets.length, maxDrift: sets.length ? Math.max(...sets.map((r) => r.maxDrift ?? NaN)) : null },
  };
  // J4
  const hb = main.filter((r) => (r.cat === 'spike' || r.cat === 'back') && r.handBall != null).map((r) => r.handBall);
  out.J4 = { n: hb.length, median: med(hb), max: Math.max(...hb) };
  // J8
  const a2 = rep.rows.filter((r) => String(r.seed).includes('#J8') && r.a2 && (r.cat === 'spike' || r.cat === 'back'));
  out.J8 = {
    n: a2.length, taps: rep.sessions.filter((s) => String(s.seed).includes('#J8')).map((s) => `${s.seed}:${s.j8Taps}`),
    rows: a2.map((r) => ({
      at: `${r.seed}@${r.takeoffTick}`, dRender: f3(r.dRender), dSim: f3(r.dSim), hitFrames: r.hitFrames,
      J2: !j2Fail(r), J3: !j3Fail(r), J5: !j5Fail(r), J7: j7Judged(r) ? !j7Fail(r) : 'skipped',
      step: f3(r.airMaxStep), net: f3(r.minNetDist), merged: f3(r.mergedAtSec), mstep: f3(r.mergeMaxStep),
    })),
  };
  return out;
}

const [afterPath, beforePath] = process.argv.slice(2);
const A = verdict(load(afterPath), 'after');
const B = beforePath ? verdict(load(beforePath), 'before') : null;
const show = (v) => {
  console.log(`== ${v.label}（正式比賽 ${v.seeds} 場）`);
  for (const [cat, o] of Object.entries(v.cats)) {
    console.log(`[${cat}] n=${o.n}`);
    console.log(`  J2 ${cat === 'jumpServe' ? `落地 ${o.J2.landed}、位移 ${f3(o.J2.min)}–${f3(o.J2.max)} m` : `d_render/d_sim 最小 ${f3(o.J2.ratioMin)}`}；不過 ${o.J2.fail.length}${o.J2.fail.length ? `：${o.J2.fail.slice(0, 6).join('；')}` : ''}`);
    console.log(`  J3 單幀最大 ${f3(o.J3.maxStep)} m、沿前進方向最小增量 ${o.J3.minFwd.toExponential(2)}；不過 ${o.J3.fail.length}${o.J3.fail.length ? `：${o.J3.fail.slice(0, 4).join('；')}` : ''}`);
    console.log(`  J5 離網最小 ${f3(o.J5.minNet)} m、對方側幀 ${o.J5.wrongSide}；不過 ${o.J5.fail}`);
    console.log(`  J7 判 ${o.J7.judged}（截斷略過 ${o.J7.skipped}）、併回最慢 ${f3(o.J7.mergedMax)} s、併回單幀最大 ${f3(o.J7.stepMax)} m；不過 ${o.J7.fail.length}${o.J7.fail.length ? `：${o.J7.fail.slice(0, 4).join('；')}` : ''}`);
  }
  console.log(`[J6] 攔網 n=${v.J6.block.n} 前飄全幀恰為 0：${v.J6.block.exposed ? v.J6.block.allZero : '（改前無此欄）'}；跳舉 n=${v.J6.jumpSet.n} 最大偏移 ${f3(v.J6.jumpSet.maxDrift)} m`);
  console.log(`[J4] 扣球＋後排 n=${v.J4.n} 手球落差 中位 ${f3(v.J4.median)} 最大 ${f3(v.J4.max)}`);
  console.log(`[J8] A2 扣球 n=${v.J8.n}（代打次數 ${v.J8.taps.join(' ')}）`);
  for (const r of v.J8.rows) console.log(`  ${JSON.stringify(r)}`);
};
if (B) show(B);
show(A);
if (B) {
  const ok = A.J4.median <= B.J4.median && A.J4.max <= B.J4.max + 0.02;
  console.log(`[J4 判定] 改前 中位 ${f3(B.J4.median)}／最大 ${f3(B.J4.max)} → 改後 中位 ${f3(A.J4.median)}／最大 ${f3(A.J4.max)}：${ok ? '過' : '不過'}`);
}
