// 組裝層：入口路由（生涯選單/快速比賽/bench 基準）＋比賽三段編排（Phase 3 W1 拆分）
// 比賽本體：src/app/matchConfig（賽前設定，純函式）→ matchStage（舞台建置）
// → matchLoop（回合迴圈）→ matchCareer（賽末收束）。本檔只負責把三段接起來。
// 預設＝生涯入口；?quick=1 直達單場；?mode=bench 保留 Phase 0 基準測試場景
import { SIM_DT, MAX_FRAME_DELTA } from './sim/constants.js';
import { createWorld, stepWorld } from './sim/world.js';
import { createGame } from './sim/game.js';
import { createAiState } from './sim/ai.js';
import { getQuality, describeQuality } from './render/quality.js';
import { createRenderer, createScene, createCamera, createLights, bindResize } from './render/scene.js';
import { createCourt } from './render/court.js';
import { createArena } from './render/arena.js';
import { createPlayers } from './render/players.js';
import { createBallView } from './render/ballView.js';
import { createCameraControls } from './input/cameraControls.js';
import { createHud } from './ui/hud.js';
import { createCareerScreen } from './ui/careerScreen.js';
import { createCareerStore } from './career/careerStore.js';
import { ensureStarterRoster } from './career/roster.js';
import { resolveMatchConfig, resolveTechGates } from './app/matchConfig.js';
import { buildMatchStage } from './app/matchStage.js';
import { startMatchLoop } from './app/matchLoop.js';
import { markMatchStarted } from './app/matchCareer.js';

const PLAYER_ID = 'A2'; // 開局受控者；全隊輪控會依球權自動切換（07-21 Sawmah 拍板）

async function init() {
  // 遊戲頁禁右鍵選單與 iOS 捏合縮放（長按/拖曳是遊戲操作，不能跳原生 UI）
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  const params = new URLSearchParams(window.location.search);
  const quality = getQuality();
  const container = document.getElementById('app');
  const loadingEl = document.getElementById('loading');

  const renderer = createRenderer(container, quality);
  const scene = createScene();
  const camera = createCamera();
  const lights = createLights(scene, quality);
  const court = createCourt(scene, quality);
  createArena(scene); // 夜賽場館：看台/觀眾/廣告板（純視覺）
  const ballView = createBallView(scene, quality);
  bindResize(renderer, camera);
  // HUD：預設極簡（小 FPS 角標）；?hud=1 或 bench 基準場景＝完整偵錯資訊
  const fullHud = params.get('hud') === '1' || params.get('mode') === 'bench';
  const hud = createHud(document.getElementById('hud'), renderer, describeQuality(quality), fullHud);

  const ctx = { renderer, scene, camera, quality, ballView, hud, loadingEl, params, court, lights };
  if (params.get('mode') === 'bench') {
    await runBench(ctx);
  } else if (params.get('quick') === '1') {
    await runMatch(ctx, null); // 快速比賽直達（測試腳本/舊連結用）
  } else {
    showCareerEntry(ctx); // Phase 2 預設入口：生涯畫面（選單/賽程）
  }
}

// Phase 2 生涯入口；比賽局終回寫結果後以 ?career=resume 導回賽程視圖
function showCareerEntry(ctx) {
  ctx.loadingEl.remove();
  const store = createCareerStore();
  const screen = createCareerScreen(store, {
    onQuick: () => { runMatch(ctx, null); },
    onPlay: ({ career, player, matchEntry }) => {
      // W2：出戰前補齊/讀取名冊（空名冊一次性升級），隊友屬性由名冊驅動
      runMatch(ctx, { store, career, player, matchEntry, roster: ensureStarterRoster(store) });
    },
  });
  const resume = ctx.params.get('career') === 'resume' && store.hasSave();
  screen.show(resume ? 'career' : 'home');
}

// ---- 比賽模式（三段編排；細節在 src/app/*）----

async function runMatch(ctx, careerCtx = null) {
  // 賽前準備①：設定解析（種子/模式/生涯建隊/情蒐帶——純函式，node 可測）
  const config = resolveMatchConfig({
    params: ctx.params,
    careerCtx,
    randomSeed: Date.now() % 1000000007, // 開局隨機（快速比賽）；隨機化住在 main（sim 外）
  });
  // 拍板 07-22：開賽即落 pending 標記——中途退出回生涯畫面＝記棄賽敗（堵 reload 白嫖）
  if (careerCtx) markMatchStarted(careerCtx);
  const game = createGame(config.gameOptions);
  const aiState = createAiState();
  // 賽前準備②：技術閘門與讀攔網檔位（開場讀一次，場中不變）
  const gates = resolveTechGates(game, PLAYER_ID, !!careerCtx);
  // 賽前準備③：舞台建置（three.js 視圖＋DOM UI）
  const stage = await buildMatchStage({ ctx, config, gates, playerId: PLAYER_ID, game });
  // 回合迴圈開機（局終由 matchCareer.settleCareerMatch 收束）
  startMatchLoop({ ctx, config, gates, stage, careerCtx, playerId: PLAYER_ID, game, aiState });
}

// ---- Phase 0 基準測試模式（?mode=bench，保留降規測試基準）----

async function runBench(ctx) {
  const { renderer, scene, camera, quality, ballView, hud, loadingEl } = ctx;

  const controls = createCameraControls(camera, renderer.domElement);
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
  window.__phase0 = { world, renderer, scene, camera, quality };
  let last = performance.now();
  let accumulator = 0;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) last = performance.now();
  });

  function frame(now) {
    requestAnimationFrame(frame);
    let delta = (now - last) / 1000;
    last = now;
    if (delta > MAX_FRAME_DELTA) delta = MAX_FRAME_DELTA;
    if (delta < 0) delta = 0;

    accumulator += delta;
    let simSteps = 0;
    while (accumulator >= SIM_DT) {
      stepWorld(world);
      accumulator -= SIM_DT;
      simSteps += 1;
    }

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
// autoUpdate 的更新在「下次重整」才生效＝玩家永遠慢一版；改為新 SW 接管瞬間
// 自動重載一次拿到最新版。只在載入初期（<15s）重載——絕不打斷進行中的比賽
if ('serviceWorker' in navigator) {
  let swRefreshed = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (swRefreshed || performance.now() > 15000) return;
    swRefreshed = true;
    window.location.reload();
  });
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => { /* dev 模式無 SW，忽略 */ });
}
