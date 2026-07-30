// 回合迴圈——固定步長累積器（模擬）＋ requestAnimationFrame（畫面，不鎖幀）
// 架構鐵律：模擬（src/sim）只在 while 迴圈裡以 SIM_DT 推進；render 讀插值結果，兩者完全脫鉤
// 本檔持有比賽期間全部逐幀可變狀態（VCR/回放/受控者/juice/決策窗），集中在顯式的
// loop state 物件 `s`——所有函式都吃 s 參數，模組間不共用隱式可變狀態。
// 與賽前準備（matchConfig/matchStage）僅以 config/gates/stage 資料介面銜接，
// 與賽末收束（matchCareer）僅在局終呼叫 settleCareerMatch 一次。
import { SIM_DT, MAX_FRAME_DELTA } from '../sim/constants.js';
import {
  createGame, stepGame, applySubstitution, applyTimeout, applyTimeoutBoost, resumeFromTimeout,
  startNextSet, applyLiberoRecall, TUNING,
} from '../sim/game.js';
import {
  createAiState, aiCollectIntents, aiTimeoutWanted, aiTimeoutBoost, aiSubstitutionWanted,
} from '../sim/ai.js';
import { predictLanding } from '../sim/flight.js';
import { landedCourtTeam, isBackRow } from '../sim/rotation.js';
import {
  setPanelTitle, setPreviewTitle, setStageOf, SET_HESITANT_BELOW,
} from '../input/setOptions.js';
import { effectiveTrust } from '../sim/trust.js';
import { mbPanelTitle } from '../input/blockRead.js';
import { digReadCorrect, schemeByKey, noteScheme, counterReadOf } from '../input/liberoRead.js';
import { applySeasonRoster } from '../career/careerState.js';
import { serverId } from '../sim/match.js';
import { STAMINA } from '../sim/stamina.js';
import { setPointTeam } from '../ui/scoreboard.js';
import { derivePointInfo } from '../ui/pointBanner.js';
import { roleSwapOk } from '../ui/subPanel.js';
import { heroCardFor, momentumCardFor } from '../ui/heroCards.js';
import { settleCareerMatch, careerReturnUrl, resolveOppAceBox } from './matchCareer.js';
import { createRallyRecorder, createRallyPlayer, isPlayableTape } from './rallyTape.js';
import { buildTeamBox } from '../career/boxScore.js';
import { boxScoreLFor } from '../career/boxScoreL.js';
import { upcomingTeach } from '../career/events.js';
import { TECH_DEFS } from '../career/growth.js';
import { RECRUIT_CONDS, progressOf, featGainFor } from '../career/recruitment.js';
import { opponentById } from '../career/opponents.js';
import { HUDDLE } from '../render/huddleLayout.js';
import { CAMERA_TUNING } from '../render/cameraRig.js';
import { hitLeadTicks, seqDurTicks } from '../render/geoAnimator.js';
import { approachRouteOf } from '../sim/approach.js';
import {
  trackSignature, armSignature, signatureFire, planSignatureBeat, sigKey,
  lineKillDistance, SIG_LINE_M, timingVerdict,
} from '../ui/signatureBeats.js';
import {
  loadPresentationPref, keyPointOf, createBeatTimeline, driveTimeline,
} from '../ui/presentation.js';
import { easeInOutCubic } from '../render/ritualStage.js';
import {
  sHotspotItems, lSignalItems, createLatencyStats, loudCallerOf,
} from '../ui/diegeticItems.js';

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

