// 夾塞浮鈕的 UI 層（2026-08-07 Sawmah 裁定：OPP 前排比照 OH 內切主動化）
//
// ★ 這一組守的是 UI 行為，sim 那半在 tests/tandem-call-window.test.mjs ★
// 每一條都對應內切那次踩過的一個坑（MEDIUM 1/2/3），加上本次新增的兩項：
// 技術閘（裁定 1）與「被排進夾塞」字卡（裁定 2）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, stepGame, createDefaultTeams } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, tandemStateOf } from '../src/sim/ai.js';
import {
  TANDEM_FEEDBACK, TANDEM_BUTTON_STATES, onTandemTap,
  captureTandemOutcome, captureTandemAssign,
} from '../src/app/matchLoop.js';
import { resolveTechGates } from '../src/app/matchConfig.js';

const PID = 'A4'; // 預設隊型裡的 OPP
const SRC = readFileSync(new URL('../src/app/matchLoop.js', import.meta.url), 'utf8');
const STAGE = readFileSync(new URL('../src/app/matchStage.js', import.meta.url), 'utf8');

// floatText 的最小樁：onTandemTap／幀端回饋只用到 show()，不碰 DOM
function stubStage() {
  const shown = [];
  return { shown, stage: { floatText: { show: (text, color) => shown.push({ text, color }) } } };
}
// ★ 2026-08-09 預設 seed 500000 → 512000 ★ 前排二傳恢復 dig 懲罰（ai.js arbitrate）
// 之後 rally 流漂移，原 seed 下 A4 被排進自動骰夾塞的次數歸零（掃描：500000/507919 皆 0，
// 512000 修一半又漏 B 隊樣本，改掃「A4 夾塞≥2 ∧ B 隊夾塞≥2 ∧ tier 窗≥2」三條件同時滿足的 seed → 536000：15／12／1152）。多 seed 對照確認夾塞整體沒被壓死（20 seed：20.9%→17.4%），
// 純粹是單點 seed 的樣本歸零。行為斷言一格未動。
const newGame = (seed = 536000) =>
  createGame({ seed, teams: createDefaultTeams(), setTarget: 25 });

// ★ 2026-08-11 量測參數：自動骰夾塞那兩條改吃 seed 序列（AI.BLOCK_RETRACT_ON_POOR 1→0）★
// 動的是**取樣量**，不是任何行為判準。全域率先驗過（協定步驟 1，40 局／2900+ 波 A/B）：
// 「A4 當 main 的自動骰夾塞波」佔第二觸窗波數 —— 舊旗標（=1）**1.46%**（42/2879）、
// 新旗標（=0）**1.36%**（40/2951）⇒ 差異在雜訊內，現象**沒有被壓死**；
// 536000 這一局的期望值只有 ≈1.0 次，骰到 0 就整條測試失去解析力（＝樣本漂移，
// 不是行為迴歸）。與其再挑一顆「剛好會過」的 seed（2026-08-09 已經因此重挑過一次），
// 改成跨 8 局取樣：期望值 ≈8 次，下一次 rally 流位移也活得下來。
const AUTO_TANDEM_SEEDS = [536000, 537000, 538000, 539000, 540000, 541000, 542000, 543000];

// ════════ 過期鈕：不得靜默 ════════
test('過期鈕：窗已關時按下去要說出原因，且絕不寫 tandemCall', () => {
  const game = newGame();
  const ai = createAiState();
  const seen = new Set();
  let guard = 0;
  while (game.phase !== 'set_over' && guard < 200000 && seen.size < 3) {
    guard += 1;
    const st = tandemStateOf(game, ai, PID);
    if (!st.open && st.reason) {
      const { shown, stage } = stubStage();
      onTandemTap({ game, aiState: ai, playerId: PID, stage });
      assert.equal(shown.length, 1,
        `窗關（reason=${st.reason}）時按下去沒有任何回饋＝玩家按了一顆看得見的鈕、畫面毫無反應`);
      assert.equal(shown[0].text, (TANDEM_FEEDBACK[st.reason] ?? TANDEM_FEEDBACK.missed).text);
      // ★ 窗外絕不得寫 tandemCall ★ 窗外寫進去會殘留到下一波＝玩家沒要求的強制夾塞
      assert.equal(ai.tandemCall, null, '窗外按下去竟然寫了 tandemCall＝下一波會被強制夾塞');
      seen.add(st.reason);
    }
    stepGame(game, aiCollectIntents(game, ai, []));
  }
  assert.ok(seen.size >= 2, `只掃到 ${seen.size} 種關窗原因＝樣本不足`);
});

