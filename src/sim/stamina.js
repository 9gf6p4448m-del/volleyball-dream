// W7 體力模組（A1-A5 拍板）：動作計費消耗、兩段門檻劣化、三檔恢復、
// stamina 屬性＝消耗抗性＋恢復率。全純算術零 rng——不碰 rand 流、決定論不變。
// 啟用走 createGame({ stamina })（存在才生效；未啟用＝state.stamina null＝零副作用）。
// 對手對稱性（A4）：per-team costMul（慢耗）＋ heavyExempt（豁免 25% 重度門檻）。
// 數值全為佔位——E1 治具重基準後調參（見 w7-implementation-prompt.md）。

export const STAMINA = {
  // A1 消耗（0..1 刻度；跳最貴）——量級目標：攻擊手一局 25 分打完落在
  // 45-55%（「該換了」的可讀瞬間存在、但第 1 屆無板凳不被輾壓）。
  // E1 重基準調參（07-24）：首版（SPIKE .02/BLOCK .014/RALLY .0012/DEAD .004）
  // 無管理臂奪冠 6%→2% 過擠、且第 1 屆結構上無板凳可管理→恢復升/消耗微降
  COST_SPIKE: 0.018,       // 扣球（起跳揮擊）
  COST_JUMP_BLOCK: 0.013,  // 跳攔（每次新窗＝一跳）
  COST_JUMP_SERVE: 0.015,  // 跳躍發球
  COST_DIVE: 0.017,        // 魚躍（撲空也扣——出手即倒地）
  COST_BUMP: 0.002,        // 站立墊球（近零）
  COST_SET: 0.0015,        // 舉球（近零）
  COST_SERVE_STAND: 0.001, // 站姿發球極低
  // ★ 2026-08-10 Sawmah 裁定「飄浮也要消耗體力、但比跳發少」★ 原本飄浮吃
  // COST_SERVE_STAND ＝ 0.001 ＝**白拿飄勁**：零失誤、零體力、ACE 還最高，
  // 理性玩家全程只發飄浮，另外兩式變成死選項。發飄浮要用硬手腕把球「推」出去
  // （無旋＝不能用甩的），比站發累、比整套助跑起跳的跳發輕。
  // 值＝站發與跳發的**正中點**（0.001 + (0.015−0.001)×50%＝0.008）——落在裁定給的
  // 40-60% 帶中央；取中點是為了不必為「該偏哪邊」再開一輪調參。
  COST_SERVE_FLOAT: 0.008, // 飄浮發球（站發 < 此 < 跳發）
  COST_RALLY_TOUCH: 0.001, // 長 rally 每拍：場上全員小額（跑動/預備的持續張力）
  // A3 恢復（死球窗一次性；rally 中結構上無恢復點）
  RECOV_DEAD: 0.005,   // 場上球員死球間隙小回
  RECOV_BENCH: 0.025,  // 坐板凳快回（換人價值閉環）
  RECOV_TIMEOUT: 0.03, // B3 暫停全隊小回（stage 2 接線）
  // W4(P4) Q8 局間恢復（換邊休息＝全隊一次性；跨局延續的緩衝）。初擬值——
  // 題7 拍板調參優先序第一位：體力治具輪以「決勝局開局帶明顯低於首局、
  // 高於裸延續」為校準目標調此值
  RECOV_SET_BREAK: 0.12,
  // A2 兩段門檻與效果（佔位）
  TIER1_BELOW: 0.5,
  TIER2_BELOW: 0.25,
  TIER1_MUL: 0.9,  // 力量/彈跳/速度乘數（<50%）
  TIER2_MUL: 0.8,  // <25%（heavyExempt 隊停在 TIER1_MUL）
  TIER2_RECV_PENALTY: 1.18, // <25% 接球品質懲罰（散佈乘數→餵既有爆接湧現路徑）
  // A5 stamina 屬性職能（50＝基準；不開放成長、個性差異由建隊值供給）
  ATTR_COST_SLOPE: 0.005,  // 每點 −0.5% 消耗
  ATTR_RECOV_SLOPE: 0.008, // 每點 +0.8% 恢復
  COST_MUL_MIN: 0.7,
  COST_MUL_MAX: 1.2,
};

// A5 消耗抗性：高 stamina 掉得慢
export function attrCostMul(player) {
  const mul = 1 - (player.attributes.stamina - 50) * STAMINA.ATTR_COST_SLOPE;
  return Math.max(STAMINA.COST_MUL_MIN, Math.min(STAMINA.COST_MUL_MAX, mul));
}

// A5 恢復率：高 stamina 回得快
export function attrRecovMul(player) {
  return Math.max(0.5, 1 + (player.attributes.stamina - 50) * STAMINA.ATTR_RECOV_SLOPE);
}

// 體力值→檔位（0＝正常、1＝<50%、2＝<25%）；heavyExempt（A4 對手豁免）封頂 1
export function tierOf(value, heavyExempt = false) {
  if (value < STAMINA.TIER2_BELOW) return heavyExempt ? 1 : 2;
  if (value < STAMINA.TIER1_BELOW) return 1;
  return 0;
}

// 效果檔位（含該隊 heavyExempt）；未啟用恆 0
export function staminaTier(state, player) {
  if (!state.stamina) return 0;
  const cfg = state.staminaCfg?.[player.teamId];
  return tierOf(state.stamina[player.id] ?? 1, cfg?.heavyExempt ?? false);
}

