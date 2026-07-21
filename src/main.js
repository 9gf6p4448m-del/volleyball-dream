// 組裝層：固定步長累積器（模擬）＋ requestAnimationFrame（畫面，不鎖幀）
// 架構鐵律：模擬（src/sim）只在 while 迴圈裡以 SIM_DT 推進；render 讀插值結果，兩者完全脫鉤
// 預設＝Phase 1 比賽模式；?mode=bench 保留 Phase 0 基準測試場景（真機降規測試基準）
import { SIM_DT, MAX_FRAME_DELTA } from './sim/constants.js';
import { createWorld, stepWorld } from './sim/world.js';
import { createGame, stepGame } from './sim/game.js';
import { createAiState, aiCollectIntents } from './sim/ai.js';
import { predictLanding } from './sim/flight.js';
import { landedCourtTeam } from './sim/rotation.js';
import { serverId } from './sim/match.js';
import { getQuality, describeQuality } from './render/quality.js';
import { createRenderer, createScene, createCamera, createLights, bindResize } from './render/scene.js';
import { createCourt } from './render/court.js';
import { createPlayers } from './render/players.js';
import { createMatchView } from './render/matchView.js';
import { createBallView } from './render/ballView.js';
import { createCameraRig } from './render/cameraRig.js';
import { createCameraControls } from './input/cameraControls.js';
import { createMatchControls } from './input/matchControls.js';
import { createAimMarker } from './render/aimMarker.js';
import { createHud } from './ui/hud.js';
import { createScoreboard } from './ui/scoreboard.js';
import { createSfx } from './ui/sfx.js';
import { createTouchUi } from './ui/touchUi.js';
import { createActionButtons } from './ui/actionButtons.js';
import { showTutorialOnce } from './ui/tutorial.js';

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
  createLights(scene, quality);
  createCourt(scene, quality);
  const ballView = createBallView(scene, quality);
  bindResize(renderer, camera);
  const hud = createHud(document.getElementById('hud'), renderer, describeQuality(quality));

  const ctx = { renderer, scene, camera, quality, ballView, hud, loadingEl, params };
  if (params.get('mode') === 'bench') {
    await runBench(ctx);
  } else {
    await runMatch(ctx);
  }
}

// ---- Phase 1 比賽模式 ----

