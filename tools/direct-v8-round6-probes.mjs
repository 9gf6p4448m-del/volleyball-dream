// direct-v8 stage 1, round 6 (fifth-review finding NEW-A; acceptance 修訂紀錄
// X1 of 2026-09-28). The reviewer's probes u2.mjs, u2chase.mjs and u2restore.mjs
// (scratchpad v8-r5-review/) moved into the repo; tests/direct-v8-round6.test.js
// asserts on what these return. Read-only: fresh games are stepped, nothing is
// written. The file runs on the archived old code (ff6e868) too: it imports
// only what exists there, so a red there comes from behaviour, not from a
// missing import.
// Usage: node tools/direct-v8-round6-probes.mjs [u2|u2-chase|u2-restore]
import { createDirectGame, stepDirectGame, getDirectPose, snapshotDirectGame, restoreDirectGame, replayDirectTape, serializeDirectState } from '../src/sim/directGame.js';
import { RECEIVE_ASSIST as A, DIRECT_PHYSICS as C } from '../src/sim/directConstants.js';
import { contactReason } from '../src/app/directReceiveReasons.js';
import { CHASE } from './receive-assist-probe.mjs';
import { PLATFORM } from './direct-v8-round4-probes.mjs';

const H = 1.75;
const cmd = (s, action = null, move = { x: 0, z: 0 }, aim = { x: 0, z: -1 }) => ({ tick: s.tick, sequence: 0, move, aim, action });
const terminal = (e) => ['ground', 'net', 'out'].includes(e.type);
const PRESS = 10, PUSH = 12; // the reviewer's u2: press at tick 10, stick pushed right from tick 12 on

// Pelvis height (m, the hips capsule) and torso lean from vertical (degrees) of
// the drawn pose — the X1 measures of a visible whiff.
export function poseMeasures(s) {
  const pose = getDirectPose(s);
  const hips = pose.find((q) => q.id === 'hips'), torso = pose.find((q) => q.id === 'torso');
  const dx = torso.b.x - torso.a.x, dy = torso.b.y - torso.a.y, dz = torso.b.z - torso.a.z;
  return { pelvisY: (hips.a.y + hips.b.y) / 2, torsoLeanDeg: Math.atan2(Math.hypot(dx, dz), dy) * 180 / Math.PI };
}

// X1 (NEW-A): the reviewer's u2 scenario. A ball at rest 2.5 m above a point
// inside a receive circle of a player at (0, 5) facing the net — 0.3 m beside
// the platform point (`circle` 'under') or 0.1 m beside the forehead point
// ('over') — `action` pressed at tick 10 (practice assignment = 魚躍: U2), the
// stick pushed right from tick 12 on, 120 ticks. Reports how long the action
// ran, when the body first answered the stick after it, the deepest whiff
// pose during it, and the judgement.
export function u2Scenario({ action = 'dive', circle = 'under' } = {}) {
  const s = createDirectGame();
  const at = circle === 'over' ? { x: 0.1, z: 5 - A.overForward * H } : { x: PLATFORM.x + 0.3, z: PLATFORM.z };
  Object.assign(s.ball, { x: at.x, y: 2.5, z: at.z, vx: 0, vy: 0, vz: 0, px: at.x, py: 2.5, pz: at.z, active: true });
  const rows = []; let contact = null;
  for (let t = 0; t < 120; t++) {
    stepDirectGame(s, [cmd(s, t === PRESS ? action : null, t >= PUSH ? { x: 1, z: 0 } : { x: 0, z: 0 })]);
    for (const e of s.events) if (e.type === 'contact' && !contact) contact = { ...e, t };
    rows.push({ t, x: s.player.x, vx: s.player.vx, action: s.player.action, stage: s.player.diveTarget?.stage ?? null, ...poseMeasures(s) });
  }
  const standing = rows[PRESS - 1];
  // The first tick whose end has no action any more: the action ran PRESS..endTick.
  const endTick = rows.find((r) => r.t > PRESS && r.action === null)?.t ?? null;
  const actionTicks = endTick === null ? null : endTick - PRESS + 1;
  const xAtEnd = endTick === null ? null : rows[endTick].x;
  const firstMoveTick = endTick === null ? null : rows.find((r) => r.t > endTick && Math.abs(r.x - xAtEnd) > 0.01)?.t ?? null;
  const during = rows.filter((r) => r.t >= PRESS && r.action !== null);
  return {
    rows, contact, text: contact ? contactReason(contact) : '', stage: rows[PRESS].stage, pressTick: PRESS, pushTick: PUSH,
    endTick, actionTicks, firstMoveTick, vxAfterEnd: endTick === null ? null : rows[endTick + 1]?.vx ?? null,
    maxPelvisDrop: Math.max(0, ...during.map((r) => standing.pelvisY - r.pelvisY)),
    maxTorsoLean: Math.max(0, ...during.map((r) => r.torsoLeanDeg)),
    standingTorsoLean: standing.torsoLeanDeg,
  };
}

