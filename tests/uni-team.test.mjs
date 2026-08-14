// 大學卷 批 6 — 建隊與起始信任（2026-08-14）
// 驗收＝`docs/kickoffs/acceptance-uni-batch6.md`：B6-3（建隊）、B6-4（起始信任）、
// B6-5／B6-6 的存檔面（賽程進存檔、中途可復原）。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer, PLAYER_TRUST_FLOOR } from '../src/career/careerState.js';
import { buildUniMembers, uniStartTrustFor, UNI_START_TRUST } from '../src/career/uniTeam.js';
import { universityById, UNIVERSITIES } from '../src/career/universities.js';
import { TIER } from '../src/career/admission.js';
import { effectiveOrder } from '../src/career/lineup.js';
import { buildStarterMembers } from '../src/career/roster.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function thirdSeasonStorage() {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 99, playerName: '小夢' });
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('小夢', { seed: career.seed }));
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  raw.season.index = 3;
  // 起始名冊平常由 UI 層的 ensureStarterRoster 補；治具直接塞，才有「高中隊友」可比對
  raw.roster = { capacity: 12, members: buildStarterMembers(), alumni: [] };
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  return storage;
}

// ════════ B6-3 建隊 ════════

test('B6-3 名冊＝該校六先發＋自由人，姓名逐字取自資料表', () => {
  for (const u of UNIVERSITIES) {
    const members = buildUniMembers(u.id);
    assert.equal(members.length, 7, `${u.id} 名冊人數不對`);
    const field = members.filter((m) => m.role !== 'libero').map((m) => m.fullName);
    assert.deepEqual(field, u.squad, `${u.id} 先發名單與資料表不符`);
    const libero = members.find((m) => m.role === 'libero');
    assert.equal(libero.fullName, u.libero);
    for (const m of members) {
      assert.ok(m.attributes && Object.keys(m.attributes).length >= 8, `${m.fullName} 缺屬性`);
      assert.ok(m.growth?.grade >= 1 && m.growth.grade <= 4, `${m.fullName} 年級不合法`);
      assert.equal(m.dna.teamId, u.id);
    }
    assert.equal(new Set(members.map((m) => m.id)).size, 7, 'member id 撞號');
  }
});

test('B6-3 屬性走既有座標系（level＋bias），不超過隊友天花板 85', () => {
  const power = buildUniMembers('north-ridge'); // level 82
  const weak = buildUniMembers('daiban'); // level 62
  const avg = (ms) => ms.reduce((s, m) => s + m.attributes.power, 0) / ms.length;
  assert.ok(avg(power) > avg(weak), '強豪的球員沒有比弱校強＝level 沒被吃進去');
  for (const m of [...power, ...weak]) {
    for (const v of Object.values(m.attributes)) {
      assert.ok(v <= 85 && v >= 30, `${m.fullName} 屬性 ${v} 超出合理範圍`);
    }
  }
});

test('★B6-3 反向對照★ 選不同學校 → 隊友名單完全不同', () => {
  const a = buildUniMembers('north-ridge').map((m) => m.fullName);
  const b = buildUniMembers('meixi').map((m) => m.fullName);
  assert.equal(a.filter((n) => b.includes(n)).length, 0, '兩所學校的名冊有交集＝沒吃 schoolId');
});

test('B6-3 壞學校 id ⇒ 空名冊（不猜、不炸）', () => {
  assert.deepEqual(buildUniMembers('no-such'), []);
});

test('★B6-3 核心★ 升學後名冊真的換人、玩家在先發裡、被擠掉的那位仍在名冊', () => {
  const storage = thirdSeasonStorage();
  const store = createCareerStore(storage);
  const before = store.loadRoster().members.map((m) => m.fullName);
  assert.ok(before.includes('林承哲'), '高中名冊不是預期的創隊班底');

  store.enterUniversity('haiyan');
  const roster = store.loadRoster();
  const names = roster.members.map((m) => m.fullName);
  const school = universityById('haiyan');
  assert.deepEqual(names.filter((n) => n !== school.libero), school.squad);
  assert.ok(!names.includes('林承哲'), '高中隊友跟著升學了');

  const lineup = store.loadLineup();
  const starters = effectiveOrder(lineup.starters, lineup.rotationStart);
  assert.equal(starters.length, 6);
  assert.ok(starters.includes('A2'), '玩家不在先發裡');
  // 被擠掉的那一位：不在先發、但仍在名冊（板凳）
  const benched = roster.members.filter((m) => m.role !== 'libero' && !starters.includes(m.id));
  assert.equal(benched.length, 1, '該有恰好一位被擠到板凳');
  assert.ok(names.includes(benched[0].fullName), '被擠掉的人從名冊消失了');
});

test('B6-3 高中名冊封存在 career.highSchoolRoster（不隨行但不消失）', () => {
  const storage = thirdSeasonStorage();
  const store = createCareerStore(storage);
  store.enterUniversity('haiyan');
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  const archived = raw.career?.highSchoolRoster?.members?.map((m) => m.fullName) ?? [];
  assert.ok(archived.includes('林承哲'), '高中名冊沒有被封存＝三年的隊友憑空消失');
});

