// 比賽記分板（深色藥丸）＋漫畫對話泡泡（播報/操作提示的載體）
// 泡泡三層語氣：action＝琥珀色（要你做事）、beat＝白底 pop 進場、ambient＝淡入不 pop
// 動畫紀律：只動 transform/opacity、180ms 強 ease-out、WAAPI 可中斷；reduced-motion 只留淡入
import { serverId } from '../sim/match.js';
import { TUNING } from '../sim/game.js';

const POP_EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
const BUBBLE = {
  action: { bg: '#ffd166', border: '#1a1405', text: '#1a1405' },
  beat: { bg: '#f7f9ff', border: '#101420', text: '#101420' },
  ambient: { bg: '#f7f9ff', border: '#101420', text: '#2a3247' },
};
// W7 B4①：雙向氣勢計顏色——我方（A）側沿用隊色青、對方（B）側沿用暖色（同 matchView TAG_COLORS 語言）
const MOMENTUM_COLOR = { A: '#6ee7ff', B: '#ff9d7a' };

export function createScoreboard(playerId) {
  const el = document.createElement('div');
  el.id = 'scoreboard';
  // 注意：容器不用 transform 置中（transform 會把子元素的 position:fixed 劫持成
  // 相對容器——橫持手機的泡泡停靠要用真 fixed），改 left/right:0＋flex 置中
  el.style.cssText = [
    'position:fixed', 'top:calc(env(safe-area-inset-top, 0px) + 8px)',
    'left:0', 'right:0', 'z-index:10',
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
    <div class="momentum" style="display:none;width:min(60vw,220px);height:7px;position:relative;
      background:rgba(255,255,255,0.16);border-radius:4px;overflow:hidden;pointer-events:none">
      <div class="mCenter" style="position:absolute;left:50%;top:0;bottom:0;width:1.5px;
        background:rgba(255,255,255,0.5);transform:translateX(-50%)"></div>
      <div class="mFill" style="position:absolute;top:0;bottom:0;
        transition:left 200ms ease-out,width 200ms ease-out,background 200ms ease-out"></div>
    </div>
    <div class="bubble" style="display:none;background:#f7f9ff;transition:opacity 120ms ease">
      <div class="tail" style="background:#f7f9ff"></div>
      <div class="btext"></div>
    </div>
  `;
  document.body.appendChild(el);
  // 局點脈動＋泡泡版面（版面走樣式表才能掛 media query：
  // 桌面/直式＝比分下方置中；矮視窗（橫持手機）＝停靠左上角，不擋網前視線帶）
  if (!document.getElementById('vd-pulse-style')) {
    const st = document.createElement('style');
    st.id = 'vd-pulse-style';
    st.textContent = `
@keyframes vd-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.55;transform:scale(1.08)}}
#scoreboard .bubble{position:relative;max-width:min(84vw,460px);padding:9px 18px;
  border-radius:14px;border:2.5px solid #101420;box-shadow:0 3px 0 rgba(8,10,18,0.55)}
#scoreboard .tail{position:absolute;top:-7px;left:50%;width:13px;height:13px;
  transform:translateX(-50%) rotate(45deg);
  border-left:2.5px solid #101420;border-top:2.5px solid #101420}
#scoreboard .btext{position:relative;font-weight:800;letter-spacing:1px;line-height:1.45;
  font-size:clamp(15px, 4.2vw, 18px)}
@media (max-height: 520px) {
  #scoreboard .bubble{position:fixed;left:calc(env(safe-area-inset-left, 0px) + 10px);
    top:calc(env(safe-area-inset-top, 0px) + 36px);max-width:min(44vw, 340px);
    padding:6px 12px;text-align:left}
  #scoreboard .tail{display:none}
  #scoreboard .btext{font-size:14px;letter-spacing:0.5px}
}`;
    document.head.appendChild(st);
  }
  const lineEl = el.querySelector('.line');
  const setPtEl = el.querySelector('.setpt');
  const momentumEl = el.querySelector('.momentum');
  const mFillEl = el.querySelector('.mFill');
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

      // W7 B4①：雙向氣勢計——記分板正下方；未啟用（game.momentum 為 null）整條不建
      if (!game.momentum) {
        momentumEl.style.display = 'none';
      } else {
        momentumEl.style.display = 'block';
        const v = game.momentum.value; // −MOMENTUM_MAX..+MOMENTUM_MAX（＋＝A、−＝B）
        const frac = Math.min(Math.abs(v) / TUNING.MOMENTUM_MAX, 1) * 50; // 半軌最大百分比
        // 方向對齊比分：A（我方）氣勢往左長（比分 A 在左）、B 往右長
        mFillEl.style.background = v >= 0 ? MOMENTUM_COLOR.A : MOMENTUM_COLOR.B;
        mFillEl.style.left = v >= 0 ? `${50 - frac}%` : '50%';
        mFillEl.style.width = `${frac}%`;
      }

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
