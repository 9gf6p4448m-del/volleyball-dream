// 首次操作教學卡：顯示一次（localStorage 記憶），點任意處關閉
const FLAG = 'vd-tutorial-v1';

export function showTutorialOnce() {
  let seen = false;
  try { seen = !!localStorage.getItem(FLAG); } catch { /* 私密模式等，直接顯示 */ }
  if (seen) return;

  const isTouch = 'ontouchstart' in window;
  const moveHint = isTouch
    ? '<b>左半螢幕</b> 按住拖曳＝走位搖桿'
    : '<b>WASD / 方向鍵</b>＝走位';
  const actHint = isTouch
    ? '<b>右半螢幕</b> 按住＝蓄力（按下那一眼＝視線）<br>拖曳＝瞄準落點 → 放開＝出手'
    : '<b>滑鼠</b> 按住＝蓄力（按下那一眼＝視線）<br>拖曳＝瞄準落點 → 放開＝出手';

  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:30', 'background:rgba(12,16,26,0.82)',
    'display:flex', 'align-items:center', 'justify-content:center',
    'color:#eef2fa', 'font-family:system-ui,sans-serif', 'text-align:center',
  ].join(';');
  el.innerHTML = `
    <div style="max-width:520px;padding:24px;line-height:1.9;font-size:15px">
      <div style="font-size:22px;font-weight:700;margin-bottom:14px">排球夢 — 怎麼玩</div>
      <div>${moveHint}</div>
      <div>${actHint}</div>
      <div style="margin-top:10px;opacity:0.85">
        動作看情境自動判定：輪到你發球會等你出手；<br>
        走到球落點會自動墊球；第三擊時「看的方向」能騙攔網。
      </div>
      <div style="margin-top:18px;font-size:13px;opacity:0.6">點擊任意處開始</div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    el.remove();
    try { localStorage.setItem(FLAG, '1'); } catch { /* 存不了就每次顯示 */ }
  });
}
