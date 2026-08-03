// 「魚躍放生區」對抗驗證探針（唯讀觀測；不改任何 src/ 行為）
//
// 被驗宣稱（audit-0803-findings.md B12，CRITICAL）：
//   `CONVERGE_T=1` 之後真實站立可及已是 0.38×身高，但魚躍觸發下界仍寫死
//   `dist > TUNING.REACH_RADIUS`(1.3) ⇒ 落在「站著搆不到、又不觸發魚躍」的區間
//   的下墜低球無人處理、直接落地。
//
// ★ 證據取得路徑 ★
//   ① 「搆不搆得到」＝呼叫 production 單一真相 `reachVolumeFor`+`ballInReach`
//      （src/sim/reach.js），參數逐項對齊 game.js:tryTouch（inflate=BALL.RADIUS）⇒ 真實路徑。
//   ② 「誰負責這顆球」＝直接讀 `aiState.claimId/backupId/landingTeam/planTick`，
//      那是 sim 這一 tick 真的在用的協調層狀態 ⇒ 真實路徑。
//   ③ 「有沒有人碰到／誰失分」＝讀 stepGame 回傳事件（TOUCH / DEAD_BALL / SCORE）⇒ 真實路徑。
//   ④ 「AI 的 dive 觸發幾何式」（ai.js:1258-1262）為轉抄模型，僅用於分類解釋，不用於否證。
//
// 用法：node tools/dive-gap-probe.mjs [runs=24]
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, aiProfileOf } from '../src/sim/ai.js';
import { reachVolumeFor, ballInReach, REACH_ACTION } from '../src/sim/reach.js';
import { BALL } from '../src/sim/constants.js';
import { TEAM_SIDE } from '../src/sim/rotation.js';
import {
  createCareer, createCareerPlayer, careerMatchSetup,
} from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';

const RUNS = Number.parseInt(process.argv[2] ?? '24', 10);
const MAX_TICKS = 200000;
// ★ 鑑別力對照臂（02 §6.1 條 1）★ VD_T0=1 ⇒ 執行期把收斂進度退回 t=0。
// t=0 時 `reachRadiusFor` 早退回 `REACH_RADIUS`＝1.3 ⇒ 站立可及與魚躍觸發下界
// **逐值同一個數**、放生區在幾何上不存在 ⇒ 本探針的 gapLost 必須塌到 ~0。
// 塌不下去＝探針量到的不是「放生區」，結論作廢。
// （只改 TUNING 這個 runtime 物件，未改任何 src/ 檔案。）
if (process.env.VD_T0 === '1') TUNING.CONVERGE_T = 0;
const INFLATE = BALL.RADIUS; // ＝ game.js:33 REACH_INFLATE
// ai.js:2205 reactionTicks 的轉抄（未 export；只用於「這一 tick AI 起動了沒」的門檻）
const reactionTicks = (p) => Math.max(6, Math.round(21 - p.attributes.reaction * 0.16));

function setupMatch(seedBase, run) {
  const career = createCareer({ seed: seedBase + run * 7919, playerName: '探針' });
  const player = createCareerPlayer('探針');
  player.techniques.dive = 1; // 魚躍已解鎖（否則本問題不存在）
  const roster = { capacity: 12, members: buildStarterMembers() };
  return careerMatchSetup(career, player, career.schedule[0], roster, null);
}

function reachState(g, pid) {
  const player = g.players[pid];
  const actor = g.actors[pid];
  const mk = (action) => ballInReach(g.ball, reachVolumeFor({
    player, actor, action, jump: false, jumpMul: 1, tuning: TUNING, inflate: INFLATE,
  }));
  const stand = mk(REACH_ACTION.RECEIVE);
  const dive = mk(REACH_ACTION.DIVE);
  return { dist: stand.dist, standOk: stand.ok, diveOk: dive.ok };
}

// 鏡像 game.js:tryTouch 的前置閘
function eligible(g, pid) {
  const r = g.rally;
  const a = g.actors[pid];
  if (!a) return false;
  if (g.tick < a.divedUntil) return false;
  if (g.tick - a.lastTouchTick < TUNING.TOUCH_COOLDOWN) return false;
  if (r.lastToucherId === pid) return false;
  if (r.profile === 'serve' && g.players[pid].teamId === r.lastTouchTeam) return false;
  return true;
}

