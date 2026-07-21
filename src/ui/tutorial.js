// 首次操作教學卡：顯示一次（localStorage 記憶），點任意處關閉
const FLAG = 'vd-tutorial-v4'; // 版本號變更＝更新後重新顯示一次

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
        <span style="color:#6ee7ff">青圈</span>＝來球落點（<span style="color:#ff5b5b">變紅＝出界，別碰</span>）；<br>
        腳下光圈<span style="color:#ff8c42">變橘</span>＝這球歸你！<br>
        <b>空白鍵／右下「我的!」鈕＝喊球</b>——隊友退讓、這球給你；<br>
        <b>第三擊：按下＝起跳、放開＝揮臂</b>——短點＝輕吊、蓄滿＝重扣；<br>
        滯空時放開才是扣球，落地才放＝只能送安全球；<br>
        輪到你發球會等你；「看的方向」能騙攔網。
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
