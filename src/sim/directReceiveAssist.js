// direct-v7 receive assist. Pure sim: no three.js, deterministic.
// Acceptance: docs/kickoffs/direct-v7-receive-assist-acceptance.md
import { DIRECT_PHYSICS as C, DIRECT_ACTIONS, RECEIVE_ASSIST as A } from './directConstants.js';

const TIERS = ['PERFECT', 'GOOD', 'POOR'];

// Receive window in fractional action ticks, or null outside it.
export function receiveWindowOffset(p, fraction = 0) {
  const r = DIRECT_ACTIONS.receive;
  if (p.action !== 'receive') return null;
  const t = p.actionTick + fraction - (r.windup - A.windowPre);
  const length = A.windowPre + r.active + A.windowPost;
  if (t < 0 || t >= length) return null;
  return t - length / 2;
}
export function timingTier(offset, distanceRatio = 0) {
  let i = Math.abs(offset) <= A.perfectTicks ? 0 : Math.abs(offset) <= A.goodTicks ? 1 : 2;
  if (distanceRatio > A.edgeRatio) i = Math.min(2, i + 1);
  return TIERS[i];
}
function facing(p) {
  const angle = Math.atan2(p.aim.x, -p.aim.z) + (p.receiveTurn ?? 0);
  return { x: Math.sin(angle), z: -Math.cos(angle) };
}
function platformCentre(pose) {
  const arms = pose.filter((q) => q.part === 'forearm');
  if (arms.length !== 2) return null;
  const pts = arms.flatMap((q) => [q.a, q.b]);
  return { x: pts.reduce((v, q) => v + q.x, 0) / 4, y: pts.reduce((v, q) => v + q.y, 0) / 4, z: pts.reduce((v, q) => v + q.z, 0) / 4 };
}
// The ball is caught where it reaches the contact height (not the top of the
// band), so a press timed to meet the ball scores at the window centre.
const atHeight = (ball, y) => ball.y - y <= 0.02 && ball.y - y >= -A.band;
// Which technique, if any, reaches the ball at this position.
export function assistReach(s, pose, ball, radii = s.assist ?? {}) {
  const p = s.player, f = facing(p), h = p.height;
  const under = radii.underRadius ?? A.underRadius, over = radii.overRadius ?? A.overRadius;
  const inFront = (ball.x - p.x) * f.x + (ball.z - p.z) * f.z >= -0.15;
  if (!inFront) return null;
  const head = { x: p.x + f.x * A.overForward * h, y: p.y + A.overHeight * h, z: p.z + f.z * A.overForward * h };
  // The overhand choice (made while the ball is still above the shoulders) decides the technique.
  if (p.receiveOverhandChosen) {
    const d = Math.hypot(ball.x - head.x, ball.z - head.z);
    if (d <= over && atHeight(ball, head.y)) return { technique: 'overhand', ratio: d / over };
    return null;
  }
  const c = platformCentre(pose);
  if (!c) return null;
  const d = Math.hypot(ball.x - c.x, ball.z - c.z);
  if (d <= under && atHeight(ball, c.y)) return { technique: 'underhand', ratio: d / under };
  return null;
}
function rng(seed, a, b) {
  let t = (seed ^ Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b)) >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
export function techniqueMultiplier(technique, ballSpeed) {
  if (technique !== 'overhand') return 1;
  const k = Math.max(0, Math.min(1, (ballSpeed - A.overSlow) / (A.overFast - A.overSlow)));
  return A.overSlowMultiplier + (A.overFastMultiplier - A.overSlowMultiplier) * k;
}
// Outgoing velocity of an assisted pass: a lob to the setter zone, off by an
// error that grows with worse timing and with an overhand on a fast ball.
export function passOutcome({ from, ballSpeed, technique, tier, passType = 'NEUTRAL', seed = 1, tick = 0, salt = 0 }) {
  const random = rng(seed >>> 0, tick, salt);
  const lateral = passType === 'LEFT' ? -A.lateral : passType === 'RIGHT' ? A.lateral : 0;
  const radius = A.error[tier] * techniqueMultiplier(technique, ballSpeed) * Math.sqrt(random());
  const angle = random() * Math.PI * 2;
  // A bad pass may fly wide or long but is never aimed over the net.
  const target = { x: A.target.x + lateral + Math.cos(angle) * radius,
    z: Math.max(A.netClearance, A.target.z + Math.sin(angle) * radius) };
  let apex = A.apex[passType] ?? A.apex.NEUTRAL;
  if (tier === 'POOR') apex *= 0.75 + 0.35 * random();
  apex = Math.max(apex, from.y + 0.3);
  const vy = Math.sqrt(2 * C.gravity * (apex - from.y));
  const time = vy / C.gravity + Math.sqrt(2 * (apex - C.radius) / C.gravity);
  return { vx: (target.x - from.x) / time, vy, vz: (target.z - from.z) / time, target };
}
