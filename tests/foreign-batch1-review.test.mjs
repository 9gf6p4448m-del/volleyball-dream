// 國外聯賽卷 批 1 覆審修（2026-08-27）——CRITICAL：「守衛語意 vs 解析語意混用」。
// BY_ID 併表後 proTeamById 對海外 id 回真值，devProRequest／enterPro 兩個「首約」
// 入口若照舊放行，會寫出 schedule=[] 的卡死存檔（seasonConcluded 恆假）。
// 拍板：首約恆國內——海外唯一入口＝批 2 的 transferPro 正式鏈。
// 驗收＝docs/kickoffs/acceptance-foreign-batch1.md（F1-11 突變紀律同款）。
//
// ★ 突變紀錄（實測，2026-08-27）★
// ① 刪 devSeed.js devProRequest 的 `if (isForeignTeamId(raw)) return null;`
//    → 恰 R1 紅（devProRequest 對海外 id 回了 {teamId} 非 null）。還原後全綠。
// ② 刪 careerStore.js enterPro 的 `if (team.league === 'foreign') return false;`
//    → 恰 R2 紅（enterPro 回 true 且 schedule 空陣列入檔——正是卡死態）。還原後全綠。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { devProRequest } from '../src/career/devSeed.js';
import { FOREIGN_TEAMS } from '../src/career/foreignTeams.js';

// ── 治具（沿 pro-batch2.test.mjs 同源鏈，避免替身漂移）──
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function uniSave(schoolId = 'meixi') {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 101, playerName: '小夢' });
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('小夢', { seed: career.seed }));
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  raw.season.index = 3;
  raw.roster = { capacity: 12, members: buildStarterMembers(), alumni: [] };
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  createCareerStore(storage).enterUniversity(schoolId);
  return storage;
}

function playRoundRobin(storage, round) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  const games = c.schedule.filter((m) => m.round === round);
  s.saveCareer({
    ...c,
    results: games.map((m, i) => ({
      matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
      scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
    })),
  });
}

function settledCorpSave(corpId = 'chaoxi-marine', schoolId = 'meixi') {
  const storage = uniSave(schoolId);
  const store = createCareerStore(storage);
  for (let y = 1; y < 4; y += 1) {
    playRoundRobin(storage, 'league');
    assert.ok(store.advanceSeason(), `fixture 前提：第 ${y} 年屆間推進成功`);
  }
  playRoundRobin(storage, 'league');
  assert.ok(store.settleUniFinale(), 'fixture 前提：U4 結算成功');
  assert.ok(store.enterCorporate(corpId), 'fixture 前提：入企業章成功');
  playRoundRobin(storage, 'corp');
  assert.ok(store.settleCorpFinale(), 'fixture 前提：企業季結算成功');
  return storage;
}

const FOREIGN_ID = FOREIGN_TEAMS[0].id;

test('R1 devProRequest：海外 id 恆 null（首約/治具恆國內），國內 id 不受影響', () => {
  assert.equal(devProRequest(new URLSearchParams(`devpro=${FOREIGN_ID}`)), null);
  // 反面（健康態要綠）：國內 id 照常解析
  assert.deepEqual(
    devProRequest(new URLSearchParams('devpro=cangyu-titans')),
    { teamId: 'cangyu-titans' },
  );
});

test('R2 enterPro：海外 id 恆拒（守衛先於寫入，零寫入），同存檔國內 id 照常入章', () => {
  const storage = settledCorpSave();
  const store = createCareerStore(storage);
  const before = storage.getItem(SAVE_KEY);
  assert.equal(store.enterPro(FOREIGN_ID), false, '海外 id 首約要拒');
  assert.equal(storage.getItem(SAVE_KEY), before, '拒絕＝零寫入（序列化全等）');
  // 反面（健康態要綠）：同一份存檔國內首約照常成功，賽程非空（卡死態的反證）
  assert.ok(store.enterPro('cangyu-titans'), '國內首約不受守衛影響');
  const c = createCareerStore(storage).loadCareer();
  assert.ok(c.schedule.filter((m) => m.round === 'pro').length > 0, '入章後賽程非空');
});
