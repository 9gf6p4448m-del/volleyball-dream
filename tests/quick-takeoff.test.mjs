// §4 A1 追修（07-29 Sawmah 試玩：「快攻看起來會先走到網子前停一下，然後才起跳」）。
//
// 真實排球的一速（快攻）是「助跑→踩板→起跳」一個連續動作——中間停一拍就失去
// 快攻的意義（威力來自比攔網手早到）。這裡把兩件事釘住：
//   ① sim：一速的**到位時刻**必須收斂到**起跳 tick**（不得有長靜止＝07-23 拍板
//      禁止的「攻擊手提早到網前罰站」的變形），且一速定義（二傳觸球前已離地）不變。
//   ② 表現層：畫面上的起跳觸發**吃 sim 的 route.takeoffTick**，不是別的錨點。
//      修前吃的是 hitPoint 倒數（要等二傳觸球後才算得出來）＝那段等球畫面上是站著。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { routeTicks } from '../src/sim/approach.js';
import { earlyTakeoffCue } from '../src/app/matchLoop.js';
import { seqDurTicks } from '../src/render/geoAnimator.js';

// ---- ② 表現層：起跳觸發吃 takeoffTick ----

const LEAD = 45;   // approach3 全長（seqDurTicks('approach3')）
const STALE = 12;  // 逾時作廢窗

test('起跳觸發吃 route.takeoffTick：那一 tick 才回 takeoff，且隨 takeoffTick 平移', () => {
  const route = { tempo: 'one', takeoffTick: 1000 };
  assert.equal(earlyTakeoffCue(route, 999, LEAD, STALE), 'approach', '起跳前一 tick 還在助跑');
  assert.equal(earlyTakeoffCue(route, 1000, LEAD, STALE), 'takeoff', '起跳 tick 當下＝離地');
  // 錨點真的是 takeoffTick：把它往後移 200，離地 tick 也跟著移，不是吃別的東西
  const later = { tempo: 'one', takeoffTick: 1200 };
  assert.equal(earlyTakeoffCue(later, 1000, LEAD, STALE), null);
  assert.equal(earlyTakeoffCue(later, 1200, LEAD, STALE), 'takeoff');
});

test('助跑起手提前一整段序列：末幀正好踩在起跳 tick 上', () => {
  const route = { tempo: 'one', takeoffTick: 1000 };
  assert.equal(earlyTakeoffCue(route, 1000 - LEAD - 1, LEAD, STALE), null, '序列全長之外不播');
  assert.equal(earlyTakeoffCue(route, 1000 - LEAD, LEAD, STALE), 'approach', '倒數一整段序列時起手');
  // 提前量取自序列自己的時長（序列調時長，提前量自動跟著調，不會漂移）
  assert.equal(seqDurTicks('approach3'), LEAD);
  assert.ok(seqDurTicks('approach4') > seqDurTicks('approach3'), '後排四步序列較長');
});

test('預測失準的 fallback：三速／算不出起跳 tick／逾時一律不早跳', () => {
  assert.equal(earlyTakeoffCue(null, 1000, LEAD, STALE), null);
  assert.equal(earlyTakeoffCue({ tempo: 'three', takeoffTick: 1000 }, 1000, LEAD, STALE), null,
    '三速的起跳在二傳觸球之後＝走既有 hitPoint 倒數路徑');
  assert.equal(earlyTakeoffCue({ tempo: 'one', takeoffTick: null }, 1000, LEAD, STALE), null,
    '算不出二傳觸球時刻＝三個 tick 皆 null＝不早跳');
  // 逾時作廢：一幀可能推進多個 sim tick（掉幀／時間膨脹），錯過那一 tick 要補播；
  // 但補過頭就不是起跳了，退回既有路徑
  const route = { tempo: 'one', takeoffTick: 1000 };
  assert.equal(earlyTakeoffCue(route, 1000 + STALE, LEAD, STALE), 'takeoff', '窗內補播');
  assert.equal(earlyTakeoffCue(route, 1000 + STALE + 1, LEAD, STALE), null, '逾時作廢');
});

test('二速同樣走早跳（起跳仍在二傳觸球前）；三速不走', () => {
  const run = 20;
  const one = routeTicks('one', 1000, run);
  const two = routeTicks('two', 1000, run);
  const three = routeTicks('three', 1000, run);
  assert.equal(earlyTakeoffCue({ tempo: 'one', ...one }, one.takeoffTick, LEAD, STALE), 'takeoff');
  assert.equal(earlyTakeoffCue({ tempo: 'two', ...two }, two.takeoffTick, LEAD, STALE), 'takeoff');
  assert.equal(earlyTakeoffCue({ tempo: 'three', ...three }, three.takeoffTick, LEAD, STALE), null);
});

// ---- ① sim：到位時刻必須收斂到起跳 tick ----

// 靜止判準（m/tick）：全速跑 ≈0.067m/tick，5mm/tick＝0.3m/s＝肉眼「站著不動」
const STILL = 0.005;
// 「長靜止」門檻＝0.5 秒。07-23 拍板的網前罰站就是用這條線量的
// （tools/attack-flow-probe.mjs §2 同一門檻）
const STALL_MAX = 30;

