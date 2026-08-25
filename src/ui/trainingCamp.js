// 屆間養成卷 E4／E6／E7（2026-08-09）— 集訓外殼（演出＋選擇）
//
// ★ 外殼同一套、只換內容格（題一裁定丙）★ 兩次集訓走同一支函式：
//   第一次（seasonIndex=2）：技術補修（叫戰術）＋屬性特訓，**無默契格**
//   第二次（seasonIndex=3）：屬性特訓＋默契，技術補修那格顯示「這次沒有要補的」
//
// 形狀來源（不發明新框架）：
//   · 演出＝ graduationRitual.js（暗場／聚光／幾何模型／逐句點擊推進、WebGL 失敗退化台詞卡）
//   · 選擇＝ careerScreen.js growthSection 的加點面板（格子鈕＋說明行）——**另開格，不動它**
//
// ★ 默契在本卷零效果 ★ 選了誰只寫進 `player.chemistry.focusId`，文案如實呈現、
// 不得暗示已有作用（題五：量測先於參數）。
import { createRitualStage, tween } from '../render/ritualStage.js';
import {
  campPlanFor, campAttrOptions, applyCampAttrTraining,
  chemistryCandidates, recordChemistryFocus, chemistryEmptyNote,
  pendingCampSlots, CAMP_OPENING_LINES, campAttrPicks, practicePlayedIn,
} from '../career/trainingCamp.js';
import { drillDefOf } from '../career/practiceMatch.js';
import { OFFSEASON_TRAINING_LINES } from '../career/events.js';
import { ROLE_ABBR } from '../career/roster.js';

const COLOR = {
  text: '#eef2fa', dim: '#9fb0cc', gold: '#ffd166', cyan: '#6ee7ff',
  card: 'rgba(18,24,40,0.85)',
  warn: '#ffb4a2', // 未完成提醒（暖橘，不用純紅——這不是錯誤，是「你還沒領」）
};

function el(tag, styles, text) {
  const node = document.createElement(tag);
  node.style.cssText = styles.join(';');
  if (text !== undefined) node.textContent = text;
  return node;
}

function reduceMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

function slotCard(title, subtitle) {
  const box = el('div', [
    `background:${COLOR.card}`, 'border-radius:12px', 'border:1px solid #2c3a58',
    'padding:10px 14px', 'display:flex', 'flex-direction:column', 'gap:6px',
    'text-align:left', 'width:100%',
  ]);
  box.appendChild(el('div', [
    'font-size:13px', `color:${COLOR.cyan}`, 'letter-spacing:3px',
  ], title));
  if (subtitle) {
    box.appendChild(el('div', [
      'font-size:12px', `color:${COLOR.dim}`, 'line-height:1.5',
    ], subtitle));
  }
  return box;
}

function gridButton(label, enabled, onTap) {
  const b = el('button', [
    'min-height:40px', 'border-radius:10px', 'border:1px solid #2c3a58', 'font-size:13px',
    'padding:6px 10px', 'touch-action:manipulation', 'font-weight:600',
    enabled
      ? `background:rgba(30,40,64,0.9);color:${COLOR.text};cursor:pointer`
      : `background:transparent;color:${COLOR.dim};opacity:0.5;cursor:default`,
  ], label);
  b.disabled = !enabled;
  b.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (enabled) onTap();
  });
  return b;
}

/**
 * 集訓（屆間鏈掛點；呼叫端＝careerScreen 的 nextSeasonBtn，advanceSeason 之後）。
 *
 * @param {object}   o.player       advanceSeason 後重載的主角（本函式不寫檔）
 * @param {number}   o.seasonIndex  advanceSeason **之後**的屆數（2＝第一次、3＝第二次）
 * @param {Array}    o.members      當屆名冊成員（畢業已生效——默契候選要吃這一份）
 * @param {Function} o.playTech     技術補修：`(done) => void`，呼叫端負責播教學事件；
 *                                  無事件時直接 done()。`techPending` 為 false 時不會被呼叫。
 * @param {boolean}  o.techPending  這次集訓有沒有技術補修的內容（事件表才是真相源）
 * @param {string[]} o.techNames    要補修的技術名（顯示用）
 * @param {Function} o.onDone       `(updatedPlayer) => void`；回傳的是新物件，呼叫端負責落檔
 * @param {object}   o.practice     這屆紅白賽成績（`store.loadPractice()`；缺省＝沒打）
 * @param {Array}    o.drills       這屆紅白賽的科目清單（`drillsFor` 的輸出，顯示用）
 * @param {Function} o.onPractice   `() => void`＝開打（呼叫端導向比賽；本函式不落檔）
 */
