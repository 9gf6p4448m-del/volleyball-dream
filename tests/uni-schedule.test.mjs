// 大學卷 批 6 — 長循環賽程與勝點制（2026-08-14）
// 驗收＝`docs/kickoffs/acceptance-uni-batch6.md`：B6-1（賽程）、B6-2（勝點制與名次）。
//
// ★ 鑑別力 ★ 本批最容易「看起來有、其實沒有」的就是勝點制：寫成勝場數的話，
// 畫面長得一模一樣。所以 B6-2 的反向對照要證明「2-1 勝的積分**少於** 2-0 勝」，
// 而不只是「有積分欄位」。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildUniSchedule, uniPointsFor, uniTable, UNI_PLAYER_ID, UNI_MATCH_FORMAT, UNI_ROUNDS,
} from '../src/career/uniSchedule.js';
import { UNIVERSITIES, universityById } from '../src/career/universities.js';

// ════════ B6-1 賽程 ════════

test('B6-1 八場、其餘八所各一次、自己不在對手裡', () => {
  for (const u of UNIVERSITIES) {
    const sch = buildUniSchedule({ schoolId: u.id, seed: 7 });
    assert.equal(sch.length, 8, `${u.id} 的賽程不是 8 場`);
    assert.equal(sch.length, UNI_ROUNDS);
    const opps = sch.map((m) => m.opponentId);
    assert.equal(new Set(opps).size, 8, `${u.id} 有對手重複`);
    assert.ok(!opps.includes(u.id), `${u.id} 把自己排進賽程了`);
    for (const m of sch) {
      assert.ok(universityById(m.opponentId), `${m.opponentId} 不是大學`);
      assert.equal(m.round, 'league');
      assert.equal(m.stage, 'uni');
      assert.equal(m.format, UNI_MATCH_FORMAT, 'bo3 沒帶在賽程項上＝勝點制算不出局數');
    }
    assert.equal(new Set(sch.map((m) => m.id)).size, 8, '場次 id 撞號');
  }
});

test('★B6-1 反向對照★ 選不同學校 → 對手集合不同', () => {
  const a = buildUniSchedule({ schoolId: 'north-ridge', seed: 7 }).map((m) => m.opponentId).sort();
  const b = buildUniSchedule({ schoolId: 'meixi', seed: 7 }).map((m) => m.opponentId).sort();
  assert.notDeepEqual(a, b, '兩所學校的賽程一模一樣＝生成器沒吃 schoolId');
  assert.ok(a.includes('meixi') && !a.includes('north-ridge'));
  assert.ok(b.includes('north-ridge') && !b.includes('meixi'));
});

test('B6-1 決定論：同 seed 同賽程；不同 seed 順序會變（但對手集合不變）', () => {
  const s1 = buildUniSchedule({ schoolId: 'haiyan', seed: 11 });
  const s2 = buildUniSchedule({ schoolId: 'haiyan', seed: 11 });
  assert.deepEqual(s1, s2);
  const s3 = buildUniSchedule({ schoolId: 'haiyan', seed: 12 });
  assert.deepEqual(
    s1.map((m) => m.opponentId).sort(), s3.map((m) => m.opponentId).sort(),
    '對手集合不該隨 seed 改變（單循環就是每隊各一次）',
  );
  assert.notDeepEqual(s1.map((m) => m.opponentId), s3.map((m) => m.opponentId));
});

test('B6-1 壞學校 id ⇒ 空賽程（不猜、不炸）', () => {
  assert.deepEqual(buildUniSchedule({ schoolId: 'no-such', seed: 1 }), []);
});

// ════════ B6-2 勝點制 ════════

test('★B6-2 逐案★ 2-0→3、2-1→2、1-2→1、0-2→0', () => {
  assert.equal(uniPointsFor(2, 0), 3);
  assert.equal(uniPointsFor(2, 1), 2);
  assert.equal(uniPointsFor(1, 2), 1);
  assert.equal(uniPointsFor(0, 2), 0);
});

test('★B6-2 反向對照★ 2-1 勝的積分必須少於 2-0 勝（否則勝點制形同虛設）', () => {
  assert.ok(uniPointsFor(2, 1) < uniPointsFor(2, 0), '兩種勝法同分＝拿勝場數當積分');
  assert.ok(uniPointsFor(1, 2) > uniPointsFor(0, 2), '輸掉但搶下一局要有分');
  // 拿勝場數當積分的假實作會讓這兩條同時失效
  assert.notEqual(uniPointsFor(2, 1), uniPointsFor(2, 0));
});

// ════════ B6-2 積分表與名次 ════════

const scheduleFor = (schoolId) => buildUniSchedule({ schoolId, seed: 7 });
const resultOf = (m, sf, sa) => ({
  matchId: m.id, opponentId: m.opponentId, won: sf > sa, scoreFor: sf, scoreAgainst: sa, gp: 0,
});

