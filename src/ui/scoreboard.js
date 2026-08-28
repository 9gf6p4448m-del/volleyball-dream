// 比賽記分板（斜切黑金塊）＋漫畫對話泡泡（播報/操作提示的載體）
// 大作感卷 批4（冠軍黑金皮膚）：比分板改斜切塊組（隊名塊/數字黑金塊/SET 中塊），
// 照參考稿 docs/kickoffs/juice-ui-refs/ea-hybrid.html 的 .score 語彙；既有資訊
// （發球方／局點標記／氣勢計／播報泡泡）一個都沒拿掉，只換皮＋補一顆發球方小圓點。
// 泡泡三層語氣：action＝金色（要你做事）、beat＝黑金匾（事件播報）、ambient＝淡入不 pop；
// 我方/敵方事件另用左側色條區分（不整塊染色，保留「黑金匾」主視覺）。
// 動畫紀律：只動 transform/opacity、180ms 強 ease-out、WAAPI 可中斷；reduced-motion 只留淡入
import { serverId } from '../sim/match.js';
import { TUNING } from '../sim/game.js';
import { COLORS, FONTS, goldAlpha } from './theme.js';

const POP_EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
// 泡泡底色一律黑金匾（見下方 CSS #scoreboard .bubble）；team 只染左側色條
// （ally 青／enemy 暖，沿用既有隊色語言，不隨本批全面金色化——這條資訊獨立於
// 「本批冠軍黑金皮膚」，硬染成同色會讓「這是誰的事件」變得看不出來，見
// .bubble.team-ally / .bubble.team-enemy 兩條規則）
// W7 B4①：雙向氣勢計顏色——批4改統一金漸層填色（凍結檔範圍item 3 明文指定色階），
// 方向資訊改由「往哪一側長」保留（原本靠 A 青/B 暖區分，見凍結檔判斷紀錄）
const MOMENTUM_GRADIENT = `linear-gradient(90deg, ${COLORS.goldDark}, ${COLORS.gold}, ${COLORS.goldLight})`;

