// 首次操作教學卡：顯示一次（localStorage 記憶），點任意處關閉
const FLAG = 'vd-tutorial-v9'; // 版本號變更＝更新後重新顯示一次

// simple＝簡化操作模式（預設）：只教進攻決策；classic 模式教全手動
export function showTutorialOnce(simple = true) {
  let seen = false;
  try { seen = !!localStorage.getItem(FLAG); } catch { /* 私密模式等，直接顯示 */ }
  if (seen) return;

  const isTouch = 'ontouchstart' in window;
  const body = simple
    ? `<div style="margin-bottom:8px">走位、接球、舉球——<b>全部自動</b>；你只做三種<b>決策</b>：</div>
       <div style="line-height:2">
       ⚔️ <b>進攻</b>：輪到你扣球→時間放慢，讀攔網選攻擊區<br>
       （<span style="color:#60ffa0">綠＝空檔</span>、<span style="color:#ff5b5b">紅✋＝被封</span>；吊球專治起跳的攔網）<br>
       🧱 <b>攔網</b>：對方要扣→選「封直線／封斜線／退防」<br>
       🏐 <b>發球</b>：輪你發球→選目標區（深左／深中／深右／短球）</div>`
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
