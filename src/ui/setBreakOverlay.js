// W4(P4) Q8 局間 huddle 過場：比分回顧＋教練指示＋下一局／存檔離開
// （重用 W7 huddle 語彙的 DOM 卡片層；sim 在 set_break 相位凍結，按鈕驅動 startNextSet）
// 純表現層：不 import sim；資料由呼叫端（matchLoop）餵

// 教練指示（決定論選句：吃局勢不吃 rng；玩家=S 時的導師句掛點＝W4 box score 接線後
// 由 mentor.js 供句，位置預留於 coachLine 之下——本週僅掛點，不接資料）
export function setBreakCoachLine(series, playerTeam) {
  const mine = series.setsWon[playerTeam];
  const theirs = series.setsWon[playerTeam === 'A' ? 'B' : 'A'];
  const deciderNext = series.setIndex + 1 === series.bestOf;
  if (deciderNext) return '決勝局。十五分——每一球都是關鍵球。';
  if (mine > theirs) return '穩住節奏——別讓他們找回手感。';
  if (mine < theirs) return '深呼吸。把球一顆一顆接起來，比分會自己回來。';
  return '回到基本功。下一局是關鍵。';
}

export function createSetBreakOverlay() {
  const root = document.createElement('div');
  root.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:26', 'display:none',
    'flex-direction:column', 'align-items:center', 'justify-content:center',
    'background:rgba(7,9,16,0.78)', 'font-family:system-ui,sans-serif',
    'text-align:center', 'user-select:none', 'gap:14px', 'padding:20px',
  ].join(';');
  document.body.appendChild(root);

  const el = (tag, css, text) => {
    const node = document.createElement(tag);
    node.style.cssText = css.join(';');
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const btn = (label, primary) => el('button', [
    'min-width:220px', 'height:50px', 'padding:0 24px', 'border-radius:25px',
    'border:none', 'font-size:16px', 'font-weight:700', 'cursor:pointer',
    'touch-action:manipulation', 'letter-spacing:1px',
    primary ? 'background:#ffd166;color:#1a1405'
      : 'background:rgba(30,40,64,0.9);color:#eef2fa;border:1px solid #2c3a58',
  ], label);

  return {
    // series＝game.series；playerTeam＝玩家隊；onNext＝下一局；onSaveQuit＝存檔離開（生涯限定）
    show({ series, playerTeam, teamNames, onNext, onSaveQuit }) {
      root.replaceChildren();
      const mine = series.setsWon[playerTeam];
      const theirs = series.setsWon[playerTeam === 'A' ? 'B' : 'A'];
      const deciderNext = series.setIndex + 1 === series.bestOf;
      root.appendChild(el('div', [
        'font-size:15px', 'color:#9fb0cc', 'letter-spacing:4px',
      ], `第 ${series.setIndex} 局結束`));
      root.appendChild(el('div', [
        'font-size:44px', 'font-weight:900', 'letter-spacing:6px',
        `color:${mine >= theirs ? '#ffd166' : '#ff8a8a'}`,
        'text-shadow:0 4px 24px rgba(0,0,0,0.8)',
      ], `局數 ${series.setsWon.A} : ${series.setsWon.B}`));
      // 各局終分回顧
      const rows = el('div', [
        'display:flex', 'flex-direction:column', 'gap:4px',
        'background:rgba(18,24,40,0.85)', 'border-radius:14px', 'border:1px solid #2c3a58',
        'padding:12px 22px',
      ]);
      series.setScores.forEach((sc, i) => {
        rows.appendChild(el('div', [
          'font-size:14px', 'letter-spacing:2px',
          `color:${(sc.A > sc.B) === (playerTeam === 'A') ? '#60ffa0' : '#9fb0cc'}`,
        ], `第 ${i + 1} 局　${sc.A} : ${sc.B}`));
      });
      root.appendChild(rows);
      // 教練指示（huddle 語彙）；玩家=S 導師句掛點＝這行下方（W4 box score 接線）
      root.appendChild(el('div', [
        'font-size:15px', 'color:#eef2fa', 'line-height:1.6', 'max-width:min(420px, 90vw)',
      ], `教練：「${setBreakCoachLine(series, playerTeam)}」`));
      if (teamNames) {
        root.appendChild(el('div', ['font-size:12px', 'color:#9fb0cc', 'letter-spacing:2px'],
          `${teamNames.A}　vs　${teamNames.B}`));
      }
      const next = btn(
        deciderNext ? `▶ 決勝局（${series.setIndex + 1}／${series.bestOf}）` : `▶ 第 ${series.setIndex + 1} 局`,
        true,
      );
      next.addEventListener('pointerdown', (e) => { e.stopPropagation(); onNext(); });
      root.appendChild(next);
      if (onSaveQuit) {
        const save = btn('💾 存檔離開（局間保存）', false);
        save.addEventListener('pointerdown', (e) => { e.stopPropagation(); onSaveQuit(); });
        root.appendChild(save);
      }
      root.style.display = 'flex';
    },
    hide() {
      root.style.display = 'none';
    },
    isOpen() {
      return root.style.display !== 'none';
    },
  };
}
