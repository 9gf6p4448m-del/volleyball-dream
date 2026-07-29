// Phase 5 §十「讓 sim 誠實」量測探針 ①——攔網手的橫移與牆的實際寬度
//
// ★ 用途 ★
// 回答三個「這個值是多少」的問題（不下判斷、不改任何行為；純觀測）：
//   ① 攔網手在「二傳觸球 → 攻擊手擊球」窗口內的實際橫向位移 |Δx| 的分佈
//   ② 擊球瞬間，防守方前排三人（依 x 排序）相鄰配對的站距 |Δx| 分佈
//   ③ 擊球瞬間，防守方前排「實際處於攔網窗內」（actor.blockUntil > tick）的人數分佈
//      （若絕大多數只有 1 人在窗內，②的站距分佈就沒有代表性——故本項與②同表呈現）
//   ＋（附加欄）球過網瞬間（BALL_OVER_NET，＝ tryBlock 真正結算的那一刻）
//      在窗內的人數分佈——tryBlock 的條件是 blockUntil >= tick，故本欄用 >=
//
// ★ 怎麼跑 ★
//   node tools/phase5-block-width-probe.mjs [每個對手的場數=8]
//   環境變數 VD_SEED_BASE（預設 1）＝生涯種子基底，換它可換一組獨立樣本。
//   全決定論：同參數同輸出。跑一場 25 分單局、七隊各跑 N 場（預設 7×8＝56 局）。
//
// ★ 建隊路徑 ★
//   走生涯真實路徑 careerMatchSetup（A＝遊隼高中先發名冊＋主角；B＝opponents.js
//   參數檔建隊），與 tools/balance-sim.mjs 的基準臂同構；雙方皆 AI 代打。
//
// ★ 窗口定義 ★
//   起點＝事件流中 TOUCH{kind:'set', touches:2} 的那一 tick（二傳觸球）
//   終點＝同一隊接下來的 TOUCH{kind:'spike'} 的那一 tick（攻擊手擊球）
//   期間若對方觸球/回合結束/該隊改打非 spike（arc 過網）＝該窗作廢不計。
//   受測對象＝**防守方**（＝非持球方）當下輪轉的前排三人。
//
// ★ 輸出欄位的意思 ★
//   n            ＝樣本數（① ③ 以「人次／窗次」計，見各表標題）
//   p50/p90      ＝該分佈的第 50／90 百分位（線性內插）
//   min/max      ＝最小／最大值
//   |Δx| 淨位移   ＝窗口結束 x − 窗口開始 x 的絕對值（工單第 1 題①問的量）
//   |Δx| 累積路徑 ＝窗口內逐 tick |x(t)−x(t−1)| 的總和（附加欄：區分「移動後又折回」）
//   窗長 tick     ＝窗口的 tick 數（60Hz；除以 60 ＝秒）
//   相鄰站距      ＝擊球瞬間前排三人依 x 排序後，兩組相鄰配對的 |Δx|（每窗貢獻 2 筆）
//   窗內人數      ＝擊球瞬間 blockUntil > tick 的前排人數（0/1/2/3 各佔比）
import { createCareer, createCareerPlayer, careerMatchSetup } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { defaultLineup } from '../src/career/lineup.js';
import { OPPONENTS } from '../src/career/opponents.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { isFrontRow, otherTeam } from '../src/sim/rotation.js';

const PER_OPPONENT = Number.parseInt(process.argv[2] ?? '8', 10);
const SEED_BASE = Number.parseInt(process.env.VD_SEED_BASE ?? '1', 10);
const MAX_TICKS = 400000;

// ---- 樣本收集器 ----
const dxNet = [];       // ① 每名前排防守者每個窗口一筆
const dxPath = [];      // ①附加
const winTicks = [];    // 窗長
const gaps = [];        // ② 相鄰站距（每窗 2 筆）
const gapsAtNet = [];   // ②附加：只計「兩人都貼網」（|z| <= NET_Z）的相鄰配對
const atNetHist = [0, 0, 0, 0]; // ②附加：擊球瞬間前排貼網人數（|z| <= NET_Z）
const NET_Z = 1.2;      // 「貼網」判準（m）：攔網站位深度 AI.BLOCK_LZ=0.6，
                        // 讓開/遠側翼撤退位在 |z|=2.6——1.2 落在兩者之間
const inWindowHist = [0, 0, 0, 0]; // ③ 擊球瞬間 blockUntil > tick 的人數
const overNetHist = [0, 0, 0, 0];  // 附加：球過網瞬間 blockUntil >= tick 的人數
let windows = 0;
let spikesSeen = 0;
let rallies = 0;

function pct(arr, p) {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}

