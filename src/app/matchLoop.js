// 回合迴圈——固定步長累積器（模擬）＋ requestAnimationFrame（畫面，不鎖幀）
// 架構鐵律：模擬（src/sim）只在 while 迴圈裡以 SIM_DT 推進；render 讀插值結果，兩者完全脫鉤
// 本檔持有比賽期間全部逐幀可變狀態（VCR/回放/受控者/juice/決策窗），集中在顯式的
// loop state 物件 `s`——所有函式都吃 s 參數，模組間不共用隱式可變狀態。
// 與賽前準備（matchConfig/matchStage）僅以 config/gates/stage 資料介面銜接，
// 與賽末收束（matchCareer）僅在局終呼叫 settleCareerMatch 一次。
import { SIM_DT, MAX_FRAME_DELTA } from '../sim/constants.js';
import {
  createGame, stepGame, applySubstitution, applyTimeout, applyTimeoutBoost, resumeFromTimeout,
  startNextSet, applyLiberoRecall, restageRotation, TUNING,
} from '../sim/game.js';
import {
  createAiState, aiCollectIntents, aiTimeoutWanted, aiTimeoutBoost, aiSubstitutionWanted,
  callFeasibilityOf, cutStateOf, tandemStateOf, bquickStateOf, audibleStateOf, dutyPosition, AI,
} from '../sim/ai.js';
import { predictLanding } from '../sim/flight.js';
import { contactAssistFor } from './contactAssist.js';
import { landedCourtTeam, isBackRow, isFrontRow } from '../sim/rotation.js';
import { NEAR_NET_Z } from '../input/matchControls.js'; // 攔網帶寬度＝與自動跳攔同一把尺
import {
  setPanelTitle, setPreviewTitle, setStageOf, setEtaOf, SET_HESITANT_BELOW, KIND_LABELS,
} from '../input/setOptions.js';
import { effectiveTrust } from '../sim/trust.js';
import { mbPanelTitle } from '../input/blockRead.js';
import { digReadCorrect, schemeByKey, noteScheme, counterReadOf } from '../input/liberoRead.js';
import { myRouteFor } from '../input/myRoute.js';
import { applySeasonRoster } from '../career/careerState.js';
import { serverId } from '../sim/match.js';
import { STAMINA } from '../sim/stamina.js';
import { setPointTeam } from '../ui/scoreboard.js';
import { derivePointInfo } from '../ui/pointBanner.js';
import { roleSwapOk } from '../ui/subPanel.js';
// 段 E：叫套路的選項池與回饋文案（面板、遠段改判、字卡三處共用同一份＝同源）
import {
  callOptionsFor, callFeedbackOf, CALL_MODES, CALL_LABELS,
} from '../input/callPlay.js';
import {
  blockBetFeedbackOf, mbCallFeedbackOf, createBlockBetArm, createBetCardGate,
} from '../input/blockBetFeedback.js';
import { heroCardFor, momentumCardFor } from '../ui/heroCards.js';
import {
  settleCareerMatch, settlePracticeMatch, careerReturnUrl, resolveOppAceBox,
} from './matchCareer.js';
import {
  settlePractice,
  createTutorialState, advanceTutorial, tutorialRows, tutorialSettle, currentTutorialDrill,
  tutorialCoachLine, tutorialVerdictLine, tutorialStageFor, coachMarkerTarget,
  TUTORIAL_RELEASE_LINE, TUTORIAL_FINISH_LINE,
} from '../career/practiceMatch.js';
import { spikeAimsFor, netCrossingX } from '../sim/blockRead.js';
import { createRallyRecorder, createRallyPlayer, isPlayableTape } from './rallyTape.js';
import { buildTeamBox } from '../career/boxScore.js';
import { boxScoreLFor } from '../career/boxScoreL.js';
import { upcomingTeach } from '../career/events.js';
import { TECH_DEFS } from '../career/growth.js';
import {
  RECRUIT_CONDS, progressOf, featGainFor, recruitTargetGone,
  altFeatsFor, altGainsFor, conditionMet, matchRoleOf,
} from '../career/recruitment.js';
import { opponentById } from '../career/opponents.js';
import { HUDDLE } from '../render/huddleLayout.js';
import { CAMERA_TUNING } from '../render/cameraRig.js';
import { hitLeadTicks, seqDurTicks } from '../render/geoAnimator.js';
import { approachRouteOf, isQuickKind, TEMPO, SET_TO_HIT_TICKS } from '../sim/approach.js';
import {
  trackSignature, armSignature, signatureFire, planSignatureBeat, sigKey, ohSignatureArms,
  lineKillDistance, SIG_LINE_M, timingVerdict, netDuelQualify, netDuelFire,
} from '../ui/signatureBeats.js';
import { planHighlightReplay } from '../ui/highlightReplay.js';
import {
  buildDirectorScript, stepAtExact, stepAt, shotAt, tAtStep,
} from '../render/replayDirector.js';
import {
  loadPresentationPref, keyPointOf, createBeatTimeline, driveTimeline,
} from '../ui/presentation.js';
import { easeInOutCubic } from '../render/ritualStage.js';
import {
  sHotspotItems, lSignalItems, createLatencyStats, loudCallerOf,
} from '../ui/diegeticItems.js';
import { isHeavySpikeDig, isDiveSaveTouch, HEAVY_SPIKE_POWER_MIN } from '../ui/receiveJuice.js';

// 接球微回饋批2（丙1/丙2/丙3，acceptance-netduel-batch2.md，2026-08-27）：三個
// 時長常數，觸發判定全抽在 receiveJuice.js（純函式）／sim 的 perfect 欄位，這裡
// 只放「亮多久」。全部【試玩必調】——提案值，試玩即改。
const DIG_HIT_STOP_MS = 90;      // 丙1：重扣被救起瞬間定格（NJ-2 提案值）
const DIVE_SAVE_SLOWMO_MS = 300; // 丙2：魚躍成功救起後的短慢動作（比重扣 450/神救球 650 短）
const PERFECT_GLOW_MS = 260;     // 丙3：完美接球後球體發光時長

// W8 暫停演出：暫停起算 ~0.9s（隊友跑進圈）後才切第一人稱圈內視角——
// 先用三人稱看全隊聚攏一小段，再切進圈裡，避免自己的身體從鏡頭裡穿過
const HUDDLE_VIEW_IN_TICKS = 55;

// W7 C2：受控者（此處固定用 s.playerId＝主角）是否在場上——板凳三件套與 C1 教練建議共用判準
// export：供 tests/comeback-ui.test.mjs 純函式直測（回場鈕/儀表板模式無 DOM 依賴的判斷邏輯）
export function onCourt(game, playerId) {
  const team = game.players[playerId].teamId;
  return game.match.rotations[team].includes(playerId);
}

// AI 攻擊手的兩段提前量（tick）——07-28 二輪（Sawmah：動作流暢度）：
// **助跑與起跳分家**。原本只有一個 windup（自帶 jump 0.5m），提前觸發＝提前浮空、
// 在空中飄 2.67m 過去；不提前又只剩 0.1s＝站著突然揮。
// APPROACH＝助跑起手（零跳躍、雙臂後擺前傾），TAKEOFF＝真正離地。
// **TAKEOFF 對齊 sim 自己的起跳定義**（TUNING.TAKEOFF_LOOKBACK_TICKS＝24：
// 後排踏線違例就是用這個回溯窗判起跳腳位置）——動畫與規則同一個時間錨點，
// 玩家看到的起跳點就是規則認定的起跳點
// Phase 5 W1 §2-2/2-4：助跑不再是「兩關鍵幀」而是三步節奏（geoAnimator approach3／
// approach4），需要更長的可播時間才看得出小步→制動步→併腳。前排 3 步／後排(pipe)
// 4 步——後排本就退得更遠（setAimFor pipe lz=3.6），給多一步的時間預算。
// TAKEOFF_LEAD_TICKS（sim 自己的起跳回溯窗）不動；APPROACH_LEAD 只是「幾 tick 前開始
// 播助跑」，純表現層觸發時機，與 sim 走位/起跳判定完全脫鉤
// 接球/舉球的預備動作提前量（tick）：略短於各自的預備序列，讓觸球動畫無縫接管
const RECEIVE_READY_LEAD = 26;
// 舉球的接觸高度比接發高（二傳在頭上出手），而 contactPoint 是用接發高度算的
// ——同樣倒數 22 tick，實際只剩 11 tick 可播（探針實測）。差額補進提前量
const SET_READY_LEAD = 34;
// 07-29 Sawmah 試玩：「舉球跟接球會還沒碰到手上就接起來或舉起來了」。根因＝**觸球那一
// 幀播的是預備姿勢**：原本只在 TOUCH 事件當下才 trigger 擊球動作，擊球關鍵幀要 0.2–0.3s
// 後才到（tools/contact-frame-probe.mjs 修前實測：接球落後 12.5 tick、舉球 17.5 tick）。
// 修法＝同一套提前量範式——擊球動作也倒數觸發，提前量＝該序列從起點到擊球關鍵幀的
// tick 數（geoAnimator.hitLeadTicks，序列調時長會自動跟著調，不會漂移）＋接觸點偏差。
// 偏差：contactPoint 是用接發高度 1.35m 算的，但**舉球在頭上出手**（sim 實測 p50 2.69m）
// ⇒ 球比預測早到 11 tick（探針 p50=11、p10=9、p90=11）。接球不另加偏差：預測誤差
// p50 僅 1 tick，恰與「觸發那一幀 animator 也會前進 1 tick」抵銷（實測校準後 p50 −0.5 tick）
const SET_CONTACT_BIAS = 11;
// 扣球擊球弧（Phase 5 W2 核心-1 三段式的段③）的提前量偏差。三速／後排**不另加**
// ——實測 hitPoint 比實際 TOUCH 只晚 1–2 tick，恰與「觸發那一幀 animator 也會前進
// 1 tick」抵銷（同上面接球那段的理由；校準後觸球幀落在擊球幀後 1.0 tick）。
// 一速（快攻）另計：球在上升段就被打掉，實際 TOUCH 比 hitPoint 早 7–9 tick
// （tools/contact-frame-probe 分節奏實測：三速/後排全是 1–2，quick 是 7/8/9 的
// p10/p50/p90）。不分開的話快攻只播得到 4 tick＝解鎖幀看不到，正是工單點名
// 「不得回到跳過解鎖幀的老路」
const SPIKE_CONTACT_BIAS_QUICK = 7;
// 觸發當下人離預測接觸點多遠就不提前播（m）：這球根本不是他碰得到的（隊友先接、
// 或直接落地失分）＝提前播就是對空氣墊球。探針實測 2.5m 保住 97.2% 的真實觸球、
// 擋掉 85.2% 的落空；被擋下的那些退回 TOUCH 事件觸發＝與修前完全相同
const CONTACT_NEAR_MAX = 2.5;
const TAKEOFF_LEAD_TICKS = TUNING.TAKEOFF_LOOKBACK_TICKS;
const APPROACH_LEAD_FRONT_TICKS = TAKEOFF_LEAD_TICKS + 45; // 3 步：45 tick＝0.75s（approach3 dur）
const APPROACH_LEAD_BACK_TICKS = TAKEOFF_LEAD_TICKS + 60;  // 4 步：60 tick＝1.0s（approach4 dur）
// 07-29 Sawmah 試玩：「快攻看起來會先走到網子前停一下，然後才起跳」。根因＝**畫面上的
// 起跳沒吃 sim 的起跳時刻**：上面那組提前量全是從 hitPoint（第三擊、二傳觸球之後才算得
// 出來）倒數的，但一速（MB 快攻）在 sim 裡是**二傳觸球前**就跑完助跑站上起跳點的
// （approach.js TEMPO.one）——那段等球的時間畫面上就是站著，等到 ticksToHit 進窗才跳。
// 探針實測（tools/quick-takeoff-probe.mjs，40 局 n=738）：「跑到起跳點站定 → 畫面上
// 起跳」舊規則 p50=21 p90=26 max=40 tick（0.67s）＝Sawmah 看到的「停一下」；
// 改吃 takeoffTick 後 p50/p90/max＝2/2/2 tick。sim 一格未動，只換觸發錨點。
// 修法＝同一套範式，只是錨點換成 sim 自己算好的 `route.takeoffTick`。
// 逾時作廢窗（tick）：一幀可能推進多個 sim tick（掉幀／時間膨脹），錯過起跳那一 tick
// 是常態。差距在窗內＝補播；超過就放棄早跳、退回既有的 hitPoint 倒數路徑（fallback）
const EARLY_TAKEOFF_STALE_TICKS = 12;

// 這一 tick 該不該播助跑或起跳——純算術核心（供下面兩支導出函式共用）。
//   'approach' 助跑起手（讓序列末幀正好踩在起跳 tick 上）／'takeoff' 離地／null 不播
// 算不出起跳 tick 的 route 一律回 null＝走既有路徑（呼叫端自行 fallback）。
function takeoffCueCore(route, tick, approachLeadTicks, staleTicks) {
  if (!route || route.takeoffTick == null) return null;
  const toTakeoff = route.takeoffTick - tick;
  if (toTakeoff > 0) return toTakeoff <= approachLeadTicks ? 'approach' : null;
  return -toTakeoff <= staleTicks ? 'takeoff' : null;
}

// 一速／二速攻擊手「該不該在這一 tick 播助跑或起跳」——純函式，供 tests 直測。
// 三速（起跳在二傳觸球之後）排除：**被選中的**三速攻擊手走下面的 hitPoint 倒數
// 路徑（真實球的預測接觸點，比 route.takeoffTick 這個規劃期估計值精準）。
export function earlyTakeoffCue(route, tick, approachLeadTicks, staleTicks) {
  if (route?.tempo === 'three') return null;
  return takeoffCueCore(route, tick, approachLeadTicks, staleTicks);
}

// Phase 5 W2 核心-2（假動作全員演出）：**未被選中的**攻擊手（誘餌）沒有真正的
// hitPoint——沒有球會真的送到他們手上，二傳觸球後也不會有人替他們預測接觸點。
// 他們唯一能用的時間錨點就是 sim 規劃期就排定好的 route.takeoffTick 本身，
// 所以三速也吃這條路徑（＝earlyTakeoffCue 拿掉三速排除）。這正是「三速等二傳
// 觸球才起步」這個節奏差異，在誘餌身上唯一能被畫面呈現出來的地方。
export function decoyApproachCue(route, tick, approachLeadTicks, staleTicks) {
  return takeoffCueCore(route, tick, approachLeadTicks, staleTicks);
}

// 本球「被選中的攻擊手」的一速／二速起跳計畫；key＝每個助跑計畫只播一次的識別。
// 用 approach.setTick（一傳後定案、整個第三擊期間不變）而不是 flightId——二傳觸球
// 會換 flight，用 flightId 當旗標會讓早跳與既有路徑各播一次＝跳兩下
function earlyTakeoffOf(aiState) {
  const app = aiState.approach;
  if (!app?.routes?.length || app.setTick == null || !aiState.attackerId) return null;
  const route = approachRouteOf(app.routes, aiState.attackerId);
  if (!route || route.tempo === 'three' || route.takeoffTick == null) return null;
  return { route, key: `${app.team}:${app.setTick}:${aiState.attackerId}` };
}

const REPLAY_TAIL = 180;   // 回放最後 180 tick（3 秒）
const REPLAY_SPEED = 0.5;  // 半速
const TAPE_TAIL = 240;     // 情蒐錄影帶：尾段 4 秒、略快於一般回放

export function startMatchLoop({ ctx, config, gates, stage, careerCtx, playerId, game, aiState }) {
  const s = createLoopState({ ctx, config, gates, stage, careerCtx, playerId, game, aiState });
  bindInputHandlers(s);
  // W6 換人：面板的執行回呼（sim applySubstitution 唯一路徑）＋關板補播敘事對話
  if (stage.subPanel) {
    stage.handlers.requestSub = (outId, inId) => requestSubstitution(s, outId, inId);
    stage.handlers.onSubPanelClose = () => {
      if (s.pendingSubLines.length && stage.teachDialog) {
        stage.coachOptionDialog?.hide(); // 卡位互斥防呆（同 bottom:26px）
        stage.teachDialog.show(s.pendingSubLines);
        s.pendingSubLines = [];
      }
    };
  }
  // 【已刪除・2026-08-02 卷五裁定 1】原本此處有 `handlers.callPlay`／`calledPlayOf`：
  // 死球窗叫套路的寫入與讀取管道（路徑甲）。整條退場——玩家在死球窗不知道自己被排到
  // 哪條線、也不知道一傳品質，叫的是願望不是決策。戰術入口統一到球內遠段（路徑乙，
  // 寫 `aiState.replanCall`，見本檔 `!setReady` 分支）。
  // W7 B3：我方暫停鈕的執行回呼（sim applyTimeout 唯一路徑）
  stage.handlers.requestTimeout = () => requestTimeout(s);
  // W7 C2④：回場鈕的執行回呼（sim applySubstitution 唯一路徑，走與 ⚙ 面板相同函式）
  stage.handlers.requestComeback = () => requestComeback(s);
  // W7.1 二輪：暫停「提早開賽」（真實 30s 窗，玩家可縮短到走回位緩衝）
  stage.handlers.requestTimeoutResume = () => resumeFromTimeout(s.game);
  // 偵錯把手：供自動化測試與真機除錯檢視執行期狀態（不參與遊戲邏輯）
  window.__phase1 = {
    game: s.game, aiState: s.aiState,
    renderer: s.ctx.renderer, scene: s.ctx.scene, camera: s.ctx.camera,
    quality: s.ctx.quality, rig: s.stage.rig,
    vcr: () => s.vcrLast,             // 上一球的回放資料
    controlled: () => s.controlledId, // 當前受控球員（輪控除錯）
    tapeCount: s.config.tapeClips.length, // 情蒐錄影帶卷數（測試用）
    floatText: stage.floatText,       // 字卡把手（W6.1 疊排的自動化驗證用）
    cardStats: () => stage.floatText.stats(), // W7.1：字卡遙測（真人實玩後查密度）
    cameraTuning: CAMERA_TUNING,      // W8：鏡位即時調參（真機/自動化改值即生效，免重建）
    loop: () => s,                    // W4：迴圈狀態檢視（openingShow/venue 等自動化驗證用）
  };
  // W7.1 六輪：?probe=cards 字卡壓力探針——自動比賽觸發不到主角字卡（自動接球拿不到
  // Perfect、不主動攔網），密度/遮擋無法自動驗證。本旗標以「真人激戰上限」節奏
  // 週期性注入代表性字卡，供 Playwright 量疊排深度/FPS；純表現層、sim 完全不碰
  if (ctx.params.get('probe') === 'cards') startCardProbe(s);
  // W4(P4) Q10 主客場氛圍：關鍵戰館打宿敵＝應援音場偏對手（對手得分聲量放大、我方縮）
  if (s.config.venue?.rivalAway) stage.sfx.setCrowdBias?.({ A: 0.75, B: 1.35 });
  // W4(P4) Q10 冠軍館燈光秀開場：暗場→聚光逐盞亮→巡場（sim 凍結、點擊可跳過）；
  // 演出結束才播情蒐帶（決賽時序：燈光秀→錄影帶→發球）；局間存檔續玩不重播
  const showFirst = s.config.venue?.key === 'final' && !careerCtx?.resumeMid;
  if (showFirst) s.openingShow = 'pending';
  if (s.config.tapeClips.length && !showFirst) startTapeClip(s); // 生涯開賽：先播情蒐錄影帶（點擊跳過）
  showTeachPreview(s); // 學招預告字幕（拍板 07-23：情蒐帶開頭；無帶素材時開賽直接顯示）
  // W4(P4) Q8 局間存檔續玩：快照開機即在 set_break（prevPhase 同值＝一次性轉場
  // 不會觸發）——直接喚起局間 huddle，「從局間 huddle 前恢復」的拍板語意
  if (game.phase === 'set_break') showSetBreak(s);
  // W4(P4) 附錄 B-4：宿敵 ace pid 解析（rival 隊限定——ace 反讀的對象；
  // 宿敵人設未落檔時 def.rival ace 名對不上＝null＝機制沉睡，零擾動）
  // 練習賽科目 HUD 的開場值（0/N 一開始就看得見——不必等第一個死球才知道要練什麼）
  // 教學局走另一份（一次只亮一步）——兩者互斥，不要同時畫兩張表
  if (s.tutorial) refreshTutorialHud(s);
  else if (s.practiceDrills.length) refreshPracticeHud(s);
  if (careerCtx) {
    const rivalBase = opponentById(careerCtx.matchEntry?.opponentId);
    if (rivalBase?.rival) {
      const rivalDef = applySeasonRoster(rivalBase, careerCtx.seasonIndex ?? 1);
      const aceName = rivalDef.ace?.name ?? null;
      s.rivalAcePid = aceName
        ? Object.values(game.players).find((p) => p.teamId === 'B' && p.name === aceName)?.id ?? null
        : null;
    }
  }
  // 燈光秀跳過（點擊任意處）：立即恢復常態燈光、進正常開賽流程
  window.addEventListener('pointerdown', () => {
    if (s.openingShow === 'running') endOpeningShow(s);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) s.last = performance.now();
  });
  s.rafFn = (now) => frameStep(s, now);
  requestAnimationFrame(s.rafFn);
}

// W7.1 六輪：字卡壓力探針（?probe=cards）——每 5 秒打一輪「一球內連續建功」的極端組合
// （擦手→晃過→Perfect 700ms 內三連），另每 15 秒補氣勢滿檔卡；量疊排深度與 FPS 用。
// 只在旗標下啟動，正常遊玩零影響
const PROBE_BURST = [
  ['👆 擦到了——快補！', '#6ee7ff', 2200],
  ['🎭 晃過攔網！', '#ffd166', 2200],
  ['✨ PERFECT!', '#60ffa0', 2400],
];
function startCardProbe(s) {
  let round = 0;
  setInterval(() => {
    round += 1;
    PROBE_BURST.forEach(([text, color, dur], i) => {
      setTimeout(() => s.stage.floatText.show(text, color, dur), i * 300);
    });
    if (round % 3 === 0) {
      setTimeout(() => s.stage.floatText.show('🔥 氣勢如虹！', '#6ee7ff', 2600), 900);
    }
  }, 5000);
}

// 迴圈狀態（顯式集中；欄位即文件）
function createLoopState({ ctx, config, gates, stage, careerCtx, playerId, game, aiState }) {
  return {
    ctx, config, gates, stage, careerCtx, playerId,
    game, aiState,
    seed: config.seed,          // 快速比賽局終點擊換局：seed+1 再開
    servedThisTurn: false,      // 每個發球回合只處理一次發球決策
    chaseExpanded: false,       // 批 7 追發：發球面板是否已展開到「發給誰」那一層
    whistledServe: false,       // 每個發球回合只吹一次發球前短哨
    diveReady: false,           // 魚躍鈕當幀可用性（Space/L 鍵共用判定）
    // 假動作熟練度：場終一次累積寫回 Player；局間存檔續玩＝接回快照時的累計
    feintsUsedThisMatch: careerCtx?.resumeMid?.feintsUsed ?? 0,
    // W4 Q9 L 改判記帳（box score 第四欄；表現層 tally，同 feints 續玩接回）
    lOverrideTally: careerCtx?.resumeMid?.lOverrides ?? { n: 0, ok: 0 },
    digReadWasOverride: false,
    boxShown: false, // 局終兩段式：第一次點＝單場結算頁；返回生涯改走面板內「關閉」鈕（U1）
    // W4 附錄 B：L 2.0 配套統計（ace 反讀的資料底；scoutTally 鏡像決定論）＋宿敵 ace
    schemeTally: { total: 0, counts: {} },
    rivalAcePid: null,       // 宿敵 ace 的 pid（rival 隊限定；startMatchLoop 解析）
    counterArmedFlight: -1,  // 本波 ace 反讀已武裝（字卡揭曉用）
    // W4：自由人回場二次確認窗（07-27 拍板 B；performance.now 時刻）
    recallArmedUntil: 0,
    // 07-27 四輪：L 封線卡時刻（同波讀對/讀反不疊發——一波至多一張結果卡）
    lWallCardAt: -1e9,
    // 07-27 六輪：影子收帶排程（我方第一觸後 +1.2s 收；0＝未排程）
    shadowFadeAt: 0,
    // W4 B-3：封線影子首次教學（07-27 試玩回饋「看不懂黑色陰影」——每場一次講色語）
    shadowHintShown: false,
    // W4 題3/題5：二次球真值字卡追蹤（實際出手才立旗）＋OPP 要球窗
    dumpLive: false,
    callWindowUntil: 0,   // 浮鈕失效時刻（0.8s 牆鐘窗）
    // B1 內切：2026-08-07 起窗長不由 UI 記時（唯一真相＝sim 的 cutStateOf），
    // 這裡只留「這次的結算回饋播過了沒」。
    cutFeedbackDone: false,
    // MEDIUM-2：sim 端 cutOutcome 的鎖存（壽命短於一個 rAF，見 captureCutOutcome）
    cutOutcomeLatch: null,
    // 夾塞窗（2026-08-07，OPP）：三個欄位逐項對應上面內切的兩個，外加「被排進夾塞」
    // 字卡的去重鍵與待播旗（裁定 2：三種來源共用一個出口）
    tandemFeedbackDone: false,
    tandemOutcomeLatch: null,
    // HIGH-1（覆審修）：字卡以「第二觸窗」為邊緣觸發，不用 flightId 當鍵（那個一波跳三次）
    tandemAssignArmed: true,
    tandemAssignPending: false, // null／'mine'／'decoy'
    // 誘餌獎金入帳字卡（2026-08-08，OPP 夾塞可見度裁定）：見 captureComboAssistCredit。
    // flightId 全場單調遞增，去重不需要額外的「播過了」旗標——記上一次消費過的
    // flightId 就夠，同一個 flightId 只可能對應同一次入帳。
    comboCreditLatch: null,
    comboCreditSeenFlight: -1,
    // 職業章批 4b（改叫）：子選單目前開著沒——鈕的可見性判斷要看它（避免選單開著
    // 時鈕又自己跳回來，見鈕可見性管理區塊的說明），選定或窗關都會把它撥回 false。
    audibleMenuOpen: false,
    // 教學可見性批（08-27）：最後一次改叫的 flightId——syncCallFeedback 憑它把結算
    // 字卡從「⚡指令」換成「📢改叫」（純顯示分流，flightId 全域遞增故不需清）。
    audibleIssuedFlight: null,
    // 屆間養成卷 E2（2026-08-09）：默契配對記帳（{隊友id: 次數}）。
    // ★ 落在 app 層＝純觀察 ★ 裁定書 do-not-touch 7 要求「sim 判定路徑一個位元組不改」，
    // 記在這裡才結構性滿足它（也避開 season-combo-gate 的 SEASON-SCAN 鐵律）。
    // 真相源仍是 `aiState.attackCombo`（sim 自寫），本層不重判組合成立與否。
    // 續玩接回同 feintsUsed／lOverrides 範式。
    chemistryTally: careerCtx?.resumeMid?.chemistry ?? {},
    chemistryWindow: null, // 第二觸窗內的鎖存（出窗才結算，見 captureChemistryPair）
    calledFlight: -1,     // 本 flight 已出現過浮鈕（每波一次）
    pendingCallIntent: false, // tap → 下一 sim tick 注入 'call' Intent（VCR 同錄）
    attackDecidingSince: -1,    // 讀攔網 slow 檔的上色計時起點
    slowEaseFrom: -1e9,         // 決策窗結束時刻（時間膨脹 0.4→1.0 緩出的起點）
    tapeIdx: 0,
    // VCR 資料底（4.6 v2）：每球錄「發球前 game＋aiState 快照＋玩家 Intent 流」；
    // AI 那十一份 Intent 重演時重算（§3-0 容量裁定）——重演仍逐格一致
    recorder: createRallyRecorder(),
    vcrLast: null,
    replay: null,               // { player, acc, tape? }
    prevPhase: game.phase,
    fovPunchUntil: 0,
    rallyStartFlight: 0,        // 本球起始 flight（rally 長度＝歡呼強度）
    controlledId: playerId,
    switchKey: '',
    lastWindupFlight: -1,       // AI 攻擊手起跳動畫：每個 flight 只播一次
    lastApproachFlight: -1,     // 同上，助跑段（零跳躍）獨立旗標
    lastReadyFlight: -1,        // 同上，接球/舉球預備段
    lastContactFlight: -1,      // 同上，擊球動作提前觸發（每 flight 一次）
    lastSwingFlight: -1,        // 同上，扣球擊球弧（三段式段③，每 flight 一次）
    lastWaitFlight: -1,         // Phase 5 W1 §2-3：等待姿勢（transitionWait），每個 flight 只播一次
    earlyApproachKey: '',       // §4 追修：一速助跑起手已播的助跑計畫（每計畫一次）
    earlyTakeoffKey: '',        // 同上，離地（吃 sim 的 route.takeoffTick）
    // Phase 5 W2 核心-2：誘餌（未被選中的攻擊手）逐人旗標——單人字串不夠用，
    // 全員都要各自的「這個計畫播過沒」記憶。key 同 earlyApproachKey 的格式
    // （team:setTick:pid），value 是最後一次觸發的 key（比對用，不是布林）
    decoyApproachKeys: new Map(), // 助跑起手（approach3/4）
    decoyTakeoffKeys: new Map(),  // 起跳（windup；收勢取捨見 updateAssistAndPoses 註解）
    hitStopUntil: 0,            // 打擊感（juice）：擊球定格、螢幕震動、重扣慢動作
    slowUntil: 0,
    shake: 0,
    ballGlowUntil: 0,           // 丙3：完美接球——球體發光時窗（NJ-4）
    lastTouch: null,            // 最後觸球（死球時推導得分原因用）
    pendingDead: null,          // DEAD_BALL 先到、SCORE 緊隨（同批事件）：湊齊才顯示面板
    assistFlight: -1,
    assistLanding: null,
    // W6 壯舉達成字卡（新增採納 3）：本場對手未達成的 feat 條件清單，死球增量檢查
    recruitWatch: buildRecruitWatch(careerCtx, playerId, matchRoleOf(game, playerId)),
    // 練習賽卷（2026-08-12）：本場科目清單（非練習賽＝空陣列＝所有掛點短路）
    practiceDrills: careerCtx?.practice?.drills ?? [],
    practiceRows: [],       // 最近一次結算的逐科目狀態（HUD 與結算面板共用同一份）
    practiceFired: new Set(), // 已彈過「科目完成」字卡的科目 id（一科一卡）
    practiceSettled: null,  // 賽末結算結果（結算面板讀）
    // 教學局（2026-08-12）：一次只練一步的步進機（非教學局＝null＝所有掛點短路）。
    // ★ 不落存檔 ★ 教學局零獎勵、打到一半離開就是沒打——沒有東西需要被保護
    tutorial: careerCtx?.practice?.tutorial ? createTutorialState(0) : null,
    tutorialGreeted: false,   // 開場第一句教練喊話（要等 stage.commentary 拿得到 now）
    tutorialEnded: false,     // 六步走完、已經提前收局（一次性）
    tutorialNextLine: null,   // 排隊中的下一句教練喊話 { at, text }
    pendingSubLines: [], // 面板開著時累積的換人對話，關板一次播（teachDialog z 序在面板下）
    // W7 C1②：主角低體力教練建議——每場最多一次
    staminaAdviceShown: false,
    // W7 C2②：板凳狀態轉換偵測（false→true 那一幀自動開一次 ⚙ 儀表板）
    wasBenched: false,
    // W4(P4) Q10 冠軍館燈光秀：null｜'pending'｜'running'（牆鐘驅動、sim 凍結、可跳過）
    openingShow: null,
    openingTapeStarted: false, // 燈光秀後補播情蒐帶（一次性）
    // W7.1 #3A：目前正在集合帶位/倒數的暫停隊伍（'A'|'B'|null）——matchLoop 唯一事實源，
    // matchView/countdown 都吃這個
    timeoutHuddleTeam: null,
    // W8（07-26 試玩回饋）：對手教練選項待報——暫停當下播報會與「喊暫停」擠同一瞬間
    // 且 3s 就過期（玩家正在讀自己的選項面板），改存到散圈回場那一刻才浮字告知
    pendingOppBoost: null,
    // W7.1 #4①：滿檔字卡「跨進才發」的比對基準（同 sim momentum 初值 0）
    prevMomentumValue: 0,
    // 4.5B §3 招牌演出：pendingSig＝武裝中的候選（成因已發生、勝負未定）；
    // sigBeat＝起鏡中的演出窗（SCORE 後、SERVE 前）；keyPointRally＝本球是否關鍵分
    //（發球當下判定——局點/賽點恆全版）；callLive＝要球喊聲已出、等兌現
    pendingSig: null,
    sigBeat: null,
    keyPointRally: false,
    lastOppSpikerId: null,
    callLive: false,
    presentation: createPresentationCtx(careerCtx),
    // 4.5B §4：diegetic 決策耗時（窗開→指令送出；硬性驗收數據，落結案快照）
    latencyStats: createLatencyStats(),
    setWindowSince: -1,
    digWindowSince: -1,
    // 4.5B §7：局間圍攏過場的圈內第一人稱段（演出時鐘置真、卡片開啟/續局收回）
    breakHuddleFPV: false,
    last: performance.now(),
    accumulator: 0,
    rafFn: null,
  };
}

