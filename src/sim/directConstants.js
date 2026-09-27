// SI units: metres, seconds, metres/second. Action durations are 60 Hz ticks.
export const DIRECT_DT = 1 / 60;
export const SIMULATION_VERSION = "direct-v8.2";
export const DIRECT_PHYSICS = Object.freeze({
  gravity: 9.81,
  radius: 0.105,
  acceleration: 24,
  friction: 18,
  speed: 5.5,
  jumpSpeed: 4.9,
  approachJumpBoost: 0.65,
  turnSpeed: 9, // radians/second; bounds moving contact-surface velocity
  receiveTurnSpeed: 4, // visible receive-only adjustment, radians/second
  receiveTurnLimit: 35 * Math.PI / 180,
  receiveTrackCone: 60 * Math.PI / 180,
  receiveTrackReach: 1.1, // body heights; tracking never enlarges the actual capsules
  // Platform reach (direct-v4 side reach; direct-v8 Q3 also forward): the
  // platform slides toward where the coming ball will be judged. Visible,
  // rate-limited, same capsules; fast enough to arrive within the 8-tick windup.
  receiveReachLimit: 0.25, // body heights
  receiveReachSpeed: 3, // body heights per second
  receiveReachMargin: 0.15, // metres inside the circle's edge at which the reach is full (none at the edge)
  platformFaceCos: 0.5, // capsule normal within 60 degrees of the platform face uses the face normal
  diveSpeed: 6.5,
  diveFriction: 7,
  courtHalfWidth: 4.5,
  courtHalfLength: 9,
  netHeight: 2.43,
  netHalfThickness: 0.025,
  substeps: 16,
  separation: 0.035,
  passiveRestitution: 0.45,
  activeRestitution: 0.8,
});
// direct-v7 receive assist (docs/kickoffs/direct-v7-receive-assist-acceptance.md):
// timing tiers, pass error and the overhand/underhand technique split. From
// direct-v8 the touch itself is decided by the rules in directReceiveRules.js.
export const RECEIVE_ASSIST = Object.freeze({
  underRadius: 0.5, // metres, horizontal, around the forearm platform centre (P2)
  overRadius: 0.35, // metres, horizontal, around the forehead point (P2)
  overHeight: 1.02, // body heights: forehead contact point
  overForward: 0.12, // body heights in front of the body
  shoulder: 0.82, // body heights: above this the pass is overhand
  windowPre: 2, // ticks before the receive windup ends
  windowPost: 2, // ticks after the active window ends
  perfectTicks: 2, // |offset from window centre| for PERFECT
  goodTicks: 4.5, // ... for GOOD; beyond is outside the window
  edgeRatio: 0.7, // contact beyond this share of the radius drops one tier
  target: Object.freeze({ x: 0, z: 1.6 }), // setter zone centre (own side)
  netClearance: 0.4, // metres: lowest target z (own side of the net)
  apex: 4.2, // metres: pass apex
  error: Object.freeze({ PERFECT: 0.35, GOOD: 1.2, POOR: 2.6 }), // metres, max landing error
  // Overhand is sharper than a forearm pass on slow balls and loses control on fast ones.
  overSlow: 7, overFast: 13, // ball speed m/s
  overSlowMultiplier: 0.6, overFastMultiplier: 2.2,
  // Round 4 (realism): a set stance passes more accurately than a running one,
  // and a fast ball leaves a narrower timing window than a soft one.
  stanceStill: 0.5, stanceRun: 5.5, // body speed m/s at contact
  stanceStillMultiplier: 0.7, stanceRunMultiplier: 1.6, // pass error
  unsetSpeed: 2, // body speed m/s from which the feedback says 「沒站穩」
  windowSlow: 6, windowFast: 14, // ball speed m/s
  windowSlowScale: 1.3, windowFastScale: 0.6, // PERFECT/GOOD width multiplier
  platformCueHeight: 0.6, // body heights: forearm platform height (underhand judgement height)
  cueRunAhead: 0.2, // seconds of the current run the predictions extrapolate
  overPoseLead: 0.25, // seconds before the overhand judgement at which the hands go up
  overPoseSpeed: 60, // hands-up blend per second
});
// direct-v8 stage 1 rules (docs/kickoffs/direct-v8-stage1-receive-acceptance.md):
// position + press timing decide every receive; physics only draws the body.
export const RECEIVE_RULES = Object.freeze({
  underForward: 0.31, // body heights: forearm platform centre ahead of the body (elbow 0.21 .. hand 0.41)
  diveReach: 1.5, // metres beyond the underhand circle that a dive can save (P3)
  diveHeight: 0.3, // metres: ball centre height at the dive judgement
  divePlatformForward: 0.665, // body heights: dive-pose forearm centre ahead of the body at full reach (directPose)
  diveMinReach: 0.45, // share of the full arm extension kept for a ball right beside the body
  diveMinSpeed: 1.5, // m/s: a dive always lunges, even toward a close ball
  // Dive timing window centre in action ticks (windup 6 + 14 of the 15 active
  // ticks): the same press lead as a receive, since the ball reaches the dive
  // height about 7 ticks after the platform height.
  diveWindowCentre: 20,
  // Total pass-error multiplier of a dive (its tier is capped at GOOD): the dive
  // takes no stance multiplier (1, not the set-stance 0.7 nor the running 1.6),
  // so this is the whole factor — 1.05, i.e. 1.5 × the set stance's 0.7 (Q6, 2026-09-27).
  diveErrorMultiplier: 1.05,
  slowMotionSpeed: 13, // m/s: a ball at least this fast is a hard ball
  slowMotionLead: 0.4, // seconds before the judgement in which the picture slows
  slowMotionScale: 0.5,
  sprayHorizontal: Object.freeze([1.0, 2.5]), // m/s: a sprayed ball trickles off the body
  sprayVertical: Object.freeze([1.5, 3.0]),
});
export const DIRECT_ACTIONS = Object.freeze({
  receive: { windup: 8, active: 10, recovery: 14 },
  spike: { windup: 12, active: 9, recovery: 18 },
  tip: { windup: 10, active: 12, recovery: 12 },
  set: { windup: 8, active: 10, recovery: 12 },
  block: { windup: 8, active: 20, recovery: 12 },
  // direct-v8: after the dive the body stays down 42 ticks (0.7 s, R4).
  dive: { windup: 6, active: 15, recovery: 42 },
});
