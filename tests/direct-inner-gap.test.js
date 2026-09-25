// direct-v6: a ball that drops between the forearms rebounds off the platform
// face instead of the inner side of one forearm.
// Acceptance: docs/kickoffs/direct-v6-inner-gap-acceptance.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectGame, stepDirectGame, getDirectPose, DIRECT_DT } from '../src/sim/directGame.js';
import { collideBody } from '../src/sim/directPhysics.js';

const cmd = (s, action = null, move = { x: 0, z: 0 }) => ({
  tick: s.tick, sequence: 0, move, aim: { x: 0, z: -1 }, action,
});
const HEIGHTS = [1.5, 1.75, 2.1];
const ALONG = [0.1, 0.2, 0.3];

// Real receive pose on the first active tick (platform fully raised).
function raisedPlatform(height) {
  const s = createDirectGame({ height });
  for (let t = 0; t < 30; t++) {
    stepDirectGame(s, [cmd(s, t === 0 ? 'receive' : null)]);
    const pose = getDirectPose(s, 1);
    if (pose.find((q) => q.id === 'left-forearm').active) return { s, pose };
  }
  throw new Error('receive never became active');
}
const at = (seg, t) => ({
  x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t, z: seg.a.z + (seg.b.z - seg.a.z) * t,
});
// One ball launched at a fixed pose; returns the first contact and the ball
// velocity right after it (null when the ball never touches the body).
function launch(s, pose, start, v) {
  const dt = DIRECT_DT / 16;
  Object.assign(s.ball, { active: true, ...start, vx: v.x, vy: v.y, vz: v.z });
  s.player.vx = 0; s.player.vz = 0; s.player.moveVz = 0;
  for (let i = 0; i < 200; i++) {
    const before = s.events.length;
    if (collideBody(s, pose, pose, dt)) {
      const e = s.events.slice(before).find((x) => x.type === 'contact');
      return { contact: e, v: { x: s.ball.vx, y: s.ball.vy, z: s.ball.vz } };
    }
  }
  return null;
}
const forearms = (pose) => [pose.find((q) => q.id === 'left-forearm'), pose.find((q) => q.id === 'right-forearm')];

test('A22c 球從下方進到兩臂之間：結果與拿掉另一條前臂時的膠囊反彈相同', () => {
  for (const h of HEIGHTS) for (const t of ALONG) {
    const { s, pose } = raisedPlatform(h);
    const [L, R] = forearms(pose);
    const l = at(L, t), r = at(R, t);
    const start = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 - 0.25, z: (l.z + r.z) / 2 };
    const hit = launch(s, pose, start, { x: 0, y: 4, z: 0 });
    if (!hit) continue;
    // Without the untouched forearm there is no platform, so only the capsule applies.
    const lone = pose.filter((q) => q.part !== 'forearm' || q.id === hit.contact.id);
    const ref = launch(raisedPlatform(h).s, lone, start, { x: 0, y: 4, z: 0 });
    assert.ok(ref && ref.contact.id === hit.contact.id, `h=${h} t=${t} 對照須打到同一條前臂`);
    const d = Math.hypot(hit.v.x - ref.v.x, hit.v.y - ref.v.y, hit.v.z - ref.v.z);
    assert.ok(d < 1e-9, `h=${h} t=${t} 從下方觸球不得套平台（差 ${d.toFixed(3)} m/s）`);
  }
});

// A22a／A22b／A22d（真實路徑的內外側反彈與舉球區計數）退場：direct-v7 接球輔助
// 在接球時窗內改由時機決定出球，見 docs/kickoffs/direct-v7-receive-assist-acceptance.md
// 使用者裁定第 6 題。A22c（直接呼叫 collideBody 的平台幾何）照舊。
