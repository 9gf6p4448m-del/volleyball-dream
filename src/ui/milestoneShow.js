// 大作感四卷 批2（J1）：生涯里程碑「當下」全螢幕演出卡——王朝/老兵之年/最後衝刺
// 三種 proMilestones.js 判定的賽前事件，在事件觸發那一刻（careerScreen.fireEvents
// 管道，記帳/結算已完成之後）先補播一張全螢幕儀式卡，再接原有敘事對話卡（不改動、
// 不阻塞既有流程——演出是加上去的，J1④）。
// 沿 championBanner.js／mvpCard.js 骨架：fixed 全幅卡、theme.js tokens（不寫死 hex）。
// 與 matchLoop 那批全螢幕卡（pointer-events:none + 外部跳過通道）不同，這裡沒有
// matchLoop 式的全域 pointerdown 跳過通道可掛，卡片自己接手點擊（沿 careerScreen
// 既有 showTutorialInvite 等 overlay 的自處理慣例）。

import {
  MILESTONE_VETERAN_EV, MILESTONE_DYNASTY_EV, MILESTONE_FINAL_PUSH_EV,
} from '../career/proMilestones.js';

// 三種里程碑各自的全螢幕卡內容（★文案屬提案★，語氣同 proMilestones.js 既有敘事卡）。
// 純函式：event id → 內容 或 null——「該不該演」的判定核心（J1① 純函式測試蓋此）。
// 不認得的 id（其他賽前事件，如宿敵線/王勝翔線）一律回 null＝不演，互不誤觸發。
const CONTENT = {
  [MILESTONE_VETERAN_EV]: {
    icon: '🎖️', title: '老兵之年', sub: '新人眼中的老面孔——這份重量，你扛得起。',
  },
  [MILESTONE_DYNASTY_EV]: {
    icon: '👑', title: '王朝', sub: '這不是偶然，是你們自己打出來的。',
  },
  [MILESTONE_FINAL_PUSH_EV]: {
    icon: '🔥', title: '最後衝刺', sub: '該證明的還沒證明完，就沒有慢下來的理由。',
  },
};

/** 純函式：id → { icon, title, sub } 或 null（不認得的 id＝不演）。 */
export function milestoneShowContent(id) {
  return CONTENT[id] ?? null;
}

const STYLE_ID = 'vd-milestone-show-style';
function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
@keyframes vdMilestoneIn {
  0% { opacity: 0; transform: translateY(24px) scale(0.92); }
  60% { opacity: 1; transform: translateY(-4px) scale(1.03); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.vd-milestone-wrap { position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column;
  align-items: center; justify-content: center; text-align: center; cursor: pointer;
  background: rgba(4,6,12,0.6); font-family: var(--vd-font-zh, system-ui, sans-serif); }
.vd-milestone-icon { font-size: clamp(56px, 14vw, 100px); animation: vdMilestoneIn 0.8s ease-out both; }
.vd-milestone-title { color: var(--vd-gold, #d4af37); font-weight: 900; letter-spacing: 0.14em;
  font-size: clamp(30px, 8vw, 58px); animation: vdMilestoneIn 0.8s 0.2s ease-out both; margin-top: 6px; }
.vd-milestone-sub { color: var(--vd-text, #f0e2b6); opacity: 0.88; max-width: min(480px, 86vw);
  font-size: clamp(13px, 3.4vw, 17px); margin-top: 10px; line-height: 1.6;
  animation: vdMilestoneIn 0.8s 0.4s ease-out both; }
.vd-milestone-hint { position: absolute; bottom: 6vh; left: 0; right: 0; color: var(--vd-text-dim, #cbb886);
  opacity: 0; font-size: 13px; animation: vdMilestoneIn 0.6s 1.4s ease-out forwards; }
`;
  document.head.appendChild(st);
}

// data＝milestoneShowContent() 回傳；onDismiss＝點擊時呼叫一次（呼叫端另接 timeout
// 共用同一顆 dispose，殊途同歸見 careerScreen.playMilestoneShows）。
// 回傳 { el, dispose() }：dispose 冪等、只移除節點不觸發 onDismiss（timeout 路徑用）。
export function showMilestoneShow(data, onDismiss) {
  ensureStyle();
  const el = document.createElement('div');
  el.className = 'vd-milestone-wrap';
  el.innerHTML = `
    <div class="vd-milestone-icon">${data.icon}</div>
    <div class="vd-milestone-title">${data.title}</div>
    <div class="vd-milestone-sub">${data.sub}</div>
    <div class="vd-milestone-hint">點擊任意處繼續</div>`;
  let done = false;
  const dispose = () => {
    if (done) return;
    done = true;
    try { el.remove(); } catch { /* 已移除＝無事可做 */ }
  };
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation?.();
    if (done) return;
    dispose();
    onDismiss?.();
  });
  document.body.appendChild(el);
  return { el, dispose };
}
