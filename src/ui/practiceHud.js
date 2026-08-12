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

  return {
    // rows＝[{ label, count, target, achieved }]（matchLoop 用 settlePractice 算出來的同一份）
    update(rows) {
      if (!rows?.length) { root.style.display = 'none'; return; }
      list.replaceChildren();
      for (const r of rows) {
        const line = document.createElement('div');
        line.textContent = `${r.achieved ? '✅' : '·'} ${r.label}　${r.count}/${r.target}`;
        line.style.cssText = [
          'font-size:11px', 'line-height:1.45', 'white-space:nowrap',
          'overflow:hidden', 'text-overflow:ellipsis',
          `color:${r.achieved ? '#ffd166' : '#cfd9ea'}`,
        ].join(';');
        list.appendChild(line);
      }
      root.style.display = 'flex';
    },
    hide() {
      root.style.display = 'none';
    },
  };
}