// A2 力量/彈跳/速度乘數
export function staminaPerfMul(state, player) {
  const t = staminaTier(state, player);
  return t === 2 ? STAMINA.TIER2_MUL : t === 1 ? STAMINA.TIER1_MUL : 1;
}

// A2 接球品質懲罰（只在重度檔；散佈乘數＝越大越飄）
export function staminaRecvMul(state, player) {
  return staminaTier(state, player) === 2 ? STAMINA.TIER2_RECV_PENALTY : 1;
}

// ★★ 2026-08-11 發球平衡：疲勞→發球準度（散佈乘數；越大越飄）★★
// 修的是一個**物理上說不通的不一致**：全套發球裡，體能消耗最大的跳發，反而是
// 唯一不受疲勞影響的那一式。實測（RUNS，bo5）：
//   飄浮 滿體力 35.0% → 剩<25% **26.8%**（掉 8pp）
//   跳發 滿體力 41.6% → 剩<25% **42.4%**（不降反升）
// 根因：跳發的兩個決定性參數都不讀體力——`applyServe` 的
// `apex = Math.max(POWER_SERVE_APEX 3.9, contactY + 0.35)`，而疲勞時
// `contactY+0.35` 最高只有 3.251 < 3.9 ⇒ **apex 恆等於 3.9**；散佈讀的是
// `attributes.serve`。⇒ 疲勞唯一碰得到的是擊球點 −4.4%，換不到任何勝率。
// ★為什麼是這個形狀★ 使用者裁定「跳發本來就該溢酬最高，要平衡的是形狀不是幅度」
// ⇒ 滿體力的三式數字**一格不動**（嚴格 no-op），只有掉檔之後跳發才開始不準
// ⇒ 小組賽（bo1，發 5 顆、場末體力 0.654＝T0）想跳就跳；決賽（bo5，發 22 顆、
//    場末 0.157＝T2 深處）撐不住整場跳發，後段得改飄浮或站發＝**變成要管理的資源**。
// ★權重不是體力成本★（第一版這樣寫，實測後改掉——理由值得留著）：
// 「這一式多吃體力」與「這一式累了會多不準」**不是同一件事**。飄浮是站著用硬手腕
// 把球推出去，手臂累了影響不大；跳發是整套助跑起跳，累了先垮的就是它。
// 真實排球裡累了改發飄浮，正是因為它**省力又發得出來**——用體力成本當權重會把
// 飄浮一起罰下去，反而讓「累了該換飄浮」在數字上不成立（實測：飄浮 T0→T2 掉 10.7pp
// 而跳發只掉 4.1pp ⇒ 溢酬在 T2 反而擴大到 +13.2pp，與設計意圖相反）。
// ⇒ 使用者裁定（08-11）：**反過來讓飄浮少受疲勞影響**，它才是後段的那一式。
// ⚠ **誠實標註：float/stand 這兩個值未被實測解析** ⚠ 把 float 從 0.53 砍到 0.15
// 之後，bo5 的 T2 該分勝率**一格沒動**（24.4%→24.4%，n≈200、SE 3pp ⇒ 三個版本
// 26.8/24.4/24.4 全落在 1 SE 內）。⇒ 飄浮在 T2 的弱**不是這個懲罰造成的**，它在
// 本機制上線前就存在。真正的成因未查明，而且**現有的切法查不出來**：分體力檔不是
// 隨機分派——T2 的樣本全部來自比賽後段（對手也累、比分情境也不同）。要追得用
// 「同體力值、有/無懲罰」的配對臂。這裡的 0.15 是**物理上的合理值**（站著推的球
// 累了影響小），不是量出來的；改它之前先把那個混淆解掉。
// 真正被實測支撐的只有 power=1：跳發 T2 由 42.4%（不降反升）→ 37.2%（n=360、SE 2.5pp）。
const SERVE_FATIGUE_WEIGHT = { power: 1, float: 0.15, stand: 0 };
export const SERVE_FATIGUE_SCATTER = { 1: 0.35, 2: 0.90 }; // 檔位→額外散佈比例

export function staminaServeScatterMul(state, player, style) {
  const t = staminaTier(state, player);
  if (!t) return 1;
  return 1 + (SERVE_FATIGUE_SCATTER[t] ?? 0) * (SERVE_FATIGUE_WEIGHT[style] ?? 0);
}

// 消耗（唯一扣血路徑）：team costMul（A4 慢耗）×attrCostMul（A5 抗性）。
// 首次向下跨檔發 STAMINA_LOW 觀測事件（tier 用原始檔位——豁免只作用在效果層，
// UI/播報要能看見對手也累）；恢復向上跨檔不發事件（UI 直接讀 state.stamina）
export function drainStamina(state, playerId, amount, ev) {
  if (!state.stamina) return;
  const p = state.players[playerId];
  const cfg = state.staminaCfg?.[p.teamId];
  if (!cfg) return;
  const before = state.stamina[playerId] ?? 1;
  const after = Math.max(0, before - amount * (cfg.costMul ?? 1) * attrCostMul(p));
  if (after === before) return;
  state.stamina[playerId] = after;
  const ta = tierOf(after);
  if (ta > tierOf(before) && ev) {
    ev.push({ type: 'STAMINA_LOW', tick: state.tick, team: p.teamId, playerId, tier: ta });
  }
}

// 恢復（死球/板凳/暫停共用）：×attrRecovMul（A5）；封頂 1
export function recoverStamina(state, playerId, amount) {
  if (!state.stamina) return;
  const p = state.players[playerId];
  const before = state.stamina[playerId] ?? 1;
  state.stamina[playerId] = Math.min(1, before + amount * attrRecovMul(p));
}
