// Phase 5 W1 §7 D2「針對性發球吃 transition」（零新 UI）——
// 攻擊手接了一傳＝沒時間完成 §2 的 Transition 拉開 ⇒ 該球不進攻擊池、或只剩降級路線。
//
// 四條驗收：①被針對者不進池／只剩降級路線 ②雙向生效（AI 也會這樣打你）
//          ③決定論 ④與一傳品質分支是**疊加**不是平行（同一顆池、不重複扣）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import {
  createAiState, aiCollectIntents, attackPointsOf, serveTargetPidOf, AI, D2_PASSER_TIER,
} from '../src/sim/ai.js';
import { applyRouteKinds, tempoFor, approachRoutesFor } from '../src/sim/approach.js';
import { basePosition, positionOf } from '../src/sim/rotation.js';
import { serverId } from '../src/sim/match.js';
import { velocityForApex } from '../src/sim/flight.js';

// 預設輪轉：A1=S(P1後) A2=OH(P2前) A3=MB(P3前) A4=OPP(P4前) A5=OH(P5後) A6=MB(P6後)
// 池（perfect）＝A2 left／A3 quick／A4 right／A5 pipe；A6 後排 MB 不進池
const kindsOf = (pts) => pts.map((p) => p.kind).sort();
const byId = (pts) => Object.fromEntries(pts.map((p) => [p.pid, p]));

// 佈置：A 隊一傳已完成（touches=1，lastToucherId＝接一傳者），球飛向舉球點
function rigAfterPass(seed, receiverId, team = 'A') {
  const g = createGame({ seed });
  g.phase = 'rally';
  Object.assign(g.rally, {
    profile: 'arc', possession: team, touches: 1, lastTouchTeam: team, lastToucherId: receiverId,
  });
  const b = g.ball;
  const side = team === 'A' ? 1 : -1;
  b.x = 0; b.y = 2.0; b.z = side * 6;
  const v = velocityForApex(b, { x: side * 1.2, y: 0.105, z: side * 1.2 }, 4.8);
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  g.rally.flightId += 1;
  return g;
}

// ---- ① 不進池／只剩降級路線 ----

test('D2①：接一傳的快攻手與後排攻擊手直接掉出攻擊池（同一顆池，不是另開排除清單）', () => {
  const g = createGame({ seed: 3 });
  const full = attackPointsOf(g, 'A', 'A1', 'perfect');
  assert.deepEqual(kindsOf(full), ['left', 'pipe', 'quick', 'right'], '前置：滿池四條線');

  // 前排 MB 接一傳 → 快攻要完美一傳，他掉到罰則檔 ⇒ quick 出池
  const mbPassed = attackPointsOf(g, 'A', 'A1', 'perfect', 'A3');
  assert.deepEqual(kindsOf(mbPassed), ['left', 'pipe', 'right']);
  assert.ok(!byId(mbPassed).A3, 'MB 接了一傳＝跑不了快攻');

  // 後排 OH 接一傳 → 後排攻擊要像樣一傳，他掉到罰則檔 ⇒ pipe 出池
  const ohBackPassed = attackPointsOf(g, 'A', 'A1', 'perfect', 'A5');
  assert.deepEqual(kindsOf(ohBackPassed), ['left', 'quick', 'right']);
  assert.ok(!byId(ohBackPassed).A5, '後排攻擊手接了一傳＝跑不完四步 pipe');

  // 前排兩翼接一傳 → 還打得到高球，但檔位被壓到罰則檔（降級路線）
  const wingPassed = attackPointsOf(g, 'A', 'A1', 'perfect', 'A2');
  assert.deepEqual(kindsOf(wingPassed), ['left', 'pipe', 'quick', 'right'], '兩翼不掉池');
  assert.equal(byId(wingPassed).A2.tier, D2_PASSER_TIER, '被針對者吃罰則檔');
  assert.equal(byId(wingPassed).A4.tier, 'perfect', '其餘人維持本球的一傳品質檔');
});

