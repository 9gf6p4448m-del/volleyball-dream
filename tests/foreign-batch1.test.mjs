// 國外聯賽卷 批 1「純資料層」（2026-08-27）
// 驗收＝`docs/kickoffs/acceptance-foreign-batch1.md`（F1-1～F1-11，動手前凍結）。
// 卷宗＝`docs/kickoffs/foreign-league-kickoff.md`。
//
// ════════════════════════════════════════════════════════════════
// F1-5：國內薪水逐值不變——「改動前實算值」取得方法（實跑紀錄，不得事後生成）
// ════════════════════════════════════════════════════════════════
// 2026-08-27（動手改 proTeams.js 之前）用一次性治具
// `scratchpad/dump-domestic-salary.mjs`（node --experimental-vm-modules 非必要，純
// ESM import）跑：
//   for (const t of PRO_TEAMS) { proBaseSalaryFor(t); for r in 1..8 for f in
//   [champion, final, semi, league]: proRenewalSalaryFor(t, r, f); }
// 輸出貼進下面 `DOMESTIC_SALARY_BEFORE`（未經任何手動修改）。本檔案之後才動手改
// `proTeams.js`（併 BY_ID＋薪水分派）——這份數字是分派邏輯出現**之前**的行為快照。
//
// ════════════════════════════════════════════════════════════════
// F1-11：突變紀錄（實際做過，非預測）
// ════════════════════════════════════════════════════════════════
// ① F1-4（proTeams.js 薪水分派）：實際刪掉 `proBaseSalaryFor` 開頭的
//    `if (team?.league === 'foreign') return foreignBaseSalaryFor(team);` 那一行，
//    單跑 `node --test tests/foreign-batch1.test.mjs` → 恰 1 條紅：
//    `F1-4 proBaseSalaryFor(海外隊)＝海外底薪表值`，實際輸出
//    `AssertionError: aurora-orion 底薪要吃海外表 / 600 !== 1900`——海外隊 tier
//    仍是 TIER.POWERHOUSE，被國內 `PRO_BASE_SALARY[TIER.POWERHOUSE]`（600）接住，
//    不是落到 WEAK（280）。其餘 22 條（含 F1-5 國內矩陣）維持綠。已還原該行，
//    還原後單跑同檔 23 條全綠。
// ② F1-10（proSchedule.js 對稱守衛）：實際刪掉 `buildProSchedule` 內
//    `if (!mine.length) return [];` 那一行（含上一行註解），單跑同檔 → 恰 1 條紅：
//    `F1-10 buildProSchedule({teamId:海外id}) 回 []（不 throw）`，實際擲出
//    `TypeError: Reduce of empty array with no initial value`（proSchedule.js:98
//    壓軸重排那行 `.reduce((best, x) => ...)` 對空陣列 `mine` 求值）。F1-10b/F1-10c
//    （proTable 那道獨立守衛）不受影響、維持綠。已還原該行，還原後單跑同檔 23 條全綠。
// 兩次實測皆由主對話手動刪除／還原＋單跑 `node --test tests/foreign-batch1.test.mjs`
// 完成（2026-08-27），過程未落檔存證（比照 pro-batch1.test.mjs 慣例，本檔開頭記錄取代
// worktree）。
// ★ 覆審 LOW 補測（2026-08-27 主對話實測）★ 突變③：proSchedule.js proTable 守衛
// 砍半（`me.league === 'foreign'` 半句移除）→ 恰 1 紅：F1-10b（22 pass/1 fail），
// 還原後 23 全綠——F1-10b 對該守衛本身有鑑別力，非僅不受其他突變干擾。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FOREIGN_LEAGUE_NAME, FOREIGN_TEAMS, FOREIGN_TIER_LABEL, TWD_PER_USD, usdOf,
  foreignBaseSalaryFor, foreignRenewalSalaryFor, foreignTeamById, isForeignTeamId,
} from '../src/career/foreignTeams.js';
import { buildForeignMembers, FOREIGN_TEAMMATE_CAP } from '../src/career/foreignTeam.js';
import {
  foreignRounds, buildForeignSchedule, foreignTable, foreignPointsFor, FOREIGN_PLAYER_ID,
  growForeignSchedule, FOREIGN_PLAYOFF_MATCH_IDS,
} from '../src/career/foreignSchedule.js';
import {
  PRO_TEAMS, proTeamById, proBaseSalaryFor, proRenewalSalaryFor,
} from '../src/career/proTeams.js';
import { buildProMembers } from '../src/career/proTeam.js';
import { buildProSchedule, proTable, PLAYOFF_ROUND } from '../src/career/proSchedule.js';
import { ATTRIBUTE_KEYS } from '../src/sim/player.js';
import { TIER } from '../src/career/admission.js';
import { OPPONENTS } from '../src/career/opponents.js';
import { UNIVERSITIES } from '../src/career/universities.js';
import { CORPORATIONS } from '../src/career/corporations.js';

