// direct-v5 receive absorbs the body's forward (toward-net) speed.
// Acceptance: docs/kickoffs/direct-v5-forward-absorb-acceptance.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectGame, stepDirectGame, DIRECT_DT } from '../src/sim/directGame.js';
import { collideBody } from '../src/sim/directPhysics.js';

const cmd = (s, action = null, move = { x: 0, z: 0 }) => ({
  tick: s.tick, sequence: 0, move, aim: { x: 0, z: -1 }, action,
});

// Formal receive feed while running on a fixed stick; one row per active
// forearm/hand contact made while the body is still moving.
function movingReceives(sticks) {
  const rows = [];
  for (const [sx, sz] of sticks) for (const z0 of [5.4, 5.8, 6.2]) for (const x0 of [-0.3, 0, 0.3])
    for (const m of [0.2, 0.35, 0.5, 0.8, 1.0]) for (let rt = 18; rt <= 40; rt++) {
      const s = createDirectGame(); s.player.x = x0; s.player.z = z0;
      let hit = null, v = 0;
      for (let t = 0; t < 240; t++) {
        stepDirectGame(s, [cmd(s, t === 0 ? 'feed' : t === rt ? 'receive' : null,
          t >= 10 ? { x: sx * m, z: sz * m } : { x: 0, z: 0 })]);
        let end = null;
        for (const e of s.events) {
          if (e.type === 'contact' && !hit) { hit = e; v = Math.hypot(s.player.vx, s.player.vz); }
          if (['ground', 'net', 'out'].includes(e.type)) end = e.type;
        }
        if (end) {
          if (hit?.active && ['forearm', 'hand'].includes(hit.part) && v >= 0.05) rows.push({ end, x: s.ball.x, z: s.ball.z, v });
          break;
        }
      }
    }
  return rows;
}
const rate = (rows, f) => rows.filter(f).length / rows.length;
const isNet = r => r.end === 'net';
const inZone = r => r.end === 'ground' && r.z >= 0.5 && r.z <= 3 && Math.abs(r.x) <= 3;
const groups = rows => [['0.5-1.5', rows.filter(r => r.v >= 0.5 && r.v < 1.5)], ['>=1.5', rows.filter(r => r.v >= 1.5)]];

test('A18a 往前移動中接球：碰網 ≤ 10%、舉球區 ≥ 50%（全體與兩個速度組）', () => {
  const rows = movingReceives([[0, -1]]);
  assert.ok(rows.length >= 100, `enough moving contacts (${rows.length})`);
  assert.ok(rate(rows, isNet) <= 0.10, `A18a net ${rate(rows, isNet).toFixed(2)} (n=${rows.length})`);
  assert.ok(rate(rows, inZone) >= 0.50, `A18a set zone ${rate(rows, inZone).toFixed(2)} (n=${rows.length})`);
  for (const [name, g] of groups(rows)) {
    assert.ok(g.length >= 30, `A18a group ${name} size ${g.length}`);
    assert.ok(rate(g, isNet) <= 0.10, `A18a group ${name} net ${rate(g, isNet).toFixed(2)} (n=${g.length})`);
    assert.ok(rate(g, inZone) >= 0.50, `A18a group ${name} set zone ${rate(g, inZone).toFixed(2)} (n=${g.length})`);
  }
});

test('A18b 斜前移動中接球：碰網 ≤ 10%、舉球區 ≥ 50%；兩個速度組碰網 ≤ 10%', () => {
  const rows = movingReceives([[0.7, -0.7], [-0.7, -0.7]]);
  assert.ok(rows.length >= 100, `enough moving contacts (${rows.length})`);
  assert.ok(rate(rows, isNet) <= 0.10, `A18b net ${rate(rows, isNet).toFixed(2)} (n=${rows.length})`);
  assert.ok(rate(rows, inZone) >= 0.50, `A18b set zone ${rate(rows, inZone).toFixed(2)} (n=${rows.length})`);
  for (const [name, g] of groups(rows))
    assert.ok(g.length && rate(g, isNet) <= 0.10, `A18b group ${name} net ${g.length ? rate(g, isNet).toFixed(2) : 'n/a'} (n=${g.length})`);
});

