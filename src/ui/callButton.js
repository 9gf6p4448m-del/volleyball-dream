// W4(P4) 題5 — OPP「⚡跟上！」浮鈕：一傳起球瞬間浮現、0.8s 窗（拍板：輕量浮鈕
// 非暫停面板——沿 blockTap 語彙；OPP 是執行者，節奏語彙與指揮位面板區隔、不減速）
//
// ★ 位置體檢 2026-08-06 裁定 B1：參數化，讓 OH 的「切中路」共用同一支元件 ★
// 兩顆鈕的行為完全同型（浮現→0.8s 窗→點一下就收），差別只有字、位置、顏色 ⇒
// 複製第二份元件只會讓兩邊的樣式與競態處理各自漂移。
export function createCallButton({
  label = '⚡ 跟上！', bottom = '38%', color = '#ffd166', bg = 'rgba(40,34,14,0.92)',
} = {}) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.style.cssText = [
    'position:fixed', 'right:18px', `bottom:${bottom}`, 'z-index:22', 'display:none',
    'height:58px', 'padding:0 22px', 'border-radius:29px', `border:2px solid ${color}`,
    `background:${bg}`, `color:${color}`, 'font-size:18px', 'font-weight:900',
    'letter-spacing:2px', 'cursor:pointer', 'touch-action:manipulation',
    'font-family:system-ui,sans-serif', 'box-shadow:0 6px 24px rgba(0,0,0,0.5)',
    'animation:vd-call-pulse 0.4s ease-in-out infinite alternate',
  ].join(';');
  const style = document.createElement('style');
  style.textContent = '@keyframes vd-call-pulse { from { transform:scale(1); } to { transform:scale(1.07); } }';
  document.head.appendChild(style);
  document.body.appendChild(btn);

  let onTap = null;
  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const fn = onTap;
    btn.style.display = 'none';
    onTap = null;
    fn?.();
  });

  // ★ 2026-08-07 裁定 B：兩態鈕 ★ 同一顆鈕在窗內可以換面（例如內切鈕的
  // 「一般」與「球要給你了」）。用 `key` 做冪等閘＝逐 frame 呼叫也只在真的換態時
  // 碰 DOM；`null`／不呼叫＝維持建構時的樣式，因此 OPP 的「⚡跟上！」逐值不變。
  let variantKey = null;
  const applyVariant = (v) => {
    btn.textContent = v?.label ?? label;
    btn.style.color = v?.color ?? color;
    btn.style.background = v?.bg ?? bg;
    btn.style.borderColor = v?.border ?? v?.color ?? color;
  };

  return {
    show(handler) {
      onTap = handler;
      btn.style.display = 'block';
    },
    hide() {
      onTap = null;
      btn.style.display = 'none';
    },
    isVisible() {
      return btn.style.display !== 'none';
    },
    // v＝{ key, label, color, bg, border? }；傳 null 回到建構時的樣式
    setVariant(v) {
      const k = v?.key ?? null;
      if (k === variantKey) return;
      variantKey = k;
      applyVariant(v);
    },
  };
}
