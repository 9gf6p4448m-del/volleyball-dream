// 卷五 查證 1＋量測項 1（2026-08-02）：S 分配窗的**時間**長度分佈
//
// 為什麼要量：裁定 3 把遠段／近段的界線從空間判準（`SET_READY_M = 3.2` 公尺）
// 改成時間判準（距我接觸還剩幾 tick）。門檻值不能拍腦袋——本專案已抓到七個恆假
// 判斷式，共同形狀都是「拿一個看起來合理的數字去卡另一個沒實際量過的量」。
//
// 量的是什麼（**語意同座標系**，02 §6.1 條 2）：
//   `aiState.setContactPoint.ticks`＝球墜到**二傳舉球手點高度**（SET_HANDPOINT_H_RATIO
//   × 身高，reach.js 單一真相）還剩幾 tick ＝「球還有多久到我手上」。
//   ⚠ 不是 `aiState.contactPoint`——那個用的是接球舒適高度 `RECV_CONTACT_Y = 1.35`，
//   墜到 1.35m 比墜到手點高度晚，兩者不是同一個時刻。
//
// 取得路徑＝**真實路徑**：跑真的 createGame／aiCollectIntents／stepGame 迴圈，
// 讀協調層自己算出來的那一格，不重抄一份預測邏輯（重抄＝循環論證，02 §6.1 條 4）。
//
// 用法：node tools/set-window-eta-probe.mjs
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { SET_READY_M, SET_READY_TICKS, setStageOf } from '../src/input/setOptions.js';

const SEEDS = Number(process.env.VD_SEEDS ?? 60);

// 每一波（S 被指派舉第二球）記一筆
const rows = [];

for (let seed = 1; seed <= SEEDS; seed += 1) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  let cur = null; // 本波的追蹤狀態
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 300000) {
    guard += 1;
    const intents = aiCollectIntents(g, ai);
    const inWindow = g.phase === 'rally' && g.rally.touches === 1 && !!ai.claimId;
    if (inWindow) {
      const me = g.players[ai.claimId];
      const a = g.actors[ai.claimId];
      // 開窗那一刻（本波第一次進到這個狀態）
      if (!cur || cur.flightId !== g.rally.flightId) {
        cur = {
          flightId: g.rally.flightId,
          isSetter: me?.currentRole === 'setter',
          tier: ai.passTier ?? null,
          openEta: ai.setContactPoint?.ticks ?? null, // 開窗時「還剩幾 tick」＝窗長
          openRecvEta: (ai.contactPoint ?? ai.landing)?.ticks ?? null, // 接球高度版對照
          openDist: null,
          nearEta: null,   // 現行 3.2m 門檻首次成立時，還剩幾 tick
          done: false,
        };
        // ⚠ 距離**逐字照抄 matchLoop.js:849-852**（現制判準的真相），不自己另挑一個點：
        //   `setContact = aiState.contactPoint ?? aiState.landing`（接球高度 1.35m 版）。
        //   拿手點高度版（setContactPoint）去算會是另一個座標系，複驗就不可比了。
        const recvCp = ai.contactPoint ?? ai.landing;
        if (a && recvCp) cur.openDist = Math.hypot(recvCp.x - a.x, recvCp.z - a.z);
        rows.push(cur);
      }
      // 現行空間判準首次成立的那一 tick：記下當時的剩餘 tick
      // ⇒ 這就是「現制的近段起點」在時間座標上的位置，給 Sawmah 當換算對照
      if (cur && cur.nearEta == null && a) {
        const recvCp = ai.contactPoint ?? ai.landing;
        if (recvCp) {
          const d = Math.hypot(recvCp.x - a.x, recvCp.z - a.z);
          if (d <= SET_READY_M) cur.nearEta = ai.setContactPoint?.ticks ?? null;
        }
      }
    } else if (cur) {
      cur.done = true;
      cur = null;
    }
    stepGame(g, intents);
  }
}

// ---- 統計 ----
const q = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const fmt = (v, d = 1) => (v == null ? '  n/a' : v.toFixed(d).padStart(5));
// 比例的標準誤（本專案累犯：40 局 SE≈7pp 造過假熔斷 ⇒ 任何拿分佈做門檻判定處先算 SE）
const sePct = (k, n) => (n ? 100 * Math.sqrt((k / n) * (1 - k / n) / n) : NaN);

const setterRows = rows.filter((r) => r.isSetter);
const withEta = setterRows.filter((r) => r.openEta != null);

console.log(`=== 卷五 查證 1／量測項 1：S 分配窗的時間長度（${SEEDS} 局）===\n`);
console.log(`S 被指派舉第二球的波數：${setterRows.length}`);
console.log(`其中 setContactPoint.ticks 取得到的：${withEta.length}`
  + `（${(100 * withEta.length / (setterRows.length || 1)).toFixed(1)}%）`);
console.log('  ↑ 取不到＝低平球，predictContactPoint 回退地板落點（predictLanding 也帶 ticks，'
  + '\n    回退時 ticks 仍有值；此處的 n/a 只會來自球全程未落地＝null）\n');

