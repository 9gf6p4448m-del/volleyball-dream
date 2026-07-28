// 4.5B §4 — diegetic 介面的純函式層（零 DOM/three；node 可測）
// S「全場等你的一秒」：分配選項 → 場上隊友熱點（點隊友模型本身＝分配）
// L「暗號手勢」：攔防配套 → 背後手勢（一指＝封直線／二指＝封斜線／握拳＝收吊球）
// 真值資訊不落空：一傳品質標題、猶豫標註、B-6 標記文字全數保留（顯示哲學）。
import { CALL_BALL_AT } from '../input/setOptions.js';

// L 配套鍵 → 真實手勢字形（phase4-w4-status 附錄 B-5 原文的三種手勢）
export const L_SIGN_GLYPHS = {
  'block-line': '☝️',   // 一指＝封直線（・收斜線）
  'block-cross': '✌️',  // 二指＝封斜線（・收直線）
  'no-block': '✊',     // 握拳＝攔手讓開・收吊球
};

// S 分配熱點：每個選項錨在隊友（pid）模型上；二次球（dump）錨在自己身上。
// loud＝高 trust 喊聲者（同一 flight 只有最高者揮手喊球——與既有喊聲字卡同判準）
// 喊球者（單一事實源）：本波 trust 最高的**隊友**。
// **二次球（dump）恆排除**——那個選項的 pid 是舉球員自己、trust 寫死 100，
// 不排除就會恆居榜首：舉球員對自己喊「這球給我」還揮手（07-28 Sawmah 試玩抓到）。
// matchLoop 的喊聲字卡＋wave 姿勢與本檔熱點共用此函式，判定不得再分岔
export function loudCallerOf(setZones) {
  return (setZones ?? [])
    .filter((z) => z.kind !== 'dump' && z.trust >= CALL_BALL_AT)
    .sort((a, b) => b.trust - a.trust)[0] ?? null;
}

export function sHotspotItems(setZones) {
  if (!setZones?.length) return [];
  const loudPid = loudCallerOf(setZones)?.pid ?? null;
  return setZones.map((z) => ({
    key: z.key,
    pid: z.pid,
    kind: z.kind,
    label: z.kind === 'dump' ? '🎯二次球' : `${z.name}·${z.label.split('·')[1] ?? z.kind}`,
    hesitant: !!z.hesitant,
    loud: z.pid === loudPid && z.kind !== 'dump',
    zone: z, // 原選項物件透傳——onPick 走與舊面板完全同一條指令路徑
  }));
}

// L 手勢列：三配套 → 手勢鈕；suggested＝AI 建議（◎沿舊面板語意；1 秒自動照建議
// 的節奏資產在 matchLoop 原地不動）
export function lSignalItems(digRead) {
  if (!digRead?.choices?.length) return [];
  return digRead.choices.map((c) => ({
    key: c.key,
    glyph: L_SIGN_GLYPHS[c.key] ?? '🖐',
    label: c.label,
    suggested: c.key === digRead.suggestion,
    zone: c,
  }));
}

// 決策耗時統計（硬性驗收：diegetic 不得劣於現行面板；數據落結案快照）。
// 樣本＝「窗開啟→指令送出」毫秒；分位置、分介面模式累計。
export function createLatencyStats() {
  const samples = { S: [], L: [] };
  return {
    push(kind, ms) {
      if (samples[kind] && Number.isFinite(ms) && ms >= 0) samples[kind].push(ms);
    },
    summary() {
      const out = {};
      for (const [k, arr] of Object.entries(samples)) {
        if (!arr.length) { out[k] = null; continue; }
        const sorted = [...arr].sort((a, b) => a - b);
        out[k] = {
          n: arr.length,
          median: sorted[Math.floor(sorted.length / 2)],
          mean: Math.round(arr.reduce((s, v) => s + v, 0) / arr.length),
        };
      }
      return out;
    },
  };
}
