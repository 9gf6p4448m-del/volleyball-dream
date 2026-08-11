// 夾塞窗（2026-08-07）— sim 行為守衛（真實路徑、零 mock）
//
// ★ 這一組守的是 sim 行為，不是 UI ★（UI 那半在 tests/tandem-call-ui.test.mjs）
//
// ★ 版本無關化（比照 inside-cut-window.test.mjs 的稽核修正）★
// `tandemStateOf`／`TANDEM_FEEDBACK` 都是本次才新增的 export ⇒ 具名 import 會讓本檔
// 在**修復前的版本**於模組載入階段就 SyntaxError、一條都跑不到＝紅在旁枝錯誤。
// 因此三支新 export 一律走 namespace import，行為斷言吃兩版都有的可觀察量。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, createDefaultTeams } from '../src/sim/game.js';
import * as simAi from '../src/sim/ai.js';
import * as matchLoop from '../src/app/matchLoop.js';
import { approachRouteOf } from '../src/sim/approach.js';
import { isFrontRow } from '../src/sim/rotation.js';

const { createAiState, aiCollectIntents } = simAi;
const PID = 'A4';  // 預設隊型裡的 OPP（DEFAULT_LINEUP 第 4 格）
const OH = 'A2';   // 預設隊型裡的前排 OH——「非 OPP 位置拿不到窗」用它取樣

// ★ 2026-08-11 量測參數：單局 → seed 序列（AI.BLOCK_RETRACT_ON_POOR 1→0 之後）★
// 這是**取樣量**不是行為判準。全域率先驗過（協定步驟 1，40 局／2900+ 波的 A/B）：
// 「A4 當 main 的自動骰夾塞波」佔第二觸窗波數 —— 舊旗標（=1）**1.46%**（42/2879）、
// 新旗標（=0）**1.36%**（40/2951），兩者在雜訊內 ⇒ 現象**沒有被壓死**，
// 純粹是 536000 這一局的期望值（74 波 × 1.36% ≈ 1.0 次）骰到 0。
// 同型前例＝本檔 2026-08-09 那次 500000→536000（rally 流一漂移單點 seed 就歸零）。
// 改法一律是「加樣本」而不是「換一顆剛好會過的 seed」：8 局的期望值 ≈ 8 次，
// 骰到 <1 次的機率可忽略，且對下一次 rally 流位移也活得下來。
const AUTO_TANDEM_SEEDS = [536000, 537000, 538000, 539000, 540000, 541000, 542000, 543000];

function needTandemState() {
  assert.ok(typeof simAi.tandemStateOf === 'function',
    'sim 沒有 tandemStateOf：這一版的夾塞窗沒有「唯一真相」可問，UI 只能自己記時間');
  return simAi.tandemStateOf;
}

// 版本無關的「第二觸窗開著、而且這一波可能排得出我的夾塞」——只吃 rally 的可觀察量
// 與這名球員當下的線別，不呼叫 tandemStateOf。
function windowOpenish(game, ai) {
  const me = game.players?.[PID];
  const r = game.rally;
  if (!me || game.phase !== 'rally' || !r) return false;
  if (r.possession !== me.teamId || r.touches !== 1) return false;
  if (ai.approach?.team !== me.teamId) return false;
  if (ai.attackCombo) return false; // 已經有組合＝不是「還能排」的狀態
  if (approachRouteOf(ai.approach.routes, PID)?.kind !== 'right') return false;
  // 配合者（MB 快攻）必須在這一波的線上——夾塞是兩人的關係
  return !!ai.approach.routes.some((rt) => rt.kind === 'quick');
}

