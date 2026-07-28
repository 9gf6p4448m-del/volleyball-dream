// Phase 5 W1 §4 A1 節奏三層 — 量化探針（工單 §12-6／§12-8 的可驗證版）
//
// 用法：node tools/tempo-probe.mjs
// **刻意只吃 §4 之前就存在的公開介面**（setAimFor／AI.TAKEOFF_*／ai.approach.routes
// 的 pid+kind），這樣同一支檔案可以在 §4 修前（git stash）與修後各跑一次做對比。
//
// ① 全員跑動：二傳觸球前後 ±30 tick 的窗口內，同時「正朝自己那條線的起跳點跑」的
//    攻擊手人數分佈。修前預期 ~1 人（只有被選中那個真的會跑）。
// ② MB 一速：快攻線的 MB 在**二傳實際觸球那一 tick**之前是否已經「離地」。
//    sim 沒有 y 軸，「離地」沿用 ai.js 的定義＝抵達自己那條線的起跳點並停止水平
//    移動（到位即停＝原地拔起）。
// ③ 誠實面（網前罰站的直球量法）：擊球前**連續站著不動**幾 tick。
//    attack-flow-probe §2 用「離球落點 0.6m 內」當代理，會漏掉停在起跳點的等待；
//    這裡直接數擊球前的靜止 tick，並依節奏分桶。
// ④ 二傳觸球 → 擊球的球飛行時間（依節奏分桶）：二速若沒有低平球就會在這裡露餡。
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, setAimFor, AI } from '../src/sim/ai.js';
import { localToWorld, TEAM_SIDE, isBackRow } from '../src/sim/rotation.js';

const BACK_KINDS = new Set(['pipe', 'dball']);
const WINDOW = 30;        // 二傳觸球前後各取幾 tick
const MOVE_EPS = 0.02;    // 單 tick 位移大於此＝真的在跑（不是站著微調）

// 這條線的起跳點（世界座標）＝舉球落點往自家後場退 TAKEOFF_FRONT/BACK
function takeoffSpot(team, kind) {
  const aim = setAimFor(null, team, null, kind);
  const back = BACK_KINDS.has(kind) ? AI.TAKEOFF_BACK_M : AI.TAKEOFF_FRONT_M;
  const w = localToWorld(team, aim.lx, aim.lz + back);
  return { x: w.x, z: w.z };
}

const concurrent = [];          // 窗口內每 tick 的同時助跑人數
const perBallMax = [];          // 每球窗口內的最大同時助跑人數
const quickAirborne = { yes: 0, no: 0 };   // ② MB 快攻是否在二傳觸球前已離地
const quickLead = [];           // ② 領先幾 tick（正＝觸球前就離地）
const standBy = {};             // ③ 擊球前連續靜止 tick（依 前後排/節奏 分桶）
const setToHit = {};            // ④ 二傳觸球→擊球的 tick（依節奏分桶）
const STILL_EPS = 0.005;        // 單 tick 位移小於此＝站著不動
const maxStep = { run: 0, all: 0 }; // 單 tick 位移上限（證明沒有瞬移）

