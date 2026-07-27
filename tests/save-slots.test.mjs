// W4(P4) 題2 — 多槽存檔：key 映射／槽間零洩漏／存檔頭同步與自癒／局間存檔 key／代理同形
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SLOT_COUNT, slotKey, slotHeadKey, slotMidKey, headOf, readSlotHeads,
} from '../src/career/saveSlots.js';
import {
  createCareerStore, createSlotStoreProxy, SAVE_KEY,
} from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer, recordResult } from '../src/career/careerState.js';

function fakeStorage() {
  const m = new Map();
  return {
    _map: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function seedSlot(storage, slot, { seed = 7, playerName = '小夢', heightCm = 175 } = {}) {
  const store = createCareerStore(storage, slot);
  const career = createCareer({ seed, playerName });
  assert.ok(store.saveCareer(career));
  assert.ok(store.savePlayer(createCareerPlayer(playerName, { heightCm, seed })));
  return { store, career };
}

test('slot key 映射：槽 1 沿用既有單檔 key（零遷移）、槽 2/3 帶槽號；head/mid 衍生', () => {
  assert.equal(slotKey(1), SAVE_KEY); // 'vd-save'——現有單檔自然成為槽 1
  assert.equal(slotKey(2), 'vd-save-s2');
  assert.equal(slotKey(3), 'vd-save-s3');
  assert.equal(slotHeadKey(1), 'vd-save-head');
  assert.equal(slotMidKey(3), 'vd-save-s3-mid');
  assert.equal(SLOT_COUNT, 3);
});

test('槽間零洩漏：各槽獨立讀寫；clear 只清自己槽', () => {
  const storage = fakeStorage();
  seedSlot(storage, 1, { seed: 11, playerName: '一號' });
  const s2 = createCareerStore(storage, 2);
  assert.equal(s2.hasSave(), false, '槽 2 不得看到槽 1 的生涯');
  seedSlot(storage, 2, { seed: 22, playerName: '二號' });
  const s1 = createCareerStore(storage, 1);
  assert.equal(s1.loadCareer().playerName, '一號');
  assert.equal(createCareerStore(storage, 2).loadCareer().playerName, '二號');
  // clear 槽 2 → 槽 1 完好
  createCareerStore(storage, 2).clear();
  assert.equal(createCareerStore(storage, 2).hasSave(), false);
  assert.equal(createCareerStore(storage, 1).loadCareer().playerName, '一號');
});

test('存檔頭同步維護：寫入即更新；戰績隨賽果變動；欄位齊備', () => {
  const storage = fakeStorage();
  const { store, career } = seedSlot(storage, 2, { playerName: '頭測', heightCm: 182 });
  const head1 = JSON.parse(storage.getItem(slotHeadKey(2)));
  assert.equal(head1.playerName, '頭測');
  assert.equal(head1.role, 'outside');
  assert.equal(head1.seasonIndex, 1);
  assert.equal(head1.wins, 0);
  assert.equal(head1.losses, 0);
  assert.equal(head1.heightCm, 182);
  // 記一勝一敗 → head 跟上
  let c = recordResult(career, { matchId: 'group-1', won: true, scoreFor: 25, scoreAgainst: 20 });
  c = recordResult(c, { matchId: 'group-2', won: false, scoreFor: 21, scoreAgainst: 25 });
  store.saveCareer(c);
  const head2 = JSON.parse(storage.getItem(slotHeadKey(2)));
  assert.equal(head2.wins, 1);
  assert.equal(head2.losses, 1);
});

test('readSlotHeads：head 缺而主檔在（W4 前舊單檔）＝自癒補寫；空槽與骨架檔＝null', () => {
  const storage = fakeStorage();
  seedSlot(storage, 1, { playerName: '舊檔' });
  storage.removeItem(slotHeadKey(1)); // 模擬 W4 前的存檔：只有整包、沒有 head
  // 槽 3＝骨架檔（無生涯只有旗標——positionFlags 回填會造出這種檔）
  createCareerStore(storage, 3).markPositionReady('setter');
  const heads = readSlotHeads(storage);
  assert.equal(heads.length, 3);
  assert.equal(heads[0].head.playerName, '舊檔');
  assert.ok(storage.getItem(slotHeadKey(1)) !== null, '自癒須補寫 head key');
  assert.equal(heads[1].head, null, '空槽＝新的夢');
  assert.equal(heads[2].head, null, '骨架檔（player null）＝新的夢');
});

test('headOf：無 player 或 season 未起＝null', () => {
  assert.equal(headOf(null), null);
  assert.equal(headOf({ player: null, season: { seed: 1 } }), null);
});

test('局間存檔：roundtrip／clear／壞檔安全／槽綁定', () => {
  const storage = fakeStorage();
  const s1 = createCareerStore(storage, 1);
  const mid = { matchId: 'final', setsWon: { A: 1, B: 1 }, snapshot: { tick: 4200 } };
  assert.ok(s1.saveMidMatch(mid));
  assert.deepEqual(s1.loadMidMatch(), mid);
  assert.equal(s1.hasMidMatch(), true);
  assert.equal(createCareerStore(storage, 2).loadMidMatch(), null, '槽 2 不得讀到槽 1 的局間存檔');
  // 壞檔＝null 不炸
  storage.setItem(slotMidKey(1), '{壞掉的');
  assert.equal(s1.loadMidMatch(), null);
  s1.clearMidMatch();
  assert.equal(s1.hasMidMatch(), false);
  // clear 整槽也帶走 mid
  s1.saveMidMatch(mid);
  s1.clear();
  assert.equal(s1.hasMidMatch(), false);
});

test('可切槽代理：API 同形、useSlot 重綁、activeSlot 誠實', () => {
  const storage = fakeStorage();
  seedSlot(storage, 1, { playerName: '甲' });
  seedSlot(storage, 2, { playerName: '乙' });
  const proxy = createSlotStoreProxy(storage, 1);
  // API 同形：單槽 store 的每個方法代理都要有（careerScreen 零改動的前提）
  const real = createCareerStore(storage, 1);
  for (const k of Object.keys(real)) {
    assert.equal(typeof proxy[k], 'function', `代理缺方法：${k}`);
  }
  assert.equal(proxy.activeSlot(), 1);
  assert.equal(proxy.loadCareer().playerName, '甲');
  proxy.useSlot(2);
  assert.equal(proxy.activeSlot(), 2);
  assert.equal(proxy.loadCareer().playerName, '乙');
  assert.equal(proxy.slotIndex(), 2, '轉呼叫須指向現任槽的實體');
});
