// 壓手代價的幅度掃描（2026-08-24，Sawmah 裁定「走 A」後的動手前量測）
//
// ★ 要回答的問題 ★
// press 原本只在 zone==='top' 生效、其餘兩區完全不讀 blockHand ⇒ 結構上不可能有代價
// （實測：全樣本 vertical 22.7% vs press 24.3%，白拿 +1.6pp）。裁定是讓它在非擦頂區
// 有反效果，於是要決定兩個乘數：
//   BLOCK_PRESS_SIDE_MUL（>1，擦側偏折加大）／BLOCK_PRESS_BODY_MUL（<1，正面攔死變難）
// ★不憑感覺挑係數★——本檔掃出各幅度下的實際勝率，用數字定。
//
// ★ 判準（動手前先寫死，免得看到數字再挑一組好看的）★
//   目標＝壓手變成「賭這球會擦到我手頂」：
//     · 全樣本淨值 ≈ 0 或略負（不能白拿；玩家亂壓要虧）
//     · top 子樣本仍顯著為正（賭對要真的大賺，否則這一招沒有存在意義）
//   ⇒ 選「全樣本淨值最接近 0（或略負）、且 top 淨值仍顯著為正」的那一組。
//
// ★ 怎麼量（配對，不是兩組獨立跑）★
// 跑自然對局（AI 現況恆 vertical）。每次真實 BLOCK_TOUCH 發生前一刻用 structuredClone
// 存底稿；接觸一發生，就用同一份底稿對每個臂各重跑一次**到這一分結束**，記錄防守方
// 有沒有贏。同一顆球、同一站位、同一隨機序列，唯一變因是手態與兩個乘數。
// vertical 臂＝底稿重跑但手態不變 ⇒ 應與真實結果逐值相同，拿來驗配對本身有沒有壞。
//
//   node tools/press-cost-sweep.mjs              # 預設每隊 12 場
//   node tools/press-cost-sweep.mjs --matches 30

import { createCareer, createCareerPlayer, careerMatchSetup } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { defaultLineup } from '../src/career/lineup.js';
import { OPPONENTS } from '../src/career/opponents.js';
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

const argMatches = (() => {
  const i = process.argv.indexOf('--matches');
  return i > 0 ? Number(process.argv[i + 1]) : 12;
})();
const SEED_BASE = Number(process.env.VD_SEED_BASE ?? 1);
const MAX_TICKS = 60000;
const NET_CLONE_GATE = 2.4; // 只在球接近網面時存底稿（省 clone 成本，同 retract 探針）
const REPLAY_GUARD = 3000;

const OPP_IDS = (Array.isArray(OPPONENTS)
  ? OPPONENTS.map((o) => o.id)
  : Object.keys(OPPONENTS)).slice(0, 7);

// 臂：key ＝顯示名；hand ＝重跑時蓋的手態；side/body ＝兩個乘數
const ARMS = [
  { key: 'vertical（對照）', hand: 'vertical', side: 1.0, body: 1.0 },
  { key: 'press 1.00/1.00 ', hand: 'press', side: 1.0, body: 1.0 },
  { key: 'press 1.30/0.85 ', hand: 'press', side: 1.3, body: 0.85 },
  { key: 'press 1.60/0.70 ', hand: 'press', side: 1.6, body: 0.70 },
  { key: 'press 2.00/0.60 ', hand: 'press', side: 2.0, body: 0.60 },
  { key: 'press 2.50/0.50 ', hand: 'press', side: 2.5, body: 0.50 },
  { key: 'press 3.00/0.40 ', hand: 'press', side: 3.0, body: 0.40 },
];

function setupGame(seed, opponentId) {
  const career = createCareer({ seed });
  const player = createCareerPlayer('探針', { seed });
  const members = buildStarterMembers();
  const lineup = defaultLineup(members, player.id, player.currentRole);
  const roster = { capacity: 12, members, alumni: [] };
  const setup = careerMatchSetup(
    career, player, { id: 'group-1', opponentId }, roster, lineup, 1,
  );
  const g = createGame({
    seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles, liberos: setup.liberos,
  });
  return { g, ai: createAiState() };
}

// 用底稿重跑「這一分」：第一個 tick 把指定球員的攔網手態蓋成 arm.hand，
// 兩個乘數在重跑期間生效，跑到 SCORE 為止。回傳防守方（defTeam）有沒有贏。
function replayPoint(preG, preAi, arm, actorId, defTeam) {
  const gc = structuredClone(preG);
  const aic = structuredClone(preAi);
  const prevSide = TUNING.BLOCK_PRESS_SIDE_MUL;
  const prevBody = TUNING.BLOCK_PRESS_BODY_MUL;
  TUNING.BLOCK_PRESS_SIDE_MUL = arm.side;
  TUNING.BLOCK_PRESS_BODY_MUL = arm.body;
  try {
    const intents = aiCollectIntents(gc, aic);
    // ★直接設定格值，不是蓋 intent.hand★
    // sim 是一窗一態：game.js:589-596 只在「窗開的那一刻」讀 intent.hand，之後不再讀。
    // 底稿存在接觸前一 tick，那時窗早就開了好幾 tick ⇒ 蓋 intent 完全沒有作用
    // （第一版就是這樣壞的：所有臂數字逐值相同，煙霧測試一眼看出來）。
    // tryBlock 讀的是 actor.blockHand，直接設它＝精確表達「這一觸的手態是 X」，
    // 且不消費 rand、不動其他狀態。
    if (gc.actors[actorId]) gc.actors[actorId].blockHand = arm.hand;
    const ev = stepGame(gc, intents);
    const bt = ev.find((e) => e.type === 'BLOCK_TOUCH');
    let winner = null;
    for (const e of ev) if (e.type === 'SCORE') winner = e.team;
    let guard = 0;
    while (!winner && gc.phase === 'rally' && guard < REPLAY_GUARD) {
      guard += 1;
      const its = aiCollectIntents(gc, aic);
      const evs = stepGame(gc, its);
      for (const e of evs) if (e.type === 'SCORE') winner = e.team;
    }
    if (!winner) return null; // 沒收斂（極少）＝丟棄，不猜
    return { defWon: winner === defTeam, touched: !!bt, zone: bt?.zone ?? null };
  } finally {
    TUNING.BLOCK_PRESS_SIDE_MUL = prevSide;
    TUNING.BLOCK_PRESS_BODY_MUL = prevBody;
  }
}

