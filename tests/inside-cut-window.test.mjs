// 內切窗（2026-08-07 Sawmah 裁定：修，不退）——A/B/C/D 四項的行為守衛
//
// ★ 這一組測試守的是 sim 行為，不是 UI ★
// 病灶回顧（實測，`tools/cut-effectiveness-probe.mjs` 805 次開窗）：
//   名目窗 800ms，但真正的死線是**開窗後一個 tick（16.7ms）**——`ensureFlightPlan`
//   的 `cutFor` 逐 flightId 只消費一次。D=0 生效 66.4%／D=1 掉到 22.2%／D=5 22.2%
//   ＝與 `CROSS_RATE` 30% 自然骰逐位相同。人類反應 ≥150ms（≥9 tick）
//   ⇒ **真人按的每一次都與沒按無法區分**，這顆鈕從上線到當天沒有真正生效過。
// 因此 A 的守衛必須是「延遲 ≥150ms 之後才按，仍然生效」——只驗「按了會生效」
// 會被 D=0 那一格矇混過去（那正是修復前唯一有效的時點）。
//
// ★ 2026-08-07 稽核修正：**版本無關化** ★
// 舊版整檔用具名 import 拉 `cutStateOf`／`CUT_FEEDBACK`／`BLOCK_PERSONA_INTEL`，
// 而這三個都是修復當次才新增的 export ⇒ 把本檔放到修復前（`5b455e2`）會在
// **模組載入階段**就 `SyntaxError: does not provide an export named ...`，
// 11 條一條都跑不到＝紅在旁枝錯誤、行為根本沒被驗到（`02 §6.1` 條 1）。
// 改法：① 這三個一律走 namespace import（缺 export 時取到 undefined，不炸載入）
//       ② 行為斷言用的「窗開著沒有」改吃**兩版都有的可觀察量**
//          （`rally.possession/touches` ＋ `approachRouteOf` 的線別），
//          不依賴 `cutStateOf` ⇒ 舊版跑得到、且紅在「按了沒生效」這個行為上。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, stepGame, createDefaultTeams } from '../src/sim/game.js';
import * as simAi from '../src/sim/ai.js';
import { approachRouteOf, routeKindFor, CROSS_RATE } from '../src/sim/approach.js';
import { isFrontRow } from '../src/sim/rotation.js';
import * as blockRead from '../src/sim/blockRead.js';
import * as matchLoop from '../src/app/matchLoop.js';
import { myRouteFor } from '../src/input/myRoute.js';

const { createAiState, aiCollectIntents, attackPointsOf } = simAi;
const { BLOCK_PERSONA } = blockRead;

const PID = 'A2'; // 預設隊型裡的前排 OH（與 cut-effectiveness-probe 同一名球員）
// 人類反應下界 150ms ＝ 9 tick。取 30 tick（500ms）＝**遠超**該下界，
// 且仍在實測窗長（開窗→二傳觸球 1386–1620ms）之內。
const HUMAN_DELAY_TICKS = 30;

// 「第二觸窗開著、而且這一波有我的左翼線可改」——**版本無關**的窗定義：
// 只吃 `rally` 的可觀察量與這名球員當下的線別，不呼叫 `cutStateOf`。
// 這不是把 `cutStateOf` 重刻一份（它另有 passTier 兩層檔位的判準，本函式沒有），
// 而是規格層的「第二觸窗」——修復前後兩版都成立，所以拿它當注入時點才有鑑別力。
function windowOpenish(game, ai) {
  const me = game.players?.[PID];
  const r = game.rally;
  if (!me || game.phase !== 'rally' || !r) return false;
  if (r.possession !== me.teamId || r.touches !== 1) return false;
  if (ai.approach?.team !== me.teamId) return false;
  if (approachRouteOf(ai.approach.routes, PID)?.kind !== 'left') return false;
  // 一傳品質的兩層檔位（隊伍檔＋接一傳者的罰則檔）——**不重刻判準**：
  // 直接問兩版都有的 `attackPointsOf`／`routeKindFor`「若我強制內切，它會給我什麼」，
  // 與 `cutStateOf` 問的是同兩支函式。少了這一層，注入時點會落在
  // 「按了必然無效」的波上，生效率被稀釋成 59.5%＝這條測試自己失去解析力。
  const tier = ai.passTier ?? 'perfect';
  const pt = attackPointsOf(game, me.teamId, ai.claimId, tier, ai.passReceiverId)
    .find((p) => p.pid === PID);
  if (!pt) return false;
  return routeKindFor(pt.kind, { passTier: pt.tier ?? tier, forcedCut: true }) === 'left_inside';
}

