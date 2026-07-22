// 比賽記分板＋情境操作提示（讀 sim 狀態，不寫回）
import { serverId } from '../sim/match.js';

export function createScoreboard(playerId) {
  const el = document.createElement('div');
  el.id = 'scoreboard';
  el.style.cssText = [
    'position:fixed', 'top:calc(env(safe-area-inset-top, 0px) + 8px)',
    'left:50%', 'transform:translateX(-50%)', 'z-index:10',
    'color:#eef2fa', 'font-family:system-ui,sans-serif', 'text-align:center',
    'background:rgba(12,16,26,0.6)', 'padding:6px 18px', 'border-radius:12px',
    'pointer-events:none', 'user-select:none',
  ].join(';');
  el.innerHTML = `
    <div class="setpt" style="display:none;font-size:13px;font-weight:800;letter-spacing:3px;
      margin-bottom:1px;animation:vd-pulse 0.9s ease-in-out infinite"></div>
    <div class="line" style="font-size:26px;font-weight:700;letter-spacing:2px">0 : 0</div>
    <div class="hint" style="font-size:12px;opacity:0.85;margin-top:2px;
      max-width:min(78vw,420px);line-height:1.4"></div>
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
  const hintEl = el.querySelector('.hint');
  const setPtEl = el.querySelector('.setpt');
  lineEl.style.transition = 'transform 0.12s ease-out, color 0.12s';
  let lastTotal = 0;
  let pulseTimer = null;

  return {
    // controlledId：全隊輪控下當前受控球員（未傳則用建立時的預設）
    // hintText：外部播報行（決策模式的即時播報；undefined＝classic 舊版操作提示）
    update(game, isMyBall = false, controlledId = playerId, hintText = undefined) {
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
      hintEl.textContent = hintText !== undefined
        ? hintText
        : isMyBall
          ? '🟠 這球歸你！跑向藍色落點圈'
          : hintFor(game, controlledId, serve);

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
