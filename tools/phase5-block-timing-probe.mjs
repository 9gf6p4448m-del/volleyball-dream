// Phase 5 §十-2 量測探針 —— 攔網的**時間預算**（read 的延遲到底有沒有咬到？）
//
// ★ 為什麼需要這支 ★
// §十-2 的驗收是「E 表反轉」：面對快攻，commit 的到位率必須高於 read。
// 憲法 §零 給的機制是**時機**不是位置——「read 加上決策延遲後，面對快攻他會晚
// 10–25 tick 起跳＝手還在球下面」。但這句話只有在
//   （二傳觸球 → 攻擊手擊球）的 tick 數 與 反應延遲 是同一個量級
// 時才成立。若快攻的這段窗有 60 tick，那 6–24 tick 的延遲根本不痛不癢。
// **先量這個數，再決定旋鈕往哪轉**——不量就調參是盲調。
//
// ★ 怎麼跑 ★
//   node tools/phase5-block-timing-probe.mjs [局數=12] [人格=read]
//
// ★ 量什麼 ★
//   setToHit    ＝二傳觸球 → 攻擊手擊球 的 tick 數（**這是 read 的全部時間預算**）
//   delay       ＝該攔網手的 reactionTicks（6–24，吃 reaction 屬性）
//   planLag     ＝二傳觸球 → 攔網鎖定成立 的 tick 數（實際的判斷延遲）
//   winOpen     ＝二傳觸球 → 攔網窗開啟 的 tick 數
//   airAtCross  ＝球過網瞬間的滯空 tick（= tick − blockStartTick）
//                 ——blockTimingMul 吃的就是它：太小＝手還在上升（BLOCK_LATE_MUL）、
//                 12 附近＝甜蜜區、太大＝已下墜（BLOCK_EARLY_MUL）
import { createGame, stepGame, TUNING, blockTimingMul } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { isFrontRow } from '../src/sim/rotation.js';

const SETS = Number(process.argv[2] ?? 12);
const PERSONA = process.argv[3] ?? 'read';
const GROUP = {
  quick: 'quick', left: 'wing', right: 'wing', pipe: 'back', dball: 'back',
};

function mbOf(game, team) {
  const rot = game.match.rotations[team];
  return rot.find((id) => isFrontRow(rot, id) && game.players[id].currentRole === 'middle') ?? null;
}

const rows = [];

function runSet(seed) {
  const game = createGame({ seed, setTarget: 25, aiProfiles: { B: { blockPersona: PERSONA } } });
  const ai = createAiState();
  let cur = null;
  let guard = 0;
  while (game.phase !== 'set_over' && guard < 400000) {
    guard += 1;
    const r = game.rally;
    const mb = mbOf(game, 'B');
    const zBefore = game.ball.z;
    const ev = stepGame(game, aiCollectIntents(game, ai));

    for (const e of ev) {
      // A 隊二傳觸球＝ read 的計時起點
      if (e.type === 'TOUCH' && e.kind === 'set' && e.team === 'A' && e.touches === 2) {
        cur = {
          setTick: game.tick, kind: null, planLag: null, winOpen: null,
          hitLag: null, airAtCross: null,
          delay: mb ? Math.max(6, Math.round(24 - game.players[mb].attributes.reaction * 0.16)) : null,
        };
      }
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A' && cur) {
        cur.hitLag = game.tick - cur.setTick;
        cur.kind = ai.attackKind;
      }
      if (e.type === 'DEAD_BALL' && cur) {
        if (cur.kind && cur.hitLag != null) rows.push(cur);
        cur = null;
      }
    }
    if (cur && mb) {
      // 鎖定成立那一 tick
      if (cur.planLag == null && ai.blockPlan?.team === 'B') cur.planLag = game.tick - cur.setTick;
      // 攔網窗開啟那一 tick
      if (cur.winOpen == null && game.actors[mb].blockUntil >= game.tick) {
        cur.winOpen = game.tick - cur.setTick;
      }
      // 球過網瞬間（z 由正轉負＝進 B 半場）的滯空 tick。
      // **只在攔網窗此刻真的開著時才算**——否則讀到的是上一次攔網留下的過期
      // blockStartTick（實測會給出 p50=519 這種荒謬值）。窗沒開＝這球他根本沒跳，
      // 記為 noJump 另計，不混進時機分佈裡。
      if (cur.airAtCross == null && cur.noJump == null && zBefore > 0 && game.ball.z <= 0) {
        const a = game.actors[mb];
        if (a.blockUntil >= game.tick) cur.airAtCross = game.tick - a.blockStartTick;
        else cur.noJump = 1;
      }
    }
  }
}

for (let s = 1; s <= SETS; s += 1) runSet(s * 101);

const pct = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const col = (g, key) => g.map((r) => r[key]).filter((v) => v != null);
const fmt = (arr) => (arr.length
  ? `p10=${pct(arr, 0.1).toFixed(0).padStart(4)} p50=${pct(arr, 0.5).toFixed(0).padStart(4)} `
    + `p90=${pct(arr, 0.9).toFixed(0).padStart(4)}`
  : '        （無樣本）        ');

console.log(`=== §十-2 攔網時間預算探針（${SETS} 局／人格＝${PERSONA}）===`);
console.log(`B 隊 MB 視角；單位 tick（60Hz，60 tick ＝ 1.0s）　樣本 ${rows.length} 次攻擊`);
console.log(`blockTimingMul 檔位：晚(1)=${blockTimingMul(1)}　甜蜜(12)=${blockTimingMul(12)}　`
  + `早(40)=${blockTimingMul(40)}　攔網窗長=${TUNING.BLOCK_WINDOW}`);
for (const group of ['quick', 'wing', 'back']) {
  const g = rows.filter((r) => GROUP[r.kind] === group);
  if (!g.length) continue;
  console.log('');
  console.log(`-- ${group}（n=${g.length}）--`);
  console.log(`  setToHit  二傳觸球→擊球      ${fmt(col(g, 'hitLag'))}   ← read 的全部時間預算`);
  console.log(`  delay     反應延遲            ${fmt(col(g, 'delay'))}   ← 佔預算的比例決定痛不痛`);
  console.log(`  planLag   →鎖定成立          ${fmt(col(g, 'planLag'))}`);
  console.log(`  winOpen   →攔網窗開啟        ${fmt(col(g, 'winOpen'))}`);
  console.log(`  airAtCross 球過網時的滯空     ${fmt(col(g, 'airAtCross'))}   ← blockTimingMul 吃這個`);
  const air = col(g, 'airAtCross');
  const noJump = col(g, 'noJump').length;
  console.log(`  球過網時窗沒開（根本沒跳）   ${(noJump / g.length * 100).toFixed(1)}%  (${noJump}/${g.length})`);
  if (air.length) {
    const late = air.filter((v) => v < 4).length / air.length;
    const sweet = air.filter((v) => v >= 4 && v <= 26).length / air.length;
    console.log(`  有跳者的時機分佈（n=${air.length}）：太晚(<4) ${(late * 100).toFixed(1)}%　`
      + `甜蜜(4-26) ${(sweet * 100).toFixed(1)}%　`
      + `太早(>26) ${((1 - late - sweet) * 100).toFixed(1)}%`);
  }
}
