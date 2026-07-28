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
import { createSlotStoreProxy } from './career/careerStore.js';
import { RIVAL_TEAM_ID } from './career/schedule.js';
import { opponentById } from './career/opponents.js';
import { ENGINEERED_OPEN } from './career/positionFlags.js';
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
  // 夜賽場館（W4 Q10 三館制：預設常規館；開賽時依賽制切館）
  const arena = createArena(scene);
  const ballView = createBallView(scene, quality);
  bindResize(renderer, camera);
  // HUD：預設極簡（小 FPS 角標）；?hud=1 或 bench 基準場景＝完整偵錯資訊
  const fullHud = params.get('hud') === '1' || params.get('mode') === 'bench';
  const hud = createHud(document.getElementById('hud'), renderer, describeQuality(quality), fullHud);

  const ctx = { renderer, scene, camera, quality, ballView, hud, loadingEl, params, court, lights, arena };
  if (params.get('mode') === 'bench') {
    await runBench(ctx);
  } else if (params.get('quick') === '1') {
    await runMatch(ctx, null); // 快速比賽直達（測試腳本/舊連結用）
  } else {
    showCareerEntry(ctx); // Phase 2 預設入口：生涯畫面（選單/賽程）
  }
}

// Phase 2 生涯入口；比賽局終回寫結果後以 ?career=resume&slot=N 導回賽程視圖
async function showCareerEntry(ctx) {
  ctx.loadingEl.remove();
  // 4.6 試玩輔助 `?debugVault=1`：記憶體假存檔（三年打完＋典藏牆四槽有料），
  // **不碰 localStorage 的真實存檔**——進去直接按「▶ 生涯結算」就能驗典藏牆與重演舞台
  if (ctx.params.get('debugVault') === '1') {
    const { buildVaultDemoStore } = await import('./app/debugVault.js');
    const demo = { ...buildVaultDemoStore(), useSlot() {} };
    const demoScreen = createCareerScreen(demo, {
      primeSlot: () => {},
      onQuick: (role = null) => { runMatch(ctx, null, role); },
      onPlay: ({ career, player, matchEntry, resumeMid = null }) => {
        runMatch(ctx, {
          store: demo, career, player, matchEntry, roster: ensureStarterRoster(demo),
          lineup: demo.loadLineup(), seasonIndex: demo.seasonIndex?.() ?? 1, resumeMid,
        });
      },
    });
    demoScreen.show('career');
    return;
  }
  // W4(P4) 題2 多槽：可切槽代理——選檔頁 useSlot 重綁，careerScreen 內部零改動
  const store = createSlotStoreProxy();
  // W3(P4) 甲4 驗收完結（07-27 Sawmah 拍板）：已驗訖位置回填至 open
  // （ready→open 兩段合法轉移、冪等；上架版語意＝四位置恆開放）。
  // W4 起搬到「選定槽」時執行（per-slot 寫入；未選槽不寫檔——空槽不留骨架）。
  // ?openPosition= 手批入口保留給未來新位置的驗收流程（守衛不動）
  const primeSlot = () => {
    for (const p of ENGINEERED_OPEN) {
      store.markPositionReady(p);
      store.approveOpenPosition(p);
    }
    const openPos = ctx.params.get('openPosition');
    if (openPos) {
      const wanted = openPos === 'all'
        ? ['setter', 'middle', 'opposite', 'libero']
        : openPos.split(',');
      for (const p of wanted) store.approveOpenPosition(p.trim());
    }
  };
  const screen = createCareerScreen(store, {
    primeSlot,
    // W3(P4)：快速比賽＝位置遊樂場——careerScreen 選位面板傳 role（null＝OH 現況）
    onQuick: (role = null) => { runMatch(ctx, null, role); },
    onPlay: ({ career, player, matchEntry, resumeMid = null }) => {
      // W2：出戰前補齊/讀取名冊（空名冊一次性升級），隊友屬性由名冊驅動
      // W3：ensureStarterRoster 一併補齊 lineup；先發輪轉序由 save.lineup 驅動建隊
      const roster = ensureStarterRoster(store);
      // W1(P4)：seasonIndex 供對手 ace 畢業遞補換算（careerMatchSetup 第 6 參數）
      // W4(P4) Q8：resumeMid＝局間存檔續玩（game 直接吃快照、跳過情蒐帶）
      runMatch(ctx, {
        store, career, player, matchEntry, roster,
        lineup: store.loadLineup(), seasonIndex: store.seasonIndex?.() ?? 1,
        resumeMid,
      });
    },
  });
  // 賽末返回：?slot=N 指回打球的那個槽（缺省＝槽 1，涵蓋 W4 前的舊返回連結）
  if (ctx.params.get('career') === 'resume') {
    const slotParam = Number.parseInt(ctx.params.get('slot'), 10);
    const slot = Number.isFinite(slotParam) && slotParam >= 1 && slotParam <= 3 ? slotParam : 1;
    store.useSlot(slot);
    primeSlot();
    screen.show(store.hasSave() ? 'career' : 'home');
    return;
  }
  screen.show('home');
}

// ---- 比賽模式（三段編排；細節在 src/app/*）----

async function runMatch(ctx, careerCtx = null, quickRole = null) {
  // 賽前準備①：設定解析（種子/模式/生涯建隊/情蒐帶——純函式，node 可測）
  const config = resolveMatchConfig({
    params: ctx.params,
    careerCtx,
    quickRole, // W3(P4) 快速比賽選位置（生涯場恆 null）
    randomSeed: Date.now() % 1000000007, // 開局隨機（快速比賽）；隨機化住在 main（sim 外）
  });
  // W4(P4) Q10 三館制：依賽制切館（bo5 冠軍館／bo3 關鍵戰館／bo1 常規館）＋地板換色。
  // 主客場氛圍：關鍵戰館打宿敵（天鷹）＝客隊橫幅＋客隊應援區＋音場偏對手；冠軍館＝中立場
  const bestOf = config.gameOptions.series?.bestOf ?? 1;
  const venueKey = bestOf >= 5 ? 'final' : bestOf === 3 ? 'key' : 'regular';
  const rival = venueKey === 'key' && careerCtx?.matchEntry?.opponentId === RIVAL_TEAM_ID
    ? opponentById(RIVAL_TEAM_ID)
    : null;
  const venueSpec = ctx.arena.setVenue(
    venueKey, rival ? { awayBanner: { name: rival.name, color: '#7db2ff' } } : {},
  );
  ctx.court.setFloorPalette(venueSpec.floor);
  config.venue = { key: venueKey, rivalAway: !!rival }; // matchLoop：應援偏向＋冠軍館燈光秀
  // 拍板 07-22：開賽即落 pending 標記——中途退出回生涯畫面＝記棄賽敗（堵 reload 白嫖）
  if (careerCtx) markMatchStarted(careerCtx);
  // W4(P4) Q8 局間存檔續玩：整包 sim state 快照直接當 game 開機（phase='set_break'
  // ＝從局間 huddle 前恢復；決定論等價由 tests/match-sets 背書）；情蒐帶不重播
  const resumeMid = careerCtx?.resumeMid ?? null;
  const game = resumeMid ? resumeMid.game : createGame(config.gameOptions);
  if (resumeMid) config.tapeClips = [];
  const aiState = createAiState();
  // 賽前準備②：技術閘門與讀攔網檔位（開場讀一次，場中不變）；
  // ?hints=off：想裸讀攔網的人強制 readTier='none'（取代已移除的 👁 提示手動開關）
  const gates = resolveTechGates(game, PLAYER_ID, !!careerCtx, ctx.params.get('hints') === 'off');
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
