// Phase 3 W7 — C3 回歸即建功測試：sim 內建回歸監看（換下→換回→首次殺球定勝負）
// → COMEBACK_SPARK 一次性＋氣勢 +2 檔；未開氣勢也發事件（字卡/爆聲仍可用）
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, applySubstitution, TUNING } from '../src/sim/game.js';
import { createPlayer } from '../src/sim/player.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

const benchPlayer = (id, role = 'outside') => createPlayer({
  id, name: `板凳${id}`, teamId: 'A', naturalRole: role, currentRole: role,
  height: 1.87, trust: 20,
  attributes: {
    jump: 55, power: 55, reaction: 55, stamina: 55,
    speed: 55, control: 55, serve: 55, block: 55,
  },
});

function playUntil(g, ai, pred, maxTicks = 400000) {
  while (!pred(g) && g.tick < maxTicks && g.phase !== 'set_over') {
    stepGame(g, aiCollectIntents(g, ai));
  }
}

// 共用劇本：第 1 個死球窗把一名場上球員換下、下一個死球窗換回，打完全場
function runComebackScript(momentum) {
  const g = createGame({
    seed: 33, setTarget: 25, momentum,
    benches: { A: [benchPlayer('A7')] },
  });
  const ai = createAiState();
  playUntil(g, ai, (s) => s.match.score.A + s.match.score.B >= 1 && s.phase === 'serve');
  // 選攻擊手（OH）——二傳極少是「最後觸球定勝負」者，spark 樣本要靠殺球
  const hero = g.match.rotations.A.find((id) => g.players[id].currentRole === 'outside');
  assert.equal(applySubstitution(g, { team: 'A', outId: hero, inId: 'A7' }).ok, true);
  const scoreAfterOut = g.match.score.A + g.match.score.B;
  playUntil(g, ai, (s) => s.match.score.A + s.match.score.B >= scoreAfterOut + 1 && s.phase === 'serve');
  assert.equal(applySubstitution(g, { team: 'A', outId: 'A7', inId: hero }).ok, true);
  assert.equal(g.subLog.back[hero], true, '回場者應在回歸監看中');
  playUntil(g, ai, () => false); // 打完全場
  return { g, hero };
}

test('C3：換下→換回→首次建功＝COMEBACK_SPARK 一次＋氣勢 +2 檔', () => {
  const { g, hero } = runComebackScript(true);
  const sparks = g.events.filter((e) => e.type === 'COMEBACK_SPARK' && e.playerId === hero);
  assert.equal(sparks.length, 1, `回歸建功應恰好觸發一次（實際 ${sparks.length}）`);
  assert.equal(sparks[0].team, 'A');
  assert.equal(g.subLog.back[hero], undefined, '建功後監看應清除');
  // 同 tick 的氣勢事件：spark 緊隨 +2 檔（可能被 ±3 夾限吸收部分幅度）
  const idx = g.events.indexOf(sparks[0]);
  const after = g.events.slice(idx + 1).find((e) => e.type === 'MOMENTUM');
  if (after && after.tick === sparks[0].tick) {
    assert.ok(Math.abs(after.value) <= TUNING.MOMENTUM_MAX);
  }
  // spark 前的最近一次 MOMENTUM 值 → spark 後應 +2（夾限內）
  const before = [...g.events.slice(0, idx)].reverse().find((e) => e.type === 'MOMENTUM');
  const prevVal = before?.value ?? 0;
  const expected = Math.min(TUNING.MOMENTUM_MAX, prevVal + 2);
  if (after && after.tick === sparks[0].tick) assert.equal(after.value, expected);
});

test('C3：未開氣勢也發 COMEBACK_SPARK（字卡/爆聲驅動源不綁氣勢）', () => {
  const { g, hero } = runComebackScript(false);
  const sparks = g.events.filter((e) => e.type === 'COMEBACK_SPARK' && e.playerId === hero);
  assert.equal(sparks.length, 1);
  assert.ok(!g.events.some((e) => e.type === 'MOMENTUM'));
});

test('C3：不換人＝subLog 恆空、零 COMEBACK_SPARK（零擾動）', () => {
  const g = createGame({ seed: 33, setTarget: 15, momentum: true });
  playUntil(g, createAiState(), () => false);
  assert.deepEqual(g.subLog, { out: {}, back: {} });
  assert.ok(!g.events.some((e) => e.type === 'COMEBACK_SPARK'));
});
