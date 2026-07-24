// Phase 3 W6 — 擴池測試：招募池 12（5 招牌＋強隊第二人 3＋新隊雙招牌 4）、
// recruitKey 鍵結構（同隊多槽）、純壯舉軸 conditionMet、新 feat 三型、
// 同隊雙招募共存、新隊入池與賽程池聯動。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECRUIT_CONDS, RECRUIT_TRUST, accrueRecruitProgress, conditionMet, progressOf,
  buildRecruitMember, featGainFor, settleRecruitJoins,
} from '../src/career/recruitment.js';
import { opponentById, OPPONENTS } from '../src/career/opponents.js';
import { groupPool } from '../src/career/schedule.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { ensureStarterRoster, buildStarterMembers } from '../src/career/roster.js';
import { createCareerStore } from '../src/career/careerStore.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function readyStore() {
  const store = createCareerStore(fakeStorage());
  store.saveCareer(createCareer({ seed: 42, playerName: '測' }));
  store.savePlayer(createCareerPlayer('測'));
  ensureStarterRoster(store);
  return store;
}

test('擴池結構：池 12、鍵合法、對手皆存在、7 隊每隊 1-2 槽', () => {
  const keys = Object.keys(RECRUIT_CONDS);
  assert.equal(keys.length, 12);
  const perTeam = {};
  for (const [key, cond] of Object.entries(RECRUIT_CONDS)) {
    assert.ok(opponentById(cond.opponentId), `${key} 的對手 ${cond.opponentId} 不存在`);
    assert.ok(['setter', 'outside', 'middle', 'opposite', 'libero'].includes(cond.role));
    perTeam[cond.opponentId] = (perTeam[cond.opponentId] ?? 0) + 1;
  }
  assert.equal(Object.keys(perTeam).length, OPPONENTS.length); // 7 隊全數有招募對象
  for (const [teamId, n] of Object.entries(perTeam)) {
    assert.ok(n >= 1 && n <= 2, `${teamId} 招募槽 ${n} 超出 1-2`);
  }
  // 賽程輪抽池同步含新隊（A1 兩支）
  assert.ok(groupPool().includes('gale-shore') && groupPool().includes('black-pine'));
  assert.equal(groupPool().length, 7);
});

test('accrueRecruitProgress：同隊多槽逐鍵各自累加（wins 同步、feat 各算各的）', () => {
  // 對曜石一勝＋2 記攔網得分：招牌（blockKill 累積）與第二人（blockKillMatch 單場≥2）都動
  const events = [
    { type: 'BLOCK_TOUCH', team: 'A', playerId: 'A2', kill: true },
    { type: 'SCORE', team: 'A' },
    { type: 'BLOCK_TOUCH', team: 'A', playerId: 'A2', kill: true },
    { type: 'SCORE', team: 'A' },
  ];
  const gain1 = featGainFor(events, 'A2', 'A', RECRUIT_CONDS.obsidian);
  const gain2 = featGainFor(events, 'A2', 'A', RECRUIT_CONDS['obsidian-2']);
  const rec = accrueRecruitProgress({ progress: {}, recruited: [], expelled: [] }, {
    opponentId: 'obsidian', matchId: 'group-3', won: true,
    events, playerId: 'A2', myTeam: 'A',
  });
  assert.equal(progressOf(rec, 'obsidian').wins, 1);
  assert.equal(progressOf(rec, 'obsidian-2').wins, 1); // wins 同步累加（條件無 wins 軸＝不檢查）
  assert.equal(progressOf(rec, 'obsidian').feat, gain1);
  assert.equal(progressOf(rec, 'obsidian-2').feat, gain2);
  // 非該隊的鍵不動
  assert.equal(progressOf(rec, 'iron-mist').wins, 0);
});

test('conditionMet：純壯舉軸（無 wins）feat 達標即成立', () => {
  const rec = { progress: { 'obsidian-2': { wins: 0, feat: 1, stageCleared: false } }, recruited: [] };
  assert.equal(conditionMet(rec, 'obsidian-2'), true);
  const short = { progress: { 'obsidian-2': { wins: 9, feat: 0, stageCleared: false } }, recruited: [] };
  assert.equal(conditionMet(short, 'obsidian-2'), false); // wins 再多也不頂 feat
});

