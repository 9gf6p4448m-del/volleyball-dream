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
import { careerReturnUrl } from './matchCareer.js';

export async function buildMatchStage({ ctx, config, gates, playerId, game }) {
  const { renderer, scene, camera, quality, hud, loadingEl, params } = ctx;
  const { simpleMode, careerSetup } = config;

  const handlers = { replay: null }; // matchLoop 開機時注入（dive 鈕 07-24 移除＝改自動）

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
  // A6（拍板）：生涯賽才給「離開」——中途離開＝棄賽敗 0:25，離開前自訂確認彈窗；
  // 另掛 beforeunload 雙保險（reload/關頁跳瀏覽器通用確認框，防誤觸吃敗場）
  const leaveBtn = careerSetup ? createLeaveButton(params, game) : null;
  // 學招預告對話框（Sawmah 07-23 二輪拍板：字幕太快→點擊逐句，careerScreen dlg 同範式）
  const teachDialog = careerSetup ? createTeachDialog() : null;

  const aimMarker = createAimMarker(scene); // 琥珀色＝你的瞄準點（經典模式）
  const landingMarker = createAimMarker(scene, 0x6ee7ff, 0.6); // 青色圈＝來球預測落點
  const floatText = createFloatText();
  // 得分原因面板：死球後顯示「誰得分＋為什麼」（殺球/ACE/出界/犯規…）
  const pointBanner = createPointBanner();
  const setOverOverlay = createSetOverOverlay();
  showTutorialOnce(simpleMode);

  return {
    handlers, matchView, rig, controls, scoreboard, commentary, sfx, touchUi,
    panel, actionButtons, hints, replayBtn, leaveBtn, teachDialog,
    aimMarker, landingMarker, floatText, pointBanner, setOverOverlay,
  };
}

// 學招預告對話框（點擊逐句；與 careerScreen 劇情對話框同視覺範式）：
// 底部卡片，speaker 金字＋台詞＋「▼ 點擊繼續」；點卡片推進、stopPropagation
// 不觸發「點擊跳過情蒐」的 window 監聽（情蒐帶在背後照播）
function createTeachDialog() {
  const wrap = document.createElement('div');
  wrap.style.cssText = [
    'position:fixed', 'left:50%', 'transform:translateX(-50%)',
    'bottom:calc(env(safe-area-inset-bottom, 0px) + 26px)',
    'width:min(480px, 92vw)', 'z-index:30', 'display:none',
    'background:rgba(18,24,40,0.92)', 'border-radius:16px', 'border:1px solid #2c3a58',
    'padding:14px 18px', 'cursor:pointer', 'box-shadow:0 12px 40px rgba(0,0,0,0.6)',
    'font-family:system-ui,sans-serif', 'user-select:none',
  ].join(';');
  const speaker = document.createElement('div');
  speaker.style.cssText = 'font-size:13px;font-weight:800;color:#ffd166;letter-spacing:2px';
  const text = document.createElement('div');
  text.style.cssText = 'font-size:15px;color:#eef2fa;line-height:1.6;margin-top:6px;text-align:left';
  const hint = document.createElement('div');
  hint.textContent = '▼ 點擊繼續';
  hint.style.cssText = 'font-size:11px;color:#9fb0cc;text-align:right;margin-top:8px';
  wrap.appendChild(speaker);
  wrap.appendChild(text);
  wrap.appendChild(hint);
  document.body.appendChild(wrap);

  let queue = null;
  const paint = () => {
    speaker.textContent = queue[0].speaker;
    text.textContent = queue[0].text;
  };
  wrap.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); // 點對話框＝推進台詞，不觸發跳過情蒐/其他 window 監聽
    if (!queue) return;
    queue.shift();
    if (queue.length) {
      paint();
      return;
    }
    queue = null;
    wrap.style.display = 'none';
  });
  return {
    show(lines) {
      if (!lines?.length) return;
      queue = [...lines];
      paint();
      wrap.style.display = 'block';
    },
  };
}

