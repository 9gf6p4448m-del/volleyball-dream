// 賽前準備③——舞台建置（three.js 視圖＋DOM UI 集中在本檔；不含任何逐幀邏輯）
// 介面契約：buildMatchStage({ ctx, config, gates, playerId, game }) → stage
// - stage 持有所有表現層協作者（view/rig/controls/UI），供 matchLoop 逐幀取用
// - stage.handlers＝迴圈注入點（replay/dive 按鈕的行為由 matchLoop 開機時填入；
//   這是三段之間唯一的後綁定介面，除此之外不共用可變狀態）
import { createMatchView } from '../render/matchView.js';
import { createCameraRig } from '../render/cameraRig.js';
import { createAimMarker } from '../render/aimMarker.js';
import { createMatchControls } from '../input/matchControls.js';
import { createScoreboard } from '../ui/scoreboard.js';
import { createCommentary } from '../ui/commentary.js';
import { createSfx } from '../ui/sfx.js';
import { createTouchUi } from '../ui/touchUi.js';
import { createActionButtons } from '../ui/actionButtons.js';
import { createZonePanel } from '../ui/zonePanel.js';
import { createFloatText } from '../ui/floatText.js';
import { createPointBanner } from '../ui/pointBanner.js';
import { showTutorialOnce } from '../ui/tutorial.js';
import { createSetOverOverlay } from '../ui/setOverOverlay.js';

export async function buildMatchStage({ ctx, config, gates, playerId, game }) {
  const { renderer, scene, camera, quality, hud, loadingEl, params } = ctx;
  const { simpleMode, careerSetup } = config;

  const handlers = { replay: null, dive: null }; // matchLoop 開機時注入

  let matchView;
  try {
    // ?pose=bump|overhead|spike|block|serve：強制循環播放單一姿勢（調角度用）
    matchView = await createMatchView(scene, quality, game, playerId, params.get('pose'));
  } catch (err) {
    loadingEl.textContent = `模型載入失敗：${err.message ?? err}`;
    hud.error(`模型載入失敗（${quality.model}）`);
    matchView = { count: 0, sync() {} };
  }
  if (matchView.count > 0) loadingEl.remove();

  const rig = createCameraRig(camera, playerId);
  const controls = createMatchControls(renderer.domElement, camera, playerId, rig, simpleMode);
  const scoreboard = createScoreboard(playerId);
  // 即時播報（決策模式）：取代舊版操作提示行；classic 走 scoreboard 內建舊提示
  const commentary = simpleMode ? createCommentary(careerSetup?.opponent ?? null) : null;
  const sfx = createSfx();
  const touchUi = createTouchUi();
  // 簡化模式：決策面板（攻擊/發球/攔網共用）；經典模式：全手動按鈕
  const panel = simpleMode ? createZonePanel() : null;
  const actionButtons = simpleMode ? null : createActionButtons(controls);

  const hints = createHintToggle(simpleMode, gates.readTier);
  const replayBtn = createReplayButton(handlers);
  const diveBtn = createDiveButton(handlers);

  const aimMarker = createAimMarker(scene); // 琥珀色＝你的瞄準點（經典模式）
  const landingMarker = createAimMarker(scene, 0x6ee7ff, 0.6); // 青色圈＝來球預測落點
  const floatText = createFloatText();
  // 得分原因面板：死球後顯示「誰得分＋為什麼」（殺球/ACE/出界/犯規…）
  const pointBanner = createPointBanner();
  const setOverOverlay = createSetOverOverlay();
  showTutorialOnce(simpleMode);

  return {
    handlers, matchView, rig, controls, scoreboard, commentary, sfx, touchUi,
    panel, actionButtons, hints, replayBtn, diveBtn,
    aimMarker, landingMarker, floatText, pointBanner, setOverOverlay,
  };
}

// 讀攔網提示開關：開＝綠/紅標示（新手輔助）、關＝自己看攔網判斷（技術版）
function createHintToggle(simpleMode, readTier) {
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
  return { isOn: () => showHints };
}

// 🎬 回放鈕：重看上一球的最後 3 秒（桌機 R 鍵在 matchLoop 綁定）
function createReplayButton(handlers) {
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
    handlers.replay?.();
  });
  document.body.appendChild(replayBtn);
  return { el: replayBtn };
}

// 魚躍鈕（主動技，故事線習得）：來球搆不到但撲得到時亮起；桌機 L 鍵
// （Space/J 是主動作蓄力、K 是攔網——L 順位相鄰）
// 試玩回饋 07-22：改右側（慣用手）＋常駐兩態（暗＝不可用、亮＝撲！）——
// 閃現式按鈕在手機上根本來不及按
function createDiveButton(handlers) {
  const diveBtn = document.createElement('button');
  diveBtn.textContent = '魚躍!';
  diveBtn.style.cssText = [
    'position:fixed', 'right:calc(env(safe-area-inset-right, 0px) + 16px)', 'bottom:38%',
    'width:74px', 'height:74px', 'border-radius:50%', 'border:3px solid #101420',
    'background:rgba(70,80,100,0.5)', 'color:rgba(255,255,255,0.4)',
    'font-size:17px', 'font-weight:800',
    'z-index:16', 'cursor:pointer', 'touch-action:manipulation', 'display:none',
    'box-shadow:0 3px 0 rgba(8,10,18,0.55)',
    'transition:background 120ms ease, color 120ms ease, transform 120ms ease',
  ].join(';');
  diveBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    handlers.dive?.();
  });
  document.body.appendChild(diveBtn);
  return {
    el: diveBtn,
    setVisible(v) { diveBtn.style.display = v ? 'block' : 'none'; },
    // 常駐兩態：暗＝不可用、亮＝可撲（放大＋暖色）
    setReady(r) {
      diveBtn.style.background = r ? 'rgba(255,120,96,0.95)' : 'rgba(70,80,100,0.5)';
      diveBtn.style.color = r ? '#1a0e08' : 'rgba(255,255,255,0.4)';
      diveBtn.style.transform = r ? 'scale(1.12)' : 'scale(1)';
    },
  };
}
