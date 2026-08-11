// 慢速／非典型彈道的攔網起跳時鐘（2026-08-11 爆接卷第三擊被攔率案）
//
// ★ 這一組守的是什麼 ★
// 攔網手的起跳時鐘原本錨在**擊球點**（`predictContactPoint`：攻擊手第幾 tick 會把球
// 打走），而攔網的結算全部發生在**網面**上（`game.js stepRally` 判過網、`tryBlock`
// 取過網那一 tick 的 `b.x`）。兩者只有在「擊球→過網」很短時才近似相等——那是一個
// 沒有人寫下來的前提：**彈道典型**。實測（RUNS=200 探針 blown-block-probe.mjs）：
//   典型扣球 擊球→過網 p50 8 tick；接噴之後「救起來、有人從中路慢慢打過去」p50 15、p95 32。
// 後者的下場是牆按擊球時鐘準時拔起、球卻晚 7–24 tick 才到，**過網時手已經落地**。
//
// ★ 載體＝「球過網那一刻，受球方前排還有沒有人在物理滯空內」★
//   口徑逐條抄 `game.js tryBlock` 的成員閘（`blockUntil` 窗開著 ∧ 起跳後 ≤ AIR_TICKS），
//   不重建模型：量的就是 sim 真的拿去組牆的那個集合。
//   分母切在 `AIR_TICKS`／`AIR_TICKS / 2`——**不是手挑的數字**，是滯空窗本身與
//   `player.js blockTopEdge` 的頂邊峰值（sin 波峰在 t = AIR_TICKS/2）。
//
// ★ 鑑別力（修復前實跑，24 局同一組 seed）★
//   超慢球（crossT > 24）：修復前 **13.33%**（10/75）→ 修復後 **92.59%**（75/81）
//   慢球  （crossT > 12）：修復前 **87.01%**（n=662）→ 修復後 **96.20%**（n=685）
//   ⇒ 兩條門檻都紅在**行為斷言**上（不是 import／屬性錯誤），而且是同一支腳本量的。
//
// ★ 版本無關化（比照 tandem-call-window.test.mjs 的稽核修正）★
//   本檔**不具名 import 任何新 export**（`predictNetCrossing` 是本次才有的）——
//   否則修復前的版本會在模組載入階段 SyntaxError、一條都跑不到＝紅在旁枝錯誤。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, createDefaultTeams } from '../src/sim/game.js';
import * as simAi from '../src/sim/ai.js';
import * as flight from '../src/sim/flight.js';
import { AIR_TICKS } from '../src/sim/approach.js';
import { isFrontRow } from '../src/sim/rotation.js';

const { createAiState, aiCollectIntents } = simAi;

// 24 局＝把「超慢球」這一格收到 n≈80（單局只有 3 顆左右）。
// 取樣量不是行為判準：門檻底下另有 n 的下限斷言，樣本不足會先在那裡紅。
const SETS = 24;

// 球過網那一刻，受球方前排「還在物理滯空內」的人數。
// 口徑＝`game.js tryBlock` 的成員閘前兩條（窗開著、起跳後 ≤ AIR_TICKS），
// 刻意不含高度閘：本測試問的是**時鐘**（人還在不在空中），不是搆不搆得到。
function blockersStillUp(game, toTeam) {
  const rot = game.match.rotations[toTeam];
  let up = 0;
  for (const pid of rot) {
    if (!isFrontRow(rot, pid)) continue;
    const a = game.actors[pid];
    if (!a || a.blockUntil < game.tick) continue;
    if (game.tick - a.blockStartTick > AIR_TICKS) continue;
    up += 1;
  }
  return up;
}