function statLine(label, arr, unit = 'm') {
  const f = (v) => (Number.isNaN(v) ? '  n/a' : v.toFixed(3));
  return `${label.padEnd(18)} n=${String(arr.length).padStart(6)}  `
    + `p50=${f(pct(arr, 0.5))}${unit}  p90=${f(pct(arr, 0.9))}${unit}  `
    + `min=${f(Math.min(...arr))}${unit}  max=${f(Math.max(...arr))}${unit}`;
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

  // 開啟中的窗口（同時只可能有一個——一次只有一隊在組織）
  let win = null;

  while (g.phase !== 'set_over' && g.tick < MAX_TICKS) {
    const ev = stepGame(g, aiCollectIntents(g, ai));

    // 窗口內逐 tick 累積路徑（在事件處理之前結算——本 tick 位移已發生）
    if (win) {
      for (const s of win.blockers) {
        const x = g.actors[s.id].x;
        s.path += Math.abs(x - s.prev);
        s.prev = x;
      }
    }

    for (const e of ev) {
      if (e.type === 'TOUCH') {
        if (e.kind === 'spike') spikesSeen += 1;
        if (win && e.team === win.atkTeam && e.kind === 'spike') {
          // 窗口正常結束：結算 ①②③
          closeWindow(g, win);
          win = null;
          continue;
        }
        if (win) { win = null; } // 任何其他觸球＝該窗作廢
        if (e.kind === 'set' && e.touches === 2) {
          const def = otherTeam(e.team);
          const rot = g.match.rotations[def];
          const front = rot.filter((id) => isFrontRow(rot, id));
          win = {
            atkTeam: e.team,
            defTeam: def,
            startTick: g.tick,
            blockers: front.map((id) => ({
              id, x0: g.actors[id].x, prev: g.actors[id].x, path: 0,
            })),
          };
        }
      } else if (e.type === 'BALL_OVER_NET' && pendingOverNet) {
        const rot = g.match.rotations[e.toTeam];
        const front = rot.filter((id) => isFrontRow(rot, id));
        let k = 0;
        for (const id of front) if (g.actors[id].blockUntil >= g.tick) k += 1;
        overNetHist[Math.min(3, k)] += 1;
        pendingOverNet = false;
      } else if (e.type === 'DEAD_BALL' || e.type === 'SIDE_SWITCH') {
        win = null;
      }
    }
    if (g.phase === 'serve') { win = null; }
  }
  return g;
}

// 「上一次的攻擊擊球後、球尚未過網」的旗標：只統計扣球窗之後的第一次過網
let pendingOverNet = false;

function closeWindow(g, win) {
  windows += 1;
  winTicks.push(g.tick - win.startTick);
  for (const s of win.blockers) {
    dxNet.push(Math.abs(g.actors[s.id].x - s.x0));
    dxPath.push(s.path);
  }
  // ② 相鄰站距（依 x 排序後兩組相鄰配對）
  const xs = win.blockers.map((s) => g.actors[s.id].x).sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i += 1) gaps.push(Math.abs(xs[i] - xs[i - 1]));
  // ②附加：只取貼網者（|z| <= NET_Z）——遠側翼撤退補吊球者站在 |z|≈2.6，不是牆的一部分
  const near = win.blockers
    .filter((s) => Math.abs(g.actors[s.id].z) <= NET_Z)
    .map((s) => g.actors[s.id].x)
    .sort((a, b) => a - b);
  atNetHist[Math.min(3, near.length)] += 1;
  for (let i = 1; i < near.length; i += 1) gapsAtNet.push(Math.abs(near[i] - near[i - 1]));
  // ③ 擊球瞬間在攔網窗內的人數（工單指定條件：blockUntil > tick）
  let k = 0;
  for (const s of win.blockers) if (g.actors[s.id].blockUntil > g.tick) k += 1;
  inWindowHist[Math.min(3, k)] += 1;
  pendingOverNet = true;
}

// ---- 跑 ----
const t0 = Date.now();
for (const opp of OPPONENTS) {
  for (let i = 0; i < PER_OPPONENT; i += 1) {
    playOne(SEED_BASE + i * 101 + OPPONENTS.indexOf(opp) * 7919, opp.id);
    rallies += 1;
  }
}

const pctOf = (hist) => {
  const total = hist.reduce((a, b) => a + b, 0) || 1;
  return hist.map((v) => `${((v / total) * 100).toFixed(1)}%`);
};

console.log('== 佈景 ==');
console.log(`七隊 × ${PER_OPPONENT} 局＝${rallies} 局（單局 25 分，雙方 AI 代打）；`
  + `種子基底 VD_SEED_BASE=${SEED_BASE}；耗時 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`全場扣球擊球數＝${spikesSeen}；有效「二傳→擊球」窗口數＝${windows}`);
console.log('');
console.log('== ① 攔網手（防守方前排三人）在窗口內的橫向位移 ==');
console.log(statLine('|Δx| 淨位移', dxNet));
console.log(statLine('|Δx| 累積路徑', dxPath));
console.log(statLine('窗長（tick）', winTicks, ''));
console.log('');
console.log('== ② 擊球瞬間，前排相鄰配對的站距 ==');
console.log(statLine('相鄰站距（全前排）', gaps));
console.log(statLine('相鄰站距（僅貼網）', gapsAtNet));
console.log(`貼網人數（|z|<=${NET_Z}m）分佈　窗次 n=${windows}　`
  + `0人 / 1人 / 2人 / 3人 ＝ ${pctOf(atNetHist).join(' / ')}　（原始：${atNetHist.join(' / ')}）`);
console.log('');
console.log('== ③ 擊球瞬間，前排實際在攔網窗內（blockUntil > tick）的人數分佈 ==');
console.log(`窗次 n=${windows}　0人 / 1人 / 2人 / 3人 ＝ ${pctOf(inWindowHist).join(' / ')}`);
console.log(`（原始計數：${inWindowHist.join(' / ')}）`);
console.log('');
console.log('== 附加：球過網瞬間（BALL_OVER_NET＝tryBlock 結算點）在窗內（>=tick）的人數 ==');
const overNetN = overNetHist.reduce((a, b) => a + b, 0);
console.log(`過網次 n=${overNetN}　0人 / 1人 / 2人 / 3人 ＝ ${pctOf(overNetHist).join(' / ')}`);
console.log(`（原始計數：${overNetHist.join(' / ')}）`);
