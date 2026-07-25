// 浮動字卡（Perfect!、回放中…）：主角個人字卡帶——緊貼播報泡泡下方
// W6.1 疊排（拍板 07-24 Q1-P1）：新卡進場時把在場舊卡各推一格（transition 順勢補間）
// W7.1 五輪（Sawmah 拍板改位＋修根因）：①字卡帶錨定「播報泡泡正下方」——新卡佔基準位、
// 舊卡往下讓位、淡出漂移朝下（遠離泡泡）；矮視窗泡泡自停左上、本帶維持置中互不撞
// ②修可見時長根因：舊版一出場就啟動 0.8s 淡出＝dur 再長實際可見僅 ~0.8s
// （「Perfect 都沒看到」元兇）——改為全亮停留 durMs−FADE_MS 才開始漂移淡出
const STACK_STEP = 42; // 舊卡下推格距（px；實測 34 會疊字、46 太深——42 是不疊不深的平衡點）
// 淡出 800→450（試玩回饋 07-24 四度回報「還是沒看到」）：字卡總時長多在 1100-1800ms，
// 扣掉 800 淡出後全亮只剩 0.3-1s＝rally 中一閃即逝。淡出縮短＝同樣時長多賺 350ms 全亮
const FADE_MS = 450;
const POP_MS = 140;    // 進場彈跳（放大→歸位）：靜態出現在高速畫面裡不易被眼睛捕捉
// 疊排上限 4→3＋舊卡遞減縮小（實測 07-24：四卡全尺寸疊起來佔畫面 23-47%＝壓到網子
// 那條視線帶。新卡全尺寸最顯眼、舊卡縮小淡化＝資訊不丟但不擋球）
const MAX_LIVE = 3;
const OLD_SCALE = [1, 0.8, 0.66]; // 依新→舊的縮放
const OLD_ALPHA = [1, 0.72, 0.5];
const BASE_TOP = 'calc(env(safe-area-inset-top, 0px) + 178px)'; // 記分板＋氣勢計＋泡泡之下
export function createFloatText() {
  const live = []; // 在場字卡 [{ el, lift, fading }]
  let baseOffset = 0; // pointBanner 在場時整帶下移（版面稽核：banner 佔 169-240px 帶）
  // 字卡遙測（07-24：自動比賽測不到主角字卡＝密度無法驗證的缺口）：真人實玩也留紀錄，
  // 事後 __phase1.cardStats() 或 ?cardstats=1 角標即可看「出現幾次/最多同框幾張」
  const stats = { total: 0, maxConcurrent: 0, byText: {} };
  return {
    // matchLoop 在 pointBanner show/serve 時呼叫——避免死球字卡與得分大字重疊
    setBaseOffset(px) { baseOffset = px; },
    stats: () => ({ ...stats, byText: { ...stats.byText } }),
    liveCount: () => live.length,
    show(text, color = '#60ffa0', durMs = 900) {
      stats.total += 1;
      stats.byText[text] = (stats.byText[text] ?? 0) + 1;
      stats.maxConcurrent = Math.max(stats.maxConcurrent, Math.min(live.length + 1, MAX_LIVE));
      while (live.length >= MAX_LIVE) {
        const oldest = live.shift();
        oldest.el.remove();
      }
      // 舊卡讓位：下推一格＋依「新→舊」名次縮小淡化（最新的永遠最大最亮）
      for (let i = live.length - 1, rank = 1; i >= 0; i -= 1, rank += 1) {
        const c = live[i];
        c.lift += STACK_STEP;
        c.scale = OLD_SCALE[Math.min(rank, OLD_SCALE.length - 1)];
        c.el.style.transform =
          `translateX(-50%) translateY(${c.base + c.lift + (c.fading ? 24 : 0)}px) scale(${c.scale})`;
        if (!c.fading) c.el.style.opacity = `${OLD_ALPHA[Math.min(rank, OLD_ALPHA.length - 1)]}`;
      }
      const el = document.createElement('div');
      el.textContent = text;
      el.style.cssText = [
        'position:fixed', 'left:50%', `top:${BASE_TOP}`, 'z-index:20',
        `transform:translateX(-50%) translateY(${baseOffset}px) scale(1.25)`,
        `color:${color}`, 'font-family:system-ui,sans-serif',
        'font-size:34px', 'font-weight:800', 'letter-spacing:2px',
        // 描邊＋光暈：高速球場背景下純字容易被吃掉（試玩回饋：不確定有沒有出現過）
        'text-shadow:0 2px 8px rgba(0,0,0,0.85), 0 0 18px currentColor',
        '-webkit-text-stroke:1px rgba(0,0,0,0.55)',
        'pointer-events:none', 'user-select:none',
        `transition:transform ${POP_MS}ms cubic-bezier(0.23,1,0.32,1), opacity 0.2s ease`,
        'opacity:1',
      ].join(';');
      document.body.appendChild(el);
      const card = { el, lift: 0, fading: false, base: baseOffset, scale: 1 };
      live.push(card);
      // 進場彈跳：1.25→1（140ms 強 ease-out）；接著把 transition 換回長淡出用的曲線
      requestAnimationFrame(() => {
        el.style.transform = `translateX(-50%) translateY(${card.base + card.lift}px) scale(1)`;
        setTimeout(() => {
          el.style.transition =
            `transform ${FADE_MS}ms ease-out, opacity ${FADE_MS}ms ease-out`;
        }, POP_MS);
      });
      setTimeout(() => {
        card.fading = true;
        el.style.transform =
          `translateX(-50%) translateY(${card.base + card.lift + 24}px) scale(${card.scale})`;
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
