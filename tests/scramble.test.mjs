// 接噴救球補完（07-23 拍板：第二追球者＋魚躍擴到救噴球）——
// 備援 claim 指派（主追趕不上才加派）、touches≥1 亂飛低球可魚躍、第三觸撲過網、決定論
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

// 構造 rally 中「我方一傳噴掉」的狀態（沿 serve-dive.test 慣例：直接寫 rally/ball/actors）
function shankRig({ touches = 1, ball, diveRate = null } = {}) {
  const g = createGame({
    seed: 9,
    ...(diveRate !== null ? { aiProfiles: { A: { diveRate } } } : {}),
  });
  g.phase = 'rally';
  Object.assign(g.rally, {
    profile: 'arc', possession: 'A', touches, lastTouchTeam: 'A', lastToucherId: 'A5',
  });
  const b = g.ball;
  Object.assign(b, ball);
  b.px = b.x; b.py = b.y; b.pz = b.z;
  return g;
}

test('第二追球者：主追（二傳）明顯趕不上噴遠的球＝加派備援；趕得上＝零加派', () => {
  // 噴到深角、快落地：二傳 A1 被拉到對角＝絕對趕不上 → 備援出現
  const g = shankRig({ ball: { x: 4, y: 1.6, z: 8.2, vx: 0, vy: -3, vz: 0 } });
  g.actors.A1.x = -4; g.actors.A1.z = 0.8; // 二傳在網前左側，離噴點 ~8m
  const ai = createAiState();
  aiCollectIntents(g, ai); // 觸發 ensureFlightPlan
  assert.equal(ai.claimId, 'A1', '一傳後主追＝二傳（職責制）');
  assert.ok(ai.backupId, '主追趕不上＝加派備援');
  assert.ok(ai.backupId !== 'A1' && ai.backupId !== 'A5', '備援不得是主追或剛觸球者');

  // 正常高弧、主追就站在落點旁：趕得上 → 零加派（回歸不擾動）
  const g2 = shankRig({ ball: { x: 2, y: 6, z: 2, vx: 0, vy: 3, vz: 0 } });
  g2.actors.A1.x = 2; g2.actors.A1.z = 2.5; // 二傳在落點旁待球
  const ai2 = createAiState();
  aiCollectIntents(g2, ai2);
  assert.equal(ai2.backupId, null, '主追趕得上＝不加派備援');
});

test('救噴魚躍：touches=1 的亂飛低球、搆不到但撲得到＝主追可魚躍（原 touches=0 閘已放寬）', () => {
  const g = shankRig({ diveRate: 1, ball: { x: 0, y: 0.6, z: 4.9, vx: 0, vy: -2, vz: 0 } });
  g.actors.A1.x = 0; g.actors.A1.z = 6.5; // 主追（二傳）距球 1.6m：搆不到、魚躍可及
  const ai = createAiState();
  aiCollectIntents(g, ai); // 規劃（planTick=現在）
  assert.equal(ai.claimId, 'A1');
  ai.planTick = g.tick - 30; // 跳過反應延遲（同 tick 重取 intent，球未動＝決定論）
  const intents = aiCollectIntents(g, ai);
  const dive = intents.find((it) => it.action === 'dive' && it.playerId === 'A1');
  assert.ok(dive, '主追對噴掉的低球應魚躍撲救');
  assert.ok(dive.aim.z > 0, 'touches=1 撲救目標在我方半場（墊回二傳點）');
});

test('救噴魚躍：touches=2 的第三觸撲救目標改過網（撲回自家＝白送四擊犯規）', () => {
  const g = shankRig({ touches: 2, diveRate: 1, ball: { x: 0, y: 0.6, z: 4.9, vx: 0, vy: -2, vz: 0 } });
  // touches=2 主追＝攻擊手/仲裁；把最可能的追球者都拉到 1.6m 帶（魚躍窗）之外太複雜，
  // 直接把仲裁贏家放進魚躍窗：ensureFlightPlan 決定 claim 後再驗其 dive aim
  const ai = createAiState();
  aiCollectIntents(g, ai);
  assert.ok(ai.claimId, '第三擊有人追');
  const c = g.actors[ai.claimId];
  c.x = 0; c.z = 6.5; // 追球者距球 1.6m：搆不到、魚躍可及
  ai.planTick = g.tick - 30;
  const intents = aiCollectIntents(g, ai);
  const dive = intents.find((it) => it.action === 'dive' && it.playerId === ai.claimId);
  assert.ok(dive, '第三觸也可魚躍撲救');
  assert.ok(dive.aim.z < 0, '第三觸撲救目標須在對面（過網安全球）');
});

test('決定論：同構造同種子重跑，備援指派與魚躍 intent 逐值一致', () => {
  const run = () => {
    const g = shankRig({ diveRate: 1, ball: { x: 4, y: 1.6, z: 8.2, vx: 0, vy: -3, vz: 0 } });
    g.actors.A1.x = -4; g.actors.A1.z = 0.8;
    const ai = createAiState();
    aiCollectIntents(g, ai);
    ai.planTick = g.tick - 30;
    return { backup: ai.backupId, intents: aiCollectIntents(g, ai) };
  };
  const a = run();
  const b = run();
  assert.equal(a.backup, b.backup);
  assert.deepEqual(a.intents, b.intents);
});
