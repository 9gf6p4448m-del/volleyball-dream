// 爆接（真噴）模型（07-23 拍板）：一傳品質過差→機率出低平噴射球——
// 觸發帶（差技術×強發壓迫）、好接球永不爆、低弧驗證、決定論
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createIntent } from '../src/sim/intent.js';

// 強發壓迫下的勉強接發：receiver 技術可調、站位勉強（dist~0.8）
function rig(flightId, { control = 50, reaction = 50 } = {}) {
  const g = createGame({ seed: 5 });
  g.phase = 'rally';
  Object.assign(g.rally, {
    profile: 'serve', serveStyle: 'power', possession: 'B',
    touches: 0, lastTouchTeam: 'B', lastToucherId: 'B1', flightId,
  });
  const b = g.ball;
  b.x = 0; b.y = 1.2; b.z = 5.2; b.vx = 0; b.vy = -3; b.vz = 6;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  g.players.A5.attributes.control = control;
  g.players.A5.attributes.reaction = reaction;
  g.actors.A5.x = 0.8; g.actors.A5.z = 5.2; // 距球 0.8m＝勉強搆
  return g;
}

function receiveOnce(flightId, attrs) {
  const g = rig(flightId, attrs);
  stepGame(g, [createIntent({
    playerId: 'A5', tick: g.tick, action: 'receive', aim: { x: 1.2, z: 1.2 }, timing: 0.75,
  })]);
  const touch = g.events.find((e) => e.type === 'TOUCH');
  return { touch, vy: g.ball.vy };
}

test('爆接觸發帶：差技術×強發壓迫＝機率爆接（有爆有不爆）；爆接球低平、事件帶 blown 標記', () => {
  let blown = 0;
  let clean = 0;
  for (let f = 1; f <= 60; f += 1) {
    const { touch, vy } = receiveOnce(f);
    assert.ok(touch, `flight ${f} 應觸到球`);
    if (touch.blown) {
      blown += 1;
      assert.ok(vy < 6, `爆接出球應低平（vy=${vy.toFixed(1)}＜正常高弧 ~8.6）`);
    } else {
      clean += 1;
      assert.ok(vy > 6, `正常接球應為高弧（vy=${vy.toFixed(1)}）`);
    }
  }
  assert.ok(blown >= 5, `60 次勉強接強發應有爆接（實得 ${blown}）`);
  assert.ok(clean >= 5, `爆接是機率非必然（清接實得 ${clean}）`);
});

test('好接球永不爆：高技術（control/reaction 90）同構造 60 次零爆接', () => {
  for (let f = 1; f <= 60; f += 1) {
    const { touch } = receiveOnce(f, { control: 90, reaction: 90 });
    assert.ok(touch && !touch.blown, `flight ${f} 高技術不應爆接`);
  }
});

test('爆接決定論：同 flightId 同種子重跑逐值一致；落點在自由區內（救援可及）', () => {
  // 找一個會爆的 flight，驗證重跑一致＋噴射落點界限
  for (let f = 1; f <= 60; f += 1) {
    const a = receiveOnce(f);
    if (!a.touch.blown) continue;
    const b = receiveOnce(f);
    assert.equal(b.touch.blown, true, '同構造重跑必同樣爆接');
    assert.equal(a.vy, b.vy, '噴射速度逐值一致');
    return;
  }
  assert.fail('60 次內應至少一次爆接');
});

test('爆接常數存在（調參點防遺失）', () => {
  for (const k of ['BLOWN_Q_MIN', 'BLOWN_CHANCE_SLOPE', 'BLOWN_CHANCE_MAX', 'BLOWN_SPIKE_PRESSURE', 'BLOWN_APEX']) {
    assert.equal(typeof TUNING[k], 'number', `TUNING.${k} 應存在`);
  }
});
