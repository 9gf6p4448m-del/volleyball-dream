// direct-v4 receive platform choice: retired in direct-v8 stage 1 (section 4 A/C:
// A1, A2, A3, A3b, A4, A6, A6b, A7, A15, A17, L1; A14/A16/A16b folded into R8).
// A5 (replay determinism) stays.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDirectGame, stepDirectGame, snapshotDirectGame, restoreDirectGame,
  serializeDirectState, replayDirectTape,
} from '../src/sim/directGame.js';

const cmd = (s, action = null, extra = {}) => ({
  tick: s.tick, sequence: 0, move: { x: 0, z: 0 }, aim: { x: 0, z: -1 }, action, ...extra,
});

test('A5 含 passType 的錄影整卷重播與逐 tick 還原逐位元相同，direct-v6 拒絕', () => {
  // Two tapes: the original mid-windup change (LEFT then HIGH) and LEFT held
  // throughout, so a dropped passLateral is visible at the restore points.
  for (const choose of [t => (t < 31 ? 'LEFT' : 'HIGH'), () => 'LEFT']) {
    const s = createDirectGame(); s.player.x = -0.3;
    const initial = snapshotDirectGame(s), commands = [], states = [];
    for (let t = 0; t < 90; t++) {
      const c = cmd(s, t === 0 ? 'feed' : t === 29 ? 'receive' : null, { passType: choose(t) });
      commands.push(c); stepDirectGame(s, [c]); states.push(snapshotDirectGame(s));
    }
    assert.equal(s.stats.contacts > 0, true);
    for (let from = 0; from < states.length - 1; from += 7) {
      const restored = restoreDirectGame(states[from]);
      for (let t = restored.tick; t < s.tick; t++) {
        stepDirectGame(restored, [commands[t]]);
        assert.equal(serializeDirectState(restored), serializeDirectState(states[t]));
      }
    }
    assert.equal(serializeDirectState(replayDirectTape({ simulationVersion: 'direct-v8.1', initial, commands, endTick: s.tick })), serializeDirectState(s));
    assert.throws(() => restoreDirectGame({ ...initial, simulationVersion: 'direct-v6' }));
    assert.throws(() => restoreDirectGame({ ...initial, simulationVersion: 'direct-v7' }));
    assert.throws(() => replayDirectTape({ simulationVersion: 'direct-v7', initial, commands, endTick: 10 }));
  }
});
