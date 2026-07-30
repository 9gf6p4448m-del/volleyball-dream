// §十-4b 款3 離地率警報器紅的歸因消融——哪個意圖子機制（tool／retract／press）
// 打掉了 gap？口徑**逐行抄自** tests/block-persona.test.mjs quickAirShare
//（rally 最後一次快攻落帳、MB 過網 tick 頂邊完成度 > 站立地板＝離地）——
// 不得自創口徑（上一卷教訓：口徑不一致差 +19pp）。
// patch 法同 t10-4-jumpcount-frozen.mjs（ESM 單例，原檔不動）。
//
// 跑法：node tools/t10-4b-alarm-ablation.mjs <arm> [局數=40]
//   arm ∈ all | tool0 | noretract | pressonly（tool、retract 全關）
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, AI } from '../src/sim/ai.js';
import { isFrontRow } from '../src/sim/rotation.js';
import { blockReach, blockTopEdge, standingReach } from '../src/sim/player.js';
import { staminaPerfMul } from '../src/sim/stamina.js';

const arm = process.argv[2] ?? 'all';
const SETS = Number(process.argv[3] ?? 40);

if (arm === 'tool0' || arm === 'pressonly') TUNING.TOOL_CHANCE = 0;
if (arm === 'noretract' || arm === 'pressonly') {
  AI.BLOCK_RETRACT_ON_POOR = 0;
  AI.BLOCK_RETRACT_WIDE_X = 999;
}

// ==== 口徑照抄 tests/block-persona.test.mjs:321-368（quickAirShare）====
function quickAirShare(persona, sets) {
  let above = 0;
  let total = 0;
  for (let s = 1; s <= sets; s += 1) {
    const game = createGame({ seed: s * 101, setTarget: 25, aiProfiles: { B: { blockPersona: persona } } });
    const ai = createAiState();
    let cur = null;
    let guard = 0;
    const settle = () => {
      if (cur && cur.kind === 'quick' && cur.crossTick != null) {
        total += 1;
        if (cur.topPct != null && cur.floorPct != null && cur.topPct > cur.floorPct) above += 1;
      }
    };
    while (game.phase !== 'set_over' && guard < 400000) {
      guard += 1;
      const zBefore = game.ball.z;
      const ev = stepGame(game, aiCollectIntents(game, ai, []));
      for (const e of ev) {
        if (e.type === 'TOUCH' && e.kind === 'set' && e.team === 'A' && e.touches === 2) {
          const rot = game.match.rotations.B;
          const mb = rot.find((id) => isFrontRow(rot, id)
            && game.players[id].currentRole === 'middle') ?? null;
          cur = mb ? { mb, kind: null, crossTick: null, topPct: null, floorPct: null } : null;
        }
        if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A' && cur && cur.kind == null) {
          cur.kind = ai.attackKind;
        }
        if (e.type === 'DEAD_BALL') {
          settle();
          cur = null;
        }
      }
      if (!cur) continue;
      if (cur.crossTick == null && zBefore > 0 && game.ball.z <= 0) {
        cur.crossTick = game.tick;
        const a = game.actors[cur.mb];
        const p = game.players[cur.mb];
        const jumpMul = staminaPerfMul(game, p);
        const inWin = a.blockUntil >= game.tick;
        const t = inWin ? game.tick - a.blockStartTick : null;
        const apex = blockReach(p, jumpMul);
        cur.topPct = apex > 0 && t != null ? blockTopEdge(p, t, jumpMul) / apex : null;
        cur.floorPct = apex > 0 ? standingReach(p) / apex : null;
      }
    }
  }
  return { share: total ? (above / total) * 100 : NaN, n: total };
}

console.log(`=== 消融臂 ${arm}（${SETS} 局/人格）：TOOL_CHANCE=${TUNING.TOOL_CHANCE}`
  + ` RETRACT_ON_POOR=${AI.BLOCK_RETRACT_ON_POOR} RETRACT_WIDE_X=${AI.BLOCK_RETRACT_WIDE_X} ===`);
const read = quickAirShare('read', SETS);
const commit = quickAirShare('commit', SETS);
console.log(`read   離地率 ${read.share.toFixed(1)}%（n=${read.n}）`);
console.log(`commit 離地率 ${commit.share.toFixed(1)}%（n=${commit.n}）`);
console.log(`gap（commit−read）= ${(commit.share - read.share).toFixed(1)}pp（警報門檻 ≥5）`);
