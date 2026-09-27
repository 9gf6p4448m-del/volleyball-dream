// direct-v8 stage 1, third round (user rulings of 2026-09-27 after the second
// review; acceptance file 修訂紀錄): Q5 dive band bounds on a slanted ball, the
// removed platform-distance gate, Q6 dive error multiplier 1.05, Q2 a receive
// pressed at a ball landing in the band is a miss (only a dive saves it).
// This file also runs on the archived old code (b06df69): it imports only
// what exists there, so a red there comes from behaviour, not from a missing import.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectGame, stepDirectGame, getDirectPose } from '../src/sim/directGame.js';
import { contextAction, crossingPoint, platformCentre, DIVE_WINDOW_CENTRE, RECEIVE_WINDOW_CENTRE } from '../src/sim/directReceiveRules.js';
import { passOutcome } from '../src/sim/directReceiveAssist.js';
import { RECEIVE_ASSIST as A, RECEIVE_RULES as R, DIRECT_PHYSICS as C } from '../src/sim/directConstants.js';
import { missReason } from '../src/app/directReceiveReasons.js';
import { crossingTick } from '../tools/receive-rules-cases.mjs';

const H = 1.75;
const PLATFORM = { x: 0, z: 5 - R.underForward * H }; // underhand point of a player at (0, 5) facing the net
const cmd = (s, action = null) => ({ tick: s.tick, sequence: 0, move: { x: 0, z: 0 }, aim: { x: 0, z: -1 }, action });
const pressFor = (T, centre, offset = 0) => T - Math.round(centre - 1 + offset);
const inZone = (x, z) => z >= 0.5 && z <= 3 && Math.abs(x) <= 3;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// Free flight of a placed ball, one row per tick (no player nearby).
function flight(ball) {
  const s = createDirectGame(); s.player.x = 3.9; s.player.z = 8.5;
  Object.assign(s.ball, ball, { px: ball.x, py: ball.y, pz: ball.z, active: true });
  const rows = [];
  for (let t = 0; t < 240 && s.ball.active; t++) { stepDirectGame(s, [cmd(s)]); rows.push({ tick: t, y: s.ball.y, py: s.ball.py, x: s.ball.x, z: s.ball.z, speed: Math.hypot(s.ball.vx, s.ball.vy, s.ball.vz) }); }
  return rows;
}
// One tick of free flight at the sim's substep scheme (where the ball would be
// at the end of the judgement tick had nothing touched it).
function freeFlightTick(b) {
  const dt = (1 / 60) / C.substeps;
  let { x, y, z, vx, vy, vz } = b;
  for (let i = 0; i < C.substeps; i++) { vy -= C.gravity * dt; x += vx * dt; y += vy * dt; z += vz * dt; }
  return { x, y, z };
}
// Run a placed ball against a player at (0, 5) with one press. Records the
// first contact (with the pass draw's salt: the contact count before that touch), the terminal event, the contextual action at the press, and at
// the contact tick the free-flight ball and the pose's platform centre.
function run(ball, rt, press, seed = 1) {
  const s = createDirectGame({ seed });
  Object.assign(s.ball, ball, { px: ball.x, py: ball.y, pz: ball.z, active: true });
  const out = { contact: null, end: null, context: null, action: null, free: null, platform: null, seed: s.seed };
  for (let t = 0; t < 240; t++) {
    let action = null;
    if (t === rt) { out.context = contextAction(s); action = press === 'auto' ? out.context ?? 'receive' : press; out.action = action; }
    const before = { x: s.ball.x, y: s.ball.y, z: s.ball.z, vx: s.ball.vx, vy: s.ball.vy, vz: s.ball.vz };
    stepDirectGame(s, [cmd(s, action)]);
    for (const e of s.events) {
      if (e.type === 'contact' && !out.contact) { out.contact = { ...e, tick: t, salt: s.stats.contacts - 1 }; out.free = freeFlightTick(before); out.platform = platformCentre(getDirectPose(s, 0)); }
      if (['ground', 'net', 'out'].includes(e.type)) out.end = { ...e, x: s.ball.x, z: s.ball.z };
    }
    if (out.end) break;
  }
  return out;
}
const describe = (r) => (r.contact ? `${r.contact.part}${r.contact.tier ? ':' + r.contact.tier + '/' + r.contact.technique : r.contact.spray ? ':spray/' + r.contact.timing : ''}` : '沒有觸球') +
  (r.end ? ` → ${r.end.type} (${r.end.x.toFixed(2)}, ${r.end.z.toFixed(2)})` : '');

