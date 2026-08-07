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
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, stepGame, createDefaultTeams } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, cutStateOf } from '../src/sim/ai.js';
import { approachRouteOf, CROSS_RATE } from '../src/sim/approach.js';
import { BLOCK_PERSONA, BLOCK_PERSONA_INTEL } from '../src/sim/blockRead.js';
import { CUT_FEEDBACK } from '../src/app/matchLoop.js';
import { myRouteFor } from '../src/input/myRoute.js';

const PID = 'A2'; // 預設隊型裡的前排 OH（與 cut-effectiveness-probe 同一名球員）
// 人類反應下界 150ms ＝ 9 tick。取 30 tick（500ms）＝**遠超**該下界，
// 且仍在實測窗長（開窗→二傳觸球 1386–1620ms）之內。
const HUMAN_DELAY_TICKS = 30;

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
    const st = cutStateOf(game, ai, PID);
    if (st.open && !w) {
      w = { openTick: guard, injected: false, closed: false };
      tally.windows += 1;
      if (onWindow) onWindow(game, ai);
    }
    const ev = stepGame(game, intents);
    // 二傳觸球＝窗關：此刻結算這一波的線
    if (w && !w.closed && ev.some((e) => e.type === 'TOUCH' && e.touches === 2 && e.team === 'A')) {
      w.closed = true;
      if (w.injected) {
        if (approachRouteOf(ai.approach?.routes, PID)?.kind === 'left_inside') tally.applied += 1;
        const oc = ai.cutOutcome;
        const key = `${oc?.outcome ?? 'none'}/${oc?.reason ?? 'null'}`;
        tally.outcomes[key] = (tally.outcomes[key] ?? 0) + 1;
      }
    }
    if (w && (ev.some((e) => e.type === 'DEAD_BALL')
      || ev.some((e) => e.type === 'TOUCH' && e.touches === 3 && e.team === 'A'))) w = null;
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
  assert.ok(injected >= 20, `樣本不足（injected=${injected}）＝這條測試沒有解析力`);
  // 修復前這裡是 22.2%（＝CROSS_RATE 30% 自然骰的區間），遠低於門檻 ⇒ 本測試有鑑別力
  const rate = applied / injected;
  assert.ok(rate >= 0.95, `延遲 30 tick 的生效率 ${(rate * 100).toFixed(1)}%（injected=${injected}）`
    + `——修復前為 22.2%＝CROSS_RATE ${CROSS_RATE * 100}% 自然骰基準`);
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
    const st = cutStateOf(game, ai, PID);
    if (st.open && !doneThisWave) {
      // 在「開著」的隨機一格（用 tick 取模製造分散，維持決定論）注入
      if (guard % 7 === 0) {
        ai.cutCall = { pid: PID, cut: true };
        aiCollectIntents(game, ai, []); // 下一次規劃即消費
        assert.equal(
          approachRouteOf(ai.approach?.routes, PID)?.kind, 'left_inside',
          `cutStateOf 說 open 卻沒生效（tick=${game.tick}）＝名目窗與真實窗又分岔了`,
        );
        assert.equal(ai.cutOutcome?.outcome, 'applied');
        checked += 1;
        doneThisWave = true;
      }
    }
    if (!st.open) doneThisWave = false;
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
    assert.equal(ai.cutCall, null);
    assert.equal(ai.cutOutcome, null);
    stepGame(game, intents);
  }
  assert.ok(guard > 1000, '樣本不足');
});

// ════════ B：一傳不到位就不開窗 ════════
test('B 一傳不到位＝不開窗：passTier 非 perfect 時 open=false、reason=pass', () => {
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

test('C 回饋覆蓋率：cutStateOf 能回的每一個 reason 都有對應文案（不得靜默）', () => {
  // 「沒生效要說出原因」——漏一個 key 就會退回萬用句，玩家又分不出為什麼沒切成。
  for (const reason of ['already', 'nowindow', 'pass', 'nopool', 'locked']) {
    assert.ok(CUT_FEEDBACK[reason]?.text, `reason=${reason} 沒有文案`);
  }
  assert.ok(CUT_FEEDBACK.applied?.text && CUT_FEEDBACK.missed?.text);
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
    if (cutStateOf(game, ai, PID).open) {
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
