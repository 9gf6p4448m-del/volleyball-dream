// 攔網分工卷 step2b 的**耦合警報器**（step2c 追加，2026-07-31）
//
// ★ 為什麼要有這條 ★
// step2b 拆掉了 step1 那條「逐 tick 從 `plan.latest` 同步」的膠帶，讓兩名攔網手
// 各自步進 `seen`／`jumpTick`——「個別騙得到某一名攔網手」在結構上可表達，靠的就是這件事。
// 但**沒有任何測試守著它**：日後若有人把同步線變相加回去（例如「順手」讓
// `blockPlanFor` 每次取用時從 `plan.latest`／`template` 覆寫一次），
// 849 條測試會全綠，而個別性指標靜默歸零——step2b 的交付被打回去而沒有人知道。
// 這條就是那個警報器：兩名上牆者的 `jumpTick` **不再有機會相異**就轉紅。
//
// ★ 口徑（抄自 tools/block-individuation-probe.mjs 的 M1）★
//   上牆者 ＝ 該波 B 隊前排、在 `blockPlan.byPid` 有記錄、且 `cover !== true`
//            （`cover === true` ＝ step2a 的「第三人回落補吊球」，本來就不上牆）
//   一波   ＝ 一次死球結算，取本波最後一份計畫快照（計畫在死球時被清空，最後一份最完整）
//   分母   ＝ 兩名上牆者**都有** `jumpTick`（都真的跳了）的波數
//   分子   ＝ 兩人 `jumpTick` 不同的波數
//
// ★ 門檻依據 ★
// 同步線還在時這個比例**恆為 0**（兩人共用同一份 `jumpTick` ⇒ 結構上不可能相異），
// 所以門檻只需要「和 0 分得開」。實測現值：
//   探針口徑（tools/block-individuation-probe.mjs 40 局，走 career 真實建隊）＝ 1.8%／2.0%
//   本測試口徑（SETS=40，走 createGame 直接注入 commit 人格）＝ 1.57%（16/1022）
//   ⚠ **以上兩行是 2026-07-31 的歷史值，早已過期**——見下方「分母侵蝕」。
// 門檻取 0.5%：
//   ‧ 抓得到：同步線一加回來就是 0（結構上恆 0），離門檻整整 5 個事件
//   ‧ 分得開：門檻與 0 相距 1 SE 以上
//
// ★ 2026-08-03 分母侵蝕紀錄（對抗審查 CRITICAL-1 揭露）★
// 收斂殘留清算當天，我（實作者）宣稱「分母從 1022 掉到 792、是本批害的」，
// **那個歸因是錯的**：1022 從來不是清算前的實測值，是上面那行 07-31 的歷史註解，
// 中間隔了 23 個 commit。審查用 `git worktree` 在清算前的 HEAD 上實跑，真值是：
//   清算前（HEAD 74a9fff）SETS=40 ⇒ bothN **802**、相異率 9.48%
//   清算後（本批）        SETS=40 ⇒ bothN **778**、相異率 8.48%
// ⇒ 本批的實際貢獻只有 **−24 波**；1022 → 802 這 **220 波**的侵蝕是先前 23 個 commit
//   累積造成的，**至今沒有歸因**。
// ⇒ 真正該注意的是：**這個警報器在清算之前就只剩 802 vs 門檻 800 ＝ 2 波餘裕**，
//   早已站在失效邊緣。SETS 提到 50 只是把餘裕換成 161 波（997/800），
//   **並沒有回答「為什麼會侵蝕 22%」**——下次再侵蝕時，同樣會被誤記到當時那批改動頭上。
// ⇒ 待辦：追 1022→802 的侵蝕來源（23 個 commit 逐一二分）。
// 分母門檻維持 800（＝「這個量測位置分得出有無」的下界，02 §6.1 條 5）。
// 鑑別力已驗（step2c 交付）：把 step1 的同步線加回 `blockPlanFor`
//（每次取用時從 `plan.latest` 覆寫 CARRY 欄位）後，本測試轉紅在行為斷言、
// 相異率 0.00%（0/1022）——紅的原因是行為，不是型別錯誤或樣本不足。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { isFrontRow } from '../src/sim/rotation.js';

