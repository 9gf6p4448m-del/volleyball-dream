// 得分原因面板：死球後顯示「誰得分＋為什麼」——即時犯規（四擊/後排攻擊/站位）
// 與落地得分（殺球/ACE/攔網/出界/處理失誤）都一眼看懂，玩家不必猜裁決。
// derivePointInfo 是純函式（可單測）；createPointBanner 才碰 DOM。

const STYLE_ID = 'vd-banner-style';
const BANNER_CSS = `
@keyframes vd-banner-in {
  0% { opacity: 0; transform: translate(-50%, -26px) scale(0.88); }
  60% { opacity: 1; transform: translate(-50%, 4px) scale(1.03); }
  100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
}
@keyframes vd-banner-out {
  to { opacity: 0; transform: translate(-50%, -18px) scale(0.94); }
}
@keyframes vd-banner-shine {
  from { transform: translateX(-140%) skewX(-18deg); }
  to { transform: translateX(340%) skewX(-18deg); }
}
@keyframes vd-banner-icon {
  0% { transform: scale(0.4) rotate(-14deg); }
  55% { transform: scale(1.18) rotate(4deg); }
  100% { transform: scale(1) rotate(0deg); }
}
`;

// 事件流 → 面板內容（純函式）。
// lastTouch = { team, playerId, kind: 'serve'|'receive'|'set'|'spike'|'block' } | null
export function derivePointInfo({ reason, winner, myTeam, lastTouch, controlledId, score }) {
  const mine = winner === myTeam;
  const kind = lastTouch?.kind;
  let title;
  let icon;
  if (reason === 'POSITIONAL_FAULT') { title = '站位犯規'; icon = '🚫'; }
  else if (reason === 'FOUR_HITS') { title = '四擊犯規'; icon = '🚫'; }
  else if (reason === 'BACK_ROW_ATTACK') { title = '後排攻擊違例'; icon = '🚫'; }
  else if (reason === 'OUT') {
    icon = '📏';
    title = kind === 'serve' ? '發球出界'
      : kind === 'spike' ? '扣球出界'
      : kind === 'block' ? '攔網出界'
      : '擊球出界';
  } else if (lastTouch && lastTouch.team === winner) {
    // BALL_IN 且最後觸球方＝得分方：攻擊落地
    if (kind === 'serve') { title = 'ACE！發球直得'; icon = '🎯'; }
    else if (kind === 'spike') {
      title = mine && lastTouch.playerId === controlledId ? '你的殺球得分！' : '殺球得分';
      icon = '💥';
    } else if (kind === 'block') { title = '攔網得分'; icon = '🧱'; }
    else { title = '球落地得分'; icon = '🏐'; }
  } else {
    // BALL_IN 且最後觸球方＝失分方：自己把球處理到自家場內落地
    title = '處理失誤'; icon = '💧';
  }
  return {
    title, icon, mine,
    sub: `${mine ? '我方得分' : '對方得分'}　${score.A} : ${score.B}`,
  };
}

export function createPointBanner() {
  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = BANNER_CSS;
    document.head.appendChild(st);
  }

  let el = null;
  let outTimer = null;
  let removeTimer = null;

  function dismiss() {
    clearTimeout(outTimer);
    clearTimeout(removeTimer);
    if (el) { el.remove(); el = null; }
  }

  return {
    // info: derivePointInfo 的回傳值
    show(info) {
      dismiss();
      const accent = info.mine ? '#ffd166' : '#ff6b6b';
      el = document.createElement('div');
      el.style.cssText = [
        'position:fixed', 'left:50%', 'top:min(22vh, 190px)', 'z-index:18',
        'transform:translate(-50%, 0)',
        'display:flex', 'align-items:center', 'gap:12px',
        'max-width:min(90vw, 480px)',
        'padding:12px 24px 12px 14px',
        'border-radius:14px', 'overflow:hidden',
        'background:linear-gradient(135deg, rgba(14,18,30,0.92), rgba(24,32,52,0.85))',
        `border:1px solid ${accent}55`, `border-left:4px solid ${accent}`,
        'backdrop-filter:blur(8px)', '-webkit-backdrop-filter:blur(8px)',
        `box-shadow:0 10px 30px rgba(0,0,0,0.5), 0 0 24px ${accent}22`,
        'font-family:system-ui,sans-serif', 'pointer-events:none', 'user-select:none',
        'animation:vd-banner-in 0.45s cubic-bezier(0.16,1,0.3,1) both',
      ].join(';');

      const icon = document.createElement('div');
      icon.textContent = info.icon;
      icon.style.cssText = [
        'width:44px', 'height:44px', 'flex:0 0 44px',
        'display:grid', 'place-items:center',
        'font-size:24px', 'border-radius:12px',
        `background:${accent}22`,
        'animation:vd-banner-icon 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
      ].join(';');

      const col = document.createElement('div');
      const title = document.createElement('div');
      title.textContent = info.title;
      title.style.cssText = [
        'font-size:clamp(20px, 5.5vw, 30px)', 'font-weight:800',
        'letter-spacing:3px', 'color:#f4f7ff', 'line-height:1.15',
        'text-shadow:0 2px 10px rgba(0,0,0,0.55)', 'white-space:nowrap',
      ].join(';');
      const sub = document.createElement('div');
      sub.textContent = info.sub;
      sub.style.cssText = [
        'font-size:13px', 'font-weight:700', 'letter-spacing:2px',
        `color:${accent}`, 'margin-top:2px',
      ].join(';');
      col.appendChild(title);
      col.appendChild(sub);

      // 高光掃過（一次性）：金屬質感的斜向亮帶
      const shine = document.createElement('div');
      shine.style.cssText = [
        'position:absolute', 'top:0', 'bottom:0', 'left:0', 'width:38%',
        'background:linear-gradient(105deg, transparent, rgba(255,255,255,0.16), transparent)',
        'animation:vd-banner-shine 0.85s ease-out 0.18s both',
        'pointer-events:none',
      ].join(';');

      el.appendChild(icon);
      el.appendChild(col);
      el.appendChild(shine);
      document.body.appendChild(el);

      // 節拍對齊死球間隔 1.8s：0.45s 進場 → 停留 → 1.15s 起退場 → 1.6s 移除
      outTimer = setTimeout(() => {
        if (el) el.style.animation = 'vd-banner-out 0.4s ease-in forwards';
      }, 1150);
      removeTimer = setTimeout(dismiss, 1600);
    },
    hide: dismiss,
  };
}
