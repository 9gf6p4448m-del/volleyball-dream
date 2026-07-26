// Phase 4 W1 — 畢業/新生資料流（graduation.js＋careerStore.advanceSeason 換血）
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitGraduates, promoteMembers, buildFreshmen, roleDeficits, applySeasonTurnover,
  FRESHMAN_HANDWRITTEN, FRESHMAN_NAME_POOL,
} from '../src/career/graduation.js';
import { buildStarterMembers, ensureStarterRoster } from '../src/career/roster.js';
import { validateLineup, checkRoleStructure } from '../src/career/lineup.js';
import { createCareer, createCareerPlayer, recordResult } from '../src/career/careerState.js';
import { createCareerStore } from '../src/career/careerStore.js';
import { graduationCeremonyLines, freshmenIntroLines } from '../src/career/events.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// 打完一屆（小組三勝＋八強敗＝止步）的 career
function endSeason(career) {
  let c = career;
  for (const m of c.schedule) {
    if (m.stage === 'group') c = recordResult(c, { matchId: m.id, won: true, scoreFor: 25, scoreAgainst: 10 });
  }
  const qf = c.schedule.find((m) => m.id === 'national-qf');
  c = recordResult(c, { matchId: qf.id, won: false, scoreFor: 20, scoreAgainst: 25 });
  return c;
}

test('splitGraduates：三年級離隊、其餘留下——大山＋阿烈畢業，功能核心（阿哲/小守/小飛）不畢業', () => {
  const { graduates, remaining } = splitGraduates(buildStarterMembers());
  assert.deepEqual(graduates.map((m) => m.id).sort(), ['A3', 'A4']);
  const stayIds = remaining.map((m) => m.id);
  for (const id of ['A1', 'A5', 'A6', 'AL']) assert.ok(stayIds.includes(id), `${id} 不得畢業`);
});

test('promoteMembers：全員年級 +1、不可變、上限 3', () => {
  const members = buildStarterMembers();
  const next = promoteMembers(members);
  assert.equal(members[0].growth.grade, 1); // 原陣列不動（阿哲）
  assert.equal(next.find((m) => m.id === 'A1').growth.grade, 2);
  assert.equal(next.find((m) => m.id === 'A6').growth.grade, 3); // 阿岩 2→3
  const capped = promoteMembers(next);
  assert.ok(capped.every((m) => m.growth.grade <= 3));
});

test('applySeasonTurnover：畢業→alumni、年級推進、新生入隊（第 2 屆＝手寫 MB＋補位 OPP）', () => {
  const roster = { capacity: 12, members: buildStarterMembers() };
  const { roster: r2, graduates, freshmen } = applySeasonTurnover({ roster, seasonIndex: 1, seed: 777 });
  assert.deepEqual(graduates.map((m) => m.id).sort(), ['A3', 'A4']);
  assert.deepEqual(r2.alumni.map((a) => a.member.id).sort(), ['A3', 'A4']);
  assert.equal(r2.alumni[0].seasonIndex, 1);
  const ids = r2.members.map((m) => m.id);
  assert.ok(!ids.includes('A3') && !ids.includes('A4'), '畢業者不得留在名冊');
  // 手寫 MB（N1，接班大山）＋程序補位員補上唯一缺角 OPP
  const n1 = r2.members.find((m) => m.id === 'N1');
  assert.equal(n1?.origin, 'handwritten');
  assert.equal(n1?.role, 'middle');
  assert.equal(n1?.growth.grade, 1);
  const gen = freshmen.filter((f) => f.origin === 'generated');
  assert.equal(gen.length, 1);
  assert.equal(gen[0].role, 'opposite');
  assert.ok(FRESHMAN_NAME_POOL.includes(gen[0].fullName), '補位員全名須出自名池');
  assert.equal(gen[0].growth.grade, 1);
  // 換血後可排出合法 5-1（含玩家 A2）
  const defs = roleDeficits(r2.members);
  assert.deepEqual(defs, {}, `換血後仍缺角：${JSON.stringify(defs)}`);
});

