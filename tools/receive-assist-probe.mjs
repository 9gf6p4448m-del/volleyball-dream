// direct-v7 receive-assist probe: every scenario is counted (touched or not).
// Usage: node tools/receive-assist-probe.mjs
import { createDirectGame, stepDirectGame, getDirectPose } from '../src/sim/directGame.js';
import { closestPoint } from '../src/sim/directPhysics.js';

// Gap (m) between the ball surface and the nearest forearm/hand surface, and
// the lower hand height in body heights, from the pose at the end of the tick.
export function armGap(s) {
  const pose = getDirectPose(s, 1), b = s.ball;
  let gap = Infinity;
  for (const q of pose) if (q.part === 'forearm' || q.part === 'hand') {
    const c = closestPoint(b, q.a, q.b);
    gap = Math.min(gap, Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z) - q.radius - b.radius);
  }
  const hands = pose.filter((q) => q.part === 'hand').map((q) => (q.a.y - s.player.y) / s.player.height);
  return { gap: Math.max(0, gap), handY: Math.min(...hands) };
}

const cmd = (s, action, move) => ({ tick: s.tick, sequence: 0, move, aim: { x: 0, z: -1 }, action });
const rot = ([x, z], deg) => { const a = deg * Math.PI / 180; return [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)]; };

export function sweep(sticks) {
  const c = { n: 0, whiff: 0, zone: 0, net: 0, out: 0, groundOther: 0, tiers: {}, tech: {} };
  for (const [sx, sz] of sticks) for (const z0 of [5.4, 5.8, 6.2]) for (const x0 of [-0.3, 0, 0.3])
    for (const m of [0.2, 0.35, 0.5, 0.8, 1.0]) for (let rt = 18; rt <= 40; rt++) {
      const s = createDirectGame(); s.player.x = x0; s.player.z = z0;
      let touched = false;
      for (let t = 0; t < 240; t++) {
        stepDirectGame(s, [cmd(s, t === 0 ? 'feed' : t === rt ? 'receive' : null, t >= 10 ? { x: sx * m, z: sz * m } : { x: 0, z: 0 })]);
        const hit = s.events.find((e) => e.type === 'contact');
        if (hit && !touched) {
          touched = true;
          if (hit.tier) c.tiers[hit.tier] = (c.tiers[hit.tier] ?? 0) + 1;
          if (hit.technique) c.tech[hit.technique] = (c.tech[hit.technique] ?? 0) + 1;
        }
        const end = s.events.find((e) => ['ground', 'net', 'out'].includes(e.type));
        if (end) {
          c.n++;
          if (!touched) c.whiff++;
          else if (end.type === 'net') c.net++;
          else if (end.type === 'out') c.out++;
          else if (s.ball.z >= 0.5 && s.ball.z <= 3 && Math.abs(s.ball.x) <= 3) c.zone++;
          else c.groundOther++;
          break;
        }
      }
    }
  return c;
}
export const SETS = {
  forward: [[0, -1]],
  diagonal: [[0.7, -0.7], [-0.7, -0.7]],
  // Human-like stick error: the diagonal pushed 10 degrees off either way.
  diagonalNoisy: [rot([0.7, -0.7], 10), rot([0.7, -0.7], -10), rot([-0.7, -0.7], 10), rot([-0.7, -0.7], -10)],
};
if (process.argv[1]?.endsWith('receive-assist-probe.mjs') && process.argv[2] !== 'chase') {
  for (const [k, v] of Object.entries(SETS)) {
    const c = sweep(v);
    const pct = (x) => (100 * x / c.n).toFixed(1) + '%';
    console.log(k, JSON.stringify({ n: c.n, whiff: pct(c.whiff), zone: `${c.zone} ${pct(c.zone)}`, net: c.net, out: c.out, other: c.groundOther, tiers: c.tiers, tech: c.tech }));
  }
}

