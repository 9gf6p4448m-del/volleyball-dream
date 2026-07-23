// 真飄（07-24 拍板）：飄浮發球飛行中側向亂流——實際落點偏離乾淨彈道預測、
// 穩定發球零偏移、決定論重演一致。預測層（predictLanding）刻意不含飄＝接球方被騙
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { predictLanding } from '../src/sim/flight.js';

// 發一球（AI 依 profile 選式）→ 記發球瞬間的乾淨預測 → 無人接、飛到死球 → 實際落點
function serveAndLand(seed, aiProfiles) {
  const g = createGame({ seed, aiProfiles });
  const ai = createAiState();
  while (g.phase === 'serve' && g.tick < 2000) stepGame(g, aiCollectIntents(g, ai));
  assert.equal(g.phase, 'rally', '發球應已發出');
  const predicted = predictLanding(g.ball); // 乾淨彈道預測（AI/落點圈用的同一套）
  let dead = null;
  while (g.phase === 'rally' && g.tick < 3000 && !dead) {
    const ev = stepGame(g, []); // 無人接：球自然落地
    dead = ev.find((e) => e.type === 'DEAD_BALL' && e.at);
  }
  assert.ok(dead, '球應落地');
  return { predicted, actual: dead.at, style: null };
}

test('真飄：飄浮發球實際落點偏離乾淨預測 0.1-1.2m（預測層不含飄＝接球方被騙）', () => {
  let sum = 0;
  let n = 0;
  for (const seed of [11, 23, 37, 51, 77]) {
    const { predicted, actual } = serveAndLand(seed, { A: { floatServeRate: 1 } });
    const dev = Math.hypot(actual.x - predicted.x, actual.z - predicted.z);
    sum += dev;
    n += 1;
    assert.ok(dev < 1.2, `偏移應有界（seed ${seed} 實得 ${dev.toFixed(2)}m）`);
  }
  const avg = sum / n;
  assert.ok(avg > 0.1, `平均偏移應有感（實得 ${avg.toFixed(2)}m）`);
});

test('穩定發球：實際落點與乾淨預測一致（真飄只作用於飄浮球）', () => {
  for (const seed of [11, 23, 37]) {
    const { predicted, actual } = serveAndLand(seed, { A: { floatServeRate: 0 } });
    const dev = Math.hypot(actual.x - predicted.x, actual.z - predicted.z);
    assert.ok(dev < 0.03, `穩定發球零偏移（seed ${seed} 實得 ${dev.toFixed(3)}m）`);
  }
});

test('真飄決定論：同種子重演實際落點逐值一致', () => {
  const a = serveAndLand(42, { A: { floatServeRate: 1 } });
  const b = serveAndLand(42, { A: { floatServeRate: 1 } });
  assert.equal(a.actual.x, b.actual.x);
  assert.equal(a.actual.z, b.actual.z);
});
