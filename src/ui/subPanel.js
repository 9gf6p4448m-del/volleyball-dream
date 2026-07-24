// W6 B2 — 賽中換人面板（死球間隙 ⚙ → 精簡排陣器）
// 拍板：tap 場上 → tap 板凳＝立即生效（sim applySubstitution 最後防線再擋一層）；
// 對位紅字（僅同角色互換、S↔OPP 例外——與賽前排陣器同規則）；主控/自由人鎖定。
// 讀狀態（新增採納 2）：每列本場微指標（攻擊效率/接發成功率，事件流現算）＋信任
// ——盲換變讀數據。面板開啟時 matchLoop 凍結模擬（死球窗不流逝）。
import { matchStatsFor } from '../career/growth.js';
import { ROLE_ABBR } from '../career/roster.js';
import { STAMINA } from '../sim/stamina.js';

const roleSwapOk = (a, b) => a === b
  || (a === 'setter' && b === 'opposite') || (a === 'opposite' && b === 'setter');

// W7 A6：換人面板體力條顏色（沿用 tier 門檻常數，不寫死數字）
function staminaColor(v) {
  if (v < STAMINA.TIER2_BELOW) return '#ff5b5b';
  if (v < STAMINA.TIER1_BELOW) return '#ffd166';
  return '#60ffa0';
}

// 本場微指標：攻＝殺球/出手、接＝高品質接發占比（≥0.8 同 strongReceive 門檻）、信任＝基準＋場內動態
function statLine(game, id) {
  const p = game.players[id];
  const s = matchStatsFor(game.events, id, p.teamId);
  let recv = 0;
  let good = 0;
  for (const e of game.events) {
    if (e.type === 'TOUCH' && e.playerId === id && (e.kind === 'receive' || e.kind === 'dive')) {
      recv += 1;
      if ((e.power ?? 0) >= 0.8) good += 1;
    }
  }
  const atk = s.spikes ? `攻 ${s.kills + s.tipKills}/${s.spikes}` : '攻 —';
  const rec = recv ? `接 ${Math.round((good / recv) * 100)}%` : '接 —';
  const trust = Math.round((p.trust?.fromSetter ?? 0) + (game.trustDyn[id] ?? 0));
  return `${atk}・${rec}・信任 ${trust}`;
}

