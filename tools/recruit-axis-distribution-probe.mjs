// 二傳／自由人招募軸 —— 分佈量測探針（**只量測，零 `src/` 改動、零門檻變更**）
//
// 動機：現有 12 個招募槽的 9 條 feat 軸裡，攻擊向 6、防守接發向 3、**組織向 0**。
// 要補「替代路徑 OR」的組織／防守軸，得先知道門檻該訂在哪——而 2026-08-11 的
// `218130e` 才剛踩過「門檻與窗口不相稱」（obsidian 攔死 5 次 vs 窗口恆 1 場，
// 達成率 0.006%）。所以本檔一起量三條軸的**每場分佈**與每個招募對象的**窗口場數**，
// 兩者要在同一份輸出裡對得起來。
//
// ★★ 這支探針量得到什麼／量不到什麼（誠實性；不得在報告裡混淆）★★
//  ○ 真實路徑：事件流來自 `tools/balance-sim.mjs` 的無頭生涯（真實賽程／真實
//    `careerMatchSetup`／真實 `advanceSeason`／真實 `recruitTargetGone` 畢業判定）。
//    窗口場數是從**真的打過的那些場**數出來的，不是另抄一份賽程模型。
//  ○ 真實路徑：`strongReceive` 直接呼叫 production 的 `featGainFor`（recruitment.js:226），
//    `defenseMatch` 直接呼叫 production 的 `boxScoreLFor`（boxScoreL.js:7）。
//  ○ 真實路徑（08-11 起）：`assistMatch`（玩家舉球→隊友扣球得分）直接呼叫 production 的
//    `countSetAssistKills`（`src/career/boxScore.js:92`）。此前本檔自寫過一份重建模型，
//    有歸因 bug（`attacker` 只在 SCORE 清 ⇒ 中途換人接手舉球會誤記給原舉球者）；
//    bug 已在 production 修好，探針改成直接 import，不再維護第二份定義（單一事實源）。
//  ✗ 量不到：真人操作。治具用 AI 代打主角，接球 timing **恆 0.75**
//    （`src/sim/ai.js:1773`）⇒ 任何 `quality ≥ 0.8` 的判準在治具裡**數學上恆為 0**，
//    不是「機率低」。`VD_PLAYER_PERFECT=1` 讓主角接球 timing=1.0（ai.js:1788）＝上界。
//    ⇒ 所有 quality 相關的數字一律給 **[治具下界, PERFECT 上界]** 區間，不給單一值。
//  ✗ 量不到：真人的攔網／魚躍主動操作（治具無玩家意圖模型），本檔不碰攔網軸。
//
// 用法：
//   node tools/recruit-axis-distribution-probe.mjs            # 跑全部臂再出報告
//   RA_RUNS=40 RA_JOBS=6 node tools/recruit-axis-distribution-probe.mjs
//   RA_REPORT_ONLY=1 node tools/recruit-axis-distribution-probe.mjs   # 只重跑彙總
//   RA_OUT=<dir>                                              # 分片與報告落檔目錄
//
// 安全：本檔只跑模擬、只寫 RA_OUT（預設 scratchpad）。不碰存檔／localStorage／
// 任何 production 資料，不改 `src/`（patch 只活在子行程記憶體裡，磁碟逐位元未動）。

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

import { RECRUIT_CONDS, featGainFor, recruitTargetGone } from '../src/career/recruitment.js';
import { boxScoreLFor } from '../src/career/boxScoreL.js';
import { countSetAssistKills } from '../src/career/boxScore.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.join(
  os.tmpdir(), 'claude', 'C--Users-shung',
  '7c31ecb2-ce18-43be-9b9d-9ca1ef681af2', 'scratchpad', 'recruit-axis',
);
const OUT = process.env.RA_OUT ?? DEFAULT_OUT;
// 報告落點（分片留在 OUT，報告另外放一份到指定路徑）
const MD = process.env.RA_MD ?? path.join(OUT, '..', 'recruit-axis-distribution.md');
const RUNS = process.env.RA_RUNS ?? '40';
const SEASONS = process.env.RA_SEASONS ?? '3';
const JOBS = Number.parseInt(process.env.RA_JOBS ?? '6', 10);
const ARM = process.env.RA_ARM ?? null;

