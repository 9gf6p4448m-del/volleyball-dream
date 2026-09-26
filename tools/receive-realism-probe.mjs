// direct-v7 round 4 (stance + ball speed). Usage: node tools/receive-realism-probe.mjs
import { createDirectGame, stepDirectGame } from '../src/sim/directGame.js';
import { RECEIVE_ASSIST as A } from '../src/sim/directConstants.js';
import { chase } from './receive-assist-probe.mjs';

const aim = { x: 0, z: -1 };
// Stance: landing distance from the setter target, still vs moving at contact.
export function stanceSplit() {
  const c = chase({ recordSpeed: true });
  const rows = c.rows.filter((r) => r.tier !== 'POOR');
  const mean = (rs) => rs.reduce((v, r) => v + Math.hypot(r.x - A.target.x, r.z - A.target.z), 0) / (rs.length || 1);
  const still = rows.filter((r) => r.bodySpeed < 0.5), moving = rows.filter((r) => r.bodySpeed >= 2);
  return { still: still.length, moving: moving.length, stillMean: mean(still), movingMean: mean(moving) };
}
// Ball speed: how many press ticks give PERFECT for one incoming ball, the
// player standing still where the ball reaches the forearms.
export const BALLS = {
  slow: { x: 0, y: 3.4, z: 3.5, vx: 0, vy: 1, vz: 2 },
  receive: { x: 0, y: 2.8, z: 0.8, vx: 0, vy: 1, vz: 5 },
  serve: { x: 0, y: 2.8, z: -8, vx: 0, vy: 3, vz: 14 },
};
export function perfectWidth(ball) {
  // Where the ball reaches forearm height (0.6 body heights).
  const g = 9.81, y = 0.6 * 1.75, t = (ball.vy + Math.sqrt(ball.vy ** 2 + 2 * g * (ball.y - y))) / g;
  const spot = { x: ball.x + ball.vx * t, z: ball.z + ball.vz * t + 0.31 * 1.75 };
  const tiers = {}; let speed = 0;
  for (let press = 0; press < Math.round(t * 60) + 5; press++) {
    const s = createDirectGame(); s.player.x = spot.x; s.player.z = spot.z;
    Object.assign(s.ball, ball, { px: ball.x, py: ball.y, pz: ball.z, active: true });
    for (let k = 0; k < 200 && s.ball.active; k++) {
      stepDirectGame(s, [{ tick: s.tick, sequence: 0, move: { x: 0, z: 0 }, aim, action: k === press ? 'receive' : null }]);
      const e = s.events.find((x) => x.type === 'contact' && x.tier);
      if (e) { tiers[e.tier] = (tiers[e.tier] ?? 0) + 1; speed = e.ballSpeed; break; }
    }
  }
  return { perfect: tiers.PERFECT ?? 0, good: tiers.GOOD ?? 0, poor: tiers.POOR ?? 0, ballSpeed: +speed.toFixed(1) };
}
if (process.argv[1]?.endsWith('receive-realism-probe.mjs')) {
  console.log('stance', JSON.stringify(stanceSplit()));
  for (const [k, b] of Object.entries(BALLS)) console.log(k, JSON.stringify(perfectWidth(b)));
}
