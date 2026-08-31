// 大作感四卷 批2（J5）：播報員開場白——純函式層測試（決定論句池抽選）。
// 驗收凍結：docs/kickoffs/juice4-kickoff-20260831.md「J5 播報員開場白」①
// 「句池抽選純函式測試：同 seed 同句、變數正確代入」。
import test from 'node:test';
import assert from 'node:assert/strict';

import { pickAnnouncerLine } from '../src/ui/lineupAnnouncer.js';

test('J5① 同 seed 同 vars → 逐字同句（決定論，非 Math.random）', () => {
  const vars = { opp: '鐵谷戰狼', wins: 4, losses: 2 };
  const a = pickAnnouncerLine(12345, vars);
  const b = pickAnnouncerLine(12345, vars);
  assert.equal(a, b);
});

test('J5① 變數正確代入：對手名與戰績逐字出現在輸出句中', () => {
  const vars = { opp: '朝曦海洋', wins: 7, losses: 1 };
  const line = pickAnnouncerLine(999, vars);
  assert.match(line, /朝曦海洋/, '對手名要代入');
  assert.match(line, /7 勝 1 敗/, '戰績要代入（勝負皆正確數字）');
  assert.doesNotMatch(line, /\{.*\}/, '不得殘留未代入的佔位符');
});

test('J5① 不同 vars（戰績變化）反映在輸出上——不是寫死字串', () => {
  const oppSame = '鐵谷戰狼';
  const line1 = pickAnnouncerLine(1, { opp: oppSame, wins: 1, losses: 0 });
  const line2 = pickAnnouncerLine(1, { opp: oppSame, wins: 9, losses: 3 });
  assert.notEqual(line1, line2, '同一句模板下戰績數字不同，輸出必須跟著變');
  assert.match(line1, /1 勝 0 敗/);
  assert.match(line2, /9 勝 3 敗/);
});

test('J5① 句池確實有一種以上（不同 seed 能選到不同模板，非固定死一句）', () => {
  const vars = { opp: '對手', wins: 0, losses: 0 };
  const lines = new Set();
  for (let seed = 0; seed < 40; seed += 1) lines.add(pickAnnouncerLine(seed, vars));
  assert.ok(lines.size > 1, '多個 seed 應命中不同句子，證明是句池而非單句');
});

test('J5① 缺變數不炸——未提供的 key 代入空字串，不拋錯', () => {
  assert.doesNotThrow(() => pickAnnouncerLine(7, {}));
  const line = pickAnnouncerLine(7, {});
  assert.equal(typeof line, 'string');
});

test('J5① 負數/浮點 seed 也回傳穩定字串（matchSeed 產出恆為正整數，但函式本身要耐受）', () => {
  const vars = { opp: '對手', wins: 0, losses: 0 };
  assert.doesNotThrow(() => pickAnnouncerLine(-5, vars));
  const a = pickAnnouncerLine(-5, vars);
  const b = pickAnnouncerLine(-5, vars);
  assert.equal(a, b);
});
