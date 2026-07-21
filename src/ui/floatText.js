// 浮動字卡（Perfect!、回放中…）：畫面中下方彈出、上浮淡出
export function createFloatText() {
  return {
    show(text, color = '#60ffa0', durMs = 900) {
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
      requestAnimationFrame(() => {
        el.style.transform = 'translateX(-50%) translateY(-60px)';
        el.style.opacity = '0';
      });
      setTimeout(() => el.remove(), durMs);
    },
  };
}
