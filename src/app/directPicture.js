// Picture-only smoothing of the practice page's drawn receive reach (W3,
// 2026-09-28). Pure and free of three.js so a node test can measure the very
// values the page draws (round 6, X3): the practice page and the test share
// this one rule instead of each keeping a copy.
import { DIRECT_PHYSICS } from '../sim/directConstants.js';

// The judgement zeroes the sim's receive reach in one tick (the ball sits on
// the un-reached arms). The drawn arms follow the sim's reach at the sim's own
// rate, so they never lag it, except that the one-tick drop eases back over a
// few frames. The sim never reads the drawn value.
export const REACH_EASE_STEP = DIRECT_PHYSICS.receiveReachSpeed / 60; // body heights per rendered frame

const ease = (from, to) => from + Math.max(-REACH_EASE_STEP, Math.min(REACH_EASE_STEP, to - from));

// The drawn reach for this frame: `shown` (last frame's drawn value) moved
// toward `sim` (the sim's receiveReach / receiveAhead) by at most REACH_EASE_STEP per axis.
export function easeReach(shown, sim) {
  return { side: ease(shown.side, sim.side), ahead: ease(shown.ahead, sim.ahead) };
}
