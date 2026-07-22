// 組裝層：固定步長累積器（模擬）＋ requestAnimationFrame（畫面，不鎖幀）
// 架構鐵律：模擬（src/sim）只在 while 迴圈裡以 SIM_DT 推進；render 讀插值結果，兩者完全脫鉤
// 預設＝Phase 1 比賽模式；?mode=bench 保留 Phase 0 基準測試場景（真機降規測試基準）
import { SIM_DT, MAX_FRAME_DELTA } from './sim/constants.js';
import { createWorld, stepWorld } from './sim/world.js';
import { createGame, stepGame } from './sim/game.js';
import { createAiState, aiCollectIntents } from './sim/ai.js';
import { predictLanding } from './sim/flight.js';
import { landedCourtTeam, isBackRow } from './sim/rotation.js';
import { serverId } from './sim/match.js';
import { getQuality, describeQuality } from './render/quality.js';
import { createRenderer, createScene, createCamera, createLights, bindResize } from './render/scene.js';
import { createCourt } from './render/court.js';
import { createArena } from './render/arena.js';
import { createPlayers } from './render/players.js';
import { createMatchView } from './render/matchView.js';
import { createBallView } from './render/ballView.js';
import { createCameraRig } from './render/cameraRig.js';
import { createCameraControls } from './input/cameraControls.js';
import { createMatchControls } from './input/matchControls.js';
import { createAimMarker } from './render/aimMarker.js';
import { createHud } from './ui/hud.js';
import { createScoreboard, setPointTeam } from './ui/scoreboard.js';
import { createCommentary } from './ui/commentary.js';
import { createSfx } from './ui/sfx.js';
import { createTouchUi } from './ui/touchUi.js';
import { createActionButtons } from './ui/actionButtons.js';
import { createZonePanel } from './ui/zonePanel.js';
import { createFloatText } from './ui/floatText.js';
import { createPointBanner, derivePointInfo } from './ui/pointBanner.js';
import { showTutorialOnce } from './ui/tutorial.js';
import { createSetOverOverlay } from './ui/setOverOverlay.js';
import { createCareerScreen } from './ui/careerScreen.js';
import { createCareerStore } from './career/careerStore.js';
import {
  matchSeed, careerMatchSetup, recordResult, mergeScouting, buildLibero,
} from './career/careerState.js';
import { buildScoutTape } from './career/scoutTape.js';
import { matchStatsFor, growthPointsFor, blockReadTier } from './career/growth.js';

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
      runMatch(ctx, { store, career, player, matchEntry });
    },
  });
  const resume = ctx.params.get('career') === 'resume' && store.hasSave();
  screen.show(resume ? 'career' : 'home');
}

// ---- Phase 1 比賽模式 ----