function collect() {
  const bucket = {
    slow: { n: 0, up: 0 },   // crossT > AIR_TICKS / 2（起跳後手已過峰值才到）
    verySlow: { n: 0, up: 0 }, // crossT > AIR_TICKS（一整個滯空窗都裝不下）
  };
  for (let k = 1; k <= SETS; k += 1) {
    const game = createGame({ seed: 900000 + k * 6311, teams: createDefaultTeams(), setTarget: 25 });
    const ai = createAiState();
    let guard = 0;
    let spikeTick = null;
    while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
      guard += 1;
      const zBefore = game.ball.z;
      const ev = stepGame(game, aiCollectIntents(game, ai, []));
      for (const e of ev) if (e.type === 'TOUCH' && e.kind === 'spike') spikeTick = game.tick;
      const zAfter = game.ball.z;
      // 過網述詞逐字抄 `stepRally`：同一件事只有一種判法
      if (spikeTick != null && (zBefore > 0) !== (zAfter > 0) && zBefore !== zAfter) {
        const toTeam = zAfter > 0 ? 'A' : 'B';
        const crossT = game.tick - spikeTick;
        const up = blockersStillUp(game, toTeam);
        if (crossT > AIR_TICKS / 2) { bucket.slow.n += 1; if (up > 0) bucket.slow.up += 1; }
        if (crossT > AIR_TICKS) { bucket.verySlow.n += 1; if (up > 0) bucket.verySlow.up += 1; }
        spikeTick = null;
      }
    }
  }
  return bucket;
}

test('慢速彈道：球過網時牆不得已經落地（起跳時鐘要錨在過網、不是擊球）', () => {
  const b = collect();
  const share = (x) => (x.n ? (x.up / x.n) * 100 : NaN);
  assert.ok(b.verySlow.n >= 50,
    `超慢球樣本不足（${b.verySlow.n} < 50）＝這個量測位置分不出有無`);
  assert.ok(b.slow.n >= 400, `慢球樣本不足（${b.slow.n} < 400）`);

  // ★ 門檻只跟著已裁定的重設計走，不得為了讓某次改動過關而調 ★
  //   75％：修復前 13.33%（10/75）／修復後 92.59%（75/81，SE 2.9pp ⇒ 餘裕 6 SE）
  assert.ok(share(b.verySlow) >= 75,
    `擊球→過網 > ${AIR_TICKS} tick 的球，過網時牆上還有人的比例只有 `
    + `${share(b.verySlow).toFixed(2)}%（${b.verySlow.up}/${b.verySlow.n}）< 75%`
    + '＝攔網手又在按「擊球時鐘」起跳、球還沒到就落地了');
  //   92％：修復前 87.01%（n=662）／修復後 96.20%（n=685）
  assert.ok(share(b.slow) >= 92,
    `擊球→過網 > ${AIR_TICKS / 2} tick 的球，過網時牆上還有人的比例只有 `
    + `${share(b.slow).toFixed(2)}%（${b.slow.up}/${b.slow.n}）< 92%`);
});

test('過網點預測與 sim 的實際過網逐值一致（AI 不得用另一套物理）', () => {
  // 本檔的修法讓 AI 讀「球會在第幾 tick、從哪個 x 過網」。那個量若與 sim 判過網
  // 用的物理分岔，攔網手就會站在一個不存在的點上——這條守的是**單一公式來源**。
  assert.ok(typeof flight.predictNetCrossing === 'function',
    'flight.js 沒有 predictNetCrossing：這一版沒有過網點預測，攔網時鐘仍錨在擊球點');
  const game = createGame({ seed: 424242, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  let guard = 0;
  let checked = 0;
  let pending = null;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000 && checked < 40) {
    guard += 1;
    // 步進之前先預測（吃的是這一 tick 的球態）
    const before = game.rally.profile === 'spike' ? flight.predictNetCrossing(game.ball) : null;
    if (before && pending == null) pending = { tick: game.tick, ...before };
    const zBefore = game.ball.z;
    stepGame(game, aiCollectIntents(game, ai, []));
    const zAfter = game.ball.z;
    if ((zBefore > 0) !== (zAfter > 0) && zBefore !== zAfter) {
      if (pending) {
        assert.equal(pending.tick + pending.ticks, game.tick,
          '預測的過網 tick 與 sim 實際過網 tick 不符');
        assert.ok(Math.abs(pending.x - game.ball.x) < 1e-9,
          `預測的過網 x ${pending.x} 與 sim 實際 ${game.ball.x} 不符`);
        checked += 1;
      }
      pending = null;
    }
    if (game.rally.profile !== 'spike') pending = null;
  }
  assert.ok(checked >= 20, `樣本不足（只驗到 ${checked} 次過網）`);
});
