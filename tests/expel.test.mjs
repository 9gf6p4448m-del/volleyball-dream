// Phase 3 W5 — 逐出機制測試（B6 六項）：applyExpel 原子性、trust 夾限、邊界擋下、
// 招募連動（額滿→逐出騰位→自動入隊 trust=10／被逐隊不重入／R id 不回收）、
// schema expelled roundtrip 與舊檔冪等、未逐出存檔回歸不擾動。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECRUIT_CONDS, RECRUIT_TRUST, settleRecruitJoins, nextRecruitId,
} from '../src/career/recruitment.js';
import {
  createCareer, createCareerPlayer,
} from '../src/career/careerState.js';
import { buildStarterMembers, ensureStarterRoster, openSlots } from '../src/career/roster.js';
import { createCareerStore } from '../src/career/careerStore.js';
import { deserializeSave, serializeSave } from '../src/career/schema.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// 有生涯存檔＋名冊已補齊的 store（正式路徑最小重現；同 recruitment.test 慣例）
function readyStore(seed = 42) {
  const store = createCareerStore(fakeStorage());
  store.saveCareer(createCareer({ seed, playerName: '測試員' }));
  store.savePlayer(createCareerPlayer('測試員'));
  ensureStarterRoster(store);
  return store;
}

// 塞達成條件→settleRecruitJoins 生出真實 R 成員（正式入隊路徑，非手捏成員）
function storeWithRecruit(oppId = 'north-tech', seed = 42) {
  const store = readyStore(seed);
  const cond = RECRUIT_CONDS[oppId];
  store.saveRecruitment({
    progress: {
      [oppId]: { wins: cond.wins, feat: cond.feat?.count ?? 0, stageCleared: !!cond.stage },
    },
    recruited: [],
    expelled: [],
  });
  const joined = settleRecruitJoins(store, seed);
  return { store, joined };
}

// ---- B6-1 原子性 ----

test('applyExpel 原子性：單次 RMW 三處同完成（名冊移除＋trust 下修＋expelled 記錄）', () => {
  const { store, joined } = storeWithRecruit('north-tech');
  assert.equal(joined[0].id, 'R1');
  assert.ok(store.loadRoster().members.some((m) => m.id === 'R1'));

  const ok = store.applyExpel({ memberId: 'R1' });
  assert.equal(ok, true);

  const roster = store.loadRoster();
  const rec = store.loadRecruitment();
  const lineup = store.loadLineup();
  assert.ok(!roster.members.some((m) => m.id === 'R1'), '名冊已移除 R1');
  assert.equal(rec.expelled.length, 1, 'expelled 記錄一筆');
  const entry = rec.expelled[0];
  assert.equal(entry.member.id, 'R1');
  assert.equal(entry.member.origin, 'north-tech');
  assert.equal(entry.member.role, 'setter'); // 完整快照
  assert.equal(entry.seasonIndex, 1);
  assert.equal(entry.titlesAtExpel, 0);
  assert.ok(!Object.hasOwn(lineup.trust, 'R1'), '被逐者 trust key 一併移除');
  assert.deepEqual(rec.recruited, ['north-tech'], 'recruited 保留（防重招、不沒收）');
});

// ---- B6-2 trust 夾限 ----

test('applyExpel trust 夾限：全體隊友 −5 不低於 0、主角（save.player）不受影響', () => {
  const { store } = storeWithRecruit('north-tech');
  const lineup = store.loadLineup();
  const beforeA1 = lineup.trust.A1; // 預設隊友 20
  lineup.trust.A3 = 3; // 低值隊友：驗證 3−5 夾限到 0（不變負）
  store.saveLineup(lineup);
  const playerBefore = store.loadPlayer().trust.fromSetter;

  store.applyExpel({ memberId: 'R1' });

  const after = store.loadLineup().trust;
  assert.equal(after.A1, beforeA1 - 5, '既有隊友 −5');
  assert.equal(after.A3, 0, '3−5 夾限到 0，不變負');
  assert.equal(store.loadPlayer().trust.fromSetter, playerBefore, '主角 trust 不受影響');
  assert.ok(!Object.hasOwn(after, 'A2'), '主角 A2 本就不在 lineup.trust 映射');
});

// ---- B6-3 邊界擋下 ----

