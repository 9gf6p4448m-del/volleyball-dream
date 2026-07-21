// 進攻決策面板（簡化操作核心）：扣球時刻彈出攻擊區按鈕，讀攔網＝綠(空檔)/紅(被封)
// 點一個區＝往那裡扣。發球一鍵。全在 UI 層，讀 controls 提供的 zones、回呼 controls
export function createAttackPanel(controls) {
  const wrap = document.createElement('div');
  wrap.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:calc(env(safe-area-inset-bottom, 0px) + 90px)',
    'transform:translateX(-50%)', 'z-index:18', 'display:none',
    'gap:10px', 'flex-wrap:wrap', 'justify-content:center', 'max-width:92vw',
  ].join(';');
  wrap.style.display = 'none';
  document.body.appendChild(wrap);

  const title = document.createElement('div');
  title.textContent = '選攻擊區！';
  title.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:calc(env(safe-area-inset-bottom, 0px) + 168px)',
    'transform:translateX(-50%)', 'z-index:18', 'display:none',
    'color:#ffd166', 'font-family:system-ui,sans-serif', 'font-size:18px', 'font-weight:700',
    'text-shadow:0 2px 6px rgba(0,0,0,0.7)', 'pointer-events:none',
  ].join(';');
  document.body.appendChild(title);

  let btns = [];
  function rebuild(zones) {
    for (const b of btns) b.remove();
    btns = zones.map((z) => {
      const b = document.createElement('button');
      b.textContent = z.label + (z.blocked ? ' ✋' : '');
      b.style.cssText = [
        'min-width:74px', 'height:60px', 'border-radius:14px', 'border:none',
        `background:${z.blocked ? 'rgba(255,91,91,0.9)' : 'rgba(96,255,160,0.92)'}`,
        'color:#12131a', 'font-size:17px', 'font-weight:800',
        'font-family:system-ui,sans-serif', 'touch-action:manipulation', 'cursor:pointer',
        'box-shadow:0 2px 10px rgba(0,0,0,0.4)',
      ].join(';');
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        controls.chooseAttack(z);
        hide();
      });
      wrap.appendChild(b);
      return b;
    });
  }

  let shownKey = '';
  function show(zones) {
    // 只在區塊組合變化時重建（省 DOM）
    const key = zones.map((z) => z.key + z.blocked).join(',');
    if (key !== shownKey) { shownKey = key; rebuild(zones); }
    wrap.style.display = 'flex';
    title.style.display = 'block';
  }
  function hide() {
    wrap.style.display = 'none';
    title.style.display = 'none';
    shownKey = '';
  }

  return { show, hide };
}
