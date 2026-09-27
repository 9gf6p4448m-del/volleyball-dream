// direct-v8 stage 1, round 4 (third-review findings N1, N2, N4; acceptance
// 修訂紀錄 V1, V2, V4 of 2026-09-27). The grids are the reviewer's probes
// (dive-in-circle, aim-flip, nearest-surface) moved into the repo; the tests in
// tests/direct-v8-round4.test.js assert on what these return. Read-only: the
// simulation is stepped on fresh games, nothing is written.
// Usage: node tools/direct-v8-round4-probes.mjs [dive-in-circle|aim-flip|nearest-surface]
import { createDirectGame, stepDirectGame, getDirectPose } from '../src/sim/directGame.js';
import { resolveHitAction, nextJudgement, DIVE_WINDOW_CENTRE, RECEIVE_WINDOW_CENTRE } from '../src/sim/directReceiveRules.js';
import { RECEIVE_ASSIST as A, RECEIVE_RULES as R, DIRECT_PHYSICS as C } from '../src/sim/directConstants.js';
import { closestPoint } from '../src/sim/directPhysics.js';
import { contactReason, missReason } from '../src/app/directReceiveReasons.js';
import { autoFaceAim } from '../src/input/directAutoFace.js';
import { CHASE } from './receive-assist-probe.mjs';

const H = 1.75;
const G = C.gravity;
export const PLATFORM = { x: 0, z: 5 - R.underForward * H }; // underhand point of a player at (0, 5) facing the net
const cmd = (s, action = null, move = { x: 0, z: 0 }, aim = { x: 0, z: -1 }) => ({ tick: s.tick, sequence: 0, move, aim, action });
const terminal = (e) => ['ground', 'net', 'out'].includes(e.type);

// Gap (m) from the ball surface to the nearest hand/forearm surface and to the
// nearest surface of any part, on the end-of-tick pose (the pose being drawn).
export function gaps(s) {
  const pose = getDirectPose(s, 0), b = s.ball;
  let arm = Infinity, body = Infinity;
  for (const q of pose) {
    const c = closestPoint(b, q.a, q.b), g = Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z) - q.radius - b.radius;
    body = Math.min(body, g);
    if (q.part === 'forearm' || q.part === 'hand') arm = Math.min(arm, g);
  }
  return { arm: Math.max(0, arm), body: Math.max(0, body) };
}
// Free flight of a placed ball, one row per tick (no player nearby).
function flight(ball) {
  const s = createDirectGame(); s.player.x = 3.9; s.player.z = 8.5;
  Object.assign(s.ball, ball, { px: ball.x, py: ball.y, pz: ball.z, active: true });
  const rows = [];
  for (let t = 0; t < 240 && s.ball.active; t++) { stepDirectGame(s, [cmd(s)]); rows.push({ t, y: s.ball.y, py: s.ball.py }); }
  return rows;
}
const crossTick = (rows, y) => rows.find((r) => r.py > y && r.y <= y).t;
// One tick of free flight at the sim's substep scheme: where the ball would be
// at the end of the tick had nothing touched it (the judgement frame's snap
// starts from here; a ball headed for a judgement passes the body untouched).
export function freeFlightTick(b) {
  const dt = (1 / 60) / C.substeps;
  let { x, y, z, vx, vy, vz } = b;
  for (let i = 0; i < C.substeps; i++) { vy -= C.gravity * dt; x += vx * dt; y += vy * dt; z += vz * dt; }
  return { x, y, z };
}
export const outcomeOf = (contact, end) => contact ? (contact.tier ? `${contact.technique}:${contact.tier}` : contact.spray ? `spray:${contact.timing}` : 'body') : `miss:${end?.miss?.stage ?? 'none'}`;

// V1 (N1 / U2): the practice assignment is 魚躍, the ball drops straight into
// the underhand circle (d 0.1–0.49 m from the platform point, 8 bearings),
// the dive is pressed around the dive window and around the receive window
// (offsets −3, 0, +3): 240 runs. `pressedBefore` are those whose press
// precedes the judgement (the reviewer's 206); the others were judged before
// the press and read as no press legitimately.
export function diveInCircle() {
  const ticks = flight({ x: PLATFORM.x, y: 2.5, z: PLATFORM.z, vx: 0, vy: 0, vz: 0 });
  const tU = crossTick(ticks, A.platformCueHeight * H), tD = crossTick(ticks, R.diveHeight);
  const rows = [];
  for (const d of [0.1, 0.2, 0.3, 0.4, 0.49]) for (let k = 0; k < 8; k++) {
    const ang = k * Math.PI / 4, x = PLATFORM.x + d * Math.cos(ang), z = PLATFORM.z + d * Math.sin(ang);
    for (const [win, T, centre] of [['diveWin', tD, DIVE_WINDOW_CENTRE], ['recvWin', tU, RECEIVE_WINDOW_CENTRE]]) for (const off of [-3, 0, 3]) {
      const rt = T - Math.round(centre - 1 + off);
      const s = createDirectGame();
      Object.assign(s.ball, { x, y: 2.5, z, vx: 0, vy: 0, vz: 0, px: x, py: 2.5, pz: z, active: true });
      let contact = null, end = null, stage, gap = null;
      for (let t = 0; t < 240; t++) {
        stepDirectGame(s, [cmd(s, t === rt ? 'dive' : null)]);
        if (t === rt) stage = s.player.diveTarget ? s.player.diveTarget.stage ?? '(no field)' : 'no-target';
        for (const e of s.events) {
          if (e.type === 'contact' && !contact) { contact = { ...e, tick: t }; gap = gaps(s); }
          if (terminal(e)) end = e;
        }
        if (end) break;
      }
      const text = contact && (contact.tier || contact.spray) ? contactReason(contact) : end ? missReason(end) : '';
      rows.push({ d, ang: Math.round(ang * 180 / Math.PI), win, off, rt, stage, contact, end, gap, text, outcome: outcomeOf(contact, end), pressedBefore: !!contact && contact.tick >= rt });
    }
  }
  return { tU, tD, rows };
}

