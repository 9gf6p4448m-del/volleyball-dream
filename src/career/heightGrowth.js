// Phase 4 W2 — 身高成長曲線（純函式，零 three.js/DOM，node 可測）
// 憲法依據：Q6（身高創角＋三年成長曲線＋種子決定論）。
// 拍板（W2 工單 B1/B2）：
//   反比幅度帶（帶內種子決定論、不看志願不偏心）：
//     創角 ≤165cm＝三年總成長 5–12cm；165–185（不含端點）＝3–8cm；≥185＝1–4cm
//   第 1→2 屆分配偏多（青春期曲線）；下限保底＝屆屆至少第一次成長 ≥1cm。
//   整條三年曲線於創角瞬間預生成（career.seed 衍生子種子）存隱藏欄位
//   height.plan（公分整數×3，index＝屆-1）；advanceSeason 只揭曉並 push timeline。
// 單位約定：sim 全域身高單位＝公尺（player.height.current 既有語意），
//   timeline 條目 {season, height} 亦存公尺（公分精度）；plan 存公分整數、UI 顯示公分。

export const HEIGHT_MIN_CM = 140;
export const HEIGHT_MAX_CM = 220;
export const DEFAULT_HEIGHT_CM = 188; // 未走創角流程（測試/舊路徑）沿用 Phase 1 基準

// UI 輸入夾限（憲法 W2 驗收條：超界軟提示後 clamp、不 crash）
export function clampHeightCm(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return { cm: DEFAULT_HEIGHT_CM, clamped: true };
  if (n < HEIGHT_MIN_CM) return { cm: HEIGHT_MIN_CM, clamped: true };
  if (n > HEIGHT_MAX_CM) return { cm: HEIGHT_MAX_CM, clamped: true };
  return { cm: n, clamped: false };
}

// 反比幅度帶（B1 拍板原文：≤165／165–185／≥185；中段為開區間）
export function growthBandOf(cm) {
  if (cm <= 165) return { key: 'short', total: [5, 12] };
  if (cm < 185) return { key: 'mid', total: [3, 8] };
  return { key: 'tall', total: [1, 4] };
}

// FNV-1a（與 careerState.matchSeed／graduation.hash32 同慣例；模組獨立不互相 import）
function hash32(seed, str) {
  let h = ((seed >>> 0) ^ 0x811c9dc5) >>> 0;
  for (const ch of String(str)) {
    h = (h ^ ch.codePointAt(0)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// 三年身高曲線預生成：回傳 [第1屆cm, 第2屆cm, 第3屆cm]（公分整數）。
// 決定論：同 seed＋同起點身高 → 同曲線（帶內取值＋分屆拆分皆由子種子導出）。
// 第 1→2 屆偏多（~60%）；第一次成長保底 ≥1cm（屆屆儀式有戲）；
// 第二次可為 0（僅 ≥185 帶 total=1 時）——「不再長高」也是誠實敘事，儀式走定格變體。
export function buildHeightPlan({ seed, heightCm }) {
  const { cm } = clampHeightCm(heightCm);
  const band = growthBandOf(cm);
  const [lo, hi] = band.total;
  const total = lo + (hash32(seed ?? 1, `height-curve:${cm}`) % (hi - lo + 1));
  const first = Math.min(total, Math.max(1, Math.round(total * 0.6)));
  return [cm, cm + first, cm + total];
}

// 建 timeline 初始（創角瞬間）：單一事實源在 timeline，current＝末項快取
export function initialHeightState({ seed, heightCm }) {
  const plan = buildHeightPlan({ seed, heightCm });
  return {
    current: plan[0] / 100,
    timeline: [{ season: 1, height: plan[0] / 100 }],
    plan, // 隱藏欄位：整條曲線（advanceSeason 逐屆揭曉；UI 不得提前偷看）
  };
}

// 賽季推進揭曉（純函式；careerStore.advanceSeason RMW 消費）。
// 冪等：該屆已揭曉／無 plan（舊檔容錯）／seasonIndex 超界 → 原樣返回、reveal:null。
export function revealHeightForSeason(player, seasonIndex) {
  const h = player?.height;
  const plan = h?.plan;
  if (!Array.isArray(plan) || seasonIndex < 2 || seasonIndex > plan.length) {
    return { player, reveal: null };
  }
  const cm = plan[seasonIndex - 1];
  if (typeof cm !== 'number') return { player, reveal: null };
  const timeline = Array.isArray(h.timeline) ? h.timeline : [];
  if (timeline.some((t) => t.season === seasonIndex)) return { player, reveal: null };
  const last = timeline[timeline.length - 1];
  const fromCm = Math.round((last?.height ?? h.current) * 100);
  return {
    player: {
      ...player,
      height: {
        ...h,
        current: cm / 100,
        timeline: [...timeline, { season: seasonIndex, height: cm / 100 }],
      },
    },
    reveal: { season: seasonIndex, fromCm, toCm: cm, grewCm: cm - fromCm },
  };
}
