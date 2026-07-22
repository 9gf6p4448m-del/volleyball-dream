// Phase 2 生涯畫面：主選單（繼續/新生涯/快速比賽/匯出匯入）＋賽程視圖（地區賽小組）
// 夜賽同色系；動態文字一律 textContent（匯入的存檔名字不可信，不走 innerHTML）
import {
  createCareer, createCareerPlayer, nextMatch, careerRecord, opponentName,
} from '../career/careerState.js';

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
    const career = store.loadCareer();
    const player = store.loadPlayer();
    if (!career || !player) { renderHome(); return; }
    root.replaceChildren();
    setMsg('');
    const rec = careerRecord(career);
    const next = nextMatch(career);

    root.appendChild(el('div', [
      'font-size:26px', 'font-weight:800', `color:${COLOR.text}`, 'letter-spacing:2px',
    ], `${career.playerName}・你·OH`));
    root.appendChild(el('div', ['font-size:14px', `color:${COLOR.dim}`],
      `戰績 ${rec.wins} 勝 ${rec.losses} 敗`));
    root.appendChild(el('div', [
      'font-size:15px', `color:${COLOR.cyan}`, 'letter-spacing:3px', 'margin-top:8px',
    ], '地區賽・小組循環'));

    const list = el('div', [
      'display:flex', 'flex-direction:column', 'gap:8px', 'width:min(340px, 92vw)',
    ]);
    for (const m of career.schedule) {
      const result = career.results.find((r) => r.matchId === m.id);
      const isNext = next?.id === m.id;
      const row = el('div', [
        'display:flex', 'justify-content:space-between', 'align-items:center',
        'height:52px', 'padding:0 16px', 'border-radius:12px', `background:${COLOR.card}`,
        `border:1px solid ${isNext ? COLOR.cyan : 'transparent'}`,
      ]);
      row.appendChild(el('div', ['font-size:16px', 'font-weight:600'], opponentName(m.opponentId)));
      if (result) {
        row.appendChild(el('div', [
          'font-size:15px', 'font-weight:700',
          `color:${result.won ? COLOR.gold : COLOR.red}`,
        ], `${result.won ? '勝' : '負'} ${result.scoreFor}:${result.scoreAgainst}`));
      } else {
        row.appendChild(el('div', [
          'font-size:14px', `color:${isNext ? COLOR.cyan : COLOR.dim}`,
        ], isNext ? '▶ 下一場' : '未開打'));
      }
      list.appendChild(row);
    }
    const lockedRow = el('div', [
      'display:flex', 'align-items:center', 'justify-content:center', 'height:44px',
      'border-radius:12px', 'background:rgba(18,24,40,0.5)', `color:${COLOR.dim}`,
      'font-size:14px', 'border:1px dashed #2c3a58',
    ], '🔒 全國賽——地區賽完賽後開放（下一階段）');
    list.appendChild(lockedRow);
    root.appendChild(list);

    if (next) {
      root.appendChild(button(`▶ 出戰 ${opponentName(next.opponentId)}`, true, () => {
        hide();
        onPlay({ career, player, matchEntry: next });
      }));
    } else {
      root.appendChild(el('div', ['font-size:15px', `color:${COLOR.gold}`, 'margin-top:6px'],
        `地區賽完賽（${rec.wins} 勝 ${rec.losses} 敗）——全國賽於下一階段開發開放`));
    }
    const ioRow = el('div', ['display:flex', 'gap:10px', 'margin-top:4px']);
    ioRow.appendChild(smallButton('返回主選單', renderHome));
    ioRow.appendChild(smallButton('匯出存檔', exportSave));
    root.appendChild(ioRow);
    root.appendChild(msgEl);
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
