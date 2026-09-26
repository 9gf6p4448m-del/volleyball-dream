// direct-v8 stage 1: rule-based receive judgement (R1, R3, R4, R6).
// Acceptance: docs/kickoffs/direct-v8-stage1-receive-acceptance.md (frozen 2026-09-26).
// This file also runs on the old code (3e90288): the v8 rules module is loaded
// optionally, so the old red comes from behaviour, not from a missing import.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDirectGame, stepDirectGame } from '../src/sim/directGame.js';
import { windowScale } from '../src/sim/directReceiveAssist.js';
import { RECEIVE_ASSIST as A, DIRECT_ACTIONS, DIRECT_PHYSICS as C } from '../src/sim/directConstants.js';
import { chase, armGap } from '../tools/receive-assist-probe.mjs';
import { ghostFlight, crossingTick, commandsFor } from '../tools/receive-rules-cases.mjs';

const rules = await import('../src/sim/directReceiveRules.js').catch(() => null);
// The hit button: contextual on v8; the old code has no such thing, so the
// old run presses the explicit dive that its action menu offered.
const hitAction = (s) => (rules ? rules.contextAction(s) ?? 'receive' : 'dive');

const H = 1.75;
const UNDER_FORWARD = 0.31; // body heights: forearm platform centre ahead of the body (section 2)
const inZone = (x, z) => z >= 0.5 && z <= 3 && Math.abs(x) <= 3;
const cmd = (s, action = null, move = { x: 0, z: 0 }, extra = {}) => ({ tick: s.tick, sequence: 0, move, aim: { x: 0, z: -1 }, action, ...extra });
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)];
const CASES = JSON.parse(readFileSync(new URL('../docs/experiments/direct-v8-r1-cases.json', import.meta.url), 'utf8'));
const tag = (c) => `stick=${c.stick.join(',')} x0=${c.x0} z0=${c.z0} m=${c.m} rt=${c.rt}`;
const describe = (r) => (r.contact ? `${r.contact.part}${r.contact.tier ? ':' + r.contact.tier + '/' + r.contact.technique : ''}` : '沒有觸球') +
  (r.end ? ` → ${r.end.type} (${r.end.x.toFixed(2)}, ${r.end.z.toFixed(2)})` : '');

// Free flight of the ball state `b` at the sim's substep scheme until the
// ground (centre at the ball radius): where the pass would land untouched.
function ballisticLanding(b) {
  const dt = (1 / 60) / C.substeps;
  let { x, y, z, vx, vy, vz } = b;
  for (let i = 0; i < C.substeps * 600; i++) {
    vy -= C.gravity * dt;
    const nx = x + vx * dt, ny = y + vy * dt, nz = z + vz * dt;
    if (ny <= C.radius) { const u = (y - C.radius) / (y - ny); return { x: x + (nx - x) * u, z: z + (nz - z) * u }; }
    x = nx; y = ny; z = nz;
  }
  return null;
}
function runR1(c, turn = null) {
  const s = createDirectGame({ height: c.height }); s.player.x = c.x0; s.player.z = c.z0;
  let contact = null, gap = null, end = null, later = 0, landing = null;
  for (let t = 0; t < 240; t++) {
    if (turn !== null) s.player.receiveTurn = turn;
    stepDirectGame(s, commandsFor(s, c, t));
    const hit = s.events.find((e) => e.type === 'contact');
    // The ball right after the judged touch: its ballistic landing is where the pass goes.
    if (hit && !contact) { contact = hit; gap = armGap(s).gap; landing = ballisticLanding(s.ball); } else if (hit) later++;
    const done = s.events.find((e) => ['ground', 'net', 'out'].includes(e.type));
    if (done) { end = { type: done.type, x: s.ball.x, z: s.ball.z }; break; }
  }
  return { contact, gap, end, later, landing };
}

