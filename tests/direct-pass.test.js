// direct-v4 receive platform choice. Acceptance: docs/kickoffs/direct-v4-receive-swipe-acceptance.md
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDirectGame, stepDirectGame, getDirectPose, snapshotDirectGame, restoreDirectGame,
  serializeDirectState, replayDirectTape, DIRECT_DT,
} from '../src/sim/directGame.js';
import { DIRECT_ACTIONS, DIRECT_PHYSICS } from '../src/sim/directConstants.js';
import { createDirectControls } from '../src/input/directControls.js';

const TYPES = ['NEUTRAL', 'HIGH', 'LOW', 'LEFT', 'RIGHT'];
const cmd = (s, action = null, extra = {}) => ({
  tick: s.tick, sequence: 0, move: { x: 0, z: 0 }, aim: { x: 0, z: -1 }, action, ...extra,
});
const receiving = (extra = {}) => {
  const s = createDirectGame();
  stepDirectGame(s, [cmd(s, 'receive', extra)]);
  return s;
};

test('A1 passType 只在同 tick 開始墊球或墊球準備期採用', () => {
  assert.equal(receiving().player.passType, 'NEUTRAL', '沒帶 passType 的墊球是 NEUTRAL');
  assert.equal(receiving({ passType: 'HIGH' }).player.passType, 'HIGH');
  assert.equal(receiving({ passType: 'SPIKE' }).player.passType, 'NEUTRAL', '非法值忽略');
  assert.equal(receiving({ passType: 'toString' }).player.passType, 'NEUTRAL', '原型鍵不算合法值');

  const windup = receiving();
  while (windup.player.actionTick < DIRECT_ACTIONS.receive.windup - 1) stepDirectGame(windup, [cmd(windup)]);
  stepDirectGame(windup, [cmd(windup, null, { passType: 'LEFT' })]);
  assert.equal(windup.player.passType, 'LEFT', '準備期最後一個 tick 仍可選');
  stepDirectGame(windup, [cmd(windup, null, { passType: 'RIGHT' })]);
  assert.equal(windup.player.passType, 'LEFT', '出手窗口開始後鎖定');

  const idle = createDirectGame();
  stepDirectGame(idle, [cmd(idle, null, { passType: 'HIGH' })]);
  assert.equal(idle.player.passType, null, '沒有動作時忽略');
  const spike = createDirectGame();
  stepDirectGame(spike, [cmd(spike, 'spike', { passType: 'HIGH' })]);
  stepDirectGame(spike, [cmd(spike, null, { passType: 'LOW' })]);
  assert.equal(spike.player.passType, null, '非墊球動作忽略');
});

test('A2 平台角度在準備期連續過渡，出手窗口起到動作結束逐值不變', () => {
  for (const type of TYPES.slice(1)) {
    const s = receiving({ passType: type });
    const rate = DIRECT_PHYSICS.passBlendSpeed * DIRECT_DT + 1e-12;
    let last = { lateral: 0, pitch: 0 }, locked = null;
    while (s.player.action === 'receive') {
      const { passLateral: lateral, passPitch: pitch, actionTick } = s.player;
      assert.ok(Math.abs(lateral - last.lateral) <= rate && Math.abs(pitch - last.pitch) <= rate, `${type} 每 tick 變化受限`);
      if (actionTick >= DIRECT_ACTIONS.receive.windup) {
        locked ??= { lateral, pitch };
        assert.equal(lateral, locked.lateral); assert.equal(pitch, locked.pitch);
      }
      last = { lateral, pitch };
      stepDirectGame(s, [cmd(s, null, { passType: type })]); // input resends the held choice
    }
    assert.ok(Math.abs(locked.lateral) + Math.abs(locked.pitch) > 0.99, `${type} 準備期內完成過渡`);
    assert.equal(s.player.passLateral, 0); assert.equal(s.player.passPitch, 0);
  }
  // A choice made on the last windup tick must also stop moving once the window opens.
  const late = receiving();
  while (late.player.actionTick < DIRECT_ACTIONS.receive.windup - 1) stepDirectGame(late, [cmd(late)]);
  let locked = null;
  while (late.player.action === 'receive') {
    stepDirectGame(late, [cmd(late, null, { passType: 'LEFT' })]);
    if (late.player.action !== 'receive') break;
    locked ??= late.player.passLateral;
    assert.equal(late.player.passLateral, locked, '晚選的平台在出手窗口內不再轉動');
  }
  assert.ok(locked < 0 && locked > -1);
});

