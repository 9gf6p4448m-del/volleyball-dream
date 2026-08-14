// 大學卷 批 5 — 大學對手池＋升學分發（2026-08-14）
// 驗收＝`docs/kickoffs/acceptance-uni-batch5.md`（動手前凍結）：B5-1～B5-5、B5-7。
// B5-6（升學畫面只列候選集合）走真 UI 路徑，在 tests/admission-wiring.test.mjs。
//
// ★ 這一檔的鑑別力設計 ★ 本批最容易寫出的假通過是「畫面長出來了，但每個人看到的
// 都一樣」——集合沒被成績篩過、隊友去向是寫死的。所以 B5-3 與 B5-4 各帶一條
// **反向對照**：不同輸入必須產生不同輸出，光是「有輸出」不算數。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  UNIVERSITIES, universityById, admissibleSchoolsFor, alumniPlacementsFor,
  UNI_ALUMNI_ACES,
} from '../src/career/universities.js';
import { TIER, FINISH } from '../src/career/admission.js';
import { OPPONENTS } from '../src/career/opponents.js';
import { STARTER_DEFS, OUR_TEAM_NAME } from '../src/career/roster.js';
import { RECRUIT_CONDS, recruitDefOf } from '../src/career/recruitment.js';
import { FRESHMAN_HANDWRITTEN, FRESHMAN_NAME_POOL } from '../src/career/graduation.js';

// 既有具名角色全名集合（來源同 naming.test.mjs:43-56，那裡是七隊＋我方＋新生池）
function existingNames() {
  const names = [];
  for (const o of OPPONENTS) names.push(...o.squad, o.libero, ...o.reserves.map((r) => r.name));
  for (const d of STARTER_DEFS) names.push(d.fullName);
  for (const def of Object.values(FRESHMAN_HANDWRITTEN)) names.push(def.fullName);
  for (const key of Object.keys(RECRUIT_CONDS)) {
    const def = recruitDefOf(key);
    if (def?.fullName) names.push(def.fullName);
  }
  names.push(...FRESHMAN_NAME_POOL);
  return new Set(names);
}

const rosterOf = (school) => [...school.squad, school.libero];
const allTierIds = (tier) => UNIVERSITIES.filter((u) => u.tier === tier).map((u) => u.id);

// ════════ B5-1 資料表齊全 ════════

test('B5-1 九所大學、tier 各三所、id 互異', () => {
  assert.equal(UNIVERSITIES.length, 9);
  assert.equal(allTierIds(TIER.POWERHOUSE).length, 3);
  assert.equal(allTierIds(TIER.MID).length, 3);
  assert.equal(allTierIds(TIER.WEAK).length, 3);
  const ids = UNIVERSITIES.map((u) => u.id);
  assert.equal(new Set(ids).size, 9, '大學 id 撞號');
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9-]+$/, `${id} 非 kebab-case`);
  for (const u of UNIVERSITIES) assert.equal(universityById(u.id), u);
  assert.equal(universityById('沒這所'), null);
});

test('B5-1 校名不與高中七校或我方相同', () => {
  const hs = new Set([...OPPONENTS.map((o) => o.name), OUR_TEAM_NAME]);
  for (const u of UNIVERSITIES) {
    assert.ok(typeof u.name === 'string' && u.name.length >= 2, `${u.id} 缺校名`);
    assert.ok(!hs.has(u.name), `${u.name} 與高中隊撞名`);
  }
  assert.equal(new Set(UNIVERSITIES.map((u) => u.name)).size, 9, '大學校名重複');
});

