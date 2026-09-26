// direct-v8 stage 1: judgement order (R5), miss reasons (R7), slow motion (R9),
// contextual hit action (R10) and determinism (R11).
// Acceptance: docs/kickoffs/direct-v8-stage1-receive-acceptance.md (frozen 2026-09-26).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectGame, stepDirectGame, snapshotDirectGame, restoreDirectGame, serializeDirectState, replayDirectTape } from '../src/sim/directGame.js';
import { contextAction, resolveHitAction, slowMotionScale, RECEIVE_WINDOW_CENTRE, DIVE_WINDOW_CENTRE } from '../src/sim/directReceiveRules.js';
import { RECEIVE_ASSIST as A, RECEIVE_RULES as R, DIRECT_ACTIONS } from '../src/sim/directConstants.js';
import { createDirectControls } from '../src/input/directControls.js';
import { contactReason, missReason } from '../src/app/directReceiveReasons.js';
import { crossingTick } from '../tools/receive-rules-cases.mjs';

const H = 1.75;
const cmd = (s, action = null, move = { x: 0, z: 0 }, extra = {}) => ({ tick: s.tick, sequence: 0, move, aim: { x: 0, z: -1 }, action, ...extra });
const PLATFORM = { x: 0, z: 5 - R.underForward * H }; // platform centre of a player at (0, 5) facing the net
const FOREHEAD = { x: 0, z: 5 - A.overForward * H };
// Free flight of a ball placed at (x, y0, z) with velocity v, one row per tick.
function flight(ball) {
  const s = createDirectGame(); s.player.x = 3.9; s.player.z = 8.5;
  Object.assign(s.ball, ball, { px: ball.x, py: ball.y, pz: ball.z, active: true });
  const rows = [];
  for (let t = 0; t < 240 && s.ball.active; t++) {
    stepDirectGame(s, [cmd(s)]);
    rows.push({ tick: t, y: s.ball.y, py: s.ball.py, x: s.ball.x, z: s.ball.z, speed: Math.hypot(s.ball.vx, s.ball.vy, s.ball.vz) });
  }
  return rows;
}
const pressFor = (T, centre, offset = 0) => T - Math.round(centre - 1 + offset);
// Run a placed ball with one press (explicit action or the contextual button).
function run(ball, rt, press = 'auto', { hooks = null } = {}) {
  const s = createDirectGame();
  Object.assign(s.ball, ball, { px: ball.x, py: ball.y, pz: ball.z, active: true });
  const out = { actions: [], contact: null, end: null, events: [] };
  for (let t = 0; t < 240; t++) {
    const action = t === rt ? (press === 'auto' ? resolveHitAction(s) : press) : null;
    if (action) out.actions.push(action);
    hooks?.(s, t);
    stepDirectGame(s, [cmd(s, action)]);
    out.events.push(...s.events);
    for (const e of s.events) {
      if (e.type === 'contact' && !out.contact) out.contact = { ...e, tick: t };
      if (['ground', 'net', 'out'].includes(e.type)) out.end = { ...e, x: s.ball.x, z: s.ball.z };
    }
    if (out.end) break;
  }
  return out;
}

test('R5（甲）判定順序：球在額頭高度時已在高手圈內且時機在窗內 → 判高手，即使之後也會進低手圈', () => {
  // A ball dropping straight down onto the forehead point also passes the
  // platform height inside the underhand circle (d = 0.21 h from the platform centre).
  const ball = { x: FOREHEAD.x, y: 2.6, z: FOREHEAD.z, vx: 0, vy: 0, vz: 0 };
  const rows = flight(ball);
  const over = crossingTick(rows, A.overHeight * H), under = crossingTick(rows, A.platformCueHeight * H);
  assert.ok(over.tick < under.tick, `額頭 ${over.tick} 先於平台 ${under.tick}`);
  const r = run(ball, pressFor(over.tick, RECEIVE_WINDOW_CENTRE), 'receive');
  assert.equal(r.contact?.technique, 'overhand', `判定 ${r.contact ? r.contact.technique + '/' + r.contact.tier : '沒接到'}`);
  assert.equal(r.contact.tick, over.tick, `判定 tick ${r.contact.tick} ≠ 額頭高度 tick ${over.tick}`);
  assert.ok(r.contact.tier, '高手須有等級');
});

