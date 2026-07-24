// 回合迴圈——固定步長累積器（模擬）＋ requestAnimationFrame（畫面，不鎖幀）
// 架構鐵律：模擬（src/sim）只在 while 迴圈裡以 SIM_DT 推進；render 讀插值結果，兩者完全脫鉤
// 本檔持有比賽期間全部逐幀可變狀態（VCR/回放/受控者/juice/決策窗），集中在顯式的
// loop state 物件 `s`——所有函式都吃 s 參數，模組間不共用隱式可變狀態。
// 與賽前準備（matchConfig/matchStage）僅以 config/gates/stage 資料介面銜接，
// 與賽末收束（matchCareer）僅在局終呼叫 settleCareerMatch 一次。
import { SIM_DT, MAX_FRAME_DELTA } from '../sim/constants.js';
import {
  createGame, stepGame, applySubstitution, applyTimeout, applyTimeoutBoost, TUNING,
} from '../sim/game.js';
import { createAiState, aiCollectIntents, aiTimeoutWanted } from '../sim/ai.js';
import { predictLanding } from '../sim/flight.js';
import { landedCourtTeam, isBackRow } from '../sim/rotation.js';
import { serverId } from '../sim/match.js';
import { STAMINA } from '../sim/stamina.js';
import { setPointTeam } from '../ui/scoreboard.js';
import { derivePointInfo } from '../ui/pointBanner.js';
import { roleSwapOk } from '../ui/subPanel.js';
import { settleCareerMatch, careerReturnUrl } from './matchCareer.js';
import { upcomingTeach } from '../career/events.js';
import { TECH_DEFS } from '../career/growth.js';
import { RECRUIT_CONDS, progressOf, featGainFor } from '../career/recruitment.js';
import { opponentById } from '../career/opponents.js';

// W7 C2：受控者（此處固定用 s.playerId＝主角）是否在場上——板凳三件套與 C1 教練建議共用判準
// export：供 tests/comeback-ui.test.mjs 純函式直測（回場鈕/儀表板模式無 DOM 依賴的判斷邏輯）
export function onCourt(game, playerId) {
  const team = game.players[playerId].teamId;
  return game.match.rotations[team].includes(playerId);
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
  // 偵錯把手：供自動化測試與真機除錯檢視執行期狀態（不參與遊戲邏輯）
  window.__phase1 = {
    game: s.game, aiState: s.aiState,
    renderer: s.ctx.renderer, scene: s.ctx.scene, camera: s.ctx.camera,
    quality: s.ctx.quality, rig: s.stage.rig,
    vcr: () => s.vcrLast,             // 上一球的回放資料
    controlled: () => s.controlledId, // 當前受控球員（輪控除錯）
    tapeCount: s.config.tapeClips.length, // 情蒐錄影帶卷數（測試用）
    floatText: stage.floatText,       // 字卡把手（W6.1 疊排的自動化驗證用）
  };
  if (s.config.tapeClips.length) startTapeClip(s); // 生涯開賽：先播情蒐錄影帶（點擊跳過）
  showTeachPreview(s); // 學招預告字幕（拍板 07-23：情蒐帶開頭；無帶素材時開賽直接顯示）
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) s.last = performance.now();
  });
  s.rafFn = (now) => frameStep(s, now);
  requestAnimationFrame(s.rafFn);
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
    feintsUsedThisMatch: 0,     // 假動作熟練度：場終一次累積寫回 Player
    attackDecidingSince: -1,    // 讀攔網 slow 檔的上色計時起點
    slowEaseFrom: -1e9,         // 決策窗結束時刻（時間膨脹 0.4→1.0 緩出的起點）
    tapeIdx: 0,
    // VCR 資料底：每球錄「發球前快照＋整球 Intent 流」；快照＋同序 Intent 重演＝逐格一致
    vcrCurrent: { snapshot: null, steps: [] },
    vcrLast: null,
    replay: null,               // { state, steps, idx, acc, tape? }
    prevPhase: game.phase,
    fovPunchUntil: 0,
    rallyStartFlight: 0,        // 本球起始 flight（rally 長度＝歡呼強度）
    controlledId: playerId,
    switchKey: '',
    lastWindupFlight: -1,       // AI 攻擊手起跳動畫：每個 flight 只播一次
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
    // W7.1 #3A：目前正在集合帶位/倒數的暫停隊伍（'A'|'B'|null）——matchLoop 唯一事實源，
    // matchView/countdown 都吃這個
    timeoutHuddleTeam: null,
    // W7.1 #4①：滿檔字卡「跨進才發」的比對基準（同 sim momentum 初值 0）
    prevMomentumValue: 0,
    last: performance.now(),
    accumulator: 0,
    rafFn: null,
  };
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
    // 換人敘事（新增採納 6；台詞 TODO(naming) 命名工程統一潤稿）
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
  if ((game.subs[team]?.remaining ?? 0) <= 0) return { enabled: false, reason: '換人次數已用盡' };
  if (!findComebackOut(game, playerId)) return { enabled: false, reason: '場上找不到可換下的同位置隊友' };
  return { enabled: true, reason: '' };
}

