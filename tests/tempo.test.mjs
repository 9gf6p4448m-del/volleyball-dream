// Phase 5 W1 §4「A1 節奏三層」——全員跑動的骨幹。
//
// 本輪要證的是：**同一顆球裡，池中每個人各有一條 route（節奏＋路線＋起步 tick），
// 而且不同節奏的起步／起跳時刻相對「二傳觸球」分得開**——那個「分得開」就是
// 攔網手要讀的東西本身（憲法 §三 A1：沒有 A1，全員跑動只是四個人同時跑）。
//
// §2-2 的助跑起點幾何測試在 tests/approach.test.mjs，本檔不重複。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, attackPointsOf } from '../src/sim/ai.js';
import {
  approachRoutesFor, approachRouteOf, routeTicks, tempoFor, TEMPO, TEMPO_TWO_RATE, AIR_TICKS,
} from '../src/sim/approach.js';
import { moveSpeed } from '../src/sim/player.js';
import { SIM_DT } from '../src/sim/constants.js';

// ---- ② 規格：三種節奏相對「二傳觸球 tick」的先後 ----

test('節奏三層的時序規格：一速在二傳觸球前已離地、二速觸球前起跳、三速觸球後起跳', () => {
  const SET = 1000;
  const run = 20; // 助跑段長度（tick）；三種節奏用同一條線比較才公平
  const one = routeTicks('one', SET, run);
  const two = routeTicks('two', SET, run);
  const three = routeTicks('three', SET, run);

  // 起跳：一速最早、三速最晚，且一速／二速在觸球前、三速在觸球後
  assert.ok(one.takeoffTick < SET, `一速須在二傳觸球前離地（${one.takeoffTick} vs ${SET}）`);
  assert.ok(two.takeoffTick < SET, `二速須在二傳觸球前起跳（${two.takeoffTick} vs ${SET}）`);
  assert.ok(three.takeoffTick > SET, `三速須在二傳觸球後起跳（${three.takeoffTick} vs ${SET}）`);
  assert.ok(one.takeoffTick < two.takeoffTick, '一速須早於二速離地');
  assert.ok(two.takeoffTick < three.takeoffTick, '二速須早於三速起跳');

  // 起步：同樣是一速最早、三速最晚（起步 tick＝起跳倒推一整段助跑）
  assert.ok(one.startTick < two.startTick, '一速起步須早於二速');
  assert.ok(two.startTick < three.startTick, '二速起步須早於三速');
  // 憲法的黃金錨點：三速＝二傳觸球那一刻正踩在助跑第一步上
  assert.equal(three.startTick, SET, '三速起步 tick＝二傳觸球 tick（黃金錨點）');
  // 起步→起跳恰好是一整段助跑；收勢窗在起跳之後
  for (const r of [one, two, three]) {
    assert.equal(r.takeoffTick - r.startTick, run, '起步到起跳＝一整段助跑');
    assert.equal(r.settleTick, r.takeoffTick + AIR_TICKS, '收勢窗接在起跳之後');
  }
  // 算不出二傳觸球時刻＝三個 tick 全 null（呼叫端據此回落「站在起點等」）
  assert.deepEqual(routeTicks('one', null, run),
    { startTick: null, takeoffTick: null, settleTick: null });
});

test('節奏分派規格：快攻恆一速、後排高球恆三速、邊攻由種子決定二速／三速', () => {
  assert.equal(tempoFor('quick', { flightId: 1, seed: 1, index: 0 }), 'one');
  assert.equal(tempoFor('pipe', { flightId: 1, seed: 1, index: 0 }), 'three');
  assert.equal(tempoFor('dball', { flightId: 7, seed: 3, index: 2 }), 'three');
  // 邊攻：掃過 flightId 應同時出得到兩種節奏（比例＝TEMPO_TWO_RATE；為 0 時全三速）
  const seen = new Set();
  for (let f = 0; f < 400; f += 1) seen.add(tempoFor('left', { flightId: f, seed: 5, index: 0 }));
  if (TEMPO_TWO_RATE > 0) {
    assert.deepEqual([...seen].sort(), ['three', 'two'], '邊攻應兩種節奏都出得到');
  } else {
    assert.deepEqual([...seen], ['three'], 'TEMPO_TWO_RATE=0＝本輪邊攻一律三速');
  }
  assert.ok(Object.keys(TEMPO).length === 3, '節奏三層＝三檔，不多不少');
});

// ---- ① 池中每人都有一條完整 route ----

