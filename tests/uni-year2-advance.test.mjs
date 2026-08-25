// 大二卷 批 1 — 大學屆間推進（2026-08-25）
// 驗收＝`docs/kickoffs/acceptance-uni-y2-batch1.md`（B1-1～B1-5）。
// ★C4 澄清★：債 C 的 C4（careerState.advanceSeason 對大學 no-op）**保留不改寫**——
// 推進走 careerStore 大學分支，高中純函式的 league 守衛照舊成立，比凍結文預告的
// 「改寫雙態」更嚴（純函式層永不放行大學、雙態行為在本檔 store 層驗）。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { universityById } from '../src/career/universities.js';
import { UNI_GRADUATE_GRADE } from '../src/career/uniTurnover.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

/** 已升學到 schoolId 的存檔（大一、賽程已生、零戰績）。 */
function uniSave(schoolId) {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 99, playerName: '小夢' });
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('小夢', { seed: career.seed }));
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  raw.season.index = 3;
  raw.roster = { capacity: 12, members: buildStarterMembers(), alumni: [] };
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  createCareerStore(storage).enterUniversity(schoolId);
  return storage;
}

/** 把當前賽季的 league 全部打完（勝敗交錯）；played 可少打。 */
function playSeason(storage, played = null) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  const league = c.schedule.filter((m) => m.round === 'league');
  const n = played ?? league.length;
  s.saveCareer({
    ...c,
    results: league.slice(0, n).map((m, i) => ({
      matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
      scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
    })),
  });
}

test('B1-2 league 未打完：advanceSeason 回 false、存檔逐值不動', () => {
  const storage = uniSave('meixi');
  playSeason(storage, 7);
  const before = storage.getItem(SAVE_KEY);
  assert.equal(createCareerStore(storage).advanceSeason(), false);
  assert.equal(storage.getItem(SAVE_KEY), before, '不推進就一個位元都不許動');
});

test('B1-1 league 8/8：推進成功、屆數+1、新賽程、戰績清空', () => {
  const storage = uniSave('meixi');
  playSeason(storage);
  const store = createCareerStore(storage);
  const oldSave = JSON.parse(storage.getItem(SAVE_KEY));
  const adv = store.advanceSeason();
  assert.ok(adv && adv.ok, '推進必須成功（改前＝顯式守衛 no-op 回 false）');
  const save = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(save.season.index, 5, '全域屆數 4→5（大二）');
  assert.notEqual(save.season.seed, oldSave.season.seed, '種子走衍生鏈，不得沿用');
  const league = save.season.schedule.filter((m) => m.round === 'league');
  assert.equal(league.length, 8, '新賽季＝8 場 league');
  assert.equal(save.season.results.length, 0, '戰績清空');
  // 大一戰績封存（不因 results 清空而消失）
  assert.equal((save.career.seasons ?? []).at(-1)?.index, 4, '大一摘要已入 career.seasons');
});

test('B1-1b 決定論：同一份存檔重演，推進後逐值相同', () => {
  const a = uniSave('meixi'); playSeason(a); createCareerStore(a).advanceSeason();
  const b = uniSave('meixi'); playSeason(b); createCareerStore(b).advanceSeason();
  assert.equal(a.getItem(SAVE_KEY), b.getItem(SAVE_KEY));
});

test('B1-3 換血：大四離隊入 alumni、其餘升級、同位置 grade1 新生補位、名字不重複', () => {
  const storage = uniSave('meixi');
  const school = universityById('meixi');
  const gradRoles = [...school.grades.map((g, i) => ({ g, i })), { g: school.liberoGrade, i: 'L' }]
    .filter((x) => x.g >= UNI_GRADUATE_GRADE);
  playSeason(storage);
  const store = createCareerStore(storage);
  const adv = store.advanceSeason();
  const save = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(adv.graduates.length, gradRoles.length, '離隊人數＝名冊裡的大四人數');
  assert.equal(adv.freshmen.length, adv.graduates.length, '一個蘿蔔一個坑');
  const members = save.roster.members;
  assert.equal(members.length, 7, '名冊仍 7 人（6 先發＋自由人），沒有人消失');
  for (const f of adv.freshmen) {
    const m = members.find((x) => x.id === f.id);
    assert.ok(m, '新生要真的在名冊裡');
    assert.equal(m.growth.grade, 1, '新生＝大一');
    assert.ok(adv.graduates.some((g) => g.role === m.role), '補的是離隊者的位置');
  }
  for (const m of members.filter((x) => !adv.freshmen.some((f) => f.id === x.id))) {
    assert.ok(m.growth.grade >= 2 && m.growth.grade <= UNI_GRADUATE_GRADE, '倖存者升一級');
  }
  // 覆審 MEDIUM 修（08-25）：同位置全員畢業（自由人＝常態）時，補位新生身高
  // 必須落在**校格座標系**（libero＝min(heights)−0.08，再 −0.02±0.02），
  // 不得退化成通用 1.80 基準——meixi min=1.80 ⇒ 修後區間 [1.68,1.72]、
  // 修前壞版落 [1.76,1.80]，兩區間不重疊＝紅綠可判
  const fLibero = adv.freshmen.find((f) => f.role === 'libero');
  assert.ok(fLibero, 'fixture 前提：meixi liberoGrade=4，自由人第一次推進就畢業補位');
  assert.ok(fLibero.height >= 1.68 && fLibero.height <= 1.72,
    `自由人新生身高 ${fLibero.height} 不在校格區間 [1.68,1.72]＝fallback 沒吃校格`);
  const names = members.map((m) => m.fullName);
  assert.equal(new Set(names).size, names.length, '在隊名字不重複');
  for (const a of save.roster.alumni) {
    assert.ok(!names.includes(a.member.fullName), '校友名字不再出現在名冊');
  }
  // lineup 重排含玩家
  const lineup = save.lineup;
  assert.ok(Object.values(lineup.starters ?? lineup).flat().length > 0, 'lineup 存在');
});

test('B1-4 信任帶走（題 3 翻盤本體）：fromSetter 與 floorShare 推進前後逐值不變', () => {
  // 強豪北陵（north-ridge）＝翻盤敘事的主角：fromSetter 從 27 起
  const storage = uniSave('north-ridge');
  playSeason(storage);
  const before = JSON.parse(storage.getItem(SAVE_KEY)).player.trust;
  assert.equal(before.fromSetter, 27, 'fixture 前提：強豪起始信任 27（uniTeam）');
  const adv = createCareerStore(storage).advanceSeason();
  assert.ok(adv && adv.ok, 'fixture 前提：推進真的發生了（否則本測零鑑別力）');
  const after = JSON.parse(storage.getItem(SAVE_KEY)).player.trust;
  assert.deepEqual(after, before, '屆間不得動玩家球權（翻盤靠賽季內自然累積）');
});

test('B1-5 年限：推到大四打完，第 4 次推進被 chapterCompleted 擋下', () => {
  const storage = uniSave('meixi');
  for (let y = 1; y <= 3; y += 1) {
    playSeason(storage);
    const adv = createCareerStore(storage).advanceSeason();
    assert.ok(adv && adv.ok, `大${y} → 大${y + 1} 要推得動`);
  }
  const save = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(save.season.index, 7, '大四＝全域第 7 屆');
  playSeason(storage);
  assert.equal(createCareerStore(storage).advanceSeason(), false, '大四季末＝年限封頂');
});