test('D2①：留在池裡的被針對者只剩降級路線——不跑交叉、不跑二速', () => {
  const g = createGame({ seed: 3 });
  const pts = attackPointsOf(g, 'A', 'A1', 'perfect', 'A2');
  let crossForPassed = 0;
  let crossForFree = 0;
  for (let flightId = 0; flightId < 300; flightId += 1) {
    const mapped = applyRouteKinds(pts, { flightId, seed: 1, passTier: 'perfect' });
    if (byId(mapped).A2.kind === 'left_inside') crossForPassed += 1;
    const free = applyRouteKinds(
      attackPointsOf(g, 'A', 'A1', 'perfect'), { flightId, seed: 1, passTier: 'perfect' },
    );
    if (byId(free).A2.kind === 'left_inside') crossForFree += 1;
  }
  assert.equal(crossForPassed, 0, '接了一傳的 OH 一次都不得跑交叉（交叉＝繞過中間的跑戰術）');
  assert.ok(crossForFree > 0, `對照組（沒接一傳）本來跑得出交叉（實得 ${crossForFree}/300）`);

  // 節奏同一道階梯：罰則檔＝「只剩兩翼高球」⇒ 恆三速（二速的平拉開屬未降級路線）
  for (const kind of ['left', 'right']) {
    for (let flightId = 0; flightId < 50; flightId += 1) {
      assert.equal(tempoFor(kind, { flightId, seed: 2, index: 0, passTier: D2_PASSER_TIER }), 'three');
    }
  }

  // route 表吃 point 自帶的檔位（不是全池共用一個 passTier）
  const routes = approachRoutesFor('A', pts, { setTick: 500, flightId: 7, seed: 3, passTier: 'perfect' });
  assert.equal(routes.find((r) => r.pid === 'A2').kind, 'left');
  assert.equal(routes.find((r) => r.pid === 'A2').tempo, 'three');
});

test('D2①：整條協調層鏈路生效——一傳接球者的線真的從 aiState.approach 消失', () => {
  const g = rigAfterPass(5, 'A5'); // 後排 OH 接一傳
  const ai = createAiState();
  aiCollectIntents(g, ai);
  assert.equal(ai.passReceiverId, 'A5');
  assert.equal(ai.passTier, 'perfect', '前置：本球一傳品質仍是到位（D2 不動全隊的檔位）');
  const pids = ai.approach.routes.map((r) => r.pid).sort();
  assert.ok(!pids.includes('A5'), '接一傳者不在助跑線上');
  assert.deepEqual(pids, ['A2', 'A3', 'A4']);
  assert.notEqual(ai.attackerId, 'A5', '二傳不可能選到一條不存在的線');
});

// ---- ② 雙向生效 ----

test('D2②：AI 發球會指名發給對方後排主攻手——兩隊都會這樣打對方', () => {
  const g = createGame({ seed: 3 });
  // A 隊的後排攻擊手＝A5（pipe）；B 隊鏡像＝B5
  assert.equal(serveTargetPidOf(g, 'B'), 'A5', 'B 發球＝針對 A 的後排主攻手');
  assert.equal(serveTargetPidOf(g, 'A'), 'B5', 'A 發球＝針對 B 的後排主攻手（雙向對稱）');
});

test('D2②：AI 的發球 Intent 真的瞄在被針對者的接發責任區（不是四區循環）', () => {
  // 掃比分找出「這一球會走針對分支」的局面（針對率 SERVE_TARGET_RATE，決定論 hash）
  let hit = null;
  for (let s = 0; s < 40 && !hit; s += 1) {
    const g = createGame({ seed: 3 });
    g.match.score.A = s;
    const sid = serverId(g.match);
    const team = g.players[sid].teamId;
    g.tick = g.serveReadyTick + AI.SERVE_DELAY + 1;
    const it = aiCollectIntents(g, createAiState()).find((i) => i.action === 'serve');
    if (!it) continue;
    const pid = serveTargetPidOf(g, team);
    const spot = basePosition(
      g.players[pid].teamId, positionOf(g.match.rotations[g.players[pid].teamId], pid),
    );
    if (Math.hypot(it.aim.x - spot.x, it.aim.z - spot.z) < 1e-9) hit = { s, pid, team };
  }
  assert.ok(hit, '至少有一種比分會打出針對性發球');
  assert.equal(hit.pid, hit.team === 'A' ? 'B5' : 'A5');
});

