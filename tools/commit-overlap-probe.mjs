// 難度重校卷 追加待裁題 E 探針 —— commit 攔網手「賭對 ∩ 滯空窗涵蓋球到達」的現行發生率
//
// 裁決要的數：若這個聯合發生率近零，「賭對就加攔死機率」的補償形狀是空集合
// （條件幾乎不觸發），只剩「改起跳時機」一條路。本探針只量數，不下結論。
//
// ★ 零 src 改動 ★ 只呼叫既有匯出（blockSetterTendency／attackPointsOf／createGame／
// stepGame／aiCollectIntents）與讀 aiState／actor 的既有公開欄位，不改任何 src/ 檔案、
// 不改任何行為。
//
// ── 賭注（「賭對」的定義）怎麼取得 ──────────────────────────────────────────
// commit 建計畫時（`ai.js blockPlanTargetX` 的「沒有 plan 就建」分支）用
// `blockAimX → blockSetterTendency(game, atkTeam, { passTier, blockerId })` 選定一個
// `{ kind }`（攻擊線別，不含 pid——回傳形狀見 ai.js:1657 `blockSetterTendency`）。
// 本探針在**偵測到 `aiState.blockPlan.byPid[pid]` 第一次出現的那一 tick**（＝production
// 建計畫的同一 tick），用完全相同的參數（`game` 當下真實狀態、`ai.passTier`、`blockerId`）
// 呼叫**同一個** `blockSetterTendency`，再用 `attackPointsOf` 把回傳的 `kind` 映回 `pid`
// （兩者都是既有 sim 匯出，探針不重建任何判斷邏輯——精確重演 `block-commit-bet-probe.mjs`
// 段 2 已驗證過的手法，本檔只是把它從「team 級單一賭注」擴成「逐攔網手」）。
//
// 為什麼這樣呼叫等於「讀到 production 真的用的那個值」而不是自建模型：
// `blockSetterTendency` 的隨機性只吃 `(score.A, score.B, seed, blockerId)`（純 hash，
// 不消耗共享 rng），池子只吃 `rotations / trust / floorShare / scoutTally`——這些量
// 在「建計畫」到「本波攻擊真正扣出去」之間全部不變（比分只在得分後才變、輪轉不會中波
// 換人、scoutTally 只在扣球發生**之後**才累加），所以不論在這個區間內哪個 tick 重新呼叫，
// 回傳值都與 production 內部那次呼叫逐值相同——這不是「重建」，是同一個純函式在同一組
// 真實輸入上被呼叫了兩次。
//
// ★ 不用 x 座標回推身分（02 §6.1 條 1 的教訓）★ `AIM_CROSSING_MIX=1` 之後 `blockSetterTendency`
// 回的 `x` 是「兩條過網線的中點」，不是任何球員的位置——拿它去比對 actor.x 找「賭了誰」
// 會量出假數字。身分只能從 `kind`（線別）經 `attackPointsOf` 的池子映回 `pid`。
//
// ── 滯空涵蓋（airT<=AIR_TICKS）怎麼取得 ──────────────────────────────────────
// `actor.blockStartTick` 是 sim 自己寫的欄位（game.js:499，新開一個攔網窗才更新）；
// `AIR_TICKS`＝approach.js:300 匯出的同一個常數，也是 game.js:1085 真正拿來判資格的那個。
// 「球到達網平面」＝球的 z 在這一 tick 變號（game.js:1030 `crossed` 的同一條件，本探針
// 用 `game.ball.z`（公開狀態）在自己的迴圈裡鏡像判斷，不觸碰任何私有狀態）。
// airT 在該 tick 直接讀 `tick - actor.blockStartTick`，與 game.js:1073 同一個算式。
//
// 跑法：node tools/commit-overlap-probe.mjs [局數=60]
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, attackPointsOf, blockSetterTendency } from '../src/sim/ai.js';
import { isFrontRow } from '../src/sim/rotation.js';
import { AIR_TICKS } from '../src/sim/approach.js';
import {
  createCareer, createCareerPlayer, careerMatchSetup,
} from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { opponentById } from '../src/career/opponents.js';