test('R1 規則取代碰撞：舊碼碰到軀幹／臀／大腿／上臂的圈內完美時機案例（≥ 20），新碼全部判完美並送往舉球區', () => {
  assert.ok(CASES.cases.length >= 20, `案例 ${CASES.cases.length}`);
  for (const c of CASES.cases)
    assert.ok(['torso', 'hips', 'arm'].includes(c.old.part) || /thigh/.test(c.old.id), `${tag(c)} 舊碼觸球部位 ${c.old.part}/${c.old.id}`);
  const results = CASES.cases.map((c) => ({ c, ...runR1(c) }));
  // Sent to the setter zone: the pass is judged PERFECT and the ball leaving the
  // arms would land inside the zone (ballistic prediction from the ball state
  // right after the touch). Whether the athlete, still running toward the net,
  // later runs under the pass and touches it again does not count as a pass.
  const ok = (r) => r.contact?.tier === 'PERFECT' && r.contact.technique === 'underhand' && inZone(r.contact.target.x, r.contact.target.z) &&
    !!r.landing && inZone(r.landing.x, r.landing.z);
  const bad = results.filter((r) => !ok(r));
  assert.equal(bad.length, 0, `完美且彈道落點在舉球區 ${results.length - bad.length}/${results.length}；例：${bad.slice(0, 4).map((r) => `${tag(r.c)} → ${describe(r)}${r.landing ? ` 彈道落點 (${r.landing.x.toFixed(2)}, ${r.landing.z.toFixed(2)})` : ''}`).join('；')}`);
  const deviation = Math.max(...results.map((r) => Math.hypot(r.landing.x - r.contact.target.x, r.landing.z - r.contact.target.z)));
  assert.ok(deviation <= 0.05, `彈道落點與 target 最大偏差 ${deviation.toFixed(3)} m`);
});

test('R1 轉身角度不影響判定：10 例 × receiveTurn −30°／0°／+30°，等級與落點逐值相同', () => {
  const turns = [-30, 0, 30];
  for (const c of CASES.cases.slice(0, 10)) {
    const runs = turns.map((deg) => runR1(c, deg * Math.PI / 180));
    runs.forEach((r, i) => assert.equal(r.contact?.tier, 'PERFECT', `${tag(c)} turn ${turns[i]}°: ${describe(r)}`));
    const key = (r) => JSON.stringify({ tier: r.contact.tier, technique: r.contact.technique, target: r.contact.target });
    assert.equal(key(runs[0]), key(runs[1]), `${tag(c)} −30° 與 0° 不同`);
    assert.equal(key(runs[2]), key(runs[1]), `${tag(c)} +30° 與 0° 不同`);
  }
});

// R3: the official receive feed; the player stands so that the ball crosses the
// platform height inside the underhand circle (d ≤ 0.45 m from the platform centre).
const FLIGHT = ghostFlight('receive', H);
const UNDER = crossingTick(FLIGHT, A.platformCueHeight * H);
const WINDOW_CENTRE = DIRECT_ACTIONS.receive.windup - A.windowPre + (A.windowPre + DIRECT_ACTIONS.receive.active + A.windowPost) / 2; // 13 action ticks
function stances(n, rMin = 0.05, rMax = 0.45) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = rMin + (rMax - rMin) * ((i % 5) / 4), a = i * 2.399963; // golden-angle spread
    out.push({ dx: +(r * Math.cos(a)).toFixed(4), dz: +(r * Math.sin(a)).toFixed(4), d: r });
  }
  return out;
}
// The platform centre sits 0.31 h in front of the body (aim straight at the net).
const standFor = (st, cross) => ({ x: cross.x + st.dx, z: cross.z + UNDER_FORWARD * H + st.dz });
// Press tick giving this window offset (in ticks) at crossing tick T: the offset
// read at the end of tick T is actionTick − WINDOW_CENTRE with actionTick = T − rt + 1.
const pressFor = (T, offset, centre = WINDOW_CENTRE) => T - Math.round(centre - 1 + offset);
function runFeed(player, rt) {
  const s = createDirectGame(); s.player.x = player.x; s.player.z = player.z;
  let contact = null, end = null;
  for (let t = 0; t < 240; t++) {
    stepDirectGame(s, [cmd(s, t === 0 ? 'feed' : t === rt ? 'receive' : null, { x: 0, z: 0 }, { feedKind: 'receive' })]);
    const hit = s.events.find((e) => e.type === 'contact');
    if (hit && !contact) contact = { ...hit, tick: t };
    const done = s.events.find((e) => ['ground', 'net', 'out'].includes(e.type));
    if (done) { end = { type: done.type, x: s.ball.x, z: s.ball.z }; break; }
  }
  return { contact, end };
}
const stanceTag = (st) => `d=${st.d.toFixed(2)} (${st.dx}, ${st.dz})`;

