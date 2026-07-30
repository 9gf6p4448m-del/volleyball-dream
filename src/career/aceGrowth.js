// 試玩回饋 0730 §五 N2 — 宿敵成長（純函式，零 three.js/DOM，node 可測）
// 拍板：黑松/青嵐 ace 降為 1 年級後（§四 D1），跨屆走成長期身高與能力曲線——
// 「成長期身高」這個獨家新創從主角擴到宿敵；情蒐顯示端讀當屆值而非建檔常數。
//
// 身高：**沿用主角那一套** heightGrowth.buildHeightPlan（反比幅度帶＋第 1→2 屆偏多），
//   不另造第二套曲線機制。種子＝ace 全名雜湊——對手是純參數檔資產（不隨玩家存檔變），
//   同一個宿敵在任何存檔都長同一條曲線，情蒐畫面與 sim 建隊讀到的必是同一個值。
//   幅度帶天然分化：簡子嵐 179cm 走 mid 帶（3–8cm）、曾家松 201cm 走 tall 帶（1–4cm）
//   ——高個子長得少，跟主角同一條規則。
// 能力：ACE_ATTR_CURVE（index＝屆−1）逐屆累積增幅，增量遞減（+4 → +2）——與隊友成長
//   ROSTER_GROWTH.RATE_BY_GRADE 的「低年級吸收快」同一條哲學。此處自帶小表而不 import
//   roster.js：career 層 roster↔recruitment 已有循環 import，本檔維持只依賴 heightGrowth
//   的葉節點。
// 第 1 屆恆為零成長（曲線首項＝建檔身高、增幅 0）＝sim 行為零漂移（sim-hash 基準不動）。
import { buildHeightPlan } from './heightGrowth.js';

// 全屬性累積增幅（index＝屆−1）
export const ACE_ATTR_CURVE = [0, 4, 6];

// FNV-1a（與 careerState.matchSeed／heightGrowth 同慣例；模組獨立不互相 import）
function hash32(str) {
  let h = 0x811c9dc5 >>> 0;
  for (const ch of String(str)) {
    h = (h ^ ch.codePointAt(0)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// 該隊 ace 是否吃成長系統（opponents.js ace.grows 旗標；自由人 ace 不支援＝防呆回 false）
export function aceGrows(def) {
  return !!def?.ace?.grows && Number.isInteger(def.ace.slot) && Array.isArray(def.heights);
}

// 該 ace 的三屆身高曲線（公分整數×3；非成長型＝null）
export function aceHeightPlanCm(def) {
  if (!aceGrows(def)) return null;
  const baseCm = Math.round((def.heights[def.ace.slot] ?? 1.86) * 100);
  return buildHeightPlan({ seed: hash32(def.ace.name), heightCm: baseCm });
}

// 第 seasonIndex 屆的當屆值（非成長型＝null）：
//   { slot, heightCm, heightM, attrBonus, fromCm, grewCm }
// fromCm/grewCm＝與上一屆的差（第 1 屆＝0，供情蒐「他又長高了」一行字）
export function aceGrowthAt(def, seasonIndex = 1) {
  const plan = aceHeightPlanCm(def);
  if (!plan) return null;
  const idx = Math.max(0, Math.min(plan.length - 1, (seasonIndex | 0) - 1));
  const fromCm = plan[Math.max(0, idx - 1)];
  const heightCm = plan[idx];
  return {
    slot: def.ace.slot,
    heightCm,
    heightM: heightCm / 100,
    attrBonus: ACE_ATTR_CURVE[Math.min(idx, ACE_ATTR_CURVE.length - 1)],
    fromCm,
    grewCm: heightCm - fromCm,
  };
}

// 掛上當屆值（applySeasonRoster 消費）：只加兩個可選欄位——aceHeight（公尺，
// 建隊與情蒐顯示讀它）／aceAttrBonus（全屬性增幅）。**刻意不改 def.heights**：
// heights 槽同時是對手板凳的身高來源（careerMatchSetup RESERVE_HEIGHT_SLOT），
// 改它會讓同角色的板凳球員跟著長高＝屬性表被動了。非成長型／第 1 屆＝原物件返回。
export function withAceGrowth(def, seasonIndex = 1) {
  if (seasonIndex <= 1) return def;
  const g = aceGrowthAt(def, seasonIndex);
  if (!g || (g.heightM === def.heights[g.slot] && g.attrBonus === 0)) return def;
  return { ...def, aceHeight: g.heightM, aceAttrBonus: g.attrBonus };
}
