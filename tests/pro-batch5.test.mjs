// 職業章批 5「敘事層」— 純函式層（2026-08-26）
// 驗收＝docs/kickoffs/acceptance-pro-batch5.md（G1/G2/G3）。範本＝tests/corporate.test.mjs
// 的 A4-3/A4-4（corpAnchorPreEvents／corpClosingLines）——同構寫法，只換職業章的資料表。
//
// ★ 改前紅 ★ src/career/proEvents.js 是本批新增檔案，worktree HEAD=7f62cc6（批 4c 收版）
// 完全不存在這支模組——import 本身就會炸檔（module not found），這正是「這個功能在
// 批 5 之前不存在」的行為級證明本身，不是旁枝雜訊：不像 pro-batch4c 那種「既有檔案缺
// 新具名匯出」需要 namespace import 迂迴，這裡沒有既有檔案可以迂迴，import 失敗＝紅。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareer } from '../src/career/careerState.js';
import { PRO_TEAMS } from '../src/career/proTeams.js';
import {
  PRO_CONTRACT_LINES, proWangRivalPreEvents, proClosingLines,
  PRO_WANG_RIVAL_EV, PRO_WANG_TEAMMATE_EV, WANG_PRO_TEAM_EXISTS,
} from '../src/career/proEvents.js';

test('G1 PRO_CONTRACT_LINES：非空、每句都是非空字串（合約卡 dialogPlay 不能餵空白泡泡）', () => {
  assert.ok(Array.isArray(PRO_CONTRACT_LINES) && PRO_CONTRACT_LINES.length > 0);
  for (const line of PRO_CONTRACT_LINES) {
    assert.equal(typeof line, 'string');
    assert.ok(line.length > 0);
  }
});

test('G2 資料完整性：王勝翔的隊要真的在職業八隊表裡', () => {
  assert.ok(WANG_PRO_TEAM_EXISTS);
  const titans = PRO_TEAMS.find((t) => t.id === 'cangyu-titans');
  assert.ok(titans);
  assert.equal(titans.ace?.name, '王勝翔');
});

test('G2 proWangRivalPreEvents：敵隊變體——循環賽首次對戰蒼羽泰坦才回台詞', () => {
  const base = createCareer({ seed: 7, playerName: '小夢' });
  const entry = { id: 'pro-r3', round: 'pro', opponentId: 'cangyu-titans' };
  const evs = proWangRivalPreEvents(base, entry, 'tiegu-warlords');
  assert.equal(evs.length, 1);
  assert.equal(evs[0].id, PRO_WANG_RIVAL_EV);
  // dialogPlay 契約：每句都要是 {speaker, text} 物件（批 4 出廠 bug 教訓）
  assert.ok(evs[0].lines.every((l) => typeof l.text === 'string' && typeof l.speaker === 'string'));
  assert.ok(evs[0].lines.some((l) => l.speaker === '王勝翔' || l.text.includes('王勝翔')));
  assert.ok(evs[0].lines.some((l) => l.text.includes('四年')), '資歷差四年要有錨');
  assert.ok(evs[0].lines.some((l) => l.text.includes('企業聯賽')), '高中伏筆收束要有錨');
});

test('G2 proWangRivalPreEvents：敵隊變體一生一次（播過不重播）', () => {
  const base = createCareer({ seed: 7, playerName: '小夢' });
  const entry = { id: 'pro-r3', round: 'pro', opponentId: 'cangyu-titans' };
  const played = { ...base, events: [PRO_WANG_RIVAL_EV] };
  assert.deepEqual(proWangRivalPreEvents(played, entry, 'tiegu-warlords'), []);
});

