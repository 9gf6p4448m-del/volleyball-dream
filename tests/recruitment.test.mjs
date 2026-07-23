// Phase 3 W4 — 招募判定測試：三軸條件判定（勝場/壯舉/stage）、跨賽季累積、
// 決定論 DNA 生成、入隊流程（trust 顯式 10／無空位保留進度／冪等）、
// 排陣器一般化（動態預設序/板凳替換守門/雙自由人）、schema 升級與 roundtrip、
// 未招募存檔的建隊回歸。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECRUIT_CONDS, RECRUIT_TRUST, progressOf, featGainFor, accrueRecruitProgress,
  conditionMet, buildRecruitMember, nextRecruitId, settleRecruitJoins,
} from '../src/career/recruitment.js';
import {
  DEFAULT_STARTERS, defaultStarters, defaultLineup, validateLineup, checkRoleStructure,
} from '../src/career/lineup.js';
import {
  createCareer, createCareerPlayer, careerTeams,
} from '../src/career/careerState.js';
import { buildStarterMembers, ensureStarterRoster, openSlots } from '../src/career/roster.js';
import { createCareerStore } from '../src/career/careerStore.js';
import { createSaveV2, serializeSave, deserializeSave } from '../src/career/schema.js';
import { settleCareerMatch } from '../src/app/matchCareer.js';
import { ATTRIBUTE_KEYS } from '../src/sim/player.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// 有生涯存檔＋名冊已補齊的 store（正式路徑的最小重現）
function readyStore(seed = 42) {
  const store = createCareerStore(fakeStorage());
  store.saveCareer(createCareer({ seed, playerName: '測試員' }));
  store.savePlayer(createCareerPlayer('測試員'));
  ensureStarterRoster(store);
  return store;
}

const EMPTY_REC = { progress: {}, recruited: [] };
const MEMBERS = buildStarterMembers();

// ---- 壯舉事件掃描（合成事件流；欄位形狀同 sim 實際輸出）----

const touch = (team, playerId, kind, power = 1) => ({ type: 'TOUCH', team, playerId, kind, power });
const serve = (team, playerId) => ({ type: 'SERVE', team, playerId });
const blockTouch = (team, playerId) => ({ type: 'BLOCK_TOUCH', team, playerId });
const score = (team) => ({ type: 'SCORE', team });

test('featGainFor blockKill：攔網直接得分計數、被接起不計', () => {
  const cond = RECRUIT_CONDS.obsidian;
  const kill = [blockTouch('A', 'A2'), score('A')];
  assert.equal(featGainFor(kill, 'A2', 'A', cond), 1);
  // 攔網觸球後對方又救起再得分＝非攔死
  const dug = [blockTouch('A', 'A2'), touch('B', 'B3', 'receive', 0.7), score('A')];
  assert.equal(featGainFor(dug, 'A2', 'A', cond), 0);
  // 隊友攔死不算玩家壯舉
  const teammate = [blockTouch('A', 'A3'), score('A')];
  assert.equal(featGainFor(teammate, 'A2', 'A', cond), 0);
});

test('featGainFor strongReceive：敵發後第一觸、品質達標才計', () => {
  const cond = RECRUIT_CONDS['iron-mist'];
  const good = [serve('B', 'B1'), touch('A', 'A2', 'receive', 0.9), score('A')];
  assert.equal(featGainFor(good, 'A2', 'A', cond), 1);
  const weak = [serve('B', 'B1'), touch('A', 'A2', 'receive', 0.5)];
  assert.equal(featGainFor(weak, 'A2', 'A', cond), 0);
  // 隊友接的、或我方發球＝不計
  const others = [
    serve('B', 'B1'), touch('A', 'AL', 'receive', 0.95),
    serve('A', 'A2'), touch('B', 'B5', 'receive', 0.95),
  ];
  assert.equal(featGainFor(others, 'A2', 'A', cond), 0);
  // 非第一觸（二傳）不算接發
  const second = [serve('B', 'B1'), touch('A', 'AL', 'receive', 0.6), touch('A', 'A2', 'set', 0.95)];
  assert.equal(featGainFor(second, 'A2', 'A', cond), 0);
});

test('featGainFor digMatch：敵方扣球後的救球達單場門檻＝1 場、dive 也算 dig', () => {
  const cond = RECRUIT_CONDS['white-wave'];
  const dig = (kind = 'receive') => [touch('B', 'B2', 'spike', 1), touch('A', 'A2', kind, 0.6)];
  assert.equal(featGainFor([...dig(), ...dig(), ...dig('dive')], 'A2', 'A', cond), 1);
  assert.equal(featGainFor([...dig(), ...dig()], 'A2', 'A', cond), 0);
  // 接發（發球後 receive）不是 dig
  const reception = [serve('B', 'B1'), touch('A', 'A2', 'receive', 0.9)];
  assert.equal(featGainFor([...reception, ...dig(), ...dig()], 'A2', 'A', cond), 0);
});

