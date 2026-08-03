// 一傳品質（passTier）逐對手量測 —— 接發球 vs 防守轉換分開看
//
// 用法：
//   node tools/pass-tier-by-opponent-probe.mjs [每隊局數=20]
//   PT_ARMS=iron-mist,quick node tools/pass-tier-by-opponent-probe.mjs 5   # 只跑指定臂
//
// ★ 零 `src/`／`tests/` 改動 ★ 本檔只讀不寫。
//
// ── 要回答的四題（Sawmah 2026-08-03「一傳到位的機率大嗎？」）────────────
// Q1 我方（A 隊）`aiState.passTier` 的分佈（perfect／ok／poor 的次數與百分比），逐對手
// Q2 拆開「接發球」與「防守轉換」——真實排球的「一傳」專指接發球
// Q3 與該隊 level／jumpServeRate／floatServeRate／實際 serve 屬性並列，看單調性
// Q4 快速比賽預設對手的復現錨點（對照 tools/call-feasibility-probe.mjs 的 89.6/5.4/5.0）
//
// ── 「一次起球」的界定（★取樣口徑★）──────────────────────────────
// `passTierOf` 只在 `ai.js:353` 的 `r.possession === team && r.touches === 1` 分支裡被呼叫
//（賦值在 `ai.js:378-379`）。也就是說「一傳品質」這個量在 sim 裡的生命週期，就是
// **「我方剛完成第 1 觸、那顆傳給二傳的球還在飛」的那一段連續 tick**。
// 本探針的一筆＝**那一段**（不是每 tick）：
//   · 進入條件：`game.rally.possession === 'A' && game.rally.touches === 1`
//   · 同一段的鍵＝`game.rally.flightId`（第 1 觸當下 +1，該段內不再變＝天然的段 id）
//   · 一段只記一筆，取該段**第一個** tick 讀到的 `aiState.passTier`
//   ⇒ 語意＝「我方每一次把球第一觸起來、準備組織進攻」記一筆。
// 段內若 tier 曾變動（理論上不該——落點預測在純彈道下是常數）另計 `tierChanged`。
//
// ── 接發球／防守轉換怎麼分（用既有欄位，不重建發球偵測）──────────────
// `game.rally.profile`（game.js:286 宣告；'serve'｜'arc'｜'spike'）就是現成的答案：
//   · 發球寫入 `profile='serve'`（game.js:848），並在 `serveStyle` 記下 'power'｜'float'｜null
//     （game.js:823）——`power` 即跳發、`float` 即飄浮。
//   · 受球方第 1 觸一落，`applyTouch` 立刻把 profile 改寫成 'arc'/'spike'（game.js:697）。
//   ⇒ 只要在 `stepGame` **之前**把 `profile`／`serveStyle` 存起來，第 1 觸發生後
//      那一份就是「這球是從什麼狀態被接起來的」。origin='serve' ＝接發球；否則＝防守轉換。
// 這一段完全沒有自己的判斷式，只是把 sim 已經寫好的欄位在正確時點抄下來。
//
// ── 取樣位置（★前一支探針記過的坑★）────────────────────────────
// 坑＝在 `aiCollectIntents` **之前**讀 `aiState` 會拿到上一段 flight 的值。
// 本探針主口徑＝**位置③**（`aiCollectIntents` 之後、`stepGame` 之前）＝本 tick 的規劃
// 已經跑完、`aiState.passTier` 剛被這一段 flight 寫入。
// 同時取**位置①**（`aiCollectIntents` 之前）當對照並逐段比對，把「這一格受不受那個坑
// 影響」直接量出來，而不是用推論宣稱。
//
// 每 tick 的順序：
//   ① 讀 aiState.passTier（對照）＋存 profile/serveStyle 快照
//   ② aiCollectIntents
//   ③ 讀 aiState.passTier（主口徑）→ 若在起球段且是新段，記一筆
//   ④ stepGame → 若本 tick 有 TOUCH 且 touches 變成 1，把 ① 存的 profile 綁到新 flightId
//
// ── 對局建置 ─────────────────────────────────────────────────
// 生涯臂：`careerMatchSetup`（跑法照抄 tools/block-divergence-probe.mjs 的 setupMatch，
//         只把 OPP_ID 換成各隊 id）。我方＝A、對手＝B。
// quick 臂：`buildQuickSetup('setter')`＋createGame 參數照抄
//           tools/call-feasibility-probe.mjs:104-111（Q4 錨點要同一個建置）。
//           ⚠ 差異一項：本探針全隊交給 AI（`aiCollectIntents(game, ai, [])`），
//           原探針把 A2 排除給玩家（但玩家全程不按鍵、只代發球）。已於回報中申報。
import { OPPONENTS } from '../src/career/opponents.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import {
  createCareer, createCareerPlayer, careerMatchSetup, buildLibero,
} from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { buildQuickSetup } from '../src/app/matchConfig.js';

