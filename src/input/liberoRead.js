// Phase 4 W3 — L 防守指揮（附錄 A1/A2/A3②；純函式，讀 game/aiState 不寫回）
// 決策點＝對手舉球出手瞬間：選後排收縮方向（守直線/守斜線/守吊球）——整個後排陣型
// 跟著移動（ai.digTargetFor 吃指令）。讀對且球飛向玩家＝Perfect 接球窗主動觸發。
// 「讀對」判定＝sim 既有攻擊分類 rally.lastSpikeZone（classifySpikeZone：line/cross/
// middle/tip）與指令嚴格相等——middle（中路）＝三選項皆不中（實作裁量，進試玩清單）。
// AI 建議（A2 預設快選）＝現行防守 AI 判斷語意：對手選定攻擊手的習慣標記優先、
// 無標記＝守斜線（斜線是高中攻擊統計常態）。
// 習慣標記（A3②）＝sim 決定論事件流統計（state.scoutTally 逐攻擊手 zones）——
// 非隨機、非全知（統計的是場上真實發生過的攻擊）。
export const DIG_CHOICES = [
  { key: 'line', label: '守直線' },
  { key: 'cross', label: '守斜線' },
  { key: 'tip', label: '守吊球' },
];
const CHOICE_LABELS = { line: '偏直線', cross: '偏斜線', tip: '愛吊球' };

// 標記門檻（初擬值，治具驗邊界＋試玩清單）：樣本 ≥3 且單線佔比 ≥0.5
export const MARK_MIN_SPIKES = 3;
export const MARK_SHARE = 0.5;

// 習慣標記：某攻擊手的線路偏向（'line'|'cross'|'tip'|null）——決定論讀 scoutTally
export function spikeBiasOf(game, pid) {
  const tal = game.scoutTally?.[pid];
  if (!tal || (tal.spikes ?? 0) < MARK_MIN_SPIKES) return null;
  for (const k of ['line', 'cross', 'tip']) {
    if ((tal.zones?.[k] ?? 0) / tal.spikes >= MARK_SHARE) return k;
  }
  return null;
}

// AI 建議（面板預設高亮＋1 秒自動照建議）：對手選定攻擊手的標記優先、無標記＝cross
export function digSuggestionFor(game, aiState) {
  const atk = aiState?.claimId;
  return (atk ? spikeBiasOf(game, atk) : null) ?? 'cross';
}

// 面板資料：選項＋建議＋線索文字（回場面板顯示習慣標記——A3② 縮時偵察的產出）
export function digReadFor(game, aiState) {
  const suggestion = digSuggestionFor(game, aiState);
  const atk = aiState?.claimId ? game.players[aiState.claimId] : null;
  const mark = atk ? spikeBiasOf(game, atk) : null;
  return {
    choices: DIG_CHOICES,
    suggestion,
    markText: atk && mark ? `📋 ${atk.name}：${CHOICE_LABELS[mark]}` : null,
  };
}

// 讀對判定（Perfect 窗觸發條件之一）：指令 vs 實際攻擊分類嚴格相等
export function digReadCorrect(game, aiState) {
  const bias = aiState?.digBias;
  if (!bias) return false;
  const r = game.rally;
  return r.profile === 'spike' && r.lastSpikeZone != null && r.lastSpikeZone === bias.choice;
}
