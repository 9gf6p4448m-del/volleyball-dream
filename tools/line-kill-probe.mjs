// 4.5B 追修量測：殺球（BALL_IN）落點的「離最近界線距離」分布——
// 供「邊線是我的」咬線門檻定值（AI 亂打＝下緣基準；真人選線區應更貼線）
// 用法：node line-kill-dist.mjs：node tools/line-kill-probe.mjs
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { COURT } from '../src/sim/constants.js';

const HALF_W = COURT.WIDTH / 2;   // 4.5
const HALF_D = COURT.LENGTH / 2;  // 9
const dists = [];
let kills = 0;
let rallies = 0;

for (let seed = 1; seed <= 80; seed += 1) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  let lastKind = null;
  while (g.phase !== 'set_over' && g.tick < 300000) {
    const events = stepGame(g, aiCollectIntents(g, ai));
    for (const e of events) {
      if (e.type === 'TOUCH' || e.type === 'SERVE') lastKind = e.kind ?? 'serve';
      else if (e.type === 'BLOCK_TOUCH') lastKind = 'block';
      if (e.type === 'DEAD_BALL') {
        rallies += 1;
        if (e.reason === 'BALL_IN' && (lastKind === 'spike' || lastKind === 'tip') && e.at) {
          const d = Math.min(HALF_W - Math.abs(e.at.x), HALF_D - Math.abs(e.at.z));
          if (d >= 0) { dists.push(d); kills += 1; }
        }
      }
    }
  }
}

dists.sort((a, b) => a - b);
const pct = (m) => ((dists.filter((d) => d <= m).length / dists.length) * 100).toFixed(1);
console.log(`樣本：${kills} 記殺球落地（${rallies} 個死球、80 場單局）`);
console.log(`離線距離 分位數：p10=${dists[Math.floor(dists.length * 0.1)].toFixed(2)}m  p25=${dists[Math.floor(dists.length * 0.25)].toFixed(2)}m  p50=${dists[Math.floor(dists.length * 0.5)].toFixed(2)}m`);
for (const m of [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5]) {
  console.log(`門檻 ≤${m.toFixed(2)}m：${pct(m)}% 的殺球會觸發`);
}
