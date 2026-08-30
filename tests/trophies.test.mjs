// 大作感二卷 批6（J6-3）：存檔→獎盃清單純函式——含空存檔與里程碑門檻
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectTrophies } from '../src/career/trophies.js';
import {
  MILESTONE_VETERAN_YEAR, MILESTONE_DYNASTY_TITLES, MILESTONE_FINAL_PUSH_YEAR,
} from '../src/career/proMilestones.js';

test('空存檔 → 空清單（不 throw）', () => {
  assert.deepEqual(collectTrophies({}), []);
  assert.deepEqual(collectTrophies({ seasons: [] }), []);
  assert.deepEqual(collectTrophies(), []);
});

test('各章冠軍逐一入列；非冠軍季不入列', () => {
  const seasons = [
    { index: 1, champion: false },
    { index: 3, champion: true },
    { index: 4, uniRank: 2 },
    { index: 5, uniRank: 1 },
    { index: 8, corpRank: 1 },
    { index: 9, proFinish: 'semi' },
    { index: 10, proFinish: 'champion' },
  ];
  const list = collectTrophies({ seasons });
  const titles = list.map((t) => t.title);
  assert.deepEqual(titles, ['全國冠軍', '大學聯賽冠軍', '企業聯賽冠軍', '季後賽總冠軍']);
  assert.ok(list.every((t) => t.icon && t.sub));
});

test('里程碑門檻：年資/冠軍數從封存數出來（與 proMilestones 常數同源）', () => {
  const proSeason = (i, finish = 'league') => ({ index: i, proFinish: finish });
  const nine = Array.from({ length: MILESTONE_FINAL_PUSH_YEAR }, (_, i) => proSeason(i + 1,
    i < MILESTONE_DYNASTY_TITLES ? 'champion' : 'league'));
  const titles = collectTrophies({ seasons: nine }).map((t) => t.title);
  assert.ok(titles.includes('老兵之年'));
  assert.ok(titles.includes('王朝'));
  assert.ok(titles.includes('最後衝刺'));
  // 反向：年資不足無老兵、冠軍數不足無王朝
  const few = collectTrophies({
    seasons: Array.from({ length: MILESTONE_VETERAN_YEAR - 1 }, (_, i) => proSeason(i + 1)),
  }).map((t) => t.title);
  assert.ok(!few.includes('老兵之年'));
  assert.ok(!few.includes('王朝'));
});

test('壞資料防呆：null 季、缺 index 不 throw', () => {
  const list = collectTrophies({ seasons: [null, { champion: true }] });
  assert.equal(list[0].title, '全國冠軍');
});