// ════════════════════════════════════════════════════════════════
// F1-5 fixture：改動前實算值（見檔頭取得方法）
// ════════════════════════════════════════════════════════════════
const DOMESTIC_SALARY_BEFORE = {
  'cangyu-titans': { base: 600, renewal: {
    1: { champion: 897, final: 819, semi: 780, league: 780 },
    2: { champion: 828, final: 756, semi: 720, league: 720 },
    3: { champion: 759, final: 693, semi: 660, league: 660 },
    4: { champion: 759, final: 693, semi: 660, league: 660 },
    5: { champion: 690, final: 630, semi: 600, league: 600 },
    6: { champion: 690, final: 630, semi: 600, league: 600 },
    7: { champion: 621, final: 567, semi: 540, league: 540 },
    8: { champion: 621, final: 567, semi: 540, league: 540 },
  } },
  'tiegu-warlords': { base: 600, renewal: {
    1: { champion: 897, final: 819, semi: 780, league: 780 },
    2: { champion: 828, final: 756, semi: 720, league: 720 },
    3: { champion: 759, final: 693, semi: 660, league: 660 },
    4: { champion: 759, final: 693, semi: 660, league: 660 },
    5: { champion: 690, final: 630, semi: 600, league: 600 },
    6: { champion: 690, final: 630, semi: 600, league: 600 },
    7: { champion: 621, final: 567, semi: 540, league: 540 },
    8: { champion: 621, final: 567, semi: 540, league: 540 },
  } },
  'feiyan-swift': { base: 420, renewal: {
    1: { champion: 628, final: 573, semi: 546, league: 546 },
    2: { champion: 580, final: 529, semi: 504, league: 504 },
    3: { champion: 531, final: 485, semi: 462, league: 462 },
    4: { champion: 531, final: 485, semi: 462, league: 462 },
    5: { champion: 483, final: 441, semi: 420, league: 420 },
    6: { champion: 483, final: 441, semi: 420, league: 420 },
    7: { champion: 435, final: 397, semi: 378, league: 378 },
    8: { champion: 435, final: 397, semi: 378, league: 378 },
  } },
  'haoyue-current': { base: 420, renewal: {
    1: { champion: 628, final: 573, semi: 546, league: 546 },
    2: { champion: 580, final: 529, semi: 504, league: 504 },
    3: { champion: 531, final: 485, semi: 462, league: 462 },
    4: { champion: 531, final: 485, semi: 462, league: 462 },
    5: { champion: 483, final: 441, semi: 420, league: 420 },
    6: { champion: 483, final: 441, semi: 420, league: 420 },
    7: { champion: 435, final: 397, semi: 378, league: 378 },
    8: { champion: 435, final: 397, semi: 378, league: 378 },
  } },
  'qingshuang-sentinel': { base: 420, renewal: {
    1: { champion: 628, final: 573, semi: 546, league: 546 },
    2: { champion: 580, final: 529, semi: 504, league: 504 },
    3: { champion: 531, final: 485, semi: 462, league: 462 },
    4: { champion: 531, final: 485, semi: 462, league: 462 },
    5: { champion: 483, final: 441, semi: 420, league: 420 },
    6: { champion: 483, final: 441, semi: 420, league: 420 },
    7: { champion: 435, final: 397, semi: 378, league: 378 },
    8: { champion: 435, final: 397, semi: 378, league: 378 },
  } },
  'yingfeng-rangers': { base: 280, renewal: {
    1: { champion: 419, final: 382, semi: 364, league: 364 },
    2: { champion: 386, final: 353, semi: 336, league: 336 },
    3: { champion: 354, final: 323, semi: 308, league: 308 },
    4: { champion: 354, final: 323, semi: 308, league: 308 },
    5: { champion: 322, final: 294, semi: 280, league: 280 },
    6: { champion: 322, final: 294, semi: 280, league: 280 },
    7: { champion: 290, final: 265, semi: 252, league: 252 },
    8: { champion: 290, final: 265, semi: 252, league: 252 },
  } },
  'chunyang-newstars': { base: 280, renewal: {
    1: { champion: 419, final: 382, semi: 364, league: 364 },
    2: { champion: 386, final: 353, semi: 336, league: 336 },
    3: { champion: 354, final: 323, semi: 308, league: 308 },
    4: { champion: 354, final: 323, semi: 308, league: 308 },
    5: { champion: 322, final: 294, semi: 280, league: 280 },
    6: { champion: 322, final: 294, semi: 280, league: 280 },
    7: { champion: 290, final: 265, semi: 252, league: 252 },
    8: { champion: 290, final: 265, semi: 252, league: 252 },
  } },
  'moye-outlaws': { base: 280, renewal: {
    1: { champion: 419, final: 382, semi: 364, league: 364 },
    2: { champion: 386, final: 353, semi: 336, league: 336 },
    3: { champion: 354, final: 323, semi: 308, league: 308 },
    4: { champion: 354, final: 323, semi: 308, league: 308 },
    5: { champion: 322, final: 294, semi: 280, league: 280 },
    6: { champion: 322, final: 294, semi: 280, league: 280 },
    7: { champion: 290, final: 265, semi: 252, league: 252 },
    8: { champion: 290, final: 265, semi: 252, league: 252 },
  } },
};

