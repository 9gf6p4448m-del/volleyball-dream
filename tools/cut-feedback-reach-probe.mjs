// 內切回饋可達性探針（08-07，MEDIUM-1）—— **零 `src/` 改動**
//
// 問題：`CUT_FEEDBACK`（matchLoop.js:1926）有七句文案，但 `onCutTap` 先問
// `cutStateOf(...).open` 才寫 `cutCall`，而 DOM click 跑在兩個 rAF 之間
// ⇒ 消費 tick 的 game 狀態與顯示時逐值相同 ⇒ `applyCutCall` 幾乎恆走 'applied'。
// 要決定「哪幾句是真的不可達（刪掉）、哪幾句該讓它可達」——用實測，不用讀碼推論。
//
// ★ 不重刻被測邏輯 ★ 判斷式全部走真實的 `cutStateOf`（ai.js:1005）與真實的
//   `applyCutCall`（由 `aiCollectIntents` 內部呼叫）。本檔只複製 `onCutTap` 那一行
//   賦值（`aiState.cutCall = { pid, cut: true }`），它本身不含任何判斷。
//
// ── 臂 ──────────────────────────────────────────────────
//   ui        現行 UI 路徑：窗一開就按（tap 落在 tick 邊界，下一 tick 消費）
//   ui-dN     同上但**開窗後第 N 個 tick 才按**（模擬慢一點的手／一幀跑好幾個 sim tick）
//   noguard   拿掉 `onCutTap` 的 `.open` 守衛：只要是前排 OH 且在 rally 就每 tick 寫一次
//             ＝「若鈕永遠在畫面上」會發生什麼。⚠ 這條臂有**遮蔽假象**：`applyCutCall`
//             同一 flight 只結算一次，而本臂從 rally 第一 tick 就開始按 ⇒ 幾乎每筆都被
//             touches!==1 的 'nowindow' 先佔走，後面的 pass/nopool/locked 永遠輪不到。
//   inwindow  只在**第二觸窗內**（我方持球且 touches===1）按、但不問 `.open`——
//             拆掉上面的遮蔽。⚠ 仍有殘餘遮蔽：本臂從窗的第一 tick 就按，窗中途才
//             出現的 locked（S 改排組合線）永遠輪不到結算。
//   observe   **完全不按**，只逐 tick 記 `cutStateOf(...).reason` 的分佈——
//             零遮蔽，回答「UI 有可能顯示哪幾句」的最終依據
//
// 用法：node tools/cut-feedback-reach-probe.mjs [局數=12]
import { createGame, stepGame, createDefaultTeams } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, cutStateOf } from '../src/sim/ai.js';
import { isFrontRow } from '../src/sim/rotation.js';
import { createCareer, createCareerPlayer, careerMatchSetup } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';

const SETS = Number.parseInt(process.argv[2] ?? '12', 10);
const MAX_TICKS = 400000;
const PID = 'A2';
const ARMS = ['ui', 'ui-d1', 'ui-d3', 'ui-d10', 'noguard', 'inwindow', 'observe'];

function optsFor(mode, run) {
  if (mode === 'career') {
    const career = createCareer({ seed: 700000 + run * 7919, playerName: '探針' });
    const player = createCareerPlayer('探針');
    const roster = { capacity: 12, members: buildStarterMembers() };
    const entry = { id: 'group-3', stage: 'group', opponentId: 'north-tech', label: '' };
    const setup = careerMatchSetup(career, player, entry, roster, null);
    return {
      seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
      liberos: setup.liberos, setTarget: 25,
      ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
      ...(setup.benches ? { benches: setup.benches } : {}),
    };
  }
  return { seed: 500000 + run * 7919, teams: createDefaultTeams(), setTarget: 25 };
}