/** 跑 sets 局，回傳「兩名上牆者都跳了」的波數與其中 jumpTick 相異的波數。 */
function wallJumpIndividuation(sets) {
  let bothN = 0;
  let diffN = 0;
  for (let s = 1; s <= sets; s += 1) {
    const game = createGame({
      seed: s * 101, setTarget: 25, aiProfiles: { B: { blockPersona: 'commit' } },
    });
    const ai = createAiState();
    let snap = null;
    let guard = 0;
    // 一波結算：讀本波最後一份快照後清空
    const finish = () => {
      const cur = snap;
      snap = null;
      if (!cur) return;
      const wall = Object.keys(cur).filter((pid) => !cur[pid].cover).sort();
      if (wall.length < 2) return;
      const a = cur[wall[0]];
      const b = cur[wall[1]];
      if (a.jumpTick == null || b.jumpTick == null) return;
      bothN += 1;
      if (a.jumpTick !== b.jumpTick) diffN += 1;
    };
    while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
      guard += 1;
      const intents = aiCollectIntents(game, ai, []);
      const plan = ai.blockPlan && ai.blockPlan.team === 'B' ? ai.blockPlan : null;
      if (plan) {
        const rot = game.match.rotations.B;
        const out = {};
        for (const pid of rot) {
          if (!isFrontRow(rot, pid)) continue;
          const c = plan.byPid[pid];
          if (c) out[pid] = { jumpTick: c.jumpTick ?? null, cover: c.cover === true };
        }
        if (Object.keys(out).length) snap = out;
      }
      for (const e of stepGame(game, intents)) {
        if (e.type === 'DEAD_BALL') finish();
      }
    }
    finish();
  }
  return { bothN, diffN, pct: bothN ? (diffN / bothN) * 100 : NaN };
}

// 局數 40 ≈ 8.6s（實測），分母現值 1022 波。分母門檻要讓「歸零」與「現值」分得開
//（02 §6.1 條 5：樣本不足以在關心的位置上區分「有」與「沒有」時，數字本身沒有意義）
// ★ 2026-08-03 上調 40 → 50 ★ 直接原因是清算後 SETS=40 的分母（778）跌破 MIN_PAIRS(800)。
// **但真正的成因不是這批清算**——清算只貢獻 −24 波，先前 23 個 commit 已侵蝕掉 220 波
// （完整歸因見檔頭的「分母侵蝕紀錄」）。加樣本是止血，不是治本。
// 被守護的性質本身健康：清算後相異率 8.48%（SETS=40）／8.83%（SETS=50，997 波），
// 遠高於 0.5% 門檻 ⇒ **加樣本而非降 MIN_PAIRS**（降門檻等於自廢武功）。
const SETS = 50;
const MIN_PAIRS = 800;
const MIN_DIFF_PCT = 0.5;

test('step2b 耦合警報器：兩名上牆者的 jumpTick 必須仍有機會相異（同步線不得被加回來）', () => {
  const r = wallJumpIndividuation(SETS);
  assert.ok(r.bothN >= MIN_PAIRS,
    `樣本不足（兩名上牆者都起跳的波數 ${r.bothN} < ${MIN_PAIRS}）＝這個量測位置分不出有無`);
  assert.ok(r.pct >= MIN_DIFF_PCT,
    `兩名上牆者的 jumpTick 相異率 ${r.pct.toFixed(2)}%（${r.diffN}/${r.bothN}）< ${MIN_DIFF_PCT}%`
    + '＝攔網手又被綁回同一個起跳時鐘，step2b 的個別演進已失效（歸零＝同步線被加回來）');
});
