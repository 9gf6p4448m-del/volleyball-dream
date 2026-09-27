// direct-v4 receive platform choice: retired in direct-v8 stage 1 (section 4 A/C:
// A1, A2, A3, A3b, A4, A6, A6b, A7, A15, A17, L1). A5 (replay determinism)
// stays; A14, A16 and A16b are rewritten for the rules below (section 4 B,
// thresholds unchanged from 3e90288, pressed with the contextual hit button).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDirectGame, stepDirectGame, snapshotDirectGame, restoreDirectGame,
  serializeDirectState, replayDirectTape,
} from '../src/sim/directGame.js';
import { resolveHitAction } from '../src/sim/directReceiveRules.js';
import { windowScale } from '../src/sim/directReceiveAssist.js';
import { RECEIVE_ASSIST as A } from '../src/sim/directConstants.js';

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

// A14/A16/A16b (frozen 2026-09-24, rewritten 2026-09-27 for the rules): the
// playability grids on the real receive feed. The only press is the contextual
// hit button (v8 has one platform and no swipe).
// Denominator (Q4 ruling, 2026-09-27; the same meaning as 3e90288's
// `hit.active`): the first touch is a rule-judged touch on the forearms or
// hands (the sim puts the ball there) made while the pressed action's window
// offset was inside the timing window, |offset| ≤ goodTicks × windowScale(ball
// speed). In 3e90288 a press outside that window was a passive touch and not
// in the denominator; from v8 it is a spray (Q3), likewise not counted. A body
// deflection (no tier, not a spray) is never a rule-judged touch, so it is out
// of the denominator too (A16b ruling). Thresholds, grids and case counts are
// those of 3e90288.
// The A14d clause (the LOW platform must not mostly hit the net) has no rules
// counterpart: the up/down platform choice was retired with the swipe (P1).
const timed = (hit) => !!hit && !!(hit.tier || hit.spray) && ['forearm', 'hand'].includes(hit.part) &&
  hit.offset != null && Math.abs(hit.offset) <= A.goodTicks * windowScale(hit.ballSpeed);
function outcome(x, z, rt) {
  const s = createDirectGame(); s.player.x = x; s.player.z = z;
  let hit = null, apex = -Infinity;
  for (let t = 0; t < 240; t++) {
    stepDirectGame(s, [cmd(s, t === 0 ? 'feed' : t === rt ? resolveHitAction(s) : null)]);
    for (const e of s.events) {
      if (e.type === 'contact' && !hit) hit = e;
      if (['ground', 'net', 'out'].includes(e.type))
        return hit ? { active: timed(hit), end: e.type, x: s.ball.x, z: s.ball.z, apex } : null;
    }
    if (hit) apex = Math.max(apex, s.ball.y);
  }
  return null;
}
let gridRows = null;
function grid() {
  if (!gridRows) {
    gridRows = [];
    for (const x of [-0.2, -0.1, 0, 0.1, 0.2]) for (const z of [4.8, 5.0, 5.2]) for (let rt = 18; rt <= 40; rt++) {
      const r = outcome(x, z, rt);
      if (r?.active) gridRows.push(r);
    }
  }
  return gridRows;
}
const rate = (rows, f) => rows.filter(f).length / rows.length;

test('A14 到位球：少碰網、落在舉球區、弧頂夠高', () => {
  const n = grid();
  assert.ok(n.length >= 100, `enough active receives (${n.length})`);
  const net = rate(n, r => r.end === 'net');
  const zone = rate(n, r => r.end === 'ground' && r.z >= 0.5 && r.z <= 3 && Math.abs(r.x) <= 3);
  const apexes = n.map(r => r.apex).sort((a, b) => a - b), median = apexes[apexes.length >> 1];
  assert.ok(net <= 0.10, `A14a net ${net.toFixed(2)} (n=${n.length})`);
  assert.ok(zone >= 0.50, `A14b set zone ${zone.toFixed(2)} (n=${n.length})`);
  assert.ok(median >= 3.0, `A14c apex median ${median.toFixed(2)} (n=${n.length})`);
});

// Moving contacts: the first touch is a timed rule-judged receive (`timed`) while the body still moves.
function movingRows(cases) {
  const rows = [];
  for (const { x0, moveAt, rt } of cases) {
    const s = createDirectGame(); s.player.x = x0; s.player.z = 5.0;
    let hit = null, vx = 0;
    for (let t = 0; t < 240; t++) {
      stepDirectGame(s, [{ ...cmd(s, t === 0 ? 'feed' : t === rt ? resolveHitAction(s) : null), move: moveAt(t) }]);
      let end = null;
      for (const e of s.events) {
        if (e.type === 'contact' && !hit) { hit = e; vx = s.player.vx; }
        if (['ground', 'net', 'out'].includes(e.type)) end = e.type;
      }
      if (end) {
        if (timed(hit) && Math.abs(vx) >= 0.05) rows.push({ end, x: s.ball.x, z: s.ball.z });
        break;
      }
    }
  }
  return rows;
}
const movingCheck = (label, rows) => {
  assert.ok(rows.length >= 40, `enough moving contacts (${rows.length})`);
  const net = rows.filter(r => r.end === 'net').length / rows.length;
  const zone = rows.filter(r => r.end === 'ground' && r.z >= 0.5 && r.z <= 3 && Math.abs(r.x) <= 3).length / rows.length;
  assert.ok(net <= 0.10, `${label} moving net ${net.toFixed(2)} (n=${rows.length})`);
  assert.ok(zone >= 0.50, `${label} moving set zone ${zone.toFixed(2)} (n=${rows.length})`);
};

test('A16 邊移動邊接：觸球時仍在移動，不以碰網為主', () => {
  const cases = [];
  for (const x0 of [-0.6, -0.3, 0.3, 0.6]) for (const m of [0.1, 0.2, 0.3]) for (let rt = 18; rt <= 40; rt++)
    cases.push({ x0, rt, moveAt: (t) => (t >= 20 ? { x: -Math.sign(x0) * m, z: 0 } : { x: 0, z: 0 }) });
  movingCheck('A16', movingRows(cases));
});

test('A16b 邊移動邊接（放開搖桿減速中觸球）：碰網 ≤ 10%，舉球區 ≥ 50%', () => {
  // The third review's scenario verbatim: run toward the path at half stick from
  // tick 10 and release at various ticks, so contact often happens while braking.
  const cases = [];
  for (const dir of [-1, 1]) for (const x0 of [0.3, 0.6, 0.9, 1.2, 1.5]) for (const stop of [26, 30, 34, 38, 99]) for (let rt = 18; rt <= 40; rt++)
    cases.push({ x0: -dir * x0, rt, moveAt: (t) => ({ x: t >= 10 && t < stop ? dir * 0.5 : 0, z: 0 }) });
  movingCheck('A16b', movingRows(cases));
});
