// 卷五 量測項 2（2026-08-02）：MB 的可及範圍——B 快的擊球點可以拉多遠
//
// 待裁題（題 1）要定 B 快的 lx／lz／t／助跑起點／步數／TEMPO。上游明令走「先量再定」，
// 因為本專案已抓到八個恆假判斷式，共同形狀都是「拿一個看起來合理的數字去卡另一個
// 沒實際量過的量」。本探針量的就是那個「沒量過的量」：
//
//   ① MB 現行 quick 的助跑實況：runTicks（起步→起跳的 tick 數）、助跑距離、隱含速度
//   ② **步數改了會不會動到起跳時機**（上游點名要回答的）
//   ③ 在起跳時刻不變的前提下，助跑最多能拉到多長 ⇒ 可及距離上限
//
// ★ ②③ 的關鍵事實在 `approach.js:917-925` 的 `routeTicks`：
//     takeoffTick = (tempo==='three' ? setTick+runTicks : setTick - TEMPO[tempo].takeoffLead) - comboLead
//     startTick   = takeoffTick - runTicks
//   一速／二速的 takeoffTick **完全不吃 runTicks** ⇒ 助跑拉長只把**起步**往前推，
//   起跳錨死在二傳觸球前 takeoffLead 個 tick。三速才是反過來（起步錨在觸球、起跳往後推）。
//   下面 §② 用**真實的 routeTicks 函式**（不是重抄一份算式）機械驗證這件事。
//
// 取得路徑：①③走真實 game loop 讀 sim 自己排的 route；②直接呼叫真實純函式。
// 用法：node tools/vol5-mb-reach-probe.mjs
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { routeTicks, TEMPO, SET_TO_HIT_TICKS, APPROACH } from '../src/sim/approach.js';

const SEEDS = Number(process.env.VD_SEEDS ?? 40);
const rows = [];

for (let seed = 1; seed <= SEEDS; seed += 1) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  let seen = -1;
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 300000) {
    guard += 1;
    const intents = aiCollectIntents(g, ai);
    if (g.phase === 'rally' && g.rally.touches === 1
      && ai.approach?.routes && ai.approach.flightIdSeen !== g.rally.flightId
      && seen !== g.rally.flightId) {
      seen = g.rally.flightId;
      for (const r of ai.approach.routes) {
        if (r.startTick == null || r.takeoffTick == null) continue;
        // 助跑距離＝起點到起跳點的直線距離（sim 自己算好的兩個座標，不另闢真相）
        const dist = (r.start && r.takeoff)
          ? Math.hypot(r.takeoff.x - r.start.x, r.takeoff.z - r.start.z) : null;
        rows.push({
          kind: r.kind,
          tempo: r.tempo,
          runTicks: r.takeoffTick - r.startTick,
          dist,
          // 起步是否被規劃點截斷（startTick 早於規劃點＝這一波沒有完整助跑段可用）
          clipped: r.startTick < ai.planTick,
          headroom: r.takeoffTick - ai.planTick, // 起跳距規劃點＝助跑可用的最大 tick 數
        });
      }
    }
    stepGame(g, intents);
  }
}

const q = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const f = (v, d = 0) => (v == null ? '  n/a' : v.toFixed(d).padStart(5));
const pct = (k, n) => (n ? (100 * k / n).toFixed(1) : 'n/a');
const sePct = (k, n) => (n ? (100 * Math.sqrt((k / n) * (1 - k / n) / n)).toFixed(1) : 'n/a');

console.log(`=== 卷五 量測項 2：MB 可及範圍（${SEEDS} 局）===\n`);