// 修復當次才新增的 export——缺席時給一句說得出「少了什麼行為」的訊息，
// 而不是 TypeError／載入期 SyntaxError（後者會讓整檔一條都跑不到）。
function needCutState() {
  assert.ok(typeof simAi.cutStateOf === 'function',
    'sim 沒有 cutStateOf：這一版的內切窗沒有「唯一真相」可問，UI 只能自己記時間');
  return simAi.cutStateOf;
}
function needFeedback() {
  assert.ok(matchLoop.CUT_FEEDBACK, 'matchLoop 沒有匯出 CUT_FEEDBACK：這一版沒有內切結算回饋');
  return matchLoop.CUT_FEEDBACK;
}

// 真實路徑：createGame → aiCollectIntents → stepGame，零 mock、零重刻判準。
// injectAfter＝開窗後第幾 tick 寫 `aiState.cutCall`（null＝完全不按）。
function playSet({ seed, injectAfter = null, onWindow = null }) {
  const game = createGame({ seed, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  const tally = { windows: 0, injected: 0, applied: 0, outcomes: {}, everCalled: false };
  let w = null;
  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
    guard += 1;
    if (w && !w.injected && injectAfter != null && guard >= w.openTick + injectAfter) {
      ai.cutCall = { pid: PID, cut: true };
      w.injected = true;
      tally.injected += 1;
    }
    const intents = aiCollectIntents(game, ai, []);
    if (ai.cutCall) tally.everCalled = true;
    if (windowOpenish(game, ai) && !w) {
      w = { openTick: guard, injected: false, closed: false };
      tally.windows += 1;
      if (onWindow) onWindow(game, ai);
    }
    const ev = stepGame(game, intents);
    // 二傳觸球＝窗關：此刻結算這一波的線，然後**收回這次的按壓**。
    // ★ 收回這一步是版本中立的關鍵 ★ 修復前的版本沒有「窗一關就清 cutCall」那道閘
    // （ai.js:373-374 是修復當次加的）⇒ 一次按壓會殘留到同一球的後續每一波、
    // 把它們全部強制成內切 ⇒ 之後的波再也不是 'left'、窗再也不開，樣本從 42 掉到 3
    // ＝這條測試會紅在「樣本不足」（旁枝）而不是「按了沒生效」（行為）。
    // 這裡的清除模擬的是玩家「一波按一次」，兩版逐字相同。
    if (w && !w.closed && ev.some((e) => e.type === 'TOUCH' && e.touches === 2 && e.team === 'A')) {
      w.closed = true;
      if (w.injected) {
        if (approachRouteOf(ai.approach?.routes, PID)?.kind === 'left_inside') tally.applied += 1;
        const oc = ai.cutOutcome;
        const key = `${oc?.outcome ?? 'none'}/${oc?.reason ?? 'null'}`;
        tally.outcomes[key] = (tally.outcomes[key] ?? 0) + 1;
      }
      ai.cutCall = null;
      w = null;
    }
    if (w && (ev.some((e) => e.type === 'DEAD_BALL')
      || ev.some((e) => e.type === 'TOUCH' && e.touches === 3 && e.team === 'A'))) {
      ai.cutCall = null;
      w = null;
    }
  }
  return { game, ai, tally };
}

// ════════ A：延遲 ≥150ms 之後按，仍然生效 ════════
test('A 內切真實窗：延遲 500ms（30 tick，遠超人類反應 150ms）才按，生效率 100%', () => {
  let injected = 0;
  let applied = 0;
  for (const seed of [500000, 507919, 515838]) {
    const { tally } = playSet({ seed, injectAfter: HUMAN_DELAY_TICKS });
    injected += tally.injected;
    applied += tally.applied;
  }
  // ★ 行為斷言排在樣本量斷言**之前**（02 §6.1 條 1）★ 反過來寫的話，舊版會先紅在
  //   「樣本不足」這個旁枝理由上，真正要守的行為根本沒被驗到。
  const rate = injected ? applied / injected : 0;
  assert.ok(rate >= 0.95, `延遲 30 tick 的生效率 ${(rate * 100).toFixed(1)}%`
    + `（applied=${applied}／injected=${injected}）`
    + `——修復前為 22.2%＝CROSS_RATE ${CROSS_RATE * 100}% 自然骰基準`);
  assert.ok(injected >= 20, `樣本不足（injected=${injected}）＝這條測試沒有解析力`);
});

test('A 名目窗＝真實窗：`cutStateOf.open` 為真的每一 tick，按下去都生效', () => {
  // 逐 tick 掃整個窗：只要 sim 說「開著」，寫入 cutCall 之後下一次規劃就必須成線。
  // 這條是「名目與真實不得有落差」這個修法本身的機械化——UI 不再自己記時間，
  // 它問的就是這支函式，所以這支函式說開就必須真的能用。
  const game = createGame({ seed: 500000, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  let checked = 0;
  let guard = 0;
  let doneThisWave = false;
  while (game.phase !== 'set_over' && checked < 12 && guard < 200000) {
    guard += 1;
    const intents = aiCollectIntents(game, ai, []);
    // 窗界吃版本無關的 `windowOpenish`（規格層的第二觸窗）——舊版沒有 cutStateOf，
    // 用它當窗界會讓本條紅在「函式不存在」而不是「按了沒生效」。
    const open = windowOpenish(game, ai);
    if (open && !doneThisWave) {
      // 在「開著」的隨機一格（用 tick 取模製造分散，維持決定論）注入
      if (guard % 7 === 0) {
        ai.cutCall = { pid: PID, cut: true };
        aiCollectIntents(game, ai, []); // 下一次規劃即消費
        assert.equal(
          approachRouteOf(ai.approach?.routes, PID)?.kind, 'left_inside',
          `cutStateOf 說 open 卻沒生效（tick=${game.tick}）＝名目窗與真實窗又分岔了`,
        );
        // 新版另有 cutStateOf：它說 open 的每一格都必須與規格窗一致（名目＝真實）
        if (typeof simAi.cutStateOf === 'function') {
          assert.equal(ai.cutOutcome?.outcome, 'applied');
        }
        checked += 1;
        doneThisWave = true;
      }
    }
    if (!open) doneThisWave = false;
    stepGame(game, intents);
  }
  assert.ok(checked >= 5, `只驗到 ${checked} 次＝樣本不足`);
});

test('A 決定論護欄：AI 對局（沒有人按）整場零觸發——cutCall／cutOutcome 恆為 null', () => {
  // 護欄的形狀比照 applyRouteCommit 的「護欄 C」：這條轉紅代表有人又在 sim 內部
  // 預寫了 cutCall（2026-08-06 那次「開窗即預寫 { cut:false }」就是這個形狀），
  // 而那會讓 AI 對局的行為漂移。逐值不變的正式證據＝tools/sim-hash-probe.mjs 的
  // 修前／修後 A/B（14 局雜湊全等）；本測試是它的常駐廉價版。
  const game = createGame({ seed: 500000, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
    guard += 1;
    const intents = aiCollectIntents(game, ai, []);
    // 用 `== null`（涵蓋 undefined）：舊版根本沒有 cutOutcome 這個欄位，
    // 嚴格比較會讓本條紅在「欄位不存在」而不是「有人預寫了指令」。
    assert.ok(ai.cutCall == null, 'AI 對局出現 cutCall＝有人在 sim 內部預寫玩家指令');
    assert.ok(ai.cutOutcome == null, 'AI 對局出現 cutOutcome＝結算被無條件觸發');
    stepGame(game, intents);
  }
  assert.ok(guard > 1000, '樣本不足');
});

// ════════ B：一傳不到位就不開窗 ════════
test('B 一傳不到位＝不開窗：passTier 非 perfect 時 open=false、reason=pass', () => {
  const cutStateOf = needCutState();
  const game = createGame({ seed: 500000, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  let seenPass = 0;
  let guard = 0;
  while (game.phase !== 'set_over' && seenPass < 5 && guard < 400000) {
    guard += 1;
    const intents = aiCollectIntents(game, ai, []);
    // 人工把本波降檔（真實路徑上的 tier 由 passTierOf 給，這裡只驗窗的判準）
    if (ai.approach?.team === 'A' && game.rally.touches === 1 && ai.passTier === 'perfect'
      && approachRouteOf(ai.approach.routes, PID)?.kind === 'left') {
      const before = cutStateOf(game, ai, PID);
      assert.equal(before.open, true);
      ai.passTier = 'ok';
      const after = cutStateOf(game, ai, PID);
      assert.equal(after.open, false, '一傳非 perfect 仍然開窗＝按了必無效卻照樣跳鈕');
      assert.equal(after.reason, 'pass');
      ai.passTier = 'perfect';
      seenPass += 1;
    }
    stepGame(game, intents);
  }
  assert.ok(seenPass >= 3, `樣本不足（${seenPass}）`);
});

test('B 自己接一傳＝這條線降級＝不開窗（§7 D2 的第二層檔位）', () => {
  const cutStateOf = needCutState();
  // `routeKindFor` 吃的是**這條線自己的** tier（`attackPointsOf` 對接一傳者
  // 套 worseTier）——只看隊伍層的 aiState.passTier 會漏掉這一整類。
  // 實測診斷輪：未生效的波裡有一大半正是「隊伍 perfect、但他自己接了一傳」。
  const game = createGame({ seed: 500000, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  let seen = 0;
  let guard = 0;
  while (game.phase !== 'set_over' && seen < 5 && guard < 400000) {
    guard += 1;
    const intents = aiCollectIntents(game, ai, []);
    if (ai.approach?.team === 'A' && game.rally.touches === 1
      && ai.passTier === 'perfect' && ai.passReceiverId === PID
      && approachRouteOf(ai.approach.routes, PID)?.kind === 'left') {
      const st = cutStateOf(game, ai, PID);
      assert.equal(st.open, false, '接一傳者的線已降級，卻仍然開窗');
      assert.equal(st.reason, 'pass');
      // 硬寫進去也不得生效，且要誠實回報 missed（不是靜默失敗）
      ai.cutCall = { pid: PID, cut: true };
      aiCollectIntents(game, ai, []);
      assert.notEqual(approachRouteOf(ai.approach?.routes, PID)?.kind, 'left_inside');
      assert.equal(ai.cutOutcome?.outcome, 'missed');
      assert.equal(ai.cutOutcome?.reason, 'pass');
      ai.cutCall = null;
      ai.cutOutcome = null;
      seen += 1;
    }
    stepGame(game, intents);
  }
  assert.ok(seen >= 2, `樣本不足（${seen}）——這一類在實測裡佔未生效波的大半，不該掃不到`);
});

test('B 球已舉出去＝窗關：touches 進到 2 之後 open=false、硬寫也不生效', () => {
  const cutStateOf = needCutState();
  const game = createGame({ seed: 500000, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  let seen = 0;
  let guard = 0;
  while (game.phase !== 'set_over' && seen < 3 && guard < 400000) {
    guard += 1;
    const intents = aiCollectIntents(game, ai, []);
    if (game.phase === 'rally' && game.rally.possession === 'A' && game.rally.touches >= 2) {
      const st = cutStateOf(game, ai, PID);
      assert.equal(st.open, false);
      assert.equal(st.reason, 'nowindow');
      seen += 1;
    }
    stepGame(game, intents);
  }
  assert.ok(seen >= 2, `樣本不足（${seen}）`);
});

// ════════ C：文案誠實化 ════════
test('C 文案：名字保留「內切」、拿掉誤導的「從快攻手背後穿出去」', () => {
  const CUT_FEEDBACK = needFeedback();
  const src = readFileSync(new URL('../src/app/matchLoop.js', import.meta.url), 'utf8');
  const stage = readFileSync(new URL('../src/app/matchStage.js', import.meta.url), 'utf8');
  // 那句描述的是 `cross`（真交叉：助跑穿過快攻手起跳點後方），不是 left_inside
  // ——真人因此以為自己叫的是交叉。掃字串而不是掃行為：這是一個文案缺陷。
  // 掃的是**字串字面量**（帶引號），不是任何一處出現——那句話還活在註解裡，
  // 註解是「錯在哪」的留痕，該留；會被玩家看到的只有字面量。
  assert.ok(!src.includes("'切中路——從快攻手背後穿出去'"), '誤導文案還在畫面上');
  for (const [k, v] of Object.entries(CUT_FEEDBACK)) {
    assert.doesNotMatch(v.text, /背後/, `${k} 的文案又把內切描述成交叉`);
  }
  assert.equal(CUT_FEEDBACK.applied.text, '內切——切進中路');
  // 鈕面與 routeCue／KIND_LABELS 用同一個詞（Sawmah 裁定 2：名字保留「內切」）
  assert.ok(stage.includes("label: '↘ 內切'"), '浮鈕鈕面沒有統一成「內切」');
  assert.ok(!stage.includes("label: '↘ 切中路'"), 'matchStage 鈕面仍是舊叫法');
});

// ★ 2026-08-07 稽核修正：本條原本只斷言「表裡有這幾個 key」＝**恆真檢查** ★
//   那份清單是照著表抄的，表怎麼改它就怎麼對——`nopool` 那句從來印不出來，
//   這條照樣綠（本專案 feedback_zero_power_checks 第①條的形狀）。
//   改成把兩端接起來：**跑真實比賽，收集 `cutStateOf` 實際吐出來的 reason**，
//   要求 ①每個實際會出現的 reason 都有文案（漏＝玩家看到萬用句）
//        ②表裡不得留下實際不會出現的文案（＝死碼，這次刪掉的 nopool 就是它抓的）
test('C 回饋覆蓋率：實跑收集到的每個 reason 都有文案，且表裡沒有印不出來的死文案', () => {
  const CUT_FEEDBACK = needFeedback();
  const cutStateOf = needCutState();
  // reason 'done'（本來就走內切）在 applyCutCall 被記成 outcome 'applied'／文案 key 'already'
  const KEY_OF = { done: 'already' };
  const seen = new Set();
  for (const seed of [500000, 507919, 515838]) {
    const game = createGame({ seed, teams: createDefaultTeams(), setTarget: 25 });
    const ai = createAiState();
    let guard = 0;
    while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
      guard += 1;
      const intents = aiCollectIntents(game, ai, []);
      const me = game.players[PID];
      const r = game.rally;
      // 只在「這顆鈕的唯一觀眾」身上取樣：在場的前排 OH、我方第二觸窗內
      // 取樣範圍＝**`onCutTap` 的觀眾**（不是「鈕看得見」的觀眾）：在場的前排 OH
      // 在 rally 中的任何一格。刻意**不**限定 touches===1——鈕過期到下一個 rAF
      // 收掉之間的那一格點下去，正是 'nowindow' 唯一的可達路徑（見 onCutTap）。
      // 而 isFrontRow 這一格不能少：少了它會混進後排輪次，收到玩家永遠看不到的
      // 'nopool'（前排 OH 恆在攻擊池裡 ⇒ 那一句印不出來，08-07 已刪）。
      if (game.phase === 'rally' && game.match.rotations[me.teamId].includes(PID)
        && isFrontRow(game.match.rotations[me.teamId], PID)) {
        const st = cutStateOf(game, ai, PID);
        if (!st.open && st.reason) seen.add(KEY_OF[st.reason] ?? st.reason);
      }
      stepGame(game, intents);
    }
  }
  assert.ok(seen.size >= 3, `只收集到 ${seen.size} 種 reason＝樣本不足，這條沒有解析力`);
  for (const reason of seen) {
    assert.ok(CUT_FEEDBACK[reason]?.text,
      `實跑會出現 reason=${reason}，但 CUT_FEEDBACK 沒有對應文案＝玩家會看到萬用句`);
  }
  // 'applied'＝成功、'missed'＝`??` 的預設臂，兩者不由 cutStateOf 的 reason 產生
  const EXEMPT = new Set(['applied', 'missed']);
  for (const key of Object.keys(CUT_FEEDBACK)) {
    if (EXEMPT.has(key)) continue;
    assert.ok(seen.has(key),
      `CUT_FEEDBACK.${key} 在 40k+ 次實跑取樣裡從未被 cutStateOf 產生過＝死文案，該刪`
      + `（實際收集到：${[...seen].sort().join('／')}）`);
  }
  // 成功與失敗必須是**不同**的句子（假陽性回饋就是兩者混同造成的）
  assert.notEqual(CUT_FEEDBACK.applied.text, CUT_FEEDBACK.pass.text);
});

test('C 重用既有 HUD：切成之後 routeCue 的線名立刻變「內切」（不另造第二套）', () => {
  // 「真的鎖進 left_inside 才報成功」的**狀態面**：浮字是一閃即逝的事件回饋，
  // 而玩家整球看得到的那條線名來自 myRouteFor→routeCue（既有元件，零改動）。
  const game = createGame({ seed: 500000, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  let checked = false;
  let guard = 0;
  while (!checked && guard < 200000) {
    guard += 1;
    const intents = aiCollectIntents(game, ai, []);
    if (windowOpenish(game, ai)) {
      assert.equal(myRouteFor(game, ai, PID)?.kindLabel, '左翼');
      ai.cutCall = { pid: PID, cut: true };
      aiCollectIntents(game, ai, []);
      assert.equal(myRouteFor(game, ai, PID)?.kindLabel, '內切');
      checked = true;
    }
    stepGame(game, intents);
  }
  assert.ok(checked, '整場沒掃到開窗＝這條測試沒有解析力');
});

// ════════ D：情報層 ════════
test('D 攔網人格情報：兩種人格都有中文語彙，且不印英文代號', () => {
  const BLOCK_PERSONA_INTEL = blockRead.BLOCK_PERSONA_INTEL;
  assert.ok(BLOCK_PERSONA_INTEL, 'blockRead 沒有 BLOCK_PERSONA_INTEL：這一版沒有攔網人格情報層');
  for (const persona of [BLOCK_PERSONA.READ, BLOCK_PERSONA.COMMIT]) {
    const it = BLOCK_PERSONA_INTEL[persona];
    assert.ok(it?.label && it.tag && it.hint, `${persona} 缺欄位`);
    const all = `${it.label}${it.tag}${it.hint}`;
    assert.doesNotMatch(all, /read|commit/i, '裁定：不得直接印英文 read／commit');
    // 要連得到「該不該內切」——只標人格而不連到決定，等於換一個看不懂的代號
    assert.match(it.hint, /內切|直線/);
  }
  assert.notEqual(BLOCK_PERSONA_INTEL.read.hint, BLOCK_PERSONA_INTEL.commit.hint);
});

test('D 兩個賽前出口都接上了：生涯對手卡＋開賽播報（快速比賽的唯一出口）', () => {
  const card = readFileSync(new URL('../src/ui/careerScreen.js', import.meta.url), 'utf8');
  const comm = readFileSync(new URL('../src/ui/commentary.js', import.meta.url), 'utf8');
  assert.ok(card.includes('BLOCK_PERSONA_INTEL'), '生涯對手卡沒有標出攔網傾向');
  assert.ok(comm.includes('BLOCK_PERSONA_INTEL'), '開賽播報沒有標出攔網傾向');
  // 快速比賽不注入 aiProfiles ⇒ blockPersonaOf 回退 read；播報要讀 sim 的同一支回退
  assert.ok(comm.includes('blockPersonaOf'), '播報自己判斷人格＝第二份真相');
});