// Q5: a slanted ball crosses the platform height and the dive height at points
// about 0.55 m apart. Toward the platform ("in"): outside the underhand circle
// at the platform-height moment, inside 0.5 m at the dive height. Away
// ("out"): the mirror image. Both measured with crossingPoint, the sim's own
// free-flight prediction, from the underhand point of the standing player.
function slanted(direction, bearing) {
  const speed = 4, vy0 = -1, y0 = 2.0;
  const ux = Math.cos(bearing), uz = Math.sin(bearing);
  // Free-fall time from y0 (vertical speed vy0, upward positive) to a height (same formula as the sim's fallTime).
  const fall = (y) => (vy0 + Math.sqrt(vy0 * vy0 + 2 * C.gravity * (y0 - y))) / C.gravity;
  const tDive = fall(R.diveHeight), tUnder = fall(A.platformCueHeight * H);
  // Ball travels along -u at `speed`; anchor so that the near crossing sits 0.3 m from the platform point along +u.
  const near = { x: PLATFORM.x + ux * 0.3, z: PLATFORM.z + uz * 0.3 };
  const tNear = direction === 'in' ? tDive : tUnder;
  const vx = direction === 'in' ? -ux * speed : ux * speed, vz = direction === 'in' ? -uz * speed : uz * speed;
  return { x: near.x - vx * tNear, y: y0, z: near.z - vz * tNear, vx, vy: vy0, vz };
}
const BEARINGS = [0.3, 0.9, 1.5, 2.1, 2.7, -0.5]; // radians from +x, around the platform point (none straight behind it)
const tag = (b, u, d) => `d(平台高)=${u.toFixed(2)} d(0.3 m)=${d.toFixed(2)}`;

test('Q5 撲救下界（斜落球，往平台來）：低手時刻在低手圈外、0.3 m 時刻 d < 0.5 → 情境出手＝魚躍，按下判魚躍（等級最高普通）', () => {
  for (const bearing of BEARINGS) {
    const ball = slanted('in', bearing);
    const under = crossingPoint(ball, A.platformCueHeight * H), dive = crossingPoint(ball, R.diveHeight);
    const dUnder = dist(under, PLATFORM), dDive = dist(dive, PLATFORM);
    assert.ok(dUnder > A.underRadius && dDive < A.underRadius, `案例前提 ${tag(ball, dUnder, dDive)}`);
    const diveTick = crossingTick(flight(ball), R.diveHeight).tick;
    const r = run(ball, pressFor(diveTick, DIVE_WINDOW_CENTRE), 'auto');
    assert.equal(r.context, 'dive', `${tag(ball, dUnder, dDive)} 情境出手 ${r.context}`);
    assert.equal(r.contact?.technique, 'dive', `${tag(ball, dUnder, dDive)} → ${describe(r)}`);
    assert.ok(r.contact.tier && r.contact.tier !== 'PERFECT', `${tag(ball, dUnder, dDive)} 等級 ${r.contact.tier}`);
    assert.equal(r.contact.tick, diveTick, `${tag(ball, dUnder, dDive)} 判定 tick ${r.contact.tick} ≠ 0.3 m tick ${diveTick}`);
  }
});

