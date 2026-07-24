// Phase 3 W7 — D 舊隊情結測試：D1 動態賽前事件（去重）、D2 trustDyn 開場 +8
// （careerMatchSetup → createGame 注入、場末即散＝不寫回任何持久層）、D3 播報
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCareer, createCareerPlayer, careerMatchSetup, recordResult,
} from '../src/career/careerState.js';
import { oldTeamPreEvents, recordEvent } from '../src/career/events.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { buildRecruitMember } from '../src/career/recruitment.js';
import { createGame } from '../src/sim/game.js';
import { TRUST_DYN, effectiveTrust } from '../src/sim/trust.js';
import { createCommentary } from '../src/ui/commentary.js';

function rosterWithObsidianRecruit() {
  const members = buildStarterMembers();
  members.push(buildRecruitMember('obsidian', 5, 'R1')); // dna.teamId＝obsidian
  return { capacity: 12, members };
}

test('D1：對戰原隊→動態賽前事件（speaker＝隊友名）；入帳後去重', () => {
  let career = createCareer({ seed: 5, playerName: '測' });
  // 推進到 group-3（曜石）：先記兩場結果
  career = recordResult(career, { matchId: 'group-1', won: true, scoreFor: 25, scoreAgainst: 20 });
  career = recordResult(career, { matchId: 'group-2', won: true, scoreFor: 25, scoreAgainst: 20 });
  const roster = rosterWithObsidianRecruit();
  const evs = oldTeamPreEvents(career, roster);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].moment, 'pre');
  const recruitName = roster.members.find((m) => m.id === 'R1').name;
  assert.equal(evs[0].lines[0].speaker, recruitName);
  assert.ok(evs[0].lines[0].text.includes('曜石')); // 模板帶原隊名
  // 入帳後不重播（每人對原隊一生一次）
  const after = recordEvent(career, evs[0].id);
  assert.equal(oldTeamPreEvents(after, roster).length, 0);
  // 非原隊對戰（group-1 北原）＝零事件
  const fresh = createCareer({ seed: 5, playerName: '測' });
  assert.equal(oldTeamPreEvents(fresh, roster).length, 0);
});

test('D2：careerMatchSetup 產 trustDynInit +8 與 revenge；非原隊對戰兩者皆無', () => {
  const career = createCareer({ seed: 5, playerName: '測' });
  const player = createCareerPlayer('測');
  const roster = rosterWithObsidianRecruit();
  const vs = (opponentId, id) => careerMatchSetup(
    career, player, { id, opponentId, stage: 'group' }, roster, null,
  );
  const setup = vs('obsidian', 'group-3');
  assert.deepEqual(setup.trustDynInit, { R1: TRUST_DYN.OLD_TEAM_BOOST });
  assert.equal(setup.revenge.length, 1);
  assert.equal(setup.revenge[0].id, 'R1');
  const other = vs('north-tech', 'group-1');
  assert.equal(other.trustDynInit, undefined);
  assert.equal(other.revenge, undefined);
});

test('D2：createGame({trustDynInit}) 預載場內動態；未傳＝空（零擾動）', () => {
  const g = createGame({ seed: 7, trustDynInit: { A3: 8 } });
  assert.equal(g.trustDyn.A3, 8);
  assert.equal(
    effectiveTrust(g, g.players.A3),
    Math.min(100, g.players.A3.trust.fromSetter + 8),
  );
  const plain = createGame({ seed: 7 });
  assert.deepEqual(plain.trustDyn, {});
});

test('D3：復仇者首次建功播報一次；開賽環境句帶老東家', () => {
  const g = createGame({ seed: 7 });
  const c = createCommentary({ name: '曜石體中', trait: 'x' }, [{ id: 'A3', name: '小磐' }]);
  // 開賽 0:0 環境句＝舊隊情結句
  const opening = c.line(g, null, 'A2', 0);
  assert.ok(opening.text.includes('小磐') && opening.text.includes('曜石體中'));
  // 建功：A3（復仇者）最後觸球＋A 隊得分 → 播一次；再次建功不重播
  const feed = (now) => c.onEvents([
    { type: 'TOUCH', tick: 1, team: 'A', playerId: 'A3', kind: 'spike' },
    { type: 'SCORE', tick: 1, team: 'A' },
  ], g, null, now, 'A2');
  g.match.score.A = 1;
  feed(1000);
  const gameName = g.players.A3.name; // 播報名取自 game 內建名（與其他播報一致）
  assert.ok(c.line(g, null, 'A2', 1001).text.includes(`${gameName} 向老東家證明自己`));
  g.match.score.A = 2;
  feed(20000); // 第二次建功（前一 beat 已過期）
  assert.ok(!c.line(g, null, 'A2', 20001).text.includes('向老東家'));
});