// Agresti-Coull（同 retract 探針，統計口徑一致）
function ac(k, n) {
  if (!n) return { p: 0, se: 0 };
  const z = 1.96;
  const nt = n + z * z;
  const p = (k + (z * z) / 2) / nt;
  return { p, se: Math.sqrt((p * (1 - p)) / nt) };
}
const pct = (k, n) => `${(ac(k, n).p * 100).toFixed(1)}% ±${(ac(k, n).se * 196).toFixed(1)}pp`;

// ── 主迴圈 ────────────────────────────────────────────────
const tally = new Map(); // armKey → { all:{k,n}, top:{k,n}, side:{k,n}, body:{k,n} }
for (const a of ARMS) {
  tally.set(a.key, {
    all: { k: 0, n: 0 }, top: { k: 0, n: 0 }, side: { k: 0, n: 0 }, body: { k: 0, n: 0 },
  });
}
let contacts = 0; let verifyMismatch = 0; let dropped = 0;
const zoneSeen = { top: 0, side: 0, body: 0 };

const t0 = Date.now();
let seed = SEED_BASE;
for (const oppId of OPP_IDS) {
  for (let m = 0; m < argMatches; m += 1) {
    seed += 1;
    const { g, ai } = setupGame(seed, oppId);
    while (g.phase !== 'set_over' && g.tick < MAX_TICKS) {
      const wasSpike = g.rally.profile === 'spike';
      const nearNet = wasSpike && Math.abs(g.ball.z) < NET_CLONE_GATE;
      const preG = nearNet ? structuredClone(g) : null;
      const preAi = nearNet ? structuredClone(ai) : null;
      const intents = aiCollectIntents(g, ai);
      const ev = stepGame(g, intents);
      const bt = ev.find((e) => e.type === 'BLOCK_TOUCH');
      if (!bt || !preG) continue;
      const zone = bt.zone ?? 'body';
      zoneSeen[zone] += 1;
      contacts += 1;
      for (const arm of ARMS) {
        const r = replayPoint(preG, preAi, arm, bt.playerId, bt.team);
        if (!r) { dropped += 1; continue; }
        // 配對驗證：vertical 臂重跑必須仍在同一區碰到球（手態不影響幾何）
        // body 區的 BLOCK_TOUCH 事件不帶 zone 欄位（game.js 只在 graze 那支寫）
        if (arm.hand === 'vertical' && r.touched && (r.zone ?? 'body') !== zone) verifyMismatch += 1;
        const t = tally.get(arm.key);
        t.all.n += 1; if (r.defWon) t.all.k += 1;
        t[zone].n += 1; if (r.defWon) t[zone].k += 1;
      }
    }
  }
}
const secs = ((Date.now() - t0) / 1000).toFixed(1);

// ── 輸出 ──────────────────────────────────────────────────
console.log(`\n== 壓手代價幅度掃描 ==  ${OPP_IDS.length} 隊 × ${argMatches} 場`
  + `　接觸點 ${contacts} 個　耗時 ${secs}s`);
console.log(`區分佈：top ${zoneSeen.top}／side ${zoneSeen.side}／body ${zoneSeen.body}`
  + `　　配對區不一致 ${verifyMismatch}（應為 0）　未收斂丟棄 ${dropped}`);
console.log('\n每一格＝「這一分防守方（＝攔網方）贏的比率」，同一顆球的配對重跑\n');

const base = tally.get(ARMS[0].key);
const head = '臂                  全樣本                top（擦頂）           side（擦側）          body（正面）';
console.log(head);
console.log('-'.repeat(head.length + 6));
for (const arm of ARMS) {
  const t = tally.get(arm.key);
  const cell = (o) => (o.n ? pct(o.k, o.n).padEnd(21) : 'n/a'.padEnd(21));
  console.log(`${arm.key} ${cell(t.all)}${cell(t.top)}${cell(t.side)}${cell(t.body)}`);
}

console.log('\n對 vertical 的淨值（pp，正＝壓手比較好）：');
for (const arm of ARMS.slice(1)) {
  const t = tally.get(arm.key);
  const d = (o, b) => {
    if (!o.n || !b.n) return 'n/a';
    const a1 = ac(o.k, o.n); const a2 = ac(b.k, b.n);
    const diff = (a1.p - a2.p) * 100;
    const se = Math.sqrt(a1.se ** 2 + a2.se ** 2) * 100;
    const sig = Math.abs(diff) > 1.96 * se ? '顯著' : '雜訊內';
    return `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}±${(1.96 * se).toFixed(1)}(${sig})`;
  };
  console.log(`  ${arm.key} 全:${d(t.all, base.all).padEnd(24)}`
    + `top:${d(t.top, base.top).padEnd(24)}`
    + `side:${d(t.side, base.side).padEnd(24)}`
    + `body:${d(t.body, base.body)}`);
}
console.log('\n判準提醒（動手前寫死）：選「全樣本淨值最接近 0 或略負、且 top 淨值仍顯著為正」的那一組。\n');