// ---- 條件累加與判定 ----

test('accrueRecruitProgress：勝場計數、敗場不計、其他隊進度不動', () => {
  let rec = accrueRecruitProgress(EMPTY_REC, {
    opponentId: 'north-tech', matchId: 'group-1', won: true,
  });
  rec = accrueRecruitProgress(rec, { opponentId: 'north-tech', matchId: 'group-1', won: false });
  assert.equal(progressOf(rec, 'north-tech').wins, 1);
  assert.deepEqual(progressOf(rec, 'white-wave'), { wins: 0, feat: 0, stageCleared: false });
});

test('accrueRecruitProgress：跨賽季（多場）累積、永不重置', () => {
  const digs3 = Array.from({ length: 3 }, () => [
    touch('B', 'B2', 'spike', 1), touch('A', 'A2', 'receive', 0.6),
  ]).flat();
  let rec = EMPTY_REC;
  for (let season = 0; season < 2; season += 1) {
    rec = accrueRecruitProgress(rec, {
      opponentId: 'white-wave', matchId: 'group-2', won: true,
      events: digs3, playerId: 'A2', myTeam: 'A',
    });
  }
  assert.deepEqual(progressOf(rec, 'white-wave'), { wins: 2, feat: 2, stageCleared: false });
});

test('stage 軸：僅在指定場次擊敗才記、輸球不記', () => {
  const base = { opponentId: 'sky-hawk', won: true };
  const atFinal = accrueRecruitProgress(EMPTY_REC, { ...base, matchId: 'national-final' });
  assert.equal(progressOf(atFinal, 'sky-hawk').stageCleared, true);
  const elsewhere = accrueRecruitProgress(EMPTY_REC, { ...base, matchId: 'group-1' });
  assert.equal(progressOf(elsewhere, 'sky-hawk').stageCleared, false);
  const lost = accrueRecruitProgress(EMPTY_REC, {
    opponentId: 'sky-hawk', matchId: 'national-final', won: false,
  });
  assert.equal(progressOf(lost, 'sky-hawk').stageCleared, false);
});

test('progressOf：半殘條目缺鍵補 0（不產生 NaN、不整條回退）', () => {
  const rec = { progress: { 'white-wave': { wins: 2 } }, recruited: [] };
  assert.deepEqual(progressOf(rec, 'white-wave'), { wins: 2, feat: 0, stageCleared: false });
  const accrued = accrueRecruitProgress(rec, {
    opponentId: 'white-wave', matchId: 'group-2', won: true,
  });
  assert.deepEqual(progressOf(accrued, 'white-wave'), { wins: 3, feat: 0, stageCleared: false });
});

test('conditionMet：三軸缺一不可、缺項不檢查', () => {
  const rec = (progress) => ({ progress, recruited: [] });
  assert.equal(conditionMet(rec({ 'north-tech': { wins: 2, feat: 0, stageCleared: false } }), 'north-tech'), false);
  assert.equal(conditionMet(rec({ 'north-tech': { wins: 3, feat: 0, stageCleared: false } }), 'north-tech'), true);
  assert.equal(conditionMet(rec({ 'white-wave': { wins: 2, feat: 2, stageCleared: false } }), 'white-wave'), false);
  assert.equal(conditionMet(rec({ 'white-wave': { wins: 2, feat: 3, stageCleared: false } }), 'white-wave'), true);
  assert.equal(conditionMet(rec({ 'sky-hawk': { wins: 1, feat: 0, stageCleared: false } }), 'sky-hawk'), false);
  assert.equal(conditionMet(rec({ 'sky-hawk': { wins: 1, feat: 0, stageCleared: true } }), 'sky-hawk'), true);
  assert.equal(conditionMet(EMPTY_REC, 'unknown-team'), false);
});

// ---- 招牌球員 DNA 生成 ----

test('buildRecruitMember：同種子重演逐值一致、換種子屬性有差', () => {
  const a = buildRecruitMember('sky-hawk', 777, 'R1');
  const b = buildRecruitMember('sky-hawk', 777, 'R1');
  assert.deepEqual(a, b);
  const c = buildRecruitMember('sky-hawk', 778, 'R1');
  assert.notDeepEqual(a.attributes, c.attributes);
});

