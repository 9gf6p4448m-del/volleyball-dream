// 難度重校卷 · 階段 0（2026-08-11）— 跨屆配對分析：讀兩份 VD_JSON，逐屆算 Δ 與配對 SE
//
// 用法：node tools/paired-analysis.mjs <基準.json> <本次.json>
//   兩份檔案由 `balance-sim.mjs` 的 VD_JSON=<路徑> 產生（各臂 seed 序列相同
//   ＝100000+run*7919 ⇒ 同 run 索引即同種子，逐條相減即為配對差值）。
//
// ★ 為什麼不用 balance-sim 內建的 VD_PAIRED ★
// `VD_PAIRED` 的 perRun 是 `career.results.slice(0, matchIds.length)` ＋ `runSeasons[0]`
// ⇒ 它**只吐第 1 屆**（單屆臂正確，語意刻意不動）。但難度卷要掃的 level ramp
// 第一格恆為 0（第 1 屆已裁定不動）⇒ 用 VD_PAIRED 跑 ramp 臂會看到「全部 Δ＝0」
// 而誤判成「管線正常」——那是**假自驗**，對二三屆零鑑別力。本腳本改吃 VD_JSON
// 的逐屆結構，每一屆各自配對。
//
// 自驗閘：把同一份檔案配對給自己 ⇒ 逐屆每一項 Δ 必須全 0（含「逐條有變」計數）。
//
// 配對 SE ＝ SD(逐條差值) / √n。配對之後 career 之間的變異被抽掉，剩下的才是改動
// 造成的（階段五裁定書 §4.3：未配對絕對值在 n=40 時雜訊自己就能越線）。
import { readFileSync } from 'node:fs';

const [baseFile, armFile] = process.argv.slice(2);
if (!baseFile || !armFile) {
  console.error('用法：node tools/paired-analysis.mjs <基準.json> <本次.json>');
  process.exit(1);
}
const base = JSON.parse(readFileSync(baseFile, 'utf8'));
const arm = JSON.parse(readFileSync(armFile, 'utf8'));

const matchIds = base.matchIds ?? arm.matchIds;
const NATIONAL_INDEX = matchIds.indexOf('national-qf');
const SF_ID = 'national-sf';
const SEASONS = Math.min(base.seasons ?? 1, arm.seasons ?? 1);

// 依 run 索引配對，並**核對種子**——索引對上但種子不同＝兩份檔跑的不是同一批生涯，
// 這時候的「Δ」是兩堆不同樣本相減，比不配對更糟（會被誤讀成有配對）。直接停手。
const n = Math.min(base.perRun.length, arm.perRun.length);
const pairs = [];
for (let i = 0; i < n; i += 1) {
  const b = base.perRun[i];
  const a = arm.perRun[i];
  if (b.seed !== a.seed) {
    console.error(`🔴 run 索引 ${i} 的種子對不上（基準 ${b.seed} vs 本次 ${a.seed}）`
      + '——兩份檔案不是同一批生涯，配對無效。');
    process.exit(2);
  }
  pairs.push([b, a]);
}

// ── 逐屆指標（全部來自 VD_JSON 的 rec；不重建任何被測邏輯）──────────────────
// champion／matchId 勝負＝0|1（單位 pp）；natWins／played／totalWins＝場數（單位「場」）
const metrics = [
  { key: '奪冠率', pp: true, get: (s) => s.champion },
  { key: '決賽帶（準決勝）', pp: true, get: (s) => s.wins[SF_ID] ?? 0 },
  { key: '國賽勝場/5', pp: false, get: (s) => matchIds.slice(NATIONAL_INDEX)
    .reduce((t, id) => t + (s.wins[id] ?? 0), 0) },
  { key: '總勝場', pp: false, get: (s) => matchIds.reduce((t, id) => t + (s.wins[id] ?? 0), 0) },
  // played＝實打場數（STOP_ON_ELIM 下「沒打」與「打了但輸」在 wins 表裡都是 0，
  // 只有這一欄分得出止步在哪一段）
  { key: '實打場數', pp: false, get: (s) => s.played ?? 0 },
  ...matchIds.map((id) => ({ key: id, pp: true, get: (s) => s.wins[id] ?? 0 })),
];

