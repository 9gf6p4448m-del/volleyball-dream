// FIVB 7.4/7.5/7.7 規則引擎驗收（依 2025-2028 原文逐字核對後的解讀實作）
// ＋攔網分工不疊人迴歸（換位制角色定線＋邊線防夾擠）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, lineupOf } from '../src/sim/game.js';
import {
  isRotationLegal, isRotationOrderLegal, cancelFaultPoints, LEVEL_EPS,
} from '../src/sim/rotationRules.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { rotateLineup } from '../src/sim/rotation.js';
import { velocityForApex } from '../src/sim/flight.js';

// 合法站位模板（隊伍視角：x=距左邊線 0..9、y=距中線 0..9）——輪轉基準位
function legalLineup() {
  const at = { 4: [1.5, 3], 3: [4.5, 3], 2: [7.5, 3], 5: [1.5, 7], 6: [4.5, 7], 1: [7.5, 7] };
  return Object.entries(at).map(([zone, [x, y]]) => ({
    zone: +zone, feet: [{ x, y, grounded: true }],
  }));
}

function withZone(lineup, zone, feet) {
  return lineup.map((e) => (e.zone === zone ? { ...e, feet } : e));
}

test('基準站位六區全合法（接發方視角）', () => {
  const r = isRotationLegal(legalLineup(), false);
  assert.equal(r.legal, true, JSON.stringify(r.faults));
});

test('發球方豁免（7.4）：亂站也合法；同站位以接發方判定則犯規', () => {
  // 後排 1 區整個站到前排 2 區之前（y=1 < 3）
  const scrambled = withZone(legalLineup(), 1, [{ x: 7.5, y: 1, grounded: true }]);
  assert.equal(isRotationLegal(scrambled, true).legal, true, '發球方全隊豁免輪轉站位');
  const r = isRotationLegal(scrambled, false);
  assert.equal(r.legal, false);
  assert.equal(r.faults[0].rule, '7.4.3.1');
  assert.deepEqual(r.faults[0].zones, [2, 1]);
});

test('齊平邊界（7.4.3.1 level with）：等值合法、EPS 內合法、超出即犯規', () => {
  const level = withZone(legalLineup(), 1, [{ x: 7.5, y: 3, grounded: true }]);
  assert.equal(isRotationLegal(level, false).legal, true, '齊平必須合法（>= 而非 >）');
  const inEps = withZone(legalLineup(), 1, [{ x: 7.5, y: 3 - LEVEL_EPS / 2, grounded: true }]);
  assert.equal(isRotationLegal(inEps, false).legal, true, 'EPS 內視為齊平');
  const fault = withZone(legalLineup(), 1, [{ x: 7.5, y: 2.999, grounded: true }]);
  assert.equal(isRotationLegal(fault, false).legal, false);
});

test('最後接觸固定位置：離地腳不列入判定、全離地退回快照點', () => {
  // 1 區一腳跳到前面（離地）＋一腳著地在合法位 → 合法
  const jump = withZone(legalLineup(), 1, [
    { x: 7.5, y: 1.0, grounded: false },
    { x: 7.5, y: 7, grounded: true },
  ]);
  assert.equal(isRotationLegal(jump, false).legal, true);
  // 全離地：呼叫端傳最後著地座標＝判定點（此處在違規位 → 犯規）
  const air = withZone(legalLineup(), 1, [{ x: 7.5, y: 1.0, grounded: false }]);
  assert.equal(isRotationLegal(air, false).legal, false);
});

test('左右跨位（7.4.3.2 原文複數）：相鄰鏈通過但左 vs 右違規仍須抓到', () => {
  // 3 區雙腳大跨（x=1 與 8）：4vs3、2vs3 都過，但 4(x=5) 整體在 2(x=2) 右側
  let lu = withZone(legalLineup(), 4, [{ x: 5, y: 3, grounded: true }]);
  lu = withZone(lu, 3, [{ x: 1, y: 3, grounded: true }, { x: 8, y: 3, grounded: true }]);
  lu = withZone(lu, 2, [{ x: 2, y: 3, grounded: true }]);
  const r = isRotationLegal(lu, false);
  assert.equal(r.legal, false, '相鄰鏈驗法會漏掉這一例——必須全配對');
  assert.ok(r.faults.some((f) => f.rule === '7.4.3.2' &&
    f.zones[0] === 4 && f.zones[1] === 2), JSON.stringify(r.faults));
});

