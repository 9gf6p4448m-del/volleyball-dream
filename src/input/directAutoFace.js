// Receive auto-face (trial modes, 2026-09-25): while the receive action is
// selected and the ball is live, the heading sent to the simulation turns the
// body toward the setter zone. The simulation itself is unchanged; headings
// are ordinary recorded commands.
export const AUTO_FACE_TARGET = { x: 0, z: 1.6 };
export const AUTO_FACE_HALF_LIMIT = Math.PI / 4; // from squarely facing the net
export const AUTO_FACE_MODES = ['manual', 'half', 'full'];

export function autoFaceAim(mode, player, ball) {
  if (mode !== 'half' && mode !== 'full') return null;
  if (!ball?.active) return null;
  let angle = Math.atan2(AUTO_FACE_TARGET.x - player.x, -(AUTO_FACE_TARGET.z - player.z));
  if (mode === 'half') angle = Math.max(-AUTO_FACE_HALF_LIMIT, Math.min(AUTO_FACE_HALF_LIMIT, angle));
  return { x: Math.sin(angle), z: -Math.cos(angle) };
}