for (let seed = 1; seed <= 40; seed += 1) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  let buf = [];        // 本波：每 tick 的 { tick, running:Set }
  let flight = -1;
  let settledAt = {};  // pid → 首次抵達自己起跳點的 tick（本波）
  let prevPos = {};
  let stillRun = {};   // pid → 目前連續靜止了幾 tick（全隊，不限池內）
  let allPrev = {};
  let setTouchTick = null;
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 300000) {
    guard += 1;
    const r = g.rally;
    const team = r.possession;
    const routes = ai.approach?.team === team ? (ai.approach.routes ?? []) : [];
    if (r.touches >= 1 && routes.length) {
      const running = [];
      for (const rt of routes) {
        const a = g.actors[rt.pid];
        const spot = takeoffSpot(team, rt.kind);
        const d = Math.hypot(spot.x - a.x, spot.z - a.z);
        const p = prevPos[rt.pid];
        const step = p ? Math.hypot(a.x - p.x, a.z - p.z) : 0;
        const dPrev = p ? Math.hypot(spot.x - p.x, spot.z - p.z) : Infinity;
        // 「助跑中」＝正朝自己那條線的起跳點移動、且真的在動
        if (step > MOVE_EPS && d < dPrev) {
          running.push(rt.pid);
          maxStep.run = Math.max(maxStep.run, step);
        }
        maxStep.all = Math.max(maxStep.all, step);
        // 「離地」＝到起跳點（到位即停＝原地拔起）
        if (d < AI.TAKEOFF_SETTLE_M && settledAt[rt.pid] === undefined) {
          settledAt[rt.pid] = g.tick;
        }
      }
      buf.push({ tick: g.tick, n: running.length });
    }
    for (const rt of routes) {
      const a = g.actors[rt.pid];
      prevPos[rt.pid] = { x: a.x, z: a.z };
    }
    // 全員的連續靜止計數（③ 用）
    for (const pid of Object.keys(g.actors)) {
      const a = g.actors[pid];
      const p0 = allPrev[pid];
      const st = p0 ? Math.hypot(a.x - p0.x, a.z - p0.z) : 1;
      stillRun[pid] = st < STILL_EPS ? (stillRun[pid] ?? 0) + 1 : 0;
      allPrev[pid] = { x: a.x, z: a.z };
    }

    const ev = stepGame(g, aiCollectIntents(g, ai));
    for (const e of ev) {
      // 二傳實際觸球 → 結算窗口
      if (e.type === 'TOUCH' && e.touches === 2 && ai.approach?.team === e.team) {
        const st = g.tick;
        const win = buf.filter((b) => b.tick >= st - WINDOW && b.tick <= st + WINDOW);
        // 窗口的後半段還沒發生，先記下錨點，等這波結束再補
        flight = st;
        // ② 快攻線的 MB 是否在二傳觸球前已離地
        for (const rt of ai.approach.routes) {
          if (rt.kind !== 'quick') continue;
          const t0 = settledAt[rt.pid];
          if (t0 !== undefined && t0 <= st) { quickAirborne.yes += 1; quickLead.push(st - t0); }
          else quickAirborne.no += 1;
        }
        buf = win; // 保留前半窗，後半窗繼續累積
        setTouchTick = st;
      }
      // 扣球 → ③ 擊球前連續站著不動幾 tick ／ ④ 二傳觸球→擊球的飛行 tick
      if (e.type === 'TOUCH' && e.kind === 'spike') {
        const rt = ai.approach?.routes?.find((x) => x.pid === e.playerId);
        if (rt) {
          const back = isBackRow(g.match.rotations[g.players[e.playerId].teamId], e.playerId);
          const key = `${back ? '後排' : '前排'}/${rt.kind}/${rt.tempo ?? 'n/a'}`;
          (standBy[key] ??= []).push(stillRun[e.playerId] ?? 0);
          if (setTouchTick !== null) (setToHit[key] ??= []).push(g.tick - setTouchTick);
        }
        delete settledAt[e.playerId];
      }
      if (e.type === 'DEAD_BALL' || (e.type === 'TOUCH' && e.touches === 1)) {
        if (flight > 0) {
          for (const b of buf) {
            if (b.tick >= flight - WINDOW && b.tick <= flight + WINDOW) concurrent.push(b.n);
          }
          const win = buf.filter((b) => b.tick >= flight - WINDOW && b.tick <= flight + WINDOW);
          if (win.length) perBallMax.push(Math.max(...win.map((b) => b.n)));
        }
        buf = []; flight = -1; settledAt = {}; prevPos = {}; setTouchTick = null;
      }
    }
    if (g.tick !== undefined && TEAM_SIDE) { /* no-op：保留 import 用途說明 */ }
  }
}

const q = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);

console.log('── ① 全員跑動：二傳觸球 ±' + WINDOW + ' tick 窗口內「同時助跑中」的人數 ──');
console.log(`樣本 tick n=${concurrent.length}｜平均 ${mean(concurrent).toFixed(2)} 人｜p50=${q(concurrent, 0.5)}｜p90=${q(concurrent, 0.9)}｜max=${q(concurrent, 1)}`);
const dist = {};
for (const n of concurrent) dist[n] = (dist[n] ?? 0) + 1;
console.log('  人數分佈：' + Object.keys(dist).sort((a, b) => a - b)
  .map((k) => `${k} 人 ${((dist[k] / concurrent.length) * 100).toFixed(1)}%`).join('  '));
console.log(`  每球窗口的最大同時助跑人數：n=${perBallMax.length}｜平均 ${mean(perBallMax).toFixed(2)}｜p50=${q(perBallMax, 0.5)}｜≥2 人的球佔 ${((perBallMax.filter((v) => v >= 2).length / perBallMax.length) * 100).toFixed(1)}%`);

console.log('\n── ② MB 一速：快攻線在「二傳實際觸球」那一 tick 前已離地的比例 ──');
const tot = quickAirborne.yes + quickAirborne.no;
console.log(`快攻線樣本 n=${tot}：已離地 ${quickAirborne.yes}（${((quickAirborne.yes / tot) * 100).toFixed(1)}%）｜未離地 ${quickAirborne.no}`);
if (quickLead.length) {
  console.log(`  提前量：p50=${q(quickLead, 0.5)} tick（${(q(quickLead, 0.5) / 60).toFixed(2)}s）  p90=${q(quickLead, 0.9)} tick`);
}

console.log('\n── ③ 網前罰站直球量法：擊球前**連續站著不動**幾 tick（前後排/線/節奏）──');
for (const k of Object.keys(standBy).sort()) {
  const arr = standBy[k];
  const stall = arr.filter((t) => t >= 30).length;
  console.log(`${k} n=${arr.length}：p50=${q(arr, 0.5)}  p90=${q(arr, 0.9)}  max=${q(arr, 1)}｜站>0.5s ${((stall / arr.length) * 100).toFixed(1)}%`);
}

console.log('\n── ④ 二傳觸球 → 擊球的球飛行 tick（節奏＝球速；二速沒配低平球會在此露餡）──');
for (const k of Object.keys(setToHit).sort()) {
  const arr = setToHit[k];
  console.log(`${k} n=${arr.length}：p50=${q(arr, 0.5)} tick（${(q(arr, 0.5) / 60).toFixed(2)}s）  p90=${q(arr, 0.9)}`);
}

console.log('\n── ⑤ 單 tick 位移上限（步長 ≤ 5.2/60 ＝ 0.087m；證明沒有瞬移）──');
console.log(`助跑中 max=${maxStep.run.toFixed(4)}m｜池內全部 max=${maxStep.all.toFixed(4)}m`);