// 三個 seed 基底（昨天已知：本專案的窗測試對 seed 敏感 ⇒ 掃三組、三組數字一起列，
// 不只給平均）。balance-sim 的 seed 序列＝`base + run * 7919`（balance-sim.mjs:601）
const SEED_BASES = [100000, 200003, 500009];
const ROLES = ['setter', 'libero'];
const PERFECTS = ['0', '1'];

const armId = (role, perfect, base) => `${role}-p${perfect}-s${base}`;
const shardPath = (id) => path.join(OUT, `shard-${id}.json`);

// ════════════════════════════════════════════════════════
// 子行程：模組鉤子（磁碟上的 src/tools 逐位元未動）
// ════════════════════════════════════════════════════════
function installHooks() {
  const hit = {};
  registerHooks({
    load(url, context, nextLoad) {
      const res = nextLoad(url, context);
      const norm = url.replace(/\\/g, '/');
      if (!norm.endsWith('/tools/balance-sim.mjs')) return res;
      let src = typeof res.source === 'string'
        ? res.source : Buffer.from(res.source).toString('utf8');
      const sub = (from, to, tag) => {
        if (!src.includes(from)) throw new Error(`patch 目標消失（${tag}）：${from}`);
        src = src.replace(from, to);
        hit[tag] = (hit[tag] ?? 0) + 1;
      };
      // ① seed 基底可覆寫（掃三組 seed 家族用；未設＝原值 100000，逐值不變）
      sub(
        '  const seed0 = 100000 + run * 7919;',
        '  const seed0 = (globalThis.__VD_SEED_BASE ?? 100000) + run * 7919;',
        'seedbase',
      );
      // ② 每場賽末唯讀觀測（掛在 production 記帳的同一個點位：balance-sim.mjs:788
      //    `matchStatsFor` 之後，此處 g.events/entry/season/won 都在真實路徑上）
      sub(
        "      const stats = matchStatsFor(g.events, 'A2', 'A');",
        "      const stats = matchStatsFor(g.events, 'A2', 'A');\n"
        + '      if (globalThis.__VD_AXIS) globalThis.__VD_AXIS(g.events, entry, season, won, seed0);',
        'axis',
      );
      return { ...res, source: src };
    },
  });
  return hit;
}

// ────────────────────────────────────────────────────────
// assistMatch 計數器 —— 08-11 改走 production 的 `countSetAssistKills`
// （`src/career/boxScore.js:92`），不再自寫重建模型。舊探針自寫版有歸因 bug：
// `attacker` 只在 SCORE 清，於是「我舉→隊友扣被救起→**別人**舉→同一人再扣得分」
// 會誤記給我；production 版已修好（任何插進來的觸球都打斷配對）。單一事實源。
// ────────────────────────────────────────────────────────

// strongReceive：走 production 的 `featGainFor`（recruitment.js:226-239）——
// 不重抄 countStrongReceives（它是 module-private，但 featGainFor 是它唯一的入口）
const srAt = (events, q) => featGainFor(events, 'A2', 'A', { feat: { type: 'strongReceive', quality: q } });
// ★ 鑑別力配套 ★ 「sr80=0」有兩個完全不同的成因：①玩家根本沒接到發球（S 在 5-1 陣型
// 裡由 OH/L 接發）②接到了但品質構不到。quality=0 的那格＝**玩家的總接發次數**
// （countStrongReceives 的 `(e.power ?? 0) >= 0` 恆真）⇒ 兩者可分。中間門檻補
// 0.5/0.6/0.65 讓「品質天花板落在哪」看得見，不必猜。
const SR_QS = [0, 0.5, 0.6, 0.65, 0.7, 0.75, 0.8];
const srKey = (q) => (q === 0 ? 'recv' : `sr${String(q).slice(2).padEnd(2, '0')}`);

