// Phase 3 W6 — 賽中換人（B1 簡化版）＋ 7.7 輪轉錯誤接線（B4）測試：
// 零擾動（帶板凳不換人＝事件流逐位一致）、applySubstitution 合法路徑與驗證閘、
// 登記發球序槽位繼承（換人後合法發球不誤吹）、違序偵測與 7.7.2 賽末追溯扣分、
// careerMatchSetup 板凳建隊。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, applySubstitution, TUNING } from '../src/sim/game.js';
import { createPlayer } from '../src/sim/player.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { cancelFaultPoints } from '../src/sim/rotationRules.js';
import {
  createCareer, createCareerPlayer, careerMatchSetup,
} from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { buildRecruitMember } from '../src/career/recruitment.js';

const benchPlayer = (id, role = 'outside') => createPlayer({
  id, name: `板凳${id}`, teamId: 'A', naturalRole: role, currentRole: role,
  height: 1.87, trust: 20,
  attributes: {
    jump: 55, power: 55, reaction: 55, stamina: 55,
    speed: 55, control: 55, serve: 55, block: 55,
  },
});

function playUntil(g, ai, pred, maxTicks = 200000) {
  const all = [];
  while (!pred(g) && g.tick < maxTicks && g.phase !== 'set_over') {
    all.push(...stepGame(g, aiCollectIntents(g, ai)));
  }
  return all;
}

function playFullSet(g, ai) {
  const all = [];
  while (g.phase !== 'set_over' && g.tick < 400000) {
    all.push(...stepGame(g, aiCollectIntents(g, ai)));
  }
  return all;
}

test('零擾動：帶板凳不換人＝事件流與比分逐位一致（決定論不變式）', () => {
  const run = (withBench) => {
    const g = createGame({
      seed: 4242, setTarget: 15,
      ...(withBench ? { benches: { A: [benchPlayer('A7'), benchPlayer('A8', 'middle')] } } : {}),
    });
    const events = playFullSet(g, createAiState());
    return { events, score: g.match.score, winner: g.match.winner };
  };
  const a = run(false);
  const b = run(true);
  assert.deepEqual(b.score, a.score);
  assert.equal(b.winner, a.winner);
  assert.equal(JSON.stringify(b.events), JSON.stringify(a.events));
});

test('applySubstitution：合法換人——輪轉/板凳/人次/事件/發球序全同步', () => {
  const g = createGame({ seed: 7, setTarget: 15, benches: { A: [benchPlayer('A7')] } });
  const ai = createAiState();
  // 打到第一次死球後的發球窗（tick>0 才有意義；開局本來就是 serve）
  playUntil(g, ai, (s) => s.match.score.A + s.match.score.B >= 1 && s.phase === 'serve');
  assert.equal(g.phase, 'serve');
  const rot = g.match.rotations.A;
  const outId = rot.find((id) => id !== 'AL'); // 任一場上球員（避開自由人）
  const idx = rot.indexOf(outId);
  const r = applySubstitution(g, { team: 'A', outId, inId: 'A7' });
  assert.equal(r.ok, true, r.reason);
  assert.equal(g.match.rotations.A[idx], 'A7');
  assert.equal(g.subs.A.remaining, TUNING.SUBS_PER_SET - 1);
  assert.ok(g.bench.A.includes(outId) && !g.bench.A.includes('A7'));
  assert.ok(g.events.some((e) => e.type === 'SUBSTITUTION' && e.inId === 'A7' && e.outId === outId));
  // 登記發球序槽位繼承：換上者接手發球輪次
  assert.ok(g.serveSeq.A.order.includes('A7') && !g.serveSeq.A.order.includes(outId));
  // 換人後打完全場：合法路徑永不觸發 7.7（換人＝登記序同步更新）
  playFullSet(g, ai);
  assert.ok(!g.events.some((e) => e.type === 'ROTATION_FAULT')); // state.events＝完整日誌
  assert.equal(g.rotationFault.A, null);
});

