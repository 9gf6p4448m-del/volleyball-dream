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
    <div class="line" style="font-size:26px;font-weight:700;letter-spacing:2px">0 : 0</div>
    <div class="hint" style="font-size:12px;opacity:0.85;margin-top:2px"></div>
  `;
  document.body.appendChild(el);
  const lineEl = el.querySelector('.line');
  const hintEl = el.querySelector('.hint');

  return {
    update(game, isMyBall = false) {
      const { score } = game.match;
      const serve = game.match.servingTeam;
      lineEl.textContent = `${score.A} : ${score.B}`;
      hintEl.textContent = isMyBall
        ? '🟠 這球歸你！跑向藍色落點圈'
        : hintFor(game, playerId, serve);
    },
  };
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
