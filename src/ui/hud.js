// FPS/效能 HUD。預設極簡：只留一枚小 FPS 角標（偵錯全文擋遊玩視野）；
// ?hud=1 或 bench 模式＝完整偵錯資訊（幀時間/模擬步率/三角形/draw calls）
import { createFpsSummary } from './fpsSummary.js';

export function createHud(el, renderer, settingsText, full = false) {
  const safeSettings = escapeHtml(settingsText);
  let frames = 0;
  let msSum = 0;
  let steps = 0;
  let lastReport = performance.now();

  if (!full) el.classList.add('hud-min');
  el.innerHTML = `
    <div class="fps">— <span>FPS</span></div>
    <div class="stats">${full ? '量測中…' : ''}</div>
    <div class="real-summary"></div>
    <div class="settings">${safeSettings}</div>
  `;
  const fpsEl = el.querySelector('.fps');
  const statsEl = el.querySelector('.stats');
  const realEl = el.querySelector('.real-summary');

  // 進賽場卷 2A B11：寫實模式 FPS 摘要（平均／最低＋目前面數）——分格/排除規則全在
  // fpsSummary.js（零 DOM 依賴、可單元測試）；這裡只負責每幀餵資料與更新畫面文字。
  const fpsSummary = createFpsSummary();
  let served = false;
  let realMode = false;
  let lastFaces = null;

  return {
    // realInfo：{ hidden, faces }｜null——非 null 才視為寫實模式，才顯示平均/最低摘要
    frame(now, delta, simSteps, realInfo = null) {
      frames += 1;
      msSum += delta * 1000;
      steps += simSteps;
      if (realInfo) {
        realMode = true;
        fpsSummary.frame(delta * 1000, !!realInfo.hidden, served);
        if (realInfo.faces != null) lastFaces = realInfo.faces;
      }

      const elapsed = now - lastReport;
      if (elapsed < 500) return;

      const secs = elapsed / 1000;
      const fps = Math.round(frames / secs);
      const avgMs = frames > 0 ? (msSum / frames).toFixed(1) : '—';
      const simHz = Math.round(steps / secs);
      const info = renderer.info.render;

      fpsEl.innerHTML = `${fps} <span>FPS</span>`;
      statsEl.textContent =
        `render ${avgMs} ms/幀 · sim ${simHz} Hz（固定60）\n` +
        `三角形 ${info.triangles.toLocaleString()} · draw calls ${info.calls}\n` +
        `dpr ${renderer.getPixelRatio().toFixed(2)} · ${renderer.domElement.width}×${renderer.domElement.height}`;

      if (realMode) {
        const { avg, min } = fpsSummary.summary();
        const fmt = (x) => (x == null ? '—' : x.toFixed(1));
        realEl.textContent = `寫實 平均 ${fmt(avg)} · 最低 ${fmt(min)} FPS · ${(lastFaces ?? 0).toLocaleString()} 面`;
      }

      frames = 0;
      msSum = 0;
      steps = 0;
      lastReport = now;
    },
    // 進賽場卷 2A B11：本場第一個 SERVE 事件時呼叫一次（matchLoop.js）——只有發球後
    // 的格子才計入平均／最低（見 fpsSummary.js）。重複呼叫安全（冪等）。
    markServed() { served = true; },
    // 治具讀值（機械驗收 B11 用；同 window.__phase1 既有偵錯把手慣例）
    fpsSummaryStats() { return fpsSummary.summary(); },
    error(message) {
      statsEl.classList.add('hud-error'); // 極簡模式也要浮出錯誤（不能無聲吞掉）
      statsEl.textContent = `錯誤：${message}`;
    },
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
