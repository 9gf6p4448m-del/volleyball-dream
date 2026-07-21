// 通用決策面板：攻擊選區／發球選區／攔網選線共用（同一套點按語言）
// items: [{ key, label, color?('green'|'red'|'neutral') }]；點選回呼 onChoose(item)
const COLORS = {
  green: 'rgba(96,255,160,0.92)',
  red: 'rgba(255,91,91,0.9)',
  neutral: 'rgba(200,214,235,0.92)',
};

export function createZonePanel() {
  const wrap = document.createElement('div');
  wrap.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:calc(env(safe-area-inset-bottom, 0px) + 90px)',
    'transform:translateX(-50%)', 'z-index:18', 'display:none',
    'gap:10px', 'flex-wrap:wrap', 'justify-content:center', 'max-width:92vw',
  ].join(';');
  document.body.appendChild(wrap);

  const title = document.createElement('div');
  title.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:calc(env(safe-area-inset-bottom, 0px) + 168px)',
    'transform:translateX(-50%)', 'z-index:18', 'display:none',
    'color:#ffd166', 'font-family:system-ui,sans-serif', 'font-size:18px', 'font-weight:700',
    'text-shadow:0 2px 6px rgba(0,0,0,0.7)', 'pointer-events:none',
  ].join(';');
  document.body.appendChild(title);

  let btns = [];
  let shownKey = '';

  function rebuild(items, onChoose) {
    for (const b of btns) b.remove();
    btns = items.map((it) => {
      const b = document.createElement('button');
      b.textContent = it.label;
      b.style.cssText = [
        'min-width:74px', 'height:60px', 'border-radius:14px', 'border:none',
        `background:${COLORS[it.color ?? 'neutral']}`,
        'color:#12131a', 'font-size:17px', 'font-weight:800',
        'font-family:system-ui,sans-serif', 'touch-action:manipulation', 'cursor:pointer',
        'box-shadow:0 2px 10px rgba(0,0,0,0.4)',
      ].join(';');
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        onChoose(it);
        hide();
      });
      wrap.appendChild(b);
      return b;
    });
  }

  function show(titleText, items, onChoose) {
    title.textContent = titleText;
    const key = titleText + items.map((i) => i.key + (i.color ?? '')).join(',');
    if (key !== shownKey) {
      shownKey = key;
      rebuild(items, onChoose);
    }
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
