// 叫戰術重做卷 段 0（Sawmah 2026-08-01 裁定題 0＋題 2）—— 「S 要你跑 X」的球內提示
//
// ★ 語意翻轉的顯示端 ★
// 舊制：非 S 在死球窗**請求**套路，由 S 的 AI 依 trust 決定採不採納 ⇒ 玩家叫的是願望。
// 新制：一傳完成 → S 決策 → **非 S 收到「S 要你跑 X」的提示** → 用既有移動輸入
//       自己決定跑不跑。決定權整個交回玩家，系統只負責把他缺的那項資訊給他。
//
// ★ 憲法留痕（裁定題 0 明文）★ **球內資訊顯示不屬於決策面板，§九 不觸。**
// 本元件零互動：不吃 pointer、不吃鍵盤、沒有選項、沒有確認鍵（`pointer-events:none`）。
// 它只是把 `myRouteFor` 早就算好、卻一直沒有出口的那份資料畫出來。
//
// ★ 為什麼不是浮動字卡（floatText）★ 字卡是**事件**通知、一閃即逝；
// 助跑提示是**狀態**——玩家要一直看得到它才能決定「現在跑還是放棄」，
// 而且起步倒數每 tick 都在變。兩者形狀不同，不共用元件。
//
// 資料源＝`src/input/myRoute.js` 的 `myRouteFor`（純函式，讀 game/aiState 不寫回；
// 誠實性約束在該檔檔頭：對手的線不外洩、不回傳「二傳最後選了誰」）。
// 本檔**不自己算任何東西**，只做狀態→樣式的映射。

// 起步倒數進入「該跑了」的門檻（tick）：0＝起步時刻本身。
// 給一格 8 tick（≈0.13s）的提前量＝人看到畫面到手指動的量級，不是憑空挑的數字：
// 沿用 `ai.js reactionTicks` 的下界（`Math.max(6, …)`）再進一位，讓提示比人快一點點。
const URGENT_TICKS = 8;
// 距起點多遠算「還沒到位」（m）：沿用 sim 判「走到定點了」的同一把尺
// （ai.js moveIntent 的到位死區量級 0.3m），不另立常數。
const AT_START_M = 0.3;

const TONE = {
  wait: { color: '#cfe3ff', glow: 'rgba(120,170,255,0.35)' }, // 還有時間：冷色、低調
  now: { color: '#ffd166', glow: 'rgba(255,209,102,0.55)' },  // 該跑了：暖色、亮
  running: { color: '#60ffa0', glow: 'rgba(96,255,160,0.45)' }, // 已在跑：綠
};

// 狀態 → 顯示內容的映射。**抽成純函式＝node 測試可紅綠**（createRouteCue 綁 DOM
// 建不起來，同 matchControls.mbMomentFor 的先例）；下面的元件只負責把它畫出來。
// route＝`myRouteFor(...)` 的回傳；null 或缺欄位一律回 null＝不顯示。
export function routeCueTextOf(route) {
  if (!route || !route.label) return null;
  const running = route.phase === 'chase' || route.phase === 'air';
  const atStart = route.distToStart != null && route.distToStart <= AT_START_M;
  const due = route.ticksToStart != null && route.ticksToStart <= URGENT_TICKS;
  const tone = running ? 'running' : due ? 'now' : 'wait';

  let tail;
  if (running) tail = '跑！';
  else if (due) tail = atStart ? '起跳時機自己抓' : '現在跑！';
  else if (route.ticksToStart != null) tail = `${(route.ticksToStart / 60).toFixed(1)}s 後起步`;
  else tail = '就位';

  // 還沒到位就順便報距離——那是玩家判斷「來不來得及退回去拉開」的唯一數字
  // （myRouteFor 檔頭原話）；已到位或已在跑時報它是噪音
  const dist = !running && !atStart && route.distToStart != null
    ? `　離起點 ${route.distToStart.toFixed(1)}m` : '';
  return { text: `S 要你跑：${route.label}　${tail}${dist}`, tone };
}

export function createRouteCue() {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:calc(env(safe-area-inset-bottom, 0px) + 96px)',
    'transform:translateX(-50%)', 'z-index:19',
    'font-family:system-ui,sans-serif', 'font-size:20px', 'font-weight:700',
    'letter-spacing:1px', 'white-space:nowrap',
    'padding:6px 14px', 'border-radius:999px',
    'background:rgba(8,12,20,0.55)', 'backdrop-filter:blur(2px)',
    'text-shadow:0 2px 6px rgba(0,0,0,0.85)',
    // 零互動＝零決策面板（憲法 §九 留痕）
    'pointer-events:none', 'user-select:none',
    'opacity:0', 'transition:opacity 160ms ease',
  ].join(';');
  document.body.appendChild(el);

  let shownKey = null; // 內容沒變就不動 DOM（rally 中逐幀呼叫）

  return {
    /**
     * @param {object|null} route `myRouteFor(...)` 的回傳；null＝這一刻沒有線可報 → 收起來
     */
    sync(route) {
      if (!route) {
        if (shownKey !== null) {
          el.style.opacity = '0';
          shownKey = null;
        }
        return;
      }
      const cue = routeCueTextOf(route);
      if (!cue) {
        if (shownKey !== null) { el.style.opacity = '0'; shownKey = null; }
        return;
      }
      const tone = TONE[cue.tone];
      const key = `${cue.text}|${cue.tone}`;
      if (key === shownKey) return;
      shownKey = key;
      el.textContent = cue.text;
      el.style.color = tone.color;
      el.style.boxShadow = `0 0 18px ${tone.glow}`;
      el.style.opacity = '1';
    },
    // 測試／偵錯用：現在畫面上是什麼（null＝沒顯示）
    current: () => (shownKey === null ? null : el.textContent),
    destroy() { el.remove(); },
  };
}
