// W4(P4) 題3 二次球＋題5 OPP 要球：選項出現條件／call Intent 流／甜蜜區放寬／
// 信任雙倍下注（沿 trust.js 乘係數）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, timingQualityMul, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { setOptionsFor } from '../src/input/setOptions.js';
import { applyAttackOutcome, TRUST_DYN } from '../src/sim/trust.js';

test('題3 二次球選項：S 前排＋Perfect 檔才出現；沿 AI dump 同值（t=0.3、瞄對方淺區）', () => {
  const g = createGame({ seed: 5 });
  // 預設 A1＝setter 在 1 號位（後排）——搬到前排 3 號位驗出現條件
  g.match.rotations.A = ['A2', 'A6', 'A1', 'A4', 'A5', 'A3'];
  const front = setOptionsFor(g, { passTier: 'perfect' }, 'A1');
  const dump = front.find((o) => o.kind === 'dump');
  assert.ok(dump, 'S 前排＋Perfect＝有二次球選項');
  assert.equal(dump.t, 0.3, '與 AI setterDump 同一條 sim 路徑（同 timing）');
  assert.ok(dump.aim.z < 0 || dump.aim.z > 0, 'aim 為世界座標');
  assert.equal(dump.hesitant, false);
  // 非 Perfect 檔＝不出現
  assert.equal(setOptionsFor(g, { passTier: 'ok' }, 'A1').find((o) => o.kind === 'dump'), undefined);
  // 後排＝不出現
  g.match.rotations.A = ['A1', 'A6', 'A2', 'A4', 'A5', 'A3'];
  assert.equal(setOptionsFor(g, { passTier: 'perfect' }, 'A1').find((o) => o.kind === 'dump'), undefined);
});

test('題5 call Intent 流：rally 中登記 callPid＋CALL_BALL 事件；每波一次；死球即清', () => {
  const g = createGame({ seed: 7 });
  const ai = createAiState();
  // 推進到 rally 且我方一傳起球（touches===1）
  let guard = 0;
  while (!(g.phase === 'rally' && g.rally.touches === 1) && guard < 20000) {
    stepGame(g, aiCollectIntents(g, ai));
    guard += 1;
  }
  assert.ok(guard < 20000, '推進到一傳起球（前提）');
  const ev = stepGame(g, [
    { tick: g.tick, playerId: 'A4', action: 'call' },
    { tick: g.tick, playerId: 'A5', action: 'call' }, // 第二個要球者＝無效（每波一次）
  ]);
  assert.equal(g.rally.callPid, 'A4');
  assert.equal(ev.filter((e) => e.type === 'CALL_BALL').length, 1);
  assert.equal(ev[0].playerId, 'A4');
  // 打到死球 → 下一波 callPid 歸零
  guard = 0;
  const before = g.match.score.A + g.match.score.B;
  while (g.match.score.A + g.match.score.B === before && guard < 40000 && g.phase !== 'set_over') {
    stepGame(g, aiCollectIntents(g, ai));
    guard += 1;
  }
  assert.equal(g.rally.callPid, null, '死球後要球登記即清');
});

test('題5 甜蜜區微放寬：窗外時機在放寬帶內＝甜蜜（品質提升非傷害加成）', () => {
  const edge = TUNING.SWEET_LO - 0.04; // 窗外 0.04
  assert.equal(timingQualityMul(edge), 1.0, '無放寬＝窗外');
  assert.equal(timingQualityMul(edge, TUNING.CALL_SWEET_WIDEN), TUNING.SWEET_ACC, '放寬帶內＝甜蜜');
  assert.equal(timingQualityMul(TUNING.OVERCHARGE_T + 0.01, TUNING.CALL_SWEET_WIDEN),
    TUNING.OVER_ACC, '超蓄劣化不受放寬影響');
});

test('題5 信任雙倍下注：升降幅同倍放大（沿 trust.js 乘係數零新機制）', () => {
  const mk = () => ({ trustStreak: {}, trustDyn: {} });
  const a = mk();
  applyAttackOutcome(a, 'X', true);
  assert.equal(a.trustDyn.X, TRUST_DYN.KILL);
  const b = mk();
  applyAttackOutcome(b, 'X', true, TUNING.CALL_TRUST_MUL);
  assert.equal(b.trustDyn.X, TRUST_DYN.KILL * 2, '成功 ×2');
  const c = mk();
  applyAttackOutcome(c, 'X', false, TUNING.CALL_TRUST_MUL);
  assert.equal(c.trustDyn.X, TRUST_DYN.ERR * 2, '失誤同倍放大（下注是雙向的）');
});