// 4.5B §2-3 頻率框架的存取面：生涯＝store 持久（跨屆、逐槽）；快速比賽＝session
// 記憶（無槽可落——裁量記錄於 4.5B 快照）。演出偏好＝全域 localStorage 單鍵。
function createPresentationCtx(careerCtx) {
  const store = careerCtx?.store;
  let seen = store?.loadSeenSignatures?.() ?? {};
  const pref = typeof window !== 'undefined' && window.localStorage
    ? loadPresentationPref(window.localStorage) : 'on';
  return {
    pref,
    isSeen: (k) => !!seen[k],
    markSeen: (k) => {
      seen = { ...seen, [k]: true };
      store?.markSignatureSeen?.(k);
    },
  };
}

// 4.5B §3 起鏡：頻率框架決定 full/short/off → 設演出窗＋沿用既有慢動作機構
//（slowUntil 0.35×＋FOV 收緊）；OPP＝與 S 的專屬擊掌（信任下注回報可視化）。
// 真值字卡（🎭/🧱/pointBanner）不經此處——off 只省演出、不吃資訊。
function fireSignatureBeat(s, pending, now) {
  const { stage, game } = s;
  const key = sigKey(pending.kind);
  // ★ 批3：這裡只服務 oh/mb/opp/line 四道現場演出 ★ 網口對決（批1 走這條）已改走
  // 即時 highlight 重播，`mine`／markSeen 的 netduel 分支一併移除（不留死碼）——
  // 四道都只在我方得分才走得到這裡（signatureFire 對對方得分回傳 null）。
  const plan = planSignatureBeat({
    kind: pending.kind,
    pref: s.presentation.pref,
    seen: s.presentation.isSeen(key),
    keyPoint: s.keyPointRally,
    now,
  });
  if (!plan) return;
  s.presentation.markSeen(key);
  let mateId = pending.mateId;
  if (pending.kind === 'opp' && !mateId) {
    const me = game.players[s.playerId];
    mateId = Object.values(game.players).find((p) => p.teamId === me.teamId
      && p.currentRole === 'setter'
      && game.match.rotations[me.teamId].includes(p.id))?.id ?? null;
  }
  s.sigBeat = {
    kind: pending.kind, focusId: pending.focusId, mateId,
    at: pending.at ?? null, until: plan.until,
  };
  s.slowUntil = Math.max(s.slowUntil ?? 0, plan.until);
  if (pending.kind === 'opp') {
    stage.matchView.triggerPose(s.playerId, 'highfive');
    if (mateId) stage.matchView.triggerPose(mateId, 'highfive');
  }
}

// 段 E：叫套路的回饋層（裁定 E「湊不出套路當場回饋失敗、不得靜默降級」
// ＋ UI 硬性要求「兩種語意的回饋必須分得開」）。
// `callOutcome` 是**狀態**不是事件（協調層寫一次、逐幀讀得到），所以要自己記已播過
// 的鍵，否則同一則字卡會每幀重播。
function syncCallFeedback(s) {
  const out = s.aiState.callOutcome;
  if (!out) return;
  // ★ 卷五裁定 2（2026-08-02）：**戰術只管一球** ⇒ 防重播鍵回到 `flightId` ★
  //   段 3 的「整個 rally 持續有效」語意退場後，指令不再跨波重新解析——每一波最多
  //   產生一個 callOutcome（`replanCall` 一經消費即清）。用比分當鍵反而會把「同一分
  //   內兩波各改判一次」壓成只播一則；鍵含 outcome ⇒ 同一波內結果改變仍播得出來。
  const key = `${out.flightId}:${out.mode}:${out.outcome}:${out.reason ?? ''}:${out.type}`;
  if (s.callFeedbackKey === key) return;
  s.callFeedbackKey = key;
  // 08-27 教學可見性批：這一筆若來自 📢 改叫（UI 端 latch 對 flightId），字卡印「📢改叫」
  // ——按 📢 得到 ⚡ 會讓人不確定「我按的那顆有沒有算」。latch 不清：flightId 全域遞增，
  // 舊值對不上任何新 outcome
  const fromAudible = out.flightId != null && out.flightId === s.audibleIssuedFlight;
  const fb = callFeedbackOf(out, s.aiState.approach?.routes ?? null,
    fromAudible ? { audible: true } : null);
  if (fb) s.stage.floatText?.show(fb.text, fb.color, fb.ms);
}

// W6 換人執行（stage.handlers.requestSub）：sim 換人＋敘事對話
// W7 C3：回歸字卡改吃 sim COMEBACK_SPARK（subLog 單一事實源）——本函式不再自己記
// subOuts/comebackWatch（W6 舊路徑已刪，見 applyEvents 的 COMEBACK_SPARK 分支）
function requestSubstitution(s, outId, inId) {
  const team = s.game.players[s.playerId].teamId;
  const r = applySubstitution(s.game, { team, outId, inId });
  if (r.ok) {
    const outName = s.game.players[outId].name;
    const inName = s.game.players[inId].name;
    // 換人敘事（新增採納 6；命名工程 07-25 定稿）
    s.pendingSubLines.push(
      { speaker: '教練', text: `${outName}，先下來喘口氣。${inName}——上，讓他們看看板凳的火力！` },
      { speaker: inName, text: '交給我！' },
    );
  }
  return r;
}

// W7 C2④ 回場：找出可換下的場上球員——優先「當初接替主角的那人」（追蹤 SUBSTITUTION
// 事件最近一筆 outId===主角 的 inId，仍在場上才算數）；否則任一場上同位置（含 S↔OPP
// 例外，沿用 subPanel 換人面板同一套合法性）非自由人隊友。純函式，UI 反灰與實際執行共用。
export function findComebackOut(game, playerId) {
  const team = game.players[playerId].teamId;
  const myRole = game.players[playerId].currentRole;
  const rot = game.match.rotations[team];
  let lastReplacer = null;
  for (const e of game.events) {
    if (e.type === 'SUBSTITUTION' && e.team === team && e.outId === playerId) lastReplacer = e.inId;
  }
  if (lastReplacer && rot.includes(lastReplacer)) return lastReplacer;
  return rot.find((id) => {
    const p = game.players[id];
    return p.currentRole !== 'libero' && roleSwapOk(myRole, p.currentRole);
  }) ?? null;
}

// 回場鈕可用性（UI 反灰＋理由）：死球窗＋額度＋場上有可換下的同位置隊友
// export：測試只需傳 { game, playerId }（loop state 的其餘欄位本函式不讀）
export function comebackAvailability(s) {
  const { game, playerId } = s;
  const team = game.players[playerId].teamId;
  if (game.phase !== 'serve') return { enabled: false, reason: '只能在死球時回場' };
  // W4（07-27 Sawmah 拍板 B）：被自由人替換者＝走 recall 路徑——FIVB 替換不算換人、
  // 不吃額度；防守變弱是真代價（二次確認在 requestComeback）
  if (game.liberos?.[team]?.replacedId === playerId) return { enabled: true, reason: '' };
  if ((game.subs[team]?.remaining ?? 0) <= 0) return { enabled: false, reason: '換人次數已用盡' };
  if (!findComebackOut(game, playerId)) return { enabled: false, reason: '場上找不到可換下的同位置隊友' };
  return { enabled: true, reason: '' };
}

// W7 C2④ 回場鈕執行（獨立按鈕，非走 ⚙ 面板——儀式感是拍板重點）：走與 ⚙ 面板相同的
// sim 唯一路徑 applySubstitution（outId=找到的替補、inId=主角）
function requestComeback(s) {
  const { game, playerId } = s;
  const team = game.players[playerId].teamId;
  // W4（07-27 Sawmah 拍板 B）：自由人配對回場——二次確認（防守變弱是真代價，
  // 講清楚再換；4 秒確認窗，同刪檔二段語彙）
  if (game.liberos?.[team]?.replacedId === playerId) {
    if (!s.recallArmedUntil || performance.now() > s.recallArmedUntil) {
      s.recallArmedUntil = performance.now() + 4000;
      s.stage.floatText.show('確定換下自由人、自己守後排？——再按一次確認', '#ffb454', 2600);
      return { ok: false, reason: 'confirm' };
    }
    s.recallArmedUntil = 0;
    const r = applyLiberoRecall(game, { team });
    if (r.ok) s.stage.floatText.show('🔥 自己來！——自由人退場', '#ffd166', 1600);
    return r;
  }
  const outId = findComebackOut(game, playerId);
  if (!outId) return { ok: false, reason: 'no-target' };
  const r = applySubstitution(game, { team, outId, inId: playerId });
  if (r.ok) s.stage.floatText.show('🔥 回到場上！', '#ffd166', 1500);
  return r;
}

// 場上球員體力平均（純函式，供教練選項「回了多少%」量測與測試）：team 全隊平均、
// stamina 未啟用回 null（呼叫端據此省略百分比顯示）
export function avgStamina(game, team) {
  if (!game.stamina) return null;
  const ids = game.match.rotations[team];
  if (!ids?.length) return null;
  return ids.reduce((sum, id) => sum + (game.stamina[id] ?? 1), 0) / ids.length;
}

// W7 B3 我方暫停（stage.handlers.requestTimeout）：sim 執行＋集合帶位＋倒數條啟動＋
// 教練選項對話框（W7.1 #3A，取代舊版被動浮字——Sawmah 原話「不知道按了獲得什麼」）
function requestTimeout(s) {
  const team = s.game.players[s.playerId].teamId;
  const r = applyTimeout(s.game, { team });
  if (r.ok) {
    s.timeoutHuddleTeam = team; // 集合帶位＋倒數條共用同一個事實源
    s.stage.commentary?.onEvents(
      [{ type: 'TIMEOUT', tick: s.game.tick, team, remaining: s.game.timeouts[team].remaining }],
      s.game, s.aiState, performance.now(), s.controlledId,
    );
    // 教練選項（不選也行——死球窗結束 matchLoop 會自動收，boost 在 sim 端也會過期作廢）；
    // 與 teachDialog 同一卡位，開前防呆收一次避免疊字
    s.stage.teachDialog?.hide?.();
    s.stage.coachOptionDialog?.show((boost) => requestTimeoutBoost(s, team, boost));
  }
  return r;
}

// W7.1 #3A②：教練選項執行——calm/fire 擇一呼叫 sim applyTimeoutBoost，顯示效果浮字後收對話框
function requestTimeoutBoost(s, team, boost) {
  const { game, stage } = s;
  const before = boost === 'calm' ? avgStamina(game, team) : null;
  const r = applyTimeoutBoost(game, { team, boost });
  if (r.ok) {
    stage.matchView.setHuddlePlay(team, boost); // W8：教練在戰術板上畫本次選擇
    if (boost === 'calm') {
      const after = avgStamina(game, team);
      const suffix = before !== null && after !== null
        ? `（+${Math.max(0, Math.round((after - before) * 100))}%）` : '';
      stage.floatText.show(`🧘 呼吸回來了${suffix}！`, '#6ee7ff', 1800);
    } else if (boost === 'fire') {
      stage.floatText.show('🔥 場子熱起來了！', '#ff9d7a', 1800);
    }
  }
  stage.coachOptionDialog?.hide();
  return r;
}

// W6 壯舉字卡監看清單：只收本場對手、有 feat 軸、未招募且尚未達標的招募槽；
// wins/stage 軸不在此列（完成點在賽末，入隊儀式已涵蓋該節拍）
// export＝接線驗收用（`tests/recruit-alt-path-wiring.test.mjs` 直接呼叫真正的這兩支，
// 沿 `updateAssistAndPoses` 的既有慣例——字卡的價值全在接線上，源碼掃描驗不到）
export function buildRecruitWatch(careerCtx, playerId, role = null) {
  const opponentId = careerCtx?.matchEntry?.opponentId;
  const rec = careerCtx?.store?.loadRecruitment?.();
  if (!opponentId || !rec || !playerId) return [];
  const seasonIndex = careerCtx?.seasonIndex ?? 1;
  const watch = [];
  for (const [key, cond] of Object.entries(RECRUIT_CONDS)) {
    if (cond.opponentId !== opponentId || !cond.feat) continue;
    if (rec.recruited.includes(key)) continue;
    // ★ 2026-08-09 Sawmah 裁定：對象已畢業＝字卡乾脆不跳 ★
    // 真人第 3 屆兩度看到「⭐ 招募條件達成」卻賽後零入隊——字卡端與入隊端
    // （`settleRecruitJoins`）本來就不是同一份判準：入隊端查 `recruitTargetGone`，
    // 這裡沒查。12 個招募對象裡 7 個會中途畢業、其中 6 個帶 feat 軸 ⇒ 畢業後
    // 字卡照發是常態不是邊角。修在監看清單這一層（而不是發卡那一層）：
    // 人都畢業了，整場比賽根本不必監看他。progress 照舊保留（「歷史就是歷史」）。
    if (recruitTargetGone(key, seasonIndex)) continue;
    // ★條件早就成立的槽不再監看（08-11 第二輪覆審 N1，這是我自己引進的倒退）★
    // 舊碼用「base feat 已達標＝整槽退出監看」短路，改成逐軸過濾之後，**達標但卡在
    // 名冊滿編等候名單**的槽會在往後每一場重新彈「⭐ 招募條件達成」——正是 08-09
    // 真人被騙的那個現象（字卡照發、賽後零入隊），成因從「畢業」換成「滿編」。
    if (conditionMet(rec, key)) continue;
    // 08-11 替代路徑卷：監看清單要連 altFeats 一起收——否則走替代軸的玩家達成當下
    // 不會彈卡（進度照樣累加，但畫面不說＝「系統改寫了玩家的操作卻沒告訴他」那一族）。
    // 逐軸各帶自己的 base；已達標的軸不必監看。
    const p = progressOf(rec, key);
    // isBase＝原壯舉軸（進度存在 progress.feat，不在 alts 底下）。用顯式旗標而不是
    // 拿物件識別去比對 cond.feat——後者在任何人複製一次 cond 之後就會靜默失效
    // 只監看「這個位置走得到」的替代軸（`altFeatsFor`）——監看清單與判定端、顯示端
    // 共用同一支過濾器，否則會對著一條玩家根本累加不了的軸等一輩子
    const axes = [
      { f: cond.feat, base: p.feat, isBase: true },
      ...altFeatsFor(cond, role).map((f) => ({ f, base: p.alts[f.type] ?? 0, isBase: false })),
    ].filter((a) => a.base < a.f.count);
    if (!axes.length) continue;
    // 這張卡只驗壯舉軸，wins 的完成點在賽末——所以卡面要把「還缺什麼」講出來
    // （`needStage` 目前**沒有任何槽觸發**：12 槽裡唯一帶 stage 的 sky-hawk 沒有 feat 軸、
    // 根本不進監看清單；留著是前瞻性防禦，不是已驗過的路徑）
    // （08-11 覆審 HIGH）：08-09 真人已被「⭐ 招募條件達成」騙過一次（字卡照發、
    // 賽後零入隊），替代軸讓這張卡變頻繁之後，那個誇大會被放大成常態。
    const remainWins = cond.wins == null ? 0 : Math.max(0, cond.wins - p.wins);
    const needStage = !!cond.stage && !p.stageCleared;
    watch.push({
      key, cond, axes, fired: false, remainWins, needStage,
    });
  }
  return watch;
}

// 死球時增量檢查：本場 feat 增量＋既有進度過門檻＝當場彈卡（一場一卡不重複；
// 純 UI 演出——真正的進度累加仍在賽末 settleCareerMatch，不在此寫入）。
// W6.1 T2：改走同框節流佇列——被更高優先字卡擠掉時不標 fired，下個死球重驗再出（不丟失）
export function checkRecruitFeats(s, cards) {
  if (!s.recruitWatch.length) return;
  const myTeam = s.game.players[s.playerId]?.teamId ?? 'A';
  const role = matchRoleOf(s.game, s.playerId);
  for (const w of s.recruitWatch) {
    if (w.fired) continue;
    const featGain = featGainFor(s.game.events, s.playerId, myTeam, w.cond);
    const altGains = altGainsFor(s.game.events, s.playerId, myTeam, w.cond, role);
    // 一場一卡（沿用原節拍）：任一軸先達標就發那一軸的卡，卡面寫的是**真正達成的那條路**
    const hit = w.axes.find((a) => {
      const gain = a.isBase ? featGain : (altGains[a.f.type] ?? 0);
      return a.base + gain >= a.f.count;
    });
    if (hit) {
      const def = opponentById(w.cond.opponentId);
      // 還缺的軸如實寫進卡面；全都到位了才敢說「招募條件達成」
      const lacks = [];
      if (w.remainWins > 0) {
        lacks.push(w.remainWins === 1 ? '還需贏下這場' : `還差 ${w.remainWins} 勝`);
      }
      if (w.needStage) lacks.push('還需在淘汰賽擊敗');
      const head = lacks.length ? '壯舉達成' : '招募條件達成';
      const tail = lacks.length ? `（${lacks.join('・')}）` : '';
      cards.push({
        pri: 40,
        text: `⭐ ${head}：${def?.name ?? ''}・${hit.f.label}${tail}`,
        color: '#ffd166',
        dur: 1600,
        onShown: () => { w.fired = true; },
      });
    }
  }
}

// ════════════════════════════════════════════════════════════════
// 練習賽科目：死球節拍的增量檢查（範式逐項比照上面的 checkRecruitFeats）
// ════════════════════════════════════════════════════════════════
// ★ 判定不在這裡 ★ 一律呼叫 `career/practiceMatch.settlePractice`——賽中 HUD、
// 賽中字卡、賽末結算三處看到的是**同一支函式**算出來的同一組數字。
// 賽中重算一份「大概的進度」是本專案踩過的坑（喊一件事判另一件事）。
// 純 UI 演出：真正落檔仍在賽末 settlePracticeMatch，這裡一個字都不寫。
export function refreshPracticeHud(s, cards = null) {
  if (!s.practiceDrills.length) return;
  const myTeam = s.game.players[s.playerId]?.teamId ?? 'A';
  const settled = settlePractice({
    events: s.game.events, playerId: s.playerId, myTeam, drills: s.practiceDrills,
  });
  s.practiceRows = settled.results;
  s.stage.practiceHud?.update(settled.results);
  if (!cards) return;
  for (const r of settled.results) {
    if (!r.achieved || s.practiceFired.has(r.id)) continue;
    cards.push({
      pri: 40, // 與招募壯舉卡同級（同樣是「你剛剛達成了一件被明講過的事」）
      text: `✅ 科目完成：${r.label}`,
      color: '#ffd166',
      dur: 1600,
      // 被更高優先字卡擠掉時不標 fired，下個死球重驗再出（同 checkRecruitFeats 的不丟失）
      onShown: () => { s.practiceFired.add(r.id); },
    });
  }
}

// ════════════════════════════════════════════════════════════════
// 教學局：逐步引導（2026-08-12）
// ════════════════════════════════════════════════════════════════
// ★ 不暫停 sim、不記比分壓力 ★ rally 照常打，變的只有「教練現在在教哪一步」。
// kickoff 題 4 原本寫「暫停等待完成」，實作時改成常駐引導：暫停 sim 會讓球停在半空、
// 而這六步全都要**球在動**才做得到（接球／攔網／發球），停下來反而練不成。
//
// ★ 判定與台詞全在 `career/practiceMatch.js` ★ 本函式只做三件事：什麼時候問、
// 問到之後喊哪一句、六步走完把局收掉。一行判定都不在這裡重刻。
// @returns true＝這一幀剛剛走完第六步（呼叫端據此收局）
export function updateTutorial(s, now) {
  if (!s.tutorial || s.tutorial.done) return false;
  const myTeam = s.game.players[s.playerId]?.teamId ?? 'A';
  const say = (text, ttl) => s.stage.commentary?.coach?.(text, now, ttl);
  // 排隊中的下一句（放行那一句講完才接上）——泡泡只有一格，同一幀連喊兩句＝
  // 玩家只會看到後面那句，前面那句等於沒講
  if (s.tutorialNextLine && now >= s.tutorialNextLine.at) {
    say(s.tutorialNextLine.text);
    s.tutorialNextLine = null;
  }
  if (!s.tutorialGreeted) {
    s.tutorialGreeted = true;
    s.tutorialRestageDue = true; // 第一步的場景也要擺（不是只有換步才擺）
    say(tutorialCoachLine(currentTutorialDrill(s.tutorial), 0));
  }
  // 一球打完了沒（rally → 非 rally 的那一幀）。重試判定要的是「這一球結束了」，
  // 不是「現在沒在打」——後者每一幀都成立，會讓每幀都算一次失敗
  const isRally = s.game.phase === 'rally';
  const rallyEnded = s.tutorialWasRally === true && !isRally;
  s.tutorialWasRally = isRally;
  observeTutorialBlockJump(s);
  const step = advanceTutorial(s.tutorial, {
    events: s.game.events, playerId: s.playerId, myTeam, tick: s.game.tick, rallyEnded,
    obs: s.tutorialObs,
  });
  s.tutorial = step.state;
  if (step.change) {
    // 換步／重試／放行都要重擺場景——但擺得成要等死球（見 applyTutorialStage）
    s.tutorialRestageDue = true;
    // 觀測量跟著歸零——語意與 advanceTutorial 重設 startEvent 的切片起點一致：
    // 這一步只算「這一步開始之後」發生的事，上一次起跳不得算進這一次
    s.tutorialObs = { blockJumps: 0 };
    const nextLine = step.state.done
      ? TUTORIAL_FINISH_LINE
      : tutorialCoachLine(currentTutorialDrill(step.state), step.state.attempts ?? 0);
    if (step.change === 'release') {
      say(TUTORIAL_RELEASE_LINE, TUTORIAL_RELEASE_TTL);
      s.tutorialNextLine = { at: now + TUTORIAL_RELEASE_TTL, text: nextLine };
    } else {
      say(nextLine);
      s.tutorialNextLine = null;
    }
  }
  if (s.tutorialRestageDue && applyTutorialStage(s)) s.tutorialRestageDue = false;
  updateCoachMarker(s, now);
  refreshTutorialHud(s);
  return !!step.change && step.state.done;
}

// 起跳攔網的觀測（`tut-block` 的判準）。★ 不是新事件 ★ sim 沒有「起跳攔網」事件，
// 而加一個會動到 sim-hash 的 `ev` 欄位（`tools/sim-hash-probe.mjs:91`）＝行為基準被推移。
// 改讀既有狀態：`actor.blockStartTick` 只在**新窗開啟**時被寫入
// （`sim/game.js:592-604`，註解自己寫「一新窗＝一跳」）⇒ 它的變動就是一次起跳。
function observeTutorialBlockJump(s) {
  if (!s.tutorialObs) s.tutorialObs = { blockJumps: 0 };
  const a = s.game.actors?.[s.playerId];
  if (!a) return;
  const t = a.blockStartTick;
  if (t !== s.tutorialLastBlockStart) {
    // 初次見到（undefined → 實際值）不算一次跳，否則開場就先送一次
    if (s.tutorialLastBlockStart !== undefined && t > -9999) s.tutorialObs.blockJumps += 1;
    s.tutorialLastBlockStart = t;
  }
}

// 教練光圈：這一步該站哪（目前只有攔網那一步有——理由見 coachMarkerTarget 上方）。
// ★ 純表現層 ★ 只讀 game／aiState 現成的值，一個判定都不在這裡算。
// 直線／斜線兩條過網線的中點 x（攔網圈用）。★ 沿用 blockCommitRead 已驗證的手法 ★
// —— 的裁定書寫過同一個結論：站到兩條過網線的中點，
// 而不是站到人身上。算不出來（沒有攻擊手／查不到那個人）＝回 null＝圈退回指攻擊手。
// ★ export 是為了讓探針量到**真的跑在遊戲裡的這一份** ★（02 §6.1 第 4 條：取得路徑）
// 探針自己抄一份公式來量＝循環論證，量到的是探針對不對，不是產品對不對。
export function blockAimMidX(game, attackerId) {
  if (!attackerId || !game?.actors?.[attackerId] || !game.players?.[attackerId]) return null;
  const from = game.actors[attackerId];
  const aims = spikeAimsFor(game, attackerId);
  if (!aims?.line || !aims?.cross) return null;
  return (netCrossingX(from, aims.line) + netCrossingX(from, aims.cross)) / 2;
}

export function updateCoachMarker(s, now = 0) {
  const marker = s.stage?.coachMarker;
  if (!marker) return; // 非教學局＝物件根本不存在
  const drill = currentTutorialDrill(s.tutorial);
  const myTeam = s.game.players?.[s.playerId]?.teamId ?? 'A';
  const point = coachMarkerTarget(drill?.id, {
    attackerId: s.aiState?.attackerId,
    actors: s.game.actors,
    myTeam,
    blockLz: AI.BLOCK_LZ, // ★ 讀 sim 的常數，不複製一份 ★ 複製＝第二個真相源
    possession: s.game.rally?.possession,
    phase: s.game.phase,
    // 職責位＝引擎自己的答案（玩家沒碰搖桿時系統就是把他帶去這裡）——不另算一份
    dutyPos: s.game.phase === 'rally' && s.game.match
      ? dutyPosition(s.game, myTeam, s.playerId) : null,
    // 直線／斜線兩條過網線的中點——攻擊手一被認出就算得出來（不必等他出手）。
    // 用 sim 既有的 spikeAimsFor＋netCrossingX（blockRead.js:33,38），零新公式。
    crossMidX: blockAimMidX(s.game, s.aiState?.attackerId),
  });
  if (!point) { marker.hide(); return; }
  const me = s.game.actors?.[s.playerId];
  const here = !!me && Math.hypot(me.x - point.x, me.z - point.z) <= marker.RADIUS;
  marker.show(point, here, now);
}

// 把當前這一步需要的場景擺好（站位＋發球權）。回 false＝這一幀擺不成（rally 中／
// 這一步沒有指定場景），呼叫端保留 `tutorialRestageDue` 下一幀再試。
// ★ 判定與表格全在 career/practiceMatch.js ★ 這裡只負責「什麼時候擺」。
export function applyTutorialStage(s) {
  if (!s?.tutorial || s.tutorial.done) return false;
  const drill = currentTutorialDrill(s.tutorial);
  if (!drill) return false;
  const myTeam = s.game.players?.[s.playerId]?.teamId ?? 'A';
  // `match?.` ＝這一幀擺不成就回 false（本函式的契約），不是防禦性程式碼
  const stage = tutorialStageFor(drill.id, s.game.match?.rotations, s.playerId, myTeam);
  if (!stage) return false;
  return restageRotation(s.game, stage);
}
const TUTORIAL_RELEASE_TTL = 2600; // 「這個之後再說」那句的停留時間，講完接下一步

export function refreshTutorialHud(s) {
  if (!s.tutorial) return;
  const myTeam = s.game.players[s.playerId]?.teamId ?? 'A';
  const rows = tutorialRows(s.tutorial, {
    events: s.game.events, playerId: s.playerId, myTeam, obs: s.tutorialObs,
  });
  s.practiceRows = rows;
  s.stage.practiceHud?.update(rows, '入隊測試・教練指導中');
}

