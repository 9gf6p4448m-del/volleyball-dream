// 4.5A 宿敵三幕賽程硬保底（拍板 §1-1）：天鷹逐屆掛點＝第 1 屆決賽（故事模板）、
// 第 2 屆準決賽、第 3 屆決賽；保底＝生成約束，同種子同賽程鐵律不破。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedule, nationalLadderFor, matchFormatOf, RIVAL_TEAM_ID } from '../src/career/schedule.js';
import { createCareer, advanceSeason, recordResult, createCareerPlayer, careerStage } from '../src/career/careerState.js';
import { createCareerStore } from '../src/career/careerStore.js';
import { ensureStarterRoster } from '../src/career/roster.js';
import { settleCareerMatch } from '../src/app/matchCareer.js';

const entryOf = (sched, id) => sched.find((m) => m.id === id);

test('nationalLadderFor：第 2 屆天鷹掛準決賽、決賽曜石；其餘屆維持預設階梯', () => {
  const s2 = nationalLadderFor(2);
  assert.equal(entryOf(s2, 'national-sf').opponentId, RIVAL_TEAM_ID);
  assert.equal(entryOf(s2, 'national-final').opponentId, 'obsidian');
  assert.equal(entryOf(s2, 'national-qf').opponentId, 'iron-mist');
  for (const idx of [null, 1, 3]) {
    const lad = nationalLadderFor(idx);
    assert.equal(entryOf(lad, 'national-sf').opponentId, 'obsidian');
    assert.equal(entryOf(lad, 'national-final').opponentId, RIVAL_TEAM_ID);
  }
});

test('buildSchedule：seasonIndex=2 掛保底階梯、省略＝既有行為不變', () => {
  const base = buildSchedule({ seed: 12345 });
  const s2 = buildSchedule({ seed: 12345, seasonIndex: 2 });
  assert.equal(entryOf(base, 'national-final').opponentId, RIVAL_TEAM_ID);
  assert.equal(entryOf(s2, 'national-sf').opponentId, RIVAL_TEAM_ID);
  assert.equal(entryOf(s2, 'national-final').opponentId, 'obsidian');
  // 小組輪抽不受屆數影響（保底只動國賽階梯）
  assert.deepEqual(
    base.filter((m) => m.stage === 'group'),
    s2.filter((m) => m.stage === 'group'),
  );
});

test('保底決定論：同種子同屆重跑逐值一致', () => {
  const a = buildSchedule({ seed: 987654, seasonIndex: 2, invitedId: 'black-pine' });
  const b = buildSchedule({ seed: 987654, seasonIndex: 2, invitedId: 'black-pine' });
  assert.deepEqual(a, b);
});

test('matchFormatOf：第 2 屆準決賽天鷹＝bo3（幕二關鍵戰）、決賽曜石＝bo5', () => {
  const s2 = nationalLadderFor(2);
  assert.equal(matchFormatOf(entryOf(s2, 'national-sf')), 3);
  assert.equal(matchFormatOf(entryOf(s2, 'national-final')), 5);
});

test('三屆快進：advanceSeason 帶屆數＝天鷹掛點逐屆正確（1 決賽→2 準決→3 決賽）', () => {
  // 第 1 屆（故事模板）：天鷹在決賽
  let career = createCareer({ seed: 777 });
  assert.equal(entryOf(career.schedule, 'national-final').opponentId, RIVAL_TEAM_ID);
  // 打完第 1 屆（全敗淘汰即可）→ 進第 2 屆
  for (const m of career.schedule) {
    career = recordResult(career, { matchId: m.id, won: false, scoreFor: 0, scoreAgainst: 25 });
    if (m.stage === 'national') break; // 國賽首敗＝淘汰
  }
  const s2 = advanceSeason(career, { seasonIndex: 2 });
  assert.notEqual(s2, career);
  assert.equal(entryOf(s2.schedule, 'national-sf').opponentId, RIVAL_TEAM_ID);
  assert.equal(entryOf(s2.schedule, 'national-final').opponentId, 'obsidian');
  // 打完第 2 屆 → 進第 3 屆：天鷹回決賽
  let c2 = s2;
  for (const m of c2.schedule) {
    c2 = recordResult(c2, { matchId: m.id, won: false, scoreFor: 0, scoreAgainst: 25 });
    if (m.stage === 'national') break;
  }
  const s3 = advanceSeason(c2, { seasonIndex: 3 });
  assert.equal(entryOf(s3.schedule, 'national-final').opponentId, RIVAL_TEAM_ID);
  assert.equal(entryOf(s3.schedule, 'national-sf').opponentId, 'obsidian');
});

// ---- store 層整合（careerStore 傳 seasonIndex 的接線證據；three-seasons 同款樁）----

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}
const winGame = { players: { A2: { teamId: 'A' } }, match: { score: { A: 25, B: 18 }, winner: 'A' }, events: [], scoutTally: {} };
const loseGame = { players: { A2: { teamId: 'A' } }, match: { score: { A: 19, B: 25 }, winner: 'B' }, events: [], scoutTally: {} };

function playSeason(store) {
  for (;;) {
    const career = store.loadCareer();
    const next = career.schedule.find((m) => !career.results.some((r) => r.matchId === m.id));
    if (!next || careerStage(career) === 'eliminated') break;
    settleCareerMatch({
      careerCtx: { store, career, player: store.loadPlayer(), matchEntry: next },
      game: next.stage === 'national' ? loseGame : winGame,
      playerId: 'A2',
    });
    if (careerStage(store.loadCareer()) === 'eliminated') break;
  }
}

function scheduleSnapshots(seed) {
  const store = createCareerStore(fakeStorage());
  store.saveCareer(createCareer({ seed, playerName: '測' }));
  store.savePlayer(createCareerPlayer('測'));
  ensureStarterRoster(store);
  const snaps = [store.loadCareer().schedule];
  playSeason(store);
  store.advanceSeason();
  snaps.push(store.loadCareer().schedule);
  playSeason(store);
  store.advanceSeason();
  snaps.push(store.loadCareer().schedule);
  return snaps;
}

test('store 三屆快進：天鷹掛點逐屆正確（決賽→準決→決賽）＋同種子兩輪逐值一致', () => {
  const snaps = scheduleSnapshots(4545);
  assert.equal(entryOf(snaps[0], 'national-final').opponentId, RIVAL_TEAM_ID);
  assert.equal(entryOf(snaps[1], 'national-sf').opponentId, RIVAL_TEAM_ID);
  assert.equal(entryOf(snaps[1], 'national-final').opponentId, 'obsidian');
  assert.equal(entryOf(snaps[2], 'national-final').opponentId, RIVAL_TEAM_ID);
  assert.equal(entryOf(snaps[2], 'national-sf').opponentId, 'obsidian');
  assert.deepEqual(snaps, scheduleSnapshots(4545), '同種子重跑逐值一致');
});
