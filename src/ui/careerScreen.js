// Phase 2 生涯畫面：主選單（繼續/新生涯/快速比賽/匯出匯入）＋賽程視圖（地區賽小組）
// 夜賽同色系；動態文字一律 textContent（匯入的存檔名字不可信，不走 innerHTML）
import {
  createCareer, createCareerPlayer, nextMatch, careerRecord, opponentName,
  careerStage, opponentById, normalizeCareerPlayer, resolveForfeit, applyPoaching,
  applySeasonRoster, graduatingAces, currentGrade,
} from '../career/careerState.js';
import { GROWTH, GROWABLE_ATTRS, TECH_DEFS, spendAttribute, applyOffseasonTraining } from '../career/growth.js';
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
  recruitCurrentGrade, recruitTargetGone,
} from '../career/recruitment.js';
import {
  dueEvents, recordEvent, oldTeamPreEvents, EXPEL_LINES, SEASON_OPENERS, OFFSEASON_TRAINING_LINES,
  graduationCeremonySegments, freshmenIntroLines, resolveEventsForRoster,
} from '../career/events.js';
import { clampHeightCm } from '../career/heightGrowth.js';
import {
  adviceFor, coachAdviceLines, aspirationReplyLines, bandShiftLines, roleLabel,
} from '../career/heightAdvice.js';
import { showHeightRitual } from './heightRitual.js';
import { showGraduationRitual } from './graduationRitual.js';
import { positionTalkFor } from '../career/positionEvents.js';
import { groupPool } from '../career/schedule.js';
import { updateTrust } from '../sim/trust.js';
import { createRecruitPortrait, pickJoinLine } from '../render/recruitPortrait.js';

// 隊友卡屬性標籤：可成長六項沿用 GROWABLE_ATTRS 名稱＋兩項不開放者
const ATTR_LABELS = {
  ...Object.fromEntries(GROWABLE_ATTRS.map((a) => [a.key, a.name])),
  control: '控制', stamina: '體力',
};
const GROWABLE_KEYS = new Set(GROWABLE_ATTRS.map((a) => a.key));
const GRADE_LABEL = { 1: '一年級', 2: '二年級', 3: '三年級' };

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

