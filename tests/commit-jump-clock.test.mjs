// 難度重校卷 題 E（2026-08-05 Sawmah 裁定 E1 時機形狀）回歸閘
//
// 守的行為：commit 攔網手的起跳時鐘改吃球（球離二傳手後取樣 predictContactPoint
// 鎖存 jumpAt，快攻由「提前跳的閘」放行）之後，「球到達網平面時人仍在滯空窗內」
// 不得塌回舊制的「跳了個寂寞」。
//
// 工作點（tools/commit-overlap-probe.mjs，60 局 career 臂）：
//   舊制（助跑下降沿當主訊號）：整體滯空涵蓋 ≈10%（賭對組 9.4%／賭錯組 10.7%）
//   新制（時鐘＋提前跳閘）　　：整體滯空涵蓋 ≈57%（賭對組 55.1%／賭錯組 58.4%）
// 門檻取 35%＝兩側各留 ~20pp 餘裕；樣本門檻 150 使 SE≲4pp，分得出 10% 與 35%。
// ⚠ 門檻只跟著已裁定的重設計走，不得為了讓某次改動過關而調。
//
// 鑑別力（02 §6.1 條 1）：本測試在修復前的程式碼（worktree @ 修復前）上實跑過，
// 紅在下方的行為斷言（涵蓋率 <35%），不是旁枝錯誤——證據見題 E 收卷紀錄。
import test from 'node:test';
import assert from 'node:assert';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { isFrontRow } from '../src/sim/rotation.js';
import { AIR_TICKS } from '../src/sim/approach.js';

// 量法鏡像 tools/commit-overlap-probe.mjs：blockPlan 物件身分變了＝新一波攻擊；
// 球 z 變號且進到 B 半場＝到達網平面（同 game.js:1030 的 crossed 條件）；
// airT＝tick − actor.blockStartTick（同 game.js:1073 的算式）、窗長同 game.js:1085
// 真正拿來判攔網資格的 AIR_TICKS。全部走真實 sim，不重建任何判斷邏輯。
function commitCoverage(sets) {
  let covered = 0;
  let n = 0;
  for (let k = 0; k < sets; k += 1) {
    const game = createGame({
      seed: 3000 + k * 97, setTarget: 25,
      aiProfiles: { B: { blockPersona: 'commit' } },
    });
    const ai = createAiState();
    let lastPlanRef = null;
    let wall = null;
    let counted = false;
    let guard = 0;
    while (game.phase !== 'set_over' && guard < 400000) {
      guard += 1;
      const b0z = game.ball.z;
      const intents = aiCollectIntents(game, ai, []);
      if (ai.blockPlan !== lastPlanRef) {
        lastPlanRef = ai.blockPlan;
        wall = ai.blockPlan?.team === 'B' ? ai.blockPlan : null;
        counted = false;
      }
      stepGame(game, intents);
      const tick = game.tick;
      const crossed = (b0z > 0) !== (game.ball.z > 0) && b0z !== game.ball.z;
      if (crossed && game.ball.z <= 0 && wall && !counted) {
        counted = true; // 每波只取第一次過網
        const rot = game.match.rotations.B;
        for (const pid of Object.keys(wall.byPid)) {
          if (!isFrontRow(rot, pid)) continue;
          const airT = tick - game.actors[pid].blockStartTick;
          n += 1;
          if (airT <= AIR_TICKS) covered += 1;
        }
      }
    }
  }
  return { share: n ? (covered / n) * 100 : 0, n };
}

test('題E 回歸閘：commit 攔網手球過網時的滯空涵蓋率不得塌回「跳了個寂寞」', () => {
  const { share, n } = commitCoverage(6);
  assert.ok(n >= 150, `樣本足夠（n=${n}，門檻 150）`);
  assert.ok(share >= 35,
    `commit 滯空涵蓋率 ${share.toFixed(1)}%（n=${n}）< 35%`
    + '＝起跳時鐘失效（賭對也等不到球），回頭重看題 E 裁定與 ai.js 的 commit 時鐘取樣段');
});
