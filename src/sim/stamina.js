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
  COST_SERVE_STAND: 0.001, // 站姿發球極低（飄浮同）
  COST_RALLY_TOUCH: 0.001, // 長 rally 每拍：場上全員小額（跑動/預備的持續張力）
  // A3 恢復（死球窗一次性；rally 中結構上無恢復點）
  RECOV_DEAD: 0.005,   // 場上球員死球間隙小回
  RECOV_BENCH: 0.025,  // 坐板凳快回（換人價值閉環）
  RECOV_TIMEOUT: 0.03, // B3 暫停全隊小回（stage 2 接線）
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
