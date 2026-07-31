// 攔網分工案 §五-0 補量 —— **blockCommitRead 下降沿序列**探針（二速解封後的新工作點）
//
// ★ 為什麼要這支 ★
// `ai.js:1339-1346` 記載的舊統計（第一個下降沿 p50 = set+35、最後一個 p50 = set+82、
// 兩翼 2 個佔 51%／3 個佔 15.7%）全部量在 `TEMPO_TWO_RATE = 0` 的舊工作點。
// `main@f54217b` 把 `TEMPO.two.takeoffLead` +3→−40、`TEMPO_TWO_RATE` 0→0.35，
// 三成邊攻改跑二速 ⇒ 攻擊手的物理起跳時刻整個換了工作點 ⇒ 舊統計不可直接引用。
// 本探針在新工作點重量 M1–M3，供「commit 該吃第幾個下降沿」（憲法 §零 領域）裁定用。
//
// ★ 本檔只量，不改、不建議 ★ `src/` 零改動；不重抄任何攔網邏輯、不重建候選過濾器。
//
// ★ 取樣走真實路徑 ★
//   - 訊號本身＝直接呼叫 `src/sim/blockRead.js` 的 `blockCommitRead`，參數與
//     `ai.js:1225`／`ai.js:1362` 逐字相同（`{ passTier: ai.passTier ?? null,
//     setterSpotLx: AI.SETTER_SPOT.lx }`、攻方隊伍代號取自 `rally.possession`＝'A'），
//     且在**與 ai.js 同一個 game 狀態**（aiCollectIntents 之前、stepGame 之前）取樣
//     ⇒ 純函式、決定論 ⇒ 與 ai.js 那一次呼叫的回傳值逐值相同。
//   - 攔網手實際起跳 tick＝直接讀 sim 自己寫下的 `ai.blockPlan.jumpTick`（不重算）。
//   - 球過網 tick／擊球 tick／擊球者＝ sim 的球座標與 TOUCH 事件。
//
// ★ 探針特權（AI 拿不到的上帝視角，全部標明）★
//   ① 「消失的那個候選人是誰」：`blockCommitRead` 刻意不回傳 playerId（反作弊，
//      blockRead.js:176）。本探針以**座標精確比對**還原 pid——回傳的 `{x, depth}`
//      逐字複製自某個 actor 的 `a.x` 與 `side*a.z`（blockRead.js:198,213），
//      故 `a.x === read.x && TEAM_SIDE.A*a.z === read.depth` 可唯一指認。
//      **這不是重抄候選過濾邏輯**，是拿真實回傳值反查身分；同座標多人時記為 ambig。
//   ② 「真攻擊手是誰」＝ TOUCH/spike 事件的 `playerId`（事後真值）。
//   ③ 攻擊型態／節奏＝ `ai.attackKind`／`ai.attackTempo`／`ai.approach.routes`（規劃期內部值）。
//
// ★ 兩個沿族（口徑差異會直接改變結論，故兩個都報）★
//   【全序列】episode 全程（A 隊取得球權 → 擊球）的所有下降沿，含二傳觸球前。
//   【觸球後】只留 `r.touches >= 2` 的沿——**這才是 commit 起跳訊號真正吃得到的那些**
//            （ai.js:1364 的組合條件含 `r.touches >= 2`），也是舊統計 set+35／set+82 的可比口徑。
//   另記 `nullAtSet`＝二傳觸球那一刻訊號**已經是 null**（此時 ai.js 的條件是**位準**成立、
//   不是沿——這是「非沿起跳」的主要來源，不標出來會把它誤算成「沒吃到任何沿」）。
//
// 跑法：node tools/block-edge-sequence-probe.mjs [局數=40] [輸出目錄]
import fs from 'node:fs';
import path from 'node:path';
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, AI } from '../src/sim/ai.js';
import { blockCommitRead } from '../src/sim/blockRead.js';
import { TEAM_SIDE } from '../src/sim/rotation.js';
import { AIR_TICKS, TEMPO, TEMPO_TWO_RATE } from '../src/sim/approach.js';

const SETS = Number(process.argv[2] ?? 40);
const OUT_DIR = process.argv[3] ?? null;

const WING_KINDS = new Set(['left', 'left_inside', 'right']);
const BACK_KINDS = new Set(['pipe', 'dball']);