async function runArm(id) {
  const [role, pTag, sTag] = [id.split('-')[0], id.split('-')[1], id.split('-')[2]];
  const seedBase = Number.parseInt(sTag.slice(1), 10);
  const hit = installHooks();
  globalThis.__VD_SEED_BASE = seedBase;
  const rows = [];
  globalThis.__VD_AXIS = (events, entry, season, won, seed) => {
    const lb = boxScoreLFor(events, 'A2');
    const row = {
      seed,
      season,
      matchId: entry?.id ?? '?',
      opponentId: entry?.opponentId ?? '?',
      won: won ? 1 : 0,
      assist: countSetAssistKills(events, 'A2', 'A'),
      digs: lb.digs,
      assistDigs: lb.assistDigs,
      rallySaves: lb.rallySaves,
    };
    for (const q of SR_QS) row[srKey(q)] = srAt(events, q);
    rows.push(row);
  };
  process.argv[2] = RUNS;
  await import('./balance-sim.mjs');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(shardPath(id), `${JSON.stringify({
    arm: id, role, perfect: pTag.slice(1), seedBase, runs: Number(RUNS), seasons: Number(SEASONS),
    patchHit: hit, rows,
  })}\n`);
  console.error(`[arm ${id}] 完成：${rows.length} 場（patch 命中 ${JSON.stringify(hit)}）`);
}

// ════════════════════════════════════════════════════════
// 彙總與報告
// ════════════════════════════════════════════════════════
const AXES = [
  { key: 'assist', label: 'assistMatch（玩家舉→隊友扣得分）', src: '真實路徑（production countSetAssistKills，boxScore.js:92）', ns: [5, 10, 15, 20, 25, 30, 35, 40] },
  { key: 'defense', label: 'defenseMatch（digs＋assistDigs）', src: '真實路徑（production boxScoreLFor）', ns: [1, 2, 3, 4, 5, 6, 7, 8] },
  { key: 'digs', label: '　└ digs（純起球）', src: '真實路徑（production boxScoreLFor）', ns: [1, 2, 3, 4, 5, 6, 7, 8] },
  { key: 'assistDigs', label: '　└ assistDigs（助攻一傳）', src: '真實路徑（production boxScoreLFor）', ns: [1, 2, 3, 4, 5, 6, 7, 8] },
  { key: 'recv', label: 'strongReceive 分母＝總接發次數（quality 0）', src: '真實路徑（production featGainFor）', ns: [1, 2, 3, 4, 5, 6, 7, 8] },
  { key: 'sr50', label: 'strongReceive ≥0.50', src: '真實路徑（production featGainFor）', ns: [1, 2, 3, 4, 5, 6, 7, 8] },
  { key: 'sr60', label: 'strongReceive ≥0.60', src: '真實路徑（production featGainFor）', ns: [1, 2, 3, 4, 5, 6, 7, 8] },
  { key: 'sr65', label: 'strongReceive ≥0.65', src: '真實路徑（production featGainFor）', ns: [1, 2, 3, 4, 5, 6, 7, 8] },
  { key: 'sr70', label: 'strongReceive ≥0.70', src: '真實路徑（production featGainFor）', ns: [1, 2, 3, 4, 5, 6, 7, 8] },
  { key: 'sr75', label: 'strongReceive ≥0.75', src: '真實路徑（production featGainFor）', ns: [1, 2, 3, 4, 5, 6, 7, 8] },
  { key: 'sr80', label: 'strongReceive ≥0.80（現行 iron-mist／black-pine-2 用的門檻）', src: '真實路徑（production featGainFor）', ns: [1, 2, 3, 4, 5, 6, 7, 8] },
];
const valOf = (r, k) => (k === 'defense' ? r.digs + r.assistDigs : (r[k] ?? 0));
const NS = [1, 2, 3, 4, 5, 6, 7, 8];
const fx = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const pctf = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');

