// Phase 4 W1 — 對手 ace 畢業遞補鏈（憲法 Q4：applyPoaching 同款純函式路徑）
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySeasonRoster, graduatingAces, currentGrade, careerMatchSetup,
  createCareer, createCareerPlayer, opponentById,
} from '../src/career/careerState.js';
import { OPPONENTS } from '../src/career/opponents.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { buildRecruitMember } from '../src/career/recruitment.js';

test('applySeasonRoster：第 1 屆恆等；第 2 屆四名三年級 ace 換臉（接班人頂槽＋新稱號＋板凳減員）', () => {
  for (const o of OPPONENTS) {
    assert.equal(applySeasonRoster(o, 1), o, `${o.id} 第 1 屆不得變`);
  }
  const cases = [
    ['obsidian', '古承岳', '第二支箭'],
    ['sky-hawk', '馬振羽', '逐空者'],
    ['gale-shore', '侯俊帆', '起風點'],
    ['black-pine', '姚松霖', '下一堵牆'],
  ];
  for (const [id, heir, title] of cases) {
    const base = opponentById(id);
    const s2 = applySeasonRoster(base, 2);
    assert.equal(s2.ace.name, heir, `${id} 新 ace 應為 ${heir}`);
    assert.equal(s2.ace.title, title);
    assert.equal(s2.squad[s2.ace.slot], heir, '接班人須頂上原槽位');
    assert.ok(!s2.squad.includes(base.ace.name), '畢業 ace 不得留在名單');
    assert.equal(s2.reserves.length, 3, '接班人自板凳移除');
    assert.equal(s2.grades[s2.ace.slot], 1, '接班人基準年級 1');
    assert.equal(base.reserves.length, 4, '原參數檔不可變');
    assert.equal(base.ace.name === s2.ace.name, false);
  }
  // 非三年級 ace 隊伍第 2 屆不動
  for (const id of ['north-tech', 'white-wave', 'iron-mist']) {
    assert.equal(applySeasonRoster(opponentById(id), 2), opponentById(id), `${id} 第 2 屆不得換臉`);
  }
});

test('applySeasonRoster：第 3 屆——鐵霧（基準 2 的劉振鎧）換臉；已換臉隊維持接班人', () => {
  const iron = applySeasonRoster(opponentById('iron-mist'), 3);
  assert.equal(iron.ace.name, '彭冠銘');
  assert.equal(iron.ace.title, '新彈道');
  assert.ok(!iron.squad.includes('劉振鎧'));
  const obsidian = applySeasonRoster(opponentById('obsidian'), 3);
  assert.equal(obsidian.ace.name, '古承岳'); // 接班人基準 1＝第 3 屆恰三年級，仍在任
});

test('graduatingAces：第 1 屆末＝拍板四人；第 2 屆末＝劉振鎧；含接班人資訊', () => {
  const s1 = graduatingAces(1);
  assert.deepEqual(s1.map((a) => a.name).sort(), ['曾家松', '王勝翔', '簡子嵐', '詹子曜'].sort());
  for (const a of s1) assert.ok(a.heir?.name && a.heir?.title, `${a.name} 缺接班人資訊`);
  const s2 = graduatingAces(2);
  assert.deepEqual(s2.map((a) => a.name), ['劉振鎧']);
});

test('careerMatchSetup 屆數整合：第 2 屆對曜石＝新 ace 建隊、板凳 3 名；第 1 屆原樣', () => {
  const career = createCareer({ seed: 11, playerName: '測' });
  const player = createCareerPlayer('測');
  const entry = career.schedule.find((m) => m.opponentId === 'obsidian');
  const roster = { capacity: 12, members: buildStarterMembers() };
  const s1 = careerMatchSetup(career, player, entry, roster, null, 1);
  assert.equal(s1.opponent.ace.name, '詹子曜');
  assert.ok(s1.teams.B.some((p) => p.name === '詹子曜'));
  assert.equal(s1.benches.B.length, 4);
  const s2 = careerMatchSetup(career, player, entry, roster, null, 2);
  assert.equal(s2.opponent.ace.name, '古承岳');
  assert.ok(!s2.teams.B.some((p) => p.name === '詹子曜'), '畢業 ace 不得出賽');
  assert.equal(s2.benches.B.length, 3);
  // 省略屆數＝第 1 屆行為（既有呼叫端相容）
  const dflt = careerMatchSetup(career, player, entry, roster, null);
  assert.equal(dflt.opponent.ace.name, '詹子曜');
});

test('校友還魂防線：畢業的招募生（非 ace）不得回到原隊名單，槽位由遞補頂上', () => {
  const career = createCareer({ seed: 12, playerName: '測' });
  const player = createCareerPlayer('測');
  const entry = career.schedule.find((m) => m.opponentId === 'obsidian');
  // 情境：許嘉碩（obsidian-2，MB 槽 5）曾被招募、已畢業入 alumni——現役名冊無他
  const gone = buildRecruitMember('obsidian-2', 12, 'R1');
  const roster = {
    capacity: 12,
    members: buildStarterMembers(),
    alumni: [{ member: gone, seasonIndex: 2 }],
  };
  const setup = careerMatchSetup(career, player, entry, roster, null, 3);
  const allB = [...setup.teams.B.map((p) => p.name), ...setup.benches.B.map((p) => p.name)];
  assert.ok(!allB.includes('許嘉碩'), '畢業校友不得還魂回原隊');
  assert.ok(setup.teams.B.length === 6, '槽位仍滿編（遞補頂上）');
});

test('currentGrade 換算：基準 + 屆數 − 1', () => {
  assert.equal(currentGrade(1, 1), 1);
  assert.equal(currentGrade(1, 3), 3);
  assert.equal(currentGrade(3, 2), 4);
});
