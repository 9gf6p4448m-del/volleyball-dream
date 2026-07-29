// Phase 5 §十-2 —— **read 手上到底有沒有線索能分辨「誘餌」與「真攻擊手」？**
//
// ★ 為什麼要這支 ★
// 起跳訊號改成下降沿之後，快攻已正確（頂邊完成度 92.7%／90.6%，地板 81.2%），
// 但兩翼／後排仍早約 55 tick。成因已量清楚：一次攻擊有**好幾個**下降沿——
//   第一個 p50 = set+35（中路誘餌拔起）、**最後一個 p50 = set+82**（真攻擊手起跳）。
// 現行訊號抓第一個 ⇒ 被誘餌帶走。
//
// 「該吃第幾個下降沿」看似是設計題，但它有一個**先決的事實問題**：
//   **在第一個下降沿那一刻，read 手上有沒有任何可觀察量能告訴他「這不是真的那個」？**
//   有 ⇒ 修法是實作題（用那個線索去 gate 下降沿）
//   沒有ie ⇒ read 人格在現行資訊環境下**本質上做不出來**，那是第五個
//           「機制存在但輸入是死的」（與 W1 那三件同型），要進 §十 病表。
// 不量就裁定＝又一次拿沒驗證的因果去動 sim（本卷已有三次前提被實測推翻）。
//
// ★ 量什麼（B 隊視角，read 臂）★
// 在**第一個下降沿**那一 tick 記下：
//   vanishX  剛剛消失的那個候選人的 x（＝ blockCommitRead 最後一次回傳的 x）
//   aimX     球的預測擊球點 x（predictContactPoint，read 的瞄準來源＝公開資訊）
//   ballX    球此刻的 x（更粗但更直接的線索）
// 攻擊真的發生後記下：
//   hitX     真正扣球那個人的 actor.x（＝答案）
// 然後比：
//   |vanishX − hitX|  消失的那個是不是真攻擊手（大 ⇒ 是誘餌）
//   |aimX − hitX|     **球在那一刻是不是已經指向真攻擊手**（小 ⇒ 球就是可用線索）
//   |ballX − hitX|    同上，用球的當下位置
//
// 判準（機械）：若 `|aimX − hitX|` 顯著小於 `|vanishX − hitX|`，
// 代表**球的拋物線在那一刻就已經能分辨** ⇒ 線索存在。
//
// 跑法：node tools/phase5-block-clue-probe.mjs [局數=8]
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, AI } from '../src/sim/ai.js';
import { blockCommitRead } from '../src/sim/blockRead.js';
import { predictContactPoint } from '../src/sim/flight.js';

const SETS = Number(process.argv[2] ?? 8);
const GROUP = { quick: 'quick', left: 'wing', right: 'wing', pipe: 'back', dball: 'back' };
const rows = [];

for (let s = 1; s <= SETS; s += 1) {
  const game = createGame({ seed: s * 101, setTarget: 25, aiProfiles: { B: { blockPersona: 'read' } } });
  const ai = createAiState();
  let cur = null;
  let prevRead = null;
  let guard = 0;
  while (game.phase !== 'set_over' && guard < 400000) {
    guard += 1;
    const r = game.rally;
    if (cur && r.possession === 'A') {
      const live = blockCommitRead(game, 'A', {
        passTier: ai.passTier ?? null, setterSpotLx: AI.SETTER_SPOT.lx,
      });
      // 第一個下降沿：上一 tick 讀得到、這一 tick 讀不到
      if (prevRead && !live && cur.edge1 == null && r.touches >= 2) {
        const hit = predictContactPoint(game.ball, AI.SPIKE_APPROACH_Y);
        cur.edge1 = game.tick - cur.setTick;
        cur.vanishX = prevRead.x;
        cur.aimX = hit ? hit.x : null;
        cur.ballX = game.ball.x;
        cur.passTier = ai.passTier ?? null;
      }
      if (live) prevRead = live;
      else if (!live) prevRead = null;
    }
    const ev = stepGame(game, aiCollectIntents(game, ai, []));
    for (const e of ev) {
      if (e.type === 'TOUCH' && e.kind === 'set' && e.team === 'A' && e.touches === 2) {
        cur = { setTick: game.tick, kind: null, edge1: null }; prevRead = null;
      }
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A' && cur && !cur.kind) {
        cur.kind = ai.attackKind;
        cur.hitX = game.actors[e.playerId]?.x ?? null;
        cur.hitLag = game.tick - cur.setTick;
      }
      if (e.type === 'DEAD_BALL' && cur) {
        if (cur.kind && cur.edge1 != null && cur.hitX != null) rows.push(cur);
        cur = null;
      }
    }
  }
}

const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);
const f = (v) => (Number.isFinite(v) ? v.toFixed(2) : '－');

console.log(`=== read 在「第一個下降沿」那一刻手上的線索（${SETS} 局，read 臂）===`);
console.log('判準：若 |aimX−hitX| 顯著小於 |vanishX−hitX|，代表球的拋物線當下已能分辨 ⇒ 線索存在\n');
for (const g of ['quick', 'wing', 'back']) {
  const rs = rows.filter((r) => GROUP[r.kind] === g);
  if (!rs.length) continue;
  const dVanish = rs.map((r) => Math.abs(r.vanishX - r.hitX));
  const withAim = rs.filter((r) => r.aimX != null);
  const dAim = withAim.map((r) => Math.abs(r.aimX - r.hitX));
  const dBall = rs.map((r) => Math.abs(r.ballX - r.hitX));
  console.log(`-- ${g}（n=${rs.length}）第一個下降沿 p50 = set+${med(rs.map((r) => r.edge1))}`
    + `　擊球 p50 = set+${med(rs.map((r) => r.hitLag))} --`);
  console.log(`   |vanishX − hitX| p50 = ${f(med(dVanish))} m   ← 消失的那個離真攻擊手多遠`);
  console.log(`   |aimX    − hitX| p50 = ${f(med(dAim))} m   ← **球的預測擊球點**離真攻擊手多遠`
    + `（predictContactPoint 有值的樣本 ${withAim.length}/${rs.length}）`);
  console.log(`   |ballX   − hitX| p50 = ${f(med(dBall))} m   ← 球的當下位置離真攻擊手多遠`);
  const tiers = [...new Set(rs.map((r) => r.passTier))];
  console.log(`   線索① passTier 當下取值：${tiers.join('/')}（只有一種取值＝這條線索無變化）\n`);
}