test('Q5 撲救下界（斜落球，離平台去）：低手時刻在低手圈內 → 不判魚躍：按接球判低手，硬按魚躍也不是魚躍（0.3 m 時刻 d 已 > 0.5 也一樣）', () => {
  for (const bearing of BEARINGS) {
    const ball = slanted('out', bearing);
    const under = crossingPoint(ball, A.platformCueHeight * H), dive = crossingPoint(ball, R.diveHeight);
    const dUnder = dist(under, PLATFORM), dDive = dist(dive, PLATFORM);
    assert.ok(dUnder < A.underRadius && dDive > A.underRadius && dDive <= A.underRadius + R.diveReach, `案例前提 ${tag(ball, dUnder, dDive)}`);
    const rows = flight(ball), underTick = crossingTick(rows, A.platformCueHeight * H).tick, diveTick = crossingTick(rows, R.diveHeight).tick;
    const receive = run(ball, pressFor(underTick, RECEIVE_WINDOW_CENTRE), 'auto');
    assert.equal(receive.context, 'receive', `${tag(ball, dUnder, dDive)} 情境出手 ${receive.context}`);
    assert.equal(receive.contact?.technique, 'underhand', `${tag(ball, dUnder, dDive)} 按接球 → ${describe(receive)}`);
    assert.ok(receive.contact.tier, `${tag(ball, dUnder, dDive)} 按接球須有等級`);
    const forced = run(ball, pressFor(diveTick, DIVE_WINDOW_CENTRE), 'dive');
    // The dive judgement does not apply: the ball is judged at the underhand
    // crossing (a spray on the diving body's arms, or a stance miss that then
    // deflects off the body) — never a graded dive.
    assert.notEqual(forced.contact?.technique, 'dive', `${tag(ball, dUnder, dDive)} 硬按魚躍仍判魚躍 → ${describe(forced)}`);
    assert.ok(!forced.contact?.tier, `${tag(ball, dUnder, dDive)} 硬按魚躍不得有等級 → ${describe(forced)}`);
  }
});