const SETS = Number.parseInt(process.argv[2] ?? '20', 10);
const MAX_TICKS = 400000;
const MY = 'A';
const TIERS = ['perfect', 'ok', 'poor'];

const ARM_IDS = (process.env.PT_ARMS ?? '').trim()
  ? process.env.PT_ARMS.split(',').map((s) => s.trim()).filter(Boolean)
  : [...OPPONENTS.map((o) => o.id), 'quick'];

// ════════════════════════════════════════════════════════
// 建置
// ════════════════════════════════════════════════════════
function setupCareer(oppId, run) {
  const career = createCareer({ seed: 900000 + run * 7919, playerName: '探針' });
  const player = createCareerPlayer('探針');
  const roster = { capacity: 12, members: buildStarterMembers() };
  const entry = { id: 'group-3', stage: 'group', opponentId: oppId, label: '' };
  const setup = careerMatchSetup(career, player, entry, roster, null);
  return createGame({
    seed: setup.seed,
    teams: setup.teams,
    aiProfiles: setup.aiProfiles,
    liberos: setup.liberos,
    setTarget: 25,
    ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
    ...(setup.benches ? { benches: setup.benches } : {}),
  });
}

function setupQuick(run) {
  const quick = buildQuickSetup('setter');
  if (!quick) throw new Error('buildQuickSetup("setter") 回 null');
  return createGame({
    seed: run,
    teams: quick.teams,
    setTarget: 25,
    liberos: {
      A: quick.liberoA ?? buildLibero('A', 'A隊自由人'),
      B: buildLibero('B', 'B隊自由人'),
    },
    stamina: { A: {}, B: {} },
    momentum: true,
  });
}

// ════════════════════════════════════════════════════════
// 單局取樣
// ════════════════════════════════════════════════════════
function runSet(armId, run, out) {
  const game = armId === 'quick' ? setupQuick(run) : setupCareer(armId, run);
  const ai = createAiState();

  // flightId → { serve, style }：該段飛行是「從什麼狀態被第 1 觸起球」的
  const origin = new Map();
  let curFlight = null; // 目前正在記的起球段
  let guard = 0;

  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
    guard += 1;
    const r = game.rally;

    // ── ① 對照取樣＋來球狀態快照（stepGame 之前的真值）──
    const preTier = ai.passTier ?? null;
    const preProfile = r.profile;
    const preStyle = r.serveStyle ?? null;
    const inWindow = r.possession === MY && r.touches === 1;
    const flightId = r.flightId;

    // ── ② AI 規劃（passTier 在這裡被寫入）──
    const intents = aiCollectIntents(game, ai, []);

    // ── ③ 主口徑取樣 ──
    if (inWindow && ai.landingTeam === MY && ai.passTier != null) {
      if (curFlight !== flightId) {
        curFlight = flightId;
        const og = origin.get(flightId) ?? null;
        out.rows.push({
          arm: armId,
          set: run,
          flightId,
          tier: ai.passTier,                 // 位置③＝主口徑
          tierPre: preTier,                  // 位置①＝對照
          origin: og ? (og.serve ? 'serve' : 'rally') : 'unknown',
          style: og ? og.style : null,
          changed: false,
        });
      } else {
        const last = out.rows[out.rows.length - 1];
        if (last && last.flightId === flightId && last.tier !== ai.passTier) last.changed = true;
      }
    } else if (!inWindow) {
      curFlight = null;
    }

    // ── ④ 推進；把「這一段飛行的來源狀態」綁到新的 flightId ──
    const ev = stepGame(game, intents);
    if (ev.some((e) => e.type === 'TOUCH') && game.rally.touches === 1
        && game.rally.flightId !== flightId) {
      origin.set(game.rally.flightId, {
        serve: preProfile === 'serve',
        style: preProfile === 'serve' ? preStyle : null,
      });
    }
  }
  out.ticks += game.tick;
}

