// Phase 2 生涯畫面：主選單（繼續/新生涯/快速比賽/匯出匯入）＋賽程視圖（地區賽小組）
// 夜賽同色系；動態文字一律 textContent（匯入的存檔名字不可信，不走 innerHTML）
import {
  createCareer, createCareerPlayer, nextMatch, careerRecord, opponentName,
  careerStage, opponentById, normalizeCareerPlayer, resolveForfeit,
} from '../career/careerState.js';
import { GROWTH, GROWABLE_ATTRS, TECH_DEFS, spendAttribute } from '../career/growth.js';
import {
  ensureStarterRoster, rosterCount, openSlots, totalGains, ROLE_ABBR, ROSTER_GROWTH,
} from '../career/roster.js';
import {
  validateLineup, checkRotationOrder, checkRoleStructure, defaultLineup,
} from '../career/lineup.js';
import {
  RECRUIT_CONDS, RECRUIT_TRUST, progressOf, conditionMet, settleRecruitJoins,
} from '../career/recruitment.js';
import { dueEvents, recordEvent } from '../career/events.js';
import { updateTrust } from '../sim/trust.js';

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

  // ---- W3 先發編排器（tap-to-swap；opt-in——不強制打斷出戰流程）----
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
    const paintOne = () => {
      const m = queue.shift();
      const def = opponentById(m.origin);
      const card = el('div', [
        'width:min(400px, 94vw)', `background:${COLOR.card}`, 'border-radius:16px',
        `border:1px solid ${COLOR.gold}`, 'padding:18px 20px', 'display:flex',
        'flex-direction:column', 'gap:10px', 'box-shadow:0 12px 48px rgba(255,209,102,0.18)',
      ]);
      card.appendChild(el('div', [
        'font-size:14px', 'font-weight:800', `color:${COLOR.gold}`, 'letter-spacing:4px',
        'text-align:center',
      ], '🎉 新隊員入隊'));
      card.appendChild(el('div', ['font-size:13px', `color:${COLOR.dim}`, 'text-align:center'],
        `${def?.name ?? m.origin}的招牌球員，被你們打服了`));
      card.appendChild(el('div', [
        'font-size:34px', 'font-weight:900', `color:${COLOR.text}`, 'text-align:center',
        'letter-spacing:6px',
      ], m.name));
      card.appendChild(el('div', [
        'font-size:14px', 'font-weight:700', `color:${COLOR.cyan}`, 'text-align:center',
      ], `${ROLE_ABBR[m.role] ?? m.role}・二年級轉學生・${m.height.toFixed(2)}m`));
      if (m.persona) {
        card.appendChild(el('div', [
          'font-size:13px', `color:${COLOR.dim}`, 'line-height:1.5', 'text-align:center',
        ], m.persona));
      }
      card.appendChild(el('div', ['font-size:12px', `color:${COLOR.gold}`, 'text-align:center'],
        `DNA｜${m.dna.tag}（${m.dna.style}）`));
      // 屬性亮相（八項、金色數值；成長刻度同隊友卡語彙）
      const attrBox = el('div', ['display:flex', 'flex-direction:column', 'gap:4px', 'margin-top:2px']);
      for (const [key, label] of Object.entries(ATTR_LABELS)) {
        const v = m.attributes[key];
        const row = el('div', ['display:flex', 'align-items:center', 'gap:8px']);
        row.appendChild(el('div', ['width:34px', 'font-size:12px', 'text-align:left',
          `color:${COLOR.text}`], label));
        const bar = el('div', [
          'flex:1', 'height:7px', 'border-radius:4px', 'background:#141b2e',
          'position:relative', 'overflow:hidden',
        ]);
        bar.appendChild(el('div', [
          `width:${v}%`, 'height:100%', 'position:absolute', 'left:0',
          `background:${COLOR.gold}`,
        ]));
        row.appendChild(bar);
        row.appendChild(el('div', [
          'width:34px', 'font-size:12px', 'font-weight:700', 'text-align:right',
          `color:${COLOR.text}`,
        ], String(v)));
        attrBox.appendChild(row);
      }
      card.appendChild(attrBox);
      card.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`, 'text-align:center',
        'line-height:1.5'],
      `信任 ${RECRUIT_TRUST}——新人要用表現贏得舉球權。到「⚙ 先發編排」把他排上場吧`));
      const btn = button('✊ 歡迎入隊', true, () => {
        if (queue.length) {
          paintOne();
        } else {
          recruitOverlay.style.display = 'none';
          recruitOverlay.replaceChildren();
          onDone();
        }
      });
      btn.style.alignSelf = 'center';
      card.appendChild(btn);
      recruitOverlay.replaceChildren(card);
      recruitOverlay.style.display = 'flex';
    };
    paintOne();
  }

  // 開啟排陣器：讀當前 lineup（ensureStarterRoster 已保證補齊）為工作副本，tap 兩格互換。
  // 確認＝saveLineup（持久）＋onConfirm（接既有 pre-event→onPlay 流程）；點外側／無名冊＝取消。
  function showLineupEditor(career, player, onConfirm) {
    const roster = ensureStarterRoster(store);
    if (!roster) { onConfirm(); return; }
    const saved = store.loadLineup();
    const members = roster.members;
    const playerId = player.id;
    let working = structuredClone(saved);
    // W4 選取模型：{kind:'field',i}｜{kind:'bench',id}｜null——場上互換與板凳替換
    // 共用同一套 tap 語彙（不引入新互動範式）
    let selected = null;
    let notice = null; // 互換被擋的紅字理由（下一次操作清除）

    const nameOf = (id) => (id === playerId
      ? career.playerName
      : (members.find((m) => m.id === id)?.name ?? id));
    const roleKeyOf = (id) => (id === playerId
      ? player.currentRole
      : members.find((m) => m.id === id)?.role);
    const roleOf = (id) => ROLE_ABBR[roleKeyOf(id)] ?? '?';
    // 5-1 對位（拍板 07-23）：僅同角色可互換（OH↔OH、MB↔MB），舉球員↔對角砲例外可換
    // ——結構上排不出「同排兩人搶同一職責位」的衝突陣
    const canSwap = (a, b) => {
      const ra = roleKeyOf(a);
      const rb = roleKeyOf(b);
      return ra === rb
        || (ra === 'setter' && rb === 'opposite') || (ra === 'opposite' && rb === 'setter');
    };
    // 板凳替換上場（W4）：板凳球員頂掉第 i 格先發——主控不可下場、同角色限制同互換
    const benchToField = (benchId, i) => {
      const fieldId = working.starters[i];
      if (fieldId === playerId) {
        notice = '主控球員不可下場——你恆在先發';
      } else if (!canSwap(fieldId, benchId)) {
        notice = '不同角色不能替換上場——維持 5-1 對位（舉球員與對角砲除外）';
      } else {
        working.starters[i] = benchId;
        selected = null;
      }
    };

    const card = el('div', [
      'width:min(400px, 94vw)', `background:${COLOR.card}`, 'border-radius:16px',
      'border:1px solid #2c3a58', 'padding:16px 18px', 'display:flex', 'flex-direction:column',
      'gap:10px', 'box-shadow:0 12px 40px rgba(0,0,0,0.6)',
    ]);

    function paint() {
      card.replaceChildren();
      card.appendChild(el('div', [
        'font-size:16px', 'font-weight:800', `color:${COLOR.gold}`, 'letter-spacing:2px',
      ], '先發編排'));
      card.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`, 'line-height:1.5'],
        selected === null
          ? '點兩格互換位置（同角色）；點板凳＋先發格＝替換上場；標「發」＝首發球位。'
          : selected.kind === 'bench'
            ? '再點一個先發格，讓所選板凳球員替換上場（點回原格取消）。'
            : '再點一格互換位置、或點板凳球員替換（點回原格取消選取）。'));
      if (notice) {
        card.appendChild(el('div', [
          'font-size:12px', 'font-weight:700', `color:${COLOR.red}`, 'line-height:1.4',
        ], notice));
      }

      // 6 格輪轉序
      const grid = el('div', ['display:flex', 'flex-direction:column', 'gap:6px']);
      working.starters.forEach((id, i) => {
        const isPlayer = id === playerId;
        const isSel = selected?.kind === 'field' && selected.i === i;
        const row = el('div', [
          'display:flex', 'align-items:center', 'gap:10px', 'height:46px', 'padding:0 12px',
          'border-radius:10px', 'cursor:pointer', 'touch-action:manipulation',
          `background:${isPlayer ? 'rgba(255,209,102,0.14)' : 'rgba(30,40,64,0.55)'}`,
          `border:2px solid ${isSel ? COLOR.cyan : 'transparent'}`,
        ]);
        row.appendChild(el('div', [
          'font-size:12px', 'font-weight:800', `color:${COLOR.dim}`, 'width:16px',
        ], String(i + 1)));
        const nm = el('div', ['display:flex', 'align-items:center', 'gap:6px', 'flex:1', 'min-width:0']);
        nm.appendChild(el('div', ['font-size:15px', 'font-weight:700'], nameOf(id)));
        if (isPlayer) nm.appendChild(badge('你', COLOR.gold, '#1a1405'));
        row.appendChild(nm);
        row.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`], roleOf(id)));
        if (i === working.rotationStart) row.appendChild(badge('發', COLOR.cyan, '#062430'));
        row.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          notice = null;
          if (selected === null) {
            selected = { kind: 'field', i };
          } else if (selected.kind === 'field' && selected.i === i) {
            selected = null;
          } else if (selected.kind === 'bench') {
            benchToField(selected.id, i);
          } else if (!canSwap(working.starters[selected.i], working.starters[i])) {
            notice = '不同角色不能互換——維持 5-1 對位（舉球員與對角砲除外），職責才不相撞';
          } else {
            const s = working.starters;
            [s[selected.i], s[i]] = [s[i], s[selected.i]];
            selected = null;
          }
          paint();
        });
        grid.appendChild(row);
      });
      card.appendChild(grid);

      // W4 板凳區：未排入先發的場上球員（非自由人）；tap 板凳＋tap 先發格＝替換上場
      const benchMembers = members.filter(
        (m) => m.role !== 'libero' && !working.starters.includes(m.id),
      );
      if (benchMembers.length > 0) {
        card.appendChild(el('div', [
          'font-size:12px', `color:${COLOR.cyan}`, 'letter-spacing:2px', 'margin-top:2px',
        ], '板凳'));
        const benchBox = el('div', ['display:flex', 'flex-direction:column', 'gap:6px']);
        for (const m of benchMembers) {
          const isSel = selected?.kind === 'bench' && selected.id === m.id;
          const row = el('div', [
            'display:flex', 'align-items:center', 'gap:10px', 'height:40px', 'padding:0 12px',
            'border-radius:10px', 'cursor:pointer', 'touch-action:manipulation',
            'background:rgba(20,28,46,0.6)',
            `border:2px solid ${isSel ? COLOR.cyan : 'transparent'}`,
          ]);
          row.appendChild(el('div', [
            'font-size:12px', 'font-weight:800', `color:${COLOR.dim}`, 'width:16px',
          ], '—'));
          const nm = el('div', ['display:flex', 'align-items:center', 'gap:6px', 'flex:1', 'min-width:0']);
          nm.appendChild(el('div', ['font-size:14px', 'font-weight:700'], m.name));
          if (m.origin !== 'starter') nm.appendChild(badge('轉', '#22304e', COLOR.cyan));
          row.appendChild(nm);
          row.appendChild(el('div', ['font-size:12px', `color:${COLOR.dim}`],
            ROLE_ABBR[m.role] ?? m.role));
          row.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            notice = null;
            if (isSel) selected = null;
            else if (selected?.kind === 'field') benchToField(m.id, selected.i);
            else selected = { kind: 'bench', id: m.id };
            paint();
          });
          benchBox.appendChild(row);
        }
        card.appendChild(benchBox);
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
      const v = validateLineup(working, members, playerId);
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
        working = { ...defaultLineup(members), trust: structuredClone(working.trust) };
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
    if (member.captain) {
      head.appendChild(el('div', [
        'font-size:11px', 'font-weight:800', `color:#1a1405`, `background:${COLOR.gold}`,
        'border-radius:8px', 'padding:2px 8px', 'letter-spacing:2px',
      ], '隊長'));
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
    for (const [oppId, cond] of Object.entries(RECRUIT_CONDS)) {
      const def = opponentById(oppId);
      const p = progressOf(rec, oppId);
      const done = rec.recruited.includes(oppId);
      const met = conditionMet(rec, oppId);
      const row = el('div', [
        'display:flex', 'flex-direction:column', 'gap:2px', 'padding:7px 10px',
        'border-radius:10px', `background:${done ? 'rgba(255,209,102,0.1)' : 'rgba(30,40,64,0.55)'}`,
      ]);
      const top = el('div', ['display:flex', 'align-items:center', 'gap:8px']);
      top.appendChild(el('div', ['font-size:14px', 'font-weight:700', 'flex:1'],
        def?.name ?? oppId));
      top.appendChild(badge(ROLE_ABBR[cond.role] ?? cond.role, '#22304e', COLOR.cyan));
      if (done) {
        const m = roster.members.find((x) => x.origin === oppId);
        top.appendChild(el('div', ['font-size:12px', 'font-weight:700', `color:${COLOR.gold}`],
          `✓ ${m?.name ?? ''} 已入隊`));
      } else if (met && slots <= 0) {
        top.appendChild(el('div', ['font-size:12px', 'font-weight:700', `color:${COLOR.red}`],
          '⚠ 名冊已滿'));
      } else if (met) {
        top.appendChild(el('div', ['font-size:12px', 'font-weight:700', `color:${COLOR.gold}`],
          '條件達成'));
      }
      row.appendChild(top);
      if (!done) {
        const parts = [`勝場 ${Math.min(p.wins, cond.wins)}/${cond.wins}`];
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

    // 新生涯：展開名字輸入；已有存檔時要點兩次確認覆蓋
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
    let confirmArmed = false;
    const startBtn = button('開始生涯', true, () => {
      if (hasUsableSave && !confirmArmed) {
        confirmArmed = true;
        startBtn.textContent = '將覆蓋現有生涯——再點一次確認';
        startBtn.style.background = '#8a3a3a';
        return;
      }
      const playerName = nameInput.value.trim() || '小夢';
      // 新生涯＝全新存檔：先清舊檔，否則 saveCareer 只覆寫 season/player、
      // 舊名冊（含隊友成長）/先發/招募會被繼承進「新」生涯
      store.clear();
      const career = createCareer({ seed: Date.now() % 1000000007, playerName });
      const player = createCareerPlayer(playerName);
      if (!store.saveCareer(career) || !store.savePlayer(player)) {
        setMsg('存檔寫入失敗——瀏覽器儲存空間不可用（進度將無法保留）');
      }
      renderCareer();
    });
    newPanel.appendChild(nameInput);
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
    // stage 4 賽後事件：回到生涯畫面先播（入帳後不重複；播完重繪）
    const postEvs = dueEvents(career, 'post');
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
    ], `${career.playerName}・你·OH${seasonN > 1 ? `・第 ${seasonN} 屆` : ''}`));
    root.appendChild(el('div', ['font-size:14px', `color:${COLOR.dim}`],
      `戰績 ${rec.wins} 勝 ${rec.losses} 敗・二傳信任 ${player.trust.fromSetter}`));
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
      row.appendChild(el('div', ['font-size:16px', 'font-weight:600'], title));
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
    const nextSeasonBtn = (label) => button(label, true, () => {
      if (store.advanceSeason?.()) renderCareer();
    });
    if (stage === 'champion') {
      root.appendChild(el('div', [
        'font-size:22px', 'font-weight:900', `color:${COLOR.gold}`, 'margin-top:8px',
        'letter-spacing:2px',
      ], '🏆 全國冠軍！'));
      root.appendChild(el('div', ['font-size:14px', `color:${COLOR.dim}`],
        `奪冠達成（${rec.wins} 勝 ${rec.losses} 敗）`));
      root.appendChild(nextSeasonBtn('▶ 進入下一屆——衛冕之路'));
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
      root.appendChild(nextSeasonBtn('▶ 捲土重來——進入下一屆'));
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
        const preEvs = dueEvents(career, 'pre');
        if (preEvs.length) fireEvents(preEvs, career, player, go);
        else go();
      };
      // 出戰＝直接開賽（走已存/預設 lineup，不強制打斷）；先發編排＝opt-in 排陣後開賽
      root.appendChild(button(`▶ 出戰 ${opponentName(next.opponentId)}`, true, startMatch));
      root.appendChild(smallButton('⚙ 先發編排', () => showLineupEditor(career, player, startMatch)));
      const trait = opponentById(next.opponentId)?.trait;
      if (trait) {
        root.appendChild(el('div', [
          'font-size:13px', `color:${COLOR.dim}`, 'max-width:min(340px, 92vw)',
          'text-align:center', 'line-height:1.5',
        ], `敵情：${trait}`));
      }
    }
    const ioRow = el('div', ['display:flex', 'gap:10px', 'margin-top:4px']);
    ioRow.appendChild(smallButton('返回主選單', renderHome));
    ioRow.appendChild(smallButton('匯出存檔', exportSave));
    root.appendChild(ioRow);
    root.appendChild(msgEl);
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