async function runMatch(ctx) {
  const { renderer, scene, camera, quality, ballView, hud, loadingEl, params } = ctx;

  const seedParam = Number.parseInt(params.get('seed'), 10);
  let seed = Number.isFinite(seedParam) ? seedParam : 20260721;
  // 快速局預設 15 分（?points=25 打正式局；deuce 規則不變）
  const pointsParam = Number.parseInt(params.get('points'), 10);
  const setTarget = Number.isFinite(pointsParam)
    ? Math.min(Math.max(pointsParam, 5), 25)
    : 15;

  let game = createGame({ seed, setTarget });
  let aiState = createAiState();

  let matchView;
  try {
    // ?pose=bump|overhead|spike|block|serve：強制循環播放單一姿勢（調角度用）
    matchView = await createMatchView(scene, quality, game, PLAYER_ID, params.get('pose'));
  } catch (err) {
    loadingEl.textContent = `模型載入失敗：${err.message ?? err}`;
    hud.error(`模型載入失敗（${quality.model}）`);
    matchView = { count: 0, sync() {} };
  }
  if (matchView.count > 0) loadingEl.remove();

  const rig = createCameraRig(camera, PLAYER_ID);
  const controls = createMatchControls(renderer.domElement, camera, PLAYER_ID, rig);
  const scoreboard = createScoreboard(PLAYER_ID);
  const sfx = createSfx();
  const touchUi = createTouchUi();
  const actionButtons = createActionButtons(controls); // 主動作鈕＋攔網鈕（桌機＝J/K）
  const aimMarker = createAimMarker(scene); // 琥珀色＝你的瞄準點
  // 操作輔助（?assist=off 關閉）：青色圈＝來球預測落點（僅顯示落在我方半場的）
  const assistOn = params.get('assist') !== 'off';
  const landingMarker = createAimMarker(scene, 0x6ee7ff, 0.6);
  let assistFlight = -1;
  let assistLanding = null;
  showTutorialOnce();

  // 局終點擊 → 換種子再開一局
  window.addEventListener('pointerdown', () => {
    if (game.phase !== 'set_over') return;
    seed += 1;
    game = createGame({ seed, setTarget });
    aiState = createAiState();
    controlledId = PLAYER_ID;
    switchKey = '';
    controls.setPlayerId(PLAYER_ID);
    rig.setPlayerId(PLAYER_ID);
    matchView.setControlled(PLAYER_ID);
    window.__phase1.game = game;
    window.__phase1.aiState = aiState;
  });

  // VCR 資料底（Phase 2 回放用）：每球錄「發球前快照＋整球 Intent 流」
  // 決定論保證：快照＋同序 Intent 重新模擬＝逐格重現
  let vcrCurrent = { snapshot: null, steps: [] };
  let vcrLast = null;

  // 控制模式：預設固定主攻手（07-21 Sawmah 試玩後定案）；?teamcontrol=1 開全隊輪控實驗
  const teamControl = params.get('teamcontrol') === '1';
  let controlledId = PLAYER_ID;
  let switchKey = '';
  let lastWindupFlight = -1; // AI 攻擊手起跳動畫：每個 flight 只播一次
  function desiredControlled() {
    if (game.phase === 'serve') {
      return game.match.servingTeam === 'A' ? serverId(game.match) : controlledId;
    }
    if (game.phase !== 'rally') return controlledId;
    const claim = aiState.claimId;
    if (claim && game.players[claim].teamId === 'A') return claim; // 球歸誰誰上
    if (game.rally.possession === 'B') {
      // 對方持球：控最靠近球的前排（攔網位）
      const rot = game.match.rotations.A;
      let best = rot[1];
      for (const id of [rot[1], rot[2], rot[3]]) {
        if (Math.abs(game.actors[id].x - game.ball.x) <
            Math.abs(game.actors[best].x - game.ball.x)) best = id;
      }
      return best;
    }
    return controlledId;
  }
  function syncControlled() {
    if (!teamControl) return; // 固定主攻手模式
    const key = `${game.phase}:${game.rally.flightId}:${aiState.claimId ?? ''}`;
    if (key === switchKey) return;
    switchKey = key;
    const want = desiredControlled();
    if (want !== controlledId) {
      controlledId = want;
      controls.setPlayerId(want);
      rig.setPlayerId(want);
      matchView.setControlled(want);
    }
  }

  // 偵錯把手：供自動化測試與真機除錯檢視執行期狀態（不參與遊戲邏輯）
  window.__phase1 = {
    game, aiState, renderer, scene, camera, quality, rig,
    vcr: () => vcrLast,          // 上一球的回放資料
    controlled: () => controlledId, // 當前受控球員（輪控除錯）
  };

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
    const frameEvents = [];
    while (accumulator >= SIM_DT) {
      // 每球開錄：發球佈陣完成、尚未錄過 → 快照當下狀態
      if (game.phase === 'serve' && vcrCurrent.snapshot === null) {
        vcrCurrent.snapshot = structuredClone({ ...game, events: [] });
      }
      // 先依球權決定受控者（固定模式下不動），再收集 Intent
      syncControlled();
      // Intent 管線：玩家與 11 個 AI 同型、同一條管線；sim 不知來源
      const intents = [
        ...controls.collect(game, aiState),
        ...aiCollectIntents(game, aiState, [controlledId]),
      ];
      if (vcrCurrent.snapshot) vcrCurrent.steps.push({ tick: game.tick, intents });
      const events = stepGame(game, intents);
      frameEvents.push(...events);
      // 死球＝一球結束：本球錄影歸檔、開新錄影
      if (events.some((e) => e.type === 'DEAD_BALL')) {
        vcrLast = vcrCurrent;
        vcrCurrent = { snapshot: null, steps: [] };
      }
      accumulator -= SIM_DT;
      simSteps += 1;
    }
    if (frameEvents.length > 0) {
      sfx.onEvents(frameEvents);
      controls.onEvents(frameEvents); // 出手成功 → 清出手緩衝
    }

    // 操作輔助：來球落點圈（每個 flight 只預測一次，唯讀取用 sim 純函式）
    if (assistOn && game.phase === 'rally') {
      if (assistFlight !== game.rally.flightId) {
        assistFlight = game.rally.flightId;
        assistLanding = predictLanding(game.ball);
      }
      if (assistLanding && assistLanding.z > 0) {
        // 紅圈＝預測出界（別碰它！）；青圈＝界內來球
        const isOut = landedCourtTeam(assistLanding.x, assistLanding.z) === null;
        landingMarker.setColor(isOut ? 0xff5b5b : 0x6ee7ff);
        landingMarker.show(assistLanding);
      } else landingMarker.hide();
    } else {
      landingMarker.hide();
    }
    // 「這球歸你」：AI 呼叫鎖定指到受控者 → 光圈變橘＋提示
    const myBall = game.phase === 'rally' && aiState.claimId === controlledId;
    matchView.setHot(myBall);
    // 玩家放開起跳／點攔網 → 立即播動作（後續由 sim 事件接手）
    if (controls.consumeJumpSignal()) matchView.triggerPose(controlledId, 'windup');
    if (controls.consumeBlockSignal()) matchView.triggerPose(controlledId, 'block');
    // AI 攻擊手「先跳後揮」：第三擊球下墜接近攻擊手時先播起跳引臂（觸球才揮臂）
    if (game.phase === 'rally' && game.rally.touches === 2 && aiState.claimId &&
        aiState.claimId !== controlledId && aiState.flightId !== lastWindupFlight) {
      const atk = game.actors[aiState.claimId];
      const b = game.ball;
      if (b.vy < 0 && b.y < 3.6 && Math.hypot(b.x - atk.x, b.z - atk.z) < 2.2) {
        lastWindupFlight = aiState.flightId;
        matchView.triggerPose(aiState.claimId, 'windup');
      }
    }

    const alpha = accumulator / SIM_DT;
    ballView.sync(game.ball, alpha);
    matchView.sync(game, alpha, delta, frameEvents);
    rig.update(game, alpha);
    scoreboard.update(game, myBall, controlledId);
    actionButtons.update(controls.currentContext());
    touchUi.update(controls.uiState());
    const aimAt = controls.currentAimPoint();
    if (aimAt) aimMarker.show(aimAt);
    else aimMarker.hide();
    renderer.render(scene, camera);
    hud.frame(now, delta, simSteps);
  }
  requestAnimationFrame(frame);
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
if ('serviceWorker' in navigator) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => { /* dev 模式無 SW，忽略 */ });
}
