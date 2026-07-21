// 組裝層：固定步長累積器（模擬）＋ requestAnimationFrame（畫面，不鎖幀）
// 架構鐵律：模擬（src/sim）只在 while 迴圈裡以 SIM_DT 推進；render 讀插值結果，兩者完全脫鉤
import { SIM_DT, MAX_FRAME_DELTA } from './sim/constants.js';
import { createWorld, stepWorld } from './sim/world.js';
import { getQuality, describeQuality } from './render/quality.js';
import { createRenderer, createScene, createCamera, createLights, bindResize } from './render/scene.js';
import { createCourt } from './render/court.js';
import { createPlayers } from './render/players.js';
import { createBallView } from './render/ballView.js';
import { createCameraControls } from './input/cameraControls.js';
import { createHud } from './ui/hud.js';

async function init() {
  const quality = getQuality();
  const container = document.getElementById('app');
  const loadingEl = document.getElementById('loading');

  const renderer = createRenderer(container, quality);
  const scene = createScene();
  const camera = createCamera();
  createLights(scene, quality);
  createCourt(scene, quality);
  const ballView = createBallView(scene, quality);
  const controls = createCameraControls(camera, renderer.domElement);
  bindResize(renderer, camera);
  const hud = createHud(document.getElementById('hud'), renderer, describeQuality(quality));

  let players;
  try {
    players = await createPlayers(scene, quality);
  } catch (err) {
    loadingEl.textContent = `模型載入失敗：${err.message ?? err}`;
    hud.error(`模型載入失敗（${quality.model}）`);
    players = { count: 0, update() {} };
  }
  if (players.count > 0) loadingEl.remove();

  const world = createWorld();
  // 偵錯把手：供自動化測試與真機除錯檢視執行期狀態（不參與遊戲邏輯）
  window.__phase0 = { world, renderer, scene, camera, quality };
  let last = performance.now();
  let accumulator = 0;

  // 分頁切回時重設時鐘，避免一次灌入巨量 delta
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) last = performance.now();
  });

  function frame(now) {
    requestAnimationFrame(frame);

    let delta = (now - last) / 1000;
    last = now;
    if (delta > MAX_FRAME_DELTA) delta = MAX_FRAME_DELTA;
    if (delta < 0) delta = 0;

    // 固定步長推進模擬（60Hz 恆定，與畫面幀率無關）
    accumulator += delta;
    let simSteps = 0;
    while (accumulator >= SIM_DT) {
      stepWorld(world);
      accumulator -= SIM_DT;
      simSteps += 1;
    }

    // 畫面層：插值讀取模擬狀態＋純視覺動畫
    ballView.sync(world.ball, accumulator / SIM_DT);
    players.update(delta);
    controls.update();
    renderer.render(scene, camera);
    hud.frame(now, delta, simSteps);
  }
  requestAnimationFrame(frame);
}

init();

// PWA service worker（僅存在於 vite 建置環境；測試直接 import sim 模組不經過這裡）
if ('serviceWorker' in navigator) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => { /* dev 模式無 SW，忽略 */ });
}