test('settleRecruitJoins：第二人入隊——recruited 記 recruitKey、origin＝來源隊', () => {
  const store = readyStore();
  store.saveRecruitment({
    progress: { 'obsidian-2': { wins: 0, feat: 1, stageCleared: false } },
    recruited: [], expelled: [],
  });
  const joined = settleRecruitJoins(store, 42);
  assert.equal(joined.length, 1);
  assert.equal(joined[0].recruitKey, 'obsidian-2');
  assert.equal(joined[0].origin, 'obsidian');
  assert.equal(joined[0].name, '小磐');
  const rec = store.loadRecruitment();
  assert.ok(rec.recruited.includes('obsidian-2'));
  assert.ok(!rec.recruited.includes('obsidian')); // 招牌槽不受第二人影響
  assert.equal(store.loadLineup().trust[joined[0].id], RECRUIT_TRUST);
});

test('settleRecruitJoins：同隊招牌＋第二人可共存（兩成員、id 不撞）', () => {
  const store = readyStore();
  store.saveRecruitment({
    progress: {
      obsidian: { wins: 2, feat: 5, stageCleared: false },
      'obsidian-2': { wins: 0, feat: 1, stageCleared: false },
    },
    recruited: [], expelled: [],
  });
  const joined = settleRecruitJoins(store, 42);
  assert.equal(joined.length, 2);
  assert.notEqual(joined[0].id, joined[1].id);
  const fromObsidian = store.loadRoster().members.filter((m) => m.origin === 'obsidian');
  assert.equal(fromObsidian.length, 2);
  assert.deepEqual(
    fromObsidian.map((m) => m.recruitKey).sort(),
    ['obsidian', 'obsidian-2'],
  );
});

test('入隊補正：隊伍成長水位墊高招募生（只補不砍、決定論、夾限 85）', () => {
  const base = buildRecruitMember('north-tech', 42, 'R1'); // 無名冊＝無補正（治具基準臂）
  const withAttrs = (v) => buildStarterMembers().map((m) => ({
    ...m,
    attributes: Object.fromEntries(Object.keys(m.attributes).map((k) => [k, v])),
  }));
  const boosted = buildRecruitMember('north-tech', 42, 'R1', withAttrs(85));
  const sum = (m) => Object.values(m.attributes).reduce((s, v) => s + v, 0);
  for (const k of Object.keys(boosted.attributes)) {
    assert.ok(boosted.attributes[k] >= base.attributes[k], `${k} 被補正砍低`);
    assert.ok(boosted.attributes[k] <= 85, `${k} 超過夾限`);
  }
  assert.ok(sum(boosted) > sum(base) + 40, '85 水位 vs 52 級生成應顯著上修');
  // 決定論：同名冊同種子重演逐值一致
  assert.deepEqual(buildRecruitMember('north-tech', 42, 'R1', withAttrs(85)), boosted);
  // 只補不砍：弱名冊（全 30）不把強隊招牌拉低
  assert.deepEqual(
    buildRecruitMember('sky-hawk', 42, 'R1', withAttrs(30)),
    buildRecruitMember('sky-hawk', 42, 'R1'),
  );
});

test('新隊招牌可入隊（gale-shore wins 2）；新隊二人目走 killMatch', () => {
  const store = readyStore();
  store.saveRecruitment({
    progress: { 'gale-shore': { wins: 2, feat: 0, stageCleared: false } },
    recruited: [], expelled: [],
  });
  const joined = settleRecruitJoins(store, 42);
  assert.equal(joined.length, 1);
  assert.equal(joined[0].origin, 'gale-shore');
  // killMatch：單場 4 殺達標＝1、3 殺＝0
  const killEvents = (n) => {
    const evs = [];
    for (let i = 0; i < n; i += 1) {
      evs.push({ type: 'TOUCH', team: 'A', playerId: 'A2', kind: 'spike' });
      evs.push({ type: 'SCORE', team: 'A' });
    }
    return evs;
  };
  assert.equal(featGainFor(killEvents(4), 'A2', 'A', RECRUIT_CONDS['gale-shore-2']), 1);
  assert.equal(featGainFor(killEvents(3), 'A2', 'A', RECRUIT_CONDS['gale-shore-2']), 0);
});
