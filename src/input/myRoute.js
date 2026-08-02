// Phase 5 W1 收尾（07-29）— 受控者「我這球跑哪條線」的資料面
// （沿 attackZones／blockRead／setOptions 的純函式範式：讀 game／aiState，不寫回）
//
// 起因＝W1 §12 驗收第 6 項的缺口，但**成因被誤判過一次**，兩段都記在這裡免得重犯：
//   誤判：受控者「不跑自己的助跑線」（只有 1.7% 的 tick 在動）⇒ 想把輸入層的自動
//         帶位目標從 dutyPosition 改成助跑起點。
//   拍板（07-29 Sawmah）：**作廢**。助跑本來就該是玩家自己操作的，自由度才是價值；
//         這也與 07-27 自己的拍板一致（`matchControls.js:578` 逐字「站位全交搖桿手動」）。
//         「參與率」這個指標本身也是誤讀——玩家沒踩在系統指派的線上，可能只是他選了
//         別的跑法，那正是自由度，不是壞掉。
//   真正的缺口：**玩家不知道系統指派給他哪一條線**。真實排球裡攻擊手知道戰術
//         （二傳叫了、或賽前講好），所以他跑得對。給資訊，他自己跑。
//
// 因此本檔**只做資料**，一行走位都不改（自動帶位維持 dutyPosition 原行為）。
// 呈現方式（浮字／地面標記／既有 diegetic 範式）是表現層的設計選擇，且憲法 §九
// 明文「球內不得新增任何決策面板」——這份資料要怎麼給玩家看，留給 Sawmah 裁定。
//
// 誠實性（憲法 §六 的同一把尺）：這是**受控者自己的**戰術指派，不是對手的內心。
//   ・對手隊的 route 一律不外洩（`approach.team !== 我隊` 直接回 null）
//   ・不回傳 `aiState.attackerId`——「二傳最後選了誰」在球離手前是未來值，
//     連自家攻擊手在真實排球裡也是看球才知道，這裡不給。
import { approachRouteOf, routePhaseAt } from '../sim/approach.js';
import { KIND_LABELS } from './setOptions.js';

// 節奏三層（`sim/approach.js` TEMPO）的中文標籤——三檔的差別對玩家而言就是「何時起步」
export const TEMPO_LABELS = { one: '一速', two: '二速', three: '三速' };

// 這名受控球員本球的助跑線；不在本球攻擊池（或現在根本沒有進攻組織）＝null。
// 回傳：{ pid, kind, kindLabel, tempo, tempoLabel, label, steps,
//         start:{x,z}, takeoff:{x,z}, phase, startTick, takeoffTick,
//         ticksToStart, distToStart }
export function myRouteFor(game, aiState, playerId) {
  const me = game?.players?.[playerId];
  if (!me) return null;
  const team = me.teamId;
  const r = game.rally;
  // 助跑線只活在「我方持球且第一擊已完成」的 transition——接發（touches===0）與
  // 防守回合沒有線可報（與 ai.js:983 approachRunOf 同一組前提，不另立判準）。
  // 實話：這兩道閘 07-29 突變測試證實**今天是冗餘的**——`ai.js:335` 在來球那一刻就把
  // `aiState.approach` 設回 null，且 `approachRouteOf` 以 pid 查表、跨隊 id 不撞，
  // 拿掉任何一道（甚至兩道全拿掉）現有測試都不會轉紅。留著的理由是與 sim 對「這條線
  // 現在活著嗎」用同一份判準：哪天 approach 的清除時機改了，這裡不會默默開始報舊線。
  if (game.phase !== 'rally' || !r || r.possession !== team || r.touches < 1) return null;
  // 對手的線不外洩：這份 route 表屬於哪一隊由協調層自己標
  if (aiState?.approach?.team !== team) return null;
  const route = approachRouteOf(aiState.approach.routes, playerId);
  if (!route) return null; // 不在攻擊池（例如後排 MB／S）＝誠實地沒有線

  const kindLabel = KIND_LABELS[route.kind] ?? route.kind;
  const tempoLabel = TEMPO_LABELS[route.tempo] ?? route.tempo;
  const a = game.actors?.[playerId] ?? null;
  const start = route.start ? { x: route.start.x, z: route.start.z } : null;
  return {
    pid: route.pid,
    kind: route.kind,
    kindLabel,
    tempo: route.tempo,
    tempoLabel,
    label: `${kindLabel}·${tempoLabel}`,
    steps: route.start?.steps ?? null, // 助跑步數（§2-4 位置例外的規格值）
    start,
    takeoff: { x: route.takeoff.x, z: route.takeoff.z },
    // §9 ActionPhaseContract 的相位（wait／chase／air／release）——與 AI 隊友讀同一份
    phase: routePhaseAt(route, game.tick),
    startTick: route.startTick,
    takeoffTick: route.takeoffTick,
    // 還有幾 tick 該起步（負值＝早該起步了）；錨點算不出來時為 null
    ticksToStart: route.startTick == null ? null : route.startTick - game.tick,
    // 現在離自己的助跑起點多遠（m）——玩家判斷「來不來得及退回去拉開」的唯一數字
    distToStart: (a && start) ? Math.hypot(start.x - a.x, start.z - a.z) : null,
    // 這場比賽的世界規則裡「有沒有戰術」（`comboScale`＝呼叫端注入，雙方適用；
    // 生涯層第 1 屆為 0，見 careerState.js:610）。給表現層分屆換措辭用——
    // 第 1 屆連對手都沒有組合攻擊，說「S 要你跑」會讓玩家以為 S 叫了什麼
    // （2026-08-03 Sawmah 試玩回報＋裁定）。**這不是屆數**，sim 照樣不認識屆；
    // 這裡讀的是同一個世界規則旗標。
    playsOn: (game.comboScale ?? 1) > 0,
  };
}