test('B5-1 每校六先發＋自由人、隊內不撞名、身高與年級齊全', () => {
  for (const u of UNIVERSITIES) {
    assert.equal(u.squad.length, 6, `${u.id} squad 須六人`);
    assert.equal(u.heights.length, 6, `${u.id} heights 須六筆`);
    assert.equal(u.grades.length, 6, `${u.id} grades 須六筆`);
    assert.ok(u.grades.every((g) => [1, 2, 3, 4].includes(g)), `${u.id} 大學年級須 1-4`);
    assert.ok(u.heights.every((h) => h > 1.5 && h < 2.2), `${u.id} 身高離譜`);
    const all = rosterOf(u);
    assert.ok(all.every((n) => typeof n === 'string' && n.length >= 2), `${u.id} 有空名`);
    assert.equal(new Set(all).size, all.length, `${u.id} 隊內撞名`);
    assert.ok(u.ace?.name && u.ace?.title, `${u.id} 缺王牌`);
    assert.equal(
      u.ace.slot === 'L' ? u.libero : u.squad[u.ace.slot], u.ace.name,
      `${u.id} 王牌名不符槽位`,
    );
  }
});

test('★B5-1 不撞名★ 新面孔不得與既有任何具名角色同名；標為舊識者必須逐字是既有角色', () => {
  const existing = existingNames();
  const seen = new Set();
  for (const u of UNIVERSITIES) {
    const alumni = new Set(u.alumni ?? []);
    for (const n of alumni) {
      assert.ok(existing.has(n), `${u.id} 的舊識 ${n} 在既有名單裡查無此人（打錯字＝變成新角色）`);
    }
    for (const n of rosterOf(u)) {
      if (alumni.has(n)) continue;
      assert.ok(!existing.has(n), `${u.id} 的新面孔 ${n} 與既有角色撞名`);
      assert.ok(!seen.has(n), `新面孔 ${n} 在大學表內重複`);
      seen.add(n);
    }
  }
});

// ════════ B5-2 舊識落地且伏筆對得上 ════════

test('B5-2 三位對手 ace 各在恰好一所大學', () => {
  for (const name of ['詹子曜', '簡子嵐', '劉振鎧']) {
    const hit = UNIVERSITIES.filter((u) => rosterOf(u).includes(name));
    assert.equal(hit.length, 1, `${name} 應在恰好一所大學，實際 ${hit.length} 所`);
    assert.ok((hit[0].alumni ?? []).includes(name), `${name} 未被標記為舊識`);
  }
  assert.deepEqual([...UNI_ALUMNI_ACES].sort(), ['劉振鎧', '簡子嵐', '詹子曜'].sort());
});

test('B5-2 詹子曜在強豪校（伏筆：北部的大學強豪）', () => {
  const school = UNIVERSITIES.find((u) => rosterOf(u).includes('詹子曜'));
  assert.equal(school.tier, TIER.POWERHOUSE);
});

test('★B5-2 反向斷言★ 王勝翔不得出現在任何大學（他直接挑戰企業聯賽）', () => {
  for (const u of UNIVERSITIES) {
    assert.ok(!rosterOf(u).includes('王勝翔'), `${u.id} 把王勝翔寫進來了——與伏筆矛盾`);
    assert.ok(!(u.alumni ?? []).includes('王勝翔'));
  }
});

// ════════ B5-3 候選集合真的被成績篩過 ════════

test('B5-3 成績 → 候選學校數：冠亞 9／四強八強 6／小組 3', () => {
  assert.equal(admissibleSchoolsFor(FINISH.CHAMPION).length, 9);
  assert.equal(admissibleSchoolsFor(FINISH.RUNNER_UP).length, 9);
  assert.equal(admissibleSchoolsFor(FINISH.SEMI).length, 6);
  assert.equal(admissibleSchoolsFor(FINISH.QUARTER).length, 6);
  assert.equal(admissibleSchoolsFor(FINISH.GROUP).length, 3);
  // 四強／八強拿不到強豪；小組只剩弱校
  for (const f of [FINISH.SEMI, FINISH.QUARTER]) {
    assert.ok(admissibleSchoolsFor(f).every((u) => u.tier !== TIER.POWERHOUSE));
  }
  assert.ok(admissibleSchoolsFor(FINISH.GROUP).every((u) => u.tier === TIER.WEAK));
  // 認不得的成績照最低給（同 admissionTiersFor 的保守取捨）
  assert.equal(admissibleSchoolsFor('沒這種成績').length, 3);
});