const agg = {
  windows: 0, touched: 0, untouched: 0,
  lostPointHere: 0,           // 未觸 ＋ 球界內落在該隊半場 ＝ 真的丟一分
  gapLost: 0,                 // 放生區致命事件（見下方定義）
  gapLostRescue: 0,           // 其中 rescue（必撲路徑，不吃 diveRate）
  gapLostServeRecv: 0,        // 其中 touches===0（吃 diveRate 節流）
  gapAnyWindow: 0,            // 出現過 gap tick 的窗（不論結局）
  gapButTouched: 0,
  hopelessLost: 0,            // 未觸丟分 ＋ 連魚躍都搆不到（正常好球）
  triggerBandLost: 0,         // 未觸丟分 ＋ 曾在「現行觸發帶且魚躍搆得到」（＝觸發了但沒撲成/沒骰中）
  wasted: 0,                  // 曾有「觸發式成立但魚躍實際搆不到」tick 的窗
  triggerPool: 0,             // 現行機制真的給了魚躍機會的窗（進觸發帶且魚躍搆得到）
  gapExpectedSaves: 0,        // Σ diveRate（若下界修正，期望轉成 dive intent 的顆數）
  gapHero: 0,                 // 放生區事件中責任人＝主角槽 A2（玩家自動魚躍【必撲】不擲骰）
  diveFired: 0, diveMissed: 0, // 真實魚躍出手數／其中沒碰到球（撲空）
  gapTicks: 0, lowTicks: 0,
  minGapDistHist: {},
  samples: [],
};

