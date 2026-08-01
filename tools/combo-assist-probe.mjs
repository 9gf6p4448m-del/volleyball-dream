// 叫戰術重做卷 段 4 基準探針 —— 組合獎金的發放頻率與受益者分佈
//
// ★★ 先講清楚這支探針量不到什麼（誠實性，不得在報告裡混淆）★★
// 段 1 的護欄 C 讓 `routeCommit` **只記受控玩家**（AI 隊友「沒跑自己的線」是因為他去
// 接球補位，不是一個決定）⇒ 組合獎金的受益者**結構上只可能是受控玩家**。
// 本探針跑 AI vs AI、場上沒有受控玩家 ⇒ **實際發放次數恆為 0，量不到**。
//
// 所以本檔量的是**上界**：假設有一個「每次都跟著 S 跑」的玩家坐在配合者的位置上，
// 他每 N 球拿到一次獎金。判準＝該波 ①有組合 ②攻方得分 ③他就是 `combo.partnerId`
// 且不是得分者本人——與 `applyComboAssist` 的三個閘一一對應，差別只在「實際起跳」
// 那一條：AI 恆跑自己的線 ⇒ 該條在本量測裡恆真＝上界的由來。
//
// ⚠ 踩過的坑（2026-08-01，寫在這裡免得重犯）：第一版用「SCORE 事件同 tick」、
//   第二版用 `e.team === lastTouchTeam` 判得分，兩版都錯——**`DEAD_BALL` 事件根本
//   沒有 `team` 欄位**（實際欄位只有 tick／type／reason／at），比的是 undefined ⇒
//   恆假 ⇒ 量出 0/251 這種不可能的數字。現行判準改用**比分變動**認得分方：
//   那是 sim 自己記分的同一份真相，不是另編的定義。
//
// 跑法：node tools/combo-assist-probe.mjs [局數=30]
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { TRUST_DYN } from '../src/sim/trust.js';

const SETS = Number(process.argv[2] ?? 30);

function runSet(seed, acc) {
  const game = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  let cur = null; // 本波的組合快照
  let guard = 0;
  while (game.phase !== 'setover' && game.phase !== 'matchover' && guard < 400000) {
    guard += 1;
    // settlePoint 在 DEAD_BALL 被推入**之前**就跑完，而它吃的 rally 欄位在事件推完後
    // 可能已被重置 ⇒ 每 tick 先照一張，判定時用這張（與 sim 讀到的是同一組值）
    const pre = {
      profile: game.rally.profile,
      lastToucherId: game.rally.lastToucherId,
      lastTouchTeam: game.rally.lastTouchTeam,
      scoreA: game.match.score.A,
      scoreB: game.match.score.B,
    };
    const events = stepGame(game, aiCollectIntents(game, ai, []));
    const combo = ai.attackCombo;
    if (combo?.partnerId && (!cur || cur.partnerId !== combo.partnerId)) {
      cur = {
        partnerId: combo.partnerId,
        partnerRole: game.players[combo.partnerId]?.currentRole ?? '?',
        kind: combo.partnerKind ?? combo.type ?? '?',
        type: combo.type,
      };
    }
    for (const e of events) {
      if (e.type !== 'DEAD_BALL') continue;
      acc.rallies += 1;
      // 得分方＝比分往上跳的那一隊（sim 自己記分的同一份真相）。
      // 其餘兩條沿用 settlePoint 的閘：只認乾淨歸因（最後觸球＝扣球）＋ reason BALL_IN
      const winner = game.match.score.A > pre.scoreA ? 'A'
        : game.match.score.B > pre.scoreB ? 'B' : null;
      const scored = pre.profile === 'spike' && !!pre.lastToucherId
        && e.reason === 'BALL_IN' && winner != null && pre.lastTouchTeam === winner;
      if (cur) {
        acc.comboRallies += 1;
        if (scored && cur.partnerId !== pre.lastToucherId) {
          acc.paid += 1;
          acc.byRole[cur.partnerRole] = (acc.byRole[cur.partnerRole] ?? 0) + 1;
          acc.byType[cur.type] = (acc.byType[cur.type] ?? 0) + 1;
        } else if (!scored) {
          acc.ranNoScore += 1;
        } else {
          acc.partnerScored += 1; // 配合者自己就是得分者＝拿既有 KILL，不重複賺
        }
      } else {
        acc.noCombo += 1;
      }
      cur = null;
    }
  }
}

const acc = {
  rallies: 0, comboRallies: 0, paid: 0, ranNoScore: 0, partnerScored: 0, noCombo: 0,
  byRole: {}, byType: {},
};
for (let s = 1; s <= SETS; s += 1) runSet(s * 101, acc);

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(2)}%` : '-');

console.log(`=== 組合獎金基準（${SETS} 局，AI vs AI）===`);
console.log('★ 這是**上界**：假設玩家每次都跟著 S 跑。實際發放只可能落在受控玩家身上，');
console.log('  而本探針場上沒有受控玩家 ⇒ 真實發放次數在這裡恆為 0，量不到。\n');
console.log(`總 rally 數                   ${acc.rallies}`);
console.log(`有組合的                      ${acc.comboRallies}  ${pct(acc.comboRallies, acc.rallies)}`);
console.log(`  ├ 得分且配合者≠得分者（發獎金）${acc.paid}  ${pct(acc.paid, acc.comboRallies)} of 有組合`);
console.log(`  ├ 得分但配合者自己就是得分者   ${acc.partnerScored}  ${pct(acc.partnerScored, acc.comboRallies)}（拿既有 KILL，不重複賺）`);
console.log(`  └ 沒得分（跑了白跑）          ${acc.ranNoScore}  ${pct(acc.ranNoScore, acc.comboRallies)}`);
console.log(`沒有組合的                    ${acc.noCombo}  ${pct(acc.noCombo, acc.rallies)}`);
console.log(`\n發放頻率：每 ${acc.paid ? (acc.rallies / acc.paid).toFixed(1) : '—'} 球一次`
  + `（每局約 ${(acc.paid / SETS).toFixed(1)} 次）`);
console.log(`跟著跑的期望值：跑了 ${acc.paid + acc.ranNoScore + acc.partnerScored} 次，`
  + `其中 ${acc.paid} 次拿到獎金 ＝ ${pct(acc.paid, acc.paid + acc.ranNoScore + acc.partnerScored)}`);

console.log('\n-- 受益者分佈（按角色）--');
for (const [k, v] of Object.entries(acc.byRole).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(10)} ${String(v).padStart(4)}  ${pct(v, acc.paid)}`);
}
console.log('-- 受益者分佈（按組合型）--');
for (const [k, v] of Object.entries(acc.byType).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(10)} ${String(v).padStart(4)}  ${pct(v, acc.paid)}`);
}

// 幅度外推（純算術，不改出廠值）：拿「幾次獎金頂到 CLAMP」當幅度的直覺尺
console.log(`\n-- 幅度外推（純算術；出廠值仍是 ${TRUST_DYN.COMBO_ASSIST}，本檔不改任何常數）--`);
console.log(`  對照組：KILL=${TRUST_DYN.KILL}（得分者每記殺球）／CLAMP=±${TRUST_DYN.CLAMP}（trustDyn 天花板）`);
console.log('  幅度  幾次獎金頂到 CLAMP  每局期望 trustDyn 增量（玩家全程跟跑）');
for (const v of [1, 2, 3, 5]) {
  console.log(`  ${String(v).padStart(4)}  ${String(Math.ceil(TRUST_DYN.CLAMP / v)).padStart(16)}`
    + `  ${((acc.paid / SETS) * v).toFixed(1)}`);
}
