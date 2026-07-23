// 回合迴圈——固定步長累積器（模擬）＋ requestAnimationFrame（畫面，不鎖幀）
// 架構鐵律：模擬（src/sim）只在 while 迴圈裡以 SIM_DT 推進；render 讀插值結果，兩者完全脫鉤
// 本檔持有比賽期間全部逐幀可變狀態（VCR/回放/受控者/juice/決策窗），集中在顯式的
// loop state 物件 `s`——所有函式都吃 s 參數，模組間不共用隱式可變狀態。
// 與賽前準備（matchConfig/matchStage）僅以 config/gates/stage 資料介面銜接，
// 與賽末收束（matchCareer）僅在局終呼叫 settleCareerMatch 一次。
import { SIM_DT, MAX_FRAME_DELTA } from '../sim/constants.js';
import { createGame, stepGame } from '../sim/game.js';
import { createAiState, aiCollectIntents } from '../sim/ai.js';
import { predictLanding } from '../sim/flight.js';
import { landedCourtTeam, isBackRow } from '../sim/rotation.js';
import { serverId } from '../sim/match.js';
import { setPointTeam } from '../ui/scoreboard.js';
import { derivePointInfo } from '../ui/pointBanner.js';
import { settleCareerMatch, careerReturnUrl } from './matchCareer.js';
import { upcomingTeach } from '../career/events.js';
import { TECH_DEFS } from '../career/growth.js';

const REPLAY_TAIL = 180;   // 回放最後 180 tick（3 秒）
const REPLAY_SPEED = 0.5;  // 半速
const TAPE_TAIL = 240;     // 情蒐錄影帶：尾段 4 秒、略快於一般回放

export function startMatchLoop({ ctx, config, gates, stage, careerCtx, playerId, game, aiState }) {
  const s = createLoopState({ ctx, config, gates, stage, careerCtx, playerId, game, aiState });
  bindInputHandlers(s);
  // 偵錯把手：供自動化測試與真機除錯檢視執行期狀態（不參與遊戲邏輯）
  window.__phase1 = {
    game: s.game, aiState: s.aiState,
    renderer: s.ctx.renderer, scene: s.ctx.scene, camera: s.ctx.camera,
    quality: s.ctx.quality, rig: s.stage.rig,
    vcr: () => s.vcrLast,             // 上一球的回放資料
    controlled: () => s.controlledId, // 當前受控球員（輪控除錯）
    tapeCount: s.config.tapeClips.length, // 情蒐錄影帶卷數（測試用）
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
    last: performance.now(),
    accumulator: 0,
    rafFn: null,
  };
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
    s.game = createGame({ seed: s.seed, setTarget: config.setTarget });
    s.aiState = createAiState();
    s.controlledId = s.playerId;
    s.switchKey = '';
    s.replay = null;
    s.vcrLast = null; // 換局清回放資料，避免新局第一分前播到上一局最後一球
    s.vcrCurrent = { snapshot: null, steps: [] };
    s.servedThisTurn = false;
    stage.setOverOverlay.hide();
    if (stage.panel) stage.panel.hide();
    stage.controls.setPlayerId(s.playerId);
    stage.rig.setPlayerId(s.playerId);
    stage.matchView.setControlled(s.playerId);
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
  // 魚躍：按鈕（stage 注入點）＋桌機 L 鍵；簡化模式 Space（蓄力已讓位）
  stage.handlers.replay = () => startReplay(s);
  stage.handlers.dive = () => { if (s.diveReady) stage.controls.diveNow(s.game); };
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
  s.stage.teachDialog.show([ // TODO(naming)：教練台詞佔位，命名工程統一潤稿
    { speaker: '教練', text: `情蒐筆記看了嗎？${opp}的「${names}」很有名——帶子裡就有，盯緊了。` },
    { speaker: '教練', text: '打完這場，把它偷學回來。' },
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
  ctx.ballView.sync(replay.state.ball, rAlpha, delta);
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
function applyEvents(s, frameEvents, now) {
  const { game, stage } = s;
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
    } else if (e.type === 'DEAD_BALL') {
      s.shake = Math.max(s.shake, 0.26);
      s.pendingDead = { reason: e.reason };
    } else if (e.type === 'SCORE') {
      // 得分慶祝：全員高舉小跳＋鏡頭 FOV punch（推近再彈回）
      s.fovPunchUntil = now + 700;
      for (const id of game.match.rotations[e.team]) {
        stage.matchView.triggerPose(id, 'cheer');
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
      stage.floatText.show('PERFECT!'); // 球到瞬間出手的完美一傳
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

// 魚躍鈕可用性（拍板 07-23 Sawmah：常駐可按、按下即撲——賭注交還玩家）：
// diveReady＝可觸發＝rally 中、未倒地、非回放（不再要求球落在可及範圍——撲對了救球、
// 撲空由 sim 結算倒地，天然懲罰即濫用防護）。原「球正往我方可及範圍落」判定降為純視覺
// 提示 diveHint（脈動放大告訴玩家「機會來了」），不再閘住觸發。
function updateDiveButton(s) {
  if (!s.gates.canDive) return;
  const { game, aiState, stage } = s;
  const meActor = game.actors[s.controlledId];
  const landing = aiState?.landing;
  s.diveReady = game.phase === 'rally' && !s.replay && game.tick >= meActor.divedUntil;
  // 純提示：來球落我方半場、下墜、落點在外撲救範圍——鈕強調脈動，但不是按下前提
  let hint = false;
  if (s.diveReady && landing && aiState.landingTeam === game.players[s.controlledId].teamId
    && game.ball.vy < 0) {
    const d = Math.hypot(landing.x - meActor.x, landing.z - meActor.z);
    hint = d > 1.1 && d <= 3.4;
  }
  stage.diveBtn.setVisible(s.config.simpleMode && game.phase !== 'set_over' && !s.replay);
  stage.diveBtn.setReady(s.diveReady, hint);
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

  s.accumulator += delta;
  const { frameEvents, simSteps } = stepSim(s);
  if (frameEvents.length > 0) applyEvents(s, frameEvents, now);

  const myBall = updateAssistAndPoses(s);
  const game = s.game;

  const alpha = s.accumulator / SIM_DT;
  ctx.ballView.sync(game.ball, alpha, delta);
  const netHitPower = ctx.court.update(delta, game.ball); // 網面受擊波動（純視覺）
  if (netHitPower > 0) stage.sfx.netHit(netHitPower);
  stage.matchView.sync(game, alpha, delta, frameEvents);
  stage.rig.setSpikeMine(s.aiState?.claimId === s.controlledId); // 扣球一人稱只認「舉給我」
  stage.rig.update(game, alpha, delta);
  // 局點張力：燈光收攏＋心跳（deuce 內建於 setPointTeam 判定）
  const tension = game.phase !== 'set_over' && setPointTeam(game) !== null;
  ctx.lights.setTension(tension, delta);
  stage.sfx.setHeartbeat(tension);
  stage.sfx.setCrowdLevel(tension && game.phase === 'serve' ? 0.016 : 0.05); // 局點發球前屏息
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
  updateDiveButton(s);
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