test('R5（乙）邊界：d=0.49 m 判低手、d=0.51 m 且有按判魚躍，各 10 例', () => {
  const y0 = 2.5;
  const rows = flight({ x: 0, y: y0, z: 4, vx: 0, vy: 0, vz: 0 });
  const under = crossingTick(rows, A.platformCueHeight * H), dive = crossingTick(rows, R.diveHeight);
  // Ten points on the net-facing half of the circle: a ball dropping straight
  // down behind the platform centre would pass the forehead circle first (R5 甲).
  for (const [d, expected, rt] of [[0.49, 'underhand', pressFor(under.tick, RECEIVE_WINDOW_CENTRE)], [0.51, 'dive', pressFor(dive.tick, DIVE_WINDOW_CENTRE)]]) {
    for (let i = 0; i < 10; i++) {
      const a = Math.PI + (i + 0.5) * (Math.PI / 10);
      const ball = { x: PLATFORM.x + d * Math.cos(a), y: y0, z: PLATFORM.z + d * Math.sin(a), vx: 0, vy: 0, vz: 0 };
      const r = run(ball, rt);
      assert.equal(r.actions[0], expected === 'dive' ? 'dive' : 'receive', `d=${d} #${i} 情境出手 ${r.actions[0]}`);
      assert.equal(r.contact?.technique, expected, `d=${d} #${i} 判定 ${r.contact ? r.contact.technique + '/' + r.contact.tier : '沒接到'}`);
      assert.ok(r.contact.tier, `d=${d} #${i} 須有等級`);
    }
  }
});

test('R7 失誤原因：每顆球結束都有非空原因；沒接到說明站位（公分＋方向）或時機；噴球寫太早／太晚／沒按；魚躍標明魚躍', () => {
  const y0 = 2.5;
  const rows = flight({ x: 0, y: y0, z: 4, vx: 0, vy: 0, vz: 0 });
  const under = crossingTick(rows, A.platformCueHeight * H), dive = crossingTick(rows, R.diveHeight);
  const k = A.goodTicks * 1.0;
  const reasonOf = (r) => (r.contact && (r.contact.tier || r.contact.spray) ? contactReason(r.contact) : missReason(r.end));
  // Balls drop straight down a little in front of the platform centre, clear of the forehead circle.
  const at = (dx, dz) => ({ x: PLATFORM.x + dx, y: y0, z: PLATFORM.z + dz });
  const cases = [
    // [name, ball, press tick, press, expectation]
    ['完美低手', at(0.15, -0.2), pressFor(under.tick, RECEIVE_WINDOW_CENTRE), 'receive', (t) => t.startsWith('完美') && t.includes('低手')],
    ['噴球沒按', at(0.2, -0.2), null, null, (t) => t.startsWith('噴球') && t.includes('沒按')],
    ['噴球太早', at(0.2, -0.2), pressFor(under.tick, RECEIVE_WINDOW_CENTRE, Math.ceil(k) + 3), 'receive', (t) => t.startsWith('噴球') && t.includes('按太早')],
    ['噴球太晚', at(0.2, -0.2), pressFor(under.tick, RECEIVE_WINDOW_CENTRE, -(Math.ceil(k) + 3)), 'receive', (t) => t.startsWith('噴球') && t.includes('按太晚')],
    ['魚躍', at(1.0, 0), pressFor(dive.tick, DIVE_WINDOW_CENTRE), 'auto', (t) => t.includes('魚躍')],
    ['站位右', at(2.6, 0), pressFor(under.tick, RECEIVE_WINDOW_CENTRE), 'receive', (t) => t.startsWith('沒接到') && t.includes('站位') && t.includes('公分') && t.includes('右')],
    ['站位前', at(0, -2.6), null, null, (t) => t.startsWith('沒接到') && t.includes('站位') && t.includes('公分') && t.includes('前')],
    ['魚躍時機太早', at(1.0, 0), pressFor(dive.tick, DIVE_WINDOW_CENTRE, Math.ceil(k) + 4), 'dive', (t) => t.startsWith('沒接到') && t.includes('魚躍') && t.includes('時機')],
  ];
  for (const [name, ball, rt, press, check] of cases) {
    const r = run({ ...ball, vx: 0, vy: 0, vz: 0 }, rt ?? -1, press ?? 'receive');
    assert.ok(r.end, `${name}: 球沒有結束`);
    const text = reasonOf(r);
    assert.ok(typeof text === 'string' && text.length > 0, `${name}: 原因字串空白`);
    assert.ok(check(text), `${name}: 「${text}」`);
  }
});