test('buildRecruitMember：成員形狀合約（角色/年級/DNA/屬性夾限）', () => {
  for (const oppId of Object.keys(RECRUIT_CONDS)) {
    const m = buildRecruitMember(oppId, 42, 'R1');
    assert.equal(m.role, RECRUIT_CONDS[oppId].role);
    assert.equal(m.origin, oppId);
    assert.equal(m.growth.grade, 2); // 固定二年級轉學生
    assert.deepEqual(m.growth.log, []);
    assert.equal(m.dna.teamId, oppId);
    assert.equal(typeof m.height, 'number');
    for (const k of ATTRIBUTE_KEYS) {
      assert.ok(m.attributes[k] >= 30 && m.attributes[k] <= 85, `${oppId} ${k}=${m.attributes[k]}`);
    }
  }
  assert.equal(buildRecruitMember('white-wave', 42, 'R1').height, 1.72);
});

// ---- 入隊流程 ----

test('settleRecruitJoins：入隊寫入名冊＋recruited＋lineup.trust 顯式 10（非回退）', () => {
  const store = readyStore();
  store.saveRecruitment({
    progress: { 'north-tech': { wins: 3, feat: 0, stageCleared: false } },
    recruited: [],
  });
  const joined = settleRecruitJoins(store, 42);
  assert.equal(joined.length, 1);
  assert.equal(joined[0].id, 'R1');
  const roster = store.loadRoster();
  assert.ok(roster.members.some((m) => m.id === 'R1' && m.origin === 'north-tech'));
  assert.deepEqual(store.loadRecruitment().recruited, ['north-tech']);
  const lineup = store.loadLineup();
  assert.ok(Object.hasOwn(lineup.trust, 'R1'), 'trust 必須顯式寫入（非 trustOf 回退）');
  assert.equal(lineup.trust.R1, RECRUIT_TRUST);
});

test('settleRecruitJoins：無空位不入隊、progress 保留、騰出空位後可入', () => {
  const store = readyStore();
  const progress = { 'north-tech': { wins: 3, feat: 0, stageCleared: false } };
  store.saveRecruitment({ progress, recruited: [] });
  store.saveRoster({ ...store.loadRoster(), capacity: 7 }); // 現員 7/7＝額滿
  assert.deepEqual(settleRecruitJoins(store, 42), []);
  assert.deepEqual(store.loadRecruitment().progress, progress); // 條件保持已達成
  assert.equal(openSlots(store.loadRoster()), 0);
  store.saveRoster({ ...store.loadRoster(), capacity: 10 });
  assert.equal(settleRecruitJoins(store, 42).length, 1);
});

test('settleRecruitJoins：冪等——重複呼叫不重複入隊', () => {
  const store = readyStore();
  store.saveRecruitment({
    progress: { 'north-tech': { wins: 3, feat: 0, stageCleared: false } },
    recruited: [],
  });
  settleRecruitJoins(store, 42);
  assert.deepEqual(settleRecruitJoins(store, 42), []);
  assert.equal(store.loadRoster().members.filter((m) => m.id.startsWith('R')).length, 1);
});

test('settleRecruitJoins：多隊同時達成＝依表序全部入隊、id 不碰撞', () => {
  const store = readyStore();
  store.saveRecruitment({
    progress: {
      'north-tech': { wins: 3, feat: 0, stageCleared: false },
      obsidian: { wins: 2, feat: 5, stageCleared: false },
    },
    recruited: [],
  });
  const joined = settleRecruitJoins(store, 42);
  assert.deepEqual(joined.map((m) => m.id), ['R1', 'R2']);
  assert.deepEqual(store.loadRecruitment().recruited, ['north-tech', 'obsidian']);
});

test('nextRecruitId：R 序號依既有 R 成員數遞增', () => {
  assert.equal(nextRecruitId(MEMBERS), 'R1');
  assert.equal(nextRecruitId([...MEMBERS, { id: 'R1' }, { id: 'R2' }]), 'R3');
});

// ---- 排陣器一般化 ----

test('defaultStarters：7 人創隊名冊與 W3 硬編碼逐位等價', () => {
  assert.deepEqual(defaultStarters(MEMBERS), DEFAULT_STARTERS);
});

test('defaultStarters：10 人名冊仍產創隊六人、結構合法', () => {
  const full = [
    ...MEMBERS,
    buildRecruitMember('north-tech', 42, 'R1'), // 第二 S 也不會頂掉 A1（原班優先）
    buildRecruitMember('obsidian', 42, 'R2'),
    buildRecruitMember('sky-hawk', 42, 'R3'),
  ];
  const starters = defaultStarters(full);
  assert.deepEqual(starters, DEFAULT_STARTERS);
  const lineup = defaultLineup(full);
  assert.equal(validateLineup(lineup, full, 'A2').valid, true);
  assert.equal(checkRoleStructure(starters, full, 'A2').legal, true);
});

