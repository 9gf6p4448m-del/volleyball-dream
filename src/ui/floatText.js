// 浮動字卡（Perfect!、回放中…）：畫面中下方彈出、上浮淡出
// W6.1 疊排（拍板 07-24 Q1-P1）：原版無佇列——連續字卡釘同座標完全重合疊字；
// 改為新卡進場時把在場舊卡各上推一格（transition 順勢補間），越舊越高、各自倒數消失
const STACK_STEP = 48; // 舊卡上推格距（px）
export function createFloatText() {
  const live = []; // 在場字卡 [{ el, lift }]
  return {
    show(text, color = '#60ffa0', durMs = 900) {
      for (const c of live) {
        c.lift += STACK_STEP;
        c.el.style.transform = `translateX(-50%) translateY(${-60 - c.lift}px)`;
      }
      const el = document.createElement('div');
      el.textContent = text;
      el.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:30%', 'z-index:20',
        'transform:translateX(-50%)',
        `color:${color}`, 'font-family:system-ui,sans-serif',
        'font-size:34px', 'font-weight:800', 'letter-spacing:2px',
        'text-shadow:0 2px 8px rgba(0,0,0,0.6)',
        'pointer-events:none', 'user-select:none',
        'transition:transform 0.8s ease-out, opacity 0.8s ease-out',
        'opacity:1',
      ].join(';');
      document.body.appendChild(el);
      const card = { el, lift: 0 };
      live.push(card);
      requestAnimationFrame(() => {
        el.style.transform = `translateX(-50%) translateY(${-60 - card.lift}px)`;
        el.style.opacity = '0';
      });
      setTimeout(() => {
        el.remove();
        const i = live.indexOf(card);
        if (i >= 0) live.splice(i, 1);
      }, durMs);
    },
  };
}