test('B6-2 積分表：玩家的真實戰績逐場進表，對手同場記反向比分', () => {
  const sch = scheduleFor('meixi');
  const results = [resultOf(sch[0], 2, 0), resultOf(sch[1], 1, 2)];
  const { table, played } = uniTable({ schoolId: 'meixi', seed: 7, schedule: sch, results });
  assert.equal(played, 2);
  const me = table.find((r) => r.id === UNI_PLAYER_ID);
  assert.equal(me.points, 3 + 1, '2-0 勝＋1-2 敗＝4 分');
  assert.equal(me.wins, 1);
  assert.equal(me.setsFor, 3);
  assert.equal(me.setsAgainst, 2);
  const beaten = table.find((r) => r.id === sch[0].opponentId);
  assert.equal(beaten.setsFor, 0, '被玩家 2-0 打敗的隊伍該記 0 局');
  const winner = table.find((r) => r.id === sch[1].opponentId);
  assert.ok(winner.points >= 2, '贏玩家 2-1 的隊伍至少 2 分');
});

test('★B6-2 名次分層★ 同積分不同局差要分得出高下', () => {
  const sch = scheduleFor('meixi');
  const results = [resultOf(sch[0], 2, 0)];
  const { table } = uniTable({ schoolId: 'meixi', seed: 7, schedule: sch, results });
  for (let i = 0; i + 1 < table.length; i += 1) {
    const a = table[i];
    const b = table[i + 1];
    const key = (r) => [r.points, r.wins, r.setsFor - r.setsAgainst, r.ptsFor - r.ptsAgainst];
    const ka = key(a);
    const kb = key(b);
    const firstDiff = ka.findIndex((v, k) => v !== kb[k]);
    if (firstDiff >= 0) {
      assert.ok(ka[firstDiff] > kb[firstDiff],
        `名次順序違反分層規則：${a.name}(${ka}) 排在 ${b.name}(${kb}) 前面`);
    }
  }
  // 至少要真的分出高下（全部同分＝這條驗不到東西）
  assert.ok(new Set(table.map((r) => r.points)).size >= 2, '所有隊伍同分＝對手互戰沒被結算');
});

test('B6-2 積分表決定論：同一份輸入連算兩次逐值相同（不必存進存檔）', () => {
  const sch = scheduleFor('north-ridge');
  const results = [resultOf(sch[0], 2, 1), resultOf(sch[1], 0, 2), resultOf(sch[2], 2, 0)];
  const a = uniTable({ schoolId: 'north-ridge', seed: 3, schedule: sch, results });
  const b = uniTable({ schoolId: 'north-ridge', seed: 3, schedule: sch, results });
  assert.deepEqual(a, b);
});

test('★B6-2 不劇透★ 玩家還沒打的輪次，對手互戰不得先結算', () => {
  const sch = scheduleFor('meixi');
  const none = uniTable({ schoolId: 'meixi', seed: 7, schedule: sch, results: [] });
  assert.ok(none.table.every((r) => r.played === 0), '一場都沒打，積分表卻已經有戰績');
  const one = uniTable({ schoolId: 'meixi', seed: 7, schedule: sch, results: [resultOf(sch[0], 2, 0)] });
  assert.ok(one.table.every((r) => r.played <= 1), '一輪打完卻有人打了兩場');
  // ★ 九隊是奇數 ⇒ 每一輪恰有一隊輪空 ★（原斷言寫「九隊都要有一場」在數學上不可能
  // 成立——circle method 的必然結果，不是實作偷懶。修正後仍是同一件事的嚴格版：
  // 恰好 8 隊有比賽、恰好 1 隊輪空，且輪空的不是玩家）
  assert.equal(one.table.filter((r) => r.played === 1).length, 8, '該輪應有八隊各一場');
  const idle = one.table.filter((r) => r.played === 0);
  assert.equal(idle.length, 1, '該輪應恰有一隊輪空');
  assert.notEqual(idle[0].id, UNI_PLAYER_ID, '輪空的不該是剛打完比賽的玩家');
});

test('B6-2 打完八場 ⇒ complete，且每隊都打滿八場', () => {
  const sch = scheduleFor('haiyan');
  const results = sch.map((m, i) => resultOf(m, i % 2 === 0 ? 2 : 1, i % 2 === 0 ? 1 : 2));
  const { complete, played, table, playerRank } = uniTable({
    schoolId: 'haiyan', seed: 7, schedule: sch, results,
  });
  assert.equal(played, 8);
  assert.equal(complete, true);
  for (const r of table) assert.equal(r.played, 8, `${r.name} 只打了 ${r.played} 場`);
  assert.ok(playerRank >= 1 && playerRank <= 9);
});
