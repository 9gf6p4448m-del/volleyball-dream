// Phase 4 W1 — A1 對手疲勞換人（ai.aiSubstitutionWanted 判準＋sim 唯一路徑整合）
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applySubstitution } from '../src/sim/game.js';
import { aiSubstitutionWanted } from '../src/sim/ai.js';
import {
  createCareer, createCareerPlayer, careerMatchSetup,
} from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';

// 生涯鏡像建局（matchConfig 同款：對手 costMul 0.6＋豁免重度門檻）
function buildGame(seed = 21) {
  const career = createCareer({ seed, playerName: '測' });
  const player = createCareerPlayer('測');
  const setup = careerMatchSetup(
    career, player, career.schedule[0], { capacity: 12, members: buildStarterMembers() }, null, 1,
  );
  return createGame({
    seed: setup.seed,
    teams: setup.teams,
    aiProfiles: setup.aiProfiles,
    liberos: setup.liberos,
    benches: setup.benches,
    stamina: { A: {}, B: { costMul: 0.6, heavyExempt: true } },
  });
}

test('aiSubstitutionWanted：場上最累者跌破門檻＋板凳同角色體力充足＝提出換人；決定論', () => {
  const g = buildGame();
  assert.equal(g.phase, 'serve');
  assert.equal(aiSubstitutionWanted(g, 'B'), null); // 全員滿體力＝不換
  const mbId = g.match.rotations.B[2]; // ROLE_ORDER 槽 2＝MB
  g.stamina[mbId] = 0.2; // 重度疲勞
  const want = aiSubstitutionWanted(g, 'B');
  assert.ok(want, '應提出換人');
  assert.equal(want.outId, mbId);
  assert.equal(g.players[want.inId].currentRole, 'middle', '換上者須同角色');
  assert.ok(g.bench.B.includes(want.inId));
  // 決定論：同狀態同輸出
  assert.deepEqual(aiSubstitutionWanted(g, 'B'), want);
  // 執行走 sim 唯一路徑
  const r = applySubstitution(g, { team: 'B', ...want });
  assert.equal(r.ok, true);
  assert.ok(g.match.rotations.B.includes(want.inId));
  assert.ok(g.bench.B.includes(mbId), '被換下者回板凳');
});

test('aiSubstitutionWanted 邊界：板凳同樣疲勞（差距不足）不換、額度用盡不換、無體力系統不換', () => {
  const g = buildGame();
  const mbId = g.match.rotations.B[2];
  g.stamina[mbId] = 0.2;
  const bench = g.bench.B.find((id) => g.players[id].currentRole === 'middle');
  g.stamina[bench] = 0.3; // 差距 < SUB_MARGIN＝換了沒意義
  assert.equal(aiSubstitutionWanted(g, 'B'), null);
  g.stamina[bench] = 1;
  g.subs.B.remaining = 0; // 額度用盡
  assert.equal(aiSubstitutionWanted(g, 'B'), null);
  g.subs.B.remaining = 6;
  const noSta = createGame({ seed: 5 }); // 無體力系統（快速比賽預設路徑無板凳）
  assert.equal(aiSubstitutionWanted(noSta, 'B'), null);
});

test('板凳深度差異可感：弱隊（北原）換上者能力降幅大於強隊（天鷹）', () => {
  const career = createCareer({ seed: 22, playerName: '測' });
  const player = createCareerPlayer('測');
  const roster = { capacity: 12, members: buildStarterMembers() };
  const weak = careerMatchSetup(
    career, player, { id: 'group-1', opponentId: 'north-tech', stage: 'group' }, roster, null, 1,
  );
  const strong = careerMatchSetup(
    career, player, { id: 'national-final', opponentId: 'sky-hawk', stage: 'national' }, roster, null, 1,
  );
  const dropOf = (setup) => {
    const lvl = setup.opponent.level;
    return setup.benches.B.map((b) => {
      const r = setup.opponent.reserves.find((x) => x.name === b.name);
      return r.drop;
    });
  };
  const weakAvg = dropOf(weak).reduce((a, b) => a + b, 0) / 4;
  const strongAvg = dropOf(strong).reduce((a, b) => a + b, 0) / 4;
  assert.ok(weakAvg > strongAvg + 3, `弱隊板凳落差須明顯較大（弱 ${weakAvg} vs 強 ${strongAvg}）`);
});
