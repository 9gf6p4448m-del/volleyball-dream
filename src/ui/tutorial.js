// 首次操作教學卡：顯示一次（localStorage 記憶），點任意處關閉
const FLAG = 'vd-tutorial-v7'; // 版本號變更＝更新後重新顯示一次

export function showTutorialOnce() {
  let seen = false;
  try { seen = !!localStorage.getItem(FLAG); } catch { /* 私密模式等，直接顯示 */ }
  if (seen) return;

  const isTouch = 'ontouchstart' in window;
  const moveHint = isTouch
    ? '<b>左半螢幕</b> 按住拖曳＝走位搖桿'
    : '<b>WASD / 方向鍵</b>＝走位';
  const actHint = isTouch
    ? '<b>右側大鈕</b>（發球/扣球/舉球/墊球隨情境變）：<br>按住＝蓄力（扣球會自動助跑衝向球）、拖出＝瞄準、放開＝起跳出手<br><b>攔網鈕</b>＝一點就跳攔（跳太早太晚都攔不好）'
    : '<b>滑鼠按住</b>或 <b>J/空白鍵</b>＝蓄力（滑鼠位置＝瞄準）、放開＝出手<br><b>K 鍵</b>＝跳攔網';

  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:30', 'background:rgba(12,16,26,0.82)',
    'display:flex', 'align-items:center', 'justify-content:center',
    'color:#eef2fa', 'font-family:system-ui,sans-serif', 'text-align:center',
  ].join(';');
  el.innerHTML = `
    <div style="max-width:520px;padding:24px;line-height:1.9;font-size:15px">
      <div style="font-size:22px;font-weight:700;margin-bottom:14px">排球夢 — 怎麼玩</div>
      <div style="margin-bottom:6px">你＝<b>主攻手</b>（頭上「你」字＋腳下光圈那位）</div>
      <div>${moveHint}</div>
      <div>${actHint}</div>
      <div style="margin-top:10px;opacity:0.85">
        <span style="color:#6ee7ff">青圈</span>＝來球落點（<span style="color:#ff5b5b">變紅＝出界，別碰</span>）；<br>
        腳下光圈<span style="color:#ff8c42">變橘</span>＝這球歸你！<br>
        蓄力圈<span style="color:#60ffa0">變綠＝甜蜜區</span>放開最準、<span style="color:#ff5b5b">變紅＝超蓄</span>會飄；<br>
        短點＝輕吊、蓄滿＝重扣；輪到你發球會等你；「看的方向」能騙攔網。
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
