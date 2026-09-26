// direct-v8 stage 1: rule-based receive, dive and slow motion. Pure sim: no
// three.js, deterministic. Acceptance: docs/kickoffs/direct-v8-stage1-receive-acceptance.md
//
// Every technique has one judgement moment: the first tick whose end has the
// ball centre at or below the technique's contact height (forehead 1.02 h,
// forearm platform 0.6 h, dive 0.3 m). The result depends only on where the
// ball is then (horizontal distance to the technique's point) and on the press
// timing (window offset of the receive/dive action). Body collisions never
// decide a receive: the ball is put on the hands and sent by these rules.
import { DIRECT_PHYSICS as C, DIRECT_ACTIONS, RECEIVE_ASSIST as A, RECEIVE_RULES as R } from './directConstants.js';
import { windowScale, timingTier, passOutcome, rng } from './directReceiveAssist.js';
import { closestPoint } from './directPhysics.js';

// `press`: the first receive/dive press for this ball, so a press so early that
// the action has already finished at the judgement still reads as "too early".
export const createJudge = () => ({ done: false, over: false, under: false, miss: null, press: null });
export const underRadius = (s) => s.assist?.underRadius ?? A.underRadius;
export const overRadius = (s) => s.assist?.overRadius ?? A.overRadius;

export function facingOf(p) {
  const a = Math.atan2(p.aim.x, -p.aim.z);
  return { x: Math.sin(a), z: -Math.cos(a) };
}
// Judgement point of a technique, optionally with the current run extrapolated
// `ahead` seconds. The visible receive turn never moves these points.
export function techniquePoint(p, technique, ahead = 0) {
  const f = facingOf(p), h = p.height;
  const forward = technique === 'overhand' ? A.overForward : R.underForward;
  return {
    x: p.x + p.vx * ahead + f.x * forward * h,
    z: p.z + p.vz * ahead + f.z * forward * h,
    y: technique === 'overhand' ? p.y + A.overHeight * h : technique === 'dive' ? R.diveHeight : p.y + A.platformCueHeight * h,
  };
}
// Seconds until the ball centre, in free flight, next descends through height y.
export function fallTime(b, y) {
  const drop = b.y - y;
  if (drop <= 0) return null;
  return (b.vy + Math.sqrt(b.vy * b.vy + 2 * C.gravity * drop)) / C.gravity;
}
export function crossingPoint(b, y) {
  const t = fallTime(b, y);
  if (t === null) return null;
  return { t, x: b.x + b.vx * t, z: b.z + b.vz * t, speed: Math.hypot(b.vx, b.vy - C.gravity * t, b.vz) };
}
// Distance from the ball's crossing point to the technique point over the
// current run: the closest the point comes to the ball if the body keeps its
// run for anything between 0 and `run` seconds (a running player may stop).
function runDistance(p, technique, cp, run) {
  const a = techniquePoint(p, technique), b = techniquePoint(p, technique, run);
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
  const u = l2 > 1e-12 ? Math.max(0, Math.min(1, ((cp.x - a.x) * dx + (cp.z - a.z) * dz) / l2)) : 0;
  return { d: Math.hypot(cp.x - (a.x + dx * u), cp.z - (a.z + dz * u)), point: a };
}
// The judgement that will apply to this ball: overhand (inside the forehead
// circle), underhand (inside the platform circle), dive (outside it but within
// reach) or null. `run` caps how much of the current run counts.
export function nextJudgement(s, { run = Infinity, dive = true } = {}) {
  const p = s.player, b = s.ball;
  if (!b.active) return null;
  const stage = (technique, radius) => {
    const cp = crossingPoint(b, techniquePoint(p, technique).y);
    if (!cp) return null;
    return { technique, t: cp.t, ...runDistance(p, technique, cp, Math.min(cp.t, run)), radius, ball: cp, speed: cp.speed };
  };
  const over = stage('overhand', overRadius(s));
  if (over && over.d <= over.radius) return { stage: 'over', ...over };
  const under = stage('underhand', underRadius(s));
  if (under && under.d <= under.radius) return { stage: 'under', ...under };
  // The dive band is measured at the dive judgement moment (ball centre at
  // R.diveHeight) from the underhand point (section 2): for a flat, fast ball
  // that point is well past the platform-height crossing.
  if (dive && under) {
    const reach = diveReachOf(s, run);
    if (reach && reach.d <= reach.radius) return { stage: 'dive', technique: 'dive', ...reach };
  }
  return null;
}
// Horizontal distance from the underhand point to the ball at the dive
// judgement moment (ball centre at R.diveHeight), over the current run.
export function diveReachOf(s, run = Infinity) {
  const cp = crossingPoint(s.ball, R.diveHeight);
  if (!cp) return null;
  return { t: cp.t, ...runDistance(s.player, 'underhand', cp, Math.min(cp.t, run)), radius: underRadius(s) + R.diveReach, ball: cp, speed: cp.speed };
}
// R10: what the hit button does right now.
export function contextAction(s) {
  const j = nextJudgement(s);
  return j ? (j.stage === 'dive' ? 'dive' : 'receive') : null;
}
export function resolveHitAction(s, assignment = 'auto') {
  return !assignment || assignment === 'auto' ? contextAction(s) ?? 'receive' : assignment;
}
// R9: picture-time multiplier. Never touches the simulation.
export function slowMotionScale(s, { enabled = true } = {}) {
  const b = s.ball;
  if (!enabled || !b.active || s.judge?.done) return 1;
  if (Math.hypot(b.vx, b.vy, b.vz) < R.slowMotionSpeed) return 1;
  const j = nextJudgement(s);
  return j && j.t <= R.slowMotionLead ? R.slowMotionScale : 1;
}
// Where a dive started now would meet the ball: the ball's point at the dive
// height, if a judgement is coming for this ball (same test as the hit button),
// with the band distance `d` measured at that moment from the underhand point
// (the judgement at R.diveHeight reads these, never the pose of the sliding body).
export function diveTargetFor(s) {
  if (!nextJudgement(s)) return null;
  const reach = diveReachOf(s);
  return reach ? { x: reach.ball.x, z: reach.ball.z, t: reach.t, d: reach.d, radius: reach.radius, point: { x: reach.point.x, z: reach.point.z } } : null;
}
// How far the arms extend for a dive at a ball `distance` metres away: fully
// for a far ball, bent toward a ball right beside the body (never below diveMinReach).
export function diveReachFor(distance, h) {
  return Math.max(R.diveMinReach, Math.min(1, distance / (R.divePlatformForward * h)));
}
// Launch speed so the dive-pose platform reaches the target when the ball does
// (slide model: v0·t − friction·t²/2, stopping at v0/friction).
export function diveLaunchSpeed(distance, t, h, reach = 1) {
  const travel = distance - R.divePlatformForward * h * reach, f = C.diveFriction;
  let v0;
  if (t <= 1e-6 || travel <= 0) v0 = R.diveMinSpeed;
  else if (travel >= f * t * t / 2) v0 = travel / t + f * t / 2;
  else v0 = Math.sqrt(2 * f * travel);
  return Math.max(R.diveMinSpeed, Math.min(C.diveSpeed, v0));
}
// Window offset (ticks from the window centre) of an action, with no range
// check: null only while that action is not running. The receive window is
// centred on its active phase; the dive window centre is R.diveWindowCentre.
export const RECEIVE_WINDOW_CENTRE = DIRECT_ACTIONS.receive.windup - A.windowPre + (A.windowPre + DIRECT_ACTIONS.receive.active + A.windowPost) / 2;
export const DIVE_WINDOW_CENTRE = R.diveWindowCentre;
export function actionWindowOffset(p, action, fraction = 0) {
  if (p.action !== action) return null;
  return p.actionTick + fraction - (action === 'dive' ? DIVE_WINDOW_CENTRE : RECEIVE_WINDOW_CENTRE);
}
// Receive press offset at the end of this tick: the running receive, or a
// receive pressed so early that it already finished (judge.press) — that is
// "too early", not "no press". Null only when nothing was pressed for this ball.
export function receiveOffset(s) {
  const live = actionWindowOffset(s.player, 'receive', 1);
  if (live !== null) return live;
  const press = s.judge?.press;
  return press?.action === 'receive' ? s.tick - press.tick + 1 - RECEIVE_WINDOW_CENTRE : null;
}
// Should body collision be skipped this tick? Yes while a rule judgement is
// coming for this ball: the player is idle or receiving with the ball headed
// into a receive circle, or diving at a target.
export function ruleGhost(s) {
  const p = s.player, b = s.ball, j = s.judge;
  // Only a falling ball is on its way to a judgement height.
  if (!b.active || !j || j.done || s.contactEpisode || b.vy >= 0) return false;
  if (p.action === 'dive') return !!p.diveTarget;
  if (p.action && p.action !== 'receive') return false;
  return !!nextJudgement(s, { dive: false });
}
export function platformCentre(pose) {
  const arms = pose.filter((q) => q.part === 'forearm');
  if (arms.length !== 2) return null;
  const pts = arms.flatMap((q) => [q.a, q.b]);
  return { x: pts.reduce((v, q) => v + q.x, 0) / 4, y: pts.reduce((v, q) => v + q.y, 0) / 4, z: pts.reduce((v, q) => v + q.z, 0) / 4 };
}
// Put the ball on the nearest hand/forearm surface (never from thin air, R6).
function snapToArms(s, pose) {
  const b = s.ball;
  let best = null;
  for (const q of pose) {
    if (q.part !== 'forearm' && q.part !== 'hand') continue;
    const c = closestPoint(b, q.a, q.b);
    const d = Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z);
    if (!best || d < best.d) best = { q, c, d };
  }
  const n = best.d > 1e-9 ? { x: (b.x - best.c.x) / best.d, y: (b.y - best.c.y) / best.d, z: (b.z - best.c.z) / best.d } : { x: 0, y: 1, z: 0 };
  const r = best.q.radius + b.radius + 1e-5;
  b.x = best.c.x + n.x * r; b.y = best.c.y + n.y * r; b.z = best.c.z + n.z * r;
  return { part: best.q.part, id: best.q.id };
}
const lerp = ([lo, hi], u) => lo + (hi - lo) * u;
function contact(s, fields) {
  s.contactEpisode = true;
  s.assistGhost = true; // the ball leaves from the arms; the body must not re-catch it
  s.stats.contacts++;
  s.judge.done = true;
  const b = s.ball;
  const event = { type: 'contact', tick: s.tick, id: 'rule', position: { x: b.x, y: b.y, z: b.z }, ...fields };
  s.events.push(event);
  return event;
}
// Relative position of the ball in the body frame (right and forward, metres).
function relative(p, ball, point) {
  const f = facingOf(p), dx = ball.x - point.x, dz = ball.z - point.z;
  return { right: dx * -f.z + dz * f.x, forward: dx * f.x + dz * f.z };
}
function timingOf(offset, k) {
  if (offset === null) return 'none';
  return Math.abs(offset) <= A.goodTicks * k ? 'inside' : offset > 0 ? 'early' : 'late';
}
function pass(s, pose, { technique, tier, offset, ratio, speed }) {
  const p = s.player, b = s.ball;
  const snapped = snapToArms(s, pose);
  const bodySpeed = Math.hypot(p.vx, p.vz);
  // A dive is not a running stance: its error is the dive multiplier alone
  // (stance 1, not the set-stance 0.7 nor the running 1.6).
  const dive = technique === 'dive';
  const out = passOutcome({ from: b, ballSpeed: speed, technique: dive ? 'underhand' : technique, tier,
    seed: s.seed, tick: s.tick, salt: s.stats.contacts, bodySpeed, errorMultiplier: dive ? R.diveErrorMultiplier : 1, stance: dive ? 1 : undefined });
  b.vx = out.vx; b.vy = out.vy; b.vz = out.vz;
  return contact(s, { ...snapped, active: true, assisted: true, technique, tier, target: out.target, ballSpeed: speed, bodySpeed, offset, ratio, airborne: !p.grounded });
}
// Inside the circle but pressed outside the window (or not at all): the ball
// hits the arms and trickles off somewhere (Q3).
function spray(s, pose, { technique, offset, timing, speed, ratio }) {
  const p = s.player, b = s.ball;
  const snapped = snapToArms(s, pose);
  const random = rng(s.seed, s.tick, s.stats.contacts + 101);
  const yaw = random() * Math.PI * 2, horizontal = lerp(R.sprayHorizontal, random()), vertical = lerp(R.sprayVertical, random());
  b.vx = Math.sin(yaw) * horizontal; b.vz = -Math.cos(yaw) * horizontal; b.vy = vertical;
  return contact(s, { ...snapped, active: p.action === 'receive', spray: true, technique, timing, offset, ballSpeed: speed, ratio });
}
function judgeStage(s, pose, technique) {
  const p = s.player, b = s.ball;
  const point = techniquePoint(p, technique), radius = technique === 'overhand' ? overRadius(s) : underRadius(s);
  const d = Math.hypot(b.x - point.x, b.z - point.z);
  if (d > radius) return null;
  const speed = Math.hypot(b.vx, b.vy, b.vz), k = windowScale(speed);
  const offset = receiveOffset(s);
  const timing = timingOf(offset, k);
  if (timing !== 'inside') return spray(s, pose, { technique, offset, timing, speed, ratio: d / radius });
  return pass(s, pose, { technique, tier: timingTier(offset, d / radius, speed), offset, ratio: d / radius, speed });
}
// A dive is never better than GOOD (section 2: 品質上限「普通」).
const CAP = { PERFECT: 'GOOD', GOOD: 'GOOD', POOR: 'POOR' };
// Dive judgement at R.diveHeight: inside the band (d measured at this moment
// from the underhand point, fixed when the dive was pressed) and pressed inside
// the window → a dive pass graded by timing; there is no extra gate on where
// the sliding body's platform ended up (section 2: 撲救範圍內且有按 → 魚躍).
function judgeDive(s, pose) {
  const p = s.player, b = s.ball, j = s.judge, target = p.diveTarget;
  const d = target.d, radius = target.radius;
  const speed = Math.hypot(b.vx, b.vy, b.vz), k = windowScale(speed);
  const offset = actionWindowOffset(p, 'dive', 1), timing = timingOf(offset, k);
  if (d > radius || timing !== 'inside') {
    j.done = true;
    j.miss = { stage: 'dive', d, radius, ...relative(p, b, target.point), pressed: true, offset, timing: d > radius ? null : timing };
    return null;
  }
  return pass(s, pose, { technique: 'dive', tier: CAP[timingTier(offset, d / radius, speed)], offset, ratio: d / radius, speed });
}
// Why the ball is going to be missed, measured at the underhand judgement.
// `ball` is the ball to extrapolate: for a body deflection the caller passes
// the ball as it was before the collision (R7 reads the incoming ball).
export function missInfo(s, stage, ball = s.ball) {
  const p = s.player, b = ball, point = techniquePoint(p, 'underhand');
  const at = b.y > point.y ? crossingPoint(b, point.y) ?? b : b;
  const d = Math.hypot(at.x - point.x, at.z - point.z);
  const offset = receiveOffset(s);
  return { stage, d, radius: underRadius(s), ...relative(p, at, point), pressed: offset !== null, offset, timing: timingOf(offset, windowScale(Math.hypot(b.vx, b.vy, b.vz))) };
}
// Timing cue: seconds until the ball reaches the contact height of the
// technique that will judge it (forehead for overhand, platform otherwise),
// the horizontal miss from that technique's point, and the ball's position then.
export function receiveContactEta(s) {
  const p = s.player, b = s.ball;
  if (!b.active) return null;
  const technique = nextJudgement(s, { dive: false })?.technique === 'overhand' ? 'overhand' : 'underhand';
  const point = techniquePoint(p, technique);
  const cp = crossingPoint(b, point.y);
  if (!cp) return null;
  return { t: cp.t, technique, miss: Math.hypot(cp.x - point.x, cp.z - point.z), ball: { x: cp.x, z: cp.z } };
}
// End-of-tick judgement. Returns the contact event, or null.
export function judgeTick(s, pose) {
  const j = s.judge, b = s.ball, p = s.player;
  if (!j || j.done || !b.active || s.contactEpisode) return null;
  const crossed = (y) => b.py > y && b.y <= y;
  if (p.action === 'dive' && p.diveTarget) return crossed(R.diveHeight) ? judgeDive(s, pose) : null;
  if (!j.over && crossed(techniquePoint(p, 'overhand').y)) {
    j.over = true;
    const r = judgeStage(s, pose, 'overhand');
    if (r) return r;
  }
  if (!j.under && crossed(techniquePoint(p, 'underhand').y)) {
    j.under = true;
    const r = judgeStage(s, pose, 'underhand');
    if (r) return r;
    j.miss = missInfo(s, 'under');
    j.done = true;
  }
  return null;
}
