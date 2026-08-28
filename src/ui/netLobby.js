// 多人連線卷 批3 —— 貼碼連線 lobby（拍板 7 手動貼碼、拍板 8 手遊優先）
//
// 手遊優先（Sawmah 08-28：「我從以前到現在都是用手機試玩」）：
//   直式排版、按鈕 ≥48px 觸控目標、連線碼一鍵複製＋系統分享（LINE 傳）、
//   輸入用 textarea 貼上——全程不需要鍵盤快捷鍵、不需要手動反白。
//
// 流程：主機「建立對戰」→ 邀請碼 →（LINE）→ 客機貼上「加入」→ 回覆碼 →（LINE）→
// 主機貼上「連線」→ 通了 → 客機送 join(role) → 主機送 hello(seed/delay/roles) →
// 客機驗版本回 ready → 兩端各自開賽（同 seed 同建隊＝逐值同一場）。
import { hostCreate, guestJoin } from '../net/transport.js';
import { helloMsg, helloProblem, NET_VERSION } from '../net/codec.js';
import { netTeamProblem } from '../career/netExport.js';

const NET_DELAY = 3; // 固定輸入延遲（tick；50ms）【試玩必調——節奏怪就動這顆】

const ROLES = [
  ['outside', '主攻手'], ['setter', '舉球員'], ['middle', '攔中'],
  ['opposite', '輔攻手'], ['libero', '自由人'],
];

