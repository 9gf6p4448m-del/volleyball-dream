// Phase 3 W6 A2 — 賽程輪抽測試：決定論、指定邀請、保底不變式（每隊 ≤2 屆必現）、
// 國賽階梯固定、第 1 屆故事模板不動（教學鏈前提）、store 層 invitedId 傳遞。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  drawGroupOpponents, buildSchedule, groupPool, NATIONAL_LADDER,
  drawRoundRobinOpponents, roundRobinTable, RR_PLAYER_ID, RR_ADVANCE,
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

// 打完整一屆（小組全勝、八強循環三場全敗＝打滿才止步收季）
// 循環賽卷（08-09）：不能再「輸一場就 break」
function endSeason(career) {
  let c = career;
  for (const m of c.schedule) {
    if (m.stage === 'national' && m.round !== 'rr') break; // 淘汰賽打不到（沒晉級）
    const won = m.stage === 'group';
    c = recordResult(c, { matchId: m.id, won, scoreFor: won ? 25 : 20, scoreAgainst: won ? 20 : 25 });
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

test('buildSchedule：小組 3＋八強循環 3＋淘汰賽 2；邀請場帶 invited 旗標', () => {
  const sched = buildSchedule({ seed: 55, invitedId: 'iron-mist', prevGroupIds: groupOnly() });
  assert.equal(sched.length, 8); // 循環賽卷（08-09）：6 → 8
  // 循環組：鐵霧固定席在第一場，另兩隊抽籤；淘汰賽階梯（曜石→天鷹）不動
  assert.deepEqual(
    sched.filter((m) => m.round === 'rr').map((m) => m.id),
    ['national-qf', 'national-rr2', 'national-rr3'],
  );
  assert.equal(sched.find((m) => m.id === 'national-qf').opponentId, 'iron-mist');
  assert.deepEqual(
    sched.filter((m) => m.stage === 'national' && m.round !== 'rr').map((m) => m.opponentId),
    ['obsidian', 'sky-hawk'],
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
  assert.ok(store.advanceSeason({ invitedId: 'obsidian' })); // W1(P4)：成功回 {ok,...}
  const c2 = store.loadCareer();
  assert.ok(c2.schedule.some((m) => m.stage === 'group' && m.opponentId === 'obsidian' && m.invited));
  assert.equal(store.seasonIndex(), 2);
});

// ---- 2026-08-09 循環賽卷：八強 4 隊單循環 ----

test('循環組抽籤：決定論、不重複、當屆淘汰賽對手不入池（賽制上不可能同時出現）', () => {
  for (const seasonIndex of [1, 2, 3]) {
    for (const seed of [1, 55, 777, 424242]) {
      const a = drawRoundRobinOpponents({ seed, seasonIndex, groupIds: [] });
      const b = drawRoundRobinOpponents({ seed, seasonIndex, groupIds: [] });
      assert.deepEqual(a, b, '同輸入同輸出');
      assert.equal(a.length, 2);
      assert.equal(new Set(a).size, 2);
      assert.ok(!a.includes('iron-mist'), '鐵霧是固定席，不該再被抽一次');
      const sched = buildSchedule({ seed, seasonIndex, prevGroupIds: groupOnly() });
      const koThisSeason = sched
        .filter((m) => m.stage === 'national' && m.round !== 'rr')
        .map((m) => m.opponentId);
      for (const id of sched.filter((m) => m.round === 'rr').map((m) => m.opponentId)) {
        assert.ok(!koThisSeason.includes(id),
          `第 ${seasonIndex} 屆：${id} 同時在循環組與淘汰賽（seed ${seed}）`);
      }
      // 第 2 屆的淘汰賽對手是互換的（天鷹準決、曜石決賽）——上面那條在兩種階梯下都要成立
      assert.equal(koThisSeason.length, 2);
    }
  }
});

test('循環組抽籤保底：優先抽本屆小組沒遇過的隊', () => {
  // 池＝{north-tech, white-wave, gale-shore, black-pine}（扣掉鐵霧與淘汰賽兩隊）
  for (const seed of [3, 9, 12345]) {
    const picks = drawRoundRobinOpponents({
      seed, seasonIndex: 1, groupIds: ['north-tech', 'white-wave'],
    });
    assert.deepEqual([...picks].sort(), ['black-pine', 'gale-shore'],
      '池裡剛好還有兩支沒在小組遇過的隊時，必須抽那兩支');
  }
});

test('循環組名次表：勝場排序、前二晉級、對手互戰由強度決定、決定論', () => {
  const sched = buildSchedule({ seed: 777, seasonIndex: 1, prevGroupIds: groupOnly() });
  const rr = sched.filter((m) => m.round === 'rr');
  // 玩家三連勝＝必然第一（3 勝，其餘最多 2 勝）
  const winAll = rr.map((m) => ({ matchId: m.id, won: true }));
  const t1 = roundRobinTable({ seed: 777, schedule: sched, results: winAll });
  assert.equal(t1.complete, true);
  assert.equal(t1.playerRank, 1);
  assert.equal(t1.table[0].id, RR_PLAYER_ID);
  assert.equal(t1.table[0].wins, 3);
  // 表內恆為 4 隊、每隊各打 3 場（單循環的結構不變式）
  assert.equal(t1.table.length, 4);
  for (const row of t1.table) assert.equal(row.played, 3);
  assert.equal(t1.table.reduce((a, r) => a + r.wins, 0), 6, '4 隊單循環共 6 場＝6 勝');
  // 玩家三連敗＝必然墊底、不在晉級名額內
  const loseAll = rr.map((m) => ({ matchId: m.id, won: false }));
  const t0 = roundRobinTable({ seed: 777, schedule: sched, results: loseAll });
  assert.equal(t0.playerRank, 4);
  assert.ok(t0.playerRank > RR_ADVANCE);
  // 決定論：同輸入逐值一致
  assert.deepEqual(roundRobinTable({ seed: 777, schedule: sched, results: loseAll }), t0);
  // 未打完＝complete false
  const partial = roundRobinTable({
    seed: 777, schedule: sched, results: [{ matchId: rr[0].id, won: true }],
  });
  assert.equal(partial.complete, false);
  // 舊存檔（無 round 欄位）＝回傳 null，呼叫端據此走原單淘汰語意
  assert.equal(roundRobinTable({ seed: 1, schedule: [{ id: 'x', stage: 'national' }], results: [] }), null);
});

// ---- 覆審 M4：晉級／止步的角落（1 勝、2 勝、三隊成環的 tiebreak）----
// 全部用第 1 屆賽程：循環組恆為 鐵霧／青嵐／黑松（drawRoundRobinOpponents 註明的
// 「刻意恆定」），對手互戰由 level 決定 ⇒ 名次可以逐值預期，不靠隨機湊。
function rrCase(seed, script) {
  const c = createCareer({ seed, playerName: '角落' });
  const rr = c.schedule.filter((m) => m.round === 'rr');
  const results = rr.map((m) => {
    const [won, margin] = script[m.opponentId];
    return {
      matchId: m.id,
      won,
      scoreFor: won ? 25 : 25 - margin,
      scoreAgainst: won ? 25 - margin : 25,
    };
  });
  const t = roundRobinTable({ seed, schedule: c.schedule, results });
  return { t, me: t.table.find((x) => x.id === RR_PLAYER_ID) };
}

test('循環角落：1 勝也能晉級——同勝場成環時由玩家淨得分決勝', () => {
  // 大勝鐵霧、兩場小輸 ⇒ 1 勝但淨得分 +18
  const { t, me } = rrCase(100000, {
    'iron-mist': [true, 20], 'gale-shore': [false, 1], 'black-pine': [false, 1],
  });
  assert.equal(me.wins, 1);
  assert.equal(me.diff, 18);
  // 成環證據：1 勝的三隊 mini 全等（互相咬住）⇒ 若沒有淨得分這一層就會掉進 hash
  const tied = t.table.filter((x) => x.wins === 1);
  assert.equal(tied.length, 3);
  assert.equal(new Set(tied.map((x) => x.mini)).size, 1, '成環時 mini 必須全等（本測試的前提）');
  assert.equal(t.playerRank, 2, '1 勝 ＋ 淨得分最高 ⇒ 晉級');
});

test('循環角落：1 勝止步——同樣 1 勝，淨得分最差就出局', () => {
  const { t, me } = rrCase(100000, {
    'iron-mist': [true, 1], 'gale-shore': [false, 20], 'black-pine': [false, 20],
  });
  assert.equal(me.wins, 1);
  assert.equal(me.diff, -39);
  assert.equal(t.playerRank, 4, '1 勝 ＋ 淨得分最差 ⇒ 止步');
});

test('循環角落：2 勝晉級（無爭議）——輸給最強的黑松', () => {
  const { t, me } = rrCase(100000, {
    'iron-mist': [true, 5], 'gale-shore': [true, 5], 'black-pine': [false, 5],
  });
  assert.equal(me.wins, 2);
  assert.equal(t.playerRank, 2);
});

test('循環角落：2 勝止步——三隊同 2 勝成環，玩家淨得分墊底', () => {
  const { t, me } = rrCase(100000, {
    'iron-mist': [false, 20], 'gale-shore': [true, 1], 'black-pine': [true, 1],
  });
  assert.equal(me.wins, 2);
  const tied = t.table.filter((x) => x.wins === 2);
  assert.equal(tied.length, 3);
  assert.equal(new Set(tied.map((x) => x.mini)).size, 1, '成環時 mini 必須全等（本測試的前提）');
  assert.equal(me.diff, -18);
  assert.equal(t.playerRank, 3, '2 勝但淨得分墊底 ⇒ 止步（循環賽就是這樣）');
});

test('循環角落：同一組勝負，只改分差就能翻轉晉級——證明淨得分真的參與判定', () => {
  const win = rrCase(100000, {
    'iron-mist': [false, 1], 'gale-shore': [true, 20], 'black-pine': [true, 20],
  });
  const lose = rrCase(100000, {
    'iron-mist': [false, 20], 'gale-shore': [true, 1], 'black-pine': [true, 1],
  });
  assert.equal(win.me.wins, lose.me.wins, '兩例勝場數必須相同（只有分差不同）');
  assert.ok(win.t.playerRank <= RR_ADVANCE, '大勝版應晉級');
  assert.ok(lose.t.playerRank > RR_ADVANCE, '慘敗版應止步');
});

test('覆審 H1：任何止步條件都排在 champion 之前——循環三敗後硬記淘汰賽兩勝翻不了案', () => {
  let c = createCareer({ seed: 4242, playerName: '翻案' });
  for (const m of c.schedule.filter((x) => x.stage === 'group')) {
    c = recordResult(c, { matchId: m.id, won: true, scoreFor: 25, scoreAgainst: 20 });
  }
  for (const m of c.schedule.filter((x) => x.round === 'rr')) {
    c = recordResult(c, { matchId: m.id, won: false, scoreFor: 18, scoreAgainst: 25 });
  }
  assert.equal(careerStage(c), 'eliminated');
  // 手改存檔／繞過 nextMatch 的路徑：硬把淘汰賽兩場記成勝
  c = recordResult(c, { matchId: 'national-sf', won: true, scoreFor: 3, scoreAgainst: 1 });
  c = recordResult(c, { matchId: 'national-final', won: true, scoreFor: 3, scoreAgainst: 0 });
  assert.equal(careerStage(c), 'eliminated', '止步的存檔不得因為決賽有勝場就翻成冠軍');
  assert.equal(advanceSeason(c, { seasonIndex: 2 }).titles ?? 0, 0, '更不得發出衛冕加成');
});
