// B-3 身高誠實化 — 教練轉位引導事件測試（docs/kickoffs/height-honesty-case.md §五；
// 2026-07-30 Sawmah 裁定「引導不補償」）
// 驗收：<168 OH 創角＝對話出現一次（跨屆不重播）；≥168 或已轉位＝不出現；
// 門檻常數單一真相——本檔 import HEIGHT_HONESTY_THRESHOLD_CM，不另寫死第二份 168。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  heightGuidanceEventFor, HEIGHT_GUIDANCE_EVENT_ID, HEIGHT_GUIDANCE_LINES, recordEvent,
} from '../src/career/events.js';
import { HEIGHT_HONESTY_THRESHOLD_CM } from '../src/career/heightGrowth.js';
import {
  createCareer, createCareerPlayer, recordResult, advanceSeason,
} from '../src/career/careerState.js';

const playerAt = (cm, currentRole = 'outside') => ({
  currentRole,
  height: { current: cm / 100 },
});

test('身高 < 門檻＋OH 出道＝教練引導對話觸發（台詞 3–5 句、全為教練聲線）', () => {
  const career = createCareer({ seed: 1, playerName: '測' });
  const player = playerAt(HEIGHT_HONESTY_THRESHOLD_CM - 1);
  const ev = heightGuidanceEventFor(career, player);
  assert.ok(ev, '低於門檻的 OH 創角應觸發引導對話');
  assert.equal(ev.id, HEIGHT_GUIDANCE_EVENT_ID);
  assert.deepEqual(ev.lines, HEIGHT_GUIDANCE_LINES);
  assert.ok(ev.lines.length >= 3 && ev.lines.length <= 5, '3–5 句內');
  assert.ok(ev.lines.every((l) => l.speaker === '教練'), '教練口吻');
});

test('身高 = 門檻或以上＝不觸發', () => {
  const career = createCareer({ seed: 1, playerName: '測' });
  assert.equal(heightGuidanceEventFor(career, playerAt(HEIGHT_HONESTY_THRESHOLD_CM)), null);
  assert.equal(heightGuidanceEventFor(career, playerAt(HEIGHT_HONESTY_THRESHOLD_CM + 20)), null);
});

test('已轉位（currentRole ≠ outside）＝即使身高 < 門檻也不觸發', () => {
  const career = createCareer({ seed: 1, playerName: '測' });
  const player = playerAt(HEIGHT_HONESTY_THRESHOLD_CM - 10, 'libero');
  assert.equal(heightGuidanceEventFor(career, player), null);
});

test('播過一次後同生涯不再出現——career.events 入帳即去重', () => {
  let career = createCareer({ seed: 2, playerName: '測' });
  const player = playerAt(150);
  const first = heightGuidanceEventFor(career, player);
  assert.ok(first);
  career = recordEvent(career, first.id);
  assert.equal(heightGuidanceEventFor(career, player), null, '入帳後同一生涯不重播');
});

// B1 同款驗證方式（tests/transfer.test.mjs）：advanceSeason 只濾轉位旗標，
// 其餘劇情事件（含本旗標）跨屆保留——藉此證明「跨屆不重播」。
test('跨屆不重播：advanceSeason 保留旗標，第 2 屆開幕不重播', () => {
  let career = createCareer({ seed: 3, playerName: '測' });
  const player = playerAt(150);
  const ev = heightGuidanceEventFor(career, player);
  career = recordEvent(career, ev.id);
  // 打完一屆（小組全勝＋八強敗＝止步，可進 advanceSeason）
  for (const m of career.schedule) {
    if (m.stage === 'group') {
      career = recordResult(career, { matchId: m.id, won: true, scoreFor: 25, scoreAgainst: 10 });
    }
  }
  const qf = career.schedule.find((m) => m.id === 'national-qf');
  career = recordResult(career, { matchId: qf.id, won: false, scoreFor: 20, scoreAgainst: 25 });
  const next = advanceSeason(career);
  assert.ok((next.events ?? []).includes(HEIGHT_GUIDANCE_EVENT_ID), '非轉位類劇情事件跨屆保留');
  assert.equal(heightGuidanceEventFor(next, player), null, '第 2 屆開幕不重播');
});

test('與 createCareerPlayer 真實建構整合：矮個創角觸發、Phase1 基準身高不觸發', () => {
  const career = createCareer({ seed: 4, playerName: '測' });
  const shortPlayer = createCareerPlayer('測', {
    heightCm: HEIGHT_HONESTY_THRESHOLD_CM - 8, aspiration: 'libero', seed: career.seed,
  });
  assert.ok(heightGuidanceEventFor(career, shortPlayer), '低於門檻 OH 出道應觸發');
  const tallPlayer = createCareerPlayer('測', {
    heightCm: 188, aspiration: 'outside', seed: career.seed,
  });
  assert.equal(heightGuidanceEventFor(career, tallPlayer), null, '188cm 不觸發');
});
