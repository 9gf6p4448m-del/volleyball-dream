// 大作感二卷 批3（2026-08-30）：入場運鏡的轉播式名牌（lower-third）——黑金斜切
// 風格對齊比賽 HUD（大作感卷批4 A 案）。內容用 textContent（名字是資料不是標記）。
const STYLE_ID = 'vd-intro-nameplate-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
.vd-intro-plate { position: fixed; left: 6vw; bottom: 11vh; z-index: 22; pointer-events: none;
  transform: skewX(-8deg); background: linear-gradient(100deg, rgba(10, 12, 18, 0.92) 0%, rgba(24, 28, 40, 0.85) 78%, rgba(24, 28, 40, 0) 100%);
  border-left: 4px solid #ffd166; padding: 10px 46px 10px 18px;
  font-family: system-ui, sans-serif; color: #eef2fa;
  opacity: 0; transition: opacity 0.28s ease, transform 0.28s ease; }
.vd-intro-plate.on { opacity: 1; transform: skewX(-8deg) translateX(0); }
.vd-intro-plate:not(.on) { transform: skewX(-8deg) translateX(-14px); }
.vd-intro-plate .t { display: block; transform: skewX(8deg); font-size: clamp(18px, 5vw, 26px);
  font-weight: 800; letter-spacing: 0.06em; }
.vd-intro-plate .s { display: block; transform: skewX(8deg); font-size: clamp(11px, 3vw, 14px);
  color: #ffd166; opacity: 0.9; letter-spacing: 0.14em; margin-top: 2px; }
`;
  document.head.appendChild(st);
}

export function createIntroNameplate() {
  ensureStyle();
  const el = document.createElement('div');
  el.className = 'vd-intro-plate';
  const t = document.createElement('span');
  t.className = 't';
  const sub = document.createElement('span');
  sub.className = 's';
  el.append(t, sub);
  document.body.appendChild(el);
  return {
    show(title, subtitle) {
      t.textContent = title;
      sub.textContent = subtitle ?? '';
      el.classList.add('on');
    },
    hide() { el.classList.remove('on'); },
    dispose() { el.remove(); },
  };
}
