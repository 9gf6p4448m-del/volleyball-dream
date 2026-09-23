import test from "node:test";
import assert from "node:assert/strict";
import { closestPoint } from "../src/sim/directPhysics.js";
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
          0.01,
      );
    }
  }
  stepDirectGame(s, [command(s, null, { aim: { x: 0, z: 1 } })]);
  assert.equal(s.stats.contacts, 1);
  assert.equal(s.events.find((e) => e.type === "contact").id, "right-hand");
});
test("timing and orientation change contact outcome without a target solver", () => {
  const make = (tick, aim) => {
    const s = createDirectGame();
    s.player.action = "receive";
    s.player.actionTick = tick;
    s.player.aim = aim;
    ball(s, { x: 0, y: 1.1, z: 4.28, vz: 2 });
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
        simulationVersion: "direct-v1",
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
    replayDirectTape({
      simulationVersion: "bad",
      initial,
      commands,
      endTick: 100,
    }),
  );
  assert.equal(DIRECT_DT, 1 / 60);
});
