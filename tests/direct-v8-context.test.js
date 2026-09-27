// direct-v8 stage 1: judgement order (R5), miss reasons (R7), slow motion (R9),
// contextual hit action (R10) and determinism (R11).
// Acceptance: docs/kickoffs/direct-v8-stage1-receive-acceptance.md (frozen 2026-09-26).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectGame, stepDirectGame, snapshotDirectGame, restoreDirectGame, serializeDirectState, replayDirectTape } from '../src/sim/directGame.js';
import { contextAction, resolveHitAction, slowMotionScale, crossingPoint, RECEIVE_WINDOW_CENTRE, DIVE_WINDOW_CENTRE } from '../src/sim/directReceiveRules.js';
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
  // Second round (M2): a press so early that the 32-tick receive has finished
  // by the judgement (here 40 ticks = 0.67 s before it) is "too early", not
  // "no press". A ball from 3.5 m gives the flight time for such a press.
  const highRows = flight({ x: 0, y: 3.5, z: 4, vx: 0, vy: 0, vz: 0 });
  const highUnder = crossingTick(highRows, A.platformCueHeight * H);
  const receiveLength = DIRECT_ACTIONS.receive.windup + DIRECT_ACTIONS.receive.active + DIRECT_ACTIONS.receive.recovery;
  const early = pressFor(highUnder.tick, RECEIVE_WINDOW_CENTRE, 28);
  assert.ok(early >= 0 && highUnder.tick - early >= receiveLength, `按鍵 tick ${early} 須在判定 tick ${highUnder.tick} 之前至少 ${receiveLength} tick`);
  const r = run({ ...at(0.2, -0.2), y: 3.5, vx: 0, vy: 0, vz: 0 }, early, 'receive');
  assert.ok(r.contact?.spray, `按太早（動作已收招）: 須為噴球（${r.contact ? JSON.stringify({ tier: r.contact.tier, spray: r.contact.spray, timing: r.contact.timing }) : '沒有觸球'}）`);
  assert.equal(r.contact.active, false, '按太早（動作已收招）: 判定時接球動作應已結束');
  assert.equal(r.contact.timing, 'early', `按太早（動作已收招）: timing ${r.contact.timing}`);
  const text = contactReason(r.contact);
  assert.ok(text.startsWith('噴球') && text.includes('按太早') && !text.includes('沒按'), `按太早（動作已收招）: 「${text}」`);
});

// R7, body first (second round, H2): a ball outside every circle that meets the
// body before any judgement is a stance miss, and its direction and centimetres
// are those of the incoming ball (where it would have crossed the platform
// height), not of the ball after it bounced off the body.
test('R7 身體先碰：站位公分與方向和碰撞前的預測一致；站位和時機都不合格時寫站位', () => {
  const dirOf = (m) => (Math.abs(m.right) >= Math.abs(m.forward) ? (m.right > 0 ? '右' : '左') : (m.forward > 0 ? '前' : '後'));
  // Expected stance numbers: the incoming ball's free flight to the platform height, body frame of a player at (0, 5) facing the net.
  const expect = (ball) => {
    const at = crossingPoint(ball, A.platformCueHeight * H);
    const right = at.x - PLATFORM.x, forward = -(at.z - PLATFORM.z);
    return { d: Math.hypot(right, forward), dir: dirOf({ right, forward }) };
  };
  const cases = [
    // [name, ball (with velocity), press tick or null]
    ['右側來球碰身體，沒按', { x: 1.6, y: 1.5, z: 5.05, vx: -3, vy: 1.5, vz: 0 }, null],
    ['右側來球碰身體，按太早（站位與時機都不合格）', { x: 1.6, y: 1.5, z: 5.05, vx: -3, vy: 1.5, vz: 0 }, 0],
    ['正面平飛碰胸口，沒按', { x: 0.05, y: 1.35, z: 3.0, vx: 0, vy: 1.5, vz: 6 }, null],
  ];
  for (const [name, ball, rt] of cases) {
    const want = expect(ball);
    assert.ok(want.d > A.underRadius, `${name}: 案例須在低手圈外（預測 d=${want.d.toFixed(2)}）`);
    const r = run(ball, rt ?? -1, 'receive');
    assert.ok(r.contact && !r.contact.tier && !r.contact.spray, `${name}: 須先碰到身體（${r.contact ? r.contact.part : '沒有觸球'}）`);
    assert.ok(r.end?.miss, `${name}: 終止事件沒有失誤資料`);
    assert.equal(r.end.miss.stage, 'body', `${name}: stage ${r.end.miss.stage}`);
    const text = missReason(r.end);
    assert.ok(Math.abs(r.end.miss.d - want.d) <= 0.03, `${name}: 公分 ${(r.end.miss.d * 100).toFixed(0)} ≠ 碰撞前預測 ${(want.d * 100).toFixed(0)}（「${text}」）`);
    assert.equal(dirOf(r.end.miss), want.dir, `${name}: 方向 ${dirOf(r.end.miss)} ≠ 碰撞前預測 ${want.dir}（「${text}」）`);
    assert.ok(text.startsWith('沒接到') && text.includes('站位') && text.includes('公分') && text.includes(want.dir), `${name}: 「${text}」`);
  }
});