// 輸入/導航事件绑定：局終點擊、回放（R/🎬）、魚躍（L/Space/鈕）、情蒐跳過
function bindInputHandlers(s) {
  const { stage, config } = s;
  // 局終點擊 → 生涯：第一次點＝單場結算頁（W4 Q9）；返回生涯改走面板內「關閉」鈕
  // （U1 07-30 拍板：誤觸關掉面板最重的一支，第二次「點任意處」的返回路徑已移除）。
  // 快速比賽：換種子再開一局
  window.addEventListener('pointerdown', () => {
    if (s.game.phase !== 'set_over') return;
    // ★ 批3 ★ 局末那一分也會播即時 highlight，而那一刻 game.phase 已經是 set_over
    // （局終畫面要等重播播完才會出來）。少這一條，玩家「點畫面跳過重播」的那一下
    // 會同時被這裡吃掉＝直接重開一局／跳進結算面板。重播中的點擊只歸跳過通道管
    if (s.replay) return;
    if (s.careerCtx) {
      if (!s.boxShown) {
        s.boxShown = true;
        s.stage.setOverOverlay.hide();
        s.stage.boxScorePanel?.show(buildBoxPanelData(s), () => {
          window.location.assign(careerReturnUrl(
            s.ctx.params, window.location.pathname, s.careerCtx.store?.activeSlot?.() ?? null,
          ));
        });
      }
      return; // boxShown 已 true：面板顯示中，任意處點擊不再有作用
    }
    s.seed += 1;
    s.game = createGame({
      seed: s.seed, setTarget: config.setTarget,
      stamina: config.gameOptions.stamina, // W7：快速比賽重開局保持體力/氣勢設定
      momentum: config.gameOptions.momentum,
    });
    s.aiState = createAiState();
    s.controlledId = s.playerId;
    s.switchKey = '';
    s.replay = null;
    s.vcrLast = null; // 換局清回放資料，避免新局第一分前播到上一局最後一球
    s.recorder.reset();
    s.servedThisTurn = false;
    s.staminaAdviceShown = false;
    s.wasBenched = false;
    s.timeoutHuddleTeam = null; // W7.1：換局清暫停集合/倒數狀態
    s.prevMomentumValue = 0;
    stage.coachOptionDialog?.hide();
    stage.scoreboard.resetMomentum?.(); // 同一 scoreboard 實例沿用——flashMomentum 基準歸零
    stage.setOverOverlay.hide();
    if (stage.panel) stage.panel.hide();
    stage.controls.setPlayerId(s.playerId);
    stage.rig.setPlayerId(s.playerId);
    stage.matchView.setControlled(s.playerId);
    stage.matchView.setTimeoutHuddle(null);
    window.__phase1.game = s.game;
    window.__phase1.aiState = s.aiState;
  });
  window.addEventListener('keydown', (e) => {
    // 桌機 R＝回放上一球；即時 highlight 播放中則是跳過（同一鍵、不另發明按鍵）
    if (e.code === 'KeyR' && !endHighlightReplay(s)) startReplay(s);
  });
  window.addEventListener('pointerdown', () => {
    if (s.replay?.tape) { // 跳過整卷情蒐
      s.replay = null;
      s.tapeIdx = config.tapeClips.length;
      stage.floatText.show('跳過情蒐——比賽開始！', '#9fb0cc', 1000);
      return;
    }
    // 批3 HR-5：即時 highlight 一點即跳過（沿情蒐帶同一條輸入通道＝點畫面任一處）
    endHighlightReplay(s);
  });
  // 魚躍：自動判斷（matchControls 自動輔助，拍板 07-24 常駐鈕移除）；
  // 桌機 L 鍵/簡化模式 Space 保留為隱藏手動（提前撲的主動權）
  // 🎬 鈕：即時 highlight 播放中＝跳過（它自己 stopPropagation，吃不到上面那條
  // window pointerdown），否則＝手動回放上一球。兩者互斥不衝突（HR-5）
  stage.handlers.replay = () => { if (!endHighlightReplay(s)) startReplay(s); };
  window.addEventListener('keydown', (e) => {
    const diveKey = e.code === 'KeyL' || (config.simpleMode && e.code === 'Space');
    if (diveKey && !e.repeat && s.diveReady) {
      e.preventDefault();
      stage.controls.diveNow(s.game);
    }
  });
}

// 🎬 回放：重播＝從快照重新模擬（決定論保證逐格一致）；只播最後 3 秒、半速
function startReplay(s) {
  const rec = s.vcrLast;
  if (!isPlayableTape(rec) || s.replay) return;
  const player = createRallyPlayer(rec);
  // 快轉到尾段起點（不渲染），只播殺球/落地的關鍵 3 秒
  player.fastForward(Math.max(0, player.length - REPLAY_TAIL));
  // B1：手動🎬回放接 sfx——rallyFlights 沿既有 replayStage 慣例，不吃快轉段
  s.replay = { player, acc: 0, startFlight: player.state.rally.flightId };
  s.stage.floatText.show('🎬 回放', '#ffd166', 1200);
}

// ════════════════════════════════════════════════════════════
// 即時 highlight 重播（批3，acceptance-netduel-batch3.md）
// ════════════════════════════════════════════════════════════
// ★ 運鏡＝重用結算典藏牆的導播腳本 ★（HR-6，使用者改訂：「用比賽內俯瞰的機制感覺
// 不夠好……用我們以前高中結算的精彩回顧那種風格」）。buildDirectorScript 是決定論
// 指令陣列：吃卷裡的事件切鏡、重用 cameraRig third/sset/sig 四款既有構圖、決定性
// 一拍之後 0.35 倍慢動作。這裡只消費腳本，**不搬 replayStage 的舞台層**——
// 那邊的暗場光池／霧／地板換色／HemisphereLight 是「回憶感」後製，掛在它自己的
// scene 上，比賽內重播要的是現場原樣渲染（追記之二），故一格都不帶過來。
//
// 尾段起點（HR-3／HR-6 合流）：不從整卷頭播——取「決定性一拍」與「尾段時長上限」
// 兩者中較晚的那個當起點，所以全版最多從決定性一拍起（看得見那一下），
// 短版只給落地前那一段。時長常數在 highlightReplay.js（【試玩必調】）。
// export：tests/highlight-replay.test.mjs 用真卷＋假 stage 端到端跑完整條播放路徑
// （起播→逐幀→自行收尾），驗「不得卡死比賽」不是靠讀原始碼看出來的
export function startHighlightReplay(s, plan, pointInfo) {
  const { stage } = s;
  const rec = s.vcrLast;
  // HR-5 安全：卷不可播／已經在播（手動 🎬、情蒐帶）＝靜默跳過，不卡死也不重入
  if (!isPlayableTape(rec) || s.replay) return;
  const script = buildDirectorScript(rec);
  if (!(script.totalMs > 0) || !script.totalSteps) return;
  // 決定性一拍那顆鏡頭的演出時間位置（腳本自己標的 slow）
  const decisive = script.shots.find((sh) => sh.cam.slow);
  const tDecisive = decisive ? tAtStep(script, decisive.step) : 0;
  const tTail = 1 - plan.tailMs / script.totalMs;
  const t0 = Math.max(0, Math.min(1, Math.max(tDecisive, tTail)));
  const player = createRallyPlayer(rec);
  player.fastForward(stepAt(script, t0)); // 快轉到起點（不渲染）
  const anchor = shotAt(script, player.index)?.cam.anchorId ?? null;
  // B1（比賽內回放接 sfx）：rallyFlights 沿 replayStage 慣例算「這波打了幾個 flight」
  // ——起點快轉之後才記，不吃快轉本身那一段的 flight 數
  const startFlight = player.state.rally.flightId;
  s.replay = {
    player,
    acc: 0,
    highlight: {
      plan, script, t0, elapsedMs: 0, anchor: null, startFlight,
    },
  };
  // 現場鏡頭旗標一次全清：它們每個現場幀都會被重寫（:3048/3051/3264/3265/3283 一帶），
  // 但重播期間 frameStep 早退、沒人重寫，殘留的 bench/dive/attack 旗標優先序高於
  // 導播要的 sig/third，會把腳本的構圖整個劫走。重播結束後下一個現場幀自動復原
  stage.rig.setBenchMode(false);
  stage.rig.setDiveCam(false);
  stage.rig.setAttackView(false);
  stage.rig.setDefendView(false);
  stage.rig.setHuddleView(false);
  stage.rig.setSpikeMine(false);
  if (anchor) { s.replay.highlight.anchor = anchor; stage.rig.setPlayerId(anchor); }
  // HR-4 字卡：沿既有 pointBanner 通道（不新造 DOM 系統），壽命＝重播長度；
  // 跳過時由 endHighlightReplay 直接 hide，不等計時器
  stage.pointBanner.show(
    { title: plan.caption, icon: plan.icon, mine: plan.mine, sub: pointInfo?.sub ?? '' },
    { holdMs: Math.round((1 - t0) * script.totalMs) },
  );
}

// 重播收尾（播完／跳過共用同一條路：HR-5「沿既有 replay 結束路徑」）。
// 回傳 true＝真的收了一場 highlight（跳過通道據此判斷要不要改做別的事）。
// export：tests/highlight-replay.test.mjs 用假 stage 直測「跳過真的回得了現場」。
export function endHighlightReplay(s) {
  if (!s.replay?.highlight) return false;
  const { stage } = s;
  s.replay = null; // 現場恢復＝frameStep 下一幀就跑回發球流程（sim 只是被凍結，沒被改）
  stage.pointBanner?.hide();
  stage.rig?.setSigBeat(null);
  stage.rig?.setSetScan(false);
  stage.rig?.setPlayerId(s.controlledId); // 鏡頭錨還給受控者
  return true;
}

// 一幀 highlight：**絕對式**（吃演出時間 t 定狀態）——與 replayStage 同一套契約，
// 掉幀不會累積漂移，跳過與播完同終態。
export function runHighlightFrame(s, now, delta) {
  const { stage, ctx } = s;
  const hl = s.replay.highlight;
  const { player } = s.replay;
  hl.elapsedMs += delta * 1000;
  const t = Math.min(1, hl.t0 + hl.elapsedMs / hl.script.totalMs);
  const exact = stepAtExact(hl.script, t);
  const target = Math.floor(exact);
  const from = player.index;
  const frameEvents = [];
  while (player.index < target && !player.done) frameEvents.push(...player.step());
  // B1／B2：跳轉/快進大步時不餵 sfx（沿 replayStage.js:137 的 !jumped 慣例）——
  // 一次推很多步的那批事件同時發聲會炸開一整串聲音。這裡沒人會主動快轉大步
  // （跳過通道走 endHighlightReplay 直接清 s.replay，不會回頭把剩餘事件餵完），
  // 這道防線接住的是掉幀／背景分頁恢復那種一幀跨很多 step 的情形。
  const jumped = player.index - from > 60;
  const shot = shotAt(hl.script, player.index);
  if (shot) {
    if (shot.cam.anchorId && shot.cam.anchorId !== hl.anchor) {
      hl.anchor = shot.cam.anchorId;
      stage.rig.setPlayerId(hl.anchor); // 鏡頭錨；受控者由 endHighlightReplay 還原
    }
    stage.rig.setSigBeat(shot.cam.mode === 'sig' ? shot.cam.sig : null);
    stage.rig.setSetScan(shot.cam.mode === 'sset');
  }
  if (!jumped && frameEvents.length) {
    stage.sfx.onEvents(frameEvents, { rallyFlights: player.state.rally.flightId - hl.startFlight });
  }
  const alpha = Math.min(Math.max(exact - target, 0), 1);
  const st = player.state;
  ctx.ballView.sync(st.ball, alpha, delta,
    st.rally?.profile === 'serve' && st.rally?.serveStyle === 'float');
  stage.matchView.sync(st, alpha, delta, frameEvents);
  stage.aimMarker.hide();
  stage.landingMarker.hide();
  stage.rig.update(st, alpha, delta);
  // 重演鏡位拉遠（腳本自帶的 pullback；沿視線後退＝構圖不變、只是站遠一點看，
  // 理由與 replayStage 同一條：sig 三構圖是為賽中死球窗調的，任意時刻套用會插進
  // 別人後腦）。相機朝向＝matrixWorld 第三軸的反向，取完直接沿它退——
  // 不為此把 three 拉進 app 層
  const pull = shot?.cam.pullback ?? 0;
  if (pull > 0) {
    ctx.camera.updateMatrixWorld();
    const m = ctx.camera.matrixWorld.elements;
    ctx.camera.position.set(
      ctx.camera.position.x + m[8] * pull,
      ctx.camera.position.y + m[9] * pull,
      ctx.camera.position.z + m[10] * pull,
    );
  }
  // A2（B/C 債清批）：兩個慢動作低機位（sig oh/mb/opp、sig line）重演時抬高視角
  // ——腳本宣告 lift，這裡只認栏位、不判斷 kind（判斷邏輯留在導播那一層）。
  // position.y 加上去之後重新 lookAt 原本 rig 這一幀算好的注視點，不是重算方向。
  const lift = shot?.cam.lift ?? 0;
  if (lift > 0) {
    const target = stage.rig.getTarget();
    ctx.camera.position.y += lift;
    ctx.camera.lookAt(target);
  }
  ctx.renderer.render(ctx.scene, ctx.camera);
  ctx.hud.frame(now, delta, 0);
  if (stage.panel) stage.panel.hide();
  if (t >= 1) endHighlightReplay(s);
}

// 學招預告（Sawmah 07-23 二輪拍板：字幕太快→對話框點擊逐句）：這場打完可偷學的技術
// ——賽前給目標感。情蒐帶在背後照播（點對話框只推進台詞不跳過帶子）；
// 輸贏都教（既有政策）故措辭不綁勝負；名稱查 TECH_DEFS（與成長區同一套語彙）
function showTeachPreview(s) {
  if (!s.careerCtx || !s.stage.teachDialog) return;
  const keys = upcomingTeach(s.careerCtx.career, s.careerCtx.matchEntry.id);
  if (!keys.length) return;
  const names = keys.map((k) => TECH_DEFS.find((t) => t.key === k)?.name ?? k).join('」與「');
  const opp = s.config.careerSetup?.opponent?.name ?? '對手';
  // 誠實文案（07-24 Sawmah 抓曜石場對話問題）：①帶子真的收到重點片段才提帶子——
  // 曜石雙授只有 pipe 進得了帶（假動作 AI 不做），逐招掛保證＝空頭支票，故泛指「重點球」
  // ②雙招用「它們」 ③開場不再問「看了嗎」（對話當下帶子才要播，時序怪）
  const hasFeatured = s.config.tapeClips.some((c) => c.featured);
  const them = keys.length > 1 ? '它們' : '它';
  s.stage.teachDialog.show([ // 命名工程 07-25 定稿
    { speaker: '教練', text: `看好${opp}——「${names}」是他們的招牌。` },
    {
      speaker: '教練',
      text: hasFeatured
        ? `帶子裡有重點球，先看熟。打完這場，把${them}偷學回來。`
        : `打完這場，把${them}偷學回來。`,
    },
  ]);
}

// 情蒐錄影帶：吃同一條 replay 管線（tape 旗標）
function startTapeClip(s) {
  const clips = s.config.tapeClips;
  const clip = clips[s.tapeIdx];
  if (!clip) return;
  // 情蒐帶＝賽前現場生成的舊格式卷（十二人全錄、不落存檔＝無容量問題）——
  // 重演器同時吃兩種格式，播放路徑共用
  const player = createRallyPlayer(clip);
  player.fastForward(Math.max(0, player.length - TAPE_TAIL));
  // B1：情蒐帶接 sfx——同手動🎬慣例
  s.replay = {
    player, acc: 0, tape: true, startFlight: player.state.rally.flightId,
  };
  s.stage.floatText.show(`📼 情蒐：對手關鍵球 ${s.tapeIdx + 1}/${clips.length}（點擊跳過）`, '#6ee7ff', 2000);
  s.tapeIdx += 1;
}

function desiredControlled(s) {
  const { game, aiState } = s;
  // W7 C2：主角在板凳＝鏡頭釘住主角（教練視角），不隨球權自動切人；
  // 回場後（onCourt 再度成立）自動放行、恢復原本全隊輪控邏輯
  if (!onCourt(game, s.playerId)) return s.playerId;
  if (game.phase === 'serve') {
    return game.match.servingTeam === 'A' ? serverId(game.match) : s.controlledId;
  }
  if (game.phase !== 'rally') return s.controlledId;
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
  return s.controlledId;
}

function syncControlled(s) {
  if (!s.config.teamControl) return; // 固定主攻手模式
  // 蓄力中不切人：切了會清掉這次蓄力、玩家放開時靜默無回饋（延後到蓄力結束）
  if (s.stage.controls.isCharging()) return;
  const key = `${s.game.phase}:${s.game.rally.flightId}:${s.aiState.claimId ?? ''}`;
  if (key === s.switchKey) return;
  s.switchKey = key;
  const want = desiredControlled(s);
  if (want !== s.controlledId) {
    s.controlledId = want;
    s.stage.controls.setPlayerId(want);
    s.stage.rig.setPlayerId(want);
    s.stage.matchView.setControlled(want);
  }
}

// 🎬 回放模式：凍結現場，半速重播上一球尾段（重新模擬＝逐格一致）
// export（B/C 債清批 2026-08-27，B1/B2）：tests/replay-lift.test.mjs 用假
// stage/player 直測手動🎬／情蒐帶接 sfx 之後的行為（沿 runHighlightFrame 先例）
export function runReplayFrame(s, now, delta) {
  // 批3：即時 highlight 走導播腳本（絕對式時間軸＋事件驅動運鏡），與手動 🎬／
  // 情蒐帶的固定俯視是兩條路——後者一格不動
  if (s.replay.highlight) { runHighlightFrame(s, now, delta); return; }
  const { stage, ctx } = s;
  const replay = s.replay;
  const { player } = replay;
  replay.acc += delta * REPLAY_SPEED;
  const from = player.index;
  const frameEvents = [];
  while (replay.acc >= SIM_DT && !player.done) {
    frameEvents.push(...player.step());
    replay.acc -= SIM_DT;
  }
  // B1／B2：手動🎬／情蒐帶接既有 sfx——同 runHighlightFrame／replayStage.js:137
  // 的 !jumped 慣例，掉幀/背景分頁恢復一次推很多步時不餵（防事件連珠炮）
  const jumped = player.index - from > 60;
  if (!jumped && frameEvents.length) {
    stage.sfx.onEvents(frameEvents, { rallyFlights: player.state.rally.flightId - replay.startFlight });
  }
  const rAlpha = Math.min(replay.acc / SIM_DT, 1);
  ctx.ballView.sync(player.state.ball, rAlpha, delta,
    player.state.rally?.profile === 'serve' && player.state.rally?.serveStyle === 'float');
  stage.matchView.sync(player.state, rAlpha, delta, []);
  stage.aimMarker.hide();
  stage.landingMarker.hide();
  ctx.camera.position.set(0, 12, 12.5);
  ctx.camera.lookAt(0, 0.6, 0);
  ctx.renderer.render(ctx.scene, ctx.camera);
  ctx.hud.frame(now, delta, 0);
  if (stage.panel) stage.panel.hide();
  if (player.done) {
    const wasTape = replay.tape;
    s.replay = null; // 播完回現場
    if (wasTape) {
      if (s.tapeIdx < s.config.tapeClips.length) startTapeClip(s); // 下一卷
      else stage.floatText.show('情蒐結束——比賽開始！', '#ffd166', 1500);
    }
  }
}

// ════════════════════════════════════════════════════════════
// 大學卷批 7（2026-08-24）：面板選項與選擇後果抽成純函式
// ════════════════════════════════════════════════════════════
// ★ 為什麼抽出來 ★ createMatchControls 需要 window，node 測試環境建不起來，
// 於是「按鈕按下去到底做了什麼」在此之前是**完全沒有測試點過的盲區**
// （批 6 教訓 10：沒有測試點過的按鈕就是盲區）。把選項建構與選擇後果抽成
// 不吃 DOM 的純函式之後，驗收測試可以真的「按下去」看值，而不是只驗文字在。
// updateDecisions 是唯一的呼叫端——抽出來的是同一份程式碼，不是複製品。

// MB 讀心面板的選項。壓手兩項只在受教後存在（B7-4：gate 在行為層，不是變灰）。
// ★press 必與 line 綁在同一個 item★（B7-3）——沒有「只壓手不押方向」的選項，
// 想用壓手就得放棄 blockPlanTargetX 的 AI 讀球、自己押一邊。
export function mbPanelItems(gates) {
  return [
    { key: 'block-line', label: '🧱 封直線', color: 'orange', line: 'line' },
    { key: 'block-cross', label: '🧱 封斜線', color: 'orange', line: 'cross' },
    ...(gates?.canPressBlock ? [
      { key: 'press-line', label: '✋ 壓手封直線', color: 'red', line: 'line', press: true },
      { key: 'press-cross', label: '✋ 壓手封斜線', color: 'red', line: 'cross', press: true },
    ] : []),
  ];
}

// 按下 MB 面板某一項的後果。★blockCall 與 armPressBlock 在同一個函式裡成對發生★
// ——程式上沒有「拿到 press 卻不付押方向代價」的路徑（B7-3 紅法二）。
export function applyMbChoice(s, it) {
  const { game, aiState, stage } = s;
  const { controls } = stage;
  aiState.blockCall = { team: game.players[s.controlledId].teamId, line: it.line };
  // 不再送出「立即起跳」——起跳交給自動跳攔（就位後在擊球瞬間開窗）
  controls.chooseMbTiming(false);
  if (it.press) controls.armPressBlock();
  s.mbCommit = { jumped: false, line: it.line, pressed: !!it.press };
}

// 發球主面板的選項：四落點區 ＋ 飄浮/跳發變體 ＋ 追發入口（各自吃自己的閘）。
export function servePanelItems(gates, zs) {
  return [
    ...zs.map((z) => ({ key: z.key, label: z.label, color: 'neutral', zone: z, style: null })),
    // 飄浮/跳躍球路＝故事線傳授的技術（未習得不出現）
    ...(gates?.canFloatServe ? zs.filter((z) => z.key !== 'short').map((z) => ({
      key: `f-${z.key}`, label: `飄${z.label.slice(1)}`, color: 'cyan', zone: z, style: 'float',
    })) : []),
    ...(gates?.canJumpServe ? zs.filter((z) => z.key !== 'short').map((z) => ({
      key: `j-${z.key}`, label: `跳${z.label.slice(1)}`, color: 'orange', zone: z, style: 'jump',
    })) : []),
    // 批 7 追發：★一個入口、不是十個★——落點區照舊，追發自己展開一層問「發給誰」。
    // 未受教＝這個入口不存在（B7-4：gate 在行為層，不是把鈕變灰）。
    ...(gates?.canChaseServe
      ? [{ key: 'chase', label: '🎯 追發', color: 'red', chase: true }]
      : []),
  ];
}

export function applyServeChoice(s, it) {
  if (it.chase) { s.chaseExpanded = true; return; } // 展開第二層，這一按不發球
  s.stage.controls.serveNow(s.game, it.zone.aim, it.style);
  s.servedThisTurn = true;
}

// 追發第二層：對方當前輪轉的後排三人（名單與座標由 controls 現算）＋返回。
// 08-27 追發配飄跳發：沿用主面板慣例（變體＝並列按鈕、同色系），未受教不出現
// （B7-4 同則：gate 在行為層）。驗收凍結＝acceptance-chase-style.md。
export function chasePanelItems(targets, gates) {
  return [
    ...targets.map((t) => ({ key: t.key, label: t.label, color: 'red', target: t, style: null })),
    ...(gates?.canFloatServe ? targets.map((t) => ({
      key: `f-${t.key}`, label: `飄·${t.label}`, color: 'cyan', target: t, style: 'float',
    })) : []),
    ...(gates?.canJumpServe ? targets.map((t) => ({
      key: `j-${t.key}`, label: `跳·${t.label}`, color: 'orange', target: t, style: 'jump',
    })) : []),
    { key: 'chase-back', label: '← 返回', color: 'dim', back: true },
  ];
}