test('R3 噴球（甲）圈內沒按 30 例：每例都有標記為噴球的觸球事件（沒按），進舉球區 ≤ 10%', () => {
  const runs = stances(30).map((st) => ({ st, ...runFeed(standFor(st, UNDER), null) }));
  const missing = runs.filter((r) => !r.contact);
  assert.equal(missing.length, 0, `判成沒接到 ${missing.length}/30，例：${missing.slice(0, 4).map((r) => stanceTag(r.st)).join('；')}`);
  const unmarked = runs.filter((r) => !(r.contact.spray === true && r.contact.timing === 'none'));
  assert.equal(unmarked.length, 0, `未標記為噴球（沒按）${unmarked.length}/30，例：${unmarked.slice(0, 4).map((r) => `${stanceTag(r.st)} → ${describe(r)}`).join('；')}`);
  const zone = runs.filter((r) => r.end?.type === 'ground' && inZone(r.end.x, r.end.z)).length;
  assert.ok(zone / 30 <= 0.10, `進舉球區 ${zone}/30`);
});

test('R3 噴球（乙）圈內按鍵窗外 30 例（早晚各 15，窗外 1～6 tick）：每例標記為噴球且方向正確，各組進舉球區 ≤ 10%', () => {
  const k = windowScale(UNDER.speed), edge = Math.floor(A.goodTicks * k);
  const groups = { early: [], late: [] };
  stances(15).forEach((st, i) => {
    const beyond = (i % 6) + 1;
    groups.early.push({ st, offset: edge + beyond, ...runFeed(standFor(st, UNDER), pressFor(UNDER.tick, edge + beyond)) });
    groups.late.push({ st, offset: -(edge + beyond), ...runFeed(standFor(st, UNDER), pressFor(UNDER.tick, -(edge + beyond))) });
  });
  for (const [timing, runs] of Object.entries(groups)) {
    const missing = runs.filter((r) => !r.contact);
    assert.equal(missing.length, 0, `${timing}: 判成沒接到 ${missing.length}/15，例：${missing.slice(0, 3).map((r) => `${stanceTag(r.st)} offset ${r.offset}`).join('；')}`);
    const unmarked = runs.filter((r) => !(r.contact.spray === true && r.contact.timing === timing));
    assert.equal(unmarked.length, 0, `${timing}: 未標記為噴球（${timing}）${unmarked.length}/15，例：${unmarked.slice(0, 3).map((r) => `${stanceTag(r.st)} offset ${r.offset} → ${describe(r)}`).join('；')}`);
    const zone = runs.filter((r) => r.end?.type === 'ground' && inZone(r.end.x, r.end.z)).length;
    assert.ok(zone / runs.length <= 0.10, `${timing}: 進舉球區 ${zone}/${runs.length}`);
  }
});

// R4: a ball dropping straight down onto a point 0.5 m < d ≤ 2.0 m from the
// platform centre of a player standing at (0, 5) facing the net.
const DIVE_HEIGHT = 0.3;
function dropFlight() {
  const s = createDirectGame(); s.player.x = 3.9; s.player.z = 8.5;
  Object.assign(s.ball, { x: 0, y: 2.5, z: 4, px: 0, py: 2.5, pz: 4, vx: 0, vy: 0, vz: 0, active: true });
  const rows = [];
  for (let t = 0; t < 240 && s.ball.active; t++) {
    stepDirectGame(s, [cmd(s)]);
    rows.push({ tick: t, y: s.ball.y, py: s.ball.py, speed: Math.hypot(s.ball.vx, s.ball.vy, s.ball.vz) });
  }
  return rows;
}
const DROP = dropFlight();
const DROP_UNDER = crossingTick(DROP, A.platformCueHeight * H), DROP_DIVE = crossingTick(DROP, DIVE_HEIGHT);
// Dive window centre (action ticks); the old code has no dive window, so the
// receive-style centre stands in there.
const DIVE_CENTRE = rules?.DIVE_WINDOW_CENTRE ?? DIRECT_ACTIONS.dive.windup - A.windowPre + (A.windowPre + DIRECT_ACTIONS.dive.active + A.windowPost) / 2;
const PLATFORM = { x: 0, z: 5 - UNDER_FORWARD * H };
function runDrop(point, rt, press = 'auto') {
  const s = createDirectGame();
  Object.assign(s.ball, { x: point.x, y: 2.5, z: point.z, px: point.x, py: 2.5, pz: point.z, vx: 0, vy: 0, vz: 0, active: true });
  let contact = null, end = null, started = null, action = null;
  for (let t = 0; t < 240; t++) {
    const a = t === rt ? (press === 'auto' ? hitAction(s) : press) : null;
    if (t === rt) action = a;
    stepDirectGame(s, [cmd(s, a)]);
    if (t === rt) started = { aim: { ...s.player.aim }, speed: Math.hypot(s.player.vx, s.player.vz), event: s.events.find((e) => e.type === 'action')?.action ?? null };
    const hit = s.events.find((e) => e.type === 'contact');
    if (hit && !contact) contact = { ...hit, tick: t };
    const done = s.events.find((e) => ['ground', 'net', 'out'].includes(e.type));
    if (done) { end = { type: done.type, x: s.ball.x, z: s.ball.z }; break; }
  }
  return { action, started, contact, end };
}
const DIVE_POINTS = stances(30, 0.6, 1.9).map((st) => ({ x: PLATFORM.x + st.dx, z: PLATFORM.z + st.dz, d: st.d }));
const FAR_POINTS = stances(30, 2.1, 3.4).map((st) => ({ x: PLATFORM.x + st.dx, z: PLATFORM.z + st.dz, d: st.d }));
const IN_POINTS = stances(30, 0.05, 0.45).map((st) => ({ x: PLATFORM.x + st.dx, z: PLATFORM.z + st.dz, d: st.d }));
const pointTag = (p) => `d=${p.d.toFixed(2)} (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`;
const angleTo = (aim, from, to) => Math.abs(Math.atan2(Math.sin(Math.atan2(to.x - from.x, -(to.z - from.z)) - Math.atan2(aim.x, -aim.z)),
  Math.cos(Math.atan2(to.x - from.x, -(to.z - from.z)) - Math.atan2(aim.x, -aim.z)))) * 180 / Math.PI;

