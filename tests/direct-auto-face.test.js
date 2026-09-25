// Receive auto-face, fixed to half (45°) by user choice 2026-09-25.
// Acceptance: docs/kickoffs/direct-auto-face-acceptance.md (revision log)
import test from 'node:test';
import assert from 'node:assert/strict';
import { autoFaceAim, AUTO_FACE_TARGET as T } from '../src/input/directAutoFace.js';

const angleOf = a => Math.atan2(a.x, -a.z);
const deg = r => r * 180 / Math.PI;

test('A20a 朝向計算：指向舉球區並夾在 ±45°、球不在場上不改', () => {
  const ball = { active: true };
  for (const [x, z] of [[3.5, 5], [-4, 2.5], [0, 8.5], [4.4, 4], [1, 5]]) {
    const aim = autoFaceAim({ x, z }, ball);
    const want = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, Math.atan2(T.x - x, -(T.z - z))));
    assert.ok(Math.abs(Math.hypot(aim.x, aim.z) - 1) < 1e-9, '單位向量');
    assert.ok(Math.abs(angleOf(aim) - want) < 1e-9, `(${x}, ${z}: ${deg(angleOf(aim)).toFixed(1)}°)`);
  }
  assert.equal(autoFaceAim({ x: 3, z: 5 }, { active: false }), null);
});

// A20c／A20d（追到球底下的救回率）退場：direct-v7 接球輔助改由時機決定出球，
// 見 docs/kickoffs/direct-v7-receive-assist-acceptance.md 使用者裁定第 6 題。
