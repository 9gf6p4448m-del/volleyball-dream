// Phase 2 stage 6 — 自由人：後排自動替換 MB、不得攻擊/攔網/發球、板凳停放
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createIntent } from '../src/sim/intent.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { COURT } from '../src/sim/constants.js';
import {
  createCareer, createCareerPlayer, careerMatchSetup, buildLibero, nextMatch,
} from '../src/career/careerState.js';

const LIBS = () => ({ A: buildLibero('A', 'A隊自由人'), B: buildLibero('B', 'B隊自由人') });

test('開局即替換：自由人佔後排 MB 槽、被換 MB 停板凳、事件入日誌', () => {
  const g = createGame({ seed: 3, liberos: LIBS() });
  for (const team of ['A', 'B']) {
    const rot = g.match.rotations[team];
    const li = rot.indexOf(`${team}L`);
    assert.ok(li >= 4, `${team} 自由人應在後排（idx ${li}）`);
    const benched = g.liberos[team].replacedId;
    assert.equal(g.players[benched].currentRole, 'middle');
    assert.ok(!rot.includes(benched), '被替換的 MB 不在輪轉上');
    assert.ok(Math.abs(g.actors[benched].z) > COURT.LENGTH / 2, 'MB 停放場外板凳');
  }
  assert.equal(Object.keys(g.players).length, 14); // 6+6+雙方自由人
  assert.ok(g.events.some((e) => e.type === 'LIBERO_SWAP'));
});

test('整局不變式：自由人永不前排/永不發球/永不攔網/永不高球攻擊', () => {
  const g = createGame({ seed: 7, liberos: LIBS(), setTarget: 15 });
  const ai = createAiState();
  let swaps = 0;
  while (g.phase !== 'set_over' && g.tick < 400000) {
    for (const e of stepGame(g, aiCollectIntents(g, ai))) {
      assert.ok(!(e.type === 'SERVE' && e.playerId.endsWith('L')), '自由人不得發球');
      assert.ok(!(e.type === 'BLOCK_TOUCH' && e.playerId.endsWith('L')), '自由人不得攔網');
      if (e.type === 'TOUCH' && e.playerId.endsWith('L') && e.kind === 'spike') {
        assert.ok(e.ballY <= COURT.NET_HEIGHT, '自由人不得完成高於網的攻擊');
      }
    }
    if (g.phase === 'serve') {
      for (const team of ['A', 'B']) {
        const li = g.match.rotations[team].indexOf(`${team}L`);
        assert.ok(li === -1 || li >= 4,
          `發球時自由人不得在前排/發球位（${team} idx ${li} tick ${g.tick}）`);
        // 恆等式：替換中＝自由人在陣、被換者下場；未替換＝自由人不在陣
        const lib = g.liberos[team];
        const rot = g.match.rotations[team];
        if (lib.replacedId !== null) {
          assert.ok(rot.includes(lib.liberoId) && !rot.includes(lib.replacedId));
        } else {
          assert.ok(!rot.includes(lib.liberoId));
        }
      }
    }
  }
  swaps = g.events.filter((e) => e.type === 'LIBERO_SWAP').length;
  assert.equal(g.phase, 'set_over', '有自由人的比賽要能正常打完');
  assert.ok(swaps >= 4, `整局應多次進出替換（實得 ${swaps}）`);
  assert.equal(g.match.rotations.A.length, 6, '輪轉恆為六人');
});

test('自由人觸球規則：高球扣殺被擋、低球處理/接球正常', () => {
  const rig = () => {
    const g = createGame({ seed: 5, liberos: LIBS() });
    g.phase = 'rally';
    Object.assign(g.rally, {
      profile: 'arc', possession: 'A', touches: 1,
      lastTouchTeam: 'A', lastToucherId: 'A1', touchLockTick: -1,
    });
    g.actors.AL.x = 0;
    g.actors.AL.z = 5;
    const b = g.ball;
    b.x = 0; b.z = 5; b.vx = 0; b.vy = -1; b.vz = 0;
    return g;
  };
  // 高於網：扣殺被規則擋下
  const g1 = rig();
  g1.ball.y = COURT.NET_HEIGHT + 0.4;
  g1.ball.py = g1.ball.y;
  stepGame(g1, [createIntent({ playerId: 'AL', tick: g1.tick, action: 'spike', aim: { x: 0, z: -5 } })]);
  assert.ok(!g1.events.some((e) => e.type === 'TOUCH' && e.playerId === 'AL'));
  // 一般接球正常
  const g2 = rig();
  g2.ball.y = 1.2;
  g2.ball.py = 1.2;
  stepGame(g2, [createIntent({ playerId: 'AL', tick: g2.tick, action: 'receive', aim: { x: 1, z: 1 } })]);
  assert.ok(g2.events.some((e) => e.type === 'TOUCH' && e.playerId === 'AL' && e.kind === 'receive'));
});

test('生涯接線：雙方自由人入場、對方吃參數檔強度', () => {
  const c = createCareer({ seed: 9 });
  const setup = careerMatchSetup(c, createCareerPlayer('小夢'), nextMatch(c));
  assert.equal(setup.liberos.A.currentRole, 'libero');
  assert.equal(setup.liberos.A.name, '小守');
  assert.ok(setup.liberos.B.name.startsWith('北原工商'));
  assert.ok(setup.liberos.B.attributes.reaction >= 60, '對方自由人吃 level 加成');
  assert.equal(buildLibero('A', 'x').attributes.jump, 40); // 防守專才：攻擊系低
});