// X1 (u2chase): the chase grid with five starts and every press a 魚躍 (the
// practice assignment): the judgement-frame snap of every U2 contact (a
// pressed spray with timing 'dive').
export function u2Chase() {
  const arrival = (f, y) => { const a = -C.gravity / 2, b = f.vy, c = f.y - y; const t = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a); return { t, x: f.x + f.vx * t, z: f.z + f.vz * t }; };
  const v = []; let runs = 0;
  for (const f of CHASE.feeds) for (const [px, pz] of [[-1, 6], [1, 6], [0, 7.5], [2, 6], [-2, 6]]) for (const [ex, ez] of CHASE.errors) for (const off of CHASE.offsets) {
    const s = createDirectGame(); s.player.x = px; s.player.z = pz;
    Object.assign(s.ball, f, { px: f.x, py: f.y, pz: f.z, active: true }); runs++;
    const a = arrival(f, 0.44 * H), goal = { x: a.x + ex, z: a.z + 0.3 * H + ez }, press = Math.round(a.t * 60) - 13 + off;
    for (let t = 0; t < 240; t++) {
      const dx = goal.x - s.player.x, dz = goal.z - s.player.z, d = Math.hypot(dx, dz);
      const move = t < 12 || d < 0.08 ? { x: 0, z: 0 } : { x: dx / Math.max(d, 0.4), z: dz / Math.max(d, 0.4) };
      stepDirectGame(s, [cmd(s, t === Math.max(0, press) ? 'dive' : null, move)]);
      for (const e of s.events) if (e.type === 'contact' && e.snapFrom && e.timing === 'dive') v.push(Math.hypot(e.snapFrom.x - e.position.x, e.snapFrom.y - e.position.y, e.snapFrom.z - e.position.z));
      if (s.events.some(terminal)) break;
    }
  }
  v.sort((a, b) => a - b);
  return { runs, n: v.length, p50: v[v.length >> 1] ?? null, max: v.at(-1) ?? null, over12: v.filter((x) => x > 1.2).length, over074: v.filter((x) => x > 0.74).length };
}

// X1 (u2restore, R11): three U2 tapes (a 魚躍 at tick 10 at a ball dropping
// into a circle, the stick pushed from tick 15), restored every 3 ticks and
// stepped to the end, plus a whole-tape replay: every state must be
// bit-identical to the recording.
export function u2Restore() {
  let checks = 0, bad = 0; const stages = new Set();
  for (const dx of [0.1, 0.3, -0.2]) {
    const s = createDirectGame({ seed: 3 }); const x = PLATFORM.x + dx, z = PLATFORM.z;
    Object.assign(s.ball, { x, y: 2.5, z, vx: 0, vy: 0, vz: 0, px: x, py: 2.5, pz: z, active: true });
    const initial = snapshotDirectGame(s), cmds = [], states = [];
    for (let t = 0; t < 110; t++) {
      const c = cmd(s, t === 10 ? 'dive' : null, t > 14 ? { x: 1, z: 0 } : { x: 0, z: 0 });
      cmds.push(c); stepDirectGame(s, [c]); states.push(snapshotDirectGame(s));
      if (s.player.action === 'dive') stages.add(s.player.diveTarget?.stage ?? null);
    }
    for (let from = 0; from < states.length - 1; from += 3) {
      const r = restoreDirectGame(states[from]);
      for (let t = r.tick; t < s.tick; t++) { stepDirectGame(r, [cmds[t]]); checks++; if (serializeDirectState(r) !== serializeDirectState(states[t])) { bad++; break; } }
    }
    const rep = replayDirectTape({ simulationVersion: s.simulationVersion, initial, commands: cmds, endTick: s.tick });
    checks++; if (serializeDirectState(rep) !== serializeDirectState(s)) bad++;
  }
  return { checks, bad, stages: [...stages] };
}

if (process.argv[1]?.endsWith('direct-v8-round6-probes.mjs')) {
  const which = process.argv[2] ?? 'u2';
  if (which === 'u2') {
    for (const circle of ['under', 'over']) {
      const r = u2Scenario({ circle });
      const show = (t) => { const q = r.rows[t]; return `t${t} x=${q.x.toFixed(3)} act=${q.action} pelvis=${q.pelvisY.toFixed(3)} lean=${q.torsoLeanDeg.toFixed(1)}°`; };
      console.log(JSON.stringify({ circle, stage: r.stage, actionTicks: r.actionTicks, endTick: r.endTick, firstMoveTick: r.firstMoveTick, vxAfterEnd: r.vxAfterEnd,
        maxPelvisDrop: +r.maxPelvisDrop.toFixed(3), maxTorsoLean: +r.maxTorsoLean.toFixed(1), standingTorsoLean: +r.standingTorsoLean.toFixed(1),
        contact: r.contact && { t: r.contact.t, timing: r.contact.timing, technique: r.contact.technique, tier: r.contact.tier ?? null, spray: !!r.contact.spray, part: r.contact.part }, text: r.text,
        samples: [9, 11, 14, 18, 25, 40, 44, 60].map(show) }, null, 1));
    }
  } else if (which === 'u2-chase') {
    console.log(JSON.stringify(u2Chase(), null, 1));
  } else if (which === 'u2-restore') {
    console.log(JSON.stringify(u2Restore(), null, 1));
  }
}
