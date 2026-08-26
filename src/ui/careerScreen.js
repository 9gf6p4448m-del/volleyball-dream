// Phase 2 生涯畫面：主選單（繼續/新生涯/快速比賽/匯出匯入）＋賽程視圖（地區賽小組）
// 夜賽同色系；動態文字一律 textContent（匯入的存檔名字不可信，不走 innerHTML）
import {
  createCareer, createCareerPlayer, nextMatch, careerRecord, opponentName,
  careerStage, seasonConcluded, opponentById, normalizeCareerPlayer, resolveForfeit,
  applyPoaching,
  applySeasonRoster, graduatingAces, currentGrade, nationalGroupTable, matchOpponentDef,
  leagueScoutZones, scoutFocusZone, SCOUT_ZONE_LABEL, weakestReceiverIdOf,
} from '../career/careerState.js';
import {
  GROWTH, GROWABLE_ATTRS, TECH_DEFS, spendAttribute, attrCapFor,
} from '../career/growth.js';
import {
  ensureStarterRoster, rosterCount, openSlots, totalGains, ROLE_ABBR, ROSTER_GROWTH,
  OUR_TEAM_NAME,
} from '../career/roster.js';
import {
  validateLineup, checkRotationOrder, checkRoleStructure, defaultLineup, trustOf,
  effectiveOrder,
} from '../career/lineup.js';
import {
  RECRUIT_CONDS, RECRUIT_TRUST, progressOf, conditionMet, settleRecruitJoins,
  recruitCurrentGrade, recruitTargetGone, waitingOf,
  altFeatsOf, altFeatAvailableTo, altFeatRoleOf,
} from '../career/recruitment.js';
import {
  dueEvents, recordEvent, oldTeamPreEvents, EXPEL_LINES, SEASON_OPENERS,
  graduationCeremonySegments, freshmenIntroLines, walkOnIntroLines,
  resolveEventsForRoster, resolveEventsForRole, isOnceEvent, heightGuidanceEventFor,
} from '../career/events.js';
import { aceGrowthAt } from '../career/aceGrowth.js';
import { clampHeightCm, heightSettled } from '../career/heightGrowth.js';
import {
  adviceFor, coachAdviceLines, aspirationReplyLines, bandShiftLines, roleLabel,
} from '../career/heightAdvice.js';
import { showHeightRitual } from './heightRitual.js';
import { showGraduationRitual } from './graduationRitual.js';
import { showTrainingCamp } from './trainingCamp.js';
import {
  chemistryPairsOf, isCampPending, clearCampPending, departedMatesOf,
} from '../career/trainingCamp.js';
import {
  drillsFor, recentTechniquesOf,
  tutorialDrills, tutorialInviteDue, TUTORIAL_INVITE_EVENT_ID,
} from '../career/practiceMatch.js';
import {
  positionTalkFor, transferCandidates, transferAskLines, transferTalkFor,
  interSeasonTalkAllowed, TRANSFER_ASKED_EV, TRANSFER_USED_EV,
} from '../career/positionEvents.js';
import { dueMentorLines } from '../career/mentor.js';
import { rivalPreEvents, rivalPostEvents, rivalSpectatorEvents } from '../career/rivalArc.js';
import { n2OpeningLines, n2PostEvents, n2FinaleEvents } from '../career/n2Arc.js';
import { archiveSeasonSummary } from '../career/careerStore.js';
import {
  uniGraduationLines, uniFreshmenIntroLines, uniFinaleFarewellLines, UNI_FINALE_CLOSING,
} from '../career/uniGraduation.js';
import { uniSeasonTurnover } from '../career/uniTurnover.js';
import {
  finaleFarewellLines, finaleRitualSegments, buildFinaleSummary, NEXT_CHAPTER_LINES,
} from '../career/careerFinale.js';
import { readSlotHeads } from '../career/saveSlots.js';
import { groupPool, RR_PLAYER_ID, RR_ADVANCE } from '../career/schedule.js';
import { updateTrust } from '../sim/trust.js';
// 情報層（2026-08-07）：攔網人格的中文語彙——與 BLOCK_PERSONA 同處，不另立第二份
import { BLOCK_PERSONA, BLOCK_PERSONA_INTEL } from '../sim/blockRead.js';
import { createRecruitPortrait, pickJoinLine } from '../render/recruitPortrait.js';
import { createBeatStage } from '../render/beatStage.js';
import {
  loadPresentationPref, savePresentationPref, createBeatTimeline, driveTimeline,
} from './presentation.js';
import { createRitualStage } from '../render/ritualStage.js';
import { createVaultCard, openReplayViewer } from './replayVault.js';
import { createChaseDiagram } from './chaseDiagram.js';
import { showHowToPlay } from './howToPlay.js';
import {
  isHighSchool, isCorporate, isPro, chapterSeasonOf, currentTeamName,
} from '../career/chapter.js';
import { bestFinishOf, seasonFinishOf, FINISH_LABEL, TIER } from '../career/admission.js';
import {
  universityById, admissibleSchoolsFor, alumniPlacementsFor, TIER_LABEL,
} from '../career/universities.js';
import { uniTable, UNI_PLAYER_ID } from '../career/uniSchedule.js';
import { CORPORATIONS, CORP_TIER_LABEL, corporationById } from '../career/corporations.js';
import { corpTable, CORP_PLAYER_ID } from '../career/corpSchedule.js';
import {
  CORP_CONTRACT_LINES, CORP_PAYDAY_CARD, corpPaydayDue, corpAnchorPreEvents, corpClosingLines,
  corpShakeOffEvents,
} from '../career/corpEvents.js';
// 職業章批 2（2026-08-26）：入章接線——資料層批 1 已鋪好
import { PRO_TIER_LABEL, proTeamById } from '../career/proTeams.js';
// 職業章批 3：名次表／季後賽場次顯示（proSchedule.js 批 1 的純函式＋批 3 的 round 標記）
import {
  proTable, PRO_PLAYER_ID, PLAYOFF_ROUND, growProSchedule,
} from '../career/proSchedule.js';
// 職業章批 5（2026-08-26）：敘事層——合約卡／王勝翔宿敵線／收尾點名（同構 corpEvents.js）
import { PRO_CONTRACT_LINES, proWangRivalPreEvents, proClosingLines } from '../career/proEvents.js';
import {
  kitFor, cssColor, opponentAccentColor, OUR_ANCHORS,
} from '../career/teamKit.js';

// 隊友卡屬性標籤：可成長六項沿用 GROWABLE_ATTRS 名稱＋兩項不開放者
// ★ 2026-08-09 Sawmah 裁定「耐力／控球」★ 這兩項原本在此寫「體力／控制」，而集訓面板
// （屆間養成卷）與 events.js 的訓練營台詞寫「耐力／控球」——同一個屬性兩種叫法。
// 統一到後者。注意**不含**比賽中的 HUD「體力條」與播報的「體力」：那是逐球消耗的
// 即時計量，與這裡的屬性（它的基準值）是兩件事，不是同名分岔。
const ATTR_LABELS = {
  ...Object.fromEntries(GROWABLE_ATTRS.map((a) => [a.key, a.name])),
  control: '控球', stamina: '耐力',
};
const GROWABLE_KEYS = new Set(GROWABLE_ATTRS.map((a) => a.key));
const GRADE_LABEL = { 1: '一年級', 2: '二年級', 3: '三年級' };
// 企業章批 3：corp 成員的 growth.grade＝在隊年資（corporations.js 檔頭），
// 不是會畢業的年級——照 GRADE_LABEL 畫會把年資 3 寫成「三年級」、年資 8 變空白。
// 判準用成員自己的 origin（corp: 前綴），不用全域章節——名冊混章不可能，但
// per-member 判準連手改存檔都不會畫錯。
const memberGradeLabel = (member) => (String(member?.origin ?? '').startsWith('corp:')
  ? `年資 ${member?.growth?.grade ?? '?'} 年`
  : GRADE_LABEL[member?.growth?.grade] ?? '');

const COLOR = {
  bg: 'linear-gradient(180deg, #070a12 0%, #0b1120 55%, #070a12 100%)',
  text: '#eef2fa',
  dim: '#9fb0cc',
  gold: '#ffd166',
  red: '#ff8a8a',
  cyan: '#6ee7ff',
  card: 'rgba(18,24,40,0.85)',
};

// prefers-reduced-motion 動態查詢（不快取——尊重使用者中途切換系統設定）
function reduceMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

// W7 開卡儀式：短促入隊 fanfare（WebAudio 三音上行，零音檔慣例同 sfx.js）；
// 靜音失敗不得炸演出——AudioContext 可能未經手勢解鎖或瀏覽器不支援
function playRecruitFanfare() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const notes = [523.25, 659.25, 783.99]; // C5→E5→G5 上行三音，開箱的「叮咚噹」
    for (let i = 0; i < notes.length; i += 1) {
      const t = ctx.currentTime + i * 0.09;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(notes[i], t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.34);
    }
    setTimeout(() => { try { ctx.close(); } catch { /* 已關閉或不支援，忽略 */ } }, 900);
  } catch {
    // 靜音失敗不得炸——開卡演出照常進行
  }
}