const SETS = Number.parseInt(process.argv[2] ?? '60', 10);
const MAX_TICKS = 400000;
// 實驗臂＝曜石（全隊唯一 commit，opponents.js:143）；對照臂＝鐵霧（level 64，最接近曜石
// 的 60，且 ai.blockPersona 未覆寫＝預設 read，opponents.js:173 一帶）
const EXPERIMENT_ID = 'obsidian';
const CONTROL_ID = 'iron-mist';

function setupMatch(run, oppId) {
  const career = createCareer({ seed: 900000 + run * 7919, playerName: '探針' });
  const player = createCareerPlayer('探針');
  const roster = { capacity: 12, members: buildStarterMembers() };
  const entry = { id: 'group-3', stage: 'group', opponentId: oppId, label: '' };
  return careerMatchSetup(career, player, entry, roster, null);
}

function setterOf(game, team) {
  return game.match.rotations[team].find((pid) => game.players[pid]?.currentRole === 'setter') ?? null;
}

// 「這名攔網手賭了哪個 pid」——與 block-commit-bet-probe.mjs 的 betPidNow 同一手法，
// 差別只在帶 blockerId（卷六之後的逐人賭注）
function betPidFor(game, blockerId, passTier) {
  const t = blockSetterTendency(game, 'A', { passTier, blockerId });
  if (!t) return null;
  const setterId = setterOf(game, 'A');
  const pts = attackPointsOf(game, 'A', setterId, passTier ?? 'perfect');
  return pts.find((p) => p.kind === t.kind)?.pid ?? null;
}

