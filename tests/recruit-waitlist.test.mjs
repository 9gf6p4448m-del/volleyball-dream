// 試玩回饋 0730 §三 P2 — 來投保底（P2①）＋滿編遞補等候名單（P2②）
// 驗收軸：①滿編達標者進等候名單而非人間蒸發 ②下屆畢業潮騰位時優先於新生入隊
// ③本屆零招募＝屆末補一名主動來投者（挖角條件表零改動，來投不進 recruited）
// ④舊存檔（無 recruitment.waiting 鍵）照常載入與換屆
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  settleRecruitJoins, waitingOf, mergeWaiting, pendingWaiting, RECRUIT_TRUST,
} from '../src/career/recruitment.js';
import {
  applySeasonTurnover, buildWalkOn, thinnestRole, WALKON_PERSONA, FRESHMAN_NAME_POOL,
} from '../src/career/graduation.js';
import { walkOnIntroLines } from '../src/career/events.js';
import {
  createCareer, createCareerPlayer, recordResult, applySeasonRoster, careerMatchSetup,
  currentGrade, opponentById,
} from '../src/career/careerState.js';
import { createCareerStore } from '../src/career/careerStore.js';
import { buildStarterMembers, ensureStarterRoster, openSlots } from '../src/career/roster.js';
import { validateLineup, checkRoleStructure, FRESHMAN_TRUST } from '../src/career/lineup.js';
import { deserializeSave, serializeSave, createSaveV2 } from '../src/career/schema.js';