// A6 離開鈕（生涯賽）：左上角常駐；點擊彈自訂確認框——「中途離開球場將記棄賽敗（0:25）
// ——確定離開？」。確認＝走既有 careerReturnUrl 導航回生涯畫面（pending 未清＝
// resolveForfeit 記 0:25 敗，棄賽機制不變）。
// beforeunload 雙保險（拍板 07-23）：比賽未完賽時 reload／關頁跳瀏覽器通用確認框
// （文字瀏覽器內建、不可自訂——安全限制）；完賽（set_over）或已按離開鈕確認＝不攔
// （否則局終正常返回生涯也會被通用框擋一次）。手機 PWA 對 beforeunload 支援不一＝已知限制。
function createLeaveButton(params, game) {
  const btn = document.createElement('button');
  btn.textContent = '✕ 離開';
  // 位置：右上 🎬 回放鈕正下方（Sawmah 07-23 試玩回報：原左上會擋到播報泡泡與 FPS）
  btn.style.cssText = [
    'position:fixed', 'top:calc(env(safe-area-inset-top, 0px) + 60px)',
    'right:calc(env(safe-area-inset-right, 0px) + 12px)',
    'height:44px', 'padding:0 14px', 'border-radius:22px', 'border:none',
    'background:rgba(12,16,26,0.6)', 'color:#eef2fa', 'font-size:14px',
    'font-family:system-ui,sans-serif', 'z-index:16', 'cursor:pointer',
    'touch-action:manipulation',
  ].join(';');

  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:40', 'display:none',
    'align-items:center', 'justify-content:center',
    'background:rgba(4,6,12,0.72)', 'font-family:system-ui,sans-serif',
  ].join(';');
  const card = document.createElement('div');
  card.style.cssText = [
    'width:min(400px, 90vw)', 'background:rgba(18,24,40,0.96)', 'border-radius:16px',
    'border:1px solid #2c3a58', 'padding:20px', 'text-align:center',
    'box-shadow:0 12px 40px rgba(0,0,0,0.6)',
  ].join(';');
  const text = document.createElement('div');
  text.textContent = '中途離開球場將記棄賽敗（0:25）——確定離開？';
  text.style.cssText = ['color:#eef2fa', 'font-size:15px', 'line-height:1.6', 'margin-bottom:16px'].join(';');
  const btnRow = document.createElement('div');
  btnRow.style.cssText = ['display:flex', 'gap:12px', 'justify-content:center'].join(';');
  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = '確定離開';
  confirmBtn.style.cssText = [
    'height:46px', 'padding:0 20px', 'border-radius:23px', 'border:none',
    'background:#8a3a3a', 'color:#ffe', 'font-size:15px', 'font-weight:700',
    'cursor:pointer', 'touch-action:manipulation',
  ].join(';');
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '繼續比賽';
  cancelBtn.style.cssText = [
    'height:46px', 'padding:0 20px', 'border-radius:23px', 'border:1px solid #2c3a58',
    'background:transparent', 'color:#eef2fa', 'font-size:15px', 'cursor:pointer',
    'touch-action:manipulation',
  ].join(';');
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(confirmBtn);
  card.appendChild(text);
  card.appendChild(btnRow);
  overlay.appendChild(card);

  // beforeunload：未完賽攔（跳通用框）、完賽放行（局終點擊返回生涯不被擋）
  const onBeforeUnload = (e) => {
    if (game.phase === 'set_over') return;
    e.preventDefault();
    e.returnValue = ''; // 舊規格相容：非空值才觸發確認框
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  const openDialog = (e) => { e.stopPropagation(); overlay.style.display = 'flex'; };
  const close = (e) => { e.stopPropagation(); overlay.style.display = 'none'; };
  btn.addEventListener('pointerdown', openDialog);
  cancelBtn.addEventListener('pointerdown', close);
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(e); });
  confirmBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    // 已在自訂框確認過＝先卸 beforeunload，避免導航時又跳一次通用框
    window.removeEventListener('beforeunload', onBeforeUnload);
    window.location.assign(careerReturnUrl(params, window.location.pathname));
  });
  document.body.appendChild(btn);
  document.body.appendChild(overlay);
  return { el: btn };
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

// 魚躍鈕已移除（07-24 拍板：撲救改自動判斷 matchControls 自動輔助——「太難用」；
// 桌機 L/簡化模式 Space 保留為隱藏手動提前撲）。歷史：07-22 閃現式→07-23 常駐可按→本輪撤除