// 跑一整局，記每條一速 route 的「到位（停止水平移動）→ 起跳 tick」靜止長度，
// 以及二傳實際觸球時人是否已經到位（一速定義）
function runSet(seed) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const stalls = [];
  const log = [];
  let airborne = 0;
  let judged = 0;
  const live = new Map();
  let liveKey = null;
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 300000) {
    guard += 1;
    const app = ai.approach;
    const cur = app?.routes?.length && app.setTick != null ? `${app.team}:${app.setTick}` : null;
    if (cur !== liveKey) { live.clear(); liveKey = cur; }
    if (cur) {
      for (const r of app.routes) {
        if (r.tempo !== 'one' || r.takeoffTick == null) continue;
        const a = g.actors[r.pid];
        let e = live.get(r.pid);
        if (!e) {
          e = { prev: { x: a.x, z: a.z }, still: 0, takeoffTick: r.takeoffTick, done: false };
          live.set(r.pid, e);
        } else {
          const d = Math.hypot(a.x - e.prev.x, a.z - e.prev.z);
          e.prev = { x: a.x, z: a.z };
          e.still = d < STILL ? e.still + 1 : 0;
        }
        if (!e.done && g.tick >= e.takeoffTick) {
          e.done = true;
          e.settled = e.still > 0;
          stalls.push(e.still);
          log.push(`${g.tick}:${r.pid}:${e.still}`);
        }
      }
    }
    const ev = stepGame(g, aiCollectIntents(g, ai));
    for (const e2 of ev) {
      if (e2.type === 'TOUCH' && e2.touches === 2) {
        for (const e of live.values()) {
          if (e.judged || !e.done) continue;
          e.judged = true;
          judged += 1;
          if (e.settled) airborne += 1;
        }
      }
      if (e2.type === 'DEAD_BALL') { live.clear(); liveKey = null; }
    }
  }
  return { stalls, log, airborne, judged };
}

// 07-29（§7 D2 上線後補樣本）：`stalls.length > 100` 是**樣本量守門，不是行為斷言**
// ——D2 讓被針對的接一傳者掉出攻擊池（實測快攻約一成的球因此不成立），
// 種子 11 單獨跑只剩 77 筆。**行為門檻（STALL_MAX、p90 ≤ 10）一格未動**，
// 改成兩顆種子併樣本（同本檔下方那條 07-29 已採用的慣例，涵蓋面只增不減）
test('一速：到位與起跳之間不得有長靜止（＝「跑完就跳」，不是跑完站著等）', () => {
  const a = runSet(11);
  const b = runSet(13);
  const stalls = [...a.stalls, ...b.stalls];
  assert.ok(stalls.length > 100, `樣本足夠（${stalls.length}）`);
  const worst = Math.max(...stalls);
  assert.ok(worst < STALL_MAX,
    `一速起跳前最長靜止 ${worst} tick（${(worst / 60).toFixed(2)}s）須短於 0.5 秒`);
  // 不只是「沒有長尾」——中位數也要貼著起跳（到位即停的半徑造成幾 tick 餘裕是允許的）
  const sorted = [...stalls].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  assert.ok(p90 <= 10, `到位→起跳的靜止 p90 應在幾 tick 內（實得 ${p90}）`);
});

// 07-29（§5 A2／A3 上線後補樣本）：`judged > 100` 是樣本量守門，不是行為斷言
// ——新戰術讓同一顆種子跑出的回合數改變，種子 11 單獨跑只剩 87 筆。
// **比例門檻 0.95 一格未動**，改成兩顆種子併樣本（涵蓋面只增不減）。
// 07-30（§十 階段五 段 2，t=0.50）：兩顆種子併樣本只剩 89 筆——收斂讓 rally 變短、
// 一速成立的回合變少（P1(b) 正式觀測項）。依段 1 裁定 ④ 的「取樣到量」同型處置：
// 自 seed 11 起連續取局收滿樣本門檻為止、安全上限 6 局；**門檻 100 與 0.95 一格未動**。
test('一速定義不得破壞：二傳觸球時 MB 已在起跳點站定（＝已離地）', () => {
  let airborne = 0;
  let judged = 0;
  const used = [];
  for (let seed = 11; seed < 11 + 6 && judged <= 100; seed += 1) {
    const r = runSet(seed);
    airborne += r.airborne;
    judged += r.judged;
    used.push(seed);
  }
  assert.ok(judged > 100, `樣本足夠（${judged}，取樣 seeds ${used.join(',')}，上限 6 局）`);
  assert.ok(airborne / judged > 0.95,
    `二傳觸球前已離地的比例須維持（實得 ${((airborne / judged) * 100).toFixed(1)}%）`);
});

// 07-29（§5 A2 交叉上線後補樣本）：`log.length > 100` 是「這局到底有沒有打出一速」
// 的樣本量守門，不是行為斷言。交叉讓整局的攻擊分佈改變＝同一顆種子跑出的回合數不同，
// 種子 5 單獨跑只剩 81 筆。**門檻與逐值比對一格未動**，改成兩顆種子各跑一局湊樣本
// （每顆種子仍各自「同 seed 兩次逐值相同」，涵蓋面只增不減）。
test('決定論：同 seed 兩次整局，一速的起跳 tick 與到位靜止逐值相同', () => {
  const total = [];
  for (const seed of [5, 9]) {
    const a = runSet(seed);
    const b = runSet(seed);
    assert.equal(a.log.length, b.log.length);
    for (let i = 0; i < a.log.length; i += 1) {
      assert.equal(a.log[i], b.log[i], `種子 ${seed} 第 ${i} 筆起跳時序不一致`);
    }
    total.push(...a.log);
  }
  assert.ok(total.length > 100, `樣本足夠（${total.length}）`);
});
