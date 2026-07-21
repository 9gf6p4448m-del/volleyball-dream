// 固定步長決定論：模擬結果只跟「步了幾次」有關，跟每幀批次幾步無關
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld } from '../src/sim/world.js';

const TOTAL_STEPS = 3600; // 60 秒模擬（涵蓋 10 個發球循環）

test('連續推進與變動批次推進，最終狀態完全一致', () => {
  const a = createWorld();
  for (let i = 0; i < TOTAL_STEPS; i += 1) stepWorld(a);

  // 模擬「不同幀率下每幀補不同步數」：以固定不規則批次消化同樣的總步數
  const b = createWorld();
  const batches = [1, 4, 2, 7, 1, 3, 5, 2, 6, 1];
  let done = 0;
  let bi = 0;
  while (done < TOTAL_STEPS) {
    const n = Math.min(batches[bi % batches.length], TOTAL_STEPS - done);
    for (let i = 0; i < n; i += 1) stepWorld(b);
    done += n;
    bi += 1;
  }

  assert.equal(a.tick, b.tick);
  assert.deepEqual(a.ball, b.ball);
});

test('長時間模擬（10 分鐘）不產生 NaN、球不出自由區', () => {
  const w = createWorld();
  for (let i = 0; i < 60 * 600; i += 1) {
    stepWorld(w);
    const { x, y, z } = w.ball;
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z),
      `tick ${w.tick} 出現非有限數值`);
    assert.ok(y >= 0, `tick ${w.tick} 球穿地 y=${y}`);
    assert.ok(Math.abs(x) <= 8 && Math.abs(z) <= 13,
      `tick ${w.tick} 球超出場景範圍 (${x}, ${z})`);
  }
});
