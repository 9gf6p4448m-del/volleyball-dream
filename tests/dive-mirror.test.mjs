// W6.1 隊友魚躍鏡像測試（拍板 07-24 Q2-A）：生涯隊伍（先發/板凳/自由人）的
// techniques.dive 鏡像主角解鎖——「對手教主角→主角教全隊」機制化；未解鎖前
// 救噴必撲路徑（ai.js rescue 繞過 diveRate）也被 executeTouch/意圖層技能閘擋住。
// 對手隊與快速比賽（無名冊）不受影響（sim 預設全開）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCareer, createCareerPlayer, careerMatchSetup,
} from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';

function setupWith(dive) {
  const career = createCareer({ seed: 11, playerName: '測' });
  const player = createCareerPlayer('測');
  player.techniques.dive = dive;
  const roster = { capacity: 12, members: buildStarterMembers() };
  return careerMatchSetup(career, player, career.schedule[0], roster, null);
}

test('未解鎖：先發隊友/自由人 dive=0；對手隊維持預設 1', () => {
  const setup = setupWith(0);
  for (const p of setup.teams.A) {
    if (p.id === 'A2') continue; // 主角本體（dive=0 由 createCareerPlayer 供給）
    assert.equal(p.techniques.dive, 0, `${p.id} 應未解鎖`);
  }
  assert.equal(setup.liberos.A.techniques.dive, 0, '我方自由人應未解鎖');
  for (const p of setup.teams.B) assert.equal(p.techniques.dive, 1, `${p.id} 對手不受影響`);
  assert.equal(setup.liberos.B.techniques.dive, 1, '對手自由人不受影響');
});

test('已解鎖：先發/板凳/自由人 dive=1（教全隊生效）', () => {
  const setup = setupWith(1);
  for (const p of setup.teams.A) assert.equal(p.techniques.dive, 1, `${p.id} 應已解鎖`);
  for (const p of setup.benches.A) assert.equal(p.techniques.dive, 1, `板凳 ${p.id} 應已解鎖`);
  assert.equal(setup.liberos.A.techniques.dive, 1);
});

test('板凳鏡像：未解鎖時板凳 dive=0（換上場也不會撲）', () => {
  const career = createCareer({ seed: 12, playerName: '測' });
  const player = createCareerPlayer('測'); // dive 0
  const roster = { capacity: 12, members: buildStarterMembers() };
  // 加一名非先發成員進板凳
  roster.members.push({
    id: 'R1', name: '測板凳', origin: 'obsidian', role: 'middle', height: 1.9,
    attributes: {
      jump: 60, power: 60, reaction: 60, stamina: 60,
      speed: 60, control: 60, serve: 60, block: 60,
    },
    growth: { grade: 2, xp: {}, log: [] },
    dna: { teamId: 'obsidian', style: 'quick', tag: '曜石體中' },
  });
  const setup = careerMatchSetup(career, player, career.schedule[0], roster, null);
  const bench = setup.benches.A.find((p) => p.id === 'R1');
  assert.ok(bench, 'R1 應在板凳');
  assert.equal(bench.techniques.dive, 0);
});

test('快速比賽（無名冊）：隊伍走預設建隊，dive 維持全開不受鏡像影響', () => {
  const career = createCareer({ seed: 13, playerName: '測' });
  const player = createCareerPlayer('測');
  const setup = careerMatchSetup(career, player, career.schedule[0], null, null);
  for (const p of setup.teams.A) {
    if (p.id === player.id) continue;
    assert.equal(p.techniques.dive, 1, `${p.id} 預設隊員維持全開`);
  }
});
