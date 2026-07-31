// Phase 5 W1 §5 A2 路線組合／A3 跳舉 — 量化探針（工單「量化」驗收條款的可重跑版）
//
// 用法：node tools/route-probe.mjs [局數=40]
//
// ① 交叉佔比：實跑中 cross／left／其餘各線的攻擊次數與佔比
// ② 交叉幾何：助跑起點→起跳點的**橫移量**（cross vs left），以及實跑軌跡上
//    「起步 tick → 起跳點」之間人真的橫移了多少（規格值 vs 場上值）
// ③ 交叉的戰術意義：cross 的擊球點離快攻點多遠——超過 TUNING.BLOCK_REACH_X
//    ＝跟死快攻的中間攔網手構造上搆不到
// ④ 跳舉觸發率：舉球次數中跳舉佔幾成
// ⑤ 跳舉的時間窗壓縮：二傳觸球 → 扣球觸球的 tick 數（跳舉／站舉分桶），
//    以及二傳的觸球高度（跳舉抬高的就是這個）
// ⑥ 反證：扣球的球速與落點散佈（跳舉／站舉分桶）——A3 不得增加球威力
import { createGame, stepGame, TUNING, spikeSpeed } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { APPROACH, approachStartFor, takeoffSpotFor, CROSS_RATE } from '../src/sim/approach.js';
import { AI } from '../src/sim/ai.js';

const SETS = Number(process.argv[2] ?? 40);

const q = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);

// ---- ② 規格值：每條線的助跑橫移量（純幾何，不必實跑）----
console.log('── ② 助跑路線的規格幾何（起點 → 起跳點）──');
for (const kind of Object.keys(APPROACH)) {
  const s = approachStartFor('A', kind);
  const t = takeoffSpotFor('A', kind);
  console.log(`${kind.padEnd(6)} 起點(${s.x.toFixed(2)},${s.z.toFixed(2)}) → 起跳(${t.x.toFixed(2)},${t.z.toFixed(2)})`
    + `｜橫移 ${Math.abs(t.x - s.x).toFixed(2)}m　縱深 ${Math.abs(t.z - s.z).toFixed(2)}m`
    + `　全長 ${Math.hypot(t.x - s.x, t.z - s.z).toFixed(2)}m`);
}
const tq = takeoffSpotFor('A', 'quick');
const tc = takeoffSpotFor('A', 'left_inside');
const tl = takeoffSpotFor('A', 'left');
console.log(`── ③ cross 擊球點離快攻點 ${Math.hypot(tc.x - tq.x, tc.z - tq.z).toFixed(2)}m`
  + `（left 離快攻點 ${Math.hypot(tl.x - tq.x, tl.z - tq.z).toFixed(2)}m）`
  + `｜攔網水平涵蓋半徑 BLOCK_REACH_X=${TUNING.BLOCK_REACH_X}m`);

// ---- 實跑 ----
const kindCount = {};
const runLat = {};        // 實跑：起步 → 起跳點之間的實際橫移（依線分桶）
const setToHit = { jump: [], stand: [] };
const recvToSet = { jump: [], stand: [] };
const recvToHit = { jump: [], stand: [] };
const setBallY = { jump: [], stand: [] };
const spikeSpd = { jump: [], stand: [] };
const spikeScatter = { jump: [], stand: [] };
let setTotal = 0;
let setJump = 0;

for (let seed = 1; seed <= SETS; seed += 1) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  let setTick = null;
  let recvTick = null;
  let setJumped = false;
  let started = {};   // pid → { x, z } 起步當下的位置
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 300000) {
    guard += 1;
    const team = g.rally.possession;
    const routes = ai.approach?.team === team ? (ai.approach.routes ?? []) : [];
    for (const rt of routes) {
      if (rt.startTick == null || g.tick !== rt.startTick) continue;
      const a = g.actors[rt.pid];
      started[rt.pid] = { x: a.x, z: a.z, kind: rt.kind };
    }
    for (const rt of routes) {
      const s = started[rt.pid];
      if (!s || rt.takeoffTick == null || g.tick !== rt.takeoffTick) continue;
      const a = g.actors[rt.pid];
      (runLat[s.kind] ??= []).push(Math.abs(a.x - s.x));
      delete started[rt.pid];
    }
    const ev = stepGame(g, aiCollectIntents(g, ai));
    for (const e of ev) {
      if (e.type === 'TOUCH' && e.touches === 1) recvTick = g.tick;
      if (e.type === 'TOUCH' && e.kind === 'set') {
        setTotal += 1;
        setJumped = !!e.jumpSet;
        if (setJumped) setJump += 1;
        setTick = g.tick;
        const b = setJumped ? 'jump' : 'stand';
        setBallY[b].push(e.ballY);
        if (recvTick != null) recvToSet[b].push(g.tick - recvTick);
      }
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.touches === 3) {
        kindCount[ai.attackKind ?? 'n/a'] = (kindCount[ai.attackKind ?? 'n/a'] ?? 0) + 1;
        if (setTick != null) {
          const b = setJumped ? 'jump' : 'stand';
          setToHit[b].push(g.tick - setTick);
          if (recvTick != null) recvToHit[b].push(g.tick - recvTick);
          spikeSpd[b].push(spikeSpeed(g.players[e.playerId]));
          spikeScatter[b].push(Math.hypot(g.ball.vx, g.ball.vz));
          setTick = null;
        }
      }
      if (e.type === 'DEAD_BALL') { setTick = null; recvTick = null; started = {}; }
    }
  }
}