// 屬性數值 count-up（0→target，短促；delayMs 對齊逐項 stagger）——純文字動畫，
// WAAPI 無法插值 textContent，改手動 rAF；node 已存在才驅動（卡片可能已被 dispose 掉）
function countUp(node, target, delayMs, durMs = 320) {
  const startAt = performance.now() + delayMs;
  function step(now) {
    if (!node.isConnected) return; // 卡片已關閉/換下一張——停止
    if (now < startAt) { requestAnimationFrame(step); return; }
    const t = Math.min((now - startAt) / durMs, 1);
    node.textContent = String(Math.round(target * t));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// 升學畫面的抬頭句。★抽成常數是為了讓它吃得到 B7-8 的判準★——覆審指出
// 這一句原本內嵌在 DOM 建構裡，tests/ 全域 grep 不到，等於零覆蓋。
// 內容受 uni-teach.test.mjs 的「不得承諾技術快慢」黑名單約束（批 7 拍板 4：
// 技術軸各校打平，代價只剩球權與戰績兩軸）。
export const ADMISSION_COST_LINE = '代價都寫在卡片上了——強的隊伍不會把球給你，弱的隊伍陪你贏不到什麼。想清楚再選。';

export function createCareerScreen(store, { onPlay, onQuick, primeSlot, onPractice = null }) {
  const root = el('div', [
    'position:fixed', 'inset:0', 'z-index:30', 'display:none',
    // safe center：內容高於視窗時退化為 flex-start——修手機頂部被裁切、捲不到
    // 的經典陷阱（center＋overflow 會把上緣裁掉）；不支援 safe 的瀏覽器整條
    // 宣告失效＝flex-start，同樣不裁切
    'flex-direction:column', 'align-items:center', 'justify-content:safe center',
    'gap:14px', `background:${COLOR.bg}`, `color:${COLOR.text}`,
    'font-family:system-ui,sans-serif', 'user-select:none', 'overflow-y:auto',
    'padding:calc(env(safe-area-inset-top, 0px) + 24px) 20px 40px',
  ]);
  document.body.appendChild(root);

  const msgEl = el('div', [
    'min-height:20px', 'font-size:14px', `color:${COLOR.red}`, 'text-align:center',
  ]);
  const setMsg = (text) => { msgEl.textContent = text ?? ''; };

  // 配色卷階段二 E4：動態隊名單一入口——高中章恆 OUR_TEAM_NAME、大學章＝入學校名。
  // 呼叫端一律經這個函式取，不得自行判斷章節（v2 裁定二前提，同
  // isHighSchool(store.loadChapter?.()) 慣例）
  const teamName = () => currentTeamName(
    store.loadChapter?.(), store.loadSchool?.(), store.loadCorp?.(), store.loadPro?.(),
  );

  // 隊伍配色卷批 3（B2 對陣色條／B4 beatStage 共用單一入口）：我方現在實際穿的
  // kit——大學章已選校時走該校 kit（與 careerState.js:747 kits.A 同一組函式
  // kitFor/universityById/store.loadSchool()，不得另抄一份色值），其餘（含高中章、
  // 大學未選校）回傳 null——B2 消費端回落 teamKit.js 的 OUR_ANCHORS.jersey、
  // B4 消費端（beatStage resolveKit）回落現行硬編碼 TEAM_KIT.A，兩份錨定值本就同步
  const ourSchoolKit = () => {
    // 職業章批 2（B4 分母清單第 4 項）：入職業隊後穿的是球隊 kit，優先序在 corp 之前
    // （現在的章）——同 careerMatchSetup 的 proKit ?? corpKit ?? uniSchoolKit 慣例。
    const pro = store.loadPro?.() ?? null;
    if (pro) return kitFor(proTeamById(pro));
    // 企業章批 2 覆審 MEDIUM 修：簽約後穿的是公司 kit，不是舊大學的
    const corp = store.loadCorp?.() ?? null;
    if (corp) return kitFor(corporationById(corp));
    const school = store.loadSchool?.() ?? null;
    return school ? kitFor(universityById(school)) : null;
  };

  // 集訓覆蓋層是否已開（覆審 HIGH-1 的中斷復原有兩個呼叫端，防重入疊兩層）
  let campOpen = false;
  // 企業章批 4 覆審 MEDIUM 修：薪水卡的重入守衛——同 campOpen 教訓（本檔 207 行
  // 一帶：疊兩張卡的話下面那張永遠按不到）。旗標未落地前任何重繪都不得再彈一張。
  let corpPaydayOpen = false;
  // 教學局邀請卡是否已開（同一道防重入：renderCareer 可能被別的路徑再叫一次，
  // 疊兩張卡的話下面那張永遠按不到——campOpen 的教訓）
  let tutorialInviteOpen = false;

  // 匯入用隱藏檔案選擇器（共用於兩個視圖）
  const fileInput = el('input', ['display:none']);
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      store.importSave(await file.text());
      renderCareer();
    } catch (err) {
      setMsg(`匯入失敗：${err.message ?? err}`);
    }
  });
  document.body.appendChild(fileInput);

  // ---- stage 4 劇情對話框（輕量：文字、無立繪；點擊逐句推進）----
  const dlg = el('div', [
    'position:fixed', 'inset:0', 'z-index:34', 'display:none',
    'background:rgba(4,6,12,0.5)', 'flex-direction:column', 'align-items:center',
    'justify-content:flex-end', 'gap:12px',
    'padding-bottom:calc(env(safe-area-inset-bottom, 0px) + 26px)',
  ]);
  const dlgCard = el('div', [
    'width:min(480px, 92vw)', `background:${COLOR.card}`, 'border-radius:16px',
    'border:1px solid #2c3a58', 'padding:16px 20px', 'cursor:pointer',
    'box-shadow:0 12px 40px rgba(0,0,0,0.6)',
  ]);
  const dlgSpeaker = el('div', [
    'font-size:13px', 'font-weight:800', `color:${COLOR.gold}`, 'letter-spacing:2px',
  ]);
  const dlgText = el('div', [
    'font-size:15px', `color:${COLOR.text}`, 'line-height:1.6', 'margin-top:6px',
    'text-align:left', 'min-height:44px',
  ]);
  const dlgHint = el('div', [
    'font-size:11px', `color:${COLOR.dim}`, 'text-align:right', 'margin-top:8px',
  ], '▼ 點擊繼續');
  dlgCard.appendChild(dlgSpeaker);
  dlgCard.appendChild(dlgText);
  dlgCard.appendChild(dlgHint);
  dlg.appendChild(dlgCard);
  document.body.appendChild(dlg);

  let dlgState = null; // { queue:[{speaker,text,cam,camOpts}], onDone }
  // 4.5B §2：beat 舞台（事件宣告 camera 模板時掛在對話卡上方；同模板跨句沿用）
  let dlgStage = null; // { stage, sig }
  function dlgStageSync(line) {
    // 4.6 §6：line 級 `diagram` 宣告＝靜態示意圖層（不吃重演引擎、不建 WebGL）——
    // 事件二的敘事點是「位置讓出來了」，給的是空間不是動作。靜圖無動畫，
    // reduced-motion 下照給（它本來就不動）
    const dSig = line?.diagram ? `diagram|${line.diagram}` : null;
    const sig = dSig ?? (line?.cam ? `${line.cam}|${JSON.stringify(line.camOpts ?? null)}` : null);
    if (dlgStage?.sig === sig) return;
    if (dlgStage) { dlgStage.stage.dispose(); dlgStage.stage.el.remove(); dlgStage = null; }
    if (!sig) return;
    if (dSig) {
      const svg = createChaseDiagram({ variant: line.diagram, subjectName: line.diagramSubject ?? '小白' });
      dlg.insertBefore(svg, dlgCard);
      dlgStage = { sig, stage: { el: svg, dispose() {} } };
      return;
    }
    if (reduceMotion()) return;
    try {
      // B4：我方 beat subjects 恆穿我方現在的 kit（章節感知）——kitA 為 null 時
      // （高中章／大學未選校）整段 spread 是 no-op，opts 與現行完全相同
      const kitA = ourSchoolKit();
      const opts = { ...(line.camOpts ?? {}), ...(kitA ? { kitA } : {}) };
      const stage = createBeatStage({ template: line.cam, opts });
      dlg.insertBefore(stage.el, dlgCard);
      dlgStage = { stage, sig };
    } catch { dlgStage = null; /* WebGL 失敗＝退化純對話卡（ritualStage 慣例） */ }
  }
  function dialogPlay(events, onDone) {
    // camera 宣告兩層：line 級（劇情段落內換鏡位——幕三坦白/馬振羽句）優先於事件級
    const queue = events.flatMap((e) => e.lines.map((line) => ({
      ...line,
      cam: line.cam ?? e.camera ?? null,
      camOpts: line.camOpts ?? e.cameraOpts ?? null,
    })));
    if (!queue.length) { onDone(); return; }
    dlgState = { queue, onDone };
    dlg.style.display = 'flex';
    paintLine();
  }
  function paintLine() {
    const line = dlgState.queue[0];
    dlgSpeaker.textContent = line.speaker;
    dlgText.textContent = line.text;
    dlgStageSync(line);
  }
  dlg.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (!dlgState) return;
    dlgState.queue.shift();
    if (dlgState.queue.length) { paintLine(); return; }
    dlgStageSync(null);
    dlg.style.display = 'none';
    const done = dlgState.onDone;
    dlgState = null;
    done();
  });

  // ---- W6 A2 指定邀請：進入下一屆前選 1 隊必入小組（或交給輪抽）----
  // 屆初公開＝選完即抽、賽程視圖直接亮結果（邀請場帶 ⭐ 徽章）
  function showInvitePicker(onPick) {
    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:36', 'display:flex',
      'background:rgba(4,6,12,0.72)', 'flex-direction:column',
      'align-items:center', 'justify-content:safe center', 'overflow-y:auto',
      'padding:24px 16px',
    ]);
    const card = el('div', [
      `background:${COLOR.card}`, 'border-radius:16px', 'border:1px solid #2c3a58',
      'padding:18px 20px', 'width:min(360px, 92vw)', 'display:flex',
      'flex-direction:column', 'gap:8px', 'align-items:stretch',
    ]);
    card.appendChild(el('div', [
      'font-size:17px', 'font-weight:800', `color:${COLOR.text}`, 'letter-spacing:1px',
    ], '📮 指定邀請'));
    card.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`, 'line-height:1.6'],
      '每屆可指定 1 隊必入小組賽程，其餘場次由屆間輪抽決定——想刷誰的招募條件、想找誰復仇，自己請。'));
    const pick = (id) => { overlay.remove(); onPick(id); };
    for (const id of groupPool()) {
      const def = opponentById(id);
      card.appendChild(button(`${def.name}（強度 ${def.level}）`, false, () => pick(id)));
    }
    card.appendChild(button('不指定——全交給輪抽', true, () => pick(null)));
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  // ---- 教學局（2026-08-12）：入隊第一天的隊內測試邀請卡 ----
  // 真人回饋的原點：「新手第一次操作練習的賭注就是真比賽」（第一場 group-1 中途離開
  // 記棄賽敗）。這張卡把那個賭注拆掉：先打一場什麼都不賠的隊內測試。
  //
  // ★ 可跳過 ★ 二週目／老玩家按「我打過了」直接進生涯畫面（kickoff 題 4）。
  // ★ 兩顆鈕都當場入帳旗標 ★ 教學局零獎勵、打到一半離開什麼都不會丟，所以「做了決定」
  //   就是終局；等打完才入帳的話，中途離開會讓這張卡在每次回生涯畫面時再彈一次。
  function showTutorialInvite(career, player) {
    tutorialInviteOpen = true;
    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:36', 'display:flex',
      'background:rgba(4,6,12,0.82)', 'flex-direction:column',
      'align-items:center', 'justify-content:safe center', 'overflow-y:auto',
      'padding:24px 16px',
    ]);
    overlay.addEventListener('pointerdown', (e) => e.stopPropagation());
    const card = el('div', [
      `background:${COLOR.card}`, 'border-radius:16px', 'border:1px solid #2c3a58',
      'padding:18px 20px', 'width:min(360px, 92vw)', 'display:flex',
      'flex-direction:column', 'gap:10px', 'align-items:stretch',
    ]);
    card.appendChild(el('div', [
      'font-size:17px', 'font-weight:800', `color:${COLOR.text}`, 'letter-spacing:1px',
    ], '🏐 隊內測試'));
    card.appendChild(el('div', ['font-size:14px', `color:${COLOR.gold}`, 'line-height:1.7'],
      '教練：入隊第一天——先看看你的底子。'));
    card.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`, 'line-height:1.7'],
      '紅白分隊打一場，我會一步一步喊你做：接球、送球、攔網、發球、三擊組織、拿下一分。'
      + '六件事做完就收工——不記戰績、不算勝負，做壞了也不會扣你任何東西。'));
    // ★ 決定與旗標同一次寫檔 ★ 分兩筆寫的話，中間被殺會留下「已經打過但旗標沒落」
    // ＝下次重開再邀請一次（campPending 那條 RMW 紀律的同一個理由）
    const decide = (start) => {
      overlay.remove();
      tutorialInviteOpen = false;
      const marked = recordEvent(store.loadCareer() ?? career, TUTORIAL_INVITE_EVENT_ID);
      if (!store.saveCareer(marked)) {
        // 寫失敗＝旗標沒落＝下次重開會再問一次（寧可再問，不要靜默吞掉這場教學）
        setMsg('⚠ 存檔寫入失敗——隊內測試的紀錄可能未保存');
      }
      if (!start) { renderCareer(); return; }
      hide();
      onPractice({
        career: marked,
        player,
        drills: tutorialDrills(),
        seasonIndex: 1,
        tutorial: true,
      });
    };
    card.appendChild(button('▶ 開始', true, () => decide(true)));
    card.appendChild(button('我打過了，跳過', false, () => decide(false)));
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  // ---- W3(P4) 07-27 快速比賽選位置（位置遊樂場）：五位置任選直接開打——
  // 生涯轉位 gate 不動；玩法試駕入口（S 分配/MB 讀心/L 指揮不用打生涯也吃得到）----
  function showQuickRolePicker() {
    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:36', 'display:flex',
      'background:rgba(4,6,12,0.72)', 'flex-direction:column',
      'align-items:center', 'justify-content:safe center', 'overflow-y:auto',
      'padding:24px 16px',
    ]);
    const card = el('div', [
      `background:${COLOR.card}`, 'border-radius:16px', 'border:1px solid #2c3a58',
      'padding:18px 20px', 'width:min(360px, 92vw)', 'display:flex',
      'flex-direction:column', 'gap:8px', 'align-items:stretch',
    ]);
    card.appendChild(el('div', [
      'font-size:17px', 'font-weight:800', `color:${COLOR.text}`, 'letter-spacing:1px',
    ], '🏐 快速比賽——選位置'));
    card.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`, 'line-height:1.6'],
      '每個位置有自己的玩法：S 分配決策、MB 讀舉球、L 防守指揮。快速比賽隨便試——生涯裡要靠教練談話轉位。'));
    const pick = (role) => { overlay.remove(); hide(); onQuick(role); };
    card.appendChild(button(`${roleLabel('outside')}——現況出道位`, true, () => pick(null)));
    for (const role of ['setter', 'middle', 'opposite', 'libero']) {
      card.appendChild(button(roleLabel(role), false, () => pick(role)));
    }
    card.appendChild(button('取消', false, () => overlay.remove()));
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  // ---- W3(P4) 轉位事件（教練談話）：屆間鏈尾端觸發——旗標 open（Sawmah 手批）
  // 才會有談話；縫隙 3 志願優先；接受＝careerStore.applyPositionChange（單次 RMW：
  // currentRole＋缺額補位員＋預設陣重排）→ 被取代者劇情（縫隙 1，名冊解版本）。
  // 婉拒＝本屆不轉，下屆間教練再問（門一直開著）----
  function maybePositionTalk(onDone) {
    const talkPlayer = store.loadPlayer?.();
    const members = store.loadRoster?.()?.members ?? [];
    const talk = positionTalkFor({
      flags: store.loadPositionFlags?.() ?? {},
      player: talkPlayer,
      members,
    });
    if (!talk) { onDone(); return; }
    dialogPlay([{ lines: talk.offerLines }], () => {
      const overlay = el('div', [
        'position:fixed', 'inset:0', 'z-index:36', 'display:flex',
        'background:rgba(4,6,12,0.72)', 'flex-direction:column',
        'align-items:center', 'justify-content:safe center', 'overflow-y:auto',
        'padding:24px 16px',
      ]);
      const card = el('div', [
        `background:${COLOR.card}`, 'border-radius:16px', 'border:1px solid #2c3a58',
        'padding:18px 20px', 'width:min(360px, 92vw)', 'display:flex',
        'flex-direction:column', 'gap:8px', 'align-items:stretch',
      ]);
      card.appendChild(el('div', [
        'font-size:17px', 'font-weight:800', `color:${COLOR.text}`, 'letter-spacing:1px',
      ], '🔁 教練談話——轉位'));
      card.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`, 'line-height:1.6'],
        // 「讓出的主攻位」是 OH 單向轉出時代的寫法——轉過一次之後你讓出的就不是主攻位了，
        // 08-10 開放回任 OH 後更會講反（回任是把主攻位要回來）。改成不預設你現在站哪
        `轉任${roleLabel(talk.role)}：位置玩法即刻生效，你原本的位置由隊上補位。婉拒不扣任何東西——下一個屆間教練會再問。`));
      card.appendChild(button(`✓ 接受——轉任${roleLabel(talk.role)}`, true, () => {
        overlay.remove();
        if (store.applyPositionChange?.(talk.role)) {
          dialogPlay([{ lines: talk.acceptLines }], onDone);
        } else {
          onDone();
        }
      }));
      card.appendChild(button('留在現在的位置', false, () => {
        overlay.remove();
        dialogPlay([{ lines: talk.declineLines }], onDone);
      }));
      overlay.appendChild(card);
      document.body.appendChild(overlay);
    });
  }

  // ---- W4(P4) 題1 賽季中請調（「去找教練」對話事件；gate＝transferCandidates）----
  // 流程：教練反問（依表現分版）→ 選目標位置（此階段退出＝不耗機會——話還沒說出口）
  // → 教練回應（志願分版）→ 接受（記 asked+used、applyPositionChange、生效下一場）
  // ／婉拒（記 asked——入口當屆收起；屆間談話因未 used 仍會來問）
  function showTransferTalk(career, player, roles) {
    dialogPlay([{ lines: transferAskLines(career) }], () => {
      const overlay = el('div', [
        'position:fixed', 'inset:0', 'z-index:36', 'display:flex',
        'background:rgba(4,6,12,0.72)', 'flex-direction:column',
        'align-items:center', 'justify-content:safe center', 'overflow-y:auto',
        'padding:24px 16px',
      ]);
      const card = el('div', [
        `background:${COLOR.card}`, 'border-radius:16px', 'border:1px solid #2c3a58',
        'padding:18px 20px', 'width:min(360px, 92vw)', 'display:flex',
        'flex-direction:column', 'gap:8px', 'align-items:stretch',
      ]);
      card.appendChild(el('div', [
        'font-size:17px', 'font-weight:800', `color:${COLOR.text}`, 'letter-spacing:1px',
      ], '🚪 請調——你想去哪個位置'));
      card.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`, 'line-height:1.6'],
        '每屆只有一次轉位機會（賽季中請調或屆間教練談話，二選一）；轉位下一場生效。'));
      const markEvents = (ids) => {
        let c = store.loadCareer() ?? career;
        for (const id of ids) c = recordEvent(c, id);
        store.saveCareer(c);
      };
      for (const role of roles) {
        card.appendChild(button(roleLabel(role), false, () => {
          overlay.remove();
          const members = store.loadRoster?.()?.members ?? [];
          const talk = transferTalkFor({ role, player, members });
          dialogPlay([{ lines: talk.offerLines }], () => {
            const confirm = el('div', [
              'position:fixed', 'inset:0', 'z-index:36', 'display:flex',
              'background:rgba(4,6,12,0.72)', 'flex-direction:column',
              'align-items:center', 'justify-content:safe center', 'padding:24px 16px',
            ]);
            const cc = el('div', [
              `background:${COLOR.card}`, 'border-radius:16px', 'border:1px solid #2c3a58',
              'padding:18px 20px', 'width:min(360px, 92vw)', 'display:flex',
              'flex-direction:column', 'gap:8px', 'align-items:stretch',
            ]);
            cc.appendChild(button(`✓ 轉任${roleLabel(role)}——下一場生效`, true, () => {
              confirm.remove();
              markEvents([TRANSFER_ASKED_EV, TRANSFER_USED_EV]);
              if (store.applyPositionChange?.(role)) {
                dialogPlay([{ lines: talk.acceptLines }], () => renderCareer());
              } else {
                renderCareer();
              }
            }));
            cc.appendChild(button('……再想想', false, () => {
              confirm.remove();
              markEvents([TRANSFER_ASKED_EV]);
              dialogPlay([{ lines: talk.declineLines }], () => renderCareer());
            }));
            confirm.appendChild(cc);
            document.body.appendChild(confirm);
          });
        }));
      }
      card.appendChild(button('……還是算了（先回去練球）', false, () => overlay.remove()));
      overlay.appendChild(card);
      document.body.appendChild(overlay);
    });
  }

  // ---- W2(P4) 志願登記（憲法 Q7）：教練面談後全位置自由選（可無視建議）；
  // 一律 OH 出道——志願只落 save.player.aspiration，轉位事件＝W3 ----
  function showAspirationPicker(cm, onPick) {
    const adv = adviceFor(cm);
    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:36', 'display:flex',
      'background:rgba(4,6,12,0.72)', 'flex-direction:column',
      'align-items:center', 'justify-content:safe center', 'overflow-y:auto',
      'padding:24px 16px',
    ]);
    const card = el('div', [
      `background:${COLOR.card}`, 'border-radius:16px', 'border:1px solid #2c3a58',
      'padding:18px 20px', 'width:min(360px, 92vw)', 'display:flex',
      'flex-direction:column', 'gap:8px', 'align-items:stretch',
    ]);
    card.appendChild(el('div', [
      'font-size:17px', 'font-weight:800', `color:${COLOR.text}`, 'letter-spacing:1px',
    ], '📋 志願登記'));
    card.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`, 'line-height:1.6'],
      '路是你自己選的——志願全位置自由填，教練的建議只是建議。一年級一律從主攻手出發。'));
    for (const role of ['outside', 'setter', 'middle', 'opposite', 'libero']) {
      const tag = adv.primary.includes(role) ? '★ 教練建議'
        : adv.secondary === role ? '☆ 次選' : '';
      card.appendChild(button(
        `${roleLabel(role)}${tag ? `——${tag}` : ''}`,
        adv.primary.includes(role),
        () => { overlay.remove(); onPick(role); },
      ));
    }
    card.appendChild(button('再想想——返回', false, () => overlay.remove()));
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  // ---- W2 隊友卡（唯讀）：點名冊列開卡檢視；無任何寫入互動 ----
  const cardOverlay = el('div', [
    'position:fixed', 'inset:0', 'z-index:36', 'display:none',
    'background:rgba(4,6,12,0.72)', 'align-items:flex-start', 'justify-content:center',
    'overflow-y:auto',
    'padding:calc(env(safe-area-inset-top, 0px) + 24px) 16px 40px',
  ]);
  // U1（07-30 拍板）：點背景關閉已移除——只留卡片內「關閉」鈕（見 smallButton('關閉', hideCard)）
  cardOverlay.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.appendChild(cardOverlay);
  function hideCard() {
    cardOverlay.style.display = 'none';
    cardOverlay.replaceChildren();
  }

  // ---- W3 先發編排器 → W8 對陣畫面共用 overlay（出戰必經；U1 07-30 拍板改「返回」鈕不出戰）----
  const lineupOverlay = el('div', [
    'position:fixed', 'inset:0', 'z-index:37', 'display:none',
    'background:rgba(4,6,12,0.72)', 'align-items:flex-start', 'justify-content:center',
    'overflow-y:auto',
    'padding:calc(env(safe-area-inset-top, 0px) + 24px) 16px 40px',
  ]);
  // U1（07-30 拍板）：點外側取消已移除——改用面板內「返回（不出戰）」鈕（見 showMatchupScreen tools 列）
  lineupOverlay.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.appendChild(lineupOverlay);
  function closeLineup() {
    lineupOverlay.style.display = 'none';
    lineupOverlay.replaceChildren();
  }

  // ---- W4 入隊儀式（開箱級演出：名字／位置／屬性亮相；沿用 overlay 範本）----
  // 點外側不關（獎勵時刻不誤觸跳過）；一次一人逐個播，按鈕推進
  const recruitOverlay = el('div', [
    'position:fixed', 'inset:0', 'z-index:38', 'display:none',
    'background:rgba(4,6,12,0.8)', 'align-items:flex-start', 'justify-content:center',
    'overflow-y:auto',
    'padding:calc(env(safe-area-inset-top, 0px) + 24px) 16px 40px',
  ]);
  recruitOverlay.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.appendChild(recruitOverlay);

  function showRecruitCeremony(members, onDone) {
    const queue = [...members];
    let portrait = null; // 當前立繪實例（換卡／關閉即 dispose，儀式期間才存在）
    const closePortrait = () => { if (portrait) { portrait.dispose(); portrait = null; } };
    const paintOne = () => {
      closePortrait();
      const m = queue.shift();
      const def = opponentById(m.origin);
      const motionOff = reduceMotion();
      const card = el('div', [
        'width:min(400px, 94vw)', `background:${COLOR.card}`, 'border-radius:16px',
        `border:1px solid ${COLOR.gold}`, 'padding:18px 20px', 'display:flex',
        'flex-direction:column', 'gap:10px', 'box-shadow:0 12px 48px rgba(255,209,102,0.18)',
        'position:relative',
      ]);
      // 金色光暈脈動（開卡氛圍；reduced-motion 退化為靜態不脈動）——只動 opacity/transform
      const glow = el('div', [
        'position:absolute', 'inset:-16px', 'border-radius:22px', 'pointer-events:none', 'z-index:-1',
        'background:radial-gradient(ellipse at 50% 30%, rgba(255,209,102,0.4), rgba(255,209,102,0) 72%)',
        `opacity:${motionOff ? '0.45' : '0.35'}`,
      ]);
      card.appendChild(glow);
      if (!motionOff) {
        glow.animate(
          [{ opacity: 0.32, transform: 'scale(0.94)' }, { opacity: 0.62, transform: 'scale(1.06)' }],
          { duration: 1600, easing: 'ease-in-out', iterations: Infinity, direction: 'alternate' },
        );
      }
      card.appendChild(el('div', [
        'font-size:14px', 'font-weight:800', `color:${COLOR.gold}`, 'letter-spacing:4px',
        'text-align:center',
      ], '🎉 新隊員入隊'));
      card.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`, 'text-align:center'],
        `${def?.name ?? m.origin}的招牌球員，被你們打服了`));

      // 幾何球員立繪（獨立 three.js 場景、緩慢自轉；paintOne 換下一張／關閉時 dispose）
      portrait = createRecruitPortrait(m);
      card.appendChild(portrait.el);

      card.appendChild(el('div', [
        'font-size:34px', 'font-weight:900', `color:${COLOR.text}`, 'text-align:center',
        'letter-spacing:6px',
      ], m.name));
      card.appendChild(el('div', [
        'font-size:14px', 'font-weight:700', `color:${COLOR.cyan}`, 'text-align:center',
      ], `${ROLE_ABBR[m.role] ?? m.role}・二年級轉學生・${m.height.toFixed(2)}m`));
      // 入隊宣言（role 決定論挑選；persona 敘述保留於下一行）
      card.appendChild(el('div', [
        'font-size:13px', 'font-weight:700', `color:${COLOR.gold}`, 'text-align:center',
        'font-style:italic', 'line-height:1.5',
      ], pickJoinLine(m)));
      if (m.persona) {
        card.appendChild(el('div', [
          'font-size:13px', `color:${COLOR.dim}`, 'line-height:1.5', 'text-align:center',
        ], m.persona));
      }
      card.appendChild(el('div', ['font-size:12px', `color:${COLOR.gold}`, 'text-align:center'],
        `DNA｜${m.dna.tag}（${m.dna.style}）`));
      // 屬性亮相（八項、金色數值；成長刻度同隊友卡語彙）——逐項 stagger 亮起＋數值 count-up
      const attrBox = el('div', ['display:flex', 'flex-direction:column', 'gap:4px', 'margin-top:2px']);
      let idx = 0;
      for (const [key, label] of Object.entries(ATTR_LABELS)) {
        const v = m.attributes[key];
        const delay = idx * 80;
        idx += 1;
        const row = el('div', [
          'display:flex', 'align-items:center', 'gap:8px',
          ...(motionOff ? [] : ['opacity:0']),
        ]);
        row.appendChild(el('div', ['width:34px', 'font-size:12px', 'text-align:left',
          `color:${COLOR.text}`], label));
        const bar = el('div', [
          'flex:1', 'height:7px', 'border-radius:4px', 'background:#141b2e',
          'position:relative', 'overflow:hidden',
        ]);
        const barFill = el('div', [
          `width:${v}%`, 'height:100%', 'position:absolute', 'left:0',
          `background:${COLOR.gold}`, 'transform-origin:left',
          ...(motionOff ? [] : ['transform:scaleX(0)']),
        ]);
        bar.appendChild(barFill);
        row.appendChild(bar);
        const valEl = el('div', [
          'width:34px', 'font-size:12px', 'font-weight:700', 'text-align:right',
          `color:${COLOR.text}`,
        ], String(motionOff ? v : 0));
        row.appendChild(valEl);
        attrBox.appendChild(row);
        if (!motionOff) {
          row.animate(
            [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }],
            { duration: 220, delay, easing: 'cubic-bezier(0.16,1,0.3,1)', fill: 'both' },
          );
          barFill.animate(
            [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
            { duration: 320, delay, easing: 'cubic-bezier(0.16,1,0.3,1)', fill: 'forwards' },
          );
          countUp(valEl, v, delay, 320);
        }
      }
      card.appendChild(attrBox);
      card.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`, 'text-align:center',
        'line-height:1.5'],
      `信任 ${RECRUIT_TRUST}——新人要用表現贏得舉球權。到「⚙ 先發編排」把他排上場吧`));
      const btn = button('✊ 歡迎入隊', true, () => {
        if (queue.length) {
          paintOne();
        } else {
          closePortrait();
          recruitOverlay.style.display = 'none';
          recruitOverlay.replaceChildren();
          onDone();
        }
      });
      btn.style.alignSelf = 'center';
      card.appendChild(btn);
      recruitOverlay.replaceChildren(card);
      recruitOverlay.style.display = 'flex';
      if (!motionOff) {
        card.animate(
          [{ opacity: 0, transform: 'scale(0.85) translateY(12px)' },
            { opacity: 1, transform: 'scale(1) translateY(0)' }],
          { duration: 260, easing: 'cubic-bezier(0.16,1,0.3,1)', fill: 'backwards' },
        );
      }
      playRecruitFanfare();
    };
    paintOne();
  }

  // W8 賽前對陣畫面（07-26 Sawmah 拍板 B 案：球場對位圖）——出戰必經的排位儀式：
  // 俯視球場、對面六人具名釘在站位上（王牌帶稱號發光）、我方半場 tap 互換/板凳替換/
  // 自由人輪替/首發球位（改球位＝我方名牌在場上實際轉動）；合法性即時驗（沿用
  // lineup.js 全套規則）。挖角語意與開賽一致（applyPoaching：被挖走的人原隊換遞補、
  // 王牌被挖不亮相）。確認＝saveLineup＋onConfirm；返回（不出戰）改走「返回（不出戰）」鈕（U1）
  function showMatchupScreen(career, player, next, onConfirm) {
    // ★ 大學場也要有排位儀式 ★ 這裡原本只查高中表 ⇒ 大學八場 baseDef 恆 null ⇒
    // 直接 onConfirm() 跳過整個對陣畫面：先發互換、輪轉球位、板凳替換、對面具名亮相
    // 全部靜默消失，而這是唯一的先發編排入口（板凳永遠換不上場）。走收斂後的單一入口。
    const seasonN = store.seasonIndex?.() ?? 1;
    const baseDef = matchOpponentDef(next.opponentId, seasonN, { titles: career.titles ?? 0 });
    const roster = ensureStarterRoster(store);
    if (!baseDef || !roster) { onConfirm(); return; } // 無資料（防呆）＝直接出戰
    const saved = store.loadLineup();
    const members = roster.members;
    const playerId = player.id;
    const oldMates = members.filter((m) => m.dna?.teamId === next.opponentId);
    // W1(P4)：與開賽同一條轉換鏈——①ace 畢業遞補（第 2 屆起換臉：新王牌金框＋新稱號）
    // ②挖角/校友除名（畢業的招募生不還魂）
    // `matchOpponentDef` 已經套過該屆的 ace 遞補（大學則刻意不套）——這裡只做挖角除名
    const def = applyPoaching(baseDef, [
      ...oldMates.map((m) => m.fullName),
      ...(roster.alumni ?? []).map((a) => a.member?.fullName),
    ].filter(Boolean));
    let working = structuredClone(saved);
    // W4 選取模型：{kind:'field',si}｜{kind:'bench',id}｜null（si＝starters 索引）
    let selected = null;
    let notice = null; // 互換被擋的紅字理由（下一次操作清除）
    // 職業章批 4a：賽前布置（僅職業章面板讀寫，見下方 proChapter 分支）——
    // 逐場 keyed（store.loadDeployment 已依 matchId 篩過期選擇，這裡拿到手的
    // 保證是「本場」的選擇或預設空值），不與 lineup 混在同一顆 RMW 物件裡
    // （lineup 跨場沿用是刻意設計，布置選錯場次沿用則是 D5 想避免的事故）。
    const proChapter = isPro(store.loadChapter?.());
    const deploy = proChapter
      ? { ...(store.loadDeployment?.(next.id) ?? { blockLean: null, chaseTargetId: null }) }
      : { blockLean: null, chaseTargetId: null };

    const nameOf = (id) => (id === playerId
      ? career.playerName
      : (members.find((m) => m.id === id)?.name ?? id));
    const roleKeyOf = (id) => (id === playerId
      ? player.currentRole
      : members.find((m) => m.id === id)?.role);
    // 5-1 對位（拍板 07-23）：僅同角色可互換（OH↔OH、MB↔MB），舉球員↔舉對例外可換
    const canSwap = (a, b) => {
      const ra = roleKeyOf(a);
      const rb = roleKeyOf(b);
      return ra === rb
        || (ra === 'setter' && rb === 'opposite') || (ra === 'opposite' && rb === 'setter');
    };
    // 板凳替換上場（W4）：板凳球員頂掉第 si 格先發——主控不可下場、同角色限制同互換
    const benchToField = (benchId, si) => {
      const fieldId = working.starters[si];
      if (fieldId === playerId) {
        notice = '主控球員不可下場——你恆在先發';
      } else if (!canSwap(fieldId, benchId)) {
        notice = '不同角色不能替換上場——維持 5-1 對位（舉球員與舉對除外）';
      } else {
        working.starters[si] = benchId;
        selected = null;
      }
    };
    const tapField = (si) => {
      notice = null;
      if (selected === null) {
        selected = { kind: 'field', si };
      } else if (selected.kind === 'field' && selected.si === si) {
        selected = null;
      } else if (selected.kind === 'bench') {
        benchToField(selected.id, si);
      } else if (!canSwap(working.starters[selected.si], working.starters[si])) {
        notice = '不同角色不能互換——維持 5-1 對位（舉球員與舉對除外），職責才不相撞';
      } else {
        const s = working.starters;
        [s[selected.si], s[si]] = [s[si], s[selected.si]];
        selected = null;
      }
      paint();
    };

    // 矮視窗（橫持手機，max-height≤600）＝左右雙欄：左球場、右操作——一屏放得下；
    // 直式＝單欄。寬/排向在 paint() 依 short 設定
    const short = typeof matchMedia === 'function' && matchMedia('(max-height: 600px)').matches;
    const card = el('div', [
      `background:${COLOR.card}`, 'border-radius:18px',
      'border:1px solid #2c3a58', 'padding:14px 14px 16px', 'display:flex',
      'gap:10px', 'box-shadow:0 12px 40px rgba(0,0,0,0.6)',
      'max-height:94vh', 'overflow-y:auto',
    ]);

    // 名牌：enemy＝暖色唯讀；ally＝隊色青、可互動。isAce＝金框＋稱號行
    // accent（批 3 B2）：該隊球衣色色條，貼名牌頂緣；null（無 kit 資料）＝不畫、不炸
    function chipEl({ name, sub, tone, isAce = false, aceTitle = null,
      selectedNow = false, onTap = null, badges = [], accent = null }) {
      const c = el('div', [
        'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
        `gap:1px`, `min-height:${short ? 38 : 46}px`, 'padding:4px 2px', 'border-radius:10px',
        'text-align:center', 'min-width:0', 'position:relative', 'overflow:hidden',
        tone === 'enemy' ? 'background:rgba(88,44,26,0.5)' : 'background:rgba(17,42,62,0.75)',
        `border:2px solid ${selectedNow ? COLOR.cyan : isAce ? COLOR.gold : 'rgba(255,255,255,0.06)'}`,
        ...(isAce ? ['box-shadow:0 0 10px rgba(255,209,102,0.35)'] : []),
        ...(onTap ? ['cursor:pointer', 'touch-action:manipulation'] : []),
      ]);
      if (accent != null) {
        c.appendChild(el('div', [
          'position:absolute', 'top:0', 'left:0', 'right:0', 'height:3px',
          `background:${cssColor(accent)}`,
        ]));
      }
      const top = el('div', ['display:flex', 'align-items:center', 'gap:4px', 'max-width:100%']);
      top.appendChild(el('div', [
        'font-size:13px', 'font-weight:800', 'white-space:nowrap', 'overflow:hidden',
        'text-overflow:ellipsis', `color:${tone === 'enemy' ? '#ffcdb4' : COLOR.text}`,
      ], name));
      for (const b of badges) top.appendChild(b);
      c.appendChild(top);
      if (isAce && aceTitle) {
        c.appendChild(el('div', [
          'font-size:10px', 'font-weight:800', `color:${COLOR.gold}`, 'white-space:nowrap',
        ], `★ ${aceTitle}`));
      } else if (sub) {
        c.appendChild(el('div', [
          'font-size:10px', `color:${tone === 'enemy' ? '#c9917a' : COLOR.dim}`, 'white-space:nowrap',
        ], sub));
      }
      if (onTap) c.addEventListener('pointerdown', (e) => { e.stopPropagation(); onTap(); });
      return c;
    }
    const row3 = (chips) => {
      const r = el('div', ['display:grid', 'grid-template-columns:1fr 1fr 1fr', 'gap:6px']);
      for (const c of chips) r.appendChild(c);
      return r;
    };

    // 對面槽序＝S/OH/MB/OPP/OH/MB（同 heights/建隊 ROLE_ORDER）；站位鏡射：
    // 他們的前排 P2/P3/P4 貼網、後排 P1/P6/P5 靠底線——from 我方視角左右已鏡射，
    // 直欄即真實對位（我方 P4 直面他們 P2）
    const OPP_ROLE = ['S', 'OH', 'MB', 'OPP', 'OH', 'MB'];
    // W1(P4)：敵方名牌標年級（Q3「資訊落在要用的前一刻」——挖三年級只能用一年，
    // 看得到才有取捨）。現行年級＝基準＋屆數−1；顯示夾限三年級（非 ace 無輪替＝已知債）
    const oppGradeLabel = (i) => {
      const g = def.grades?.[i];
      if (!g) return '';
      // 企業章批 3：corp 對手的 grades＝在隊年資（corporations.js 檔頭），
      // 套高中的 currentGrade 屆數推進＋夾限會把全隊畫成「三年級」——改標年資。
      // 判準＝這個 def 在企業表查得到（def 本身沒有章節欄位，id 是唯一可靠識別）。
      // 職業章批 2：proTeams 同語意（proTeam.js 檔頭），同一判準補第四張表。
      if (corporationById(def.id ?? '') || proTeamById(def.id ?? '')) return `年資 ${g} 年`;
      return GRADE_LABEL[Math.min(3, currentGrade(g, seasonN))] ?? '';
    };
    // N2（07-30）情蒐讀當屆值：成長型 ace 的身高走跨屆曲線（applySeasonRoster 掛的
    // aceHeight），不是建檔常數——「情蒐錄影帶數據跨屆真實變化」的顯示端
    const oppHeight = (i) => (def.ace?.slot === i && def.aceHeight)
      ? def.aceHeight
      : (def.heights?.[i] ?? 1.85);
    // 批 3 B2：對手色條——kitFor(oppDef) 單一入口（無 kit 資料＝null＝不畫）
    const oppAccent = opponentAccentColor(def);
    const oppChip = (i) => chipEl({
      name: def.squad?.[i] ?? `${def.name}${i + 1}號`,
      sub: [OPP_ROLE[i], oppGradeLabel(i), `${oppHeight(i).toFixed(2)}m`]
        .filter(Boolean).join('・'),
      tone: 'enemy',
      isAce: def.ace?.slot === i,
      aceTitle: def.ace?.title,
      accent: oppAccent,
    });

    function paint() {
      card.replaceChildren();
      // ---- VS 抬頭：場次＋兩隊名＋敵情一行 ----
      if (next.label) {
        card.appendChild(el('div', [
          'font-size:11px', 'font-weight:800', `color:${COLOR.dim}`, 'letter-spacing:4px',
          'text-align:center',
        ], next.label));
      }
      const head = el('div', [
        'display:flex', 'align-items:baseline', 'justify-content:center', 'gap:12px',
      ]);
      head.appendChild(el('div', [
        'font-size:18px', 'font-weight:900', `color:${COLOR.cyan}`, 'letter-spacing:1px',
      ], teamName()));
      head.appendChild(el('div', ['font-size:12px', 'font-weight:900', `color:${COLOR.dim}`], 'VS'));
      head.appendChild(el('div', [
        'font-size:18px', 'font-weight:900', 'color:#ff9d7a', 'letter-spacing:1px',
      ], def.name));
      card.appendChild(head);
      card.appendChild(el('div', [
        'font-size:12px', `color:${COLOR.dim}`, 'text-align:center', 'line-height:1.5',
      ], def.trait));
      // 情報行：攔網人格／王牌亮相／被挖走無王牌／情蒐警告／舊隊情結
      const intel = el('div', [
        'display:flex', 'flex-direction:column', 'gap:2px', 'align-items:center',
      ]);
      // ★ 2026-08-07 情報層：這隊的牆是哪一種 ★
      // `blockPersona` 上線以來畫面上零顯示，玩家因此在「要不要內切」上只能亂按
      // ——而那個決定的收益**依人格分兩邊**（inside-cut-probe 150 局：對 read 隊
      // −8.3pp／對 commit 隊 +10.8pp）。標籤與 hint 的單一真相在
      // `sim/blockRead.js` 的 BLOCK_PERSONA_INTEL（與人格常數同一處，不會漂開）。
      // 讀 `def.ai?.blockPersona` 而不是 `blockPersonaOf`：那支要 game 物件，
      // 而這裡是**賽前**、game 還沒建出來；同一份資料的上游就是這個欄位
      //（`careerMatchSetup` 也是從它組出 aiProfiles 的）。未標示＝跟球型（sim 的回退值）。
      {
        const intelDef = BLOCK_PERSONA_INTEL[def.ai?.blockPersona]
          ?? BLOCK_PERSONA_INTEL[BLOCK_PERSONA.READ];
        intel.appendChild(el(
          'div',
          ['font-size:12.5px', 'font-weight:800', `color:${COLOR.cyan}`],
          `🧱 他們的牆：${intelDef.label}（${intelDef.tag}）`,
        ));
        intel.appendChild(el(
          'div',
          ['font-size:11.5px', `color:${COLOR.dim}`, 'text-align:center', 'line-height:1.5'],
          intelDef.hint,
        ));
      }
      // W4(P4) 題6：宿敵標記（隊級 rival 旗標——情蒐數據面的宿敵感；
      // 宿敵 ace 人設選定落檔後此行語意由劇情輪補強）
      if (def.rival) {
        intel.appendChild(el('div', [
          'font-size:12.5px', 'font-weight:800', 'color:#ff6b6b', 'letter-spacing:2px',
        ], '🔥 宿敵之戰——他們記得每一次交手'));
      }
      if (def.ace) {
        const aceRole = def.ace.slot === 'L' ? '自由人' : OPP_ROLE[def.ace.slot];
        intel.appendChild(el('div', ['font-size:12.5px', 'font-weight:800', `color:${COLOR.gold}`],
          `王牌 ${def.ace.name}（${aceRole}）——「${def.ace.title}」`));
        // W4(P4) Q9：對手 ace 對戰數據餵情蒐（宿敵感數據面——「上次交手他扣了 18 分」）
        const aceRec = store.loadAceBook?.()?.[next.opponentId];
        // N2：宿敵成長的情蒐一行字（他這屆長高了／能力上修——資訊落在要用的前一刻）
        const grew = def.aceHeight ? aceGrowthAt(baseDef, seasonN) : null;
        if (grew && grew.grewCm > 0) {
          intel.appendChild(el('div', ['font-size:11.5px', 'color:#ffb454'],
            `📈 情蒐：他還在長——上屆 ${grew.fromCm}cm → 本屆 ${grew.heightCm}cm，`
            + `能力全面上修（＋${grew.attrBonus}）`));
        }
        if (aceRec?.last && aceRec.name === def.ace.name) {
          const bits = [`扣了 ${aceRec.last.kills} 分`];
          if (aceRec.last.aces > 0) bits.push(`ACE ${aceRec.last.aces}`);
          if (aceRec.last.blocks > 0) bits.push(`攔死 ${aceRec.last.blocks}`);
          intel.appendChild(el('div', ['font-size:11.5px', 'color:#ff9d7a'],
            `📋 上次交手：他${bits.join('、')}${aceRec.matches > 1 ? `（交手 ${aceRec.matches} 次）` : ''}`));
        }
      } else if (seasonDef.ace) {
        // W1(P4)：以「該屆應有的王牌」為基準——畢業拔除不誤報成被挖走
        intel.appendChild(el('div', ['font-size:12px', 'font-weight:700', `color:${COLOR.cyan}`],
          `他們的王牌？現在穿著${teamName()}的球衣。`));
      }
      if (def.scoutRead > 0 && career.scouting?.[next.opponentId]) {
        intel.appendChild(el('div', ['font-size:11.5px', 'color:#ffb454'],
          '⚠ 這隊研究過你——慣用線路會被讀'));
      } else if (def.scoutRead > 0 && (corporationById(next.opponentId) || proTeamById(next.opponentId))) {
        // 探針卷（M3）：企業對手＝球探建檔——點名被盯的具體線（段 F 教訓：
        // 只說「會被讀」玩家對不上帳）。聚合無明顯慣性（scoutFocusZone null）
        // ＝不顯示，不嚇唬沒有慣性的玩家。
        // 職業章批 2（拍板題 5）：職業對手沿用同一套形狀（B4 分母清單第 3 項）。
        const focus = scoutFocusZone(
          leagueScoutZones(career, { excludeId: next.opponentId })?.zones,
        );
        if (focus) {
          intel.appendChild(el('div', ['font-size:11.5px', 'color:#ffb454'],
            `⚠ 聯賽球探研究過你——他們盯上你的${SCOUT_ZONE_LABEL[focus.zone]}（改打別的線有奇效）`));
        }
      }
      if (oldMates.length) {
        intel.appendChild(el('div', ['font-size:11.5px', `color:${COLOR.cyan}`],
          `🔗 ${oldMates.map((m) => m.name).join('、')} 要打老東家`));
      }
      // 職業章批 4a D1/D2：解鎖「餵線」後——「對手眼中的你」（全生涯扣打分佈＋
      // 對手這場將押的線）。未解鎖＝這整塊零可見（D1「未解鎖＝零可見」）。
      // ★不得另抄一份算法★ 分佈與 focus 都直接呼叫既有的 leagueScoutZones／
      // scoutFocusZone（D2 凍結）——本區塊只負責畫，不重算。
      if (proChapter && (player.techniques?.baitLine ?? 0) >= 1) {
        const myZones = leagueScoutZones(career, { excludeId: next.opponentId })?.zones ?? null;
        const zoneTotal = myZones ? Object.values(myZones).reduce((s, v) => s + v, 0) : 0;
        const myFocus = scoutFocusZone(myZones);
        const baitBox = el('div', [
          'display:flex', 'flex-direction:column', 'gap:3px', 'width:100%', 'max-width:280px',
          'margin-top:2px',
        ]);
        baitBox.appendChild(el('div', [
          'font-size:11.5px', 'font-weight:800', `color:${COLOR.gold}`, 'text-align:center',
        ], '🎯 餵線——對手眼中的你'));
        if (!(def.scoutRead > 0) || zoneTotal < 6) {
          // 誠實顯示「讀不到你」級文案——不畫假分佈（D2 凍結）
          baitBox.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'text-align:center'],
            def.scoutRead > 0 ? '這隊還摸不透你——樣本不足，讀不到你' : '這隊沒在研究你——讀不到你'));
        } else {
          for (const z of ['line', 'cross', 'middle', 'tip']) {
            const cnt = myZones[z] ?? 0;
            const pct = zoneTotal > 0 ? Math.round((cnt / zoneTotal) * 100) : 0;
            const isFocus = myFocus?.zone === z;
            const row = el('div', ['display:flex', 'align-items:center', 'gap:6px']);
            row.appendChild(el('div', [
              'width:34px', 'font-size:10.5px', `color:${isFocus ? '#ff9d7a' : COLOR.dim}`,
            ], SCOUT_ZONE_LABEL[z]));
            const bar = el('div', [
              'flex:1', 'height:6px', 'border-radius:3px', 'background:#141b2e', 'overflow:hidden',
            ]);
            bar.appendChild(el('div', [
              `width:${pct}%`, 'height:100%', `background:${isFocus ? '#ff6b6b' : COLOR.cyan}`,
            ]));
            row.appendChild(bar);
            row.appendChild(el('div', [
              'width:30px', 'font-size:10.5px', 'text-align:right', `color:${COLOR.dim}`,
            ], `${pct}%`));
            baitBox.appendChild(row);
          }
          baitBox.appendChild(el('div', [
            'font-size:11px', 'text-align:center', `color:${myFocus ? '#ff9d7a' : COLOR.dim}`,
          ], myFocus
            ? `這場他們會押你的${SCOUT_ZONE_LABEL[myFocus.zone]}——關鍵分改打別線，吃反常線折扣`
            : '分佈平均——這場他們押不準你的慣用線'));
        }
        intel.appendChild(baitBox);
      }
      if (intel.children.length) card.appendChild(intel);
      if (notice) {
        card.appendChild(el('div', [
          'font-size:12px', 'font-weight:700', `color:${COLOR.red}`, 'line-height:1.4',
          'text-align:center',
        ], notice));
      }

      // ---- 俯視球場：對面半場（暖木）＋網帶＋我方半場（冷藍） ----
      // flex-shrink:0＝手機實測修復（07-26）：卡片 max-height+overflow-y:auto 下，
      // 唯一帶 overflow:hidden 的球場 min-content 為 0，會吸收全部壓縮被夾成一條——
      // 禁止收縮、超高改走卡片捲動
      const court = el('div', [
        'display:flex', 'flex-direction:column', 'border-radius:14px', 'overflow:hidden',
        'border:1px solid #2c3a58', 'flex-shrink:0',
      ]);
      const enemyHalf = el('div', [
        'display:flex', 'flex-direction:column', 'gap:6px', 'padding:8px 8px 10px',
        'background:linear-gradient(180deg, #3c2a1d 0%, #4a3524 100%)',
      ]);
      const libRowE = el('div', ['display:flex', 'justify-content:flex-end']);
      libRowE.appendChild(el('div', ['font-size:10.5px', 'color:#c9917a'],
        def.ace?.slot === 'L'
          ? `自由人 ${def.libero}★「${def.ace.title}」`
          : `自由人 ${def.libero ?? '—'}`));
      enemyHalf.appendChild(libRowE);
      enemyHalf.appendChild(row3([oppChip(0), oppChip(5), oppChip(4)])); // 後排 P1/P6/P5
      enemyHalf.appendChild(row3([oppChip(1), oppChip(2), oppChip(3)])); // 前排 P2/P3/P4 貼網
      court.appendChild(enemyHalf);
      court.appendChild(el('div', [
        'height:7px',
        'background:repeating-linear-gradient(90deg, #e8e4d8 0 14px, rgba(232,228,216,0.25) 14px 22px)',
      ])); // 球網帶
      const ourHalf = el('div', [
        'display:flex', 'flex-direction:column', 'gap:6px', 'padding:10px 8px 8px',
        'background:linear-gradient(180deg, #10203a 0%, #0c1628 100%)',
      ]);
      // 我方站位＝effectiveOrder（首發球位改變＝名牌真的在場上轉動）；
      // 顯示位 i ↔ starters 索引 (rotationStart + i) % 6
      const eff = effectiveOrder(working.starters, working.rotationStart);
      // 批 3 B2：我方色條——恆定（大學章已選校＝校色，其餘回落 OUR_ANCHORS 錨定色）
      const myAccent = ourSchoolKit()?.jersey ?? OUR_ANCHORS.jersey;
      const myChip = (effIdx) => {
        const id = eff[effIdx];
        const si = (working.rotationStart + effIdx) % 6;
        const isPlayer = id === playerId;
        const badges = [];
        if (isPlayer) badges.push(badge('你', COLOR.gold, '#1a1405'));
        if (effIdx === 0) badges.push(badge('發', COLOR.cyan, '#062430'));
        return chipEl({
          name: nameOf(id),
          sub: ROLE_ABBR[roleKeyOf(id)] ?? '?',
          tone: 'ally',
          selectedNow: selected?.kind === 'field' && selected.si === si,
          onTap: () => tapField(si),
          badges,
          accent: myAccent,
        });
      };
      ourHalf.appendChild(row3([myChip(3), myChip(2), myChip(1)])); // 前排 P4/P3/P2 貼網
      ourHalf.appendChild(row3([myChip(4), myChip(5), myChip(0)])); // 後排 P5/P6/P1
      court.appendChild(ourHalf);
      card.appendChild(court);
      card.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'line-height:1.5'],
        selected?.kind === 'bench'
          ? '再點一個我方名牌——讓所選板凳球員替換上場（點回原名牌取消）'
          : selected?.kind === 'field'
            ? '再點一個我方名牌互換位置、或點板凳球員替換（點回原名牌取消）'
            : '點兩個我方名牌互換（同角色）；「發」＝首發球員；直欄＝隔網對位'));

      // ---- 板凳橫排（tap 板凳＋tap 場上名牌＝替換上場） ----
      const benchMembers = members.filter(
        (m) => m.role !== 'libero' && !working.starters.includes(m.id),
      );
      if (benchMembers.length > 0) {
        const benchWrap = el('div', ['display:flex', 'align-items:center', 'gap:6px', 'flex-wrap:wrap']);
        benchWrap.appendChild(el('div', [
          'font-size:11px', `color:${COLOR.cyan}`, 'letter-spacing:2px',
        ], '板凳'));
        for (const m of benchMembers) {
          const isSel = selected?.kind === 'bench' && selected.id === m.id;
          const c = el('div', [
            'display:flex', 'align-items:center', 'gap:4px', 'padding:5px 10px',
            'border-radius:9px', 'cursor:pointer', 'touch-action:manipulation',
            'background:rgba(20,28,46,0.8)',
            `border:2px solid ${isSel ? COLOR.cyan : 'rgba(255,255,255,0.06)'}`,
          ]);
          c.appendChild(el('div', ['font-size:12.5px', 'font-weight:700'], m.name));
          c.appendChild(el('div', ['font-size:10px', `color:${COLOR.dim}`],
            ROLE_ABBR[m.role] ?? m.role));
          c.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            notice = null;
            if (isSel) selected = null;
            else if (selected?.kind === 'field') benchToField(m.id, selected.si);
            else selected = { kind: 'bench', id: m.id };
            paint();
          });
          benchWrap.appendChild(c);
        }
        card.appendChild(benchWrap);
      }

      // 自由人：名冊僅一名＝唯讀（W3 現狀）；兩名以上（招募白浪後）＝tap 輪替選擇
      const liberoIds = members.filter((m) => m.role === 'libero').map((m) => m.id);
      const switchable = liberoIds.length > 1;
      const lib = members.find((m) => m.id === working.libero);
      const libRow = el('div', [
        'display:flex', 'align-items:center', 'gap:10px', 'height:40px', 'padding:0 12px',
        'border-radius:10px', 'background:rgba(20,28,46,0.6)', 'border:1px dashed #33436a',
        ...(switchable ? ['cursor:pointer', 'touch-action:manipulation'] : []),
      ]);
      libRow.appendChild(el('div', [
        'font-size:12px', 'font-weight:800', `color:${COLOR.dim}`, 'width:16px',
      ], 'L'));
      libRow.appendChild(el('div', ['font-size:14px', 'font-weight:700', 'flex:1'], lib?.name ?? '小守'));
      libRow.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`],
        switchable ? '自由人 ⇄ 點擊切換' : '自由人'));
      if (switchable) {
        libRow.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          notice = null;
          const at = liberoIds.indexOf(working.libero);
          working.libero = liberoIds[(at + 1) % liberoIds.length];
          paint();
        });
      }
      card.appendChild(libRow);

      // 職業章批 4a D4：賽前布置面板（僅職業章可見）——兩槽：①攔網重心 ②發球攻擊。
      // 選擇存在 `deploy`（本函式作用域內的可變物件，非 `working`——不隨 lineup
      // 沿用到下一場，見上方宣告處註解）；確認出戰時才落 store（見下方 confirm）。
      if (proChapter) {
        const deployWrap = el('div', ['display:flex', 'flex-direction:column', 'gap:8px']);
        deployWrap.appendChild(el('div', [
          'font-size:12px', `color:${COLOR.cyan}`, 'letter-spacing:2px',
        ], '賽前布置（職業限定）——押錯有真實代價'));

        // ---- 槽①攔網重心：資料源＝career.scouting 該隊 zones（D4 凍結，不得另抄算法）----
        const oppFocus = scoutFocusZone(career.scouting?.[next.opponentId]?.zones ?? null);
        const slot1 = el('div', ['display:flex', 'flex-direction:column', 'gap:4px']);
        slot1.appendChild(el('div', [
          'font-size:11.5px', 'font-weight:700', `color:${COLOR.text}`,
        ], '① 攔網重心'));
        if (!oppFocus) {
          // 情報不足＝不可選：連帶清掉可能殘留的舊選擇（防止資料狀態變回不足時，
          // 畫面上按鈕消失了但 deploy 裡還留著上一次的值、確認出戰時悄悄生效）
          deploy.blockLean = null;
          // ★送審殘留矛盾修（拍板 A 誠實方向延伸）★ 原文案「情報不足…不可押」暗示
          // 「情報夠了＝有依據的注」，與過閘後「本來就沒情報」自相矛盾。閘的行為不變
          //（交手過才可押＝D5 凍結），措辭改熟悉度敘事、不再涉及「情報」。
          slot1.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`],
            '還沒跟這隊交手過——攔網手押線要有實戰默契，先打過再說'));
        } else {
          // ★批 4a 覆審 HIGH 修（Sawmah 拍板 A：誠實降級）★ 原文案「這隊…偏向X」把
          // career.scouting（＝這隊對**你**的讀取紀錄）講成對手自己的攻擊慣性——
          // 押線判定（applyBlockLean 抓場上真實推進者）與那份資料零關聯＝披著情報
          // 外衣的盲注。降級為明示賭注；真情報化（對手攻擊統計資料源）掛帳等試玩。
          slot1.appendChild(el('div', ['font-size:10.5px', `color:${COLOR.dim}`],
            '沒有對手攻擊路線的情報——押哪條線，靠你自己的判斷（押錯整面落空）'));
          const row1 = el('div', ['display:flex', 'gap:6px']);
          for (const [key, label] of [['line', '押直線'], ['cross', '押斜線']]) {
            const active = deploy.blockLean === key;
            const b = el('button', [
              'flex:1', 'height:32px', 'border-radius:8px', 'border:none', 'cursor:pointer',
              'touch-action:manipulation', 'font-size:12.5px', 'font-weight:700',
              active ? `background:${COLOR.cyan};color:#062430`
                : `background:rgba(30,40,64,0.9);color:${COLOR.dim}`,
            ], label);
            b.addEventListener('pointerdown', (e) => {
              e.stopPropagation();
              deploy.blockLean = active ? null : key;
              paint();
            });
            row1.appendChild(b);
          }
          slot1.appendChild(row1);
          slot1.appendChild(el('div', ['font-size:10.5px', 'color:#ffb454'], deploy.blockLean
            ? '押下去了——猜對這波攔網賭中，猜錯牆站錯邊、擦手都碰不到'
            : '不押＝維持牆本身的判斷（不猜、也沒有加成）'));
        }
        deployWrap.appendChild(slot1);

        // ---- 槽②發球攻擊：資料源＝career.scouting 該隊（有無交手紀錄）＋
        // def 屬性算出的最弱接發者（weakestReceiverIdOf，D4 凍結：sim 零新判定，
        // 純用既有 def.level/attrBias/roleBias 座標系）----
        const scoutedOpp = !!career.scouting?.[next.opponentId];
        const weakId = scoutedOpp ? weakestReceiverIdOf(def) : null;
        const weakIdx = weakId ? Number(weakId.slice(1)) - 1 : null;
        const weakName = weakIdx != null
          ? (def.squad?.[weakIdx] ?? `${def.name}${weakIdx + 1}號`) : null;
        const weakRole = weakIdx != null ? OPP_ROLE[weakIdx] : null;
        const slot2 = el('div', ['display:flex', 'flex-direction:column', 'gap:4px']);
        slot2.appendChild(el('div', [
          'font-size:11.5px', 'font-weight:700', `color:${COLOR.text}`,
        ], '② 發球攻擊'));
        if (!weakId) {
          deploy.chaseTargetId = null; // 同上：情報不足時連帶清掉殘留選擇
          slot2.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`],
            '情報不足——還沒和這隊交手過，不知道誰接發最弱'));
        } else {
          const active = deploy.chaseTargetId === weakId;
          const b2 = el('button', [
            'height:32px', 'border-radius:8px', 'border:none', 'cursor:pointer',
            'touch-action:manipulation', 'font-size:12.5px', 'font-weight:700',
            active ? `background:${COLOR.cyan};color:#062430`
              : `background:rgba(30,40,64,0.9);color:${COLOR.dim}`,
          ], active ? `✓ 追打 ${weakName}（${weakRole}）` : `追打 ${weakName}（${weakRole}）——接發最弱`);
          b2.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            deploy.chaseTargetId = active ? null : weakId;
            paint();
          });
          slot2.appendChild(b2);
          slot2.appendChild(el('div', ['font-size:10.5px', 'color:#ffb454'], deploy.chaseTargetId
            ? '全場指名追發——追發失誤率上升，非純增益'
            : '不指定＝維持隊友原本的發球判斷'));
        }
        deployWrap.appendChild(slot2);

        card.appendChild(deployWrap);
      }

      // 起始輪轉（rotationStart 0-5，顯示 1-6）
      const rotWrap = el('div', ['display:flex', 'flex-direction:column', 'gap:6px']);
      rotWrap.appendChild(el('div', [
        'font-size:12px', `color:${COLOR.cyan}`, 'letter-spacing:2px',
      ], '起始輪轉（首發球位）'));
      const rotRow = el('div', ['display:flex', 'gap:6px']);
      for (let n = 0; n < 6; n += 1) {
        const active = working.rotationStart === n;
        const b = el('button', [
          'flex:1', 'height:34px', 'border-radius:8px', 'border:none', 'cursor:pointer',
          'touch-action:manipulation', 'font-size:14px', 'font-weight:700',
          active ? `background:${COLOR.cyan};color:#062430` : `background:rgba(30,40,64,0.9);color:${COLOR.dim}`,
        ], String(n + 1));
        b.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          working.rotationStart = n;
          paint();
        });
        rotRow.appendChild(b);
      }
      rotWrap.appendChild(rotRow);
      card.appendChild(rotWrap);

      // 即時合法性（validateLineup 結構＋checkRoleStructure 5-1 對位＋checkRotationOrder 7.7）
      const v = validateLineup(working, members, playerId, player.currentRole ?? 'outside');
      const rs = checkRoleStructure(working.starters, members, playerId, player.currentRole);
      const rot = checkRotationOrder(working.starters, working.rotationStart);
      const legal = v.valid && rs.legal && rot.legal;
      const reason = !v.valid ? v.errors[0] : !rs.legal ? rs.reason : rot.reason;
      card.appendChild(el('div', [
        'font-size:13px', 'font-weight:700', 'min-height:18px',
        `color:${legal ? '#7ee787' : COLOR.red}`,
      ], legal ? '✓ 陣容合法（FIVB 7.7・5-1 對位）' : `✗ ${reason}`));

      const tools = el('div', ['display:flex', 'gap:8px', 'flex-wrap:wrap']);
      // 重置只還原排序/自由人/輪轉，trust 映射保留——W4 起 trust 有真實差異
      // （招募成員 10、既有隊友 20），重置排陣不得洗掉信任
      tools.appendChild(smallButton('重置為預設', () => {
        working = {
          ...defaultLineup(members, playerId, player.currentRole ?? 'outside'),
          trust: structuredClone(working.trust),
        };
        selected = null;
        notice = null;
        paint();
      }));
      tools.appendChild(smallButton('沿用上次', () => { working = structuredClone(saved); selected = null; notice = null; paint(); }));
      // U1（07-30 拍板）：原「點外側＝返回不出戰」改為明鈕，語意不變（不儲存、不出戰）
      tools.appendChild(smallButton('返回（不出戰）', () => closeLineup()));
      card.appendChild(tools);

      const confirm = button('✓ 確認出戰', legal, () => {
        if (!legal) return;
        store.saveLineup(working);
        // 職業章批 4a：布置選擇落檔（僅職業章；其餘章節 proChapter 恆 false，
        // 這裡整條不執行＝那些章節的存檔結構逐值不變）
        if (proChapter) store.saveDeployment?.(next.id, deploy);
        closeLineup();
        onConfirm();
      });
      if (!legal) { confirm.style.opacity = '0.5'; confirm.style.cursor = 'not-allowed'; }
      card.appendChild(confirm);

      // 矮視窗（橫持手機）雙欄重排：球場（含抬頭）進左欄、操作區進右欄——
      // 單欄先建好再搬＝所有互動/重繪邏輯零改動。直式維持單欄
      if (short) {
        const kids = [...card.children];
        const splitAt = kids.indexOf(court) + 1;
        const col = () => el('div', [
          'display:flex', 'flex-direction:column', 'gap:8px', 'flex:1 1 0', 'min-width:0',
        ]);
        const colL = col();
        const colR = col();
        kids.forEach((k, i) => (i < splitAt ? colL : colR).appendChild(k));
        card.replaceChildren(colL, colR);
        card.style.flexDirection = 'row';
        card.style.width = 'min(860px, 96vw)';
      } else {
        card.style.flexDirection = 'column';
        card.style.width = 'min(470px, 96vw)';
      }
    }

    paint();
    lineupOverlay.replaceChildren(card);
    lineupOverlay.style.display = 'flex';
  }

  function showMemberCard(member, career) {
    const card = el('div', [
      'width:min(400px, 94vw)', `background:${COLOR.card}`, 'border-radius:16px',
      'border:1px solid #2c3a58', 'padding:16px 18px', 'box-shadow:0 12px 40px rgba(0,0,0,0.6)',
      'display:flex', 'flex-direction:column', 'gap:10px',
    ]);
    // 抬頭：名字＋隊長徽＋位置/年級/身高
    const head = el('div', ['display:flex', 'align-items:baseline', 'gap:8px', 'flex-wrap:wrap']);
    head.appendChild(el('div', ['font-size:24px', 'font-weight:900', `color:${COLOR.text}`], member.name));
    // 命名工程：全名（暱稱之外的正式名；同名者不重複顯示）
    if (member.fullName && member.fullName !== member.name) {
      head.appendChild(el('div', ['font-size:14px', `color:${COLOR.dim}`, 'font-weight:700'],
        member.fullName));
    }
    if (member.captain) {
      head.appendChild(el('div', [
        'font-size:11px', 'font-weight:800', `color:#1a1405`, `background:${COLOR.gold}`,
        'border-radius:8px', 'padding:2px 8px', 'letter-spacing:2px',
      ], '隊長'));
    }
    if (member.title) { // 輕稱號（現僅隊長大山「沉默高牆」）
      head.appendChild(el('div', ['font-size:12px', `color:${COLOR.gold}`, 'font-weight:700'],
        `「${member.title}」`));
    }
    head.appendChild(el('div', ['font-size:14px', `color:${COLOR.cyan}`, 'font-weight:700'],
      `${ROLE_ABBR[member.role] ?? member.role}・${memberGradeLabel(member)}・${member.height.toFixed(2)}m`));
    card.appendChild(head);
    if (member.persona) {
      card.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`, 'line-height:1.5', 'text-align:left'],
        member.persona));
    }
    // DNA 標記（描述性——招募時代 W4 起會標示來源隊風格）
    card.appendChild(el('div', ['font-size:12px', `color:${COLOR.gold}`, 'text-align:left'],
      `DNA｜${member.dna.tag}（${member.dna.style}）`));

    // W5 信任顯示（Sawmah 07-23 拍板）：二傳信任持久 baseline（lineup.trust 跟人映射，
    // 逐出全隊 −5 在此可見）；場中動態加成不入卡。自由人不吃舉球分配＝不顯示。
    // 玩家自己的信任在生涯抬頭（save.player 供給，不在此映射——雙真相防線）。
    if (member.role !== 'libero') {
      const tv = trustOf(store.loadLineup(), member.id);
      const trow = el('div', ['display:flex', 'align-items:center', 'gap:8px', 'margin-top:2px']);
      trow.appendChild(el('div', [
        'width:56px', 'font-size:12px', 'text-align:left', `color:${COLOR.text}`,
      ], '二傳信任'));
      const tbar = el('div', [
        'flex:1', 'height:7px', 'border-radius:4px', 'background:#141b2e',
        'position:relative', 'overflow:hidden',
      ]);
      tbar.appendChild(el('div', [
        `width:${Math.max(0, Math.min(100, tv))}%`, 'height:100%', 'position:absolute',
        'left:0', `background:${COLOR.cyan}`,
      ]));
      trow.appendChild(tbar);
      trow.appendChild(el('div', [
        'width:56px', 'font-size:12px', 'font-weight:700', 'text-align:right',
        `color:${COLOR.text}`,
      ], `${tv}`));
      card.appendChild(trow);
      card.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'text-align:left'],
        '信任影響舉球分配——高信任拿更多攻擊球權（逐出隊友會讓全隊信任下降）'));
    }

    // 屬性列：可成長六項附成長量與 85 上限刻度；控球/耐力灰顯（不開放成長）
    const gains = totalGains(member);
    const attrBox = el('div', ['display:flex', 'flex-direction:column', 'gap:5px', 'margin-top:2px']);
    for (const [key, label] of Object.entries(ATTR_LABELS)) {
      const v = member.attributes[key];
      const g = gains[key] ?? 0;
      const growable = GROWABLE_KEYS.has(key);
      const row = el('div', ['display:flex', 'align-items:center', 'gap:8px']);
      row.appendChild(el('div', [
        'width:34px', 'font-size:12px', 'text-align:left',
        `color:${growable ? COLOR.text : COLOR.dim}`,
      ], label));
      const bar = el('div', [
        'flex:1', 'height:7px', 'border-radius:4px', 'background:#141b2e',
        'position:relative', 'overflow:hidden',
      ]);
      bar.appendChild(el('div', [
        `width:${Math.max(0, v - g)}%`, 'height:100%', 'position:absolute', 'left:0',
        `background:${growable ? '#3d5a80' : '#28344e'}`,
      ]));
      if (g > 0) {
        bar.appendChild(el('div', [
          `width:${g}%`, 'height:100%', 'position:absolute', `left:${v - g}%`,
          `background:${COLOR.gold}`,
        ]));
      }
      if (growable) { // 85 上限刻度（主角 90——隊友低一階的護欄可視化）
        bar.appendChild(el('div', [
          `left:${ROSTER_GROWTH.ATTR_CAP}%`, 'width:2px', 'height:100%', 'position:absolute',
          'background:rgba(238,242,250,0.45)',
        ]));
      }
      row.appendChild(bar);
      row.appendChild(el('div', [
        'width:56px', 'font-size:12px', 'font-weight:700', 'text-align:right',
        `color:${g > 0 ? COLOR.gold : COLOR.text}`,
      ], g > 0 ? `${v}（+${g}）` : `${v}`));
      attrBox.appendChild(row);
    }
    card.appendChild(attrBox);
    card.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'text-align:left'],
      `可成長屬性上限 ${ROSTER_GROWTH.ATTR_CAP}・表現驅動自動成長（打得好才長）`));

    // 成長歷程：逐場 gains（比賽由對手名標示）；沒長過如實顯示
    card.appendChild(el('div', [
      'font-size:13px', `color:${COLOR.cyan}`, 'letter-spacing:3px', 'text-align:left', 'margin-top:4px',
    ], '成長歷程'));
    const grownEntries = member.growth.log.filter((l) => Object.keys(l.gains).length > 0);
    if (grownEntries.length === 0) {
      card.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`, 'text-align:left'],
        '尚未成長——上場的表現會化為成長'));
    } else {
      for (const entry of grownEntries) {
        const m = career.schedule.find((x) => x.id === entry.matchId);
        const vs = m ? `對${opponentName(m.opponentId)}` : entry.matchId;
        const parts = Object.entries(entry.gains)
          .map(([k, n]) => `${ATTR_LABELS[k] ?? k}+${n}`).join('・');
        card.appendChild(el('div', ['font-size:12px', `color:${COLOR.text}`, 'text-align:left'],
          `${vs}：${parts}`));
      }
    }

    // ---- W5 逐出（B3：二次點擊確認，同「開始生涯覆蓋」範式；僅招募生可逐）----
    if (member.origin !== 'starter') {
      const gate = store.canExpel?.(member.id) ?? { ok: false, reason: 'unsupported' };
      const expelWrap = el('div', [
        'display:flex', 'flex-direction:column', 'gap:6px', 'margin-top:8px',
        'align-items:center', 'border-top:1px solid #2c3a58', 'padding-top:10px',
      ]);
      if (gate.ok) {
        // 後果一行全揭露（第一按才顯示）：trust −5、本屆不可再逐、該隊不可再招
        const consequence = el('div', [
          'display:none', 'font-size:11px', `color:${COLOR.red}`, 'text-align:center',
          'line-height:1.5', 'max-width:min(320px, 88vw)',
        ], `逐出後果：全隊信任 −5・本屆不可再逐・${opponentName(member.origin)}不可再招`);
        let armed = false;
        const expelBtn = smallButton(`逐出 ${member.name}`, () => {
          if (!armed) {
            armed = true;
            expelBtn.textContent = `將永久失去 ${member.name}——再點一次確認`;
            expelBtn.style.color = COLOR.red;
            expelBtn.style.borderColor = '#8a3a3a';
            consequence.style.display = 'block';
            return;
          }
          const ok = store.applyExpel?.({ memberId: member.id });
          hideCard();
          if (ok) dialogPlay([{ lines: EXPEL_LINES }], () => renderCareer());
          else renderCareer(); // 競態/資格失效：直接重繪
        });
        expelWrap.appendChild(consequence);
        expelWrap.appendChild(expelBtn);
      } else {
        const hint = gate.reason === 'in-lineup'
          ? '在先發／自由人位——先把他移出先發才能逐出'
          : gate.reason === 'season-limit'
            ? '本屆逐出額度已用完（每屆限 1 人）'
            : '此成員無法逐出';
        expelWrap.appendChild(el('div', [
          'font-size:12px', `color:${COLOR.dim}`, 'text-align:center', 'line-height:1.5',
        ], hint));
      }
      card.appendChild(expelWrap);
    }

    const closeBtn = smallButton('關閉', hideCard);
    closeBtn.style.alignSelf = 'center';
    card.appendChild(closeBtn);
    cardOverlay.replaceChildren(card);
    cardOverlay.style.display = 'flex';
  }

  // 名冊區（唯讀入口）：成員列點開隊友卡；capacity 語義＝含玩家與小守
  function rosterSection(career) {
    const roster = ensureStarterRoster(store);
    const box = el('div', [
      'display:flex', 'flex-direction:column', 'gap:8px', `background:${COLOR.card}`,
      'border-radius:14px', 'padding:12px 16px', 'width:min(340px, 92vw)', 'margin-top:4px',
    ]);
    if (!roster) { box.style.display = 'none'; return box; }
    const head = el('div', ['display:flex', 'justify-content:space-between', 'align-items:center']);
    head.appendChild(el('div', [
      'font-size:14px', `color:${COLOR.cyan}`, 'letter-spacing:3px',
    ], '名冊'));
    head.appendChild(el('div', ['font-size:13px', 'font-weight:700', `color:${COLOR.dim}`],
      `${rosterCount(roster)}/${roster.capacity}・招募空位 ${openSlots(roster)}`));
    box.appendChild(head);
    for (const member of roster.members) {
      const row = el('div', [
        'display:flex', 'justify-content:space-between', 'align-items:center',
        'height:40px', 'padding:0 10px', 'border-radius:10px', 'cursor:pointer',
        'background:rgba(30,40,64,0.55)',
      ]);
      const left = el('div', ['display:flex', 'align-items:center', 'gap:8px']);
      left.appendChild(el('div', ['font-size:15px', 'font-weight:700'], member.name));
      if (member.captain) {
        left.appendChild(el('div', [
          'font-size:10px', 'font-weight:800', 'color:#1a1405', `background:${COLOR.gold}`,
          'border-radius:6px', 'padding:1px 6px',
        ], '隊長'));
      }
      left.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`],
        `${ROLE_ABBR[member.role] ?? member.role}・${memberGradeLabel(member)}`));
      row.appendChild(left);
      row.appendChild(el('div', ['font-size:13px', `color:${COLOR.cyan}`], '▶'));
      row.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        showMemberCard(member, career);
      });
      box.appendChild(row);
    }
    return box;
  }

  // W4 招募區：五條進度與剩餘空位同時可見（空位 3、候選 5——取捨是設計意圖，
  // 玩家要看著全部進度決定養哪條線）；達成但額滿＝紅字明示、進度不清
  function recruitSection() {
    const rec = store.loadRecruitment();
    const roster = store.loadRoster();
    // 08-11：替代軸綁位置 ⇒ 進度列只列**你這個位置走得到**的路。列出走不到的路
    // ＝畫面承諾了判定端不會給的東西（本專案 08-11 才立的通則：提示的語意必須綁
    // 「那個動作真的做得到」的同一個判準）
    const myRole = store.loadPlayer()?.currentRole ?? null;
    const box = el('div', [
      'display:flex', 'flex-direction:column', 'gap:8px', `background:${COLOR.card}`,
      'border-radius:14px', 'padding:12px 16px', 'width:min(340px, 92vw)', 'margin-top:4px',
    ]);
    if (!rec || !roster) {
      box.style.display = 'none';
      return box;
    }
    // 大學卷批 6：大學階段一**暫停招募**（拍板）。不隱藏的話，大學賽季的畫面上會
    // 掛著一整排高中對手的招募進度（「曜石體中・MB・三年級・已畢業」）——那些人
    // 三年前就畢業了，招募條件也綁在高中賽程上，留著只會讓玩家以為還招得到。
    if (!isHighSchool(store.loadChapter?.())) {
      box.style.display = 'none';
      return box;
    }
    const slots = openSlots(roster);
    const head = el('div', ['display:flex', 'justify-content:space-between', 'align-items:center']);
    head.appendChild(el('div', [
      'font-size:14px', `color:${COLOR.cyan}`, 'letter-spacing:3px',
    ], '招募'));
    head.appendChild(el('div', ['font-size:13px', 'font-weight:700',
      `color:${slots > 0 ? COLOR.dim : COLOR.red}`], `名冊空位 ${slots}`));
    box.appendChild(head);
    // W6 擴池敘事（拍板待辦 3）：池 12 vs 位 5——從「圖鑑收集」轉「組建你的五人」
    box.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'line-height:1.5',
      'text-align:left'], '池子比位子深——收不下所有人，組出你要的那五個'));
    // W6：招募槽鍵＝recruitKey（同隊可掛招牌＋第二人）；成員對映走 member.recruitKey
    // （W6 前入隊的舊成員缺欄＝回退 origin，該世代 recruitKey 恆等 origin）
    const memberOf = (key) => roster.members.find((x) => (x.recruitKey ?? x.origin) === key);
    const seasonN = store.seasonIndex?.() ?? 1; // W1(P4)：目標年級/畢業下架顯示
    const waiting = waitingOf(rec); // P2②：等候名單（滿編達標者）
    for (const [key, cond] of Object.entries(RECRUIT_CONDS)) {
      const def = opponentById(cond.opponentId);
      const p = progressOf(rec, key);
      const done = rec.recruited.includes(key);
      const met = conditionMet(rec, key);
      const gone = !done && recruitTargetGone(key, seasonN); // 未招到且已畢業＝此線關閉
      const row = el('div', [
        'display:flex', 'flex-direction:column', 'gap:2px', 'padding:7px 10px',
        'border-radius:10px', `background:${done ? 'rgba(255,209,102,0.1)' : 'rgba(30,40,64,0.55)'}`,
        ...(gone ? ['opacity:0.55'] : []),
      ]);
      const top = el('div', ['display:flex', 'align-items:center', 'gap:8px']);
      const second = key !== cond.opponentId; // 同隊第二人（-2 鍵）
      top.appendChild(el('div', ['font-size:14px', 'font-weight:700', 'flex:1'],
        `${def?.name ?? cond.opponentId}${second ? '・第二人' : ''}`));
      top.appendChild(badge(ROLE_ABBR[cond.role] ?? cond.role, '#22304e', COLOR.cyan));
      // W1(P4) Q3 真實年級 UI 明示：三年級＝挖來只能用一年（金字警示色）
      const curGrade = Math.min(3, recruitCurrentGrade(key, seasonN));
      top.appendChild(badge(
        GRADE_LABEL[curGrade] ?? '',
        '#22304e', curGrade >= 3 ? COLOR.gold : COLOR.dim,
      ));
      if (gone) {
        top.appendChild(el('div', ['font-size:12px', 'font-weight:700', `color:${COLOR.dim}`],
          '已畢業'));
      } else if (done) {
        const m = memberOf(key);
        if (m) {
          top.appendChild(el('div', ['font-size:12px', 'font-weight:700', `color:${COLOR.gold}`],
            `✓ ${m.name} 已入隊`));
        } else {
          // 已招募但不在名冊＝已被逐出（凍結顯示、防重招；名字取 expelled 快照）
          const gone = (rec.expelled ?? [])
            .find((e) => (e.member?.recruitKey ?? e.member?.origin) === key)?.member;
          top.appendChild(el('div', ['font-size:12px', 'font-weight:700', `color:${COLOR.dim}`],
            `✗ ${gone?.name ?? ''} 已離隊`));
        }
      } else if (met && slots <= 0) {
        // P2②（07-30）：達標但滿編不再是黑洞——排隊等下屆畢業潮騰位（優先於新生）
        top.appendChild(el('div', ['font-size:12px', 'font-weight:700', `color:${COLOR.gold}`],
          waiting.includes(key) ? '🕒 等候名單・下屆優先' : '🕒 名冊已滿・將入等候'));
      } else if (met) {
        top.appendChild(el('div', ['font-size:12px', 'font-weight:700', `color:${COLOR.gold}`],
          '條件達成'));
      }
      row.appendChild(top);
      if (!done && !gone) {
        const parts = [];
        if (cond.wins != null) parts.push(`勝場 ${Math.min(p.wins, cond.wins)}/${cond.wins}`);
        if (cond.feat) {
          // 08-11 替代路徑卷：壯舉軸是 OR（feat 或任一 altFeat）⇒ 進度列要把替代路徑
          // 寫出來，否則「玩二傳／自由人推不動招募」只修了一半——另一半是玩家看不到路。
          // 用「或」串接、與 conditionMet 的 OR 語意逐字對應（提示的語意必須綁真正的判準）
          // 列出條件：原軸永遠列；替代軸列「你這個位置走得到的」，外加**已經有進度
          // 的**（08-11 第二輪覆審 N5：轉位之後那些進度會從畫面消失、卻仍計入
          // conditionMet ⇒ 玩家看到「條件達成」卻找不到是哪一條達成的）。後者標明
          // 需要回到哪個位置才會繼續累加。
          const altLines = altFeatsOf(cond).map((f) => {
            const cur = Math.min(p.alts[f.type] ?? 0, f.count);
            const usable = altFeatAvailableTo(f, myRole);
            if (!usable && cur <= 0) return null;
            const need = usable ? '' : `（需${ROLE_ABBR[altFeatRoleOf(f)] ?? ''}）`;
            return `${f.label} ${cur}/${f.count}${need}`;
          }).filter(Boolean);
          const feats = [
            `${cond.feat.label} ${Math.min(p.feat, cond.feat.count)}/${cond.feat.count}`,
            ...altLines,
          ];
          parts.push(feats.join(' 或 '));
        }
        // 08-09：stage 軸改成場次清單（準決賽∪決賽）⇒ 文案不能再寫死「決賽」
        if (cond.stage) parts.push(`在淘汰賽擊敗 ${p.stageCleared ? '✓' : '—'}`);
        row.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'text-align:left',
          'line-height:1.4'], parts.join('・')));
      }
      box.appendChild(row);
    }
    return box;
  }

  // 事件入帳＋效果套用（先落檔再播對話——中斷不掉進度），對話播完接 after
  // W4(P4) W3 債務 5：一次性事件過濾（跨屆持久旗標）——dueEvents 的呼叫端統一過
  function filterPlayedOnce(evs) {
    const played = new Set(store.loadPlayedOnce?.() ?? []);
    return evs.filter((e) => !played.has(e.id));
  }

  function fireEvents(evs, career, player, after) {
    let c = career;
    for (const e of evs) {
      c = recordEvent(c, e.id);
      if (e.effect?.trust) updateTrust(player, e.effect.trust); // 持久 baseline（劇情層專用路徑）
      if (e.effect?.unlock) {
        // 故事線傳授：冪等解鎖（點數時代已買過的不受影響）
        const k = e.effect.unlock;
        player.techniques[k] = Math.max(1, player.techniques[k] ?? 0);
        if (k === 'feint') player.techniques.feintUses = player.techniques.feintUses || 0;
      }
    }
    const okCareer = store.saveCareer(c);
    const okPlayer = store.savePlayer(player);
    // W4：一次性事件入帳跨屆旗標（debut 類生涯內不再重播）
    store.markPlayedOnce?.(evs.filter((e) => isOnceEvent(e.id)).map((e) => e.id));
    if (!okCareer || !okPlayer) setMsg('⚠ 存檔寫入失敗——事件進度可能未保存');
    dialogPlay(evs, after);
  }

  function exportSave() {
    try {
      const blob = new Blob([store.exportSave()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'volleyball-dream-save.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (err) {
      setMsg(`匯出失敗：${err.message ?? err}`);
    }
  }

  // ---- 主選單視圖 ----
  function renderHome() {
    root.replaceChildren();
    setMsg('');
    // schema v2（Phase 3 W1）：偵測到 Phase 2 舊存檔已被清空——如實告知，不留懸念
    if (store.wasLegacyReset?.()) {
      setMsg('Phase 2 存檔不相容，已重置——新的名冊時代從這裡開始');
    }
    root.appendChild(el('div', [
      'font-size:52px', 'font-weight:900', 'letter-spacing:10px',
      `color:${COLOR.gold}`, 'text-shadow:0 4px 24px rgba(0,0,0,0.8)',
    ], '排球夢'));
    root.appendChild(el('div', [
      'font-size:15px', `color:${COLOR.dim}`, 'letter-spacing:4px', 'margin-bottom:10px',
    ], '生涯模式'));

    // W4(P4) 題2：生涯入口收斂為選檔頁（進生涯前一層）——繼續/新生涯/匯入都在槽卡片上
    root.appendChild(button('▶ 生涯', true, renderSlots));
    root.appendChild(button('快速比賽', false, showQuickRolePicker));
    // 2026-08-12：常駐「怎麼玩」——`tutorial.js` 是開場一次性卡片（看過就再也不出現），
    // 忘了就查不到。這裡是可以隨時回來翻的那一份（生涯畫面底部也有同一個入口）。
    root.appendChild(button('❓ 怎麼玩', false, () => showHowToPlay()));
    root.appendChild(msgEl);
    // 2026-08-07 Sawmah 指定：build 戳記固定在主選單右下角。
    // 用途＝「我看不到新東西」時一秒分辨版本落差與邏輯問題（見 vite.config.js 的理由）。
    // `typeof` 守衛：測試環境直接 import 本檔時沒有 vite define，不能讓它 ReferenceError。
    root.appendChild(el('div', [
      'position:fixed', 'right:10px', 'bottom:8px', 'font-size:11px',
      `color:${COLOR.dim}`, 'letter-spacing:1px', 'opacity:0.75', 'pointer-events:none',
    ], `build ${typeof __BUILD_ID__ === 'undefined' ? 'dev' : __BUILD_ID__}`));
  }

  // ---- W4(P4) 題2 選檔頁：三槽卡片＝讀存檔頭不解整包；刪檔二次確認；零槽間互通 ----
  function enterSlot(slot, then) {
    store.useSlot?.(slot);
    primeSlot?.(); // 位置旗標回填（per-slot 寫入；main 提供）
    then();
  }

  function renderSlots() {
    root.replaceChildren();
    setMsg('');
    root.appendChild(el('div', [
      'font-size:30px', 'font-weight:900', 'letter-spacing:8px', `color:${COLOR.gold}`,
      'text-shadow:0 4px 24px rgba(0,0,0,0.8)',
    ], '選擇你的夢'));
    root.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`, 'letter-spacing:2px'],
      '三個存檔槽・各自獨立的生涯'));
    for (const { slot, head } of readSlotHeads(store.storage())) {
      root.appendChild(slotCard(slot, head));
    }
    root.appendChild(smallButton('返回主選單', renderHome));
    root.appendChild(msgEl);
  }

  function slotCard(slot, head) {
    const card = el('div', [
      `background:${COLOR.card}`, 'border-radius:14px', 'border:1px solid #2c3a58',
      'padding:14px 18px', 'width:min(340px, 92vw)', 'cursor:pointer',
      'display:flex', 'flex-direction:column', 'gap:6px', 'text-align:left',
    ]);
    const top = el('div', [
      'display:flex', 'justify-content:space-between', 'align-items:center', 'gap:10px',
    ]);
    if (head) {
      top.appendChild(el('div', ['font-size:17px', 'font-weight:800'], head.playerName));
      top.appendChild(badge(`槽 ${slot}`, 'rgba(110,231,255,0.15)', COLOR.cyan));
      card.appendChild(top);
      card.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`],
        `${roleLabel(head.role)}・第 ${head.seasonIndex} 屆・${head.heightCm}cm`));
      card.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`],
        `${head.wins} 勝 ${head.losses} 敗${(head.titles ?? 0) > 0 ? `・🏆 冠軍 ×${head.titles}` : ''}`));
      const row = el('div', ['display:flex', 'gap:8px', 'margin-top:4px']);
      const delBtn = smallButton('刪除', () => {
        // 二次確認（題2 拍板）：第一次點＝上膛變紅、第二次點才真刪；不可復原
        if (delBtn.dataset.armed !== '1') {
          delBtn.dataset.armed = '1';
          delBtn.textContent = '確定刪除？不可復原';
          delBtn.style.color = COLOR.red;
          delBtn.style.borderColor = '#8a3a3a';
          return;
        }
        enterSlot(slot, () => {
          store.clear();
          renderSlots();
        });
      });
      row.appendChild(delBtn);
      card.appendChild(row);
      card.addEventListener('pointerdown', () => enterSlot(slot, renderCareer));
    } else {
      top.appendChild(el('div', ['font-size:17px', 'font-weight:800', `color:${COLOR.dim}`], '新的夢'));
      top.appendChild(badge(`槽 ${slot}`, 'rgba(159,176,204,0.12)', COLOR.dim));
      card.appendChild(top);
      card.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`],
        '空的存檔槽——從這裡開始新的生涯'));
      const row = el('div', ['display:flex', 'gap:8px', 'margin-top:4px']);
      row.appendChild(smallButton('匯入存檔', () => enterSlot(slot, () => fileInput.click())));
      card.appendChild(row);
      card.addEventListener('pointerdown', () => enterSlot(slot, renderNewCareer));
    }
    return card;
  }

  // ---- 新生涯（W2 憲法 Q6/Q7 創角流程；W4 題2 起僅由空槽卡片進入）----
  function renderNewCareer() {
    root.replaceChildren();
    setMsg('');
    root.appendChild(el('div', [
      'font-size:30px', 'font-weight:900', 'letter-spacing:8px', `color:${COLOR.gold}`,
      'text-shadow:0 4px 24px rgba(0,0,0,0.8)',
    ], '新的夢'));
    root.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`, 'letter-spacing:2px'],
      `存檔槽 ${store.activeSlot?.() ?? 1}`));
    const newPanel = el('div', [
      'display:flex', 'flex-direction:column', 'align-items:center', 'gap:10px',
      `background:${COLOR.card}`, 'border-radius:14px', 'padding:16px 20px',
    ]);
    const nameInput = el('input', [
      'width:200px', 'height:44px', 'border-radius:10px', 'border:1px solid #2c3a58',
      'background:#0d1322', `color:${COLOR.text}`, 'font-size:16px', 'text-align:center',
    ]);
    nameInput.maxLength = 12;
    nameInput.placeholder = '你的名字';
    nameInput.value = '小夢';
    const heightInput = el('input', [
      'width:200px', 'height:44px', 'border-radius:10px', 'border:1px solid #2c3a58',
      'background:#0d1322', `color:${COLOR.text}`, 'font-size:16px', 'text-align:center',
    ]);
    heightInput.type = 'number';
    heightInput.inputMode = 'numeric';
    heightInput.placeholder = '身高（公分）';
    heightInput.value = '175';
    newPanel.appendChild(nameInput);
    newPanel.appendChild(heightInput);
    newPanel.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'line-height:1.5'],
      '輸入真實身高（140–220cm）——教練會誠實跟你談'));
    // 空槽入口理論上無舊檔；仍留二次確認守最後防線（匯入/競態把槽填了的邊界）
    let confirmArmed = false;
    const startBtn = button('開始生涯', true, () => {
      if (store.loadCareer() !== null && !confirmArmed) {
        confirmArmed = true;
        startBtn.textContent = '將覆蓋現有生涯——再點一次確認';
        startBtn.style.background = '#8a3a3a';
        return;
      }
      const playerName = nameInput.value.trim() || '小夢';
      // 超界＝軟提示後 clamp（憲法 W2 驗收條：不 crash、參數誠實映射不美化）
      const { cm, clamped } = clampHeightCm(heightInput.value);
      if (clamped) {
        setMsg(`教練看了體檢表一眼：「這數字……先按 ${cm}cm 記。」（有效範圍 140–220）`);
        heightInput.value = String(cm);
      }
      dialogPlay([{ lines: coachAdviceLines(cm) }], () => {
        showAspirationPicker(cm, (role) => {
          dialogPlay([{ lines: aspirationReplyLines(cm, role) }], () => {
            // 新生涯＝全新存檔：先清舊檔，否則 saveCareer 只覆寫 season/player、
            // 舊名冊（含隊友成長）/先發/招募會被繼承進「新」生涯。
            // 面談/志願中途返回都還沒走到這裡＝舊檔安全。
            store.clear();
            const career = createCareer({ seed: Date.now() % 1000000007, playerName });
            // 三年成長曲線於此刻預生成（career.seed 衍生子種子；heightGrowth）
            const player = createCareerPlayer(playerName, {
              heightCm: cm, aspiration: role, seed: career.seed,
            });
            if (!store.saveCareer(career) || !store.savePlayer(player)) {
              setMsg('存檔寫入失敗——瀏覽器儲存空間不可用（進度將無法保留）');
            }
            primeSlot?.(); // clear() 帶走了位置旗標——當場回填（不等下次重載）
            renderCareer();
          });
        });
      });
    });
    newPanel.appendChild(startBtn);
    root.appendChild(newPanel);
    root.appendChild(smallButton('返回選檔', renderSlots));
    root.appendChild(msgEl);
  }

  // ---- 生涯視圖（隊伍戰績＋賽程）----
  function renderCareer() {
    let career = store.loadCareer();
    const player = store.loadPlayer();
    if (!career || !player) { renderSlots(); return; } // 槽空/壞檔→回選檔頁（W4 題2）
    normalizeCareerPlayer(player); // 跨版本存檔補正（顯示與開賽同一套語意）
    // ★ 集訓中斷復原（2026-08-09 覆審 HIGH-1）★ advanceSeason 已落檔（屆數已推進）
    // 但集訓沒做完——手機殺 PWA／重整都會走到這裡。屆間鏈掛在「進入下一屆」鈕上、
    // 不會再跑第二次，沒有這一段的話該屆的屬性特訓與**一生一次**的默契選擇會永久消失
    // （搬家前的舊碼是同步套用屆間訓練營的耐力 +2 再 savePlayer，被殺仍保得住）。
    // 旗標由 advanceSeason 同一次 RMW 寫下、集訓完成時清掉 ⇒ 沒做完就一直在。
    // ★ 覆蓋層已開著就不重入（第三輪覆審 MEDIUM）★ 這一格是 runTrainingCamp 那道
    // 重入守衛的**對稱面**：守衛早退時會呼叫 onDone 把控制權交出去，而這裡的 onDone
    // 就是 renderCareer ⇒ 兩邊都不擋的話會無限遞迴。改由呼叫端先看旗標＝這條路徑
    // 不可能重入；campOpen 時照常往下渲染生涯視圖（覆蓋層在 body 上、蓋在它上面），
    // 集訓收掉時 onDone 會再 render 一次。
    if (!campOpen && isCampPending(player, store.seasonIndex?.() ?? 1)) {
      runTrainingCamp(player, career, () => renderCareer());
      return;
    }
    // 教學局（2026-08-12）：入隊第一天的隊內測試——創角完成後、group-1 之前。
    // ★ 為什麼掛在這裡而不是創角鏈的尾巴 ★ 創角鏈只跑一次，玩家在那一刻按了「跳過」
    // 之後就沒事；但**中斷**（教學局打到一半殺 app、或創角完馬上關掉）也會回到這裡——
    // 掛在 renderCareer 的入口＝這兩條路走同一個閘（同 campPending 的中斷復原範式）。
    // 旗標判定純函式在 `practiceMatch.tutorialInviteDue`（第一屆＋零戰績＋沒邀請過）。
    if (!tutorialInviteOpen && onPractice
      && tutorialInviteDue(career, store.seasonIndex?.() ?? 1)) {
      showTutorialInvite(career, player);
      return;
    }
    // W4(P4) Q8 局間存檔：合法離場（存檔離開）＝豁免棄賽判定；殘檔（比賽已結算或
    // 對不上 pending）＝清掉——不留「已結束比賽的假續玩入口」
    const mid = store.loadMidMatch?.() ?? null;
    const midValid = !!(mid && career.pendingMatch === mid.matchId
      && !career.results.some((r) => r.matchId === mid.matchId));
    if (mid && !midValid) store.clearMidMatch?.();
    // 拍板 07-22：中途退出＝棄賽敗（開賽 pending 標記未清＝沒打完就跑）；
    // 局間存檔是唯一豁免（Q8 手機場景保護——那不是跑，是暫停）
    // ★第三輪送審裁定 (a)（2026-08-26 Sawmah）★ 棄賽寫入失敗＝本輪存檔已知壞掉，
    // 旗標傳到出戰段：停用出戰鈕＋明示（打了成績也存不住，且兜底賽程的季後賽場次
    // 不在硬碟上，開打會在結算 recordResult 炸例外——送審實測重現）。
    let saveDegraded = false;
    const settled = midValid ? career : resolveForfeit(career);
    if (settled !== career) {
      const forfeited = settled.results.length > career.results.length;
      const saved = store.saveCareer(settled);
      // 職業章批 3 覆審 HIGH 修：saveCareer 起有內部副作用（職業章季後賽場次由
      // growProSchedule 在 RMW 裡長進存檔）——本地變數必須吃「寫入後重新讀出」的
      // 版本，不能停在 settled（長之前的形狀）。否則棄賽湊滿循環最後一場且晉級時，
      // 同一輪 render 的 seasonConcluded 會對「無 semi 列的過期 schedule」誤判已收束，
      // 玩家先看到假的「賽季落幕」、點結算再吃一句假的「存檔資料異常」。
      // ★送審反例修（第二輪）★ 只有寫入**成功**才信 loadCareer——寫入失敗時
      // loadCareer 讀回的是「未棄賽的舊存檔」，無條件重讀＝當輪棄賽判定被靜默撤銷，
      // 玩家可重打棄賽場次（反白嫖規則 07-22 被繞）。
      // ★第三輪修★ 失敗兜底不能直接吞 settled（長之前的形狀）——那會讓第一輪 HIGH
      // 的假「賽季落幕」在「寫入失敗＋晉級」組合下復活。改在記憶體端補跑同一顆
      // growProSchedule 純函式（saveCareer 內部那一步），畫面用的 career 恆與
      // 「寫入成功會讀回的形狀」一致：棄賽已判（反白嫖守住）＋季後賽場次看得到。
      let view = saved ? store.loadCareer() : null;
      if (!view) {
        saveDegraded = true; // 本輪畫面吃的是記憶體兜底——頭道閘據此攔下（裁定 a）
        const proId = store.loadPro?.() ?? null;
        view = proId
          ? { ...settled, schedule: growProSchedule(settled.schedule, settled.results, proId, settled.seed) }
          : settled;
      }
      career = view;
      if (forfeited) setMsg('上一場中途離開——依規記為棄賽敗（0:25）');
    }
    // ★裁定 (a) 頭道閘（2026-08-26 Sawmah 拍板選項 i）★
    // degraded＝棄賽寫入失敗＝本輪存檔已知壞掉。四輪送審證明「把守衛放在各分支」
    // 是打地鼠（對話段→季末鏈→薪水卡，旁支清單開放）——終解＝渲染函式唯一的
    // 頭道閘：這裡直接畫警示頁＋返回選檔，return。後面整個函式不執行，
    // 未來任何新分支天然被涵蓋（02 §6.1 收斂原則：讓旁支由建構上消失）。
    // 事件/薪水卡/結算零丟失——入帳本來就落不了碟，存檔修好後照常到期。
    if (saveDegraded) {
      root.replaceChildren();
      setMsg('');
      root.appendChild(el('div', [
        'font-size:26px', 'font-weight:800', `color:${COLOR.text}`, 'letter-spacing:2px',
      ], '⚠ 存檔空間異常'));
      root.appendChild(el('div', ['font-size:14px', `color:${COLOR.gold}`, 'max-width:520px'],
        '戰績目前寫不進存檔——出戰、結算與劇情選擇已暫停（做了也存不住）。'
        + '清出儲存空間或離開私密瀏覽模式後，重新整理再繼續。剛才的棄賽已依規記敗，'
        + '存檔修復後會重新入帳。'));
      root.appendChild(smallButton('返回選檔', renderSlots));
      root.appendChild(msgEl);
      return;
    }
    // stage 4 賽後事件：回到生涯畫面先播（入帳後不重複；播完重繪）。
    // W2(P4) canon 年級守衛：大山已畢業＝帶 elderId 的事件改播轉授版
    // W4：一次性事件（debut 類）跨屆旗標過濾——播過的生涯內不再播
    // 4.5A：宿敵三幕賽後版（勝/敗分版）＋小白事件二（數據觸發）併入同一管道——
    // 動態 id 走 career.events 去重（oldTeamPreEvents 同範式），小場先播、大場收尾
    const rosterForPost = store.loadRoster?.() ?? null;
    const seasonForPost = store.seasonIndex?.() ?? 1;
    const postEvs = [
      ...filterPlayedOnce(resolveEventsForRoster(
        // 第 3 參數＝屆數（`when.seasonIndex` 條件用；省略＝視同第 1 屆）
        dueEvents(career, 'post', seasonForPost), rosterForPost?.members ?? null,
      )),
      ...rivalPostEvents({ career, seasonIndex: seasonForPost, player }),
      ...n2PostEvents({ career, seasonIndex: seasonForPost, player, roster: rosterForPost }),
      // 探針卷（M4）：企業場甩開情蒐的得利端回饋（per-match id 入帳一場一次）
      ...corpShakeOffEvents(career),
    ];
    if (postEvs.length) {
      fireEvents(postEvs, career, player, () => renderCareer());
      return;
    }
    // W4(P4) Q9 導師接線（縫隙 1 層次二上線）：玩家=S 且最近一場有 box.mentor
    // → dueMentorLines 決定論選句（每場至多一句）；events 入帳防重播（mentor-<matchId>）
    if (player.currentRole === 'setter') {
      const lastR = career.results[career.results.length - 1];
      const mentorEvId = lastR ? `mentor-${lastR.matchId}` : null;
      if (lastR?.box?.mentor && !(career.events ?? []).includes(mentorEvId)) {
        const due = dueMentorLines(lastR.box.mentor);
        const marked = recordEvent(career, mentorEvId); // 無句也入帳——不重複檢查同一場
        store.saveCareer(marked);
        if (due) {
          dialogPlay([{ lines: due.lines }], () => renderCareer());
          return;
        }
        career = marked;
      }
    }
    // W4 招募入隊：條件達成且有空位→入隊（單次原子 RMW，冪等），賽後結算畫面彈
    // 儀式演出（名字/位置/屬性亮相）；播完重繪即見新成員入名冊
    const joined = settleRecruitJoins(store, career.seed);
    if (joined.length) {
      showRecruitCeremony(joined, () => renderCareer());
      return;
    }
    root.replaceChildren();
    setMsg('');
    const rec = careerRecord(career);
    const next = nextMatch(career);

    const seasonN = store.seasonIndex?.() ?? 1;
    root.appendChild(el('div', [
      'font-size:26px', 'font-weight:800', `color:${COLOR.text}`, 'letter-spacing:2px',
    ], `${career.playerName}・你·${ROLE_ABBR[player.currentRole] ?? 'OH'}${seasonN > 1 ? `・第 ${seasonN} 屆` : ''}`));
    // 大二卷批 5（U4，拍板題 7）：大學章身高**明確定型**——曲線耗盡不再靜默，
    // 抬頭直說；高中章（曲線未耗盡）逐字不變。判定單一定義＝heightGrowth.heightSettled
    const settledTag = heightSettled(player, seasonN)
      ? `・身高 ${Math.round((player.height?.current ?? 0) * 100)}cm（已定型）`
      : '';
    root.appendChild(el('div', ['font-size:14px', `color:${COLOR.dim}`],
      `${teamName()}・戰績 ${rec.wins} 勝 ${rec.losses} 敗・二傳信任 ${player.trust.fromSetter}${settledTag}`));
    root.appendChild(growthSection(career, player));
    // 屆間養成卷 E3（08-09）：默契計數顯示——非零才出現（第 1 屆 comboScale=0，
    // 計數結構上恆為 0 ⇒ 不需要任何屆數閘）。零效果，文案如實呈現計數。
    const chemBox = chemistrySection(player);
    if (chemBox) root.appendChild(chemBox);
    root.appendChild(rosterSection(career)); // W2 名冊（唯讀隊友卡入口）
    root.appendChild(recruitSection()); // W4 招募進度（五條進度×空位並列）
    const stage = careerStage(career);

    // W4(P4) 題1：賽季中「去找教練」請調入口（對話事件語彙、非功能按鈕——
    // gate 三條件成立才浮現；賽季已收束＝屆間談話的時段，不重疊）
    // 債 C 覆審 MEDIUM（08-25）：收束判準改接 seasonConcluded——舊寫法問 careerStage，
    // 它對大學 schema 恆回 'national' ⇒ 大學聯賽 8/8 打滿後這面板照樣浮現，
    // 跟「大一賽季結束」結算同框（高中章兩判準等值，行為不變）
    const transferRoles = transferCandidates({
      flags: store.loadPositionFlags?.() ?? {}, player, career,
    });
    if (transferRoles.length && !seasonConcluded(career)) {
      const t = el('div', [
        `background:${COLOR.card}`, 'border-radius:12px', 'border:1px dashed #3a4a68',
        'padding:10px 16px', 'width:min(340px, 92vw)', 'cursor:pointer',
        'font-size:13px', `color:${COLOR.dim}`, 'text-align:left', 'line-height:1.5',
      ], '🚪 去找教練——有些話，想當面說');
      t.addEventListener('pointerdown', () => showTransferTalk(career, player, transferRoles));
      root.appendChild(t);
    }

    // 循環賽卷（08-09）：本屆八強循環戰況（舊存檔無循環組＝null，整段不渲染）
    const rrTable = nationalGroupTable(career);

    // 賽程列（三區共用）：勝負／下一場／鎖定／止步後不再進行
    const rowFor = (m) => {
      const result = career.results.find((r) => r.matchId === m.id);
      const isNext = next?.id === m.id;
      const row = el('div', [
        'display:flex', 'justify-content:space-between', 'align-items:center',
        'height:52px', 'padding:0 16px', 'border-radius:12px', `background:${COLOR.card}`,
        `border:1px solid ${isNext ? COLOR.cyan : 'transparent'}`,
      ]);
      const title = m.label ? `${m.label}・${opponentName(m.opponentId)}` : opponentName(m.opponentId);
      // 批 3 B3：對手色塊——與 B2 同一入口 opponentAccentColor（不得兩處各自實作）；
      // 練習賽 opponentId 恆 null ⇒ 兩個 lookup 皆落空 ⇒ null ⇒ 不畫、不炸
      // 企業章批 2 覆審 LOW 修：第三張表也查（同 opponentName 的補全）
      // 職業章批 2：第四張表也查（B4 分母清單第 1 項，同 opponentName 的補全）
      const oppDef = opponentById(m.opponentId) ?? universityById(m.opponentId)
        ?? corporationById(m.opponentId) ?? proTeamById(m.opponentId) ?? null;
      const accent = opponentAccentColor(oppDef);
      const titleRow = el('div', ['display:flex', 'align-items:center', 'gap:6px', 'min-width:0']);
      if (accent != null) {
        titleRow.appendChild(el('div', [
          'width:5px', 'height:20px', 'border-radius:2px', 'flex-shrink:0',
          `background:${cssColor(accent)}`,
        ]));
      }
      // W6 A2：指定邀請場帶徽章（輪抽結果屆初公開，邀請場一眼可辨）
      titleRow.appendChild(el('div', [
        'font-size:16px', 'font-weight:600', 'white-space:nowrap', 'overflow:hidden', 'text-overflow:ellipsis',
      ], m.invited ? `⭐ ${title}` : title));
      row.appendChild(titleRow);
      let status;
      if (result) {
        status = el('div', [
          'font-size:15px', 'font-weight:700',
          `color:${result.won ? COLOR.gold : COLOR.red}`,
        ], `${result.won ? '勝' : '負'} ${result.scoreFor}:${result.scoreAgainst}`);
      } else if (isNext) {
        status = el('div', ['font-size:14px', `color:${COLOR.cyan}`], '▶ 下一場');
      } else if (stage === 'eliminated') {
        status = el('div', ['font-size:14px', `color:${COLOR.dim}`], '—');
      } else if (m.stage === 'national' && stage === 'group') {
        status = el('div', ['font-size:14px', `color:${COLOR.dim}`], '🔒');
      } else if (m.stage === 'national' && m.round !== 'rr' && rrTable && !rrTable.complete) {
        // 循環賽卷（08-09）：淘汰賽在循環組打完之前一律上鎖——「打得完才知道去不去得了」
        // `rrTable &&` 不可省：舊存檔沒有循環組（rrTable 為 null），那邊的國賽列要維持
        // 原本的「未開打」，不能因為這條新規則整排變成鎖頭
        status = el('div', ['font-size:14px', `color:${COLOR.dim}`], '🔒');
      } else {
        status = el('div', ['font-size:14px', `color:${COLOR.dim}`], '未開打');
      }
      row.appendChild(status);
      return row;
    };

    const list = el('div', [
      'display:flex', 'flex-direction:column', 'gap:8px', 'width:min(340px, 92vw)',
    ]);
    // 企業章批 3：group 場次空（大學/企業章）就不畫區頭——空區頭掛著高中語彙誤導章節
    const groupRows = career.schedule.filter((x) => x.stage === 'group');
    if (groupRows.length) {
      list.appendChild(el('div', [
        'font-size:14px', `color:${COLOR.cyan}`, 'letter-spacing:3px', 'margin-top:4px',
      ], '地區賽・小組循環'));
      for (const m of groupRows) list.appendChild(rowFor(m));
    }
    // 循環賽卷（08-09）：國賽分兩區顯示——循環組（打滿 3 場、前二晉級）與淘汰賽。
    // 舊存檔沒有 round 欄位 ⇒ rrRows 為空 ⇒ 只出現一個「全國賽・單淘汰」區＝原樣
    const rrRows = career.schedule.filter((x) => x.round === 'rr');
    const koRows = career.schedule.filter((x) => x.stage === 'national' && x.round !== 'rr');
    if (rrRows.length) {
      list.appendChild(el('div', [
        'font-size:14px', `color:${COLOR.cyan}`, 'letter-spacing:3px', 'margin-top:8px',
      ], `全國賽・八強循環（前 ${RR_ADVANCE} 名晉級）`));
      for (const m of rrRows) list.appendChild(rowFor(m));
      // 名次板：有任何循環戰績才出現（開打前是空表，沒有資訊量）
      if (rrTable && career.results.some((r) => rrRows.some((m) => m.id === r.matchId))) {
        const board = el('div', [
          `background:${COLOR.card}`, 'border-radius:12px', 'padding:8px 14px',
          'display:flex', 'flex-direction:column', 'gap:4px',
        ]);
        rrTable.table.forEach((row, i) => {
          const me = row.id === RR_PLAYER_ID;
          const line = el('div', [
            'display:flex', 'justify-content:space-between', 'font-size:13px',
            `color:${me ? COLOR.gold : (i < RR_ADVANCE ? COLOR.cyan : COLOR.dim)}`,
            me ? 'font-weight:700' : 'font-weight:400',
          ]);
          line.appendChild(el('div', [], `${i + 1}. ${me ? teamName() : opponentName(row.id)}`));
          // 淨得分要顯示出來：同勝場時它就是晉級與否的判準（roundRobinTable 的 tiebreak），
          // 不顯示的話玩家會看到「一樣 2 勝，為什麼是我出局」而找不到答案
          line.appendChild(el('div', [], `${row.wins} 勝 ${row.played - row.wins} 敗　`
            + `${row.diff > 0 ? '+' : ''}${row.diff}`));
          board.appendChild(line);
        });
        list.appendChild(board);
        list.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'text-align:left',
          'line-height:1.4', 'padding:0 14px'],
        `同勝場時比淨得分（右欄）——前 ${RR_ADVANCE} 名晉級準決賽`));
      }
    }
    if (koRows.length) {
      list.appendChild(el('div', [
        'font-size:14px', `color:${COLOR.cyan}`, 'letter-spacing:3px', 'margin-top:8px',
      ], '全國賽・單淘汰'));
      for (const m of koRows) list.appendChild(rowFor(m));
    }
    // ── 大學長循環（批 6）──：九隊單循環 8 場＋勝點制積分表
    const leagueRows = career.schedule.filter((x) => x.round === 'league');
    if (leagueRows.length) {
      list.appendChild(el('div', [
        'font-size:14px', `color:${COLOR.cyan}`, 'letter-spacing:3px', 'margin-top:4px',
      ], `大學聯賽・單循環（${leagueRows.length} 場・每場三戰兩勝）`));
      for (const m of leagueRows) list.appendChild(rowFor(m));
      const board = uniTable({
        schoolId: store.loadSchool?.() ?? '',
        seed: career.seed,
        schedule: career.schedule,
        results: career.results,
      });
      if (board.played > 0) {
        const panel = el('div', [
          `background:${COLOR.card}`, 'border-radius:12px', 'padding:8px 14px',
          'display:flex', 'flex-direction:column', 'gap:4px',
        ]);
        board.table.forEach((row, i) => {
          const me = row.id === UNI_PLAYER_ID;
          const line = el('div', [
            'display:flex', 'justify-content:space-between', 'font-size:13px',
            `color:${me ? COLOR.gold : (i < 3 ? COLOR.cyan : COLOR.dim)}`,
            me ? 'font-weight:700' : 'font-weight:400',
          ]);
          line.appendChild(el('div', [], `${i + 1}. ${row.name}`));
          // 積分要顯示在最前面：勝點制的重點就是「同樣 4 勝，積分可能不同」
          line.appendChild(el('div', [], `${row.points} 分　${row.wins}勝${row.losses}敗　`
            + `局 ${row.setsFor}-${row.setsAgainst}`));
          panel.appendChild(line);
        });
        list.appendChild(panel);
        list.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'text-align:left',
          'line-height:1.4', 'padding:0 14px'],
        '勝點制：2-0 勝 3 分／2-1 勝 2 分／1-2 敗 1 分／0-2 敗 0 分——輸得漂亮也拿得到分'));
      }
    }
    // ── 企業聯賽（批 3）──：八隊單循環 7 場＋勝點制積分表（鏡射大學 league 區；
    // corpTable 純函式重算，8 隊 7 輪成本可忽略）
    const corpRows2 = career.schedule.filter((x) => x.round === 'corp');
    if (corpRows2.length) {
      list.appendChild(el('div', [
        'font-size:14px', `color:${COLOR.cyan}`, 'letter-spacing:3px', 'margin-top:4px',
      ], `企業聯賽・單循環（${corpRows2.length} 場・每場三戰兩勝）`));
      for (const m of corpRows2) list.appendChild(rowFor(m));
      const board = corpTable({
        corpId: store.loadCorp?.() ?? '',
        seed: career.seed,
        schedule: career.schedule,
        results: career.results,
      });
      if (board.played > 0) {
        const panel = el('div', [
          `background:${COLOR.card}`, 'border-radius:12px', 'padding:8px 14px',
          'display:flex', 'flex-direction:column', 'gap:4px',
        ]);
        board.table.forEach((row, i) => {
          const me = row.id === CORP_PLAYER_ID;
          const line = el('div', [
            'display:flex', 'justify-content:space-between', 'font-size:13px',
            `color:${me ? COLOR.gold : (i < 3 ? COLOR.cyan : COLOR.dim)}`,
            me ? 'font-weight:700' : 'font-weight:400',
          ]);
          line.appendChild(el('div', [], `${i + 1}. ${row.name}`));
          line.appendChild(el('div', [], `${row.points} 分　${row.wins}勝${row.losses}敗　`
            + `局 ${row.setsFor}-${row.setsAgainst}`));
          panel.appendChild(line);
        });
        list.appendChild(panel);
        list.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'text-align:left',
          'line-height:1.4', 'padding:0 14px'],
        '勝點制：2-0 勝 3 分／2-1 勝 2 分／1-2 敗 1 分／0-2 敗 0 分——輸得漂亮也拿得到分'));
      }
    }
    // ── 職業聯賽（批 3）──：八隊單循環 7 場＋勝點制積分表（鏡射企業 league 區；
    // C1 凍結驗收：名次表只計循環賽場次——playoffRows 的 round 是 'semi'/'final'，
    // 不落在這個 filter 裡，proTable 內部同理只認 round==='pro'）
    const proRows2 = career.schedule.filter((x) => x.round === 'pro');
    if (proRows2.length) {
      list.appendChild(el('div', [
        'font-size:14px', `color:${COLOR.cyan}`, 'letter-spacing:3px', 'margin-top:4px',
      ], `職業聯賽・單循環（${proRows2.length} 場・每場三戰兩勝）`));
      for (const m of proRows2) list.appendChild(rowFor(m));
      const proBoard = proTable({
        teamId: store.loadPro?.() ?? '',
        seed: career.seed,
        schedule: career.schedule,
        results: career.results,
      });
      if (proBoard.played > 0) {
        const panel = el('div', [
          `background:${COLOR.card}`, 'border-radius:12px', 'padding:8px 14px',
          'display:flex', 'flex-direction:column', 'gap:4px',
        ]);
        proBoard.table.forEach((row, i) => {
          const me = row.id === PRO_PLAYER_ID;
          const line = el('div', [
            'display:flex', 'justify-content:space-between', 'font-size:13px',
            `color:${me ? COLOR.gold : (i < 4 ? COLOR.cyan : COLOR.dim)}`,
            me ? 'font-weight:700' : 'font-weight:400',
          ]);
          line.appendChild(el('div', [], `${i + 1}. ${row.name}`));
          line.appendChild(el('div', [], `${row.points} 分　${row.wins}勝${row.losses}敗　`
            + `局 ${row.setsFor}-${row.setsAgainst}`));
          panel.appendChild(line);
        });
        list.appendChild(panel);
        list.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'text-align:left',
          'line-height:1.4', 'padding:0 14px'],
        '勝點制：2-0 勝 3 分／2-1 勝 2 分／1-2 敗 1 分／0-2 敗 0 分——前 4 名晉級季後賽'));
      }
      // 季後賽 bracket（批 3）：長出場次才顯示——賽程項本身就是「長出來了沒」的事實
      // （growProSchedule 掛在 store.saveCareer，這裡只管顯示，不做任何推進判斷）
      const playoffRows = career.schedule.filter(
        (x) => x.round === PLAYOFF_ROUND.SEMI || x.round === PLAYOFF_ROUND.FINAL,
      );
      if (playoffRows.length) {
        list.appendChild(el('div', [
          'font-size:14px', `color:${COLOR.gold}`, 'letter-spacing:3px', 'margin-top:8px',
        ], '職業季後賽・四強單淘汰'));
        for (const m of playoffRows) list.appendChild(rowFor(m));
      }
    }
    root.appendChild(list);

    // W5 賽季輪迴：季末（奪冠/止步）→ 進入下一屆——名冊/招募/技巧/宿敵全保留。
    // 難度綁成就：止步＝對手原強度（帶著成長捲土重來）；奪冠＝衛冕屆對手升級
    // W6 A2：先選指定邀請（或不指定）再推進——選完即輪抽、賽程視圖直接公開結果
    // W1(P4) 時間系統：流程＝畢業儀式（我方三年級具名離別＋對手 ace 畢業播報）→
    // 指定邀請 → advanceSeason（名冊換血：畢業→年級推進→新生入學，單次 RMW）→
    // 新生入學見面 → 下屆開場（衛冕 defend／捲土重來 comeback）＋屆間訓練營
    const nextSeasonBtn = (label, openerKey) => button(label, true, () => {
      // W4(P4) 題1 二選一互斥：賽季中請調用掉＝當屆屆間談話不觸發——
      // 必須在 advanceSeason（events 逐屆重置）之前讀舊屆旗標
      const talkAllowed = interSeasonTalkAllowed(store.loadCareer() ?? career);
      const roster = ensureStarterRoster(store);
      const graduates = (roster?.members ?? []).filter((m) => (m.growth?.grade ?? 2) >= 3);
      const aceGrads = graduatingAces(store.seasonIndex?.() ?? 1);
      // W3(P4) 乙5：畢業儀式接演出框架——opening 對話 → 逐位聚光演出（WebGL 失敗
      // 在 ritual 內退化台詞卡）→ ace 播報＋收尾對話；三段同一事實源（segments）
      const segs = graduationCeremonySegments({
        graduates, aceGrads, members: roster?.members ?? [],
      });
      // 4.5A 止步降級版（拍板 §1-1）：本屆止步且國賽未實戰天鷹＝屆末旁觀播報——
      // 場邊看他奪冠（時序在畢業儀式前：賽事落幕→送學長）；三幕鏈不斷
      const beginGraduation = () => dialogPlay([{ lines: segs.opening }], () => showGraduationRitual({
        perGraduate: segs.perGraduate,
        onDone: () => dialogPlay([{ lines: [...segs.aceLines, ...segs.closing] }], () => {
          showInvitePicker((invitedId) => {
          const adv = store.advanceSeason?.({ invitedId });
          if (!adv) return;
          // W2(P4)：advanceSeason 已在存檔內揭曉身高——必須重載 player，
          // 拿閉包舊物件直接 savePlayer 會把新身高蓋回去（timeline 倒退）
          const freshPlayer = store.loadPlayer() ?? player;
          // 覆審 LOW-2：loadPlayer 不過 normalize ⇒ 玩家在集訓什麼都沒選時，
          // `updated === player`、`updated.chemistry` 是 undefined，會被寫回存檔。
          // 下次 renderCareer 雖然會自癒，但那是髒寫——在源頭補正。
          normalizeCareerPlayer(freshPlayer);
          const continueChain = () => {
            const seqs = [];
            // A3 跨帶檢查：長高跨進新身高帶＝教練追加動態評語（接在儀式演出後）
            if (adv.heightReveal) {
              const shift = bandShiftLines(adv.heightReveal.fromCm, adv.heightReveal.toCm);
              if (shift) seqs.push({ lines: shift });
            }
            const intro = freshmenIntroLines(adv.freshmen ?? []);
            if (intro.length) seqs.push({ lines: intro });
            // P2①（07-30）來投保底：本屆零招募＝屆末一名主動來投者（慕名而來，
            // 非挖角成功）——接在新生入學之後、開幕台詞之前
            const walkOnLines = walkOnIntroLines(adv.walkOn ?? null);
            if (walkOnLines.length) seqs.push({ lines: walkOnLines });
            // 4.5A 小白事件一・入學宣言（第 3 屆開幕限定；轉 L 玩家＝前輩自由人追加）
            const n2Intro = n2OpeningLines({ freshmen: adv.freshmen ?? [], player: freshPlayer });
            if (n2Intro.length) seqs.push({ lines: n2Intro });
            // 屆間養成卷 E6（08-09）：屆間訓練營那一句（「這個冬天沒白練…耐力 +2」）
            // 隨靜默事件一起被集訓吸收——現在耐力 +2 是玩家在集訓面板上**選**的，
            // 沒選也可能發生，開幕台詞不能替他宣告；那句話改由集訓面板當場回饋。
            const opener = [...(SEASON_OPENERS[openerKey] ?? [])];
            if (opener.length) seqs.push({ lines: opener });
            // W3(P4)：屆間鏈尾端接轉位教練談話（旗標 open 才觸發，無談話＝直接回賽程）
            // W4 題1：賽季中請調已用掉＝當屆屆間不談（talkAllowed 於換屆前捕捉）
            const afterTalk = () => (talkAllowed
              ? maybePositionTalk(() => renderCareer())
              : renderCareer());
            // P2②：等候名單遞補入隊＝走既有招募儀式（他真的是挖角來的，只是慢了一屆）
            const finish = () => ((adv.admitted ?? []).length
              ? showRecruitCeremony(adv.admitted, afterTalk)
              : afterTalk());
            if (seqs.length) dialogPlay(seqs, finish);
            else finish();
          };
          // W2(P4) 「你長高了」儀式演出（暗場聚光/身高尺/模型即時長高/參數刻度）
          const afterCamp = () => {
            if (adv.heightReveal) {
              showHeightRitual({
                player: freshPlayer, reveal: adv.heightReveal, onDone: continueChain,
              });
            } else {
              continueChain();
            }
          };
          // ★ 屆間養成卷 E4／E5／E6／E7（2026-08-09）：集訓 ★
          // 掛點＝advanceSeason **之後**（默契候選要吃畢業後的名冊）、身高儀式之前——
          // 位置就是先前那個靜默的「耐力 +2」所在，時序一格未動，只是從靜默變成有演出
          // 與選擇的一格。高中章固定三屆 ⇒ 這條鏈恰好跑兩次（seasonIndex 2 與 3）。
          // 待辦旗標由 advanceSeason 同一次 RMW 寫下（覆審 HIGH-1）；這裡被殺掉，
          // 重開時 renderCareer 會照旗標補跑一次（本函式的第二個呼叫端）。
          runTrainingCamp(freshPlayer, career, afterCamp);
          });
        }),
      }));
      const specEvs = rivalSpectatorEvents({ career, seasonIndex: seasonN });
      if (specEvs.length) fireEvents(specEvs, career, player, beginGraduation);
      else beginGraduation();
    });
    // W1(P4)：高中章固定三屆——第 3 屆收束不再推進；W4(P4) Q5 生涯結算在此開幕
    // ★ 章節閘（大學卷批 1，2026-08-14）★ 原本只看 stage + seasonN——那算得出
    // 「高中打完了」，但算不出「我已經在念大學」⇒ 已升學的存檔每次載入都會再長出
    // 這顆「▶ 生涯結算」。章節狀態存在 save.career.chapter（零遷移，舊檔回退高中）。
    // `loadChapter` 缺席（舊 store／測試替身）時 isHighSchool(undefined) 回 true
    // ＝維持現行行為，不用在這裡寫死字串（那會是第二個真相源）
    const careerOver = isHighSchool(store.loadChapter?.())
      && (stage === 'champion' || stage === 'eliminated') && seasonN >= 3;
    // ★ 升學已定（批 5）★ 這一格**排在整條分支鏈的最前面**，不是附加在旁邊：
    // 選完學校後 `careerOver` 會變 false（章節已是大學），沒有這道分支就會掉進下面的
    // 「▶ 進入下一屆——衛冕之路」——那顆按鈕被 `chapterCompleted` 擋著，按下去毫無反應
    // （對抗覆審實測到的死按鈕），而且「▶ 生涯結算」會整顆消失、三年結算再也看不到。
    // ★ 判準是「在不在大學章」，不是「學校讀不讀得出來」★ 二輪覆審實測：只看 school
    // 的話，`chapter=university` 但 `school` 解不開的存檔（手改過、或批 6 之後改過任何
    // 一個大學 id 的舊存檔）會兩邊都落空 ⇒ 直落「▶ 進入下一屆」的死按鈕，連生涯結算
    // 與升學入口都消失，玩家徹底卡死。防線要按「危險的效果」寫，不是按已知的入口。
    const inUniversity = !isHighSchool(store.loadChapter?.());
    const pickedSchool = universityById(store.loadSchool?.() ?? '');
    // 企業章批 3：pickedCorp 提升到旗標區（頭部/數據鈕/謝幕鈕/賽季結算四處共用；
    // 判準綁章節不綁年限——A3-4 分流）
    const pickedCorp = isCorporate(store.loadChapter?.())
      ? corporationById(store.loadCorp?.() ?? '') : null;
    // 職業章批 2：pickedPro 同款提升（B4 分母清單第 6 項「章節標籤/色塊」）——
    // 頭部/數據鈕/謝幕鈕三處與 pickedCorp 並列，優先序在 corp 之前（現在的章）
    const pickedPro = isPro(store.loadChapter?.())
      ? proTeamById(store.loadPro?.() ?? '') : null;
    const uniLeague = career.schedule.filter((x) => x.round === 'league');
    const corpGames = career.schedule.filter((x) => x.round === 'corp');
    // 企業賽季打完了沒（A3-1 的 seasonConcluded 擴充；corpGames 守衛同 uniLeague 慣例）
    const corpSeasonDone = !!pickedCorp && corpGames.length > 0 && seasonConcluded(career);
    // 大學賽季打完了沒（批 6）→ 債 C 收斂：判準單一定義在 seasonConcluded
    // （league 全有結果）；uniLeague.length 守衛保留＝league 空的壞存檔不進結算分支
    const uniSeasonDone = inUniversity && uniLeague.length > 0 && seasonConcluded(career);
    const proGames = career.schedule.filter((x) => x.round === 'pro');
    // 職業賽季打完了沒（C3 的 seasonConcluded pro 分支——循環＋若晉級季後賽則含
    // 季後賽場次全有結果；proGames 守衛同 corpGames/uniLeague 慣例）
    const proSeasonDone = !!pickedPro && proGames.length > 0 && seasonConcluded(career);
    if (inUniversity) {
      // 企業章批 2 覆審 MEDIUM 修：簽約後的頭部要說實話——公司名＋企業聯賽年份，
      // 不是舊大學的「🎓 升學已定」。★只換頭部文案，分支結構不動★ inUniversity
      // 仍是「非高中」語意（上方註解的卡死防線靠它）。
      // 職業章批 2：pickedPro 同款頭部——簽下職業隊之後說實話（隊名＋職業聯賽年份）
      if (pickedPro) {
        root.appendChild(el('div', [
          'font-size:20px', 'font-weight:900', `color:${COLOR.gold}`, 'margin-top:8px',
          'letter-spacing:2px',
        ], `🏐 ${pickedPro.name}`));
        root.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`, 'line-height:1.7'],
          `職業聯賽——第 ${chapterSeasonOf(store.loadChapter?.(), seasonN)} 年`));
      } else if (pickedCorp) {
        root.appendChild(el('div', [
          'font-size:20px', 'font-weight:900', `color:${COLOR.gold}`, 'margin-top:8px',
          'letter-spacing:2px',
        ], `🏢 ${pickedCorp.name}`));
        root.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`, 'line-height:1.7'],
          `企業聯賽——第 ${chapterSeasonOf(store.loadChapter?.(), seasonN)} 年`));
      } else {
        root.appendChild(el('div', [
          'font-size:20px', 'font-weight:900', `color:${COLOR.gold}`, 'margin-top:8px',
          'letter-spacing:2px',
        ], pickedSchool ? `🎓 ${pickedSchool.name}` : '🎓 升學已定'));
        root.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`, 'line-height:1.7'],
          pickedSchool
            ? `升學已定——大學第 ${chapterSeasonOf(store.loadChapter?.(), seasonN)} 年`
            : '升學已定，但存檔裡的學校讀不出來'));
      }
      // 決定升學不該是「把高中鎖起來」——三年回得去。
      // ★ 但不是「生涯結算」★ 批 1 的凍結驗收 B1-3② 明訂大學章不得再出現那顆按鈕
      //（`tests/chapter-wiring.test.mjs`；理由：已經在念大學了還跳「三年的一切」＝
      // 系統分不出章節，而且它會再播一次謝幕、再把人導去升學）。回顧走**數據頁**——
      // 同樣看得到三屆戰績，但它是唯讀的，不是章節流程的入口。
      root.appendChild(button(
        // A3-4：企業章不再是「三年」；職業章批 2 同款
        (pickedCorp || pickedPro) ? '📊 回看生涯數據' : '📊 回看三年的數據',
        false, () => showCareerTotals(),
      ));
      // 大學謝幕卷 批 2（B2-1，2026-08-25）：大四還在打的時候先亮出（禁用的）謝幕鈕——
      // 讓玩家知道終點在哪；賽季打完後同一個位置會換成可按的真鈕（下面 uniSeasonDone
      // 分支）。禁用樣式沿用既有的成長面板 disabled 慣例（opacity:0.5＋native disabled）。
      // A3-4：判準加 !pickedCorp——企業章年限（CHAPTER_SEASONS.corporate）未來被
      // 調大時，這顆大學語彙的「🎓 謝幕」鈕也不得在企業章冒出（批 2 修補送審追蹤項②）
      // 職業章批 2：判準再加 !pickedPro（同一顆理由，職業章也不得冒出大學語彙的謝幕鈕）
      if (!pickedCorp && !pickedPro && chapterSeasonOf(store.loadChapter?.(), seasonN) >= 4 && !uniSeasonDone) {
        const finaleBtn = el('button', [
          'min-width:220px', 'height:52px', 'padding:0 24px', 'border-radius:26px',
          'border:none', 'font-size:17px', 'font-weight:700', 'cursor:not-allowed',
          'touch-action:manipulation', 'letter-spacing:1px',
          `background:rgba(30,40,64,0.9);color:${COLOR.dim};opacity:0.5`,
        ], '🎓 謝幕');
        finaleBtn.disabled = true;
        root.appendChild(finaleBtn);
        root.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`,
          'max-width:min(340px,92vw)', 'text-align:center', 'line-height:1.6'],
        '把大四聯賽打完，才能開啟謝幕儀式'));
      }
    }
    // 企業章批 4（A4-2）：薪水選擇點——第 2 場打完、賽季未完、未選過才播；
    // 選完旗標＋加成同一次 RMW（store.corpPaydayChoice），re-render 不重播。
    // 覆審 MEDIUM 修：比照 campOpen——旗標守衛＋return（覆蓋層收掉時會再 render 一次）
    if (pickedCorp && !corpPaydayOpen && corpPaydayDue(career)) {
      showCorpPayday();
      return;
    }
    // ★ 分支鏈：大學賽季結束才佔位 ★ 還在打的時候要落到下面的「▶ 出戰」——
    // 第一版把整個大學章都攔在鏈首，結果賽程生出來了卻沒有入口，一場都打不了。
    // 企業章批 3（A3-2）：企業賽季結束＝名次＋收尾卡；未結束照樣落到「▶ 出戰」
    // 職業章批 3（C1/C5）：同款分支，排在鏈首——章節互斥（同一份存檔只會有一個
    // pickedXxx 非 null），順序本身不影響行為，只是沿用「當前章節優先」的既有排法
    // （裁定 (a) 的 degraded 攔截已收斂為 renderCareer 頭道閘——見棄賽分支後那段；
    //  此處分支鏈只會在存檔健康時執行）
    if (proSeasonDone) {
      const board = proTable({
        teamId: pickedPro.id, seed: career.seed,
        schedule: career.schedule, results: career.results,
      });
      const me = board.table.find((r) => r.id === PRO_PLAYER_ID);
      // 季後賽戰況（有沒有打進四強／奪冠）——由賽程是否長出 semi/final 場次判斷，
      // 不是由循環名次判斷：循環第 4 名照樣可能爆冷奪冠（C2 種子制的醍醐味）
      const playoffRows = career.schedule.filter(
        (x) => x.round === PLAYOFF_ROUND.SEMI || x.round === PLAYOFF_ROUND.FINAL,
      );
      const madePlayoffs = playoffRows.length > 0;
      const finalRow = playoffRows.find((x) => x.round === PLAYOFF_ROUND.FINAL);
      const champion = !!(finalRow && career.results.find((r) => r.matchId === finalRow.id)?.won);
      root.appendChild(el('div', [
        'font-size:22px', 'font-weight:900', `color:${champion ? COLOR.gold : COLOR.cyan}`,
        'margin-top:8px', 'letter-spacing:2px',
      ], champion ? '🏆 職業聯賽冠軍！'
        : (madePlayoffs ? '止步季後賽' : `聯賽第 ${board.playerRank} 名`)));
      root.appendChild(el('div', ['font-size:14px', `color:${COLOR.dim}`, 'line-height:1.7'],
        `職業元年賽季結束——${me?.wins ?? 0} 勝 ${me?.losses ?? 0} 敗・積分 ${me?.points ?? 0}`
        + (madePlayoffs ? `（循環第 ${board.playerRank} 名晉級季後賽）` : '')));
      root.appendChild(button('▶ 賽季落幕——職業元年', true,
        () => showProSeasonClosing({ champion, madePlayoffs, board })));
    } else if (corpSeasonDone) {
      const board = corpTable({
        corpId: pickedCorp.id, seed: career.seed,
        schedule: career.schedule, results: career.results,
      });
      const me = board.table.find((r) => r.id === CORP_PLAYER_ID);
      root.appendChild(el('div', [
        'font-size:22px', 'font-weight:900', `color:${board.playerRank === 1 ? COLOR.gold : COLOR.cyan}`,
        'margin-top:8px', 'letter-spacing:2px',
      ], board.playerRank === 1 ? '🏆 企業聯賽冠軍！' : `聯賽第 ${board.playerRank} 名`));
      root.appendChild(el('div', ['font-size:14px', `color:${COLOR.dim}`, 'line-height:1.7'],
        `企業元年賽季結束——${me?.wins ?? 0} 勝 ${me?.losses ?? 0} 敗・積分 ${me?.points ?? 0}`));
      root.appendChild(button('▶ 賽季落幕——企業元年', true, () => showCorpSeasonClosing(board)));
    } else if (uniSeasonDone) {
      const board = uniTable({
        schoolId: store.loadSchool?.() ?? '', seed: career.seed,
        schedule: career.schedule, results: career.results,
      });
      const me = board.table.find((r) => r.id === UNI_PLAYER_ID);
      const uniYear = chapterSeasonOf(store.loadChapter?.(), seasonN);
      root.appendChild(el('div', [
        'font-size:22px', 'font-weight:900', `color:${board.playerRank === 1 ? COLOR.gold : COLOR.cyan}`,
        'margin-top:8px', 'letter-spacing:2px',
      ], board.playerRank === 1 ? '🏆 大學聯賽冠軍！' : `聯賽第 ${board.playerRank} 名`));
      root.appendChild(el('div', ['font-size:14px', `color:${COLOR.dim}`, 'line-height:1.7'],
        `大${['一', '二', '三', '四'][uniYear - 1] ?? uniYear}賽季結束——${me?.wins ?? 0} 勝 ${me?.losses ?? 0} 敗・積分 ${me?.points ?? 0}`));
      // 大二卷批 1：推進入口——store.advanceSeason 大學分支（換血＋新賽程同一次
      // RMW）。批 4：先送別（畢業者具名/ace/通用三級台詞）再新生亮相，演出完落回
      // 新賽季的生涯畫面；台詞單一事實源＝uniGraduation.js
      if (uniYear < 4) {
        root.appendChild(button(`▶ 進入大${['一', '二', '三', '四'][uniYear] ?? uniYear + 1}`, true, () => {
          const adv = store.advanceSeason?.();
          if (!adv) return;
          const seqs = [];
          const farewell = uniGraduationLines(adv.graduates ?? []);
          if (farewell.length) seqs.push({ lines: farewell });
          const intro = uniFreshmenIntroLines(adv.freshmen ?? []);
          if (intro.length) seqs.push({ lines: intro });
          if (seqs.length) dialogPlay(seqs, () => renderCareer());
          else renderCareer();
        }));
        root.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`, 'max-width:min(340px,92vw)',
          'text-align:center', 'line-height:1.6'],
        '屬性、技術與這一年的名次都會帶著走'));
      } else {
        // 大學謝幕卷 批 2（2026-08-25）：批 4 的佔位卡在此正式換成真儀式
        // （①四年回顧②同屆送別③終卡）；年限封頂仍由 chapterCompleted 擋著推進，
        // 這裡只開儀式——結算（批 1 settleUniFinale）在 showUniFinaleCeremony 內接線
        root.appendChild(button('▶ 四年打完了——謝幕', true, () => showUniFinaleCeremony()));
        // 企業章批 2（2026-08-25，acceptance-corp-batch2 A2-3）：謝幕已結算的存檔
        // 才長出下一章入口——謝幕先於下一章（未結算連按鈕都沒有，不是按了沒反應）
        if (store.uniFinaleSettled?.()) {
          root.appendChild(button('▶ 前往下一個舞台', false, () => showCorpDraft()));
        }
      }
    } else if (careerOver) {
      root.appendChild(el('div', [
        'font-size:22px', 'font-weight:900', `color:${stage === 'champion' ? COLOR.gold : COLOR.cyan}`,
        'margin-top:8px', 'letter-spacing:2px',
      ], stage === 'champion' ? '🏆 全國冠軍！' : `止步全國賽`));
      root.appendChild(el('div', ['font-size:14px', `color:${COLOR.dim}`],
        `第 3 屆結束（${rec.wins} 勝 ${rec.losses} 敗）——高中三年，打完了`));
      // 4.5A 屆末鏈（第 3 屆）：幕三旁觀版（止步且未實戰天鷹）→ 小白事件三・承認
      // → 生涯結算——賽事落幕在前、更衣室告白在後、結算收尾
      root.appendChild(button('▶ 生涯結算——三年的一切', true, () => {
        const endEvs = [
          ...rivalSpectatorEvents({ career, seasonIndex: seasonN }),
          ...n2FinaleEvents({ career, player, roster: store.loadRoster?.() ?? null }),
        ];
        const goFinale = () => showCareerFinale(career, player, stage === 'champion');
        if (endEvs.length) fireEvents(endEvs, career, player, goFinale);
        else goFinale();
      }));
      // ★ 升學的第二道門（批 5）★ 謝幕後的過場卡也會接到同一個畫面，但那張卡點一下
      // 就消失——沒有這顆按鈕，錯過的人就再也回不去升學了（升學是整章的分岔）。
      root.appendChild(button('▶ 決定升學志願', false, () => showAdmission()));
    } else if (!inUniversity && stage === 'champion') {
      // ★ `!inUniversity` 是死按鈕的防線 ★ 這兩個分支給的是「▶ 進入下一屆」，
      // 而大學章的推進被 `chapterCompleted` 擋著＝按了沒反應。判準綁**章節**，
      // 不綁 school 值——手改過的存檔（chapter 是大學、school 讀不出來）也擋得住。
      root.appendChild(el('div', [
        'font-size:22px', 'font-weight:900', `color:${COLOR.gold}`, 'margin-top:8px',
        'letter-spacing:2px',
      ], '🏆 全國冠軍！'));
      root.appendChild(el('div', ['font-size:14px', `color:${COLOR.dim}`],
        `奪冠達成（${rec.wins} 勝 ${rec.losses} 敗）`));
      root.appendChild(nextSeasonBtn('▶ 進入下一屆——衛冕之路', 'defend'));
      root.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`,
        'max-width:min(340px, 92vw)', 'text-align:center', 'line-height:1.5'],
      '全國都在研究衛冕軍——來年的對手，會更強'));
    } else if (!inUniversity && stage === 'eliminated') {
      // 循環賽卷（08-09）：止步點只認**淘汰賽**的那一敗——循環組輸球不止步，
      // 沒有淘汰賽敗績而走到這裡＝循環打滿沒進前二，那句要講「八強循環」不是某一場
      const lost = career.results.find((r) => {
        const m = career.schedule.find((x) => x.id === r.matchId);
        return !r.won && m?.stage === 'national' && m.round !== 'rr';
      });
      const lostLabel = lost
        ? (career.schedule.find((m) => m.id === lost.matchId)?.label ?? '全國賽')
        : '八強循環';
      root.appendChild(el('div', [
        'font-size:20px', 'font-weight:800', `color:${COLOR.red}`, 'margin-top:8px',
      ], `止步${lostLabel}`));
      root.appendChild(el('div', ['font-size:14px', `color:${COLOR.dim}`],
        `本屆戰績 ${rec.wins} 勝 ${rec.losses} 敗`));
      root.appendChild(nextSeasonBtn('▶ 捲土重來——進入下一屆', 'comeback'));
      root.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`,
        'max-width:min(340px, 92vw)', 'text-align:center', 'line-height:1.5'],
      '名冊成長、招募進度、學會的技巧全數保留——變強的是你們'));
    } else if (midValid && next && next.id === mid.matchId) {
      // W4(P4) Q8 局間存檔續玩：比賽進行中（第 N 局打完存檔離開）——跳過對陣畫面
      // 與賽前事件（都播過了），直接回到局間 huddle
      root.appendChild(button(
        `▶ 繼續比賽 ${opponentName(next.opponentId)}（第 ${(mid.savedAtSet ?? 1) + 1} 局起）`,
        true,
        () => {
          hide();
          onPlay({ career, player, matchEntry: next, resumeMid: mid });
        },
      ));
      root.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`],
        '局間存檔——從換邊休息點恢復'));
    } else if (next) {
      // stage 4 賽前事件：先播對話（trust 效果先套用），播完進場
      const startMatch = () => {
        const go = () => {
          hide();
          onPlay({ career: store.loadCareer() ?? career, player, matchEntry: next });
        };
        // W7 D1 舊隊情結：靜態表＋動態事件（對戰原隊的招募生賽前對話）合流；
        // fireEvents 以 e.id 入帳＝動態 id 同管道去重（每人對原隊一生一次）。
        // W2(P4) canon 年級守衛：大山已畢業＝teach-jump/rematch 改播轉授版
        // 4.5A：宿敵三幕賽前版（幕一首遇/幕二牆邊/幕三對峙；鏡子/牆分版）收尾合流
        const rosterNow = store.loadRoster?.() ?? null;
        // B-3 身高誠實化：生涯開場（第 1 屆開幕，group-1 賽前）教練轉位引導——
        // 限定第一場觸發點；已播過/不合條件時 heightGuidanceEventFor 回 null（events.js）
        const heightEv = next.id === 'group-1' ? heightGuidanceEventFor(career, player) : null;
        const preEvs = [
          ...(heightEv ? [heightEv] : []),
          // 第 3 參數＝屆數（`when.seasonIndex` 條件用——teach-call 掛第 2 屆第一場賽前）
          // 位置分歧（2026-08-06）排在年級守衛**之後**：守衛會整組換成 altLines，
          // 先追加會被覆蓋掉（見 events.js resolveEventsForRole 檔頭）
          ...filterPlayedOnce(resolveEventsForRole(resolveEventsForRoster([
            dueEvents(career, 'pre', store.seasonIndex?.() ?? 1),
            // ★ 屆間養成卷 E5 的安全網（08-09）★ 叫戰術的正規教學點已搬進第一次集訓，
            // 但「更新版本時存檔剛好停在集訓之後」的在途舊檔，那條屆間鏈跑的是舊碼、
            // 集訓根本沒出現過 ⇒ 只掛集訓會讓那些存檔**永遠**學不到，覆蓋率從 100% 掉下來。
            // 補在**原本的掛點**（第 2 屆第一場賽前）上：時機不晚於搬家前、覆蓋率只會
            // ≥ 舊值。正常流程下集訓已經教完並入帳，這裡取回的是空陣列（不會重播）。
            dueEvents(career, 'camp', store.seasonIndex?.() ?? 1),
          ].flat(), rosterNow?.members ?? null), player?.currentRole ?? null)),
          ...oldTeamPreEvents(career, rosterNow),
          ...rivalPreEvents({ career, seasonIndex: store.seasonIndex?.() ?? 1, player }),
          // 企業章批 4（A4-3）：首戰擎空航太＝王勝翔亮相（fireEvents 入帳一生一次）
          ...corpAnchorPreEvents(career, next),
          // 職業章批 5（G2）：王勝翔同場宿敵線——同隊/敵隊兩情境互斥，各自一生一次
          ...proWangRivalPreEvents(career, next, store.loadPro?.() ?? null),
        ];
        if (preEvs.length) fireEvents(preEvs, career, player, go);
        else go();
      };
      // W8 對陣畫面（07-26 拍板）：出戰必經——對面具名亮相＋球場對位排陣；
      // 「返回（不出戰）」鈕可退出（取代舊 ⚙ 先發編排 opt-in 面板與敵情一行字；U1 07-30 改鈕不點外側）
      root.appendChild(button(`▶ 出戰 ${opponentName(next.opponentId)}`, true,
        () => showMatchupScreen(career, player, next, startMatch)));
    }
    const ioRow = el('div', ['display:flex', 'gap:10px', 'margin-top:4px', 'flex-wrap:wrap']);
    ioRow.appendChild(smallButton('返回選檔', renderSlots)); // 生涯的上一層＝選檔頁（W4 題2）
    ioRow.appendChild(smallButton('📊 生涯數據', showCareerTotals)); // W4 Q9 累積頁
    // 2026-08-12：怎麼玩（與主選單同一頁）——查玩法不必先退出生涯
    ioRow.appendChild(smallButton('❓ 怎麼玩', () => showHowToPlay()));
    ioRow.appendChild(smallButton('匯出存檔', exportSave));
    // 4.5B §2-3：招牌演出開關（全域偏好；off 只省演出，真值字卡不受影響）
    const prefLabel = () => `🎬 演出：${loadPresentationPref(window.localStorage) === 'off' ? '關' : '開'}`;
    const prefBtn = smallButton(prefLabel(), () => {
      const cur = loadPresentationPref(window.localStorage);
      savePresentationPref(window.localStorage, cur === 'off' ? 'on' : 'off');
      prefBtn.textContent = prefLabel();
    });
    ioRow.appendChild(prefBtn);
    root.appendChild(ioRow);
    root.appendChild(msgEl);
  }
  // 🔓 手批面板已移除（07-27 Sawmah 拍板：四位置驗收完結→版本級 open，見
  // positionFlags.ENGINEERED_OPEN；未來新位置驗收用 ?openPosition= 入口即可）

  // 配色卷階段二 E5（對抗覆審 CRITICAL 修）→ 債 C 收斂（2026-08-25）：即時季
  // 「進行中」＝「季未收束」，判準單一定義在 careerState.seasonConcluded（章節偵測
  // 走賽程 schema：大學＝league 全有結果、league 空的壞存檔安全回退進行中；
  // 高中＝careerStage 收束事實）。這裡不再手抄 league 判斷式。
  function liveSeasonOngoing(career) {
    return !seasonConcluded(career);
  }

  // ---- W4(P4) Q5 生涯結算（第 3 屆終點）：三屆定格→招募全記錄→關鍵球典藏→
  // 隊友具名送別→主角版畢業儀式（逐位聚光鏈單人版）→下一章佔位。
  // 資料底＝Q9 累積頁（歷屆封存＋本屆）＋recruitment＋finalRally（VCR 典藏）----
  function showCareerFinale(career, player, champion) {
    const seasons = [...(store.loadSeasonArchive?.() ?? [])];
    seasons.push({
      ...archiveSeasonSummary({ index: store.seasonIndex?.() ?? 1, results: career.results }),
      // 配色卷階段二 E5：archive 陣列外那筆即時季用收束事實判定（雙源），不再硬寫
      // true——判準單一定義在 liveSeasonOngoing（章節感知）
      current: liveSeasonOngoing(career),
    });
    const roster = store.loadRoster?.();
    const memberNames = {};
    for (const m of roster?.members ?? []) {
      if (m.origin && m.origin !== 'starter') memberNames[m.origin] = m.name;
    }
    const data = buildFinaleSummary({
      seasons, recruitment: store.loadRecruitment?.(), memberNames,
    });
    const vault = store.loadRallyVault?.() ?? { champion: null, rival: {} };

    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:36', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:safe center', 'overflow-y:auto',
      // 07-28 試玩截圖抓到：0.94 讓底下生涯畫面的成長區塊（點數/力量 62+…）透出來，
      // 跟主角聚光模型疊成一團。結算是「全遊戲唯一上限規格」的儀式——底下的 UI
      // 一格都不該透出來
      'background:#04060c', 'gap:10px', 'padding:26px 14px',
    ]);
    overlay.appendChild(el('div', ['font-size:14px', `color:${COLOR.dim}`, 'letter-spacing:5px'],
      '生涯結算'));
    // TODO(uni-finale) 大學章結算接線時 showCareerFinale() 必查此行。
    // 債 C 已對齊（2026-08-25，acceptance-uni-finale-align.md）：季收束單一定義
    // ＝careerState.seasonConcluded（本檔 liveSeasonOngoing/uniSeasonDone 都接它）；
    // advanceSeason 對大學 schema 顯式 no-op（TODO(uni-year2)，不再靠 careerStage
    // 死鎖）；chapterCompleted 維持**年限封頂**語意與收束互補。大二接線＝推進條件
    // 該是「seasonConcluded && !chapterCompleted」＋uniSchedule 重建。
    overlay.appendChild(el('div', [
      'font-size:26px', 'font-weight:900', `color:${COLOR.gold}`, 'letter-spacing:3px',
      'text-shadow:0 4px 24px rgba(0,0,0,0.8)',
    ], `${career.playerName}・遊隼高中三年`));
    // 三屆戰績定格
    for (const sn of data.seasons) {
      const card = el('div', [
        `background:${COLOR.card}`, 'border-radius:12px', 'border:1px solid #2c3a58',
        'padding:9px 16px', 'width:min(340px, 94vw)', 'display:flex',
        'justify-content:space-between', 'align-items:center',
      ]);
      card.appendChild(el('div', ['font-size:14px', 'font-weight:800'], `第 ${sn.index} 屆`));
      card.appendChild(el('div', ['font-size:13px', `color:${sn.champion ? COLOR.gold : COLOR.dim}`],
        `${sn.wins} 勝 ${sn.losses} 敗${sn.champion ? '・🏆 全國冠軍' : ''}`));
      overlay.appendChild(card);
    }
    // 生涯數據定格（吃 Q9 累積）
    const t = data.sum;
    const numCard = el('div', [
      'background:rgba(40,34,14,0.9)', 'border-radius:12px', `border:1px solid ${COLOR.gold}`,
      'padding:10px 16px', 'width:min(340px, 94vw)', 'text-align:left', 'line-height:1.6',
      'font-size:12px', `color:${COLOR.text}`,
    ]);
    numCard.appendChild(el('div', ['font-size:13px', 'font-weight:800', `color:${COLOR.gold}`,
      'margin-bottom:2px'], `生涯合計　${t.wins} 勝 ${t.losses} 敗${t.titles ? `・🏆×${t.titles}` : ''}`));
    const bits = [`殺球 ${t.kills + t.tipKills}`, `ACE ${t.aces}`, `攔網 ${t.blockPoints}`, `Perfect ${t.perfects}`];
    if (t.digs + t.assistDigs + t.rallySaves > 0) {
      bits.push(`起球 ${t.digs}`, `助攻一傳 ${t.assistDigs}`, `續命 ${t.rallySaves}`);
    }
    numCard.appendChild(el('div', [], bits.join('・')));
    overlay.appendChild(numCard);
    // 招募全記錄
    if (data.recruits.joined.length || data.recruits.expelled.length) {
      const rc = el('div', [
        `background:${COLOR.card}`, 'border-radius:12px', 'border:1px solid #2c3a58',
        'padding:9px 16px', 'width:min(340px, 94vw)', 'text-align:left', 'line-height:1.6',
        'font-size:12px', `color:${COLOR.dim}`,
      ]);
      rc.appendChild(el('div', ['font-size:13px', 'font-weight:800', `color:${COLOR.cyan}`],
        '招募全記錄'));
      if (data.recruits.joined.length) {
        rc.appendChild(el('div', [], `入隊：${data.recruits.joined.join('、')}`));
      }
      if (data.recruits.expelled.length) {
        rc.appendChild(el('div', [], `離隊：${data.recruits.expelled.filter(Boolean).join('、')}`));
      }
      overlay.appendChild(rc);
    }
    // 4.6 §5 關鍵球典藏牆（原為一行點不開的靜態文字）：四格入口卡——冠軍點＋
    // 天鷹三屆掛點場。點一格開重演舞台，播完回本流程原位；空槽不出現、
    // 全空＝整張卡不出現（顯示哲學：不給玩家看空欄）。不自動插播（拍板）
    const vaultCard = createVaultCard(vault, (item) => {
      openReplayViewer({ item, reduceMotion: reduceMotion() });
    });
    if (vaultCard) overlay.appendChild(vaultCard);
    overlay.appendChild(button('謝幕——', true, () => {
      ritual?.dispose();
      overlay.remove();
      const members = roster?.members ?? [];
      dialogPlay([{ lines: finaleFarewellLines(members, player.id) }], () => {
        showGraduationRitual({
          perGraduate: finaleRitualSegments({
            playerName: career.playerName,
            champion,
            role: player.currentRole,
            heightM: player.height?.current ?? 1.75,
            // 4.5B §5-2：三年遞進——一年級身高（timeline 首項＝創角揭曉值）
            heightStartM: player.height?.timeline?.[0]?.height ?? null,
          }),
          onDone: () => showNextChapter(),
        });
      });
    }));

    // 4.5B §5-1 生涯結算＝全遊戲唯一上限規格：暗場→主角聚光→三屆戰績逐張點亮
    //（對標冠軍館燈光秀 tour 的「逐盞亮」語彙）；恆可點擊跳過（§2-2 演出時鐘：
    // 跳過＝播完逐值一致）；reduced-motion／WebGL 失敗＝直接定格全部可見
    let ritual = null;
    if (!reduceMotion()) {
      try {
        ritual = createRitualStage({
          playerId: player.id ?? 'A2',
          teamId: 'A',
          role: player.currentRole ?? 'outside',
          heightM: player.height?.current ?? 1.75,
          width: 220,
          height: 230,
        });
        overlay.insertBefore(ritual.el, overlay.children[2] ?? null);
      } catch { ritual = null; }
    }
    const kids = [...overlay.children].filter((n) => n !== ritual?.el);
    const seq = createBeatTimeline([
      ...(ritual ? [{ dur: 700, apply: (t) => ritual.setSpot(t) }] : []),
      ...kids.map((node) => ({
        dur: 300,
        apply: (t) => {
          node.style.opacity = String(t);
          node.style.transform = `translateY(${(1 - t) * 10}px)`;
        },
      })),
    ]);
    if (reduceMotion()) {
      seq.finish();
    } else {
      for (const node of kids) node.style.opacity = '0';
      const driver = driveTimeline(seq);
      overlay.addEventListener('pointerdown', (e) => {
        if (!seq.done) { e.stopPropagation(); e.preventDefault(); driver.skip(); }
      }, true);
    }
    document.body.appendChild(overlay);
  }

  // ══════ 升學畫面（大學卷批 5，2026-08-14）══════
  // 題 9 拍板：**成績決定候選集合（天花板），玩家在集合內自選（要什麼故事）**。
  // ★ 代價一定要看得見 ★ 卷宗 §三之二：「選擇的痛苦要來自玩家知道代價還是選了，
  // 不是來自他被騙。」所以每張卡都印球權／戰績／技術三軸的人話，不印數字。
  function admissionContext() {
    const career = store.loadCareer();
    // 三屆最佳成績：屆末封存（loadSeasonArchive）＋當屆名次＋titles 三道回退，
    // 判定全在 admission.js（批 2），這裡只負責把材料湊齊
    const finish = bestFinishOf({ seasons: store.loadSeasonArchive?.() ?? [] }, {
      titles: career?.titles ?? 0,
      currentFinish: seasonFinishOf(career),
    });
    return {
      finish,
      schools: admissibleSchoolsFor(finish),
      // 同屆隊友的去向（決定論；沒名冊就是空的——舊存檔不炸）
      placements: alumniPlacementsFor(store.loadRoster?.()?.members ?? []),
    };
  }

  // 舊識的標籤要吃名冊（二輪覆審 N3）：曾家松與簡子嵐高中一年級就招得到，可以在
  // 玩家隊上打滿兩年——把剛在畢業式道別的隊友寫成「高中的對手」，跟讓他分身到兩所
  // 大學是同一類的「當著玩家的面推翻他玩過的東西」，只是輕一點。
  function alumniLabelFor(fullName) {
    const onRoster = (store.loadRoster?.()?.members ?? [])
      .some((m) => m?.fullName === fullName);
    return onRoster ? `${fullName}（你的隊友）` : `${fullName}（高中的對手）`;
  }

  function schoolCard(u, peers, onPick) {
    const tierColor = { 強豪: COLOR.gold, 中段: COLOR.cyan, 弱校: COLOR.dim }[TIER_LABEL[u.tier]];
    const card = el('div', [
      'width:min(560px,94vw)', `background:${COLOR.card}`, 'border-radius:16px',
      'padding:14px 16px', 'display:flex', 'flex-direction:column', 'gap:8px',
      `border:1px solid ${tierColor === COLOR.dim ? '#2c3a58' : tierColor}44`,
    ]);
    const head = el('div', ['display:flex', 'align-items:center', 'gap:8px']);
    head.appendChild(el('div', ['font-size:19px', 'font-weight:900', `color:${COLOR.text}`], u.name));
    head.appendChild(badge(TIER_LABEL[u.tier], `${tierColor}22`, tierColor));
    card.appendChild(head);
    card.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`, 'line-height:1.6'], u.blurb));
    card.appendChild(el('div', ['font-size:12px', `color:${COLOR.cyan}`],
      `王牌 ${u.ace.name}（${u.ace.title}）`));
    // 舊識：資料表寫死的對手 ace ＋ 這份存檔算出來的同屆隊友
    const known = [
      ...(u.alumni ?? []).map(alumniLabelFor),
      ...peers.map((m) => `${m.fullName}（你的隊友）`),
    ];
    if (known.length) {
      card.appendChild(el('div', ['font-size:12px', `color:${COLOR.gold}`, 'line-height:1.6'],
        `認識的人：${known.join('、')}`));
    }
    for (const [label, text] of [['球權', u.cost.ball], ['戰績', u.cost.record], ['技術', u.cost.tech]]) {
      const row = el('div', ['display:flex', 'gap:8px', 'align-items:flex-start']);
      row.appendChild(el('div', ['font-size:11px', 'font-weight:800', `color:${COLOR.dim}`,
        'flex:none', 'width:28px', 'padding-top:2px'], label));
      row.appendChild(el('div', ['font-size:12px', `color:${COLOR.text}`, 'line-height:1.6'], text));
      card.appendChild(row);
    }
    const pick = el('div', ['display:flex', 'justify-content:flex-end']);
    pick.appendChild(smallButton('▶ 就決定是這裡', () => onPick(u)));
    card.appendChild(pick);
    return card;
  }

  function showAdmission() {
    const { finish, schools, placements } = admissionContext();
    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:39', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:safe center', 'overflow-y:auto',
      'background:#05070d', 'gap:10px', 'padding:24px 12px',
    ]);
    overlay.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`, 'letter-spacing:4px'],
      '升學志願'));
    overlay.appendChild(el('div', [
      'font-size:26px', 'font-weight:900', `color:${COLOR.gold}`, 'letter-spacing:3px',
    ], FINISH_LABEL[finish] ?? '高中三年'));
    overlay.appendChild(el('div', ['font-size:13px', `color:${COLOR.text}`, 'line-height:1.7',
      'text-align:center', 'max-width:560px'],
    `這樣的成績，有 ${schools.length} 所大學向你開了門。`));
    overlay.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`, 'line-height:1.7',
      'text-align:center', 'max-width:560px', 'margin-bottom:4px'],
    ADMISSION_COST_LINE));
    for (const u of schools) {
      overlay.appendChild(schoolCard(u, placements[u.id] ?? [], (picked) => {
        overlay.remove();
        showAdmissionConfirm(picked, () => showAdmission());
      }));
    }
    document.body.appendChild(overlay);
  }

  // 二次確認：升學是不可逆的，不能讓一次誤觸決定整章
  function showAdmissionConfirm(u, onCancel) {
    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:40', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center', 'background:rgba(4,6,12,0.94)',
      'gap:14px', 'padding:24px',
    ]);
    overlay.appendChild(el('div', ['font-size:22px', 'font-weight:900', `color:${COLOR.gold}`], u.name));
    overlay.appendChild(el('div', ['font-size:13px', `color:${COLOR.text}`, 'text-align:center',
      'line-height:1.7', 'max-width:460px'], u.cost.ball));
    overlay.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`], '決定之後不能反悔。'));
    const row = el('div', ['display:flex', 'gap:10px', 'flex-wrap:wrap', 'justify-content:center']);
    row.appendChild(smallButton('再想想', () => { overlay.remove(); onCancel(); }));
    row.appendChild(button('確定就是這裡', true, () => {
      overlay.remove();
      store.enterUniversity?.(u.id);
      showAdmissionDone(u);
    }));
    overlay.appendChild(row);
    document.body.appendChild(overlay);
  }

  function showAdmissionDone(u) {
    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:40', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center', 'background:#05070d', 'gap:14px',
      'cursor:pointer',
    ]);
    overlay.appendChild(el('div', ['font-size:30px', 'font-weight:900', `color:${COLOR.gold}`,
      'letter-spacing:6px'], u.name));
    overlay.appendChild(el('div', ['font-size:14px', `color:${COLOR.text}`, 'letter-spacing:2px'],
      '新生報到'));
    overlay.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`, 'margin-top:16px',
      'text-align:center', 'line-height:1.8'],
    '大學賽季準備中——這一年的對手，就是你剛剛沒有選的那八所。'));
    overlay.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'margin-top:20px'],
      '點擊任意處返回'));
    overlay.addEventListener('pointerdown', () => { overlay.remove(); renderSlots(); });
    document.body.appendChild(overlay);
  }

  // 下一章佔位（Q5：大學章 kickoff 另開，本輪只留門）——謝幕後直接接升學畫面
  // （批 5 前這裡點一下就回選檔頁；現在那扇門後面有東西了）
  function showNextChapter() {
    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:38', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center', 'background:#05070d',
      'gap:16px', 'cursor:pointer',
    ]);
    overlay.appendChild(el('div', [
      'font-size:40px', 'font-weight:900', `color:${COLOR.gold}`, 'letter-spacing:10px',
      'text-shadow:0 4px 30px rgba(255,209,102,0.35)',
    ], NEXT_CHAPTER_LINES.title));
    overlay.appendChild(el('div', ['font-size:15px', `color:${COLOR.text}`, 'letter-spacing:3px'],
      NEXT_CHAPTER_LINES.sub));
    overlay.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`, 'letter-spacing:2px',
      'margin-top:18px'], NEXT_CHAPTER_LINES.next));
    overlay.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'margin-top:26px'],
      '點擊繼續——決定要去哪裡'));
    overlay.addEventListener('pointerdown', () => {
      overlay.remove();
      // 已經選過的存檔（重看謝幕）不再問一次志願——選擇是不可逆的
      if (store.loadSchool?.()) renderSlots();
      else showAdmission();
    });
    document.body.appendChild(overlay);
  }

  // ════════ 大學謝幕卷 批 2（2026-08-25）：謝幕儀式 ════════
  // 批 4 佔位卡在此正式換掉。三段卡序列①四年回顧②同屆送別③終卡；
  // 驗收＝docs/kickoffs/acceptance-uni-finale-batch2.md（B2-1~B2-5）。

  // 入口：先接批 1 結算（冪等——已結算過的重看不重複封存，B2-4），再開①回顧卡。
  // ★順序要點★ 一定要在讀 U4 名次之前呼叫，回顧卡才讀得到剛封存的第 4 筆。
  function showUniFinaleCeremony() {
    const settled = store.settleUniFinale?.();
    // 覆審 MEDIUM 修（2026-08-25）：結算失敗（壞存檔——school id 解不開，
    // settleUniFinale 依設計「不猜、不結算」回 false）不得靜默照播——否則儀式
    // 「完工」但 U4 永遠沒封存、finaleSettled 沒打。首次進入（旗標未打）且結算
    // 回 false ＝失敗，擋下並明示；重看路徑（旗標已打、冪等回 false）不受影響。
    if (!settled && !store.uniFinaleSettled?.()) {
      const overlay = el('div', [
        'position:fixed', 'inset:0', 'z-index:38', 'display:flex', 'flex-direction:column',
        'align-items:center', 'justify-content:center', 'background:#05070d',
        'gap:12px', 'cursor:pointer', 'padding:26px 14px', 'text-align:center',
      ]);
      overlay.appendChild(el('div', ['font-size:15px', 'font-weight:800', `color:${COLOR.text}`,
        'line-height:1.7'], '謝幕結算失敗——存檔資料異常（學校資料解不開），大四成績尚未封存'));
      overlay.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`], '點擊返回生涯畫面'));
      overlay.addEventListener('pointerdown', () => { overlay.remove(); renderCareer(); });
      document.body.appendChild(overlay);
      return;
    }
    showUniFinaleReview();
  }

  // ①四年回顧：U1–U4 名次軌跡（讀 career.seasons，settleUniFinale 之後恰好 4 筆）
  // ＋累計統計。點擊繼續→②送別。
  function showUniFinaleReview() {
    const career = store.loadCareer();
    const seasons = store.loadSeasonArchive?.() ?? [];
    const chapter = store.loadChapter?.();
    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:38', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:safe center', 'overflow-y:auto',
      'background:#04060c', 'gap:10px', 'padding:26px 14px', 'cursor:pointer',
    ]);
    overlay.appendChild(el('div', ['font-size:14px', `color:${COLOR.dim}`, 'letter-spacing:5px'],
      '大學謝幕・四年回顧'));
    overlay.appendChild(el('div', [
      'font-size:24px', 'font-weight:900', `color:${COLOR.gold}`, 'letter-spacing:2px',
    ], `${career?.playerName ?? ''}・大學四年`));
    const yearName = ['大一', '大二', '大三', '大四'];
    const sum = {
      kills: 0, tipKills: 0, aces: 0, blockPoints: 0, perfects: 0,
      digs: 0, assistDigs: 0, rallySaves: 0, wins: 0, losses: 0, titles: 0,
    };
    for (const sn of seasons) {
      const uniYear = chapterSeasonOf(chapter, sn.index);
      const card = el('div', [
        `background:${COLOR.card}`, 'border-radius:12px', 'border:1px solid #2c3a58',
        'padding:9px 16px', 'width:min(340px, 94vw)', 'display:flex',
        'justify-content:space-between', 'align-items:center',
      ]);
      card.appendChild(el('div', ['font-size:14px', 'font-weight:800'],
        yearName[uniYear - 1] ?? `第 ${uniYear} 年`));
      const rankText = Number.isInteger(sn.uniRank) && sn.uniRank >= 1
        ? (sn.uniRank === 1 ? '🏆 聯賽冠軍' : `聯賽第 ${sn.uniRank} 名`)
        : '名次未知（舊存檔）';
      card.appendChild(el('div', ['font-size:13px', `color:${sn.uniRank === 1 ? COLOR.gold : COLOR.dim}`],
        `${sn.wins} 勝 ${sn.losses} 敗・${rankText}`));
      overlay.appendChild(card);
      for (const k of ['kills', 'tipKills', 'aces', 'blockPoints', 'perfects', 'digs', 'assistDigs', 'rallySaves']) {
        sum[k] += sn.totals?.[k] ?? 0;
      }
      sum.wins += sn.wins;
      sum.losses += sn.losses;
      if (sn.uniRank === 1) sum.titles += 1;
    }
    const numCard = el('div', [
      'background:rgba(40,34,14,0.9)', 'border-radius:12px', `border:1px solid ${COLOR.gold}`,
      'padding:10px 16px', 'width:min(340px, 94vw)', 'text-align:left', 'line-height:1.6',
      'font-size:12px', `color:${COLOR.text}`,
    ]);
    numCard.appendChild(el('div', ['font-size:13px', 'font-weight:800', `color:${COLOR.gold}`,
      'margin-bottom:2px'], `四年合計　${sum.wins} 勝 ${sum.losses} 敗${sum.titles ? `・🏆×${sum.titles}` : ''}`));
    const bits = [`殺球 ${sum.kills + sum.tipKills}`, `ACE ${sum.aces}`, `攔網 ${sum.blockPoints}`, `Perfect ${sum.perfects}`];
    if (sum.digs + sum.assistDigs + sum.rallySaves > 0) {
      bits.push(`起球 ${sum.digs}`, `助攻一傳 ${sum.assistDigs}`, `續命 ${sum.rallySaves}`);
    }
    numCard.appendChild(el('div', [], bits.join('・')));
    overlay.appendChild(numCard);
    overlay.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'margin-top:20px'],
      '點擊繼續——同屆的畢業生，還有幾句話'));
    overlay.addEventListener('pointerdown', () => { overlay.remove(); showUniFinaleFarewell(); });
    document.body.appendChild(overlay);
  }

  // ②同屆送別：與玩家同屆（U1 入學、U4 末畢業）的隊友——具名(簡子嵐/曾家松)＞
  // title＞通用三級，機制單一事實源＝uniFarewellFor（uniGraduation.js）。學弟
  // （尚未到畢業年級者）不在 graduates 名單裡，自然不發言。
  // ★同屆判定★ 重用 uniSeasonTurnover 的 graduates 篩法（grade>=UNI_GRADUATE_GRADE）
  // ——純函式、不落檔，只取 .graduates 供顯示，不消費 .roster/.freshmen（沒有真的
  // 換血；U4 末仍是死路，批 1 早已拍板不動）。
  function showUniFinaleFarewell() {
    const career = store.loadCareer();
    const roster = store.loadRoster?.();
    const schoolId = store.loadSchool?.() ?? '';
    const { graduates } = uniSeasonTurnover({
      roster, schoolId, seasonIndex: career?.seasons?.length ?? 0, seed: 1,
    });
    const lines = uniFinaleFarewellLines(graduates, career?.playerName ?? '你');
    dialogPlay([{ lines }], () => showUniFinaleClosing());
  }

  // ③終卡「第二章・完」＋「下一個舞台・敬請期待」（不點名成人/企業，拍板題 6）；
  // 出口回生涯畫面。存檔那顆 finaleSettled 旗標已在入口處由批 1 打上，供未來章節讀。
  function showUniFinaleClosing() {
    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:38', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center', 'background:#05070d',
      'gap:16px', 'cursor:pointer',
    ]);
    overlay.appendChild(el('div', [
      'font-size:40px', 'font-weight:900', `color:${COLOR.gold}`, 'letter-spacing:10px',
      'text-shadow:0 4px 30px rgba(255,209,102,0.35)',
    ], UNI_FINALE_CLOSING.title));
    overlay.appendChild(el('div', ['font-size:15px', `color:${COLOR.text}`, 'letter-spacing:3px'],
      UNI_FINALE_CLOSING.sub));
    overlay.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`, 'letter-spacing:2px',
      'margin-top:18px'], UNI_FINALE_CLOSING.next));
    overlay.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'margin-top:26px'],
      '點擊返回生涯畫面'));
    overlay.addEventListener('pointerdown', () => { overlay.remove(); renderCareer(); });
    document.body.appendChild(overlay);
  }

  // ════════ 企業章 批 2（2026-08-25）：選秀儀式（演出）→ 邀約自選 → 入章 ════════
  // 拍板題 4＝混合：唱名儀式的演出在前（大作感），實質仍是「U4 名次決定邀約集合、
  // 玩家在集合內自選」——集合一律問 store.corpOffers()（值從封存 uniRank 來，A2-4）。
  // ★演出文案與唱名分派屬提案★（試玩回饋即改）。
  function showCorpDraft() {
    const career = store.loadCareer();
    const roster = store.loadRoster?.();
    const schoolId = store.loadSchool?.() ?? '';
    // 唱名名單＝同屆畢業生（謝幕送別同一套篩法；純演出、不落檔）
    const { graduates } = uniSeasonTurnover({
      roster, schoolId, seasonIndex: career?.seasons?.length ?? 0, seed: 1,
    });
    const called = graduates.filter((g) => g?.fullName).slice(0, 3);
    // ★ line＝{speaker, text} 物件（dialogPlay 契約）★ 批 4 出廠寫成字串＝空白泡泡
    // （探針卷實跑抓到，2026-08-26 修）
    const lines = [
      { speaker: '', text: '【企業排球聯賽・新人選秀會】' },
      { speaker: '', text: '轉播燈亮起。八家企業的桌牌在場邊排開——名字被念到的人，從這裡走進大人的聯賽。' },
    ];
    // 決定論輪派（i*3+1 讓三個名字落在不同 tier 的隊；純演出，不影響任何存檔）
    called.forEach((g, i) => {
      const team = CORPORATIONS[(i * 3 + 1) % CORPORATIONS.length];
      lines.push({ speaker: '司儀', text: `——${team.name}，指名 ${g.fullName}。` });
      lines.push({ speaker: '', text: `掌聲。${g.fullName} 起身時朝你點了下頭。` });
    });
    lines.push({ speaker: '', text: '然後，司儀唸出下一個名字的瞬間——好幾張桌子同時舉了牌。' });
    lines.push({ speaker: '司儀', text: `${career?.playerName ?? '你'}。` });
    lines.push({ speaker: '', text: '輪到你了。' });
    dialogPlay([{ lines }], () => showCorpOffers());
  }

  function corpCard(c, onPick) {
    const tierColor = { 強豪: COLOR.gold, 中堅: COLOR.cyan, 保底: COLOR.dim }[CORP_TIER_LABEL[c.tier]];
    const card = el('div', [
      'width:min(560px,94vw)', `background:${COLOR.card}`, 'border-radius:16px',
      'padding:14px 16px', 'display:flex', 'flex-direction:column', 'gap:8px',
      `border:1px solid ${tierColor === COLOR.dim ? '#2c3a58' : tierColor}44`,
    ]);
    const head = el('div', ['display:flex', 'align-items:center', 'gap:8px']);
    head.appendChild(el('div', ['font-size:19px', 'font-weight:900', `color:${COLOR.text}`], c.name));
    head.appendChild(badge(CORP_TIER_LABEL[c.tier], `${tierColor}22`, tierColor));
    card.appendChild(head);
    card.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`, 'line-height:1.6'], c.blurb));
    card.appendChild(el('div', ['font-size:12px', `color:${COLOR.cyan}`],
      `王牌 ${c.ace.name}（${c.ace.title}）`));
    for (const [label, text] of [['球權', c.cost.ball], ['戰績', c.cost.record], ['環境', c.cost.tech]]) {
      const row = el('div', ['display:flex', 'gap:8px', 'align-items:flex-start']);
      row.appendChild(el('div', ['font-size:11px', 'font-weight:800', `color:${COLOR.dim}`,
        'flex:none', 'width:28px', 'padding-top:2px'], label));
      row.appendChild(el('div', ['font-size:12px', `color:${COLOR.text}`, 'line-height:1.6'], text));
      card.appendChild(row);
    }
    const pick = el('div', ['display:flex', 'justify-content:flex-end']);
    pick.appendChild(smallButton('▶ 簽這一家', () => onPick(c)));
    card.appendChild(pick);
    return card;
  }

  function showCorpOffers() {
    const offers = store.corpOffers?.() ?? [];
    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:39', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:safe center', 'overflow-y:auto',
      'background:#05070d', 'gap:10px', 'padding:24px 12px',
    ]);
    overlay.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`, 'letter-spacing:4px'],
      '企業聯賽・邀約'));
    overlay.appendChild(el('div', ['font-size:13px', `color:${COLOR.text}`, 'line-height:1.7',
      'text-align:center', 'max-width:560px'],
    `舉牌的桌子放下了，正式的邀約送到你面前——${offers.length} 家企業要你。`));
    overlay.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`, 'line-height:1.7',
      'text-align:center', 'max-width:560px', 'margin-bottom:4px'],
    '這次不是四年——是簽約。代價都寫在卡片上了，想清楚再簽。'));
    for (const c of offers) {
      overlay.appendChild(corpCard(c, (picked) => {
        overlay.remove();
        showCorpConfirm(picked, () => showCorpOffers());
      }));
    }
    document.body.appendChild(overlay);
  }

  // 二次確認：簽約是不可逆的（同升學的誤觸防線）
  function showCorpConfirm(c, onCancel) {
    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:40', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center', 'background:rgba(4,6,12,0.94)',
      'gap:14px', 'padding:24px',
    ]);
    overlay.appendChild(el('div', ['font-size:22px', 'font-weight:900', `color:${COLOR.gold}`], c.name));
    overlay.appendChild(el('div', ['font-size:13px', `color:${COLOR.text}`, 'text-align:center',
      'line-height:1.7', 'max-width:460px'], c.cost.ball));
    overlay.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`], '簽了字就不能反悔。'));
    const row = el('div', ['display:flex', 'gap:10px', 'flex-wrap:wrap', 'justify-content:center']);
    row.appendChild(smallButton('再想想', () => { overlay.remove(); onCancel(); }));
    row.appendChild(button('簽約', true, () => {
      const ok = store.enterCorporate?.(c.id);
      overlay.remove();
      // 守衛擋下（壞存檔/重入）不得裝作簽成——回生涯頁，不進 done 卡
      if (ok) showCorpDone(c);
      else renderCareer();
    }));
    overlay.appendChild(row);
    document.body.appendChild(overlay);
  }

  function showCorpDone(c) {
    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:40', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center', 'background:#05070d', 'gap:14px',
      'cursor:pointer',
    ]);
    overlay.appendChild(el('div', ['font-size:30px', 'font-weight:900', `color:${COLOR.gold}`,
      'letter-spacing:6px'], c.name));
    overlay.appendChild(el('div', ['font-size:14px', `color:${COLOR.text}`, 'letter-spacing:2px'],
      '入社報到'));
    // 批 4（A4-1）：合約敘事併入同一張卡（拍板題 2 輕量成人元素——只有話，沒有數值）
    for (const line of CORP_CONTRACT_LINES) {
      overlay.appendChild(el('div', ['font-size:12px', `color:${COLOR.text}`, 'margin-top:10px',
        'text-align:center', 'line-height:1.8', 'max-width:min(420px,90vw)'], line));
    }
    overlay.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`, 'margin-top:16px',
      'text-align:center', 'line-height:1.8'],
    '企業聯賽賽季準備中——這一年的對手，就是剛剛沒有簽的那七家。'));
    overlay.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'margin-top:20px'],
      '點擊任意處返回'));
    overlay.addEventListener('pointerdown', () => { overlay.remove(); renderSlots(); });
    document.body.appendChild(overlay);
  }

  // 企業章批 3（A3-2）：章末收尾卡——佔位（續約/轉隊/多年生涯＝掛帳，卷宗 §五）。
  // ★文案屬提案★ 出口回生涯畫面（不是死路；重看名次也走同一顆鈕，冪等純顯示）。
  // 職業章批 2：收尾卡入口——比照 showUniFinaleCeremony 的順序要點，一定要在讀名次
  // 之前（board 由呼叫端先算好傳入）呼叫 settleCorpFinale，才會把 corpRank 封進
  // 存檔供 store.proOffers()／enterPro 讀（archivedCorpRank 的單一讀取點）。
  // 首次進入且結算失敗（壞存檔——corp id 解不開）不得靜默照播（同 uni-finale 批 2 教訓）；
  // 重看路徑（旗標已打、冪等回 false）不受影響。
  function showCorpSeasonClosing(board) {
    const settled = store.settleCorpFinale?.();
    if (!settled && !store.corpFinaleSettled?.()) {
      const failOverlay = el('div', [
        'position:fixed', 'inset:0', 'z-index:38', 'display:flex', 'flex-direction:column',
        'align-items:center', 'justify-content:center', 'background:#05070d',
        'gap:12px', 'cursor:pointer', 'padding:26px 14px', 'text-align:center',
      ]);
      failOverlay.appendChild(el('div', ['font-size:15px', 'font-weight:800', `color:${COLOR.text}`,
        'line-height:1.7'], '賽季結算失敗——存檔資料異常（企業資料解不開），企業元年戰績尚未封存'));
      failOverlay.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`], '點擊返回生涯畫面'));
      failOverlay.addEventListener('pointerdown', () => { failOverlay.remove(); renderCareer(); });
      document.body.appendChild(failOverlay);
      return;
    }
    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:38', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center', 'background:#05070d',
      'gap:16px', 'cursor:pointer',
    ]);
    overlay.appendChild(el('div', [
      'font-size:40px', 'font-weight:900', `color:${COLOR.gold}`, 'letter-spacing:10px',
      'text-shadow:0 4px 30px rgba(255,209,102,0.35)',
    ], '企業元年・完'));
    overlay.appendChild(el('div', ['font-size:15px', `color:${COLOR.text}`, 'letter-spacing:3px'],
      board.playerRank === 1 ? '第一年就把冠軍盃帶回了公司' : `聯賽第 ${board.playerRank} 名——大人的聯賽，站穩了`));
    // 批 4（A4-4）：國外強權點名（題 1 敘事層）＋條件簡子嵐傳聞（大學名冊封存判定）
    for (const line of corpClosingLines(store.loadUniRoster?.() ?? null)) {
      overlay.appendChild(el('div', ['font-size:12px', `color:${COLOR.text}`, 'margin-top:8px',
        'text-align:center', 'line-height:1.8', 'max-width:min(440px,90vw)'], line));
    }
    overlay.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`, 'letter-spacing:2px',
      'margin-top:18px'], '續約談判・敬請期待'));
    // ★批 2 新增★ 已結算才長出「前往下一個舞台」——corpFinaleSettled 守衛
    //（同大學章「謝幕先於下一章」的先例）；button() 內建 stopPropagation，
    // 不會被 overlay 本身的整卡點擊出口搶走
    if (store.corpFinaleSettled?.()) {
      overlay.appendChild(button('▶ 前往下一個舞台', false, () => {
        overlay.remove();
        showProScouting();
      }));
    }
    overlay.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'margin-top:26px'],
      '點擊其餘處返回生涯畫面'));
    overlay.addEventListener('pointerdown', () => { overlay.remove(); renderCareer(); });
    document.body.appendChild(overlay);
  }

  // 職業章批 3（C5）：章末收尾卡——佔位（多年職業生涯／續約轉隊＝掛帳，卷宗 §五）。
  // ★文案屬提案★ 出口回生涯畫面（重看名次也走同一顆鈕，冪等純顯示）。
  // ★ 一定要在讀名次之前呼叫 settleProFinale ★ 才會把 proRank 封進存檔（同
  // showCorpSeasonClosing 的既有教訓：首次進入且結算失敗（壞存檔）不得靜默照播）。
  // 職業章目前是生涯終章（多年生涯是掛帳），所以**沒有**「前往下一個舞台」——
  // 這一點與 showCorpSeasonClosing 的形狀刻意不同，不是漏做。
  function showProSeasonClosing({ champion, madePlayoffs, board }) {
    const settled = store.settleProFinale?.();
    if (!settled && !store.proFinaleSettled?.()) {
      const failOverlay = el('div', [
        'position:fixed', 'inset:0', 'z-index:38', 'display:flex', 'flex-direction:column',
        'align-items:center', 'justify-content:center', 'background:#05070d',
        'gap:12px', 'cursor:pointer', 'padding:26px 14px', 'text-align:center',
      ]);
      failOverlay.appendChild(el('div', ['font-size:15px', 'font-weight:800', `color:${COLOR.text}`,
        'line-height:1.7'], '賽季結算失敗——存檔資料異常（職業資料解不開），職業元年戰績尚未封存'));
      failOverlay.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`], '點擊返回生涯畫面'));
      failOverlay.addEventListener('pointerdown', () => { failOverlay.remove(); renderCareer(); });
      document.body.appendChild(failOverlay);
      return;
    }
    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:38', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center', 'background:#05070d',
      'gap:16px', 'cursor:pointer',
    ]);
    overlay.appendChild(el('div', [
      'font-size:40px', 'font-weight:900', `color:${COLOR.gold}`, 'letter-spacing:10px',
      'text-shadow:0 4px 30px rgba(255,209,102,0.35)',
    ], '職業元年・完'));
    overlay.appendChild(el('div', ['font-size:15px', `color:${COLOR.text}`, 'letter-spacing:3px'],
      champion ? '第一年就站上職業聯賽之巔'
        : (madePlayoffs ? `季後賽止步——循環第 ${board.playerRank} 名的證明` : `聯賽第 ${board.playerRank} 名——職業初體驗`)));
    // 批 5（B5-3）：國外強權點名（世界觀存在、不可玩）＋條件簡子嵐（大學名冊封存判定）
    for (const line of proClosingLines(store.loadUniRoster?.() ?? null)) {
      overlay.appendChild(el('div', ['font-size:12px', `color:${COLOR.text}`, 'margin-top:8px',
        'text-align:center', 'line-height:1.8', 'max-width:min(440px,90vw)'], line));
    }
    overlay.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`, 'letter-spacing:2px',
      'margin-top:18px'], '續約談判・敬請期待'));
    overlay.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'margin-top:26px'],
      '點擊任意處返回生涯畫面'));
    overlay.addEventListener('pointerdown', () => { overlay.remove(); renderCareer(); });
    document.body.appendChild(overlay);
  }

  // ════════ 職業章 批 2（2026-08-26）：挖角/測試會演出 → 邀約自選 → 入隊 ════════
  // 拍板題 2＝差異化（同企業卷宗 §一、pro-chapter-kickoff.md）：不是選秀唱名，是
  // 「球團主動來談」——corpRank 決定邀約集合（proOffersFor），玩家在集合內自選。
  // ★文案屬提案★（試玩回饋即改）。dialogPlay 的 line 一律 {speaker,text} 物件
  // （批 4 出廠 bug 教訓——探針卷抓過字串 lines＝空白泡泡）。
  function proPitchLineFor(t) {
    return {
      [TIER.POWERHOUSE]: '『我們要冠軍，而你可以是拼圖最後一塊。』',
      [TIER.MID]: '『主力位置留給你——這裡不會把你放板凳。』',
      [TIER.WEAK]: '『我們不是最強的，但你會是場上最被需要的那個人。』',
    }[t.tier] ?? '『來聊聊吧。』';
  }

  function showProScouting() {
    const offers = store.proOffers?.() ?? [];
    // 演出用：只挑前 2–3 家開口（純演出、不影響任何存檔——同 showCorpDraft 的
    // 決定論輪派手法），完整名單留給下一張邀約卡
    const pitchTeams = offers.slice(0, Math.min(3, offers.length));
    const lines = [
      { speaker: '', text: '企業聯賽賽季結束的那個禮拜，手機開始不安分。' },
      ...pitchTeams.map((t) => ({ speaker: t.name, text: proPitchLineFor(t) })),
      { speaker: '', text: '不只一支球隊，找上了你。' },
    ];
    dialogPlay([{ lines }], () => showProOffers());
  }

  // 提案文案（tier 分三檔，職業味——同 corpCard 的「球權/戰績/環境」三軸）
  function proCostLines(t) {
    return {
      [TIER.POWERHOUSE]: {
        ball: `頂級球隊人才濟濟——球權要跟${t.ace?.name ?? '王牌'}那個等級的人搶`,
        record: '目標只有冠軍，一輸就會被問「你在幹嘛」',
        tech: '隊上全是各隊挖來的悍將，逼你一路吊打自己的舒適圈',
      },
      [TIER.MID]: {
        ball: '主力位置留給你——教練組要你當那個被信任的人',
        record: '打進四強是底線，冠軍是要拼的',
        tech: '隊友程度整齊，環境穩定但不會逼你變得更快',
      },
      [TIER.WEAK]: {
        ball: '全隊看你——沒有人跟你搶球權',
        record: '保級戰，輸幾場都沒人怪你',
        tech: '資源最少，一切靠自己摸索',
      },
    }[t.tier] ?? { ball: '待談', record: '待談', tech: '待談' };
  }

  function proCard(t, onPick) {
    const tierColor = { 豪門: COLOR.gold, 勁旅: COLOR.cyan, 新軍: COLOR.dim }[PRO_TIER_LABEL[t.tier]];
    const cost = proCostLines(t);
    const card = el('div', [
      'width:min(560px,94vw)', `background:${COLOR.card}`, 'border-radius:16px',
      'padding:14px 16px', 'display:flex', 'flex-direction:column', 'gap:8px',
      `border:1px solid ${tierColor === COLOR.dim ? '#2c3a58' : tierColor}44`,
    ]);
    const head = el('div', ['display:flex', 'align-items:center', 'gap:8px']);
    head.appendChild(el('div', ['font-size:19px', 'font-weight:900', `color:${COLOR.text}`], t.name));
    head.appendChild(badge(PRO_TIER_LABEL[t.tier], `${tierColor}22`, tierColor));
    card.appendChild(head);
    if (t.ace) {
      card.appendChild(el('div', ['font-size:12px', `color:${COLOR.cyan}`],
        `王牌 ${t.ace.name}（${t.ace.title}）`));
    }
    for (const [label, text] of [['球權', cost.ball], ['戰績', cost.record], ['環境', cost.tech]]) {
      const row = el('div', ['display:flex', 'gap:8px', 'align-items:flex-start']);
      row.appendChild(el('div', ['font-size:11px', 'font-weight:800', `color:${COLOR.dim}`,
        'flex:none', 'width:28px', 'padding-top:2px'], label));
      row.appendChild(el('div', ['font-size:12px', `color:${COLOR.text}`, 'line-height:1.6'], text));
      card.appendChild(row);
    }
    const pick = el('div', ['display:flex', 'justify-content:flex-end']);
    pick.appendChild(smallButton('▶ 簽這一隊', () => onPick(t)));
    card.appendChild(pick);
    return card;
  }

  function showProOffers() {
    const offers = store.proOffers?.() ?? [];
    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:39', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:safe center', 'overflow-y:auto',
      'background:#05070d', 'gap:10px', 'padding:24px 12px',
    ]);
    overlay.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`, 'letter-spacing:4px'],
      '職業聯賽・邀約'));
    overlay.appendChild(el('div', ['font-size:13px', `color:${COLOR.text}`, 'line-height:1.7',
      'text-align:center', 'max-width:560px'],
    `測試會結束，正式的邀約送到你面前——${offers.length} 支職業隊向你招手。`));
    overlay.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`, 'line-height:1.7',
      'text-align:center', 'max-width:560px', 'margin-bottom:4px'],
    '這是你的第一份職業合約——選你想打的球，不是選最安全的那份。'));
    for (const t of offers) {
      overlay.appendChild(proCard(t, (picked) => {
        overlay.remove();
        showProConfirm(picked, () => showProOffers());
      }));
    }
    document.body.appendChild(overlay);
  }

  // 二次確認：簽約是不可逆的（同 showCorpConfirm 的誤觸防線）
  function showProConfirm(t, onCancel) {
    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:40', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center', 'background:rgba(4,6,12,0.94)',
      'gap:14px', 'padding:24px',
    ]);
    overlay.appendChild(el('div', ['font-size:22px', 'font-weight:900', `color:${COLOR.gold}`], t.name));
    overlay.appendChild(el('div', ['font-size:13px', `color:${COLOR.text}`, 'text-align:center',
      'line-height:1.7', 'max-width:460px'], proCostLines(t).ball));
    overlay.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`], '簽了字就不能反悔。'));
    const row = el('div', ['display:flex', 'gap:10px', 'flex-wrap:wrap', 'justify-content:center']);
    row.appendChild(smallButton('再想想', () => { overlay.remove(); onCancel(); }));
    row.appendChild(button('簽約', true, () => {
      const ok = store.enterPro?.(t.id);
      overlay.remove();
      // 守衛擋下（壞存檔/重入）不得裝作簽成——回生涯頁，不進 done 卡
      if (ok) showProDone(t);
      else renderCareer();
    }));
    overlay.appendChild(row);
    document.body.appendChild(overlay);
  }

  function showProDone(t) {
    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:40', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center', 'background:#05070d', 'gap:14px',
      'cursor:pointer',
    ]);
    overlay.appendChild(el('div', ['font-size:30px', 'font-weight:900', `color:${COLOR.gold}`,
      'letter-spacing:6px'], t.name));
    overlay.appendChild(el('div', ['font-size:14px', `color:${COLOR.text}`, 'letter-spacing:2px'],
      '職業初登場'));
    // 批 5（B5-1）：合約敘事併入同一張卡（同企業章 A4-1 的做法，職業味文案）
    for (const line of PRO_CONTRACT_LINES) {
      overlay.appendChild(el('div', ['font-size:12px', `color:${COLOR.text}`, 'margin-top:10px',
        'text-align:center', 'line-height:1.8', 'max-width:min(420px,90vw)'], line));
    }
    overlay.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`, 'margin-top:16px',
      'text-align:center', 'line-height:1.8'],
    '職業聯賽賽季準備中——這一年的對手，是剩下那七支球隊。'));
    overlay.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'margin-top:20px'],
      '點擊任意處返回'));
    overlay.addEventListener('pointerdown', () => { overlay.remove(); renderSlots(); });
    document.body.appendChild(overlay);
  }

  // 企業章批 4（A4-2）：薪水選擇卡——兩鍵 overlay（同 showCorpConfirm 的誤觸防線形狀）。
  // 兩個出口都走同一顆 store.corpPaydayChoice（冪等 RMW），選完重繪生涯頁。
  function showCorpPayday() {
    corpPaydayOpen = true;
    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:40', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center', 'background:rgba(4,6,12,0.94)',
      'gap:14px', 'padding:24px',
    ]);
    overlay.appendChild(el('div', ['font-size:22px', 'font-weight:900', `color:${COLOR.gold}`],
      CORP_PAYDAY_CARD.title));
    overlay.appendChild(el('div', ['font-size:13px', `color:${COLOR.text}`, 'text-align:center',
      'line-height:1.8', 'max-width:min(460px,90vw)'], CORP_PAYDAY_CARD.body));
    const pick = (treat, note) => {
      // 覆審 HIGH 修：writeSave 的契約是「呼叫端要看回傳值」（careerStore.js write()
      // 註解）——配額滿/私密模式時不得顯示成功文案假裝選完；旗標沒落地＝下次
      // 重繪會再問，文案要把這件事講明，不是讓玩家覺得遊戲在說謊。
      const ok = store.corpPaydayChoice?.(treat);
      overlay.replaceChildren();
      overlay.appendChild(el('div', ['font-size:13px', `color:${COLOR.text}`, 'text-align:center',
        'line-height:1.8', 'max-width:min(460px,90vw)'],
      ok ? note : '⚠ 存檔寫入失敗——這個選擇沒有保存，之後會再問你一次'));
      overlay.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'margin-top:18px'],
        '點擊繼續'));
      overlay.style.cssText += ';cursor:pointer';
      overlay.addEventListener('pointerdown', () => {
        corpPaydayOpen = false;
        overlay.remove();
        renderCareer();
      });
    };
    const row = el('div', ['display:flex', 'gap:10px', 'flex-wrap:wrap', 'justify-content:center']);
    row.appendChild(button(CORP_PAYDAY_CARD.treat.label, true,
      () => pick(true, CORP_PAYDAY_CARD.treat.note)));
    row.appendChild(smallButton(CORP_PAYDAY_CARD.save.label,
      () => pick(false, CORP_PAYDAY_CARD.save.note)));
    overlay.appendChild(row);
    document.body.appendChild(overlay);
  }

  // ---- W4(P4) Q9 生涯累積頁：歷屆封存（advanceSeason 屆末寫入）＋本屆進行中——
  // 三屆總數據；Q5 生涯結算直接吃此處 ----
  function showCareerTotals() {
    const career = store.loadCareer();
    if (!career) return;
    const seasons = [...(store.loadSeasonArchive?.() ?? [])];
    seasons.push({
      ...archiveSeasonSummary({ index: store.seasonIndex?.() ?? 1, results: career.results }),
      // 配色卷階段二 E5：雙源判定——archive 內的季一律已收束（能進陣列本身就是
      // 收束的事實），陣列外這筆即時季問 liveSeasonOngoing（章節感知，同 showCareerFinale）
      current: liveSeasonOngoing(career),
    });
    const overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:36', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:safe center', 'overflow-y:auto',
      'background:rgba(4,6,12,0.88)', 'gap:10px', 'padding:24px 14px',
    ]);
    overlay.appendChild(el('div', [
      'font-size:15px', `color:${COLOR.dim}`, 'letter-spacing:4px',
    ], '生涯數據'));
    overlay.appendChild(el('div', [
      'font-size:22px', 'font-weight:900', `color:${COLOR.gold}`, 'letter-spacing:2px',
    ], career.playerName));
    const totalLine = (t) => {
      const bits = [`殺球 ${t.kills + t.tipKills}`, `ACE ${t.aces}`, `攔網 ${t.blockPoints}`, `Perfect ${t.perfects}`];
      if (t.digs + t.assistDigs + t.rallySaves > 0) {
        bits.push(`起球 ${t.digs}`, `助攻一傳 ${t.assistDigs}`, `續命 ${t.rallySaves}`);
      }
      return bits.join('・');
    };
    const sum = {
      kills: 0, tipKills: 0, aces: 0, blockPoints: 0, perfects: 0,
      digs: 0, assistDigs: 0, rallySaves: 0, wins: 0, losses: 0, titles: 0,
    };
    for (const sn of seasons) {
      for (const k of ['kills', 'tipKills', 'aces', 'blockPoints', 'perfects', 'digs', 'assistDigs', 'rallySaves']) {
        sum[k] += sn.totals[k] ?? 0;
      }
      sum.wins += sn.wins;
      sum.losses += sn.losses;
      // 批 3：大學聯賽冠軍（uniRank===1）計入生涯 🏆 顯示（titles 存檔欄位不動——
      // 那顆掛著高中衛冕加成語意，只是顯示合計）
      if (sn.champion || sn.uniRank === 1) sum.titles += 1;
      const card = el('div', [
        `background:${COLOR.card}`, 'border-radius:12px', 'border:1px solid #2c3a58',
        'padding:10px 16px', 'width:min(340px, 94vw)', 'text-align:left',
        'display:flex', 'flex-direction:column', 'gap:3px',
      ]);
      const head = el('div', ['display:flex', 'justify-content:space-between', 'align-items:center']);
      head.appendChild(el('div', ['font-size:14px', 'font-weight:800'],
        `第 ${sn.index} 屆${sn.current ? '（進行中）' : ''}`));
      // 批 3（拍板題 2 甲）：大學屆封存帶 uniRank ⇒ 顯示聯賽名次；高中屆（無此欄）
      // 走原字串逐字不變
      const uniTag = Number.isInteger(sn.uniRank) && sn.uniRank >= 1
        ? `・${sn.uniRank === 1 ? '🏆 聯賽冠軍' : `聯賽第 ${sn.uniRank} 名`}`
        : '';
      head.appendChild(el('div', ['font-size:13px',
        `color:${sn.champion || sn.uniRank === 1 ? COLOR.gold : COLOR.dim}`],
      `${sn.wins} 勝 ${sn.losses} 敗${sn.champion ? '・🏆 全國冠軍' : ''}${uniTag}`));
      card.appendChild(head);
      card.appendChild(el('div', ['font-size:11.5px', `color:${COLOR.dim}`, 'line-height:1.5'],
        totalLine(sn.totals)));
      overlay.appendChild(card);
    }
    const sumCard = el('div', [
      'background:rgba(40,34,14,0.9)', 'border-radius:12px', `border:1px solid ${COLOR.gold}`,
      'padding:10px 16px', 'width:min(340px, 94vw)', 'text-align:left',
      'display:flex', 'flex-direction:column', 'gap:3px',
    ]);
    const sumHead = el('div', ['display:flex', 'justify-content:space-between']);
    sumHead.appendChild(el('div', ['font-size:14px', 'font-weight:800', `color:${COLOR.gold}`], '生涯合計'));
    sumHead.appendChild(el('div', ['font-size:13px', `color:${COLOR.gold}`],
      `${sum.wins} 勝 ${sum.losses} 敗${sum.titles ? `・🏆×${sum.titles}` : ''}`));
    sumCard.appendChild(sumHead);
    sumCard.appendChild(el('div', ['font-size:11.5px', `color:${COLOR.text}`, 'line-height:1.5'],
      totalLine(sum)));
    overlay.appendChild(sumCard);
    // 大學卷批 6：升學後高中名冊被封存（拍板：不隨行，但**這一頁還看得到**）。
    // 沒有這一段的話 `career.highSchoolRoster` 是個唯寫欄位——三年的隊友在升學那一刻
    // 從所有畫面消失，而拍板承諾的正好相反（對抗覆審 F4）。
    const hsRoster = store.loadHighSchoolRoster?.();
    if (hsRoster?.members?.length) {
      const hsCard = el('div', [
        `background:${COLOR.card}`, 'border-radius:12px', 'border:1px solid #2c3a58',
        'padding:10px 16px', 'width:min(340px, 94vw)', 'text-align:left',
        'display:flex', 'flex-direction:column', 'gap:3px',
      ]);
      hsCard.appendChild(el('div', ['font-size:13px', 'font-weight:800', `color:${COLOR.cyan}`],
        `${OUR_TEAM_NAME}・那三年的隊友`));
      hsCard.appendChild(el('div', ['font-size:11.5px', `color:${COLOR.text}`, 'line-height:1.7'],
        hsRoster.members.map((m) => m.name ?? m.fullName).join('、')));
      overlay.appendChild(hsCard);
    }
    // U1（07-30 拍板）：移除「點擊任意處關閉」，改明鈕（stopPropagation 防止背景點擊誤關）
    overlay.addEventListener('pointerdown', (e) => e.stopPropagation());
    const closeBtn = smallButton('關閉', () => overlay.remove());
    closeBtn.style.alignSelf = 'center';
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
  }

  // ---- 屆間養成卷 E4／E5／E6／E7（2026-08-09）：集訓（兩個呼叫端共用）----
  // ① 屆間鏈：advanceSeason 之後、身高儀式之前（正常流程）
  // ② renderCareer 的中斷復原（覆審 HIGH-1）：advanceSeason 已落檔、集訓沒做完
  // 技術補修（E5）＝把 moment 'camp' 的教學事件在集訓演出後播出：事件表是真相源，
  // 這裡不重刻一份「第幾次教什麼」的清單。
  // ★ 函式宣告刻意放在檔案後段（advanceSeason 呼叫點之後）★ offseason-chemistry 的
  // 佈線守衛用**文字位置**守「集訓必須排在 advanceSeason 之後」；宣告提升讓上面的
  // 呼叫端照樣用得到。
  function runTrainingCamp(freshPlayer, careerNow, onDone) {
    // 重入防護：覆蓋層已經開著就別再開一層（renderCareer 可能被別的路徑再叫一次）。
    // ★ 早退也要把控制權交出去（第三輪覆審 MEDIUM）★ 純 `return` 會讓守衛 fail 成
    // **死路**：屆間鏈那個呼叫端的 onDone 是整條後續（身高儀式→新生入學→開幕台詞→
    // 遞補入隊儀式→轉位談話），靜默丟掉就再也接不回來。onDone 對屆間鏈是「往前走」，
    // 不會回頭；renderCareer 那個呼叫端則在上面先看過 campOpen（不會走到這裡）。
    if (campOpen) { onDone?.(); return; }
    campOpen = true;
    const campSeason = store.seasonIndex?.() ?? 2;
    const campCareer = store.loadCareer() ?? careerNow;
    const campRoster = store.loadRoster?.() ?? null;
    const campEvs = filterPlayedOnce(resolveEventsForRole(resolveEventsForRoster(
      dueEvents(campCareer, 'camp', campSeason), campRoster?.members ?? null,
    ), freshPlayer?.currentRole ?? null));
    // 練習賽卷（2026-08-12）：這屆紅白賽的科目與成績。
    // ★ 科目吃「最近學會的技術」★ 存檔沒有「哪一屆學會的」這個欄位（teach-* 只記
    // 觸發過沒），所以由 `recentTechniquesOf` 取 TECH_DRILL_ORDER 末端當近似——
    // 教學鏈的時程本身由淺入深（吊球最早、跳發／叫戰術最晚），末端≒最近學的。
    // 轉位旗標同理：`campPending` 那一刻 `TRANSFER_USED_EV` 已被 advanceSeason 濾掉，
    // 改用「現任位置≠天生位置」＝轉過位（會多給一個該位置的基本科目，不會少給）。
    const campPractice = store.loadPractice?.() ?? null;
    const campDrills = drillsFor({
      player: freshPlayer,
      seasonIndex: campSeason,
      techniques: recentTechniquesOf(freshPlayer),
      flags: {
        roleChanged: (freshPlayer?.currentRole ?? 'outside')
          !== (freshPlayer?.naturalRole ?? 'outside'),
      },
    });
    showTrainingCamp({
      player: freshPlayer,
      seasonIndex: campSeason,
      // 大二卷批 5：大學章傳章內年份（集訓 title 換大學版＋默契格關閉）
      uniYear: isHighSchool(store.loadChapter?.())
        ? null
        : chapterSeasonOf(store.loadChapter?.(), campSeason),
      members: campRoster?.members ?? [],
      practice: campPractice,
      drills: campDrills,
      // 開打＝離開集訓覆蓋層去打球。★ campPending 旗標**不清** ★ 打完回生涯畫面時
      // renderCareer 會照旗標重開集訓，那時 practice 已有成績（名額／控球格自動跟上）。
      onPractice: onPractice
        ? () => {
          campOpen = false;
          hide();
          onPractice({
            career: store.loadCareer() ?? careerNow,
            player: freshPlayer,
            drills: campDrills,
            seasonIndex: campSeason,
          });
        }
        : null,
      techPending: campEvs.length > 0,
      techNames: campEvs
        .map((e) => TECH_DEFS.find((t) => t.key === e.effect?.unlock)?.name)
        .filter(Boolean),
      // fireEvents 會把 unlock 入帳並落檔（與 pre／post 事件共用同一段泛型程式碼）
      playTech: (done) => fireEvents(campEvs, campCareer, freshPlayer, done),
      onDone: (updated) => {
        campOpen = false;
        freshPlayer.attributes = updated.attributes;
        freshPlayer.chemistry = updated.chemistry;
        // ★ 清旗標與集訓成果同一次 savePlayer ★（覆審 HIGH-1）——分兩筆寫的話，
        // 中間被殺會留下「成果已入帳、待辦還在」＝下次重開再領一次。
        // 寫失敗＝旗標留著＝下次重開重跑集訓（寧可再選一次，不要靜默吞掉）。
        clearCampPending(freshPlayer);
        if (!store.savePlayer(freshPlayer)) {
          setMsg('⚠ 存檔寫入失敗——集訓結果可能未保存');
        }
        onDone();
      },
    });
  }

  // ---- 屆間養成卷 E3（2026-08-09 題三裁定）：默契計數 ----
  // 位置＝生涯畫面（不是賽後）：這是**跨場累積**的數字，賽後單場頁放它會讓玩家
  // 以為是這一場的成績；生涯畫面本來就是「你現在是什麼樣子」的地方，侵入性也最小
  //（只多一個區塊，不動 growthSection 也不動賽後結算頁）。
  // ★ 角色中立（條件 2）★ 只講「配合了 N 次」，不講誰是主攻誰是誘餌——玩家主動叫
  // 夾塞時 73.0% 的波球不是他打的，角色化文案在對角身上七成時間是錯的。
  // ★ 不得暗示已有作用 ★ 本卷默契零效果，這裡如實呈現計數（量測先於參數，刻意如此）。
  // 回傳 null＝沒有非零配對＝整區不顯示。
  function chemistrySection(player) {
    const rosterNow = store.loadRoster?.() ?? null;
    // ★ 校友一起查（覆審 HIGH-2）★ 默契有屆數閘，計數從第 2 屆才長；OH／OPP／S 的
    // 頭號對象阿岩（A6）在第 2 屆末畢業 ⇒ 只查現役必然在第 3 屆渲染出「你和 A6」。
    // 畢業生**應該**留在列表裡（那是敘事），要修的是名字查不到，不是把人濾掉。
    // ★ 被逐出的招募生也一起查（第三輪覆審 MEDIUM）★ 他們落在 recruitment.expelled、
    // 不在 alumni；而招募生可以是欄中／邊攻＝載體對得上的位置，逐出前已累積默契。
    const recruitNow = store.loadRecruitment?.() ?? null;
    const pairs = chemistryPairsOf(player, rosterNow?.members ?? [],
      departedMatesOf(rosterNow, recruitNow));
    if (!pairs.length) return null;
    const box = el('div', [
      'display:flex', 'flex-direction:column', 'gap:6px', `background:${COLOR.card}`,
      'border-radius:14px', 'padding:12px 16px', 'width:min(340px, 92vw)', 'margin-top:4px',
    ]);
    box.appendChild(el('div', [
      'font-size:14px', `color:${COLOR.cyan}`, 'letter-spacing:3px',
    ], '默契'));
    for (const p of pairs) {
      const row = el('div', [
        'display:flex', 'justify-content:space-between', 'align-items:center', 'gap:10px',
      ]);
      row.appendChild(el('div', ['font-size:14px', `color:${COLOR.text}`, 'text-align:left'],
        `你和 ${p.name}`));
      row.appendChild(el('div', [
        'font-size:14px', 'font-weight:800', `color:${COLOR.gold}`, 'white-space:nowrap',
      ], `配合了 ${p.count} 次`));
      box.appendChild(row);
    }
    box.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'line-height:1.45',
      'text-align:left'], '一次＝你和他一起跑成一次組合攻擊（交叉／夾塞／時間差）。'));
    return box;
  }

  // stage 3 成長區：點數/上場表現/屬性加點（次要）/技術解鎖（主要）
  function growthSection(career, player) {
    const gp = career.growthPoints ?? 0;
    // 職業章批 3（C4）：屬性天花板章節感知——單一入口 attrCapFor，這裡只算一次布林
    // 餵給它與 spendAttribute（不得各自另判「是不是 pro」，見 growth.js 檔頭）
    const proChapter = isPro(store.loadChapter?.());
    const attrCap = attrCapFor(proChapter);
    const box = el('div', [
      'display:flex', 'flex-direction:column', 'gap:9px', `background:${COLOR.card}`,
      'border-radius:14px', 'padding:12px 16px', 'width:min(340px, 92vw)', 'margin-top:4px',
    ]);
    const head = el('div', ['display:flex', 'justify-content:space-between', 'align-items:center']);
    head.appendChild(el('div', [
      'font-size:14px', `color:${COLOR.cyan}`, 'letter-spacing:3px',
    ], '成長'));
    head.appendChild(el('div', [
      'font-size:15px', 'font-weight:800', `color:${gp > 0 ? COLOR.gold : COLOR.dim}`,
    ], `點數 ${gp}`));
    box.appendChild(head);
    // 職業章批 3：天花板不是 90 時（PRO 章＝100）明說一句——「100 留給傳奇」兌現的
    // 那一刻要看得見，不然玩家不會知道自己突破了原本的上限
    if (attrCap !== GROWTH.ATTR_CAP) {
      box.appendChild(el('div', ['font-size:11px', `color:${COLOR.gold}`, 'text-align:left'],
        `職業章屬性天花板 ${attrCap}——傳奇解鎖`));
    }

    const last = career.results[career.results.length - 1];
    if (last?.stats) {
      const st = last.stats;
      box.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`, 'text-align:left'],
        `上場：殺球${st.kills}｜吊球${st.tipKills}｜ACE${st.aces}｜攔網${st.blockPoints}｜Perfect ${st.perfects}（＋${last.gp ?? 0} 點）`));
    }

    const spend = (mutate, cost) => {
      try {
        // 先扣點、再存屬性，且逐一查寫入結果——反序＋不查回傳在配額爆掉時
        // 會變成「屬性已加、點數沒扣」的免費點數 bug（技術債審查 CRITICAL）
        const okCareer = store.saveCareer({ ...career, growthPoints: gp - cost });
        const okPlayer = okCareer && store.savePlayer(mutate());
        if (!okCareer || !okPlayer) {
          setMsg('⚠ 存檔寫入失敗——瀏覽器儲存空間不可用，本次變更未保存');
        }
        renderCareer();
      } catch (err) {
        setMsg(String(err.message ?? err));
      }
    };

    // 屬性層（1 點＝+1，上限走 attrCap——非職業章 90、職業章 100）
    const grid = el('div', ['display:grid', 'grid-template-columns:repeat(3,1fr)', 'gap:6px']);
    for (const a of GROWABLE_ATTRS) {
      const v = player.attributes[a.key];
      const can = gp >= 1 && v < attrCap;
      const b = el('button', [
        'height:38px', 'border-radius:10px', 'border:1px solid #2c3a58', 'font-size:13px',
        'cursor:pointer', 'touch-action:manipulation', 'font-weight:600',
        can ? `background:rgba(30,40,64,0.9);color:${COLOR.text}`
          : `background:transparent;color:${COLOR.dim};opacity:0.5`,
      ], `${a.name} ${v} ＋`);
      b.disabled = !can;
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (can) spend(() => spendAttribute(player, a.key, proChapter), 1);
      });
      grid.appendChild(b);
    }
    box.appendChild(grid);
    // 屬性說明（07-24 Sawmah：玩家不知道加點強化什麼）——與技術層 desc 同格式
    const attrHelp = el('div', ['display:flex', 'flex-direction:column', 'gap:2px', 'margin-top:2px']);
    for (const a of GROWABLE_ATTRS) {
      attrHelp.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`,
        'text-align:left', 'line-height:1.45'], `${a.name}｜${a.desc}`));
    }
    box.appendChild(attrHelp);

    // 技術層：故事線傳授習得（不花點）——這裡只展示進度，吊胃口但不爆雷
    for (const t of TECH_DEFS) {
      const unlocked = (player.techniques?.[t.key] ?? 0) >= 1;
      const row = el('div', [
        'display:flex', 'justify-content:space-between', 'align-items:center', 'gap:10px',
      ]);
      const info = el('div', ['flex:1', 'text-align:left']);
      const title = unlocked
        ? t.name + (t.key === 'feint' ? `（熟練 ${player.techniques.feintUses ?? 0}）` : '')
        : '？？？';
      info.appendChild(el('div', ['font-size:14px', 'font-weight:700',
        unlocked ? '' : `color:${COLOR.dim}`], title));
      info.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'line-height:1.4'],
        unlocked ? t.desc : '未習得——比賽裡自有人教你'));
      row.appendChild(info);
      row.appendChild(el('div', [
        'font-size:13px', 'font-weight:700', 'white-space:nowrap',
        `color:${unlocked ? COLOR.gold : COLOR.dim}`,
      ], unlocked ? '✓ 已習得' : '—'));
      box.appendChild(row);
    }
    return box;
  }

  function hide() { root.style.display = 'none'; }

  return {
    // view：'home' | 'career'（'career' 需有存檔，否則退回主選單）
    show(view = 'home') {
      root.style.display = 'flex';
      if (view === 'career' && store.hasSave()) renderCareer();
      else renderHome();
    },
    hide,
  };
}

// ---- DOM 小工具（沿用專案 inline cssText 慣例）----

function el(tag, css, text) {
  const node = document.createElement(tag);
  node.style.cssText = css.join(';');
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, primary, onTap) {
  const b = el('button', [
    'min-width:220px', 'height:52px', 'padding:0 24px', 'border-radius:26px',
    'border:none', 'font-size:17px', 'font-weight:700', 'cursor:pointer',
    'touch-action:manipulation', 'letter-spacing:1px',
    primary
      ? `background:${COLOR.gold};color:#1a1405`
      : `background:rgba(30,40,64,0.9);color:${COLOR.text}`,
  ], label);
  b.addEventListener('pointerdown', (e) => { e.stopPropagation(); onTap(); });
  return b;
}

function smallButton(label, onTap) {
  const b = el('button', [
    'height:40px', 'padding:0 16px', 'border-radius:20px', 'border:1px solid #2c3a58',
    'background:transparent', `color:${COLOR.dim}`, 'font-size:14px', 'cursor:pointer',
    'touch-action:manipulation',
  ], label);
  b.addEventListener('pointerdown', (e) => { e.stopPropagation(); onTap(); });
  return b;
}

// 小徽章（隊長／「你」／「發」首發位標記等）
function badge(text, bg, fg) {
  return el('div', [
    'font-size:10px', 'font-weight:800', `background:${bg}`, `color:${fg}`,
    'border-radius:6px', 'padding:1px 6px', 'letter-spacing:1px', 'flex:none',
  ], text);
}
