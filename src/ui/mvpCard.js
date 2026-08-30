// 大作感三卷 批2：賽後 MVP 金字卡——黑金皮膚走 theme.js tokens（.vd-panel-gold／
// .vd-gold-text，批4 單一色源；不走 championBanner 寫死 hex 的舊路，K2-1）。
// pointer-events:none＝點擊穿透給 matchLoop 的跳過通道（與冠軍字卡同款）；
// z-index 23＝壓賽場、低於 setOverOverlay(24)。
import { roleLabel } from '../career/heightAdvice.js';

const STYLE_ID = 'vd-mvp-card-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
@keyframes vdMvpIn {
  0% { opacity: 0; transform: translateY(22px) scale(0.94); }
  60% { opacity: 1; transform: translateY(-3px) scale(1.02); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.vd-mvp-wrap { position: fixed; inset: 0; z-index: 23; display: flex; flex-direction: column;
  align-items: center; justify-content: center; pointer-events: none; text-align: center;
  font-family: var(--vd-font-zh, system-ui, sans-serif); }
.vd-mvp-card { padding: 26px clamp(28px, 8vw, 60px); animation: vdMvpIn 0.7s ease-out both; }
.vd-mvp-tag { color: var(--vd-gold); letter-spacing: 0.42em; text-indent: 0.42em;
  font-size: clamp(12px, 3vw, 16px); font-weight: 700; }
.vd-mvp-name { font-weight: 900; font-size: clamp(32px, 9vw, 60px); line-height: 1.25;
  animation: vdMvpIn 0.7s 0.15s ease-out both; }
.vd-mvp-role { color: var(--vd-text-dim); font-size: clamp(13px, 3.2vw, 16px); margin-top: 2px; }
.vd-mvp-stats { display: flex; gap: clamp(18px, 6vw, 40px); justify-content: center;
  margin-top: 16px; animation: vdMvpIn 0.7s 0.35s ease-out both; }
.vd-mvp-stat { display: flex; flex-direction: column; }
.vd-mvp-stat b { color: var(--vd-gold-light); font-size: clamp(24px, 6.5vw, 40px); }
.vd-mvp-stat span { color: var(--vd-text-dim); font-size: clamp(11px, 2.8vw, 14px); }
.vd-mvp-hint { position: absolute; bottom: 6vh; left: 0; right: 0; color: var(--vd-text, #eef2fa);
  opacity: 0; font-size: 14px; animation: vdMvpIn 0.6s 1.4s ease-out forwards; }
`;
  document.head.appendChild(st);
}

// data＝selectMvp 產物（pid/name/role/stats）；回傳 { el, dispose }（與冠軍字卡同約）
export function showMvpCard(data) {
  ensureStyle();
  const el = document.createElement('div');
  el.className = 'vd-mvp-wrap';
  const stats = [['得分', data.stats.points], ['扣球得分', data.stats.kills], ['攔網', data.stats.blocks]];
  el.innerHTML = `
    <div class="vd-mvp-card vd-panel-gold">
      <div class="vd-mvp-tag">🏅 MATCH MVP</div>
      <div class="vd-mvp-name vd-gold-text">${data.name}</div>
      <div class="vd-mvp-role">${roleLabel(data.role)}</div>
      <div class="vd-mvp-stats">${stats.map(([k, v]) => `<div class="vd-mvp-stat"><b>${v}</b><span>${k}</span></div>`).join('')}</div>
    </div>
    <div class="vd-mvp-hint">點擊任意處繼續</div>`;
  document.body.appendChild(el);
  return { el, dispose() { el.remove(); } };
}