export function applyChaseChoice(s, it) {
  if (it.back) { s.chaseExpanded = false; return; }
  s.stage.controls.serveNow(s.game, it.target.aim, it.style ?? null);
  s.servedThisTurn = true;
  s.chaseExpanded = false;
}
// 簡化模式決策窗：進攻選區/發球選區面板＋攔網防守窗；回傳放慢倍率（0＝不放慢）
function updateDecisions(s, now) {
  if (!s.config.simpleMode) return 0;
  const { game, aiState, gates, stage } = s;
  const { controls, panel, rig, sfx, floatText } = stage;
  // W3 L：digBias 生命週期——我方第一觸之後/死球＝指令歸零（一次指揮只管一次對手
  // 攻擊）。注意：攻擊過網瞬間 possession 即翻到我方（touches=0、profile 仍 spike）
  // ——此時指令必須還活著（Perfect 窗在我方起球當下才結算），不得提前清
  // 攔網手的封線指令與 digBias 同壽（同一個生命週期，2026-08-03 裁定乙）
  if (aiState.blockCall && (game.phase !== 'rally'
    || game.rally.possession === aiState.blockCall.team)) {
    aiState.blockCall = null;
  }
  if (aiState.digBias && (game.phase !== 'rally'
    || (game.rally.possession === game.players[s.controlledId]?.teamId
      && game.rally.touches >= 1))) {
    aiState.digBias = null;
    // B-3 影子收帶時機（07-27 六輪 Sawmah：留到死球太長、殘留到下一波）：
    // 我方第一觸（這波攻擊結算點）後再留 1.2s——「讀對了」字卡與帶子同框對照
    // （球真的從綠帶進來），之後收、rally 續打地板淨空
    if (!s.shadowFadeAt) s.shadowFadeAt = performance.now() + 1200;
  }
  if (s.shadowFadeAt && performance.now() > s.shadowFadeAt) {
    s.shadowFadeAt = 0;
    stage.blockShadow?.hide();
  }
  // 死球一律收（保險：出界/攔死等無我方觸球的結算路徑）
  if (game.phase !== 'rally') {
    s.shadowFadeAt = 0;
    stage.blockShadow?.hide();
  }
  // 07-27 試玩回饋：L 讀對追蹤——對手攻擊飛行中持續結算，我方第一觸出結果字卡
  // W4 Q9：同步記下這次指令是否改判（digBias 在第一觸即清、字卡時刻已不可考）
  if (aiState.digBias && game.phase === 'rally'
    && game.rally.profile === 'spike' && game.rally.lastSpikeZone) {
    s.digReadResult = digReadCorrect(game, aiState);
    s.digReadWasOverride = aiState.digBias.override === true;
  }
  // W7 C2：受控者不在場上（主角板凳教練視角）——沒有身體可決策，面板收起
  if (!onCourt(game, s.controlledId)) {
    panel.hide();
    stage.diegetic?.hide();
    rig.setSetScan(false);
    s.setWindowSince = -1;
    return 0;
  }
  // 進攻時刻＝切攻擊手視角越過網看攔網（讀攔網要看得清）
  rig.setAttackView(controls.isAttackMoment(game));
  // 技術閘門：吊球未解鎖＝面板無吊球；後排 pipe 未解鎖＝後排不彈面板（保底出手照舊）
  const zonesRaw = controls.attackZones(game);
  const zones = zonesRaw && zonesRaw.filter((z) => z.key !== 'tip' || gates.canTip);
  const meBackRow = isBackRow(
    game.match.rotations[game.players[s.controlledId].teamId], s.controlledId,
  );
  // ①進攻決策：球正下墜、可決策高度、尚未選區
  const attackDeciding =
    !!zones && (gates.canPipe || !meBackRow) &&
    game.ball.vy < 0 && game.ball.y > 2.0 && !controls.attackPending();
  // ①b 二傳分配決策（W3 S 玩法）：一傳起球、這球歸我舉、尚未分配——
  // 選項池＝一傳品質分支（setOptions 純函式）；窗尾（球墜破 1.8m）未選＝
  // 二傳保底自動舉給 AI 建議攻擊手（matchControls collect 既有路徑）
  const setZones = controls.setOptions(game);
  // ★★ 2026-08-03：拿掉 `game.ball.vy < 0`——它讓遠段在數學上不存在 ★★
  // 實測（`tools/set-preview-gate-probe.mjs`，n=497）：其餘三個條件在距接觸 ETA≈91–93
  // 就全部就緒，**只有 `vy < 0` 一個人吃掉 47–49 tick**——因為它的意思是「一傳弧線
  // 過了最高點」，而從頂點掉到二傳手點是幾何常數 44±1 tick（perfect/ok/poor 三分層
  // 逐值相同）。門檻 `SET_READY_TICKS` 是 55 ⇒ `setStageOf` 恆回 'ready'
  // ⇒ **遠段出現率 0/497**，卷五裁定 4「入口走乙：遠段戰術指令」從落地起沒開過一次。
  //
  // 語意上它本來就與遠段相反：遠段的定義是「**球還在飛**，講戰術」，
  // 而 `vy < 0` 說的正是「球已經不在飛了、開始掉了」。
  //
  // ⚠ 卷五驗收的「遠段出現率 100%」量的不是這件事——那是「sim 第二觸窗開啟時
  // `setContactPoint.ticks`（**未扣 planTick**）是否 >55」，中間卡著本行這四個條件。
  const setDeciding =
    !!setZones && setZones.length > 0 &&
    game.ball.y > 1.8 && !controls.setPending();
  // ★ 2026-08-09 OPP 補舉提示 ★ isSetMoment 放行了「S 接第一球、claim 指到我」的
  // 補位情形（matchControls 檔頭有理由）——但面板開了玩家也未必知道**為什麼**輪到他。
  // S 本人不出卡（他天天舉球）；非 S 的補位每波出一張，去重鍵＝flightId。
  // 實測背景：S 接第一球 0.88 次/局，玩家不補＝100% 落地失分。
  if (setDeciding && game.players[s.playerId]?.currentRole !== 'setter') {
    const fid = game.rally?.flightId;
    if (fid != null && s.coverSetHintFlight !== fid) {
      s.coverSetHintFlight = fid;
      stage.floatText.show('🙌 二傳接了一傳——這球換你舉！', '#ffd166', 1400);
    }
  }
  // 4.6 追修（07-28 試玩）：分配窗兩段式——遠段唯讀、近段才可下指令。
  // ★ 卷五裁定 3（2026-08-02）：判準從空間換成**時間** ★
  //   ETA 的取點與換算**整段在 `setEtaOf` 裡**（單一真相，UI 不自己算一份）——
  //   那支的檔頭寫清楚了為什麼一定要扣 `planTick`（漏扣＝近段永遠不開始）。
  const setEta = setEtaOf(aiState, game.tick);
  const setReady = !setDeciding || setStageOf(setEta) === 'ready';
  // 4.5B §4：S diegetic 掃場鏡位（分配決策窗＝自 S 視線回望自家半場）；窗外歸位。
  // 4.6 追修：**鏡頭跟著操作段走**——遠段維持三人稱（跑位要空間感；掃場鏡位會把
  // 你自己的走位參考抽走），近段才切掃場。不然兩段式的效果會被鏡頭切換抵銷
  rig.setSetScan(!!stage.diegetic && setDeciding && setReady);
  if (!setDeciding) s.setWindowSince = -1;
  // ①c MB 攔網讀心（W3）：對手舉球出手（touches===2 起）、我＝前排 MB、尚未選——
  // 線索面板（一傳品質＋助跑動向，誠實非全知）；球墜近對手扣點（y<2.3）＝來不及
  // 重站位，窗關（未選＝就位自動跳攔照舊）
  const mbRead = controls.mbOptions(game, aiState);
  const mbDeciding = !!mbRead && !controls.mbPending() &&
    !(game.ball.vy < 0 && game.ball.y < 2.3);
  // ①e L 防守指揮（W3 附錄 A1/A2）：對手舉球出手、我＝場上 L、尚未選——
  // 0.6× 放慢（比 OH 0.4× 短）、預設高亮 AI 建議、1 秒未動＝自動照建議
  const digRead = controls.digOptions(game, aiState);
  const digDeciding = !!digRead && !controls.digPending() &&
    !(game.ball.vy < 0 && game.ball.y < 2.3);
  if (digDeciding) {
    if (s.digWindowSince < 0 || s.digWindowSince === undefined) s.digWindowSince = now;
    if (now - s.digWindowSince > 1000) {
      // A2 快選：1 秒不動＝自動照 AI 建議執行（點選＝改判走 panel 回呼同一入口）
      // W4 B-1：建議＝配套 key——展開為 dig（後排收縮）＋block（攔網站線）雙驅動
      controls.chooseDig();
      const autoScheme = schemeByKey(digRead.suggestion);
      s.schemeTally = noteScheme(s.schemeTally, digRead.suggestion); // B-4：自動也算配套史
      s.shadowFadeAt = 0; // 新波佈陣＝舊收帶排程作廢
      s.stage.blockShadow?.set(digRead.suggestion, game.ball.x); // B-3 佈陣可視化
      showShadowHintOnce(s);
      aiState.digBias = {
        team: game.players[s.controlledId].teamId,
        choice: autoScheme?.dig ?? 'cross',
        block: autoScheme?.block,
        override: false,
      };
    }
  } else {
    s.digWindowSince = -1;
  }
  // ②攔網決策：對方第三擊將至、我在前排；自由模式收面板（全手動讀線），
  // 但慢速窗與攔網第一視角照給——時間留給你自己站位抓時機
  const defendMoment =
    controls.isDefendMoment(game, aiState) &&
    game.ball.vy < 0 && game.ball.y > 2.0;
  rig.setDefendView(defendMoment || mbDeciding);
  // ③發球決策：發球員是受控玩家本人（AI 隊友發球自動）、哨音已過、尚未選
  const serveDeciding =
    game.phase === 'serve' && serverId(game.match) === s.controlledId &&
    game.tick >= game.serveReadyTick && !s.servedThisTurn;
  if (game.phase !== 'serve') s.servedThisTurn = false;
  // 批 7：離開發球階段＝追發那一層收起來（下一個發球回合從主面板重新開始）
  if (game.phase !== 'serve') s.chaseExpanded = false;
  // 發球前短哨（裁判示意發球）：每個發球回合一次
  if (game.phase === 'serve' && game.tick >= game.serveReadyTick && !s.whistledServe) {
    s.whistledServe = true;
    sfx.whistle(200);
  }
  if (game.phase !== 'serve') s.whistledServe = false;

  // 攻/防/分配/讀舉球決策窗＝0.4×；L 防守指揮＝0.6×（附錄 A2）
  const deciding = (attackDeciding || defendMoment || setDeciding || mbDeciding) ? 0.4
    : (digDeciding && !controls.digPending() ? 0.6 : 0);
  // 讀攔網 slow 檔：決策窗開了 0.6 秒才上色（讀得慢）；instant 即時；none 恆中性
  if (attackDeciding) {
    if (s.attackDecidingSince < 0) s.attackDecidingSince = now;
  } else {
    s.attackDecidingSince = -1;
  }
  // W7.1 四輪 #4（拍板）：👁 提示手動開關已移除——讀攔網提示純由 gates.readTier 決定
  // （reaction 能力分檔；?hints=off 會讓 readTier 恆為 'none'，見 matchConfig.js）
  const hintsLive = gates.readTier === 'instant' ||
    (gates.readTier === 'slow' && s.attackDecidingSince >= 0 && now - s.attackDecidingSince > 600);
  if (attackDeciding) {
    const feintHint = gates.canFeint ? '（按A滑B＝假動作）' : '';
    // 批 4c：二段時間差的唯一 UI 露出（同 feintHint 先例——未解鎖空字串＝F1 零可見；
    // 不另開按鈕：操作面就是既有的出手鈕在滯空中再拖一次，無新元素可畫）
    const dblHint = gates.canDoubleSpike ? '（滯空再拖＝二段變向）' : '';
    panel.show(
      (hintsLive ? '選攻擊區！' : '看攔網選區！') + feintHint + dblHint,
      zones.map((z) => ({
        key: z.key,
        label: hintsLive ? z.label + (z.blocked ? ' ✋' : '') : z.label,
        color: hintsLive ? (z.blocked ? 'red' : 'green') : 'neutral',
        zone: z,
      })),
      (it) => controls.chooseAttack(it.zone),
      (fromIt, toIt) => {
        if (!gates.canFeint) { controls.chooseAttack(toIt.zone); return; } // 未解鎖：滑到哪打哪（誠實）
        s.feintsUsedThisMatch += 1;
        controls.chooseAttackFake(fromIt.zone, toIt.zone);
        floatText.show('🎭 假動作!', '#ffd166', 2000);
      },
    );
  } else if (mbDeciding) {
    // W3 MB 讀心面板（07-27 Sawmah 拍板三改：按鈕正名「起跳攔網」——它的真實語意
    // 就是「現在跳」：早按賭快攻、晚按攔高球都合法，攔網時機全程交玩家；不按＝
    // 交給自動跳攔。線索進標題：一傳品質＋哪一翼正在助跑（🏃 誠實觀察非全知）
    // 07-27 五輪（截圖實證）：線索縮單字防手機折行；面板走貼底模式（'low'）——
    // 攔網第一視角的網對面視線區淨空，讀舉/抓時機不被 UI 自己擋住
    const tells = mbRead.lanes.filter((l) => l.approaching)
      .map((l) => `🏃${l.label.slice(1, 2)}`).join(' ');
    panel.show(
      `${mbPanelTitle(mbRead.tier)}${tells ? `　${tells}` : ''}`,
      // ★ 2026-08-03 Sawmah 裁定乙：這個面板改問「封哪邊」，不再問「何時跳」★
      // 起跳交回自動跳攔——實測（tools/block-timing-oracle-probe.mjs，10 臂）證明
      // 時機軸上沒有可贏的區間：最佳臂（開天眼、擊球前 3 tick）只有 +0.82pp（0.44 SE），
      // 按早 ≥12 tick 一律顯著變差（−6.2～−13.7pp）。機制原因：blockTopEdge 是
      // sin(airT·π/24)、頂點在 airT=12，而自動跳攔結算時 airT p50=6 已在甜蜜帶
      // ⇒ 按鈕只能把跳躍**提前**，提前一律遠離頂點。
      // 換成封線之後，玩家管的是實測**完全沒被碰過**的橫向維度，而取捨、地板影子、
      // 讀對/讀反字卡全都是 L 配套（liberoRead.js）現成的。
      mbPanelItems(gates),
      (it) => applyMbChoice(s, it),
      null,
      'low',
    );
  } else if (digDeciding && !controls.digPending()) {
    // W4 附錄 B-1 L 指揮（A2 節奏資產不動；4.5B §4 diegetic 化：背後手勢
    // 一指/二指/握拳——B-5 原文；stage.diegetic 為 null＝?panel=classic 舊面板）。
    // 一個指令雙驅動（前排站線 block＋後排收縮 dig）；點選＝改判（override 旗標）
    const pickDig = (choice) => {
      if (s.digWindowSince >= 0) s.latencyStats.push('L', performance.now() - s.digWindowSince);
      controls.chooseDig();
      s.schemeTally = noteScheme(s.schemeTally, choice.key); // B-4 配套史
      s.shadowFadeAt = 0; // 新波佈陣＝舊收帶排程作廢
      stage.blockShadow?.set(choice.key, game.ball.x); // B-3 佈陣可視化
      showShadowHintOnce(s);
      aiState.digBias = {
        team: game.players[s.controlledId].teamId,
        choice: choice.dig,
        block: choice.block,
        override: choice.key !== digRead.suggestion,
      };
      // 07-27 四輪（Sawmah：字卡太多以體驗為主）：手選確認浮字移除——
      // 紅綠帶佈陣可視化即確認；結果卡（封到/讀對）保留。
      // 4.5B §4：攔網手偷瞄點頭確認（暗號收到——肢體確認非字卡）
      const team = game.players[s.controlledId].teamId;
      const mbId = game.match.rotations[team].find((pid) => game.players[pid]?.currentRole === 'middle'
        && !isBackRow(game.match.rotations[team], pid));
      if (mbId) stage.matchView.triggerPose(mbId, 'nod');
    };
    const digTitle = digRead.markText ? `攔防配套！${digRead.markText}` : '攔防配套！';
    if (stage.diegetic) {
      panel.hide();
      stage.diegetic.showDig(
        lSignalItems(digRead), digTitle,
        (item) => pickDig(item.zone), s.controlledId, game.rally.flightId,
      );
    } else {
      panel.show(
        digTitle,
        digRead.choices.map((c) => ({
          key: c.key,
          label: c.key === digRead.suggestion ? `${c.label}◎` : c.label,
          color: c.key === digRead.suggestion ? 'green' : 'neutral',
          zone: c,
        })),
        (it) => pickDig(it.zone),
        null,
        'low', // 07-27 五輪：L 同為隔網讀對面的情境——貼底模式淨空視線區
      );
    }
  } else if (setDeciding) {
    // W3 S 分配（4.5B §4 diegetic 化：點隊友模型本身＝分配；stage.diegetic 為 null
    // ＝?panel=classic 退路走舊面板）。標題誠實播報一傳品質（真值不落空）。
    // 高 trust 隊友開窗喊聲要球（表現層；每個 flight 一次）＋揮手（wave 姿勢，diegetic 補的肢體）
    if (s.calledBallFlight !== game.rally.flightId) {
      s.calledBallFlight = game.rally.flightId;
      // 喊球者判定＝diegeticItems 的單一事實源（二次球恆排除：那是舉球員自己，
      // trust 寫死 100 會恆居榜首——自己對自己喊「這球給我」還揮手）
      const loud = loudCallerOf(setZones);
      if (loud) {
        floatText.show(`${loud.name}：「這球給我！」`, '#7ee787', 1400);
        if (loud.pid) stage.matchView.triggerPose(loud.pid, 'wave');
      }
    }
    // latency 樣本只從「可下指令那一刻」起算（遠段是唯讀的，不算決策耗時）
    if (setReady && s.setWindowSince < 0) s.setWindowSince = now;
    // 與舊面板逐字同一條指令路徑（sim 零改動）；耗時樣本＝硬性驗收數據
    const pickSet = (zone) => {
      // 窗外殘留點擊（面板收起後的 stale 按鈕）不記樣本——樣本只認開窗中的決策
      if (s.setWindowSince >= 0) s.latencyStats.push('S', performance.now() - s.setWindowSince);
      // W4(P4) 題3：二次球偷襲——第二擊直接攻擊（沿 AI setterDump 同 sim 路徑）；
      // 真值字卡由後續事件結算（得手/被識破），s.dumpLive 追蹤本波
      if (zone.kind === 'dump') {
        controls.chooseSetDump(zone);
        aiState.attackerId = null; // 沒有第三擊——攻擊手協調層本波不啟動
        return; // 真值字卡由事件流結算（實際出手才追蹤，非按了就算）
      }
      controls.chooseSet(zone);
      // 決策注入 AI 協調層：攻擊手改為玩家選定——第三擊呼叫鎖定與一氣呵成助跑
      // （ensureFlightPlan touches===2 讀 attackerId）沿用既有機制
      aiState.attackerId = zone.pid;
      aiState.attackKind = zone.kind;
      if (zone.hesitant) floatText.show(`${zone.name}猶豫了一下…`, '#c8d6eb', 1400);
    };
    if (!setReady) {
      // 段 E 路徑乙（2026-07-31）：遠段從「唯讀預覽」升級為**臨場改判**。
      // 語意＝一傳歪了、死球窗叫的套路作廢時，S 在跑位途中換一個套路——
      // 近段問「這球傳給誰」、遠段問「大家跑什麼」，兩段不重複，對應真實排球的
      // 兩個決策點。**零新面板**：沿用既有的空選項通道，只是把選項填進去。
      // 一傳品質與建議攻擊點照舊顯示在標題（真值早給，操作晚要的原則不變）。
      const suggest = setZones.find((z) => z.pid === aiState.attackerId) ?? setZones[0];
      const callFeas = s.gates.canCallPlay ? callFeasibilityOf(game, aiState) : null;
      // 同一把技術閘（07-31 裁定）：叫戰術沒受教＝連改判也沒得叫——退回段 E 之前的
      // 「唯讀預覽」（空選項通道本來就是這條路，零額外分支）。快速比賽恆 true
      // ★ 2026-08-03 Sawmah 裁定乙：湊不出來的當場不列 ★
      // 可行性由 sim 的 `callFeasibilityOf` 給——它與 `applyReplanCall` 共用同一段
      // 窗界＋池子重建＋同一支 resolveCalledPlay ⇒ **面板列得出來的，按下去一定成立**。
      // UI 不自己重建一顆池（那會變成第二份真相）。
      // 這不違反裁定 E 的「不得預先變灰」：那條禁的是**預判**一傳品質，
      // 而入口搬到遠段之後 passTier 已經定案（面板標題自己就印著），這裡讀的是已知事實。
      const callItems = (s.gates.canCallPlay ? callOptionsFor(game, s.controlledId) : [])
          .filter((o) => (callFeas ? callFeas[o.type]?.feasible !== false : true))
          .map((o) => ({
          key: `call-${o.type}`,
          // ★ 2026-08-03 Sawmah 裁定甲：顯示改用 `command`（⚡指令），不再寫「改判」★
          // 「改判」是死球窗入口還在的時代留下的：那時先在死球窗叫一次、遠段才是「改」
          // 那一次的判。卷五 §六（f526afb）把死球窗入口整條拆了、callPanel.js 整支刪，
          // **已經沒有前一次判定可以改**——遠段是唯一一次下令的機會。
          // 而且選項本身的 mode 一直都是 `'command'`（callPlay.js:44），
          // 只有這行標籤寫死 replan ⇒ 語意是指令、顯示是改判，兩邊對不上。
          label: `${CALL_MODES.command.icon}${o.label}`,
          color: 'neutral',
          callType: o.type,
        }));
      stage.diegetic?.hide();
      panel.show(
        // 一個戰術都列不出來時，標題改講「為什麼沒得叫」——不留白（裁定：空清單要說話）
        setPreviewTitle(setZones[0].tier, suggest?.label ?? null, callItems.length === 0),
        callItems,
        (it) => {
          // 只寫指令槽——真正的重排（planCombination ＋ applyComboRoutes ＋
          // approachRoutesFor 整份重建，已起跑者不得改線）在 sim 的 applyReplanCall。
          // UI 不自己算一份 route ⇒ 同源鐵則；輸入進了 rallyTape 白名單 ⇒ 重演得出來
          s.aiState.replanCall = { type: it.callType, callerId: s.controlledId };
        },
      );
    } else if (stage.diegetic) {
      panel.hide();
      stage.diegetic.showSet(
        sHotspotItems(setZones), setPanelTitle(setZones[0].tier),
        (item) => pickSet(item.zone), game.rally.flightId,
      );
    } else {
      panel.show(
        setPanelTitle(setZones[0].tier),
        setZones.map((z) => ({
          key: z.key,
          label: z.hesitant ? `${z.label}·猶豫` : z.label,
          color: z.hesitant ? 'dim' : 'neutral',
          zone: z,
        })),
        (it) => pickSet(it.zone),
      );
    }
  } else if (serveDeciding && s.chaseExpanded) {
    // 大學卷批 7（08-24）追發第二層：「發給誰」。★對方當前輪轉的後排三人★
    // 名單與座標都由 controls.chaseServeTargets 現算（B7-6：輪轉推進後跟著變）。
    const targets = controls.chaseServeTargets(game);
    panel.show(
      '追發：發給誰？',
      chasePanelItems(targets, gates),
      (it) => applyChaseChoice(s, it),
    );
  } else if (serveDeciding) {
    // 穩定×4＋強力×3（強＝低平快、散佈大；短球無強力——它本來就是輕放）
    const zs = controls.serveZones(game);
    const styleHint = [
      gates.canFloatServe ? '藍＝飄浮' : null,
      gates.canJumpServe ? '橘＝跳發' : null,
    ].filter(Boolean).join('、');
    panel.show(
      styleHint ? `選發球目標！（${styleHint}）` : '選發球目標！',
      servePanelItems(gates, zs),
      (it) => applyServeChoice(s, it),
    );
  } else {
    panel.hide();
  }
  // 4.5B §4：diegetic 介面只活在 S 分配/L 指揮兩個窗——其餘分支（攻擊/MB/發球/無窗）收
  if (stage.diegetic && !(setDeciding && setReady) && !(digDeciding && !controls.digPending())) {
    stage.diegetic.hide();
  }
  return deciding;
}

// 固定步長推進：VCR 錄影＋autopilot 代發＋Intent 管線；回傳本幀事件與步數
function stepSim(s) {
  const { stage } = s;
  let simSteps = 0;
  const frameEvents = [];
  while (s.accumulator >= SIM_DT) {
    const game = s.game;
    // 每球開錄：發球佈陣完成、尚未錄過 → 快照當下 game＋aiState（AI 協調層的跨 tick
    // 記憶；重演端靠它把十一份 AI Intent 算回來——4.6 §3-0 容量裁定）
    if (game.phase === 'serve') s.recorder.begin(game, s.aiState);
    // 決定論代打（?autopilot=1 治具）：發球時刻一到（tick 條件）立即發往固定深區
    if (s.config.autopilot && game.phase === 'serve' &&
        serverId(game.match) === s.controlledId &&
        game.tick >= game.serveReadyTick && !s.servedThisTurn) {
      stage.controls.serveNow(game, stage.controls.serveZones(game)[0].aim, null);
      s.servedThisTurn = true;
    }
    // 先依球權決定受控者（固定模式下不動），再收集 Intent
    syncControlled(s);
    // Intent 管線：玩家與 11 個 AI 同型、同一條管線；sim 不知來源
    const playerIntents = [...stage.controls.collect(game, s.aiState)];
    // W4(P4) 題5：OPP 要球——浮鈕 tap 於下一個 sim tick 注入 'call' Intent
    // （Intent 唯一輸入鐵律；VCR 同錄可重演）
    if (s.pendingCallIntent) {
      s.pendingCallIntent = false;
      playerIntents.push({ tick: game.tick, playerId: s.playerId, action: 'call' });
    }
    // 4.6 §7 準度可讀性：受控者這一拍的**出手時機真值**（Intent 的 timing 原值——
    // TOUCH 事件的 power 已被超蓄夾到 0.85，分不出「放太晚」與「甜蜜區」）。
    // 純表現層取值：只讀不寫，sim 不知道有人在看
    const spikeIntent = playerIntents.find((i) => i.action === 'spike' && i.playerId === s.controlledId);
    if (spikeIntent) s.lastSpikeTiming = spikeIntent.timing ?? 1;
    // 錄影必須在 aiCollectIntents 之前——那一步會演進 aiState，而重演端是
    // 「先套 patch 再 collect」；順序對齊才逐格一致（rallyTape.js 契約）
    s.recorder.step(game, s.aiState, s.controlledId, playerIntents);
    const intents = [
      ...playerIntents,
      ...aiCollectIntents(game, s.aiState, [s.controlledId]),
    ];
    const events = stepGame(game, intents);
    frameEvents.push(...events);
    // 死球＝一球結束：本球錄影歸檔、開新錄影
    if (events.some((e) => e.type === 'DEAD_BALL')) {
      s.vcrLast = s.recorder.end() ?? s.vcrLast;
    }
    // ★ 2026-08-07 MEDIUM-2：內切回饋的取樣點必須在**每個 sim tick** ★
    //   `aiState.cutOutcome` 的壽命只有第二觸窗那幾 tick（ai.js:373-374 窗一結束就
    //   清成 null），而 UI 一個 rAF 只讀一次 ⇒ 一幀跑 ≥2 個 sim tick 時（掉幀／
    //   30Hz 螢幕上是必然）記錄與清除落在同一幀之內，浮字整個不見——內切**有生效**
    //   但玩家一個字都沒看到。這裡只鎖存、不顯示（顯示留在幀端，維持單一出口）。
    captureCutOutcome(s);
    // 夾塞（2026-08-07）：結算回饋與「我被排進夾塞了」字卡的取樣點，理由與上一行逐字
    // 相同——兩者的壽命都短於一個 rAF（`attackCombo` 在球飛出去那一刻就隨 approach 作廢）。
    captureTandemOutcome(s);
    captureBquickOutcome(s);
    captureTandemAssign(s);
    // 誘餌獎金入帳（2026-08-08）：唯一入帳點在 trust.js applyComboAssist，只在死球那一
    // tick（settlePoint）寫一次；理由同上——一幀可能跑過好幾個 tick，晚一步讀就錯過。
    captureComboAssistCredit(s);
    // 默契配對記帳（2026-08-09）：同樣要逐 sim tick 取樣——`attackCombo` 與 `claimId`
    // 的壽命都短於一個 rAF（前者隨 approach 作廢、後者在 touches===2 就被改寫成攻擊手）
    captureChemistryPair(s);
    s.accumulator -= SIM_DT;
    simSteps += 1;
  }
  return { frameEvents, simSteps };
}

// MEDIUM-2 的鎖存端：讀到屬於玩家、且這一波還沒播過的結算就存下來。
// 只寫不清（清在幀端播出時與 `onCutTap` 重按時）——sim 把它清掉不代表玩家看過了。
export function captureCutOutcome(s) {
  const oc = s.aiState?.cutOutcome;
  if (!oc || oc.pid !== s.playerId || s.cutFeedbackDone) return;
  if (s.cutOutcomeLatch?.flightId === oc.flightId) return;
  s.cutOutcomeLatch = oc;
}

// 夾塞結算的鎖存端（形狀逐項比照 `captureCutOutcome`）。
// ★ 2026-08-07 覆審 MEDIUM-4(a)：連 `mine` 一起鎖 ★ 「這球是不是你的」要在**結算當下**
// 取樣：`attackerId` 是本波的協調層狀態，播字卡的那一幀（可能好幾個 tick 之後）
// 讀到的已經不一定是同一波的值。實測夾塞按壓有 73.0% 的波球不是他的 ⇒ 文案必須分岔。
export function captureTandemOutcome(s) {
  const oc = s.aiState?.tandemOutcome;
  if (!oc || oc.pid !== s.playerId || s.tandemFeedbackDone) return;
  if (s.tandemOutcomeLatch?.flightId === oc.flightId) return;
  s.tandemOutcomeLatch = { ...oc, mine: s.aiState.attackerId === s.playerId };
}

// ★ 2026-08-07 Sawmah 裁定 2：字卡只給跑線的人 ★
// 玩家**自己被排進夾塞**時出一張浮字卡——「這球是夾塞」這件事原本只寫在腳下常駐
// 提示條裡（`routeCue`），真人試玩回報「畫面上沒字說這球是夾塞」。
//
// ★ 取樣點在 combo **排程成立的當下** ★ 三種來源（自己按的／S 叫的／25% 自動骰）
// 全都寫同一個 `aiState.attackCombo` ⇒ 讀它就三條路一次覆蓋，不必在三個地方各接一次線
//（同一件事寫在三處遲早分岔，本專案已為此踩過坑）。
//
// ★★ 2026-08-07 覆審 HIGH-1：去重鍵原本用 `rally.flightId`，一波出三張 ★★
//   `flightId` **每次擊球就 +1**（game.js:715/866/1131…），而 `attackCombo` 活到死球或
//   下一個第二觸窗才清（ai.js 兩個清空點）⇒ 舉球／扣球／攔網三個 flight 各觸發一次。
//   實測 77/77 波皆為 3 張（間隔約 1.4s／1.0s、flightId 連號），而 `floatText.js:14`
//   的 `MAX_LIVE = 3` 會被這三張塞滿，把同框的「Perfect!」與得分原因整批擠掉。
//   改成**以第二觸窗為邊緣觸發**：出窗即重新武裝、窗內只認第一次。
//   為什麼不改用 `approach.setTick` 當鍵：那個值在窗內 flightId churn 時會被重算，
//   而「一張卡對應一個決策窗」本來就是窗的語意，用旗標比用鍵更貼合。
export function captureTandemAssign(s) {
  const r = s.game?.rally;
  // 窗界＝我方第二觸窗（combo 只在這裡排程）。一離開就重新武裝＝下一波再給一次機會。
  if (s.game?.phase !== 'rally' || r?.touches !== 1) {
    s.tandemAssignArmed = true;
    return;
  }
  if (!s.tandemAssignArmed) return;
  const combo = s.aiState?.attackCombo;
  if (!combo || combo.type !== 'tandem' || combo.mainId !== s.playerId) return;
  s.tandemAssignArmed = false;
  // MEDIUM-4(a)：74% 的波球不是他的——那時他跑的是「拉牆的線」，不是「打的線」
  s.tandemAssignPending = s.aiState.attackerId === s.playerId ? 'mine' : 'decoy';
}

// ★ 2026-08-08 Sawmah 裁定：誘餌獎金真的入帳時出一張字卡 ★ 「跑了誘餌線」與「被登記
// 為候選」都不算——本函式只認 trust.js applyComboAssist 實際寫入 trustDyn 的那一刻
// （state.rally.comboAssistCredit，見 game.js/trust.js 的新增欄位）。三階段漏斗
// （跑線 114／候選 64／入帳 10）裡，字卡的張數必須等於最後那個數字，不是前兩個。
//
// ★ 只給玩家自己（裁定 2 的同一條）★ `credit.pid !== s.playerId` 直接 return——隊友
// 或對手入帳時，這裡不會武裝，flush 端自然不會出卡。
//
// ★ 去重 ★ flightId 全場單調遞增、只在 settlePoint 那一 tick 被賦一次值，用「上一次
// 消費過的 flightId」擋重複武裝即可，不需要像夾塞結算那樣另外維護一個「播過了」旗標
// （那裡的欄位在窗內會 churn 好幾次，這裡的欄位一波至多寫一次）。
export function captureComboAssistCredit(s) {
  const credit = s.game?.rally?.comboAssistCredit;
  if (!credit || credit.pid !== s.playerId) return;
  if (s.comboCreditSeenFlight === credit.flightId) return;
  s.comboCreditSeenFlight = credit.flightId;
  s.comboCreditLatch = credit;
}

// ════════════════════════════════════════════════════════════════
// 屆間養成卷 E2（2026-08-09 題三裁定）：默契配對記帳——**純觀察，零判定**
// ════════════════════════════════════════════════════════════════
// 載體＝「你與他共同完成一次組合攻擊」，兩種成立方式、單一概念：
//   (a) 玩家跑在組合的兩條線之一（不分終結者或誘餌）→ 對象＝**另一條線的跑者**
//   (b) 玩家是本波舉球者、且該波組合成立      → 對象＝**誘餌**（`partnerId`，恆為欄中）
// (b) 選誘餌不選終結者：終結者線是 `trust` 已覆蓋的事（二傳更常給誰球），
// 記在那裡即與 trust 重疊；誘餌關係目前零機制覆蓋。
//
// ★ 對象唯一化（題三條件 3）★ 每次合格事件只記**一組**配對，寫成 if/else 而不是
// 兩個獨立 if——(a)(b) 的互斥是結構保證的（二傳被 `attackPointsOf` 排除出攻擊池，
// ai.js:755 ⇒ 舉球者不可能同時是 mainId／partnerId），但互斥要寫在程式碼裡看得見，
// 不能只活在註解裡：日後那條結構前提變了，這裡仍然只發一組。
//
// ★ 去重＝第二觸窗的邊緣觸發、且在**窗關閉時**結算 ★
// 現成範式是 `captureTandemAssign`，但它 latch 的是窗內看到的**第一個** combo——
// 照抄會記到被覆寫掉的舊組合：combo 在窗內仍會被 `applyTandemCall`（玩家按夾塞）／
// `applyReplanCall`（S 遠段叫牌，可能寫 null）／`replanWithoutRunners`（沒人跑，改組織）
// 改寫。所以這裡每 tick 覆蓋同一個鎖存，出窗才結算＝記到的是**真的跑出去的那一組**。
// 不用 `flightId` 當去重鍵（一波橫跨三個 flight，2026-08-07 已為此出過三張字卡），
// 也不用物件 identity（窗內重新規劃會產生新物件、值卻相同）。
//
// ★ 玩家 id 用 `s.playerId` 不用 `s.controlledId` ★ 帶位接管會讓後者漂移到隊友身上。
export function captureChemistryPair(s) {
  const r = s.game?.rally;
  // 窗界＝第二觸窗（組合只在這裡排程）。一離開就結算——包含死球／換球權那一刻。
  if (s.game?.phase !== 'rally' || r?.touches !== 1) {
    flushChemistryWindow(s);
    return;
  }
  // 窗內逐 tick 覆寫（最後一次寫的才是真的跑出去的那一組；null＝這一波沒有組合）
  s.chemistryWindow = {
    combo: s.aiState?.attackCombo ?? null,
    setterId: s.aiState?.claimId ?? null, // 只在本窗內有效（touches===2 就被改寫）
  };
}

