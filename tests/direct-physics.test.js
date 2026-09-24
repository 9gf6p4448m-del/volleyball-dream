import test from "node:test";
import assert from "node:assert/strict";
import { closestPoint, sweepCapsule, collideBody } from "../src/sim/directPhysics.js";
import { DIRECT_PHYSICS } from "../src/sim/directConstants.js";
import {
  createDirectGame,
  stepDirectGame,
  getDirectPose,
  snapshotDirectGame,
  restoreDirectGame,
  replayDirectTape,
  serializeDirectState,
  DIRECT_DT,
} from "../src/sim/directGame.js";

const ball = (s, p) =>
  Object.assign(s.ball, { active: true, vx: 0, vy: 0, vz: 0 }, p);
const command = (s, action, extra = {}) => ({
  tick: s.tick,
  sequence: 0,
  move: { x: 0, z: 0 },
  aim: { x: 0, z: -1 },
  action,
  ...extra,
});
const receiveFeed = ({ degrees = 35, x = 0, receiveTick = 29 } = {}) => {
  const s = createDirectGame();
  const angle = degrees * Math.PI / 180;
  const aim = { x: Math.sin(angle), z: -Math.cos(angle) };
  s.player.x = x;
  s.player.aim = aim;
  const initial = snapshotDirectGame(s), commands = [], contacts = [], states = [];
  for (let tick = 0; tick < 70; tick++) {
    const c = command(s, tick === 0 ? 'feed' : tick === receiveTick ? 'receive' : null, { aim });
    commands.push(c);
    stepDirectGame(s, [c]);
    contacts.push(...s.events.filter(e => e.type === 'contact'));
    states.push(snapshotDirectGame(s));
  }
  return { s, initial, commands, contacts, states };
};
test('receive turns a nearby incoming feed onto the visible platform despite a 35 degree aim error', () => {
  for (const degrees of [-35, 35]) {
    const { contacts } = receiveFeed({ degrees });
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].active, true, 'A near-facing receive must contact the active platform before the legs');
    assert.ok(['hand', 'forearm'].includes(contacts[0].part));
  }
});
test('receive assistance cannot compensate for distant position, late timing, or facing away', () => {
  for (const options of [{ x: 2 }, { receiveTick: 49 }, { degrees: 90 }]) {
    const { contacts } = receiveFeed(options);
    assert.equal(contacts.filter(e => e.active).length, 0);
    if (options.x) assert.equal(contacts.length, 0, 'No remote contact of any kind');
  }
});
test('receive assistance preserves manual aim and cannot affect other action poses', () => {
  const { states } = receiveFeed();
  const angle = 35 * Math.PI / 180;
  for (const s of states) {
    assert.ok(Math.abs(s.player.aim.x - Math.sin(angle)) < 1e-12);
    assert.ok(Math.abs(s.player.aim.z + Math.cos(angle)) < 1e-12);
    if (s.player.action !== 'receive') assert.equal(s.player.receiveTurn, 0);
  }
  for (const action of ['spike', 'tip', 'set', 'block', 'dive', null]) {
    const s = createDirectGame();
    s.player.action = action; s.player.actionTick = 12;
    const plain = getDirectPose(s);
    s.player.receiveTurn = angle;
    assert.deepEqual(getDirectPose(s), plain, `${action} ignores receive-only turn`);
  }
});
test('receive assistance uses the same unchanged capsule sizes and bounded visible body turn', () => {
  const { states } = receiveFeed();
  assert.ok(states.some(s => Math.abs(s.player.receiveTurn ?? 0) > 0.2), 'The body visibly turns toward the incoming ball');
  let last = 0;
  for (const s of states) {
    const turn = s.player.receiveTurn ?? 0;
    assert.ok(Math.abs(turn) <= 35 * Math.PI / 180 + 1e-12);
    assert.ok(Math.abs(turn - last) <= 4 * DIRECT_DT + 1e-12, 'No instantaneous contact-surface rotation');
    last = turn;
    const baseline = snapshotDirectGame(s);
    baseline.player.receiveTurn = 0;
    const plain = getDirectPose(baseline), assisted = getDirectPose(s);
    assert.equal(assisted.length, plain.length, 'No invisible extra contact surfaces');
    for (let i = 0; i < plain.length; i++) {
      assert.equal(assisted[i].radius, plain[i].radius);
      assert.equal(assisted[i].active, plain[i].active);
      for (const endpoint of ['a', 'b']) {
        const a = plain[i][endpoint], b = assisted[i][endpoint];
        const dx = a.x - s.player.x, dz = a.z - s.player.z;
        assert.ok(Math.abs(b.x - (s.player.x + dx * Math.cos(turn) - dz * Math.sin(turn))) < 1e-12);
        assert.ok(Math.abs(b.z - (s.player.z + dx * Math.sin(turn) + dz * Math.cos(turn))) < 1e-12);
        assert.equal(b.y, a.y);
      }
    }
  }
});
test('receive does not chase a passed ball or rescue one already on the floor', () => {
  for (const initial of [
    { x: 0.5, y: 1.1, z: 5.6, vz: 5 },
    { x: 0.5, y: 0.105, z: 4.2, vy: -1, vz: 5 },
    { x: 0.5, y: 1.1, z: 4.2, vz: -5 },
  ]) {
    const s = createDirectGame();
    s.player.action = 'receive'; s.player.actionTick = 8;
    ball(s, initial);
    stepDirectGame(s);
    assert.equal(s.stats.contacts, 0);
    assert.equal(s.player.receiveTurn ?? 0, 0);
    if (initial.y === s.ball.radius) {
      assert.equal(s.ball.active, false);
      assert.equal(s.events[0].type, 'ground');
    }
  }
});
test('receive-assisted feed replays and restores every tick byte-identically', () => {
  const { s, initial, commands, states } = receiveFeed();
  const restored = restoreDirectGame(states[34]);
  for (let tick = restored.tick; tick < s.tick; tick++) {
    stepDirectGame(restored, [commands[tick]]);
    assert.equal(serializeDirectState(restored), serializeDirectState(states[tick]));
  }
  assert.equal(serializeDirectState(s), serializeDirectState(replayDirectTape({
    simulationVersion: initial.simulationVersion, initial, commands, endTick: s.tick,
  })));
});
const oneTickReceiveTurn = ({ degrees, reach, startTurn = 0 }) => {
  const s = createDirectGame();
  const angle = degrees * Math.PI / 180, r = reach * s.player.height;
  const dx = r * Math.sin(angle), dz = -r * Math.cos(angle);
  s.player.action = 'receive'; s.player.actionTick = 2; s.player.receiveTurn = startTurn;
  ball(s, { x: dx, y: 0.65 * s.player.height, z: s.player.z + dz, vx: -dx / r * 3, vz: -dz / r * 3 });
  stepDirectGame(s);
  return s.player.receiveTurn;
};
test('receive assistance stops at the 35 degree limit for a 50 degree incoming ball', () => {
  const limit = 35 * Math.PI / 180;
  assert.equal(oneTickReceiveTurn({ degrees: 50, reach: 0.8, startTurn: limit - 0.01 }), limit);
  assert.equal(oneTickReceiveTurn({ degrees: -50, reach: 0.8, startTurn: -limit + 0.01 }), -limit);
});
test('receive assistance ignores balls outside the 60 degree cone or beyond 1.1 body heights', () => {
  assert.ok(oneTickReceiveTurn({ degrees: 50, reach: 0.9 }) > 0, 'control: inside the cone turns');
  assert.equal(oneTickReceiveTurn({ degrees: 70, reach: 0.9 }), 0, 'outside the cone never turns');
  assert.ok(oneTickReceiveTurn({ degrees: 20, reach: 1.0 }) > 0, 'control: within reach turns');
  assert.equal(oneTickReceiveTurn({ degrees: 20, reach: 1.15 }), 0, 'beyond reach never turns');
});
test('receive assistance rotation adds no ball impulse, even when a late receive is still turning at contact', () => {
  // direct-v4 (user-approved 2026-09-24): every active contact made while the assist is
  // still turning or side-reaching is compared with the same pre-contact state whose turn
  // and reach are already complete. Excluding both keeps every case under 0.3 m/s (max
  // 0.000 after the neutral retune); leaving them in the surface velocity reaches 0.943 m/s.
  const diffs = [];
  for (let deg = -40; deg <= 40; deg += 5) for (const x of [-0.45, -0.2, 0, 0.2, 0.45]) for (let rt = 26; rt <= 36; rt++) {
    const s = createDirectGame();
    const angle = deg * Math.PI / 180, aim = { x: Math.sin(angle), z: -Math.cos(angle) };
    s.player.x = x; s.player.aim = aim;
    for (let tick = 0; tick < 70; tick++) {
      const pre = snapshotDirectGame(s);
      const c = command(s, tick === 0 ? 'feed' : tick === rt ? 'receive' : null, { aim });
      stepDirectGame(s, [c]);
      const contact = s.events.find(e => e.type === 'contact');
      if (!contact) continue;
      const moving = s.player.receiveTurn !== pre.player.receiveTurn || s.player.receiveReach !== pre.player.receiveReach;
      if (contact.active && moving) {
        const control = restoreDirectGame(pre);
        control.player.receiveTurn = s.player.receiveTurn;
        control.player.receiveReach = s.player.receiveReach;
        stepDirectGame(control, [c]);
        if (control.player.receiveTurn === s.player.receiveTurn && control.player.receiveReach === s.player.receiveReach &&
            control.events.some(e => e.type === 'contact'))
          diffs.push(Math.hypot(s.ball.vx - control.ball.vx, s.ball.vy - control.ball.vy, s.ball.vz - control.ball.vz));
      }
      break;
    }
  }
  assert.ok(diffs.length >= 100, `enough moving-at-contact cases (${diffs.length})`);
  const worst = Math.max(...diffs);
  assert.ok(worst < 0.3, `assist turn/reach must not bat the ball (max |dv - control| = ${worst.toFixed(3)} m/s)`);
  // Unit level: a rotating capsule whose surface pose is static rebounds like a static surface.
  const capsule = (a, b) => [{ a, b, radius: 0.05, active: true, part: 'forearm', id: 'L' }];
  const oldPose = capsule({ x: -0.3, y: 1, z: 0 }, { x: 0.3, y: 1, z: 0 });
  const nextPose = capsule({ x: -0.3, y: 1, z: 0.02 }, { x: 0.3, y: 1, z: -0.02 });
  const t = createDirectGame();
  ball(t, { x: 0.2, y: 1 + 0.105 + 0.05 + 0.001, z: 0, vy: -3 });
  collideBody(t, oldPose, nextPose, DIRECT_DT / 4, Infinity, oldPose);
  const d = { x: t.ball.vx, y: t.ball.vy + 3, z: t.ball.vz };
  const mag = Math.hypot(d.x, d.y, d.z), n = { x: d.x / mag, y: d.y / mag, z: d.z / mag };
  assert.ok(Math.abs(mag - (1 + DIRECT_PHYSICS.activeRestitution) * 3 * n.y) < 1e-9);
});
test("physical gait alternates feet and settles after braking", () => {
  const s = createDirectGame();
  const offsets = [];
  for (let i = 0; i < 48; i++) {
    stepDirectGame(s, [command(s, null, { move: { x: 0, z: -1 } })]);
    const pose = getDirectPose(s);
    const left = pose.find(p => p.id === 'left-shin').b;
    const right = pose.find(p => p.id === 'right-shin').b;
    offsets.push(left.z - right.z);
    assert.ok(left.y >= 0.045 * s.player.height && right.y >= 0.045 * s.player.height);
  }
  assert.ok(Math.min(...offsets) < -0.2 && Math.max(...offsets) > 0.2, 'Left and right feet must take turns leading');
  for (let i = 0; i < 60; i++) stepDirectGame(s);
  const settled = getDirectPose(s);
  for (let i = 0; i < 15; i++) stepDirectGame(s);
  assert.deepEqual(getDirectPose(s), settled, 'Stopped player has no treadmill motion');
});
test("takeoff tucks knees and landing absorbs impact before returning to standing", () => {
  const s = createDirectGame();
  const relativeFoot = () => getDirectPose(s).find(p => p.id === 'left-shin').b.y - s.player.y;
  const standingFoot = relativeFoot();
  stepDirectGame(s, [command(s, 'jump')]);
  for (let i = 0; i < 12; i++) stepDirectGame(s);
  assert.ok(relativeFoot() > standingFoot + 0.04, 'Airborne leg folds instead of remaining rigid');
  while (!s.player.grounded) stepDirectGame(s);
  for (let i = 0; i < 5; i++) stepDirectGame(s);
  const compressed = getDirectPose(s).find(p => p.id === 'torso').a.y;
  for (let i = 0; i < 30; i++) stepDirectGame(s);
  assert.ok(getDirectPose(s).find(p => p.id === 'torso').a.y > compressed + 0.08, 'Landing lowers pelvis then recovers');
});
test("set, block and dive have distinct collision-bearing silhouettes", () => {
  const poseAt = action => {
    const s = createDirectGame();
    s.player.action = action; s.player.actionTick = 12;
    return getDirectPose(s);
  };
  const set = poseAt('set'), block = poseAt('block'), dive = poseAt('dive');
  const hand = pose => pose.find(p => p.id === 'right-hand').a;
  assert.ok(hand(block).x > hand(set).x + 0.05, 'Block spreads hands across the net; set makes a narrow overhead window');
  const torso = dive.find(p => p.id === 'torso');
  assert.ok(Math.abs(torso.b.z - torso.a.z) > Math.abs(torso.b.y - torso.a.y), 'Dive torso becomes horizontal');
  assert.ok(hand(dive).y < 0.65, 'Dive reaches low rather than bending an upright receive pose');
});
test("dive bends above the floor without changing leg bone lengths", () => {
  const s = createDirectGame();
  s.player.action = 'dive';
  for (let tick = 0; tick < 46; tick += 0.25) {
    s.player.actionTick = tick;
    for (const capsule of getDirectPose(s)) {
      assert.ok(Math.min(capsule.a.y, capsule.b.y) - capsule.radius >= -1e-9, `${capsule.id} penetrates floor at ${tick}`);
      if (/thigh|shin/.test(capsule.id))
        assert.ok(Math.abs(Math.hypot(capsule.a.x - capsule.b.x, capsule.a.y - capsule.b.y, capsule.a.z - capsule.b.z) / s.player.height - 0.245) < 1e-9);
    }
  }
});

