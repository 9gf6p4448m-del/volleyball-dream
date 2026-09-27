// direct-v8 stage 1, round 5 (fourth-review findings NEW-1..NEW-3; acceptance
// 修訂紀錄 W1–W3 of 2026-09-28). The grids are the reviewer's probes (pen2,
// snapdist, second) moved into the repo; tests/direct-v8-round5.test.js asserts
// on what these return. Read-only: fresh games are stepped, nothing is written.
// The round-5 evidence ran this file on the archived old code (c6a5c67), which
// it imported nothing new from; since round 6 (X3) secondContacts also uses the
// practice page's own reach easing (src/app/directPicture.js, new in round 6).
// Usage: node tools/direct-v8-round5-probes.mjs [penetration|snap-distance|second-contact]
import { createDirectGame, stepDirectGame, getDirectPose } from '../src/sim/directGame.js';
import { resolveHitAction } from '../src/sim/directReceiveRules.js';
import { DIRECT_PHYSICS as C } from '../src/sim/directConstants.js';
import { closestPoint } from '../src/sim/directPhysics.js';
import { easeReach } from '../src/app/directPicture.js';
import { CHASE } from './receive-assist-probe.mjs';
import { diveInCircle } from './direct-v8-round4-probes.mjs';

const H = 1.75;
const G = C.gravity;
const terminal = (e) => ['ground', 'net', 'out'].includes(e.type);
const arrival = (f, y) => { const a = -G / 2, b = f.vy, c = f.y - y; const t = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a); return { t, x: f.x + f.vx * t, z: f.z + f.vz * t }; };

// One chase run (the reviewer's loop: reaction 12 ticks, goal = arrival at
// 0.44 h + stance error, press = arrival − 13 + offset), calling `onTick(s, t)`
// after every step until the ball ends. `mode` 'auto' presses the contextual
// action, 'none' never presses.
function chaseRun({ f, px, pz, ex, ez, off, mode }, onTick) {
  const s = createDirectGame(); s.player.x = px; s.player.z = pz;
  Object.assign(s.ball, f, { px: f.x, py: f.y, pz: f.z, active: true });
  const a = arrival(f, 0.44 * H), goal = { x: a.x + ex, z: a.z + 0.3 * H + ez }, press = Math.round(a.t * 60) - 13 + off;
  for (let t = 0; t < 240; t++) {
    const dx = goal.x - s.player.x, dz = goal.z - s.player.z, d = Math.hypot(dx, dz);
    const move = t < 12 || d < 0.08 ? { x: 0, z: 0 } : { x: dx / Math.max(d, 0.4), z: dz / Math.max(d, 0.4) };
    const action = mode === 'auto' && t === Math.max(0, press) ? resolveHitAction(s) : null;
    stepDirectGame(s, [{ tick: s.tick, sequence: 0, move, aim: { x: 0, z: -1 }, action }]);
    onTick(s, t);
    if (s.events.some(terminal)) break;
  }
  return s;
}
function* chaseGrid(modes, starts) {
  for (const mode of modes) for (const f of CHASE.feeds) for (const [px, pz] of starts) for (const [ex, ez] of CHASE.errors) for (const off of CHASE.offsets) yield { f, px, pz, ex, ez, off, mode };
}
const STARTS3 = [[-1, 6], [1, 6], [0, 7.5]], STARTS5 = [[-1, 6], [1, 6], [0, 7.5], [2, 6], [-2, 6]];

// Deepest overlap (m) of the ball with a drawn forearm / hand capsule.
function armOverlap(ball, pose) {
  let best = null;
  for (const q of pose) {
    if (q.part !== 'forearm' && q.part !== 'hand') continue;
    const c = closestPoint(ball, q.a, q.b), d = Math.hypot(ball.x - c.x, ball.y - c.y, ball.z - c.z);
    const depth = q.radius + ball.radius - d;
    if (!best || depth > best.depth) best = { depth, id: q.id };
  }
  return best;
}
// W1 (NEW-1): chase grid, pressed and unpressed (5292 runs). A run counts when
// the ball overlapped a DRAWN forearm/hand (getDirectPose with the reach, the
// pose the practice page renders) by more than 5 mm before any touch, and
// then ended with no touch at all (the drawn arm let it through).
export function drawnArmPenetration() {
  const rows = []; let runs = 0;
  for (const c of chaseGrid(['auto', 'none'], STARTS3)) {
    let contacted = false, worst = null;
    chaseRun(c, (s, t) => {
      if (s.events.some((e) => e.type === 'contact')) contacted = true;
      if (contacted || !s.ball.active) return;
      const o = armOverlap(s.ball, getDirectPose(s));
      if (o && o.depth > 0.005 && (!worst || o.depth > worst.depth)) worst = { ...o, tick: t, reach: s.player.receiveReach ?? 0, ahead: s.player.receiveAhead ?? 0 };
    });
    runs++;
    if (worst && !contacted) rows.push({ feed: [c.f.vx, c.f.vy, c.f.vz], start: [c.px, c.pz], err: [c.ex, c.ez], off: c.off, mode: c.mode, ...worst, depth: +worst.depth.toFixed(3) });
  }
  return { runs, rows, maxDepth: rows.length ? Math.max(...rows.map((r) => r.depth)) : 0 };
}