// 攻擊型態分桶——**二速那一桶是新的**（TEMPO_TWO_RATE 0→0.35 之後才有樣本）
function bucketOf(kind, tempo) {
  if (kind === 'quick') return 'quick';
  if (WING_KINDS.has(kind)) return tempo === 'two' ? 'wing2' : 'wing3';
  if (BACK_KINDS.has(kind)) return 'back';
  return null;
}
const BUCKETS = ['quick', 'wing3', 'wing2', 'back'];
const BUCKET_LABEL = {
  quick: '快攻（一速中路）',
  wing3: '兩翼三速',
  wing2: '兩翼二速★新★',
  back: '後排pipe/D球',
};
const pad = (s, n) => {
  // 中文字寬 2：手動補齊，避免表格跑掉
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 0x2000 ? 2 : 1;
  return s + ' '.repeat(Math.max(1, n - w));
};

// 探針特權①：從 blockCommitRead 的回傳值反查是哪個 actor（座標精確比對）
function identify(game, read) {
  const rot = game.match.rotations.A;
  const hits = [];
  for (const pid of rot) {
    const a = game.actors[pid];
    if (a && a.x === read.x && TEAM_SIDE.A * a.z === read.depth) hits.push(pid);
  }
  return { pid: hits.length ? hits[0] : null, ambig: hits.length !== 1 };
}

function newEpisode(tick) {
  return {
    startTick: tick,
    setTick: null,
    spikeTick: null,
    spikerId: null,
    crossTick: null,
    kind: null,
    tempo: null,
    attackerId: null,
    routeTakeoff: null,
    edges: [],          // { tick, pid, ambig, touches }
    prev: null,         // 上一 tick 的取樣（null＝那 tick 讀不到人）
    prevInit: false,
    nullAtSet: null,    // 二傳觸球那一 tick 的訊號是不是已經 null
    ambigTicks: 0,
    planEnter: null,
    planBlind: null,
    actualJump: null,
    jumpViaJumpAt: null,
    routesSnap: null,
  };
}

