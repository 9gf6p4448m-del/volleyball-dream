// 大學卷 批 3「跳過高中直接測大學」治具（2026-08-14）
// 驗收＝`docs/kickoffs/acceptance-uni-batch3.md`（動手前凍結）。
//
// ★ 這一批最重要的不是功能，是安全 ★ 治具會寫存檔，寫錯槽＝洗掉真人的生涯。
// 兩道守衛（無預設槽／沒帶參數不啟動）各配一條反向對照——否則「沒寫入」可能
// 只是因為測試根本沒觸發到那條路徑（今天已經被這種假通過咬過一次）。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSyntheticSave, devSeedRequest, DEV_SEED_PARAM, DEV_SLOT_PARAM,
} from '../src/career/devSeed.js';
import { FINISH, bestFinishOf, admissionTiersFor } from '../src/career/admission.js';
import { deserializeSave } from '../src/career/schema.js';
import { normalizeChapter, CHAPTER } from '../src/career/chapter.js';

const ALL = [FINISH.CHAMPION, FINISH.RUNNER_UP, FINISH.SEMI, FINISH.QUARTER, FINISH.GROUP];

test('B3-1 產出的是合法存檔（走真實的反序列化路徑，不是「看起來像存檔」）', () => {
  for (const finish of ALL) {
    const save = buildSyntheticSave({ finish });
    const round = deserializeSave(JSON.stringify(save));
    assert.ok(round, `${finish}：反序列化失敗＝治具產的是壞檔`);
  }
});

test('★B3-2 端到端★ 請求什麼成績就讀得回什麼成績，且五級兩兩不同', () => {
  const got = ALL.map((finish) => {
    const save = buildSyntheticSave({ finish });
    return bestFinishOf(save.career, { titles: save.season.titles ?? 0 });
  });
  assert.deepEqual(got, ALL, '讀回來的最佳成績要與請求的一致');
  assert.equal(new Set(got).size, 5, '五級要兩兩不同（不是全部產同一份）');
});

test('★反向對照★ 候選等級也跟著不同（證明治具真的改變了下游結果）', () => {
  const tiers = ALL.map((finish) => {
    const save = buildSyntheticSave({ finish });
    return admissionTiersFor(bestFinishOf(save.career, { titles: save.season.titles ?? 0 })).join(',');
  });
  assert.ok(new Set(tiers).size > 1, '五級的候選等級全一樣＝治具或分發規則有一邊是常數');
});

test('B3-3 章節是「高中已完結、尚未升學」（治具不替你做升學決定）', () => {
  const save = buildSyntheticSave({ finish: FINISH.CHAMPION });
  assert.equal(normalizeChapter(save.career).id, CHAPTER.HIGH_SCHOOL);
  assert.equal(save.season.index, 3, '要停在三屆打完的那一刻');
});

test('認不得的成績回 null（不猜一個給你）', () => {
  assert.equal(buildSyntheticSave({ finish: 'nope' }), null);
  assert.equal(buildSyntheticSave({}), null);
  assert.equal(buildSyntheticSave(), null);
});

// ════════════════════════════════════════════════════════════
// 安全守衛（B3-S1／S2／S3）
// ════════════════════════════════════════════════════════════

const params = (obj) => new URLSearchParams(obj);

test('★B3-S1 無預設槽★ 缺槽／槽不合法 ⇒ 不啟動', () => {
  assert.equal(devSeedRequest(params({ [DEV_SEED_PARAM]: FINISH.CHAMPION })), null,
    '★核心★ 沒給槽卻預設寫槽 1＝一個手滑的網址就洗掉玩家的存檔');
  for (const bad of ['0', '4', '-1', 'abc', '']) {
    assert.equal(devSeedRequest(params({
      [DEV_SEED_PARAM]: FINISH.CHAMPION, [DEV_SLOT_PARAM]: bad,
    })), null, `槽=${bad} 應該不啟動`);
  }
});

test('★B3-S2 沒帶治具參數 ⇒ 不啟動', () => {
  assert.equal(devSeedRequest(params({})), null);
  assert.equal(devSeedRequest(params({ [DEV_SLOT_PARAM]: '2' })), null, '只給槽不給成績也不啟動');
  assert.equal(devSeedRequest(params({ [DEV_SEED_PARAM]: 'nope', [DEV_SLOT_PARAM]: '2' })), null);
  assert.equal(devSeedRequest(null), null);
});

test('★B3-S3 反向對照★ 兩個參數都合法時**確實**會啟動（證明守衛不是恆假）', () => {
  const req = devSeedRequest(params({
    [DEV_SEED_PARAM]: FINISH.SEMI, [DEV_SLOT_PARAM]: '3',
  }));
  assert.deepEqual(req, { finish: FINISH.SEMI, slot: 3 },
    '★這條沒有的話★ 一支「永遠回 null」的假實作會讓上面兩條全綠');
});

test('三個槽都帶得動（1–3），不是只有某一個能用', () => {
  for (const slot of [1, 2, 3]) {
    assert.equal(devSeedRequest(params({
      [DEV_SEED_PARAM]: FINISH.GROUP, [DEV_SLOT_PARAM]: String(slot),
    })).slot, slot);
  }
});
