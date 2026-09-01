// 練習賽卷（2026-08-12）— 賽中科目進度小字（死球節拍更新）
//
// ★ 為什麼是常駐小字而不是浮字卡 ★ 浮字卡是「剛剛發生了什麼」的通道（1-2 秒就消失）；
// 科目進度要回答的是「我還差什麼」——那是隨時可查的狀態，不是事件。兩者混用的話，
// 玩家想確認進度就得等下一張卡。
//
// ★ 位置 ★ 左上、比分板下方（比分板在 top 12px 一帶）；z-index 15＝比 3D 高、
// 比任何面板（27／39／40）低——結算面板蓋上來時它不會穿幫。
//
// 純表現層：不判定、不計數，只把 matchLoop 算好的清單畫出來。
import { COLORS, FONTS, goldAlpha } from './theme.js';

export function createPracticeHud() {
  // ★ 2026-09-01 黑匾金框化（Sawmah 拍板：喜歡泡泡那種大匾顯示）★ 沿用 scoreboard
  // .bubble 的同一套配方（theme 單一色票：不透明黑底、金框、微斜切＋內容反斜切）。
  // 寬度上限 32vw＝停在置中記分板的左緣之外——泡泡時代 44vw 壓到記分板的教訓。
  const root = document.createElement('div');
  root.style.cssText = [
    'position:fixed',
    'top:calc(env(safe-area-inset-top, 0px) + 56px)',
    'left:calc(env(safe-area-inset-left, 0px) + 12px)',
    'z-index:15', 'display:none', 'flex-direction:column',
    `background:rgba(14,11,6,0.94)`, `border:1px solid ${COLORS.gold}`,
    `box-shadow:0 6px 16px rgba(0,0,0,0.55), inset 0 0 18px ${goldAlpha(0.1)}`,
    'transform:skewX(-6deg) rotate(-0.6deg)', 'transform-origin:left top',
    'padding:9px 16px',
    `font-family:${FONTS.zh}`, 'pointer-events:none', 'user-select:none',
    'max-width:min(340px, 32vw)',
  ].join(';');
  // 內容反斜切（匾斜字正——與 .bubble/.btext 同一手法）
  const inner = document.createElement('div');
  inner.style.cssText = [
    'transform:skewX(6deg) rotate(0.6deg)', 'display:flex',
    'flex-direction:column', 'gap:2px',
  ].join(';');
  root.appendChild(inner);
  // 統一教學框（2026-09-01 Sawmah 拍板甲案）：教練喊話併進框頂行——原本走 scoreboard
  // 泡泡，手機橫向時泡泡固定左上、疊在本框上，且台詞與框內容字面重複。
  // 喊話是事件語意（幾秒後淡出讓位給框身），框身是隨時可查的狀態——同一個家、兩種壽命。
  const coach = document.createElement('div');
  coach.style.cssText = [
    'font-size:15px', 'font-weight:700', `color:${COLORS.gold}`, 'line-height:1.45',
    'letter-spacing:1px', 'white-space:normal', 'display:none', 'margin-bottom:4px',
    'transition:opacity 0.35s ease',
  ].join(';');
  inner.appendChild(coach);
  let coachTimer = null;
  let coachVisible = false; // 喊話期間強制展開（讀字時刻）
  const title = document.createElement('div');
  title.textContent = '今天的科目';
  title.style.cssText = ['font-size:11px', 'color:#9fb0cc', 'letter-spacing:2px'].join(';');
  inner.appendChild(title);
  const list = document.createElement('div');
  list.style.cssText = ['display:flex', 'flex-direction:column', 'gap:2px'].join(';');
  inner.appendChild(list);
  document.body.appendChild(root);

  // 教學局（2026-08-12）：一次只練一步 ⇒ 當前步要**看得出來是哪一步**。
  // ★ 為什麼當前步展開操作提示 ★ 教練的泡泡 5 秒就消失，而新手看完泡泡才開始找鈕在哪；
  // 「我剛剛要做什麼」是隨時可查的狀態，跟科目進度同一種資訊，放同一個框裡。
  const PREFIX = { done: '✅', passed: '⏭', current: '👉 現在練：', todo: '·' };
  const COLOR = { done: '#ffd166', passed: '#8ea3c4', current: '#6ee7ff', todo: '#cfd9ea' };

  return {
    // rows＝[{ label, count, target, achieved }]（matchLoop 用 settlePractice 算出來的同一份）
    // 教學局多帶 phase（'done'|'passed'|'current'|'todo'）與 current 那列的 hints
    // ★ 2026-09-01 呼吸式收合（Sawmah 回饋：全文常駐黑匾把左半場整塊擋住）★
    // ★ 同日二修（Sawmah：要更早縮起來）★ 展開條件從「非 rally」改成
    // 「教練有話講　且　不在打球」——話講完（ttl 到）立刻收回單行，不再開著等發球；
    // rally 中就算教練開口也不展開，改在單行上方加一條金色小字（不擋場）。
    update(rows, headline = null, compact = false) {
      if (!rows?.length) { root.style.display = 'none'; return; }
      const expanded = coachVisible && !compact;
      const slim = !expanded;
      root.style.background = slim ? 'rgba(14,11,6,0.6)' : 'rgba(14,11,6,0.94)';
      root.style.padding = slim ? '4px 12px' : '9px 16px';
      title.style.display = slim ? 'none' : 'block';
      // 喊話行隨模式換裝：展開＝15px 換行；單行模式＝13px 一行省略（rally 中的金色小字）
      coach.style.fontSize = slim ? '13px' : '15px';
      coach.style.whiteSpace = slim ? 'nowrap' : 'normal';
      coach.style.overflow = slim ? 'hidden' : 'visible';
      coach.style.textOverflow = slim ? 'ellipsis' : 'clip';
      if (headline) title.textContent = headline;
      list.replaceChildren();
      // 教學局：只畫「現在練」那一列與它的操作提示，其餘收成一行計數（2026-08-13）。
      // ★ 為什麼收合 ★ 六個科目 × 每列一行 ＋ 當前步的三行提示，在手機橫向會從左上
      // 一路蓋到球場左側（真人截圖實證）。一次只練一步的介面，不需要把還沒輪到的五步
      // 攤在畫面上——它們既不能提前做，也不是「我還差什麼」的答案。
      // ★ 只收合教學局 ★ 判準＝有沒有任何一列帶 phase（紅白對抗賽的 rows 不帶），
      // 那邊科目只有 2–3 個、本來就不高，收了反而看不到全貌。
      const isTutorial = rows.some((r) => r.phase != null);
      const shown = isTutorial ? rows.filter((r) => r.phase === 'current') : rows;
      const restCount = (isTutorial && !slim) ? rows.length - shown.length : 0;
      for (const r of shown) {
        const phase = r.phase ?? (r.achieved ? 'done' : 'todo');
        const line = document.createElement('div');
        line.textContent = phase === 'current'
          ? `${PREFIX.current}${r.label}　${r.count}/${r.target}`
          : `${PREFIX[phase]} ${r.label}　${r.count}/${r.target}`;
        // 甲案順修：當前步是「玩家此刻唯一要讀的字」，截成「…」＝把重點吃掉；
        // 只有當前步換行寫完整，其餘（紅白賽多列）維持單行省略不佔高
        line.style.cssText = [
          'line-height:1.45',
          ...(phase === 'current' && !slim
            ? ['font-size:14px', 'white-space:normal', 'font-weight:700']
            : phase === 'current'
              ? ['font-size:13px', 'white-space:nowrap', 'overflow:hidden',
                'text-overflow:ellipsis', 'font-weight:700']
              : ['font-size:12px', 'white-space:nowrap', 'overflow:hidden', 'text-overflow:ellipsis']),
          `color:${COLOR[phase]}`,
        ].join(';');
        list.appendChild(line);
        for (const h of (phase === 'current' && !slim ? r.hints ?? [] : [])) {
          const tip = document.createElement('div');
          tip.textContent = `　${h}`;
          tip.style.cssText = [
            'font-size:12px', 'line-height:1.45', 'color:#cfd9ea', 'white-space:normal',
          ].join(';');
          list.appendChild(tip);
        }
      }
      // 收合列：讓玩家知道「後面還有」，但不佔六行。已走完的步數也一起講，
      // 否則只看到「還有 4 步」會不知道自己前進了沒。
      if (restCount > 0) {
        const done = rows.filter((r) => r.phase === 'done' || r.phase === 'passed').length;
        const rest = document.createElement('div');
        rest.textContent = `　（已完成 ${done}／共 ${rows.length} 步）`;
        rest.style.cssText = [
          'font-size:11px', 'line-height:1.6', 'color:#8ea3c4', 'white-space:nowrap',
        ].join(';');
        list.appendChild(rest);
      }
      root.style.display = 'flex';
    },
    // 教學局教練喊話（甲案）：ttl 到期淡出——不佔位、不必呼叫端清
    coach(text, ttl = 5200) {
      if (coachTimer) { clearTimeout(coachTimer); coachTimer = null; }
      if (!text) { coach.style.display = 'none'; coachVisible = false; return; }
      coach.textContent = text;
      coach.style.opacity = '1';
      coach.style.display = 'block';
      coachVisible = true;
      root.style.display = 'flex';
      coachTimer = setTimeout(() => {
        coach.style.opacity = '0';
        coachVisible = false;
        coachTimer = setTimeout(() => { coach.style.display = 'none'; coachTimer = null; }, 400);
      }, ttl);
    },
    hide() {
      if (coachTimer) { clearTimeout(coachTimer); coachTimer = null; }
      coach.style.display = 'none';
      coachVisible = false;
      root.style.display = 'none';
    },
  };
}
