// 大作感二卷 批1（2026-08-30）：冠軍字卡——fixed 全幅 overlay（pointer-events:none，
// 點擊穿透給 matchLoop 的跳過通道），z-index 23 壓在賽場上、低於 setOverOverlay(24)。
// 動畫走 CSS keyframes（牆鐘驅動，與 sim/幀率無關），樣式一次性注入。
const STYLE_ID = 'vd-champion-banner-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
@keyframes vdChampIn {
  0% { opacity: 0; transform: translateY(26px) scale(0.92); }
  60% { opacity: 1; transform: translateY(-4px) scale(1.04); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes vdChampGlow {
  0%, 100% { text-shadow: 0 0 18px rgba(255, 209, 102, 0.55), 0 2px 10px rgba(0,0,0,0.6); }
  50% { text-shadow: 0 0 42px rgba(255, 209, 102, 0.95), 0 2px 10px rgba(0,0,0,0.6); }
}
.vd-champ-wrap { position: fixed; inset: 0; z-index: 23; display: flex; flex-direction: column;
  align-items: center; justify-content: center; pointer-events: none; text-align: center;
  font-family: system-ui, sans-serif; }
.vd-champ-cup { font-size: clamp(56px, 14vw, 110px); animation: vdChampIn 0.9s ease-out both; }
.vd-champ-title { color: #ffd166; font-weight: 900; letter-spacing: 0.12em;
  font-size: clamp(30px, 8vw, 64px); animation: vdChampIn 0.9s 0.25s ease-out both,
  vdChampGlow 2.2s 1.2s ease-in-out infinite; }
.vd-champ-sub { color: #eef2fa; opacity: 0.85; letter-spacing: 0.5em; text-indent: 0.5em;
  font-size: clamp(12px, 3vw, 18px); margin-top: 10px; animation: vdChampIn 0.9s 0.5s ease-out both; }
.vd-champ-hint { position: absolute; bottom: 6vh; left: 0; right: 0; color: #eef2fa;
  opacity: 0; font-size: 14px; animation: vdChampIn 0.6s 2.2s ease-out forwards; }
`;
  document.head.appendChild(st);
}

export function showChampionBanner(title) {
  ensureStyle();
  const el = document.createElement('div');
  el.className = 'vd-champ-wrap';
  el.innerHTML = `
    <div class="vd-champ-cup">🏆</div>
    <div class="vd-champ-title">${title}</div>
    <div class="vd-champ-sub">CHAMPIONS</div>
    <div class="vd-champ-hint">點擊任意處繼續</div>`;
  document.body.appendChild(el);
  return { el, dispose() { el.remove(); } };
}
