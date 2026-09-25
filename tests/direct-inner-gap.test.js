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

// Real-path forearm contacts, classified by where the ball centre sits across
// the two forearm axes at the contact tick (facing is fixed toward the net, so
// "across" is world x). Between the axes = inner side; outside = outer side.
function forearmSide(s, pos) {
  const pose = getDirectPose(s, 1);
  const xs = pose.filter((q) => q.part === 'forearm').map((q) => {
    const t = Math.max(0, Math.min(1, (pos.z - q.a.z) / ((q.b.z - q.a.z) || 1e-9)));
    return q.a.x + (q.b.x - q.a.x) * t;
  });
  const [lo, hi] = [Math.min(...xs), Math.max(...xs)];
  if (pos.x > lo && pos.x < hi) return { side: 'inner' };
  return { side: 'outer', dir: pos.x <= lo ? -1 : 1 };
}
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

// Every scenario counts, whether or not the ball is touched.
function allReceives(sticks) {
  const c = { n: 0, zone: 0, net: 0, inner: [], outer: [] };
  for (const [sx, sz] of sticks) for (const z0 of [5.4, 5.8, 6.2]) for (const x0 of [-0.3, 0, 0.3])
    for (const m of [0.2, 0.35, 0.5, 0.8, 1.0]) for (let rt = 18; rt <= 40; rt++) {
      const s = createDirectGame(); s.player.x = x0; s.player.z = z0;
      let first = null;
      for (let t = 0; t < 240; t++) {
        stepDirectGame(s, [cmd(s, t === 0 ? 'feed' : t === rt ? 'receive' : null,
          t >= 10 ? { x: sx * m, z: sz * m } : { x: 0, z: 0 })]);
        const hit = s.events.find((e) => e.type === 'contact');
        if (hit && !first) {
          first = hit;
          if (hit.active && hit.part === 'forearm') {
            const k = forearmSide(s, hit.position);
            c[k.side].push({ ...k, tag: `stick=${sx},${sz} x0=${x0} z0=${z0} m=${m} rt=${rt}`, v: { x: s.ball.vx, y: s.ball.vy } });
          }
        }
        const end = s.events.find((e) => ['ground', 'net', 'out'].includes(e.type));
        if (end) {
          c.n++;
          if (end.type === 'net') c.net++;
          else if (end.type === 'ground' && s.ball.z >= 0.5 && s.ball.z <= 3 && Math.abs(s.ball.x) <= 3) c.zone++;
          break;
        }
      }
    }
  return c;
}

const FWD = allReceives([[0, -1]]);
const DIAG = allReceives([[0.7, -0.7], [-0.7, -0.7]]);

test('A22a 真實路徑：第一次主動觸球打到前臂內側時照平台正面反彈（vy > 0、|vx| < 0.05）', () => {
  const rows = [...FWD.inner, ...DIAG.inner];
  assert.ok(rows.length >= 10, `內側觸球案例 ${rows.length}`);
  for (const r of rows) {
    assert.ok(r.v.y > 0, `${r.tag} 觸球後往上（vy ${r.v.y.toFixed(2)}）`);
    assert.ok(Math.abs(r.v.x) < 0.05, `${r.tag} 不往側面彈（vx ${r.v.x.toFixed(2)}）`);
  }
});

test('A22b 真實路徑：第一次主動觸球打到前臂外側且沒套平台時照舊往外彈', () => {
  const rows = [...FWD.outer, ...DIAG.outer].filter((r) => r.v.y < 0);
  assert.ok(rows.length >= 20, `外側擦邊案例 ${rows.length}`);
  for (const r of rows) assert.ok(r.dir * r.v.x >= 0.3, `${r.tag} 往外彈（vx ${r.v.x.toFixed(2)}）`);
});

test('A22d 真實路徑、全部案例當分母：正前舉球區 ≥ 275、碰網 ≤ 124', () => {
  const c = FWD;
  assert.equal(c.n, 1035);
  assert.ok(c.zone >= 275, `正前舉球區 ${c.zone}/${c.n}`);
  assert.ok(c.net <= 124, `正前碰網 ${c.net}/${c.n}`);
});

test('A22d 真實路徑、全部案例當分母：斜前舉球區 ≥ 108、碰網 ≤ 3', () => {
  const c = DIAG;
  assert.equal(c.n, 2070);
  assert.ok(c.zone >= 108, `斜前舉球區 ${c.zone}/${c.n}`);
  assert.ok(c.net <= 3, `斜前碰網 ${c.net}/${c.n}`);
});
