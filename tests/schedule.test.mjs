// Phase 3 W6 A2 — 賽程輪抽測試：決定論、指定邀請、保底不變式（每隊 ≤2 屆必現）、
// 國賽階梯固定、第 1 屆故事模板不動（教學鏈前提）、store 層 invitedId 傳遞。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  drawGroupOpponents, buildSchedule, groupPool, NATIONAL_LADDER,
} from '../src/career/schedule.js';
import {
  createCareer, advanceSeason, recordResult, careerStage, opponentById,
} from '../src/career/careerState.js';
import { createCareerStore } from '../src/career/careerStore.js';
import { createCareerPlayer } from '../src/career/careerState.js';

const NATIONAL_IDS = new Set(NATIONAL_LADDER.map((m) => m.opponentId));
const groupOnly = () => groupPool().filter((id) => !NATIONAL_IDS.has(id));

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// 打完整一屆（首場全國賽輸＝止步收季）
function endSeason(career) {
  let c = career;
  for (const m of c.schedule) {
    const won = m.stage === 'group';
    c = recordResult(c, { matchId: m.id, won, scoreFor: won ? 25 : 20, scoreAgainst: won ? 20 : 25 });
    if (!won) break;
  }
  assert.equal(careerStage(c), 'eliminated');
  return c;
}

test('drawGroupOpponents：決定論、3 場不重複、level 升冪', () => {
  const a = drawGroupOpponents({ seed: 12345, prevGroupIds: ['north-tech', 'white-wave', 'obsidian'] });
  const b = drawGroupOpponents({ seed: 12345, prevGroupIds: ['north-tech', 'white-wave', 'obsidian'] });
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  assert.equal(new Set(a).size, 3);
  for (let i = 1; i < a.length; i += 1) {
    assert.ok(opponentById(a[i - 1]).level <= opponentById(a[i]).level);
  }
  for (const id of a) assert.ok(groupPool().includes(id));
});

test('指定邀請：invitedId 必入小組（含國賽階梯強隊）', () => {
  for (const seed of [1, 999, 424242]) {
    const picks = drawGroupOpponents({ seed, invitedId: 'sky-hawk', prevGroupIds: groupOnly().slice(0, 3) });
    assert.ok(picks.includes('sky-hawk'), `seed ${seed} 未含邀請隊`);
  }
});

test('保底不變式：連續邀請強隊（對抗情境）下，僅小組隊每兩屆至少現身一次', () => {
  // 鏈式模擬 12 屆：每屆都把唯一名額拿去邀天鷹——僅小組隊只剩 2 席可輪
  let prev = null;
  const history = [];
  let seed = 777;
  for (let s = 0; s < 12; s += 1) {
    const picks = drawGroupOpponents({ seed, invitedId: 'sky-hawk', prevGroupIds: prev });
    history.push(picks);
    prev = picks;
    seed = (seed * 16777619 + 7) >>> 0; // 屆間種子演進（形式不拘，各屆不同即可）
  }
  for (let s = 1; s < history.length; s += 1) {
    const union = new Set([...history[s - 1], ...history[s]]);
    for (const id of groupOnly()) {
      assert.ok(union.has(id), `第 ${s}/${s + 1} 屆之間 ${id} 缺席（保底破功）`);
    }
  }
});

test('buildSchedule：小組 3＋國賽階梯固定；邀請場帶 invited 旗標', () => {
  const sched = buildSchedule({ seed: 55, invitedId: 'iron-mist', prevGroupIds: groupOnly() });
  assert.equal(sched.length, 6);
  assert.deepEqual(
    sched.filter((m) => m.stage === 'national').map((m) => m.opponentId),
    ['iron-mist', 'obsidian', 'sky-hawk'],
  );
  const invitedRows = sched.filter((m) => m.invited);
  assert.equal(invitedRows.length, 1);
  assert.equal(invitedRows[0].opponentId, 'iron-mist');
  assert.equal(invitedRows[0].stage, 'group');
});

test('第 1 屆故事模板不動：createCareer 小組恆為北原→白浪→曜石（教學鏈前提）', () => {
  for (const seed of [1, 777, 123456789]) {
    const c = createCareer({ seed, playerName: '測' });
    assert.deepEqual(
      c.schedule.filter((m) => m.stage === 'group').map((m) => m.opponentId),
      ['north-tech', 'white-wave', 'obsidian'],
    );
  }
});

test('advanceSeason：第 2 屆起輪抽（決定論）；invitedId 進賽程；titles 邏輯不變', () => {
  const ended = endSeason(createCareer({ seed: 777, playerName: '測' }));
  const s2a = advanceSeason(ended, { invitedId: 'sky-hawk' });
  const s2b = advanceSeason(ended, { invitedId: 'sky-hawk' });
  assert.deepEqual(s2a, s2b); // 決定論：同輸入同輸出
  const group = s2a.schedule.filter((m) => m.stage === 'group');
  assert.equal(group.length, 3);
  assert.ok(group.some((m) => m.opponentId === 'sky-hawk' && m.invited));
  assert.equal(s2a.titles ?? 0, 0);
  // 不指定＝無 invited 旗標
  const s2n = advanceSeason(ended);
  assert.ok(s2n.schedule.every((m) => !m.invited));
});

test('store.advanceSeason({invitedId})：邀請隊落入第 2 屆賽程並持久化', () => {
  const store = createCareerStore(fakeStorage());
  store.saveCareer(endSeason(createCareer({ seed: 42, playerName: '測' })));
  store.savePlayer(createCareerPlayer('測'));
  assert.equal(store.advanceSeason({ invitedId: 'obsidian' }), true);
  const c2 = store.loadCareer();
  assert.ok(c2.schedule.some((m) => m.stage === 'group' && m.opponentId === 'obsidian' && m.invited));
  assert.equal(store.seasonIndex(), 2);
});
