// Phase 5 §十 階段二 v2 —— **攔網計畫壽命診斷**探針（開工順序第 3 步的前置量測）
//
// ★ 為什麼要先量 ★
// v2 裁定書 §一.1 判定「壽命邊界＝這一波攻擊」，§一.4 指認病灶是
// `blockPlanTargetX` 開頭的 `atkTeam === team` 早退：
//   「球被擊出後 possession 翻面 ⇒ 早退 ⇒ 狀態機再也走不到起跳判定」。
// 但讀 `game.js` 的流程，這個因果鏈有一段對不上：
//   `game.js:591`  擊球當下 `rally.possession = team`（**攻擊方**，不是攔網方）
//   `game.js:881`  possession 翻到攔網方是在**球過網**那一 tick
//   `game.js:879`  而 `tryBlock` 就在同一個 if 裡、**翻面之前**執行
// ⇒ 從擊球到過網的整段飛行，`possession` 一直是攻擊方，早退**不該**成立。
// 不量就改＝拿一個沒驗證的因果去動 sim。本探針把每一波攻擊的計畫生命週期逐段記下來，
// 讓「死在哪一段」變成可讀的數字。
//
// ★ 量什麼（B 隊 MB 視角，一波攻擊＝A 隊二傳觸球 → DEAD_BALL）★
//   planCreated      這一波有沒有建起 blockPlan（＝【判】有沒有發生）
//   jumpSet          有沒有走到 chase 的下降沿、寫下 jumpTick（＝【關】有沒有發生）
//   possAtSpike+1    擊球後一 tick 的 possession（測裁定書 §一.4 的前提）
//   possFlipBeforeCross  飛行途中 possession 有沒有翻到攔網方（同上）
//   branchAliveTicks 飛行途中「攔網分支進得去」的 tick 數
//                    （進得去的條件＝ai.js:791-794：possession 是對方 ∧ 非接高球 ∧ 前排）
//
// 跑法：node tools/phase5-block-plan-lifecycle-probe.mjs [局數=8]
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { isFrontRow } from '../src/sim/rotation.js';

const SETS = Number(process.argv[2] ?? 8);
const GROUP = {
  quick: 'quick', left: 'wing', right: 'wing', pipe: 'back', dball: 'back',
};

function mbOf(game, team) {
  const rot = game.match.rotations[team];
  return rot.find((id) => isFrontRow(rot, id) && game.players[id].currentRole === 'middle') ?? null;
}

function runSet(seed, blockPersona) {
  const game = createGame({ seed, setTarget: 25, aiProfiles: { B: { blockPersona } } });
  const ai = createAiState();
  const rows = [];
  let cur = null;
  let guard = 0;
  while (game.phase !== 'set_over' && guard < 400000) {
    guard += 1;
    const zBefore = game.ball.z;
    const ev = stepGame(game, aiCollectIntents(game, ai, []));

    for (const e of ev) {
      if (e.type === 'TOUCH' && e.kind === 'set' && e.team === 'A' && e.touches === 2) {
        cur = {
          kind: null,
          planCreated: false,
          jumpSet: false,
          planCreatedBeforeSpike: false,
          spikeTick: null,
          crossTick: null,
          possAfterSpike: null,
          possFlipBeforeCross: false,
          branchAliveTicks: 0,
          flightTicks: 0,
        };
      }
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A' && cur && !cur.spikeTick) {
        cur.spikeTick = game.tick;
        cur.kind = ai.attackKind;
        cur.planCreatedBeforeSpike = cur.planCreated;
      }
      if (e.type === 'DEAD_BALL' && cur) {
        if (cur.kind) rows.push(cur);
        cur = null;
      }
    }
    if (!cur) continue;

    const c = ai.blockPlan;
    if (c && c.team === 'B') {
      cur.planCreated = true;
      if (c.jumpTick != null) cur.jumpSet = true;
    }

    // 飛行段（擊球後、**嚴格早於**過網那一 tick）：這段就是裁定書說
    // 「早退把狀態機掐死」的區間。過網那一 tick 本身要先排除——possession 就是在
    // 那一 tick 由 `game.js:881` 翻面的（而且 `tryBlock` 已在同一個 if 裡先跑完），
    // 不排除的話每一波都會被記成「翻面了」，這一欄就永遠是 100%＝量不出東西。
    if (cur.spikeTick != null && cur.crossTick == null) {
      if (zBefore > 0 && game.ball.z <= 0) {
        cur.crossTick = game.tick;
      } else {
        if (cur.possAfterSpike == null) cur.possAfterSpike = game.rally.possession;
        cur.flightTicks += 1;
        if (game.rally.possession === 'B') cur.possFlipBeforeCross = true;
        const mb = mbOf(game, 'B');
        const r = game.rally;
        // ai.js:791-794 的分支進入條件（逐字對照）
        const opponentHasBall = r.possession && r.possession !== 'B';
        const receivingArc = ai.landingTeam === 'B' && r.profile !== 'spike';
        if (mb && opponentHasBall && !receivingArc
          && isFrontRow(game.match.rotations.B, mb)) cur.branchAliveTicks += 1;
      }
    }
  }
  return rows;
}

function arm(persona) {
  const rows = [];
  for (let s = 1; s <= SETS; s += 1) rows.push(...runSet(s * 101, persona));
  return rows;
}

const share = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '-');
const arms = { read: arm('read'), commit: arm('commit') };

console.log(`=== 攔網計畫壽命診斷（${SETS} 局／臂；B 隊 MB）===`);
for (const group of ['quick', 'wing', 'back']) {
  const label = { quick: '快攻', wing: '兩翼', back: '後排' }[group];
  console.log(`\n-- 面對 ${label} --`);
  for (const persona of ['read', 'commit']) {
    const g = arms[persona].filter((r) => GROUP[r.kind] === group);
    if (!g.length) { console.log(`${persona.padEnd(7)} 無樣本`); continue; }
    const created = g.filter((r) => r.planCreated);
    const jumped = g.filter((r) => r.jumpSet);
    const flightT = g.map((r) => r.flightTicks).reduce((a, b) => a + b, 0);
    const aliveT = g.map((r) => r.branchAliveTicks).reduce((a, b) => a + b, 0);
    console.log(`${persona.padEnd(7)} n=${String(g.length).padStart(4)}`
      + `  建起計畫 ${share(created.length, g.length).padStart(6)}`
      + `  其中擊球前就建起 ${share(g.filter((r) => r.planCreatedBeforeSpike).length, g.length).padStart(6)}`
      + `  ｜走到起跳 ${share(jumped.length, g.length).padStart(6)}`
      + `  （在有計畫者中 ${share(jumped.length, created.length).padStart(6)}）`);
    console.log(`        飛行段 possession 翻到攔網方 ${share(g.filter((r) => r.possFlipBeforeCross).length, g.length)}`
      + `  ｜擊球後一 tick 的 possession＝${[...new Set(g.map((r) => r.possAfterSpike))].join('/')}`
      + `  ｜攔網分支活著的 tick 佔飛行段 ${share(aliveT, flightT)}`);
  }
}