// R9: slow motion is a pure function of the state. The passer stands at z = 7,
// where the hard serve's dive-height point is 0.7 m ahead of the platform (in
// the dive band; at z = 5 it is 2.7 m away, out of every range).
function serveTape(playerX = 0, playerZ = 7) {
  const s = createDirectGame(); s.player.x = playerX; s.player.z = playerZ;
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
// The "on/off leaves the sim identical" half of R9 needs the real practice
// loop (the scale only exists in src/app): tools/direct-play-browser.mjs --pass
// drives frame() with a synthetic clock on the same scripted tape with slow
// motion on and off and compares the sim event log bit for bit.
test('R9 慢動作：純函式不寫狀態；快球、判定前 ≤ 0.4 s、人在圈內或撲救範圍內 → 0.5，其他 → 1；觸發次數 > 0', () => {
  const tape = serveTape();
  const replay = (enabled) => {
    const s = restoreDirectGame(tape.initial), byTick = new Map();
    for (const c of tape.commands) byTick.set(c.tick, [...(byTick.get(c.tick) ?? []), c]);
    const scales = [];
    let slowTicks = 0, seenSpeed = 0;
    while (s.tick < tape.endTick) {
      // Reading the scale must not touch the state (a pure function of it).
      const before = serializeDirectState(s);
      const scale = slowMotionScale(s, { enabled });
      assert.equal(serializeDirectState(s), before, `tick ${s.tick}: slowMotionScale 改了狀態`);
      scales.push(scale);
      if (scale < 1) { slowTicks++; seenSpeed = Math.max(seenSpeed, Math.hypot(s.ball.vx, s.ball.vy, s.ball.vz)); }
      stepDirectGame(s, byTick.get(s.tick) ?? []);
    }
    return { slowTicks, seenSpeed, scales };
  };
  const on = replay(true), off = replay(false);
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

test('R11 決定論：含接球、噴球、魚躍、慢動作的錄影，整卷重播與中途還原逐位元相同', () => {
  const s = createDirectGame({ seed: 7 });
  const initial = snapshotDirectGame(s), commands = [], states = [];
  // Receive feed + perfect press (pass); receive feed + late press (spray); a
  // walk sideways and back, then 20 ticks toward the back line (to z ≈ 7.0,
  // where the hard serve's dive-height point is 0.7 m ahead of the platform);
  // hard serve + dive.
  const plan = [[0, 'feed', 'receive'], [29, 'receive', null], [200, 'feed', 'receive'], [244, 'receive', null], [400, 'feed', 'serve'], [445, 'dive', null]];
  const kinds = new Set();
  let slowTicks = 0;
  for (let t = 0; t < 560; t++) {
    if (slowMotionScale(s) < 1) slowTicks++;
    const step = plan.find((p) => p[0] === t);
    const move = t >= 300 && t < 328 ? { x: 1, z: 0 } : t >= 330 && t < 358 ? { x: -1, z: 0 } : t >= 360 && t < 380 ? { x: 0, z: 1 } : { x: 0, z: 0 };
    const c = { ...cmd(s, step?.[1] ?? null, move), ...(step?.[2] ? { feedKind: step[2] } : {}) };
    commands.push(c); stepDirectGame(s, [c]); states.push(snapshotDirectGame(s));
    for (const e of s.events) if (e.type === 'contact') kinds.add(e.tier ? e.technique : e.spray ? 'spray' : 'body');
  }
  // The tape really contains all four: a receive, a spray, a dive and slow-motion ticks.
  assert.ok(slowTicks > 0, `錄影中的慢動作 tick ${slowTicks}`);
  for (const kind of ['underhand', 'spray', 'dive']) assert.ok(kinds.has(kind), `錄影內容缺 ${kind}（${[...kinds].join(',')}）`);
  for (let from = 0; from < states.length - 1; from += 23) {
    const restored = restoreDirectGame(states[from]);
    for (let t = restored.tick; t < s.tick; t++) {
      stepDirectGame(restored, [commands[t]]);
      assert.equal(serializeDirectState(restored), serializeDirectState(states[t]), `從 ${from} 還原後第 ${t} tick 不同`);
    }
  }
  assert.equal(serializeDirectState(replayDirectTape({ simulationVersion: 'direct-v8.2', initial, commands, endTick: s.tick })), serializeDirectState(s));
  // direct-v8.2 (round 6, X2): a tape recorded as direct-v8.1 is refused.
  assert.throws(() => replayDirectTape({ simulationVersion: 'direct-v8.1', initial, commands, endTick: s.tick }));
});