test('applyExpel 邊界擋下：創隊班底不可逐、先發中不可逐、每屆限 1', () => {
  // 創隊班底（origin='starter'）不可逐
  const s1 = storeWithRecruit('north-tech').store;
  assert.equal(s1.canExpel('A1').reason, 'starter-origin');
  s1.applyExpel({ memberId: 'A1' });
  assert.ok(s1.loadRoster().members.some((m) => m.id === 'A1'), 'A1 no-op 未移除');

  // 先發中不可逐（把 R1 合法排進先發：換掉同為 setter 的 A1）
  const s2 = storeWithRecruit('north-tech').store;
  const lineup = s2.loadLineup();
  lineup.starters = ['R1', 'A2', 'A3', 'A4', 'A5', 'A6'];
  s2.saveLineup(lineup);
  assert.equal(s2.canExpel('R1').reason, 'in-lineup');
  s2.applyExpel({ memberId: 'R1' });
  assert.ok(s2.loadRoster().members.some((m) => m.id === 'R1'), '先發中 R1 no-op 未移除');

  // 每屆限 1：招兩人、逐一人後第二人擋下（仍只有一筆 expelled）
  const s3 = readyStore();
  s3.saveRecruitment({
    progress: {
      'north-tech': { wins: 3, feat: 0, stageCleared: false },
      obsidian: { wins: 2, feat: 5, stageCleared: false },
    },
    recruited: [],
    expelled: [],
  });
  settleRecruitJoins(s3, 42); // R1(north-tech)、R2(obsidian)，皆板凳
  assert.equal(s3.applyExpel({ memberId: 'R1' }), true);
  assert.equal(s3.canExpel('R2').reason, 'season-limit');
  s3.applyExpel({ memberId: 'R2' });
  assert.equal(s3.loadRecruitment().expelled.length, 1, '第二次逐出被擋、仍只有一筆');
  assert.ok(s3.loadRoster().members.some((m) => m.id === 'R2'), 'R2 未被移除');
});

// ---- B6-4 招募連動（核心閘）----

test('applyExpel 招募連動：額滿+條件達成→逐出騰位→自動入隊 trust=10、被逐隊不重入、R id 不回收', () => {
  const store = readyStore();
  store.saveRecruitment({
    progress: {
      'north-tech': { wins: 3, feat: 0, stageCleared: false },
      obsidian: { wins: 2, feat: 5, stageCleared: false },
    },
    recruited: [],
    expelled: [],
  });
  // 人工滿編（正常玩到不了）：capacity 8＝現員 7＋1 空位，只容 1 名招募生
  store.saveRoster({ ...store.loadRoster(), capacity: 8 });
  const first = settleRecruitJoins(store, 42);
  assert.deepEqual(first.map((m) => m.id), ['R1'], '只入 north-tech（R1）、obsidian 額滿卡住');
  assert.equal(openSlots(store.loadRoster()), 0, '滿編');

  // 逐出 R1（north-tech）騰位：既有隊友 −5
  assert.equal(store.applyExpel({ memberId: 'R1' }), true);
  assert.equal(store.loadLineup().trust.A1, 15, '既有隊友 20→15');

  // §9 鉤子：applyExpel 先、settleRecruitJoins 後——obsidian 補入
  const joined = settleRecruitJoins(store, 42);
  assert.deepEqual(joined.map((m) => m.id), ['R2'], '補入 obsidian＝R2（R id 不回收，非 R1）');
  assert.equal(joined[0].origin, 'obsidian');

  const lineup = store.loadLineup();
  assert.equal(lineup.trust.R2, RECRUIT_TRUST, '連動入隊 trust=10、不吃逐出的 −5');
  assert.ok(!Object.hasOwn(lineup.trust, 'R1'), '被逐 R1 未回名冊');
  assert.deepEqual(store.loadRecruitment().recruited, ['north-tech', 'obsidian']);
  assert.ok(!store.loadRoster().members.some((m) => m.origin === 'north-tech'), 'north-tech 未回歸（不重入）');
});

// ---- B6-5 schema roundtrip 與舊檔冪等 ----

test('schema：expelled roundtrip 保存、舊檔（無 expelled 鍵）deserialize 冪等不 brick', () => {
  const { store } = storeWithRecruit('north-tech');
  store.applyExpel({ memberId: 'R1' });
  const saved = JSON.parse(store.exportSave()).save;
  const round = deserializeSave(serializeSave(saved));
  assert.equal(round.recruitment.expelled.length, 1);
  assert.equal(round.recruitment.expelled[0].member.id, 'R1');
  assert.equal(round.recruitment.expelled[0].seasonIndex, 1);

  // 舊檔（W4 前存檔缺 expelled）：deserialize 不擲、讀取端 ?? [] 容錯
  const old = JSON.parse(readyStore(9).exportSave()).save;
  delete old.recruitment.expelled;
  assert.doesNotThrow(() => deserializeSave(serializeSave(old)));
  assert.equal(deserializeSave(serializeSave(old)).recruitment.expelled, undefined, '不硬塞（防禦式讀取）');
  assert.equal(nextRecruitId(buildStarterMembers(), undefined), 'R1', 'nextRecruitId 對缺 expelled 容錯');
});

// ---- B6-6 回歸：未逐出存檔不擾動 ----

test('回歸：未逐出存檔 deserialize→serialize 冪等（無欄位漂移）、canExpel 純讀不改存檔', () => {
  const store = readyStore(42);
  store.saveRecruitment({
    progress: { 'north-tech': { wins: 3, feat: 0, stageCleared: false } },
    recruited: [],
    expelled: [],
  });
  settleRecruitJoins(store, 42); // 招一名、全程不逐出
  const before = store.exportSave();

  const save = JSON.parse(before).save;
  assert.equal(
    serializeSave(deserializeSave(serializeSave(save))),
    serializeSave(save),
    'deserialize→serialize 冪等（逐出程式碼不擾動既有序列化）',
  );
  store.canExpel('A1');
  store.canExpel('R1');
  assert.equal(store.exportSave(), before, 'canExpel 純讀、不改存檔');
});
