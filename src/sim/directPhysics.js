import { DIRECT_PHYSICS as C } from "./directConstants.js";
const lerp = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function closestPoint(p, a, b) {
  const x = b.x - a.x,
    y = b.y - a.y,
    z = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * x + (p.y - a.y) * y + (p.z - a.z) * z) /
        (x * x + y * y + z * z || 1),
    ),
  );
  return { ...lerp(a, b, t), t };
}
// Conservative advancement over each short curved-pose interval. The distance
// Lipschitz bound includes BOTH endpoint displacements, so fast translating balls
// cannot jump over a capsule even when no displayed frame overlaps it.
export function sweepCapsule(start, end, old, next, radius) {
  const bound =
    distance(start, end) +
    Math.max(distance(old.a, next.a), distance(old.b, next.b));
  const sample = (t) => {
    const center = lerp(start, end, t);
    const q = closestPoint(center, lerp(old.a, next.a, t), lerp(old.b, next.b, t));
    const d = distance(center, q);
    return { t, center, q, d, gap: d - radius - next.radius };
  };
  let t = 0;
  for (let i = 0; i < 80; i++) {
    const center = lerp(start, end, t),
      a = lerp(old.a, next.a, t),
      b = lerp(old.b, next.b, t);
    const q = closestPoint(center, a, b),
      d = distance(center, q),
      gap = d - radius - next.radius;
    if (gap <= 0.00001) return { t, center, q, d };
    if (bound < 1e-12) return null;
    t += Math.max(0.0000001, (gap / bound) * 0.95);
    if (t > 1) return null;
  }
  // Grazing trajectories converge slowly. Exhausting advancement is not proof
  // of separation. Search the remaining interval using the same Lipschitz bound,
  // in chronological order, until its spatial uncertainty is at most 10 microns.
  function refine(lo, hi, depth = 0) {
    const middle = sample((lo + hi) / 2);
    const uncertainty = bound * (hi - lo) / 2;
    if (middle.gap > uncertainty + 0.00001) return null;
    if (uncertainty <= 0.000005) return middle.gap <= 0.00001 ? middle : null;
    if (depth >= 32) throw new RangeError('Direct CCD interval exceeds supported displacement');
    return refine(lo, middle.t, depth + 1) || refine(middle.t, hi, depth + 1);
  }
  return refine(t, 1);
}
// surfacePose (same capsules as nextPose) supplies only the contact-surface
// velocity, so motion that must not add impulse can be excluded from it.
// Receive platform (direct-v4): both active forearms form one flat surface.
// A ball arriving on that face rebounds off the plane normal instead of the
// side of a single cylinder. Detection still uses the unchanged capsules.
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const unit = (v) => {
  const l = Math.hypot(v.x, v.y, v.z);
  return l > 1e-9 ? { x: v.x / l, y: v.y / l, z: v.z / l } : null;
};
export function platformNormal(pose, { requireActive = true } = {}) {
  const left = pose.find((s) => s.id === "left-forearm"),
    right = pose.find((s) => s.id === "right-forearm");
  if (!left || !right || (requireActive && (!left.active || !right.active))) return null;
  const axis = unit({
    x: left.b.x - left.a.x + right.b.x - right.a.x,
    y: left.b.y - left.a.y + right.b.y - right.a.y,
    z: left.b.z - left.a.z + right.b.z - right.a.z,
  });
  if (!axis) return null;
  const across = sub(lerp(right.a, right.b, 0.5), lerp(left.a, left.b, 0.5));
  const w = unit(sub(across, { x: axis.x * dot(across, axis), y: axis.y * dot(across, axis), z: axis.z * dot(across, axis) }));
  if (!w) return null;
  // axis x across, oriented to the upper (ball-receiving) face.
  const n = unit({ x: axis.y * w.z - axis.z * w.y, y: axis.z * w.x - axis.x * w.z, z: axis.x * w.y - axis.y * w.x });
  return n && n.y < 0 ? { x: -n.x, y: -n.y, z: -n.z } : n;
}
export function collideBody(state, oldPose, nextPose, dt, stopAt = Infinity, surfacePose = nextPose) {
  const b = state.ball,
    start = { x: b.x, y: b.y, z: b.z },
    end = { x: b.x + b.vx * dt, y: b.y + b.vy * dt, z: b.z + b.vz * dt };
  let earliest = null;
  for (let i = 0; i < nextPose.length; i++) {
    const hit = sweepCapsule(start, end, oldPose[i], nextPose[i], b.radius);
    if (hit && (!earliest || hit.t < earliest.hit.t))
      earliest = { hit, old: oldPose[i], next: nextPose[i], surface: surfacePose[i] };
  }
  if (!earliest || earliest.hit.t >= stopAt) {
    Object.assign(b, end);
    return false;
  }
  const { hit, old, next, surface: moved } = earliest;
  let nx = (hit.center.x - hit.q.x) / (hit.d || 1),
    ny = (hit.center.y - hit.q.y) / (hit.d || 1),
    nz = (hit.center.z - hit.q.z) / (hit.d || 1);
  if (hit.d < 1e-9) {
    nx = 0;
    ny = 1;
    nz = 0;
  }
  // Impulse normal: the platform face when the ball meets the top of the
  // forearms/hands of an active receive; otherwise the capsule normal.
  let rx = nx, ry = ny, rz = nz;
  if (state.player.action === "receive" && next.active && (next.part === "forearm" || next.part === "hand")) {
    const face = platformNormal(nextPose);
    const facing = face ? nx * face.x + ny * face.y + nz * face.z : 0;
    // direct-v6: the elbow gap is wider than the ball, so a ball dropping
    // between the forearms meets the inner side of one of them. On the upper
    // (face) side that still counts as the platform.
    const other = next.part === "forearm" && nextPose.find((s) => s.part === "forearm" && s.id !== next.id);
    const inner = other && facing > 0 &&
      (other.a.x + other.b.x - next.a.x - next.b.x) * nx +
      (other.a.y + other.b.y - next.a.y - next.b.y) * ny +
      (other.a.z + other.b.z - next.a.z - next.b.z) * nz > 0;
    if (face && (inner || facing > C.platformFaceCos)) {
      rx = face.x; ry = face.y; rz = face.z;
    }
  }
  const q0 = lerp(old.a, old.b, hit.q.t),
    q1 = lerp(moved.a, moved.b, hit.q.t);
  const surface = {
    x: (q1.x - q0.x) / dt,
    y: (q1.y - q0.y) / dt,
    z: (q1.z - q0.z) / dt,
  };
  // direct-v5: an active receive absorbs the body's run toward the net (-z),
  // so running in to pass does not drive the ball into it. Sideways and
  // backward body speed still reach the ball.
  // Uses the body's actual travel (moveVz), so a player pinned at the boundary
  // while still pushing forward gets nothing subtracted.
  if (state.player.action === "receive" && next.active)
    surface.z -= Math.min(0, state.player.moveVz ?? state.player.vz ?? 0);
  const speed =
    (b.vx - surface.x) * rx + (b.vy - surface.y) * ry + (b.vz - surface.z) * rz;
  if (!state.contactEpisode) {
    state.contactEpisode = true;
    state.stats.contacts++;
    state.events.push({
      type: "contact",
      tick: state.tick,
      part: next.part,
      id: next.id,
      active: next.active,
      position: { ...hit.center },
    });
    if (speed < 0) {
      const impulse =
        -(1 + (next.active ? C.activeRestitution : C.passiveRestitution)) *
        speed;
      b.vx += impulse * rx;
      b.vy += impulse * ry;
      b.vz += impulse * rz;
    }
    const inward = b.vx * nx + b.vy * ny + b.vz * nz;
    if (inward < 0 && (rx !== nx || ry !== ny || rz !== nz)) {
      b.vx -= inward * nx;
      b.vy -= inward * ny;
      b.vz -= inward * nz;
    }
  } else {
    // Persistent contact only removes inward ball motion; no repeated moving-arm boost.
    const inward = b.vx * nx + b.vy * ny + b.vz * nz;
    if (inward < 0) {
      b.vx -= inward * nx;
      b.vy -= inward * ny;
      b.vz -= inward * nz;
    }
  }
  const radius = b.radius + next.radius + 0.00002;
  const position = { x: hit.q.x + nx * radius, y: hit.q.y + ny * radius, z: hit.q.z + nz * radius };
  b.x = position.x + b.vx * dt * (1 - hit.t);
  b.y = position.y + b.vy * dt * (1 - hit.t);
  b.z = position.z + b.vz * dt * (1 - hit.t);
  return { time: hit.t, position };
}