// ════════ A：窗說開，按下去就必生效 ════════
test('A 名目窗＝真實窗：`tandemStateOf.open` 為真的每一 tick，按下去都排成夾塞', () => {
  const tandemStateOf = needTandemState();
  const game = createGame({ seed: 536000, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  let checked = 0;
  let guard = 0;
  let doneThisWave = false;
  while (game.phase !== 'set_over' && checked < 12 && guard < 400000) {
    guard += 1;
    const intents = aiCollectIntents(game, ai, []);
    const open = tandemStateOf(game, ai, PID).open;
    if (open && !doneThisWave) {
      ai.tandemCall = { pid: PID };
      aiCollectIntents(game, ai, []); // 同一 tick 消費
      // 行為斷言：他這一波真的跑夾塞線，而且 combo 記在他名下
      assert.equal(approachRouteOf(ai.approach?.routes, PID)?.kind, 'tandem',
        `tandemStateOf 說 open 卻沒排成（tick=${game.tick}）＝名目窗與真實窗分岔了`);
      assert.equal(ai.attackCombo?.type, 'tandem');
      assert.equal(ai.attackCombo?.mainId, PID);
      assert.equal(ai.tandemOutcome?.outcome, 'applied');
      // 配合者是 MB 快攻，且**他的線一格未動**（誘餌維持湧現式）
      assert.equal(approachRouteOf(ai.approach.routes, ai.attackCombo.partnerId)?.kind, 'quick');
      checked += 1;
      doneThisWave = true;
    }
    if (!open) doneThisWave = false;
    stepGame(game, intents);
    if (ai.tandemOutcome) { ai.tandemCall = null; ai.tandemOutcome = null; }
  }
  assert.ok(checked >= 5, `只驗到 ${checked} 次＝樣本不足`);
});

test('A 延遲 500ms（30 tick，遠超人類反應 150ms）才按，仍然生效', () => {
  // 內切那次的病灶是「名目窗 800ms、真實死線一個 tick」⇒ 真人按的每一次都無效。
  // 夾塞窗一開始就逐 frame 問 sim，但這條要**機械化**地擋住有人日後把它改回計時器。
  const tandemStateOf = needTandemState();
  let injected = 0;
  let applied = 0;
  for (const seed of [500000, 507919, 515838]) {
    const game = createGame({ seed, teams: createDefaultTeams(), setTarget: 25 });
    const ai = createAiState();
    let w = null;
    let guard = 0;
    while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
      guard += 1;
      if (!w && tandemStateOf(game, ai, PID).open) w = { openTick: guard, injected: false };
      if (w && !w.injected && guard >= w.openTick + 30) {
        ai.tandemCall = { pid: PID };
        w.injected = true;
        injected += 1;
      }
      aiCollectIntents(game, ai, []);
      if (w?.injected) {
        if (ai.attackCombo?.type === 'tandem' && ai.attackCombo.mainId === PID) applied += 1;
        ai.tandemCall = null;
        ai.tandemOutcome = null;
        w = null;
      }
      stepGame(game, aiCollectIntents(game, ai, []));
      if (game.rally?.touches !== 1) w = null;
    }
  }
  const rate = injected ? applied / injected : 0;
  assert.ok(rate >= 0.95, `延遲 30 tick 的生效率 ${(rate * 100).toFixed(1)}%`
    + `（applied=${applied}／injected=${injected}）＝真人反應得過來的時點按不出東西`);
  assert.ok(injected >= 20, `樣本不足（injected=${injected}）＝這條測試沒有解析力`);
});

// ════════ B：關窗的三種情形 ════════
test('B 球已舉出去＝窗關：touches 進到 2 之後 open=false、reason=nowindow', () => {
  const tandemStateOf = needTandemState();
  const game = createGame({ seed: 536000, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  let seen = 0;
  let guard = 0;
  while (game.phase !== 'set_over' && seen < 3 && guard < 400000) {
    guard += 1;
    const intents = aiCollectIntents(game, ai, []);
    if (game.phase === 'rally' && game.rally.possession === 'A' && game.rally.touches >= 2) {
      const st = tandemStateOf(game, ai, PID);
      assert.equal(st.open, false);
      assert.equal(st.reason, 'nowindow');
      seen += 1;
    }
    stepGame(game, intents);
  }
  assert.ok(seen >= 2, `樣本不足（${seen}）`);
});

test('B 一傳不到位＝不開窗（reason=tier），硬寫也不生效且誠實回報', () => {
  const tandemStateOf = needTandemState();
  // ★ 本條獨用 seed ★ 它要的是「A4 沒被自動骰排進夾塞」的乾淨窗，與檔內其他測試
  // 要的「A4 常被排進」互相衝突，不能共用 536000。
  // 2026-08-09 第三次換 seed（500000→516000）：前排不撲乾淨重扣的 arbitrate 改動
  // 又讓 rally 流漂移。掃描條件＝openish∧perfect 時 open 窗 tick ≥6 且零異常 reason
  //（516000＝879 tick 全 open）。這檔的 seed 敏感性是已知債——窗測試依賴特定 rally
  // 形態，每次動防守指派都要重掃；要根治得把測試改成合成 rally（另開工）。
  const game = createGame({ seed: 516000, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  let seen = 0;
  let guard = 0;
  while (game.phase !== 'set_over' && seen < 5 && guard < 400000) {
    guard += 1;
    const intents = aiCollectIntents(game, ai, []);
    if (windowOpenish(game, ai) && ai.passTier === 'perfect') {
      assert.equal(tandemStateOf(game, ai, PID).open, true);
      ai.passTier = 'ok';
      const after = tandemStateOf(game, ai, PID);
      assert.equal(after.open, false, '一傳非 perfect 仍然開窗＝按了必無效卻照樣跳鈕');
      assert.equal(after.reason, 'tier');
      // 硬寫進去也不得生效，且要誠實回報 missed（不是靜默失敗）
      ai.tandemCall = { pid: PID };
      aiCollectIntents(game, ai, []);
      assert.notEqual(ai.attackCombo?.type, 'tandem');
      assert.equal(ai.tandemOutcome?.outcome, 'missed');
      assert.equal(ai.tandemOutcome?.reason, 'tier');
      ai.tandemCall = null;
      ai.tandemOutcome = null;
      ai.passTier = 'perfect';
      seen += 1;
    }
    stepGame(game, intents);
  }
  assert.ok(seen >= 3, `樣本不足（${seen}）`);
});

test('B S 已經排了別的組合＝不開窗（reason=locked），不得單方面拆掉別人的組合', () => {
  const tandemStateOf = needTandemState();
  const game = createGame({ seed: 536000, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  let seen = 0;
  let guard = 0;
  while (game.phase !== 'set_over' && seen < 5 && guard < 400000) {
    guard += 1;
    const intents = aiCollectIntents(game, ai, []);
    if (game.phase === 'rally' && game.rally.possession === 'A' && game.rally.touches === 1
      && ai.approach?.team === 'A' && ai.attackCombo
      && !(ai.attackCombo.type === 'tandem' && ai.attackCombo.mainId === PID)) {
      const st = tandemStateOf(game, ai, PID);
      assert.equal(st.open, false);
      assert.equal(st.reason, 'locked');
      seen += 1;
    }
    stepGame(game, intents);
  }
  assert.ok(seen >= 2, `樣本不足（${seen}）`);
});

test('B 本波本來就是我的夾塞＝reason=done，按下去記成成功（already）不是失敗', () => {
  const tandemStateOf = needTandemState();
  let seen = 0;
  // 取樣跨 8 局（AUTO_TANDEM_SEEDS，理由見檔頭常數）——行為斷言一格未動
  for (const seed of AUTO_TANDEM_SEEDS) {
    if (seen >= 2) break;
    const game = createGame({ seed, teams: createDefaultTeams(), setTarget: 25 });
    const ai = createAiState();
    let guard = 0;
    while (game.phase !== 'set_over' && seen < 2 && guard < 400000) {
      guard += 1;
      const intents = aiCollectIntents(game, ai, []);
      if (ai.attackCombo?.type === 'tandem' && ai.attackCombo.mainId === PID
        && game.rally.touches === 1) {
        assert.equal(tandemStateOf(game, ai, PID).reason, 'done');
        ai.tandemCall = { pid: PID };
        aiCollectIntents(game, ai, []);
        assert.equal(ai.tandemOutcome?.outcome, 'applied');
        assert.equal(ai.tandemOutcome?.reason, 'already');
        ai.tandemCall = null;
        ai.tandemOutcome = null;
        seen += 1;
      }
      stepGame(game, intents);
    }
  }
  assert.ok(seen >= 1, `樣本不足（${seen}）——自動骰 25% 該掃得到`);
});

// ════════ C：位置與決定論 ════════
test('C 非 OPP 位置拿不到窗：同一波拿前排 OH 去問，永遠 open=false', () => {
  const tandemStateOf = needTandemState();
  const game = createGame({ seed: 536000, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  let sampled = 0;
  let oppOpen = 0;
  let guard = 0;
  while (game.phase !== 'set_over' && guard < 400000) {
    guard += 1;
    const intents = aiCollectIntents(game, ai, []);
    const rot = game.match.rotations.A;
    if (game.phase === 'rally' && rot.includes(OH) && isFrontRow(rot, OH)) {
      assert.equal(tandemStateOf(game, ai, OH).open, false,
        'OH 也開得出夾塞窗＝這條線不再是 OPP 專屬（sim 層的 mainKind 閘破了）');
      sampled += 1;
    }
    if (tandemStateOf(game, ai, PID).open) oppOpen += 1;
    stepGame(game, intents);
  }
  assert.ok(sampled >= 1000, `樣本不足（${sampled}）`);
  // ★非恆假否證★ 同一場裡 OPP 確實開得出窗——否則上面那條只是「誰都開不出來」
  assert.ok(oppOpen > 0, 'OPP 整場零開窗＝上面那條 OH 斷言沒有鑑別力');
});

test('C 決定論護欄：AI 對局（沒有人按）整場零觸發——tandemCall／tandemOutcome 恆為 null', () => {
  // 這條轉紅代表有人在 sim 內部預寫了玩家指令，那會讓 AI 對局漂移。
  // 逐值不變的正式證據＝tools/sim-hash-probe.mjs；本測試是它的常駐廉價版。
  const game = createGame({ seed: 536000, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
    guard += 1;
    const intents = aiCollectIntents(game, ai, []);
    assert.ok(ai.tandemCall == null, 'AI 對局出現 tandemCall＝有人在 sim 內部預寫玩家指令');
    assert.ok(ai.tandemOutcome == null, 'AI 對局出現 tandemOutcome＝結算被無條件觸發');
    stepGame(game, intents);
  }
  assert.ok(guard > 1000, '樣本不足');
});

test('C 只管這一波：窗一結束 sim 就把 tandemCall 清掉（不跨波強制夾塞）', () => {
  const tandemStateOf = needTandemState();
  const game = createGame({ seed: 536000, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  let checked = 0;
  let pressed = false;
  let guard = 0;
  while (game.phase !== 'set_over' && checked < 3 && guard < 400000) {
    guard += 1;
    if (!pressed && tandemStateOf(game, ai, PID).open) {
      ai.tandemCall = { pid: PID };
      pressed = true;
    }
    stepGame(game, aiCollectIntents(game, ai, []));
    // 按過之後：窗一離開（球舉出去／球權易主／死球）就必須在有限 tick 內被清掉。
    // `applyTandemCall` 自己不清（同 cutCall）——清空點在 ensureFlightPlan 的兩個分支，
    // 少了它一次按壓會殘留到同一 rally 的後續每一波。
    if (pressed && !(game.phase === 'rally' && game.rally?.possession === 'A'
      && game.rally.touches === 1)) {
      let inner = 0;
      while (ai.tandemCall && inner < 600 && game.phase !== 'set_over') {
        inner += 1;
        stepGame(game, aiCollectIntents(game, ai, []));
      }
      assert.equal(ai.tandemCall, null,
        '窗關之後 600 tick（10 秒）指令還在＝一次按壓會殘留到下一波，變成強制夾塞');
      checked += 1;
      pressed = false;
    }
  }
  assert.ok(checked >= 2, `樣本不足（${checked}）`);
});

// ════════ E：組合獎金的受益者（覆審 MEDIUM-4b，Sawmah 裁定丙）════════
//
// ★★ 為什麼這裡需要一組專屬測試：`tools/sim-hash-probe.mjs` 對這條改動**零鑑別力** ★★
//   那支探針跑的是 AI vs AI（`aiCollectIntents(g, ai)`，excludeIds 為空），而
//   `applyRouteCommit` 第一行就是護欄 C「excludeIds 為空即 return」⇒ 那條路徑上
//   `comboAssist` **從頭到尾不會被寫**，雜湊當然不動。拿它當「沒漂移」的證據是假的。
//   真正的證據在下面兩條：受控玩家在場時，AI 路徑逐值同舊、玩家叫的夾塞才改變。
//
// 治具：受控玩家的走位由 AI 代打（真人在測試裡不會動），但 `excludeIds` 仍非空
// ⇒ `applyRouteCommit` 真的會記帳。兩次 `aiCollectIntents` 的分工：
//   第一次帶 [pid]＝觸發記帳；第二次帶 []＝取十二人份 intent 餵 sim。
//
// ★★ 2026-08-07 覆審①修正：以「波」為單位計數，不是以「tick」★★
// 舊版判「有沒有新發放」用 `a !== prev`（`a` = `game.rally.comboAssist`）。但
// `ai.js:1457` 的 `r.comboAssist = { pid, team }` **每個記帳 tick 都重建新物件**
// （同一個 decoyId 也不例外），所以 `a !== prev` 對「同一波的發放持續了幾個 tick」
// 完全恆真──實測 E1 的「619 筆」其實只有 **18 個不同的波**、E2 過濾後只有 **7 個**。
// 修法：改用 `ai.routeCommit` 的物件參照當「波」的鍵——`ai.js:1380-1385` 的注解
// 自己講得很白：`routeCommit` 只在「新的一波開帳」時才整份重建（`r.comboAssist = null`
// 也是同一行清的），其餘 tick 原物件原封不動地重複使用，窗內不會 churn（不重蹈
// `flightId` 每次擊球 +1 的覆轍）。同一波內只認第一次出現的 pid──`replanWithoutRunners`
// 理論上可能在同一波內換一次誘餌，此時 pid 改變也要算一次新發放。
function playWithControlled(seed, pid, { press = false } = {}) {
  const tandemStateOf = needTandemState();
  const game = createGame({ seed, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  const grants = [];
  let prevWave = null;
  let prevGrantPid = null;
  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
    guard += 1;
    if (press && !ai.tandemCall && tandemStateOf(game, ai, pid).open) ai.tandemCall = { pid };
    aiCollectIntents(game, ai, [pid]);
    const intents = aiCollectIntents(game, ai, []);
    const a = game.rally.comboAssist;
    // ⚠ 只在「真的換了一顆非 null 的新帳」時重置 ⚠ `ai.routeCommit` 在死球／來球分支
    // （ai.js ensureFlightPlan）會被清成 null，但 `game.rally.comboAssist` **不在那兩個
    // 分支的清空清單裡**（它只在 applyRouteCommit 重開帳那一行才清）——兩者不同步。
    // 若這裡改成 `ai.routeCommit !== prevWave`（含 null）：routeCommit 變 null 的那一
    // tick 會把 `prevGrantPid` 也重置成 null，而 `comboAssist` 這時還沒被清（stale，
    // 上一波的殘值）⇒ 誤判成「新發放」，把 attackCombo／attackerId 全為 null 的殘影
    // 錯記成一筆（實測 debug：出現 pid='A3' 但 attackCombo/attackerId/routeCommit
    // 皆為 null 的假發放）。這在真實產品路徑無害（沒人在死球窗讀 comboAssist，settlePoint
    // 消費的是本波已結清的值），純粹是本治具逐 tick 硬讀才會踩到——排除法：只認非 null
    // 的換帳。
    if (ai.routeCommit && ai.routeCommit !== prevWave) {
      prevWave = ai.routeCommit;
      prevGrantPid = null; // 新的一波開帳＝上一波的候選作廢（同 ai.js:1382-1385 的規則）
    }
    if (a && a.pid !== prevGrantPid) {
      grants.push({
        pid: a.pid,
        partnerId: ai.attackCombo?.partnerId ?? null,
        mainId: ai.attackCombo?.mainId ?? null,
        attackerId: ai.attackerId ?? null,
      });
      prevGrantPid = a.pid;
    }
    stepGame(game, intents);
  }
  return grants;
}

test('E ★AI 路徑逐值同舊★ 沒人按夾塞時，獎金受益者恆等於 `attackCombo.partnerId`', () => {
  // 舊碼寫死 partnerId。自動排程的 `mainId` 恆等於 `attackerId` ⇒ 兩人裡不是攻擊手的
  // 那個就是 partner ⇒ 新舊寫法在這條路上必須逐筆同值。這條紅＝改動漏進了 AI 路徑。
  const grants = [
    ...playWithControlled(500000, 'A3'),
    ...playWithControlled(507919, 'A3'),
    ...playWithControlled(515838, 'A6'),
  ];
  // ★ 門檻依實測真值重訂（2026-08-07，debug 後 2026-08-08 修正一次）★ 這三個 seed 是
  // 固定的（零 rng 分岔），波數因此是決定論值：修好「換帳只認非 null」那個假發放
  // 之後，3 個 seed 實測合計 **9 波**（治具腳本已刪，數字取自實跑輸出，非估算）。
  // 門檻訂在 6（留給日後平衡微調的餘裕，但仍能守住「發放收窄到只剩一兩個持續 tick
  // 的波」不會被錯放行）。
  assert.ok(grants.length >= 6, `獎金發放樣本只有 ${grants.length} 波＝這條沒有解析力`);
  for (const g of grants) {
    assert.equal(g.mainId, g.attackerId,
      `自動排程竟出現 mainId(${g.mainId})≠attackerId(${g.attackerId})＝前提被打破`);
    assert.equal(g.pid, g.partnerId,
      `受益者 ${g.pid} 不是 partnerId ${g.partnerId}＝AI 路徑被改動漏到了`);
  }
});

test('E ★裁定丙★ 玩家自己叫的夾塞：獎金發給實際跑誘餌線的他，不是寫死的 partnerId', () => {
  // 玩家叫的夾塞不改球權 ⇒ 實測 73.0%（159 波裡 116 波）的波 `mainId !== attackerId`：功能上的誘餌是
  // 玩家（他跑夾塞線拉牆）、舊碼的受益者卻是 MB（AI，拿不到 jumped）⇒ 零回報。
  // 舊碼在這條路上會產出 **0 筆** 符合下面條件的紀錄（那才是它的病）。
  const grants = [
    ...playWithControlled(500000, 'A4', { press: true }),
    ...playWithControlled(507919, 'A4', { press: true }),
    ...playWithControlled(515838, 'A4', { press: true }),
  ];
  const mine = grants.filter((g) => g.mainId === 'A4' && g.attackerId !== 'A4' && g.pid === 'A4');
  // ★ 門檻依實測真值重訂（2026-08-07，debug 後 2026-08-08 修正一次）★ 以波為單位
  // 重算、且修好假發放之後，這三個固定 seed 合計總發放 **7 波、全部符合「mine」**
  // （這三個 seed 沒有出現「A4 剛好也是本波攻擊手」的樣本，故 mine===total）。
  // 門檻訂在 4，留給日後平衡微調的餘裕，但仍能守住「這條路徑萎縮到只剩一兩波」
  // 不會被錯放行。
  assert.ok(mine.length >= 4,
    `玩家跑了夾塞誘餌線卻只拿到 ${mine.length} 波獎金`
    + `（總發放 ${grants.length} 波：${grants.map((g) => `${g.pid}/main=${g.mainId}/atk=${g.attackerId}`).slice(0, 8).join('，')}）`
    + '——舊碼寫死 partnerId 時這裡恆為 0');
  // 反面：受益者不得是本波的攻擊手（他拿的是既有的 KILL，不重複賺）
  for (const g of grants) {
    assert.notEqual(g.pid, g.attackerId, `獎金發給了本波攻擊手 ${g.pid}＝重複賺`);
  }
});

// ════════ D：文案覆蓋率（實跑收集，不抄表） ════════
//
// ★★ 2026-08-07 覆審 MEDIUM-3：這張表有**兩條取用路徑**，key 集合不同 ★★
//   ① `onTandemTap`（窗關才點到）→ 讀 `tandemStateOf` 的**原始 reason**（含 `done`）
//   ② 幀端結算 → 讀 `applyTandemCall` 記下的 outcome/reason（`done` 被映成 `already`）
//   舊版這條測試只收 ①、卻套一張 `KEY_OF = { done:'already' }` 把 done 映走
//   ⇒ 表裡沒有 `done` 也綠、補上 `done` 反而紅。**那張映射表把洞藏起來還禁止補洞。**
//   新形狀：兩條路徑各跑一臂、各收一份集合，聯集才是「印得出來的 key」。
test('D 回饋覆蓋率：兩條路徑各自的 reason 都有文案，且表裡沒有印不出來的死文案', () => {
  const tandemStateOf = needTandemState();
  const TANDEM_FEEDBACK = matchLoop.TANDEM_FEEDBACK;
  assert.ok(TANDEM_FEEDBACK, 'matchLoop 沒有匯出 TANDEM_FEEDBACK：這一版沒有夾塞結算回饋');
  const SEEDS = [500000, 507919, 515838];

  // ---- 臂 ①：`onTandemTap` 路徑（純觀察，不寫任何指令欄位）----
  const tapSeen = new Set();
  for (const seed of SEEDS) {
    const game = createGame({ seed, teams: createDefaultTeams(), setTarget: 25 });
    const ai = createAiState();
    let guard = 0;
    while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
      guard += 1;
      const intents = aiCollectIntents(game, ai, []);
      // 取樣範圍＝`onTandemTap` 的觀眾（在場的前排 OPP 在 rally 中的任何一格）——
      // 刻意不限定 touches===1：鈕過期到下一個 rAF 收掉之間點下去正是 nowindow 的可達路徑
      const rot = game.match.rotations.A;
      if (game.phase === 'rally' && rot.includes(PID) && isFrontRow(rot, PID)) {
        const st = tandemStateOf(game, ai, PID);
        if (!st.open && st.reason) tapSeen.add(st.reason);
      }
      stepGame(game, intents);
    }
  }

  // ---- 臂 ②：`applyTandemCall` 路徑（真的按下去，讀它記了什麼）----
  // 一波按一次（不論窗開不開），把 outcome→文案 key 的實際映射收集起來。
  const latchSeen = new Set();
  for (const seed of SEEDS) {
    const game = createGame({ seed, teams: createDefaultTeams(), setTarget: 25 });
    const ai = createAiState();
    let guard = 0;
    while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
      guard += 1;
      const rot = game.match.rotations.A;
      if (!ai.tandemCall && game.phase === 'rally' && rot.includes(PID)
        && isFrontRow(rot, PID)) {
        ai.tandemCall = { pid: PID };
      }
      aiCollectIntents(game, ai, []);
      const oc = ai.tandemOutcome;
      if (oc) {
        // 與 matchLoop 幀端逐字相同的取 key 方式
        latchSeen.add(oc.outcome === 'applied' ? (oc.reason ?? 'applied') : (oc.reason ?? 'missed'));
        ai.tandemCall = null;
        ai.tandemOutcome = null;
      }
      stepGame(game, aiCollectIntents(game, ai, []));
    }
  }

  const seen = new Set([...tapSeen, ...latchSeen]);
  assert.ok(tapSeen.size >= 4, `臂①只收集到 ${tapSeen.size} 種 reason＝樣本不足`);
  assert.ok(latchSeen.size >= 3, `臂②只收集到 ${latchSeen.size} 種 key＝樣本不足`);
  // ★ 兩條路徑真的不同 ★ 這一條就是舊版 KEY_OF 藏起來的事實
  assert.ok(tapSeen.has('done'),
    '臂①收不到 done＝取樣沒覆蓋「本波本來就排了我的夾塞」，這條失去解析力');
  assert.ok(latchSeen.has('already'),
    '臂②收不到 already＝applyTandemCall 的 done→already 映射沒被走到');
  assert.ok(!latchSeen.has('done'),
    '臂②竟然收到 done＝applyTandemCall 沒有做 done→already 映射，兩條路的分工被打破');

  for (const key of seen) {
    assert.ok(TANDEM_FEEDBACK[key]?.text,
      `實跑會出現 key=${key}，但 TANDEM_FEEDBACK 沒有對應文案＝玩家會看到萬用句`
      + `（臂①：${[...tapSeen].sort().join('／')}；臂②：${[...latchSeen].sort().join('／')}）`);
  }
  // 'missed'＝`??` 的預設臂，不由任何一條路徑產生
  const EXEMPT = new Set(['missed']);
  for (const key of Object.keys(TANDEM_FEEDBACK)) {
    if (EXEMPT.has(key)) continue;
    assert.ok(seen.has(key),
      `TANDEM_FEEDBACK.${key} 在兩條路徑的實跑取樣裡都沒出現過＝死文案，該刪`
      + `（實際收集到：${[...seen].sort().join('／')}）`);
  }
  // 成功與失敗必須是**不同**的句子（假陽性回饋就是兩者混同造成的）
  assert.notEqual(TANDEM_FEEDBACK.applied.text, TANDEM_FEEDBACK.tier.text);
  // ★ 假陰性防線（MEDIUM-3 的病灶本體）★ done 不得落到 `?? missed` 的萬用句
  assert.notEqual(TANDEM_FEEDBACK.done.text, TANDEM_FEEDBACK.missed.text);
});