console.log('-- 開窗時的剩餘 tick（＝這一球的戰術窗有多長）按一傳品質分層 --');
console.log('tier        n     min   p10   p50   p90   max   平均');
for (const tier of ['perfect', 'ok', 'poor', null]) {
  const sub = withEta.filter((r) => r.tier === tier);
  if (!sub.length) continue;
  const v = sub.map((r) => r.openEta);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  console.log(`${String(tier ?? '(無)').padEnd(10)}${String(sub.length).padStart(4)}`
    + `  ${fmt(Math.min(...v), 0)} ${fmt(q(v, 0.1), 0)} ${fmt(q(v, 0.5), 0)}`
    + ` ${fmt(q(v, 0.9), 0)} ${fmt(Math.max(...v), 0)} ${fmt(mean)}`);
}
// 對照組：同一時刻、接球高度版（RECV_CONTACT_Y 1.35）的剩餘 tick。
// 兩者差＝「球從我手點高度墜到接球高度」的時間，用來確認兩個座標系差多少。
const recvEtas = setterRows.filter((r) => r.openRecvEta != null).map((r) => r.openRecvEta);
console.log(`\n（對照）接球高度版 contactPoint.ticks：p50 ${fmt(q(recvEtas, 0.5), 0)}`
  + `  min ${fmt(Math.min(...recvEtas), 0)}  max ${fmt(Math.max(...recvEtas), 0)}（n=${recvEtas.length}）`);

console.log('\n-- 現行空間判準（SET_READY_M = 3.2m）在時間座標上落在哪 --');
const openNear = withEta.filter((r) => r.openDist != null && r.openDist <= SET_READY_M);
const seOpenNear = sePct(openNear.length, withEta.length);
console.log(`一開窗就已在近段（開窗當下 dist ≤ 3.2m）：`
  + `${(100 * openNear.length / (withEta.length || 1)).toFixed(1)}% ± ${seOpenNear.toFixed(1)}pp`
  + `（n=${withEta.length}）`);
console.log('  ↑ 簡報 §二.4 引 setOptions.js:108-116 的宣稱是「約六成」——這一行是複驗');
const nearEtas = withEta.filter((r) => r.nearEta != null).map((r) => r.nearEta);
console.log(`近段起點的剩餘 tick：p10 ${fmt(q(nearEtas, 0.1), 0)}`
  + `  p50 ${fmt(q(nearEtas, 0.5), 0)}  p90 ${fmt(q(nearEtas, 0.9), 0)}（n=${nearEtas.length}）`);
console.log('  ↑ 現制下「玩家終於能下指令」時球還剩這麼多 tick。時間判準若取 p50 當門檻，'
  + '\n    近段的開始時機與現制大致等價——但**語意變了**（從「跑得到了」變成「想的時間夠了」），'
  + '\n    所以這只是對照基準，不是建議值。門檻＝策略體驗數值，交 Sawmah 拍（硬規則 3）。');

// ---- 新舊對照：入口搬家到底有沒有把遠段變出來 ----
// ★ 呼叫**真實的** setStageOf（不重抄一份判準邏輯，02 §6.1 條 4）★
const newPreview = withEta.filter((r) => setStageOf(r.openEta) === 'preview').length;
const oldPreview = withEta.filter((r) => r.openDist != null && r.openDist > SET_READY_M).length;
console.log('\n-- 入口搬家的直接效果：開窗當下判定為「遠段」（⚡改判 那排看得到）的比例 --');
console.log(`舊制（空間 ${SET_READY_M}m）：${(100 * oldPreview / withEta.length).toFixed(1)}%`
  + ` ± ${sePct(oldPreview, withEta.length).toFixed(1)}pp`);
console.log(`新制（時間 ${SET_READY_TICKS} tick）：${(100 * newPreview / withEta.length).toFixed(1)}%`
  + ` ± ${sePct(newPreview, withEta.length).toFixed(1)}pp`);
console.log(`  ↑ 裁定 1d 的「sim 層每球有窗」＝新制這一行要是 100.0%（n=${withEta.length}）`);

// 恆假掃描的素材：時間門檻 T 的兩側都要有合法樣本
console.log('\n-- 符號掃描素材：候選門檻兩側的樣本數 --');
console.log('⚠ 這張表量的是**開窗那一刻**，「窗長≤T 全是 0」不代表判準恆真：');
console.log('  setStageOf 是逐 tick 求值的，剩餘 tick 從 95 遞減到 0 必然跨過門檻一次');
console.log('  ⇒ 同一顆球先 preview 後 ready，兩個分支都會走到。這張表證明的是');
console.log('  「每一球都有遠段」（裁定 1d），不是「近段不存在」。');
console.log('門檻T   窗長>T（開窗即遠段）   窗長≤T（開窗即近段）');
for (const T of [20, 30, 40, 50, 60, 80]) {
  const gt = withEta.filter((r) => r.openEta > T).length;
  const le = withEta.length - gt;
  console.log(`${String(T).padStart(4)}    ${String(gt).padStart(6)}`
    + ` (${(100 * gt / withEta.length).toFixed(1)}%)      ${String(le).padStart(6)}`
    + ` (${(100 * le / withEta.length).toFixed(1)}%)`);
}
