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

import { AI } from '../sim/ai.js';

// 起步倒數進入「該跑了」的門檻（tick）：0＝起步時刻本身。
// 給一格 8 tick（≈0.13s）的提前量＝人看到畫面到手指動的量級，不是憑空挑的數字：
// 沿用 `ai.js reactionTicks` 的下界（`Math.max(6, …)`）再進一位，讓提示比人快一點點。
const URGENT_TICKS = 8;
// 距起點多遠算「還沒到位」（m）——**直接向 sim 取值，不在這裡放第二份**。
// 這把尺同時被兩邊用：畫面說「就位」、S 判「他有跑」。兩份數字一旦漂開，
// 玩家會看到提示說就位、同一 tick 二傳卻把球改給別人。單一真相在 `AI.AT_START_M`。
// （方向是 ui → sim；反向 sim 不得 import ui，那是架構鐵律 1。）
const { AT_START_M } = AI;

const TONE = {
  wait: { color: '#cfe3ff', glow: 'rgba(120,170,255,0.35)' }, // 還有時間：冷色、低調
  now: { color: '#ffd166', glow: 'rgba(255,209,102,0.55)' },  // 該跑了：暖色、亮
  running: { color: '#60ffa0', glow: 'rgba(96,255,160,0.45)' }, // 已在跑：綠
};

// 狀態 → 顯示內容的映射。**抽成純函式＝node 測試可紅綠**（createRouteCue 綁 DOM
// 建不起來，同 matchControls.mbMomentFor 的先例）；下面的元件只負責把它畫出來。
// 節奏三檔的顏色＝**節奏本身**（一速最快＝紅、二速＝橙、三速＝藍）。
// 與 TONE（動作三態）分開兩套：一個講「這球多快」、一個講「你現在該做什麼」，
// 混用一套顏色的話兩個維度會互相蓋掉（2026-08-03 版面裁定的核心）。
const TEMPO_TONE = {
  one: { color: '#ff6b6b', bg: 'rgba(255,107,107,0.16)' },
  two: { color: '#ffa94d', bg: 'rgba(255,169,77,0.16)' },
  three: { color: '#74c0fc', bg: 'rgba(116,192,252,0.16)' },
};

// route＝`myRouteFor(...)` 的回傳；null 或缺欄位一律回 null＝不顯示。
//
// ★ 回傳的是**分好段的資料**不是一整串字（2026-08-03 Sawmah 裁定「三層卡片」）★
// 三件事各佔一個位置、各自上色：`kindLabel`（跑哪條線）／`tempoLabel`（幾速）／
// `action`（現在該做什麼）。攤平的 `text` 保留，供 `current()` 偵錯與既有測試用。
export function routeCueTextOf(route) {
  if (!route || !route.label) return null;
  const running = route.phase === 'chase' || route.phase === 'air';
  const atStart = route.distToStart != null && route.distToStart <= AT_START_M;
  const due = route.ticksToStart != null && route.ticksToStart <= URGENT_TICKS;
  const tone = running ? 'running' : due ? 'now' : 'wait';

  let action;
  if (running) action = '跑！';
  else if (due) action = atStart ? '起跳時機自己抓' : '現在跑！';
  else if (route.ticksToStart != null) action = `${(route.ticksToStart / 60).toFixed(1)}s 後起步`;
  else action = '就位';

  // 還沒到位就順便報距離——那是玩家判斷「來不來得及退回去拉開」的唯一數字
  // （myRouteFor 檔頭原話）；已到位或已在跑時報它是噪音
  const dist = !running && !atStart && route.distToStart != null
    ? `離起點 ${route.distToStart.toFixed(1)}m` : '';

  // ★ 分屆換詞（2026-08-03 Sawmah 裁定）★ 第 1 屆（`playsOn === false`）連對手都沒有
  // 組合攻擊，說「S 要你跑」會被讀成「S 叫了一個戰術」——那一屆根本沒有戰術系統。
  // 純陳述「你的線」才誠實；第 2 屆起 `callPlay` 解鎖了，才回到「S 要你跑」。
  // 缺這個欄位（舊呼叫端／測試）一律當成有戰術＝維持既有措辭。
  const lead = route.playsOn === false ? '你的線' : 'S 要你跑';

  return {
    lead,
    kindLabel: route.kindLabel ?? route.label,
    tempo: route.tempo ?? null,
    tempoLabel: route.tempoLabel ?? '',
    action,
    dist,
    tone,
    text: `${lead}：${route.label}　${action}${dist ? `　${dist}` : ''}`,
  };
}

