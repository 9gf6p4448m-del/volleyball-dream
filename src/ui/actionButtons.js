// NBA2K 式動作按鈕（右側直欄）：主動作鈕（標籤隨情境變）＋攔網鈕
// 主動作：按住＝蓄力（扣球情境＝起跳）、從鈕上拖出＝瞄準方向、放開＝出手
const LABELS = {
  serve: '發球', spike: '扣球', set: '舉球', receive: '墊球', block: '攔網',
};

export function createActionButtons(controls) {
  const main = makeButton('墊球', 92, 'rgba(110,231,255,0.9)', 108);
  const block = makeButton('攔網', 64, 'rgba(238,242,250,0.85)', 214);

  let dragging = null;
  main.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    try { main.setPointerCapture(e.pointerId); } catch { /* 合成事件無實體指標，忽略 */ }
    dragging = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
    controls.beginAction();
  });
  main.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    controls.dragAction(e.clientX - dragging.ox, e.clientY - dragging.oy);
  });
  const endMain = (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    dragging = null;
    controls.endAction();
  };
  main.addEventListener('pointerup', endMain);
  main.addEventListener('pointercancel', endMain);

  block.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    controls.pressBlock();
    block.style.transform = 'scale(0.9)';
    setTimeout(() => { block.style.transform = 'scale(1)'; }, 120);
  });

  return {
    // 每幀更新主鈕標籤（情境即語意，玩家一眼知道這顆現在是什麼）
    update(context) {
      const label = LABELS[context] ?? '墊球';
      if (main.textContent !== label) main.textContent = label;
    },
  };
}

function makeButton(text, size, bg, bottomOffset) {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.style.cssText = [
    'position:fixed',
    'right:calc(env(safe-area-inset-right, 0px) + 18px)',
    `bottom:calc(env(safe-area-inset-bottom, 0px) + ${bottomOffset}px)`,
    `width:${size}px`, `height:${size}px`, 'border-radius:50%', 'border:none',
    `background:${bg}`, 'color:#1c2230',
    `font-size:${Math.round(size * 0.24)}px`, 'font-weight:700',
    'font-family:system-ui,sans-serif',
    'z-index:16', 'touch-action:none', 'cursor:pointer', 'user-select:none',
    'box-shadow:0 2px 10px rgba(0,0,0,0.4)',
  ].join(';');
  document.body.appendChild(btn);
  return btn;
}