test('板凳替換守門：同角色頂替合法、跨角色被 checkRoleStructure 擋', () => {
  const full = [...MEMBERS, buildRecruitMember('sky-hawk', 42, 'R1'),
    buildRecruitMember('obsidian', 42, 'R2')];
  const swapOh = ['A1', 'A2', 'A3', 'A4', 'R1', 'A6']; // R1(OH) 頂 A5(OH)
  assert.equal(checkRoleStructure(swapOh, full, 'A2').legal, true);
  const swapBad = ['R2', 'A2', 'A3', 'A4', 'A5', 'A6']; // R2(MB) 頂 A1(S)＝對角崩
  assert.equal(checkRoleStructure(swapBad, full, 'A2').legal, false);
});

test('雙自由人：libero 可選 R 自由人、預設仍為 AL', () => {
  const full = [...MEMBERS, buildRecruitMember('white-wave', 42, 'R1')];
  assert.equal(defaultLineup(full).libero, 'AL');
  const lineup = { ...defaultLineup(full), libero: 'R1' };
  assert.equal(validateLineup(lineup, full, 'A2').valid, true);
});

// ---- schema ----

test('schema：W3 空殼 recruitment 存檔升級冪等、壞形狀被擋', () => {
  const store = readyStore();
  // W5 起預設空殼＝{progress:{}, recruited:[], expelled:[]}（10→12 屆逐出騰位）——讀寫往返照常
  const EMPTY_REC_V5 = { progress: {}, recruited: [], expelled: [] };
  assert.deepEqual(store.loadRecruitment(), EMPTY_REC_V5);
  ensureStarterRoster(store); // 再跑一次升級＝冪等
  assert.deepEqual(store.loadRecruitment(), EMPTY_REC_V5);
  // 壞形狀：recruited 非陣列
  const bad = createSaveV2({});
  bad.recruitment = { progress: {}, recruited: 'R1' };
  assert.throws(() => deserializeSave(serializeSave(bad)), /recruitment 結構不合法/);
});

test('schema：入隊後 roundtrip——recruited 成員仍在 members、trust 保留', () => {
  const store = readyStore();
  store.saveRecruitment({
    progress: { obsidian: { wins: 2, feat: 5, stageCleared: false } },
    recruited: [],
  });
  settleRecruitJoins(store, 42);
  const json = store.exportSave();
  const store2 = createCareerStore(fakeStorage());
  store2.importSave(json);
  const roster = store2.loadRoster();
  assert.ok(roster.members.some((m) => m.id === 'R1' && m.origin === 'obsidian'));
  assert.deepEqual(store2.loadRecruitment().recruited, ['obsidian']);
  assert.equal(store2.loadLineup().trust.R1, RECRUIT_TRUST);
});

// ---- 建隊與賽末接線 ----

test('careerTeams：招募成員排入先發＝依 trust 映射建隊（顯式 10）', () => {
  const player = createCareerPlayer('測試員');
  const full = [...MEMBERS, buildRecruitMember('sky-hawk', 42, 'R1')];
  const lineup = {
    starters: ['A1', 'A2', 'A3', 'A4', 'R1', 'A6'], libero: 'AL', rotationStart: 0,
    trust: { A1: 20, A3: 20, A4: 20, A5: 20, A6: 20, R1: RECRUIT_TRUST },
  };
  const teams = careerTeams(player, null, full, lineup);
  const r1 = teams.A.find((p) => p.id === 'R1');
  assert.equal(r1.trust.fromSetter, RECRUIT_TRUST);
  assert.equal(r1.naturalRole, 'outside');
});

test('回歸：未招募存檔（含板凳轉學生）預設建隊仍為創隊六人', () => {
  const player = createCareerPlayer('測試員');
  const full = [...MEMBERS, buildRecruitMember('obsidian', 42, 'R1')];
  const teams = careerTeams(player, null, full, null); // 未排陣＝動態預設序
  assert.deepEqual(teams.A.map((p) => p.id), DEFAULT_STARTERS);
});

test('settleCareerMatch：招募進度賽末累加、同場重入不重複累加', () => {
  const store = readyStore();
  const career = store.loadCareer();
  const player = store.loadPlayer();
  const matchEntry = career.schedule[0]; // group-1 vs north-tech
  const careerCtx = { store, career, player, matchEntry };
  const game = {
    players: { A2: { teamId: 'A' } },
    match: { score: { A: 5, B: 3 }, winner: 'A' },
    events: [score('A')],
    scoutTally: {},
  };
  const { saveOk } = settleCareerMatch({ careerCtx, game, playerId: 'A2' });
  assert.equal(saveOk, true);
  assert.equal(progressOf(store.loadRecruitment(), 'north-tech').wins, 1);
  // 局終畫面重入：recordResult 冪等、招募 progress 也不得重複累加
  settleCareerMatch({ careerCtx, game, playerId: 'A2' });
  assert.equal(progressOf(store.loadRecruitment(), 'north-tech').wins, 1);
});
