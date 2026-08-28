// 大作感卷 批4：UI 皮膚視覺 tokens 單一事實來源——「冠軍黑金 × 動感構圖」
// 驗收凍結：docs/kickoffs/acceptance-juice-batch4-20260828.md（R6 品味題程序、Sawmah 2026-08-28 定案）
// 主選單＝方向 E 冠軍典藏（黑金置中對稱）；比賽 HUD＝方向 A 斜切動感 × E 黑金配色。
// 像素級參考稿：docs/kickoffs/juice-ui-refs/dir5-champion.html（選單）／ea-hybrid.html（HUD）。
//
// 本檔是所有新皮膚樣式的唯一色值/字體來源（A1 驗收條件）：其他檔案一律 import COLORS/FONTS
// 或吃 installTheme() 注入的 CSS 變數/class，不得在自己檔內重複寫死金色字面量。
//
// 離線／字體 CDN 擋掉一律 degrade 到系統 serif——不阻塞、不致死（風險揭露見凍結檔）。

export const COLORS = {
  bg: '#0b0906',
  bg2: '#14100a',
  gold: '#d4af37',
  goldLight: '#f4e3ae',
  goldDark: '#9a7b1e',
  text: '#f0e2b6',
  textDim: '#cbb886',
};

export const FONTS = {
  zh: "'Noto Serif TC',serif",
  latin: "'Cinzel',serif",
};

const STYLE_ID = 'vd-theme';
const FONT_LINK_ID = 'vd-theme-font';

// 金色的透明變體用 rgba 字面量算好塞進 CSS（不用 color-mix()——iOS Safari 16.2 以前不支援，
// 本遊戲以 iOS Safari 為主要目標，賭不起）。COLORS.gold 換算成 rgb 三元組。
const GOLD_RGB = '212,175,55';

// 供其他檔案取金色的半透明版本（邊框/光暈）——單一來源，不必各檔自己重算 rgb 三元組
export function goldAlpha(alpha) {
  return `rgba(${GOLD_RGB},${alpha})`;
}

