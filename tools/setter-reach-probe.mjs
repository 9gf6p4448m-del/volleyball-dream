// S 分配窗體感量測（07-28 Sawmah 試玩提問：「要不要確定走得到才開面板」）：
// 二傳被 claim 之後，那顆球到底有沒有到他手上？沒到的話發生什麼事？
// 用法：node tools/setter-reach-probe.mjs
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

const stats = {
  claims: 0,          // 第二擊被指派給某人的次數（＝分配窗會開的次數）
  setterClaims: 0,    // 其中指派給「現任 S」的次數
  touchedBySetter: 0, // S 真的觸到球
  touchedByOther: 0,  // 別人碰到（補位/救球）
  dropped: 0,         // 沒人碰到——球落地
  dists: [],          // 指派當下 S 離接觸點的水平距離（m）
  distsFailed: [],    // 沒觸到的那些的距離
};

for (let seed = 1; seed <= 60; seed += 1) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  let pending = null; // { claimId, isSetter, dist, flightId }
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 300000) {
    guard += 1;
    const intents = aiCollectIntents(g, ai);
    // 指派剛成立的那一瞬間（第二擊、claim 有人）＝分配窗會開的時刻
    if (g.phase === 'rally' && g.rally.touches === 1 && ai.claimId && !pending) {
      const me = g.players[ai.claimId];
      const a = g.actors[ai.claimId];
      const cp = ai.contactPoint ?? ai.landing;
      const dist = cp ? Math.hypot(cp.x - a.x, cp.z - a.z) : null;
      pending = {
        claimId: ai.claimId,
        isSetter: me?.currentRole === 'setter',
        dist,
        flightId: g.rally.flightId,
      };
      stats.claims += 1;
      if (pending.isSetter) {
        stats.setterClaims += 1;
        if (dist !== null) stats.dists.push(dist);
      }
    }
    const events = stepGame(g, intents);
    for (const e of events) {
      if (!pending) continue;
      if (e.type === 'TOUCH' && e.touches === 2) {
        if (e.playerId === pending.claimId) stats.touchedBySetter += 1;
        else {
          stats.touchedByOther += 1;
          if (pending.isSetter && pending.dist !== null) stats.distsFailed.push(pending.dist);
        }
        pending = null;
      } else if (e.type === 'DEAD_BALL') {
        if (pending) {
          stats.dropped += 1;
          if (pending.isSetter && pending.dist !== null) stats.distsFailed.push(pending.dist);
        }
        pending = null;
      }
    }
    if (pending && g.rally.touches !== 1) pending = null; // 球權變了＝窗自然關
  }
}

const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : '0.0');
const q = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const total = stats.touchedBySetter + stats.touchedByOther + stats.dropped;
console.log(`樣本：${stats.claims} 次第二擊指派（60 場單局），其中指派給現任 S＝${stats.setterClaims}（${pct(stats.setterClaims, stats.claims)}%）`);
console.log(`結果：claim 者自己舉到 ${stats.touchedBySetter}（${pct(stats.touchedBySetter, total)}%）｜別人碰到 ${stats.touchedByOther}（${pct(stats.touchedByOther, total)}%）｜沒人碰到落地 ${stats.dropped}（${pct(stats.dropped, total)}%）`);
console.log(`指派當下 S 離接觸點距離：p50=${q(stats.dists, 0.5)?.toFixed(2)}m  p90=${q(stats.dists, 0.9)?.toFixed(2)}m  max=${Math.max(...stats.dists).toFixed(2)}m`);
if (stats.distsFailed.length) {
  console.log(`沒舉成的那些：n=${stats.distsFailed.length}  p50=${q(stats.distsFailed, 0.5)?.toFixed(2)}m  p90=${q(stats.distsFailed, 0.9)?.toFixed(2)}m`);
} else {
  console.log('沒舉成的樣本：0（AI 走位下 claim 者恆追得到）');
}