// V2 (N2): the practice page's control path. The command's aim is the receive
// auto-face heading while the hit button says 接球 (directPractice.js), else
// the stick aim (straight). The label is resolved from the state before the
// step; the sim must record the same judgement stage for the dive and never a
// null dive target. Grid: the chase feeds/errors/offsets, starts (±1, 6),
// (0, 7.5), (±2, 6). 'chase' presses the label's action at the chase press
// tick; 'first' presses 魚躍 on the first tick the label turns to dive.
export function aimFlip(variant = 'chase') {
  const arrival = (f, y) => { const a = -G / 2, b = f.vy, c = f.y - y; const t = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a); return { t, x: f.x + f.vx * t, z: f.z + f.vz * t }; };
  const rows = [];
  let n = 0;
  for (const f of CHASE.feeds) for (const [px, pz] of [[-1, 6], [1, 6], [0, 7.5], [2, 6], [-2, 6]]) for (const [ex, ez] of CHASE.errors) for (const off of CHASE.offsets) {
    const s = createDirectGame(); s.player.x = px; s.player.z = pz;
    Object.assign(s.ball, f, { px: f.x, py: f.y, pz: f.z, active: true });
    const a = arrival(f, 0.44 * H), goal = { x: a.x + ex, z: a.z + 0.3 * H + ez }, pressAt = Math.round(a.t / (1 / 60)) - 13 + off;
    let prevLabel = null, pressed = null, stage = null, labelStage = null, aimGap = null, contact = null, end = null;
    for (let t = 0; t < 240; t++) {
      const dx = goal.x - s.player.x, dz = goal.z - s.player.z, d = Math.hypot(dx, dz);
      const move = t < 12 || d < 0.08 ? { x: 0, z: 0 } : { x: dx / Math.max(d, 0.4), z: dz / Math.max(d, 0.4) };
      const label = resolveHitAction(s, 'auto');
      const aim = (label === 'receive' ? autoFaceAim(s.player, s.ball) : null) ?? { x: 0, z: -1 };
      let action = null;
      if (!pressed) {
        if (variant === 'chase' && t === Math.max(0, pressAt)) action = label;
        if (variant === 'first' && label === 'dive' && prevLabel === 'receive') action = 'dive';
      }
      if (action) { pressed = action; labelStage = nextJudgement(s)?.stage ?? null; aimGap = Math.abs(Math.atan2(s.player.aim.x, -s.player.aim.z) - Math.atan2(aim.x, -aim.z)) * 180 / Math.PI; }
      prevLabel = label;
      stepDirectGame(s, [cmd(s, action, move, aim)]);
      if (action === 'dive') stage = s.player.diveTarget ? s.player.diveTarget.stage : null;
      for (const e of s.events) { if (e.type === 'contact' && !contact) contact = e; if (terminal(e)) end = e; }
      if (end) break;
    }
    n++;
    if (pressed !== 'dive') continue;
    rows.push({ feed: [f.vx, f.vy, f.vz], start: [px, pz], err: [ex, ez], off, aimGap, labelStage, stage, outcome: outcomeOf(contact, end) });
  }
  return { variant, n, rows };
}