test('窗開著按下去＝寫指令、不當場報成功（成敗由 sim 下一 tick 結算）', () => {
  const game = newGame();
  const ai = createAiState();
  let guard = 0;
  while (guard < 200000) {
    guard += 1;
    if (tandemStateOf(game, ai, PID).open) {
      const { shown, stage } = stubStage();
      const s = { game, aiState: ai, playerId: PID, stage };
      onTandemTap(s);
      assert.deepEqual(ai.tandemCall, { pid: PID });
      assert.equal(shown.length, 0,
        '按下去就跳字＝把「我送出了指令」當成「它生效了」（假陽性回饋）');
      assert.equal(s.tandemFeedbackDone, false);
      return;
    }
    stepGame(game, aiCollectIntents(game, ai, []));
  }
  assert.fail('整場沒掃到開窗＝這條測試沒有解析力');
});

// ════════ 死文案稽核 ════════
test('死文案：TANDEM_FEEDBACK 不得出現實跑印不出來的 key', () => {
  // 實跑覆蓋率那一條在 tandem-call-window.test.mjs（那裡才跑得起整場）。
  // 這裡守的是**當時量出來的結論**：四個 tandemStateOf 產得出的 reason 之外，
  // 只准留 applied（成功）與 missed（`??` 預設臂）。
  // ★ 覆審 MEDIUM-3：`done` 必須在清單裡 ★ 這張表被兩條路徑取用，key 集合不同：
  //   `onTandemTap` 讀原始 reason（會出現 done）／幀端結算讀 applyTandemCall 的映射
  //   （done→already）。原本只寫 already，於是實跑 433 次 done 全落到「沒排成」＝假陰性。
  // ★ 2026-08-09 補 'nopool' ★ 原判「不會出現」（前排 OPP 恆在攻擊池），前排二傳
  // 恢復 dig 懲罰後 rally 流改變，window 檔的 D 覆蓋率測試實跑抓到 nopool 出現
  // ⇒ 「當時量出來的結論」過期，白名單跟著實測走（不是放寬——D 條與本條互為上下界：
  // 實跑出現的必須有文案、表裡有的必須實跑可達，兩條一起把表夾在剛剛好）。
  const ALLOWED = new Set([
    'applied', 'already', 'done', 'nowindow', 'tier', 'locked', 'partner', 'missed', 'nopool',
  ]);
  for (const key of Object.keys(TANDEM_FEEDBACK)) {
    assert.ok(ALLOWED.has(key), `TANDEM_FEEDBACK.${key} 不在實測可達清單裡＝死文案`);
    assert.ok(TANDEM_FEEDBACK[key].text && TANDEM_FEEDBACK[key].color, `${key} 缺欄位`);
  }
  // 成功類三個 key 都必須有 decoy 變體（MEDIUM-4a：74% 的波球不是他的）
  for (const key of ['applied', 'already', 'done']) {
    assert.ok(TANDEM_FEEDBACK[key].decoy, `${key} 沒有 decoy 文案＝球不是他的時候會說謊`);
    assert.notEqual(TANDEM_FEEDBACK[key].decoy, TANDEM_FEEDBACK[key].text);
    assert.doesNotMatch(TANDEM_FEEDBACK[key].decoy, /身後打/,
      `${key} 的 decoy 句仍在說「打」——球不是他的，他是拉牆的那個`);
  }
  // 失敗類與球權無關 ⇒ 不得有 decoy（多寫＝死文案）
  for (const key of ['nowindow', 'tier', 'locked', 'partner', 'missed']) {
    assert.equal(TANDEM_FEEDBACK[key].decoy, undefined, `${key} 的失敗原因與球權無關`);
  }
  // 幾何四條（lane／depth／stagger／notCrossing）恆為真、mainKind／roll 在
  // 前排 OPP 身上實測 0 次 ⇒ 一律不得有文案（有＝抄表抄出來的死碼）
  // ★ 2026-08-09 nopool 移出死碼清單 ★ 它在 ALLOWED 那段的理由同一件事：
  // 前排二傳恢復 dig 懲罰後 window 檔 D 覆蓋率實跑抓到 nopool 出現，原判過期。
  for (const dead of ['lane', 'depth', 'stagger', 'notCrossing', 'mainKind', 'roll', 'hasMain']) {
    assert.equal(TANDEM_FEEDBACK[dead], undefined, `${dead} 在實跑取樣裡是 0——留著就是死碼`);
  }
  // 繁體中文、不得混進英文機器碼
  for (const v of Object.values(TANDEM_FEEDBACK)) {
    assert.doesNotMatch(v.text, /[A-Za-z]{3,}/);
    if (v.decoy) assert.doesNotMatch(v.decoy, /[A-Za-z]{3,}/);
  }
});