test('★B5-3 反向對照★ 五種成績至少產生三種不同集合（否則分發形同虛設）', () => {
  const sets = Object.values(FINISH)
    .map((f) => admissibleSchoolsFor(f).map((u) => u.id).sort().join(','));
  assert.ok(new Set(sets).size >= 3, `只產生 ${new Set(sets).size} 種集合`);
});

// ════════ B5-4 同屆隊友去向：決定論＋不重不漏 ════════

// 名冊替身：只餵分配函式真的會讀的欄位（id/name/fullName/role/growth.grade/attributes）
const member = (id, fullName, grade, attrSum, role = 'outside') => ({
  id,
  name: fullName.slice(1),
  fullName,
  role,
  growth: { grade },
  attributes: { power: attrSum / 8, jump: attrSum / 8, block: attrSum / 8, serve: attrSum / 8,
    reaction: attrSum / 8, speed: attrSum / 8, control: attrSum / 8, stamina: attrSum / 8 },
});

const SAME_GRADE = [
  member('A1', '林承哲', 3, 480, 'setter'),
  member('A5', '葉翊飛', 3, 520),
  member('AL', '魏守恆', 3, 460, 'libero'),
  member('R1', '詹子曜', 3, 560, 'middle'),
];
const YOUNGER = [member('A6', '陳定岩', 2, 500, 'middle')];

test('B5-4 只取同屆（grade 3）——學弟不升學', () => {
  const p = alumniPlacementsFor([...SAME_GRADE, ...YOUNGER]);
  const placed = Object.values(p).flat().map((m) => m.fullName);
  assert.ok(!placed.includes('陳定岩'), '把二年級學弟也送進大學了');
  assert.equal(placed.length, SAME_GRADE.length);
});

test('B5-4 不重不漏：每位同屆隊友恰好出現在一所大學', () => {
  const p = alumniPlacementsFor(SAME_GRADE);
  const placed = Object.values(p).flat().map((m) => m.fullName);
  assert.equal(new Set(placed).size, placed.length, '有人被分到兩所');
  assert.deepEqual([...placed].sort(), SAME_GRADE.map((m) => m.fullName).sort());
  for (const id of Object.keys(p)) assert.ok(universityById(id), `分到不存在的學校 ${id}`);
});

test('B5-4 決定論：同一份名冊連跑兩次逐值相同', () => {
  assert.deepEqual(alumniPlacementsFor(SAME_GRADE), alumniPlacementsFor(SAME_GRADE));
  // 名冊順序不影響結果（存檔裡的成員順序會因招募／畢業而變動）
  assert.deepEqual(alumniPlacementsFor(SAME_GRADE), alumniPlacementsFor([...SAME_GRADE].reverse()));
});

test('★B5-4 反向對照★ 換一份隊友組成，去向要跟著變（不是寫死的假分配）', () => {
  const other = [
    member('A1', '洪振烈', 3, 470, 'opposite'),
    member('A5', '高崇山', 3, 610, 'middle'),
  ];
  const a = JSON.stringify(alumniPlacementsFor(SAME_GRADE));
  const b = JSON.stringify(alumniPlacementsFor(other));
  assert.notEqual(a, b, '兩份完全不同的名冊卻分出一樣的去向＝分配沒吃輸入');
});

test('B5-4 空名冊／壞資料不炸（畢業後名冊被清空的存檔）', () => {
  assert.deepEqual(alumniPlacementsFor([]), {});
  assert.deepEqual(alumniPlacementsFor(null), {});
  assert.deepEqual(alumniPlacementsFor([{ id: 'X' }]), {});
});

