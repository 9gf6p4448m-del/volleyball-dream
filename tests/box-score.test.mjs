// W4(P4) Q9 — box score 記帳：全員歸因／S 分配與二次球／導師契約供給／
// 對手 ace 記帳（aceBook 累積）／屆末封存摘要
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTeamBox, buildAceBox, buildMentorFeed, pct } from '../src/career/boxScore.js';
import { dueMentorLines } from '../src/career/mentor.js';
import { createCareerStore, archiveSeasonSummary } from '../src/career/careerStore.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

const PLAYERS = {
  A1: { id: 'A1', name: '阿哲', teamId: 'A', currentRole: 'setter' },
  A2: { id: 'A2', name: '小夢', teamId: 'A', currentRole: 'outside' },
  A3: { id: 'A3', name: '大山', teamId: 'A', currentRole: 'middle' },
  B2: { id: 'B2', name: '王勝翔', teamId: 'B', currentRole: 'outside' },
};

// 事件流小工具：一分＝觸球序列＋SCORE
const T = (team, playerId, kind, extra = {}) => ({ type: 'TOUCH', team, playerId, kind, ...extra });
const S = (team, score) => ({ type: 'SCORE', team, score });

test('buildTeamBox：殺球/ACE/攔網歸因、二次球、接發分檔、得分合計', () => {
  const events = [
    // 分 1：A2 殺球得分（A1 舉球）
    T('A', 'A1', 'set'), T('A', 'A2', 'spike', { touches: 3, power: 1 }), S('A', { A: 1, B: 0 }),
    // 分 2：A1 二次球得手（touches=2 spike）
    T('A', 'A1', 'spike', { touches: 2, power: 0.4 }), S('A', { A: 2, B: 0 }),
    // 分 3：發球 ACE（A2）
    { type: 'SERVE', team: 'A', playerId: 'A2' }, S('A', { A: 3, B: 0 }),
    // 分 4：攔網得分（A3）
    { type: 'BLOCK_TOUCH', team: 'A', playerId: 'A3' }, S('A', { A: 4, B: 0 }),
    // 分 5：A2 接球（好球+Perfect）後我方失分——不得分但接發有記
    T('A', 'A2', 'receive', { power: 0.96 }), T('A', 'A2', 'receive', { power: 0.5 }),
    S('B', { A: 4, B: 1 }),
    // 分 6：B2 殺球（對面得分——A 隊 box 不記）
    T('B', 'B2', 'spike', { touches: 3, power: 1 }), S('B', { A: 4, B: 2 }),
  ];
  const rows = buildTeamBox(events, PLAYERS, 'A');
  assert.equal(rows.A2.kills, 1);
  assert.equal(rows.A2.spikes, 1);
  assert.equal(rows.A2.aces, 1);
  assert.equal(rows.A2.points, 2);
  assert.equal(rows.A2.receives, 2);
  assert.equal(rows.A2.recvGood, 1); // 0.96 到位、0.5 不到帶
  assert.equal(rows.A2.perfects, 1);
  assert.equal(rows.A1.sets, 1);
  assert.equal(rows.A1.dumps, 1);
  assert.equal(rows.A1.dumpKills, 1);
  assert.equal(rows.A1.points, 1);
  assert.equal(rows.A3.blocks, 1);
  assert.equal(rows.B2, undefined, '對面球員不得混入我方 box');
  // 對手 ace 單人記帳
  const ace = buildAceBox(events, PLAYERS, 'B2', 'B');
  assert.equal(ace.kills, 1);
  assert.equal(ace.name, '王勝翔');
  assert.equal(pct(1, 4), 25);
  assert.equal(pct(0, 0), null, '分母 0＝null（不假造 0%）');
});

