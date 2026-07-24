// W7.1 #3A/#4 表現層——純函式邏輯直測（matchLoop.js 其餘部分是 rAF/DOM 綁定）：
// avgStamina（教練選項「回了多少%」量測基準）、enteringMomentumMax（滿檔字卡跨進判定）。
// 選項本身的 sim 效果（calm/fire）已由 tests/timeout.test.mjs 覆蓋，這裡只測表現層邏輯。
import test from 'node:test';
import assert from 'node:assert/strict';
import { avgStamina, enteringMomentumMax } from '../src/app/matchLoop.js';

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

test('enteringMomentumMax：跨進 +MAX 判 A、跨進 −MAX 判 B', () => {
  assert.equal(enteringMomentumMax(2, 3, 3), 'A');
  assert.equal(enteringMomentumMax(-2, -3, 3), 'B');
});

test('enteringMomentumMax：已在滿檔（同檔內波動）不重發', () => {
  assert.equal(enteringMomentumMax(3, 3, 3), null); // 理論上值不變不會發 MOMENTUM，這裡防呆驗證
  assert.equal(enteringMomentumMax(-3, -3, 3), null);
});

test('enteringMomentumMax：離開滿檔再進可重發（呼叫端逐次傳入 prevValue 即可還原）', () => {
  assert.equal(enteringMomentumMax(3, 2, 3), null);   // 離開滿檔：不發卡
  assert.equal(enteringMomentumMax(2, 3, 3), 'A');    // 再次跨進：重發
});

test('enteringMomentumMax：未達滿檔（一般值變動）不觸發', () => {
  assert.equal(enteringMomentumMax(0, 1, 3), null);
  assert.equal(enteringMomentumMax(1, 2, 3), null);
});