// The removed platform-distance gate (second round H1): a dive inside the band
// is saved by the rule even when the diving body's outstretched forearms are
// still more than 0.5 m (horizontally) from the ball at the judgement. The
// scenario is a natural one from the chase probe: the chaser runs from (0, 7.5)
// toward a feed drifting left (vx −1.5) and presses late in the window.
const DROP_Y = 2.5;
function dropTicks(point) {
  const rows = flight({ x: point.x, y: DROP_Y, z: point.z, vx: 0, vy: 0, vz: 0 });
  return { under: crossingTick(rows, A.platformCueHeight * H).tick, dive: crossingTick(rows, R.diveHeight).tick };
}
const BAND = [1.2, 1.4, 1.6, 1.8, 1.95].flatMap((d) => [0.4, 1.2, 2.0, 2.8].map((a) => ({ d, x: PLATFORM.x + d * Math.cos(a), z: PLATFORM.z + d * Math.sin(a) })));
// Horizontal distance from the ball to the nearest point of either forearm (the old gate's measure).
function forearmDistance(pose, b) {
  let best = Infinity;
  for (const q of pose) {
    if (q.part !== 'forearm') continue;
    const dx = q.b.x - q.a.x, dz = q.b.z - q.a.z, l2 = dx * dx + dz * dz;
    const u = l2 > 1e-12 ? Math.max(0, Math.min(1, ((b.x - q.a.x) * dx + (b.z - q.a.z) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(b.x - (q.a.x + dx * u), b.z - (q.a.z + dz * u)));
  }
  return best;
}
function lateChase(ex, off) {
  const feed = { x: 0, y: 2.8, z: 0.8, vx: -1.5, vy: 0, vz: 4 };
  const s = createDirectGame(); s.player.x = 0; s.player.z = 7.5;
  Object.assign(s.ball, feed, { px: feed.x, py: feed.y, pz: feed.z, active: true });
  const tArrive = Math.sqrt(2 * (feed.y - 0.44 * H) / C.gravity);
  const goal = { x: feed.x + feed.vx * tArrive + ex, z: feed.z + feed.vz * tArrive + 0.3 * H };
  const press = Math.round(tArrive * 60) - 13 + off;
  const out = { context: null, contact: null, gate: null, end: null };
  for (let t = 0; t < 240; t++) {
    const dx = goal.x - s.player.x, dz = goal.z - s.player.z, d = Math.hypot(dx, dz);
    const move = t < 12 || d < 0.08 ? { x: 0, z: 0 } : { x: dx / Math.max(d, 0.4), z: dz / Math.max(d, 0.4) };
    let action = null;
    if (t === press) { out.context = contextAction(s); action = out.context ?? 'receive'; }
    const before = { x: s.ball.x, y: s.ball.y, z: s.ball.z, vx: s.ball.vx, vy: s.ball.vy, vz: s.ball.vz };
    stepDirectGame(s, [{ ...cmd(s, action), move }]);
    for (const e of s.events) {
      if (e.type === 'contact' && !out.contact) { out.contact = { ...e, tick: t }; out.gate = forearmDistance(getDirectPose(s, 0), freeFlightTick(before)); }
      if (['ground', 'net', 'out'].includes(e.type)) out.end = { ...e, x: s.ball.x, z: s.ball.z };
    }
    if (out.end) break;
  }
  return out;
}

test('撲救範圍內的魚躍不看撲出後手臂到球的距離：判定那一格前臂離球 > 0.5 m 的例子也救到（守住 platformDistance 閘門已移除）', () => {
  const runs = [];
  for (const ex of [0, 0.3, -0.3]) for (const off of [-3, -6]) runs.push({ ex, off, ...lateChase(ex, off) });
  runs.forEach((r) => assert.equal(r.context, 'dive', `ex=${r.ex} off=${r.off} 情境出手 ${r.context}`));
  const saved = runs.filter((r) => r.contact?.technique === 'dive' && r.contact.tier);
  assert.equal(saved.length, runs.length, `魚躍救到 ${saved.length}/${runs.length}；例：${runs.filter((r) => !saved.includes(r)).slice(0, 4).map((r) => `ex=${r.ex} off=${r.off} → ${describe(r)}`).join('；')}`);
  const far = saved.filter((r) => r.gate > 0.5);
  assert.ok(far.length >= 4, `前臂離球 > 0.5 m 仍救到的例子 ${far.length}/${saved.length}（距離：${saved.map((r) => r.gate.toFixed(2)).join(' ')}）`);
});

// Q6: the dive's total pass-error multiplier is 1.05 (no stance multiplier; a
// set stance would be 0.7, so relative to a set-stance underhand it is ×1.5).
// Measured on real dive events: the sim's landing target against the same
// passOutcome draw (seed, tick, salt) with multiplier 1, and empirically
// against set-stance underhand passes of the same tier over the same press offsets.
const OFFSETS = [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
// Net-facing half of the underhand circle (a ball behind the platform centre would be judged at the forehead first, R5).
const IN_POINTS = [0.1, 0.25, 0.4].flatMap((d) => [3.4, 4.0, 4.6, 5.2, 5.8].map((a) => ({ x: PLATFORM.x + d * Math.cos(a), z: PLATFORM.z + d * Math.sin(a) })));

test('Q6 魚躍落點誤差總倍率 1.05：對基準誤差的比 ≈ 1.05（同一亂數）；同等級、同時機偏差下對站定低手的平均誤差比 ≈ 1.5（= 1.05 / 0.7）', () => {
  const ticks = dropTicks(BAND[0]);
  const ratios = [], diveErr = [], underErr = [];
  let seed = 0; // a different seed per run, so every pass is its own draw (same tick and salt otherwise)
  for (const off of OFFSETS) {
    for (const p of BAND) {
      const r = run({ x: p.x, y: DROP_Y, z: p.z, vx: 0, vy: 0, vz: 0 }, pressFor(ticks.dive, DIVE_WINDOW_CENTRE, off), 'dive', ++seed);
      const e = r.contact;
      if (!e?.tier || e.technique !== 'dive') continue;
      const base = passOutcome({ from: e.position, ballSpeed: e.ballSpeed, technique: 'underhand', tier: e.tier, seed: r.seed, tick: e.tick, salt: e.salt, bodySpeed: 0, errorMultiplier: 1, stance: 1 });
      const dx = base.target.x - A.target.x;
      if (Math.abs(dx) > 0.05) ratios.push((e.target.x - A.target.x) / dx);
      if (e.tier === 'GOOD') diveErr.push(Math.hypot(e.target.x - A.target.x, e.target.z - A.target.z));
    }
    for (const p of IN_POINTS) {
      const r = run({ x: p.x, y: DROP_Y, z: p.z, vx: 0, vy: 0, vz: 0 }, pressFor(ticks.under, RECEIVE_WINDOW_CENTRE, off), 'receive', ++seed);
      const e = r.contact;
      if (e?.tier === 'GOOD' && e.technique === 'underhand' && e.bodySpeed < A.stanceStill) underErr.push(Math.hypot(e.target.x - A.target.x, e.target.z - A.target.z));
    }
  }
  assert.ok(ratios.length >= 100 && diveErr.length >= 50 && underErr.length >= 30, `樣本 比值 ${ratios.length}、魚躍普通 ${diveErr.length}、站定低手普通 ${underErr.length}`);
  const mean = (a) => a.reduce((v, x) => v + x, 0) / a.length;
  const worst = Math.max(...ratios.map((v) => Math.abs(v - 1.05)));
  assert.ok(worst <= 0.02, `魚躍對基準誤差的比值 平均 ${mean(ratios).toFixed(3)}、最大偏離 1.05 為 ${worst.toFixed(3)}`);
  const empirical = mean(diveErr) / mean(underErr);
  assert.ok(empirical >= 1.25 && empirical <= 1.75, `魚躍普通 ${mean(diveErr).toFixed(3)} m ÷ 站定低手普通 ${mean(underErr).toFixed(3)} m = ${empirical.toFixed(2)}（1.05 倍率應約 1.5，1.5 倍率會是約 2.1）`);
});

// Q2: the press decides. A receive pressed at a ball that lands in the band
// (outside the underhand circle) is a stance miss with a stance reason; the
// same ball with a dive press is a dive.
const BAND_BALLS = [[1.0, 0], [0.8, 0.5], [-0.9, -0.3], [1.5, 0.6], [-1.2, 0.8], [0.7, -0.6]].map(([dx, dz]) => ({ x: PLATFORM.x + dx, y: DROP_Y, z: PLATFORM.z + dz, vx: 0, vy: 0, vz: 0, d: Math.hypot(dx, dz) }));

test('Q2 按接球、球落撲救範圍：判沒接到（站位原因，附公分）不自動改魚躍；同一球按魚躍才是魚躍', () => {
  const ticks = dropTicks(BAND[0]);
  for (const ball of BAND_BALLS) {
    assert.ok(ball.d > A.underRadius && ball.d <= A.underRadius + R.diveReach, `案例須在撲救範圍內 d=${ball.d.toFixed(2)}`);
    const receive = run(ball, pressFor(ticks.under, RECEIVE_WINDOW_CENTRE), 'receive');
    assert.ok(!receive.contact?.tier && !receive.contact?.spray, `d=${ball.d.toFixed(2)} 按接球 → ${describe(receive)}（應為沒接到）`);
    assert.ok(receive.end?.miss && receive.end.miss.pressed && receive.end.miss.d > A.underRadius, `d=${ball.d.toFixed(2)} 沒接到須帶站位資料 ${JSON.stringify(receive.end?.miss)}`);
    const text = missReason(receive.end);
    assert.ok(text.startsWith('沒接到') && text.includes('站位') && text.includes(`${Math.round(ball.d * 100)} 公分`), `d=${ball.d.toFixed(2)} 「${text}」`);
    const dive = run(ball, pressFor(ticks.dive, DIVE_WINDOW_CENTRE), 'dive');
    assert.equal(dive.contact?.technique, 'dive', `d=${ball.d.toFixed(2)} 按魚躍 → ${describe(dive)}`);
    assert.ok(dive.contact.tier, '魚躍須有等級');
  }
});