// R9: slow motion is a pure function of the state; the tape is the same with it on or off.
function serveTape(playerX = 0) {
  const s = createDirectGame(); s.player.x = playerX;
  const initial = snapshotDirectGame(s), commands = [];
  // Press when the contextual button first says the judgement is 0.22 s away.
  let pressed = false;
  for (let t = 0; t < 200; t++) {
    let action = t === 0 ? 'feed' : null;
    const j = pressed ? null : slowMotionScale(s) < 1 ? resolveHitAction(s) : null;
    if (!pressed && j && s.ball.active && s.ball.y < 2.2) { action = j; pressed = true; }
    const c = { ...cmd(s, action), feedKind: 'serve' };
    commands.push(c); stepDirectGame(s, [c]);
  }
  return { initial, commands, endTick: s.tick };
}
test('R9 慢動作：純函式；快球、判定前 ≤ 0.4 s、人在圈內或撲救範圍內 → 0.5，其他 → 1；開關不改 sim 事件序列（觸發次數 > 0）', () => {
  const tape = serveTape();
  const replay = (enabled) => {
    const s = restoreDirectGame(tape.initial), byTick = new Map();
    for (const c of tape.commands) byTick.set(c.tick, [...(byTick.get(c.tick) ?? []), c]);
    const events = [], scales = [];
    let slowTicks = 0, seenSpeed = 0;
    while (s.tick < tape.endTick) {
      const scale = slowMotionScale(s, { enabled });
      scales.push(scale);
      if (scale < 1) { slowTicks++; seenSpeed = Math.max(seenSpeed, Math.hypot(s.ball.vx, s.ball.vy, s.ball.vz)); }
      stepDirectGame(s, byTick.get(s.tick) ?? []);
      events.push(...s.events);
    }
    return { events: JSON.stringify(events), state: serializeDirectState(s), slowTicks, seenSpeed, scales };
  };
  const on = replay(true), off = replay(false);
  assert.equal(on.events, off.events, '開關慢動作的 sim 事件序列不同');
  assert.equal(on.state, off.state, '開關慢動作的 sim 狀態不同');
  assert.ok(on.slowTicks > 0, `慢動作觸發 ${on.slowTicks} tick`);
  assert.ok(on.seenSpeed >= R.slowMotionSpeed, `觸發時球速 ${on.seenSpeed.toFixed(1)} m/s`);
  assert.equal(off.slowTicks, 0, '設定關閉仍觸發');
  assert.ok(on.scales.every((v) => v === 1 || v === R.slowMotionScale), '倍率只會是 1 或 0.5');
  // Slow ball: the receive feed never reaches 13 m/s, so no slow motion.
  const slow = createDirectGame();
  let slowSeen = false;
  for (let t = 0; t < 200; t++) { stepDirectGame(slow, [{ ...cmd(slow, t === 0 ? 'feed' : null), feedKind: 'receive' }]); if (slowMotionScale(slow) < 1) slowSeen = true; }
  assert.equal(slowSeen, false, '慢球觸發了慢動作');
  // Hard ball, player far away: no slow motion (not in any circle nor dive reach).
  const far = serveTape(4);
  const s = restoreDirectGame(far.initial);
  let farSeen = false;
  for (const c of far.commands) { if (slowMotionScale(s) < 1) farSeen = true; stepDirectGame(s, [c]); }
  assert.equal(farSeen, false, '人在範圍外仍觸發');
});

