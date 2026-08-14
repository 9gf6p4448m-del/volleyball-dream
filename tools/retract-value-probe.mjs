// retract（縮手）價值探針 —— 大學卷批 7 前置調查
//
// ★ 目的 ★
// 決定「retract 這一檔攔網手要不要做」。全部走真實 sim 路徑
// （createGame / stepGame / aiCollectIntents，仿 tools/sim-hash-probe.mjs 的跑法），
// 不重寫任何攔網結算邏輯——本檔零判定邏輯抄寫，只讀 stepGame 吐出的事件流。
//
// ★ 怎麼跑 ★
//   node tools/retract-value-probe.mjs                 # 預設每隊 25 局（七隊 175 局）
//   node tools/retract-value-probe.mjs --matches 40     # 每隊場數
//   VD_SEED_BASE=99 node tools/retract-value-probe.mjs  # 換一組獨立樣本
//
// ★ 量三件事 ★
//   1. 基礎發生率：正常 AI 對打（blockHand 全程 'vertical'，與正式版現況相同）下，
//      BLOCK_TOUCH 事件的 zone 分佈（top/side/body），以及每個 zone 觸後的三分結局
//      （攔網方直接得分／直接失分／續打後才分勝負——判準＝下一個 SCORE 事件前
//      有沒有出現過 TOUCH 事件，沒有就是「直接」，SCORE 記給誰就是誰贏）。
//   2/3. retract 的機會成本／press 的增益：同一顆球的「有牆 vs 換手態」對照。
//      決定論下換手態會讓 rand() 消費量分岔、全場走向跟著岔開，因此**只取每場的
//      第一次「扣球觸網判定」**做配對比較——那一刻之前，intent.hand 是這場唯一被
//      我們動過的欄位、且 blockHand 在 tryBlock 以外處處不讀，所以三個版本
//      （natural／forced-retract／forced-press）在第一次判定前必然逐 tick 全同。
//      配對前實際比對三版本在那一 tick 的球狀態（x/y/z/vx/vy/vz）逐值相等，
//      證據見下方「配對驗證」欄——不是假設，是每一對都驗過。
//      forced-retract／forced-press 都是把**兩隊所有**攔網 intent 的 hand 蓋掉
//      （不分場上是哪隊在防守），對應「這面牆全場都不存在／全場都在壓」的極端
//      版本，比只改單一球員訊號更乾淨、也更貼合「這一檔到底值不值得做」的問題。
//   量的是「這一次判定所屬的這一分，最後誰贏」（defTeam 是不是贏家）——
//   不是「這一觸的立即結局」，因為「有牆」與「沒有牆」影響的是整分的防守機會，
//   不是一次觸球。
//
// ★ 不改動 ★ src/ 任何檔案、既有 tools/ 腳本、sim-hash-baseline.json、任何測試檔。
import { createCareer, createCareerPlayer, careerMatchSetup } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { defaultLineup } from '../src/career/lineup.js';
import { OPPONENTS } from '../src/career/opponents.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

const args = process.argv.slice(2);
const mi = args.indexOf('--matches');
const PER_OPPONENT = mi >= 0 ? Number.parseInt(args[mi + 1], 10) : 25;
const SEED_BASE = Number.parseInt(process.env.VD_SEED_BASE ?? '1', 10);
const MAX_TICKS = 400000;

function bump(obj, key) { obj[key] = (obj[key] ?? 0) + 1; }

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
    seed: setup.seed,
    teams: setup.teams,
    aiProfiles: setup.aiProfiles,
    liberos: setup.liberos,
  });
  const ai = createAiState();
  return { g, ai };
}

function ballSnap(g) {
  const b = g.ball;
  return { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz };
}

function ballEqual(a, b) {
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.z === b.z
    && a.vx === b.vx && a.vy === b.vy && a.vz === b.vz;
}