function runSet(seed, persona) {
  const game = createGame({ seed, setTarget: 25, aiProfiles: { B: { blockPersona: persona } } });
  const ai = createAiState();
  const rows = [];
  let cur = null;
  let guard = 0;

  const finalize = () => {
    if (cur && cur.setTick != null && cur.spikeTick != null && cur.kind) {
      const b = bucketOf(cur.kind, cur.tempo);
      if (b) {
        // 只保留擊球前（含當 tick）的下降沿——擊球之後的訊號對起跳決策沒有意義
        const all = cur.edges.filter((e) => e.tick <= cur.spikeTick);
        const live = all.filter((e) => e.touches >= 2);
        // 探針特權③：消失的那個候選人本球跑的是哪條線（route 表，AI 讀不到）
        const kindOf = (pid) => cur.routesSnap?.find((x) => x.pid === pid)?.kind ?? '?';
        const mk = (arr) => ({
          n: arr.length,
          lags: arr.map((e) => e.tick - cur.setTick),
          hits: arr.map((e) => (e.pid == null ? null : e.pid === cur.spikerId)),
          kinds: arr.map((e) => kindOf(e.pid)),
        });
        // 真攻擊手自己有沒有產生過任何一個沿（他曾是最淺候選、然後不再推進）
        const own = all.filter((e) => e.pid === cur.spikerId);
        rows.push({
          bucket: b,
          kind: cur.kind,
          tempo: cur.tempo,
          spikeLag: cur.spikeTick - cur.setTick,
          crossLag: cur.crossTick == null ? null : cur.crossTick - cur.setTick,
          takeoffLag: cur.routeTakeoff == null ? null : cur.routeTakeoff - cur.setTick,
          spikerIsPlanned: cur.spikerId === cur.attackerId,
          nullAtSet: cur.nullAtSet,
          allE: mk(all),
          liveE: mk(live),
          ownEdge: own.length ? own[own.length - 1].tick - cur.setTick : null,
          ownEdgeN: own.length,
          ambig: all.some((e) => e.ambig),
          jumpLag: cur.actualJump == null ? null : cur.actualJump - cur.setTick,
          jumpEdgeIdx: cur.actualJump == null ? null
            : live.findIndex((e) => e.tick === cur.actualJump),
          jumpViaJumpAt: cur.jumpViaJumpAt,
          planBlind: cur.planBlind,
        });
      }
    }
    cur = null;
  };

  while (game.phase !== 'set_over' && guard < 400000) {
    guard += 1;
    const r = game.rally;
    const T = game.tick;
    const active = game.phase === 'rally' && r.possession === 'A';

    if (cur && !active && cur.spikeTick == null) finalize();      // A 沒攻成就換手
    if (cur && cur.spikeTick != null && cur.crossTick != null) finalize();
    if (!cur && active) cur = newEpisode(T);

    // ---- 訊號取樣（與 ai.js 同一個 game 狀態、同一組 opts；純函式）----
    let sample = null;
    const sampling = !!cur && active && cur.spikeTick == null;
    if (sampling) {
      const opts = { passTier: ai.passTier ?? null, setterSpotLx: AI.SETTER_SPOT.lx };
      const read = blockCommitRead(game, 'A', opts);
      sample = read ? identify(game, read) : null;
    }

    const intents = aiCollectIntents(game, ai, []);

    if (cur) {
      if (sampling) {
        // 下降沿＝上一 tick 讀得到人、這一 tick 讀不到（ai.js:1362-1364 的 liveRead == null）
        if (cur.prevInit && cur.prev != null && sample == null) {
          cur.edges.push({
            tick: T, pid: cur.prev.pid, ambig: cur.prev.ambig, touches: r.touches,
          });
        }
        if (sample?.ambig) cur.ambigTicks += 1;
        cur.prev = sample;
        cur.prevInit = true;
        if (cur.setTick != null && cur.nullAtSet == null) cur.nullAtSet = sample == null;
      }
      // 攔網計畫（真實路徑：sim 自己寫的欄位，不重算）。
      // ★ 必須擋掉上一波殘留的計畫 ★ blockPlan 是單一欄位、跨波存活，
      //   只認 enterTick 落在本 episode 內的那一份，否則 jumpTick 會是別波的值。
      // 攔網分工卷 step1（07-31）：計畫拆成 per-blocker。`template`＝建計畫那一刻的鎖存值、
      // `latest`＝最近步進的那一份（本步三人逐 tick 同步 ⇒ 與拆分前的共用物件逐值相同）
      const plan = ai.blockPlan?.team === 'B'
        ? { ...ai.blockPlan.template, ...ai.blockPlan.latest } : null;
      if (plan && plan.enterTick >= cur.startTick) {
        if (cur.planEnter == null) { cur.planEnter = plan.enterTick; cur.planBlind = !!plan.blind; }
        if (cur.actualJump == null && plan.jumpTick != null) {
          cur.actualJump = plan.jumpTick;
          cur.jumpViaJumpAt = plan.jumpAt != null;
        }
      }
      if (ai.approach?.team === 'A' && Array.isArray(ai.approach.routes)) {
        cur.routesSnap = ai.approach.routes;
      }
    }

    const zBefore = game.ball.z;
    const ev = stepGame(game, intents);

    if (cur && cur.crossTick == null && cur.spikeTick != null && zBefore > 0 && game.ball.z <= 0) {
      cur.crossTick = T;
    }
    for (const e of ev) {
      if (!cur) continue;
      if (e.type === 'TOUCH' && e.team === 'A' && e.kind === 'set' && e.touches === 2) {
        cur.setTick = e.tick;
      }
      if (e.type === 'TOUCH' && e.team === 'A' && e.kind === 'spike' && cur.spikeTick == null) {
        cur.spikeTick = e.tick;
        cur.spikerId = e.playerId;
        cur.kind = ai.attackKind;
        cur.tempo = ai.attackTempo;
        cur.attackerId = ai.attackerId;
        const rt = cur.routesSnap?.find((x) => x.pid === cur.spikerId) ?? null;
        cur.routeTakeoff = rt?.takeoffTick ?? null;
      }
      if (e.type === 'DEAD_BALL') finalize();
    }
    if (game.phase !== 'rally' && cur) finalize();
  }
  return rows;
}

// ---- 統計小工具 ----
const pctl = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const num = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '－');
const share = (n, d) => (d ? ((n / d) * 100).toFixed(1) : '－');
const rate = (arr) => {
  const v = arr.filter((x) => x != null);
  return { pct: v.length ? (v.filter(Boolean).length / v.length) * 100 : NaN, n: v.length };
};

function arm(persona) {
  const rows = [];
  for (let s = 1; s <= SETS; s += 1) rows.push(...runSet(s * 101, persona));
  return rows;
}

const lines = [];
const P = (s = '') => { lines.push(s); console.log(s); };

const t0 = Date.now();
const arms = { commit: arm('commit'), read: arm('read') };
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