// ════════════════════════════════════════════════════════
// 對手屬性（Q3 並列用；一律從實際建出來的隊伍讀，不從註解抄）
// ════════════════════════════════════════════════════════
// ⚠ 同時取**我方 A 隊**的接球相關屬性——「一傳品質」是發球端與接球端的乘積，
//    只並列 B 的發球屬性會把兩個自變數混成一個，最小改動點就找錯邊。
function armAttrs(armId) {
  const g = armId === 'quick' ? setupQuick(1) : setupCareer(armId, 1);
  const def = armId === 'quick' ? null : OPPONENTS.find((o) => o.id === armId);
  const bs = Object.values(g.players).filter((p) => p.teamId === 'B');
  const as = Object.values(g.players).filter((p) => p.teamId === 'A');
  const avg = (arr, k) => arr.reduce((s, p) => s + p.attributes[k], 0) / arr.length;
  return {
    name: def ? def.name : '（快速比賽預設隊）',
    level: def ? def.level : null,
    jump: def ? (def.ai.jumpServeRate ?? 0) : 0,
    float: def ? (def.ai.floatServeRate ?? 0) : 0,
    serveAttr: avg(bs, 'serve'),
    myControl: avg(as, 'control'),
    myReaction: avg(as, 'reaction'),
  };
}

// ════════════════════════════════════════════════════════
// 統計小工具
// ════════════════════════════════════════════════════════
const pctOf = (k, n) => (n ? (100 * k) / n : NaN);
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '  - ');
const sePct = (k, n) => (n ? 100 * Math.sqrt(((k / n) * (1 - k / n)) / n) : NaN);

function dist(rows) {
  const n = rows.length;
  const c = {};
  for (const t of TIERS) c[t] = rows.filter((x) => x.tier === t).length;
  return { n, c };
}
function distLine(rows) {
  const { n, c } = dist(rows);
  if (!n) return `n=0`;
  return TIERS.map((t) => `${t} ${String(c[t]).padStart(5)}/${n} = ${f1(pctOf(c[t], n)).padStart(5)}%`).join('  ');
}

// ════════════════════════════════════════════════════════
// 主
// ════════════════════════════════════════════════════════
const results = [];
for (const armId of ARM_IDS) {
  const out = { rows: [], ticks: 0 };
  for (let s = 0; s < SETS; s += 1) runSet(armId, s, out);
  results.push({ armId, attrs: armAttrs(armId), rows: out.rows, ticks: out.ticks });
  process.stderr.write(`[done] ${armId}: ${out.rows.length} 起球\n`);
}

console.log(`=== 一傳品質（aiState.passTier）逐對手量測 ===`);
console.log(`每隊 ${SETS} 局（setTarget 25）；我方＝A 隊；一筆＝我方一次起球（possession=A 且 touches=1 的一段 flight）`);
console.log(`主口徑取樣位置：③ aiCollectIntents 之後、stepGame 之前`);
console.log(`對手清單（實際讀自 src/career/opponents.js）：${OPPONENTS.map((o) => o.id).join(', ')}\n`);

// ---- 取樣位置一致性（① vs ③）----
console.log('---- 取樣位置對照（① aiCollectIntents 之前 vs ③ 之後，逐段比對 tier）----');
let agree = 0; let disagree = 0; let cmp = 0; let preNull = 0;
for (const r of results) {
  for (const row of r.rows) {
    cmp += 1;
    if (row.tierPre == null) { preNull += 1; disagree += 1; continue; }
    if (row.tierPre === row.tier) agree += 1; else disagree += 1;
  }
}
console.log(`一致 ${agree}/${cmp} = ${f1(pctOf(agree, cmp))}%；不一致 ${disagree}（其中位置①讀到 null：${preNull}）`);
const changedN = results.reduce((s, r) => s + r.rows.filter((x) => x.changed).length, 0);
console.log(`段內 tier 曾變動的段數：${changedN}/${cmp} = ${f1(pctOf(changedN, cmp))}%\n`);

// ---- Q1 ----
console.log('---- Q1：全部起球的 passTier 分佈（逐對手）----');
console.log('對手               lvl  jumpSv floatSv B.serve | A.control A.react |     n |  perfect        ok          poor');
for (const r of results) {
  const { n, c } = dist(r.rows);
  const a = r.attrs;
  console.log(`${(`${r.armId}`).padEnd(12)}${a.name.padEnd(8)}`
    + `${String(a.level ?? '-').padStart(4)} ${f1(a.jump * 100).padStart(5)}% ${f1(a.float * 100).padStart(6)}%`
    + `${f1(a.serveAttr).padStart(8)} |${f1(a.myControl).padStart(9)}${f1(a.myReaction).padStart(8)} |`
    + `${String(n).padStart(6)} |`
    + TIERS.map((t) => ` ${f1(pctOf(c[t], n)).padStart(5)}%(${String(c[t]).padStart(4)})`).join(''));
}

