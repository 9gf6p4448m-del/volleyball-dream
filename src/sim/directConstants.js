// SI units: metres, seconds, metres/second. Action durations are 60 Hz ticks.
export const DIRECT_DT = 1 / 60;
export const SIMULATION_VERSION = "direct-v1";
export const DIRECT_PHYSICS = Object.freeze({
  gravity: 9.81,
  radius: 0.105,
  acceleration: 24,
  friction: 18,
  speed: 5.5,
  jumpSpeed: 4.9,
  approachJumpBoost: 0.65,
  turnSpeed: 9, // radians/second; bounds moving contact-surface velocity
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
