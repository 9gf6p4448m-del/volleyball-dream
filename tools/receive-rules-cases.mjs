// direct-v8 R1 case generator. Run on the OLD code (3e90288) to list real-path
// receives where the ball is inside the receive circle with perfect press
// timing, yet the old capsule collision touched the torso, hips, thigh or
// upper arm first (A22's real-path sweep method, direct-v6: a fixed training
// feed, a stick held from tick 10, one press tick). The list is frozen in
// docs/experiments/direct-v8-r1-cases.json and replayed by tests/direct-v8-rules.test.js.
// Usage: node tools/receive-rules-cases.mjs <label> > docs/experiments/direct-v8-r1-cases.json
import { createDirectGame, stepDirectGame } from '../src/sim/directGame.js';
import { windowScale } from '../src/sim/directReceiveAssist.js';
import { RECEIVE_ASSIST as A, DIRECT_ACTIONS } from '../src/sim/directConstants.js';

// Rule geometry (docs/kickoffs/direct-v8-stage1-receive-acceptance.md, section 2).
export const UNDER_FORWARD = 0.31; // body heights: forearm platform centre ahead of the body
const WINDOW_CENTRE = DIRECT_ACTIONS.receive.windup - A.windowPre + (A.windowPre + DIRECT_ACTIONS.receive.active + A.windowPost) / 2;

const cmd = (s, action = null, move = { x: 0, z: 0 }) => ({ tick: s.tick, sequence: 0, move, aim: { x: 0, z: -1 }, action });

// The feed's free flight, one row per tick end (the player stands far away).
export function ghostFlight(feedKind = 'receive', height = 1.75) {
  const s = createDirectGame({ height }); s.player.x = 3.9; s.player.z = 8.5;
  const rows = [];
  for (let t = 0; t < 300; t++) {
    stepDirectGame(s, [{ ...cmd(s, t === 0 ? 'feed' : null), feedKind }]);
    if (s.events.some((e) => e.type === 'contact')) throw new Error('ghost run touched the body');
    rows.push({ tick: t, x: s.ball.x, y: s.ball.y, z: s.ball.z, py: s.ball.py, speed: Math.hypot(s.ball.vx, s.ball.vy, s.ball.vz) });
    if (!s.ball.active) break;
  }
  return rows;
}
// First tick whose end has the ball centre at or below `y`, having started above it.
export const crossingTick = (rows, y) => rows.find((r) => r.py > y && r.y <= y) ?? null;

export const SWEEP = {
  feeds: ['receive', 'spike', 'serve'],
  heights: [1.5, 1.75, 2.1],
  sticks: [[0, 0], [0, -1], [0.7, -0.7], [-0.7, -0.7], [1, 0], [-1, 0], [0, 1]],
  z0: [4.4, 4.8, 5.2, 5.6, 6.0], x0: [-0.3, 0, 0.3], m: [0.35, 1.0], rt: [14, 44],
};
export function* cases(sweep = SWEEP) {
  for (const feed of sweep.feeds) for (const height of sweep.heights) for (const stick of sweep.sticks)
    for (const z0 of sweep.z0) for (const x0 of sweep.x0) for (const m of stick[0] === 0 && stick[1] === 0 ? [0] : sweep.m)
      for (let rt = sweep.rt[0]; rt <= sweep.rt[1]; rt++) yield { feed, height, stick, z0, x0, m, rt };
}
export const commandsFor = (s, c, t) => [{ ...cmd(s, t === 0 ? 'feed' : t === c.rt ? 'receive' : null,
  t >= 10 ? { x: c.stick[0] * c.m, z: c.stick[1] * c.m } : { x: 0, z: 0 }), feedKind: c.feed }];

// Run one case; return the first contact and the player state at the crossing ticks.
export function runCase(c, { under, over }) {
  const s = createDirectGame({ height: c.height }); s.player.x = c.x0; s.player.z = c.z0;
  let first = null, atUnder = null, atOver = null, end = null;
  for (let t = 0; t < 300; t++) {
    stepDirectGame(s, commandsFor(s, c, t));
    const hit = s.events.find((e) => e.type === 'contact');
    if (hit && !first) first = { tick: t, part: hit.part, id: hit.id, tier: hit.tier ?? null, technique: hit.technique ?? null };
    const p = s.player;
    const state = { x: p.x, z: p.z, aim: { ...p.aim }, action: p.action, actionTick: p.actionTick, height: p.height };
    if (under && t === under.tick) atUnder = state;
    if (over && t === over.tick) atOver = state;
    const done = s.events.find((e) => ['ground', 'net', 'out'].includes(e.type));
    if (done) { end = { type: done.type, x: s.ball.x, z: s.ball.z }; break; }
  }
  return { s, first, atUnder, atOver, end };
}
const facing = (aim) => { const a = Math.atan2(aim.x, -aim.z); return { x: Math.sin(a), z: -Math.cos(a) }; };
export function classify(state, ball, forward, radius) {
  const f = facing(state.aim), h = state.height;
  const point = { x: state.x + f.x * forward * h, z: state.z + f.z * forward * h };
  const d = Math.hypot(ball.x - point.x, ball.z - point.z);
  const offset = state.action === 'receive' ? state.actionTick - WINDOW_CENTRE : null;
  return { d, ratio: d / radius, offset };
}
// Which stage judges this case under the v8 rules, and whether it is a perfect,
// inside-the-circle press there (stage order: overhand, then underhand).
export function judgeOf(r, flights) {
  const { under, over } = flights;
  const stages = [];
  if (over && r.atOver) stages.push({ stage: 'over', ...classify(r.atOver, over, A.overForward, A.overRadius), speed: over.speed, tick: over.tick });
  if (under && r.atUnder) stages.push({ stage: 'under', ...classify(r.atUnder, under, UNDER_FORWARD, A.underRadius), speed: under.speed, tick: under.tick });
  const judged = stages.find((x) => x.ratio <= 1) ?? null;
  if (!judged) return null;
  const k = windowScale(judged.speed);
  const perfect = judged.offset !== null && Math.abs(judged.offset) <= A.perfectTicks * k && judged.ratio <= A.edgeRatio;
  return { ...judged, k, perfect };
}
export const OLD_BODY = (first) => !!first && (first.part === 'torso' || first.part === 'hips' || first.part === 'arm' || /thigh/.test(first.id ?? ''));

export function flightsFor(feed, height) {
  const rows = ghostFlight(feed, height);
  return { under: crossingTick(rows, A.platformCueHeight * height), over: crossingTick(rows, A.overHeight * height) };
}

if (process.argv[1]?.endsWith('receive-rules-cases.mjs')) {
  const out = { generatedOn: process.argv[2] ?? 'unknown', underForward: UNDER_FORWARD, sweep: SWEEP, perfectTicks: A.perfectTicks, edgeRatio: A.edgeRatio, total: 0, cases: [] };
  const flights = new Map();
  for (const c of cases()) {
    out.total++;
    const key = `${c.feed}:${c.height}`;
    if (!flights.has(key)) flights.set(key, flightsFor(c.feed, c.height));
    const r = runCase(c, flights.get(key));
    const j = judgeOf(r, flights.get(key));
    if (j?.perfect && OLD_BODY(r.first))
      out.cases.push({ ...c, old: r.first, oldEnd: r.end, stage: j.stage, d: +j.d.toFixed(4), offset: j.offset, crossingTick: j.tick });
  }
  console.log(JSON.stringify(out, null, 1));
}