console.log('-- ① 各線的助跑實況（sim 自己排的 route，逐波取樣）--');
console.log('kind          tempo   n   runTicks  助跑距離m  隱含速度m/s  起步被截斷%  起跳餘裕tick');
const kinds = [...new Set(rows.map((r) => r.kind))].sort();
const speedOf = {};
for (const k of kinds) {
  const sub = rows.filter((r) => r.kind === k);
  const rt = q(sub.map((r) => r.runTicks), 0.5);
  const ds = sub.filter((r) => r.dist != null).map((r) => r.dist);
  const d = q(ds, 0.5);
  const spd = (rt && d != null && rt > 0) ? (d / (rt / 60)) : null;
  if (spd) speedOf[k] = spd;
  const clip = sub.filter((r) => r.clipped).length;
  console.log(`${k.padEnd(13)}${String(sub[0].tempo).padEnd(7)}${String(sub.length).padStart(4)}`
    + `  ${f(rt)}     ${f(d, 2)}      ${f(spd, 2)}      ${String(pct(clip, sub.length)).padStart(5)}`
    + `        ${f(q(sub.map((r) => r.headroom), 0.5))}`);
}
console.log('  ↑ 隱含速度＝助跑距離 ÷（runTicks/60）。各線速度應該接近（同一批球員的移動速度）；'
  + '\n    差很多代表某條線的助跑段被截斷或起點設計不同。');

console.log('\n-- ② 步數／助跑距離改了，會不會動到起跳時機？（呼叫真實 routeTicks）--');
console.log('把 runTicks 從 10 掃到 120，看 takeoffTick 動不動：');
const SET_TICK = 1000;
for (const tempo of ['one', 'two', 'three']) {
  const outs = [10, 30, 60, 90, 120].map((rt) => routeTicks(tempo, SET_TICK, rt));
  const takeoffs = [...new Set(outs.map((o) => o.takeoffTick))];
  const starts = outs.map((o) => o.startTick);
  console.log(`  ${tempo.padEnd(6)} takeoffTick ${takeoffs.length === 1 ? '恆為 ' + takeoffs[0] : '變動 ' + takeoffs.join('/')}`
    + `　startTick ${starts[0]}→${starts[starts.length - 1]}`
    + `　${takeoffs.length === 1 ? '★ 起跳不受助跑長度影響' : '⚠ 起跳跟著跑'}`);
}
console.log(`  （takeoffLead：one ${TEMPO.one.takeoffLead}／two ${TEMPO.two.takeoffLead}`
  + `／three ${TEMPO.three.takeoffLead}）`);
console.log('  ⇒ **一速／二速：拉長助跑只把起步往前推，起跳時刻不動**。');
console.log('     這就是 B 快可以把擊球點拉遠而不動節奏的工程依據。');

console.log('\n-- ③ 可及距離上限（起跳時刻不變的前提下）--');
const quickRows = rows.filter((r) => r.kind === 'quick');
const headroom = q(quickRows.map((r) => r.headroom), 0.5);
const spd = speedOf.quick;
console.log(`快攻的起跳餘裕（takeoffTick − 規劃點）p50 ＝ ${f(headroom)} tick`
  + `　＝ 助跑最多可用 ${headroom ? (headroom / 60).toFixed(2) : 'n/a'} 秒`);
console.log(`現行快攻助跑：runTicks p50 ${f(q(quickRows.map((r) => r.runTicks), 0.5))} tick`
  + `／距離 p50 ${f(q(quickRows.filter((r) => r.dist != null).map((r) => r.dist), 0.5), 2)} m`);
if (spd && headroom) {
  console.log(`⇒ 可及距離上限 ≈ ${(spd * headroom / 60).toFixed(2)} m`
    + `（＝隱含速度 ${spd.toFixed(2)} m/s × ${(headroom / 60).toFixed(2)} s）`);
  console.log('  ⚠ 這是**上限**不是建議值：跑滿代表起步 tick 落在規劃點上，'
    + '\n    一傳才剛觸球 MB 就要起跑，沒有任何反應餘裕，而且 startTick 會被截斷。');
}
const clippedQ = quickRows.filter((r) => r.clipped).length;
console.log(`現行快攻起步被規劃點截斷的比例：${pct(clippedQ, quickRows.length)}%`
  + ` ± ${sePct(clippedQ, quickRows.length)}pp（n=${quickRows.length}）`);

console.log('\n-- 參考：現行常數 --');
console.log(`APPROACH.quick = ${JSON.stringify(APPROACH.quick)}`);
console.log(`SET_TO_HIT_TICKS = ${JSON.stringify(SET_TO_HIT_TICKS)}`
  + '　（二傳觸球→攻擊手擊球的飛行時間）');