// Real chain: the official receive feed, fixed stance, same press tick; only passType differs.
function pass(x, passType, { z = 5, receiveTick = 29 } = {}) {
  const s = createDirectGame(); s.player.x = x; s.player.z = z;
  let contact = null, velocity = null, apex = -Infinity;
  for (let t = 0; t < 200; t++) {
    stepDirectGame(s, [cmd(s, t === 0 ? 'feed' : t === receiveTick ? 'receive' : null, { passType })]);
    const hit = s.events.find(e => e.type === 'contact');
    if (hit && !contact) { contact = hit; velocity = { vx: s.ball.vx, vy: s.ball.vy, vz: s.ball.vz }; }
    if (contact) apex = Math.max(apex, s.ball.y);
    if (t > 0 && !s.ball.active) break;
  }
  return { contact, velocity, apex };
}
test('A3 真實餵球鏈路：左右改橫向出球、高低改弧頂，三個站位都成立', () => {
  for (const x of [-0.3, 0, 0.3]) {
    const r = Object.fromEntries(TYPES.map(type => [type, pass(x, type)]));
    for (const type of TYPES) {
      assert.ok(r[type].contact?.active, `x=${x} ${type} 須主動觸球`);
      assert.ok(['forearm', 'hand'].includes(r[type].contact.part), `x=${x} ${type} 須由前臂或手觸球`);
    }
    const n = r.NEUTRAL;
    assert.ok(r.LEFT.velocity.vx <= n.velocity.vx - 0.5, `x=${x} LEFT vx ${r.LEFT.velocity.vx} vs ${n.velocity.vx}`);
    assert.ok(r.RIGHT.velocity.vx >= n.velocity.vx + 0.5, `x=${x} RIGHT vx ${r.RIGHT.velocity.vx} vs ${n.velocity.vx}`);
    assert.ok(r.HIGH.apex >= n.apex + 0.3, `x=${x} HIGH apex ${r.HIGH.apex} vs ${n.apex}`);
    assert.ok(r.LOW.apex <= n.apex - 0.3, `x=${x} LOW apex ${r.LOW.apex} vs ${n.apex}`);
  }
});

test('A4 平台選擇不增減膠囊、不改半徑；沒碰到身體的球軌跡逐位元相同', () => {
  const base = createDirectGame();
  base.player.action = 'receive';
  for (const tick of [2, 8, 12, 20]) {
    base.player.actionTick = tick;
    const plain = getDirectPose(base);
    for (const [lateral, pitch] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.4, -0.7]]) {
      const s = snapshotDirectGame(base);
      s.player.passLateral = lateral; s.player.passPitch = pitch;
      const pose = getDirectPose(s);
      assert.equal(pose.length, plain.length);
      pose.forEach((part, i) => {
        assert.equal(part.id, plain[i].id); assert.equal(part.radius, plain[i].radius); assert.equal(part.active, plain[i].active);
      });
    }
  }
  const trace = type => {
    const s = createDirectGame(); s.player.x = 3.5; const out = [];
    for (let t = 0; t < 90; t++) {
      stepDirectGame(s, [cmd(s, t === 0 ? 'feed' : t === 20 ? 'receive' : null, { passType: type })]);
      out.push(JSON.stringify(s.ball));
    }
    assert.equal(s.stats.contacts, 0, '遠方站位不得觸球');
    return out.join('\n');
  };
  const neutral = trace('NEUTRAL');
  for (const type of TYPES.slice(1)) assert.equal(trace(type), neutral, `${type} 不得改變未觸球的球`);
});

