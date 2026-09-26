// SI units: metres, seconds, metres/second. Action durations are 60 Hz ticks.
export const DIRECT_DT = 1 / 60;
export const SIMULATION_VERSION = "direct-v7";
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
  // Side reach (direct-v4): the platform slides toward an off-centre ball while
  // the body squares up to the path. Visible, rate-limited, same capsules.
  receiveReachLimit: 0.2, // body heights
  receiveReachSpeed: 1.5, // body heights per second
  // Receive platform choice (direct-v4). Blends only during windup, then locks.
  passBlendSpeed: 15, // full blend units per second
  passYaw: 8 * Math.PI / 180, // LEFT/RIGHT platform yaw about the shoulder line
  passPitch: 0.04, // HIGH raises / LOW lowers the hands, body-height units
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
// a ball reaching the platform (underhand) or the forehead (overhand) within a
// radius during the receive window is passed; press timing sets the quality.
export const RECEIVE_ASSIST = Object.freeze({
  underRadius: 0.5, // metres, horizontal, around the forearm platform
  overRadius: 0.35, // metres, horizontal, around the forehead
  band: 0.25, // metres, vertical tolerance around either reference point
  overHeight: 1.02, // body heights: forehead contact point
  overForward: 0.12, // body heights in front of the body
  shoulder: 0.82, // body heights: above this the pass is overhand
  windowPre: 2, // ticks before the receive windup ends
  windowPost: 2, // ticks after the active window ends
  perfectTicks: 2, // |offset from window centre| for PERFECT
  goodTicks: 4.5, // ... for GOOD; beyond is POOR
  edgeRatio: 0.7, // contact beyond this share of the radius drops one tier
  target: Object.freeze({ x: 0, z: 1.6 }), // setter zone centre (own side)
  netClearance: 0.4, // metres: lowest target z (own side of the net)
  lateral: 1.2, // metres of target shift for a LEFT/RIGHT swipe
  apex: Object.freeze({ NEUTRAL: 4.2, HIGH: 5, LOW: 3.4, LEFT: 4.2, RIGHT: 4.2 }),
  error: Object.freeze({ PERFECT: 0.35, GOOD: 1.2, POOR: 2.6 }), // metres, max landing error
  // Overhand is sharper than a forearm pass on slow balls and loses control on fast ones.
  overSlow: 7, overFast: 13, // ball speed m/s
  overSlowMultiplier: 0.6, overFastMultiplier: 2.2,
  // Overhand pose: hands go up when a descending ball above the shoulders is
  // within this horizontal distance of the forehead point; blend per second.
  // Round 4 (realism): a set stance passes more accurately than a running one,
  // and a fast ball leaves a narrower timing window than a soft one.
  stanceStill: 0.5, stanceRun: 5.5, // body speed m/s at contact
  stanceStillMultiplier: 0.7, stanceRunMultiplier: 1.6, // pass error
  unsetSpeed: 2, // body speed m/s from which the feedback says 「沒站穩」
  windowSlow: 6, windowFast: 14, // ball speed m/s
  windowSlowScale: 1.3, windowFastScale: 0.6, // PERFECT/GOOD width multiplier
  platformCueHeight: 0.6, // body heights: forearm contact height used by the timing cue
  cueOverReach: 0.75, // metres: the timing cue treats a ball passing this close overhead as overhand
  cueRunAhead: 0.2, // seconds of the current run the timing cue extrapolates
  overPoseReach: 0.75, overPoseSpeed: 60,
});
export const DIRECT_ACTIONS = Object.freeze({
  receive: { windup: 8, active: 10, recovery: 14 },
  spike: { windup: 12, active: 9, recovery: 18 },
  tip: { windup: 10, active: 12, recovery: 12 },
  set: { windup: 8, active: 10, recovery: 12 },
  block: { windup: 8, active: 20, recovery: 12 },
  dive: { windup: 6, active: 15, recovery: 25 },
});
// Swipe choices map to platform blend targets [lateral, pitch]; never to a landing point.
export const PASS_TYPES = Object.freeze({
  NEUTRAL: Object.freeze([0, 0]),
  HIGH: Object.freeze([0, 1]),
  LOW: Object.freeze([0, -1]),
  LEFT: Object.freeze([-1, 0]),
  RIGHT: Object.freeze([1, 0]),
});