// ---- Q2 ----
console.log('\n---- Q2：拆開「接發球」與「防守轉換」----');
for (const grp of ['serve', 'rally', 'unknown']) {
  const label = grp === 'serve' ? '接發球（來球 profile=serve）'
    : grp === 'rally' ? '防守轉換（來球 profile=arc/spike）' : '判不出來（origin 未綁到）';
  console.log(`\n■ ${label}`);
  console.log('對手               |     n |  perfect        ok          poor      | 佔該隊全部起球');
  for (const r of results) {
    const sub = r.rows.filter((x) => x.origin === grp);
    const { n, c } = dist(sub);
    console.log(`${(`${r.armId}`).padEnd(12)}${r.attrs.name.padEnd(8)}|${String(n).padStart(6)} |`
      + TIERS.map((t) => ` ${f1(pctOf(c[t], n)).padStart(5)}%(${String(c[t]).padStart(4)})`).join('')
      + ` | ${f1(pctOf(n, r.rows.length)).padStart(5)}%`);
  }
}

// ---- Q2b 接發球再依發球式細分 ----
console.log('\n---- Q2b：接發球再依 rally.serveStyle 細分（power＝跳發／float＝飄浮／null＝一般）----');
console.log('對手              style  |     n |  perfect        ok          poor');
for (const r of results) {
  for (const st of ['power', 'float', null]) {
    const sub = r.rows.filter((x) => x.origin === 'serve' && x.style === st);
    if (!sub.length) continue;
    const { n, c } = dist(sub);
    console.log(`${(`${r.armId}`).padEnd(12)}${String(st ?? '(一般)').padEnd(8)}|${String(n).padStart(6)} |`
      + TIERS.map((t) => ` ${f1(pctOf(c[t], n)).padStart(5)}%(${String(c[t]).padStart(4)})`).join(''));
  }
}

// ---- Q3 單調性 ----
console.log('\n---- Q3：發球強度 → 一傳品質（只看接發球那一組，按 jumpServeRate 排序）----');
console.log('對手               lvl  jumpSv floatSv serve屬性 | 接發n | perfect%±SE | 非perfect%');
const byServe = [...results].filter((r) => r.armId !== 'quick')
  .sort((a, b) => (b.attrs.jump - a.attrs.jump) || (b.attrs.float - a.attrs.float));
for (const r of [...byServe, ...results.filter((x) => x.armId === 'quick')]) {
  const sub = r.rows.filter((x) => x.origin === 'serve');
  const { n, c } = dist(sub);
  const a = r.attrs;
  console.log(`${(`${r.armId}`).padEnd(12)}${a.name.padEnd(8)}`
    + `${String(a.level ?? '-').padStart(4)} ${f1(a.jump * 100).padStart(5)}% ${f1(a.float * 100).padStart(6)}%`
    + `${f1(a.serveAttr).padStart(9)} |${String(n).padStart(6)} |`
    + ` ${f1(pctOf(c.perfect, n)).padStart(5)}%±${f1(sePct(c.perfect, n))}pp |`
    + ` ${f1(100 - pctOf(c.perfect, n)).padStart(5)}%`);
}

// ---- Q4 ----
console.log('\n---- Q4：快速比賽預設對手（復現錨點）----');
const q = results.find((r) => r.armId === 'quick');
if (q) {
  console.log(`本探針口徑（每次起球一筆）：${distLine(q.rows)}`);
  console.log(`  其中接發球：${distLine(q.rows.filter((x) => x.origin === 'serve'))}`);
  console.log(`  其中防守轉換：${distLine(q.rows.filter((x) => x.origin === 'rally'))}`);
  console.log('對照錨點＝tools/call-feasibility-probe.mjs 的 Q4 表（口徑＝遠段面板波，'
    + '玩家＝S、只在面板開著時取樣，一波一筆）——請直接跑該檔比對。');
} else {
  console.log('（本次未跑 quick 臂）');
}

// ---- 原始分子分母 ----
console.log('\n---- 原始分子/分母（全表）----');
for (const r of results) {
  const line = (label, rows) => {
    const { n, c } = dist(rows);
    console.log(`  ${label.padEnd(10)} n=${String(n).padStart(5)}  `
      + TIERS.map((t) => `${t}=${c[t]}`).join('  ')
      + `  未分類=${n - TIERS.reduce((s, t) => s + c[t], 0)}`);
  };
  console.log(`■ ${r.armId}（${r.attrs.name}）ticks=${r.ticks}`);
  line('全部', r.rows);
  line('接發球', r.rows.filter((x) => x.origin === 'serve'));
  line('防守轉換', r.rows.filter((x) => x.origin === 'rally'));
  line('判不出', r.rows.filter((x) => x.origin === 'unknown'));
}
