// direct-v7: press on the practice page's gold "press now" cue (same rehearsal
// logic as directPractice.pressNowReaches) and record the pass tier per technique.
// Usage: node tools/receive-cue-probe.mjs
import { createDirectGame, stepDirectGame, snapshotDirectGame } from '../src/sim/directGame.js';
import { DIRECT_ACTIONS, DIRECT_PHYSICS } from '../src/sim/directConstants.js';
import { CHASE } from './receive-assist-probe.mjs';

const G = 9.81, aim = { x: 0, z: -1 };
const cmd = (s, action, move) => ({ tick: s.tick, sequence: 0, move, aim, action });
function platformArrival(s) {
  const { player: p, ball: b } = s;
  if (!b.active) return null;
  const drop = b.y - (p.y + 0.6 * p.height), disc = b.vy * b.vy + 2 * DIRECT_PHYSICS.gravity * drop;
  return disc < 0 ? null : (b.vy + Math.sqrt(disc)) / DIRECT_PHYSICS.gravity;
}
function pressNowReaches(s) {
  const copy = snapshotDirectGame(s);
  const window = DIRECT_ACTIONS.receive.windup + DIRECT_ACTIONS.receive.active;
  for (let i = 0; i < window && copy.ball.active; i++) {
    stepDirectGame(copy, [{ tick: copy.tick, sequence: 0, move: { x: 0, z: 0 }, aim, action: i === 0 ? 'receive' : null }]);
    const c = copy.events.find((e) => e.type === 'contact');
    if (c) return c.active && (c.part === 'forearm' || c.part === 'hand');
  }
  return false;
}
function arrival(f, y) {
  const a = -G / 2, b = f.vy, c = f.y - y;
  const t = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  return { t, x: f.x + f.vx * t, z: f.z + f.vz * t };
}
// Chaser stands where the ball meets the forehead (overhand) or forearms (underhand),
// then presses `delay` ticks after the cue first turns gold.
export function cueRun({ contactHeight, forward, delay }) {
  const out = { n: 0, noCue: 0, tiers: {}, byTech: {}, contactTicks: {} };
  for (const f of CHASE.feeds) for (const [px, pz] of [[-1, 6], [1, 6], [0, 7.5]]) {
    const s = createDirectGame(); s.player.x = px; s.player.z = pz;
    Object.assign(s.ball, f, { px: f.x, py: f.y, pz: f.z, active: true });
    const a = arrival(f, contactHeight * s.player.height);
    const goal = { x: a.x, z: a.z + forward * s.player.height };
    let cueTick = null, hit = null;
    for (let t = 0; t < 240 && s.ball.active; t++) {
      const dx = goal.x - s.player.x, dz = goal.z - s.player.z, d = Math.hypot(dx, dz);
      const arr = platformArrival(s);
      if (cueTick === null && !s.player.action && arr != null && arr <= 0.4 && pressNowReaches(s)) cueTick = t;
      const press = cueTick !== null && t === cueTick + delay;
      stepDirectGame(s, [cmd(s, press ? 'receive' : null, t < 12 || d < 0.08 ? { x: 0, z: 0 } : { x: dx / Math.max(d, 0.4), z: dz / Math.max(d, 0.4) })]);
      hit ??= s.events.find((e) => e.type === 'contact' && e.tier) ? { ...s.events.find((e) => e.type === 'contact'), actionTick: s.player.actionTick } : null;
    }
    out.n++;
    if (cueTick === null) { out.noCue++; continue; }
    if (!hit) continue;
    const k = `${hit.technique}:${hit.tier}`;
    out.tiers[k] = (out.tiers[k] ?? 0) + 1;
    (out.contactTicks[hit.technique] ??= {})[hit.actionTick] = ((out.contactTicks[hit.technique] ?? {})[hit.actionTick] ?? 0) + 1;
  }
  return out;
}
if (process.argv[1]?.endsWith('receive-cue-probe.mjs')) {
  for (const [name, o] of [['forearm', { contactHeight: 0.59, forward: 0.31 }], ['overhead', { contactHeight: 1.02, forward: 0.12 }]])
    for (const delay of [0, 3, 6]) console.log(name, 'delay', delay, JSON.stringify(cueRun({ ...o, delay })));
}

// Human anticipation rule: press when the cue's time-to-contact first drops to
// `lead` seconds (the ring shrinks toward it). `eta(s)` is the cue under test.
export function leadRun({ contactHeight, forward, lead, eta }) {
  const out = { n: 0, pressed: 0, touched: 0, tiers: {} };
  for (const f of CHASE.feeds) for (const [px, pz] of [[-1, 6], [1, 6], [0, 7.5]]) for (const [ex, ez] of CHASE.errors) {
    const s = createDirectGame(); s.player.x = px; s.player.z = pz;
    Object.assign(s.ball, f, { px: f.x, py: f.y, pz: f.z, active: true });
    const a = arrival(f, contactHeight * s.player.height);
    const goal = { x: a.x + ex * 0.5, z: a.z + forward * s.player.height + ez * 0.5 };
    let pressed = false, hit = null;
    for (let t = 0; t < 240 && s.ball.active; t++) {
      const dx = goal.x - s.player.x, dz = goal.z - s.player.z, d = Math.hypot(dx, dz);
      const e = t >= 12 && !pressed ? eta(s) : null;
      const press = e != null && e <= lead;
      if (press) pressed = true;
      stepDirectGame(s, [cmd(s, press ? 'receive' : null, t < 12 || d < 0.08 ? { x: 0, z: 0 } : { x: dx / Math.max(d, 0.4), z: dz / Math.max(d, 0.4) })]);
      const found = s.events.find((x) => x.type === 'contact' && x.tier);
      if (found && !hit) hit = { ...found, actionTick: s.player.actionTick };
    }
    out.n++; if (pressed) out.pressed++;
    if (hit) { out.touched++; const k = `${hit.technique}:${hit.tier}`; out.tiers[k] = (out.tiers[k] ?? 0) + 1; (out.hits ??= []).push(hit); }
  }
  return out;
}
// The current cue: time until the ball reaches platform height (0.6 body heights).
export const platformEta = (s) => platformArrival(s);
export const nonPoor = (o, tech) => {
  const n = (k) => o.tiers[`${tech}:${k}`] ?? 0, all = n('PERFECT') + n('GOOD') + n('POOR');
  return { all, ok: all ? (n('PERFECT') + n('GOOD')) / all : 0 };
};