// 一速／二速攻擊手「該不該在這一 tick 播助跑或起跳」——純函式，供 tests 直測。
//   'approach' 助跑起手（讓序列末幀正好踩在起跳 tick 上）／'takeoff' 離地／null 不播
// 三速（起跳在二傳觸球之後）與算不出起跳 tick 的 route 一律回 null＝走既有路徑。
export function earlyTakeoffCue(route, tick, approachLeadTicks, staleTicks) {
  if (!route || route.tempo === 'three' || route.takeoffTick == null) return null;
  const toTakeoff = route.takeoffTick - tick;
  if (toTakeoff > 0) return toTakeoff <= approachLeadTicks ? 'approach' : null;
  return -toTakeoff <= staleTicks ? 'takeoff' : null;
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
  if (careerCtx) {
    const rivalBase = opponentById(careerCtx.matchEntry.opponentId);
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
    // 07-27 七輪：對方本波舉球是否快攻低弧（「早了」卡的原因分語）
    oppQuickSet: false,
    // W4 B-3：封線影子首次教學（07-27 試玩回饋「看不懂黑色陰影」——每場一次講色語）
    shadowHintShown: false,
    // W4 題3/題5：二次球真值字卡追蹤（實際出手才立旗）＋OPP 要球窗
    dumpLive: false,
    callWindowUntil: 0,   // 浮鈕失效時刻（0.8s 牆鐘窗）
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
    lastWaitFlight: -1,         // Phase 5 W1 §2-3：等待姿勢（transitionWait），每個 flight 只播一次
    earlyApproachKey: '',       // §4 追修：一速助跑起手已播的助跑計畫（每計畫一次）
    earlyTakeoffKey: '',        // 同上，離地（吃 sim 的 route.takeoffTick）
    hitStopUntil: 0,            // 打擊感（juice）：擊球定格、螢幕震動、重扣慢動作
    slowUntil: 0,
    shake: 0,
    lastTouch: null,            // 最後觸球（死球時推導得分原因用）
    pendingDead: null,          // DEAD_BALL 先到、SCORE 緊隨（同批事件）：湊齊才顯示面板
    assistFlight: -1,
    assistLanding: null,
    // W6 壯舉達成字卡（新增採納 3）：本場對手未達成的 feat 條件清單，死球增量檢查
    recruitWatch: buildRecruitWatch(careerCtx, playerId),
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
function buildRecruitWatch(careerCtx, playerId) {
  const opponentId = careerCtx?.matchEntry?.opponentId;
  const rec = careerCtx?.store?.loadRecruitment?.();
  if (!opponentId || !rec || !playerId) return [];
  const watch = [];
  for (const [key, cond] of Object.entries(RECRUIT_CONDS)) {
    if (cond.opponentId !== opponentId || !cond.feat) continue;
    if (rec.recruited.includes(key)) continue;
    const base = progressOf(rec, key).feat;
    if (base >= cond.feat.count) continue;
    watch.push({ key, cond, base, fired: false });
  }
  return watch;
}

// 死球時增量檢查：本場 feat 增量＋既有進度過門檻＝當場彈卡（一場一卡不重複；
// 純 UI 演出——真正的進度累加仍在賽末 settleCareerMatch，不在此寫入）。
// W6.1 T2：改走同框節流佇列——被更高優先字卡擠掉時不標 fired，下個死球重驗再出（不丟失）
function checkRecruitFeats(s, cards) {
  if (!s.recruitWatch.length) return;
  const myTeam = s.game.players[s.playerId]?.teamId ?? 'A';
  for (const w of s.recruitWatch) {
    if (w.fired) continue;
    const gain = featGainFor(s.game.events, s.playerId, myTeam, w.cond);
    if (w.base + gain >= w.cond.feat.count) {
      const def = opponentById(w.cond.opponentId);
      cards.push({
        pri: 40,
        text: `⭐ 招募條件達成：${def?.name ?? ''}・${w.cond.feat.label}`,
        color: '#ffd166',
        dur: 1600,
        onShown: () => { w.fired = true; },
      });
    }
  }
}

// 輸入/導航事件绑定：局終點擊、回放（R/🎬）、魚躍（L/Space/鈕）、情蒐跳過
function bindInputHandlers(s) {
  const { stage, config } = s;
  // 局終點擊 → 生涯：第一次點＝單場結算頁（W4 Q9）；返回生涯改走面板內「關閉」鈕
  // （U1 07-30 拍板：誤觸關掉面板最重的一支，第二次「點任意處」的返回路徑已移除）。
  // 快速比賽：換種子再開一局
  window.addEventListener('pointerdown', () => {
    if (s.game.phase !== 'set_over') return;
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
    if (e.code === 'KeyR') startReplay(s); // 桌機 R＝回放上一球
  });
  window.addEventListener('pointerdown', () => {
    if (s.replay?.tape) { // 跳過整卷情蒐
      s.replay = null;
      s.tapeIdx = config.tapeClips.length;
      stage.floatText.show('跳過情蒐——比賽開始！', '#9fb0cc', 1000);
    }
  });
  // 魚躍：自動判斷（matchControls 自動輔助，拍板 07-24 常駐鈕移除）；
  // 桌機 L 鍵/簡化模式 Space 保留為隱藏手動（提前撲的主動權）
  stage.handlers.replay = () => startReplay(s);
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
  s.replay = { player, acc: 0 };
  s.stage.floatText.show('🎬 回放', '#ffd166', 1200);
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
  s.replay = { player, acc: 0, tape: true };
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
function runReplayFrame(s, now, delta) {
  const { stage, ctx } = s;
  const replay = s.replay;
  const { player } = replay;
  replay.acc += delta * REPLAY_SPEED;
  while (replay.acc >= SIM_DT && !player.done) {
    player.step();
    replay.acc -= SIM_DT;
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

// 簡化模式決策窗：進攻選區/發球選區面板＋攔網防守窗；回傳放慢倍率（0＝不放慢）
function updateDecisions(s, now) {
  if (!s.config.simpleMode) return 0;
  const { game, aiState, gates, stage } = s;
  const { controls, panel, rig, sfx, floatText } = stage;
  // W3 L：digBias 生命週期——我方第一觸之後/死球＝指令歸零（一次指揮只管一次對手
  // 攻擊）。注意：攻擊過網瞬間 possession 即翻到我方（touches=0、profile 仍 spike）
  // ——此時指令必須還活著（Perfect 窗在我方起球當下才結算），不得提前清
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
  const setDeciding =
    !!setZones && setZones.length > 0 &&
    game.ball.vy < 0 && game.ball.y > 1.8 && !controls.setPending();
  // 4.6 追修（07-28 試玩）：分配窗兩段式——遠段唯讀（你還在跑）、近段才可下指令。
  // 距離＝我到「球墜到接球高度的接觸點」（協調層算好的同一份，不另闢真相）
  const setContact = aiState.contactPoint ?? aiState.landing;
  const meActorNow = game.actors[s.controlledId];
  const setDist = setDeciding && setContact && meActorNow
    ? Math.hypot(setContact.x - meActorNow.x, setContact.z - meActorNow.z)
    : null;
  const setReady = !setDeciding || setStageOf(setDist) === 'ready';
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
      [{ key: 'jump-now', label: '🧱 起跳攔網', color: 'orange' }],
      () => {
        // 07-27 四輪（Sawmah：字卡太多以體驗為主）：起跳確認浮字移除——
        // 你自己按的鈕零資訊量；結果真值卡（賭對/早了）才是 MB 身分核心，保留
        controls.chooseMbTiming(true);
        s.mbCommit = { jumped: true };
      },
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
      // 遠段：只給真值（一傳品質＋協調層建議打誰），沒有可點的東西——
      // 空選項面板＝既有通道的唯讀用法，不新增元件
      const suggest = setZones.find((z) => z.pid === aiState.attackerId) ?? setZones[0];
      stage.diegetic?.hide();
      panel.show(setPreviewTitle(setZones[0].tier, suggest?.label ?? null), [], () => {});
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
  } else if (serveDeciding) {
    // 穩定×4＋強力×3（強＝低平快、散佈大；短球無強力——它本來就是輕放）
    const zs = controls.serveZones(game);
    const styleHint = [
      gates.canFloatServe ? '藍＝飄浮' : null,
      gates.canJumpServe ? '橘＝跳發' : null,
    ].filter(Boolean).join('、');
    panel.show(
      styleHint ? `選發球目標！（${styleHint}）` : '選發球目標！',
      [
        ...zs.map((z) => ({ key: z.key, label: z.label, color: 'neutral', zone: z, style: null })),
        // 飄浮/跳躍球路＝故事線傳授的技術（未習得不出現）
        ...(gates.canFloatServe ? zs.filter((z) => z.key !== 'short').map((z) => ({
          key: `f-${z.key}`, label: `飄${z.label.slice(1)}`, color: 'cyan', zone: z, style: 'float',
        })) : []),
        ...(gates.canJumpServe ? zs.filter((z) => z.key !== 'short').map((z) => ({
          key: `j-${z.key}`, label: `跳${z.label.slice(1)}`, color: 'orange', zone: z, style: 'jump',
        })) : []),
      ],
      (it) => {
        controls.serveNow(game, it.zone.aim, it.style);
        s.servedThisTurn = true;
      },
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
    s.accumulator -= SIM_DT;
    simSteps += 1;
  }
  return { frameEvents, simSteps };
}

// 事件應用：音效/播報/juice（定格、震動、慢動作）/得分原因面板/慶祝
// W6.1 字卡同框整流（拍板 07-24 Q1-T2 修訂版：不丟卡）：本批次字卡先集中收單，
// 迴圈尾一次 flush——依優先序低→高送出（floatText 疊排＝後出的停在最顯眼的基準位、
// 先出的被上推），資訊零損失、同框重合疊字歸零。優先序：⚡45＞⭐40＞🧱/👆/🎭20＞PERFECT 10
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
    // 4.5B §3 招牌演出追蹤：解除（對手救起/新發球）→武裝（成因事件）；
    // 起鏡只認 SCORE（追加條 B：勝負已定的那一拍之後——見下方 SCORE 分支）
    s.pendingSig = trackSignature(s.pendingSig, e, myTeam);
    if (e.type === 'TOUCH' && e.kind === 'spike' && e.team !== myTeam) {
      s.lastOppSpikerId = e.playerId; // MB 俯視鏡的對面攻擊手（他抬頭看你）
    }
    if (e.type === 'BLOCK_DECEIVED' && e.spikerId === s.controlledId) {
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
    // 07-27 七輪：對方舉球球種真值（e.power＝舉球 timing、<0.5＝快攻低弧 sim 同判準）
    // ——「早了」卡的原因說明用（賭輸快攻 vs 高球按太早，玩家最想知道的是哪一種）
    if (e.type === 'TOUCH' && e.kind === 'set'
      && e.team !== game.players[s.controlledId]?.teamId) {
      s.oppQuickSet = (e.power ?? 1) < 0.5;
    }
    // 07-27 三改：MB 時機字卡改判「真值」——看你的攔網窗 vs 球實際過網：
    // 窗已過期＝跳太早落地了（七輪：補球種原因——快攻賭輸/高球按早分語）；
    // 窗內但沒碰到且球在附近＝線差一點；封到＝BLOCK_TOUCH 回饋（上方）。
    // 球沒被攔到才有 BALL_OVER_NET
    if (e.type === 'BALL_OVER_NET' && s.mbCommit?.jumped
      && e.toTeam === game.players[s.controlledId]?.teamId
      && game.players[s.controlledId]?.currentRole === 'middle') {
      const a = game.actors[s.controlledId];
      const jumpedThisAttack = game.tick - (a.blockStartTick ?? -9999) < 90;
      if (jumpedThisAttack) {
        if (a.blockUntil < game.tick) {
          stage.floatText.show(
            s.oppQuickSet ? '快攻比你更快——再搶半拍' : '早了——是高球，等它下來',
            '#c8d6eb', 1400,
          );
        } else if (Math.abs(game.ball.x - a.x) < 1.6) {
          stage.floatText.show('時機對了——線差一點！', '#ffd166', 1400);
        } // 球不在你這條線＝不評（不是你的球）
      }
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
    if (e.type === 'TOUCH' && e.kind === 'spike') {
      s.hitStopUntil = now + ((e.power ?? 1) >= 0.7 ? 70 : 40);
      if ((e.power ?? 1) >= 0.7) s.slowUntil = now + 450; // 重扣＝定格接慢動作
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
      s.hitStopUntil = now + 60;
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
    } else if (e.type === 'DEAD_BALL') {
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
      checkRecruitFeats(s, cards); // W6 壯舉達成字卡（死球節拍增量檢查）
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
      if (s.pendingDead) {
        stage.pointBanner.show(derivePointInfo({
          reason: s.pendingDead.reason, winner: e.team,
          myTeam: game.players[s.controlledId]?.teamId,
          lastTouch: s.lastTouch, controlledId: s.controlledId, score: e.score,
        }));
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
      const fired = signatureFire(s.pendingSig, e, myTeam);
      s.pendingSig = null;
      if (fired && !s.replay) fireSignatureBeat(s, fired, now);
    }
    // 主角字卡統一出口（判定在 heroCards.js 純函式：Perfect 一傳／攔網碰球／
    // 假動作騙贏／回歸建功——測試用真 sim 事件流直測，不必開瀏覽器目視）
    const heroCard = heroCardFor(e, {
      controlledId: s.controlledId,
      playerName: e.playerId ? game.players[e.playerId]?.name : '',
    });
    if (heroCard) cards.push(heroCard);
  }
  // flush：低優先先出（被疊排上推）、最高優先最後出＝停在基準位；全部都出、零丟卡
  if (cards.length) {
    cards.sort((a, b) => a.pri - b.pri);
    for (const c of cards) {
      stage.floatText.show(c.text, c.color, c.dur);
      c.onShown?.();
    }
  }
}

// 操作輔助與動作觸發：落點圈／「這球歸你」光圈／起跳與攔網姿勢／AI 先跳後揮
function updateAssistAndPoses(s) {
  const { game, aiState, stage } = s;
  // 操作輔助：來球落點圈（每個 flight 只預測一次，唯讀取用 sim 純函式）
  if (s.config.assistOn && game.phase === 'rally') {
    if (s.assistFlight !== game.rally.flightId) {
      s.assistFlight = game.rally.flightId;
      s.assistLanding = predictLanding(game.ball);
    }
    if (s.assistLanding && s.assistLanding.z > 0) {
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
  // 本來就低於高手門檻 1.6m。實測 20.8% 的接球實際觸點在 1.6m 以上（快速下墜球提早
  // 1–2 tick 觸球，而下墜 1 tick 就是 0.25m ⇒ 事前無法在 tick 粒度上分辨），這部分
  // 由 TOUCH 事件當場改播 overhead＝與修前完全相同的行為，不會變差
  if (game.phase === 'rally' && aiState.claimId && aiState.claimId !== s.controlledId
    && aiState.contactPoint?.ticks != null && aiState.flightId !== s.lastContactFlight
    && game.rally.touches <= 1) {
    const toContact = aiState.contactPoint.ticks - (game.tick - aiState.planTick);
    const isSet = game.rally.touches === 1;
    const type = isSet ? 'overhead' : 'bump';
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
      const hesitant = aiState.attackKind === 'quick'
        && attacker && effectiveTrust(game, attacker) < SET_HESITANT_BELOW;
      stage.matchView.triggerPose(aiState.attackerId, hesitant ? 'windupHesitant' : 'windup');
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
      const hesitant = aiState.attackKind === 'quick'
        && attacker && effectiveTrust(game, attacker) < SET_HESITANT_BELOW;
      stage.matchView.triggerPose(aiState.claimId, hesitant ? 'windupHesitant' : 'windup');
    }
  }
  return myBall;
}

// 局終/局間轉場（一次性）；生涯模式先落檔再顯示——點擊返回前進度已保住
function settleIfOver(s) {
  const { game, stage } = s;
  if (game.phase === 'set_over' && s.prevPhase !== 'set_over') {
    if (s.careerCtx) {
      const { saveOk } = settleCareerMatch({
        careerCtx: s.careerCtx, game, playerId: s.playerId,
        feintsUsed: s.feintsUsedThisMatch,
        lOverrides: s.lOverrideTally, // W4 Q9：L 改判記帳（box 第四欄）
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

// 局間存檔離開（Q8 必配）：整包 sim state JSON 快照落槽位 mid key → 返回生涯。
// 續玩＝runMatch 以快照為 game 直接開機（phase 仍為 set_break＝「從局間 huddle 前恢復」）
function saveMidAndQuit(s) {
  const ok = s.careerCtx.store.saveMidMatch?.({
    matchId: s.careerCtx.matchEntry.id,
    savedAtSet: s.game.series.setIndex,
    feintsUsed: s.feintsUsedThisMatch,
    lOverrides: { ...s.lOverrideTally }, // W4 Q9：改判 tally 隨局間存檔續玩接回
    game: JSON.parse(JSON.stringify(s.game)),
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
  ctx.ballView.sync(game.ball, alpha, delta,
    game.phase === 'rally' && game.rally.profile === 'serve' && game.rally.serveStyle === 'float');
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
  settleIfOver(s);
  // 螢幕震動：鏡頭位置疊隨機偏移、指數衰減（表現層，不碰 sim）
  if (s.shake > 0.004) {
    ctx.camera.position.x += (Math.random() - 0.5) * s.shake;
    ctx.camera.position.y += (Math.random() - 0.5) * s.shake * 0.6;
    s.shake *= 0.82;
  }
  updateDiveReady(s);
  stage.subPanel?.sync(game); // W6 ⚙ 換人鈕可用性（死球窗＋剩餘額度）
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
