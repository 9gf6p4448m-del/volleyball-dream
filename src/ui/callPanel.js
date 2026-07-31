// 組合攻擊卷 段 E 路徑甲（2026-07-31）— 死球窗「叫戰術」面板
//
// 真實對應＝二傳在背後比的手勢：發球前把這一球要跑的套路講好。
// **不觸憲法 §九**（`docs/phase5-decisions-RESOLVED.md:253`「球內新增任何決策面板」）
// ——禁的是**球內**，死球窗不在其內；憲法 §0 題5 的範圍收窄同理，見該檔 §九 附註。
//
// 框架沿 `subPanel.js` 逐項：常駐鈕＋全屏 overlay、inline CSS、掛 document.body、
// 開啟時由 matchLoop 把 delta 砍成 0（凍結模擬——死球窗 tick 不流逝，慢慢想）。
//
// ★ UI 硬性要求：同一個面板兩種語意，回饋必須分得開 ★
// 本面板在**按下去之前**就分：標題、鈕色、每一顆選項鈕的動詞、底部提示語都吃
// `CALL_MODES` 的同一份規格（S＝⚡指令／非 S＝🙋請求）。按下去之後的字卡由
// `input/callPlay.js` 的 `callFeedbackOf` 給，用同一份規格 ⇒ 前後不會一邊說指令
// 一邊說請求。玩家不可能分不清自己剛才是下令還是許願。
import { callOptionsFor, callModeOf, CALL_MODES, pendingCallTextOf } from '../input/callPlay.js';

// handlers.callPlay(type) 由 matchLoop 開機注入（stage.handlers 後綁定慣例，同 subPanel）
export function createCallPanel({ game, playerId, handlers }) {
  const css = (elm, arr) => { elm.style.cssText = arr.join(';'); };
  const btn = document.createElement('button');
  // ★ 右上直欄的格位表（2026-07-31 試玩回報「叫戰術跟暫停卡在一起、只按得到暫停」後補）★
  //   top+8   🎬 回放        matchStage.js:304
  //   top+60  ✕ 離開         matchStage.js:273
  //   top+112 ⚙ 換人         subPanel.js:45（生涯限定）
  //   top+164 ⏱ 暫停         matchStage.js:324
  //   top+216 ⏩×2 快轉       matchStage.js:467
  //   top+268 🙋 叫戰術       ← 本檔
  // 格距 52px（鈕高 44 ＋ 間距 8）。**新增鈕前先掃這張表**：
  //   git grep -n "safe-area-inset-top, 0px) + " -- src
  // 病灶紀錄：本鈕原本寫 top+164，與暫停鈕 CSS 逐字相同（同 top／同 right／同 z-index:16），
  // 而暫停鈕在 matchStage.js:88 後掛進 DOM ⇒ 同層級下後者蓋前者，點擊全被暫停吃掉。
  // 截圖裡還看得到叫戰術，是因為暫停面板開著時暫停鈕自己隱藏了。
  css(btn, [
    'position:fixed', 'top:calc(env(safe-area-inset-top, 0px) + 268px)',
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

  let open = false;
  let pending = null; // 本次已叫的牌（供狀態列顯示；真相在 aiState.calledPlay）

  const modeOf = () => callModeOf(game, playerId);

  function optionRow(opt, spec) {
    const r = document.createElement('div');
    css(r, [
      'display:flex', 'flex-direction:column', 'gap:2px', 'padding:10px 12px',
      'border-radius:10px', 'cursor:pointer', 'text-align:left',
      `background:${pending?.type === opt.type ? 'rgba(110,231,255,0.18)' : 'rgba(30,40,64,0.55)'}`,
      `border:1px solid ${pending?.type === opt.type ? spec.color : 'transparent'}`,
    ]);
    const top = document.createElement('div');
    css(top, ['display:flex', 'gap:8px', 'align-items:center', 'font-size:15px', 'font-weight:700']);
    const tag = document.createElement('span');
    css(tag, ['font-size:11px', 'font-weight:800', `color:${spec.color}`, 'background:#22304e',
      'border-radius:8px', 'padding:1px 7px']);
    // 每一顆鈕自己帶動詞＝掃一眼就知道按下去是下令還是拜託
    tag.textContent = spec.word;
    const name = document.createElement('span');
    name.textContent = opt.label;
    top.appendChild(tag);
    top.appendChild(name);
    const desc = document.createElement('div');
    css(desc, ['font-size:11px', 'color:#9fb0cc', 'line-height:1.5']);
    desc.textContent = opt.desc;
    r.appendChild(top);
    r.appendChild(desc);
    r.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      handlers.callPlay?.(opt.type);
      pending = { type: opt.type, isSetter: opt.mode === 'command' };
      paint();
    });
    return r;
  }

  function paint() {
    card.replaceChildren();
    const spec = CALL_MODES[modeOf()];
    const head = document.createElement('div');
    css(head, ['display:flex', 'justify-content:space-between', 'align-items:center']);
    const title = document.createElement('div');
    css(title, ['font-size:16px', 'font-weight:800', 'letter-spacing:1px', `color:${spec.color}`]);
    title.textContent = `${spec.icon} 叫戰術（${spec.word}）`;
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
    hint.textContent = spec.hint;
    card.appendChild(hint);
    const status = document.createElement('div');
    css(status, ['font-size:12px', 'font-weight:700', `color:${spec.color}`, 'min-height:16px']);
    status.textContent = pendingCallTextOf(pending) ?? '（尚未叫牌——這球照系統分配）';
    card.appendChild(status);
    for (const opt of callOptionsFor(game, playerId)) card.appendChild(optionRow(opt, spec));
    const foot = document.createElement('div');
    css(foot, ['font-size:11px', 'color:#9fb0cc', 'line-height:1.5', 'margin-top:4px']);
    // 裁定 E 的預告：不預先變灰（那要預判一傳品質＝作弊），改成事前講清楚規則
    foot.textContent = modeOf() === 'command'
      ? '一傳到位、陣容湊得出來才跑得成——湊不出來當場會告訴你原因'
      : '請求不是指令：二傳依信任決定理不理你，湊不出來也會當場告訴你';
    card.appendChild(foot);
  }

  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (btn.dataset.enabled !== '1') return;
    api.openPanel();
  });
  overlay.addEventListener('pointerdown', (e) => e.stopPropagation());

  const api = {
    el: btn,
    isOpen: () => open,
    // 本波叫牌被 sim 消費（或死球重置）時由 matchLoop 通知，狀態列跟著歸零
    clearPending() { pending = null; if (open) paint(); },
    openPanel() {
      open = true;
      paint();
      overlay.style.display = 'flex';
    },
    close() {
      open = false;
      overlay.style.display = 'none';
    },
    // 每幀同步：死球窗（phase==='serve'）才可開——與 subPanel 同一把尺
    sync(g) {
      const usable = g.phase === 'serve';
      const spec = CALL_MODES[modeOf()];
      btn.dataset.enabled = usable ? '1' : '0';
      btn.style.opacity = usable ? '1' : '0.45';
      btn.textContent = pending
        ? `${spec.icon} ${spec.word}已下`
        : `${spec.icon} 叫戰術`;
      if (g.phase === 'set_over') {
        btn.style.display = 'none';
        if (open) api.close();
      }
    },
  };
  return api;
}
