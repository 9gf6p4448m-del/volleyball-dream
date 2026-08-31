// 真實感卷 批2：鷹眼貼線複審演出（純表現層，R2-4）
// sim 的判定就是真值——本演出**永遠維持原判**（R2-1），演的是轉播儀式不是改判賭局
// （卷宗有記：本遊戲沒有判決挑戰機制，「L 改判」是防守指令覆寫，別搞混）。
// 點擊卡片本身＝跳過（R2-2）：不掛全域 pointerdown＝不干擾發球蓄力等既有輸入。
import { COURT } from '../sim/constants.js';

// 【試玩必調】貼線門檻/演出長度/每局上限
export const HAWKEYE = { nearM: 0.3, durMs: 2400, maxPerSet: 2, verdictAtMs: 1100 };

// 純函式（R2-1 判定）：落點＋界內外真值 → 要不要演＋離線距離。
// dist＝到最近界線的距離（界內＝內側距離、界外＝出界量），貼線帶內才演。
export function hawkeyeCallOf(at, isIn, nearM = HAWKEYE.nearM) {
  if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.z)) return null;
  const overX = Math.abs(at.x) - COURT.WIDTH / 2;
  const overZ = Math.abs(at.z) - COURT.LENGTH / 2;
  const dist = isIn ? Math.min(-overX, -overZ) : Math.max(overX, overZ);
  if (!(dist >= 0) || dist > nearM) return null;
  return { verdict: isIn ? 'IN' : 'OUT', dist };
}

const STYLE_ID = 'vd-hawkeye-style';
function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
@keyframes vdHawkIn { 0% { opacity: 0; transform: translateY(-14px) scale(0.94); }
  100% { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes vdHawkVerdict { 0% { opacity: 0; transform: scale(1.6); }
  60% { opacity: 1; transform: scale(0.95); } 100% { opacity: 1; transform: scale(1); } }
.vd-hawk-wrap { position: fixed; top: max(12px, env(safe-area-inset-top, 0)); left: 50%;
  transform: translateX(-50%); z-index: 22; animation: vdHawkIn 0.3s ease-out both;
  cursor: pointer; font-family: var(--vd-font-zh, system-ui, sans-serif); }
.vd-hawk-card { padding: 10px 14px 12px; display: flex; flex-direction: column; gap: 6px;
  align-items: center; }
.vd-hawk-tag { color: var(--vd-gold, #ffd166); letter-spacing: 0.3em; text-indent: 0.3em;
  font-size: 11px; font-weight: 700; }
.vd-hawk-canvas { border-radius: 4px; display: block; }
.vd-hawk-verdict { position: absolute; inset: 0; display: flex; align-items: center;
  justify-content: center; font-weight: 900; font-size: 34px; letter-spacing: 0.2em;
  text-indent: 0.2em; opacity: 0; text-shadow: 0 2px 10px rgba(0,0,0,0.8); }
.vd-hawk-verdict.on { animation: vdHawkVerdict 0.35s ease-out both; }
`;
  document.head.appendChild(st);
}

// 俯視落點放大圖：貼線區域＋球印橢圓（canvas 一次畫成，不逐幀重繪）
function drawZoom(canvas, at, verdict) {
  const W = 190;
  const H = 150;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const SCALE = 110; // px / m（視窗約 1.7m 寬——鷹眼特寫）
  // 以落點為中心的世界→畫布轉換（x 沿橫、z 沿縱，取局部即可）
  const toX = (wx) => W / 2 + (wx - at.x) * SCALE;
  const toY = (wz) => H / 2 + (wz - at.z) * SCALE;
  ctx.fillStyle = '#20293d'; // 場外
  ctx.fillRect(0, 0, W, H);
  // 場內地板（依落點在哪個象限畫出界內側）
  ctx.fillStyle = '#3d5a75';
  const inX0 = toX(-COURT.WIDTH / 2);
  const inX1 = toX(COURT.WIDTH / 2);
  const inY0 = toY(-COURT.LENGTH / 2);
  const inY1 = toY(COURT.LENGTH / 2);
  ctx.fillRect(Math.max(0, inX0), Math.max(0, inY0),
    Math.min(W, inX1) - Math.max(0, inX0), Math.min(H, inY1) - Math.max(0, inY0));
  // 界線（邊線/底線靠近的都會進畫面）
  ctx.fillStyle = '#f5f1e8';
  const lw = COURT.LINE_WIDTH * 2 * SCALE;
  for (const lx of [-COURT.WIDTH / 2, COURT.WIDTH / 2]) {
    const px = toX(lx);
    if (px > -lw && px < W + lw) ctx.fillRect(px - lw / 2, 0, lw, H);
  }
  for (const lz of [-COURT.LENGTH / 2, COURT.LENGTH / 2]) {
    const py = toY(lz);
    if (py > -lw && py < H + lw) ctx.fillRect(0, py - lw / 2, W, lw);
  }
  // 球印：接觸橢圓（鷹眼招牌畫面）＋外圈
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.fillStyle = verdict === 'IN' ? 'rgba(120,220,150,0.92)' : 'rgba(235,120,110,0.92)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.11 * SCALE, 0.085 * SCALE, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.13 * SCALE, 0.1 * SCALE, 0.4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// 顯示複審卡：自動播畢或點卡片即收；回傳 { dispose }
export function showHawkeye({ at, verdict }) {
  ensureStyle();
  const el = document.createElement('div');
  el.className = 'vd-hawk-wrap';
  el.innerHTML = `
    <div class="vd-hawk-card vd-panel-gold">
      <div class="vd-hawk-tag">🎯 HAWK-EYE 鷹眼複審</div>
      <div style="position:relative">
        <canvas class="vd-hawk-canvas"></canvas>
        <div class="vd-hawk-verdict" style="color:${verdict === 'IN' ? '#78dc96' : '#eb786e'}">${verdict}</div>
      </div>
    </div>`;
  drawZoom(el.querySelector('canvas'), at, verdict);
  let gone = false;
  const dispose = () => {
    if (gone) return;
    gone = true;
    el.remove();
  };
  el.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); dispose(); });
  const vEl = el.querySelector('.vd-hawk-verdict');
  setTimeout(() => { if (!gone) vEl.classList.add('on'); }, HAWKEYE.verdictAtMs);
  setTimeout(dispose, HAWKEYE.durMs);
  document.body.appendChild(el);
  return { dispose };
}