// ════════ B5-5 選校寫進存檔 ════════

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// 第 3 屆季末的存檔（屆數直接改，同 tests/chapter-wiring.test.mjs 的治具手法——
// 正常路徑要賽季結束才推進，但寫回去仍走 deserializeSave 的完整驗證）
async function thirdSeasonStorage() {
  const { createCareerStore, SAVE_KEY } = await import('../src/career/careerStore.js');
  const { createCareer, createCareerPlayer } = await import('../src/career/careerState.js');
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 99, playerName: '小夢' });
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('小夢', { seed: career.seed }));
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  raw.season.index = 3;
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  return storage;
}

test('★B5-5★ 選校後章節＝大學、school 存得住、enteredAtSeason＝4（大學第一年是第 4 屆）', async () => {
  const { createCareerStore } = await import('../src/career/careerStore.js');
  const storage = await thirdSeasonStorage();
  const store = createCareerStore(storage);
  // 反向對照：還沒選之前什麼都沒有
  assert.equal(store.loadSchool(), null, '沒選校卻已經有志願＝這條驗收恆真');
  assert.equal(store.loadChapter().id, 'highschool');

  assert.ok(store.enterUniversity('meixi'));
  assert.deepEqual(store.loadChapter(), { id: 'university', enteredAtSeason: 4 });
  assert.equal(store.loadSchool(), 'meixi');
  // 重新載入（過一次序列化）逐值一致
  const reload = createCareerStore(storage);
  assert.deepEqual(reload.loadChapter(), { id: 'university', enteredAtSeason: 4 });
  assert.equal(reload.loadSchool(), 'meixi');
  // ★ 屆數本身不動 ★ 大學賽程是批 6，先推過去就會掉進沒有賽程的空狀態
  assert.equal(reload.seasonIndex(), 3);
});

test('B5-5 冪等：再選一次不會覆寫已決定的志願', async () => {
  const { createCareerStore } = await import('../src/career/careerStore.js');
  const store = createCareerStore(await thirdSeasonStorage());
  store.enterUniversity('meixi');
  store.enterUniversity('north-ridge');
  assert.equal(store.loadSchool(), 'meixi');
  assert.deepEqual(store.loadChapter(), { id: 'university', enteredAtSeason: 4 });
});

test('B5-5 手改存檔塞了不存在的學校 ⇒ 當作沒選（不讓壞值往下游流）', async () => {
  const { createCareerStore, SAVE_KEY } = await import('../src/career/careerStore.js');
  const storage = await thirdSeasonStorage();
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  raw.career = { chapter: { id: 'university', enteredAtSeason: 4 }, school: '哈佛排球隊' };
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  assert.equal(createCareerStore(storage).loadSchool(), null);
});

// ════════ B5-7 代價明講且逐校有別 ════════

test('B5-7 每校三軸代價文字非空', () => {
  for (const u of UNIVERSITIES) {
    for (const k of ['ball', 'record', 'tech']) {
      assert.ok(typeof u.cost?.[k] === 'string' && u.cost[k].length >= 4,
        `${u.id} 的 cost.${k} 空白或太短——代價沒有明講`);
    }
    assert.ok(typeof u.blurb === 'string' && u.blurb.length >= 6, `${u.id} 缺校風描述`);
  }
});

test('★B5-7 防佔位★ 同 tier 三校的三軸不得完全相同；強豪與弱校的球權說法必須不同', () => {
  for (const tier of [TIER.POWERHOUSE, TIER.MID, TIER.WEAK]) {
    const trio = UNIVERSITIES.filter((u) => u.tier === tier)
      .map((u) => `${u.cost.ball}|${u.cost.record}|${u.cost.tech}`);
    assert.equal(new Set(trio).size, 3, `${tier} 三校的代價文字是複製貼上的`);
  }
  const power = UNIVERSITIES.filter((u) => u.tier === TIER.POWERHOUSE).map((u) => u.cost.ball);
  const weak = UNIVERSITIES.filter((u) => u.tier === TIER.WEAK).map((u) => u.cost.ball);
  for (const p of power) assert.ok(!weak.includes(p), '強豪與弱校的球權說法一字不差＝取捨在騙人');
});