// R10: the hit button label equals the action the simulation executes, every tick.
test('R10 情境出手：contextAction 回傳 receive／dive／null；自動＝contextAction ?? receive；指定動作一律用指定；標籤與 sim 每 tick 相同（含切到魚躍 > 0 次）', () => {
  const idle = createDirectGame();
  assert.equal(contextAction(idle), null, '沒有球時 null');
  assert.equal(resolveHitAction(idle, 'auto'), 'receive');
  assert.equal(resolveHitAction(idle, 'spike'), 'spike');
  // Balls coming in while the player stands or walks across the path: the
  // label and the simulation must agree on every tick, and both receive and
  // dive must occur.
  const seen = { receive: 0, dive: 0, none: 0 };
  let mismatches = 0, ticks = 0;
  for (const [x0, z0, move, feedKind] of [[0, 4.9, { x: 0, z: 0 }, 'receive'], [1.2, 4.9, { x: -0.6, z: 0 }, 'receive'], [-1.5, 4.9, { x: 0.8, z: 0 }, 'receive'], [0.8, 6.2, { x: 0, z: 0 }, 'receive'], [0, 5, { x: 0, z: 0 }, 'serve']]) {
    const s = createDirectGame(); s.player.x = x0; s.player.z = z0;
    const fixture = controlsFixture();
    const controls = createDirectControls({ ...fixture.f, resolveAction: () => resolveHitAction(s, 'auto') });
    for (let t = 0; t < 120; t++) {
      // Label for this tick, as the practice page computes it before the press.
      const label = resolveHitAction(s, 'auto');
      const context = contextAction(s);
      seen[context ?? 'none']++;
      // Press through the real input layer (keyboard hit key) and step a copy.
      fixture.f.win.dispatchEvent(fixture.ev('keydown', { code: 'KeyJ', repeat: false }));
      const commands = controls.sample(t).map((c) => ({ ...c, tick: s.tick, move }));
      const copy = restoreDirectGame(snapshotDirectGame(s));
      stepDirectGame(copy, [...commands, { ...cmd(copy, t === 0 ? 'feed' : null, move), sequence: 50, feedKind }]);
      const started = copy.events.find((e) => e.type === 'action')?.action;
      if (started) { ticks++; if (started !== label) mismatches++; }
      stepDirectGame(s, [{ ...cmd(s, t === 0 ? 'feed' : null, move), feedKind }]);
    }
    controls.dispose();
  }
  assert.ok(ticks >= 100, `比對的 tick ${ticks}`);
  assert.equal(mismatches, 0, `標籤與 sim 動作不同 ${mismatches}/${ticks}`);
  assert.ok(seen.dive > 0 && seen.receive > 0, `情境 ${JSON.stringify(seen)}`);
});
class Target extends EventTarget {
  constructor(ownerDocument = null) { super(); this.ownerDocument = ownerDocument; this.value = ''; this.dataset = {}; this.style = { setProperty() {} }; }
  setPointerCapture() {} releasePointerCapture() {}
}
function controlsFixture() {
  const win = new Target(), doc = new Target(); doc.defaultView = win; doc.visibilityState = 'visible';
  const make = () => new Target(doc);
  const ev = (type, props = {}) => {
    const e = new Event(type, { cancelable: true });
    Object.defineProperties(e, Object.fromEntries(Object.entries(props).map(([k, value]) => [k, { value }])));
    return e;
  };
  return { ev, f: { win, doc, moveZone: make(), aimZone: make(), jumpButton: make(), hitButton: make(), actionSelect: null, feedButton: make(), feedSelect: make() } };
}

test('R11 決定論：含接球、噴球、魚躍的錄影，整卷重播與中途還原逐位元相同', () => {
  const s = createDirectGame({ seed: 7 });
  const initial = snapshotDirectGame(s), commands = [], states = [];
  // Receive feed + perfect press (pass); receive feed + late press (spray);
  // hard serve landing 1.2 m ahead of the platform + dive; a walk in between.
  const plan = [[0, 'feed', 'receive'], [29, 'receive', null], [200, 'feed', 'receive'], [244, 'receive', null], [400, 'feed', 'serve'], [445, 'dive', null]];
  const kinds = new Set();
  for (let t = 0; t < 560; t++) {
    const step = plan.find((p) => p[0] === t);
    const c = { ...cmd(s, step?.[1] ?? null, t >= 300 && t < 328 ? { x: 1, z: 0 } : t >= 330 && t < 358 ? { x: -1, z: 0 } : { x: 0, z: 0 }), ...(step?.[2] ? { feedKind: step[2] } : {}) };
    commands.push(c); stepDirectGame(s, [c]); states.push(snapshotDirectGame(s));
    for (const e of s.events) if (e.type === 'contact') kinds.add(e.tier ? e.technique : e.spray ? 'spray' : 'body');
  }
  assert.ok(kinds.has('underhand') && kinds.has('spray') && kinds.has('dive'), `錄影內容 ${[...kinds].join(',')}`);
  for (let from = 0; from < states.length - 1; from += 23) {
    const restored = restoreDirectGame(states[from]);
    for (let t = restored.tick; t < s.tick; t++) {
      stepDirectGame(restored, [commands[t]]);
      assert.equal(serializeDirectState(restored), serializeDirectState(states[t]), `從 ${from} 還原後第 ${t} tick 不同`);
    }
  }
  assert.equal(serializeDirectState(replayDirectTape({ simulationVersion: 'direct-v8.1', initial, commands, endTick: s.tick })), serializeDirectState(s));
});
