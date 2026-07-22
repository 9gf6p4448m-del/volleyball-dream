// Phase 2 生涯畫面：主選單（繼續/新生涯/快速比賽/匯出匯入）＋賽程視圖（地區賽小組）
// 夜賽同色系；動態文字一律 textContent（匯入的存檔名字不可信，不走 innerHTML）
import {
  createCareer, createCareerPlayer, nextMatch, careerRecord, opponentName,
  careerStage, opponentById, normalizeCareerPlayer, resolveForfeit,
} from '../career/careerState.js';
import { GROWTH, GROWABLE_ATTRS, TECH_DEFS, spendAttribute } from '../career/growth.js';
import { dueEvents, recordEvent } from '../career/events.js';
import { updateTrust } from '../sim/trust.js';

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
    'flex-direction:column', 'align-items:center', 'justify-content:center',
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
    root.replaceChildren();
    setMsg('');
    const rec = careerRecord(career);
    const next = nextMatch(career);

    root.appendChild(el('div', [
      'font-size:26px', 'font-weight:800', `color:${COLOR.text}`, 'letter-spacing:2px',
    ], `${career.playerName}・你·OH`));
    root.appendChild(el('div', ['font-size:14px', `color:${COLOR.dim}`],
      `戰績 ${rec.wins} 勝 ${rec.losses} 敗・二傳信任 ${player.trust.fromSetter}`));
    root.appendChild(growthSection(career, player));
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

    if (stage === 'champion') {
      root.appendChild(el('div', [
        'font-size:22px', 'font-weight:900', `color:${COLOR.gold}`, 'margin-top:8px',
        'letter-spacing:2px',
      ], '🏆 全國冠軍！'));
      root.appendChild(el('div', ['font-size:14px', `color:${COLOR.dim}`],
        `生涯首冠達成（${rec.wins} 勝 ${rec.losses} 敗）`));
    } else if (stage === 'eliminated') {
      const lost = career.results.find((r) => !r.won &&
        career.schedule.find((m) => m.id === r.matchId)?.stage === 'national');
      const lostLabel = career.schedule.find((m) => m.id === lost?.matchId)?.label ?? '全國賽';
      root.appendChild(el('div', [
        'font-size:20px', 'font-weight:800', `color:${COLOR.red}`, 'margin-top:8px',
      ], `止步${lostLabel}`));
      root.appendChild(el('div', ['font-size:14px', `color:${COLOR.dim}`],
        `本屆戰績 ${rec.wins} 勝 ${rec.losses} 敗——從主選單開新生涯再挑戰`));
    } else if (next) {
      root.appendChild(button(`▶ 出戰 ${opponentName(next.opponentId)}`, true, () => {
        // stage 4 賽前事件：先播對話（trust 效果先套用），播完進場
        const start = () => {
          hide();
          onPlay({ career: store.loadCareer() ?? career, player, matchEntry: next });
        };
        const preEvs = dueEvents(career, 'pre');
        if (preEvs.length) fireEvents(preEvs, career, player, start);
        else start();
      }));
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