// W7 C2④ 回場鈕執行（獨立按鈕，非走 ⚙ 面板——儀式感是拍板重點）：走與 ⚙ 面板相同的
// sim 唯一路徑 applySubstitution（outId=找到的替補、inId=主角）
function requestComeback(s) {
  const { game, playerId } = s;
  const team = game.players[playerId].teamId;
  const outId = findComebackOut(game, playerId);
  if (!outId) return { ok: false, reason: 'no-target' };
  const r = applySubstitution(game, { team, outId, inId: playerId });
  if (r.ok) s.stage.floatText.show('🔥 回到場上！', '#ffd166', 1500); // TODO(naming)
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

// W7.1 #4①：氣勢滿檔「跨進那一刻」判定（純函式，供測試）——同檔內不重發、離開再進可重發。
// 回傳觸發方（'A'|'B'）或 null；prevValue 用呼叫端持久追蹤的上一次 MOMENTUM 值。
export function enteringMomentumMax(prevValue, newValue, max) {
  if (newValue === max && prevValue !== max) return 'A';
  if (newValue === -max && prevValue !== -max) return 'B';
  return null;
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
    if (boost === 'calm') {
      const after = avgStamina(game, team);
      const suffix = before !== null && after !== null
        ? `（+${Math.max(0, Math.round((after - before) * 100))}%）` : '';
      stage.floatText.show(`🧘 全隊體力小回${suffix}！`, '#6ee7ff', 1800); // TODO(naming)
    } else if (boost === 'fire') {
      stage.floatText.show('🔥 士氣拉起來了！', '#ff9d7a', 1800); // TODO(naming)
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
  // 局終點擊 → 生涯：回生涯畫面（結果已在局終當下落檔）；快速比賽：換種子再開一局
  window.addEventListener('pointerdown', () => {
    if (s.game.phase !== 'set_over') return;
    if (s.careerCtx) {
      window.location.assign(careerReturnUrl(s.ctx.params, window.location.pathname));
      return;
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
    s.vcrCurrent = { snapshot: null, steps: [] };
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
  if (!rec || !rec.snapshot || rec.steps.length === 0 || s.replay) return;
  const state = structuredClone(rec.snapshot);
  // 快轉到尾段起點（不渲染），只播殺球/落地的關鍵 3 秒
  const startIdx = Math.max(0, rec.steps.length - REPLAY_TAIL);
  for (let i = 0; i < startIdx; i += 1) stepGame(state, rec.steps[i].intents);
  s.replay = { state, steps: rec.steps, idx: startIdx, acc: 0 };
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
  s.stage.teachDialog.show([ // TODO(naming)：教練台詞佔位，命名工程統一潤稿
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
  const state = structuredClone(clip.snapshot);
  const startIdx = Math.max(0, clip.steps.length - TAPE_TAIL);
  for (let i = 0; i < startIdx; i += 1) stepGame(state, clip.steps[i].intents);
  s.replay = { state, steps: clip.steps, idx: startIdx, acc: 0, tape: true };
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
  replay.acc += delta * REPLAY_SPEED;
  while (replay.acc >= SIM_DT && replay.idx < replay.steps.length) {
    stepGame(replay.state, replay.steps[replay.idx].intents);
    replay.idx += 1;
    replay.acc -= SIM_DT;
  }
  const rAlpha = Math.min(replay.acc / SIM_DT, 1);
  ctx.ballView.sync(replay.state.ball, rAlpha, delta,
    replay.state.rally?.profile === 'serve' && replay.state.rally?.serveStyle === 'float');
  stage.matchView.sync(replay.state, rAlpha, delta, []);
  stage.aimMarker.hide();
  stage.landingMarker.hide();
  ctx.camera.position.set(0, 12, 12.5);
  ctx.camera.lookAt(0, 0.6, 0);
  ctx.renderer.render(ctx.scene, ctx.camera);
  ctx.hud.frame(now, delta, 0);
  if (stage.panel) stage.panel.hide();
  if (replay.idx >= replay.steps.length) {
    const wasTape = replay.tape;
    s.replay = null; // 播完回現場
    if (wasTape) {
      if (s.tapeIdx < s.config.tapeClips.length) startTapeClip(s); // 下一卷
      else stage.floatText.show('情蒐結束——比賽開始！', '#ffd166', 1500);
    }
  }
}

// 簡化模式決策窗：進攻選區/發球選區面板＋攔網防守窗；回傳本幀是否放慢時間
function updateDecisions(s, now) {
  if (!s.config.simpleMode) return false;
  const { game, aiState, gates, stage } = s;
  const { controls, panel, rig, sfx, floatText, hints } = stage;
  // W7 C2：受控者不在場上（主角板凳教練視角）——沒有身體可決策，面板收起
  if (!onCourt(game, s.controlledId)) { panel.hide(); return false; }
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
  // ②攔網決策：對方第三擊將至、我在前排；自由模式收面板（全手動讀線），
  // 但慢速窗與攔網第一視角照給——時間留給你自己站位抓時機
  const defendMoment =
    controls.isDefendMoment(game, aiState) &&
    game.ball.vy < 0 && game.ball.y > 2.0;
  rig.setDefendView(defendMoment);
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

  const deciding = attackDeciding || defendMoment; // 攻/防決策窗＝時間放慢
  // 讀攔網 slow 檔：決策窗開了 0.6 秒才上色（讀得慢）；instant 即時；none 恆中性
  if (attackDeciding) {
    if (s.attackDecidingSince < 0) s.attackDecidingSince = now;
  } else {
    s.attackDecidingSince = -1;
  }
  const hintsLive = hints.isOn() && (gates.readTier === 'instant' ||
    (gates.readTier === 'slow' && s.attackDecidingSince >= 0 && now - s.attackDecidingSince > 600));
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
        floatText.show('假動作!');
      },
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
  return deciding;
}

// 固定步長推進：VCR 錄影＋autopilot 代發＋Intent 管線；回傳本幀事件與步數
function stepSim(s) {
  const { stage } = s;
  let simSteps = 0;
  const frameEvents = [];
  while (s.accumulator >= SIM_DT) {
    const game = s.game;
    // 每球開錄：發球佈陣完成、尚未錄過 → 快照當下狀態
    if (game.phase === 'serve' && s.vcrCurrent.snapshot === null) {
      s.vcrCurrent.snapshot = structuredClone({ ...game, events: [] });
    }
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
    const intents = [
      ...stage.controls.collect(game, s.aiState),
      ...aiCollectIntents(game, s.aiState, [s.controlledId]),
    ];
    if (s.vcrCurrent.snapshot) s.vcrCurrent.steps.push({ tick: game.tick, intents });
    const events = stepGame(game, intents);
    frameEvents.push(...events);
    // 死球＝一球結束：本球錄影歸檔、開新錄影
    if (events.some((e) => e.type === 'DEAD_BALL')) {
      s.vcrLast = s.vcrCurrent;
      s.vcrCurrent = { snapshot: null, steps: [] };
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
  stage.sfx.onEvents(frameEvents, { rallyFlights: game.rally.flightId - s.rallyStartFlight });
  stage.controls.onEvents(frameEvents); // 出手成功 → 清出手緩衝
  if (stage.commentary) stage.commentary.onEvents(frameEvents, game, s.aiState, now, s.controlledId);
  // juice：重扣/攔網定格＋震動、死球大震（殺球落地的重量感）
  for (const e of frameEvents) {
    if (e.type === 'SERVE') s.rallyStartFlight = game.rally.flightId;
    // 得分原因面板：追蹤最後觸球（含發球/攔網）；DEAD_BALL+SCORE 湊齊即顯示
    if (e.type === 'TOUCH' || e.type === 'SERVE') {
      s.lastTouch = { team: e.team, playerId: e.playerId, kind: e.kind ?? 'serve', power: e.power };
    } else if (e.type === 'BLOCK_TOUCH') {
      s.lastTouch = { team: e.team, playerId: e.playerId, kind: 'block' };
    }
    if (e.type === 'TOUCH' && e.kind === 'spike') {
      s.hitStopUntil = now + ((e.power ?? 1) >= 0.7 ? 70 : 40);
      if ((e.power ?? 1) >= 0.7) s.slowUntil = now + 450; // 重扣＝定格接慢動作
      s.shake = Math.max(s.shake, 0.12);
    } else if (e.type === 'BLOCK_TOUCH') {
      s.hitStopUntil = now + 60;
      s.shake = Math.max(s.shake, 0.2);
      // 主角攔網個人回饋（07-24 Sawmah）：碰到球當下即字卡（比照 PERFECT 接球卡）——
      // 攔死金色/擦手青色分色；攔死直接得分另有 pointBanner「攔網得分 🧱」收尾
      if (e.playerId === s.controlledId) {
        if (e.graze) cards.push({ pri: 20, text: '👆 擦到了——快補！', color: '#6ee7ff', dur: 1200 });
        else cards.push({ pri: 20, text: '🧱 攔網拍回！', color: '#ffd166', dur: 1200 });
      }
    } else if (e.type === 'BLOCK_DECEIVED' && e.spikerId === s.controlledId) {
      // 主角假動作騙過攔網（07-24）：回饋閉環——按A滑B到底有沒有騙到，從此看得見
      cards.push({ pri: 20, text: '🎭 晃過攔網！', color: '#ffd166', dur: 1100 });
    } else if (e.type === 'DEAD_BALL') {
      s.shake = Math.max(s.shake, 0.26);
      s.pendingDead = { reason: e.reason };
      checkRecruitFeats(s, cards); // W6 壯舉達成字卡（死球節拍增量檢查）
      stage.benchAccelBtn?.forceOff(); // W7 C2③：死球自動恢復原速（拍板）
      // W7 C1②：主角低體力教練建議——每場最多一次，只在主角「仍在場上」時提醒
      // （已經下場就沒什麼好建議的；讓位給體力播報的主角豁免那句話）
      if (!s.staminaAdviceShown && game.stamina && stage.teachDialog &&
          onCourt(game, s.playerId) &&
          (game.stamina[s.playerId] ?? 1) < STAMINA.TIER2_BELOW) {
        s.staminaAdviceShown = true;
        stage.coachOptionDialog?.hide(); // 卡位互斥防呆（同 bottom:26px）
        stage.teachDialog.show([ // TODO(naming)：教練建議台詞佔位，命名工程統一潤稿
          { speaker: '教練', text: `${game.players[s.playerId]?.name ?? ''}，要不要下來喘口氣？板凳準備好了。` },
        ]);
      }
      // W7 B3：對手 AI 暫停判準（死球節拍檢查，成立才喊——被連 4 分＋死球＋有額度）；
      // W7.1：對面集合帶位＋倒數條（同我方一套事實源）＋提示「趁機換人」（換人窗口本來就開著）；
      // AI 對手無教練選項（拍板：維持 sim 現況，B 已有 0.6 慢耗優勢）
      if (aiTimeoutWanted(game, 'B') && applyTimeout(game, { team: 'B' }).ok) {
        s.timeoutHuddleTeam = 'B';
        cards.push({ pri: 25, text: '對方喊暫停——趁機換人 ⚙', color: '#ff9d7a', dur: 1800 });
        stage.commentary?.onEvents(
          [{ type: 'TIMEOUT', tick: game.tick, team: 'B', remaining: game.timeouts.B.remaining }],
          game, s.aiState, now, s.controlledId,
        );
      }
    } else if (e.type === 'MOMENTUM') {
      // W7.1 #4①：滿檔進入一次性字卡（跨進才發、離開再進可重發）
      const spark = enteringMomentumMax(s.prevMomentumValue, e.value, TUNING.MOMENTUM_MAX);
      if (spark === 'A') cards.push({ pri: 22, text: '🔥 氣勢如虹！', color: '#6ee7ff', dur: 1800 });
      else if (spark === 'B') cards.push({ pri: 22, text: '❄ 被壓著打——穩住！', color: '#9fd8ff', dur: 1800 });
      s.prevMomentumValue = e.value;
      // W7.1 #4③：氣勢計變動 delta 指示（條端閃箭頭）
      stage.scoreboard.flashMomentum(e.value);
    } else if (e.type === 'COMEBACK_SPARK') {
      // W7 C3①：⚡ 回歸字卡改吃 sim 單一事實源（subLog 換下→換回→首次建功已在 sim 判完）
      cards.push({
        pri: 45,
        text: `⚡ ${game.players[e.playerId]?.name ?? ''} 回歸即建功！`,
        color: '#ffd166',
        dur: 1500,
      });
      // W7 C3②：觀眾爆聲——沿用既有 cheer 管線再加碼一次（幅度明顯高於一般得分的 DEAD_BALL 自動歡呼）
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
        s.pendingDead = null;
        s.lastTouch = null;
      }
    } else if (e.type === 'TOUCH' && e.kind === 'receive' &&
        e.playerId === s.controlledId && (e.power ?? 0) >= 0.95) {
      cards.push({ pri: 10, text: 'PERFECT!', color: '#60ffa0', dur: 900 }); // 球到瞬間出手的完美一傳
    }
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
  // AI 攻擊手「先跳後揮」：第三擊球下墜接近攻擊手時先播起跳引臂（觸球才揮臂）
  if (game.phase === 'rally' && game.rally.touches === 2 && aiState.claimId &&
      aiState.claimId !== s.controlledId && aiState.flightId !== s.lastWindupFlight) {
    const atk = game.actors[aiState.claimId];
    const b = game.ball;
    if (b.vy < 0 && b.y < 3.6 && Math.hypot(b.x - atk.x, b.z - atk.z) < 2.2) {
      s.lastWindupFlight = aiState.flightId;
      stage.matchView.triggerPose(aiState.claimId, 'windup');
    }
  }
  return myBall;
}

// 局終轉場（一次性）；生涯模式先落檔再顯示——點擊返回前進度已保住
function settleIfOver(s) {
  const { game, stage } = s;
  if (game.phase === 'set_over' && s.prevPhase !== 'set_over') {
    if (s.careerCtx) {
      const { saveOk } = settleCareerMatch({
        careerCtx: s.careerCtx, game, playerId: s.playerId,
        feintsUsed: s.feintsUsedThisMatch,
      });
      if (!saveOk) stage.floatText.show('⚠ 戰績寫入失敗（儲存空間不可用）', '#ff8a8a', 2600);
    }
    stage.setOverOverlay.show(game.match.winner, game.match.score,
      game.players[s.controlledId].teamId, s.careerCtx ? '點擊任意處返回生涯' : undefined);
  }
  s.prevPhase = game.phase;
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

  // 簡化模式：進攻決策——輪到玩家扣球且球還在空中→彈面板、時間放慢給你讀攔網選區
  const deciding = updateDecisions(s, now);

  // 擊球定格（hit-stop）：短暫凍結模擬推進、畫面照跑——打擊的「頓」感
  if (now < s.hitStopUntil) delta = 0;
  // 進攻/防守決策窗＝放慢（時間膨脹只作用推進率，決定論不碰）
  else if (deciding) { delta *= 0.4; s.slowEaseFrom = now; }
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
  stage.rig.update(game, alpha, delta);
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
  const fovTarget = 55 - punchFov - slowFov;
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