// forceHand=null → 自然（AI 現況恆 'vertical'）；'retract'／'press' → 蓋掉全部攔網 intent 的 hand。
// 回傳：zoneCounts/outcomeCounts（只有 forceHand===null 時才有意義、其餘版本半路就跳出不收）、
// firstEncounter（{tick, ball, defTeam, kind, zone}）、feOutcome（{winner, defWon}）。
function runOne(seed, opponentId, forceHand, { fullRun } = {}) {
  const { g, ai } = setupGame(seed, opponentId);
  const zoneCounts = { top: 0, side: 0, body: 0 };
  const outcomeCounts = { top: {}, side: {}, body: {} };
  let pending = null;
  let firstEncounter = null;
  let feOutcome = null;
  let ticks = 0;
  while (g.phase !== 'set_over' && g.tick < MAX_TICKS) {
    const intents = aiCollectIntents(g, ai);
    if (forceHand) {
      for (const it of intents) {
        if (it.action === 'block') it.hand = forceHand;
      }
    }
    const wasSpike = g.rally.profile === 'spike';
    const tickNow = g.tick;
    const snap = wasSpike ? ballSnap(g) : null;
    const ev = stepGame(g, intents);
    ticks += 1;
    if (!firstEncounter && wasSpike) {
      const hit = ev.find((e) => e.type === 'BLOCK_TOUCH' || e.type === 'BALL_OVER_NET');
      if (hit) {
        const defTeam = hit.type === 'BLOCK_TOUCH' ? hit.team : hit.toTeam;
        firstEncounter = {
          tick: tickNow, ball: snap, defTeam, kind: hit.type, zone: hit.zone ?? null,
        };
      }
    }
    let deadBallReason = null;
    for (const e of ev) {
      if (e.type === 'DEAD_BALL') { deadBallReason = e.reason; continue; }
      if (e.type === 'BLOCK_TOUCH') {
        const zone = e.zone ?? 'body';
        if (fullRun) zoneCounts[zone] += 1;
        pending = { toTeam: e.team, zone };
        continue;
      }
      if (pending) {
        if (e.type === 'TOUCH') {
          if (fullRun) bump(outcomeCounts[pending.zone], 'continued');
          pending = null;
        } else if (e.type === 'SCORE') {
          if (fullRun) {
            const lossDirect = e.team !== pending.toTeam;
            bump(outcomeCounts[pending.zone], lossDirect ? 'block_loss_direct' : 'block_win_direct');
            // 出界（OUT，未觸地即判失） vs 落地未接（BALL_IN，落在防守方半場但沒人碰到）
            // ——game.js:1296 的「~6%」講的是前者，不是「直接失分」整體，兩者要分開比對
            if (lossDirect) {
              bump(outcomeCounts[pending.zone], deadBallReason === 'OUT' ? 'loss_out' : 'loss_ballin');
            }
          }
          pending = null;
        }
      }
      if (firstEncounter && !feOutcome && e.type === 'SCORE') {
        feOutcome = { winner: e.team, defWon: e.team === firstEncounter.defTeam };
      }
    }
    // 短跑模式（forced 版本）：拿到第一次判定的結局就夠了，不必跑完整場
    if (!fullRun && firstEncounter && feOutcome) break;
  }
  return {
    zoneCounts, outcomeCounts, firstEncounter, feOutcome, ticks,
  };
}

function proportion(k, n) {
  if (n === 0) return null;
  return k / n;
}
function seStr(p, n) {
  if (p === null || n === 0) return 'n/a';
  const se = Math.sqrt((p * (1 - p)) / n);
  return `${(p * 100).toFixed(1)}% ± ${(1.96 * se * 100).toFixed(1)}pp (n=${n})`;
}

// ---- 主跑 ----
const t0 = Date.now();
const zoneCounts = { top: 0, side: 0, body: 0 };
const outcomeCounts = { top: {}, side: {}, body: {} };
let totalTicks = 0;
let matches = 0;

// measure 2/3 配對樣本
let pairedRetract = { n: 0, verified: 0, natDefWon: 0, forcedDefWon: 0 };
let pairedPress = { n: 0, verified: 0, natDefWon: 0, forcedDefWon: 0, topOnlyN: 0, topOnlyNatWon: 0, topOnlyForcedWon: 0 };