// ════════════════════════════════════════════════════════════════
// F1-2：四隊、欄位鍵集合、id 全域唯一
// ════════════════════════════════════════════════════════════════
test('F1-2 FOREIGN_TEAMS 恰 4 隊，欄位鍵集合＝PRO_TEAMS 鍵集合 ∪ {league}', () => {
  assert.equal(FOREIGN_TEAMS.length, 4);
  const proKeys = new Set(Object.keys(PRO_TEAMS[0]).sort());
  const expectedForeignKeys = new Set([...proKeys, 'league']);
  for (const t of FOREIGN_TEAMS) {
    const keys = new Set(Object.keys(t));
    assert.deepEqual(keys, expectedForeignKeys, `${t.id} 欄位鍵集合要＝PRO_TEAMS 鍵集合 ∪ {league}`);
    assert.equal(t.league, 'foreign', `${t.id} league 要是 'foreign'`);
    assert.ok([TIER.POWERHOUSE, TIER.MID].includes(t.tier), `${t.id} tier 只能是 POWERHOUSE 或 MID`);
    assert.equal(t.heights.length, 6);
    assert.equal(t.squad.length, 6);
    assert.equal(t.grades.length, 6);
    assert.equal(t.squad[t.ace.slot], t.ace.name, `${t.id} ace.slot 要指到本人`);
  }
});

test('F1-2b id 在五張表全域唯一', () => {
  const all = [
    ...OPPONENTS.map((t) => t.id),
    ...UNIVERSITIES.map((t) => t.id),
    ...CORPORATIONS.map((t) => t.id),
    ...PRO_TEAMS.map((t) => t.id),
    ...FOREIGN_TEAMS.map((t) => t.id),
  ];
  assert.equal(new Set(all).size, all.length, '五張表的 id 不得互撞');
});

test('F1-2c FOREIGN_LEAGUE_NAME／FOREIGN_TIER_LABEL／usdOf 基本形狀', () => {
  assert.equal(FOREIGN_LEAGUE_NAME, '寰宇超級聯賽');
  assert.equal(FOREIGN_TIER_LABEL[TIER.POWERHOUSE], '霸主');
  assert.equal(FOREIGN_TIER_LABEL[TIER.MID], '列強');
  assert.equal(TWD_PER_USD, 31);
  assert.equal(usdOf(1900), 61.3, '1900 萬台幣 ÷ 31 ≈ 61.3 萬美金');
  assert.equal(usdOf(0), 0);
});

// ════════════════════════════════════════════════════════════════
// F1-3：併表後查表行為
// ════════════════════════════════════════════════════════════════
test('F1-3 proTeamById：海外 id 回海外定義、國內 id 回國內定義；PRO_TEAMS 仍恰 8 隊', () => {
  assert.equal(PRO_TEAMS.length, 8, '陣列消費點不受併表影響');
  for (const t of FOREIGN_TEAMS) {
    assert.equal(proTeamById(t.id), t, `${t.id} 併表後要查得到海外定義本身`);
  }
  for (const t of PRO_TEAMS) {
    assert.equal(proTeamById(t.id), t, `${t.id} 國內查表要維持原定義`);
  }
  assert.equal(proTeamById('不存在'), null);
});