// W2 (NEW-2): judgement-frame snap distance (snapFrom → position of the
// contact event) by class, over the chase grid (five starts, pressed and
// unpressed) plus the round-4 dive-in-circle grid (魚躍 pressed at a ball in
// the underhand circle). Class = technique / (pass | timing).
export function snapDistances() {
  const by = {};
  const rec = (e) => {
    if (e.type !== 'contact' || !e.snapFrom) return;
    const k = `${e.technique}/${e.tier ? 'pass' : e.timing}`;
    (by[k] ??= []).push(Math.hypot(e.snapFrom.x - e.position.x, e.snapFrom.y - e.position.y, e.snapFrom.z - e.position.z));
  };
  for (const c of chaseGrid(['auto', 'none'], STARTS5)) chaseRun(c, (s) => s.events.forEach(rec));
  for (const r of diveInCircle().rows) if (r.contact) rec(r.contact);
  const classes = {};
  for (const [k, v] of Object.entries(by)) { v.sort((a, b) => a - b); classes[k] = { n: v.length, p95: v[Math.floor(v.length * 0.95)], max: v[v.length - 1], over12: v.filter((x) => x > 1.2).length }; }
  return classes;
}

// W3 (NEW-3): second (body) collisions after a judged touch on the chase grid
// (pressed). For each, the gap from the ball to the nearest surface of the
// DRAWN pose at the collision: > 2 cm means the ball bounced off an arm the
// picture does not show there (the un-reached collision arm). Also checks the
// invariant behind it: on the judgement tick the sim's reach is zero and the
// ball sits on the arms of the no-reach pose.
// X3 (round 6, 2026-09-28): what the practice page actually draws after the
// judgement is not the zeroed sim reach but its own eased value — the last
// drawn reach (= the sim's reach at the end of the previous tick, `prev`)
// brought toward the sim's by easeReach, one frame per tick. That sequence is
// measured on the judgement state: the largest per-frame change, the frames
// until the drawn reach equals the sim's, and the ball's gap to the arms drawn
// on the judgement frame and on the frame the drawn reach settles.
export function secondContacts() {
  const gapTo = (ball, pose) => Math.min(...pose.map((q) => { const c = closestPoint(ball, q.a, q.b); return Math.hypot(ball.x - c.x, ball.y - c.y, ball.z - c.z) - q.radius - ball.radius; }));
  const armGap = (ball, pose) => Math.max(0, gapTo(ball, pose.filter((q) => q.part === 'forearm' || q.part === 'hand')));
  const pictureReach = (s, prev) => {
    const sim = { side: s.player.receiveReach ?? 0, ahead: s.player.receiveAhead ?? 0 };
    const gap = (shown) => armGap(s.ball, getDirectPose(s, 0, { reach: shown }));
    let shown = prev, maxStep = 0, settled = null, frame0Gap = null;
    for (let f = 0; f <= 20 && settled === null; f++) {
      const next = easeReach(shown, sim);
      maxStep = Math.max(maxStep, Math.abs(next.side - shown.side), Math.abs(next.ahead - shown.ahead));
      shown = next;
      if (f === 0) frame0Gap = gap(shown);
      if (shown.side === sim.side && shown.ahead === sim.ahead) settled = f;
    }
    return { reachedBefore: Math.hypot(prev.side, prev.ahead) > 0, maxStep, settled, frame0Gap, settledGap: gap(shown) };
  };
  let runs = 0, judged = 0, second = 0; const invisible = [], judgementRows = [];
  for (const c of chaseGrid(['auto'], STARTS3)) {
    let state = 'before', prev = { side: 0, ahead: 0 };
    chaseRun(c, (s) => {
      for (const e of s.events) {
        if (e.type !== 'contact') continue;
        if (state === 'before' && (e.tier || e.spray)) {
          state = 'judged'; judged++;
          judgementRows.push({ reach: Math.abs(s.player.receiveReach ?? 0) + Math.abs(s.player.receiveAhead ?? 0), base: armGap(s.ball, getDirectPose(s, 0, { reach: false })), ...pictureReach(s, prev) });
          continue;
        }
        if (state === 'judged') {
          state = 'done'; second++;
          const gap = gapTo({ ...e.position, radius: s.ball.radius }, getDirectPose(s));
          if (gap > 0.02) invisible.push({ feed: [c.f.vx, c.f.vy, c.f.vz], start: [c.px, c.pz], err: [c.ex, c.ez], off: c.off, part: e.part, gap: +gap.toFixed(3) });
        }
      }
      prev = { side: s.player.receiveReach ?? 0, ahead: s.player.receiveAhead ?? 0 };
    });
    runs++;
  }
  const max = (key) => Math.max(...judgementRows.map((r) => r[key]));
  return { runs, judged, second, invisible, judgement: {
    reachNonZero: judgementRows.filter((r) => r.reach > 0).length, maxBaseArmGap: max('base'),
    reachedBefore: judgementRows.filter((r) => r.reachedBefore).length, maxReachStepPerFrame: max('maxStep'),
    maxFramesToSettle: judgementRows.some((r) => r.settled === null) ? null : max('settled'),
    judgementFrameGap: max('frame0Gap'), maxDrawnArmGap: max('settledGap') } };
}

if (process.argv[1]?.endsWith('direct-v8-round5-probes.mjs')) {
  const which = process.argv[2] ?? 'penetration';
  if (which === 'penetration') {
    const r = drawnArmPenetration();
    console.log(JSON.stringify({ runs: r.runs, penetrateThenNoTouch: r.rows.length, maxDepth: r.maxDepth, examples: r.rows.slice(0, 4) }, null, 1));
  } else if (which === 'snap-distance') {
    console.log(JSON.stringify(snapDistances(), null, 1));
  } else if (which === 'second-contact') {
    console.log(JSON.stringify(secondContacts(), null, 1));
  }
}
