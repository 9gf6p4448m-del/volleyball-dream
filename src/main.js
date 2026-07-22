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
import { createZonePanel } from './ui/zonePanel.js';
import { createFloatText } from './ui/floatText.js';
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

  // 簡化操作模式（預設）：接發/舉球/防守/走位/發球全自動，玩家只做進攻決策（讀攔網選攻擊區）
  // ?classic=1 回到全手動操作
  const simpleMode = params.get('classic') !== '1';

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
  // 簡化模式：決策面板（攻擊/發球/攔網共用）；經典模式：全手動按鈕
  const panel = simpleMode ? createZonePanel() : null;
  const actionButtons = simpleMode ? null : createActionButtons(controls);
  let servedThisTurn = false; // 每個發球回合只處理一次發球決策
  let whistledServe = false;  // 每個發球回合只吹一次發球前短哨

  // 讀攔網提示開關：開＝綠/紅標示（新手輔助）、關＝自己看攔網判斷（技術版）
  let showHints = true;
  try { showHints = localStorage.getItem('vd-hints') !== 'off'; } catch { /* 私密模式 */ }
  if (simpleMode) {
    const hintBtn = document.createElement('button');
    const paint = () => { hintBtn.textContent = showHints ? '👁 提示:開' : '👁 提示:關'; };
    hintBtn.style.cssText = [
      'position:fixed', 'top:calc(env(safe-area-inset-top, 0px) + 8px)',
      'right:calc(env(safe-area-inset-right, 0px) + 64px)',
      'height:44px', 'padding:0 12px', 'border-radius:22px', 'border:none',
      'background:rgba(12,16,26,0.6)', 'color:#eef2fa', 'font-size:14px',
      'font-family:system-ui,sans-serif', 'z-index:16', 'cursor:pointer',
      'touch-action:manipulation',
    ].join(';');
    paint();
    hintBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      showHints = !showHints;
      paint();
      try { localStorage.setItem('vd-hints', showHints ? 'on' : 'off'); } catch { /* ignore */ }
    });
    document.body.appendChild(hintBtn);
  }
  // 🎬 回放鈕：重看上一球的最後 3 秒（桌機 R 鍵）
  const replayBtn = document.createElement('button');
  replayBtn.textContent = '🎬';
  replayBtn.style.cssText = [
    'position:fixed', 'top:calc(env(safe-area-inset-top, 0px) + 8px)',
    'right:calc(env(safe-area-inset-right, 0px) + 12px)',
    'width:44px', 'height:44px', 'border-radius:50%', 'border:none',
    'background:rgba(12,16,26,0.6)', 'font-size:20px', 'z-index:16',
    'cursor:pointer', 'touch-action:manipulation',
  ].join(';');
  replayBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    startReplay();
  });
  document.body.appendChild(replayBtn);
  const aimMarker = createAimMarker(scene); // 琥珀色＝你的瞄準點（經典模式）
  // 操作輔助（?assist=off 關閉）：青色圈＝來球預測落點（僅顯示落在我方半場的）
  const assistOn = params.get('assist') !== 'off';
  const landingMarker = createAimMarker(scene, 0x6ee7ff, 0.6);
  let assistFlight = -1;
  let assistLanding = null;
  showTutorialOnce(simpleMode);

  // 局終點擊 → 換種子再開一局
  window.addEventListener('pointerdown', () => {
    if (game.phase !== 'set_over') return;
    seed += 1;
    game = createGame({ seed, setTarget });
    aiState = createAiState();
    controlledId = PLAYER_ID;
    switchKey = '';
    replay = null;
    vcrLast = null; // 換局清回放資料，避免新局第一分前播到上一局最後一球
    vcrCurrent = { snapshot: null, steps: [] };
    servedThisTurn = false;
    if (panel) panel.hide();
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
  // 打擊感（juice）：擊球定格、螢幕震動、重扣慢動作
  let hitStopUntil = 0;
  let slowUntil = 0;
  let shake = 0;
  const floatText = createFloatText();

  // VCR 回放：重播＝從快照重新模擬（決定論保證逐格一致）；只播最後 3 秒、半速
  let replay = null; // { state, steps, idx, acc }
  const REPLAY_TAIL = 180;   // 回放最後 180 tick（3 秒）
  const REPLAY_SPEED = 0.5;  // 半速
  function startReplay() {
    const rec = vcrLast;
    if (!rec || !rec.snapshot || rec.steps.length === 0 || replay) return;
    const state = structuredClone(rec.snapshot);
    // 快轉到尾段起點（不渲染），只播殺球/落地的關鍵 3 秒
    const startIdx = Math.max(0, rec.steps.length - REPLAY_TAIL);
    for (let i = 0; i < startIdx; i += 1) stepGame(state, rec.steps[i].intents);
    replay = { state, steps: rec.steps, idx: startIdx, acc: 0 };
    floatText.show('🎬 回放', '#ffd166', 1200);
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR') startReplay(); // 桌機 R＝回放上一球
  });
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
    // 蓄力中不切人：切了會清掉這次蓄力、玩家放開時靜默無回饋（延後到蓄力結束）
    if (controls.isCharging()) return;
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

    // 🎬 回放模式：凍結現場，半速重播上一球尾段（重新模擬＝逐格一致）
    if (replay) {
      replay.acc += delta * REPLAY_SPEED;
      while (replay.acc >= SIM_DT && replay.idx < replay.steps.length) {
        stepGame(replay.state, replay.steps[replay.idx].intents);
        replay.idx += 1;
        replay.acc -= SIM_DT;
      }
      const rAlpha = Math.min(replay.acc / SIM_DT, 1);
      ballView.sync(replay.state.ball, rAlpha, delta);
      matchView.sync(replay.state, rAlpha, delta, []);
      aimMarker.hide();
      landingMarker.hide();
      camera.position.set(0, 12, 12.5);
      camera.lookAt(0, 0.6, 0);
      renderer.render(scene, camera);
      hud.frame(now, delta, 0);
      if (panel) panel.hide();
      if (replay.idx >= replay.steps.length) replay = null; // 播完回現場
      return;
    }

    // 簡化模式：進攻決策——輪到玩家扣球且球還在空中→彈面板、時間放慢給你讀攔網選區
    let deciding = false;
    if (simpleMode) {
      // 進攻時刻＝切攻擊手視角越過網看攔網（讀攔網要看得清）
      rig.setAttackView(controls.isAttackMoment(game));
      const zones = controls.attackZones(game);
      // ①進攻決策：球正下墜、可決策高度、尚未選區
      const attackDeciding =
        !!zones && game.ball.vy < 0 && game.ball.y > 2.0 && !controls.attackPending();
      // ②攔網決策：對方第三擊將至、我在前排、尚未選線
      const defendDeciding =
        controls.isDefendMoment(game, aiState) && !controls.blockPlanPending() &&
        game.ball.vy < 0 && game.ball.y > 2.0;
      // ③發球決策：發球員是受控玩家本人（AI 隊友發球自動）、哨音已過、尚未選
      const serveDeciding =
        game.phase === 'serve' && serverId(game.match) === controlledId &&
        game.tick >= game.serveReadyTick && !servedThisTurn;
      if (game.phase !== 'serve') servedThisTurn = false;
      // 發球前短哨（裁判示意發球）：每個發球回合一次
      if (game.phase === 'serve' && game.tick >= game.serveReadyTick && !whistledServe) {
        whistledServe = true;
        sfx.whistle(200);
      }
      if (game.phase !== 'serve') whistledServe = false;

      deciding = attackDeciding || defendDeciding; // 攻/防決策窗＝時間放慢
      if (attackDeciding) {
        panel.show(
          showHints ? '選攻擊區！' : '看攔網、選攻擊區！',
          zones.map((z) => ({
            key: z.key,
            label: showHints ? z.label + (z.blocked ? ' ✋' : '') : z.label,
            color: showHints ? (z.blocked ? 'red' : 'green') : 'neutral',
            zone: z,
          })),
          (it) => controls.chooseAttack(it.zone),
        );
      } else if (defendDeciding) {
        const opts = controls.blockOptions(game, aiState);
        if (opts) {
          panel.show(
            '他要扣了——封哪條線？',
            opts.map((o) => ({ key: o.key, label: o.label, color: 'neutral', opt: o })),
            (it) => controls.chooseBlock(it.opt),
          );
        }
      } else if (serveDeciding) {
        panel.show(
          '選發球目標！',
          controls.serveZones(game).map((z) => ({ key: z.key, label: z.label, color: 'neutral', zone: z })),
          (it) => {
            controls.serveNow(game, it.zone.aim);
            servedThisTurn = true;
          },
        );
      } else {
        panel.hide();
      }
    }

    // 擊球定格（hit-stop）：短暫凍結模擬推進、畫面照跑——打擊的「頓」感
    if (now < hitStopUntil) delta = 0;
    // 進攻決策窗＝放慢給玩家讀攔網選區（時間膨脹只作用推進率，決定論不碰）
    else if (deciding) delta *= 0.4;
    // 重扣慢動作：定格後 0.4 秒半速
    else if (now < slowUntil) delta *= 0.35;

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
      // juice：重扣/攔網定格＋震動、死球大震（殺球落地的重量感）
      for (const e of frameEvents) {
        if (e.type === 'TOUCH' && e.kind === 'spike') {
          hitStopUntil = now + ((e.power ?? 1) >= 0.7 ? 70 : 40);
          if ((e.power ?? 1) >= 0.7) slowUntil = now + 450; // 重扣＝定格接慢動作
          shake = Math.max(shake, 0.12);
        } else if (e.type === 'BLOCK_TOUCH') {
          hitStopUntil = now + 60;
          shake = Math.max(shake, 0.2);
        } else if (e.type === 'DEAD_BALL') {
          shake = Math.max(shake, 0.26);
          if (e.reason === 'POSITIONAL_FAULT') floatText.show('站位犯規!');
        } else if (e.type === 'SCORE') {
          // 得分慶祝：得分隊全員雙手高舉小跳（情緒節拍）
          for (const id of game.match.rotations[e.team]) {
            matchView.triggerPose(id, 'cheer');
          }
        } else if (e.type === 'TOUCH' && e.kind === 'receive' &&
            e.playerId === controlledId && (e.power ?? 0) >= 0.95) {
          floatText.show('PERFECT!'); // 球到瞬間出手的完美一傳
        }
      }
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
    ballView.sync(game.ball, alpha, delta);
    matchView.sync(game, alpha, delta, frameEvents);
    rig.update(game, alpha, delta);
    // 螢幕震動：鏡頭位置疊隨機偏移、指數衰減（表現層，不碰 sim）
    if (shake > 0.004) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake * 0.6;
      shake *= 0.82;
    }
    scoreboard.update(game, myBall, controlledId);
    if (actionButtons) actionButtons.update(controls.currentContext());
    touchUi.update(controls.uiState());
    const aimAt = simpleMode ? null : controls.currentAimPoint(game);
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
