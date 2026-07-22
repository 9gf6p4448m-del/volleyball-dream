// 比賽記分板（深色藥丸）＋漫畫對話泡泡（播報/操作提示的載體）
// 泡泡三層語氣：action＝琥珀色（要你做事）、beat＝白底 pop 進場、ambient＝淡入不 pop
// 動畫紀律：只動 transform/opacity、180ms 強 ease-out、WAAPI 可中斷；reduced-motion 只留淡入
import { serverId } from '../sim/match.js';

const POP_EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
const BUBBLE = {
  action: { bg: '#ffd166', border: '#1a1405', text: '#1a1405' },
  beat: { bg: '#f7f9ff', border: '#101420', text: '#101420' },
  ambient: { bg: '#f7f9ff', border: '#101420', text: '#2a3247' },
};

export function createScoreboard(playerId) {
  const el = document.createElement('div');
  el.id = 'scoreboard';
  el.style.cssText = [
    'position:fixed', 'top:calc(env(safe-area-inset-top, 0px) + 8px)',
    'left:50%', 'transform:translateX(-50%)', 'z-index:10',
    'display:flex', 'flex-direction:column', 'align-items:center', 'gap:7px',
    'font-family:system-ui,sans-serif', 'text-align:center',
    'pointer-events:none', 'user-select:none',
  ].join(';');
  el.innerHTML = `
    <div class="pill" style="color:#eef2fa;background:rgba(12,16,26,0.6);
      padding:6px 22px;border-radius:14px">
      <div class="setpt" style="display:none;font-size:13px;font-weight:800;letter-spacing:3px;
        margin-bottom:1px;animation:vd-pulse 0.9s ease-in-out infinite"></div>
      <div class="line" style="font-size:clamp(30px, 8vw, 38px);font-weight:800;
        letter-spacing:2px;line-height:1.15">0 : 0</div>
    </div>
    <div class="bubble" style="position:relative;display:none;max-width:min(84vw,460px);
      padding:9px 18px;border-radius:14px;border:2.5px solid #101420;background:#f7f9ff;
      box-shadow:0 3px 0 rgba(8,10,18,0.55);transition:opacity 120ms ease">
      <div class="tail" style="position:absolute;top:-7px;left:50%;width:13px;height:13px;
        transform:translateX(-50%) rotate(45deg);background:#f7f9ff;
        border-left:2.5px solid #101420;border-top:2.5px solid #101420"></div>
      <div class="btext" style="position:relative;font-weight:800;
        font-size:clamp(15px, 4.2vw, 18px);letter-spacing:1px;line-height:1.45"></div>
    </div>
  `;
  document.body.appendChild(el);
  // 局點徽章脈動動畫（注入一次）
  if (!document.getElementById('vd-pulse-style')) {
    const st = document.createElement('style');
    st.id = 'vd-pulse-style';
    st.textContent = '@keyframes vd-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.55;transform:scale(1.08)}}';
    document.head.appendChild(st);
  }
  const lineEl = el.querySelector('.line');
  const setPtEl = el.querySelector('.setpt');
  const bubbleEl = el.querySelector('.bubble');
  const tailEl = el.querySelector('.tail');
  const btextEl = el.querySelector('.btext');
  lineEl.style.transition = 'transform 0.12s ease-out, color 0.12s';
  let lastTotal = 0;
  let pulseTimer = null;
  let lastBubbleText = '';
  let lastBubbleKind = '';
  let popAnim = null;
  const reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function renderBubble(hint) {
    // 正規化：undefined 不會進來；string（classic 舊提示）視為操作提示
    const { text, kind } = typeof hint === 'string' ? { text: hint, kind: 'action' } : hint;
    if (!text) {
      if (lastBubbleText) {
        lastBubbleText = '';
        bubbleEl.style.opacity = '0';
        setTimeout(() => { if (!lastBubbleText) bubbleEl.style.display = 'none'; }, 130);
      }
      return;
    }
    if (text === lastBubbleText && kind === lastBubbleKind) return;
    const isNew = text !== lastBubbleText;
    lastBubbleText = text;
    lastBubbleKind = kind;
    const c = BUBBLE[kind] ?? BUBBLE.beat;
    bubbleEl.style.display = 'block';
    bubbleEl.style.opacity = '1';
    bubbleEl.style.background = c.bg;
    bubbleEl.style.borderColor = c.border;
    tailEl.style.background = c.bg;
    tailEl.style.borderLeftColor = c.border;
    tailEl.style.borderTopColor = c.border;
    btextEl.style.color = c.text;
    btextEl.textContent = text;
    // pop 進場：只在 action/beat 的新句子彈（ambient 高頻變化只淡入）；reduced-motion 不位移
    if (isNew && kind !== 'ambient' && !reducedMotion) {
      popAnim?.cancel();
      popAnim = bubbleEl.animate(
        [
          { transform: 'scale(0.92) translateY(-5px)', opacity: 0.5 },
          { transform: 'scale(1) translateY(0)', opacity: 1 },
        ],
        { duration: 180, easing: POP_EASE },
      );
    }
  }

  return {
    // controlledId：全隊輪控下當前受控球員（未傳則用建立時的預設）
    // hint：{ text, kind } 播報行（決策模式）；undefined＝classic 走內建舊提示
    update(game, isMyBall = false, controlledId = playerId, hint = undefined) {
      const { score } = game.match;
      const serve = game.match.servingTeam;
      lineEl.textContent = `${score.A} : ${score.B}`;
      // 得分演出：比分跳動放大閃色
      const total = score.A + score.B;
      if (total !== lastTotal) {
        lastTotal = total;
        lineEl.style.transform = 'scale(1.45)';
        lineEl.style.color = '#ffd166';
        clearTimeout(pulseTimer);
        pulseTimer = setTimeout(() => {
          lineEl.style.transform = 'scale(1)';
          lineEl.style.color = '#eef2fa';
        }, 220);
      }
      renderBubble(hint !== undefined
        ? hint
        : isMyBall
          ? '🟠 這球歸你！跑向藍色落點圈'
          : hintFor(game, controlledId, serve));

      // 局點徽章：我方＝金色「局點」、對方＝紅色「對方局點」（deuce 規則內建於判定）
      const spTeam = setPointTeam(game);
      const myTeam = game.players[controlledId]?.teamId;
      if (spTeam && game.phase !== 'set_over') {
        setPtEl.style.display = 'block';
        setPtEl.textContent = spTeam === myTeam ? '🔥 局點' : '⚠ 對方局點';
        setPtEl.style.color = spTeam === myTeam ? '#ffd166' : '#ff6b6b';
      } else {
        setPtEl.style.display = 'none';
      }
    },
  };
}