// V4 (N4): the chase grid, never pressed. Every touch is an unpressed spray
// on the body; the part it lands on must be the one whose SURFACE is nearest
// to the ball (axis distance less the part radius), measured from where the
// ball was before the snap (the free-flight end of the judgement tick) on the
// end-of-tick pose.
export function nearestSurface() {
  const arrival = (f, y) => { const a = -G / 2, b = f.vy, c = f.y - y; const t = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a); return { t, x: f.x + f.vx * t, z: f.z + f.vz * t }; };
  const rows = [];
  for (const f of CHASE.feeds) for (const [px, pz] of [[-1, 6], [1, 6], [0, 7.5]]) for (const [ex, ez] of CHASE.errors) for (const off of CHASE.offsets) {
    const s = createDirectGame(); s.player.x = px; s.player.z = pz;
    Object.assign(s.ball, f, { px: f.x, py: f.y, pz: f.z, active: true });
    const a = arrival(f, 0.44 * H), goal = { x: a.x + ex, z: a.z + 0.3 * H + ez };
    for (let t = 0; t < 240; t++) {
      const dx = goal.x - s.player.x, dz = goal.z - s.player.z, d = Math.hypot(dx, dz);
      const move = t < 12 || d < 0.08 ? { x: 0, z: 0 } : { x: dx / Math.max(d, 0.4), z: dz / Math.max(d, 0.4) };
      const before = { x: s.ball.x, y: s.ball.y, z: s.ball.z, vx: s.ball.vx, vy: s.ball.vy, vz: s.ball.vz };
      stepDirectGame(s, [cmd(s, null, move)]);
      const hit = s.events.find((e) => e.type === 'contact');
      if (hit) {
        if (hit.spray && hit.timing === 'none') {
          const free = freeFlightTick(before), pose = getDirectPose(s, 0);
          const surfaces = pose.map((q) => { const c = closestPoint(free, q.a, q.b); return { id: q.id, part: q.part, surface: Math.hypot(free.x - c.x, free.y - c.y, free.z - c.z) - q.radius }; });
          const chosen = surfaces.find((q) => q.id === hit.id), nearest = surfaces.reduce((m, q) => (q.surface < m.surface ? q : m));
          const disp = Math.hypot(hit.position.x - free.x, hit.position.y - free.y, hit.position.z - free.z);
          rows.push({ tick: t, chosen: hit.id, part: hit.part, chosenSurface: chosen?.surface ?? null, nearest: nearest.id, nearestSurface: nearest.surface, excess: (chosen?.surface ?? Infinity) - nearest.surface, disp, snapFrom: hit.snapFrom ?? null, free, reach: s.player.receiveReach ?? 0, ahead: s.player.receiveAhead ?? 0 });
        }
        break;
      }
      if (s.events.some(terminal)) break;
    }
  }
  return rows;
}

const q = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))] : NaN; };
export const stat = (arr) => `n=${arr.length} median=${q(arr, 0.5).toFixed(3)} p95=${q(arr, 0.95).toFixed(3)} max=${(arr.length ? Math.max(...arr) : NaN).toFixed(3)}`;
const tally = (rows, key) => rows.reduce((m, r) => ((m[key(r)] = (m[key(r)] ?? 0) + 1), m), {});

if (process.argv[1]?.endsWith('direct-v8-round4-probes.mjs')) {
  const which = process.argv[2] ?? 'dive-in-circle';
  if (which === 'dive-in-circle') {
    const { tU, tD, rows } = diveInCircle();
    const before = rows.filter((r) => r.pressedBefore);
    console.log(JSON.stringify({ tU, tD, n: rows.length, pressedBefore: before.length,
      outcomes: tally(before, (r) => `stage=${r.stage} -> ${r.outcome}`),
      noneTiming: before.filter((r) => r.contact?.timing === 'none').length, textWith沒按: before.filter((r) => r.text.includes('沒按')).length, textWith要按接球: before.filter((r) => r.text.includes('這球要按接球')).length,
      armGapOver005: before.filter((r) => !r.gap || r.gap.arm > 0.05).length, graded: before.filter((r) => r.contact?.tier).length, dives: before.filter((r) => r.contact?.technique === 'dive').length,
      afterJudgement: tally(rows.filter((r) => !r.pressedBefore), (r) => `${r.outcome} 「${r.text}」`),
      examples: before.slice(0, 4).map((r) => `d=${r.d} ang=${r.ang} ${r.win} off${r.off} rt${r.rt}: ${r.outcome} 「${r.text}」 armGap ${r.gap?.arm.toFixed(3)} part ${r.contact?.part}`) }, null, 1));
  } else if (which === 'aim-flip') {
    for (const variant of ['chase', 'first']) {
      const { n, rows } = aimFlip(variant);
      console.log(JSON.stringify({ variant, n, divePresses: rows.length, stageMismatch: rows.filter((r) => r.stage !== 'dive').length, nullTarget: rows.filter((r) => r.stage === null).length,
        tally: tally(rows, (r) => `label=${r.labelStage} sim=${r.stage} -> ${r.outcome}`), examples: rows.filter((r) => r.stage !== 'dive').slice(0, 4) }, null, 1));
    }
  } else if (which === 'nearest-surface') {
    const rows = nearestSurface();
    const worse = rows.filter((r) => r.excess > 1e-6);
    console.log(JSON.stringify({ n: rows.length, notNearestSurface: worse.length, excessOfThose: worse.length ? stat(worse.map((r) => r.excess)) : null, displacement: stat(rows.map((r) => r.disp)),
      chosenParts: tally(rows, (r) => r.part), pairs: tally(worse, (r) => `${r.chosen} chosen, ${r.nearest} nearer`), reachNonZero: rows.filter((r) => r.reach !== 0 || r.ahead !== 0).length,
      snapFromMatchesFreeFlight: rows.filter((r) => r.snapFrom && Math.hypot(r.snapFrom.x - r.free.x, r.snapFrom.y - r.free.y, r.snapFrom.z - r.free.z) < 1e-9).length }, null, 1));
  }
}