// Earliest training terminal on a linear motion segment. The body solver uses
// this time as a cut-off so a floor/net crossing cannot become a later "save".
export function firstEnvironmentHit(start, end, radius) {
  let first = null;
  const record = (t, type) => {
    if (t >= 0 && t <= 1 && (!first || t < first.t)) first = { t, type, position: lerp(start, end, t) };
  };
  if (start.y <= radius) record(0, 'ground');
  else if (end.y <= radius) record((radius - start.y) / (end.y - start.y), 'ground');
  for (const [axis, limit] of [['x', C.courtHalfWidth + radius], ['z', C.courtHalfLength + radius]]) {
    if (Math.abs(start[axis]) > limit) record(0, 'out');
    else if (end[axis] > limit) record((limit - start[axis]) / (end[axis] - start[axis]), 'out');
    else if (end[axis] < -limit) record((-limit - start[axis]) / (end[axis] - start[axis]), 'out');
  }
  // Slab intersection against the ball-radius-expanded net, including its top.
  let near = 0, far = 1;
  for (const [axis, min, max] of [
    ['x', -C.courtHalfWidth - radius, C.courtHalfWidth + radius],
    ['y', -radius, C.netHeight + radius],
    ['z', -C.netHalfThickness - radius, C.netHalfThickness + radius],
  ]) {
    const velocity = end[axis] - start[axis];
    if (Math.abs(velocity) < 1e-12) {
      if (start[axis] < min || start[axis] > max) { near = Infinity; break; }
    } else {
      const a = (min - start[axis]) / velocity, b = (max - start[axis]) / velocity;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    }
  }
  if (near <= far) record(near, 'net');
  return first;
}
export function bodySeparated(ball, pose) {
  return pose.every(
    (p) =>
      distance(ball, closestPoint(ball, p.a, p.b)) >
      ball.radius + p.radius + C.separation,
  );
}
