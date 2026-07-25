// W7.1 #3A/#4 表現層——純函式邏輯直測（matchLoop.js 其餘部分是 rAF/DOM 綁定）：
// avgStamina（教練選項「回了多少%」量測基準）。
// 註：滿檔字卡跨進判定已移到 src/ui/heroCards.js momentumCardFor，測試在 hero-cards.test.mjs。
// 選項本身的 sim 效果（calm/fire）已由 tests/timeout.test.mjs 覆蓋，這裡只測表現層邏輯。
import test from 'node:test';
import assert from 'node:assert/strict';
import { avgStamina } from '../src/app/matchLoop.js';

function makeGame({ rotA = ['A1', 'A2'], stamina = null } = {}) {
  return {
    match: { rotations: { A: rotA, B: [] } },
    stamina,
  };
}

test('avgStamina：體力未啟用（game.stamina 為 null）回傳 null', () => {
  const g = makeGame({ stamina: null });
  assert.equal(avgStamina(g, 'A'), null);
});

test('avgStamina：算全隊平均（含缺值以 1 補）', () => {
  const g = makeGame({ rotA: ['A1', 'A2'], stamina: { A1: 0.4, A2: 0.6 } });
  assert.equal(avgStamina(g, 'A'), 0.5);
});

test('avgStamina：隊伍無場上球員（空陣容）回傳 null', () => {
  const g = { match: { rotations: { A: [], B: [] } }, stamina: { x: 1 } };
  assert.equal(avgStamina(g, 'A'), null);
});

