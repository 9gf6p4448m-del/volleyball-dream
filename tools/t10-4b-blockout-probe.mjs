// §十-4 第二階段（打手出界／縮手／z 維）開卷前置量測探針
//
// 本探針嚴禁改動 src/ 下任何檔案；只 import 既有純函式與 stepGame 事件流重算。
// 「帶內成員」的前排＋blockUntil 判準是 tryBlock 第一層幾何閘門的鏡射
// （src/sim/game.js:953-964，`isFrontRowOf` 定義於 game.js:1032-1036，未 export，
// 依決定論規則就地鏡射，不另立數值——同 t10-4-ballistic-probe.mjs 對 NET_CLEARANCE 的作法）。
// 刻意不套用 tryBlock 內的 `overBlockerHands` continue：那道閘正是我們要量的
// margin 本身，套用了就會把「手不夠高」的樣本先過濾掉，M2 就量不到真正的分佈。
//
// 跑法：node tools/t10-4b-blockout-probe.mjs [局數=40] [edgeFrac] [topBand]
//   後兩參數（選填）＝Q4 錨定掃描用，in-process 覆寫 TUNING.BLOCK_EDGE_FRAC /
//   BLOCK_TOP_BAND（同 t10-4-jumpcount-frozen 的 TUNING patch 法，src/ 零改動）
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { blockTopEdge } from '../src/sim/player.js';
import { staminaPerfMul } from '../src/sim/stamina.js';
import { otherTeam } from '../src/sim/rotation.js';
import { BALL, COURT } from '../src/sim/constants.js';

const SETS = Number(process.argv[2] ?? 40);
if (process.argv[3] != null) TUNING.BLOCK_EDGE_FRAC = Number(process.argv[3]);
if (process.argv[4] != null) TUNING.BLOCK_TOP_BAND = Number(process.argv[4]);

// 扣球型態分組：quick 保留；left/cross/right 併為兩翼；pipe/dball 併為後排。
// 'tip' 另外用出手品質（timing<=0.45）判定，同 classifySpikeZone 的吊球門檻
// （game.js:342），與 t10-4-ballistic-probe.mjs 的 GROUP 同款慣例。
const ATTACK_GROUP = {
  quick: 'quick', left: 'wing', cross: 'wing', right: 'wing', pipe: 'back', dball: 'back',
};
const GROUP_LABEL = { quick: '快攻', wing: '兩翼', back: '後排攻擊', tip: '輕吊', other: '未分類' };

// isFrontRowOf 鏡射（game.js:1032-1036）：2/3/4 號位＝輪轉序 index 1/2/3
function isFrontRowOf(game, team, playerId) {
  const rot = game.match.rotations[team];
  const idx = rot.indexOf(playerId);
  return idx === 1 || idx === 2 || idx === 3;
}

// tryBlock 第一層幾何閘門的鏡射（不含 overBlockerHands 高度閘——見檔頭說明）
function frontRowBlockers(game, toTeam, tick) {
  const members = [];
  for (const p of Object.values(game.players)) {
    if (p.teamId !== toTeam) continue;
    if (!isFrontRowOf(game, toTeam, p.id)) continue;
    const actor = game.actors[p.id];
    if (actor.blockUntil < tick) continue; // 不在 block 窗內＝沒在跳
    const airT = tick - actor.blockStartTick;
    members.push({ id: p.id, top: blockTopEdge(p, airT, staminaPerfMul(game, p)) });
  }
  return members;
}

