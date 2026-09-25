import {
  DIRECT_DT,
  SIMULATION_VERSION,
  DIRECT_PHYSICS as C,
  DIRECT_ACTIONS,
  PASS_TYPES,
} from "./directConstants.js";
import { getDirectPose } from "./directPose.js";
import { collideBody, bodySeparated, firstEnvironmentHit } from "./directPhysics.js";
import { receiveWindowOffset, timingTier, assistReach, passOutcome } from "./directReceiveAssist.js";
import { RECEIVE_ASSIST } from "./directConstants.js";
export { DIRECT_DT, SIMULATION_VERSION, getDirectPose };
// The receive platform is locked once the windup is over; the input layer
// uses the same check so the hit button label never disagrees with the sim.
export function receivePlatformLocked(p) {
  return p.action === 'receive' && p.actionTick >= DIRECT_ACTIONS.receive.windup;
}
export function createDirectGame({ seed = 1, height = 1.75, assist = null } = {}) {
  if (!Number.isFinite(height) || height < 1 || height > 2.5)
    throw new RangeError("height must be metres between 1 and 2.5");
  return {
    simulationVersion: SIMULATION_VERSION,
    seed: seed >>> 0,
    tick: 0,
    player: {
      x: 0,
      y: 0,
      z: 5,
      vx: 0,
      vy: 0,
      vz: 0,
      height,
      action: null,
      actionTick: 0,
      shotType: null,
      shotBlend: 0,
      receiveTurn: 0,
      receiveReach: 0,
      receiveOverhand: 0,
      receiveOverhandChosen: false,
      passType: null,
      passLateral: 0,
      passPitch: 0,
      grounded: true,
      gaitPhase: 0,
      gaitVx: 0,
      gaitVz: 0,
      landingAge: 1,
      aim: { x: 0, z: -1 },
    },
    ball: {
      x: 0,
      y: 0,
      z: 0,
      px: 0,
      py: 0,
      pz: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      radius: C.radius,
      active: false,
    },
    events: [],
    stats: { contacts: 0, feeds: 0, misses: 0 },
    contactEpisode: false,
    separationTicks: 0,
    // direct-v7: optional receive-assist radii override (practice sliders).
    assist: assist ? { underRadius: assist.underRadius, overRadius: assist.overRadius } : null,
    assistGhost: false,
  };
}
// direct-v7: replace the ball velocity with a timed pass and mark the contact.
function applyPass(s, event, { technique, tier, speed }) {
  const b = s.ball;
  const out = passOutcome({ from: b, ballSpeed: speed, technique, tier, passType: s.player.passType ?? 'NEUTRAL',
    seed: s.seed, tick: s.tick, salt: s.stats.contacts });
  b.vx = out.vx; b.vy = out.vy; b.vz = out.vz;
  Object.assign(event, { assisted: true, technique, tier, target: out.target, ballSpeed: speed });
  // The pass leaves from inside the magnet radius; body capsules must not re-catch it.
  s.assistGhost = true;
}
function feed(s, kind = "receive") {
  // Fixed world-space training feeds. Never teleports or follows the player.
  const values =
    kind === "spike"
      ? { x: 0.24, y: 4, z: 4.4, vx: 0, vy: 0, vz: 0 }
      : kind === "block"
        ? { x: 0, y: 3.3, z: -2, vx: 0, vy: 1, vz: 6 }
        : { x: 0, y: 2.8, z: 0.8, vx: 0, vy: 1, vz: 5 };
  Object.assign(s.ball, values, {
    px: values.x,
    py: values.y,
    pz: values.z,
    active: true,
  });
  s.contactEpisode = false;
  s.separationTicks = 0;
  s.assistGhost = false;
  s.stats.feeds++;
  s.events.push({ type: "feed", tick: s.tick, kind });
}
function dead(s, type) {
  s.ball.active = false;
  s.ball.vx = 0;
  s.ball.vy = 0;
  s.ball.vz = 0;
  s.stats.misses++;
  s.events.push({
    type,
    tick: s.tick,
    position: { x: s.ball.x, y: s.ball.y, z: s.ball.z },
  });
}
const approach = (x, target, max) =>
  x + Math.max(-max, Math.min(max, target - x));