// 窗關閉：把鎖存結算成 0 或 1 組配對。無組合、對象取不到、對象不在我方名冊＝不記。
export function flushChemistryWindow(s) {
  const w = s.chemistryWindow;
  if (!w) return;
  s.chemistryWindow = null;
  const combo = w.combo;
  if (!combo) return;
  const me = s.playerId;
  let mateId = null;
  if (combo.mainId === me) mateId = combo.partnerId;        // (a) 玩家跑主線
  else if (combo.partnerId === me) mateId = combo.mainId;   // (a) 玩家跑誘餌線
  else if (w.setterId === me) mateId = combo.partnerId;     // (b) 玩家是本波舉球者
  if (!mateId || mateId === me) return;
  // 我方名冊守衛：對象不在同隊（或 id 查不到）＝不記，不要猜
  const myTeam = s.game?.players?.[me]?.teamId ?? null;
  if (!myTeam || s.game.players[mateId]?.teamId !== myTeam) return;
  s.chemistryTally[mateId] = (s.chemistryTally[mateId] ?? 0) + 1;
}

// 事件應用：音效/播報/juice（定格、震動、慢動作）/得分原因面板/慶祝
// W6.1 字卡同框整流（拍板 07-24 Q1-T2 修訂版：不丟卡）：本批次字卡先集中收單，
// 迴圈尾一次 flush——依優先序低→高送出（floatText 疊排＝後出的停在最顯眼的基準位、
// 先出的被上推），資訊零損失、同框重合疊字歸零。優先序：⚡45＞⭐40＞🧱/👆/🎭20＞PERFECT 10
// 賭局字卡的共用出口（事件端與幀端都會結算，兩處必須同規則——分開寫過一次就漂移）。
// `armed`＝createBlockBetArm 的結算回傳（null＝這一刻不評）。
// 節流見 blockBetFeedback.js 的 createBetCardGate：賭中與關鍵分一律放行、賭錯冷卻。
function showBetCard(s, armed, cards) {
  const { game } = s;
  if (!armed || s.blockBetKey === armed.flightId) return;
  const bet = blockBetFeedbackOf(game, s.aiState, s.controlledId, armed.spikerId,
    { setterId: armed.setterId, ranRoute: armed.ranRoute });
  if (!bet) return;
  s.blockBetKey = armed.flightId; // 這一波已評過（不論有沒有被節流掉，不重評）
  const score = game.match?.score ?? { A: 0, B: 0 };
  const pass = (s.betCardGate ??= createBetCardGate()).allow({
    rally: (score.A ?? 0) + (score.B ?? 0),
    keyPoint: keyPointOf(game),
    hit: bet.kind === 'hit',
  });
  if (pass) cards.push({ pri: 20, text: bet.text, color: bet.color, dur: bet.ms });
}

function applyEvents(s, frameEvents, now) {
  const { game, stage } = s;
  const cards = []; // [{ pri, text, color, dur, onShown? }]
  // W4(P4) Q8 多局賽制字卡：決勝局 8 分換邊（FIVB 事件化——物理半場不換，演出告知）
  const myTeam = game.players[s.playerId]?.teamId ?? 'A';
  for (const e of frameEvents) {
    if (e.type === 'SIDE_SWITCH') {
      cards.push({ pri: 45, text: '🔄 決勝局 8 分——換邊！', color: '#ffd166', dur: 2600 });
    }
    // W4 題3 二次球真值字卡：實際出手（S 第二擊 spike）才立旗——
    // 得手「🎯偷襲得手！」／被識破（對手接起/攔到）「被看穿了——他守著淺區」；
    // 出界失分＝pointBanner 講故事，不出偷襲字卡（真值：那不是被識破，是自己失手）
    if (e.type === 'TOUCH' && e.playerId === s.playerId && e.kind === 'spike'
      && e.touches === 2 && game.players[s.playerId]?.currentRole === 'setter') {
      s.dumpLive = true;
    } else if (s.dumpLive && (e.type === 'TOUCH' || e.type === 'BLOCK_TOUCH') && e.team !== myTeam) {
      cards.push({ pri: 40, text: '被看穿了——他守著淺區', color: '#c8d6eb', dur: 1800 });
      s.dumpLive = false;
    } else if (s.dumpLive && e.type === 'SCORE') {
      if (e.team === myTeam) {
        cards.push({ pri: 40, text: '🎯 偷襲得手！', color: '#ffd166', dur: 1800 });
      }
      s.dumpLive = false;
    }
    // W4（07-27 試玩回饋 C 案）：被自由人換下那一刻講清楚節拍——去哪、何時回、
    // 主動權在哪（顯示哲學：狀態誠實呈現）
    if (e.type === 'LIBERO_SWAP' && e.outId === s.playerId && e.team === myTeam) {
      cards.push({
        pri: 30,
        text: '自由人替補後排——輪到前排自動回場；想自己守＝板凳「回場」鈕',
        color: '#9fb0cc',
        dur: 2800,
      });
    }
    // ★ 位置體檢裁定 B1（2026-08-06）：OH 的「內切」窗 ★
    // ★ 2026-08-07 Sawmah 改判：開窗時**不預寫** `cutCall` ★
    //   原設計在開窗當下寫 `{ cut:false }`＝把玩家身上原有的 30% 自動內切骰子拿掉，
    //   於是「不按＝永遠直線」——真人實測回報的是**球路比改動前更單調**，那顆鈕的
    //   存在反而讓沒按的人變差。改判後：不按＝回到 `CROSS_RATE` 30% 擲骰（與 AI 同路徑、
    //   等同改動前的體驗），按了＝這一波接管成內切。
    // ★ 2026-08-07 修 bug：開窗**不再掛在 TOUCH 事件上、也不再自帶 800ms 計時器** ★
    //   舊制在此一次性 `show()` 並記 `cutWindowUntil = now + 800`，但 sim 端的線在
    //   開窗後**一個 tick** 就被 `ensureFlightPlan` 鎖死（實測 D=1 生效率 22.2%
    //   ＝自然骰基準）⇒ 名目 800ms、真實 16.7ms，真人按的每一次都無效。
    //   現在窗由 sim 的 `cutStateOf` 逐 frame 決定（見下方浮鈕窗管理），
    //   **名目窗＝真實窗**；順帶解掉「一傳不到位照樣跳鈕」（passTier 要到 TOUCH 的
    //   下一 tick 才算得出來，掛在事件上根本讀不到）。
    // W4 題5 OPP 要球窗：一傳起球＋玩家 OPP 後排→「⚡跟上！」浮鈕（0.8s；
    // OH 不加任何要球機制——§0 題5 關卷）；每 flight 一次
    if (e.type === 'TOUCH' && e.touches === 1 && e.team === myTeam && !s.replay
      && game.players[s.playerId]?.currentRole === 'opposite'
      && e.playerId !== s.playerId
      && onCourt(game, s.playerId)
      && isBackRow(game.match.rotations[myTeam], s.playerId)
      && s.calledFlight !== game.rally.flightId) {
      s.calledFlight = game.rally.flightId;
      s.callWindowUntil = now + 800;
      stage.callButton?.show(() => onCallTap(s));
    }
  }
  stage.sfx.onEvents(frameEvents, { rallyFlights: game.rally.flightId - s.rallyStartFlight });
  stage.controls.onEvents(frameEvents); // 出手成功 → 清出手緩衝
  if (stage.commentary) stage.commentary.onEvents(frameEvents, game, s.aiState, now, s.controlledId);
  // juice：重扣/攔網定格＋震動、死球大震（殺球落地的重量感）
  for (const e of frameEvents) {
    // 丙1（接球微回饋批2，NJ-2）：在本次迭代任何東西改寫 s.lastTouch 之前先存一份
    // 快照——下面「TOUCH/SERVE → s.lastTouch = e」那段會把它蓋成這個事件本身，
    // 之後要問「上一次觸球是不是對方重扣」就問不到了。
    const prevTouchForDig = s.lastTouch;
    // 4.5B §3 招牌演出追蹤：解除（對手救起/新發球）→武裝（成因事件）；
    // 起鏡只認 SCORE（追加條 B：勝負已定的那一拍之後——見下方 SCORE 分支）
    s.pendingSig = trackSignature(s.pendingSig, e, myTeam);
    if (e.type === 'TOUCH' && e.kind === 'spike' && e.team !== myTeam) {
      s.lastOppSpikerId = e.playerId; // MB 俯視鏡的對面攻擊手（他抬頭看你）
    }
    // ★ 位置體檢 2026-08-06 裁定 C：補上位置檢查（判定抽到 signatureBeats.ohSignatureArms）★
    // 檔頭寫明這是「OH 被騙的人」，但原本沒有任何 role 判斷＝任何位置都會起鏡。
    // 抽成純函式的理由與 `mbCallFeedbackOf` 同一條：判定住在 UI 迴圈就沒有測試守得住。
    if (ohSignatureArms(e, s.controlledId, game.players[s.controlledId]?.currentRole)) {
      s.pendingSig = armSignature('oh', { focusId: e.blockerId }); // 被騙的人入鏡
    }
    if (e.type === 'TOUCH' && e.kind === 'spike' && e.playerId === s.playerId && s.callLive
      && game.players[s.playerId]?.currentRole === 'opposite') {
      s.pendingSig = armSignature('opp', {}); // 要球出手——得手才兌現（mate 於起鏡時解析）
      s.callLive = false;
    }
    if (e.type === 'SERVE') {
      s.rallyStartFlight = game.rally.flightId;
      stage.floatText.setBaseOffset?.(0); // banner 已自動收（1.6s）——字卡帶歸位泡泡下
      // 4.5B §3：發球＝操作開始——演出窗必收（主角視角條款）；本球關鍵分判定落此
      s.sigBeat = null;
      s.keyPointRally = keyPointOf(game);
      s.callLive = false;
    }
    // 得分原因面板：追蹤最後觸球（含發球/攔網）；DEAD_BALL+SCORE 湊齊即顯示
    if (e.type === 'TOUCH' || e.type === 'SERVE') {
      s.lastTouch = { team: e.team, playerId: e.playerId, kind: e.kind ?? 'serve', power: e.power };
    } else if (e.type === 'BLOCK_TOUCH') {
      s.lastTouch = { team: e.team, playerId: e.playerId, kind: 'block' };
    }
    // ★ 2026-08-03 裁定乙第二步（Sawmah 拍板）★ 字卡從評「時機」改成評「封哪邊」。
    //
    // 為什麼要整組改寫：`6b7051b` 把面板從「何時跳」改成問「封哪邊」（起跳交給自動跳攔）
    // 之後，`s.mbCommit` 從 `{jumped:true}` 變成 `{jumped:false, line}`，而這裡的條件是
    // `s.mbCommit?.jumped` ⇒ **恆假**，三句字卡從那天起一句都沒印出來過（稽核 auditA 抓到）。
    // 但**不能只把 jumped 改回 true**：那三句評的全是「你這一跳早了/晚了」，
    // 而時機已經不是玩家的決定 ⇒ 語意整組過期，玩家會困惑「我又沒選時機」。
    //
    // 新判準與 L 指揮的「讀對」共用同一個真相來源（`rally.lastSpikeZone`，
    // 由 `game.js:classifySpikeZone` 在扣球當下分類）——兩個位置的回饋才不會各說各話。
    // 時序：扣球 TOUCH 先於過網，且過網不重置 lastSpikeZone ⇒ 這裡讀得到本波的分類。
    // 封到球的情況已有 BLOCK_TOUCH 字卡（上方），這裡只處理「球過網了＝沒攔到」。
    // ★ 2026-08-04 試玩回報修復 ★ 原本這裡還有一條 `currentRole === 'middle'`，
    // 是從「MB 讀心面板」時代沿用下來的。**但那個面板早就不限 MB 了**——
    // `matchControls.js:53-56` 明文「命名債：`mbOptions` 仍帶 mb 前綴＝歷史名，
    // **語意已不限 MB**」，開啟條件是「前排 ＋ 站在攔網帶」（`:56-59`）。
    // ⇒ 主攻／副攻站上網前一樣選得了封線，卻**永遠看不到回饋**（Sawmah 08-04 實玩回報）。
    // 判準改成只看「玩家有沒有下過封線指令」——`s.mbCommit` 只在面板回呼裡寫入，
    // 有值就代表他選過，角色檢查多餘且有害。
    if (e.type === 'BALL_OVER_NET' && s.mbCommit?.line
      && e.toTeam === game.players[s.controlledId]?.teamId) {
      // 判定抽在 blockBetFeedback.js（純函式＋測試守著），不內聯——
      // 前一版就是因為內聯而恆假了一整天沒人發現。
      const card = mbCallFeedbackOf(game.rally.lastSpikeZone, s.mbCommit);
      if (card) stage.floatText.show(card.text, card.color, card.ms);
      s.mbCommit = null;
    }
    // 07-27 L 指揮結果（W4 B-2 兩層讀對之「漏接起」層）：我方第一觸出字卡——
    // 球走留的線、後排起球＝也是你的功（神救球演出時已讓位不疊）
    // W4 Q9：改判記帳（box score 第四欄「改判成功率」——A2 預留消費就此定形入帳）
    if (e.type === 'TOUCH' && e.touches === 1 && s.digReadResult != null
      && game.players[s.controlledId]?.currentRole === 'libero'
      && e.team === game.players[s.controlledId].teamId) {
      if (s.digReadWasOverride) {
        s.lOverrideTally.n += 1;
        if (s.digReadResult) s.lOverrideTally.ok += 1;
      }
      // 07-27 四輪：同波已出封線卡（1.5s 窗）＝讀對/讀反不再出（一波至多一張結果卡）
      if (now - (s.lWallCardAt ?? -1e9) > 1500) {
        stage.floatText.show(
          s.digReadResult ? '📖 讀對了——球走你留的線' : '讀反了……',
          s.digReadResult ? '#7ee787' : '#c8d6eb', 1300,
        );
      }
      s.digReadResult = null;
      s.digReadWasOverride = false;
    }
    // W4 B-2「封到」層：攔網觸球在指令線上（配套的封線賭對）——分開字卡、皆玩家的功。
    // 07-27 四輪：同波整流——封到卡出過＝讀對/讀反卡不再出（擦手情境曾連發兩張）
    if (e.type === 'BLOCK_TOUCH' && e.team === game.players[s.controlledId]?.teamId
      && game.players[s.controlledId]?.currentRole === 'libero'
      && s.aiState.digBias?.block && s.aiState.digBias.block !== 'off'
      && game.rally.lastSpikeZone === s.aiState.digBias.block) {
      s.lWallCardAt = now;
      stage.floatText.show('🧱 封線成功！', '#ffd166', 1400);
    }
    // W4 B-4：ace 反讀揭曉（誠實字卡——他改打讓開的線的那一拍）
    if (e.type === 'TOUCH' && e.kind === 'spike' && e.playerId === s.rivalAcePid
      && s.counterArmedFlight === game.rally.flightId) {
      s.counterArmedFlight = -1;
      stage.floatText.show('他改線了——他在讀你的暗號', '#ff9d7a', 2200);
    }
    // 攔網時序卷 段 5 回饋層（題 E 收尾 2 改遞延結算）：我方扣球武裝、**球到網那一刻**
    // 才評「賭錯空門／賭中罩住」——E1 後 commit 是「球到達時才在空中」，真人揮拍比
    // 預測早半拍，在觸球 tick 量恆空（08-05 攻擊手實測整場零卡）。時序狀態機抽在
    // `createBlockBetArm`（純函式，測試餵生產端同形事件流）；此處只做接線與防重播
    //（同一波 flightId 只播一次）。二傳者也算參與（S 反配是玩法本體）由狀態機自己記。
    {
      // 參與快照在扣球當下取——球到網時 approach 已清掉，結算時讀恆 false（探針實測 42→0）
      const ctx = (e.type === 'TOUCH' && e.kind === 'spike' && e.team === myTeam)
        ? {
          ranRoute: s.aiState?.approach?.team === myTeam
            && !!s.aiState.approach.routes?.some((r) => r.pid === s.controlledId),
        }
        : null;
      const armed = (s.blockBetArm ??= createBlockBetArm())
        .onEvent(e, myTeam, game.rally.flightId, ctx);
      showBetCard(s, armed, cards);
    }
    // 丙1（NJ-2）：重扣被救起——獨立於下面那組 if/else if 鏈（可能與丙2 魚躍慢動作
    // 同一拍疊加：先短定格、定格結束後接慢動作，同「重扣自己那一下」既有的疊加範式）。
    // 判定抽在 receiveJuice.js（單一門檻來源，不得另抄 0.7）；Math.max 防止蓋掉
    // 同一事件已由其他分支（如下面的神救球）給出的更大值。
    if (isHeavySpikeDig(prevTouchForDig, e)) {
      s.hitStopUntil = Math.max(s.hitStopUntil, now + DIG_HIT_STOP_MS); // 【試玩必調】提案 90ms
      s.shake = Math.max(s.shake, 0.08);
    }
    // 丙2（NJ-3）：魚躍成功救起——短慢動作獎勵（撲空無 TOUCH 事件，天然只獎成功，
    // 見 receiveJuice.js 檔頭）。Math.max：若同一下已被神救球分支給了更長的
    // slowUntil（650ms），這裡的 300ms 不會反而把它縮短。
    if (isDiveSaveTouch(e)) {
      s.slowUntil = Math.max(s.slowUntil, now + DIVE_SAVE_SLOWMO_MS); // 【試玩必調】提案 300ms
    }
    // 丙3（NJ-4）：完美接球——球體短暫發光時窗（單一來源＝sim 外露的 e.perfect，
    // 這裡不再另算門檻）；音效疊層在 sfx.js 的 onEvents 同樣直接讀 e.perfect。
    if (e.type === 'TOUCH' && e.perfect) {
      s.ballGlowUntil = Math.max(s.ballGlowUntil, now + PERFECT_GLOW_MS);
    }
    if (e.type === 'TOUCH' && e.kind === 'spike') {
      // 重扣門檻收斂到 receiveJuice.HEAVY_SPIKE_POWER_MIN 單一來源（批2 覆核修正：
      // 原本此處行內 0.7 與 receiveJuice 各一份＝兩份門檻，NJ-2「不得另抄」）
      // Math.max：與丙1/丙2 的寫入者對稱——同一 frameEvents 批次（掉幀補跑多 tick）
      // 內後到的事件不得反向蓋短已設好的窗（覆審 MEDIUM 修正）
      s.hitStopUntil = Math.max(s.hitStopUntil, now + ((e.power ?? 1) >= HEAVY_SPIKE_POWER_MIN ? 70 : 40));
      if ((e.power ?? 1) >= HEAVY_SPIKE_POWER_MIN) s.slowUntil = Math.max(s.slowUntil ?? 0, now + 450); // 重扣＝定格接慢動作
      s.shake = Math.max(s.shake, 0.12);
    } else if (e.type === 'TOUCH' && e.playerId === s.controlledId && e.touches === 1
        && stage.controls.consumeDigHeroSignal?.()) {
      // W3(P4) L 魚躍演出（附錄 A4①）：改判成功/Perfect 撲必死球的起球確認——
      // 慢動作＋低機位貼地鏡頭＋倒抽氣→爆歡呼；隊友回饋（A4③）：當屆 S 專屬台詞
      // （45 秒節流——前輩的關心不是罐頭）。塵土粒子＝試玩債（快照記錄）
      s.slowUntil = now + 650;
      s.diveCamUntil = now + 850;
      s.digReadResult = null; // 神救球演出優先，不疊讀對字卡
      stage.sfx.gaspCheer?.();
      stage.floatText.show('⚡ 神救球！', '#6ee7ff', 1600);
      if (!s.liberoPraiseAt || now - s.liberoPraiseAt > 45000) {
        s.liberoPraiseAt = now;
        const setter = Object.values(game.players)
          .find((p) => p.teamId === e.team && p.currentRole === 'setter');
        if (setter) {
          stage.floatText.show(`${setter.name}：「有你在後面，我敢舉快攻！」`, '#7ee787', 2000);
        }
      }
    } else if (e.type === 'BLOCK_TOUCH') {
      s.hitStopUntil = Math.max(s.hitStopUntil, now + 60); // Math.max 對稱，同上（覆審 MEDIUM 修正）
      s.shake = Math.max(s.shake, 0.2);
      // 07-27 MB 結果回饋：你封到球了（讀舉承諾的兌現）
      if (e.playerId === s.controlledId && s.mbCommit) {
        stage.floatText.show('🧱 封到了！', '#ffd166', 1400);
        s.mbCommit = null;
      }
      // 4.5B §3「早到的人」（07-28 Sawmah 拍板擴大：**攔網直接得分皆給**，
      // 不限搶快——搶快只是達成路徑之一，攔死本身即 MB 的身分時刻）：
      // 玩家＝MB、結實封到（擦手不算）、這一拍直接終結（後續任何觸球即解除，
      // 見 trackSignature）才起鏡
      if (e.playerId === s.controlledId && !e.graze
        && game.players[s.controlledId]?.currentRole === 'middle') {
        s.pendingSig = armSignature('mb', { focusId: s.lastOppSpikerId });
      }
      // 網口對決（2026-08-27 批1 武裝、批3 起改播即時 highlight 重播）：任一
      // BLOCK_TOUCH 都是扣球 vs 攔網對決的成因——不限受控者/隊伍（「我方/對面」
      // 看的是隊伍，見 signatureBeats.js 檔頭）。不覆蓋更具體的已武裝演出
      //（MB「早到的人」同拍優先，仲裁與上方「line」同款：`!s.pendingSig` 守門）。
      // 承載的資料只剩 blockerTeam——定性（netDuelQualify）只需要它，鏡位改由
      // 導播腳本自己從卷裡算（批3：現場鏡頭構圖廢止，focusId/spikerId 隨之退場）
      if (!s.pendingSig) s.pendingSig = armSignature('netduel', { blockerTeam: e.team });
    } else if (e.type === 'DEAD_BALL') {
      // 網口對決 qualify（ND-2b）：只在死球那一刻才知道是不是 tool／stuff——
      // 判定收在 signatureBeats.netDuelQualify（純函式），這裡只做賦值
      if (s.pendingSig?.kind === 'netduel') {
        s.pendingSig = netDuelQualify(s.pendingSig, e);
      }
      s.shake = Math.max(s.shake, 0.26);
      s.pendingDead = { reason: e.reason };
      // 4.5B「邊線是我的」（07-28 拍板 A 案，綁事件＝任何受控攻擊者）：我方殺球/
      // 吊球 BALL_IN 且落點咬線（≤SIG_LINE_M）——不覆蓋更特定的已武裝演出
      //（假動作/攔死/要球）；SCORE 我方（同批緊隨）才起鏡
      if (!s.pendingSig && e.reason === 'BALL_IN' && e.at
        && s.lastTouch?.playerId === s.controlledId
        && (s.lastTouch.kind === 'spike' || s.lastTouch.kind === 'tip')) {
        const lineD = lineKillDistance(e.at);
        if (lineD !== null && lineD <= SIG_LINE_M) {
          s.pendingSig = armSignature('line', { at: { x: e.at.x, z: e.at.z } });
          // 4.6 §7：咬線得手的半格資訊——**甜蜜區命中**寫明白（同樣選邊線，
          // 一年級常出界、三年級咬白線＝成長兩層地基的自然兌現，讓玩家讀得到）
          const tm = timingVerdict(s.lastSpikeTiming, TUNING);
          if (tm === 'sweet') {
            cards.push({
              pri: 20,
              text: `🎯 甜蜜區——咬線 ${Math.round(lineD * 100)}cm`,
              color: '#ffd166',
              dur: 1800,
            });
          }
        }
      }
      // 4.6 §7：出手失手的成因**歸給時機、不歸運氣**（既有字卡通道，不新增通道）。
      // 只在受控者本人的攻擊上出——4.5B 字卡減量哲學：不是每球都要講話
      if (e.reason === 'OUT' && s.lastTouch?.playerId === s.controlledId
        && (s.lastTouch.kind === 'spike' || s.lastTouch.kind === 'tip')) {
        const tm = timingVerdict(s.lastSpikeTiming, TUNING);
        if (tm === 'late') cards.push({ pri: 12, text: '放太晚——手型跑掉了', color: '#c8d6eb', dur: 1600 });
        else if (tm === 'early') cards.push({ pri: 12, text: '早了半拍——還沒到最高點', color: '#c8d6eb', dur: 1600 });
        else cards.push({ pri: 12, text: '時機是對的——線壓過頭了', color: '#c8d6eb', dur: 1600 });
      }
      stage.controls.consumeDigHeroSignal?.(); // W3 L：丟棄未兌現的演出武裝（撲空）
      s.digReadResult = null; // 07-27 結果字卡狀態隨球清
      s.mbCommit = null;
      s.callLive = false; // 4.5B §3：死球＝要球兌現窗關（得手與否由 SCORE 分支結案）
      // B1：內切的決定只管這一波（sim 端的 ensureFlightPlan 也有兩個清空點；
      // 這裡是死球時的即時收尾，讓浮鈕與回饋旗同一拍歸零）
      s.aiState.cutCall = null;
      s.aiState.cutOutcome = null;
      s.cutFeedbackDone = false;
      stage.cutButton?.hide();
      // 夾塞同壽命（sim 端的 ensureFlightPlan 也有兩個清空點；這裡是死球的即時收尾）
      s.aiState.tandemCall = null;
      s.aiState.tandemOutcome = null;
      s.tandemFeedbackDone = false;
      stage.tandemButton?.hide();
      // B 快同壽命（2026-08-09）
      s.aiState.bquickCall = null;
      s.aiState.bquickOutcome = null;
      s.bquickFeedbackDone = false;
      stage.bquickButton?.hide();
      checkRecruitFeats(s, cards); // W6 壯舉達成字卡（死球節拍增量檢查）
      // 教學局的進度是逐幀跟著教練走的（updateTutorial），死球節拍不再重算一次
      if (!s.tutorial) refreshPracticeHud(s, cards); // 練習賽科目進度＋完成字卡（同一個死球節拍）
      stage.benchAccelBtn?.forceOff(); // W7 C2③：死球自動恢復原速（拍板）
      // W7 C1②：主角低體力教練建議——每場最多一次，只在主角「仍在場上」時提醒
      // （已經下場就沒什麼好建議的；讓位給體力播報的主角豁免那句話）
      if (!s.staminaAdviceShown && game.stamina && stage.teachDialog &&
          onCourt(game, s.playerId) &&
          (game.stamina[s.playerId] ?? 1) < STAMINA.TIER2_BELOW) {
        s.staminaAdviceShown = true;
        stage.coachOptionDialog?.hide(); // 卡位互斥防呆（同 bottom:26px）
        stage.teachDialog.show([ // 命名工程 07-25 定稿
          { speaker: '教練', text: `${game.players[s.playerId]?.name ?? ''}，你的腳在飄了。下來喘口氣——場上交給大家。` },
        ]);
      }
      // W7 B3：對手 AI 暫停判準（死球節拍檢查，成立才喊——被連 4 分＋死球＋有額度）；
      // W7.1：對面集合帶位＋倒數條（同我方一套事實源）＋提示「趁機換人」（換人窗口本來就開著）；
      // W8（07-26 拍板，推翻 W7「AI 無教練選項」）：對手也選 calm/fire——情境決定論
      // （ai.js aiTimeoutBoost），走與我方同一條 sim 路徑；選擇公開（戰術行動非幕後
      // 平衡）＝對面戰術板畫出＋播報告知，玩家可據以應對
      if (aiTimeoutWanted(game, 'B') && applyTimeout(game, { team: 'B' }).ok) {
        s.timeoutHuddleTeam = 'B';
        cards.push({ pri: 25, text: '對方喊暫停——趁機換人 ⚙', color: '#ff9d7a', dur: 1800 });
        const feed = [{ type: 'TIMEOUT', tick: game.tick, team: 'B', remaining: game.timeouts.B.remaining }];
        const bBoost = aiTimeoutBoost(game, 'B');
        if (applyTimeoutBoost(game, { team: 'B', boost: bBoost }).ok) {
          stage.matchView.setHuddlePlay('B', bBoost);
          feed.push({ type: 'TIMEOUT_BOOST', tick: game.tick, team: 'B', boost: bBoost });
          s.pendingOppBoost = bBoost; // 散圈回場時再浮字（見下方暫停窗收尾）
        }
        stage.commentary?.onEvents(feed, game, s.aiState, now, s.controlledId);
      }
      // W1(P4) A1 對手疲勞換人：判準在 ai.js（決定論）、sim 唯一寫入路徑
      // applySubstitution（與我方同一條）；播報一句＝字卡（沿對手暫停的浮字語言，
      // 體力標籤變色＋迷你條已雙方對稱——換誰下去玩家看得出為什麼）
      const oppSub = aiSubstitutionWanted(game, 'B');
      if (oppSub && applySubstitution(game, { team: 'B', ...oppSub }).ok) {
        const outName = game.players[oppSub.outId]?.name ?? '';
        const inName = game.players[oppSub.inId]?.name ?? '';
        cards.push({
          pri: 20, text: `對方換人——${outName} 下，${inName} 上`,
          color: '#ff9d7a', dur: 1800,
        });
      }
    } else if (e.type === 'MOMENTUM') {
      // W7.1 #4①：滿檔進入一次性字卡（判定在 heroCards.js 純函式，node 可直測）
      const card = momentumCardFor(s.prevMomentumValue, e.value, TUNING.MOMENTUM_MAX);
      if (card) cards.push(card);
      s.prevMomentumValue = e.value;
      // W7.1 #4③：氣勢計變動 delta 指示（條端閃箭頭）
      stage.scoreboard.flashMomentum(e.value);
    } else if (e.type === 'COMEBACK_SPARK') {
      // W7 C3②：觀眾爆聲——沿用既有 cheer 管線再加碼一次（幅度明顯高於一般得分的 DEAD_BALL 自動歡呼）
      // （⚡ 字卡本身由下方 heroCardFor 統一產出）
      stage.sfx.cheer(2.4);
    } else if (e.type === 'SCORE') {
      // 得分慶祝：全員高舉小跳＋鏡頭 FOV punch（推近再彈回）
      s.fovPunchUntil = now + 700;
      // W7 B4④：氣勢滿檔（±MOMENTUM_MAX）且得分方正是氣勢有利方＝互擊掌加碼（cheer→highfive，時長拉長）
      const momentumFavored = game.momentum
        ? (game.momentum.value === TUNING.MOMENTUM_MAX ? 'A'
          : game.momentum.value === -TUNING.MOMENTUM_MAX ? 'B' : null)
        : null;
      const cheerPose = e.team === momentumFavored ? 'highfive' : 'cheer';
      for (const id of game.match.rotations[e.team]) {
        stage.matchView.triggerPose(id, cheerPose);
      }
      // 批3：即時 highlight 的定性資料（reason／最後觸球）在下面的 banner 區塊
      // 就會被清成 null，先取一份快照——判定本身在 planHighlightReplay（純函式）
      const deadSnap = s.pendingDead
        ? { reason: s.pendingDead.reason, lastTouch: s.lastTouch }
        : null;
      let pointInfo = null;
      if (s.pendingDead) {
        pointInfo = derivePointInfo({
          reason: s.pendingDead.reason, winner: e.team,
          myTeam: game.players[s.controlledId]?.teamId,
          lastTouch: s.lastTouch, controlledId: s.controlledId, score: e.score,
        });
        stage.pointBanner.show(pointInfo);
        // 版面稽核 07-24：banner 佔 169-240px 帶與字卡帶基準位 178 重疊——
        // banner 在場時死球字卡（⭐/⚡/🧱）整帶下移讓位；banner 自動收（1.6s）即歸位
        //（SERVE 另有歸位是保險：玩家發球前的等待可能長於 banner 壽命）
        stage.floatText.setBaseOffset?.(96);
        setTimeout(() => stage.floatText.setBaseOffset?.(0), 1700);
        s.pendingDead = null;
        s.lastTouch = null;
      }
      // 4.5B §3：招牌演出起鏡——勝負已定的那一拍之後（追加條 B）。
      // 我方得分且武裝中＝發放；對方得分＝空手；一球一議（SCORE 後必清）
      // ★ 批3：網口對決不再走現場鏡頭演出 ★ qualify 出的 outcome 改餵即時 highlight
      // 重播（下面 planHighlightReplay）；oh/mb/opp/line 四道現場演出這條路徑零改動
      const isDuel = s.pendingSig?.kind === 'netduel';
      const duel = isDuel ? netDuelFire(s.pendingSig, e) : null;
      const fired = isDuel ? null : signatureFire(s.pendingSig, e, myTeam);
      s.pendingSig = null;
      if (fired && !s.replay) fireSignatureBeat(s, fired, now);
      // 即時 highlight 重播（批3 HR-2）：網口對決得分／關鍵分重扣得分 → 死球窗內
      // 自動慢動作重播那一球尾段＋字卡。判定全在純函式，這裡只搬運
      const hlPlan = planHighlightReplay({
        duelOutcome: duel?.outcome ?? null,
        reason: deadSnap?.reason ?? null,
        lastTouch: deadSnap?.lastTouch ?? null,
        winner: e.team,
        myTeam,
        keyPoint: s.keyPointRally, // 發球當下判定的真值（得分後分數已變，不能重問）
        pref: s.presentation.pref,
      });
      if (hlPlan) startHighlightReplay(s, hlPlan, pointInfo);
    }
    // 主角字卡統一出口（判定在 heroCards.js 純函式：Perfect 一傳／攔網碰球／
    // 假動作騙贏／回歸建功——測試用真 sim 事件流直測，不必開瀏覽器目視）
    const heroCard = heroCardFor(e, {
      controlledId: s.controlledId,
      playerName: e.playerId ? game.players[e.playerId]?.name : '',
    });
    if (heroCard) cards.push(heroCard);
  }
  // 題 E 收尾 2 幀端：球的 z 變號＝到網（可觀察物理，同 game.js crossed 條件）——
  // 武裝中的賭局字卡在這一刻結算（事件端的 BLOCK_TOUCH 分支已涵蓋被攔回不過網的球）
  showBetCard(s, s.blockBetArm?.onFrame(game.ball?.z ?? 0), cards);
  // flush：低優先先出（被疊排上推）、最高優先最後出＝停在基準位；全部都出、零丟卡
  if (cards.length) {
    cards.sort((a, b) => a.pri - b.pri);
    for (const c of cards) {
      stage.floatText.show(c.text, c.color, c.dur);
      c.onShown?.();
    }
  }
}

