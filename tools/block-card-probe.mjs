// 題 E 收尾探針 —— 兩張賭局字卡（賭錯空門／賭中）在 E1 之後的實際觸發率
//
// 試玩回報（2026-08-05 Sawmah）：打空門沒字卡、被攔到也沒字卡。
// 假說：字卡在「扣球觸球那一 tick」檢查對方是否物理滯空（blockBetFeedbackOf ①），
// 而 E1 讓 commit 的起跳 tick ≈ 擊球 tick（同瞬間，±1 tick 抖動）⇒ 觸球那一刻
// 常常還沒有人在空中，「賭了」的偵測踩空，兩張卡一起餓死。
//
// 量兩個位置：
//   A. 觸球 tick（現行字卡的量測位置）——直接呼叫 blockBetFeedbackOf 真函式
//   B. 球過網 tick（tryBlock 真正結算牆的位置）——同一組條件在 crossing 重算
// 若 A 近零而 B 健康 ⇒ 病灶＝量測位置，修法＝把字卡評估遞延到過網那一刻。
//
// 零 src 改動；只讀公開狀態。跑法：node tools/block-card-probe.mjs [局數=20]
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { isFrontRow } from '../src/sim/rotation.js';
import { AIR_TICKS } from '../src/sim/approach.js';
import { BLOCK_HALF_WIDTH } from '../src/sim/blockBand.js';
import { blockBetFeedbackOf } from '../src/input/blockBetFeedback.js';

const SETS = Number.parseInt(process.argv[2] ?? '20', 10);

function airborneWall(game) {
  const rot = game.match.rotations.B;
  const out = [];
  for (const id of rot) {
    if (!isFrontRow(rot, id)) continue;
    const a = game.actors[id];
    if (!a) continue;
    if (a.blockUntil < game.tick) continue;
    if (game.tick - a.blockStartTick > AIR_TICKS) continue;
    out.push(a);
  }
  return out;
}

const tally = {
  spikes: 0,
  atTouch: { none: 0, empty: 0, covered: 0 }, // 觸球 tick：無人空中／空門卡條件／賭中卡條件
  atCross: { none: 0, empty: 0, covered: 0 }, // 過網 tick：同一組條件
  cardAtTouch: { bet: 0, hit: 0 },            // 真函式回卡數（賭錯／賭中）
};

for (let k = 0; k < SETS; k += 1) {
  const game = createGame({
    seed: 5000 + k * 131, setTarget: 25,
    aiProfiles: { B: { blockPersona: 'commit' } },
  });
  const ai = createAiState();
  let pending = null; // { spiker } 等球過網
  let guard = 0;
  while (game.phase !== 'set_over' && guard < 400000) {
    guard += 1;
    const b0z = game.ball.z;
    const intents = aiCollectIntents(game, ai, []);
    const ev = stepGame(game, intents);
    for (const e of ev) {
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A') {
        tally.spikes += 1;
        const wall = airborneWall(game);
        const ballX = game.ball?.x ?? 0;
        if (!wall.length) tally.atTouch.none += 1;
        else if (wall.some((a) => Math.abs(a.x - ballX) <= BLOCK_HALF_WIDTH)) tally.atTouch.covered += 1;
        else tally.atTouch.empty += 1;
        // 真函式（扣球者＝受控玩家的路徑）
        const card = blockBetFeedbackOf(game, ai, e.playerId, e.playerId);
        if (card) {
          if (/賭中/.test(card.text)) tally.cardAtTouch.hit += 1;
          else tally.cardAtTouch.bet += 1;
        }
        pending = { at: game.tick };
      }
      if (e.type === 'DEAD_BALL') pending = null;
    }
    const crossed = (b0z > 0) !== (game.ball.z > 0) && b0z !== game.ball.z;
    if (crossed && game.ball.z <= 0 && pending) {
      const wall = airborneWall(game);
      const ballX = game.ball?.x ?? 0;
      if (!wall.length) tally.atCross.none += 1;
      else if (wall.some((a) => Math.abs(a.x - ballX) <= BLOCK_HALF_WIDTH)) tally.atCross.covered += 1;
      else tally.atCross.empty += 1;
      pending = null;
    }
  }
}

const pct = (x) => `${((x / Math.max(1, tally.spikes)) * 100).toFixed(1)}%`;
console.log(`A 隊扣球數（對 commit 牆）＝ ${tally.spikes}（${SETS} 局）`);
console.log('【A. 觸球 tick＝現行字卡量測位置】');
console.log(`  無人在空中（兩卡都不出）: ${tally.atTouch.none} (${pct(tally.atTouch.none)})`);
console.log(`  空門條件（賭錯卡）      : ${tally.atTouch.empty} (${pct(tally.atTouch.empty)})`);
console.log(`  罩住條件（賭中卡）      : ${tally.atTouch.covered} (${pct(tally.atTouch.covered)})`);
console.log(`  真函式實際回卡          : 賭錯 ${tally.cardAtTouch.bet}／賭中 ${tally.cardAtTouch.hit}`);
console.log('【B. 過網 tick＝tryBlock 結算牆的位置】');
console.log(`  無人在空中: ${tally.atCross.none} (${pct(tally.atCross.none)})`);
console.log(`  空門條件  : ${tally.atCross.empty} (${pct(tally.atCross.empty)})`);
console.log(`  罩住條件  : ${tally.atCross.covered} (${pct(tally.atCross.covered)})`);