for (let run = 0; run < RUNS; run += 1) {
  const setup = setupMatch(900000, run);
  const g = createGame({
    seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
    liberos: setup.liberos,
    ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
  });
  const ai = createAiState();
  const windows = [];
  let open = null; // 當前防守窗（同一 flightId ＋ 同一防守隊）

  while (g.phase !== 'set_over' && g.tick < MAX_TICKS) {
    if (g.phase === 'rally' && ai.landingTeam && ai.landing) {
      const b = g.ball;
      const team = ai.landingTeam;
      const onSide = b.z * TEAM_SIDE[team] >= 0;
      const lowDescent = b.vy < 0 && b.y <= TUNING.DIVE_MAX_Y && b.y > BALL.RADIUS;
      if (onSide && lowDescent) {
        if (!open || open.flightId !== g.rally.flightId || open.team !== team) {
          open = {
            run, team, flightId: g.rally.flightId,
            touches: g.rally.touches, possession: g.rally.possession,
            standOk: false, diveOk: false, triggerOk: false, wasted: false,
            gapTick: 0, minGapDist: Infinity, minDist: Infinity,
            touched: false, closed: false, reason: null, winner: null,
            diveRate: aiProfileOf(g, team).diveRate,
            claimSeen: false,
          };
          windows.push(open);
        }
        open.lowTicks = (open.lowTicks ?? 0) + 1;
        agg.lowTicks += 1;
        // ★ 只看 sim 真的指派了責任的人（claim/backup）★ letDrop 判出界＝claimId=null＝自動排除
        const responsible = [ai.claimId, ai.backupId].filter(Boolean);
        let gapThisTick = false;
        for (const pid of responsible) {
          if (g.players[pid]?.teamId !== team) continue;
          if (!g.match.rotations[team].includes(pid)) continue;
          if (g.tick - ai.planTick < reactionTicks(g.players[pid])) continue; // 尚未起動
          if (!eligible(g, pid)) continue;
          open.claimSeen = true;
          const { dist, standOk, diveOk } = reachState(g, pid);
          if (dist < open.minDist) open.minDist = dist;
          if (standOk) open.standOk = true;
          if (diveOk) open.diveOk = true;
          const tech = (g.players[pid].techniques?.dive ?? 1) >= 1;
          if (!tech) continue;
          // 現行觸發帶（轉抄 ai.js:1258-1262 的幾何段）且魚躍實際搆得到
          if (dist > TUNING.REACH_RADIUS
            && dist <= TUNING.REACH_RADIUS * TUNING.DIVE_REACH_MUL) {
            if (diveOk) open.triggerOk = true; else open.wasted = true;
          }
          // ★ 放生區 tick ★：魚躍搆得到、站著搆不到、但 dist ≤ 1.3 ⇒ 觸發式擋住
          if (diveOk && !standOk && dist <= TUNING.REACH_RADIUS) {
            gapThisTick = true;
            open.gapPids = open.gapPids ?? new Set();
            open.gapPids.add(pid);
            if (dist < open.minGapDist) open.minGapDist = dist;
          }
        }
        if (gapThisTick) { open.gapTick += 1; agg.gapTicks += 1; }
      }
    }
    const prevDived = {};
    for (const [id, a] of Object.entries(g.actors)) prevDived[id] = a.divedUntil;
    const ev = stepGame(g, aiCollectIntents(g, ai));
    // 真實魚躍出手＝divedUntil 上升沿（game.js:522 出手即倒地，撲空一樣躺）；
    // 同 tick 有無該人的 TOUCH ⇒ 撲到／撲空。走事件流＝真實路徑
    for (const [id, a] of Object.entries(g.actors)) {
      if (a.divedUntil > prevDived[id]) {
        agg.diveFired += 1;
        if (!ev.some((e) => e.type === 'TOUCH' && e.playerId === id)) agg.diveMissed += 1;
      }
    }
    for (const e of ev) {
      if (!open || open.closed) continue;
      if (e.type === 'TOUCH' && e.team === open.team) { open.touched = true; open.closed = true; }
      if (e.type === 'DEAD_BALL') open.reason = e.reason;
      if (e.type === 'SCORE') { open.winner = e.team; open.closed = true; }
    }
    if (open && open.closed) open = null;
  }

  for (const w of windows) {
    if (!w.claimSeen) continue; // 全程沒有任何已起動的責任人＝不是防守窗（多為死球尾段）
    agg.windows += 1;
    if (w.wasted) agg.wasted += 1;
    if (w.triggerOk) agg.triggerPool += 1;
    if (w.gapTick > 0) agg.gapAnyWindow += 1;
    if (w.touched) { agg.touched += 1; if (w.gapTick > 0) agg.gapButTouched += 1; continue; }
    agg.untouched += 1;
    // 真的丟分：球界內落地且得分方不是防守方
    const lost = w.reason === 'BALL_IN' && w.winner && w.winner !== w.team;
    if (!lost) continue;
    agg.lostPointHere += 1;
    if (!w.standOk && !w.diveOk) agg.hopelessLost += 1;
    if (!w.standOk && w.triggerOk) agg.triggerBandLost += 1;
    if (!w.standOk && w.gapTick > 0 && !w.triggerOk) {
      agg.gapLost += 1;
      const rescue = w.possession === w.team && w.touches >= 1;
      if (rescue) agg.gapLostRescue += 1; else agg.gapLostServeRecv += 1;
      agg.gapExpectedSaves += rescue ? 1 : w.diveRate;
      if (w.gapPids?.has('A2')) agg.gapHero += 1;
      const bkt = Math.floor(w.minGapDist * 4) / 4;
      agg.minGapDistHist[bkt] = (agg.minGapDistHist[bkt] ?? 0) + 1;
      if (agg.samples.length < 6) {
        agg.samples.push({
          run: w.run, team: w.team, flightId: w.flightId, touches: w.touches,
          minGapDist: Number(w.minGapDist.toFixed(3)),
          gapTicks: w.gapTick, lowTicks: w.lowTicks, diveRate: w.diveRate,
        });
      }
    }
  }
}

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(2)}%` : 'n/a');
const se = (n, d) => (d ? `${(Math.sqrt((n / d) * (1 - n / d) / d) * 100).toFixed(2)}pp` : 'n/a');

console.log(`==== dive-gap-probe（${RUNS} 局，CONVERGE_T=${TUNING.CONVERGE_T}，REACH_RADIUS=${TUNING.REACH_RADIUS}）====`);
console.log(`低球下墜 tick（責任人已起動）: ${agg.lowTicks}`);
console.log('');
console.log(`分母① 防守低球窗（球下墜進 y≤${TUNING.DIVE_MAX_Y}、在防守方半場、且該波已指派責任人）: ${agg.windows}`);
console.log(`  ├ 該隊最終觸到           : ${agg.touched} (${pct(agg.touched, agg.windows)})`);
console.log(`  ├ 沒碰到                 : ${agg.untouched} (${pct(agg.untouched, agg.windows)})`);
console.log(`分母② 其中「界內落在自家半場＝真的丟一分」: ${agg.lostPointHere}`);
console.log('');
console.log('【放生區致命事件】未觸丟分 ＋ 全程站立不可及 ＋ 有「魚躍搆得到卻被 dist≤1.3 擋住」的 tick ＋ 全程未進現行觸發帶');
console.log(`  對分母①（防守低球窗）    : ${agg.gapLost}/${agg.windows} = ${pct(agg.gapLost, agg.windows)} ± ${se(agg.gapLost, agg.windows)}`);
console.log(`  對分母②（實際丟分球）    : ${agg.gapLost}/${agg.lostPointHere} = ${pct(agg.gapLost, agg.lostPointHere)} ± ${se(agg.gapLost, agg.lostPointHere)}`);
console.log(`    ├ rescue（必撲、不吃 diveRate）: ${agg.gapLostRescue}`);
console.log(`    └ touches===0（吃 diveRate 節流，約 0.03–0.16）: ${agg.gapLostServeRecv}`);
console.log(`  gap tick 總數            : ${agg.gapTicks} (${pct(agg.gapTicks, agg.lowTicks)} of 低球 tick)`);
console.log(`  出現 gap tick 的窗       : ${agg.gapAnyWindow}；其中最後仍被碰到: ${agg.gapButTouched}`);
console.log('');
console.log(`【對照組】丟分 ＋ 站立不可及 ＋ 連魚躍都搆不到（正常好球）: ${agg.hopelessLost} (${pct(agg.hopelessLost, agg.lostPointHere)} of 丟分球)`);
console.log(`【對照組】丟分 ＋ 站立不可及 ＋ 曾進現行觸發帶且魚躍搆得到（＝機制有給機會，沒撲成）: ${agg.triggerBandLost} (${pct(agg.triggerBandLost, agg.lostPointHere)})`);
console.log(`【反向浪費】曾有「觸發式成立但魚躍實際搆不到」tick 的窗: ${agg.wasted} (${pct(agg.wasted, agg.windows)})`);
console.log(`【真實魚躍出手】${agg.diveFired} 次，其中撲空（同 tick 無 TOUCH）: ${agg.diveMissed} (${pct(agg.diveMissed, agg.diveFired)})`);
console.log('');
console.log('==== 修好之後能拿回多少（機會池口徑）====');
console.log(`現行機制已給的魚躍機會窗（進觸發帶且魚躍搆得到）: ${agg.triggerPool}`);
console.log(`下界修正後新增的機會（放生區致命事件）          : ${agg.gapLost} ⇒ 機會池 +${pct(agg.gapLost, agg.triggerPool)}`);
console.log(`  期望真的送出 dive intent 的顆數（Σ diveRate；rescue 計 1）: ${agg.gapExpectedSaves.toFixed(1)} / ${RUNS} 局 = ${(agg.gapExpectedSaves / RUNS).toFixed(2)} 顆/局`);
console.log(`  其中責任人＝主角槽 A2（玩家自動魚躍不擲骰＝100% 會撲）: ${agg.gapHero} = ${(agg.gapHero / RUNS).toFixed(2)} 顆/局`);
console.log('');
console.log('放生區最近距離分佈（0.25m 桶）:');
for (const k of Object.keys(agg.minGapDistHist).map(Number).sort((a, b) => a - b)) {
  console.log(`  ${k.toFixed(2)}–${(k + 0.25).toFixed(2)}m : ${agg.minGapDistHist[k]}`);
}
console.log('');
console.log('樣本:', JSON.stringify(agg.samples));