for (const opp of OPPONENTS) {
  for (let i = 0; i < PER_OPPONENT; i += 1) {
    const seed = SEED_BASE + i * 101 + OPPONENTS.indexOf(opp) * 7919;
    matches += 1;

    const nat = runOne(seed, opp.id, null, { fullRun: true });
    totalTicks += nat.ticks;
    for (const z of ['top', 'side', 'body']) {
      zoneCounts[z] += nat.zoneCounts[z];
      for (const [k, v] of Object.entries(nat.outcomeCounts[z])) {
        outcomeCounts[z][k] = (outcomeCounts[z][k] ?? 0) + v;
      }
    }

    if (nat.firstEncounter && nat.feOutcome) {
      // --- retract 配對 ---
      const ret = runOne(seed, opp.id, 'retract', { fullRun: false });
      pairedRetract.n += 1;
      if (ret.firstEncounter && ballEqual(nat.firstEncounter.ball, ret.firstEncounter.ball)
          && nat.firstEncounter.tick === ret.firstEncounter.tick) {
        pairedRetract.verified += 1;
        if (ret.feOutcome) {
          pairedRetract.natDefWon += nat.feOutcome.defWon ? 1 : 0;
          pairedRetract.forcedDefWon += ret.feOutcome.defWon ? 1 : 0;
        }
      }

      // --- press 配對 ---
      const prs = runOne(seed, opp.id, 'press', { fullRun: false });
      pairedPress.n += 1;
      if (prs.firstEncounter && ballEqual(nat.firstEncounter.ball, prs.firstEncounter.ball)
          && nat.firstEncounter.tick === prs.firstEncounter.tick) {
        pairedPress.verified += 1;
        if (prs.feOutcome) {
          pairedPress.natDefWon += nat.feOutcome.defWon ? 1 : 0;
          pairedPress.forcedDefWon += prs.feOutcome.defWon ? 1 : 0;
          if (nat.firstEncounter.zone === 'top') {
            pairedPress.topOnlyN += 1;
            pairedPress.topOnlyNatWon += nat.feOutcome.defWon ? 1 : 0;
            pairedPress.topOnlyForcedWon += prs.feOutcome.defWon ? 1 : 0;
          }
        }
      }
    }
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const totalTouch = zoneCounts.top + zoneCounts.side + zoneCounts.body;

console.log(`\n== retract 價值探針 ==  ${matches} 局（七隊 × ${PER_OPPONENT}，seedBase=${SEED_BASE}）`
  + `　共 ${totalTicks} tick　耗時 ${elapsed}s\n`);

console.log('--- 量 1：BLOCK_TOUCH zone 分佈與觸後結局（正常 AI 對打，blockHand 全程 vertical）---');
console.log(`  總 BLOCK_TOUCH 事件數：${totalTouch}`);
for (const z of ['top', 'side', 'body']) {
  const c = zoneCounts[z];
  const pct = totalTouch ? ((c / totalTouch) * 100).toFixed(1) : '0.0';
  const oc = outcomeCounts[z];
  const win = oc.block_win_direct ?? 0;
  const loss = oc.block_loss_direct ?? 0;
  const cont = oc.continued ?? 0;
  const resolved = win + loss + cont;
  console.log(`  ${z.padEnd(4)}  n=${String(c).padStart(4)} (${pct}%)　`
    + `直接得分=${win} 直接失分=${loss}（出界=${oc.loss_out ?? 0} 落地未接=${oc.loss_ballin ?? 0}）`
    + ` 續打後才分勝負=${cont}　(已結算樣本=${resolved})`);
  if (resolved > 0) {
    console.log(`        直接失分率＝${seStr(proportion(loss, resolved), resolved)}`);
  }
}
console.log('\n  ★ 擦側（zone=side）之後，攔網方直接失分的比率 ★');
{
  const oc = outcomeCounts.side;
  const win = oc.block_win_direct ?? 0;
  const loss = oc.block_loss_direct ?? 0;
  const cont = oc.continued ?? 0;
  const lossOut = oc.loss_out ?? 0;
  const lossBallin = oc.loss_ballin ?? 0;
  const resolved = win + loss + cont;
  console.log(`  side 觸網樣本 n=${zoneCounts.side}，已結算 n=${resolved}`);
  console.log(`  直接失分（出界＋落地未接兩者合計）＝${seStr(proportion(loss, resolved), resolved)}`);
  console.log(`    其中純出界（OUT，對照 game.js:1296 的「~6%」）＝${seStr(proportion(lossOut, resolved), resolved)}`);
  console.log(`    其中落地未接（BALL_IN，球留在界內但沒人碰到）＝${seStr(proportion(lossBallin, resolved), resolved)}`);
  console.log(`  （對照：續打後才分勝負＝${seStr(proportion(cont, resolved), resolved)}，`
    + `攔網方反而直接得分＝${seStr(proportion(win, resolved), resolved)}）`);
}

console.log('\n--- 量 2：retract 的機會成本（同一顆球，vertical 有牆 vs 全隊強制 retract 無牆）---');
{
  const { n, verified, natDefWon, forcedDefWon } = pairedRetract;
  console.log(`  可配對樣本 n=${n}，通過逐值球況驗證 n=${verified}`
    + `（未通過＝發現分岔早於預期，代表該筆不可信，已排除於下列比率外）`);
  const pNat = proportion(natDefWon, verified);
  const pForced = proportion(forcedDefWon, verified);
  console.log(`  有牆（natural/vertical）防守方得分率：${seStr(pNat, verified)}`);
  console.log(`  無牆（forced retract）防守方得分率：${seStr(pForced, verified)}`);
  if (pNat !== null && pForced !== null) {
    const diff = (pNat - pForced) * 100;
    const seNat = Math.sqrt((pNat * (1 - pNat)) / verified);
    const seForced = Math.sqrt((pForced * (1 - pForced)) / verified);
    const seDiff = Math.sqrt(seNat ** 2 + seForced ** 2) * 100;
    console.log(`  差＝${diff.toFixed(1)}pp（合併標準誤 ±${(1.96 * seDiff).toFixed(1)}pp）`
      + (Math.abs(diff) < 1.96 * seDiff ? '　→ 落在雜訊內，分不出來' : '　→ 顯著'));
  }
}

console.log('\n--- 量 3：press 的增益（同一顆球，vertical 擦頂 vs 全隊強制 press）---');
{
  const {
    n, verified, natDefWon, forcedDefWon, topOnlyN, topOnlyNatWon, topOnlyForcedWon,
  } = pairedPress;
  console.log(`  可配對樣本 n=${n}，通過逐值球況驗證 n=${verified}`);
  const pNat = proportion(natDefWon, verified);
  const pForced = proportion(forcedDefWon, verified);
  console.log(`  全樣本（含 press 完全不影響的 side/body 首觸）：`);
  console.log(`    vertical 防守方得分率：${seStr(pNat, verified)}`);
  console.log(`    press    防守方得分率：${seStr(pForced, verified)}`);
  console.log(`  只看首次判定就是「擦頂」(zone=top) 的子樣本（press 真正生效的情境）：`);
  const pNatTop = proportion(topOnlyNatWon, topOnlyN);
  const pForcedTop = proportion(topOnlyForcedWon, topOnlyN);
  console.log(`    vertical 防守方得分率：${seStr(pNatTop, topOnlyN)}`);
  console.log(`    press    防守方得分率：${seStr(pForcedTop, topOnlyN)}`);
  if (pNatTop !== null && pForcedTop !== null && topOnlyN > 0) {
    const diff = (pForcedTop - pNatTop) * 100;
    const seNat = Math.sqrt((pNatTop * (1 - pNatTop)) / topOnlyN);
    const seForced = Math.sqrt((pForcedTop * (1 - pForcedTop)) / topOnlyN);
    const seDiff = Math.sqrt(seNat ** 2 + seForced ** 2) * 100;
    console.log(`    差＝${diff.toFixed(1)}pp（合併標準誤 ±${(1.96 * seDiff).toFixed(1)}pp）`
      + (Math.abs(diff) < 1.96 * seDiff ? '　→ 落在雜訊內，分不出來' : '　→ 顯著'));
  } else {
    console.log('    top-only 子樣本量不足，分不出來');
  }
}

console.log('\n（探針結束——本檔案為留檔，不 git commit）\n');