function buildCss() {
  return `
:root{
  --vd-bg:${COLORS.bg}; --vd-bg2:${COLORS.bg2}; --vd-gold:${COLORS.gold};
  --vd-gold-light:${COLORS.goldLight}; --vd-gold-dark:${COLORS.goldDark};
  --vd-text:${COLORS.text}; --vd-text-dim:${COLORS.textDim};
  --vd-font-zh:${FONTS.zh}; --vd-font-latin:${FONTS.latin};
}
/* 黑底金框雙線面板（卡片/對話框通用） */
.vd-panel-gold{
  background:var(--vd-bg2); position:relative;
  border:1px solid rgba(${GOLD_RGB},0.55);
}
.vd-panel-gold::after{
  content:''; position:absolute; inset:5px; pointer-events:none;
  border:1px solid rgba(${GOLD_RGB},0.2);
}
/* 內縮雙線框裝飾層（貼在整頁容器上當外框，不佔版面、不吃點擊） */
.vd-frame{
  position:absolute; inset:14px; pointer-events:none;
  border:1px solid rgba(${GOLD_RGB},0.4);
}
.vd-frame::after{
  content:''; position:absolute; inset:5px;
  border:1px solid rgba(${GOLD_RGB},0.13);
}
/* 頂部金色輝光（選單氛圍用） */
.vd-menu-glow{
  position:absolute; top:-60px; left:50%; transform:translateX(-50%);
  width:320px; height:220px; pointer-events:none;
  background:radial-gradient(closest-side, rgba(${GOLD_RGB},0.2), transparent);
  filter:blur(10px);
}
/* 金框按鈕（次要動作） */
.vd-btn-gold{
  background:rgba(21,16,6,0.93); color:var(--vd-text);
  border:1px solid rgba(${GOLD_RGB},0.55);
  font-family:var(--vd-font-zh); font-weight:700; letter-spacing:2px;
  cursor:pointer; touch-action:manipulation;
}
/* 金底黑字按鈕（主要動作） */
.vd-btn-gold-primary{
  background:linear-gradient(var(--vd-gold), var(--vd-gold-dark));
  color:var(--vd-bg2); border:1px solid var(--vd-gold);
  font-family:var(--vd-font-zh); font-weight:700; letter-spacing:2px;
  cursor:pointer; touch-action:manipulation;
}
.vd-btn-gold:active, .vd-btn-gold-primary:active, .vd-chip-gold:active{
  filter:brightness(0.82);
}
/* 金框 chip（音量列／離開／暫停／回放等小型常駐控制） */
.vd-chip-gold{
  background:rgba(14,11,6,0.88); color:var(--vd-text);
  border:1px solid rgba(${GOLD_RGB},0.55);
  font-family:var(--vd-font-zh); font-weight:700;
}
/* 金漸層文字（標題）——background-clip 不支援時整段退化成純金色實色字，不會變透明消失 */
.vd-gold-text{
  color:var(--vd-gold);
  background:linear-gradient(var(--vd-gold-light), var(--vd-gold) 55%, var(--vd-gold-dark));
  -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;
  filter:drop-shadow(0 3px 8px rgba(0,0,0,.8));
  font-family:var(--vd-font-zh);
}
/* 細金線分隔（雙側線＋置中文字），用法：<div class="vd-rule"><span>文字</span></div> */
.vd-rule{
  display:flex; align-items:center; gap:10px; color:var(--vd-gold);
}
.vd-rule::before, .vd-rule::after{
  content:''; flex:1; height:1px; max-width:70px;
  background:linear-gradient(90deg, transparent, var(--vd-gold));
}
.vd-rule::after{ background:linear-gradient(90deg, var(--vd-gold), transparent); }
.vd-rule span{ font-size:14px; letter-spacing:8px; color:var(--vd-text-dim); white-space:nowrap; }
/* Cinzel 小標籤（VOLLEY DREAM 之類的拉丁裝飾字） */
.vd-laurel{
  font-family:var(--vd-font-latin); color:var(--vd-gold);
  font-size:15px; letter-spacing:6px;
}
/* 斜切動感（比賽 HUD 用）＋實心投影 */
.vd-skew{ transform:skewX(-10deg); box-shadow:5px 5px 0 rgba(0,0,0,.4); }
`;
}

// 注入一次性 <style id="vd-theme">＋Google Fonts <link>。全包 try/catch：字體/樣式載入
// 失敗（離線、CDN 被擋、測試環境沒有真的 document）一律 degrade 到系統 serif，不阻塞不 throw。
// 冪等：不用模組層旗標（測試裡每個 stub document 都要能重新掛上），純靠 getElementById 判斷。
export function installTheme() {
  try {
    if (typeof document === 'undefined' || !document?.head) return;
    if (!document.getElementById(STYLE_ID)) {
      const st = document.createElement('style');
      st.id = STYLE_ID;
      st.textContent = buildCss();
      document.head.appendChild(st);
    }
    if (!document.getElementById(FONT_LINK_ID)) {
      const pre1 = document.createElement('link');
      pre1.rel = 'preconnect';
      pre1.href = 'https://fonts.googleapis.com';
      const pre2 = document.createElement('link');
      pre2.rel = 'preconnect';
      pre2.href = 'https://fonts.gstatic.com';
      pre2.crossOrigin = 'anonymous';
      const link = document.createElement('link');
      link.id = FONT_LINK_ID;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@700;900'
        + '&family=Cinzel:wght@600;700&display=swap';
      // 載入失敗（離線／CDN 擋）：吞掉，字體 fallback 到系統 serif（COLORS/FONTS 常數本身
      // 已把 serif/'Cinzel' 系統字排在 fallback 位——不必在這裡另外處理畫面）
      link.onerror = () => { /* 靜默 degrade，不阻塞不致死 */ };
      document.head.appendChild(pre1);
      document.head.appendChild(pre2);
      document.head.appendChild(link);
    }
  } catch {
    // 任何注入失敗（stub document、舊瀏覽器不支援某 API）一律吞掉——永不阻塞、永不 throw
  }
}