test('G2 proWangRivalPreEvents：敵隊變體守衛——非蒼羽泰坦對手／非 pro round 皆不播', () => {
  const base = createCareer({ seed: 7, playerName: '小夢' });
  const entry = { id: 'pro-r3', round: 'pro', opponentId: 'cangyu-titans' };
  assert.deepEqual(
    proWangRivalPreEvents(base, { ...entry, opponentId: 'tiegu-warlords' }, 'moye-outlaws'),
    [],
    '對手不是蒼羽泰坦不播',
  );
  assert.deepEqual(
    proWangRivalPreEvents(base, { ...entry, round: 'corp' }, 'moye-outlaws'),
    [],
    'round 守衛：不是職業賽程不播（企業章存檔零誤觸發）',
  );
  assert.deepEqual(
    proWangRivalPreEvents(base, { ...entry, round: 'semi' }, 'moye-outlaws'),
    [],
    'round 守衛：季後賽（semi/final）也不是 pro，不播',
  );
});

test('G2 proWangRivalPreEvents：同隊變體——簽蒼羽泰坦時第一場賽前回隊內首見台詞', () => {
  const base = createCareer({ seed: 7, playerName: '小夢' });
  const entry = { id: 'pro-r1', round: 'pro', opponentId: 'tiegu-warlords' };
  const evs = proWangRivalPreEvents(base, entry, 'cangyu-titans');
  assert.equal(evs.length, 1);
  assert.equal(evs[0].id, PRO_WANG_TEAMMATE_EV);
  assert.ok(evs[0].lines.every((l) => typeof l.text === 'string' && typeof l.speaker === 'string'));
  assert.ok(evs[0].lines.some((l) => l.speaker === '王勝翔'));
  assert.ok(!evs[0].lines.some((l) => l.text.includes('對面')), '同隊變體不得播對戰版措辭');
});

test('G2 proWangRivalPreEvents：同隊變體一生一次、只在第一場賽前觸發（不看對手是誰）', () => {
  const base = createCareer({ seed: 7, playerName: '小夢' });
  const first = { id: 'pro-r1', round: 'pro', opponentId: 'tiegu-warlords' };
  const played = { ...base, events: [PRO_WANG_TEAMMATE_EV] };
  assert.deepEqual(proWangRivalPreEvents(played, first, 'cangyu-titans'), [], '播過＝一生一次');
  const second = { id: 'pro-r2', round: 'pro', opponentId: 'moye-outlaws' };
  assert.deepEqual(proWangRivalPreEvents(base, second, 'cangyu-titans'), [],
    '不是第一場賽前不播（只在球員視角第一場觸發，不需要每場重覆判斷）');
});

test('G2 兩情境互斥：同一次呼叫的 teamId 只會走其中一支分支，不會兩者皆播', () => {
  const base = createCareer({ seed: 7, playerName: '小夢' });
  const rivalEntry = { id: 'pro-r1', round: 'pro', opponentId: 'cangyu-titans' };
  // 若玩家隊 id 就是蒼羽泰坦，opponentId 結構上不可能同時是蒼羽泰坦（賽程排除自己）；
  // 這裡直接驗證：teamId==='cangyu-titans' 時走隊內分支（忽略 opponentId），
  // 不會被誤判成敵隊分支（回傳的 id 必須是 TEAMMATE 不是 RIVAL）
  const evs = proWangRivalPreEvents(base, rivalEntry, 'cangyu-titans');
  assert.equal(evs[0]?.id, PRO_WANG_TEAMMATE_EV);
});

test('G3 proClosingLines：海外恆點名、簡子嵐條件句（同構企業章 A4-4 判準）', () => {
  const none = proClosingLines(null);
  assert.equal(none.length, 1);
  assert.ok(none[0].includes('海') || none[0].includes('海外'), '國外強權點名（海外語意）');
  const withJian = proClosingLines({ members: [{ fullName: '簡子嵐' }] });
  assert.equal(withJian.length, 2);
  assert.ok(withJian[1].includes('簡子嵐'));
  assert.equal(proClosingLines({ members: [{ fullName: '別人' }] }).length, 1, '未同隊零可見');
  assert.equal(proClosingLines(undefined).length, 1, '呼叫端沒給 uniRoster 不炸');
});