async function runMatch(ctx, careerCtx = null) {
  const { renderer, scene, camera, quality, ballView, hud, loadingEl, params, court, lights } = ctx;

  const seedParam = Number.parseInt(params.get('seed'), 10);
  // 種子優先序：?seed=（重現/測試）→ 生涯場次種子（生涯種子×場次 id 決定論導出）
  // → 開局隨機（快速比賽；sim 內部仍是決定論——同種子逐球重演）。隨機化住在 main（sim 外）
  let seed = Number.isFinite(seedParam) ? seedParam
    : careerCtx ? matchSeed(careerCtx.career, careerCtx.matchEntry.id)
      : (Date.now() % 1000000007);
  // 正式局預設 25 分（deuce 規則不變；?points= 仍可覆寫測試用短局）
  const pointsParam = Number.parseInt(params.get('points'), 10);
  const setTarget = Number.isFinite(pointsParam)
    ? Math.min(Math.max(pointsParam, 5), 25)
    : 25;

  // 簡化操作模式（預設）：接發/舉球/防守/走位/發球全自動，玩家只做進攻決策（讀攔網選攻擊區）
  // ?classic=1 回到全手動操作
  const simpleMode = params.get('classic') !== '1';

  // 生涯模式：玩家 Player 餵進 A 隊主攻手槽＋對手參數檔建隊與 AI 風格
  // （sim 不讀存檔——一律建隊參數注入）
  const careerSetup = careerCtx
    ? careerMatchSetup(careerCtx.career, careerCtx.player, careerCtx.matchEntry)
    : null;
  // stage 6：自由人雙方都有（生涯吃參數檔；快速比賽用預設防守專才）
  const liberos = careerSetup?.liberos ?? {
    A: buildLibero('A', 'A隊自由人'),
    B: buildLibero('B', 'B隊自由人'),
  };
  let game = createGame({
    seed, setTarget, liberos,
    ...(careerSetup ? {
      teams: careerSetup.teams,
      aiProfiles: careerSetup.aiProfiles,
      ...(careerSetup.scoutRead ? { scoutRead: careerSetup.scoutRead } : {}),
    } : {}),
  });
  let aiState = createAiState();

  // stage 5 情蒐錄影帶：賽前播對手預演的 2-3 球關鍵回放（決定論預生成；點擊跳過）
  const tapeClips = careerSetup
    ? buildScoutTape(seed, careerSetup.teams, careerSetup.aiProfiles, careerSetup.liberos)
    : [];
  let tapeIdx = 0;

  // stage 3 技術閘門：生涯未解鎖的決策選項不出現（快速比賽預設全開）；
  // 熟練度/能力只在開場讀一次——場中不變，決定論與 VCR 乾淨
  const tech = careerCtx ? (game.players[PLAYER_ID].techniques ?? {}) : null;
  const canTip = !tech || (tech.tip ?? 0) >= 1;
  const canPipe = !tech || (tech.pipe ?? 0) >= 1;
  const canJumpServe = !tech || (tech.jumpServe ?? 0) >= 1;
  const canFloatServe = !tech || (tech.floatServe ?? 0) >= 1;
  const canFeint = !tech || (tech.feint ?? 0) >= 1;
  const canDive = !tech || (tech.dive ?? 0) >= 1;
  let diveReady = false; // 魚躍鈕當幀可用性（Space 鍵共用判定）
  // 讀攔網提示檔位（reaction 綁定，決策第 4 題）：none＝無、slow＝0.6s 後上色、instant＝即時
  const readTier = careerCtx ? blockReadTier(game.players[PLAYER_ID]) : 'instant';
  let feintsUsedThisMatch = 0; // 假動作熟練度：場終一次累積寫回 Player
  let attackDecidingSince = -1; // slow 檔的上色計時起點
  let slowEaseFrom = -1e9; // 決策窗結束時刻（時間膨脹 0.4→1.0 緩出的起點）

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
  const controls = createMatchControls(renderer.domElement, camera, PLAYER_ID, rig, simpleMode);
  const scoreboard = createScoreboard(PLAYER_ID);
  // 即時播報（決策模式）：取代舊版操作提示行；classic 走 scoreboard 內建舊提示
  const commentary = simpleMode ? createCommentary(careerSetup?.opponent ?? null) : null;
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
  if (readTier === 'none') showHints = false; // 生涯 reaction 太低：讀攔網能力未開（練反應解鎖）
  if (simpleMode && readTier !== 'none') {
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
  // 🎮 自由操控切換（Sawmah 拍板：熟手模式）：接球/扣球/攔網不自動走位、
  // 攔網面板收起改全手動；戰術跑位/發球歸位/Cover 照舊自動
  let freeMove = false;
  try { freeMove = localStorage.getItem('vd-control') === 'free'; } catch { /* 私密模式 */ }
  controls.setFreeMove(freeMove);
  if (simpleMode) {
    const ctlBtn = document.createElement('button');
    const paintCtl = () => { ctlBtn.textContent = freeMove ? '🎮 操控:自由' : '🎮 操控:自動'; };
    ctlBtn.style.cssText = [
      'position:fixed', 'top:calc(env(safe-area-inset-top, 0px) + 8px)',
      'right:calc(env(safe-area-inset-right, 0px) + 170px)',
      'height:44px', 'padding:0 12px', 'border-radius:22px', 'border:none',
      'background:rgba(12,16,26,0.6)', 'color:#eef2fa', 'font-size:14px',
      'font-family:system-ui,sans-serif', 'z-index:16', 'cursor:pointer',
      'touch-action:manipulation',
    ].join(';');
    paintCtl();
    ctlBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      freeMove = !freeMove;
      controls.setFreeMove(freeMove);
      paintCtl();
      floatText.show(freeMove ? '自由操控：走位交給你' : '自動操控：走位交給系統', '#6ee7ff', 1400);
      try { localStorage.setItem('vd-control', freeMove ? 'free' : 'auto'); } catch { /* ignore */ }
    });
    document.body.appendChild(ctlBtn);
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
  // 魚躍鈕（主動技，故事線習得）：來球搆不到但撲得到時亮起；桌機 L 鍵
  // （Space/J 是主動作蓄力、K 是攔網——L 順位相鄰）
  const diveBtn = document.createElement('button');
  diveBtn.textContent = '魚躍!';
  diveBtn.style.cssText = [
    'position:fixed', 'left:calc(env(safe-area-inset-left, 0px) + 18px)', 'bottom:45%',
    'width:70px', 'height:70px', 'border-radius:50%', 'border:3px solid #101420',
    'background:rgba(255,120,96,0.94)', 'color:#1a0e08', 'font-size:17px', 'font-weight:800',
    'z-index:16', 'cursor:pointer', 'touch-action:manipulation', 'display:none',
    'box-shadow:0 3px 0 rgba(8,10,18,0.55)',
  ].join(';');
  diveBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (diveReady) controls.diveNow(game);
  });
  document.body.appendChild(diveBtn);
  window.addEventListener('keydown', (e) => {
    // 簡化模式 Space＝魚躍（蓄力已讓位）；L 鍵兩模式通用
    const diveKey = e.code === 'KeyL' || (simpleMode && e.code === 'Space');
    if (diveKey && !e.repeat && diveReady) {
      e.preventDefault();
      controls.diveNow(game);
    }
  });
  const aimMarker = createAimMarker(scene); // 琥珀色＝你的瞄準點（經典模式）
  // 操作輔助（?assist=off 關閉）：青色圈＝來球預測落點（僅顯示落在我方半場的）
  const assistOn = params.get('assist') !== 'off';
  const landingMarker = createAimMarker(scene, 0x6ee7ff, 0.6);
  let assistFlight = -1;
  let assistLanding = null;
  showTutorialOnce(simpleMode);

  // 局終點擊 → 生涯：回生涯畫面（結果已在局終當下落檔）；快速比賽：換種子再開一局
  window.addEventListener('pointerdown', () => {
    if (game.phase !== 'set_over') return;
    if (careerCtx) {
      const back = new URLSearchParams();
      back.set('career', 'resume');
      for (const k of ['points', 'classic', 'assist']) {
        const v = params.get(k);
        if (v !== null) back.set(k, v);
      }
      window.location.assign(`${window.location.pathname}?${back.toString()}`);
      return;
    }
    seed += 1;
    game = createGame({ seed, setTarget });
    aiState = createAiState();
    controlledId = PLAYER_ID;
    switchKey = '';
    replay = null;
    vcrLast = null; // 換局清回放資料，避免新局第一分前播到上一局最後一球
    vcrCurrent = { snapshot: null, steps: [] };
    servedThisTurn = false;
    setOverOverlay.hide();
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

  // 批次二情緒節拍：局終結算過場＋得分 FOV punch＋局點張力
  const setOverOverlay = createSetOverOverlay();
  let prevPhase = game.phase;
  let fovPunchUntil = 0;
  let rallyStartFlight = 0; // 本球起始 flight（rally 長度＝歡呼強度）

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
  // 得分原因面板：死球後顯示「誰得分＋為什麼」（殺球/ACE/出界/犯規…）
  const pointBanner = createPointBanner();
  let lastTouch = null;   // 最後觸球 { team, playerId, kind }——死球時推導得分原因用
  let pendingDead = null; // DEAD_BALL 先到、SCORE 緊隨（同批事件）：湊齊才顯示面板

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
  // 情蒐錄影帶：吃同一條 replay 管線（tape 旗標）；尾段 4 秒、略快於一般回放
  const TAPE_TAIL = 240;
  function startTapeClip() {
    const clip = tapeClips[tapeIdx];
    if (!clip) return;
    const state = structuredClone(clip.snapshot);
    const startIdx = Math.max(0, clip.steps.length - TAPE_TAIL);
    for (let i = 0; i < startIdx; i += 1) stepGame(state, clip.steps[i].intents);
    replay = { state, steps: clip.steps, idx: startIdx, acc: 0, tape: true };
    floatText.show(`📼 情蒐：對手關鍵球 ${tapeIdx + 1}/${tapeClips.length}（點擊跳過）`, '#6ee7ff', 2000);
    tapeIdx += 1;
  }
  window.addEventListener('pointerdown', () => {
    if (replay?.tape) { // 跳過整卷情蒐
      replay = null;
      tapeIdx = tapeClips.length;
      floatText.show('跳過情蒐——比賽開始！', '#9fb0cc', 1000);
    }
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
    tapeCount: tapeClips.length, // 情蒐錄影帶卷數（測試用）
  };
  if (tapeClips.length) startTapeClip(); // 生涯開賽：先播情蒐錄影帶（點擊跳過）

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
      if (replay.idx >= replay.steps.length) {
        const wasTape = replay.tape;
        replay = null; // 播完回現場
        if (wasTape) {
          if (tapeIdx < tapeClips.length) startTapeClip(); // 下一卷
          else floatText.show('情蒐結束——比賽開始！', '#ffd166', 1500);
        }
      }
      return;
    }

    // 簡化模式：進攻決策——輪到玩家扣球且球還在空中→彈面板、時間放慢給你讀攔網選區
    let deciding = false;
    if (simpleMode) {
      // 進攻時刻＝切攻擊手視角越過網看攔網（讀攔網要看得清）
      rig.setAttackView(controls.isAttackMoment(game));
      // 技術閘門：吊球未解鎖＝面板無吊球；後排 pipe 未解鎖＝後排不彈面板（保底出手照舊）
      const zonesRaw = controls.attackZones(game);
      const zones = zonesRaw && zonesRaw.filter((z) => z.key !== 'tip' || canTip);
      const meBackRow = isBackRow(
        game.match.rotations[game.players[controlledId].teamId], controlledId,
      );
      // ①進攻決策：球正下墜、可決策高度、尚未選區
      const attackDeciding =
        !!zones && (canPipe || !meBackRow) &&
        game.ball.vy < 0 && game.ball.y > 2.0 && !controls.attackPending();
      // ②攔網決策：對方第三擊將至、我在前排；自由模式收面板（全手動讀線），
      // 但慢速窗與攔網第一視角照給——時間留給你自己站位抓時機
      const defendMoment =
        controls.isDefendMoment(game, aiState) &&
        game.ball.vy < 0 && game.ball.y > 2.0;
      rig.setDefendView(defendMoment);
      const defendDeciding = !freeMove && defendMoment && !controls.blockPlanPending();
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

      deciding = attackDeciding || defendDeciding || (freeMove && defendMoment); // 攻/防決策窗＝時間放慢
      // 讀攔網 slow 檔：決策窗開了 0.6 秒才上色（讀得慢）；instant 即時；none 恆中性
      if (attackDeciding) {
        if (attackDecidingSince < 0) attackDecidingSince = now;
      } else {
        attackDecidingSince = -1;
      }
      const hintsLive = showHints && (readTier === 'instant' ||
        (readTier === 'slow' && attackDecidingSince >= 0 && now - attackDecidingSince > 600));
      if (attackDeciding) {
        const feintHint = canFeint ? '（按A滑B＝假動作）' : '';
        panel.show(
          (hintsLive ? '選攻擊區！' : '看攔網選區！') + feintHint,
          zones.map((z) => ({
            key: z.key,
            label: hintsLive ? z.label + (z.blocked ? ' ✋' : '') : z.label,
            color: hintsLive ? (z.blocked ? 'red' : 'green') : 'neutral',
            zone: z,
          })),
          (it) => controls.chooseAttack(it.zone),
          (fromIt, toIt) => {
            if (!canFeint) { controls.chooseAttack(toIt.zone); return; } // 未解鎖：滑到哪打哪（誠實）
            feintsUsedThisMatch += 1;
            controls.chooseAttackFake(fromIt.zone, toIt.zone);
            floatText.show('假動作!');
          },
        );
      } else if (defendDeciding) {
        const opts = controls.blockOptions(game, aiState);
        if (opts) {
          panel.show(
            '他要扣了——封哪條線？',
            opts.map((o) => ({ key: o.key, label: o.label, color: 'neutral', opt: o })),
            (it) => {
              controls.chooseBlock(it.opt);
              floatText.show(`${it.opt.label}！`); // 按下立即回饋（起跳時機仍由 sim 抓最優）
            },
          );
        }
      } else if (serveDeciding) {
        // 穩定×4＋強力×3（強＝低平快、散佈大；短球無強力——它本來就是輕放）
        const zs = controls.serveZones(game);
        const styleHint = [
          canFloatServe ? '藍＝飄浮' : null,
          canJumpServe ? '橘＝跳發' : null,
        ].filter(Boolean).join('、');
        panel.show(
          styleHint ? `選發球目標！（${styleHint}）` : '選發球目標！',
          [
            ...zs.map((z) => ({ key: z.key, label: z.label, color: 'neutral', zone: z, style: null })),
            // 飄浮/跳躍球路＝故事線傳授的技術（未習得不出現）
            ...(canFloatServe ? zs.filter((z) => z.key !== 'short').map((z) => ({
              key: `f-${z.key}`, label: `飄${z.label.slice(1)}`, color: 'cyan', zone: z, style: 'float',
            })) : []),
            ...(canJumpServe ? zs.filter((z) => z.key !== 'short').map((z) => ({
              key: `j-${z.key}`, label: `跳${z.label.slice(1)}`, color: 'orange', zone: z, style: 'jump',
            })) : []),
          ],
          (it) => {
            controls.serveNow(game, it.zone.aim, it.style);
            servedThisTurn = true;
          },
        );
      } else {
        panel.hide();
      }
    }

    // 擊球定格（hit-stop）：短暫凍結模擬推進、畫面照跑——打擊的「頓」感
    if (now < hitStopUntil) delta = 0;
    // 進攻/防守決策窗＝放慢（時間膨脹只作用推進率，決定論不碰）
    else if (deciding) { delta *= 0.4; slowEaseFrom = now; }
    // 決策窗結束的緩出：0.35s 內 0.4→1.0 漸變——瞬間回速會讓攔網/出手看起來慢半拍
    else if (now - slowEaseFrom < 350) delta *= 0.4 + 0.6 * ((now - slowEaseFrom) / 350);
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
      sfx.onEvents(frameEvents, { rallyFlights: game.rally.flightId - rallyStartFlight });
      controls.onEvents(frameEvents); // 出手成功 → 清出手緩衝
      if (commentary) commentary.onEvents(frameEvents, game, aiState, now, controlledId);
      // juice：重扣/攔網定格＋震動、死球大震（殺球落地的重量感）
      for (const e of frameEvents) {
        if (e.type === 'SERVE') rallyStartFlight = game.rally.flightId;
        // 得分原因面板：追蹤最後觸球（含發球/攔網）；DEAD_BALL+SCORE 湊齊即顯示
        if (e.type === 'TOUCH' || e.type === 'SERVE') {
          lastTouch = { team: e.team, playerId: e.playerId, kind: e.kind ?? 'serve', power: e.power };
        } else if (e.type === 'BLOCK_TOUCH') {
          lastTouch = { team: e.team, playerId: e.playerId, kind: 'block' };
        }
        if (e.type === 'TOUCH' && e.kind === 'spike') {
          hitStopUntil = now + ((e.power ?? 1) >= 0.7 ? 70 : 40);
          if ((e.power ?? 1) >= 0.7) slowUntil = now + 450; // 重扣＝定格接慢動作
          shake = Math.max(shake, 0.12);
        } else if (e.type === 'BLOCK_TOUCH') {
          hitStopUntil = now + 60;
          shake = Math.max(shake, 0.2);
        } else if (e.type === 'DEAD_BALL') {
          shake = Math.max(shake, 0.26);
          pendingDead = { reason: e.reason };
        } else if (e.type === 'SCORE') {
          // 得分慶祝：全員高舉小跳＋鏡頭 FOV punch（推近再彈回）
          fovPunchUntil = now + 700;
          for (const id of game.match.rotations[e.team]) {
            matchView.triggerPose(id, 'cheer');
          }
          if (pendingDead) {
            pointBanner.show(derivePointInfo({
              reason: pendingDead.reason, winner: e.team,
              myTeam: game.players[controlledId]?.teamId,
              lastTouch, controlledId, score: e.score,
            }));
            pendingDead = null;
            lastTouch = null;
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
    const netHitPower = court.update(delta, game.ball); // 網面受擊波動（純視覺）
    if (netHitPower > 0) sfx.netHit(netHitPower);
    matchView.sync(game, alpha, delta, frameEvents);
    rig.setSpikeMine(aiState?.claimId === controlledId); // 扣球一人稱只認「舉給我」
    rig.update(game, alpha, delta);
    // 局點張力：燈光收攏＋心跳（deuce 內建於 setPointTeam 判定）
    const tension = game.phase !== 'set_over' && setPointTeam(game) !== null;
    lights.setTension(tension, delta);
    sfx.setHeartbeat(tension);
    sfx.setCrowdLevel(tension && game.phase === 'serve' ? 0.016 : 0.05); // 局點發球前屏息
    // 鏡頭語言：得分 FOV punch＋重扣慢動作收緊（望遠壓縮感）
    const punchFov = now < fovPunchUntil
      ? 6.5 * Math.sin(Math.PI * (1 - (fovPunchUntil - now) / 700)) : 0;
    const slowFov = now < slowUntil ? 3.5 : 0;
    const fovTarget = 55 - punchFov - slowFov;
    if (Math.abs(camera.fov - fovTarget) > 0.01) {
      camera.fov = fovTarget;
      camera.updateProjectionMatrix();
    }
    // 局終結算過場（一次性）；生涯模式先落檔再顯示——點擊返回前進度已保住
    if (game.phase === 'set_over' && prevPhase !== 'set_over') {
      if (careerCtx) {
        const myTeam = game.players[PLAYER_ID].teamId; // 生涯主角固定 A 隊
        const s = game.match.score;
        const won = game.match.winner === myTeam;
        // stage 3：從事件日誌統計表現→成長點數；假動作熟練度場終一次累積
        const stats = matchStatsFor(game.events, PLAYER_ID, myTeam);
        let saveOk = true;
        if (feintsUsedThisMatch > 0) {
          careerCtx.player.techniques.feintUses =
            (careerCtx.player.techniques.feintUses ?? 0) + feintsUsedThisMatch;
          saveOk = careerCtx.store.savePlayer(careerCtx.player) && saveOk;
        }
        // 情蒐入庫：這場對手看到的我（宿敵同 id 跨賽段累積——「他們記得你」）
        const scouted = mergeScouting(
          careerCtx.career, careerCtx.matchEntry.opponentId, game.scoutTally[PLAYER_ID],
        );
        saveOk = careerCtx.store.saveCareer(recordResult(scouted, {
          matchId: careerCtx.matchEntry.id,
          won,
          scoreFor: myTeam === 'A' ? s.A : s.B,
          scoreAgainst: myTeam === 'A' ? s.B : s.A,
          gp: growthPointsFor(stats, won),
          stats,
        })) && saveOk;
        if (!saveOk) floatText.show('⚠ 戰績寫入失敗（儲存空間不可用）', '#ff8a8a', 2600);
      }
      setOverOverlay.show(game.match.winner, game.match.score,
        game.players[controlledId].teamId, careerCtx ? '點擊任意處返回生涯' : undefined);
    }
    prevPhase = game.phase;
    // 螢幕震動：鏡頭位置疊隨機偏移、指數衰減（表現層，不碰 sim）
    if (shake > 0.004) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake * 0.6;
      shake *= 0.82;
    }
    // 魚躍鈕可用性：來球落我方半場、正常可及外撲救範圍內、未倒地（Space 版共用 diveReady）
    if (canDive) {
      const meActor = game.actors[controlledId];
      const landing = aiState?.landing;
      diveReady = game.phase === 'rally' && !replay &&
        game.tick >= meActor.divedUntil &&
        !!landing && aiState.landingTeam === game.players[controlledId].teamId &&
        game.ball.vy < 0;
      if (diveReady) {
        const d = Math.hypot(landing.x - meActor.x, landing.z - meActor.z);
        diveReady = d > 1.1 && d <= 3.4;
      }
      diveBtn.style.display = diveReady ? 'block' : 'none';
    }
    scoreboard.update(game, myBall, controlledId,
      commentary ? commentary.line(game, aiState, controlledId, now) : undefined);
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
