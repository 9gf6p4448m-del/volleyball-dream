// direct-v4 receive platform choice. Acceptance: docs/kickoffs/direct-v4-receive-swipe-acceptance.md
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDirectGame, stepDirectGame, getDirectPose, snapshotDirectGame, restoreDirectGame,
  serializeDirectState, replayDirectTape, restingSurfacePose, DIRECT_DT,
} from '../src/sim/directGame.js';
import { DIRECT_ACTIONS, DIRECT_PHYSICS } from '../src/sim/directConstants.js';
import { createDirectControls } from '../src/input/directControls.js';
import { collideBody } from '../src/sim/directPhysics.js';

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

test('A5 含 passType 的錄影整卷重播與逐 tick 還原逐位元相同，direct-v5 拒絕', () => {
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
    assert.equal(serializeDirectState(replayDirectTape({ simulationVersion: 'direct-v6', initial, commands, endTick: s.tick })), serializeDirectState(s));
    assert.throws(() => restoreDirectGame({ ...initial, simulationVersion: 'direct-v5' }));
    assert.throws(() => replayDirectTape({ simulationVersion: 'direct-v5', initial, commands, endTick: 10 }));
  }
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
test('A7 墊球時在出手鈕左右滑只送出平台選擇、不改朝向，上下滑暫停用；鍵盤墊球為 NEUTRAL', () => {
  // Up/down swipes are disabled (user decision 2026-09-24) and stay neutral.
  for (const [dx, dy, expected] of [[0, 0, 'NEUTRAL'], [0, -30, 'NEUTRAL'], [0, 30, 'NEUTRAL'], [-30, 5, 'LEFT'], [30, -5, 'RIGHT']]) {
    const { f, controls } = controlsFixture();
    f.hitButton.dispatchEvent(ev('pointerdown', { pointerId: 3, clientX: 100, clientY: 100 }));
    const first = controls.sample(0);
    assert.deepEqual(first.map(c => c.action), [null, 'receive']);
    assert.equal(first[1].passType, 'NEUTRAL');
    f.hitButton.dispatchEvent(ev('pointermove', { pointerId: 3, clientX: 100 + dx, clientY: 100 + dy }));
    const moved = controls.sample(1);
    assert.equal(moved[0].passType, expected);
    assert.deepEqual(moved.map(c => c.action), [null], '滑動不重新觸發動作');
    assert.deepEqual(moved[0].aim, first[0].aim, '墊球滑動不改朝向（2026-09-24 使用者裁定 H2-A）');
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

test('A6b 表面速度用的姿勢把轉身、側伸與平台選擇都還原成子步開頭的值', () => {
  const s = createDirectGame();
  s.player.action = 'receive'; s.player.actionTick = 5;
  const before = { receiveTurn: 0.1, receiveReach: 0.05, passLateral: -0.25, passPitch: 0.5 };
  const reference = snapshotDirectGame(s);
  Object.assign(reference.player, before);
  const expected = getDirectPose(reference, 0.5);
  Object.assign(s.player, { receiveTurn: 0.16, receiveReach: 0.08, passLateral: -0.5, passPitch: 0.75 });
  const moving = getDirectPose(s, 0.5);
  const resting = restingSurfacePose(s, 0.5, moving, before);
  assert.deepEqual(resting, expected, '每個值都回到子步開頭');
  assert.deepEqual(s.player, { ...s.player, receiveTurn: 0.16, receiveReach: 0.08, passLateral: -0.5, passPitch: 0.75 }, '狀態不被改動');
  for (const key of Object.keys(before)) {
    const partial = { ...before, [key]: s.player[key] };
    assert.notDeepEqual(restingSurfacePose(s, 0.5, moving, partial), expected, `${key} 必須被還原`);
  }
  assert.equal(restingSurfacePose(s, 0.5, moving, { receiveTurn: 0.16, receiveReach: 0.08, passLateral: -0.5, passPitch: 0.75 }), moving);
});

test('A3b 真實觸控指令鏈：出手鈕上左右滑改變墊球橫向出球，且不轉身', () => {
  const run = dx => {
    const { f, controls } = controlsFixture();
    const s = createDirectGame();
    for (let t = 0; t < 120; t++) {
      if (t === 29) {
        f.hitButton.dispatchEvent(ev('pointerdown', { pointerId: 3, clientX: 100, clientY: 100 }));
        if (dx) f.hitButton.dispatchEvent(ev('pointermove', { pointerId: 3, clientX: 100 + dx, clientY: 105 }));
      }
      const commands = controls.sample(t);
      if (t === 0) commands.push({ ...cmd(s, 'feed'), sequence: 1000 });
      stepDirectGame(s, commands);
      const hit = s.events.find(e => e.type === 'contact');
      if (hit) { controls.dispose(); return { hit, vx: s.ball.vx, aim: s.player.aim }; }
    }
    controls.dispose();
    return null;
  };
  const neutral = run(0), left = run(-30), right = run(30);
  for (const r of [neutral, left, right]) {
    assert.ok(r?.hit.active && ['forearm', 'hand'].includes(r.hit.part), '主動前臂或手觸球');
    assert.deepEqual(r.aim, { x: 0, z: -1 }, '滑動不轉身');
  }
  assert.ok(left.vx <= neutral.vx - 0.5, `left ${left.vx} vs ${neutral.vx}`);
  assert.ok(right.vx >= neutral.vx + 0.5, `right ${right.vx} vs ${neutral.vx}`);
});

// A14/A15 (frozen 2026-09-24): playability grid on the real receive feed.
function outcome(x, z, rt, passType) {
  const s = createDirectGame(); s.player.x = x; s.player.z = z;
  let hit = null, apex = -Infinity;
  for (let t = 0; t < 240; t++) {
    stepDirectGame(s, [cmd(s, t === 0 ? 'feed' : t === rt ? 'receive' : null, { passType })]);
    for (const e of s.events) {
      if (e.type === 'contact' && !hit) hit = e;
      if (['ground', 'net', 'out'].includes(e.type))
        return hit ? { active: hit.active && ['forearm', 'hand'].includes(hit.part), end: e.type, x: s.ball.x, z: s.ball.z, apex } : null;
    }
    if (hit) apex = Math.max(apex, s.ball.y);
  }
  return null;
}
const gridCache = new Map();
function grid(passType) {
  if (!gridCache.has(passType)) {
    const rows = [];
    for (const x of [-0.2, -0.1, 0, 0.1, 0.2]) for (const z of [4.8, 5.0, 5.2]) for (let rt = 18; rt <= 40; rt++) {
      const r = outcome(x, z, rt, passType);
      if (r?.active) rows.push(r);
    }
    gridCache.set(passType, rows);
  }
  return gridCache.get(passType);
}
const rate = (rows, f) => rows.filter(f).length / rows.length;
const inTarget = tx => r => r.end === 'ground' && Math.hypot(r.x - tx, r.z - 1.6) <= 1;

test('A14 不滑是到位球：少碰網、落在舉球區、弧頂夠高；低球不以碰網為主', () => {
  const n = grid('NEUTRAL');
  assert.ok(n.length >= 100, `enough active receives (${n.length})`);
  const net = rate(n, r => r.end === 'net');
  const zone = rate(n, r => r.end === 'ground' && r.z >= 0.5 && r.z <= 3 && Math.abs(r.x) <= 3);
  const apexes = n.map(r => r.apex).sort((a, b) => a - b), median = apexes[apexes.length >> 1];
  assert.ok(net <= 0.10, `A14a neutral net ${net.toFixed(2)}`);
  assert.ok(zone >= 0.50, `A14b neutral set zone ${zone.toFixed(2)}`);
  assert.ok(median >= 3.0, `A14c neutral apex median ${median.toFixed(2)}`);
  const low = grid('LOW');
  assert.ok(rate(low, r => r.end === 'net') <= 0.25, `A14d low net ${rate(low, r => r.end === 'net').toFixed(2)}`);
});

test('A15 方向練習：不滑打中央，左右滑打得到對應側邊目標', () => {
  const n = grid('NEUTRAL'), left = grid('LEFT'), right = grid('RIGHT');
  const center = rate(n, inTarget(0));
  assert.ok(center >= 0.40, `A15a neutral centre ${center.toFixed(2)}`);
  const l = rate(left, inTarget(-2)), nl = rate(n, inTarget(-2));
  const r = rate(right, inTarget(2)), nr = rate(n, inTarget(2));
  assert.ok(l >= 0.25 && l >= 3 * nl, `A15b left ${l.toFixed(2)} vs neutral ${nl.toFixed(2)}`);
  assert.ok(r >= 0.25 && r >= 3 * nr, `A15c right ${r.toFixed(2)} vs neutral ${nr.toFixed(2)}`);
});

test('L1 平台面反彈後，球不會沿著被碰到的前臂繼續往內', () => {
  // Two level forearms along the forward axis form an upward platform. The ball
  // strikes the outer upper edge of the right forearm while moving inward.
  const forearm = (id, x) => ({ id, part: 'forearm', active: true, radius: 0.05,
    a: { x, y: 1, z: 0 }, b: { x, y: 1, z: -0.3 } });
  const pose = [forearm('left-forearm', -0.08), forearm('right-forearm', 0.08)];
  const s = createDirectGame();
  s.player.action = 'receive';
  const c = Math.cos(0.7), n = { x: Math.sin(0.7), y: c, z: 0 };
  const gap = 0.05 + 0.105 + 0.0005;
  Object.assign(s.ball, { active: true, x: 0.08 + n.x * gap, y: 1 + n.y * gap, z: -0.15, vx: -5, vy: -1, vz: 0 });
  const hit = collideBody(s, pose, pose, DIRECT_DT / 16);
  assert.ok(hit, '須觸球');
  // Actual capsule normal at the contact: from the forearm axis to the resolved ball centre.
  const ax = hit.position.x - 0.08, ay = hit.position.y - 1, len = Math.hypot(ax, ay);
  const inward = (s.ball.vx * ax + s.ball.vy * ay) / len;
  assert.ok(inward >= -1e-9, `沿膠囊法線不得往內（${inward.toFixed(3)} m/s）`);
  assert.ok(s.ball.vy > 0, '平台面仍把球往上送');
});

test('A16 邊移動邊接：觸球時仍在移動，不滑墊球也不以碰網為主', () => {
  const rows = [];
  for (const x0 of [-0.6, -0.3, 0.3, 0.6]) for (const m of [0.1, 0.2, 0.3]) for (let rt = 18; rt <= 40; rt++) {
    const s = createDirectGame(); s.player.x = x0; s.player.z = 5.0;
    const move = { x: -Math.sign(x0) * m, z: 0 };
    let hit = null, vx = 0;
    for (let t = 0; t < 240; t++) {
      stepDirectGame(s, [{ ...cmd(s, t === 0 ? 'feed' : t === rt ? 'receive' : null), move: t >= 20 ? move : { x: 0, z: 0 } }]);
      let end = null;
      for (const e of s.events) {
        if (e.type === 'contact' && !hit) { hit = e; vx = s.player.vx; }
        if (['ground', 'net', 'out'].includes(e.type)) end = e.type;
      }
      if (end) {
        if (hit?.active && ['forearm', 'hand'].includes(hit.part) && Math.abs(vx) >= 0.05) rows.push({ end, x: s.ball.x, z: s.ball.z });
        break;
      }
    }
  }
  assert.ok(rows.length >= 40, `enough moving contacts (${rows.length})`);
  const net = rows.filter(r => r.end === 'net').length / rows.length;
  const zone = rows.filter(r => r.end === 'ground' && r.z >= 0.5 && r.z <= 3 && Math.abs(r.x) <= 3).length / rows.length;
  assert.ok(net <= 0.10, `A16 moving net ${net.toFixed(2)} (n=${rows.length})`);
  assert.ok(zone >= 0.50, `A16 moving set zone ${zone.toFixed(2)} (n=${rows.length})`);
});

test('A17 迎球只看球的世界速度，玩家橫移不改變迎球方向', () => {
  const turnAfterOneTick = playerVx => {
    const s = createDirectGame();
    s.player.action = 'receive'; s.player.actionTick = 2; s.player.vx = playerVx;
    Object.assign(s.ball, { active: true, x: 0, y: 0.65 * s.player.height, z: s.player.z - 1.2, vx: 0, vy: 0, vz: 5 });
    stepDirectGame(s, [{ ...cmd(s), move: { x: Math.sign(playerVx), z: 0 } }]);
    return s.player.receiveTurn;
  };
  assert.equal(turnAfterOneTick(0), 0);
  assert.equal(turnAfterOneTick(2), 0, '往右移動不轉身');
  assert.equal(turnAfterOneTick(-2), 0, '往左移動不轉身');
});

test('A16b 邊移動邊接（放開搖桿減速中觸球）：碰網 ≤ 10%，舉球區 ≥ 50%', () => {
  // The third review's scenario verbatim: run toward the path at half stick from
  // tick 10 and release at various ticks, so contact often happens while braking.
  const rows = [];
  for (const dir of [-1, 1]) for (const x0 of [0.3, 0.6, 0.9, 1.2, 1.5]) for (const stop of [26, 30, 34, 38, 99]) for (let rt = 18; rt <= 40; rt++) {
    const s = createDirectGame(); s.player.x = -dir * x0;
    let hit = null, vx = 0;
    for (let t = 0; t < 240; t++) {
      stepDirectGame(s, [{ ...cmd(s, t === 0 ? 'feed' : t === rt ? 'receive' : null), move: { x: t >= 10 && t < stop ? dir * 0.5 : 0, z: 0 } }]);
      let end = null;
      for (const e of s.events) {
        if (e.type === 'contact' && !hit) { hit = e; vx = s.player.vx; }
        if (['ground', 'net', 'out'].includes(e.type)) end = e.type;
      }
      if (end) {
        if (hit?.active && ['forearm', 'hand'].includes(hit.part) && Math.abs(vx) >= 0.05) rows.push({ end, x: s.ball.x, z: s.ball.z });
        break;
      }
    }
  }
  assert.ok(rows.length >= 40, `enough moving contacts (${rows.length})`);
  const net = rows.filter(r => r.end === 'net').length / rows.length;
  const zone = rows.filter(r => r.end === 'ground' && r.z >= 0.5 && r.z <= 3 && Math.abs(r.x) <= 3).length / rows.length;
  assert.ok(net <= 0.10, `A16b moving net ${net.toFixed(2)} (n=${rows.length})`);
  assert.ok(zone >= 0.50, `A16b moving set zone ${zone.toFixed(2)} (n=${rows.length})`);
});