test('F1-3b foreignTeamById／isForeignTeamId：只認 FOREIGN_TEAMS，不靠 league 欄位', () => {
  for (const t of FOREIGN_TEAMS) {
    assert.equal(foreignTeamById(t.id), t);
    assert.equal(isForeignTeamId(t.id), true);
  }
  for (const t of PRO_TEAMS) {
    assert.equal(foreignTeamById(t.id), null, `國內 id ${t.id} 不得被海外表認出`);
    assert.equal(isForeignTeamId(t.id), false);
  }
  assert.equal(foreignTeamById('不存在'), null);
});

// ════════════════════════════════════════════════════════════════
// F1-4：薪水分派
// ════════════════════════════════════════════════════════════════
test('F1-4 proBaseSalaryFor(海外隊)＝海外底薪表值', () => {
  for (const t of FOREIGN_TEAMS) {
    const expected = t.tier === TIER.POWERHOUSE ? 1900 : 1300;
    assert.equal(proBaseSalaryFor(t), expected, `${t.id} 底薪要吃海外表`);
    assert.equal(proBaseSalaryFor(t), foreignBaseSalaryFor(t), '分派要與海外檔本體一致');
  }
});

test('F1-4b proRenewalSalaryFor(海外隊, r, finish)：對 r 單調不增、champion＞final、恆正整數', () => {
  const finishes = ['champion', 'final', 'semi', 'league'];
  for (const t of FOREIGN_TEAMS) {
    for (const f of finishes) {
      let prev = Infinity;
      for (let r = 1; r <= 4; r += 1) {
        const v = proRenewalSalaryFor(t, r, f);
        assert.ok(Number.isInteger(v) && v > 0, `${t.id} r${r}/${f} 要恆正整數，收到 ${v}`);
        assert.ok(v <= prev, `${t.id} r${r}/${f} 對名次要單調不增`);
        prev = v;
      }
    }
    for (let r = 1; r <= 4; r += 1) {
      const champ = proRenewalSalaryFor(t, r, 'champion');
      const final = proRenewalSalaryFor(t, r, 'final');
      assert.ok(champ > final, `${t.id} r${r} champion 係數要＞final`);
    }
    assert.equal(proRenewalSalaryFor(t, 1, 'champion'), foreignRenewalSalaryFor(t, 1, 'champion'));
  }
});

test('F1-4c 原型鏈鍵防線：finish 用 constructor 之類的鍵不得誤取到函式', () => {
  const t = FOREIGN_TEAMS[0];
  const v = proRenewalSalaryFor(t, 1, 'constructor');
  assert.ok(Number.isInteger(v) && v > 0, '原型鏈鍵要落回 1.0 係數，不得產生 NaN');
});

// ════════════════════════════════════════════════════════════════
// F1-5：國內薪水逐值不變
// ════════════════════════════════════════════════════════════════
test('F1-5 國內 8 隊底薪＋續約矩陣與改動前實算值全等', () => {
  const finishes = ['champion', 'final', 'semi', 'league'];
  for (const t of PRO_TEAMS) {
    const before = DOMESTIC_SALARY_BEFORE[t.id];
    assert.ok(before, `${t.id} 要有改動前快照`);
    assert.equal(proBaseSalaryFor(t), before.base, `${t.id} 底薪要逐值不變`);
    for (let r = 1; r <= 8; r += 1) {
      for (const f of finishes) {
        assert.equal(
          proRenewalSalaryFor(t, r, f), before.renewal[r][f],
          `${t.id} r${r}/${f} 續約薪水要逐值不變`,
        );
      }
    }
  }
});

// ════════════════════════════════════════════════════════════════
// F1-9：建隊
// ════════════════════════════════════════════════════════════════
const shapeOf = (m) => [...Object.keys(m)].filter((k) => k !== 'title').sort().join(',');