function receiveTurnTarget(s) {
  const p = s.player, b = s.ball;
  const action = DIRECT_ACTIONS.receive;
  if (p.action !== 'receive' || p.actionTick >= action.windup + action.active) return { turn: 0, reach: 0 };
  const current = { turn: p.receiveTurn ?? 0, reach: p.receiveReach ?? 0 };
  // After contact, hold the platform through follow-through. Recovery then
  // returns to manual aim; an outgoing or passed ball never steers the body.
  if (!b.active || b.y <= b.radius || s.contactEpisode) return current;
  const dx = b.x - p.x, dz = b.z - p.z;
  const forward = dx * p.aim.x + dz * p.aim.z;
  const closing = dx * (b.vx - p.vx) + dz * (b.vz - p.vz);
  if (forward <= 0.2 * p.height || Math.hypot(dx, dz) > C.receiveTrackReach * p.height ||
      Math.abs(b.y - p.y - 0.65 * p.height) > 0.65 * p.height ||
      !(closing < -1e-6 || (Math.abs(closing) <= 1e-6 && b.vy < 0))) return current;
  // Square up to the incoming path (direction the ball comes from), so an
  // off-centre stance does not aim the platform sideways. A near-vertical ball
  // has no path direction; its bearing is used instead.
  // The ball's own (world) velocity: the athlete's movement must not change the path.
  const path = Math.hypot(b.vx, b.vz) > 0.5 ? Math.atan2(-b.vx, b.vz) : Math.atan2(dx, -dz);
  const aimAngle = Math.atan2(p.aim.x, -p.aim.z);
  const difference = Math.atan2(Math.sin(path - aimAngle), Math.cos(path - aimAngle));
  if (Math.abs(difference) > C.receiveTrackCone) return current;
  const turn = Math.max(-C.receiveTurnLimit, Math.min(C.receiveTurnLimit, difference));
  // Lateral offset of the ball in the squared-up body frame (right is positive).
  const facing = aimAngle + turn;
  const lateral = (dx * Math.cos(facing) + dz * Math.sin(facing)) / p.height;
  return { turn, reach: Math.max(-C.receiveReachLimit, Math.min(C.receiveReachLimit, lateral)) };
}
// direct-v7: raise the hands for an overhand pass when a descending ball above
// the shoulders is near the forehead point. Once chosen it is kept for this
// receive (p.receiveOverhandChosen), so the hands never drop back mid-pass.
function overhandTarget(s) {
  const p = s.player, b = s.ball, A = RECEIVE_ASSIST;
  if (p.action !== 'receive') return 0;
  if (p.receiveOverhandChosen) return 1;
  if (!b.active || s.contactEpisode) return 0;
  const angle = Math.atan2(p.aim.x, -p.aim.z) + (p.receiveTurn ?? 0);
  const hx = p.x + Math.sin(angle) * A.overForward * p.height, hz = p.z - Math.cos(angle) * A.overForward * p.height;
  // Predict where the ball passes closest to the forehead point (horizontally)
  // and how high it is then: overhand only if that contact point is above the shoulders.
  const vh = b.vx * b.vx + b.vz * b.vz;
  const t = vh > 1e-9 ? Math.max(0, ((hx - b.x) * b.vx + (hz - b.z) * b.vz) / vh) : 0;
  const d = Math.hypot(b.x + b.vx * t - hx, b.z + b.vz * t - hz);
  const y = b.y + b.vy * t - C.gravity * t * t / 2;
  p.receiveOverhandChosen = y - p.y >= A.shoulder * p.height && d <= A.overPoseReach;
  return p.receiveOverhandChosen ? 1 : 0;
}
// Pose used only for contact-surface velocity: the assist turn, side reach and
// platform choice held at their substep-start values, so none of them adds impulse.
export function restingSurfacePose(s, fraction, nextPose, before) {
  const p = s.player;
  const keys = ['receiveTurn', 'receiveReach', 'receiveOverhand', 'passLateral', 'passPitch'];
  // A key missing from `before` means its resting value, 0.
  if (keys.every((k) => (p[k] ?? 0) === (before[k] ?? 0))) return nextPose;
  const after = keys.map((k) => p[k]);
  keys.forEach((k) => { p[k] = before[k] ?? 0; });
  const pose = getDirectPose(s, fraction);
  keys.forEach((k, i) => { p[k] = after[i]; });
  return pose;
}
export function stepDirectGame(s, commands = []) {
  if (s.simulationVersion !== SIMULATION_VERSION)
    throw new Error("Unknown simulation version");
  s.events = [];
  const p = s.player,
    b = s.ball;
  s.poseAimStart = { ...p.aim };
  let move = { x: 0, z: 0 };
  let startDive = false;
  const shotTypes = ['LINE', 'CROSS_LEFT', 'CROSS_RIGHT', 'TIP'];
  for (const c of commands
    .filter((c) => c.tick === s.tick)
    .slice()
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))) {
    if (c.move && Number.isFinite(c.move.x) && Number.isFinite(c.move.z))
      move = c.move;
    if (
      c.aim &&
      Number.isFinite(c.aim.x) &&
      Number.isFinite(c.aim.z) &&
      Math.hypot(c.aim.x, c.aim.z) > 1e-6
    ) {
      const n = Math.hypot(c.aim.x, c.aim.z);
      p.aim = { x: c.aim.x / n, z: c.aim.z / n };
    }
    if (shotTypes.includes(c.shotType) &&
        ((p.action === 'spike' && p.actionTick < DIRECT_ACTIONS.spike.windup) ||
         (!p.action && c.action === 'spike'))) p.shotType = c.shotType;
    // A platform choice is accepted only while the receive is still in windup.
    if (typeof c.passType === 'string' && Object.hasOwn(PASS_TYPES, c.passType) && p.action === 'receive' &&
        !receivePlatformLocked(p)) p.passType = c.passType;
    if (c.action === "feed") feed(s, c.feedKind);
    else if (c.action === "jump" && p.grounded) {
      p.vy =
        C.jumpSpeed +
        C.approachJumpBoost * Math.min(1, Math.hypot(p.vx, p.vz) / C.speed);
      p.grounded = false;
      s.events.push({ type: "jump", tick: s.tick });
    } else if (DIRECT_ACTIONS[c.action] && !p.action) {
      p.action = c.action;
      p.actionTick = 0;
      p.shotType = c.action === 'spike' ? (shotTypes.includes(c.shotType) ? c.shotType : 'LINE') : null;
      p.passType = c.action === 'receive'
        ? (typeof c.passType === 'string' && Object.hasOwn(PASS_TYPES, c.passType) ? c.passType : 'NEUTRAL') : null;
      if (c.action === "dive" && p.grounded) {
        startDive = true;
      }
      s.events.push({ type: "action", tick: s.tick, action: c.action });
    }
  }
  const initialAngle = Math.atan2(s.poseAimStart.x, -s.poseAimStart.z);
  const targetAngle = Math.atan2(p.aim.x, -p.aim.z);
  const turn = Math.atan2(
    Math.sin(targetAngle - initialAngle),
    Math.cos(targetAngle - initialAngle),
  );
  const angle =
    initialAngle +
    Math.max(-C.turnSpeed * DIRECT_DT, Math.min(C.turnSpeed * DIRECT_DT, turn));
  p.aim = { x: Math.sin(angle), z: -Math.cos(angle) };
  if (startDive) {
    p.vx = p.aim.x * C.diveSpeed;
    p.vz = p.aim.z * C.diveSpeed;
  }
  const n = Math.max(1, Math.hypot(move.x, move.z));
  if (p.action === "dive") {
    p.vx = approach(p.vx, 0, C.diveFriction * DIRECT_DT);
    p.vz = approach(p.vz, 0, C.diveFriction * DIRECT_DT);
  } else {
    p.vx = approach(
      p.vx,
      (move.x / n) * C.speed,
      (move.x ? C.acceleration : C.friction) * DIRECT_DT,
    );
    p.vz = approach(
      p.vz,
      (move.z / n) * C.speed,
      (move.z ? C.acceleration : C.friction) * DIRECT_DT,
    );
  }
  b.px = b.x;
  b.py = b.y;
  b.pz = b.z;
  const receiveTarget = receiveTurnTarget(s);
  const overTarget = overhandTarget(s);
  const dt = DIRECT_DT / C.substeps;
  for (let i = 0; i < C.substeps; i++) {
    const oldPose = getDirectPose(s, i / C.substeps);
    // Move the same body pose used by rendering and swept collision. There is
    // no ball impulse, target landing point, or extra reach in this assistance.
    const turnBefore = p.receiveTurn ?? 0, reachBefore = p.receiveReach ?? 0, overBefore = p.receiveOverhand ?? 0;
    const lateralBefore = p.passLateral ?? 0, pitchBefore = p.passPitch ?? 0;
    p.receiveTurn = approach(turnBefore, receiveTarget.turn, C.receiveTurnSpeed * dt);
    p.receiveReach = approach(reachBefore, receiveTarget.reach, C.receiveReachSpeed * dt);
    p.receiveOverhand = approach(overBefore, overTarget, RECEIVE_ASSIST.overPoseSpeed * dt);
    const oldX = p.x, oldZ = p.z;
    p.x = Math.max(-4.25, Math.min(4.25, p.x + p.vx * dt));
    p.z = Math.max(0.3, Math.min(8.75, p.z + p.vz * dt));
    // Actual forward travel this substep (zero against the court boundary).
    p.moveVz = (p.z - oldZ) / dt;
    // Distance, not wall-clock animation time, drives the collision-bearing gait.
    // Smooth the actual displacement so a player against the boundary stops stepping.
    p.gaitVx = approach(p.gaitVx ?? 0, (p.x - oldX) / dt, 35 * dt);
    p.gaitVz = approach(p.gaitVz ?? 0, (p.z - oldZ) / dt, 35 * dt);
    if (Math.abs(p.gaitVx) < 1e-8) p.gaitVx = 0;
    if (Math.abs(p.gaitVz) < 1e-8) p.gaitVz = 0;
    if (p.grounded && p.action !== 'dive')
      p.gaitPhase = ((p.gaitPhase ?? 0) + Math.hypot(p.x - oldX, p.z - oldZ) * 5 / p.height) % (Math.PI * 2);
    // Shot intent may switch during windup, but the contact arm must traverse
    // the intermediate poses through the same swept-collision substeps.
    p.shotBlend = approach(p.shotBlend ?? 0, p.shotType === 'TIP' ? 1 : 0, dt * 12);
    // The platform angle moves only before the contact window, so its rate of
    // change can never become contact-surface velocity. Late choices stay partial.
    if (p.action === 'receive' && p.actionTick + (i + 1) / C.substeps < DIRECT_ACTIONS.receive.windup) {
      const [lateral, pitch] = PASS_TYPES[p.passType] ?? PASS_TYPES.NEUTRAL;
      p.passLateral = approach(p.passLateral, lateral, C.passBlendSpeed * dt);
      p.passPitch = approach(p.passPitch, pitch, C.passBlendSpeed * dt);
    }
    p.landingAge = Math.min(1, (p.landingAge ?? 1) + dt);
    if (!p.grounded) {
      p.vy -= C.gravity * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) {
        p.y = 0;
        p.vy = 0;
        p.grounded = true;
        p.landingAge = 0;
      }
    }
    const nextPose = getDirectPose(s, (i + 1) / C.substeps);
    if (!b.active) continue;
    b.vy -= C.gravity * dt;
    const predicted = { x: b.x + b.vx * dt, y: b.y + b.vy * dt, z: b.z + b.vz * dt };
    let terminal = firstEnvironmentHit(b, predicted, b.radius);
    const offset = s.contactEpisode ? null : receiveWindowOffset(p, (i + 1) / C.substeps);
    if (s.assistGhost && s.contactEpisode) {
      Object.assign(b, predicted);
      if (terminal) {
        Object.assign(b, terminal.position);
        if (terminal.type === 'ground') b.y = b.radius;
        dead(s, terminal.type);
      }
      continue;
    }
    const speedBefore = Math.hypot(b.vx, b.vy, b.vz);
    const eventsBefore = s.events.length;
    // The sweep follows the turning body and the blending platform, but the
    // contact-surface velocity excludes both, so neither the assist turn nor the
    // platform choice ever swings the ball like a bat.
    const surfacePose = restingSurfacePose(s, (i + 1) / C.substeps, nextPose, {
      receiveTurn: turnBefore, receiveReach: reachBefore, receiveOverhand: overBefore, passLateral: lateralBefore, passPitch: pitchBefore,
    });
    const contact = collideBody(s, oldPose, nextPose, dt, terminal?.t ?? Infinity, surfacePose);
    // direct-v7: a real forearm/hand hit inside the receive window is a timed pass too.
    const hitEvent = contact && s.events.slice(eventsBefore).find((e) => e.type === 'contact');
    if (hitEvent && offset !== null && hitEvent.active && (hitEvent.part === 'forearm' || hitEvent.part === 'hand')) {
      const technique = p.receiveOverhandChosen ? 'overhand' : 'underhand';
      applyPass(s, hitEvent, { technique, tier: timingTier(offset, 0), speed: speedBefore });
    }
    // A valid earlier body hit changes the rest of the trajectory. Check that
    // new segment too, rather than retaining the pre-contact floor/net decision.
    if (contact) terminal = firstEnvironmentHit(contact.position, b, b.radius);
    if (terminal) {
      Object.assign(b, terminal.position);
      if (terminal.type === 'ground') b.y = b.radius;
      dead(s, terminal.type);
    }
  }
  // A near miss inside the magnet radius is passed at the end of the tick, so
  // any real touch during the tick's substeps always goes first.
  const offset = s.contactEpisode || !b.active ? null : receiveWindowOffset(p, 1);
  if (offset !== null && b.vy < 0) {
    const reach = assistReach(s, getDirectPose(s, 1), b);
    if (reach) {
      s.contactEpisode = true;
      s.stats.contacts++;
      const event = { type: 'contact', tick: s.tick, part: reach.technique === 'overhand' ? 'hand' : 'forearm',
        id: 'assist', active: true, position: { x: b.x, y: b.y, z: b.z } };
      s.events.push(event);
      applyPass(s, event, { technique: reach.technique, tier: timingTier(offset, reach.ratio), speed: Math.hypot(b.vx, b.vy, b.vz) });
    }
  }
  if (s.contactEpisode) {
    s.separationTicks = bodySeparated(b, getDirectPose(s, 1))
      ? s.separationTicks + 1
      : 0;
    if (s.separationTicks >= 3) {
      s.contactEpisode = false;
      s.separationTicks = 0;
      s.assistGhost = false;
    }
  }
  if (p.action) {
    p.actionTick++;
    const d = DIRECT_ACTIONS[p.action];
    if (p.actionTick >= d.windup + d.active + d.recovery) {
      p.action = null;
      p.actionTick = 0;
      p.shotType = null;
      p.passType = null;
      p.passLateral = 0;
      p.passPitch = 0;
      p.receiveOverhand = 0;
      p.receiveOverhandChosen = false;
    }
  }
  delete s.poseAimStart;
  s.tick++;
  return s;
}
export function snapshotDirectGame(s) {
  return JSON.parse(JSON.stringify(s));
}
export function restoreDirectGame(snapshot) {
  if (snapshot?.simulationVersion !== SIMULATION_VERSION)
    throw new Error("Unknown simulation version");
  return snapshotDirectGame(snapshot);
}
export function serializeDirectState(s) {
  const stable = (v) =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, stable(v[k])]),
          )
        : v;
  return JSON.stringify(stable(s));
}
export function replayDirectTape({
  simulationVersion,
  initial,
  commands = [],
  endTick,
}) {
  if (simulationVersion !== SIMULATION_VERSION)
    throw new Error("Unknown simulation version");
  const s = restoreDirectGame(initial);
  if (!Number.isInteger(endTick) || endTick < s.tick)
    throw new RangeError("Invalid endTick");
  const byTick = new Map();
  for (const c of commands) {
    if (!byTick.has(c.tick)) byTick.set(c.tick, []);
    byTick.get(c.tick).push(c);
  }
  while (s.tick < endTick) stepDirectGame(s, byTick.get(s.tick) || []);
  return s;
}