// UI 層的「這顆鈕給誰看」條件（matchLoop.js:2141-2146）——位置檢查留在 UI，
// 戰術判斷一律問 sim（`cutStateOf`），本檔不重刻後者
function uiEligible(game, playerId) {
  const me = game.players[playerId];
  const rot = game.match.rotations[me?.teamId];
  return !!me && me.currentRole === 'outside' && !!rot && rot.includes(playerId)
    && isFrontRow(rot, playerId);
}

function runOne(mode, run, arm) {
  const game = createGame(optsFor(mode, run));
  const ai = createAiState();
  const delay = arm.startsWith('ui-d') ? Number(arm.slice(4)) : 0;
  const noguard = arm === 'noguard';
  const inwindow = arm === 'inwindow';
  const observe = arm === 'observe';
  const tally = { taps: 0, outcomes: {}, opened: 0 };
  let openSince = null;      // 本 flight 的窗第一次開在哪個 tick
  let openFlight = null;
  let tappedFlight = null;
  let seenOutcome = null;
  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
    guard += 1;
    const fid = game.rally?.flightId ?? null;
    // ── tap（發生在兩個 sim tick 之間＝真實 DOM click 的時點）──
    if (game.phase === 'rally' && uiEligible(game, PID)) {
      if (observe) {
        const r = game.rally;
        if (r.possession === game.players[PID].teamId && r.touches === 1) {
          const st = cutStateOf(game, ai, PID);
          const k = `state/${st.open ? 'OPEN' : st.reason}`;
          tally.outcomes[k] = (tally.outcomes[k] ?? 0) + 1;
          tally.taps += 1;
        }
      } else if (noguard) {
        ai.cutCall = { pid: PID, cut: true };
        tally.taps += 1;
      } else if (inwindow) {
        const r = game.rally;
        if (r.possession === game.players[PID].teamId && r.touches === 1) {
          ai.cutCall = { pid: PID, cut: true };
          tally.taps += 1;
        }
      } else if (cutStateOf(game, ai, PID).open) {
        if (openSince === null || openFlight !== fid) {
          openSince = guard; openFlight = fid; tally.opened += 1;
        }
        if (tappedFlight !== fid && guard - openSince >= delay) {
          ai.cutCall = { pid: PID, cut: true };
          tappedFlight = fid;
          tally.taps += 1;
        }
      } else if (openFlight !== fid) {
        openSince = null;
      }
    }
    stepGame(game, aiCollectIntents(game, ai, []));
    const oc = ai.cutOutcome;
    if (oc && oc.pid === PID && seenOutcome !== `${oc.flightId}|${oc.outcome}|${oc.reason}`) {
      seenOutcome = `${oc.flightId}|${oc.outcome}|${oc.reason}`;
      const key = `${oc.outcome}/${oc.reason ?? 'null'}`;
      tally.outcomes[key] = (tally.outcomes[key] ?? 0) + 1;
    }
  }
  return tally;
}

console.log(`內切回饋可達性：每格 ${SETS} 局`);
for (const mode of ['quick', 'career']) {
  console.log(`\n=== ${mode === 'quick' ? '快速比賽（OH）' : '生涯模式（第 1 屆小組賽）'} ===`);
  for (const arm of ARMS) {
    const agg = { taps: 0, outcomes: {} };
    for (let r = 0; r < SETS; r += 1) {
      const t = runOne(mode, r, arm);
      agg.taps += t.taps;
      for (const [k, v] of Object.entries(t.outcomes)) agg.outcomes[k] = (agg.outcomes[k] ?? 0) + v;
    }
    const rows = Object.entries(agg.outcomes).sort((a, b) => b[1] - a[1]);
    const total = rows.reduce((a, b) => a + b[1], 0);
    console.log(`  ${arm.padEnd(9)} 按下 ${String(agg.taps).padStart(5)} 次｜結算 ${String(total).padStart(5)} 筆｜`
      + (rows.length ? rows.map(([k, v]) => `${k}=${v}`).join('  ') : '（無）'));
  }
}