test('A5 含 passType 的錄影整卷重播與逐 tick 還原逐位元相同，direct-v3 拒絕', () => {
  const s = createDirectGame(); s.player.x = -0.3;
  const initial = snapshotDirectGame(s), commands = [], states = [];
  for (let t = 0; t < 90; t++) {
    const c = cmd(s, t === 0 ? 'feed' : t === 29 ? 'receive' : null, { passType: t < 31 ? 'LEFT' : 'HIGH' });
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
  assert.equal(serializeDirectState(replayDirectTape({ simulationVersion: 'direct-v4', initial, commands, endTick: s.tick })), serializeDirectState(s));
  assert.throws(() => restoreDirectGame({ ...initial, simulationVersion: 'direct-v3' }));
  assert.throws(() => replayDirectTape({ simulationVersion: 'direct-v3', initial, commands, endTick: 10 }));
});

test('A6 準備期最後一刻才選的平台只到部分角度，之後結果只由鎖定角度決定', () => {
  const lateRun = () => {
    const s = createDirectGame(); s.player.x = -0.3;
    for (let t = 0; t < 29 + DIRECT_ACTIONS.receive.windup - 1; t++)
      stepDirectGame(s, [cmd(s, t === 0 ? 'feed' : t === 29 ? 'receive' : null)]);
    return s;
  };
  const late = lateRun();
  assert.equal(late.player.actionTick, DIRECT_ACTIONS.receive.windup - 1);
  stepDirectGame(late, [cmd(late, null, { passType: 'LEFT' })]);
  const frozen = late.player.passLateral;
  assert.ok(frozen < 0 && frozen > -1, `晚選只到部分角度（${frozen}）`);
  // Control: same state after windup with the frozen angle injected and no choice recorded.
  const control = lateRun();
  stepDirectGame(control, [cmd(control)]);
  control.player.passLateral = frozen; control.player.passType = 'NEUTRAL';
  late.player.passType = 'NEUTRAL';
  for (let t = 0; t < 60; t++) { stepDirectGame(late, [cmd(late)]); stepDirectGame(control, [cmd(control)]); }
  assert.equal(serializeDirectState(late), serializeDirectState(control));
});

class Target extends EventTarget {
  constructor(doc = null) { super(); this.ownerDocument = doc; this.value = ''; this.style = { setProperty() {} }; }
  setPointerCapture() {} releasePointerCapture() {}
}
const ev = (type, props = {}) => {
  const e = new Event(type, { cancelable: true });
  Object.defineProperties(e, Object.fromEntries(Object.entries(props).map(([k, value]) => [k, { value }])));
  return e;
};
function controlsFixture() {
  const win = new Target(), doc = new Target(); doc.defaultView = win; doc.visibilityState = 'visible';
  const make = () => new Target(doc);
  const actionSelect = make(); actionSelect.value = 'receive';
  const feedSelect = make(); feedSelect.value = 'receive';
  const f = { win, doc, moveZone: make(), aimZone: make(), jumpButton: make(), hitButton: make(), actionSelect, feedButton: make(), feedSelect };
  return { f, controls: createDirectControls(f) };
}
test('A7 墊球時在出手鈕滑動送出平台選擇；鍵盤墊球為 NEUTRAL', () => {
  for (const [dx, dy, expected] of [[0, 0, 'NEUTRAL'], [0, -30, 'HIGH'], [0, 30, 'LOW'], [-30, 5, 'LEFT'], [30, -5, 'RIGHT']]) {
    const { f, controls } = controlsFixture();
    f.hitButton.dispatchEvent(ev('pointerdown', { pointerId: 3, clientX: 100, clientY: 100 }));
    const first = controls.sample(0);
    assert.deepEqual(first.map(c => c.action), [null, 'receive']);
    assert.equal(first[1].passType, 'NEUTRAL');
    f.hitButton.dispatchEvent(ev('pointermove', { pointerId: 3, clientX: 100 + dx, clientY: 100 + dy }));
    const moved = controls.sample(1);
    assert.equal(moved[0].passType, expected);
    assert.deepEqual(moved.map(c => c.action), [null], '滑動不重新觸發動作');
    if (expected === 'LEFT') assert.ok(moved[0].aim.x < 0, '左滑保留原本的改朝向行為');
    controls.dispose();
  }
  const { f, controls } = controlsFixture();
  f.hitButton.dispatchEvent(ev('pointerdown', { pointerId: 3, clientX: 100, clientY: 100 }));
  f.hitButton.dispatchEvent(ev('pointermove', { pointerId: 3, clientX: 100, clientY: 60 }));
  f.hitButton.dispatchEvent(ev('pointerup', { pointerId: 3, clientX: 100, clientY: 60 }));
  controls.sample(0);
  f.win.dispatchEvent(ev('keydown', { code: 'KeyJ', repeat: false }));
  const keyboard = controls.sample(1);
  assert.equal(keyboard.find(c => c.action === 'receive').passType, 'NEUTRAL');
  controls.dispose();
});