function runSet(seed, out) {
  const game = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const prevBlockStartTick = {};
  for (const id of Object.keys(game.actors)) prevBlockStartTick[id] = game.actors[id].blockStartTick;
  const pendingAttack = { A: null, B: null }; // { kind, power } 記錄最近一次扣球觸球資訊
  let openGrazes = []; // 本 rally 內尚未結算的 graze 記錄
  let grazeCountThisSet = 0;

  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'set_break' && guard < 400000) {
    guard += 1;
    const tickNow = game.tick;
    const intents = aiCollectIntents(game, ai);
    const ev = stepGame(game, intents);

    // ---- M3a：攔網起跳 tick 的 actor.z（比對 blockStartTick 是否本 tick 剛設定）----
    for (const id of Object.keys(game.actors)) {
      const a = game.actors[id];
      if (a.blockStartTick === tickNow && prevBlockStartTick[id] !== tickNow) {
        // |z|＝離網深度：A/B 兩隊 z 正負相反，原始值合併會產生假雙峰，改記距離
        out.m3BlockerZ.push(Math.abs(a.z));
      }
      prevBlockStartTick[id] = a.blockStartTick;
    }

    for (let i = 0; i < ev.length; i += 1) {
      const e = ev[i];

      // ---- M3b + M2 資料底：扣球觸球瞬間 ----
      if (e.type === 'TOUCH') {
        if (e.kind === 'spike') {
          out.m3SpikerZ.push(Math.abs(game.actors[e.playerId].z)); // |z|＝離網深度，理由同上
          pendingAttack[e.team] = { kind: ai.attackKind, power: e.power };
        } else {
          pendingAttack[e.team] = null; // 同隊非扣球觸球＝上一波扣球流程已結束，作廢殘留
        }
      }

      // ---- M1：擦手後續追蹤（先結算既有 open graze 的「下一次觸球」）----
      if (e.type === 'TOUCH' || e.type === 'BLOCK_TOUCH') {
        for (const g of openGrazes) {
          if (g.ticksToNext == null) { g.ticksToNext = e.tick - g.tick; g.untouched = false; }
        }
      }
      if (e.type === 'BLOCK_TOUCH' && e.graze) {
        openGrazes.push({ tick: e.tick, team: e.team, zone: e.zone ?? null, ticksToNext: null, untouched: null });
        grazeCountThisSet += 1;
      }

      // ---- M2：扣球過網瞬間（BALL_OVER_NET 或 BLOCK_TOUCH 皆為過網事件）----
      if (e.type === 'BALL_OVER_NET' || e.type === 'BLOCK_TOUCH') {
        const toTeam = e.toTeam ?? e.team;
        const attackTeam = otherTeam(toTeam);
        const info = pendingAttack[attackTeam];
        if (info) {
          pendingAttack[attackTeam] = null;
          const group = info.power <= 0.45 ? 'tip' : (ATTACK_GROUP[info.kind] ?? 'other');
          const members = frontRowBlockers(game, toTeam, e.tick);
          const maxTop = members.length ? Math.max(...members.map((m) => m.top)) : null;
          const ballY = game.ball.y;
          out.m2Rows.push({
            group, ballY, maxTop, nBlockers: members.length,
            margin: maxTop == null ? null : ballY - maxTop,
          });
        }
      }

      // ---- M1：rally 結束結算 open graze ----
      if (e.type === 'DEAD_BALL') {
        let winner = null;
        for (let j = i + 1; j < ev.length; j += 1) {
          if (ev[j].type === 'SCORE') { winner = ev[j].team; break; }
        }
        for (const g of openGrazes) {
          if (g.ticksToNext == null) { g.ticksToNext = e.tick - g.tick; g.untouched = true; }
          // 出界方向分類（Q3① 驗收證據）：側線＝|x|>半場寬、否則深區/底線
          const outKind = e.reason !== 'OUT' ? null
            : (Math.abs(game.ball.x) > COURT.WIDTH / 2 ? 'sideline' : 'deep');
          out.grazeRecords.push({
            reason: e.reason, winner, winnerIsAttacker: winner === otherTeam(g.team),
            zone: g.zone, outKind, ticksToNext: g.ticksToNext, untouched: g.untouched,
          });
        }
        openGrazes = [];
        pendingAttack.A = null;
        pendingAttack.B = null;
      }
    }
  }
  out.grazePerSet.push(grazeCountThisSet);
}

const out = { grazeRecords: [], grazePerSet: [], m2Rows: [], m3BlockerZ: [], m3SpikerZ: [] };
for (let s = 1; s <= SETS; s += 1) runSet(s * 101, out);

// ---- 統計工具 ----
function pct(arr, p) {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}
function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN; }
function fmt(n, d = 3) { return Number.isFinite(n) ? n.toFixed(d) : '  -  '; }
function pctStr(n, total) { return total ? `${((n / total) * 100).toFixed(1)}%` : '  -  '; }

console.log(`=== §十-4b 開卷前置量測（${SETS} 局）===`);

