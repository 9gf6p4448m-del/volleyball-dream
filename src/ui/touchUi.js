// 觸控操作視覺回饋：虛擬搖桿（按哪出現在哪）＋蓄力圈（跟手指、隨蓄力充填）
// 純 DOM 疊層，讀 matchControls.uiState()，不碰 sim
const KNOB_TRAVEL = 40; // 搖桿頭最大位移（px）

export function createTouchUi() {
  const base = circle(96, 'rgba(238,242,250,0.12)', '2px solid rgba(238,242,250,0.35)');
  const knob = circle(44, 'rgba(238,242,250,0.45)', 'none');
  const ring = document.createElement('div');
  ring.style.cssText = fixedStyle(76);
  ring.style.borderRadius = '50%';
  ring.style.border = '4px solid rgba(110,231,255,0.25)';
  document.body.append(base, knob, ring);

  return {
    update(ui) {
      if (ui.joystick) {
        const j = ui.joystick;
        const len = Math.hypot(j.dx, j.dy) || 1;
        const cl = Math.min(len, KNOB_TRAVEL);
        place(base, j.ox, j.oy);
        place(knob, j.ox + (j.dx / len) * cl, j.oy + (j.dy / len) * cl);
      } else {
        hide(base);
        hide(knob);
      }

      if (ui.charge) {
        const c = ui.charge;
        place(ring, c.x, c.y);
        // 出手品質表（2K 式）：藍＝蓄力中、綠＝甜蜜區（放開最準）、紅＝超蓄（會飄）
        const p = Math.min(c.progress, 1);
        const rgb = c.over ? '255,91,91' : c.sweet ? '96,255,160' : '110,231,255';
        ring.style.borderColor = `rgba(${rgb},${0.4 + p * 0.6})`;
        ring.style.borderWidth = c.sweet ? '6px' : '4px';
        ring.style.transform = `translate(-50%,-50%) scale(${1 + p * 0.35})`;
      } else {
        hide(ring);
      }
    },
  };
}

function circle(size, bg, border) {
  const el = document.createElement('div');
  el.style.cssText = fixedStyle(size);
  el.style.borderRadius = '50%';
  el.style.background = bg;
  if (border !== 'none') el.style.border = border;
  return el;
}

function fixedStyle(size) {
  return [
    'position:fixed', 'left:0', 'top:0', `width:${size}px`, `height:${size}px`,
    'transform:translate(-50%,-50%)', 'pointer-events:none', 'z-index:15',
    'display:none',
  ].join(';');
}

function place(el, x, y) {
  el.style.display = 'block';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

function hide(el) {
  el.style.display = 'none';
}