test('輪轉錯誤（7.7）獨立判定：與站位無關、依發球序輪流', () => {
  const order = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];
  assert.equal(isRotationOrderLegal('A1', order, 0), true);
  assert.equal(isRotationOrderLegal('A2', order, 0), false);
  assert.equal(isRotationOrderLegal('A2', order, 1), true);
  assert.equal(isRotationOrderLegal('A1', order, 6), true); // 繞完一圈
  assert.equal(isRotationOrderLegal('A1', [], 0), false);
});

test('追溯扣分（7.7.2）：犯規時刻後犯規隊得分全取消、對隊保留；無法判定則不追溯', () => {
  const events = [
    { type: 'SCORE', team: 'A', tick: 10 },
    { type: 'SCORE', team: 'B', tick: 20 },
    { type: 'SCORE', team: 'B', tick: 30 },
    { type: 'SCORE', team: 'A', tick: 40 },
  ];
  assert.deepEqual(cancelFaultPoints(events, 15, 'B'), { cancelled: 2, score: { A: 2, B: 0 } });
  assert.deepEqual(cancelFaultPoints(events, null, 'B'), { cancelled: 0, score: { A: 2, B: 2 } });
});

test('sim 整合：接發方站位違規 → 發球瞬間判 POSITIONAL_FAULT、發球方得分', () => {
  const g = createGame({ seed: 21 });
  const ai = createAiState();
  // 接發方（B）的 5 區球員晃到網前不歸位（排除其 AI＝模擬亂走的玩家）
  const wanderer = g.match.rotations.B[4];
  g.actors[wanderer].z = -1.0; // 後排卻整個站到對應前排(z=-3)之前
  let fault = null;
  for (let i = 0; i < 300 && !fault; i += 1) {
    g.actors[wanderer].z = -1.0; // 持續亂站（模擬玩家壓著搖桿）
    const evs = stepGame(g, aiCollectIntents(g, ai, [wanderer]));
    fault = evs.find((e) => e.type === 'POSITIONAL_FAULT') ?? null;
  }
  assert.ok(fault, '發球瞬間應判出站位犯規');
  assert.equal(fault.team, 'B');
  assert.equal(fault.faults[0].rule, '7.4.3.1');
  assert.equal(g.match.score.A, 1, '犯規＝發球方（A）得分');
});

test('sim 整合：全 AI 整局零 POSITIONAL_FAULT（六輪基準站位皆合法）', () => {
  const g = createGame({ seed: 5, setTarget: 15 });
  const ai = createAiState();
  let faults = 0;
  let serves = 0;
  while (g.phase !== 'set_over' && g.tick < 400000) {
    const evs = stepGame(g, aiCollectIntents(g, ai));
    for (const e of evs) {
      if (e.type === 'POSITIONAL_FAULT') faults += 1;
      if (e.type === 'SERVE') serves += 1;
    }
  }
  assert.equal(g.phase, 'set_over');
  assert.equal(faults, 0, 'AI 站基準位不該吃站位犯規');
  assert.ok(serves >= 15, `整局至少 15 次發球（實得 ${serves}）——每次都通過判定`);
});

test('換位時序：發球擊出前不換位（前排停在輪轉位）、擊出後才跑職責位', () => {
  const g = createGame({ seed: 11 }); // A 先發、B 接發
  const ai = createAiState();
  const b4 = 'B4'; // B 隊 OPP，開局 4 區（世界 (3,-3)）；職責位＝右翼（世界 x=-3）
  // 發球前：只推進到 serveReadyTick 之前，B4 必須還在輪轉基準位
  for (let i = 0; i < 60; i += 1) stepGame(g, aiCollectIntents(g, ai));
  assert.equal(g.phase, 'serve', '前置條件：還沒發球');
  assert.ok(Math.abs(g.actors[b4].x - 3) < 0.2 && Math.abs(g.actors[b4].z - -3) < 0.2,
    `發球前 B4 不得離開輪轉位（實得 ${g.actors[b4].x.toFixed(2)}, ${g.actors[b4].z.toFixed(2)}）`);
  // 發球後：OPP 往右翼職責位（B 隊右翼＝世界 x=-3）換位
  let served = false;
  for (let i = 0; i < 300; i += 1) {
    const evs = stepGame(g, aiCollectIntents(g, ai));
    if (evs.some((e) => e.type === 'SERVE')) { served = true; break; }
  }
  assert.ok(served);
  assert.notEqual(ai.claimId, 'B4', '前置條件：B4 非接球者（換位驗證需他自由）');
  for (let i = 0; i < 70 && g.phase === 'rally'; i += 1) stepGame(g, aiCollectIntents(g, ai));
  assert.ok(g.actors[b4].x < 1.0,
    `發球後 B4 應明顯向右翼換位移動（x 實得 ${g.actors[b4].x.toFixed(2)}，基準位 3.0）`);
});

