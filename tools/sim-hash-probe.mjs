// Phase 5 §十 階段一驗收工具 —— sim 行為逐值雜湊比對
//
// ★ 用途 ★
// 證明「機制換了、行為沒換」。§十 階段一要把觸球判定換成 3D 可及球體、
// 把攔網換成帶模型，但**實例化在等價值**上——行為必須與 fa7e3f4 逐值相同。
// 「看起來一樣」不算數，本探針逐 tick 把整個 sim 狀態雜湊起來比對。
//
// ★ 怎麼跑 ★
//   node tools/sim-hash-probe.mjs                  # 跑並與基準檔比對
//   node tools/sim-hash-probe.mjs --write          # 重新產生基準檔（只在拍板允許行為變更時用）
//   node tools/sim-hash-probe.mjs --matches 4      # 每隊場數（預設 2，七隊共 14 局）
//   VD_SEED_BASE=99 node tools/sim-hash-probe.mjs  # 換一組獨立樣本
//
// 基準檔＝ tools/sim-hash-baseline.json（入 repo，可獨立重跑比對）。
//
// ★ 雜湊涵蓋什麼 ★
//   每 tick：phase｜球的 9 個量｜每個 actor 的 6 個量（依 id 排序）｜rally 的 11 個欄位｜
//   雙方比分與局數｜雙方輪轉｜本 tick 發出的所有事件
//   事件與所有物件都經過**遞迴鍵排序**再序列化——重構時調換欄位宣告順序不會造成假陽性；
//   數值用 Number.prototype.toString()（JS 的最短往返表示，兩個不同的 float 不會撞字串）。
//
// ★ 為什麼要跑滿整場 ★
//   只跑幾個 rally 抓不到輪轉、換人、局末、自由人回位這些分支。走生涯真實建隊路徑
//   （careerMatchSetup，與 balance-sim / block-width-probe 同構），雙方 AI 代打。
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createCareer, createCareerPlayer, careerMatchSetup } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { defaultLineup } from '../src/career/lineup.js';
import { OPPONENTS } from '../src/career/opponents.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(HERE, 'sim-hash-baseline.json');
// 基準變更紀錄（--write 自動追加）——對不上時先查這裡是誰改的、為什麼
const CHANGELOG = join(HERE, 'sim-hash-baseline-CHANGELOG.md');
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const mi = args.indexOf('--matches');
const PER_OPPONENT = mi >= 0 ? Number.parseInt(args[mi + 1], 10) : 2;
const SEED_BASE = Number.parseInt(process.env.VD_SEED_BASE ?? '1', 10);
const MAX_TICKS = 400000;

// ---- 正規化序列化：遞迴鍵排序＋數值最短往返表示 ----
function canon(v) {
  if (v === null || v === undefined) return String(v);
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v) ? v.toString() : `#${v}`;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'boolean') return v ? 'T' : 'F';
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (t === 'object') {
    const keys = Object.keys(v).sort();
    return `{${keys.map((k) => `${k}:${canon(v[k])}`).join(',')}}`;
  }
  return `?${t}`;
}

// 一個 tick 的全狀態快照（只取會影響玩法的量；zHistory 是純內部回溯緩衝，不取）
function tickRecord(g, events) {
  const b = g.ball;
  const actorIds = Object.keys(g.actors).sort();
  return canon({
    t: g.tick,
    ph: g.phase,
    ball: [b.x, b.y, b.z, b.vx, b.vy, b.vz, b.px, b.py, b.pz],
    act: actorIds.map((id) => {
      const a = g.actors[id];
      return [id, a.x, a.z, a.blockUntil, a.blockStartTick, a.lastTouchTick, a.divedUntil];
    }),
    rally: {
      flightId: g.rally.flightId,
      profile: g.rally.profile,
      touches: g.rally.touches,
      possession: g.rally.possession,
      lastTouchTeam: g.rally.lastTouchTeam,
      lastToucherId: g.rally.lastToucherId,
      deceiveP: g.rally.deceiveP,
      lastSpikeZone: g.rally.lastSpikeZone,
      serveStyle: g.rally.serveStyle,
      touchLockTick: g.rally.touchLockTick,
      callPid: g.rally.callPid,
    },
    score: [g.match.score.A, g.match.score.B],
    sets: [g.match.sets?.A ?? 0, g.match.sets?.B ?? 0],
    rot: [g.match.rotations.A.join('|'), g.match.rotations.B.join('|')],
    ev: events,
  });
}

function playOne(seed, opponentId) {
  const career = createCareer({ seed });
  const player = createCareerPlayer('探針', { seed });
  const members = buildStarterMembers();
  const lineup = defaultLineup(members, player.id, player.currentRole);
  const roster = { capacity: 12, members, alumni: [] };
  const setup = careerMatchSetup(
    career, player, { id: 'group-1', opponentId }, roster, lineup, 1,
  );
  const g = createGame({
    seed: setup.seed,
    teams: setup.teams,
    aiProfiles: setup.aiProfiles,
    liberos: setup.liberos,
  });
  const ai = createAiState();
  const h = createHash('sha256');
  let ticks = 0;
  while (g.phase !== 'set_over' && g.tick < MAX_TICKS) {
    const ev = stepGame(g, aiCollectIntents(g, ai));
    h.update(tickRecord(g, ev));
    h.update('\n');
    ticks += 1;
  }
  return {
    digest: h.digest('hex').slice(0, 16),
    ticks,
    score: `${g.match.score.A}-${g.match.score.B}`,
  };
}