export function showTrainingCamp({
  player, seasonIndex, members = [], playTech = null, techPending = false,
  techNames = [], onDone, practice = null, drills = [], onPractice = null,
  uniYear = null, // 大二卷批 5：大學章傳章內年份（title 換版＋默契關閉），高中不傳
}) {
  const plan = campPlanFor(seasonIndex, { uniYear });
  // 紅白賽：這一屆打過了沒（屆數要對得上——上屆成績不得讓這屆看起來已完成）
  const practicePlayed = practicePlayedIn(practice, seasonIndex);
  // 打過才吃它的獎勵（沒打＝零完成＝一項名額、控球格不開）
  const practiceNow = practicePlayed ? practice : null;
  const attrPicks = campAttrPicks(practiceNow);
  const unlockControl = !!practiceNow?.unlockControl;
  const motionOff = reduceMotion();
  const dur = (ms) => (motionOff ? 0 : ms);
  let cur = player; // 不可變累積：每個選擇產生新的 player 物件

  const overlay = el('div', [
    'position:fixed', 'inset:0', 'z-index:39', 'display:flex', 'flex-direction:column',
    'align-items:center', 'justify-content:safe center', 'gap:12px', 'overflow-y:auto',
    'background:rgba(2,4,9,0.96)', 'opacity:0', 'transition:opacity 0.35s ease',
    'padding:calc(env(safe-area-inset-top, 0px) + 20px) 16px 32px',
    'font-family:system-ui,sans-serif', 'user-select:none',
  ]);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });

  const header = el('div', [
    'font-size:13px', `color:${COLOR.dim}`, 'letter-spacing:6px',
  ], '冬 季 集 訓');
  overlay.appendChild(header);

  const body = el('div', [
    'display:flex', 'flex-direction:column', 'align-items:center', 'gap:12px',
    'width:min(360px, 92vw)',
  ]);
  overlay.appendChild(body);

  let stage = null;
  const disposeStage = () => {
    if (stage) { stage.dispose(); stage.el.remove(); stage = null; }
  };
  const finish = () => {
    overlay.remove();
    disposeStage();
    onDone(cur);
  };

  // ---- 段一：演出（沿畢業儀式形狀）----
  const runOpening = async () => {
    const stageW = Math.min(300, Math.floor(window.innerWidth * 0.8));
    const stageSlot = el('div', [
      'display:flex', 'align-items:center', 'justify-content:center',
      `width:${stageW}px`, 'min-height:280px',
    ]);
    body.appendChild(stageSlot);
    const titleEl = el('div', [
      'font-size:22px', 'font-weight:900', `color:${COLOR.text}`, 'letter-spacing:4px',
    ], plan.title);
    body.appendChild(titleEl);
    const speakerEl = el('div', [
      'font-size:13px', 'font-weight:800', `color:${COLOR.gold}`, 'min-height:18px',
    ], '');
    const textEl = el('div', [
      'font-size:15px', `color:${COLOR.text}`, 'line-height:1.7', 'min-height:52px',
      'max-width:min(420px, 88vw)', 'text-align:center',
    ], '');
    body.appendChild(speakerEl);
    body.appendChild(textEl);
    const hint = el('div', ['font-size:11px', `color:${COLOR.dim}`], '▼ 點擊繼續');
    body.appendChild(hint);

    try {
      stage = createRitualStage({
        playerId: player.id ?? 'A2',
        teamId: 'A',
        role: player.currentRole ?? 'outside',
        heightM: player.height?.current ?? 1.85,
        width: stageW,
        height: 280,
      });
      stageSlot.appendChild(stage.el);
    } catch { stage = null; /* WebGL 失敗＝退化台詞卡（同 graduationRitual） */ }

    // 批 5 覆審 HIGH 修：大學版 plan 帶 openingKey（uni/uniFinal）；高中缺鍵回退
    // ordinal＝逐字不變
    const lines = CAMP_OPENING_LINES[plan.openingKey ?? plan.ordinal] ?? [];
    let li = 0;
    let busy = true;
    const paint = () => {
      const line = lines[li];
      speakerEl.textContent = line?.speaker ?? '';
      textEl.textContent = line?.text ?? '';
    };
    paint();
    await tween(dur(700), (t) => { if (stage) stage.setSpot(t); });
    if (stage) stage.setSpot(1);
    busy = false;

    const advance = async () => {
      if (busy) return;
      li += 1;
      if (li < lines.length) { paint(); return; }
      busy = true;
      overlay.removeEventListener('pointerdown', onTap);
      await tween(dur(380), (t) => { if (stage) stage.setSpot(1 - t); });
      disposeStage();
      // 技術補修排在選擇面板之前：先上課、再自己練
      if (techPending && playTech) {
        overlay.style.display = 'none'; // 讓位給生涯畫面的對話層
        playTech(() => {
          overlay.style.display = 'flex';
          renderPanel();
        });
      } else {
        renderPanel();
      }
    };
    const onTap = (e) => { e.stopPropagation(); advance(); };
    overlay.addEventListener('pointerdown', onTap);
  };

  // ---- 段二：選擇（沿加點面板形狀；集訓另開格，不動逐場成長面板）----
  function renderPanel() {
    body.replaceChildren();
    body.appendChild(el('div', [
      'font-size:20px', 'font-weight:900', `color:${COLOR.text}`, 'letter-spacing:3px',
    ], plan.title));
    body.appendChild(el('div', [
      'font-size:12px', `color:${COLOR.dim}`, 'line-height:1.5', 'text-align:center',
    ], plan.subtitle ?? (plan.ordinal === 1
      ? '第一年學基本功，第二年學配合——這個冬天先把「怎麼叫球」學起來。'
      : '最後一個冬天。補齊自己，然後挑一個要一起跑到最後的人。')));

    // 格①技術補修
    const techBox = slotCard('技術補修', techPending
      ? `這個冬天教你：${techNames.join('、') || '新技術'}`
      : '這次沒有要補的技術——該教的都教過了，剩下的靠比賽。');
    if (techPending) {
      techBox.appendChild(el('div', [
        'font-size:12px', `color:${COLOR.gold}`,
      ], '✓ 已上課'));
    }
    body.appendChild(techBox);

    // 「▶ 結束集訓」那顆鈕的未完成提示要跟著每一次選擇更新；鈕在本函式尾端才建得出來，
    // 所以先擺一個 no-op，等它建好再指派（選擇 handler 只在渲染完成後才跑得到）。
    let refreshDone = () => {};

    // 格②紅白對抗賽（練習賽卷 2026-08-12 題五：取代原「技術補修」的被動格位置——
    // 技術補修改成在紅白賽**之前**播，聽完馬上用）。
    // ★ 排在屬性特訓之前 ★ 它決定屬性特訓的名額與控球格，順序反了玩家會先挑完才發現
    // 「原來可以挑兩項」。
    // ★ 沒接 onPractice 就整格不畫 ★ 畫一顆按不下去的鈕比不畫更糟（玩家會一直戳它）
    if (plan.hasPractice && onPractice) {
      const drillList = (drills ?? [])
        .map((d) => drillDefOf(d)?.label)
        .filter(Boolean);
      const practiceBox = slotCard('🏐 紅白對抗賽', practicePlayed
        ? '這一屆的紅白賽打完了——一屆只有一場。'
        : '隊上分紅白兩隊，缺人補訓練組的臨時球員。教練會照今天的科目餵球。');
      if (practicePlayed) {
        practiceBox.appendChild(el('div', [
          'font-size:13px', 'font-weight:800', `color:${COLOR.gold}`,
        ], `科目完成 ${practice.completed}/${practice.total}`));
        practiceBox.appendChild(el('div', [
          'font-size:11px', `color:${COLOR.dim}`, 'line-height:1.5',
        ], practice.unlockControl
          ? '全數完成——屬性特訓可挑兩項，控球格開放。'
          : (practice.completed >= 2
            ? '完成 2 項以上——屬性特訓可挑兩項。'
            : '完成不到 2 項——屬性特訓維持一項、控球格沒開。')));
      } else {
        for (const label of drillList) {
          practiceBox.appendChild(el('div', [
            'font-size:12px', `color:${COLOR.text}`, 'line-height:1.6',
          ], `· ${label}`));
        }
        if (!drillList.length) {
          practiceBox.appendChild(el('div', [
            'font-size:12px', `color:${COLOR.dim}`,
          ], '（這屆沒有科目——教練說今天自由打）'));
        }
        practiceBox.appendChild(gridButton('▶ 開打', !!onPractice, () => {
          // ★ 這裡刻意什麼都不落檔 ★ 集訓成果要等 onDone 才寫；紅白賽打完回來時
          // `campPending` 旗標還在（advanceSeason 那次 RMW 寫的），renderCareer 會
          // 重新開一次集訓，那時候 practice 已有成績 ⇒ 名額與控球格自動跟上。
          overlay.remove();
          disposeStage();
          onPractice();
        }));
      }
      body.appendChild(practiceBox);
    }

    // 格③屬性特訓（池＝逐場加點面板不開放的集合；留白項不可選）
    const attrBox = slotCard('屬性特訓',
      `集訓限定：這裡練的是逐場加點面板練不到的東西（兩邊的清單不重疊）。這次可以挑 ${attrPicks} 項。`);
    const grid = el('div', [
      'display:grid', 'grid-template-columns:repeat(2,1fr)', 'gap:6px', 'margin-top:2px',
    ]);
    const attrMsg = el('div', ['font-size:12px', `color:${COLOR.gold}`, 'min-height:17px'], '');
    let attrPicked = 0;
    const opts = campAttrOptions(cur, { unlockControl });
    const paintAttrs = () => {
      grid.replaceChildren();
      for (const o of campAttrOptions(cur, { unlockControl })) {
        const label = o.ready
          ? `${o.name} ${o.value} ＋${o.gain}`
          : `${o.name} ${o.value}（${o.reason}）`;
        grid.appendChild(gridButton(label, o.ready && attrPicked < attrPicks, () => {
          cur = applyCampAttrTraining(cur, o.key, { unlockControl });
          attrPicked += 1;
          // 耐力那格的完成語＝既有屆間訓練營台詞（同一份文案，不另寫第二份）
          const line = o.key === 'stamina'
            ? (OFFSEASON_TRAINING_LINES[0]?.text ?? `${o.name} +${o.gain}`)
            : `${o.name} +${o.gain}`;
          attrMsg.textContent = attrPicked < attrPicks
            ? `${line}（還可以挑 ${attrPicks - attrPicked} 項）`
            : line;
          paintAttrs();
          refreshDone();
        }));
      }
    };
    paintAttrs();
    attrBox.appendChild(grid);
    attrBox.appendChild(attrMsg);
    for (const o of opts) {
      attrBox.appendChild(el('div', [
        'font-size:11px', `color:${COLOR.dim}`, 'line-height:1.45',
      ], `${o.name}｜${o.desc}`));
    }
    body.appendChild(attrBox);

    // 格③默契（僅第二次集訓）
    if (plan.hasChemistry) {
      const role = cur.currentRole ?? 'outside';
      const cands = chemistryCandidates({ role, members });
      const chemBox = slotCard('默契',
        '挑一個人，這個冬天陪他練。默契算的是「你和他一起跑成一次組合攻擊」的次數。');
      if (!cands.length) {
        // ★ 空清單有兩種成因，不得混播（覆審 MEDIUM-1）★ 裁定書只裁了單人退化，
        // 沒裁「零」；照舊碼一律播自由人那段的話，OH 玩家會讀到「自由人不進攻擊池」。
        //   no-carrier  ＝這個位置本卷根本沒載體（自由人，題三-L 閘住）→ 原文照舊
        //   no-candidate＝載體在、名冊上湊不出對象（畢業／逐出）→ 另一段，說對事
        // 兩段都不得發明補位邏輯（裁定書題二明令）。
        // 選法本身留在資料層（chemistryEmptyNote）——測試驗得到的就是這一支
        for (const note of chemistryEmptyNote(role, members)) {
          chemBox.appendChild(el('div', [
            'font-size:12px', `color:${COLOR.dim}`, 'line-height:1.6',
          ], note));
        }
      } else {
        chemBox.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'line-height:1.5'],
          `你打 ${ROLE_ABBR[role] ?? role}——能跟你跑成一條線的，是這些人。`));
        const chemMsg = el('div', ['font-size:12px', `color:${COLOR.gold}`, 'min-height:17px'], '');
        const list = el('div', ['display:flex', 'flex-direction:column', 'gap:6px']);
        const paintChem = () => {
          list.replaceChildren();
          for (const m of cands) {
            const picked = cur.chemistry?.focusId === m.id;
            list.appendChild(gridButton(
              `${picked ? '✓ ' : ''}${m.name}（${ROLE_ABBR[m.role] ?? m.role}）`,
              !picked,
              () => {
                cur = recordChemistryFocus(cur, m.id);
                chemMsg.textContent = `這個冬天，你跟 ${m.name} 一起練。`;
                paintChem();
                refreshDone();
              },
            ));
          }
        };
        paintChem();
        chemBox.appendChild(list);
        chemBox.appendChild(chemMsg);
      }
      body.appendChild(chemBox);
    }

    const done = el('button', [
      'min-height:44px', 'border-radius:12px', 'border:1px solid #2c3a58', 'font-size:15px',
      'font-weight:800', 'cursor:pointer', 'touch-action:manipulation', 'width:100%',
      `background:rgba(40,34,14,0.9);color:${COLOR.gold}`, 'margin-top:4px',
    ], '▶ 結束集訓');
    // 未完成提示：鈕面直接說剩幾項（判定留在資料層 pendingCampSlots，測試驗得到同一支）
    // ★ attrTrained 的語意是「名額用完了沒」★ 名額變成兩項之後，挑了一項還剩一項
    // 也算沒做完——否則「還可以挑一項」這件事只有按過的人才知道。
    const pendingNow = () => pendingCampSlots({
      player: cur,
      plan,
      members,
      attrTrained: attrPicked >= attrPicks,
      practice: practiceNow,
      practicePlayed,
      practiceOffered: !!onPractice,
    });
    refreshDone = () => {
      const pend = pendingNow();
      done.textContent = pend.length
        ? `▶ 結束集訓（還有 ${pend.length} 項沒做：${pend.map((p) => p.label).join('、')}）`
        : '▶ 結束集訓';
      done.style.background = pend.length ? 'rgba(52,30,22,0.9)' : 'rgba(40,34,14,0.9)';
      done.style.color = pend.length ? COLOR.warn : COLOR.gold;
    };
    refreshDone();
    done.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const pend = pendingNow();
      if (!pend.length) { finish(); return; }
      confirmLeave(pend);
    });
    body.appendChild(done);
  }

  // ---- 沒做完就要離場的二次確認（不擋路，只確保他知道自己在放棄什麼）----
  // z-index 40＝壓在集訓覆蓋層（39）之上；退出路徑只有兩條，兩條都明寫在鈕面上。
  function confirmLeave(pend) {
    const ov = el('div', [
      'position:fixed', 'inset:0', 'z-index:40', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:safe center', 'overflow-y:auto',
      'background:rgba(2,4,9,0.82)', 'padding:24px 16px',
      'font-family:system-ui,sans-serif',
    ]);
    const card = el('div', [
      `background:${COLOR.card}`, 'border-radius:16px', 'border:1px solid #4a3a2c',
      'padding:18px 20px', 'width:min(360px, 92vw)', 'display:flex',
      'flex-direction:column', 'gap:8px', 'align-items:stretch', 'text-align:left',
    ]);
    card.appendChild(el('div', [
      'font-size:17px', 'font-weight:800', `color:${COLOR.warn}`, 'letter-spacing:1px',
    ], '這個冬天還沒過完'));
    for (const p of pend) {
      card.appendChild(el('div', [
        'font-size:13px', `color:${COLOR.text}`, 'line-height:1.6',
      ], `· ${p.label}：${p.note}`));
    }
    const btn = (label, primary, onTap) => {
      const b = el('button', [
        'min-height:44px', 'border-radius:12px', 'border:1px solid #2c3a58', 'font-size:14px',
        'font-weight:800', 'cursor:pointer', 'touch-action:manipulation', 'width:100%',
        primary
          ? `background:rgba(40,34,14,0.9);color:${COLOR.gold}`
          : `background:rgba(30,40,64,0.9);color:${COLOR.dim}`,
      ], label);
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); onTap(); });
      return b;
    };
    card.appendChild(btn('← 回去選', true, () => ov.remove()));
    card.appendChild(btn('就這樣結束這個冬天', false, () => { ov.remove(); finish(); }));
    ov.appendChild(card);
    document.body.appendChild(ov);
  }

  runOpening();
}