export function createScoreboard(playerId) {
  const el = document.createElement('div');
  el.id = 'scoreboard';
  // 注意：容器不用 transform 置中（transform 會把子元素的 position:fixed 劫持成
  // 相對容器——橫持手機的泡泡停靠要用真 fixed），改 left/right:0＋flex 置中
  el.style.cssText = [
    'position:fixed', 'top:calc(env(safe-area-inset-top, 0px) + 8px)',
    'left:0', 'right:0', 'z-index:10',
    'display:flex', 'flex-direction:column', 'align-items:center', 'gap:10px',
    `font-family:${FONTS.zh}`, 'text-align:center',
    'pointer-events:none', 'user-select:none',
  ].join(';');
  el.innerHTML = `
    <div class="score">
      <div class="t teamA"><span class="serveDot"></span><span class="label">我隊</span></div>
      <div class="n teamA">0</div>
      <div class="mid"><b class="setLbl">SET 1</b><span class="ptsLbl">25 PTS</span></div>
      <div class="n teamB">0</div>
      <div class="t teamB"><span class="label">對方</span><span class="serveDot"></span></div>
    </div>
    <div class="setpt" style="display:none"></div>
    <div class="momentum" style="display:none;width:min(60vw,220px);height:10px;position:relative;
      background:rgba(14,11,6,0.85);border:1px solid ${goldAlpha(0.5)};overflow:visible;
      pointer-events:none;transform:skewX(-10deg)">
      <div class="mCenter" style="position:absolute;left:50%;top:0;bottom:0;width:1.5px;
        background:${goldAlpha(0.5)};transform:translateX(-50%)"></div>
      <div class="mTick" style="left:16.67%"></div>
      <div class="mTick" style="left:33.33%"></div>
      <div class="mTick" style="left:66.67%"></div>
      <div class="mTick" style="left:83.33%"></div>
      <div class="mFill" style="position:absolute;top:0;bottom:0;
        transition:opacity 200ms ease-out"></div>
      <div class="mHeat" style="position:absolute;top:50%;width:14px;height:14px;border-radius:50%;
        transform:translate(-50%,-50%);opacity:0;transition:opacity 250ms ease"></div>
      <div class="mFlash" style="position:absolute;top:50%;font-size:13px;font-weight:900;opacity:0"></div>
      <div class="mStreak" style="position:absolute;top:16px;display:flex;gap:4px;
        align-items:center;opacity:0;transition:opacity 160ms ease">
        <span class="sd"></span><span class="sd"></span><span class="sd"></span>
      </div>
    </div>
    <div class="bubble" style="display:none;transition:opacity 120ms ease">
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
/* 斜切黑金比分板：隊名塊（我方金底黑字／對方暗金底米金字）＋數字黑金塊＋中間 SET 塊。
   「mine」是每幀依 controlledId 的 teamId 動態切的 class（誰是「我隊」不寫死 A/B，
   淨連線對戰時雙方各看各的「我隊」）；左右順序固定＝teamA 在左、teamB 在右
   （與改版前 score.A : score.B 的順序一致，不因觀看者是哪隊而左右互換）。 */
#scoreboard .score{display:flex;align-items:stretch;transform:skewX(-12deg);
  box-shadow:5px 5px 0 rgba(0,0,0,0.4);}
#scoreboard .score>div{transform:skewX(12deg)}
#scoreboard .score .t{background:#3a3123;color:${COLORS.text};font-weight:900;
  font-size:14px;display:flex;align-items:center;gap:6px;padding:0 10px;letter-spacing:1px;
  white-space:nowrap}
#scoreboard .score .t.mine{background:${COLORS.gold};color:${COLORS.bg2}}
#scoreboard .score .n{background:${COLORS.bg2};color:${COLORS.gold};font-family:${FONTS.latin};
  font-weight:700;font-size:clamp(26px, 7vw, 34px);padding:2px 14px 0;
  border-top:1px solid ${goldAlpha(0.4)};border-bottom:1px solid ${goldAlpha(0.4)}}
#scoreboard .score .mid{background:${COLORS.text};color:${COLORS.bg2};font-family:${FONTS.latin};
  font-size:11px;display:flex;flex-direction:column;justify-content:center;padding:0 10px;
  text-align:center;line-height:1.2;white-space:nowrap}
#scoreboard .score .mid b{font-size:10px;letter-spacing:1px;color:#8c6d1a}
/* 發球方小圓點：只在 serving 隊的隊名塊顯示（金點在金底看不清時自動變深） */
#scoreboard .serveDot{width:7px;height:7px;border-radius:50%;background:${COLORS.gold};
  display:none;flex:none}
#scoreboard .t.mine .serveDot{background:${COLORS.bg2}}
#scoreboard .t.serving .serveDot{display:inline-block}
/* 局點徽章 */
#scoreboard .setpt{font-size:13px;font-weight:800;letter-spacing:3px;
  animation:vd-pulse 0.9s ease-in-out infinite;font-family:${FONTS.zh}}
/* 黑匾金框字卡（播報/提示泡泡）：輕微斜切，文字米金，強調字金色 */
#scoreboard .bubble{position:relative;max-width:min(84vw,460px);padding:10px 22px;
  background:rgba(14,11,6,0.94);border:1px solid ${COLORS.gold};
  transform:skewX(-8deg) rotate(-1deg);
  box-shadow:0 6px 16px rgba(0,0,0,0.55), inset 0 0 18px ${goldAlpha(0.1)}}
#scoreboard .bubble::before,#scoreboard .bubble::after{content:'◆';position:absolute;
  top:50%;transform:translateY(-50%) skewX(8deg) rotate(1deg);color:${COLORS.gold};font-size:9px}
#scoreboard .bubble::before{left:8px}#scoreboard .bubble::after{right:8px}
#scoreboard .bubble.team-ally{border-left:6px solid #6ee7ff}
#scoreboard .bubble.team-enemy{border-left:6px solid #ff9d7a}
#scoreboard .btext{position:relative;font-weight:700;letter-spacing:1px;line-height:1.4;
  font-size:clamp(15px, 4.2vw, 18px);color:${COLORS.text};transform:skewX(8deg) rotate(1deg)}
#scoreboard .btext em{font-style:normal;color:${COLORS.gold}}
@media (max-height: 520px) {
  #scoreboard .bubble{position:fixed;left:calc(env(safe-area-inset-left, 0px) + 10px);
    top:calc(env(safe-area-inset-top, 0px) + 36px);max-width:min(44vw, 340px);
    padding:8px 14px;text-align:left;transform:skewX(-6deg)}
  #scoreboard .btext{font-size:14px;letter-spacing:0.5px;transform:skewX(6deg)}
}
/* W7.1 #4②：氣勢滿檔發光脈動 */
@keyframes vd-momentum-glow{
  0%,100%{filter:brightness(1) drop-shadow(0 0 0 ${COLORS.gold})}
  50%{filter:brightness(1.4) drop-shadow(0 0 5px ${COLORS.gold})}
}
#scoreboard .mFill.glow{animation:vd-momentum-glow 1.1s ease-in-out infinite}
/* W7.1 #4③：氣勢變動 delta 指示——條端小箭頭閃一下（›＝往我方/A 漲、‹＝往對方/B 漲） */
@keyframes vd-mflash{
  0%{opacity:0;transform:translate(-50%,-50%) scale(0.6)}
  30%{opacity:1;transform:translate(-50%,-50%) scale(1.35)}
  100%{opacity:0;transform:translate(-50%,-50%) scale(1)}
}
#scoreboard .mFlash{transform:translate(-50%,-50%)}
#scoreboard .mFlash.flash{animation:vd-mflash 0.6s ease-out}
/* W7.1 三輪 A 案：刻度格線（±3 檔各兩條內線；中線另有 mCenter）＋蓄勢微光 */
#scoreboard .mTick{position:absolute;top:1px;bottom:1px;width:1px;
  background:${goldAlpha(0.3)};transform:translateX(-50%)}
@keyframes vd-mheat{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.25)}}
#scoreboard .mHeat{background:radial-gradient(circle,currentColor 0%,transparent 70%);
  animation:vd-mheat 0.9s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){#scoreboard .mHeat{animation:none}}
@media (prefers-reduced-motion: reduce) {
  #scoreboard .mFill.glow{animation:none;filter:brightness(1.3)}
  #scoreboard .mFlash.flash{animation:vd-mflash-reduced 0.6s ease-out}
}
@keyframes vd-mflash-reduced{0%{opacity:0}30%{opacity:1}100%{opacity:0}}
/* 07-26 試玩回饋（推檔門檻不可讀：「得分了怎麼沒漲」）：連得進度三點——
   集滿三顆才推一檔；對手得分歸零。取代原「蓄勢微光」的隱晦漸亮 */
#scoreboard .mStreak .sd{width:7px;height:7px;border-radius:50%;
  background:${goldAlpha(0.25)};box-shadow:0 1px 2px rgba(0,0,0,0.5);
  transition:background 140ms ease,transform 140ms ease}
#scoreboard .mStreak .sd.on{transform:scale(1.3)}`;
    document.head.appendChild(st);
  }
  const scoreEl = el.querySelector('.score');
  const aTEl = el.querySelector('.t.teamA');
  const bTEl = el.querySelector('.t.teamB');
  const aLabelEl = aTEl.querySelector('.label');
  const bLabelEl = bTEl.querySelector('.label');
  const aNEl = el.querySelector('.n.teamA');
  const bNEl = el.querySelector('.n.teamB');
  const setLblEl = el.querySelector('.setLbl');
  const ptsLblEl = el.querySelector('.ptsLbl');
  const setPtEl = el.querySelector('.setpt');
  const momentumEl = el.querySelector('.momentum');
  const mFillEl = el.querySelector('.mFill');
  const mFlashEl = el.querySelector('.mFlash');
  const mHeatEl = el.querySelector('.mHeat');
  const mStreakEl = el.querySelector('.mStreak');
  const streakDots = [...el.querySelectorAll('.mStreak .sd')];
  let shownV = 0; // W7.1 三輪 A：顯示值向機制值平滑補間（update 每 rAF 一次，固定係數）
  const bubbleEl = el.querySelector('.bubble');
  const btextEl = el.querySelector('.btext');
  let lastTotal = 0;
  let pulseTimer = null;
  let lastBubbleText = '';
  let lastBubbleKind = '';
  let popAnim = null;
  let lastMomentumValue = 0; // W7.1 #4③：flashMomentum 自算 delta 用（closure 自持狀態，呼叫端只給新值）
  const reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function renderBubble(hint) {
    // 正規化：undefined 不會進來；string（classic 舊提示）視為操作提示
    const { text, kind, team } = typeof hint === 'string' ? { text: hint, kind: 'action' } : hint;
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
    bubbleEl.style.display = 'block';
    bubbleEl.style.opacity = '1';
    bubbleEl.classList.toggle('team-ally', kind === 'beat' && team === 'ally');
    bubbleEl.classList.toggle('team-enemy', kind === 'beat' && team === 'enemy');
    btextEl.textContent = text;
    // pop 進場：只在 action/beat 的新句子彈（ambient 高頻變化只淡入）；reduced-motion 不位移
    if (isNew && kind !== 'ambient' && !reducedMotion) {
      popAnim?.cancel();
      popAnim = bubbleEl.animate(
        [
          { transform: 'skewX(-8deg) rotate(-1deg) scale(0.92) translateY(-5px)', opacity: 0.5 },
          { transform: 'skewX(-8deg) rotate(-1deg) scale(1) translateY(0)', opacity: 1 },
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
      // 左右順序固定＝teamA 在左、teamB 在右（跟改版前 `${score.A} : ${score.B}` 同序，
      // 不因觀看者控哪隊而左右互換——多人連線兩端各看各的畫面時位置才不會兜不起來）；
      // 「mine」只影響配色與標籤文字（我隊/對方），靠 controlledId 的 teamId 動態判斷。
      const myTeam = game.players[controlledId]?.teamId ?? 'A';
      aNEl.textContent = String(score.A);
      bNEl.textContent = String(score.B);
      aTEl.classList.toggle('mine', myTeam === 'A');
      bTEl.classList.toggle('mine', myTeam === 'B');
      aLabelEl.textContent = myTeam === 'A' ? '我隊' : '對方';
      bLabelEl.textContent = myTeam === 'B' ? '我隊' : '對方';
      // SET n／目標分：series 存在才有局數（單局賽只顯示目標分）
      const s = game.series;
      setLblEl.textContent = s ? `SET ${s.setIndex}` : 'SET 1';
      ptsLblEl.textContent = `${game.match.target} PTS`;
      // 發球方小圓點：哪一隊發球就在該隊隊名塊顯示（與 mine 無關，永遠貼著真正發球的隊）
      aTEl.classList.toggle('serving', serve === 'A');
      bTEl.classList.toggle('serving', serve === 'B');
      // 得分演出：比分跳動放大閃色
      const total = score.A + score.B;
      if (total !== lastTotal) {
        lastTotal = total;
        scoreEl.style.transition = 'transform 0.12s ease-out';
        scoreEl.style.transform = 'skewX(-12deg) scale(1.06)';
        clearTimeout(pulseTimer);
        pulseTimer = setTimeout(() => {
          scoreEl.style.transform = 'skewX(-12deg) scale(1)';
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
        // W7.1 三輪 A①：顯示值平滑補間（機制仍是 ±3 粗檔；條看起來連續滑動）
        shownV += (v - shownV) * 0.14;
        if (Math.abs(v - shownV) < 0.005) shownV = v;
        const frac = Math.min(Math.abs(shownV) / TUNING.MOMENTUM_MAX, 1) * 50; // 半軌最大百分比
        // 大作感卷 批4：雙向資訊改由「往哪一側長」保留，填色統一金漸層
        // （凍結檔範圍 item 3 明文指定 goldDark→gold→goldLight 三階漸層，A/B 不再分色）
        mFillEl.style.background = MOMENTUM_GRADIENT;
        mFillEl.style.color = COLORS.gold; // glow 的 drop-shadow 吃 currentColor
        mFillEl.style.left = shownV >= 0 ? `${50 - frac}%` : '50%';
        mFillEl.style.width = `${frac}%`;
        // W7.1 #4②：滿檔（±MOMENTUM_MAX）發光脈動（吃機制真值，不吃補間值）
        mFillEl.classList.toggle('glow', Math.abs(v) >= TUNING.MOMENTUM_MAX);
        // W7.1 三輪 A③：蓄勢微光——連得 1、2 分（未達推檔門檻）時，蓄勢方條端漸亮
        // 預熱光；第 3 分推檔＝條真的動＋既有 delta 箭頭爆開。對面蓄勢也看得到＝壓迫感
        const ps = game.pointStreak;
        const heatN = ps?.team && ps.n >= 1 && ps.n < TUNING.MOMENTUM_STREAK_MIN ? ps.n : 0;
        if (heatN > 0) {
          const dir = ps.team === 'A' ? 1 : -1;
          // 預熱點釘在蓄勢方向的「下一格」邊緣（從當前顯示邊緣往該方向探出去）
          const edge = Math.max(0, Math.min(3, shownV * dir)) / TUNING.MOMENTUM_MAX * 50;
          mHeatEl.style.left = dir > 0 ? `${50 - edge - 4}%` : `${50 + edge + 4}%`;
          mHeatEl.style.color = COLORS.gold;
          mHeatEl.style.opacity = `${0.3 + 0.3 * heatN}`;
        } else {
          mHeatEl.style.opacity = '0';
        }
        // 07-26 試玩回饋：連得進度三點——推檔門檻視覺化（「得分了怎麼沒漲」＝
        // 只有連得 3 分才推一檔、對手得 1 分即收檔）。滿檔後不再需要進度＝隱藏
        const sN = ps?.team ? Math.min(ps.n, TUNING.MOMENTUM_STREAK_MIN) : 0;
        const atMax = ps?.team && Math.abs(v) >= TUNING.MOMENTUM_MAX
          && (ps.team === 'A') === (v > 0);
        if (sN > 0 && !atMax) {
          const dir = ps.team === 'A' ? 1 : -1;
          mStreakEl.style.opacity = '1';
          mStreakEl.style.left = dir > 0 ? '2%' : 'auto';
          mStreakEl.style.right = dir > 0 ? 'auto' : '2%';
          streakDots.forEach((d, i) => {
            const on = i < sN;
            d.style.background = on ? COLORS.gold : goldAlpha(0.25);
            d.classList.toggle('on', on);
          });
        } else {
          mStreakEl.style.opacity = '0';
        }
      }

      // 局點徽章：我方＝金色「局點」、對方＝紅色「對方局點」（deuce 規則內建於判定）
      const spTeam = setPointTeam(game);
      if (spTeam && game.phase !== 'set_over') {
        setPtEl.style.display = 'block';
        setPtEl.textContent = spTeam === myTeam ? '🔥 局點' : '⚠ 對方局點';
        setPtEl.style.color = spTeam === myTeam ? COLORS.gold : '#ff6b6b';
      } else {
        setPtEl.style.display = 'none';
      }
    },
    // W7.1 #4③：氣勢變動 delta 指示——每次 MOMENTUM 事件呼叫一次（matchLoop 傳新值，
    // delta 由本函式自算，closure 自持 lastMomentumValue）；delta===0 不閃（理論不會發生，
    // sim 只在值變動時發 MOMENTUM，這裡多一層防呆）
    flashMomentum(value) {
      const delta = value - lastMomentumValue;
      lastMomentumValue = value;
      if (!delta) return;
      const frac = Math.min(Math.abs(value) / TUNING.MOMENTUM_MAX, 1) * 50;
      const leftPct = value >= 0 ? 50 - frac : 50 + frac;
      mFlashEl.style.left = `${leftPct}%`;
      mFlashEl.style.color = COLORS.gold;
      mFlashEl.textContent = delta > 0 ? '‹' : '›'; // 往左漲（A）用‹、往右漲（B）用›——對齊比分方向
      mFlashEl.classList.remove('flash');
      void mFlashEl.offsetWidth; // 強制 reflow，讓同方向連續變動也能重播動畫
      mFlashEl.classList.add('flash');
    },
    // 快速比賽換局重開（同一 scoreboard 實例沿用，見 matchLoop 換局處）：
    // 新局氣勢從 0 起算，flashMomentum 的 delta 基準要跟著歸零，否則首次事件會誤閃
    resetMomentum() { lastMomentumValue = 0; },
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