// ════════ B6-4 起始信任 ════════

test('★B6-4★ 三檔互不相同且強豪 < 中段 < 弱校；強豪＝球權地板本身', () => {
  const p = UNI_START_TRUST[TIER.POWERHOUSE];
  const m = UNI_START_TRUST[TIER.MID];
  const w = UNI_START_TRUST[TIER.WEAK];
  assert.equal(new Set([p, m, w]).size, 3, '三檔有重複＝四軸取捨在騙人');
  assert.ok(p < m && m < w, `順序錯了：${p}/${m}/${w}`);
  assert.equal(p, Math.round(PLAYER_TRUST_FLOOR * 100), '強豪的起始球權該等於地板值本身');
});

test('★B6-4 反向對照★ 三所不同 tier 的學校建出三個不同的初始 trust', () => {
  const trio = ['north-ridge', 'haiyan', 'meixi'].map((id) => uniStartTrustFor(universityById(id)));
  assert.equal(new Set(trio).size, 3, `三所學校給的球權一樣：${trio}`);
  assert.deepEqual(trio, [...trio].sort((a, b) => a - b), '強豪的球權不該比弱校多');
});

test('B6-4 升學後玩家的 trust 真的變成該校的起始值', () => {
  for (const [id, tier] of [['north-ridge', TIER.POWERHOUSE], ['meixi', TIER.WEAK]]) {
    const storage = thirdSeasonStorage();
    const store = createCareerStore(storage);
    // trust 是物件 {fromSetter, floorShare}——只有分配值該隨學校變
    assert.equal(store.loadPlayer().trust.fromSetter, 40, '高中的初始 trust 變了，這條對照要重訂');
    store.enterUniversity(id);
    const t = store.loadPlayer().trust;
    assert.equal(t.fromSetter, UNI_START_TRUST[tier], `${id} 的球權沒寫進玩家`);
    assert.equal(t.floorShare, PLAYER_TRUST_FLOOR, '★球權保底被洗掉了★ 地板與學校無關');
  }
});

// ════════ B6-5／B6-6 賽程進存檔、中途可復原 ════════

test('★B6-5★ 升學後屆數推進到第 4 屆、賽程是八場大學比賽（可復原）', () => {
  const storage = thirdSeasonStorage();
  createCareerStore(storage).enterUniversity('meixi');
  const store = createCareerStore(storage); // 重新載入＝過一次序列化
  assert.equal(store.seasonIndex(), 4);
  const career = store.loadCareer();
  assert.equal(career.schedule.length, 8);
  assert.ok(career.schedule.every((m) => m.round === 'league' && m.format === 3));
  assert.ok(!career.schedule.some((m) => m.opponentId === 'meixi'), '把自己排進賽程了');
  assert.deepEqual(career.results, [], '新賽季的戰績該是空的');
  assert.deepEqual(store.loadChapter(), { id: 'university', enteredAtSeason: 4 });
});

test('B6-6 打到一半重載：賽程與已打結果逐值一致', () => {
  const storage = thirdSeasonStorage();
  const store = createCareerStore(storage);
  store.enterUniversity('meixi');
  const career = store.loadCareer();
  const half = {
    ...career,
    results: [{
      matchId: career.schedule[0].id, opponentId: career.schedule[0].opponentId,
      won: true, scoreFor: 2, scoreAgainst: 1, gp: 3,
    }],
  };
  assert.ok(store.saveCareer(half));
  const reloaded = createCareerStore(storage).loadCareer();
  assert.deepEqual(reloaded.schedule, career.schedule);
  assert.deepEqual(reloaded.results, half.results);
});

test('B6-5 冪等：已經升學過的存檔再呼叫一次不會重建名冊或洗掉戰績', () => {
  const storage = thirdSeasonStorage();
  const store = createCareerStore(storage);
  store.enterUniversity('meixi');
  const career = store.loadCareer();
  store.saveCareer({
    ...career,
    results: [{
      matchId: career.schedule[0].id, opponentId: career.schedule[0].opponentId,
      won: true, scoreFor: 2, scoreAgainst: 0, gp: 3,
    }],
  });
  store.enterUniversity('north-ridge'); // 手滑再按一次
  const after = createCareerStore(storage);
  assert.equal(after.loadSchool(), 'meixi', '志願被覆寫了');
  assert.equal(after.loadCareer().results.length, 1, '★戰績被洗掉＝重建了賽季★');
  assert.deepEqual(after.loadCareer().schedule, career.schedule);
});

// ════════ 對抗覆審 F4：高中名冊封存後要看得到 ════════
test('★F4★ 升學後生涯數據頁讀得到封存的高中名冊（不是唯寫欄位）', () => {
  const storage = thirdSeasonStorage();
  const store = createCareerStore(storage);
  assert.equal(store.loadHighSchoolRoster(), null, '還沒升學就有封存＝這條恆真');
  store.enterUniversity('haiyan');
  const archived = createCareerStore(storage).loadHighSchoolRoster();
  assert.ok(archived?.members?.length, '封存讀不出來＝三年的隊友從所有畫面消失');
  assert.ok(archived.members.some((m) => m.fullName === '林承哲'));
});
