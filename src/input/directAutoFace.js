// Receive auto-face (user choice 2026-09-25: half, 45°): while the receive
// action is selected and the ball is live, the heading sent to the simulation
// turns the body toward the setter zone, at most 45° from squarely facing the
// net. The simulation itself is unchanged; headings are ordinary recorded commands.
export const AUTO_FACE_TARGET = { x: 0, z: 1.6 };
export const AUTO_FACE_LIMIT = Math.PI / 4;

export function autoFaceAim(player, ball) {
  if (!ball?.active) return null;
  const toward = Math.atan2(AUTO_FACE_TARGET.x - player.x, -(AUTO_FACE_TARGET.z - player.z));
  const angle = Math.max(-AUTO_FACE_LIMIT, Math.min(AUTO_FACE_LIMIT, toward));
  return { x: Math.sin(angle), z: -Math.cos(angle) };
}