test('D2②：被 AI 發球針對的一方確實少一條線（我方也吃這一刀）', () => {
  // 玩家隊（A）的後排攻擊手 A5 接了發球 → A 這一球只剩三條線
  const g = rigAfterPass(9, 'A5');
  const ai = createAiState();
  aiCollectIntents(g, ai);
  assert.equal(ai.approach.routes.length, 3);
  // 對手（B）同樣吃這一刀：B5 接一傳 → B 少一條 pipe
  const gb = rigAfterPass(9, 'B5', 'B');
  const aib = createAiState();
  aiCollectIntents(gb, aib);
  assert.equal(aib.approach.team, 'B');
  assert.ok(!aib.approach.routes.some((r) => r.pid === 'B5'));
});

// ---- ③ 決定論 ----

test('D2③：決定論——同構造同種子重跑，池／route／發球目標逐值相同', () => {
  const run = () => {
    const g = rigAfterPass(11, 'A5');
    const ai = createAiState();
    const intents = aiCollectIntents(g, ai);
    return {
      pool: attackPointsOf(g, 'A', 'A1', 'perfect', 'A5'),
      routes: ai.approach.routes,
      attacker: ai.attackerId,
      receiver: ai.passReceiverId,
      target: serveTargetPidOf(g, 'B'),
      intents,
    };
  };
  assert.deepEqual(run(), run());
});

// ---- ④ 疊加不是平行 ----

test('D2④：與一傳品質分支疊加（同一道三檔階梯）、且不重複扣', () => {
  const g = createGame({ seed: 3 });
  // 一傳本來就 poor（只剩兩翼高球）時，被針對者的檔位不會再被扣一次 ⇒ 池逐值相同
  assert.deepEqual(
    attackPointsOf(g, 'A', 'A1', 'poor', 'A2'),
    attackPointsOf(g, 'A', 'A1', 'poor'),
    'poor 檔再吃 D2＝同一顆池逐值不變（取較差者，不是連扣兩次）',
  );
  // ok 檔（無快攻）時，MB 本來就不在池裡 ⇒ 針對他也不會再少一條
  assert.deepEqual(
    attackPointsOf(g, 'A', 'A1', 'ok', 'A3'),
    attackPointsOf(g, 'A', 'A1', 'ok'),
  );
  // 但 ok 檔針對後排攻擊手仍有效（他從 ok 掉到罰則檔）＝疊加真的在疊
  const okPipePassed = attackPointsOf(g, 'A', 'A1', 'ok', 'A5');
  assert.deepEqual(kindsOf(okPipePassed), ['left', 'right']);
  // 罰則走的是**同一個 tier 欄位**（不是另開一份排除名單）：非被針對者維持全局檔位
  for (const pt of okPipePassed) assert.equal(pt.tier, 'ok');
});

test('D2④：不影響攻擊點的產生規則本身——沒有被針對時逐值等同舊行為', () => {
  const g = createGame({ seed: 3 });
  const withNull = attackPointsOf(g, 'A', 'A1', 'perfect', null);
  const noArg = attackPointsOf(g, 'A', 'A1', 'perfect');
  assert.deepEqual(withNull, noArg);
  // 接一傳者不是合法攻擊手（後排 MB／S）時，池一格未動
  assert.deepEqual(attackPointsOf(g, 'A', 'A1', 'perfect', 'A6'), noArg);
  assert.deepEqual(attackPointsOf(g, 'A', 'A1', 'perfect', 'A1'), noArg);
});