export function showNetLobby(ctx, { onStart, careerTeam = null }) {
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;background:#0c1220;color:#e8eef8;'
    + 'z-index:900;overflow-y:auto;padding:18px 16px 40px;font-size:16px;'
    + '-webkit-overflow-scrolling:touch';
  document.body.appendChild(root);
  const state = {
    role: 'outside', api: null, handlers: { onMessage: null, onClose: null },
    team: null, // 批5：生涯隊伍 payload（null＝標準隊）
  };
  // transport 的回呼是建立當下綁死的——lobby 與 matchLoop 先後要收訊息，
  // 這裡放一個可換的轉接頭（matchLoop 的 bindMatch 之後訊息改進比賽）
  const dispatch = {
    onMessage: (m) => state.handlers.onMessage?.(m),
    onClose: (r) => state.handlers.onClose?.(r),
    onOpen: () => {},
    onDisrupt: () => {},
    onRecover: () => {},
  };

  const h = (tag, css, text) => {
    const el = document.createElement(tag);
    if (css) el.style.cssText = css;
    if (text) el.textContent = text;
    return el;
  };
  const BTN = 'display:block;width:100%;min-height:52px;margin:10px 0;border:0;'
    + 'border-radius:12px;font-size:17px;font-weight:700;color:#0c1220;'
    + 'background:#6ee7ff;cursor:pointer';
  const BTN2 = 'display:block;width:100%;min-height:52px;margin:10px 0;border:0;'
    + 'border-radius:12px;font-size:17px;font-weight:700;color:#e8eef8;'
    + 'background:#3a4a66;cursor:pointer';
  const TA = 'display:block;width:100%;min-height:96px;margin:8px 0;border-radius:10px;'
    + 'border:1px solid #3a4a66;background:#141c30;color:#e8eef8;font-size:13px;padding:10px';

  // 表單審視（08-28）：每個子頁常駐「← 返回」——正常流程、連線碼貼錯、打洞卡死、
  // 版本不符……任何狀態都有出口。返回＝收掉半途的連線（cleanup）再回首頁重來。
  function backButton(box, cleanup) {
    const b = h('button', BTN2, '← 返回');
    b.onclick = () => {
      try { cleanup?.(); } catch { /* 半死連線收不乾淨也要能回去 */ }
      state.handlers.onMessage = null;
      state.handlers.onClose = null;
      home();
    };
    box.appendChild(b);
    return b;
  }

  function section(title) {
    const el = h('div', 'max-width:520px;margin:0 auto');
    el.appendChild(h('h2', 'font-size:20px;margin:14px 0 6px', title));
    root.appendChild(el);
    return el;
  }
  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = '✅ 已複製';
    } catch {
      btn.textContent = '複製失敗——請長按選取';
    }
  }
  async function shareText(text) {
    try { await navigator.share({ text }); } catch { /* 使用者取消＝沒事 */ }
  }
  function codeBlock(parent, code, label) {
    const ta = h('textarea', TA);
    ta.value = code; ta.readOnly = true;
    parent.appendChild(ta);
    const copyBtn = h('button', BTN, '📋 複製' + label);
    copyBtn.onclick = () => copyText(code, copyBtn);
    parent.appendChild(copyBtn);
    if (navigator.share) {
      const shareBtn = h('button', BTN2, '📤 分享' + label + '（LINE）');
      shareBtn.onclick = () => shareText(code);
      parent.appendChild(shareBtn);
    }
  }

  // ---- 首頁：選位置＋選主/客 ----
  function home() {
    root.textContent = '';
    const box = section('🏐 連線對戰');
    box.appendChild(h('p', 'opacity:.8;margin:4px 0',
      '你和朋友一台當「主機」、一台當「加入」。連線碼用 LINE 互傳。（v' + NET_VERSION + '）'));
    box.appendChild(h('h3', 'margin:14px 0 4px', '選你要打的位置'));
    const grid = h('div', 'display:grid;grid-template-columns:1fr 1fr;gap:8px');
    const roleBtns = new Map();
    for (const [key, label] of ROLES) {
      const b = h('button', BTN2 + ';margin:0;min-height:48px', label);
      b.onclick = () => {
        state.role = key;
        for (const [k, el] of roleBtns) {
          el.style.background = k === key ? '#6ee7ff' : '#3a4a66';
          el.style.color = k === key ? '#0c1220' : '#e8eef8';
        }
      };
      roleBtns.set(key, b);
      grid.appendChild(b);
    }
    // 表單審視（08-28）：依 state.role 反白——從主機/加入頁按返回回來時，
    // 選過的位置要還在（原本寫死反白 outside＝視覺與狀態不同步）
    const activeRole = roleBtns.has(state.role) ? state.role : 'outside';
    roleBtns.get(activeRole).style.background = '#6ee7ff';
    roleBtns.get(activeRole).style.color = '#0c1220';
    box.appendChild(grid);
    // 批5：帶生涯隊伍上場（有存檔才亮；選了生涯＝位置跟生涯走、上面的位置格失效）
    box.appendChild(h('h3', 'margin:14px 0 4px', '帶哪支隊伍？'));
    const teamRow = h('div', 'display:grid;grid-template-columns:1fr 1fr;gap:8px');
    const stdBtn = h('button', BTN2 + ';margin:0', '標準隊伍');
    const carBtn = h('button', BTN2 + ';margin:0', '我的生涯隊伍');
    const careerPayload = careerTeam ? careerTeam() : null;
    const teamHint = h('p', 'opacity:.7;font-size:13px;margin:4px 0');
    if (!careerPayload) {
      carBtn.disabled = true;
      carBtn.style.opacity = '0.4';
      teamHint.textContent = '（沒有可用的生涯存檔＝只能帶標準隊）';
    }
    // 依 state.team 反白（返回後保留選擇；理由同位置格）
    if (state.team && careerPayload) {
      carBtn.style.background = '#6ee7ff'; carBtn.style.color = '#0c1220';
      teamHint.textContent = `帶生涯隊伍上場——你的位置＝${careerPayload.role}（上面的位置選擇失效）`;
    } else {
      state.team = null; // 存檔沒了（換槽/清檔）＝退回標準隊，不留幽靈選擇
      stdBtn.style.background = '#6ee7ff'; stdBtn.style.color = '#0c1220';
    }
    stdBtn.onclick = () => {
      state.team = null;
      stdBtn.style.background = '#6ee7ff'; stdBtn.style.color = '#0c1220';
      carBtn.style.background = '#3a4a66'; carBtn.style.color = '#e8eef8';
      teamHint.textContent = careerPayload ? '' : teamHint.textContent;
    };
    carBtn.onclick = () => {
      if (!careerPayload) return;
      state.team = careerPayload;
      state.role = careerPayload.role; // 位置跟生涯走
      carBtn.style.background = '#6ee7ff'; carBtn.style.color = '#0c1220';
      stdBtn.style.background = '#3a4a66'; stdBtn.style.color = '#e8eef8';
      teamHint.textContent = `帶生涯隊伍上場——你的位置＝${careerPayload.role}（上面的位置選擇失效）`;
    };
    teamRow.appendChild(stdBtn); teamRow.appendChild(carBtn);
    box.appendChild(teamRow);
    box.appendChild(teamHint);
    const hostBtn = h('button', BTN, '🏠 建立對戰（主機）');
    hostBtn.onclick = () => hostFlow();
    box.appendChild(hostBtn);
    const joinBtn = h('button', BTN2, '🔗 加入對戰（貼朋友的邀請碼）');
    joinBtn.onclick = () => guestFlow();
    box.appendChild(joinBtn);
    const backBtn = h('button', BTN2, '↩ 回主選單');
    backBtn.onclick = () => { window.location.href = window.location.pathname; };
    box.appendChild(backBtn);
  }

  // ---- 主機流程 ----
  async function hostFlow() {
    root.textContent = '';
    const box = section('🏠 主機——建立中…');
    let host;
    try {
      host = await hostCreate(dispatch);
    } catch (err) {
      box.appendChild(h('p', 'color:#ff9d7a', '建立失敗：' + err.message));
      backButton(box, null); // 表單審視：失敗不留死路
      return;
    }
    box.appendChild(h('p', 'opacity:.8', '① 把邀請碼傳給朋友（LINE）'));
    codeBlock(box, host.inviteCode, '邀請碼');
    box.appendChild(h('p', 'opacity:.8;margin-top:14px', '② 朋友會回傳一串「回覆碼」，貼在下面'));
    const ta = h('textarea', TA);
    ta.placeholder = '把朋友的回覆碼貼在這裡';
    box.appendChild(ta);
    const go = h('button', BTN, '🔌 連線');
    const status = h('p', 'color:#6ee7ff');
    go.onclick = async () => {
      if (!ta.value.trim()) { status.textContent = '先把朋友的回覆碼貼進上面那格'; return; }
      go.disabled = true; go.style.opacity = '0.5'; // 防連點：accept 重入會直接丟例外
      try {
        status.textContent = '連線中…（雙方網路互相打洞，最多等十幾秒）';
        await host.accept(ta.value);
      } catch {
        status.textContent = '回覆碼有問題——確認整串都有複製到、再貼一次';
        go.disabled = false; go.style.opacity = '1'; // 失敗＝放行重試
      }
    };
    box.appendChild(go);
    box.appendChild(status);
    backButton(box, () => host.api.close()); // 常駐出口：打洞卡死/對方沒回都能撤
    // 客機 join 到了 → 送 hello → 開賽
    state.handlers.onMessage = (m) => {
      if (m.y !== 'join') return;
      const teamProblem = netTeamProblem(m.team ?? null); // 批5：驗對方生涯隊伍
      if (teamProblem) { status.textContent = '❌ 對方的隊伍：' + teamProblem; return; }
      const seed = Math.floor(Math.random() * 1000000007); // app 層隨機（sim 外，鐵律不碰）
      const roles = { A: state.role, B: m.role };
      const teams = { A: state.team, B: m.team ?? null };
      host.api.send(helloMsg({ seed, delay: NET_DELAY, roles, teams }));
      root.remove();
      onStart({ slot: 'A', seed, delay: NET_DELAY, roles, teams, api: host.api, handlers: state.handlers });
    };
    state.handlers.onClose = () => { status.textContent = '連線失敗或已關閉——按「← 返回」重來'; };
  }

  // ---- 客機流程 ----
  function guestFlow() {
    root.textContent = '';
    const box = section('🔗 加入對戰');
    box.appendChild(h('p', 'opacity:.8', '① 把朋友的邀請碼貼在下面'));
    const ta = h('textarea', TA);
    ta.placeholder = '把邀請碼貼在這裡';
    box.appendChild(ta);
    const go = h('button', BTN, '產生回覆碼');
    const out = h('div');
    const status = h('p', 'color:#6ee7ff');
    let joinedHandle = null; // 返回鍵要收的把手
    go.onclick = async () => {
      if (!ta.value.trim()) { status.textContent = '先把朋友的邀請碼貼進上面那格'; return; }
      go.disabled = true; go.style.opacity = '0.5'; // 防連點：連按會建出第二條半死連線
      let joined;
      try {
        status.textContent = '處理中…';
        joined = await guestJoin(ta.value, {
          ...dispatch,
          onOpen: (api) => {
            status.textContent = '通了！等主機開賽…';
            state.api = api;
            api.send({ y: 'join', role: state.role, team: state.team });
          },
        });
      } catch {
        status.textContent = '邀請碼有問題——確認整串都有複製到、再貼一次';
        go.disabled = false; go.style.opacity = '1'; // 失敗＝放行重試
        return;
      }
      joinedHandle = joined;
      out.textContent = '';
      out.appendChild(h('p', 'opacity:.8;margin-top:14px', '② 把回覆碼傳回給朋友（LINE），等他按連線'));
      codeBlock(out, joined.answerCode, '回覆碼');
    };
    box.appendChild(go);
    box.appendChild(out);
    box.appendChild(status);
    backButton(box, () => joinedHandle?.close()); // 常駐出口：主機不按連線/版本不符都能撤
    state.handlers.onMessage = (m) => {
      if (m.y !== 'hello') return;
      const problem = helloProblem(m)
        ?? netTeamProblem(m.teams?.A ?? null) ?? netTeamProblem(m.teams?.B ?? null); // 批5
      if (problem) { status.textContent = '❌ ' + problem; return; } // 明確拒絕，不靜默降級
      state.api.send({ y: 'ready' });
      root.remove();
      onStart({ slot: 'B', seed: m.seed, delay: m.delay, roles: m.roles, teams: m.teams ?? null, api: state.api, handlers: state.handlers });
    };
    state.handlers.onClose = () => { status.textContent = '連線失敗或已關閉——按「← 返回」重來'; };
  }

  home();
}