function fakeStorage() {
  const m = new Map();
  return {
    _map: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// 打完一屆（小組三勝＋八強敗＝止步）
function endSeason(career) {
  let c = career;
  for (const m of c.schedule) {
    if (m.stage === 'group') {
      c = recordResult(c, { matchId: m.id, won: true, scoreFor: 25, scoreAgainst: 10 });
    }
  }
  const qf = c.schedule.find((m) => m.id === 'national-qf');
  return recordResult(c, { matchId: qf.id, won: false, scoreFor: 20, scoreAgainst: 25 });
}

function readyStore(seed = 9) {
  const store = createCareerStore(fakeStorage());
  store.saveCareer(createCareer({ seed, playerName: '測' }));
  store.savePlayer(createCareerPlayer('測'));
  ensureStarterRoster(store);
  return store;
}

const MET_NORTH = { 'north-tech': { wins: 3, feat: 0, stageCleared: false } };

// ---- P2② 等候名單 ----

test('P2②：滿編達標者進等候名單（progress 不清、不入隊）；騰位後入隊即出隊列', () => {
  const store = readyStore();
  store.saveRecruitment({ progress: MET_NORTH, recruited: [], expelled: [] });
  store.saveRoster({ ...store.loadRoster(), capacity: 8 }); // 現員 7＋玩家＝8/8 額滿
  assert.equal(openSlots(store.loadRoster()), 0);
  assert.deepEqual(settleRecruitJoins(store, 9), []);
  // 修復前：這裡什麼都不會留下（達標＝永遠不入隊）
  assert.deepEqual(waitingOf(store.loadRecruitment()), ['north-tech']);
  assert.deepEqual(store.loadRecruitment().progress, MET_NORTH);
  // 逐出/擴編騰位後：正常入隊，且不留在等候名單
  store.saveRoster({ ...store.loadRoster(), capacity: 10 });
  const joined = settleRecruitJoins(store, 9);
  assert.equal(joined.length, 1);
  assert.deepEqual(waitingOf(store.loadRecruitment()), []);
  assert.deepEqual(store.loadRecruitment().recruited, ['north-tech']);
});

test('P2②：mergeWaiting 去重保序、無變化回原物件；pendingWaiting 濾掉已入隊與已畢業目標', () => {
  const rec = { progress: {}, recruited: [], waiting: ['north-tech'] };
  assert.equal(mergeWaiting(rec, ['north-tech']), rec, '重複鍵不得再寫一次');
  assert.deepEqual(waitingOf(mergeWaiting(rec, ['obsidian'])), ['north-tech', 'obsidian']);
  // obsidian（詹子曜＝基準 3 年級）第 2 屆起作廢；north-tech（杜品澄＝1 年級）三屆有效
  const both = { progress: {}, recruited: [], waiting: ['north-tech', 'obsidian'] };
  assert.deepEqual(pendingWaiting(both, 1), ['north-tech', 'obsidian']);
  assert.deepEqual(pendingWaiting(both, 2), ['north-tech']);
  const done = { progress: {}, recruited: ['north-tech'], waiting: ['north-tech'] };
  assert.deepEqual(pendingWaiting(done, 1), []);
});

test('P2②：下屆畢業潮騰位＝等候者優先入隊（先於新生），且不觸發來投保底', () => {
  const store = readyStore();
  store.saveCareer(endSeason(store.loadCareer()));
  store.saveRoster({ ...store.loadRoster(), capacity: 8 });
  store.saveRecruitment({ progress: MET_NORTH, recruited: [], expelled: [] });
  assert.deepEqual(settleRecruitJoins(store, 9), []); // 滿編＝進等候
  const adv = store.advanceSeason();
  assert.ok(adv && adv.ok);
  assert.equal(adv.admitted.length, 1, '畢業騰出的空位須先給等候者');
  const r1 = adv.admitted[0];
  assert.equal(r1.recruitKey, 'north-tech');
  assert.equal(r1.joinedSeason, 2, '入隊屆數＝遞補的那一屆');
  assert.equal(r1.growth.grade, 2, '年級＝來源隊基準＋屆數−1（杜品澄基準 1）');
  // 名冊/recruited/等候名單/trust 四處同一次 RMW 對齊
  const roster = store.loadRoster();
  assert.ok(roster.members.some((m) => m.id === r1.id && m.origin === 'north-tech'));
  assert.deepEqual(store.loadRecruitment().recruited, ['north-tech']);
  assert.deepEqual(waitingOf(store.loadRecruitment()), []);
  assert.equal(store.loadLineup().trust[r1.id], RECRUIT_TRUST);
  // 有人遞補進來＝不是「一個都沒來」，來投保底不啟動
  assert.equal(adv.walkOn, null);
  // 補位新生按「剩餘缺額」生成——等候者補的位置不會再生一個補位員
  assert.ok(!adv.freshmen.some((f) => f.role === 'setter'), '等候者已補 S，不得再生 S 補位員');
  assert.equal(validateLineup(store.loadLineup(), roster.members, 'A2').valid, true);
  assert.equal(checkRoleStructure(store.loadLineup().starters, roster.members, 'A2').legal, true);
});

test('P2②：手寫新生保留席不被等候者吃掉（滿編到只剩 1 席時，小雷照樣入學）', () => {
  const store = readyStore(1234);
  store.saveCareer(endSeason(store.loadCareer()));
  // capacity 7＝畢業兩人後恰剩 1 席（現員 5＋玩家＝6/7）：那 1 席保留給手寫新生 N1
  store.saveRoster({ ...store.loadRoster(), capacity: 7 });
  store.saveRecruitment({ progress: MET_NORTH, recruited: [], expelled: [], waiting: ['north-tech'] });
  const adv = store.advanceSeason();
  assert.equal(adv.admitted.length, 0, '保留席不得被等候者佔走');
  assert.ok(adv.freshmen.some((f) => f.id === 'N1'), '手寫新生（故事角色）必須入學');
  assert.deepEqual(waitingOf(store.loadRecruitment()), ['north-tech'], '沒入隊＝留在等候名單');
  // 邊界：連來投都塞不下（保留席吃掉最後一格）＝不硬塞、不炸換屆
  assert.equal(adv.walkOn, null, '沒空位時來投保底須安靜跳過');
});

test('P2① 邊界：名池用盡＝退化名不撞名、不炸（防呆路徑同新生）', () => {
  const members = buildStarterMembers();
  const w = buildWalkOn({
    seed: 3, members, usedNames: [...FRESHMAN_NAME_POOL, ...members.map((m) => m.fullName)],
  });
  assert.ok(w.fullName && !FRESHMAN_NAME_POOL.includes(w.fullName));
  assert.ok(!members.some((m) => m.fullName === w.fullName));
  assert.equal(w.origin, 'walkon');
});

// ---- P2① 來投保底 ----

test('P2①：thinnestRole 取名冊最薄的一格（自由人不列入；同薄取 FIELD_NEED 表序）', () => {
  const members = buildStarterMembers().filter((m) => !['A3', 'A4'].includes(m.id)); // 少一 MB 一 OPP
  assert.equal(thinnestRole(members, 'outside'), 'middle');
  // OPP 補回＝仍缺 MB；MB 也補回＝改補最薄的 S
  const withOpp = [...members, { id: 'X1', role: 'opposite', attributes: {} }];
  assert.equal(thinnestRole(withOpp, 'outside'), 'middle');
  const full = [...withOpp, { id: 'X2', role: 'middle', attributes: {} }];
  assert.equal(thinnestRole(full, 'outside'), 'setter');
});

test('P2①：buildWalkOn＝來投語意（origin/persona/一年級/W 前綴 id）、水位補正只補不砍、決定論', () => {
  const members = buildStarterMembers();
  const args = { seed: 777, members, usedNames: members.map((m) => m.fullName), playerRole: 'outside' };
  const a = buildWalkOn({ ...args });
  const b = buildWalkOn({ ...args });
  assert.deepEqual(a, b, '同種子同名冊＝同一個人');
  assert.equal(a.origin, 'walkon');
  assert.equal(a.persona, WALKON_PERSONA);
  assert.equal(a.growth.grade, 1);
  assert.ok(/^W\d+$/.test(a.id));
  assert.ok(!members.some((m) => m.fullName === a.fullName), '不得與現役撞名');
  // 水位補正（只補不砍）：同一批人、只把隊伍能力全部壓到 30——弱隊＝零補正，
  // 現行名冊＝逐屬性被墊上同一個正值（第三屆來投不是棄子）
  const weak = buildWalkOn({
    ...args,
    members: members.map((m) => ({
      ...m,
      attributes: Object.fromEntries(Object.keys(m.attributes).map((k) => [k, 30])),
    })),
  });
  assert.equal(weak.role, a.role);
  const deltas = Object.keys(a.attributes).map((k) => a.attributes[k] - weak.attributes[k]);
  assert.equal(new Set(deltas).size, 1, '補正須是逐屬性同一個值（只補不砍）');
  assert.ok(deltas[0] > 0, `現行名冊水位須把來投者墊上去（實得 ${deltas[0]}）`);
  // id 不回收：已有 W1（含校友）＝下一位 W2
  const next = buildWalkOn({ ...args, alumni: [{ member: a, seasonIndex: 1 }] });
  assert.equal(next.id, 'W2');
});

test('P2①：屆末零招募＝補一名來投者（trust 10、入名冊、不進 recruited）＋台詞是慕名而來', () => {
  const store = readyStore(777);
  store.saveCareer(endSeason(store.loadCareer()));
  const adv = store.advanceSeason();
  assert.ok(adv.walkOn, '整屆零招募＝屆末必補一名來投者');
  const w = adv.walkOn;
  assert.equal(w.origin, 'walkon');
  const roster = store.loadRoster();
  assert.ok(roster.members.some((m) => m.id === w.id), '來投者須真的入名冊');
  assert.equal(store.loadLineup().trust[w.id], FRESHMAN_TRUST);
  // 挖角系統零兜底：來投不算挖角成功
  assert.deepEqual(store.loadRecruitment().recruited, []);
  assert.deepEqual(store.loadRecruitment().progress, {});
  // 台詞口徑：慕名而來，不得出現挖角語彙
  const lines = walkOnIntroLines(w);
  assert.ok(lines.length >= 2 && lines.every((l) => l.speaker && l.text));
  assert.ok(lines.some((l) => l.text.includes('自己')), '要講明是他自己來的');
  for (const l of lines) {
    assert.ok(!l.text.includes('挖角') && !l.text.includes('條件達成'), `台詞口徑破功：${l.text}`);
  }
  assert.deepEqual(walkOnIntroLines(null), []);
  assert.equal(validateLineup(store.loadLineup(), roster.members, 'A2').valid, true);
});

test('P2①：本屆有招募入隊＝不補來投（保底只兜「一個都沒來」）', () => {
  const store = readyStore(555);
  store.saveRecruitment({ progress: MET_NORTH, recruited: [], expelled: [] });
  const joined = settleRecruitJoins(store, 555); // 第 1 屆挖到一人
  assert.equal(joined.length, 1);
  assert.equal(joined[0].joinedSeason, 1);
  store.saveCareer(endSeason(store.loadCareer()));
  const adv = store.advanceSeason();
  assert.equal(adv.walkOn, null, '本屆挖到人＝保底不啟動');
});

test('P2①：當屆招到又逐出＝仍不補來投（逐出換來投的無限迴圈防線）', () => {
  const store = readyStore(556);
  store.saveRecruitment({ progress: MET_NORTH, recruited: [], expelled: [] });
  const [m] = settleRecruitJoins(store, 556);
  assert.ok(store.applyExpel({ memberId: m.id }));
  assert.ok(!store.loadRoster().members.some((x) => x.id === m.id));
  store.saveCareer(endSeason(store.loadCareer()));
  assert.equal(store.advanceSeason().walkOn, null);
});

test('applySeasonTurnover：不給新參數＝W1 既有行為（無遞補、無來投）', () => {
  const roster = { capacity: 12, members: buildStarterMembers() };
  const t = applySeasonTurnover({ roster, seasonIndex: 1, seed: 777 });
  assert.deepEqual(t.admitted, []);
  assert.equal(t.walkOn, null);
  assert.deepEqual(t.graduates.map((m) => m.id).sort(), ['A3', 'A4']);
});

// ---- 跨三屆整合（P2①②＋D1＋N2 同一條時間軸）----

test('三屆整合：第 1 屆零招募→來投一名；第 2 屆滿編達標→第 3 屆遞補入隊；黑松 ace 逐屆變強', () => {
  const store = readyStore(2026);
  const player = store.loadPlayer();
  const entry = { id: 'group-1', opponentId: 'black-pine' };
  const aceSlot = opponentById('black-pine').ace.slot;
  const seen = [];
  const snapshotAce = () => {
    const season = store.seasonIndex();
    const shown = applySeasonRoster(opponentById('black-pine'), season); // ＝情蒐畫面的資料源
    const built = careerMatchSetup(
      store.loadCareer(), player, entry, store.loadRoster(), store.loadLineup(), season,
    ).teams.B[aceSlot];
    // 情蒐顯示端與 sim 建隊讀同一個當屆值
    assert.equal(built.height.current, shown.aceHeight ?? opponentById('black-pine').heights[aceSlot]);
    seen.push({
      season,
      name: built.name,
      grade: currentGrade(opponentById('black-pine').grades[aceSlot], season),
      heightCm: Math.round(built.height.current * 100),
      block: built.attributes.block,
    });
  };

  // 第 1 屆：零招募
  snapshotAce();
  store.saveCareer(endSeason(store.loadCareer()));
  const adv1 = store.advanceSeason();
  assert.equal(store.seasonIndex(), 2);
  assert.ok(adv1.walkOn, '第 1 屆零招募＝屆末來投保底一名');
  assert.equal(adv1.admitted.length, 0);
  const walkOnId = adv1.walkOn.id;

  // 第 2 屆：黑松線達標（D1 降年級後這條線第 2 屆還開著），但名冊剛好滿編
  snapshotAce();
  store.saveRoster({ ...store.loadRoster(), capacity: store.loadRoster().members.length + 1 });
  store.saveRecruitment({
    ...store.loadRecruitment(),
    progress: { 'black-pine': { wins: 1, feat: 4, stageCleared: false } },
  });
  assert.deepEqual(settleRecruitJoins(store, store.loadCareer().seed), []);
  assert.deepEqual(waitingOf(store.loadRecruitment()), ['black-pine']);

  // 第 2 屆末：畢業潮騰位→等候者優先入隊（且因為有人來了，不再補來投）
  store.saveRoster({ ...store.loadRoster(), capacity: 12 });
  store.saveCareer(endSeason(store.loadCareer()));
  const adv2 = store.advanceSeason();
  assert.equal(store.seasonIndex(), 3);
  assert.equal(adv2.admitted.length, 1, '等候者須在第 3 屆入隊');
  assert.equal(adv2.admitted[0].recruitKey, 'black-pine');
  assert.equal(adv2.admitted[0].growth.grade, 3, '老松第 3 屆＝三年級（基準 1＋2）');
  assert.equal(adv2.walkOn, null);
  assert.deepEqual(waitingOf(store.loadRecruitment()), []);
  assert.deepEqual(store.loadRecruitment().recruited, ['black-pine']);

  // 名冊全鏈合法：來投者仍在、遞補者入隊、先發與對位規則過
  const roster = store.loadRoster();
  assert.ok(roster.members.some((m) => m.id === walkOnId), '來投者須跨屆留在名冊');
  assert.ok(roster.members.some((m) => m.recruitKey === 'black-pine'));
  const names = [...roster.members, ...roster.alumni.map((a) => a.member)].map((m) => m.fullName);
  assert.equal(new Set(names).size, names.length, '來投/遞補/新生全名不得撞名');
  assert.equal(validateLineup(store.loadLineup(), roster.members, 'A2').valid, true);
  assert.equal(checkRoleStructure(store.loadLineup().starters, roster.members, 'A2').legal, true);

  // N2：ace 三屆都是同一人、年級逐屆 +1、身高與能力逐屆上修（第 1 屆＝建檔值）
  assert.deepEqual(seen.map((s) => s.name), ['曾家松', '曾家松']);
  assert.deepEqual(seen.map((s) => s.grade), [1, 2]);
  assert.ok(seen[1].heightCm > seen[0].heightCm, `身高未跨屆變化：${JSON.stringify(seen)}`);
  assert.ok(seen[1].block > seen[0].block, `能力未跨屆變化：${JSON.stringify(seen)}`);
});

// ---- 存檔相容（無 waiting 鍵的舊存檔）----

test('舊存檔零遷移：recruitment 無 waiting 鍵＝讀成空、換屆照跑；waiting 壞形狀被擋', () => {
  const store = readyStore(4242);
  const rec = store.loadRecruitment();
  assert.equal(rec.waiting, undefined, '預設空殼不含 waiting（可選鍵，零遷移）');
  assert.deepEqual(waitingOf(rec), []);
  assert.deepEqual(pendingWaiting(rec, 2), []);
  // 整包 roundtrip（匯出/匯入嚴格驗證路徑）
  const json = store.exportSave();
  const store2 = createCareerStore(fakeStorage());
  store2.importSave(json);
  store2.saveCareer(endSeason(store2.loadCareer()));
  const adv = store2.advanceSeason();
  assert.ok(adv && adv.ok, '無 waiting 鍵的存檔換屆不得爆炸');
  // waiting 非陣列＝匯入被擋（同 expelled 慣例）
  const bad = createSaveV2({});
  bad.recruitment = { progress: {}, recruited: [], waiting: 'north-tech' };
  assert.throws(() => deserializeSave(serializeSave(bad)), /recruitment 結構不合法/);
});