// handlers.requestSub 由 matchLoop 開機注入（stage.handlers 後綁定慣例）
// floatText（W7 E3）：板凳無人時反灰鈕點擊提示用；未啟用體力＝game.stamina 為 null
export function createSubPanel({ game, playerId, handlers, floatText }) {
  const css = (elm, arr) => { elm.style.cssText = arr.join(';'); };
  const btn = document.createElement('button');
  css(btn, [
    'position:fixed', 'top:calc(env(safe-area-inset-top, 0px) + 112px)',
    'right:calc(env(safe-area-inset-right, 0px) + 12px)',
    'height:44px', 'padding:0 14px', 'border-radius:22px', 'border:none',
    'background:rgba(12,16,26,0.6)', 'color:#eef2fa', 'font-size:14px',
    'font-family:system-ui,sans-serif', 'z-index:16', 'cursor:pointer',
    'touch-action:manipulation',
  ]);

  const overlay = document.createElement('div');
  css(overlay, [
    'position:fixed', 'inset:0', 'z-index:38', 'display:none',
    'background:rgba(4,6,12,0.78)', 'font-family:system-ui,sans-serif',
    'flex-direction:column', 'align-items:center', 'justify-content:safe center',
    'overflow-y:auto', 'padding:20px 14px', 'user-select:none',
  ]);
  const card = document.createElement('div');
  css(card, [
    'width:min(420px, 94vw)', 'background:rgba(18,24,40,0.96)', 'border-radius:16px',
    'border:1px solid #2c3a58', 'padding:16px 18px', 'color:#eef2fa',
    'display:flex', 'flex-direction:column', 'gap:8px',
  ]);
  overlay.appendChild(card);
  document.body.appendChild(btn);
  document.body.appendChild(overlay);

  let selectedOut = null; // 場上被點選待換下者
  let msg = '';
  let open = false;

  const teamOf = () => game.players[playerId].teamId;
  const liberoId = () => game.liberos?.[teamOf()]?.liberoId ?? null;

  function row(id, kind) {
    const p = game.players[id];
    const locked = kind === 'field' && (id === playerId || p.currentRole === 'libero');
    const r = document.createElement('div');
    css(r, [
      'display:flex', 'flex-direction:column', 'gap:2px', 'padding:8px 10px',
      'border-radius:10px', 'cursor:pointer', 'text-align:left',
      `background:${selectedOut === id ? 'rgba(110,231,255,0.18)' : 'rgba(30,40,64,0.55)'}`,
      `border:1px solid ${selectedOut === id ? '#6ee7ff' : 'transparent'}`,
      ...(locked ? ['opacity:0.55', 'cursor:default'] : []),
    ]);
    const top = document.createElement('div');
    css(top, ['display:flex', 'gap:8px', 'align-items:center', 'font-size:14px', 'font-weight:700']);
    const tag = document.createElement('span');
    css(tag, ['font-size:11px', 'font-weight:800', 'color:#6ee7ff', 'background:#22304e',
      'border-radius:8px', 'padding:1px 7px']);
    tag.textContent = ROLE_ABBR[p.currentRole] ?? p.currentRole;
    const name = document.createElement('span');
    name.textContent = p.name + (id === playerId ? '（主控）' : '');
    top.appendChild(tag);
    top.appendChild(name);
    if (locked && p.currentRole === 'libero') {
      const note = document.createElement('span');
      css(note, ['font-size:11px', 'color:#9fb0cc']);
      note.textContent = '自由人體系・不經換人';
      top.appendChild(note);
    }
    const stat = document.createElement('div');
    css(stat, ['font-size:11px', 'color:#9fb0cc']);
    stat.textContent = statLine(game, id);
    r.appendChild(top);
    r.appendChild(stat);
    // W7 A6：體力條（未啟用體力＝game.stamina 為 null，整條不顯示）
    if (game.stamina) {
      const v = game.stamina[id] ?? 1;
      const pct = Math.round(v * 100);
      const track = document.createElement('div');
      css(track, ['display:flex', 'align-items:center', 'gap:6px', 'margin-top:2px']);
      const barBg = document.createElement('div');
      css(barBg, ['flex:1', 'height:5px', 'border-radius:3px', 'background:rgba(255,255,255,0.14)', 'overflow:hidden']);
      const barFill = document.createElement('div');
      css(barFill, [`width:${pct}%`, 'height:100%', `background:${staminaColor(v)}`]);
      barBg.appendChild(barFill);
      const pctLabel = document.createElement('span');
      css(pctLabel, ['font-size:10px', 'color:#9fb0cc', 'min-width:28px', 'text-align:right']);
      pctLabel.textContent = `${pct}%`;
      track.appendChild(barBg);
      track.appendChild(pctLabel);
      r.appendChild(track);
    }
    if (!locked) {
      r.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (kind === 'field') {
          selectedOut = selectedOut === id ? null : id;
          msg = '';
        } else if (kind === 'bench') {
          if (!selectedOut) {
            msg = '先點選要換下的場上球員';
          } else if (!roleSwapOk(game.players[selectedOut].currentRole, p.currentRole)) {
            msg = '對位不合法：僅同角色可互換（S↔OPP 例外）';
          } else {
            const res = handlers.requestSub?.(selectedOut, id) ?? { ok: false, reason: 'not-ready' };
            msg = res.ok ? '' : ({
              limit: '換人次數已用盡',
              'not-dead-ball': '只能在死球時換人',
              'libero-paired': '自由人配對中，不可進出',
            }[res.reason] ?? `換不了（${res.reason}）`);
            selectedOut = null;
          }
        }
        paint();
      });
    }
    return r;
  }

  function paint() {
    card.replaceChildren();
    const team = teamOf();
    const head = document.createElement('div');
    css(head, ['display:flex', 'justify-content:space-between', 'align-items:center']);
    const title = document.createElement('div');
    css(title, ['font-size:16px', 'font-weight:800', 'letter-spacing:1px']);
    title.textContent = `⚙ 換人（剩 ${game.subs[team].remaining} 人次）`;
    const done = document.createElement('button');
    css(done, ['height:38px', 'padding:0 16px', 'border-radius:19px', 'border:none',
      'background:#ffd166', 'color:#1a1405', 'font-size:14px', 'font-weight:700',
      'cursor:pointer', 'touch-action:manipulation']);
    done.textContent = '完成';
    done.addEventListener('pointerdown', (e) => { e.stopPropagation(); api.close(); });
    head.appendChild(title);
    head.appendChild(done);
    card.appendChild(head);
    const hint = document.createElement('div');
    css(hint, ['font-size:11px', 'color:#9fb0cc', 'line-height:1.5']);
    hint.textContent = '點場上球員→點板凳替補＝立即換上（下一球生效）・自由人照舊不計次';
    card.appendChild(hint);
    if (msg) {
      const warn = document.createElement('div');
      css(warn, ['font-size:12px', 'font-weight:700', 'color:#ff8a8a']);
      warn.textContent = msg;
      card.appendChild(warn);
    }
    const section = (label) => {
      const t = document.createElement('div');
      css(t, ['font-size:12px', 'color:#6ee7ff', 'letter-spacing:3px', 'margin-top:6px']);
      t.textContent = label;
      card.appendChild(t);
    };
    section('場上');
    for (const id of game.match.rotations[team]) card.appendChild(row(id, 'field'));
    section('板凳');
    if (!game.bench[team].length) {
      const none = document.createElement('div');
      css(none, ['font-size:12px', 'color:#9fb0cc']);
      none.textContent = '（板凳無人）';
      card.appendChild(none);
    }
    for (const id of game.bench[team]) {
      if (id === liberoId()) continue; // 防呆：自由人永不在 bench 名單，仍擋一層
      card.appendChild(row(id, 'bench'));
    }
  }

  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (btn.dataset.enabled !== '1') {
      // W7 E3：板凳無人＝常駐反灰鈕，點擊給出解鎖提示（其餘反灰原因如非死球窗/額度用盡不特別提示）
      if (btn.dataset.benchEmpty === '1') floatText?.show('板凳無人——招募隊員後解鎖', '#ff8a8a', 1400);
      return;
    }
    api.openPanel();
  });
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) { e.stopPropagation(); api.close(); }
  });

  const api = {
    el: btn,
    isOpen: () => open,
    openPanel() {
      open = true;
      selectedOut = null;
      msg = '';
      paint();
      overlay.style.display = 'flex';
    },
    close() {
      open = false;
      overlay.style.display = 'none';
      handlers.onSubPanelClose?.();
    },
    // 每幀同步：死球窗且有額度且有板凳才可按（比賽結束隱藏）；
    // W7 E3：鈕本身常駐（matchStage 不再以板凳是否有人決定要不要建鈕），板凳無人時反灰＋點擊給提示
    sync(g) {
      const team = teamOf();
      const benchEmpty = g.bench[team].length === 0;
      const usable = g.phase === 'serve' && g.subs[team].remaining > 0 && !benchEmpty;
      btn.dataset.enabled = usable ? '1' : '0';
      btn.dataset.benchEmpty = benchEmpty ? '1' : '0';
      btn.style.opacity = usable ? '1' : '0.45';
      btn.textContent = `⚙ 換人 ${g.subs[team].remaining}`;
      if (g.phase === 'set_over') {
        btn.style.display = 'none';
        if (open) api.close();
      }
    },
  };
  return api;
}
