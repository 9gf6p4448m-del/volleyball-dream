// 多年職業生涯卷 批 4A「宿敵敘事兩題」（2026-08-27）
// 驗收＝docs/kickoffs/acceptance-multiyear-batch4a.md（E1–E4，動手前凍結 4dcb3ad）。
// 純函式測試：proWangRivalPreEvents 直呼（消費端接線由既有 G2 wiring 測試護著）。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  proWangRivalPreEvents, PRO_WANG_RIVAL_EV, PRO_WANG_TEAMMATE_EV,
} from '../src/career/proEvents.js';

const CANGYU = 'cangyu-titans';
const vsCangyu = { id: 'pro-r3', round: 'pro', opponentId: CANGYU };
const textOf = (evs) => evs.flatMap((e) => e.lines.map((l) => l.text)).join('｜');

test('E1 前隊友（曾同隊、RIVAL 未播）：對上蒼羽＝重逢組，不含「慢了四年」語意；id 記帳不變', () => {
  const evs = proWangRivalPreEvents(
    { events: [PRO_WANG_TEAMMATE_EV] }, vsCangyu, 'moye-outlaws', 10,
  );
  assert.equal(evs.length, 1);
  assert.equal(evs[0].id, PRO_WANG_RIVAL_EV, '一生一次記帳沿用同一旗標');
  const text = textOf(evs);
  assert.match(text, /前隊友/, '重逢組');
  assert.ok(!/慢了四年/.test(text), '前隊友不得聽到「慢了四年」');
  for (const l of evs[0].lines) {
    assert.equal(typeof l.text, 'string', 'line 契約＝{speaker,text} 物件（探針卷教訓）');
    assert.equal(typeof l.speaker, 'string');
  }
});

test('E1 未曾同隊：原敵隊組逐字照舊（含「慢了四年"）', () => {
  const evs = proWangRivalPreEvents({ events: [] }, vsCangyu, 'moye-outlaws', 10);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].id, PRO_WANG_RIVAL_EV);
  assert.match(textOf(evs), /你比我慢了四年/, '原句照舊');
});

test('E2 年度重逢句：大事件已播→每季首次一句；同季再遇空；跨季再播【壞版自證條】', () => {
  const base = { events: [PRO_WANG_RIVAL_EV] };
  const y2 = proWangRivalPreEvents(base, vsCangyu, 'moye-outlaws', 11);
  assert.equal(y2.length, 1, '大事件已播後每季首次要有年度句（無實作＝這裡紅）');
  assert.equal(y2[0].id, 'pro-wang-annual-11', '旗標含季號');
  assert.equal(y2[0].lines.length, 1, '輕量＝單句');
  // 同季已播（季後賽再遇）＝空
  const again = proWangRivalPreEvents(
    { events: [PRO_WANG_RIVAL_EV, 'pro-wang-annual-11'] }, vsCangyu, 'moye-outlaws', 11,
  );
  assert.deepEqual(again, [], '同季不重複');
  // 下一季（季號 12）＝再播
  const y3 = proWangRivalPreEvents(
    { events: [PRO_WANG_RIVAL_EV, 'pro-wang-annual-11'] }, vsCangyu, 'moye-outlaws', 12,
  );
  assert.equal(y3.length, 1, '跨季再播');
  assert.equal(y3[0].id, 'pro-wang-annual-12');
});

test('E2 前隊友線的年度句：TEAMMATE+RIVAL 都播過也照常逐季', () => {
  const evs = proWangRivalPreEvents(
    { events: [PRO_WANG_TEAMMATE_EV, PRO_WANG_RIVAL_EV] }, vsCangyu, 'moye-outlaws', 13,
  );
  assert.equal(evs.length, 1);
  assert.equal(evs[0].id, 'pro-wang-annual-13');
});

test('E3 互斥與邊界：大事件未播不播年度句；非蒼羽/非 pro round/壞季號恆空', () => {
  // 大事件未播＝走大事件分支（回大事件，不是年度句）——同場不疊播
  const first = proWangRivalPreEvents({ events: [] }, vsCangyu, 'moye-outlaws', 11);
  assert.equal(first.length, 1);
  assert.equal(first[0].id, PRO_WANG_RIVAL_EV, '大事件優先，同場不疊年度句');
  // 非蒼羽對手
  assert.deepEqual(proWangRivalPreEvents(
    { events: [PRO_WANG_RIVAL_EV] }, { id: 'pro-r2', round: 'pro', opponentId: 'tiegu-warlords' },
    'moye-outlaws', 11,
  ), []);
  // 非 pro round
  assert.deepEqual(proWangRivalPreEvents(
    { events: [PRO_WANG_RIVAL_EV] }, { id: 'corp-r1', round: 'corp', opponentId: CANGYU },
    'moye-outlaws', 11,
  ), []);
  // 壞季號（0/缺）＝不播年度句（保守）
  assert.deepEqual(proWangRivalPreEvents(
    { events: [PRO_WANG_RIVAL_EV] }, vsCangyu, 'moye-outlaws', 0,
  ), []);
  assert.deepEqual(proWangRivalPreEvents(
    { events: [PRO_WANG_RIVAL_EV] }, vsCangyu, 'moye-outlaws',
  ), []);
});

test('E3 同隊變體（在蒼羽陣中）行為照舊：pro-r1 首見、一生一次', () => {
  const evs = proWangRivalPreEvents(
    { events: [] }, { id: 'pro-r1', round: 'pro', opponentId: 'tiegu-warlords' }, CANGYU, 10,
  );
  assert.equal(evs.length, 1);
  assert.equal(evs[0].id, PRO_WANG_TEAMMATE_EV);
  const again = proWangRivalPreEvents(
    { events: [PRO_WANG_TEAMMATE_EV] }, { id: 'pro-r1', round: 'pro', opponentId: 'tiegu-warlords' }, CANGYU, 10,
  );
  assert.deepEqual(again, [], '一生一次');
});
