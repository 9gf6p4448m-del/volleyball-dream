import { pathToFileURL } from 'node:url';
const root = process.argv[2]; // repo root
const { createDirectGame, stepDirectGame } = await import(pathToFileURL(root + '/src/sim/directGame.js'));
const { slowMotionScale, resolveHitAction, contextAction } = await import(pathToFileURL(root + '/src/sim/directReceiveRules.js'));
const cmd = (s, action = null) => ({ tick: s.tick, sequence: 0, move: { x: 0, z: 0 }, aim: { x: 0, z: -1 }, action, feedKind: 'serve' });
const s = createDirectGame(); s.player.z = 7;
let pressed = false; const rows = [];
for (let t = 0; t < 120; t++) {
  let action = t === 0 ? 'feed' : null;
  const scale = slowMotionScale(s), ctx = contextAction(s);
  if (!pressed && scale < 1 && s.ball.active && s.ball.y < 2.2) { action = resolveHitAction(s); pressed = true; }
  rows.push({ t, y: +s.ball.y.toFixed(2), scale, ctx, action });
  stepDirectGame(s, [cmd(s, action)]);
  const hit = s.events.find((e) => e.type === 'contact'); if (hit) { console.log('contact tick', t, hit.technique, hit.tier); break; }
}
console.log(rows.filter((r) => r.t >= 45).map((r) => `${r.t}:y${r.y}:s${r.scale}:${r.ctx}${r.action ? ':' + r.action : ''}`).join(' '));