export function createCareerScreen(store, { onPlay, onQuick }) {
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
    'background:rgba(4,6,12,0.5)', 'align-items:flex-end', 'justify-content:center',
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

  let dlgState = null; // { queue:[{speaker,text}], onDone }
  function dialogPlay(events, onDone) {
    const queue = events.flatMap((e) => e.lines);
    if (!queue.length) { onDone(); return; }
    dlgState = { queue, onDone };
    dlg.style.display = 'flex';
    paintLine();
  }
  function paintLine() {
    const line = dlgState.queue[0];
    dlgSpeaker.textContent = line.speaker;
    dlgText.textContent = line.text;
  }
  dlg.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (!dlgState) return;
    dlgState.queue.shift();
    if (dlgState.queue.length) { paintLine(); return; }
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
        `轉任${roleLabel(talk.role)}：位置玩法即刻生效，讓出的主攻位由隊上補位。婉拒不扣任何東西——下一個屆間教練會再問。`));
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
  cardOverlay.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (e.target === cardOverlay) hideCard();
  });
  document.body.appendChild(cardOverlay);
  function hideCard() {
    cardOverlay.style.display = 'none';
    cardOverlay.replaceChildren();
  }

  // ---- W3 先發編排器 → W8 對陣畫面共用 overlay（出戰必經；點外側＝返回不出戰）----
  const lineupOverlay = el('div', [
    'position:fixed', 'inset:0', 'z-index:37', 'display:none',
    'background:rgba(4,6,12,0.72)', 'align-items:flex-start', 'justify-content:center',
    'overflow-y:auto',
    'padding:calc(env(safe-area-inset-top, 0px) + 24px) 16px 40px',
  ]);
  lineupOverlay.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (e.target === lineupOverlay) closeLineup(); // 點外側＝取消編排（不出戰）
  });
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
  // 王牌被挖不亮相）。確認＝saveLineup＋onConfirm；點外側＝返回（不出戰）
  function showMatchupScreen(career, player, next, onConfirm) {
    const baseDef = opponentById(next.opponentId);
    const roster = ensureStarterRoster(store);
    if (!baseDef || !roster) { onConfirm(); return; } // 無資料（防呆）＝直接出戰
    const saved = store.loadLineup();
    const members = roster.members;
    const playerId = player.id;
    const oldMates = members.filter((m) => m.dna?.teamId === next.opponentId);
    // W1(P4)：與開賽同一條轉換鏈——①ace 畢業遞補（第 2 屆起換臉：新王牌金框＋新稱號）
    // ②挖角/校友除名（畢業的招募生不還魂）
    const seasonN = store.seasonIndex?.() ?? 1;
    const seasonDef = applySeasonRoster(baseDef, seasonN);
    const def = applyPoaching(seasonDef, [
      ...oldMates.map((m) => m.fullName),
      ...(roster.alumni ?? []).map((a) => a.member?.fullName),
    ].filter(Boolean));
    let working = structuredClone(saved);
    // W4 選取模型：{kind:'field',si}｜{kind:'bench',id}｜null（si＝starters 索引）
    let selected = null;
    let notice = null; // 互換被擋的紅字理由（下一次操作清除）

    const nameOf = (id) => (id === playerId
      ? career.playerName
      : (members.find((m) => m.id === id)?.name ?? id));
    const roleKeyOf = (id) => (id === playerId
      ? player.currentRole
      : members.find((m) => m.id === id)?.role);
    // 5-1 對位（拍板 07-23）：僅同角色可互換（OH↔OH、MB↔MB），舉球員↔對角砲例外可換
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
        notice = '不同角色不能替換上場——維持 5-1 對位（舉球員與對角砲除外）';
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
        notice = '不同角色不能互換——維持 5-1 對位（舉球員與對角砲除外），職責才不相撞';
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
    function chipEl({ name, sub, tone, isAce = false, aceTitle = null,
      selectedNow = false, onTap = null, badges = [] }) {
      const c = el('div', [
        'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
        `gap:1px`, `min-height:${short ? 38 : 46}px`, 'padding:4px 2px', 'border-radius:10px',
        'text-align:center', 'min-width:0',
        tone === 'enemy' ? 'background:rgba(88,44,26,0.5)' : 'background:rgba(17,42,62,0.75)',
        `border:2px solid ${selectedNow ? COLOR.cyan : isAce ? COLOR.gold : 'rgba(255,255,255,0.06)'}`,
        ...(isAce ? ['box-shadow:0 0 10px rgba(255,209,102,0.35)'] : []),
        ...(onTap ? ['cursor:pointer', 'touch-action:manipulation'] : []),
      ]);
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
      return g ? (GRADE_LABEL[Math.min(3, currentGrade(g, seasonN))] ?? '') : '';
    };
    const oppChip = (i) => chipEl({
      name: def.squad?.[i] ?? `${def.name}${i + 1}號`,
      sub: [OPP_ROLE[i], oppGradeLabel(i), `${(def.heights?.[i] ?? 1.85).toFixed(2)}m`]
        .filter(Boolean).join('・'),
      tone: 'enemy',
      isAce: def.ace?.slot === i,
      aceTitle: def.ace?.title,
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
      ], OUR_TEAM_NAME));
      head.appendChild(el('div', ['font-size:12px', 'font-weight:900', `color:${COLOR.dim}`], 'VS'));
      head.appendChild(el('div', [
        'font-size:18px', 'font-weight:900', 'color:#ff9d7a', 'letter-spacing:1px',
      ], def.name));
      card.appendChild(head);
      card.appendChild(el('div', [
        'font-size:12px', `color:${COLOR.dim}`, 'text-align:center', 'line-height:1.5',
      ], def.trait));
      // 情報行：王牌亮相／被挖走無王牌／情蒐警告／舊隊情結
      const intel = el('div', [
        'display:flex', 'flex-direction:column', 'gap:2px', 'align-items:center',
      ]);
      if (def.ace) {
        const aceRole = def.ace.slot === 'L' ? '自由人' : OPP_ROLE[def.ace.slot];
        intel.appendChild(el('div', ['font-size:12.5px', 'font-weight:800', `color:${COLOR.gold}`],
          `王牌 ${def.ace.name}（${aceRole}）——「${def.ace.title}」`));
      } else if (seasonDef.ace) {
        // W1(P4)：以「該屆應有的王牌」為基準——畢業拔除不誤報成被挖走
        intel.appendChild(el('div', ['font-size:12px', 'font-weight:700', `color:${COLOR.cyan}`],
          `他們的王牌？現在穿著遊隼的球衣。`));
      }
      if (def.scoutRead > 0 && career.scouting?.[next.opponentId]) {
        intel.appendChild(el('div', ['font-size:11.5px', 'color:#ffb454'],
          '⚠ 這隊研究過你——慣用線路會被讀'));
      }
      if (oldMates.length) {
        intel.appendChild(el('div', ['font-size:11.5px', `color:${COLOR.cyan}`],
          `🔗 ${oldMates.map((m) => m.name).join('、')} 要打老東家`));
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
      card.appendChild(tools);

      const confirm = button('✓ 確認出戰', legal, () => {
        if (!legal) return;
        store.saveLineup(working);
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
      `${ROLE_ABBR[member.role] ?? member.role}・${GRADE_LABEL[member.growth.grade] ?? ''}・${member.height.toFixed(2)}m`));
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

    // 屬性列：可成長六項附成長量與 85 上限刻度；控制/體力灰顯（不開放成長）
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
        `${ROLE_ABBR[member.role] ?? member.role}・${GRADE_LABEL[member.growth.grade] ?? ''}`));
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
    const box = el('div', [
      'display:flex', 'flex-direction:column', 'gap:8px', `background:${COLOR.card}`,
      'border-radius:14px', 'padding:12px 16px', 'width:min(340px, 92vw)', 'margin-top:4px',
    ]);
    if (!rec || !roster) {
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
        top.appendChild(el('div', ['font-size:12px', 'font-weight:700', `color:${COLOR.red}`],
          '⚠ 名冊已滿'));
      } else if (met) {
        top.appendChild(el('div', ['font-size:12px', 'font-weight:700', `color:${COLOR.gold}`],
          '條件達成'));
      }
      row.appendChild(top);
      if (!done && !gone) {
        const parts = [];
        if (cond.wins != null) parts.push(`勝場 ${Math.min(p.wins, cond.wins)}/${cond.wins}`);
        if (cond.feat) {
          parts.push(`${cond.feat.label} ${Math.min(p.feat, cond.feat.count)}/${cond.feat.count}`);
        }
        if (cond.stage) parts.push(`在決賽擊敗 ${p.stageCleared ? '✓' : '—'}`);
        row.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'text-align:left',
          'line-height:1.4'], parts.join('・')));
      }
      box.appendChild(row);
    }
    return box;
  }

  // 事件入帳＋效果套用（先落檔再播對話——中斷不掉進度），對話播完接 after
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

    // 用實際解析結果判斷（壞檔時 key 還在但讀不回來——不給沒作用的按鈕）
    const career = store.loadCareer();
    const hasUsableSave = career !== null && store.loadPlayer() !== null;
    if (hasUsableSave) {
      const rec = careerRecord(career);
      root.appendChild(button('▶ 繼續生涯', true, () => renderCareer()));
      root.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`],
        `${career.playerName}・地區賽 ${rec.wins} 勝 ${rec.losses} 敗`));
    }

    // 新生涯（W2 憲法 Q6/Q7 創角流程）：名字＋真實身高 → 教練面談（A4 三段式）→
    // 志願登記（全位置自由選）→ 建檔（一律 OH 出道）。已有存檔時要點兩次確認覆蓋。
    const newPanel = el('div', [
      'display:none', 'flex-direction:column', 'align-items:center', 'gap:10px',
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
    let confirmArmed = false;
    const startBtn = button('開始生涯', true, () => {
      if (hasUsableSave && !confirmArmed) {
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
            renderCareer();
          });
        });
      });
    });
    newPanel.appendChild(startBtn);

    root.appendChild(button('新生涯', false, () => {
      newPanel.style.display = newPanel.style.display === 'none' ? 'flex' : 'none';
    }));
    root.appendChild(newPanel);
    root.appendChild(button('快速比賽', false, () => { hide(); onQuick(); }));

    const ioRow = el('div', ['display:flex', 'gap:10px', 'margin-top:6px']);
    if (hasUsableSave) ioRow.appendChild(smallButton('匯出存檔', exportSave));
    ioRow.appendChild(smallButton('匯入存檔', () => fileInput.click()));
    root.appendChild(ioRow);
    root.appendChild(msgEl);
  }

  // ---- 生涯視圖（隊伍戰績＋賽程）----
  function renderCareer() {
    let career = store.loadCareer();
    const player = store.loadPlayer();
    if (!career || !player) { renderHome(); return; }
    normalizeCareerPlayer(player); // 跨版本存檔補正（顯示與開賽同一套語意）
    // 拍板 07-22：中途退出＝棄賽敗（開賽 pending 標記未清＝沒打完就跑）
    const settled = resolveForfeit(career);
    if (settled !== career) {
      const forfeited = settled.results.length > career.results.length;
      store.saveCareer(settled);
      career = settled;
      if (forfeited) setMsg('上一場中途離開——依規記為棄賽敗（0:25）');
    }
    // stage 4 賽後事件：回到生涯畫面先播（入帳後不重複；播完重繪）。
    // W2(P4) canon 年級守衛：大山已畢業＝帶 elderId 的事件改播轉授版
    const postEvs = resolveEventsForRoster(
      dueEvents(career, 'post'), store.loadRoster?.()?.members ?? null,
    );
    if (postEvs.length) {
      fireEvents(postEvs, career, player, () => renderCareer());
      return;
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
    root.appendChild(el('div', ['font-size:14px', `color:${COLOR.dim}`],
      `${OUR_TEAM_NAME}・戰績 ${rec.wins} 勝 ${rec.losses} 敗・二傳信任 ${player.trust.fromSetter}`));
    root.appendChild(growthSection(career, player));
    root.appendChild(rosterSection(career)); // W2 名冊（唯讀隊友卡入口）
    root.appendChild(recruitSection()); // W4 招募進度（五條進度×空位並列）
    const stage = careerStage(career);

    // 賽程列（兩區共用）：勝負／下一場／鎖定／止步後不再進行
    const rowFor = (m) => {
      const result = career.results.find((r) => r.matchId === m.id);
      const isNext = next?.id === m.id;
      const row = el('div', [
        'display:flex', 'justify-content:space-between', 'align-items:center',
        'height:52px', 'padding:0 16px', 'border-radius:12px', `background:${COLOR.card}`,
        `border:1px solid ${isNext ? COLOR.cyan : 'transparent'}`,
      ]);
      const title = m.label ? `${m.label}・${opponentName(m.opponentId)}` : opponentName(m.opponentId);
      // W6 A2：指定邀請場帶徽章（輪抽結果屆初公開，邀請場一眼可辨）
      row.appendChild(el('div', ['font-size:16px', 'font-weight:600'],
        m.invited ? `⭐ ${title}` : title));
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
      } else {
        status = el('div', ['font-size:14px', `color:${COLOR.dim}`], '未開打');
      }
      row.appendChild(status);
      return row;
    };

    const list = el('div', [
      'display:flex', 'flex-direction:column', 'gap:8px', 'width:min(340px, 92vw)',
    ]);
    list.appendChild(el('div', [
      'font-size:14px', `color:${COLOR.cyan}`, 'letter-spacing:3px', 'margin-top:4px',
    ], '地區賽・小組循環'));
    for (const m of career.schedule.filter((x) => x.stage === 'group')) list.appendChild(rowFor(m));
    list.appendChild(el('div', [
      'font-size:14px', `color:${COLOR.cyan}`, 'letter-spacing:3px', 'margin-top:8px',
    ], '全國賽・單淘汰'));
    for (const m of career.schedule.filter((x) => x.stage === 'national')) list.appendChild(rowFor(m));
    root.appendChild(list);

    // W5 賽季輪迴：季末（奪冠/止步）→ 進入下一屆——名冊/招募/技巧/宿敵全保留。
    // 難度綁成就：止步＝對手原強度（帶著成長捲土重來）；奪冠＝衛冕屆對手升級
    // W6 A2：先選指定邀請（或不指定）再推進——選完即輪抽、賽程視圖直接公開結果
    // W1(P4) 時間系統：流程＝畢業儀式（我方三年級具名離別＋對手 ace 畢業播報）→
    // 指定邀請 → advanceSeason（名冊換血：畢業→年級推進→新生入學，單次 RMW）→
    // 新生入學見面 → 下屆開場（衛冕 defend／捲土重來 comeback）＋屆間訓練營
    const nextSeasonBtn = (label, openerKey) => button(label, true, () => {
      const roster = ensureStarterRoster(store);
      const graduates = (roster?.members ?? []).filter((m) => (m.growth?.grade ?? 2) >= 3);
      const aceGrads = graduatingAces(store.seasonIndex?.() ?? 1);
      // W3(P4) 乙5：畢業儀式接演出框架——opening 對話 → 逐位聚光演出（WebGL 失敗
      // 在 ritual 內退化台詞卡）→ ace 播報＋收尾對話；三段同一事實源（segments）
      const segs = graduationCeremonySegments({
        graduates, aceGrads, members: roster?.members ?? [],
      });
      dialogPlay([{ lines: segs.opening }], () => showGraduationRitual({
        perGraduate: segs.perGraduate,
        onDone: () => dialogPlay([{ lines: [...segs.aceLines, ...segs.closing] }], () => {
          showInvitePicker((invitedId) => {
          const adv = store.advanceSeason?.({ invitedId });
          if (!adv) return;
          // W2(P4)：advanceSeason 已在存檔內揭曉身高——必須重載 player，
          // 拿閉包舊物件直接 savePlayer 會把新身高蓋回去（timeline 倒退）
          const freshPlayer = store.loadPlayer() ?? player;
          // W7.1 屆間訓練營（#6 拍板 C）：主角耐力 +2（上限 80）——寫檔後接對話尾播
          const trained = applyOffseasonTraining(freshPlayer);
          freshPlayer.attributes = trained.attributes;
          store.savePlayer(freshPlayer);
          const continueChain = () => {
            const seqs = [];
            // A3 跨帶檢查：長高跨進新身高帶＝教練追加動態評語（接在儀式演出後）
            if (adv.heightReveal) {
              const shift = bandShiftLines(adv.heightReveal.fromCm, adv.heightReveal.toCm);
              if (shift) seqs.push({ lines: shift });
            }
            const intro = freshmenIntroLines(adv.freshmen ?? []);
            if (intro.length) seqs.push({ lines: intro });
            const opener = [...(SEASON_OPENERS[openerKey] ?? []), ...OFFSEASON_TRAINING_LINES];
            if (opener.length) seqs.push({ lines: opener });
            // W3(P4)：屆間鏈尾端接轉位教練談話（旗標 open 才觸發，無談話＝直接回賽程）
            const finish = () => maybePositionTalk(() => renderCareer());
            if (seqs.length) dialogPlay(seqs, finish);
            else finish();
          };
          // W2(P4) 「你長高了」儀式演出（暗場聚光/身高尺/模型即時長高/參數刻度）
          if (adv.heightReveal) {
            showHeightRitual({ player: freshPlayer, reveal: adv.heightReveal, onDone: continueChain });
          } else {
            continueChain();
          }
          });
        }),
      }));
    });
    // W1(P4)：高中章固定三屆——第 3 屆收束不再推進，掛生涯結算佔位（W4 實作）
    const careerOver = (stage === 'champion' || stage === 'eliminated') && seasonN >= 3;
    if (careerOver) {
      root.appendChild(el('div', [
        'font-size:22px', 'font-weight:900', `color:${stage === 'champion' ? COLOR.gold : COLOR.cyan}`,
        'margin-top:8px', 'letter-spacing:2px',
      ], stage === 'champion' ? '🏆 全國冠軍！' : `止步全國賽`));
      root.appendChild(el('div', ['font-size:14px', `color:${COLOR.dim}`],
        `第 3 屆結束（${rec.wins} 勝 ${rec.losses} 敗）——高中三年，打完了`));
      root.appendChild(el('div', ['font-size:13px', `color:${COLOR.gold}`, 'font-weight:700',
        'max-width:min(340px, 92vw)', 'text-align:center', 'line-height:1.6', 'margin-top:4px'],
      '生涯結算即將到來——三年的數據、關鍵球與送別（開發中）'));
    } else if (stage === 'champion') {
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
    } else if (stage === 'eliminated') {
      const lost = career.results.find((r) => !r.won &&
        career.schedule.find((m) => m.id === r.matchId)?.stage === 'national');
      const lostLabel = career.schedule.find((m) => m.id === lost?.matchId)?.label ?? '全國賽';
      root.appendChild(el('div', [
        'font-size:20px', 'font-weight:800', `color:${COLOR.red}`, 'margin-top:8px',
      ], `止步${lostLabel}`));
      root.appendChild(el('div', ['font-size:14px', `color:${COLOR.dim}`],
        `本屆戰績 ${rec.wins} 勝 ${rec.losses} 敗`));
      root.appendChild(nextSeasonBtn('▶ 捲土重來——進入下一屆', 'comeback'));
      root.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`,
        'max-width:min(340px, 92vw)', 'text-align:center', 'line-height:1.5'],
      '名冊成長、招募進度、學會的技巧全數保留——變強的是你們'));
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
        const rosterNow = store.loadRoster?.() ?? null;
        const preEvs = [
          ...resolveEventsForRoster(dueEvents(career, 'pre'), rosterNow?.members ?? null),
          ...oldTeamPreEvents(career, rosterNow),
        ];
        if (preEvs.length) fireEvents(preEvs, career, player, go);
        else go();
      };
      // W8 對陣畫面（07-26 拍板）：出戰必經——對面具名亮相＋球場對位排陣；
      // 點外側＝返回不出戰（取代舊 ⚙ 先發編排 opt-in 面板與敵情一行字）
      root.appendChild(button(`▶ 出戰 ${opponentName(next.opponentId)}`, true,
        () => showMatchupScreen(career, player, next, startMatch)));
    }
    const ioRow = el('div', ['display:flex', 'gap:10px', 'margin-top:4px']);
    ioRow.appendChild(smallButton('返回主選單', renderHome));
    ioRow.appendChild(smallButton('匯出存檔', exportSave));
    // W3(P4) 甲4 手批面板（PWA 版入口）：主畫面 standalone 無網址列、存檔又與瀏覽器
    // 分離＝?openPosition= 蓋不到章——改附生涯畫面入口（仍是 Sawmah 手動批，守衛不變；
    // 上架前移除此入口——快照試玩清單記錄）。
    // 07-27 Sawmah 裁定：四位置全開後自動隱藏（不干擾遊戲畫面）；刪檔重開＝旗標
    // 歸零＝按鈕自動回來（PWA 上唯一補批管道，不能全刪）
    const pFlags = store.loadPositionFlags?.() ?? {};
    const allOpen = ['setter', 'middle', 'opposite', 'libero']
      .every((p) => pFlags[p] === 'open');
    if (!allOpen) ioRow.appendChild(smallButton('🔓 位置開放', showOpenPanel));
    root.appendChild(ioRow);
    root.appendChild(msgEl);
  }

  // 手批面板：四位置旗標現況＋逐位/全部批准（只有 ready 可批——approveOpenPosition
  // 守衛）。原地重繪＋明確回饋（remove/重開會閃跳頂部、看起來像沒反應——07-27 修）
  function showOpenPanel() {
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
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    const STATE_LABEL = { locked: '未就緒', ready: '可批准', open: '✓ 已開放' };
    const paint = (note) => {
      card.replaceChildren();
      card.appendChild(el('div', [
        'font-size:17px', 'font-weight:800', `color:${COLOR.text}`, 'letter-spacing:1px',
      ], '🔓 位置開放（試玩手批）'));
      card.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`, 'line-height:1.6'],
        '批准的位置會在屆間由教練找你談轉位。這是試玩驗收入口——正式上架前會移除。'));
      const flags = store.loadPositionFlags?.() ?? {};
      for (const p of ['setter', 'middle', 'opposite', 'libero']) {
        const st = flags[p] ?? 'locked';
        card.appendChild(button(
          `${roleLabel(p)}｜${STATE_LABEL[st]}${st === 'ready' ? '——點我批准' : ''}`,
          st === 'ready',
          () => {
            if ((store.loadPositionFlags?.() ?? {})[p] !== 'ready') return;
            store.approveOpenPosition?.(p);
            paint(`✓ ${roleLabel(p)} 已開放`);
          },
        ));
      }
      const allOpen = ['setter', 'middle', 'opposite', 'libero']
        .every((p) => flags[p] === 'open');
      if (allOpen) {
        card.appendChild(el('div', [
          'font-size:15px', 'font-weight:800', 'color:#7ee787', 'text-align:center',
          'padding:6px 0',
        ], '✓ 四位置全數開放——屆間教練會來找你談轉位'));
      } else {
        card.appendChild(button('✓ 全部批准', true, () => {
          for (const p of ['setter', 'middle', 'opposite', 'libero']) store.approveOpenPosition?.(p);
          paint('✓ 已全部批准');
        }));
      }
      if (note) {
        card.appendChild(el('div', [
          'font-size:13px', 'font-weight:700', 'color:#7ee787', 'text-align:center',
        ], note));
      }
      card.appendChild(button('關閉', false, () => overlay.remove()));
    };
    paint();
  }

  // stage 3 成長區：點數/上場表現/屬性加點（次要）/技術解鎖（主要）
  function growthSection(career, player) {
    const gp = career.growthPoints ?? 0;
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

    // 屬性層（1 點＝+1，上限 90）
    const grid = el('div', ['display:grid', 'grid-template-columns:repeat(3,1fr)', 'gap:6px']);
    for (const a of GROWABLE_ATTRS) {
      const v = player.attributes[a.key];
      const can = gp >= 1 && v < GROWTH.ATTR_CAP;
      const b = el('button', [
        'height:38px', 'border-radius:10px', 'border:1px solid #2c3a58', 'font-size:13px',
        'cursor:pointer', 'touch-action:manipulation', 'font-weight:600',
        can ? `background:rgba(30,40,64,0.9);color:${COLOR.text}`
          : `background:transparent;color:${COLOR.dim};opacity:0.5`,
      ], `${a.name} ${v} ＋`);
      b.disabled = !can;
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (can) spend(() => spendAttribute(player, a.key), 1);
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
