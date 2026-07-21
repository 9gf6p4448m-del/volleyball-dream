// 首次操作教學卡：顯示一次（localStorage 記憶），點任意處關閉
const FLAG = 'vd-tutorial-v8'; // 版本號變更＝更新後重新顯示一次

// simple＝簡化操作模式（預設）：只教進攻決策；classic 模式教全手動
export function showTutorialOnce(simple = true) {
  let seen = false;
  try { seen = !!localStorage.getItem(FLAG); } catch { /* 私密模式等，直接顯示 */ }
  if (seen) return;

  const isTouch = 'ontouchstart' in window;
  const body = simple
    ? `<div style="margin-bottom:8px">接發、舉球、防守、走位、發球——<b>全部自動</b></div>
       <div style="line-height:2">你只做一件事：<b>進攻決策</b><br>
       輪到你隊扣球時，時間放慢、彈出攻擊區按鈕：<br>
       <span style="color:#60ffa0">綠＝空檔</span>、<span style="color:#ff5b5b">紅✋＝被攔網守住</span><br>
       <b>點綠色的區</b>＝往那裡扣、乾淨得分<br>
       直線／斜線／中路／<b>吊球</b>（攔網跳起來就吊短球）</div>`
    : `<div>${isTouch ? '<b>左半螢幕</b>走位；<b>右側大鈕</b>蓄力/拖曳瞄準/放開出手' : '<b>WASD</b>走位；<b>J/滑鼠</b>蓄力出手、<b>K</b>攔網'}</div>`;

  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:30', 'background:rgba(12,16,26,0.82)',
    'display:flex', 'align-items:center', 'justify-content:center',
    'color:#eef2fa', 'font-family:system-ui,sans-serif', 'text-align:center',
  ].join(';');
  el.innerHTML = `
    <div style="max-width:520px;padding:24px;line-height:1.7;font-size:15px">
      <div style="font-size:22px;font-weight:700;margin-bottom:14px">排球夢 — 怎麼玩</div>
      ${body}
      <div style="margin-top:18px;font-size:13px;opacity:0.6">點擊任意處開始</div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    el.remove();
    try { localStorage.setItem(FLAG, '1'); } catch { /* 存不了就每次顯示 */ }
  });
}
