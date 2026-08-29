// 大作感二卷 批1（J1-4）：冠軍慶祝觸發判定——雙向直測（冠軍戰勝→真；普通勝/敗→假）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { championshipTitleOf, shouldCelebrateChampionship } from '../src/career/championship.js';

test('冠軍戰勝利 → 回冠軍標題（高中/職業/海外三路徑）', () => {
  assert.equal(shouldCelebrateChampionship({ id: 'national-final' }, true), '全國冠軍');
  assert.equal(shouldCelebrateChampionship({ id: 'pro-final-y3' }, true), '職業聯賽總冠軍');
  assert.equal(shouldCelebrateChampionship({ id: 'foreign-final-2' }, true), '海外聯賽總冠軍');
});

test('反向：普通勝場不慶祝（小組賽/聯賽輪次/練習性 id）', () => {
  for (const id of ['group-1', 'week3', 'uni-r9', 'corp-r8', 'pro-semi-1', 'national-semi']) {
    assert.equal(shouldCelebrateChampionship({ id }, true), null, `${id} 不該慶祝`);
  }
});

test('反向：冠軍戰敗北不慶祝', () => {
  assert.equal(shouldCelebrateChampionship({ id: 'national-final' }, false), null);
  assert.equal(shouldCelebrateChampionship({ id: 'pro-final-y1' }, false), null);
});

test('防呆：無 entry / 無 id 一律 null，不 throw', () => {
  assert.equal(shouldCelebrateChampionship(null, true), null);
  assert.equal(shouldCelebrateChampionship({}, true), null);
  assert.equal(championshipTitleOf({ id: 42 }), null);
});

test('大學/企業聯賽壓軸刻意不在清單（積分制冠軍另掛，本卷後補）', () => {
  assert.equal(championshipTitleOf({ id: 'uni-r9' }), null);
  assert.equal(championshipTitleOf({ id: 'corp-r8' }), null);
});
