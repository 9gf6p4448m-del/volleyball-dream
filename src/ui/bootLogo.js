// 大作感三卷 批3：發行商開場 logo——SAWMAH GAMES presents（純 DOM/CSS，K3-1）。
// 不阻塞開機（K3-2）：疊在 #loading(z-index:20) 之上（z-index:30），底下載入流程照跑；
// 自動播畢或點擊跳過即淡出移除（K3-1）；init 只呼叫一次＝一次開機只演一次。
// 建立失敗由呼叫端 try/catch 吞掉（K3-2 永不致死）。
export const LOGO_MS = 2600; // 【試玩必調】自動播畢時間（ms）
const FADE_MS = 320;

// 純函式（K3-4）：elapsed 未滿且未點擊→留（false）、滿或點擊→走（true）
export function logoDone(elapsedMs, clicked) {
  return !!clicked || elapsedMs >= LOGO_MS;
}

export function showBootLogo() {
  const el = document.createElement('div');
  el.id = 'vd-boot-logo';
  el.innerHTML = `<style>
#vd-boot-logo { position: fixed; inset: 0; z-index: 30; display: flex; flex-direction: column;
  align-items: center; justify-content: center; background: #0b0e1a; cursor: pointer;
  transition: opacity ${FADE_MS}ms ease-out; font-family: var(--vd-font-zh, system-ui, sans-serif); }
@keyframes vdBootIn {
  0% { opacity: 0; transform: translateY(14px); letter-spacing: 0.5em; }
  100% { opacity: 1; transform: translateY(0); letter-spacing: 0.22em; }
}
#vd-boot-logo .bl-name { color: var(--vd-gold, #ffd166); font-weight: 900;
  font-size: clamp(26px, 7.5vw, 52px); letter-spacing: 0.22em; text-indent: 0.22em;
  text-shadow: 0 0 30px rgba(255, 209, 102, 0.4); animation: vdBootIn 1.1s ease-out both; }
#vd-boot-logo .bl-sub { color: #eef2fa; opacity: 0; font-size: clamp(12px, 3vw, 16px);
  letter-spacing: 0.6em; text-indent: 0.6em; margin-top: 10px;
  animation: vdBootIn 0.8s 0.7s ease-out forwards; }
</style>
    <div class="bl-name">SAWMAH GAMES</div>
    <div class="bl-sub">PRESENTS</div>`;
  let gone = false;
  let clicked = false;
  const dismiss = () => {
    if (gone) return;
    gone = true;
    el.style.opacity = '0';
    setTimeout(() => el.remove(), FADE_MS);
  };
  el.addEventListener('pointerdown', () => { clicked = true; });
  const t0 = performance.now();
  const tick = () => {
    if (gone) return;
    if (logoDone(performance.now() - t0, clicked)) dismiss();
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  document.body.appendChild(el);
  return { el, dismiss };
}