function stat(diffs) {
  const m = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const sd = diffs.length > 1
    ? Math.sqrt(diffs.reduce((a, v) => a + (v - m) ** 2, 0) / (diffs.length - 1)) : 0;
  return { m, se: diffs.length ? sd / Math.sqrt(diffs.length) : NaN, changed: diffs.filter((v) => v !== 0).length };
}
const fmt = (x, pp) => (pp
  ? `${x.m * 100 >= 0 ? '+' : ''}${(x.m * 100).toFixed(1)}pp ± ${(x.se * 100).toFixed(1)}`
  : `${x.m >= 0 ? '+' : ''}${x.m.toFixed(2)} ± ${x.se.toFixed(2)}`);

console.log('\n=== 逐屆配對分析（依 run 索引；配對 SE＝SD(逐條差值)/√n）===');
console.log(`   基準：${base.label ?? '(無標籤)'}　runs=${base.runs} seasons=${base.seasons}`);
console.log(`   本次：${arm.label ?? '(無標籤)'}　runs=${arm.runs} seasons=${arm.seasons}`);
console.log(`   配對成功 ${pairs.length} 條　比對屆數 ${SEASONS}`);

let allZero = true;
for (let s = 0; s < SEASONS; s += 1) {
  console.log(`\n第 ${s + 1} 屆`);
  for (const mt of metrics) {
    const diffs = pairs.map(([b, a]) => mt.get(a.seasons[s]) - mt.get(b.seasons[s]));
    const x = stat(diffs);
    if (x.changed !== 0) allZero = false;
    console.log(`   Δ${String(mt.key).padEnd(18)} ${fmt(x, mt.pp).padStart(18)}`
      + `　（逐條有變 ${x.changed}/${pairs.length}）`);
  }
}

// ── 逐對手配對（錨「對天鷹勝率 ≤20%」用）──────────────────────────────────
// 只納入**兩臂在該屆都遇到該隊**的 run（賽程逐 seed 抽籤 ⇒ 對手集合可能不同）。
// 分母 n 逐隊各異且必印——n 太小的列不得拿來下結論。
// 需要 rec.opponents（balance-sim 階段 0 新增）；舊檔沒有這一欄時整段跳過。
const hasOpp = pairs.length && pairs[0][0].seasons[0]?.opponents;
if (hasOpp) {
  console.log('\n=== 逐對手配對（只計兩臂同屆都遇到的 run；n 逐隊不同，必看分母）===');
  for (let s = 0; s < SEASONS; s += 1) {
    const rows = new Map(); // oppId → { diffs:[], baseWon, armWon }
    for (const [b, a] of pairs) {
      const bo = b.seasons[s].opponents ?? {};
      const ao = a.seasons[s].opponents ?? {};
      const ids = new Set([...Object.values(bo)].filter((id) => Object.values(ao).includes(id)));
      for (const id of ids) {
        // 同一隊在一屆可能出現在多個場次（循環＋淘汰）⇒ 以「該屆對這隊的勝場數」為量
        const wonOf = (rec, map) => Object.entries(map)
          .filter(([, oid]) => oid === id).reduce((t, [mid]) => t + (rec.wins[mid] ?? 0), 0);
        const bw = wonOf(b.seasons[s], bo);
        const aw = wonOf(a.seasons[s], ao);
        const r = rows.get(id) ?? { diffs: [], baseWon: 0, armWon: 0, played: 0 };
        r.diffs.push(aw - bw);
        r.baseWon += bw;
        r.armWon += aw;
        r.played += Object.values(bo).filter((oid) => oid === id).length;
        rows.set(id, r);
      }
    }
    if (!rows.size) continue;
    console.log(`第 ${s + 1} 屆`);
    for (const [id, r] of [...rows].sort((x, y) => y[1].diffs.length - x[1].diffs.length)) {
      const x = stat(r.diffs);
      console.log(`   ${id.padEnd(12)} n=${String(r.diffs.length).padStart(4)}`
        + `　基準 ${r.baseWon}/${r.played} 勝　本次 ${r.armWon}/${r.played} 勝`
        + `　Δ勝場 ${fmt(x, false).padStart(16)}`);
    }
  }
}

console.log(allZero
  ? '\n✅ 逐屆全 0（同檔自我配對時應為此結果＝本腳本自驗閘通過）'
  : '\n⚠ 有差異——若兩份檔案來自同一支臂，配對邏輯本身有問題');