// 二次球相遇點圈的三檔顏色（`contactAssist.js` 回傳的 tier → 顯示色）。
// ★ 紅色 0xff5b5b 保留給下面「預測出界」原意，不得挪用★——本專案剛付過「一個判準
// 兼任兩個問題」的學費，橘色是特地為 receive 檔另挑的，不與出界警示撞色。
const CONTACT_ASSIST_COLOR = { spike: 0x5ee08a, set: 0xffd166, receive: 0xff9f45 };

// 操作輔助與動作觸發：落點圈／「這球歸你」光圈／起跳與攔網姿勢／AI 先跳後揮
export function updateAssistAndPoses(s) {
  const { game, aiState, stage } = s;
  // 操作輔助：來球落點圈（每個 flight 只預測一次，唯讀取用 sim 純函式）
  if (s.config.assistOn && game.phase === 'rally') {
    if (s.assistFlight !== game.rally.flightId) {
      s.assistFlight = game.rally.flightId;
      s.assistLanding = predictLanding(game.ball);
    }
    // 二次球相遇點（本批新增）：受控者是本波二傳、且 claim 指到他時，這顆圈該畫的
    // 是「球墜到手點高度那一刻」而不是落地點——落地圈與真正該站的點差 0.72m 中位數，
    // 是 13.4%「人到了卻搆不到」的根因（見 contactAssist.js 檔頭）。前後排／任何一傳
    // 品質都會顯示，差別在 contactAssistFor 內部：綠色 spike 檔只在 `setOptions.js:93`
    // 的🎯二次球鈕真的會出現時才給（前排＋一傳 perfect），否則降到 set 檔——綠圈不得
    // 承諾一顆玩家手上根本按不到的鈕。
    // ★ 逐幀重算、不比照 assistLanding 做 flight 級快取 ★：tier 由球的「當前高度」
    // 決定，同一波球會隨下墜從 spike→set→receive 逐檔切換，快取住第一幀的結果
    // 會讓圈永遠停在最初那一檔，不會跟著球降下來。
    const controlledPlayer = game.players[s.controlledId];
    const assist = controlledPlayer
      ? contactAssistFor({
        game, player: controlledPlayer, tuning: TUNING,
        claimId: aiState.claimId, passTier: aiState.passTier,
      })
      : null;
    if (assist) {
      stage.landingMarker.setColor(CONTACT_ASSIST_COLOR[assist.tier]);
      stage.landingMarker.show(assist.point);
    } else if (s.assistLanding && s.assistLanding.z > 0) {
      // 紅圈＝預測出界（別碰它！）；青圈＝界內來球
      const isOut = landedCourtTeam(s.assistLanding.x, s.assistLanding.z) === null;
      stage.landingMarker.setColor(isOut ? 0xff5b5b : 0x6ee7ff);
      stage.landingMarker.show(s.assistLanding);
    } else stage.landingMarker.hide();
  } else {
    stage.landingMarker.hide();
  }
  // 「這球歸你」：AI 呼叫鎖定指到受控者 → 光圈變橘＋提示
  const myBall = game.phase === 'rally' && aiState.claimId === s.controlledId;
  stage.matchView.setHot(myBall);
  // 玩家放開起跳／點攔網 → 立即播動作（後續由 sim 事件接手）
  if (stage.controls.consumeJumpSignal()) stage.matchView.triggerPose(s.controlledId, 'windup');
  if (stage.controls.consumeBlockSignal()) stage.matchView.triggerPose(s.controlledId, 'block');
  // AI 接球/舉球預備（07-28 動作協調性）：claim 者在球到之前先擺好姿勢——
  // 原本兩者都是「球碰到手才播動作」。用協調層算好的接觸點倒數（同扣球那套）
  if (game.phase === 'rally' && aiState.claimId && aiState.claimId !== s.controlledId
    && aiState.contactPoint?.ticks != null && aiState.flightId !== s.lastReadyFlight) {
    const toContact = aiState.contactPoint.ticks - (game.tick - aiState.planTick);
    const lead = game.rally.touches === 1 ? SET_READY_LEAD : RECEIVE_READY_LEAD;
    if (toContact <= lead && game.rally.touches <= 1) {
      s.lastReadyFlight = aiState.flightId;
      stage.matchView.triggerPose(
        aiState.claimId,
        game.rally.touches === 1 ? 'setReady' : 'receiveReady',
      );
    }
  }
  // 擊球動作提前觸發（07-29；見檔頭 SET_CONTACT_BIAS 註解）：讓擊球關鍵幀落在
  // sim 的觸球那一 tick。預備段（上一區塊）會被無縫接手——setReady/receiveReady
  // 有 sustain，geoAnimator.trigger 直接延續其權重（不得再出現「兩次抬手」）。
  // 型別事前判定：舉球恆高手；接球一律低手平墊——contactPoint 的預測接觸高度 1.35m
  // 本來就低於高手門檻 1.6m。手點收斂 t=1 後接球可及球體上緣只剩 0.81H+0.105
  // （H=1.75 時 1.52m，構造上摸不到 1.6m 門檻——見 geoAnimator.contactSeqFor 的
  // C-3 死碼註解），contact-frame-probe 07-30 重測：高手接球實際觸點占比僅 2.0%
  // （07-29 舊數據 20.8% 是收斂前的量，已隨手點幾何一起緊縮，非本層改動所致）。
  // 這極少數殘留由 TOUCH 事件當場改播 overhead＝與修前完全相同的行為，不會變差
  if (game.phase === 'rally' && aiState.claimId && aiState.claimId !== s.controlledId
    && aiState.contactPoint?.ticks != null && aiState.flightId !== s.lastContactFlight
    && game.rally.touches <= 1) {
    const toContact = aiState.contactPoint.ticks - (game.tick - aiState.planTick);
    const isSet = game.rally.touches === 1;
    // 跳舉表現層（W2 核心-3）：aiState.jumpSet 是 ensureFlightPlan 本 flight 已經決定論
    // 抽選鎖存好的事實（ai.js:354-358），與 TOUCH 事件的 e.jumpSet 同一個來源——這裡
    // 直接讀現成狀態，不重算。非二傳觸窗（isSet===false）恆讀不到 true，行為不變
    const type = isSet ? (aiState.jumpSet ? 'overheadJump' : 'overhead') : 'bump';
    const lead = hitLeadTicks(type) + (isSet ? SET_CONTACT_BIAS : 0);
    const claimer = game.actors[aiState.claimId];
    const gap = Math.hypot(aiState.contactPoint.x - claimer.x, aiState.contactPoint.z - claimer.z);
    // toContact < 0＝計畫值已過期（擦網/改道後 flight 沒換、預測不再成立）：
    // 這時提前觸發等於對空氣揮擊，寧可退回 TOUCH 事件觸發
    if (toContact >= 0 && toContact <= lead && gap <= CONTACT_NEAR_MAX) {
      s.lastContactFlight = aiState.flightId;
      stage.matchView.triggerContact(aiState.claimId, type);
    }
  }
  // Phase 5 W1 §2-3 等待姿勢：攻擊手已指定（attackerId，一傳後即定案）但還沒進助跑窗
  // （§2-2 approach3/4 觸發前）——站定等二傳觸球。`attackerId !== claimId` 排除
  // 第三擊本人正忙著接/舉球或已在助跑/揮擊的窗口，一個 flight 只觸發一次；
  // 之後 approach3/4 的 trigger 會自然蓋掉這個 hold（見 update() 的 trigger 邏輯）
  if (game.phase === 'rally' && aiState.attackerId && aiState.attackerId !== s.controlledId
    && aiState.attackerId !== aiState.claimId && aiState.flightId !== s.lastWaitFlight) {
    s.lastWaitFlight = aiState.flightId;
    stage.matchView.triggerPose(aiState.attackerId, 'transitionWait');
  }
  // §4 追修（07-29）：一速／二速的起跳吃 sim 的 `route.takeoffTick`（見檔頭
  // EARLY_TAKEOFF_STALE_TICKS 註解）。sim 裡 MB 是「跑完助跑就停在起跳點」，停的
  // 那一刻就該離地——底下那組 hitPoint 倒數要等二傳觸球後才算得出來，所以中間那段
  // （起跳 tick→實際擊球 p50=36 tick）畫面上是站著＝Sawmah 看到的「停一下才跳」。
  // 助跑起手同步提前：讓 approach3/4 的末幀（交棒 windup 的那一幀）正好踩在起跳 tick。
  const early = game.phase === 'rally' ? earlyTakeoffOf(aiState) : null;
  if (early && aiState.attackerId !== s.controlledId && game.players[aiState.attackerId]) {
    const atkTeam = game.players[aiState.attackerId].teamId;
    const back = isBackRow(game.match.rotations[atkTeam], aiState.attackerId);
    const seq = back ? 'approach4' : 'approach3';
    const cue = earlyTakeoffCue(
      early.route, game.tick, seqDurTicks(seq), EARLY_TAKEOFF_STALE_TICKS,
    );
    if (cue === 'approach' && s.earlyApproachKey !== early.key) {
      s.earlyApproachKey = early.key;
      stage.matchView.triggerPose(aiState.attackerId, seq);
    } else if (cue === 'takeoff' && s.earlyTakeoffKey !== early.key) {
      s.earlyTakeoffKey = early.key;
      const attacker = game.players[aiState.attackerId];
      // 快攻族一律用猶豫起跳動作（含 B 快）——與 setOptions 的「猶豫」標同一把尺
      const hesitant = isQuickKind(aiState.attackKind)
        && attacker && effectiveTrust(game, attacker) < SET_HESITANT_BELOW;
      // ★ 2026-08-10 快攻滯空修正 ★ hangTicks＝起跳→擊球的名目 tick 數，讓跳躍弧的
      // 頂點落在擊球那一刻。一速 14+33=47（原本固定弧頂在 22.5 tick ⇒ 擊球時人已
      // 掉到 0.22m＝真人看到的「貼地打」）；二速 −40+61=21 ⇒ 低於弧的既有下限
      // ⇒ 逐值不變、零回歸。三速不走本路徑（earlyTakeoffCue 排除）。
      const hang = TEMPO[early.route.tempo]
        ? TEMPO[early.route.tempo].takeoffLead + SET_TO_HIT_TICKS[early.route.tempo]
        : null;
      stage.matchView.triggerPose(aiState.attackerId, hesitant ? 'windupHesitant' : 'windup',
        hang != null && hang > 0 ? { hangTicks: hang } : null);
    }
  }
  // Phase 5 W2 核心-2（假動作全員演出，B-2＋B-3）：aiState.approach.routes 是
  // sim 的單一真相——每一名合法攻擊手（含未被選中的誘餌）各自一條 route。
  // 被選中的攻擊手已經由上面（一/二速）或下面 hitPoint 倒數（三速）接管；這裡只補
  // 「其餘人」——攔網手要讀的正是這組線索，改制前他們在畫面上只是普通跑步，
  // 欺敵武器零演出。逐 pid 記旗標（不是單一字串）＝多人同時各自的助跑/起跳進度
  // 互不覆蓋。
  //
  // 收勢（B-3，二選一取捨）：**選「直接讓 run 姿勢自然接手」，不另組 landSoft 短序列**。
  // 原因：windup 的跳躍弧（jump 0.5、dur 45 tick）與 sim 官方的滯空收勢窗
  // （AIR_TICKS＝24 tick）長度不同——route 進 release 段那一刻，windup 自己的
  // t/dur ≈ 24/45 ≈ 0.53，jumpY＝0.5·sin(0.53π) ≈ 0.497（幾乎是跳躍弧頂峰，
  // 不是快落地）。若在這一刻強制切 landSoft（jump=0），身體會從半空瞬間落回地面
  // ——比不處理更像瞬切，是新 bug 不是修復。windup 本身在 t=dur（45 tick）時
  // jumpY 自然回到 0（sin(π)=0），且最後 0.2s（RELEASE_MS）動作權重本就淡回跑動
  // 姿勢——這與正式攻擊手 windup→spike→landSoft 走到序列尾聲的收勢曲線同一套
  // 機制（見 geoAnimator.js update() 的 RELEASE_MS 淡出，spike/block 皆共用）。
  // 讓誘餌的 windup 照自己的節奏播完，本身就是「不瞬切」的過渡，不需另外接手。
  if (game.phase === 'rally' && aiState.approach?.team) {
    const { team, setTick } = aiState.approach;
    for (const route of aiState.approach.routes) {
      const { pid } = route;
      // 攻擊手另有精準路徑（見上／下）；`claimId` 多排一道是防呆——正常情況
      // claimId===attackerId，只有 attackerId 失效走 arbitrate 補位那個罕見分支
      // 才會不同，那個人本來就會走下面 hitPoint 倒數，這裡不得重複代播。
      // 玩家自己操作的角色不由 AI 代播姿勢
      if (pid === aiState.attackerId || pid === aiState.claimId
        || pid === s.controlledId || !game.players[pid]) continue;
      const key = `${team}:${setTick}:${pid}`;
      const back = isBackRow(game.match.rotations[team], pid);
      const seq = back ? 'approach4' : 'approach3';
      const cue = decoyApproachCue(route, game.tick, seqDurTicks(seq), EARLY_TAKEOFF_STALE_TICKS);
      if (cue === 'approach' && s.decoyApproachKeys.get(pid) !== key) {
        s.decoyApproachKeys.set(pid, key);
        stage.matchView.triggerPose(pid, seq);
      } else if (cue === 'takeoff' && s.decoyTakeoffKeys.get(pid) !== key) {
        s.decoyTakeoffKeys.set(pid, key);
        stage.matchView.triggerPose(pid, 'windup');
      }
    }
  }
  // AI 攻擊手「先跳後揮」：第三擊球下墜接近攻擊手時先播起跳引臂（觸球才揮臂）
  const jumpedEarly = !!early && s.earlyTakeoffKey === early.key;
  if (game.phase === 'rally' && game.rally.touches === 2 && aiState.claimId &&
      aiState.claimId !== s.controlledId && aiState.flightId !== s.lastWindupFlight) {
    const atk = game.actors[aiState.claimId];
    const b = game.ball;
    // 07-28 追修（Sawmah 試玩：「還是會停在球下才攻擊」）：原條件＝球高<3.6m
    // 且距離<2.2m，兩者同時成立時**離擊球只剩 5-6 tick（0.08s）**——0.75s 的引臂
    // 動畫 100% 播不完（tools/attack-flow-probe.mjs 實測 n=3099），視覺上就是
    // 「站著→突然揮擊」。改用**剩餘時間**觸發：協調層算好的 hitPoint（球墜到扣球窗
    // 上緣的時空點）倒數到動畫長度時起手，助跑→引臂→起跳→揮擊才連得起來。
    // 距離仍留一道寬鬆閘（遠處的人不該提早浮空）；純表現層、零 sim diff
    const ticksToHit = aiState.hitPoint?.ticks != null
      ? aiState.hitPoint.ticks - (game.tick - aiState.planTick)
      : null;
    const near = Math.hypot(b.x - atk.x, b.z - atk.z);
    // 兩段：助跑（零跳躍）→ 起跳離地。旗標各自獨立、每 flight 一次
    // Phase 5 W1 §2-4：後排（pipe）離網最遠＝多一步，approach4／較長提前量
    const atkTeam = game.players[aiState.claimId].teamId;
    const back = isBackRow(game.match.rotations[atkTeam], aiState.claimId);
    const approachLead = back ? APPROACH_LEAD_BACK_TICKS : APPROACH_LEAD_FRONT_TICKS;
    // 已照 takeoffTick 早跳的那一球**不得再播助跑段**：approach3/4 的 jump＝0，
    // 在空中重播等於把人一幀拉回地面。windup 那一半照舊放行——它與早跳的 windup
    // 同族（geoAnimator.trigger 的空中接續會從跳躍弧頂接手），效果是「繼續滯空」，
    // 正好補上滯空比 windup 序列（0.75s）更久的那 ~5%（探針④ max 54 tick）
    if (ticksToHit !== null && ticksToHit <= approachLead && near < 4.5
      && !jumpedEarly && aiState.flightId !== s.lastApproachFlight) {
      s.lastApproachFlight = aiState.flightId;
      stage.matchView.triggerPose(aiState.claimId, back ? 'approach4' : 'approach3');
    }
    const timed = ticksToHit !== null && ticksToHit <= TAKEOFF_LEAD_TICKS;
    if (timed || (b.vy < 0 && b.y < 3.6 && near < 2.2)) {
      s.lastWindupFlight = aiState.flightId;
      // 4.5B §8 遲疑/果斷：低 trust 快攻＝抬手一半跳得矮的遲疑版（W3 S 分配的
      // 表現層遺留——「猶豫」從面板標註長到身體語言上；門檻同 setOptions 猶豫線）
      const attacker = game.players[aiState.claimId];
      // 快攻族一律用猶豫起跳動作（含 B 快）——與 setOptions 的「猶豫」標同一把尺
      const hesitant = isQuickKind(aiState.attackKind)
        && attacker && effectiveTrust(game, attacker) < SET_HESITANT_BELOW;
      stage.matchView.triggerPose(aiState.claimId, hesitant ? 'windupHesitant' : 'windup');
    }
  }
  // Phase 5 W2 核心-1 段③：**扣球擊球弧提前觸發**（三段式的最後一段，機制詳見
  // geoAnimator.js SEQUENCES 的三段式註解）。段①windup 起跳、段②spikeHold 撐住滯空
  // （滯空多久 hold 多久），這裡依 hitPoint 倒數 hitLeadTicks('spike') 起播擊球弧，
  // 讓肩→肘→腕三個解鎖幀落在**觸球之前**。改制前 spike 只在 TOUCH 事件當下才觸發、
  // 又被空中接續的 carry 推到擊球幀 ⇒ 三個解鎖幀整段沒人看過。
  // 提前量走 hitLeadTicks 單一真相（序列調時長自動跟著調）＋SPIKE_CONTACT_BIAS；
  // 旗標與上面的起跳段分開（起跳段觸發後整塊就不再進來，不能寄生在裡面）
  if (game.phase === 'rally' && game.rally.touches === 2 && aiState.claimId
    && aiState.claimId !== s.controlledId && aiState.flightId !== s.lastSwingFlight
    && game.players[aiState.claimId] && aiState.hitPoint?.ticks != null) {
    const atk = game.actors[aiState.claimId];
    const b = game.ball;
    const ticksToHit = aiState.hitPoint.ticks - (game.tick - aiState.planTick);
    const near = Math.hypot(b.x - atk.x, b.z - atk.z);
    const bias = aiState.attackKind === 'quick' ? SPIKE_CONTACT_BIAS_QUICK : 0;
    const swingLead = hitLeadTicks('spike') + bias;
    if (ticksToHit >= 0 && ticksToHit <= swingLead && near < 4.5) {
      s.lastSwingFlight = aiState.flightId;
      // 餵預估剩餘 tick：滯空不夠時擊球弧會自己壓縮（不跳幀，見 geoAnimator startSeq）
      stage.matchView.triggerContact(aiState.claimId, 'spike', ticksToHit - bias);
    }
  }
  return myBall;
}

// ════════════════════════════════════════════════════════════════
// 教學局提前收局（2026-08-12）：六步走完就收工，不用打滿 25 分
// ════════════════════════════════════════════════════════════════
// ★ 為什麼是直接把 `game.phase` 寫成 'set_over' ★
// ① 架構鐵律 1 不准動 `src/sim/`，所以不能去 sim 加一個「教學局結束條件」；
// ② `stepGame` 開頭第一行就是 `if (phase === 'set_over' || 'set_break') return []`
//    ——寫下去 sim 立刻凍結，語意與正常收局逐字相同（不是繞路，是走同一個閘）；
// ③ **不另立一個平行旗標**：`game.phase === 'set_over'` 是全專案「這場結束了」的
//    單一事實源——記分板、換人鈕、暫停鈕、beforeunload 攔阻、commentary 全都讀它。
//    另立 `s.tutorialOver` 會讓那六個地方繼續以為比賽還在進行（防線要按「危險的效果」
//    寫，不是按「我知道的那個入口」寫）。
// ★ 刻意不碰 `game.match.winner` ★ 這一局沒有分出勝負，寫一個假贏家就是說謊；
// 結算面板與 setOverOverlay 都吃教學局專屬的標題，不去讀 winner。
export function endTutorialSet(s) {
  if (s.tutorialEnded) return;
  s.tutorialEnded = true;
  s.game.phase = 'set_over';
}

// 局終/局間轉場（一次性）；生涯模式先落檔再顯示——點擊返回前進度已保住。
// export：tests/highlight-replay.test.mjs 直測「重播期間幕布不得先蓋上來」——
// 這條時序（applyEvents 設 s.replay 在前、本函式在同一幀稍後跑）讀原始碼看不出來，
// 要真的把兩者按幀序呼叫一次才驗得到
export function settleIfOver(s) {
  const { game, stage } = s;
  // ★ 批3 覆審 HIGH ★ 重播中一律讓位。局末/賽末那一分本身就會觸發即時 highlight
  // （keyPointOf 在近局點恆真＝「決勝分」與「關鍵分重扣」高度重疊，這是最常見的
  // 收尾情境不是罕見邊界），而 s.replay 是在同一幀的 applyEvents 裡設的、本函式
  // 稍後才跑 ⇒ 少這一條，setOverOverlay 的全螢幕深色蒙版（z-index:24, inset:0）
  // 會蓋在重播上面，玩家整段看不見。
  // ★ 為什麼「延後」是安全的、不會弄丟幕布 ★ 局終轉場靠 s.prevPhase 的邊緣偵測，
  // 而 prevPhase **只在本函式內部更新**（:2589/:2606/:2652 三處，初值在
  // createLoopState）。早退不更新 prevPhase＝邊緣保留著；重播結束
  // （endHighlightReplay 清掉 s.replay）後的下一幀本函式自然觸發，幕布、生涯落檔
  // 與典藏牆錄製（recordVaultRally）只是晚幾秒，一件都不會少。
  // set_break（下方 :2649 一帶）同函式一併讓位，理由與行為同理正確。
  if (s.replay) return;
  if (game.phase === 'set_over' && s.prevPhase !== 'set_over') {
    // 教學局（2026-08-12）：零獎勵、零落檔——第一屆沒有集訓格可聯動，純學操作。
    // ★ 早退在練習賽之前 ★ 走 settlePracticeMatch 會把成績寫進 `save.practice`，
    // 那個欄位的消費端是集訓面板的名額與控球格＝教學局憑空發獎勵
    if (s.tutorial) {
      s.practiceSettled = tutorialSettle(s.tutorial);
      s.stage.practiceHud?.hide();
      s.careerCtx?.store?.clearMidMatch?.(); // 同正式賽：不留「已結束比賽的假續玩入口」
      stage.setOverOverlay.show(null, game.match.score,
        game.players[s.controlledId].teamId, '點擊任意處看今天練了什麼', '🏐 練習結束——收工');
      s.prevPhase = game.phase;
      return;
    }
    // 練習賽（2026-08-12）：走另一條收束——不記戰績、不推招募、不動名冊成長。
    // ★ 早退在最前面 ★ 讓「練習賽不污染生涯」變成路徑上的事實，而不是一串 if
    if (s.careerCtx?.practice) {
      const { saveOk, settled } = settlePracticeMatch({
        careerCtx: s.careerCtx, game, playerId: s.playerId,
        drills: s.practiceDrills,
        chemistry: s.chemistryTally,
      });
      s.practiceSettled = settled;
      s.stage.practiceHud?.hide();
      if (!saveOk) stage.floatText.show('⚠ 科目成績寫入失敗（儲存空間不可用）', '#ff8a8a', 2600);
      const pWinner = game.series?.winner ?? game.match.winner;
      stage.setOverOverlay.show(pWinner, game.match.score,
        game.players[s.controlledId].teamId, '點擊任意處看科目結算');
      s.prevPhase = game.phase;
      return;
    }
    if (s.careerCtx) {
      const { saveOk } = settleCareerMatch({
        careerCtx: s.careerCtx, game, playerId: s.playerId,
        feintsUsed: s.feintsUsedThisMatch,
        lOverrides: s.lOverrideTally, // W4 Q9：L 改判記帳（box 第四欄）
        chemistry: s.chemistryTally, // 屆間養成卷 E2：默契配對次數（賽末一次寫回 Player）
      });
      if (!saveOk) stage.floatText.show('⚠ 戰績寫入失敗（儲存空間不可用）', '#ff8a8a', 2600);
      // W4(P4) Q5＋4.6 §3-2：最後一球（勝負點）落典藏牆四槽。
      // champion＝決賽勝利的冠軍點（W4 既有語意不動）；rival[屆數]＝天鷹掛點場
      // （第 1 屆決賽／第 2 屆準決賽／第 3 屆決賽，nationalLadderFor 保底）——
      // **勝敗皆錄**：幕一碾壓的敗點是三幕結構的視覺回收，只錄勝場等於把宿敵線
      // 前半段從典藏刪掉。錄製走既有 VCR 規格，不新增 sim 事件型別。
      const finaleWinner = game.series?.winner ?? game.match.winner;
      const entry = s.careerCtx.matchEntry;
      const myTeamId = game.players[s.playerId].teamId;
      if (isPlayableTape(s.vcrLast)) {
        const meta = {
          matchId: entry.id,
          seasonIndex: s.careerCtx.seasonIndex ?? 1,
          opponentId: entry.opponentId ?? null,
          label: entry.label ?? '',
          won: finaleWinner === myTeamId,
          tape: s.vcrLast,
        };
        if (entry.id === 'national-final' && meta.won) {
          s.careerCtx.store.recordVaultRally?.('champion', JSON.parse(JSON.stringify(meta)));
        }
        if (entry.opponentId === 'sky-hawk') {
          s.careerCtx.store.recordVaultRally?.(meta.seasonIndex, JSON.parse(JSON.stringify(meta)));
        }
      }
    }
    // W4(P4) Q8：多局系列＝顯示局數與系列勝方（bo1 照舊單局分數）
    const winner = game.series?.winner ?? game.match.winner;
    const score = game.series ? game.series.setsWon : game.match.score;
    stage.setOverOverlay.show(winner, score,
      game.players[s.controlledId].teamId, s.careerCtx ? '點擊任意處返回生涯' : undefined);
  }
  // W4(P4) Q8 局間（多局賽制限定）：huddle 過場——比分回顧＋教練指示＋下一局/存檔離開
  if (game.phase === 'set_break' && s.prevPhase !== 'set_break') {
    showSetBreak(s);
  }
  s.prevPhase = game.phase;
}