test('buildMentorFeed：分配配對/關鍵分/連續失誤段——契約形狀餵得動 dueMentorLines', () => {
  const mk = (n, scorer, scoreA, scoreB, attacker = 'A2') => [
    T('A', 'A1', 'set'), T('A', attacker, 'spike', { touches: 3 }), S(scorer, { A: scoreA, B: scoreB }),
  ];
  const events = [
    // 8 次分配全給 A2（集中度規則素材）；前 3 次我方失分（連續失誤段=3）
    ...mk(1, 'B', 0, 1), ...mk(2, 'B', 0, 2), ...mk(3, 'B', 0, 3),
    ...mk(4, 'A', 1, 3), ...mk(5, 'A', 2, 3), ...mk(6, 'A', 3, 3),
    ...mk(7, 'A', 4, 3), ...mk(8, 'A', 5, 3),
  ];
  const feed = buildMentorFeed(events, PLAYERS, 'A1', 'A', { won: true, initialTarget: 25 });
  assert.equal(feed.sets.A2, 8);
  assert.equal(feed.names.A2, '小夢');
  assert.equal(feed.consecErrors, 3);
  assert.deepEqual(feed.result, { won: true });
  const due = dueMentorLines(feed);
  assert.ok(due, '集中度 100% 應命中規則');
  assert.equal(due.id, 'slump-cheer'); // 規則序：鼓勵優先於檢討
});

test('buildMentorFeed：關鍵分（target−1 之後）計數＋SET_START 換局重置比分/局分', () => {
  const events = [
    // 第 1 局（target 25）：比分推到 24:20 後兩次分配、一次成功
    S('A', { A: 24, B: 20 }),
    T('A', 'A1', 'set'), T('A', 'A2', 'spike', { touches: 3 }), S('A', { A: 25, B: 20 }),
    // 第 2 局（決勝局 target 15）：開局分配不算關鍵分
    { type: 'SET_START', setIndex: 2, target: 15 },
    T('A', 'A1', 'set'), T('A', 'A2', 'spike', { touches: 3 }), S('A', { A: 1, B: 0 }),
    // 推到 14:10（target−1=14）後的分配算關鍵分
    S('A', { A: 14, B: 10 }),
    T('A', 'A1', 'set'), T('A', 'A2', 'spike', { touches: 3 }), S('B', { A: 14, B: 11 }),
  ];
  const feed = buildMentorFeed(events, PLAYERS, 'A1', 'A', { won: true, initialTarget: 25 });
  assert.equal(feed.keyPoint.sets, 2, '24:20 後一次＋14:10 後一次');
  assert.equal(feed.keyPoint.kills, 1, '只有第一次成功');
});

test('recordAceBook：last 覆寫、total 累加、matches 遞增', () => {
  const store = createCareerStore(fakeStorage(), 1);
  const row = (kills, aces, blocks) => ({ name: '王勝翔', kills, aces, blocks });
  assert.ok(store.recordAceBook('sky-hawk', row(18, 2, 1)));
  assert.ok(store.recordAceBook('sky-hawk', row(12, 0, 3)));
  const book = store.loadAceBook();
  assert.equal(book['sky-hawk'].matches, 2);
  assert.deepEqual(book['sky-hawk'].last, { kills: 12, aces: 0, blocks: 3 });
  assert.deepEqual(book['sky-hawk'].total, { kills: 30, aces: 2, blocks: 4 });
});

test('archiveSeasonSummary：戰績/冠軍旗標/主角數據總和（含 liberoBox）', () => {
  const season = {
    index: 2,
    results: [
      { matchId: 'group-1', won: true, stats: { kills: 5, tipKills: 1, aces: 2, blockPoints: 0, perfects: 3 } },
      { matchId: 'national-final', won: true, stats: { kills: 7, tipKills: 0, aces: 1, blockPoints: 2, perfects: 1, liberoBox: { digs: 4, assistDigs: 2, rallySaves: 1 } } },
      { matchId: 'group-2', won: false, stats: { kills: 2, tipKills: 0, aces: 0, blockPoints: 1, perfects: 0 } },
    ],
  };
  const sum = archiveSeasonSummary(season);
  assert.equal(sum.index, 2);
  assert.equal(sum.wins, 2);
  assert.equal(sum.losses, 1);
  assert.equal(sum.champion, true);
  assert.equal(sum.totals.kills, 14);
  assert.equal(sum.totals.tipKills, 1);
  assert.equal(sum.totals.aces, 3);
  assert.equal(sum.totals.blockPoints, 3);
  assert.equal(sum.totals.digs, 4);
});
