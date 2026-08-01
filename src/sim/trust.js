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
  // 叫戰術重做卷 段 4／集訓卷 題 2（Sawmah 2026-08-01 跨卷共用裁定）：**組合獎金**。
  // 「獎勵跟角色走，不跟位置走」——得分者只拿既有的 KILL（不重複賺、反滾雪球紅線
  // 不觸），本波的**配合者（誘餌）**帶走了牆，組合獎金全額給他。
  // ★幅度 1＝Sawmah 2026-08-01 拍板★（策略數值，CLAUDE.md 硬規則 3）
  // 依據＝`docs/snapshots/combo-assist-baseline-2026-08-01.txt`（30 局、1408 rally）：
  // 發放頻率每 7.7 球一次（每局約 6.1 次）⇒ 幅度 1 每局約 +6.1，約 4 局（25 次）
  // 才頂到 CLAMP ±25。對照得分者 KILL=5：配合者單次拿得比得分者少一個量級，
  // 但因為跑得勤，一個賽段累積下來與「他真的把牆帶走了」相稱，且不會滾雪球。
  // 幅度 2（每局 +12.2、2 局頂到 CLAMP）已被裁掉——會把配合者推到信任天花板。
  COMBO_ASSIST: 1,
};

// trustDyn 的唯一寫入路徑（含 ±CLAMP 夾限）。所有場內動態調整都經過這裡——
// 誰要加第二條路，就是繞過夾限的那條路
function addTrustDyn(state, playerId, delta) {
  const next = (state.trustDyn[playerId] ?? 0) + delta;
  state.trustDyn[playerId] = Math.max(-TRUST_DYN.CLAMP, Math.min(TRUST_DYN.CLAMP, next));
}

// 攻擊定勝負的歸因（settlePoint 呼叫）：scored＝這記攻擊直接得分/失分。
// mul（W4 題5 OPP 要球「信任雙倍下注」）：升降幅同倍放大——沿乘係數、零新機制
export function applyAttackOutcome(state, playerId, scored, mul = 1) {
  const prev = state.trustStreak[playerId] ?? 0;
  const streak = scored ? Math.max(1, prev + 1) : Math.min(-1, prev - 1);
  state.trustStreak[playerId] = streak;
  const delta = (scored
    ? TRUST_DYN.KILL + (streak >= 2 ? TRUST_DYN.KILL_STREAK : 0)
    : TRUST_DYN.ERR + (streak <= -2 ? TRUST_DYN.ERR_STREAK : 0)) * mul;
  addTrustDyn(state, playerId, delta);
}

// 組合獎金（段 4）：本波配合者＝誘餌，他把牆帶走了，這一分有他一半。
// settlePoint 在既有的攻擊歸因段呼叫一次，`scored`＝與 KILL 同一個閘（該波得分）。
//
// 三個條件（缺一不發，對應裁定原文）：
//   ① 本波有組合 ⇒ `state.rally.comboAssist` 非空（ai.js 的 applyRouteCommit 才會寫）
//   ② 該波得分 ⇒ `scored`
//   ③ 配合者**實際起跳** ⇒ 同上，routeCommit 記到 `jumped` 才寫得出 comboAssist
//      （裁定 1B：不跑只是放棄資格，不扣 trust——本函式沒有任何負向分支）
//
// ★得分者不重複賺★ `pid === scorerId` 直接 return：他拿的還是既有那份 KILL，
// 不因為身兼組合的一角再加一次（理論上組合的主攻≠配合者，這行是防守性的）。
export function applyComboAssist(state, scorerId, scored) {
  if (!scored || !TRUST_DYN.COMBO_ASSIST) return;
  const a = state.rally?.comboAssist;
  if (!a || a.pid === scorerId) return;
  if (a.team !== state.rally.lastTouchTeam) return; // 跨隊殘帳（不該發生）不發
  addTrustDyn(state, a.pid, TRUST_DYN.COMBO_ASSIST);
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
