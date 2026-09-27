import { DIRECT_ACTIONS } from "./directConstants.js";

const blend = (a, b, q) => ({
  x: a.x + (b.x - a.x) * q,
  y: a.y + (b.y - a.y) * q,
  z: a.z + (b.z - a.z) * q,
});

// Equal-length two-bone leg, bending towards the front of the athlete.
// All coordinates here are body-height units; the render layer never solves IK.
function kneeBetween(hip, ankle) {
  const dx = ankle.x - hip.x, dy = ankle.y - hip.y, dz = ankle.z - hip.z;
  const d = Math.max(1e-6, Math.hypot(dx, dy, dz));
  const nx = dx / d, ny = dy / d, nz = dz / d;
  const pole = { x: -nz * nx, y: -nz * ny, z: 1 - nz * nz };
  const length = Math.max(1e-6, Math.hypot(pole.x, pole.y, pole.z));
  const bend = Math.sqrt(Math.max(0, 0.245 ** 2 - (d / 2) ** 2));
  const knee = {
    x: (hip.x + ankle.x) / 2 + pole.x / length * bend,
    y: (hip.y + ankle.y) / 2 + pole.y / length * bend,
    z: (hip.z + ankle.z) / 2 + pole.z / length * bend,
  };
  if (knee.y < 0.065 && bend > 1e-6) {
    // Rotate the knee around the hip-to-ankle axis when a low dive would put it
    // through the floor. Both bone lengths remain fixed on the same IK circle.
    const uy = Math.sqrt(Math.max(1e-8, 1 - ny * ny));
    const ux = -ny * nx / uy, uz = -ny * nz / uy;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    const cosine = Math.max(-1, Math.min(1, (0.065 - (hip.y + ankle.y) / 2) / (bend * uy)));
    const side = Math.sign(pole.x * vx + pole.y * vy + pole.z * vz) || Math.sign(hip.x) || 1;
    const sine = Math.sqrt(1 - cosine * cosine) * side;
    knee.x = (hip.x + ankle.x) / 2 + bend * (ux * cosine + vx * sine);
    knee.y = (hip.y + ankle.y) / 2 + bend * (uy * cosine + vy * sine);
    knee.z = (hip.z + ankle.z) / 2 + bend * (uz * cosine + vz * sine);
  }
  return knee;
}

// Does this dive throw the body? A dive pressed at a ball headed into a
// receive circle (diveTarget.stage 'over' / 'under', judged there as a pressed
// spray, U2) does not (round 4 NEW-2 丙, 2026-09-28): the body keeps its
// standing pose and the ball is put on that, so the judgement-frame snap stays
// short. A dive at the band, or a plain dive (no target), throws as before.
export function diveThrown(p) {
  return p.action === 'dive' && (!p.diveTarget || p.diveTarget.stage === 'dive');
}