test('buildFreshmen 決定論：同種子同名同屬性、不同種子屬性有別；不與 usedNames 撞名', () => {
  const members = promoteMembers(splitGraduates(buildStarterMembers()).remaining);
  const args = { seasonIndex: 2, seed: 42, members, usedNames: members.map((m) => m.fullName) };
  const a = buildFreshmen({ ...args });
  const b = buildFreshmen({ ...args });
  assert.deepEqual(a, b);
  const c = buildFreshmen({ ...args, seed: 43 });
  const genA = a.find((f) => f.origin === 'generated');
  const genC = c.find((f) => f.origin === 'generated');
  assert.ok(genA && genC);
  assert.ok(genA.fullName !== genC.fullName || JSON.stringify(genA.attributes) !== JSON.stringify(genC.attributes));
  // usedNames 擋名：把名池全佔用→退化名（防呆不撞名）
  const jam = buildFreshmen({ ...args, usedNames: [...FRESHMAN_NAME_POOL] });
  const genJ = jam.find((f) => f.origin === 'generated');
  assert.ok(!FRESHMAN_NAME_POOL.includes(genJ.fullName));
});

test('store.advanceSeason 換血整合：畢業者出名冊出先發、trust 鍵清除、新生顯式 trust 20', () => {
  const store = createCareerStore(fakeStorage());
  store.saveCareer(endSeason(createCareer({ seed: 9, playerName: '測' })));
  store.savePlayer(createCareerPlayer('測'));
  ensureStarterRoster(store);
  const adv = store.advanceSeason();
  assert.ok(adv && adv.ok);
  assert.deepEqual(adv.graduates.map((m) => m.id).sort(), ['A3', 'A4']);
  assert.ok(adv.freshmen.length >= 1);
  const roster = store.loadRoster();
  assert.ok(!roster.members.some((m) => m.id === 'A3' || m.id === 'A4'));
  assert.equal(roster.alumni.length, 2);
  const lineup = store.loadLineup();
  assert.ok(!lineup.starters.includes('A3') && !lineup.starters.includes('A4'));
  assert.equal(validateLineup(lineup, roster.members, 'A2').valid, true);
  assert.equal(checkRoleStructure(lineup.starters, roster.members, 'A2').legal, true);
  assert.equal(lineup.trust.A3, undefined); // 畢業者 trust 鍵清除
  for (const f of adv.freshmen) assert.equal(lineup.trust[f.id], 20); // 新生顯式初值
  // 倖存者年級推進
  assert.equal(roster.members.find((m) => m.id === 'A1').growth.grade, 2);
  assert.equal(roster.members.find((m) => m.id === 'A6').growth.grade, 3);
});

test('儀式/入學台詞建構器：畢業者具名、播報含去向、新生按 origin 分句', () => {
  const { graduates } = splitGraduates(buildStarterMembers());
  const lines = graduationCeremonyLines({
    graduates,
    aceGrads: [{ opponentId: 'obsidian', teamName: '曜石體中', name: '詹子曜', title: '黑曜箭', heir: null }],
  });
  const speakers = lines.map((l) => l.speaker);
  assert.ok(speakers.includes('大山') && speakers.includes('阿烈'), '我方畢業者須具名發言');
  assert.ok(lines.some((l) => l.speaker === '播報' && l.text.includes('詹子曜')));
  assert.ok(lines.every((l) => l.speaker && l.text));
  const intro = freshmenIntroLines([
    { name: '新生', origin: 'handwritten', role: 'middle' },
    { name: '小樂', origin: 'generated', role: 'opposite' },
  ]);
  assert.ok(intro.some((l) => l.speaker === '新生') && intro.some((l) => l.speaker === '小樂'));
  assert.deepEqual(freshmenIntroLines([]), []);
});

test('FRESHMAN_HANDWRITTEN：第 2 屆佔位手寫 MB 存在、形狀齊全', () => {
  const def = FRESHMAN_HANDWRITTEN[2];
  assert.equal(def.role, 'middle'); // 接班大山（憲法 Q2：位置呼應畢業者）
  assert.ok(def.id && def.name && def.fullName && def.attributes);
});