test('F1-9 buildForeignMembers：7 人、欄位鍵集合同 buildProMembers、attrs 落 [30,90]、決定論', () => {
  const proShape = buildProMembers(PRO_TEAMS[0].id).map(shapeOf);
  for (const t of FOREIGN_TEAMS) {
    const members = buildForeignMembers(t.id);
    assert.equal(members.length, 7, `${t.id}：6 先發＋自由人`);
    members.forEach((m, i) => {
      assert.equal(shapeOf(m), proShape[i], `${t.id} 第 ${i} 位欄位鍵集合要同職業版`);
      for (const k of ATTRIBUTE_KEYS) {
        assert.ok(m.attributes[k] >= 30 && m.attributes[k] <= FOREIGN_TEAMMATE_CAP,
          `${t.id} 第 ${i} 位 ${k} 要落在 [30,${FOREIGN_TEAMMATE_CAP}]，收到 ${m.attributes[k]}`);
      }
      assert.ok(m.origin.startsWith('foreign:'), `${t.id} 第 ${i} 位 origin 要標 foreign: 前綴`);
    });
    members.slice(0, 6).forEach((m, i) => {
      assert.equal(m.height, t.heights[i], `${t.id} 身高要帶表值`);
      assert.equal(m.fullName, t.squad[i]);
    });
    assert.deepEqual(buildForeignMembers(t.id), members, `${t.id} 決定論`);
  }
  assert.deepEqual(buildForeignMembers('不存在'), []);
  assert.deepEqual(buildForeignMembers('cangyu-titans'), [], '國內 id 對海外建隊要回空（表不認得）');
});

// ════════════════════════════════════════════════════════════════
// F1-6：賽程（雙循環）
// ════════════════════════════════════════════════════════════════
test('F1-6 buildForeignSchedule：恰 6 場、其餘 3 隊各恰 2 次、round/id/format、玩家不對自己、決定論', () => {
  for (const t of FOREIGN_TEAMS) {
    const sched = buildForeignSchedule({ teamId: t.id, seed: 11 });
    assert.equal(sched.length, 6, `${t.id} 雙循環＝6 場`);
    const opponentCounts = new Map();
    for (const m of sched) {
      opponentCounts.set(m.opponentId, (opponentCounts.get(m.opponentId) ?? 0) + 1);
      assert.equal(m.round, 'foreign');
      assert.equal(m.stage, 'foreign');
      assert.equal(m.format, 3);
      assert.notEqual(m.opponentId, t.id, `${t.id} 不得排到自己`);
    }
    assert.equal(opponentCounts.size, 3, `${t.id} 對手恰其餘 3 隊`);
    for (const [, n] of opponentCounts) assert.equal(n, 2, '每個對手恰打兩次（雙循環）');
    assert.deepEqual(sched.map((m) => m.id), ['foreign-r1', 'foreign-r2', 'foreign-r3', 'foreign-r4', 'foreign-r5', 'foreign-r6']);
  }
  assert.deepEqual(
    buildForeignSchedule({ teamId: 'aurora-orion', seed: 11 }),
    buildForeignSchedule({ teamId: 'aurora-orion', seed: 11 }),
    '同 seed 同賽程',
  );
  assert.deepEqual(buildForeignSchedule({ teamId: '不存在', seed: 1 }), []);
  assert.deepEqual(buildForeignSchedule({ teamId: 'cangyu-titans', seed: 1 }), [], '國內 id 進海外賽程要回空');
});

test('F1-6b foreignRounds：6 輪（雙循環）、每輪恰 2 場、每隊每輪都出賽；下半循環與上半同一批對戰組', () => {
  const rounds = foreignRounds(5);
  assert.equal(rounds.length, 6);
  for (const pairs of rounds) {
    assert.equal(pairs.length, 2, '四隊偶數＝每輪恰 2 場、無輪空');
    const seen = new Set(pairs.flat());
    assert.equal(seen.size, 4, '每隊每輪都要出賽一次');
  }
  assert.deepEqual(rounds[3], rounds[0], '下半循環第 1 輪對戰組＝上半循環第 1 輪（同一批 pairs，靠 roundNo 天然分岔結果）');
  assert.deepEqual(rounds[4], rounds[1]);
  assert.deepEqual(rounds[5], rounds[2]);
});

test('F1-6c 勝點制沿用同一份事實來源（uniPointsFor）', () => {
  assert.equal(foreignPointsFor(2, 0), 3);
  assert.equal(foreignPointsFor(2, 1), 2);
  assert.equal(foreignPointsFor(1, 2), 1);
  assert.equal(foreignPointsFor(0, 2), 0);
});

