// Phase 4 W3 — 位置開放旗標（positionFlags.js＋careerStore 兩條寫入路徑＋schema 驗證）
// 甲4 鐵律背書：ready→open 只有手批入口寫得出來，自動化路徑（markPositionReady）
// 結構上不可能產生 open。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLAG_POSITIONS, defaultPositionFlags, positionFlagsOf,
  markPositionReady, approvePositionOpen, isPositionOpen, ENGINEERED_READY,
} from '../src/career/positionFlags.js';
import { createCareerStore } from '../src/career/careerStore.js';
import { createSaveV2, serializeSave, deserializeSave } from '../src/career/schema.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

test('旗標讀取容錯：缺檔/缺鍵/部分鍵/非法值全回 locked，未知鍵丟棄', () => {
  assert.deepEqual(positionFlagsOf(null), defaultPositionFlags());
  assert.deepEqual(positionFlagsOf({}), defaultPositionFlags());
  assert.deepEqual(positionFlagsOf({ career: {} }), defaultPositionFlags());
  const partial = positionFlagsOf({ career: { positionFlags: { setter: 'ready' } } });
  assert.equal(partial.setter, 'ready');
  assert.equal(partial.middle, 'locked');
  // 非法值當 locked；未知鍵不透傳
  const dirty = positionFlagsOf({ career: { positionFlags: { setter: 'OPEN', coach: 'open' } } });
  assert.equal(dirty.setter, 'locked');
  assert.equal(dirty.coach, undefined);
  assert.deepEqual(Object.keys(dirty).sort(), [...FLAG_POSITIONS].sort());
});

test('markPositionReady：locked→ready、冪等、不降級 open、未知位置 throw、不動原物件', () => {
  const base = defaultPositionFlags();
  const ready = markPositionReady(base, 'setter');
  assert.equal(ready.setter, 'ready');
  assert.equal(base.setter, 'locked'); // 原物件不動
  assert.equal(markPositionReady(ready, 'setter').setter, 'ready'); // 冪等
  const opened = { ...base, libero: 'open' };
  assert.equal(markPositionReady(opened, 'libero').libero, 'open'); // 不降級
  assert.throws(() => markPositionReady(base, 'outside')); // OH 不入旗標
  assert.throws(() => markPositionReady(base, 'coach'));
});

test('甲4 守衛：markPositionReady 從任何非 open 狀態出發都寫不出 open', () => {
  for (const pos of FLAG_POSITIONS) {
    for (const start of ['locked', 'ready']) {
      const flags = { ...defaultPositionFlags(), [pos]: start };
      // 連打十次也只會停在 ready
      let cur = flags;
      for (let i = 0; i < 10; i += 1) cur = markPositionReady(cur, pos);
      assert.equal(cur[pos], 'ready');
    }
  }
});

test('approvePositionOpen：ready→open、locked 直開 throw、open 冪等、未知位置 throw', () => {
  const base = defaultPositionFlags();
  assert.throws(() => approvePositionOpen(base, 'setter'), /尚未 ready/);
  const ready = markPositionReady(base, 'setter');
  const opened = approvePositionOpen(ready, 'setter');
  assert.equal(opened.setter, 'open');
  assert.ok(isPositionOpen(opened, 'setter'));
  assert.ok(!isPositionOpen(opened, 'middle'));
  assert.equal(approvePositionOpen(opened, 'setter').setter, 'open'); // 冪等
  assert.throws(() => approvePositionOpen(ready, 'coach'));
});

test('store 整合：markPositionReady 持久化＋其餘頂層鍵原樣；approveOpen 未 ready 回 false 不動檔', () => {
  const store = createCareerStore(fakeStorage());
  // 未 ready 手批：false 且存檔維持全 locked
  assert.equal(store.approveOpenPosition('setter'), false);
  assert.deepEqual(store.loadPositionFlags(), defaultPositionFlags());
  // 未知位置：false 不炸
  assert.equal(store.approveOpenPosition('coach'), false);
  // 工程結案 locked→ready → 手批 ready→open → round-trip
  assert.ok(store.markPositionReady('setter'));
  assert.equal(store.loadPositionFlags().setter, 'ready');
  assert.ok(store.approveOpenPosition('setter'));
  assert.equal(store.loadPositionFlags().setter, 'open');
  // 其他位置不受牽連
  assert.equal(store.loadPositionFlags().libero, 'locked');
  // 其餘頂層鍵原樣保留（RMW 合約）
  const roster = store.loadRoster();
  assert.equal(roster.capacity, 12);
});

test('ENGINEERED_READY 回填（W3 結案定義）：四位置全 ready、開機冪等、不動 open', () => {
  assert.deepEqual([...ENGINEERED_READY].sort(), [...FLAG_POSITIONS].sort()); // 結案＝四位置全 ready
  const store = createCareerStore(fakeStorage());
  // 開機回填（main.js 同款）×2＝冪等
  for (let i = 0; i < 2; i += 1) for (const p of ENGINEERED_READY) store.markPositionReady(p);
  const flags = store.loadPositionFlags();
  for (const p of FLAG_POSITIONS) assert.equal(flags[p], 'ready');
  // 手批 open 後再回填＝open 不被降級
  assert.ok(store.approveOpenPosition('setter'));
  for (const p of ENGINEERED_READY) store.markPositionReady(p);
  assert.equal(store.loadPositionFlags().setter, 'open');
});

test('schema 驗證：壞旗標值 throw、合法旗標 round-trip、缺鍵容許', () => {
  const clean = createSaveV2({});
  assert.doesNotThrow(() => deserializeSave(serializeSave(clean))); // career:{} 無旗標鍵
  const good = { ...clean, career: { positionFlags: { setter: 'ready', libero: 'open' } } };
  const back = deserializeSave(serializeSave(good));
  assert.equal(back.career.positionFlags.setter, 'ready');
  const badValue = { ...clean, career: { positionFlags: { setter: 'OPEN' } } };
  assert.throws(() => deserializeSave(serializeSave(badValue)), /positionFlags\.setter/);
  const badShape = { ...clean, career: { positionFlags: 'open' } };
  assert.throws(() => deserializeSave(serializeSave(badShape)), /須為物件/);
});
