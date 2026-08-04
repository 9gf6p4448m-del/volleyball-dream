// 誘餌瞄準量測（2026-08-04，Sawmah 試玩提問「騙攔網這個機制真的有嗎」）
//
// 背景：`ai.js blockAimX` 的註解記載，當年攔網手用「攻擊手身體 x」當瞄準點時
// **會被中路假動作誘餌帶偏**（read 面對兩翼的 MB 落差 p50 達 3.39m，
// 「因為誘餌恆是最接近網、正在推進的那個，選人規則永遠選他」），於是那條規則被拿掉，
// 改成 read 瞄球的預測擊球點、commit 讀二傳配分傾向。
// ⇒ **現行版本的「方向誘餌」不成立**（只有時間差誘餌成立，走 blockCommitRead 起跳訊號）。
//
// 本探針量：**若把方向誘餌重新打開，會有多強**。
// 臂＝`BLOCK_COMMIT.DECOY_AIM_MIX`（production 預設 0＝零行為改動，sim-hash 可證）。
//
// 用法：node tools/decoy-aim-probe.mjs [局數=8]
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { BLOCK_COMMIT } from '../src/sim/blockRead.js';
import { isFrontRow, otherTeam } from '../src/sim/rotation.js';

const SETS = Number.parseInt(process.argv[2] ?? '8', 10);

// 扣球當下：防守方前排離球最近的那隻手，水平差多少（＝「站對位置了沒」的直接量）
function nearestBlockerGap(game, atkTeam) {
  const def = otherTeam(atkTeam);
  const rot = game.match.rotations?.[def];
  if (!rot?.length) return null;
  let best = null;
  for (const pid of rot) {
    if (!isFrontRow(rot, pid)) continue;
    const a = game.actors?.[pid];
    if (!a) continue;
    const gap = Math.abs(a.x - game.ball.x);
    if (best == null || gap < best) best = gap;
  }
  return best;
}

function runArm(mix) {
  BLOCK_COMMIT.DECOY_AIM_MIX = mix;
  let spikes = 0, blockTouch = 0, gapSum = 0, gapN = 0;
  const gaps = [];
  for (let s = 1; s <= SETS; s += 1) {
    // ★ B 隊指定 commit 人格 ★ 誘餌只騙得到 commit（read 免疫，見 ai.js blockAimX）
    // ⇒ 不指定的話兩邊都是 read、誘餌恆為 no-op，量出來會是「無效」的假象。
    const game = createGame({
      seed: s * 101, setTarget: 25, aiProfiles: { B: { blockPersona: 'commit' } },
    });
    const ai = createAiState();
    let guard = 0;
    while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
      guard += 1;
      for (const e of stepGame(game, aiCollectIntents(game, ai, []))) {
        // 只計 B 隊（commit 那一側）的攔網——A 隊是 read、不受誘餌影響，混進來會稀釋訊號
        if (e.type === 'BLOCK_TOUCH' && e.team === 'B') blockTouch += 1;
        if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A') {
          spikes += 1;
          const g = nearestBlockerGap(game, e.team);
          if (g != null) { gapSum += g; gapN += 1; gaps.push(g); }
        }
      }
    }
  }
  gaps.sort((a, b) => a - b);
  const p50 = gaps.length ? gaps[Math.floor(gaps.length / 2)] : NaN;
  return {
    spikes,
    blockTouch,
    touchRate: (blockTouch / spikes) * 100,
    gapMean: gapSum / gapN,
    gapP50: p50,
  };
}

// 掃描多個 mix：只有開/關兩點看不出「溫和版可不可行」
const MIXES = [0, 0.35, 0.7, 1];
const rows = MIXES.map((m) => ({ mix: m, ...runArm(m) }));
BLOCK_COMMIT.DECOY_AIM_MIX = 0; // 還原，避免污染同進程的其他量測

console.log(`=== 誘餌瞄準掃描（${SETS} 局／臂，各臂同 seed 配對）===`);
console.log('mix ｜ 攔網觸球率 ｜ 手球水平差(平均/p50) ｜ Δ觸球率 vs 現行');
const base = rows[0];
for (const r of rows) {
  console.log(`${r.mix.toFixed(2)} ｜ ${r.touchRate.toFixed(2)}% `
    + `｜ ${r.gapMean.toFixed(2)}m / ${r.gapP50.toFixed(2)}m `
    + `｜ ${(r.touchRate - base.touchRate >= 0 ? '+' : '')}${(r.touchRate - base.touchRate).toFixed(2)}pp`);
}
console.log('');
console.log('（觸球率掉、水平差變大＝誘餌把牆帶走了。攔網半寬 0.5m：平均差超過它＝平均而言搆不到）');