test('5-1 對角不變式：六輪中 S↔OPP、OH↔OH、MB↔MB 皆為對角（1-4/2-5/3-6）', () => {
  const g = createGame({ seed: 1 });
  let rot = [...g.match.rotations.A];
  for (let round = 0; round < 6; round += 1) {
    for (let z = 0; z < 3; z += 1) {
      const a = g.players[rot[z]].currentRole;
      const b = g.players[rot[z + 3]].currentRole;
      const pair = [a, b].sort().join('+');
      assert.ok(
        pair === 'opposite+setter' || pair === 'outside+outside' || pair === 'middle+middle',
        `第 ${round + 1} 輪 ${z + 1}-${z + 4} 號位對角錯誤：${a} vs ${b}`,
      );
    }
    rot = rotateLineup(rot);
  }
});

// ---- 攔網分工不疊人（角色定線＋邊線防夾擠）----

function rigOpponentOrganizing(seed, ballX) {
  const g = createGame({ seed });
  g.phase = 'rally';
  const r = g.rally;
  r.profile = 'arc';
  r.possession = 'B';
  r.touches = 1;
  r.lastTouchTeam = 'B';
  r.lastToucherId = 'B5';
  const b = g.ball;
  b.x = ballX; b.y = 2.5; b.z = -5;
  const v = velocityForApex(b, { x: ballX * 0.4, y: 0.105, z: -1.5 }, 4.8);
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  r.flightId += 1;
  return g;
}

test('攔網牆不疊人：任何球位（含貼邊線）參戰攔網手目標間距 ≥ 1.3m', () => {
  for (const ballX of [0, 2.5, -2.5, 4.3, -4.3]) {
    const g = rigOpponentOrganizing(31, ballX);
    const ai = createAiState();
    const intents = aiCollectIntents(g, ai);
    const frontA = g.match.rotations.A.slice(1, 4);
    // 參戰＝目標在網前（z≈BLOCK_LZ）；遠側翼撤退補吊不算
    const wallXs = intents
      .filter((it) => frontA.includes(it.playerId) && it.aim && Math.abs(it.aim.z) < 1.0)
      .map((it) => it.aim.x);
    assert.ok(wallXs.length >= 2, `球位 ${ballX} 至少雙人攔網（實得 ${wallXs.length}）`);
    for (let i = 0; i < wallXs.length; i += 1) {
      for (let j = i + 1; j < wallXs.length; j += 1) {
        assert.ok(Math.abs(wallXs[i] - wallXs[j]) >= 1.3,
          `球位 ${ballX} 攔網手目標重疊：${wallXs.map((x) => x.toFixed(2)).join(', ')}`);
      }
    }
  }
});

test('攔網角色定線：三線互斥（OH 左/MB 軸/OPP 右），輪轉後仍不因站位撞線', () => {
  // 轉一輪：A 前排變 MB1(2區)/OPP(3區)/OH2(4區)——舊 pos 制會讓 3 區翼與 MB 同線
  const g = rigOpponentOrganizing(33, 0);
  const rotated = [...g.match.rotations.A.slice(1), g.match.rotations.A[0]];
  g.match.rotations.A = rotated;
  const ai = createAiState();
  const intents = aiCollectIntents(g, ai);
  const frontA = rotated.slice(1, 4);
  const wallXs = intents
    .filter((it) => frontA.includes(it.playerId) && it.aim && Math.abs(it.aim.z) < 1.0)
    .map((it) => it.aim.x)
    .sort((a, b) => a - b);
  assert.equal(wallXs.length, 3, '球在中路＝三人牆');
  assert.ok(wallXs[1] - wallXs[0] >= 1.3 && wallXs[2] - wallXs[1] >= 1.3,
    `三線需分開：${wallXs.map((x) => x.toFixed(2)).join(', ')}`);
});
