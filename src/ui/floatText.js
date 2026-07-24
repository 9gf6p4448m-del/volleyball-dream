// 浮動字卡（Perfect!、回放中…）：主角個人字卡帶——緊貼播報泡泡下方
// W6.1 疊排（拍板 07-24 Q1-P1）：新卡進場時把在場舊卡各推一格（transition 順勢補間）
// W7.1 五輪（Sawmah 拍板改位＋修根因）：①字卡帶錨定「播報泡泡正下方」——新卡佔基準位、
// 舊卡往下讓位、淡出漂移朝下（遠離泡泡）；矮視窗泡泡自停左上、本帶維持置中互不撞
// ②修可見時長根因：舊版一出場就啟動 0.8s 淡出＝dur 再長實際可見僅 ~0.8s
// （「Perfect 都沒看到」元兇）——改為全亮停留 durMs−FADE_MS 才開始漂移淡出
const STACK_STEP = 46; // 舊卡下推格距（px）
const FADE_MS = 800;   // 尾段漂移淡出時長
const MAX_LIVE = 4;    // 疊排上限（版面稽核 07-24：防深疊侵入球場中央視野）
const BASE_TOP = 'calc(env(safe-area-inset-top, 0px) + 178px)'; // 記分板＋氣勢計＋泡泡之下
export function createFloatText() {
  const live = []; // 在場字卡 [{ el, lift, fading }]
  let baseOffset = 0; // pointBanner 在場時整帶下移（版面稽核：banner 佔 169-240px 帶）
  return {
    // matchLoop 在 pointBanner show/serve 時呼叫——避免死球字卡與得分大字重疊
    setBaseOffset(px) { baseOffset = px; },
    show(text, color = '#60ffa0', durMs = 900) {
      while (live.length >= MAX_LIVE) {
        const oldest = live.shift();
        oldest.el.remove();
      }
      for (const c of live) {
        c.lift += STACK_STEP;
        c.el.style.transform =
          `translateX(-50%) translateY(${c.base + c.lift + (c.fading ? 24 : 0)}px)`;
      }
      const el = document.createElement('div');
      el.textContent = text;
      el.style.cssText = [
        'position:fixed', 'left:50%', `top:${BASE_TOP}`, 'z-index:20',
        `transform:translateX(-50%) translateY(${baseOffset}px)`,
        `color:${color}`, 'font-family:system-ui,sans-serif',
        'font-size:34px', 'font-weight:800', 'letter-spacing:2px',
        'text-shadow:0 2px 8px rgba(0,0,0,0.6)',
        'pointer-events:none', 'user-select:none',
        'transition:transform 0.8s ease-out, opacity 0.8s ease-out',
        'opacity:1',
      ].join(';');
      document.body.appendChild(el);
      const card = { el, lift: 0, fading: false, base: baseOffset };
      live.push(card);
      setTimeout(() => {
        card.fading = true;
        el.style.transform =
          `translateX(-50%) translateY(${card.base + card.lift + 24}px)`;
        el.style.opacity = '0';
      }, Math.max(0, durMs - FADE_MS));
      setTimeout(() => {
        el.remove();
        const i = live.indexOf(card);
        if (i >= 0) live.splice(i, 1);
      }, Math.max(durMs, FADE_MS));
    },
  };
}
