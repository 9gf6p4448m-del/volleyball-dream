// 喊球鈕（觸控用；桌機另有空白鍵）：按一下＝「這球我的！」隊友退讓
export function createCallButton(onCall) {
  const btn = document.createElement('button');
  btn.textContent = '我的!';
  btn.style.cssText = [
    'position:fixed',
    'right:calc(env(safe-area-inset-right, 0px) + 18px)',
    'bottom:calc(env(safe-area-inset-bottom, 0px) + 18px)',
    'width:72px', 'height:72px', 'border-radius:50%', 'border:none',
    'background:rgba(255,140,66,0.85)', 'color:#1c2230',
    'font-size:18px', 'font-weight:700', 'font-family:system-ui,sans-serif',
    'z-index:16', 'touch-action:manipulation', 'cursor:pointer',
    'box-shadow:0 2px 10px rgba(0,0,0,0.4)',
  ].join(';');
  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); // 不透傳給球場（喊球不是蓄力）
    onCall();
    btn.style.transform = 'scale(0.9)';
    setTimeout(() => { btn.style.transform = 'scale(1)'; }, 120);
  });
  document.body.appendChild(btn);
  return btn;
}
