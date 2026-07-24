// 信任參數模組（Phase 2 stage 4 上線：場內動態＋trust 地板）
// trust 存於 D1 資料層 Player.trust.fromSetter（持久 baseline），本模組負責：
// ①trust→分配權重的映射 ②決定論抽選 ③updateTrust（持久調整——劇情事件用）
// ④場內動態層（state.trustDyn：連續得分＋/連續失誤−，場末即散、不動 Player）
// ⑤trust 地板（Player.trust.floorShare 資料帶入——玩家保底球權，sim 不認人）

// trust 值 → 正規化權重。entries: [{ pid, trust, rowFactor }]
// rowFactor：站位折減（後排攻擊點 0.5）——trust 決定傾向、站位決定資格與折減
export function trustToWeights(entries) {
  const raw = entries.map((e) => Math.max(0, e.trust) * (e.rowFactor ?? 1));
  const sum = raw.reduce((s, v) => s + v, 0);
  if (sum <= 0) return entries.map(() => 1 / entries.length);
  return raw.map((v) => v / sum);
}

// 依權重抽選：roll ∈ [0,1)（呼叫端以決定論 hash 產生）
export function pickByWeights(entries, weights, roll) {
  let acc = 0;
  for (let i = 0; i < entries.length; i += 1) {
    acc += weights[i];
    if (roll < acc) return entries[i];
  }
  return entries[entries.length - 1];
}

// 持久 baseline 調整（stage 4 起由劇情事件層呼叫；場內動態走 trustDyn 不經此路）
export function updateTrust(player, delta) {
  const t = player.trust.fromSetter + delta;
  player.trust.fromSetter = Math.max(0, Math.min(100, t));
  return player.trust.fromSetter;
}

// ---- stage 4 場內動態信任（存於 game state；決定論、VCR 快照自然涵蓋）----

export const TRUST_DYN = {
  KILL: 5,        // 攻擊得分 +
  KILL_STREAK: 3, // 連續（第 2 記起）加碼
  ERR: -6,        // 攻擊失誤（出界）−
  ERR_STREAK: -4, // 連續失誤加碼
  CLAMP: 25,      // 動態偏移上限 ±（baseline 另有 0–100 夾限）
  OLD_TEAM_BOOST: 8, // W7 D2 舊隊情結：對戰原隊開場 trustDyn +8（憋著一股勁；場末即散）
};

// 攻擊定勝負的歸因（settlePoint 呼叫）：scored＝這記攻擊直接得分/失分
export function applyAttackOutcome(state, playerId, scored) {
  const prev = state.trustStreak[playerId] ?? 0;
  const streak = scored ? Math.max(1, prev + 1) : Math.min(-1, prev - 1);
  state.trustStreak[playerId] = streak;
  const delta = scored
    ? TRUST_DYN.KILL + (streak >= 2 ? TRUST_DYN.KILL_STREAK : 0)
    : TRUST_DYN.ERR + (streak <= -2 ? TRUST_DYN.ERR_STREAK : 0);
  const next = (state.trustDyn[playerId] ?? 0) + delta;
  state.trustDyn[playerId] = Math.max(-TRUST_DYN.CLAMP, Math.min(TRUST_DYN.CLAMP, next));
}

// 分配當下的有效 trust＝baseline＋場內動態（夾限 0–100）
export function effectiveTrust(state, player) {
  const dyn = state.trustDyn?.[player.id] ?? 0;
  return Math.max(0, Math.min(100, player.trust.fromSetter + dyn));
}

// trust 地板（決策第 3 題：玩家保底 25–30% 球權、不得淪為觀眾）。
// entries[i].floorShare 來自 Player.trust.floorShare；把該員權重墊到地板、其餘等比縮
export function applyFloorShare(entries, weights) {
  const i = entries.findIndex((e) => (e.floorShare ?? 0) > 0);
  if (i < 0) return weights;
  const floor = Math.min(0.9, entries[i].floorShare);
  if (weights[i] >= floor) return weights;
  const others = 1 - weights[i];
  const scale = others > 0 ? (1 - floor) / others : 0;
  return weights.map((w, j) => (j === i ? floor : w * scale));
}
