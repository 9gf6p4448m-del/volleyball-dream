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
import {
  devSeedRequest, buildSyntheticSave, devUniRequest, advanceToUniYear,
  devCorpRequest, advanceToCorp, devProRequest, advanceToPro,
  devForeignRequest, advanceToForeign,
} from './career/devSeed.js';
import { RIVAL_TEAM_ID } from './career/schedule.js';
import { opponentName } from './career/careerState.js';
import { kitAccentColor, cssColor } from './career/teamKit.js';
import { ENGINEERED_OPEN } from './career/positionFlags.js';
import { ensureStarterRoster } from './career/roster.js';
import { practiceMatchEntry } from './career/practiceMatch.js';
import { resolveMatchConfig, resolveTechGates } from './app/matchConfig.js';
import { buildMatchStage } from './app/matchStage.js';
import { startMatchLoop } from './app/matchLoop.js';
import { markMatchStarted } from './app/matchCareer.js';

const PLAYER_ID = 'A2'; // 開局受控者；全隊輪控會依球權自動切換（07-21 Sawmah 拍板）

// 2026-08-24：真機（尤其 standalone PWA）拿不到 console 時的唯一診斷管道——
// 任何未捕捉錯誤直接蓋一層文字疊層畫在螢幕上，不再無聲吞掉變成空白畫面。
function showFatalError(err) {
  // Safari 的 .stack 只有 call frame、不含錯誤訊息本身（跟 V8 不同）——
  // 訊息與 stack 要分開組，只看 .stack 會漏看到底哪個錯誤（08-24 實測踩過）。
  const header = err?.name || err?.message
    ? `${err.name ?? 'Error'}: ${err.message ?? ''}`
    : String(err);
  // ★ 音訊錯誤永不致死（2026-08-28 真機事故）★ 本遊戲零音檔、所有聲音都是可有可無
  // 的合成音效——音訊裝置起不來（iOS 講完電話/LINE 語音後的暫時狀態）最壞就是沒聲音。
  // sfx.js 的 ensure 已在源頭包好，這裡是效果層的最後防線：未來任何音訊路徑漏接，
  // 也不准把還在跑的遊戲蓋上全螢幕死屏（那次畫面全黑，其實比賽還在底下跑）。
  if (/audio/i.test(header)) { console.warn('[audio-nonfatal]', header); return; }
  const msg = err?.stack ? `${header}\n${err.stack}` : header;
  let el = document.getElementById('fatal-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fatal-error';
    el.style.cssText = 'position:fixed;inset:0;z-index:999;background:#1c2230;'
      + 'color:#ff8a8a;font:12px/1.5 ui-monospace,Consolas,monospace;padding:16px;'
      + 'overflow:auto;white-space:pre-wrap;';
    document.body.appendChild(el);
  }
  el.textContent += `${el.textContent ? '\n\n' : ''}${msg}`;
}
window.addEventListener('error', (e) => showFatalError(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => showFatalError(e.reason));

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
  } else if (params.get('devkit') === '1') {
    // 配色卷批 1 治具：?devkit=1 全隊球衣預覽（16 隊卡片＋3D 舞台）——
    // 題 3 色票裁定工具兼驗收 K6 量測工具；動態載入，不進正常路徑的 bundle 熱路
    const { runKitPreview } = await import('./render/kitPreview.js');
    runKitPreview(ctx);
  } else if (params.get('net') === '1') {
    // 多人連線卷 批3：貼碼連線 lobby → 兩端同 seed 同建隊開賽（動態載入不進單機熱路）
    ctx.loadingEl.remove();
    const { showNetLobby } = await import('./ui/netLobby.js');
    // 批5：生涯隊伍匯出 provider——讀目前存檔槽（槽 1 預設；?slot= 可指定），
    // 沒存檔／建不出來回 null（lobby 把「我的生涯隊伍」鈕反灰）。只讀不寫。
    const { exportNetTeam } = await import('./career/netExport.js');
    const careerTeam = () => {
      try {
        const slotParam = Number.parseInt(ctx.params.get('slot'), 10);
        const store = createSlotStoreProxy();
        if (Number.isFinite(slotParam)) store.useSlot(slotParam);
        const player = store.loadPlayer();
        if (!player) return null;
        const roster = ensureStarterRoster(store);
        return exportNetTeam({ player, members: roster?.members ?? [], lineup: store.loadLineup() });
      } catch {
        return null; // 存檔殘缺＝視同沒有，不擋標準隊路徑
      }
    };
    showNetLobby(ctx, {
      careerTeam,
      onStart: (netStart) => {
        // ★ 同步先攔訊息進緩衝 ★ 對方可能在本機 runMatch 的動態載入空窗（幾百 ms）
        // 就開始送 input——打在 lobby 舊 handler 上會被靜默丟掉，鎖步從此缺前幾格
        // 永遠等不齊。bindMatch 接手時先補放緩衝再上線。
        const buffered = [];
        netStart.handlers.onMessage = (m) => buffered.push(m);
        netStart.buffered = buffered;
        runMatch(ctx, null, null, netStart);
      },
    });
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
  // 大學卷治具（2026-08-14）：?devseed=<成績>&devslot=<1-3> 把合成的
  // 「剛打完高中三屆」存檔寫進**指定的槽**，免得為了測升學要真的打三年。
  // ★ 兩個參數缺一不啟動、且無預設槽 ★ 判定全在 devSeedRequest（單一真相源），
  // 這裡不再自己判一次——手滑的網址不得洗掉玩家的生涯。
  const devReq = devSeedRequest(ctx.params);
  if (devReq) {
    const synthetic = buildSyntheticSave({ finish: devReq.finish });
    if (synthetic) {
      store.useSlot(devReq.slot);
      store.seedWholeSave(synthetic);
      // 大二卷批 2：?devuni=<校id>:<年1-4> 治具跳年（走正式升學＋屆間推進鏈；
      // 參數不合法＝devUniRequest 回 null＝忽略，停在升學那一刻照舊）
      // 企業章批 2：?devcorp=<企業id> 治具入章（走正式升學→四年→謝幕→簽約鏈；
      // 與 devuni 同時出現時 devcorp 優先——它本來就包含跑完大學四年）
      // 職業章批 2：?devpro=<隊id> 治具入章（走正式企業季→結算→簽約鏈；
      // 與 devcorp/devuni 同時出現時 devpro 優先——它本來就包含跑完企業一季）
      // 國外聯賽卷批 2：?devforeign=<海外隊id> 治具入海外（走正式國內職業季→
      // 成就門檻→結算→轉隊鏈；與 devpro/devcorp/devuni 同時出現時 devforeign
      // 最優先——它本來就包含跑完一整季國內職業季）
      // ★優先序＝devforeign > devpro > devcorp > devuni★（包含關係由深到淺）
      const foreignReq = devForeignRequest(ctx.params);
      const proReq = devProRequest(ctx.params);
      const corpReq = devCorpRequest(ctx.params);
      const uniReq = devUniRequest(ctx.params);
      if (foreignReq) advanceToForeign(store, foreignReq);
      else if (proReq) advanceToPro(store, proReq);
      else if (corpReq) advanceToCorp(store, corpReq);
      else if (uniReq) advanceToUniYear(store, uniReq);
    }
  }
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
    // 練習賽卷（2026-08-12）：集訓面板的「🏐 紅白對抗賽」→ 開一場紅白賽。
    // 與 onPlay 同一條 runMatch，差別只有 ①matchEntry 是練習賽的（不在 schedule 裡）
    // ②多帶一個 practice 包（建隊換 practiceMatchSetup、賽末換 settlePracticeMatch）
    // 教學局（第一屆開場的隊內測試）走**同一個** onPractice——kickoff §二-2「一個機制、
    // 兩個掛點」：差別只有多帶一個 tutorial 旗標（逐步引導＋提前收局＋零獎勵）
    onPractice: ({ career, player, drills, seasonIndex, tutorial = false }) => {
      const roster = ensureStarterRoster(store);
      runMatch(ctx, {
        store, career, player, roster,
        matchEntry: practiceMatchEntry(seasonIndex),
        lineup: store.loadLineup(),
        seasonIndex,
        practice: { drills, seasonIndex, tutorial },
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

async function runMatch(ctx, careerCtx = null, quickRole = null, netStart = null) {
  // 賽前準備①：設定解析（種子/模式/生涯建隊/情蒐帶——純函式，node 可測）
  const config = resolveMatchConfig({
    params: ctx.params,
    careerCtx,
    quickRole, // W3(P4) 快速比賽選位置（生涯場恆 null）
    net: netStart ? { seed: netStart.seed, roles: netStart.roles, teams: netStart.teams ?? null } : null, // 批3/5 連線對戰
    randomSeed: Date.now() % 1000000007, // 開局隨機（快速比賽）；隨機化住在 main（sim 外）
  });
  // 批3 連線對戰：本機玩家＝自己那隊的受控者；鎖步核心與 transport 掛進 config.net
  let netPlayerId = null;
  if (netStart) {
    const { createLockstep } = await import('./net/lockstep.js');
    const otherSlot = netStart.slot === 'A' ? 'B' : 'A';
    netPlayerId = config.netPids[netStart.slot];
    config.net = {
      api: netStart.api,
      lockstep: createLockstep({ delay: netStart.delay, localSlot: netStart.slot }),
      remotePid: config.netPids[otherSlot],
      // matchLoop 開機時把訊息路由從 lobby 轉到比賽（input 進鎖步、斷線走提示）
      bindMatch: ({ onInput, onGone }) => {
        const route = (m) => {
          if (m.y === 'input') onInput({ t: m.t, f: m.f });
          else if (m.y === 'bye') onGone('bye');
          // 'ready' 與其他型別＝握手殘響，比賽期間直接忽略
        };
        netStart.handlers.onMessage = route;
        for (const m of netStart.buffered ?? []) route(m); // 補放空窗期間的緩衝
        netStart.buffered = null;
        netStart.handlers.onClose = (reason) => onGone(reason);
      },
    };
  }
  // W4(P4) Q10 三館制：依賽制切館（bo5 冠軍館／bo3 關鍵戰館／bo1 常規館）＋地板換色。
  const bestOf = config.gameOptions.series?.bestOf ?? 1;
  const venueKey = bestOf >= 5 ? 'final' : bestOf === 3 ? 'key' : 'regular';
  // 音場偏向宿敵／冠軍館燈光秀專用旗標（matchLoop 消費）——與下面客隊應援色分開判定，
  // 這條敘事旗標本卷不動：仍限「宿敵×關鍵戰館」
  const rivalAway = venueKey === 'key' && careerCtx?.matchEntry?.opponentId === RIVAL_TEAM_ID;
  // 隊伍配色卷批 3 B5：客隊應援色不再限宿敵關鍵戰館——任何生涯對手（快速比賽無
  // careerCtx、練習賽 opponentId 恆 null，兩者天然落空、看台回落既有氛圍盤，不炸）
  // 皆吃 kitFor(oppDef) 的 banner??jersey；同一色源＝careerMatchSetup 已算好的
  // config.kits.B（不再另呼叫 kitFor/opponentById，兩處各自實作會走岔），
  // kitAccentColor 與 B2/B3 對陣色條/賽程色塊共用同一份回退序（banner→jersey→fallback）
  const awayOpponentId = careerCtx?.matchEntry?.opponentId ?? null;
  const awayBanner = awayOpponentId
    ? { name: opponentName(awayOpponentId), color: cssColor(kitAccentColor(config.kits?.B, 0x5a7dd8)) }
    : null;
  const venueSpec = ctx.arena.setVenue(venueKey, {
    ...(awayBanner ? { awayBanner } : {}),
    // 配色卷階段二 E4：現在的隊名（常規館「★ 主場之夜」看板用）——config.teamName
    // 由 matchConfig.currentTeamName 算好，這裡只負責遞
    ...(config.teamName ? { teamName: config.teamName } : {}),
  });
  ctx.court.setFloorPalette(venueSpec.floor);
  config.venue = { key: venueKey, rivalAway }; // matchLoop：應援偏向＋冠軍館燈光秀
  // 拍板 07-22：開賽即落 pending 標記——中途退出回生涯畫面＝記棄賽敗（堵 reload 白嫖）
  // ★ 練習賽不落 pending ★ 它不在 career.schedule 裡，`resolveForfeit` 會拿這個 id
  // 去 `recordResult` 而當場 throw（「賽程裡沒有比賽 practice-2」）——而且練習賽
  // 本來就不該有棄賽敗這種東西（不記戰績）
  if (careerCtx && !careerCtx.practice) markMatchStarted(careerCtx);
  // W4(P4) Q8 局間存檔續玩：整包 sim state 快照直接當 game 開機（phase='set_break'
  // ＝從局間 huddle 前恢復；決定論等價由 tests/match-sets 背書）；情蒐帶不重播
  const resumeMid = careerCtx?.resumeMid ?? null;
  const game = resumeMid ? resumeMid.game : createGame(config.gameOptions);
  if (resumeMid) config.tapeClips = [];
  const aiState = createAiState();
  // 賽前準備②：技術閘門與讀攔網檔位（開場讀一次，場中不變）；
  // ?hints=off：想裸讀攔網的人強制 readTier='none'（取代已移除的 👁 提示手動開關）
  const activePid = netPlayerId ?? PLAYER_ID; // 批3：連線＝控自己那隊的人（客機在 B 隊）
  const gates = resolveTechGates(game, activePid, !!careerCtx, ctx.params.get('hints') === 'off');
  // 賽前準備③：舞台建置（three.js 視圖＋DOM UI）
  const stage = await buildMatchStage({ ctx, config, gates, playerId: activePid, game });
  // 回合迴圈開機（局終由 matchCareer.settleCareerMatch 收束）
  startMatchLoop({ ctx, config, gates, stage, careerCtx, playerId: activePid, game, aiState });
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

init().catch(showFatalError);

// PWA service worker（僅存在於 vite 建置環境；測試直接 import sim 模組不經過這裡）
// autoUpdate 的更新在「下次重整」才生效＝玩家永遠慢一版；改為新 SW 接管瞬間
// 自動重載一次拿到最新版。只在載入初期（<15s）重載——絕不打斷進行中的比賽
if ('serviceWorker' in navigator) {
  // 2026-08-24：全新安裝（無舊 controller）不得重載——當下載入的本來就是最新版，
  // 重載沒有任何好處，只有「三D場景/生涯選單初始化中途被打斷」的風險。
  // standalone PWA（尤其 iOS 剛裝到主畫面首次開啟）疑似卡在這條路徑上（空白畫面
  // 只剩 FPS 角標）——這段只該在「真的有舊版本被取代」時才觸發。
  const hadController = !!navigator.serviceWorker.controller;
  let swRefreshed = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || swRefreshed || performance.now() > 15000) return;
    swRefreshed = true;
    window.location.reload();
  });
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => { /* dev 模式無 SW，忽略 */ });
}