// ==== M1 ====
console.log('\n--- M1 擦手（BLOCK_TOUCH graze）後續下場 ---');
const grazes = out.grazeRecords;
console.log(`graze 總數：${grazes.length}　每局均值：${fmt(mean(out.grazePerSet), 2)}`
  + `（各局分布 min=${Math.min(...out.grazePerSet)} max=${Math.max(...out.grazePerSet)}）`);
if (grazes.length) {
  const attackerWin = grazes.filter((g) => g.winnerIsAttacker).length;
  console.log(`勝方：攻方 ${attackerWin} (${pctStr(attackerWin, grazes.length)})　`
    + `攔網方 ${grazes.length - attackerWin} (${pctStr(grazes.length - attackerWin, grazes.length)})`);
  const reasons = {};
  for (const g of grazes) reasons[g.reason] = (reasons[g.reason] ?? 0) + 1;
  console.log('死球原因分布：', Object.entries(reasons)
    .map(([r, n]) => `${r}=${n}(${pctStr(n, grazes.length)})`).join('  '));
  const zones = {};
  for (const g of grazes) zones[g.zone ?? 'n/a'] = (zones[g.zone ?? 'n/a'] ?? 0) + 1;
  console.log('zone 分佈：', Object.entries(zones)
    .map(([z, n]) => `${z}=${n}(${pctStr(n, grazes.length)})`).join('  '));
  for (const zk of ['top', 'side']) {
    const zg = grazes.filter((g) => g.zone === zk);
    if (!zg.length) continue;
    const zUntouchedOut = zg.filter((g) => g.untouched && g.reason === 'OUT');
    const zAtkWin = zg.filter((g) => g.winnerIsAttacker).length;
    const deep = zUntouchedOut.filter((g) => g.outKind === 'deep').length;
    const sideL = zUntouchedOut.filter((g) => g.outKind === 'sideline').length;
    console.log(`  ${zk}：攻方勝 ${pctStr(zAtkWin, zg.length)}　未觸即 OUT ${pctStr(zUntouchedOut.length, zg.length)}`
      + `（深區/底線 ${deep}　側線 ${sideL}）`);
  }
  const untouched = grazes.filter((g) => g.untouched);
  const untouchedOut = untouched.filter((g) => g.reason === 'OUT').length;
  const untouchedIn = untouched.filter((g) => g.reason === 'BALL_IN').length;
  console.log(`擦手後無人再觸直接死球：${untouched.length} (${pctStr(untouched.length, grazes.length)})　`
    + `其中 OUT=${untouchedOut}（＝「事實上的打手出界」，占全體 graze 的 ${pctStr(untouchedOut, grazes.length)}）　`
    + `BALL_IN=${untouchedIn}`);
  const touchedTicks = grazes.filter((g) => !g.untouched).map((g) => g.ticksToNext);
  const untouchedTicks = untouched.map((g) => g.ticksToNext);
  console.log(`擦手→下一次觸球 tick 數（有觸到，n=${touchedTicks.length}）：`
    + `mean=${fmt(mean(touchedTicks), 1)} p50=${fmt(pct(touchedTicks, 0.5), 1)} p90=${fmt(pct(touchedTicks, 0.9), 1)}`);
  console.log(`擦手→落地 tick 數（無人再觸，n=${untouchedTicks.length}）：`
    + `mean=${fmt(mean(untouchedTicks), 1)} p50=${fmt(pct(untouchedTicks, 0.5), 1)} p90=${fmt(pct(untouchedTicks, 0.9), 1)}`);
} else {
  console.log('無 graze 樣本，拿不到 M1 分佈。');
}