function runSet(run, oppId) {
  const setup = setupMatch(run, oppId);
  const game = createGame({
    seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
    liberos: setup.liberos, setTarget: 25,
    ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
    ...(setup.benches ? { benches: setup.benches } : {}),
  });
  const ai = createAiState();
  const members = []; // 每個元素＝一名 commit 攔網手對一波攻擊的完整記錄

  let lastPlanRef = null;
  let betMap = new Map(); // pid -> { betPid, blind }（本波攻擊內，第一次出現即鎖存）

  // jumpLog／winStart：偵測「這名攔網手在本波攻擊內是否真的起跳過」（鏡像
  // block-individuation-probe.mjs 的手法），用來把「賭對但沒涵蓋」拆成
  // 「起跳過但已落地」vs「這波整個沒起跳」
  const prevStart = {};
  for (const pid of Object.keys(game.actors)) prevStart[pid] = game.actors[pid].blockStartTick;
  let jumpLog = [];
  let winStart = 0;

  const frontB = () => {
    const rot = game.match.rotations.B;
    return rot.filter((pid) => isFrontRow(rot, pid));
  };

  let cur = null; // 當前這一波攻擊：{ attackerId, wall:[pid...], crossedAt:null, coverage:[] }
  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
    guard += 1;
    const b0z = game.ball.z;
    const intents = aiCollectIntents(game, ai, []);

    // 新一份 blockPlan（物件身分變了）＝新一波攻擊的賭注表，清空重記
    if (ai.blockPlan !== lastPlanRef) { lastPlanRef = ai.blockPlan; betMap = new Map(); }
    if (ai.blockPlan && ai.blockPlan.team === 'B') {
      for (const pid of Object.keys(ai.blockPlan.byPid)) {
        if (betMap.has(pid)) continue;
        const c = ai.blockPlan.byPid[pid];
        const blind = c.blind === true;
        const betPid = blind ? null : betPidFor(game, pid, ai.passTier ?? null);
        betMap.set(pid, { betPid, blind });
      }
    }

    const ev = stepGame(game, intents);
    const tick = game.tick;

    for (const pid of Object.keys(game.actors)) {
      const st = game.actors[pid].blockStartTick;
      if (st !== prevStart[pid]) { prevStart[pid] = st; jumpLog.push({ pid, tick }); }
    }

    if (cur && game.rally.possession === 'A' && ai.attackerId) cur.attackerId = ai.attackerId;

    // 球到達網平面（同 game.js:1030 的過網判斷，讀公開的 game.ball）——只取本波第一次
    const crossed = (b0z > 0) !== (game.ball.z > 0) && b0z !== game.ball.z;
    if (crossed && cur && !cur.crossedAt && game.ball.z <= 0) {
      cur.crossedAt = tick;
      const front = frontB();
      const jumped = new Set(jumpLog.filter((j) => j.tick >= winStart && j.tick <= tick).map((j) => j.pid));
      for (const pid of cur.wall) {
        if (!front.includes(pid)) continue; // 已轉出前排（少見，安全略過）
        const actor = game.actors[pid];
        const airT = tick - actor.blockStartTick;
        cur.coverage.push({
          pid, airT, covered: airT <= AIR_TICKS, jumpedThisWave: jumped.has(pid),
        });
      }
    }

    let ended = false;
    for (const e of ev) {
      if (e.type === 'BALL_OVER_NET' || e.type === 'SERVE') {
        winStart = tick; jumpLog = jumpLog.filter((j) => j.tick >= tick - 1);
      }
      if (cur && !ended) {
        if (e.type === 'TOUCH' && e.team === 'B') { finalize(); ended = true; }
        else if (e.type === 'TOUCH' && e.team === 'A' && cur.crossedAt) { finalize(); ended = true; }
        else if (e.type === 'SCORE') { finalize(); ended = true; }
      }
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A') {
        if (cur) finalize();
        cur = {
          attackerId: ai.attackerId ?? null,
          wall: Object.keys(ai.blockPlan && ai.blockPlan.team === 'B' ? ai.blockPlan.byPid : {})
            .filter((pid) => !(ai.blockPlan.byPid[pid].cover === true)),
          bets: new Map(betMap),
          crossedAt: null,
          coverage: [],
        };
        ended = false;
      }
    }
  }
  if (cur) finalize();

  function finalize() {
    if (!cur) return;
    for (const pid of cur.wall) {
      const bet = cur.bets.get(pid) ?? { betPid: null, blind: true };
      const cov = cur.coverage.find((c) => c.pid === pid) ?? null; // null＝球從沒過網到 B 半場（沒打完/被攔在半路等）
      members.push({
        run, oppId,
        blocker: pid,
        blind: bet.blind,
        betPid: bet.betPid,
        attackerId: cur.attackerId,
        betCorrect: !bet.blind && bet.betPid != null && bet.betPid === cur.attackerId,
        crossed: cov != null,
        covered: cov ? cov.covered : null,
        airT: cov ? cov.airT : null,
        jumpedThisWave: cov ? cov.jumpedThisWave : null,
      });
    }
    cur = null;
  }

  return members;
}

