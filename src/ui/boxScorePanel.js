// W4(P4) Q9 — 單場結算頁（手機版面）：我方全員 box score＋位置差異欄位＋對手 ace 一行
// 純表現層（資料由 matchLoop 餵：career/boxScore.js 事件流攔截的產物）
import { pct } from '../career/boxScore.js';

const ROLE_TAG = { setter: 'S', outside: 'OH', middle: 'MB', opposite: 'OPP', libero: 'L' };

export function createBoxScorePanel() {
  const root = document.createElement('div');
  root.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:27', 'display:none',
    'flex-direction:column', 'align-items:center', 'justify-content:safe center',
    'background:rgba(7,9,16,0.9)', 'font-family:system-ui,sans-serif',
    'user-select:none', 'gap:10px', 'padding:20px 12px', 'overflow-y:auto',
    'color:#eef2fa',
  ].join(';');
  document.body.appendChild(root);

  const el = (tag, css, text) => {
    const node = document.createElement(tag);
    node.style.cssText = css.join(';');
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const cell = (text, w, opts = {}) => el('div', [
    `width:${w}px`, 'text-align:center', 'font-size:12px', 'flex:none',
    ...(opts.left ? ['text-align:left'] : []),
    ...(opts.dim ? ['color:#9fb0cc'] : []),
    ...(opts.bold ? ['font-weight:800'] : []),
    ...(opts.gold ? ['color:#ffd166'] : []),
  ], text);

  const playerRow = (r, highlight) => {
    const row = el('div', [
      'display:flex', 'align-items:center', 'gap:2px', 'padding:4px 6px',
      'border-radius:8px',
      ...(highlight ? ['background:rgba(110,231,255,0.08)'] : []),
    ]);
    row.appendChild(cell(`${r.name}·${ROLE_TAG[r.role] ?? r.role}`, 96, { left: true, bold: highlight }));
    row.appendChild(cell(String(r.points), 34, { bold: true, gold: r.points >= 10 }));
    const atk = pct(r.kills, r.spikes);
    row.appendChild(cell(r.spikes ? `${r.kills}/${r.spikes}(${atk}%)` : '—', 76));
    row.appendChild(cell(r.blocks ? String(r.blocks) : '—', 34));
    row.appendChild(cell(r.aces ? String(r.aces) : '—', 34));
    const rp = pct(r.recvGood, r.receives);
    row.appendChild(cell(r.receives ? `${rp}%` : '—', 44));
    return row;
  };

  return {
    // data＝{ title, scoreLine, rows[], playerPid, oppAce|null, extras[]（位置差異行） }
    // onClose：U1 拍板——關閉鈕觸發的回呼（不再支援點任意處關閉）
    show(data, onClose) {
      root.replaceChildren();
      root.appendChild(el('div', [
        'font-size:15px', 'color:#9fb0cc', 'letter-spacing:4px', 'margin-top:4px',
      ], '單場數據'));
      root.appendChild(el('div', [
        'font-size:22px', 'font-weight:900', 'letter-spacing:2px', 'color:#ffd166',
      ], data.title));
      if (data.scoreLine) {
        root.appendChild(el('div', ['font-size:13px', 'color:#9fb0cc'], data.scoreLine));
      }
      const card = el('div', [
        'background:rgba(18,24,40,0.92)', 'border-radius:14px', 'border:1px solid #2c3a58',
        'padding:10px 8px', 'width:min(360px, 96vw)', 'display:flex',
        'flex-direction:column', 'gap:2px',
      ]);
      const head = el('div', ['display:flex', 'gap:2px', 'padding:2px 6px']);
      head.appendChild(cell('球員', 96, { left: true, dim: true }));
      head.appendChild(cell('得分', 34, { dim: true }));
      head.appendChild(cell('攻擊', 76, { dim: true }));
      head.appendChild(cell('攔網', 34, { dim: true }));
      head.appendChild(cell('ACE', 34, { dim: true }));
      head.appendChild(cell('接發', 44, { dim: true }));
      card.appendChild(head);
      const rows = [...data.rows].sort((a, b) => b.points - a.points || b.spikes - a.spikes);
      for (const r of rows) card.appendChild(playerRow(r, r.pid === data.playerPid));
      if (data.oppAce) {
        card.appendChild(el('div', ['height:1px', 'background:#2c3a58', 'margin:6px 0 4px']));
        card.appendChild(el('div', ['font-size:11px', 'color:#ff9d7a', 'text-align:left',
          'padding:0 6px'], '對手王牌'));
        card.appendChild(playerRow(data.oppAce, false));
      }
      root.appendChild(card);
      // 位置差異欄位（Q9：四位置全數上線）——玩家現任位置的專屬行
      for (const line of data.extras ?? []) {
        root.appendChild(el('div', [
          'font-size:12px', 'color:#6ee7ff', 'background:rgba(18,24,40,0.92)',
          'border-radius:10px', 'border:1px solid #2c3a58', 'padding:8px 14px',
          'width:min(360px, 96vw)', 'text-align:left', 'line-height:1.5',
        ], line));
      }
      // U1（07-30 拍板）：誤觸關掉面板最重的一支——移除「點任意處關閉」，
      // 一律靠這顆「關閉」鈕觸發 onClose（由 matchLoop 傳入，導回生涯/返回流程）
      const closeBtn = el('button', [
        'height:40px', 'padding:0 20px', 'border-radius:20px', 'border:1px solid #2c3a58',
        'background:transparent', 'color:#9fb0cc', 'font-size:14px', 'font-weight:700',
        'cursor:pointer', 'touch-action:manipulation', 'margin-top:6px',
        'font-family:system-ui,sans-serif',
      ], '關閉');
      closeBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        onClose?.();
      });
      root.appendChild(closeBtn);
      root.style.display = 'flex';
    },
    hide() {
      root.style.display = 'none';
    },
  };
}
