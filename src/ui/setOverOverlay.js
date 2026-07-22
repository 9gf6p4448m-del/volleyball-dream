// 局終結算過場：勝負大字＋比分＋再來一局提示（pointer-events:none，
// 點擊重開仍由 main 的既有 handler 處理；本層純視覺淡入淡出）
export function createSetOverOverlay() {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:24', 'display:flex',
    'flex-direction:column', 'align-items:center', 'justify-content:center',
    'background:rgba(7,9,16,0.72)', 'pointer-events:none',
    'font-family:system-ui,sans-serif', 'text-align:center', 'user-select:none',
    'opacity:0', 'transition:opacity 0.45s ease', 'visibility:hidden',
  ].join(';');
  el.innerHTML = `
    <div class="title" style="font-size:52px;font-weight:900;letter-spacing:6px;
      text-shadow:0 4px 24px rgba(0,0,0,0.8)"></div>
    <div class="score" style="font-size:34px;font-weight:700;color:#eef2fa;margin-top:10px;
      letter-spacing:4px"></div>
    <div class="again" style="font-size:15px;color:#9fb0cc;margin-top:26px">點擊任意處再來一局</div>
  `;
  document.body.appendChild(el);
  const titleEl = el.querySelector('.title');
  const scoreEl = el.querySelector('.score');
  const againEl = el.querySelector('.again');

  return {
    // winner：'A'|'B'；playerTeam：玩家隊；hint：點擊提示（生涯模式覆寫為「返回生涯」）
    show(winner, score, playerTeam, hint) {
      const won = winner === playerTeam;
      againEl.textContent = hint ?? '點擊任意處再來一局';
      titleEl.textContent = won ? '🏆 你贏了這一局！' : '這局輸了…再來！';
      titleEl.style.color = won ? '#ffd166' : '#ff8a8a';
      scoreEl.textContent = `${score.A} : ${score.B}`;
      el.style.visibility = 'visible';
      requestAnimationFrame(() => { el.style.opacity = '1'; });
    },
    hide() {
      el.style.opacity = '0';
      setTimeout(() => { el.style.visibility = 'hidden'; }, 460);
    },
  };
}
