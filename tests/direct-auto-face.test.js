// Receive auto-face trial modes. Acceptance: docs/kickoffs/direct-auto-face-acceptance.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { autoFaceAim, AUTO_FACE_TARGET as T } from '../src/input/directAutoFace.js';
import { createDirectGame, stepDirectGame, snapshotDirectGame, restoreDirectGame } from '../src/sim/directGame.js';

const angleOf = a => Math.atan2(a.x, -a.z);
const deg = r => r * 180 / Math.PI;

test('A20a 朝向計算：手動不改、全自動指向目標、半自動夾在 ±45°、球不在場上不改', () => {
  const ball = { active: true };
  assert.equal(autoFaceAim('manual', { x: 3, z: 5 }, ball), null);
  for (const [x, z] of [[3.5, 5], [-4, 2.5], [0, 8.5], [4.4, 4]]) {
    const full = autoFaceAim('full', { x, z }, ball);
    const want = Math.atan2(T.x - x, -(T.z - z));
    assert.ok(Math.abs(Math.hypot(full.x, full.z) - 1) < 1e-9, '單位向量');
    assert.ok(Math.abs(angleOf(full) - want) < 1e-9, `全自動指向目標 (${x}, ${z})`);
    const half = autoFaceAim('half', { x, z }, ball);
    const limited = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, want));
    assert.ok(Math.abs(angleOf(half) - limited) < 1e-9, `半自動夾在 ±45° (${x}, ${z}: ${deg(angleOf(half)).toFixed(1)}°)`);
  }
  for (const mode of ['manual', 'half', 'full']) assert.equal(autoFaceAim(mode, { x: 3, z: 5 }, { active: false }), null, mode);
});

// Player already under a shanked ball near the boundary; the ball drops onto the
// platform while drifting outward. Heading each tick comes from autoFaceAim.
const SPOTS = [[3.5, 5], [-3.5, 5], [4.2, 7.5], [-4.2, 7.5], [0, 8.5], [2.5, 8.5], [-2.5, 8.5], [4, 2.5], [-4, 2.5], [4.4, 4], [-4.4, 4]];
// One scenario; the shared pre-press ticks are simulated once and each press
// tick branches from a bit-exact snapshot (A5 guarantees restore equality).
function scenario(mode, spot, drift) {
  const s = createDirectGame(); s.player.x = spot[0]; s.player.z = spot[1];
  const settled = autoFaceAim(mode, s.player, { active: true }) ?? { x: 0, z: -1 };
  const h = s.player.height, cx = spot[0] + settled.x * 0.4 * h, cz = spot[1] + settled.z * 0.4 * h;
  const out = { x: Math.sign(spot[0]) || 0, z: spot[1] > 7 ? 1 : 0 }, ol = Math.hypot(out.x, out.z) || 1;
  const vx = out.x / ol * drift, vz = out.z / ol * drift, t = Math.sqrt(2 * 2.6 / 9.81);
  Object.assign(s.ball, { active: true, x: cx - vx * t, y: 3.5, z: cz - vz * t, vx, vy: 0, vz });
  const step = (g, action) => {
    const aim = autoFaceAim(mode, g.player, g.ball) ?? { x: 0, z: -1 };
    stepDirectGame(g, [{ tick: g.tick, sequence: 0, move: { x: 0, z: 0 }, aim, action }]);
  };
  const results = [];
  for (let k = 0; k <= 44; k++) {
    if (k >= 20) {
      const g = restoreDirectGame(snapshotDirectGame(s));
      let hit = null, ok = false;
      for (let j = k; j < 240; j++) {
        step(g, j === k ? 'receive' : null);
        const end = g.events.find(e => ['ground', 'net', 'out'].includes(e.type));
        hit ??= g.events.find(e => e.type === 'contact') ?? null;
        if (end) {
          const active = hit?.active && ['forearm', 'hand'].includes(hit.part);
          ok = active && end.type === 'ground' && g.ball.z >= 0.5 && g.ball.z <= 8 && Math.abs(g.ball.x) <= 4;
          break;
        }
      }
      results.push(ok);
    }
    step(s, null);
  }
  return results;
}
function saves(mode) {
  let saved = 0, windows = 0, total = 0;
  for (const sp of SPOTS) for (const drift of [0, 1, 2]) {
    const any = scenario(mode, sp, drift).filter(Boolean).length;
    total += 25; if (any) saved++; windows += any;
  }
  return { saved, windows, rate: windows / total };
}

test('A20c／A20d 追到球底下時的救回率：全自動 ≥ 25/33、半自動 ≥ 21/33、手動 = 13/33；全自動不是保證', () => {
  const full = saves('full'), half = saves('half'), manual = saves('manual');
  assert.equal(manual.saved, 13, `手動 ${manual.saved}/33`);
  assert.ok(full.saved >= 25, `全自動 ${full.saved}/33`);
  assert.ok(half.saved >= 21, `半自動 ${half.saved}/33`);
  assert.ok(full.saved >= half.saved && half.saved > manual.saved, `全自動 ${full.saved} ≥ 半自動 ${half.saved} > 手動 ${manual.saved}`);
  console.log(`[A20c] manual ${manual.saved}/${manual.windows} half ${half.saved}/${half.windows} full ${full.saved}/${full.windows}`);
  assert.ok(full.rate <= 0.60, `全自動時機組合救回率 ${(full.rate * 100).toFixed(0)}% ≤ 60%`);
});