// ★ 覆審 MEDIUM-3 的行為面 ★ 上面那條只看表；這條走**真的按下去**那條路：
// 本波本來就排了他的夾塞（reason='done'）時按鈕，畫面不得說「沒排成」。
test('★MEDIUM-3★ reason=done 按下去不得顯示「沒排成」（假陰性）', () => {
  let checked = 0;
  // 取樣跨 8 局（AUTO_TANDEM_SEEDS，理由見檔頭常數）——行為斷言一格未動
  for (const seed of AUTO_TANDEM_SEEDS) {
    if (checked >= 3) break;
    const game = newGame(seed);
    const ai = createAiState();
    let guard = 0;
    while (game.phase !== 'set_over' && guard < 400000 && checked < 3) {
      guard += 1;
      const st = tandemStateOf(game, ai, PID);
      if (st.reason === 'done') {
        const { shown, stage } = stubStage();
        onTandemTap({ game, aiState: ai, playerId: PID, stage });
        assert.equal(shown.length, 1);
        assert.notEqual(shown[0].text, TANDEM_FEEDBACK.missed.text,
          'reason=done（本來就排了夾塞）卻顯示「沒排成」＝假陰性回饋');
        assert.match(shown[0].text, /本來就排了夾塞/);
        checked += 1;
      }
      stepGame(game, aiCollectIntents(game, ai, []));
    }
  }
  assert.ok(checked >= 2, `樣本不足（${checked}）＝這條沒有解析力`);
});

// ════════ 鎖存：sim 清掉之後回饋仍留得住 ════════
test('鎖存：sim 把 tandemOutcome 清掉之後，回饋仍拿得出來', () => {
  const game = newGame();
  const ai = createAiState();
  const s = { game, aiState: ai, playerId: PID, tandemFeedbackDone: false, tandemOutcomeLatch: null };
  let tapped = false;
  let sawLive = false;
  let checked = 0;
  let guard = 0;
  while (game.phase !== 'set_over' && guard < 200000 && checked < 2) {
    guard += 1;
    if (!tapped && tandemStateOf(game, ai, PID).open) {
      ai.tandemCall = { pid: PID };
      s.tandemFeedbackDone = false;
      s.tandemOutcomeLatch = null;
      tapped = true;
      sawLive = false;
    }
    stepGame(game, aiCollectIntents(game, ai, []));
    captureTandemOutcome(s); // ← 生產端在 stepSim 迴圈裡做同一件事
    if (tapped) {
      if (ai.tandemOutcome?.pid === PID) sawLive = true;
      else if (sawLive) {
        // sim 已經清掉了——這一刻正是「幀界落在這裡就看不到」的那一刻
        assert.ok(s.tandemOutcomeLatch, 'sim 清掉 tandemOutcome 之後鎖存也空了＝回饋照樣消失');
        assert.equal(s.tandemOutcomeLatch.pid, PID);
        assert.ok(TANDEM_FEEDBACK[s.tandemOutcomeLatch.reason ?? 'applied']?.text);
        checked += 1;
        s.tandemFeedbackDone = true;
        s.tandemOutcomeLatch = null;
        ai.tandemCall = null;
        tapped = false;
      }
    }
  }
  assert.ok(checked >= 1, `只驗到 ${checked} 次＝樣本不足`);
});