// Human-like chase: after a reaction delay the player runs to where the ball
// will reach arm height, with a stance error, then presses early/late.
export const CHASE = { feeds: [], errors: [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3], [0.5, 0.3], [-0.5, -0.3]], offsets: [-9, -6, -3, 0, 3, 6, 9] };
for (const vx of [-1.5, 0, 1.5]) for (const vz of [4, 5, 6]) for (const vy of [0, 1.5]) CHASE.feeds.push({ x: 0, y: 2.8, z: 0.8, vx, vy, vz });
const G = 9.81;
function arrival(f, y) { // first time the falling ball reaches height y
  const a = -G / 2, b = f.vy, c = f.y - y; const t = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  return { t, x: f.x + f.vx * t, z: f.z + f.vz * t };
}
// contactHeight: body heights where the chaser meets the ball (0.44 ~ forearms;
// 1.02 = forehead, i.e. the player takes it overhead); forward: stance offset.
export function chase({ reaction = 12, contactHeight = 0.44, forward = 0.3 } = {}) {
  const c = { n: 0, whiff: 0, zone: 0, net: 0, out: 0, groundOther: 0, tiers: {}, tech: {}, rows: [] };
  for (const f of CHASE.feeds) for (const [px, pz] of [[-1, 6], [1, 6], [0, 7.5]]) for (const [ex, ez] of CHASE.errors) for (const off of CHASE.offsets) {
    const s = createDirectGame(); s.player.x = px; s.player.z = pz;
    Object.assign(s.ball, f, { px: f.x, py: f.y, pz: f.z, active: true });
    const a = arrival(f, contactHeight * s.player.height);
    const goal = { x: a.x + ex, z: a.z + forward * s.player.height + ez };
    const press = Math.round(a.t / (1 / 60)) - 13 + off;
    let touched = null;
    for (let t = 0; t < 240; t++) {
      const dx = goal.x - s.player.x, dz = goal.z - s.player.z, d = Math.hypot(dx, dz);
      const move = t < reaction || d < 0.08 ? { x: 0, z: 0 } : { x: dx / Math.max(d, 0.4), z: dz / Math.max(d, 0.4) };
      stepDirectGame(s, [cmd(s, t === Math.max(0, press) ? 'receive' : null, move)]);
      const hit = s.events.find((e) => e.type === 'contact');
      if (hit && !touched) {
        touched = { ...hit, ...armGap(s) };
        if (hit.tier) c.tiers[hit.tier] = (c.tiers[hit.tier] ?? 0) + 1;
        if (hit.technique) c.tech[hit.technique] = (c.tech[hit.technique] ?? 0) + 1;
      }
      const end = s.events.find((e) => ['ground', 'net', 'out'].includes(e.type));
      if (end) {
        c.n++;
        if (touched?.tier) c.rows.push({ tier: touched.tier, technique: touched.technique, assist: touched.id === 'assist', gap: touched.gap, handY: touched.handY, end: end.type, x: s.ball.x, z: s.ball.z });
        if (!touched) c.whiff++;
        else if (end.type === 'net') c.net++;
        else if (end.type === 'out') c.out++;
        else if (s.ball.z >= 0.5 && s.ball.z <= 3 && Math.abs(s.ball.x) <= 3) c.zone++;
        else c.groundOther++;
        break;
      }
    }
  }
  return c;
}
if (process.argv[1]?.endsWith('receive-assist-probe.mjs') && process.argv[2] === 'chase') {
  const c = chase(process.argv[3] === 'high' ? { contactHeight: 1.02, forward: 0.12 } : {}); const pct = (x) => (100 * x / c.n).toFixed(1) + '%';
  console.log('chase', JSON.stringify({ n: c.n, whiff: pct(c.whiff), zone: `${c.zone} ${pct(c.zone)}`, net: c.net, out: c.out, other: c.groundOther, tiers: c.tiers, tech: c.tech }));
}