// 局點判定：下一分即可收局（含 deuce：須領先 1 且達 target-1 以上）
export function setPointTeam(game) {
  const { score, target } = game.match;
  for (const [team, other] of [['A', 'B'], ['B', 'A']]) {
    if (score[team] + 1 >= target && score[team] + 1 - score[other] >= 2) return team;
  }
  return null;
}

// classic（?classic=1）舊版操作提示：全手動操作下這些說明仍準確，維持不動
function hintFor(game, playerId, serve) {
  if (game.phase === 'set_over') {
    return `本局結束——${game.match.winner} 隊勝！點擊畫面再來一局`;
  }
  if (game.phase === 'serve') {
    if (serverId(game.match) === playerId) {
      return game.tick < game.serveReadyTick
        ? '準備發球…'
        : '你發球：按住蓄力、拖曳瞄準、放開出手';
    }
    return `${serve} 隊發球（WASD/左半螢幕搖桿走位）`;
  }
  const r = game.rally;
  const me = game.players[playerId];
  if (r.possession === me.teamId && r.touches === 2) {
    return '第三擊！按下＝起跳、放開＝揮臂（短點輕吊、蓄滿重扣）';
  }
  if (r.possession === me.teamId && r.touches === 1) {
    return '二傳中——點按可自己處理';
  }
  if (r.possession && r.possession !== me.teamId) {
    return '對方進攻：前排點一下＝跳攔網；後排卡防守位';
  }
  return '走位到球落點會自動墊球';
}