test('取樣點在 sim 迴圈內：stepSim 每個 tick 呼叫兩支 capture', () => {
  // 把它們搬回幀端就轉紅（內切那次的 MEDIUM-2 就是這個形狀）。
  const stepSimBody = SRC.slice(SRC.indexOf('function stepSim(s) {'),
    SRC.indexOf('// MEDIUM-2 的鎖存端'));
  assert.match(stepSimBody, /captureTandemOutcome\(s\)/,
    'stepSim 的 sim 迴圈裡沒有 captureTandemOutcome＝取樣又回到每幀一次');
  assert.match(stepSimBody, /captureTandemAssign\(s\)/,
    'stepSim 的 sim 迴圈裡沒有 captureTandemAssign＝字卡取樣落在幀端，combo 會被錯過');
  assert.match(SRC, /const tandemOc = s\.tandemOutcomeLatch;/,
    '幀端又改回讀 s.aiState.tandemOutcome＝窗末按下的回饋會消失');
});

// ════════ 回放：先收鈕 ════════
test('回放期間：replay 分支必須在 return 之前收掉夾塞鈕', () => {
  const i = SRC.indexOf('if (s.replay) {');
  assert.ok(i > 0, 'frameStep 的 replay 分支不見了');
  const branch = SRC.slice(i, SRC.indexOf('runReplayFrame(s, now, delta);', i));
  assert.match(branch, /stage\.tandemButton\??\.hide\(\)/,
    '回放分支沒有收掉夾塞鈕——窗內按 🎬 之後鈕會留在畫面上而且按得到');
  // 窗管理區塊本身也要有 `!s.replay`（雙保險，與內切同款）
  assert.match(SRC, /if \(stage\.tandemButton && !s\.replay\) \{/);
});

// ════════ 回放：字卡鎖存不因進回放而作廢（2026-08-07 覆審③）════════
test('回放期間：進 replay 分支必須在 return 之前把字卡鎖存清成 null／false', () => {
  // 病灶：字卡在 stepSim 鎖存後、同幀還沒播出時玩家按下 🎬，`if (s.replay)` 這個
  // early-return 排在下面兩個消費區塊（幀端讀 tandemOutcomeLatch／tandemAssignPending
  // 那兩段）**之前**⇒ 鎖存活過整段回放，回放結束後才補跳一張已經過時好幾秒的字卡。
  // 修法：進 replay 分支當下就地作廢，不等消費端。
  const i = SRC.indexOf('if (s.replay) {');
  assert.ok(i > 0, 'frameStep 的 replay 分支不見了');
  const branch = SRC.slice(i, SRC.indexOf('runReplayFrame(s, now, delta);', i));
  assert.match(branch, /s\.tandemAssignPending\s*=\s*false;/,
    '回放分支沒有清 tandemAssignPending＝stepSim 鎖存後、還沒播出時進回放，回放結束後會補跳一張過時的字卡');
  assert.match(branch, /s\.tandemOutcomeLatch\s*=\s*null;/,
    '回放分支沒有清 tandemOutcomeLatch＝夾塞結算回饋會拖到回放結束才補播');
  // cutOutcomeLatch 是同型的既有缺陷（不是本批引入），2026-08-07 順手一起修
  assert.match(branch, /s\.cutOutcomeLatch\s*=\s*null;/,
    '回放分支沒有清 cutOutcomeLatch＝內切結算回饋同樣會拖到回放結束才補播（同型舊缺陷未修）');
});

// ════════ 裁定 1：技術閘統一到第二屆 ════════
test('★裁定 1★ 內切鈕與夾塞鈕都吃 s.gates.canCallPlay（改回舊行為就轉紅）', () => {
  // 內切鈕原本**完全沒有閘**（第 1 屆就按得到）——這條就是那件事的守衛。
  const cutBlock = SRC.slice(SRC.indexOf('if (stage.cutButton && !s.replay) {'),
    SRC.indexOf('if (cutOpen && !stage.cutButton.isVisible())'));
  assert.match(cutBlock, /s\.gates\.canCallPlay/,
    '內切鈕的顯示條件沒有技術閘＝第 1 屆（還沒學會叫戰術）就按得到，與夾塞不同屆');
  const tandemBlock = SRC.slice(SRC.indexOf('if (stage.tandemButton && !s.replay) {'),
    SRC.indexOf('if (tandemOpen && !stage.tandemButton.isVisible())'));
  assert.match(tandemBlock, /s\.gates\.canCallPlay/, '夾塞鈕的顯示條件沒有技術閘');
  // 位置檢查各自不同（一個 outside、一個 opposite），不得抄錯
  assert.match(cutBlock, /currentRole === 'outside'/);
  assert.match(tandemBlock, /currentRole === 'opposite'/);
  // 兩顆鈕都要前排＋在場
  for (const b of [cutBlock, tandemBlock]) {
    assert.match(b, /onCourt\(game, s\.playerId\)/);
    assert.match(b, /isFrontRow\(/);
  }
});

test('★裁定 1★ canCallPlay 的兩道語意：沒學會＝false、這場沒戰術＝false', () => {
  const game = newGame();
  const withTech = (callPlay, comboScale) => {
    const g = { ...game, comboScale, players: { ...game.players } };
    g.players[PID] = { ...game.players[PID], techniques: { callPlay } };
    return resolveTechGates(g, PID, true).canCallPlay;
  };
  assert.equal(withTech(0, 1), false, '技術未解鎖卻開閘＝第 1 屆就叫得動戰術');
  assert.equal(withTech(1, 0), false, '這場沒有組合攻擊卻開閘＝按了必然叫不出來');
  assert.equal(withTech(1, 1), true, '兩道都通過卻不開閘＝這顆鈕永遠不出現（恆假）');
  // 快速比賽（careerActive=false）恆開，與 trust／暫停／換人同款不綁生涯
  assert.equal(resolveTechGates(game, PID, false).canCallPlay, true);
});

// ════════ 裁定 2：被排進夾塞的人才看得到的字卡 ════════
test('★裁定 2★ 三種來源都出卡：自己叫／S 叫／25% 自動骰', () => {
  const sources = new Set();
  // ---- ① 自己叫 ----
  {
    const game = newGame();
    const ai = createAiState();
    const s = { game, aiState: ai, playerId: PID };
    let guard = 0;
    while (guard < 200000 && !s.tandemAssignPending) {
      guard += 1;
      if (!ai.tandemCall && tandemStateOf(game, ai, PID).open) ai.tandemCall = { pid: PID };
      stepGame(game, aiCollectIntents(game, ai, []));
      captureTandemAssign(s);
    }
    assert.ok(s.tandemAssignPending, '自己按出來的夾塞沒有出字卡');
    sources.add('self');
  }
  // ---- ② S 叫（applyReplanCall → resolveCalledPlay）----
  {
    const game = newGame(507919);
    const ai = createAiState();
    const s = { game, aiState: ai, playerId: PID };
    let guard = 0;
    while (guard < 400000 && !s.tandemAssignPending) {
      guard += 1;
      if (!ai.replanCall && tandemStateOf(game, ai, PID).open) {
        ai.replanCall = { type: 'tandem', callerId: ai.claimId };
      }
      stepGame(game, aiCollectIntents(game, ai, []));
      captureTandemAssign(s);
    }
    assert.ok(s.tandemAssignPending, 'S 叫出來的夾塞沒有出字卡');
    assert.equal(ai.callOutcome?.outcome, 'command');
    sources.add('setter');
  }
  // ---- ③ 25% 自動骰（完全不碰任何指令欄位）----
  // 取樣跨 8 局（AUTO_TANDEM_SEEDS，理由見檔頭常數）：這一臂**完全被動**，
  // 只能等自動骰把 A4 排進夾塞，因此它是三臂裡唯一吃全域率的——單局期望值 ≈1.0 次。
  {
    let pending = null;
    let lastAi = null;
    for (const seed of AUTO_TANDEM_SEEDS) {
      if (pending) break;
      const game = newGame(seed);
      const ai = createAiState();
      lastAi = ai;
      const s = { game, aiState: ai, playerId: PID };
      let guard = 0;
      while (guard < 400000 && !s.tandemAssignPending && game.phase !== 'set_over') {
        guard += 1;
        stepGame(game, aiCollectIntents(game, ai, []));
        captureTandemAssign(s);
      }
      pending = s.tandemAssignPending;
      assert.equal(ai.tandemCall, null, '自動骰那一臂竟然寫了指令欄位＝樣本被污染');
    }
    assert.ok(pending, '自動骰排出來的夾塞沒有出字卡＝只有自己按的才看得到');
    assert.equal(lastAi.tandemCall, null, '自動骰那一臂竟然寫了指令欄位＝樣本被污染');
    sources.add('auto');
  }
  assert.equal(sources.size, 3);
});

// ★★ 覆審 HIGH-1 ★★ 舊斷言是 `fired >= 3 && fired < 100`（實測 38/局落在區間正中）
//   ——**1 張/波與 3 張/波它分不出來**，於是「一波三張、把 floatText 的 MAX_LIVE=3
//   塞滿、擠掉 Perfect 與得分原因」這個 bug 在綠燈下活著。
// 新形狀：以「combo 這一波的壽命」為單位逐波計數，要求**每一波恰好 1 張**。
//   為什麼用 combo 壽命而不是第二觸窗：舊 bug 的第 2／3 張正是**掉在窗外**
//   （舉球／扣球／攔網各一個 flightId），用窗當單位會把它們算到別波去＝又分不出來。
test('★HIGH-1★ 每一波恰好一張卡（不是 1~99 張都算過）', () => {
  const game = newGame();
  const ai = createAiState();
  const s = { game, aiState: ai, playerId: PID };
  const perEpisode = [];
  let cur = null;
  let guard = 0;
  while (game.phase !== 'set_over' && guard < 400000) {
    guard += 1;
    if (!ai.tandemCall && tandemStateOf(game, ai, PID).open) ai.tandemCall = { pid: PID };
    stepGame(game, aiCollectIntents(game, ai, []));
    captureTandemAssign(s);
    const c = ai.attackCombo;
    const mineNow = !!c && c.type === 'tandem' && c.mainId === PID;
    if (mineNow && cur === null) cur = 0;          // 這一波的夾塞成立了＝開始計數
    if (s.tandemAssignPending) {
      s.tandemAssignPending = false;
      if (cur === null) cur = 0;                    // 卡比 combo 早一 tick 也照算
      cur += 1;
    }
    if (!mineNow && cur !== null) { perEpisode.push(cur); cur = null; } // combo 沒了＝結帳
  }
  if (cur !== null) perEpisode.push(cur);
  const withCard = perEpisode.filter((n) => n > 0);
  assert.ok(withCard.length >= 8,
    `只觀察到 ${withCard.length} 波有卡＝樣本不足，這條沒有解析力`);
  const worst = Math.max(...withCard);
  assert.equal(worst, 1,
    `有一波出了 ${worst} 張卡（分佈：${perEpisode.join(',')}）`
    + '——floatText 的 MAX_LIVE 只有 3，同一句連發會把 Perfect 與得分原因整批擠掉');
});

// ★★ 覆審 MEDIUM-5 ★★ 舊斷言恆綠：①預設隊型 A 隊只有一名 OPP＝PID，「別人的夾塞」
//   在那個取樣裡根本不存在（`otherMain` 全走 `type!=='tandem'` 那一項）②斷言前一行
//   已經把 `tandemAssignPending` 排空、加上去重鍵讓第二次呼叫直接 return
//   ⇒ 結構上不可能為真。實測把 `combo.mainId !== s.playerId` 整條刪掉，31 條全綠。
// 新形狀：拿**對面（B 隊）正在排的夾塞**取樣——`aiState` 雙隊共用，B 在第二觸窗時
//   `attackCombo.mainId` 就是 B 的球員。每次用一個**乾淨且已武裝**的 state 物件去問。
test('★MEDIUM-5★ 別人的夾塞不得給我出卡（拿對面 B 隊的組合取樣）', () => {
  const game = newGame();
  const ai = createAiState();
  const driver = { game, aiState: ai, playerId: PID };
  let otherTandem = 0;
  let otherType = 0;
  let guard = 0;
  while (game.phase !== 'set_over' && guard < 400000) {
    guard += 1;
    stepGame(game, aiCollectIntents(game, ai, []));
    captureTandemAssign(driver);
    driver.tandemAssignPending = false;
    const c = ai.attackCombo;
    // 取樣條件：**在第二觸窗內**（否則 capture 只會重新武裝就 return＝斷言變空包彈）
    if (!c || game.phase !== 'rally' || game.rally?.touches !== 1) continue;
    if (c.mainId === PID) continue;
    // 乾淨且已武裝的探針：若沒有 mainId 檢查，這一格就會出卡
    const probe = {
      game, aiState: ai, playerId: PID, tandemAssignArmed: true, tandemAssignPending: false,
    };
    captureTandemAssign(probe);
    assert.equal(probe.tandemAssignPending, false,
      `別人的組合（type=${c.type}、main=${c.mainId}）也給我出了「這球是夾塞」的字卡`);
    if (c.type === 'tandem') otherTandem += 1;
    else otherType += 1;
  }
  // ★ 兩類樣本都要有 ★ 只有 `type!=='tandem'` 的樣本時，刪掉 mainId 檢查也不會紅
  assert.ok(otherTandem >= 50,
    `「別人的夾塞」樣本只有 ${otherTandem} 筆＝這條分不出 mainId 檢查在不在`);
  assert.ok(otherType >= 50, `「別型組合」樣本只有 ${otherType} 筆`);
});

// ════════ 兩態鈕與鈕面 ════════
test('兩態鈕：兩態真的不一樣，且鈕面沿用 KIND_LABELS 的「夾塞」', () => {
  const { idle, mine } = TANDEM_BUTTON_STATES;
  assert.notEqual(idle.key, mine.key, 'key 相同＝setVariant 的冪等閘會把換態整個吃掉');
  assert.notEqual(idle.label, mine.label);
  assert.notEqual(idle.bg, mine.bg, '兩態的底色相同＝夜賽場景裡看不出換過');
  for (const v of [idle.label, mine.label]) assert.match(v, /夾塞/);
  for (const v of [idle.label, mine.label]) assert.doesNotMatch(v, /[A-Za-z]{3,}/);
  // sim 零改動：兩態只是 UI 的 setVariant，不得回頭寫任何 aiState 欄位
  const block = SRC.slice(SRC.indexOf('if (stage.tandemButton && !s.replay) {'),
    SRC.indexOf('// 夾塞結算回饋'));
  assert.doesNotMatch(block, /s\.aiState\.\w+\s*=[^=]/, '夾塞鈕區塊寫了 aiState');
});

test('鈕的位置與字面不得與「⚡ 跟上！」相撞（OPP 前排時兩顆會同時亮）', () => {
  assert.ok(STAGE.includes("label: '🤝 夾塞'"), 'matchStage 沒有建夾塞鈕');
  // bottom 三個值必須互不相同：38%（跟上）／30%（內切）／22%（夾塞）
  const bottoms = [...STAGE.matchAll(/bottom: '(\d+)%'/g)].map((m) => m[1]);
  assert.ok(bottoms.includes('22'), '夾塞鈕沒有自己的 bottom');
  assert.equal(new Set(bottoms).size, bottoms.length, `浮鈕的 bottom 撞位：${bottoms}`);
  // 「跟上」＝球權、「夾塞」＝戰術，兩顆鈕不得共用字面
  assert.ok(!STAGE.includes("label: '⚡ 夾塞'"));
});
