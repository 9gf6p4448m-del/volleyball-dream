// 大作感四卷 批2（J5）：播報員開場白——lineupIntro 窗插一句決定論句池抽選字幕，
// 含對手名/戰績變數。決定論抽選沿 interviewCard.js 慣例（種子 hash，非 Math.random，
// 同一場重看同一句）；顯示複用入場運鏡既有的牆鐘節奏（掛在 oppLine 段，見 matchLoop）。

// 句池：{opp}＝對手隊名、{wins}/{losses}＝出戰前戰績（career.results 累計，careerRecord()）。
// 佔位符字面代入——純函式測試蓋「同 seed 同句、變數正確代入」（J5①）。
const LINES = [
  '各位觀眾，今晚由主場迎戰 {opp}——目前戰績 {wins} 勝 {losses} 敗，這一場，繼續往前。',
  '{opp} 今天踏進這座球館。我們的隊伍戰績 {wins} 勝 {losses} 敗，準備好了。',
  '球迷朋友，今晚的對手是 {opp}。{wins} 勝 {losses} 敗的成績單，接下來要再添一筆。',
  '入場——今晚對上 {opp}。{wins} 勝 {losses} 敗，這支隊伍還在往上爬。',
];

/**
 * 純函式：seedish（決定論輸入，如 matchSeed(career, matchEntry.id)）＋ vars（{opp,wins,losses}）
 * → 代入後的完整句子。同 seedish 恆回同一句（存檔重進/重播同一場也一樣）。
 */
export function pickAnnouncerLine(seedish, vars = {}) {
  const i = Math.abs(((seedish | 0) * 2654435761) % 2147483647) % LINES.length;
  const tpl = LINES[i];
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

const STYLE_ID = 'vd-announcer-caption-style';
function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
.vd-announcer-cap { position: fixed; top: 8vh; left: 50%; transform: translateX(-50%);
  z-index: 22; pointer-events: none; max-width: min(560px, 92vw); text-align: center;
  padding: 8px 20px; border-radius: 8px; background: rgba(10,12,18,0.72);
  color: var(--vd-text, #f0e2b6); font-size: clamp(13px, 3.4vw, 16px); font-weight: 600;
  font-family: var(--vd-font-zh, system-ui, sans-serif); opacity: 0; transition: opacity 0.3s ease; }
.vd-announcer-cap.on { opacity: 1; }
`;
  document.head.appendChild(st);
}

// 輕量字幕（限 lineupIntro 窗顯示，J5②）——沿 introNameplate.js 的 show/hide/dispose 骨架
export function createAnnouncerCaption() {
  ensureStyle();
  const el = document.createElement('div');
  el.className = 'vd-announcer-cap';
  document.body.appendChild(el);
  return {
    show(text) { el.textContent = text; el.classList.add('on'); },
    hide() { el.classList.remove('on'); },
    dispose() { el.remove(); },
  };
}
