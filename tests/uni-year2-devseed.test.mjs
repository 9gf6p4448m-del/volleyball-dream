// 大二卷 批 2 — 治具跳年（2026-08-25）
// 驗收＝`docs/kickoffs/acceptance-uni-y2-batch2.md`（B2-1~B2-4）。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import {
  buildSyntheticSave, devUniRequest, advanceToUniYear,
} from '../src/career/devSeed.js';
import { chapterSeasonOf } from '../src/career/chapter.js';
import { FINISH } from '../src/career/admission.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

const paramsOf = (obj) => new URLSearchParams(obj);

test('B2-3 devUniRequest 守衛：亂帶一律 null，合法才解出', () => {
  assert.equal(devUniRequest(paramsOf({})), null, '缺席');
  assert.equal(devUniRequest(paramsOf({ devuni: 'north-ridge' })), null, '無冒號');
  assert.equal(devUniRequest(paramsOf({ devuni: 'bei-ling:2' })), null, '校不存在');
  assert.equal(devUniRequest(paramsOf({ devuni: 'north-ridge:0' })), null, '年下界');
  assert.equal(devUniRequest(paramsOf({ devuni: 'north-ridge:5' })), null, '年上界');
  assert.equal(devUniRequest(paramsOf({ devuni: 'north-ridge:x' })), null, '年非整數');
  assert.equal(devUniRequest(paramsOf({ devuni: 'north-ridge:3.5' })), null,
    '小數不得被 parseInt 靜默截成 3（覆審 LOW 修）');
  assert.deepEqual(devUniRequest(paramsOf({ devuni: 'north-ridge:3' })),
    { schoolId: 'north-ridge', year: 3 });
});

test('B2-2 機械判定：devSeed 不得繞過 store 直接 import 大學建構模組', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/career/devSeed.js', import.meta.url), 'utf8');
  // 斷言的是模組路徑（import 才會出現），不是函式名（註解裡的禁令說明會誤中）
  for (const path of ['./uniSchedule.js', './uniTurnover.js', './uniTeam.js']) {
    assert.ok(!src.includes(`'${path}'`), `devSeed.js 不得 import ${path}——推進只准走 store 公開方法`);
  }
});

/** 合成存檔進槽（比照 main.js 的 seedWholeSave 路徑）。 */
function seededStore() {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  store.seedWholeSave(buildSyntheticSave({ finish: FINISH.QUARTER }));
  return { storage, store };
}

test('B2-1 跳到大三：章節/學校/年份/開局賽程/歷年封存全對', () => {
  const { storage, store } = seededStore();
  assert.equal(advanceToUniYear(store, { schoolId: 'north-ridge', year: 3 }), true);
  const chapter = store.loadChapter();
  assert.equal(chapter.id, 'university', '章節＝大學');
  assert.equal(store.loadSchool(), 'north-ridge', '學校＝指定校');
  assert.equal(chapterSeasonOf(chapter, store.seasonIndex()), 3, '大三');
  const career = store.loadCareer();
  const league = career.schedule.filter((m) => m.round === 'league');
  assert.equal(league.length, 8, '當季 8 場 league');
  assert.equal(career.results.length, 0, '該年開局零戰績');
  // 真實推進的副產物：大一大二摘要已封存（治具走正式鏈的證據之一）——
  // 直讀 storage 硬斷言，不許靜默跳過
  const seasons = JSON.parse(storage.getItem(SAVE_KEY)).career.seasons ?? [];
  assert.ok(seasons.some((s) => s.index === 4) && seasons.some((s) => s.index === 5),
    '大一(4)大二(5)摘要要在封存裡');
});

test('B2-1b 年=1：升學完成、停大一開局（不推進）', () => {
  const { store } = seededStore();
  assert.equal(advanceToUniYear(store, { schoolId: 'meixi', year: 1 }), true);
  assert.equal(store.seasonIndex(), 4, '大一＝全域第 4 屆');
  assert.equal(store.loadCareer().results.length, 0);
});

test('B2-4 決定論：同參數兩次執行，最終存檔逐值相同', () => {
  const a = seededStore(); advanceToUniYear(a.store, { schoolId: 'haiyan', year: 4 });
  const b = seededStore(); advanceToUniYear(b.store, { schoolId: 'haiyan', year: 4 });
  assert.equal(a.storage.getItem(SAVE_KEY), b.storage.getItem(SAVE_KEY));
});

test('B2-1c 跳到大四＝最後一年開局（年限內可打、不再有下一年）', () => {
  const { store } = seededStore();
  assert.equal(advanceToUniYear(store, { schoolId: 'meixi', year: 4 }), true);
  assert.equal(chapterSeasonOf(store.loadChapter(), store.seasonIndex()), 4);
  assert.equal(store.loadCareer().results.length, 0, '大四開局零戰績');
});