// W4(P4) Q8 局間 huddle：sim 凍結中（stepGame 對 set_break 短路），按鈕驅動推進。
// aiState 在局界重建＝與局間存檔續玩同構（AI 記憶為 rally 內草稿，局界重建零體感差；
// 決定論等價由 tests/match-sets 背書）
// 4.5B §7：前置 3D 圍攏過場（≤4s）→ 落回 DOM 卡片。比分/教練指示/存檔離開全留
// DOM（3D 可以吞氛圍，不得吞退出權——憲法 Q8）；牆鐘演出時鐘驅動（sim 凍結相容）；
// 恆可點擊跳過（跳過＝定格終態，與播完逐值一致）；首次全長 3.8s、之後 2s（2a 哲學）；
// 演出 off／reduced-motion＝直接卡片（資訊卡不經頻率框架、不省）
function showSetBreak(s) {
  const { game, stage } = s;
  let cardShown = false;
  const openCard = () => {
    if (cardShown) return;
    cardShown = true;
    stage.setBreakOverlay.show({
      series: game.series,
      playerTeam: game.players[s.playerId].teamId,
      onNext: () => {
        stage.setBreakOverlay.hide();
        // 收圍攏演出（定格背景到此為止）——回開賽狀態
        stage.matchView.setBreakHuddle(null);
        s.breakHuddleFPV = false;
        startNextSet(game);
        s.aiState = createAiState();
        s.recorder.reset(); // 新局重開錄影（跨局殘影不可重演）
      },
      onSaveQuit: s.careerCtx ? () => saveMidAndQuit(s) : null,
    });
  };
  const motionOff = typeof window !== 'undefined'
    && (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false);
  if (s.presentation.pref === 'off' || motionOff) { openCard(); return; }
  const full = !s.presentation.isSeen('huddle3d');
  s.presentation.markSeen('huddle3d');
  const total = full ? 3800 : 2000; // 首次全長、之後短版（≤2s）；上限 ≤4s（拍板題4）
  const team = game.players[s.playerId].teamId;
  const tl = createBeatTimeline([
    // 三人稱看全隊聚攏（權重絕對式：跳過＝1＝圍好）
    { dur: total * 0.55, apply: (t) => stage.matchView.setBreakHuddle(team, easeInOutCubic(t)) },
    // 鏡頭進圈內（既有 W8 圈內第一人稱鏡位）→ 定格，淡出交給 DOM 卡片浮上
    { dur: total * 0.45, apply: () => { s.breakHuddleFPV = true; } },
  ]);
  const driver = driveTimeline(tl, { onDone: openCard });
  const onTap = () => {
    window.removeEventListener('pointerdown', onTap);
    if (!tl.done) driver.skip();
  };
  window.addEventListener('pointerdown', onTap);
}