P(`=== 攔網分工案 §五-0：blockCommitRead 下降沿序列探針（${SETS} 局／臂，${elapsed}s）===`);
P(`工作點：TEMPO_TWO_RATE=${TEMPO_TWO_RATE}　TEMPO.two.takeoffLead=${TEMPO.two.takeoffLead}`
  + `　TUNING.BLOCK_WINDOW=${TUNING.BLOCK_WINDOW}　AIR_TICKS=${AIR_TICKS}`);
P('lag 一律相對 A 隊二傳觸球 tick（set+N）。B 隊人格＝commit（主）／read（對照）。');
P('沿族：【觸球後】＝ touches>=2 的沿（commit 起跳訊號真正吃得到的；與舊統計同口徑）');
P('　　　【全序列】＝ episode 全程（含二傳觸球前，快攻手在觸球前就拔起會落在這裡）');

for (const persona of ['commit', 'read']) {
  const all = arms[persona];
  P('');
  P(`########## B 隊人格＝${persona}　總樣本 ${all.length} 次攻擊 ##########`);

  // ---------------- M1 ----------------
  for (const fam of ['liveE', 'allE']) {
    P('');
    P(`-- M1${fam === 'liveE' ? '（【觸球後】沿族）' : '（【全序列】沿族）'} 每次攻擊幾個下降沿、各自落在哪 --`);
    P(`${pad('型態', 16)}${pad('n', 5)}${pad('0個', 8)}${pad('1個', 8)}${pad('2個', 8)}${pad('3個', 8)}${pad('4+個', 8)}`
      + `｜第一個 p50/p90 ｜最後一個 p50/p90 ｜中間沿 p50/p90`);
    for (const b of BUCKETS) {
      const g = all.filter((r) => r.bucket === b);
      if (!g.length) { P(`${pad(BUCKET_LABEL[b], 16)}0`); continue; }
      const hist = [0, 0, 0, 0, 0];
      for (const r of g) hist[Math.min(4, r[fam].n)] += 1;
      const first = g.filter((r) => r[fam].n).map((r) => r[fam].lags[0]);
      const last = g.filter((r) => r[fam].n).map((r) => r[fam].lags[r[fam].n - 1]);
      const mid = [];
      for (const r of g) for (let i = 1; i < r[fam].n - 1; i += 1) mid.push(r[fam].lags[i]);
      P(`${pad(BUCKET_LABEL[b], 16)}${pad(String(g.length), 5)}`
        + hist.map((h) => pad(`${share(h, g.length)}%`, 8)).join('')
        + `｜set+${num(pctl(first, 0.5)).padStart(4)}/${num(pctl(first, 0.9)).padStart(4)}`
        + `   ｜set+${num(pctl(last, 0.5)).padStart(4)}/${num(pctl(last, 0.9)).padStart(4)}`
        + `     ｜${mid.length ? `set+${num(pctl(mid, 0.5))}/${num(pctl(mid, 0.9))} (n=${mid.length})` : '無'}`);
    }
  }
  P('');
  P('參考列：');
  for (const b of BUCKETS) {
    const g = all.filter((r) => r.bucket === b);
    if (!g.length) continue;
    const tk = g.map((r) => r.takeoffLag).filter((v) => v != null);
    const sp = g.map((r) => r.spikeLag);
    const cr = g.map((r) => r.crossLag).filter((v) => v != null);
    P(`  ${pad(BUCKET_LABEL[b], 16)}route規劃takeoffTick p50=set+${num(pctl(tk, 0.5))}`
      + `　擊球 p50=set+${num(pctl(sp, 0.5))}　球過網 p50=set+${num(pctl(cr, 0.5))}`
      + `　二傳觸球當下訊號已 null＝${share(g.filter((r) => r.nullAtSet === true).length, g.filter((r) => r.nullAtSet != null).length)}%`
      + `　擊球者≠規劃攻擊手 ${share(g.filter((r) => !r.spikerIsPlanned).length, g.length)}%`);
  }

  // ---------------- M2 ----------------
  P('');
  P('-- M2 每個下降沿「指著誰」（探針特權①②：座標反查 pid × TOUCH/spike 真值）--');
  P('【觸球後】沿族。命中＝該沿消失的候選人就是這球真正的擊球者。');
  P(`${pad('型態', 16)}${pad('n(有沿)', 10)}${pad('第一個命中%', 16)}${pad('倒數第二個%', 16)}${pad('最後一個%', 16)}`
    + `｜真攻擊手曾產生自己的沿%`);
  for (const b of BUCKETS) {
    const g = all.filter((r) => r.bucket === b && r.liveE.n > 0);
    const gAll = all.filter((r) => r.bucket === b);
    if (!g.length) { P(`${pad(BUCKET_LABEL[b], 16)}0`); continue; }
    const f = rate(g.map((r) => r.liveE.hits[0]));
    const l = rate(g.map((r) => r.liveE.hits[r.liveE.n - 1]));
    const s2 = rate(g.filter((r) => r.liveE.n >= 2).map((r) => r.liveE.hits[r.liveE.n - 2]));
    const ownN = gAll.filter((r) => r.ownEdgeN > 0).length;
    P(`${pad(BUCKET_LABEL[b], 16)}${pad(String(g.length), 10)}`
      + pad(`${num(f.pct, 1)}% (n=${f.n})`, 16)
      + pad(`${num(s2.pct, 1)}% (n=${s2.n})`, 16)
      + pad(`${num(l.pct, 1)}% (n=${l.n})`, 16)
      + `｜${share(ownN, gAll.length)}% (${ownN}/${gAll.length})`
      + `　自己的沿 p50=set+${num(pctl(gAll.map((r) => r.ownEdge).filter((v) => v != null), 0.5))}`);
  }
  P('第一個／最後一個沿「消失的那個人跑的是哪條線」（探針特權③；quick＝中路誘餌）：');
  for (const b of BUCKETS) {
    const g = all.filter((r) => r.bucket === b && r.liveE.n > 0);
    if (!g.length) continue;
    const tally = (pick) => {
      const h = {};
      for (const r of g) { const k = pick(r); h[k] = (h[k] ?? 0) + 1; }
      return Object.entries(h).sort((a, c) => c[1] - a[1])
        .map(([k, v]) => `${k}:${share(v, g.length)}%`).join(' ');
    };
    P(`  ${pad(BUCKET_LABEL[b], 16)}第一個→ ${tally((r) => r.liveE.kinds[0])}`);
    P(`  ${pad('', 16)}最後一個→ ${tally((r) => r.liveE.kinds[r.liveE.n - 1])}`);
  }
  {
    const g = all.filter((r) => r.liveE.n > 0);
    const f = rate(g.map((r) => r.liveE.hits[0]));
    const l = rate(g.map((r) => r.liveE.hits[r.liveE.n - 1]));
    P(`【全體・觸球後】第一個沿命中 ${num(f.pct, 1)}% (n=${f.n})　`
      + `最後一個沿命中 ${num(l.pct, 1)}% (n=${l.n})　`
      + `座標反查 ambig 的攻擊 ${share(all.filter((r) => r.ambig).length, all.length)}%`);
    const ga = all.filter((r) => r.allE.n > 0);
    const fa = rate(ga.map((r) => r.allE.hits[0]));
    const la = rate(ga.map((r) => r.allE.hits[r.allE.n - 1]));
    P(`【全體・全序列】第一個沿命中 ${num(fa.pct, 1)}% (n=${fa.n})　`
      + `最後一個沿命中 ${num(la.pct, 1)}% (n=${la.n})`);
  }

  P('');
  P('-- M2b sim 真的在哪裡起跳（真實路徑：ai.blockPlan.jumpTick）--');
  for (const b of BUCKETS) {
    const g = all.filter((r) => r.bucket === b);
    if (!g.length) continue;
    const hist = {};
    for (const r of g) {
      const k = r.jumpLag == null ? '沒起跳'
        : r.jumpViaJumpAt ? 'read的jumpAt時鐘'
          : r.jumpEdgeIdx > 0 ? `觸球後第${r.jumpEdgeIdx + 1}個沿`
            : r.jumpEdgeIdx === 0 ? '觸球後第1個沿'
              : r.nullAtSet ? '位準（觸球時已null，非沿）' : '其他非沿';
      hist[k] = (hist[k] ?? 0) + 1;
    }
    const str = Object.entries(hist).sort((a, c) => c[1] - a[1])
      .map(([k, v]) => `${k}:${share(v, g.length)}%`).join('　');
    const jl = g.map((r) => r.jumpLag).filter((v) => v != null);
    P(`  ${pad(BUCKET_LABEL[b], 16)}起跳 p50=set+${num(pctl(jl, 0.5))}　blind計畫 ${share(g.filter((r) => r.planBlind).length, g.length)}%`);
    P(`  ${pad('', 16)}${str}`);
  }

  // ---------------- M3 ----------------
  P('');
  P('-- M3 「吃最後一個下降沿」來不來得及（【觸球後】沿族）--');
  P(`${pad('型態', 16)}${pad('n', 5)}${pad('最後沿p50', 12)}${pad('球過網p50', 12)}${pad('過網−最後沿 p50/p90', 22)}`
    + `｜窗涵蓋過網%(BLOCK_WINDOW/AIR_TICKS)｜沿間距 p50/p90/max`);
  for (const b of BUCKETS) {
    const g = all.filter((r) => r.bucket === b && r.liveE.n > 0 && r.crossLag != null);
    if (!g.length) { P(`${pad(BUCKET_LABEL[b], 16)}0`); continue; }
    const last = g.map((r) => r.liveE.lags[r.liveE.n - 1]);
    const cross = g.map((r) => r.crossLag);
    const d = g.map((r) => r.crossLag - r.liveE.lags[r.liveE.n - 1]);
    const inWin = d.filter((v) => v >= 0 && v < TUNING.BLOCK_WINDOW).length;
    const inAir = d.filter((v) => v >= 0 && v < AIR_TICKS).length;
    const gaps = [];
    for (const r of g) for (let i = 1; i < r.liveE.n; i += 1) gaps.push(r.liveE.lags[i] - r.liveE.lags[i - 1]);
    P(`${pad(BUCKET_LABEL[b], 16)}${pad(String(g.length), 5)}`
      + pad(`set+${num(pctl(last, 0.5))}`, 12)
      + pad(`set+${num(pctl(cross, 0.5))}`, 12)
      + pad(`${num(pctl(d, 0.5))} / ${num(pctl(d, 0.9))}`, 22)
      + `｜${share(inWin, g.length).padStart(6)}% /${share(inAir, g.length).padStart(6)}%`
      + `　　　　｜${gaps.length ? `${num(pctl(gaps, 0.5))}/${num(pctl(gaps, 0.9))}/${Math.max(...gaps)} (n=${gaps.length})` : '－'}`);
  }
  P('「等第 K 個之後不再有新沿」要等多久 → 以沿間距分位數當等待門檻 W，看「最後沿+W」是否還趕得上：');
  for (const b of BUCKETS) {
    const g = all.filter((r) => r.bucket === b && r.liveE.n > 0 && r.crossLag != null);
    if (!g.length) continue;
    const gaps = [];
    for (const r of g) for (let i = 1; i < r.liveE.n; i += 1) gaps.push(r.liveE.lags[i] - r.liveE.lags[i - 1]);
    if (!gaps.length) {
      P(`  ${pad(BUCKET_LABEL[b], 16)}本組沿數恆 ≤1（無沿間距樣本）⇒ 「等下一個沿」在本組無資料，`
        + '結構上仍不可事前判定（見回報 M3 說明）');
      continue;
    }
    const w90 = pctl(gaps, 0.9);
    const wmax = Math.max(...gaps);
    const cov = (w) => g.filter((r) => {
      const j = r.liveE.lags[r.liveE.n - 1] + w;
      return r.crossLag >= j && r.crossLag < j + TUNING.BLOCK_WINDOW;
    }).length;
    const before = (w) => g.filter((r) => r.liveE.lags[r.liveE.n - 1] + w <= r.crossLag).length;
    P(`  ${pad(BUCKET_LABEL[b], 16)}W(p90)=${num(w90)}：確認完成仍早於過網 ${share(before(w90), g.length)}%`
      + `　窗仍涵蓋過網 ${share(cov(w90), g.length)}%`
      + `　｜W(max)=${num(wmax)}：仍早於過網 ${share(before(wmax), g.length)}%`
      + `　窗仍涵蓋過網 ${share(cov(wmax), g.length)}%`);
  }
}

// ---- 決定論指紋（同 seed 複跑逐值相同的自證）----
let h = 0;
const s = JSON.stringify(arms);
for (let i = 0; i < s.length; i += 1) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
P('');
P(`=== 決定論指紋：rows=${arms.commit.length}/${arms.read.length}　payloadLen=${s.length}　hash=${h.toString(16)} ===`);

if (OUT_DIR) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `edge-sequence-${SETS}.txt`), `${lines.join('\n')}\n`, 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, `edge-sequence-${SETS}.json`), s, 'utf8');
  console.log(`\n[out] ${OUT_DIR}`);
}