// The renderer consumes these exact collision capsules. Fraction is a partial tick,
// allowing physics to sample the curved action path between displayed frames.
// `reach: false` leaves out the receive reach toward the judged ball
// (receiveReach / receiveAhead, direct-v8 Q3): that reach is picture only
// (U4, 2026-09-27), so the simulation's collision, part choice and judgement
// snap use this pose, while rendering uses the reached one. `reach` may also
// be `{ side, ahead }` (body heights): the picture's own eased values, used
// by the practice page to bring the arms back over a few frames after the
// judgement zeroed the reach in one tick (W3, 2026-09-28).
export function getDirectPose(state, fraction = 0, { reach = true } = {}) {
  const p = state.player,
    h = p.height,
    def = DIRECT_ACTIONS[p.action];
  const t = p.actionTick + fraction;
  const active = !!def && t >= def.windup && t < def.windup + def.active;
  const phase = def
    ? Math.max(0, Math.min(1, (t - def.windup) / def.active))
    : 0;
  const raise = def ? Math.min(1, t / def.windup) : 0;
  const recover = def
    ? Math.max(0, 1 - Math.max(0, t - def.windup - def.active) / def.recovery)
    : 1;
  const start = state.poseAimStart || p.aim;
  const a0 = Math.atan2(start.x, -start.z),
    a1 = Math.atan2(p.aim.x, -p.aim.z);
  const delta = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
  const angle = a0 + delta * (state.poseAimStart ? fraction : 1) +
    (p.action === 'receive' ? p.receiveTurn ?? 0 : 0);
  const fx = Math.sin(angle),
    fz = -Math.cos(angle);
  const weight = raise * recover;
  const thrown = diveThrown(p);
  const dive = thrown ? weight : 0;
  const speed = Math.hypot(p.gaitVx ?? 0, p.gaitVz ?? 0);
  const run = Math.min(1, speed / 5.5) * (p.grounded ? 1 : 0) * (1 - dive);
  const forward = speed ? ((p.gaitVx ?? 0) * fx + (p.gaitVz ?? 0) * fz) / speed : 0;
  const lateral = speed ? ((p.gaitVx ?? 0) * -fz + (p.gaitVz ?? 0) * fx) / speed : 0;
  const gait = p.gaitPhase ?? 0;
  const landing = p.grounded && !thrown && (p.landingAge ?? 1) < 0.28
    ? Math.sin(Math.PI * p.landingAge / 0.28) * 0.10 : 0;
  const tuck = !p.grounded ? Math.min(1, p.y / (h * 0.15)) * (p.vy > 0 ? 0.07 : 0.035) : 0;
  const crouch =
    (p.action === "receive"
      ? 0.1 * raise * recover
      : thrown
        ? 0.28 * raise * recover
        : 0) + landing +
    // A passer settles the platform: the running bob fades out with the receive
    // weight, so residual movement at contact cannot drop the platform (direct-v4).
    0.022 * run * (1 + Math.cos(gait * 2)) * (p.action === "receive" ? 1 - raise * recover : 1);
  const point = (x, y, f) => ({
    x: p.x + (x * -fz + f * fx) * h,
    y: p.y + (y - crouch) * h,
    z: p.z + (x * fx + f * fz) * h,
  });
  const segments = [];
  const add = (id, part, a, b, r, on = false) =>
    segments.push({ id, part, a, b, radius: r * h, active: on });
  const lean = 0.045 * run + 0.03 * landing;
  const bodyPoint = (x, y, f = 0) => point(x, y - dive * (y - 0.48) * 0.92, f + lean + dive * (y - 0.48) * 1.3);
  add("torso", "torso", point(0, 0.48, 0), bodyPoint(0, 0.78), 0.115);
  add("chest", "torso", bodyPoint(-0.11, 0.745), bodyPoint(0.11, 0.745), 0.073);
  add("hips", "hips", point(-0.075, 0.475, 0), point(0.075, 0.475, 0), 0.077);
  add("neck", "torso", bodyPoint(0, 0.78), bodyPoint(0, 0.85), 0.047);
  add("head", "head", bodyPoint(0, 0.91), bodyPoint(0, 0.91), 0.09);
  for (const [side, sign] of [
    ["left", -1],
    ["right", 1],
  ]) {
    const wave = Math.sin(gait + (sign === 1 ? Math.PI : 0));
    const lift = Math.max(0, Math.cos(gait + (sign === 1 ? Math.PI : 0)));
    const hipLocal = { x: sign * 0.085, y: 0.49 - crouch, z: 0 };
    const footLocal = {
      x: sign * (0.09 + Math.abs(lateral) * run * 0.09 * (1 + wave) + dive * 0.04),
      y: 0.045 + lift * 0.11 * run + tuck,
      z: 0.04 + wave * 0.19 * run * forward - tuck * 1.7 - dive * 0.49,
    };
    const kneeLocal = kneeBetween(hipLocal, footLocal);
    const world = v => ({
      x: p.x + (v.x * -fz + v.z * fx) * h,
      y: p.y + v.y * h,
      z: p.z + (v.x * fx + v.z * fz) * h,
    });
    const hip = world(hipLocal), knee = world(kneeLocal), foot = world(footLocal);
    add(`${side}-thigh`, "leg", hip, knee, 0.062);
    add(`${side}-shin`, "leg", knee, foot, 0.045);
    add(`${side}-foot`, 'foot', foot, world({ ...footLocal, z: footLocal.z + 0.075 }), 0.045);
    const shoulder = bodyPoint(sign * 0.145, 0.77);
    let elbow = bodyPoint(sign * 0.18, 0.6, 0.025 - wave * 0.10 * run),
      hand = bodyPoint(sign * 0.18, 0.47 + run * 0.10, 0.12 - wave * 0.15 * run);
    if (!p.grounded) {
      elbow = blend(elbow, bodyPoint(sign * 0.21, 0.78, 0.06), Math.min(1, tuck * 12));
      hand = blend(hand, bodyPoint(sign * 0.20, 0.94, 0.12), Math.min(1, tuck * 12));
    }
    if (p.action === "receive") {
      // Forearm platform (direct-v8: one neutral platform, no swipe choice),
      // reaching sideways/forward toward the coming ball (receiveReachTarget).
      const side = reach === true ? p.receiveReach ?? 0 : reach ? reach.side : 0;
      const ahead = reach === true ? p.receiveAhead ?? 0 : reach ? reach.ahead : 0;
      const platform = (x, y, f) => point(x + side, y, f + ahead);
      elbow = blend(
        elbow,
        platform(sign * 0.11, 0.69 + phase * 0.11, 0.21),
        raise * recover,
      );
      hand = blend(
        hand,
        platform(sign * 0.045, 0.585 + phase * 0.11, 0.41),
        raise * recover,
      );
      // direct-v7 overhand pass: hands in front of the forehead (the set pose).
      const over = (p.receiveOverhand ?? 0) * raise * recover;
      if (over > 0) {
        elbow = blend(elbow, platform(sign * 0.17, 0.87, 0.08), over);
        hand = blend(hand, platform(sign * 0.11, 1.02, 0.15), over);
      }
    } else if (thrown) {
      // direct-v8: the arms extend fully for a far ball, less for one beside the body.
      const reach = p.diveReach ?? 1;
      elbow = blend(elbow, point(sign * 0.12, 0.47, 0.56 * reach), weight);
      hand = blend(hand, point(sign * 0.045, 0.42, 0.77 * reach), weight);
    } else if (p.action === "spike" || p.action === "tip") {
      if (sign === 1) {
        const tip = p.action === 'tip' ? 1 : Math.max(0, Math.min(1, p.shotBlend ?? (p.shotType === 'TIP' ? 1 : 0)));
        const angle = (-0.8 + phase * 2.5) * (1 - tip) + (-0.25 + phase * 0.70) * tip;
        elbow = blend(
          elbow,
          point(
            sign * 0.16,
            0.89 + 0.1 * Math.cos(angle),
            0.1 * Math.sin(angle),
          ),
          raise * recover,
        );
        hand = blend(
          hand,
          point(
            sign * 0.14,
            0.89 + 0.36 * Math.cos(angle),
            0.36 * Math.sin(angle),
          ),
          raise * recover,
        );
      } else {
        // The guide arm opens the chest, then pulls down during the strike.
        elbow = blend(elbow, point(-0.22, 0.83 - phase * 0.17, 0.08), weight);
        hand = blend(hand, point(-0.16, 1.03 - phase * 0.40, 0.17), weight);
      }
    } else if (p.action === "set" || p.action === "block") {
      const block = p.action === 'block';
      elbow = blend(elbow, point(sign * (block ? 0.20 : 0.17), block ? 0.96 : 0.87, 0.08), raise * recover);
      hand = blend(
        hand,
        point(sign * (block ? 0.19 : 0.11), block ? 1.16 : 1.02 + phase * 0.16, 0.15),
        raise * recover,
      );
    }
    add(`${side}-upper-arm`, "arm", shoulder, elbow, 0.038);
    add(
      `${side}-forearm`,
      "forearm",
      elbow,
      hand,
      0.038,
      active && ((p.action !== "spike" && p.action !== "tip") || sign === 1),
    );
    add(
      `${side}-hand`,
      "hand",
      hand,
      hand,
      0.045,
      active && ((p.action !== "spike" && p.action !== "tip") || sign === 1),
    );
  }
  return segments;
}