test('同一球中，攻擊池裡每個人都拿到 route：節奏＋路線＋起步 tick 一個不缺', () => {
  const g = createGame({ seed: 3 });
  const points = attackPointsOf(g, 'A', 'A1', 'perfect');
  const routes = approachRoutesFor('A', points, {
    setTick: 500, flightId: 12, seed: 3, speedOf: (pid) => moveSpeed(g.players[pid]),
  });
  assert.equal(routes.length, points.length, '池中每名合法攻擊手都要有一條線');
  assert.ok(routes.length >= 3, `完美一傳下至少三條線可讀（實得 ${routes.length}）`);
  for (const r of routes) {
    assert.ok(r.kind, `${r.pid} 應有路線`);
    assert.ok(TEMPO[r.tempo], `${r.pid} 應有合法節奏（實得 ${r.tempo}）`);
    assert.equal(typeof r.startTick, 'number', `${r.pid} 應有起步 tick`);
    assert.equal(typeof r.takeoffTick, 'number', `${r.pid} 應有起跳 tick`);
    assert.ok(r.start && r.takeoff, `${r.pid} 應有助跑起點與起跳點`);
    assert.ok(r.runTicks >= 1, `${r.pid} 的助跑段須為正`);
    // 起跳點必須比助跑起點更靠近網（助跑方向＝由後往前進球）
    assert.ok(Math.abs(r.takeoff.z) < Math.abs(r.start.z),
      `${r.pid} 的起跳點須比助跑起點貼網`);
  }
  // 快攻線（一速）必須是全場最早起步的那一條——攔網手要讀的就是這個差
  const quick = routes.find((r) => r.kind === 'quick');
  assert.ok(quick && quick.tempo === 'one', '完美一傳下快攻線在場上且為一速');
  for (const r of routes) {
    if (r === quick) continue;
    assert.ok(quick.startTick < r.startTick,
      `快攻須比 ${r.kind} 早起步（${quick.startTick} vs ${r.startTick}）`);
  }
});

test('一傳降級＝快攻線消失（§4 實作要求 1：攻擊池不變的回歸）', () => {
  const g = createGame({ seed: 3 });
  const kindsOf = (tier) => approachRoutesFor('A', attackPointsOf(g, 'A', 'A1', tier), {
    setTick: 500, flightId: 12, seed: 3,
  }).map((r) => r.kind);
  assert.ok(kindsOf('perfect').includes('quick'), '完美一傳＝快攻線在場上');
  assert.ok(!kindsOf('ok').includes('quick'), '可用一傳＝快攻線消失');
  assert.ok(!kindsOf('poor').includes('quick'));
  // 降級後也不得有人漏掉節奏或起步 tick
  for (const tier of ['ok', 'poor']) {
    for (const r of approachRoutesFor('A', attackPointsOf(g, 'A', 'A1', tier), {
      setTick: 500, flightId: 12, seed: 3,
    })) {
      assert.ok(TEMPO[r.tempo] && typeof r.startTick === 'number', `${tier}/${r.pid} 仍要有完整 route`);
    }
  }
});

// ---- 實跑：③ 決定論 ／ ④ 不得瞬間位移 ----

// 單 tick 位移的合法上限＝自己的步長 ＋ 同隊避讓推擠（game.js SEP_PUSH 0.08／人，
// 切向滑移使量值最多 ×1.166，最多同時被兩名同伴推）。避讓是 §4 之前就在的機制，
// 這裡把它算進上限、而不是放寬到看不出瞬移——0.19m/tick 仍遠小於任何一段助跑
const SEP_MAX = 0.19;

// 跑一整局，逐 tick 記下 route 分配（含節奏與三個 tick）與池內每人的位移
function runSet(seed) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const log = [];
  const steps = [];           // 池內非接球者的單 tick 位移（④）
  const runningHist = [];     // 同時處於助跑段的人數（供樣本量把關）
  let prev = {};
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 300000) {
    guard += 1;
    const app = ai.approach;
    // ★ 只取樣 rally 中的位移（2026-07-30 補這道閘）★
    // 死球後的輪轉歸位是既有的「瞬移回位不做插值拖影」（game.js:1395），與助跑走位無關。
    // 少了這道閘，跨越死球那一 tick 會把歸位記成單 tick 位移（實測 A5 6.24m，
    // 現場 phase rally→serve、possession A→null、flightId 換號）。
    // 同一道閘在 `block-persona.test.mjs` 與 `tools/phase5-block-width-probe.mjs` 早已存在
    // （後者的註解逐字寫明這件事）——**本檔少它才是異常**。
    // **斷言一字未動**，只縮取樣窗到它本來就該量的範圍。
    const inRally = g.phase === 'rally';
    if (app?.routes?.length && inRally) {
      log.push(`${g.tick}:${app.team}:${app.setTick}:` + app.routes
        .map((r) => `${r.pid}/${r.kind}/${r.tempo}/${r.startTick}/${r.takeoffTick}/${r.settleTick}`)
        .join('|'));
      let running = 0;
      for (const r of app.routes) {
        const a = g.actors[r.pid];
        const p = prev[r.pid];
        if (r.startTick != null && g.tick >= r.startTick && g.tick < r.settleTick) running += 1;
        // ④ 只看「沒被指派去接球的人」（接球者可魚躍，那是另一套位移）
        if (p && r.pid !== ai.claimId && r.pid !== ai.backupId) {
          steps.push({
            pid: r.pid,
            d: Math.hypot(a.x - p.x, a.z - p.z),
            cap: moveSpeed(g.players[r.pid]) * SIM_DT + SEP_MAX,
          });
        }
      }
      runningHist.push(running);
      for (const r of app.routes) prev[r.pid] = { x: g.actors[r.pid].x, z: g.actors[r.pid].z };
    } else {
      prev = {}; // 含「非 rally」的 tick：清掉基準，避免下一次 rally 的第一筆跨越歸位
    }
    stepGame(g, aiCollectIntents(g, ai));
  }
  return { log, steps, runningHist };
}