// ════════════════════════════════════════════════════════════════
// F1-7：積分表
// ════════════════════════════════════════════════════════════════
test('F1-7 foreignTable：playerRank∈1..4、純函式決定論、只結算已打輪次', () => {
  const teamId = 'schwarzwald-ritter';
  const sched = buildForeignSchedule({ teamId, seed: 3 });
  const partialResults = sched.slice(0, 2).map((m, i) => ({
    matchId: m.id, scoreFor: i === 0 ? 2 : 1, scoreAgainst: i === 0 ? 0 : 2, gp: 3,
  }));
  const board = foreignTable({ teamId, seed: 3, schedule: sched, results: partialResults });
  assert.equal(board.table.length, 4, '積分表要有四隊');
  assert.ok(board.playerRank >= 1 && board.playerRank <= 4, `playerRank 要落 1..4，收到 ${board.playerRank}`);
  assert.equal(board.played, 2);
  assert.equal(board.complete, false, '打到一半不算完賽');
  const me = board.table.find((r) => r.id === FOREIGN_PLAYER_ID);
  assert.equal(me.wins, 1);
  assert.equal(me.losses, 1);

  const fullResults = sched.map((m, i) => ({
    matchId: m.id, scoreFor: i % 2 === 0 ? 2 : 0, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
  }));
  const fullBoard = foreignTable({ teamId, seed: 3, schedule: sched, results: fullResults });
  assert.equal(fullBoard.complete, true, '6 場全打完才算完賽');

  assert.deepEqual(
    foreignTable({ teamId, seed: 3, schedule: sched, results: partialResults }),
    board,
    '純函式：同輸入同輸出',
  );
  assert.deepEqual(foreignTable({ teamId: '不存在', seed: 1 }), { table: [], playerRank: null, played: 0, complete: false });
  assert.deepEqual(foreignTable({ teamId: 'cangyu-titans', seed: 1 }), { table: [], playerRank: null, played: 0, complete: false }, '國內 id 進海外積分表要回空');
});

// ════════════════════════════════════════════════════════════════
// F1-8：季後賽接線
// ════════════════════════════════════════════════════════════════
function fullForeignLeague(teamId, seed) {
  const sched = buildForeignSchedule({ teamId, seed });
  const results = sched.map((m, i) => ({
    matchId: m.id, scoreFor: i % 2 === 0 ? 2 : 0, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
  }));
  return { sched, results };
}

test('F1-8 循環未打完 ⇒ 回原陣列參考（不猜）', () => {
  const teamId = 'azure-albatross';
  const { sched, results } = fullForeignLeague(teamId, 7);
  const partial = results.slice(0, 5); // 少最後一場
  const out = growForeignSchedule(sched, partial, teamId, 7);
  assert.equal(out, sched, '循環還沒打完＝原陣列參考');
});

test('F1-8b 循環打滿 ⇒ 長出準決賽（四隊全晉級、種子恆含玩家、round=semi、id 用 foreign- 前綴）', () => {
  const teamId = 'azure-albatross';
  const { sched, results } = fullForeignLeague(teamId, 7);
  const grown = growForeignSchedule(sched, results, teamId, 7);
  assert.equal(grown.length, 7, '6 場循環＋1 場準決賽');
  const semiEntry = grown.at(-1);
  assert.equal(semiEntry.round, PLAYOFF_ROUND.SEMI);
  assert.ok(semiEntry.id.startsWith('foreign-semi'), `match id 要用 foreign- 前綴，收到 ${semiEntry.id}`);
  assert.ok([FOREIGN_PLAYOFF_MATCH_IDS.SEMI_1, FOREIGN_PLAYOFF_MATCH_IDS.SEMI_2].includes(semiEntry.id));
  assert.ok(FOREIGN_TEAMS.some((t) => t.id === semiEntry.opponentId), '準決賽對手要是海外隊之一');
  assert.notEqual(semiEntry.opponentId, teamId);

  // 同輸入再長一次：schedule 還沒帶準決賽結果 ⇒ 回原陣列參考（冪等）
  const again = growForeignSchedule(grown, results, teamId, 7);
  assert.equal(again, grown, '準決賽還沒打完＝原陣列參考');
});