function loadShards() {
  if (!fs.existsSync(OUT)) return [];
  return fs.readdirSync(OUT).filter((f) => f.startsWith('shard-') && f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')));
}

// 每個招募對象的窗口＝該生涯裡「對手＝cond.opponentId 且目標尚未畢業」的實打場數
function windowsOf(rows) {
  const bySeed = new Map();
  for (const r of rows) {
    if (!bySeed.has(r.seed)) bySeed.set(r.seed, []);
    bySeed.get(r.seed).push(r);
  }
  const out = {};
  for (const [key, cond] of Object.entries(RECRUIT_CONDS)) {
    const counts = [];
    const careerRows = [];
    for (const [, rs] of bySeed) {
      const w = rs.filter((r) => r.opponentId === cond.opponentId
        && !recruitTargetGone(key, r.season));
      counts.push(w.length);
      careerRows.push(w);
    }
    counts.sort((a, b) => a - b);
    out[key] = {
      opponentId: cond.opponentId,
      careers: counts.length,
      min: counts[0] ?? 0,
      p10: counts[Math.floor(counts.length * 0.1)] ?? 0,
      median: counts[Math.floor(counts.length / 2)] ?? 0,
      mean: counts.reduce((s, v) => s + v, 0) / (counts.length || 1),
      max: counts[counts.length - 1] ?? 0,
      zero: counts.filter((c) => c === 0).length,
      careerRows,
    };
  }
  return out;
}

// 生涯達成率（經驗值，非 Poisson 外推）：窗口內「單場 ≥ N」的場數 ≥ count 的生涯佔比
function careerRate(careerRows, axisKey, n, count) {
  let ok = 0;
  for (const w of careerRows) {
    const hits = w.filter((r) => valOf(r, axisKey) >= n).length;
    if (hits >= count) ok += 1;
  }
  return careerRows.length ? ok / careerRows.length : 0;
}

function report() {
  const shards = loadShards();
  if (!shards.length) throw new Error(`沒有分片可彙總：${OUT}`);
  const L = [];
  const say = (s = '') => { L.push(s); console.log(s); };

  say('# 二傳／自由人招募軸 —— 分佈量測');
  say('');
  say(`- 產生指令：\`node tools/recruit-axis-distribution-probe.mjs\`（RA_RUNS=${RUNS}、RA_SEASONS=${SEASONS}）`);
  say(`- 治具：\`tools/balance-sim.mjs\` 無頭生涯，\`VD_FAITHFUL=1\`（止步即收工＋屆界換血＋多局制＋身高揭曉）`);
  say(`- seed 家族：${SEED_BASES.join(' / ')}（序列＝base + run×7919，balance-sim.mjs:601）`);
  say('- **零 `src/` 改動**：balance-sim 的兩處 patch 走 `module.registerHooks`，只活在子行程記憶體');
  say('');
  say('## 證據取得路徑（逐軸標註）');
  say('');
  say('| 軸 | 取得路徑 |');
  say('|---|---|');
  for (const a of AXES) say(`| ${a.label} | ${a.src} |`);
  say('| 窗口場數 | 真實路徑（真實賽程 + `recruitTargetGone` 畢業判定，從實打場數出來） |');
  say('');
  say('> ⚠ 治具 AI 代打主角接球 timing **恆 0.75**（`src/sim/ai.js:1773`）⇒ `≥0.8` 在預設臂');
  say('> **數學上恆為 0**，不是機率低。`VD_PLAYER_PERFECT=1`（timing 1.0）＝上界。');
  say('> quality 相關數字一律讀成 **[治具下界, PERFECT 上界]** 區間。');
  say('');
  say('> ⚠ `defenseMatch = digs + assistDigs` 會**重複計數**：`assistDigs` 是 `digs` 的子集');
  say('> （`boxScoreL.js:36-41` 要求那一觸本身就是 `digs` 的條件）⇒ 一次「起球→隊友扣死」');
  say('> 記 2 分。下面 digs／assistDigs 另外分列，訂門檻時要挑一個口徑、不要混用。');
  say('');

  // ── 品質常數對照表（★靜態列舉，非模擬量測——標籤照實寫★）──
  say('## `power`（＝接球品質）的取值集合｜**原始碼靜態列舉，非模擬量測**');
  say('');
  say('`countStrongReceives`（`recruitment.js:206-223`）比的是 TOUCH 事件的 `power`，而');
  say('`power` 全專案**只有一個產生點**：`game.js:798 power = round(timing×100)/100`');
  say('（`timing` 於 `game.js:711` 對 ≤1 的值原樣通過）。⇒ 各路徑的 `timing` 就是 `power`：');
  say('');
  say('| 誰 | 情境 | power | 出處 |');
  say('|---|---|---|---|');
  say('| 真人 | 主動蓄力接發，抓到 Perfect 窗 | **1.00** | `matchControls.js:198` |');
  say('| 真人 | 主動蓄力接發，沒抓到 | **0.70** | `matchControls.js:198` |');
  say('| 真人 | 到位自動接（沒按鍵的反射） | **0.60** | `matchControls.js:468` |');
  say('| 真人 | L 讀對指令的自動接 | **1.00** | `matchControls.js:472` |');
  say('| 真人 | 魚躍（自動／主動） | **0.50** | `matchControls.js:514`／`:732` |');
  say('| 治具 AI | 一般接球 | **0.75** | `ai.js:1773` |');
  say('| 治具 AI | L 讀對 digBias 的接球 | **1.00** | `ai.js:1778` |');
  say('| 治具 AI | 魚躍 | **0.50** | `ai.js:1840` |');
  say('| 治具 AI | A2＋`VD_PLAYER_PERFECT=1` | **1.00** | `ai.js:1789` |');
  say('');
  say('**這張表決定了 strongReceive 門檻的可用刻度**：接發品質不是連續分佈，是幾個離散點。');
  say('- 治具端是 **0.75 的點質量** ⇒ 門檻 0.60/0.65/0.70/0.75 在治具裡量到的數字**完全相同**，');
  say('  0.80 恆為 0。下面的表逐值證實了這一點（不是巧合、是結構）。');
  say('- 真人端沒有任何路徑產出 (0.70, 1.00) 之間的值 ⇒ **門檻 0.80 → 0.75 對真人是零效果改動**；');
  say('  真正會改變行為的切點只有 **≤0.70**（納入「按了但沒抓到 Perfect」）與 **≤0.60**（連自動接都算）。');
  say('- 唯一未列舉到的殘留：蓄力在非 receive 情境放開、投遞時才被判成 receive，會帶連續值');
  say('  `held/CHARGE_MS`（`matchControls.js:177`）。該路徑是第三觸降級安全球，');
  say('  `countStrongReceives` 只認「SERVE 之後的第一觸」⇒ 對本軸不生效。');
  say('');

  for (const role of ROLES) {
    say(`## 玩家坐 ${role === 'setter' ? 'S（二傳）' : 'L（自由人）'}`);
    say('');
    for (const perfect of PERFECTS) {
      const mine = shards.filter((s) => s.role === role && s.perfect === perfect);
      if (!mine.length) continue;
      const armLabel = perfect === '1' ? 'PERFECT 上界臂（VD_PLAYER_PERFECT=1）' : '預設治具臂（下界，timing 0.75）';
      const all = mine.flatMap((s) => s.rows);
      say(`### ${armLabel}`);
      say('');
      say(`樣本：${all.length} 場（${mine.map((s) => `seed ${s.seedBase}: ${s.rows.length}`).join('、')}）`);
      say('');

      // -- 每場分佈（逐 seed 家族並列）--
      say('#### 每場分佈（均值／中位數／P90／最大；逐 seed 家族並列）');
      say('');
      say('| 軸 | seed | 場數 | 均值 | 中位 | P90 | 最大 | =0 佔比 |');
      say('|---|---|---|---|---|---|---|---|');
      for (const a of AXES) {
        for (const s of [...mine].sort((x, y) => x.seedBase - y.seedBase)) {
          const vs = s.rows.map((r) => valOf(r, a.key)).sort((x, y) => x - y);
          const mean = vs.reduce((t, v) => t + v, 0) / (vs.length || 1);
          say(`| ${a.key} | ${s.seedBase} | ${vs.length} | ${fx(mean, 2)} | ${vs[Math.floor(vs.length / 2)] ?? 0}`
            + ` | ${vs[Math.floor(vs.length * 0.9)] ?? 0} | ${vs[vs.length - 1] ?? 0}`
            + ` | ${pctf(vs.filter((v) => v === 0).length, vs.length)} |`);
        }
        const vs = all.map((r) => valOf(r, a.key)).sort((x, y) => x - y);
        const mean = vs.reduce((t, v) => t + v, 0) / (vs.length || 1);
        say(`| **${a.key}** | **合計** | **${vs.length}** | **${fx(mean, 2)}** | **${vs[Math.floor(vs.length / 2)] ?? 0}**`
          + ` | **${vs[Math.floor(vs.length * 0.9)] ?? 0}** | **${vs[vs.length - 1] ?? 0}**`
          + ` | **${pctf(vs.filter((v) => v === 0).length, vs.length)}** |`);
      }
      say('');

      // -- N vs 單場達到率（統一 1..8 網格，任務書指定）--
      say('#### N vs「單場達到」機率 P(單場 ≥ N)｜N=1..8（任務書指定網格）');
      say('');
      say(`| 軸 | ${NS.map((n) => `N=${n}`).join(' | ')} |`);
      say(`|---|${NS.map(() => '---').join('|')}|`);
      for (const a of AXES) {
        const vs = all.map((r) => valOf(r, a.key));
        say(`| ${a.key} | ${NS.map((n) => pctf(vs.filter((v) => v >= n).length, vs.length)).join(' | ')} |`);
      }
      say('');
      say('`assist` 在 1..8 全飽和 ⇒ 另列它自己的網格：');
      say('');
      const aNs = AXES[0].ns;
      say(`| 軸 | ${aNs.map((n) => `N=${n}`).join(' | ')} |`);
      say(`|---|${aNs.map(() => '---').join('|')}|`);
      {
        const vs = all.map((r) => valOf(r, 'assist'));
        say(`| assist | ${aNs.map((n) => pctf(vs.filter((v) => v >= n).length, vs.length)).join(' | ')} |`);
        for (const s of [...mine].sort((x, y) => x.seedBase - y.seedBase)) {
          const v2 = s.rows.map((r) => valOf(r, 'assist'));
          say(`| assist·seed${s.seedBase} | ${aNs.map((n) => pctf(v2.filter((v) => v >= n).length, v2.length)).join(' | ')} |`);
        }
      }
      say('');
      say('逐 seed 家族（N=1..4，看 seed 敏感度）：');
      say('');
      say(`| 軸 | seed | ${[1, 2, 3, 4].map((n) => `N=${n}`).join(' | ')} |`);
      say('|---|---|---|---|---|---|');
      for (const a of AXES) {
        if (a.key === 'assist') continue;
        for (const s of [...mine].sort((x, y) => x.seedBase - y.seedBase)) {
          const vs = s.rows.map((r) => valOf(r, a.key));
          say(`| ${a.key} | ${s.seedBase} | ${[1, 2, 3, 4].map((n) => pctf(vs.filter((v) => v >= n).length, vs.length)).join(' | ')} |`);
        }
      }
      say('');

      // -- 窗口 --
      const win = windowsOf(all);
      say('#### 每個招募對象的窗口（實打場數；真實路徑）');
      say('');
      say('| recruitKey | 對手 | 生涯數 | 保底(min) | P10 | 中位 | 均值 | 最大 | 窗口=0 佔比 |');
      say('|---|---|---|---|---|---|---|---|---|');
      for (const [k, w] of Object.entries(win)) {
        say(`| ${k} | ${w.opponentId} | ${w.careers} | ${w.min} | ${w.p10} | ${w.median}`
          + ` | ${fx(w.mean, 2)} | ${w.max} | ${pctf(w.zero, w.careers)} |`);
      }
      say('');

      // -- 生涯達成率（窗口內 count 場達標）--
      say('#### 生涯達成率（經驗值：窗口內「單場 ≥ N」的場數 ≥ count）');
      say('');
      for (const a of AXES) {
        const grid = a.key === 'assist'
          ? [[10, 1], [20, 1], [30, 1], [40, 1], [10, 2], [20, 2], [30, 2], [10, 3], [20, 3]]
          : [[1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [1, 3], [2, 3]];
        say(`**${a.label}**`);
        say('');
        say(`| recruitKey | 均窗 | ${grid.map(([n, c]) => `N=${n}×${c}場`).join(' | ')} |`);
        say(`|---|---|${[...Array(9)].map(() => '---').join('|')}|`);
        for (const [k, w] of Object.entries(win)) {
          const cells = grid.map(([n, c]) => `${(careerRate(w.careerRows, a.key, n, c) * 100).toFixed(0)}%`);
          say(`| ${k} | ${fx(w.mean, 2)} | ${cells.join(' | ')} |`);
        }
        say('');
      }

      // -- 逐場次（bo 制混淆；門檻若寫「單場 N 次」，這張表決定它在哪一場好過）--
      say('#### 逐場次每場均值（★bo 制混淆★：準決 bo3／決賽 bo5 的「一場」是小組賽的 2–3 倍）');
      say('');
      const mids = [...new Set(all.map((r) => r.matchId))];
      say(`| 場次 | 場數 | ${AXES.map((a) => a.key).join(' | ')} |`);
      say(`|---|---|${AXES.map(() => '---').join('|')}|`);
      for (const m of mids) {
        const rs = all.filter((r) => r.matchId === m);
        say(`| ${m} | ${rs.length} | ${AXES.map((a) => fx(rs.reduce((t, r) => t + valOf(r, a.key), 0) / rs.length, 2)).join(' | ')} |`);
      }
      say('');
      say('> 「單場 ≥ N」的門檻**不是**跨場等價的判準：同一個 N 在決賽比在小組賽好過 2–3 倍。');
      say('> 這是 08-11 `218130e`「門檻與窗口不相稱」的同族陷阱——那次錯在窗口局數，');
      say('> 這裡的變數是**該場的局數**。門檻綁在小組賽對手（north-tech／white-wave／');
      say('> gale-shore／black-pine）上時，只能用小組賽那一列的數字訂。');
      say('');

      // -- 對手別每場均值（門檻對不同對手強度不同）--
      say('#### 逐對手每場均值（門檻若對單一對手訂，要看這張）');
      say('');
      const opps = [...new Set(all.map((r) => r.opponentId))].sort();
      say(`| 對手 | 場數 | ${AXES.map((a) => a.key).join(' | ')} |`);
      say(`|---|---|${AXES.map(() => '---').join('|')}|`);
      for (const o of opps) {
        const rs = all.filter((r) => r.opponentId === o);
        say(`| ${o} | ${rs.length} | ${AXES.map((a) => fx(rs.reduce((t, r) => t + valOf(r, a.key), 0) / rs.length, 2)).join(' | ')} |`);
      }
      say('');
    }
  }
  // ════ 「≈50% 達成」對照表（機械搜出來的，不是手填）════
  say('## 「約 50% 達成」的 (perMatch, count) 組合｜逐招募對象');
  say('');
  say('搜法：對每個招募對象，在 perMatch∈1..60 × count∈1..4 的網格上算經驗生涯達成率，');
  say('取**達成率落在 40–60% 且 count 最大**者（同率時取 count 大＝敘事上「持續做到」比');
  say('「碰運氣一場爆發」好）。搜不到 40–60% 的格子＝該軸在該對象窗口下**無可用門檻**，寫「—」。');
  say('');
  for (const role of ROLES) {
    for (const axisKey of ['assist', 'defense', 'digs', 'assistDigs', 'sr70']) {
      const mine = shards.filter((s) => s.role === role && s.perfect === '0');
      if (!mine.length) continue;
      const all = mine.flatMap((s) => s.rows);
      const win = windowsOf(all);
      const rows = [];
      for (const [k, w] of Object.entries(win)) {
        let best = null;
        for (let c = 4; c >= 1; c -= 1) {
          for (let n = 60; n >= 1; n -= 1) {
            const rate = careerRate(w.careerRows, axisKey, n, c);
            if (rate >= 0.4 && rate <= 0.6) {
              if (!best || c > best.c || (c === best.c && n > best.n)) best = { n, c, rate };
            }
          }
          if (best) break;
        }
        rows.push([k, fx(w.mean, 2), best ? `perMatch=${best.n} × count=${best.c}` : '—',
          best ? `${(best.rate * 100).toFixed(0)}%` : '—']);
      }
      say(`**${role === 'setter' ? 'S' : 'L'}｜${axisKey}**（預設治具臂＝下界）`);
      say('');
      say('| recruitKey | 均窗 | ≈50% 的組合 | 實測達成率 |');
      say('|---|---|---|---|');
      for (const r of rows) say(`| ${r.join(' | ')} |`);
      say('');
    }
  }

  // ════ 量不到的清單（誠實條款；不得用推估補數字）════
  say('## 本次量不到的項目（＋為什麼）');
  say('');
  say('| 量不到的東西 | 原因 |');
  say('|---|---|');
  say('| 真人操作下的任何一條軸 | 治具用 AI 代打主角，沒有玩家意圖模型。所有數字都是 AI 代打值。 |');
  say('| 真人 S 的 `assist` 上下界 | 治具 AI 二傳幾乎每一球都舉（`assist` 均值≈全隊殺球數）⇒ 治具值是**上界**；真人漏舉時球會落給保底自動舉（`matchControls.js:481`，仍記在玩家頭上），所以下界不明、量不到。 |');
  say('| 真人接發品質的**分佈** | 只列舉得到取值集合（上面那張表），拿不到「真人多常抓到 Perfect 窗」的頻率——那要真人試玩取樣。 |');
  say('| `≥0.8` / `≥0.75` / `≥0.7` 在治具裡的差異 | 治具接發品質是 0.75 的**點質量**，三個門檻在治具裡不切分任何東西（實測三欄逐值相同、0.8 恆 0）。差異只存在於真人端，見上面的取值表。 |');
  say('| 第 4 屆以後的窗口 | 生涯只有 3 屆（`VD_SEASONS=3`）。 |');
  say('| 逐出（expel）對窗口的影響 | balance-sim 未建模逐出（`balance-sim.mjs:126` 明載：production 的逐出是玩家手動決定）。 |');
  say('');

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'recruit-axis-distribution.md'), `${L.join('\n')}\n`);
  fs.mkdirSync(path.dirname(MD), { recursive: true });
  fs.writeFileSync(MD, `${L.join('\n')}\n`);
  console.error(`\n[report] 已寫入 ${path.join(OUT, 'recruit-axis-distribution.md')}\n[report] 另存 ${MD}`);
}

