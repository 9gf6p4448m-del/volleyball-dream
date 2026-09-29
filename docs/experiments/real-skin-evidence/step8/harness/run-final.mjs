// 方案 3 正式實作（src 現行）自評：node run-s3.mjs <5k|20k>
import { evaluate } from '../../step7/harness/evalx.mjs';
const rp = await import('../../../../../src/render/realPlayer.js');
const faces = process.argv[2] || '5k';
const r = await evaluate(rp, faces);
console.log(`R13 正式版 DQS＋碰撞修正（src）${faces}  sdf=${r.setup.loaded.sdfSource} weights=${r.setup.loaded.weightsSource}`);
console.log(r.lines.join('\n'));
console.log('FAILS', r.fails.join('  ') || '（無）');