test("landing while diving keeps every collision capsule above the floor", () => {
  const s = createDirectGame();
  for (let tick = 0; tick < 75; tick++) {
    stepDirectGame(s, [command(s, tick === 0 ? 'jump' : tick === 47 ? 'dive' : null)]);
    if (!s.player.grounded || s.player.action !== 'dive') continue;
    for (const capsule of getDirectPose(s))
      assert.ok(Math.min(capsule.a.y, capsule.b.y) - capsule.radius >= -1e-9,
        `${capsule.id} penetrates floor at tick ${tick}`);
  }
});
test("shallow grazing contact is not lost when conservative advancement converges slowly", () => {
  const s = createDirectGame();
  ball(s, { x: 0.2624, y: 1.5925, z: 4.96875, vz: 60 });
  stepDirectGame(s);
  assert.equal(s.stats.contacts, 1);
  const capsule = { a: { x: 0, y: -0.2, z: 0 }, b: { x: 0, y: 0.2, z: 0 }, radius: 0.1575 };
  for (const [offset, expected] of [[0.2624, true], [0.2626, false]]) {
    const hit = sweepCapsule({ x: offset, y: 0, z: -0.125 }, { x: offset, y: 0, z: 0.125 }, capsule, capsule, 0.105);
    assert.equal(Boolean(hit), expected, 'A real 0.1mm graze hits; a 0.1mm clear gap does not');
  }
});
test("ground wins over a later shin contact within the same physics substep", () => {
  const s = createDirectGame();
  ball(s, { x: 0.35, y: 0.106, z: 4.93, vx: -20, vy: -5, vz: 0 });
  stepDirectGame(s);
  assert.equal(s.stats.contacts, 0, 'A ball that already touched the floor cannot be saved by a later contact');
  assert.equal(s.events[0].type, 'ground');
  assert.equal(s.ball.y, s.ball.radius);
});
test("air swing cannot change a remote ball trajectory", () => {
  const a = createDirectGame(),
    b = createDirectGame();
  for (const s of [a, b]) ball(s, { x: 3, y: 4, z: 5, vz: -2 });
  for (let i = 0; i < 30; i++) {
    stepDirectGame(a, [command(a, i === 0 ? "spike" : null)]);
    stepDirectGame(b);
  }
  assert.deepEqual(a.ball, b.ball);
  assert.equal(a.stats.contacts, 0);
});
test("high speed head collision is swept; near miss passes untouched", () => {
  const a = createDirectGame(),
    b = createDirectGame();
  const head = getDirectPose(a).find((p) => p.part === "head");
  ball(a, { x: 0, y: head.a.y, z: 3, vz: 240 });
  ball(b, { x: 2, y: head.a.y, z: 3, vz: 240 });
  stepDirectGame(a);
  stepDirectGame(b);
  assert.equal(a.stats.contacts, 1);
  assert.ok(a.ball.vz < 0);
  assert.equal(b.stats.contacts, 0);
  assert.equal(b.ball.vz, 240);
});
test("passive leg and glancing contacts are real body surfaces", () => {
  for (const x of [0.14, 0.28]) {
    const s = createDirectGame();
    ball(s, { x, y: 0.4, z: 4, vz: 90 });
    stepDirectGame(s);
    assert.equal(s.stats.contacts, 1);
  }
});
test("moving active forearm sweeps a stationary ball", () => {
  const s = createDirectGame();
  s.player.action = "receive";
  s.player.actionTick = 8;
  const pose = getDirectPose(s, 0.5).find((p) => p.id === "left-forearm");
  ball(s, { x: pose.b.x, y: pose.b.y, z: pose.b.z });
  stepDirectGame(s);
  assert.equal(s.stats.contacts, 1);
  assert.ok(Math.hypot(s.ball.vx, s.ball.vy, s.ball.vz) > 0.2);
});
test("overlapping both forearms count once across ticks", () => {
  const s = createDirectGame();
  s.player.action = "receive";
  s.player.actionTick = 10;
  const p = getDirectPose(s).find((p) => p.id === "left-forearm").b;
  ball(s, { x: 0, y: p.y, z: p.z });
  stepDirectGame(s);
  const count = s.stats.contacts;
  assert.equal(count, 1);
  for (let i = 0; i < 3; i++) stepDirectGame(s);
  assert.equal(s.stats.contacts, 1);
});
test("aim rotation hits a ball only at the middle of the swept arc", () => {
  const s = createDirectGame();
  s.player.action = "receive";
  s.player.actionTick = 12;
  // Half-turn: the hands pass on the player's right, far from both endpoint poses.
  ball(s, { x: 0.68, y: 1.1, z: 5 });
  const far = (pose) =>
    pose.every(
      (p) =>
        Math.hypot(p.a.x - s.ball.x, p.a.y - s.ball.y, p.a.z - s.ball.z) >
        p.radius + s.ball.radius,
    );
  assert.ok(far(getDirectPose(s)));
  const end = restoreDirectGame(snapshotDirectGame(s));
  end.player.aim = { x: 0, z: 1 };
  assert.ok(far(getDirectPose(end)));
  // Turn at the bounded physical rate; hold the same active posture and put the
  // ball on the arc for every fresh attempt, isolating orientation from gravity.
  for (let i = 0; i < 20 && !s.stats.contacts; i++) {
    s.player.actionTick = 12;
    ball(s, { x: 0.68, y: 1.1, z: 5 });
    stepDirectGame(s, [command(s, null, { aim: { x: 0, z: 1 } })]);
  }
  assert.equal(s.stats.contacts, 1);
});
test("half-turn commands cannot rotate contact surfaces instantaneously", () => {
  const s = createDirectGame();
  stepDirectGame(s, [command(s, null, { aim: { x: 0, z: 1 } })]);
  assert.ok(Math.abs(Math.atan2(s.player.aim.x, -s.player.aim.z)) <= 0.1500001);
  assert.ok(s.player.aim.z < -0.98);
});
test("CCD catches a curved hand path with both tick endpoint poses separated", () => {
  const s = createDirectGame();
  s.player.action = "receive";
  s.player.actionTick = 12;
  const middle = snapshotDirectGame(s);
  middle.player.aim = { x: Math.sin(0.075), z: -Math.cos(0.075) };
  const hand = getDirectPose(middle, 0.5).find((p) => p.id === "right-hand");
  const dx = hand.a.x,
    dz = hand.a.z - s.player.z;
  const length = Math.hypot(dx, dz);
  const offset = hand.radius + s.ball.radius - 0.00015;
  ball(s, {
    x: hand.a.x + (dx / length) * offset,
    y: hand.a.y,
    z: hand.a.z + (dz / length) * offset,
  });
  const end = snapshotDirectGame(s);
  end.player.aim = { x: Math.sin(0.15), z: -Math.cos(0.15) };
  end.player.actionTick = 13;
  for (const endpoint of [s, end]) {
    for (const capsule of getDirectPose(endpoint)) {
      const q = closestPoint(s.ball, capsule.a, capsule.b);
      assert.ok(
        Math.hypot(s.ball.x - q.x, s.ball.y - q.y, s.ball.z - q.z) -
          capsule.radius -
          s.ball.radius >
          0.005, // direct-v4 platform: endpoint gap is 9.8 mm (user-approved from 10 mm)
      );
    }
  }
  stepDirectGame(s, [command(s, null, { aim: { x: 0, z: 1 } })]);
  assert.equal(s.stats.contacts, 1);
  assert.equal(s.events.find((e) => e.type === "contact").id, "right-hand");
});
test("timing and orientation change contact outcome without a target solver", () => {
  const probe = createDirectGame();
  probe.player.action = "receive";
  probe.player.actionTick = 10;
  const handProbe = getDirectPose(probe, 0.5);
  const make = (tick, aim) => {
    const s = createDirectGame();
    s.player.action = "receive";
    s.player.actionTick = tick;
    s.player.aim = aim;
    // direct-v4: placed at the aligned tick-10 right hand (pose-derived, not a fixed height).
    const hand = handProbe.find((p) => p.id === "right-hand").a;
    ball(s, { x: 0, y: hand.y, z: hand.z, vz: 2 });
    stepDirectGame(s);
    return s;
  };
  const aligned = make(10, { x: 0, z: -1 }),
    late = make(30, { x: 0, z: -1 }),
    turned = make(10, { x: 1, z: 0 });
  assert.equal(aligned.stats.contacts, 1);
  assert.equal(late.stats.contacts, 0);
  assert.equal(turned.stats.contacts, 0);
  assert.notEqual(aligned.ball.vz, late.ball.vz);
});
test("jump changes physical reach and has real flight; height changes pose", () => {
  const s = createDirectGame();
  const low = getDirectPose(s).find((p) => p.part === "head").a.y;
  stepDirectGame(s, [command(s, "jump")]);
  assert.equal(s.player.grounded, false);
  for (let i = 0; i < 15; i++) stepDirectGame(s);
  assert.ok(s.player.y > 0.4);
  assert.ok(getDirectPose(s).find((p) => p.part === "head").a.y > low + 0.4);
  for (let i = 0; i < 100; i++) stepDirectGame(s);
  assert.equal(s.player.y, 0);
  assert.equal(s.player.grounded, true);
  assert.ok(
    getDirectPose(createDirectGame({ height: 2 })).find(
      (p) => p.part === "head",
    ).a.y > low,
  );
});
test("run-up raises takeoff speed and dive physically travels without movement input", () => {
  const standing = createDirectGame(),
    running = createDirectGame();
  for (let i = 0; i < 15; i++)
    stepDirectGame(running, [command(running, null, { move: { x: 1, z: 0 } })]);
  stepDirectGame(standing, [command(standing, "jump")]);
  stepDirectGame(running, [command(running, "jump")]);
  assert.ok(running.player.vy > standing.player.vy + 0.5);
  const dive = createDirectGame();
  stepDirectGame(dive, [command(dive, "dive")]);
  for (let i = 0; i < 15; i++) stepDirectGame(dive);
  assert.ok(dive.player.z < 3.6);
  assert.ok(getDirectPose(dive).find((p) => p.part === "torso").a.y < 0.5);
  assert.ok(
    getDirectPose(dive)
      .filter((p) => p.id.endsWith("shin"))
      .every((p) => p.b.y - p.radius >= 0),
  );
});
test("feed never moves player and ground ends the ball", () => {
  const s = createDirectGame();
  s.player.x = 2;
  s.player.z = 7;
  stepDirectGame(s, [command(s, "feed")]);
  assert.equal(s.player.x, 2);
  assert.equal(s.player.z, 7);
  assert.equal(s.stats.feeds, 1);
  ball(s, { x: 3, y: 0.12, z: 4, vy: -2 });
  stepDirectGame(s);
  assert.equal(s.ball.active, false);
  assert.ok(s.events.some((e) => e.type === "ground"));
});
test("net and court exit stop fast balls, clear velocity, and require feed", () => {
  for (const [type, initial] of [
    ["net", { x: 2, y: 1, z: 1, vz: -200 }],
    ["out", { x: 4.4, y: 3, z: 3, vx: 100 }],
  ]) {
    const s = createDirectGame();
    ball(s, initial);
    stepDirectGame(s);
    assert.equal(s.ball.active, false);
    assert.ok(s.events.some((e) => e.type === type));
    const position = { x: s.ball.x, y: s.ball.y, z: s.ball.z };
    stepDirectGame(s);
    assert.deepEqual({ x: s.ball.x, y: s.ball.y, z: s.ball.z }, position);
    assert.equal(Math.hypot(s.ball.vx, s.ball.vy, s.ball.vz), 0);
  }
});
test("action has windup, active, recovery and rejects repeated held starts", () => {
  const s = createDirectGame();
  stepDirectGame(s, [command(s, "receive")]);
  assert.ok(getDirectPose(s).every((p) => !p.active));
  for (let i = 0; i < 8; i++) stepDirectGame(s, [command(s, "receive")]);
  assert.equal(s.player.actionTick, 9);
  assert.ok(getDirectPose(s).some((p) => p.active));
  for (let i = 0; i < 10; i++) stepDirectGame(s);
  assert.ok(getDirectPose(s).every((p) => !p.active));
  for (let i = 0; i < 20; i++) stepDirectGame(s);
  assert.equal(s.player.action, null);
});
test("snapshot preserves an in-progress contact episode", () => {
  const a = createDirectGame();
  a.player.action = "receive";
  a.player.actionTick = 10;
  const hand = getDirectPose(a).find((p) => p.id === "left-hand").a;
  ball(a, hand);
  stepDirectGame(a);
  assert.equal(a.stats.contacts, 1);
  const b = restoreDirectGame(snapshotDirectGame(a));
  for (let i = 0; i < 10; i++) {
    stepDirectGame(a);
    stepDirectGame(b);
  }
  assert.equal(serializeDirectState(a), serializeDirectState(b));
});
test("replay and mid-flight restore are byte-identical with active input", () => {
  const s = createDirectGame({ seed: 17 });
  const initial = snapshotDirectGame(s),
    commands = [];
  for (let i = 0; i < 100; i++) {
    const c = command(
      s,
      i === 0 ? "feed" : i === 15 ? "jump" : i === 25 ? "spike" : null,
      { move: { x: 0.3, z: -0.4 } },
    );
    commands.push(c);
    stepDirectGame(s, [c]);
  }
  assert.equal(s.stats.feeds, 1);
  assert.notEqual(s.player.z, 5);
  assert.equal(
    serializeDirectState(s),
    serializeDirectState(
      replayDirectTape({
        simulationVersion: "direct-v4",
        initial,
        commands,
        endTick: 100,
      }),
    ),
  );
  const r = restoreDirectGame(snapshotDirectGame(s));
  stepDirectGame(s);
  stepDirectGame(r);
  assert.equal(serializeDirectState(s), serializeDirectState(r));
  assert.throws(() =>
    restoreDirectGame({ ...initial, simulationVersion: "bad" }),
  );
  assert.throws(() =>
    restoreDirectGame({ ...initial, simulationVersion: "direct-v1" }),
  );
  assert.throws(() =>
    restoreDirectGame({ ...initial, simulationVersion: "direct-v2" }),
  );
  assert.throws(() =>
    restoreDirectGame({ ...initial, simulationVersion: "direct-v3" }),
  );
  assert.throws(() =>
    replayDirectTape({
      simulationVersion: "bad",
      initial,
      commands,
      endTick: 100,
    }),
  );
  assert.equal(DIRECT_DT, 1 / 60);
});