// ──────────────── 跑兩臂 ────────────────
const expRows = [];
for (let s = 0; s < SETS; s += 1) expRows.push(...runSet(s, EXPERIMENT_ID));
const ctlRows = [];
for (let s = 0; s < SETS; s += 1) ctlRows.push(...runSet(s, CONTROL_ID));

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(2)}%` : 'n/a (d=0)');
const se = (n, d) => {
  if (!d) return 'n/a';
  const p = n / d;
  return `±${(Math.sqrt((p * (1 - p)) / d) * 100).toFixed(2)}pp`;
};
const q = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

function report(label, oppId, rows) {
  const crossedRows = rows.filter((r) => r.crossed); // 只有真的過網到 B 半場的波才談得上「涵蓋」
  const aimed = crossedRows.filter((r) => !r.blind);
  const blind = crossedRows.filter((r) => r.blind);
  const betCorrect = aimed.filter((r) => r.betCorrect);
  const betWrong = aimed.filter((r) => !r.betCorrect);
  const covGivenCorrect = betCorrect.filter((r) => r.covered);
  const joint = betCorrect.filter((r) => r.covered); // 賭對 ∩ 涵蓋

  console.log(`\n==== ${label}（曜石=obsidian／對照=iron-mist，oppId=${oppId}，${SETS} 局）====`);
  console.log(`過網到 B 半場的攔網手·攻擊配對總數（分母①，n_wall）＝ ${crossedRows.length}`);
  console.log(`  ├ 盲賭中路（blind）        ＝ ${blind.length} (${pct(blind.length, crossedRows.length)})`);
  console.log(`  └ 有鎖定的賭注（aimed，分母②）＝ ${aimed.length} (${pct(aimed.length, crossedRows.length)})`);
  console.log('');
  console.log(`【① 賭對率】 aimed 中賭對的比例`);
  console.log(`  ${betCorrect.length}/${aimed.length} = ${pct(betCorrect.length, aimed.length)} ${se(betCorrect.length, aimed.length)}`);
  console.log('');
  console.log(`【② 滯空涵蓋率（給定賭對）】 賭對的那些之中，球到達網平面時 airT<=${AIR_TICKS} 的比例`);
  console.log(`  ${covGivenCorrect.length}/${betCorrect.length} = ${pct(covGivenCorrect.length, betCorrect.length)} ${se(covGivenCorrect.length, betCorrect.length)}`);
  console.log('');
  console.log(`【③ 聯合發生率＝賭對 ∩ 滯空涵蓋】★裁決要的主數字★`);
  console.log(`  對分母①（n_wall，全部上牆事件） : ${joint.length}/${crossedRows.length} = ${pct(joint.length, crossedRows.length)} ${se(joint.length, crossedRows.length)}`);
  console.log(`  對分母②（n_aimed，僅算有鎖定賭注）: ${joint.length}/${aimed.length} = ${pct(joint.length, aimed.length)} ${se(joint.length, aimed.length)}`);
  console.log('');
  // 賭對但沒涵蓋：拆成「起跳過但已落地」vs「這波整個沒起跳」
  const correctUncovered = betCorrect.filter((r) => !r.covered);
  const landedEarly = correctUncovered.filter((r) => r.jumpedThisWave);
  const neverJumped = correctUncovered.filter((r) => !r.jumpedThisWave);
  console.log(`【賭對但沒涵蓋的拆解】 n=${correctUncovered.length}`);
  console.log(`  ├ 起跳過、但球到達時已落地（airT>${AIR_TICKS}且本波真的跳過） : ${landedEarly.length}`);
  console.log(`  └ 這波從頭到尾沒起跳（airT>${AIR_TICKS}且本波未偵測到起跳）   : ${neverJumped.length}`);
  const diffs = landedEarly.map((r) => r.airT - AIR_TICKS);
  console.log(`  落地距球到達的 tick 差（僅「起跳過但已落地」那組）：p50=${q(diffs, 0.5) ?? '-'}  p90=${q(diffs, 0.9) ?? '-'}  n=${diffs.length}`);
  console.log('');
  console.log(`【賭錯（aimed 但 betPid !== attackerId）作為對照】 n=${betWrong.length}`);
  const covWrong = betWrong.filter((r) => r.covered).length;
  console.log(`  其中仍 airT<=${AIR_TICKS} 的比例 : ${pct(covWrong, betWrong.length)} ${se(covWrong, betWrong.length)}（若與②數值接近＝滯空涵蓋與賭對無關，符合「起跳訊號跟賭注方向脫鉤」的既有設計）`);

  return {
    label, oppId, n_wall: crossedRows.length, n_aimed: aimed.length, n_blind: blind.length,
    betCorrectN: betCorrect.length, covGivenCorrectN: covGivenCorrect.length, jointN: joint.length,
  };
}

const expSummary = report('實驗臂：曜石（commit）', EXPERIMENT_ID, expRows);
const ctlSummary = report('對照臂：鐵霧（read，當座標系）', CONTROL_ID, ctlRows);

console.log('\n==== 兩臂彙總（座標系檢查：control 的②③理應遠高於 experiment，否則量測管線本身有問題）====');
console.log(JSON.stringify({ experiment: expSummary, control: ctlSummary }, null, 2));
