// 「開窗那一刻的 attackerId，最後真的是他扣的嗎」—— **零 `src/` 改動**
//
// 動機（訴求二可行性）：`applyRouteKinds` 與 `pickAttackPoint` 在**同一個 tick**
// 內先後跑完（ai.js:413/424），所以 UI 下一幀讀 `aiState.attackerId` 時，
// 「這球給不給我」其實**已經是已知量**。問題只在它會不會被後續改判洗掉。
// 本探針量開窗時點的 attackerId 與**實際第三擊扣球者**的一致率。
//
// 用法：node tools/zz-cut-attacker-stability-probe.mjs [局數=20]
import { createGame, stepGame, createDefaultTeams } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, cutStateOf } from '../src/sim/ai.js';

const SETS = Number.parseInt(process.argv[2] ?? '20', 10);
const MAX_TICKS = 400000;
const PID = 'A2';

const t = {
  windows: 0, predMe: 0, predOther: 0,
  meAndSpiked: 0, meButOther: 0, meNoSpike: 0,
  otherButMe: 0, otherOk: 0,
  setTouchMe: 0, setTouchWindows: 0, // 二傳觸球那一刻的 attackerId 準不準
};

for (let run = 0; run < SETS; run += 1) {
  const game = createGame({ seed: 500000 + run * 7919, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  let guard = 0;
  let w = null;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
    guard += 1;
    const intents = aiCollectIntents(game, ai, []);
    const st = cutStateOf(game, ai, PID);
    if (st.open && !w) {
      w = { pred: ai.attackerId, atSet: null, spiker: null };
      t.windows += 1;
      if (w.pred === PID) t.predMe += 1; else t.predOther += 1;
    }
    const ev = stepGame(game, intents);
    if (w) {
      for (const e of ev) {
        if (e.type === 'TOUCH' && e.touches === 2 && e.team === 'A' && w.atSet === null) {
          w.atSet = ai.attackerId;
        }
        if (e.type === 'TOUCH' && e.touches === 3 && e.team === 'A') w.spiker = e.playerId;
      }
      const dead = ev.some((e) => e.type === 'DEAD_BALL');
      if (w.spiker != null || dead) {
        if (w.pred === PID) {
          if (w.spiker === PID) t.meAndSpiked += 1;
          else if (w.spiker != null) t.meButOther += 1;
          else t.meNoSpike += 1;
        } else if (w.spiker === PID) t.otherButMe += 1;
        else t.otherOk += 1;
        if (w.atSet != null) {
          t.setTouchWindows += 1;
          if ((w.atSet === PID) === (w.spiker === PID)) t.setTouchMe += 1;
        }
        w = null;
      }
    }
  }
}

const p = (a, b) => (b ? `${(a / b * 100).toFixed(1)}%` : 'n/a');
console.log(`=== 開窗時點 attackerId 的可信度（快速比賽，OH=${PID}，${SETS} 局）===`);
console.log(`開窗次數＝${t.windows}`);
console.log(`  開窗時預測「給我」＝${t.predMe}（${p(t.predMe, t.windows)}）`);
console.log(`    └ 真的由我扣＝${t.meAndSpiked}（${p(t.meAndSpiked, t.predMe)}）`
  + `／被別人扣＝${t.meButOther}（${p(t.meButOther, t.predMe)}）`
  + `／這波沒有第三擊（被攔死等）＝${t.meNoSpike}（${p(t.meNoSpike, t.predMe)}）`);
console.log(`  開窗時預測「不給我」＝${t.predOther}（${p(t.predOther, t.windows)}）`);
console.log(`    └ 結果卻是我扣＝${t.otherButMe}（${p(t.otherButMe, t.predOther)}）`);
const hit = t.meAndSpiked + t.otherOk;
console.log(`★ 開窗那一刻的「是不是給我」與最終扣球者一致率＝${hit}/${t.windows}（${p(hit, t.windows)}）`);
console.log(`★ 二傳觸球那一刻再問一次的一致率＝${t.setTouchMe}/${t.setTouchWindows}（${p(t.setTouchMe, t.setTouchWindows)}）`);