test('R4 魚躍：撲救範圍內按出手 30 例，每例自動朝球撲出、在 0.3 m 判定時刻判定、等級最高普通', () => {
  const rt = pressFor(DROP_DIVE.tick, 0, DIVE_CENTRE);
  const runs = DIVE_POINTS.map((p) => ({ p, ...runDrop(p, rt) }));
  if (rules) runs.forEach((r) => assert.equal(r.action, 'dive', `${pointTag(r.p)} 情境出手應為魚躍，得到 ${r.action}`));
  for (const r of runs) {
    assert.equal(r.started.event, 'dive', `${pointTag(r.p)} 沒有開始魚躍`);
    const off = angleTo(r.started.aim, { x: 0, z: 5 }, r.p);
    assert.ok(off <= 10 && r.started.speed > 0.5, `${pointTag(r.p)} 沒有朝球撲出：朝向偏 ${off.toFixed(1)}°、速度 ${r.started.speed.toFixed(2)} m/s`);
  }
  const saved = runs.filter((r) => r.contact?.technique === 'dive' && r.contact.tier);
  assert.equal(saved.length, runs.length, `判為魚躍觸球 ${saved.length}/${runs.length}；例：${runs.filter((r) => !saved.includes(r)).slice(0, 4).map((r) => `${pointTag(r.p)} → ${describe(r)}`).join('；')}`);
  for (const r of saved) assert.equal(r.contact.tick, DROP_DIVE.tick, `${pointTag(r.p)} 判定 tick ${r.contact.tick} ≠ 球心到 0.3 m 的 tick ${DROP_DIVE.tick}`);
  assert.equal(saved.filter((r) => r.contact.tier === 'PERFECT').length, 0, '魚躍出現完美');
});