// 單行橫帶（2026-08-03 Sawmah 第二次裁定，取代同日稍早的三層卡片）：
//   `S 要你跑　左翼 [二速]　跑！　離起點 1.0m` 全部排成一行，貼著畫面下緣。
//
// ★ 為什麼從三層改回一行 ★ 字級不是問題、**高度才是**：三層在手機橫向佔掉
// 32% 的畫面高（127/394），從下緣往上長就會蓋住玩家角色與球的落點——那正是
// 這個遊戲最需要看清楚的兩樣東西。一行只佔約 12%，橫向再寬也只是佔掉本來就空的
// 下緣帶狀區。字級一格未縮（路線名與動作行維持 clamp(20,8vh,34)）。
// 仍然零互動（`pointer-events:none`）＝不是決策面板，憲法 §九 不觸。
export function createRouteCue() {
  const el = document.createElement('div');
  el.style.cssText = [
    // ★ 2026-08-03 真人回報「卡在畫面中央」★ 舊值是 `+96px`：桌機直式視窗看起來貼底，
    // 但**手機橫向的可視高度只有 ~390px**，96px 往上就落到球場正中央、壓住攻擊區按鈕。
    // 先前的單行提醒條也吃同一個 bug，只是它面積小、看起來像「在下面」而已。
    // 改成真的貼下緣；與攻擊區按鈕的重疊由「選攻擊區時收起」處理（matchLoop）。
    'position:fixed', 'left:50%', 'bottom:calc(env(safe-area-inset-bottom, 0px) + 12px)',
    'transform:translateX(-50%)', 'z-index:19',
    'font-family:system-ui,sans-serif', 'white-space:nowrap',
    // 單行：四段並排、基線對齊（大字與小字混排時 baseline 比 center 穩）
    'display:flex', 'align-items:baseline', 'gap:clamp(8px,2.4vh,14px)',
    'padding:clamp(4px,1.4vh,9px) clamp(12px,3.6vh,20px)', 'border-radius:999px',
    'background:rgba(8,12,20,0.62)', 'backdrop-filter:blur(3px)',
    'border:1px solid rgba(255,255,255,0.10)',
    'text-shadow:0 2px 6px rgba(0,0,0,0.85)',
    'pointer-events:none', 'user-select:none',
    'opacity:0', 'transition:opacity 160ms ease',
  ].join(';');

  const leadEl = document.createElement('span');
  leadEl.style.cssText = [
    'font-size:clamp(10px,3vh,13px)', 'font-weight:600', 'letter-spacing:2px',
    'color:rgba(255,255,255,0.45)',
  ].join(';');

  const kindEl = document.createElement('span');
  kindEl.style.cssText = [
    'font-size:clamp(20px,8vh,34px)', 'font-weight:800', 'letter-spacing:2px', 'color:#f4f8ff',
  ].join(';');
  const tempoEl = document.createElement('span');
  tempoEl.style.cssText = [
    // 2026-08-03 Sawmah：速度放大到與路線名／動作行**同級**——三件事並重，
    // 「幾速」本來就跟「哪條線」一樣是一眼要讀到的東西。內距同步收，膠囊才不會變成一大塊。
    'font-size:clamp(20px,8vh,34px)', 'font-weight:800', 'letter-spacing:1px',
    'padding:0 clamp(6px,1.6vh,10px)', 'border-radius:999px', 'border:1px solid currentColor',
  ].join(';');
  const actionEl = document.createElement('span');
  // 2026-08-03 Sawmah 裁定：動作行放大到與路線名**同級**。
  // 理由＝層級原本是反的：路線名整球不變、只需確認一次，而動作行（現在跑！／0.4s 後起步）
  // 每 tick 都在變且要玩家當下動作，卻只有路線名的三分之二大。並重之後餘光掃得到。
  actionEl.style.cssText = ['font-size:clamp(20px,8vh,34px)', 'font-weight:800', 'letter-spacing:1px'].join(';');
  const distEl = document.createElement('span');
  distEl.style.cssText = ['font-size:clamp(11px,3.5vh,15px)', 'color:rgba(255,255,255,0.5)'].join(';');

  el.append(leadEl, kindEl, tempoEl, actionEl, distEl);
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
      leadEl.textContent = cue.lead;
      kindEl.textContent = cue.kindLabel;
      tempoEl.textContent = cue.tempoLabel;
      tempoEl.style.display = cue.tempoLabel ? '' : 'none';
      const tt = TEMPO_TONE[cue.tempo] ?? null;
      tempoEl.style.color = tt ? tt.color : 'rgba(255,255,255,0.7)';
      tempoEl.style.background = tt ? tt.bg : 'transparent';
      actionEl.textContent = cue.action;
      actionEl.style.color = tone.color;
      distEl.textContent = cue.dist;
      el.style.boxShadow = `0 0 18px ${tone.glow}`;
      el.style.opacity = '1';
    },
    // 測試／偵錯用：現在畫面上是什麼（null＝沒顯示）
    current: () => (shownKey === null ? null : shownKey.split('|')[0]),
    destroy() { el.remove(); },
  };
}
