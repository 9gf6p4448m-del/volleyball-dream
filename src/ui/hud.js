// FPS/效能 HUD：FPS、render 更新率（幀時間）、模擬步率、三角形數、draw calls
export function createHud(el, renderer, settingsText) {
  const safeSettings = escapeHtml(settingsText);
  let frames = 0;
  let msSum = 0;
  let steps = 0;
  let lastReport = performance.now();

  el.innerHTML = `
    <div class="fps">— <span>FPS</span></div>
    <div class="stats">量測中…</div>
    <div class="settings">${safeSettings}</div>
  `;
  const fpsEl = el.querySelector('.fps');
  const statsEl = el.querySelector('.stats');

  return {
    frame(now, delta, simSteps) {
      frames += 1;
      msSum += delta * 1000;
      steps += simSteps;

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

      frames = 0;
      msSum = 0;
      steps = 0;
      lastReport = now;
    },
    error(message) {
      statsEl.textContent = `錯誤：${message}`;
    },
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