// Two active forearms given explicitly (elbow a -> hand b), shifted by `off`.
const forearm = (id, a, b, off) => ({
  id, part: 'forearm', active: true, radius: 0.05,
  a: { x: a.x + off.x, y: a.y, z: a.z + off.z }, b: { x: b.x + off.x, y: b.y, z: b.z + off.z },
});
const platform = (shape, off = { x: 0, z: 0 }) => shape.map(([id, a, b]) => forearm(id, a, b, off));
// Hands lower than elbows: the face points up and toward the net (-z).
const TILTED = [
  ['left-forearm', { x: -0.08, y: 1.0, z: 0 }, { x: -0.08, y: 0.9, z: -0.3 }],
  ['right-forearm', { x: 0.08, y: 1.0, z: 0 }, { x: 0.08, y: 0.9, z: -0.3 }],
];
// Right forearm higher than the left: the face has a sideways (-x) component.
const ROLLED = [
  ['left-forearm', { x: -0.08, y: 1.0, z: 0 }, { x: -0.08, y: 1.0, z: -0.3 }],
  ['right-forearm', { x: 0.08, y: 1.08, z: 0 }, { x: 0.08, y: 1.08, z: -0.3 }],
];
// Ball velocity after one contact with the platform moving at (vx, vz) m/s.
// opts: action (default receive), active arms (default true), player speed
// that differs from the platform's travel (a pinned or non-receiving body).
function bounce(shape, vx, vz, opts = {}) {
  const dt = DIRECT_DT / 16;
  const s = createDirectGame();
  s.player.action = opts.action ?? 'receive';
  s.player.vx = opts.playerVx ?? vx; s.player.vz = opts.playerVz ?? vz;
  if ('moveVz' in opts) s.player.moveVz = opts.moveVz;
  const next = platform(shape), old = platform(shape, { x: -vx * dt, z: -vz * dt });
  if (opts.active === false) for (const seg of [...next, ...old]) seg.active = false;
  const l = next[0], r = next[1];
  const centre = { x: (l.a.x + l.b.x + r.a.x + r.b.x) / 4, y: (l.a.y + l.b.y + r.a.y + r.b.y) / 4, z: (l.a.z + l.b.z + r.a.z + r.b.z) / 4 };
  // Start clear above the platform and let the ball fall onto it; every call
  // moves the platform by the same substep translation.
  Object.assign(s.ball, { active: true, x: centre.x, y: centre.y + 0.25, z: centre.z, vx: 0, vy: -4, vz: 1 });
  let hit = false;
  for (let i = 0; i < 200 && !hit; i++) hit = collideBody(s, old, next, dt);
  assert.ok(hit, `須觸球 (${vx}, ${vz})`);
  return { x: s.ball.vx, y: s.ball.vy, z: s.ball.vz };
}
const diff = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('A18c 只吸收往網子方向的身體速度；後退與橫移照舊傳到球上', () => {
  const still = bounce(TILTED, 0, 0);
  const forward = diff(bounce(TILTED, 0, -1.5), still);
  const backward = diff(bounce(TILTED, 0, 1.5), still);
  assert.ok(forward < 0.05, `往前平移不改變出球（差 ${forward.toFixed(3)} m/s）`);
  assert.ok(backward >= 0.3, `後退平移仍傳到球上（差 ${backward.toFixed(3)} m/s）`);
  const lateral = diff(bounce(ROLLED, 1.5, 0), bounce(ROLLED, 0, 0));
  assert.ok(lateral >= 0.3, `橫向平移仍傳到球上（差 ${lateral.toFixed(3)} m/s）`);
});

// Review round 1 (2026-09-25) regressions: absorption uses actual travel, and
// only active receive contacts absorb.
test('A18c+ 貼著前場邊界仍推搖桿時不吸收（用實際位移，不是意圖速度）', () => {
  const still = bounce(TILTED, 0, 0);
  const pinned = diff(bounce(TILTED, 0, 0, { playerVz: -5.5, moveVz: 0 }), still);
  assert.ok(pinned < 0.05, `邊界上沒有移動，出球須與靜止相同（差 ${pinned.toFixed(3)} m/s）`);
});

test('A18c+ 只有主動墊球吸收：扣球與被動觸球照舊帶入往前的身體速度', () => {
  for (const opts of [{ action: 'spike' }, { active: false }]) {
    const moving = bounce(TILTED, 0, -1.5, opts);
    const reference = bounce(TILTED, 0, -1.5, { ...opts, playerVz: 0, moveVz: 0 });
    const d = diff(moving, reference);
    assert.ok(d < 1e-9, `${JSON.stringify(opts)} 出球不得因吸收而改變（差 ${d.toFixed(3)} m/s）`);
    assert.ok(diff(moving, bounce(TILTED, 0, 0, opts)) >= 0.3, `${JSON.stringify(opts)} 往前平移仍傳到球上`);
  }
});