// ==== M2 ====
console.log('\n--- M2 扣球過網高度 vs 攔網手頂邊餘裕（margin = ballY − maxBlockTopEdge） ---');
const m2Groups = { tip: [], quick: [], wing: [], back: [], other: [] };
for (const r of out.m2Rows) (m2Groups[r.group] ?? m2Groups.other).push(r);
console.log('組         n     無人在跳%    margin(有跳者) p10    p50    p90     ballY p50   maxTop p50');
for (const key of ['tip', 'quick', 'wing', 'back', 'other']) {
  const g = m2Groups[key];
  if (!g.length) { console.log(`${GROUP_LABEL[key].padEnd(10)}   0`); continue; }
  const noBlocker = g.filter((r) => r.maxTop == null).length;
  const margins = g.filter((r) => r.maxTop != null).map((r) => r.margin).sort((a, b) => a - b);
  const ballYs = g.map((r) => r.ballY).sort((a, b) => a - b);
  const tops = g.filter((r) => r.maxTop != null).map((r) => r.maxTop).sort((a, b) => a - b);
  console.log(
    `${GROUP_LABEL[key].padEnd(10)} ${String(g.length).padStart(4)}   ${pctStr(noBlocker, g.length).padStart(6)}      `
    + `${fmt(pct(margins, 0.1))}  ${fmt(pct(margins, 0.5))}  ${fmt(pct(margins, 0.9))}   `
    + `${fmt(pct(ballYs, 0.5))}       ${fmt(pct(tops, 0.5))}`,
  );
}
console.log(`（margin 統計只計「至少一名前排成員在 block 窗內」的樣本；「無人在跳%」即無人搆得到的過網次數占比）`);

// ==== M3 ====
console.log('\n--- M3 |z| 離網深度分佈（網在 z=0；A/B 兩隊 z 正負相反，合併統計改記絕對距離避免假雙峰） ---');
function zLine(label, arr) {
  if (!arr.length) { console.log(`${label}：無樣本`); return; }
  const s = [...arr].sort((a, b) => a - b);
  console.log(`${label}（n=${s.length}）：p10=${fmt(pct(s, 0.1))}  p50=${fmt(pct(s, 0.5))}  p90=${fmt(pct(s, 0.9))}`
    + `　min=${fmt(s[0])} max=${fmt(s[s.length - 1])}`);
}
zLine('攔網起跳 tick 攔網者 |z|', out.m3BlockerZ);
zLine('扣球觸球瞬間扣球者 |z| ', out.m3SpikerZ);

// ==== M4 ====
console.log('\n--- M4 常數與掛點盤點 ---');
console.log(`TUNING.BLOCK_REACH_X (=BLOCK_HALF_WIDTH) = ${TUNING.BLOCK_REACH_X}   （src/sim/game.js:61，真相在 src/sim/blockBand.js:37-42）`);
console.log(`TUNING.BLOCK_WINDOW              = ${TUNING.BLOCK_WINDOW}   （src/sim/game.js:56）`);
console.log(`TUNING.BLOCK_EDGE_FRAC           = ${TUNING.BLOCK_EDGE_FRAC}   （§十-4b 側緣區佔半寬比例）`);
console.log(`TUNING.BLOCK_TOP_BAND            = ${TUNING.BLOCK_TOP_BAND}   （§十-4b 擦頂窄條厚度 m）`);
console.log(`TUNING.BLOCK_GRAZE_SLOW          = ${TUNING.BLOCK_GRAZE_SLOW}   擦側速度保留比`);
console.log(`TUNING.BLOCK_GRAZE_TOP_SLOW      = ${TUNING.BLOCK_GRAZE_TOP_SLOW}   擦頂速度保留比`);
console.log(`solid 機率公式 chance = 0.12 + block×0.004（×scoutBlockMul，手身區才擲）`);
console.log(`幾何擦手分區 classifyBlockContact（top/side/body）   （src/sim/blockBand.js 尾部）`);
console.log(`isFrontRowOf（2/3/4 號位前排判定，未 export）   （src/sim/game.js:1032-1036）`);
console.log(`tryBlock 幾何閘門＋blockTopEdge 高度閘（overBlockerHands continue）`
  + `   （src/sim/game.js:946-1030，閘門在 953-964）`);
console.log(`blockTopEdge(p, t, jumpMul) 頂邊隨跳躍相位公式   （src/sim/player.js:128-133）`);
console.log(`buildBand / bandContact / overBlockerHands（幾何閘門用純函式）`
  + `   （src/sim/blockBand.js:56-61,93-103,106-108）`);
console.log(`NET_HEIGHT=${COURT.NET_HEIGHT}   （src/sim/constants.js:16）　BALL.RADIUS=${BALL.RADIUS}   （src/sim/constants.js:22）`);