console.log(`\n── ① 攻擊線實跑佔比（${SETS} 局；CROSS_RATE=${CROSS_RATE}）──`);
const total = Object.values(kindCount).reduce((s, v) => s + v, 0);
for (const k of Object.keys(kindCount).sort()) {
  console.log(`${k.padEnd(6)} ${String(kindCount[k]).padStart(4)} 次（${((kindCount[k] / total) * 100).toFixed(1)}%）`);
}
const wing = (kindCount.left ?? 0) + (kindCount.left_inside ?? 0);
console.log(`  OH 前排線內：left_inside ${(((kindCount.left_inside ?? 0) / wing) * 100).toFixed(1)}%（名目 ${CROSS_RATE * 100}%）`);

console.log('\n── ② 實跑：起步 → 起跳點之間人真的橫移了多少 ──');
for (const k of Object.keys(runLat).sort()) {
  const a = runLat[k];
  console.log(`${k.padEnd(6)} n=${a.length}：p50=${q(a, 0.5).toFixed(2)}m  p90=${q(a, 0.9).toFixed(2)}m  平均 ${mean(a).toFixed(2)}m`);
}

console.log(`\n── ④ 跳舉觸發率：${setJump}/${setTotal} ＝ ${((setJump / setTotal) * 100).toFixed(1)}%`
  + `（名目 ${AI.JUMP_SET_RATE * 100}%，條件＝S 本人舉＋一傳到位）──`);

console.log('\n── ⑤ 攔網判讀時間窗：二傳觸球 → 扣球觸球的 tick ──');
for (const b of ['stand', 'jump']) {
  const a = setToHit[b];
  console.log(`${b === 'jump' ? '跳舉' : '站舉'} n=${a.length}：p50=${q(a, 0.5)} tick（${(q(a, 0.5) / 60).toFixed(3)}s）`
    + `  平均 ${mean(a).toFixed(2)} tick  p10=${q(a, 0.1)}  p90=${q(a, 0.9)}`);
}
console.log(`  壓縮量（平均）＝${(mean(setToHit.stand) - mean(setToHit.jump)).toFixed(2)} tick`
  + `（${((mean(setToHit.stand) - mean(setToHit.jump)) / 60).toFixed(3)}s）`);
console.log('  ── commit 人格的判讀窗（一擊完成就開始讀）──');
for (const b of ['stand', 'jump']) {
  console.log(`  ${b === 'jump' ? '跳舉' : '站舉'} 一傳→二傳 平均 ${mean(recvToSet[b]).toFixed(2)} tick`
    + `｜一傳→扣球 平均 ${mean(recvToHit[b]).toFixed(2)} tick（n=${recvToHit[b].length}）`);
}
console.log(`  一傳→扣球的壓縮量＝${(mean(recvToHit.stand) - mean(recvToHit.jump)).toFixed(2)} tick`
  + `（${((mean(recvToHit.stand) - mean(recvToHit.jump)) / 60).toFixed(3)}s）`);
console.log('  二傳觸球高度（m）：'
  + ['stand', 'jump'].map((b) => `${b === 'jump' ? '跳舉' : '站舉'} p50=${q(setBallY[b], 0.5).toFixed(2)}`).join('　'));

console.log('\n── ⑥ 反證：扣球威力不得因跳舉而變（球速標量／出手水平速度）──');
for (const b of ['stand', 'jump']) {
  console.log(`${b === 'jump' ? '跳舉' : '站舉'} n=${spikeSpd[b].length}：spikeSpeed 平均 ${mean(spikeSpd[b]).toFixed(3)} m/s`
    + `｜出手水平速度 p50=${q(spikeScatter[b], 0.5).toFixed(2)} 平均 ${mean(spikeScatter[b]).toFixed(2)} m/s`);
}
