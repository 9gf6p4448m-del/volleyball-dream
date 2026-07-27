// Phase 4 W3 — L 防守指揮（附錄 A1/A2/A3②；純函式，讀 game/aiState 不寫回）
// 決策點＝對手舉球出手瞬間：選後排收縮方向（守直線/守斜線/守吊球）——整個後排陣型
// 跟著移動（ai.digTargetFor 吃指令）。讀對且球飛向玩家＝Perfect 接球窗主動觸發。
// 「讀對」判定＝sim 既有攻擊分類 rally.lastSpikeZone（classifySpikeZone：line/cross/
// middle/tip）與指令嚴格相等——middle（中路）＝三選項皆不中（實作裁量，進試玩清單）。
// AI 建議（A2 預設快選）＝現行防守 AI 判斷語意：對手選定攻擊手的習慣標記優先、
// 無標記＝守斜線（斜線是高中攻擊統計常態）。
// 習慣標記（A3②）＝sim 決定論事件流統計（state.scoutTally 逐攻擊手 zones）——
// 非隨機、非全知（統計的是場上真實發生過的攻擊）。
// W4(P4) 附錄 B-1 — L 2.0 攔防對位：三選項升級為攔防配套（合併配套，4-1 拍板 A）。
// 一個指令同時驅動：前排攔網手站線（block；ai.js 攔網分支消費）＋後排收縮方向
// （dig＝現行 digTargetFor 鏈——digBias.choice 語意不變＝Perfect 窗/讀對判定零改動）。
// 「攔手讓開」配套無封線層＝語意自洽（賭吊球），不另補償（B-2 拍板）
export const DIG_SCHEMES = [
  { key: 'block-line', block: 'line', dig: 'cross', label: '封直線・收斜線' },
  { key: 'block-cross', block: 'cross', dig: 'line', label: '封斜線・收直線' },
  { key: 'no-block', block: 'off', dig: 'tip', label: '攔手讓開・收吊球' },
];
export const schemeByKey = (key) => DIG_SCHEMES.find((s) => s.key === key) ?? null;
// A2 節奏資產相容（三選項面板同型）；治具 omni 臂反查：收縮真值 → 配套
export const schemeForDig = (dig) => DIG_SCHEMES.find((s) => s.dig === dig) ?? null;
const CHOICE_LABELS = { line: '偏直線', cross: '偏斜線', tip: '愛吊球' };

// 標記門檻（初擬值，治具驗邊界＋試玩清單）：樣本 ≥3 且單線佔比 ≥0.5。
// B-6 軟標記（◎建議品質吃標記比重——拉大改判空間首選手段）：樣本 ≥2 且佔比 ≥0.4
// ＝弱統計也讓建議「有據」，解「無標記恆守斜線」的失位倒掛（治具重測如實輸出）
export const MARK_MIN_SPIKES = 3;
export const MARK_SHARE = 0.5;
export const SOFT_MARK_MIN = 2;
export const SOFT_MARK_SHARE = 0.4;

// 習慣標記：某攻擊手的線路偏向（'line'|'cross'|'tip'|null）——決定論讀 scoutTally
export function spikeBiasOf(game, pid, { soft = false } = {}) {
  const tal = game.scoutTally?.[pid];
  const minN = soft ? SOFT_MARK_MIN : MARK_MIN_SPIKES;
  const share = soft ? SOFT_MARK_SHARE : MARK_SHARE;
  if (!tal || (tal.spikes ?? 0) < minN) return null;
  for (const k of ['line', 'cross', 'tip']) {
    if ((tal.zones?.[k] ?? 0) / tal.spikes >= share) return k;
  }
  return null;
}

// 配套建議（面板預設高亮＋1 秒自動照建議）：標記線→封他慣用線的配套
// （攔網賭慣用線、後排守變線＝兩層讀對的真實體系）；愛吊球→讓開收吊球；
// B-6：硬標記＞軟標記＞無標記預設封斜線（斜線是高中攻擊統計常態）
export function digSuggestionFor(game, aiState) {
  const atk = aiState?.claimId;
  const mark = atk
    ? (spikeBiasOf(game, atk) ?? spikeBiasOf(game, atk, { soft: true }))
    : null;
  if (mark === 'line') return 'block-line';
  if (mark === 'cross') return 'block-cross';
  if (mark === 'tip') return 'no-block';
  return 'block-cross';
}

// 面板資料：配套選項＋建議＋線索文字（回場面板顯示習慣標記——A3② 縮時偵察的產出）
export function digReadFor(game, aiState) {
  const suggestion = digSuggestionFor(game, aiState);
  const atk = aiState?.claimId ? game.players[aiState.claimId] : null;
  const mark = atk ? spikeBiasOf(game, atk) : null;
  return {
    choices: DIG_SCHEMES,
    suggestion,
    markText: atk && mark ? `📋 ${atk.name}：${CHOICE_LABELS[mark]}` : null,
  };
}

// ---- W4(P4) 附錄 B-4 — ace 反讀（宿敵 ace 專屬；scoutTally 架構鏡像）----
// 玩家連續同配套達門檻（n≥3 且佔比≥0.5 同款決定論統計）→ ace 改打「讓開的線」：
// 封線配套覆蓋 封線＋收縮線 → 讓開＝吊球；讓開配套全收吊球 → 讓開＝強攻線（斜線常態）。
// 零隨機、狀態誠實呈現（字卡揭曉）；混配套＝玩家的反制技術（佔比跌破門檻即失效）

export function noteScheme(tally, schemeKey) {
  return {
    total: (tally?.total ?? 0) + 1,
    counts: { ...(tally?.counts ?? {}), [schemeKey]: (tally?.counts?.[schemeKey] ?? 0) + 1 },
  };
}

// 反讀判定：達門檻＝回傳 { scheme, openLine }；未達＝null
export function counterReadOf(tally) {
  if (!tally || (tally.total ?? 0) < MARK_MIN_SPIKES) return null;
  for (const [key, n] of Object.entries(tally.counts ?? {})) {
    if (n / tally.total >= MARK_SHARE) {
      return { scheme: key, openLine: key === 'no-block' ? 'cross' : 'tip' };
    }
  }
  return null;
}

// 讀對判定（Perfect 窗觸發條件之一）：指令 vs 實際攻擊分類嚴格相等
export function digReadCorrect(game, aiState) {
  const bias = aiState?.digBias;
  if (!bias) return false;
  const r = game.rally;
  return r.profile === 'spike' && r.lastSpikeZone != null && r.lastSpikeZone === bias.choice;
}