test('R4 魚躍：同一組 10 種按鍵偏差，魚躍平均落點誤差 > 低手接球平均落點誤差', () => {
  const offsets = [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
  const error = (r) => Math.hypot(r.end.x - A.target.x, r.end.z - A.target.z);
  const dive = [], under = [];
  for (const off of offsets) {
    for (const p of DIVE_POINTS) { const r = runDrop(p, pressFor(DROP_DIVE.tick, off, DIVE_CENTRE)); if (r.contact?.tier && r.end?.type === 'ground') dive.push(error(r)); }
    for (const p of IN_POINTS) { const r = runDrop(p, pressFor(DROP_UNDER.tick, off), 'receive'); if (r.contact?.tier && r.end?.type === 'ground') under.push(error(r)); }
  }
  assert.ok(dive.length >= 100 && under.length >= 100, `魚躍 ${dive.length}、低手 ${under.length} 筆有等級的觸球`);
  const mean = (a) => a.reduce((v, x) => v + x, 0) / a.length;
  assert.ok(mean(dive) > mean(under), `魚躍平均 ${mean(dive).toFixed(2)} m、低手平均 ${mean(under).toFixed(2)} m`);
});

test('R4 魚躍：倒地後 42 tick 內移動指令不改位置、出手指令不產生動作', () => {
  const p = DIVE_POINTS[0], rt = pressFor(DROP_DIVE.tick, 0, DIVE_CENTRE);
  const run = (inputs) => {
    const s = createDirectGame();
    Object.assign(s.ball, { x: p.x, y: 2.5, z: p.z, px: p.x, py: 2.5, pz: p.z, vx: 0, vy: 0, vz: 0, active: true });
    const rows = [];
    let actionEvents = 0;
    const down = rt + DIRECT_ACTIONS.dive.windup + DIRECT_ACTIONS.dive.active; // the body is on the floor from here
    for (let t = 0; t < down + 42; t++) {
      const commands = [cmd(s, t === rt ? 'dive' : null)];
      if (inputs && t >= down) { commands[0].move = { x: 1, z: 0 }; commands.push({ ...cmd(s, 'receive', { x: 1, z: 0 }), sequence: 1 }); }
      stepDirectGame(s, commands);
      if (t >= down) { rows.push([s.player.x, s.player.z]); actionEvents += s.events.filter((e) => e.type === 'action').length; }
    }
    return { rows, actionEvents };
  };
  const control = run(false), pushed = run(true);
  assert.deepEqual(pushed.rows, control.rows, '倒地期間移動指令改變了位置');
  assert.equal(pushed.actionEvents, 0, `倒地期間出手指令產生了 ${pushed.actionEvents} 個動作`);
});

test('R4 魚躍：撲救範圍外（d > 2.0 m）按出手 30 例，0 例救到', () => {
  const rt = pressFor(DROP_DIVE.tick, 0, DIVE_CENTRE);
  const runs = FAR_POINTS.map((p) => ({ p, ...runDrop(p, rt) }));
  const saved = runs.filter((r) => r.contact?.tier);
  assert.equal(saved.length, 0, `救到 ${saved.length}/30：${saved.slice(0, 4).map((r) => `${pointTag(r.p)} → ${describe(r)}`).join('；')}`);
});

// R4, second round (stricter, 2026-09-27): a hard serve is flat and fast, so
// the ball travels about 1.4 m between the platform-height crossing and the
// dive height. Section 2 measures the dive band at the dive judgement moment
// (ball centre 0.3 m), from the underhand point; a judgement that measures it
// at the platform-height crossing saves balls beyond 2.0 m and lets balls
// inside 2.0 m go.
const SERVE = ghostFlight('serve', H);
const SERVE_DIVE = crossingTick(SERVE, DIVE_HEIGHT), SERVE_UNDER = crossingTick(SERVE, A.platformCueHeight * H);
// Stances as (dx, dz) of the underhand point from the ball at the dive height.
// Inside the band: mostly past the ball's path (dz > 0), where the distance to
// the platform-height crossing is beyond 2.0 m; outside the band: before the
// path (dz < 0), where that same distance is inside 2.0 m.
const SERVE_IN = [[0, 1.2], [0, 1.6], [0, 1.9], [0.5, 1.5], [-0.5, 1.5], [0.8, 1.7], [-0.8, 1.7], [1.0, 0], [-1.0, 0], [1.5, 0.3], [-1.5, -0.3], [0.7, -0.6]];
const SERVE_OUT = [[0.6, -2.0], [1.0, -1.9], [1.4, -1.6], [1.8, -1.2], [-0.8, -2.0], [-1.2, -1.8], [-1.6, -1.5], [0.9, -2.2], [-0.5, -2.3], [1.2, -2.1]];
const servePoint = ([dx, dz]) => ({ x: SERVE_DIVE.x + dx, z: SERVE_DIVE.z + dz, d: Math.hypot(dx, dz), dUnder: Math.hypot(SERVE_DIVE.x + dx - SERVE_UNDER.x, SERVE_DIVE.z + dz - SERVE_UNDER.z) });
const serveTag = (p) => `d(0.3 m)=${p.d.toFixed(2)} d(平台高)=${p.dUnder.toFixed(2)} (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`;
function runServe(point, rt, press = 'auto') {
  const s = createDirectGame(); s.player.x = point.x; s.player.z = point.z + UNDER_FORWARD * H;
  let contact = null, end = null, action = null;
  for (let t = 0; t < 240; t++) {
    const a = t === 0 ? 'feed' : t === rt ? (press === 'auto' ? hitAction(s) : press) : null;
    if (t === rt) action = a;
    stepDirectGame(s, [cmd(s, a, { x: 0, z: 0 }, { feedKind: 'serve' })]);
    const hit = s.events.find((e) => e.type === 'contact');
    if (hit && !contact) contact = { ...hit, tick: t };
    const done = s.events.find((e) => ['ground', 'net', 'out'].includes(e.type));
    if (done) { end = { type: done.type, x: s.ball.x, z: s.ball.z }; break; }
  }
  return { action, contact, end };
}

test('R4 魚躍（加嚴）強力發球：0.3 m 時刻 0.5 < d ≤ 2.0 的 12 例全部判魚躍救到（含平台高度 d > 2.0 的 7 例），並在 0.3 m 判定時刻判定', () => {
  assert.ok(SERVE_DIVE && SERVE_UNDER && Math.hypot(SERVE_DIVE.x - SERVE_UNDER.x, SERVE_DIVE.z - SERVE_UNDER.z) > 1, '發球在平台高度與 0.3 m 之間須飛行超過 1 m');
  const points = SERVE_IN.map(servePoint);
  for (const p of points) assert.ok(p.d > 0.5 && p.d <= 2.0, serveTag(p));
  assert.ok(points.filter((p) => p.dUnder > 2.0).length >= 7, `平台高度 d > 2.0 的例數 ${points.filter((p) => p.dUnder > 2.0).length}`);
  const rt = pressFor(SERVE_DIVE.tick, 0, DIVE_CENTRE);
  const runs = points.map((p) => ({ p, ...runServe(p, rt) }));
  if (rules) runs.forEach((r) => assert.equal(r.action, 'dive', `${serveTag(r.p)} 情境出手應為魚躍，得到 ${r.action}`));
  const saved = runs.filter((r) => r.contact?.technique === 'dive' && r.contact.tier);
  assert.equal(saved.length, runs.length, `魚躍救到 ${saved.length}/${runs.length}；例：${runs.filter((r) => !saved.includes(r)).slice(0, 4).map((r) => `${serveTag(r.p)} → ${describe(r)}`).join('；')}`);
  for (const r of saved) assert.equal(r.contact.tick, SERVE_DIVE.tick, `${serveTag(r.p)} 判定 tick ${r.contact.tick} ≠ 0.3 m tick ${SERVE_DIVE.tick}`);
  assert.equal(saved.filter((r) => r.contact.tier === 'PERFECT').length, 0, '魚躍出現完美');
});

test('R4 魚躍（加嚴）強力發球：0.3 m 時刻 d > 2.0 的 10 例（平台高度 d 都 ≤ 2.0）按出手與硬按魚躍都 0 例救到', () => {
  const points = SERVE_OUT.map(servePoint);
  for (const p of points) assert.ok(p.d > 2.0 && p.dUnder <= 2.0, serveTag(p));
  const rt = pressFor(SERVE_DIVE.tick, 0, DIVE_CENTRE);
  for (const press of ['auto', 'dive']) {
    const runs = points.map((p) => ({ p, ...runServe(p, rt, press) }));
    const saved = runs.filter((r) => r.contact?.tier);
    assert.equal(saved.length, 0, `${press}: 救到 ${saved.length}/${runs.length}：${saved.slice(0, 4).map((r) => `${serveTag(r.p)} → ${describe(r)}`).join('；')}`);
  }
});

test('R6 不隔空：R1 案例組＋追球探針的全部規則觸球，判定那一格球面到手掌／前臂表面 ≤ 0.05 m（100%）', () => {
  const gaps = [];
  for (const c of CASES.cases) { const r = runR1(c); if (r.contact) gaps.push({ tag: tag(c), gap: r.gap }); }
  const probe = chase();
  for (const row of probe.rows) gaps.push({ tag: `chase ${row.technique ?? 'spray'}:${row.tier ?? 'spray'}`, gap: row.gap });
  assert.ok(gaps.length >= 220, `觸球 ${gaps.length}`);
  const far = gaps.filter((g) => g.gap > 0.05);
  assert.equal(far.length, 0, `${far.length}/${gaps.length} 例超過 0.05 m（中位數 ${median(gaps.map((g) => g.gap)).toFixed(3)} m），例：${far.slice(0, 4).map((g) => `${g.tag} ${g.gap.toFixed(3)}`).join('；')}`);
});