// W4(P4) 題5 OPP 要球 tap：①sim 登記（'call' Intent→trust 2×＋甜蜜區放寬）
// ②S 分配池 D 球權重大增（非保證——決定論 hash 抽授予；治具近似同語意）
// ③表現層：喊聲＋S 回頭；未被舉＝助跑白耗（既有體力系統，零特例）
const CALL_GRANT = 0.7; // 授予率初擬（「權重大增非保證」；治具驗）
function callHash01(n) {
  let x = Math.imul(n | 0, 2654435761);
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
// 內切回饋文案（2026-08-07 C：文案誠實化）。
// ★ 名字保留「內切」（Sawmah 裁定 2）★ 遊戲脈絡裡二傳第一屆給的就是內切，
//   交叉攻擊是第二屆才學到的組合戰術——要改的是誤導的**描述**，不是名字。
// ★ 拿掉「從快攻手背後穿出去」★ 那句描述的是 `cross`（`approach.js:75,153`，
//   助跑真的穿過快攻手起跳點後方、在他另一側起跳）；`left_inside` 的人與球全程
//   都在左半場、沒有越過二傳（`setOptions.js` 的 left_inside 正名段落）。
// key ＝ `cutOutcome` 的 reason（成功時 reason 為 null ⇒ 落到 'applied'），
// 以及 `onCutTap` 對**過期鈕**直接取用的 `cutStateOf().reason`（見該函式）。
//
// ★ 2026-08-07 MEDIUM-1 稽核：`nopool` 已刪 ★ 實測（`tools/cut-feedback-reach-probe.mjs`
//   的 observe 臂，快速比賽＋生涯各 12 局、**40,220 筆**第二觸窗內的 `cutStateOf` 觀測）
//   在窗內只出現五種狀態：OPEN 41.9%／pass 30.9%／done 20.6%／locked 5.5%／nowindow 1.1%，
//   **`nopool` 為 0**——這顆鈕的唯一觀眾是「在場的前排 OH」，而那個人恆在攻擊池裡
//   ⇒ 那一句永遠印不出來。`cutStateOf` 的 'nopool' 分支本身留著（它是 sim 的防禦性
//   回傳，有自己的單測），刪掉的只是這張表裡對應的**死文案**。
//   `missed` 不是死碼：它是下方 `??` 的預設臂（reason 為未知值時的誠實保底）。
export const CUT_FEEDBACK = {
  applied: { text: '內切——切進中路', color: '#6ee7ff' },
  already: { text: '這球本來就走內切', color: '#6ee7ff' },
  nowindow: { text: '來不及了——球已經舉出去', color: '#c8d6eb' },
  pass: { text: '一傳沒到位——這球只剩兩翼高球', color: '#c8d6eb' },
  locked: { text: 'S 已經給你排了別條線', color: '#c8d6eb' },
  missed: { text: '沒切成', color: '#c8d6eb' },
};

// ★ 2026-08-07 裁定 B：「球要給你了」兩態鈕（純 UI，sim 零改動）★
// 依據＝開窗那一刻 `aiState.attackerId` 已是已知量，與最終扣球者一致率 96.8%
// （239/247；預測「給我」時 94.4% 準，預測「不給我」時 0/104 從沒變成他）。
// 兩態刻意同一個色系＝同一顆鈕換面，不是第二顆鈕；「這球你的」態改為實心填底
// （深字亮底）＝在夜賽場景裡的可見度階梯，與 OPP `⚡跟上！` 的體感對齊。
export const CUT_BUTTON_STATES = {
  idle: { key: 'idle', label: '↘ 內切', color: '#6ee7ff', bg: 'rgba(14,34,40,0.92)' },
  mine: { key: 'mine', label: '↘ 內切・這球你的', color: '#062229', bg: '#6ee7ff', border: '#6ee7ff' },
};

// B1：玩家按下「內切」——把這一波的左翼線改成內切。
// ★ 這裡**不報成功** ★ 真正生效與否由 sim 的 `applyCutCall` 下一 tick 結算，
//   回饋在上方的 cutOutcome 分支發（`02 §6.1` 的同一條紀律：成功訊號要來自
//   成功路徑本身，不能拿「我送出了指令」當「它生效了」的證據）。
// ★ 2026-08-07 MEDIUM-1：窗已關掉才點到（鈕過期到下一個 rAF 收掉之間的那一格）
//   舊制是 `return` **靜默什麼都不做**——玩家按了一顆看得見的鈕、畫面毫無反應。
//   改成就地把 sim 給的關窗原因說出來。**仍然不寫 `cutCall`**：窗外寫進去會殘留到
//   下一波（`ensureFlightPlan` 只在「不在第二觸窗」的規劃 tick 清它），變成玩家沒要求
//   的強制內切——那是比靜默更糟的一種代勞。
export function onCutTap(s) {
  // 窗界與 sim 用**同一份判準**（不再自己寫一份 touches===1）：兩份遲早漂開。
  const st = cutStateOf(s.game, s.aiState, s.playerId);
  if (!st.open) {
    const fb = CUT_FEEDBACK[st.reason] ?? CUT_FEEDBACK.missed;
    s.stage.floatText.show(fb.text, fb.color, 1300);
    return;
  }
  s.aiState.cutCall = { pid: s.playerId, cut: true };
  s.cutFeedbackDone = false;
  s.cutOutcomeLatch = null;
}

// ★ 2026-08-07 Sawmah 裁定：OPP 的夾塞窗（比照內切主動化）★
// 文案表的 key ＝ `tandemStateOf` 吐出來的 reason，加上 `applied`（成功）與 `missed`
//（`??` 的預設臂）。
//
// ★★ 這張表被**兩條路徑**取用，兩條的 key 集合不同（覆審 MEDIUM-3 的病灶）★★
//   ① `onTandemTap`（窗已關才點到）用的是 `tandemStateOf` 的**原始 reason**
//      ⇒ 會出現 `done`
//   ② 幀端結算回饋用的是 `applyTandemCall` 記下的 outcome/reason，那支把 `done`
//      **映成** `already` ⇒ 會出現 `already`，不會出現 `done`
//   兩個 key 都印得出來，**兩個都要有文案**。原本只寫了 `already`，於是實跑 433 次
//   `done` 全部落到 `?? missed` 的「沒排成」——按下去明明本來就排了夾塞，畫面卻說失敗
//   （假陰性）。稽核測試也要分兩條路各收一份 reason 集合，不得用一張 KEY_OF 映走。
//
// ★ 只列實際印得出來的 ★ 實測 `tools/tandem-window-probe.mjs`（快速比賽＋生涯第 2 屆
// 各 12 局、253,466 筆前排 OPP 的逐 tick 取樣）在窗內只出現五種狀態：
//   OPEN 9.3%／nowindow 81.7%／tier 5.1%／locked 1.6%／partner 1.2%／done 1.0%
// **沒有出現過**（2026-08-09 前提部分失效）：~~nopool~~——前排二傳恢復 dig 懲罰後
// rally 流改變，實跑**會**出現 nopool 了（D 覆蓋率測試抓到的），文案已補在表裡。其餘照舊：
// mainKind（他的線恆為 right）、lane／depth／stagger／notCrossing（四條幾何只吃 kind，
// 對 tandem×quick 恆為真）、roll（force 之下只有 comboScale===0 擋得住，而 UI 的
// `canCallPlay` 已經先關掉整顆鈕）。這些一律**不寫文案**（死碼稽核的先例在
// `CUT_FEEDBACK` 的 nopool）。
//
// ★ `decoy` 欄（覆審 MEDIUM-4a）★ 夾塞**不改球權**，實測按下去有 73.0% 的波球不是他的
//   （159 波裡 116 波 `combo.mainId !== attackerId`；生產組態 excludeIds=[PID] 逐波量、
//   14 局 ±3.5pp。舊註解引用的「73.9%／92 波裡 68 波」是 tick 加權的污染值，勿再引用）。
//   根因＝`tandemStateOf.open` 只問幾何、**不問球權**（掃該行段 attackerId 命中 0 次），
//   而球給誰在按之前就由 pickAttackPoint 抽好了（ai.js:447）＋OPP 平均只拿兩成球權。
//   ⇒ 這是鈕的設計不是 bug；鈕面兩態準度 95%，只按「這球你的」白跑率降到 7.0%。
//   那時他跑的是「把牆帶走」的線，
//   說「貼著快攻手身後打」是假的。有 `decoy` 的 key 在球不是他的時候改用那一句；
//   沒有 `decoy` 的 key（失敗類）與球權無關，兩種情況同一句。
export const TANDEM_FEEDBACK = {
  applied: {
    text: '夾塞——貼著快攻手身後打',
    decoy: '夾塞排好了——這球不給你，你去把牆帶走',
    color: '#c792ea',
  },
  nopool: {
    // 2026-08-09 補（原判「不會出現」，前排二傳恢復 dig 懲罰後實跑出現了）：
    // 這一波攻擊池裡沒有他的右線——多半因為他自己接了一傳（D2 降級）
    text: '這一波沒有你的線——先把球接好',
    color: '#9fb0cc',
  },
  already: {
    text: '這球本來就排了夾塞',
    decoy: '這球本來就排了夾塞——球不是你的，你是拉牆的那個',
    color: '#c792ea',
  },
  // ①路徑專屬：`onTandemTap` 讀原始 reason，`done` 不會被映成 `already`
  done: {
    text: '這球本來就排了夾塞',
    decoy: '這球本來就排了夾塞——球不是你的，你是拉牆的那個',
    color: '#c792ea',
  },
  nowindow: { text: '來不及了——球已經舉出去', color: '#c8d6eb' },
  tier: { text: '一傳沒到位——這球跑不了戰術', color: '#c8d6eb' },
  locked: { text: 'S 已經排了別的組合', color: '#c8d6eb' },
  partner: { text: '快攻手不在這一波——沒人可以夾', color: '#c8d6eb' },
  missed: { text: '沒排成', color: '#c8d6eb' },
};

// 依「這球是不是他的」挑句子（沒有 decoy 欄＝兩種情況同一句）。
// 單獨抽出來的理由與 `mbCallFeedbackOf` 同一條：判定住在 UI 迴圈就沒有測試守得住。
export function tandemFeedbackText(key, mine) {
  const fb = TANDEM_FEEDBACK[key] ?? TANDEM_FEEDBACK.missed;
  return { text: (!mine && fb.decoy) ? fb.decoy : fb.text, color: fb.color };
}

// ★ 2026-08-09 B 快回饋 ★ 與夾塞的關鍵差別：**沒有 decoy 分版**。
// 夾塞要兩套文案是因為它不改球權（按了 73% 的波球不是他打的）；B 快是要球型的鈕，
// 按成功＝球一定給他 ⇒ 只有一種真相要講。**這個「少一半文案」正是設計正確的證據**，
// 不是漏寫——哪天有人替它補上 decoy 版，代表它已經被改成不改球權了，那要重新裁定。
export const BQUICK_FEEDBACK = {
  applied: { text: 'B 快——從二傳背後穿出去', color: '#ffd166' },
  already: { text: '這球本來就給你 B 快', color: '#ffd166' },
  nopool: { text: '這一波沒有你的快攻線——一傳沒到位', color: '#9fb0cc' },
  locked: { text: '二傳已經排了組合——這球有別的跑法', color: '#9fb0cc' },
  playsOff: { text: '還沒學會叫戰術', color: '#9fb0cc' },
  nowindow: { text: '來不及了——球已經舉出去', color: '#9fb0cc' },
  missed: { text: '沒趕上', color: '#9fb0cc' },
};

export function bquickFeedbackText(key) {
  const fb = BQUICK_FEEDBACK[key] ?? BQUICK_FEEDBACK.missed;
  return { text: fb.text, color: fb.color };
}

// 單態鈕（不像內切／夾塞需要兩態）——理由同上：要球型的鈕沒有「這球給不給你」的懸念。
export function onBquickTap(s) {
  const st = bquickStateOf(s.game, s.aiState, s.playerId);
  if (!st.open) {
    // ★ 吃**原始 reason** ★（不經 applyBquickCall 的 done→already 映射），同 onTandemTap
    const fb = bquickFeedbackText(st.reason);
    s.stage.floatText.show(fb.text, fb.color, 1300);
    return;
  }
  s.aiState.bquickCall = { pid: s.playerId };
  s.bquickFeedbackDone = false;
  s.bquickOutcomeLatch = null;
}

// 逐 sim tick 取樣（理由同 captureTandemOutcome：outcome 的壽命短於一個 rAF）
export function captureBquickOutcome(s) {
  const oc = s.aiState?.bquickOutcome;
  if (!oc || oc.pid !== s.playerId || s.bquickFeedbackDone) return;
  if (s.bquickOutcomeLatch?.flightId === oc.flightId) return;
  s.bquickOutcomeLatch = { ...oc };
}

// 兩態鈕（比照 `CUT_BUTTON_STATES`）：夾塞**不改球權**，所以「這球給不給你」要另外說。
// 資料源同樣是開窗當下已定案的 `aiState.attackerId`。
export const TANDEM_BUTTON_STATES = {
  idle: { key: 'idle', label: '🤝 夾塞', color: '#c792ea', bg: 'rgba(30,18,44,0.92)' },
  mine: { key: 'mine', label: '🤝 夾塞・這球你的', color: '#1c0f28', bg: '#c792ea', border: '#c792ea' },
};

// 玩家按下「夾塞」——把這一波排成「OPP 貼在 MB 快攻身後」的兩人組合。
// 紀律逐項同 `onCutTap`：①這裡不報成功（成敗由 sim 的 `applyTandemCall` 下一 tick 結算）
// ②窗已關才點到＝就地把 sim 給的關窗原因說出來，不靜默 ③窗外絕不寫 `tandemCall`
//（窗外寫進去會殘留到下一波＝玩家沒要求的強制夾塞）。
export function onTandemTap(s) {
  const st = tandemStateOf(s.game, s.aiState, s.playerId);
  if (!st.open) {
    // ★ 這裡吃的是**原始 reason**（不經 applyTandemCall 的 done→already 映射）★
    const fb = tandemFeedbackText(st.reason, s.aiState.attackerId === s.playerId);
    s.stage.floatText.show(fb.text, fb.color, 1300);
    return;
  }
  s.aiState.tandemCall = { pid: s.playerId };
  s.tandemFeedbackDone = false;
  s.tandemOutcomeLatch = null;
}

// 職業章批 4b（改叫 B2）：非 S 位置點下「📢 改叫」——開一個小面板選交叉／時間差／
// B快（選項集合同 S 的⚡面板）。★ 重新問一次 `audibleStateOf` ★（不吃呼叫端傳來的
// 快照）：範式同 `onCutTap`/`onTandemTap`/`onBquickTap`——鈕從「可見」到「被點到」
// 之間可能跨了好幾個 sim tick，用點下當下的真狀態，不用鈕第一次浮現時的舊快照
// （否則面板可能列出這一刻其實已經湊不出來的選項）。窗已經關了就地說原因，不靜默
//（同三顆先例的紀律）。選定後**直接寫 `aiState.replanCall`**——與 S 的⚡面板同一條
// 指令通道（`ai.js applyReplanCall`），零新 sim 路徑。
export function onAudibleTap(s) {
  const ast = audibleStateOf(s.game, s.aiState, s.playerId);
  if (!ast.open) {
    s.stage.floatText?.show('這球湊不出可以下的指令', '#c8d6eb', 1300);
    return;
  }
  s.audibleMenuOpen = true;
  const items = ast.types.map((type) => ({
    key: `audible-${type}`,
    label: `${CALL_MODES.audible.icon}${CALL_LABELS[type] ?? type}`,
    color: 'neutral',
    callType: type,
  }));
  s.stage.audiblePanel?.show('改叫——下指令！', items, (it) => {
    s.audibleMenuOpen = false;
    s.aiState.replanCall = { type: it.callType, callerId: s.playerId };
    // 教學可見性批：記下這一波是改叫（syncCallFeedback 憑它把字卡換成「📢改叫」）。
    // applyReplanCall 在二傳觸球前消費 ⇒ outcome.flightId 與此刻同值（touch 才 +1）
    s.audibleIssuedFlight = s.game.rally?.flightId ?? null;
  });
}

function onCallTap(s) {
  const { game, stage } = s;
  if (game.phase !== 'rally' || game.rally.touches !== 1) return; // 窗已過（防競態）
  const me = game.players[s.playerId];
  s.pendingCallIntent = true;
  s.callLive = true; // 4.5B §3：喊聲已出——這球我方出手得手＝「三米線起飛」兌現
  const granted = callHash01(game.rally.flightId * 613 + (game.seed ?? 0) * 17 + 9) < CALL_GRANT;
  if (granted) {
    s.aiState.attackerId = s.playerId;
    s.aiState.attackKind = 'dball';
  }
  stage.floatText.show(`${me.name}：「我來！」`, '#ffd166', 1300);
  const setter = Object.values(game.players)
    .find((p) => p.teamId === me.teamId && p.currentRole === 'setter'
      && game.match.rotations[me.teamId].includes(p.id));
  if (setter) {
    setTimeout(() => stage.floatText.show(`${setter.name}回頭看了你一眼`, '#9fb0cc', 1100), 380);
  }
}

// W4 B-3 封線影子首次教學（07-27 試玩回饋）：第一次下配套講清楚地板色語——每場一次
function showShadowHintOnce(s) {
  if (s.shadowHintShown) return;
  s.shadowHintShown = true;
  s.stage.floatText.show('地板佈陣：紅帶＝攔網封住的線・綠帶＝留給你接的線', '#ffb454', 3200);
}

// W4(P4) Q9 單場結算頁資料（顯示時刻即時由事件流建——與 settle 落檔同一組純函式）
function buildBoxPanelData(s) {
  const { game } = s;
  const me = game.players[s.playerId];
  const myTeam = me.teamId;
  const rows = Object.values(buildTeamBox(game.events, game.players, myTeam));
  const series = game.series;
  const won = (series?.winner ?? game.match.winner) === myTeam;
  const scoreLine = series
    ? `局數 ${series.setsWon.A} : ${series.setsWon.B}（${series.setScores.map((sc) => `${sc.A}:${sc.B}`).join('、')}）`
    : `${game.match.score.A} : ${game.match.score.B}`;
  const oppAce = s.careerCtx
    ? resolveOppAceBox(game, s.careerCtx, myTeam === 'A' ? 'B' : 'A')
    : null;
  // 位置差異欄位（Q9 四位置全數上線）：玩家現任位置的專屬行
  const extras = [];
  const myRow = rows.find((r) => r.pid === s.playerId);
  if (me.currentRole === 'setter' && myRow) {
    extras.push(`🏐 S 分配：舉球 ${myRow.sets}・二次球 ${myRow.dumps}${myRow.dumps ? `（得手 ${myRow.dumpKills}）` : ''}`);
  } else if (me.currentRole === 'libero') {
    const lb = boxScoreLFor(game.events, s.playerId);
    const ov = s.lOverrideTally;
    const ovText = ov.n ? `${ov.ok}/${ov.n}（${Math.round((ov.ok / ov.n) * 100)}%）` : '—';
    extras.push(`🛡 L 四欄：起球 ${lb.digs}・助攻一傳 ${lb.assistDigs}・續命 ${lb.rallySaves}・改判成功 ${ovText}`);
  } else if (me.currentRole === 'middle' && myRow) {
    extras.push(`🧱 MB 攔網歸因：攔網得分 ${myRow.blocks}`);
  } else if (me.currentRole === 'opposite' && myRow) {
    // ★ 2026-08-04 補漏（稽核 08-03 A-UI-2，HIGH）★ 這裡原本只有 S／L／MB 三支，
    // 但同段註解寫著「Q9 四位置全數上線」、`positionFlags.js` 也把 OPP 列為
    // `ENGINEERED_OPEN` 四位置之一 ⇒ **玩家轉任 OPP 打完整場，永遠看不到任何專屬數據**。
    // 欄位選擇對齊 OPP 的職責（對角＝主要火力點＋右翼攔網），與 MB 只報攔網、
    // S 只報分配同一個原則：報這個位置**被期待做的事**，不重複所有人都有的通用欄。
    const rate = myRow.spikes ? Math.round((myRow.kills / myRow.spikes) * 100) : null;
    extras.push(`⚡ OPP 火力：扣球 ${myRow.spikes}・得分 ${myRow.kills}`
      + `${rate == null ? '' : `（${rate}%）`}・攔網 ${myRow.blocks}`);
  }
  // 教學局結算面板（2026-08-12）：**簡化版**——六步的結果＋教練一句評語，沒有獎勵行。
  // ★ 位置差異欄位／對手王牌一律不掛 ★ 這是他這輩子第一場球，那些數字他還讀不懂
  if (s.tutorial) {
    const settled = s.practiceSettled ?? tutorialSettle(s.tutorial);
    const lines = settled.results.map((r) => `${r.achieved ? '✅' : '⏭'} ${r.label}`);
    lines.push(`📋 完成 ${settled.completedCount}/${settled.total}　${tutorialVerdictLine(settled)}`);
    return {
      title: '🏐 入隊測試',
      scoreLine,
      rows,
      playerPid: s.playerId,
      oppAce: null,
      extras: lines,
    };
  }
  // 練習賽結算面板（2026-08-12）：科目達成清單＋獎勵說明接在位置差異欄位後面。
  // ★ 重用 boxScorePanel 的 extras 通道，不另做一個面板 ★ 玩家要看的資訊
  // （全隊數據＋我這場做到什麼）是同一批，另開一頁只會讓他點兩次。
  if (s.careerCtx?.practice) {
    const settled = s.practiceSettled
      ?? settlePractice({
        events: game.events, playerId: s.playerId, myTeam, drills: s.practiceDrills,
      });
    for (const r of settled.results) {
      extras.push(`${r.achieved ? '✅' : '❌'} ${r.label}　${r.count}/${r.target}`);
    }
    extras.push(practiceRewardLine(settled));
    return {
      // 勝負仍照實寫（那是比賽），但主標點明這是紅白賽——不記戰績的事寫在獎勵行
      title: `🏐 紅白對抗賽・${won ? '紅隊勝' : '白隊勝'}`,
      scoreLine,
      rows,
      playerPid: s.playerId,
      oppAce: null, // 白隊沒有 opponents.js 的王牌
      extras,
    };
  }
  return {
    title: won ? '🏆 勝利' : '敗北',
    scoreLine,
    rows,
    playerPid: s.playerId,
    oppAce,
    extras,
  };
}

// 練習賽獎勵說明（kickoff 題 3 甲的三段階梯；文案與 `career/trainingCamp.js` 的
// `campAttrPicks`／`CAMP_CONTROL_UNLOCKED` 同源——那兩支才是判定，這裡只是把它講出來）
export function practiceRewardLine(settled) {
  const done = settled?.completedCount ?? 0;
  const total = settled?.results?.length ?? 0;
  const head = `📋 科目 ${done}/${total}`;
  if (settled?.unlockControl) {
    return `${head}　全數完成 ⇒ 集訓「控球」格開放，屬性特訓可挑兩項（本場不記戰績）`;
  }
  if (done >= 2) {
    return `${head}　完成 2 項以上 ⇒ 集訓的屬性特訓可挑兩項（本場不記戰績）`;
  }
  return `${head}　完成 2 項可多挑一項屬性特訓、全完成再開控球格（本場不記戰績）`;
}

// W4(P4) Q10 燈光秀收場（自然結束或點擊跳過共用）：恢復常態燈光/鏡頭、補播情蒐帶
function endOpeningShow(s) {
  s.openingShow = null;
  s.ctx.lights.stopOpeningShow();
  s.stage.rig.setTourProgress(null);
  if (s.config.tapeClips.length && !s.openingTapeStarted) {
    s.openingTapeStarted = true;
    startTapeClip(s);
  }
}

// 生涯層專屬欄位不進 sim 快照（2026-08-09 覆審 LOW-1）。
// 病灶：`careerTeams` 直接把生涯主角**那個物件**塞進 teams.A（careerState.js:403），
// 於是 `game.players.A2` 就是 careerPlayer 本人 ⇒ 整包被 dump 快照進局間存檔
// （實測 role=outside／libero／setter 三種都會）。sim 從不讀這些欄位（`grep chemistry
// src/sim` 零命中），但快照留的是**寫檔當下的舊值**——日後有人去讀就拿到過期資料。
// 在 dump 上剔除（不是在建 sim player 時）：dump 已經是 JSON 深拷貝，動它對 sim
// 判定路徑零影響（do-not-touch 7：一個位元組不改）。
const CAREER_ONLY_PLAYER_FIELDS = ['chemistry', 'campPending'];
export function stripCareerFieldsFromDump(dump) {
  for (const p of Object.values(dump?.players ?? {})) {
    for (const k of CAREER_ONLY_PLAYER_FIELDS) delete p[k];
  }
  return dump;
}

// 局間存檔離開（Q8 必配）：整包 sim state JSON 快照落槽位 mid key → 返回生涯。
// 續玩＝runMatch 以快照為 game 直接開機（phase 仍為 set_break＝「從局間 huddle 前恢復」）
function saveMidAndQuit(s) {
  const ok = s.careerCtx.store.saveMidMatch?.({
    matchId: s.careerCtx.matchEntry.id,
    savedAtSet: s.game.series.setIndex,
    feintsUsed: s.feintsUsedThisMatch,
    lOverrides: { ...s.lOverrideTally }, // W4 Q9：改判 tally 隨局間存檔續玩接回
    chemistry: { ...s.chemistryTally }, // 屆間養成卷 E2：默契 tally 同上（同一範式）
    game: stripCareerFieldsFromDump(JSON.parse(JSON.stringify(s.game))),
  });
  if (!ok) {
    s.stage.floatText.show('⚠ 局間存檔失敗（儲存空間不可用）', '#ff8a8a', 2600);
    return;
  }
  window.location.assign(careerReturnUrl(
    s.ctx.params, window.location.pathname, s.careerCtx.store?.activeSlot?.() ?? null,
  ));
}

// 魚躍手動觸發可用性（07-24 拍板：常駐鈕移除、撲救交自動判斷 matchControls）：
// diveReady 只服務桌機 L/Space 隱藏手動——rally 中、未倒地、非回放即可按（提前撲的主動權）
function updateDiveReady(s) {
  if (!s.gates.canDive) return;
  // W7 C2：受控者不在場上（板凳教練視角）——沒有身體可撲
  if (!onCourt(s.game, s.controlledId)) { s.diveReady = false; return; }
  const meActor = s.game.actors[s.controlledId];
  s.diveReady = s.game.phase === 'rally' && !s.replay && s.game.tick >= meActor.divedUntil;
}

// 每幀主流程：時間膨脹 → 固定步長模擬 → 事件應用 → 表現層同步 → 渲染
function frameStep(s, now) {
  requestAnimationFrame(s.rafFn);
  const { ctx, stage } = s;
  let delta = (now - s.last) / 1000;
  s.last = now;
  if (delta > MAX_FRAME_DELTA) delta = MAX_FRAME_DELTA;
  if (delta < 0) delta = 0;

  if (s.replay) {
    // ★ 2026-08-07 MEDIUM-3：回放期間內切鈕必須先收 ★ 下面兩個內切區塊都排在這個
    //   early-return 之後 ⇒ 窗內按 🎬（matchStage.js:312，全程常駐、無窗界）之後
    //   sim 凍結、浮鈕留在畫面上而且 handler 仍然活著，玩家想看多久都行再回來按。
    //   `hide()` 同時把 onTap 設回 null（callButton.js），所以連「按得到」都一併收掉。
    if (stage.cutButton?.isVisible()) stage.cutButton.hide();
    if (stage.tandemButton?.isVisible()) stage.tandemButton.hide(); // 夾塞鈕同理
    if (stage.bquickButton?.isVisible()) stage.bquickButton.hide(); // B 快鈕同理
    if (stage.audibleButton?.isVisible()) stage.audibleButton.hide(); // 改叫鈕同理
    stage.audiblePanel?.hide(); // 子選單同樣不得留在回放期間的畫面上
    // ★ 08-07 補：字卡鎖存不因進入回放而作廢 ★ pending／latch 若在 stepSim 鎖存後、
    // 同幀還沒播出時玩家按了 🎬，回放期間下面兩個消費區塊（:2381/:2395 一帶）整段被
    // 這個 early-return 跳過，鎖存會存活到回放結束才補跳一張已經過時好幾秒的字卡。
    // 進回放即作廢——玩家已經在看重播了，那張字卡描述的時刻已經過去。
    // `cutOutcomeLatch` 是同型的既有缺陷（不是本批引入），一併處理，不留第二個同型坑。
    s.tandemAssignPending = false;
    s.tandemOutcomeLatch = null;
    s.cutOutcomeLatch = null;
    s.comboCreditLatch = null; // 誘餌獎金字卡同型同壽命——進回放即作廢，理由同上兩行
    runReplayFrame(s, now, delta);
    return;
  }

  // W4(P4) Q10 冠軍館燈光秀：暗場→逐盞亮（lights）＋巡場（rig 'tour'）；
  // sim 凍結（delta=0）、結束或點擊跳過後才進情蒐帶/發球
  if (s.openingShow) {
    if (s.openingShow === 'pending') {
      s.openingShow = 'running';
      ctx.lights.startOpeningShow(now);
    }
    const showP = ctx.lights.updateOpeningShow(now);
    if (showP === null) endOpeningShow(s);
    else {
      stage.rig.setTourProgress(showP);
      delta = 0;
    }
  }

  const game = s.game;
  // W7 C2：主角在板凳（教練視角）——本幀一次判定，餵給凍結/加速/鏡頭/UI 同步共用
  const benched = !onCourt(game, s.playerId);
  const wasBenchedPrev = s.wasBenched;
  s.wasBenched = benched;
  if (benched && !wasBenchedPrev) stage.subPanel?.openPanel(); // C2②：被換下的當下自動開板一次
  if (!benched && wasBenchedPrev) stage.benchAccelBtn?.forceOff(); // 回場強制回 1× 並收鈕（sync 會隱藏）

  // W7.1 #3A：暫停死球窗結束（發球一發生＝離開 'serve' 相位）——集合帶位/倒數條/教練
  // 選項對話框全部收掉；不選也作廢（sim armed 旗標下個死球窗自動收，這裡只管表現層）
  if (game.phase !== 'serve') {
    if (s.timeoutHuddleTeam) s.timeoutHuddleTeam = null;
    if (stage.coachOptionDialog?.isOpen()) stage.coachOptionDialog.hide();
  }
  stage.matchView.setTimeoutHuddle(game.phase === 'serve' ? s.timeoutHuddleTeam : null);
  stage.timeoutCountdown?.update(
    s.timeoutHuddleTeam && game.phase === 'serve' ? Math.max(0, game.serveReadyTick - game.tick) : null,
    TUNING.TIMEOUT_DEAD_TICKS,
  );

  // W6 換人面板開啟＝凍結模擬（畫面照跑；死球窗 tick 不流逝，慢慢讀數據慢慢換）；
  // W7 C2②：主角在板凳時面板＝教練儀表板，不凍結（在場時維持原凍結行為）
  if (stage.subPanel?.isOpen() && !benched) delta = 0;
  // W7.1 三輪（試玩回饋：對話沒看完球就開了）：教學/敘事對話開著＝凍結模擬，
  // 點完最後一句才恢復。教練選項對話框刻意不凍（倒數是 sim tick 驅動、有提早開賽鈕）
  if (stage.teachDialog?.isOpen?.()) delta = 0;

  // W3(P4) L 魚躍鏡頭（時間窗驅動）＋A3③ 替換即儀式（換入場輕演出）
  stage.rig.setDiveCam(now < (s.diveCamUntil ?? 0));
  // 4.5B §3：招牌演出鏡位窗（勝負已定後的死球窗；到期/SERVE 即收）
  if (s.sigBeat && now >= s.sigBeat.until) s.sigBeat = null;
  stage.rig.setSigBeat(s.sigBeat);
  const meNow = game.players[s.controlledId];
  if (meNow?.currentRole === 'libero') {
    const onNow = onCourt(game, s.controlledId);
    if (onNow && s.lWasOnCourt === false) {
      stage.floatText.show(`🔄 異色球衣——${meNow.name} 進場`, '#6ee7ff', 1400);
      stage.sfx.cheer?.(0.5);
    }
    s.lWasOnCourt = onNow;
  }

  // W4 題5：要球浮鈕窗管理（0.8s 過期／球已進第二擊／死球＝收）
  if (stage.callButton?.isVisible()
    && (now > s.callWindowUntil || game.phase !== 'rally' || game.rally.touches !== 1)) {
    stage.callButton.hide();
  }
  // ★ 內切浮鈕窗（2026-08-07 重做）★ 顯示與否**逐 frame 問 sim**（`cutStateOf`），
  // 不再自己記時間：那個 800ms 計時器與 sim 真正的死線差了 47 倍，是本次 bug 的形狀。
  // 條件裡的位置檢查（前排 OH、在場）留在 UI 層——sim 不管「這顆鈕給誰看」。
  // `!s.aiState.cutCall`＝按過就不再跳（sim 要到下一 tick 才把線改掉，少這一條會閃一格）。
  // ★ 2026-08-07 裁定 3（Sawmah 拍板「資格統一到第二屆」）：內切也吃 `canCallPlay` ★
  // ⚠ **登記在案的耦合**（覆審 LOW-6，本行刻意不改，只留痕）⚠
  //   `canCallPlay = 技術閘 ∧ (game.comboScale > 0)`（matchConfig.js:183），而內切走的是
  //   `CROSS_RATE`／`forcedCut`（approach.js:413-421），與 `comboScale` **毫無關係**。
  //   現況無害：兩道閘恆同時開關（第 2 屆同時給技術與 comboScale）。
  //   風險：日後若出現「教過但 comboScale=0」的賽制（練習賽／集訓對打），OH 會**靜默**
  //   失去內切——沒有任何錯誤訊息，只是鈕不見了。真的做出那種賽制時，這一行要拆成
  //   「技術閘」與「世界閘」兩個布林（夾塞留 canCallPlay、內切只吃技術閘）。
  if (stage.cutButton && !s.replay) {
    const meNow = game.players[s.playerId];
    const cutOpen = !!meNow && meNow.currentRole === 'outside'
      && s.gates.canCallPlay
      && onCourt(game, s.playerId)
      && isFrontRow(game.match.rotations[meNow.teamId], s.playerId)
      && !s.aiState.cutCall
      && cutStateOf(game, s.aiState, s.playerId).open;
    if (cutOpen && !stage.cutButton.isVisible()) stage.cutButton.show(() => onCutTap(s));
    else if (!cutOpen && stage.cutButton.isVisible()) stage.cutButton.hide();
    // ★ 裁定 B：兩態 ★ 逐 frame 問一次（`setVariant` 自帶冪等閘，同態不碰 DOM）。
    // `attackerId` 在開窗那一刻就已定案，與最終扣球者一致率 96.8%——這顆鈕因此
    // 能誠實地說「這球給你」，而不是等球舉出來才知道。
    if (cutOpen) {
      stage.cutButton.setVariant(s.aiState.attackerId === s.playerId
        ? CUT_BUTTON_STATES.mine : CUT_BUTTON_STATES.idle);
    }
  }
  // ★ 夾塞浮鈕窗（2026-08-07）★ 形狀逐項比照上面的內切窗：逐 frame 問 sim
  // （`tandemStateOf`），不自己記時間。位置檢查（前排 OPP、在場）留在 UI 層。
  // ★ `s.gates.canCallPlay` 這道技術閘 ★ 語意是兩件事共用一個布林（matchConfig.js:183）：
  //   ①這個球員學會叫戰術了沒（技術傳授事件 `teach-call`，第 2 屆 group-1 賽前）
  //   ②這場比賽有沒有組合攻擊（`game.comboScale`，第 2 屆起才 > 0）
  //   兩顆鈕（內切／夾塞）**同吃這一道**——Sawmah 裁定「資格統一到第二屆」。
  if (stage.tandemButton && !s.replay) {
    const meNow = game.players[s.playerId];
    const tandemOpen = !!meNow && meNow.currentRole === 'opposite'
      && s.gates.canCallPlay
      && onCourt(game, s.playerId)
      && isFrontRow(game.match.rotations[meNow.teamId], s.playerId)
      && !s.aiState.tandemCall
      && tandemStateOf(game, s.aiState, s.playerId).open;
    if (tandemOpen && !stage.tandemButton.isVisible()) {
      stage.tandemButton.show(() => onTandemTap(s));
    } else if (!tandemOpen && stage.tandemButton.isVisible()) stage.tandemButton.hide();
    // 夾塞不改球權（`⚡ 跟上！` 才是球權鈕）⇒ 「這球給不給你」得另外說
    if (tandemOpen) {
      stage.tandemButton.setVariant(s.aiState.attackerId === s.playerId
        ? TANDEM_BUTTON_STATES.mine : TANDEM_BUTTON_STATES.idle);
    }
  }
  // ★ 2026-08-09 B 快窗（MB）★ 資格與另外兩顆同吃 `s.gates.canCallPlay`（裁定「資格
  // 統一到第二屆」）。**刻意不加 isFrontRow**：`bquickStateOf` 已經用「這一波有沒有
  // 你的 quick 線」把後排與一傳不到位一起吃掉了，在這裡再補一道等於第二份真相，
  // 而且會誤縮窗（藍圖明文警告過這個抄錯點）。
  if (stage.bquickButton && !s.replay) {
    const meNow = game.players[s.playerId];
    const bquickOpen = !!meNow && meNow.currentRole === 'middle'
      && s.gates.canCallPlay
      && onCourt(game, s.playerId)
      && !s.aiState.bquickCall
      && bquickStateOf(game, s.aiState, s.playerId).open;
    if (bquickOpen && !stage.bquickButton.isVisible()) {
      stage.bquickButton.show(() => onBquickTap(s));
    } else if (!bquickOpen && stage.bquickButton.isVisible()) stage.bquickButton.hide();
  }
  // ════════════════════════════════════════════════════════════════
  // 職業章批 4b（改叫 B2）：非 S 位置的組合指令鈕——與另外三顆同一套逐 frame 問 sim
  // 的範式，差別只有：①吃自己的技術閘 `canAudible`（不是 `canCallPlay`——那把管既有
  // 三入口，見 matchConfig.js 的裁定）②排除 S 本人（S 走自己的⚡面板，這不是第二
  // 入口）③窗開的定義來自 `audibleStateOf`（team-scoped 的 `callFeasibilityOf`
  // 包了一層角色與隊伍歸屬檢查，理由見該函式檔頭）。
  // 沒有兩態（`CUT_BUTTON_STATES`/`TANDEM_BUTTON_STATES` 那種）：這顆鈕點下去不是
  // 「這球給不給你」，是「這球要不要下指令」，鈕面恆為同一個字——同 `bquickButton`
  // 沒有兩態的理由同款（要球/下令型鈕，不是改線型）。
  if (stage.audibleButton && !s.replay) {
    const meNow = game.players[s.playerId];
    const baseEligible = !!meNow && meNow.currentRole !== 'setter'
      && s.gates.canAudible && onCourt(game, s.playerId);
    const ast = baseEligible ? audibleStateOf(game, s.aiState, s.playerId) : { open: false, types: [] };
    // 窗真的關了，選單卻還開著（玩家還沒選）——sim 這一刻再選也不會生效，
    // 及時把選單收掉，不讓他對著一扇已經關上的窗做選擇
    if (!ast.open && s.audibleMenuOpen) {
      s.audibleMenuOpen = false;
      stage.audiblePanel?.hide();
    }
    // 選單開著／已有一筆指令待消費時不重複跳鈕（同 `!s.aiState.cutCall` 的防雙擊範式）
    const showTrigger = ast.open && !s.aiState.replanCall && !s.audibleMenuOpen;
    if (showTrigger && !stage.audibleButton.isVisible()) {
      stage.audibleButton.show(() => onAudibleTap(s));
    } else if (!showTrigger && stage.audibleButton.isVisible()) {
      stage.audibleButton.hide();
    }
  }
  // B 快結算回饋（讀鎖存，理由同夾塞／內切那兩段）
  const bquickOc = s.bquickOutcomeLatch;
  if (bquickOc && bquickOc.pid === s.playerId && !s.bquickFeedbackDone) {
    s.bquickFeedbackDone = true;
    s.bquickOutcomeLatch = null;
    const key = bquickOc.outcome === 'applied'
      ? (bquickOc.reason ?? 'applied') : (bquickOc.reason ?? 'missed');
    const fb = bquickFeedbackText(key);
    s.stage.floatText.show(fb.text, fb.color, 1300);
  }
  // 夾塞結算回饋（讀鎖存，理由同下方內切那一段）
  const tandemOc = s.tandemOutcomeLatch;
  if (tandemOc && tandemOc.pid === s.playerId && !s.tandemFeedbackDone) {
    s.tandemFeedbackDone = true;
    s.tandemOutcomeLatch = null;
    const key = tandemOc.outcome === 'applied'
      ? (tandemOc.reason ?? 'applied') : (tandemOc.reason ?? 'missed');
    // MEDIUM-4(a)：`mine` 是**結算當下**鎖存的，不是這一幀重問的（見 captureTandemOutcome）
    const fb = tandemFeedbackText(key, tandemOc.mine);
    stage.floatText.show(fb.text, fb.color, 1300);
  }
  // ★ 裁定 2：被排進夾塞的人才看得到的字卡 ★ 三種來源（自己叫／S 叫／自動骰）共用
  // 這一個出口（取樣在 `captureTandemAssign`）。自己按出來的那一波會與上面的結算回饋
  // 同框——那是刻意的：一句講「你按的生效了」、一句講「這球是夾塞」，floatText 自帶疊排。
  // MEDIUM-4(a)：74% 的波球不是他的 ⇒ 那時講的是「拉牆」，不是「打」。
  if (s.tandemAssignPending) {
    const mine = s.tandemAssignPending === 'mine';
    s.tandemAssignPending = false;
    stage.floatText.show(
      mine
        ? `🤝 這球是${KIND_LABELS.tandem}——貼著快攻手身後打`
        : `🤝 這球是${KIND_LABELS.tandem}——球不給你，你去把牆帶走`,
      '#c792ea', 1300,
    );
  }
  // ★ 2026-08-08 誘餌獎金入帳字卡 ★ 讀鎖存（理由同上——`captureComboAssistCredit` 已經
  // 在 sim tick 端把「這球我真的入帳了」鎖住）。不出數字：信任是隱藏數值，講出 +1
  // 反而顯得薄；文案風格對齊 `TANDEM_FEEDBACK`。幅度／入帳三條件一律沒動，這裡純顯示。
  if (s.comboCreditLatch) {
    s.comboCreditLatch = null;
    stage.floatText.show('🧱 牆被你帶走了——二傳記住了', '#c792ea', 1300);
  }
  // 內切結算回饋（C：文案誠實化）——**成敗由 sim 說了算**，不是按下去就報成功。
  // 舊制 `onCutTap` 無條件跳「切中路——從快攻手背後穿出去」：①那句描述的是交叉
  // （`cross`，S 叫的組合戰術），與內切不是同一條線，真人因此誤解；②約 30% 的波
  // 一傳非 perfect、按了必然無效，照樣報成功＝假陽性回饋。
  // MEDIUM-2：讀**鎖存**而不是 sim 的即時值——後者的壽命短於一個 rAF（見 stepSim）。
  const cutOc = s.cutOutcomeLatch;
  if (cutOc && cutOc.pid === s.playerId && !s.cutFeedbackDone) {
    s.cutFeedbackDone = true;
    s.cutOutcomeLatch = null;
    const fb = CUT_FEEDBACK[cutOc.outcome === 'applied' ? (cutOc.reason ?? 'applied') : (cutOc.reason ?? 'missed')]
      ?? CUT_FEEDBACK.missed;
    stage.floatText.show(fb.text, fb.color, 1300);
  }

  // W4 附錄 B-4：ace 反讀注入（宿敵 ace＝本波攻擊手且玩家配套史被讀死——
  // scoutTally 鏡像決定論統計；counterArmedFlight＝字卡揭曉旗）
  if (s.rivalAcePid && game.phase === 'rally' && game.rally.possession === 'B'
    && s.aiState.attackerId === s.rivalAcePid) {
    const counter = counterReadOf(s.schemeTally);
    s.aiState.counterRead = counter
      ? { pid: s.rivalAcePid, openLine: counter.openLine }
      : null;
    if (counter) s.counterArmedFlight = game.rally.flightId;
  } else if (s.aiState.counterRead) {
    s.aiState.counterRead = null;
  }

  // 簡化模式：進攻決策——輪到玩家扣球且球還在空中→彈面板、時間放慢給你讀攔網選區
  const deciding = updateDecisions(s, now);

  // 擊球定格（hit-stop）：短暫凍結模擬推進、畫面照跑——打擊的「頓」感
  if (now < s.hitStopUntil) delta = 0;
  // 進攻/防守決策窗＝放慢（時間膨脹只作用推進率，決定論不碰）；
  // W3：updateDecisions 回傳放慢倍率（0.4＝攻防/分配/讀舉球、0.6＝L 防守指揮——
  // 附錄 A2：比 OH 攻擊 0.4× 短）
  else if (deciding) { delta *= deciding; s.slowEaseFrom = now; }
  // 決策窗結束的緩出：0.35s 內 0.4→1.0 漸變——瞬間回速會讓攔網/出手看起來慢半拍
  else if (now - s.slowEaseFrom < 350) delta *= 0.4 + 0.6 * ((now - s.slowEaseFrom) / 350);
  // 重扣慢動作：定格後 0.4 秒半速
  else if (now < s.slowUntil) delta *= 0.35;
  // W7 C2③：板凳期間 2× 加速（開啟時才乘）——每個 DEAD_BALL 自動回 1×（見 applyEvents）
  if (benched && stage.benchAccelBtn?.isOn()) delta *= 2;

  s.accumulator += delta;
  const { frameEvents, simSteps } = stepSim(s);
  if (frameEvents.length > 0) applyEvents(s, frameEvents, now);

  const myBall = updateAssistAndPoses(s);

  const alpha = s.accumulator / SIM_DT;
  // 丙3（NJ-4）：完美接球發光——0..1 強度，從 ballGlowUntil 時窗算，餵給 ballView
  // 純畫（同 hitStopUntil/slowUntil 的「matchLoop 管時間、view 只管畫」範式）
  const ballGlow = Math.max(0, Math.min(1, (s.ballGlowUntil - now) / PERFECT_GLOW_MS));
  ctx.ballView.sync(game.ball, alpha, delta,
    game.phase === 'rally' && game.rally.profile === 'serve' && game.rally.serveStyle === 'float',
    ballGlow);
  const netHitPower = ctx.court.update(delta, game.ball); // 網面受擊波動（純視覺）
  if (netHitPower > 0) stage.sfx.netHit(netHitPower);
  stage.matchView.sync(game, alpha, delta, frameEvents);
  stage.rig.setSpikeMine(s.aiState?.claimId === s.controlledId); // 扣球一人稱只認「舉給我」
  stage.rig.setBenchMode(benched); // W7 C2①：板凳側位廣角，優先於其餘鏡頭模式
  // W8 暫停演出：圈內第一人稱窗——聚攏 0.9s 後進、散圈走回前 0.5s 退（板凳視角優先）；
  // 同一顆布林餵 rig（鏡頭）與 matchView（隱藏受控者本體防擋鏡）
  const huddleRemain = game.serveReadyTick - game.tick;
  // W8（07-26 試玩回饋「沒看到對方選了什麼」）：對手選項改在散圈回場那一刻浮字——
  // 資訊落在「你要用它」的前一刻（暫停中你在讀自己的面板，且播報 3s 就過期）
  if (s.pendingOppBoost && (game.phase !== 'serve' || huddleRemain <= HUDDLE.WALK_BACK_TICKS)) {
    const b = s.pendingOppBoost;
    s.pendingOppBoost = null;
    stage.floatText.show(
      b === 'calm' ? '⚠ 對手調整呼吸——他們回了體力' : '⚠ 對手燃起氣勢——擋住這一波',
      '#ff9d7a', 2600,
    );
  }
  const huddleFPV = (!benched && s.timeoutHuddleTeam != null && game.phase === 'serve' &&
    (TUNING.TIMEOUT_DEAD_TICKS - huddleRemain) > HUDDLE_VIEW_IN_TICKS &&
    huddleRemain > HUDDLE.WALK_BACK_TICKS + 30)
    || s.breakHuddleFPV === true; // 4.5B §7：局間圍攏過場的圈內段（牆鐘演出時鐘驅動）
  stage.rig.setHuddleView(huddleFPV);
  stage.matchView.setHuddleView(huddleFPV);
  // 07-26：近身視角藏自己的頭上標籤（防守/攻擊/一人稱＝鏡頭貼在自己身後，標籤爆大擋線）
  stage.matchView.setHideOwnTag(['defend', 'attack', 'first'].includes(stage.rig.getMode()));
  stage.rig.update(game, alpha, delta);
  // 4.5B §4：diegetic 熱點每幀重錨（rAF 驅動；用 rig 更新後的鏡頭投影）
  stage.diegetic?.sync(game, ctx.camera);
  // 局點張力：燈光收攏＋心跳（deuce 內建於 setPointTeam 判定）
  const tension = game.phase !== 'set_over' && setPointTeam(game) !== null;
  ctx.lights.setTension(tension, delta);
  stage.sfx.setHeartbeat(tension);
  // W7 B4②：氣勢聲量聯動——我方（A）有利＝聲量爬升、對方有利＝場館變安靜（壓迫感，非噓聲）；
  // 優先序：局點發球前屏息＞氣勢聯動（tension 成立時氣勢聯動整個讓位，不疊算）
  // W7.1 #4④（試玩回饋）：幅度 ±0.035→±0.05，客場安靜的壓迫感要更明顯
  const momentumCrowd = game.momentum
    ? 0.05 + (game.momentum.value / TUNING.MOMENTUM_MAX) * 0.05
    : 0.05;
  stage.sfx.setCrowdLevel(tension && game.phase === 'serve' ? 0.016 : momentumCrowd);
  // W7 B4③：氣勢聚光微聯動（複用局點壓暗管線 lights.setTension 同一組燈具的姐妹方法）
  ctx.lights.setMomentum(game.momentum ? game.momentum.value / TUNING.MOMENTUM_MAX : 0, tension, delta);
  // 鏡頭語言：得分 FOV punch＋重扣慢動作收緊（望遠壓縮感）
  const punchFov = now < s.fovPunchUntil
    ? 6.5 * Math.sin(Math.PI * (1 - (s.fovPunchUntil - now) / 700)) : 0;
  const slowFov = now < s.slowUntil ? 3.5 : 0;
  // 4.5B §4 追修（07-27）：S 分配窗視野加寬——兩翼候選在窄視野下出鏡＝熱點點不到
  const ssetFov = stage.rig.getMode() === 'sset' ? 12 : 0;
  const fovTarget = 55 - punchFov - slowFov + ssetFov;
  if (Math.abs(ctx.camera.fov - fovTarget) > 0.01) {
    ctx.camera.fov = fovTarget;
    ctx.camera.updateProjectionMatrix();
  }
  // 教學局：逐步引導＋六步走完提前收局（不用打滿 25 分）
  if (updateTutorial(s, now)) endTutorialSet(s);
  settleIfOver(s);
  // 螢幕震動：鏡頭位置疊隨機偏移、指數衰減（表現層，不碰 sim）
  if (s.shake > 0.004) {
    ctx.camera.position.x += (Math.random() - 0.5) * s.shake;
    ctx.camera.position.y += (Math.random() - 0.5) * s.shake * 0.6;
    s.shake *= 0.82;
  }
  updateDiveReady(s);
  stage.subPanel?.sync(game); // W6 ⚙ 換人鈕可用性（死球窗＋剩餘額度）
  syncCallFeedback(s); // 段 E：叫套路的回饋字卡＋面板狀態同步
  // 叫戰術重做卷 段 0：非 S 的球內提示「S 要你跑 X」。純顯示、零互動——
  // 決定跑不跑用既有的移動輸入，系統只補上玩家缺的那項資訊（裁定題 0）。
  // 資料源 myRouteFor 自己會判「這一刻有沒有線可報」，回 null 就收起來。
  // ★ 選攻擊區時收起（2026-08-03 Sawmah 試玩裁定）★ 這張卡回答的是「要不要跑這條線」，
  // 而攻擊區面板一開＝助跑已經跑完、球就在手邊，那個資訊已經沒有可操作性，
  // 留著只是壓在球場中央擋讀攔網。旗標沿用既有的 `attackDecidingSince`（>=0＝面板開著），
  // 不另立狀態。
  stage.routeCue?.sync(
    s.attackDecidingSince >= 0 ? null : myRouteFor(game, s.aiState, s.controlledId),
  );
  // 2026-08-04 試玩裁定：攔網涵蓋帶——玩家看得見「我的手守得住哪一段網」。
  // 顯示條件刻意與**自動跳攔**（`matchControls.js:511-513`）逐條對齊：前排＋站在攔網帶內
  // ＋球權在對方。條件一致＝帶子出現就代表「這一球我真的會跳」，不會出現
  // 「看到帶子卻沒跳」或「跳了卻沒帶子」的分岔。
  // armed＝對方已進入扣球階段（profile==='spike'）⇒ 亮起來；其餘時候淡淡的不搶視線。
  {
    const me = game.players[s.controlledId];
    const a = game.actors[s.controlledId];
    const r = game.rally;
    // ★ 2026-08-04 二修（Sawmah 實玩：「剛剛扣球也有閃過那個白色的帶」）★
    // 原本只看「球權在對方」，但球一過網 `possession` 就切了（`game.js:1029`）
    // ⇒ 玩家扣完球還在收動作時帶子就閃出來。加 `touches >= 1`：
    // 對方**已經接起球、開始組織**才是該準備攔網的時刻；球還在飛過去的路上不算。
    const blocking = me && a && game.phase === 'rally'
      && r.possession && r.possession !== me.teamId && r.touches >= 1
      && isFrontRow(game.match.rotations[me.teamId], s.controlledId)
      && Math.abs(a.z) < NEAR_NET_Z; // 向 matchControls 取單一真相，不放第二份
    // 四版：連**前排隊友**的格子一起畫（見 blockReach.js 檔頭）。理由是封線指令
    // （`AI.BLOCK_SCHEME_SHIFT` 0.9m）是整面牆同方向平移、而玩家不跟著平移
    // ⇒ 相對位置被拉開，足以在玩家那一格開縫（肩寬間距只有 0.55m）。
    // 隊友的判準與玩家同一組（前排＋站在攔網帶內），不同的只有濃度。
    const mateXs = [];
    if (blocking) {
      const rot = game.match.rotations[me.teamId];
      for (const pid of rot) {
        if (pid === s.controlledId) continue;
        if (!isFrontRow(rot, pid)) continue;
        const ma = game.actors[pid];
        if (!ma || Math.abs(ma.z) >= NEAR_NET_Z) continue; // 退防的人不畫（他不在牆上）
        mateXs.push(ma.x);
      }
    }
    stage.blockReach?.set(
      blocking ? a.x : null,
      mateXs,
      // 三版：改畫在**網上**（見 blockReach.js 檔頭沿革）。地板方案依賴「鏡頭俯視地面」，
      // 但攔網視角本來就是平視網，鏡頭一換（`cameraRig.js` 的 defend 模式由面板開關驅動）
      // 地上的東西就離開視線 ⇒ 改貼網面，網恆在視線前方。
      // 這裡傳的是**我方半場符號**（玩家恆在自己這側），面片往自己這側偏 6cm 防 z-fighting。
      a ? Math.sign(a.z || 1) : 1,
      blocking && r.profile === 'spike',
    );
  }
  stage.timeoutBtn?.sync(game); // W7 B3 暫停鈕可用性（死球窗＋剩餘額度）
  stage.benchAccelBtn?.sync(benched); // W7 C2③：只在板凳期間顯示
  if (stage.comebackBtn) {
    // W7 C2④：回場鈕可用性只在板凳期間才需要算（省事件流掃描）
    const avail = benched ? comebackAvailability(s) : { enabled: false, reason: '' };
    stage.comebackBtn.sync(benched, avail.enabled, avail.reason);
  }
  // W7 A6：主角 HUD 體力條（受控者本人；stamina 未啟用傳 null 短路隱藏）
  stage.heroStamina?.update(game.stamina ? (game.stamina[s.controlledId] ?? 1) : null);
  stage.scoreboard.update(game, myBall, s.controlledId,
    stage.commentary ? stage.commentary.line(game, s.aiState, s.controlledId, now) : undefined);
  if (stage.actionButtons) stage.actionButtons.update(stage.controls.currentContext());
  stage.touchUi.update(stage.controls.uiState());
  const aimAt = s.config.simpleMode ? null : stage.controls.currentAimPoint(game);
  if (aimAt) stage.aimMarker.show(aimAt);
  else stage.aimMarker.hide();
  ctx.renderer.render(ctx.scene, ctx.camera);
  ctx.hud.frame(now, delta, simSteps);
}