test('F1-8c 打輸敗方全敗一次 ⇒ 依然全晉級（4 隊聯賽沒有名次門檻）', () => {
  const teamId = 'solar-toro';
  const sched = buildForeignSchedule({ teamId, seed: 4 });
  // 玩家六場全輸——4 隊聯賽仍全員晉級（不像 8 隊職業聯賽需要前四）
  const allLoseResults = sched.map((m) => ({ matchId: m.id, scoreFor: 0, scoreAgainst: 2, gp: 3 }));
  const grown = growForeignSchedule(sched, allLoseResults, teamId, 4);
  assert.equal(grown.length, 7, '打滿即長，戰績不擋晉級');
  assert.equal(grown.at(-1).round, PLAYOFF_ROUND.SEMI);
});

test('F1-8d 準決賽勝 ⇒ 長出決賽（round=final、id foreign-final）', () => {
  const teamId = 'aurora-orion';
  const { sched, results } = fullForeignLeague(teamId, 9);
  const grown1 = growForeignSchedule(sched, results, teamId, 9);
  const semiEntry = grown1.at(-1);
  const resultsWithWin = [...results, { matchId: semiEntry.id, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3 }];
  const grown2 = growForeignSchedule(grown1, resultsWithWin, teamId, 9);
  assert.equal(grown2.length, 8, '循環 6＋準決賽 1＋決賽 1');
  const finalEntry = grown2.at(-1);
  assert.equal(finalEntry.round, PLAYOFF_ROUND.FINAL);
  assert.equal(finalEntry.id, FOREIGN_PLAYOFF_MATCH_IDS.FINAL);
  assert.notEqual(finalEntry.opponentId, teamId);

  // 冪等：決賽已長過，同輸入再長一次＝原陣列參考
  const again = growForeignSchedule(grown2, resultsWithWin, teamId, 9);
  assert.equal(again, grown2, '決賽已長過＝原陣列參考');
});

test('F1-8e 準決賽敗 ⇒ 不長決賽（單淘汰止步，回原陣列參考）', () => {
  const teamId = 'aurora-orion';
  const { sched, results } = fullForeignLeague(teamId, 9);
  const grown1 = growForeignSchedule(sched, results, teamId, 9);
  const semiEntry = grown1.at(-1);
  const resultsWithLoss = [...results, { matchId: semiEntry.id, won: false, scoreFor: 0, scoreAgainst: 2, gp: 3 }];
  const grown2 = growForeignSchedule(grown1, resultsWithLoss, teamId, 9);
  assert.equal(grown2, grown1, '準決敗＝不長決賽，回原陣列參考');
});

test('F1-8f 非海外賽程呼叫端零影響（防呆）', () => {
  const notForeign = [{ id: 'pro-r1', round: 'pro', opponentId: 'x' }];
  assert.equal(growForeignSchedule(notForeign, [], 'aurora-orion', 1), notForeign, '非 foreign 賽程＝原陣列參考');
  const emptySchedule = [];
  assert.equal(growForeignSchedule(emptySchedule, [], 'aurora-orion', 1), emptySchedule, '空賽程＝原陣列參考');
});

// ════════════════════════════════════════════════════════════════
// F1-10：對稱守衛
// ════════════════════════════════════════════════════════════════
test('F1-10 buildProSchedule({teamId:海外id}) 回 []（不 throw）', () => {
  for (const t of FOREIGN_TEAMS) {
    assert.deepEqual(buildProSchedule({ teamId: t.id, seed: 1 }), [], `${t.id} 進國內建賽程要回空，不得 throw`);
  }
});

test('F1-10b proTable({teamId:海外id}) 回空結果物件', () => {
  for (const t of FOREIGN_TEAMS) {
    assert.deepEqual(
      proTable({ teamId: t.id, seed: 1 }),
      { table: [], playerRank: null, played: 0, complete: false },
      `${t.id} 進國內積分表要回空`,
    );
  }
});

test('F1-10c foreign 版拿國內 id 同樣回空（見 F1-3b/F1-6/F1-7 已覆蓋，此處彙整回歸）', () => {
  const domesticId = PRO_TEAMS[0].id;
  assert.deepEqual(buildForeignSchedule({ teamId: domesticId, seed: 1 }), []);
  assert.deepEqual(
    foreignTable({ teamId: domesticId, seed: 1 }),
    { table: [], playerRank: null, played: 0, complete: false },
  );
});
