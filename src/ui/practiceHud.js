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
export function createPracticeHud() {
  const root = document.createElement('div');
  root.style.cssText = [
    'position:fixed',
    'top:calc(env(safe-area-inset-top, 0px) + 62px)',
    'left:calc(env(safe-area-inset-left, 0px) + 12px)',
    'z-index:15', 'display:none', 'flex-direction:column', 'gap:2px',
    'background:rgba(12,16,26,0.55)', 'border-radius:10px', 'padding:6px 10px',
    'font-family:system-ui,sans-serif', 'pointer-events:none', 'user-select:none',
    'max-width:min(240px, 60vw)',
  ].join(';');
  const title = document.createElement('div');
  title.textContent = '今天的科目';
  title.style.cssText = ['font-size:10px', 'color:#9fb0cc', 'letter-spacing:2px'].join(';');
  root.appendChild(title);
  const list = document.createElement('div');
  list.style.cssText = ['display:flex', 'flex-direction:column', 'gap:1px'].join(';');
  root.appendChild(list);
  document.body.appendChild(root);

  // 教學局（2026-08-12）：一次只練一步 ⇒ 當前步要**看得出來是哪一步**。
  // ★ 為什麼當前步展開操作提示 ★ 教練的泡泡 5 秒就消失，而新手看完泡泡才開始找鈕在哪；
  // 「我剛剛要做什麼」是隨時可查的狀態，跟科目進度同一種資訊，放同一個框裡。
  const PREFIX = { done: '✅', passed: '⏭', current: '👉 現在練：', todo: '·' };
  const COLOR = { done: '#ffd166', passed: '#8ea3c4', current: '#6ee7ff', todo: '#cfd9ea' };

  return {
    // rows＝[{ label, count, target, achieved }]（matchLoop 用 settlePractice 算出來的同一份）
    // 教學局多帶 phase（'done'|'passed'|'current'|'todo'）與 current 那列的 hints
    update(rows, headline = null) {
      if (!rows?.length) { root.style.display = 'none'; return; }
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
      const restCount = isTutorial ? rows.length - shown.length : 0;
      for (const r of shown) {
        const phase = r.phase ?? (r.achieved ? 'done' : 'todo');
        const line = document.createElement('div');
        line.textContent = phase === 'current'
          ? `${PREFIX.current}${r.label}　${r.count}/${r.target}`
          : `${PREFIX[phase]} ${r.label}　${r.count}/${r.target}`;
        line.style.cssText = [
          'font-size:11px', 'line-height:1.45', 'white-space:nowrap',
          'overflow:hidden', 'text-overflow:ellipsis',
          `color:${COLOR[phase]}`,
          ...(phase === 'current' ? ['font-weight:700'] : []),
        ].join(';');
        list.appendChild(line);
        for (const h of (phase === 'current' ? r.hints ?? [] : [])) {
          const tip = document.createElement('div');
          tip.textContent = `　${h}`;
          tip.style.cssText = [
            'font-size:10px', 'line-height:1.4', 'color:#9fb0cc', 'white-space:normal',
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
          'font-size:10px', 'line-height:1.6', 'color:#8ea3c4', 'white-space:nowrap',
        ].join(';');
        list.appendChild(rest);
      }
      root.style.display = 'flex';
    },
    hide() {
      root.style.display = 'none';
    },
  };
}
