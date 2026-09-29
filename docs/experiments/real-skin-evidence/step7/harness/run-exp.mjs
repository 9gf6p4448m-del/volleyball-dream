// 比較原型自評：node run-exp.mjs <dqs|dqsc> <5k|20k>
import { evaluate, lib, V2 } from './evalx.mjs';
import { variantRp, DQS_WEIGHTS, skinDQS, skinDQSCollide } from './exp-dqs.mjs';
const [v, faces = '5k'] = process.argv.slice(2);
const rp = await variantRp(DQS_WEIGHTS);
let loaded = null;
const skin = v === 'dqs' ? (p) => skinDQS(p) : (p, setup) => skinDQSCollide(p, rp, setup.loaded);
const r = await evaluate(rp, faces, { skin });
console.log(`${v === 'dqs' ? 'DQS' : 'DQS＋碰撞修正'} ${faces}（權重：熱擴散 c=0.7、無輔助骨、上臂不剛性）`);
console.log(r.lines.join('\n'));
console.log('FAILS', r.fails.join('  ') || '（無）');
