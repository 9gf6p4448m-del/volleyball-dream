// SI units: metres, seconds, metres/second. Action durations are 60 Hz ticks.
export const DIRECT_DT = 1 / 60;
export const SIMULATION_VERSION = "direct-v4";
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
  // Receive platform choice (direct-v4). Blends only during windup, then locks.
  passBlendSpeed: 15, // full blend units per second
  passYaw: 20 * Math.PI / 180, // LEFT/RIGHT platform yaw about the shoulder line
  passPitch: 0.07, // HIGH raises / LOW lowers the hands, body-height units
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
