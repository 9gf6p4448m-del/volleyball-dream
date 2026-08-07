// 內切浮鈕的 UI 層（2026-08-07 稽核裁定 B ＋ MEDIUM 1/2/3）
//
// ★ 這一組守的是 UI 行為，sim 零改動 ★（sim 那半在 tests/inside-cut-window.test.mjs）
// 每一條都附「修前會怎樣」的實測數字，方便下一個人判斷這條有沒有鑑別力。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, stepGame, createDefaultTeams } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, cutStateOf } from '../src/sim/ai.js';
import {
  CUT_FEEDBACK, CUT_BUTTON_STATES, onCutTap, captureCutOutcome,
} from '../src/app/matchLoop.js';

const PID = 'A2';
const SRC = readFileSync(new URL('../src/app/matchLoop.js', import.meta.url), 'utf8');

// floatText 的最小樁：onCutTap／幀端回饋只用到 show()，不碰 DOM
function stubStage() {
  const shown = [];
  return { shown, stage: { floatText: { show: (text, color) => shown.push({ text, color }) } } };
}

// ════════ MEDIUM-1：七種回饋只有一種按得出來 ════════
//
// 實測（tools/cut-feedback-reach-probe.mjs，快速比賽＋生涯各 12 局）：
//   · 走真實 UI 路徑（窗開才按，delay 0/1/3/10 tick 四種）＝**181 次全部 applied**，
//     其餘六句一次都沒出現過——`onCutTap` 先問 `.open` 才寫 cutCall，而 DOM click
//     跑在兩個 rAF 之間、期間沒有 sim tick，所以消費時的狀態與顯示時逐值相同。
//   · observe 臂（不按、只逐 tick 記 `cutStateOf` 的 reason，40,220 筆）：
//     OPEN 41.9%／pass 30.9%／done 20.6%／locked 5.5%／nowindow 1.1%、**nopool 0**。
// 處置：`nopool` 刪（前排 OH 恆在攻擊池裡＝那句永遠印不出來）；
//       其餘四句**改成按得到**——鈕過期到下一個 rAF 收掉之間點下去，
//       舊制是靜默 return（按了一顆看得見的鈕、畫面毫無反應），現在把原因說出來。
test('MEDIUM-1 過期鈕：窗已關時按下去要說出原因，不得靜默', () => {
  const game = createGame({ seed: 500000, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  const seen = new Set();
  let guard = 0;
  while (game.phase !== 'set_over' && guard < 200000 && seen.size < 3) {
    guard += 1;
    const st = cutStateOf(game, ai, PID);
    if (!st.open && st.reason) {
      const { shown, stage } = stubStage();
      onCutTap({ game, aiState: ai, playerId: PID, stage });
      assert.equal(shown.length, 1,
        `窗關（reason=${st.reason}）時按下去沒有任何回饋＝玩家按了一顆看得見的鈕、畫面毫無反應`);
      assert.equal(shown[0].text, (CUT_FEEDBACK[st.reason] ?? CUT_FEEDBACK.missed).text);
      // ★ 窗外絕不得寫 cutCall ★ `ensureFlightPlan` 只在「不在第二觸窗」的規劃 tick
      //   清它 ⇒ 窗外寫進去會殘留到下一波、變成玩家沒要求的強制內切（比靜默更糟）
      assert.equal(ai.cutCall, null, '窗外按下去竟然寫了 cutCall＝下一波會被強制內切');
      seen.add(st.reason);
    }
    stepGame(game, aiCollectIntents(game, ai, []));
  }
  assert.ok(seen.size >= 2, `只掃到 ${seen.size} 種關窗原因＝樣本不足`);
});

test('MEDIUM-1 死文案：CUT_FEEDBACK 不得留下 nopool（前排 OH 恆在攻擊池裡）', () => {
  assert.equal(CUT_FEEDBACK.nopool, undefined,
    'nopool 在 40,220 筆實跑取樣裡是 0——留著就是死碼');
  // 未知 reason 的保底臂仍在（它不是死碼，是 `??` 的預設值）
  assert.ok(CUT_FEEDBACK.missed?.text);
});

// ════════ MEDIUM-2：窗末按下時成功回饋被 sim 自己清掉 ════════
//
// 實測（本檔下方的重現迴圈同一條路徑）：
//   · **窗一開就按**：`aiState.cutOutcome` 活 84–91 個 sim tick（p50 88）——看得到。
//   · **窗的最後一 tick 才按**（＝真人反應過來的時點）：壽命 **恰好 1 tick，16/16 皆然**
//     ⇒ 一幀只要跑 ≥2 個 sim tick（30Hz 螢幕、任何掉幀都是），UI 那一次 rAF 取樣
//     就整筆錯過，內切**有生效**但玩家一個字都看不到。
// 修法：取樣點從「每幀一次」下放到「每個 sim tick 一次」（stepSim 內的 captureCutOutcome）。
test('MEDIUM-2 鎖存：sim 把 cutOutcome 清掉之後，回饋仍留得住', () => {
  // 修法本身＝取樣頻率。這條驗它的**結果**：sim 的即時值歸零之後，鎖存還拿得出來。
  // （修前幀端讀的就是那個即時值 ⇒ 幀界落在清除之後就整筆看不到。）
  const game = createGame({ seed: 500000, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  const s = { game, aiState: ai, playerId: PID, cutFeedbackDone: false, cutOutcomeLatch: null };
  let tapped = null;
  let checked = 0;
  let sawLive = false;
  let guard = 0;
  while (game.phase !== 'set_over' && guard < 200000 && checked < 3) {
    guard += 1;
    if (tapped == null && cutStateOf(game, ai, PID).open) {
      ai.cutCall = { pid: PID, cut: true };
      s.cutFeedbackDone = false;
      s.cutOutcomeLatch = null;
      tapped = game.rally.flightId;
      sawLive = false;
    }
    stepGame(game, aiCollectIntents(game, ai, []));
    captureCutOutcome(s);   // ← 每個 sim tick 取樣一次（生產端在 stepSim 迴圈裡做同一件事）
    if (tapped != null) {
      if (ai.cutOutcome?.pid === PID) sawLive = true;
      else if (sawLive) {
        // sim 已經清掉了——這一刻正是「幀界落在這裡就看不到」的那一刻
        assert.ok(s.cutOutcomeLatch, 'sim 清掉 cutOutcome 之後鎖存也空了＝窗末按下的回饋照樣消失');
        assert.equal(s.cutOutcomeLatch.pid, PID);
        assert.ok(CUT_FEEDBACK[s.cutOutcomeLatch.reason ?? 'applied']?.text, '鎖存到的結算沒有對應文案');
        checked += 1;
        s.cutFeedbackDone = true;
        s.cutOutcomeLatch = null;
        ai.cutCall = null;
        tapped = null;
      }
    }
  }
  assert.ok(checked >= 2, `只驗到 ${checked} 次＝樣本不足`);
});

test('MEDIUM-2 取樣點在 sim 迴圈內：stepSim 每個 tick 呼叫 captureCutOutcome', () => {
  // 這條守的是**取樣頻率**這件事本身：把 captureCutOutcome 搬回幀端就轉紅。
  const stepSimBody = SRC.slice(SRC.indexOf('function stepSim(s) {'),
    SRC.indexOf('// MEDIUM-2 的鎖存端'));
  assert.match(stepSimBody, /captureCutOutcome\(s\)/,
    'stepSim 的 sim 迴圈裡沒有 captureCutOutcome＝取樣又回到每幀一次');
  // 幀端讀的必須是鎖存，不是 sim 的即時值（後者壽命短於一個 rAF）
  assert.match(SRC, /const cutOc = s\.cutOutcomeLatch;/,
    '幀端又改回讀 s.aiState.cutOutcome＝窗末按下的回饋會再度消失');
});

// ════════ MEDIUM-3：回放期間鈕不消失也不過期 ════════
//
// 修前：`frameStep` 在 `if (s.replay) { …; return; }` 就退場，而兩個內切區塊都排在
// 其後 ⇒ 窗內按 🎬（matchStage.js，回放鈕全程常駐、無窗界）→ sim 凍結、浮鈕留在
// 畫面上且 handler 仍活，想看多久都行再回來按。
// 修後：replay 分支在 return 之前先把鈕收掉（`hide()` 同時把 onTap 設回 null）。
test('MEDIUM-3 回放期間：replay 分支必須在 return 之前收掉內切鈕', () => {
  const i = SRC.indexOf('if (s.replay) {');
  assert.ok(i > 0, 'frameStep 的 replay 分支不見了');
  const branch = SRC.slice(i, SRC.indexOf('runReplayFrame(s, now, delta);', i));
  assert.match(branch, /stage\.cutButton\??\.hide\(\)/,
    '回放分支沒有收掉內切鈕——窗內按 🎬 之後鈕會留在畫面上而且按得到');
  // 收鈕必須排在 return 之前（排在後面等於沒寫）
  assert.ok(/stage\.cutButton\??\.hide\(\)/.test(branch));
});

// ════════ 裁定 B：「球要給你了」兩態鈕 ════════
//
// 依據（實測）：開窗那一刻 `aiState.attackerId` 已是已知量，與最終扣球者一致率 96.8%
// （239/247）；預測「給我」時 94.4% 準、預測「不給我」時 0/104 從沒變成他。
test('B 兩態鈕：兩態必須真的不一樣，且都不是 sim 改動', () => {
  const { idle, mine } = CUT_BUTTON_STATES;
  assert.ok(idle?.key && mine?.key);
  assert.notEqual(idle.key, mine.key, 'key 相同＝setVariant 的冪等閘會把換態整個吃掉');
  assert.notEqual(idle.label, mine.label);
  assert.notEqual(idle.bg, mine.bg, '兩態的底色相同＝夜賽場景裡看不出換過');
  assert.match(mine.label, /內切/, '「球要給你了」態不能把這顆鈕在做什麼弄丟');
  // 繁體中文、不得混進英文代號
  for (const v of [idle.label, mine.label]) assert.doesNotMatch(v, /[A-Za-z]{3,}/);
});

test('B 兩態鈕的資料源＝aiState.attackerId（不是等球舉出來才知道）', () => {
  assert.match(SRC, /s\.aiState\.attackerId === s\.playerId\s*\n?\s*\?\s*CUT_BUTTON_STATES\.mine/,
    '兩態的判準不是 attackerId＝這顆鈕沒有在說「這球給你」');
  // sim 零改動：兩態只是 UI 的 setVariant，不得回頭寫任何 aiState 欄位
  const block = SRC.slice(SRC.indexOf('if (stage.cutButton && !s.replay) {'),
    SRC.indexOf('// MEDIUM-2：讀**鎖存**'));
  // `=[^=]` 才是賦值——`===` 是比較（`s.aiState.attackerId === s.playerId` 正是判準本身）
  assert.doesNotMatch(block, /s\.aiState\.\w+\s*=[^=]/, '內切鈕區塊寫了 aiState＝裁定 B 要求 sim 零改動');
});
