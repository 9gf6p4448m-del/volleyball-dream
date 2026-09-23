import {
  DIRECT_DT,
  SIMULATION_VERSION,
  DIRECT_PHYSICS as C,
  DIRECT_ACTIONS,
} from "./directConstants.js";
import { getDirectPose } from "./directPose.js";
import { collideBody, bodySeparated } from "./directPhysics.js";
export { DIRECT_DT, SIMULATION_VERSION, getDirectPose };
export function createDirectGame({ seed = 1, height = 1.75 } = {}) {
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
      grounded: true,
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
  };
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
export function stepDirectGame(s, commands = []) {
  if (s.simulationVersion !== SIMULATION_VERSION)
    throw new Error("Unknown simulation version");
  s.events = [];
  const p = s.player,
    b = s.ball;
  s.poseAimStart = { ...p.aim };
  let move = { x: 0, z: 0 };
  let startDive = false;
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
  const dt = DIRECT_DT / C.substeps;
  for (let i = 0; i < C.substeps; i++) {
    const oldPose = getDirectPose(s, i / C.substeps);
    p.x = Math.max(-4.25, Math.min(4.25, p.x + p.vx * dt));
    p.z = Math.max(0.3, Math.min(8.75, p.z + p.vz * dt));
    if (!p.grounded) {
      p.vy -= C.gravity * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) {
        p.y = 0;
        p.vy = 0;
        p.grounded = true;
      }
    }
    const nextPose = getDirectPose(s, (i + 1) / C.substeps);
    if (!b.active) continue;
    b.vy -= C.gravity * dt;
    const prevZ = b.z;
    collideBody(s, oldPose, nextPose, dt);
    if (b.y <= b.radius) {
      b.y = b.radius;
      dead(s, "ground");
    } else if (
      Math.abs(b.x) > C.courtHalfWidth + b.radius ||
      Math.abs(b.z) > C.courtHalfLength + b.radius
    )
      dead(s, "out");
    else if (
      b.y - b.radius < C.netHeight &&
      Math.abs(b.x) < C.courtHalfWidth + b.radius &&
      Math.min(prevZ, b.z) <= C.netHalfThickness + b.radius &&
      Math.max(prevZ, b.z) >= -C.netHalfThickness - b.radius
    )
      dead(s, "net");
  }
  if (s.contactEpisode) {
    s.separationTicks = bodySeparated(b, getDirectPose(s, 1))
      ? s.separationTicks + 1
      : 0;
    if (s.separationTicks >= 3) {
      s.contactEpisode = false;
      s.separationTicks = 0;
    }
  }
  if (p.action) {
    p.actionTick++;
    const d = DIRECT_ACTIONS[p.action];
    if (p.actionTick >= d.windup + d.active + d.recovery) {
      p.action = null;
      p.actionTick = 0;
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
