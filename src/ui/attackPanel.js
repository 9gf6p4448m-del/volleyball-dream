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

  // 提示關閉時的中性色（不透露攔網）
  const NEUTRAL = 'rgba(200,214,235,0.92)';

  let btns = [];
  function rebuild(zones, showHints) {
    for (const b of btns) b.remove();
    btns = zones.map((z) => {
      const b = document.createElement('button');
      b.textContent = showHints ? z.label + (z.blocked ? ' ✋' : '') : z.label;
      const bg = showHints
        ? (z.blocked ? 'rgba(255,91,91,0.9)' : 'rgba(96,255,160,0.92)')
        : NEUTRAL;
      b.style.cssText = [
        'min-width:74px', 'height:60px', 'border-radius:14px', 'border:none',
        `background:${bg}`,
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
  function show(zones, showHints = true) {
    title.textContent = showHints ? '選攻擊區！' : '看攔網、選攻擊區！';
    // 只在區塊組合或提示模式變化時重建（省 DOM）
    const key = (showHints ? 'H' : 'N') + zones.map((z) => z.key + z.blocked).join(',');
    if (key !== shownKey) { shownKey = key; rebuild(zones, showHints); }
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