// ════════════════════════════════════════════════════════
// 主控（模組鉤子是行程層級的 ⇒ 每臂各一個子行程；並行 RA_JOBS 條）
// ════════════════════════════════════════════════════════
if (ARM) {
  await runArm(ARM);
} else if (process.env.RA_REPORT_ONLY === '1') {
  report();
} else {
  const arms = [];
  for (const role of ROLES) {
    for (const perfect of PERFECTS) {
      for (const base of SEED_BASES) arms.push({ id: armId(role, perfect, base), role, perfect });
    }
  }
  fs.mkdirSync(OUT, { recursive: true });
  console.error(`[主控] ${arms.length} 臂／並行 ${JOBS}／RUNS=${RUNS}／SEASONS=${SEASONS}／輸出 ${OUT}`);
  const t0 = Date.now();
  let idx = 0;
  let failed = 0;
  const runOne = (a) => new Promise((resolve) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
      stdio: ['ignore', 'ignore', 'inherit'],
      env: {
        ...process.env,
        RA_ARM: a.id,
        RA_OUT: OUT,
        RA_RUNS: RUNS,
        VD_FAITHFUL: '1',
        VD_SEASONS: SEASONS,
        VD_ROLE: a.role,
        VD_PLAYER_PERFECT: a.perfect,
      },
    });
    child.on('exit', (code) => {
      if (code !== 0) { failed += 1; console.error(`[主控] 臂 ${a.id} 失敗 exit=${code}`); }
      resolve();
    });
  });
  const worker = async () => {
    while (idx < arms.length) {
      const a = arms[idx];
      idx += 1;
      await runOne(a);
    }
  };
  await Promise.all([...Array(Math.min(JOBS, arms.length))].map(() => worker()));
  console.error(`[主控] 全部完成，耗時 ${((Date.now() - t0) / 1000).toFixed(0)}s，失敗 ${failed} 臂`);
  if (failed) process.exit(1);
  report();
}