// ---- 跑 ----
const t0 = Date.now();
const results = [];
for (const opp of OPPONENTS) {
  for (let i = 0; i < PER_OPPONENT; i += 1) {
    const seed = SEED_BASE + i * 101 + OPPONENTS.indexOf(opp) * 7919;
    const r = playOne(seed, opp.id);
    results.push({ opponent: opp.id, seed, ...r });
  }
}
const total = createHash('sha256');
for (const r of results) total.update(`${r.opponent}:${r.seed}:${r.digest}:${r.ticks}\n`);
const totalDigest = total.digest('hex').slice(0, 16);

const snapshot = {
  note: 'Phase 5 §十 階段二：sim 行為逐值雜湊基準（2-B timing 幾何化併入後重立）。'
    + '--write 只在拍板允許行為變更時用，且必須帶 --reason="…"；'
    + '每次改寫的 commit 與理由自動記到 tools/sim-hash-baseline-CHANGELOG.md。',
  seedBase: SEED_BASE,
  perOpponent: PER_OPPONENT,
  total: totalDigest,
  matches: results,
};

console.log(`== sim 逐值雜湊 ==  ${results.length} 局（七隊 × ${PER_OPPONENT}）`
  + `　種子基底 ${SEED_BASE}　耗時 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const r of results) {
  console.log(`  ${r.opponent.padEnd(14)} seed=${String(r.seed).padStart(7)}  `
    + `${r.digest}  ${String(r.ticks).padStart(7)} tick  ${r.score}`);
}
console.log(`  ${'合計'.padEnd(12)} ${' '.repeat(13)}${totalDigest}`);

if (WRITE) {
  // ★ 2026-08-07：改寫基準必須留檔 ★ 起因是這支探針自 5630270（夾塞解封）與
  // 4f6fff6（自由人 dig）兩次**已拍板**的行為變更之後就對不上，連續兩次沒人改寫
  // ⇒ 它變成恆紅訊號，正在訓練使用者忽略它（本專案 feedback_zero_power_checks：
  // 假警報的代價不是吵，是真故障那天看不見）。改寫本身很便宜，「查不到是誰改的」
  // 才是它一再被擱置的原因——所以把 commit 與理由的登記做成**機械強制**。
  const reasonArg = args.find((a) => a.startsWith('--reason='));
  const reason = reasonArg ? reasonArg.slice('--reason='.length).trim() : '';
  if (!reason) {
    console.log('\n❌ --write 必須帶 --reason="這次為什麼允許行為變更"（會寫進 CHANGELOG）。');
    process.exit(2);
  }
  let prevTotal = '（無舊基準）';
  try { prevTotal = JSON.parse(readFileSync(BASELINE, 'utf8')).total ?? prevTotal; } catch { /* 首次建立 */ }
  let head = '（不在 git 工作區）';
  try {
    head = execSync('git rev-parse --short HEAD', { cwd: HERE, encoding: 'utf8' }).trim();
  } catch { /* 無 git 也照寫，只是少一欄 */ }
  const stamp = new Date().toISOString().slice(0, 10);
  const entry = `- ${stamp}　\`${head}\`　${prevTotal} → ${totalDigest}\n  ${reason}\n`;
  let log = '';
  try { log = readFileSync(CHANGELOG, 'utf8'); } catch {
    log = '# sim-hash 基準變更紀錄\n\n'
      + '每一次 `node tools/sim-hash-probe.mjs --write --reason="…"` 自動追加一列。\n'
      + '對不上基準時先看這裡：查得到是哪個 commit、為什麼允許那次行為變更。\n\n';
  }
  writeFileSync(CHANGELOG, log + entry);
  writeFileSync(BASELINE, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`\n基準檔已寫入：${BASELINE}`);
  console.log(`變更紀錄已追加：${CHANGELOG}\n${entry}`);
  process.exit(0);
}

let base;
try {
  base = JSON.parse(readFileSync(BASELINE, 'utf8'));
} catch {
  console.log('\n找不到基準檔——先跑一次 --write 建立基準。');
  process.exit(2);
}
if (base.seedBase !== SEED_BASE || base.perOpponent !== PER_OPPONENT) {
  console.log(`\n參數與基準檔不符（基準 seedBase=${base.seedBase} perOpponent=${base.perOpponent}）`
    + '——換回相同參數才能比對。');
  process.exit(2);
}
const diffs = [];
for (const r of results) {
  const b = base.matches.find((m) => m.opponent === r.opponent && m.seed === r.seed);
  if (!b) { diffs.push(`${r.opponent}:${r.seed} 基準檔無此局`); continue; }
  if (b.digest !== r.digest) {
    diffs.push(`${r.opponent}:${r.seed}  基準 ${b.digest} → 現在 ${r.digest}`
      + `　（tick ${b.ticks}→${r.ticks}　比分 ${b.score}→${r.score}）`);
  }
}
console.log('');
if (!diffs.length && base.total === totalDigest) {
  console.log(`✅ 行為逐值相同（合計 ${totalDigest} ＝ 基準）`);
  process.exit(0);
}
console.log(`❌ 行為有變化——${diffs.length} 局逐值不同（合計 ${base.total} → ${totalDigest}）`);
for (const d of diffs) console.log(`   ${d}`);
process.exit(1);