test('決定論：同 seed 兩次整局，route 分配／節奏／起步 tick 逐值相同', () => {
  const a = runSet(5);
  const b = runSet(5);
  assert.ok(a.log.length > 500, `樣本足夠（${a.log.length}）`);
  assert.equal(a.log.length, b.log.length);
  for (let i = 0; i < a.log.length; i += 1) {
    assert.equal(a.log[i], b.log[i], `第 ${i} 筆 route 不一致`);
  }
});

test('未被選中者不得瞬間位移：池內每人的單 tick 位移都在自己的步長之內', () => {
  const { steps, runningHist } = runSet(11);
  assert.ok(steps.length > 5000, `樣本足夠（${steps.length}）`);
  let worst = { d: 0 };
  for (const s of steps) if (s.d - s.cap > worst.d - (worst.cap ?? 0)) worst = s;
  for (const s of steps) {
    assert.ok(s.d <= s.cap + 1e-9,
      `${s.pid} 單 tick 位移 ${s.d.toFixed(4)}m 超過步長 ${s.cap.toFixed(4)}m（瞬移＝瞬間收勢）`);
  }
  // 前置條件：這一局真的跑出「多人同時在助跑段」，否則上面的斷言測不到東西
  assert.ok(runningHist.filter((n) => n >= 2).length > 200,
    `樣本不足以證明測到多人同時助跑（${runningHist.filter((n) => n >= 2).length} tick）`);
});

test('全員跑動：一顆球裡池中每個人都真的離開助跑起點跑過（不是只有被選中那一個）', () => {
  const g = createGame({ seed: 11, setTarget: 25 });
  const ai = createAiState();
  const moved = new Map();   // `${flightId}:${pid}` → 是否離開起點超過半步
  const poolOf = new Map();  // flightId → 池內人數
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 120000) {
    guard += 1;
    const app = ai.approach;
    if (app?.routes?.length) {
      const fid = g.rally.flightId;
      for (const r of app.routes) {
        const a = g.actors[r.pid];
        const away = Math.hypot(a.x - r.start.x, a.z - r.start.z);
        const key = `${r.pid}`;
        const cur = moved.get(key) ?? { fid: -1, ok: false };
        if (cur.fid !== fid) moved.set(key, { fid, ok: away > 0.5 });
        else if (away > 0.5) moved.set(key, { fid, ok: true });
      }
      poolOf.set(fid, app.routes.length);
    }
    stepGame(g, aiCollectIntents(g, ai));
  }
  // 一整局跑完，池內每個人都至少有一球真的跑過自己的線
  const ran = [...moved.values()].filter((v) => v.ok).length;
  assert.ok(ran >= 3, `池內至少三人跑過自己的線（實得 ${ran}）`);
  assert.ok([...poolOf.values()].some((n) => n >= 3), '一傳到位時池內至少三條線');
});

// ---- route 查表 ----

test('approachRouteOf：非攻擊手回 null、不綁 attackerId 那一人', () => {
  assert.equal(approachRouteOf(null, 'A1'), null);
  assert.equal(approachRouteOf([], 'A1'), null);
  const g = createGame({ seed: 3 });
  const routes = approachRoutesFor('A', attackPointsOf(g, 'A', 'A1', 'perfect'), { setTick: 100 });
  assert.equal(approachRouteOf(routes, 'A1'), null, '二傳本人不在池裡＝沒有 route');
  assert.ok(approachRouteOf(routes, routes[0].pid));
});
