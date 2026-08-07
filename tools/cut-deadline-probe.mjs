// 內切「最晚可改線 tick」掃描（2026-08-07）—— **零 `src/` 改動**
//
// 動機（Sawmah 裁定 A）：「延後到二傳觸球前」不得照抄，因為助跑有物理時間
// ——線定得太晚，攻擊手會已經跑向錯的起點、或起跳時機錯亂。有多晚還來得及，
// 是一個**實測問題**。本探針把改線時點掃過整個窗，量四件事：
//   ① 生效率              二傳觸球那一刻 route.kind 是不是 left_inside
//   ② 起跳時機偏移        物理到位 tick − route.takeoffTick（正＝比計畫晚）
//   ③ 到位誤差            物理到位那一刻離 route.takeoff 的距離（m）
//   ④ 瞬移／卡頓          助跑期間單 tick 位移最大值（m）＋到位後的罰站 tick
//
// ★ 掃描軸＝ R ＝「在**預估二傳觸球** tick 前 R 個 tick 注入」★
//   直接對應「最晚可改線的 tick」這個問題本身。R 由 `aiState.approach.setTick`
//   （sim 自己的時間錨點）算，不重刻第二份預測。R=0＝踩在預估觸球那一刻。
//   對照臂 `none`＝完全不按（量自然骰基準與未改線的助跑品質）。
//
// 口徑（護欄：全部用**物理量**，不是 route 表的計畫值——`approach.js:509` 的同一條紀律）：
//   物理到位＝startTick 之後第一次 dist(actor, route.takeoff) < TAKEOFF.SETTLE（0.25m）
//   罰站    ＝物理到位 → 該波第三擊 TOUCH 之間的 tick 數
//
// 用法：node tools/cut-deadline-probe.mjs [局數=8] [R 清單=none,60,30,15,8,5,3,2,1,0,-3]
import { createGame, stepGame, createDefaultTeams } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, cutStateOf } from '../src/sim/ai.js';
import { approachRouteOf, TAKEOFF } from '../src/sim/approach.js';

const SETS = Number.parseInt(process.argv[2] ?? '8', 10);
const ARMS = (process.argv[3] ?? 'none,60,30,15,8,5,3,2,1,0,-3').split(',');
const MAX_TICKS = 400000;
const PID = 'A2';

const q = (arr, p) => (arr.length
  ? [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * p))]
  : null);
const f = (v, d = 2) => (v == null ? 'n/a' : v.toFixed(d));

// lead＝null 代表對照臂（不按）
function runPass(lead) {
  const t = {
    windows: 0, injected: 0, applied: 0, missed: {},
    gap: [], err: [], step: [], stall: [], spiked: 0, leadReal: [],
  };
  for (let run = 0; run < SETS; run += 1) {
    const game = createGame({
      seed: 500000 + run * 7919, teams: createDefaultTeams(), setTarget: 25,
    });
    const ai = createAiState();
    let guard = 0;
    let w = null;
    while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
      guard += 1;
      // 注入：預估觸球 tick 前 lead 個 tick（sim tick 座標；guard 是牆鐘 tick，兩者同步遞增）
      if (w && !w.injected && lead != null && w.injectSimTick != null
        && game.tick >= w.injectSimTick) {
        ai.cutCall = { pid: PID, cut: true };
        w.injected = true;
        t.injected += 1;
      }
      const intents = aiCollectIntents(game, ai, []);
      const st = cutStateOf(game, ai, PID);
      if (st.open && !w) {
        const setTick = ai.approach?.setTick ?? null;
        w = {
          injected: false, closed: false, maxStep: 0, prevPos: null,
          arriveTick: null, injectSimTick: setTick == null ? null : setTick - lead,
        };
        t.windows += 1;
      }
      const ev = stepGame(game, intents);
      if (w) {
        const a = game.actors[PID];
        if (a && w.prevPos) {
          w.maxStep = Math.max(w.maxStep, Math.hypot(a.x - w.prevPos.x, a.z - w.prevPos.z));
        }
        if (a) w.prevPos = { x: a.x, z: a.z };
        const route = approachRouteOf(ai.approach?.routes, PID);
        if (route && a && w.arriveTick == null && route.startTick != null
          && game.tick >= route.startTick) {
          const d = Math.hypot(a.x - route.takeoff.x, a.z - route.takeoff.z);
          if (d < TAKEOFF.SETTLE) {
            w.arriveTick = guard;
            w.err = d;
            w.gap = game.tick - route.takeoffTick;
          }
        }
        const third = ev.find((e) => e.type === 'TOUCH' && e.touches === 3 && e.team === 'A');
        const dead = ev.some((e) => e.type === 'DEAD_BALL');
        const set2 = ev.some((e) => e.type === 'TOUCH' && e.touches === 2 && e.team === 'A');
        if (set2 && !w.closed) {
          w.closed = true;
          if (w.injected) {
            // 真實提前量：注入時距**實際**二傳觸球幾 tick（預估 vs 實際的差在這裡現形）
            t.leadReal.push(game.tick - w.injectSimTick);
            const kind = approachRouteOf(ai.approach?.routes, PID)?.kind ?? 'none';
            if (kind === 'left_inside') t.applied += 1;
            else {
              const key = `${ai.cutOutcome?.reason ?? ai.cutOutcome?.outcome ?? 'nocall'}/${kind}`;
              t.missed[key] = (t.missed[key] ?? 0) + 1;
            }
          }
        }
        if (third && third.playerId === PID) {
          t.spiked += 1;
          if (w.arriveTick != null) { t.gap.push(w.gap); t.err.push(w.err); t.stall.push(guard - w.arriveTick); }
          t.step.push(w.maxStep);
        }
        if (dead || third) w = null;
      }
    }
  }
  return t;
}

console.log(`=== 內切改線時點掃描（快速比賽，OH＝${PID}，${SETS} 局／臂）===`);
console.log('R＝在「預估二傳觸球 tick」前 R 個 tick 注入（R 越小＝按得越晚）。none＝對照臂（不按）。\n');
console.log('  R    ms   開窗   注入   生效率  實際提前量p50  起跳偏移p50/p90  到位誤差p50  單tick位移max  罰站p50  本人扣成');
for (const arm of ARMS) {
  const lead = arm === 'none' ? null : Number.parseInt(arm, 10);
  const t = runPass(lead);
  const rate = t.injected ? (t.applied / t.injected * 100) : null;
  console.log(
    `${arm.padStart(5)} ${String(lead == null ? '' : Math.round(lead * 16.7)).padStart(5)}`
    + `${String(t.windows).padStart(7)}${String(t.injected).padStart(7)}`
    + `${(rate == null ? 'n/a' : `${rate.toFixed(1)}%`).padStart(9)}`
    + `${String(q(t.leadReal, 0.5) ?? 'n/a').padStart(14)}`
    + `${String(q(t.gap, 0.5)).padStart(12)}/${String(q(t.gap, 0.9)).padStart(4)}`
    + `${f(q(t.err, 0.5), 3).padStart(13)}`
    + `${f(Math.max(0, ...t.step), 3).padStart(15)}`
    + `${String(q(t.stall, 0.5)).padStart(9)}`
    + `${String(t.spiked).padStart(10)}`,
  );
  if (Object.keys(t.missed).length) {
    console.log(`      └ 未生效（reason/最終kind）：${JSON.stringify(t.missed)}`);
  }
}
