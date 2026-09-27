// 進賽場卷 2A B11：FPS 摘要（平均／最低）——合成時間序列驗證，含一段發球前與一段
// document.hidden，兩者皆須整格排除。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFpsSummary, BUCKET_MS } from '../src/ui/fpsSummary.js';

// 餵 n 幀、每幀 deltaMs，served/hidden 可為常數或依幀序號決定的函式 (i)=>bool
function feed(fs, n, deltaMs, hidden, served) {
  for (let i = 0; i < n; i += 1) {
    fs.frame(
      deltaMs,
      typeof hidden === 'function' ? hidden(i) : hidden,
      typeof served === 'function' ? served(i) : served,
    );
  }
}

test('沒有任何計入格子時，summary 為 { avg: null, min: null }', () => {
  const fs = createFpsSummary();
  assert.deepEqual(fs.summary(), { avg: null, min: null });
  feed(fs, 10, 10, false, false); // 未滿一格（100ms < 500ms），且發球前——都不該計入
  assert.deepEqual(fs.summary(), { avg: null, min: null });
});

test('平均＝計入格子總幀數÷總時間；最低＝計入格子中最低一格；發球前與 hidden 整格排除', () => {
  const fs = createFpsSummary();
  assert.equal(BUCKET_MS, 500);

  // 段1：發球前，50 幀 @10ms＝一整格（100fps）——即使數字很漂亮也不得計入
  feed(fs, 50, 10, false, false);
  assert.deepEqual(fs.summary(), { avg: null, min: null });

  // 段2：發球後、非 hidden，50 幀 @10ms＝一整格，100fps
  feed(fs, 50, 10, false, true);

  // 段3：發球後、非 hidden，25 幀 @20ms＝一整格（500ms），50fps——本段最低
  feed(fs, 25, 20, false, true);

  // 段4：發球後，50 幀 @10ms，其中只有第 10 幀 hidden=true——一幀 hidden 即整格排除
  feed(fs, 50, 10, (i) => i === 9, true);

  // 段5：發球後、非 hidden，50 幀 @10ms＝一整格，100fps
  feed(fs, 50, 10, false, true);

  // 計入：段2(50幀/500ms,100fps) + 段3(25幀/500ms,50fps) + 段5(50幀/500ms,100fps)
  // 總幀數 125、總時間 1.5s；平均 125/1.5=83.333...；最低取段3＝50
  const { avg, min } = fs.summary();
  assert.ok(Math.abs(avg - (125 / 1.5)) < 1e-9, `avg=${avg}`);
  assert.equal(min, 50);

  // 段6：未滿一格的尾巴（10 幀 @10ms＝100ms < 500ms）不得改變已結算的摘要
  feed(fs, 10, 10, false, true);
  const after = fs.summary();
  assert.deepEqual(after, { avg, min });
});

test('格子起算點：格子開始那一幀若未發球，格內途中才轉為已發球仍整格排除（跨界格）', () => {
  const fs = createFpsSummary();
  // 同一格（50 幀 @10ms＝500ms）：前 10 幀 served=false（格子開始時的狀態），
  // 後 40 幀 served=true——整格仍以「格子開始那一幀」的狀態判定，排除。
  feed(fs, 50, 10, false, (i) => i >= 10);
  assert.deepEqual(fs.summary(), { avg: null, min: null });
});

test('markServed 語意（消費端典型用法）：發球後才開始餵 served=true 的格子照常計入', () => {
  const fs = createFpsSummary();
  let served = false;
  const markServed = () => { served = true; };
  feed(fs, 50, 10, false, () => served); // 尚未發球，恰好整格（不留跨界殘幀）
  markServed();
  feed(fs, 50, 10, false, () => served); // 發球後全新一格，整整一格
  const { avg, min } = fs.summary();
  assert.equal(avg, 100);
  assert.equal(min, 100);
});
