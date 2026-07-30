// Phase 5 §十 階段五 —— 跳舉「抽選 vs 執行」觀測（段 2 裁定：執行率＝段段登記的觀察項）
//
// ★ 為什麼要這支 ★
// A3 跳舉的名目 0.35 是**抽選率**（每個第二觸窗擲一次骰）。收斂之後「抽中且真的以
// 跳舉觸成」的**執行率**變成觀測量：S2 退路（ai.js decideOne）讓球墜入站舉可及即退
// 站舉——二傳趕不上高點的比例隨可及縮小而升。tests/jump-set.test.mjs 的 ④ 守抽選器
// （窗層級骰率 ≈ 名目）；本探針把執行率量成可段段登記的數字。
//
// ★ 量什麼 ★
//   窗層級：第二觸窗數、抽中數（骰率，應 ≈ 名目 0.35 不隨 t 動）
//   抽中窗的結局：跳舉觸成／退站舉／整窗無舉球（後者是 S2 修復前的病灶，應維持低位）
//   執行率＝跳舉觸 ÷ 全部舉球觸（段段登記；隨 t 下滑＝二傳趕不上高點的誠實訊號）
//
// 跑法：node tools/phase5-jumpset-probe.mjs [局數=10]（語料與 P1/P2 同：seed = n×101）
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, AI } from '../src/sim/ai.js';

const SETS = Number(process.argv[2] ?? 10);

const win = { 1: { n: 0, jump: 0, stand: 0, dead: 0 }, 0: { n: 0, jump: 0, stand: 0, dead: 0 } };
let setTouches = 0;
let jumpTouches = 0;
for (let s = 1; s <= SETS; s += 1) {
  const g = createGame({ seed: s * 101, setTarget: 25 });
  const ai = createAiState();
  let guard = 0;
  let cur = null;
  let inWin = false;
  const close = (kind) => {
    if (!cur) return;
    win[cur.roll][kind] += 1;
    win[cur.roll].n += 1;
    cur = null;
  };
  while (g.phase !== 'set_over' && guard < 400000) {
    guard += 1;
    const intents = aiCollectIntents(g, ai);
    // 窗偵測在 collect（骰鎖存）之後、step 之前；ai.jumpSetRoll 是窗內鎖存的骰
    if (g.phase === 'rally' && g.rally.touches === 1 && ai.jumpSetRoll != null) {
      if (!inWin) {
        inWin = true;
        cur = { roll: ai.jumpSetRoll ? 1 : 0 };
      }
    } else {
      inWin = false;
    }
    for (const e of stepGame(g, intents)) {
      if (e.type === 'TOUCH' && e.kind === 'set') {
        setTouches += 1;
        if (e.jumpSet) jumpTouches += 1;
        if (cur) close(e.jumpSet ? 'jump' : 'stand');
      } else if (e.type === 'TOUCH' && cur) close('dead');
      if (e.type === 'DEAD_BALL' && cur) close('dead');
    }
    if (cur && (g.phase !== 'rally' || g.rally.touches !== 1)) close('dead');
  }
  close('dead');
}

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '－');
const w1 = win[1];
const w0 = win[0];
console.log(`=== 跳舉 抽選 vs 執行（${SETS} 局，t=${TUNING.CONVERGE_T ?? 0}）===`);
console.log(`窗數 ${w1.n + w0.n}　抽中 ${w1.n}（骰率 ${pct(w1.n, w1.n + w0.n)}，名目 ${AI.JUMP_SET_RATE * 100}%——不應隨 t 動）`);
console.log(`抽中窗結局：跳舉觸成 ${w1.jump}（${pct(w1.jump, w1.n)}）　退站舉 ${w1.stand}（${pct(w1.stand, w1.n)}）`
  + `　整窗無舉球 ${w1.dead}（${pct(w1.dead, w1.n)}${w1.n && w1.dead / w1.n > 0.15 ? '　⚠ 高於基線量級，查 S2 退路' : ''}）`);
console.log(`對照（未抽中窗無舉球）：${pct(w0.dead, w0.n)}`);
console.log(`**執行率（觀察項，段段登記）＝ 跳舉觸 ÷ 舉球觸 ＝ ${jumpTouches}/${setTouches} ＝ ${pct(jumpTouches, setTouches)}**`);
console.log('讀法：骰率貼名目＝抽選器健康；執行率隨 t 下滑＝二傳趕不上高點（誠實後果，非 bug）。');