test('applySubstitution：驗證閘——rally/額度/板凳/場上/自由人逐項擋下', () => {
  const g = createGame({ seed: 11, setTarget: 15, benches: { A: [benchPlayer('A7')] } });
  const ai = createAiState();
  const onCourt = () => g.match.rotations.A.find((id) => id !== 'AL');
  // rally 中不可換
  playUntil(g, ai, (s) => s.phase === 'rally');
  assert.equal(applySubstitution(g, { team: 'A', outId: onCourt(), inId: 'A7' }).reason, 'not-dead-ball');
  // 回到死球窗
  playUntil(g, ai, (s) => s.phase === 'serve');
  // 非板凳球員不可換入
  assert.equal(applySubstitution(g, { team: 'A', outId: onCourt(), inId: 'B1' }).reason, 'unknown');
  // 不在場上的不可換下（A7 在板凳、不在輪轉）
  assert.equal(applySubstitution(g, { team: 'A', outId: 'A7', inId: 'A7' }).reason, 'not-on-court');
  // 自由人不可經一般換人（AL 在場上時嘗試換下）
  if (g.match.rotations.A.includes('AL')) {
    assert.equal(applySubstitution(g, { team: 'A', outId: 'AL', inId: 'A7' }).reason, 'libero');
  }
  // 額度歸零擋下（直接清額度模擬用盡）
  g.subs.A.remaining = 0;
  assert.equal(applySubstitution(g, { team: 'A', outId: onCourt(), inId: 'A7' }).reason, 'limit');
});

test('B1 不限原對：被換下者可再進場（吃額度不吃配對）', () => {
  const g = createGame({ seed: 13, setTarget: 15, benches: { A: [benchPlayer('A7')] } });
  const ai = createAiState();
  playUntil(g, ai, (s) => s.match.score.A + s.match.score.B >= 1 && s.phase === 'serve');
  const outId = g.match.rotations.A.find((id) => id !== 'AL');
  assert.equal(applySubstitution(g, { team: 'A', outId, inId: 'A7' }).ok, true);
  // 同一死球窗把原球員換回（換誰下都行——這裡換回原槽）
  assert.equal(applySubstitution(g, { team: 'A', outId: 'A7', inId: outId }).ok, true);
  assert.equal(g.subs.A.remaining, TUNING.SUBS_PER_SET - 2);
  assert.ok(g.match.rotations.A.includes(outId));
});

test('7.7 違序（最後防線）：繞過 API 竄改輪轉→ROTATION_FAULT＋賽末追溯扣分', () => {
  const g = createGame({ seed: 21, setTarget: 15 });
  const ai = createAiState();
  // 開局發球窗直接對調 A 隊 1、2 號位（未經 applySubstitution＝未登記）
  const rot = g.match.rotations.A;
  [rot[0], rot[1]] = [rot[1], rot[0]];
  playFullSet(g, ai);
  const all = g.events; // state.events＝完整日誌（stepGame 回傳流是它的子集，勿 concat）
  const fault = all.find((e) => e.type === 'ROTATION_FAULT');
  assert.ok(fault, '違序未被偵測');
  assert.equal(fault.team, 'A');
  assert.equal(g.rotationFault.A, fault.tick);
  // 只記第一次
  assert.equal(all.filter((e) => e.type === 'ROTATION_FAULT').length, 1);
  // 賽末追溯：ROTATION_ADJUST＝cancelFaultPoints 的結果如實落到 match.score
  const adjust = all.find((e) => e.type === 'ROTATION_ADJUST');
  assert.ok(adjust, '賽末未追溯');
  const expect = cancelFaultPoints(all, fault.tick, 'A');
  assert.equal(g.match.score.A, expect.score.A);
  assert.equal(adjust.cancelled, expect.cancelled);
  assert.equal(g.match.winner, g.match.score.A > g.match.score.B ? 'A' : 'B');
});

test('careerMatchSetup：板凳＝名冊非先發非自由人成員；快速比賽無板凳', () => {
  const career = createCareer({ seed: 5, playerName: '測' });
  const player = createCareerPlayer('測');
  const members = buildStarterMembers();
  // 加兩名招募生（一名球員＋一名自由人）——自由人不得進板凳
  members.push(buildRecruitMember('obsidian', 5, 'R1'));
  members.push(buildRecruitMember('white-wave', 5, 'R2')); // libero 角色
  const setup = careerMatchSetup(career, player, career.schedule[0], { capacity: 12, members }, null);
  const benchIds = setup.benches.A.map((p) => p.id);
  assert.ok(benchIds.includes('R1'), '招募生應在板凳');
  assert.ok(!benchIds.includes('R2'), 'libero 角色不得進板凳');
  assert.ok(!benchIds.includes('AL'), '現任自由人不得進板凳');
  for (const id of setup.teams.A.map((p) => p.id)) {
    assert.ok(!benchIds.includes(id), '先發不得同時在板凳');
  }
  assert.deepEqual(setup.benches.B, []);
  // 快速比賽（無名冊）＝零板凳
  const quick = careerMatchSetup(career, player, career.schedule[0], null, null);
  assert.deepEqual(quick.benches, { A: [], B: [] });
});
