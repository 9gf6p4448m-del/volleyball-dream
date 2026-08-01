// 攔網時序卷 段 1 探針 —— 「攔網接觸中有多少是已落地的攔網手擦到的」
//
// 量的是實際事件與實際 actor 狀態，不是意圖：
//   兩支臂完全同一組 seed、同一套球員、同一套 AI，**只差 B 隊的 blockPersona**。
//   A 隊照常進攻，逐次 BLOCK_TOUCH 記錄「這一手離自己起跳過了幾 tick」。
//
// 「已落地」的判準＝ `airT > AIR_TICKS`（approach.js:278，值 24）——
//   與 `blockTopEdge`（player.js:130）判「手回站立摸高」用的**同一條線**，
//   不另編指標。airT = 事件 tick − actor.blockStartTick。
//
// 四桶（與 §十-4b 的接觸分區同源，直接讀事件欄位，不重算）：
//   press  壓球     ev.pressed === true          （zone=top 且 blockHand=press）
//   top    擦頂     ev.graze && ev.zone === 'top'
//   side   擦側     ev.graze && ev.zone === 'side'
//   body   手身攔回 其餘（無 zone 欄位＝走到屬性擲骰並中）
//
// 跑法：node tools/landed-block-probe.mjs [局數=40]
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { AIR_TICKS } from '../src/sim/approach.js';

const SETS = Number(process.argv[2] ?? 40);

function bucketOf(e) {
  if (e.pressed) return 'press';
  if (e.graze) return e.zone === 'top' ? 'top' : 'side';
  return 'body';
}

function runSet(seed, blockPersona) {
  const game = createGame({ seed, setTarget: 25, aiProfiles: { B: { blockPersona } } });
  const ai = createAiState();
  const rows = [];
  let guard = 0;
  while (game.phase !== 'setover' && game.phase !== 'matchover' && guard < 400000) {
    guard += 1;
    const events = stepGame(game, aiCollectIntents(game, ai, []));
    for (const e of events) {
      if (e.type !== 'BLOCK_TOUCH' || e.team !== 'B') continue;
      const actor = game.actors[e.playerId];
      const airT = e.tick - actor.blockStartTick;
      rows.push({ airT, landed: airT > AIR_TICKS, bucket: bucketOf(e) });
    }
  }
  return rows;
}

function arm(persona) {
  const rows = [];
  for (let s = 1; s <= SETS; s += 1) rows.push(...runSet(s * 101, persona));
  return rows;
}

function pct(n, d) {
  return d ? ((n / d) * 100).toFixed(2) : '-';
}

// 二項比例標準誤（pp）
function se(n, d) {
  if (!d) return '-';
  const p = n / d;
  return (Math.sqrt((p * (1 - p)) / d) * 100).toFixed(2);
}

const BUCKETS = ['body', 'top', 'side', 'press'];
const LABEL = { body: 'body 手身攔回', top: 'graze 擦頂', side: 'graze 擦側', press: 'press 壓球' };

const arms = { read: arm('read'), commit: arm('commit') };

console.log(`=== 落地攔網探針（${SETS} 局／臂；兩臂同 seed、只差 B 隊 blockPersona）===`);
console.log(`AIR_TICKS = ${AIR_TICKS}（airT > ${AIR_TICKS} 判為已落地）\n`);

console.log('人格      接觸數   已落地   已落地%（±SE）  airT p50  airT p90');
for (const p of ['read', 'commit']) {
  const rows = arms[p];
  const landed = rows.filter((r) => r.landed).length;
  const airs = rows.map((r) => r.airT).sort((a, b) => a - b);
  const p50 = airs.length ? airs[Math.floor(airs.length / 2)] : '-';
  const p90 = airs.length ? airs[Math.floor(airs.length * 0.9)] : '-';
  console.log(
    `${p.padEnd(8)}  ${String(rows.length).padStart(6)}  ${String(landed).padStart(6)}  `
    + `${pct(landed, rows.length).padStart(7)} ± ${se(landed, rows.length).padStart(4)}  `
    + `${String(p50).padStart(8)}  ${String(p90).padStart(8)}`,
  );
}

console.log('\n-- 四桶分佈（次數；括號＝該桶中已落地的比例）--');
console.log('人格      ' + BUCKETS.map((b) => LABEL[b].padEnd(16)).join(''));
for (const p of ['read', 'commit']) {
  const rows = arms[p];
  const cells = BUCKETS.map((b) => {
    const g = rows.filter((r) => r.bucket === b);
    const l = g.filter((r) => r.landed).length;
    return `${String(g.length).padStart(5)} (${pct(l, g.length).padStart(6)}%)`.padEnd(16);
  });
  console.log(`${p.padEnd(8)}  ${cells.join('')}`);
}
