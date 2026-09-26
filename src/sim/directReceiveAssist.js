// direct-v7 receive quality: timing tiers and the pass to the setter zone.
// Pure sim: no three.js, deterministic. From direct-v8 the touch itself is
// decided by directReceiveRules.js; this file only grades and sends the pass.
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
const lerpClamp = (v, v0, v1, a, b) => a + (b - a) * Math.max(0, Math.min(1, (v - v0) / (v1 - v0)));
// Timing window width multiplier for a ball arriving at this speed.
export function windowScale(ballSpeed = A.windowSlow) {
  return lerpClamp(ballSpeed, A.windowSlow, A.windowFast, A.windowSlowScale, A.windowFastScale);
}
// Pass error multiplier for the body speed at contact.
export function stanceMultiplier(bodySpeed = 0) {
  return lerpClamp(bodySpeed, A.stanceStill, A.stanceRun, A.stanceStillMultiplier, A.stanceRunMultiplier);
}
export function timingTier(offset, distanceRatio = 0, ballSpeed) {
  const k = ballSpeed === undefined ? 1 : windowScale(ballSpeed);
  let i = Math.abs(offset) <= A.perfectTicks * k ? 0 : Math.abs(offset) <= A.goodTicks * k ? 1 : 2;
  if (distanceRatio > A.edgeRatio) i = Math.min(2, i + 1);
  return TIERS[i];
}
export function rng(seed, a, b) {
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
// Outgoing velocity of a pass: a lob to the setter zone centre, off by an
// error that grows with worse timing, with an overhand on a fast ball, with a
// running stance and (direct-v8) with a dive. `stance` overrides the stance
// multiplier (a dive is neither a set nor a running stance: 1).
export function passOutcome({ from, ballSpeed, technique, tier, seed = 1, tick = 0, salt = 0, bodySpeed = 0, errorMultiplier = 1, stance = stanceMultiplier(bodySpeed) }) {
  const random = rng(seed >>> 0, tick, salt);
  const radius = A.error[tier] * techniqueMultiplier(technique, ballSpeed) * stance * errorMultiplier * Math.sqrt(random());
  const angle = random() * Math.PI * 2;
  // A bad pass may fly wide or long but is never aimed over the net.
  const target = { x: A.target.x + Math.cos(angle) * radius,
    z: Math.max(A.netClearance, A.target.z + Math.sin(angle) * radius) };
  let apex = A.apex;
  if (tier === 'POOR') apex *= 0.75 + 0.35 * random();
  apex = Math.max(apex, from.y + 0.3);
  const vy = Math.sqrt(2 * C.gravity * (apex - from.y));
  const time = vy / C.gravity + Math.sqrt(2 * (apex - C.radius) / C.gravity);
  return { vx: (target.x - from.x) / time, vy, vz: (target.z - from.z) / time, target };
}
